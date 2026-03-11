// Control Registry — runtime parameter system for LLM-generated animation code
// Zero-alloc per-frame, auto-generates UI sliders, passes values to GPU as uniforms

export interface ControlDef {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  label?: string;
  group?: string;
}

export interface ControlRegistry {
  /** Add or update a control. Idempotent — safe to call every frame. */
  addControl(name: string, defaultValue: number, min?: number, max?: number, step?: number, label?: string, group?: string): void;
  
  /** Get current value. Returns defaultValue if not found. */
  get(name: string, defaultValue?: number): number;
  
  /** Set value programmatically (e.g., from LLM code or beat triggers). */
  set(name: string, value: number): void;
  
  /** Get all control values as a flat object for uniform upload. */
  getAll(): Record<string, number>;
  
  /** Get control definitions for UI generation. */
  getDefs(): ControlDef[];
  
  /** Remove a control. */
  remove(name: string): void;
  
  /** Clear all controls. */
  clear(): void;
  
  /** Subscribe to changes. Returns unsubscribe function. */
  onChange(callback: (name: string, value: number) => void): () => void;
}

class ControlRegistryImpl implements ControlRegistry {
  private controls = new Map<string, ControlDef>();
  private listeners = new Set<(name: string, value: number) => void>();
  
  // Cached values object — reused to avoid allocs
  private cachedValues: Record<string, number> = {};
  private cacheValid = false;
  
  addControl(
    name: string,
    defaultValue: number,
    min = 0,
    max = 1,
    step = 0.01,
    label?: string,
    group?: string,
  ): void {
    const existing = this.controls.get(name);
    if (existing) {
      // Update bounds if changed, keep current value
      if (existing.min !== min || existing.max !== max || existing.step !== step) {
        existing.min = min;
        existing.max = max;
        existing.step = step;
        existing.label = label ?? existing.label;
        existing.group = group ?? existing.group;
        // Clamp existing value to new bounds
        existing.value = Math.max(min, Math.min(max, existing.value));
        this.cacheValid = false;
      }
      return;
    }
    
    this.controls.set(name, {
      name,
      value: defaultValue,
      min,
      max,
      step,
      label,
      group,
    });
    this.cacheValid = false;
  }
  
  get(name: string, defaultValue = 0): number {
    return this.controls.get(name)?.value ?? defaultValue;
  }
  
  set(name: string, value: number): void {
    const ctrl = this.controls.get(name);
    if (!ctrl) return;
    
    const clamped = Math.max(ctrl.min, Math.min(ctrl.max, value));
    if (ctrl.value !== clamped) {
      ctrl.value = clamped;
      this.cacheValid = false;
      this.notify(name, clamped);
    }
  }
  
  getAll(): Record<string, number> {
    if (this.cacheValid) return this.cachedValues;
    
    // Rebuild cache
    this.cachedValues = {};
    for (const [name, def] of this.controls) {
      this.cachedValues[name] = def.value;
    }
    this.cacheValid = true;
    return this.cachedValues;
  }
  
  getDefs(): ControlDef[] {
    return Array.from(this.controls.values());
  }
  
  remove(name: string): void {
    if (this.controls.delete(name)) {
      this.cacheValid = false;
    }
  }
  
  clear(): void {
    this.controls.clear();
    this.cachedValues = {};
    this.cacheValid = true;
  }
  
  onChange(callback: (name: string, value: number) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  private notify(name: string, value: number): void {
    for (const listener of this.listeners) {
      listener(name, value);
    }
  }
}

// Singleton instance
export const controls: ControlRegistry = new ControlRegistryImpl();

// Convenience function for LLM-generated code
export function addControl(
  name: string,
  defaultValue: number,
  min?: number,
  max?: number,
  step?: number,
  label?: string,
  group?: string,
): void {
  controls.addControl(name, defaultValue, min, max, step, label, group);
}

// Convenience getter
export function ctrl(name: string, defaultValue = 0): number {
  return controls.get(name, defaultValue);
}
