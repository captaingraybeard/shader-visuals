// Simple orbit camera with mouse/touch support
// Returns a 4x4 view matrix

export class OrbitCamera {
  theta = 0;       // horizontal angle (radians)
  phi = Math.PI / 2; // vertical angle (radians), PI/2 = looking from front
  distance = 2.5;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinchDist = 0;
  private canvas: HTMLCanvasElement | null = null;

  // Bound handlers for cleanup
  private _onMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private _onMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private _onMouseUp = () => this.onMouseUp();
  private _onWheel = (e: WheelEvent) => this.onWheel(e);
  private _onTouchStart = (e: TouchEvent) => this.onTouchStart(e);
  private _onTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private _onTouchEnd = () => this.onTouchEnd();

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this._onTouchEnd);
  }

  /** Returns a 4x4 view matrix as Float32Array (column-major for WebGL) */
  getViewMatrix(): Float32Array {
    // Clamp phi to avoid gimbal lock
    const phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));

    // Camera position in spherical coordinates
    const cx = this.distance * Math.sin(phi) * Math.sin(this.theta);
    const cy = this.distance * Math.cos(phi);
    const cz = this.distance * Math.sin(phi) * Math.cos(this.theta);

    return lookAt(cx, cy, cz, 0, 0, 0, 0, 1, 0);
  }

  /** Returns a 4x4 perspective projection matrix */
  getProjectionMatrix(aspect: number): Float32Array {
    return perspective(Math.PI / 4, aspect, 0.01, 100);
  }

  // ── Mouse ──────────────────────────────────────

  private onMouseDown(e: MouseEvent): void {
    // Only respond to left-click on the canvas itself
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.theta += dx * 0.005;
    this.phi += dy * 0.005;
    this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
  }

  private onMouseUp(): void {
    this.dragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.distance += e.deltaY * 0.003;
    this.distance = Math.max(0.5, Math.min(10, this.distance));
  }

  // ── Touch ──────────────────────────────────────

  private onTouchStart(e: TouchEvent): void {
    // Don't prevent default if touch is on UI elements
    if ((e.target as HTMLElement).closest('.sv-panel, .sv-settings')) return;
    e.preventDefault();
    if (e.touches.length === 1) {
      this.dragging = true;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.dragging = false;
      this.pinchDist = touchDistance(e.touches[0], e.touches[1]);
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if ((e.target as HTMLElement).closest('.sv-panel, .sv-settings')) return;
    e.preventDefault();
    if (e.touches.length === 1 && this.dragging) {
      const dx = e.touches[0].clientX - this.lastX;
      const dy = e.touches[0].clientY - this.lastY;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
      this.theta += dx * 0.005;
      this.phi += dy * 0.005;
      this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
    } else if (e.touches.length === 2) {
      const d = touchDistance(e.touches[0], e.touches[1]);
      const delta = this.pinchDist - d;
      this.distance += delta * 0.005;
      this.distance = Math.max(0.5, Math.min(10, this.distance));
      this.pinchDist = d;
    }
  }

  private onTouchEnd(): void {
    this.dragging = false;
  }
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Matrix math (column-major for WebGL) ──────────

function lookAt(
  ex: number, ey: number, ez: number,
  tx: number, ty: number, tz: number,
  ux: number, uy: number, uz: number,
): Float32Array {
  // Forward (from target to eye)
  let fx = ex - tx, fy = ey - ty, fz = ez - tz;
  let len = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (len > 0) { fx /= len; fy /= len; fz /= len; }

  // Right = up × forward
  let rx = uy * fz - uz * fy;
  let ry = uz * fx - ux * fz;
  let rz = ux * fy - uy * fx;
  len = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (len > 0) { rx /= len; ry /= len; rz /= len; }

  // Recompute up = forward × right
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
