/**
 * Metric helpers usable on either side of the worker boundary.
 */
import { LatencyHistogram } from "./structures";
import { FAIL_REASONS, type Aggregate, type FailReason, type NotableEvent, type WindowMetrics } from "./types";

export function aggregateWindows(windows: WindowMetrics[], from = 0, to = Infinity, sloS?: number): Aggregate {
  const h = new LatencyHistogram();
  const reasons: Record<FailReason, number> = { timeout: 0, rejected: 0, error: 0, session: 0, down: 0 };
  let arrivals = 0,
    attempts = 0,
    ok = 0,
    failed = 0,
    costSum = 0,
    span = 0,
    count = 0;
  const utilAcc: Record<string, number> = {};
  for (const w of windows) {
    if (w.t < from - 1e-9 || w.t + w.dt > to + 1e-9) continue;
    count++;
    arrivals += w.arrivals;
    attempts += w.attempts;
    ok += w.ok;
    failed += w.failed;
    for (const r of FAIL_REASONS) reasons[r] += w.failReasons[r];
    for (const [b, c] of w.hist) h.counts[b]! += c;
    h.n += w.ok;
    h.sum += w.mean * w.ok;
    if (w.max > h.max) h.max = w.max;
    costSum += w.costPerMonth * w.dt;
    span += w.dt;
    for (const [id, nw] of Object.entries(w.nodes)) utilAcc[id] = (utilAcc[id] ?? 0) + Math.max(nw.util, nw.workerUtil) * w.dt;
  }
  const util: Record<string, number> = {};
  for (const [id, v] of Object.entries(utilAcc)) util[id] = span > 0 ? v / span : 0;
  const total = ok + failed;
  return {
    from,
    to: count ? Math.min(to, from + span) : from,
    arrivals,
    attempts,
    ok,
    failed,
    failReasons: reasons,
    p50: h.quantile(0.5),
    p95: h.quantile(0.95),
    p99: h.quantile(0.99),
    mean: h.mean,
    throughput: span > 0 ? ok / span : 0,
    errorRate: total > 0 ? failed / total : 0,
    availability: total > 0 ? ok / total : 1,
    sloGood: sloS === undefined ? (total > 0 ? ok / total : 1) : total > 0 ? h.countUnder(sloS) / total : 1,
    sloS,
    costPerMonth: span > 0 ? costSum / span : 0,
    util,
  };
}

/** Windows that break a simple SLO (p99 and/or error rate). */
export function badWindows(windows: WindowMetrics[], slo: { p99?: number; errorRate?: number }): WindowMetrics[] {
  return windows.filter((w) => (slo.p99 !== undefined && w.ok > 0 && w.p99 > slo.p99) || (slo.errorRate !== undefined && w.errorRate > slo.errorRate));
}

const CAUSAL: NotableEvent["kind"][] = ["node-down", "health-eject", "outlier-eject", "saturated", "queue-overflow", "session-loss", "retry-amplification", "timeouts"];

/**
 * The first notable event that plausibly started the trouble: the earliest causal event at or
 * before the first bad window (with a little slack), else the first causal event after it.
 */
export function findCause(windows: WindowMetrics[], notables: NotableEvent[], slo: { p99?: number; errorRate?: number }): { event?: NotableEvent; firstBad?: WindowMetrics } {
  const bad = badWindows(windows, slo);
  const firstBad = bad[0];
  if (!firstBad) return {};
  const causal = notables.filter((e) => CAUSAL.includes(e.kind));
  const before = causal.filter((e) => e.t <= firstBad.t + firstBad.dt + 1);
  const event = before.length ? before.reduce((best, e) => (CAUSAL.indexOf(e.kind) < CAUSAL.indexOf(best.kind) && e.t >= firstBad.t - 30 ? e : best), before[before.length - 1]!) : causal[0];
  return { event, firstBad };
}
