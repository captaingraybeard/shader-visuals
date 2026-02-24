const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are a GLSL shader generator. Output ONLY valid WebGL2 GLSL fragment shader code. No explanation, no markdown — just the raw GLSL code inside a single \`\`\`glsl code block.

Requirements for every shader you generate:
- First line must be: #version 300 es
- Must have: precision highp float;
- Must declare these uniforms exactly:
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_high;
  uniform float u_beat;
  uniform float u_intensity;
  uniform vec2 u_resolution;
- Must output to: out vec4 fragColor;
- Use gl_FragCoord for pixel position
- Normalize coordinates: vec2 uv = gl_FragCoord.xy / u_resolution;

Uniform ranges:
- u_time: elapsed seconds (0 to infinity)
- u_bass: low frequency energy (0.0 to 1.0) — kick drums, bass
- u_mid: mid frequency energy (0.0 to 1.0) — vocals, guitars
- u_high: high frequency energy (0.0 to 1.0) — cymbals, hi-hats
- u_beat: detected beat pulse (0.0 to 1.0, decays after each beat)
- u_intensity: user-controlled intensity multiplier (0.0 to 1.0)
- u_resolution: canvas size in pixels

Make shaders that are visually stunning, smooth, and reactive to the audio uniforms. Multiply audio reactivity by u_intensity. Use interesting math — sin, cos, noise, polar coordinates, fractals, etc.`;

function extractGLSL(text: string): string {
  // Try to extract from ```glsl code block
  const glslMatch = text.match(/```glsl\s*\n([\s\S]*?)```/);
  if (glslMatch) return glslMatch[1].trim();

  // Try any code block
  const codeMatch = text.match(/```\s*\n([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();

  // If text starts with #version, use raw text
  const trimmed = text.trim();
  if (trimmed.startsWith('#version')) return trimmed;

  throw new Error('No valid GLSL code found in LLM response');
}

export async function generateShader(
  scene: string,
  vibe: string,
  apiKey: string,
  compileError?: string
): Promise<string> {
  let userMessage = `Scene: ${scene}\nVibe: ${vibe}\n\nGenerate a fragment shader that visualizes this scene with this vibe. Make it react to audio through the uniforms.`;

  if (compileError) {
    userMessage += `\n\nThe previous shader had a compile error. Fix it:\n${compileError}`;
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
      max_tokens: 4096,
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
  if (!text) {
    throw new Error('Empty response from Claude API');
  }

  return extractGLSL(text);
}

export async function generateShaderWithRetry(
  scene: string,
  vibe: string,
  apiKey: string,
  compileError?: string
): Promise<string> {
  return generateShader(scene, vibe, apiKey, compileError);
}
