// Three.js post-processing pipeline — optimized single-pass architecture
// EffectComposer with merged effects + bloom (no feedback iterations)

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Merged post-process shader (kaleidoscope, feedback, CA, glitch, color cycle, DMT)
// Single pass replaces CombinedShader + DMTShader + feedback iterations
// ---------------------------------------------------------------------------

const MergedShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    u_prev: { value: null as THREE.Texture | null },
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_beat: { value: 0 },
    u_coherence: { value: 1 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
    u_demonTotal: { value: 0 },
    u_chakraTotal: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    varying vec2 v_uv;

    uniform sampler2D tDiffuse;
    uniform sampler2D u_prev;
    uniform float u_time;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_beat;
    uniform float u_coherence;
    uniform vec2 u_resolution;
    uniform float u_demonTotal;
    uniform float u_chakraTotal;

    const float PI = 3.14159265;
    const float TAU = 6.28318530;

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec2 rotateUV(vec2 p, float a) {
      float cs = cos(a), sn = sin(a);
      return vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    }

    mat2 rot(float a) {
      float c = cos(a), s = sin(a);
      return mat2(c, -s, s, c);
    }

    float hexDist(vec2 p) {
      p = abs(p);
      return max(p.x * 0.866 + p.y * 0.5, p.y);
    }

    float flowerOfLife(vec2 p, float scale) {
      p *= scale;
      float d = abs(length(p) - 1.0);
      for (float i = 0.0; i < 6.0; i++) {
        float a = i * TAU / 6.0;
        vec2 c = vec2(cos(a), sin(a));
        d = min(d, abs(length(p - c) - 1.0));
      }
      // Skip second ring (was 12 more trig ops) — use first ring only
      return smoothstep(0.06, 0.0, d / scale);
    }

    float mandala(vec2 p, float time, float bass) {
      float r = length(p);
      float a = atan(p.y, p.x);
      float d = 0.0;
      // Reduced from 5 to 3 iterations
      for (float i = 1.0; i < 4.0; i++) {
        float ringR = i * 0.15 * (1.0 + bass * 0.3);
        float ring = abs(r - ringR);
        ring = smoothstep(0.01, 0.0, ring);
        float segments = i * 4.0;
        float pattern = sin(a * segments + time * (1.0 + i * 0.3)) * 0.5 + 0.5;
        d += ring * pattern;
      }
      return d;
    }

    void main() {
      vec2 uv = v_uv;
      float chaos = 1.0 - u_coherence;

      // 1. Sample scene
      vec3 col = texture2D(tDiffuse, uv).rgb;

      // 2. Kaleidoscope (low coherence < 0.4)
      float kAmount = smoothstep(0.4, 0.1, u_coherence);
      if (kAmount > 0.01) {
        vec2 kp = uv - 0.5;
        float angle = atan(kp.y, kp.x);
        float radius = length(kp);
        float segments = 6.0;
        angle = mod(angle, TAU / segments);
        angle = abs(angle - PI / segments);
        angle += u_time * 0.1 * u_high;
        vec2 kuv = vec2(cos(angle), sin(angle)) * radius + 0.5;
        vec2 warpedUV = mix(uv, kuv, kAmount);
        col = texture2D(tDiffuse, warpedUV).rgb;
        uv = warpedUV;
      }

      // 3. Feedback — single sample (no iterations, no mini-composer)
      float trailAmount = smoothstep(0.8, 0.3, u_coherence) * 0.7 * (1.0 - u_chakraTotal * 0.5);
      if (trailAmount > 0.01) {
        float warp = chaos;
        float zoom = 0.98 - u_bass * 0.02 * warp;
        zoom = mix(zoom, 1.02 + u_bass * 0.01 * warp, u_beat * warp);

        vec2 centered = uv - 0.5;
        vec3 prev = texture2D(u_prev, 0.5 + centered * zoom).rgb;
        prev *= 0.95;
        col = mix(col, max(col, prev), trailAmount);
      }

      // 4. Chromatic aberration (beat-driven)
      float caAmount = u_beat * (0.002 + chaos * 0.008);
      if (caAmount > 0.0001) {
        vec2 caDir = normalize(uv - 0.5 + 0.001) * caAmount;
        col.r = mix(col.r, texture2D(tDiffuse, uv + caDir).r, 0.5 + chaos * 0.5);
        col.b = mix(col.b, texture2D(tDiffuse, uv - caDir).b, 0.5 + chaos * 0.5);
      }

      // 5. Glitch (beat * chaos driven)
      float glitchAmount = u_beat * chaos;
      if (glitchAmount > 0.05) {
        float seed = floor(u_time * 12.0);
        float scanlineY = floor(uv.y * u_resolution.y / 3.0);
        float scanShift = fract(sin(scanlineY * 91.2 + seed * 47.3) * 4758.5) - 0.5;
        float scanMask = step(0.92 - chaos * 0.3, fract(sin(scanlineY * 173.1 + seed) * 2847.3));
        vec2 scanUV = uv + vec2(scanShift * 0.03 * glitchAmount * scanMask, 0.0);

        float rgbSplit = glitchAmount * 0.01;
        col.r = mix(col.r, texture2D(tDiffuse, scanUV + vec2(rgbSplit, 0.0)).r, glitchAmount * 0.5);
        col.b = mix(col.b, texture2D(tDiffuse, scanUV - vec2(rgbSplit, 0.0)).b, glitchAmount * 0.5);

        // Block glitch
        float blockY = floor(uv.y * 8.0 + seed);
        float blockX = floor(uv.x * 12.0 + seed * 0.7);
        float blockRnd = fract(sin(blockY * 341.2 + blockX * 132.7 + seed * 78.3) * 5765.3);
        if (blockRnd > 1.0 - chaos * 0.15) {
          vec2 blockOffset = vec2(
            (fract(sin(blockY * 754.3 + seed) * 3425.7) - 0.5) * 0.06,
            0.0
          ) * glitchAmount;
          col = mix(col, texture2D(tDiffuse, uv + blockOffset).rgb, glitchAmount * 0.4);
        }

        // VHS noise
        float noiseLine = fract(sin(uv.y * u_resolution.y * 0.5 + u_time * 200.0) * 43758.5);
        col += vec3(step(0.97 - chaos * 0.05, noiseLine) * 0.08 * glitchAmount);
      }

      // 6. Color cycling
      float cycleAmount = chaos * 0.3;
      if (cycleAmount > 0.01) {
        vec3 hsv = rgb2hsv(col);
        hsv.x = fract(hsv.x + sin(u_time * 0.5) * cycleAmount + u_bass * 0.05);
        col = hsv2rgb(hsv);
      }

      // 7. DMT Sacred Geometry (merged — was separate pass)
      float dmtActivation = max(smoothstep(0.5, 0.15, u_coherence), u_demonTotal * 0.8);
      if (dmtActivation > 0.01) {
        vec2 p = (v_uv - 0.5) * 2.0;
        p.x *= u_resolution.x / u_resolution.y;

        float t = u_time;
        vec3 dmtCol = vec3(0.0);

        float rotSpeed = u_high * 0.5 + 0.1;
        p = p * rot(t * rotSpeed * 0.3);

        float scalePulse = 1.0 + u_bass * 0.3 + u_beat * 0.2;
        vec2 sp = p / scalePulse;

        // Flower of Life
        float fol = flowerOfLife(sp, 2.5 + sin(t * 0.3) * 0.5);
        vec3 folCol = vec3(0.3, 0.1, 0.6) + vec3(0.2, 0.3, 0.1) * sin(t * 0.7);
        dmtCol += folCol * fol * 0.6;

        // Mandala
        float mand = mandala(sp, t, u_bass);
        vec3 mandCol = vec3(0.1, 0.4, 0.6) + vec3(0.4, 0.1, 0.3) * cos(t * 0.5);
        dmtCol += mandCol * mand * 0.5;

        // Sacred hexagons
        vec2 hp = sp * (3.0 + u_mid * 2.0);
        hp = hp * rot(t * 0.1);
        float hex = hexDist(fract(hp) - 0.5);
        float hexPattern = smoothstep(0.48, 0.45, hex) - smoothstep(0.43, 0.40, hex);
        vec3 hexCol = vec3(0.5, 0.2, 0.7) + vec3(0.2) * sin(t + hp.x);
        dmtCol += hexCol * hexPattern * 0.4;

        // Tunnel (very low coherence) — skip for perf unless needed
        float tunnelActivation = smoothstep(0.25, 0.05, u_coherence);
        if (tunnelActivation > 0.01) {
          float r = length(p);
          float a = atan(p.y, p.x);
          float z = 0.5 / (r + 0.01);
          vec2 tp = vec2(a / TAU * 6.0, (z - t * 0.5) * 4.0);
          float thex = hexDist(fract(tp) - 0.5);
          float hexLine = smoothstep(0.45, 0.42, thex);
          float fade = exp(-r * 1.5);
          float tun = hexLine * (1.0 - fade) * smoothstep(0.01, 0.1, r);
          vec3 tunCol = vec3(0.2, 0.5, 0.8) + vec3(0.3, 0.1, 0.2) * sin(t * 1.5);
          dmtCol += tunCol * tun * tunnelActivation * 0.7;
        }

        dmtCol += vec3(0.15, 0.1, 0.25) * u_beat;
        dmtCol *= dmtActivation;

        // Radial vignette
        float vignette = 1.0 - smoothstep(0.6, 1.5, length(p));
        dmtCol *= vignette;

        col += dmtCol;
      }

      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// ThreePostProcess — optimized pipeline
//
// Architecture: RenderPass → MergedPass → BloomPass (3 passes, no iterations)
// Feedback: single blit per frame (prev frame texture)
// ---------------------------------------------------------------------------

export class ThreePostProcess {
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private mergedPass!: ShaderPass;
  private prevTarget!: THREE.WebGLRenderTarget;
  private renderer!: THREE.WebGLRenderer;
  private width = 1;
  private height = 1;

  init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.width = renderer.domElement.clientWidth || 1;
    this.height = renderer.domElement.clientHeight || 1;

    // Feedback render target (previous frame)
    this.prevTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.composer = new EffectComposer(renderer);

    // 1. Render scene
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2. Merged effects (combined + DMT in one pass)
    this.mergedPass = new ShaderPass(MergedShader);
    this.mergedPass.uniforms['u_prev'].value = this.prevTarget.texture;
    this.composer.addPass(this.mergedPass);

    // 3. Bloom (half-res for performance)
    const halfW = Math.max(1, Math.floor(this.width / 2));
    const halfH = Math.max(1, Math.floor(this.height / 2));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(halfW, halfH),
      0.5, 0.4, 0.85,
    );
    this.bloomPass.renderToScreen = true;
    this.composer.addPass(this.bloomPass);
  }

  render(opts: {
    time: number;
    bass: number;
    mid: number;
    high: number;
    beat: number;
    coherence: number;
    demonTotal?: number;
    chakraTotal?: number;
  }): void {
    // Set uniforms on merged pass
    const u = this.mergedPass.uniforms;
    u['u_time'].value = opts.time;
    u['u_bass'].value = opts.bass;
    u['u_mid'].value = opts.mid;
    u['u_high'].value = opts.high;
    u['u_beat'].value = opts.beat;
    u['u_coherence'].value = opts.coherence;
    u['u_resolution'].value.set(this.width, this.height);
    u['u_prev'].value = this.prevTarget.texture;
    u['u_demonTotal'].value = opts.demonTotal ?? 0;
    u['u_chakraTotal'].value = opts.chakraTotal ?? 0;

    // Bloom params
    const chaos = 1.0 - opts.coherence;
    const demonTotal = opts.demonTotal ?? 0;
    this.bloomPass.strength = Math.min(0.6, 0.2 + chaos * 0.3 + demonTotal * 0.5 + opts.bass * 0.15);
    this.bloomPass.threshold = 0.92;

    // Single render pass — no iterations
    this.composer.render();

    // Blit to prevTarget for next frame's feedback
    this.blitToPrev();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer.setSize(width, height);
    this.prevTarget.setSize(width, height);
    const halfW = Math.max(1, Math.floor(width / 2));
    const halfH = Math.max(1, Math.floor(height / 2));
    this.bloomPass.resolution.set(halfW, halfH);
  }

  // Reusable blit resources
  private copyMaterial: THREE.ShaderMaterial | null = null;
  private copyScene: THREE.Scene | null = null;
  private copyCamera: THREE.Camera | null = null;

  private blitToPrev(): void {
    if (!this.copyMaterial) {
      this.copyMaterial = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
      this.copyScene = new THREE.Scene();
      this.copyScene.add(quad);
      this.copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    this.copyMaterial.uniforms.tDiffuse.value = this.composer.readBuffer.texture;
    this.renderer.setRenderTarget(this.prevTarget);
    this.renderer.render(this.copyScene!, this.copyCamera!);
    this.renderer.setRenderTarget(null);
  }
}
