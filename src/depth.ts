// Depth estimation — real ML via @xenova/transformers with radial gradient fallback

import { pipeline } from '@xenova/transformers';

type DepthPipeline = Awaited<ReturnType<typeof pipeline<'depth-estimation'>>>;

let depthPipeline: DepthPipeline | null = null;
let pipelineFailed = false;

/**
 * Generate a depth map from an image using Depth Anything v2 (small).
 * Falls back to radial gradient if the ML model fails to load.
 * Returns Float32Array of normalized 0-1 depth values (1 = close, 0 = far).
 */
export async function estimateDepth(
  imageUrl: string,
  width: number,
  height: number,
  onStatus?: (msg: string) => void,
): Promise<Float32Array> {
  // Try ML depth estimation
  if (!pipelineFailed) {
    try {
      if (!depthPipeline) {
        onStatus?.('Loading depth model (~25MB)...');
        depthPipeline = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
      }

      onStatus?.('Estimating depth...');
      const result = await depthPipeline(imageUrl);

      // result is single output (not array) since we pass a single image
      const output = Array.isArray(result) ? result[0] : result;
      const tensor = output.predicted_depth;

      // tensor.data is Float32Array at model resolution (e.g. 384x384)
      const srcData = tensor.data as Float32Array;
      const srcH = tensor.dims[0];
      const srcW = tensor.dims[1];

      // Normalize source data to 0-1 range
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < srcData.length; i++) {
        if (srcData[i] < min) min = srcData[i];
        if (srcData[i] > max) max = srcData[i];
      }
      const range = max - min || 1;

      // Resize to target dimensions using nearest-neighbor sampling
      const depth = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcX = Math.min(Math.floor((x / width) * srcW), srcW - 1);
          const srcY = Math.min(Math.floor((y / height) * srcH), srcH - 1);
          const val = (srcData[srcY * srcW + srcX] - min) / range;
          // Depth Anything outputs: higher = closer, which matches our convention
          depth[y * width + x] = val;
        }
      }

      return depth;
    } catch (e) {
      console.warn('Depth estimation failed, falling back to radial gradient:', e);
      pipelineFailed = true;
      onStatus?.('Depth model failed, using fallback');
    }
  }

  // Fallback: radial gradient (center = close, edges = far)
  return estimateDepthFallback(width, height);
}

function estimateDepthFallback(width: number, height: number): Float32Array {
  const depth = new Float32Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      depth[y * width + x] = 1.0 - r / maxR;
    }
  }

  return depth;
}
