// Image + depth → 3D point cloud buffers with edge-aware density sampling

export interface PointCloudData {
  positions: Float32Array; // x, y, z per point (3 floats each)
  colors: Float32Array;    // r, g, b per point (3 floats each)
  count: number;
}

/**
 * Build a point cloud from an image and depth map.
 * Uses Sobel edge detection to sample more points on detailed areas
 * and fewer on flat regions like sky.
 * Target: ~150K-300K points.
 */
export function buildPointCloud(
  image: HTMLImageElement,
  depthMap: Float32Array,
): PointCloudData {
  // Draw image to canvas to extract pixel data
  const canvas = document.createElement('canvas');
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // Step 1: Convert to grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // Step 2: Sobel filter for edge magnitude
  const edges = sobelFilter(gray, w, h);

  // Step 3: Build probability map and estimate total points
  const EDGE_BOOST = 0.7;
  const TARGET_MIN = 400_000;
  const TARGET_MAX = 600_000;

  // First pass: compute raw probabilities and sum to estimate count
  const prob = new Float32Array(w * h);
  let probSum = 0;
  for (let i = 0; i < w * h; i++) {
    // Start with a base density of 1.0, will be scaled down
    prob[i] = edges[i] * EDGE_BOOST;
    probSum += prob[i];
  }

  // Compute base density to hit target count
  // Total expected = sum(baseDensity + edge*EDGE_BOOST) for all pixels
  // = w*h*baseDensity + probSum
  // We want this between TARGET_MIN and TARGET_MAX
  const targetCount = (TARGET_MIN + TARGET_MAX) / 2;
  let baseDensity = Math.max(0.05, (targetCount - probSum) / (w * h));
  baseDensity = Math.min(baseDensity, 0.8);

  // Add base density to probabilities
  for (let i = 0; i < w * h; i++) {
    prob[i] = Math.min(1.0, baseDensity + prob[i]);
  }

  // Step 4: Sample points using probability map
  // First pass: count how many points we'll generate (for allocation)
  // Use a seeded pseudo-random for deterministic results
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let count = 0;
  const selected = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (rand() < prob[i]) {
      selected[i] = 1;
      count++;
    }
  }

  // Allocate buffers
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // Second pass: fill buffers
  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!selected[i]) continue;

      // Spherical projection matching the mesh cylinder
      const u = x / w;
      const v = y / h;
      const depth = depthMap[i]; // 0=far, 1=close

      // Same sphere params as renderer-mesh
      const SPHERE_RADIUS = 5.0;
      const DEPTH_PUSH = 3.5;
      const ARC_H = Math.PI * 2;
      const ARC_V = Math.PI * 0.85;
      const ARC_H_OFFSET = -Math.PI;
      const ARC_V_OFFSET = (Math.PI - ARC_V) / 2;

      const theta = ARC_H_OFFSET + u * ARC_H;
      const phi = ARC_V_OFFSET + v * ARC_V;
      const r = SPHERE_RADIUS - depth * DEPTH_PUSH;

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      positions[idx * 3]     = Math.sin(theta) * sinPhi * r;
      positions[idx * 3 + 1] = cosPhi * r;
      positions[idx * 3 + 2] = -Math.cos(theta) * sinPhi * r;

      // Color from image pixel
      const pixIdx = i * 4;
      colors[idx * 3] = pixels[pixIdx] / 255;
      colors[idx * 3 + 1] = pixels[pixIdx + 1] / 255;
      colors[idx * 3 + 2] = pixels[pixIdx + 2] / 255;

      idx++;
    }
  }

  return { positions, colors, count };
}

/**
 * Sobel edge detection filter.
 * Returns Float32Array of edge magnitudes normalized to 0-1.
 */
function sobelFilter(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  let maxEdge = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // 3x3 Sobel kernels
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];

      // Gx = [-1 0 1; -2 0 2; -1 0 1]
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      const mag = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = mag;
      if (mag > maxEdge) maxEdge = mag;
    }
  }

  // Normalize to 0-1
  if (maxEdge > 0) {
    for (let i = 0; i < edges.length; i++) {
      edges[i] /= maxEdge;
    }
  }

  return edges;
}
