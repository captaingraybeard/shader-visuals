"""Tests for generation storage — filesystem operations, no ML."""

import numpy as np
from PIL import Image
import json
import tempfile
import os
import pytest

from server.storage import save_generation, get_generation, get_asset_path
from server import config


@pytest.fixture(autouse=True)
def temp_data_dir(monkeypatch, tmp_path):
    """Redirect storage to a temp directory for each test."""
    monkeypatch.setattr(config.settings, "DATA_DIR", str(tmp_path))
    return tmp_path


def _make_generation():
    """Create test generation data."""
    img = Image.fromarray(np.random.randint(0, 255, (64, 128, 3), dtype=np.uint8))
    depth = np.random.rand(64, 128).astype(np.float32)
    segments = np.random.randint(0, 6, (64, 128), dtype=np.uint8)
    metadata = {
        "prompt": "test scene",
        "vibe": "chill",
        "mode": "standard",
        "width": 128,
        "height": 64,
    }
    return img, depth, segments, metadata


class TestSaveGeneration:
    def test_returns_uuid(self):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        assert len(gen_id) == 36  # UUID format
        assert "-" in gen_id

    def test_creates_all_files(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        gen_dir = temp_data_dir / "generations" / gen_id
        assert (gen_dir / "image.png").exists()
        assert (gen_dir / "depth.png").exists()
        assert (gen_dir / "segments.png").exists()
        assert (gen_dir / "metadata.json").exists()

    def test_metadata_saved_correctly(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        gen_dir = temp_data_dir / "generations" / gen_id
        with open(gen_dir / "metadata.json") as f:
            saved = json.load(f)
        assert saved["prompt"] == "test scene"
        assert saved["generation_id"] == gen_id

    def test_depth_is_grayscale(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        depth_img = Image.open(temp_data_dir / "generations" / gen_id / "depth.png")
        assert depth_img.mode == "L"

    def test_segments_is_color_coded(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        seg_img = Image.open(temp_data_dir / "generations" / gen_id / "segments.png")
        assert seg_img.mode == "RGB"


class TestGetGeneration:
    def test_retrieve_saved(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        result = get_generation(gen_id)
        assert result is not None
        assert result["prompt"] == "test scene"

    def test_not_found(self):
        assert get_generation("nonexistent-uuid") is None


class TestGetAssetPath:
    def test_valid_assets(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        for asset in ["image.png", "depth.png", "segments.png", "metadata.json"]:
            path = get_asset_path(gen_id, asset)
            assert path is not None
            assert path.exists()

    def test_disallowed_asset(self, temp_data_dir):
        img, depth, segs, meta = _make_generation()
        gen_id = save_generation(img, depth, segs, meta)
        assert get_asset_path(gen_id, "../../etc/passwd") is None
        assert get_asset_path(gen_id, "secret.txt") is None

    def test_missing_generation(self):
        assert get_asset_path("fake-id", "image.png") is None
