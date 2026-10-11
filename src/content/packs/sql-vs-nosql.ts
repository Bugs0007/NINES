import { definePack } from "../define";

export const MATCH = { start: { orders: "rel", carts: "rel", catalog: "rel", events: "rel", friends: "rel" } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 2: Data Models and Query Languages", url: "https://dataintensive.net/" };
const DYNAMO = { id: "dynamo-2007", title: "G. DeCandia et al. (2007), Dynamo: Amazon's Highly Available Key-value Store, ACM SOSP", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf" };
const CASSANDRA = { id: "cassandra-docs", title: "Apache Cassandra documentation: data modeling (partition keys, clustering columns, query-driven design)", url: "https://cassandra.apache.org/doc/latest/cassandra/data-modeling/intro.html" };

export default definePack({
  id: "sql-vs-nosql",
  title: "SQL vs NoSQL Families",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "Architecture review · data stores", detail: "'let's use MongoDB for everything' versus 'Postgres for everything'" },
    lines: [
      { speaker: "kabir", line: "One engineer wants Mongo for everything, another wants Postgres for everything, and both say it with equal confidence. Who is right?" },
      { speaker: "meera", line: "Both are wrong about everything and right about something. Match each workload to what it actually needs." },
    ],
  },
  predictions: [
    {
      id: "everything-relational",
      kind: "numeric",
      prompt: "Five Pigeon workloads: orders and payments, carts, a product catalogue, sensor events at a million writes a second, and friend recommendations. The lab scores each choice 0 to 2. What score do you expect if every workload goes into a relational database, out of 10?",
      unit: "points",
      min: 0,
      max: 10,
      step: 1,
      answer: 5,
      tolerance: 1.3,
      observe: "matched",
      reveal: {
        text: "Relational is the best fit for orders (2) and a workable one for carts, the catalogue, and recommendations (1 each), but a poor one for a million writes a second of time-series (0). That is 5 out of 10: respectable, with one real gap.",
        derived: true,
        line: { speaker: "meera", line: "A good default, and one workload that is not a good use of it." },
      },
    },
  ],
  widget: { id: "match-lab", config: MATCH },
  mechanism: [
    {
      id: "relational",
      scene: "rel",
      text: "Relational databases store tables with a fixed schema, enforce constraints, and answer arbitrary queries with joins, with transactions across rows. They fit data with relationships and rules, such as orders, payments, and accounts, and they handle most workloads at modest scale.",
      sourceIds: ["ddia"],
    },
    {
      id: "kv-doc",
      scene: "kv",
      text: "Key-value stores give you get and put by key, very fast, with expiry and little else. Document stores keep a self-contained record per key and read it whole, which suits data whose shape varies, like a product catalogue. Both shard easily because a record is one unit.",
      sourceIds: ["ddia", "dynamo-2007"],
    },
    {
      id: "wide-graph",
      text: "Wide-column stores such as Cassandra partition by a key and keep rows sorted within each partition, so huge write volumes and time-range reads are cheap, but you design tables around queries. Graph databases make walking relationships many hops deep fast, where a relational database would join repeatedly.",
      sourceIds: ["cassandra-docs", "ddia"],
    },
    {
      id: "choose",
      text: "Pick by access pattern and guarantees, not fashion: what are the queries, how much write volume, what consistency does the business need, and what can your team run at three in the morning. Most systems are right with one relational database plus one or two specialised stores.",
    },
  ],
  challenges: [
    {
      id: "match",
      title: "Match each workload",
      brief: "Choose a data store family for each of Pigeon's five workloads. No workload may be a poor fit, and the total score must be at least 8 of 10.",
      line: { speaker: "rao", line: "Every extra database is a pager rotation. Do not pick five when two will do." },
      widget: { id: "match-lab", config: MATCH },
      conditions: [
        { metric: "misfits", op: "<=", value: 0, label: "No poor fits" },
        { metric: "score", op: ">=", value: 8, label: "Fit score at least 8 of 10" },
      ],
      stars: [{ metric: "score", op: ">=", value: 10, label: "Best fit for every workload" }],
      hints: [
        "Which workload needs multi-row transactions and constraints?",
        "Which one writes a million events a second and reads by device and time range?",
        "Which one walks relationships several hops deep?",
      ],
    },
  ],
  explainBack: {
    prompt: "Pick a data store family for three workloads of your choice and say why each fits.",
    rubric: [
      { id: "rel", criterion: "Relational for data with relationships, constraints, and multi-row transactions", keyIdea: "relational for transactions and joins" },
      { id: "nosql", criterion: "A key-value, document, or wide-column store chosen by an access pattern such as key lookups, whole-record reads, or write-heavy time-range reads", keyIdea: "match the access pattern" },
      { id: "cost", criterion: "Weighs the operational cost of adding another system against the fit", keyIdea: "each system has a cost" },
    ],
    exemplar:
      "Orders and payments go in a relational database for transactions, constraints, and joins. Carts and sessions are get-and-put by key at high volume with expiry, so a key-value store fits. Sensor events at a million writes a second read by device and time range, which a wide-column store is built for. I would still weigh each extra system's operating cost, and keep what Postgres handles acceptably in Postgres.",
  },
  reviews: [
    {
      id: "sn-pick",
      format: "pick-fix",
      scenario: "A product catalogue has thousands of categories, each with different attributes, and pages load one whole product by id. Which family fits best?",
      options: [
        { id: "a", label: "Document store, one document per product" },
        { id: "b", label: "Graph database" },
        { id: "c", label: "Wide-column time-series store" },
        { id: "d", label: "A table with a column for every possible attribute" },
      ],
      answer: "a",
      explain: "Variable shape and whole-record reads are what documents are good at. Postgres with a JSONB column is also workable, which is why this is a close call.",
    },
    {
      id: "sn-pick2",
      format: "pick-fix",
      scenario: "A bank needs to move money between accounts with constraints and rollback if any step fails. Which family fits best?",
      options: [
        { id: "a", label: "Relational database with transactions" },
        { id: "b", label: "Key-value store with eventual consistency" },
        { id: "c", label: "Wide-column store" },
        { id: "d", label: "Graph database" },
      ],
      answer: "a",
      explain: "Multi-row atomicity and constraints are the relational strengths. Eventually consistent stores do not give the guarantee a ledger needs.",
    },
    {
      id: "sn-pick3",
      format: "pick-fix",
      scenario: "Recommendations need 'friends of friends who like the same bands' three hops out, in milliseconds, on a social graph. Which family fits best?",
      options: [
        { id: "a", label: "Graph database" },
        { id: "b", label: "Key-value store" },
        { id: "c", label: "Relational with three self-joins on a billion-row table" },
        { id: "d", label: "Document store" },
      ],
      answer: "a",
      explain: "Deep traversals are where graph stores shine: they follow stored relationships directly instead of joining. A relational schema can do it at small scale, but the cost grows with each hop.",
    },
    {
      id: "sn-order",
      format: "order",
      scenario: "Order these by how well a relational database fits, best first.",
      items: [
        { id: "orders", label: "Orders and payments with transactions" },
        { id: "catalog", label: "Variable-shape product catalogue" },
        { id: "friends", label: "Three-hop friend recommendations" },
        { id: "events", label: "A million sensor writes a second" },
      ],
      answer: ["orders", "catalog", "friends", "events"],
      explain: "Relational is best for transactional relationships, workable for documents and graphs at small scale, and strained by extreme write volume.",
    },
    {
      id: "sn-flaw",
      format: "spot-flaw",
      scenario: "A team stores users, orders, payments, and invoices in a document database and then builds reports that join them across collections with application code. Tap the part that fights the database.",
      diagram: {
        nodes: [
          { id: "app", label: "app: joins collections in code", kind: "server", col: 0, row: 1 },
          { id: "docdb", label: "document db · users, orders, payments, invoices", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "docdb" }],
      },
      answer: "app->docdb",
      explain: "Highly related data queried in many ways is the relational sweet spot. Joining in application code recreates a database engine badly and loses transactions across the records.",
    },
    {
      id: "sn-est",
      format: "estimate",
      scenario: "Sensors write 1,000,000 events a second at 100 bytes each. About how many MB a second is that, before any replication?",
      unit: "MB/s",
      answer: 100,
      acceptFactor: 1.2,
      breakdown: ["1,000,000 × 100 bytes", "= 100,000,000 bytes per second", "= 100 MB/s"],
      explain: "A tenth of a gigabyte a second, around the clock, is 8.6 TB a day. That volume is why the choice of write path matters.",
    },
    {
      id: "sn-explain",
      format: "explain",
      scenario: "In two sentences: why is 'which database is best' the wrong question?",
      rubric: [
        { id: "pattern", criterion: "Each family is built for particular access patterns and guarantees" },
        { id: "cost", criterion: "The right choice depends on workload, scale, consistency needs, and what the team can operate" },
      ],
      exemplar: "Each family optimises for particular access patterns and guarantees, so no one is best at everything. The right choice depends on the workload, the scale, the consistency required, and what the team can operate.",
      explain: "Databases are tools with shapes.",
    },
  ],
  codex: {
    oneLiner: "Match the store to the access pattern: relational for transactions, key-value for get/put, documents for whole records, wide-column for writes, graph for traversals.",
    keyNumbers: [
      { label: "Relational strength", value: "multi-row transactions, joins, constraints", sourceId: "ddia" },
      { label: "Dynamo-style key-value", value: "partition by key, replicate, eventual consistency", sourceId: "dynamo-2007" },
      { label: "Cassandra data model", value: "partition key plus clustering columns, designed per query", sourceId: "cassandra-docs" },
    ],
    tradeoffs: [
      { choice: "Relational", gain: "Flexible queries, transactions, constraints", cost: "Scaling writes needs sharding work" },
      { choice: "Key-value or document", gain: "Simple, fast, easy to shard", cost: "Few query shapes; joins and cross-record transactions are limited" },
      { choice: "Wide-column", gain: "Enormous write throughput and time-range reads", cost: "Queries must be designed up front; eventual consistency" },
      { choice: "Graph", gain: "Cheap deep traversals", cost: "A specialised system with its own operations" },
    ],
    seenIn: ["Redis for sessions next to Postgres for orders.", "DynamoDB or Cassandra for write-heavy event data."],
    interviewAngle: "State the access patterns first: 'the cart is get and put by key, so Redis; the orders need transactions, so Postgres.' Name the trade you accept for each.",
    aws: [{ concept: "Families on AWS", service: "RDS/Aurora (relational), DynamoDB (key-value, document), ElastiCache (key-value), Keyspaces (wide-column), Neptune (graph)" }],
    replay: { id: "match-lab", config: MATCH, scene: "rel" },
  },
  interview: [
    "When would you choose a NoSQL database over Postgres?",
    "How would you store a shopping cart? An order? A time series of sensor readings?",
    "What do you give up when you leave the relational model?",
  ],
  deeper: [
    {
      title: "Polyglot persistence and its cost",
      body: "Using several stores, each for what it does best, is called polyglot persistence. Each store needs its own backup, monitoring, upgrades, and on-call knowledge, and data that lives in two places must be kept in sync. Add a specialised store when a workload clearly does not fit, not before.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Each workload has one best-fit family and some workable ones. Real choices depend on team skills, operations, and scale you may never reach.",
    "A fit of 1 means workable with effort, for example JSON documents in Postgres or key lookups in a table.",
  ],
  sources: [DDIA, DYNAMO, CASSANDRA],
  verify: [
    { id: "all-rel", claim: "All relational scores 5 of 10", run: "lab", params: { model: "match-lab", config: MATCH, values: {}, metric: "score" }, expect: { min: 5, max: 5 } },
    { id: "best", claim: "The best match for every workload scores 10", run: "lab", params: { model: "match-lab", config: MATCH, values: { orders: "rel", carts: "kv", catalog: "doc", events: "wide", friends: "graph" }, metric: "score" }, expect: { min: 10, max: 10 } },
    { id: "misfit", claim: "All relational leaves one poor fit", run: "lab", params: { model: "match-lab", config: MATCH, values: {}, metric: "misfits" }, expect: { min: 1 } },
    { id: "lean", claim: "Relational plus a wide-column store clears the bar", run: "lab", params: { model: "match-lab", config: MATCH, values: { events: "wide" }, metric: "score" }, expect: { min: 7 } },
  ],
});
