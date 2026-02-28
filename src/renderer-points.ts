// WebGL2 point cloud renderer with per-segment audio-reactive displacement

import type { PointCloudData } from './pointcloud';

const VERT = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;
in float a_segment; // audio category: 0-5 normalized to 0-1

uniform mat4 u_projection;
uniform mat4 u_view;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_band0; // sub-bass 20-60Hz
uniform float u_band1; // bass 60-250Hz
uniform float u_band2; // low-mid 250-500Hz
uniform float u_band3; // mid 500-2kHz
uniform float u_band4; // upper-mid 2-4kHz
uniform float u_band5; // presence 4-6kHz
uniform float u_band6; // brilliance 6-12kHz
uniform float u_band7; // air 12-20kHz
uniform float u_coherence;
uniform float u_pointScale;
uniform float u_transition;
uniform float u_form;
uniform float u_highlightCat; // -1 = none, 0-5 = highlight this category
uniform float u_projMode;    // 0 = planar, 1 = equirectangular sphere

out vec3 v_color;
out float v_alpha;
out float v_coherence;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);
  vec3 pos = a_position;

  // Depth factor: 1=close, 0=far
  float depthFactor;
  if (u_projMode > 0.5) {
    // Sphere mode: depth = distance from origin. Larger radius = closer to camera
    float radius = length(a_position);
    depthFactor = clamp((radius - 6.0) / 4.0, 0.0, 1.0); // 6=far, 10=close
  } else {
    // Planar mode: Z coordinate. Close = -3, Far = -9
    depthFactor = 1.0 - clamp((-a_position.z - 3.0) / 6.0, 0.0, 1.0);
  }

  float h1 = hash(idx);
  float h2 = hash(idx + 1000.0);
  float h3 = hash(idx + 2000.0);

  // Decode audio category from normalized segment value (0-1 → 0-5)
  int cat = int(a_segment * 5.0 + 0.5);

  // ── MASS MODEL ──
  // Heavy objects resist movement (anchors), light objects flow freely
  // Mass also increases with proximity (foreground = more solid)
  float baseMass = 1.0;
  if (cat == 0) baseMass = 5.0;       // BASS_SUBJECT: tigers, people — heavy, solid
  else if (cat == 1) baseMass = 1.5;   // MID_ORGANIC: trees, plants — medium, sways
  else if (cat == 2) baseMass = 0.3;   // HIGH_SKY: sky, clouds, fog — light, flows
  else if (cat == 3) baseMass = 8.0;   // BEAT_GROUND: ground, rocks — very heavy, anchors scene
  else if (cat == 4) baseMass = 4.0;   // MID_STRUCTURE: buildings, trunks — heavy, vibrates
  else baseMass = 0.5;                 // LOW_AMBIENT: shadows, mist — light, drifts

  // Depth adds mass: close objects feel more solid
  float mass = baseMass * (0.6 + depthFactor * 0.8);
  float invMass = 1.0 / mass; // displacement multiplier

  // ── Per-category audio energy ──
  float energy = 0.0;
  vec3 displacement = vec3(0.0);
  vec3 colorTint = vec3(0.0);
  float sizeBoost = 0.0;

  // Direction for displacement: toward camera
  vec3 dir;
  if (u_projMode > 0.5) {
    dir = normalize(a_position);
  } else {
    dir = vec3(0.0, 0.0, 1.0);
  }
  float t = u_time;

  // ── SPATIAL WAVE FUNCTIONS ──
  // All displacement uses position-based waves (NOT per-vertex random hash).
  // Neighboring pixels get similar values = coherent motion = visible waves.

  // Cat 0: BASS_SUBJECT — deep, slow breathing pulse (barely moves due to high mass)
  if (cat == 0) {
    energy = u_band0 * 0.6 + u_band1 * 0.4;
    // Uniform breathing — whole object expands/contracts together
    float breath = sin(t * 1.5) * 0.5 + 0.5; // slow pulse
    displacement = dir * energy * breath * 0.3;
    colorTint = vec3(0.15, 0.05, 0.0) * energy;
    sizeBoost = energy * 2.0;
  }
  // Cat 1: MID_ORGANIC — spatial wave sway (trees move as groups)
  else if (cat == 1) {
    energy = u_band2 * 0.3 + u_band3 * 0.5 + u_band4 * 0.2;
    // Low-frequency spatial waves — neighbors move together
    float swayX = sin(pos.y * 1.5 + pos.x * 0.3 + t * 2.0) * energy * 0.3;
    float swayY = cos(pos.x * 1.2 + pos.z * 0.4 + t * 1.6) * energy * 0.15;
    float swayZ = sin(pos.y * 0.8 + t * 2.4) * energy * 0.1;
    displacement = vec3(swayX, swayY, swayZ);
    colorTint = vec3(-0.02, 0.12, 0.02) * energy;
    sizeBoost = energy * 1.5;
  }
  // Cat 2: HIGH_SKY — flowing drift (silk-like movement)
  else if (cat == 2) {
    energy = u_band5 * 0.2 + u_band6 * 0.4 + u_band7 * 0.4;
    // Smooth flowing field — very low frequency, large-scale motion
    float flowX = sin(pos.x * 0.4 + pos.y * 0.3 + t * 1.2) * energy * 0.4;
    float flowY = cos(pos.y * 0.5 + pos.x * 0.2 + t * 0.9) * energy * 0.3;
    float flowZ = sin(pos.x * 0.3 + pos.y * 0.4 + t * 1.5) * energy * 0.2;
    displacement = vec3(flowX, flowY, flowZ);
    // Shimmer via color, not position
    float shimmer = sin(pos.x * 3.0 + pos.y * 2.0 + t * 8.0) * 0.5 + 0.5;
    colorTint = vec3(0.08, 0.1, 0.18) * energy * shimmer;
    sizeBoost = energy * 1.0;
  }
  // Cat 3: BEAT_GROUND — surface ripple waves (barely lifts due to high mass)
  else if (cat == 3) {
    energy = u_beat * 0.7 + u_band0 * 0.3;
    // Concentric ripple from center — spatial wave, not per-vertex
    float rippleDist = length(pos.xz);
    float ripple = sin(rippleDist * 4.0 - t * 6.0) * energy * 0.25;
    displacement = vec3(0.0, ripple, 0.0);
    colorTint = vec3(0.12, 0.08, 0.0) * u_beat;
    sizeBoost = u_beat * 1.5;
  }
  // Cat 4: MID_STRUCTURE — resonant standing wave (vibrates in place)
  else if (cat == 4) {
    energy = u_band3 * 0.3 + u_band4 * 0.4 + u_band5 * 0.3;
    // Standing wave — high freq but spatially coherent
    float vibX = sin(pos.y * 6.0 + t * 12.0) * energy * 0.06;
    float vibY = sin(pos.x * 5.0 + t * 14.0) * energy * 0.04;
    displacement = vec3(vibX, vibY, 0.0);
    colorTint = vec3(0.05, 0.02, 0.12) * energy;
    sizeBoost = energy * 1.0;
  }
  // Cat 5: LOW_AMBIENT — slow drift field
  else {
    energy = u_band1 * 0.3 + u_band2 * 0.4 + u_band3 * 0.3;
    // Very slow, large-scale drift
    float driftX = sin(pos.x * 0.3 + t * 0.6) * energy * 0.2;
    float driftY = cos(pos.y * 0.25 + t * 0.5) * energy * 0.15;
    float driftZ = sin(pos.x * 0.2 + pos.y * 0.3 + t * 0.7) * energy * 0.1;
    displacement = vec3(driftX, driftY, driftZ);
    colorTint = vec3(0.03, 0.03, 0.05) * energy;
    sizeBoost = energy * 0.5;
  }

  // ── Apply displacement with mass + coherence scaling ──
  // Mass: heavy objects barely move, light objects flow
  // Coherence: user controls overall intensity
  float displaceScale = mix(1.0, 0.05, u_coherence);

  // ── Chladni standing wave pattern — modulates per-category displacement ──
  float chladni = sin(pos.x * 6.0 + t * 0.5) * sin(pos.y * 6.0 + t * 0.3);
  displacement *= mix(1.0, chladni, 0.4); // blend 40% chladni structure

  pos += displacement * invMass * displaceScale;

  // ── Global wave field (affects ALL points) ──
  float globalWave1 = sin(pos.x * 2.0 + pos.y * 1.5 + t * 0.8) * u_band2 * 0.05;
  float globalWave2 = sin(pos.y * 3.0 + pos.z * 2.0 + t * 1.2) * u_band4 * 0.04;
  float globalWave3 = sin(pos.z * 1.8 + pos.x * 2.5 + t * 0.6) * u_band6 * 0.03;
  pos += vec3(globalWave1, globalWave2, globalWave3) * invMass * displaceScale;

  // ── Interference patterns between bands ──
  float interference = u_band0 * u_band3; // bass × mid
  float intWave = sin(pos.x * 4.0 + pos.y * 3.0 + t * 2.0) * interference;
  pos.y += intWave * 0.06 * invMass * displaceScale;

  // ── Spiral wave (rotational around Y axis) ──
  float angle = atan(pos.z, pos.x);
  float radius = length(pos.xz);
  float spiral = sin(angle * 3.0 + radius * 2.0 - t * 1.5) * u_mid * 0.06;
  vec3 tangent = normalize(vec3(-pos.z, 0.0, pos.x) + 0.001);
  pos += tangent * spiral * invMass * displaceScale;

  // ── Pulse wave (expanding sphere from origin) ──
  float dist = length(pos);
  float pulse = sin(dist * 5.0 - t * 4.0) * u_beat * 0.1;
  pos += normalize(pos + 0.001) * pulse * invMass * displaceScale;

  // ── Form jitter (spatial noise, not per-vertex random) ──
  pos += vec3(
    sin(pos.x * 7.0 + pos.y * 3.0) * u_form * 0.04,
    sin(pos.y * 6.0 + pos.z * 4.0) * u_form * 0.04,
    sin(pos.z * 5.0 + pos.x * 3.5) * u_form * 0.04
  );

  // ── SPATIAL COHERENCE ──
  float depthProtection = depthFactor * 0.4;
  float localCoherence = clamp(u_coherence + depthProtection * (1.0 - u_coherence), 0.0, 1.0);
  float localChaos = 1.0 - localCoherence;

  // Scatter — spatial waves at low coherence (not per-vertex hash)
  // Uses position-based sin waves so neighbors scatter together = flowing chaos not random lines
  float chaosFreq = 2.0 + energy * 3.0; // higher energy = tighter chaos waves
  vec3 scatter = vec3(
    sin(pos.x * chaosFreq + pos.y * 1.3 + t * 0.8),
    cos(pos.y * chaosFreq + pos.z * 1.1 + t * 0.6),
    sin(pos.z * chaosFreq + pos.x * 0.9 + t * 1.0)
  ) * localChaos * 1.5 * invMass;
  pos += scatter;

  // ── Global beat wave (spatial, travels through scene) ──
  float zDist = u_projMode > 0.5 ? length(a_position) : -a_position.z;
  float beatWave = sin(zDist * 3.0 - t * 5.0) * u_beat * 0.08 * invMass * displaceScale;
  pos += dir * beatWave;

  gl_Position = u_projection * u_view * vec4(pos, 1.0);

  // ── Point size ──
  float baseSize = u_pointScale;
  float coherenceBoost = localCoherence * localCoherence * 6.0;
  // Heavy objects get slightly larger points (denser feel)
  float massSize = 1.0 + clamp(baseMass - 1.0, 0.0, 4.0) * 0.15;
  float ptSize = (baseSize + coherenceBoost + sizeBoost * displaceScale * invMass) * massSize;
  ptSize *= (0.4 + depthFactor * 1.2);
  gl_PointSize = max(1.0, ptSize);

  // ── Color ──
  v_color = a_color * 1.4 + vec3(0.08);
  // Per-category color tint
  v_color += colorTint;
  // Beat flash (subtle global)
  v_color += vec3(0.08, 0.04, 0.1) * u_beat;

  // Highlight mode: dim non-selected categories, brighten selected
  if (u_highlightCat > -0.5) {
    float catF = float(cat);
    if (abs(catF - u_highlightCat) > 0.5) {
      // Not selected — dim heavily
      v_color *= 0.15;
    } else {
      // Selected — brighten and add glow
      v_color *= 1.5;
      v_color += vec3(0.1);
    }
  }

  v_alpha = u_transition;
  v_coherence = localCoherence;
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;
in float v_coherence;

out vec4 fragColor;

void main() {
  float dist = length(gl_PointCoord - 0.5);

  // High coherence: square points (no discard) for seamless tiling
  // Low coherence: circular points with soft edges for particle look
  if (v_coherence < 0.7) {
    float shapeThreshold = mix(0.45, 0.7, v_coherence / 0.7);
    if (dist > shapeThreshold) discard;
    float edgeStart = shapeThreshold - 0.15;
    float edge = 1.0 - smoothstep(edgeStart, shapeThreshold, dist);
    fragColor = vec4(v_color * edge, v_alpha * edge);
  } else {
    // Full square, no discard — tiles perfectly
    fragColor = vec4(v_color, v_alpha);
  }
}
`;

export class PointCloudRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private posBuf: WebGLBuffer | null = null;
  private colBuf: WebGLBuffer | null = null;
  private segBuf: WebGLBuffer | null = null;
  private pointCount = 0;

  // Previous cloud for crossfade
  private prevVao: WebGLVertexArrayObject | null = null;
  private prevPosBuf: WebGLBuffer | null = null;
  private prevColBuf: WebGLBuffer | null = null;
  private prevSegBuf: WebGLBuffer | null = null;
  private prevCount = 0;
  private crossfading = false;
  private crossfadeStart = 0;
  private crossfadeDuration = 1500;

  // Uniform locations
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  onError: ((msg: string) => void) | null = null;

  /** Init with an existing GL context (shared with post-processing/DMT) */
  initShared(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.buildProgram();
  }

  init(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      this.onError?.('WebGL2 not supported');
      return;
    }
    this.gl = gl;
    this.buildProgram();

    // Handle context loss
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.program = null;
      this.vao = null;
      this.prevVao = null;
    });

    // Initial resize
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildProgram(): void {
    const gl = this.gl!;

    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.onError?.('Point shader link failed: ' + gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return;
    }

    this.program = prog;

    const names = [
      'u_projection', 'u_view', 'u_time', 'u_bass', 'u_mid',
      'u_high', 'u_beat', 'u_coherence', 'u_pointScale', 'u_transition', 'u_form', 'u_highlightCat',
      'u_band0', 'u_band1', 'u_band2', 'u_band3',
      'u_band4', 'u_band5', 'u_band6', 'u_band7',
      'u_projMode',
    ];
    for (const n of names) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }
  }

  /** Upload a new point cloud. Crossfades from previous if one exists. */
  setPointCloud(data: PointCloudData): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    // Move current to prev for crossfade
    if (this.vao && this.pointCount > 0) {
      this.disposePrev();
      this.prevVao = this.vao;
      this.prevPosBuf = this.posBuf;
      this.prevColBuf = this.colBuf;
      this.prevSegBuf = this.segBuf;
      this.prevCount = this.pointCount;
      this.crossfading = true;
      this.crossfadeStart = performance.now();
    }

    // Create new VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Position buffer — attribute 0
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    // Color buffer — attribute 1
    this.colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);
    const colLoc = gl.getAttribLocation(this.program, 'a_color');
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);

    // Segment buffer — attribute 2
    this.segBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.segments, gl.STATIC_DRAW);
    const segLoc = gl.getAttribLocation(this.program, 'a_segment');
    gl.enableVertexAttribArray(segLoc);
    gl.vertexAttribPointer(segLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    this.pointCount = data.count;
  }

  get hasCloud(): boolean {
    return this.pointCount > 0;
  }

  render(opts: {
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
    projMode: number; // 0=planar, 1=equirectangular
  }): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    // Set common uniforms
    const u = this.uniforms;
    if (u.u_projection) gl.uniformMatrix4fv(u.u_projection, false, opts.projection);
    if (u.u_view) gl.uniformMatrix4fv(u.u_view, false, opts.view);
    if (u.u_time) gl.uniform1f(u.u_time, opts.time);
    if (u.u_bass) gl.uniform1f(u.u_bass, opts.bass);
    if (u.u_mid) gl.uniform1f(u.u_mid, opts.mid);
    if (u.u_high) gl.uniform1f(u.u_high, opts.high);
    if (u.u_beat) gl.uniform1f(u.u_beat, opts.beat);
    if (u.u_band0) gl.uniform1f(u.u_band0, opts.band0);
    if (u.u_band1) gl.uniform1f(u.u_band1, opts.band1);
    if (u.u_band2) gl.uniform1f(u.u_band2, opts.band2);
    if (u.u_band3) gl.uniform1f(u.u_band3, opts.band3);
    if (u.u_band4) gl.uniform1f(u.u_band4, opts.band4);
    if (u.u_band5) gl.uniform1f(u.u_band5, opts.band5);
    if (u.u_band6) gl.uniform1f(u.u_band6, opts.band6);
    if (u.u_band7) gl.uniform1f(u.u_band7, opts.band7);
    if (u.u_coherence) gl.uniform1f(u.u_coherence, opts.coherence);
    if (u.u_pointScale) gl.uniform1f(u.u_pointScale, opts.pointScale);
    if (u.u_form) gl.uniform1f(u.u_form, opts.form);
    // Must always set — GLSL defaults to 0.0 which would highlight cat 0
    const hlLoc = u.u_highlightCat;
    if (hlLoc !== null) gl.uniform1f(hlLoc, opts.highlightCat);
    if (u.u_projMode) gl.uniform1f(u.u_projMode, opts.projMode);

    // Crossfade logic
    let crossT = 1.0;
    if (this.crossfading) {
      crossT = Math.min((performance.now() - this.crossfadeStart) / this.crossfadeDuration, 1.0);
    }

    // Draw previous cloud fading out
    if (this.crossfading && this.prevVao && this.prevCount > 0) {
      if (u.u_transition) gl.uniform1f(u.u_transition, 1.0 - crossT);
      gl.bindVertexArray(this.prevVao);
      gl.drawArrays(gl.POINTS, 0, this.prevCount);
    }

    // Draw current cloud fading in
    if (this.vao && this.pointCount > 0) {
      if (u.u_transition) gl.uniform1f(u.u_transition, this.crossfading ? crossT : 1.0);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
    }

    gl.bindVertexArray(null);

    // Check if crossfade complete
    if (this.crossfading && crossT >= 1.0) {
      this.disposePrev();
      this.crossfading = false;
    }
  }

  resize(): void {
    const gl = this.gl;
    if (!gl) return;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private compile(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      this.onError?.('Shader compile: ' + gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  private disposePrev(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.prevVao) { gl.deleteVertexArray(this.prevVao); this.prevVao = null; }
    if (this.prevPosBuf) { gl.deleteBuffer(this.prevPosBuf); this.prevPosBuf = null; }
    if (this.prevColBuf) { gl.deleteBuffer(this.prevColBuf); this.prevColBuf = null; }
    if (this.prevSegBuf) { gl.deleteBuffer(this.prevSegBuf); this.prevSegBuf = null; }
    this.prevCount = 0;
  }
}
