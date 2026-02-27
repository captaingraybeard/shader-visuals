"""Numpy-vectorized point cloud construction. No Python loops over pixels."""

import numpy as np
from PIL import Image
import struct


def build_point_cloud(
    image: Image.Image,
    depth: np.ndarray,
    segments: np.ndarray,
    mode: str = "standard",
    stride: int = 1,
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
        # Equirectangular → sphere (matches client: BASE_RADIUS=10, DEPTH_RANGE=4)
        BASE_RADIUS = 10.0
        DEPTH_RANGE = 4.0
        
        u = np.linspace(0, 1, w, dtype=np.float32)
        v = np.linspace(0, 1, h, dtype=np.float32)
        uu, vv = np.meshgrid(u, v)  # H x W

        lon = uu * 2.0 * np.pi  # 0..2π
        lat = vv * np.pi         # 0..π

        # Close objects push outward (larger radius), far stay at base
        r = BASE_RADIUS - (1.0 - depth) * DEPTH_RANGE

        sin_lat = np.sin(lat)
        cos_lat = np.cos(lat)
        x = (r * sin_lat * np.sin(lon)).astype(np.float32)
        y = (r * cos_lat).astype(np.float32)
        z = (r * sin_lat * np.cos(lon)).astype(np.float32)
    else:
        # Planar projection (matches client: PLANE_WIDTH=8, DEPTH_RANGE=6, DEPTH_OFFSET=-3)
        PLANE_WIDTH = 8.0
        DEPTH_RANGE = 6.0
        DEPTH_OFFSET = -3.0
        
        aspect = h / w
        u = np.linspace(-0.5, 0.5, w, dtype=np.float32)
        v = np.linspace(0.5, -0.5, h, dtype=np.float32)  # flip Y: +Y up
        xx, yy = np.meshgrid(u, v)

        x = (xx * PLANE_WIDTH).astype(np.float32)
        y = (yy * PLANE_WIDTH * aspect).astype(np.float32)
        z = (DEPTH_OFFSET - (1.0 - depth) * DEPTH_RANGE).astype(np.float32)

    # Subsample if stride > 1 (reduces transfer size while keeping full-res processing)
    if stride > 1:
        x = x[::stride, ::stride]
        y = y[::stride, ::stride]
        z = z[::stride, ::stride]
        img_arr = img_arr[::stride, ::stride]
        segments = segments[::stride, ::stride]

    # Flatten everything
    sh, sw = x.shape
    point_count = sh * sw
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
