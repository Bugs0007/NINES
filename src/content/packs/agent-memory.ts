import { definePack } from "../define";

export const MEM = { start: { kind: "hybrid", w: 8, k: 10 } };
export const MEM_CHALLENGE = {};

const MEMGPT = { id: "memgpt", title: "C. Packer et al. (2023), MemGPT: Towards LLMs as Operating Systems (tiered memory, paging context)", url: "https://arxiv.org/abs/2310.08560" };
const WENG = { id: "weng-agents", title: "L. Weng (2023), LLM Powered Autonomous Agents (memory: short-term, long-term, retrieval)", url: "https://lilianweng.github.io/posts/2023-06-23-agent/" };
const ANTHROPIC_CONTEXT = { id: "anthropic-context", title: "Anthropic docs: Context windows", url: "https://docs.anthropic.com/en/docs/build-with-claude/context-windows" };

export default definePack({
  id: "agent-memory",
  title: "Short- vs Long-term Memory",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "assistant · asked the user's name again on turn 140", detail: "the user said it on turn 3" },
    lines: [
      { speaker: "kabir", line: "A customer told the assistant they were vegetarian in the first minute. A hundred turns later it recommended a steak house." },
      { speaker: "meera", line: "The model only knows what is in front of it. Remembering means deciding what goes in front of it, each turn, from a much bigger past." },
    ],
  },
  predictions: [
    {
      id: "forgot",
      kind: "choice",
      prompt: "A 200-turn conversation. The assistant keeps only the last 10 turns. Questions can ask about facts from any point in the conversation, evenly. What share of facts can it recall?",
      options: [
        { id: "5", label: "About 5%" },
        { id: "50", label: "About half" },
        { id: "90", label: "About 90%" },
      ],
      answer: "5",
      observe: "forgot",
      reveal: {
        text: "Ten turns out of two hundred is 5% of the conversation. Anything older has left the window and is gone. The user did not leave; the memory did. A window fits chat about the current topic, and fails any question that reaches back.",
        derived: true,
        line: { speaker: "meera", line: "A window is a goldfish with excellent short-term recall." },
      },
    },
    {
      id: "stuff",
      kind: "choice",
      prompt: "To remember everything you keep the last 80 turns at about 400 tokens each. What does each reply's input cost, and how much does the assistant remember?",
      options: [
        { id: "cheap", label: "About 3,000 tokens, remembers most" },
        { id: "mid", label: "About 32,000 tokens, remembers 40%" },
        { id: "huge", label: "About 320,000 tokens, remembers all" },
      ],
      answer: "mid",
      observe: "stuffed",
      reveal: {
        text: "80 turns × 400 tokens is 32,000 tokens of input on every reply, 8 times the cost of a 10-turn window, and still only 80 of 200 turns: 40% of the facts. Brute-force context is expensive and still finite. A summary and a search over the old turns cost far less and reach further.",
        derived: true,
        line: { speaker: "rao", line: "I would rather pay to find the right turn than to carry all of them." },
      },
    },
  ],
  widget: { id: "memory-lab", config: MEM },
  mechanism: [
    {
      id: "two",
      text: "Short-term memory is the context window: everything the model reads this turn. It is exact and immediate, and limited and expensive. Long-term memory is anything stored outside, in files, a database or a vector index, and brought in when needed. An agent's memory design is the policy for moving things between the two.",
      sourceIds: ["weng-agents", "memgpt"],
    },
    {
      id: "window",
      scene: "window",
      text: "The simplest policy keeps the last few turns. It is cheap and keeps the current thread coherent, and forgets everything older. It is right for short tasks and tool loops. For long relationships it silently drops the user's name, constraints and decisions, which are the things people expect to be remembered.",
      sourceIds: ["anthropic-context"],
    },
    {
      id: "summary",
      scene: "summary",
      text: "A running summary compresses older turns into a few hundred tokens, updated as the conversation grows. It keeps the gist and the decisions, at the price of detail, and it can drift or drop things the summariser did not think mattered. Keep durable facts, like preferences, in a separate structured list that is never summarised away.",
      sourceIds: ["memgpt"],
    },
    {
      id: "retrieval",
      scene: "retrieval",
      text: "Retrieval stores every turn or fact in a vector index and fetches the few most relevant for each new message. It reaches the whole past for a small, fixed cost, and finds old facts only if the search does: a poorly phrased question can miss. Combine it with a summary and a recent window for the best coverage.",
      sourceIds: ["weng-agents", "memgpt"],
    },
  ],
  challenges: [
    {
      id: "design-memory",
      title: "Design the memory",
      brief: "A 200-turn assistant. Choose how much recent history to keep, whether to summarise, and how many stored items to retrieve per question, so it remembers at least 92% of facts and each reply uses at most 6,500 input tokens.",
      line: { speaker: "kabir", line: "Remember the vegetarian, and do not charge us for remembering the weather chat from Tuesday." },
      widget: { id: "memory-lab", config: MEM_CHALLENGE },
      conditions: [
        { metric: "recall", op: ">=", value: 0.92, label: "At least 92% of facts remembered" },
        { metric: "tokensPerTurn", op: "<=", value: 6500, label: "At most 6,500 tokens a reply" },
      ],
      stars: [{ metric: "tokensPerTurn", op: "<=", value: 5000, label: "At most 5,000 tokens a reply" }],
      hints: [
        "What does a window alone reach?",
        "What does a summary keep, and what does retrieval reach?",
        "Both nets together fail only when each misses.",
      ],
    },
  ],
  explainBack: {
    prompt: "Design the memory of a long-running assistant.",
    rubric: [
      { id: "tiers", criterion: "Short-term memory is the context window; long-term memory is stored outside and retrieved when needed", keyIdea: "context versus stored" },
      { id: "window", criterion: "A window keeps recent turns cheaply but forgets everything older; summaries keep the gist, lossy", keyIdea: "window and summary trade-offs" },
      { id: "retrieval", criterion: "Retrieval reaches the whole past for a small cost but can miss, so combine recent window, summary and retrieval", keyIdea: "layered memory" },
    ],
    exemplar:
      "Short-term memory is the context window, which is exact but limited and costly; long-term memory is stored outside, such as in a vector index or a structured list of facts, and retrieved when needed. A recent window is cheap but forgets everything older, and a running summary keeps the gist but loses detail. I would layer them: a short window for the current thread, a summary and a durable facts list for the long past, and retrieval of the few most relevant stored items per question.",
  },
  reviews: [
    {
      id: "am-est",
      format: "estimate",
      scenario: "A reply reads the last 12 turns at 400 tokens each, an 800-token summary and 10 retrieved items at 200 tokens each. About how many input tokens is that?",
      unit: "tokens",
      answer: 7600,
      acceptFactor: 1.05,
      breakdown: ["12 × 400 = 4,800", "+ 800 summary", "+ 10 × 200 = 2,000", "= 7,600"],
      explain: "Each layer adds to every reply, so the tokens add up quickly. Trim the window before trimming the retrieval.",
    },
    {
      id: "am-pick",
      format: "pick-fix",
      scenario: "A user says 'I'm allergic to nuts' once. Forty turns later the assistant suggests a dessert with almonds. The system keeps only a rolling summary of the conversation. What is the best fix?",
      options: [
        { id: "a", label: "Store durable user facts in a separate list that is always included, and never summarised away" },
        { id: "b", label: "Make the summary longer" },
        { id: "c", label: "Raise the temperature" },
        { id: "d", label: "Ask the user again each time" },
      ],
      answer: "a",
      explain: "Allergies are exactly the facts that must survive. A pinned list of durable facts is more reliable than hoping a summary keeps them.",
    },
    {
      id: "am-order",
      format: "order",
      scenario: "Order these memory designs by facts remembered in the lab (window 10, retrieval of 5), lowest first.",
      items: [
        { id: "window", label: "Last 10 turns only" },
        { id: "summary", label: "Window and summary" },
        { id: "retr", label: "Window and retrieval" },
        { id: "both", label: "Window, summary and retrieval" },
      ],
      answer: ["window", "summary", "retr", "both"],
      explain: "5%, 57%, 65% and 84%: each net catches some of what the others miss.",
    },
    {
      id: "am-graph",
      format: "predict-graph",
      scenario: "With a window of 10 turns, as the number of retrieved items grows from 1 to 20, how does recall (retrieval only) change?",
      xLabel: "items retrieved →",
      yLabel: "facts remembered",
      options: [
        { id: "sat", label: "Rises steeply, then flattens toward the limit", points: [24, 40, 53, 65, 78, 91, 95, 97] },
        { id: "linear", label: "Rises in a straight line", points: [10, 20, 30, 40, 50, 60, 70, 80] },
        { id: "flat", label: "Stays at 5%", points: [5, 5, 5, 5, 5, 5, 5, 5] },
      ],
      answer: "sat",
      explain: "The first few items catch the easy matches. Beyond a point you pay tokens for little gain.",
    },
    {
      id: "am-flaw",
      format: "spot-flaw",
      scenario: "An assistant embeds every user message and retrieves by similarity, with nothing else. A user asks 'what was that restaurant again?' and gets nothing useful. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "q", label: "'what was that restaurant again?'", kind: "client", col: 0, row: 1 },
          { id: "search", label: "similarity search over old turns", kind: "db", col: 1, row: 1 },
          { id: "miss", label: "no match: the words don't overlap", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "q", to: "search" },
          { from: "search", to: "miss" },
        ],
      },
      answer: "q->search",
      explain: "A vague question has little to match, so retrieval can miss. Rewrite the query with recent context before searching, and keep a recent window and summary as backup.",
    },
    {
      id: "am-explain",
      format: "explain",
      scenario: "In two sentences: why is a larger context window not a complete answer to memory?",
      rubric: [
        { id: "cost", criterion: "Every token in the window is read and paid for on every reply, so carrying the whole past is expensive and slow" },
        { id: "limit", criterion: "Windows are finite and relevant facts get diluted among irrelevant text, so selection still matters" },
      ],
      exemplar: "Every token in the window is read and paid for on each reply, so carrying the whole past is slow and costly. Windows are also finite and bury relevant facts among irrelevant text, so choosing what to include still matters.",
      explain: "Memory is a selection problem.",
    },
  ],
  codex: {
    oneLiner: "Context is short-term memory. Layer a recent window, a summary, pinned facts and retrieval, and watch tokens per reply.",
    keyNumbers: [
      { label: "Window of W turns in a 200-turn conversation", value: "remembers W ÷ 200", sourceId: "memgpt" },
      { label: "Retrieval recall at K items (lab)", value: "1 − 0.55^(K ÷ 3)", sourceId: "weng-agents" },
    ],
    tradeoffs: [
      { choice: "Bigger window", gain: "Exact recent detail", cost: "Cost and latency on every reply" },
      { choice: "Summary", gain: "Cheap long reach", cost: "Lossy" },
      { choice: "Retrieval", gain: "Reaches the whole past", cost: "Can miss; needs an index" },
    ],
    seenIn: ["ChatGPT's saved memories and project files.", "Coding agents' notes files and context compaction."],
    interviewAngle: "Say: 'recent window, summary, a pinned facts list and vector retrieval, with a token budget per turn'.",
    aws: [{ concept: "Agent memory and session summarisation", service: "Amazon Bedrock Agents memory, AgentCore" }],
    replay: { id: "memory-lab", config: MEM, scene: "retrieval" },
  },
  interview: [
    "How would you give a chatbot long-term memory?",
    "What is the difference between short-term and long-term memory in an agent?",
    "What are the risks of summarising a conversation?",
  ],
  deeper: [
    {
      title: "What to remember, and what to forget",
      body: "More memory is not always better. Stale or wrong memories mislead, memories can leak between users if stores are shared, and users may want things forgotten. Decide what is worth keeping, give memories timestamps and sources, let users view and delete them, and keep each user's memory separate.",
      sourceIds: ["weng-agents"],
    },
  ],
  honestPhysics: [
    "A 200-turn conversation in which the user states facts at random points; later questions ask about any of them, evenly. A turn is about 400 tokens.",
    "A window of W turns remembers W ÷ 200 of the facts. A summary keeps 55% of older facts for 800 tokens. Retrieval of K items recalls an older fact with probability 1 − 0.55^(K ÷ 3) at 200 tokens an item. A hybrid fails only when both miss.",
    "Round figures for comparison; real recall depends on what is stored and how it is searched.",
  ],
  sources: [MEMGPT, WENG, ANTHROPIC_CONTEXT],
  verify: [
    { id: "window", claim: "A 10-turn window remembers 5% of a 200-turn conversation", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "window", w: 10 }, metric: "recall" }, expect: { min: 0.05, max: 0.05 } },
    { id: "big-window", claim: "An 80-turn window reads 32,000 tokens and remembers 40%", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "window", w: 80 }, metric: "tokensPerTurn" }, expect: { min: 32000, max: 32000 } },
    { id: "hybrid5", claim: "Window 10 with summary and 5 retrieved items remembers 84%", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "hybrid", w: 10, k: 5 }, metric: "recall" }, expect: { min: 0.83, max: 0.85 } },
    { id: "hybrid10", claim: "Window 8 with summary and 10 retrieved remembers 94%", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "hybrid", w: 8, k: 10 }, metric: "recall" }, expect: { min: 0.92 } },
    { id: "hybrid10-tokens", claim: "…in 6,000 tokens", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "hybrid", w: 8, k: 10 }, metric: "tokensPerTurn" }, expect: { max: 6500 } },
    { id: "w10", claim: "A window of 10 with k = 10 costs 6,800 tokens, over the limit", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "hybrid", w: 10, k: 10 }, metric: "tokensPerTurn" }, expect: { min: 6500 } },
    { id: "retr12", claim: "Retrieval alone needs 12 items to reach 91%", run: "lab", params: { model: "memory-lab", config: MEM_CHALLENGE, values: { kind: "retrieval", w: 10, k: 12 }, metric: "recall" }, expect: { min: 0.9 } },
  ],
});
