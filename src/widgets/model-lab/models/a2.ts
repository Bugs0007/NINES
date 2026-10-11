/**
 * Chapter A2 "Growing Pains" models: fan-out tails, connection pools, autoscaling lag, and the Viral Tuesday boss.
 */
import { bisect, clamp, lognormal, mmcMean, mmcP99 } from "../math";
import { num, bool, str, sweep, type LabModel, type Values } from "../types";

type SceneOut = { set?: Values; focus?: string[] } | undefined;

// ------------------------------------------------------------------ fan-out tails

export interface FanoutCfg {
  /** Median and p99 of ONE backend call, seconds. */
  median: number;
  p99: number;
  calls: number;
  minCalls: number;
  maxCalls: number;
}
const fanCfg = (c: Record<string, unknown>): FanoutCfg => ({ median: 0.02, p99: 0.12, calls: 40, minCalls: 1, maxCalls: 200, ...(c as Partial<FanoutCfg>) });

/** Page-level latency quantile when a request waits for `n` parallel calls, optionally hedging each after `hedgeS`. */
export function fanoutQuantile(c: Pick<FanoutCfg, "median" | "p99">, n: number, hedgeS: number, q: number): number {
  const ln = lognormal(c.median, c.p99);
  const single = (x: number) => (hedgeS > 0 && x >= hedgeS ? 1 - (1 - ln.cdf(x)) * (1 - ln.cdf(x - hedgeS)) : ln.cdf(x));
  return bisect((x) => Math.pow(single(x), n), q, 0, 30);
}

export function fanoutEval(c: FanoutCfg, n: number, hedgeS: number) {
  const ln = lognormal(c.median, c.p99);
  const p50 = fanoutQuantile(c, n, hedgeS, 0.5);
  const p99 = fanoutQuantile(c, n, hedgeS, 0.99);
  const slowShare = 1 - Math.pow(hedgeS > 0 ? 1 - (1 - ln.cdf(c.p99)) * (1 - ln.cdf(Math.max(0, c.p99 - hedgeS))) : ln.cdf(c.p99), n);
  const extraLoad = hedgeS > 0 ? 1 - ln.cdf(hedgeS) : 0;
  return { p50, p99, slowShare, extraLoad };
}

export const fanoutLab: LabModel = {
  id: "fanout-lab",
  metrics: ["p50", "p99", "slowShare", "extraLoad", "calls"],
  observes: ["fanout-bites", "hedged"],
  scenes: ["multiply", "hedge"],
  runLabel: "Ship it",
  honest: [
    "Calls are independent and identically distributed (lognormal). In production a slow disk or a GC pause makes calls on the same host slow together, which is worse.",
    "Hedging here sends the duplicate to a different, equally healthy replica. If the slowness is in a shared dependency, a duplicate just adds load.",
  ],
  init: (c) => ({ calls: fanCfg(c).calls, hedgeMs: 0 }),
  controls: (c) => {
    const f = fanCfg(c);
    return [
      { kind: "slider", id: "calls", label: "Parallel calls per page", min: f.minCalls, max: f.maxCalls, step: 1, log: true, fmt: "int" },
      { kind: "slider", id: "hedgeMs", label: "Hedge a call after", min: 0, max: 200, step: 5, fmt: "ms", hint: "0 = no hedging. A duplicate goes to another replica; first answer wins." },
    ];
  },
  evaluate: (v, c) => {
    const f = fanCfg(c);
    const n = Math.round(num(v, "calls"));
    const h = num(v, "hedgeMs") / 1000;
    const e = fanoutEval(f, n, h);
    const base = fanoutEval(f, n, 0);
    const xs = sweep(Math.max(1, f.minCalls), f.maxCalls, 28, true);
    return {
      metrics: { p50: e.p50, p99: e.p99, slowShare: e.slowShare, extraLoad: e.extraLoad, calls: n },
      readouts: [
        { label: "Page p50", value: e.p50, fmt: "s" },
        { label: "Page p99", value: e.p99, fmt: "s", tone: e.p99 > f.p99 * 1.6 ? "alert" : e.p99 > f.p99 ? "warn" : "ok" },
        { label: `Pages slower than one call's p99 (${Math.round(f.p99 * 1000)}ms)`, value: e.slowShare, fmt: "pct", tone: e.slowShare > 0.2 ? "alert" : e.slowShare > 0.05 ? "warn" : "ok" },
        { label: "Extra backend load", value: e.extraLoad, fmt: "pct", sub: h > 0 ? "duplicates sent" : "no hedging" },
        { label: "Slowdown vs one call's p99", value: e.p99 / f.p99, fmt: "x" },
      ],
      view: {
        kind: "curve",
        xLabel: "parallel calls per page",
        yLabel: "page p99",
        xFmt: "int",
        yFmt: "s",
        xLog: true,
        series: [
          { id: "plain", label: "No hedging", tone: "alert", points: xs.map((x) => [x, fanoutQuantile(f, Math.round(x), 0, 0.99)] as [number, number]) },
          ...(h > 0 ? [{ id: "hedged", label: `Hedge after ${Math.round(h * 1000)}ms`, tone: "ok" as const, points: xs.map((x) => [x, fanoutQuantile(f, Math.round(x), h, 0.99)] as [number, number]) }] : []),
        ],
        marker: { x: n, y: e.p99, label: `${n} calls`, tone: "amber" },
        hLines: [{ y: f.p99, label: `one call's p99`, tone: "info" }],
      },
      notes: [base.slowShare > 0.05 ? `With ${n} calls, ${(base.slowShare * 100).toFixed(0)}% of pages hit at least one call slower than its own p99.` : `With ${n} calls, a slow call rarely lands in a page.`],
    };
  },
  events: (v, out, c) => {
    const f = fanCfg(c);
    const n = Math.round(num(v, "calls"));
    const ev: string[] = [];
    if (n >= 40 && num(v, "hedgeMs") === 0 && out.metrics.slowShare! >= 0.3) ev.push("fanout-bites");
    if (num(v, "hedgeMs") > 0 && out.metrics.extraLoad! <= 0.12 && out.metrics.p99! <= 0.75 * fanoutQuantile(f, n, 0, 0.99)) ev.push("hedged");
    return ev;
  },
  scene: (name): SceneOut => (name === "multiply" ? { set: { calls: 100, hedgeMs: 0 }, focus: ["calls"] } : name === "hedge" ? { set: { calls: 40, hedgeMs: 60 }, focus: ["hedgeMs"] } : undefined),
};

// ------------------------------------------------------------------ connection pools

export interface PoolCfg {
  appWorkers: number;
  poolPerWorker: number;
  dbCores: number;
  maxConnections: number;
  /** Connections reserved for superusers and replication. */
  reserved: number;
  queryMs: number;
  rps: number;
  poolerSize: number;
}
const poolCfg = (c: Record<string, unknown>): PoolCfg => ({ appWorkers: 16, poolPerWorker: 10, dbCores: 4, maxConnections: 100, reserved: 3, queryMs: 8, rps: 600, poolerSize: 20, ...(c as Partial<PoolCfg>) });

/** Illustrative efficiency: past about 2 x cores + 1 useful connections, each extra one costs a little (context switches, lock contention). */
function efficiency(conns: number, useful: number): number {
  return conns <= useful ? 1 : 1 / (1 + 0.004 * (conns - useful));
}

export function poolEval(c: PoolCfg, workers: number, perWorker: number, pooler: boolean, poolerSize = c.poolerSize) {
  const avail = c.maxConnections - c.reserved;
  const clientConns = workers * perWorker;
  const serverConns = pooler ? Math.min(poolerSize, avail) : Math.min(clientConns, avail);
  const refused = pooler ? 0 : Math.max(0, 1 - avail / clientConns);
  const useful = 2 * c.dbCores + 1;
  const eff = efficiency(serverConns, useful);
  const s = c.queryMs / 1000 / eff;
  const servers = Math.max(1, Math.min(serverConns, useful));
  const capacity = servers / s;
  const lambda = c.rps * (1 - refused);
  const util = lambda / capacity;
  const overload = util >= 1 ? 1 - capacity / lambda : 0;
  const p99 = util >= 1 ? 10 : mmcP99(servers, lambda, s) + (pooler ? 0.0005 : 0);
  const errorRate = clamp(refused + (1 - refused) * overload, 0, 1);
  return { clientConns, serverConns, capacity, util, p99, errorRate, eff, useful, refused };
}

export const poolLab: LabModel = {
  id: "pool-lab",
  metrics: ["p99", "errorRate", "serverConns", "clientConns", "util"],
  observes: ["over-max", "sweet-spot"],
  scenes: ["budget", "pooler"],
  runLabel: "Deploy it",
  honest: [
    "Queries are one fixed size, and the database is treated as c parallel servers where c is about 2 x cores + 1. Real queries vary, and disk waits change the best pool size.",
    "The slowdown from extra connections is drawn as a gentle curve to show the direction. The exact loss depends on your workload.",
    "The pooler is modelled as a transaction-mode PgBouncer: clients share its server connections, and it queues them without error.",
  ],
  init: (c) => {
    const p = poolCfg(c);
    return { workers: p.appWorkers, perWorker: p.poolPerWorker, pooler: false, poolerSize: p.poolerSize };
  },
  controls: (c) => {
    const p = poolCfg(c);
    return [
      { kind: "slider", id: "workers", label: "App workers", min: 1, max: 40, step: 1, fmt: "int", hint: `Each holds its own pool (rps ${p.rps})` },
      { kind: "slider", id: "perWorker", label: "Pool size per worker", min: 1, max: 30, step: 1, fmt: "int" },
      { kind: "toggle", id: "pooler", label: "PgBouncer in front", detail: "Transaction pooling: many clients share a few server connections" },
      { kind: "slider", id: "poolerSize", label: "PgBouncer server connections", min: 2, max: 60, step: 1, fmt: "int" },
    ];
  },
  evaluate: (v, c) => {
    const p = poolCfg(c);
    const w = Math.round(num(v, "workers"));
    const per = Math.round(num(v, "perWorker"));
    const on = bool(v, "pooler");
    const ps = Math.round(num(v, "poolerSize"));
    const e = poolEval(p, w, per, on, ps);
    const xs = Array.from({ length: 60 }, (_, i) => i + 1).filter((i) => i <= p.maxConnections - p.reserved);
    const cap = (n: number) => Math.min(n, 2 * p.dbCores + 1) / (p.queryMs / 1000 / efficiency(n, 2 * p.dbCores + 1));
    return {
      metrics: { p99: e.p99, errorRate: e.errorRate, serverConns: e.serverConns, clientConns: e.clientConns, util: e.util },
      readouts: [
        { label: "Connections the app wants", value: e.clientConns, fmt: "int", tone: e.clientConns > p.maxConnections - p.reserved && !on ? "alert" : undefined, sub: `limit ${p.maxConnections - p.reserved} usable` },
        { label: "Connections the database holds", value: e.serverConns, fmt: "int" },
        { label: "Database busy", value: Math.min(e.util, 9.99), fmt: "pct", tone: e.util > 0.9 ? "alert" : e.util > 0.7 ? "warn" : "ok" },
        { label: "p99 latency", value: e.p99, fmt: "s", tone: e.p99 > 0.1 ? "alert" : e.p99 > 0.05 ? "warn" : "ok" },
        { label: "Errors", value: e.errorRate, fmt: "pct", tone: e.errorRate > 0.01 ? "alert" : "ok", sub: e.refused > 0 ? "too many clients" : undefined },
      ],
      view: {
        kind: "curve",
        xLabel: "connections held by the database",
        yLabel: "throughput the database can sustain (req/s)",
        xFmt: "int",
        yFmt: "int",
        series: [{ id: "cap", label: "Capacity", tone: "ok", points: xs.map((x) => [x, cap(x)] as [number, number]) }],
        marker: { x: e.serverConns, y: e.capacity, label: `${e.serverConns} conns`, tone: e.errorRate > 0.01 ? "alert" : "amber" },
        hLines: [{ y: p.rps, label: `offered ${p.rps} req/s`, tone: "info" }],
        vLines: [{ x: e.useful, label: "cores x 2 + 1", tone: "muted" }],
      },
      notes: [
        !on && e.clientConns > p.maxConnections - p.reserved
          ? `${w} workers x ${per} = ${e.clientConns} connections against a limit of ${p.maxConnections - p.reserved}: new connections are refused.`
          : on
            ? `PgBouncer holds ${e.serverConns} server connections for ${e.clientConns} client connections.`
            : `${e.serverConns} connections fit under the limit.`,
      ],
    };
  },
  events: (v, out, c) => {
    const p = poolCfg(c);
    const ev: string[] = [];
    if (!bool(v, "pooler") && out.metrics.clientConns! > p.maxConnections - p.reserved) ev.push("over-max");
    if (out.metrics.errorRate! < 0.005 && out.metrics.util! < 0.8 && out.metrics.serverConns! <= 3 * (2 * p.dbCores + 1)) ev.push("sweet-spot");
    return ev;
  },
  scene: (name): SceneOut => (name === "budget" ? { set: { workers: 16, perWorker: 10, pooler: false }, focus: ["workers", "perWorker"] } : name === "pooler" ? { set: { pooler: true, poolerSize: 20 }, focus: ["pooler", "poolerSize"] } : undefined),
};

// ------------------------------------------------------------------ autoscaling lag

export interface AutoCfg {
  baseRps: number;
  peakRps: number;
  riseS: number;
  holdS: number;
  durationS: number;
  perInstanceRps: number;
  /** Seconds from "launch" to "taking traffic". */
  bootS: number;
  warmBootS: number;
  /** How often the autoscaler looks at its metric. */
  periodS: number;
  startInstances: number;
  maxInstances: number;
  serviceMs: number;
  /** Seconds of work a fleet will queue before it starts failing requests. */
  queueS: number;
  usdPerInstanceHour: number;
}
const autoCfg = (c: Record<string, unknown>): AutoCfg => ({
  baseRps: 200,
  peakRps: 1800,
  riseS: 240,
  holdS: 240,
  durationS: 720,
  perInstanceRps: 100,
  bootS: 150,
  warmBootS: 30,
  periodS: 60,
  startInstances: 3,
  maxInstances: 40,
  serviceMs: 50,
  queueS: 2,
  usdPerInstanceHour: 0.1008,
  ...(c as Partial<AutoCfg>),
});

export interface AutoRun {
  t: number[];
  demand: number[];
  capacity: number[];
  latency: number[];
  instances: number[];
  peakLatency: number;
  p99: number;
  dropShare: number;
  costUsd: number;
  maxInstances: number;
  /** Seconds the fleet was over capacity. */
  overS: number;
}

export function autoRun(c: AutoCfg, target: number, minInst: number, warm: boolean, scaleAt?: number): AutoRun {
  const boot = warm ? c.warmBootS : c.bootS;
  let ready = Math.max(minInst, c.startInstances);
  const pending: { at: number; n: number }[] = [];
  let backlog = 0;
  let served = 0;
  let dropped = 0;
  let total = 0;
  let costS = 0;
  const run: AutoRun = { t: [], demand: [], capacity: [], latency: [], instances: [], peakLatency: 0, p99: 0, dropShare: 0, costUsd: 0, maxInstances: ready, overS: 0 };
  let utilSum = 0;
  let utilN = 0;
  let calm = 0;
  const lats: { lat: number; w: number }[] = [];
  for (let t = 0; t < c.durationS; t++) {
    const ramp = t < 60 ? 0 : Math.min(1, (t - 60) / c.riseS);
    const fall = t > 60 + c.riseS + c.holdS ? Math.min(1, (t - (60 + c.riseS + c.holdS)) / c.riseS) : 0;
    const lambda = c.baseRps + (c.peakRps - c.baseRps) * ramp * (1 - fall);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i]!.at <= t) {
        ready += pending[i]!.n;
        pending.splice(i, 1);
      }
    }
    if (scaleAt !== undefined && t === scaleAt) {
      const want = Math.min(c.maxInstances, Math.ceil(c.peakRps / c.perInstanceRps / target));
      if (want > ready) pending.push({ at: t + boot, n: want - ready });
    }
    const cap = ready * c.perInstanceRps;
    backlog += lambda - cap;
    let drop = 0;
    if (backlog < 0) backlog = 0;
    const maxBacklog = cap * c.queueS;
    if (backlog > maxBacklog) {
      drop = backlog - maxBacklog;
      backlog = maxBacklog;
    }
    dropped += drop;
    total += lambda;
    served += Math.min(lambda, cap);
    const util = Math.min(1, lambda / cap);
    utilSum += Math.min(1, lambda / cap);
    utilN++;
    const rho = Math.min(0.97, util);
    const lat = c.serviceMs / 1000 / (1 - rho) + backlog / cap;
    run.t.push(t);
    run.demand.push(lambda);
    run.capacity.push(cap);
    run.latency.push(lat);
    run.instances.push(ready);
    run.peakLatency = Math.max(run.peakLatency, lat);
    lats.push({ lat, w: lambda - drop });
    if (lambda > cap) run.overS++;
    costS += ready + pending.reduce((s, p) => s + p.n, 0);
    run.maxInstances = Math.max(run.maxInstances, ready);
    // Target tracking: every period, size the fleet so the average utilization would equal the target.
    if ((t + 1) % c.periodS === 0 && scaleAt === undefined) {
      const avg = utilSum / utilN;
      utilSum = 0;
      utilN = 0;
      const inFlight = ready + pending.reduce((s, p) => s + p.n, 0);
      const desired = Math.min(c.maxInstances, Math.ceil((inFlight * avg) / target));
      if (desired > inFlight) {
        pending.push({ at: t + boot, n: desired - inFlight });
        calm = 0;
      } else if (desired < ready && pending.length === 0) {
        // Scale in only after the fleet has looked oversized for three checks in a row, and never below the minimum.
        if (++calm >= 3) {
          ready = Math.max(minInst, desired, ready - Math.ceil(ready * 0.3));
          calm = 0;
        }
      } else calm = 0;
    }
  }
  // Request-weighted p99 of latency across the run.
  const sorted = lats.sort((a, b) => a.lat - b.lat);
  const totalW = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= 0.99 * totalW) {
      run.p99 = x.lat;
      break;
    }
  }
  run.dropShare = total > 0 ? dropped / total : 0;
  run.costUsd = (costS / 3600) * c.usdPerInstanceHour;
  void served;
  return run;
}

export const autoscaleLab: LabModel = {
  id: "autoscale-lab",
  metrics: ["p99", "peakLatency", "errorRate", "costPerRun", "costPerMonth", "peakInstances"],
  observes: ["lag-hurts", "caught-up"],
  scenes: ["lag", "headroom", "warm"],
  runLabel: "Replay the spike",
  honest: [
    "Traffic is a smooth ramp and the fleet is a fluid: no per-request randomness. Real spikes are jagged, which makes the early minutes worse.",
    "The autoscaler follows AWS target tracking: every minute it sizes the fleet so average utilization would match the target, counting instances that are still booting.",
    "A new instance takes the boot time before it serves anything. Real boot times range from tens of seconds (warm pool, containers) to several minutes (large images, slow health checks).",
  ],
  init: () => ({ target: 0.6, minInst: 3, warm: false }),
  controls: () => [
    { kind: "slider", id: "target", label: "Target utilization", min: 0.2, max: 0.9, step: 0.05, fmt: "pct", hint: "Lower means more headroom and more instances" },
    { kind: "slider", id: "minInst", label: "Minimum instances", min: 1, max: 30, step: 1, fmt: "int" },
    { kind: "toggle", id: "warm", label: "Warm pool", detail: "Pre-initialised instances: boot drops from minutes to seconds" },
  ],
  evaluate: (v, c) => {
    const a = autoCfg(c);
    const r = autoRun(a, num(v, "target"), Math.round(num(v, "minInst")), bool(v, "warm"));
    const ts = r.t.filter((_, i) => i % 6 === 0);
    const at = (arr: number[]) => ts.map((t) => [t, arr[t]!] as [number, number]);
    return {
      metrics: { p99: r.p99, peakLatency: r.peakLatency, errorRate: r.dropShare, costPerRun: r.costUsd, costPerMonth: Math.round(num(v, "minInst")) * a.usdPerInstanceHour * 730, peakInstances: r.maxInstances },
      readouts: [
        { label: "Worst latency", value: r.peakLatency, fmt: "s", tone: r.peakLatency > 1 ? "alert" : r.peakLatency > 0.3 ? "warn" : "ok" },
        { label: "p99 over the spike", value: r.p99, fmt: "s" },
        { label: "Requests failed", value: r.dropShare, fmt: "pct", tone: r.dropShare > 0.01 ? "alert" : "ok" },
        { label: "Seconds over capacity", value: r.overS, fmt: "int", tone: r.overS > 30 ? "warn" : undefined },
        { label: "Instances at peak", value: r.maxInstances, fmt: "int" },
        { label: "Standing fleet, per month", value: Math.round(num(v, "minInst")) * a.usdPerInstanceHour * 730, fmt: "usd" },
      ],
      view: {
        kind: "curve",
        xLabel: "seconds",
        yLabel: "requests per second",
        xFmt: "int",
        yFmt: "int",
        series: [
          { id: "demand", label: "Demand", tone: "info", points: at(r.demand) },
          { id: "cap", label: "Capacity (instances ready)", tone: "ok", points: at(r.capacity) },
        ],
        marker: { x: r.t[r.latency.indexOf(r.peakLatency)] ?? 0, y: r.demand[r.latency.indexOf(r.peakLatency)] ?? 0, label: "worst moment", tone: r.peakLatency > 1 ? "alert" : "amber" },
      },
      notes: [r.overS > 0 ? `Demand outran capacity for ${r.overS} seconds. Autoscaling only reacts after the load arrives, then waits ${bool(v, "warm") ? a.warmBootS : a.bootS}s for boxes to boot.` : "Capacity stayed ahead of demand the whole way."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!bool(v, "warm") && out.metrics.peakLatency! > 1) ev.push("lag-hurts");
    if (out.metrics.errorRate! < 0.01 && out.metrics.peakLatency! < 0.5) ev.push("caught-up");
    return ev;
  },
  scene: (name): SceneOut => (name === "lag" ? { set: { target: 0.6, minInst: 3, warm: false }, focus: [] } : name === "headroom" ? { set: { target: 0.4, minInst: 8 }, focus: ["target", "minInst"] } : name === "warm" ? { set: { warm: true }, focus: ["warm"] } : undefined),
};

// ------------------------------------------------------------------ Viral Tuesday (boss)

export const viralLab: LabModel = {
  id: "viral-lab",
  metrics: ["p99", "errorRate", "costPerRun", "costPerMonth", "peakInstances", "dbConns"],
  observes: [],
  scenes: [],
  runLabel: "Take the traffic",
  honest: [
    "Three simplified models run together: fan-out hedging, the connection budget, and a fluid autoscaler. Interactions beyond those (cache misses, disk, third-party limits) are out of scope.",
    "Each app instance runs the same worker count and pool size, so connections grow with every box the autoscaler adds.",
  ],
  init: () => ({ target: 0.6, minInst: 3, warm: false, perWorker: 5, pooler: false, hedgeMs: 0 }),
  controls: () => [
    { kind: "slider", id: "target", label: "Autoscale target", min: 0.2, max: 0.9, step: 0.05, fmt: "pct" },
    { kind: "slider", id: "minInst", label: "Minimum instances", min: 1, max: 30, step: 1, fmt: "int" },
    { kind: "toggle", id: "warm", label: "Warm pool" },
    { kind: "slider", id: "perWorker", label: "DB pool per worker", min: 1, max: 20, step: 1, fmt: "int", hint: "Each instance runs 4 workers" },
    { kind: "toggle", id: "pooler", label: "PgBouncer", detail: "Caps the database at 24 connections" },
    { kind: "slider", id: "hedgeMs", label: "Hedge slow calls after", min: 0, max: 200, step: 5, fmt: "ms", hint: "0 = off" },
  ],
  evaluate: (v, c) => {
    const a = autoCfg({ peakRps: 1800, ...c });
    const r = autoRun(a, num(v, "target"), Math.round(num(v, "minInst")), bool(v, "warm"));
    const pool = poolCfg({ dbCores: 8, queryMs: 6, rps: a.peakRps, poolerSize: 24 });
    const peakInst = r.maxInstances;
    const pe = poolEval(pool, peakInst * 4, Math.round(num(v, "perWorker")), bool(v, "pooler"));
    const fan = fanoutEval({ median: 0.02, p99: 0.12, calls: 12, minCalls: 1, maxCalls: 200 }, 12, num(v, "hedgeMs") / 1000);
    const p99 = r.p99 + fan.p99 + (pe.util >= 1 ? 1 : 0);
    const errorRate = clamp(1 - (1 - r.dropShare) * (1 - pe.errorRate), 0, 1);
    const extra = fan.extraLoad;
    const cost = r.costUsd * (1 + extra * 0.1) + (bool(v, "pooler") ? 0.02 : 0);
    const ts = r.t.filter((_, i) => i % 6 === 0);
    return {
      metrics: { p99, errorRate, costPerRun: cost, costPerMonth: Math.round(num(v, "minInst")) * a.usdPerInstanceHour * 730 + (bool(v, "pooler") ? 15 : 0), peakInstances: peakInst, dbConns: pe.clientConns },
      readouts: [
        { label: "Page p99", value: p99, fmt: "s", tone: p99 > 1 ? "alert" : p99 > 0.5 ? "warn" : "ok" },
        { label: "Errors", value: errorRate, fmt: "pct", tone: errorRate > 0.01 ? "alert" : "ok" },
        { label: "Instances at peak", value: peakInst, fmt: "int" },
        { label: "Connections wanted", value: pe.clientConns, fmt: "int", tone: !bool(v, "pooler") && pe.clientConns > 97 ? "alert" : undefined, sub: "limit 97" },
        { label: "Cost of the 12 minutes", value: cost, fmt: "usd" },
      ],
      view: {
        kind: "curve",
        xLabel: "seconds",
        yLabel: "requests per second",
        xFmt: "int",
        yFmt: "int",
        series: [
          { id: "demand", label: "Demand", tone: "info", points: ts.map((t) => [t, r.demand[t]!] as [number, number]) },
          { id: "cap", label: "Capacity", tone: "ok", points: ts.map((t) => [t, r.capacity[t]!] as [number, number]) },
        ],
      },
      notes: [pe.refused > 0 ? `At ${peakInst} instances the app wants ${pe.clientConns} database connections: ${(pe.refused * 100).toFixed(0)}% are refused.` : "The connection budget holds at peak."],
    };
  },
};

export const A2_MODELS: LabModel[] = [fanoutLab, poolLab, autoscaleLab, viralLab];
void mmcMean;
void str;
export type { Values };
