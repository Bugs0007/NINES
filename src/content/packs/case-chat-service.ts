import { defineBoss } from "../define";

export const CSC = {};

const PROMPT_CACHE = { id: "anthropic-prompt-caching", title: "Claude docs: Prompt caching (cached reads at a tenth of the input price)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const STREAMING = { id: "anthropic-streaming", title: "Claude docs: Streaming Messages", url: "https://docs.anthropic.com/en/api/messages-streaming" };
const CTX = { id: "anthropic-context", title: "Claude docs: Context windows (the whole conversation is sent each turn)", url: "https://docs.anthropic.com/en/docs/build-with-claude/context-windows" };

export default defineBoss({
  id: "case-chat-service",
  title: "Case: ChatGPT-style Chat Service",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "billing · one user's 400-turn conversation cost $38", detail: "average conversation $0.10; the heaviest 1% of users are 40% of spend" },
    lines: [{ speaker: "kabir", line: "Our chat assistant is loved and expensive. One conversation ran four hundred turns and cost thirty-eight dollars, and the heaviest one percent of users are forty percent of the bill." }],
  },
  intro: [
    { speaker: "meera", line: "Every turn resends the whole conversation, so cost grows with the square of its length. That one fact drives three design choices." },
    { speaker: "rao", line: "What do you forget, what do you cache, and who gets limited? Each has a visible cost to the user." },
  ],
  forecast: {
    metric: "costPerConversation",
    prompt: "A 10-turn conversation resends the full history each turn: 32,000 input and 3,500 output tokens in all, at $2 and $10 per million. What does it cost?",
    unit: "$",
    scale: 1,
    min: 0.005,
    max: 2,
    tolerance: 1.4,
  },
  exercises: ["streaming", "context-windows", "llm-rate-limits-retries", "case-chat"],
  challenge: {
    id: "design-chat-service",
    title: "Run the service",
    brief: "Bring a 10-turn conversation to $0.05 or less and a 60-turn one to $0.55 or less, show text within 1.5 seconds, forget something needed in at most 10% of conversations, hold the heaviest users to 15% of spend, throttle at most 1% of legitimate users, and lose at most 3 points of quality.",
    line: { speaker: "meera", line: "Cache what repeats, stream what is slow, and limit what is abused." },
    widget: { id: "chatsvc-lab", config: CSC },
    conditions: [
      { metric: "costPerConversation", op: "<=", value: 0.05, label: "A 10-turn conversation at most $0.05" },
      { metric: "longConversationCost", op: "<=", value: 0.55, label: "A 60-turn conversation at most $0.55" },
      { metric: "ttftSec", op: "<=", value: 1.5, label: "First text within 1.5 s" },
      { metric: "forgetRate", op: "<=", value: 0.1, label: "At most 10% of conversations forget" },
      { metric: "abuseSpendShare", op: "<=", value: 0.15, label: "Heaviest users at most 15% of spend" },
      { metric: "legitThrottled", op: "<=", value: 0.01, label: "At most 1% of legitimate users throttled" },
      { metric: "qualityLoss", op: "<=", value: 0.03, label: "At most 3 points of quality lost" },
    ],
    stars: [{ metric: "costPerConversation", op: "<=", value: 0.04, label: "A 10-turn conversation at most $0.04" }],
    hints: ["What does caching save when the prefix is stable?", "Which history policy keeps a stable prefix and remembers?", "Which abuse control throttles fewer honest users?"],
  },
  debrief: [
    { id: "quad", text: "Sending the full history makes input tokens grow with every turn: 32,000 over ten turns and 940,000 over sixty, which is why the long tail dominates. Windowing bounds the cost and forgets in a quarter of conversations. Summarising forgets 6% at a small extra cost.", sourceIds: ["anthropic-context"] },
    { id: "cache", text: "Prompt caching reads the stable prefix at a tenth of the price. It works best with full history, where 82% of input is repeated prefix, and poorly with a sliding window whose prefix changes every turn. Here full history with caching is the cheapest design that forgets nothing.", sourceIds: ["anthropic-prompt-caching"] },
    { id: "ttft", text: "Streaming shows the first text after about a second and not after the whole answer, an experience difference, not a cost one. A token budget per user cut the heaviest 1% from 40% of spend to 10% and throttled 0.5% of honest users, where a request limit throttled 3%.", sourceIds: ["anthropic-streaming"] },
  ],
  outro: { speaker: "kabir", line: "Full history, cached, streamed, a token budget and a small model for chatty turns. Four cents a conversation and nobody's forty-dollar thread." },
  explainBack: {
    prompt: "Explain how your chat service controls cost without hurting the experience.",
    rubric: [
      { id: "growth", criterion: "Each turn resends the history, so cost grows quadratically with conversation length and long conversations dominate", keyIdea: "quadratic growth" },
      { id: "cache", criterion: "Prompt caching makes the repeated prefix cheap; truncation breaks the prefix and loses memory", keyIdea: "cache the prefix" },
      { id: "limits", criterion: "A token budget limits abusive users and throttles fewer honest ones than a request limit", keyIdea: "token budgets" },
      { id: "stream", criterion: "Stream so users see text in about a second, and route simple turns to a smaller model", keyIdea: "stream and route" },
    ],
    exemplar:
      "Each turn resends the whole history, so cost grows with the square of the conversation length and a few long ones dominate the bill. I would keep the full history so nothing is forgotten and use prompt caching to read the repeated prefix at a tenth of the price, which brought a ten-turn conversation to about four cents. A token budget per user held the heaviest one percent to a tenth of spend and throttled half a percent of honest users, I would stream so text appears in about a second, and send chatty turns to a smaller model.",
  },
  honestPhysics: [
    "An 800-token system prompt; each turn the user writes 150 tokens and the model answers 350, and each earlier turn adds 500 tokens to later prompts. Costs use $2 and $10 per million tokens and cached reads at a tenth. 10 turns cost $0.099 with full history and no caching; 60 turns cost far more.",
    "A window of four turns forgets in 25% of conversations, a summary in 6% (6% extra cost). Caching covers 82% of full-history input, 30% of a sliding window and 50% of a summary. Routing chatty turns to a small model saves 30% and loses 3 points. The heaviest 1% of users spend 40%; a request limit cuts it to 15% and throttles 3% of honest users, a token budget 10% and 0.5%. Round figures.",
  ],
  sources: [PROMPT_CACHE, STREAMING, CTX],
  verify: [
    { id: "forecast", claim: "A 10-turn conversation with full history costs $0.099", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: {}, metric: "costPerConversation" }, expect: { min: 0.098, max: 0.1 } },
    { id: "long", claim: "A 60-turn conversation costs about $2", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: {}, metric: "longConversationCost" }, expect: { min: 1.9, max: 2.1 } },
    { id: "window", claim: "A four-turn window forgets in 25% of conversations", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { history: "window" }, metric: "forgetRate" }, expect: { min: 0.25, max: 0.25 } },
    { id: "cache", claim: "Caching full history cuts the 10-turn cost to $0.056", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { cache: true }, metric: "costPerConversation" }, expect: { min: 0.05, max: 0.06 } },
    { id: "good", claim: "The full design costs $0.036 for 10 turns and $0.49 for 60", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { stream: true, history: "full", cache: true, route: true, limit: "tokens" }, metric: "longConversationCost" }, expect: { min: 0.48, max: 0.5 } },
    { id: "good-cost", claim: "…$0.036 for 10 turns", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { stream: true, history: "full", cache: true, route: true, limit: "tokens" }, metric: "costPerConversation" }, expect: { min: 0.035, max: 0.038 } },
    { id: "ttft", claim: "Streaming shows text within 1.5 seconds", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { stream: true, history: "full", cache: true }, metric: "ttftSec" }, expect: { max: 1.5 } },
    { id: "limit", claim: "A token budget throttles 0.5%, a request limit 3%", run: "lab", params: { model: "chatsvc-lab", config: CSC, values: { limit: "requests" }, metric: "legitThrottled" }, expect: { min: 0.03, max: 0.03 } },
  ],
});
