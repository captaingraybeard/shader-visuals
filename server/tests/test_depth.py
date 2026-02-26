"""Tests for depth estimation utilities — feather mask only, no ML imports."""

import numpy as np
import pytest


def _make_feather_mask(h: int, w: int, overlap: int) -> np.ndarray:
    """Copy of depth._make_feather_mask to test without importing transformers."""
    mask = np.ones((h, w), dtype=np.float32)
    if overlap > 0:
        for i in range(overlap):
            t = (i + 1) / (overlap + 1)
            mask[i, :] *= t
            mask[h - 1 - i, :] *= t
            mask[:, i] *= t
            mask[:, w - 1 - i] *= t
    return mask


class TestFeatherMask:
    def test_shape(self):
        mask = _make_feather_mask(100, 200, 32)
        assert mask.shape == (100, 200)
        assert mask.dtype == np.float32

    def test_center_is_one(self):
        mask = _make_feather_mask(100, 200, 32)
        assert mask[50, 100] == 1.0

    def test_edges_less_than_center(self):
        mask = _make_feather_mask(100, 200, 32)
        assert mask[0, 100] < mask[50, 100]
        assert mask[50, 0] < mask[50, 100]

    def test_corner_is_smallest(self):
        mask = _make_feather_mask(100, 200, 32)
        assert mask[0, 0] < mask[0, 100] < mask[50, 100]

    def test_no_overlap_all_ones(self):
        mask = _make_feather_mask(100, 200, 0)
        np.testing.assert_array_equal(mask, np.ones((100, 200), dtype=np.float32))

    def test_symmetry(self):
        mask = _make_feather_mask(100, 100, 20)
        np.testing.assert_array_almost_equal(mask, mask[::-1, :])
        np.testing.assert_array_almost_equal(mask, mask[:, ::-1])

    def test_values_in_range(self):
        mask = _make_feather_mask(64, 64, 16)
        assert mask.min() > 0
        assert mask.max() == 1.0
