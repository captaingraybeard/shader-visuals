// GPGPU Creature Emergence System
// Points get "recruited" by audio-driven attractors, forming creatures from the existing point cloud

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { PointCloudData } from './pointcloud';
import type { AudioData } from './audio';

/* ── Attractor (CPU-side) ── */
interface Attractor {
  position: THREE.Vector3;
  frequency: number;       // audio band 0-7
  radius: number;
  strength: number;
  lifetime: number;        // seconds remaining
  maxLifetime: number;
  phase: number;
  orbitSpeed: number;
  orbitRadius: number;
  spawnPos: THREE.Vector3;  // original spawn center for orbiting
}

/* ── Compute texture dimensions ── */
function computeTexSize(count: number): [number, number] {
  // Need power-of-2 dimensions that fit count texels
  const sqrt = Math.sqrt(count);
  const w = Math.pow(2, Math.ceil(Math.log2(sqrt)));
  let h = Math.pow(2, Math.ceil(Math.log2(count / w)));
  if (w * h < count) h *= 2;
  return [w, h];
}

/* ── Position compute shader (GLSL 100 for GPUComputationRenderer) ── */
const POSITION_SHADER = /* glsl */ `
uniform float u_dt;
uniform float u_time;
uniform int u_attractorCount;
uniform vec3 u_attractorPos[8];
uniform float u_attractorStrength[8];
uniform float u_attractorRadius[8];
uniform float u_attractorFreq[8];
uniform float u_band0;
uniform float u_band1;
uniform float u_band2;
uniform float u_band3;
uniform float u_band4;
uniform float u_band5;
uniform float u_band6;
uniform float u_band7;
uniform int u_pointCount;

uniform sampler2D u_homeTex;
uniform sampler2D u_velTex;

float getAudioBand(float band) {
  int b = int(band + 0.5);
  if (b == 0) return u_band0;
  if (b == 1) return u_band1;
  if (b == 2) return u_band2;
  if (b == 3) return u_band3;
  if (b == 4) return u_band4;
  if (b == 5) return u_band5;
  if (b == 6) return u_band6;
  if (b == 7) return u_band7;
  return 0.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  // Check if this texel is an actual point
  int texIdx = int(gl_FragCoord.y) * int(resolution.x) + int(gl_FragCoord.x);
  if (texIdx >= u_pointCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(u_velTex, uv);
  vec4 home = texture2D(u_homeTex, uv);

  vec3 homePos = home.xyz;
  vec3 currentPos = pos.xyz;
  float phase = vel.w;
  float dt = u_dt;

  // 1. Calculate total attractor force
  vec3 totalForce = vec3(0.0);
  float maxRecruitment = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= u_attractorCount) break;

    vec3 toAttractor = u_attractorPos[i] - homePos;
    float dist = length(toAttractor);

    if (dist < u_attractorRadius[i] && dist > 0.001) {
      float falloff = 1.0 - (dist / u_attractorRadius[i]);
      falloff = falloff * falloff;

      float energy = getAudioBand(u_attractorFreq[i]);
      float pull = u_attractorStrength[i] * falloff * energy;
      totalForce += normalize(toAttractor) * pull;
      maxRecruitment = max(maxRecruitment, falloff * energy);
    }
  }

  // 2. Recruitment ramps up/down smoothly
  float targetRecruitment = maxRecruitment;
  float currentRecruitment = pos.w;
  float recruitmentSpeed = targetRecruitment > currentRecruitment ? 0.8 : 0.3;
  float newRecruitment = mix(currentRecruitment, targetRecruitment, 1.0 - exp(-recruitmentSpeed * dt));

  // 3. Position: lerp between home and displaced
  vec3 newVel = mix(vel.xyz * 0.95, totalForce, 0.1);
  vec3 displaced = currentPos + newVel * dt;
  vec3 newPos = mix(homePos, displaced, newRecruitment);

  // 4. Orbital motion for recruited points
  if (newRecruitment > 0.1 && length(totalForce) > 0.001) {
    float orbit = sin(u_time * 2.0 + phase) * newRecruitment * 0.05;
    vec3 crossDir = cross(normalize(totalForce), vec3(0.0, 1.0, 0.0));
    if (length(crossDir) > 0.001) {
      newPos += normalize(crossDir) * orbit;
    }
  }

  gl_FragColor = vec4(newPos, newRecruitment);
}
`;

/* ── Velocity compute shader ── */
const VELOCITY_SHADER = /* glsl */ `
uniform float u_dt;
uniform float u_time;
uniform int u_attractorCount;
uniform vec3 u_attractorPos[8];
uniform float u_attractorStrength[8];
uniform float u_attractorRadius[8];
uniform float u_attractorFreq[8];
uniform float u_band0;
uniform float u_band1;
uniform float u_band2;
uniform float u_band3;
uniform float u_band4;
uniform float u_band5;
uniform float u_band6;
uniform float u_band7;
uniform int u_pointCount;

uniform sampler2D u_homeTex;

float getAudioBand(float band) {
  int b = int(band + 0.5);
  if (b == 0) return u_band0;
  if (b == 1) return u_band1;
  if (b == 2) return u_band2;
  if (b == 3) return u_band3;
  if (b == 4) return u_band4;
  if (b == 5) return u_band5;
  if (b == 6) return u_band6;
  if (b == 7) return u_band7;
  return 0.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  int texIdx = int(gl_FragCoord.y) * int(resolution.x) + int(gl_FragCoord.x);
  if (texIdx >= u_pointCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 vel = texture2D(textureVelocity, uv);
  vec4 home = texture2D(u_homeTex, uv);
  vec3 homePos = home.xyz;

  vec3 totalForce = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= u_attractorCount) break;
    vec3 toAttractor = u_attractorPos[i] - homePos;
    float dist = length(toAttractor);
    if (dist < u_attractorRadius[i] && dist > 0.001) {
      float falloff = 1.0 - (dist / u_attractorRadius[i]);
      falloff = falloff * falloff;
      float energy = getAudioBand(u_attractorFreq[i]);
      float pull = u_attractorStrength[i] * falloff * energy;
      totalForce += normalize(toAttractor) * pull;
    }
  }

  vec3 newVel = mix(vel.xyz * 0.95, totalForce, 0.1);
  gl_FragColor = vec4(newVel, vel.w); // preserve phase in w
}
`;

/* ── CreatureSystem class ── */
export class CreatureSystem {
  private renderer: THREE.WebGLRenderer;
  private gpuCompute: GPUComputationRenderer | null = null;
  private positionVariable: ReturnType<GPUComputationRenderer['addVariable']> | null = null;
  private velocityVariable: ReturnType<GPUComputationRenderer['addVariable']> | null = null;
  private homeTexture: THREE.DataTexture | null = null;
  private texW = 0;
  private texH = 0;
  private pointCount = 0;
  private maxPoints: number;

  // Attractors
  private attractors: Attractor[] = [];
  private spawnCooldown = 0;

  // State
  private _hasCreatures = false;

  constructor(renderer: THREE.WebGLRenderer, maxPoints: number) {
    this.renderer = renderer;
    this.maxPoints = maxPoints;
  }

  setPointCloud(data: PointCloudData): void {
    this.dispose();
    this.pointCount = data.count;
    const [texW, texH] = computeTexSize(data.count);
    this.texW = texW;
    this.texH = texH;

    this.gpuCompute = new GPUComputationRenderer(texW, texH, this.renderer);

    // Create home texture (static reference positions)
    const homeData = new Float32Array(texW * texH * 4);
    for (let i = 0; i < data.count; i++) {
      homeData[i * 4] = data.positions[i * 3];
      homeData[i * 4 + 1] = data.positions[i * 3 + 1];
      homeData[i * 4 + 2] = data.positions[i * 3 + 2];
      homeData[i * 4 + 3] = data.segments[i]; // segmentId
    }
    this.homeTexture = new THREE.DataTexture(homeData, texW, texH, THREE.RGBAFormat, THREE.FloatType);
    this.homeTexture.needsUpdate = true;

    // Create initial position texture (starts at home positions)
    const positionTex = this.gpuCompute.createTexture();
    const posArr = positionTex.image.data as Float32Array;
    for (let i = 0; i < data.count; i++) {
      posArr[i * 4] = data.positions[i * 3];
      posArr[i * 4 + 1] = data.positions[i * 3 + 1];
      posArr[i * 4 + 2] = data.positions[i * 3 + 2];
      posArr[i * 4 + 3] = 0; // recruitment = 0
    }

    // Create initial velocity texture
    const velocityTex = this.gpuCompute.createTexture();
    const velArr = velocityTex.image.data as Float32Array;
    for (let i = 0; i < data.count; i++) {
      velArr[i * 4 + 3] = Math.random() * Math.PI * 2; // random phase
    }

    // Add variables
    this.positionVariable = this.gpuCompute.addVariable('texturePosition', POSITION_SHADER, positionTex);
    this.velocityVariable = this.gpuCompute.addVariable('textureVelocity', VELOCITY_SHADER, velocityTex);

    // Set dependencies
    this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
    this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.velocityVariable]);

    // Add uniforms to both shaders
    const sharedUniformDefs = {
      u_dt: { value: 0.016 },
      u_time: { value: 0 },
      u_attractorCount: { value: 0 },
      u_attractorPos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
      u_attractorStrength: { value: new Float32Array(8) },
      u_attractorRadius: { value: new Float32Array(8) },
      u_attractorFreq: { value: new Float32Array(8) },
      u_band0: { value: 0 }, u_band1: { value: 0 }, u_band2: { value: 0 }, u_band3: { value: 0 },
      u_band4: { value: 0 }, u_band5: { value: 0 }, u_band6: { value: 0 }, u_band7: { value: 0 },
      u_pointCount: { value: data.count },
      u_homeTex: { value: this.homeTexture },
    };

    // Position shader needs velocity texture reference
    const posUniforms = this.positionVariable.material.uniforms;
    const velUniforms = this.velocityVariable.material.uniforms;

    for (const [key, val] of Object.entries(sharedUniformDefs)) {
      posUniforms[key] = { value: val.value };
      velUniforms[key] = { value: val.value };
    }

    // Position shader also reads velocity texture — handled by dependency system
    // But we need home texture as explicit uniform
    posUniforms['u_velTex'] = { value: null }; // will be set each frame

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPUComputationRenderer init error:', error);
    }

    this.attractors = [];
    this._hasCreatures = false;
  }

  update(dt: number, audioData: AudioData, time: number): void {
    if (!this.gpuCompute || !this.positionVariable || !this.velocityVariable) return;

    // Clamp dt to avoid huge jumps
    const clampedDt = Math.min(dt, 0.1);

    // Update attractor lifetimes
    this.spawnCooldown = Math.max(0, this.spawnCooldown - clampedDt);
    for (let i = this.attractors.length - 1; i >= 0; i--) {
      this.attractors[i].lifetime -= clampedDt;
      // Orbit around spawn point
      const a = this.attractors[i];
      const orbitAngle = time * a.orbitSpeed + a.phase;
      a.position.copy(a.spawnPos);
      a.position.x += Math.cos(orbitAngle) * a.orbitRadius;
      a.position.z += Math.sin(orbitAngle) * a.orbitRadius;

      if (a.lifetime <= 0) {
        this.attractors.splice(i, 1);
      }
    }

    // Spawn new attractors on beat
    this.maybeSpawnAttractor(audioData);

    // Update _hasCreatures
    this._hasCreatures = this.attractors.length > 0;

    // Update uniforms
    const posU = this.positionVariable.material.uniforms;
    const velU = this.velocityVariable.material.uniforms;

    for (const u of [posU, velU]) {
      u['u_dt'].value = clampedDt;
      u['u_time'].value = time;
      u['u_attractorCount'].value = this.attractors.length;
      u['u_band0'].value = audioData.u_band0;
      u['u_band1'].value = audioData.u_band1;
      u['u_band2'].value = audioData.u_band2;
      u['u_band3'].value = audioData.u_band3;
      u['u_band4'].value = audioData.u_band4;
      u['u_band5'].value = audioData.u_band5;
      u['u_band6'].value = audioData.u_band6;
      u['u_band7'].value = audioData.u_band7;

      for (let i = 0; i < 8; i++) {
        if (i < this.attractors.length) {
          (u['u_attractorPos'].value as THREE.Vector3[])[i].copy(this.attractors[i].position);
          (u['u_attractorStrength'].value as Float32Array)[i] = this.attractors[i].strength;
          (u['u_attractorRadius'].value as Float32Array)[i] = this.attractors[i].radius;
          (u['u_attractorFreq'].value as Float32Array)[i] = this.attractors[i].frequency;
        } else {
          (u['u_attractorStrength'].value as Float32Array)[i] = 0;
        }
      }
    }

    // Set velocity texture reference for position shader
    posU['u_velTex'].value = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;

    // Run compute
    this.gpuCompute.compute();
  }

  getPositionTexture(): THREE.Texture | null {
    if (!this.gpuCompute || !this.positionVariable) return null;
    return this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
  }

  getTexSize(): [number, number] {
    return [this.texW, this.texH];
  }

  get hasCreatures(): boolean {
    return this._hasCreatures;
  }

  dispose(): void {
    if (this.gpuCompute) {
      // GPUComputationRenderer doesn't have a dispose method, but we can clean up textures
      this.gpuCompute = null;
    }
    if (this.homeTexture) {
      this.homeTexture.dispose();
      this.homeTexture = null;
    }
    this.positionVariable = null;
    this.velocityVariable = null;
    this.attractors = [];
    this._hasCreatures = false;
  }

  private maybeSpawnAttractor(audioData: AudioData): void {
    if (this.attractors.length >= 8) return;
    if (this.spawnCooldown > 0) return;
    if (!this.homeTexture) return;

    // Check beat + energy threshold
    const totalEnergy = (audioData.u_band0 + audioData.u_band1 + audioData.u_band2 + audioData.u_band3 +
      audioData.u_band4 + audioData.u_band5 + audioData.u_band6 + audioData.u_band7) / 8;
    if (audioData.u_beat < 0.3 || totalEnergy < 0.3) return;

    // Pick a random point from the home texture as spawn position
    const homeData = this.homeTexture.image.data as Float32Array;
    const randIdx = Math.floor(Math.random() * this.pointCount);
    const px = homeData[randIdx * 4];
    const py = homeData[randIdx * 4 + 1];
    const pz = homeData[randIdx * 4 + 2];

    const spawnPos = new THREE.Vector3(px, py, pz);
    const lifetime = 3 + Math.random() * 5;

    this.attractors.push({
      position: spawnPos.clone(),
      frequency: Math.floor(Math.random() * 8),
      radius: 0.5 + Math.random() * 1.5,
      strength: 0.5 + Math.random() * 0.5,
      lifetime,
      maxLifetime: lifetime,
      phase: Math.random() * Math.PI * 2,
      orbitSpeed: 0.5 + Math.random() * 1.5,
      orbitRadius: 0.1 + Math.random() * 0.3,
      spawnPos,
    });

    this.spawnCooldown = 0.5;
  }
}
