// Three.js scene manager — replaces renderer-points.ts
// Point cloud rendering with custom ShaderMaterial and crossfade

import * as THREE from 'three';
import type { PointCloudData } from './pointcloud';
import type { AudioData } from './audio';
import { CreatureSystem } from './creature-system';

/* ── Vertex Shader (GLSL 300 es, used with THREE.GLSL3) ── */
const VERT = /* glsl */ `
precision highp float;

// Three.js provides: projectionMatrix, modelViewMatrix, position (vec3)
// But we use raw u_projection / u_view for camera-auto.ts compatibility.

// Attributes — 'position' is auto-declared by Three.js for GLSL3
// in vec3 position;  // auto-injected
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
uniform float u_spotPhase; // cycles over time, selects which sub-objects are "lit up"
uniform float u_numObjects; // total unique objects from segmentation
uniform float u_layerAtten; // 1.0 = front (full fx), 0.0 = back (anchored)

// Chakra system uniforms
uniform float u_chakra[7];     // root, sacral, solar, heart, throat, thirdEye, crown
uniform float u_demonsLow;     // sub-bass demon energy
uniform float u_demonsHigh;    // high-freq demon energy

// Creature system uniforms
uniform sampler2D u_positionTex;
uniform vec2 u_texSize;
uniform float u_creaturesActive;

out vec3 v_color;
out float v_alpha;
out float v_coherence;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);
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

  float depthFactor;
  if (u_projMode > 0.5) {
    float radius = length(position);
    depthFactor = clamp((radius - 6.0) / 4.0, 0.0, 1.0);
  } else {
    depthFactor = 1.0 - clamp((-position.z - 3.0) / 6.0, 0.0, 1.0);
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
    dir = normalize(position);
  } else {
    dir = vec3(0.0, 0.0, 1.0);
  }
  float t = u_time;

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
    float swayZ = sin(pos.y * 0.8 + t * 2.4) * energy * 0.25;
    displacement = vec3(swayX, swayY, swayZ);
    colorTint = vec3(-0.01, 0.06, 0.01) * energy;
    sizeBoost = energy * 1.5;
  } else if (cat == 2) {
    energy = u_band5 * 0.2 + u_band6 * 0.4 + u_band7 * 0.4;
    float flowX = sin(pos.x * 0.4 + pos.y * 0.3 + t * 1.2) * energy * 0.9;
    float flowY = cos(pos.y * 0.5 + pos.x * 0.2 + t * 0.9) * energy * 0.7;
    float flowZ = sin(pos.x * 0.3 + pos.y * 0.4 + t * 1.5) * energy * 0.5;
    displacement = vec3(flowX, flowY, flowZ);
    float shimmer = sin(pos.x * 3.0 + pos.y * 2.0 + t * 8.0) * 0.5 + 0.5;
    colorTint = vec3(0.04, 0.05, 0.09) * energy * shimmer;
    sizeBoost = energy * 1.0;
  } else if (cat == 3) {
    energy = u_beat * 0.7 + u_band0 * 0.3;
    float rippleDist = length(pos.xz);
    float ripple = sin(rippleDist * 4.0 - t * 6.0) * energy * 0.6;
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
    float driftZ = sin(pos.x * 0.2 + pos.y * 0.3 + t * 0.7) * energy * 0.3;
    displacement = vec3(driftX, driftY, driftZ);
    colorTint = vec3(0.015, 0.015, 0.025) * energy;
    sizeBoost = energy * 0.5;
  }

  // ── Chakra system ──
  // Map segment category to patron chakra: cat0→3(heart), cat1→1(sacral), cat2→5(thirdEye), cat3→0(root), cat4→2(solar), cat5→4(throat)
  int chakraMap[6] = int[6](3, 1, 5, 0, 2, 4);
  int myChakra = chakraMap[cat];
  float myChakraEnergy = u_chakra[myChakra];
  float crownBoost = u_chakra[6] * 0.3;
  float demonForce = u_demonsLow + u_demonsHigh;

  // Per-segment coherence with chakra influence
  float segCoh = clamp(
    u_segCoherence[cat]
    + myChakraEnergy * 0.5
    + crownBoost
    - demonForce * 0.1
  , 0.0, 1.0);
  float displaceScale = (1.0 - segCoh) * u_layerAtten; // 0 at full coherence, attenuated by layer depth

  // ── Per-segment chakra healing displacement ──
  vec3 chakraHealDisp = vec3(0.0);
  if (cat == 3) {
    // Root chakra: grid snap + downward gravity
    vec3 gridPos = round(pos * 4.0) / 4.0;
    vec3 rootHeal = mix(pos, gridPos, myChakraEnergy * 0.3) - pos;
    rootHeal.y -= myChakraEnergy * 0.1;
    chakraHealDisp = rootHeal;
  } else if (cat == 1) {
    // Sacral chakra: smooth flowing waves
    float sacralWave = sin(pos.x * 2.0 + pos.y * 1.5 + u_time * 1.0) * myChakraEnergy * 0.15;
    chakraHealDisp = vec3(sacralWave, sacralWave * 0.5, 0.0);
  } else if (cat == 4) {
    // Solar Plexus: crystalline geometric alignment
    float solarAngle = floor(atan(pos.y, pos.x) * 3.0 / 3.14159) * 3.14159 / 3.0;
    vec3 solarDir = vec3(cos(solarAngle), sin(solarAngle), 0.0);
    chakraHealDisp = solarDir * myChakraEnergy * 0.1;
  } else if (cat == 0) {
    // Heart chakra: gentle breathing pulse, attract inward
    float heartBreath = sin(u_time * 0.8) * 0.5 + 0.5;
    vec3 heartCenter = vec3(0.0, 0.0, -6.0);
    vec3 toCenter = normalize(heartCenter - pos);
    chakraHealDisp = toCenter * myChakraEnergy * heartBreath * 0.1;
  } else if (cat == 5) {
    // Throat chakra: rippling expansion
    float throatRipple = sin(length(pos.xz) * 6.0 + u_time * 3.0) * myChakraEnergy * 0.08;
    chakraHealDisp = vec3(0.0, throatRipple, 0.0);
  } else if (cat == 2) {
    // Third Eye: spiral ordering
    float teAngle = atan(pos.y - 1.0, pos.x) + myChakraEnergy * u_time * 0.2;
    float teRadius = length(vec2(pos.x, pos.y - 1.0));
    chakraHealDisp = vec3(cos(teAngle) * teRadius - pos.x, sin(teAngle) * teRadius - (pos.y - 1.0), 0.0) * myChakraEnergy * 0.1;
  }

  // ── Demon displacement (resisted by chakra energy) ──
  float demonResistance = myChakraEnergy * 0.6 + crownBoost;
  float effectiveDemon = max(0.0, 1.0 - demonResistance);

  vec3 demonLowDisp = vec3(
    sin(pos.y * 8.0 + u_time * 15.0),
    sin(pos.x * 6.0 + u_time * 12.0),
    sin(pos.z * 7.0 + u_time * 10.0)
  ) * u_demonsLow * effectiveDemon * 0.3;

  vec3 demonHighDisp = vec3(h1 - 0.5, h2 - 0.5, h3 - 0.5) * u_demonsHigh * effectiveDemon * 0.5;

  pos += (chakraHealDisp + demonLowDisp + demonHighDisp) * displaceScale;

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
  float spiral = sin(angle * 3.0 + radius * 2.0 - t * 1.5) * u_mid * 0.25;
  vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x) + 0.001);
  pos += tangent * spiral * invMass * displaceScale;

  float dist = length(pos);
  float pulse = sin(dist * 5.0 - t * 4.0) * u_beat * 0.4;
  pos += normalize(pos + 0.001) * pulse * invMass * displaceScale;

  pos += vec3(
    sin(pos.x * 7.0 + pos.y * 3.0) * u_form * 0.04,
    sin(pos.y * 6.0 + pos.z * 4.0) * u_form * 0.04,
    sin(pos.z * 5.0 + pos.x * 3.5) * u_form * 0.04
  ) * displaceScale;

  float depthProtection = depthFactor * 0.4;
  float localCoherence = clamp(segCoh + depthProtection * (1.0 - segCoh), 0.0, 1.0);
  float localChaos = 1.0 - localCoherence;

  float chaosFreq = 2.0 + energy * 3.0;
  vec3 scatter = vec3(
    sin(pos.x * chaosFreq + pos.y * 1.3 + t * 0.8),
    cos(pos.y * chaosFreq + pos.z * 1.1 + t * 0.6),
    sin(pos.z * chaosFreq + pos.x * 0.9 + t * 1.0)
  ) * localChaos * 2.5 * invMass;
  pos += scatter * displaceScale;

  float zDist = u_projMode > 0.5 ? length(position) : -position.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.3 * invMass * displaceScale;
  pos += dir * beatWave;

  // ── Spotlight system: 3 effects on real segmented objects ──
  float objId = a_objectId;
  float isObject = step(0.001, objId); // 0 for background, 1 for real objects
  float spotCycle = u_spotPhase * 0.1; // slow ~10s cycle

  // 3 independent hashes per object → 3 different effect selections
  float h1 = fract(sin(objId * 127.1 + 311.7) * 43758.5453);
  float h2 = fract(sin(objId * 269.3 + 183.1) * 28461.7231);
  float h3 = fract(sin(objId * 419.7 + 57.3) * 61283.9157);

  // Effect 1: SCALE/GROW — objects inflate, points push outward from center
  float scaleDist = abs(fract(h1 + spotCycle) - 0.5) * 2.0;
  float scaleActive = smoothstep(0.18, 0.0, scaleDist) * isObject;
  // Grow = amplify displacement from original position + inflate size
  float growFactor = 1.0 + scaleActive * energy * 4.0 * displaceScale;
  pos = position + (pos - position) * growFactor;
  // Also push points outward from object's local center (approximate via position hash)
  vec3 objCenter = position; // each point pushes outward from its own rest position
  float breathe = sin(t * 3.0 + h1 * 6.28) * 0.5 + 0.5;
  pos += normalize(pos - objCenter + 0.001) * scaleActive * energy * breathe * 0.5 * displaceScale;

  // Effect 2: DETACH/FLOAT — objects lift off and drift
  float floatDist = abs(fract(h2 + spotCycle * 0.8 + 0.33) - 0.5) * 2.0;
  float floatActive = smoothstep(0.15, 0.0, floatDist) * isObject;
  // Upward lift + gentle drift
  float liftHeight = floatActive * energy * 1.5 * displaceScale;
  float driftX = sin(t * 1.2 + h2 * 6.28) * floatActive * 0.4 * displaceScale;
  float driftZ = cos(t * 0.9 + h2 * 3.14) * floatActive * 0.3 * displaceScale;
  pos.y += liftHeight * (0.5 + sin(t * 2.0 + objId * 50.0) * 0.5); // bobbing lift
  pos.x += driftX;
  pos.z += driftZ;
  // Slow rotation around Y axis while floating
  float floatAngle = t * 0.8 * floatActive;
  float cosA = cos(floatAngle);
  float sinA = sin(floatAngle);
  vec3 centered = pos - position;
  pos = position + vec3(centered.x * cosA - centered.z * sinA, centered.y, centered.x * sinA + centered.z * cosA);

  // Effect 3: MULTIPLY/SHATTER — split object points into offset echoes
  float shatterDist = abs(fract(h3 + spotCycle * 1.2 + 0.66) - 0.5) * 2.0;
  float shatterActive = smoothstep(0.12, 0.0, shatterDist) * isObject;
  // Use vertex index (via position hash) to assign echo groups
  float vertHash = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float echoGroup = floor(vertHash * 3.0); // 3 echo groups
  vec3 echoOffsets[3] = vec3[3](
    vec3(0.5, 0.3, -0.2),
    vec3(-0.4, -0.2, 0.4),
    vec3(0.1, -0.5, -0.3)
  );
  // Points scatter into their echo positions
  float shatterLerp = shatterActive * energy * displaceScale;
  vec3 echoTarget = echoOffsets[int(echoGroup)] * (1.0 + sin(t * 2.5) * 0.3);
  pos += echoTarget * shatterLerp;

  // Combined spotlight intensity for size/color
  float spotlight = max(scaleActive, max(floatActive, shatterActive));

  // Use Three.js built-in matrices (set from camera)
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);

  float baseSize = u_pointScale;
  float coherenceBoost = localCoherence * localCoherence * 1.0;
  float massSize = 1.0 + clamp(baseMass - 1.0, 0.0, 4.0) * 0.15;
  float ptSize = (baseSize + coherenceBoost + sizeBoost * displaceScale * invMass) * massSize;
  ptSize *= (1.0 + scaleActive * energy * 2.0 * displaceScale); // scale effect inflates points
  ptSize *= (1.0 + floatActive * 0.5); // floating objects slightly larger
  ptSize *= (0.4 + depthFactor * 1.2);
  gl_PointSize = max(1.0, ptSize);

  v_color = a_color;
  v_color += colorTint * displaceScale;
  v_color += vec3(0.04, 0.02, 0.05) * u_beat * displaceScale;
  // Spotlight glow per effect type
  v_color += vec3(0.15, 0.05, 0.02) * scaleActive * energy * displaceScale;  // warm grow glow
  v_color += vec3(0.05, 0.1, 0.2) * floatActive * energy * displaceScale;    // cool float glow
  v_color += vec3(0.12, 0.02, 0.15) * shatterActive * energy * displaceScale; // purple shatter glow

  // ── Chakra color tinting ──
  vec3 chakraColors[7] = vec3[7](
    vec3(0.8, 0.1, 0.1),  // Root - red
    vec3(0.9, 0.5, 0.1),  // Sacral - orange
    vec3(0.9, 0.9, 0.2),  // Solar - yellow
    vec3(0.2, 0.8, 0.3),  // Heart - green
    vec3(0.2, 0.4, 0.9),  // Throat - blue
    vec3(0.5, 0.2, 0.8),  // Third Eye - indigo
    vec3(0.9, 0.9, 1.0)   // Crown - white/gold
  );
  v_color += chakraColors[myChakra] * myChakraEnergy * 0.08;
  v_color += vec3(0.05, 0.04, 0.02) * u_chakra[6]; // Crown shimmer on all

  if (u_highlightCat > -0.5) {
    float catF = float(cat);
    if (abs(catF - u_highlightCat) > 0.5) {
      v_color *= 0.15;
    } else {
      v_color *= 1.5;
      v_color += vec3(0.1);
    }
  }

  // Creature recruitment glow
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
function buildPoints(data: PointCloudData): { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('a_color', new THREE.Float32BufferAttribute(data.colors, 3));
  geometry.setAttribute('a_segment', new THREE.Float32BufferAttribute(data.segments, 1));
  geometry.setAttribute('a_objectId', new THREE.Float32BufferAttribute(data.objectIds, 1));

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

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material, geometry };
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

  private current: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry; backLayer?: THREE.Points; backMaterial?: THREE.ShaderMaterial } | null = null;
  private prev: { points: THREE.Points; material: THREE.ShaderMaterial; geometry: THREE.BufferGeometry; backLayer?: THREE.Points; backMaterial?: THREE.ShaderMaterial } | null = null;
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
    this.current.material.uniforms.u_layerAtten.value = 1.0; // front layer: full effects

    // Back layer: shared geometry, cloned material with low displacement
    const backMaterial = this.current.material.clone();
    backMaterial.uniforms = makeUniforms();
    backMaterial.uniforms.u_layerAtten.value = 0.05; // nearly anchored
    backMaterial.uniforms.u_numObjects.value = data.numObjects || 0;
    backMaterial.depthWrite = true;
    const backLayer = new THREE.Points(this.current.geometry, backMaterial);
    backLayer.frustumCulled = false;
    backLayer.renderOrder = -1; // render first (behind front layer)
    this.current.backLayer = backLayer;
    this.current.backMaterial = backMaterial;
    this.scene.add(backLayer);
    this.scene.add(this.current.points);

    // Initialize creature system
    if (!this.creatureSystem) {
      this.creatureSystem = new CreatureSystem(this.renderer, data.count);
    }
    this.creatureSystem.setPointCloud(data);

    // Set texture size uniforms on the new material
    const [texW, texH] = this.creatureSystem.getTexSize();
    this.current.material.uniforms.u_texSize.value.set(texW, texH);
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
      if (this.prev.backLayer) this.prev.backLayer.visible = this.crossfading;
      if (this.crossfading) {
        this.updateUniforms(this.prev.material, opts, 1.0 - crossT);
        if (this.prev.backMaterial) {
          const savedAtten = this.prev.backMaterial.uniforms.u_layerAtten.value;
          this.updateUniforms(this.prev.backMaterial, opts, 1.0 - crossT);
          this.prev.backMaterial.uniforms.u_layerAtten.value = savedAtten;
        }
      }
    }

    if (this.current) {
      this.current.points.visible = true;
      this.updateUniforms(this.current.material, opts, this.crossfading ? crossT : 1.0);
      // Sync back layer uniforms (keeps its own u_layerAtten)
      if (this.current.backMaterial) {
        const savedAtten = this.current.backMaterial.uniforms.u_layerAtten.value;
        this.updateUniforms(this.current.backMaterial, opts, this.crossfading ? crossT : 1.0);
        this.current.backMaterial.uniforms.u_layerAtten.value = savedAtten;
        // Back layer: slightly smaller points
        this.current.backMaterial.uniforms.u_pointScale.value = opts.pointScale * 0.8;
      }
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
    mat.uniforms.u_creaturesActive.value = active ? 1.0 : 0.0;

    if (active) {
      const tex = this.creatureSystem.getPositionTexture();
      mat.uniforms.u_positionTex.value = tex;
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
      if (this.prev.backLayer) {
        this.scene.remove(this.prev.backLayer);
        this.prev.backMaterial?.dispose();
      }
      this.prev.geometry.dispose();
      this.prev.material.dispose();
      this.prev = null;
    }
  }
}
