// Autonomous camera — adapts to scene projection mode
// Planar: sits in front of scene, drifts laterally
// Equirectangular: sits at center of sphere, rotates to look around

import type { ProjectionMode } from './pointcloud';

export class AutoCamera {
  private mode: ProjectionMode = 'planar';

  // === Shared state ===
  private phase = 0;
  private lastBeatTime = 0;
  private shakeX = 0;
  private shakeY = 0;

  // === Planar mode ===
  private posX = 0;
  private posY = 0;
  private posZ = 3.0;
  private forwardZ = 0;   // accumulated forward drift
  private theta = 0;      // horizontal look offset
  private phi = 0;        // vertical look offset
  private targetTheta = 0;
  private targetPhi = 0;

  // === Sphere mode ===
  private yaw = 0;        // horizontal rotation (radians)
  private pitch = 0;      // vertical rotation (radians)
  private targetYaw = 0;
  private targetPitch = 0;
  private yawSpeed = 0.08; // base rotation speed

  setMode(mode: ProjectionMode): void {
    this.mode = mode;
  }

  resetForNewScene(): void {
    this.theta = 0;
    this.phi = 0;
    this.targetTheta = 0;
    this.targetPhi = 0;
    this.posX = 0;
    this.posY = 0;
    this.posZ = 3.0;
    this.forwardZ = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
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

    if (this.mode === 'equirectangular') {
      this.updateSphere(dt, bass, mid, beat);
    } else {
      this.updatePlanar(dt, bass, mid, beat);
    }

    // Bass camera shake (both modes)
    const shakeAmount = bass * 0.008 + beat * 0.015;
    this.shakeX = (Math.random() - 0.5) * shakeAmount;
    this.shakeY = (Math.random() - 0.5) * shakeAmount;
  }

  private updatePlanar(dt: number, bass: number, mid: number, beat: number): void {
    const audioSpeedBoost = 1.0 + bass * 0.3 + mid * 0.2;
    this.targetTheta = Math.sin(this.phase * 0.06) * 0.3 * audioSpeedBoost;
    this.targetPhi = Math.sin(this.phase * 0.08 + 1.0) * 0.15;

    if (beat > 0.5 && this.phase - this.lastBeatTime > 0.4) {
      this.lastBeatTime = this.phase;
      this.targetTheta += (Math.random() - 0.5) * 0.15;
      this.targetPhi += (Math.random() - 0.5) * 0.1;
    }

    this.targetTheta = Math.max(-0.5, Math.min(0.5, this.targetTheta));
    this.targetPhi = Math.max(-0.3, Math.min(0.3, this.targetPhi));

    const lerpRate = 2.0 * dt;
    this.theta += (this.targetTheta - this.theta) * lerpRate;
    this.phi += (this.targetPhi - this.phi) * lerpRate;

    // Continuous forward drift (-Z) — "flying through space"
    const forwardSpeed = 0.3 + bass * 0.5;
    this.forwardZ -= forwardSpeed * dt;

    const driftScale = 1.2 + bass * 0.4;
    this.posX = Math.sin(this.phase * 0.07) * driftScale;
    this.posY = Math.sin(this.phase * 0.05) * 0.5;
    this.posZ = 3.0 + this.forwardZ + Math.sin(this.phase * 0.04) * 1.0 + bass * 0.3;
  }

  private updateSphere(dt: number, bass: number, mid: number, beat: number): void {
    // Continuous horizontal rotation — always slowly panning around
    const audioSpeed = 1.0 + bass * 0.5 + mid * 0.3;
    this.targetYaw += this.yawSpeed * dt * audioSpeed;

    // Gentle vertical oscillation
    this.targetPitch = Math.sin(this.phase * 0.05) * 0.3;

    // Beat triggers yaw jumps
    if (beat > 0.5 && this.phase - this.lastBeatTime > 0.5) {
      this.lastBeatTime = this.phase;
      this.targetYaw += (Math.random() - 0.5) * 0.4;
      this.targetPitch += (Math.random() - 0.5) * 0.2;
    }

    // Clamp pitch to avoid looking straight up/down
    this.targetPitch = Math.max(-1.2, Math.min(1.2, this.targetPitch));

    // Smooth interpolation
    const lerpRate = 2.5 * dt;
    this.yaw += (this.targetYaw - this.yaw) * lerpRate;
    this.pitch += (this.targetPitch - this.pitch) * lerpRate;
  }

  getViewMatrix(): Float32Array {
    if (this.mode === 'equirectangular') {
      return this.getViewMatrixSphere();
    }
    return this.getViewMatrixPlanar();
  }

  private getViewMatrixPlanar(): Float32Array {
    const ex = this.posX + this.shakeX;
    const ey = this.posY + this.shakeY;
    const ez = this.posZ;
    const tx = this.theta * 4.0;
    const ty = this.phi * 3.0;
    const tz = -6.0;
    return lookAt(ex, ey, ez, tx, ty, tz, 0, 1, 0);
  }

  private getViewMatrixSphere(): Float32Array {
    // Camera at origin, looking outward based on yaw/pitch
    const ex = this.shakeX;
    const ey = this.shakeY;
    const ez = 0;

    // Look direction from yaw/pitch
    const cosPitch = Math.cos(this.pitch);
    const tx = ex + Math.sin(this.yaw) * cosPitch;
    const ty = ey + Math.sin(this.pitch);
    const tz = ez + Math.cos(this.yaw) * cosPitch;

    return lookAt(ex, ey, ez, tx, ty, tz, 0, 1, 0);
  }

  getProjectionMatrix(aspect: number): Float32Array {
    if (this.mode === 'equirectangular') {
      // Wider FOV for immersive sphere viewing
      return perspective(Math.PI / 2.2, aspect, 0.1, 100);
    }
    return perspective(Math.PI / 3, aspect, 0.01, 100);
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
