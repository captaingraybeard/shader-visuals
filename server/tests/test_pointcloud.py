"""Tests for point cloud construction — numpy vectorized, no ML models needed."""

import numpy as np
from PIL import Image
import struct
import pytest

from server.pointcloud import build_point_cloud


def _make_test_data(w=64, h=32):
    """Create minimal test image, depth, segments."""
    img = Image.fromarray(np.random.randint(0, 255, (h, w, 3), dtype=np.uint8))
    depth = np.random.rand(h, w).astype(np.float32)
    segments = np.random.randint(0, 6, (h, w), dtype=np.uint8)
    return img, depth, segments


class TestPointCloudPlanar:
    def test_output_shape(self):
        img, depth, segs = _make_test_data(64, 32)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")
        assert count == 64 * 32
        assert len(packed) == count * 20  # 20 bytes per point

    def test_binary_layout(self):
        """Verify we can unpack the binary format correctly."""
        img, depth, segs = _make_test_data(4, 4)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")

        dt = np.dtype([
            ("pos", np.float32, (3,)),
            ("color", np.uint8, (3,)),
            ("segment", np.uint8),
            ("pad", np.uint8, (4,)),
        ])
        points = np.frombuffer(packed, dtype=dt)
        assert points.shape == (16,)
        assert points["pos"].shape == (16, 3)
        assert points["color"].shape == (16, 3)

    def test_depth_maps_to_z(self):
        """Close points (depth=1) should have less negative Z than far (depth=0)."""
        w, h = 4, 4
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        segs = np.zeros((h, w), dtype=np.uint8)

        # All close
        depth_close = np.ones((h, w), dtype=np.float32)
        packed_close, _ = build_point_cloud(img, depth_close, segs, mode="standard")
        pts_close = np.frombuffer(packed_close, dtype=np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ]))

        # All far
        depth_far = np.zeros((h, w), dtype=np.float32)
        packed_far, _ = build_point_cloud(img, depth_far, segs, mode="standard")
        pts_far = np.frombuffer(packed_far, dtype=np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ]))

        # Close Z should be less negative (closer to 0) than far Z
        assert pts_close["pos"][0, 2] > pts_far["pos"][0, 2]

    def test_planar_constants(self):
        """Verify plane width matches client PLANE_WIDTH=8."""
        w, h = 100, 50
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        depth = np.full((h, w), 0.5, dtype=np.float32)
        segs = np.zeros((h, w), dtype=np.uint8)
        packed, _ = build_point_cloud(img, depth, segs, mode="standard")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        pts = np.frombuffer(packed, dtype=dt)
        x_vals = pts["pos"][:, 0]
        # X should span roughly -4 to +4 (PLANE_WIDTH=8, ±0.5*8)
        assert x_vals.min() < -3.9
        assert x_vals.max() > 3.9

    def test_colors_preserved(self):
        """Point colors should match input image pixels."""
        w, h = 2, 2
        pixels = np.array([
            [[255, 0, 0], [0, 255, 0]],
            [[0, 0, 255], [255, 255, 255]],
        ], dtype=np.uint8)
        img = Image.fromarray(pixels)
        depth = np.ones((h, w), dtype=np.float32)
        segs = np.zeros((h, w), dtype=np.uint8)
        packed, _ = build_point_cloud(img, depth, segs, mode="standard")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        pts = np.frombuffer(packed, dtype=dt)
        np.testing.assert_array_equal(pts["color"][0], [255, 0, 0])
        np.testing.assert_array_equal(pts["color"][1], [0, 255, 0])
        np.testing.assert_array_equal(pts["color"][2], [0, 0, 255])
        np.testing.assert_array_equal(pts["color"][3], [255, 255, 255])

    def test_segments_preserved(self):
        """Segment categories should round-trip through packing."""
        w, h = 4, 4
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        depth = np.ones((h, w), dtype=np.float32)
        segs = np.arange(16, dtype=np.uint8).reshape(h, w) % 6
        packed, _ = build_point_cloud(img, depth, segs, mode="standard")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        pts = np.frombuffer(packed, dtype=dt)
        expected = np.arange(16, dtype=np.uint8) % 6
        np.testing.assert_array_equal(pts["segment"], expected)


class TestPointCloudEquirectangular:
    def test_output_shape(self):
        img, depth, segs = _make_test_data(64, 32)
        packed, count = build_point_cloud(img, depth, segs, mode="panorama")
        assert count == 64 * 32
        assert len(packed) == count * 20

    def test_sphere_radius_range(self):
        """Points should lie between BASE_RADIUS - DEPTH_RANGE and BASE_RADIUS."""
        w, h = 32, 16
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        depth = np.random.rand(h, w).astype(np.float32)
        segs = np.zeros((h, w), dtype=np.uint8)
        packed, _ = build_point_cloud(img, depth, segs, mode="panorama")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        pts = np.frombuffer(packed, dtype=dt)
        radii = np.linalg.norm(pts["pos"], axis=1)
        # BASE_RADIUS=10, DEPTH_RANGE=4 → radii should be in [6, 10]
        assert radii.min() >= 5.9  # small tolerance
        assert radii.max() <= 10.1

    def test_close_objects_larger_radius(self):
        """Depth=1 (close) should have larger radius than depth=0 (far)."""
        w, h = 4, 4
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        segs = np.zeros((h, w), dtype=np.uint8)

        depth_close = np.ones((h, w), dtype=np.float32)
        packed_close, _ = build_point_cloud(img, depth_close, segs, mode="panorama")

        depth_far = np.zeros((h, w), dtype=np.float32)
        packed_far, _ = build_point_cloud(img, depth_far, segs, mode="panorama")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        r_close = np.linalg.norm(np.frombuffer(packed_close, dtype=dt)["pos"], axis=1)
        r_far = np.linalg.norm(np.frombuffer(packed_far, dtype=dt)["pos"], axis=1)
        # Exclude poles (sin(lat)≈0 makes radius≈0 regardless)
        assert np.median(r_close) > np.median(r_far)

    def test_full_wrap(self):
        """X/Z should cover all quadrants (full 360°)."""
        w, h = 64, 32
        img = Image.fromarray(np.zeros((h, w, 3), dtype=np.uint8))
        depth = np.full((h, w), 0.5, dtype=np.float32)
        segs = np.zeros((h, w), dtype=np.uint8)
        packed, _ = build_point_cloud(img, depth, segs, mode="panorama")

        dt = np.dtype([
            ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
            ("segment", np.uint8), ("pad", np.uint8, (4,)),
        ])
        pts = np.frombuffer(packed, dtype=dt)
        x = pts["pos"][:, 0]
        z = pts["pos"][:, 2]
        # Should have points in all four quadrants
        assert (x > 0).any() and (x < 0).any()
        assert (z > 0).any() and (z < 0).any()


class TestPointCloudEdgeCases:
    def test_single_pixel(self):
        img, depth, segs = _make_test_data(1, 1)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")
        assert count == 1
        assert len(packed) == 20

    def test_mismatched_dimensions(self):
        """Image and depth with different sizes should still work (resized)."""
        img = Image.fromarray(np.zeros((100, 200, 3), dtype=np.uint8))
        depth = np.ones((50, 100), dtype=np.float32)
        segs = np.zeros((50, 100), dtype=np.uint8)
        packed, count = build_point_cloud(img, depth, segs, mode="standard")
        # Should use depth dimensions
        assert count == 50 * 100

    def test_no_nan_or_inf(self):
        """Output should never contain NaN or Inf."""
        img, depth, segs = _make_test_data(64, 32)
        for mode in ["standard", "panorama"]:
            packed, _ = build_point_cloud(img, depth, segs, mode=mode)
            dt = np.dtype([
                ("pos", np.float32, (3,)), ("color", np.uint8, (3,)),
                ("segment", np.uint8), ("pad", np.uint8, (4,)),
            ])
            pts = np.frombuffer(packed, dtype=dt)
            assert not np.any(np.isnan(pts["pos"]))
            assert not np.any(np.isinf(pts["pos"]))
