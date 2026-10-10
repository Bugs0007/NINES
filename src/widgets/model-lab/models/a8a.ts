/**
 * Chapter A8 "When things break", part 1: timeouts, retries, idempotency, circuit breakers, bulkheads.
 * Timeouts, retries and breakers are small seeded simulations; idempotency and bulkheads are closed forms
 * (an Erlang B loss system for the pools). Constants are labelled in each model's `honest` text.
 */
import { Rng } from "../../../engine/rng";
import { lognormal } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ timeouts

const toMemo = new Map<string, { success: number; wasted: number; p99: number; dbMs: number }>();

export function timeoutRun(clientT: number, dbT: number, propagate: boolean) {
  const key = `${Math.round(clientT)}:${Math.round(dbT)}:${propagate}`;
  const hit = toMemo.get(key);
  if (hit) return hit;
  const N = 20000;
  const api = lognormal(20, 60);
  const db = lognormal(40, 1500);
  const r = new Rng("timeouts");
  let ok = 0;
  let waste = 0;
  let work = 0;
  const seen: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = api.quantile(r.nextOpen());
    const d = db.quantile(r.nextOpen());
    const tDb = propagate ? Math.max(0, clientT - a - 10) : dbT;
    const dbSpent = Math.min(d, tDb);
    const finishes = d <= tDb && a + d <= clientT;
    if (finishes) ok++;
    work += dbSpent;
    waste += Math.max(0, a + dbSpent - clientT);
    seen.push(Math.min(a + dbSpent, clientT));
  }
  seen.sort((x, y) => x - y);
  const res = { success: ok / N, wasted: work > 0 ? waste / work : 0, p99: seen[Math.floor(N * 0.99)]!, dbMs: work / N };
  if (toMemo.size > 300) toMemo.clear();
  toMemo.set(key, res);
  return res;
}

export const timeoutLab: LabModel = {
  id: "timeout-lab",
  metrics: ["success", "wastedPct", "p99Ms", "dbMsPerReq"],
  observes: ["waste-seen", "propagated"],
  scenes: ["chain", "budget", "propagate"],
  runLabel: "Set the timeouts",
  honest: [
    "A client calls an API, which does 20 ms of its own work (p99 60 ms) and calls a database whose latency has a median of 40 ms and a p99 of 1.5 seconds. Latencies are lognormal, drawn from a seeded generator over 20,000 requests.",
    "Wasted work is database time spent after the client has already given up. A request succeeds only if the database answers within its own timeout and the whole call fits the client's deadline.",
    "Deadline propagation passes the remaining time down, so the API tells the database to stop at the client's deadline minus the API's own work and a 10 ms margin.",
  ],
  init: (c) => ({ clientT: (c as { clientT?: number }).clientT ?? 800, dbT: 5000, propagate: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockClient?: boolean }).lockClient) out.push({ kind: "slider", id: "clientT", label: "Client timeout", min: 100, max: 10000, log: true, fmt: "ms" });
    out.push({ kind: "slider", id: "dbT", label: "API's timeout on the database", min: 50, max: 10000, log: true, fmt: "ms" }, { kind: "toggle", id: "propagate", label: "Propagate the deadline", detail: "The database call gets whatever time the client has left" });
    return out;
  },
  evaluate: (v) => {
    const r = timeoutRun(num(v, "clientT"), num(v, "dbT"), bool(v, "propagate"));
    const wTone: Tone = r.wasted > 0.2 ? "alert" : r.wasted > 0.02 ? "warn" : "ok";
    return {
      metrics: { success: r.success, wastedPct: r.wasted, p99Ms: r.p99, dbMsPerReq: r.dbMs },
      readouts: [
        { label: "Requests answered in time", value: r.success, fmt: "pct", tone: r.success > 0.96 ? "ok" : "warn" },
        { label: "Database work nobody waited for", value: r.wasted, fmt: "pct", tone: wTone },
        { label: "p99 the client sees", value: r.p99, fmt: "ms" },
        { label: "Database time per request", value: r.dbMs, fmt: "ms" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Answered in time", value: r.success, tone: "ok" }, { label: "Wasted database work", value: r.wasted, tone: wTone }] },
      notes: [r.wasted > 0.05 ? "The client gave up, but the database kept working on answers nobody will read." : "The database stops when the client does."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.wastedPct! > 0.2) ev.push("waste-seen");
    if (bool(v, "propagate")) ev.push("propagated");
    return ev;
  },
  scene: (n): SceneOut => (n === "chain" ? { set: { dbT: 5000, propagate: false }, focus: ["dbT"] } : n === "budget" ? { set: { dbT: 600, propagate: false }, focus: ["dbT"] } : n === "propagate" ? { set: { propagate: true }, focus: ["propagate"] } : undefined),
};

// ------------------------------------------------------------------ retries

export const BASE_RPS = 900;
export const CAP_RPS = 1000;

export function retryRun(retries: number, backoff: string, budget: boolean) {
  const T = 180;
  const arr: number[][] = Array.from({ length: retries + 1 }, () => new Array<number>(T + 400).fill(0));
  const offeredSeries: number[] = [];
  const servedFrac: number[] = [];
  let ok = 0;
  let freshTotal = 0;
  for (let t = 0; t < T; t++) {
    arr[0]![t]! += BASE_RPS;
    freshTotal += BASE_RPS;
    let offered = 0;
    for (let k = 0; k <= retries; k++) offered += arr[k]![t]!;
    const down = t >= 20 && t < 30;
    const frac = down ? 0 : offered <= CAP_RPS ? 1 : CAP_RPS / offered;
    offeredSeries.push(offered);
    servedFrac.push(frac);
    let sched = 0;
    const pend: { k: number; n: number }[] = [];
    for (let k = 0; k <= retries; k++) {
      const a = arr[k]![t]!;
      const failed = a * (1 - (down ? 0 : frac * 0.97));
      if (k < retries && failed > 0) {
        pend.push({ k, n: failed });
        sched += failed;
      }
      ok += a * frac * (down ? 0 : 0.97);
    }
    const cap = budget ? 0.1 * BASE_RPS : Infinity;
    const scale = sched > cap ? cap / sched : 1;
    for (const { k, n } of pend) {
      const m = n * scale;
      const b = Math.pow(2, k);
      if (backoff === "none") arr[k + 1]![t + 1]! += m;
      else if (backoff === "exp") arr[k + 1]![t + Math.round(b)]! += m;
      else {
        const span = Math.round(2 * b);
        for (let j = 1; j <= span; j++) arr[k + 1]![t + j]! += m / span;
      }
    }
  }
  let recovery = 0;
  for (let t = T - 1; t >= 30; t--) {
    if (servedFrac[t]! < 0.999) {
      recovery = t - 29;
      break;
    }
  }
  const peak = Math.max(...offeredSeries) / BASE_RPS;
  return { offeredSeries, servedFrac, peak, recovery: Math.min(recovery, 150), errorRate: Math.max(0, 1 - ok / freshTotal) };
}

export const retryLab: LabModel = {
  id: "retry-lab",
  metrics: ["peakX", "recoveryS", "errorRate"],
  observes: ["storm", "calmed"],
  scenes: ["immediate", "backoff", "budget"],
  runLabel: "Replay the outage",
  honest: [
    "A service takes 900 requests a second at steady state and can serve 1,000. A dependency is down for 10 seconds (seconds 20 to 30), and every request in that window fails. Failed requests are retried according to the policy; requests over capacity fail too, and 3% of attempts fail at random even when all is well.",
    "'No backoff' retries one second after a failure. 'Exponential' waits 1, 2, 4 seconds and so on, all clients in step. 'Jitter' spreads each retry across twice that window. A retry budget caps retries at 10% of the fresh request rate.",
    "'Recovery' is the time after the outage until every request is served again. 'Never succeeded' is the share of requests that failed on every attempt. The model is deterministic and fluid, so it shows the shape, not exact counts.",
  ],
  init: () => ({ retries: 3, backoff: "none", budget: false }),
  controls: () => [
    { kind: "slider", id: "retries", label: "Retries per request", min: 0, max: 6, step: 1, fmt: "int" },
    { kind: "choice", id: "backoff", label: "Backoff", options: [{ id: "none", label: "None: retry after 1 second" }, { id: "exp", label: "Exponential: 1, 2, 4 seconds" }, { id: "jitter", label: "Exponential with jitter" }] },
    { kind: "toggle", id: "budget", label: "Retry budget", detail: "Retries capped at 10% of the fresh request rate" },
  ],
  evaluate: (v) => {
    const r = retryRun(Math.round(num(v, "retries")), str(v, "backoff"), bool(v, "budget"));
    const pts: [number, number][] = r.offeredSeries.slice(0, 100).map((x, i) => [i, x]);
    return {
      metrics: { peakX: r.peak, recoveryS: r.recovery, errorRate: r.errorRate },
      readouts: [
        { label: "Peak load vs normal", value: r.peak, fmt: "x", tone: r.peak > 2 ? "alert" : r.peak > 1.3 ? "warn" : "ok" },
        { label: "Seconds to recover after the outage", value: r.recovery, fmt: "int", tone: r.recovery > 20 ? "alert" : r.recovery > 5 ? "warn" : "ok" },
        { label: "Requests that never succeeded", value: r.errorRate, fmt: "pct" },
      ],
      view: { kind: "curve", xLabel: "seconds", yLabel: "requests per second", series: [{ id: "load", label: "Load on the service", tone: "amber", points: pts }], hLines: [{ y: CAP_RPS, label: "capacity", tone: "alert" }], vLines: [{ x: 20, label: "outage starts" }, { x: 30, label: "outage ends" }], yMax: Math.max(1500, Math.min(8000, Math.max(...r.offeredSeries) * 1.1)) },
      notes: [r.recovery > 20 ? "The dependency is back, but the retries keep the service overloaded." : "The retries drain soon after the dependency returns."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.peakX! > 2.5) ev.push("storm");
    if (out.metrics.peakX! < 1.5 && num(v, "retries") > 0) ev.push("calmed");
    return ev;
  },
  scene: (n): SceneOut => (n === "immediate" ? { set: { retries: 5, backoff: "none", budget: false }, focus: ["backoff"] } : n === "backoff" ? { set: { retries: 5, backoff: "jitter", budget: false }, focus: ["backoff"] } : n === "budget" ? { set: { retries: 5, budget: true }, focus: ["budget"] } : undefined),
};

// ------------------------------------------------------------------ idempotency

const ttl_ = (v: Record<string, number | string | boolean>) => Number(v.ttl);

export const idemLab: LabModel = {
  id: "idem-lab",
  metrics: ["dupPerDay", "storageGB", "retriedPerDay"],
  observes: ["dupes-seen", "expired"],
  scenes: ["retry", "key", "ttl"],
  runLabel: "Set the duplicate guard",
  honest: [
    "2 million charges a day. In 0.3% of them the server finishes the charge but the response is lost, so the client times out and retries: 6,000 retries a day. Retry delays are exponential with a mean of 6 hours, as for mobile apps that queue and resume.",
    "With no key, or a new key per attempt, every retry is a second charge. A key shared by all attempts is deduplicated while it is stored; a retry that arrives after the key expired is charged again. 2% of retries arrive while the first attempt is still running, and a check-then-insert that is not atomic lets those slip through.",
    "Each stored key takes about 120 bytes. These are round figures for a payments API, not measurements.",
  ],
  init: () => ({ mode: "none", ttl: 1, atomic: false }),
  controls: () => [
    { kind: "choice", id: "mode", label: "Idempotency key", options: [{ id: "none", label: "None" }, { id: "attempt", label: "A new key for each attempt" }, { id: "request", label: "One key per request, reused by retries" }] },
    { kind: "slider", id: "ttl", label: "Keep keys for", min: 0.5, max: 720, log: true, fmt: "num", hint: "hours" },
    { kind: "toggle", id: "atomic", label: "Reserve the key atomically", detail: "A unique constraint, not check-then-insert" },
  ],
  evaluate: (v) => {
    const retried = 6000;
    const m = str(v, "mode");
    const ttl = num(v, "ttl");
    const late = Math.exp(-ttl / 6);
    const race = bool(v, "atomic") ? 0 : 0.02;
    const dup = m === "request" ? retried * (late + race * (1 - late)) : retried;
    const gb = m === "request" ? (2e6 * 120 * (ttl / 24)) / 1e9 : 0;
    return {
      metrics: { dupPerDay: dup, storageGB: gb, retriedPerDay: retried },
      readouts: [
        { label: "Double charges a day", value: dup, fmt: "int", tone: dup > 100 ? "alert" : dup > 5 ? "warn" : "ok" },
        { label: "Storage for keys", value: gb, fmt: "num", sub: "GB", tone: gb > 2 ? "warn" : "ok" },
        { label: "Retries a day", value: retried, fmt: "int" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Retries arriving a day", value: retried, tone: "muted" }, { label: "Charged twice", value: dup, tone: dup > 5 ? "alert" : "ok" }] },
      notes: [m === "attempt" ? "A fresh key each time makes every retry look like a new payment." : m === "none" ? "Nothing tells the server this is a retry." : late > 0.001 ? "Some retries arrive after the key has expired." : race ? "Concurrent retries can slip past a check-then-insert." : "Retries find their key and get the saved result."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.dupPerDay! > 1000) ev.push("dupes-seen");
    if (str(v, "mode") === "request" && ttl_(v) < 6) ev.push("expired");
    return ev;
  },
  scene: (n): SceneOut => (n === "retry" ? { set: { mode: "none" }, focus: ["mode"] } : n === "key" ? { set: { mode: "request", ttl: 24, atomic: true }, focus: ["mode"] } : n === "ttl" ? { set: { mode: "request", ttl: 2, atomic: true }, focus: ["ttl"] } : undefined),
};

// ------------------------------------------------------------------ circuit breakers

export function breakerRun(thr: number, window: number, openS: number, probes: number, out1 = 77) {
  const T = 140;
  const CALLS = 100;
  const OUT0 = 20;
  const OUT1 = out1;
  const rng = new Rng("breaker");
  let state: "closed" | "open" | "half" = "closed";
  let openUntil = 0;
  const hist: number[] = [];
  const toDep: number[] = [];
  let callsToDead = 0;
  let falseTrips = 0;
  let recoveryAt = -1;
  let rejected = 0;
  for (let t = 0; t < T; t++) {
    const dead = t >= OUT0 && t < OUT1;
    if (state === "open" && t >= openUntil) state = "half";
    let calls = 0;
    if (state === "closed") {
      calls = CALLS;
      let errs = 0;
      for (let i = 0; i < calls; i++) if (dead || rng.next() < 0.08) errs++;
      hist.push(errs / calls);
      if (hist.length > window) hist.shift();
      const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
      if (hist.length >= Math.min(window, 2) && avg >= thr) {
        state = "open";
        openUntil = t + 1 + openS;
        hist.length = 0;
        if (!dead) falseTrips++;
      }
    } else if (state === "half") {
      calls = Math.round(probes);
      let bad = 0;
      for (let i = 0; i < calls; i++) if (dead || rng.next() < 0.08) bad++;
      if (bad === 0) {
        state = "closed";
        if (t >= OUT1 && recoveryAt < 0) recoveryAt = t;
      } else {
        state = "open";
        openUntil = t + 1 + openS;
      }
      rejected += CALLS - calls;
    } else rejected += CALLS;
    if (dead) callsToDead += calls;
    toDep.push(calls);
  }
  return { toDep, callsToDead, falseTrips, recoveryLag: recoveryAt < 0 ? T - OUT1 : recoveryAt - OUT1, rejected };
}

export const breakerLab: LabModel = {
  id: "breaker-lab",
  metrics: ["callsToDead", "falseTrips", "recoveryLagS"],
  observes: ["tripped", "flapped"],
  scenes: ["open", "half", "noise"],
  runLabel: "Replay the outage",
  honest: [
    "100 calls a second to a dependency that fails completely from second 20 to second 77, with an 8% background error rate otherwise (a flaky but working dependency). Errors come from a seeded generator, so the same settings always give the same run.",
    "The breaker looks at the error rate over a sliding window of seconds. At the threshold it opens and rejects every call for the open time; then it lets a few probe calls through and closes only if all of them succeed.",
    "'Calls into the dead dependency' counts everything that reached it during the outage, probes included. A 'false trip' is an opening while the dependency is healthy. 'Seconds to resume' averages eight different moments of healing, because the wait depends on where the outage ends in the open and probe cycle.",
  ],
  init: () => ({ thr: 0.5, window: 5, openS: 10, probes: 5 }),
  controls: () => [
    { kind: "slider", id: "thr", label: "Open when the error rate reaches", min: 0.03, max: 1, fmt: "pct" },
    { kind: "slider", id: "window", label: "Window", min: 1, max: 30, step: 1, fmt: "int", hint: "seconds" },
    { kind: "slider", id: "openS", label: "Stay open for", min: 1, max: 60, step: 1, fmt: "int", hint: "seconds" },
    { kind: "slider", id: "probes", label: "Probe calls when half-open", min: 1, max: 20, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const args = [num(v, "thr"), Math.round(num(v, "window")), Math.round(num(v, "openS")), num(v, "probes")] as const;
    const r = breakerRun(...args);
    // The wait after healing depends on where the outage ends in the open/probe cycle, so average over eight end times.
    const lag = [70, 72, 74, 76, 78, 80, 82, 84].reduce((a, e) => a + breakerRun(...args, e).recoveryLag, 0) / 8;
    return {
      metrics: { callsToDead: r.callsToDead, falseTrips: r.falseTrips, recoveryLagS: lag },
      readouts: [
        { label: "Calls into the dead dependency", value: r.callsToDead, fmt: "int", sub: "6,000 with no breaker", tone: r.callsToDead > 1500 ? "alert" : r.callsToDead > 600 ? "warn" : "ok" },
        { label: "Trips while it was healthy", value: r.falseTrips, fmt: "int", tone: r.falseTrips > 0 ? "alert" : "ok" },
        { label: "Seconds to resume after it healed (average)", value: lag, fmt: "num", tone: lag > 15 ? "warn" : "ok" },
      ],
      view: { kind: "curve", xLabel: "seconds", yLabel: "calls reaching the dependency per second", series: [{ id: "calls", label: "Calls reaching it", tone: "amber", points: r.toDep.map((x, i) => [i, x] as [number, number]) }], vLines: [{ x: 20, label: "it fails" }, { x: 77, label: "it heals" }], yMax: 110 },
      notes: [r.falseTrips > 0 ? "The breaker opened on ordinary noise." : r.callsToDead > 1500 ? "It took too long to notice, or kept probing too hard." : "Quick to open, quick to close."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.callsToDead! < 1000) ev.push("tripped");
    if (out.metrics.falseTrips! > 0) ev.push("flapped");
    return ev;
  },
  scene: (n): SceneOut => (n === "open" ? { set: { thr: 0.5, window: 5, openS: 10, probes: 5 }, focus: ["thr"] } : n === "half" ? { set: { probes: 3, openS: 10 }, focus: ["probes", "openS"] } : n === "noise" ? { set: { thr: 0.03, window: 1 }, focus: ["thr", "window"] } : undefined),
};

// ------------------------------------------------------------------ bulkheads

/** Erlang B blocking probability for offered load e on m servers. */
export function erlangB(m: number, e: number): number {
  let b = 1;
  for (let i = 1; i <= m; i++) b = (e * b) / (i + e * b);
  return b;
}

export const bulkheadLab: LabModel = {
  id: "bulkhead-lab",
  metrics: ["aBlock", "bBlock", "poolA"],
  observes: ["collapse", "isolated"],
  scenes: ["shared", "split", "size"],
  runLabel: "Set the pools",
  honest: [
    "A service has 100 worker slots. Dependency A takes 280 calls a second at 20 ms each (5.6 slots busy on average). Dependency B takes 120 calls a second and, while degraded, 2 seconds each (240 slots' worth of demand).",
    "A call that finds no free slot is rejected. Blocking is the Erlang B loss formula, exact for random arrivals and any service times. In a shared pool every call faces the same blocking; with bulkheads each dependency has its own slots.",
    "When B is healthy (20 ms) its demand is only 2.4 slots; the lab models the degraded case, which is the one that matters.",
  ],
  init: () => ({ layout: "shared", aShare: 0.5, degraded: true }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "layout", label: "Worker pools", options: [{ id: "shared", label: "One shared pool of 100" }, { id: "isolated", label: "Separate pools per dependency" }] }, { kind: "slider", id: "aShare", label: "Share of slots reserved for A", min: 0.02, max: 0.95, fmt: "pct" }];
    if (!(c as { lockDegraded?: boolean }).lockDegraded) out.push({ kind: "toggle", id: "degraded", label: "Dependency B is degraded", detail: "Each call to B takes 2 seconds" });
    return out;
  },
  evaluate: (v) => {
    const eA = 5.6;
    const eB = bool(v, "degraded") ? 240 : 2.4;
    const shared = str(v, "layout") === "shared";
    const poolA = Math.max(1, Math.round(100 * num(v, "aShare")));
    const poolB = 100 - poolA;
    const aBlock = shared ? erlangB(100, eA + eB) : erlangB(poolA, eA);
    const bBlock = shared ? aBlock : erlangB(poolB, eB);
    return {
      metrics: { aBlock, bBlock, poolA: shared ? 100 : poolA },
      readouts: [
        { label: "Calls to A rejected", value: aBlock, fmt: "pct", tone: aBlock > 0.01 ? "alert" : aBlock > 0.001 ? "warn" : "ok" },
        { label: "Calls to B rejected", value: bBlock, fmt: "pct", tone: bBlock > 0.7 ? "alert" : "warn" },
        { label: shared ? "Slots shared" : "Slots for A / B", value: shared ? "100" : `${poolA} / ${poolB}` },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Calls to A rejected", value: aBlock, tone: aBlock > 0.001 ? "alert" : "ok" }, { label: "Calls to B rejected", value: bBlock, tone: "warn" }] },
      notes: [shared && eB > 100 ? "B's slow calls hold every slot, so the healthy dependency A is starved with it." : !shared && aBlock < 0.001 ? "A's slots are reserved, so B's trouble stays in B's pool." : !shared ? "A's reservation is too small to carry its own load." : "Both dependencies share the pool happily while B is healthy."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "layout") === "shared" && out.metrics.aBlock! > 0.3) ev.push("collapse");
    if (str(v, "layout") === "isolated" && out.metrics.aBlock! < 0.001) ev.push("isolated");
    return ev;
  },
  scene: (n): SceneOut => (n === "shared" ? { set: { layout: "shared", degraded: true }, focus: ["layout"] } : n === "split" ? { set: { layout: "isolated", aShare: 0.5 }, focus: ["layout"] } : n === "size" ? { set: { layout: "isolated", aShare: 0.2 }, focus: ["aShare"] } : undefined),
};

export const A8A_MODELS: LabModel[] = [timeoutLab, retryLab, idemLab, breakerLab, bulkheadLab];
