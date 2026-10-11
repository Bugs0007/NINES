import { defineBoss } from "../define";

export const GWC = {};

const LITELLM = { id: "litellm-proxy", title: "LiteLLM docs: LLM gateway (proxy server) with keys, budgets, rate limits and fallbacks", url: "https://docs.litellm.ai/docs/simple_proxy" };
const FRUGAL = { id: "frugalgpt", title: "Chen, Zaharia, Zou (2023), FrugalGPT: how to use LLMs while reducing cost and improving performance", url: "https://arxiv.org/abs/2305.05176" };
const GPTCACHE = { id: "gptcache", title: "GPTCache: a semantic cache for LLM queries", url: "https://github.com/zilliztech/GPTCache" };
const AWS_JITTER = { id: "aws-timeouts-retries", title: "AWS Builders' Library: Timeouts, retries, and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };

export default defineBoss({
  id: "case-llm-gateway",
  title: "Case: LLM Gateway",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "finance · model spend $186,000 this month, no team attribution", detail: "a provider blip last Tuesday produced a 4× retry storm" },
    lines: [{ speaker: "kabir", line: "Every team calls the model provider directly. Spend tripled, finance cannot tell whose it is, and last Tuesday a provider blip made our retries four times as bad." }],
  },
  intro: [
    { speaker: "meera", line: "You are building the one door every AI feature goes through. What you put in it must be cheaper than what it saves, and must not become the next outage." },
    { speaker: "rao", line: "Every request that does not need the biggest model is money. Every cached answer that is wrong is a bug the user cannot report." },
  ],
  forecast: {
    metric: "costPerMillion",
    prompt: "A request has 1,500 input and 300 output tokens at $2 and $10 per million. What do a million requests cost on the large model?",
    unit: "$",
    scale: 1,
    min: 100,
    max: 100000,
    tolerance: 1.2,
  },
  exercises: ["llm-gateway", "model-routing", "llm-cost-controls", "semantic-caching"],
  challenge: {
    id: "design-gateway",
    title: "Run the gateway",
    brief: "Cost $3,000 or less per million requests with 99.99% availability, at most 15 ms of added latency, all spend attributed to teams, at most 0.5% wrong cached answers, no retry storm, runaway exposure at a tenth, and at most 3 points of quality lost.",
    line: { speaker: "meera", line: "Each lever buys one thing and puts one risk on the table." },
    widget: { id: "gwcase-lab", config: GWC },
    conditions: [
      { metric: "costPerMillion", op: "<=", value: 3000, label: "At most $3,000 per million requests" },
      { metric: "availability", op: ">=", value: 0.9999, label: "At least 99.99% available" },
      { metric: "addedMs", op: "<=", value: 15, label: "At most 15 ms added" },
      { metric: "attributedSpend", op: ">=", value: 1, label: "All spend attributed" },
      { metric: "wrongCacheShare", op: "<=", value: 0.005, label: "At most 0.5% wrong cached answers" },
      { metric: "retryStormRisk", op: "<=", value: 0, label: "No retry storm" },
      { metric: "runawayExposure", op: "<=", value: 0.1, label: "Runaway exposure at a tenth" },
      { metric: "qualityLoss", op: "<=", value: 0.03, label: "At most 3 points of quality lost" },
    ],
    stars: [{ metric: "costPerMillion", op: "<=", value: 2500, label: "At most $2,500 per million" }],
    hints: ["What does routing save and what does it cost in quality?", "What makes a semantic cache safe?", "Which retry policy cannot amplify an outage?"],
  },
  debrief: [
    { id: "route", text: "A cascade sends easy requests to a small model and escalates when unsure: 45% cheaper, 2 points of quality lost. It is the single biggest lever on the bill, and only a measured quality loss makes it safe.", sourceIds: ["frugalgpt"] },
    { id: "cache", text: "An exact-match cache hits 12% of requests and is always right. A semantic cache hits 30% and serves a wrong answer to 3%. A verification step before serving keeps 28% hits and 0.3% wrong, for 3 ms.", sourceIds: ["gptcache"] },
    { id: "safe", text: "Failover to a second provider turns 99.5% into 99.9975%. Retries with backoff, jitter and a budget keep a provider blip from becoming a storm. Per-team budgets cut a runaway job's exposure to a tenth, and asynchronous logging attributes spend at 1 ms.", sourceIds: ["litellm-proxy", "aws-timeouts-retries"] },
  ],
  outro: { speaker: "kabir", line: "Cascade, verified cache, budgets, failover, async logs, disciplined retries. $2,400 per million, and finance can see whose it is." },
  explainBack: {
    prompt: "Present your LLM gateway: what it saves, what it risks and how it stays up.",
    rubric: [
      { id: "cost", criterion: "Route easy requests to a smaller model with a measured quality loss, and cache safely", keyIdea: "route and cache" },
      { id: "cache", criterion: "A semantic cache needs verification (and scoped keys) to avoid wrong answers; exact caching is always safe but hits less", keyIdea: "verify the cache" },
      { id: "avail", criterion: "Fail over across independent providers and use retries with backoff, jitter and a budget to avoid storms", keyIdea: "availability and retries" },
      { id: "ops", criterion: "Attribute spend per team, apply budgets, and log asynchronously to keep the hop cheap", keyIdea: "attribution and budgets" },
    ],
    exemplar:
      "A cascade sends easy requests to a small model and escalates when unsure, which cut the cost per million requests from six thousand dollars to about three, losing two points of quality that I measured. A semantic cache with a verification step keeps most of the hits and cuts wrong answers from three percent to 0.3 percent. Failing over to a second provider lifts availability from 99.5 to 99.9975 percent, retries use backoff, jitter and a budget so a blip cannot become a storm, and per-team budgets plus asynchronous logs attribute spend and cap a runaway job.",
  },
  honestPhysics: [
    "A gateway in front of one provider at $6,000 per million requests with the large model. A cascade cuts cost 45% and loses 2 points. An exact cache hits 12%; a semantic cache 30% with 3% wrong; with verification 28% and 0.3% wrong, 3 ms.",
    "99.5% availability for one provider, 99.9975% with a second independent one. The gateway adds 4 ms, 12 more with synchronous logging, 1 with asynchronous, 1 for failover. Naive retries amplify overload; budgets cut a runaway team's exposure to a tenth. Round figures.",
  ],
  sources: [LITELLM, FRUGAL, GPTCACHE, AWS_JITTER],
  verify: [
    { id: "forecast", claim: "A million requests on the large model cost $6,000", run: "lab", params: { model: "gwcase-lab", config: GWC, values: {}, metric: "costPerMillion" }, expect: { min: 6000, max: 6000 } },
    { id: "cascade", claim: "A cascade cuts it to $3,300", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { route: "cascade" }, metric: "costPerMillion" }, expect: { min: 3299, max: 3301 } },
    { id: "semantic", claim: "An unverified semantic cache serves 3% wrong answers", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { cache: "semantic" }, metric: "wrongCacheShare" }, expect: { min: 0.03, max: 0.03 } },
    { id: "verified", claim: "Verification cuts that to 0.3%", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { cache: "verified" }, metric: "wrongCacheShare" }, expect: { min: 0.003, max: 0.003 } },
    { id: "good", claim: "The full design costs $2,376 per million", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { route: "cascade", cache: "verified", budget: true, failover: true, logging: "async", retries: "backoff" }, metric: "costPerMillion" }, expect: { min: 2370, max: 2380 } },
    { id: "good-ms", claim: "…adding 9 ms", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { route: "cascade", cache: "verified", budget: true, failover: true, logging: "async", retries: "backoff" }, metric: "addedMs" }, expect: { min: 9, max: 9 } },
    { id: "naive", claim: "Naive retries leave a storm risk", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { retries: "naive" }, metric: "retryStormRisk" }, expect: { min: 1 } },
    { id: "sync", claim: "Synchronous logging pushes the hop past 15 ms", run: "lab", params: { model: "gwcase-lab", config: GWC, values: { cache: "verified", logging: "sync", failover: true }, metric: "addedMs" }, expect: { min: 20 } },
  ],
});
