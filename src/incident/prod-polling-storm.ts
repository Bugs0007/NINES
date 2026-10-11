/**
 * INC-0013 · Production: The Polling Storm.
 *
 * Dashboard v31 changed the notifications poll from every 30 s to every 1 s so the badge would feel instant. About
 * 400 tabs are open at the weekday peak, so the API goes from 13 to 400 requests a second to one endpoint, and
 * each response is the whole unpaginated notification list. The two app servers can do about 270 a second.
 * Red herrings: the database is quiet and some of the traffic looks like a bot (it is all real browsers).
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const APPS = ["app-1", "app-2"];

const app = (id: string, cpu = 0.03): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers: 64, queueLimit: 200, steps: [{ kind: "cpu", dist: { kind: "const", value: cpu } }], bootS: 30 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "open dashboard tabs", target: "lb", rate: { kind: "const", rps: 400 }, users: 400, timeoutS: 5 },
      { kind: "lb", id: "lb", label: "nginx", targets: APPS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0002 } },
      ...APPS.map((id) => app(id)),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -5400, host: "ci", source: "deploy", level: "INFO", text: "deploy dashboard v31: notifications badge polls GET /api/notifications every 1000 ms (was 30000 ms)", evidence: "poll-change" },
  { t: -1800, host: "nginx", source: "nginx", level: "INFO", text: "access summary (60 s): GET /api/notifications 91.2% of 23,100 requests; median response 381 KB; 388 distinct clients", evidence: "endpoint-share" },
  { t: -900, host: "app-1", source: "app", level: "WARN", text: "GET /api/notifications returned 4,112 items (no limit, no cursor); serialising took 25 ms CPU", evidence: "unpaginated" },
  { t: -600, host: "nginx", source: "nginx", level: "WARN", text: "upstream queue full: 200/200 on app-1, app-2; 502 for 31% of requests", evidence: "saturated" },
  { t: -300, host: "app-2", source: "app", level: "WARN", text: "cpu 99% across 4 cores; run queue 41", evidence: "saturated" },
  { t: -200, host: "nginx", source: "nginx", level: "INFO", text: "user agents: 98.7% Chrome/Safari/Firefox desktop; 0.8% curl (monitoring)", evidence: "not-bot" },
  { t: -120, host: "db-1", source: "postgres", level: "INFO", text: "db load 6% (index scans on notifications(user_id, id)); no slow queries", evidence: "db-quiet" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failed > 0) out.push({ t: w.t + rand(), host: "nginx", source: "nginx", level: "ERROR", text: "502 GET /api/notifications upstream queue full (client " + Math.floor(rand() * 255) + "." + Math.floor(rand() * 255) + ".0.1)", evidence: "saturated" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const PROD_POLLING: Incident = {
  id: "prod-polling-storm",
  code: "INC-0013",
  title: "Production: The Polling Storm",
  severity: "SEV-2",
  clock0: "11:00:00",
  pageAt: 90,
  page: { title: "API returning 502 for a third of requests", detail: "One endpoint accounts for 91% of requests. Database load is 6%." },
  intro: [
    { speaker: "pager", line: "SEV-2: API 502s at 30% since the dashboard release. Traffic is up 30x and nobody launched anything." },
    { speaker: "meera", line: "Little's Law again: 400 tabs, one request each per second, and a server that does 270. Find which endpoint it is." },
  ],
  spec: spec(),
  seed: "prod-polling-storm",
  service: "the API",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "Polling clients are modelled as a constant 400 requests a second. Real tabs poll out of phase but also back off when hidden; the average is what matters here.",
    "Server-sent events are modelled as removing about 98% of the polling requests; a real push channel holds a connection per tab and has its own capacity limit.",
  ],
  hosts: ["nginx", ...APPS, "db-1"],
  services: ["nginx", ...APPS, "db-1"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("notification API", [...APPS, "app-3", "app-4", "app-5"], (id, nw) => (nw.util > 0.9 ? "saturated" : undefined), tierMap(APPS, {})),
  commands: [
    {
      cmd: "nginx-top --window 60s --by path",
      describe: "requests by endpoint",
      run: (h, s) => ({ out: has(s, "sse", "slow-poll", "microcache") ? "GET /api/notifications   3.1%\nGET /api/feed   41%\nPOST /api/orders   9%" : "GET /api/notifications   91.2%  (388 clients, ~1 req/s each)\nGET /api/feed   4.1%\nPOST /api/orders   0.5%", evidence: has(s, "sse", "slow-poll", "microcache") ? undefined : "endpoint-share" }),
    },
    { cmd: "curl -s -o /dev/null -w '%{size_download} bytes %{time_total}s\\n' https://api/api/notifications", describe: "size of one response", run: () => ({ out: "381440 bytes 0.031s   (4,112 notifications, no limit parameter)", evidence: "unpaginated" }) },
    { cmd: "git -C dashboard log -2 --oneline -- src/useBadge.ts", describe: "recent change to the badge", run: () => ({ out: "d77a3f0 v31: poll every 1s for a snappier badge\n21c0ee8 v30: poll every 30s", evidence: "poll-change" }) },
    { cmd: "psql -c \"select count(*) from pg_stat_activity where state='active'\"", describe: "database activity", run: () => ({ out: " 4\n(the database is mostly idle)", evidence: "db-quiet" }) },
    uptime((h, s) => (has(s, "sse", "slow-poll", "microcache", "add-servers") ? 1.1 : 7.9)),
    free(() => 3100),
    df(),
  ],
  evidence: [
    { id: "endpoint-share", label: "GET /api/notifications is 91% of all requests", key: true },
    { id: "poll-change", label: "Dashboard v31 polls every second instead of every 30 s", key: true },
    { id: "unpaginated", label: "Each response is the full list, 380 KB", key: true },
    { id: "saturated", label: "App servers are CPU-saturated with full queues", key: true },
    { id: "db-quiet", label: "The database is nearly idle", key: false },
    { id: "not-bot", label: "The traffic is ordinary browsers, not a bot", key: false },
  ],
  hypotheses: [
    { id: "polling", label: "Open dashboard tabs poll one endpoint every second, so request rate is 30x higher and each response is large", correct: true },
    { id: "bot", label: "A bot or DDoS is hammering the API", correct: false },
    { id: "db", label: "The database is the bottleneck", correct: false },
    { id: "traffic", label: "More users arrived than usual", correct: false },
    { id: "leak", label: "A memory leak is degrading the servers", correct: false },
  ],
  mitigations: [
    {
      id: "slow-poll",
      label: "Have the server tell clients to poll every 15 s (next-poll header, ship dashboard v31.1)",
      detail: "Open tabs back off as soon as they next hear from the server.",
      takesS: 40,
      kind: "fix",
      patches: () => [{ delay: 40, patch: { op: "set", node: "users", changes: { rateScale: 0.07 } } }],
      note: "server sends X-Next-Poll: 15; dashboard v31.1 honours it and pauses polling in hidden tabs. Request rate falls to about 27/s.",
    },
    {
      id: "microcache",
      label: "Cache GET /api/notifications for 1 s per user at nginx",
      detail: "Most repeated polls become cache hits.",
      takesS: 20,
      kind: "mitigate",
      patches: () => APPS.map((id) => ({ delay: 20, patch: { op: "set" as const, node: id, changes: { steps: [{ kind: "cpu", dist: { kind: "const", value: 0.003 } }] } } })),
      note: "proxy_cache_valid 200 1s keyed by session. The app serves one in ten of the requests; a notification can be one second late.",
    },
    {
      id: "add-servers",
      label: "Add three app servers",
      detail: "Raises capacity from about 270 to about 670 requests a second.",
      takesS: 20,
      kind: "mitigate",
      patches: () => [{ delay: 20, patch: { op: "launch", spec: app("app-3"), lb: "lb", bootS: 30 } }, { delay: 20, patch: { op: "launch", spec: app("app-4"), lb: "lb", bootS: 30 } }, { delay: 20, patch: { op: "launch", spec: app("app-5"), lb: "lb", bootS: 30 } }],
      note: "ASG desired 2 -> 5. It works, and it costs two and a half times the fleet to serve badges.",
    },
    {
      id: "sse",
      label: "Replace polling with server-sent events for the badge",
      detail: "One held connection per tab; updates arrive when they happen.",
      takesS: 90,
      kind: "fix",
      patches: () => [{ delay: 90, patch: { op: "set", node: "users", changes: { rateScale: 0.02 } } }],
      note: "dashboard v32 opens /api/notifications/stream (SSE). Request rate drops to 8/s of reconnects and initial loads.",
    },
    { ...decoy("longer-timeout", "Raise the nginx and client timeouts to 30 s", "Stop requests failing at 5 s.", "Timeouts raised. Requests wait longer in full queues and then fail anyway.", 15, "harmful"), patches: () => [{ delay: 15, patch: { op: "set", node: "users", changes: { timeoutS: 30 } } }] },
    decoy("block-bots", "Block the suspicious user agents", "Deny curl and unknown agents.", "Blocked 0.8% of requests, all from the monitoring probes. The browsers keep polling.", 10),
    decoy("tune-db", "Add an index to the notifications table", "Speed up the query.", "Index created. The query already used an index scan taking 0.3 ms; the CPU is spent serialising 380 KB responses.", 60),
    { ...decoy("restart-apps", "Restart both app servers", "Clear any stuck state.", "Restarted. The load returned the moment they came up.", 20), patches: () => APPS.map((id) => ({ delay: 20, patch: { op: "restart" as const, node: id } })) },
  ],
  traces: [
    {
      id: "poll",
      title: "GET /api/notifications · 200 · app-1 (one of four hundred per second)",
      status: 200,
      evidence: "unpaginated",
      spans: [
        { name: "nginx → app-1", start: 0, ms: 34, depth: 0, kind: "net" },
        { name: "handler: load 4,112 notifications", start: 2, ms: 4, depth: 1, kind: "db" },
        { name: "serialise 381 KB JSON", start: 6, ms: 26, depth: 1, kind: "cpu" },
      ],
    },
    {
      id: "queued",
      title: "GET /api/notifications · 502 · nginx",
      status: 502,
      evidence: "saturated",
      spans: [
        { name: "nginx upstream: waiting for a free worker", start: 0, ms: 5000, depth: 0, kind: "queue" },
      ],
    },
  ],
  timeline: [
    { t: -5400, label: "dashboard v31: poll every 1 s", kind: "deploy" },
    { t: -1800, label: "tabs open as the weekday peak starts", kind: "scale" },
    { t: 90, label: "Page: API 502s", kind: "page" },
  ],
  extraSeries: [{ id: "poll-rps", label: "Requests / s to /api/notifications (scaled: 100 = 400)", unit: "%", at: (t) => (t < -5400 ? 3 : t < -1800 ? 40 : 100) }],
  evidenceVia: ["endpoint-share", "saturated", "db-quiet", "not-bot"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: a third of API requests failing for the weekday peak, and which pages were affected" },
      { id: "cause", criterion: "Root cause: v31 changed the poll interval from 30 s to 1 s, so about 400 tabs sent 400 requests a second for a 380 KB unpaginated response, beyond the 270 the servers could do" },
      { id: "detect", criterion: "How it was found: the per-endpoint breakdown, not the database or bot hypotheses; request rate x CPU per request (Little's Law) explains the saturation" },
      { id: "prevent", criterion: "Prevention: push (SSE or websockets) or server-controlled poll intervals, paginate and cap responses, load-test client changes, and alert on per-endpoint request rate" },
      { id: "mitigate", criterion: "States what worked (slower polls, microcache, or capacity) and the trade-off of each; why timeouts and indexes did not help" },
    ],
    exemplar:
      "What happened: At the weekday peak a third of API requests returned 502. Root cause: dashboard v31 polled /api/notifications every second instead of every 30, so roughly 6,000 open tabs sent 400 requests a second, each returning a 380 KB unpaginated list that cost about 30 ms of CPU. Two app servers can do about 270 requests a second, so the queues filled. The database was idle and the traffic was ordinary browsers. Mitigation: a server-set next-poll interval of 15 s cut the load to about 27 per second; a one-second cache or two more servers also worked. Prevention: push updates over SSE, paginate and cap responses, load-test client changes, and alert on per-endpoint request rate.",
  },
  hints: [
    "Ask which endpoint the traffic is going to, not just how much there is.",
    "Multiply requests per second by CPU per request and compare with the number of cores.",
    "What changed in the client release, and how often does each open tab ask now?",
  ],
  exercises: ["littles-law", "pagination", "realtime-transport"],
};
