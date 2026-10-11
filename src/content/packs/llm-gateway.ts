import { definePack } from "../define";

export const GW = { start: {} };
export const GW_CHALLENGE = {};

const LITELLM = { id: "litellm-proxy", title: "LiteLLM docs: LLM gateway (proxy server) with keys, budgets, rate limits and fallbacks", url: "https://docs.litellm.ai/docs/simple_proxy" };
const CF = { id: "cf-ai-gateway", title: "Cloudflare docs: AI Gateway (caching, rate limiting, logging and fallbacks for model APIs)", url: "https://developers.cloudflare.com/ai-gateway/" };
const AWS_STATIC = { id: "aws-static", title: "AWS Builders' Library: Static stability using Availability Zones (independent failure domains and failover)", url: "https://aws.amazon.com/builders-library/static-stability-using-availability-zones/" };

export default definePack({
  id: "llm-gateway",
  title: "Model Gateways",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "provider invoice · $41,200 · 12 keys, 0 owners", detail: "a batch job ran all weekend" },
    lines: [
      { speaker: "kabir", line: "Twelve teams each pasted the provider key into their own service. The invoice doubled and nobody can say whose job did it." },
      { speaker: "meera", line: "A gateway is one door every team uses. It holds the key, sees every call, and can say no to one team without the rest noticing." },
    ],
  },
  predictions: [
    {
      id: "failover",
      kind: "choice",
      prompt: "The provider is up 99.5% of the time. You put a gateway in front of two independent providers of that quality, with failover. What availability do teams see?",
      options: [
        { id: "995", label: "Still about 99.5%" },
        { id: "999", label: "About 99.9%" },
        { id: "9999", label: "About 99.9975%" },
      ],
      answer: "9999",
      observe: "outage-hits",
      reveal: {
        text: "The request fails only if both are down at once: 0.5% × 0.5% is 0.0025%, so 99.9975%. Independence is the catch: two providers behind the same cloud or the same model family fail together more often than the arithmetic says.",
        derived: true,
        line: { speaker: "meera", line: "Independence is what you are buying. Check you actually have it." },
      },
    },
    {
      id: "runaway",
      kind: "choice",
      prompt: "One team's batch job loops and uses the whole shared rate limit. With a gateway applying a limit per team, how many of the 12 teams are affected?",
      options: [
        { id: "all", label: "All 12, the limit is shared" },
        { id: "half", label: "About half" },
        { id: "one", label: "Only the team that caused it" },
      ],
      answer: "one",
      observe: "contained",
      reveal: {
        text: "With a limit for each team, the runaway job hits its own ceiling and gets 429s while the other eleven keep their share. Without it every team shares one pool and the loudest takes the lot. The gateway turns a company-wide incident into one team's problem.",
        derived: true,
        line: { speaker: "rao", line: "Limits per tenant are bulkheads for spend." },
      },
    },
  ],
  widget: { id: "gateway-lab", config: GW },
  mechanism: [
    {
      id: "what",
      scene: "central",
      text: "An LLM gateway is a reverse proxy for model APIs. Every team calls it with an internal token, and it calls the provider with the real key. Keys live in one place, can be rotated without touching a service, and every request passes a single point where policy can be applied.",
      sourceIds: ["litellm-proxy", "cf-ai-gateway"],
    },
    {
      id: "policy",
      scene: "limits",
      text: "At that point the gateway can attribute each call to a team and a feature, enforce per-team rate limits and budgets, cache identical requests, redact sensitive data, and route by model. Per-team limits contain a runaway job, and per-team spend turns a surprise invoice into a dashboard.",
      sourceIds: ["litellm-proxy", "cf-ai-gateway"],
    },
    {
      id: "failover",
      scene: "failover",
      text: "A gateway can also retry elsewhere: when one provider returns errors or slows down, send the request to a second provider or model with an equivalent prompt. Failover only helps if the failure domains are independent, and prompts that were tuned for one model may need a check on the other.",
      sourceIds: ["litellm-proxy", "aws-static"],
    },
    {
      id: "cost",
      text: "The price is a new hop on the critical path. Keep it lean: write usage logs asynchronously so they are not in the request path, run several instances, and fail open or closed on purpose when its own dependencies are down. A gateway that goes down takes every team with it.",
      sourceIds: ["cf-ai-gateway"],
    },
  ],
  challenges: [
    {
      id: "set-up-gateway",
      title: "Set up the gateway",
      brief: "Give twelve teams one key, 99.99% availability, a runaway blast radius of at most 10%, all spend attributed, and no more than 10 ms of added latency.",
      line: { speaker: "rao", line: "I want the control without making every call slower." },
      widget: { id: "gateway-lab", config: GW_CHALLENGE },
      conditions: [
        { metric: "keysExposed", op: "<=", value: 1, label: "One place holds the provider key" },
        { metric: "availability", op: ">=", value: 0.9999, label: "Availability at least 99.99%" },
        { metric: "blastRadius", op: "<=", value: 0.1, label: "A runaway affects at most 10% of teams" },
        { metric: "attributedSpend", op: ">=", value: 1, label: "All spend attributed to a team" },
        { metric: "addedMs", op: "<=", value: 10, label: "At most 10 ms added" },
      ],
      stars: [],
      hints: ["Which toggle puts the key in one place?", "Logging in the request path costs 12 ms.", "Failover needs the gateway on first."],
    },
  ],
  explainBack: {
    prompt: "Explain what an LLM gateway gives you and what it costs.",
    rubric: [
      { id: "central", criterion: "One place holds the provider key and every call passes through it, so keys, rotation and policy are central", keyIdea: "one door" },
      { id: "policy", criterion: "Per-team attribution, limits and budgets contain runaways and explain the bill; failover raises availability when failures are independent", keyIdea: "policy and failover" },
      { id: "cost", criterion: "It is one more hop and a single point of failure, so keep it lean, log asynchronously and run it redundantly", keyIdea: "the hop has a price" },
    ],
    exemplar:
      "A gateway is a proxy that all teams call instead of the provider. It holds the one key and so makes rotation, attribution, per-team limits and budgets possible, which contains runaway jobs and explains the invoice, and it can fail over to a second provider if the two fail independently. The price is another hop and a single point of failure, so I would log asynchronously, run several instances and decide deliberately whether it fails open or closed.",
  },
  reviews: [
    {
      id: "gw-est",
      format: "estimate",
      scenario: "Two independent providers are each up 99.5% of the time. How often are both down, as a percentage of time?",
      unit: "%",
      answer: 0.0025,
      acceptFactor: 1.5,
      breakdown: ["0.5% × 0.5% = 0.0025%", "about 13 seconds a month instead of 3.6 hours"],
      explain: "Independent failures multiply. Correlated ones do not.",
    },
    {
      id: "gw-pick",
      format: "pick-fix",
      scenario: "Twelve teams call the provider directly, and the invoice is hard to explain. What is the first fix?",
      options: [
        { id: "a", label: "Put a gateway in front, issue each team its own token, and log usage per team" },
        { id: "b", label: "Ask each team to report its own usage" },
        { id: "c", label: "Negotiate a lower price" },
        { id: "d", label: "Move to a cheaper model for everyone" },
      ],
      answer: "a",
      explain: "Attribution needs a single point every call passes through. Everything else follows from that.",
    },
    {
      id: "gw-order",
      format: "order",
      scenario: "Order these gateway setups by added latency, highest first.",
      items: [
        { id: "sync", label: "Gateway with synchronous usage logging" },
        { id: "async", label: "Gateway with asynchronous logging, limits and failover" },
        { id: "bare", label: "No gateway at all" },
      ],
      answer: ["sync", "async", "bare"],
      explain: "18 ms, 7 ms and 0 ms in the lab: logging in the request path is the expensive choice.",
    },
    {
      id: "gw-graph",
      format: "predict-graph",
      scenario: "As the number of teams sharing one provider key grows with no limits, how does the share of teams hit by one runaway job change?",
      xLabel: "teams →",
      yLabel: "teams affected",
      options: [
        { id: "all", label: "Stays at everyone, 100%", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "fall", label: "Falls as the pool gets bigger", points: [100, 60, 40, 30, 22, 17, 14, 12] },
        { id: "one", label: "Is always 1 team", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "all",
      explain: "The limit is shared, so whoever consumes it starves everyone. Per-team limits cut it to one team.",
    },
    {
      id: "gw-flaw",
      format: "spot-flaw",
      scenario: "A gateway design: every request writes a usage record to the database before it is forwarded to the provider. Tap the problem.",
      diagram: {
        nodes: [
          { id: "app", label: "team services", kind: "client", col: 0, row: 1 },
          { id: "gw", label: "gateway", kind: "server", col: 1, row: 1 },
          { id: "db", label: "usage database", kind: "db", col: 2, row: 0 },
          { id: "prov", label: "model provider", kind: "external", col: 2, row: 2 },
        ],
        edges: [
          { from: "app", to: "gw" },
          { from: "gw", to: "db" },
          { from: "gw", to: "prov" },
        ],
      },
      answer: "gw->db",
      explain: "A synchronous write puts the database on the critical path: its slowness or outage slows or stops every model call. Log asynchronously.",
    },
    {
      id: "gw-explain",
      format: "explain",
      scenario: "In two sentences: why does failover to a second provider not always give you the availability arithmetic suggests?",
      rubric: [
        { id: "indep", criterion: "The arithmetic assumes independent failures, and providers can share a cloud, a region or a dependency, so they fail together" },
        { id: "quality", criterion: "A prompt tuned for one model may behave differently on another, so failing over can trade availability for quality" },
      ],
      exemplar: "The arithmetic assumes the providers fail independently, but they can share a cloud, a region or a dependency and go down together. And a prompt tuned for one model may behave differently on another, so failover can trade quality for availability.",
      explain: "Check independence and test the fallback model.",
    },
  ],
  codex: {
    oneLiner: "A reverse proxy for model APIs: one key, per-team limits and budgets, logging, caching and failover. Keep it lean and redundant.",
    keyNumbers: [
      { label: "Two independent 99.5% providers (lab)", value: "99.9975%", sourceId: "aws-static" },
      { label: "Runaway blast radius with 12 teams and per-team limits", value: "1 in 12", sourceId: "litellm-proxy" },
    ],
    tradeoffs: [
      { choice: "Central gateway", gain: "One key, policy and attribution", cost: "An extra hop and a single point of failure" },
      { choice: "Synchronous logging", gain: "Never loses a record", cost: "12 ms and a dependency on the request path" },
      { choice: "Failover", gain: "Higher availability", cost: "Quality drift between models" },
    ],
    seenIn: ["LiteLLM, Portkey and Cloudflare AI Gateway.", "Internal 'AI platform' teams at most larger companies."],
    interviewAngle: "Say: 'one door for keys, attribution, limits, caching and failover, with async logging and redundant instances so it is not the weak link'.",
    aws: [{ concept: "Managed LLM gateway", service: "Amazon Bedrock with API Gateway or a LiteLLM deployment" }],
    replay: { id: "gateway-lab", config: GW, scene: "limits" },
  },
  interview: [
    "Why put a gateway in front of an LLM provider?",
    "How would you stop one team's job from using the whole rate limit?",
    "What are the downsides of a gateway?",
  ],
  deeper: [
    {
      title: "Fail open or fail closed",
      body: "When the gateway's own dependencies fail, decide what happens. If the limit store is down, failing open lets calls through unmetered, and failing closed stops everything. Metering can fail open for a short while and be reconciled later, while a content filter should usually fail closed.",
      sourceIds: ["litellm-proxy"],
    },
  ],
  honestPhysics: [
    "Twelve teams, one provider with 99.5% availability. A gateway holds one key, applies per-team limits so a runaway affects 1 team in 12, attributes spend when it logs, and fails over to a second provider: two independent 99.5% providers give 99.9975%.",
    "The gateway adds about 4 ms of its own hop. Logging in the request path adds 12 ms, asynchronously 1 ms. Limits and failover add 1 ms each. Provider failures are treated as independent, which they only partly are.",
  ],
  sources: [LITELLM, CF, AWS_STATIC],
  verify: [
    { id: "no-gw", claim: "Without a gateway twelve teams hold the key and none of the spend is attributed", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: {}, metric: "keysExposed" }, expect: { min: 12, max: 12 } },
    { id: "avail", claim: "Failover across two independent providers gives 99.9975%", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: { gw: true, failover: true }, metric: "availability" }, expect: { min: 0.99997, max: 0.99998 } },
    { id: "blast", claim: "Per-team limits cut a runaway to 1 team in 12", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: { gw: true, limits: true }, metric: "blastRadius" }, expect: { min: 0.08, max: 0.09 } },
    { id: "sync", claim: "Synchronous logging adds 18 ms", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: { gw: true, failover: true, limits: true, logging: "sync" }, metric: "addedMs" }, expect: { min: 17, max: 19 } },
    { id: "async", claim: "Asynchronous logging keeps it to 7 ms", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: { gw: true, failover: true, limits: true, logging: "async" }, metric: "addedMs" }, expect: { min: 6, max: 8 } },
    { id: "attr", claim: "Logging attributes all spend to a team", run: "lab", params: { model: "gateway-lab", config: GW_CHALLENGE, values: { gw: true, logging: "async" }, metric: "attributedSpend" }, expect: { min: 1, max: 1 } },
  ],
});
