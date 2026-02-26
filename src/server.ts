/**
 * Server API client — calls RunPod serverless endpoint for ML pipeline.
 * Parses binary response into PointCloudData for the renderer.
 *
 * Binary format: [4 bytes header_len LE][JSON header][packed point cloud]
 * Per point (20 bytes): float32[3] pos + uint8[3] color + uint8 segment + uint8[4] pad
 */

import type { PointCloudData, ProjectionMode } from './pointcloud';
import { CATEGORY_COUNT } from './segment';

/**
 * RunPod endpoint configuration.
 * RUNPOD_ENDPOINT_ID is set after deploying the serverless endpoint.
 * The API key is stored in localStorage alongside the OpenAI key.
 */
const RUNPOD_ENDPOINT_ID = ''; // TODO: set after deployment
const RUNPOD_BASE = RUNPOD_ENDPOINT_ID
  ? `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`
  : '';

/**
 * Fallback: direct server URL for local development / self-hosted.
 * Used when RUNPOD_ENDPOINT_ID is empty.
 */
const DIRECT_SERVER_URL = 'http://localhost:8000';

function getRunPodApiKey(): string {
  return localStorage.getItem('shader-visuals-runpod-key') || '';
}

export function getServerUrl(): string {
  return RUNPOD_BASE || DIRECT_SERVER_URL;
}

export function isServerConfigured(): boolean {
  // RunPod mode: need endpoint ID + API key
  if (RUNPOD_BASE) return !!getRunPodApiKey();
  // Direct mode: always configured (localhost)
  return !!DIRECT_SERVER_URL;
}

export interface ServerResult {
  cloud: PointCloudData;
  labels: string[];
  metadata: Record<string, unknown>;
}

/**
 * Call RunPod serverless /runsync or direct /generate endpoint.
 */
export async function generateFromServer(
  prompt: string,
  vibe: string,
  mode: 'standard' | 'panorama',
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<ServerResult> {
  if (RUNPOD_BASE) {
    return generateViaRunPod(prompt, vibe, mode, apiKey, onStatus);
  }
  return generateDirect(prompt, vibe, mode, apiKey, onStatus);
}

/**
 * RunPod serverless path — /runsync returns JSON with base64 payload.
 */
async function generateViaRunPod(
  prompt: string,
  vibe: string,
  mode: 'standard' | 'panorama',
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<ServerResult> {
  const runpodKey = getRunPodApiKey();
  if (!runpodKey) throw new Error('RunPod API key not set');

  onStatus?.('Sending to RunPod...');

  // Start the job
  const startResp = await fetch(`${RUNPOD_BASE}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${runpodKey}`,
    },
    body: JSON.stringify({
      input: { prompt, vibe, mode, api_key: apiKey },
    }),
  });

  if (!startResp.ok) {
    const text = await startResp.text();
    throw new Error(`RunPod error ${startResp.status}: ${text}`);
  }

  const startData = await startResp.json();
  const jobId = startData.id;

  if (startData.status === 'COMPLETED') {
    // Instant completion (unlikely but possible)
    return processRunPodOutput(startData.output, mode);
  }

  // Poll for completion
  onStatus?.('Processing on GPU...');
  const pollUrl = `${RUNPOD_BASE}/status/${jobId}`;
  const maxWait = 5 * 60 * 1000; // 5 min
  const pollInterval = 2000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${runpodKey}` },
    });

    if (!pollResp.ok) continue;

    const pollData = await pollResp.json();

    if (pollData.status === 'COMPLETED') {
      onStatus?.('Receiving point cloud...');
      return processRunPodOutput(pollData.output, mode);
    }

    if (pollData.status === 'FAILED') {
      throw new Error(`RunPod job failed: ${pollData.error || 'unknown'}`);
    }

    // IN_QUEUE or IN_PROGRESS — keep polling
    onStatus?.(`GPU processing... (${Math.round((Date.now() - start) / 1000)}s)`);
  }

  throw new Error('RunPod job timed out (5 min)');
}

function processRunPodOutput(
  output: { pointcloud_b64?: string; error?: string },
  mode: string,
): ServerResult {
  if (output.error) throw new Error(`Pipeline error: ${output.error}`);
  if (!output.pointcloud_b64) throw new Error('No point cloud in response');

  // Decode base64 to ArrayBuffer
  const binaryStr = atob(output.pointcloud_b64);
  const buffer = new ArrayBuffer(binaryStr.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binaryStr.length; i++) {
    view[i] = binaryStr.charCodeAt(i);
  }

  const projection: ProjectionMode = mode === 'panorama' ? 'equirectangular' : 'planar';
  return parseServerResponse(buffer, projection);
}

/**
 * Direct server path (localhost / tunnel) — returns raw binary.
 */
async function generateDirect(
  prompt: string,
  vibe: string,
  mode: 'standard' | 'panorama',
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<ServerResult> {
  onStatus?.('Sending to server...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  const resp = await fetch(`${DIRECT_SERVER_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, vibe, mode, api_key: apiKey }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server error ${resp.status}: ${text}`);
  }

  onStatus?.('Receiving point cloud...');
  const buffer = await resp.arrayBuffer();
  const projection: ProjectionMode = mode === 'panorama' ? 'equirectangular' : 'planar';
  return parseServerResponse(buffer, projection);
}

/**
 * Check if server is reachable.
 */
export async function checkServerHealth(url?: string): Promise<boolean> {
  if (RUNPOD_BASE) {
    // RunPod health check
    const key = getRunPodApiKey();
    if (!key) return false;
    try {
      const resp = await fetch(`${RUNPOD_BASE}/health`, {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  const base = url || DIRECT_SERVER_URL;
  if (!base) return false;
  try {
    const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Parse the binary response into PointCloudData.
 */
function parseServerResponse(buffer: ArrayBuffer, projection: ProjectionMode): ServerResult {
  const view = new DataView(buffer);

  // Read header length (4 bytes, little-endian uint32)
  const headerLen = view.getUint32(0, true);
  const headerBytes = new Uint8Array(buffer, 4, headerLen);
  const metadata = JSON.parse(new TextDecoder().decode(headerBytes));

  // Point cloud data starts after header
  const dataOffset = 4 + headerLen;
  const pointCount = metadata.point_count as number;
  const BYTES_PER_POINT = 20;

  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const segments = new Float32Array(pointCount);

  const data = new DataView(buffer, dataOffset);

  for (let i = 0; i < pointCount; i++) {
    const off = i * BYTES_PER_POINT;

    positions[i * 3] = data.getFloat32(off, true);
    positions[i * 3 + 1] = data.getFloat32(off + 4, true);
    positions[i * 3 + 2] = data.getFloat32(off + 8, true);

    colors[i * 3] = data.getUint8(off + 12) / 255;
    colors[i * 3 + 1] = data.getUint8(off + 13) / 255;
    colors[i * 3 + 2] = data.getUint8(off + 14) / 255;

    const catId = data.getUint8(off + 15);
    segments[i] = CATEGORY_COUNT > 1 ? catId / (CATEGORY_COUNT - 1) : 0;
  }

  const labels = (metadata.segments_detected as string[]) || [];

  return {
    cloud: { positions, colors, segments, count: pointCount, projection },
    labels,
    metadata,
  };
}
