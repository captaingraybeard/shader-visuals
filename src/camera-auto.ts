// Autonomous camera — orbits and drifts around the scene, never leaves it
// Audio-driven movement: bass = shake, beat = direction change, energy = speed

export class AutoCamera {
  // Orbit state (spherical coords around origin)
  private theta = 0;       // horizontal angle
  private phi = 0.3;       // vertical angle (0 = front, +/- = up/down)
  private radius = 2.8;    // distance from center
  
  // Target values for smooth lerp
  private targetTheta = 0;
  private targetPhi = 0.3;
  private targetRadius = 2.8;

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
    this.phi = 0.3;
    this.radius = 2.8;
    this.targetTheta = 0;
    this.targetPhi = 0.3;
    this.targetRadius = 2.8;
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

    // Continuous slow orbit — always moving
    const audioSpeedBoost = 1.0 + bass * 0.8 + mid * 0.4;
    this.targetTheta += this.orbitSpeed * dt * audioSpeedBoost;

    // Gentle vertical drift (sinusoidal)
    this.targetPhi = 0.3 + Math.sin(this.phase * 0.15) * 0.25;

    // Gentle radius breathing
    this.targetRadius = 2.8 + Math.sin(this.phase * 0.2) * 0.4 + bass * 0.3;

    // Beat triggers bigger direction changes
    if (beat > 0.5 && this.phase - this.lastBeatTime > 0.4) {
      this.lastBeatTime = this.phase;
      // Reverse orbit direction or jump angle
      this.orbitSpeed = -this.orbitSpeed + (Math.random() - 0.5) * 0.06;
      // Keep minimum orbit speed
      if (Math.abs(this.orbitSpeed) < 0.04) {
        this.orbitSpeed = (this.orbitSpeed >= 0 ? 1 : -1) * 0.06;
      }
      this.targetPhi += (Math.random() - 0.5) * 0.3;
    }

    // Clamp phi (don't go directly above/below)
    this.targetPhi = Math.max(-0.5, Math.min(0.8, this.targetPhi));
    
    // Clamp radius (stay in scene)
    this.targetRadius = Math.max(1.5, Math.min(4.0, this.targetRadius));

    // Smooth interpolation
    const lerpRate = 2.0 * dt;
    this.theta += (this.targetTheta - this.theta) * lerpRate;
    this.phi += (this.targetPhi - this.phi) * lerpRate;
    this.radius += (this.targetRadius - this.radius) * lerpRate;

    // Bass camera shake
    const shakeAmount = bass * 0.015 + beat * 0.025;
    this.shakeX = (Math.random() - 0.5) * shakeAmount;
    this.shakeY = (Math.random() - 0.5) * shakeAmount;
  }

  getViewMatrix(): Float32Array {
    // Convert spherical to cartesian
    const cosPhi = Math.cos(this.phi);
    const ex = Math.sin(this.theta) * cosPhi * this.radius + this.shakeX;
    const ey = Math.sin(this.phi) * this.radius + this.shakeY;
    const ez = Math.cos(this.theta) * cosPhi * this.radius;

    // Always look at center of scene
    return lookAt(ex, ey, ez, 0, 0, 0, 0, 1, 0);
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
