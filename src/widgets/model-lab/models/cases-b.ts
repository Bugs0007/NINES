/**
 * Interview-case models for the AI track: a chat service, legal RAG at scale, a coding agent, an LLM gateway, a
 * support agent with human escalation, and a document-processing pipeline. Closed forms with labelled round
 * constants (see each model's `honest` text).
 */
import { TEACHING_CACHE_READ_MULT, TEACHING_PRICES } from "../../../content/prices";
import { normCdf } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");
const yn = (x: number | boolean) => (x ? "yes" : "no");
const P_IN = TEACHING_PRICES.big.input / 1e6;
const P_OUT = TEACHING_PRICES.big.output / 1e6;

// ------------------------------------------------------------------ chat service

function convTokens(turns: number, history: string) {
  let total = 0;
  for (let k = 1; k <= turns; k++) {
    const prior = history === "full" ? k - 1 : history === "window" ? Math.min(k - 1, 4) : Math.min(k - 1, 2);
    total += 800 + 150 + prior * 500 + (history === "summary" && k > 1 ? 600 : 0);
  }
  return total;
}
export function chatsvcRun(stream: boolean, history: string, route: boolean, limit: string, cache: boolean) {
  const cacheShare = !cache ? 0 : history === "full" ? 0.82 : history === "window" ? 0.3 : 0.5;
  const conv = (turns: number) => {
    const inTok = convTokens(turns, history);
    const inCost = inTok * (1 - cacheShare) * P_IN + inTok * cacheShare * P_IN * TEACHING_CACHE_READ_MULT;
    const outCost = turns * 350 * P_OUT;
    const sum = history === "summary" ? 1.06 : 1;
    return (inCost + outCost) * sum * (route ? 0.7 : 1);
  };
  const lastCtx = 950 + (history === "full" ? 59 * 500 : history === "window" ? 4 * 500 : 2 * 500 + 600);
  const ttft = stream ? 0.9 + (lastCtx / 10000) * 0.1 : 0.9 + 350 / 60 + (lastCtx / 10000) * 0.1;
  return {
    cost: conv(10),
    p99Cost: conv(60),
    ttft,
    forget: history === "full" ? 0 : history === "window" ? 0.25 : 0.06,
    abuse: limit === "none" ? 0.4 : limit === "requests" ? 0.15 : 0.1,
    throttled: limit === "none" ? 0 : limit === "requests" ? 0.03 : 0.005,
    qualityLoss: route ? 0.03 : 0,
  };
}
export const chatsvcLab: LabModel = {
  id: "chatsvc-lab",
  metrics: ["costPerConversation", "longConversationCost", "ttftSec", "forgetRate", "abuseSpendShare", "legitThrottled", "qualityLoss"],
  observes: ["runaway-convo", "abuse"],
  scenes: ["history", "caching", "limits"],
  runLabel: "Run the service",
  honest: [
    "A chat service with an 800-token system prompt. Each turn the user writes 150 tokens and the model answers 350, and the prompt for each turn includes the earlier turns (500 tokens each). Costs use the teaching prices ($2 and $10 per million tokens; cached reads at a tenth). A typical conversation has 10 turns; the long tail has 60.",
    "Sending the full history makes input grow with every turn (32,000 tokens over 10 turns, 940,000 over 60). Keeping a window of the last 4 turns bounds the cost and forgets earlier facts in 25% of conversations. Summarising older turns keeps the context near 3,000 tokens and forgets 6%, at 6% extra cost. Prompt caching reuses a stable prefix: 82% of full-history input, but only 30% under a sliding window, whose prefix keeps changing. Routing chatty turns to a small model cuts token cost 30% and loses 3 points of quality.",
    "The 1% of users who are heavy account for 40% of spend; a request limit cuts that to 15% and throttles 3% of legitimate users; a token budget cuts it to 10% and throttles 0.5%. Streaming shows the first token after about 0.9 s instead of the whole answer. Round figures.",
  ],
  init: () => ({ stream: false, history: "full", route: false, limit: "none", cache: false }),
  controls: () => [
    { kind: "toggle", id: "stream", label: "Stream answers" },
    { kind: "choice", id: "history", label: "History sent each turn", options: [{ id: "full", label: "All earlier turns" }, { id: "window", label: "The last four turns" }, { id: "summary", label: "A summary plus the last two turns" }] },
    { kind: "toggle", id: "cache", label: "Prompt caching" },
    { kind: "toggle", id: "route", label: "Route chatty turns to a small model" },
    { kind: "choice", id: "limit", label: "Abuse control", options: [{ id: "none", label: "None" }, { id: "requests", label: "A requests-per-day limit" }, { id: "tokens", label: "A token budget per day" }] },
  ],
  evaluate: (v) => {
    const r = chatsvcRun(bool(v, "stream"), str(v, "history"), bool(v, "route"), str(v, "limit"), bool(v, "cache"));
    return {
      metrics: { costPerConversation: r.cost, longConversationCost: r.p99Cost, ttftSec: r.ttft, forgetRate: r.forget, abuseSpendShare: r.abuse, legitThrottled: r.throttled, qualityLoss: r.qualityLoss },
      readouts: [
        { label: "Cost of a 10-turn conversation", value: r.cost, fmt: "usd", tone: tone(r.cost, 0.05, 0.09) },
        { label: "Cost of a 60-turn conversation", value: r.p99Cost, fmt: "usd", tone: tone(r.p99Cost, 0.4, 1) },
        { label: "Time to first text", value: r.ttft, fmt: "s", tone: tone(r.ttft, 1.5, 4) },
        { label: "Conversations that forget something needed", value: r.forget, fmt: "pct", tone: tone(r.forget, 0.08, 0.2) },
        { label: "Spend by the heaviest 1% of users", value: r.abuse, fmt: "pct", tone: tone(r.abuse, 0.15, 0.3) },
        { label: "Legitimate users throttled", value: r.throttled, fmt: "pct", tone: tone(r.throttled, 0.01, 0.02) },
      ],
      view: { kind: "bars", fmt: "usd", max: 2.2, bars: [{ label: "10-turn conversation", value: r.cost, tone: tone(r.cost, 0.05, 0.09) }, { label: "60-turn conversation", value: Math.min(2.2, r.p99Cost), tone: tone(r.p99Cost, 0.4, 1) }] },
      notes: [r.p99Cost > 1 ? "Long conversations are a quadratic bill." : r.forget > 0.2 ? "The assistant forgets what you told it." : "Bounded cost and a memory that mostly holds."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.longConversationCost! > 1) ev.push("runaway-convo");
    if (out.metrics.abuseSpendShare! >= 0.4) ev.push("abuse");
    return ev;
  },
  scene: (n): SceneOut => (n === "history" ? { set: { history: "summary" }, focus: ["history"] } : n === "caching" ? { set: { cache: true }, focus: ["cache"] } : n === "limits" ? { set: { limit: "tokens" }, focus: ["limit"] } : undefined),
};

// ------------------------------------------------------------------ legal RAG at scale

export function legalRun(chunking: string, retrieval: string, rerank: boolean, isolation: string, embed: string) {
  let recall = retrieval === "dense" ? 0.72 : retrieval === "bm25" ? 0.66 : 0.82;
  if (rerank) recall += 0.06;
  if (chunking === "structure") recall += 0.04;
  if (embed === "int8") recall -= 0.01;
  const p99 = (retrieval === "dense" ? 40 : retrieval === "bm25" ? 25 : 70) + (rerank ? 180 : 0) + (isolation === "cluster" ? 0 : isolation === "namespace" ? 5 : 15);
  const leak = isolation === "filter" ? 0.001 : isolation === "namespace" ? 0.0001 : 0;
  const memTB = (200e6 * (embed === "float" ? 4096 : 1024) * 1.5) / 1e12;
  const memCost = memTB * 5000 * (isolation === "cluster" ? 1.6 : 1);
  const perQuery = 0.012 + (rerank ? 0.004 : 0);
  return { recall, p99, leak, memCost, perQuery };
}
export const legalLab: LabModel = {
  id: "legalrag-lab",
  metrics: ["recallAt10", "p99Ms", "leakRisk", "indexCostMonth", "costPerQuery"],
  observes: ["leak", "weak-recall"],
  scenes: ["hybrid", "isolation", "quantize"],
  runLabel: "Run the design",
  honest: [
    "A search over 200 million chunks of legal documents for hundreds of firms, whose documents must never cross. Recall at 10 starts at 72% for dense retrieval, 66% for keyword search and 82% for a hybrid fused by rank; a cross-encoder reranker adds 6 points and 180 ms; structure-aware chunking (by section, not every 512 tokens) adds 4 points; 8-bit embeddings cost 1 point.",
    "Dense search takes 40 ms, keyword 25, hybrid 70. Tenancy: a shared index filtered by firm leaks on a filter bug about 0.1% of the time, a namespace per firm 0.01%, a separate cluster per firm never (at 1.6× the cost and 15 ms less). Embeddings of 1,024 dimensions in 32-bit floats are 4 KB a chunk, in 8-bit 1 KB; HNSW overhead is 1.5×; RAM-backed index costs $5,000 a terabyte-month. A query costs $0.012 for retrieval and generation, $0.004 more with reranking.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ chunking: "fixed", retrieval: "dense", rerank: false, isolation: "filter", embed: "float" }),
  controls: () => [
    { kind: "choice", id: "chunking", label: "Chunking", options: [{ id: "fixed", label: "Fixed 512-token windows" }, { id: "structure", label: "By section and clause" }] },
    { kind: "choice", id: "retrieval", label: "Retrieval", options: [{ id: "dense", label: "Dense vectors" }, { id: "bm25", label: "Keyword (BM25)" }, { id: "hybrid", label: "Hybrid, fused by rank" }] },
    { kind: "toggle", id: "rerank", label: "Rerank the top results" },
    { kind: "choice", id: "isolation", label: "Tenant isolation", options: [{ id: "filter", label: "A shared index with a firm filter" }, { id: "namespace", label: "A namespace per firm" }, { id: "cluster", label: "A separate cluster per firm" }] },
    { kind: "choice", id: "embed", label: "Embedding storage", options: [{ id: "float", label: "32-bit floats" }, { id: "int8", label: "8-bit integers" }] },
  ],
  evaluate: (v) => {
    const r = legalRun(str(v, "chunking"), str(v, "retrieval"), bool(v, "rerank"), str(v, "isolation"), str(v, "embed"));
    return {
      metrics: { recallAt10: r.recall, p99Ms: r.p99, leakRisk: r.leak, indexCostMonth: r.memCost, costPerQuery: r.perQuery },
      readouts: [
        { label: "Recall at 10", value: r.recall, fmt: "pct", tone: toneLow(r.recall, 0.88, 0.8) },
        { label: "Search p99", value: r.p99, fmt: "ms", tone: tone(r.p99, 300, 600) },
        { label: "Chance a query crosses firms", value: r.leak, fmt: "pct", tone: tone(r.leak, 0.00001, 0.0005) },
        { label: "Index cost a month", value: r.memCost, fmt: "usd", tone: tone(r.memCost, 5000, 10000) },
        { label: "Cost a query", value: r.perQuery, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Recall at 10", value: r.recall, tone: toneLow(r.recall, 0.88, 0.8) }] },
      notes: [r.leak >= 0.001 ? "One filter bug away from showing one firm another's documents." : r.recall < 0.8 ? "The right passage is often missed." : "Good recall, isolated, and the index fits the budget."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.leakRisk! >= 0.001) ev.push("leak");
    if (out.metrics.recallAt10! < 0.75) ev.push("weak-recall");
    return ev;
  },
  scene: (n): SceneOut => (n === "hybrid" ? { set: { retrieval: "hybrid", rerank: true }, focus: ["retrieval", "rerank"] } : n === "isolation" ? { set: { isolation: "namespace" }, focus: ["isolation"] } : n === "quantize" ? { set: { embed: "int8" }, focus: ["embed"] } : undefined),
};

// ------------------------------------------------------------------ coding agent

export function codingRun(sandbox: string, perms: string, context: string, verify: boolean, steps: number) {
  let success = 0.35;
  if (verify) success += 0.3;
  if (context === "retrieval") success += 0.08;
  if (context === "subagents") success += 0.12;
  const need = verify ? 18 : 10;
  if (steps < need) success *= 0.5 + 0.5 * (steps / need);
  const cost = (steps * 0.06) * (context === "full" ? 1.8 : context === "retrieval" ? 1 : 0.9);
  const blast = (sandbox === "none" ? 100000 : sandbox === "container" ? 4000 : 500) * (perms === "full" ? 1 : perms === "allow" ? 0.5 : 0.25);
  const interrupts = perms === "full" ? 0 : perms === "allow" ? 1.5 : 12;
  const timeMin = steps * 0.35 * (perms === "ask" ? 1.6 : 1) * (verify ? 1.2 : 1);
  return { success, cost, blast, interrupts, timeMin };
}
export const codingLab: LabModel = {
  id: "codeagent-lab",
  metrics: ["successRate", "costPerTask", "blastRadius", "interruptsPerTask", "minutesPerTask"],
  observes: ["wipe", "fatigue"],
  scenes: ["sandbox", "verify", "perms"],
  runLabel: "Run the agent",
  honest: [
    "A coding agent that works on a developer's repository. A bare agent finishes 35% of tasks correctly; letting it run the tests and fix failures adds 30 points; retrieving only the relevant files adds 8; delegating exploration to subagents adds 12. It needs about 10 steps for a plain edit and 18 when it also runs tests; with fewer steps its success falls toward half. A step costs about $0.06, 1.8× that if the whole repository is kept in context, 0.9× with subagents.",
    "The worst a hijacked or mistaken agent could do is the value at risk: $100,000 with no sandbox, $4,000 in a container with the repository mounted, $500 in a microVM with a scratch copy; halved by a command allowlist, quartered by approving every action. Every approval prompt interrupts the developer: none with full permissions, about 1.5 per task with an allowlist, 12 when approving each action, which also adds 60% to the elapsed time.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ sandbox: "none", perms: "full", context: "full", verify: false, steps: 10 }),
  controls: () => [
    { kind: "choice", id: "sandbox", label: "Where it runs", options: [{ id: "none", label: "On the developer's machine" }, { id: "container", label: "In a container with the repo mounted" }, { id: "microvm", label: "In a microVM with a scratch copy" }] },
    { kind: "choice", id: "perms", label: "Permissions", options: [{ id: "full", label: "Run anything" }, { id: "allow", label: "A command allowlist" }, { id: "ask", label: "Approve every action" }] },
    { kind: "choice", id: "context", label: "Finding code", options: [{ id: "full", label: "Keep the whole repository in context" }, { id: "retrieval", label: "Retrieve the relevant files" }, { id: "subagents", label: "Subagents explore and report" }] },
    { kind: "toggle", id: "verify", label: "Run the tests and fix failures itself" },
    { kind: "slider", id: "steps", label: "Step limit", min: 4, max: 40, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const r = codingRun(str(v, "sandbox"), str(v, "perms"), str(v, "context"), bool(v, "verify"), Math.round(num(v, "steps")));
    return {
      metrics: { successRate: r.success, costPerTask: r.cost, blastRadius: r.blast, interruptsPerTask: r.interrupts, minutesPerTask: r.timeMin },
      readouts: [
        { label: "Tasks finished correctly", value: r.success, fmt: "pct", tone: toneLow(r.success, 0.75, 0.5) },
        { label: "Cost a task", value: r.cost, fmt: "usd", tone: tone(r.cost, 2, 4) },
        { label: "Worst case if it goes wrong", value: r.blast, fmt: "usd", tone: tone(r.blast, 1000, 10000) },
        { label: "Approval prompts a task", value: r.interrupts, fmt: "num", tone: tone(r.interrupts, 3, 8) },
        { label: "Minutes a task", value: r.timeMin, fmt: "num", tone: tone(r.timeMin, 10, 20) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Tasks finished correctly", value: r.success, tone: toneLow(r.success, 0.75, 0.5) }] },
      notes: [r.blast >= 50000 ? "A mistake can reach everything the developer can." : r.interrupts >= 12 ? "So many prompts that people stop reading them." : "Capable, contained and not nagging."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.blastRadius! >= 50000) ev.push("wipe");
    if (out.metrics.interruptsPerTask! >= 12) ev.push("fatigue");
    return ev;
  },
  scene: (n): SceneOut => (n === "sandbox" ? { set: { sandbox: "microvm" }, focus: ["sandbox"] } : n === "verify" ? { set: { verify: true, steps: 20 }, focus: ["verify", "steps"] } : n === "perms" ? { set: { perms: "allow" }, focus: ["perms"] } : undefined),
};

// ------------------------------------------------------------------ LLM gateway (case)

export function gwcaseRun(route: string, cache: string, budget: boolean, failover: boolean, logging: string, retries: string) {
  const base = 6000;
  let cost = base;
  let quality = 0;
  if (route === "cascade") {
    cost *= 0.55;
    quality = 0.02;
  }
  const hit = cache === "exact" ? 0.12 : cache === "semantic" ? 0.3 : cache === "verified" ? 0.28 : 0;
  cost *= 1 - hit;
  const wrong = cache === "semantic" ? 0.03 : cache === "verified" ? 0.003 : 0;
  const avail = failover ? 0.999975 : 0.995;
  const added = 4 + (logging === "sync" ? 12 : logging === "async" ? 1 : 0) + (cache === "verified" ? 3 : 0) + (failover ? 1 : 0);
  const stormRisk = retries === "naive" ? 1 : 0;
  const attributed = logging !== "none" ? 1 : 0;
  return { cost, quality, wrong, avail, added, storm: stormRisk, attributed, runaway: budget ? 0.1 : 1 };
}
export const gwcaseLab: LabModel = {
  id: "gwcase-lab",
  metrics: ["costPerMillion", "qualityLoss", "wrongCacheShare", "availability", "addedMs", "retryStormRisk", "attributedSpend", "runawayExposure"],
  observes: ["bad-cache", "storm"],
  scenes: ["route", "cache", "budget"],
  runLabel: "Run the gateway",
  honest: [
    "A gateway in front of one provider for a company's AI features, at $6,000 per million requests with the large model. A cascade (small model first, escalating when unsure) cuts cost 45% and loses 2 points of quality. An exact-match cache hits 12% of requests; a semantic cache 30% but serves a wrong answer to 3% of requests; adding a verification step keeps 28% hits and 0.3% wrong at 3 ms.",
    "The provider is 99.5% available; failing over to a second independent one gives 99.9975%. The gateway adds 4 ms, 12 more if it logs synchronously and 1 if asynchronously. Retrying naively on a 429 amplifies an overload into a storm; retries with backoff, jitter and a budget do not. A per-team budget limits the exposure to one team's runaway job to a tenth.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ route: "none", cache: "none", budget: false, failover: false, logging: "none", retries: "naive" }),
  controls: () => [
    { kind: "choice", id: "route", label: "Models", options: [{ id: "none", label: "Always the large model" }, { id: "cascade", label: "A cascade: small first, escalate when unsure" }] },
    { kind: "choice", id: "cache", label: "Caching", options: [{ id: "none", label: "None" }, { id: "exact", label: "Exact match" }, { id: "semantic", label: "Semantic, no check" }, { id: "verified", label: "Semantic with verification" }] },
    { kind: "toggle", id: "budget", label: "Per-team budgets" },
    { kind: "toggle", id: "failover", label: "Fail over to a second provider" },
    { kind: "choice", id: "logging", label: "Usage logging", options: [{ id: "none", label: "None" }, { id: "sync", label: "In the request path" }, { id: "async", label: "Asynchronous" }] },
    { kind: "choice", id: "retries", label: "On 429s", options: [{ id: "naive", label: "Retry at once" }, { id: "backoff", label: "Backoff, jitter and a retry budget" }] },
  ],
  evaluate: (v) => {
    const r = gwcaseRun(str(v, "route"), str(v, "cache"), bool(v, "budget"), bool(v, "failover"), str(v, "logging"), str(v, "retries"));
    return {
      metrics: { costPerMillion: r.cost, qualityLoss: r.quality, wrongCacheShare: r.wrong, availability: r.avail, addedMs: r.added, retryStormRisk: r.storm, attributedSpend: r.attributed, runawayExposure: r.runaway },
      readouts: [
        { label: "Cost per million requests", value: r.cost, fmt: "usd", tone: tone(r.cost, 3000, 5000) },
        { label: "Quality lost", value: r.quality, fmt: "pct", tone: tone(r.quality, 0.02, 0.05) },
        { label: "Requests served a wrong cached answer", value: r.wrong, fmt: "pct", tone: tone(r.wrong, 0.005, 0.02) },
        { label: "Availability", value: r.avail, fmt: "pct", tone: toneLow(r.avail, 0.9999, 0.999) },
        { label: "Added latency", value: r.added, fmt: "ms", tone: tone(r.added, 15, 25) },
        { label: "A retry storm can form", value: yn(r.storm), tone: r.storm ? "alert" : "ok" },
        { label: "Spend attributed to teams", value: yn(r.attributed), tone: r.attributed ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "usd", max: 6500, bars: [{ label: "Cost per million requests", value: r.cost, tone: tone(r.cost, 3000, 5000) }] },
      notes: [r.wrong >= 0.03 ? "The cache answers questions nobody asked." : r.storm ? "A provider blip becomes a storm." : "Cheaper, correct and observable."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.wrongCacheShare! >= 0.03) ev.push("bad-cache");
    if (out.metrics.retryStormRisk === 1 && str(v, "retries") === "naive" && bool(v, "failover")) ev.push("storm");
    return ev;
  },
  scene: (n): SceneOut => (n === "route" ? { set: { route: "cascade" }, focus: ["route"] } : n === "cache" ? { set: { cache: "verified" }, focus: ["cache"] } : n === "budget" ? { set: { budget: true, logging: "async" }, focus: ["budget", "logging"] } : undefined),
};

// ------------------------------------------------------------------ support agent

export function supportRun(retrieval: boolean, guard: boolean, thr: number, review: number) {
  const pRight = retrieval ? 0.9 : 0.72;
  const right = (t: number) => 1 - normCdf((t - 0.82) / 0.1);
  const wrong = (t: number) => 1 - normCdf((t - 0.45) / 0.15);
  const auto = pRight * right(thr) + (1 - pRight) * wrong(thr);
  let shippedWrong = (1 - pRight) * wrong(thr) * 10000;
  if (guard) shippedWrong *= 0.5;
  const caughtLate = review;
  const harm = shippedWrong * (1 - caughtLate * 0.8);
  const esc = (1 - auto) * 10000 + (guard ? 0.01 * auto * 10000 : 0) + review * auto * 10000 * 0.3;
  const hours = (esc * 6) / 60;
  return { auto, shippedWrong: harm, esc, hours, resolved: auto - (guard ? 0.01 * auto : 0) };
}
export const supportLab: LabModel = {
  id: "supportagent-lab",
  metrics: ["wrongShippedPer10k", "escalationsPer10k", "humanHoursDay", "autoResolveRate"],
  observes: ["wrong-answers", "flood"],
  scenes: ["retrieval", "threshold", "review"],
  runLabel: "Run a day of tickets",
  honest: [
    "10,000 support tickets a day. Without retrieval the agent answers 72% of tickets correctly; with retrieval from the help centre 90%. It reports a confidence for each answer: correct answers average 0.82 (spread 0.10) and wrong ones 0.45 (spread 0.15), so a wrong answer is usually, not always, less confident. Answers below your escalation threshold go to a person, at 6 minutes each.",
    "An output guardrail halves the wrong answers that ship and wrongly escalates 1% of good ones. Reviewing a share of the answers that did ship, after the fact, catches 80% of the wrong ones in that sample and sends them for correction; harm is the wrong answers that shipped and were not caught. Reviewing costs 30% of a human handling per reviewed ticket.",
    "Round figures for the shape of the trade-off.",
  ],
  init: () => ({ retrieval: false, guard: false, thr: 0.5, review: 0 }),
  controls: () => [
    { kind: "toggle", id: "retrieval", label: "Ground answers in the help centre (retrieval)" },
    { kind: "toggle", id: "guard", label: "Check answers against policy before sending" },
    { kind: "slider", id: "thr", label: "Escalate when confidence is below", min: 0.3, max: 0.95, step: 0.01, fmt: "num" },
    { kind: "choice", id: "review", label: "Sample reviewed after sending", options: [{ id: "0", label: "None" }, { id: "0.05", label: "5%" }, { id: "0.2", label: "20%" }] },
  ],
  evaluate: (v) => {
    const r = supportRun(bool(v, "retrieval"), bool(v, "guard"), num(v, "thr"), Number(str(v, "review")));
    return {
      metrics: { wrongShippedPer10k: r.shippedWrong, escalationsPer10k: r.esc, humanHoursDay: r.hours, autoResolveRate: r.resolved },
      readouts: [
        { label: "Wrong answers reaching customers, per 10,000", value: r.shippedWrong, fmt: "int", tone: tone(r.shippedWrong, 30, 150) },
        { label: "Tickets handled by a person", value: r.esc, fmt: "int", tone: tone(r.esc, 4000, 7000) },
        { label: "Human hours a day", value: r.hours, fmt: "num", tone: tone(r.hours, 100, 500) },
        { label: "Resolved by the agent", value: r.resolved, fmt: "pct", tone: toneLow(r.resolved, 0.55, 0.3) },
      ],
      view: { kind: "bars", fmt: "int", max: 3000, bars: [{ label: "Wrong answers sent per 10,000", value: Math.min(3000, r.shippedWrong), tone: tone(r.shippedWrong, 30, 150) }] },
      notes: [r.shippedWrong > 150 ? "The agent is confidently wrong too often." : r.hours > 500 ? "A person handles most of the queue." : "Answers where it is sure, hands over where it isn't."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.wrongShippedPer10k! > 150) ev.push("wrong-answers");
    if (out.metrics.humanHoursDay! > 500) ev.push("flood");
    return ev;
  },
  scene: (n): SceneOut => (n === "retrieval" ? { set: { retrieval: true }, focus: ["retrieval"] } : n === "threshold" ? { set: { thr: 0.7 }, focus: ["thr"] } : n === "review" ? { set: { review: "0.05" }, focus: ["review"] } : undefined),
};

// ------------------------------------------------------------------ document pipeline

export function docRun(queue: boolean, workers: number, structured: boolean, validate: boolean, dlq: boolean, batch: boolean) {
  const perWorker = 600;
  const cap = workers * perWorker;
  const acc = (structured ? 0.95 : 0.86) + (validate ? (structured ? 0.03 : 0.04) : 0);
  const cost = (structured ? 0.011 : 0.014) * (batch ? 0.5 : 1) + 0.0015;
  const stuck = dlq ? 0 : 0.005;
  const peak = 12000;
  const loss = queue ? 0 : Math.max(0, 1 - cap / peak);
  const latency = batch ? 12 : queue ? Math.max(0, ((peak - cap) * 6) / cap) + 0.1 : 0.05;
  return { cap, acc: Math.min(0.995, acc), cost, stuck, loss, latency };
}
export const docLab: LabModel = {
  id: "docpipe-lab",
  metrics: ["capacityPerHour", "extractionAccuracy", "costPerDoc", "stuckShare", "droppedShare", "latencyHours"],
  observes: ["poison", "dropped"],
  scenes: ["structured", "queue", "batch"],
  runLabel: "Run the pipeline",
  honest: [
    "200,000 scanned documents a day, arriving in surges of 12,000 an hour. Each is read by OCR and then by a model that extracts fields. A worker handles 600 documents an hour. Free-text extraction gets 86% of documents fully right and extraction constrained to a schema 95%; validating against business rules (totals add up, dates are real) adds 4 points to free text and 3 to structured output.",
    "Without a queue, documents arriving faster than the workers can process are dropped. A queue holds the surge. A poison document, one that crashes the extractor, blocks its place in the queue: 0.5% of documents get stuck unless failures go to a dead-letter queue for a person. The batch interface costs half the price and returns within 12 hours. A document costs $0.011 to extract with a schema, $0.014 without, plus $0.0015 for OCR.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ queue: false, workers: 10, structured: false, validate: false, dlq: false, batch: false }),
  controls: () => [
    { kind: "toggle", id: "queue", label: "A queue between upload and workers" },
    { kind: "slider", id: "workers", label: "Workers", min: 2, max: 40, step: 1, fmt: "int" },
    { kind: "toggle", id: "structured", label: "Constrain extraction to a schema" },
    { kind: "toggle", id: "validate", label: "Validate against business rules" },
    { kind: "toggle", id: "dlq", label: "Failures go to a dead-letter queue for review" },
    { kind: "toggle", id: "batch", label: "Use the batch interface (half price, within 12 hours)" },
  ],
  evaluate: (v) => {
    const r = docRun(bool(v, "queue"), Math.round(num(v, "workers")), bool(v, "structured"), bool(v, "validate"), bool(v, "dlq"), bool(v, "batch"));
    return {
      metrics: { capacityPerHour: r.cap, extractionAccuracy: r.acc, costPerDoc: r.cost, stuckShare: r.stuck, droppedShare: r.loss, latencyHours: r.latency },
      readouts: [
        { label: "Documents an hour the workers handle", value: r.cap, fmt: "int", sub: "12,000 in a surge", tone: toneLow(r.cap, 12000, 8000) },
        { label: "Documents extracted fully right", value: r.acc, fmt: "pct", tone: toneLow(r.acc, 0.97, 0.9) },
        { label: "Cost a document", value: r.cost, fmt: "usd", tone: tone(r.cost, 0.012, 0.02) },
        { label: "Documents stuck behind a poison pill", value: r.stuck, fmt: "pct", tone: tone(r.stuck, 0.001, 0.003) },
        { label: "Dropped in a surge", value: r.loss, fmt: "pct", tone: tone(r.loss, 0, 0.05) },
        { label: "Surge backlog drains in", value: r.latency, fmt: "num", sub: "hours", tone: tone(r.latency, 12, 24) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Fully right", value: r.acc, tone: toneLow(r.acc, 0.97, 0.9) }] },
      notes: [r.loss > 0.05 ? "Surges overflow the workers and documents vanish." : r.stuck > 0 ? "A document that crashes the extractor holds up its line." : "Everything is read, checked and accounted for."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.stuckShare! > 0 && bool(v, "queue")) ev.push("poison");
    if (out.metrics.droppedShare! > 0.05) ev.push("dropped");
    return ev;
  },
  scene: (n): SceneOut => (n === "structured" ? { set: { structured: true, validate: true }, focus: ["structured", "validate"] } : n === "queue" ? { set: { queue: true, dlq: true }, focus: ["queue", "dlq"] } : n === "batch" ? { set: { batch: true }, focus: ["batch"] } : undefined),
};

export const CASES_B_MODELS: LabModel[] = [chatsvcLab, legalLab, codingLab, gwcaseLab, supportLab, docLab];
