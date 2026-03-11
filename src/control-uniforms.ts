// Control Uniforms Bridge — injects ControlRegistry values into shader uniforms
// Dynamically adds uniform declarations to shaders and updates values per-frame

import * as THREE from 'three';
import { controls } from './control-registry';

/**
 * Generate GLSL uniform declarations for all registered controls.
 * Call this when building/rebuilding shaders.
 */
export function getControlUniformDeclarations(): string {
  const defs = controls.getDefs();
  if (defs.length === 0) return '';
  
  const lines = ['// Dynamic controls (from ControlRegistry)'];
  for (const def of defs) {
    // Sanitize name for GLSL (alphanumeric + underscore only)
    const glslName = `u_ctrl_${sanitizeName(def.name)}`;
    lines.push(`uniform float ${glslName};`);
  }
  return lines.join('\n');
}

/**
 * Create THREE.js uniform entries for all registered controls.
 * Merge this into your material's uniforms object.
 */
export function createControlUniforms(): Record<string, THREE.IUniform<number>> {
  const uniforms: Record<string, THREE.IUniform<number>> = {};
  const defs = controls.getDefs();
  
  for (const def of defs) {
    const glslName = `u_ctrl_${sanitizeName(def.name)}`;
    uniforms[glslName] = { value: def.value };
  }
  
  return uniforms;
}

/**
 * Update existing uniform values from the registry.
 * Call this every frame.
 */
export function updateControlUniforms(uniforms: Record<string, THREE.IUniform>): void {
  const values = controls.getAll();
  
  for (const [name, value] of Object.entries(values)) {
    const glslName = `u_ctrl_${sanitizeName(name)}`;
    if (uniforms[glslName]) {
      uniforms[glslName].value = value;
    }
  }
}

/**
 * Inject control uniform declarations into a shader source.
 * Inserts after the last `uniform` declaration, or at the top after precision.
 */
export function injectControlUniforms(shaderSource: string): string {
  const declarations = getControlUniformDeclarations();
  if (!declarations) return shaderSource;
  
  // Find the last uniform declaration
  const uniformRegex = /^uniform\s+\w+\s+\w+(\[\d+\])?;/gm;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  
  while ((match = uniformRegex.exec(shaderSource)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    // Insert after the last uniform
    const insertPos = lastMatch.index + lastMatch[0].length;
    return (
      shaderSource.slice(0, insertPos) +
      '\n\n' + declarations + '\n' +
      shaderSource.slice(insertPos)
    );
  }
  
  // No uniforms found — insert after precision declaration
  const precisionRegex = /^precision\s+\w+\s+float;/m;
  const precisionMatch = precisionRegex.exec(shaderSource);
  
  if (precisionMatch) {
    const insertPos = precisionMatch.index + precisionMatch[0].length;
    return (
      shaderSource.slice(0, insertPos) +
      '\n\n' + declarations + '\n' +
      shaderSource.slice(insertPos)
    );
  }
  
  // Fallback — insert at top
  return declarations + '\n\n' + shaderSource;
}

/**
 * Sanitize a control name for GLSL variable naming.
 * Replaces invalid characters with underscores.
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * Generate a helper snippet that LLM-generated GLSL can use.
 * This creates getter macros for each control.
 */
export function getControlAccessorMacros(): string {
  const defs = controls.getDefs();
  if (defs.length === 0) return '';
  
  const lines = ['// Control accessor macros'];
  for (const def of defs) {
    const safeName = sanitizeName(def.name);
    const glslName = `u_ctrl_${safeName}`;
    // Create a simple macro: CTRL_explosionRadius → u_ctrl_explosionRadius
    lines.push(`#define CTRL_${safeName} ${glslName}`);
  }
  return lines.join('\n');
}
