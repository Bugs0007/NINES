/**
 * Chapter D1 "Production" models: a state-wide fan-out through a shared worker pool, and a Postgres job queue that
 * survives crashes, slow jobs and poison messages. Closed forms with labelled round constants (see each `honest`).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ state-wide fan-out

const DISTRICTS = 40;
const REQ_PER_S = 5;
const POOL = 100;
const HEALTHY_S = 0.2;
const SLOW_S = 10;
const SLOW_FAIL = 0.3;

/** Threads held by calls to the slow districts, per second of wall time (Little's Law: rate × hold time). */
export function fanoutRun(slow: number, timeoutS: number, attempts: number, bulkhead: boolean, partial: boolean, shed: boolean) {
  const healthyRate = REQ_PER_S * (DISTRICTS - slow);
  const slowRate = REQ_PER_S * slow;
  const timesOut = timeoutS < SLOW_S;
  const holdPerCall = timesOut ? timeoutS * attempts : SLOW_S * (1 + SLOW_FAIL * (attempts > 1 ? 1 : 0) + SLOW_FAIL * SLOW_FAIL * (attempts > 2 ? 1 : 0));
  const slowDemand = slowRate * holdPerCall;
  const slowHeld = bulkhead ? Math.min(slowDemand, 8 * slow) : slowDemand;
  const healthyDemand = healthyRate * HEALTHY_S;
  const demand = healthyDemand + slowHeld;
  const share = Math.min(1, POOL / demand);
  // Without shedding, an over-full pool queues everything and callers give up: reach collapses faster than the share.
  const healthyReach = (shed || share >= 1 ? share : share * share) * 0.99;
  const slowCalls = slowRate * (timesOut ? attempts : 1 + SLOW_FAIL + SLOW_FAIL * SLOW_FAIL);
  const amplification = slow ? slowCalls / slowRate : 1;
  const wait = timesOut ? timeoutS * attempts : SLOW_S;
  const answerS = slow === 0 ? HEALTHY_S : partial ? 0.5 : wait;
  const poolUsed = Math.min(1, demand / POOL);
  return { healthyReach, answerS, amplification, poolUsed, slowHeld, healthyDemand, demand, share };
}

export const fanoutLab: LabModel = {
  id: "fanout-guard-lab",
  metrics: ["healthyReach", "answerSeconds", "amplification", "poolUsed", "slowThreads"],
  observes: ["starved", "contained"],
  scenes: ["no-guard", "bulkhead", "partial"],
  runLabel: "Run the fan-out",
  honest: [
    "A state-wide request fans out to 40 district services, 5 times a second, through one shared pool of 100 worker threads. A healthy district answers in 200 ms. A slow district takes 10 s (or until your timeout) and fails 30% of the time. Calls to slow districts hold a thread for timeout × attempts; the pool is shared, so by Little's Law the threads in use are arrival rate × hold time.",
    "When demand for threads passes the pool, every call gets only its share of it; with no shedding the queue makes callers give up and reach falls with the square of the share. A bulkhead caps each slow district at 8 threads. Round figures to show the shape of the failure, not a measurement.",
  ],
  init: () => ({ slow: 3, timeout: 5, attempts: 3, bulkhead: false, partial: false, shed: false }),
  controls: (c) => {
    const lock = (c as { lockSlow?: boolean }).lockSlow;
    const out: Control[] = [];
    if (!lock) out.push({ kind: "slider", id: "slow", label: "Slow districts (of 40)", min: 0, max: 10, step: 1, fmt: "int" });
    out.push(
      { kind: "slider", id: "timeout", label: "Timeout per call (s)", min: 0.5, max: 15, step: 0.5, fmt: "num" },
      { kind: "slider", id: "attempts", label: "Attempts per call", min: 1, max: 5, step: 1, fmt: "int" },
      { kind: "toggle", id: "bulkhead", label: "Bulkhead: at most 8 threads per district" },
      { kind: "toggle", id: "partial", label: "Answer with the districts that responded" },
      { kind: "toggle", id: "shed", label: "Shed work when the pool is full (backpressure)" },
    );
    return out;
  },
  evaluate: (v) => {
    const r = fanoutRun(Math.round(num(v, "slow")), num(v, "timeout"), Math.round(num(v, "attempts")), bool(v, "bulkhead"), bool(v, "partial"), bool(v, "shed"));
    return {
      metrics: { healthyReach: r.healthyReach, answerSeconds: r.answerS, amplification: r.amplification, poolUsed: r.poolUsed, slowThreads: r.slowHeld },
      readouts: [
        { label: "Healthy districts reached", value: r.healthyReach, fmt: "pct", tone: toneLow(r.healthyReach, 0.97, 0.8) },
        { label: "Time to answer", value: r.answerS, fmt: "s", tone: tone(r.answerS, 2, 6) },
        { label: "Calls per slow district per request", value: r.amplification, fmt: "x", tone: tone(r.amplification, 1.5, 2.5) },
        { label: "Worker pool in use", value: r.poolUsed, fmt: "pct", sub: `${Math.round(r.demand)} of 100 threads wanted`, tone: tone(r.poolUsed, 0.7, 0.95) },
      ],
      view: {
        kind: "bars",
        fmt: "num",
        max: 160,
        bars: [{ label: "Threads wanted", segs: [{ value: r.healthyDemand, tone: "ok", label: "healthy districts" }, { value: r.slowHeld, tone: r.slowHeld > 40 ? "alert" : "warn", label: "slow districts" }] }],
        lines: [{ value: POOL, label: "pool: 100 threads", tone: "info" }],
      },
      notes: [r.share < 1 ? "The slow districts are holding threads the healthy ones need." : r.slowHeld > 0 ? "The slow districts are contained: the pool has room." : "Every district is healthy."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.healthyReach! < 0.8) ev.push("starved");
    if (num(v, "slow") >= 3 && out.metrics.healthyReach! > 0.97) ev.push("contained");
    return ev;
  },
  scene: (n): SceneOut => (n === "no-guard" ? { set: { bulkhead: false, partial: false, shed: false, attempts: 3, timeout: 5 }, focus: ["attempts", "timeout"] } : n === "bulkhead" ? { set: { bulkhead: true }, focus: ["bulkhead"] } : n === "partial" ? { set: { partial: true }, focus: ["partial"] } : undefined),
};

// ------------------------------------------------------------------ production Postgres job queue

const JOBS_PER_S = 200;
const WORKERS = 40;
const POISON_SHARE = 0.001;
const JOB_S = 2;

export function pgqProdRun(lease: number, attempts: number, backoff: boolean, rows: string) {
  // lease 0 = no lease: claimed jobs are marked running forever.
  const dupShare = lease === 0 ? 0 : Math.exp(-lease / 2.5);
  const stuckPerDay = lease === 0 ? 48 : 0;
  const recoveryS = lease === 0 ? Infinity : lease;
  // attempts 0 = retry forever: poison jobs pin workers.
  const tries = attempts === 0 ? Infinity : attempts;
  const poisonWork = JOBS_PER_S * POISON_SHARE * JOB_S * (backoff ? 1 : 3) * (Number.isFinite(tries) ? tries : 1e9);
  const wasted = Math.min(1, poisonWork / WORKERS);
  const deadPerHour = attempts === 0 ? 0 : JOBS_PER_S * POISON_SHARE * 3600;
  const tableGB = rows === "keep" ? 52 : rows === "delete" ? 4 : 0.2;
  const claimMs = 2 + tableGB * 0.4;
  return { dupShare, stuckPerDay, recoveryS, wasted, deadPerHour, tableGB, claimMs };
}

export const pgqProdLab: LabModel = {
  id: "pgq-prod-lab",
  metrics: ["duplicateShare", "stuckPerDay", "recoverySeconds", "wastedCapacity", "deadLettersPerHour", "tableGB", "claimMs"],
  observes: ["stuck-forever", "pinned", "bloat"],
  scenes: ["lease", "attempts", "rows"],
  runLabel: "Run a month of jobs",
  honest: [
    "A Postgres queue at 200 jobs a second with 40 workers; a job takes about 2 s. Workers claim with SKIP LOCKED and write a lease: a time by which the job must finish. If it does not, the job becomes claimable again. A crash happens about twice an hour (48 stuck jobs a day with no lease).",
    "The share of jobs that outrun a lease of L seconds is modelled as exp(-L ÷ 2.5): 45% at 2 s, 0.25% at 15 s. One job in a thousand is poison and fails every time. Without an attempt cap it pins a worker forever; with one, it is retried up to the cap and then dead-lettered. Without backoff each retry is immediate and costs three times the work of a delayed one.",
    "Completed rows: keeping them grows the table by about 52 GB in a month and slows the claim query (2 ms plus 0.4 ms per GB); deleting them leaves dead tuples for vacuum (about 4 GB); dropping a daily partition keeps it near 0.2 GB. Round figures, not benchmarks.",
  ],
  init: () => ({ lease: 0, attempts: 0, backoff: false, rows: "keep" }),
  controls: () => [
    { kind: "slider", id: "lease", label: "Lease (seconds; 0 = none)", min: 0, max: 60, step: 1, fmt: "int" },
    { kind: "slider", id: "attempts", label: "Attempts before dead-letter (0 = forever)", min: 0, max: 10, step: 1, fmt: "int" },
    { kind: "toggle", id: "backoff", label: "Back off between attempts" },
    { kind: "choice", id: "rows", label: "Completed jobs", options: [{ id: "keep", label: "Keep them" }, { id: "delete", label: "Delete each one" }, { id: "partition", label: "Daily partitions, drop old ones" }] },
  ],
  evaluate: (v) => {
    const r = pgqProdRun(Math.round(num(v, "lease")), Math.round(num(v, "attempts")), bool(v, "backoff"), str(v, "rows"));
    return {
      metrics: { duplicateShare: r.dupShare, stuckPerDay: r.stuckPerDay, recoverySeconds: Number.isFinite(r.recoveryS) ? r.recoveryS : 1e6, wastedCapacity: r.wasted, deadLettersPerHour: r.deadPerHour, tableGB: r.tableGB, claimMs: r.claimMs },
      readouts: [
        { label: "Jobs run twice", value: r.dupShare, fmt: "pct", tone: tone(r.dupShare, 0.01, 0.05) },
        { label: "Jobs stuck a day", value: r.stuckPerDay, fmt: "int", tone: tone(r.stuckPerDay, 0, 10) },
        { label: "Crashed job back after", value: Number.isFinite(r.recoveryS) ? r.recoveryS : "never", fmt: "s", tone: tone(Number.isFinite(r.recoveryS) ? r.recoveryS : 1e6, 30, 120) },
        { label: "Capacity burned by poison jobs", value: r.wasted, fmt: "pct", tone: tone(r.wasted, 0.05, 0.3) },
        { label: "Table size after a month", value: r.tableGB, fmt: "gb", sub: `claim query ${r.claimMs.toFixed(1)} ms`, tone: tone(r.tableGB, 1, 10) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Run twice", value: r.dupShare, tone: tone(r.dupShare, 0.01, 0.05) }, { label: "Worker capacity wasted", value: r.wasted, tone: tone(r.wasted, 0.05, 0.3) }] },
      notes: [r.stuckPerDay > 0 ? "Without a lease a crashed worker's job stays 'running' for ever." : r.dupShare > 0.05 ? "The lease is shorter than many jobs, so they are picked up again while still running." : "A lease turns a crash into a short delay."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.stuckPerDay! > 0) ev.push("stuck-forever");
    if (out.metrics.wastedCapacity! > 0.3) ev.push("pinned");
    if (out.metrics.tableGB! > 10) ev.push("bloat");
    return ev;
  },
  scene: (n): SceneOut => (n === "lease" ? { set: { lease: 15 }, focus: ["lease"] } : n === "attempts" ? { set: { attempts: 5, backoff: true }, focus: ["attempts", "backoff"] } : n === "rows" ? { set: { rows: "partition" }, focus: ["rows"] } : undefined),
};

// ------------------------------------------------------------------ capstone: legal search at national scale

const PEAK_DOCS_S = 21;
const DOC_S = 1.5;
const QUERIES_MONTH = 15e6;

export function capstoneRun(workers: number, bulkhead: boolean, lease: boolean, iso: string, hybrid: boolean, rerank: boolean, model: string, cache: boolean) {
  const effective = workers * (bulkhead ? 1 : 0.4);
  const cap = effective / DOC_S;
  const freshMin = cap >= PEAK_DOCS_S ? 3 : 3 + ((PEAK_DOCS_S - cap) * 28800) / cap / 60;
  const lost = lease ? 0 : 48;
  const recall = 0.72 + (hybrid ? 0.1 : 0) + (rerank ? 0.07 : 0) + (hybrid && rerank ? 0.02 : 0);
  const p99 = 60 + (hybrid ? 40 : 0) + (rerank ? 180 : 0);
  const leak = iso === "filter" ? 0.002 : iso === "namespace" ? 0.00005 : 0.00001;
  const isoMult = iso === "filter" ? 1 : iso === "namespace" ? 1.05 : 2.4;
  const perAnswer = model === "large" ? 0.009 : model === "small" ? 0.001 : 0.2 * 0.009 + 0.8 * 0.001;
  const quality = model === "large" ? 0.93 : model === "small" ? 0.78 : 0.91;
  const answers = QUERIES_MONTH * (cache ? 0.65 : 1) * perAnswer;
  const cost = workers * 50 + 1800 * isoMult + (rerank ? 2500 : 0) + answers;
  return { freshMin, lost, recall, p99, leak, cost, quality };
}

export const capstoneLab: LabModel = {
  id: "capstone-legal-lab",
  metrics: ["freshnessMinutes", "lostDocsPerDay", "recallAt10", "p99Ms", "leakRisk", "monthlyCost", "answerQuality"],
  observes: ["stale-index", "crossed-firms"],
  scenes: ["ingest", "isolate", "serve"],
  runLabel: "Launch the service",
  honest: [
    "A national legal search: 600,000 new judgments a day from 700 court sites (21 a second at the peak), 15 million questions a month from law firms, each firm's private documents kept apart. Ingesting a document (fetch, parse, chunk, embed) takes 1.5 s of one worker. 5% of court sites are slow; without a bulkhead they hold 60% of the workers.",
    "Recall, latency and leak figures are the round numbers from the legal-RAG case (hybrid search +10 points, reranking +7, 180 ms for the reranker). Isolation: a shared index with a tenant filter leaks about once in 500 queries when a filter is missed; namespaces about once in 20,000; an index per firm about once in 100,000 and 2.4 times the index cost. Answer cost uses $0.009 for the large model and $0.001 for the small one, tiering 20% to the large one, a cache answering 35% of questions.",
    "These are round figures to show how the earlier chapters combine, not a quote.",
  ],
  init: () => ({ workers: 8, bulkhead: false, lease: false, iso: "filter", hybrid: false, rerank: false, model: "large", cache: false }),
  controls: () => [
    { kind: "slider", id: "workers", label: "Ingest workers", min: 4, max: 128, step: 4, log: true, fmt: "int" },
    { kind: "toggle", id: "bulkhead", label: "Bulkhead slow court sites" },
    { kind: "toggle", id: "lease", label: "Queue lease, attempt cap and dead letters" },
    { kind: "choice", id: "iso", label: "Firm isolation", options: [{ id: "filter", label: "Shared index with a tenant filter" }, { id: "namespace", label: "One namespace per firm" }, { id: "index", label: "A separate index per firm" }] },
    { kind: "toggle", id: "hybrid", label: "Hybrid search (keyword + vector)" },
    { kind: "toggle", id: "rerank", label: "Rerank the top results" },
    { kind: "choice", id: "model", label: "Answer model", options: [{ id: "large", label: "Large for every question" }, { id: "small", label: "Small for every question" }, { id: "tiered", label: "Small first, large when unsure" }] },
    { kind: "toggle", id: "cache", label: "Cache repeated questions" },
  ],
  evaluate: (v) => {
    const r = capstoneRun(Math.round(num(v, "workers")), bool(v, "bulkhead"), bool(v, "lease"), str(v, "iso"), bool(v, "hybrid"), bool(v, "rerank"), str(v, "model"), bool(v, "cache"));
    return {
      metrics: { freshnessMinutes: r.freshMin, lostDocsPerDay: r.lost, recallAt10: r.recall, p99Ms: r.p99, leakRisk: r.leak, monthlyCost: r.cost, answerQuality: r.quality },
      readouts: [
        { label: "New judgments searchable within", value: r.freshMin, fmt: "int", sub: "minutes", tone: tone(r.freshMin, 15, 60) },
        { label: "Documents lost a day", value: r.lost, fmt: "int", tone: tone(r.lost, 0, 10) },
        { label: "Recall at 10", value: r.recall, fmt: "pct", tone: toneLow(r.recall, 0.88, 0.8) },
        { label: "Search p99", value: r.p99, fmt: "ms", tone: tone(r.p99, 300, 400) },
        { label: "Chance a query crosses firms", value: r.leak, fmt: "pct", tone: tone(r.leak, 0.0001, 0.001) },
        { label: "Cost a month", value: r.cost, fmt: "usd", tone: tone(r.cost, 40000, 70000) },
        { label: "Answer quality", value: r.quality, fmt: "pct", tone: toneLow(r.quality, 0.9, 0.8) },
      ],
      view: { kind: "bars", fmt: "usd", max: 150000, bars: [{ label: "Monthly cost", value: r.cost, tone: tone(r.cost, 40000, 70000) }] },
      notes: [r.freshMin > 60 ? "New judgments wait hours: the ingest side cannot keep up at the peak." : r.leak > 0.001 ? "One missed filter shows a firm's documents to another." : r.cost > 70000 ? "The answers dominate the bill." : "Each earlier chapter is a setting here."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.freshnessMinutes! > 60) ev.push("stale-index");
    if (out.metrics.leakRisk! > 0.001) ev.push("crossed-firms");
    return ev;
  },
  scene: (n): SceneOut => (n === "ingest" ? { set: { workers: 32, bulkhead: true, lease: true }, focus: ["workers", "bulkhead", "lease"] } : n === "isolate" ? { set: { iso: "namespace" }, focus: ["iso"] } : n === "serve" ? { set: { hybrid: true, rerank: true, model: "tiered", cache: true }, focus: ["hybrid", "rerank", "model", "cache"] } : undefined),
};

export const D1_MODELS: LabModel[] = [fanoutLab, pgqProdLab, capstoneLab];
