"""Pipeline orchestrator: image → depth + segmentation → point cloud → storage."""

import asyncio
import time
import logging
from PIL import Image

from .imagegen import generate_image
from .upscale import upscale_image
from .extract import extract_scene_objects
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
) -> tuple[bytes, dict]:
    """
    Full pipeline: generate → depth + segment (parallel) → point cloud → save.
    Returns (binary_pointcloud, metadata_dict).
    """
    timings = {}
    t0 = time.time()

    # 1. Generate image
    t = time.time()
    image, revised_prompt = await generate_image(prompt, api_key, mode=mode, vibe=vibe)
    timings["image_gen_ms"] = int((time.time() - t) * 1000)
    log.info(f"Image generated: {image.size} in {timings['image_gen_ms']}ms")
    log.info(f"Revised prompt: {revised_prompt[:200]}...")

    # 2. Extract scene objects from ORIGINAL image via GPT-4o-mini vision
    t = time.time()
    dynamic_prompts = await extract_scene_objects(image, api_key, revised_prompt)
    timings["extract_ms"] = int((time.time() - t) * 1000)

    # 3. Upscale 4x for denser point cloud
    t = time.time()
    loop = asyncio.get_event_loop()
    hi_res = await loop.run_in_executor(None, upscale_image, image)
    timings["upscale_ms"] = int((time.time() - t) * 1000)
    log.info(f"Upscaled: {image.size} → {hi_res.size} in {timings['upscale_ms']}ms")

    # 4. Depth + Segmentation in parallel (on upscaled image)
    t = time.time()
    depth_future = loop.run_in_executor(None, estimate_depth, hi_res)
    seg_future = loop.run_in_executor(None, segment_image, hi_res, dynamic_prompts or None)

    depth, (segments, detected) = await asyncio.gather(depth_future, seg_future)
    timings["depth_ms"] = int((time.time() - t) * 1000)
    timings["segmentation_ms"] = timings["depth_ms"]  # ran in parallel

    # 5. Build point cloud (stride=5 on 4x image ≈ 1.17M points, fits RunPod 20MB limit)
    t = time.time()
    projection = "equirectangular" if mode == "panorama" else "planar"
    packed_bytes, point_count = build_point_cloud(hi_res, depth, segments, mode=mode, stride=5)
    timings["pointcloud_ms"] = int((time.time() - t) * 1000)

    # 6. Save to storage (original image, not upscaled)
    w, h = hi_res.size
    metadata = {
        "prompt": prompt,
        "revised_prompt": revised_prompt,
        "vibe": vibe,
        "mode": mode,
        "width": w,
        "height": h,
        "point_count": point_count,
        "projection": projection,
        "extracted_keywords": dynamic_prompts,
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

    return packed_bytes, metadata
