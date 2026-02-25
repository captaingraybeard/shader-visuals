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

  // 3D planar projection: image is a plane, depth displaces along Z
  // This gives real parallax — close objects are physically closer to camera
  const PLANE_WIDTH = 8.0;   // world units wide
  const PLANE_HEIGHT = PLANE_WIDTH * (h / w); // maintain aspect ratio
  const DEPTH_RANGE = 6.0;   // how far depth pushes (close=0, far=-DEPTH_RANGE)
  const DEPTH_OFFSET = -3.0; // base distance from camera (negative Z = away)

  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const v = y / h;
      const depth = depthMap[i]; // 0=far, 1=close

      // X: left to right
      const px = (u - 0.5) * PLANE_WIDTH;
      // Y: top to bottom (flip so +Y is up)
      const py = (0.5 - v) * PLANE_HEIGHT;
      // Z: depth — close objects near camera (less negative), far objects pushed back
      const pz = DEPTH_OFFSET - (1.0 - depth) * DEPTH_RANGE;

      positions[idx * 3]     = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;

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
