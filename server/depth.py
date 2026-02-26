"""Depth estimation with tiled inference and feathered blending."""

import numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
from .models import get_depth_pipeline
import logging

log = logging.getLogger(__name__)

TILE_SIZE = 512
OVERLAP = 64


def _make_feather_mask(h: int, w: int, overlap: int) -> np.ndarray:
    """Create a feathered blending mask that tapers at edges."""
    mask = np.ones((h, w), dtype=np.float32)
    if overlap > 0:
        for i in range(overlap):
            t = (i + 1) / (overlap + 1)
            mask[i, :] *= t
            mask[h - 1 - i, :] *= t
            mask[:, i] *= t
            mask[:, w - 1 - i] *= t
    return mask


def _process_tile(pipe, tile_img: Image.Image) -> np.ndarray:
    """Run depth estimation on a single tile."""
    result = pipe(tile_img)
    depth = result["depth"]
    if isinstance(depth, Image.Image):
        depth = np.array(depth, dtype=np.float32)
    return depth


def estimate_depth(image: Image.Image) -> np.ndarray:
    """
    Estimate depth with tiled inference, feathered blending.
    Returns float32 array normalized 0-1 (1=close, 0=far).
    """
    pipe = get_depth_pipeline()
    w, h = image.size

    # Small enough for single pass
    if w <= TILE_SIZE and h <= TILE_SIZE:
        depth = _process_tile(pipe, image)
        depth = np.array(Image.fromarray(depth).resize((w, h), Image.BILINEAR))
        mn, mx = depth.min(), depth.max()
        if mx > mn:
            depth = (depth - mn) / (mx - mn)
        return depth.astype(np.float32)

    step = TILE_SIZE - OVERLAP
    tiles = []

    # Collect tile coordinates
    for y in range(0, h, step):
        for x in range(0, w, step):
            x1, y1 = x, y
            x2 = min(x + TILE_SIZE, w)
            y2 = min(y + TILE_SIZE, h)
            # Ensure minimum tile size
            if x2 - x1 < 64 or y2 - y1 < 64:
                continue
            tiles.append((x1, y1, x2, y2))

    log.info(f"Depth: processing {len(tiles)} tiles for {w}x{h} image")

    # Process tiles in parallel
    tile_images = [image.crop((x1, y1, x2, y2)) for x1, y1, x2, y2 in tiles]

    # Serialize on GPU (concurrent inference causes CUDA OOM/race conditions)
    # GPU is fast enough that parallelism isn't needed
    tile_depths = [_process_tile(pipe, t) for t in tile_images]

    # Blend tiles
    accumulated = np.zeros((h, w), dtype=np.float32)
    weights = np.zeros((h, w), dtype=np.float32)

    for (x1, y1, x2, y2), tile_depth in zip(tiles, tile_depths):
        th, tw = y2 - y1, x2 - x1
        # Resize tile depth to match tile dimensions
        tile_depth_resized = np.array(
            Image.fromarray(tile_depth).resize((tw, th), Image.BILINEAR),
            dtype=np.float32,
        )
        mask = _make_feather_mask(th, tw, OVERLAP)
        accumulated[y1:y2, x1:x2] += tile_depth_resized * mask
        weights[y1:y2, x1:x2] += mask

    # Avoid division by zero
    weights = np.maximum(weights, 1e-6)
    depth = accumulated / weights

    # Normalize to 0-1
    mn, mx = depth.min(), depth.max()
    if mx > mn:
        depth = (depth - mn) / (mx - mn)

    return depth.astype(np.float32)
