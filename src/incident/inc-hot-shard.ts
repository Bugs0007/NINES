/**
 * INC-0006 · Shard 7 Is on Fire.
 *
 * Accounts are spread over eight shards by a hash of the account id: a good hash, evenly loaded all week. At 18:00 an
 * account with 40 million followers posted a giveaway. Every reader asks for that one account's page, all of them hash
 * to shard-7, and shard-7 alone is far past capacity while the other seven sit at 12%.
 * Red herrings: a rebalancing job ran last night and shard-7's host showed CPU steal once.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const SHARDS = ["shard-7", "shard-1", "shard-2", "shard-3", "shard-4", "shard-5", "shard-6", "shard-0"];

function shard(id: string): ServerSpec {
  return { kind: "db", id, label: id, cores: 4, workers: 8, queueLimit: 40, steps: [{ kind: "io", dist: { kind: "lognormal", median: 0.02, p99: 0.08 } }], bootS: 30 };
}

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "everyone else", target: "lb", rate: { kind: "const", rps: 400 }, users: 100000, timeoutS: 3 },
      { kind: "client", id: "fans", label: "readers of one account", target: "lb", rate: { kind: "const", rps: 700 }, users: 1, timeoutS: 3 },
      { kind: "lb", id: "lb", label: "shard router (hash of account id)", targets: SHARDS, algorithm: "sticky", overhead: { kind: "const", value: 0.0002 } },
      ...SHARDS.map(shard),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -43200, host: "ops", source: "cron", level: "INFO", text: "rebalance-shards: moved 14,022 accounts from shard-3 to shard-5 (variance 4.1% -> 1.8%)", evidence: "rebalance" },
  { t: -5400, host: "shard-7", source: "app", level: "WARN", text: "host i-0a72e1: cpu steal 6% for 40 s (neighbour on shared tenancy), cleared", evidence: "steal" },
  { t: -1800, host: "web-1", source: "app", level: "INFO", text: "feed: account 9201 (@runwithmira, 40.2M followers) posted giveaway; fan-out reads begin", evidence: "celebrity" },
  { t: -600, host: "shard-7", source: "postgres", level: "WARN", text: "LOG:  8/8 connections active, 40 queued; 9,310 queries for account_id=9201 in last 10 s", evidence: "hot-key" },
  { t: -300, host: "router", source: "app", level: "WARN", text: "route stats (60 s): shard-7 63.4% of requests; shards 0-6 4.6% each", evidence: "skew" },
  { t: -120, host: "web-2", source: "app", level: "ERROR", text: "GET /account/9201 503 shard-7 queue full (40/40)", evidence: "hot-key" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failed > 0) out.push({ t: w.t + rand(), host: "web-" + (1 + Math.floor(rand() * 3)), source: "app", level: "ERROR", text: "GET /account/9201 503 shard-7 queue full (40/40)", evidence: "hot-key" });
  if (Math.floor(w.t) % 5 === 0) out.push({ t: w.t + 0.5, host: "router", source: "app", level: "WARN", text: "route stats (10 s): shard-7 63% of requests; shards 0-6 5% each", evidence: "skew" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const INC_HOT_SHARD: Incident = {
  id: "inc-hot-shard",
  code: "INC-0006",
  title: "Shard 7 Is on Fire",
  severity: "SEV-2",
  clock0: "18:30:00",
  pageAt: 90,
  page: { title: "Account pages failing for 40% of requests", detail: "One shard is at 100% and dropping requests. The other seven are at about 12%." },
  intro: [
    { speaker: "pager", line: "SEV-2: shard-7 has been saturated for five minutes. Total capacity is fine. One shard is not." },
    { speaker: "meera", line: "Seven shards are bored and one is burning. A good hash can still make that happen. What is being asked for?" },
  ],
  spec: spec(),
  seed: "inc-hot-shard",
  service: "account pages",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "The hot account is modelled as a second client population whose every request carries the same account id, which hash-routes to one shard. Real traffic would have a long tail of popular accounts rather than a single one.",
    "Edge caching the hot page is shown as an immediate 98% cut in the reads reaching the shards; a real cache needs a warm-up and a short TTL for freshness.",
  ],
  hosts: ["router", "web-1", ...SHARDS],
  services: ["router", ...SHARDS],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("shards", SHARDS, (id, nw) => (id === "shard-7" && nw.workerUtil > 0.9 ? "skew" : undefined), {
    nodes: [
      { id: "users", label: "readers", kind: "client", x: 60, y: 300 },
      { id: "lb", label: "shard router", kind: "lb", x: 300, y: 300 },
      ...SHARDS.map((id, i) => ({ id, label: id, kind: "db" as const, x: 700, y: 60 + i * 70 })),
    ],
    edges: [{ from: "users", to: "lb" }, ...SHARDS.map((id) => ({ from: "lb", to: id }))],
  }),
  commands: [
    {
      cmd: "router-stats --by shard --window 60s",
      describe: "share of requests per shard",
      run: (h, s) => ({ out: has(s, "edge-cache", "rate-limit") ? "shard-0..6: 12.5% each\nshard-7: 12.8%\n(hot account served at the edge)" : "shard-7  63.4%\nshard-0  4.6%\nshard-1  4.6%\nshard-2  4.6%\nshard-3  4.6%\nshard-4  4.6%\nshard-5  4.6%\nshard-6  4.6%", evidence: has(s, "edge-cache", "rate-limit") ? undefined : "skew" }),
    },
    {
      cmd: "router-stats --top-keys --shard 7",
      describe: "hottest keys on shard-7",
      run: (h, s) => ({ out: has(s, "edge-cache", "rate-limit") ? "account 9201: 2.1% of shard-7 reads" : "account 9201   93.7% of shard-7 reads (9,310 in 10 s)\naccount 140212   0.1%\naccount 88801    0.1%", evidence: has(s, "edge-cache", "rate-limit") ? undefined : "hot-key" }),
    },
    { cmd: "mpstat 1 1", describe: "CPU on this host", run: (h) => ({ out: h === "shard-7" ? "%usr 41.0  %sys 6.0  %steal 0.0  %iowait 38.0  %idle 15.0\n(disk-bound: 8 of 8 connections waiting on the same few rows)" : "%usr 5.0  %sys 1.0  %steal 0.0  %iowait 4.0  %idle 90.0", evidence: undefined }) },
    { cmd: "shardctl map --account 9201", describe: "which shard owns the account", run: () => ({ out: "account 9201 -> hash 0x6ac1d9 mod 8 = 7 -> shard-7\n(hash function unchanged since launch; distribution of ids is uniform)", evidence: "celebrity" }) },
    uptime((h) => (h === "shard-7" ? 7.9 : 0.6)),
    free(() => 3600),
    df(),
  ],
  evidence: [
    { id: "hot-key", label: "One account accounts for 94% of reads on shard-7", key: true },
    { id: "skew", label: "Shard-7 takes 63% of requests; each other shard takes about 5%", key: true },
    { id: "celebrity", label: "A 40M-follower account posted a giveaway at 18:00", key: true },
    { id: "rebalance", label: "Accounts were rebalanced between shards last night", key: false },
    { id: "steal", label: "Shard-7's host had a brief CPU steal spike earlier", key: false },
  ],
  hypotheses: [
    { id: "hot", label: "One extremely popular account hashes to a single shard, so all reads for it hit that shard no matter how many shards exist", correct: true },
    { id: "hash", label: "The hash function is broken and distributes accounts unevenly", correct: false },
    { id: "host", label: "Shard-7's host is degraded (noisy neighbour)", correct: false },
    { id: "rebalance", label: "Last night's rebalance put too many accounts on shard-7", correct: false },
    { id: "capacity", label: "The cluster as a whole is out of capacity", correct: false },
  ],
  mitigations: [
    {
      id: "edge-cache",
      label: "Cache the hot account's page at the edge for 30 seconds",
      detail: "One cache entry takes the load that eight workers could not.",
      takesS: 30,
      kind: "fix",
      patches: () => [{ delay: 30, patch: { op: "set", node: "fans", changes: { rateScale: 0.02 } } }],
      note: "cache-control: public, max-age=30 for /account/9201 at the CDN. Shard-7 sees the hot page once per edge location every 30 s.",
    },
    {
      id: "rate-limit",
      label: "Rate-limit reads of that account to 150 per second",
      detail: "Sheds the excess with a 429 and protects the shard.",
      takesS: 15,
      kind: "mitigate",
      patches: () => [{ delay: 15, patch: { op: "set", node: "fans", changes: { rateScale: 0.15 } } }],
      note: "router: per-account limit 150 rps for account 9201. Excess readers receive 429 with Retry-After (counted here as served by the limiter).",
    },
    {
      id: "bigger-shard",
      label: "Move shard-7 to a larger instance",
      detail: "Triple the connections and cores for one shard.",
      takesS: 90,
      kind: "mitigate",
      patches: () => [{ delay: 90, patch: { op: "set", node: "shard-7", changes: { workers: 32, cores: 16, queueLimit: 200 } } }],
      note: "shard-7 failed over to an r6g.4xlarge replica (32 connections). It works, and costs a large instance for one account.",
    },
    {
      ...decoy("add-shards", "Add eight more shards (8 → 16)", "Spread accounts over more machines.", "Eight shards provisioned; migrating accounts takes hours. The hot account still hashes to exactly one shard.", 30, "harmful"),
      patches: () => SHARDS.map((id, i) => ({ delay: 30, patch: { op: "launch" as const, spec: shard("shard-n" + i), lb: "lb", bootS: 30 } })),
    },
    decoy("rerun-rebalance", "Rerun the rebalance job", "Move accounts off shard-7.", "Rebalance finished: 120 small accounts moved. The hot account cannot be split by moving it.", 120),
    decoy("move-host", "Move shard-7 to a different host", "Fail over to the standby host.", "Failover complete in 40 s. Same data, same hot account, same load.", 60),
    decoy("restart-shard", "Restart shard-7", "Postgres restart.", "shard-7 restarted. The queue refilled within five seconds.", 20),
  ],
  traces: [
    {
      id: "hot",
      title: "GET /account/9201 · 503 · web-2",
      status: 503,
      evidence: "hot-key",
      spans: [
        { name: "web-2 handler", start: 0, ms: 3000, depth: 0, kind: "cpu" },
        { name: "shard router: hash(9201) mod 8 = 7", start: 2, ms: 1, depth: 1, kind: "net" },
        { name: "shard-7: queue full (8/8 active, 40 waiting)", start: 3, ms: 2990, depth: 1, kind: "queue" },
      ],
    },
    {
      id: "other",
      title: "GET /account/140212 · 200 · web-1",
      status: 200,
      spans: [
        { name: "web-1 handler", start: 0, ms: 26, depth: 0, kind: "cpu" },
        { name: "shard router: hash(140212) mod 8 = 3", start: 2, ms: 1, depth: 1, kind: "net" },
        { name: "shard-3: SELECT … WHERE account_id = 140212", start: 3, ms: 21, depth: 1, kind: "db" },
      ],
    },
  ],
  timeline: [
    { t: -43200, label: "rebalance job moves 14k accounts", kind: "cron" },
    { t: -5400, label: "CPU steal blip on shard-7's host", kind: "scale" },
    { t: -1800, label: "@runwithmira posts a giveaway", kind: "deploy" },
    { t: 90, label: "Page: account pages 40% errors", kind: "page" },
  ],
  extraSeries: [{ id: "shard7-share", label: "Share of requests on shard-7", unit: "%", at: (t) => (t < -1800 ? 12.5 : 63) }],
  evidenceVia: ["hot-key", "skew", "celebrity"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: about 40% of account page requests failing for the readers of one account and anyone on its shard, for how long" },
      { id: "cause", criterion: "Root cause: one account got far more reads than a shard can carry; hash sharding sends every read for one key to one shard, so adding capacity elsewhere does not help" },
      { id: "detect", criterion: "Why it looked odd: cluster capacity was plenty and the hash was fine; the skew was in the keys, visible only per shard and per key" },
      { id: "prevent", criterion: "Prevention: cache or replicate hot keys, per-key rate limits, hot-key detection and alerts, splitting a hot key across replicas or suffix-sharding it" },
      { id: "mitigate", criterion: "States what worked (edge cache or limit) and why adding shards or restarting did not" },
    ],
    exemplar:
      "What happened: From 18:31 to about 18:36, 40% of account page requests failed. Root cause: a 40-million-follower account posted a giveaway, and every read for that account hashes to shard-7, which can serve about 400 reads a second against roughly 700 arriving. The hash and the rebalance were fine; the key distribution was the problem. Mitigation: caching the hot page at the edge for 30 seconds took 98% of those reads off the shard. Adding shards would not have helped because one key maps to one shard. Prevention: detect hot keys from router stats, cache or replicate them, rate-limit per key, and know which keys can spike.",
  },
  hints: [
    "Total capacity is plenty. What is different about shard-7 compared with the other seven?",
    "Ask the router which keys land on shard-7, not just how many requests.",
    "If more shards will not help, what makes one key cost less to serve?",
  ],
  exercises: ["hot-partitions"],
};
