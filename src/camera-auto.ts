// Autonomous camera — orbits and drifts around the scene, never leaves it
// Audio-driven movement: bass = shake, beat = direction change, energy = speed

export class AutoCamera {
  // Look direction (camera stays near origin, looks outward at the cylinder)
  private theta = 0;       // horizontal look angle
  private phi = 0;         // vertical look angle
  
  // Target values for smooth lerp
  private targetTheta = 0;
  private targetPhi = 0;
  
  // Small position drift (stays near center)
  private posX = 0;
  private posY = 0;
  private posZ = 0;

  // Orbit speed
  private orbitSpeed = 0.08;
  
  // Drift phase
  private phase = 0;
  private lastBeatTime = 0;
  
  // Shake
  private shakeX = 0;
  private shakeY = 0;

  // Depth map (for future use)
  private depthMap: Float32Array | null = null;
  private depthW = 0;
  private depthH = 0;

  setDepthMap(depth: Float32Array, w: number, h: number): void {
    this.depthMap = depth;
    this.depthW = w;
    this.depthH = h;
  }

  resetForNewScene(): void {
    this.theta = 0;
    this.phi = 0;
    this.targetTheta = 0;
    this.targetPhi = 0;
    this.posX = 0;
    this.posY = 0;
    this.posZ = 0;
    this.phase = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  reset(): void {
    this.resetForNewScene();
  }

  update(dt: number, bass: number, mid: number, _high: number, beat: number): void {
    dt = Math.min(dt, 0.05);
    this.phase += dt;

    // Slow panning look — always gently looking around inside the cylinder
    const audioSpeedBoost = 1.0 + bass * 0.5 + mid * 0.3;
    this.targetTheta += this.orbitSpeed * dt * audioSpeedBoost;

    // Gentle vertical look drift
    this.targetPhi = Math.sin(this.phase * 0.12) * 0.3;

    // Beat triggers look direction changes
    if (beat > 0.5 && this.phase - this.lastBeatTime > 0.4) {
      this.lastBeatTime = this.phase;
      this.orbitSpeed = -this.orbitSpeed + (Math.random() - 0.5) * 0.04;
      if (Math.abs(this.orbitSpeed) < 0.03) {
        this.orbitSpeed = (this.orbitSpeed >= 0 ? 1 : -1) * 0.04;
      }
      this.targetPhi += (Math.random() - 0.5) * 0.2;
    }

    // Clamp vertical look (don't look straight up/down)
    this.targetPhi = Math.max(-0.6, Math.min(0.6, this.targetPhi));

    // Smooth interpolation
    const lerpRate = 2.0 * dt;
    this.theta += (this.targetTheta - this.theta) * lerpRate;
    this.phi += (this.targetPhi - this.phi) * lerpRate;

    // Gentle position drift (small movements inside the cylinder)
    this.posX = Math.sin(this.phase * 0.08) * 0.3;
    this.posY = Math.sin(this.phase * 0.06) * 0.15;
    this.posZ = Math.cos(this.phase * 0.1) * 0.2;

    // Bass camera shake
    const shakeAmount = bass * 0.01 + beat * 0.02;
    this.shakeX = (Math.random() - 0.5) * shakeAmount;
    this.shakeY = (Math.random() - 0.5) * shakeAmount;
  }

  getViewMatrix(): Float32Array {
    // Camera at near-origin, looking outward at the cylinder
    const ex = this.posX + this.shakeX;
    const ey = this.posY + this.shakeY;
    const ez = this.posZ;

    // Look direction from angles
    const cosP = Math.cos(this.phi);
    const tx = ex + Math.sin(this.theta) * cosP;
    const ty = ey + Math.sin(this.phi);
    const tz = ez - Math.cos(this.theta) * cosP;

    return lookAt(ex, ey, ez, tx, ty, tz, 0, 1, 0);
  }

  getProjectionMatrix(aspect: number): Float32Array {
    return perspective(Math.PI / 4, aspect, 0.01, 100);
  }
}

// ── Matrix math (column-major for WebGL) ──────────

function lookAt(
  ex: number, ey: number, ez: number,
  tx: number, ty: number, tz: number,
  ux: number, uy: number, uz: number,
): Float32Array {
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

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, 2 * near * far * rangeInv, 0,
  ]);
}
