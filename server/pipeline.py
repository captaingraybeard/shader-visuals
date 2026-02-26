"""Pipeline orchestrator: image → depth + segmentation → point cloud → storage."""

import asyncio
import time
import struct
import json
import logging
from PIL import Image

from .imagegen import generate_image
from .depth import estimate_depth
from .segment import segment_image
from .pointcloud import build_point_cloud
from .storage import save_generation

log = logging.getLogger(__name__)


async def run_pipeline(
    prompt: str,
    api_key: str,
    mode: str = "standard",
    vibe: str = "",
) -> bytes:
    """
    Full pipeline: generate → depth + segment (parallel) → point cloud → save.
    Returns binary response: [4 bytes header_len][JSON header][packed point cloud]
    """
    timings = {}
    t0 = time.time()

    # 1. Generate image
    t = time.time()
    image = await generate_image(prompt, api_key, mode=mode, vibe=vibe)
    timings["image_gen_ms"] = int((time.time() - t) * 1000)
    log.info(f"Image generated: {image.size} in {timings['image_gen_ms']}ms")

    # 2. Depth + Segmentation in parallel
    loop = asyncio.get_event_loop()

    t = time.time()
    depth_future = loop.run_in_executor(None, estimate_depth, image)
    seg_future = loop.run_in_executor(None, segment_image, image)

    depth, (segments, detected) = await asyncio.gather(depth_future, seg_future)
    timings["depth_ms"] = int((time.time() - t) * 1000)
    timings["segmentation_ms"] = timings["depth_ms"]  # ran in parallel

    # 3. Build point cloud
    t = time.time()
    projection = "equirectangular" if mode == "panorama" else "planar"
    packed_bytes, point_count = build_point_cloud(image, depth, segments, mode=mode)
    timings["pointcloud_ms"] = int((time.time() - t) * 1000)

    # 4. Save to storage
    w, h = image.size
    metadata = {
        "prompt": prompt,
        "vibe": vibe,
        "mode": mode,
        "width": w,
        "height": h,
        "point_count": point_count,
        "projection": projection,
        "segments_detected": [
            f"{d['label']}→cat{d['category']}({d['coverage_pct']}%)"
            for d in sorted(detected, key=lambda x: -x["coverage_pct"])
        ],
        "timing": timings,
    }
    gen_id = save_generation(image, depth, segments, metadata)
    metadata["generation_id"] = gen_id

    timings["total_ms"] = int((time.time() - t0) * 1000)
    log.info(f"Pipeline complete: {gen_id} in {timings['total_ms']}ms")

    # 5. Pack response: [4 bytes header_len][JSON header][binary data]
    header_json = json.dumps(metadata).encode("utf-8")
    header_len = struct.pack("<I", len(header_json))

    return header_len + header_json + packed_bytes
