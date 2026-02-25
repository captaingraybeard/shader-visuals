// Image segmentation — ML via @xenova/transformers with depth-zone fallback
// Assigns each pixel a SEMANTIC audio category (0-5) based on what kind of object it is

import { pipeline } from '@xenova/transformers';

type SegPipeline = Awaited<ReturnType<typeof pipeline<'image-segmentation'>>>;

let segPipeline: SegPipeline | null = null;
let pipelineFailed = false;

/**
 * Audio categories — each responds to different frequency bands.
 * The number is baked into the point cloud as a normalized float (0-1).
 */
export const AUDIO_CATEGORIES = {
  BASS_SUBJECT:  0,  // People, animals, main subjects → sub-bass + bass (breathing, pulsing)
  MID_ORGANIC:   1,  // Trees, plants, vegetation → low-mid + mid (swaying, organic movement)
  HIGH_SKY:      2,  // Sky, clouds, celestial → brilliance + air (shimmer, sparkle)
  BEAT_GROUND:   3,  // Ground, floor, terrain, water → beat-reactive (ripple, impact)
  MID_STRUCTURE: 4,  // Buildings, furniture, vehicles → upper-mid + presence (vibration, resonance)
  LOW_AMBIENT:   5,  // Walls, misc background → low-mid (subtle drift)
} as const;

export const CATEGORY_COUNT = 6;

/**
 * ADE20K class labels → audio category mapping.
 * ADE20K has 150 classes. We map each to one of our 6 audio categories.
 */
const ADE20K_TO_CATEGORY: Record<string, number> = {
  // BASS_SUBJECT (0) — living things, main subjects
  'person': 0, 'animal': 0, 'dog': 0, 'cat': 0, 'bird': 0, 'horse': 0,
  'cow': 0, 'sheep': 0, 'elephant': 0, 'bear': 0, 'zebra': 0, 'giraffe': 0,
  'sculpture': 0, 'statue': 0, 'figure': 0, 'doll': 0,

  // MID_ORGANIC (1) — vegetation, nature
  'tree': 1, 'palm': 1, 'grass': 1, 'plant': 1, 'flower': 1, 'bush': 1,
  'field': 1, 'forest': 1, 'leaf': 1, 'branch': 1, 'hedge': 1, 'moss': 1,
  'jungle': 1, 'garden': 1, 'vineyard': 1, 'crop': 1, 'vegetation': 1,

  // HIGH_SKY (2) — sky, atmosphere, celestial
  'sky': 2, 'cloud': 2, 'sun': 2, 'moon': 2, 'star': 2, 'aurora': 2,
  'rainbow': 2, 'fog': 2, 'mist': 2, 'smoke': 2, 'light': 2, 'lamp': 2,
  'chandelier': 2, 'candle': 2, 'fire': 2, 'firework': 2, 'lightning': 2,

  // BEAT_GROUND (3) — ground, water, terrain
  'earth': 3, 'ground': 3, 'floor': 3, 'road': 3, 'path': 3, 'sidewalk': 3,
  'sand': 3, 'snow': 3, 'ice': 3, 'rock': 3, 'stone': 3, 'mountain': 3,
  'hill': 3, 'cliff': 3, 'river': 3, 'lake': 3, 'sea': 3, 'ocean': 3,
  'water': 3, 'waterfall': 3, 'pond': 3, 'pool': 3, 'fountain': 3,
  'beach': 3, 'desert': 3, 'dirt': 3, 'mud': 3, 'carpet': 3, 'rug': 3,
  'tile': 3, 'pavement': 3, 'bridge': 3,

  // MID_STRUCTURE (4) — buildings, structures, vehicles
  'building': 4, 'house': 4, 'tower': 4, 'skyscraper': 4, 'church': 4,
  'castle': 4, 'temple': 4, 'barn': 4, 'garage': 4, 'tent': 4,
  'car': 4, 'bus': 4, 'truck': 4, 'train': 4, 'boat': 4, 'ship': 4,
  'airplane': 4, 'bicycle': 4, 'motorcycle': 4, 'vehicle': 4,
  'fence': 4, 'gate': 4, 'railing': 4, 'pole': 4, 'column': 4,
  'arch': 4, 'dome': 4, 'roof': 4, 'stairway': 4, 'escalator': 4,
  'furniture': 4, 'chair': 4, 'table': 4, 'bed': 4, 'sofa': 4,
  'desk': 4, 'cabinet': 4, 'shelf': 4, 'counter': 4, 'bench': 4,
  'door': 4, 'window': 4, 'screen': 4, 'monitor': 4, 'television': 4,

  // LOW_AMBIENT (5) — walls, ceilings, misc background
  'wall': 5, 'ceiling': 5, 'curtain': 5, 'blanket': 5, 'pillow': 5,
  'cloth': 5, 'towel': 5, 'banner': 5, 'flag': 5, 'painting': 5,
  'mirror': 5, 'poster': 5, 'board': 5, 'sign': 5, 'book': 5,
  'box': 5, 'bag': 5, 'bottle': 5, 'cup': 5, 'plate': 5,
  'food': 5, 'fruit': 5, 'cake': 5, 'bowl': 5, 'vase': 5,
};

/** Fuzzy match an ADE20K label to our audio category */
function labelToCategory(label: string): number {
  const lower = label.toLowerCase().trim();

  // Exact match first
  if (lower in ADE20K_TO_CATEGORY) return ADE20K_TO_CATEGORY[lower];

  // Substring match — check if any known keyword is contained in the label
  for (const [keyword, cat] of Object.entries(ADE20K_TO_CATEGORY)) {
    if (lower.includes(keyword) || keyword.includes(lower)) return cat;
  }

  // Default: ambient background
  return 5;
}

export interface SegmentResult {
  segments: Uint8Array;   // per-pixel audio category (0-5)
  count: number;          // always CATEGORY_COUNT (6)
  labels: string[];       // debug: what labels were found
}

/**
 * Estimate per-pixel audio categories from an image.
 * Tries SegFormer-B0 semantic segmentation, falls back to depth-based zones.
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

      // Get mask dimensions from first output
      const maskW = outputs[0].mask.width as number;
      const maskH = outputs[0].mask.height as number;

      // Build per-pixel category map at mask resolution
      // Each output is { label: string, mask: RawImage }
      // We assign categories based on the label, largest area wins ties
      const categoryMap = new Uint8Array(maskW * maskH);
      categoryMap.fill(5); // default: ambient

      // Sort by area ascending so larger segments overwrite smaller
      const sorted = outputs
        .map(o => {
          const data = o.mask.data as Uint8ClampedArray;
          const channels = (o.mask.channels as number) || 1;
          let area = 0;
          for (let j = 0; j < maskW * maskH; j++) {
            if (data[j * channels] > 128) area++;
          }
          return { label: o.label as string, mask: o.mask, area, channels, category: labelToCategory(o.label as string) };
        })
        .sort((a, b) => a.area - b.area); // ascending — bigger overwrites

      const foundLabels: string[] = [];
      for (const seg of sorted) {
        foundLabels.push(`${seg.label}→cat${seg.category}(${seg.area}px)`);
        const data = seg.mask.data as Uint8ClampedArray;
        for (let j = 0; j < maskW * maskH; j++) {
          if (data[j * seg.channels] > 128) {
            categoryMap[j] = seg.category;
          }
        }
      }

      // Resize to target dimensions (nearest-neighbor)
      const segments = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(Math.floor((x / width) * maskW), maskW - 1);
          const sy = Math.min(Math.floor((y / height) * maskH), maskH - 1);
          segments[y * width + x] = categoryMap[sy * maskW + sx];
        }
      }

      console.log(`[segment] ML: ${outputs.length} classes → 6 audio categories`);
      console.log(`[segment] Labels: ${foundLabels.join(', ')}`);
      return { segments, count: CATEGORY_COUNT, labels: foundLabels };

    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      const errStack = (e as Error).stack?.slice(0, 200) || '';
      console.error('Segmentation failed:', errMsg, errStack);
      pipelineFailed = true;
      // Show full error so user can report it
      onStatus?.(`Seg failed: ${errMsg.slice(0, 80)}`);
      // Brief delay so user sees the error
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
    // Map depth to categories: close=BASS_SUBJECT, mid=MID_ORGANIC, far=HIGH_SKY
    for (let i = 0; i < depthMap.length; i++) {
      const d = depthMap[i]; // 0=far, 1=close
      if (d > 0.7) segments[i] = 0;      // close → bass subject
      else if (d > 0.5) segments[i] = 1;  // mid-close → organic
      else if (d > 0.3) segments[i] = 4;  // mid → structure
      else if (d > 0.15) segments[i] = 3; // mid-far → ground
      else segments[i] = 2;               // far → sky
    }
  } else {
    segments.fill(5);
  }

  console.log(`[segment] Depth fallback: 6 categories`);
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
