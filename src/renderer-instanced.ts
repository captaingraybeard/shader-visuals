// Three.js Instanced Quad Renderer — replaces point cloud with billboarded quads
// Benefits: elliptical splats, proper blending, frustum culling, LOD
//
// Architecture:
// - InstancedMesh with PlaneGeometry base (2 triangles = 1 quad)
// - InstancedBufferAttribute for position, color, segment, objectId
// - Custom ShaderMaterial ported from renderer-points.ts
// - Billboard shader (always faces camera)
// - Full audio reactivity preserved

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';
import type { AudioData } from './audio';
import { CreatureSystem } from './creature-system';
import { controls } from './control-registry';
import {
  STYLE_FRAG_FUNCTIONS, STYLE_FRAG_INPUTS, STYLE_FRAG_MAIN,
  STYLE_VERT_OUTPUTS,
} from './particle-styles';

/* ── Vertex Shader for Instanced Quads ── */
// Key differences from points renderer:
// - Uses instanceMatrix for per-instance transforms (billboard computed in shader)
// - Quad corners from geometry position attribute
// - UV for proper texturing/shape rendering
const VERT = /* glsl */ `
precision highp float;

// Per-vertex (from PlaneGeometry)
// position and uv are built-in from BufferGeometry

// Per-instance attributes
attribute vec3 instancePosition;  // world position of this splat
attribute vec3 instanceColor;     // RGB color
attribute float instanceSegment;  // audio category (0-1, maps to 0-5)
attribute float instanceObjectId; // semantic object ID

// Uniforms
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
uniform float u_splatScale;      // base size of each quad
uniform float u_transition;
uniform float u_form;
uniform float u_highlightCat;
uniform float u_projMode;
uniform float u_spotPhase;
uniform float u_numObjects;

// Chakra/demon uniforms
uniform float u_chakra[7];
uniform float u_demonsLow;
uniform float u_demonsHigh;

// Creature system
uniform sampler2D u_positionTex;
uniform vec2 u_texSize;
uniform float u_creaturesActive;

// Particle style
uniform float u_particleStyle;

// Frustum culling params
uniform float u_cullRadius;
uniform vec3 u_cameraPos;

// Outputs
out vec3 v_color;
out vec2 v_uv;
out float v_alpha;
out float v_coherence;

${STYLE_VERT_OUTPUTS}

void main() {
  // Get instance index for creature system lookup
  int instanceIdx = gl_InstanceID;
  
  // Base position — either from creature system or instance attribute
  vec3 pos;
  float recruitment = 0.0;
  if (u_creaturesActive > 0.5) {
    int texX = instanceIdx % int(u_texSize.x);
    int texY = instanceIdx / int(u_texSize.x);
    vec2 texUV = (vec2(float(texX), float(texY)) + 0.5) / u_texSize;
    vec4 posData = texture(u_positionTex, texUV);
    pos = posData.xyz;
    recruitment = posData.w;
  } else {
    pos = instancePosition;
  }

  // Depth factor for mass calculation
  float depthFactor;
  if (u_projMode > 0.5) {
    depthFactor = clamp((length(instancePosition) - 6.0) / 4.0, 0.0, 1.0);
  } else {
    depthFactor = 1.0 - clamp((-instancePosition.z - 3.0) / 6.0, 0.0, 1.0);
  }

  // Decode audio category
  int cat = int(instanceSegment * 5.0 + 0.5);

  // ── MASS MODEL ──
  float baseMass = 1.0;
  if (cat == 0) baseMass = 5.0;       // BASS_SUBJECT
  else if (cat == 1) baseMass = 1.5;   // MID_ORGANIC
  else if (cat == 2) baseMass = 0.3;   // HIGH_SKY
  else if (cat == 3) baseMass = 8.0;   // BEAT_GROUND
  else if (cat == 4) baseMass = 4.0;   // MID_STRUCTURE
  else baseMass = 0.5;                 // LOW_AMBIENT

  float mass = baseMass * (0.6 + depthFactor * 0.8);
  float invMass = 1.0 / mass;

  // ── Per-category audio displacement ──
  float energy = 0.0;
  vec3 displacement = vec3(0.0);
  vec3 colorTint = vec3(0.0);
  float sizeBoost = 0.0;
  float t = u_time;

  vec3 dir = u_projMode > 0.5 ? normalize(instancePosition) : vec3(0.0, 0.0, 1.0);

  // Category-specific displacement (ported from renderer-points.ts)
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
  float formScatter = u_form * 0.04 * displaceScale;
  pos += vec3(
    sin(pos.x * 7.0 + pos.y * 3.0) * formScatter,
    sin(pos.y * 6.0 + pos.z * 4.0) * formScatter,
    sin(pos.z * 5.0 + pos.x * 3.5) * formScatter
  );

  // Depth-weighted coherence
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
  float zDist = u_projMode > 0.5 ? length(instancePosition) : -instancePosition.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.3 * invMass * displaceScale;
  pos += dir * beatWave;

  // ── Spotlight system ──
  float objId = instanceObjectId;
  float isObject = step(0.001, objId);
  float spotCycle = u_spotPhase * 0.1;

  float oh1 = fract(objId * 127.1 + 0.7);
  float oh2 = fract(objId * 269.3 + 0.3);
  float oh3 = fract(objId * 419.7 + 0.1);

  // Effect 1: SCALE/GROW
  float scaleDist = abs(fract(oh1 + spotCycle) - 0.5) * 2.0;
  float scaleActive = smoothstep(0.25, 0.0, scaleDist) * isObject;
  float growFactor = 1.0 + scaleActive * energy * 6.0 * displaceScale;
  pos = instancePosition + (pos - instancePosition) * growFactor;

  // Effect 2: DETACH/FLOAT
  float floatDist = abs(fract(oh2 + spotCycle * 0.8 + 0.33) - 0.5) * 2.0;
  float floatActive = smoothstep(0.22, 0.0, floatDist) * isObject;
  float liftHeight = floatActive * energy * 2.5 * displaceScale;
  pos.y += liftHeight * (0.5 + sin(t * 2.0 + objId * 50.0) * 0.5);
  pos.x += sin(t * 1.2 + oh2 * 6.28) * floatActive * 0.7 * displaceScale;
  pos.z += cos(t * 0.9 + oh2 * 3.14) * floatActive * 0.5 * displaceScale;

  // Effect 3: SHATTER/ECHO
  float shatterDist = abs(fract(oh3 + spotCycle * 1.2 + 0.66) - 0.5) * 2.0;
  float shatterActive = smoothstep(0.2, 0.0, shatterDist) * isObject;
  float vertHash = fract(dot(instancePosition.xy, vec2(12.9898, 78.233)));
  float echoGroup = floor(vertHash * 3.0);
  vec3 echoDir = echoGroup < 1.0 ? vec3(0.8, 0.5, -0.3) :
                 echoGroup < 2.0 ? vec3(-0.6, -0.3, 0.6) :
                                   vec3(0.2, -0.7, -0.5);
  pos += echoDir * shatterActive * energy * displaceScale * (1.0 + sin(t * 2.5) * 0.3);

  // ── BILLBOARD TRANSFORM ──
  // Scale the quad corners based on splat size
  float baseSize = u_splatScale;
  float coherenceBoost = localCoherence * localCoherence;
  float massSize = 1.0 + clamp(baseMass - 1.0, 0.0, 4.0) * 0.15;
  float splatSize = (baseSize + coherenceBoost * 0.3 + sizeBoost * displaceScale * invMass * 0.1) * massSize;
  splatSize *= (0.4 + depthFactor * 1.2);
  
  // Scale adjustment for spotlight effects
  splatSize *= (1.0 + scaleActive * energy * 5.0 * displaceScale);
  
  // Style-specific size adjustments
  int styleIdx = int(u_particleStyle + 0.5);
  if (styleIdx == 2) splatSize *= 1.3;       // Ink
  else if (styleIdx == 3) splatSize *= 2.0;  // Smoke
  else if (styleIdx == 4) splatSize *= 1.5 + energy * 1.5; // Sparks
  else if (styleIdx == 5) splatSize *= 1.6;  // Paint

  // Billboard: align quad to face camera
  // Get camera right and up vectors from view matrix
  mat4 mv = viewMatrix * modelMatrix;
  vec3 camRight = vec3(mv[0][0], mv[1][0], mv[2][0]);
  vec3 camUp = vec3(mv[0][1], mv[1][1], mv[2][1]);
  
  // Apply quad vertex offset in camera space
  vec3 vertexOffset = (position.x * camRight + position.y * camUp) * splatSize;
  vec3 worldPos = pos + vertexOffset;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(worldPos, 1.0);

  // ── Outputs ──
  v_uv = uv;
  v_color = instanceColor;
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
  }

  v_alpha = u_transition;
  v_coherence = localCoherence;

  // Style varyings
  v_worldPos = worldPos;
  v_energy = energy;
  v_styleTime = u_time;
}
`;

/* ── Fragment Shader for Instanced Quads ── */
// Uses UV-based distance for soft circles (not gl_PointCoord)
const FRAG = /* glsl */ `
precision highp float;

in vec3 v_color;
in vec2 v_uv;
in float v_alpha;
in float v_coherence;

${STYLE_FRAG_INPUTS}

uniform float u_particleStyle;

out vec4 fragColor;

${STYLE_FRAG_FUNCTIONS}

void main() {
  // Convert UV (0-1) to point-coord style (-0.5 to 0.5)
  vec2 pc = v_uv - 0.5;
  float dist = length(pc);

  int style = int(u_particleStyle + 0.5);

  if (style == 1) {
    fragColor = styleGlass(pc, dist, v_color, v_alpha, v_coherence, v_styleTime, v_worldPos);
  } else if (style == 2) {
    fragColor = styleInk(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else if (style == 3) {
    fragColor = styleSmoke(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else if (style == 4) {
    fragColor = styleSparks(pc, dist, v_color, v_alpha, v_coherence, v_energy);
  } else if (style == 5) {
    fragColor = stylePaint(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else {
    // Default style
    if (v_coherence < 0.7) {
      float shapeThreshold = mix(0.45, 0.7, v_coherence / 0.7);
      if (dist > shapeThreshold) discard;
      float edgeStart = shapeThreshold - 0.15;
      float edge = 1.0 - smoothstep(edgeStart, shapeThreshold, dist);
      fragColor = vec4(v_color * edge, v_alpha * edge);
    } else {
      if (dist > 0.5) discard;
      fragColor = vec4(v_color, v_alpha);
    }
  }
}
`;

/* ── Render options ── */
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
  splatScale: number;  // renamed from pointScale for quads
  form: number;
  highlightCat: number;
  projMode: number;
  chakra: number[];
  demonsLow: number;
  demonsHigh: number;
}

/* ── Dummy texture for unbound samplers ── */
const _dummyTexture = new THREE.DataTexture(
  new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType,
);
_dummyTexture.needsUpdate = true;

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
    u_splatScale: { value: 0.05 },  // Default splat size in world units
    u_transition: { value: 1 },
    u_form: { value: 0 },
    u_highlightCat: { value: -1 },
    u_projMode: { value: 0 },
    u_spotPhase: { value: 0 },
    u_numObjects: { value: 0 },
    u_chakra: { value: [0, 0, 0, 0, 0, 0, 0] },
    u_demonsLow: { value: 0 },
    u_demonsHigh: { value: 0 },
    u_positionTex: { value: _dummyTexture },
    u_texSize: { value: new THREE.Vector2(1, 1) },
    u_creaturesActive: { value: 0 },
    u_particleStyle: { value: 0 },
    u_cullRadius: { value: 50 },
    u_cameraPos: { value: new THREE.Vector3() },
  };
}

/* ── Build instanced mesh from point cloud data ── */
function buildInstancedMesh(data: PointCloudData): {
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;
  geometry: THREE.InstancedBufferGeometry;
} {
  // Base geometry: 1x1 plane (will be scaled per instance)
  const baseGeom = new THREE.PlaneGeometry(1, 1);
  
  // Create InstancedBufferGeometry from base
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = baseGeom.index;
  geometry.setAttribute('position', baseGeom.getAttribute('position'));
  geometry.setAttribute('uv', baseGeom.getAttribute('uv'));
  
  // Per-instance attributes
  geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(data.positions, 3));
  geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(data.colors, 3));
  geometry.setAttribute('instanceSegment', new THREE.InstancedBufferAttribute(data.segments, 1));
  geometry.setAttribute('instanceObjectId', new THREE.InstancedBufferAttribute(data.objectIds, 1));
  
  // Create shader material
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: makeUniforms(),
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,  // Quads visible from both sides
  });
  
  // Create instanced mesh
  const mesh = new THREE.InstancedMesh(geometry, material, data.count);
  mesh.frustumCulled = true;  // Enable frustum culling (Three.js handles this)
  
  // Set bounding sphere for culling (compute from positions)
  geometry.computeBoundingSphere();
  
  return { mesh, material, geometry };
}

/* ── Reusable matrices ── */
const _tmpProjection = new THREE.Matrix4();
const _tmpView = new THREE.Matrix4();

/* ── InstancedRenderer ──
 * High-performance renderer using instanced billboarded quads.
 * Replaces ThreeScene for Phase 1 of migration.
 */
export class InstancedRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private current: {
    mesh: THREE.InstancedMesh;
    material: THREE.ShaderMaterial;
    geometry: THREE.InstancedBufferGeometry;
  } | null = null;
  
  private prev: {
    mesh: THREE.InstancedMesh;
    material: THREE.ShaderMaterial;
    geometry: THREE.InstancedBufferGeometry;
  } | null = null;
  
  private crossfading = false;
  private crossfadeStart = 0;
  private readonly crossfadeDuration = 1500;

  private creatureSystem: CreatureSystem | null = null;
  private pointCount = 0;

  onError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
    });
    this.renderer.autoClear = true;
    this.renderer.debug.checkShaderErrors = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get hasCloud(): boolean {
    return this.current !== null;
  }

  get instanceCount(): number {
    return this.pointCount;
  }

  /** Upload a new point cloud. Creates instanced mesh and crossfades. */
  setPointCloud(data: PointCloudData): void {
    if (this.current) {
      this.disposePrev();
      this.prev = this.current;
      this.crossfading = true;
      this.crossfadeStart = performance.now();
    }

    this.current = buildInstancedMesh(data);
    this.current.material.uniforms.u_numObjects.value = data.numObjects || 0;
    this.scene.add(this.current.mesh);
    this.pointCount = data.count;

    // Initialize creature system
    if (!this.creatureSystem) {
      this.creatureSystem = new CreatureSystem(this.renderer, data.count);
    }
    this.creatureSystem.setPointCloud(data);

    if (!this.creatureSystem.disabled) {
      const [texW, texH] = this.creatureSystem.getTexSize();
      this.current.material.uniforms.u_texSize.value.set(texW, texH);
    }
  }

  /** Update scene state (uniforms, camera, crossfade). */
  update(opts: RenderOpts): void {
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

    if (this.prev) {
      this.prev.mesh.visible = this.crossfading;
      if (this.crossfading) {
        this.updateUniforms(this.prev.material, opts, 1.0 - crossT);
      }
    }

    if (this.current) {
      this.current.mesh.visible = true;
      this.updateUniforms(this.current.material, opts, this.crossfading ? crossT : 1.0);
    }

    if (this.crossfading && crossT >= 1.0) {
      this.disposePrev();
      this.crossfading = false;
    }
  }

  /** Update creature system — call each frame before update() */
  updateCreatures(dt: number, audioData: AudioData, time: number): void {
    if (!this.creatureSystem || !this.current || this.creatureSystem.disabled) return;

    this.creatureSystem.update(dt, audioData, time);

    const active = this.creatureSystem.hasCreatures;
    const mat = this.current.material;
    mat.uniforms.u_creaturesActive.value = active ? 1.0 : 0.0;

    if (active) {
      mat.uniforms.u_positionTex.value = this.creatureSystem.getPositionTexture();
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
      this.scene.remove(this.current.mesh);
      this.current.geometry.dispose();
      this.current.material.dispose();
      this.current = null;
    }
    if (this.creatureSystem) {
      this.creatureSystem.dispose();
      this.creatureSystem = null;
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
    u.u_segCoherence.value = opts.segCoherence;
    u.u_splatScale.value = opts.splatScale;
    u.u_transition.value = transition;
    u.u_form.value = opts.form;
    u.u_highlightCat.value = opts.highlightCat;
    u.u_projMode.value = opts.projMode;
    u.u_spotPhase.value = opts.time;
    u.u_chakra.value = opts.chakra;
    u.u_demonsLow.value = opts.demonsLow;
    u.u_demonsHigh.value = opts.demonsHigh;
    u.u_particleStyle.value = controls.get('particleStyle', 0);
    
    // Update camera position for LOD/culling
    u.u_cameraPos.value.setFromMatrixPosition(this.camera.matrixWorld);
  }

  private disposePrev(): void {
    if (this.prev) {
      this.scene.remove(this.prev.mesh);
      this.prev.geometry.dispose();
      this.prev.material.dispose();
      this.prev = null;
    }
  }
}
