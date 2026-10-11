/**
 * INC-0004 · Midnight Expiry.
 *
 * A config change at 23:41 moved the cache TTL into an environment variable. The value "2h" was parsed as the number 2,
 * and the cache library reads seconds. Entries now live two seconds, so the hit ratio falls from 80% to about 20% and
 * the database behind the cache gets four times the reads it was sized for. Traffic peaks at midnight; the pool fills,
 * requests queue, clients time out and retry, and the retries keep the queue full.
 * Red herrings: the nightly analytics job at 00:00 and a node upgrade on the cache host.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const APPS = ["app-1", "app-2"];

function spec(): SimSpec {
  const app = (id: string): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers: 64, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.004 } }, { kind: "call", target: "cache" }] });
  return {
    nodes: [
      {
        kind: "client",
        id: "users",
        target: "lb",
        rate: { kind: "const", rps: 450 },
        users: 20000,
        keys: { n: 100000, s: 0.99 },
        timeoutS: 3,
        retry: { maxAttempts: 3, backoff: "constant", baseS: 0.5, capS: 0.5, jitter: "none" },
      },
      { kind: "lb", id: "lb", label: "ALB", targets: APPS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0004 } },
      ...APPS.map(app),
      { kind: "cache", id: "cache", label: "redis-1", capacity: 20000, ttlS: 2, op: { kind: "const", value: 0.0005 }, backing: "db" },
      { kind: "db", id: "db", label: "db-read", cores: 8, workers: 4, queueLimit: 40, steps: [{ kind: "io", dist: { kind: "lognormal", median: 0.02, p99: 0.08 } }] },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -1140, host: "ci", source: "deploy", level: "INFO", text: "config-service: set CACHE_TTL=2h for service catalog-api (was: unset, default 600)", evidence: "ttl-config" },
  { t: -1130, host: "app-1", source: "app", level: "INFO", text: "settings: CACHE_TTL parsed int('2h'[:1]) -> 2 (seconds)", evidence: "ttl-config" },
  { t: -900, host: "redis-1", source: "app", level: "INFO", text: "redis-1: node kernel upgrade completed, rebooted at 23:38 (hit ratio recovered by 23:40)", evidence: "node-upgrade" },
  { t: -600, host: "redis-1", source: "app", level: "WARN", text: "keyspace_hits 1,204,118 keyspace_misses 4,801,339 (hit ratio 20%, was 81% at 23:30)", evidence: "low-hit" },
  { t: -300, host: "db-read", source: "postgres", level: "WARN", text: "LOG:  connection pool for role catalog_ro: 4/4 active, 40 waiting", evidence: "db-saturated" },
  { t: -120, host: "app-2", source: "app", level: "WARN", text: "GET /catalog/items/88123 retry 2/3 after timeout (3000 ms)", evidence: "retries" },
  { t: -30, host: "app-1", source: "cron", level: "INFO", text: "nightly-rollup scheduled for 00:00:00 on the analytics replica (not db-read)", evidence: "nightly-job" },
  { t: 0, host: "app-1", source: "app", level: "ERROR", text: "GET /catalog/items/5190 503 rejected: db-read queue full", evidence: "db-saturated" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failReasons.timeout + w.failReasons.rejected > 0) {
    out.push({ t: w.t + rand(), host: APPS[Math.floor(rand() * APPS.length)]!, source: "app", level: "ERROR", text: "GET /catalog/items/" + Math.floor(rand() * 90000) + " failed after 3 attempts (db-read queue full or timeout 3000 ms)", evidence: "retries" });
  }
  if (Math.floor(w.t) % 6 === 0) out.push({ t: w.t + 0.4, host: "redis-1", source: "app", level: "WARN", text: "evicted_keys 0, expired_keys 41,882 in last 10 s (expiry rate 20x normal)", evidence: "low-hit" });
  return out;
}

const reverted = (s: { applied: string[] }) => s.applied.includes("restore-ttl");

export const INC_STAMPEDE: Incident = {
  id: "inc-stampede",
  code: "INC-0004",
  title: "Midnight Expiry",
  severity: "SEV-1",
  clock0: "23:58:00",
  pageAt: 120,
  page: { title: "Catalog API errors above 25%", detail: "Database read latency at the ceiling. Traffic is at the nightly peak. The cache looks up and healthy." },
  intro: [
    { speaker: "pager", line: "SEV-1: catalog errors at 26% and rising with the midnight peak. Redis is up. The read database is saturated." },
    { speaker: "meera", line: "A cache that is up can still not be caching. Ask what fraction of reads it is actually answering." },
  ],
  spec: spec(),
  seed: "inc-stampede",
  service: "catalog",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "The sim has no request coalescing, so every miss goes to the database. A cache with single-flight or soft expiry would soften this, which is part of the prevention list.",
    "A TTL of 2 s is the sustained version of the real herd: in production the same failure often arrives as a burst when many keys written together expire together.",
  ],
  hosts: ["app-1", "app-2", "redis-1", "db-read"],
  services: ["alb", ...APPS, "redis-1", "db-read"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("catalog-api", [...APPS, "cache", "db"], (id, nw) => (id === "db" && nw.workerUtil > 0.9 ? "db-saturated" : id === "cache" && (nw.hits ?? 0) < (nw.misses ?? 0) ? "low-hit" : undefined), tierMap(APPS, { cache: "cache", db: "db" })),
  commands: [
    {
      cmd: "redis-cli info stats | grep keyspace",
      describe: "cache hit and miss counters",
      run: (h, s) => ({ out: reverted(s) ? "keyspace_hits:6120449\nkeyspace_misses:1480222   (hit ratio recovering: 81%)" : "keyspace_hits:1204118\nkeyspace_misses:4801339   (hit ratio 20%; was 81% at 23:30)", evidence: reverted(s) ? undefined : "low-hit" }),
    },
    { cmd: "redis-cli ttl item:88123", describe: "time to live of a catalog key", run: (h, s) => ({ out: reverted(s) ? "(integer) 598" : "(integer) 1", evidence: reverted(s) ? undefined : "ttl-config" }) },
    { cmd: "env | grep CACHE_TTL", describe: "the TTL the app is using", run: (h, s) => ({ out: reverted(s) ? "CACHE_TTL=7200" : "CACHE_TTL=2h   (parsed as 2 seconds by cache.py)", evidence: reverted(s) ? undefined : "ttl-config" }) },
    { cmd: "psql -c \"select count(*), state from pg_stat_activity where usename='catalog_ro' group by 2\"", describe: "read database connections", run: (h, s) => ({ out: reverted(s) ? " 1 | active\n 3 | idle" : " 4 | active\n(40 more waiting at the pooler)", evidence: reverted(s) ? undefined : "db-saturated" }) },
    { cmd: "crontab -l -u analytics", describe: "what runs at midnight", run: () => ({ out: "0 0 * * *  nightly-rollup --target analytics-replica\n(does not touch db-read)", evidence: "nightly-job" }) },
    uptime((h, s) => (h === "redis-1" ? 0.4 : reverted(s) ? 0.8 : 1.6)),
    free((h) => (h === "redis-1" ? 900 : 2100)),
    df(),
  ],
  evidence: [
    { id: "ttl-config", label: "CACHE_TTL=2h was parsed as 2 seconds after the 23:41 config change", key: true },
    { id: "low-hit", label: "Cache hit ratio fell from about 81% to about 20%", key: true },
    { id: "db-saturated", label: "The read database is saturated with a full queue", key: true },
    { id: "retries", label: "Clients retry timed-out reads, keeping the queue full", key: true },
    { id: "node-upgrade", label: "The Redis host was upgraded and rebooted at 23:38", key: false },
    { id: "nightly-job", label: "The nightly rollup runs at 00:00", key: false },
  ],
  hypotheses: [
    { id: "ttl", label: "A bad TTL value makes cache entries expire almost immediately, so most reads fall through to a database sized for far fewer", correct: true },
    { id: "restart", label: "The Redis reboot left the cache cold and it is still warming", correct: false },
    { id: "nightly", label: "The midnight analytics job is overloading the database", correct: false },
    { id: "traffic", label: "Midnight traffic is simply above capacity", correct: false },
    { id: "db", label: "The database host is failing", correct: false },
  ],
  mitigations: [
    {
      id: "restore-ttl",
      label: "Set CACHE_TTL=7200 and reload the app config",
      detail: "Restores long-lived entries. The cache refills from the hottest keys down.",
      takesS: 20,
      kind: "fix",
      patches: () => [{ delay: 20, patch: { op: "set", node: "cache", changes: { ttlS: 600 } } }],
      note: "CACHE_TTL=7200 pushed; apps reloaded settings. New cache fills now live for hours (modelled at 600 s).",
    },
    {
      id: "read-capacity",
      label: "Raise the read database pool from 4 to 16 connections",
      detail: "Absorbs the extra misses until the TTL is fixed.",
      takesS: 25,
      kind: "mitigate",
      patches: () => [{ delay: 25, patch: { op: "set", node: "db", changes: { workers: 16 } } }],
      note: "pgbouncer pool for catalog_ro 4 → 16. The database copes with the 80% miss rate, at higher cost.",
    },
    {
      ...decoy("flush-redis", "Flush Redis and let it warm", "FLUSHALL on redis-1.", "Cache flushed. Entries still expire after two seconds, so nothing warmed.", 5),
      patches: () => [
        { delay: 5, patch: { op: "set", node: "cache", changes: { failure: { down: true } } } },
        { delay: 7, patch: { op: "set", node: "cache", changes: { failure: { down: false } } } },
      ],
    },
    decoy("scale-apps", "Add two app servers", "More web capacity.", "Desired capacity 2 → 4. The extra servers only send more reads to the same database.", 10, "harmful"),
    decoy("pause-nightly", "Pause the nightly rollup", "Disable the cron entry.", "nightly-rollup disabled. It ran on the analytics replica and never touched db-read.", 10),
    decoy("rollback-redis", "Roll back the Redis host upgrade", "Revert the kernel upgrade on redis-1.", "Roll back queued for the maintenance window. The upgrade finished at 23:38 and the cache was healthy until 23:41.", 600),
  ],
  traces: [
    {
      id: "miss",
      title: "GET /catalog/items/5190 · 503 · app-1",
      status: 503,
      evidence: "db-saturated",
      spans: [
        { name: "ALB → app-1", start: 0, ms: 3000, depth: 0, kind: "net" },
        { name: "redis GET item:5190 (miss, expired 1.4 s ago)", start: 5, ms: 1, depth: 1, kind: "cache" },
        { name: "waiting for db-read connection", start: 6, ms: 2990, depth: 1, kind: "queue" },
      ],
    },
    {
      id: "hit",
      title: "GET /catalog/items/88123 · 200 · app-2 (23:30, before the change)",
      status: 200,
      spans: [
        { name: "ALB → app-2", start: 0, ms: 9, depth: 0, kind: "net" },
        { name: "redis GET item:88123 (hit)", start: 4, ms: 1, depth: 1, kind: "cache" },
      ],
    },
  ],
  timeline: [
    { t: -1140, label: "config change: CACHE_TTL=2h", kind: "deploy" },
    { t: -900, label: "redis-1 kernel upgrade completed", kind: "scale" },
    { t: -600, label: "hit ratio drops to 20%", kind: "cron" },
    { t: 120, label: "Page: catalog errors above 25%", kind: "page" },
  ],
  extraSeries: [{ id: "hit-ratio", label: "Cache hit ratio", unit: "%", at: (t) => (t < -1100 ? 81 : 20) }],
  evidenceVia: ["retries", "nightly-job"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: about a quarter of catalog reads failing at the midnight peak, and for how long" },
      { id: "cause", criterion: "Root cause: TTL value '2h' parsed as 2 seconds, so entries expired almost at once and most reads reached a database sized for the cached rate" },
      { id: "amplify", criterion: "Names the amplifier: client retries on timeout keep the database queue full after the initial overload" },
      { id: "prevent", criterion: "Prevention: validate config types (a duration parser), staged config rollout with a hit-ratio alarm, single-flight or soft expiry, and jittered TTLs" },
      { id: "mitigate", criterion: "States what stopped it (restoring the TTL, or more database capacity as a stopgap) and why flushing the cache would not help" },
    ],
    exemplar:
      "What happened: From 00:00 to about 00:05, a quarter of catalog reads failed. Root cause: a config change set CACHE_TTL=2h, the library parsed it as 2 seconds, and entries expired almost immediately, so the hit ratio fell from 81% to 20% and the read database received four times the traffic it was sized for. Clients timed out and retried, which kept its queue full. The Redis reboot and the nightly job were not involved. Mitigation: restoring the TTL let the cache refill; raising the pool was a stopgap. Prevention: parse durations with a typed parser, alert on hit ratio after config changes, add single-flight on misses and jitter TTLs so keys do not expire together.",
  },
  hints: [
    "Redis is up and fast. How many of the reads is it actually answering?",
    "Look at what changed shortly before the hit ratio fell, and how long a key lives now.",
    "The nightly job and the reboot were both earlier or elsewhere. Which timeline entry lines up with the drop?",
  ],
  exercises: ["cache-stampede"],
};
