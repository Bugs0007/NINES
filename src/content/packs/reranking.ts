import { definePack } from "../define";

export const RERANK = { lockMode: true, mode: "two", start: { mode: "two", k: 50, reranker: "cross" } };

const NOGUEIRA = { id: "nogueira-2019", title: "R. Nogueira and K. Cho (2019), Passage Re-ranking with BERT", url: "https://arxiv.org/abs/1901.04085" };
const RANKGPT = { id: "rankgpt-2023", title: "W. Sun et al. (2023), Is ChatGPT Good at Search? Investigating Large Language Models as Re-Ranking Agents, EMNLP", url: "https://arxiv.org/abs/2304.09542" };
const COHERE_RERANK = { id: "cohere-rerank", title: "Cohere docs: Rerank overview (reranking retrieved documents to improve relevance)", url: "https://docs.cohere.com/docs/rerank-overview" };
const LIU = { id: "liu-2023", title: "N. Liu et al. (2023), Lost in the Middle: How Language Models Use Long Contexts, TACL", url: "https://arxiv.org/abs/2307.03172" };

export default definePack({
  id: "reranking",
  title: "Reranking",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "RAG pipeline · answer quality review", detail: "the model gets 10 passages; the one that matters is usually fourth" },
    lines: [
      { speaker: "kabir", line: "We send the model ten passages and the one it needs is usually somewhere in the middle. It sometimes answers from the wrong one." },
      { speaker: "meera", line: "Retrieve wide, then rerank narrow. A better order and a shorter list both help the model." },
    ],
  },
  predictions: [
    {
      id: "llm-rerank",
      kind: "choice",
      prompt: "An LLM reranker is the most accurate option at about 3 ms and $0.0005 per candidate. You rerank 300 candidates per query. Roughly what does that add to latency and cost per query?",
      options: [
        { id: "small", label: "A few milliseconds and a fraction of a cent" },
        { id: "mid", label: "About a second and 15 cents" },
        { id: "big", label: "About a minute and $15" },
        { id: "none", label: "Nothing; reranking is free" },
      ],
      answer: "mid",
      observe: "two-stage",
      reveal: {
        text: "300 candidates at 3 ms each is 900 ms, and at $0.0005 each is $0.15 per query. At a million queries a month that is $150,000 for the best accuracy, which is why reranking depth and reranker choice are real design decisions.",
        derived: true,
        line: { speaker: "rao", line: "Fifteen cents a query is a lot of tokens. Make it earn that." },
      },
    },
  ],
  widget: { id: "rerank-lab", config: RERANK },
  mechanism: [
    {
      id: "why",
      text: "First-stage retrieval is tuned for recall: find everything that might be relevant, quickly. It orders candidates imperfectly because it never reads query and document together. A reranker is a slower, more accurate model applied only to those candidates, to put the best at the top.",
      sourceIds: ["nogueira-2019"],
    },
    {
      id: "kinds",
      scene: "two",
      text: "There are two common kinds. A cross-encoder reranker, such as the BERT-style rerankers behind rerank APIs, scores each query and passage pair in a fraction of a millisecond. An LLM reranker asks a language model to order the passages, which is more flexible and often more accurate and costs far more per candidate.",
      sourceIds: ["nogueira-2019", "rankgpt-2023", "cohere-rerank"],
    },
    {
      id: "depth",
      scene: "two",
      text: "Depth is the dial. The reranker can only reorder what the first stage found, so recall at K caps the result, and both latency and cost grow with K. Reranking more candidates buys recall with diminishing returns, so pick the smallest K that reaches the accuracy you need.",
      derived: true,
    },
    {
      id: "model",
      text: "Reranking also shortens the context. Sending the model the top three reranked passages instead of ten unranked ones means fewer tokens to pay for, and avoids burying the right passage in the middle, where models use long contexts least reliably.",
      sourceIds: ["liu-2023"],
    },
  ],
  challenges: [
    {
      id: "rerank-budget",
      title: "Rerank within budget",
      brief: "A million documents; the first stage returns the top K candidates for reranking. Choose K and the reranker so the right document is in the top 3 at least 85% of the time, at most 250 ms and at most 1 cent per query.",
      line: { speaker: "rao", line: "I will pay for accuracy up to a cent a query. After that you need to explain yourself." },
      widget: { id: "rerank-lab", config: RERANK },
      conditions: [
        { metric: "precisionAt3", op: ">=", value: 0.85, label: "Right document in the top 3 at least 85% of the time" },
        { metric: "latencyMs", op: "<=", value: 250, label: "At most 250 ms" },
        { metric: "costUsd", op: "<=", value: 0.01, label: "At most $0.01 per query" },
      ],
      stars: [{ metric: "costUsd", op: "<=", value: 0.005, label: "At most half a cent per query" }],
      hints: [
        "What does each reranker cost per candidate, in time and money?",
        "How does the right document's chance of reaching the top 3 grow with K?",
        "Find the smallest K that clears 85%, then check which reranker fits the budget.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why and how to add a reranker to a retrieval pipeline, and what limits it.",
    rubric: [
      { id: "why", criterion: "First-stage retrieval optimises recall and orders imperfectly; a reranker reads query and candidate together to reorder the top", keyIdea: "recall first, then precision" },
      { id: "depth", criterion: "Depth K trades accuracy against latency and cost, and recall at K caps the result", keyIdea: "choose K" },
      { id: "kinds", criterion: "Cross-encoders are cheap and fast, LLM rerankers more accurate but much more expensive; also shortens the context sent to the model", keyIdea: "cross-encoder versus LLM" },
    ],
    exemplar:
      "The first stage is tuned for recall and orders candidates imperfectly because it never reads the query and document together. A reranker, a cross-encoder or an LLM, reads each candidate with the query and reorders the top K. K trades accuracy against latency and cost, and recall at K caps what it can find. Cross-encoders are fast and cheap while LLM rerankers are more accurate and far costlier, and either one lets me send the model fewer, better passages.",
  },
  reviews: [
    {
      id: "rr-est",
      format: "estimate",
      scenario: "A cross-encoder reranker costs 0.5 ms and $0.00001 per candidate. You rerank 200 candidates per query. About how long does the reranking step take?",
      unit: "ms",
      answer: 100,
      acceptFactor: 1.2,
      breakdown: ["200 × 0.5 ms", "= 100 ms"],
      explain: "Reranking depth is paid on every query. Batching candidates through a GPU helps, but the cost still grows with K.",
    },
    {
      id: "rr-pick",
      format: "pick-fix",
      scenario: "The right passage is in the retrieved top 20 about 95% of the time, but only in the final top 3 about 60% of the time. What is the best investment?",
      options: [
        { id: "a", label: "A reranker over the top 20, to improve the ordering" },
        { id: "b", label: "A bigger embedding model to raise recall at 20" },
        { id: "c", label: "More chunk overlap" },
        { id: "d", label: "Retrieve the top 200 instead" },
      ],
      answer: "a",
      explain: "Recall is already high, so the problem is ordering. A reranker targets that directly; retrieving more would add noise.",
    },
    {
      id: "rr-pick2",
      format: "pick-fix",
      scenario: "The right passage is in the top 3 only 40% of the time, and in the top 100 only 55% of the time. A reranker is proposed. What is the likely outcome?",
      options: [
        { id: "a", label: "Limited gains: the reranker cannot reorder passages the first stage did not retrieve, so fix recall first" },
        { id: "b", label: "Large gains; rerankers fix everything" },
        { id: "c", label: "Quality gets worse" },
        { id: "d", label: "Latency drops" },
      ],
      answer: "a",
      explain: "Recall at K caps reranking. When the right passage is missing from the candidates, improve retrieval with better chunking, hybrid search, or query rewriting before reranking.",
    },
    {
      id: "rr-order",
      format: "order",
      scenario: "Order these rerankers by cost per query for 300 candidates, cheapest first.",
      items: [
        { id: "none", label: "No reranker" },
        { id: "cross", label: "Cross-encoder reranker" },
        { id: "llm", label: "LLM reranker" },
        { id: "llm-big", label: "LLM reranker over 1,000 candidates" },
      ],
      answer: ["none", "cross", "llm", "llm-big"],
      explain: "Cost grows with both the per-candidate price and the number of candidates.",
    },
    {
      id: "rr-graph",
      format: "predict-graph",
      scenario: "Hold the reranker fixed and raise the number of candidates K from 10 to 1,000. How does latency change?",
      xLabel: "K →",
      yLabel: "latency",
      options: [
        { id: "flat", label: "Flat", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "linear", label: "Grows in proportion to K", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "log", label: "Grows slowly with the log of K", points: [1, 2, 2.6, 3, 3.3, 3.5, 3.7, 3.8] },
        { id: "hockey", label: "Flat, then shoots up", points: [1, 1, 1, 1.2, 1.6, 2.6, 5, 12] },
      ],
      answer: "linear",
      explain: "Each candidate is a model call, so latency and cost grow in proportion to K. Batching changes the slope, not the shape.",
    },
    {
      id: "rr-explain",
      format: "explain",
      scenario: "In two sentences: why can reranking let you send the model fewer passages?",
      rubric: [
        { id: "order", criterion: "A reranker puts the most relevant passages at the top, so the top few carry the answer" },
        { id: "tokens", criterion: "Fewer passages mean fewer tokens in the prompt, lower cost, and less chance of the right one being buried" },
      ],
      exemplar: "A reranker puts the most relevant passages first, so the top three or four hold what the model needs. Sending fewer passages saves tokens and avoids burying the key one among less relevant text.",
      explain: "Better order is smaller context.",
    },
  ],
  codex: {
    oneLiner: "Retrieve wide for recall, then rerank the top K with a more accurate model. K and the reranker trade accuracy against latency and cost.",
    keyNumbers: [
      { label: "Cross-encoder reranker", value: "about 0.5 ms per candidate in the lab", sourceId: "nogueira-2019" },
      { label: "LLM reranker", value: "about 3 ms and $0.0005 per candidate in the lab", sourceId: "rankgpt-2023" },
    ],
    tradeoffs: [
      { choice: "Cross-encoder reranker", gain: "Strong accuracy gain for little latency", cost: "Needs hosting or an API; capped by first-stage recall" },
      { choice: "LLM reranker", gain: "Most accurate and flexible", cost: "Latency and money per candidate" },
      { choice: "Deeper K", gain: "Higher chance the answer is in the pool", cost: "More reranker calls on every query" },
    ],
    seenIn: ["Rerank endpoints in vector search APIs.", "RAG pipelines that retrieve 50 to 100 and keep 3 to 5."],
    interviewAngle: "Give the cascade and its numbers: 'retrieve a hundred or so for recall, rerank to the top five, K chosen from the recall curve against a latency and cost budget.'",
    aws: [{ concept: "Reranking", service: "Amazon Bedrock rerank models and Knowledge Bases reranking" }],
    replay: { id: "rerank-lab", config: RERANK, scene: "two" },
  },
  interview: [
    "Why add a reranker to a RAG pipeline?",
    "How would you choose how many candidates to rerank?",
    "What would you check before adding a reranker?",
  ],
  deeper: [
    {
      title: "Listwise versus pointwise reranking",
      body: "A cross-encoder usually scores each passage independently (pointwise), which parallelises well. An LLM can instead read several passages at once and output an order (listwise), which lets it compare them directly and often ranks better, but the prompt grows with the list and the model's context limits and ordering biases come into play. Sliding windows over the candidate list are a common workaround.",
      sourceIds: ["rankgpt-2023"],
    },
  ],
  honestPhysics: [
    "Relevant and irrelevant documents are separated by d standard deviations of score noise: 4.5 for the first-stage bi-encoder, 6 for a cross-encoder, 7 for an LLM reranker. These separations are illustrative; measure your own.",
    "The first stage costs 15 ms. A cross-encoder costs about 0.5 ms and $0.00001 per candidate, an LLM reranker about 3 ms and $0.0005.",
    "Precision at 3 is first-stage recall at K times the reranker's chance of ranking the right document in the top 3 of K.",
  ],
  sources: [NOGUEIRA, RANKGPT, COHERE_RERANK, LIU],
  verify: [
    { id: "llm-300", claim: "An LLM reranker over 300 candidates costs about 15 cents and nearly a second", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 300, reranker: "llm" }, metric: "costUsd" }, expect: { min: 0.14, max: 0.16 } },
    { id: "llm-ms", claim: "…and takes under a second", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 300, reranker: "llm" }, metric: "latencyMs" }, expect: { min: 800, max: 1000 } },
    { id: "cross-300", claim: "A cross-encoder over 300 candidates meets all three limits (accuracy)", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 300, reranker: "cross" }, metric: "precisionAt3" }, expect: { min: 0.85 } },
    { id: "cross-300-ms", claim: "…latency", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 300, reranker: "cross" }, metric: "latencyMs" }, expect: { max: 250 } },
    { id: "cross-300-cost", claim: "…and cost", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 300, reranker: "cross" }, metric: "costUsd" }, expect: { max: 0.01 } },
    { id: "small-k", claim: "K = 50 does not reach 85%", run: "lab", params: { model: "rerank-lab", config: RERANK, values: { k: 50, reranker: "cross" }, metric: "precisionAt3" }, expect: { max: 0.85 } },
  ],
});
