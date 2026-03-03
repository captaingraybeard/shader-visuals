"""Real-ESRGAN 4x upscaling — pure PyTorch, no basicsr/realesrgan deps."""

import os
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from PIL import Image
import logging
import urllib.request

log = logging.getLogger(__name__)

MODEL_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
MODEL_PATH = "/tmp/RealESRGAN_x4plus.pth"

_upscale_model = None


# --- RRDBNet architecture (standalone, no basicsr) ---

class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, in_nc=3, out_nc=3, nf=64, nb=23, gc=32, scale=4):
        super().__init__()
        self.scale = scale
        self.conv_first = nn.Conv2d(in_nc, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        # Upsampling
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, out_nc, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        # 4x upscale via 2x nearest + conv twice
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


# --- Tiled inference (avoids GPU OOM on large images) ---

def tile_inference(model, img_tensor, tile_size=512, tile_pad=32, scale=4, half=True):
    """Run model on overlapping tiles and stitch results."""
    _, _, h, w = img_tensor.shape
    out_h, out_w = h * scale, w * scale
    output = torch.empty((1, 3, out_h, out_w), dtype=img_tensor.dtype, device=img_tensor.device)

    tiles_y = (h + tile_size - 1) // tile_size
    tiles_x = (w + tile_size - 1) // tile_size

    for ty in range(tiles_y):
        for tx in range(tiles_x):
            # Input tile bounds with padding
            y0 = ty * tile_size
            x0 = tx * tile_size
            y1 = min(y0 + tile_size, h)
            x1 = min(x0 + tile_size, w)

            # Add padding
            py0 = max(y0 - tile_pad, 0)
            px0 = max(x0 - tile_pad, 0)
            py1 = min(y1 + tile_pad, h)
            px1 = min(x1 + tile_pad, w)

            tile_in = img_tensor[:, :, py0:py1, px0:px1]
            if half:
                tile_in = tile_in.half()

            with torch.no_grad():
                tile_out = model(tile_in)

            # Output bounds (scaled)
            oy0 = (y0 - py0) * scale
            ox0 = (x0 - px0) * scale
            oy1 = oy0 + (y1 - y0) * scale
            ox1 = ox0 + (x1 - x0) * scale

            output[:, :, y0*scale:y1*scale, x0*scale:x1*scale] = tile_out[:, :, oy0:oy1, ox0:ox1]

    return output


# --- Public API ---

def _load_realesrgan():
    """Load Real-ESRGAN x4 model weights."""
    global _upscale_model
    if _upscale_model is not None:
        return _upscale_model

    from .models import DEVICE

    # Download weights if needed
    if not os.path.exists(MODEL_PATH):
        log.info(f"Downloading Real-ESRGAN weights...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

    model = RRDBNet(in_nc=3, out_nc=3, nf=64, nb=23, gc=32, scale=4)

    state_dict = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
    # Some checkpoints wrap in 'params_ema' or 'params'
    if 'params_ema' in state_dict:
        state_dict = state_dict['params_ema']
    elif 'params' in state_dict:
        state_dict = state_dict['params']

    model.load_state_dict(state_dict, strict=True)
    model.eval()
    model = model.to(DEVICE)
    if DEVICE == "cuda":
        model = model.half()

    _upscale_model = (model, DEVICE)
    log.info(f"Real-ESRGAN x4 loaded on {DEVICE} (standalone, no basicsr)")
    return _upscale_model


def upscale_image(image: Image.Image) -> Image.Image:
    """Upscale a PIL image 4x using Real-ESRGAN. Returns upscaled PIL Image."""
    model, device = _load_realesrgan()

    # PIL RGB → float32 tensor [0, 1] in BGR order (matching training)
    img_np = np.array(image).astype(np.float32) / 255.0
    # RGB to BGR
    img_np = img_np[:, :, ::-1].copy()
    # HWC → NCHW
    img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)

    log.info(f"Upscaling {image.size[0]}x{image.size[1]} → {image.size[0]*4}x{image.size[1]*4}")

    use_half = device == "cuda"
    output = tile_inference(model, img_tensor, tile_size=512, tile_pad=32, scale=4, half=use_half)

    # NCHW → HWC, BGR → RGB, clamp, uint8
    out_np = output.squeeze(0).float().clamp(0, 1).permute(1, 2, 0).cpu().numpy()
    out_np = (out_np[:, :, ::-1] * 255).round().astype(np.uint8)

    result = Image.fromarray(out_np)
    log.info(f"Upscale complete: {result.size[0]}x{result.size[1]}")
    return result
