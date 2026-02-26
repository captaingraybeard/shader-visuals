# Server Pipeline Implementation Task

## Context
This is a visual engine that generates 3D point cloud scenes from text prompts.
Currently all ML runs client-side in the browser (slow, limited models, crashes on large models).
We're moving the heavy ML pipeline to a Python FastAPI server.

Read `server/DESIGN.md` for the full architecture spec.

## What to Build

### 1. FastAPI Server (`server/main.py`)
- POST `/generate` — accepts prompt, vibe, mode (standard/panorama), OpenAI API key
- GET `/health` — server status, loaded models
- GET `/generations/{id}` — metadata for a saved generation
- GET `/generations/{id}/{asset}` — serve saved image/depth/segments PNGs
- CORS middleware allowing `https://captaingraybeard.github.io` and `http://localhost:*`
- Response format: binary packed point cloud with JSON header (see DESIGN.md)

### 2. Pipeline Orchestrator (`server/pipeline.py`)
- Coordinates: image gen → depth + segmentation (parallel) → point cloud build
- Returns packed binary point cloud + metadata
- Tracks timing for each step

### 3. Depth Estimation (`server/depth.py`)
- Primary: Apple DepthPro (`apple/ml-depth-pro`) — sharpest boundaries, metric depth
- Fallback: Depth Anything V2 Large (`depth-anything/Depth-Anything-V2-Large-hf`) via HuggingFace transformers
- Tiled inference with overlap blending for large images
- Parallel tile processing via ThreadPoolExecutor
- Bilinear interpolation on upscale
- Output: numpy float32 array normalized 0-1 (1=close, 0=far)
- Model selection via `DEPTH_MODEL` env var

### 4. Segmentation (`server/segment.py`)  
- SAM2 automatic mask generation for pixel-perfect boundaries
- MaskFormer (ADE20K) for semantic class labels
- Hybrid approach: SAM2 masks + MaskFormer labels per mask region
- 6 audio categories mapping (same as client):
  - 0: BASS_SUBJECT (people, animals)
  - 1: MID_ORGANIC (trees, plants)
  - 2: HIGH_SKY (sky, clouds, lights)
  - 3: BEAT_GROUND (ground, water, terrain)
  - 4: MID_STRUCTURE (buildings, vehicles, furniture)
  - 5: LOW_AMBIENT (walls, misc)
- Parallel tile processing for SAM2
- Output: numpy uint8 array of category indices

### 5. Image Generation (`server/imagegen.py`)
- DALL-E 3 wrapper (pass-through with client's API key)
- Equirectangular prompt engineering for panorama mode
- Returns PIL Image

### 6. Point Cloud Construction (`server/pointcloud.py`)
- Planar projection (existing logic, numpy vectorized)
- Equirectangular → sphere projection (numpy vectorized)
- No Python loops — all numpy broadcasting
- Output: packed binary (positions float32 + colors uint8 + segments uint8)

### 7. Storage (`server/storage.py`)
- Save every generation to `data/generations/{uuid}/`
- Save: image.png, depth.png (grayscale), segments.png (color-coded), metadata.json
- metadata.json includes: prompt, vibe, mode, timing, detected labels, model versions
- List/retrieve saved generations

### 8. Configuration (`server/config.py`)
- Pydantic settings from env vars
- Model selection: DEPTH_MODEL, SEG_MODEL
- Data directory, port, CORS origins

### 9. Dependencies (`server/requirements.txt`)
- fastapi, uvicorn[standard]
- torch, torchvision
- transformers (HuggingFace)
- segment-anything-2 (SAM2)
- depth-pro (Apple DepthPro) 
- numpy, Pillow
- httpx (for DALL-E API calls)
- pydantic-settings

### 10. Dockerfile
- Python 3.11+ base with CUDA support
- Install all deps
- Download/cache models at build time
- Expose port 8000

## Constraints
- No new npm dependencies on the client side
- Server is CPU-only for now (no GPU assumed) — models should work on CPU, just slower
- All model downloads should be lazy (first request triggers download + cache)
- Binary response format for efficiency (not JSON with base64)
- Keep it simple — no auth, no rate limiting, no database (just filesystem storage)

## Testing
- Include a simple test script that calls /generate with a test prompt
- Print timing breakdown and verify output format
