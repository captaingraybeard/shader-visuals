"""Tests for segmentation label mapping — no ML imports needed."""

import pytest

# Copy the mapping logic to avoid importing transformers via models.py
LABEL_TO_CATEGORY = {
    "person": 0, "people": 0, "animal": 0, "dog": 0, "cat": 0, "bird": 0,
    "horse": 0, "cow": 0, "sheep": 0, "elephant": 0, "bear": 0, "zebra": 0,
    "giraffe": 0, "sculpture": 0, "statue": 0,
    "tree": 1, "palm": 1, "plant": 1, "flower": 1, "grass": 1, "bush": 1,
    "leaves": 1, "branch": 1, "hedge": 1, "forest": 1, "vegetation": 1,
    "flora": 1, "shrub": 1, "field": 1,
    "sky": 2, "cloud": 2, "sun": 2, "moon": 2, "star": 2, "light": 2,
    "lamp": 2, "chandelier": 2, "candle": 2,
    "floor": 3, "ground": 3, "earth": 3, "sand": 3, "snow": 3, "water": 3,
    "sea": 3, "river": 3, "lake": 3, "pool": 3, "road": 3, "path": 3,
    "sidewalk": 3, "pavement": 3, "rock": 3, "stone": 3,
    "mountain": 3, "hill": 3, "dirt": 3, "mud": 3, "carpet": 3, "rug": 3,
    "terrain": 3, "waterfall": 3, "swimming pool": 3,
    "building": 4, "house": 4, "tower": 4, "bridge": 4, "fence": 4,
    "car": 4, "truck": 4, "bus": 4, "train": 4, "boat": 4, "ship": 4,
    "airplane": 4, "bicycle": 4, "motorcycle": 4, "chair": 4, "table": 4,
    "desk": 4, "bed": 4, "sofa": 4, "couch": 4, "bench": 4, "door": 4,
    "window": 4, "stairway": 4, "stairs": 4, "column": 4, "pillar": 4,
    "roof": 4, "tent": 4, "shelter": 4, "cabinet": 4, "counter": 4,
    "bookcase": 4, "shelf": 4, "railing": 4, "skyscraper": 4,
    "wall": 5, "curtain": 5, "blind": 5, "screen": 5, "mirror": 5,
    "ceiling": 5, "painting": 5, "poster": 5, "banner": 5, "flag": 5,
    "box": 5, "bag": 5, "blanket": 5, "towel": 5, "cloth": 5,
}

CAT_NAMES = ["BASS_SUBJECT", "MID_ORGANIC", "HIGH_SKY", "BEAT_GROUND", "MID_STRUCTURE", "LOW_AMBIENT"]


def _label_to_category(label: str) -> int:
    label_lower = label.lower().strip()
    if not label_lower:
        return 5
    if label_lower in LABEL_TO_CATEGORY:
        return LABEL_TO_CATEGORY[label_lower]
    for key, cat in LABEL_TO_CATEGORY.items():
        if key in label_lower or label_lower in key:
            return cat
    return 5


class TestLabelMapping:
    def test_people_are_bass(self):
        assert _label_to_category("person") == 0
        assert _label_to_category("animal") == 0
        assert _label_to_category("dog") == 0

    def test_vegetation_is_organic(self):
        assert _label_to_category("tree") == 1
        assert _label_to_category("grass") == 1
        assert _label_to_category("flower") == 1

    def test_sky_is_high(self):
        assert _label_to_category("sky") == 2
        assert _label_to_category("cloud") == 2

    def test_ground_is_beat(self):
        assert _label_to_category("floor") == 3
        assert _label_to_category("water") == 3
        assert _label_to_category("mountain") == 3

    def test_structures_are_mid(self):
        assert _label_to_category("building") == 4
        assert _label_to_category("car") == 4

    def test_ambient_is_default(self):
        assert _label_to_category("wall") == 5

    def test_unknown_defaults_to_ambient(self):
        assert _label_to_category("xyzzy_unknown") == 5
        assert _label_to_category("") == 5

    def test_case_insensitive(self):
        assert _label_to_category("TREE") == 1
        assert _label_to_category("Sky") == 2

    def test_substring_matching(self):
        assert _label_to_category("palm tree") == 1
        assert _label_to_category("swimming pool") == 3

    def test_all_categories_covered(self):
        cats = set(LABEL_TO_CATEGORY.values())
        for i in range(6):
            assert i in cats, f"Category {i} ({CAT_NAMES[i]}) missing"

    def test_no_out_of_range(self):
        for label, cat in LABEL_TO_CATEGORY.items():
            assert 0 <= cat <= 5
