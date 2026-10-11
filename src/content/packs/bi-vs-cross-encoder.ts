import { definePack } from "../define";

export const ENC = { start: { mode: "bi", k: 100, reranker: "cross" } };
export const ENC_CHALLENGE = { lockMode: true, mode: "two", start: { mode: "two", k: 20, reranker: "cross" } };

const SBERT = { id: "sbert-2019", title: "N. Reimers and I. Gurevych (2019), Sentence-BERT: bi-encoders and the cost of cross-encoding all pairs, EMNLP", url: "https://arxiv.org/abs/1908.10084" };
const MONOBERT = { id: "nogueira-2019", title: "R. Nogueira and K. Cho (2019), Passage Re-ranking with BERT (cross-encoder reranking)", url: "https://arxiv.org/abs/1901.04085" };
const DPR = { id: "dpr-2020", title: "V. Karpukhin et al. (2020), Dense Passage Retrieval for Open-Domain Question Answering, EMNLP", url: "https://arxiv.org/abs/2004.04906" };

export default definePack({
  id: "bi-vs-cross-encoder",
  title: "Bi-encoders vs Cross-encoders",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "info", title: "Search quality review", detail: "the right document is in the top 100 but rarely in the top 3" },
    lines: [
      { speaker: "kabir", line: "Our search nearly always finds the right document somewhere in the first hundred. It just is not near the top, and users only look at three." },
      { speaker: "meera", line: "The fast model finds candidates, the slow model reads them properly. They are different tools for different stages." },
    ],
  },
  predictions: [
    {
      id: "all-pairs",
      kind: "choice",
      prompt: "A cross-encoder reads a query and a document together and scores them very accurately, at about 0.5 ms per pair. You have 1 million documents. How long does it take to score the query against all of them?",
      options: [
        { id: "ms", label: "A few milliseconds" },
        { id: "sec", label: "About a minute" },
        { id: "mins", label: "About 8 minutes per query" },
        { id: "days", label: "Several days" },
      ],
      answer: "mins",
      observe: "all-cross",
      reveal: {
        text: "A million pairs at half a millisecond is 500,000 ms, over 8 minutes for a single query. A cross-encoder cannot be precomputed because it needs the query, so it cannot be the first stage over a large corpus.",
        derived: true,
        line: { speaker: "meera", line: "Accuracy you can only afford on a hundred documents is still accuracy, on the right hundred." },
      },
    },
  ],
  widget: { id: "rerank-lab", config: ENC },
  mechanism: [
    {
      id: "bi",
      scene: "bi",
      text: "A bi-encoder embeds the query and each document separately, and compares the vectors. Documents are embedded ahead of time and indexed, so searching a million of them costs one query embedding and a fast nearest-neighbour lookup, about 15 ms. The price is that the model never sees the query and document together.",
      sourceIds: ["sbert-2019", "dpr-2020"],
    },
    {
      id: "cross",
      scene: "cross",
      text: "A cross-encoder feeds the query and a document through the model together, so every word of one can attend to every word of the other. It judges relevance far more accurately, but nothing can be precomputed: every query-document pair is a fresh model call, so scoring a whole corpus is out of reach.",
      sourceIds: ["nogueira-2019", "sbert-2019"],
    },
    {
      id: "two",
      scene: "two",
      text: "Use both. The bi-encoder retrieves the top K candidates quickly, and the cross-encoder reorders just those. Recall at K caps what the reranker can find, so K must be large enough to include the right document, but small enough for the reranker's latency, since cost grows with K.",
      derived: true,
    },
    {
      id: "choose-k",
      text: "Choose K from the recall curve. It rises quickly and then flattens, while latency grows in a straight line, so there is a knee. Measure recall at K on your own queries, then pick the smallest K that gets recall near what you need, and check the latency budget.",
    },
  ],
  challenges: [
    {
      id: "two-stage",
      title: "Pick K for the reranker",
      brief: "A million documents. The bi-encoder finds the top K candidates; a cross-encoder reranks them. Get the right document into the top 3 at least 85% of the time while keeping latency at or under 200 ms.",
      line: { speaker: "rao", line: "More candidates means more reranker calls on every query, so I want K as small as it can be and still work." },
      widget: { id: "rerank-lab", config: ENC_CHALLENGE },
      conditions: [
        { metric: "precisionAt3", op: ">=", value: 0.85, label: "Right document in the top 3 at least 85% of the time" },
        { metric: "latencyMs", op: "<=", value: 200, label: "Latency at most 200 ms" },
      ],
      stars: [{ metric: "latencyMs", op: "<=", value: 180, label: "Latency at most 180 ms" }],
      hints: [
        "What does the first stage's recall at K cap?",
        "How does latency grow with K?",
        "Find the K where both limits are met: enough recall, not too much time.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare bi-encoders and cross-encoders for retrieval, and explain the two-stage design.",
    rubric: [
      { id: "bi", criterion: "A bi-encoder embeds query and documents separately, so document vectors can be precomputed and searched fast", keyIdea: "precomputed, fast, less accurate" },
      { id: "cross", criterion: "A cross-encoder reads the pair together and is more accurate, but needs a model call per pair, so it is too slow for a whole corpus", keyIdea: "joint reading, slow" },
      { id: "two", criterion: "Retrieve top K with the bi-encoder and rerank them with the cross-encoder, choosing K from recall versus latency", keyIdea: "retrieve then rerank, choose K" },
    ],
    exemplar:
      "A bi-encoder embeds the query and each document separately, so document vectors are precomputed and a nearest-neighbour index finds candidates in milliseconds, though it is less accurate. A cross-encoder reads the query and a document together and judges relevance better, but it needs a model call for every pair, so it cannot score a whole corpus. I retrieve the top K with the bi-encoder and rerank them with the cross-encoder, picking K from the recall curve and the latency budget.",
  },
  reviews: [
    {
      id: "bc-est",
      format: "estimate",
      scenario: "A cross-encoder scores about 2,000 query-document pairs a second in batches. How long does it take to rerank the top 100 candidates?",
      unit: "ms",
      answer: 50,
      acceptFactor: 1.2,
      breakdown: ["100 pairs ÷ 2,000 per second", "= 0.05 s", "= 50 ms"],
      explain: "Reranking a hundred candidates is cheap. Reranking all documents would not be.",
    },
    {
      id: "bc-pick",
      format: "pick-fix",
      scenario: "Search results often contain the right document at ranks 20 to 50, and users only see the top 5. Which change helps most?",
      options: [
        { id: "a", label: "Add a cross-encoder reranker over the top 100 candidates" },
        { id: "b", label: "Show 50 results per page" },
        { id: "c", label: "Re-embed with a larger vector size and no other change" },
        { id: "d", label: "Lower the similarity threshold" },
      ],
      answer: "a",
      explain: "The first stage already finds the right document; the problem is ordering. A reranker reads query and document together and moves it up.",
    },
    {
      id: "bc-pick2",
      format: "pick-fix",
      scenario: "A reranker is added and results do not improve for a query whose right document is not in the candidate list. Why?",
      options: [
        { id: "a", label: "A reranker can only reorder candidates the first stage retrieved; recall at K caps it" },
        { id: "b", label: "The reranker is too accurate" },
        { id: "c", label: "Cross-encoders cannot handle long queries" },
        { id: "d", label: "The index is too small" },
      ],
      answer: "a",
      explain: "If the right document is not among the K candidates, no reranker can find it. Raise K, improve the first stage, or add hybrid retrieval.",
    },
    {
      id: "bc-order",
      format: "order",
      scenario: "Order these by precision at 3, lowest first, for a million documents.",
      items: [
        { id: "bi", label: "Bi-encoder only" },
        { id: "two20", label: "Bi-encoder top 20, reranked" },
        { id: "two300", label: "Bi-encoder top 300, reranked" },
        { id: "all", label: "Cross-encoder on every document (not practical)" },
      ],
      answer: ["bi", "two20", "two300", "all"],
      explain: "Each step reads more documents with the accurate model. The last is the ceiling and the impractical one.",
    },
    {
      id: "bc-graph",
      format: "predict-graph",
      scenario: "Raise K, the number of candidates reranked, from 10 to 2,000. How does the chance the right document is in the final top 3 change?",
      xLabel: "K →",
      yLabel: "right document in the top 3",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "knee", label: "Rises quickly, then flattens", points: [1, 4.5, 6, 6.8, 7.2, 7.5, 7.6, 7.7] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "peak", label: "Rises, then falls", points: [1, 4, 6, 7, 7, 6.5, 6, 5] },
      ],
      answer: "knee",
      explain: "Recall at K rises quickly as K grows and then flattens, so most of the gain comes from the first few hundred candidates while latency keeps growing in a straight line.",
    },
    {
      id: "bc-explain",
      format: "explain",
      scenario: "In two sentences: why can a bi-encoder be fast while a cross-encoder cannot?",
      rubric: [
        { id: "precompute", criterion: "A bi-encoder embeds documents independently of the query, so document vectors can be computed and indexed in advance" },
        { id: "pair", criterion: "A cross-encoder needs the query and document together, so each pair is a new model call at query time" },
      ],
      exemplar: "A bi-encoder embeds documents without the query, so their vectors are computed once and indexed for fast lookup. A cross-encoder needs the query and the document together, so every pair requires a fresh model call at query time.",
      explain: "Anything that depends on the query cannot be precomputed.",
    },
  ],
  codex: {
    oneLiner: "Bi-encoders embed separately, so search is fast. Cross-encoders read pairs together, so they are accurate but slow. Retrieve with one, rerank with the other.",
    keyNumbers: [
      { label: "Bi-encoder lookup", value: "about 15 ms over a million documents (ANN)", sourceId: "dpr-2020" },
      { label: "Cross-encoder cost", value: "one model call per query-document pair", sourceId: "nogueira-2019" },
    ],
    tradeoffs: [
      { choice: "Bi-encoder only", gain: "Fast; scales to billions", cost: "Lower accuracy at the top of the list" },
      { choice: "Cross-encoder reranking", gain: "Much better ordering of the top results", cost: "Latency and cost grow with K; capped by first-stage recall" },
    ],
    seenIn: ["Search stacks that retrieve 100 candidates and rerank to 5.", "Cross-encoder rerank APIs and models in RAG pipelines."],
    interviewAngle: "Explain the cascade: 'cheap recall-oriented retrieval over everything, then an accurate model on a few hundred candidates, with K set from the recall curve.'",
    aws: [{ concept: "Reranking", service: "Amazon Bedrock Knowledge Bases reranking models; Cohere Rerank on Bedrock" }],
    replay: { id: "rerank-lab", config: { ...ENC, start: { mode: "cross-all", k: 100, reranker: "cross" } }, scene: "cross" },
  },
  interview: [
    "What is the difference between a bi-encoder and a cross-encoder?",
    "Why not use a cross-encoder for the whole corpus?",
    "How would you choose how many candidates to rerank?",
  ],
  deeper: [
    {
      title: "Why joint reading is more accurate",
      body: "When the query and document are processed together, self-attention can relate each word of the query to each word of the document, noticing that a negation, a number, or a name in the document changes whether it answers the question. A bi-encoder must squeeze the whole document into one vector before it has seen the question, which loses those fine-grained interactions.",
      sourceIds: ["nogueira-2019"],
    },
  ],
  honestPhysics: [
    "Relevant and irrelevant documents are separated by d standard deviations of score noise: 4.5 for the bi-encoder, 6 for a cross-encoder, 7 for an LLM reranker. These separations are illustrative; measure your own.",
    "The first stage returns the top K of a million documents; recall at K is the chance the right document is among them. Precision at 3 is that chance times the reranker's chance of placing it in the top three of K.",
    "Bi-encoder search costs about 15 ms through an ANN index and a cross-encoder about 0.5 ms per candidate when batched.",
  ],
  sources: [SBERT, MONOBERT, DPR],
  verify: [
    { id: "all", claim: "Scoring every document with a cross-encoder takes minutes per query", run: "lab", params: { model: "rerank-lab", config: ENC, values: { mode: "cross-all" }, metric: "latencyMs" }, expect: { min: 300000 } },
    { id: "bi", claim: "A bi-encoder alone puts the right document in the top 3 less than half the time", run: "lab", params: { model: "rerank-lab", config: ENC, values: { mode: "bi" }, metric: "precisionAt3" }, expect: { max: 0.55 } },
    { id: "k100", claim: "K = 100 is too low for 85%", run: "lab", params: { model: "rerank-lab", config: ENC_CHALLENGE, values: { k: 100 }, metric: "precisionAt3" }, expect: { max: 0.85 } },
    { id: "k300", claim: "K = 300 reaches 85%", run: "lab", params: { model: "rerank-lab", config: ENC_CHALLENGE, values: { k: 300 }, metric: "precisionAt3" }, expect: { min: 0.85 } },
    { id: "k300-lat", claim: "…in 165 ms", run: "lab", params: { model: "rerank-lab", config: ENC_CHALLENGE, values: { k: 300 }, metric: "latencyMs" }, expect: { max: 200 } },
    { id: "k500", claim: "K = 500 is over the latency limit", run: "lab", params: { model: "rerank-lab", config: ENC_CHALLENGE, values: { k: 500 }, metric: "latencyMs" }, expect: { min: 200 } },
  ],
});
