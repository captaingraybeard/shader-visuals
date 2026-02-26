// Image segmentation — MaskFormer panoptic segmentation via @xenova/transformers
// Returns per-object masks with ADE20K class labels, mapped to 6 audio categories

import { pipeline, RawImage } from '@xenova/transformers';

type SegPipeline = Awaited<ReturnType<typeof pipeline<'image-segmentation'>>>;

let segPipeline: SegPipeline | null = null;
let modelFailed = false;

/**
 * Audio categories — each responds to different frequency bands.
 */
export const CATEGORY_COUNT = 6;

/**
 * ADE20K label name → audio category (0-5).
 *
 * 0 = BASS_SUBJECT (people, animals)
 * 1 = MID_ORGANIC (trees, plants, vegetation)
 * 2 = HIGH_SKY (sky, clouds, light sources)
 * 3 = BEAT_GROUND (ground, water, terrain)
 * 4 = MID_STRUCTURE (buildings, furniture, vehicles)
 * 5 = LOW_AMBIENT (walls, misc background)
 */
const LABEL_TO_CATEGORY: Record<string, number> = {};

// Category 0: BASS_SUBJECT — people, animals, living things
['person', 'animal', 'sculpture', 'statue', 'doll', 'dog', 'cat', 'horse',
 'bird', 'cow', 'sheep', 'elephant', 'bear', 'zebra', 'giraffe'].forEach(
  l => LABEL_TO_CATEGORY[l] = 0);

// Category 1: MID_ORGANIC — trees, plants, vegetation
['tree', 'grass', 'plant', 'field', 'palm', 'flower', 'bush', 'leaves',
 'vegetation', 'hedge', 'vine', 'moss', 'fern'].forEach(
  l => LABEL_TO_CATEGORY[l] = 1);

// Category 2: HIGH_SKY — sky, clouds, light
['sky', 'cloud', 'lamp', 'light', 'chandelier', 'sconce', 'sun', 'moon',
 'star', 'aurora', 'rainbow'].forEach(
  l => LABEL_TO_CATEGORY[l] = 2);

// Category 3: BEAT_GROUND — ground, water, terrain
['floor', 'road', 'sidewalk', 'earth', 'mountain', 'water', 'sea', 'river',
 'lake', 'path', 'sand', 'stairs', 'bridge', 'bench', 'dirt path', 'rock',
 'hill', 'waterfall', 'swimming pool', 'fountain', 'land', 'stairway',
 'runway', 'grandstand', 'pier'].forEach(
  l => LABEL_TO_CATEGORY[l] = 3);

// Category 4: MID_STRUCTURE — buildings, furniture, vehicles
['building', 'car', 'fence', 'door', 'table', 'chair', 'sofa', 'bed',
 'cabinet', 'desk', 'wardrobe', 'shelf', 'house', 'armchair', 'seat',
 'skyscraper', 'tower', 'bus', 'truck', 'van', 'ship', 'boat', 'airplane',
 'bicycle', 'minibike', 'signboard', 'column', 'railing', 'awning',
 'booth', 'canopy', 'tent', 'kitchen island', 'counter', 'countertop',
 'stove', 'oven', 'refrigerator', 'sink', 'bathtub', 'toilet',
 'television', 'computer', 'arcade machine', 'pool table', 'bar',
 'coffee table', 'fireplace', 'chest', 'bookcase', 'stage', 'conveyor belt',
 'washer', 'dishwasher', 'microwave', 'barrel', 'stool', 'ottoman',
 'swivel chair', 'hovel'].forEach(
  l => LABEL_TO_CATEGORY[l] = 4);

// Category 5: LOW_AMBIENT — walls, ceiling, misc (default for unlisted)
['wall', 'ceiling', 'windowpane', 'curtain', 'painting', 'mirror', 'rug',
 'cushion', 'base', 'box', 'pillow', 'screen door', 'blind', 'towel',
 'apparel', 'pole', 'bannister', 'escalator', 'bottle', 'buffet', 'poster',
 'case', 'cradle', 'blanket', 'hood', 'vase', 'tray', 'trash can', 'fan',
 'plate', 'monitor', 'crt screen', 'bulletin board', 'shower', 'radiator',
 'glass', 'clock', 'flag', 'bag', 'food', 'ball', 'step', 'tank',
 'trade name', 'pot', 'screen', 'book', 'plaything', 'basket'].forEach(
  l => LABEL_TO_CATEGORY[l] = 5);

function labelToCategory(label: string): number {
  // Direct lookup
  const lower = label.toLowerCase();
  if (lower in LABEL_TO_CATEGORY) return LABEL_TO_CATEGORY[lower];

  // Fuzzy matching for compound labels like "tree-merged"
  for (const [key, cat] of Object.entries(LABEL_TO_CATEGORY)) {
    if (lower.includes(key) || key.includes(lower)) return cat;
  }

  return 5; // default ambient
}

export interface SegmentResult {
  segments: Uint8Array;   // per-pixel audio category (0-5)
  count: number;          // always CATEGORY_COUNT (6)
  labels: string[];       // what was detected: "tree→cat1(25%)"
}

export async function estimateSegments(
  imageUrl: string,
  width: number,
  height: number,
  onStatus?: (msg: string) => void,
  depthMap?: Float32Array,
): Promise<SegmentResult> {
  if (!modelFailed) {
    try {
      if (!segPipeline) {
        onStatus?.('Loading segmentation model (~170MB)...');
        segPipeline = await pipeline(
          'image-segmentation',
          'onnx-community/maskformer-resnet50-ade20k-full',
        );
      }

      onStatus?.('Segmenting scene...');
      const results = await segPipeline(imageUrl);

      // Results: [{score, label, mask: RawImage}, ...]
      // Each mask is a binary RawImage at the input image resolution
      const items = Array.isArray(results) ? results : [results];

      // Build per-pixel category map
      // MaskFormer returns masks sorted by score (highest first)
      // We paint highest-score masks last so they win conflicts
      const segments = new Uint8Array(width * height);
      segments.fill(5); // default: ambient

      // Track what we found
      const labelCounts = new Map<string, number>();
      const totalPixels = width * height;

      // Sort by score ascending so highest-confidence masks paint last (win)
      const sorted = [...items].sort((a: any, b: any) => a.score - b.score);

      for (const item of sorted) {
        const { label, mask, score } = item as any;
        if (score < 0.3) continue; // skip low-confidence detections

        const cat = labelToCategory(label);
        const maskData = mask.data as Uint8Array;
        const maskW = mask.width;
        const maskH = mask.height;

        let pixelCount = 0;

        // Map mask pixels to output resolution
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const mx = Math.min(Math.floor((x / width) * maskW), maskW - 1);
            const my = Math.min(Math.floor((y / height) * maskH), maskH - 1);
            // mask.data is 1-channel, values are 0 or 255 (or boolean)
            if (maskData[my * maskW + mx] > 0) {
              segments[y * width + x] = cat;
              pixelCount++;
            }
          }
        }

        if (pixelCount > 0) {
          const existing = labelCounts.get(label) || 0;
          labelCounts.set(label, existing + pixelCount);
        }
      }

      // Build labels for display
      const labels: string[] = [];
      const sortedLabels = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [label, count] of sortedLabels) {
        if (count < 50) continue;
        const cat = labelToCategory(label);
        const pct = ((count / totalPixels) * 100).toFixed(0);
        labels.push(`${label}→cat${cat}(${pct}%)`);
      }

      console.log(`[segment] MaskFormer: ${items.length} objects, ${labelCounts.size} unique labels`);
      console.log(`[segment] Labels: ${labels.join(', ')}`);
      return { segments, count: CATEGORY_COUNT, labels };

    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      console.error('[segment] MaskFormer failed:', errMsg);
      modelFailed = true;
      onStatus?.(`Seg failed: ${errMsg.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return depthFallback(width, height, depthMap);
}

function depthFallback(
  width: number,
  height: number,
  depthMap?: Float32Array,
): SegmentResult {
  const segments = new Uint8Array(width * height);

  if (depthMap && depthMap.length === width * height) {
    for (let i = 0; i < depthMap.length; i++) {
      const d = depthMap[i];
      if (d > 0.7) segments[i] = 0;
      else if (d > 0.5) segments[i] = 1;
      else if (d > 0.3) segments[i] = 4;
      else if (d > 0.15) segments[i] = 3;
      else segments[i] = 2;
    }
  } else {
    segments.fill(5);
  }

  return {
    segments,
    count: CATEGORY_COUNT,
    labels: [
      'close objects→cat0(depth)',
      'mid vegetation→cat1(depth)',
      'sky/far→cat2(depth)',
      'ground→cat3(depth)',
      'mid structures→cat4(depth)',
      'background→cat5(depth)',
    ],
  };
}
