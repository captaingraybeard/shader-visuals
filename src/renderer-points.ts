// WebGL2 point cloud renderer with audio-reactive displacement

import type { PointCloudData } from './pointcloud';

const VERT = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;  // 1.0 = solid, 0.0 = chaos
uniform float u_pointScale;
uniform float u_transition; // 0-1 crossfade between old and new cloud

out vec3 v_color;
out float v_alpha;
out float v_coherence;

// Simple hash for per-point randomness
float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);

  // Original position
  vec3 pos = a_position;

  // Points are in spherical coords — distance from origin indicates depth
  // Close objects: r ~1.5 (5.0 - 3.5*1.0), Far objects: r ~5.0
  float dist = length(a_position);
  float depthFactor = 1.0 - clamp((dist - 1.5) / 3.5, 0.0, 1.0);

  // ── Coherence displacement ──
  // Low coherence → scatter points using noise
  float chaos = 1.0 - u_coherence;

  // Foreground resists displacement more
  // At coherence=0.5: far points are fully chaotic, close points barely move
  float localChaos = chaos * (1.0 - depthFactor * u_coherence);

  // Per-point random seed
  float h1 = hash(idx);
  float h2 = hash(idx + 1000.0);
  float h3 = hash(idx + 2000.0);

  // Noise-based displacement scaled by localChaos instead of global chaos
  float t = u_time * 0.5;
  vec3 scatter = vec3(
    sin(idx * 0.017 + t * (0.5 + h1)) * h1,
    cos(idx * 0.013 + t * (0.4 + h2)) * h2,
    sin(idx * 0.011 + t * (0.6 + h3)) * h3
  ) * localChaos * 2.0;

  pos += scatter;

  // ── Audio modulation ──
  // Bass pushes points outward — foreground holds position, background explodes
  vec3 dir = normalize(pos + vec3(0.001));
  pos += dir * u_bass * 0.15 * (1.0 - depthFactor * 0.7);

  // Beat snap — background pushed more, foreground less
  float beatPush = u_beat * (1.0 - depthFactor * 0.8);
  pos *= 1.0 + beatPush * 0.2;

  // Mid frequency: gentle wave displacement
  pos.y += sin(pos.x * 4.0 + u_time * 2.0) * u_mid * 0.05;

  gl_Position = u_projection * u_view * vec4(pos, 1.0);

  // ── Point size: coherence boost + depth perspective ──
  float baseSize = u_pointScale;
  // Aggressive coherence scaling — at 1.0 points overlap to fill the scene
  float coherenceBoost = u_coherence * u_coherence * u_coherence * 24.0;
  float audioPtSize = u_bass * 3.0 + u_beat * 4.0;
  float ptSize = baseSize + coherenceBoost + audioPtSize;

  // Closer points are bigger (perspective)
  ptSize *= (0.5 + depthFactor * 1.0);

  // Minimum size so scattered points remain visible
  gl_PointSize = max(1.5, ptSize);

  // Boost color brightness — raw image colors are too dark as points
  v_color = a_color * 1.5 + vec3(0.1);

  // High frequencies add brightness shimmer
  v_color += vec3(u_high * 0.2 * h1, u_high * 0.15 * h2, u_high * 0.25 * h3);

  // Beat flash
  v_color += vec3(0.2, 0.1, 0.25) * u_beat;

  v_alpha = u_transition;
  v_coherence = u_coherence;
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;
in float v_coherence;

out vec4 fragColor;

void main() {
  // Soft circle at low coherence, squarish at high coherence
  float dist = length(gl_PointCoord - 0.5);
  float shapeThreshold = mix(0.5, 0.7, v_coherence); // circle → square-ish
  if (dist > shapeThreshold) discard;

  // Softer edge at low coherence, solid fill at high coherence
  float edgeStart = mix(0.3, 0.6, v_coherence);
  float edge = 1.0 - smoothstep(edgeStart, shapeThreshold, dist);

  fragColor = vec4(v_color * edge, v_alpha * edge);
}
`;

export class PointCloudRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private posBuf: WebGLBuffer | null = null;
  private colBuf: WebGLBuffer | null = null;
  private pointCount = 0;

  // Previous cloud for crossfade
  private prevVao: WebGLVertexArrayObject | null = null;
  private prevPosBuf: WebGLBuffer | null = null;
  private prevColBuf: WebGLBuffer | null = null;
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
      'u_high', 'u_beat', 'u_coherence', 'u_pointScale', 'u_transition',
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
    coherence: number;
    pointScale: number;
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
    if (u.u_coherence) gl.uniform1f(u.u_coherence, opts.coherence);
    if (u.u_pointScale) gl.uniform1f(u.u_pointScale, opts.pointScale);

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
    this.prevCount = 0;
  }
}
