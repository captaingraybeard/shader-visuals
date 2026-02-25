# TASK: Object-Level Audio-Reactive Segmentation

## Goal
Run image segmentation on the DALL-E generated image so each object/region gets a segment ID. Each segment responds to different audio frequency bands independently. Foreground subject breathes with bass, foliage sways with mids, sky shimmers with highs, etc.

## Architecture

### 1. Segmentation Module (`src/segment.ts`)
- Use `@xenova/transformers` pipeline `'image-segmentation'` with model `Xenova/detr-resnet-50-panoptic`
  - Alternative: `Xenova/segformer-b0-finetuned-ade-512-512` (semantic segmentation, 150 ADE20K classes)
  - Pick whichever runs faster/smaller in browser. Segformer-b0 is ~15MB, DETR is bigger.
  - If neither works easily, fall back to a simpler approach: use depth + spatial position to create 4-6 zones (foreground-center, foreground-edge, midground, background-upper, background-lower)
- Input: the DALL-E image (as data URL or ImageData)
- Output: `Uint8Array` of segment IDs per pixel (same dimensions as image), plus a `segmentCount` number
- Normalize segment IDs to 0..N-1 where N is number of distinct segments
- Group into max ~6-8 segments (merge small segments into neighbors)
- Export function: `estimateSegments(imageUrl: string, width: number, height: number, onStatus?: (msg: string) => void): Promise<{ segments: Uint8Array, count: number }>`

### 2. Point Cloud Update (`src/pointcloud.ts`)
- `PointCloudData` interface: add `segments: Float32Array` (1 float per point, the segment ID normalized to 0-1 range: `segId / (segCount - 1)`)
- `buildPointCloud()` now takes an additional `segments: Uint8Array` parameter
- Every pixel that becomes a point gets its segment value baked in

### 3. Audio Expansion (`src/audio.ts`)
- Expand from 4 values (bass, mid, high, beat) to 8 frequency bands + beat:
  - `u_band0`: sub-bass (20-60 Hz)
  - `u_band1`: bass (60-250 Hz)
  - `u_band2`: low-mid (250-500 Hz)
  - `u_band3`: mid (500-2000 Hz)
  - `u_band4`: upper-mid (2000-4000 Hz)
  - `u_band5`: presence (4000-6000 Hz)
  - `u_band6`: brilliance (6000-12000 Hz)
  - `u_band7`: air (12000-20000 Hz)
  - `u_beat`: beat detection (keep existing)
- Keep the existing `u_bass`, `u_mid`, `u_high` as derived values for backward compat:
  - `u_bass = max(u_band0, u_band1)`
  - `u_mid = max(u_band2, u_band3, u_band4)`
  - `u_high = max(u_band5, u_band6, u_band7)`
- All 8 bands passed as uniforms to the shader
- Keep the noise gate (threshold check on total energy)
- Each band gets independent smoothing

### 4. Renderer Update (`src/renderer-points.ts`)

#### New vertex attribute
- `a_segment` (float, 0-1 normalized segment ID)
- Add to VAO setup alongside `a_position` and `a_color`

#### New uniforms
- `u_band0` through `u_band7` (8 float uniforms)
- Keep existing `u_bass`, `u_mid`, `u_high`, `u_beat` for backward compat

#### Vertex shader logic
The key idea: each segment "resonates" with a different frequency band.

```glsl
// Map segment ID to its resonant band
// Segment 0 (usually largest/foreground) → bass
// Higher segments → higher frequencies
float bandIndex = a_segment * 7.0; // 0-7 maps across 8 bands
float lo = floor(bandIndex);
float hi = min(lo + 1.0, 7.0);
float frac = bandIndex - lo;

// Sample the two nearest bands and interpolate
float resonance = mix(getBand(int(lo)), getBand(int(hi)), frac);

// Use resonance to drive per-segment effects:
// - Displacement along normal direction (breathing)
// - Scatter/jitter amount
// - Point size pulse
// - Color shift

// getBand() is a helper that returns u_band0..u_band7 based on index
// Use if/else chain since GLSL ES doesn't support array indexing by variable
```

#### Per-segment effects:
- **Displacement**: `pos += dir * resonance * 0.2` (each segment breathes with its band)
- **Scatter boost**: segments whose band is active get extra scatter on low coherence
- **Point size pulse**: `ptSize += resonance * 3.0`
- **Color boost**: segments glow brighter when their band is active
- **Phase offset**: each segment's animations are phase-shifted so they don't all move in sync

### 5. App Integration (`src/app.ts`)
- In the generate flow, after depth estimation, run segmentation:
  ```
  this.ui.setLoading(true, 'Segmenting scene...');
  const { segments, count } = await estimateSegments(imageDataUrl, w, h, (msg) => this.ui.setLoading(true, msg));
  ```
- Pass segments to `buildPointCloud()`
- Update the `renderScene()` to pass all 8 bands to the renderer
- Update the audio uniforms interface in `src/types.ts` if needed

### 6. Fallback
If segmentation model fails to load:
- Fall back to depth-based segmentation: quantize depth into 6 zones
- `segment = floor(depth * 5.99)` gives 6 segments from far to near
- This still gives spatial audio variation, just not object-aware

## Constraints
- No new npm dependencies (we already have `@xenova/transformers`)
- Must work on iPhone Safari (WebGL2, no compute shaders)
- Keep build clean (tsc --noEmit must pass)
- Segment model download should show progress via onStatus callback
- Total new model download should be <30MB ideally

## Files to modify
- `src/segment.ts` (NEW)
- `src/pointcloud.ts` (add segments attribute)
- `src/audio.ts` (8-band expansion)
- `src/renderer-points.ts` (new attribute, new uniforms, new shader logic)
- `src/app.ts` (wire segmentation + 8-band audio)
- `src/types.ts` (update AudioUniforms if needed)

## Testing
After build, deploy with `npx gh-pages -d dist --no-history` and test at the GitHub Pages URL.
