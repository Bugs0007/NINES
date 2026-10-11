/**
 * Chapter A10 "Interfaces" models: API styles, pagination, idempotency-key policy, API versioning, rate-limiting
 * algorithms, real-time transports, and webhook delivery. Closed forms with labelled round constants.
 */
import { lognormal } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ API styles

export const apiStyleLab: LabModel = {
  id: "apistyle-lab",
  metrics: ["loadMs", "kb", "dbQueries", "needsProxy", "rounds"],
  observes: ["chatty", "n-plus-one"],
  scenes: ["rest", "graphql", "grpc"],
  runLabel: "Choose the API style",
  honest: [
    "A home screen needs a user profile, their recent orders, and recommendations for those orders, where the recommendations depend on the order ids. Full objects total 120 KB of JSON, of which the screen uses 18 KB.",
    "REST and gRPC fetch whole objects: two rounds (profile and orders in parallel, then recommendations). gRPC's binary encoding is about 0.4 of JSON. GraphQL asks for exactly the 18 KB in one round. Without batching, GraphQL's resolvers run one query for each of the 20 recommendations; a loader batches them into one.",
    "Mobile is 100 ms round trip at 1.5 Mbps (187 KB a second); a browser is 40 ms at 10 Mbps; a service is 1 ms. Server time is 30 ms for REST, 25 for gRPC and 40 for GraphQL. Browsers cannot speak gRPC without a translating proxy.",
  ],
  init: (c) => ({ style: "rest", loader: false, client: (c as { client?: string }).client ?? "mobile" }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "style", label: "API style", options: [{ id: "rest", label: "REST: resources and JSON" }, { id: "graphql", label: "GraphQL: the client asks for fields" }, { id: "grpc", label: "gRPC: typed calls, binary" }] },
      { kind: "toggle", id: "loader", label: "Batch the resolvers (GraphQL)", detail: "One query for all 20 recommendations" },
    ];
    if (!(c as { lockClient?: boolean }).lockClient) out.push({ kind: "choice", id: "client", label: "Client", options: [{ id: "mobile", label: "Mobile app on 4G" }, { id: "browser", label: "Browser on broadband" }, { id: "service", label: "Another service in the same data centre" }] });
    return out;
  },
  evaluate: (v) => {
    const s = str(v, "style");
    const cl = str(v, "client");
    const net = cl === "mobile" ? { rtt: 100, kbps: 187.5 } : cl === "browser" ? { rtt: 40, kbps: 1250 } : { rtt: 1, kbps: 1e6 };
    const rounds = s === "graphql" ? 1 : 2;
    const kb = s === "graphql" ? 18 : s === "grpc" ? 48 : 120;
    const server = s === "graphql" ? 40 : s === "grpc" ? 25 : 30;
    const db = s === "graphql" ? (bool(v, "loader") ? 4 : 23) : 3;
    const nPlus = s === "graphql" && !bool(v, "loader") ? 40 : 0;
    const ms = rounds * net.rtt + (kb / net.kbps) * 1000 + server + nPlus;
    const proxy = s === "grpc" && cl === "browser" ? 1 : 0;
    return {
      metrics: { loadMs: ms, kb, dbQueries: db, needsProxy: proxy, rounds },
      readouts: [
        { label: "Time to load the screen", value: ms, fmt: "ms", tone: tone(ms, 300, 600) },
        { label: "Round trips in sequence", value: rounds, fmt: "int" },
        { label: "Data downloaded", value: kb, fmt: "num", sub: "KB", tone: tone(kb, 40, 100) },
        { label: "Database queries per screen", value: db, fmt: "int", tone: tone(db, 5, 10) },
        { label: "Needs a translating proxy", value: proxy ? "yes" : "no", tone: proxy ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "ms", bars: [{ label: "Network round trips", value: rounds * net.rtt, tone: "info" }, { label: "Transfer", value: (kb / net.kbps) * 1000, tone: "info" }, { label: "Server work", value: server + nPlus, tone: "muted" }] },
      notes: [s === "graphql" && !bool(v, "loader") ? "One round trip, but each recommendation triggers its own database query." : s === "rest" ? "Whole objects and two sequential rounds. Simple, cacheable and easy to tool." : s === "grpc" ? "Compact and fast between services; a browser needs a proxy." : "The client asks for exactly what it shows, in one round."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.rounds! > 1 && str(v, "client") === "mobile") ev.push("chatty");
    if (out.metrics.dbQueries! > 10) ev.push("n-plus-one");
    return ev;
  },
  scene: (n): SceneOut => (n === "rest" ? { set: { style: "rest" }, focus: ["style"] } : n === "graphql" ? { set: { style: "graphql", loader: true }, focus: ["style", "loader"] } : n === "grpc" ? { set: { style: "grpc" }, focus: ["style"] } : undefined),
};

// ------------------------------------------------------------------ pagination

export const paginationLab: LabModel = {
  id: "pagination-lab",
  metrics: ["queryMs", "dupPerPage", "rowsScanned", "canJump"],
  observes: ["deep-slow", "skipped"],
  scenes: ["offset", "drift", "cursor"],
  runLabel: "Choose the pagination",
  honest: [
    "A table of 50 million rows listed newest first, 50 per page. An index on the sort key lets the database skip rows cheaply, at about 0.5 microseconds per row skipped. Without it every page scans and sorts all 50 million rows.",
    "Offset pagination (LIMIT 50 OFFSET n) must walk past every earlier row, so page 100,000 skips 5 million. Cursor pagination (WHERE key < last seen) seeks straight to the position. A person takes about 10 seconds between pages; new rows arriving in that time push everything down, so offset pages repeat items (up to a page's worth), and cursors do not.",
    "Cursors cannot jump to page 7,000 directly; offsets can.",
  ],
  init: (c) => ({ method: "offset", page: (c as { page?: number }).page ?? 100000, inserts: (c as { inserts?: number }).inserts ?? 20, indexed: true }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "method", label: "Pagination", options: [{ id: "offset", label: "Offset: page number" }, { id: "cursor", label: "Cursor: continue after the last item" }] }];
    if (!(c as { lockPage?: boolean }).lockPage) out.push({ kind: "slider", id: "page", label: "Page being fetched", min: 1, max: 1000000, log: true, fmt: "int" }, { kind: "slider", id: "inserts", label: "New rows arriving per second", min: 0, max: 200, step: 1, fmt: "int" });
    out.push({ kind: "toggle", id: "indexed", label: "Index on the sort key" });
    return out;
  },
  evaluate: (v) => {
    const offset = str(v, "method") === "offset";
    const idx = bool(v, "indexed");
    const page = Math.round(num(v, "page"));
    const rows = idx ? (offset ? page * 50 : 50) : 5e7;
    const ms = 1 + rows * (idx ? 0.0005 : 0.002);
    const dup = offset ? Math.min(50, num(v, "inserts") * 10) : 0;
    return {
      metrics: { queryMs: ms, dupPerPage: dup, rowsScanned: rows, canJump: offset ? 1 : 0 },
      readouts: [
        { label: "Query time", value: ms, fmt: "ms", tone: tone(ms, 50, 500) },
        { label: "Rows the database walks", value: rows, fmt: "int", tone: rows > 1e6 ? "warn" : "ok" },
        { label: "Items repeated on each page", value: dup, fmt: "int", tone: dup > 0 ? "alert" : "ok" },
        { label: "Can jump to any page", value: offset ? "yes" : "no", tone: "info" },
      ],
      view: { kind: "bars", fmt: "ms", bars: [{ label: "Query time", value: ms, tone: tone(ms, 50, 500) }] },
      notes: [!idx ? "Without an index every page sorts the whole table." : offset ? (page > 10000 ? "Deep pages walk millions of rows before returning fifty." : "Fine for shallow pages.") : "Constant work for every page, wherever you are."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.queryMs! > 500) ev.push("deep-slow");
    if (out.metrics.dupPerPage! > 0) ev.push("skipped");
    return ev;
  },
  scene: (n): SceneOut => (n === "offset" ? { set: { method: "offset", page: 100000 }, focus: ["method", "page"] } : n === "drift" ? { set: { method: "offset", inserts: 20 }, focus: ["inserts"] } : n === "cursor" ? { set: { method: "cursor" }, focus: ["method"] } : undefined),
};

// ------------------------------------------------------------------ idempotency-key policy

export const idemKeyLab: LabModel = {
  id: "idemkey-lab",
  metrics: ["doublePerMillion", "wrongPerMillion", "stuckPerMillion", "leakPerMillion"],
  observes: ["double", "stuck"],
  scenes: ["inflight", "mismatch", "failure"],
  runLabel: "Set the key rules",
  honest: [
    "A payments API that accepts an Idempotency-Key header, per million requests. 200 are retried while the first attempt is still running; 50 reuse a key with a different body (a client bug); 300 first attempts fail with a transient 500, and the client retries with the same key; 5 clients in a million generate a key that another account already used.",
    "Running the second copy of an in-flight request charges twice. Ignoring a changed body returns the earlier request's result for a different request. Replaying a stored 500 means the retry can never succeed. A key shared across accounts returns somebody else's response.",
    "Each rule is exact for these counts; real rates vary.",
  ],
  init: () => ({ inflight: "again", mismatch: "ignore", failure: "replay", scope: "global" }),
  controls: () => [
    { kind: "choice", id: "inflight", label: "A retry arrives while the first attempt is still running", options: [{ id: "again", label: "Run it again" }, { id: "conflict", label: "Reject with 409 Conflict and let the client retry later" }, { id: "wait", label: "Wait for the first and return its result" }] },
    { kind: "choice", id: "mismatch", label: "The key is reused with a different request body", options: [{ id: "ignore", label: "Return the saved response" }, { id: "reject", label: "Reject with 422" }] },
    { kind: "choice", id: "failure", label: "The first attempt failed with a server error", options: [{ id: "replay", label: "Save it and replay it for every retry" }, { id: "release", label: "Release the key so the retry can run" }] },
    { kind: "choice", id: "scope", label: "Keys are unique", options: [{ id: "global", label: "Across all accounts" }, { id: "account", label: "Per account" }] },
  ],
  evaluate: (v) => {
    const dbl = str(v, "inflight") === "again" ? 200 : 0;
    const wrong = str(v, "mismatch") === "ignore" ? 50 : 0;
    const stuck = str(v, "failure") === "replay" ? 300 : 0;
    const leak = str(v, "scope") === "global" ? 5 : 0;
    const t = (x: number): Tone => (x > 0 ? "alert" : "ok");
    return {
      metrics: { doublePerMillion: dbl, wrongPerMillion: wrong, stuckPerMillion: stuck, leakPerMillion: leak },
      readouts: [
        { label: "Charged twice, per million", value: dbl, fmt: "int", tone: t(dbl) },
        { label: "Wrong request answered, per million", value: wrong, fmt: "int", tone: t(wrong) },
        { label: "Retries that can never succeed, per million", value: stuck, fmt: "int", tone: t(stuck) },
        { label: "Another account's response returned, per million", value: leak, fmt: "int", tone: t(leak) },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Double charges", value: dbl, tone: t(dbl) }, { label: "Wrong answers", value: wrong, tone: t(wrong) }, { label: "Stuck retries", value: stuck, tone: t(stuck) }, { label: "Cross-account", value: leak, tone: t(leak) }] },
      notes: ["Each setting closes one hole. Left open, each shows up as a different kind of support ticket."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.doublePerMillion! > 0) ev.push("double");
    if (out.metrics.stuckPerMillion! > 0) ev.push("stuck");
    return ev;
  },
  scene: (n): SceneOut => (n === "inflight" ? { set: { inflight: "again" }, focus: ["inflight"] } : n === "mismatch" ? { set: { mismatch: "ignore" }, focus: ["mismatch"] } : n === "failure" ? { set: { failure: "replay" }, focus: ["failure"] } : undefined),
};

// ------------------------------------------------------------------ API versioning

export const apiVersionLab: LabModel = {
  id: "apiversion-lab",
  metrics: ["brokenPct", "costFTE", "blockedPerYear"],
  observes: ["broke-clients", "blocked"],
  scenes: ["breaking", "urls", "datepin"],
  runLabel: "Plan the migration",
  honest: [
    "An API with 1,000 integrations and a breaking change each year. Clients take a while to upgrade: the time is lognormal with a median of 9 months and a 90th percentile of 30 months. Shipping a breaking change with no versioning breaks every client still on the old behaviour: everyone, here.",
    "URL versions keep each major alive for the deprecation window; clients not upgraded by sunset break. Each live version costs 0.5 of an engineer. Additive-only evolution never breaks anyone but blocks 3 needed changes a year and costs 0.4 of an engineer plus a little more each year for the accumulated cruft (about 1.2 after five years). A date-pinned version with a compatibility layer (as in Stripe's API) keeps each client on its version by translating requests, for 0.5 plus 0.1 of an engineer per release kept, 1.0 after five years.",
    "The costs are round figures to compare strategies, not budgets.",
  ],
  init: () => ({ strategy: "breaking", window: 24 }),
  controls: () => [
    { kind: "choice", id: "strategy", label: "How breaking changes ship", options: [{ id: "breaking", label: "Change it and tell people" }, { id: "urls", label: "New major version in the URL (/v1, /v2)" }, { id: "additive", label: "Only add fields; never remove or change" }, { id: "datepin", label: "Pin each client to a date, translate between versions" }] },
    { kind: "slider", id: "window", label: "Keep an old major for", min: 6, max: 60, step: 1, fmt: "int", hint: "months" },
  ],
  evaluate: (v) => {
    const s = str(v, "strategy");
    const w = num(v, "window");
    const lag = lognormal(9, 30);
    const broken = s === "breaking" ? 1 : s === "urls" ? 1 - lag.cdf(w) : 0;
    const cost = s === "urls" ? 0.5 * (1 + Math.ceil(w / 12)) : s === "additive" ? 1.2 : s === "datepin" ? 1.0 : 0.3;
    const blocked = s === "additive" ? 3 : 0;
    return {
      metrics: { brokenPct: broken, costFTE: cost, blockedPerYear: blocked },
      readouts: [
        { label: "Integrations broken", value: broken, fmt: "pct", tone: broken > 0.02 ? "alert" : broken > 0 ? "warn" : "ok" },
        { label: "Engineers to maintain it", value: cost, fmt: "num", tone: cost > 2 ? "alert" : cost > 1.2 ? "warn" : "ok" },
        { label: "Needed changes blocked each year", value: blocked, fmt: "int", tone: blocked ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Broken integrations, percent", value: broken * 100, tone: broken > 0.02 ? "alert" : "ok" }, { label: "Engineers", value: cost, tone: cost > 2 ? "alert" : "info" }] },
      notes: [s === "breaking" ? "Every client on the old behaviour breaks on deploy day." : s === "urls" ? "A longer window breaks fewer clients and keeps more versions alive." : s === "additive" ? "Nobody breaks, and the API can never be tidied." : "Each client keeps seeing the shape it signed up for."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.brokenPct! > 0.005) ev.push("broke-clients");
    if (out.metrics.blockedPerYear! > 0) ev.push("blocked");
    return ev;
  },
  scene: (n): SceneOut => (n === "breaking" ? { set: { strategy: "breaking" }, focus: ["strategy"] } : n === "urls" ? { set: { strategy: "urls", window: 24 }, focus: ["strategy", "window"] } : n === "datepin" ? { set: { strategy: "datepin" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ rate limiting

export const rateLimiterLab: LabModel = {
  id: "ratelimiter-lab",
  metrics: ["worstPerSec", "legitRejectedPct", "legitDelayMs", "memoryBytes"],
  observes: ["boundary", "rejected-legit"],
  scenes: ["fixed", "bucket", "window"],
  runLabel: "Choose the limiter",
  honest: [
    "A limit of 10 requests a second per client. The backend can tolerate 12 in any one second. A legitimate client sometimes sends 10 requests at once, then is quiet for 4 seconds.",
    "A fixed window resets a counter every second, so a client can send 10 at the end of one window and 10 at the start of the next: 20 in a moment. A sliding log keeps every timestamp, so it is exact but takes 8 bytes per allowed request. A sliding window counter blends the previous and current counts, within about 10% of exact in 16 bytes. A token bucket of capacity B refills 10 a second: worst case B + 10 in one second, and a burst larger than B is rejected. A leaky bucket queues up to B requests and drains them at 10 a second, so it smooths bursts and delays them.",
    "Memory is per client.",
  ],
  init: () => ({ algo: "fixed", burst: 5 }),
  controls: () => [
    { kind: "choice", id: "algo", label: "Algorithm", options: [{ id: "fixed", label: "Fixed window counter" }, { id: "slog", label: "Sliding window log" }, { id: "scounter", label: "Sliding window counter" }, { id: "bucket", label: "Token bucket" }, { id: "leaky", label: "Leaky bucket" }] },
    { kind: "slider", id: "burst", label: "Bucket size (token and leaky)", min: 1, max: 50, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const a = str(v, "algo");
    const B = Math.round(num(v, "burst"));
    let worst = 10;
    let rej = 0;
    let delay = 0;
    let mem = 16;
    if (a === "fixed") worst = 20;
    else if (a === "slog") mem = 80;
    else if (a === "scounter") worst = 11;
    else if (a === "bucket") {
      worst = B + 10;
      rej = Math.max(0, 10 - B) / 10;
    } else {
      worst = 10;
      rej = Math.max(0, 10 - 1 - B) / 10;
      delay = Math.min(9, B) * 100;
    }
    return {
      metrics: { worstPerSec: worst, legitRejectedPct: rej, legitDelayMs: delay, memoryBytes: mem },
      readouts: [
        { label: "Most requests a client can land in one second", value: worst, fmt: "int", tone: worst > 12 ? "alert" : "ok" },
        { label: "Legitimate burst of 10 rejected", value: rej, fmt: "pct", tone: rej > 0 ? "alert" : "ok" },
        { label: "Delay added to that burst", value: delay, fmt: "ms", tone: delay > 100 ? "warn" : "ok" },
        { label: "Memory per client", value: mem, fmt: "bytes", tone: mem > 40 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Worst second", value: worst, tone: worst > 12 ? "alert" : "ok" }, { label: "Backend can take", value: 12, tone: "muted" }] },
      notes: [a === "fixed" ? "The window edge lets a client double the limit for a moment." : a === "slog" ? "Exact, and it remembers every request." : a === "scounter" ? "Nearly exact, with a fixed amount of memory." : a === "bucket" ? "A bigger bucket tolerates bursts and lets more through at once." : "Smooth output, at the price of making bursts wait."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.worstPerSec! > 15) ev.push("boundary");
    if (out.metrics.legitRejectedPct! > 0) ev.push("rejected-legit");
    return ev;
  },
  scene: (n): SceneOut => (n === "fixed" ? { set: { algo: "fixed" }, focus: ["algo"] } : n === "bucket" ? { set: { algo: "bucket", burst: 10 }, focus: ["algo", "burst"] } : n === "window" ? { set: { algo: "scounter" }, focus: ["algo"] } : undefined),
};

// ------------------------------------------------------------------ real-time transports

export const transportLab: LabModel = {
  id: "transport-lab",
  metrics: ["reqPerSec", "avgDelayMs", "connections", "memGB", "wastedPct"],
  observes: ["poll-flood", "mem-heavy"],
  scenes: ["polling", "longpoll", "sockets"],
  runLabel: "Choose the transport",
  honest: [
    "Clients each receive about 2 events a minute. Polling asks every few seconds: requests a second are clients ÷ interval, the average delay is half the interval, and polls that find nothing are wasted. Long-polling holds a request open until there is an event (or 30 seconds pass), then asks again. Server-sent events keep one connection open for one-way pushes; WebSockets keep a two-way connection.",
    "Held connections cost memory: the lab uses 20 KB for a long-poll, 25 KB for server-sent events and 40 KB for a WebSocket. Reconnection takes SSE about one request per client per 5 minutes and WebSockets one per 10.",
    "Round figures for comparison; real per-connection memory depends on the server and TLS.",
  ],
  init: (c) => ({ transport: "sse", pollS: 5, clients: (c as { clients?: number }).clients ?? 200000 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "transport", label: "Transport", options: [{ id: "polling", label: "Polling" }, { id: "longpoll", label: "Long-polling" }, { id: "sse", label: "Server-sent events" }, { id: "ws", label: "WebSockets" }] }, { kind: "slider", id: "pollS", label: "Poll every (polling)", min: 1, max: 60, log: true, fmt: "num", hint: "seconds" }];
    if (!(c as { lockClients?: boolean }).lockClients) out.push({ kind: "slider", id: "clients", label: "Connected clients", min: 1000, max: 1000000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const t = str(v, "transport");
    const n = Math.round(num(v, "clients"));
    const e = 2 / 60;
    const poll = num(v, "pollS");
    let req = 0;
    let delay = 50;
    let conns = 0;
    let kb = 0;
    let waste = 0;
    if (t === "polling") {
      req = n / poll;
      delay = (poll / 2) * 1000 + 50;
      waste = 1 - Math.min(1, e * poll);
    } else if (t === "longpoll") {
      req = n * Math.max(e, 1 / 30);
      conns = n;
      kb = 20;
    } else if (t === "sse") {
      req = n / 300;
      conns = n;
      kb = 25;
    } else {
      req = n / 600;
      delay = 40;
      conns = n;
      kb = 40;
    }
    const mem = (conns * kb * 1000) / 1e9;
    return {
      metrics: { reqPerSec: req, avgDelayMs: delay, connections: conns, memGB: mem, wastedPct: waste },
      readouts: [
        { label: "Requests a second", value: req, fmt: "int", tone: tone(req, 20000, 50000) },
        { label: "Average delay before an event arrives", value: delay, fmt: "ms", tone: tone(delay, 1000, 3000) },
        { label: "Open connections", value: conns, fmt: "int" },
        { label: "Memory held by connections", value: mem, fmt: "num", sub: "GB", tone: tone(mem, 6, 12) },
        { label: "Polls that found nothing", value: waste, fmt: "pct", tone: waste > 0.5 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Requests a second", value: req, tone: tone(req, 20000, 50000) }, { label: "Delay, ms", value: delay, tone: tone(delay, 1000, 3000) }] },
      notes: [t === "polling" ? "Short intervals feel live and cost a flood of empty requests; long ones are cheap and late." : t === "longpoll" ? "A request is always waiting, so events arrive at once, and every client holds a connection." : t === "sse" ? "One open connection per client, pushing one way, over plain HTTP." : "A two-way connection, the heaviest to hold and the only one for real conversation."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.reqPerSec! > 50000) ev.push("poll-flood");
    if (out.metrics.memGB! > 6) ev.push("mem-heavy");
    return ev;
  },
  scene: (n): SceneOut => (n === "polling" ? { set: { transport: "polling", pollS: 1 }, focus: ["transport", "pollS"] } : n === "longpoll" ? { set: { transport: "longpoll" }, focus: ["transport"] } : n === "sockets" ? { set: { transport: "ws" }, focus: ["transport"] } : undefined),
};

// ------------------------------------------------------------------ webhooks

export const webhookLab: LabModel = {
  id: "webhook-lab",
  metrics: ["lostFrac", "horizonH", "spoofAccepted", "replayAccepted"],
  observes: ["lost-seen", "spoofed"],
  scenes: ["retries", "signature", "replay"],
  runLabel: "Set the delivery rules",
  honest: [
    "A receiver is down for 1% of the time, in outages that last 30 minutes on average (exponentially distributed). Deliveries retry with a delay that doubles from the base each time. An event is lost if the outage outlasts the whole retry horizon: 1% × e^(−horizon ÷ 30 min).",
    "Without a signature anyone can post a fake event. A signature stops spoofing, but a captured genuine request can be replayed forever unless the signed timestamp is checked within a tolerance.",
    "The horizon is the base × (2^attempts − 1).",
  ],
  init: () => ({ attempts: 3, baseS: 5, signature: false, tolerance: 0 }),
  controls: () => [
    { kind: "slider", id: "attempts", label: "Delivery attempts", min: 1, max: 14, step: 1, fmt: "int" },
    { kind: "slider", id: "baseS", label: "First retry after", min: 1, max: 600, log: true, fmt: "num", hint: "seconds" },
    { kind: "toggle", id: "signature", label: "Sign each request (HMAC)" },
    { kind: "slider", id: "tolerance", label: "Reject timestamps older than (0 for no check)", min: 0, max: 60, step: 1, fmt: "int", hint: "minutes" },
  ],
  evaluate: (v) => {
    const n = Math.round(num(v, "attempts"));
    const b = num(v, "baseS");
    const H = b * (Math.pow(2, n) - 1);
    const lost = 0.01 * Math.exp(-H / 1800);
    const sig = bool(v, "signature");
    const spoof = sig ? 0 : 1;
    const replay = sig && num(v, "tolerance") > 0 ? 0 : 1;
    return {
      metrics: { lostFrac: lost, horizonH: H / 3600, spoofAccepted: spoof, replayAccepted: replay },
      readouts: [
        { label: "Events lost to outages", value: lost, fmt: "pct", tone: lost > 1e-6 ? "alert" : "ok" },
        { label: "Retries continue for", value: H / 3600, fmt: "num", sub: "hours", tone: H / 3600 > 24 ? "warn" : "ok" },
        { label: "A forged event is accepted", value: spoof ? "yes" : "no", tone: spoof ? "alert" : "ok" },
        { label: "A replayed event is accepted", value: replay ? "yes" : "no", tone: replay ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Retry horizon, hours", value: H / 3600, tone: "info" }] },
      notes: [H / 3600 < 1 ? "Retrying for minutes loses every event that arrives during a long outage." : !sig ? "Anyone who knows the URL can post events." : num(v, "tolerance") === 0 ? "A captured request can be replayed indefinitely." : "Signed, fresh, and retried for long enough."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostFrac! > 1e-4) ev.push("lost-seen");
    if (out.metrics.spoofAccepted! > 0) ev.push("spoofed");
    return ev;
  },
  scene: (n): SceneOut => (n === "retries" ? { set: { attempts: 6, baseS: 30 }, focus: ["attempts", "baseS"] } : n === "signature" ? { set: { signature: true }, focus: ["signature"] } : n === "replay" ? { set: { signature: true, tolerance: 5 }, focus: ["tolerance"] } : undefined),
};

export const A10_MODELS: LabModel[] = [apiStyleLab, paginationLab, idemKeyLab, apiVersionLab, rateLimiterLab, transportLab, webhookLab];
