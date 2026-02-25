// Image segmentation — ML via @xenova/transformers with depth-zone fallback

import { pipeline } from '@xenova/transformers';

type SegPipeline = Awaited<ReturnType<typeof pipeline<'image-segmentation'>>>;

let segPipeline: SegPipeline | null = null;
let pipelineFailed = false;

const MAX_SEGMENTS = 8;

export interface SegmentResult {
  segments: Uint8Array;
  count: number;
}

/**
 * Estimate per-pixel segment IDs from an image.
 * Tries ML segmentation (segformer-b0, ADE20K 150 classes), merges down to ≤8 segments.
 * Falls back to depth-based zones if ML fails.
 */
export async function estimateSegments(
  imageUrl: string,
  width: number,
  height: number,
  onStatus?: (msg: string) => void,
  depthMap?: Float32Array,
): Promise<SegmentResult> {
  if (!pipelineFailed) {
    try {
      if (!segPipeline) {
        onStatus?.('Loading segmentation model (~15MB)...');
        segPipeline = await pipeline(
          'image-segmentation',
          'Xenova/segformer-b0-finetuned-ade-512-512',
          { quantized: true },
        );
      }

      onStatus?.('Segmenting scene...');
      const results = await segPipeline(imageUrl, { subtask: 'semantic' });
      const outputs = Array.isArray(results) ? results : [results];

      if (outputs.length === 0) throw new Error('No segments returned');

      // Each output has { label, score, mask: RawImage }
      // mask.data is Uint8ClampedArray with 1 channel (0 or 255 per pixel)
      // Build per-pixel segment map from masks, sorted by area (largest first)
      const masks = outputs.map((o, i) => ({
        label: o.label,
        index: i,
        mask: o.mask,
        area: 0,
      }));

      // Calculate areas
      for (const m of masks) {
        const data = m.mask.data as Uint8ClampedArray;
        let count = 0;
        for (let j = 0; j < data.length; j++) {
          if (data[j] > 128) count++;
        }
        m.area = count;
      }

      // Sort by area descending — largest segments get lowest IDs
      masks.sort((a, b) => b.area - a.area);

      // Merge to MAX_SEGMENTS: keep top N-1, merge rest into last
      const kept = masks.slice(0, MAX_SEGMENTS);

      // Build output at mask resolution then resize
      const maskW = masks[0].mask.width as number;
      const maskH = masks[0].mask.height as number;
      const segMap = new Uint8Array(maskW * maskH);

      // Assign segment IDs (0 = largest segment)
      // Later masks overwrite earlier ones where they have pixels,
      // so iterate in reverse priority (smallest first, largest last)
      for (let ki = kept.length - 1; ki >= 0; ki--) {
        const data = kept[ki].mask.data as Uint8ClampedArray;
        const channels = (kept[ki].mask.channels as number) || 1;
        for (let j = 0; j < maskW * maskH; j++) {
          if (data[j * channels] > 128) {
            segMap[j] = ki;
          }
        }
      }

      // Resize to target dimensions (nearest-neighbor)
      const segments = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(Math.floor((x / width) * maskW), maskW - 1);
          const sy = Math.min(Math.floor((y / height) * maskH), maskH - 1);
          segments[y * width + x] = segMap[sy * maskW + sx];
        }
      }

      const count = Math.min(kept.length, MAX_SEGMENTS);
      console.log(`[segment] ML segmentation: ${outputs.length} raw → ${count} segments`);
      return { segments, count };

    } catch (e) {
      console.warn('Segmentation failed, falling back to depth zones:', e);
      pipelineFailed = true;
      onStatus?.('Segmentation model failed, using depth zones');
    }
  }

  // Fallback: depth-based zones (6 zones from far to near)
  return depthFallback(width, height, depthMap);
}

function depthFallback(
  width: number,
  height: number,
  depthMap?: Float32Array,
): SegmentResult {
  const count = 6;
  const segments = new Uint8Array(width * height);

  if (depthMap && depthMap.length === width * height) {
    for (let i = 0; i < depthMap.length; i++) {
      segments[i] = Math.min(Math.floor(depthMap[i] * 5.99), count - 1);
    }
  } else {
    // No depth: radial gradient zones
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy) / maxR;
        segments[y * width + x] = Math.min(Math.floor(r * 5.99), count - 1);
      }
    }
  }

  console.log(`[segment] Depth fallback: ${count} zones`);
  return { segments, count };
}
