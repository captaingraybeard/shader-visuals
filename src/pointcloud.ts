// Image + depth → 3D point cloud buffers
// Uses EVERY pixel as a point for maximum density

export interface PointCloudData {
  positions: Float32Array; // x, y, z per point (3 floats each)
  colors: Float32Array;    // r, g, b per point (3 floats each)
  segments: Float32Array;  // 1 float per point, segment ID normalized to 0-1
  count: number;
}

/**
 * Build a point cloud from an image and depth map.
 * Every pixel becomes a point — no sampling, no gaps.
 */
export function buildPointCloud(
  image: HTMLImageElement,
  depthMap: Float32Array,
  segmentData?: Uint8Array,
  segmentCount?: number,
): PointCloudData {
  const canvas = document.createElement('canvas');
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  const count = w * h;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const segments = new Float32Array(count);
  const segNorm = segmentCount && segmentCount > 1 ? segmentCount - 1 : 1;

  // Spherical projection params
  const SPHERE_RADIUS = 10.0;
  const DEPTH_PUSH = 9.5;  // close at r=0.5, far at r=10.0
  const ARC_H = Math.PI * 2;
  const ARC_V = Math.PI * 0.85;
  const ARC_H_OFFSET = -Math.PI;
  const ARC_V_OFFSET = (Math.PI - ARC_V) / 2;

  // Debug: log depth stats
  let dMin = Infinity, dMax = -Infinity, dSum = 0;
  for (let i = 0; i < depthMap.length; i++) {
    if (depthMap[i] < dMin) dMin = depthMap[i];
    if (depthMap[i] > dMax) dMax = depthMap[i];
    dSum += depthMap[i];
  }
  console.log(`[pointcloud] depth stats: min=${dMin.toFixed(3)} max=${dMax.toFixed(3)} mean=${(dSum/depthMap.length).toFixed(3)} pixels=${count}`);

  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const v = y / h;
      const depth = depthMap[i]; // 0=far, 1=close

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
      colors[idx * 3]     = pixels[pixIdx] / 255;
      colors[idx * 3 + 1] = pixels[pixIdx + 1] / 255;
      colors[idx * 3 + 2] = pixels[pixIdx + 2] / 255;

      // Segment ID normalized to 0-1
      segments[idx] = segmentData ? segmentData[i] / segNorm : 0;

      idx++;
    }
  }

  return { positions, colors, segments, count };
}
