/**
 * Chapter A7 "Split" models: sharding strategies, shard keys, hot partitions, consistent hashing (a real hash
 * ring over 20,000 keys), and rebalancing. The ring and the mod-N comparison are simulated exactly with seeded
 * hashing; the others are explicit closed forms with labelled round constants.
 */
import { Rng } from "../../../engine/rng";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ sharding strategies

const STRATS = {
  range: { label: "Range: split the key space into contiguous ranges" },
  hash: { label: "Hash: spread keys by a hash of the key" },
  compound: { label: "Compound: hash the first part, range on the second" },
  directory: { label: "Directory: a lookup table says where each key lives" },
};

export const shardLab: LabModel = {
  id: "shard-lab",
  metrics: ["maxShare", "deviceRangeFanout", "allRangeFanout", "metaCost"],
  observes: ["hot-tail", "scattered"],
  scenes: ["range", "hash", "compound"],
  runLabel: "Set the sharding scheme",
  honest: [
    "Eight shards. A time-series workload writes sensor readings with keys that increase with time, so range sharding sends every write to the shard holding the newest range. A user workload has uniformly spread keys.",
    "Hash sharding spreads writes evenly but scatters ranges across all shards. A compound key hashes the device and orders by time inside each device, so one device's recent readings are on one shard and writes stay balanced.",
    "A directory can place keys anywhere and rebalance freely, at the cost of a lookup service that is itself on the critical path.",
  ],
  init: (c) => ({ strategy: "range", shards: 8, workload: (c as { workload?: string }).workload ?? "timeseries" }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "strategy", label: "Sharding scheme", options: Object.entries(STRATS).map(([id, s]) => ({ id, label: s.label })) }, { kind: "slider", id: "shards", label: "Shards", min: 2, max: 32, step: 1, fmt: "int" }];
    if (!(c as { lockWorkload?: boolean }).lockWorkload) out.push({ kind: "choice", id: "workload", label: "Workload", options: [{ id: "timeseries", label: "Sensor readings: keys grow with time" }, { id: "users", label: "User records: keys spread evenly" }] });
    return out;
  },
  evaluate: (v) => {
    const N = Math.round(num(v, "shards"));
    const s = str(v, "strategy");
    const ts = str(v, "workload") === "timeseries";
    // Share of writes on each shard.
    const shares = Array.from({ length: N }, (_, i) => (s === "range" && ts ? (i === N - 1 ? 1 : 0) : 1 / N));
    const maxShare = Math.max(...shares);
    // Shards touched by "one device, last hour" and by "all devices, last hour".
    const devFan = s === "hash" && ts ? N : s === "directory" ? 2 : 1;
    const allFan = s === "range" ? (ts ? 1 : N) : s === "directory" ? Math.ceil(N / 2) : N;
    const meta = s === "directory" ? 3 : s === "compound" ? 1 : 0;
    return {
      metrics: { maxShare, deviceRangeFanout: devFan, allRangeFanout: allFan, metaCost: meta },
      readouts: [
        { label: "Busiest shard's share of writes", value: maxShare, fmt: "pct", tone: maxShare > 0.3 ? "alert" : maxShare > 0.2 ? "warn" : "ok", sub: `fair share ${(100 / N).toFixed(0)}%` },
        { label: "Shards touched: one device's last hour", value: devFan, fmt: "int", tone: devFan > 2 ? "alert" : "ok" },
        { label: "Shards touched: all devices' last hour", value: allFan, fmt: "int", sub: "rare, analytic" },
        { label: "Extra moving parts", value: ["none", "a key encoding", "", "a directory service"][meta] || "none" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: shares.map((x, i) => ({ label: `shard ${i + 1}`, value: x, tone: x > 0.3 ? ("alert" as Tone) : ("ok" as Tone) })) },
      notes: [s === "range" && ts ? "Every new reading has the newest timestamp, so all writes pile onto the last range." : s === "hash" ? "Hashing the whole key spreads writes evenly and scatters time ranges across every shard." : s === "compound" ? "Writes spread by device, and each device's time range stays together." : s === "directory" ? "Anything is possible, as long as the lookup service is fast and always right." : "Ranges keep neighbours together, which is great for scans and terrible for sequential writes."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.maxShare! > 0.9) ev.push("hot-tail");
    if (str(v, "strategy") === "hash" && out.metrics.deviceRangeFanout! > 4) ev.push("scattered");
    return ev;
  },
  scene: (n): SceneOut => (n === "range" ? { set: { strategy: "range", workload: "timeseries" }, focus: ["strategy"] } : n === "hash" ? { set: { strategy: "hash" }, focus: ["strategy"] } : n === "compound" ? { set: { strategy: "compound" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ shard keys

const KEYS: Record<string, { label: string; balance: number; conv: number; inbox: number; hot: number; note: string }> = {
  user: { label: "user_id", balance: 0.9, conv: 0.2, inbox: 1, hot: 0.1, note: "A user's data stays together. A conversation's messages scatter across its members' shards." },
  conv: { label: "conversation_id", balance: 0.75, conv: 1, inbox: 0.1, hot: 0.4, note: "A conversation's messages stay together. A user's inbox scatters across every chat they are in. Huge group chats are hot." },
  message: { label: "message_id (hashed)", balance: 1, conv: 0.1, inbox: 0.1, hot: 0, note: "Perfectly even, and almost every read touches many shards." },
  created: { label: "created_at", balance: 0.05, conv: 0.1, inbox: 0.1, hot: 1, note: "All new writes land on the newest range." },
  country: { label: "country", balance: 0.3, conv: 0.2, inbox: 0.8, hot: 0.7, note: "Few distinct values and very uneven sizes: huge shards for large countries." },
};

export const shardkeyLab: LabModel = {
  id: "shardkey-lab",
  metrics: ["balance", "singleShardReads", "writeAmp", "hotRisk"],
  observes: ["key-picked", "copy-on"],
  scenes: ["key", "copy", "bad"],
  runLabel: "Choose the shard key",
  honest: [
    "A messaging app. 70% of reads fetch one conversation's recent messages and 30% load one user's inbox of recent chats. Each key is scored 0 to 1 for balance (how evenly it spreads writes) and for how often each query stays on one shard.",
    "The scores are judgements for a typical chat workload, not measurements: user_id keeps the inbox on one shard, conversation_id keeps the messages on one shard, and so on.",
    "A secondary copy, keyed for whichever read path the main key serves worse, makes that path single-shard too, at the price of writing every message twice and keeping the copies in step.",
  ],
  init: () => ({ key: "message", copy: false }),
  controls: () => [
    { kind: "choice", id: "key", label: "Shard key for the messages table", options: Object.entries(KEYS).map(([id, k]) => ({ id, label: k.label })) },
    { kind: "toggle", id: "copy", label: "Also keep a copy keyed the other way", detail: "Every write goes to both; the copy serves the path the main key serves worst" },
  ],
  evaluate: (v) => {
    const k = KEYS[str(v, "key")]!;
    const copy = bool(v, "copy");
    // A second copy makes whichever read path gains most single-shard.
    const gainConv = 0.7 * (1 - k.conv);
    const gainInbox = 0.3 * (1 - k.inbox);
    const convOne = copy && gainConv >= gainInbox ? 1 : k.conv;
    const inboxOne = copy && gainConv < gainInbox ? 1 : k.inbox;
    const single = 0.7 * convOne + 0.3 * inboxOne;
    const amp = copy ? 2 : 1;
    return {
      metrics: { balance: k.balance, singleShardReads: single, writeAmp: amp, hotRisk: k.hot },
      readouts: [
        { label: "How evenly writes spread", value: k.balance, fmt: "pct", tone: k.balance > 0.7 ? "ok" : k.balance > 0.4 ? "warn" : "alert" },
        { label: "Reads served by one shard", value: single, fmt: "pct", tone: single > 0.9 ? "ok" : single > 0.5 ? "warn" : "alert" },
        { label: "Writes per message", value: amp, fmt: "int", sub: copy ? "two copies" : "one copy" },
        { label: "Risk of hot keys", value: k.hot, fmt: "pct", tone: k.hot > 0.5 ? "alert" : k.hot > 0.2 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Even writes", value: k.balance, tone: "ok" }, { label: "Conversation reads on one shard", value: convOne, tone: "info" }, { label: "Inbox reads on one shard", value: inboxOne, tone: "info" }, { label: "Hot-key risk", value: k.hot, tone: k.hot > 0.5 ? "alert" : "warn" }] },
      notes: [k.note],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "key") !== "message") ev.push("key-picked");
    if (bool(v, "copy")) ev.push("copy-on");
    return ev;
  },
  scene: (n): SceneOut => (n === "key" ? { set: { key: "conv", copy: false }, focus: ["key"] } : n === "copy" ? { set: { key: "conv", copy: true }, focus: ["copy"] } : n === "bad" ? { set: { key: "created" }, focus: ["key"] } : undefined),
};

// ------------------------------------------------------------------ hot partitions

export const hotpartLab: LabModel = {
  id: "hotpart-lab",
  metrics: ["hotUtil", "avgUtil", "readFanout"],
  observes: ["hot-shard", "salted"],
  scenes: ["celebrity", "salt", "cache"],
  runLabel: "Relieve the hot shard",
  honest: [
    "160,000 requests a second over 16 shards that each handle 20,000. One key (a celebrity account) takes a share p of all traffic, and every other key is spread evenly by hash.",
    "Salting stores the hot key's data under S different suffixes, hashed to different shards, and spreads its reads and writes across them. Writes that need a total must be added up across the copies.",
    "A shared cache in front of the shards absorbs a fraction of the hot key's reads. The lab assumes 80% of its traffic is reads.",
  ],
  init: (c) => ({ p: (c as { p?: number }).p ?? 0.15, salt: 1, cache: false, shards: 16 }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockP?: boolean }).lockP) out.push({ kind: "slider", id: "p", label: "Share of all traffic taken by the hottest key", min: 0.001, max: 0.4, log: true, fmt: "pct" });
    out.push({ kind: "slider", id: "salt", label: "Copies of the hot key (salt buckets)", min: 1, max: 16, step: 1, fmt: "int" }, { kind: "toggle", id: "cache", label: "Cache the hot key's reads", detail: "Absorbs 80% of its traffic" });
    return out;
  },
  evaluate: (v) => {
    const N = Math.round(num(v, "shards"));
    const total = 160000;
    const cap = 20000;
    const p = num(v, "p");
    const S = Math.round(num(v, "salt"));
    const hotTraffic = p * total * (bool(v, "cache") ? 0.2 : 1);
    const base = ((1 - p) * total) / N;
    const loads = Array.from({ length: N }, (_, i) => base + (i < S ? hotTraffic / S : 0));
    const hot = Math.max(...loads) / cap;
    const avg = loads.reduce((a, b) => a + b, 0) / N / cap;
    return {
      metrics: { hotUtil: hot, avgUtil: avg, readFanout: S },
      readouts: [
        { label: "Busiest shard", value: hot, fmt: "pct", tone: hot > 1 ? "alert" : hot > 0.8 ? "warn" : "ok" },
        { label: "Average shard", value: avg, fmt: "pct" },
        { label: "Shards read to total the hot key", value: S, fmt: "int", sub: "salt buckets" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1.8, bars: loads.map((l, i) => ({ label: `shard ${i + 1}`, value: l / cap, tone: l / cap > 1 ? ("alert" as Tone) : l / cap > 0.8 ? ("warn" as Tone) : ("ok" as Tone) })), lines: [{ value: 1, label: "capacity", tone: "alert" }] },
      notes: [hot > 1 ? "One shard holds a key too hot for it, though the cluster as a whole has room." : "Load is spread so no shard is past its limit."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.hotUtil! > 1) ev.push("hot-shard");
    if (num(v, "salt") > 1) ev.push("salted");
    return ev;
  },
  scene: (n): SceneOut => (n === "celebrity" ? { set: { p: 0.15, salt: 1, cache: false }, focus: ["p"] } : n === "salt" ? { set: { salt: 4 }, focus: ["salt"] } : n === "cache" ? { set: { cache: true }, focus: ["cache"] } : undefined),
};

// ------------------------------------------------------------------ consistent hashing

const ringMemo = new Map<string, { imbalance: number; stdev: number; moved: number; modMoved: number; loads: number[] }>();

export function ringRun(nodes: number, vnodes: number) {
  const key = `${nodes}:${vnodes}`;
  const hit = ringMemo.get(key);
  if (hit) return hit;
  const K = 20000;
  const build = (n: number) => {
    const pts: { pos: number; node: number }[] = [];
    for (let i = 0; i < n; i++) {
      const r = new Rng(`ring-node-${i}`);
      for (let j = 0; j < vnodes; j++) pts.push({ pos: r.next(), node: i });
    }
    pts.sort((a, b) => a.pos - b.pos);
    return pts;
  };
  const keys: number[] = [];
  const kr = new Rng("ring-keys");
  for (let i = 0; i < K; i++) keys.push(kr.next());
  const owner = (pts: { pos: number; node: number }[], x: number) => {
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (pts[mid]!.pos < x) lo = mid + 1;
      else hi = mid;
    }
    return pts[lo % pts.length]!.node;
  };
  const a = build(nodes);
  const b = build(nodes + 1);
  const loads = new Array<number>(nodes).fill(0);
  let moved = 0;
  let modMoved = 0;
  for (const x of keys) {
    const o1 = owner(a, x);
    loads[o1]!++;
    if (owner(b, x) !== o1) moved++;
    const k32 = Math.floor(x * 4294967296);
    if (k32 % nodes !== k32 % (nodes + 1)) modMoved++;
  }
  const mean = K / nodes;
  const stdev = Math.sqrt(loads.reduce((s, l) => s + (l - mean) ** 2, 0) / nodes) / mean;
  const res = { imbalance: Math.max(...loads) / mean, stdev, moved: moved / K, modMoved: modMoved / K, loads: loads.map((l) => l / mean) };
  if (ringMemo.size > 400) ringMemo.clear();
  ringMemo.set(key, res);
  return res;
}

export const ringLab: LabModel = {
  id: "ring-lab",
  metrics: ["imbalance", "movedOnAdd", "stdev", "ringEntries"],
  observes: ["ring-on", "vnodes-added"],
  scenes: ["mod", "ring", "vnodes"],
  runLabel: "Deploy the ring",
  honest: [
    "20,000 keys with uniform random positions, hashed by a seeded generator, so the results are exact for this setup and repeatable. Node positions on the ring are random too.",
    "'Keys moved' is the share of keys whose owner changes when an additional node joins. With mod-N hashing, owner = hash mod N, so going from N to N+1 nodes reassigns almost every key.",
    "A real ring also weights nodes by capacity, replicates each key to the next nodes clockwise, and handles failures. The lab shows only placement.",
  ],
  init: () => ({ method: "mod", nodes: 10, vnodes: 1 }),
  controls: (c) => [
    { kind: "choice", id: "method", label: "How keys are assigned to nodes", options: [{ id: "mod", label: "hash(key) mod N" }, { id: "ring", label: "Consistent hashing ring" }] },
    ...((c as { lockNodes?: boolean }).lockNodes ? [] : [{ kind: "slider" as const, id: "nodes", label: "Nodes", min: 3, max: 30, step: 1, fmt: "int" as const }]),
    { kind: "slider", id: "vnodes", label: "Virtual nodes per server (ring only)", min: 1, max: 400, log: true, fmt: "int" },
  ],
  evaluate: (v) => {
    const n = Math.round(num(v, "nodes"));
    const vn = Math.round(num(v, "vnodes"));
    const r = ringRun(n, vn);
    const ring = str(v, "method") === "ring";
    const moved = ring ? r.moved : r.modMoved;
    const imb = ring ? r.imbalance : 1.03;
    return {
      metrics: { imbalance: imb, movedOnAdd: moved, stdev: ring ? r.stdev : 0.02, ringEntries: ring ? n * vn : n },
      readouts: [
        { label: "Keys moved when one node is added", value: moved, fmt: "pct", sub: `ideal ${(100 / (n + 1)).toFixed(0)}%`, tone: moved < 1.5 / (n + 1) ? "ok" : moved < 0.3 ? "warn" : "alert" },
        { label: "Busiest node vs the average", value: imb, fmt: "x", tone: imb < 1.15 ? "ok" : imb < 1.5 ? "warn" : "alert" },
        { label: "Spread of load (std dev)", value: ring ? r.stdev : 0.02, fmt: "pct" },
        { label: "Ring entries to keep sorted", value: ring ? n * vn : n, fmt: "int", sub: ring ? "nodes � virtual nodes" : "just the node list" },
      ],
      view: { kind: "bars", fmt: "x", max: Math.max(1.5, ring ? r.imbalance * 1.05 : 1.1), bars: (ring ? r.loads : Array.from({ length: n }, () => 1.0)).map((l, i) => ({ label: `node ${i + 1}`, value: l, tone: l > 1.3 ? ("alert" as Tone) : l > 1.15 ? ("warn" as Tone) : ("ok" as Tone) })), lines: [{ value: 1, label: "fair share", tone: "ok" }] },
      notes: [ring ? (vn < 20 ? "With few virtual nodes per server, random positions make some nodes own much more of the ring than others." : "Many virtual nodes smooth the ring: each server owns many small slices, so the shares even out.") : `Changing N from ${n} to ${n + 1} moves ${(moved * 100).toFixed(0)}% of keys, almost all of them.`],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "method") === "ring") ev.push("ring-on");
    if (str(v, "method") === "ring" && num(v, "vnodes") >= 50) ev.push("vnodes-added");
    return ev;
  },
  scene: (n): SceneOut => (n === "mod" ? { set: { method: "mod", nodes: 10 }, focus: ["method"] } : n === "ring" ? { set: { method: "ring", vnodes: 1 }, focus: ["method"] } : n === "vnodes" ? { set: { method: "ring", vnodes: 200 }, focus: ["vnodes"] } : undefined),
};

// ------------------------------------------------------------------ rebalancing

export const rebalanceLab: LabModel = {
  id: "rebalance-lab",
  metrics: ["hours", "p99Increase", "movedTB", "totalMBs"],
  observes: ["too-slow", "too-fast"],
  scenes: ["partitions", "throttle", "split"],
  runLabel: "Start the move",
  honest: [
    "A cluster of 10 nodes holds 40 TB; two new nodes are added, so each node should end up with 1 ÷ 12 of the data. With fixed partitions, whole partitions move, so about 2 ÷ 12 of the data, 6.7 TB, has to travel.",
    "Foreground latency suffers while the move uses disks and network: the lab adds 0.6 × (total move rate ÷ 1,000 MB/s)^1.5 to the p99, a convex curve chosen to show the shape, not a measurement.",
    "Real systems also pause moves during peak hours, move the least-loaded partitions first, and keep serving reads from the old copy until the new one is current.",
  ],
  init: () => ({ rate: 20, streams: 4 }),
  controls: () => [
    { kind: "slider", id: "rate", label: "Move rate per stream", min: 5, max: 400, log: true, fmt: "num", hint: "MB per second" },
    { kind: "slider", id: "streams", label: "Parallel streams", min: 1, max: 20, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const total = num(v, "rate") * Math.round(num(v, "streams"));
    const movedTB = (40 * 2) / 12;
    const hours = (movedTB * 1e6) / total / 3600;
    const p99 = 0.6 * Math.pow(total / 1000, 1.5);
    return {
      metrics: { hours, p99Increase: p99, movedTB, totalMBs: total },
      readouts: [
        { label: "Time to finish", value: hours, fmt: "num", sub: "hours", tone: hours > 8 ? "alert" : hours > 6 ? "warn" : "ok" },
        { label: "Added p99 latency during the move", value: p99, fmt: "pct", tone: p99 > 0.15 ? "alert" : p99 > 0.08 ? "warn" : "ok" },
        { label: "Data to move", value: movedTB, fmt: "num", sub: "TB" },
        { label: "Total move rate", value: total, fmt: "int", sub: "MB per second" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Hours to finish", value: hours, tone: hours > 8 ? "alert" : "ok" }, { label: "Added p99 (percent)", value: p99 * 100, tone: p99 > 0.15 ? "alert" : "ok" }] },
      notes: [hours > 8 ? "Slow enough that the cluster runs unbalanced, and exposed, for the whole day." : p99 > 0.15 ? "Fast, but users feel the move." : "Fast enough, and gentle enough."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.hours! > 12) ev.push("too-slow");
    if (out.metrics.p99Increase! > 0.3) ev.push("too-fast");
    return ev;
  },
  scene: (n): SceneOut => (n === "partitions" ? { set: { rate: 50, streams: 4 }, focus: [] } : n === "throttle" ? { set: { rate: 100, streams: 10 }, focus: ["rate", "streams"] } : n === "split" ? { set: { rate: 30, streams: 8 }, focus: ["streams"] } : undefined),
};

export const A7_MODELS: LabModel[] = [shardLab, shardkeyLab, hotpartLab, ringLab, rebalanceLab];
