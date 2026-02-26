"""Server configuration via environment variables."""

from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    DEPTH_MODEL: Literal["depthpro", "dav2large"] = "dav2large"
    SEG_MODEL: Literal["sam2", "maskformer"] = "maskformer"
    DATA_DIR: str = "./data"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "https://captaingraybeard.github.io",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ]
    OPENAI_API_KEY: str = ""

    model_config = {"env_prefix": "SV_", "env_file": ".env"}


settings = Settings()
