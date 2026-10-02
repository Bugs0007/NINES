import { defineBoss } from "../define";

/** Production today: the last 34 turns, three docs, every turn on the Sonnet-class model. */
export const BILL = { variant: "bill", start: { mode: "last", lastN: 34, docs: 3, cache: false, model: "grader" } };

const SRC = {
  promptCaching: { id: "anthropic-prompt-caching", title: "Anthropic docs: Prompt caching (cache writes 1.25×, cache reads 0.1× the base input price)", url: "https://docs.claude.com/en/docs/build-with-claude/prompt-caching" },
  anthropicPricing: { id: "anthropic-pricing", title: "Anthropic: Claude API pricing", url: "https://www.anthropic.com/pricing#api" },
  frugal: { id: "frugalgpt-2023", title: "L. Chen, M. Zaharia, J. Zou (2023), FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance", url: "https://arxiv.org/abs/2305.05176" },
};

export default defineBoss({
  id: "boss-the-bill",
  title: "Boss: The Bill",
  kind: "boss",
  estimatedMinutes: 15,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "Pigeon Copilot · projected monthly invoice", detail: "$107,460 / month" },
    lines: [{ speaker: "rao", line: "One hundred and seven thousand dollars. For a chatbot that forgets peanuts." }],
  },
  intro: [
    { speaker: "rao", line: "Copilot now costs more than the rest of Pigeon combined. Forty-five thousand a month, or it goes." },
    { speaker: "meera", line: "Production re-sends the last 34 turns on every request, all to the big model. Same answers from fewer, cheaper tokens: that's the job." },
    { speaker: "kabir", line: "Also make it faster. Users think it's thinking, but it's just reading." },
  ],
  forecast: {
    metric: "monthly",
    prompt: "Before you ship: what will your policy cost per month at 2,000 conversations a day?",
    unit: "USD/month",
    scale: 1,
    min: 5000,
    max: 200000,
    tolerance: 1.5,
  },
  exercises: ["tokens", "context-windows"],
  challenge: {
    id: "the-bill",
    title: "Cut the bill",
    brief: "2,000 forty-turn conversations a day. Get the bill under $45,000 a month, keep at least 4 of 5 answers right at turn 40, and get the first token out in under a second. The bill stays hidden until you ship: estimate it from the token counts and the price sheet.",
    line: { speaker: "meera", line: "Tokens times price times volume. You don't get to change the volume." },
    widget: { id: "context-tetris", config: BILL },
    conditions: [
      { metric: "monthly", op: "<=", value: 45000, label: "Bill under $45,000/month" },
      { metric: "quality", op: ">=", value: 4, label: "At least 4 of 5 answers at turn 40" },
      { metric: "overflow", op: "==", value: 0, label: "No request exceeds the window" },
      { metric: "ttft", op: "<", value: 1, label: "First token in under 1 second" },
    ],
    stars: [
      { metric: "monthly", op: "<=", value: 30000, label: "Bill under $30,000/month" },
      { metric: "ttft", op: "<", value: 0.5, label: "First token in under 0.5 seconds" },
    ],
    hints: [
      "Of tokens, price, and volume, which can you change, and which change is safe for quality?",
      "Most of every request is identical on every turn. What do tokens the provider has already seen cost?",
      "Only one of the five questions is hard. Does every turn need the expensive model?",
    ],
  },
  debrief: [
    { id: "tokens", text: "Fewer tokens. Production re-sent 34 turns on every request and still lost the allergy. A pinned profile plus the last 6 turns answers the same questions from about half the input.", derived: true },
    { id: "cache", text: "Cheaper tokens. The system prompt, tool definitions, and profile are byte-identical on every turn. Cached, they're read at a tenth of the input price, and the model has less to read before it starts answering.", sourceIds: ["anthropic-prompt-caching"] },
    { id: "router", text: "Cheaper model, where it's safe. Most turns are easy. Sending only the hard ones to the big model cuts the price per token; sending everything to the small one gets the refund-policy question wrong.", sourceIds: ["frugalgpt-2023"] },
    { id: "levers", text: "One lever wasn't enough. Trimming history alone left the bill above $60k. The budget needed fewer tokens and a lower price per token together.", derived: true },
  ],
  outro: { speaker: "rao", line: "Under budget, and it remembers the peanuts. I'm framing this invoice." },
  explainBack: {
    prompt: "Mr. Rao wants to know what you changed and why the bill fell. Explain in three or four sentences.",
    rubric: [
      { id: "formula", criterion: "Cost = tokens per request × price per token × volume, and says which term each change attacked", keyIdea: "tokens × price × volume" },
      { id: "context", criterion: "Cut input tokens with a context policy that keeps the facts the model needs (pinned facts, short window, or summaries)", keyIdea: "fewer tokens, same answers" },
      { id: "price", criterion: "Lowered the price per token with prompt caching of the stable prefix and/or routing easy turns to a cheaper model, and names the quality risk", keyIdea: "cheaper tokens" },
    ],
    exemplar:
      "The bill is tokens per request times price per token times conversations, and we can't change the conversations. I cut tokens by pinning the user's profile and keeping only the last six turns instead of 34, which still answers everything that matters. Then I cut the price: the system prompt and tools are identical every turn, so caching them makes them ten times cheaper, and a router sends only the hard questions to the expensive model.",
  },
  sources: [SRC.promptCaching, SRC.anthropicPricing, SRC.frugal],
  verify: [
    { id: "baseline", claim: "Production (last 34, Sonnet-class, no cache) costs about $107k/month", run: "ctx-eval", params: { config: BILL, policy: BILL.start, metric: "monthly" }, expect: { min: 100000, max: 115000 } },
    { id: "baseline-forgets", claim: "…and still loses the allergy from turn 2", run: "ctx-eval", params: { config: BILL, policy: BILL.start, metric: "fact", fact: "diet" }, expect: { max: 0 } },
    { id: "one-lever", claim: "Trimming history alone stays above $60k", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, model: "grader" }, metric: "monthly" }, expect: { min: 60000 } },
    { id: "pinned-cache", claim: "Pinned + last 6 with caching fits the budget", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, cache: true, model: "grader" }, metric: "monthly" }, expect: { max: 45000 } },
    { id: "fast-loses", claim: "The small model alone gets the hard question wrong", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, cache: true, model: "fast" }, metric: "quality" }, expect: { max: 3 } },
    { id: "star", claim: "Pinned + last 6, cached, routed: under $30k with first token under 0.5s", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, cache: true, model: "router" }, metric: "monthly" }, expect: { max: 30000 } },
    { id: "star-ttft", claim: "…first token under 0.5s", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, cache: true, model: "router" }, metric: "ttftS" }, expect: { max: 0.5 } },
    { id: "star-quality", claim: "…and 4 of 5 answers", run: "ctx-eval", params: { config: BILL, policy: { mode: "pinned", lastN: 6, docs: 3, cache: true, model: "router" }, metric: "quality" }, expect: { min: 4 } },
  ],
});
