/**
 * INC-0008 · The Message That Kills Workers.
 *
 * A producer started sending invoice-generation messages with a null currency field at 09:12. The consumer throws on
 * them after hanging for the 15 s processing timeout, the queue redelivers them with no limit, and 3% of deliveries
 * now pin a worker for 15 s. With 100 messages a second that is about 45 workers' worth of hung work against 32
 * workers, so good messages wait behind poisoned ones and time out.
 * Red herrings: a consumer autoscaling event and a broker version bump.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const WORKERS = ["worker-1", "worker-2", "worker-3", "worker-4"];
const FAST = { kind: "lognormal", median: 0.03, p99: 0.12 } as const;
const POISONED = { kind: "mix", p: 0.97, a: FAST, b: { kind: "const", value: 15 } } as const;

const worker = (id: string, workers = 8, dist: ServerSpec["steps"][number] = { kind: "io", dist: POISONED }): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers, queueLimit: 200, steps: [dist], bootS: 20 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "invoice messages", target: "lb", rate: { kind: "const", rps: 100 }, users: 5000, timeoutS: 8, retry: { maxAttempts: 3, backoff: "constant", baseS: 1, capS: 1, jitter: "none" } },
      { kind: "lb", id: "lb", label: "queue (SQS-style)", targets: WORKERS, algorithm: "least-outstanding", overhead: { kind: "const", value: 0.0003 } },
      ...WORKERS.map((id) => worker(id)),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -9000, host: "ci", source: "deploy", level: "INFO", text: "broker upgraded 3.11 -> 3.12 (no config changes)", evidence: "broker-bump" },
  { t: -3600, host: "billing-api", source: "deploy", level: "INFO", text: "deploy billing-api v4.7.0: invoice events now published for subscription plans without currency (currency: null)", evidence: "bad-producer" },
  { t: -3300, host: "worker-2", source: "app", level: "ERROR", text: "TypeError: unsupported operand type(s) for *: 'NoneType' and 'Decimal' in invoice.total() (message 7d3f, receive count 14)", evidence: "poison" },
  { t: -3000, host: "worker-4", source: "app", level: "ERROR", text: "worker killed by processing timeout 15 s; message 7d3f returned to queue (receive count 22)", evidence: "poison" },
  { t: -1800, host: "autoscaler", source: "asg", level: "INFO", text: "consumer group scaled 2 -> 4 workers on queue depth", evidence: "scaled" },
  { t: -600, host: "queue", source: "app", level: "WARN", text: "queue depth 8,412; oldest message age 4 min; ApproximateReceiveCount max 61; no redrive policy / no DLQ configured", evidence: "no-dlq" },
  { t: -60, host: "worker-1", source: "app", level: "ERROR", text: "worker killed by processing timeout 15 s; message 7d3f returned to queue (receive count 63)", evidence: "poison" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0) out.push({ t: w.t + rand(), host: WORKERS[Math.floor(rand() * 4)]!, source: "app", level: "ERROR", text: "worker killed by processing timeout 15 s; message " + ["7d3f", "9a02", "c117"][Math.floor(rand() * 3)] + " returned to queue (receive count " + (60 + Math.floor(w.t)) + ")", evidence: "poison" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const INC_POISON: Incident = {
  id: "inc-poison-message",
  code: "INC-0008",
  title: "The Message That Kills Workers",
  severity: "SEV-2",
  clock0: "10:05:00",
  pageAt: 80,
  page: { title: "Invoices are not being generated", detail: "Queue depth rising, oldest message 4 minutes old. All four workers look busy and none is processing much." },
  intro: [
    { speaker: "pager", line: "SEV-2: invoice queue growing. Every worker is at 100% busy and throughput has collapsed." },
    { speaker: "meera", line: "Busy workers and no throughput means they are stuck on something. Read what they are stuck on, and how many times they have seen it." },
  ],
  spec: spec(),
  seed: "inc-poison-message",
  service: "invoices",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "A poison message is modelled as a 3% chance that any delivery hangs for 15 s. A real poison message hangs every time it is delivered, so it would eat the same workers continuously until removed; the aggregate load is the same.",
    "Producer-side validation is modelled as the bad messages simply stopping.",
  ],
  hosts: ["queue", ...WORKERS, "billing-api"],
  services: ["queue", ...WORKERS],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("invoice consumers", WORKERS, (id, nw) => (nw.workerUtil > 0.9 ? "poison" : undefined), {
    nodes: [
      { id: "users", label: "producers", kind: "client", x: 60, y: 300 },
      { id: "lb", label: "queue", kind: "lb", x: 300, y: 300 },
      ...WORKERS.map((id, i) => ({ id, label: id, kind: "server" as const, x: 640, y: 120 + i * 120, workers: 8, cores: 4 })),
    ],
    edges: [{ from: "users", to: "lb" }, ...WORKERS.map((id) => ({ from: "lb", to: id }))],
  }),
  commands: [
    {
      cmd: "queuectl stats invoices",
      describe: "queue depth and receive counts",
      run: (h, s) => ({ out: has(s, "dlq", "short-timeout", "fix-producer") ? "depth 340 (draining)\noldest 11 s\nmax receive count 3\nDLQ: 14 messages" : "depth 8,412\noldest 4m02s\nmax receive count 63\nredrive policy: none\nDLQ: not configured", evidence: has(s, "dlq", "short-timeout", "fix-producer") ? undefined : "no-dlq" }),
    },
    {
      cmd: "queuectl peek invoices --max-receive-count 20",
      describe: "show the most-redelivered messages",
      run: (h, s) => ({ out: has(s, "dlq") ? "(no messages above receive count 3)" : "id=7d3f receives=63 body={\"customer\":\"c_4821\",\"plan\":\"legacy\",\"amount\":1200,\"currency\":null}\nid=9a02 receives=41 body={\"customer\":\"c_1190\",\"plan\":\"legacy\",\"amount\":900,\"currency\":null}\nid=c117 receives=38 body={...,\"currency\":null}", evidence: has(s, "dlq") ? undefined : "poison" }),
    },
    { cmd: "top -bn1 | head -5", describe: "CPU", run: () => ({ out: "%Cpu(s):  3.0 us, 1.0 sy, 96.0 id\n(workers are in sleep(15): waiting on a stuck handler, not computing)" }) },
    uptime(() => 0.3),
    free(() => 1800),
    df(),
  ],
  evidence: [
    { id: "poison", label: "The same few messages keep timing out workers, with receive counts above 60", key: true },
    { id: "no-dlq", label: "The queue has no redrive policy or dead-letter queue", key: true },
    { id: "bad-producer", label: "billing-api v4.7.0 started publishing invoices with currency: null", key: true },
    { id: "scaled", label: "Consumers were autoscaled from 2 to 4 workers", key: false },
    { id: "broker-bump", label: "The broker was upgraded this morning", key: false },
  ],
  hypotheses: [
    { id: "poison", label: "A malformed message is redelivered forever and each delivery hangs a worker, so good messages starve", correct: true },
    { id: "capacity", label: "The queue simply has more messages than four workers can handle", correct: false },
    { id: "broker", label: "The broker upgrade broke message delivery", correct: false },
    { id: "cpu", label: "The workers are CPU-bound", correct: false },
    { id: "net", label: "A network problem between the queue and the workers", correct: false },
  ],
  mitigations: [
    {
      id: "dlq",
      label: "Set a redrive policy: dead-letter after 3 receives",
      detail: "Poisoned messages go to a DLQ for inspection and stop consuming workers.",
      takesS: 25,
      kind: "fix",
      patches: () => WORKERS.map((id) => ({ delay: 25, patch: { op: "set" as const, node: id, changes: { steps: [{ kind: "io", dist: FAST }] } } })),
      note: "redrivePolicy maxReceiveCount=3, deadLetterTargetArn=invoices-dlq. 14 messages moved to the DLQ; the backlog drains.",
    },
    {
      id: "short-timeout",
      label: "Cut the processing timeout from 15 s to 2 s",
      detail: "A stuck message holds a worker for 2 s instead of 15 s.",
      takesS: 20,
      kind: "mitigate",
      patches: () => WORKERS.map((id) => ({ delay: 20, patch: { op: "set" as const, node: id, changes: { steps: [{ kind: "io", dist: { kind: "mix", p: 0.97, a: FAST, b: { kind: "const", value: 2 } } }] } } })),
      note: "visibility/processing timeout 15 s -> 2 s. Poisoned deliveries still happen, but each frees its worker 7x sooner.",
    },
    {
      id: "fix-producer",
      label: "Roll back billing-api to v4.6.3",
      detail: "Stops new null-currency messages; the ones already in the queue remain until drained.",
      takesS: 90,
      kind: "mitigate",
      patches: () => WORKERS.map((id) => ({ delay: 90, patch: { op: "set" as const, node: id, changes: { steps: [{ kind: "io", dist: FAST }] } } })),
      note: "billing-api v4.6.3 live. No new poisoned messages; stuck ones are purged from the queue by hand.",
    },
    {
      ...decoy("more-workers", "Add four more consumer workers", "Double the consumer group.", "consumer group 4 -> 8 workers. Each new worker eats one poisoned message and hangs like the others.", 25, "harmful"),
      patches: () => WORKERS.map((id) => ({ delay: 25, patch: { op: "set" as const, node: id, changes: { workers: 10 } } })),
    },
    decoy("revert-broker", "Roll back the broker upgrade", "Downgrade to 3.11.", "Broker rolled back. Messages are delivered exactly as before; the receive counts keep climbing.", 300),
    { ...decoy("restart-workers", "Restart all workers", "Rolling restart of the consumer group.", "workers restarted; the poisoned messages were redelivered at once.", 20), patches: () => WORKERS.map((id) => ({ delay: 20, patch: { op: "restart" as const, node: id } })) },
    decoy("purge-queue", "Ask for approval to purge the whole queue", "Delete every message to start clean.", "Awaiting approval from billing: purging would delete 8,412 unbilled invoices.", 600),
  ],
  traces: [
    {
      id: "stuck",
      title: "consume invoice 7d3f · killed by timeout · worker-4",
      status: 500,
      evidence: "poison",
      spans: [
        { name: "receive (ApproximateReceiveCount=22)", start: 0, ms: 4, depth: 0, kind: "net" },
        { name: "invoice.total() raised TypeError, handler retries internally", start: 4, ms: 14990, depth: 0, kind: "cpu" },
        { name: "processing timeout; message returned to queue", start: 14994, ms: 2, depth: 0, kind: "queue" },
      ],
    },
    {
      id: "ok",
      title: "consume invoice 7d90 · 200 · worker-1 (good message)",
      status: 200,
      spans: [
        { name: "receive", start: 0, ms: 4, depth: 0, kind: "net" },
        { name: "invoice.total() + render PDF", start: 4, ms: 36, depth: 0, kind: "cpu" },
        { name: "delete message", start: 41, ms: 3, depth: 0, kind: "net" },
      ],
    },
  ],
  timeline: [
    { t: -9000, label: "broker upgraded to 3.12", kind: "deploy" },
    { t: -3600, label: "billing-api v4.7.0 starts sending null currency", kind: "deploy" },
    { t: -1800, label: "consumers autoscaled 2 to 4", kind: "scale" },
    { t: 80, label: "Page: invoices not generating", kind: "page" },
  ],
  extraSeries: [{ id: "depth", label: "Queue depth (x100 messages, capped)", unit: "%", at: (t) => Math.min(100, Math.max(0, (t + 3600) / 36 + (t > 0 ? t / 4 : 0))) }],
  evidenceVia: [],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: invoices delayed, queue depth and oldest-message age, and that good messages were blocked behind a few bad ones" },
      { id: "cause", criterion: "Root cause: a producer change sent messages that the consumer cannot process; with no redrive limit they were redelivered forever and each delivery held a worker until the timeout" },
      { id: "detect", criterion: "Why capacity was not the problem: workers were busy but idle on CPU; the signal was receive counts above 60 and no DLQ" },
      { id: "prevent", criterion: "Prevention: dead-letter queue with a small max receive count, validate at the producer and the consumer, a short processing timeout, and alarms on DLQ depth and oldest message age" },
      { id: "mitigate", criterion: "States what worked (redrive to a DLQ, shortening the timeout, or rolling back the producer) and why adding workers did not" },
    ],
    exemplar:
      "What happened: From 10:04 invoices stopped generating; the queue reached 8,400 messages. Root cause: billing-api v4.7.0 published invoices with a null currency; the consumer raised on them and hung for the 15 s processing timeout; the queue had no redrive policy, so each message came back immediately. About three percent of deliveries pinned a worker for 15 s, more than the group could absorb, and the good messages waited behind them. Adding workers made no difference. Mitigation: a dead-letter policy after three receives removed the poisoned messages and the backlog drained. Prevention: DLQ with maxReceiveCount, validation on both sides, a short timeout, and alerts on DLQ depth and oldest message age.",
  },
  hints: [
    "Workers are at 100% busy but the CPU is idle. What are they waiting on?",
    "Look at how many times the same messages have been delivered.",
    "What stops a message that always fails from being delivered forever?",
  ],
  exercises: ["dlq-poison"],
};
