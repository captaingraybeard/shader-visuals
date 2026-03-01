"""Real-ESRGAN 4x upscaling for higher density point clouds."""

import torch
import numpy as np
from PIL import Image
import logging

log = logging.getLogger(__name__)

_upscale_model = None


def _load_realesrgan():
    """Load Real-ESRGAN x4 model."""
    global _upscale_model
    if _upscale_model is not None:
        return _upscale_model

    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet

    # RRDBNet for RealESRGAN-x4plus
    model = RRDBNet(
        num_in_ch=3, num_out_ch=3, num_feat=64,
        num_block=23, num_grow_ch=32, scale=4,
    )

    from .models import DEVICE

    upsampler = RealESRGANer(
        scale=4,
        model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        model=model,
        tile=512,        # tile to avoid OOM on GPU
        tile_pad=32,
        pre_pad=0,
        half=DEVICE == "cuda",  # fp16 on GPU
        device=DEVICE,
    )

    _upscale_model = upsampler
    log.info(f"Real-ESRGAN x4 loaded on {DEVICE}")
    return _upscale_model


def upscale_image(image: Image.Image) -> Image.Image:
    """Upscale a PIL image 4x using Real-ESRGAN. Returns upscaled PIL Image."""
    upsampler = _load_realesrgan()

    # PIL → numpy BGR (Real-ESRGAN expects BGR uint8)
    img_rgb = np.array(image)
    img_bgr = img_rgb[:, :, ::-1]

    log.info(f"Upscaling {image.size[0]}x{image.size[1]} → {image.size[0]*4}x{image.size[1]*4}")

    with torch.no_grad():
        output_bgr, _ = upsampler.enhance(img_bgr, outscale=4)

    # BGR → RGB → PIL
    output_rgb = output_bgr[:, :, ::-1]
    result = Image.fromarray(output_rgb)
    log.info(f"Upscale complete: {result.size[0]}x{result.size[1]}")
    return result
