# TASK-POINTCLOUD.md — Add Image + Depth → Point Cloud Pipeline

## Overview
Replace the current flat GLSL shader generation with a 3D point cloud pipeline:
1. User enters scene prompt → DALL-E 3 generates an image
2. Depth estimation (DepthAnything v2 via ONNX in browser) extracts depth map
3. Image + depth → 3D point cloud rendered in WebGL2
4. Audio-reactive shader effects applied to the point cloud
5. Coherence slider controls how "solid" vs "dissolved" the points are

## Architecture

```
Scene Prompt → DALL-E 3 API → image (1024x1024)
                                    ↓
                          Depth Anything v2 (ONNX Runtime Web)
                                    ↓
                              depth map (HxW floats)
                                    ↓
                    image pixels + depth → 3D point cloud
                         (x = pixel x, y = pixel y, z = depth)
                                    ↓
                        WebGL2 point rendering with audio uniforms
                         + coherence-based displacement/scatter
```

## Implementation Details

### 1. Image Generation (src/imagegen.ts)
- Call DALL-E 3 API: `POST https://api.openai.com/v1/images/generations`
- Model: `dall-e-3`, size: `1024x1024`, quality: `standard`
- System enhancement: prepend "Highly detailed, cinematic, " to scene prompt for better results
- Return image as base64 or URL
- API key from localStorage (same settings panel, rename from Anthropic to OpenAI)

### 2. Depth Estimation (src/depth.ts)
- Use ONNX Runtime Web (`onnxruntime-web` npm package)
- Load DepthAnything v2 small model (vits variant, ~25MB ONNX)
- Model URL: host on GitHub releases or use a CDN
- Input: resize image to 518x518 (model input size)
- Output: depth map normalized 0-1
- Cache the ONNX session — only load model once

IMPORTANT: If ONNX/DepthAnything is too complex for browser, FALLBACK to:
- Use a simple MiDaS small model via ONNX, OR
- Skip depth estimation entirely and use a fake depth map (radial gradient from center = closest) as a placeholder
- The point cloud rendering should work regardless of depth quality

### 3. Point Cloud Generation (src/pointcloud.ts)
- Sample pixels from image at regular grid (e.g., every 2px → ~262K points for 1024x1024)
- For each sample: position = (x, y, depth[x][y]), color = image[x][y]
- Store as Float32Array buffers: positions (x,y,z), colors (r,g,b)
- Normalize positions to [-1, 1] range centered at origin

### 4. Point Cloud Renderer (src/renderer-points.ts)
- WebGL2 with custom vertex + fragment shaders
- Vertex shader:
  - Takes position + color attributes
  - Applies coherence-based displacement:
    - coherence=1.0: points at original positions (solid scene)
    - coherence=0.5: mild random displacement based on noise
    - coherence=0.0: points scattered wildly, position based on sin/cos of index + time
  - Audio modulation: bass pushes points outward, beat snaps them
  - `u_time` for continuous animation
  - `gl_PointSize` varies with audio (bass = bigger points)
- Fragment shader:
  - Point color from attribute
  - Round points (discard corners for circular points)
  - Optional glow/bloom based on audio
- Camera: simple orbit camera (touch drag to rotate, pinch to zoom)

### 5. Coherence Slider
- The existing intensity slider becomes the coherence slider (or add a second one)
- 0.0 = pure chaos (points scattered, barely recognizable)
- 1.0 = solid point cloud image
- Audio can momentarily push coherence down (bass drops = visual chaos)

### 6. UI Updates (src/ui.ts)
- Settings: change "Anthropic API Key" → "OpenAI API Key"
- Remove the GLSL generation flow
- "Generate" button now triggers: image gen → depth → point cloud → render
- Show loading states: "Generating image..." → "Estimating depth..." → "Building point cloud..."
- Keep preset system but presets are now pre-generated point clouds (or keep some GLSL presets as fallback)
- Add coherence slider (separate from intensity, or repurpose intensity)

### 7. Transition Between Scenes
- When new scene generates, crossfade: lerp point positions from old cloud to new cloud over 1-2 seconds
- If point counts differ, fade out extras / fade in new ones

## Dependencies to Add
- `onnxruntime-web` — for depth estimation in browser

## Files to Create/Modify
- CREATE: `src/imagegen.ts` — DALL-E 3 API call
- CREATE: `src/depth.ts` — depth estimation (ONNX or fallback)  
- CREATE: `src/pointcloud.ts` — image+depth → point arrays
- CREATE: `src/renderer-points.ts` — WebGL2 point cloud renderer with audio reactivity
- CREATE: `src/camera.ts` — simple orbit camera (touch/mouse)
- MODIFY: `src/app.ts` — wire new pipeline, keep old renderer as fallback
- MODIFY: `src/ui.ts` — update settings, add coherence slider, loading states
- MODIFY: `src/types.ts` — add new types
- KEEP: `src/renderer.ts` — keep as fallback for GLSL presets
- KEEP: `src/presets.ts` — keep preset shaders as fallback mode

## Definition of Done
- [ ] Scene prompt → DALL-E generates image → visible in loading state
- [ ] Depth map estimated (or fallback gradient used)
- [ ] Point cloud rendered in 3D with colors from image
- [ ] Touch drag rotates camera around point cloud
- [ ] Audio uniforms drive point displacement + size
- [ ] Coherence slider: 1.0 = solid image, 0.0 = scattered chaos
- [ ] Beat detection momentarily increases scatter
- [ ] Smooth transition between scenes
- [ ] 60fps on iPhone
- [ ] Falls back to flat GLSL presets if image gen fails
- [ ] Build passes: npm run build

## DO NOT
- Remove the existing GLSL preset system (keep as fallback)
- Use Three.js (raw WebGL2)
- Add a backend
- Overcomplicate the depth estimation — if ONNX is painful, use a radial gradient placeholder
