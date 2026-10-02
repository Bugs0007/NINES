/**
 * INC-0001 · The Fourth Box.
 *
 * The autoscaler launched app-4 from a new launch template that lost WEB_CONCURRENCY, so gunicorn came up
 * with its default single worker. nginx answers /health itself, so the ALB thinks app-4 is fine and keeps
 * sending it a quarter of all checkouts, which rot in its queue until clients give up.
 * Red herrings: a frontend deploy at 01:40 and a nightly report hammering Postgres since 02:00.
 */
import type { ServerSpec, SimSpec } from "@/engine/types";
import { buildFleet, serversFor } from "@/widgets/fleet/spec";
import type { Incident, LogLine } from "./types";

const HOSTS = ["app-1", "app-2", "app-3", "app-4"];
const WORKERS = 16;

function spec(): SimSpec {
  const servers = serversFor("m7i.large", 4, 20).map((s) => ({ ...s, workers: s.id === "app-4" ? 1 : WORKERS }));
  return buildFleet({
    servers,
    algorithm: "round-robin",
    hc: "shallow",
    hcIntervalS: 10,
    hcThreshold: 2,
    session: "none",
    rate: { kind: "const", rps: 240 },
    cpu: { kind: "lognormal", median: 0.01, p99: 0.04 },
    io: { kind: "lognormal", median: 0.045, p99: 0.18 },
    timeoutS: 10,
  });
}

const ip = (h: string) => `10.0.1.${10 + HOSTS.indexOf(h) * 11}`;
const ALB_IP = "10.0.0.37"; // an ALB node's private IP

/** "02:14:07" for a sim time, given clock0 = 02:12:00. */
export function clockAt(t: number, clock0 = "02:12:00"): string {
  const [h, m, s] = clock0.split(":").map(Number) as [number, number, number];
  let total = h * 3600 + m * 60 + s + Math.floor(t);
  total = ((total % 86400) + 86400) % 86400;
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const STATIC: LogLine[] = [
  { t: -1908, host: "ci", source: "deploy", level: "INFO", text: "deploy v2.14.3 started: frontend assets only (no backend changes)", evidence: "deploy-frontend" },
  { t: -1857, host: "ci", source: "deploy", level: "INFO", text: "deploy v2.14.3 complete: CloudFront invalidation /static/* done", evidence: "deploy-frontend" },
  { t: -720, host: "db-1", source: "cron", level: "INFO", text: "nightly-report: started (report_daily_activity.sql)", evidence: "db-cron" },
  { t: -712, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 48211.334 ms  statement: SELECT date_trunc('day', created_at), count(*) FROM messages GROUP BY 1", evidence: "db-cron" },
  { t: -58, host: "asg", source: "asg", level: "INFO", text: "Launching a new EC2 instance: i-0a3fc1d2e5 (app-4). Cause: target tracking policy CPUUtilization > 60 for 3 datapoints.", evidence: "asg-launch" },
  { t: -58, host: "asg", source: "asg", level: "INFO", text: "Instance i-0a3fc1d2e5 launched from launch template pigeon-app version 7 (created 2026-09-26 by terraform apply)", evidence: "asg-launch" },
  { t: -12, host: "app-4", source: "gunicorn", level: "INFO", text: "[1107] [INFO] Starting gunicorn 22.0.0" },
  { t: -12, host: "app-4", source: "gunicorn", level: "INFO", text: "[1107] [INFO] Listening at: unix:/run/gunicorn.sock (1107)" },
  { t: -12, host: "app-4", source: "gunicorn", level: "INFO", text: "[1107] [INFO] Using worker: sync" },
  { t: -12, host: "app-4", source: "gunicorn", level: "INFO", text: "[1112] [INFO] Booting worker with pid: 1112", evidence: "gunicorn-1-worker" },
  { t: -2, host: "alb", source: "alb", level: "INFO", text: "pigeon-alb attributes: idle_timeout.timeout_seconds=10 (a target that hasn't answered in 10 s gets a 504)" },
  { t: -2, host: "alb", source: "alb", level: "INFO", text: "Target i-0a3fc1d2e5:80 (app-4) registered in pigeon-app-tg. Initial health check passed (GET /health → 200); in service.", evidence: "health-nginx" },
  { t: 45, host: "db-1", source: "postgres", level: "WARN", text: "LOG:  duration: 51034.870 ms  statement: SELECT user_id, count(*) FROM reactions GROUP BY 1 ORDER BY 2 DESC", evidence: "db-cron" },
];

function liveLogs(w: import("@/engine/types").WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  const t = w.t;
  for (const h of HOSTS) {
    const nw = w.nodes[h];
    if (!nw) continue;
    const broken = h === "app-4" && nw.p99 > 5;
    const n = broken ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (broken) {
        out.push({
          t: t + rand(),
          host: h,
          source: "nginx",
          level: "WARN",
          text: `${ALB_IP} - - "POST /api/checkout HTTP/1.1" 499 0 rt=10.001 urt=- ua="Pigeon/4.2 (Android)"`,
          evidence: "target-latency",
        });
      } else {
        const rt = Math.max(0.02, nw.p50 * (0.7 + rand() * 0.9));
        out.push({
          t: t + rand(),
          host: h,
          source: "nginx",
          level: "INFO",
          text: `${ALB_IP} - - "${rand() < 0.7 ? "POST /api/checkout" : "GET /api/feed"} HTTP/1.1" 200 ${Math.floor(600 + rand() * 900)} rt=${rt.toFixed(3)} urt=${(rt - 0.001).toFixed(3)}`,
        });
      }
    }
  }
  if (w.failReasons.timeout > 0 && Math.floor(t) % 3 === 0) {
    out.push({ t: t + 0.5, host: "alb", source: "alb", level: "ERROR", text: `504 GatewayTimeout ×${w.failReasons.timeout} in the last second · target ${ip("app-4")}:80 (app-4) · target_processing_time=-1`, evidence: "target-latency" });
  }
  const a4 = w.nodes["app-4"];
  if (a4 && a4.queue > 200 && Math.floor(t) % 7 === 0) {
    out.push({ t: t + 0.8, host: "app-4", source: "nginx", level: "INFO", text: 'epoll_wait() reported that client prematurely closed connection, so upstream connection is closed too while reading response header from upstream, request: "POST /api/checkout HTTP/1.1", upstream: "http://unix:/run/gunicorn.sock:/api/checkout"', evidence: "target-latency" });
  }
  return out;
}

const PS_OK = (pids: number, master = 902, firstWorker = 910) =>
  ["USER   PID  %CPU %MEM COMMAND", `pigeon ${master}   0.1  0.5 gunicorn: master [pigeon.wsgi]`, ...Array.from({ length: pids }, (_, i) => `pigeon ${firstWorker + i}  ${(2 + (i % 5)).toFixed(1)}  1.9 gunicorn: worker [pigeon.wsgi]`)].join("\n");

export const INC_FOURTH_BOX: Incident = {
  id: "inc-fourth-box",
  code: "INC-0001",
  title: "The Fourth Box",
  severity: "SEV-1",
  clock0: "02:12:00",
  pageAt: 120,
  page: { title: "checkout · 5xx 24% · SLO burn 24×", detail: "At this rate the month's error budget is gone in about 30 hours." },
  intro: [
    { speaker: "pager", line: "SEV-1: checkout error rate above 20% for 2 minutes. You are primary on-call." },
    { speaker: "meera", line: "I'm awake, but I'm not driving. Look before you touch anything." },
  ],
  spec: spec(),
  seed: "inc-fourth-box",
  slo: { p99: 0.4, errorRate: 0.01 },
  honestPhysics: [
    "app-4's queue is unbounded here. Real gunicorn has a 2,048-connection listen backlog; once it fills, new requests to app-4 fail fast with a 502 instead of waiting in line.",
    "The ALB idle timeout is assumed to be 10 s, which is what pairs the ALB's 504s with nginx's 499s in the logs.",
  ],
  hosts: HOSTS,
  services: ["alb", "app-1", "app-2", "app-3", "app-4", "db-1"],
  staticLogs: STATIC,
  liveLogs,
  commands: [
    {
      cmd: "ps aux | grep gunicorn",
      describe: "gunicorn processes",
      run: (h, s) => {
        const fixed = s.applied.includes("set-workers") || s.applied.includes("replace-template");
        return h === "app-4" && !fixed ? { out: PS_OK(1, 1107, 1112), evidence: "gunicorn-1-worker" } : { out: PS_OK(WORKERS) };
      },
    },
    {
      cmd: "cat /etc/pigeon/app.env",
      describe: "app environment",
      run: (h, s) => {
        const fixed = s.applied.includes("set-workers") || s.applied.includes("replace-template");
        const base = ["DJANGO_SETTINGS_MODULE=pigeon.settings.prod", "DATABASE_URL=postgres://pigeon:****@pigeon-prod.c9x2.ap-south-1.rds.amazonaws.com/pigeon", "REDIS_URL=redis://pigeon-cache.ap-south-1.cache.amazonaws.com:6379/0", "SENTRY_DSN=https://****@sentry.io/41"];
        if (h === "app-4" && !fixed) return { out: base.join("\n") + "\n# (no WEB_CONCURRENCY: gunicorn falls back to its default of 1 worker)", evidence: "env-missing" };
        return { out: [...base, `WEB_CONCURRENCY=${WORKERS}`].join("\n") };
      },
    },
    {
      cmd: "curl -s -w '%{http_code} %{time_total}s' localhost/health",
      describe: "the health check path",
      run: () => ({ out: "ok200 0.001s", evidence: "health-nginx" }),
    },
    {
      cmd: "curl -s -m 10 -w '%{http_code} %{time_total}s' localhost/api/checkout/ping",
      describe: "a real request through gunicorn",
      run: (h, s) => {
        const a4 = s.last?.nodes["app-4"];
        if (h === "app-4" && !s.applied.includes("set-workers") && !s.applied.includes("replace-template") && (a4?.queue ?? 0) > 50) return { out: "curl: (28) Operation timed out after 10001 milliseconds with 0 bytes received", evidence: "target-latency" };
        return { out: "{\"ok\":true}200 0.071s" };
      },
    },
    {
      cmd: "cat /etc/nginx/sites-enabled/pigeon",
      describe: "nginx config",
      run: () => ({
        out: ["server {", "    listen 80 default_server;", "    location = /health {", '        return 200 "ok";          # answered by nginx itself', "    }", "    location / {", "        proxy_pass http://unix:/run/gunicorn.sock;", "        proxy_read_timeout 60s;", "    }", "}"].join("\n"),
        evidence: "health-nginx",
      }),
    },
    {
      cmd: "uptime",
      describe: "load average",
      run: (h, s) => {
        const u = s.last?.nodes[h]?.util ?? 0.4;
        const load = h === "app-4" && !s.applied.includes("set-workers") ? 0.08 : 0.4 + u * 1.6;
        return { out: ` ${clockAt(s.t)} up ${h === "app-4" ? "3 min" : "41 days"},  1 user,  load average: ${load.toFixed(2)}, ${(load * 0.9).toFixed(2)}, ${(load * 0.7).toFixed(2)}`, evidence: h === "app-4" ? "cpu-low" : undefined };
      },
    },
    {
      cmd: "systemctl status gunicorn",
      describe: "service status",
      run: (h, s) => {
        const one = h === "app-4" && !s.applied.includes("set-workers") && !s.applied.includes("replace-template");
        return { out: `● gunicorn.service - Pigeon API (gunicorn)\n     Active: active (running)\n      Tasks: ${one ? 2 : WORKERS + 1} (limit: 9403)\n     Memory: ${one ? "196.4M" : "2.4G"}`, evidence: one ? "gunicorn-1-worker" : undefined };
      },
    },
    {
      cmd: "df -h /",
      describe: "disk space",
      run: () => ({ out: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1   30G  7.9G   22G  27% /" }),
    },
    {
      cmd: "free -m",
      describe: "memory",
      run: (h) => ({ out: `               total        used        free      shared  buff/cache   available\nMem:            7812        ${h === "app-4" ? 412 : 2960}        ${h === "app-4" ? 6890 : 3120}          12        ${h === "app-4" ? 510 : 1732}        ${h === "app-4" ? 7201 : 4610}` }),
    },
  ],
  evidence: [
    { id: "gunicorn-1-worker", label: "app-4 runs a single gunicorn worker", key: true },
    { id: "env-missing", label: "app-4's environment has no WEB_CONCURRENCY", key: true },
    { id: "target-latency", label: "Only app-4's requests time out (499s / 504s)", key: true },
    { id: "cpu-low", label: "app-4 is nearly idle while it fails", key: true },
    { id: "health-nginx", label: "/health is answered by nginx, not the app", key: true },
    { id: "asg-launch", label: "app-4 was launched from launch template v7 minutes ago", key: true },
    { id: "deploy-frontend", label: "A frontend deploy went out at 01:40", key: false },
    { id: "db-cron", label: "The nightly report is running heavy queries", key: false },
  ],
  hypotheses: [
    { id: "workers", label: "app-4 came up with one gunicorn worker (launch template v7 lost WEB_CONCURRENCY) and the shallow health check kept it in rotation", correct: true },
    { id: "deploy", label: "The 01:40 deploy introduced a slow code path in checkout", correct: false },
    { id: "db", label: "Postgres is saturated by the nightly report", correct: false },
    { id: "neighbour", label: "app-4 sits on a degraded host (noisy neighbour)", correct: false },
    { id: "alb", label: "The load balancer itself is out of capacity", correct: false },
    { id: "traffic", label: "A traffic spike is overloading the whole fleet", correct: false },
  ],
  mitigations: [
    {
      id: "deregister",
      label: "Deregister app-4 from the target group",
      detail: "Stop sending it traffic. In-flight requests on it will still time out.",
      takesS: 5,
      kind: "mitigate",
      patches: () => [{ delay: 5, patch: { op: "set", node: "lb", changes: { targets: ["app-1", "app-2", "app-3"] } } }],
      note: "app-4 deregistered: three boxes carry checkout.",
    },
    {
      id: "lor",
      label: "Switch the ALB to least outstanding requests",
      detail: "Routes each request to the target with the fewest in flight.",
      takesS: 10,
      kind: "mitigate",
      patches: () => [{ delay: 10, patch: { op: "set", node: "lb", changes: { algorithm: "least-outstanding" } } }],
      note: "Target group routing algorithm changed to least_outstanding_requests.",
    },
    {
      id: "deep-hc",
      label: "Point the health check at a real app path",
      detail: "GET /api/health through gunicorn instead of nginx's /health.",
      takesS: 15,
      kind: "mitigate",
      patches: () => [{ delay: 15, patch: { op: "set", node: "lb", changes: { healthCheck: { intervalS: 10, timeoutS: 5, unhealthyThreshold: 2, healthyThreshold: 3, deep: true } } } }],
      note: "Health check path changed to /api/health (through gunicorn).",
    },
    {
      id: "set-workers",
      label: "Set WEB_CONCURRENCY=16 on app-4 and restart gunicorn",
      detail: "Hand-fix the box. It drops what's queued while it restarts.",
      takesS: 20,
      kind: "fix",
      patches: () => [
        { delay: 20, patch: { op: "set", node: "app-4", changes: { workers: WORKERS } } },
        { delay: 20, patch: { op: "restart", node: "app-4" } },
      ],
      note: "app-4: WEB_CONCURRENCY=16, gunicorn restarted with 16 workers.",
    },
    {
      id: "replace-template",
      label: "Fix the launch template (v8) and replace app-4",
      detail: "The real fix: new instances boot correctly. Takes a while.",
      takesS: 20,
      kind: "fix",
      patches: () => {
        const base = spec().nodes.find((n) => n.id === "app-1") as ServerSpec;
        return [
          { delay: 20, patch: { op: "launch", spec: { ...base, id: "app-5", label: "app-5", workers: WORKERS }, lb: "lb", bootS: 60 } },
          { delay: 85, patch: { op: "set", node: "lb", changes: { targets: ["app-1", "app-2", "app-3", "app-5"] } } },
          { delay: 90, patch: { op: "remove", node: "app-4" } },
        ];
      },
      note: "Launch template pigeon-app v8 (WEB_CONCURRENCY restored). app-5 launched; app-4 will be terminated.",
    },
    {
      id: "restart",
      label: "Restart app-4",
      detail: "Turn it off and on again.",
      takesS: 5,
      kind: "harmful",
      patches: () => [{ delay: 5, patch: { op: "restart", node: "app-4" } }],
      note: "app-4 rebooting.",
    },
    {
      id: "scale-out",
      label: "Scale out: add two instances",
      detail: "More capacity from the Auto Scaling group.",
      takesS: 10,
      kind: "harmful",
      patches: () => {
        const base = spec().nodes.find((n) => n.id === "app-4") as ServerSpec;
        return [
          { delay: 10, patch: { op: "launch", spec: { ...base, id: "app-6", label: "app-6", workers: 1 }, lb: "lb", bootS: 60 } },
          { delay: 10, patch: { op: "launch", spec: { ...base, id: "app-7", label: "app-7", workers: 1 }, lb: "lb", bootS: 60 } },
        ];
      },
      note: "ASG desired capacity 4 → 6: two instances launching from launch template v7.",
    },
    {
      id: "rollback",
      label: "Roll back the 01:40 deploy",
      detail: "Revert v2.14.3.",
      takesS: 90,
      kind: "neutral",
      patches: () => [],
      note: "Rollback to v2.14.2 complete (frontend assets reverted).",
    },
    {
      id: "kill-report",
      label: "Kill the nightly report query",
      detail: "pg_cancel_backend on the report's backend.",
      takesS: 5,
      kind: "neutral",
      patches: () => [],
      note: "nightly-report cancelled. db-1 CPU dropping.",
    },
  ],
  traces: [
    {
      id: "slow",
      title: "POST /api/checkout · 504 · via app-4",
      status: 504,
      evidence: "target-latency",
      spans: [
        { name: "ALB → target app-4", start: 0, ms: 10000, depth: 0, kind: "net" },
        { name: "nginx (app-4) → unix:/run/gunicorn.sock", start: 1, ms: 9999, depth: 1, kind: "net" },
        { name: "waiting for a free gunicorn worker (listen backlog)", start: 2, ms: 9998, depth: 2, kind: "queue" },
      ],
    },
    {
      id: "fast",
      title: "POST /api/checkout · 200 · via app-2",
      status: 200,
      spans: [
        { name: "ALB → target app-2", start: 0, ms: 72, depth: 0, kind: "net" },
        { name: "nginx (app-2) → gunicorn", start: 0.4, ms: 71, depth: 1, kind: "net" },
        { name: "django view: CheckoutView.post", start: 0.8, ms: 70, depth: 2, kind: "cpu" },
        { name: "redis GET session", start: 1.2, ms: 0.6, depth: 3, kind: "cache" },
        { name: "postgres: INSERT orders + UPDATE carts", start: 12, ms: 48, depth: 3, kind: "db" },
      ],
    },
  ],
  timeline: [
    { t: -1908, label: "deploy v2.14.3 (frontend assets)", kind: "deploy" },
    { t: -720, label: "nightly-report cron starts on db-1", kind: "cron" },
    { t: -58, label: "ASG launches app-4 (template v7)", kind: "scale" },
    { t: 0, label: "app-4 in service", kind: "scale" },
    { t: 120, label: "Page: checkout 5xx > 20%", kind: "page" },
  ],
  extraSeries: [{ id: "db-cpu", label: "db-1 CPU", unit: "%", at: (t) => (t < -720 ? 36 : 70 + 4 * Math.sin(t / 9)) }],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact concretely (about a quarter of checkouts failing, for how long)" },
      { id: "cause", criterion: "Root cause: app-4 launched from a template missing WEB_CONCURRENCY, so gunicorn ran 1 worker and couldn't keep up with its share" },
      { id: "detect", criterion: "Why it wasn't caught: the health check was answered by nginx, so the ALB kept a broken box in rotation" },
      { id: "prevent", criterion: "Prevention: a health check through the app, validated launch templates or config (exercise a new template version before autoscaling first uses it; fail boot when WEB_CONCURRENCY is missing), and/or per-target latency alarms" },
      { id: "mitigate", criterion: "States what stopped the bleeding (deregistering or fixing app-4) and when, relative to the page" },
    ],
    exemplar:
      "What happened: from 02:12 to about 02:20, roughly 25% of checkouts timed out. Root cause: the autoscaler launched app-4 from launch template v7, which dropped WEB_CONCURRENCY, so gunicorn ran a single worker; round-robin kept sending it a quarter of traffic and requests queued until clients gave up. v7 was created on 2026-09-26 but nothing used it until this scale-out. Mitigation: taking app-4 out of rotation at about 02:20, six minutes after the page, stopped the errors. Prevention: health check through gunicorn instead of nginx, exercise new template versions when they're created, a startup check that fails if the worker count is wrong, and an alarm on per-target latency.",
  },
  hints: [
    "The fleet is healthy on average. Is every box healthy? Look at the targets one by one.",
    "One box is failing while barely using its CPU. What resource runs out before CPU does?",
    "Compare that box with a healthy one on the host itself: processes and configuration. And ask yourself why the load balancer still trusts it.",
  ],
  exercises: ["littles-law", "load-balancing", "scale-up-vs-out"],
};
