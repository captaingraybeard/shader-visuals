"""Numpy-vectorized point cloud construction. No Python loops over pixels."""

import numpy as np
from PIL import Image


def build_point_cloud(
    image: Image.Image,
    depth: np.ndarray,
    segments: np.ndarray,
    mode: str = "standard",
    stride: int = 1,
    quantize: bool = True,
) -> tuple[bytes, int, dict]:
    """
    Build packed binary point cloud from image + depth + segments.
    
    Modes:
        standard/planar: X/Y grid, Z from depth
        panorama/equirectangular: lon/lat sphere mapping
    
    Returns (packed_bytes, point_count, format_info).
    
    Quantized format (10 bytes/point):
        position: 3 x int16 (6 bytes) — normalized to [-32767, 32767]
        color: 3 x uint8 (3 bytes)
        segment: 1 x uint8 (1 byte)
    
    Legacy format (20 bytes/point):
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
        BASE_RADIUS = 10.0
        DEPTH_RANGE = 4.0
        
        u = np.linspace(0, 1, w, dtype=np.float32)
        v = np.linspace(0, 1, h, dtype=np.float32)
        uu, vv = np.meshgrid(u, v)

        lon = uu * 2.0 * np.pi
        lat = vv * np.pi

        r = BASE_RADIUS - (1.0 - depth) * DEPTH_RANGE

        sin_lat = np.sin(lat)
        cos_lat = np.cos(lat)
        x = (r * sin_lat * np.sin(lon)).astype(np.float32)
        y = (r * cos_lat).astype(np.float32)
        z = (r * sin_lat * np.cos(lon)).astype(np.float32)
    else:
        PLANE_WIDTH = 8.0
        DEPTH_RANGE = 6.0
        DEPTH_OFFSET = -3.0
        
        aspect = h / w
        u = np.linspace(-0.5, 0.5, w, dtype=np.float32)
        v = np.linspace(0.5, -0.5, h, dtype=np.float32)
        xx, yy = np.meshgrid(u, v)

        x = (xx * PLANE_WIDTH).astype(np.float32)
        y = (yy * PLANE_WIDTH * aspect).astype(np.float32)
        z = (DEPTH_OFFSET - (1.0 - depth) * DEPTH_RANGE).astype(np.float32)

    # Subsample
    if stride > 1:
        x = x[::stride, ::stride]
        y = y[::stride, ::stride]
        z = z[::stride, ::stride]
        img_arr = img_arr[::stride, ::stride]
        segments = segments[::stride, ::stride]

    sh, sw = x.shape
    point_count = sh * sw
    positions = np.stack([x, y, z], axis=-1).reshape(point_count, 3)
    colors = img_arr.reshape(point_count, 3)
    segs = segments.reshape(point_count)

    if quantize:
        # Quantized: int16[3] + uint8[3] + uint8 = 10 bytes/point
        # Compute bounds for normalization
        pos_min = positions.min(axis=0)  # [3]
        pos_max = positions.max(axis=0)  # [3]
        pos_range = pos_max - pos_min
        pos_range[pos_range == 0] = 1.0  # avoid div by zero

        # Normalize to [0, 1] then map to [-32767, 32767]
        normalized = (positions - pos_min) / pos_range  # [0, 1]
        quantized = (normalized * 65534 - 32767).astype(np.int16)  # [-32767, 32767]

        dt = np.dtype([
            ("pos", np.int16, (3,)),
            ("color", np.uint8, (3,)),
            ("segment", np.uint8),
        ])
        packed = np.zeros(point_count, dtype=dt)
        packed["pos"] = quantized
        packed["color"] = colors
        packed["segment"] = segs

        format_info = {
            "format": "quantized",
            "bytes_per_point": 10,
            "pos_min": pos_min.tolist(),
            "pos_max": pos_max.tolist(),
        }
        return packed.tobytes(), point_count, format_info
    else:
        # Legacy: float32[3] + uint8[3] + uint8 + pad[4] = 20 bytes/point
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

        format_info = {
            "format": "legacy",
            "bytes_per_point": 20,
        }
        return packed.tobytes(), point_count, format_info
