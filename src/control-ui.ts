// Dynamic control panel UI — auto-generates sliders from ControlRegistry
// Subscribes to registry changes, creates/removes sliders as controls are added/removed

import { controls, type ControlDef } from './control-registry';

const PANEL_ID = 'sv-dynamic-controls';

interface SliderEntry {
  container: HTMLElement;
  slider: HTMLInputElement;
  valueLabel: HTMLElement;
}

export class ControlUI {
  private panel: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private sliders = new Map<string, SliderEntry>();
  private unsubscribe: (() => void) | null = null;
  private updateQueued = false;
  private collapsed = false;
  
  /** Initialize the dynamic control panel. Call after main UI init. */
  init(): void {
    // Create panel container
    this.panel = document.createElement('div');
    this.panel.id = PANEL_ID;
    this.panel.className = 'sv-dynamic-controls';
    
    // Create collapsible header
    this.header = document.createElement('div');
    this.header.className = 'sv-dyn-header';
    this.header.innerHTML = '<span class="sv-dyn-title">Controls</span><span class="sv-dyn-toggle">▼</span>';
    this.header.addEventListener('click', () => this.toggleCollapse());
    this.panel.appendChild(this.header);
    
    // Create content container for sliders
    this.content = document.createElement('div');
    this.content.className = 'sv-dyn-content';
    this.panel.appendChild(this.content);
    
    this.injectStyles();
    document.body.appendChild(this.panel);
    
    // Subscribe to registry changes
    this.unsubscribe = controls.onChange(() => this.queueUpdate());
    
    // Initial render
    this.render();
  }
  
  /** Toggle collapsed state */
  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.panel?.classList.toggle('sv-collapsed', this.collapsed);
    const toggle = this.header?.querySelector('.sv-dyn-toggle');
    if (toggle) toggle.textContent = this.collapsed ? '▶' : '▼';
  }
  
  /** Clean up. */
  dispose(): void {
    this.unsubscribe?.();
    this.panel?.remove();
    this.sliders.clear();
  }
  
  /** Queue a render update (debounced). */
  private queueUpdate(): void {
    if (this.updateQueued) return;
    this.updateQueued = true;
    requestAnimationFrame(() => {
      this.updateQueued = false;
      this.render();
    });
  }
  
  /** Render/update all sliders from registry. */
  private render(): void {
    if (!this.panel) return;
    
    const defs = controls.getDefs();
    const currentNames = new Set(defs.map(d => d.name));
    
    // Remove sliders for controls that no longer exist
    for (const [name, entry] of this.sliders) {
      if (!currentNames.has(name)) {
        entry.container.remove();
        this.sliders.delete(name);
      }
    }
    
    // Add/update sliders
    for (const def of defs) {
      let entry = this.sliders.get(def.name);
      
      if (!entry) {
        // Create new slider
        entry = this.createSlider(def);
        this.sliders.set(def.name, entry);
        this.content!.appendChild(entry.container);
      }
      
      // Update value display
      const pct = ((def.value - def.min) / (def.max - def.min)) * 100;
      entry.slider.value = String(pct);
      entry.valueLabel.textContent = def.value.toFixed(2);
    }
    
    // Show/hide panel based on whether we have controls
    this.panel.classList.toggle('sv-hidden', defs.length === 0);
  }
  
  /** Create a slider element for a control definition. */
  private createSlider(def: ControlDef): SliderEntry {
    const container = document.createElement('div');
    container.className = 'sv-dyn-slider-group';
    container.dataset.control = def.name;
    
    const header = document.createElement('div');
    header.className = 'sv-dyn-slider-header';
    
    const title = document.createElement('span');
    title.className = 'sv-dyn-slider-title';
    title.textContent = def.label || def.name;
    
    const valueLabel = document.createElement('span');
    valueLabel.className = 'sv-dyn-slider-value';
    valueLabel.textContent = def.value.toFixed(2);
    
    header.appendChild(title);
    header.appendChild(valueLabel);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'sv-slider';
    slider.min = '0';
    slider.max = '100';
    slider.step = '0.1';
    
    // Map value to 0-100 range
    const pct = ((def.value - def.min) / (def.max - def.min)) * 100;
    slider.value = String(pct);
    
    slider.addEventListener('input', () => {
      const pctVal = parseFloat(slider.value);
      const actualVal = def.min + (pctVal / 100) * (def.max - def.min);
      // Snap to step
      const snapped = Math.round(actualVal / def.step) * def.step;
      controls.set(def.name, snapped);
      valueLabel.textContent = snapped.toFixed(2);
    });
    
    container.appendChild(header);
    container.appendChild(slider);
    
    return { container, slider, valueLabel };
  }
  
  /** Inject styles for the dynamic control panel. */
  private injectStyles(): void {
    if (document.getElementById('sv-dynamic-controls-style')) return;
    
    const style = document.createElement('style');
    style.id = 'sv-dynamic-controls-style';
    style.textContent = `
      .sv-dynamic-controls {
        position: fixed;
        top: 80px;
        right: 10px;
        z-index: 1002;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-radius: 16px;
        padding: 0;
        min-width: 180px;
        max-width: 240px;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        transition: opacity 0.2s, transform 0.2s;
        overflow: hidden;
      }
      
      .sv-dynamic-controls.sv-hidden {
        opacity: 0;
        pointer-events: none;
        transform: translateX(20px);
      }
      
      .sv-dyn-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        cursor: pointer;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .sv-dyn-header:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      
      .sv-dyn-title {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
      }
      
      .sv-dyn-toggle {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        transition: transform 0.2s;
      }
      
      .sv-dyn-content {
        padding: 12px 16px;
        max-height: 400px;
        overflow-y: auto;
        transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.2s;
      }
      
      .sv-dynamic-controls.sv-collapsed .sv-dyn-content {
        max-height: 0;
        padding: 0 16px;
        opacity: 0;
        overflow: hidden;
      }
      
      .sv-dynamic-controls.sv-collapsed .sv-dyn-header {
        border-bottom: none;
      }
      
      .sv-dyn-slider-group {
        margin-bottom: 12px;
      }
      
      .sv-dyn-slider-group:last-child {
        margin-bottom: 0;
      }
      
      .sv-dyn-slider-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      
      .sv-dyn-slider-title {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        text-transform: capitalize;
      }
      
      .sv-dyn-slider-value {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        font-variant-numeric: tabular-nums;
      }
    `;
    document.head.appendChild(style);
  }
}

// Singleton instance
let instance: ControlUI | null = null;

export function initControlUI(): ControlUI {
  if (!instance) {
    instance = new ControlUI();
    instance.init();
  }
  return instance;
}

export function disposeControlUI(): void {
  instance?.dispose();
  instance = null;
}
