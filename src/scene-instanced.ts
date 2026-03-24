// Scene wrapper for instanced quad renderer — drop-in replacement for ThreeScene
// Provides same API as ThreeScene but uses InstancedRenderer internally
//
// This allows gradual migration: switch between ThreeScene and SceneInstanced
// in app.ts by changing the import.

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';
import type { AudioData } from './audio';
import { InstancedRenderer, type RenderOpts } from './renderer-instanced';
import { buildVertexShader } from './three-scene';

// Re-export RenderOpts with pointScale aliased to splatScale
export type { RenderOpts } from './renderer-instanced';

/** RenderOpts with backward-compatible pointScale (aliased to splatScale) */
export interface LegacyRenderOpts {
  projection: Float32Array;
  view: Float32Array;
  time: number;
  bass: number;
  mid: number;
  high: number;
  beat: number;
  band0: number;
  band1: number;
  band2: number;
  band3: number;
  band4: number;
  band5: number;
  band6: number;
  band7: number;
  coherence: number;
  segCoherence: number[];
  pointScale: number;  // alias for splatScale
  form: number;
  highlightCat: number;
  projMode: number;
  chakra: number[];
  demonsLow: number;
  demonsHigh: number;
}

/**
 * SceneInstanced — drop-in replacement for ThreeScene
 * Uses instanced quads instead of GL_POINTS for better quality.
 */
export class SceneInstanced {
  private instanced: InstancedRenderer;

  // Expose renderer, scene, camera for post-processing compatibility
  get renderer(): THREE.WebGLRenderer {
    return this.instanced.renderer;
  }

  get scene(): THREE.Scene {
    return this.instanced.scene;
  }

  get camera(): THREE.PerspectiveCamera {
    return this.instanced.camera;
  }

  onError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.instanced = new InstancedRenderer(canvas);
    this.instanced.onError = (msg) => this.onError?.(msg);
  }

  get hasCloud(): boolean {
    return this.instanced.hasCloud;
  }

  /** Animation snippet (not implemented for instanced yet — use default) */
  setAnimationSnippet(_snippet: string | null): void {
    // TODO: Implement animation snippet injection for instanced renderer
    // For now, ignore — uses built-in animation
    console.warn('SceneInstanced: setAnimationSnippet not yet implemented');
  }

  getAnimationSnippet(): string | null {
    return null;
  }

  /** Upload point cloud — creates instanced mesh */
  setPointCloud(data: PointCloudData): void {
    this.instanced.setPointCloud(data);
  }

  /** Update scene (uniforms, camera) — EffectComposer handles rendering */
  update(opts: LegacyRenderOpts): void {
    // Convert pointScale to splatScale (different scale factor needed)
    // Points use pixel units, quads use world units — adjust accordingly
    const splatScale = opts.pointScale * 0.01; // Rough conversion, tune as needed
    
    this.instanced.update({
      ...opts,
      splatScale,
    });
  }

  /** Update creature system */
  updateCreatures(dt: number, audioData: AudioData, time: number): void {
    this.instanced.updateCreatures(dt, audioData, time);
  }

  resize(): void {
    this.instanced.resize();
  }

  dispose(): void {
    this.instanced.dispose();
  }
}

// Re-export buildVertexShader for app.ts compatibility
export { buildVertexShader };
