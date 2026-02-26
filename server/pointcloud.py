"""Numpy-vectorized point cloud construction. No Python loops over pixels."""

import numpy as np
from PIL import Image
import struct


def build_point_cloud(
    image: Image.Image,
    depth: np.ndarray,
    segments: np.ndarray,
    mode: str = "standard",
) -> tuple[bytes, int]:
    """
    Build packed binary point cloud from image + depth + segments.
    
    Modes:
        standard/planar: X/Y grid, Z from depth
        panorama/equirectangular: lon/lat sphere mapping
    
    Returns (packed_bytes, point_count).
    Binary layout per point (20 bytes):
        position: 3 x float32 (12 bytes)
        color: 3 x uint8 (3 bytes)
        segment: 1 x uint8 (1 byte)
        padding: 4 bytes
    """
    img_arr = np.array(image, dtype=np.uint8)  # H x W x 3
    h, w = depth.shape

    # Ensure image matches depth dimensions
    if img_arr.shape[:2] != (h, w):
        img_arr = np.array(image.resize((w, h), Image.BILINEAR), dtype=np.uint8)
    if segments.shape != (h, w):
        segments = np.array(
            Image.fromarray(segments).resize((w, h), Image.NEAREST), dtype=np.uint8
        )

    if mode == "panorama":
        # Equirectangular → sphere
        # lon: 0..2π across width, lat: 0..π across height
        u = np.linspace(0, 1, w, dtype=np.float32)
        v = np.linspace(0, 1, h, dtype=np.float32)
        uu, vv = np.meshgrid(u, v)  # H x W

        lon = uu * 2.0 * np.pi  # 0..2π
        lat = vv * np.pi         # 0..π

        r = depth * 9.0 + 1.0  # depth → radius (1..10)

        x = (r * np.sin(lat) * np.cos(lon)).astype(np.float32)
        y = (r * np.cos(lat)).astype(np.float32)
        z = (r * np.sin(lat) * np.sin(lon)).astype(np.float32)
    else:
        # Planar projection
        u = np.linspace(-1, 1, w, dtype=np.float32)
        v = np.linspace(-1, 1, h, dtype=np.float32)
        xx, yy = np.meshgrid(u, v)

        x = xx
        y = -yy  # flip Y
        z = (depth * 2.0 - 1.0).astype(np.float32)  # depth → Z (-1..1)

    # Flatten everything
    point_count = h * w
    positions = np.stack([x, y, z], axis=-1).reshape(point_count, 3)  # N x 3
    colors = img_arr.reshape(point_count, 3)  # N x 3 uint8
    segs = segments.reshape(point_count)  # N uint8
    padding = np.zeros(point_count, dtype=np.uint8)  # alignment padding

    # Pack: float32[3] + uint8[3] + uint8 + uint8[4] padding = 20 bytes per point
    # Actually: 12 + 3 + 1 + 4 = 20 bytes
    # Use structured array for efficient packing
    dt = np.dtype([
        ("pos", np.float32, (3,)),
        ("color", np.uint8, (3,)),
        ("segment", np.uint8),
        ("pad", np.uint8, (4,)),
    ])
    packed = np.zeros(point_count, dtype=dt)
    packed["pos"] = positions
    packed["color"] = colors
    packed["segment"] = segs

    return packed.tobytes(), point_count
