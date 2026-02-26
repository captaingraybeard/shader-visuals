"""Tests for pipeline response format — mock ML models."""

import struct
import json
import numpy as np
from PIL import Image
import pytest

from server.pointcloud import build_point_cloud


class TestBinaryResponseFormat:
    """Verify the binary response format the client expects."""

    def test_header_packing(self):
        """Simulate the pipeline binary format: [4B header_len][JSON][binary]."""
        metadata = {
            "width": 64,
            "height": 32,
            "point_count": 2048,
            "projection": "planar",
        }
        header_json = json.dumps(metadata).encode("utf-8")
        header_len = struct.pack("<I", len(header_json))

        img = Image.fromarray(np.zeros((32, 64, 3), dtype=np.uint8))
        depth = np.ones((32, 64), dtype=np.float32)
        segs = np.zeros((32, 64), dtype=np.uint8)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")

        response = header_len + header_json + packed

        # Parse it back
        parsed_len = struct.unpack("<I", response[:4])[0]
        assert parsed_len == len(header_json)

        parsed_header = json.loads(response[4:4 + parsed_len])
        assert parsed_header["width"] == 64
        assert parsed_header["projection"] == "planar"

        binary_data = response[4 + parsed_len:]
        assert len(binary_data) == count * 20

    def test_client_can_parse_points(self):
        """Verify the binary layout matches what the WebGL client expects."""
        img = Image.fromarray(
            np.tile([128, 64, 32], (16, 16, 1)).astype(np.uint8)
        )
        depth = np.full((16, 16), 0.5, dtype=np.float32)
        segs = np.full((16, 16), 3, dtype=np.uint8)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")

        # Client reads: 3 x float32 position, 3 x uint8 color, 1 x uint8 segment, 4 x uint8 padding
        dt = np.dtype([
            ("pos", np.float32, (3,)),
            ("color", np.uint8, (3,)),
            ("segment", np.uint8),
            ("pad", np.uint8, (4,)),
        ])
        points = np.frombuffer(packed, dtype=dt)

        # All colors should be [128, 64, 32]
        np.testing.assert_array_equal(points["color"][0], [128, 64, 32])
        # All segments should be 3
        assert (points["segment"] == 3).all()
        # Positions should be finite
        assert np.isfinite(points["pos"]).all()
