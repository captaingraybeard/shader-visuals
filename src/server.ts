/**
 * Server API client — calls the ML pipeline server and parses binary response
 * into PointCloudData for the renderer.
 *
 * Binary format: [4 bytes header_len LE][JSON header][packed point cloud]
 * Per point (20 bytes): float32[3] pos + uint8[3] color + uint8 segment + uint8[4] pad
 */

import type { PointCloudData, ProjectionMode } from './pointcloud';
import { CATEGORY_COUNT } from './segment';

/**
 * Server URL — hardcoded config. Change this when deploying behind a tunnel/VPS.
 * Empty string = server disabled, client-side fallback only.
 */
const SERVER_URL = 'https://interpreted-former-throw-let.trycloudflare.com';

export function getServerUrl(): string {
  return SERVER_URL;
}

export function isServerConfigured(): boolean {
  return SERVER_URL.length > 0;
}

export interface ServerResult {
  cloud: PointCloudData;
  labels: string[];
  metadata: Record<string, unknown>;
}

/**
 * Call server /generate endpoint and parse binary response into PointCloudData.
 */
export async function generateFromServer(
  prompt: string,
  vibe: string,
  mode: 'standard' | 'panorama',
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<ServerResult> {
  const serverUrl = getServerUrl();
  if (!serverUrl) throw new Error('Server URL not configured');

  onStatus?.('Sending to server...');

  const resp = await fetch(`${serverUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, vibe, mode, api_key: apiKey }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Server error ${resp.status}: ${text}`);
  }

  onStatus?.('Receiving point cloud...');
  const buffer = await resp.arrayBuffer();

  return parseServerResponse(buffer, mode === 'panorama' ? 'equirectangular' : 'planar');
}

/**
 * Check if server is reachable.
 */
export async function checkServerHealth(url?: string): Promise<boolean> {
  const base = url || getServerUrl();
  if (!base) return false;
  try {
    const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Parse the binary response from the server into PointCloudData.
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

    // Position: 3 x float32
    positions[i * 3] = data.getFloat32(off, true);
    positions[i * 3 + 1] = data.getFloat32(off + 4, true);
    positions[i * 3 + 2] = data.getFloat32(off + 8, true);

    // Color: 3 x uint8 → normalized float
    colors[i * 3] = data.getUint8(off + 12) / 255;
    colors[i * 3 + 1] = data.getUint8(off + 13) / 255;
    colors[i * 3 + 2] = data.getUint8(off + 14) / 255;

    // Segment: uint8 category ID → normalized 0..1 (shader decodes via * 5.0 + 0.5)
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
