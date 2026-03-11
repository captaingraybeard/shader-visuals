// Mobile/low-end device detection and render scaling

export interface DeviceProfile {
  isMobile: boolean;
  isLowEnd: boolean;
  renderScale: number;
  maxPoints: number;
  enableCreatures: boolean;
  enableSpotlight: boolean;
  enableDualLayer: boolean;
  shaderComplexity: 'full' | 'reduced' | 'minimal';
}

/**
 * Detect device capabilities and return appropriate render settings.
 * Call once at startup.
 */
export function detectDevice(): DeviceProfile {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  
  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  
  // Check device pixel ratio (high DPR = more pixels to push)
  const dpr = window.devicePixelRatio || 1;
  
  // Check screen size
  const screenArea = window.screen.width * window.screen.height;
  const isSmallScreen = screenArea < 1000000; // Less than ~1000x1000
  
  // Check for specific weak GPUs via WebGL renderer string
  let isWeakGPU = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        // Mali, Adreno 3xx/4xx, PowerVR, Apple A9 and below are typically weak
        isWeakGPU = /Mali-[GT]?[1-6]|Adreno [34]\d{2}|PowerVR|Apple A[4-9][^0-9]/i.test(renderer);
      }
    }
  } catch (e) {
    // Can't detect GPU, assume weak on mobile
    isWeakGPU = isMobile;
  }
  
  // Determine if this is a low-end device
  const isLowEnd = isMobile || cores <= 4 || isWeakGPU || (dpr >= 3 && isSmallScreen);
  
  // Determine render scale
  let renderScale = 1.0;
  if (isLowEnd) {
    renderScale = isMobile ? 0.5 : 0.75;
  }
  // On very high DPR devices, cap the effective resolution
  if (dpr >= 3) {
    renderScale = Math.min(renderScale, 0.5);
  }
  
  // Determine shader complexity
  let shaderComplexity: 'full' | 'reduced' | 'minimal' = 'full';
  if (isWeakGPU || (isMobile && cores <= 4)) {
    shaderComplexity = 'minimal';
  } else if (isLowEnd) {
    shaderComplexity = 'reduced';
  }
  
  // Point count limits
  let maxPoints = Infinity;
  if (shaderComplexity === 'minimal') {
    maxPoints = 50000;
  } else if (shaderComplexity === 'reduced') {
    maxPoints = 150000;
  }
  
  return {
    isMobile,
    isLowEnd,
    renderScale,
    maxPoints,
    enableCreatures: shaderComplexity === 'full',
    enableSpotlight: shaderComplexity !== 'minimal',
    enableDualLayer: shaderComplexity === 'full',
    shaderComplexity,
  };
}

/**
 * Apply render scale to a canvas.
 * Call on init and resize.
 */
export function applyRenderScale(canvas: HTMLCanvasElement, profile: DeviceProfile): void {
  const dpr = window.devicePixelRatio || 1;
  const effectiveDpr = dpr * profile.renderScale;
  
  const width = Math.floor(canvas.clientWidth * effectiveDpr);
  const height = Math.floor(canvas.clientHeight * effectiveDpr);
  
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * Downsample a point cloud if needed for the device profile.
 */
export function downsamplePointCloud(
  positions: Float32Array,
  colors: Float32Array,
  segments: Float32Array,
  objectIds: Float32Array,
  maxPoints: number,
): { positions: Float32Array; colors: Float32Array; segments: Float32Array; objectIds: Float32Array; count: number } {
  const currentCount = positions.length / 3;
  
  if (currentCount <= maxPoints) {
    return { positions, colors, segments, objectIds, count: currentCount };
  }
  
  // Simple stride-based downsampling
  const stride = Math.ceil(currentCount / maxPoints);
  const newCount = Math.floor(currentCount / stride);
  
  const newPositions = new Float32Array(newCount * 3);
  const newColors = new Float32Array(newCount * 3);
  const newSegments = new Float32Array(newCount);
  const newObjectIds = new Float32Array(newCount);
  
  for (let i = 0; i < newCount; i++) {
    const srcIdx = i * stride;
    newPositions[i * 3] = positions[srcIdx * 3];
    newPositions[i * 3 + 1] = positions[srcIdx * 3 + 1];
    newPositions[i * 3 + 2] = positions[srcIdx * 3 + 2];
    newColors[i * 3] = colors[srcIdx * 3];
    newColors[i * 3 + 1] = colors[srcIdx * 3 + 1];
    newColors[i * 3 + 2] = colors[srcIdx * 3 + 2];
    newSegments[i] = segments[srcIdx];
    newObjectIds[i] = objectIds[srcIdx];
  }
  
  return {
    positions: newPositions,
    colors: newColors,
    segments: newSegments,
    objectIds: newObjectIds,
    count: newCount,
  };
}
