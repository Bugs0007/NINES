import { definePack } from "../define";

export const RETEVAL = { start: { system: "bm25", k: 3 } };

const MANNING_EVAL = { id: "manning-eval", title: "C. Manning, P. Raghavan, H. Schütze, Introduction to Information Retrieval, ch. 8: Evaluation in information retrieval (precision, recall, MAP, NDCG)", url: "https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-in-information-retrieval-1.html" };
const JARVELIN = { id: "jarvelin-2002", title: "K. Järvelin and J. Kekäläinen (2002), Cumulated gain-based evaluation of IR techniques (nDCG), ACM TOIS 20(4)", url: "https://doi.org/10.1145/582415.582418" };
const BEIR = { id: "beir-2021", title: "N. Thakur et al. (2021), BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models", url: "https://arxiv.org/abs/2104.08663" };

export default definePack({
  id: "retrieval-eval",
  title: "Retrieval Evaluation: Recall, MRR, nDCG",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "RAG review · 'it seems better'", detail: "three retrievers, no numbers, one confident opinion each" },
    lines: [
      { speaker: "kabir", line: "Everyone has a favourite retriever and a few examples where theirs wins. I would like to stop arguing and look at a number." },
      { speaker: "meera", line: "Label some queries and measure, but pick the number carefully: recall, MRR, and nDCG reward different things." },
    ],
  },
  predictions: [
    {
      id: "which",
      kind: "choice",
      prompt: "Three retrievers are scored on eight labelled queries. Vector search finds relevant documents deep in the top 5 but rarely first; hybrid puts them near the top. Which metric separates them most clearly at k = 3?",
      options: [
        { id: "recall", label: "Recall alone: all find most of them eventually" },
        { id: "ndcg", label: "nDCG or MRR, which reward putting relevant results early" },
        { id: "none", label: "None; they are all the same" },
        { id: "count", label: "The number of results returned" },
      ],
      answer: "ndcg",
      observe: "compared",
      reveal: {
        text: "At k = 5 recall for vector search is already high, so recall barely distinguishes it from hybrid. But hybrid ranks relevant results earlier, so MRR (0.94 versus 0.69 at k = 3) and nDCG (0.92 versus 0.57) separate them sharply. The metric must match what users feel.",
        derived: true,
        line: { speaker: "meera", line: "Recall asks whether it was found. nDCG asks how soon you saw it." },
      },
    },
  ],
  widget: { id: "reteval-lab", config: RETEVAL },
  mechanism: [
    {
      id: "labels",
      text: "Evaluation starts with a labelled set: real queries, each with the documents that should be returned. Without labels you are comparing impressions. A few dozen queries from real users, labelled by people who know the content, beat thousands of invented ones.",
      sourceIds: ["manning-eval", "beir-2021"],
    },
    {
      id: "recall",
      scene: "recall",
      text: "Recall at k is the share of a query's relevant documents found in the top k, and precision at k is the share of the top k that is relevant. Recall matters when the model can only answer from what is retrieved, so a missing document is a missing answer; precision matters when irrelevant passages confuse it or cost tokens.",
      sourceIds: ["manning-eval"],
    },
    {
      id: "mrr",
      scene: "mrr",
      text: "Mean reciprocal rank scores each query by one over the rank of its first relevant result, then averages. First result right is 1, second is 0.5, fifth is 0.2. It suits tasks where one good result is enough, but it ignores everything after the first hit.",
      sourceIds: ["manning-eval"],
    },
    {
      id: "ndcg",
      scene: "ndcg",
      text: "nDCG scores the whole ordering. Each relevant result earns credit discounted by log₂(rank + 1), so early hits count more, and the total is divided by the best possible score for that query, giving a number between 0 and 1. It handles several relevant documents, and graded relevance, better than the others.",
      sourceIds: ["jarvelin-2002"],
    },
  ],
  challenges: [
    {
      id: "pick-retriever",
      title: "Pick the retriever with numbers",
      brief: "Eight labelled queries, three retrievers. Choose the retriever and the number of results considered so that recall is at least 90%, MRR is at least 0.9, and nDCG is at least 0.9.",
      line: { speaker: "kabir", line: "If it wins on one metric and loses on another, I need to know why." },
      widget: { id: "reteval-lab", config: RETEVAL },
      conditions: [
        { metric: "recallAtK", op: ">=", value: 0.9, label: "Recall at least 90%" },
        { metric: "mrr", op: ">=", value: 0.9, label: "MRR at least 0.9" },
        { metric: "ndcg", op: ">=", value: 0.9, label: "nDCG at least 0.9" },
      ],
      stars: [{ metric: "precisionAtK", op: ">=", value: 0.6, label: "Precision at least 60%" }],
      hints: [
        "Which retriever finds the relevant documents early and often?",
        "Which values of k give enough recall without losing precision?",
        "Check all three metrics at once, not one at a time.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare recall@k, MRR, and nDCG, and say when you would use each to evaluate a retriever for RAG.",
    rubric: [
      { id: "recall", criterion: "Recall@k is the share of relevant documents found in the top k, important when the model can only use what is retrieved", keyIdea: "was it found" },
      { id: "mrr", criterion: "MRR rewards ranking the first relevant result high, but ignores later results", keyIdea: "how soon the first hit" },
      { id: "ndcg", criterion: "nDCG scores the whole ranking with a discount by rank, normalised by the ideal order, handling multiple relevant documents", keyIdea: "quality of the whole order" },
    ],
    exemplar:
      "Recall at k tells me whether the relevant documents were found in the top k, which matters most in RAG because the model can only use what it is given. MRR scores how early the first relevant result appears, which suits a task where one good hit is enough, but it ignores everything after. nDCG scores the whole ordering with a discount by rank and normalises by the best possible order, so it handles several relevant documents. I would report all three on a labelled query set.",
  },
  reviews: [
    {
      id: "re-est-mrr",
      format: "estimate",
      scenario: "Over four queries, the first relevant result is at ranks 1, 2, 4, and not found in the top 10 (counts as 0). What is the MRR?",
      unit: "MRR",
      answer: 0.44,
      acceptFactor: 1.15,
      breakdown: ["(1 + 1/2 + 1/4 + 0) ÷ 4", "= 1.75 ÷ 4", "≈ 0.44"],
      explain: "A miss contributes zero and drags the average, so it is worth knowing which queries fail outright.",
    },
    {
      id: "re-est-recall",
      format: "estimate",
      scenario: "A query has 4 relevant documents. The top 5 results contain 3 of them. What are precision@5 and recall@5, as percentages (precision then recall, report recall)?",
      unit: "% recall",
      answer: 75,
      acceptFactor: 1.1,
      breakdown: ["Recall@5 = 3 ÷ 4 = 75%", "Precision@5 = 3 ÷ 5 = 60%"],
      explain: "Recall divides by the relevant documents that exist; precision divides by the results returned.",
    },
    {
      id: "re-pick",
      format: "pick-fix",
      scenario: "A RAG system needs every relevant passage in the model's context to answer multi-part questions, and sends the top 8 results. Which retrieval metric matters most?",
      options: [
        { id: "a", label: "Recall@8: whether all the needed passages were retrieved" },
        { id: "b", label: "MRR: whether the first hit is at the top" },
        { id: "c", label: "Precision@1" },
        { id: "d", label: "Latency only" },
      ],
      answer: "a",
      explain: "Multi-part answers need all the relevant passages, and the model sees all eight at once, so the order inside them matters less than whether they are there.",
    },
    {
      id: "re-order",
      format: "order",
      scenario: "A query has two relevant documents. Order these top-3 lists by nDCG@3, highest first. (R = relevant, N = not.)",
      items: [
        { id: "rrn", label: "R, R, N" },
        { id: "rnr", label: "R, N, R" },
        { id: "nrr", label: "N, R, R" },
        { id: "nnr", label: "N, N, R" },
      ],
      answer: ["rrn", "rnr", "nrr", "nnr"],
      explain: "Relevant results earlier earn more credit. The list with both relevant at the top is ideal, and one relevant result at rank 3 is worst.",
    },
    {
      id: "re-flaw",
      format: "spot-flaw",
      scenario: "A team evaluates retrieval on 12 queries invented by the engineers who built the system, and reports 'nDCG of 0.97, ready to ship'. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "set", label: "12 queries written by the builders", kind: "store", col: 0, row: 1 },
          { id: "metric", label: "nDCG 0.97", kind: "server", col: 1, row: 1 },
        ],
        edges: [{ from: "set", to: "metric" }],
      },
      answer: "set",
      explain: "Builders write queries their system handles, and twelve is too few to say much. Use real user queries, labelled independently, in enough numbers to put error bars on the result.",
    },
    {
      id: "re-explain",
      format: "explain",
      scenario: "In two sentences: why is nDCG a better summary than recall alone when users only look at the top few results?",
      rubric: [
        { id: "order", criterion: "nDCG rewards relevant results appearing early, discounting those that appear later" },
        { id: "recall", criterion: "Recall at k ignores order within the top k, so it cannot distinguish a good ranking from a poor one" },
      ],
      exemplar: "nDCG gives more credit to relevant results near the top, which is where users look. Recall at k only counts whether they appear in the top k, so it cannot tell a good ordering from a bad one.",
      explain: "Position matters because attention is scarce.",
    },
  ],
  codex: {
    oneLiner: "Evaluate retrieval on labelled queries: recall@k for coverage, MRR for the first hit, nDCG for the whole ordering. Report them together.",
    keyNumbers: [
      { label: "MRR", value: "mean of 1 ÷ rank of the first relevant result", sourceId: "manning-eval" },
      { label: "nDCG", value: "DCG ÷ ideal DCG, discounting by log₂(rank + 1)", sourceId: "jarvelin-2002" },
      { label: "Zero-shot benchmark", value: "BEIR: 18 datasets across domains", sourceId: "beir-2021" },
    ],
    tradeoffs: [
      { choice: "Recall@k", gain: "Matches RAG's need to retrieve everything relevant", cost: "Ignores order within the top k" },
      { choice: "MRR", gain: "Simple; good for one-answer tasks", cost: "Ignores later relevant results" },
      { choice: "nDCG", gain: "Rewards the whole ordering and graded relevance", cost: "More complex to compute and explain" },
    ],
    seenIn: ["Retrieval benchmarks such as BEIR and MTEB.", "RAG evaluation reports with recall@k and nDCG@k."],
    interviewAngle: "Name the metric and why: 'recall@k because the model needs all the passages, and nDCG to catch ordering problems, on queries labelled from real traffic.'",
    aws: [{ concept: "Retrieval evaluation", service: "Amazon Bedrock Knowledge Base evaluation jobs (retrieval metrics)" }],
    replay: { id: "reteval-lab", config: RETEVAL, scene: "ndcg" },
  },
  interview: [
    "How would you evaluate a retrieval system?",
    "What is the difference between MRR and nDCG?",
    "How many labelled queries do you need, and where do they come from?",
  ],
  deeper: [
    {
      title: "Where labels come from",
      body: "Good labels are the expensive part. Options are people who know the content marking which documents answer each query, click and feedback logs from production (noisy but plentiful), and a strong LLM acting as a judge, checked against a human-labelled sample. Whatever the source, keep a held-out set that nobody tunes against, and report uncertainty, not a bare number.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Eight labelled queries with the first five results of each system marked relevant or not. Eight is far too few to trust in practice; the point is to compute the metrics by hand.",
    "A real evaluation uses hundreds of queries, labels from people or a validated judge, and confidence intervals.",
  ],
  sources: [MANNING_EVAL, JARVELIN, BEIR],
  verify: [
    { id: "bm25-ndcg", claim: "Keyword search has a low nDCG at k = 3", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "bm25", k: 3 }, metric: "ndcg" }, expect: { max: 0.6 } },
    { id: "vec-recall", claim: "Vector search reaches high recall at k = 5", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "vec", k: 5 }, metric: "recallAtK" }, expect: { min: 0.85 } },
    { id: "vec-ndcg", claim: "…but its nDCG at k = 3 trails hybrid", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "vec", k: 3 }, metric: "ndcg" }, expect: { max: 0.65 } },
    { id: "hybrid-recall", claim: "Hybrid at k = 3 has recall of at least 90%", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "hybrid", k: 3 }, metric: "recallAtK" }, expect: { min: 0.9 } },
    { id: "hybrid-mrr", claim: "…MRR of at least 0.9", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "hybrid", k: 3 }, metric: "mrr" }, expect: { min: 0.9 } },
    { id: "hybrid-ndcg", claim: "…and nDCG of at least 0.9", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "hybrid", k: 3 }, metric: "ndcg" }, expect: { min: 0.9 } },
    { id: "k1", claim: "At k = 1 recall is far too low for any system", run: "lab", params: { model: "reteval-lab", config: RETEVAL, values: { system: "hybrid", k: 1 }, metric: "recallAtK" }, expect: { max: 0.5 } },
  ],
});
