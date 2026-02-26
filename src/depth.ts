// Depth estimation — real ML via @xenova/transformers with tiled inference + overlap blending

import { pipeline } from '@xenova/transformers';

type DepthPipeline = Awaited<ReturnType<typeof pipeline<'depth-estimation'>>>;

let depthPipeline: DepthPipeline | null = null;
let pipelineFailed = false;

/**
 * Bilinear interpolation from a source grid to target coordinates.
 * src is Float32Array of srcW×srcH, returns interpolated value at (fx, fy) in source space.
 */
function bilinearSample(src: Float32Array, srcW: number, srcH: number, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, srcW - 1);
  const y1 = Math.min(y0 + 1, srcH - 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const v00 = src[y0 * srcW + x0];
  const v10 = src[y0 * srcW + x1];
  const v01 = src[y1 * srcW + x0];
  const v11 = src[y1 * srcW + x1];

  return v00 * (1 - dx) * (1 - dy) +
         v10 * dx * (1 - dy) +
         v01 * (1 - dx) * dy +
         v11 * dx * dy;
}

/**
 * Run depth model on a single image URL.
 * Returns raw model output (Float32Array) + its dimensions.
 */
async function runDepthModel(imageUrl: string): Promise<{ data: Float32Array; w: number; h: number }> {
  const result = await depthPipeline!(imageUrl);
  const output = Array.isArray(result) ? result[0] : result;
  const tensor = output.predicted_depth;
  return {
    data: tensor.data as Float32Array,
    w: tensor.dims[1],
    h: tensor.dims[0],
  };
}

/**
 * Generate a depth map from an image using tiled Depth Anything v2 (small).
 * Splits image into overlapping tiles, runs depth on each, blends overlaps for smooth seams.
 * Falls back to radial gradient if the ML model fails to load.
 * Returns Float32Array of normalized 0-1 depth values (1 = close, 0 = far).
 */
export async function estimateDepth(
  imageUrl: string,
  width: number,
  height: number,
  onStatus?: (msg: string) => void,
): Promise<Float32Array> {
  if (!pipelineFailed) {
    try {
      if (!depthPipeline) {
        onStatus?.('Loading depth model (~25MB)...');
        depthPipeline = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf');
      }

      onStatus?.('Estimating depth (tiled)...');

      // We tile the image for higher resolution depth.
      // The model internally processes at ~518×518. By feeding it smaller crops,
      // each crop gets more detail per pixel.
      
      // Load image into a canvas to extract tiles
      const img = await loadImage(imageUrl);
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      const TILE = 512;
      const OVERLAP = 64; // overlap pixels for blending
      const STEP = TILE - OVERLAP;

      // Calculate tile positions
      const tilesX = Math.max(1, Math.ceil((imgW - OVERLAP) / STEP));
      const tilesY = Math.max(1, Math.ceil((imgH - OVERLAP) / STEP));

      // Accumulator buffers at full image resolution
      const depthSum = new Float32Array(imgW * imgH);
      const weightSum = new Float32Array(imgW * imgH);

      let tileNum = 0;
      const totalTiles = tilesX * tilesY;

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          tileNum++;
          onStatus?.(`Depth tile ${tileNum}/${totalTiles}...`);

          // Tile bounds (clamp to image edges)
          const x0 = Math.min(tx * STEP, Math.max(0, imgW - TILE));
          const y0 = Math.min(ty * STEP, Math.max(0, imgH - TILE));
          const cropW = Math.min(TILE, imgW - x0);
          const cropH = Math.min(TILE, imgH - y0);

          // Extract tile to data URL
          const tileCanvas = document.createElement('canvas');
          tileCanvas.width = cropW;
          tileCanvas.height = cropH;
          const ctx = tileCanvas.getContext('2d')!;
          ctx.drawImage(img, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
          const tileUrl = tileCanvas.toDataURL('image/jpeg', 0.9);

          // Run depth model on this tile
          const { data: srcData, w: srcW, h: srcH } = await runDepthModel(tileUrl);

          // Normalize this tile's depth to 0-1
          let min = Infinity, max = -Infinity;
          for (let i = 0; i < srcData.length; i++) {
            if (srcData[i] < min) min = srcData[i];
            if (srcData[i] > max) max = srcData[i];
          }
          const range = max - min || 1;
          const normalized = new Float32Array(srcData.length);
          for (let i = 0; i < srcData.length; i++) {
            normalized[i] = (srcData[i] - min) / range;
          }

          // Blend tile into accumulator with feathered weights at edges
          for (let py = 0; py < cropH; py++) {
            for (let px = 0; px < cropW; px++) {
              // Bilinear sample from model output
              const fx = (px / cropW) * (srcW - 1);
              const fy = (py / cropH) * (srcH - 1);
              const val = bilinearSample(normalized, srcW, srcH, fx, fy);

              // Feather weight: 1.0 in center, falls to 0 at edges within OVERLAP zone
              const edgeL = px;
              const edgeR = cropW - 1 - px;
              const edgeT = py;
              const edgeB = cropH - 1 - py;
              const minEdge = Math.min(edgeL, edgeR, edgeT, edgeB);
              const weight = Math.min(1.0, minEdge / OVERLAP);

              const dstIdx = (y0 + py) * imgW + (x0 + px);
              depthSum[dstIdx] += val * weight;
              weightSum[dstIdx] += weight;
            }
          }
        }
      }

      // Normalize accumulated depth
      const fullDepth = new Float32Array(imgW * imgH);
      for (let i = 0; i < fullDepth.length; i++) {
        fullDepth[i] = weightSum[i] > 0 ? depthSum[i] / weightSum[i] : 0;
      }

      // Global normalization pass to use full 0-1 range
      let gMin = Infinity, gMax = -Infinity;
      for (let i = 0; i < fullDepth.length; i++) {
        if (fullDepth[i] < gMin) gMin = fullDepth[i];
        if (fullDepth[i] > gMax) gMax = fullDepth[i];
      }
      const gRange = gMax - gMin || 1;
      console.log(`[depth] tiled: ${totalTiles} tiles, range ${gMin.toFixed(3)}-${gMax.toFixed(3)}`);

      // If image and target are same size, write directly to avoid extra alloc
      if (imgW === width && imgH === height) {
        for (let i = 0; i < fullDepth.length; i++) {
          fullDepth[i] = (fullDepth[i] - gMin) / gRange;
        }
        return fullDepth;
      }

      // Resize from imgW×imgH to target width×height with bilinear interpolation
      const depth = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const fx = (x / width) * (imgW - 1);
          const fy = (y / height) * (imgH - 1);
          const raw = bilinearSample(fullDepth, imgW, imgH, fx, fy);
          depth[y * width + x] = (raw - gMin) / gRange;
        }
      }

      console.log(`[depth] output: ${width}x${height}, sample mid=${depth[Math.floor(depth.length/2)].toFixed(3)}`);
      return depth;
    } catch (e) {
      console.warn('Depth estimation failed, falling back to radial gradient:', e);
      pipelineFailed = true;
      onStatus?.('Depth model failed, using fallback');
    }
  }

  return estimateDepthFallback(width, height);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
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
