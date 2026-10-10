import { definePack } from "../define";

export const PG = {};

const BORING = { id: "boring-tech", title: "D. McKinley, Choose Boring Technology (innovation tokens and the cost of new systems)", url: "https://boringtechnology.club/" };
const PG_FTS = { id: "pg-fts", title: "PostgreSQL docs: Full Text Search (tsvector, tsquery, GIN indexes)", url: "https://www.postgresql.org/docs/current/textsearch.html" };
const PG_SKIP = { id: "pg-skip-locked", title: "PostgreSQL docs: SELECT, the locking clause (FOR UPDATE SKIP LOCKED for queue-like tables)", url: "https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE" };
const PGVECTOR = { id: "pgvector", title: "pgvector: open-source vector similarity search for Postgres (HNSW and IVFFlat indexes)", url: "https://github.com/pgvector/pgvector" };

export default definePack({
  id: "postgres-is-enough",
  title: "Postgres Is Enough",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "Platform roadmap · new systems", detail: "Redis, OpenSearch, Kafka, and a vector database, all proposed this quarter" },
    lines: [
      { speaker: "rao", line: "The roadmap adds four new systems this quarter. Each needs backups, upgrades, dashboards, and someone to be woken at night." },
      { speaker: "meera", line: "Each might earn its place. First count what Postgres is actually being asked to do." },
    ],
  },
  predictions: [
    {
      id: "one-fix",
      kind: "choice",
      prompt: "Postgres is at 83% of comfortable capacity, with core queries, key lookups, search, a job queue, and vector search all on it. You must get it under 70% by adding at most one new system. Which one gets you there?",
      options: [
        { id: "redis", label: "Redis, to take the key lookups" },
        { id: "queue", label: "A queue, to take the job processing" },
        { id: "vector", label: "A vector database" },
        { id: "none", label: "No single system is enough" },
      ],
      answer: "redis",
      observe: "offloaded",
      reveal: {
        text: "Key lookups are the biggest slice after the core queries, roughly 2,400 of 8,300 units, so moving them to Redis drops Postgres to 59%. The queue and vector search are only 1,000 and 400 units; removing either leaves Postgres above 70%.",
        derived: true,
        line: { speaker: "rao", line: "One system, not four. That is a good week." },
      },
    },
  ],
  widget: { id: "pg-lab", config: PG },
  mechanism: [
    {
      id: "boring",
      scene: "boring",
      text: "Every new system costs more than its licence: another thing to deploy, monitor, back up, secure, upgrade, and learn. Dan McKinley's idea is that a team has only a few innovation tokens, so spend them where your business needs them and be boring elsewhere.",
      sourceIds: ["boring-tech"],
    },
    {
      id: "extensions",
      text: "Postgres does more than tables. It has full-text search with GIN indexes, JSONB documents, FOR UPDATE SKIP LOCKED for queue-like tables, LISTEN and NOTIFY, geospatial support through extensions, and pgvector for similarity search. At modest scale one database does the work of several.",
      sourceIds: ["pg-fts", "pg-skip-locked", "pgvector"],
    },
    {
      id: "limits",
      scene: "limits",
      text: "There are real limits. Postgres is one primary for writes, so extreme write rates, cache-speed lookups at hundreds of thousands a second, or search with heavy relevance tuning eventually need a specialist. The signal is measured load, not a fear of load.",
    },
    {
      id: "order",
      text: "Take the steps in order. Add an index or fix a query. Move reads to a replica. Scale the instance up. Only then offload the one workload that dominates, with the cheapest system that does it. Each step keeps your architecture a size smaller.",
    },
  ],
  challenges: [
    {
      id: "boring-architecture",
      title: "Stay boring on a budget",
      brief: "Postgres carries core queries, key lookups, search, a job queue, and vector search at 83% of capacity. Get it under 70%, with at most one extra system to run and a bill of at most $900 a month. A bigger instance costs $700 more.",
      line: { speaker: "kabir", line: "I would love to add all of them. I have been told that is not the assignment." },
      widget: { id: "pg-lab", config: PG },
      conditions: [
        { metric: "pgUtil", op: "<", value: 0.7, label: "Postgres under 70% busy" },
        { metric: "extraSystems", op: "<=", value: 1, label: "At most one extra system" },
        { metric: "costPerMonth", op: "<=", value: 900, label: "Bill at most $900/month" },
      ],
      stars: [{ metric: "costPerMonth", op: "<=", value: 850, label: "Bill at most $850/month" }],
      hints: [
        "Which workload takes the biggest share of Postgres after the core queries?",
        "Compare what each system costs against how much load it removes.",
        "A bigger instance removes the pressure but doubles the bill. Is there a cheaper single move?",
      ],
    },
  ],
  explainBack: {
    prompt: "When is Postgres enough, and how do you decide to add another system?",
    rubric: [
      { id: "cost", criterion: "Every additional system has an operational cost: deployment, monitoring, backups, on-call, and consistency between stores", keyIdea: "systems are expensive" },
      { id: "capability", criterion: "Postgres covers search, JSON, queues, and vectors at modest scale", keyIdea: "Postgres goes far" },
      { id: "signal", criterion: "Adds a system when measured load on one workload justifies it, offloading the biggest slice first", keyIdea: "measure, then offload" },
    ],
    exemplar:
      "Every extra system has to be deployed, monitored, backed up, secured, and kept consistent with the others, so I want a measured reason. Postgres handles full-text search, JSON, queue-like tables, and vector search at modest scale. When load shows one workload dominating, I offload that one, usually the biggest slice, with the simplest system that does it, rather than adding several at once.",
  },
  reviews: [
    {
      id: "pe-est",
      format: "estimate",
      scenario: "Postgres is asked for 8,300 'units' a second against a comfortable capacity of 10,000. Removing a workload worth 2,400 units leaves what utilization?",
      unit: "%",
      answer: 59,
      acceptFactor: 1.1,
      breakdown: ["8,300 − 2,400 = 5,900", "5,900 ÷ 10,000", "= 59%"],
      explain: "Offloading the biggest slice buys the most headroom per system added.",
    },
    {
      id: "pe-pick",
      format: "pick-fix",
      scenario: "A team needs a background job queue for 50 jobs a second. They propose Kafka. Postgres is already in use. What is the better first move?",
      options: [
        { id: "a", label: "A queue table with FOR UPDATE SKIP LOCKED in Postgres, until load says otherwise" },
        { id: "b", label: "Deploy Kafka now, to be ready for scale" },
        { id: "c", label: "Store jobs in a text file" },
        { id: "d", label: "Run the jobs inside the web request" },
      ],
      answer: "a",
      explain: "Fifty jobs a second is far below what a Postgres queue handles, and it uses transactions you already trust. Kafka earns its place at much higher volume or for event replay.",
    },
    {
      id: "pe-pick2",
      format: "pick-fix",
      scenario: "Product search needs word matching with stemming over 2 million rows, 20 queries a second. What do you try first?",
      options: [
        { id: "a", label: "Postgres full-text search with a GIN index" },
        { id: "b", label: "A three-node search cluster" },
        { id: "c", label: "LIKE '%word%' on the table" },
        { id: "d", label: "A vector database" },
      ],
      answer: "a",
      explain: "Built-in full-text search with a GIN index handles this size comfortably. A dedicated search cluster is justified when relevance tuning, faceting at scale, or load outgrows it.",
    },
    {
      id: "pe-order",
      format: "order",
      scenario: "Order these steps for relieving a busy Postgres, in the order you should try them.",
      items: [
        { id: "index", label: "Fix the slow queries and missing indexes" },
        { id: "replica", label: "Send read traffic to a replica" },
        { id: "scale", label: "Move to a bigger instance" },
        { id: "system", label: "Offload the biggest workload to a specialised system" },
      ],
      answer: ["index", "replica", "scale", "system"],
      explain: "The cheapest, least disruptive steps come first. A new system is a permanent operating cost, so it is the last resort that is still worth doing.",
    },
    {
      id: "pe-flaw",
      format: "spot-flaw",
      scenario: "A team of five runs Postgres, Redis, OpenSearch, Kafka, and a vector database for an app with 200,000 users, and keeps spending weekends on sync bugs. Tap the part that is out of proportion.",
      diagram: {
        nodes: [
          { id: "app", label: "app · 200,000 users, 5 engineers", kind: "server", col: 0, row: 1 },
          { id: "stores", label: "5 datastores kept in sync by custom jobs", kind: "external", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "stores" }],
      },
      answer: "stores",
      explain: "Five stores for a small team means five operational burdens and many consistency problems between them. At that scale most of the workloads would fit in Postgres.",
    },
    {
      id: "pe-explain",
      format: "explain",
      scenario: "In two sentences: why do teams regret adding a new datastore early?",
      rubric: [
        { id: "ops", criterion: "Each system adds operational burden: deployment, monitoring, backups, upgrades, on-call" },
        { id: "sync", criterion: "Data duplicated across systems must be kept consistent, which creates bugs" },
      ],
      exemplar: "Each new datastore has to be deployed, monitored, backed up, and kept running, which adds on-call burden. Data that lives in two systems also has to be kept in sync, and that sync is where bugs live.",
      explain: "The system you did not add has no bugs.",
    },
  ],
  codex: {
    oneLiner: "Postgres covers search, JSON, queues, and vectors at modest scale. Add another system only for a measured load, one at a time.",
    keyNumbers: [
      { label: "Postgres built-ins", value: "full-text search, JSONB, SKIP LOCKED queues, LISTEN/NOTIFY", sourceId: "pg-fts" },
      { label: "Vector search", value: "pgvector with HNSW or IVFFlat indexes", sourceId: "pgvector" },
      { label: "Innovation tokens", value: "a team can only absorb a few new technologies", sourceId: "boring-tech" },
    ],
    tradeoffs: [
      { choice: "Stay on Postgres", gain: "One system to run, transactions across everything, no sync bugs", cost: "Heavy workloads compete for the same resources; specialised features lag" },
      { choice: "Add a specialist", gain: "Purpose-built speed and features for one workload", cost: "Another system to operate and keep consistent" },
      { choice: "Scale Postgres up", gain: "Simple, no new moving parts", cost: "Cost steps up; one primary for writes" },
    ],
    seenIn: ["Queues as tables with SKIP LOCKED; search through tsvector.", "Architecture reviews asking 'could Postgres do this?'"],
    interviewAngle: "Start simple and justify each addition by load: 'Postgres first, then a replica, then Redis for the hot key lookups once I can show them dominating.'",
    aws: [{ concept: "Managed Postgres", service: "Amazon RDS / Aurora PostgreSQL" }],
    replay: { id: "pg-lab", config: PG, scene: "boring" },
  },
  interview: [
    "When would you add Redis to a system that has Postgres?",
    "Can Postgres replace a message queue? A search engine?",
    "How do you decide a workload has outgrown Postgres?",
  ],
  deeper: [
    {
      title: "The cost of keeping stores in sync",
      body: "Data copied into a search index, a cache, or a queue has to follow the source of truth, through change data capture, dual writes, or batch jobs. Dual writes can leave the stores disagreeing after a crash between them, and the fixes (outbox, CDC) are real engineering. Each extra store multiplies these paths.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Work is counted in rough units: a core query 1, a key lookup 0.3, a search 5, a queued job 2, a vector search 20. These are ratios, not benchmarks.",
    "A comfortable instance capacity is 10,000 units a second, and a bigger instance doubles it for about $700 more a month. Costs are round figures.",
    "Operational burden is counted as one extra system each. Real burden depends on the team and the system.",
  ],
  sources: [BORING, PG_FTS, PG_SKIP, PGVECTOR],
  verify: [
    { id: "default", claim: "Postgres starts at 83% busy", run: "lab", params: { model: "pg-lab", config: PG, values: {}, metric: "pgUtil" }, expect: { min: 0.8, max: 0.86 } },
    { id: "redis", claim: "Redis alone takes it under 70% within budget", run: "lab", params: { model: "pg-lab", config: PG, values: { redis: true }, metric: "pgUtil" }, expect: { max: 0.7 } },
    { id: "redis-cost", claim: "…for $850 a month", run: "lab", params: { model: "pg-lab", config: PG, values: { redis: true }, metric: "costPerMonth" }, expect: { max: 850 } },
    { id: "queue", claim: "The queue alone is not enough", run: "lab", params: { model: "pg-lab", config: PG, values: { queue: true }, metric: "pgUtil" }, expect: { min: 0.7 } },
    { id: "big", claim: "A bigger instance fixes load but breaks the budget", run: "lab", params: { model: "pg-lab", config: PG, values: { big: true }, metric: "costPerMonth" }, expect: { min: 900 } },
    { id: "search", claim: "A search cluster alone breaks the budget", run: "lab", params: { model: "pg-lab", config: PG, values: { search: true }, metric: "costPerMonth" }, expect: { min: 900 } },
  ],
});
