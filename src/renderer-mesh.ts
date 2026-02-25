// WebGL2 textured depth mesh renderer
// Builds triangle mesh grid from depth map, UV-maps original image as texture

const MESH_VERT = `#version 300 es
precision highp float;

in vec3 a_position;
in vec2 a_uv;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;
uniform float u_dissolve;   // 0 = solid mesh, 1 = fully scattered

out vec2 v_uv;
out float v_depth;
out float v_dissolve;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);
  vec3 pos = a_position;
  float depthFactor = pos.z * 0.5 + 0.5;

  // Audio displacement — subtle breathing at high coherence
  float breathe = sin(u_time * 1.5 + pos.x * 3.0) * u_bass * 0.03 * u_coherence;
  pos.z += breathe;

  // Beat ripple
  float dist = length(pos.xy);
  float ripple = sin(dist * 8.0 - u_time * 4.0) * u_beat * 0.02;
  pos.z += ripple;

  // Mid-frequency wave
  pos.y += sin(pos.x * 4.0 + u_time * 2.0) * u_mid * 0.02 * u_coherence;

  // Dissolve scatter — vertices fly outward as dissolve increases
  if (u_dissolve > 0.0) {
    float h1 = hash(idx);
    float h2 = hash(idx + 1000.0);
    float h3 = hash(idx + 2000.0);
    float t = u_time * 0.5;
    vec3 scatter = vec3(
      sin(idx * 0.017 + t * (0.5 + h1)) * h1,
      cos(idx * 0.013 + t * (0.4 + h2)) * h2,
      sin(idx * 0.011 + t * (0.6 + h3)) * h3
    ) * u_dissolve * 2.0;

    // Foreground resists scatter more
    float scatterResist = depthFactor * (1.0 - u_dissolve);
    pos += scatter * (1.0 - scatterResist);

    // Audio pushes scattered particles more
    vec3 dir = normalize(pos + vec3(0.001));
    pos += dir * u_bass * 0.15 * u_dissolve;
  }

  gl_Position = u_projection * u_view * vec4(pos, 1.0);

  v_uv = a_uv;
  v_depth = depthFactor;
  v_dissolve = u_dissolve;
}
`;

const MESH_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_depth;
in float v_dissolve;

uniform sampler2D u_texture;
uniform float u_time;
uniform float u_bass;
uniform float u_beat;
uniform float u_high;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);

  // Boost colors slightly
  vec3 col = tex.rgb * 1.2 + vec3(0.05);

  // Beat flash
  col += vec3(0.15, 0.08, 0.2) * u_beat;

  // High-frequency shimmer
  col += vec3(u_high * 0.1);

  // Dissolve: fade to wireframe look then transparent
  float alpha = 1.0;
  if (v_dissolve > 0.3) {
    float fadeStart = 0.3;
    float fadeFull = 0.85;
    alpha = 1.0 - smoothstep(fadeStart, fadeFull, v_dissolve);
  }

  fragColor = vec4(col, alpha);
}
`;

// Wireframe overlay shader for dissolve transition
const WIRE_VERT = `#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform float u_time;
uniform float u_dissolve;
uniform float u_bass;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);
  vec3 pos = a_position;

  if (u_dissolve > 0.0) {
    float h1 = hash(idx);
    float h2 = hash(idx + 1000.0);
    float h3 = hash(idx + 2000.0);
    float t = u_time * 0.5;
    vec3 scatter = vec3(
      sin(idx * 0.017 + t * (0.5 + h1)) * h1,
      cos(idx * 0.013 + t * (0.4 + h2)) * h2,
      sin(idx * 0.011 + t * (0.6 + h3)) * h3
    ) * u_dissolve * 2.0;
    pos += scatter;
    vec3 dir = normalize(pos + vec3(0.001));
    pos += dir * u_bass * 0.15 * u_dissolve;
  }

  gl_Position = u_projection * u_view * vec4(pos, 1.0);
}
`;

const WIRE_FRAG = `#version 300 es
precision highp float;

uniform float u_dissolve;
uniform float u_time;

out vec4 fragColor;

void main() {
  // Wireframe color: purple-ish, fades in during dissolve
  float alpha = smoothstep(0.1, 0.5, u_dissolve) * (1.0 - smoothstep(0.7, 1.0, u_dissolve));
  vec3 col = vec3(0.4, 0.2, 0.8) + vec3(0.1) * sin(u_time * 2.0);
  fragColor = vec4(col, alpha * 0.6);
}
`;

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

/**
 * Build a cylindrical mesh that wraps around the viewer.
 * Image maps onto the inside of a cylinder, depth pushes vertices inward.
 * Depth discontinuity detection skips triangles at foreground/background edges
 * so foreground objects appear as separate floating geometry.
 */
export function buildMeshData(
  depthMap: Float32Array,
  srcW: number,
  srcH: number,
  gridSize = 256,
): MeshData {
  const gw = Math.min(gridSize, srcW);
  const gh = Math.min(gridSize, srcH);

  const vertexCount = gw * gh;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  // Cylinder parameters
  const CYLINDER_RADIUS = 4.0;    // base radius of the cylinder
  const DEPTH_PUSH = 2.5;         // how far depth pushes vertices inward
  const HEIGHT = 3.0;             // half-height of cylinder
  const ARC = Math.PI * 1.6;     // how much of the cylinder the image covers (~290°)
  const ARC_OFFSET = -ARC / 2;    // center the image in front

  // Store depths for discontinuity detection
  const depthGrid = new Float32Array(vertexCount);

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const vi = y * gw + x;
      const u = x / (gw - 1);
      const v = y / (gh - 1);

      // Sample depth at this UV
      const sx = Math.min(Math.floor(u * srcW), srcW - 1);
      const sy = Math.min(Math.floor(v * srcH), srcH - 1);
      const depth = depthMap[sy * srcW + sx]; // 0=far, 1=close
      depthGrid[vi] = depth;

      // Angle around cylinder (horizontal)
      const angle = ARC_OFFSET + u * ARC;

      // Radius: far things at cylinder wall, close things pushed inward
      const r = CYLINDER_RADIUS - depth * DEPTH_PUSH;

      // Cylindrical coordinates → cartesian
      positions[vi * 3]     = Math.sin(angle) * r;           // X
      positions[vi * 3 + 1] = HEIGHT * (1 - 2 * v);          // Y (top to bottom)
      positions[vi * 3 + 2] = -Math.cos(angle) * r;          // Z (negative = in front)

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  // Build index buffer with depth discontinuity culling
  // Skip triangles where adjacent vertices have large depth difference
  const DEPTH_THRESHOLD = 0.15; // skip triangle if depth diff > this
  const maxQuads = (gw - 1) * (gh - 1);
  const indices = new Uint32Array(maxQuads * 6);
  let idx = 0;

  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const tl = y * gw + x;
      const tr = tl + 1;
      const bl = (y + 1) * gw + x;
      const br = bl + 1;

      const dTL = depthGrid[tl];
      const dTR = depthGrid[tr];
      const dBL = depthGrid[bl];
      const dBR = depthGrid[br];

      // Check max depth difference across the quad
      const maxD = Math.max(dTL, dTR, dBL, dBR);
      const minD = Math.min(dTL, dTR, dBL, dBR);

      if (maxD - minD > DEPTH_THRESHOLD) {
        // Depth discontinuity — skip this quad entirely
        // This prevents stretchy triangles at foreground/background edges
        continue;
      }

      indices[idx++] = tl;
      indices[idx++] = bl;
      indices[idx++] = tr;

      indices[idx++] = tr;
      indices[idx++] = bl;
      indices[idx++] = br;
    }
  }

  return { positions, uvs, indices, vertexCount, indexCount: idx };
}

export class MeshRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private meshProgram: WebGLProgram | null = null;
  private wireProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private wireVao: WebGLVertexArrayObject | null = null;
  private indexBuf: WebGLBuffer | null = null;
  private wireIndexBuf: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private indexCount = 0;
  private wireIndexCount = 0;

  private meshUniforms: Record<string, WebGLUniformLocation | null> = {};
  private wireUniforms: Record<string, WebGLUniformLocation | null> = {};

  private _hasData = false;
  onError: ((msg: string) => void) | null = null;

  get hasData(): boolean { return this._hasData; }

  init(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      this.onError?.('WebGL2 not supported');
      return null;
    }
    this.gl = gl;

    // Compile mesh program
    this.meshProgram = this.buildProgram(gl, MESH_VERT, MESH_FRAG);
    if (this.meshProgram) {
      const names = [
        'u_projection', 'u_view', 'u_time', 'u_bass', 'u_mid',
        'u_high', 'u_beat', 'u_coherence', 'u_dissolve', 'u_texture',
      ];
      for (const n of names) {
        this.meshUniforms[n] = gl.getUniformLocation(this.meshProgram, n);
      }
    }

    // Compile wireframe program
    this.wireProgram = this.buildProgram(gl, WIRE_VERT, WIRE_FRAG);
    if (this.wireProgram) {
      const names = ['u_projection', 'u_view', 'u_time', 'u_dissolve', 'u_bass'];
      for (const n of names) {
        this.wireUniforms[n] = gl.getUniformLocation(this.wireProgram, n);
      }
    }

    // Context loss
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.meshProgram = null;
      this.wireProgram = null;
      this.vao = null;
      this.wireVao = null;
      this._hasData = false;
    });

    return gl;
  }

  setMeshData(data: MeshData, image: HTMLImageElement): void {
    const gl = this.gl;
    if (!gl || !this.meshProgram) return;

    // Clean up old data
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.wireVao) gl.deleteVertexArray(this.wireVao);
    if (this.indexBuf) gl.deleteBuffer(this.indexBuf);
    if (this.wireIndexBuf) gl.deleteBuffer(this.wireIndexBuf);
    if (this.texture) gl.deleteTexture(this.texture);

    // === Mesh VAO ===
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Position buffer
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.meshProgram, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    // UV buffer
    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);
    const uvLoc = gl.getAttribLocation(this.meshProgram, 'a_uv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    // Index buffer
    this.indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    this.indexCount = data.indexCount;

    gl.bindVertexArray(null);

    // === Wireframe VAO (same positions, no UV) ===
    if (this.wireProgram) {
      this.wireVao = gl.createVertexArray();
      gl.bindVertexArray(this.wireVao);

      // Reuse same position buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      const wirePosLoc = gl.getAttribLocation(this.wireProgram, 'a_position');
      gl.enableVertexAttribArray(wirePosLoc);
      gl.vertexAttribPointer(wirePosLoc, 3, gl.FLOAT, false, 0, 0);

      // Wireframe index buffer (same as mesh for LINES)
      this.wireIndexBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireIndexBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
      this.wireIndexCount = data.indexCount;

      gl.bindVertexArray(null);
    }

    // === Texture from image ===
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this._hasData = true;
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
    dissolve: number;
  }): void {
    const gl = this.gl;
    if (!gl || !this.meshProgram || !this._hasData) return;

    gl.useProgram(this.meshProgram);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.meshUniforms.u_texture) gl.uniform1i(this.meshUniforms.u_texture, 0);

    // Set uniforms
    const u = this.meshUniforms;
    if (u.u_projection) gl.uniformMatrix4fv(u.u_projection, false, opts.projection);
    if (u.u_view) gl.uniformMatrix4fv(u.u_view, false, opts.view);
    if (u.u_time) gl.uniform1f(u.u_time, opts.time);
    if (u.u_bass) gl.uniform1f(u.u_bass, opts.bass);
    if (u.u_mid) gl.uniform1f(u.u_mid, opts.mid);
    if (u.u_high) gl.uniform1f(u.u_high, opts.high);
    if (u.u_beat) gl.uniform1f(u.u_beat, opts.beat);
    if (u.u_coherence) gl.uniform1f(u.u_coherence, opts.coherence);
    if (u.u_dissolve) gl.uniform1f(u.u_dissolve, opts.dissolve);

    // Draw solid mesh
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    // Draw wireframe overlay during dissolve
    if (opts.dissolve > 0.1 && this.wireProgram && this.wireVao) {
      gl.useProgram(this.wireProgram);
      const w = this.wireUniforms;
      if (w.u_projection) gl.uniformMatrix4fv(w.u_projection, false, opts.projection);
      if (w.u_view) gl.uniformMatrix4fv(w.u_view, false, opts.view);
      if (w.u_time) gl.uniform1f(w.u_time, opts.time);
      if (w.u_dissolve) gl.uniform1f(w.u_dissolve, opts.dissolve);
      if (w.u_bass) gl.uniform1f(w.u_bass, opts.bass);

      gl.bindVertexArray(this.wireVao);
      gl.drawElements(gl.LINES, this.wireIndexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
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

  getGL(): WebGL2RenderingContext | null { return this.gl; }

  private buildProgram(gl: WebGL2RenderingContext, vSrc: string, fSrc: string): WebGLProgram | null {
    const vs = this.compile(gl, gl.VERTEX_SHADER, vSrc);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, fSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.onError?.('Mesh shader link failed: ' + gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
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
}
