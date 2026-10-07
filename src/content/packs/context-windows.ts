import { definePack } from "../define";

const LAB = { variant: "lab" };
export const CTX_CHALLENGE = { variant: "challenge" };

const SRC = {
  lostMiddle: { id: "liu-2023", title: "N. Liu et al. (2023), Lost in the Middle: How Language Models Use Long Contexts, TACL 2024", url: "https://arxiv.org/abs/2307.03172" },
  anthropicContext: { id: "anthropic-context-windows", title: "Anthropic docs: Context windows (everything in the request counts, including the output)", url: "https://platform.claude.com/docs/en/build-with-claude/context-windows" },
  anthropicStateless: { id: "anthropic-messages", title: "Anthropic docs: Messages API (stateless: send the full conversation each time)", url: "https://platform.claude.com/docs/en/api/messages" },
  anthropicPricing: { id: "anthropic-pricing", title: "Anthropic: Claude API pricing", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  promptCaching: { id: "anthropic-prompt-caching", title: "Anthropic docs: Prompt caching", url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching" },
};

export default definePack({
  id: "context-windows",
  title: "Context Windows",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "Support", detail: "Copilot suggested peanut chikki. I TOLD it I'm allergic.|Why does it keep forgetting my name halfway through?|The chat just died with an error after we planned half the party." },
    lines: [
      { speaker: "kabir", line: "Copilot is forgetting people's allergies. That is not a hallucination, that is a lawsuit." },
      { speaker: "meera", line: "It didn't forget; we stopped showing it. Let's look at what we actually send." },
    ],
  },
  predictions: [
    {
      id: "growth",
      kind: "choice",
      prompt: "Each request re-sends the whole chat. Fixed context is 6,400 tokens and every turn adds 700 more. Over a 20-turn chat, how many input tokens do you pay for in total?",
      options: [
        { id: "20k", label: "About 20,000" },
        { id: "140k", label: "About 140,000" },
        { id: "260k", label: "About 260,000" },
        { id: "2.6m", label: "About 2.6 million" },
      ],
      answer: "260k",
      observe: "history-cost",
      reveal: {
        text: "261,000 tokens. Turn 20 alone sends 19,700. The API is stateless, so every turn pays for every earlier turn again: total input grows with the square of the conversation's length, not in a straight line.",
        derived: true,
        line: { speaker: "rao", line: "So the longer they like us, the more they cost us. Wonderful." },
      },
    },
    {
      id: "forget",
      kind: "choice",
      prompt: "To save money you keep only the last 10 turns. In turn 2 the user said they're allergic to peanuts. At turn 40 they ask for a dessert suggestion. What happens?",
      options: [
        { id: "remembers", label: "The model remembers: it's the same conversation" },
        { id: "blind", label: "The model never sees it, and may suggest something with peanuts" },
        { id: "error", label: "The API returns an error" },
      ],
      answer: "blind",
      observe: "forgot",
      reveal: {
        text: "The model has no memory between requests. Turn 2 isn't in the request, so for the model it never happened. It won't say 'I forgot'; it will answer confidently from what it can see.",
        sourceIds: ["anthropic-messages"],
      },
    },
  ],
  widget: { id: "context-tetris", config: LAB },
  mechanism: [
    {
      id: "window",
      scene: "window",
      text: "The context window is everything the model sees in one request: system prompt, tool definitions, retrieved documents, the conversation so far, the new message, and room for the answer. Nothing outside it exists for the model.",
      sourceIds: ["anthropic-context-windows"],
    },
    {
      id: "stateless",
      scene: "stateless",
      text: "The model is stateless. Each request carries the whole history, whether your code re-sends it or a stateful API replays it for you, so every request is bigger than the last and total input grows roughly with the square of the conversation length. Eventually a request won't fit and is rejected.",
      sourceIds: ["anthropic-messages"],
      derived: true,
    },
    {
      id: "policies",
      scene: "policies",
      text: "Something has to go. Truncating old turns forgets silently. Summarizing keeps the gist and loses details. Pinning key facts in a small profile block keeps what matters in every request, next to a short window of recent turns.",
    },
    {
      id: "middle",
      text: "Fitting isn't the same as working. Cost and latency scale with every input token, and accuracy falls as context grows. Liu et al. found 2023 models used facts in the middle of a long context worst; current models still lose accuracy in long, cluttered contexts.",
      sourceIds: ["liu-2023", "anthropic-context-windows"],
    },
  ],
  challenges: [
    {
      id: "context-policy",
      title: "The 40-turn chat",
      brief: "Pick Copilot's context policy for long chats. No request may exceed the 32k window, the model must answer at least 4 of the 5 checks at turn 40, and a conversation must cost under $1.25.",
      line: { speaker: "meera", line: "Decide what the model must never lose, then pay for as little else as you can." },
      widget: { id: "context-tetris", config: CTX_CHALLENGE },
      conditions: [
        { metric: "overflow", op: "==", value: 0, label: "No request exceeds the window" },
        { metric: "quality", op: ">=", value: 4, label: "At least 4 of 5 answers at turn 40" },
        { metric: "costPerConversation", op: "<", value: 1.25, label: "Under $1.25 per conversation" },
      ],
      stars: [
        { metric: "costPerConversation", op: "<", value: 1.05, label: "Under $1.05 per conversation" },
        { metric: "ttft", op: "<", value: 0.9, label: "Time to first token under 0.9s" },
      ],
      hints: [
        "Which of the five facts are about the person, and which are about this moment?",
        "The oldest turns hold the most important facts. What keeps them without keeping everything?",
        "Every retrieved document and every kept turn is paid for on every request. How few can you keep and still answer?",
      ],
    },
  ],
  explainBack: {
    prompt: "A teammate thinks the model 'remembers' the conversation. Explain what the context window actually is, and why long chats get expensive and forgetful.",
    rubric: [
      { id: "stateless", criterion: "The API is stateless: the model only sees what's in the current request", keyIdea: "no memory between requests" },
      { id: "cost", criterion: "Re-sending history makes each request bigger, so cost and latency grow with conversation length", keyIdea: "history re-sent every turn" },
      { id: "limit", criterion: "The window has a hard limit; policies (truncate, summarize, pin facts) decide what's lost", keyIdea: "something must be dropped" },
    ],
    exemplar:
      "The model has no memory; each request contains everything it will see, including the whole chat so far. So every turn re-sends more history, making requests bigger, slower, and more expensive, until they don't fit the window at all. Then you have to choose what to drop: truncating forgets the oldest things silently, so pin the facts that must never be lost and keep a short window of recent turns.",
  },
  reviews: [
    {
      id: "cw-est-total",
      format: "estimate",
      scenario: "Fixed context of 4,000 tokens, each turn adds 500. How many input tokens across a 10-turn chat (history re-sent every turn)?",
      unit: "tokens",
      answer: 62500,
      acceptFactor: 1.4,
      breakdown: ["turn t sends 4,000 + 500 × (t − 1)", "sum over 10 turns = 10 × 4,000 + 500 × (0 + 1 + … + 9)", "= 40,000 + 500 × 45 = 62,500"],
      explain: "The history term grows with the square of the turn count. That's what makes long chats disproportionately expensive.",
    },
    {
      id: "cw-pick-allergy",
      format: "pick-fix",
      scenario: "A cooking assistant keeps the last 12 turns. Users complain it forgets dietary restrictions from early in the chat. Best fix?",
      options: [
        { id: "a", label: "Keep the last 40 turns instead" },
        { id: "b", label: "Extract dietary facts into a small pinned profile block sent with every request" },
        { id: "c", label: "Tell the model in the system prompt to remember everything" },
        { id: "d", label: "Switch to a model with a bigger window" },
      ],
      answer: "b",
      explain: "Pinning the few facts that must never be lost costs a hundred tokens instead of thousands, and survives any window length. The model can't remember what isn't sent.",
      why: {
        prompt: "Why doesn't the system prompt instruction work?",
        options: [
          { id: "a", label: "The model can only use what's in the request; old turns aren't there" },
          { id: "b", label: "System prompts are ignored in long chats" },
          { id: "c", label: "It would, but it's too expensive" },
        ],
        answer: "a",
      },
    },
    {
      id: "cw-graph",
      format: "predict-graph",
      scenario: "Full history, re-sent every turn. What does the cumulative input-token bill look like over a long chat?",
      xLabel: "turn →",
      yLabel: "total input tokens so far",
      options: [
        { id: "linear", label: "A straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "quad", label: "A curve that steepens", points: [1, 2.5, 4.5, 7, 10, 13.5, 17.5, 22] },
        { id: "flat", label: "Flattens out", points: [1, 4, 6, 7, 7.5, 7.8, 8, 8] },
      ],
      answer: "quad",
      explain: "Each request is bigger than the last, so the running total curves upward (quadratic) until requests stop fitting.",
    },
    {
      id: "cw-order",
      format: "order",
      scenario: "Order these context policies by cost for a 40-turn chat, cheapest first.",
      items: [
        { id: "full", label: "Full history" },
        { id: "pin6", label: "Pinned profile + last 6 turns" },
        { id: "last26", label: "Last 26 turns" },
      ],
      answer: ["pin6", "last26", "full"],
      explain: "Cost tracks how many tokens ride along on every request. Full history is the most, until it stops fitting entirely.",
    },
    {
      id: "cw-flaw",
      format: "spot-flaw",
      scenario: "Answers about the refund policy are wrong even though it's retrieved. Tap the problem.",
      diagram: {
        nodes: [
          { id: "user", label: "user", kind: "client", col: 0, row: 1 },
          { id: "app", label: "copilot service", kind: "server", col: 1, row: 1 },
          { id: "search", label: "retrieval: top-20 chunks", kind: "store", col: 2, row: 0 },
          { id: "llm", label: "LLM: 20 chunks + 30 turns", kind: "llm", col: 2, row: 2 },
        ],
        edges: [
          { from: "user", to: "app" },
          { from: "app", to: "search" },
          { from: "app", to: "llm" },
        ],
      },
      answer: "search",
      explain: "Twenty chunks put the one that matters among nineteen near-misses, and you pay for all of them on every turn. Accuracy drops as context fills with distractors, and Liu et al. found extra retrieved chunks barely helped. Retrieve fewer, better-ranked chunks.",
    },
    {
      id: "cw-explain",
      format: "explain",
      scenario: "In two sentences: why does a chatbot 'forget' things from early in a long conversation?",
      rubric: [
        { id: "stateless", criterion: "The model only sees what's sent in the current request" },
        { id: "dropped", criterion: "Older turns get truncated or summarized away to fit the window or save cost" },
      ],
      exemplar: "The model has no memory between requests; it only sees the messages sent this time. To fit the window and control cost, apps drop or summarize old turns, so facts from early on are simply no longer there.",
      explain: "Forgetting is a policy decision in your code, not something the model does on its own.",
    },
  ],
  codex: {
    oneLiner: "The context window is everything the model sees in one request. It's stateless, finite, and you pay for every token in it, every time.",
    keyNumbers: [
      { label: "What counts toward the window", value: "system + tools + messages + output", sourceId: "anthropic-context-windows" },
      { label: "Conversation state", value: "none: re-send history each turn", sourceId: "anthropic-messages" },
      { label: "Cumulative input over n turns", value: "grows ∝ n²", sourceId: "anthropic-messages" },
      { label: "Mid-context recall (2023 models)", value: "worse than start or end", sourceId: "liu-2023" },
      { label: "Cached prefix reads", value: "≈ 0.1× the input price (Sonnet, Haiku)", sourceId: "anthropic-prompt-caching" },
    ],
    tradeoffs: [
      { choice: "Full history", gain: "Nothing is forgotten (until it doesn't fit)", cost: "Cost grows quadratically; eventually rejected" },
      { choice: "Sliding window", gain: "Bounded cost and latency", cost: "Silently forgets the oldest facts" },
      { choice: "Pinned facts + short window", gain: "Keeps what matters cheaply", cost: "You must decide and extract what matters" },
      { choice: "Summaries", gain: "Keeps the gist of old turns", cost: "Extra calls; details get lost" },
    ],
    seenIn: [
      "A RAG answer box: every retrieved chunk you add is paid for on every question, and the key passage can get lost in the middle.",
      "Any chatbot you've built that 'suddenly forgot' something was a context policy you didn't choose on purpose.",
    ],
    interviewAngle: "In a chat-product design, state the context budget explicitly: 'system + tools ≈ 4k, top-3 chunks ≈ 2k, pinned profile, last N turns, answer reserve', and how you cache the stable prefix. It shows you understand cost and quality at once.",
    aws: [{ concept: "Long-conversation state", service: "Store history in DynamoDB; build the context per request" }],
    otherClouds: "The model is stateless on every provider. Some APIs store history for you, but every turn still processes and bills the full context.",
    replay: { id: "context-tetris", config: LAB },
  },
  interview: [
    "Design memory for a support chatbot that handles 100-turn conversations.",
    "Why do long conversations cost more than linearly? How would you cap it?",
    "When would you summarize history versus pin facts versus retrieve past turns?",
  ],
  deeper: [
    {
      title: "Why cumulative cost is quadratic",
      body: "If each turn adds h tokens of history on top of a fixed context F, turn t sends F + h(t − 1). Summed over n turns that's nF + h·n(n−1)/2. The first term is linear; the second grows with n². At 40 turns of 700 tokens, the history term alone is over half a million tokens per conversation.",
      derived: true,
    },
    {
      title: "Prompt caching softens (but doesn't remove) the curve",
      body: "The stable prefix (system prompt, tool definitions, pinned facts) is identical on every turn, and prompt caching lets the provider reuse it: cache reads cost a fraction of normal input. An append-only history caches too, since each request starts with the previous one. A sliding window breaks that: dropping the oldest turn changes everything after the stable blocks, and that part is paid in full again.",
      sourceIds: ["anthropic-prompt-caching"],
    },
    {
      title: "Lost in the middle",
      body: "Liu et al. found that models answer best when the relevant passage is near the start or end of a long context and worst when it's in the middle, even for models built for long contexts. Retrieving fewer, better-ranked chunks is both cheaper and more accurate than stuffing the window.",
      sourceIds: ["liu-2023"],
    },
  ],
  honestPhysics: [
    "Window size is set to 32k tokens so the trade-offs appear within 40 turns. Current Claude models have 200k–1M windows, where a 40-turn chat fits easily; there, dropping turns is a choice about cost, latency, and accuracy rather than a hard limit.",
    "Whether the model answers a question is modelled as 'is the needed fact in the request?'. Real models can also fail with the fact present, or guess right without it.",
    "A request here is rejected when input plus the 1,024-token answer reserve exceeds the window. On current Claude models only input over the window is rejected; if the input fits but the answer doesn't, the reply is cut off with stop_reason model_context_window_exceeded.",
    "Lost in the middle is a stylized rule: a retrieved doc is missed only when 6 or more are retrieved, it is neither in the top two nor last, and the window is over 60% full at turn 40. Real position effects are gradual and vary by model.",
    "Prompt caching is modelled only in The Bill, and only for the stable prefix (system, tools, pinned profile), written once per chat. Real automatic caching also reuses an append-only history, and cache entries expire after 5 idle minutes by default.",
    "Time to first token is stylized: a fixed overhead plus prefill time proportional to uncached input. It ignores queueing, network time, and any thinking the model does before its first visible token.",
  ],
  sources: [SRC.anthropicContext, SRC.anthropicStateless, SRC.lostMiddle, SRC.anthropicPricing, SRC.promptCaching],
  verify: [
    { id: "pred-sum", claim: "20 turns of full history cost about 261k input tokens", run: "ctx-sum", params: { turns: 20 }, expect: { min: 250000, max: 270000 } },
    { id: "full-overflows", claim: "Full history overflows the window before turn 40", run: "ctx-eval", params: { policy: { mode: "full", lastN: 40, docs: 3 }, metric: "overflowTurn" }, expect: { min: 30, max: 39 } },
    { id: "last10-forgets", claim: "Last-10 loses the allergy", run: "ctx-eval", params: { policy: { mode: "last", lastN: 10, docs: 3 }, metric: "quality" }, expect: { max: 3 } },
    { id: "pinned-wins", claim: "Pinned profile + last 6 + 3 docs passes", run: "ctx-eval", params: { policy: { mode: "pinned", lastN: 6, docs: 3 }, metric: "quality" }, expect: { min: 4 } },
    { id: "pinned-cost", claim: "…for under $1.05 a conversation", run: "ctx-eval", params: { policy: { mode: "pinned", lastN: 6, docs: 3 }, metric: "costPerConversation" }, expect: { max: 1.05 } },
  ],
});
