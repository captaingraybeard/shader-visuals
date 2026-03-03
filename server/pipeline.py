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
from .r2 import is_r2_configured, upload_pointcloud

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

    # 5. Build point cloud (quantized int16 = 10 bytes/pt)
    # R2 configured → stride=2 (~7.3M pts), uploaded externally
    # No R2 → stride=3 (~3.26M pts, fits RunPod 20MB limit)
    use_r2 = is_r2_configured()
    stride = 2 if use_r2 else 3
    t = time.time()
    projection = "equirectangular" if mode == "panorama" else "planar"
    packed_bytes, point_count, format_info = build_point_cloud(
        hi_res, depth, segments, mode=mode, stride=stride, quantize=True,
    )
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
        "format": format_info,
        "extracted_keywords": dynamic_prompts,
        "segments_detected": [
            f"{d['label']}→cat{d['category']}({d['coverage_pct']}%)"
            for d in sorted(detected, key=lambda x: -x["coverage_pct"])
        ],
        "timing": timings,
    }
    gen_id = save_generation(image, depth, segments, metadata)
    metadata["generation_id"] = gen_id
    metadata["stride"] = stride

    # 7. Upload to R2 if configured (full-res point cloud)
    if use_r2:
        import zlib
        t = time.time()
        compressed = zlib.compress(packed_bytes, level=6)
        r2_url = upload_pointcloud(compressed, gen_id, compressed=True)
        timings["r2_upload_ms"] = int((time.time() - t) * 1000)
        metadata["pointcloud_url"] = r2_url
        log.info(f"R2 upload: {len(packed_bytes)/(1024*1024):.1f}MB raw → {len(compressed)/(1024*1024):.1f}MB compressed → {r2_url}")
        # Return None for bytes — handler will use URL instead
        packed_bytes = None

    timings["total_ms"] = int((time.time() - t0) * 1000)
    log.info(f"Pipeline complete: {gen_id} in {timings['total_ms']}ms ({point_count} points, stride={stride})")

    return packed_bytes, metadata
