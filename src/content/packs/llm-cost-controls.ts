import { definePack } from "../define";

export const BU = { start: { cap: 4000, quota: 100, route: 0.4, cache: true } };
export const BU_CHALLENGE = { start: { cap: 4000, quota: 5000, route: 0, cache: false } };

const ANTHROPIC_PRICING = { id: "anthropic-pricing", title: "Anthropic: pricing for Claude models (input and output tokens priced separately; batch discount)", url: "https://www.anthropic.com/pricing" };
const PROMPT_CACHE = { id: "anthropic-prompt-caching", title: "Claude docs: Prompt caching (cached reads at a fraction of input price)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const FINOPS = { id: "finops", title: "FinOps Foundation: Framework (inform, optimise, operate)", url: "https://www.finops.org/framework/" };

export default definePack({
  id: "llm-cost-controls",
  title: "LLM Cost Controls",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "spend alert · $22,400 projected, budget $8,000", detail: "top 1% of users account for 40% of tokens" },
    lines: [
      { speaker: "kabir", line: "We launched the feature and the projected bill is three times the budget. A handful of accounts, probably scripts, are most of it." },
      { speaker: "meera", line: "Cost is a distribution. A few heavy users and a long tail of long answers set it, so controls go where the tail is." },
    ],
  },
  predictions: [
    {
      id: "uncontrolled",
      kind: "choice",
      prompt: "2,000 users make a median of 8 requests a day, with a 99th percentile of 400. Each request sends 1,500 tokens and gets about 490 back, at $3 and $15 per million. What is the monthly bill with no controls?",
      options: [
        { id: "2", label: "About $2,200" },
        { id: "22", label: "About $22,000" },
        { id: "220", label: "About $220,000" },
      ],
      answer: "22",
      observe: "over-budget",
      reveal: {
        text: "The average user makes 33 requests a day, because the heavy tail pulls the mean far above the median of 8. Each request costs about $0.012, so 2,000 × 33 × $0.012 × 30 is about $22,400. Budgeting from the median would have been wrong by a factor of four.",
        derived: true,
        line: { speaker: "rao", line: "The mean is not the median. Bills are paid on the mean." },
      },
    },
    {
      id: "quota",
      kind: "choice",
      prompt: "You cap every user at 50 requests a day. Spend falls to about $11,000. Users above 100 a day are probably automation. What share of ordinary users' requests gets refused?",
      options: [
        { id: "0", label: "None, only scripts hit the cap" },
        { id: "10", label: "About 10%" },
        { id: "40", label: "About 40%" },
      ],
      answer: "10",
      observe: "choked",
      reveal: {
        text: "Ordinary heavy users, those below 100 requests a day, still exceed 50: 9.8% of legitimate requests are refused. A cap placed under the real tail hurts the customers you built the product for. Set it above ordinary use, near 100 here, where it removes only the automation.",
        derived: true,
        line: { speaker: "meera", line: "Put the limit just above the behaviour you want to keep." },
      },
    },
  ],
  widget: { id: "budget-lab", config: BU },
  mechanism: [
    {
      id: "shape",
      text: "Spend is input tokens times their price plus output tokens times theirs, summed over requests, and both factors are long-tailed. A few users send most requests, and a few answers run very long. Start by measuring the distribution: spend per user, per feature and per request, and look at the top percentile, not the average.",
      sourceIds: ["anthropic-pricing", "finops"],
    },
    {
      id: "caps",
      scene: "cap",
      text: "Cap the tail of each request: a maximum on output tokens, a limit on context size and a cap on tool-loop steps. Output tokens cost several times input tokens, so a cap on long answers has outsized effect, at the price of truncating some. Set it above the length most good answers need.",
      sourceIds: ["anthropic-pricing"],
    },
    {
      id: "quota",
      scene: "quota",
      text: "Limit use per user: a daily quota or budget, enforced at the gateway, with alerts before it bites. Set the limit above ordinary use so it removes automation and abuse, and offer a path for legitimate heavy users, such as a higher tier. Also set a global budget with an alarm and a kill switch.",
      sourceIds: ["finops"],
    },
    {
      id: "route",
      scene: "route",
      text: "Then cut the price per request: route easy requests to a small model, cache repeated requests and common prefixes, and use batch interfaces for work that can wait. Each costs something in quality, latency or complexity. Pull the levers that cost least first, and measure quality after each.",
      sourceIds: ["anthropic-pricing", "anthropic-prompt-caching"],
    },
  ],
  challenges: [
    {
      id: "budget-plan",
      title: "Set the controls",
      brief: "Bring the monthly bill to $8,000 or less, with at most 5% of answers truncated, at most 1% of legitimate requests refused, and at most 2.5% quality lost to routing.",
      line: { speaker: "rao", line: "Hit the budget without hurting the people the feature is for." },
      widget: { id: "budget-lab", config: BU_CHALLENGE },
      conditions: [
        { metric: "monthlySpend", op: "<=", value: 8000, label: "Spend at most $8,000 a month" },
        { metric: "truncatedShare", op: "<=", value: 0.05, label: "At most 5% of answers truncated" },
        { metric: "blockedLegit", op: "<=", value: 0.01, label: "At most 1% of legitimate requests refused" },
        { metric: "qualityLoss", op: "<=", value: 0.025, label: "At most 2.5% quality lost to routing" },
      ],
      stars: [{ metric: "monthlySpend", op: "<=", value: 7300, label: "Spend at most $7,300 a month" }],
      hints: ["Where is the spend concentrated?", "What does a quota below 100 do to ordinary users?", "Which levers have no quality cost?"],
    },
  ],
  explainBack: {
    prompt: "Explain how you would keep an LLM feature's cost under control.",
    rubric: [
      { id: "measure", criterion: "Measure the distribution of spend per user and per request, since a heavy tail sets the bill, not the average", keyIdea: "spend is long-tailed" },
      { id: "limits", criterion: "Cap output length and context, set per-user quotas above ordinary use, and a global budget with alerts", keyIdea: "cap the tail" },
      { id: "price", criterion: "Lower the price per request by routing to small models, caching and batching, measuring quality after each", keyIdea: "cut the unit price carefully" },
    ],
    exemplar:
      "I would start by measuring the distribution of spend per user and per request, because a heavy tail sets the bill rather than the average. Then I would cap output length and context, set per-user quotas just above ordinary use so they remove automation but not customers, and a global budget with alerts and a kill switch. After that I would lower the price per request by routing easy work to small models, caching and batching, and check quality after each change.",
  },
  reviews: [
    {
      id: "bu-est",
      format: "estimate",
      scenario: "A request sends 1,500 input tokens and returns 490 output tokens, at $3 and $15 per million. What does one request cost, in thousandths of a dollar?",
      unit: "$ per 1,000 requests",
      answer: 11.9,
      acceptFactor: 1.05,
      breakdown: ["1,500 × $3 ÷ 1M = $0.0045", "490 × $15 ÷ 1M = $0.00735", "total $0.01185, about $11.9 per 1,000 requests"],
      explain: "Output tokens are 5 times the price, so they are more than half the cost despite being a third of the tokens.",
    },
    {
      id: "bu-pick",
      format: "pick-fix",
      scenario: "Three accounts, all scripts, make 60% of your requests. What is the best first control?",
      options: [
        { id: "a", label: "A per-user quota and rate limit at the gateway, with alerts when an account approaches it" },
        { id: "b", label: "Move everything to a smaller model" },
        { id: "c", label: "Shorten all answers" },
        { id: "d", label: "Raise prices" },
      ],
      answer: "a",
      explain: "The concentration is in a few accounts. A per-user limit hits them without costing anyone else anything.",
    },
    {
      id: "bu-order",
      format: "order",
      scenario: "Order these controls by monthly spend in the lab, highest first (each alone).",
      items: [
        { id: "none", label: "No controls" },
        { id: "cache", label: "Cache repeated requests" },
        { id: "quota", label: "Quota of 100 requests a day" },
        { id: "route", label: "Route half to the small model" },
      ],
      answer: ["none", "cache", "quota", "route"],
      explain: "$22.4k, $18.3k, $14.6k and $12.3k.",
    },
    {
      id: "bu-graph",
      format: "predict-graph",
      scenario: "As the output-token cap falls from 4,000 to 200, how does the share of answers that get truncated change?",
      xLabel: "cap falls →",
      yLabel: "answers truncated",
      options: [
        { id: "accel", label: "Stays small, then climbs steeply below the typical answer length", points: [0.4, 1, 2, 4, 11, 24, 45, 72] },
        { id: "linear", label: "Rises in a straight line", points: [0, 10, 20, 30, 40, 50, 60, 70] },
        { id: "flat", label: "Stays level", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "accel",
      explain: "Most answers are short, and only the long tail is cut by a high cap. Below the median length, a cap truncates most answers.",
    },
    {
      id: "bu-flaw",
      format: "spot-flaw",
      scenario: "A team sets the monthly budget alert at 100% of budget, delivered by email, and checks the bill at month end. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "use", label: "usage, mostly in a few accounts", kind: "worker", col: 0, row: 1 },
          { id: "alert", label: "alert at 100% of the month's budget", kind: "queue", col: 1, row: 1 },
          { id: "act", label: "someone reads the email", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "use", to: "alert" },
          { from: "alert", to: "act" },
        ],
      },
      answer: "use->alert",
      explain: "A runaway can exceed the whole budget in a day or two. Alert at lower thresholds, per account and per hour, and have an automatic limit or kill switch.",
    },
    {
      id: "bu-explain",
      format: "explain",
      scenario: "In two sentences: why must a per-user quota sit above ordinary use?",
      rubric: [
        { id: "harm", criterion: "A quota below the legitimate tail refuses real customers, who are the people the feature exists for" },
        { id: "target", criterion: "Set just above ordinary use it removes automation and abuse, which is where the extra spend comes from" },
      ],
      exemplar: "A quota below the legitimate tail refuses real customers, the people the feature exists for. Set just above ordinary use it removes automation and abuse, which is where the extra spend comes from.",
      explain: "Find the edge of normal use before you set the limit.",
    },
  ],
  codex: {
    oneLiner: "Spend is long-tailed. Measure the distribution, cap output and context, set quotas above ordinary use, then cut the unit price by routing, caching and batching.",
    keyNumbers: [
      { label: "Mean vs median requests per user (lab)", value: "33 vs 8 per day", sourceId: "finops" },
      { label: "Output vs input token price", value: "5× per token", sourceId: "anthropic-pricing" },
    ],
    tradeoffs: [
      { choice: "Output cap", gain: "Cuts the long tail of cost", cost: "Truncated answers" },
      { choice: "Per-user quota", gain: "Removes automation spend", cost: "Refuses heavy legitimate users if too low" },
      { choice: "Routing and caching", gain: "Lower price per request", cost: "Quality and complexity" },
    ],
    seenIn: ["Gateway budgets and per-key spend limits.", "FinOps practice applied to token spend."],
    interviewAngle: "Say: 'measure the tail, cap output and context, quota above normal use, global budget with alarms, then route, cache and batch'.",
    aws: [{ concept: "Budgets and quotas", service: "AWS Budgets; Bedrock quotas and application inference profiles" }],
    replay: { id: "budget-lab", config: BU, scene: "quota" },
  },
  interview: [
    "How would you control the cost of an LLM feature?",
    "Why are LLM costs hard to forecast?",
    "How do you set a per-user limit?",
  ],
  deeper: [
    {
      title: "Unit economics",
      body: "Express cost as a figure per user, per task or per resolved ticket and compare it with what the feature earns or saves. A rising bill with a falling cost per task is growth, and a flat bill with a rising cost per task is waste. Track both so a cost project is judged against value, not the invoice alone.",
      sourceIds: ["finops"],
    },
  ],
  honestPhysics: [
    "A feature with 2,000 users. Requests per user per day are lognormal with a median of 8 and a 99th percentile of 400. Illustrative prices of $3 per million input tokens and $15 per million output. Each request sends 1,500 tokens in and gets a lognormal answer (median 300, 99th percentile 3,000 tokens).",
    "A cap truncates answers past it. Users above 100 requests a day are treated as automation, so only quotas below 100 refuse real users. Routing a share to a small model at a tenth of the price costs six points of quality on that share. A response cache removes about 18% of calls.",
  ],
  sources: [ANTHROPIC_PRICING, PROMPT_CACHE, FINOPS],
  verify: [
    { id: "base", claim: "With no controls the bill is about $22,400 a month", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: {}, metric: "monthlySpend" }, expect: { min: 22000, max: 22800 } },
    { id: "q50", claim: "A quota of 50 cuts it to about $11,000 and refuses 9.8% of legitimate requests", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { quota: 50 }, metric: "blockedLegit" }, expect: { min: 0.09, max: 0.11 } },
    { id: "q50-spend", claim: "…at $11,300 a month", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { quota: 50 }, metric: "monthlySpend" }, expect: { min: 11000, max: 11600 } },
    { id: "q100", claim: "A quota of 100 refuses no ordinary user", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { quota: 100 }, metric: "blockedLegit" }, expect: { max: 0.001 } },
    { id: "cap", claim: "A 1,000-token cap truncates 11% of answers", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { cap: 1000 }, metric: "truncatedShare" }, expect: { min: 0.1, max: 0.12 } },
    { id: "plan", claim: "A quota near 100, routing 40% and the cache fit the budget", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { cap: 3000, quota: 100, route: 0.4, cache: true }, metric: "monthlySpend" }, expect: { max: 8000 } },
    { id: "plan-q", claim: "…with quality lost within 2.5%", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { cap: 3000, quota: 100, route: 0.4, cache: true }, metric: "qualityLoss" }, expect: { max: 0.025 } },
    { id: "no-route", claim: "Without routing the same plan misses the budget", run: "lab", params: { model: "budget-lab", config: BU_CHALLENGE, values: { cap: 3000, quota: 100, route: 0, cache: true }, metric: "monthlySpend" }, expect: { min: 8000 } },
  ],
});
