// Three.js post-processing pipeline — replaces postprocess.ts and dmt.ts
// EffectComposer with feedback, glitch, DMT sacred geometry, bloom

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Combined post-process shader (kaleidoscope, feedback, CA, glitch, color cycle)
// ---------------------------------------------------------------------------

const CombinedShader = {
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
    u_iteration: { value: 0 },
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
    uniform int u_iteration;

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
        angle = mod(angle, 3.14159 * 2.0 / segments);
        angle = abs(angle - 3.14159 / segments);
        angle += u_time * 0.1 * u_high;
        vec2 kuv = vec2(cos(angle), sin(angle)) * radius + 0.5;
        vec2 warpedUV = mix(uv, kuv, kAmount);
        col = texture2D(tDiffuse, warpedUV).rgb;
        uv = warpedUV;
      }

      // 3. Fractal feedback / infinite regression
      float trailAmount = smoothstep(0.8, 0.3, u_coherence) * 0.7;
      if (trailAmount > 0.01) {
        float warp = chaos;

        float zoomIn = 0.98 - u_bass * 0.02 * warp;
        float zoomOut = 1.02 + u_bass * 0.01 * warp;
        float beatFlip = u_beat * warp;
        zoomIn = mix(zoomIn, zoomOut, beatFlip);
        zoomOut = mix(zoomOut, 0.97, beatFlip);

        float spiralAngle = (0.01 + u_mid * 0.04) * warp;
        float layerBlend = 0.5 + u_high * 0.5;

        vec2 fbUV = uv;
        float wave = sin(fbUV.y * 20.0 + u_time * 2.0) * 0.003 * chaos;
        float wave2 = sin(fbUV.x * 15.0 + u_time * 1.5) * 0.002 * chaos;
        fbUV += vec2(wave, wave2);

        vec2 centered = fbUV - 0.5;
        vec3 prev0 = texture2D(u_prev, fbUV).rgb;
        vec2 uvZoomIn = 0.5 + centered * zoomIn;
        vec3 prev1 = texture2D(u_prev, uvZoomIn).rgb;
        vec2 uvZoomOut = 0.5 + centered * zoomOut;
        vec3 prev2 = texture2D(u_prev, uvZoomOut).rgb;
        vec2 uvSpiral = 0.5 + rotateUV(centered, spiralAngle);
        vec3 prev3 = texture2D(u_prev, uvSpiral).rgb;

        float w0 = 0.25;
        float w1 = 0.40;
        float w2 = 0.15 * layerBlend;
        float w3 = 0.20 * layerBlend;
        float wTotal = w0 + w1 + w2 + w3;

        vec3 prevBlend = (prev0 * w0 + prev1 * w1 + prev2 * w2 + prev3 * w3) / wTotal;
        prevBlend *= 0.95;

        float iterFade = 1.0 / (1.0 + float(u_iteration) * 0.3);
        float feedbackMix = trailAmount * iterFade;
        col = mix(col, max(col, prevBlend), feedbackMix);
      }

      // 4. Chromatic aberration (beat-driven, applied to current col via re-sampling)
      float caAmount = u_beat * (0.002 + chaos * 0.008);
      if (caAmount > 0.0001) {
        vec2 caDir = normalize(uv - 0.5 + 0.001) * caAmount;
        // Re-sample the input at offset UVs for R and B channels
        // This captures all prior effects (kaleidoscope, feedback) since they modified uv
        vec3 colR = texture2D(tDiffuse, uv + caDir).rgb;
        vec3 colB = texture2D(tDiffuse, uv - caDir).rgb;
        col.r = mix(col.r, colR.r, 0.5 + chaos * 0.5);
        col.b = mix(col.b, colB.b, 0.5 + chaos * 0.5);
      }

      // 5. Glitch (digital, beat * chaos driven)
      float glitchAmount = u_beat * chaos;
      if (glitchAmount > 0.05) {
        float seed = floor(u_time * 12.0);

        // Horizontal scanline displacement
        float scanlineY = floor(uv.y * u_resolution.y / 3.0);
        float scanShift = fract(sin(scanlineY * 91.2 + seed * 47.3) * 4758.5) - 0.5;
        float scanMask = step(0.92 - chaos * 0.3, fract(sin(scanlineY * 173.1 + seed) * 2847.3));
        vec2 scanUV = uv + vec2(scanShift * 0.03 * glitchAmount * scanMask, 0.0);

        // RGB channel separation
        float rgbSplit = glitchAmount * 0.01;
        float splitR = texture2D(tDiffuse, scanUV + vec2(rgbSplit, 0.0)).r;
        float splitB = texture2D(tDiffuse, scanUV - vec2(rgbSplit, 0.0)).b;
        col.r = mix(col.r, splitR, glitchAmount * 0.5);
        col.b = mix(col.b, splitB, glitchAmount * 0.5);

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
        float vhsMask = step(0.97 - chaos * 0.05, noiseLine);
        col += vec3(vhsMask * 0.08 * glitchAmount);
      }

      // 6. Color cycling (hue rotation)
      float cycleAmount = chaos * 0.3;
      if (cycleAmount > 0.01) {
        vec3 hsv = rgb2hsv(col);
        hsv.x = fract(hsv.x + sin(u_time * 0.5) * cycleAmount + u_bass * 0.05);
        col = hsv2rgb(hsv);
      }

      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// DMT Sacred Geometry shader (additive overlay)
// ---------------------------------------------------------------------------

const DMTShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    u_time: { value: 0 },
    u_bass: { value: 0 },
    u_mid: { value: 0 },
    u_high: { value: 0 },
    u_beat: { value: 0 },
    u_coherence: { value: 1 },
    u_resolution: { value: new THREE.Vector2(1, 1) },
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
    uniform float u_time;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_beat;
    uniform float u_coherence;
    uniform vec2 u_resolution;

    const float PI = 3.14159265;
    const float TAU = 6.28318530;

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
      float d = 1e9;
      d = min(d, abs(length(p) - 1.0));
      for (float i = 0.0; i < 6.0; i++) {
        float a = i * TAU / 6.0;
        vec2 c = vec2(cos(a), sin(a));
        d = min(d, abs(length(p - c) - 1.0));
      }
      for (float i = 0.0; i < 6.0; i++) {
        float a = i * TAU / 6.0 + TAU / 12.0;
        vec2 c = vec2(cos(a), sin(a)) * 1.732;
        d = min(d, abs(length(p - c) - 1.0));
      }
      return smoothstep(0.06, 0.0, d / scale);
    }

    float mandala(vec2 p, float time, float bass) {
      float r = length(p);
      float a = atan(p.y, p.x);
      float d = 0.0;
      for (float i = 1.0; i < 6.0; i++) {
        float ringR = i * 0.15 * (1.0 + bass * 0.3);
        float ring = abs(r - ringR);
        ring = smoothstep(0.01, 0.0, ring);
        float segments = i * 4.0;
        float pattern = sin(a * segments + time * (1.0 + i * 0.3)) * 0.5 + 0.5;
        d += ring * pattern;
      }
      return d;
    }

    float tunnel(vec2 p, float time) {
      float r = length(p);
      float a = atan(p.y, p.x);
      float z = 0.5 / (r + 0.01);
      float tunnelU = a / TAU;
      float tunnelV = z - time * 0.5;
      vec2 tp = vec2(tunnelU * 6.0, tunnelV * 4.0);
      float hex = hexDist(fract(tp) - 0.5);
      float hexLine = smoothstep(0.45, 0.42, hex);
      float fade = exp(-r * 1.5);
      return hexLine * (1.0 - fade) * smoothstep(0.01, 0.1, r);
    }

    void main() {
      vec4 sceneCol = texture2D(tDiffuse, v_uv);

      vec2 p = (v_uv - 0.5) * 2.0;
      p.x *= u_resolution.x / u_resolution.y;

      float chaos = 1.0 - u_coherence;
      float t = u_time;

      float activation = smoothstep(0.5, 0.15, u_coherence);
      if (activation < 0.01) {
        gl_FragColor = sceneCol;
        return;
      }

      vec3 col = vec3(0.0);

      float rotSpeed = u_high * 0.5 + 0.1;
      p = p * rot(t * rotSpeed * 0.3);

      float scalePulse = 1.0 + u_bass * 0.3 + u_beat * 0.2;
      vec2 sp = p / scalePulse;

      // Flower of Life
      float fol = flowerOfLife(sp, 2.5 + sin(t * 0.3) * 0.5);
      vec3 folCol = vec3(0.3, 0.1, 0.6) + vec3(0.2, 0.3, 0.1) * sin(t * 0.7);
      col += folCol * fol * 0.6;

      // Mandala
      float mand = mandala(sp, t, u_bass);
      vec3 mandCol = vec3(0.1, 0.4, 0.6) + vec3(0.4, 0.1, 0.3) * cos(t * 0.5);
      col += mandCol * mand * 0.5;

      // Sacred hexagons
      vec2 hp = sp * (3.0 + u_mid * 2.0);
      hp = hp * rot(t * 0.1);
      float hex = hexDist(fract(hp) - 0.5);
      float hexPattern = smoothstep(0.48, 0.45, hex) - smoothstep(0.43, 0.40, hex);
      vec3 hexCol = vec3(0.5, 0.2, 0.7) + vec3(0.2) * sin(t + hp.x);
      col += hexCol * hexPattern * 0.4;

      // Tunnel (very low coherence)
      float tunnelActivation = smoothstep(0.25, 0.05, u_coherence);
      if (tunnelActivation > 0.01) {
        float tun = tunnel(p * 0.8, t);
        vec3 tunCol = vec3(0.2, 0.5, 0.8) + vec3(0.3, 0.1, 0.2) * sin(t * 1.5);
        col += tunCol * tun * tunnelActivation * 0.7;
      }

      // Beat flash
      col += vec3(0.15, 0.1, 0.25) * u_beat;

      col *= activation;

      // Radial vignette
      float vignette = 1.0 - smoothstep(0.6, 1.5, length(p));
      col *= vignette;

      // Additive blend with scene
      gl_FragColor = vec4(sceneCol.rgb + col, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------
// ThreePostProcess — public API
//
// Architecture:
// - Main composer: RenderPass → CombinedPass → DMTPass → BloomPass (renderToScreen)
// - Feedback: after each frame, blit the bloom output to prevTarget for next frame
// - Multi-pass feedback: for iterations > 0, run a separate feedback-only composer
//   (no RenderPass — scene only renders once) that re-applies CombinedPass
// ---------------------------------------------------------------------------

// Passthrough shader for copying textures
const CopyShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
  `,
};

export class ThreePostProcess {
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private combinedPass!: ShaderPass;
  private dmtPass!: ShaderPass;
  private prevTarget!: THREE.WebGLRenderTarget;
  private renderer!: THREE.WebGLRenderer;
  private width = 1;
  private height = 1;

  // For multi-pass: a separate mini-composer without RenderPass
  private feedbackComposer!: EffectComposer;
  private feedbackInputPass!: ShaderPass;
  private feedbackCombinedPass!: ShaderPass;

  init(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.width = renderer.domElement.clientWidth || 1;
    this.height = renderer.domElement.clientHeight || 1;

    // Feedback render target (stores previous frame)
    this.prevTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    // ── Main composer: scene → effects → screen ──
    this.composer = new EffectComposer(renderer);

    // 1. Render scene (only runs once per frame)
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2. Combined effects (feedback, kaleidoscope, CA, glitch, color cycling)
    this.combinedPass = new ShaderPass(CombinedShader);
    this.combinedPass.uniforms['u_prev'].value = this.prevTarget.texture;
    this.composer.addPass(this.combinedPass);

    // 3. DMT sacred geometry overlay
    this.dmtPass = new ShaderPass(DMTShader);
    this.composer.addPass(this.dmtPass);

    // 4. Bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.5, 0.4, 0.85,
    );
    this.composer.addPass(this.bloomPass);

    // 5. Final output pass (renders to screen; we grab readBuffer before this for feedback)
    const outputPass = new ShaderPass(CopyShader);
    outputPass.renderToScreen = true;
    this.composer.addPass(outputPass);

    // ── Feedback-only mini-composer (for multi-pass iterations > 0) ──
    // No RenderPass — takes the previous output as input texture
    this.feedbackComposer = new EffectComposer(renderer);

    // Input: copy from main composer's output
    this.feedbackInputPass = new ShaderPass(CopyShader);
    this.feedbackComposer.addPass(this.feedbackInputPass);

    // Re-apply combined effects (shares uniform values, separate instance)
    this.feedbackCombinedPass = new ShaderPass(CombinedShader);
    this.feedbackCombinedPass.uniforms['u_prev'].value = this.prevTarget.texture;
    this.feedbackComposer.addPass(this.feedbackCombinedPass);

    // Feedback iterations skip bloom (it's subtle per-iteration and saves perf)
    // The final main pass already has bloom applied.
    // Output to screen on the last feedback iteration
    const feedbackOutput = new ShaderPass(CopyShader);
    feedbackOutput.renderToScreen = true;
    this.feedbackComposer.addPass(feedbackOutput);
  }

  render(opts: {
    time: number;
    bass: number;
    mid: number;
    high: number;
    beat: number;
    coherence: number;
  }): void {
    const chaos = 1.0 - opts.coherence;
    const iterations = Math.max(1, Math.min(3, Math.round(1 + chaos * 2)));

    // Set uniforms on main combined pass
    this.setEffectUniforms(this.combinedPass, opts, 0);

    // DMT uniforms
    const du = this.dmtPass.uniforms;
    du['u_time'].value = opts.time;
    du['u_bass'].value = opts.bass;
    du['u_mid'].value = opts.mid;
    du['u_high'].value = opts.high;
    du['u_beat'].value = opts.beat;
    du['u_coherence'].value = opts.coherence;
    du['u_resolution'].value.set(this.width, this.height);

    // Bloom params
    this.bloomPass.strength = 0.3 + chaos * 0.5 + opts.bass * 0.3;
    this.bloomPass.threshold = 0.85 - chaos * 0.2;

    // ── Pass 1: Full render (scene + all effects) ──
    this.composer.render();

    // Save the output to prevTarget for feedback
    this.blitToPrev();

    // ── Passes 2+: Feedback-only (no scene re-render) ──
    for (let i = 1; i < iterations; i++) {
      this.setEffectUniforms(this.feedbackCombinedPass, opts, i);

      // The prevTarget already has the last frame's output from blitToPrev above.
      // feedbackCombinedPass reads u_prev (= prevTarget.texture) and re-applies effects.
      this.feedbackComposer.render();

      // Save this iteration's output for the next iteration / next frame
      this.blitToPrevFromComposer(this.feedbackComposer);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer.setSize(width, height);
    this.feedbackComposer.setSize(width, height);
    this.prevTarget.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  // Reusable quad for copying to prevTarget
  private copyMaterial: THREE.ShaderMaterial | null = null;
  private copyQuad: THREE.Mesh | null = null;
  private copyScene: THREE.Scene | null = null;
  private copyCamera: THREE.Camera | null = null;

  /** Copy a composer's read buffer to prevTarget for feedback */
  private blitToPrevFromComposer(comp: EffectComposer): void {
    if (!this.copyMaterial) this.initCopyResources();
    this.copyMaterial!.uniforms.tDiffuse.value = comp.readBuffer.texture;
    this.renderer.setRenderTarget(this.prevTarget);
    this.renderer.render(this.copyScene!, this.copyCamera!);
    this.renderer.setRenderTarget(null);
  }

  private initCopyResources(): void {
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
    });
    this.copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyQuad);
    this.copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Copy the main composer's read buffer to prevTarget */
  private blitToPrev(): void {
    this.blitToPrevFromComposer(this.composer);
  }

  private setEffectUniforms(pass: ShaderPass, opts: {
    time: number; bass: number; mid: number; high: number; beat: number; coherence: number;
  }, iteration: number): void {
    const u = pass.uniforms;
    u['u_time'].value = opts.time;
    u['u_bass'].value = opts.bass;
    u['u_mid'].value = opts.mid;
    u['u_high'].value = opts.high;
    u['u_beat'].value = opts.beat;
    u['u_coherence'].value = opts.coherence;
    u['u_resolution'].value.set(this.width, this.height);
    u['u_prev'].value = this.prevTarget.texture;
    u['u_iteration'].value = iteration;
  }
}
