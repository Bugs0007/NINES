import { definePack } from "../define";

export const PREFIX = { staticTokens: 10000, dynamicTokens: 500, lockTokens: true, start: { perMin: 6, ttl: "5m", dynamicFirst: false } };
export const PREFIX_CHALLENGE = { staticTokens: 10000, dynamicTokens: 500, lockTokens: true, start: { perMin: 0.05, ttl: "5m", dynamicFirst: true } };

const CACHING = { id: "anthropic-prompt-caching", title: "Anthropic docs: Prompt caching (prefix match, 5-minute and 1-hour lifetimes, write and read pricing)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const PRICING = { id: "anthropic-pricing", title: "Anthropic: Claude API pricing (cache writes and reads)", url: "https://platform.claude.com/docs/en/about-claude/pricing" };
const VLLM = { id: "vllm-2023", title: "W. Kwon et al. (2023), Efficient Memory Management for LLM Serving with PagedAttention (KV cache and prefix sharing), SOSP", url: "https://arxiv.org/abs/2309.06180" };

export default definePack({
  id: "prompt-caching",
  title: "Prompt Caching",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "Contract Q&A · invoice", detail: "92% of input tokens are the same contract text, billed every call" },
    lines: [
      { speaker: "rao", line: "Ninety-two percent of what we send is the same ten thousand tokens of contract, and we pay full price for them every time." },
      { speaker: "meera", line: "The provider can remember a prefix it has already read. You have to send it in a shape that lets it match." },
    ],
  },
  predictions: [
    {
      id: "timestamp",
      kind: "choice",
      prompt: "Your prompt starts with 'Current time: 14:03:22', followed by 10,000 tokens of fixed instructions and a short question. Prompt caching is enabled. What is the cache hit rate?",
      options: [
        { id: "high", label: "About 90%, the instructions are identical" },
        { id: "half", label: "About 50%" },
        { id: "zero", label: "Zero: the prefix changes every request, so nothing matches" },
        { id: "depends", label: "Depends on the model" },
      ],
      answer: "zero",
      observe: "broken",
      reveal: {
        text: "Caching works on exact prefix matches. The timestamp at the start makes every request's prefix different from the last, so nothing before the first difference is reusable. Moving it after the stable text restores the hit.",
        sourceIds: ["anthropic-prompt-caching"],
        line: { speaker: "meera", line: "The cache matches from the first token. One different character at the front spoils everything behind it." },
      },
    },
  ],
  widget: { id: "prefix-lab", config: PREFIX },
  mechanism: [
    {
      id: "prefix",
      scene: "stable",
      text: "When the model reads a prompt it builds internal state for each token. If the next request starts with the same tokens, the provider can reuse that state instead of recomputing it, so the matched prefix is cheaper to read and quicker to start. The match is exact and runs from the first token.",
      sourceIds: ["anthropic-prompt-caching", "vllm-2023"],
    },
    {
      id: "order",
      scene: "order",
      text: "So order the prompt from most stable to least: system instructions and tools first, then the documents, then examples, then the changing user question last. A single changing value early in the prompt, such as a timestamp or a user id, invalidates everything after it.",
      sourceIds: ["anthropic-prompt-caching"],
    },
    {
      id: "ttl",
      scene: "ttl",
      text: "Cache entries expire. The default lifetime is 5 minutes and each hit refreshes it, so a prefix used every few seconds stays warm. A prefix used once every ten minutes misses each time, and writing it costs a premium, so a 1-hour option with a larger write premium can pay for rarely used prefixes.",
      sourceIds: ["anthropic-prompt-caching", "anthropic-pricing"],
    },
    {
      id: "math",
      text: "In the reference prices a cache read costs a tenth of normal input and a 5-minute write costs 1.25 times. If the hit rate is high the saving approaches the fraction of the prompt that is cached; if it is low, caching can cost more than not caching, so measure the hit rate.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "contract-qa",
      title: "Make the cache hit",
      brief: "A contract Q&A prompt has 10,000 stable tokens and 500 that change. The prompt currently begins with a timestamp, and requests arrive about once every 20 minutes. Fix the layout and the cache lifetime so a request costs at most 0.6 cents.",
      line: { speaker: "kabir", line: "Questions come in bursts that slow to a trickle. I am not sure which setting matters." },
      widget: { id: "prefix-lab", config: PREFIX_CHALLENGE },
      conditions: [{ metric: "costPerRequest", op: "<=", value: 0.006, label: "At most $0.006 per request" }],
      stars: [{ metric: "savingsPct", op: ">=", value: 75, label: "Saves at least 75%" }],
      hints: [
        "What does the changing value at the front of the prompt do to the hit rate?",
        "With one request every 20 minutes, how many requests arrive within the 5-minute lifetime?",
        "A longer lifetime costs more to write. Is that worth it at this request rate?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how prompt caching works, how to lay out a prompt for it, and when it does not pay.",
    rubric: [
      { id: "prefix", criterion: "The provider reuses the processed state of an identical prefix, so cached tokens are cheaper and quicker", keyIdea: "exact prefix reuse" },
      { id: "layout", criterion: "Put stable content first and anything that changes last, since a change early invalidates everything after it", keyIdea: "stable first" },
      { id: "when", criterion: "Cache entries expire, so rarely used prefixes miss; caching pays when requests are frequent enough that the hit rate is high", keyIdea: "expiry and hit rate" },
    ],
    exemplar:
      "The provider can reuse the processed state of a prefix it has already read, so identical leading tokens are cheaper and start faster, but only on an exact match from the first token. So I order the prompt from stable to changing, with system text and documents first and the question last, and never put a timestamp at the front. Entries expire, so caching only pays when requests arrive often enough for a high hit rate; otherwise the write premium makes it cost more.",
  },
  reviews: [
    {
      id: "pc-est-read",
      format: "estimate",
      scenario: "A prompt has 10,000 cached tokens at $2 per million input tokens, with cache reads at 0.1 times the price. About how many dollars do the cached tokens cost per request on a hit?",
      unit: "$",
      answer: 0.002,
      acceptFactor: 1.2,
      breakdown: ["10,000 ÷ 1,000,000 × $2 = $0.02 at full price", "× 0.1", "= $0.002"],
      explain: "A tenth of $0.02, so $0.002 instead of $0.02. The saving is nine tenths of the cached part.",
    },
    {
      id: "pc-est-hit",
      format: "estimate",
      scenario: "Requests with the same prefix arrive once a minute. The cache lifetime is 5 minutes and each hit refreshes it. Roughly what share of requests hit, using 1 − e^(−rate × lifetime)?",
      unit: "%",
      answer: 99,
      acceptFactor: 1.05,
      breakdown: ["rate × lifetime = 1/min × 5 min = 5", "1 − e^(−5) = 0.993", "≈ 99%"],
      explain: "When several requests arrive per lifetime, nearly all of them find a warm cache.",
    },
    {
      id: "pc-pick",
      format: "pick-fix",
      scenario: "A prompt puts the user's name and the current date at the top, then 6,000 tokens of fixed policy, then the question. Cache hits are near zero. What do you change?",
      options: [
        { id: "a", label: "Move the fixed policy first, and put the name, date, and question after it" },
        { id: "b", label: "Shorten the policy" },
        { id: "c", label: "Increase the temperature" },
        { id: "d", label: "Remove the policy" },
      ],
      answer: "a",
      explain: "The cache matches from the first token, so volatile values at the top break the match. Stable text first, volatile text last.",
    },
    {
      id: "pc-order",
      format: "order",
      scenario: "Order these prompt layouts by cache hit rate, highest first, at a steady request rate.",
      items: [
        { id: "good", label: "System, tools, documents, then the question" },
        { id: "late", label: "System, tools, a timestamp, then the documents and question" },
        { id: "early", label: "Timestamp, then system, tools, documents, question" },
      ],
      answer: ["good", "late", "early"],
      explain: "A volatile value costs you everything after it. The later it sits, the more of the prompt can still match.",
    },
    {
      id: "pc-graph",
      format: "predict-graph",
      scenario: "Keep the cache lifetime at 5 minutes and slow requests down from 10 a minute to one every 30 minutes. How does the hit rate change?",
      xLabel: "requests getting rarer →",
      yLabel: "hit rate",
      options: [
        { id: "flat", label: "Stays high", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "fall", label: "Stays near 100%, then falls steeply toward zero", points: [8, 8, 7.9, 7.5, 6, 3.5, 1.5, 0.5] },
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "fall",
      explain: "While several requests arrive per lifetime the cache stays warm. Once gaps are longer than the lifetime, most requests find it expired.",
    },
    {
      id: "pc-flaw",
      format: "spot-flaw",
      scenario: "A team enables caching on a prompt used a few times a day and finds the bill went up. Tap the cost they did not account for.",
      diagram: {
        nodes: [
          { id: "app", label: "app · 3 requests a day with this prefix", kind: "server", col: 0, row: 1 },
          { id: "cache", label: "cache write premium on every request, expired before the next", kind: "cache", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "cache" }],
      },
      answer: "cache",
      explain: "Every request misses and pays the write premium for nothing. Caching pays only when the hit rate is high; with sparse traffic turn it off or use a longer lifetime if it is worth it.",
    },
    {
      id: "pc-explain",
      format: "explain",
      scenario: "In two sentences: why must the cacheable part of a prompt come first?",
      rubric: [
        { id: "prefix", criterion: "The cache matches an identical prefix from the first token" },
        { id: "volatile", criterion: "Anything that differs breaks the match for all tokens after it, so volatile content must come last" },
      ],
      exemplar: "The cache can only reuse a prefix that is identical from the first token. Any difference breaks the match for everything after it, so changing content has to go at the end.",
      explain: "The cache reads left to right and stops at the first surprise.",
    },
  ],
  codex: {
    oneLiner: "Prompt caching reuses an identical prefix at a fraction of the price. Put stable text first, volatile last, and watch the hit rate.",
    keyNumbers: [
      { label: "Cache read", value: "0.1× input price", sourceId: "anthropic-pricing" },
      { label: "Cache write", value: "1.25× input (5 min) or 2× (1 hour)", sourceId: "anthropic-pricing" },
      { label: "Default lifetime", value: "5 minutes, refreshed on each hit", sourceId: "anthropic-prompt-caching" },
    ],
    tradeoffs: [
      { choice: "Cache a long stable prefix", gain: "Large saving in cost and time to first token", cost: "Needs exact prefix stability and enough traffic to keep it warm" },
      { choice: "1-hour lifetime", gain: "Survives sparse traffic", cost: "Higher write premium" },
    ],
    seenIn: ["Long system prompts and document Q&A with a shared prefix.", "Billing reports showing cache read and write tokens."],
    interviewAngle: "Cite the layout and the hit rate: 'static instructions and documents first, the question last, and I track cache hit rate because a miss costs a write premium.'",
    aws: [{ concept: "Prompt caching", service: "Amazon Bedrock prompt caching (cache checkpoints)" }],
    replay: { id: "prefix-lab", config: PREFIX, scene: "order" },
  },
  interview: [
    "How does prompt caching work, and how do you structure a prompt to use it?",
    "When does prompt caching not pay off?",
    "What would you monitor to know it is working?",
  ],
  deeper: [
    {
      title: "What is actually cached",
      body: "Transformers keep, for every token already read, key and value vectors used by later attention; that KV cache is what the provider stores for a prefix. Reusing it skips the compute for those tokens, which is why a cached prefix also starts sooner. Serving systems share it across requests that begin identically, which is the idea behind prefix caching in systems like vLLM.",
      sourceIds: ["vllm-2023"],
    },
  ],
  honestPhysics: [
    "Cache reads cost 0.1 times the input price, a 5-minute write 1.25 times, and a 1-hour write 2 times, as in the lesson's reference sheet. Check the provider's current rules.",
    "Hit rate for Poisson requests is 1 − e^(−rate × lifetime), and each hit refreshes the entry. Real traffic is burstier.",
    "Any change in the prefix, including a different order of tool definitions, can break a match.",
  ],
  sources: [CACHING, PRICING, VLLM],
  verify: [
    { id: "broken", claim: "A timestamp at the front gives no cache hits", run: "lab", params: { model: "prefix-lab", config: PREFIX_CHALLENGE, values: {}, metric: "hitRate" }, expect: { max: 0 } },
    { id: "fix-order", claim: "Fixing the order alone still leaves rare traffic missing a 5-minute cache", run: "lab", params: { model: "prefix-lab", config: PREFIX_CHALLENGE, values: { dynamicFirst: false }, metric: "costPerRequest" }, expect: { min: 0.006 } },
    { id: "win", claim: "A stable prefix with a 1-hour lifetime costs under 0.6 cents", run: "lab", params: { model: "prefix-lab", config: PREFIX_CHALLENGE, values: { dynamicFirst: false, ttl: "1h" }, metric: "costPerRequest" }, expect: { max: 0.006 } },
    { id: "star", claim: "…saving over 75%", run: "lab", params: { model: "prefix-lab", config: PREFIX_CHALLENGE, values: { dynamicFirst: false, ttl: "1h" }, metric: "savingsPct" }, expect: { min: 75 } },
    { id: "busy", claim: "At 6 requests a minute the 5-minute cache hits almost always", run: "lab", params: { model: "prefix-lab", config: PREFIX, values: {}, metric: "hitRate" }, expect: { min: 0.99 } },
  ],
});
