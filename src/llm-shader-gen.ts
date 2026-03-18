// LLM shader generation — animation prompt → GLSL vertex snippets
// Part of the dual-prompt architecture: scene prompt generates the point cloud,
// animation prompt generates behavior code injected into the vertex shader.

import { validateSnippet, tryCompile } from './shader-sandbox';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are a GLSL animation snippet generator for a point cloud renderer. Output ONLY the raw GLSL snippet inside a single \`\`\`glsl code block. No explanation, no markdown prose.

## Context

You are writing a snippet that will be injected into a WebGL2 vertex shader. The snippet controls how points in a point cloud move and change color in response to audio.

## Available Variables (read/write)

These variables are already declared. Your snippet modifies them:

- \`vec3 pos\` — current point position (world space). Modify this to move points.
- \`vec3 displacement\` — initialized to vec3(0). Add to this for audio-reactive motion.
- \`vec3 colorTint\` — initialized to vec3(0). Add to this for color effects.
- \`float sizeBoost\` — initialized to 0.0. Add to this to grow/shrink points.
- \`float energy\` — initialized to 0.0. Set this to your computed energy value.

## Available Variables (read-only)

- \`float u_time\` — elapsed seconds
- \`float u_bass\` — bass energy (0-1)
- \`float u_mid\` — mid energy (0-1)
- \`float u_high\` — high energy (0-1)
- \`float u_beat\` — beat pulse (0-1, decays)
- \`float u_band0..u_band7\` — 8 frequency bands (0-1)
- \`int cat\` — audio category of this point (0=bass/subject, 1=mid/organic, 2=high/sky, 3=beat/ground, 4=mid/structure, 5=ambient)
- \`float invMass\` — inverse mass of this point (lighter points = higher invMass)
- \`vec3 position\` — original (rest) position of the point
- \`float depthFactor\` — 0=close, 1=far

## Rules

1. Output ONLY the snippet body — no function declarations, no uniforms, no #version
2. Use bounded for-loops ONLY: \`for (int i = 0; i < N; i++)\` where N <= 64
3. No while/do-while loops
4. No texture sampling, discard, or gl_Position/gl_PointSize writes
5. Keep it under 100 lines
6. Multiply motion by invMass so heavy objects move less
7. Use the \`cat\` variable to give different segments different behavior
8. Make it musically reactive — use the audio uniforms creatively`;

function extractSnippet(text: string): string {
  // Try ```glsl block
  const glslMatch = text.match(/```glsl\s*\n([\s\S]*?)```/);
  if (glslMatch) return glslMatch[1].trim();

  // Try any code block
  const codeMatch = text.match(/```\s*\n([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();

  // Raw text if it looks like GLSL
  const trimmed = text.trim();
  if (trimmed.includes('displacement') || trimmed.includes('pos') || trimmed.includes('energy')) {
    return trimmed;
  }

  throw new Error('No valid GLSL snippet found in LLM response');
}

export interface AnimationSnippet {
  glsl: string;
  prompt: string;
}

/**
 * Generate a GLSL animation snippet from a natural-language prompt.
 * Validates the result through the shader sandbox before returning.
 */
export async function generateAnimationSnippet(
  animationPrompt: string,
  apiKey: string,
  compileError?: string,
): Promise<AnimationSnippet> {
  let userMessage = `Animation: ${animationPrompt}\n\nGenerate a GLSL snippet that creates this animation behavior for the point cloud.`;

  if (compileError) {
    userMessage += `\n\nThe previous snippet had a compile error. Fix it:\n${compileError}`;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Check your Anthropic API key in settings.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Wait a moment and try again.');
    }
    throw new Error(`API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Claude API');

  const glsl = extractSnippet(text);

  // Sandbox validation
  const result = validateSnippet(glsl);
  if (!result.valid) {
    throw new Error(`Generated snippet failed validation:\n${result.errors.join('\n')}`);
  }

  return { glsl: result.sanitized, prompt: animationPrompt };
}

/**
 * Generate with retry: if the first attempt fails compilation,
 * feed the error back to the LLM for a second try.
 */
export async function generateAnimationWithRetry(
  animationPrompt: string,
  apiKey: string,
  gl?: WebGL2RenderingContext,
  buildFullShader?: (snippet: string) => string,
): Promise<AnimationSnippet> {
  const first = await generateAnimationSnippet(animationPrompt, apiKey);

  // If we have a GL context and shader builder, try compiling
  if (gl && buildFullShader) {
    const fullShader = buildFullShader(first.glsl);
    const compileError = tryCompile(gl, fullShader);
    if (compileError) {
      // Retry with error feedback
      const second = await generateAnimationSnippet(animationPrompt, apiKey, compileError);
      const retryShader = buildFullShader(second.glsl);
      const retryError = tryCompile(gl, retryShader);
      if (retryError) {
        throw new Error(`Shader compile failed after retry:\n${retryError}`);
      }
      return second;
    }
  }

  return first;
}
