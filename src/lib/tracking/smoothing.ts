import type { Vec3 } from "@/lib/types";

/**
 * 1€ filter — low latency when the signal moves fast, heavy smoothing when it
 * is nearly still. Exactly what landmark jitter needs.
 */
class OneEuroScalar {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tSeconds: number): number {
    if (this.xPrev === null || !Number.isFinite(x)) {
      this.xPrev = x;
      this.tPrev = tSeconds;
      return x;
    }
    const dt = Math.max(1e-3, tSeconds - this.tPrev);
    this.tPrev = tSeconds;

    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroScalar.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = OneEuroScalar.alpha(cutoff, dt);
    const out = a * x + (1 - a) * this.xPrev;
    this.xPrev = out;
    return out;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

export class OneEuroVec3 {
  private fx: OneEuroScalar;
  private fy: OneEuroScalar;
  private fz: OneEuroScalar;

  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1) {
    this.fx = new OneEuroScalar(minCutoff, beta, dCutoff);
    this.fy = new OneEuroScalar(minCutoff, beta, dCutoff);
    this.fz = new OneEuroScalar(minCutoff, beta, dCutoff);
  }

  filter(v: Vec3, t: number): Vec3 {
    return {
      x: this.fx.filter(v.x, t),
      y: this.fy.filter(v.y, t),
      z: this.fz.filter(v.z, t),
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/** Keyed bank of 1€ filters, created lazily per landmark. */
export class VectorSmoother {
  private banks = new Map<string, OneEuroVec3>();

  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
  ) {}

  filter(key: string, v: Vec3, t: number): Vec3 {
    let f = this.banks.get(key);
    if (!f) {
      f = new OneEuroVec3(this.minCutoff, this.beta);
      this.banks.set(key, f);
    }
    return f.filter(v, t);
  }

  /** Higher = snappier / less smoothing. Rebuilds the bank. */
  setStrength(smoothing: number) {
    // smoothing 0 (raw) .. 1 (very smooth)
    this.minCutoff = 8 - 7.4 * smoothing;
    this.beta = 0.02 + 0.28 * (1 - smoothing);
    this.banks.clear();
  }

  reset() {
    this.banks.clear();
  }
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(smoothing: number, dt: number) {
  const halfLife = 0.008 + smoothing * 0.12;
  return 1 - Math.pow(2, -dt / halfLife);
}
