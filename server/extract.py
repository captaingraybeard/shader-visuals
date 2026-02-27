"""Extract scene objects from DALL-E revised prompt → SAM3 category prompts."""

import json
import httpx
import logging

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You extract visible objects from an image description and categorize them for audio-reactive visualization.

Given a scene description, return a JSON object mapping category IDs (0-5) to arrays of specific object keywords that SAM3 can segment.

Categories:
0 = BASS_SUBJECT: Living things, main subjects (people, animals, creatures, sculptures)
1 = MID_ORGANIC: Plants, vegetation (trees, flowers, grass, vines, moss)
2 = HIGH_SKY: Sky, atmosphere, light sources (clouds, sun, moon, stars, lamps, fire, aurora)
3 = BEAT_GROUND: Ground surfaces, terrain, water (floor, road, sand, ocean, river, rocks, mountains, snow)
4 = MID_STRUCTURE: Built objects, vehicles, furniture (buildings, bridges, cars, chairs, doors, columns)
5 = LOW_AMBIENT: Background surfaces, decor (walls, curtains, paintings, fabric, fog, mist)

Rules:
- Only include objects ACTUALLY described in the text
- Use specific nouns SAM3 can detect (e.g. "oak tree" not "nature")
- 3-8 keywords per category that has objects; empty array [] for categories with nothing
- Return ONLY valid JSON, no markdown"""

USER_TEMPLATE = "Scene description: {description}"


async def extract_scene_objects(
    revised_prompt: str,
    api_key: str,
) -> dict[int, list[str]]:
    """
    Use GPT-4o-mini to extract objects from DALL-E's revised prompt,
    categorized into 6 audio-reactive groups.
    Returns dict mapping category_id → list of keyword strings.
    Falls back to empty dict on failure.
    """
    log.info(f"Extracting objects from revised prompt ({len(revised_prompt)} chars)")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": USER_TEMPLATE.format(description=revised_prompt)},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 500,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()

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
            log.info(f"Extracted {total} keywords across {len(result)} categories")
            return result

    except Exception as e:
        log.warning(f"Object extraction failed, using fallback: {e}")
        return {}
