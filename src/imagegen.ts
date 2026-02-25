// DALL-E 3 image generation via OpenAI API

const DALLE_URL = 'https://api.openai.com/v1/images/generations';

export async function generateImage(
  prompt: string,
  apiKey: string,
): Promise<HTMLImageElement> {
  const enhancedPrompt = `Highly detailed, cinematic, ${prompt}`;

  const res = await fetch(DALLE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: enhancedPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error('Invalid OpenAI API key');
    if (res.status === 429) throw new Error('Rate limit — try again shortly');
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const b64: string = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from DALL-E');

  return loadImageFromBase64(b64);
}

function loadImageFromBase64(b64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode generated image'));
    img.src = `data:image/png;base64,${b64}`;
  });
}
