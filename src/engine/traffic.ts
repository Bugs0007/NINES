/**
 * Traffic shapes: request rate (req/s) as a function of sim time.
 */

export type RateCurve =
  | { kind: "const"; rps: number }
  /** Piecewise-linear (or step) through [t, rps] keyframes; holds the last value. */
  | { kind: "keyframes"; points: [number, number][]; step?: boolean }
  /** Sinusoidal day: trough at t=0, peak at period/2. */
  | { kind: "diurnal"; base: number; peak: number; periodS: number }
  /** Base load with a spike: ramp up, hold, decay back. */
  | { kind: "spike"; base: number; peak: number; at: number; rampS: number; holdS: number; decayS: number };

export function rateAt(c: RateCurve, t: number): number {
  switch (c.kind) {
    case "const":
      return c.rps;
    case "keyframes": {
      const pts = c.points;
      if (pts.length === 0) return 0;
      const first = pts[0]!;
      if (t <= first[0]) return first[1];
      for (let i = 1; i < pts.length; i++) {
        const [t1, r1] = pts[i]!;
        if (t < t1) {
          const [t0, r0] = pts[i - 1]!;
          if (c.step) return r0;
          return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
        }
      }
      return pts[pts.length - 1]![1];
    }
    case "diurnal": {
      const phase = (2 * Math.PI * t) / c.periodS;
      return c.base + ((c.peak - c.base) * (1 - Math.cos(phase))) / 2;
    }
    case "spike": {
      const { base, peak, at, rampS, holdS, decayS } = c;
      if (t < at) return base;
      if (t < at + rampS) return base + ((peak - base) * (t - at)) / rampS;
      if (t < at + rampS + holdS) return peak;
      const d = t - at - rampS - holdS;
      if (d < decayS) return peak - ((peak - base) * d) / decayS;
      return base;
    }
  }
}

/** Upper bound of the rate over [t0, t1]. Used for Poisson thinning. */
export function maxRateOver(c: RateCurve, t0: number, t1: number): number {
  switch (c.kind) {
    case "const":
      return c.rps;
    case "keyframes": {
      let m = Math.max(rateAt(c, t0), rateAt(c, t1));
      for (const [t, r] of c.points) if (t >= t0 && t <= t1) m = Math.max(m, r);
      return m;
    }
    default: {
      let m = 0;
      for (let i = 0; i <= 8; i++) m = Math.max(m, rateAt(c, t0 + ((t1 - t0) * i) / 8));
      return m * 1.05 + 1e-9;
    }
  }
}

export function peakRate(c: RateCurve, horizonS: number): number {
  return maxRateOver(c, 0, horizonS);
}
