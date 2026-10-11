import { definePack } from "../define";

export const SC = { start: { threshold: 0.9, verify: false } };
export const SC_CHALLENGE = { start: { threshold: 0.7, verify: false } };

const GPTCACHE = { id: "gptcache", title: "GPTCache: a semantic cache for LLM queries (embedding similarity lookup)", url: "https://github.com/zilliztech/GPTCache" };
const PROMPT_CACHE = { id: "anthropic-prompt-caching", title: "Claude docs: Prompt caching (exact-prefix reuse, a different technique)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const RECSYS = { id: "sbert", title: "Reimers & Gurevych (2019), Sentence-BERT: sentence embeddings using Siamese BERT networks", url: "https://arxiv.org/abs/1908.10084" };

export default definePack({
  id: "semantic-caching",
  title: "Semantic Caching",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "support · wrong answer served from cache", detail: "'cancel my subscription' returned 'pause my subscription'" },
    lines: [
      { speaker: "kabir", line: "We cache answers by meaning so a rephrased question skips the model. Last week it told a customer how to pause when they asked to cancel." },
      { speaker: "meera", line: "A semantic cache is cache-aside where the key is a similarity score. The threshold is the whole design." },
    ],
  },
  predictions: [
    {
      id: "loose",
      kind: "choice",
      prompt: "35% of requests have an equivalent cached request (similarity about 0.92). The rest have only a different question nearby (about 0.80). You set the threshold to 0.70 to catch every paraphrase. What share of all requests get a wrong cached answer?",
      options: [
        { id: "2", label: "About 2%" },
        { id: "20", label: "About 20%" },
        { id: "60", label: "About 60%" },
      ],
      answer: "60",
      observe: "wrong-answers",
      reveal: {
        text: "At 0.70 nearly every near miss clears the bar: 62% of all requests get an answer to a different question. A threshold below where unrelated questions score turns the cache into a random answer generator. Where the two groups overlap, no setting is clean.",
        derived: true,
        line: { speaker: "rao", line: "Pick the threshold from the data, not from how it feels." },
      },
    },
    {
      id: "tight",
      kind: "choice",
      prompt: "You raise the threshold to 0.97 to be safe. About what share of requests now hit the cache?",
      options: [
        { id: "35", label: "Still about 35%" },
        { id: "15", label: "About 15%" },
        { id: "4", label: "About 4%" },
      ],
      answer: "4",
      observe: "no-hits",
      reveal: {
        text: "Paraphrases cluster around 0.92 with a spread of 0.04, so only the closest few clear 0.97: 3.7% of requests. The cache is safe and nearly useless. The way out is a second check, not a stricter number.",
        derived: true,
        line: { speaker: "meera", line: "Safe and useless is still a failure." },
      },
    },
  ],
  widget: { id: "semcache-lab", config: SC },
  mechanism: [
    {
      id: "how",
      text: "An exact cache matches identical text, which misses most rephrasings. A semantic cache embeds each request and looks up the nearest cached request by cosine similarity. If the similarity is above a threshold, it returns the stored answer without calling the model. It is cache-aside with a fuzzy key.",
      sourceIds: ["gptcache", "sbert"],
    },
    {
      id: "threshold",
      scene: "loose",
      text: "The threshold balances two errors. Too low, and different questions match, so users get the wrong answer with total confidence. Too high, and few paraphrases match, so the cache saves little. The two groups of scores overlap, so no single number removes the wrong hits without also removing good ones.",
      sourceIds: ["gptcache"],
    },
    {
      id: "verify",
      scene: "verify",
      text: "Add a cheap check before serving. A small model or a rule compares the new request with the cached one, or checks that the stored answer fits the question, and rejects poor matches. It costs a little per candidate and some delay but removes most wrong hits, so the threshold can be set to catch paraphrases.",
      sourceIds: ["gptcache"],
    },
    {
      id: "scope",
      text: "Scope the key. Include whatever changes the right answer: the tenant, the user's permissions, the language, the model and prompt version, and the time for facts that go stale. Never share an answer built from one user's private data with another. This is a different tool from prompt caching, which reuses an identical prefix inside the model.",
      sourceIds: ["gptcache", "anthropic-prompt-caching"],
    },
  ],
  challenges: [
    {
      id: "safe-hits",
      title: "Set the cache",
      brief: "Serve at least 20% of requests correctly from the cache, with at most 0.5% getting a wrong cached answer.",
      line: { speaker: "rao", line: "One wrong answer in two hundred is the limit." },
      widget: { id: "semcache-lab", config: SC_CHALLENGE },
      conditions: [
        { metric: "hitRate", op: ">=", value: 0.2, label: "At least 20% of requests hit correctly" },
        { metric: "wrongRate", op: "<=", value: 0.005, label: "At most 0.5% served a wrong answer" },
      ],
      stars: [{ metric: "savedPer1k", op: ">=", value: 2.2, label: "Saves at least $2.20 per 1,000 requests" }],
      hints: ["Can a threshold alone do it?", "What does a verification step remove?", "How low can the threshold go once it is on?"],
    },
  ],
  explainBack: {
    prompt: "Explain how a semantic cache works and how to make it safe.",
    rubric: [
      { id: "how", criterion: "Embed the request, find the nearest cached request by similarity, and serve its answer above a threshold", keyIdea: "fuzzy key" },
      { id: "threshold", criterion: "The threshold trades wrong hits against missed hits, and the score distributions overlap", keyIdea: "two errors" },
      { id: "safe", criterion: "Verify before serving and scope the key by tenant, permissions, language and versions", keyIdea: "verify and scope" },
    ],
    exemplar:
      "A semantic cache embeds each request and looks up the nearest cached request by similarity; above a threshold it serves the stored answer without calling the model. The threshold trades wrong hits against missed ones, and because paraphrases and near-miss questions overlap in score, no single value is clean. I would add a cheap verification step before serving and scope the key by tenant, permissions, language and model version so answers are never shared where they should not be.",
  },
  reviews: [
    {
      id: "sc-est",
      format: "estimate",
      scenario: "A cache hits correctly on 24% of requests, each hit saving a $0.009 call. How much does it save per 1,000 requests?",
      unit: "$",
      answer: 2.16,
      acceptFactor: 1.1,
      breakdown: ["24% × 1,000 = 240 hits", "240 × $0.009 = $2.16"],
      explain: "Savings are hits times the price of a call. A cache that hits wrongly saves nothing worth having.",
    },
    {
      id: "sc-pick",
      format: "pick-fix",
      scenario: "The cache serves an answer containing one customer's order details to another customer with a similar question. What is the fix?",
      options: [
        { id: "a", label: "Add the tenant and user permissions to the cache key, and do not cache answers built from private data" },
        { id: "b", label: "Raise the similarity threshold" },
        { id: "c", label: "Shorten the cache TTL" },
        { id: "d", label: "Use a larger embedding model" },
      ],
      answer: "a",
      explain: "This is a scoping failure, not a similarity one. A perfect match from the wrong user is still a leak.",
    },
    {
      id: "sc-order",
      format: "order",
      scenario: "Order these thresholds by share of requests that get a wrong cached answer, highest first (no verification).",
      items: [
        { id: "70", label: "Threshold 0.70" },
        { id: "85", label: "Threshold 0.85" },
        { id: "90", label: "Threshold 0.90" },
        { id: "95", label: "Threshold 0.95" },
      ],
      answer: ["70", "85", "90", "95"],
      explain: "62%, 13%, 3.1% and 0.4%: wrong hits fall as the bar rises, and so do the good ones.",
    },
    {
      id: "sc-graph",
      format: "predict-graph",
      scenario: "As the threshold rises from 0.6 to 0.99, how does the share of requests answered correctly from the cache change?",
      xLabel: "threshold →",
      yLabel: "correct hits",
      options: [
        { id: "fall", label: "Flat, then falls steeply near 0.9 and beyond", points: [35, 35, 35, 34, 29, 17, 8, 1] },
        { id: "rise", label: "Rises with the threshold", points: [1, 8, 17, 29, 34, 35, 35, 35] },
        { id: "linear", label: "Falls in a straight line", points: [35, 30, 25, 20, 15, 10, 5, 0] },
      ],
      answer: "fall",
      explain: "Paraphrases cluster near 0.92, so the curve stays level until the bar reaches them and then drops quickly.",
    },
    {
      id: "sc-flaw",
      format: "spot-flaw",
      scenario: "A semantic cache keys on the question text only. The answer depends on the user's plan and the current price list. Tap the problem.",
      diagram: {
        nodes: [
          { id: "q", label: "question text", kind: "client", col: 0, row: 1 },
          { id: "emb", label: "embedding lookup", kind: "cache", col: 1, row: 1 },
          { id: "ans", label: "stored answer", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "q", to: "emb" },
          { from: "emb", to: "ans" },
        ],
      },
      answer: "q->emb",
      explain: "The key leaves out what changes the answer: plan, tenant, language, prompt version and the time of the price list. Add them, or skip the cache for such questions.",
    },
    {
      id: "sc-explain",
      format: "explain",
      scenario: "In two sentences: how does a semantic cache differ from prompt caching?",
      rubric: [
        { id: "semantic", criterion: "A semantic cache stores whole answers and returns one when a new request is similar, skipping the model entirely" },
        { id: "prefix", criterion: "Prompt caching reuses the model's work on an identical prefix of the input and still generates a fresh answer" },
      ],
      exemplar: "A semantic cache stores whole answers and returns one when a new request is similar enough, skipping the model entirely. Prompt caching reuses the model's work on an identical prefix of the input and still generates a fresh answer.",
      explain: "One skips the call. The other makes the call cheaper.",
    },
  ],
  codex: {
    oneLiner: "Cache-aside with a similarity key. The threshold trades wrong hits against missed ones; verify before serving and scope the key.",
    keyNumbers: [
      { label: "Threshold 0.70 (lab)", value: "62% wrong answers", sourceId: "gptcache" },
      { label: "Threshold 0.90 with a verification step (lab)", value: "23% hits, 0.3% wrong", sourceId: "gptcache" },
    ],
    tradeoffs: [
      { choice: "Low threshold", gain: "More hits", cost: "Wrong answers served confidently" },
      { choice: "High threshold", gain: "Safe", cost: "Few hits" },
      { choice: "Verification step", gain: "Catches near misses", cost: "Extra cost and 120 ms per candidate" },
    ],
    seenIn: ["GPTCache and gateway-level semantic caches.", "FAQ and support bots with many paraphrases."],
    interviewAngle: "Say: 'embed, find nearest, threshold, verify; scope the key by tenant and version; and measure the wrong-hit rate, not only the hit rate'.",
    aws: [{ concept: "Vector lookup for a semantic cache", service: "Amazon MemoryDB or OpenSearch with vector search" }],
    replay: { id: "semcache-lab", config: SC, scene: "verify" },
  },
  interview: [
    "How does a semantic cache work, and what can go wrong?",
    "How do you choose the similarity threshold?",
    "What belongs in a semantic cache key?",
  ],
  deeper: [
    {
      title: "What not to cache",
      body: "Answers that depend on live data, on the user's identity, or on a conversation's earlier turns usually should not be cached by meaning alone. Cache the stable parts: documentation questions, definitions, FAQ-style requests. Add a TTL, version the cache with the prompt, and let it be bypassed for debugging.",
      sourceIds: ["gptcache"],
    },
  ],
  honestPhysics: [
    "35% of requests have an equivalent request cached, with cosine similarity around 0.92 (spread 0.04). For the other 65% the nearest entry is a different question, around 0.80 (spread 0.06). A hit on an equivalent saves a $0.009 call.",
    "A verification step removes 90% of wrong hits and 3% of good ones, costing $0.0003 per candidate and about 120 ms. Round figures: real similarity distributions depend on the embedding model and the traffic.",
  ],
  sources: [GPTCACHE, PROMPT_CACHE, RECSYS],
  verify: [
    { id: "loose", claim: "At threshold 0.70 about 62% of requests get a wrong cached answer", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.7, verify: false }, metric: "wrongRate" }, expect: { min: 0.6, max: 0.64 } },
    { id: "tight", claim: "At 0.97 only about 4% of requests hit", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.97, verify: false }, metric: "hitRate" }, expect: { min: 0.03, max: 0.045 } },
    { id: "no-verify", claim: "No threshold with at least 20% hits is safe without verification", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.9, verify: false }, metric: "wrongRate" }, expect: { min: 0.005 } },
    { id: "verify-wrong", claim: "With verification, threshold 0.90 serves 0.3% wrong answers", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.9, verify: true }, metric: "wrongRate" }, expect: { max: 0.005 } },
    { id: "verify-hit", claim: "…while still hitting more than 20%", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.9, verify: true }, metric: "hitRate" }, expect: { min: 0.2 } },
    { id: "too-high", claim: "At 0.95 with verification hits fall below 20%", run: "lab", params: { model: "semcache-lab", config: SC_CHALLENGE, values: { threshold: 0.95, verify: true }, metric: "hitRate" }, expect: { max: 0.2 } },
  ],
});
