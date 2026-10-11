import { defineBoss } from "../define";

export const LGC = {};

const RRF = { id: "rrf", title: "Cormack, Clarke, Buettcher (2009), Reciprocal rank fusion outperforms Condorcet and individual rank learning methods", url: "https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf" };
const CONTEXTUAL = { id: "contextual-retrieval", title: "Anthropic: Introducing Contextual Retrieval (hybrid search, reranking and chunk context)", url: "https://www.anthropic.com/news/contextual-retrieval" };
const HNSW = { id: "hnsw", title: "Malkov and Yashunin (2016), Efficient and robust approximate nearest neighbor search using HNSW graphs", url: "https://arxiv.org/abs/1603.09320" };
const PINECONE_NS = { id: "pinecone-namespaces", title: "Pinecone docs: Namespaces (partitioning an index by tenant)", url: "https://docs.pinecone.io/guides/index-data/indexing-overview" };

export default defineBoss({
  id: "case-legal-rag",
  title: "Case: Legal-document RAG at Scale",
  kind: "boss",
  estimatedMinutes: 24,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "security review · a search from firm A returned a passage from firm B's case file", detail: "a missing filter in one query path; 200 million chunks in a shared index" },
    lines: [{ speaker: "kabir", line: "Our legal search showed one firm's case file to another firm, through a missing filter in one code path. If it happens again, the product is over." }],
  },
  intro: [
    { speaker: "meera", line: "Four questions: do you find the right passage, how fast, how much does the index cost, and what stops one firm seeing another's documents?" },
    { speaker: "rao", line: "The last one is not a ranking problem. It is an isolation problem, and you buy it in how you partition the index." },
  ],
  forecast: {
    metric: "indexCostMonth",
    prompt: "200 million chunks as 1,024-dimension 32-bit embeddings in an HNSW index with 1.5× overhead, in RAM at $5,000 a terabyte-month. What does the index cost a month?",
    unit: "$",
    scale: 1,
    min: 100,
    max: 100000,
    tolerance: 1.4,
  },
  exercises: ["retrieval-eval", "hybrid-search-rrf", "multi-tenant-isolation", "chunking"],
  challenge: {
    id: "design-legal-rag",
    title: "Design the search",
    brief: "Reach 88% recall at 10 with a search p99 of 300 ms or less, at most a 0.01% chance a query crosses firms, and an index under $2,000 a month.",
    line: { speaker: "rao", line: "Find the clause, keep the firms apart, and keep the index affordable." },
    widget: { id: "legalrag-lab", config: LGC },
    conditions: [
      { metric: "recallAt10", op: ">=", value: 0.88, label: "Recall at 10 at least 88%" },
      { metric: "p99Ms", op: "<=", value: 300, label: "Search p99 at most 300 ms" },
      { metric: "leakRisk", op: "<=", value: 0.0001, label: "At most 0.01% chance of crossing firms" },
      { metric: "indexCostMonth", op: "<=", value: 2000, label: "Index at most $2,000 a month" },
    ],
    stars: [{ metric: "recallAt10", op: ">=", value: 0.9, label: "Recall at 10 at least 90%" }],
    hints: ["What does hybrid search recover that dense search misses?", "What does a reranker cost in latency?", "Where does the index memory go?"],
  },
  debrief: [
    { id: "recall", text: "Legal language mixes exact terms (statute numbers, names) that keyword search finds and paraphrases that vector search finds. Fusing both by rank lifted recall from 72% to 82%, a reranker added 6 points and structure-aware chunks 4, reaching 91% at a 255 ms p99.", sourceIds: ["rrf", "contextual-retrieval"] },
    { id: "iso", text: "A shared index with a filter relies on every query applying it: one missed path leaks. A namespace per firm builds the boundary into the index, at 0.01% in the lab, and a cluster per firm removes it entirely at 1.6× the cost. Pick the boundary to match what a leak costs.", sourceIds: ["pinecone-namespaces"] },
    { id: "cost", text: "32-bit embeddings need 1.2 terabytes of RAM-backed index, $6,100 a month. Storing them as 8-bit integers quarters it to $1,500 for a point of recall.", sourceIds: ["hnsw"] },
  ],
  outro: { speaker: "kabir", line: "Hybrid search with a reranker, a namespace per firm, 8-bit vectors. Ninety-one percent recall and fifteen hundred dollars a month." },
  explainBack: {
    prompt: "Explain how your legal search finds the right passage, keeps firms apart and controls cost.",
    rubric: [
      { id: "recall", criterion: "Hybrid retrieval (dense plus keyword, fused by rank) plus a reranker and structure-aware chunking raise recall", keyIdea: "hybrid, rerank, chunk" },
      { id: "latency", criterion: "The reranker adds latency, so budget it; the total stays within the p99 target", keyIdea: "latency budget" },
      { id: "iso", criterion: "Tenant isolation built into the index (namespace or cluster) is safer than a filter that every query must remember", keyIdea: "isolation in the structure" },
      { id: "cost", criterion: "Quantize embeddings (8-bit) to cut memory and cost with a small recall loss", keyIdea: "quantize" },
    ],
    exemplar:
      "I would use hybrid retrieval, dense and keyword fused by rank, with structure-aware chunks and a reranker, which lifts recall at ten from 72 percent to 91 percent at about a quarter of a second at p99. Each firm gets its own namespace so the boundary is part of the index and a missed filter cannot leak a document. Embeddings are stored as 8-bit integers, which quarters the index from about six thousand dollars a month to fifteen hundred for a point of recall.",
  },
  honestPhysics: [
    "200 million chunks of legal text for hundreds of firms. Recall at 10: dense 72%, keyword 66%, hybrid 82%; a reranker adds 6 points and 180 ms; structure-aware chunks add 4; 8-bit embeddings cost 1. Search takes 40 ms dense, 25 keyword, 70 hybrid.",
    "A shared index with a filter leaks about 0.1% of the time on a bug, a namespace 0.01%, a separate cluster never (1.6× the cost). A 1,024-dimension float embedding is 4 KB, 8-bit 1 KB, with 1.5× index overhead, at $5,000 a terabyte-month of RAM. Round figures.",
  ],
  sources: [RRF, CONTEXTUAL, HNSW, PINECONE_NS],
  verify: [
    { id: "forecast", claim: "The float index costs about $6,100 a month", run: "lab", params: { model: "legalrag-lab", config: LGC, values: {}, metric: "indexCostMonth" }, expect: { min: 6000, max: 6300 } },
    { id: "int8", claim: "8-bit embeddings cost $1,540", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { embed: "int8" }, metric: "indexCostMonth" }, expect: { min: 1500, max: 1600 } },
    { id: "hybrid", claim: "Hybrid retrieval reaches 82% recall", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { retrieval: "hybrid" }, metric: "recallAt10" }, expect: { min: 0.82, max: 0.82 } },
    { id: "good", claim: "Hybrid, rerank and structure-aware chunks reach 91% recall at a 255 ms p99", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { chunking: "structure", retrieval: "hybrid", rerank: true, isolation: "namespace", embed: "int8" }, metric: "recallAt10" }, expect: { min: 0.9, max: 0.92 } },
    { id: "good-p99", claim: "…at a p99 of 255 ms", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { chunking: "structure", retrieval: "hybrid", rerank: true, isolation: "namespace", embed: "int8" }, metric: "p99Ms" }, expect: { min: 254, max: 256 } },
    { id: "filter", claim: "A shared filtered index leaks 0.1% of the time", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { isolation: "filter" }, metric: "leakRisk" }, expect: { min: 0.001, max: 0.001 } },
    { id: "cluster", claim: "A cluster per firm costs 1.6× and leaks nothing", run: "lab", params: { model: "legalrag-lab", config: LGC, values: { isolation: "cluster", embed: "int8" }, metric: "indexCostMonth" }, expect: { min: 2400, max: 2500 } },
  ],
});
