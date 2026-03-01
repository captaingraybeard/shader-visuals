// Three.js scene manager — replaces renderer-points.ts
// Point cloud rendering with custom ShaderMaterial and crossfade

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';

/* ── Vertex Shader (GLSL 300 es, used with THREE.GLSL3) ── */
const VERT = /* glsl */ `
precision highp float;

// Three.js provides: projectionMatrix, modelViewMatrix, position (vec3)
// But we use raw u_projection / u_view for camera-auto.ts compatibility.

// Attributes (Three.js auto-binds 'position' but we use custom names via ShaderMaterial)
in vec3 a_position;
in vec3 a_color;
in float a_segment;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_band0;
uniform float u_band1;
uniform float u_band2;
uniform float u_band3;
uniform float u_band4;
uniform float u_band5;
uniform float u_band6;
uniform float u_band7;
uniform float u_coherence;
uniform float u_pointScale;
uniform float u_transition;
uniform float u_form;
uniform float u_highlightCat;
uniform float u_projMode;

out vec3 v_color;
out float v_alpha;
out float v_coherence;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);
  vec3 pos = a_position;

  float depthFactor;
  if (u_projMode > 0.5) {
    float radius = length(a_position);
    depthFactor = clamp((radius - 6.0) / 4.0, 0.0, 1.0);
  } else {
    depthFactor = 1.0 - clamp((-a_position.z - 3.0) / 6.0, 0.0, 1.0);
  }

  float h1 = hash(idx);
  float h2 = hash(idx + 1000.0);
  float h3 = hash(idx + 2000.0);

  int cat = int(a_segment * 5.0 + 0.5);

  float baseMass = 1.0;
  if (cat == 0) baseMass = 5.0;
  else if (cat == 1) baseMass = 1.5;
  else if (cat == 2) baseMass = 0.3;
  else if (cat == 3) baseMass = 8.0;
  else if (cat == 4) baseMass = 4.0;
  else baseMass = 0.5;

  float mass = baseMass * (0.6 + depthFactor * 0.8);
  float invMass = 1.0 / mass;

  float energy = 0.0;
  vec3 displacement = vec3(0.0);
  vec3 colorTint = vec3(0.0);
  float sizeBoost = 0.0;

  vec3 dir;
  if (u_projMode > 0.5) {
    dir = normalize(a_position);
  } else {
    dir = vec3(0.0, 0.0, 1.0);
  }
  float t = u_time;

  if (cat == 0) {
    energy = u_band0 * 0.6 + u_band1 * 0.4;
    float breath = sin(t * 1.5) * 0.5 + 0.5;
    displacement = dir * energy * breath * 0.3;
    colorTint = vec3(0.15, 0.05, 0.0) * energy;
    sizeBoost = energy * 2.0;
  } else if (cat == 1) {
    energy = u_band2 * 0.3 + u_band3 * 0.5 + u_band4 * 0.2;
    float swayX = sin(pos.y * 1.5 + pos.x * 0.3 + t * 2.0) * energy * 0.3;
    float swayY = cos(pos.x * 1.2 + pos.z * 0.4 + t * 1.6) * energy * 0.15;
    float swayZ = sin(pos.y * 0.8 + t * 2.4) * energy * 0.1;
    displacement = vec3(swayX, swayY, swayZ);
    colorTint = vec3(-0.02, 0.12, 0.02) * energy;
    sizeBoost = energy * 1.5;
  } else if (cat == 2) {
    energy = u_band5 * 0.2 + u_band6 * 0.4 + u_band7 * 0.4;
    float flowX = sin(pos.x * 0.4 + pos.y * 0.3 + t * 1.2) * energy * 0.4;
    float flowY = cos(pos.y * 0.5 + pos.x * 0.2 + t * 0.9) * energy * 0.3;
    float flowZ = sin(pos.x * 0.3 + pos.y * 0.4 + t * 1.5) * energy * 0.2;
    displacement = vec3(flowX, flowY, flowZ);
    float shimmer = sin(pos.x * 3.0 + pos.y * 2.0 + t * 8.0) * 0.5 + 0.5;
    colorTint = vec3(0.08, 0.1, 0.18) * energy * shimmer;
    sizeBoost = energy * 1.0;
  } else if (cat == 3) {
    energy = u_beat * 0.7 + u_band0 * 0.3;
    float rippleDist = length(pos.xz);
    float ripple = sin(rippleDist * 4.0 - t * 6.0) * energy * 0.25;
    displacement = vec3(0.0, ripple, 0.0);
    colorTint = vec3(0.12, 0.08, 0.0) * u_beat;
    sizeBoost = u_beat * 1.5;
  } else if (cat == 4) {
    energy = u_band3 * 0.3 + u_band4 * 0.4 + u_band5 * 0.3;
    float vibX = sin(pos.y * 6.0 + t * 12.0) * energy * 0.06;
    float vibY = sin(pos.x * 5.0 + t * 14.0) * energy * 0.04;
    displacement = vec3(vibX, vibY, 0.0);
    colorTint = vec3(0.05, 0.02, 0.12) * energy;
    sizeBoost = energy * 1.0;
  } else {
    energy = u_band1 * 0.3 + u_band2 * 0.4 + u_band3 * 0.3;
    float driftX = sin(pos.x * 0.3 + t * 0.6) * energy * 0.2;
    float driftY = cos(pos.y * 0.25 + t * 0.5) * energy * 0.15;
    float driftZ = sin(pos.x * 0.2 + pos.y * 0.3 + t * 0.7) * energy * 0.1;
    displacement = vec3(driftX, driftY, driftZ);
    colorTint = vec3(0.03, 0.03, 0.05) * energy;
    sizeBoost = energy * 0.5;
  }

  float displaceScale = mix(1.0, 0.05, u_coherence);

  float chladni = sin(pos.x * 6.0 + t * 0.5) * sin(pos.y * 6.0 + t * 0.3);
  displacement *= mix(1.0, chladni, 0.4);

  pos += displacement * invMass * displaceScale;

  float globalWave1 = sin(pos.x * 2.0 + pos.y * 1.5 + t * 0.8) * u_band2 * 0.05;
  float globalWave2 = sin(pos.y * 3.0 + pos.z * 2.0 + t * 1.2) * u_band4 * 0.04;
  float globalWave3 = sin(pos.z * 1.8 + pos.x * 2.5 + t * 0.6) * u_band6 * 0.03;
  pos += vec3(globalWave1, globalWave2, globalWave3) * invMass * displaceScale;

  float interference = u_band0 * u_band3;
  float intWave = sin(pos.x * 4.0 + pos.y * 3.0 + t * 2.0) * interference;
  pos.y += intWave * 0.06 * invMass * displaceScale;

  float angle = atan(pos.z, pos.x);
  float radius = length(pos.xz);
  float spiral = sin(angle * 3.0 + radius * 2.0 - t * 1.5) * u_mid * 0.06;
  vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x) + 0.001);
  pos += tangent * spiral * invMass * displaceScale;

  float dist = length(pos);
  float pulse = sin(dist * 5.0 - t * 4.0) * u_beat * 0.1;
  pos += normalize(pos + 0.001) * pulse * invMass * displaceScale;

  pos += vec3(
    sin(pos.x * 7.0 + pos.y * 3.0) * u_form * 0.04,
    sin(pos.y * 6.0 + pos.z * 4.0) * u_form * 0.04,
    sin(pos.z * 5.0 + pos.x * 3.5) * u_form * 0.04
  );

  float depthProtection = depthFactor * 0.4;
  float localCoherence = clamp(u_coherence + depthProtection * (1.0 - u_coherence), 0.0, 1.0);
  float localChaos = 1.0 - localCoherence;

  float chaosFreq = 2.0 + energy * 3.0;
  vec3 scatter = vec3(
    sin(pos.x * chaosFreq + pos.y * 1.3 + t * 0.8),
    cos(pos.y * chaosFreq + pos.z * 1.1 + t * 0.6),
    sin(pos.z * chaosFreq + pos.x * 0.9 + t * 1.0)
  ) * localChaos * 1.5 * invMass;
  pos += scatter;

  float zDist = u_projMode > 0.5 ? length(a_position) : -a_position.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.08 * invMass * displaceScale;
  pos += dir * beatWave;

  // Use Three.js built-in matrices (set from camera)
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);

  float baseSize = u_pointScale;
  float coherenceBoost = localCoherence * localCoherence * 6.0;
  float massSize = 1.0 + clamp(baseMass - 1.0, 0.0, 4.0) * 0.15;
  float ptSize = (baseSize + coherenceBoost + sizeBoost * displaceScale * invMass) * massSize;
  ptSize *= (0.4 + depthFactor * 1.2);
  gl_PointSize = max(1.0, ptSize);

  v_color = a_color * 1.4 + vec3(0.08);
  v_color += colorTint;
  v_color += vec3(0.08, 0.04, 0.1) * u_beat;

  if (u_highlightCat > -0.5) {
    float catF = float(cat);
    if (abs(catF - u_highlightCat) > 0.5) {
      v_color *= 0.15;
    } else {
      v_color *= 1.5;
      v_color += vec3(0.1);
    }
  }

  v_alpha = u_transition;
  v_coherence = localCoherence;
}
`;

/* ── Fragment Shader (GLSL 300 es) ── */
const FRAG = /* glsl */ `
precision highp float;

in vec3 v_color;
in float v_alpha;
in float v_coherence;

out vec4 fragColor;

void main() {
  float dist = length(gl_PointCoord - 0.5);

  if (v_coherence < 0.7) {
    float shapeThreshold = mix(0.45, 0.7, v_coherence / 0.7);
    if (dist > shapeThreshold) discard;
    float edgeStart = shapeThreshold - 0.15;
    float edge = 1.0 - smoothstep(edgeStart, shapeThreshold, dist);
    fragColor = vec4(v_color * edge, v_alpha * edge);
  } else {
    fragColor = vec4(v_color, v_alpha);
  }
}
`;

/* ── Render options (same interface as PointCloudRenderer.render) ── */
export interface RenderOpts {
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
  pointScale: number;
  form: number;
  highlightCat: number;
  projMode: number;
}

/* ── Helper: create uniforms object ── */
function makeUniforms(): Record<string, THREE.IUniform> {
  return {
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_beat: { value: 0 },
    u_band0: { value: 0 },
    u_band1: { value: 0 },
    u_band2: { value: 0 },
    u_band3: { value: 0 },
    u_band4: { value: 0 },
    u_band5: { value: 0 },
    u_band6: { value: 0 },
    u_band7: { value: 0 },
    u_coherence: { value: 0 },
    u_pointScale: { value: 1 },
    u_transition: { value: 1 },
    u_form: { value: 0 },
    u_highlightCat: { value: -1 },
    u_projMode: { value: 0 },
  };
}

/* ── Helper: build a Points mesh from PointCloudData ── */
function buildPoints(data: PointCloudData): { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('a_position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('a_color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute('a_segment', new THREE.Float32BufferAttribute(data.segments, 1));

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: makeUniforms(),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material, geometry };
}

/* ── Helper: Float32Array(16) → THREE.Matrix4 ── */
function mat4FromArray(arr: Float32Array): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.fromArray(arr);
  return m;
}

/* ── ThreeScene ──
 * Scene-graph-only: manages point cloud meshes and uniforms.
 * Does NOT render — the EffectComposer's RenderPass handles that.
 * Both current and prev clouds are visible simultaneously during crossfade,
 * blended via u_transition alpha in the shader.
 */
export class ThreeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private current: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry } | null = null;
  private prev: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry } | null = null;
  private crossfading = false;
  private crossfadeStart = 0;
  private readonly crossfadeDuration = 1500;

  onError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
    });
    // Let EffectComposer handle clearing
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    // We set matrices manually from camera-auto.ts
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get hasCloud(): boolean {
    return this.current !== null;
  }

  /** Upload a new point cloud. Crossfades from previous if one exists. */
  setPointCloud(data: PointCloudData): void {
    if (this.current) {
      this.disposePrev();
      this.prev = this.current;
      this.crossfading = true;
      this.crossfadeStart = performance.now();
    }

    this.current = buildPoints(data);
    this.scene.add(this.current.points);
  }

  /**
   * Update scene graph state (uniforms, camera, crossfade).
   * Does NOT call renderer.render — EffectComposer does that.
   */
  update(opts: RenderOpts): void {
    // Apply external camera matrices (from camera-auto.ts Float32Arrays)
    this.camera.projectionMatrix.copy(mat4FromArray(opts.projection));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorldInverse.copy(mat4FromArray(opts.view));
    this.camera.matrixWorld.copy(this.camera.matrixWorldInverse).invert();

    // Crossfade progress
    let crossT = 1.0;
    if (this.crossfading) {
      crossT = Math.min((performance.now() - this.crossfadeStart) / this.crossfadeDuration, 1.0);
    }

    // Both clouds visible simultaneously during crossfade.
    // Shader uses u_transition as alpha — prev fades out, current fades in.
    if (this.prev) {
      this.prev.points.visible = this.crossfading;
      if (this.crossfading) {
        this.updateUniforms(this.prev.material, opts, 1.0 - crossT);
      }
    }

    if (this.current) {
      this.current.points.visible = true;
      this.updateUniforms(this.current.material, opts, this.crossfading ? crossT : 1.0);
    }

    // Crossfade complete — dispose prev
    if (this.crossfading && crossT >= 1.0) {
      this.disposePrev();
      this.crossfading = false;
    }
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
    }
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

  private updateUniforms(mat: THREE.ShaderMaterial, opts: RenderOpts, transition: number): void {
    const u = mat.uniforms;
    u.u_time.value = opts.time;
    u.u_bass.value = opts.bass;
    u.u_mid.value = opts.mid;
    u.u_high.value = opts.high;
    u.u_beat.value = opts.beat;
    u.u_band0.value = opts.band0;
    u.u_band1.value = opts.band1;
    u.u_band2.value = opts.band2;
    u.u_band3.value = opts.band3;
    u.u_band4.value = opts.band4;
    u.u_band5.value = opts.band5;
    u.u_band6.value = opts.band6;
    u.u_band7.value = opts.band7;
    u.u_coherence.value = opts.coherence;
    u.u_pointScale.value = opts.pointScale;
    u.u_transition.value = transition;
    u.u_form.value = opts.form;
    u.u_highlightCat.value = opts.highlightCat;
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
