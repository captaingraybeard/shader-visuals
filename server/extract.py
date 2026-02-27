"""Extract scene objects from generated image via GPT-4o Vision → SAM3 category prompts."""

import json
import base64
import httpx
import logging
from io import BytesIO
from PIL import Image

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You analyze images and identify all visible objects, categorizing them for audio-reactive visualization.

Look at the image carefully and return a JSON object mapping category IDs (0-5) to arrays of specific object keywords that a segmentation model can detect.

Categories:
0 = BASS_SUBJECT: Living things, main subjects (people, animals, creatures, sculptures, figures)
1 = MID_ORGANIC: Plants, vegetation (trees, flowers, grass, vines, moss, leaves, bushes)
2 = HIGH_SKY: Sky, atmosphere, light sources (clouds, sun, moon, stars, lamps, fire, aurora, lightning)
3 = BEAT_GROUND: Ground surfaces, terrain, water (floor, road, sand, ocean, river, rocks, mountains, snow, dirt, path)
4 = MID_STRUCTURE: Built objects, vehicles, furniture (buildings, bridges, cars, chairs, doors, columns, walls, fences)
5 = LOW_AMBIENT: Background surfaces, decor, atmosphere (curtains, paintings, fabric, fog, mist, smoke, shadows)

Rules:
- List EVERY distinct object/element you can see in the image
- Use specific, concrete nouns (e.g. "jaguar", "palm tree", "mossy rock" — not "nature" or "scenery")
- 3-8 keywords per category that has visible objects; empty array [] for categories with nothing
- Be thorough — if you see it, list it
- Return ONLY valid JSON, no markdown fences, no explanation"""


async def extract_scene_objects(
    image: Image.Image,
    api_key: str,
    revised_prompt: str = "",
) -> dict[int, list[str]]:
    """
    Use GPT-4o-mini vision to identify objects in the generated image,
    categorized into 6 audio-reactive groups.
    Returns dict mapping category_id → list of keyword strings.
    Falls back to empty dict on failure.
    """
    log.info("Extracting objects from generated image via GPT-4o-mini vision")

    try:
        # Encode image as base64 JPEG (resize for efficiency)
        img_for_api = image.copy()
        img_for_api.thumbnail((1024, 1024))
        buf = BytesIO()
        img_for_api.save(buf, format="JPEG", quality=80)
        img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        user_content = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "high"},
            },
            {
                "type": "text",
                "text": "Identify all visible objects in this image and categorize them.",
            },
        ]

        # Add revised prompt as context if available
        if revised_prompt:
            user_content.append({
                "type": "text",
                "text": f"Scene context: {revised_prompt}",
            })

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 500,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()

            log.info(f"GPT-4o-mini raw response: {content}")

            # Parse JSON (strip markdown fences if present)
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            raw = json.loads(content)

            # Normalize keys to int
            result = {}
            for k, v in raw.items():
                cat_id = int(k)
                if 0 <= cat_id <= 5 and isinstance(v, list) and len(v) > 0:
                    result[cat_id] = [str(s) for s in v]

            total = sum(len(v) for v in result.values())
            log.info(f"Extracted {total} keywords across {len(result)} categories:")
            cat_names = ["BASS_SUBJECT", "MID_ORGANIC", "HIGH_SKY", "BEAT_GROUND", "MID_STRUCTURE", "LOW_AMBIENT"]
            for cat_id in sorted(result.keys()):
                log.info(f"  [{cat_id}] {cat_names[cat_id]}: {result[cat_id]}")

            return result

    except Exception as e:
        log.warning(f"Object extraction failed, using fallback: {e}")
        return {}
