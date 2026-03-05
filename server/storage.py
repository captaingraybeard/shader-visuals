"""Save and retrieve generations on disk."""

import json
import uuid
import os
from pathlib import Path
from PIL import Image
import numpy as np
from .config import settings

# Color palette for segment visualization
SEGMENT_COLORS = [
    (220, 50, 50),    # 0 BASS_SUBJECT — red
    (50, 180, 50),    # 1 MID_ORGANIC — green
    (100, 180, 255),  # 2 HIGH_SKY — light blue
    (180, 140, 60),   # 3 BEAT_GROUND — brown
    (160, 100, 200),  # 4 MID_STRUCTURE — purple
    (128, 128, 128),  # 5 LOW_AMBIENT — gray
]


def _segments_to_color(segments: np.ndarray) -> Image.Image:
    """Convert segment index map to color-coded RGB image."""
    h, w = segments.shape
    color_img = np.zeros((h, w, 3), dtype=np.uint8)
    for i, c in enumerate(SEGMENT_COLORS):
        mask = segments == i
        color_img[mask] = c
    return Image.fromarray(color_img)


# 32 distinct colors for object visualization (cycles for >32 objects)
OBJECT_COLORS = [
    (255, 0, 0), (0, 255, 0), (0, 100, 255), (255, 255, 0),
    (255, 0, 255), (0, 255, 255), (255, 128, 0), (128, 0, 255),
    (0, 255, 128), (255, 0, 128), (128, 255, 0), (0, 128, 255),
    (255, 128, 128), (128, 255, 128), (128, 128, 255), (255, 255, 128),
    (255, 128, 255), (128, 255, 255), (200, 80, 80), (80, 200, 80),
    (80, 80, 200), (200, 200, 80), (200, 80, 200), (80, 200, 200),
    (160, 40, 40), (40, 160, 40), (40, 40, 160), (160, 160, 40),
    (160, 40, 160), (40, 160, 160), (220, 120, 60), (60, 120, 220),
]


def _objects_to_color(object_map: np.ndarray) -> Image.Image:
    """Convert per-object ID map to color-coded RGB image. ID 0 = black (background)."""
    h, w = object_map.shape
    color_img = np.zeros((h, w, 3), dtype=np.uint8)
    for obj_id in range(1, int(object_map.max()) + 1):
        mask = object_map == obj_id
        color = OBJECT_COLORS[(obj_id - 1) % len(OBJECT_COLORS)]
        color_img[mask] = color
    return Image.fromarray(color_img)


def save_generation(
    image: Image.Image,
    depth: np.ndarray,
    segments: np.ndarray,
    metadata: dict,
    object_map: np.ndarray | None = None,
) -> str:
    """Save generation to disk. Returns generation UUID."""
    gen_id = str(uuid.uuid4())
    gen_dir = Path(settings.DATA_DIR) / "generations" / gen_id
    gen_dir.mkdir(parents=True, exist_ok=True)

    image.save(gen_dir / "image.png")

    # Depth as grayscale PNG
    depth_uint8 = (depth * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(depth_uint8, mode="L").save(gen_dir / "depth.png")

    # Segments as color-coded PNG (by category)
    _segments_to_color(segments).save(gen_dir / "segments.png")

    # Objects as color-coded PNG (by individual object ID)
    if object_map is not None and object_map.max() > 0:
        _objects_to_color(object_map).save(gen_dir / "objects.png")

    metadata["generation_id"] = gen_id
    with open(gen_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    return gen_id


def get_generation(gen_id: str) -> dict | None:
    """Load generation metadata."""
    meta_path = Path(settings.DATA_DIR) / "generations" / gen_id / "metadata.json"
    if not meta_path.exists():
        return None
    with open(meta_path) as f:
        return json.load(f)


def get_asset_path(gen_id: str, asset: str) -> Path | None:
    """Get path to a generation asset file."""
    allowed = {"image.png", "depth.png", "segments.png", "objects.png", "metadata.json"}
    if asset not in allowed:
        return None
    path = Path(settings.DATA_DIR) / "generations" / gen_id / asset
    return path if path.exists() else None
