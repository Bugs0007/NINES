/**
 * Chapter A4 "Read Heavy" models: cache-aside, Zipf sizing, eviction, write policies, TTLs, stampedes, hot keys,
 * edge cache keys, and the celebrity-post boss. Cache hit ratios come from simulated Zipf traffic (seeded and
 * deterministic) or from the closed form where noted.
 */
import { Zipf } from "@/engine/dist";
import { Rng } from "@/engine/rng";
import { bool, num, str, sweep, type Control, type LabModel } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ Zipf helpers

const zipfCache = new Map<string, Zipf>();
export function zipf(n: number, s: number): Zipf {
  const k = `${n}:${s.toFixed(3)}`;
  let z = zipfCache.get(k);
  if (!z) {
    z = new Zipf(n, s);
    if (zipfCache.size > 24) zipfCache.clear();
    zipfCache.set(k, z);
  }
  return z;
}

const harmonicCache = new Map<string, Float64Array>();
/** Cumulative sums of 1 / k^s for k = 1..n (index k = sum through rank k). */
function harmonic(n: number, s: number): Float64Array {
  const k = `${n}:${s.toFixed(3)}`;
  let h = harmonicCache.get(k);
  if (!h) {
    h = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) h[i] = h[i - 1]! + 1 / Math.pow(i, s);
    if (harmonicCache.size > 24) harmonicCache.clear();
    harmonicCache.set(k, h);
  }
  return h;
}

/** Share of Zipf(n, s) traffic that goes to the `c` most popular keys: the hit ratio of an ideal static cache. */
export function topShare(c: number, n: number, s: number): number {
  const h = harmonic(n, s);
  return h[Math.min(n, Math.max(0, Math.floor(c)))]! / h[n]!;
}

export type Policy = "lru" | "lfu" | "fifo" | "random";

const simMemo = new Map<string, number>();
/** `simCache`, remembered by its arguments so dragging a slider back and forth is instant. */
export function simCacheMemo(policy: Policy, cap: number, n: number, s: number, scanShare = 0, reqs = 30000, seed = "cache"): number {
  const k = `${policy}|${Math.floor(cap)}|${n}|${s.toFixed(3)}|${scanShare}|${reqs}|${seed}`;
  let r = simMemo.get(k);
  if (r === undefined) {
    r = simCache(policy, cap, n, s, scanShare, reqs, seed);
    if (simMemo.size > 4000) simMemo.clear();
    simMemo.set(k, r);
  }
  return r;
}

/** Simulate a cache of `cap` entries under Zipf(n, s) reads, with a share of one-off scan keys mixed in. */
export function simCache(policy: Policy, cap: number, n: number, s: number, scanShare = 0, reqs = 30000, seed = "cache"): number {
  cap = Math.max(1, Math.floor(cap));
  const z = zipf(n, s);
  const rng = new Rng(`${seed}:${policy}:${cap}:${n}:${s}:${scanShare}`);
  const warm = Math.min(reqs, cap * 3);
  let hits = 0;
  let total = 0;
  let scanId = n + 1;
  const map = new Map<number, number>(); // key -> frequency (lfu) or 0
  const arr: number[] = [];
  const idx = new Map<number, number>();
  const removeAt = (i: number) => {
    const k = arr[i]!;
    const last = arr.pop()!;
    if (i < arr.length) {
      arr[i] = last;
      idx.set(last, i);
    }
    idx.delete(k);
    map.delete(k);
  };
  for (let t = 0; t < reqs + warm; t++) {
    const key = scanShare > 0 && rng.next() < scanShare ? scanId++ : z.sample(rng);
    const present = map.has(key);
    if (t >= warm) {
      total++;
      if (present) hits++;
    }
    if (present) {
      if (policy === "lru") {
        const f = map.get(key)!;
        map.delete(key);
        map.set(key, f);
      } else if (policy === "lfu") map.set(key, map.get(key)! + 1);
      continue;
    }
    if (map.size >= cap) {
      if (policy === "lru" || policy === "fifo") {
        map.delete(map.keys().next().value as number);
      } else if (policy === "random") {
        removeAt(rng.int(arr.length));
      } else {
        // Approximate LFU, as Redis does: sample a few entries and evict the least frequently used.
        let best = -1;
        let bestF = Infinity;
        for (let i = 0; i < 8; i++) {
          const j = rng.int(arr.length);
          const f = map.get(arr[j]!)!;
          if (f < bestF) {
            bestF = f;
            best = j;
          }
        }
        removeAt(best);
      }
    }
    map.set(key, 1);
    if (policy === "random" || policy === "lfu") {
      idx.set(key, arr.length);
      arr.push(key);
    }
  }
  return total ? hits / total : 0;
}

// ------------------------------------------------------------------ cache-aside

export const cacheLab: LabModel = {
  id: "cache-lab",
  metrics: ["hitRatio", "avgMs", "dbRps", "dbUtil", "cacheEntries"],
  observes: ["filled", "db-relieved"],
  scenes: ["flow", "size"],
  runLabel: "Deploy the cache",
  honest: [
    "Traffic is Zipf-distributed over 20,000 keys (exponent 0.99) and the cache evicts the least recently used entry. Real key popularity drifts through the day.",
    "A cache hit costs 1 ms and a database read 12 ms in this lab. The cache is always up and has no network cost beyond that.",
    "The database can sustain 800 reads a second before it queues. Past that, latency and errors climb quickly.",
  ],
  init: () => ({ view: "size", entries: 200, rps: 2000, skew: 0.99, write: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockView?: string }).lockView) out.push({ kind: "choice", id: "view", label: "Show", options: [{ id: "flow", label: "Follow a request" }, { id: "size", label: "Hit ratio and database load" }] });
    out.push({ kind: "slider", id: "entries", label: "Cache size (entries)", min: 10, max: 10000, log: true, fmt: "int" });
    out.push({ kind: "slider", id: "rps", label: "Reads per second", min: 200, max: 5000, step: 100, fmt: "int" });
    out.push({ kind: "slider", id: "skew", label: "Traffic skew (Zipf exponent)", min: 0.5, max: 1.3, step: 0.05, fmt: "num", hint: "Higher means a few keys take most of the traffic" });
    return out;
  },
  evaluate: (v) => {
    const N = 20000;
    const e = num(v, "entries");
    const s = num(v, "skew");
    const rps = num(v, "rps");
    const hit = simCacheMemo("lru", e, N, s, 0, 12000, "cache-lab");
    const dbRps = rps * (1 - hit);
    const util = dbRps / 800;
    const avg = hit * 1 + (1 - hit) * 13;
    const xs = sweep(10, 10000, 10, true).map((x) => Math.round(x));
    const curve = xs.map((x) => [x, simCacheMemo("lru", x, N, s, 0, 5000, "cache-lab")] as [number, number]);
    return {
      metrics: { hitRatio: hit, avgMs: avg, dbRps, dbUtil: util, cacheEntries: e },
      readouts: [
        { label: "Hit ratio", value: hit, fmt: "pct", tone: hit > 0.9 ? "ok" : hit > 0.6 ? "warn" : "alert" },
        { label: "Reads reaching the database", value: dbRps, fmt: "int", sub: "per second" },
        { label: "Database busy", value: util, fmt: "pct", tone: util > 0.9 ? "alert" : util > 0.7 ? "warn" : "ok" },
        { label: "Average read", value: avg, fmt: "ms" },
      ],
      view:
        str(v, "view") === "flow"
          ? {
              kind: "steps",
              steps: [
                { label: "App asks the cache for the key", detail: "GET user:42", value: "1ms", tone: "info" },
                { label: `Hit (${(hit * 100).toFixed(0)}% of reads): return the cached value`, detail: "Done. The database is never touched.", value: "1ms", tone: "ok" },
                { label: `Miss (${((1 - hit) * 100).toFixed(0)}%): read the row from the database`, detail: "SELECT … WHERE id = 42", value: "12ms", tone: "warn" },
                { label: "App writes the value into the cache, with a TTL", detail: "SET user:42 … EX 300", value: "1ms", tone: "info" },
                { label: "On a write: update the database, then delete the cached key", detail: "The next read refills it", tone: "muted" },
              ],
            }
          : { kind: "curve", xLabel: "cache entries", yLabel: "hit ratio", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "hit", label: "LRU hit ratio", tone: "ok", points: curve }], marker: { x: e, y: hit, label: `${(hit * 100).toFixed(0)}%`, tone: "amber" }, hLines: [{ y: 0.9, label: "90%", tone: "info" }] },
      notes: [util >= 1 ? "The database is past its limit: reads queue and time out." : `A ${Math.round(e).toLocaleString("en-US")}-entry cache holds ${((e / N) * 100).toFixed(1)}% of the keys and answers ${(hit * 100).toFixed(0)}% of reads.`],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (num(v, "entries") >= 100) ev.push("filled");
    if (out.metrics.dbUtil! < 0.5 && num(v, "rps") >= 2000) ev.push("db-relieved");
    return ev;
  },
  scene: (n): SceneOut => (n === "flow" ? { set: { view: "flow" }, focus: [] } : n === "size" ? { set: { view: "size", entries: 1000 }, focus: ["entries"] } : undefined),
};

// ------------------------------------------------------------------ Zipf sizing

export const sizeLab: LabModel = {
  id: "size-lab",
  metrics: ["hitRatio", "memGiB", "costPerMonth", "dbRps", "entries"],
  observes: ["knee", "skew-moved"],
  scenes: ["skew", "knee"],
  runLabel: "Buy the cache",
  honest: [
    "Hit ratio is the share of Zipf traffic that falls on the most popular keys, the best any static cache could do. A real LRU gets slightly less.",
    "ElastiCache prices are approximate monthly on-demand figures for us-east-1 and change over time. Memory per node is its usable memory.",
    "Memory per entry includes a 1.5x overhead factor for keys and pointers.",
  ],
  init: (c) => ({ entries: 10000, skew: (c as { skew?: number }).skew ?? 0.99, entryKb: (c as { entryKb?: number }).entryKb ?? 50 }),
  controls: (c) => {
    const lock = (c as { lockSkew?: boolean }).lockSkew;
    const out: Control[] = [{ kind: "slider", id: "entries", label: "Entries cached", min: 100, max: 5000000, log: true, fmt: "int" }];
    if (!lock) out.push({ kind: "slider", id: "skew", label: "Traffic skew (Zipf exponent)", min: 0.6, max: 1.3, step: 0.05, fmt: "num" });
    return out;
  },
  evaluate: (v, c) => {
    const N = Number((c as { keys?: number }).keys ?? 1000000);
    const rps = Number((c as { rps?: number }).rps ?? 20000);
    const e = Math.min(N, num(v, "entries"));
    const s = num(v, "skew");
    const hit = topShare(e, Math.min(N, 1000000), s);
    const gib = (e * num(v, "entryKb") * 1.5) / (1024 * 1024);
    // Priced by the smallest set of 13 GiB nodes (roughly cache.r6g.large) that holds it, $0.206 per hour each.
    const nodes = Math.max(1, Math.ceil(gib / 12));
    const cost = nodes * 0.206 * 730;
    const dbRps = rps * (1 - hit);
    const xs = sweep(100, N, 36, true);
    return {
      metrics: { hitRatio: hit, memGiB: gib, costPerMonth: cost, dbRps, entries: e },
      readouts: [
        { label: "Hit ratio", value: hit, fmt: "pct", tone: hit > 0.9 ? "ok" : hit > 0.7 ? "warn" : "alert" },
        { label: "Cache memory", value: gib, fmt: "num", sub: "GiB with overhead" },
        { label: "Cache cost", value: cost, fmt: "usd", sub: `${nodes} node${nodes > 1 ? "s" : ""} per month` },
        { label: "Database reads", value: dbRps, fmt: "int", sub: "per second" },
      ],
      view: { kind: "curve", xLabel: "entries cached", yLabel: "hit ratio", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "hit", label: "Hit ratio", tone: "ok", points: xs.map((x) => [x, topShare(x, Math.min(N, 1000000), s)] as [number, number]) }], marker: { x: e, y: hit, label: `${(hit * 100).toFixed(0)}%`, tone: "amber" }, hLines: [{ y: 0.9, label: "90%", tone: "info" }] },
      notes: [`The first ${Math.round(e / 100) / 10}k entries buy ${(hit * 100).toFixed(0)}%. Each tenfold increase buys less than the one before.`],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "entries") >= 8000 && num(v, "entries") <= 150000) ev.push("knee");
    if (Math.abs(num(v, "skew") - 0.99) > 0.04) ev.push("skew-moved");
    return ev;
  },
  scene: (n): SceneOut => (n === "skew" ? { set: { skew: 0.7 }, focus: ["skew"] } : n === "knee" ? { set: { entries: 10000, skew: 0.99 }, focus: ["entries"] } : undefined),
};

// ------------------------------------------------------------------ eviction

export const evictLab: LabModel = {
  id: "evict-lab",
  metrics: ["hitRatio", "lruHit", "lfuHit", "fifoHit", "randomHit", "entries"],
  observes: ["scan-hurts", "lfu-wins"],
  scenes: ["scan", "lfu"],
  runLabel: "Set the policy",
  honest: [
    "Traffic is Zipf over 20,000 keys; the scan is a stream of keys that are read once and never again. Real workloads mix patterns in more ways.",
    "LFU here samples 8 entries and evicts the least frequently used, as Redis does. It keeps no history of evicted keys and does not decay counts.",
    "Results come from a seeded simulation of 30,000 reads, so they are exact for this setup but have a little noise.",
  ],
  init: (c) => ({ policy: "lru", entries: (c as { entries?: number }).entries ?? 400, scan: 0 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "policy", label: "Eviction policy", options: [{ id: "lru", label: "LRU", detail: "Evict the least recently used" }, { id: "lfu", label: "LFU", detail: "Evict the least frequently used" }, { id: "fifo", label: "FIFO", detail: "Evict the oldest inserted" }, { id: "random", label: "Random", detail: "Evict any entry" }] },
      { kind: "slider", id: "entries", label: "Cache size (entries)", min: 50, max: 4000, log: true, fmt: "int" },
    ];
    if (!(c as { lockScan?: boolean }).lockScan) out.push({ kind: "slider", id: "scan", label: "Share of reads that are one-off scan keys", min: 0, max: 0.8, step: 0.05, fmt: "pct", hint: "A report or crawler reading everything once" });
    return out;
  },
  evaluate: (v, c) => {
    const scan = (c as { lockScan?: boolean }).lockScan ? Number((c as { scan?: number }).scan ?? 0.5) : num(v, "scan");
    const e = num(v, "entries");
    const hits = (["lru", "lfu", "fifo", "random"] as Policy[]).map((p) => ({ p, h: simCacheMemo(p, e, 20000, 0.99, scan, 20000, "evict-lab") }));
    const chosen = hits.find((x) => x.p === str(v, "policy"))!.h;
    const m = Object.fromEntries(hits.map((x) => [`${x.p}Hit`, x.h]));
    return {
      metrics: { hitRatio: chosen, entries: e, ...m } as Record<string, number>,
      readouts: [
        { label: `Hit ratio with ${str(v, "policy").toUpperCase()}`, value: chosen, fmt: "pct", tone: chosen > 0.7 ? "ok" : chosen > 0.55 ? "warn" : "alert" },
        { label: "Scan share of traffic", value: scan, fmt: "pct" },
        { label: "Best policy here", value: hits.slice().sort((a, b) => b.h - a.h)[0]!.p.toUpperCase() },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: hits.map((x) => ({ label: x.p.toUpperCase() + (x.p === str(v, "policy") ? " (selected)" : ""), value: x.h, tone: x.p === str(v, "policy") ? ("amber" as const) : ("muted" as const) })) },
      notes: [scan >= 0.3 ? "The scan fills the cache with keys nobody will read again, pushing out the popular ones." : "With steady Zipf traffic the policies are close; the popular keys stay either way."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (num(v, "scan") >= 0.3 && str(v, "policy") === "lru" && out.metrics.lruHit! < out.metrics.lfuHit!) ev.push("scan-hurts");
    if (num(v, "scan") >= 0.3 && str(v, "policy") === "lfu") ev.push("lfu-wins");
    return ev;
  },
  scene: (n): SceneOut => (n === "scan" ? { set: { policy: "lru", scan: 0.5 }, focus: ["scan"] } : n === "lfu" ? { set: { policy: "lfu", scan: 0.5 }, focus: ["policy"] } : undefined),
};

// ------------------------------------------------------------------ write policies

export const writeLab: LabModel = {
  id: "write-lab",
  metrics: ["writeMs", "dbWriteRps", "atRiskSec", "readAfterWriteHit"],
  observes: ["coalesced", "risky"],
  scenes: ["through", "back", "around"],
  runLabel: "Set the write path",
  honest: [
    "Writes land on a set of hot keys uniformly, so write-back coalescing is the closed form K(1 − e^(−W·F/K)) per flush. Real write skew coalesces better or worse.",
    "A cache or app crash loses whatever write-back has not flushed. The lab shows that window, not the cost of repairing the data.",
    "Latencies are round numbers: 1 ms for the cache, 12 ms for a database write.",
  ],
  init: () => ({ policy: "through", flush: 5, writes: 5000, hotKeys: 10000 }),
  controls: (c) => {
    const lock = (c as { lockLoad?: boolean }).lockLoad;
    const out: Control[] = [
      { kind: "choice", id: "policy", label: "Write policy", options: [{ id: "through", label: "Write-through", detail: "Write cache and database together" }, { id: "back", label: "Write-back", detail: "Write the cache now, flush to the database later" }, { id: "around", label: "Write-around", detail: "Write the database only; the cache fills on read" }] },
      { kind: "slider", id: "flush", label: "Write-back flush interval", min: 0.5, max: 60, log: true, fmt: "s" },
    ];
    if (!lock) out.push({ kind: "slider", id: "writes", label: "Writes per second", min: 100, max: 20000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v, c) => {
    const W = (c as { lockLoad?: boolean }).lockLoad ? Number((c as { writes?: number }).writes ?? 5000) : num(v, "writes");
    const K = Number((c as { hotKeys?: number }).hotKeys ?? 10000);
    const p = str(v, "policy");
    const F = num(v, "flush");
    const dbRps = p === "back" ? (K * (1 - Math.exp((-W * F) / K))) / F : W;
    const writeMs = p === "through" ? 13 : p === "back" ? 1 : 12;
    const atRisk = p === "back" ? F : 0;
    const rawh = p === "around" ? 0 : 1;
    return {
      metrics: { writeMs, dbWriteRps: dbRps, atRiskSec: atRisk, readAfterWriteHit: rawh },
      readouts: [
        { label: "Write latency", value: writeMs, fmt: "ms" },
        { label: "Writes reaching the database", value: dbRps, fmt: "int", tone: dbRps > 600 ? "alert" : dbRps > 400 ? "warn" : "ok", sub: "per second" },
        { label: "Data lost if the cache dies", value: atRisk, fmt: "s", sub: atRisk ? `${Math.round(W * atRisk).toLocaleString("en-US")} writes at risk` : "none", tone: atRisk > 10 ? "alert" : atRisk > 0 ? "warn" : "ok" },
        { label: "Next read after a write", value: rawh ? "hit" : "miss", tone: rawh ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Writes arriving", value: W, tone: "info" }, { label: "Writes the database does", value: dbRps, tone: dbRps > 600 ? "alert" : "ok" }], lines: [{ value: 600, label: "database write limit", tone: "ok" }] },
      notes: [p === "back" ? `Repeated writes to the same key coalesce: ${Math.round(W)} writes a second become ${Math.round(dbRps)} database writes.` : p === "through" ? "Every write pays the database, so the database sees all of them." : "The cache is never touched by writes, so the next read of that key misses."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "policy") === "back" && out.metrics.dbWriteRps! < num(v, "writes") * 0.5) ev.push("coalesced");
    if (str(v, "policy") === "back" && num(v, "flush") >= 20) ev.push("risky");
    return ev;
  },
  scene: (n): SceneOut => (n === "through" ? { set: { policy: "through" }, focus: ["policy"] } : n === "back" ? { set: { policy: "back", flush: 5 }, focus: ["policy", "flush"] } : n === "around" ? { set: { policy: "around" }, focus: ["policy"] } : undefined),
};

// ------------------------------------------------------------------ TTLs and invalidation

export const staleLab: LabModel = {
  id: "stale-lab",
  metrics: ["staleShare", "hitRatio", "dbRps", "avgStaleSec"],
  observes: ["stale-seen", "invalidated"],
  scenes: ["ttl", "delete", "race"],
  runLabel: "Ship the cache rules",
  honest: [
    "Each key is read r times a second and changes u times a second, both Poisson. A read is stale if the key changed since the cached copy was filled.",
    "Delete-on-write leaves only a small race window: a read can refill the cache with the old row between the database commit and the delete, which the lab sets at 100 ms.",
    "Hit ratio is the fixed-TTL approximation rT ÷ (1 + rT), with TTL capped by invalidation resets.",
  ],
  init: (c) => ({ ttl: 300, invalidate: false, readRate: (c as { readRate?: number }).readRate ?? 1, changeRate: (c as { changeRate?: number }).changeRate ?? 0.01 }),
  controls: () => [
    { kind: "slider", id: "ttl", label: "TTL", min: 1, max: 86400, log: true, fmt: "s" },
    { kind: "toggle", id: "invalidate", label: "Delete the key on every write", detail: "The next read refills it from the database" },
  ],
  evaluate: (v, c) => {
    const r = Number((c as { readRate?: number }).readRate ?? 1);
    const u = Number((c as { changeRate?: number }).changeRate ?? 0.01);
    const T = num(v, "ttl");
    const inv = bool(v, "invalidate");
    // Without invalidation the cached copy lives its full TTL. A read at age a is stale with probability 1 - e^(-u a).
    // Average over the TTL window: stale share = 1 - (1 - e^(-uT)) / (uT).
    const staleTtl = u * T < 1e-6 ? 0 : 1 - (1 - Math.exp(-u * T)) / (u * T);
    const race = 0.1;
    const staleInv = Math.min(1, u * race);
    const stale = inv ? staleInv : staleTtl;
    const effT = inv ? Math.min(T, 1 / u) : T;
    const hit = (r * effT) / (1 + r * effT);
    const dbRps = r * (1 - hit);
    const avgStale = inv ? race / 2 : u * T < 1e-6 ? 0 : T / 2;
    const xs = sweep(1, 86400, 30, true);
    return {
      metrics: { staleShare: stale, hitRatio: hit, dbRps, avgStaleSec: avgStale },
      readouts: [
        { label: "Reads that return old data", value: stale, fmt: "pct", tone: stale > 0.05 ? "alert" : stale > 0.01 ? "warn" : "ok" },
        { label: "Cache hit ratio", value: hit, fmt: "pct", tone: hit > 0.9 ? "ok" : hit > 0.7 ? "warn" : "alert" },
        { label: "Database reads for this key", value: dbRps, fmt: "num", sub: "per second" },
        { label: "Typical age of a stale read", value: avgStale, fmt: "s" },
      ],
      view: { kind: "curve", xLabel: "TTL", yLabel: "share of reads", xFmt: "s", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "hit", label: "Hit ratio", tone: "ok", points: xs.map((x) => [x, (r * x) / (1 + r * x)] as [number, number]) }, { id: "stale", label: inv ? "Stale reads (delete on write)" : "Stale reads (TTL only)", tone: "alert", points: xs.map((x) => [x, inv ? staleInv : 1 - (1 - Math.exp(-u * x)) / (u * x)] as [number, number]) }], marker: { x: T, y: stale, label: `${(stale * 100).toFixed(1)}% stale`, tone: "alert" } },
      notes: [inv ? "Deleting on write keeps the cache fresh even with a long TTL; the leftover staleness is a race, not the TTL." : "With TTL alone, a longer TTL means more hits and more stale reads: the two curves cross somewhere you have to choose."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!bool(v, "invalidate") && out.metrics.staleShare! >= 0.05) ev.push("stale-seen");
    if (bool(v, "invalidate")) ev.push("invalidated");
    return ev;
  },
  scene: (n): SceneOut => (n === "ttl" ? { set: { invalidate: false, ttl: 3600 }, focus: ["ttl"] } : n === "delete" ? { set: { invalidate: true, ttl: 3600 }, focus: ["invalidate"] } : n === "race" ? { set: { invalidate: true }, focus: ["invalidate"] } : undefined),
};

// ------------------------------------------------------------------ stampede

export interface StampedeRun {
  t: number[];
  dbLoad: number[];
  dbPeak: number;
  errorRate: number;
  slowestS: number;
}

/** Many hot keys all cached with the same TTL expire together. Each expiry makes concurrent readers hit the database. */
export function stampedeRun(opts: { keys: number; perKeyRps: number; rebuildS: number; dbCap: number; mode: string; jitter: boolean; ttl: number; seed: string }): StampedeRun {
  const { keys, perKeyRps, rebuildS, dbCap, mode, jitter, ttl } = opts;
  const rng = new Rng(opts.seed);
  const expiry = Array.from({ length: keys }, () => ttl + (jitter ? rng.next() * ttl * 0.4 : 0));
  const T = 60;
  const run: StampedeRun = { t: [], dbLoad: [], dbPeak: 0, errorRate: 0, slowestS: 0 };
  let demandTotal = 0;
  let droppedTotal = 0;
  // Per-key state: regeneration finishes at `doneAt` (Infinity when not rebuilding).
  const doneAt = new Array<number>(keys).fill(Infinity);
  const started = new Array<boolean>(keys).fill(false);
  let load = 0;
  for (let t = 0; t < T; t += 0.5) {
    let demand = 0;
    for (let k = 0; k < keys; k++) {
      const exp = expiry[k]!;
      if (mode === "early" && !started[k] && t >= exp - rebuildS * 2) {
        // Probabilistic early refresh: one request refreshes the key before it expires.
        started[k] = true;
        doneAt[k] = t + rebuildS * Math.max(1, load / dbCap);
        demand += 1 / 0.5;
        continue;
      }
      if (t >= exp && !started[k]) {
        started[k] = true;
        doneAt[k] = t + rebuildS * Math.max(1, load / dbCap);
      }
      if (started[k] && t < doneAt[k]! && t >= (mode === "early" ? exp - rebuildS * 2 : exp)) {
        // While the key is missing, readers either all go to the database, or one does (lock), or are served stale (swr).
        if (mode === "none") demand += perKeyRps;
        else if (mode === "lock") demand += 1 / rebuildS;
        else if (mode === "swr") demand += 1 / rebuildS;
        else demand += perKeyRps * 0.02;
      }
    }
    load = demand + keys * perKeyRps * 0.02;
    const over = Math.max(0, load - dbCap);
    droppedTotal += (mode === "swr" ? 0 : over) * 0.5;
    demandTotal += load * 0.5;
    run.t.push(t);
    run.dbLoad.push(load);
    run.dbPeak = Math.max(run.dbPeak, load);
    run.slowestS = Math.max(run.slowestS, rebuildS * Math.max(1, load / dbCap));
  }
  run.errorRate = demandTotal > 0 ? Math.min(1, droppedTotal / (keys * perKeyRps * 10)) : 0;
  return run;
}

export const stampedeLab: LabModel = {
  id: "stampede-lab",
  metrics: ["dbPeakUtil", "errorRate", "slowestS", "dbPeak"],
  observes: ["stampede", "protected"],
  scenes: ["expire", "lock", "early", "jitter"],
  runLabel: "Roll it out",
  honest: [
    "Keys expire at the same instant when they were cached together; jitter spreads them over 40% of the TTL. Real caches fill continuously, so synchronised expiry is the worst case, not the average.",
    "While a key is being rebuilt, readers either all hit the database (no protection), one rebuilds while others wait (lock), or readers get the stale value (stale-while-revalidate).",
    "Rebuild time stretches as the database overloads: a database at 3 times capacity rebuilds three times slower, which is what turns a blip into a spiral.",
  ],
  init: (c) => ({ mode: "none", jitter: false, keys: (c as { keys?: number }).keys ?? 40 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "mode", label: "Protection", options: [{ id: "none", label: "None", detail: "Every miss goes to the database" }, { id: "lock", label: "Lock or single-flight", detail: "One request rebuilds, the rest wait" }, { id: "early", label: "Refresh before expiry", detail: "One request refreshes the key shortly before it expires" }, { id: "swr", label: "Serve stale while revalidating", detail: "Readers get the old value while one request rebuilds" }] },
      { kind: "toggle", id: "jitter", label: "Add jitter to TTLs", detail: "Spread expiries over 40% of the TTL" },
    ];
    if (!(c as { lockKeys?: boolean }).lockKeys) out.push({ kind: "slider", id: "keys", label: "Hot keys cached together", min: 1, max: 400, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v, c) => {
    const keys = Math.round(num(v, "keys"));
    const r = stampedeRun({ keys, perKeyRps: Number((c as { perKeyRps?: number }).perKeyRps ?? 30), rebuildS: 0.4, dbCap: Number((c as { dbCap?: number }).dbCap ?? 600), mode: str(v, "mode"), jitter: bool(v, "jitter"), ttl: 20, seed: "stampede" });
    const cap = Number((c as { dbCap?: number }).dbCap ?? 600);
    const ts = r.t.filter((_, i) => i % 2 === 0);
    return {
      metrics: { dbPeakUtil: r.dbPeak / cap, errorRate: r.errorRate, slowestS: r.slowestS, dbPeak: r.dbPeak },
      readouts: [
        { label: "Database peak", value: r.dbPeak / cap, fmt: "pct", tone: r.dbPeak / cap > 1 ? "alert" : r.dbPeak / cap > 0.7 ? "warn" : "ok", sub: `of ${cap}/s capacity` },
        { label: "Requests failed", value: r.errorRate, fmt: "pct", tone: r.errorRate > 0.01 ? "alert" : "ok" },
        { label: "Slowest rebuild", value: r.slowestS, fmt: "s" },
      ],
      view: { kind: "curve", xLabel: "seconds", yLabel: "database load", xFmt: "int", yFmt: "int", series: [{ id: "load", label: "Database queries per second", tone: r.dbPeak > cap ? "alert" : "ok", points: ts.map((t) => [t, r.dbLoad[r.t.indexOf(t)]!] as [number, number]) }], hLines: [{ y: cap, label: "database capacity", tone: "info" }] },
      notes: [r.dbPeak > cap ? `At the expiry, ${keys} keys miss at once. The database sees ${Math.round(r.dbPeak)} queries a second against a capacity of ${cap}.` : "The expiries are absorbed without the database noticing."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "mode") === "none" && !bool(v, "jitter") && out.metrics.dbPeakUtil! > 1) ev.push("stampede");
    if (out.metrics.dbPeakUtil! < 0.9 && out.metrics.errorRate! < 0.01) ev.push("protected");
    return ev;
  },
  scene: (n): SceneOut => (n === "expire" ? { set: { mode: "none", jitter: false, keys: 40 }, focus: [] } : n === "lock" ? { set: { mode: "lock" }, focus: ["mode"] } : n === "early" ? { set: { mode: "early" }, focus: ["mode"] } : n === "jitter" ? { set: { jitter: true }, focus: ["jitter"] } : undefined),
};

// ------------------------------------------------------------------ hot keys

export const hotkeyLab: LabModel = {
  id: "hotkey-lab",
  metrics: ["hotNodeUtil", "maxShare", "imbalance", "nodes"],
  observes: ["hot-node", "balanced"],
  scenes: ["hash", "replicate", "local"],
  runLabel: "Rebalance",
  honest: [
    "Keys are spread over nodes by a fixed hash and traffic is Zipf over 100,000 keys. Real clusters shard by slot ranges, but the imbalance argument is the same.",
    "Replicating a hot key to R nodes divides its traffic among them. A per-app local cache of the top keys removes a share of reads before they reach the cluster.",
    "Node capacity is a fixed 50,000 reads a second.",
  ],
  init: (c) => ({ nodes: 8, skew: (c as { skew?: number }).skew ?? 1.1, replicas: 1, local: 0, rps: (c as { rps?: number }).rps ?? 300000 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "slider", id: "nodes", label: "Cache nodes", min: 1, max: 32, step: 1, fmt: "int" },
      { kind: "slider", id: "replicas", label: "Copies of each hot key", min: 1, max: 16, step: 1, fmt: "int", hint: "The 20 hottest keys get this many copies on different nodes" },
      { kind: "slider", id: "local", label: "Hottest keys cached inside each app", min: 0, max: 100, step: 5, fmt: "int" },
    ];
    if (!(c as { lockSkew?: boolean }).lockSkew) out.push({ kind: "slider", id: "skew", label: "Traffic skew", min: 0.7, max: 1.4, step: 0.05, fmt: "num" });
    return out;
  },
  evaluate: (v, c) => {
    const N = 100000;
    const nodes = Math.round(num(v, "nodes"));
    const s = num(v, "skew");
    const R = Math.min(nodes, Math.round(num(v, "replicas")));
    const local = Math.round(num(v, "local"));
    const h = harmonic(N, s);
    const total = h[N]!;
    const loads = new Array<number>(nodes).fill(0);
    const hotN = 20;
    for (let k = 1; k <= N; k++) {
      const p = 1 / Math.pow(k, s) / total;
      if (k <= local) continue; // served by the app-local cache
      const home = Number((BigInt(k) * 2654435761n) % BigInt(nodes));
      if (k <= hotN && R > 1) for (let j = 0; j < R; j++) loads[(home + j) % nodes]! += p / R;
      else loads[home]! += p;
    }
    const rest = loads.reduce((a, b) => a + b, 0);
    const rps = num(v, "rps");
    const cap = 50000;
    const max = Math.max(...loads);
    const util = (max * rps) / cap;
    return {
      metrics: { hotNodeUtil: util, maxShare: max / Math.max(rest, 1e-9), imbalance: (max * nodes) / Math.max(rest, 1e-9), nodes },
      readouts: [
        { label: "Busiest node", value: util, fmt: "pct", tone: util > 1 ? "alert" : util > 0.8 ? "warn" : "ok", sub: "of 50k reads/s" },
        { label: "Share on the busiest node", value: max / Math.max(rest, 1e-9), fmt: "pct", sub: `fair share ${(100 / nodes).toFixed(0)}%` },
        { label: "Imbalance", value: (max * nodes) / Math.max(rest, 1e-9), fmt: "x", sub: "busiest vs average" },
        { label: "Reads removed by local caches", value: 1 - rest, fmt: "pct" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1.2, bars: loads.map((l, i) => ({ label: `node ${i + 1}`, value: (l * rps) / cap, tone: (l * rps) / cap > 1 ? ("alert" as const) : (l * rps) / cap > 0.8 ? ("warn" as const) : ("ok" as const) })), lines: [{ value: 1, label: "node capacity", tone: "alert" }] },
      notes: [util > 1 ? "One node holds a very hot key and cannot keep up, even though the cluster as a whole has room." : "No node is past its limit."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.hotNodeUtil! > 0.9 && num(v, "nodes") >= 16) ev.push("hot-node");
    if (out.metrics.hotNodeUtil! < 0.8 && num(v, "nodes") >= 8) ev.push("balanced");
    return ev;
  },
  scene: (n): SceneOut => (n === "hash" ? { set: { nodes: 8, replicas: 1, local: 0 }, focus: ["nodes"] } : n === "replicate" ? { set: { replicas: 8 }, focus: ["replicas"] } : n === "local" ? { set: { local: 20 }, focus: ["local"] } : undefined),
};

// ------------------------------------------------------------------ CDN caching and cache keys

export const edgecacheLab: LabModel = {
  id: "edgecache-lab",
  metrics: ["hitRatio", "originRps", "staleSec", "variants"],
  observes: ["fragmented", "normalized"],
  scenes: ["key", "vary", "swr"],
  runLabel: "Publish the headers",
  honest: [
    "Pages are requested uniformly at 400 requests a second across 2,000 popular URLs. Hit ratio per cache key is the fixed-TTL rT ÷ (1 + rT).",
    "Each distinct tracking parameter or cookie value creates a separate cache key unless you normalise it away. The lab uses 12 variants per URL.",
    "Stale-while-revalidate serves the stale copy during revalidation, so the user sees no wait but the content can lag the TTL by a revalidation.",
  ],
  init: () => ({ normalize: false, vary: true, ttl: 120, swr: false }),
  controls: () => [
    { kind: "toggle", id: "normalize", label: "Ignore tracking query parameters in the cache key", detail: "?utm_source=… no longer creates a new object" },
    { kind: "toggle", id: "vary", label: "Vary on a session cookie", detail: "A separate copy for each logged-in visitor" },
    { kind: "slider", id: "ttl", label: "TTL", min: 10, max: 3600, log: true, fmt: "s" },
    { kind: "toggle", id: "swr", label: "stale-while-revalidate", detail: "Serve the old copy while refreshing in the background" },
  ],
  evaluate: (v) => {
    const urls = 2000;
    const total = 400;
    const queryVariants = bool(v, "normalize") ? 1 : 12;
    const cookieVariants = bool(v, "vary") ? 50 : 1;
    const variants = queryVariants * cookieVariants;
    const r = total / (urls * variants);
    const T = num(v, "ttl");
    const hit = (r * T) / (1 + r * T);
    const origin = total * (1 - hit);
    return {
      metrics: { hitRatio: hit, originRps: origin, staleSec: bool(v, "swr") ? T + 2 : T, variants },
      readouts: [
        { label: "Edge hit ratio", value: hit, fmt: "pct", tone: hit > 0.9 ? "ok" : hit > 0.6 ? "warn" : "alert" },
        { label: "Requests reaching the origin", value: origin, fmt: "int", sub: "per second" },
        { label: "Cache keys per URL", value: variants, fmt: "int", tone: variants > 12 ? "alert" : undefined },
        { label: "User waits on a refresh", value: bool(v, "swr") ? "no" : "sometimes", tone: bool(v, "swr") ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Hits", value: hit, tone: "ok" }, { label: "Misses to the origin", value: 1 - hit, tone: "alert" }] },
      notes: [variants > 1 ? `Each URL is stored ${variants} times, so each copy is requested ${(1 / variants).toFixed(2)} as often and expires before it is reused.` : "One copy per URL: every request for it shares the same cache entry."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.variants! >= 100) ev.push("fragmented");
    if (bool(v, "normalize") && !bool(v, "vary")) ev.push("normalized");
    return ev;
  },
  scene: (n): SceneOut => (n === "key" ? { set: { normalize: true }, focus: ["normalize"] } : n === "vary" ? { set: { vary: false }, focus: ["vary"] } : n === "swr" ? { set: { swr: true }, focus: ["swr"] } : undefined),
};

// ------------------------------------------------------------------ boss: the celebrity post

export const celebLab: LabModel = {
  id: "celeb-lab",
  metrics: ["p99", "errorRate", "dbPeakUtil", "hotNodeUtil", "costPerMonth"],
  observes: [],
  scenes: [],
  runLabel: "Let it go viral",
  honest: [
    "Five simplified models run together: edge caching, stampede protection, hot-key spreading, write-back counters, and the cost of each. Real incidents have more moving parts.",
    "The post is a single hot key that every follower reads, with a like counter that every reader updates.",
    "Costs are round monthly figures: edge caching $60, cache replicas $90, write-back buffer $40.",
  ],
  init: () => ({ edge: false, ttl: 30, protect: "none", jitter: false, replicas: 1, writeback: false, flush: 5 }),
  controls: () => [
    { kind: "toggle", id: "edge", label: "Serve the post through the edge cache", detail: "About $60 a month" },
    { kind: "slider", id: "ttl", label: "Edge and cache TTL", min: 5, max: 600, log: true, fmt: "s" },
    { kind: "choice", id: "protect", label: "Protect expiry", options: [{ id: "none", label: "None" }, { id: "lock", label: "Single-flight lock" }, { id: "swr", label: "Serve stale while revalidating" }] },
    { kind: "slider", id: "replicas", label: "Copies of the hot key in the cache cluster", min: 1, max: 8, step: 1, fmt: "int", hint: "$90 a month when above 1" },
    { kind: "toggle", id: "writeback", label: "Write-back for the like counter", detail: "About $40 a month" },
    { kind: "slider", id: "flush", label: "Counter flush interval", min: 1, max: 60, log: true, fmt: "s" },
  ],
  evaluate: (v) => {
    const rps = 90000;
    const edge = bool(v, "edge");
    const T = num(v, "ttl");
    const edgeHit = edge ? (0.5 * T) / (1 + 0.5 * T) : 0;
    const toCache = rps * (1 - edgeHit);
    const R = Math.round(num(v, "replicas"));
    const hotNode = (toCache * 0.7) / R / 50000;
    const dbBase = toCache * 0.02;
    const miss = str(v, "protect") === "none" ? toCache * 0.7 : 1;
    const dbRead = dbBase + (T < 60 ? miss * 0.6 : miss * 0.1);
    const writes = 20000;
    const flush = num(v, "flush");
    const dbWrite = bool(v, "writeback") ? (50 * (1 - Math.exp((-writes * flush) / 50))) / flush + 200 : writes;
    const dbLoad = (dbRead + dbWrite) / 1000;
    const hot = Math.max(hotNode, 0);
    const p99 = 40 + (hot > 1 ? 800 * (hot - 1) + 400 : hot > 0.8 ? 120 : 0) + (dbLoad > 1 ? 1500 * (dbLoad - 1) + 400 : dbLoad > 0.8 ? 150 : 0);
    const err = Math.min(1, (hot > 1 ? 1 - 1 / hot : 0) * 0.8 + (dbLoad > 1 ? 1 - 1 / dbLoad : 0));
    const cost = 400 + (edge ? 60 : 0) + (R > 1 ? 90 : 0) + (bool(v, "writeback") ? 40 : 0);
    return {
      metrics: { p99: p99 / 1000, errorRate: err, dbPeakUtil: dbLoad, hotNodeUtil: hot, costPerMonth: cost },
      readouts: [
        { label: "Page p99", value: p99 / 1000, fmt: "s", tone: p99 > 500 ? "alert" : p99 > 200 ? "warn" : "ok" },
        { label: "Errors", value: err, fmt: "pct", tone: err > 0.01 ? "alert" : "ok" },
        { label: "Busiest cache node", value: hot, fmt: "pct", tone: hot > 1 ? "alert" : hot > 0.8 ? "warn" : "ok" },
        { label: "Database load", value: dbLoad, fmt: "pct", tone: dbLoad > 1 ? "alert" : dbLoad > 0.8 ? "warn" : "ok", sub: "reads + writes vs 1,000/s" },
        { label: "Monthly cost", value: cost, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1.5, bars: [{ label: "Edge hit ratio", value: edgeHit, tone: "ok" }, { label: "Busiest cache node", value: hot, tone: hot > 1 ? "alert" : "warn" }, { label: "Database", value: dbLoad, tone: dbLoad > 1 ? "alert" : "warn" }], lines: [{ value: 1, label: "capacity", tone: "alert" }] },
      notes: [!edge ? "Every follower's read hits the cache cluster, and 70% of them land on one hot key." : hot > 1 ? "Even behind the edge, one cache node holds a key too hot for it." : "The edge absorbs the read storm."],
    };
  },
};

export const A4_MODELS: LabModel[] = [cacheLab, sizeLab, evictLab, writeLab, staleLab, stampedeLab, hotkeyLab, edgecacheLab, celebLab];
