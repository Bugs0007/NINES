/**
 * Chapter A6 "Copies" models: leader-follower scaling, sync versus async commits, replication lag, failover timing,
 * multi-leader conflicts, quorums, and the primary-down boss. Quorum arithmetic is exact (binomials and order
 * statistics); the other models are explicit closed forms with labelled round constants.
 */
import { bisect, lognormal } from "../math";
import { bool, num, str, sweep, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** P(Binomial(n, p) >= k). */
const binomAtLeast = (n: number, k: number, p: number): number => {
  let s = 0;
  for (let i = k; i <= n; i++) s += choose(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
  return s;
};

// ------------------------------------------------------------------ leader-follower

export const replLab: LabModel = {
  id: "repl-lab",
  metrics: ["util", "readCapacity", "costPerMonth", "lagSeconds", "followers"],
  observes: ["read-scaled", "write-wall"],
  scenes: ["reads", "writes", "lag"],
  runLabel: "Add the followers",
  honest: [
    "Each node handles 4,000 simple queries a second. A write costs 1 unit on the primary and 0.5 on every follower, which replays it. Reads are spread evenly over all nodes. These are round figures for a modest instance.",
    "Followers apply the primary's changes one stream at a time, at about 6,000 writes a second. If writes arrive faster than that, replication lag grows without bound.",
    "A node costs $300 a month in the lab. The primary is a single point for writes: adding followers never raises write capacity.",
  ],
  init: (c) => ({ followers: 0, reads: (c as { reads?: number }).reads ?? 12000, writes: (c as { writes?: number }).writes ?? 600 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "slider", id: "followers", label: "Read replicas", min: 0, max: 8, step: 1, fmt: "int" }];
    if (!(c as { lockLoad?: boolean }).lockLoad) {
      out.push({ kind: "slider", id: "reads", label: "Reads per second", min: 1000, max: 40000, step: 500, fmt: "int" });
      out.push({ kind: "slider", id: "writes", label: "Writes per second", min: 50, max: 12000, log: true, fmt: "int" });
    }
    return out;
  },
  evaluate: (v) => {
    const F = Math.round(num(v, "followers"));
    const R = num(v, "reads");
    const W = num(v, "writes");
    const C = 4000;
    const nodes = 1 + F;
    const used = R + W + 0.5 * W * F;
    const util = used / (nodes * C);
    const apply = 6000;
    const lag = W > apply ? ((W - apply) / apply) * 60 : 0.05 + (W / apply) * 0.4;
    const cap = nodes * C - W - 0.5 * W * F;
    return {
      metrics: { util, readCapacity: cap, costPerMonth: nodes * 300, lagSeconds: lag, followers: F },
      readouts: [
        { label: "Busiest node", value: util, fmt: "pct", tone: util > 0.9 ? "alert" : util > 0.7 ? "warn" : "ok", sub: "reads + replayed writes" },
        { label: "Read capacity left", value: Math.max(0, cap), fmt: "int", sub: "reads per second", tone: cap < R ? "alert" : undefined },
        { label: "Replication lag after a minute", value: lag, fmt: "s", tone: lag > 5 ? "alert" : lag > 1 ? "warn" : "ok" },
        { label: "Monthly cost", value: nodes * 300, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1.4, bars: [{ label: "Primary", value: (R / nodes + W) / C, tone: (R / nodes + W) / C > 0.9 ? ("alert" as Tone) : ("ok" as Tone) }, ...Array.from({ length: F }, (_, i) => ({ label: `Follower ${i + 1}`, value: (R / nodes + 0.5 * W) / C, tone: ((R / nodes + 0.5 * W) / C > 0.9 ? "alert" : "ok") as Tone }))], lines: [{ value: 0.7, label: "70%", tone: "ok" }] },
      notes: [W > apply ? "Writes arrive faster than followers can replay them, so lag grows and replicas fall further behind." : F === 0 ? "One node carries every read and every write." : "Reads spread over more nodes; every write still lands on the primary and on every follower."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (num(v, "followers") > 0 && out.metrics.util! < 0.9) ev.push("read-scaled");
    if (num(v, "writes") > 6000) ev.push("write-wall");
    return ev;
  },
  scene: (n): SceneOut => (n === "reads" ? { set: { followers: 3, writes: 600 }, focus: ["followers"] } : n === "writes" ? { set: { followers: 6, writes: 3000 }, focus: ["writes"] } : n === "lag" ? { set: { writes: 9000 }, focus: ["writes"] } : undefined),
};

// ------------------------------------------------------------------ sync versus async replication

export const syncLab: LabModel = {
  id: "sync-lab",
  metrics: ["commitMs", "lostAzWrites", "lostRegionWrites", "writesBlocked"],
  observes: ["sync-slow", "async-loss"],
  scenes: ["async", "semi", "sync"],
  runLabel: "Set the commit rule",
  honest: [
    "A primary with two replicas: one in another availability zone (1 ms away) and one in another region. A commit waits for the replicas you require, so its latency is the base 3 ms plus the slowest required round trip.",
    "Writes not yet on a replica when the primary dies are lost to that replica's promotion. An unrequired replica trails by about its round trip plus 20 ms of apply time.",
    "If a required replica is down, writes block until it is removed from the requirement or returns.",
  ],
  init: (c) => ({ required: 0, rtt: (c as { rtt?: number }).rtt ?? 80, writes: (c as { writes?: number }).writes ?? 2000 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "required", label: "Replicas that must acknowledge before COMMIT returns", options: [{ id: "0", label: "None (asynchronous)" }, { id: "1", label: "The nearby-zone replica" }, { id: "2", label: "Both, including the other region" }] }];
    if (!(c as { lockRtt?: boolean }).lockRtt) out.push({ kind: "slider", id: "rtt", label: "Round trip to the remote region", min: 5, max: 250, log: true, fmt: "ms" });
    return out;
  },
  evaluate: (v) => {
    const req = Number(str(v, "required"));
    const rtt = num(v, "rtt");
    const W = num(v, "writes");
    const zone = 1;
    const commit = 3 + (req === 0 ? 0 : req === 1 ? zone : Math.max(zone, rtt));
    const lagZone = (zone + 20) / 1000;
    const lagRegion = (rtt + 20) / 1000;
    const lostAz = req >= 1 ? 0 : W * lagZone;
    const lostRegion = req >= 2 ? 0 : W * lagRegion;
    const blocked = req === 0 ? 0 : 1;
    return {
      metrics: { commitMs: commit, lostAzWrites: lostAz, lostRegionWrites: lostRegion, writesBlocked: blocked },
      readouts: [
        { label: "Commit latency", value: commit, fmt: "ms", tone: commit > 40 ? "alert" : commit > 10 ? "warn" : "ok" },
        { label: "Writes lost if the primary's zone fails", value: lostAz, fmt: "int", tone: lostAz > 0 ? "alert" : "ok" },
        { label: "Writes lost if the whole region fails", value: lostRegion, fmt: "int", tone: lostRegion > 500 ? "alert" : lostRegion > 0 ? "warn" : "ok" },
        { label: "Writes stall if a required replica is down", value: blocked ? "yes" : "no", tone: blocked ? "warn" : "ok" },
      ],
      view: { kind: "waterfall", rows: [{ label: "Write on the primary", start: 0, ms: 3, tone: "ok" }, ...(req >= 1 ? [{ label: "Wait for the nearby replica", start: 3, ms: zone, tone: "info" as Tone }] : []), ...(req >= 2 ? [{ label: "Wait for the remote replica", start: 3, ms: rtt, tone: "warn" as Tone }] : [])] },
      notes: [req === 0 ? "COMMIT returns as soon as the primary has the write; replicas catch up afterwards." : req === 1 ? "A copy in a second zone exists before the user is told it worked." : "The user waits for the slowest copy, a whole region away."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.commitMs! > 40) ev.push("sync-slow");
    if (str(v, "required") === "0" && out.metrics.lostAzWrites! > 0) ev.push("async-loss");
    return ev;
  },
  scene: (n): SceneOut => (n === "async" ? { set: { required: "0" }, focus: ["required"] } : n === "semi" ? { set: { required: "1" }, focus: ["required"] } : n === "sync" ? { set: { required: "2" }, focus: ["required"] } : undefined),
};

// ------------------------------------------------------------------ replication lag and read-your-writes

export const lagLab: LabModel = {
  id: "lag-lab",
  metrics: ["missRate", "primaryShare", "extraP99Ms"],
  observes: ["stale-seen", "pinned"],
  scenes: ["stale", "pin", "lsn"],
  runLabel: "Set the read policy",
  honest: [
    "Users write about once every 30 seconds on average; a read is 'recent' if it comes within the pinning window of that user's last write. These are round figures for a social feature.",
    "A read misses a user's own write if it hits a replica and arrives within the replication lag of that write: probability 1 − e^(−lag ÷ 30 s) when reads go to replicas blindly.",
    "Waiting for a replica to reach the write's log position adds up to the lag to a read that comes right after a write; at the 99th percentile that is the whole lag when more than 1% of reads are recent.",
  ],
  init: (c) => ({ strategy: "replica", lagMs: (c as { lagMs?: number }).lagMs ?? 800, pinS: 1 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "strategy", label: "Where reads go", options: [{ id: "replica", label: "Replicas only" }, { id: "pin", label: "Primary for a while after the user writes, replicas otherwise" }, { id: "lsn", label: "Replica, but wait until it has the user's last write" }] }, { kind: "slider", id: "pinS", label: "Pinning window", min: 0.1, max: 60, log: true, fmt: "s" }];
    if (!(c as { lockLag?: boolean }).lockLag) out.push({ kind: "slider", id: "lagMs", label: "Replication lag", min: 10, max: 10000, log: true, fmt: "ms" });
    return out;
  },
  evaluate: (v) => {
    const s = str(v, "strategy");
    const L = num(v, "lagMs") / 1000;
    const T = num(v, "pinS");
    const gap = 30;
    const pMissBase = 1 - Math.exp(-L / gap);
    let miss = pMissBase;
    let primary = 0;
    let extra = 0;
    if (s === "pin") {
      primary = 1 - Math.exp(-T / gap);
      miss = Math.max(0, pMissBase - primary);
    } else if (s === "lsn") {
      miss = 0;
      extra = pMissBase > 0.01 ? L * 1000 : 0;
    }
    return {
      metrics: { missRate: miss, primaryShare: primary, extraP99Ms: extra },
      readouts: [
        { label: "Reads that miss the user's own write", value: miss, fmt: "pct", tone: miss > 0.005 ? "alert" : miss > 0.0005 ? "warn" : "ok" },
        { label: "Reads sent to the primary", value: primary, fmt: "pct", tone: primary > 0.1 ? "warn" : "ok" },
        { label: "Added p99 read latency", value: extra, fmt: "ms", tone: extra > 300 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.12, bars: [{ label: "Stale own-write reads", value: miss, tone: miss > 0.005 ? "alert" : "ok" }, { label: "Primary read share", value: Math.min(primary, 0.12), tone: primary > 0.1 ? "warn" : "info", sub: primary > 0.12 ? `${(primary * 100).toFixed(0)}% (off scale)` : undefined }] },
      notes: [s === "replica" ? "A user saves a post and refreshes: the replica may not have it yet, so it seems to have vanished." : s === "pin" ? "Right after a write the user reads from the primary; later reads go back to replicas." : "The read waits for the replica to reach the user's last write, trading latency for correctness."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "strategy") === "replica" && out.metrics.missRate! > 0.005) ev.push("stale-seen");
    if (str(v, "strategy") === "pin") ev.push("pinned");
    return ev;
  },
  scene: (n): SceneOut => (n === "stale" ? { set: { strategy: "replica", lagMs: 2000 }, focus: ["lagMs"] } : n === "pin" ? { set: { strategy: "pin", pinS: 3 }, focus: ["strategy", "pinS"] } : n === "lsn" ? { set: { strategy: "lsn" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ failover timing

export const failoverLab: LabModel = {
  id: "failover-lab",
  metrics: ["downtimeS", "falseFailovers", "splitBrains", "detectS"],
  observes: ["too-eager", "fenced"],
  scenes: ["detect", "false", "fence"],
  runLabel: "Set the failover rules",
  honest: [
    "The primary is declared dead after `missed` consecutive heartbeats, spaced `interval` seconds apart. Real health checks add network and scheduling noise.",
    "Pauses on healthy primaries (long GC, a busy disk, a network blip) are lognormal with a 0.5 s median and an 8 s 99th percentile, 200 times a month. Any pause longer than the detection time triggers a needless failover.",
    "After detection there are about 2 s of leader election and 4 s of promotion. Clients then reconnect: 1 s through a proxy that knows the new primary, 30 s waiting for a DNS TTL.",
    "A needless failover while the old primary is still running creates two primaries (split brain) unless the old one is fenced off. Fencing is assumed to work 99% of the time.",
  ],
  init: () => ({ interval: 2, missed: 3, proxy: false, fencing: false }),
  controls: () => [
    { kind: "slider", id: "interval", label: "Heartbeat interval", min: 0.5, max: 10, step: 0.5, fmt: "s" },
    { kind: "slider", id: "missed", label: "Missed heartbeats before failing over", min: 1, max: 10, step: 1, fmt: "int" },
    { kind: "toggle", id: "proxy", label: "Connection proxy that follows the new primary", detail: "Clients reconnect in about 1 s instead of waiting for DNS" },
    { kind: "toggle", id: "fencing", label: "Fence the old primary before promoting", detail: "Cut its storage or network access so it cannot accept writes" },
  ],
  evaluate: (v) => {
    const detect = num(v, "interval") * num(v, "missed");
    const down = detect + 2 + 4 + (bool(v, "proxy") ? 1 : 30);
    const ln = lognormal(0.5, 8);
    const falseN = 200 * (1 - ln.cdf(detect));
    const split = falseN * (bool(v, "fencing") ? 0.01 : 1);
    const xs = sweep(1, 40, 24, true);
    return {
      metrics: { downtimeS: down, falseFailovers: falseN, splitBrains: split, detectS: detect },
      readouts: [
        { label: "Downtime after a real failure", value: down, fmt: "s", tone: down > 60 ? "alert" : down > 30 ? "warn" : "ok" },
        { label: "Needless failovers per month", value: falseN, fmt: "num", tone: falseN > 1 ? "alert" : falseN > 0.2 ? "warn" : "ok" },
        { label: "Split-brain incidents per month", value: split, fmt: "num", tone: split > 0.05 ? "alert" : "ok" },
        { label: "Time to decide the primary is dead", value: detect, fmt: "s" },
      ],
      view: { kind: "curve", xLabel: "time to declare the primary dead", yLabel: "per month / seconds", xFmt: "s", yFmt: "num", xLog: true, yLog: true, series: [{ id: "down", label: "Downtime of a real failure (s)", tone: "alert", points: xs.map((x) => [x, x + 7 + (bool(v, "proxy") ? 1 : 30)] as [number, number]) }, { id: "false", label: "Needless failovers a month", tone: "warn", points: xs.map((x) => [x, Math.max(0.001, 200 * (1 - ln.cdf(x)))] as [number, number]) }], marker: { x: detect, y: Math.max(0.001, falseN), label: `${detect}s`, tone: "amber" } },
      notes: [detect < 4 ? "A short timeout recovers fast and also fails over on every long pause." : detect > 20 ? "A long timeout almost never fails over by mistake, and every real failure waits it out." : "A middle path: a few seconds of patience filters out most pauses."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.falseFailovers! > 3) ev.push("too-eager");
    if (bool(v, "fencing")) ev.push("fenced");
    return ev;
  },
  scene: (n): SceneOut => (n === "detect" ? { set: { interval: 2, missed: 3 }, focus: ["interval", "missed"] } : n === "false" ? { set: { interval: 1, missed: 2 }, focus: ["missed"] } : n === "fence" ? { set: { fencing: true }, focus: ["fencing"] } : undefined),
};

// ------------------------------------------------------------------ multi-leader conflicts

export const multiLab: LabModel = {
  id: "multi-lab",
  metrics: ["conflictsPerDay", "lostWritesPerDay", "remoteWriteMs", "mergeComplexity"],
  observes: ["conflicts-seen", "merged"],
  scenes: ["conflict", "lww", "merge"],
  runLabel: "Choose the conflict rule",
  honest: [
    "A conflict is two regions writing the same item within the replication delay of each other. With per-region write rates λ per item per second and delay Δ, conflicts per item per second are about 2λ²Δ per pair of regions.",
    "Last-writer-wins keeps one write and silently drops the other. A merge (a CRDT or an application rule) keeps both but is real engineering. A home region per item removes conflicts by sending every write to one place, which costs remote users the round trip.",
    "The lab uses 10,000 shared items, 50 writes a day per region per item, and a 150 ms round trip between regions.",
  ],
  init: () => ({ regions: 3, strategy: "lww", hotShare: 1 }),
  controls: () => [
    { kind: "slider", id: "regions", label: "Regions that accept writes", min: 2, max: 5, step: 1, fmt: "int" },
    { kind: "choice", id: "strategy", label: "Conflict rule", options: [{ id: "lww", label: "Last writer wins", detail: "Keep the write with the later timestamp" }, { id: "merge", label: "Merge (CRDT or custom)", detail: "Combine both writes" }, { id: "home", label: "Home region per item", detail: "All writes for an item go to one region" }] },
  ],
  evaluate: (v) => {
    const R = Math.round(num(v, "regions"));
    const items = 10000;
    const lambda = 50 / 86400;
    const delay = 0.15;
    const pairs = (R * (R - 1)) / 2;
    const conflicts = items * pairs * 2 * lambda * lambda * delay * 86400;
    const s = str(v, "strategy");
    const lost = s === "lww" ? conflicts : 0;
    const eff = s === "home" ? 0 : conflicts;
    const remote = s === "home" ? 150 * ((R - 1) / R) + 5 : 5;
    const complexity = s === "merge" ? 3 : s === "home" ? 1 : 0;
    return {
      metrics: { conflictsPerDay: eff, lostWritesPerDay: lost, remoteWriteMs: remote, mergeComplexity: complexity },
      readouts: [
        { label: "Conflicting writes per day", value: eff, fmt: "int", tone: eff > 0 ? "warn" : "ok" },
        { label: "Writes silently lost per day", value: lost, fmt: "int", tone: lost > 0 ? "alert" : "ok" },
        { label: "Average write latency", value: remote, fmt: "ms", tone: remote > 50 ? "alert" : remote > 20 ? "warn" : "ok" },
        { label: "Engineering cost", value: ["none", "a routing table", "", "a merge function per data type"][complexity] || "none" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Conflicts per day", value: eff, tone: eff > 0 ? "warn" : "ok" }, { label: "Lost writes per day", value: lost, tone: lost > 0 ? "alert" : "ok" }, { label: "Average write latency (ms)", value: remote, tone: remote > 50 ? "alert" : "ok" }] },
      notes: [s === "lww" ? "Every conflict silently discards someone's edit." : s === "merge" ? "Both edits survive, merged by a rule the application defines." : "No conflicts, because only the home region ever writes an item, and every other region pays the distance."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.conflictsPerDay! > 0 && str(v, "strategy") === "lww") ev.push("conflicts-seen");
    if (str(v, "strategy") === "merge") ev.push("merged");
    return ev;
  },
  scene: (n): SceneOut => (n === "conflict" ? { set: { strategy: "lww", regions: 3 }, focus: ["regions"] } : n === "lww" ? { set: { strategy: "lww" }, focus: ["strategy"] } : n === "merge" ? { set: { strategy: "merge" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ quorums

export function orderStat(n: number, k: number, q: number, median: number, p99: number): number {
  const ln = lognormal(median, p99);
  // The k-th fastest of n iid replicas is <= x when at least k of them are <= x.
  return bisect((x) => binomAtLeast(n, k, ln.cdf(x)), q, 0, 5);
}

export const quorumLab: LabModel = {
  id: "quorum-lab",
  metrics: ["consistent", "staleProb", "writeAvail", "readAvail", "writeP99", "readP99"],
  observes: ["overlap", "overlap-broken"],
  scenes: ["overlap", "tradeoff", "sloppy"],
  runLabel: "Set the quorums",
  honest: [
    "Replicas fail independently with probability 1% at any moment. Replica latencies are independent lognormals with a 5 ms median and 40 ms 99th percentile. A write waits for the W fastest acknowledgements and a read for the R fastest responses.",
    "If R + W > N the read set and write set must overlap in at least one replica, so a read sees the latest acknowledged write (given a way to pick the newest). Otherwise a read can miss it: the chance is C(N − W, R) ÷ C(N, R).",
    "Real systems add hinted handoff, read repair, and clock questions that this lab ignores.",
  ],
  init: (c) => ({ n: (c as { n?: number }).n ?? 3, w: 2, r: 2 }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "Replicas (N)", min: 1, max: 9, step: 1, fmt: "int" });
    out.push({ kind: "slider", id: "w", label: "Write quorum (W)", min: 1, max: 9, step: 1, fmt: "int" }, { kind: "slider", id: "r", label: "Read quorum (R)", min: 1, max: 9, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const N = Math.round(num(v, "n"));
    const W = Math.min(N, Math.round(num(v, "w")));
    const R = Math.min(N, Math.round(num(v, "r")));
    const consistent = R + W > N ? 1 : 0;
    const stale = consistent ? 0 : choose(N - W, R) / choose(N, R);
    const up = 0.99;
    const wa = binomAtLeast(N, W, up);
    const ra = binomAtLeast(N, R, up);
    const wp = orderStat(N, W, 0.99, 0.005, 0.04);
    const rp = orderStat(N, R, 0.99, 0.005, 0.04);
    const cells = Array.from({ length: N }, (_, i) => ({ label: `${i + 1}`, tone: (i < W && i < R ? "ok" : i < W ? "info" : i < R ? "warn" : "muted") as Tone, title: `replica ${i + 1}` }));
    return {
      metrics: { consistent, staleProb: stale, writeAvail: wa, readAvail: ra, writeP99: wp, readP99: rp },
      readouts: [
        { label: "Reads always see the latest write", value: consistent ? "yes" : "no", tone: consistent ? "ok" : "alert", sub: `R + W = ${R + W}, N = ${N}` },
        { label: "Chance a read misses a write", value: stale, fmt: "pct", tone: stale > 0.01 ? "alert" : "ok" },
        { label: "Writes available", value: wa, fmt: "pct", sub: "with 1% of replicas down" },
        { label: "Reads available", value: ra, fmt: "pct" },
        { label: "Write p99", value: wp, fmt: "s" },
        { label: "Read p99", value: rp, fmt: "s" },
      ],
      view: { kind: "grid", cols: Math.max(N, 3), cells, caption: `A write goes to ${W} of ${N} replicas, a read asks ${R}. Blue replicas got the write, amber ones are asked by a read, green ones are both.`, legend: [{ tone: "info", label: "write quorum" }, { tone: "warn", label: "read quorum" }, { tone: "ok", label: "overlap" }] },
      notes: [consistent ? "Every read quorum includes at least one replica that holds the latest write." : "A read can land entirely on replicas the write did not reach."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.consistent === 1) ev.push("overlap");
    if (out.metrics.consistent === 0) ev.push("overlap-broken");
    return ev;
  },
  scene: (n): SceneOut => (n === "overlap" ? { set: { n: 5, w: 3, r: 3 }, focus: ["w", "r"] } : n === "tradeoff" ? { set: { n: 5, w: 5, r: 1 }, focus: ["w", "r"] } : n === "sloppy" ? { set: { n: 5, w: 1, r: 1 }, focus: ["w", "r"] } : undefined),
};

// ------------------------------------------------------------------ boss: the primary goes down

export const primaryLab: LabModel = {
  id: "primary-lab",
  metrics: ["downtimeS", "lostWrites", "staleRate", "commitMs", "falseFailovers", "costPerMonth"],
  observes: [],
  scenes: [],
  runLabel: "Kill the primary",
  honest: [
    "Four simplified models run together: synchronous or asynchronous commits, failover timers, read-your-writes policy, and the monthly cost of replicas. The primary dies once, 2,000 writes a second are in flight, and lag is 120 ms.",
    "A semi-synchronous replica in the primary's zone survives the primary's failure with no lost writes; asynchronous commits lose the writes still in flight.",
    "Replicas cost $300 a month each; a connection proxy $60.",
  ],
  init: () => ({ replicas: 1, commit: "async", interval: 2, missed: 3, proxy: false, fencing: false, reads: "replica" }),
  controls: () => [
    { kind: "slider", id: "replicas", label: "Replicas", min: 1, max: 4, step: 1, fmt: "int" },
    { kind: "choice", id: "commit", label: "Commit rule", options: [{ id: "async", label: "Asynchronous" }, { id: "semi", label: "Wait for one replica in the same zone" }, { id: "sync", label: "Wait for every replica" }] },
    { kind: "slider", id: "interval", label: "Heartbeat interval", min: 0.5, max: 10, step: 0.5, fmt: "s" },
    { kind: "slider", id: "missed", label: "Missed heartbeats before failing over", min: 1, max: 10, step: 1, fmt: "int" },
    { kind: "toggle", id: "proxy", label: "Connection proxy ($60 a month)" },
    { kind: "toggle", id: "fencing", label: "Fence the old primary" },
    { kind: "choice", id: "reads", label: "Reads right after a user writes", options: [{ id: "replica", label: "Go to a replica" }, { id: "pin", label: "Pinned to the primary for 2 seconds" }] },
  ],
  evaluate: (v) => {
    const detect = num(v, "interval") * num(v, "missed");
    const down = detect + 6 + (bool(v, "proxy") ? 1 : 30);
    const ln = lognormal(0.5, 8);
    const falseN = 200 * (1 - ln.cdf(detect)) * (bool(v, "fencing") ? 0.01 : 1);
    const lost = str(v, "commit") === "async" ? 2000 * 0.12 : 0;
    const stale = str(v, "reads") === "replica" ? 0.017 : 0;
    const commit = 3 + (str(v, "commit") === "async" ? 0 : str(v, "commit") === "semi" ? 1 : 1 + 12 * (Math.round(num(v, "replicas")) - 1));
    const cost = 300 * (1 + Math.round(num(v, "replicas"))) + (bool(v, "proxy") ? 60 : 0);
    return {
      metrics: { downtimeS: down, lostWrites: lost, staleRate: stale, commitMs: commit, falseFailovers: falseN, costPerMonth: cost },
      readouts: [
        { label: "Downtime", value: down, fmt: "s", tone: down > 30 ? "alert" : "ok" },
        { label: "Writes lost", value: lost, fmt: "int", tone: lost > 0 ? "alert" : "ok" },
        { label: "Reads missing own write", value: stale, fmt: "pct", tone: stale > 0.001 ? "alert" : "ok" },
        { label: "Commit latency", value: commit, fmt: "ms", tone: commit > 10 ? "alert" : "ok" },
        { label: "Needless failovers a month", value: falseN, fmt: "num", tone: falseN > 0.5 ? "alert" : "ok" },
        { label: "Monthly cost", value: cost, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Downtime (s)", value: down, tone: down > 30 ? "alert" : "ok" }, { label: "Writes lost", value: lost, tone: lost > 0 ? "alert" : "ok" }, { label: "Commit latency (ms)", value: commit, tone: commit > 10 ? "alert" : "ok" }] },
      notes: [],
    };
  },
};

export const A6_MODELS: LabModel[] = [replLab, syncLab, lagLab, failoverLab, multiLab, quorumLab, primaryLab];
