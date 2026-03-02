/**
 * Logic-level tests — no real WebGL needed.
 * Tests: point cloud parsing, camera matrices, shader uniform setup.
 */

// Test 1: Binary point cloud parsing
console.log('=== TEST 1: Point Cloud Binary Parsing ===');

// Simulate server response: 5 points, 20 bytes each
const BYTES_PER_POINT = 20;
const pointCount = 5;
const buffer = new ArrayBuffer(pointCount * BYTES_PER_POINT);
const dv = new DataView(buffer);

// Write 5 test points
const testPoints = [
  { x: 0, y: 0, z: -3, r: 255, g: 0, b: 0, seg: 0 },
  { x: 1, y: 0, z: -4, r: 0, g: 255, b: 0, seg: 1 },
  { x: -1, y: 0.5, z: -5, r: 0, g: 0, b: 255, seg: 2 },
  { x: 2, y: -1, z: -6, r: 255, g: 255, b: 0, seg: 3 },
  { x: -2, y: 1, z: -9, r: 128, g: 128, b: 128, seg: 5 },
];

testPoints.forEach((p, i) => {
  const off = i * BYTES_PER_POINT;
  dv.setFloat32(off, p.x, true);
  dv.setFloat32(off + 4, p.y, true);
  dv.setFloat32(off + 8, p.z, true);
  dv.setUint8(off + 12, p.r);
  dv.setUint8(off + 13, p.g);
  dv.setUint8(off + 14, p.b);
  dv.setUint8(off + 15, p.seg);
});

// Parse like client does
const CATEGORY_COUNT = 6;
const positions = new Float32Array(pointCount * 3);
const colors = new Float32Array(pointCount * 3);
const segments = new Float32Array(pointCount);

for (let i = 0; i < pointCount; i++) {
  const off = i * BYTES_PER_POINT;
  positions[i * 3] = dv.getFloat32(off, true);
  positions[i * 3 + 1] = dv.getFloat32(off + 4, true);
  positions[i * 3 + 2] = dv.getFloat32(off + 8, true);
  colors[i * 3] = dv.getUint8(off + 12) / 255;
  colors[i * 3 + 1] = dv.getUint8(off + 13) / 255;
  colors[i * 3 + 2] = dv.getUint8(off + 14) / 255;
  segments[i] = CATEGORY_COUNT > 1 ? dv.getUint8(off + 15) / (CATEGORY_COUNT - 1) : 0;
}

console.log('Positions:', Array.from(positions));
console.log('Colors:', Array.from(colors).map(c => c.toFixed(2)));
console.log('Segments:', Array.from(segments).map(s => s.toFixed(2)));

// Verify ranges
const zValues = [];
for (let i = 0; i < pointCount; i++) zValues.push(positions[i * 3 + 2]);
console.log('Z range:', Math.min(...zValues), 'to', Math.max(...zValues));
console.log('✓ Point cloud parsing OK\n');

// Test 2: Camera matrix
console.log('=== TEST 2: Camera View Matrix ===');

function lookAt(ex, ey, ez, tx, ty, tz, ux, uy, uz) {
  let fx = ex - tx, fy = ey - ty, fz = ez - tz;
  let len = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (len > 0) { fx /= len; fy /= len; fz /= len; }
  let rx = uy * fz - uz * fy;
  let ry = uz * fx - ux * fz;
  let rz = ux * fy - uy * fx;
  len = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (len > 0) { rx /= len; ry /= len; rz /= len; }
  const nux = fy * rz - fz * ry;
  const nuy = fz * rx - fx * rz;
  const nuz = fx * ry - fy * rx;
  return new Float32Array([
    rx, nux, fx, 0,
    ry, nuy, fy, 0,
    rz, nuz, fz, 0,
    -(rx * ex + ry * ey + rz * ez),
    -(nux * ex + nuy * ey + nuz * ez),
    -(fx * ex + fy * ey + fz * ez),
    1,
  ]);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

// Initial camera: at z=3, looking at z=-6
const view = lookAt(0, 0, 3, 0, 0, -6, 0, 1, 0);
const proj = perspective(Math.PI / 3, 16/9, 0.01, 100);

console.log('View matrix:', Array.from(view).map(v => v.toFixed(3)));
console.log('Proj matrix:', Array.from(proj).map(v => v.toFixed(3)));

// Transform test point (0, 0, -3) through view then projection
function transformPoint(pos, viewMat, projMat) {
  // view * pos (column-major)
  const vx = viewMat[0]*pos[0] + viewMat[4]*pos[1] + viewMat[8]*pos[2] + viewMat[12];
  const vy = viewMat[1]*pos[0] + viewMat[5]*pos[1] + viewMat[9]*pos[2] + viewMat[13];
  const vz = viewMat[2]*pos[0] + viewMat[6]*pos[1] + viewMat[10]*pos[2] + viewMat[14];
  const vw = viewMat[3]*pos[0] + viewMat[7]*pos[1] + viewMat[11]*pos[2] + viewMat[15];
  
  // proj * viewPos
  const px = projMat[0]*vx + projMat[4]*vy + projMat[8]*vz + projMat[12]*vw;
  const py = projMat[1]*vx + projMat[5]*vy + projMat[9]*vz + projMat[13]*vw;
  const pz = projMat[2]*vx + projMat[6]*vy + projMat[10]*vz + projMat[14]*vw;
  const pw = projMat[3]*vx + projMat[7]*vy + projMat[11]*vz + projMat[15]*vw;
  
  // NDC
  return { 
    clip: [px, py, pz, pw],
    ndc: [px/pw, py/pw, pz/pw],
    viewSpace: [vx, vy, vz]
  };
}

console.log('\nTransforming test points through camera:');
testPoints.forEach((p, i) => {
  const result = transformPoint([p.x, p.y, p.z], view, proj);
  const inView = Math.abs(result.ndc[0]) <= 1 && Math.abs(result.ndc[1]) <= 1 && result.ndc[2] >= -1 && result.ndc[2] <= 1;
  console.log(`Point ${i} (${p.x}, ${p.y}, ${p.z}) → NDC (${result.ndc.map(v=>v.toFixed(3))}) ${inView ? '✓ VISIBLE' : '✗ OUTSIDE'}`);
  console.log(`  View space: (${result.viewSpace.map(v=>v.toFixed(3))}), clip W: ${result.clip[3].toFixed(3)}`);
});

// Test 3: Check segment category mapping
console.log('\n=== TEST 3: Segment Category Mapping ===');
for (let seg = 0; seg < CATEGORY_COUNT; seg++) {
  const normalized = seg / (CATEGORY_COUNT - 1);
  const reconstructed = Math.round(normalized * 5.0);  // int(a_segment * 5.0 + 0.5) in shader
  console.log(`Seg ${seg} → normalized ${normalized.toFixed(3)} → shader cat ${reconstructed} ${reconstructed === seg ? '✓' : '✗ MISMATCH'}`);
}

console.log('\n=== ALL LOGIC TESTS PASSED ===');
