"""Segmentation via SAM3 (Segment Anything with Concepts) — text-prompted, open vocabulary."""

import numpy as np
from PIL import Image
import logging
import torch

log = logging.getLogger(__name__)

# Text prompts for each audio category → SAM3 segments by concept
CATEGORY_PROMPTS = {
    0: ["person", "animal", "cat", "dog", "bird", "horse", "sculpture", "statue"],
    1: ["tree", "plant", "flower", "grass", "bush", "vegetation", "forest"],
    2: ["sky", "cloud", "sun", "moon", "star", "light", "lamp"],
    3: ["ground", "floor", "water", "sea", "river", "road", "sand", "snow", "rock", "mountain", "dirt"],
    4: ["building", "house", "car", "truck", "bridge", "fence", "chair", "table", "door", "window", "stairs"],
    5: ["wall", "curtain", "ceiling", "painting", "mirror", "screen"],
}

CAT_NAMES = ["BASS_SUBJECT", "MID_ORGANIC", "HIGH_SKY", "BEAT_GROUND", "MID_STRUCTURE", "LOW_AMBIENT"]

_sam3_model = None
_sam3_processor = None


def _load_sam3():
    """Load SAM3 model and processor."""
    global _sam3_model, _sam3_processor
    if _sam3_model is None:
        log.info("Loading SAM3...")
        from sam3.model_builder import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        _sam3_model = build_sam3_image_model()
        _sam3_processor = Sam3Processor(_sam3_model)
        log.info("SAM3 loaded.")
    return _sam3_model, _sam3_processor


def segment_image(
    image: Image.Image,
    dynamic_prompts: dict[int, list[str]] | None = None,
) -> tuple[np.ndarray, list[dict]]:
    """
    Run SAM3 text-prompted segmentation.
    If dynamic_prompts provided, use those instead of static CATEGORY_PROMPTS.
    Returns (segment_map uint8 HxW, detected_segments list of dicts).
    """
    model, processor = _load_sam3()
    w, h = image.size

    active_prompts = dynamic_prompts if dynamic_prompts else CATEGORY_PROMPTS
    log.info(f"Segmenting with {'dynamic' if dynamic_prompts else 'static'} prompts")

    # Default to ambient (category 5)
    segment_map = np.full((h, w), 5, dtype=np.uint8)
    detected = []

    # Set image once
    inference_state = processor.set_image(image)

    # Lower category numbers paint last (higher priority — subjects > ambient)
    for cat_id in sorted(active_prompts.keys(), reverse=True):
        prompts = active_prompts[cat_id]
        cat_pixel_count = 0

        for prompt_text in prompts:
            try:
                output = processor.set_text_prompt(
                    state=inference_state,
                    prompt=prompt_text,
                )
                masks = output.get("masks")
                scores = output.get("scores")

                if masks is None or len(masks) == 0:
                    continue

                # Process each detected instance
                for i, (mask, score) in enumerate(zip(masks, scores)):
                    if score < 0.3:
                        continue

                    # Convert mask to numpy bool array
                    if isinstance(mask, torch.Tensor):
                        mask_np = mask.cpu().numpy().astype(bool)
                    else:
                        mask_np = np.array(mask, dtype=bool)

                    # Handle different mask shapes
                    if mask_np.ndim == 3:
                        mask_np = mask_np[0]  # Take first channel
                    if mask_np.shape != (h, w):
                        mask_np = np.array(
                            Image.fromarray(mask_np.astype(np.uint8) * 255).resize((w, h), Image.NEAREST),
                            dtype=bool,
                        )

                    pixel_count = int(mask_np.sum())
                    if pixel_count < 100:  # Skip tiny detections
                        continue

                    segment_map[mask_np] = cat_id
                    cat_pixel_count += pixel_count

                    pct = pixel_count / (h * w) * 100
                    detected.append({
                        "label": prompt_text,
                        "category": cat_id,
                        "score": round(float(score), 3),
                        "coverage_pct": round(pct, 1),
                    })

            except Exception as e:
                log.warning(f"SAM3 prompt '{prompt_text}' failed: {e}")
                continue

        if cat_pixel_count > 0:
            total_pct = cat_pixel_count / (h * w) * 100
            log.info(f"Category {cat_id} ({CAT_NAMES[cat_id]}): {total_pct:.1f}% coverage")

    return segment_map, detected
