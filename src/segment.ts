// Image segmentation — SegFormer-B0 semantic segmentation via @xenova/transformers
// Assigns each pixel a semantic audio category (0-5) based on ADE20K class labels

import {
  AutoProcessor,
  SegformerForSemanticSegmentation,
  RawImage,
} from '@xenova/transformers';

type SegModel = Awaited<ReturnType<typeof SegformerForSemanticSegmentation.from_pretrained>>;
type SegProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

let segModel: SegModel | null = null;
let segProcessor: SegProcessor | null = null;
let modelFailed = false;

/**
 * Audio categories — each responds to different frequency bands.
 */
export const CATEGORY_COUNT = 6;

/**
 * ADE20K 150 class indices → audio category (0-5).
 * Reference: https://docs.google.com/spreadsheets/d/1se8YEtb2detS7OuPE86fXGyD269pMycAWe2mtKUj2W8
 *
 * 0 = BASS_SUBJECT (people, animals)
 * 1 = MID_ORGANIC (trees, plants, vegetation)
 * 2 = HIGH_SKY (sky, clouds, light sources)
 * 3 = BEAT_GROUND (ground, water, terrain)
 * 4 = MID_STRUCTURE (buildings, furniture, vehicles)
 * 5 = LOW_AMBIENT (walls, misc background)
 */
const ADE20K_CLASS_TO_CATEGORY: number[] = (() => {
  const map = new Array(150).fill(5); // default: ambient

  // BASS_SUBJECT (0): people, animals
  [12, 75, 126, 132, 147].forEach(i => map[i] = 0);
  // 12=person, 75=sculpture, 126=animal, 132=statue, 147=doll

  // MID_ORGANIC (1): trees, plants, vegetation
  [4, 9, 17, 29, 66, 72, 73].forEach(i => map[i] = 1);
  // 4=tree, 9=grass, 17=plant, 29=field, 66=palm, 72=flower, 73=bush

  // HIGH_SKY (2): sky, clouds, light
  [2, 25, 82, 85, 134, 141].forEach(i => map[i] = 2);
  // 2=sky, 25=cloud (actually water), 82=lamp, 85=light, 134=chandelier, 141=sconce

  // BEAT_GROUND (3): ground, water, terrain, roads
  [3, 6, 11, 13, 16, 21, 26, 34, 46, 52, 60, 61, 91, 128].forEach(i => map[i] = 3);
  // 3=floor, 6=road, 11=sidewalk, 13=earth, 16=mountain, 21=water, 26=sea
  // 34=path, 46=sand, 52=stairs, 60=bridge, 61=bench, 91=dirt, 128=lake

  // MID_STRUCTURE (4): buildings, furniture, vehicles
  [1, 7, 10, 14, 15, 18, 19, 23, 24, 25, 30, 31, 33, 35, 36, 37, 39, 40,
   42, 43, 44, 45, 47, 57, 62, 63, 64, 67, 68, 69, 70, 76, 79, 80, 83,
   84, 86, 87, 90, 93, 99, 100, 102, 103, 104, 116, 117, 118, 119, 120,
   122, 127, 130, 136, 137, 138, 139, 140, 145, 146, 148, 149].forEach(i => map[i] = 4);
  // 1=building, 7=car, 10=fence, 14=door, 15=table, etc.

  // LOW_AMBIENT (5): walls, ceiling, misc (default, already set)
  [0, 5, 8, 22, 27, 28, 32, 38, 41, 48, 49, 50, 51, 53, 54, 55, 56, 58,
   59, 65, 71, 74, 77, 78, 81, 88, 89, 92, 94, 95, 96, 97, 98, 101, 105,
   106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 121, 123, 124, 125,
   129, 131, 133, 135, 142, 143, 144].forEach(i => map[i] = 5);
  // 0=wall, 5=ceiling, 8=windowpane, etc.

  return map;
})();

// ADE20K class names for display
const ADE20K_NAMES: string[] = [
  'wall','building','sky','floor','tree','ceiling','road','bed','windowpane',
  'grass','cabinet','sidewalk','person','earth','door','table','mountain',
  'plant','curtain','chair','car','water','painting','sofa','shelf',
  'house','sea','mirror','rug','field','armchair','seat','fence','desk',
  'rock','wardrobe','lamp','bathtub','railing','cushion','base','box',
  'column','signboard','chest','counter','sand','sink','skyscraper','fireplace',
  'refrigerator','grandstand','path','stairs','runway','case','pool table',
  'pillow','screen door','stairway','river','bridge','bookcase','blind',
  'coffee table','toilet','flower','book','hill','bench','countertop',
  'stove','palm','kitchen island','computer','swivel chair','boat','bar',
  'arcade machine','hovel','bus','towel','light','truck','tower','chandelier',
  'awning','streetlight','booth','television','airplane','dirt path',
  'apparel','pole','land','bannister','escalator','ottoman','bottle',
  'buffet','poster','stage','van','ship','fountain','conveyor belt','canopy',
  'washer','plaything','swimming pool','stool','barrel','basket','waterfall',
  'tent','bag','minibike','cradle','oven','ball','food','step','tank',
  'trade name','microwave','pot','animal','bicycle','lake','dishwasher',
  'screen','blanket','sculpture','hood','sconce','vase','traffic light',
  'tray','trash can','fan','pier','crt screen','plate','monitor',
  'bulletin board','shower','radiator','glass','clock','flag',
];

export interface SegmentResult {
  segments: Uint8Array;   // per-pixel audio category (0-5)
  count: number;          // always CATEGORY_COUNT (6)
  labels: string[];       // what was detected: "tree→cat1(5000px)"
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
      if (!segModel || !segProcessor) {
        onStatus?.('Loading segmentation model...');
        segProcessor = await AutoProcessor.from_pretrained(
          'Xenova/segformer-b0-finetuned-ade-512-512',
        );
        segModel = await SegformerForSemanticSegmentation.from_pretrained(
          'Xenova/segformer-b0-finetuned-ade-512-512',
          { quantized: true },
        );
      }

      onStatus?.('Segmenting scene...');

      // Load image
      const img = await RawImage.fromURL(imageUrl);

      // Run model
      const inputs = await segProcessor(img);
      const output = await segModel(inputs);

      // output.logits: [1, 150, H, W] — take argmax across class dim
      const logits = output.logits;
      const [, numClasses, outH, outW] = logits.dims;
      const logitData = logits.data as Float32Array;

      // Argmax per pixel at model resolution
      const classMap = new Uint8Array(outH * outW);
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          let maxVal = -Infinity;
          let maxIdx = 0;
          for (let c = 0; c < numClasses; c++) {
            const val = logitData[c * outH * outW + y * outW + x];
            if (val > maxVal) {
              maxVal = val;
              maxIdx = c;
            }
          }
          classMap[y * outW + x] = maxIdx;
        }
      }

      // Count pixels per class for labels
      const classCounts = new Map<number, number>();
      for (let i = 0; i < classMap.length; i++) {
        classCounts.set(classMap[i], (classCounts.get(classMap[i]) || 0) + 1);
      }

      // Map classes to audio categories and resize to target dimensions
      const segments = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(Math.floor((x / width) * outW), outW - 1);
          const sy = Math.min(Math.floor((y / height) * outH), outH - 1);
          const classIdx = classMap[sy * outW + sx];
          segments[y * width + x] = ADE20K_CLASS_TO_CATEGORY[classIdx] ?? 5;
        }
      }

      // Build labels for display
      const labels: string[] = [];
      const sorted = [...classCounts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [classIdx, count] of sorted) {
        if (count < 50) continue; // skip tiny regions
        const name = ADE20K_NAMES[classIdx] || `class${classIdx}`;
        const cat = ADE20K_CLASS_TO_CATEGORY[classIdx] ?? 5;
        const pct = ((count / classMap.length) * 100).toFixed(0);
        labels.push(`${name}→cat${cat}(${pct}%)`);
      }

      console.log(`[segment] ML: ${classCounts.size} classes detected`);
      console.log(`[segment] Labels: ${labels.join(', ')}`);
      return { segments, count: CATEGORY_COUNT, labels };

    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      console.error('[segment] ML failed:', errMsg);
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
