/**
 * Probability distributions used by the simulation. All times are in seconds.
 */
import type { Rng } from "./rng";

export type Dist =
  | { kind: "const"; value: number }
  | { kind: "exp"; mean: number }
  | { kind: "uniform"; min: number; max: number }
  /** Lognormal described the way engineers talk: by its median and p99. */
  | { kind: "lognormal"; median: number; p99: number }
  /** Bounded Pareto: heavy tail with a hard cap. */
  | { kind: "pareto"; min: number; alpha: number; max: number }
  /** Mixture: with probability `p`, sample `a`, else `b` (e.g., GC pauses). */
  | { kind: "mix"; p: number; a: Dist; b: Dist };

const Z99 = 2.3263478740408408; // standard normal quantile at 0.99

function stdNormal(rng: Rng): number {
  // Box-Muller; one value per call keeps streams simple and deterministic.
  const u1 = rng.nextOpen();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(d: Dist, rng: Rng): number {
  switch (d.kind) {
    case "const":
      return d.value;
    case "exp":
      return -Math.log(rng.nextOpen()) * d.mean;
    case "uniform":
      return d.min + (d.max - d.min) * rng.next();
    case "lognormal": {
      const mu = Math.log(d.median);
      const sigma = Math.max(1e-9, (Math.log(d.p99) - mu) / Z99);
      return Math.exp(mu + sigma * stdNormal(rng));
    }
    case "pareto": {
      const u = rng.next();
      const { min: L, max: H, alpha: a } = d;
      const ha = Math.pow(H, a);
      const la = Math.pow(L, a);
      return Math.pow(-(u * ha - u * la - ha) / (ha * la), -1 / a);
    }
    case "mix":
      return rng.next() < d.p ? sample(d.a, rng) : sample(d.b, rng);
  }
}

/** Analytic mean, where it exists in closed form. Used by tests and the UI. */
export function mean(d: Dist): number {
  switch (d.kind) {
    case "const":
      return d.value;
    case "exp":
      return d.mean;
    case "uniform":
      return (d.min + d.max) / 2;
    case "lognormal": {
      const mu = Math.log(d.median);
      const sigma = (Math.log(d.p99) - mu) / Z99;
      return Math.exp(mu + (sigma * sigma) / 2);
    }
    case "pareto": {
      const { min: L, max: H, alpha: a } = d;
      if (a === 1) return ((H * L) / (H - L)) * Math.log(H / L);
      return (
        (Math.pow(L, a) / (1 - Math.pow(L / H, a))) *
        (a / (a - 1)) *
        (1 / Math.pow(L, a - 1) - 1 / Math.pow(H, a - 1))
      );
    }
    case "mix":
      return d.p * mean(d.a) + (1 - d.p) * mean(d.b);
  }
}

/** Scale every time in a distribution by `k` (used for slowdowns and faster hardware). */
export function scaleDist(d: Dist, k: number): Dist {
  switch (d.kind) {
    case "const":
      return { kind: "const", value: d.value * k };
    case "exp":
      return { kind: "exp", mean: d.mean * k };
    case "uniform":
      return { kind: "uniform", min: d.min * k, max: d.max * k };
    case "lognormal":
      return { kind: "lognormal", median: d.median * k, p99: d.p99 * k };
    case "pareto":
      return { kind: "pareto", min: d.min * k, alpha: d.alpha, max: d.max * k };
    case "mix":
      return { kind: "mix", p: d.p, a: scaleDist(d.a, k), b: scaleDist(d.b, k) };
  }
}

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Quantile of a lognormal described by median and p99. */
export function lognormalQuantile(median: number, p99: number, q: number): number {
  const sigma = (Math.log(p99) - Math.log(median)) / Z99;
  return median * Math.exp(sigma * normalQuantile(q));
}

export const ms = (x: number) => x / 1000;
export const us = (x: number) => x / 1e6;

/**
 * Zipf sampler over ranks 1..n with exponent s, via a precomputed CDF and binary search.
 * Returns 0-based ranks (0 = most popular).
 */
export class Zipf {
  readonly n: number;
  readonly s: number;
  private cdf: Float64Array;

  constructor(n: number, s: number) {
    if (n < 1) throw new Error("Zipf needs n >= 1");
    this.n = n;
    this.s = s;
    this.cdf = new Float64Array(n);
    let acc = 0;
    for (let k = 1; k <= n; k++) {
      acc += 1 / Math.pow(k, s);
      this.cdf[k - 1] = acc;
    }
    for (let i = 0; i < n; i++) this.cdf[i] = (this.cdf[i] as number) / acc;
  }

  /** Probability of rank r (0-based). */
  p(r: number): number {
    const hi = this.cdf[r] as number;
    const lo = r === 0 ? 0 : (this.cdf[r - 1] as number);
    return hi - lo;
  }

  sample(rng: Rng): number {
    const u = rng.next();
    let lo = 0,
      hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.cdf[mid] as number) < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
