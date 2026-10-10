import { definePack } from "../define";

export const RRF = { start: { method: "bm25", k: 60 } };

const CORMACK = { id: "cormack-2009", title: "G. Cormack, C. Clarke, S. Büttcher (2009), Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods, ACM SIGIR", url: "https://doi.org/10.1145/1571941.1572114" };
const ELASTIC_RRF = { id: "elastic-rrf", title: "Elasticsearch docs: Reciprocal rank fusion (RRF) for hybrid search (rank_constant default 60)", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html" };
const BEIR = { id: "beir-2021", title: "N. Thakur et al. (2021), BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models", url: "https://arxiv.org/abs/2104.08663" };

export default definePack({
  id: "hybrid-search-rrf",
  title: "Hybrid Search & Rank Fusion",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Search quality · two kinds of failure", detail: "keyword misses paraphrases; vectors miss error codes" },
    lines: [
      { speaker: "kabir", line: "Keyword search nails 'E-4417' but fails on 'my card keeps getting rejected', and vector search is the opposite. Why can we not use both?" },
      { speaker: "meera", line: "You can, but the two lists use scores on different scales. Adding them is the first mistake everyone makes." },
    ],
  },
  predictions: [
    {
      id: "sum",
      kind: "choice",
      prompt: "You combine a BM25 score (typically 3 to 15) with a cosine similarity (between 0 and 1) by adding them. What effect does the combined ranking mostly reflect?",
      options: [
        { id: "equal", label: "Both retrievers equally" },
        { id: "bm25", label: "Mostly BM25: its scores are far larger, so the vector score barely moves the ranking" },
        { id: "vector", label: "Mostly the vectors" },
        { id: "random", label: "Neither; it is random" },
      ],
      answer: "bm25",
      observe: "scale-trap",
      reveal: {
        text: "A keyword score of 9 and a vector score of 0.7 add to 9.7, where the keyword part is more than 90% of the sum. The two scores live on unrelated scales, so adding them silently hands the ranking to whichever scale is bigger.",
        derived: true,
        line: { speaker: "meera", line: "Never add numbers that were not measured in the same unit." },
      },
    },
  ],
  widget: { id: "rrf-lab", config: RRF },
  mechanism: [
    {
      id: "lists",
      scene: "lists",
      text: "Each retriever fails where the other succeeds. Keyword search wins on exact identifiers, names, and rare terms; vector search wins on paraphrase and intent. A hybrid system runs both and merges the two ranked lists into one.",
      sourceIds: ["beir-2021"],
    },
    {
      id: "scores",
      scene: "scores",
      text: "Merging by raw score is fragile. BM25 scores are unbounded and depend on the corpus; cosine scores are bounded and depend on the model. You can normalise them, but the normalisation shifts with each query's score distribution, which makes tuning a weight a constant chore.",
      derived: true,
    },
    {
      id: "rrf",
      scene: "rrf",
      text: "Reciprocal rank fusion ignores scores and uses ranks. A document's fused score is the sum over lists of 1 ÷ (k + rank). A document both lists like gets two contributions and rises, a document one list loves still scores, and no calibration is needed. The constant k, 60 in the original paper, controls how much top ranks dominate.",
      sourceIds: ["cormack-2009", "elastic-rrf"],
    },
    {
      id: "limits",
      text: "RRF is a robust default, not a ceiling. It cannot rescue a document neither list found, a reranker can reorder the fused list for more accuracy, and learned fusion can beat it when you have labelled data. Start with RRF, measure, and add complexity only when the numbers justify it.",
    },
  ],
  challenges: [
    {
      id: "fuse",
      title: "Make the answer reach the top 3",
      brief: "Five test queries: some need exact words, some need meaning, some both. Choose how the two ranked lists are combined so the right document is in the top 3 for all five queries, with a mean reciprocal rank of at least 0.6.",
      line: { speaker: "kabir", line: "Neither retriever is wrong. Each is only right for some of the queries." },
      widget: { id: "rrf-lab", config: RRF },
      conditions: [
        { metric: "inTop3", op: ">=", value: 5, label: "Right document in the top 3 for all 5 queries" },
        { metric: "mrr", op: ">=", value: 0.6, label: "Mean reciprocal rank at least 0.6" },
      ],
      stars: [{ metric: "worstRank", op: "<=", value: 2, label: "The worst query still has the answer at rank 2 or better" }],
      hints: [
        "How many queries does each retriever answer in the top 3 on its own?",
        "What does adding the raw scores do to the vector list?",
        "Which combination uses only ranks, with no calibration?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why combine keyword and vector search, and why use reciprocal rank fusion instead of adding scores?",
    rubric: [
      { id: "why", criterion: "They fail on different queries: keywords for exact terms and IDs, vectors for meaning and paraphrase", keyIdea: "complementary failures" },
      { id: "scale", criterion: "Raw scores are on different, unrelated scales, so adding them lets the larger scale dominate", keyIdea: "incomparable scales" },
      { id: "rrf", criterion: "RRF uses ranks: sum of 1 ÷ (k + rank) over lists, so no calibration is needed and agreement between lists is rewarded", keyIdea: "rank-based fusion" },
    ],
    exemplar:
      "Keyword and vector search fail on different queries: keywords miss paraphrases and vectors miss exact codes, so I run both. I do not add their scores because BM25 and cosine live on unrelated scales and the larger one would dominate. Reciprocal rank fusion sums 1 over k plus rank across the lists, so it needs no calibration and rewards documents both lists rank well.",
  },
  reviews: [
    {
      id: "rf-est",
      format: "estimate",
      scenario: "A document is ranked 1st in the keyword list and 3rd in the vector list. With k = 60, what is its RRF score? (1 ÷ (60 + 1) + 1 ÷ (60 + 3))",
      unit: "score",
      answer: 0.0323,
      acceptFactor: 1.1,
      breakdown: ["1 ÷ 61 = 0.01639", "1 ÷ 63 = 0.01587", "sum = 0.03226"],
      explain: "Scores are small numbers; only their order matters. A document in both lists beats one that tops a single list.",
    },
    {
      id: "rf-pick",
      format: "pick-fix",
      scenario: "A team normalises BM25 scores to 0 to 1 per query and adds them to cosine scores with a tuned weight. It works in testing and drifts after launch. What is a more robust alternative?",
      options: [
        { id: "a", label: "Reciprocal rank fusion over the two ranked lists" },
        { id: "b", label: "Use only BM25" },
        { id: "c", label: "Re-tune the weight every week by hand" },
        { id: "d", label: "Increase the vector dimension" },
      ],
      answer: "a",
      explain: "Score normalisation depends on each query's distribution, which changes with traffic. RRF uses ranks, which are stable across such shifts.",
    },
    {
      id: "rf-order",
      format: "order",
      scenario: "Order these documents by RRF score (k = 60), highest first.",
      items: [
        { id: "both", label: "Rank 2 in both lists" },
        { id: "top1", label: "Rank 1 in one list, absent from the other" },
        { id: "mid", label: "Rank 5 in one list, absent from the other" },
        { id: "low", label: "Rank 20 in one list, absent from the other" },
      ],
      answer: ["both", "top1", "mid", "low"],
      explain: "Two mid-high contributions beat one top contribution, and contributions fall as rank worsens.",
    },
    {
      id: "rf-graph",
      format: "predict-graph",
      scenario: "Raise RRF's constant k from 1 to 100. How does the difference in score between rank 1 and rank 10 change?",
      xLabel: "k →",
      yLabel: "gap between rank 1 and rank 10",
      options: [
        { id: "grows", label: "Grows", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "shrinks", label: "Shrinks: a larger k flattens the difference between ranks", points: [8, 4, 2.3, 1.5, 1.1, 0.9, 0.8, 0.7] },
        { id: "flat", label: "Stays the same", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "step", label: "Jumps then flat", points: [1, 8, 8, 8, 8, 8, 8, 8] },
      ],
      answer: "shrinks",
      explain: "Rank 1 versus rank 10 differs by 1 ÷ (k+1) − 1 ÷ (k+10). As k grows the two terms converge, so top ranks matter less relative to agreement between lists.",
    },
    {
      id: "rf-flaw",
      format: "spot-flaw",
      scenario: "Hybrid search adds BM25 scores of up to 15 to cosine scores of 0 to 1, and the team concludes 'vectors do not help' because results look the same as keyword-only. Tap the step that explains it.",
      diagram: {
        nodes: [
          { id: "bm25", label: "BM25 scores 3 to 15", kind: "store", col: 0, row: 0 },
          { id: "vec", label: "cosine scores 0 to 1", kind: "store", col: 0, row: 2 },
          { id: "sum", label: "ranking = BM25 + cosine", kind: "server", col: 1, row: 1 },
        ],
        edges: [
          { from: "bm25", to: "sum" },
          { from: "vec", to: "sum" },
        ],
      },
      answer: "sum",
      explain: "The BM25 term is ten times larger than the vector term, so the sum is nearly the keyword ranking. Fuse by rank, or normalise both with care.",
    },
    {
      id: "rf-explain",
      format: "explain",
      scenario: "In two sentences: why does RRF reward a document that appears in both lists?",
      rubric: [
        { id: "sum", criterion: "Its fused score is the sum of a contribution from each list, so appearing in both adds two contributions" },
        { id: "agree", criterion: "Agreement between independent retrievers is evidence of relevance, so such a document should rise" },
      ],
      exemplar: "RRF adds a 1 over k plus rank contribution for each list a document appears in, so a document in both lists gets two. Agreement between independent retrievers is evidence it is relevant.",
      explain: "Two independent votes beat one loud one.",
    },
  ],
  codex: {
    oneLiner: "Run keyword and vector search and fuse the ranks: RRF sums 1 ÷ (k + rank), needs no score calibration, and rewards agreement.",
    keyNumbers: [
      { label: "RRF score", value: "Σ 1 ÷ (k + rank) over lists", sourceId: "cormack-2009" },
      { label: "Typical k", value: "60", sourceId: "elastic-rrf" },
    ],
    tradeoffs: [
      { choice: "RRF", gain: "Robust, no tuning of score scales", cost: "Ignores score magnitudes and cannot rescue documents neither list found" },
      { choice: "Weighted score fusion", gain: "Can be tuned to your data", cost: "Needs normalisation; drifts with traffic" },
      { choice: "Rerank after fusion", gain: "Better top-of-list ordering", cost: "Extra latency and cost" },
    ],
    seenIn: ["Hybrid search in Elasticsearch, OpenSearch, and vector databases.", "RAG pipelines that merge BM25 and embedding results."],
    interviewAngle: "Say why hybrid and why ranks: 'keyword for exact terms, vectors for meaning, fused by rank so I never compare incomparable scores.'",
    aws: [{ concept: "Hybrid search", service: "Amazon OpenSearch Service hybrid queries; Bedrock Knowledge Bases hybrid search" }],
    replay: { id: "rrf-lab", config: { start: { method: "rrf", k: 60 } }, scene: "rrf" },
  },
  interview: [
    "Why would you use hybrid search?",
    "What is reciprocal rank fusion and why is k 60?",
    "What goes wrong when you add BM25 and cosine scores directly?",
  ],
  deeper: [
    {
      title: "Why 60?",
      body: "The original RRF paper found a k of 60 worked well across test collections, and it has stuck as a default. It is a damping constant: small k makes the top ranks dominate, large k flattens the contributions so agreement between lists matters more. The value is not sacred, and tuning it on your own labelled queries is cheap.",
      sourceIds: ["cormack-2009"],
    },
  ],
  honestPhysics: [
    "Five test queries; each has two ranked lists of ten with the one relevant document placed where the query says, a document both retrievers like, and distractors unique to each list. A document missing from both lists ranks 11th.",
    "Real systems fuse longer lists and evaluate on hundreds of queries, with labels from people.",
    "Raw scores decay geometrically down each list in the lab: 14% a rank for BM25 and 4% for cosine.",
  ],
  sources: [CORMACK, ELASTIC_RRF, BEIR],
  verify: [
    { id: "bm25", claim: "Keyword alone puts the answer in the top 3 for only 3 of 5 queries", run: "lab", params: { model: "rrf-lab", config: RRF, values: { method: "bm25" }, metric: "inTop3" }, expect: { max: 3 } },
    { id: "vec", claim: "Vector alone also misses two", run: "lab", params: { model: "rrf-lab", config: RRF, values: { method: "vec" }, metric: "inTop3" }, expect: { max: 3 } },
    { id: "sum", claim: "Adding raw scores does no better than keyword alone", run: "lab", params: { model: "rrf-lab", config: RRF, values: { method: "sum" }, metric: "inTop3" }, expect: { max: 3 } },
    { id: "rrf", claim: "RRF puts the answer in the top 3 for all five", run: "lab", params: { model: "rrf-lab", config: RRF, values: { method: "rrf", k: 60 }, metric: "inTop3" }, expect: { min: 5 } },
    { id: "rrf-mrr", claim: "…with an MRR of at least 0.6", run: "lab", params: { model: "rrf-lab", config: RRF, values: { method: "rrf", k: 60 }, metric: "mrr" }, expect: { min: 0.6 } },
  ],
});
