"""RunPod serverless handler — wraps the shader-visuals ML pipeline."""

import sys
import os

# Add parent dir to path so `server` package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import runpod
import base64
import zlib
import logging
import torch

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def _load_models():
    """Load models at worker startup (runs once per cold start)."""
    from server.models import load_all_models
    load_all_models()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info(f"Models loaded on device: {device}")


# Load models when the worker starts
_load_models()


async def handler(job):
    """
    RunPod async handler. Input schema:
    {
        "prompt": str,
        "vibe": str (optional),
        "mode": "standard" | "panorama" (optional),
        "api_key": str (OpenAI key)
    }

    Returns:
    {
        "pointcloud_b64": str (base64-encoded binary),
    }
    """
    from server.pipeline import run_pipeline

    job_input = job["input"]
    prompt = job_input.get("prompt", "")
    vibe = job_input.get("vibe", "")
    mode = job_input.get("mode", "standard")
    api_key = job_input.get("api_key", "")

    if not prompt:
        return {"error": "No prompt provided"}
    if not api_key:
        return {"error": "No OpenAI API key provided"}

    try:
        result_bytes = await run_pipeline(
            prompt=prompt, api_key=api_key, mode=mode, vibe=vibe
        )
    except Exception as e:
        log.exception("Pipeline error")
        return {"error": str(e)}

    compressed = zlib.compress(result_bytes, level=6)
    b64_data = base64.b64encode(compressed).decode("ascii")
    log.info(f"Response: {len(result_bytes)} raw → {len(compressed)} compressed → {len(b64_data)} b64")

    return {
        "pointcloud_b64": b64_data,
        "compressed": True,
    }


runpod.serverless.start({"handler": handler})
