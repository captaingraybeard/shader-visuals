"""Hybrid segmentation: SAM2 masks + MaskFormer labels, or MaskFormer-only fallback."""

import numpy as np
from PIL import Image
from .models import get_segmentation_pipeline, get_sam2_model
from .config import settings
import logging

log = logging.getLogger(__name__)

# ADE20K label → audio category mapping
LABEL_TO_CATEGORY = {
    # BASS_SUBJECT (0) — people, animals
    "person": 0, "people": 0, "animal": 0, "dog": 0, "cat": 0, "bird": 0,
    "horse": 0, "cow": 0, "sheep": 0, "elephant": 0, "bear": 0, "zebra": 0,
    "giraffe": 0, "sculpture": 0, "statue": 0,
    # MID_ORGANIC (1) — trees, plants, nature
    "tree": 1, "palm": 1, "plant": 1, "flower": 1, "grass": 1, "bush": 1,
    "leaves": 1, "branch": 1, "hedge": 1, "forest": 1, "vegetation": 1,
    "flora": 1, "shrub": 1, "field": 1,
    # HIGH_SKY (2) — sky, clouds, lights
    "sky": 2, "cloud": 2, "sun": 2, "moon": 2, "star": 2, "light": 2,
    "lamp": 2, "chandelier": 2, "candle": 2,
    # BEAT_GROUND (3) — ground, water, terrain
    "floor": 3, "ground": 3, "earth": 3, "sand": 3, "snow": 3, "water": 3,
    "sea": 3, "river": 3, "lake": 3, "pool": 3, "road": 3, "path": 3,
    "sidewalk": 3, "pavement": 3, "rock": 3, "stone": 3,
    "mountain": 3, "hill": 3, "dirt": 3, "mud": 3, "carpet": 3, "rug": 3,
    "terrain": 3, "waterfall": 3, "swimming pool": 3,
    # MID_STRUCTURE (4) — buildings, vehicles, furniture
    "building": 4, "house": 4, "tower": 4, "bridge": 4, "fence": 4,
    "car": 4, "truck": 4, "bus": 4, "train": 4, "boat": 4, "ship": 4,
    "airplane": 4, "bicycle": 4, "motorcycle": 4, "chair": 4, "table": 4,
    "desk": 4, "bed": 4, "sofa": 4, "couch": 4, "bench": 4, "door": 4,
    "window": 4, "stairway": 4, "stairs": 4, "column": 4, "pillar": 4,
    "roof": 4, "tent": 4, "shelter": 4, "cabinet": 4, "counter": 4,
    "bookcase": 4, "shelf": 4, "railing": 4, "skyscraper": 4,
    # LOW_AMBIENT (5) — walls, misc
    "wall": 5, "curtain": 5, "blind": 5, "screen": 5, "mirror": 5,
    "ceiling": 5, "painting": 5, "poster": 5, "banner": 5, "flag": 5,
    "box": 5, "bag": 5, "blanket": 5, "towel": 5, "cloth": 5,
}

CAT_NAMES = ["BASS_SUBJECT", "MID_ORGANIC", "HIGH_SKY", "BEAT_GROUND", "MID_STRUCTURE", "LOW_AMBIENT"]


def _label_to_category(label: str) -> int:
    """Map an ADE20K label string to one of 6 audio categories."""
    label_lower = label.lower().strip()
    if label_lower in LABEL_TO_CATEGORY:
        return LABEL_TO_CATEGORY[label_lower]
    for key, cat in LABEL_TO_CATEGORY.items():
        if key in label_lower or label_lower in key:
            return cat
    return 5


def _segment_maskformer_only(image: Image.Image) -> tuple[np.ndarray, list[dict]]:
    """MaskFormer-only segmentation (fallback)."""
    pipe = get_segmentation_pipeline()
    w, h = image.size

    results = pipe(image)

    segment_map = np.full((h, w), 5, dtype=np.uint8)
    detected = []

    # Sort by score ascending so highest confidence paints last (wins)
    sorted_results = sorted(results, key=lambda x: x.get("score", 0))

    for seg in sorted_results:
        label = seg["label"]
        score = seg.get("score", 0.0)
        if score < 0.3:
            continue
        mask = np.array(seg["mask"].resize((w, h), Image.NEAREST), dtype=bool)
        category = _label_to_category(label)
        pixel_count = int(mask.sum())
        pct = pixel_count / (h * w) * 100

        segment_map[mask] = category
        detected.append({
            "label": label,
            "category": category,
            "score": round(score, 3),
            "coverage_pct": round(pct, 1),
        })

    return segment_map, detected


def _segment_sam2_hybrid(image: Image.Image) -> tuple[np.ndarray, list[dict]]:
    """
    Hybrid: SAM2 for pixel-perfect masks + MaskFormer for semantic labels.
    
    1. Run SAM2 automatic mask generation → pixel-perfect instance masks
    2. Run MaskFormer → semantic label map at image resolution
    3. For each SAM2 mask, find the dominant MaskFormer label within it
    4. Assign the corresponding audio category
    """
    sam2_gen = get_sam2_model()
    if sam2_gen is None:
        log.warning("SAM2 not available, falling back to MaskFormer only")
        return _segment_maskformer_only(image)

    w, h = image.size
    img_arr = np.array(image)

    # Step 1: SAM2 masks
    log.info("Running SAM2 automatic mask generation...")
    sam2_masks = sam2_gen.generate(img_arr)
    log.info(f"SAM2: {len(sam2_masks)} masks generated")

    # Step 2: MaskFormer semantic labels
    log.info("Running MaskFormer for semantic labels...")
    pipe = get_segmentation_pipeline()
    mf_results = pipe(image)

    # Build MaskFormer label map
    mf_label_map = np.full((h, w), 5, dtype=np.uint8)  # default ambient
    for seg in sorted(mf_results, key=lambda x: x.get("score", 0)):
        label = seg["label"]
        score = seg.get("score", 0.0)
        if score < 0.3:
            continue
        mask = np.array(seg["mask"].resize((w, h), Image.NEAREST), dtype=bool)
        mf_label_map[mask] = _label_to_category(label)

    # Step 3: For each SAM2 mask, assign the dominant MaskFormer category
    segment_map = np.full((h, w), 5, dtype=np.uint8)
    detected = []

    # Sort SAM2 masks by area (smallest last = highest priority paint)
    sam2_masks_sorted = sorted(sam2_masks, key=lambda m: m["area"], reverse=True)

    for mask_data in sam2_masks_sorted:
        mask = mask_data["segmentation"]  # bool array H×W
        if mask.shape != (h, w):
            # Resize if needed
            mask = np.array(
                Image.fromarray(mask.astype(np.uint8) * 255).resize((w, h), Image.NEAREST),
                dtype=bool,
            )

        # Find dominant category in this mask region
        region_cats = mf_label_map[mask]
        if len(region_cats) == 0:
            continue
        # Mode (most common category)
        cats, counts = np.unique(region_cats, return_counts=True)
        dominant_cat = int(cats[np.argmax(counts)])

        segment_map[mask] = dominant_cat
        pixel_count = int(mask.sum())
        pct = pixel_count / (h * w) * 100

        detected.append({
            "label": f"sam2_region→{CAT_NAMES[dominant_cat]}",
            "category": dominant_cat,
            "score": round(mask_data.get("predicted_iou", 0.0), 3),
            "coverage_pct": round(pct, 1),
        })

    return segment_map, detected


def segment_image(image: Image.Image) -> tuple[np.ndarray, list[dict]]:
    """
    Run segmentation on an image.
    Uses SAM2 hybrid if configured and available, otherwise MaskFormer only.
    Returns (segment_map uint8 HxW, detected_segments list of dicts).
    """
    if settings.SEG_MODEL == "sam2":
        try:
            return _segment_sam2_hybrid(image)
        except Exception as e:
            log.error(f"SAM2 hybrid failed: {e}, falling back to MaskFormer")
            return _segment_maskformer_only(image)
    else:
        return _segment_maskformer_only(image)
