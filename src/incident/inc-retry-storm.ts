/**
 * INC-0007 · The Retry Storm.
 *
 * For 20 seconds at 17:42 the database's storage latency was five times normal (a volume snapshot). Requests slowed
 * past the 2 s client timeout, clients retried up to four attempts 100 ms apart, and the database, sized for 300
 * requests a second, was handed 800. The cause is long gone and the system is still down: the queues are full of work
 * for requests whose callers have already given up, and the retries keep arriving.
 * Red herrings: the storage blip itself (over), and a deploy two days ago.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const APPS = ["app-1", "app-2"];

const app = (id: string): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers: 100, queueLimit: 400, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.004 } }, { kind: "call", target: "db" }], bootS: 30 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "mobile clients", target: "lb", rate: { kind: "const", rps: 200 }, users: 30000, timeoutS: 2, retry: { maxAttempts: 4, backoff: "constant", baseS: 0.1, capS: 0.1, jitter: "none" } },
      { kind: "lb", id: "lb", label: "ALB", targets: APPS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0004 } },
      ...APPS.map(app),
      { kind: "db", id: "db", label: "orders-db", cores: 8, workers: 12, queueLimit: 300, steps: [{ kind: "io", dist: { kind: "lognormal", median: 0.04, p99: 0.16 } }] },
    ],
    script: [
      { t: 20, patch: { op: "set", node: "db", changes: { failure: { slowFactor: 5 } } }, note: "volume snapshot begins" },
      { t: 40, patch: { op: "set", node: "db", changes: { failure: { slowFactor: 1 } } }, note: "volume snapshot ends" },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -172800, host: "ci", source: "deploy", level: "INFO", text: "deploy orders-api v8.1.2: no changes to retry or timeout settings", evidence: "old-deploy" },
  { t: -4500, host: "orders-db", source: "app", level: "WARN", text: "ebs: vol-0c41f2 latency 78 ms avg for 20 s (snapshot snap-0e9a created); returned to 8 ms at 17:42:40", evidence: "blip" },
  { t: -3000, host: "app-1", source: "app", level: "WARN", text: "request 8f21 attempt 2/4 for POST /orders (client timeout 2000 ms), x-attempt: 2", evidence: "retries" },
  { t: -2900, host: "alb", source: "alb", level: "INFO", text: "request count 812/s (clients send 200/s); 4.06 requests per original request", evidence: "retries" },
  { t: -2000, host: "orders-db", source: "postgres", level: "WARN", text: "LOG:  12/12 connections active; 300 waiting (queue limit); oldest waiting 4.1 s", evidence: "queue-full" },
  { t: -1000, host: "app-2", source: "app", level: "WARN", text: "accept queue 400/400 full; dropping new connections", evidence: "queue-full" },
  { t: -60, host: "app-1", source: "app", level: "ERROR", text: "client: POST /orders failed after 4 attempts (timeout 2000 ms), retry policy: max 4, delay 100 ms fixed", evidence: "no-budget" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failed > 0) out.push({ t: w.t + rand(), host: APPS[Math.floor(rand() * 2)]!, source: "app", level: "ERROR", text: "POST /orders 503: accept queue full or upstream timeout; x-attempt: " + (2 + Math.floor(rand() * 3)), evidence: "retries" });
  if (Math.floor(w.t) % 5 === 0) out.push({ t: w.t + 0.3, host: "alb", source: "alb", level: "WARN", text: "request count " + Math.round(700 + rand() * 120) + "/s (clients send 200/s)", evidence: "retries" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const INC_RETRY_STORM: Incident = {
  id: "inc-retry-storm",
  code: "INC-0007",
  title: "The Retry Storm",
  severity: "SEV-1",
  clock0: "17:42:00",
  pageAt: 90,
  page: { title: "Orders API returning 503 for every request", detail: "The storage problem ended before the page fired. Database latency is normal per request, but nothing gets through." },
  intro: [
    { speaker: "pager", line: "SEV-1: orders API at 100% errors for several minutes. The disk blip ended before the page fired." },
    { speaker: "meera", line: "The trigger ended and the outage did not. Count how many requests the database is being asked for." },
  ],
  spec: spec(),
  seed: "inc-retry-storm",
  service: "orders",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "Retry budgets are modelled by switching the client population to a single attempt. A real gateway budget lets a small fraction of retries through and keeps the rest from adding load.",
    "Abandoned requests keep occupying queue slots and database connections until they run; some real servers cancel work for closed connections, which would drain the backlog faster.",
  ],
  hosts: ["alb", ...APPS, "orders-db"],
  services: ["alb", ...APPS, "orders-db"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("orders-api", [...APPS, "db"], (id, nw) => ((id === "db" && nw.queue > 100) || nw.queueMax > 300 ? "queue-full" : undefined), tierMap(APPS, { db: "db" })),
  commands: [
    {
      cmd: "alb-stats --window 60s",
      describe: "requests per second at the load balancer",
      run: (h, s) => ({ out: has(s, "retry-budget") ? "requests 205/s\nclient requests 200/s\nattempts per request 1.02" : "requests 812/s\nclient requests ~200/s\nattempts per request 4.06 (every request is arriving four times)", evidence: has(s, "retry-budget") ? undefined : "retries" }),
    },
    {
      cmd: "psql -c \"select count(*), state from pg_stat_activity group by 2\"",
      describe: "database connections",
      run: (h, s) => ({ out: has(s, "retry-budget", "db-capacity") ? " 4 | active\n 8 | idle" : " 12 | active\n(300 waiting at the pooler; oldest 4.1 s; most callers already timed out at 2 s)", evidence: has(s, "retry-budget", "db-capacity") ? undefined : "queue-full" }),
    },
    { cmd: "cat /etc/orders/client.yaml", describe: "client retry settings", run: () => ({ out: "timeout_ms: 2000\nretries: 3    # max 4 attempts\nretry_delay_ms: 100    # fixed, no jitter, no budget", evidence: "no-budget" }) },
    { cmd: "aws ec2 describe-volumes --volume-ids vol-0c41f2 --query 'Volumes[0].State'", describe: "the storage volume now", run: () => ({ out: "\"in-use\"  # latency 8 ms; snapshot completed 17:42:40" }) },
    uptime((h) => (h === "orders-db" ? 4.1 : 2.2)),
    free(() => 3000),
    df(),
  ],
  evidence: [
    { id: "retries", label: "The ALB sees four attempts for every client request", key: true },
    { id: "queue-full", label: "Database and app queues are full of requests whose callers gave up", key: true },
    { id: "no-budget", label: "Clients retry 4 times at a fixed 100 ms with no jitter or budget", key: true },
    { id: "blip", label: "A 20-second storage latency spike started it, and is over", key: false },
    { id: "old-deploy", label: "A deploy two days ago", key: false },
  ],
  hypotheses: [
    { id: "storm", label: "Client retries multiplied the load beyond capacity after a brief slowdown, and the full queues keep the system in overload after the trigger ended", correct: true },
    { id: "disk", label: "The storage problem is still degrading the database", correct: false },
    { id: "deploy", label: "The deploy two days ago introduced a regression", correct: false },
    { id: "dbdown", label: "The database has failed and needs a restart", correct: false },
    { id: "ddos", label: "Someone is attacking the API", correct: false },
  ],
  mitigations: [
    {
      id: "retry-budget",
      label: "Turn on a gateway retry budget (retries at most 10% of traffic)",
      detail: "Stops the 4x amplification. The queues drain as the abandoned work finishes.",
      takesS: 20,
      kind: "fix",
      patches: () => [{ delay: 20, patch: { op: "set", node: "users", changes: { retry: { maxAttempts: 1, backoff: "constant", baseS: 0.1, capS: 0.1, jitter: "none" } } } }],
      note: "envoy retry_budget budget_percent=10 min_retry_concurrency=3. Requests per original request fall from 4.06 to 1.02.",
    },
    {
      id: "db-capacity",
      label: "Raise the database pool from 12 to 40 connections",
      detail: "Enough capacity to chew through the backlog even with the retries.",
      takesS: 30,
      kind: "mitigate",
      patches: () => [{ delay: 30, patch: { op: "set", node: "db", changes: { workers: 40 } } }],
      note: "pgbouncer default_pool_size 12 to 40. The backlog drains; the retries remain, so this only works while the database has headroom.",
    },
    {
      ...decoy("restart-db", "Restart the database to clear its queue", "Drops every waiting request.", "orders-db restarted. The queue is empty; it works only if the retries do not rebuild it.", 30, "mitigate"),
      patches: () => [{ delay: 30, patch: { op: "restart", node: "db" } }],
    },
    {
      ...decoy("shed-load", "Shed 60% of traffic at the gateway", "Return 503 for most requests to reduce load.", "gateway: 60% of requests rejected. Clients keep retrying the rejected ones, so the database still sees more than it can serve.", 15),
      patches: () => [{ delay: 15, patch: { op: "set", node: "users", changes: { rateScale: 0.4 } } }],
    },
    {
      ...decoy("backoff-jitter", "Ship a client update with exponential backoff and jitter", "Mobile release with 3 attempts, 0.5 s base, full jitter.", "Client v9.2 published. Only the share of users who update will see it, and 3 attempts still triple the load.", 300),
      patches: () => [{ delay: 300, patch: { op: "set", node: "users", changes: { retry: { maxAttempts: 3, backoff: "exponential", baseS: 0.5, capS: 8, jitter: "full" } } } }],
    },
    {
      ...decoy("deeper-queues", "Raise the accept queues to 5,000 so fewer requests are dropped", "Larger backlog on both app servers.", "app queue limit 400 to 5,000. Fewer 503s at the door; each queued request now waits far longer than the client timeout.", 10, "harmful"),
      patches: () => APPS.map((id) => ({ delay: 10, patch: { op: "set" as const, node: id, changes: { queueLimit: 5000 } } })),
    },
    decoy("check-disk", "Open a case with the storage team", "Ask why the snapshot slowed the volume.", "Case opened. The volume has been healthy since 17:42:40.", 5),
  ],
  traces: [
    {
      id: "timeout",
      title: "POST /orders · 503 · attempt 4/4",
      status: 503,
      evidence: "queue-full",
      spans: [
        { name: "client attempt 4 (3 earlier attempts, 100 ms apart)", start: 0, ms: 2000, depth: 0, kind: "net" },
        { name: "ALB → app-1 (accept queue 400/400)", start: 2, ms: 1998, depth: 1, kind: "queue" },
      ],
    },
    {
      id: "zombie",
      title: "POST /orders · completed after client gave up · app-2",
      status: 200,
      evidence: "retries",
      spans: [
        { name: "app-2 handler (caller closed at 2000 ms)", start: 0, ms: 4140, depth: 0, kind: "cpu" },
        { name: "waiting for orders-db connection", start: 4, ms: 4100, depth: 1, kind: "queue" },
        { name: "postgres: INSERT orders (42 ms)", start: 4110, ms: 42, depth: 1, kind: "db" },
      ],
    },
  ],
  timeline: [
    { t: -172800, label: "deploy orders-api v8.1.2", kind: "deploy" },
    { t: 20, label: "volume snapshot: storage latency x5", kind: "cron" },
    { t: 40, label: "storage latency back to normal", kind: "scale" },
    { t: 90, label: "Page: orders API 100% errors", kind: "page" },
  ],
  extraSeries: [{ id: "attempts", label: "Attempts per client request (x25 for scale)", unit: "%", at: (t) => (t < 20 ? 25 : 100) }],
  evidenceVia: [],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: orders failing for several minutes after a 20-second trigger, and that the trigger ended long before the outage" },
      { id: "cause", criterion: "Root cause: four fixed-delay retries multiplied 200 requests per second to about 800, beyond the 300 the database could serve; queues full of abandoned work kept it saturated" },
      { id: "detect", criterion: "Why it was hard: per-request latency looked normal again; only the attempts-per-request ratio and queue depth showed the overload" },
      { id: "prevent", criterion: "Prevention: exponential backoff with jitter, a retry budget, bounded queues and deadlines that cancel abandoned work, load shedding, and alerts on retry ratio" },
      { id: "mitigate", criterion: "States what ended it (cap retries, or add capacity) and why shedding load or backoff alone did not" },
    ],
    exemplar:
      "What happened: A 20-second storage slowdown at 17:42 became a multi-minute outage. Requests slowed past the 2 s client timeout; every client retried up to four times at 100 ms, so the database received about 800 requests a second against a capacity of 300. Queues filled with work whose callers had already left, and the retries kept them full after the disk recovered. Mitigation: a gateway retry budget cut the load to about 1x and the backlog drained; raising the pool also worked while there was headroom. Shedding 60% of traffic did not help because clients retried the rejects. Prevention: exponential backoff with jitter, retry budgets, bounded queues with deadlines that cancel abandoned work, and an alert on attempts per request.",
  },
  hints: [
    "The disk problem ended. Why is the database still overloaded?",
    "Compare the requests the load balancer sees with the number of users actually clicking.",
    "Which setting in the client turns one slow request into four arriving within half a second?",
  ],
  exercises: ["retries-backoff-jitter"],
};
