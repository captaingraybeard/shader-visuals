// Image + depth → 3D point cloud buffers
// Uses EVERY pixel as a point for maximum density
// Supports planar and equirectangular (sphere) projection modes

export type ProjectionMode = 'planar' | 'equirectangular';

export interface PointCloudData {
  positions: Float32Array; // x, y, z per point (3 floats each)
  colors: Float32Array;    // r, g, b per point (3 floats each)
  segments: Float32Array;  // 1 float per point, segment ID normalized to 0-1
  count: number;
  projection: ProjectionMode;
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
  projection: ProjectionMode = 'planar',
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

  if (projection === 'equirectangular') {
    buildEquirectangular(positions, colors, segments, pixels, depthMap, segmentData, segNorm, w, h);
  } else {
    buildPlanar(positions, colors, segments, pixels, depthMap, segmentData, segNorm, w, h);
  }

  return { positions, colors, segments, count, projection };
}

function buildPlanar(
  positions: Float32Array,
  colors: Float32Array,
  segments: Float32Array,
  pixels: Uint8ClampedArray,
  depthMap: Float32Array,
  segmentData: Uint8Array | undefined,
  segNorm: number,
  w: number,
  h: number,
): void {
  const PLANE_WIDTH = 8.0;
  const PLANE_HEIGHT = PLANE_WIDTH * (h / w);
  const DEPTH_RANGE = 6.0;
  const DEPTH_OFFSET = -3.0;

  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;
      const v = y / h;
      const depth = depthMap[i];

      positions[idx * 3]     = (u - 0.5) * PLANE_WIDTH;
      positions[idx * 3 + 1] = (0.5 - v) * PLANE_HEIGHT;
      positions[idx * 3 + 2] = DEPTH_OFFSET - (1.0 - depth) * DEPTH_RANGE;

      const pixIdx = i * 4;
      colors[idx * 3]     = pixels[pixIdx] / 255;
      colors[idx * 3 + 1] = pixels[pixIdx + 1] / 255;
      colors[idx * 3 + 2] = pixels[pixIdx + 2] / 255;

      segments[idx] = segmentData ? segmentData[i] / segNorm : 0;
      idx++;
    }
  }
}

/**
 * Equirectangular → sphere projection.
 * Maps pixel (u,v) to (longitude, latitude) on a sphere.
 * Depth pushes points outward/inward along the radius.
 * Camera sits at the center (origin).
 */
function buildEquirectangular(
  positions: Float32Array,
  colors: Float32Array,
  segments: Float32Array,
  pixels: Uint8ClampedArray,
  depthMap: Float32Array,
  segmentData: Uint8Array | undefined,
  segNorm: number,
  w: number,
  h: number,
): void {
  // Sphere parameters
  const BASE_RADIUS = 10.0;     // base sphere radius
  const DEPTH_RANGE = 4.0;      // how much depth displaces (inward from surface)

  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = x / w;       // 0→1 across width = full 360° longitude
      const v = y / h;       // 0→1 down height = 180° latitude

      // Equirectangular mapping:
      // longitude: 0→2π (full wrap around Y axis)
      // latitude: 0→π (top to bottom)
      const lon = u * Math.PI * 2;           // 0 to 2π
      const lat = v * Math.PI;               // 0 (top/north) to π (bottom/south)

      // Depth modulates radius — close objects push outward, far objects stay at surface
      // depth: 1=close (larger radius), 0=far (base radius)
      const depth = depthMap[i];
      const radius = BASE_RADIUS - (1.0 - depth) * DEPTH_RANGE;

      // Spherical to cartesian (Y-up coordinate system)
      const sinLat = Math.sin(lat);
      const cosLat = Math.cos(lat);
      const sinLon = Math.sin(lon);
      const cosLon = Math.cos(lon);

      positions[idx * 3]     = radius * sinLat * sinLon;   // X
      positions[idx * 3 + 1] = radius * cosLat;             // Y (up)
      positions[idx * 3 + 2] = radius * sinLat * cosLon;    // Z

      const pixIdx = i * 4;
      colors[idx * 3]     = pixels[pixIdx] / 255;
      colors[idx * 3 + 1] = pixels[pixIdx + 1] / 255;
      colors[idx * 3 + 2] = pixels[pixIdx + 2] / 255;

      segments[idx] = segmentData ? segmentData[i] / segNorm : 0;
      idx++;
    }
  }
}
