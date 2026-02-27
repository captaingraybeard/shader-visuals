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

# Chunk size for streaming (10MB base64 chunks)
CHUNK_SIZE = 10 * 1024 * 1024


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
    RunPod async streaming handler. Yields chunks of base64-encoded
    compressed point cloud data to bypass response size limits.

    Input:
    {
        "prompt": str,
        "vibe": str (optional),
        "mode": "standard" | "panorama" (optional),
        "api_key": str (OpenAI key)
    }

    Yields:
    First: {"metadata": {...}, "total_chunks": N, "chunk_index": 0, "data": "..."}
    Then:  {"chunk_index": 1, "data": "..."} ...
    """
    from server.pipeline import run_pipeline

    job_input = job["input"]
    prompt = job_input.get("prompt", "")
    vibe = job_input.get("vibe", "")
    mode = job_input.get("mode", "standard")
    api_key = job_input.get("api_key", "")

    if not prompt:
        yield {"error": "No prompt provided"}
        return
    if not api_key:
        yield {"error": "No OpenAI API key provided"}
        return

    try:
        result_bytes, metadata = await run_pipeline(
            prompt=prompt, api_key=api_key, mode=mode, vibe=vibe
        )
    except Exception as e:
        log.exception("Pipeline error")
        yield {"error": str(e)}
        return

    # Compress and encode
    compressed = zlib.compress(result_bytes, level=6)
    b64_data = base64.b64encode(compressed).decode("ascii")
    log.info(f"Response: {len(result_bytes)} raw → {len(compressed)} compressed → {len(b64_data)} b64")

    # Split into chunks
    chunks = [b64_data[i:i + CHUNK_SIZE] for i in range(0, len(b64_data), CHUNK_SIZE)]
    total_chunks = len(chunks)
    log.info(f"Streaming {total_chunks} chunks")

    # First chunk includes metadata
    yield {
        "metadata": metadata,
        "total_chunks": total_chunks,
        "chunk_index": 0,
        "data": chunks[0],
        "compressed": True,
    }

    # Remaining chunks
    for i in range(1, total_chunks):
        yield {
            "chunk_index": i,
            "data": chunks[i],
        }


runpod.serverless.start({
    "handler": handler,
    "return_aggregate_stream": True,
})
