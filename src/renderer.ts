// WebGL2 renderer — full-screen quad, shader compile, crossfade

import type { AudioUniforms, ShaderProgram } from './types';

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
void main() {
    gl_Position = a_position;
}
`;

// Full-screen quad: two triangles covering clip space
const QUAD_VERTICES = new Float32Array([
  -1, -1,  1, -1,  -1, 1,
  -1,  1,  1, -1,   1, 1,
]);

const UNIFORM_NAMES = [
  'u_time', 'u_bass', 'u_mid', 'u_high', 'u_beat', 'u_intensity', 'u_resolution',
] as const;

export class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private compiledVertex: WebGLShader | null = null;

  private current: ShaderProgram | null = null;
  private next: ShaderProgram | null = null;

  // Crossfade state
  private crossfadeStart = 0;
  private crossfadeDuration = 0;
  private crossfading = false;

  onError: ((msg: string) => void) | null = null;

  init(canvas: HTMLCanvasElement, defaultShaderSource: string): void {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) {
      this.onError?.('WebGL2 not supported');
      return;
    }
    this.gl = gl;

    // Handle context loss
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.current = null;
      this.next = null;
      this.compiledVertex = null;
      this.vao = null;
    });

    canvas.addEventListener('webglcontextrestored', () => {
      if (this.gl) {
        this.setupGeometry();
        this.compiledVertex = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
      }
    });

    // Setup geometry (VAO + VBO for full-screen quad)
    this.setupGeometry();

    // Compile the vertex shader once — it never changes
    this.compiledVertex = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    if (!this.compiledVertex) return;

    // Compile and set the default shader
    this.current = this.buildProgram(defaultShaderSource);
    if (!this.current) {
      this.onError?.('Default shader failed to compile');
    }

    // Initial resize
    this.resize();

    // Listen for resize
    window.addEventListener('resize', () => this.resize());
  }

  loadShader(fragmentSource: string): boolean {
    const program = this.buildProgram(fragmentSource);
    if (!program) return false;
    this.disposeProgram(this.current);
    this.current = program;
    this.crossfading = false;
    this.next = null;
    return true;
  }

  crossfadeTo(fragmentSource: string, duration = 500): boolean {
    const program = this.buildProgram(fragmentSource);
    if (!program) return false;

    // If we were already crossfading, discard the old "next"
    if (this.crossfading && this.next) {
      this.disposeProgram(this.current);
      this.current = this.next;
    }

    this.next = program;
    this.crossfadeDuration = duration;
    this.crossfadeStart = performance.now();
    this.crossfading = true;
    return true;
  }

  render(uniforms: AudioUniforms): void {
    const gl = this.gl;
    if (!gl || !this.current) return;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindVertexArray(this.vao);

    if (this.crossfading && this.next) {
      const t = Math.min((performance.now() - this.crossfadeStart) / this.crossfadeDuration, 1);

      // Enable blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Draw old shader at full opacity
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawWithProgram(this.current, uniforms, 1.0);

      // Draw new shader at crossfade alpha
      this.drawWithProgram(this.next, uniforms, t);

      gl.disable(gl.BLEND);

      // Crossfade complete
      if (t >= 1) {
        this.disposeProgram(this.current);
        this.current = this.next;
        this.next = null;
        this.crossfading = false;
      }
    } else {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawWithProgram(this.current, uniforms, 1.0);
    }

    gl.bindVertexArray(null);
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

  // ── Private helpers ──────────────────────────────────────────────

  private setupGeometry(): void {
    const gl = this.gl!;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    // a_position at location 0
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) {
      this.onError?.('Failed to create shader object');
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'Unknown compile error';
      gl.deleteShader(shader);
      this.onError?.(log);
      return null;
    }
    return shader;
  }

  private buildProgram(fragmentSource: string): ShaderProgram | null {
    const gl = this.gl;
    if (!gl || !this.compiledVertex) return null;

    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragShader) return null;

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(fragShader);
      this.onError?.('Failed to create program');
      return null;
    }

    gl.attachShader(program, this.compiledVertex);
    gl.attachShader(program, fragShader);
    // Bind a_position to location 0 so all programs share the same VAO
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);

    // Fragment shader object is no longer needed after linking
    gl.deleteShader(fragShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'Unknown link error';
      gl.deleteProgram(program);
      this.onError?.(log);
      return null;
    }

    // Cache uniform locations
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of UNIFORM_NAMES) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    // Extra uniform for crossfade alpha
    uniforms['u_alpha'] = gl.getUniformLocation(program, 'u_alpha');

    return { program, uniforms };
  }

  private drawWithProgram(sp: ShaderProgram, u: AudioUniforms, alpha: number): void {
    const gl = this.gl!;
    gl.useProgram(sp.program);

    // Set uniforms
    if (sp.uniforms.u_time != null) gl.uniform1f(sp.uniforms.u_time, u.u_time);
    if (sp.uniforms.u_bass != null) gl.uniform1f(sp.uniforms.u_bass, u.u_bass);
    if (sp.uniforms.u_mid != null) gl.uniform1f(sp.uniforms.u_mid, u.u_mid);
    if (sp.uniforms.u_high != null) gl.uniform1f(sp.uniforms.u_high, u.u_high);
    if (sp.uniforms.u_beat != null) gl.uniform1f(sp.uniforms.u_beat, u.u_beat);
    if (sp.uniforms.u_intensity != null) gl.uniform1f(sp.uniforms.u_intensity, u.u_intensity);
    if (sp.uniforms.u_resolution != null) gl.uniform2f(sp.uniforms.u_resolution, u.u_resolution[0], u.u_resolution[1]);

    // Alpha for crossfade — shaders can optionally use this, but the blend is handled by GL state
    // We use gl.blendColor + constant alpha approach: draw with reduced alpha via vertex color or uniform
    // Simplest: we render to the default framebuffer with blending and control alpha per-draw.
    // Since fragment shaders output vec4 with alpha=1, we scale alpha via blendFunc:
    // For the "old" pass (alpha=1) this is normal. For the "new" pass we set blendColor alpha.
    if (alpha < 1.0) {
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, alpha);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private disposeProgram(sp: ShaderProgram | null): void {
    if (!sp || !this.gl) return;
    this.gl.deleteProgram(sp.program);
  }
}
