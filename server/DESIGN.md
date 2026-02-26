# Shader Visuals — Server Pipeline

## Overview
FastAPI server that handles the heavy ML processing for the shader-visuals PWA.
The client (WebGL renderer on GitHub Pages) sends scene prompts, server returns
processed point cloud data ready for rendering.

## Architecture

```
Client (WebGL PWA) ──POST /generate──► Server (FastAPI + Python)
                                         ├── DALL-E 3 image generation
                                         ├── Depth estimation (DepthPro or DA V2 Large)
                                         ├── Semantic segmentation (SAM2 auto + MaskFormer labels)
                                         ├── Point cloud construction (equirectangular or planar)
                                         └── Returns binary packed point cloud + metadata
```

## API Endpoints

### POST /generate
Request:
```json
{
  "prompt": "mystical jungle with ancient temple",
  "vibe": "ethereal",
  "mode": "panorama" | "standard",
  "api_key": "sk-..."  // OpenAI key (passed through for DALL-E)
}
```

Response: Binary packed data with JSON header
```
[4 bytes: header_length][JSON header][binary point cloud data]
```

Header JSON:
```json
{
  "width": 1792,
  "height": 1024,
  "point_count": 1835008,
  "projection": "equirectangular" | "planar",
  "segments_detected": ["tree→cat1(25%)", "sky→cat2(30%)", ...],
  "generation_id": "uuid",
  "timing": {
    "image_gen_ms": 3200,
    "depth_ms": 450,
    "segmentation_ms": 800,
    "total_ms": 4600
  }
}
```

Binary layout per point (20 bytes):
- position: 3 × float32 (12 bytes)
- color: 3 × uint8 (3 bytes) 
- segment: 1 × uint8 (1 byte)
- padding: 4 bytes (alignment)

### GET /health
Returns server status and loaded models.

### GET /generations/{id}
Returns saved generation metadata + download links for images.

### GET /generations/{id}/{asset}
Returns saved assets: `image.png`, `depth.png`, `segments.png`

## Models

### Depth: Apple DepthPro (primary) / Depth Anything V2 Large (fallback)
- DepthPro: Sharp boundaries, metric depth, 2.25MP in 0.3s, ~3GB RAM
- DA V2 Large: 335M params, ~1.5GB RAM, good quality
- Tiled inference with overlap blending for images larger than model input
- Parallel tile processing via ThreadPoolExecutor

### Segmentation: SAM2 automatic masks + MaskFormer/SegFormer labels
- SAM2: Pixel-perfect instance masks via automatic mask generation (grid points)
- MaskFormer (ADE20K): Provides class labels for each region
- Hybrid: SAM2 boundaries + semantic labels from MaskFormer
- 6 audio categories: BASS_SUBJECT, MID_ORGANIC, HIGH_SKY, BEAT_GROUND, MID_STRUCTURE, LOW_AMBIENT

### Image Generation: DALL-E 3
- Pass-through to OpenAI API using client's API key
- Equirectangular prompt engineering for panorama mode

## Storage
All generations saved to `data/generations/{id}/`:
- `image.png` — original DALL-E image
- `depth.png` — grayscale depth map
- `segments.png` — color-coded segmentation map
- `metadata.json` — prompt, timing, detected labels, settings

## File Structure
```
server/
├── main.py              # FastAPI app, endpoints, CORS
├── pipeline.py          # Orchestrator: image → depth → segment → point cloud
├── depth.py             # Depth estimation (DepthPro + DA V2 fallback)
├── segment.py           # SAM2 + MaskFormer hybrid segmentation
├── imagegen.py          # DALL-E 3 wrapper
├── pointcloud.py        # Point cloud construction (planar + equirectangular)
├── models.py            # Model loading + caching
├── storage.py           # Save generations to disk
├── config.py            # Settings, model paths, defaults
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container for deployment
└── data/                # Generated outputs (gitignored)
    └── generations/
```

## Configuration
- Models loaded lazily on first request, cached in memory
- CORS configured to allow GitHub Pages origin
- Configurable model selection via env vars:
  - `DEPTH_MODEL=depthpro|dav2large|dav2small`
  - `SEG_MODEL=sam2+maskformer|maskformer|segformer`
  - `PORT=8000`
  - `DATA_DIR=./data`

## Parallelization
- Depth tiling: tiles processed in parallel via ThreadPoolExecutor
- Segmentation tiling: same parallel approach
- Depth + Segmentation: run concurrently (different models, can share GPU)
- Point cloud construction: numpy vectorized, no Python loops
