// Simplified shader for mobile/low-end devices
// Reduces: band uniforms (8→3), removes spotlight, removes creature system,
// removes dual-layer, simplifies displacement math

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';

/* ── Simplified Vertex Shader ── */
const VERT_MOBILE = /* glsl */ `
precision mediump float;

// Attributes
in vec3 a_color;
in float a_segment;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;
uniform float u_pointScale;
uniform float u_transition;
uniform float u_projMode;

out vec3 v_color;
out float v_alpha;

void main() {
  vec3 pos = position;

  // Simplified depth factor
  float depthFactor = u_projMode > 0.5
    ? clamp((length(position) - 6.0) / 4.0, 0.0, 1.0)
    : 1.0 - clamp((-position.z - 3.0) / 6.0, 0.0, 1.0);

  int cat = int(a_segment * 5.0 + 0.5);
  
  // Simplified mass — just 3 tiers
  float mass = cat == 0 || cat == 3 ? 5.0 : (cat == 2 ? 0.5 : 1.5);
  float invMass = 1.0 / mass;

  float energy = 0.0;
  vec3 displacement = vec3(0.0);
  vec3 colorTint = vec3(0.0);
  float t = u_time;

  vec3 dir = u_projMode > 0.5 ? normalize(position) : vec3(0.0, 0.0, 1.0);

  // Simplified per-segment displacement (merged categories)
  if (cat == 0 || cat == 3) {
    // Bass/beat responsive (subjects + ground)
    energy = u_bass * 0.7 + u_beat * 0.3;
    float breath = sin(t * 1.5) * 0.5 + 0.5;
    displacement = dir * energy * breath * 0.6;
    colorTint = vec3(0.06, 0.03, 0.0) * energy;
  } else if (cat == 1) {
    // Mid responsive (organic)
    energy = u_mid;
    float swayX = sin(pos.y * 1.5 + t * 2.0) * energy * 0.5;
    float swayY = cos(pos.x * 1.2 + t * 1.6) * energy * 0.3;
    displacement = vec3(swayX, swayY, 0.0);
    colorTint = vec3(-0.01, 0.05, 0.01) * energy;
  } else {
    // High responsive (sky + structure)
    energy = u_high;
    float flowX = sin(pos.x * 0.4 + t * 1.2) * energy * 0.6;
    float flowY = cos(pos.y * 0.5 + t * 0.9) * energy * 0.5;
    displacement = vec3(flowX, flowY, 0.0);
    colorTint = vec3(0.03, 0.04, 0.07) * energy;
  }

  // Apply coherence scaling
  float displaceScale = 1.0 - u_coherence;
  pos += displacement * invMass * displaceScale;

  // Simple chaos scatter (reduced)
  float localChaos = (1.0 - u_coherence) * 0.5;
  vec3 scatter = vec3(
    sin(pos.x * 2.0 + t * 0.8),
    cos(pos.y * 2.0 + t * 0.6),
    sin(pos.z * 2.0 + t * 1.0)
  ) * localChaos * invMass;
  pos += scatter;

  // Beat wave (simplified)
  float zDist = u_projMode > 0.5 ? length(position) : -position.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.2 * invMass * displaceScale;
  pos += dir * beatWave;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);

  // Point size (simplified)
  float ptSize = u_pointScale * (0.6 + energy * 0.4) * (0.5 + depthFactor);
  gl_PointSize = max(1.0, ptSize);

  v_color = a_color + colorTint * displaceScale;
  v_color += vec3(0.03, 0.015, 0.04) * u_beat * displaceScale;
  v_alpha = u_transition;
}
`;

/* ── Simplified Fragment Shader ── */
const FRAG_MOBILE = /* glsl */ `
precision mediump float;

in vec3 v_color;
in float v_alpha;

out vec4 fragColor;

void main() {
  // Simple circular point — no coherence-based shape morphing
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  
  float edge = 1.0 - smoothstep(0.35, 0.5, dist);
  fragColor = vec4(v_color * edge, v_alpha * edge);
}
`;

/* ── Mobile render options (simplified) ── */
export interface MobileRenderOpts {
  projection: Float32Array;
  view: Float32Array;
  time: number;
  bass: number;
  mid: number;
  high: number;
  beat: number;
  coherence: number;
  pointScale: number;
  projMode: number;
}

/* ── Helper: create mobile uniforms ── */
function makeMobileUniforms(): Record<string, THREE.IUniform> {
  return {
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_beat: { value: 0 },
    u_coherence: { value: 0 },
    u_pointScale: { value: 1 },
    u_transition: { value: 1 },
    u_projMode: { value: 0 },
  };
}

/* ── Build mobile-optimized Points mesh ── */
function buildMobilePoints(data: PointCloudData): {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  geometry: THREE.BufferGeometry;
} {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('a_color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute('a_segment', new THREE.Float32BufferAttribute(data.segments, 1));
  // Note: a_objectId omitted — not used in mobile shader

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT_MOBILE,
    fragmentShader: FRAG_MOBILE,
    uniforms: makeMobileUniforms(),
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return { points, material, geometry };
}

/* ── Reusable Matrix4 instances ── */
const _tmpProjection = new THREE.Matrix4();
const _tmpView = new THREE.Matrix4();

/**
 * Mobile-optimized Three.js scene.
 * Single layer, simplified shader, no creature system.
 */
export class ThreeSceneMobile {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private current: {
    points: THREE.Points;
    material: THREE.ShaderMaterial;
    geometry: THREE.BufferGeometry;
  } | null = null;

  private prev: {
    points: THREE.Points;
    material: THREE.ShaderMaterial;
    geometry: THREE.BufferGeometry;
  } | null = null;

  private crossfading = false;
  private crossfadeStart = 0;
  private readonly crossfadeDuration = 1000; // Shorter crossfade on mobile

  onError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, renderScale = 0.5) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false, // Disable AA on mobile
      powerPreference: 'low-power', // Prefer battery life
    });
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100,
    );
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    this.resize(renderScale);
  }

  get hasCloud(): boolean {
    return this.current !== null;
  }

  setPointCloud(data: PointCloudData): void {
    if (this.current) {
      this.disposePrev();
      this.prev = this.current;
      this.crossfading = true;
      this.crossfadeStart = performance.now();
    }

    this.current = buildMobilePoints(data);
    this.scene.add(this.current.points);
  }

  update(opts: MobileRenderOpts): void {
    // Apply camera matrices
    _tmpProjection.fromArray(opts.projection);
    _tmpView.fromArray(opts.view);
    this.camera.projectionMatrix.copy(_tmpProjection);
    this.camera.projectionMatrixInverse.copy(_tmpProjection).invert();
    this.camera.matrixWorldInverse.copy(_tmpView);
    this.camera.matrixWorld.copy(_tmpView).invert();

    // Crossfade progress
    let crossT = 1.0;
    if (this.crossfading) {
      crossT = Math.min((performance.now() - this.crossfadeStart) / this.crossfadeDuration, 1.0);
    }

    // Update prev (fading out)
    if (this.prev) {
      this.prev.points.visible = this.crossfading;
      if (this.crossfading) {
        this.updateUniforms(this.prev.material, opts, 1.0 - crossT);
      }
    }

    // Update current
    if (this.current) {
      this.current.points.visible = true;
      this.updateUniforms(this.current.material, opts, this.crossfading ? crossT : 1.0);
    }

    // Crossfade complete
    if (this.crossfading && crossT >= 1.0) {
      this.disposePrev();
      this.crossfading = false;
    }
  }

  resize(renderScale = 0.5): void {
    const canvas = this.renderer.domElement;
    const dpr = window.devicePixelRatio || 1;
    const effectiveDpr = dpr * renderScale;
    const width = Math.floor(canvas.clientWidth * effectiveDpr);
    const height = Math.floor(canvas.clientHeight * effectiveDpr);
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposePrev();
    if (this.current) {
      this.scene.remove(this.current.points);
      this.current.geometry.dispose();
      this.current.material.dispose();
      this.current = null;
    }
    this.renderer.dispose();
  }

  private updateUniforms(mat: THREE.ShaderMaterial, opts: MobileRenderOpts, transition: number): void {
    const u = mat.uniforms;
    u.u_time.value = opts.time;
    u.u_bass.value = opts.bass;
    u.u_mid.value = opts.mid;
    u.u_high.value = opts.high;
    u.u_beat.value = opts.beat;
    u.u_coherence.value = opts.coherence;
    u.u_pointScale.value = opts.pointScale;
    u.u_transition.value = transition;
    u.u_projMode.value = opts.projMode;
  }

  private disposePrev(): void {
    if (this.prev) {
      this.scene.remove(this.prev.points);
      this.prev.geometry.dispose();
      this.prev.material.dispose();
      this.prev = null;
    }
  }
}
