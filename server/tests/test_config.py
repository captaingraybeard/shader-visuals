"""Tests for configuration."""

from server.config import Settings


class TestConfig:
    def test_defaults(self):
        s = Settings()
        assert s.DEPTH_MODEL == "dav2large"
        assert s.SEG_MODEL == "maskformer"
        assert s.PORT == 8000
        assert "https://captaingraybeard.github.io" in s.CORS_ORIGINS

    def test_github_pages_in_cors(self):
        s = Settings()
        assert any("captaingraybeard" in o for o in s.CORS_ORIGINS)

    def test_localhost_in_cors(self):
        s = Settings()
        assert any("localhost" in o for o in s.CORS_ORIGINS)
