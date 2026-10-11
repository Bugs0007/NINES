/**
 * Chapter A8 part 2: CAP and PACELC, consistency models, clocks and ordering, Raft timers, distributed locks,
 * 2PC versus sagas, and the outbox pattern. Closed forms with labelled constants; the Raft split-vote
 * probability is exact for uniform timeouts, and the clock model integrates numerically.
 */
import { lognormal, normCdf } from "../math";
import { bool, num, str, type Control, type LabModel } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ CAP and PACELC

export const capLab: LabModel = {
  id: "cap-lab",
  metrics: ["unavailMin", "conflicts", "commitMs", "stalePct"],
  observes: ["partition-cp", "partition-ap"],
  scenes: ["cp", "ap", "else"],
  runLabel: "Choose the trade-offs",
  honest: [
    "A shopping-cart service runs in two regions 120 ms apart and each serves half the users. Network partitions between the regions add up to 30 minutes a month.",
    "A CP choice refuses writes on the side that cannot reach a majority, so half the users lose service for the whole partition. An AP choice keeps both sides writing; 40 carts a minute are changed on both sides, and they conflict when the partition heals, unless a merge rule combines them (2% still need a person).",
    "The 'else' part of PACELC is what you pay with no partition at all: waiting for the other region on every write costs 120 ms but reads are never stale; replying after the local write takes 8 ms and the other region's reads are stale for about 1.5% of requests.",
  ],
  init: (c) => ({ policy: "cp", elsePart: "consistency", merge: false, partitionMin: (c as { partitionMin?: number }).partitionMin ?? 30 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "policy", label: "During a partition", options: [{ id: "cp", label: "Consistency: refuse writes on the minority side" }, { id: "ap", label: "Availability: both sides keep accepting writes" }] },
      { kind: "choice", id: "elsePart", label: "Otherwise (no partition)", options: [{ id: "consistency", label: "Consistency: wait for the other region" }, { id: "latency", label: "Latency: reply after the local write" }] },
      { kind: "toggle", id: "merge", label: "Merge diverged carts automatically", detail: "Union the items; 2% still need a person" },
    ];
    if (!(c as { lockPartition?: boolean }).lockPartition) out.push({ kind: "slider", id: "partitionMin", label: "Partition minutes a month", min: 1, max: 240, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const ap = str(v, "policy") === "ap";
    const lat = str(v, "elsePart") === "latency";
    const T = num(v, "partitionMin");
    const unavail = ap ? 0 : T * 0.5;
    const conflicts = ap ? T * 40 * (bool(v, "merge") ? 0.02 : 1) : 0;
    const commit = lat ? 8 : 128;
    const stale = lat ? 0.015 : 0;
    const label = `${ap ? "PA" : "PC"}/${lat ? "EL" : "EC"}`;
    return {
      metrics: { unavailMin: unavail, conflicts, commitMs: commit, stalePct: stale },
      readouts: [
        { label: "Minutes of lost service (for half the users)", value: unavail, fmt: "num", tone: unavail > 5 ? "alert" : "ok" },
        { label: "Conflicting updates to settle after healing", value: conflicts, fmt: "int", tone: conflicts > 100 ? "alert" : conflicts > 0 ? "warn" : "ok" },
        { label: "Write latency", value: commit, fmt: "ms", tone: commit > 30 ? "warn" : "ok" },
        { label: "Stale reads", value: stale, fmt: "pct" },
        { label: "PACELC", value: label },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Lost-service minutes", value: unavail, tone: unavail > 5 ? "alert" : "ok" }, { label: "Conflicts to settle", value: conflicts, tone: conflicts > 100 ? "alert" : "ok" }, { label: "Write latency, ms", value: commit, tone: commit > 30 ? "warn" : "ok" }] },
      notes: [ap ? "Everyone keeps shopping. Some carts need merging afterwards." : "No conflicting writes ever happen, because half the users cannot write at all."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "policy") === "cp") ev.push("partition-cp");
    if (str(v, "policy") === "ap" && !bool(v, "merge")) ev.push("partition-ap");
    return ev;
  },
  scene: (n): SceneOut => (n === "cp" ? { set: { policy: "cp" }, focus: ["policy"] } : n === "ap" ? { set: { policy: "ap" }, focus: ["policy"] } : n === "else" ? { set: { elsePart: "latency" }, focus: ["elsePart"] } : undefined),
};

// ------------------------------------------------------------------ consistency models

export const consistencyLab: LabModel = {
  id: "consistency-lab",
  metrics: ["ownMiss", "staleOthers", "monotonic", "readMs", "availPartition"],
  observes: ["stale-seen", "linear-slow"],
  scenes: ["linear", "causal", "eventual"],
  runLabel: "Pick the guarantee",
  honest: [
    "A social app with two regions 120 ms apart. A user writes about once every 30 seconds; other people's posts arrive about every 2 seconds. Replicas lag by the number of milliseconds you set.",
    "Linearizable reads go to the leader (a cross-region round trip, 128 ms) and cannot be served on the minority side during a partition. Sequential reads come from a local replica in a consistent order, which can be old. Causal reads add a session token, so a user sees their own writes and never goes backward, but may still miss recent posts by others. Eventual reads are local and random.",
    "Miss and stale rates are 1 − e^(−lag ÷ gap), the chance a read lands within the lag of a write.",
  ],
  init: (c) => ({ level: "eventual", lagMs: (c as { lagMs?: number }).lagMs ?? 300 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "level", label: "Read guarantee", options: [{ id: "linear", label: "Linearizable: always the latest" }, { id: "sequential", label: "Sequential: one global order, maybe old" }, { id: "causal", label: "Causal with a session token" }, { id: "eventual", label: "Eventual: any replica" }] }];
    if (!(c as { lockLag?: boolean }).lockLag) out.push({ kind: "slider", id: "lagMs", label: "Replica lag", min: 10, max: 5000, log: true, fmt: "ms" });
    return out;
  },
  evaluate: (v) => {
    const lag = num(v, "lagMs");
    const L = str(v, "level");
    const own = L === "linear" || L === "causal" ? 0 : 1 - Math.exp(-lag / 30000);
    const others = L === "linear" ? 0 : 1 - Math.exp(-lag / 2000);
    const mono = L === "eventual" ? others / 2 : 0;
    const readMs = L === "linear" ? 128 : L === "causal" ? 9 : 8;
    const avail = L === "linear" ? 0.5 : 1;
    return {
      metrics: { ownMiss: own, staleOthers: others, monotonic: mono, readMs, availPartition: avail },
      readouts: [
        { label: "Reads missing your own write", value: own, fmt: "pct", tone: own > 0.001 ? "alert" : "ok" },
        { label: "Reads missing others' latest posts", value: others, fmt: "pct", tone: others > 0.1 ? "warn" : "ok" },
        { label: "Reads that go back in time", value: mono, fmt: "pct", tone: mono > 0 ? "alert" : "ok" },
        { label: "Read latency", value: readMs, fmt: "ms", tone: readMs > 30 ? "warn" : "ok" },
        { label: "Reads served during a partition", value: avail, fmt: "pct", tone: avail < 1 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Own writes missed", value: own, tone: "alert" }, { label: "Others' posts missed", value: others, tone: "warn" }, { label: "Time-travelling reads", value: mono, tone: "alert" }, { label: "Served in a partition", value: avail, tone: "ok" }] },
      notes: [L === "linear" ? "Never stale, but every read crosses the ocean and stalls when regions cannot talk." : L === "causal" ? "The user's own view is consistent and fast. Other people's posts can be a moment behind." : L === "sequential" ? "Everyone agrees on the order, but a read can still be old." : "Fast and always available, and a user can see their own post vanish or an old page after a new one."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.ownMiss! > 0.02) ev.push("stale-seen");
    if (str(v, "level") === "linear") ev.push("linear-slow");
    return ev;
  },
  scene: (n): SceneOut => (n === "linear" ? { set: { level: "linear" }, focus: ["level"] } : n === "causal" ? { set: { level: "causal" }, focus: ["level"] } : n === "eventual" ? { set: { level: "eventual", lagMs: 800 }, focus: ["level"] } : undefined),
};

// ------------------------------------------------------------------ clocks

/** P(skew difference (normal, std s) exceeds a gap drawn from an exponential with the given mean). */
export function wrongOrder(sigmaMs: number, gapMs: number): number {
  const s = Math.max(1e-9, sigmaMs * Math.SQRT2);
  const n = 4000;
  const top = gapMs * 12;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) * top) / n;
    sum += (1 / gapMs) * Math.exp(-x / gapMs) * (1 - normCdf(x / s)) * (top / n);
  }
  return sum;
}

export const clockLab: LabModel = {
  id: "clock-lab",
  metrics: ["wrongOrderPct", "silentLossPerDay", "commitWaitMs", "metaBytes"],
  observes: ["skewed", "vector-on"],
  scenes: ["physical", "logical", "truetime"],
  runLabel: "Pick the ordering scheme",
  honest: [
    "Twelve nodes whose wall clocks disagree by a normal error with the standard deviation you set. A causally ordered pair of writes (one reacts to the other) is separated by an exponential gap with a 100 ms mean. 'Wrong order' is the chance the later write gets the earlier timestamp. The integral is computed numerically.",
    "Last-writer-wins by physical clock, a Lamport counter, a hybrid logical clock, and a bounded-uncertainty clock (with its commit wait of twice the uncertainty) all choose a winner for concurrent writes, so the loser is lost silently; 500 concurrent conflicts a day are assumed. Only version vectors notice the conflict and keep both.",
    "Metadata is per-write bytes: 8 for a timestamp or counter, 12 for a hybrid clock, 16 for an interval, 8 per node for a vector.",
  ],
  init: (c) => ({ scheme: "physical", sigma: (c as { sigma?: number }).sigma ?? 30, eps: 7 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "scheme", label: "Ordering scheme", options: [{ id: "physical", label: "Wall-clock timestamps (last writer wins)" }, { id: "lamport", label: "Lamport counters" }, { id: "hlc", label: "Hybrid logical clock" }, { id: "truetime", label: "Bounded-uncertainty clock (commit wait)" }, { id: "vector", label: "Version vectors" }] }];
    if (!(c as { lockSigma?: boolean }).lockSigma) out.push({ kind: "slider", id: "sigma", label: "Clock error between nodes (std dev)", min: 0.1, max: 200, log: true, fmt: "ms" });
    out.push({ kind: "slider", id: "eps", label: "Clock uncertainty bound (bounded clocks only)", min: 1, max: 50, log: true, fmt: "ms" });
    return out;
  },
  evaluate: (v) => {
    const sc = str(v, "scheme");
    const wo = sc === "physical" ? wrongOrder(num(v, "sigma"), 100) : 0;
    const silent = sc === "vector" ? 0 : 500;
    const wait = sc === "truetime" ? 2 * num(v, "eps") : 0;
    const meta = sc === "vector" ? 96 : sc === "hlc" ? 12 : sc === "truetime" ? 16 : 8;
    return {
      metrics: { wrongOrderPct: wo, silentLossPerDay: silent, commitWaitMs: wait, metaBytes: meta },
      readouts: [
        { label: "Causal writes ordered wrongly", value: wo, fmt: "pct", tone: wo > 0.01 ? "alert" : wo > 0.001 ? "warn" : "ok" },
        { label: "Concurrent writes lost silently, per day", value: silent, fmt: "int", tone: silent > 0 ? "alert" : "ok" },
        { label: "Commit wait", value: wait, fmt: "ms", tone: wait > 15 ? "warn" : "ok" },
        { label: "Metadata per write", value: meta, fmt: "int", sub: "bytes" },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.5, bars: [{ label: "Causal order wrong", value: wo, tone: wo > 0.001 ? "alert" : "ok" }] },
      notes: [sc === "physical" ? "A node whose clock runs fast wins arguments it should lose." : sc === "vector" ? "Concurrent writes are kept as siblings for the application or user to merge." : sc === "truetime" ? "The clock admits its uncertainty and waits it out, so order is right and writes are slower." : "Order follows causality, but concurrent writes still get a silent winner."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.wrongOrderPct! > 0.02) ev.push("skewed");
    if (str(v, "scheme") === "vector") ev.push("vector-on");
    return ev;
  },
  scene: (n): SceneOut => (n === "physical" ? { set: { scheme: "physical", sigma: 50 }, focus: ["scheme", "sigma"] } : n === "logical" ? { set: { scheme: "hlc" }, focus: ["scheme"] } : n === "truetime" ? { set: { scheme: "truetime", eps: 7 }, focus: ["eps"] } : undefined),
};

// ------------------------------------------------------------------ Raft timers

export const raftLab: LabModel = {
  id: "raft-lab",
  metrics: ["failoverMs", "falsePerHour", "splitPct"],
  observes: ["too-twitchy", "too-slow"],
  scenes: ["timeout", "split", "heartbeat"],
  runLabel: "Set the timers",
  honest: [
    "Follower election timeouts are drawn uniformly from T to 2T. After the leader crashes, the first follower to time out starts an election; the others reply within a 10 ms round trip. A split vote happens when the two earliest timeouts fall within that round trip, and costs another timeout.",
    "Expected failover is T × (1 + 1 ÷ N) − heartbeat ÷ 2 + 20 ms for the vote, plus the split chance times 1.5 T. A needless election starts when a heartbeat to a follower arrives late; delays are lognormal with a 5 ms median and an 80 ms p99, and every one of the N − 1 followers gets its own.",
    "Real implementations add pre-vote and leader leases; the lab shows the bare protocol.",
  ],
  init: () => ({ timeout: 300, heartbeat: 100, nodes: 5 }),
  controls: () => [
    { kind: "slider", id: "timeout", label: "Election timeout T", min: 50, max: 10000, log: true, fmt: "ms" },
    { kind: "slider", id: "heartbeat", label: "Heartbeat interval", min: 10, max: 2000, log: true, fmt: "ms" },
    { kind: "choice", id: "nodes", label: "Cluster size", options: [{ id: "3", label: "3 nodes" }, { id: "5", label: "5 nodes" }, { id: "7", label: "7 nodes" }] },
  ],
  evaluate: (v) => {
    const T = num(v, "timeout");
    const h = Math.min(num(v, "heartbeat"), T);
    const n = Number(str(v, "nodes"));
    const m = n - 1;
    const split = 1 - Math.pow(Math.max(0, 1 - 10 / T), m);
    const fail = T * (1 + 1 / n) - h / 2 + 20 + split * 1.5 * T;
    const tmin = T * (1 + 1 / n);
    const d = lognormal(5, 80);
    const pLate = 1 - d.cdf(Math.max(1, tmin - h));
    const falsePerHr = (3600000 / h) * pLate * m;
    return {
      metrics: { failoverMs: fail, falsePerHour: falsePerHr, splitPct: split },
      readouts: [
        { label: "Time without a leader after a crash", value: fail, fmt: "ms", tone: fail > 1500 ? "alert" : fail > 800 ? "warn" : "ok" },
        { label: "Needless elections per hour", value: falsePerHr, fmt: "num", tone: falsePerHr > 1 ? "alert" : falsePerHr > 0.1 ? "warn" : "ok" },
        { label: "Elections that split the vote", value: split, fmt: "pct", tone: split > 0.05 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Failover, seconds", value: fail / 1000, tone: fail > 1500 ? "alert" : "ok" }, { label: "Needless elections per hour", value: falsePerHr, tone: falsePerHr > 1 ? "alert" : "ok" }] },
      notes: [falsePerHr > 1 ? "A late heartbeat is mistaken for a dead leader, so the cluster keeps electing for nothing." : fail > 1500 ? "Safe, but a real crash leaves the cluster leaderless for a long while." : "Long enough to ignore a hiccup, short enough to notice a crash."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.falsePerHour! > 5) ev.push("too-twitchy");
    if (out.metrics.failoverMs! > 3000) ev.push("too-slow");
    return ev;
  },
  scene: (n): SceneOut => (n === "timeout" ? { set: { timeout: 100, heartbeat: 50 }, focus: ["timeout"] } : n === "split" ? { set: { timeout: 60, nodes: "7" }, focus: ["timeout", "nodes"] } : n === "heartbeat" ? { set: { heartbeat: 300 }, focus: ["heartbeat"] } : undefined),
};

// ------------------------------------------------------------------ distributed locks

export const lockLab: LabModel = {
  id: "lock-lab",
  metrics: ["corruptPerDay", "recoveryS", "staleRejected"],
  observes: ["pause-bites", "fenced"],
  scenes: ["pause", "fence", "ttl"],
  runLabel: "Set the lease",
  honest: [
    "A million lock-guarded writes a day. A lock holder can stall (a long garbage collection, a paused VM, a slow disk) after it checked that it still held the lease. A stall longer than the lease lets another worker take the lock, and the first worker's write then lands on top of the second's.",
    "Stall lengths follow a heavy tail: the share of writes that stall longer than x seconds is 2 × 10⁻⁴ × x^−1.5. That is a rounded assumption in the spirit of observed pauses, not a measurement.",
    "A fencing token makes the store reject writes carrying an older token, so the late write is refused instead of corrupting. After a holder crashes, others wait out the lease before they can take over.",
  ],
  init: () => ({ ttl: 10, fencing: false }),
  controls: () => [
    { kind: "slider", id: "ttl", label: "Lease length", min: 1, max: 120, log: true, fmt: "num", hint: "seconds" },
    { kind: "toggle", id: "fencing", label: "Fencing tokens", detail: "The storage layer rejects writes with an old token" },
  ],
  evaluate: (v) => {
    const ttl = num(v, "ttl");
    const lateWrites = 1e6 * 2e-4 * Math.pow(ttl, -1.5);
    const corrupt = bool(v, "fencing") ? 0 : lateWrites;
    return {
      metrics: { corruptPerDay: corrupt, recoveryS: ttl, staleRejected: bool(v, "fencing") ? lateWrites : 0 },
      readouts: [
        { label: "Corrupting writes per day", value: corrupt, fmt: "num", tone: corrupt > 1 ? "alert" : corrupt > 0 ? "warn" : "ok" },
        { label: "Wait for a new holder after a crash", value: ttl, fmt: "s", tone: ttl > 15 ? "warn" : "ok" },
        { label: "Late writes refused by fencing", value: bool(v, "fencing") ? lateWrites : 0, fmt: "num" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Stalls outlasting the lease, per day", value: lateWrites, tone: "warn" }, { label: "Of which corrupt data", value: corrupt, tone: corrupt > 0 ? "alert" : "ok" }] },
      notes: [bool(v, "fencing") ? "A holder that wakes up late is turned away by the storage layer." : "A longer lease makes this rarer, never impossible, and slows recovery after a crash."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.corruptPerDay! > 1) ev.push("pause-bites");
    if (bool(v, "fencing")) ev.push("fenced");
    return ev;
  },
  scene: (n): SceneOut => (n === "pause" ? { set: { ttl: 5, fencing: false }, focus: ["ttl"] } : n === "fence" ? { set: { fencing: true }, focus: ["fencing"] } : n === "ttl" ? { set: { ttl: 60 }, focus: ["ttl"] } : undefined),
};

// ------------------------------------------------------------------ 2PC versus sagas

export const sagaLab: LabModel = {
  id: "saga-lab",
  metrics: ["lockHoldMs", "successRate", "dupRefundsPerMillion", "visibleWindowMs", "stuckHoursPerYear"],
  observes: ["saga-on", "retried"],
  scenes: ["twopc", "saga", "compensate"],
  runLabel: "Choose the protocol",
  honest: [
    "A booking touches three services (flights, hotels, payments), each 40 ms from the coordinator and taking 10 ms for its local transaction. Each step fails on its own with the probability set (2% by default).",
    "Two-phase commit holds locks from prepare to commit, about 90 ms, and one failed participant aborts everything. If the coordinator dies in between, participants hold locks until someone resolves it: 4 crashes a year × 30 minutes. A saga commits each step locally at once, and undoes earlier steps with compensating actions if a later one fails; each step is retried the chosen number of times first.",
    "A compensation that is not idempotent can run twice after a retry: 1% of failed bookings then refund twice. In a saga, others can see a half-finished booking for the sum of the step times, 150 ms.",
  ],
  init: (c) => ({ proto: "twopc", retries: 0, idemComp: false, failPct: (c as { failPct?: number }).failPct ?? 0.02 }),
  controls: () => [
    { kind: "choice", id: "proto", label: "Protocol", options: [{ id: "twopc", label: "Two-phase commit" }, { id: "saga", label: "Saga with compensations" }] },
    { kind: "slider", id: "retries", label: "Retries per step (saga)", min: 0, max: 4, step: 1, fmt: "int" },
    { kind: "toggle", id: "idemComp", label: "Compensations are idempotent", detail: "Safe to run twice" },
  ],
  evaluate: (v) => {
    const f = num(v, "failPct");
    const saga = str(v, "proto") === "saga";
    const r = Math.round(num(v, "retries"));
    const stepOk = saga ? 1 - Math.pow(f, r + 1) : 1 - f;
    const success = Math.pow(stepOk, 3);
    const lock = saga ? 10 : 90;
    const dup = saga && !bool(v, "idemComp") ? (1 - success) * 1e6 * 0.01 : 0;
    const visible = saga ? 150 : 0;
    const stuck = saga ? 0 : 2;
    return {
      metrics: { lockHoldMs: lock, successRate: success, dupRefundsPerMillion: dup, visibleWindowMs: visible, stuckHoursPerYear: stuck },
      readouts: [
        { label: "Bookings that succeed", value: success, fmt: "pct", tone: success > 0.999 ? "ok" : success > 0.99 ? "warn" : "alert" },
        { label: "Locks held per booking", value: lock, fmt: "ms", tone: lock > 20 ? "warn" : "ok" },
        { label: "Double refunds per million", value: dup, fmt: "int", tone: dup > 0 ? "alert" : "ok" },
        { label: "Half-finished state visible for", value: visible, fmt: "ms" },
        { label: "Hours a year locks may be stuck", value: stuck, fmt: "num", tone: stuck > 0 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Bookings that succeed", value: success, tone: "ok" }] },
      notes: [saga ? "No distributed lock, but there is a window where the booking is half done, and every step needs an undo." : "Atomic and simple to reason about, but one slow participant holds everyone's locks, and one failure aborts the lot."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "proto") === "saga") ev.push("saga-on");
    if (str(v, "proto") === "saga" && num(v, "retries") >= 2) ev.push("retried");
    return ev;
  },
  scene: (n): SceneOut => (n === "twopc" ? { set: { proto: "twopc" }, focus: ["proto"] } : n === "saga" ? { set: { proto: "saga", retries: 2 }, focus: ["proto", "retries"] } : n === "compensate" ? { set: { proto: "saga", retries: 2, idemComp: true }, focus: ["idemComp"] } : undefined),
};

// ------------------------------------------------------------------ outbox

export const outboxLab: LabModel = {
  id: "outbox-lab",
  metrics: ["lostPerDay", "phantomPerDay", "appliedTwicePerDay", "extraLatencyMs"],
  observes: ["lost-seen", "twice-seen"],
  scenes: ["dual", "outbox", "dedup"],
  runLabel: "Choose the pattern",
  honest: [
    "5 million events a day. Doing the database write and the broker publish as two separate steps leaves a crash window between them: 2 × 10⁻⁵ of operations crash there, about 100 a day. Write first and the event is lost; publish first and a phantom event announces something that never committed.",
    "An outbox writes the event into the same database transaction as the data, and a relay publishes it afterwards. The relay can crash after publishing and before marking the row sent, so 5 × 10⁻⁶ of events, about 25 a day, are delivered twice. Consumers that remember processed ids apply them once.",
    "Extra latency: polling adds half the interval plus 5 ms; change-data-capture adds about 25 ms; a direct publish adds about 2 ms.",
  ],
  init: () => ({ pattern: "dbfirst", pollMs: 1000, dedup: false }),
  controls: () => [
    { kind: "choice", id: "pattern", label: "How the event is published", options: [{ id: "dbfirst", label: "Write the database, then publish" }, { id: "brokerfirst", label: "Publish, then write the database" }, { id: "poll", label: "Outbox table, polled by a relay" }, { id: "cdc", label: "Outbox table, read from the log (CDC)" }] },
    { kind: "slider", id: "pollMs", label: "Relay poll interval", min: 50, max: 5000, log: true, fmt: "ms" },
    { kind: "toggle", id: "dedup", label: "Consumers skip ids they have seen" },
  ],
  evaluate: (v) => {
    const p = str(v, "pattern");
    const outbox = p === "poll" || p === "cdc";
    const lost = p === "dbfirst" ? 100 : 0;
    const phantom = p === "brokerfirst" ? 100 : 0;
    const dupes = outbox ? 25 : 0;
    const twice = bool(v, "dedup") ? 0 : dupes;
    const lat = p === "poll" ? num(v, "pollMs") / 2 + 5 : p === "cdc" ? 25 : 2;
    return {
      metrics: { lostPerDay: lost, phantomPerDay: phantom, appliedTwicePerDay: twice, extraLatencyMs: lat },
      readouts: [
        { label: "Events lost per day", value: lost, fmt: "int", tone: lost > 0 ? "alert" : "ok" },
        { label: "Phantom events per day", value: phantom, fmt: "int", tone: phantom > 0 ? "alert" : "ok" },
        { label: "Events applied twice per day", value: twice, fmt: "int", tone: twice > 0 ? "warn" : "ok" },
        { label: "Added delay", value: lat, fmt: "ms", tone: lat > 250 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Lost", value: lost, tone: lost ? "alert" : "ok" }, { label: "Phantom", value: phantom, tone: phantom ? "alert" : "ok" }, { label: "Applied twice", value: twice, tone: twice ? "warn" : "ok" }] },
      notes: [outbox ? "Atomic with the data. The only failure left is a duplicate, which consumers can absorb." : "Two systems cannot be updated together without a coordinator, so a crash between them leaves one ahead."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostPerDay! > 0 || out.metrics.phantomPerDay! > 0) ev.push("lost-seen");
    if (out.metrics.appliedTwicePerDay! > 0) ev.push("twice-seen");
    return ev;
  },
  scene: (n): SceneOut => (n === "dual" ? { set: { pattern: "dbfirst" }, focus: ["pattern"] } : n === "outbox" ? { set: { pattern: "poll", pollMs: 200 }, focus: ["pattern"] } : n === "dedup" ? { set: { pattern: "poll", dedup: true }, focus: ["dedup"] } : undefined),
};

export const A8B_MODELS: LabModel[] = [capLab, consistencyLab, clockLab, raftLab, lockLab, sagaLab, outboxLab];
