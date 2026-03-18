// Shader sandbox — validates LLM-generated GLSL before injection
// Enforces: forbidden patterns, iteration caps, no infinite loops

/** Patterns that must never appear in generated GLSL */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Texture/image access (could exfiltrate data)
  { pattern: /\btexelFetch\b/, reason: 'texelFetch access not allowed' },
  { pattern: /\btexture\b/, reason: 'texture sampling not allowed in animation snippets' },
  { pattern: /\bimageLoad\b/, reason: 'image access not allowed' },
  { pattern: /\bimageStore\b/, reason: 'image write not allowed' },

  // Discard (fragment-only, would break vertex shader)
  { pattern: /\bdiscard\b/, reason: 'discard not allowed in vertex animation' },

  // Preprocessor tricks
  { pattern: /#\s*include/, reason: 'preprocessor includes not allowed' },
  { pattern: /#\s*define\s+\w+\s*\(/, reason: 'function-like macros not allowed' },
  { pattern: /#\s*undef/, reason: 'undef not allowed' },

  // Redefining uniforms or outputs
  { pattern: /\buniform\b/, reason: 'cannot declare uniforms in snippet' },
  { pattern: /\bout\s+/, reason: 'cannot declare outputs in snippet' },
  { pattern: /\bin\s+(vec|float|int|mat)/, reason: 'cannot declare inputs in snippet' },
  { pattern: /\bgl_Position\b/, reason: 'cannot write gl_Position in snippet' },
  { pattern: /\bgl_PointSize\b/, reason: 'cannot write gl_PointSize in snippet' },

  // Extension abuse
  { pattern: /#\s*extension/, reason: 'extensions not allowed' },
];

/** Max iterations allowed in any for-loop */
const MAX_LOOP_ITERATIONS = 64;

/** Max total characters for a snippet */
const MAX_SNIPPET_LENGTH = 4000;

export interface SandboxResult {
  valid: boolean;
  errors: string[];
  sanitized: string;
}

/**
 * Validate and sanitize a GLSL animation snippet.
 * Returns { valid, errors, sanitized }.
 */
export function validateSnippet(glsl: string): SandboxResult {
  const errors: string[] = [];

  // Length check
  if (glsl.length > MAX_SNIPPET_LENGTH) {
    errors.push(`Snippet too long: ${glsl.length} chars (max ${MAX_SNIPPET_LENGTH})`);
    return { valid: false, errors, sanitized: glsl };
  }

  // Forbidden patterns
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    // Strip comments before checking
    const stripped = stripComments(glsl);
    if (pattern.test(stripped)) {
      errors.push(`Forbidden: ${reason}`);
    }
  }

  // Check for-loop iteration caps
  const loopErrors = checkLoopCaps(glsl);
  errors.push(...loopErrors);

  // Check for while loops (banned — must use bounded for-loops)
  const strippedForWhile = stripComments(glsl);
  if (/\bwhile\s*\(/.test(strippedForWhile)) {
    errors.push('while loops not allowed — use bounded for-loops');
  }

  // Check for do-while
  if (/\bdo\s*\{/.test(strippedForWhile)) {
    errors.push('do-while loops not allowed — use bounded for-loops');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: glsl,
  };
}

/**
 * Strip single-line and multi-line comments from GLSL.
 */
function stripComments(glsl: string): string {
  // Remove multi-line comments
  let result = glsl.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments
  result = result.replace(/\/\/.*/g, '');
  return result;
}

/**
 * Check that all for-loops have bounded iteration counts.
 * Accepts patterns like:
 *   for (int i = 0; i < N; i++)  where N <= MAX_LOOP_ITERATIONS
 *   for (int i = 0; i < N; ++i)
 */
function checkLoopCaps(glsl: string): string[] {
  const errors: string[] = [];
  const stripped = stripComments(glsl);

  // Match for-loop headers
  const forPattern = /\bfor\s*\(\s*(?:int|float)\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<\s*(\d+)\s*;/g;
  let match: RegExpExecArray | null;

  // Count total for-loops vs matched for-loops
  const totalFors = (stripped.match(/\bfor\s*\(/g) || []).length;
  let matchedFors = 0;

  while ((match = forPattern.exec(stripped)) !== null) {
    matchedFors++;
    const limit = parseInt(match[1], 10);
    if (limit > MAX_LOOP_ITERATIONS) {
      errors.push(`Loop iteration limit ${limit} exceeds max ${MAX_LOOP_ITERATIONS}`);
    }
  }

  // Any for-loop we couldn't parse is suspicious
  if (totalFors > matchedFors) {
    errors.push(`${totalFors - matchedFors} for-loop(s) have non-standard bounds — use "for (int i = 0; i < N; i++)" with constant N <= ${MAX_LOOP_ITERATIONS}`);
  }

  return errors;
}

/**
 * Quick compile-test: inject snippet into the template shader and try to compile.
 * Returns null if compilation succeeds, or the error string if it fails.
 * Requires a WebGL2 context.
 */
export function tryCompile(
  gl: WebGL2RenderingContext,
  fullVertexShader: string,
): string | null {
  const shader = gl.createShader(gl.VERTEX_SHADER);
  if (!shader) return 'Failed to create shader object';

  gl.shaderSource(shader, fullVertexShader);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown compile error';
    gl.deleteShader(shader);
    return log;
  }

  gl.deleteShader(shader);
  return null;
}
