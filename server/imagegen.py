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
) -> Image.Image:
    """Generate an image via DALL-E 3. Returns PIL Image."""
    if mode == "panorama":
        full_prompt = PANORAMA_PREFIX + prompt
        if vibe:
            full_prompt += f" Mood/vibe: {vibe}."
        size = "1792x1024"
    else:
        full_prompt = prompt
        if vibe:
            full_prompt += f" Mood/vibe: {vibe}."
        size = "1024x1024"

    log.info(f"Generating image: mode={mode}, size={size}")

    async with httpx.AsyncClient(timeout=60.0) as client:
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
        resp.raise_for_status()
        data = resp.json()

    b64 = data["data"][0]["b64_json"]
    img_bytes = base64.b64decode(b64)
    return Image.open(BytesIO(img_bytes)).convert("RGB")
