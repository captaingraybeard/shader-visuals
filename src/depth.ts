// Depth estimation — radial gradient fallback
// (ONNX / Depth Anything v2 can be added later)

/**
 * Generate a depth map from an image.
 * Currently uses a radial gradient (center = close, edges = far).
 * Returns a Float32Array of normalized 0-1 depth values (1 = close, 0 = far).
 */
export function estimateDepth(width: number, height: number): Float32Array {
  const depth = new Float32Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      // 1.0 at center (close), 0.0 at corners (far)
      depth[y * width + x] = 1.0 - r / maxR;
    }
  }

  return depth;
}
