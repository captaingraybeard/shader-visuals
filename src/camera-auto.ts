// Autonomous fly-through camera — no user input, audio-driven movement
// Drifts forward, avoids surfaces using depth map, banks and turns smoothly

export class AutoCamera {
  // Camera state
  private posX = 0;
  private posY = 0;
  private posZ = 2.5;

  // Direction (yaw/pitch)
  private yaw = 0;
  private pitch = 0;

  // Smooth velocity targets
  private targetYaw = 0;
  private targetPitch = 0;
  private speed = 0.15;

  // Depth map for obstacle avoidance
  private depthMap: Float32Array | null = null;
  private depthW = 0;
  private depthH = 0;

  // Time tracking
  private driftPhase = 0;
  private lastBeatTime = 0;
  private turnTimer = 0;

  // Shake state
  private shakeX = 0;
  private shakeY = 0;

  setDepthMap(depth: Float32Array, w: number, h: number): void {
    this.depthMap = depth;
    this.depthW = w;
    this.depthH = h;
  }

  resetForNewScene(): void {
    // Smoothly transition to face new content
    this.posX = 0;
    this.posY = 0;
    this.posZ = 2.5;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
  }

  update(dt: number, bass: number, mid: number, high: number, beat: number): void {
    // Clamp dt to avoid huge jumps
    dt = Math.min(dt, 0.05);

    this.driftPhase += dt;
    this.turnTimer -= dt;

    // Beat triggers direction change
    if (beat > 0.5 && this.driftPhase - this.lastBeatTime > 0.3) {
      this.lastBeatTime = this.driftPhase;
      this.targetYaw += (Math.random() - 0.5) * 0.8;
      this.targetPitch += (Math.random() - 0.5) * 0.3;
    }

    // Gentle drift turns
    if (this.turnTimer <= 0) {
      this.turnTimer = 3 + Math.random() * 4;
      this.targetYaw += (Math.random() - 0.5) * 0.5;
      this.targetPitch += (Math.random() - 0.5) * 0.2;
    }

    // Gentle sinusoidal drift
    this.targetYaw += Math.sin(this.driftPhase * 0.2) * dt * 0.05;
    this.targetPitch += Math.cos(this.driftPhase * 0.15) * dt * 0.03;

    // Clamp pitch
    this.targetPitch = Math.max(-0.4, Math.min(0.4, this.targetPitch));

    // Smooth interpolation toward targets
    const lerpRate = 1.5 * dt;
    this.yaw += (this.targetYaw - this.yaw) * lerpRate;
    this.pitch += (this.targetPitch - this.pitch) * lerpRate;

    // Depth-based steering
    if (this.depthMap) {
      this.steerFromDepth();
    }

    // Audio-driven speed: bass and mid boost speed
    const audioSpeed = this.speed * (1.0 + bass * 0.5 + mid * 0.3);

    // Forward direction
    const cosP = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cosP;
    const dy = Math.sin(this.pitch);
    const dz = -Math.cos(this.yaw) * cosP;

    // Move forward
    this.posX += dx * audioSpeed * dt;
    this.posY += dy * audioSpeed * dt;
    this.posZ += dz * audioSpeed * dt;

    // Gentle Y bob
    this.posY += Math.sin(this.driftPhase * 0.4) * 0.002;

    // Keep camera within reasonable bounds
    this.posX = Math.max(-3, Math.min(3, this.posX));
    this.posY = Math.max(-2, Math.min(2, this.posY));
    // Cycle Z — when camera flies through, bring it back
    if (this.posZ < -2) { this.posZ = 3; this.targetYaw = Math.PI; }
    if (this.posZ > 4) { this.posZ = -1; this.targetYaw = 0; }

    // Bass camera shake
    const shakeAmount = bass * 0.02 + beat * 0.03;
    this.shakeX = (Math.random() - 0.5) * shakeAmount;
    this.shakeY = (Math.random() - 0.5) * shakeAmount;
  }

  private steerFromDepth(): void {
    if (!this.depthMap) return;

    // Sample depth in front of camera to detect obstacles
    // Project camera direction to depth map UV
    const u = (this.posX + 1) / 2;  // -1..1 → 0..1
    const v = (-this.posY + 1) / 2; // flip Y

    // Sample in look direction
    const lookU = u + Math.sin(this.yaw) * 0.1;
    const lookV = v - Math.sin(this.pitch) * 0.1;

    const centerDepth = this.sampleDepth(lookU, lookV);
    const leftDepth = this.sampleDepth(lookU - 0.15, lookV);
    const rightDepth = this.sampleDepth(lookU + 0.15, lookV);
    const upDepth = this.sampleDepth(lookU, lookV - 0.15);
    const downDepth = this.sampleDepth(lookU, lookV + 0.15);

    // Steer away from close surfaces (high depth = close)
    if (centerDepth > 0.7) {
      // Turn toward the side with more open space (lower depth)
      if (leftDepth < rightDepth) {
        this.targetYaw -= 0.02;
      } else {
        this.targetYaw += 0.02;
      }
      if (upDepth < downDepth) {
        this.targetPitch += 0.01;
      } else {
        this.targetPitch -= 0.01;
      }
    }
  }

  private sampleDepth(u: number, v: number): number {
    if (!this.depthMap) return 0;
    const x = Math.floor(Math.max(0, Math.min(1, u)) * (this.depthW - 1));
    const y = Math.floor(Math.max(0, Math.min(1, v)) * (this.depthH - 1));
    return this.depthMap[y * this.depthW + x];
  }

  getViewMatrix(): Float32Array {
    const ex = this.posX + this.shakeX;
    const ey = this.posY + this.shakeY;
    const ez = this.posZ;

    // Look-at target: position + forward direction
    const cosP = Math.cos(this.pitch);
    const tx = ex + Math.sin(this.yaw) * cosP;
    const ty = ey + Math.sin(this.pitch);
    const tz = ez - Math.cos(this.yaw) * cosP;

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
