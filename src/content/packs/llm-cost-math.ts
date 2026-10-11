import { definePack } from "../define";

export const COST = { start: { cachedShare: 0, small: 0, batch: false } };
export const COST_CHALLENGE = { lockLoad: true, requests: 50000, inTok: 3000, outTok: 400, hide: ["batch"], start: { cachedShare: 0, small: 0, batch: false } };

const PRICING = { id: "anthropic-pricing", title: "Anthropic: Claude API pricing (input and output priced separately; this lesson uses a reference sheet)", url: "https://platform.claude.com/docs/en/about-claude/pricing" };
const CACHING = { id: "anthropic-prompt-caching", title: "Anthropic docs: Prompt caching (cache writes cost more than input, cache reads cost a fraction)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const BATCH = { id: "anthropic-batch", title: "Anthropic docs: Batch processing (asynchronous requests at a discount)", url: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing" };

export default definePack({
  id: "llm-cost-math",
  title: "LLM Cost Math",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "Finance · AI line item", detail: "projected $15,000/month at launch, $90,000 at 6× traffic" },
    lines: [
      { speaker: "rao", line: "The AI line is the fastest growing number on my sheet. Give me a formula, and then give me three ways to make it smaller." },
      { speaker: "meera", line: "It is requests, times tokens, times price. Each of those has a lever, and some levers are free." },
    ],
  },
  predictions: [
    {
      id: "monthly",
      kind: "numeric",
      prompt: "A feature makes 50,000 requests a day, each sending 3,000 input tokens and getting 400 output tokens back. The large model costs $2 per million input tokens and $10 per million output. About how much a month?",
      unit: "$",
      min: 500,
      max: 200000,
      log: true,
      answer: 15000,
      tolerance: 1.4,
      observe: "cost-moved",
      reveal: {
        text: "Per request: 3,000 input tokens cost $0.006 and 400 output tokens cost $0.004, so $0.01. Times 50,000 requests is $500 a day, or $15,000 over 30 days. Output is under 15% of the tokens but 40% of the bill.",
        derived: true,
        line: { speaker: "rao", line: "One cent a request is nothing, until you multiply it by us." },
      },
    },
  ],
  widget: { id: "cost-lab", config: COST },
  mechanism: [
    {
      id: "formula",
      scene: "meter",
      text: "LLM cost is requests times tokens times price, with input and output priced separately. Output tokens usually cost several times as much as input tokens, so a long answer can cost more than a long prompt. Write the formula down and put real numbers in it.",
      sourceIds: ["anthropic-pricing"],
    },
    {
      id: "cache",
      scene: "cache",
      text: "Prompt caching lets you pay a fraction for a repeated prefix. Writing a prefix to the cache costs a premium (1.25 times input in the lesson's reference sheet) and reading it costs a tenth. If most of each prompt is the same instructions and documents, caching cuts the input bill sharply.",
      sourceIds: ["anthropic-prompt-caching"],
    },
    {
      id: "route",
      scene: "route",
      text: "Not every request needs the best model. Routing sends easy requests to a smaller, cheaper model and keeps the large one for hard cases. A classifier or a simple rule decides, and you check quality on a labelled set before and after.",
      sourceIds: ["anthropic-pricing"],
    },
    {
      id: "batch",
      text: "Work that can wait can be batched. Batch APIs process requests asynchronously within a day at about half the price. Nightly summaries, classification of a backlog, and evaluations are good candidates; a user waiting for an answer is not.",
      sourceIds: ["anthropic-batch"],
    },
  ],
  challenges: [
    {
      id: "budget",
      title: "Fit the budget",
      brief: "The assistant handles 50,000 requests a day, 3,000 input tokens and 400 output each, on the large model at $15,000 a month. Requests are interactive, so no batching. Use prompt caching and routing to bring the bill to $7,000 a month or less.",
      line: { speaker: "rao", line: "Show me the formula, and the line where quality does not suffer." },
      widget: { id: "cost-lab", config: COST_CHALLENGE },
      conditions: [{ metric: "monthlyUsd", op: "<=", value: 7000, label: "At most $7,000 a month" }],
      stars: [{ metric: "monthlyUsd", op: "<=", value: 5000, label: "At most $5,000 a month" }],
      hints: [
        "Where is the money going: input tokens or output tokens?",
        "Most of each prompt repeats. How much could be a cached prefix?",
        "Which share of requests would a smaller model handle as well as the large one?",
      ],
    },
  ],
  explainBack: {
    prompt: "Walk through how you estimate the monthly cost of an LLM feature and three ways to reduce it.",
    rubric: [
      { id: "formula", criterion: "Cost = requests × (input tokens × input price + output tokens × output price), noting that output costs more per token", keyIdea: "requests × tokens × price" },
      { id: "levers", criterion: "Names levers: prompt caching of stable prefixes, routing easy requests to a smaller model, batching non-urgent work, shorter prompts and outputs", keyIdea: "cache, route, batch, shorten" },
      { id: "quality", criterion: "Checks quality on a test set when cutting cost, since cheaper options can be worse", keyIdea: "measure quality when cutting" },
    ],
    exemplar:
      "I multiply requests by the tokens per request and the price, counting input and output separately because output costs several times more per token. To cut it I would cache the repeated prompt prefix, route easy requests to a smaller model, batch work that can wait for half price, and trim prompts and answers. Each change gets checked on a labelled test set so I know the quality did not drop.",
  },
  reviews: [
    {
      id: "lc-est-req",
      format: "estimate",
      scenario: "A request sends 2,000 input tokens and gets 500 output tokens back. Input costs $2 per million tokens and output $10 per million. About how many dollars per request?",
      unit: "$",
      answer: 0.009,
      acceptFactor: 1.2,
      breakdown: ["Input: 2,000 ÷ 1,000,000 × $2 = $0.004", "Output: 500 ÷ 1,000,000 × $10 = $0.005", "Total = $0.009"],
      explain: "Half the cost sits in a quarter of the tokens. Output is where length control pays.",
    },
    {
      id: "lc-est-month",
      format: "estimate",
      scenario: "A feature costs $0.009 per request and serves 100,000 requests a day. About how many dollars a month?",
      unit: "$",
      answer: 27000,
      acceptFactor: 1.15,
      breakdown: ["$0.009 × 100,000 = $900 a day", "× 30 days", "= $27,000"],
      explain: "A cent per request looks harmless until you multiply by the traffic.",
    },
    {
      id: "lc-pick",
      format: "pick-fix",
      scenario: "A summarisation job runs overnight on 500,000 documents and nobody needs the results until morning. Which option cuts its bill most without hurting quality?",
      options: [
        { id: "a", label: "Run it through the batch API at the discounted price" },
        { id: "b", label: "Run it through the real-time API with higher concurrency" },
        { id: "c", label: "Switch to a much smaller model without testing" },
        { id: "d", label: "Lower the temperature" },
      ],
      answer: "a",
      explain: "Work that can wait for a day qualifies for the batch discount with no quality change. Temperature does not affect cost.",
    },
    {
      id: "lc-order",
      format: "order",
      scenario: "Order these by monthly cost for the same workload, cheapest first.",
      items: [
        { id: "all", label: "Caching, routing, and batching together" },
        { id: "cr", label: "Caching and routing" },
        { id: "cache", label: "Caching only" },
        { id: "none", label: "No optimisation" },
      ],
      answer: ["all", "cr", "cache", "none"],
      explain: "Each lever reduces a different part of the bill, so they stack.",
    },
    {
      id: "lc-flaw",
      format: "spot-flaw",
      scenario: "A prompt sends the full 20-page policy document with every request, though only the final question changes, and the team does not use prompt caching. Tap the part that costs the most.",
      diagram: {
        nodes: [
          { id: "app", label: "app", kind: "server", col: 0, row: 1 },
          { id: "prompt", label: "prompt: 18,000-token policy + 40-token question, uncached", kind: "llm", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "prompt" }],
      },
      answer: "prompt",
      explain: "The same 18,000 tokens are paid at full price on every call. A cached prefix pays a tenth for the repeats.",
    },
    {
      id: "lc-explain",
      format: "explain",
      scenario: "In two sentences: why can reducing output length cut the bill more than reducing input length?",
      rubric: [
        { id: "price", criterion: "Output tokens cost several times as much per token as input tokens" },
        { id: "share", criterion: "So a modest number of output tokens can be a large share of the cost" },
      ],
      exemplar: "Output tokens are priced several times higher than input tokens. A few hundred output tokens can therefore cost as much as thousands of input tokens.",
      explain: "Price per token is not equal across directions.",
    },
  ],
  codex: {
    oneLiner: "Monthly cost is requests × (input × input price + output × output price). Cache the prefix, route easy work down, batch what can wait.",
    keyNumbers: [
      { label: "Reference prices in the lessons", value: "large model $2 in / $10 out per million tokens; small $1 / $5", sourceId: "anthropic-pricing" },
      { label: "Prompt caching", value: "write 1.25× input, read 0.1× input", sourceId: "anthropic-prompt-caching" },
      { label: "Batch API", value: "about half price for work within a day", sourceId: "anthropic-batch" },
    ],
    tradeoffs: [
      { choice: "Prompt caching", gain: "Repeated prefix costs a tenth", cost: "Needs a stable prefix and a cache write premium" },
      { choice: "Model routing", gain: "Cheap model for easy requests", cost: "A router to build and quality to monitor" },
      { choice: "Batching", gain: "Half price", cost: "Results come later, so it suits only non-interactive work" },
    ],
    seenIn: ["Cost dashboards by model and feature.", "Prompt-caching hit rates in billing reports."],
    interviewAngle: "Do the arithmetic aloud: 'requests × tokens × price, split input and output, then cache, route, and batch, with a quality check on each.'",
    aws: [{ concept: "Token pricing", service: "Amazon Bedrock on-demand and batch inference pricing" }],
    replay: { id: "cost-lab", config: COST, scene: "meter" },
  },
  interview: [
    "How do you estimate the cost of an LLM feature before building it?",
    "Which levers reduce LLM cost most, and what does each risk?",
    "Why does output length matter so much for cost?",
  ],
  deeper: [
    {
      title: "Cost per task, not per token",
      body: "Token prices are the input to a better number: cost per successful task. A cheaper model that needs two attempts, or a longer prompt that raises accuracy, can change the answer. Track cost alongside a quality metric for the whole workflow, including retries and tool calls, before declaring one setup cheaper.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Prices are the lesson's reference sheet and change over time. Check current prices before budgeting for real.",
    "Prompt caching reads cost 0.1× and writes 1.25× the input price; the lab assumes 95% of cached-prefix tokens are reads.",
    "Routing sends a share of requests to a small model at half the large model's price, assuming it handles them as well. That assumption must be tested.",
  ],
  sources: [PRICING, CACHING, BATCH],
  verify: [
    { id: "base", claim: "The base feature costs about $15,000 a month", run: "lab", params: { model: "cost-lab", config: COST_CHALLENGE, values: {}, metric: "monthlyUsd" }, expect: { min: 14500, max: 15500 } },
    { id: "per", claim: "That is about a cent per request", run: "lab", params: { model: "cost-lab", config: COST_CHALLENGE, values: {}, metric: "perRequestUsd" }, expect: { min: 0.0095, max: 0.0105 } },
    { id: "cache-only", claim: "Caching alone is not enough for $7,000", run: "lab", params: { model: "cost-lab", config: COST_CHALLENGE, values: { cachedShare: 0.7 }, metric: "monthlyUsd" }, expect: { min: 7000 } },
    { id: "both", claim: "Caching 70% of the prompt and routing 60% of requests fits under $7,000", run: "lab", params: { model: "cost-lab", config: COST_CHALLENGE, values: { cachedShare: 0.7, small: 0.6 }, metric: "monthlyUsd" }, expect: { max: 7000 } },
    { id: "star", claim: "Caching 90% and routing 80% gets under $5,000", run: "lab", params: { model: "cost-lab", config: COST_CHALLENGE, values: { cachedShare: 0.9, small: 0.8 }, metric: "monthlyUsd" }, expect: { max: 5000 } },
  ],
});
