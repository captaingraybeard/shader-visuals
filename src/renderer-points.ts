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

// Simple hash for per-point randomness
float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);

  // Original position
  vec3 pos = a_position;

  // ── Coherence displacement ──
  // Low coherence → scatter points using noise
  float chaos = 1.0 - u_coherence;

  // Per-point random seed
  float h1 = hash(idx);
  float h2 = hash(idx + 1000.0);
  float h3 = hash(idx + 2000.0);

  // Noise-based displacement (mild at chaos=0.5, wild at chaos=1.0)
  float t = u_time * 0.5;
  vec3 scatter = vec3(
    sin(idx * 0.017 + t * (0.5 + h1)) * h1,
    cos(idx * 0.013 + t * (0.4 + h2)) * h2,
    sin(idx * 0.011 + t * (0.6 + h3)) * h3
  ) * chaos * 2.0;

  pos += scatter;

  // ── Audio modulation ──
  // Bass pushes points outward from center
  vec3 dir = normalize(pos + vec3(0.001));
  pos += dir * u_bass * 0.15 * (1.0 + chaos * 0.5);

  // Beat snap — momentarily pull toward origin then push
  pos *= 1.0 + u_beat * 0.2 * chaos;

  // Mid frequency: gentle wave displacement
  pos.y += sin(pos.x * 4.0 + u_time * 2.0) * u_mid * 0.05;

  gl_Position = u_projection * u_view * vec4(pos, 1.0);

  // Point size: base + audio-reactive
  float basePtSize = u_pointScale;
  float audioPtSize = u_bass * 2.0 + u_beat * 3.0;
  gl_PointSize = max(1.0, basePtSize + audioPtSize);

  v_color = a_color;

  // High frequencies add brightness shimmer
  v_color += vec3(u_high * 0.15 * h1, u_high * 0.1 * h2, u_high * 0.2 * h3);

  // Beat flash
  v_color += vec3(0.15, 0.08, 0.2) * u_beat;

  v_alpha = u_transition;
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;

out vec4 fragColor;

void main() {
  // Round points — discard corners for circular shape
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(coord, coord);
  if (r2 > 1.0) discard;

  // Soft edge glow
  float edge = 1.0 - smoothstep(0.5, 1.0, r2);

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

  init(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) {
      this.onError?.('WebGL2 not supported');
      return;
    }
    this.gl = gl;

    // Compile program
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

    // Cache uniform locations
    const names = [
      'u_projection', 'u_view', 'u_time', 'u_bass', 'u_mid',
      'u_high', 'u_beat', 'u_coherence', 'u_pointScale', 'u_transition',
    ];
    for (const n of names) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }

    // Enable blending for crossfade alpha
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Depth test for proper 3D ordering
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

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
    gl.clearColor(0, 0, 0, 1);
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
