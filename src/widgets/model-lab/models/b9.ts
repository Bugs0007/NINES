/**
 * Chapter B9 "LLM infrastructure" models: gateways, routing, semantic caching, rate limits and retries, streaming,
 * tracing, guardrails, PII handling, and cost controls. Closed forms and small deterministic sims with labelled
 * round constants (see each model's `honest` text).
 */
import { lognormal, normCdf, normInv } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ the gateway

export function gatewayRun(gw: boolean, failover: boolean, limits: boolean, logging: string, teams: number) {
  const keys = gw ? 1 : teams;
  const avail = gw && failover ? 1 - 0.005 * 0.005 : 0.995;
  const blast = gw && limits ? 1 / teams : 1;
  const attributed = gw && logging !== "none" ? 1 : 0;
  const added = gw ? 4 + (logging === "sync" ? 12 : logging === "async" ? 1 : 0) + (limits ? 1 : 0) + (failover ? 1 : 0) : 0;
  return { keys, avail, blast, attributed, added };
}

export const gatewayLab: LabModel = {
  id: "gateway-lab",
  metrics: ["keysExposed", "availability", "blastRadius", "attributedSpend", "addedMs"],
  observes: ["outage-hits", "contained"],
  scenes: ["central", "failover", "limits"],
  runLabel: "Set up the gateway",
  honest: [
    "A company with 12 teams calling one model provider. Without a gateway each team holds the provider key, nobody can say who spent what, one team's runaway job uses the shared rate limit and starves the rest, and the provider's 99.5% availability is the ceiling.",
    "A gateway is a proxy every team calls instead. It holds the one key, applies per-team limits (a runaway then affects 1 team in 12), logs usage for attribution, and can fail over to a second provider: two independent 99.5% providers give 99.9975%, assuming their failures are independent, which they only partly are.",
    "The gateway adds about 4 ms of its own hop. Logging in the request path adds 12 ms, written asynchronously 1 ms. Limits and failover add 1 ms each. Round figures.",
  ],
  init: (c) => ({ gw: false, failover: false, limits: false, logging: "none", teams: (c as { teams?: number }).teams ?? 12 }),
  controls: () => [
    { kind: "toggle", id: "gw", label: "Route every team through one gateway", detail: "one key, one place for policy" },
    { kind: "toggle", id: "failover", label: "Fail over to a second provider" },
    { kind: "toggle", id: "limits", label: "Per-team rate limits and budgets" },
    { kind: "choice", id: "logging", label: "Usage logging", options: [{ id: "none", label: "None" }, { id: "sync", label: "Synchronous, in the request path" }, { id: "async", label: "Asynchronous, off the request path" }] },
  ],
  evaluate: (v) => {
    const r = gatewayRun(bool(v, "gw"), bool(v, "failover"), bool(v, "limits"), str(v, "logging"), Math.round(num(v, "teams")));
    return {
      metrics: { keysExposed: r.keys, availability: r.avail, blastRadius: r.blast, attributedSpend: r.attributed, addedMs: r.added },
      readouts: [
        { label: "Places holding a provider key", value: r.keys, fmt: "int", tone: r.keys > 1 ? "alert" : "ok" },
        { label: "Availability seen by teams", value: r.avail, fmt: "pct", tone: r.avail < 0.999 ? "warn" : "ok" },
        { label: "Share of teams hit by one runaway team", value: r.blast, fmt: "pct", tone: r.blast > 0.5 ? "alert" : r.blast > 0.1 ? "warn" : "ok" },
        { label: "Spend attributed to a team", value: r.attributed, fmt: "pct", tone: r.attributed < 1 ? "alert" : "ok" },
        { label: "Added latency", value: r.added, fmt: "ms", tone: tone(r.added, 10, 20) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Availability", value: r.avail, tone: r.avail < 0.999 ? "warn" : "ok" }, { label: "Blast radius of a runaway", value: r.blast, tone: r.blast > 0.1 ? "alert" : "ok" }, { label: "Spend attributed", value: r.attributed, tone: r.attributed < 1 ? "alert" : "ok" }] },
      notes: [!bool(v, "gw") ? "Every team has its own key, its own failures and no shared view of spend." : "One place to apply policy, and one more thing that must stay up."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (bool(v, "gw") && bool(v, "failover")) ev.push("outage-hits");
    if (bool(v, "gw") && bool(v, "limits")) ev.push("contained");
    return ev;
  },
  scene: (n): SceneOut => (n === "central" ? { set: { gw: true }, focus: ["gw"] } : n === "failover" ? { set: { gw: true, failover: true }, focus: ["failover"] } : n === "limits" ? { set: { gw: true, limits: true }, focus: ["limits"] } : undefined),
};

// ------------------------------------------------------------------ routing

const MIX = [0.6, 0.3, 0.1];
const Q_SMALL = [0.97, 0.78, 0.4];
const Q_LARGE = [0.985, 0.95, 0.88];
/** Illustrative per-request prices at 1,500 tokens in and 300 out: a small tier at $0.30 / $1.50 and a large tier at $3 / $15 per million. */
const C_SMALL = 0.0009;
const C_LARGE = 0.009;
const C_ROUTER = 0.00006;

export function routeRun(strategy: string, accuracy: number, threshold: number) {
  let quality = 0;
  let cost = 0;
  let lat = 0;
  for (let c = 0; c < 3; c++) {
    const w = MIX[c]!;
    const qs = Q_SMALL[c]!;
    const ql = Q_LARGE[c]!;
    if (strategy === "large") {
      quality += w * ql;
      cost += w * C_LARGE;
      lat += w * 2.4;
    } else if (strategy === "small") {
      quality += w * qs;
      cost += w * C_SMALL;
      lat += w * 0.6;
    } else if (strategy === "classify") {
      const toSmallP = c === 0 ? accuracy : (1 - accuracy) / 2;
      quality += w * (toSmallP * qs + (1 - toSmallP) * ql);
      cost += w * (C_ROUTER + toSmallP * C_SMALL + (1 - toSmallP) * C_LARGE);
      lat += w * (0.15 + toSmallP * 0.6 + (1 - toSmallP) * 2.4);
    } else {
      const caught = threshold;
      const falseEsc = 0.6 * threshold ** 3;
      const esc = qs * falseEsc + (1 - qs) * caught;
      quality += w * (qs * (1 - falseEsc) + esc * ql);
      cost += w * (C_SMALL + esc * C_LARGE);
      lat += w * (0.6 + esc * 2.4);
    }
  }
  return { quality, cost: cost * 1000, lat };
}

export const routerLab: LabModel = {
  id: "router-lab",
  metrics: ["quality", "costPer1k", "meanLatency"],
  observes: ["all-large", "misroute"],
  scenes: ["classify", "cascade", "small"],
  runLabel: "Choose the routing",
  honest: [
    "Traffic is 60% easy requests, 30% medium and 10% hard. A small model answers them right 97%, 78% and 40% of the time; a large one 98.5%, 95% and 88%. Illustrative prices at 1,500 tokens in and 300 out: the small tier costs $0.0009 a request, the large $0.009, and answers take about 0.6 s against 2.4 s.",
    "A classifier sends easy requests to the small model and the rest to the large one. It costs a small call ($0.00006, 0.15 s) and is right with the accuracy you set; a mistake sends easy requests up (a waste) or hard ones down (a wrong answer). A cascade always tries the small model first and escalates when its confidence is below the threshold: a higher threshold catches more wrong answers and escalates more right ones too.",
    "Round figures for the shape of the trade-off, not measurements of any model.",
  ],
  init: () => ({ strategy: "large", accuracy: 0.9, threshold: 0.8 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "strategy", label: "Routing", options: [{ id: "large", label: "Everything to the large model" }, { id: "small", label: "Everything to the small model" }, { id: "classify", label: "A classifier picks the model" }, { id: "cascade", label: "Small first, escalate when unsure" }] }];
    if (!(c as { lockKnobs?: boolean }).lockKnobs) out.push({ kind: "slider", id: "accuracy", label: "Classifier accuracy", min: 0.6, max: 1, step: 0.01, fmt: "pct" }, { kind: "slider", id: "threshold", label: "Escalation threshold", min: 0.3, max: 0.95, step: 0.05, fmt: "pct", hint: "share of wrong small answers caught" });
    return out;
  },
  evaluate: (v) => {
    const r = routeRun(str(v, "strategy"), num(v, "accuracy"), num(v, "threshold"));
    return {
      metrics: { quality: r.quality, costPer1k: r.cost, meanLatency: r.lat },
      readouts: [
        { label: "Answers right", value: r.quality, fmt: "pct", tone: toneLow(r.quality, 0.95, 0.9) },
        { label: "Cost per 1,000 requests", value: r.cost, fmt: "usd", tone: tone(r.cost, 4, 8) },
        { label: "Mean latency", value: r.lat, fmt: "s", tone: tone(r.lat, 1.5, 2.2) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Answers right", value: r.quality, tone: toneLow(r.quality, 0.95, 0.9) }] },
      notes: [str(v, "strategy") === "large" ? "The best quality at the highest price: every easy request pays for a hard one." : str(v, "strategy") === "small" ? "Cheap and fast, and wrong on the hard tail." : "Spending the large model where it matters."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "strategy") === "large" && out.metrics.costPer1k! > 8) ev.push("all-large");
    if (str(v, "strategy") === "classify" && num(v, "accuracy") < 0.8) ev.push("misroute");
    return ev;
  },
  scene: (n): SceneOut => (n === "classify" ? { set: { strategy: "classify" }, focus: ["strategy", "accuracy"] } : n === "cascade" ? { set: { strategy: "cascade" }, focus: ["strategy", "threshold"] } : n === "small" ? { set: { strategy: "small" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ semantic cache

const P_SAME = 0.35;

export function semRun(t: number, verify: boolean) {
  const goodRaw = P_SAME * (1 - normCdf((t - 0.92) / 0.04));
  const wrongRaw = (1 - P_SAME) * (1 - normCdf((t - 0.8) / 0.06));
  const good = goodRaw * (verify ? 0.97 : 1);
  const wrong = wrongRaw * (verify ? 0.1 : 1);
  const saved = good * 9 - (verify ? (goodRaw + wrongRaw) * 0.3 : 0);
  return { good, wrong, saved, lat: verify ? 120 : 15 };
}

export const semcacheLab: LabModel = {
  id: "semcache-lab",
  metrics: ["hitRate", "wrongRate", "savedPer1k"],
  observes: ["wrong-answers", "no-hits"],
  scenes: ["loose", "tight", "verify"],
  runLabel: "Set the cache",
  honest: [
    "A cache keyed on meaning: a request is embedded and, if the nearest cached request has cosine similarity at or above the threshold, its stored answer is served. 35% of requests have an equivalent request in the cache, with similarity around 0.92 (spread 0.04). For the other 65% the nearest entry is a different question, around 0.80 (spread 0.06): a near miss.",
    "A hit on an equivalent request saves a $0.009 model call. A hit on a near miss serves a wrong answer. A cheap verification step (a small model checks that the cached answer fits the new question) removes 90% of wrong hits and 3% of good ones, at $0.0003 per candidate and about 120 ms.",
    "Round figures for the shape of the trade-off: real similarity distributions depend on the embedding model and the traffic.",
  ],
  init: () => ({ threshold: 0.8, verify: false }),
  controls: () => [
    { kind: "slider", id: "threshold", label: "Similarity threshold", min: 0.6, max: 0.99, step: 0.01, fmt: "num" },
    { kind: "toggle", id: "verify", label: "Verify the cached answer fits before serving" },
  ],
  evaluate: (v) => {
    const r = semRun(num(v, "threshold"), bool(v, "verify"));
    return {
      metrics: { hitRate: r.good, wrongRate: r.wrong, savedPer1k: r.saved },
      readouts: [
        { label: "Requests answered from cache correctly", value: r.good, fmt: "pct", tone: toneLow(r.good, 0.2, 0.1) },
        { label: "Requests served a wrong cached answer", value: r.wrong, fmt: "pct", tone: tone(r.wrong, 0.005, 0.02) },
        { label: "Saved per 1,000 requests", value: r.saved, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.4, bars: [{ label: "Correct hits", value: r.good, tone: "ok" }, { label: "Wrong hits", value: r.wrong, tone: r.wrong > 0.005 ? "alert" : "ok" }] },
      notes: [r.wrong > 0.02 ? "The cache is answering questions nobody asked." : r.good < 0.1 ? "So tight that it rarely hits." : "Close paraphrases hit and different questions miss."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.wrongRate! > 0.04) ev.push("wrong-answers");
    if (out.metrics.hitRate! < 0.05) ev.push("no-hits");
    return ev;
  },
  scene: (n): SceneOut => (n === "loose" ? { set: { threshold: 0.7, verify: false }, focus: ["threshold"] } : n === "tight" ? { set: { threshold: 0.96, verify: false }, focus: ["threshold"] } : n === "verify" ? { set: { threshold: 0.88, verify: true }, focus: ["verify"] } : undefined),
};

// ------------------------------------------------------------------ rate limits and retries

export function stormRun(policy: string, maxRetries: number, limit: number, base = 85) {
  const T = 150;
  const spike = (t: number) => (t === 10 ? 500 : base);
  const A = 10;
  const sched: Float64Array[] = Array.from({ length: T + 1 }, () => new Float64Array(A));
  const push = (t: number, att: number, n: number) => {
    if (n <= 1e-9 || t >= T) return;
    sched[t]![att]! += n;
  };
  let unique = 0;
  let served = 0;
  let rejectedAttempts = 0;
  let attempts = 0;
  let lastReject = 0;
  for (let t = 0; t < T; t++) {
    const fresh = t < 60 ? spike(t) : 0;
    unique += fresh;
    const items = sched[t]!.slice();
    items[0]! += fresh;
    const offered = items.reduce((x, y) => x + y, 0);
    attempts += offered;
    const accepted = Math.min(offered, limit);
    const rej = offered - accepted;
    served += accepted;
    rejectedAttempts += rej;
    if (rej > 0.5) lastReject = t;
    const frac = offered > 0 ? rej / offered : 0;
    for (let att = 0; att < A; att++) {
      const r = items[att]! * frac;
      if (r <= 0 || policy === "none" || att >= maxRetries) continue;
      const na = att + 1;
      if (policy === "immediate") push(t + 1, na, r);
      else if (policy === "backoff") push(t + Math.min(30, 2 ** na), na, r);
      else if (policy === "jitter") {
        const w = Math.min(30, 2 ** na);
        for (let d = 1; d <= w; d++) push(t + d, na, r / w);
      } else {
        const w = Math.max(1, Math.ceil(rej / limit) + 2);
        for (let d = 1; d <= w; d++) push(t + d, na, r / w);
      }
    }
  }
  return { success: served / unique, amplification: attempts / unique, wasted: rejectedAttempts, recovery: Math.max(0, lastReject - 11), unique };
}

export const llmretryLab: LabModel = {
  id: "llmretry-lab",
  metrics: ["successRate", "amplification", "recoverySec"],
  observes: ["storm", "calm"],
  scenes: ["immediate", "jitter", "retryafter"],
  runLabel: "Set the retry policy",
  honest: [
    "A provider allows 100 requests a second and returns 429 beyond that. The service sends 85 new requests a second, with a one-second burst of 500 at second 10. A rejected request retries according to the policy, up to the maximum, and is dropped after that. The sim is per second and treats requests as fluid counts.",
    "Immediate retries add the rejected load back to the next second, so the overload feeds itself. Exponential backoff without jitter sends every rejected request back at the same moment, producing waves. Full jitter spreads each wave over its backoff window. Honouring Retry-After spreads retries over the time the backlog needs to drain at the limit.",
    "Success counts requests served within the 150 seconds (new requests stop after one minute). Amplification is total attempts divided by unique requests.",
  ],
  init: () => ({ policy: "immediate", retries: 5 }),
  controls: () => [
    { kind: "choice", id: "policy", label: "On a 429", options: [{ id: "none", label: "Fail the request" }, { id: "immediate", label: "Retry at once" }, { id: "backoff", label: "Exponential backoff, no jitter" }, { id: "jitter", label: "Exponential backoff with full jitter" }, { id: "retryafter", label: "Honour the Retry-After the provider sends" }] },
    { kind: "slider", id: "retries", label: "Maximum retries", min: 0, max: 8, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const r = stormRun(str(v, "policy"), Math.round(num(v, "retries")), 100);
    return {
      metrics: { successRate: r.success, amplification: r.amplification, recoverySec: r.recovery },
      readouts: [
        { label: "Requests eventually served", value: r.success, fmt: "pct", tone: toneLow(r.success, 0.99, 0.9) },
        { label: "Attempts per request", value: r.amplification, fmt: "x", tone: tone(r.amplification, 1.5, 3) },
        { label: "Seconds of rejections after the burst", value: r.recovery, fmt: "int", tone: tone(r.recovery, 5, 20) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Served", value: r.success, tone: toneLow(r.success, 0.99, 0.9) }] },
      notes: [str(v, "policy") === "immediate" ? "Every rejected request comes straight back, and the overload never clears." : str(v, "policy") === "none" ? "Honest, and the spike is simply lost." : "Retries spread out give the provider room to recover."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.amplification! > 1.7) ev.push("storm");
    if ((str(v, "policy") === "jitter" || str(v, "policy") === "retryafter") && out.metrics.successRate! >= 0.995 && out.metrics.amplification! < 1.45) ev.push("calm");
    return ev;
  },
  scene: (n): SceneOut => (n === "immediate" ? { set: { policy: "immediate" }, focus: ["policy"] } : n === "jitter" ? { set: { policy: "jitter" }, focus: ["policy"] } : n === "retryafter" ? { set: { policy: "retryafter" }, focus: ["policy"] } : undefined),
};

// ------------------------------------------------------------------ streaming

export function streamRun(stream: boolean, tokens: number, transport: string, buffering: boolean, cancel: boolean) {
  const ttft = 0.8;
  const rate = 60;
  const total = ttft + tokens / rate;
  let first = stream ? ttft : total;
  if (stream && buffering) first = Math.min(total, ttft + 1024 / rate);
  if (stream && transport === "poll") first += 0.5;
  const requests = stream ? 1 : 1;
  const pollReq = stream && transport === "poll" ? Math.ceil(total / 1) + 1 : requests;
  const abandoned = 0.3;
  const wasted = abandoned * (cancel && stream ? 0.02 : 0.5);
  return { first, total, requests: pollReq, wasted, concurrent: 200 * total };
}

export const streamLab: LabModel = {
  id: "stream-lab",
  metrics: ["firstVisibleSec", "completeSec", "requestsPerAnswer", "wastedTokens"],
  observes: ["long-wait", "buffered"],
  scenes: ["stream", "buffer", "cancel"],
  runLabel: "Set up the stream",
  honest: [
    "A model that takes 0.8 s to the first token and then produces 60 tokens a second. Without streaming the user sees nothing until the whole answer is done; with streaming, text appears as it is generated.",
    "Server-sent events carry the stream over one HTTP response. Polling asks once a second and adds half a second to the first text and one request per second. WebSockets also work and cost an upgrade you rarely need for one-way text. A buffering proxy holds the response until it has 4 KB (about 1,000 tokens) before forwarding it, so a short answer arrives all at once and the benefit is gone.",
    "30% of users leave before an answer finishes. If the server notices the disconnect and cancels generation, only about 2% of the answer is wasted; if it does not, about half is generated for nobody. At 200 questions a second, the connections held open are that rate times the answer's duration (Little's law).",
  ],
  init: () => ({ stream: false, tokens: 800, transport: "sse", buffering: false, cancel: false }),
  controls: () => [
    { kind: "toggle", id: "stream", label: "Stream tokens as they are generated" },
    { kind: "slider", id: "tokens", label: "Answer length", min: 100, max: 2000, step: 50, fmt: "int", hint: "tokens" },
    { kind: "choice", id: "transport", label: "Transport", options: [{ id: "sse", label: "Server-sent events" }, { id: "poll", label: "Poll once a second" }] },
    { kind: "toggle", id: "buffering", label: "A proxy buffers responses (4 KB)" },
    { kind: "toggle", id: "cancel", label: "Cancel generation when the user leaves" },
  ],
  evaluate: (v) => {
    const r = streamRun(bool(v, "stream"), num(v, "tokens"), str(v, "transport"), bool(v, "buffering"), bool(v, "cancel"));
    return {
      metrics: { firstVisibleSec: r.first, completeSec: r.total, requestsPerAnswer: r.requests, wastedTokens: r.wasted },
      readouts: [
        { label: "Time until the user sees text", value: r.first, fmt: "s", tone: tone(r.first, 1.5, 4) },
        { label: "Time until the answer is complete", value: r.total, fmt: "s" },
        { label: "Requests per answer", value: r.requests, fmt: "int", tone: tone(r.requests, 1, 5) },
        { label: "Share of generated tokens nobody reads", value: r.wasted, fmt: "pct", tone: tone(r.wasted, 0.05, 0.1) },
        { label: "Connections open at 200 questions a second", value: r.concurrent, fmt: "int" },
      ],
      view: { kind: "waterfall", rows: [{ label: "Model starts", start: 0, ms: 800, tone: "info" }, { label: "Text visible", start: r.first * 1000 - 40, ms: 80, tone: r.first > 2 ? "alert" : "ok" }, { label: "Answer complete", start: r.total * 1000 - 40, ms: 80, tone: "muted" }] },
      notes: [!bool(v, "stream") ? "Waiting for the whole answer feels slow even when it is quick." : bool(v, "buffering") ? "A buffering proxy is holding the stream back." : "Text starts almost at once."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!bool(v, "stream") && out.metrics.firstVisibleSec! > 8) ev.push("long-wait");
    if (bool(v, "stream") && bool(v, "buffering")) ev.push("buffered");
    return ev;
  },
  scene: (n): SceneOut => (n === "stream" ? { set: { stream: true, tokens: 800 }, focus: ["stream"] } : n === "buffer" ? { set: { stream: true, buffering: true }, focus: ["buffering"] } : n === "cancel" ? { set: { stream: true, cancel: true }, focus: ["cancel"] } : undefined),
};

// ------------------------------------------------------------------ tracing

export function traceRun(prompts: boolean, tools: boolean, links: boolean, versions: boolean, tail: boolean, sampling: number, redact: boolean) {
  const diag = (prompts ? 0.35 : 0) + (tools ? 0.3 : 0) + (links ? 0.25 : 0) + (versions ? 0.1 : 0);
  const coverage = tail ? 1 : sampling;
  const failureDiag = diag * coverage;
  const bytes = 2 + (prompts ? 12 : 0) + (tools ? 8 : 0) + (links ? 1 : 0) + (versions ? 0.5 : 0);
  const kept = tail ? 0.02 + 0.98 * sampling : sampling;
  const gb = 5 * bytes * kept;
  return { diag, coverage, failureDiag, gb, redact };
}

export const traceLab: LabModel = {
  id: "trace-lab",
  metrics: ["diagnosable", "storageGBDay", "failureCoverage", "redacted"],
  observes: ["blind", "bloat"],
  scenes: ["capture", "tail", "redact"],
  runLabel: "Set up tracing",
  honest: [
    "An assistant serving five million traces a day. To diagnose a failure you need what the model saw (prompts and retrieved context, 35 points of the story), what the tools were called with and returned (30), the parent-child links that show the order of steps (25) and the model version and parameters (10). A failure is diagnosable only if every piece it needs was captured and the trace was kept.",
    "Capturing a trace costs 2 KB of structure, 12 KB with prompts, 8 KB with tool arguments and results, 1 KB for links and 0.5 KB for versions. Head sampling keeps a fixed share of traces at random, so it keeps the same share of the failures. Tail sampling keeps every trace that failed or scored badly (2% of traffic) plus the share you set of the rest.",
    "Prompts contain what users typed, so a trace store is as sensitive as the data in it: redact before storing. Round figures.",
  ],
  init: () => ({ prompts: false, tools: false, links: false, versions: false, tail: false, sampling: 1, redact: false }),
  controls: () => [
    { kind: "toggle", id: "prompts", label: "Capture prompts and retrieved context" },
    { kind: "toggle", id: "tools", label: "Capture tool arguments and results" },
    { kind: "toggle", id: "links", label: "Link each step to its parent" },
    { kind: "toggle", id: "versions", label: "Record model version and parameters" },
    { kind: "toggle", id: "tail", label: "Always keep failed and low-scoring traces" },
    { kind: "slider", id: "sampling", label: "Share of other traces kept", min: 0.01, max: 1, step: 0.01, fmt: "pct" },
    { kind: "toggle", id: "redact", label: "Redact personal data before storing" },
  ],
  evaluate: (v) => {
    const r = traceRun(bool(v, "prompts"), bool(v, "tools"), bool(v, "links"), bool(v, "versions"), bool(v, "tail"), num(v, "sampling"), bool(v, "redact"));
    return {
      metrics: { diagnosable: r.failureDiag, storageGBDay: r.gb, failureCoverage: r.coverage, redacted: r.redact ? 1 : 0 },
      readouts: [
        { label: "Failures you can diagnose from a trace", value: r.failureDiag, fmt: "pct", tone: toneLow(r.failureDiag, 0.9, 0.6) },
        { label: "Failures with a stored trace", value: r.coverage, fmt: "pct", tone: toneLow(r.coverage, 0.95, 0.5) },
        { label: "Storage a day", value: r.gb, fmt: "gb", tone: tone(r.gb, 15, 40) },
        { label: "Personal data redacted", value: r.redact ? "yes" : "no", tone: r.redact ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Captured detail", value: r.diag, tone: toneLow(r.diag, 0.95, 0.6) }, { label: "Failures kept", value: r.coverage, tone: toneLow(r.coverage, 0.95, 0.5) }] },
      notes: [r.diag < 0.5 ? "Spans without the prompts or tool results say that something failed, not why." : r.gb > 40 ? "Storing everything for every request is expensive." : "Enough detail, kept where it counts."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (bool(v, "links") && !bool(v, "prompts") && !bool(v, "tools")) ev.push("blind");
    if (out.metrics.storageGBDay! > 60) ev.push("bloat");
    return ev;
  },
  scene: (n): SceneOut => (n === "capture" ? { set: { prompts: true, tools: true, links: true, versions: true }, focus: ["prompts", "tools", "links"] } : n === "tail" ? { set: { tail: true, sampling: 0.05 }, focus: ["tail", "sampling"] } : n === "redact" ? { set: { redact: true }, focus: ["redact"] } : undefined),
};

// ------------------------------------------------------------------ guardrails

const DPRIME = { rules: 1.5, input: 3.2, output: 2.8 };
const LAT = { rules: 1, input: 150, output: 200, schema: 5 };
const BASE_BAD = 0.02;

function layer(dp: number, fpr: number) {
  return { tpr: 1 - normCdf(normInv(1 - fpr) - dp), fpr };
}

export function guardRun(rules: boolean, input: boolean, output: boolean, schema: boolean, fpr: number) {
  const layers: { tpr: number; fpr: number }[] = [];
  if (rules) layers.push(layer(DPRIME.rules, Math.min(fpr, 0.004)));
  if (input) layers.push(layer(DPRIME.input, fpr));
  if (output) layers.push(layer(DPRIME.output, fpr));
  if (schema) layers.push({ tpr: 0.15, fpr: 0 });
  const miss = layers.reduce((p, l) => p * (1 - l.tpr), 1);
  const falseBlock = 1 - layers.reduce((p, l) => p * (1 - l.fpr), 1);
  const lat = (rules ? LAT.rules : 0) + (input ? LAT.input : 0) + (output ? LAT.output : 0) + (schema ? LAT.schema : 0);
  return { leak: BASE_BAD * miss, miss, falseBlock, lat };
}

export const guardrailLab: LabModel = {
  id: "guardrail-lab",
  metrics: ["leakRate", "falseBlock", "addedMs", "catchRate"],
  observes: ["leaks", "over-refusal"],
  scenes: ["layers", "strict", "loose"],
  runLabel: "Set the guardrails",
  honest: [
    "Two percent of requests are harmful (an attack or an output that must not be sent). Each check is a detector with a sensitivity: the stricter its threshold, the more harmful requests it catches and the more legitimate ones it wrongly blocks. Your setting is the share of legitimate requests a model-based check blocks.",
    "Four layers: pattern rules (weak, nearly free, 1 ms), a small model on the input (strong, 150 ms), a small model on the output (strong, 200 ms), and schema validation (catches only malformed output, 15% of harmful cases, never blocks a legitimate one, 5 ms). Layers are treated as independent, which real attacks do not always honour.",
    "Leak is the share of all traffic that is harmful and gets through. Round figures to show the shape of the trade-off.",
  ],
  init: () => ({ rules: false, input: false, output: false, schema: false, fpr: 0.01 }),
  controls: () => [
    { kind: "toggle", id: "rules", label: "Pattern rules and deny lists" },
    { kind: "toggle", id: "input", label: "Classify the input with a small model" },
    { kind: "toggle", id: "output", label: "Classify the output with a small model" },
    { kind: "toggle", id: "schema", label: "Validate output against a schema" },
    { kind: "slider", id: "fpr", label: "Strictness: legitimate requests blocked", min: 0.001, max: 0.1, step: 0.001, log: true, fmt: "pct" },
  ],
  evaluate: (v) => {
    const r = guardRun(bool(v, "rules"), bool(v, "input"), bool(v, "output"), bool(v, "schema"), num(v, "fpr"));
    return {
      metrics: { leakRate: r.leak, falseBlock: r.falseBlock, addedMs: r.lat, catchRate: 1 - r.miss },
      readouts: [
        { label: "Harmful traffic that gets through", value: r.leak, fmt: "pct", tone: tone(r.leak, 0.002, 0.01) },
        { label: "Harmful requests caught", value: 1 - r.miss, fmt: "pct", tone: toneLow(1 - r.miss, 0.9, 0.7) },
        { label: "Legitimate requests blocked", value: r.falseBlock, fmt: "pct", tone: tone(r.falseBlock, 0.02, 0.05) },
        { label: "Added latency", value: r.lat, fmt: "ms", tone: tone(r.lat, 250, 450) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Harmful caught", value: 1 - r.miss, tone: toneLow(1 - r.miss, 0.9, 0.7) }, { label: "Legitimate blocked", value: r.falseBlock, tone: tone(r.falseBlock, 0.02, 0.05) }] },
      notes: [r.miss > 0.5 ? "Most harmful traffic walks through." : r.falseBlock > 0.05 ? "The guard is turning away customers." : "Layers catch what the others miss."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.leakRate! > 0.003 && (bool(v, "rules") || bool(v, "input") || bool(v, "output") || bool(v, "schema"))) ev.push("leaks");
    if (out.metrics.falseBlock! > 0.05) ev.push("over-refusal");
    return ev;
  },
  scene: (n): SceneOut => (n === "layers" ? { set: { rules: true, input: true, output: true, schema: true, fpr: 0.01 }, focus: ["input", "output"] } : n === "strict" ? { set: { fpr: 0.1 }, focus: ["fpr"] } : n === "loose" ? { set: { fpr: 0.001 }, focus: ["fpr"] } : undefined),
};

// ------------------------------------------------------------------ PII

const PII = {
  none: { st: 0, un: 0, fp: 0 },
  regex: { st: 0.92, un: 0.1, fp: 0.002 },
  ner: { st: 0.97, un: 0.82, fp: 0.01 },
  llm: { st: 0.99, un: 0.93, fp: 0.02 },
} as const;

export function piiRun(detector: keyof typeof PII, prompt: boolean, logs: boolean, reversible: boolean, retention: number) {
  const d = PII[detector];
  const perReq = 1.2;
  const miss = 0.7 * (1 - d.st) + 0.3 * (1 - d.un);
  const promptLeak = perReq * (prompt ? miss : 1) * 1000;
  const logLeak = perReq * (logs || prompt ? miss : 1) * 1000;
  const utility = 1 - d.fp * 3 - (prompt && detector !== "none" && !reversible ? 0.12 : 0);
  const exposure = (logLeak * retention) / 30;
  return { promptLeak, logLeak, utility, exposure };
}

export const piiLab: LabModel = {
  id: "pii-lab",
  metrics: ["promptLeak", "logLeak", "utility", "exposure"],
  observes: ["leaky-logs", "broken-answers"],
  scenes: ["ner", "reversible", "retention"],
  runLabel: "Set the PII handling",
  honest: [
    "Each request carries 1.2 pieces of personal data on average. 70% are structured (emails, phone numbers, ID numbers) and 30% unstructured (names, addresses, free text). Pattern matching finds 92% of structured and 10% of unstructured items; a named-entity model 97% and 82%; adding an LLM check 99% and 93%. Each step also wrongly redacts more harmless text (0.2%, 1%, 2% of requests).",
    "Redacting before the prompt keeps personal data from the provider, and by the same step from the logs. Redacting only in the logs leaves the provider seeing everything. Replacing values with placeholders and restoring them in the answer keeps replies useful: without restoring, 12% of answers contain a placeholder where the user needed the value.",
    "Exposure is leaked items left in logs times the retention, in item-months per thousand requests. Round figures.",
  ],
  init: () => ({ detector: "none", prompt: false, logs: false, reversible: false, retention: 365 }),
  controls: () => [
    { kind: "choice", id: "detector", label: "Detector", options: [{ id: "none", label: "None" }, { id: "regex", label: "Pattern matching" }, { id: "ner", label: "Named-entity model" }, { id: "llm", label: "Named-entity model plus an LLM check" }] },
    { kind: "toggle", id: "prompt", label: "Redact before the prompt leaves your system" },
    { kind: "toggle", id: "logs", label: "Redact in logs and traces" },
    { kind: "toggle", id: "reversible", label: "Restore placeholders in the answer" },
    { kind: "slider", id: "retention", label: "Log retention", min: 7, max: 365, step: 1, log: true, fmt: "int", hint: "days" },
  ],
  evaluate: (v) => {
    const r = piiRun(str(v, "detector") as keyof typeof PII, bool(v, "prompt"), bool(v, "logs"), bool(v, "reversible"), num(v, "retention"));
    return {
      metrics: { promptLeak: r.promptLeak, logLeak: r.logLeak, utility: r.utility, exposure: r.exposure },
      readouts: [
        { label: "Personal data sent to the provider per 1,000 requests", value: r.promptLeak, fmt: "int", tone: tone(r.promptLeak, 100, 400) },
        { label: "Personal data stored in logs per 1,000 requests", value: r.logLeak, fmt: "int", tone: tone(r.logLeak, 100, 400) },
        { label: "Answers still useful", value: r.utility, fmt: "pct", tone: toneLow(r.utility, 0.95, 0.9) },
        { label: "Exposure in logs", value: r.exposure, fmt: "int", sub: "item-months per 1,000 requests", tone: tone(r.exposure, 500, 2000) },
      ],
      view: { kind: "bars", fmt: "int", max: 1300, bars: [{ label: "Sent to provider", value: r.promptLeak, tone: tone(r.promptLeak, 100, 400) }, { label: "Stored in logs", value: r.logLeak, tone: tone(r.logLeak, 100, 400) }] },
      notes: [str(v, "detector") === "none" ? "Everything the user typed goes to the provider and into the logs." : r.utility < 0.95 ? "Redaction is damaging the answers." : "Personal data is stripped where it matters."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.logLeak! > 800 && num(v, "retention") >= 180) ev.push("leaky-logs");
    if (bool(v, "prompt") && str(v, "detector") !== "none" && !bool(v, "reversible")) ev.push("broken-answers");
    return ev;
  },
  scene: (n): SceneOut => (n === "ner" ? { set: { detector: "ner", prompt: true, logs: true }, focus: ["detector"] } : n === "reversible" ? { set: { reversible: true }, focus: ["reversible"] } : n === "retention" ? { set: { retention: 14 }, focus: ["retention"] } : undefined),
};

// ------------------------------------------------------------------ cost controls

const OUT_LN = lognormal(300, 3000);
const REQ_LN = lognormal(8, 400);
const P_IN_M = 3;
const P_OUT_M = 15;

export function budgetRun(cap: number, quota: number, route: number, cache: boolean, users: number) {
  const N = 400;
  let spendDay = 0;
  let blockedLegit = 0;
  let legitVol = 0;
  let trunc = 0;
  let cacheAdj = cache ? 0.82 : 1;
  const natMean = (() => {
    let s = 0;
    for (let i = 0; i < 200; i++) s += OUT_LN.quantile((i + 0.5) / 200);
    return s / 200;
  })();
  const capMean = (() => {
    let s = 0;
    for (let i = 0; i < 200; i++) s += Math.min(cap, OUT_LN.quantile((i + 0.5) / 200));
    return s / 200;
  })();
  trunc = 1 - OUT_LN.cdf(cap);
  const unitFull = (1500 * P_IN_M + natMean * P_OUT_M) / 1e6;
  const unit = (1500 * P_IN_M + capMean * P_OUT_M) / 1e6;
  const blended = unit * (1 - route) + unit * 0.1 * route;
  void unitFull;
  for (let i = 0; i < N; i++) {
    const reqs = REQ_LN.quantile((i + 0.5) / N);
    const served = Math.min(reqs, quota);
    const legit = reqs <= 100;
    if (legit) {
      legitVol += reqs;
      blockedLegit += reqs - served;
    }
    spendDay += served;
  }
  const monthly = (spendDay / N) * users * blended * cacheAdj * 30;
  return { monthly, trunc, blocked: legitVol > 0 ? blockedLegit / legitVol : 0, qualityLoss: route * 0.06 };
}

export const budgetLab: LabModel = {
  id: "budget-lab",
  metrics: ["monthlySpend", "truncatedShare", "blockedLegit", "qualityLoss"],
  observes: ["over-budget", "choked"],
  scenes: ["cap", "quota", "route"],
  runLabel: "Set the controls",
  honest: [
    "A feature with 2,000 users. Requests per user per day are lognormal with a median of 8 and a 99th percentile of 400: a few heavy users and automated clients account for much of the spend. Illustrative prices of $3 per million input tokens and $15 per million output; each request sends 1,500 tokens in and gets a lognormal answer (median 300, 99th percentile 3,000 tokens).",
    "A cap on output tokens limits the long tail of answers and truncates those that run past it. A per-user daily quota limits requests; users above 100 a day are treated as automation, so only quota cuts below 100 touch real users. Routing a share of requests to a small model, a tenth of the price, costs six points of quality on that share. A response cache removes about 18% of calls.",
    "Round figures to show which control moves the bill and what each costs.",
  ],
  init: (c) => ({ cap: 4000, quota: 5000, route: 0, cache: false, users: (c as { users?: number }).users ?? 2000 }),
  controls: () => [
    { kind: "slider", id: "cap", label: "Output token cap", min: 200, max: 4000, step: 100, fmt: "int", hint: "tokens" },
    { kind: "slider", id: "quota", label: "Requests per user per day", min: 10, max: 5000, step: 10, log: true, fmt: "int" },
    { kind: "slider", id: "route", label: "Share routed to the small model", min: 0, max: 0.9, step: 0.05, fmt: "pct" },
    { kind: "toggle", id: "cache", label: "Cache repeated requests" },
  ],
  evaluate: (v) => {
    const r = budgetRun(num(v, "cap"), num(v, "quota"), num(v, "route"), bool(v, "cache"), Math.round(num(v, "users")));
    return {
      metrics: { monthlySpend: r.monthly, truncatedShare: r.trunc, blockedLegit: r.blocked, qualityLoss: r.qualityLoss },
      readouts: [
        { label: "Spend a month", value: r.monthly, fmt: "usd", tone: tone(r.monthly, 8000, 15000) },
        { label: "Answers cut off by the cap", value: r.trunc, fmt: "pct", tone: tone(r.trunc, 0.03, 0.1) },
        { label: "Legitimate requests refused by the quota", value: r.blocked, fmt: "pct", tone: tone(r.blocked, 0.01, 0.05) },
        { label: "Quality lost to routing", value: r.qualityLoss, fmt: "pct", tone: tone(r.qualityLoss, 0.02, 0.04) },
      ],
      view: { kind: "bars", fmt: "usd", max: 30000, bars: [{ label: "Monthly spend", value: r.monthly, tone: tone(r.monthly, 8000, 15000) }], lines: [{ value: 8000, label: "budget", tone: "alert" }] },
      notes: [r.monthly > 15000 ? "A few heavy users and long answers dominate the bill." : "The controls are doing their jobs without hurting ordinary users."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.monthlySpend! > 15000) ev.push("over-budget");
    if (out.metrics.blockedLegit! > 0.05) ev.push("choked");
    return ev;
  },
  scene: (n): SceneOut => (n === "cap" ? { set: { cap: 1000 }, focus: ["cap"] } : n === "quota" ? { set: { quota: 150 }, focus: ["quota"] } : n === "route" ? { set: { route: 0.5 }, focus: ["route"] } : undefined),
};

export const B9_MODELS: LabModel[] = [gatewayLab, routerLab, semcacheLab, llmretryLab, streamLab, traceLab, guardrailLab, piiLab, budgetLab];
