# TASK-DEPTH.md — Scene-Aware Point Cloud Rendering

## Overview
Four improvements to make the point cloud look and feel like an actual 3D scene:

1. **Real depth estimation** via Depth Anything v2 (ONNX in browser)
2. **Edge-aware point density** — more points on detailed areas, fewer on flat/sky
3. **Depth-based coherence** — foreground resists displacement, background scatters first  
4. **Solid look at high coherence** — bigger overlapping points at coherence=1.0

## 1. Real Depth Estimation (src/depth.ts) — REWRITE

Replace the radial gradient fallback with Depth Anything v2 running in-browser via ONNX Runtime Web.

### Model
- Use **Depth-Anything-V2-Small** (vits) ONNX model
- Model file: `depth_anything_v2_vits.onnx` (~25MB)
- Host the model file in `public/models/` and load from there
- To get the model: use the HuggingFace ONNX export. The model is available at:
  `https://huggingface.co/depth-anything/Depth-Anything-V2-Small/tree/main` (may need onnx subfolder)
  
  OR use a CDN-hosted version. Check:
  `https://huggingface.co/nicjac/depth-anything-v2-small-onnx/resolve/main/model.onnx`
  OR
  `https://cdn.jsdelivr.net/gh/nicjac/depth-anything-v2-small-onnx/model.onnx`
  
  If none of these work, try using the `@xenova/transformers` npm package which bundles DepthAnything as a pipeline:
  ```ts
  import { pipeline } from '@xenova/transformers';
  const depth = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
  const result = await depth(imageUrl);
  // result.depth is a tensor with the depth map
  ```
  This is the EASIEST path. Try this first.

### Implementation
```ts
import { pipeline, type DepthEstimationPipeline } from '@xenova/transformers';

let depthPipeline: DepthEstimationPipeline | null = null;

export async function estimateDepth(imageUrl: string, width: number, height: number): Promise<Float32Array> {
  // Lazy-load the pipeline (caches after first load)
  if (!depthPipeline) {
    depthPipeline = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf', {
      device: 'webgpu', // falls back to wasm if no webgpu
    });
  }
  
  const result = await depthPipeline(imageUrl);
  // Convert result.depth tensor to Float32Array at desired resolution
  // Normalize to 0-1 range
  // Return Float32Array of width*height
}
```

### Fallback
If `@xenova/transformers` fails to load or is too slow, fall back to the existing radial gradient.
Show a toast: "Depth model loading..." while it downloads (~25MB first time, cached after).

### Install
```bash
npm install @xenova/transformers
```

## 2. Edge-Aware Point Density (src/pointcloud.ts) — REWRITE

Current: uniform grid sampling every Nth pixel.
New: sample density based on image detail (edges/texture).

### Algorithm
1. Convert image to grayscale
2. Apply Sobel filter (3x3 convolution) to get edge magnitude at each pixel
3. Normalize edge magnitudes to 0-1
4. Create a probability map: `p(x,y) = BASE_DENSITY + edge(x,y) * EDGE_BOOST`
   - BASE_DENSITY = 0.3 (even flat areas get some points)
   - EDGE_BOOST = 0.7 (edges get up to 100% sampling probability)
5. For each pixel, generate random 0-1; if < p(x,y), include this point
6. Target total point count: ~150K-300K (adjust BASE_DENSITY to hit target)

This means:
- Sky: sparse points
- Detailed objects (columns, faces, leaves): dense points
- Edges: maximum density → crisp outlines

## 3. Depth-Based Coherence (src/renderer-points.ts) — MODIFY VERTEX SHADER

Current: all points scatter equally based on coherence slider.
New: displacement scaled by depth — foreground holds together, background scatters first.

### Vertex Shader Changes
```glsl
// depth is stored in a_position.z (0=far, 1=close after normalization)
float depthFactor = a_position.z; // 0=far, 1=close

// Foreground resists displacement more
// At coherence=0.5: far points are fully chaotic, close points barely move
float localChaos = chaos * (1.0 - depthFactor * u_coherence);

// Scale scatter by localChaos instead of global chaos
vec3 scatter = ... * localChaos * 2.0;

// Bass displacement also weighted by depth
// Foreground objects hold position, background explodes
pos += dir * u_bass * 0.15 * (1.0 - depthFactor * 0.7);
```

### Beat Effect
On beat detection, briefly push background points MORE and foreground points LESS:
```glsl
float beatPush = u_beat * (1.0 - depthFactor * 0.8);
pos += dir * beatPush * 0.2;
```

## 4. Solid Look at High Coherence (src/renderer-points.ts) — MODIFY

Current: points are small and gaps are visible even at coherence=1.0.
New: at high coherence, points are bigger and overlap to create a nearly solid image.

### Changes
```glsl
// Point size scales with coherence — bigger when solid, smaller when scattered
float baseSize = u_pointScale;
float coherenceBoost = u_coherence * u_coherence * 3.0; // quadratic — big jump near 1.0
gl_PointSize = baseSize + coherenceBoost;

// Also scale with depth — closer points are bigger (perspective)
gl_PointSize *= (0.5 + depthFactor * 0.5);

// Minimum size when scattered so points don't disappear
gl_PointSize = max(gl_PointSize, 1.5);
```

### Fragment Shader
At high coherence, make points square (fill more area) instead of circular:
```glsl
// Soft circle at low coherence, squarish at high coherence
float dist = length(gl_PointCoord - 0.5);
float shapeThreshold = mix(0.5, 0.7, u_coherence); // circle → square-ish
if (dist > shapeThreshold) discard;
```

## Files to Modify
- **REWRITE** `src/depth.ts` — real depth estimation via @xenova/transformers
- **REWRITE** `src/pointcloud.ts` — edge-aware density sampling with Sobel filter
- **MODIFY** `src/renderer-points.ts` — depth-based coherence + solid look at high coherence
- **MODIFY** `src/app.ts` — update depth call signature (now async, takes image URL)
- **MODIFY** `package.json` — add @xenova/transformers dependency

## Performance Notes
- Depth estimation: ~2-5 sec on mobile after model cached
- Sobel filter: runs on CPU, <100ms for 1024x1024
- Point count 150K-300K: should be fine for WebGL2 on iPhone at 60fps
- Model download: ~25MB first time, cached by browser after

## Definition of Done
- [ ] Depth Anything v2 runs in browser and produces real depth maps
- [ ] Point density varies — dense on edges/detail, sparse on flat areas  
- [ ] At coherence=1.0, scene looks nearly solid (minimal gaps)
- [ ] At coherence=0.0, background scatters wildly while foreground barely moves
- [ ] Bass hits affect background more than foreground
- [ ] Build passes: npm run build
- [ ] 60fps on iPhone with ~200K points
