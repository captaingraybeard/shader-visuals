"""Lazy model loading and caching."""

import torch
from transformers import pipeline
from .config import settings
import logging

log = logging.getLogger(__name__)

_depth_pipe = None
_seg_pipe = None
_sam2_model = None
_sam2_processor = None

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def get_depth_pipeline():
    """Load Depth Anything V2 Large via HuggingFace transformers pipeline."""
    global _depth_pipe
    if _depth_pipe is None:
        log.info(f"Loading Depth Anything V2 Large on {DEVICE}...")
        _depth_pipe = pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Large-hf",
            device=DEVICE,
        )
        log.info("Depth model loaded.")
    return _depth_pipe


def get_segmentation_pipeline():
    """Load MaskFormer ADE20K for semantic segmentation (labels + masks)."""
    global _seg_pipe
    if _seg_pipe is None:
        log.info(f"Loading MaskFormer Swin-Large ADE20K on {DEVICE}...")
        _seg_pipe = pipeline(
            "image-segmentation",
            model="facebook/maskformer-swin-large-ade",
            device=DEVICE,
        )
        log.info("Segmentation model loaded.")
    return _seg_pipe


def get_sam2_model():
    """Load SAM2 for pixel-perfect instance masks."""
    global _sam2_model, _sam2_processor
    if _sam2_model is None:
        try:
            log.info("Loading SAM2...")
            from sam2.build_sam import build_sam2
            from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
            import torch

            # Use sam2-hiera-small for reasonable size
            sam2 = build_sam2(
                "configs/sam2.1/sam2.1_hiera_s.yaml",
                "facebook/sam2.1-hiera-small",
                device="cpu",
            )
            _sam2_model = SAM2AutomaticMaskGenerator(
                sam2,
                points_per_side=32,
                pred_iou_thresh=0.7,
                stability_score_thresh=0.8,
                min_mask_region_area=100,
            )
            log.info("SAM2 loaded.")
        except Exception as e:
            log.warning(f"SAM2 failed to load: {e}. Falling back to MaskFormer only.")
            _sam2_model = "failed"
    return _sam2_model if _sam2_model != "failed" else None


def load_all_models():
    """Eagerly load all configured models at startup."""
    log.info("Loading all models...")
    get_depth_pipeline()
    get_segmentation_pipeline()
    if settings.SEG_MODEL == "sam2":
        get_sam2_model()
    log.info("All models loaded.")


def get_loaded_models() -> dict:
    """Return status of loaded models."""
    return {
        "depth": "depth-anything/Depth-Anything-V2-Large-hf" if _depth_pipe else None,
        "segmentation": "facebook/maskformer-swin-large-ade" if _seg_pipe else None,
        "sam2": "facebook/sam2.1-hiera-small" if (_sam2_model and _sam2_model != "failed") else None,
    }
