// Post-processing pipeline — renders scene to FBO then applies fullscreen effects
// Bloom, trails, kaleidoscope, color cycling, chromatic aberration

const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const POST_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_prev;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;
uniform vec2 u_resolution;

out vec4 fragColor;

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

void main() {
  vec2 uv = v_uv;
  float chaos = 1.0 - u_coherence;

  // === Kaleidoscope (low coherence < 0.4) ===
  float kAmount = smoothstep(0.4, 0.1, u_coherence);
  if (kAmount > 0.01) {
    vec2 kp = uv - 0.5;
    float angle = atan(kp.y, kp.x);
    float radius = length(kp);
    float segments = 6.0;
    angle = mod(angle, 3.14159 * 2.0 / segments);
    angle = abs(angle - 3.14159 / segments);
    // Rotate with audio
    angle += u_time * 0.1 * u_high;
    vec2 kuv = vec2(cos(angle), sin(angle)) * radius + 0.5;
    uv = mix(uv, kuv, kAmount);
  }

  // === Chromatic aberration (on beats, more at low coherence) ===
  float caAmount = u_beat * (0.002 + chaos * 0.008);
  vec2 caDir = normalize(uv - 0.5 + 0.001) * caAmount;
  float r = texture(u_scene, uv + caDir).r;
  float g = texture(u_scene, uv).g;
  float b = texture(u_scene, uv - caDir).b;
  vec3 col = vec3(r, g, b);

  // === Bloom (bright areas glow, scales with audio) ===
  float bloomStrength = 0.15 + chaos * 0.3 + u_bass * 0.2;
  vec3 bloom = vec3(0.0);
  float total = 0.0;
  vec2 texel = 1.0 / u_resolution;
  for (float i = -3.0; i <= 3.0; i++) {
    for (float j = -3.0; j <= 3.0; j++) {
      float w = exp(-(i*i + j*j) / 8.0);
      vec3 s = texture(u_scene, uv + vec2(i, j) * texel * 3.0).rgb;
      // Only bloom bright parts
      float lum = dot(s, vec3(0.299, 0.587, 0.114));
      bloom += s * w * smoothstep(0.4, 1.0, lum);
      total += w;
    }
  }
  bloom /= total;
  col += bloom * bloomStrength;

  // === Frame feedback / trails with UV warp (TouchDesigner-style melt) ===
  float trailAmount = smoothstep(0.8, 0.3, u_coherence) * 0.7;
  if (trailAmount > 0.01) {
    // Warp UV when sampling previous frame for feedback
    vec2 fbUV = v_uv;
    float warpIntensity = chaos; // high chaos = trippy melt, high coherence = clean

    // Bass drives radial zoom (UV pulls toward/away from center)
    vec2 toCenter = fbUV - 0.5;
    float radialZoom = 1.0 + u_bass * 0.015 * warpIntensity;
    fbUV = 0.5 + toCenter * radialZoom;

    // Mid drives rotation
    float rotAngle = u_mid * 0.02 * warpIntensity;
    float cs = cos(rotAngle), sn = sin(rotAngle);
    vec2 centered = fbUV - 0.5;
    fbUV = vec2(centered.x * cs - centered.y * sn, centered.x * sn + centered.y * cs) + 0.5;

    vec3 prev = texture(u_prev, fbUV).rgb;
    col = mix(col, max(col, prev * 0.95), trailAmount);
  }

  // === Color cycling (hue rotation breathing with audio) ===
  float cycleAmount = chaos * 0.3;
  if (cycleAmount > 0.01) {
    vec3 hsv = rgb2hsv(col);
    hsv.x = fract(hsv.x + sin(u_time * 0.5) * cycleAmount + u_bass * 0.05);
    col = hsv2rgb(hsv);
  }

  // === Glitch effects (digital, driven by beat * chaos) ===
  float glitchAmount = u_beat * chaos;
  if (glitchAmount > 0.05) {
    // Pseudo-random helpers
    float seed = floor(u_time * 12.0); // changes ~12x/sec for blocky feel
    float rnd1 = fract(sin(seed * 43758.5453) * 2183.5);
    float rnd2 = fract(sin(seed * 12345.678) * 4375.8);

    // Horizontal scanline displacement: random rows shift left/right
    float scanlineY = floor(uv.y * u_resolution.y / 3.0); // every 3 pixels
    float scanShift = fract(sin(scanlineY * 91.2 + seed * 47.3) * 4758.5) - 0.5;
    float scanMask = step(0.92 - chaos * 0.3, fract(sin(scanlineY * 173.1 + seed) * 2847.3));
    vec2 scanUV = uv + vec2(scanShift * 0.03 * glitchAmount * scanMask, 0.0);

    // RGB channel separation (blocky/digital — separate from smooth CA)
    float rgbSplit = glitchAmount * 0.01;
    float splitR = texture(u_scene, scanUV + vec2(rgbSplit, 0.0)).r;
    float splitB = texture(u_scene, scanUV - vec2(rgbSplit, 0.0)).b;
    col.r = mix(col.r, splitR, glitchAmount * 0.5);
    col.b = mix(col.b, splitB, glitchAmount * 0.5);

    // Block glitch: rectangular regions randomly offset
    float blockY = floor(uv.y * 8.0 + seed);
    float blockX = floor(uv.x * 12.0 + seed * 0.7);
    float blockRnd = fract(sin(blockY * 341.2 + blockX * 132.7 + seed * 78.3) * 5765.3);
    if (blockRnd > 1.0 - chaos * 0.15) {
      vec2 blockOffset = vec2(
        (fract(sin(blockY * 754.3 + seed) * 3425.7) - 0.5) * 0.06,
        0.0
      ) * glitchAmount;
      col = mix(col, texture(u_scene, uv + blockOffset).rgb, glitchAmount * 0.4);
    }

    // VHS-style noise lines
    float noiseLine = fract(sin(uv.y * u_resolution.y * 0.5 + u_time * 200.0) * 43758.5);
    float vhsMask = step(0.97 - chaos * 0.05, noiseLine);
    col += vec3(vhsMask * 0.08 * glitchAmount);
  }

  // Clamp output
  col = clamp(col, 0.0, 1.0);

  fragColor = vec4(col, 1.0);
}
`;

export class PostProcessor {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  // Ping-pong FBOs for scene rendering and feedback
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private prevFbo: WebGLFramebuffer | null = null;
  private prevTexture: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  // Depth/stencil renderbuffer for scene FBO
  private depthRb: WebGLRenderbuffer | null = null;

  init(gl: WebGL2RenderingContext): void {
    this.gl = gl;

    // Build post-process program
    this.program = this.buildProgram(gl, QUAD_VERT, POST_FRAG);
    if (!this.program) return;

    const names = [
      'u_scene', 'u_prev', 'u_time', 'u_bass', 'u_mid',
      'u_high', 'u_beat', 'u_coherence', 'u_resolution',
    ];
    for (const n of names) {
      this.uniforms[n] = gl.getUniformLocation(this.program, n);
    }

    // Build fullscreen quad VAO
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.ensureFbos();
  }

  /** Call before rendering the 3D scene — binds the scene FBO */
  beginScene(): void {
    const gl = this.gl;
    if (!gl) return;
    this.ensureFbos();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Call after rendering the 3D scene — applies post-processing to screen */
  endScene(opts: {
    time: number;
    bass: number;
    mid: number;
    high: number;
    beat: number;
    coherence: number;
  }): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    // Render post-process to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    gl.useProgram(this.program);

    // Bind scene texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    if (this.uniforms.u_scene) gl.uniform1i(this.uniforms.u_scene, 0);

    // Bind previous frame
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTexture);
    if (this.uniforms.u_prev) gl.uniform1i(this.uniforms.u_prev, 1);

    // Set uniforms
    const u = this.uniforms;
    if (u.u_time) gl.uniform1f(u.u_time, opts.time);
    if (u.u_bass) gl.uniform1f(u.u_bass, opts.bass);
    if (u.u_mid) gl.uniform1f(u.u_mid, opts.mid);
    if (u.u_high) gl.uniform1f(u.u_high, opts.high);
    if (u.u_beat) gl.uniform1f(u.u_beat, opts.beat);
    if (u.u_coherence) gl.uniform1f(u.u_coherence, opts.coherence);
    if (u.u_resolution) gl.uniform2f(u.u_resolution, this.fboWidth, this.fboHeight);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // Re-enable depth for next frame's scene pass
    gl.enable(gl.DEPTH_TEST);

    // Copy current output to prevTexture for next frame's feedback
    this.swapPrev();
  }

  private swapPrev(): void {
    const gl = this.gl;
    if (!gl || !this.sceneFbo || !this.prevFbo) return;

    // Blit scene FBO to prev FBO
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.sceneFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.prevFbo);
    gl.blitFramebuffer(
      0, 0, this.fboWidth, this.fboHeight,
      0, 0, this.fboWidth, this.fboHeight,
      gl.COLOR_BUFFER_BIT, gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  private ensureFbos(): void {
    const gl = this.gl;
    if (!gl) return;

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w === this.fboWidth && h === this.fboHeight && this.sceneFbo) return;

    this.fboWidth = w;
    this.fboHeight = h;

    // Cleanup old
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    if (this.sceneTexture) gl.deleteTexture(this.sceneTexture);
    if (this.prevFbo) gl.deleteFramebuffer(this.prevFbo);
    if (this.prevTexture) gl.deleteTexture(this.prevTexture);
    if (this.depthRb) gl.deleteRenderbuffer(this.depthRb);

    // Scene FBO
    this.sceneTexture = this.createTexture(gl, w, h);
    this.sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);

    // Depth renderbuffer for scene
    this.depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);

    // Prev FBO (for feedback)
    this.prevTexture = this.createTexture(gl, w, h);
    this.prevFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prevFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.prevTexture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private buildProgram(gl: WebGL2RenderingContext, vSrc: string, fSrc: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vSrc);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('PostProcess link failed:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('PostProcess shader compile:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
}
