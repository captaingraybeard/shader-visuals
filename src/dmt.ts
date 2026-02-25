// DMT sacred geometry overlay — procedural fractal/sacred geometry at low coherence
// Renders as additive overlay on top of the scene

const DMT_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const DMT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;
uniform vec2 u_resolution;

out vec4 fragColor;

const float PI = 3.14159265;
const float TAU = 6.28318530;

// Rotation matrix
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Hexagonal distance
float hexDist(vec2 p) {
  p = abs(p);
  return max(p.x * 0.866 + p.y * 0.5, p.y);
}

// Flower of life pattern
float flowerOfLife(vec2 p, float scale) {
  p *= scale;
  float d = 1e9;
  // Central circle + 6 surrounding
  d = min(d, abs(length(p) - 1.0));
  for (float i = 0.0; i < 6.0; i++) {
    float a = i * TAU / 6.0;
    vec2 c = vec2(cos(a), sin(a));
    d = min(d, abs(length(p - c) - 1.0));
  }
  // Second ring
  for (float i = 0.0; i < 6.0; i++) {
    float a = i * TAU / 6.0 + TAU / 12.0;
    vec2 c = vec2(cos(a), sin(a)) * 1.732;
    d = min(d, abs(length(p - c) - 1.0));
  }
  return smoothstep(0.06, 0.0, d / scale);
}

// Mandala rings
float mandala(vec2 p, float time, float bass) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float d = 0.0;

  // Concentric rings that pulse with bass
  for (float i = 1.0; i < 6.0; i++) {
    float ringR = i * 0.15 * (1.0 + bass * 0.3);
    float ring = abs(r - ringR);
    ring = smoothstep(0.01, 0.0, ring);

    // Modulate ring with angular pattern
    float segments = i * 4.0;
    float pattern = sin(a * segments + time * (1.0 + i * 0.3)) * 0.5 + 0.5;
    d += ring * pattern;
  }

  return d;
}

// Tunnel effect
float tunnel(vec2 p, float time) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Tunnel warp
  float z = 0.5 / (r + 0.01);
  float tunnelU = a / TAU;
  float tunnelV = z - time * 0.5;

  // Hexagonal tunnel pattern
  vec2 tp = vec2(tunnelU * 6.0, tunnelV * 4.0);
  float hex = hexDist(fract(tp) - 0.5);
  float hexLine = smoothstep(0.45, 0.42, hex);

  // Fade by depth
  float fade = exp(-r * 1.5);
  return hexLine * (1.0 - fade) * smoothstep(0.01, 0.1, r);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float chaos = 1.0 - u_coherence;
  float t = u_time;

  // Only activate at low coherence
  float activation = smoothstep(0.5, 0.15, u_coherence);
  if (activation < 0.01) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 col = vec3(0.0);

  // Rotate with high frequencies
  float rotSpeed = u_high * 0.5 + 0.1;
  p = p * rot(t * rotSpeed * 0.3);

  // Scale pulse with bass
  float scalePulse = 1.0 + u_bass * 0.3 + u_beat * 0.2;
  vec2 sp = p / scalePulse;

  // === Flower of Life ===
  float fol = flowerOfLife(sp, 2.5 + sin(t * 0.3) * 0.5);
  vec3 folCol = vec3(0.3, 0.1, 0.6) + vec3(0.2, 0.3, 0.1) * sin(t * 0.7);
  col += folCol * fol * 0.6;

  // === Mandala ===
  float mand = mandala(sp, t, u_bass);
  vec3 mandCol = vec3(0.1, 0.4, 0.6) + vec3(0.4, 0.1, 0.3) * cos(t * 0.5);
  col += mandCol * mand * 0.5;

  // === Sacred hexagons ===
  vec2 hp = sp * (3.0 + u_mid * 2.0);
  hp = hp * rot(t * 0.1);
  float hex = hexDist(fract(hp) - 0.5);
  float hexPattern = smoothstep(0.48, 0.45, hex) - smoothstep(0.43, 0.40, hex);
  vec3 hexCol = vec3(0.5, 0.2, 0.7) + vec3(0.2) * sin(t + hp.x);
  col += hexCol * hexPattern * 0.4;

  // === Tunnel (very low coherence < 0.2) ===
  float tunnelActivation = smoothstep(0.25, 0.05, u_coherence);
  if (tunnelActivation > 0.01) {
    float tun = tunnel(p * 0.8, t);
    vec3 tunCol = vec3(0.2, 0.5, 0.8) + vec3(0.3, 0.1, 0.2) * sin(t * 1.5);
    col += tunCol * tun * tunnelActivation * 0.7;
  }

  // Beat flash on geometry
  col += vec3(0.15, 0.1, 0.25) * u_beat;

  // Apply activation fade
  col *= activation;

  // Radial fade so edges are softer
  float vignette = 1.0 - smoothstep(0.6, 1.5, length(p));
  col *= vignette;

  fragColor = vec4(col, activation * 0.8);
}
`;

export class DMTOverlay {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  init(gl: WebGL2RenderingContext): void {
    this.gl = gl;

    this.program = this.buildProgram(gl, DMT_VERT, DMT_FRAG);
    if (!this.program) return;

    const names = [
      'u_time', 'u_bass', 'u_mid', 'u_high',
      'u_beat', 'u_coherence', 'u_resolution',
    ];
    for (const n of names) {
      this.uniforms[n] = gl.getUniformLocation(this.program, n);
    }

    // Fullscreen quad
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
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
  }

  render(opts: {
    time: number;
    bass: number;
    mid: number;
    high: number;
    beat: number;
    coherence: number;
    width: number;
    height: number;
  }): void {
    const gl = this.gl;
    if (!gl || !this.program) return;

    // Skip if coherence too high
    if (opts.coherence > 0.55) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending

    gl.useProgram(this.program);

    const u = this.uniforms;
    if (u.u_time) gl.uniform1f(u.u_time, opts.time);
    if (u.u_bass) gl.uniform1f(u.u_bass, opts.bass);
    if (u.u_mid) gl.uniform1f(u.u_mid, opts.mid);
    if (u.u_high) gl.uniform1f(u.u_high, opts.high);
    if (u.u_beat) gl.uniform1f(u.u_beat, opts.beat);
    if (u.u_coherence) gl.uniform1f(u.u_coherence, opts.coherence);
    if (u.u_resolution) gl.uniform2f(u.u_resolution, opts.width, opts.height);

    gl.disable(gl.DEPTH_TEST);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
      console.error('DMT shader link failed:', gl.getProgramInfoLog(prog));
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
      console.error('DMT shader compile:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
}
