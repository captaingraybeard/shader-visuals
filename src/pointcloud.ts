// Point cloud types — all construction happens server-side

export type ProjectionMode = 'planar' | 'equirectangular';

export interface PointCloudData {
  positions: Float32Array; // x, y, z per point (3 floats each)
  colors: Float32Array;    // r, g, b per point (3 floats each)
  segments: Float32Array;  // 1 float per point, segment category normalized to 0-1
  objectIds: Float32Array; // 1 float per point, unique object ID normalized to 0-1
  count: number;
  projection: ProjectionMode;
  numObjects: number;      // total unique objects from segmentation
}
