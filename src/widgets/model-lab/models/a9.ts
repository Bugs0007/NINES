/**
 * Chapter A9 "Moving messages" models: queues versus logs, delivery semantics, poison messages, backpressure,
 * fan-out, event-driven flows, CQRS, event sourcing, and a Postgres queue. All are explicit closed forms or
 * fluid models with labelled round constants (see each model's `honest` text).
 */
import { Rng } from "../../../engine/rng";
import { lognormal } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ queues vs logs

export const brokerLab: LabModel = {
  id: "broker-lab",
  metrics: ["maxRate", "replayDays", "ordered", "subscribers", "storageTB"],
  observes: ["queue-limit", "log-replay"],
  scenes: ["queue", "log", "partitions"],
  runLabel: "Choose the broker",
  honest: [
    "A stream of 20,000 events a second, 1 KB each, that three independent systems (billing, search, analytics) must each see in full. One consumer handles 1,000 events a second, so 20 consumers are needed in parallel.",
    "A queue (SQS-style) deletes a message once one consumer acknowledges it: adding consumers adds throughput, but three subscribers means three queues fed by a fan-out, there is no replay, and strict order is only available in a FIFO queue, whose ceiling in this lab is 3,000 messages a second.",
    "A log (Kafka-style) keeps messages for the retention period, in order within each partition. Parallelism is capped by the number of partitions (one consumer per partition per group), every group reads the whole log, and storage is rate × size × retention.",
  ],
  init: () => ({ engine: "queue", partitions: 8, retention: 1, ordered: false }),
  controls: () => [
    { kind: "choice", id: "engine", label: "Broker", options: [{ id: "queue", label: "Queue: delete on acknowledge" }, { id: "log", label: "Log: keep and replay" }] },
    { kind: "slider", id: "partitions", label: "Partitions (log)", min: 1, max: 64, step: 1, fmt: "int" },
    { kind: "slider", id: "retention", label: "Retention (log)", min: 1, max: 30, step: 1, fmt: "int", hint: "days" },
    { kind: "toggle", id: "ordered", label: "Each customer's events must stay in order" },
  ],
  evaluate: (v) => {
    const log = str(v, "engine") === "log";
    const ordered = bool(v, "ordered");
    const parts = Math.round(num(v, "partitions"));
    const ret = Math.round(num(v, "retention"));
    const maxRate = log ? parts * 1000 : ordered ? 3000 : 100000;
    const replay = log ? ret : 0;
    const orderOk = log ? 1 : ordered ? 1 : 0;
    const subs = log ? 3 : 1;
    const tb = log ? (20000 * 1000 * 86400 * ret) / 1e12 : 0;
    const need = 20000;
    return {
      metrics: { maxRate, replayDays: replay, ordered: orderOk, subscribers: subs, storageTB: tb },
      readouts: [
        { label: "Most events a second it can process", value: maxRate, fmt: "int", tone: maxRate >= need ? "ok" : "alert", sub: "needs 20,000" },
        { label: "Days of replay", value: replay, fmt: "int", tone: replay >= 7 ? "ok" : "warn" },
        { label: "Independent subscribers served from one copy", value: subs, fmt: "int", tone: subs >= 3 ? "ok" : "warn" },
        { label: "Order kept per customer", value: orderOk ? "yes" : "no", tone: orderOk || !ordered ? "info" : "alert" },
        { label: "Storage held", value: tb, fmt: "num", sub: "TB", tone: tb > 15 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Throughput ceiling", value: maxRate, tone: maxRate >= need ? "ok" : "alert" }, { label: "Needed", value: need, tone: "muted" }] },
      notes: [log ? "Every subscriber reads the same log at its own pace, and you can rewind. Parallelism stops at the partition count." : "A message goes to one consumer and is then gone. Three subscribers need three copies, and a bug fix cannot be replayed."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "engine") === "queue" && bool(v, "ordered") && out.metrics.maxRate! < 20000) ev.push("queue-limit");
    if (str(v, "engine") === "log" && out.metrics.replayDays! >= 7) ev.push("log-replay");
    return ev;
  },
  scene: (n): SceneOut => (n === "queue" ? { set: { engine: "queue", ordered: true }, focus: ["engine"] } : n === "log" ? { set: { engine: "log", partitions: 24, retention: 7 }, focus: ["engine"] } : n === "partitions" ? { set: { engine: "log", partitions: 8 }, focus: ["partitions"] } : undefined),
};

// ------------------------------------------------------------------ delivery semantics

export const deliveryLab: LabModel = {
  id: "delivery-lab",
  metrics: ["lostPerMillion", "dupEffectsPerMillion", "extraMs", "dedupGB"],
  observes: ["lost-seen", "dup-seen"],
  scenes: ["atmost", "atleast", "dedup"],
  runLabel: "Set the delivery rules",
  honest: [
    "A consumer that crashes between two steps in 1 of every 10,000 messages. It either acknowledges first and then processes (a crash in between loses the message) or processes first and then acknowledges (a crash in between makes the broker redeliver, so the effect happens twice).",
    "A deduplication store remembers the ids of processed messages for the time you set. A redelivery arrives after an exponential delay with a mean of 5 minutes; if the id has already expired, the effect is applied again. Each id takes 40 bytes and 10 million messages a day arrive; a lookup adds 2 ms.",
    "'Exactly once' here means exactly-once effects: at-least-once delivery plus deduplication, not a promise that the network never repeats anything.",
  ],
  init: () => ({ order: "ackFirst", dedup: false, ttlMin: 10 }),
  controls: () => [
    { kind: "choice", id: "order", label: "Acknowledge", options: [{ id: "ackFirst", label: "Before processing (at most once)" }, { id: "ackAfter", label: "After processing (at least once)" }] },
    { kind: "toggle", id: "dedup", label: "Skip message ids already processed" },
    { kind: "slider", id: "ttlMin", label: "Remember ids for", min: 1, max: 4320, log: true, fmt: "num", hint: "minutes" },
  ],
  evaluate: (v) => {
    const c = 1e-4;
    const first = str(v, "order") === "ackFirst";
    const lost = first ? c * 1e6 : 0;
    const redeliver = first ? 0 : c * 1e6;
    const dedup = bool(v, "dedup");
    const ttl = num(v, "ttlMin");
    const dup = dedup ? redeliver * Math.exp(-ttl / 5) : redeliver;
    const gb = dedup ? (10e6 * 40 * (ttl / 1440)) / 1e9 : 0;
    return {
      metrics: { lostPerMillion: lost, dupEffectsPerMillion: dup, extraMs: dedup ? 2 : 0, dedupGB: gb },
      readouts: [
        { label: "Messages lost per million", value: lost, fmt: "num", tone: lost > 0 ? "alert" : "ok" },
        { label: "Effects applied twice per million", value: dup, fmt: "num", tone: dup > 1 ? "alert" : dup > 0.01 ? "warn" : "ok" },
        { label: "Added delay", value: dedup ? 2 : 0, fmt: "ms" },
        { label: "Memory for ids", value: gb, fmt: "num", sub: "GB", tone: gb > 0.05 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Lost", value: lost, tone: lost ? "alert" : "ok" }, { label: "Applied twice", value: dup, tone: dup > 1 ? "alert" : "ok" }] },
      notes: [first ? "Acknowledging first means a crash loses the message with no trace." : dedup ? (ttl < 15 ? "Ids expire before some redeliveries arrive." : "Redeliveries find their id and are skipped.") : "A crash before the acknowledgement makes the broker send it again, and the effect repeats."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostPerMillion! > 0) ev.push("lost-seen");
    if (out.metrics.dupEffectsPerMillion! > 1) ev.push("dup-seen");
    return ev;
  },
  scene: (n): SceneOut => (n === "atmost" ? { set: { order: "ackFirst" }, focus: ["order"] } : n === "atleast" ? { set: { order: "ackAfter", dedup: false }, focus: ["order"] } : n === "dedup" ? { set: { order: "ackAfter", dedup: true, ttlMin: 60 }, focus: ["dedup", "ttlMin"] } : undefined),
};

// ------------------------------------------------------------------ poison messages

export const dlqLab: LabModel = {
  id: "dlq-lab",
  metrics: ["falseDlqPerDay", "blockedSec", "stuckWorkers", "wastedShare"],
  observes: ["jam", "noisy"],
  scenes: ["poison", "dlq", "receives"],
  runLabel: "Set the retry rules",
  honest: [
    "A queue of 1 million messages a day served by 20 workers. 4 poison messages arrive daily, and each attempt on one hangs a worker for 30 seconds before it is redelivered. 2% of ordinary messages hit a transient error, and each retry of those fails again with probability one half.",
    "With a dead-letter queue (DLQ) a message moves aside after the allowed number of receives. Without one, a poison message circulates forever, and after a week the poison messages (28) outnumber the 20 workers. In an ordered queue the poison message blocks everything behind it for the whole retry period.",
    "'Needlessly dead-lettered' counts ordinary messages that failed every attempt: 1,000,000 × 2% × 0.5^receives.",
  ],
  init: (c) => ({ receives: 5, dlq: false, ordered: Boolean((c as { ordered?: boolean }).ordered) }),
  controls: (c) => {
    const out: Control[] = [{ kind: "slider", id: "receives", label: "Receives before giving up", min: 1, max: 20, step: 1, fmt: "int" }, { kind: "toggle", id: "dlq", label: "Dead-letter queue" }];
    if (!(c as { lockOrdered?: boolean }).lockOrdered) out.push({ kind: "toggle", id: "ordered", label: "Ordered queue", detail: "Messages behind a failing one must wait" });
    return out;
  },
  evaluate: (v) => {
    const r = Math.round(num(v, "receives"));
    const dlq = bool(v, "dlq");
    const stuck = dlq ? 0 : 20;
    const falseDlq = dlq ? 1e6 * 0.02 * Math.pow(0.5, r) : 0;
    const blocked = bool(v, "ordered") ? (dlq ? r * 30 : Infinity) : 0;
    const wasted = dlq ? (4 * r * 30) / (20 * 86400) : 1;
    return {
      metrics: { falseDlqPerDay: falseDlq, blockedSec: Number.isFinite(blocked) ? blocked : 1e9, stuckWorkers: stuck, wastedShare: wasted },
      readouts: [
        { label: "Workers jammed after a week", value: stuck, fmt: "int", tone: stuck ? "alert" : "ok" },
        { label: "Ordinary messages dead-lettered a day", value: falseDlq, fmt: "num", tone: falseDlq > 25 ? "warn" : "ok" },
        { label: "Queue blocked behind one poison message", value: Number.isFinite(blocked) ? blocked : "forever", fmt: "s", tone: blocked > 400 ? "alert" : "ok" },
        { label: "Worker time spent on poison", value: wasted, fmt: "pct", tone: wasted > 0.01 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Jammed workers", value: stuck, tone: stuck ? "alert" : "ok" }, { label: "Good messages dead-lettered", value: falseDlq, tone: falseDlq > 25 ? "warn" : "ok" }] },
      notes: [dlq ? (r < 6 ? "Giving up quickly sends many ordinary messages to the dead-letter queue." : "Poison is set aside; ordinary retries have room to succeed.") : "With no way out, every poison message eventually holds a worker forever."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.stuckWorkers! > 0) ev.push("jam");
    if (out.metrics.falseDlqPerDay! > 100) ev.push("noisy");
    return ev;
  },
  scene: (n): SceneOut => (n === "poison" ? { set: { dlq: false }, focus: ["dlq"] } : n === "dlq" ? { set: { dlq: true }, focus: ["dlq"] } : n === "receives" ? { set: { dlq: true, receives: 3 }, focus: ["receives"] } : undefined),
};

// ------------------------------------------------------------------ backpressure

export const pressureLab: LabModel = {
  id: "pressure-lab",
  metrics: ["latencyS", "droppedPct", "memoryGB", "producerSlowPct", "costPerMonth"],
  observes: ["queue-grew", "bounded"],
  scenes: ["unbounded", "bounded", "block"],
  runLabel: "Absorb the spike",
  honest: [
    "A spike of 10 minutes at 1,200 messages a second arrives at consumers that each handle 100 a second, 800 a second with the 8 included in the base price. Each extra consumer costs $50 a month. Messages are 1 KB. The model is fluid, so it shows the shapes, not exact counts.",
    "Unbounded: the queue grows by the excess rate for the whole spike and the last message waits for the whole backlog. Bounded with drops: once full, the excess is rejected. Bounded with backpressure: producers are told to wait, so nothing is lost and the producers' effective rate falls to the consumers'. The latency shown is the longest wait in the queue.",
    "Real systems mix these: bounded buffers, a shed-load response at the edge, and autoscaling that arrives minutes late.",
  ],
  init: () => ({ policy: "unbounded", buffer: 100000, consumers: 8 }),
  controls: () => [
    { kind: "choice", id: "policy", label: "When the buffer is full", options: [{ id: "unbounded", label: "No limit: keep queueing" }, { id: "drop", label: "Bounded: drop new messages" }, { id: "block", label: "Bounded: tell producers to slow down" }] },
    { kind: "slider", id: "buffer", label: "Buffer size", min: 100, max: 10000000, log: true, fmt: "int", hint: "messages" },
    { kind: "slider", id: "consumers", label: "Consumers", min: 4, max: 16, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const lambda = 1200;
    const mu = 100 * Math.round(num(v, "consumers"));
    const T = 600;
    const excess = Math.max(0, lambda - mu);
    const p = str(v, "policy");
    const B = num(v, "buffer");
    const backlogFull = excess * T;
    const q = p === "unbounded" ? backlogFull : Math.min(B, backlogFull);
    const fillTime = excess > 0 ? Math.min(T, B / excess) : T;
    const dropped = p === "drop" && excess > 0 ? (excess * (T - fillTime)) / (lambda * T) : 0;
    const slow = p === "block" && excess > 0 ? ((lambda - mu) * (T - fillTime)) / (lambda * T) : 0;
    const latency = q / mu;
    const mem = (q * 1000) / 1e9;
    const cost = 50 * Math.max(0, Math.round(num(v, "consumers")) - 8);
    return {
      metrics: { latencyS: latency, droppedPct: dropped, memoryGB: mem, producerSlowPct: slow, costPerMonth: cost },
      readouts: [
        { label: "Longest wait in the queue", value: latency, fmt: "s", tone: latency > 2 ? "alert" : latency > 1 ? "warn" : "ok" },
        { label: "Messages dropped", value: dropped, fmt: "pct", tone: dropped > 0.001 ? "alert" : "ok" },
        { label: "Producers held back", value: slow, fmt: "pct", tone: slow > 0.25 ? "warn" : "ok" },
        { label: "Memory in the queue", value: mem, fmt: "num", sub: "GB", tone: mem > 0.1 ? "warn" : "ok" },
        { label: "Extra consumer cost", value: cost, fmt: "usd", sub: "per month" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Wait, seconds", value: latency, tone: latency > 2 ? "alert" : "ok" }, { label: "Dropped, percent", value: dropped * 100, tone: dropped > 0.001 ? "alert" : "ok" }, { label: "Producers slowed, percent", value: slow * 100, tone: "info" }] },
      notes: [p === "unbounded" && excess > 0 ? "Nothing refuses the work, so the wait for the last message grows with the whole backlog." : p === "drop" ? "The queue stays short because the excess is discarded." : p === "block" ? "The queue stays short and nothing is lost; the producers feel the limit instead." : "Capacity covers the spike."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.latencyS! > 60) ev.push("queue-grew");
    if (str(v, "policy") !== "unbounded") ev.push("bounded");
    return ev;
  },
  scene: (n): SceneOut => (n === "unbounded" ? { set: { policy: "unbounded" }, focus: ["policy"] } : n === "bounded" ? { set: { policy: "drop", buffer: 1000 }, focus: ["policy", "buffer"] } : n === "block" ? { set: { policy: "block", buffer: 1000 }, focus: ["policy"] } : undefined),
};

// ------------------------------------------------------------------ fan-out

const fanMemo = new Map<string, number>();

/** p99 of the total wait for n calls, each lognormal (median 20 ms, p99 400 ms): the sum when in turn, the maximum when in parallel. */
function waitP99(n: number, parallel: boolean): number {
  const key = `${n}:${parallel}`;
  const hit = fanMemo.get(key);
  if (hit) return hit;
  const d = lognormal(20, 400);
  const r = new Rng(`fanout-${n}`);
  const T = 4000;
  const xs: number[] = [];
  for (let t = 0; t < T; t++) {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const x = d.quantile(r.nextOpen());
      acc = parallel ? Math.max(acc, x) : acc + x;
    }
    xs.push(acc);
  }
  xs.sort((a, b) => a - b);
  const res = xs[Math.floor(T * 0.99)]!;
  fanMemo.set(key, res);
  return res;
}

export const pubsubLab: LabModel = {
  id: "pubsub-lab",
  metrics: ["userMs", "userFailPct", "lostPct", "publisherChanges"],
  observes: ["slow-seen", "queued"],
  scenes: ["direct", "push", "queues"],
  runLabel: "Choose the delivery",
  honest: [
    "An order service must tell N other services. Each call takes a median of 20 ms with a p99 of 400 ms, and each service is down for 0.1% of calls. Sequential calls add up; parallel calls wait for the slowest. The 99th percentile of that wait comes from 4,000 seeded trials.",
    "A topic with push delivery sends to each service's endpoint and retries for a while; a service that is down longer than the retry window (0.02% of events) misses the event. A topic with a queue per subscriber stores each copy until its service takes it, so nothing is lost and each service reads at its own pace. Publishing to a topic takes 5 ms.",
    "Adding a subscriber changes the publisher in the direct designs and nothing in the topic designs.",
  ],
  init: (c) => ({ style: "seq", n: (c as { n?: number }).n ?? 12 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "style", label: "How the order service tells the others", options: [{ id: "seq", label: "Call each one in turn" }, { id: "par", label: "Call all of them in parallel" }, { id: "push", label: "Publish to a topic that pushes to each endpoint" }, { id: "queues", label: "Publish to a topic with a queue per subscriber" }] }];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "Subscribers", min: 1, max: 50, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const n = Math.round(num(v, "n"));
    const s = str(v, "style");
    const sync = s === "seq" || s === "par";
    const ms = sync ? waitP99(n, s === "par") : 5;
    const fail = sync ? 1 - Math.pow(0.999, n) : 0.0005;
    const lost = s === "push" ? 0.0002 : 0;
    const changes = sync ? 1 : 0;
    const tone = (x: number, a: number, b: number): Tone => (x > b ? "alert" : x > a ? "warn" : "ok");
    return {
      metrics: { userMs: ms, userFailPct: fail, lostPct: lost, publisherChanges: changes },
      readouts: [
        { label: "Customer wait (99th percentile)", value: ms, fmt: "ms", tone: tone(ms, 100, 200) },
        { label: "Orders failed by a downstream service", value: fail, fmt: "pct", tone: tone(fail, 0.002, 0.01) },
        { label: "Events a subscriber misses", value: lost, fmt: "pct", tone: lost > 0 ? "warn" : "ok" },
        { label: "Publisher code changed per new subscriber", value: changes, fmt: "int", tone: changes ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "ms", bars: [{ label: "Customer wait", value: ms, tone: tone(ms, 100, 200) }] },
      notes: [sync ? "The customer waits on every subscriber, and any one of them can fail the order." : s === "push" ? "The order is decoupled, but a subscriber that stays down past the retry window misses events." : "The order returns at once; each subscriber catches up at its own pace."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.userMs! > 200) ev.push("slow-seen");
    if (str(v, "style") === "queues") ev.push("queued");
    return ev;
  },
  scene: (n): SceneOut => (n === "direct" ? { set: { style: "seq" }, focus: ["style"] } : n === "push" ? { set: { style: "push" }, focus: ["style"] } : n === "queues" ? { set: { style: "queues" }, focus: ["style"] } : undefined),
};

// ------------------------------------------------------------------ event-driven

export const eventLab: LabModel = {
  id: "event-lab",
  metrics: ["checkoutMs", "failPct", "staleS", "traceable"],
  observes: ["coupled", "lost-trail"],
  scenes: ["sync", "events", "trace"],
  runLabel: "Choose the architecture",
  honest: [
    "A checkout triggers six reactions: payment, inventory, email, shipping, loyalty points, analytics. Synchronously, each is a call of 40 ms in sequence and each fails 0.1% of the time. With events, checkout writes the order and publishes (30 ms in all), and the reactions happen afterwards, each a few seconds later.",
    "'Staleness' is how long until the slowest reaction has happened: 0 for synchronous calls, about 4 seconds for events. A flow is traceable if every event carries a correlation id and each service logs it; without that, finding why one order did not ship means searching six logs by hand.",
    "Payment really does have to finish before checkout returns, so the lab keeps that one call synchronous in both designs.",
  ],
  init: () => ({ style: "sync", reactions: 6, tracing: false }),
  controls: () => [
    { kind: "choice", id: "style", label: "How checkout triggers the rest", options: [{ id: "sync", label: "Call each service in turn" }, { id: "events", label: "Publish an OrderPlaced event" }] },
    { kind: "slider", id: "reactions", label: "Services reacting", min: 1, max: 12, step: 1, fmt: "int" },
    { kind: "toggle", id: "tracing", label: "Correlation id on every event, logged by every service" },
  ],
  evaluate: (v) => {
    const k = Math.round(num(v, "reactions"));
    const events = str(v, "style") === "events";
    const ms = events ? 70 : 30 + 40 * k;
    const fail = events ? 0.001 : 1 - Math.pow(0.999, k + 1);
    const stale = events ? 4 : 0;
    const traceable = events ? (bool(v, "tracing") ? 1 : 0) : 1;
    return {
      metrics: { checkoutMs: ms, failPct: fail, staleS: stale, traceable },
      readouts: [
        { label: "Checkout time", value: ms, fmt: "ms", tone: ms > 150 ? "alert" : ms > 100 ? "warn" : "ok" },
        { label: "Orders failed by a downstream service", value: fail, fmt: "pct", tone: fail > 0.002 ? "alert" : "ok" },
        { label: "Seconds until everything has reacted", value: stale, fmt: "int" },
        { label: "A flow can be followed end to end", value: traceable ? "yes" : "no", tone: traceable ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "ms", bars: [{ label: "Checkout time", value: ms, tone: ms > 150 ? "alert" : "ok" }] },
      notes: [events ? (traceable ? "Services do not know each other, and the flow can still be followed by its id." : "Services are decoupled, and nobody can say which service has an order.") : "Every service checkout needs is a dependency of checkout itself."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "style") === "sync" && out.metrics.checkoutMs! > 200) ev.push("coupled");
    if (str(v, "style") === "events" && !bool(v, "tracing")) ev.push("lost-trail");
    return ev;
  },
  scene: (n): SceneOut => (n === "sync" ? { set: { style: "sync", reactions: 6 }, focus: ["style"] } : n === "events" ? { set: { style: "events" }, focus: ["style"] } : n === "trace" ? { set: { style: "events", tracing: true }, focus: ["tracing"] } : undefined),
};

// ------------------------------------------------------------------ CQRS

export const cqrsLab: LabModel = {
  id: "cqrs-lab",
  metrics: ["readMs", "writeMs", "ownMiss", "readLoad"],
  observes: ["fast-read", "stale-own"],
  scenes: ["split", "lag", "pin"],
  runLabel: "Design the read side",
  honest: [
    "A product with 100 reads for each write. A read against the normalised tables needs a join and takes 40 ms and 4 units of database load; a read from a denormalised view takes 2 ms and 0.2 units. A write takes 5 ms; maintaining the view adds 3 ms.",
    "The view is updated by a projection that trails the write side by the lag you set. A user who writes about once a minute misses their own write with probability 1 − e^(−lag ÷ 60 s) unless their reads are pinned to the write side for a few seconds after a write, which fixes it at the cost of a few slow reads.",
    "The read side is a second copy of the data to build, monitor, and rebuild. That cost is not modelled.",
  ],
  init: () => ({ cqrs: false, lagMs: 2000, pin: false }),
  controls: () => [
    { kind: "toggle", id: "cqrs", label: "Separate read model", detail: "A denormalised view built by a projection" },
    { kind: "slider", id: "lagMs", label: "Projection lag", min: 20, max: 20000, log: true, fmt: "ms" },
    { kind: "toggle", id: "pin", label: "Read from the write side for a few seconds after a write" },
  ],
  evaluate: (v) => {
    const c = bool(v, "cqrs");
    const lag = num(v, "lagMs");
    const pin = bool(v, "pin");
    const miss = c && !pin ? 1 - Math.exp(-lag / 60000) : 0;
    const readMs = c ? (pin ? 2.5 : 2) : 40;
    const readLoad = c ? 0.2 : 4;
    const writeMs = c ? 8 : 5;
    return {
      metrics: { readMs, writeMs, ownMiss: miss, readLoad },
      readouts: [
        { label: "Read time", value: readMs, fmt: "ms", tone: readMs > 10 ? "warn" : "ok" },
        { label: "Write time", value: writeMs, fmt: "ms" },
        { label: "Reads missing the user's own write", value: miss, fmt: "pct", tone: miss > 0.001 ? "alert" : "ok" },
        { label: "Database load per read", value: readLoad, fmt: "num", tone: readLoad > 1 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Read, ms", value: readMs, tone: readMs > 10 ? "warn" : "ok" }, { label: "Write, ms", value: writeMs, tone: "info" }, { label: "Own writes missed, percent", value: miss * 100, tone: miss > 0.001 ? "alert" : "ok" }] },
      notes: [c ? (pin ? "Reads are fast and users always see their own changes." : "Reads are fast and cheap, with a window where the view is behind.") : "One model for both reads and writes is simple, and every read pays for the join."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.readMs! < 5) ev.push("fast-read");
    if (out.metrics.ownMiss! > 0.02) ev.push("stale-own");
    return ev;
  },
  scene: (n): SceneOut => (n === "split" ? { set: { cqrs: true }, focus: ["cqrs"] } : n === "lag" ? { set: { cqrs: true, lagMs: 5000 }, focus: ["lagMs"] } : n === "pin" ? { set: { cqrs: true, pin: true }, focus: ["pin"] } : undefined),
};

// ------------------------------------------------------------------ event sourcing

export const sourcingLab: LabModel = {
  id: "sourcing-lab",
  metrics: ["loadMs", "storageOverhead", "writeAmp", "rebuildHours"],
  observes: ["slow-load", "fast-load"],
  scenes: ["replay", "snapshot", "rebuild"],
  runLabel: "Plan the snapshots",
  honest: [
    "An account whose state is the replay of its events. One event is about 300 bytes and replays at 100,000 events a second. This account has 200,000 events. A snapshot is 4 KB. Taking one every K events costs one extra write per K and 4 KB of storage per K events.",
    "Loading the state replays the events since the last snapshot, on average K ÷ 2 of them, plus about 5 ms to fetch the snapshot. With no snapshots, every event is replayed.",
    "Rebuilding a read model replays the whole history of 5 billion events at 200,000 a second per worker, split over the workers you choose.",
  ],
  init: () => ({ every: 0, workers: 1 }),
  controls: () => [
    { kind: "slider", id: "every", label: "Snapshot every K events (0 for never)", min: 0, max: 100000, step: 50, fmt: "int" },
    { kind: "slider", id: "workers", label: "Workers rebuilding a read model", min: 1, max: 32, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const K = Math.round(num(v, "every"));
    const E = 200000;
    const replay = K === 0 ? E : K / 2;
    const loadMs = (replay / 100000) * 1000 + (K === 0 ? 0 : 5);
    const overhead = K === 0 ? 0 : 4000 / (K * 300);
    const amp = K === 0 ? 1 : 1 + 1 / K;
    const hours = 5e9 / (200000 * Math.round(num(v, "workers"))) / 3600;
    return {
      metrics: { loadMs, storageOverhead: overhead, writeAmp: amp, rebuildHours: hours },
      readouts: [
        { label: "Time to load the account", value: loadMs, fmt: "ms", tone: loadMs > 50 ? "alert" : "ok" },
        { label: "Extra storage for snapshots", value: overhead, fmt: "pct", tone: overhead > 0.2 ? "warn" : "ok" },
        { label: "Writes per event", value: amp, fmt: "num" },
        { label: "Time to rebuild a read model", value: hours, fmt: "num", sub: "hours", tone: hours > 2 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Load, ms", value: loadMs, tone: loadMs > 50 ? "alert" : "ok" }, { label: "Rebuild, hours", value: hours, tone: hours > 2 ? "alert" : "ok" }] },
      notes: [K === 0 ? "Without snapshots, every load replays the account's whole history." : K < 100 ? "Very frequent snapshots make loads instant and double the storage." : "Snapshots bound the replay to a few thousand events."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.loadMs! > 500) ev.push("slow-load");
    if (out.metrics.loadMs! < 50) ev.push("fast-load");
    return ev;
  },
  scene: (n): SceneOut => (n === "replay" ? { set: { every: 0 }, focus: ["every"] } : n === "snapshot" ? { set: { every: 5000 }, focus: ["every"] } : n === "rebuild" ? { set: { workers: 8 }, focus: ["workers"] } : undefined),
};

// ------------------------------------------------------------------ Postgres queue

export const pgbrokerLab: LabModel = {
  id: "pgqueue-lab",
  metrics: ["jobsPerSec", "dupPct", "waitMs", "idlePolls"],
  observes: ["dupes", "skip-on"],
  scenes: ["naive", "forupdate", "skiplocked"],
  runLabel: "Run the workers",
  honest: [
    "A jobs table in Postgres. A job takes 20 ms. Workers claim a row, run the job, and mark it done. 'Select then update' lets two workers claim the same row: the lab uses a duplicate share of 4% for each additional worker (capped at 100%). 'FOR UPDATE' makes workers queue on the first unlocked row, so claims are serialised at about 500 a second. 'FOR UPDATE SKIP LOCKED' lets each worker skip rows other workers hold, so claims run in parallel up to a database ceiling of 5,000 a second.",
    "Idle workers poll at the interval you set; each poll is a query. LISTEN/NOTIFY wakes workers when a job arrives, so there are no idle polls and the wait is a few milliseconds.",
    "These are round figures for a modest Postgres instance, not benchmarks.",
  ],
  init: () => ({ method: "naive", workers: 8, pollMs: 500, notify: false }),
  controls: () => [
    { kind: "choice", id: "method", label: "How a worker claims a job", options: [{ id: "naive", label: "SELECT a pending row, then UPDATE it" }, { id: "forupdate", label: "SELECT … FOR UPDATE" }, { id: "skip", label: "SELECT … FOR UPDATE SKIP LOCKED" }] },
    { kind: "slider", id: "workers", label: "Workers", min: 1, max: 64, step: 1, fmt: "int" },
    { kind: "slider", id: "pollMs", label: "Poll interval when idle", min: 5, max: 5000, log: true, fmt: "ms" },
    { kind: "toggle", id: "notify", label: "Wake workers with LISTEN/NOTIFY" },
  ],
  evaluate: (v) => {
    const W = Math.round(num(v, "workers"));
    const m = str(v, "method");
    const per = W / 0.02;
    const cap = m === "forupdate" ? 500 : m === "skip" ? 5000 : 5000;
    const dupShare = m === "naive" ? Math.min(1, 0.04 * (W - 1)) : 0;
    const tp = Math.min(per, cap) * (m === "naive" ? 1 - dupShare / 2 : 1);
    const notify = bool(v, "notify");
    const idle = notify ? 0 : W * (1000 / num(v, "pollMs"));
    const wait = notify ? 5 : num(v, "pollMs") / 2 + 5;
    return {
      metrics: { jobsPerSec: tp, dupPct: dupShare, waitMs: wait, idlePolls: idle },
      readouts: [
        { label: "Jobs done a second", value: tp, fmt: "int", tone: tp >= 1500 ? "ok" : "warn" },
        { label: "Jobs run twice", value: dupShare, fmt: "pct", tone: dupShare > 0 ? "alert" : "ok" },
        { label: "Wait before a job starts", value: wait, fmt: "ms", tone: wait > 150 ? "warn" : "ok" },
        { label: "Idle polling queries a second", value: idle, fmt: "int", tone: idle > 200 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Jobs a second", value: tp, tone: tp >= 1500 ? "ok" : "warn" }, { label: "Idle polls a second", value: idle, tone: idle > 200 ? "warn" : "info" }] },
      notes: [m === "naive" ? "Two workers can read the same row before either updates it." : m === "forupdate" ? "Safe, but every worker waits for the same first row." : "Each worker takes a row nobody else holds, so claims run in parallel."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.dupPct! > 0) ev.push("dupes");
    if (str(v, "method") === "skip") ev.push("skip-on");
    return ev;
  },
  scene: (n): SceneOut => (n === "naive" ? { set: { method: "naive", workers: 16 }, focus: ["method"] } : n === "forupdate" ? { set: { method: "forupdate" }, focus: ["method"] } : n === "skiplocked" ? { set: { method: "skip" }, focus: ["method"] } : undefined),
};

export const A9_MODELS: LabModel[] = [brokerLab, deliveryLab, dlqLab, pressureLab, pubsubLab, eventLab, cqrsLab, sourcingLab, pgbrokerLab];
