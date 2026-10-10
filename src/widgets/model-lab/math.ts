/** Small, exact numeric helpers shared by lab models. React-free and deterministic. */

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, error < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal CDF (Acklam, relative error < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
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

/** A lognormal fitted to a median and a p99. */
export function lognormal(median: number, p99: number) {
  const sigma = Math.log(p99 / median) / normInv(0.99);
  return {
    sigma,
    cdf: (x: number) => (x <= 0 ? 0 : normCdf(Math.log(x / median) / sigma)),
    quantile: (p: number) => median * Math.exp(sigma * normInv(p)),
  };
}

/** Smallest x in [lo, hi] with f(x) >= p for a non-decreasing f. */
export function bisect(f: (x: number) => number, p: number, lo: number, hi: number, iters = 60): number {
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= p) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Erlang C: probability an arrival has to wait in an M/M/c queue with offered load a = λ/μ (needs a < c). */
export function erlangC(c: number, a: number): number {
  if (a >= c) return 1;
  let sum = 0;
  let term = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) term *= a / k;
    sum += term;
  }
  const top = (term * a) / c / (1 - a / c);
  return top / (sum + top);
}

/** Mean time in an M/M/c system (seconds), service time s, arrival rate lambda. Infinity when overloaded. */
export function mmcMean(c: number, lambda: number, s: number): number {
  const a = lambda * s;
  if (a >= c) return Infinity;
  return s + (erlangC(c, a) * s) / (c - a);
}

/**
 * Approximate p99 of time in an M/M/c system: the 99th percentile of the wait (exponential tail with rate
 * (c - a) / s) plus a service-time tail of `tailFactor` x s. A sum of two p99s is a slightly pessimistic bound.
 */
export function mmcP99(c: number, lambda: number, s: number, tailFactor = 3): number {
  const a = lambda * s;
  if (a >= c) return Infinity;
  const pw = erlangC(c, a);
  const rate = (c - a) / s;
  const wait99 = pw > 0.01 ? Math.log(pw / 0.01) / rate : 0;
  return wait99 + s * tailFactor;
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
