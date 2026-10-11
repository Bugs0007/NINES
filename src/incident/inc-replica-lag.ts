/**
 * INC-0005 · My Post Disappeared.
 *
 * Posts are written to the primary and read from three replicas. An analytics query has been running on replica-3 for
 * 41 minutes. With max_standby_streaming_delay = -1, WAL replay on that replica pauses whenever it conflicts with the
 * query, so replica-3 is 94 seconds behind. A third of reads land on it. Users post, reload, and the post is gone.
 * The sim stands in for "stale read" with a read that fails (a 404 on the row that exists on the primary).
 * Red herrings: a network blip earlier and a deploy that moved the profile page to read replicas.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const REPLICAS = ["replica-1", "replica-2", "replica-3"];

function spec(): SimSpec {
  const replica = (id: string, errorRate = 0): ServerSpec => ({
    kind: "db",
    id,
    label: id,
    cores: 4,
    workers: 16,
    steps: [{ kind: "io", dist: { kind: "lognormal", median: 0.012, p99: 0.05 } }],
    failure: errorRate ? { errorRate } : undefined,
  });
  return {
    nodes: [
      { kind: "client", id: "users", target: "lb", rate: { kind: "const", rps: 160 }, users: 8000, timeoutS: 3 },
      { kind: "lb", id: "lb", label: "read router", targets: REPLICAS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0003 } },
      replica("replica-1"),
      replica("replica-2"),
      replica("replica-3", 0.9),
      replica("primary"),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -3600, host: "ci", source: "deploy", level: "INFO", text: "deploy web v12.4.0: GET /profile and GET /post/:id now read from replicas (was primary)", evidence: "deploy-replicas" },
  { t: -2460, host: "replica-3", source: "postgres", level: "INFO", text: "LOG:  statement: SELECT user_id, count(*) FROM posts p JOIN events e USING (user_id) GROUP BY 1 (analytics, role bi_readonly)", evidence: "long-query" },
  { t: -1800, host: "net", source: "app", level: "WARN", text: "monitor: 3 s of packet loss between az-a and az-b (recovered)", evidence: "net-blip" },
  { t: -900, host: "replica-3", source: "postgres", level: "WARN", text: "LOG:  recovery is paused: canceling statement due to conflict is disabled (max_standby_streaming_delay = -1)", evidence: "replay-paused" },
  { t: -300, host: "replica-3", source: "postgres", level: "WARN", text: "replication lag 61.4 s (primary lsn 4F/A81C2210, replay lsn 4F/A7A09B48)", evidence: "lag" },
  { t: -60, host: "web-1", source: "app", level: "ERROR", text: "GET /post/9917702 404 (just created by POST /post 1.4 s earlier, user 21877; served by replica-3)", evidence: "lag" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failed > 0) out.push({ t: w.t + rand(), host: "web-1", source: "app", level: "ERROR", text: "GET /post/" + (9917000 + Math.floor(rand() * 900)) + " 404 (row exists on primary; served by replica-3, lag " + Math.round(94 + w.t) + " s)", evidence: "lag" });
  if (Math.floor(w.t) % 7 === 0) out.push({ t: w.t + 0.2, host: "replica-3", source: "postgres", level: "WARN", text: "LOG:  recovery paused for 8.4 s waiting for a conflicting query (pid 8812)", evidence: "replay-paused" });
  return out;
}

const cleared = (s: { applied: string[] }) => s.applied.includes("kill-analytics") || s.applied.includes("drain-replica") || s.applied.includes("read-primary");

export const INC_REPLICA_LAG: Incident = {
  id: "inc-replica-lag",
  code: "INC-0005",
  title: "My Post Disappeared",
  severity: "SEV-2",
  clock0: "16:20:00",
  pageAt: 100,
  page: { title: "Users report new posts missing after reload", detail: "Support tickets: 'I posted and it vanished'. 404 rate on post pages at 30% for two minutes. Writes are succeeding." },
  intro: [
    { speaker: "pager", line: "SEV-2: post and profile pages return 404 for rows that exist. The primary is healthy and writes succeed." },
    { speaker: "meera", line: "A row that exists on one machine and not on another is a lag problem until proven otherwise. Find which machine is behind and why." },
  ],
  spec: spec(),
  seed: "inc-replica-lag",
  service: "post pages",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "A stale read is shown as a failed request (the 404) because the sim has no notion of data versions. In production the user sees an old page, or a missing row, with no error at all, and nothing in the error rate would tell you.",
    "Reads rotate evenly over three replicas; the routing layer is a plain round-robin balancer with no lag awareness, which is the gap the fix list names.",
  ],
  hosts: ["web-1", "primary", ...REPLICAS],
  services: ["read-router", "primary", ...REPLICAS],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("read replicas", REPLICAS, (id, nw) => (id === "replica-3" && nw.errors > 0 ? "lag" : undefined), {
    nodes: [
      { id: "users", label: "web", kind: "client", x: 60, y: 300 },
      { id: "lb", label: "read router", kind: "lb", x: 300, y: 300 },
      { id: "replica-1", label: "replica-1", kind: "db", x: 620, y: 140 },
      { id: "replica-2", label: "replica-2", kind: "db", x: 620, y: 300 },
      { id: "replica-3", label: "replica-3", kind: "db", x: 620, y: 460 },
    ],
    edges: [
      { from: "users", to: "lb" },
      { from: "lb", to: "replica-1" },
      { from: "lb", to: "replica-2" },
      { from: "lb", to: "replica-3" },
    ],
  }),
  commands: [
    {
      cmd: "psql -h replica-3 -c \"select now() - pg_last_xact_replay_timestamp() as lag\"",
      describe: "how far behind replica-3 is",
      run: (h, s) => ({ out: cleared(s) ? " lag\n------\n 00:00:00.4" : " lag\n----------------\n 00:01:34.113", evidence: cleared(s) ? undefined : "lag" }),
    },
    {
      cmd: "psql -h replica-1 -c \"select now() - pg_last_xact_replay_timestamp() as lag\"",
      describe: "how far behind replica-1 is",
      run: () => ({ out: " lag\n------\n 00:00:00.3" }),
    },
    {
      cmd: "psql -h replica-3 -c \"select pid, now()-query_start as running, left(query,50) from pg_stat_activity where state='active' and usename='bi_readonly'\"",
      describe: "what is running on replica-3",
      run: (h, s) => ({ out: cleared(s) ? "(0 rows)" : " pid  | running  | left\n------+----------+-------------------------------------------\n 8812 | 00:41:07 | SELECT user_id, count(*) FROM posts p JOIN events e", evidence: cleared(s) ? undefined : "long-query" }),
    },
    {
      cmd: "psql -h replica-3 -c \"show max_standby_streaming_delay\"",
      describe: "how long replay waits for conflicting queries",
      run: () => ({ out: " max_standby_streaming_delay\n-----------------------------\n -1\n(replay waits forever for conflicting queries)", evidence: "replay-paused" }),
    },
    { cmd: "ping -c 3 replica-3", describe: "network to replica-3", run: () => ({ out: "3 packets transmitted, 3 received, 0% packet loss, time 2003ms\nrtt min/avg/max = 0.41/0.44/0.49 ms" }) },
    uptime((h, s) => (h === "replica-3" && !cleared(s) ? 3.8 : 0.5)),
    free(() => 5200),
    df(),
  ],
  evidence: [
    { id: "lag", label: "replica-3 is 94 seconds behind the primary", key: true },
    { id: "long-query", label: "A 41-minute analytics query runs on replica-3", key: true },
    { id: "replay-paused", label: "WAL replay on replica-3 is paused by that query (max_standby_streaming_delay = -1)", key: true },
    { id: "deploy-replicas", label: "A deploy moved post and profile reads to the replicas", key: false },
    { id: "net-blip", label: "A 3-second network blip at 15:50", key: false },
  ],
  hypotheses: [
    { id: "lag", label: "Replica-3 is far behind the primary because a long analytics query pauses its WAL replay, and a third of reads land on it", correct: true },
    { id: "net", label: "Network loss between zones is dropping replication traffic", correct: false },
    { id: "write", label: "Writes are failing intermittently and the posts were never saved", correct: false },
    { id: "deploy", label: "The v12.4.0 deploy has a bug that returns 404 for new posts", correct: false },
    { id: "cache", label: "A stale cache is serving the old pages", correct: false },
  ],
  mitigations: [
    {
      id: "drain-replica",
      label: "Take replica-3 out of the read router",
      detail: "Reads go to replica-1 and replica-2. The analytics query keeps running.",
      takesS: 10,
      kind: "mitigate",
      patches: () => [{ delay: 10, patch: { op: "set", node: "lb", changes: { targets: ["replica-1", "replica-2"] } } }],
      note: "read-router: replica-3 removed from rotation. 404s from stale reads stop; analytics unaffected.",
    },
    {
      id: "kill-analytics",
      label: "Cancel the analytics query on replica-3 (pg_cancel_backend 8812)",
      detail: "Replay resumes and the lag drains over about a minute.",
      takesS: 15,
      kind: "fix",
      patches: () => [{ delay: 15, patch: { op: "set", node: "replica-3", changes: { failure: { errorRate: 0 } } } }],
      note: "pg_cancel_backend(8812). Replay resumes; replica-3 catches up. Analytics rerun moved to a dedicated replica.",
    },
    {
      id: "read-primary",
      label: "Send post and profile reads to the primary",
      detail: "Reads that follow a write go to the node that has the write.",
      takesS: 20,
      kind: "mitigate",
      patches: () => [{ delay: 20, patch: { op: "set", node: "lb", changes: { targets: ["primary"] } } }],
      note: "READ_FROM_PRIMARY=true for /post and /profile. The primary carries all reads; it has headroom at this traffic.",
    },
    decoy("restart-replica", "Restart replica-3", "Restart the Postgres process.", "replica-3 restarted. The analytics query is gone, but the lag it caused would have drained on its own; the restart is not why the 404s stop.", 40),
    { ...decoy("add-replica", "Add a fourth replica", "Spin up replica-4 from a base backup.", "replica-4 is restoring from a base backup (about 40 minutes). Nothing changes now.", 2400, "harmful"), patches: () => [] },
    decoy("fix-network", "Open a ticket with the network team", "Report the 3-second packet loss.", "Ticket filed. Ping to replica-3 shows no loss.", 5),
    decoy("rollback-web", "Roll back web v12.4.0", "Reads go back to the primary after the rollback finishes.", "Rollback to v12.3.9 takes nine minutes to roll across the fleet.", 540),
  ],
  traces: [
    {
      id: "stale",
      title: "GET /post/9917702 · 404 · web-1 (user 21877, 1.4 s after posting)",
      status: 404,
      evidence: "lag",
      spans: [
        { name: "web-1 handler", start: 0, ms: 18, depth: 0, kind: "cpu" },
        { name: "read router → replica-3", start: 2, ms: 3, depth: 1, kind: "net" },
        { name: "postgres replica-3: SELECT … WHERE id = 9917702 (0 rows; replay 94 s behind)", start: 5, ms: 11, depth: 1, kind: "db" },
      ],
    },
    {
      id: "fresh",
      title: "GET /post/9917702 · 200 · web-2 (same post, replica-1)",
      status: 200,
      spans: [
        { name: "web-2 handler", start: 0, ms: 20, depth: 0, kind: "cpu" },
        { name: "read router → replica-1", start: 2, ms: 3, depth: 1, kind: "net" },
        { name: "postgres replica-1: SELECT … WHERE id = 9917702 (1 row)", start: 5, ms: 12, depth: 1, kind: "db" },
      ],
    },
  ],
  timeline: [
    { t: -3600, label: "deploy v12.4.0: profile and post reads use replicas", kind: "deploy" },
    { t: -2460, label: "analytics query starts on replica-3", kind: "cron" },
    { t: -1800, label: "3 s network blip", kind: "scale" },
    { t: -900, label: "replay on replica-3 pauses", kind: "cron" },
    { t: 100, label: "Page: 404s on posts that exist", kind: "page" },
  ],
  extraSeries: [{ id: "lag-s", label: "replica-3 lag (seconds, scaled)", unit: "%", at: (t) => (t < -900 ? 3 : Math.min(100, 20 + (t + 900) / 12)) }],
  evidenceVia: ["long-query", "replay-paused"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: a share of reads served stale or missing rows, mostly for users reloading just after a write, and for how long" },
      { id: "cause", criterion: "Root cause: a long analytics query on replica-3 paused WAL replay (max_standby_streaming_delay = -1), leaving it about 94 seconds behind while the router still sent it a third of reads" },
      { id: "detect", criterion: "Why it was hard: writes succeeded, the primary was healthy, and the error was a wrong answer served quickly, so there was no latency or load signal" },
      { id: "prevent", criterion: "Prevention: run analytics on a dedicated replica, set a finite standby delay, route by lag (drop replicas over a threshold), read your own writes from the primary, alert on replication lag" },
      { id: "mitigate", criterion: "States what stopped it and why: draining the lagging replica or cancelling the query, not a restart or more replicas" },
    ],
    exemplar:
      "What happened: Between 16:21 and about 16:28 roughly a third of reads of new posts returned 404. Root cause: a 41-minute analytics query on replica-3 paused WAL replay because the standby delay was unlimited, so that replica fell 94 seconds behind, and the read router kept sending it a third of reads. The network blip and the v12.4.0 deploy were background: the deploy only moved reads onto replicas, which is how the lag became visible. Mitigation: draining replica-3 from the router ended the errors, and cancelling the query let it catch up. Prevention: put analytics on its own replica, bound the standby delay, route away from replicas over a lag threshold, serve a user's own writes from the primary, and alert on replication lag.",
  },
  hints: [
    "The primary is healthy and writes succeed. Which machines serve the reads that fail?",
    "Compare how recent each replica's data is. One of three is not like the others.",
    "What is that replica doing that the others are not, and what does Postgres do when a query on a replica conflicts with replay?",
  ],
  exercises: ["replication-lag"],
};
