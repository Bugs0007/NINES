import { definePack, SRC } from "../define";

export const POOL = { appWorkers: 16, poolPerWorker: 10, dbCores: 4, maxConnections: 100, reserved: 3, queryMs: 8, rps: 600, poolerSize: 20 };

const HIKARI = { id: "hikari-pool-sizing", title: "HikariCP wiki: About Pool Sizing (connections ≈ cores × 2 + effective spindles)", url: "https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing" };
const PGBOUNCER = { id: "pgbouncer-features", title: "PgBouncer docs: Features (session, transaction, and statement pooling)", url: "https://www.pgbouncer.org/features.html" };

export default definePack({
  id: "connection-pooling",
  title: "Connection Pooling",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "FATAL: sorry, too many clients already", detail: "postgres · api deploy v57" },
    lines: [
      { speaker: "pager", line: "Deploy v57 is out and half the workers crash-loop on 'too many clients already', with database CPU at 40%." },
      { speaker: "meera", line: "The database is not busy. It is full, and those are different problems." },
    ],
  },
  predictions: [
    {
      id: "refused",
      kind: "choice",
      prompt: "Pigeon runs 16 app workers, each with a pool of 10 database connections. Postgres allows 100 connections, with a few reserved. What happens when every worker has filled its pool?",
      options: [
        { id: "fine", label: "Everything works; 100 is plenty" },
        { id: "slow", label: "It works but queries are slower" },
        { id: "refused", label: "Some connections are refused and workers error" },
        { id: "crash", label: "Postgres crashes" },
      ],
      answer: "refused",
      observe: "over-max",
      reveal: {
        text: "Sixteen workers times ten connections asks for 160. Postgres allows 100 and reserves 3 for superusers, so 97 succeed and the rest get 'too many clients already'. Postgres itself stays up.",
        sourceIds: ["pg-connections"],
        line: { speaker: "rao", line: "Every pool is polite on its own. Together they are a crowd." },
      },
    },
  ],
  widget: { id: "pool-lab", config: { ...POOL, start: { workers: 4, perWorker: 5 } } },
  mechanism: [
    {
      id: "budget",
      scene: "budget",
      text: "Every slot in a pool is one connection to Postgres, and Postgres has a hard cap: max_connections defaults to 100, with some reserved for administrators. Connections are multiplied: workers times pool size times the number of app instances.",
      sourceIds: ["pg-connections"],
    },
    {
      id: "more-not-faster",
      text: "More connections do not make a database faster. It can run about as many queries at once as it has cores, plus a few for waits on disk. HikariCP's guide suggests starting near two connections per core plus the number of disks. Extra connections queue inside the database and add memory and scheduling cost.",
      sourceIds: ["hikari-pool-sizing"],
    },
    {
      id: "pooler",
      scene: "pooler",
      text: "A pooler such as PgBouncer in transaction mode lends a server connection only for the length of a transaction. Hundreds of client connections can share a few dozen real ones. The price is one more hop and some lost session features.",
      sourceIds: ["pgbouncer-features"],
    },
    {
      id: "littles",
      text: "Little's Law sizes the steady state: 600 requests a second at 8 ms of database time keeps about 5 connections busy on average. A pool of dozens is for bursts and slow queries, not for the steady load.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "healthy-deploy",
      title: "Make the deploy healthy",
      brief: "Sixteen app workers, each hard-coded to a pool of 10, against a 4-vCPU Postgres with max_connections 100. Peak is 600 requests a second at 8 ms of database time each. Fix the connection plan so there are no errors and p99 stays under 40 ms.",
      line: { speaker: "kabir", line: "I can change the pool size or put a pooler in front. I cannot change the database." },
      widget: { id: "pool-lab", config: POOL },
      conditions: [
        { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
        { metric: "p99", op: "<", value: 0.04, label: "p99 under 40 ms" },
      ],
      stars: [{ metric: "serverConns", op: "<=", value: 24, label: "Database holds 24 connections or fewer" }],
      hints: [
        "How many connections do 16 workers with pools of 10 ask for, compared with what Postgres allows?",
        "Steady state needs only a handful of connections. How many are busy on average at 600 requests a second?",
        "You can shrink each pool, or make many clients share a few server connections. Which keeps the database holding the fewest?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why can a database run out of connections while its CPU is nearly idle, and how do you fix it?",
    rubric: [
      { id: "multiply", criterion: "Connections multiply across workers, pool size, and instances, and the database has a hard cap", keyIdea: "workers × pool × instances vs max_connections" },
      { id: "not-cpu", criterion: "Connection limits and CPU are separate: the database is full of idle connections, not busy", keyIdea: "full is not busy" },
      { id: "fix", criterion: "Shrinks pools to what is needed or adds a transaction-mode pooler", keyIdea: "right-size or PgBouncer" },
    ],
    exemplar:
      "Each worker holds its own pool, so the total is workers times pool size times instances, and Postgres has a hard cap on connections. The connections can be mostly idle, so CPU is low while new ones are refused. I would shrink pools to what the steady load needs, or put a transaction-mode pooler in front so many clients share a few server connections.",
  },
  reviews: [
    {
      id: "cp-est-little",
      format: "estimate",
      scenario: "A service handles 400 requests a second, and each request holds a database connection for 25 ms. On average, how many connections are in use?",
      unit: "connections",
      answer: 10,
      acceptFactor: 1.3,
      breakdown: ["L = λ × W", "400 req/s × 0.025 s", "= 10 connections"],
      explain: "Little's Law again. Ten busy connections serve the whole load, so a pool of 100 is mostly idle slots.",
    },
    {
      id: "cp-est-total",
      format: "estimate",
      scenario: "Twelve app instances each run 8 workers with a pool of 2 connections per worker. How many connections do they request in total?",
      unit: "connections",
      answer: 192,
      acceptFactor: 1.2,
      breakdown: ["12 instances × 8 workers = 96 workers", "96 × 2 connections", "= 192"],
      explain: "Multiply the three levels. 192 is nearly double Postgres's default limit of 100.",
    },
    {
      id: "cp-pick",
      format: "pick-fix",
      scenario: "Autoscaling takes the API from 4 pods to 20. Each pod runs 4 workers with a pool of 5. The database starts refusing connections at 14 pods. What is the best fix?",
      options: [
        { id: "a", label: "Raise max_connections to several thousand" },
        { id: "b", label: "Put PgBouncer in transaction mode between the pods and Postgres" },
        { id: "c", label: "Restart the pods when errors appear" },
        { id: "d", label: "Give each pod a bigger pool so retries succeed" },
      ],
      answer: "b",
      explain: "A pooler decouples the number of clients from the number of server connections, so autoscaling no longer eats the connection budget. Raising the limit costs memory and does not make queries faster.",
      why: {
        prompt: "Why does a bigger pool per pod make it worse?",
        options: [
          { id: "a", label: "It asks for even more connections from a capped database" },
          { id: "b", label: "It slows the network" },
          { id: "c", label: "It disables retries" },
        ],
        answer: "a",
      },
    },
    {
      id: "cp-graph",
      format: "predict-graph",
      scenario: "Hold the load fixed on a 4-core database and raise the number of connections from 1 to 100. What happens to the throughput it can sustain?",
      xLabel: "connections →",
      yLabel: "throughput",
      options: [
        { id: "linear", label: "Grows steadily the whole way", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "peak", label: "Rises, levels off, then slowly drops", points: [1, 4, 7, 8, 8, 7.6, 7.2, 6.8] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "cliff", label: "Grows, then collapses at once", points: [1, 3, 5, 7, 8, 1, 1, 1] },
      ],
      answer: "peak",
      explain: "Once there are enough connections to keep the cores and disks busy, extra ones just add contention. The exact peak depends on the workload, which is why you size from cores and measure.",
    },
    {
      id: "cp-order",
      format: "order",
      scenario: "Order these deployments by how many database connections they request, fewest first.",
      items: [
        { id: "a", label: "4 pods × 4 workers × pool 3" },
        { id: "b", label: "10 pods × 4 workers × pool 5" },
        { id: "c", label: "2 pods × 8 workers × pool 10" },
        { id: "d", label: "1 pod × 2 workers × pool 5" },
      ],
      answer: ["d", "a", "c", "b"],
      explain: "10, 48, 160, and 200 connections. The pool size is one of three multipliers.",
    },
    {
      id: "cp-explain",
      format: "explain",
      scenario: "In two sentences: what does a transaction-mode pooler like PgBouncer change about how many connections the database sees?",
      rubric: [
        { id: "share", criterion: "Many client connections share a small set of server connections" },
        { id: "lend", criterion: "A server connection is lent only for the duration of a transaction" },
      ],
      exemplar: "PgBouncer lets many client connections share a small set of real server connections. In transaction mode it assigns a server connection only while a transaction runs, so idle clients cost the database nothing.",
      explain: "The database's connection count stops depending on how many clients you have.",
    },
  ],
  codex: {
    oneLiner: "Connections = workers × pool × instances, and the database has a hard cap. Size pools from steady load; add a pooler as clients multiply.",
    keyNumbers: [
      { label: "Postgres default max_connections", value: "100", sourceId: "pg-connections" },
      { label: "Starting pool size", value: "about cores × 2 + disks", sourceId: "hikari-pool-sizing" },
      { label: "Busy connections", value: "requests per second × seconds per query", sourceId: "little-1961" },
    ],
    tradeoffs: [
      { choice: "Small per-process pools", gain: "Low database load, predictable", cost: "Slow queries can starve a worker waiting for a slot" },
      { choice: "Transaction-mode pooler", gain: "Clients can scale freely over a few server connections", cost: "An extra hop, and no session-level state across transactions" },
      { choice: "Raise max_connections", gain: "Quick relief", cost: "Memory per connection, contention, and no extra throughput" },
    ],
    seenIn: [
      "Autoscaling that works until the database says 'too many clients'.",
      "RDS Proxy and PgBouncer in front of Postgres for serverless and containerised apps.",
    ],
    interviewAngle: "Whenever you add app instances, say what it does to the database connection count, and name the pooler: 'each pod would add its own pool, so I would put a connection pooler in front.'",
    aws: [{ concept: "Managed connection pooler", service: "Amazon RDS Proxy", note: "Pools and shares connections for RDS and Aurora" }],
    otherClouds: "GCP: Cloud SQL managed connection pooling · Azure: PgBouncer built into Flexible Server",
    replay: { id: "pool-lab", config: { ...POOL, start: { workers: 16, perWorker: 10 } }, scene: "budget" },
  },
  interview: [
    "Your app autoscales and the database starts refusing connections. What happened and what do you change?",
    "How would you decide the pool size for a service?",
    "What are the downsides of a transaction-mode pooler?",
  ],
  deeper: [
    {
      title: "Why a small pool can be faster",
      body: "A database with four cores can usefully run about a dozen queries at once. Giving it ninety-seven concurrent queries makes the operating system switch among them, caches thrash, and locks are held longer. A small pool in front of it queues requests cheaply in the application, where waiting is free, and keeps the database working at its best concurrency.",
      sourceIds: ["hikari-pool-sizing"],
    },
    {
      title: "What transaction pooling breaks",
      body: "Session state lives on a server connection, and in transaction mode a client may land on a different one each time. Session-level settings, advisory locks, and some uses of prepared statements need care or a different mode. Check the PgBouncer feature table before you switch.",
      sourceIds: ["pgbouncer-features"],
    },
  ],
  honestPhysics: [
    "The database is modelled as about two parallel workers per core plus one, with a gentle slowdown past that. Real engines differ with workload, disk, and Postgres version.",
    "Refused connections are modelled as lost requests. Real apps retry, which turns a connection shortage into a retry storm.",
    "The pooler is modelled as always up and costing no latency beyond half a millisecond.",
  ],
  sources: [SRC.pgConnections, HIKARI, PGBOUNCER, SRC.little1961],
  verify: [
    { id: "ask", claim: "16 workers with pools of 10 request 160 connections", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 10, pooler: false }, metric: "clientConns" }, expect: { min: 160, max: 160 } },
    { id: "errors", claim: "That plan refuses well over a third of requests", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 10, pooler: false }, metric: "errorRate" }, expect: { min: 0.35 } },
    { id: "pool4", claim: "A pool of 4 per worker is healthy", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 4, pooler: false }, metric: "p99" }, expect: { max: 0.04 } },
    { id: "pool5", claim: "A pool of 5 per worker misses the 40 ms target", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 5, pooler: false }, metric: "p99" }, expect: { min: 0.04 } },
    { id: "pooler", claim: "A 10-connection PgBouncer holds the load without errors", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 10, pooler: true, poolerSize: 10 }, metric: "errorRate" }, expect: { max: 0.001 } },
    { id: "pooler-small", claim: "A 4-connection PgBouncer is too small and overloads the database", run: "lab", params: { model: "pool-lab", config: POOL, values: { workers: 16, perWorker: 10, pooler: true, poolerSize: 4 }, metric: "errorRate" }, expect: { min: 0.1 } },
  ],
});
