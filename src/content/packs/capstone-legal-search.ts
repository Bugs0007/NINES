import { defineBoss } from "../define";

export const CAP = {};

const CONTEXTUAL = { id: "contextual-retrieval", title: "Anthropic: Introducing Contextual Retrieval (hybrid search, reranking and chunk context)", url: "https://www.anthropic.com/news/contextual-retrieval" };
const PINECONE_NS = { id: "pinecone-namespaces", title: "Pinecone docs: Namespaces (partitioning an index by tenant)", url: "https://docs.pinecone.io/guides/index-data/indexing-overview" };
const PG_LOCK = { id: "pg-select-locking", title: "PostgreSQL docs: SELECT, The Locking Clause (FOR UPDATE, SKIP LOCKED)", url: "https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE" };
const BULKHEAD = { id: "azure-bulkhead", title: "Azure Architecture Center: Bulkhead pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead" };
const SQS_DLQ = { id: "sqs-dlq", title: "Amazon SQS docs: Dead-letter queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" };

export default defineBoss({
  id: "capstone-legal-search",
  title: "Capstone: Legal Search at National Scale",
  kind: "boss",
  estimatedMinutes: 30,
  hook: {
    visual: "launch",
    alert: { severity: "info", title: "national rollout · 700 courts, 4,000 firms", detail: "every judgment searchable within minutes, no firm sees another's files" },
    lines: [
      { speaker: "rao", line: "We have the contract. Every new judgment from seven hundred courts has to be searchable within fifteen minutes, and four thousand firms keep private files in the same system." },
      { speaker: "meera", line: "This is every chapter at once: ingest, queues, search, isolation, and a bill. Decide what each one needs, and what it is allowed to cost." },
    ],
  },
  intro: [
    { speaker: "kabir", line: "Five percent of the court websites are slow, and last month one bad document stopped a worker. I would like not to find that out in production." },
    { speaker: "meera", line: "Then design for it now. Each earlier incident is a setting in this lab." },
  ],
  forecast: {
    metric: "monthlyCost",
    prompt: "Fifteen million questions a month, each answered by the large model at about a cent. Roughly what does the first month cost, with the starting setup?",
    unit: "$",
    scale: 1,
    min: 1000,
    max: 1000000,
    tolerance: 1.4,
  },
  exercises: ["multi-tenant-isolation", "llm-cost-controls", "prod-state-fanout", "prod-pg-job-queue"],
  challenge: {
    id: "design-national-search",
    title: "Design the national service",
    brief: "New judgments searchable within 15 minutes, no document lost, recall at 10 of at least 88% with a search p99 of 400 ms or less, at most a 0.01% chance a query crosses firms, answer quality at least 90%, and a bill of at most $40,000 a month.",
    line: { speaker: "rao", line: "Show me the settings that meet the contract, and what each one costs." },
    widget: { id: "capstone-legal-lab", config: CAP },
    conditions: [
      { metric: "freshnessMinutes", op: "<=", value: 15, label: "Judgments searchable within 15 minutes" },
      { metric: "lostDocsPerDay", op: "<=", value: 0, label: "No document lost" },
      { metric: "recallAt10", op: ">=", value: 0.88, label: "Recall at 10 at least 88%" },
      { metric: "p99Ms", op: "<=", value: 400, label: "Search p99 at most 400 ms" },
      { metric: "leakRisk", op: "<=", value: 0.0001, label: "At most 0.01% chance of crossing firms" },
      { metric: "answerQuality", op: ">=", value: 0.9, label: "Answer quality at least 90%" },
      { metric: "monthlyCost", op: "<=", value: 40000, label: "At most $40,000 a month" },
    ],
    stars: [{ metric: "monthlyCost", op: "<=", value: 35000, label: "At most $35,000 a month" }],
    hints: [
      "What stops slow court sites from taking the ingest workers, and what stops a lost document?",
      "Where is the boundary between firms, and what does a missed filter cost?",
      "Which answers need the large model, and which questions repeat?",
    ],
  },
  debrief: [
    { id: "ingest", text: "Ingest is a fan-out to hundreds of sites through shared workers. Without a bulkhead the slow few hold 60% of the workers, and a 32-worker fleet behaves like 13. A lease and a dead-letter table keep a crash or a bad document from losing or blocking work.", sourceIds: ["azure-bulkhead", "pg-select-locking", "sqs-dlq"] },
    { id: "iso", text: "A tenant filter is one forgotten clause from a breach. A namespace per firm builds the boundary into the index for about 5% more, and an index per firm costs 2.4 times as much for another factor of five. Match the boundary to what a leak costs.", sourceIds: ["pinecone-namespaces"] },
    { id: "serve", text: "Hybrid retrieval and a reranker lift recall at 10 from 72% to 91% for 220 ms. Answer cost then dominates: the large model for every question is about $135,000 a month, tiering to a small model first and caching repeats cuts it to about $25,000 at similar quality.", sourceIds: ["contextual-retrieval"] },
  ],
  outro: { speaker: "rao", line: "Thirty-two workers behind a bulkhead, leases, a namespace per firm, hybrid search with a reranker, tiered answers with a cache. Thirty-one thousand a month. Sign it." },
  explainBack: {
    prompt: "Walk through your design for the national legal search: ingest, isolation, search and cost.",
    rubric: [
      { id: "ingest", criterion: "Ingest through a queue with leases, an attempt cap and dead letters, with a bulkhead per slow source so a few bad sites or documents cannot starve or block the workers", keyIdea: "resilient ingest" },
      { id: "iso", criterion: "Firm isolation built into the index structure (namespace or index per firm), not only a query filter, chosen against the cost of a leak", keyIdea: "isolation in the structure" },
      { id: "serve", criterion: "Hybrid retrieval plus a reranker for recall within the latency budget", keyIdea: "hybrid and rerank" },
      { id: "cost", criterion: "Control the answer bill with a small model first, escalating to the large one, plus caching, while keeping answer quality", keyIdea: "tiering and caching" },
    ],
    exemplar:
      "I would ingest through a Postgres queue with leases, an attempt cap and a dead-letter table, and put a bulkhead around each slow court site so they cannot take the workers, which keeps new judgments searchable in minutes with nothing lost. Each firm gets its own namespace so the boundary lives in the index and a missed filter cannot leak. Search is hybrid with a reranker for recall within the latency budget. For cost I answer with a small model first and escalate to the large one when unsure, and cache repeated questions, which keeps quality near the large model at a fraction of the bill.",
  },
  honestPhysics: [
    "600,000 new judgments a day from 700 court sites, 21 a second at the peak; a document needs 1.5 s of a worker. 5% of sites are slow and without a bulkhead hold 60% of the workers. A crash leaves 48 documents a day unindexed with no lease.",
    "Hybrid search adds 10 points of recall and 40 ms, a reranker 7 points and 180 ms. Isolation: a tenant filter leaks about 0.2% of queries on a bug, namespaces 0.005%, an index per firm 0.001% at 2.4 times the index cost. Answers: $0.009 large, $0.001 small, tiering 20% to large, a cache answering 35% of 15 million monthly questions. Round figures that show how the chapters combine, not a quote.",
  ],
  sources: [CONTEXTUAL, PINECONE_NS, PG_LOCK, BULKHEAD, SQS_DLQ],
  verify: [
    { id: "forecast", claim: "The starting setup costs about $137,000 a month", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: {}, metric: "monthlyCost" }, expect: { min: 137000, max: 137500 } },
    { id: "stale", claim: "Eight workers with slow sites unbulkheaded leave judgments hours behind", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: {}, metric: "freshnessMinutes" }, expect: { min: 4000, max: 4500 } },
    { id: "bulk", claim: "32 workers behind a bulkhead keep up at the peak", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { workers: 32, bulkhead: true }, metric: "freshnessMinutes" }, expect: { max: 3.5 } },
    { id: "nobulk", claim: "32 workers with no bulkhead behave like 13 and fall hours behind", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { workers: 32, bulkhead: false }, metric: "freshnessMinutes" }, expect: { min: 100 } },
    { id: "lost", claim: "With no lease 48 documents a day are lost", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { lease: false }, metric: "lostDocsPerDay" }, expect: { min: 48, max: 48 } },
    { id: "filter", claim: "A shared index with a filter leaks about 0.2% of queries", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { iso: "filter" }, metric: "leakRisk" }, expect: { min: 0.0019, max: 0.0021 } },
    { id: "recall", claim: "Hybrid plus rerank reach 91% recall", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { hybrid: true, rerank: true }, metric: "recallAt10" }, expect: { min: 0.905, max: 0.915 } },
    { id: "solve", claim: "The intended design costs about $31,000", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { workers: 32, bulkhead: true, lease: true, iso: "namespace", hybrid: true, rerank: true, model: "tiered", cache: true }, metric: "monthlyCost" }, expect: { min: 30000, max: 32500 } },
    { id: "quality", claim: "…with answer quality of 91%", run: "lab", params: { model: "capstone-legal-lab", config: CAP, values: { model: "tiered" }, metric: "answerQuality" }, expect: { min: 0.905, max: 0.915 } },
  ],
});
