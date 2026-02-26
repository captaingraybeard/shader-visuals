"""Semantic segmentation using MaskFormer ADE20K pipeline."""

import numpy as np
from PIL import Image
from .models import get_segmentation_pipeline
import logging

log = logging.getLogger(__name__)

# ADE20K label → audio category mapping
# 0=BASS_SUBJECT (people/animals), 1=MID_ORGANIC (trees/plants),
# 2=HIGH_SKY (sky/clouds), 3=BEAT_GROUND (ground/water),
# 4=MID_STRUCTURE (buildings/vehicles), 5=LOW_AMBIENT (walls/misc)

LABEL_TO_CATEGORY = {
    # BASS_SUBJECT (0) — people, animals
    "person": 0, "people": 0, "animal": 0, "dog": 0, "cat": 0, "bird": 0,
    "horse": 0, "cow": 0, "sheep": 0, "elephant": 0, "bear": 0, "zebra": 0,
    "giraffe": 0, "sculpture": 0, "statue": 0,
    # MID_ORGANIC (1) — trees, plants, nature
    "tree": 1, "palm": 1, "plant": 1, "flower": 1, "grass": 1, "bush": 1,
    "leaves": 1, "branch": 1, "hedge": 1, "forest": 1, "vegetation": 1,
    "flora": 1, "shrub": 1,
    # HIGH_SKY (2) — sky, clouds, lights
    "sky": 2, "cloud": 2, "sun": 2, "moon": 2, "star": 2, "light": 2,
    "lamp": 2, "chandelier": 2, "ceiling": 2, "candle": 2,
    # BEAT_GROUND (3) — ground, water, terrain
    "floor": 3, "ground": 3, "earth": 3, "sand": 3, "snow": 3, "water": 3,
    "sea": 3, "river": 3, "lake": 3, "pool": 3, "road": 3, "path": 3,
    "sidewalk": 3, "pavement": 3, "field": 3, "rock": 3, "stone": 3,
    "mountain": 3, "hill": 3, "dirt": 3, "mud": 3, "carpet": 3, "rug": 3,
    "terrain": 3,
    # MID_STRUCTURE (4) — buildings, vehicles, furniture
    "building": 4, "house": 4, "tower": 4, "bridge": 4, "fence": 4,
    "car": 4, "truck": 4, "bus": 4, "train": 4, "boat": 4, "ship": 4,
    "airplane": 4, "bicycle": 4, "motorcycle": 4, "chair": 4, "table": 4,
    "desk": 4, "bed": 4, "sofa": 4, "couch": 4, "bench": 4, "door": 4,
    "window": 4, "stairway": 4, "stairs": 4, "column": 4, "pillar": 4,
    "roof": 4, "tent": 4, "shelter": 4, "cabinet": 4, "counter": 4,
    "bookcase": 4, "shelf": 4, "furniture": 4, "vehicle": 4, "railing": 4,
    # LOW_AMBIENT (5) — walls, misc
    "wall": 5, "curtain": 5, "blind": 5, "screen": 5, "mirror": 5,
    "painting": 5, "poster": 5, "banner": 5, "flag": 5, "sign": 5,
    "box": 5, "bag": 5, "blanket": 5, "towel": 5, "cloth": 5,
}


def _label_to_category(label: str) -> int:
    """Map an ADE20K label string to one of 6 audio categories."""
    label_lower = label.lower().strip()
    # Direct match
    if label_lower in LABEL_TO_CATEGORY:
        return LABEL_TO_CATEGORY[label_lower]
    # Substring match
    for key, cat in LABEL_TO_CATEGORY.items():
        if key in label_lower or label_lower in key:
            return cat
    return 5  # Default to LOW_AMBIENT


def segment_image(image: Image.Image) -> tuple[np.ndarray, list[dict]]:
    """
    Run semantic segmentation on an image.
    Returns (segment_map uint8 HxW, detected_segments list of dicts).
    """
    pipe = get_segmentation_pipeline()
    w, h = image.size

    results = pipe(image)

    segment_map = np.full((h, w), 5, dtype=np.uint8)  # default LOW_AMBIENT
    detected = []

    for seg in results:
        label = seg["label"]
        score = seg.get("score", 0.0)
        mask = np.array(seg["mask"].resize((w, h), Image.NEAREST), dtype=bool)
        category = _label_to_category(label)
        pixel_count = mask.sum()
        pct = pixel_count / (h * w) * 100

        segment_map[mask] = category
        detected.append({
            "label": label,
            "category": category,
            "score": round(score, 3),
            "coverage_pct": round(pct, 1),
        })

    cat_names = ["BASS_SUBJECT", "MID_ORGANIC", "HIGH_SKY", "BEAT_GROUND", "MID_STRUCTURE", "LOW_AMBIENT"]
    log.info(f"Segmentation: {len(detected)} segments detected")
    for d in sorted(detected, key=lambda x: -x["coverage_pct"])[:5]:
        log.info(f"  {d['label']} → {cat_names[d['category']]} ({d['coverage_pct']:.1f}%)")

    return segment_map, detected
