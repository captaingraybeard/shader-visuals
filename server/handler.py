"""RunPod serverless handler — wraps the shader-visuals ML pipeline."""

import runpod
import asyncio
import base64
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


def handler(job):
    """
    RunPod handler. Input schema:
    {
        "prompt": str,
        "vibe": str (optional),
        "mode": "standard" | "panorama" (optional),
        "api_key": str (OpenAI key)
    }
    
    Returns:
    {
        "pointcloud_b64": str (base64-encoded binary: [4B header_len][JSON header][packed cloud]),
        "metadata": dict
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
        # Run the async pipeline
        result_bytes = asyncio.get_event_loop().run_until_complete(
            run_pipeline(prompt=prompt, api_key=api_key, mode=mode, vibe=vibe)
        )
    except Exception as e:
        log.exception("Pipeline error")
        return {"error": str(e)}

    # Base64 encode the binary response for JSON transport
    b64_data = base64.b64encode(result_bytes).decode("ascii")

    return {
        "pointcloud_b64": b64_data,
    }


runpod.serverless.start({"handler": handler})
