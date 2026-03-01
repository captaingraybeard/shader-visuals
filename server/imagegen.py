"""DALL-E 3 image generation wrapper."""

import httpx
from PIL import Image
from io import BytesIO
import base64
import logging

log = logging.getLogger(__name__)

PANORAMA_PREFIX = (
    "Create a seamless 360-degree equirectangular panorama image. "
    "The image should wrap continuously from left to right edge with no visible seam. "
    "Use equirectangular projection where the horizontal axis represents 360° longitude "
    "and the vertical axis represents 180° latitude. "
    "Scene description: "
)


async def generate_image(
    prompt: str,
    api_key: str,
    mode: str = "standard",
    vibe: str = "",
) -> tuple[Image.Image, str]:
    """Generate an image via DALL-E 3. Returns (PIL Image, revised_prompt)."""
    if mode == "panorama":
        full_prompt = PANORAMA_PREFIX + prompt
        if vibe:
            full_prompt += f" Mood/vibe: {vibe}."
        full_prompt += " Ultra wide, highly detailed, cinematic."
        size = "1792x1024"
    else:
        full_prompt = f"Ultra wide panoramic view, immersive environment, highly detailed, cinematic, {prompt}. Wide angle, showing full surrounding environment."
        if vibe:
            full_prompt += f" Mood/vibe: {vibe}."
        size = "1792x1024"

    log.info(f"Generating image: mode={mode}, size={size}")

    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "dall-e-3",
                        "prompt": full_prompt,
                        "n": 1,
                        "size": size,
                        "response_format": "b64_json",
                        "quality": "hd",
                    },
                )
                if resp.status_code >= 500:
                    # OpenAI server error — retry
                    body = resp.text
                    log.warning(f"OpenAI 5xx (attempt {attempt+1}/{max_retries}): {resp.status_code} {body[:200]}")
                    last_error = f"OpenAI {resp.status_code}: {body[:300]}"
                    if attempt < max_retries - 1:
                        import asyncio
                        await asyncio.sleep(2 * (attempt + 1))
                        continue
                    raise RuntimeError(last_error)

                if resp.status_code != 200:
                    # Client error (4xx) — don't retry
                    try:
                        err = resp.json()
                        msg = err.get("error", {}).get("message", resp.text[:300])
                    except Exception:
                        msg = resp.text[:300]
                    raise RuntimeError(f"OpenAI {resp.status_code}: {msg}")

                data = resp.json()
                break
        except httpx.TimeoutException:
            log.warning(f"OpenAI timeout (attempt {attempt+1}/{max_retries})")
            last_error = "OpenAI request timed out"
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(last_error)
    else:
        raise RuntimeError(last_error or "Image generation failed after retries")

    item = data["data"][0]
    b64 = item["b64_json"]
    revised_prompt = item.get("revised_prompt", "")
    img_bytes = base64.b64decode(b64)
    image = Image.open(BytesIO(img_bytes)).convert("RGB")
    return image, revised_prompt
