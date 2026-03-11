// Procedural Explosion Effect
// Raymarched volumetric fireball with FBM noise displacement
// Triggered by beat spikes, composited over the point cloud

import * as THREE from 'three';
import { controls, addControl } from '../control-registry';

// Register explosion-specific controls
addControl('explosionIntensity', 0, 0, 2, 0.01, 'Explosion Intensity', 'Effects');
addControl('explosionRadius', 0.5, 0.1, 2, 0.01, 'Explosion Radius', 'Effects');
addControl('turbulence', 0.3, 0, 1, 0.01, 'Turbulence', 'Effects');
addControl('explosionSpeed', 1, 0.2, 3, 0.1, 'Explosion Speed', 'Effects');

/* ── Explosion Vertex Shader ── */
const VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* ── Explosion Fragment Shader ── */
const FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float u_time;
uniform float u_intensity;
uniform float u_radius;
uniform float u_turbulence;
uniform float u_speed;
uniform vec2 u_resolution;
uniform vec3 u_explosionPos;  // World-space position of explosion
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;

#define MAX_STEPS 48
#define STEP_SIZE 0.08
#define DENSITY_SCALE 2.5

// ── Noise functions ──

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * noise(p * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

// ── SDF for explosion sphere ──

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// ── Explosion density field ──

float explosionDensity(vec3 p, float time) {
  float t = time * u_speed;
  
  // Expanding radius
  float expandRadius = u_radius * (0.5 + t * 0.5);
  
  // Base sphere distance
  float d = sdSphere(p, expandRadius);
  
  // Turbulent displacement
  vec3 turbP = p * (3.0 - t * 0.5) + vec3(t * 0.5, t * 0.3, t * 0.4);
  float turb = fbm(turbP, 4) * u_turbulence * expandRadius;
  d -= turb;
  
  // Density falloff
  float density = 1.0 - smoothstep(-0.1, 0.3, d);
  
  // Fade out over time
  float fade = 1.0 - smoothstep(0.0, 2.0, t);
  density *= fade;
  
  // Inner hot core
  float core = 1.0 - smoothstep(0.0, expandRadius * 0.3, length(p));
  density += core * fade * 0.5;
  
  return density * u_intensity;
}

// ── Color gradient for fire ──

vec3 fireColor(float density, float depth) {
  // White core → yellow → orange → red → smoke
  vec3 white = vec3(1.0, 1.0, 0.95);
  vec3 yellow = vec3(1.0, 0.9, 0.2);
  vec3 orange = vec3(1.0, 0.5, 0.0);
  vec3 red = vec3(0.8, 0.1, 0.0);
  vec3 smoke = vec3(0.1, 0.08, 0.06);
  
  float t = clamp(density, 0.0, 1.0);
  
  vec3 color;
  if (t > 0.8) {
    color = mix(yellow, white, (t - 0.8) / 0.2);
  } else if (t > 0.5) {
    color = mix(orange, yellow, (t - 0.5) / 0.3);
  } else if (t > 0.2) {
    color = mix(red, orange, (t - 0.2) / 0.3);
  } else {
    color = mix(smoke, red, t / 0.2);
  }
  
  // Depth-based darkening (smoke in outer regions)
  color = mix(color, smoke, depth * 0.3);
  
  return color;
}

void main() {
  if (u_intensity < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  
  // Ray setup
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  
  // Camera ray in view space
  vec3 ro = vec3(0.0, 0.0, 3.0);  // Simple camera position
  vec3 rd = normalize(vec3(uv, -1.5));
  
  // Transform to world space (simplified — explosion at origin)
  vec3 explosionCenter = u_explosionPos;
  
  // Raymarch
  vec4 accum = vec4(0.0);
  float t = 0.0;
  
  for (int i = 0; i < MAX_STEPS; i++) {
    if (accum.a > 0.95) break;
    
    vec3 p = ro + rd * t - explosionCenter;
    float density = explosionDensity(p, u_time);
    
    if (density > 0.01) {
      float depthFactor = t / (float(MAX_STEPS) * STEP_SIZE);
      vec3 col = fireColor(density, depthFactor);
      
      // Beer-Lambert absorption
      float absorption = density * DENSITY_SCALE * STEP_SIZE;
      
      // Accumulate
      accum.rgb += col * absorption * (1.0 - accum.a);
      accum.a += absorption * (1.0 - accum.a);
    }
    
    t += STEP_SIZE;
  }
  
  // HDR bloom simulation
  accum.rgb *= 1.0 + accum.a * 0.5;
  
  // Premultiplied alpha output
  gl_FragColor = vec4(accum.rgb * accum.a, accum.a);
}
`;

export class ExplosionEffect {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private scene: THREE.Scene | null = null;
  
  // Explosion state
  private active = false;
  private startTime = 0;
  private duration = 2.0;
  private position = new THREE.Vector3(0, 0, 0);
  
  // Beat trigger state
  private lastBeat = 0;
  private beatCooldown = 0.5; // Minimum seconds between explosions
  private lastTriggerTime = 0;
  
  constructor() {
    // Full-screen quad geometry
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        u_time: { value: 0 },
        u_intensity: { value: 0 },
        u_radius: { value: 0.5 },
        u_turbulence: { value: 0.3 },
        u_speed: { value: 1.0 },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_explosionPos: { value: new THREE.Vector3(0, 0, 0) },
        u_viewMatrix: { value: new THREE.Matrix4() },
        u_projMatrix: { value: new THREE.Matrix4() },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 100; // Render on top
    this.mesh.visible = false;
  }
  
  /** Add to a Three.js scene */
  attach(scene: THREE.Scene): void {
    this.scene = scene;
    scene.add(this.mesh);
  }
  
  /** Remove from scene */
  detach(): void {
    if (this.scene) {
      this.scene.remove(this.mesh);
      this.scene = null;
    }
  }
  
  /** Trigger an explosion at a position */
  trigger(position?: THREE.Vector3): void {
    this.active = true;
    this.startTime = performance.now() / 1000;
    this.position.copy(position || new THREE.Vector3(0, 0, 0));
    this.mesh.visible = true;
  }
  
  /** Update explosion state. Call every frame. */
  update(
    time: number,
    beat: number,
    resolution: THREE.Vector2,
    camera?: THREE.Camera,
  ): void {
    // Check for beat trigger
    const now = performance.now() / 1000;
    const manualIntensity = controls.get('explosionIntensity', 0);
    
    // Trigger on beat spike OR manual intensity > 0
    if (manualIntensity > 0.1 && !this.active) {
      this.trigger();
    } else if (beat > 0.8 && this.lastBeat < 0.5 && now - this.lastTriggerTime > this.beatCooldown) {
      // Random position near center
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 2 - 5, // In front of camera
      );
      this.trigger(pos);
      this.lastTriggerTime = now;
    }
    this.lastBeat = beat;
    
    // Update explosion
    if (!this.active) {
      this.mesh.visible = false;
      return;
    }
    
    const elapsed = now - this.startTime;
    const speed = controls.get('explosionSpeed', 1);
    
    // Check if explosion is complete
    if (elapsed * speed > this.duration) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    
    // Update uniforms
    const u = this.material.uniforms;
    u.u_time.value = elapsed;
    u.u_intensity.value = Math.max(manualIntensity, 1.0);
    u.u_radius.value = controls.get('explosionRadius', 0.5);
    u.u_turbulence.value = controls.get('turbulence', 0.3);
    u.u_speed.value = speed;
    u.u_resolution.value.copy(resolution);
    u.u_explosionPos.value.copy(this.position);
    
    if (camera) {
      u.u_viewMatrix.value.copy(camera.matrixWorldInverse);
      u.u_projMatrix.value.copy(camera.projectionMatrix);
    }
    
    this.mesh.visible = true;
  }
  
  dispose(): void {
    this.detach();
    this.material.dispose();
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
  }
}

// Singleton for easy access
let instance: ExplosionEffect | null = null;

export function getExplosionEffect(): ExplosionEffect {
  if (!instance) {
    instance = new ExplosionEffect();
  }
  return instance;
}

export function disposeExplosionEffect(): void {
  instance?.dispose();
  instance = null;
}
