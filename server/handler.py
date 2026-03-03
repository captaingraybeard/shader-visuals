"""RunPod serverless handler — wraps the shader-visuals ML pipeline."""

import sys
import os
import types

# Add parent dir to path so `server` package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Pre-patch basicsr to avoid import crashes. We only use RRDBNet.
# 1) Stub deformable conv (needs ninja for JIT CUDA compilation)
_dcn_dummy = types.ModuleType("basicsr.ops.dcn")
_dcn_dummy.ModulatedDeformConvPack = None
_dcn_dummy.modulated_deform_conv = None
_deform_dummy = types.ModuleType("basicsr.ops.dcn.deform_conv")
sys.modules["basicsr.ops.dcn"] = _dcn_dummy
sys.modules["basicsr.ops.dcn.deform_conv"] = _deform_dummy

# 2) Stub torchvision.transforms.functional_tensor (removed in newer torchvision)
#    basicsr.data.degradations imports rgb_to_grayscale from it
try:
    import torchvision.transforms.functional_tensor
except ModuleNotFoundError:
    from torchvision.transforms import functional as _tvf
    _ft_dummy = types.ModuleType("torchvision.transforms.functional_tensor")
    _ft_dummy.rgb_to_grayscale = getattr(_tvf, "rgb_to_grayscale", lambda x, nc=1: x)
    sys.modules["torchvision.transforms.functional_tensor"] = _ft_dummy

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

    Returns JSON with base64-encoded compressed point cloud + metadata.
    Point cloud is stride-2 subsampled (~460K points, ~9MB) to fit RunPod limits.
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
        result_bytes, metadata = await run_pipeline(
            prompt=prompt, api_key=api_key, mode=mode, vibe=vibe
        )
    except Exception as e:
        log.exception("Pipeline error")
        return {"error": str(e)}

    # If R2 upload happened, result_bytes is None — return URL only
    if result_bytes is None:
        url = metadata.get("pointcloud_url", "")
        log.info(f"Response: R2 URL mode → {url}")
        return {
            "metadata": metadata,
            "pointcloud_url": url,
            "compressed": True,
        }

    # Fallback: inline base64 (no R2)
    compressed = zlib.compress(result_bytes, level=6)
    b64_data = base64.b64encode(compressed).decode("ascii")
    log.info(f"Response: {len(result_bytes)} raw → {len(compressed)} compressed → {len(b64_data)} b64")

    return {
        "metadata": metadata,
        "pointcloud_b64": b64_data,
        "compressed": True,
    }


runpod.serverless.start({"handler": handler})
