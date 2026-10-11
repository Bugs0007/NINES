import { definePack } from "../define";

export const FILTER = { lockF: false, start: { method: "post", f: 0.5, k: 100 } };
export const FILTER_CHALLENGE = { lockF: true, f: 0.002, start: { method: "post", k: 100 } };

const PINECONE = { id: "pinecone-filter", title: "Pinecone docs: Filter by metadata (filtering applied during the vector search)", url: "https://docs.pinecone.io/guides/search/filter-by-metadata" };
const PGVECTOR = { id: "pgvector", title: "pgvector: Filtering (approximate indexes apply filters after the index scan; partial indexes and partitioning)", url: "https://github.com/pgvector/pgvector#filtering" };
const QDRANT = { id: "qdrant-filtering", title: "Qdrant docs: Filtering (payload filters applied during HNSW search)", url: "https://qdrant.tech/documentation/concepts/filtering/" };

export default definePack({
  id: "metadata-filtering",
  title: "Metadata Filtering & Multi-tenancy",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "Legal search · tenant isolation", detail: "a small firm sees 1 result when it asks for 10" },
    lines: [
      { speaker: "kabir", line: "A small customer asks for ten results and gets one, though they have plenty of documents. Bigger customers are fine." },
      { speaker: "meera", line: "You are filtering after the search. The nearest hundred matches mostly belong to other tenants, and the filter throws them away." },
    ],
  },
  predictions: [
    {
      id: "post-filter",
      kind: "numeric",
      prompt: "A vector search fetches the top 100 nearest vectors, then drops those not belonging to the user's tenant. The tenant owns 0.2% of the corpus. About how many of the 100 results survive the filter?",
      unit: "results",
      min: 0.05,
      max: 100,
      log: true,
      answer: 0.2,
      tolerance: 3,
      observe: "post-starved",
      reveal: {
        text: "If matches are spread evenly across tenants, only 0.2% of the 100 candidates, one in five hundred each, belong to this tenant, so on average 0.2 results survive. To get 10 results the search would have to fetch about 5,000 candidates.",
        derived: true,
        line: { speaker: "meera", line: "A filter applied last is a filter that mostly throws results away." },
      },
    },
  ],
  widget: { id: "filter-lab", config: FILTER },
  mechanism: [
    {
      id: "post",
      scene: "post",
      text: "Post-filtering searches first and filters after. It reuses the fast index and is easy to build, but it only returns about K times the share of the corpus that matches. A narrow filter leaves few survivors, so you either return too few results or fetch an enormous K and pay for it.",
      sourceIds: ["pgvector"],
      derived: true,
    },
    {
      id: "pre",
      scene: "pre",
      text: "Pre-filtering applies the filter first and searches only the matching vectors. If the filter is narrow, the matching set is small enough to scan exactly, which is fast and perfectly accurate. If it matches a large share of the corpus, the scan is too slow and you need an index that can honour the filter.",
      sourceIds: ["pinecone-filter", "qdrant-filtering"],
    },
    {
      id: "partition",
      scene: "partition",
      text: "For multi-tenant data the cleanest answer is isolation by construction: a separate index or partition per tenant, or a partial index on the tenant column. A query touches only that tenant's vectors, so cost does not depend on the rest of the corpus, and one tenant's data cannot leak into another's results.",
      sourceIds: ["pgvector", "pinecone-filter"],
    },
    {
      id: "choose",
      text: "Match the method to the filter. Broad filters can use post-filtering with a modest over-fetch, selective filters want pre-filtering or a filtered index, and hard boundaries such as tenants want partitions. Whichever you pick, test the narrowest real filter, not the average one.",
    },
  ],
  challenges: [
    {
      id: "small-tenant",
      title: "Serve the small tenant",
      brief: "A tenant owns 0.2% of 10 million vectors. Each search must return the 10 nearest in that tenant, with at most 30 ms of latency. Post-filtering fetches the top 100 today. Choose how the filter is applied.",
      line: { speaker: "rao", line: "Do not index every tenant separately if a scan of a small one is fast enough. But know where it stops being fast." },
      widget: { id: "filter-lab", config: FILTER_CHALLENGE },
      conditions: [
        { metric: "complete", op: ">=", value: 1, label: "Always returns 10 results" },
        { metric: "latencyMs", op: "<=", value: 30, label: "At most 30 ms" },
      ],
      stars: [{ metric: "latencyMs", op: "<=", value: 10, label: "At most 10 ms" }],
      hints: [
        "How many of the fetched candidates match the filter under post-filtering?",
        "What would it take, in K and in latency, to get ten matching results that way?",
        "Which methods search only the matching vectors?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare post-filtering, pre-filtering, and partitioning for filtered vector search, and say what goes wrong with narrow filters.",
    rubric: [
      { id: "post", criterion: "Post-filtering searches then drops non-matches, so a narrow filter leaves too few results unless K is huge", keyIdea: "post-filter starves" },
      { id: "pre", criterion: "Pre-filtering searches only matching vectors, exact and fast for small sets but slow for large ones", keyIdea: "filter first" },
      { id: "partition", criterion: "Partitioning by tenant isolates data and makes cost independent of the corpus", keyIdea: "partition by tenant" },
    ],
    exemplar:
      "Post-filtering searches the whole index and drops non-matching results, so a narrow filter leaves too few survivors unless K is enormous. Pre-filtering applies the filter first and scans only the matches, which is fast and exact for small sets and slow for big ones. Partitioning by tenant gives each its own index, so cost is independent of the corpus size and data cannot leak across tenants.",
  },
  reviews: [
    {
      id: "mf-est",
      format: "estimate",
      scenario: "A filter keeps 0.5% of the corpus. To get 10 matching results with post-filtering, about how many candidates must you fetch?",
      unit: "candidates",
      answer: 2000,
      acceptFactor: 1.2,
      breakdown: ["10 ÷ 0.005", "= 2,000 candidates"],
      explain: "The over-fetch needed is the wanted count divided by the filter's selectivity, which explodes for narrow filters.",
    },
    {
      id: "mf-pick",
      format: "pick-fix",
      scenario: "A system returns documents from the wrong tenant when the tenant filter is mistyped. Which design makes that class of bug impossible?",
      options: [
        { id: "a", label: "A separate index or partition per tenant, so queries can only touch their own data" },
        { id: "b", label: "Filter in application code after retrieval" },
        { id: "c", label: "Add the tenant name to the query text" },
        { id: "d", label: "A larger top-k" },
      ],
      answer: "a",
      explain: "Isolation by construction beats isolation by filter. A mistyped filter becomes an empty result, not a data leak.",
    },
    {
      id: "mf-order",
      format: "order",
      scenario: "Order these approaches by latency for a filter that keeps 0.2% of 10 million vectors, to return 10 results, fastest first.",
      items: [
        { id: "part", label: "Partitioned index per tenant" },
        { id: "pre", label: "Pre-filter, then exact scan" },
        { id: "post", label: "Post-filter with enough over-fetch for 10 results" },
      ],
      answer: ["part", "pre", "post"],
      explain: "A small index is fastest, a 20,000-vector scan is quick, and over-fetching 5,000 candidates through the big index is slowest of the three here.",
    },
    {
      id: "mf-graph",
      format: "predict-graph",
      scenario: "A pre-filter scans exactly the matching vectors. Raise the filter's share of the corpus from 0.01% to 50%. How does its latency change?",
      xLabel: "share of the corpus →",
      yLabel: "scan latency",
      options: [
        { id: "flat", label: "Flat", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "linear", label: "Grows in proportion to the share", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "log", label: "Grows slowly with the log", points: [1, 2, 2.6, 3, 3.3, 3.5, 3.7, 3.8] },
        { id: "down", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "linear",
      explain: "An exact scan touches every matching vector, so its cost is proportional to how many match. That is why pre-filtering suits narrow filters and not broad ones.",
    },
    {
      id: "mf-flaw",
      format: "spot-flaw",
      scenario: "Search fetches the top 20 nearest vectors from a shared index, then filters by tenant in Python, and the product team is told 'it works' because big tenants always get results. Tap the weak spot.",
      diagram: {
        nodes: [
          { id: "index", label: "shared vector index, top 20", kind: "store", col: 0, row: 1 },
          { id: "py", label: "python filter by tenant after retrieval", kind: "server", col: 1, row: 1 },
          { id: "user", label: "small tenant: often 0 results", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "index", to: "py" },
          { from: "py", to: "user" },
        ],
      },
      answer: "index->py",
      explain: "The filter runs after a small fixed K, so a small tenant's matches rarely appear among the 20. Test with the narrowest tenant, and apply the filter inside the search.",
    },
    {
      id: "mf-explain",
      format: "explain",
      scenario: "In two sentences: why does post-filtering work for big tenants but fail for small ones?",
      rubric: [
        { id: "share", criterion: "The number of surviving results is about K times the tenant's share of the corpus" },
        { id: "small", criterion: "A small tenant's share is tiny, so few or none of the K candidates belong to it" },
      ],
      exemplar: "The number of results that survive the filter is about K times the tenant's share of the corpus. A big tenant has a large share so plenty survive, while a small tenant's share is tiny and few or none do.",
      explain: "Selectivity is the whole story.",
    },
  ],
  codex: {
    oneLiner: "Post-filtering starves narrow filters. Pre-filtering scans matches exactly; partitions isolate tenants. Test the narrowest filter you will meet.",
    keyNumbers: [
      { label: "Results from post-filtering", value: "K × share of the corpus matching the filter", sourceId: "pgvector" },
      { label: "Over-fetch needed for n results", value: "n ÷ share", sourceId: "pgvector" },
    ],
    tradeoffs: [
      { choice: "Post-filter", gain: "Simplest; reuses the index", cost: "Too few results for narrow filters, or huge K" },
      { choice: "Pre-filter / filtered ANN", gain: "Returns full results for narrow filters", cost: "Exact scans slow for broad filters; filtered graph search is more complex" },
      { choice: "Partition per tenant", gain: "Isolation and cost independent of the corpus", cost: "Many small indexes to manage" },
    ],
    seenIn: ["Namespaces and filters in vector databases.", "Row-level security plus per-tenant indexes in Postgres with pgvector."],
    interviewAngle: "Raise tenancy yourself: 'tenant isolation by partition, not just by filter, and I would test the smallest tenant for result count and latency.'",
    aws: [{ concept: "Filtered vector search", service: "Amazon OpenSearch Service k-NN filters; Bedrock Knowledge Bases metadata filtering" }],
    replay: { id: "filter-lab", config: FILTER_CHALLENGE, scene: "post" },
  },
  interview: [
    "How would you design vector search for a multi-tenant product?",
    "Why does filtering after retrieval break for selective filters?",
    "When is pre-filtering a good idea, and when is it not?",
  ],
  deeper: [
    {
      title: "Filtered approximate search",
      body: "Graph indexes like HNSW can apply a filter while traversing, skipping non-matching nodes. That works well for broad filters, but when the filter is narrow the matching nodes may be disconnected in the graph and the search can stall or lose recall. Engines handle this by switching to an exact scan below a selectivity threshold, which is why many vector databases expose both behaviours.",
      sourceIds: ["qdrant-filtering"],
    },
  ],
  honestPhysics: [
    "An index of 10 million vectors, a request for the top 10 results matching a filter, and a filter that keeps a share f of the corpus. Post-filtering returns about K × f results.",
    "Pre-filtering scans the matching vectors exactly at about one microsecond each. Approximate search costs about 5 ms plus 0.01 ms per candidate fetched.",
    "Real engines have filtered-search modes whose cost sits between these.",
  ],
  sources: [PINECONE, PGVECTOR, QDRANT],
  verify: [
    { id: "post-starve", claim: "Post-filtering the top 100 returns a fraction of one result for a 0.2% tenant", run: "lab", params: { model: "filter-lab", config: FILTER_CHALLENGE, values: { method: "post", k: 100 }, metric: "resultsFound" }, expect: { max: 0.5 } },
    { id: "post-big", claim: "Over-fetching enough for 10 results takes over 30 ms", run: "lab", params: { model: "filter-lab", config: FILTER_CHALLENGE, values: { method: "post", k: 5000 }, metric: "latencyMs" }, expect: { min: 30 } },
    { id: "pre", claim: "Pre-filtering a 0.2% tenant returns 10 results in 20 ms", run: "lab", params: { model: "filter-lab", config: FILTER_CHALLENGE, values: { method: "pre" }, metric: "latencyMs" }, expect: { max: 30 } },
    { id: "part", claim: "A partitioned index returns 10 results in about 5 ms", run: "lab", params: { model: "filter-lab", config: FILTER_CHALLENGE, values: { method: "partition" }, metric: "latencyMs" }, expect: { max: 10 } },
    { id: "pre-broad", claim: "Pre-filtering a 10% filter takes a full second", run: "lab", params: { model: "filter-lab", config: { lockF: true, f: 0.1 }, values: { method: "pre", f: 0.1 }, metric: "latencyMs" }, expect: { min: 900 } },
  ],
});
