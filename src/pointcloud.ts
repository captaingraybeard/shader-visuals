// Image + depth → 3D point cloud buffers

export interface PointCloudData {
  positions: Float32Array; // x, y, z per point (3 floats each)
  colors: Float32Array;    // r, g, b per point (3 floats each)
  count: number;
}

/**
 * Build a point cloud from an image and depth map.
 * Samples every `step` pixels for performance.
 * Positions normalized to [-1, 1] centered at origin.
 */
export function buildPointCloud(
  image: HTMLImageElement,
  depthMap: Float32Array,
  step = 2,
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

  const cols = Math.floor(w / step);
  const rows = Math.floor(h / step);
  const count = cols * rows;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * step;
      const py = row * step;

      // Normalize x,y to [-1, 1]
      const x = (px / w) * 2 - 1;
      const y = -((py / h) * 2 - 1); // flip Y so top is up

      // Depth: 0-1 mapped to z range [-0.5, 0.5]
      const depthIdx = py * w + px;
      const z = (depthMap[depthIdx] - 0.5);

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      // Color from image pixel
      const pixIdx = (py * w + px) * 4;
      colors[idx * 3] = pixels[pixIdx] / 255;
      colors[idx * 3 + 1] = pixels[pixIdx + 1] / 255;
      colors[idx * 3 + 2] = pixels[pixIdx + 2] / 255;

      idx++;
    }
  }

  return { positions, colors, count };
}
