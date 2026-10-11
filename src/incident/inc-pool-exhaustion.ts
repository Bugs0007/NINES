/**
 * INC-0002 · The Pool Ran Dry.
 *
 * A 13:50 deploy added a /reports endpoint whose query has no index. 6% of requests now run a six-second query that
 * holds one of the 24 database connections (the shared pool limit) the whole time. The pool saturates, every other
 * request queues behind it, app workers fill up waiting, and clients time out.
 * Red herrings: a cache flush at 13:30 and a CPU graph that looks normal on the app servers.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { clockAt, dashboardFor, decoy, df, free, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const APPS = ["app-1", "app-2", "app-3"];
const HOSTS = [...APPS, "db-1"];
const FAST = { kind: "lognormal", median: 0.01, p99: 0.04 } as const;
const MIXED = { kind: "mix", p: 0.94, a: FAST, b: { kind: "const", value: 6 } } as const;

function spec(): SimSpec {
  const app = (id: string): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers: 32, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.006 } }, { kind: "call", target: "db" }], bootS: 40 });
  return {
    nodes: [
      { kind: "client", id: "users", target: "lb", rate: { kind: "const", rps: 120 }, users: 5000, timeoutS: 8 },
      { kind: "lb", id: "lb", label: "ALB", targets: APPS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0004 } },
      ...APPS.map(app),
      { kind: "db", id: "db", label: "db-1", cores: 8, workers: 24, queueLimit: 60, steps: [{ kind: "io", dist: MIXED }] },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -2400, host: "cache", source: "app", level: "INFO", text: "redis FLUSHDB issued by deploy hook (cache warm-up script); 0 keys", evidence: "cache-flush" },
  { t: -1200, host: "ci", source: "deploy", level: "INFO", text: "deploy v5.8.0 complete: adds GET /api/reports/activity (new)", evidence: "deploy-reports" },
  { t: -600, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 6012.447 ms  statement: SELECT account_id, date_trunc('hour', ts), count(*) FROM events WHERE ts > now() - interval '30 days' GROUP BY 1, 2", evidence: "slow-query" },
  { t: -240, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 5987.103 ms  statement: SELECT account_id, date_trunc('hour', ts), count(*) FROM events WHERE ts > now() - interval '30 days' GROUP BY 1, 2", evidence: "slow-query" },
  { t: -90, host: "app-2", source: "app", level: "WARN", text: "pool: timeout waiting for a database connection after 5000 ms (in use 8/8, waiting 41)", evidence: "pool-wait" },
  { t: -60, host: "app-1", source: "app", level: "WARN", text: "pool: timeout waiting for a database connection after 5000 ms (in use 8/8, waiting 37)", evidence: "pool-wait" },
  { t: -30, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 6021.880 ms  statement: SELECT account_id, date_trunc('hour', ts), count(*) FROM events WHERE ts > now() - interval '30 days' GROUP BY 1, 2", evidence: "slow-query" },
  { t: 10, host: "db-1", source: "postgres", level: "INFO", text: "checkpoint complete: wrote 412 buffers (0.4%); write=2.103 s" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  const t = w.t;
  const db = w.nodes["db"];
  if (db && db.queue > 20 && Math.floor(t) % 2 === 0) {
    const app = APPS[Math.floor(rand() * APPS.length)]!;
    out.push({ t: t + rand(), host: app, source: "app", level: "ERROR", text: `POST /api/orders 504 after 8.0 s: pool: timeout waiting for a database connection (in use 8/8, waiting ${Math.round(db.queue / 3)})`, evidence: "pool-wait" });
  }
  if (Math.floor(t) % 5 === 0) out.push({ t: t + 0.3, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 6004.2 ms  statement: SELECT account_id, date_trunc('hour', ts), count(*) FROM events WHERE ts > now() - interval '30 days' GROUP BY 1, 2", evidence: "slow-query" });
  return out;
}

const fixed = (s: { applied: string[] }) => s.applied.includes("disable-reports") || s.applied.includes("kill-and-timeout");

export const INC_POOL: Incident = {
  id: "inc-pool-exhaustion",
  code: "INC-0002",
  title: "The Pool Ran Dry",
  severity: "SEV-2",
  clock0: "14:05:00",
  pageAt: 120,
  page: { title: "Orders API is timing out", detail: "5xx errors at 50% for two minutes. App servers are healthy and nearly idle." },
  intro: [
    { speaker: "pager", line: "SEV-2: order API errors above 20%. Database CPU is fine and the apps are at 12% CPU." },
    { speaker: "meera", line: "Idle servers and failing requests means they are waiting for something. Find out what." },
  ],
  spec: spec(),
  seed: "inc-pool-exhaustion",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "The 24 connections are modelled as one shared pool of workers on the database node. A real deployment has a pool per app instance (8 each here), which behaves the same in aggregate but can leave one instance starved while another has spare.",
    "The slow query is a fixed 6 s on 6% of requests. Real slow queries get slower as they compete for the same I/O.",
  ],
  hosts: HOSTS,
  services: ["alb", ...APPS, "db-1"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: {
    ...dashboardFor("orders-api", [...APPS, "db"], (id, nw) => (id === "db" && nw.workerUtil > 0.9 ? "pool-wait" : undefined), tierMap(APPS, { db: "db" })),
  },
  commands: [
    {
      cmd: "psql -c \"select count(*), state from pg_stat_activity group by 2\"",
      describe: "database connections",
      run: (h, s) => {
        const busy = !fixed(s) ? 24 : 5;
        return { out: ` count | state\n-------+--------\n ${busy}    | active\n ${fixed(s) ? 11 : 0}    | idle\n(2 rows)\n\nmax_connections = 24 (pool limit, pgbouncer)`, evidence: !fixed(s) ? "pool-full" : undefined };
      },
    },
    {
      cmd: "psql -c \"select now()-query_start as running, left(query,60) from pg_stat_activity where state='active' order by 1 desc limit 5\"",
      describe: "longest running queries",
      run: (h, s) => ({
        out: fixed(s) ? " running  | left\n----------+------\n 00:00:00.01 | select * from orders where id = 4821\n(1 row)" : " running  | left\n----------+------------------------------------------------------------\n 00:00:05.91 | SELECT account_id, date_trunc('hour', ts), count(*) FROM e\n 00:00:05.40 | SELECT account_id, date_trunc('hour', ts), count(*) FROM e\n 00:00:04.88 | SELECT account_id, date_trunc('hour', ts), count(*) FROM e\n 00:00:04.12 | SELECT account_id, date_trunc('hour', ts), count(*) FROM e\n 00:00:03.77 | SELECT account_id, date_trunc('hour', ts), count(*) FROM e\n(5 rows)",
        evidence: !fixed(s) ? "slow-query" : undefined,
      }),
    },
    {
      cmd: "psql -c \"explain select count(*) from events where ts > now()-interval '30 days'\"",
      describe: "query plan for the report",
      run: () => ({ out: "Seq Scan on events  (cost=0.00..412881.00 rows=18204113 width=0)\n  Filter: (ts > (now() - '30 days'::interval))\n(no index on events(ts))", evidence: "no-index" }),
    },
    { cmd: "top -bn1 | head -5", describe: "CPU", run: (h, s) => ({ out: `%Cpu(s): ${h === "db-1" ? (fixed(s) ? 9 : 31) : fixed(s) ? 16 : 12}.0 us, 2.1 sy,  0.0 ni, 85.0 id\nload is low: the processes are waiting, not working`, evidence: h === "db-1" ? undefined : "apps-idle" }) },
    uptime((h, s) => (h === "db-1" ? (fixed(s) ? 0.6 : 2.4) : 0.4), (h, s) => (h !== "db-1" && !fixed(s) ? "apps-idle" : undefined)),
    free((h) => (h === "db-1" ? 4200 : 2400)),
    df(),
  ],
  evidence: [
    { id: "slow-query", label: "A six-second report query is running over and over", key: true },
    { id: "pool-wait", label: "Apps time out waiting for a database connection", key: true },
    { id: "pool-full", label: "All 24 pool connections are active", key: true },
    { id: "no-index", label: "The report scans the whole events table (no index on ts)", key: true },
    { id: "deploy-reports", label: "The 13:50 deploy added the reports endpoint", key: true },
    { id: "apps-idle", label: "App servers are nearly idle while requests fail", key: false },
    { id: "cache-flush", label: "The cache was flushed at 13:30", key: false },
  ],
  hypotheses: [
    { id: "pool", label: "A slow report query holds database connections, so the shared pool is exhausted and everything else queues", correct: true },
    { id: "cache", label: "The 13:30 cache flush sent a stampede of reads to the database", correct: false },
    { id: "apps", label: "The app servers are under-provisioned for the traffic", correct: false },
    { id: "dbcpu", label: "The database is out of CPU", correct: false },
    { id: "net", label: "A network problem between the apps and the database", correct: false },
  ],
  mitigations: [
    {
      id: "disable-reports",
      label: "Turn off the reports endpoint (feature flag)",
      detail: "Stops new copies of the slow query. Running ones finish within six seconds.",
      takesS: 15,
      kind: "fix",
      patches: () => [{ delay: 15, patch: { op: "set", node: "db", changes: { steps: [{ kind: "io", dist: FAST }] } } }],
      note: "reports_enabled=false: GET /api/reports/activity returns 503 immediately.",
    },
    {
      id: "kill-and-timeout",
      label: "Cancel the slow queries and set statement_timeout to 2 s",
      detail: "pg_cancel_backend on the long ones, then cap any query at two seconds.",
      takesS: 20,
      kind: "mitigate",
      patches: () => [{ delay: 20, patch: { op: "set", node: "db", changes: { steps: [{ kind: "io", dist: { kind: "mix", p: 0.94, a: FAST, b: { kind: "const", value: 0.2 } } }] } } }],
      note: "statement_timeout=2s on role app; the report query now fails fast with an error instead of holding a connection.",
    },
    {
      id: "raise-pool",
      label: "Raise the pool limit from 24 to 80",
      detail: "More connections in flight. The database has the capacity to hold them.",
      takesS: 20,
      kind: "mitigate",
      patches: () => [{ delay: 20, patch: { op: "set", node: "db", changes: { workers: 80 } } }],
      note: "pgbouncer default_pool_size=80. The slow queries still run, but no longer fill the pool.",
    },
    {
      id: "scale-apps",
      label: "Add two app servers",
      detail: "More capacity from the Auto Scaling group.",
      takesS: 10,
      kind: "harmful",
      patches: () => {
        const base = spec().nodes.find((n) => n.id === "app-1") as ServerSpec;
        return [
          { delay: 10, patch: { op: "launch", spec: { ...base, id: "app-4", label: "app-4" }, lb: "lb", bootS: 40 } },
          { delay: 10, patch: { op: "launch", spec: { ...base, id: "app-5", label: "app-5" }, lb: "lb", bootS: 40 } },
        ];
      },
      note: "ASG desired capacity 3 → 5. The new instances share the same 24 database connections.",
    },
    { ...decoy("restart-apps", "Restart the app servers", "Rolling restart of all three.", "app-1..3 restarted. Queued requests dropped; the pool filled again within a minute."), patches: () => APPS.map((id) => ({ delay: 8, patch: { op: "restart" as const, node: id } })) },
    decoy("flush-cache", "Flush the cache again", "Redis FLUSHDB.", "Cache flushed. Nothing changed: the slow requests never touched the cache.", 5),
    decoy("rollback-all", "Roll back to v5.7.9", "Revert the whole release.", "Rollback to v5.7.9 started; takes eleven minutes.", 660),
  ],
  traces: [
    {
      id: "timeout",
      title: "POST /api/orders · 504 · app-2",
      status: 504,
      evidence: "pool-wait",
      spans: [
        { name: "ALB → app-2", start: 0, ms: 8000, depth: 0, kind: "net" },
        { name: "django view: OrderView.post", start: 1, ms: 7990, depth: 1, kind: "cpu" },
        { name: "waiting for a database connection from the pool", start: 6, ms: 7980, depth: 2, kind: "queue" },
      ],
    },
    {
      id: "report",
      title: "GET /api/reports/activity · 200 · app-1",
      status: 200,
      evidence: "slow-query",
      spans: [
        { name: "ALB → app-1", start: 0, ms: 6040, depth: 0, kind: "net" },
        { name: "django view: ActivityReport.get", start: 1, ms: 6038, depth: 1, kind: "cpu" },
        { name: "postgres: SELECT … FROM events GROUP BY …", start: 8, ms: 6020, depth: 2, kind: "db" },
      ],
    },
    {
      id: "ok",
      title: "POST /api/orders · 200 · app-3 (13:48, before the deploy)",
      status: 200,
      spans: [
        { name: "ALB → app-3", start: 0, ms: 52, depth: 0, kind: "net" },
        { name: "django view: OrderView.post", start: 0.5, ms: 51, depth: 1, kind: "cpu" },
        { name: "postgres: INSERT orders", start: 4, ms: 11, depth: 2, kind: "db" },
      ],
    },
  ],
  timeline: [
    { t: -2400, label: "cache warm-up script flushes Redis", kind: "deploy" },
    { t: -1200, label: "deploy v5.8.0 (adds /api/reports/activity)", kind: "deploy" },
    { t: -600, label: "first six-second query logged on db-1", kind: "cron" },
    { t: 120, label: "Page: orders API errors > 20%", kind: "page" },
  ],
  extraSeries: [{ id: "db-conns", label: "Database connections in use", unit: "%", at: (t) => (t < -300 ? 38 : 96 + 2 * Math.sin(t / 7)) }],
  evidenceVia: ["pool-full", "no-index", "apps-idle"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact concretely (about half of order requests failing, for how long)" },
      { id: "cause", criterion: "Root cause: the new report query has no index, runs six seconds and holds a pool connection each time, exhausting the 24-connection pool" },
      { id: "detect", criterion: "Why it looked strange: the database CPU and the app CPU were low because requests were waiting for a connection, not working" },
      { id: "prevent", criterion: "Prevention: index the query or run reports on a replica, a statement timeout, a separate pool for slow work, and alerting on pool wait or saturation" },
      { id: "mitigate", criterion: "States what stopped the bleeding (disabling the endpoint, or timeout and kill) and when, relative to the page" },
    ],
    exemplar:
      "What happened: From 14:05 to about 14:12, about half of order requests failed. Root cause: the 13:50 deploy added a report endpoint whose query scans the whole events table and takes six seconds; 6% of requests ran it, each holding one of the 24 shared database connections, so the pool saturated and every other request waited until clients timed out at eight seconds. CPU looked normal because nothing was computing, only waiting. Mitigation: a feature flag turned the endpoint off about 20 seconds after the page decision. Prevention: add the index or run reports on a replica, set a statement timeout, give slow work its own small pool, and alert on pool wait time.",
  },
  hints: [
    "The apps are idle and the requests are failing. What are the requests waiting for?",
    "Look at what is occupying the database's connections, and how long each one has been running.",
    "Compare the time the slow query started appearing with the deploys. What changed at 13:50?",
  ],
  exercises: ["connection-pooling"],
};
