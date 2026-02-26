"""Lazy model loading and caching."""

from functools import lru_cache
from transformers import pipeline
import logging

log = logging.getLogger(__name__)

_depth_pipe = None
_seg_pipe = None


def get_depth_pipeline():
    """Load Depth Anything V2 Large via HuggingFace transformers pipeline."""
    global _depth_pipe
    if _depth_pipe is None:
        log.info("Loading Depth Anything V2 Large...")
        _depth_pipe = pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Large-hf",
            device="cpu",
        )
        log.info("Depth model loaded.")
    return _depth_pipe


def get_segmentation_pipeline():
    """Load MaskFormer ADE20K via HuggingFace transformers pipeline."""
    global _seg_pipe
    if _seg_pipe is None:
        log.info("Loading MaskFormer ADE20K...")
        _seg_pipe = pipeline(
            "image-segmentation",
            model="facebook/maskformer-swin-base-ade",
            device="cpu",
        )
        log.info("Segmentation model loaded.")
    return _seg_pipe


def get_loaded_models() -> dict:
    """Return status of loaded models."""
    return {
        "depth": "depth-anything/Depth-Anything-V2-Large-hf" if _depth_pipe else None,
        "segmentation": "facebook/maskformer-swin-base-ade" if _seg_pipe else None,
    }
