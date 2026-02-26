"""Model loading and caching."""

import torch
from transformers import pipeline
from .config import settings
import logging

log = logging.getLogger(__name__)

_depth_pipe = None

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


def load_all_models():
    """Eagerly load all models at startup."""
    log.info("Loading all models...")
    get_depth_pipeline()

    # Load SAM3 (imported from segment.py to keep it self-contained)
    from .segment import _load_sam3
    _load_sam3()

    log.info(f"All models loaded on {DEVICE}.")


def get_loaded_models() -> dict:
    """Return status of loaded models."""
    from .segment import _sam3_model
    return {
        "depth": "depth-anything/Depth-Anything-V2-Large-hf" if _depth_pipe else None,
        "segmentation": "facebook/sam3" if _sam3_model else None,
    }
