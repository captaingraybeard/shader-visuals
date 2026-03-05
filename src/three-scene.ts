// Three.js scene manager — replaces renderer-points.ts
// Point cloud rendering with custom ShaderMaterial and crossfade

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';
import type { AudioData } from './audio';
import { CreatureSystem } from './creature-system';

/* ── Vertex Shader (GLSL 300 es, used with THREE.GLSL3) ── */
const VERT = /* glsl */ `
precision highp float;

// Attributes
in vec3 a_color;
in float a_segment;
in float a_objectId;

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
uniform float u_segCoherence[6];
uniform float u_pointScale;
uniform float u_transition;
uniform float u_form;
uniform float u_highlightCat;
uniform float u_projMode;
uniform float u_spotPhase;
uniform float u_numObjects;
uniform float u_layerAtten;

// Chakra/demon uniforms (kept for compatibility, lightweight usage)
uniform float u_chakra[7];
uniform float u_demonsLow;
uniform float u_demonsHigh;

// Creature system
uniform sampler2D u_positionTex;
uniform vec2 u_texSize;
uniform float u_creaturesActive;

out vec3 v_color;
out float v_alpha;
out float v_coherence;

void main() {
  vec3 pos;
  float recruitment = 0.0;
  if (u_creaturesActive > 0.5) {
    int texIdx = gl_VertexID;
    int texX = texIdx % int(u_texSize.x);
    int texY = texIdx / int(u_texSize.x);
    vec2 texUV = (vec2(float(texX), float(texY)) + 0.5) / u_texSize;
    vec4 posData = texture(u_positionTex, texUV);
    pos = posData.xyz;
    recruitment = posData.w;
  } else {
    pos = position;
  }

  // Depth factor
  float depthFactor;
  if (u_projMode > 0.5) {
    depthFactor = clamp((length(position) - 6.0) / 4.0, 0.0, 1.0);
  } else {
    depthFactor = 1.0 - clamp((-position.z - 3.0) / 6.0, 0.0, 1.0);
  }

  int cat = int(a_segment * 5.0 + 0.5);

  // Mass per category
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
  float t = u_time;

  vec3 dir = u_projMode > 0.5 ? normalize(position) : vec3(0.0, 0.0, 1.0);

  // ── Per-segment displacement (core audio reactivity) ──
  if (cat == 0) {
    energy = u_band0 * 0.6 + u_band1 * 0.4;
    float breath = sin(t * 1.5) * 0.5 + 0.5;
    displacement = dir * energy * breath * 0.8;
    colorTint = vec3(0.075, 0.025, 0.0) * energy;
    sizeBoost = energy * 3.0;
  } else if (cat == 1) {
    energy = u_band2 * 0.3 + u_band3 * 0.5 + u_band4 * 0.2;
    float swayX = sin(pos.y * 1.5 + pos.x * 0.3 + t * 2.0) * energy * 0.7;
    float swayY = cos(pos.x * 1.2 + pos.z * 0.4 + t * 1.6) * energy * 0.4;
    displacement = vec3(swayX, swayY, 0.0);
    colorTint = vec3(-0.01, 0.06, 0.01) * energy;
    sizeBoost = energy * 1.5;
  } else if (cat == 2) {
    energy = u_band5 * 0.2 + u_band6 * 0.4 + u_band7 * 0.4;
    float flowX = sin(pos.x * 0.4 + pos.y * 0.3 + t * 1.2) * energy * 0.9;
    float flowY = cos(pos.y * 0.5 + pos.x * 0.2 + t * 0.9) * energy * 0.7;
    displacement = vec3(flowX, flowY, 0.0);
    colorTint = vec3(0.04, 0.05, 0.09) * energy;
    sizeBoost = energy * 1.0;
  } else if (cat == 3) {
    energy = u_beat * 0.7 + u_band0 * 0.3;
    float ripple = sin(length(pos.xz) * 4.0 - t * 6.0) * energy * 0.6;
    displacement = vec3(0.0, ripple, 0.0);
    colorTint = vec3(0.06, 0.04, 0.0) * u_beat;
    sizeBoost = u_beat * 1.5;
  } else if (cat == 4) {
    energy = u_band3 * 0.3 + u_band4 * 0.4 + u_band5 * 0.3;
    float vibX = sin(pos.y * 6.0 + t * 12.0) * energy * 0.2;
    float vibY = sin(pos.x * 5.0 + t * 14.0) * energy * 0.15;
    displacement = vec3(vibX, vibY, 0.0);
    colorTint = vec3(0.025, 0.01, 0.06) * energy;
    sizeBoost = energy * 1.0;
  } else {
    energy = u_band1 * 0.3 + u_band2 * 0.4 + u_band3 * 0.3;
    float driftX = sin(pos.x * 0.3 + t * 0.6) * energy * 0.5;
    float driftY = cos(pos.y * 0.25 + t * 0.5) * energy * 0.4;
    displacement = vec3(driftX, driftY, 0.0);
    colorTint = vec3(0.015, 0.015, 0.025) * energy;
    sizeBoost = energy * 0.5;
  }

  // ── Per-segment coherence ──
  float segCoh = clamp(u_segCoherence[cat], 0.0, 1.0);
  float displaceScale = 1.0 - segCoh;

  // Apply displacement
  pos += displacement * invMass * displaceScale;

  // Form scatter
  pos += vec3(
    sin(pos.x * 7.0 + pos.y * 3.0) * u_form * 0.04,
    sin(pos.y * 6.0 + pos.z * 4.0) * u_form * 0.04,
    sin(pos.z * 5.0 + pos.x * 3.5) * u_form * 0.04
  ) * displaceScale;

  // Depth-weighted coherence for scatter
  float depthProtection = depthFactor * 0.4;
  float localCoherence = clamp(segCoh + depthProtection * (1.0 - segCoh), 0.0, 1.0);
  float localChaos = 1.0 - localCoherence;

  // Chaos scatter
  float chaosFreq = 2.0 + energy * 3.0;
  vec3 scatter = vec3(
    sin(pos.x * chaosFreq + pos.y * 1.3 + t * 0.8),
    cos(pos.y * chaosFreq + pos.z * 1.1 + t * 0.6),
    sin(pos.z * chaosFreq + pos.x * 0.9 + t * 1.0)
  ) * localChaos * 2.5 * invMass;
  pos += scatter * displaceScale;

  // Beat wave
  float zDist = u_projMode > 0.5 ? length(position) : -position.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.3 * invMass * displaceScale;
  pos += dir * beatWave;

  // ── Spotlight system: 3 effects on segmented objects ──
  // Use real object IDs when available, spatial hash fallback when not
  float objId = a_objectId;
  float hasRealObjects = step(0.001, u_numObjects);
  // Spatial grid hash for fallback (when server hasn't sent object IDs yet)
  vec3 gridCell = floor(position * 1.2);
  float spatialId = fract(dot(gridCell, vec3(127.1, 311.7, 74.7)) * 0.00123);
  // Use real objectId if available, otherwise spatial hash
  float effectiveId = mix(spatialId, objId, hasRealObjects);
  float isObject = mix(1.0, step(0.001, objId), hasRealObjects); // spatial: all active, real: skip bg
  float spotCycle = u_spotPhase * 0.1;

  // Cheap hashes per object
  float oh1 = fract(effectiveId * 127.1 + 0.7);
  float oh2 = fract(effectiveId * 269.3 + 0.3);
  float oh3 = fract(effectiveId * 419.7 + 0.1);

  // Effect 1: SCALE/GROW
  float scaleDist = abs(fract(oh1 + spotCycle) - 0.5) * 2.0;
  float scaleActive = smoothstep(0.25, 0.0, scaleDist) * isObject; // wider selection (~25%)
  float growFactor = 1.0 + scaleActive * energy * 6.0 * displaceScale; // stronger grow
  pos = position + (pos - position) * growFactor;

  // Effect 2: DETACH/FLOAT
  float floatDist = abs(fract(oh2 + spotCycle * 0.8 + 0.33) - 0.5) * 2.0;
  float floatActive = smoothstep(0.22, 0.0, floatDist) * isObject;
  float liftHeight = floatActive * energy * 2.5 * displaceScale; // stronger lift
  pos.y += liftHeight * (0.5 + sin(t * 2.0 + effectiveId * 50.0) * 0.5);
  pos.x += sin(t * 1.2 + oh2 * 6.28) * floatActive * 0.7 * displaceScale;
  pos.z += cos(t * 0.9 + oh2 * 3.14) * floatActive * 0.5 * displaceScale;

  // Effect 3: SHATTER/ECHO
  float shatterDist = abs(fract(oh3 + spotCycle * 1.2 + 0.66) - 0.5) * 2.0;
  float shatterActive = smoothstep(0.2, 0.0, shatterDist) * isObject;
  float vertHash = fract(dot(position.xy, vec2(12.9898, 78.233)));
  float echoGroup = floor(vertHash * 3.0);
  vec3 echoDir = echoGroup < 1.0 ? vec3(0.8, 0.5, -0.3) :
                 echoGroup < 2.0 ? vec3(-0.6, -0.3, 0.6) :
                                   vec3(0.2, -0.7, -0.5);
  pos += echoDir * shatterActive * energy * displaceScale * (1.0 + sin(t * 2.5) * 0.3);

  float spotlight = max(scaleActive, max(floatActive, shatterActive));

  // ── Output ──
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);

  float baseSize = u_pointScale;
  float coherenceBoost = localCoherence * localCoherence;
  float massSize = 1.0 + clamp(baseMass - 1.0, 0.0, 4.0) * 0.15;
  float ptSize = (baseSize + coherenceBoost + sizeBoost * displaceScale * invMass) * massSize;
  ptSize *= (1.0 + scaleActive * energy * 2.0 * displaceScale);
  ptSize *= (0.4 + depthFactor * 1.2);
  gl_PointSize = max(1.0, ptSize);

  v_color = a_color;
  v_color += colorTint * displaceScale;
  v_color += vec3(0.04, 0.02, 0.05) * u_beat * displaceScale;
  v_color += vec3(0.25, 0.1, 0.03) * scaleActive * energy * displaceScale;
  v_color += vec3(0.08, 0.15, 0.3) * floatActive * energy * displaceScale;
  v_color += vec3(0.2, 0.04, 0.25) * shatterActive * energy * displaceScale;

  if (u_highlightCat > -0.5) {
    float catF = float(cat);
    if (abs(catF - u_highlightCat) > 0.5) {
      v_color *= 0.15;
    } else {
      v_color *= 1.5;
      v_color += vec3(0.1);
    }
  }

  if (recruitment > 0.1) {
    v_color += vec3(0.2, 0.1, 0.4) * recruitment;
    gl_PointSize += recruitment * 3.0;
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
  segCoherence: number[];
  pointScale: number;
  form: number;
  highlightCat: number;
  projMode: number;
  chakra: number[];
  demonsLow: number;
  demonsHigh: number;
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
    u_segCoherence: { value: [0, 0, 0, 0, 0, 0] },
    u_pointScale: { value: 1 },
    u_transition: { value: 1 },
    u_form: { value: 0 },
    u_highlightCat: { value: -1 },
    u_projMode: { value: 0 },
    u_spotPhase: { value: 0 },
    u_numObjects: { value: 0 },
    u_layerAtten: { value: 1.0 },
    u_chakra: { value: [0, 0, 0, 0, 0, 0, 0] },
    u_demonsLow: { value: 0 },
    u_demonsHigh: { value: 0 },
    u_positionTex: { value: _dummyTexture },
    u_texSize: { value: new THREE.Vector2(1, 1) },
    u_creaturesActive: { value: 0 },
  };
}

/* ── Helper: build a Points mesh from PointCloudData ── */
function buildPoints(data: PointCloudData): { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry; backLayer: THREE.Points; backMaterial: THREE.ShaderMaterial } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('a_color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute('a_segment', new THREE.Float32BufferAttribute(data.segments, 1));
  geometry.setAttribute('a_objectId', new THREE.Float32BufferAttribute(data.objectIds, 1));

  // Front layer: full displacement
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: makeUniforms(),
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
  material.uniforms.u_layerAtten.value = 1.0;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1; // render second (on top)

  // Back layer: nearly anchored, shared geometry
  const backMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: makeUniforms(),
    transparent: true,
    depthWrite: false,  // never occludes front layer
    depthTest: true,
    blending: THREE.NormalBlending,
  });
  backMaterial.uniforms.u_layerAtten.value = 0.01; // nearly frozen

  const backLayer = new THREE.Points(geometry, backMaterial);
  backLayer.frustumCulled = false;
  backLayer.renderOrder = 0; // render first (behind)

  return { points, material, geometry, backLayer, backMaterial };
}

/* ── Dummy 1x1 texture for unbound sampler (prevents iOS shader failure) ── */
const _dummyTexture = new THREE.DataTexture(
  new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType,
);
_dummyTexture.needsUpdate = true;

/* ── Helper: reusable Matrix4 instances to avoid per-frame allocation ── */
const _tmpProjection = new THREE.Matrix4();
const _tmpView = new THREE.Matrix4();

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

  private current: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry; backLayer: THREE.Points; backMaterial: THREE.ShaderMaterial } | null = null;
  private prev: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry; backLayer: THREE.Points; backMaterial: THREE.ShaderMaterial } | null = null;
  private crossfading = false;
  private crossfadeStart = 0;
  private readonly crossfadeDuration = 1500;

  private creatureSystem: CreatureSystem | null = null;

  onError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
    });
    // Let EffectComposer handle clearing
    this.renderer.autoClear = true;

    // Log shader compilation errors (crucial for iOS debugging)
    this.renderer.debug.checkShaderErrors = true;

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
    this.current.material.uniforms.u_numObjects.value = data.numObjects || 0;
    this.current.backMaterial.uniforms.u_numObjects.value = data.numObjects || 0;
    this.scene.add(this.current.backLayer); // back first
    this.scene.add(this.current.points);    // front on top

    // Initialize creature system
    if (!this.creatureSystem) {
      this.creatureSystem = new CreatureSystem(this.renderer, data.count);
    }
    this.creatureSystem.setPointCloud(data);

    // Set texture size uniforms on BOTH materials
    const [texW, texH] = this.creatureSystem.getTexSize();
    this.current.material.uniforms.u_texSize.value.set(texW, texH);
    this.current.backMaterial.uniforms.u_texSize.value.set(texW, texH);
  }

  /**
   * Update scene graph state (uniforms, camera, crossfade).
   * Does NOT call renderer.render — EffectComposer does that.
   */
  update(opts: RenderOpts): void {
    // Apply external camera matrices (from camera-auto.ts Float32Arrays)
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

    // Both clouds visible simultaneously during crossfade.
    // Shader uses u_transition as alpha — prev fades out, current fades in.
    if (this.prev) {
      this.prev.points.visible = this.crossfading;
      this.prev.backLayer.visible = this.crossfading;
      if (this.crossfading) {
        this.updateUniforms(this.prev.material, opts, 1.0 - crossT);
        this.updateUniforms(this.prev.backMaterial, opts, 1.0 - crossT);
      }
    }

    if (this.current) {
      this.current.points.visible = true;
      this.current.backLayer.visible = true;
      this.updateUniforms(this.current.material, opts, this.crossfading ? crossT : 1.0);
      this.updateUniforms(this.current.backMaterial, opts, this.crossfading ? crossT : 1.0);
      this.current.backMaterial.uniforms.u_pointScale.value = opts.pointScale * 0.95;
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
      this.scene.remove(this.current.backLayer);
      this.current.geometry.dispose();
      this.current.material.dispose();
      this.current.backMaterial.dispose();
      this.current = null;
    }
    if (this.creatureSystem) {
      this.creatureSystem.dispose();
      this.creatureSystem = null;
    }
    this.renderer.dispose();
  }

  /** Update creature system — call each frame before update() */
  updateCreatures(dt: number, audioData: AudioData, time: number): void {
    if (!this.creatureSystem || !this.current) return;

    this.creatureSystem.update(dt, audioData, time);

    const active = this.creatureSystem.hasCreatures;
    const mat = this.current.material;
    const backMat = this.current.backMaterial;
    mat.uniforms.u_creaturesActive.value = active ? 1.0 : 0.0;
    backMat.uniforms.u_creaturesActive.value = active ? 1.0 : 0.0;

    if (active) {
      const tex = this.creatureSystem.getPositionTexture();
      mat.uniforms.u_positionTex.value = tex;
      backMat.uniforms.u_positionTex.value = tex;
    }
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
    u.u_segCoherence.value = opts.segCoherence;
    u.u_pointScale.value = opts.pointScale;
    u.u_transition.value = transition;
    u.u_form.value = opts.form;
    u.u_highlightCat.value = opts.highlightCat;
    u.u_projMode.value = opts.projMode;
    u.u_spotPhase.value = opts.time;
    u.u_chakra.value = opts.chakra;
    u.u_demonsLow.value = opts.demonsLow;
    u.u_demonsHigh.value = opts.demonsHigh;
  }

  private disposePrev(): void {
    if (this.prev) {
      this.scene.remove(this.prev.points);
      this.scene.remove(this.prev.backLayer);
      this.prev.geometry.dispose();
      this.prev.material.dispose();
      this.prev.backMaterial.dispose();
      this.prev = null;
    }
  }
}
