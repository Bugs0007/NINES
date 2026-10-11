/**
 * Interview-case models for track A (system design): URL shortener, KV store, payments, ticket booking,
 * notifications, news feed, web crawler, distributed rate limiter, chat, autocomplete, ride hailing, video pipeline.
 * Each is a set of design choices evaluated with closed forms and labelled round constants (see `honest`).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");
const yn = (x: number | boolean) => (x ? "yes" : "no");

// ------------------------------------------------------------------ URL shortener

const US_STORE: Record<string, { cap: number; p99: number; cost: number }> = { sql1: { cap: 5000, p99: 14, cost: 400 }, sqlr: { cap: 15000, p99: 14, cost: 900 }, kv: { cap: 60000, p99: 6, cost: 1300 } };
export function urlRun(idgen: string, store: string, cache: boolean, redirect: string) {
  const peak = 11400 * (redirect === "301" ? 0.7 : 1);
  const s = US_STORE[store]!;
  const storeLoad = (peak * (cache ? 0.2 : 1)) / s.cap;
  const p99 = storeLoad >= 0.97 ? 9999 : s.p99 / (1 - storeLoad);
  const collide = idgen === "random" || idgen === "hash" ? 0.0017 : 0;
  return { storeRps: peak * (cache ? 0.2 : 1), p99, collide, guessable: idgen === "counter" ? 1 : 0, analytics: redirect === "302" ? 1 : 0, cost: s.cost + (cache ? 300 : 0) };
}
export const urlLab: LabModel = {
  id: "urlshort-lab",
  metrics: ["storeRps", "p99Ms", "collisionRetry", "guessable", "analyticsAccurate", "costMonth"],
  observes: ["overloaded", "enumerable"],
  scenes: ["cache", "ids", "redirect"],
  runLabel: "Run the design",
  honest: [
    "100 million new short links a month, 100 reads for every write: about 38 writes and 3,800 redirects a second, and 11,400 a second at peak. Over five years there are 6 billion links in a seven-character base-62 space of 3.5 trillion, so a random or hashed ID collides on 0.17% of inserts by then; a counter never collides but its IDs can be counted through, unless the bits are shuffled.",
    "A single SQL primary serves about 5,000 lookups a second, with three read replicas 15,000, and a key-value store 60,000 (monthly cost $400, $900 and $1,300). A cache holds the hot 20% of links and absorbs 80% of reads (+$300). A 301 redirect is cached by browsers and removes 30% of repeat traffic but hides those visits from analytics; a 302 counts every visit. p99 is the store's p99 stretched by 1 ÷ (1 − load).",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ idgen: "counter", store: "sql1", cache: false, redirect: "301" }),
  controls: () => [
    { kind: "choice", id: "idgen", label: "Making the short code", options: [{ id: "counter", label: "A counter from the database" }, { id: "shuffled", label: "A counter with the bits shuffled" }, { id: "random", label: "A random 7-character code" }, { id: "hash", label: "A truncated hash of the URL" }] },
    { kind: "choice", id: "store", label: "Storage", options: [{ id: "sql1", label: "One SQL database" }, { id: "sqlr", label: "SQL with three read replicas" }, { id: "kv", label: "A key-value store" }] },
    { kind: "toggle", id: "cache", label: "Cache the hot 20% of links" },
    { kind: "choice", id: "redirect", label: "Redirect status", options: [{ id: "301", label: "301, browsers cache it" }, { id: "302", label: "302, every visit reaches us" }] },
  ],
  evaluate: (v) => {
    const r = urlRun(str(v, "idgen"), str(v, "store"), bool(v, "cache"), str(v, "redirect"));
    return {
      metrics: { storeRps: r.storeRps, p99Ms: r.p99, collisionRetry: r.collide, guessable: r.guessable, analyticsAccurate: r.analytics, costMonth: r.cost },
      readouts: [
        { label: "Reads the store must serve at peak", value: r.storeRps, fmt: "int", sub: "per second" },
        { label: "Redirect p99 at peak", value: r.p99 > 9000 ? "overloaded" : r.p99, fmt: "ms", tone: tone(r.p99, 20, 50) },
        { label: "Inserts that collide after five years", value: r.collide, fmt: "pct", tone: tone(r.collide, 0.002, 0.01) },
        { label: "Codes can be counted through", value: yn(r.guessable), tone: r.guessable ? "alert" : "ok" },
        { label: "Every visit is counted", value: yn(r.analytics), tone: r.analytics ? "ok" : "warn" },
        { label: "Cost a month", value: r.cost, fmt: "usd", tone: tone(r.cost, 1300, 2000) },
      ],
      view: { kind: "bars", fmt: "int", max: 12000, bars: [{ label: "Reads reaching the store", value: r.storeRps, tone: tone(r.storeRps, 5000, 12000) }] },
      notes: [r.p99 > 9000 ? "The store cannot keep up with redirects at peak." : r.guessable ? "Anyone can enumerate every link." : "Fast redirects, unguessable codes."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.p99Ms! > 9000) ev.push("overloaded");
    if (out.metrics.guessable === 1) ev.push("enumerable");
    return ev;
  },
  scene: (n): SceneOut => (n === "cache" ? { set: { cache: true }, focus: ["cache"] } : n === "ids" ? { set: { idgen: "shuffled" }, focus: ["idgen"] } : n === "redirect" ? { set: { redirect: "302" }, focus: ["redirect"] } : undefined),
};

// ------------------------------------------------------------------ distributed KV store

export function kvRun(part: string, rf: number, quorum: string, engine: string) {
  const nodes = 12;
  const moved = part === "mod" ? nodes / (nodes + 1) : 1 / (nodes + 1);
  const skew = part === "range" ? 3 : 1.1;
  const [r, w] = quorum === "weak" ? [1, 1] : quorum === "readone" ? [1, rf] : [Math.floor(rf / 2) + 1, Math.floor(rf / 2) + 1];
  const failShare = rf === 1 ? 1 / nodes : Math.max(0, (rf - w) < 0 ? 0 : w >= rf ? rf / nodes : 0);
  const stale = rf === 1 || r + w > rf ? 0 : 0.33;
  const writeK = (nodes * (engine === "lsm" ? 60 : 20)) / rf / skew;
  const writeP99 = (engine === "lsm" ? 6 : 12) * (w === 1 ? 1 : w >= rf ? 2.2 : 1.4);
  return { moved, skew, failShare, stale, writeK, writeP99 };
}
export const kvLab: LabModel = {
  id: "kvstore-lab",
  metrics: ["movedOnAdd", "hotSkew", "writeFailNodeDown", "staleRead", "writeKops", "writeP99Ms"],
  observes: ["reshuffle", "stale"],
  scenes: ["ring", "quorum", "lsm"],
  runLabel: "Run the design",
  honest: [
    "A key-value store on 12 nodes. Adding a 13th node moves 12 ÷ 13 = 92% of keys under hash-mod-N placement, and only 1 ÷ 13 = 8% with consistent hashing; range partitioning moves 8% too but sequential keys pile onto one range (3× the average load), where hashing spreads them (1.1×).",
    "With a replication factor rf, writes go to W replicas and reads to R, and R + W > rf guarantees a read sees the latest write. Weak settings (R = W = 1) can return a stale value about a third of the time just after a write; waiting for every replica to write (W = rf) fails when any replica is down, a share rf ÷ 12 of keys with one node down; a single copy loses 1 ÷ 12 of keys. A log-structured engine writes 60,000 a second per node and a B-tree 20,000; write throughput for the cluster divides by rf and the skew.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ part: "mod", rf: "1", quorum: "quorum", engine: "btree" }),
  controls: () => [
    { kind: "choice", id: "part", label: "Partitioning", options: [{ id: "range", label: "Key ranges" }, { id: "mod", label: "Hash mod N" }, { id: "ring", label: "Consistent hashing with virtual nodes" }] },
    { kind: "choice", id: "rf", label: "Replication factor", options: [{ id: "1", label: "1" }, { id: "3", label: "3" }, { id: "5", label: "5" }] },
    { kind: "choice", id: "quorum", label: "Read and write quorums", options: [{ id: "weak", label: "R = W = 1" }, { id: "quorum", label: "Majority for both" }, { id: "readone", label: "R = 1, W = all" }] },
    { kind: "choice", id: "engine", label: "Storage engine", options: [{ id: "btree", label: "B-tree" }, { id: "lsm", label: "LSM tree" }] },
  ],
  evaluate: (v) => {
    const r = kvRun(str(v, "part"), Number(str(v, "rf")), str(v, "quorum"), str(v, "engine"));
    return {
      metrics: { movedOnAdd: r.moved, hotSkew: r.skew, writeFailNodeDown: r.failShare, staleRead: r.stale, writeKops: r.writeK, writeP99Ms: r.writeP99 },
      readouts: [
        { label: "Keys moved when adding a node", value: r.moved, fmt: "pct", tone: tone(r.moved, 0.1, 0.3) },
        { label: "Busiest partition vs the average", value: r.skew, fmt: "x", tone: tone(r.skew, 1.3, 2) },
        { label: "Keys with failing writes when a node is down", value: r.failShare, fmt: "pct", tone: tone(r.failShare, 0.01, 0.05) },
        { label: "Stale reads after a write", value: r.stale, fmt: "pct", tone: tone(r.stale, 0.01, 0.1) },
        { label: "Cluster write throughput", value: r.writeK, fmt: "num", sub: "thousand a second", tone: toneLow(r.writeK, 150, 60) },
        { label: "Write p99", value: r.writeP99, fmt: "ms" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Keys moved on adding a node", value: r.moved, tone: tone(r.moved, 0.1, 0.3) }, { label: "Stale reads", value: r.stale, tone: tone(r.stale, 0.01, 0.1) }] },
      notes: [r.moved > 0.5 ? "Adding a node reshuffles nearly every key." : r.stale > 0 ? "Some reads see old values." : "Placement is stable and reads are fresh."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.movedOnAdd! > 0.5) ev.push("reshuffle");
    if (out.metrics.staleRead! > 0.1) ev.push("stale");
    return ev;
  },
  scene: (n): SceneOut => (n === "ring" ? { set: { part: "ring" }, focus: ["part"] } : n === "quorum" ? { set: { rf: "3", quorum: "quorum" }, focus: ["rf", "quorum"] } : n === "lsm" ? { set: { engine: "lsm" }, focus: ["engine"] } : undefined),
};

// ------------------------------------------------------------------ payment system

export function payRun(idem: boolean, flow: string, retry: boolean, iso: string, ledger: boolean) {
  const dupes = retry && !idem ? 1200 : idem ? 0 : 0;
  const lost = retry ? (idem ? 5 : 5) : 800;
  const inconsistent = flow === "2pc" ? 30 : flow === "saga" ? 4 : 1;
  const anomalies = iso === "rc" ? 15 : iso === "rr" ? 3 : 0;
  const base = flow === "2pc" ? 400 : flow === "saga" ? 2000 : 3000;
  const tps = base * (iso === "ser" ? 0.6 : 1);
  return { dupes, lost, inconsistent, anomalies, tps, audit: ledger ? 1 : 0 };
}
export const payLab: LabModel = {
  id: "payment-lab",
  metrics: ["doubleCharges", "lostPayments", "inconsistent", "anomalies", "paymentsPerSec", "auditable"],
  observes: ["double-charge", "stuck"],
  scenes: ["idem", "outbox", "serializable"],
  runLabel: "Run the design",
  honest: [
    "A payment service handling millions of charges. Per million payments: when clients retry timeouts without an idempotency key, 1,200 are charged twice; with no retries 800 are lost to network failures; retrying with an idempotency key leaves about 5 lost and none doubled.",
    "Coordinating the payment record, the ledger and the provider: two-phase commit is atomic and blocks when the coordinator fails (30 stuck per million, 400 payments a second); a saga with compensations is fast but leaves a few inconsistent for a moment (4 per million, 2,000 a second); a transactional outbox writes the state change and the event together and publishes after (1 per million, 3,000 a second). Isolation changes balance anomalies per million (read committed 15, repeatable read 3, serializable 0) and serializable costs 40% of throughput. A double-entry ledger makes every change auditable.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ idem: false, flow: "2pc", retry: false, iso: "rc", ledger: false }),
  controls: () => [
    { kind: "toggle", id: "idem", label: "Idempotency keys on every charge" },
    { kind: "toggle", id: "retry", label: "Retry timeouts" },
    { kind: "choice", id: "flow", label: "Coordinating the steps", options: [{ id: "2pc", label: "Two-phase commit" }, { id: "saga", label: "A saga with compensations" }, { id: "outbox", label: "Transactional outbox" }] },
    { kind: "choice", id: "iso", label: "Isolation level", options: [{ id: "rc", label: "Read committed" }, { id: "rr", label: "Repeatable read" }, { id: "ser", label: "Serializable" }] },
    { kind: "toggle", id: "ledger", label: "Double-entry ledger" },
  ],
  evaluate: (v) => {
    const r = payRun(bool(v, "idem"), str(v, "flow"), bool(v, "retry"), str(v, "iso"), bool(v, "ledger"));
    return {
      metrics: { doubleCharges: r.dupes, lostPayments: r.lost, inconsistent: r.inconsistent, anomalies: r.anomalies, paymentsPerSec: r.tps, auditable: r.audit },
      readouts: [
        { label: "Charged twice, per million", value: r.dupes, fmt: "int", tone: tone(r.dupes, 1, 100) },
        { label: "Lost, per million", value: r.lost, fmt: "int", tone: tone(r.lost, 10, 100) },
        { label: "Stuck or inconsistent, per million", value: r.inconsistent, fmt: "int", tone: tone(r.inconsistent, 5, 20) },
        { label: "Balance anomalies, per million", value: r.anomalies, fmt: "int", tone: tone(r.anomalies, 1, 10) },
        { label: "Payments a second", value: r.tps, fmt: "int", tone: toneLow(r.tps, 1500, 500) },
        { label: "Auditable", value: yn(r.audit), tone: r.audit ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "int", max: 1300, bars: [{ label: "Charged twice per million", value: r.dupes, tone: tone(r.dupes, 1, 100) }, { label: "Lost per million", value: r.lost, tone: tone(r.lost, 10, 100) }] },
      notes: [r.dupes > 100 ? "Customers are being charged twice." : r.lost > 100 ? "Payments disappear when the network blinks." : "Money moves once, and is traceable."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.doubleCharges! > 100) ev.push("double-charge");
    if (str(v, "flow") === "2pc" && out.metrics.inconsistent! >= 30) ev.push("stuck");
    return ev;
  },
  scene: (n): SceneOut => (n === "idem" ? { set: { idem: true, retry: true }, focus: ["idem", "retry"] } : n === "outbox" ? { set: { flow: "outbox" }, focus: ["flow"] } : n === "serializable" ? { set: { iso: "ser" }, focus: ["iso"] } : undefined),
};

// ------------------------------------------------------------------ ticket booking

export function ticketRun(lock: string, holdMin: number, queue: boolean, mapCache: boolean) {
  const users = 50000;
  const seats = 10000;
  const doubles = lock === "none" ? 380 : lock === "redis" ? 2 : 0;
  const baseP99 = lock === "none" ? 120 : lock === "optimistic" ? 400 : lock === "pessimistic" ? 1800 : 90;
  const loadFactor = (queue ? 0.1 : 1) * (mapCache ? 0.6 : 1);
  const p99 = baseP99 * (0.15 + 0.85 * loadFactor);
  const abandon = holdMin * 0.35;
  const sellOut = 6 + abandon * 1.4;
  return { doubles, p99, abandon, sellOut, dbLoad: users * loadFactor, seats };
}
export const ticketLab: LabModel = {
  id: "ticketing-lab",
  metrics: ["doubleBookings", "checkoutP99Ms", "sellOutMin", "dbLoadRps"],
  observes: ["oversold", "melted"],
  scenes: ["lock", "hold", "queue"],
  runLabel: "Run the on-sale",
  honest: [
    "10,000 seats go on sale and 50,000 people arrive in the first minute. With no locking about 380 seats are sold twice. Optimistic versioning prevents it and makes losers retry (checkout p99 400 ms); a pessimistic row lock prevents it and serialises the hot rows (1,800 ms); a Redis hold with an expiry is fast (90 ms) and has a rare race when a hold expires mid-payment (2 seats).",
    "A seat held while its buyer decides can be abandoned: 35% of holds are never paid for, so each minute of hold time idles 0.35 minutes of seat time, and the on-sale takes 6 minutes plus 1.4 × that idle time to sell out. A waiting room admits people at a controlled pace and cuts database load to a tenth; caching the seat map cuts it by 40%. Latency rises with load.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ lock: "none", holdMin: 10, queue: false, mapCache: false }),
  controls: () => [
    { kind: "choice", id: "lock", label: "Taking a seat", options: [{ id: "none", label: "Check availability, then write" }, { id: "optimistic", label: "Optimistic version check" }, { id: "pessimistic", label: "Row lock in the database" }, { id: "redis", label: "A hold in Redis with an expiry" }] },
    { kind: "slider", id: "holdMin", label: "Hold time", min: 2, max: 30, step: 1, fmt: "int", hint: "minutes" },
    { kind: "toggle", id: "queue", label: "A waiting room admits buyers gradually" },
    { kind: "toggle", id: "mapCache", label: "Cache the seat map" },
  ],
  evaluate: (v) => {
    const r = ticketRun(str(v, "lock"), num(v, "holdMin"), bool(v, "queue"), bool(v, "mapCache"));
    return {
      metrics: { doubleBookings: r.doubles, checkoutP99Ms: r.p99, sellOutMin: r.sellOut, dbLoadRps: r.dbLoad },
      readouts: [
        { label: "Seats sold twice", value: r.doubles, fmt: "int", tone: tone(r.doubles, 0, 5) },
        { label: "Checkout p99", value: r.p99, fmt: "ms", tone: tone(r.p99, 500, 1500) },
        { label: "Minutes to sell out", value: r.sellOut, fmt: "num", tone: tone(r.sellOut, 12, 20) },
        { label: "Database requests at the rush", value: r.dbLoad, fmt: "int", sub: "per second" },
      ],
      view: { kind: "bars", fmt: "num", max: 30, bars: [{ label: "Minutes to sell out", value: r.sellOut, tone: tone(r.sellOut, 12, 20) }] },
      notes: [r.doubles > 5 ? "Two people hold tickets for the same seat." : r.p99 > 1500 ? "The hot rows are a queue." : "Fast and fair."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.doubleBookings! > 100) ev.push("oversold");
    if (out.metrics.checkoutP99Ms! > 1500) ev.push("melted");
    return ev;
  },
  scene: (n): SceneOut => (n === "lock" ? { set: { lock: "redis" }, focus: ["lock"] } : n === "hold" ? { set: { holdMin: 5 }, focus: ["holdMin"] } : n === "queue" ? { set: { queue: true }, focus: ["queue"] } : undefined),
};

// ------------------------------------------------------------------ notification system

export function notifRun(transport: string, dedupe: boolean, retries: string, limit: boolean, fallback: boolean) {
  const rate = 10000000 / 600;
  const cap = fallback ? 10000 : 5000;
  const lost = transport === "direct" ? Math.max(0, 1 - cap / rate) : retries === "none" ? 0.005 : retries === "backoff" ? 0.0005 : 0;
  const delayMin = transport === "direct" ? 0 : Math.max(0, ((rate - cap) * 600) / cap / 60);
  const dupes = retries === "none" ? 0 : dedupe ? 0.0001 : 0.03;
  const spam = limit ? 0 : 0.04;
  return { lost, delayMin, dupes, spam };
}
export const notifLab: LabModel = {
  id: "notification-lab",
  metrics: ["lostShare", "duplicateShare", "delayMin", "spamShare"],
  observes: ["blast-lost", "dupes"],
  scenes: ["queue", "dedupe", "limits"],
  runLabel: "Run the blast",
  honest: [
    "A marketing blast of 10 million notifications over 10 minutes (16,700 a second) against a provider that accepts 5,000 a second, 10,000 with a second provider as fallback. Sending directly loses everything above the provider's rate: 70% with one provider. Putting a queue in front holds the backlog: the last message waits (16,700 − capacity) × 600 ÷ capacity seconds, 23 minutes with one provider and 7 with two.",
    "Without retries a queue still drops 0.5% to provider errors, backoff retries cut that to 0.05%, and a dead-letter queue with replay to nothing. Retries create duplicates when an acknowledgement is lost: 3% without an idempotency key, 0.01% with one. Without a per-user limit 4% of users receive more than five messages in an hour.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ transport: "direct", dedupe: false, retries: "none", limit: false, fallback: false }),
  controls: () => [
    { kind: "choice", id: "transport", label: "Sending", options: [{ id: "direct", label: "Directly to the provider" }, { id: "queue", label: "Through a queue and workers" }] },
    { kind: "choice", id: "retries", label: "Failures", options: [{ id: "none", label: "No retries" }, { id: "backoff", label: "Retry with backoff" }, { id: "dlq", label: "Backoff, then a dead-letter queue with replay" }] },
    { kind: "toggle", id: "dedupe", label: "Idempotency key per notification" },
    { kind: "toggle", id: "limit", label: "A per-user frequency limit" },
    { kind: "toggle", id: "fallback", label: "A second provider as fallback" },
  ],
  evaluate: (v) => {
    const r = notifRun(str(v, "transport"), bool(v, "dedupe"), str(v, "retries"), bool(v, "limit"), bool(v, "fallback"));
    return {
      metrics: { lostShare: r.lost, duplicateShare: r.dupes, delayMin: r.delayMin, spamShare: r.spam },
      readouts: [
        { label: "Never delivered", value: r.lost, fmt: "pct", tone: tone(r.lost, 0.001, 0.01) },
        { label: "Delivered twice", value: r.dupes, fmt: "pct", tone: tone(r.dupes, 0.001, 0.01) },
        { label: "Delay for the last message", value: r.delayMin, fmt: "num", sub: "minutes", tone: tone(r.delayMin, 10, 20) },
        { label: "Users who get spammed", value: r.spam, fmt: "pct", tone: tone(r.spam, 0.005, 0.02) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Never delivered", value: r.lost, tone: tone(r.lost, 0.001, 0.01) }] },
      notes: [r.lost > 0.1 ? "Most of the blast is thrown away at the provider." : r.dupes > 0.01 ? "Retries without keys double-send." : "Everyone gets one message, a little late."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostShare! > 0.3) ev.push("blast-lost");
    if (out.metrics.duplicateShare! > 0.02) ev.push("dupes");
    return ev;
  },
  scene: (n): SceneOut => (n === "queue" ? { set: { transport: "queue" }, focus: ["transport"] } : n === "dedupe" ? { set: { dedupe: true, retries: "backoff" }, focus: ["dedupe"] } : n === "limits" ? { set: { limit: true }, focus: ["limit"] } : undefined),
};

// ------------------------------------------------------------------ news feed

export function feedRun(mode: string, thresholdK: number, cache: boolean) {
  const base = 0.99 * 200;
  const celebFollowers = 2000000;
  const celeb = 0.01;
  const pushCelebs = mode === "write" || (mode === "hybrid" && thresholdK * 1000 >= celebFollowers);
  const writeAmp = mode === "read" ? 1 : base + (pushCelebs ? celeb * celebFollowers : 0);
  const readLookups = mode === "write" ? 1 : mode === "read" ? 200 : pushCelebs ? 1 : 1 + 3;
  const readMs = (cache ? 8 : 20) + readLookups * 0.6;
  const celebDelay = pushCelebs ? celebFollowers / 10000 : 0;
  return { writeAmp, readLookups, readMs, celebDelay };
}
export const feedLab: LabModel = {
  id: "feed-lab",
  metrics: ["writeAmplification", "readLookups", "feedP99Ms", "celebDelaySec"],
  observes: ["write-storm", "slow-feed"],
  scenes: ["write", "read", "hybrid"],
  runLabel: "Run the design",
  honest: [
    "A network where 99% of accounts have 200 followers and 1% are celebrities with 2 million, and every account posts at the same rate. Fan-out on write copies each post to every follower's feed: the average post makes 0.99 × 200 + 0.01 × 2,000,000 = 20,198 writes, almost all of it for celebrities, and a celebrity's post takes 2,000,000 ÷ 10,000 = 200 seconds to land. Fan-out on read copies nothing and gathers the posts of the 200 accounts you follow on every read.",
    "The hybrid pushes for ordinary accounts and pulls celebrities' posts at read time: about 200 writes per post and four lookups per read (your feed plus the three celebrities you follow). The threshold is the follower count above which an account is pulled. A feed cache cuts the base read time from 20 ms to 8 ms and each lookup costs 0.6 ms.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ mode: "write", thresholdK: 100, cache: false }),
  controls: () => [
    { kind: "choice", id: "mode", label: "Building a feed", options: [{ id: "write", label: "Fan-out on write" }, { id: "read", label: "Fan-out on read" }, { id: "hybrid", label: "Hybrid: push, but pull the big accounts" }] },
    { kind: "slider", id: "thresholdK", label: "Pull accounts above (thousand followers)", min: 1, max: 5000, step: 1, log: true, fmt: "int" },
    { kind: "toggle", id: "cache", label: "Cache each user's feed" },
  ],
  evaluate: (v) => {
    const r = feedRun(str(v, "mode"), num(v, "thresholdK"), bool(v, "cache"));
    return {
      metrics: { writeAmplification: r.writeAmp, readLookups: r.readLookups, feedP99Ms: r.readMs, celebDelaySec: r.celebDelay },
      readouts: [
        { label: "Writes per post", value: r.writeAmp, fmt: "int", tone: tone(r.writeAmp, 1000, 5000) },
        { label: "Lookups per feed read", value: r.readLookups, fmt: "int", tone: tone(r.readLookups, 10, 50) },
        { label: "Feed read p99", value: r.readMs, fmt: "ms", tone: tone(r.readMs, 30, 100) },
        { label: "A celebrity's post reaches everyone after", value: r.celebDelay, fmt: "s", tone: tone(r.celebDelay, 30, 120) },
      ],
      view: { kind: "bars", fmt: "int", max: 21000, bars: [{ label: "Writes per post", value: r.writeAmp, tone: tone(r.writeAmp, 1000, 5000) }] },
      notes: [r.writeAmp > 5000 ? "Celebrity posts swamp the write path." : r.readLookups > 50 ? "Every read gathers hundreds of timelines." : "Both paths stay cheap."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.writeAmplification! > 5000) ev.push("write-storm");
    if (out.metrics.readLookups! > 100) ev.push("slow-feed");
    return ev;
  },
  scene: (n): SceneOut => (n === "write" ? { set: { mode: "write" }, focus: ["mode"] } : n === "read" ? { set: { mode: "read" }, focus: ["mode"] } : n === "hybrid" ? { set: { mode: "hybrid", thresholdK: 100 }, focus: ["mode", "thresholdK"] } : undefined),
};

// ------------------------------------------------------------------ web crawler

export function crawlRun(frontier: string, delayS: number, dedup: string, dns: boolean, workers: number) {
  const perWorker = dns ? 20 : 10;
  const hosts = 2000;
  const hostLimit = frontier === "fifo" ? 300 / delayS : hosts / delayS;
  const pps = Math.min(workers * perWorker, hostLimit);
  const dup = dedup === "none" ? 0.3 : dedup === "set" ? 0 : 0.01;
  const mem = dedup === "none" ? 2 : dedup === "set" ? 160 : 12;
  const ban = (delayS < 1 ? 0.15 : 0.005) + (frontier === "fifo" ? 0.3 : 0);
  return { pps, dup, mem, ban };
}
export const crawlLab: LabModel = {
  id: "crawler-lab",
  metrics: ["pagesPerSec", "wastedFetches", "dedupMemoryGB", "banRisk"],
  observes: ["banned", "wasteful"],
  scenes: ["frontier", "dedup", "dns"],
  runLabel: "Start the crawl",
  honest: [
    "A crawler that must fetch a billion pages a month, about 390 a second. A fetch worker does 10 pages a second, 20 with a local DNS cache that saves a 50 ms lookup per page. Politeness means waiting between requests to the same host; with 2,000 hosts active at once, throughput is capped at 2,000 ÷ the delay, and a plain FIFO queue bunches requests onto 300 hosts, capping it at 300 ÷ the delay and hitting some hosts in bursts.",
    "Remembering which of 10 billion URLs were seen: no dedup wastes 30% of fetches on repeats; an exact set of hashes costs 160 GB; a Bloom filter at 1% false positives costs 12 GB and skips 1% of new pages by mistake. Under one second of delay about 15% of hosts block the crawler, and a FIFO frontier adds 30% more.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ frontier: "fifo", delayS: 0.5, dedup: "none", dns: false, workers: 10 }),
  controls: () => [
    { kind: "choice", id: "frontier", label: "The frontier", options: [{ id: "fifo", label: "One FIFO queue" }, { id: "perhost", label: "A queue per host with priorities" }] },
    { kind: "slider", id: "delayS", label: "Delay between requests to one host", min: 0.1, max: 10, step: 0.1, log: true, fmt: "num", hint: "seconds" },
    { kind: "choice", id: "dedup", label: "Seen-URL check", options: [{ id: "none", label: "None" }, { id: "set", label: "An exact set of hashes" }, { id: "bloom", label: "A Bloom filter" }] },
    { kind: "toggle", id: "dns", label: "Cache DNS lookups" },
    { kind: "slider", id: "workers", label: "Fetch workers", min: 5, max: 100, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const r = crawlRun(str(v, "frontier"), num(v, "delayS"), str(v, "dedup"), bool(v, "dns"), Math.round(num(v, "workers")));
    return {
      metrics: { pagesPerSec: r.pps, wastedFetches: r.dup, dedupMemoryGB: r.mem, banRisk: r.ban },
      readouts: [
        { label: "Pages a second", value: r.pps, fmt: "int", sub: "390 needed", tone: toneLow(r.pps, 390, 300) },
        { label: "Fetches wasted on repeats", value: r.dup, fmt: "pct", tone: tone(r.dup, 0.02, 0.1) },
        { label: "Memory for the seen-URL check", value: r.mem, fmt: "gb", tone: tone(r.mem, 40, 100) },
        { label: "Hosts that block us", value: r.ban, fmt: "pct", tone: tone(r.ban, 0.01, 0.1) },
      ],
      view: { kind: "bars", fmt: "int", max: 800, bars: [{ label: "Pages a second", value: Math.min(800, r.pps), tone: toneLow(r.pps, 390, 300) }], lines: [{ value: 390, label: "needed", tone: "warn" }] },
      notes: [r.ban > 0.1 ? "Hosts are blocking a crawler that hits them too fast." : r.dup > 0.1 ? "A third of the work is pages already seen." : "Polite, efficient and fast enough."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.banRisk! > 0.1) ev.push("banned");
    if (out.metrics.wastedFetches! > 0.2) ev.push("wasteful");
    return ev;
  },
  scene: (n): SceneOut => (n === "frontier" ? { set: { frontier: "perhost" }, focus: ["frontier"] } : n === "dedup" ? { set: { dedup: "bloom" }, focus: ["dedup"] } : n === "dns" ? { set: { dns: true }, focus: ["dns"] } : undefined),
};

// ------------------------------------------------------------------ distributed rate limiter

export function dlimRun(store: string, sync: string, fail: string, fallback: boolean) {
  const instances = 20;
  const overshoot = store === "local" ? instances : sync === "none" ? 3 : sync === "periodic" ? 1.2 : 1;
  const latency = store === "local" ? 0 : sync === "strict" ? 3.4 : sync === "periodic" ? 0.2 : 1.2;
  const outageAvail = store === "local" ? 1 : fail === "closed" ? 0 : 1;
  const outageOver = store === "local" ? instances : fail === "closed" ? 0 : fallback ? 1.5 : 100;
  return { overshoot, latency, outageAvail, outageOver };
}
export const dlimLab: LabModel = {
  id: "dlimiter-lab",
  metrics: ["overshoot", "addedMs", "outageAvailability", "outageOvershoot"],
  observes: ["no-limit", "outage"],
  scenes: ["central", "sync", "fallback"],
  runLabel: "Run the design",
  honest: [
    "An API behind 20 instances must enforce 1,000 requests a minute per client. With each instance counting on its own, a client spread over 20 instances can send up to 20 times the limit. A central Redis counter is exact (overshoot 1×) and adds a 1.2 ms round trip to every request. Syncing counts every second instead keeps a local fast path (0.2 ms) at about 20% overshoot. A strictly serialised counter adds 3.4 ms.",
    "When Redis fails, a limiter that fails closed rejects everything (availability 0) and one that fails open lets everything through (no limit at all, 100×, because the limiter was the only protection). Falling back to local counters during the outage bounds the overshoot to about 1.5× with the limit split across instances.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ store: "local", sync: "none", fail: "open", fallback: false }),
  controls: () => [
    { kind: "choice", id: "store", label: "Where counts live", options: [{ id: "local", label: "In each instance's memory" }, { id: "central", label: "A central Redis" }] },
    { kind: "choice", id: "sync", label: "Updating the central count", options: [{ id: "none", label: "Asynchronously, when convenient" }, { id: "periodic", label: "Local counts, synced every second" }, { id: "strict", label: "A strict atomic update per request" }] },
    { kind: "choice", id: "fail", label: "When Redis is down", options: [{ id: "open", label: "Fail open" }, { id: "closed", label: "Fail closed" }] },
    { kind: "toggle", id: "fallback", label: "Fall back to local counters in an outage" },
  ],
  evaluate: (v) => {
    const r = dlimRun(str(v, "store"), str(v, "sync"), str(v, "fail"), bool(v, "fallback"));
    return {
      metrics: { overshoot: r.overshoot, addedMs: r.latency, outageAvailability: r.outageAvail, outageOvershoot: r.outageOver },
      readouts: [
        { label: "Largest burst over the limit", value: r.overshoot, fmt: "x", tone: tone(r.overshoot, 1.25, 2) },
        { label: "Added latency", value: r.latency, fmt: "ms", tone: tone(r.latency, 2, 5) },
        { label: "Availability when Redis is down", value: r.outageAvail, fmt: "pct", tone: toneLow(r.outageAvail, 0.999, 0.9) },
        { label: "Overshoot when Redis is down", value: r.outageOver, fmt: "x", tone: tone(r.outageOver, 2, 10) },
      ],
      view: { kind: "bars", fmt: "x", max: 20, bars: [{ label: "Overshoot", value: Math.min(20, r.overshoot), tone: tone(r.overshoot, 1.25, 2) }, { label: "Overshoot in an outage", value: Math.min(20, r.outageOver), tone: tone(r.outageOver, 2, 10) }] },
      notes: [r.overshoot >= 10 ? "Each instance thinks it is the only one." : r.outageOver > 10 ? "In an outage the limit disappears." : "Close to the limit, and bounded when things break."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.overshoot! >= 10) ev.push("no-limit");
    if (out.metrics.outageOvershoot! >= 50 || out.metrics.outageAvailability! < 0.5) ev.push("outage");
    return ev;
  },
  scene: (n): SceneOut => (n === "central" ? { set: { store: "central", sync: "strict" }, focus: ["store"] } : n === "sync" ? { set: { store: "central", sync: "periodic" }, focus: ["sync"] } : n === "fallback" ? { set: { store: "central", sync: "periodic", fallback: true }, focus: ["fallback"] } : undefined),
};

// ------------------------------------------------------------------ chat

export function chatRun(transport: string, connsK: number, store: string, delivery: string, presence: string) {
  const users = 100e6;
  const servers = transport === "poll" ? Math.ceil((users / 5) / 20000) : Math.ceil(users / (connsK * 1000));
  const p99 = transport === "poll" ? 5000 : 80 + connsK * 0.8;
  const lost = delivery === "atmost" ? 0.005 : 0;
  const dup = delivery === "atleast" ? 0.002 : delivery === "dedupe" ? 0.00001 : 0;
  const presenceLoad = presence === "push" ? 926000 : 20000;
  const storeOk = store === "single" ? 0 : 1;
  return { servers, p99, lost, dup, presenceLoad, storeOk };
}
export const chatLab: LabModel = {
  id: "chat-lab",
  metrics: ["serversNeeded", "deliveryP99Ms", "lostShare", "duplicateShare", "presenceEventsPerSec", "storeHolds"],
  observes: ["poll-fleet", "presence-storm"],
  scenes: ["transport", "delivery", "presence"],
  runLabel: "Run the design",
  honest: [
    "100 million users online. Polling every 5 seconds is 20 million requests a second, at 20,000 a second per server, 1,000 servers, with a delivery p99 of 5 seconds. Persistent connections hold 100 million sockets at the density you choose per server (a connection costs about 20 KB, so memory allows hundreds of thousands, and busy servers get slower: p99 grows with connections, 80 ms plus 0.8 ms per thousand).",
    "Delivery: at-most-once loses 0.5% of messages; at-least-once with acknowledgements loses none and delivers 0.2% twice; adding a deduplication key by message ID leaves 0.001%. Presence: pushing every status change to each of 200 contacts is 926,000 events a second; fetching presence only for the chats on screen is 20,000. One database cannot hold the message history; sharding by chat keeps a conversation's messages together.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ transport: "poll", connsK: 100, store: "single", delivery: "atmost", presence: "push" }),
  controls: () => [
    { kind: "choice", id: "transport", label: "Transport", options: [{ id: "poll", label: "Polling every 5 seconds" }, { id: "ws", label: "Persistent WebSocket connections" }] },
    { kind: "slider", id: "connsK", label: "Connections per server", min: 10, max: 500, step: 10, fmt: "int", hint: "thousand" },
    { kind: "choice", id: "store", label: "Message storage", options: [{ id: "single", label: "One database" }, { id: "chat", label: "Sharded by chat" }] },
    { kind: "choice", id: "delivery", label: "Delivery", options: [{ id: "atmost", label: "At most once" }, { id: "atleast", label: "At least once with acknowledgements" }, { id: "dedupe", label: "At least once plus a dedup key" }] },
    { kind: "choice", id: "presence", label: "Presence", options: [{ id: "push", label: "Push every change to every contact" }, { id: "pull", label: "Fetch for the chats on screen" }] },
  ],
  evaluate: (v) => {
    const r = chatRun(str(v, "transport"), num(v, "connsK"), str(v, "store"), str(v, "delivery"), str(v, "presence"));
    return {
      metrics: { serversNeeded: r.servers, deliveryP99Ms: r.p99, lostShare: r.lost, duplicateShare: r.dup, presenceEventsPerSec: r.presenceLoad, storeHolds: r.storeOk },
      readouts: [
        { label: "Connection servers", value: r.servers, fmt: "int", tone: tone(r.servers, 1000, 2000) },
        { label: "Delivery p99", value: r.p99, fmt: "ms", tone: tone(r.p99, 300, 1000) },
        { label: "Messages lost", value: r.lost, fmt: "pct", tone: tone(r.lost, 0.00001, 0.001) },
        { label: "Delivered twice", value: r.dup, fmt: "pct", tone: tone(r.dup, 0.0001, 0.001) },
        { label: "Presence events a second", value: r.presenceLoad, fmt: "int", tone: tone(r.presenceLoad, 100000, 500000) },
        { label: "Storage holds the history", value: yn(r.storeOk), tone: r.storeOk ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "int", max: 1200, bars: [{ label: "Servers", value: Math.min(1200, r.servers), tone: tone(r.servers, 1000, 2000) }] },
      notes: [r.servers >= 1000 && str(v, "transport") === "poll" ? "A fleet exists only to answer 'anything new?'" : r.presenceLoad > 500000 ? "Presence updates are the biggest load in the system." : "Messages are pushed, once, and the history is partitioned."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "transport") === "poll" && out.metrics.serversNeeded! >= 1000) ev.push("poll-fleet");
    if (out.metrics.presenceEventsPerSec! > 500000) ev.push("presence-storm");
    return ev;
  },
  scene: (n): SceneOut => (n === "transport" ? { set: { transport: "ws", connsK: 100 }, focus: ["transport", "connsK"] } : n === "delivery" ? { set: { delivery: "dedupe" }, focus: ["delivery"] } : n === "presence" ? { set: { presence: "pull" }, focus: ["presence"] } : undefined),
};

// ------------------------------------------------------------------ autocomplete

export function acRun(structure: string, update: string, cache: boolean) {
  const rps = 100000;
  const cap = structure === "array" ? 200 : structure === "trie" ? 3000 : 50000;
  const hit = cache ? 0.9 : 0;
  const servers = Math.ceil((rps * (1 - hit)) / cap);
  const p99 = structure === "array" ? 600 : structure === "trie" ? 40 : 1.5;
  const mem = structure === "array" ? 4 : structure === "trie" ? 12 : 20;
  const fresh = (update === "realtime" ? 0.1 : update === "hourly" ? 60 : 1440) + (cache ? 5 : 0);
  return { servers, p99, mem, fresh };
}
export const acLab: LabModel = {
  id: "autocomplete-lab",
  metrics: ["serversNeeded", "p99Ms", "memoryGB", "freshnessMin"],
  observes: ["slow-prefix", "stale-trends"],
  scenes: ["trie", "topk", "refresh"],
  runLabel: "Run the design",
  honest: [
    "100 million distinct queries, 100,000 lookups a second at peak, each one a prefix. A sorted array finds the prefix range by binary search and then scans every match to find the top ten: for short prefixes millions of strings, p99 600 ms, 200 lookups a second per server, 4 GB. A trie finds the node quickly and still walks its subtree to rank the matches: p99 40 ms, 3,000 a second per server, 12 GB. Storing the top ten completions at every node answers in one step: 1.5 ms, 50,000 a second per server, 20 GB.",
    "A cache of popular prefixes takes 90% of the traffic and adds 5 minutes of staleness; it does not help the p99, because the one in ten that misses is slower than the 99th percentile. Rebuilding the structure daily leaves trends 24 hours stale, hourly 60 minutes, and applying updates continuously 6 seconds. Servers needed is the post-cache rate divided by what one server does.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ structure: "array", update: "daily", cache: false }),
  controls: () => [
    { kind: "choice", id: "structure", label: "Index", options: [{ id: "array", label: "A sorted array with binary search" }, { id: "trie", label: "A trie, ranking the subtree on demand" }, { id: "topk", label: "A trie with the top ten stored at each node" }] },
    { kind: "choice", id: "update", label: "Refreshing counts", options: [{ id: "realtime", label: "Continuously" }, { id: "hourly", label: "Rebuild hourly" }, { id: "daily", label: "Rebuild daily" }] },
    { kind: "toggle", id: "cache", label: "Cache popular prefixes (90% of traffic)" },
  ],
  evaluate: (v) => {
    const r = acRun(str(v, "structure"), str(v, "update"), bool(v, "cache"));
    return {
      metrics: { serversNeeded: r.servers, p99Ms: r.p99, memoryGB: r.mem, freshnessMin: r.fresh },
      readouts: [
        { label: "Servers needed", value: r.servers, fmt: "int", tone: tone(r.servers, 10, 100) },
        { label: "Lookup p99", value: r.p99, fmt: "ms", tone: tone(r.p99, 20, 100) },
        { label: "Memory per server", value: r.mem, fmt: "gb", tone: tone(r.mem, 32, 64) },
        { label: "How stale trends are", value: r.fresh, fmt: "num", sub: "minutes", tone: tone(r.fresh, 60, 600) },
      ],
      view: { kind: "bars", fmt: "int", max: 520, bars: [{ label: "Servers", value: Math.min(520, r.servers), tone: tone(r.servers, 10, 100) }] },
      notes: [r.servers > 100 ? "Ranking matches on every keystroke needs a large fleet." : r.fresh > 600 ? "It suggests yesterday's news." : "Answers are precomputed and fresh enough."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.p99Ms! > 100) ev.push("slow-prefix");
    if (out.metrics.freshnessMin! > 600) ev.push("stale-trends");
    return ev;
  },
  scene: (n): SceneOut => (n === "trie" ? { set: { structure: "trie" }, focus: ["structure"] } : n === "topk" ? { set: { structure: "topk" }, focus: ["structure"] } : n === "refresh" ? { set: { update: "hourly" }, focus: ["update"] } : undefined),
};

// ------------------------------------------------------------------ ride hailing

export function rideRun(index: string, intervalS: number, match: string, partition: string) {
  const drivers = 1e6;
  const updates = drivers / intervalS;
  const servers = Math.ceil(updates / (partition === "cell" ? 20000 : 12000));
  const q = index === "grid" ? 80 : index === "geohash" ? 6 : 4;
  const stale = (intervalS / 2) * 8;
  const pickup = (match === "batch" ? 150 : 190) + (index === "grid" ? 20 : 0) + intervalS * 1.5;
  return { updates, servers, q, stale, pickup };
}
export const rideLab: LabModel = {
  id: "ride-lab",
  metrics: ["updatesPerSec", "serversNeeded", "queryP99Ms", "locationErrorM", "pickupSec"],
  observes: ["hot-cell", "stale-map"],
  scenes: ["index", "interval", "batch"],
  runLabel: "Run the design",
  honest: [
    "One million drivers online, each reporting a location every few seconds you choose (every 4 s is 250,000 updates a second). A server holds 12,000 updates a second when partitioned by city and 20,000 when by cell. Finding the drivers near a rider is a range query: a uniform grid has hot cells in dense centres (p99 80 ms), geohash prefixes give predictable cells (6 ms), a quadtree subdivides where it is crowded (4 ms).",
    "A driver at 8 m/s is on average half an interval away from the reported point: 16 m at 4 s. Matching each request to the nearest free driver on arrival averages a 190 s pickup; collecting requests for two seconds and assigning in a batch (so a driver is not given to a rider for whom a better one is free) averages 150 s. Coarser updates and a worse index add to the pickup estimate.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ index: "grid", intervalS: 4, match: "nearest", partition: "city" }),
  controls: () => [
    { kind: "choice", id: "index", label: "Spatial index", options: [{ id: "grid", label: "A uniform grid" }, { id: "geohash", label: "Geohash cells" }, { id: "quadtree", label: "A quadtree" }] },
    { kind: "slider", id: "intervalS", label: "Location report interval", min: 1, max: 30, step: 1, fmt: "int", hint: "seconds" },
    { kind: "choice", id: "match", label: "Matching", options: [{ id: "nearest", label: "Nearest free driver, on arrival" }, { id: "batch", label: "Batch assignment every two seconds" }] },
    { kind: "choice", id: "partition", label: "Sharding", options: [{ id: "city", label: "By city" }, { id: "cell", label: "By geographic cell" }] },
  ],
  evaluate: (v) => {
    const r = rideRun(str(v, "index"), num(v, "intervalS"), str(v, "match"), str(v, "partition"));
    return {
      metrics: { updatesPerSec: r.updates, serversNeeded: r.servers, queryP99Ms: r.q, locationErrorM: r.stale, pickupSec: r.pickup },
      readouts: [
        { label: "Location updates a second", value: r.updates, fmt: "int" },
        { label: "Servers for the updates", value: r.servers, fmt: "int", tone: tone(r.servers, 25, 60) },
        { label: "Nearby-driver query p99", value: r.q, fmt: "ms", tone: tone(r.q, 20, 60) },
        { label: "Average location error", value: r.stale, fmt: "int", sub: "metres", tone: tone(r.stale, 30, 80) },
        { label: "Average pickup time", value: r.pickup, fmt: "int", sub: "seconds", tone: tone(r.pickup, 160, 200) },
      ],
      view: { kind: "bars", fmt: "int", max: 300, bars: [{ label: "Average pickup (s)", value: r.pickup, tone: tone(r.pickup, 160, 200) }] },
      notes: [r.q > 60 ? "Dense city centres overload their cells." : r.stale > 80 ? "The map shows where drivers were." : "Fresh enough, and cheap to query."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.queryP99Ms! > 60) ev.push("hot-cell");
    if (out.metrics.locationErrorM! > 60) ev.push("stale-map");
    return ev;
  },
  scene: (n): SceneOut => (n === "index" ? { set: { index: "quadtree" }, focus: ["index"] } : n === "interval" ? { set: { intervalS: 4 }, focus: ["intervalS"] } : n === "batch" ? { set: { match: "batch" }, focus: ["match"] } : undefined),
};

// ------------------------------------------------------------------ video pipeline

export function videoRun(resumable: boolean, ladder: string, segmentParallel: boolean, cdn: boolean, tiering: boolean) {
  const rend = ladder === "single" ? 1 : ladder === "fixed" ? 5 : 3.5;
  const coreHoursPerHour = 1.5 * rend;
  const cores = Math.ceil((1000 / 24 / 3600) * coreHoursPerHour * 3600 * 3);
  const serialMin = (coreHoursPerHour * 60) / 3;
  const ttpMin = segmentParallel ? 2 + serialMin / 30 : 5 + serialMin;
  const uploadFail = resumable ? 0.005 : 0.12;
  const egress = cdn ? 0.02 : 0.09;
  const costDay = (cores / 3) * 24 * 0.04 + 150000 * egress + (tiering ? 80 : 240);
  return { cores, ttpMin, uploadFail, quality: ladder === "single" ? 0.6 : 1, costDay: Math.round(costDay) };
}
export const videoLab: LabModel = {
  id: "video-lab",
  metrics: ["coresNeeded", "timeToPlayMin", "uploadFailure", "viewerQuality", "costPerDay"],
  observes: ["fail-uploads", "slow-publish"],
  scenes: ["chunks", "ladder", "cdn"],
  runLabel: "Run the design",
  honest: [
    "1,000 hours of video are uploaded a day, three times that at peak. A one-hour video takes 1.5 core-hours to encode into one rendition, so a ladder of 5 renditions costs 7.5, a per-title ladder (fewer renditions for simple content) averages 3.5, and one rendition 1.5. Encoding a whole file on one machine takes 20 minutes of wall-clock per core-hour-per-hour of work (30 minutes for one rendition, 150 for five); splitting it into 30 segments encoded in parallel brings the time to play down to a few minutes. Cores needed at peak (three times the average) follow from the work. Compute costs $0.04 a core-hour.",
    "Uploading a large file in one request fails 12% of the time on a bad connection; resumable chunked uploads fail 0.5%. Viewers watch 100,000 hours a day at 1.5 GB an hour; a CDN cuts delivery from $0.09 to $0.02 a gigabyte. A single 720p rendition suits few viewers (60% get a fitting quality). Keeping old videos on cold storage cuts the storage bill from $240 to $80 a day. Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ resumable: false, ladder: "single", segmentParallel: false, cdn: false, tiering: false }),
  controls: () => [
    { kind: "toggle", id: "resumable", label: "Resumable chunked uploads" },
    { kind: "choice", id: "ladder", label: "Renditions", options: [{ id: "single", label: "A single 720p" }, { id: "fixed", label: "A fixed ladder of five" }, { id: "pertitle", label: "A per-title ladder" }] },
    { kind: "toggle", id: "segmentParallel", label: "Encode segments in parallel" },
    { kind: "toggle", id: "cdn", label: "Serve from a CDN" },
    { kind: "toggle", id: "tiering", label: "Move old videos to cold storage" },
  ],
  evaluate: (v) => {
    const r = videoRun(bool(v, "resumable"), str(v, "ladder"), bool(v, "segmentParallel"), bool(v, "cdn"), bool(v, "tiering"));
    return {
      metrics: { coresNeeded: r.cores, timeToPlayMin: r.ttpMin, uploadFailure: r.uploadFail, viewerQuality: r.quality, costPerDay: r.costDay },
      readouts: [
        { label: "Encode cores at peak", value: r.cores, fmt: "int", tone: tone(r.cores, 600, 1500) },
        { label: "Minutes until a video can play", value: r.ttpMin, fmt: "num", tone: tone(r.ttpMin, 10, 30) },
        { label: "Uploads that fail", value: r.uploadFail, fmt: "pct", tone: tone(r.uploadFail, 0.01, 0.05) },
        { label: "Viewers who get a fitting quality", value: r.quality, fmt: "pct", tone: toneLow(r.quality, 0.9, 0.7) },
        { label: "Cost a day", value: r.costDay, fmt: "usd", tone: tone(r.costDay, 4000, 8000) },
      ],
      view: { kind: "bars", fmt: "usd", max: 16000, bars: [{ label: "Cost a day", value: Math.min(16000, r.costDay), tone: tone(r.costDay, 4000, 8000) }] },
      notes: [r.uploadFail > 0.05 ? "One in eight uploads dies and starts again from zero." : r.ttpMin > 30 ? "Creators wait most of an hour to publish." : "Uploads survive, encodes fan out, delivery is cheap."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.uploadFailure! > 0.1) ev.push("fail-uploads");
    if (out.metrics.timeToPlayMin! > 30) ev.push("slow-publish");
    return ev;
  },
  scene: (n): SceneOut => (n === "chunks" ? { set: { resumable: true }, focus: ["resumable"] } : n === "ladder" ? { set: { ladder: "pertitle", segmentParallel: true }, focus: ["ladder", "segmentParallel"] } : n === "cdn" ? { set: { cdn: true, tiering: true }, focus: ["cdn", "tiering"] } : undefined),
};

export const CASES_A_MODELS: LabModel[] = [urlLab, kvLab, payLab, ticketLab, notifLab, feedLab, crawlLab, dlimLab, chatLab, acLab, rideLab, videoLab];
