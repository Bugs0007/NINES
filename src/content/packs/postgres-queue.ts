import { definePack } from "../define";

export const PGQ = { start: { method: "forupdate", workers: 8, pollMs: 500, notify: false } };
export const PGQ_CHALLENGE = {};

const PG_LOCK = { id: "pg-select-locking", title: "PostgreSQL docs: SELECT, The Locking Clause (FOR UPDATE, SKIP LOCKED)", url: "https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE" };
const PG_NOTIFY = { id: "pg-notify", title: "PostgreSQL docs: NOTIFY and LISTEN", url: "https://www.postgresql.org/docs/current/sql-notify.html" };
const SECOND_Q = { id: "2ndq-skip-locked", title: "2ndQuadrant: What is SELECT SKIP LOCKED for in PostgreSQL 9.5?", url: "https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/" };

export default definePack({
  id: "postgres-queue",
  title: "Postgres as a Queue (SKIP LOCKED)",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "launch",
    alert: { severity: "info", title: "jobs · 2,000 a day, a new broker is on the roadmap", detail: "the team has a Postgres already" },
    lines: [
      { speaker: "kabir", line: "We need background jobs and someone wants a broker, which is another system to run and be paged for. Could our existing database do it?" },
      { speaker: "meera", line: "For thousands of jobs a second, yes, and many teams do. The trick is letting several workers take different rows without waiting on each other or taking the same one." },
    ],
  },
  predictions: [
    {
      id: "dupes",
      kind: "choice",
      prompt: "Eight workers each read a pending job with SELECT, then mark it taken with UPDATE, as two separate steps. With the lab's collision rate of 4% for each extra worker, what share of jobs is run twice?",
      options: [
        { id: "none", label: "None: the UPDATE protects them" },
        { id: "few", label: "About 3%" },
        { id: "many", label: "About 28%" },
        { id: "most", label: "Most of them" },
      ],
      answer: "many",
      observe: "dupes",
      reveal: {
        text: "Two workers can read the same pending row before either marks it taken, and then both run the job. With seven rivals each adding a chance of collision, about 28% of jobs run twice. A job queue that runs jobs twice is a bug generator.",
        derived: true,
        line: { speaker: "meera", line: "Looking, then claiming, are two steps. Anything can happen in between." },
      },
    },
    {
      id: "skip",
      kind: "choice",
      prompt: "SELECT … FOR UPDATE makes workers line up on the first row, capping claims near 500 a second. With SKIP LOCKED and 40 workers on 20 ms jobs, how many jobs a second can run?",
      options: [
        { id: "five-hundred", label: "Still about 500" },
        { id: "thousand", label: "About 1,000" },
        { id: "two-thousand", label: "About 2,000" },
        { id: "ten-thousand", label: "About 10,000" },
      ],
      answer: "two-thousand",
      observe: "skip-on",
      reveal: {
        text: "With SKIP LOCKED each worker takes the first row nobody else holds, so claims run in parallel. 40 workers each finishing 50 jobs a second give 2,000 a second, below the database's ceiling of about 5,000 in the lab. Add workers until the database, not the lock, is the limit.",
        derived: true,
        line: { speaker: "rao", line: "No new system, and it does two thousand a second." },
      },
    },
  ],
  widget: { id: "pgqueue-lab", config: PGQ },
  mechanism: [
    {
      id: "table",
      text: "A jobs table with a status column is the simplest queue: insert a row to enqueue, claim a row to work on it, mark it done. You get transactions for free: enqueue a job in the same transaction as the data change that caused it, and neither can happen without the other.",
      sourceIds: ["2ndq-skip-locked"],
    },
    {
      id: "naive",
      scene: "naive",
      text: "Claiming with a SELECT followed by an UPDATE is a race. Two workers read the same pending row, both update it, both run the job. Wrapping the pair in a transaction does not stop it, because both transactions see the same unclaimed row until one of them writes.",
      sourceIds: ["pg-select-locking"],
    },
    {
      id: "forupdate",
      scene: "forupdate",
      text: "SELECT … FOR UPDATE locks the row it returns, so a second worker waits for the first to finish. It is correct, but every worker reaches for the same first row and queues behind the one that holds it, so claims are serialised however many workers you have.",
      sourceIds: ["pg-select-locking"],
    },
    {
      id: "skiplocked",
      scene: "skiplocked",
      text: "FOR UPDATE SKIP LOCKED tells Postgres to skip rows another transaction has locked and take the next free one. Workers fan out over different rows with no waiting and no duplicates. Add LISTEN/NOTIFY so idle workers wake on new jobs instead of polling the table every few milliseconds.",
      sourceIds: ["pg-select-locking", "pg-notify", "2ndq-skip-locked"],
    },
  ],
  challenges: [
    {
      id: "job-queue",
      title: "Build the job queue",
      brief: "Jobs take 20 ms each. Choose how workers claim jobs, how many to run, and how they wait, so at least 1,500 jobs a second run, none run twice, a job starts within 150 ms of arriving, and idle polling is at most 200 queries a second.",
      line: { speaker: "rao", line: "If this works, we skip the broker. If it does not, I would rather know now." },
      widget: { id: "pgqueue-lab", config: PGQ_CHALLENGE },
      conditions: [
        { metric: "jobsPerSec", op: ">=", value: 1500, label: "At least 1,500 jobs a second" },
        { metric: "dupPct", op: "<=", value: 0, label: "No job runs twice" },
        { metric: "waitMs", op: "<=", value: 150, label: "A job starts within 150 ms" },
        { metric: "idlePolls", op: "<=", value: 200, label: "At most 200 idle polls a second" },
      ],
      stars: [{ metric: "idlePolls", op: "<=", value: 0, label: "No idle polling" }],
      hints: [
        "Which claiming method gives parallel workers and no duplicates?",
        "How many workers does 1,500 jobs a second need at 50 jobs a second each?",
        "Polling every few milliseconds is wasteful. What wakes a worker without it?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how to build a safe, fast job queue in Postgres.",
    rubric: [
      { id: "race", criterion: "A SELECT then UPDATE lets two workers claim the same row, so jobs can run twice", keyIdea: "claim race" },
      { id: "skip", criterion: "FOR UPDATE SKIP LOCKED lets each worker take a different unlocked row in parallel with no duplicates", keyIdea: "skip locked rows" },
      { id: "notify", criterion: "Use LISTEN/NOTIFY or a sensible poll interval so idle workers do not hammer the database", keyIdea: "wake on notify" },
    ],
    exemplar:
      "Claiming a job with a SELECT and then an UPDATE is a race, so two workers can take the same row and run it twice. FOR UPDATE alone is safe but serialises the workers on the first row. FOR UPDATE SKIP LOCKED lets each worker take a different unlocked row in parallel without duplicates, and LISTEN/NOTIFY wakes idle workers on new jobs so they do not poll the table constantly.",
  },
  reviews: [
    {
      id: "pq-est",
      format: "estimate",
      scenario: "Each job takes 25 ms and you run 30 workers claiming with SKIP LOCKED. About how many jobs a second can be run, if the database is not the limit?",
      unit: "jobs/s",
      answer: 1200,
      acceptFactor: 1.05,
      breakdown: ["one worker: 1 ÷ 0.025 s = 40 jobs a second", "× 30 workers", "= 1,200"],
      explain: "Throughput is workers ÷ job time, until the database or a lock gets in the way.",
    },
    {
      id: "pq-pick",
      format: "pick-fix",
      scenario: "A Postgres job queue works at 20 jobs a second with one worker, but adding workers makes some jobs run twice. What is the right fix?",
      options: [
        { id: "a", label: "Claim jobs with SELECT … FOR UPDATE SKIP LOCKED inside a transaction" },
        { id: "b", label: "Add a sleep before each claim" },
        { id: "c", label: "Run only one worker" },
        { id: "d", label: "Move the queue to Redis" },
      ],
      answer: "a",
      explain: "SKIP LOCKED makes claiming atomic and parallel. A sleep only narrows the race, and moving systems is not needed.",
    },
    {
      id: "pq-order",
      format: "order",
      scenario: "Order these claiming methods by throughput with 40 workers and 20 ms jobs, highest first.",
      items: [
        { id: "skip", label: "FOR UPDATE SKIP LOCKED" },
        { id: "naive", label: "SELECT then UPDATE (with duplicates)" },
        { id: "forupdate", label: "FOR UPDATE (serialised)" },
      ],
      answer: ["skip", "naive", "forupdate"],
      explain: "SKIP LOCKED runs in parallel. The naive method is parallel too but wastes work on duplicates; FOR UPDATE caps at the serialised claim rate.",
    },
    {
      id: "pq-graph",
      format: "predict-graph",
      scenario: "With SKIP LOCKED and 20 ms jobs, as you raise workers from 1 to 64, how does throughput change?",
      xLabel: "workers →",
      yLabel: "jobs per second",
      options: [
        { id: "linear", label: "Rises in proportion, until it reaches the database's ceiling", points: [50, 100, 200, 400, 800, 1600, 3200, 3200] },
        { id: "flat", label: "Stays flat", points: [50, 50, 50, 50, 50, 50, 50, 50] },
        { id: "fall", label: "Falls", points: [3200, 1600, 800, 400, 200, 100, 50, 25] },
      ],
      answer: "linear",
      explain: "Each worker adds 50 jobs a second until the database's own ceiling takes over. FOR UPDATE alone would flatten at around 500.",
    },
    {
      id: "pq-flaw",
      format: "spot-flaw",
      scenario: "A worker starts a transaction, claims a row with SKIP LOCKED, calls a slow third-party API for 5 minutes, and then commits. Under load, the table has thousands of rows locked and the database slows. Tap the step that causes it.",
      diagram: {
        nodes: [
          { id: "claim", label: "BEGIN, claim a row", kind: "db", col: 0, row: 1 },
          { id: "api", label: "call the API (5 minutes)", kind: "external", col: 1, row: 1 },
          { id: "commit", label: "COMMIT", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "claim", to: "api" },
          { from: "api", to: "commit" },
        ],
      },
      answer: "claim->api",
      explain: "A transaction held open during slow work keeps its lock and a long-running snapshot, which blocks vacuum and bloats the table. Mark the job as running with a lease, commit, and do the work outside the transaction.",
    },
    {
      id: "pq-explain",
      format: "explain",
      scenario: "In two sentences: when is a Postgres queue a good choice and when should you move to a broker?",
      rubric: [
        { id: "good", criterion: "When volume is modest, you already run Postgres, and you want transactional enqueue with your data" },
        { id: "move", criterion: "When you need very high throughput, many independent consumers, replay, or fan-out, which a log or broker does natively" },
      ],
      exemplar: "A Postgres queue fits modest volumes, especially when you already run Postgres and want jobs enqueued in the same transaction as the data. Move to a broker when you need very high throughput, many independent consumers, replay or fan-out.",
      explain: "Use the system you already run until it is the limit.",
    },
  ],
  codex: {
    oneLiner: "A jobs table plus FOR UPDATE SKIP LOCKED gives parallel, duplicate-free claiming, and LISTEN/NOTIFY avoids polling. Good for thousands of jobs a second.",
    keyNumbers: [
      { label: "Throughput with SKIP LOCKED", value: "workers ÷ job time, up to the database's limit", sourceId: "pg-select-locking" },
      { label: "Idle polling cost", value: "workers × polls per second", sourceId: "pg-notify" },
    ],
    tradeoffs: [
      { choice: "Postgres queue", gain: "No new system; transactional enqueue", cost: "Bloat and vacuum care; ceiling of thousands, not millions, a second" },
      { choice: "SKIP LOCKED", gain: "Parallel claims without duplicates", cost: "No strict ordering across workers" },
      { choice: "LISTEN/NOTIFY", gain: "Instant wake, no idle polling", cost: "Notifications can be missed, so poll slowly as a backstop" },
    ],
    seenIn: ["Que, GoodJob, Oban, pg-boss and Solid Queue.", "Transactional outbox relays."],
    interviewAngle: "Say: 'a jobs table with FOR UPDATE SKIP LOCKED, enqueue in the same transaction, NOTIFY to wake workers, and a lease so crashed workers' jobs come back'.",
    aws: [{ concept: "Postgres-compatible managed database", service: "RDS / Aurora PostgreSQL" }],
    replay: { id: "pgqueue-lab", config: PGQ, scene: "skiplocked" },
  },
  interview: [
    "How would you implement a job queue on Postgres?",
    "What does SKIP LOCKED do?",
    "When would you outgrow a database-backed queue?",
  ],
  deeper: [
    {
      title: "Table bloat and the cost of churn",
      body: "A queue table is all inserts and deletes or updates. In Postgres, every update or delete leaves a dead row behind until vacuum removes it, so a busy queue table can bloat and slow its own index scans. Keep the table small by deleting or partitioning completed jobs, and tune autovacuum for it.",
      sourceIds: ["pg-select-locking"],
    },
  ],
  honestPhysics: [
    "A jobs table in Postgres, jobs of 20 ms. 'Select then update' collides: the lab uses a duplicate share of 4% for each additional worker, capped at 100%. 'FOR UPDATE' serialises claims at about 500 a second. 'SKIP LOCKED' lets claims run in parallel up to a database ceiling of 5,000 a second.",
    "Idle workers poll at the interval set; each poll is a query. LISTEN/NOTIFY wakes workers on arrival, so there are no idle polls and the wait is a few milliseconds.",
    "These are round figures for a modest instance, not benchmarks.",
  ],
  sources: [PG_LOCK, PG_NOTIFY, SECOND_Q],
  verify: [
    { id: "dupes", claim: "Eight workers using SELECT then UPDATE run 28% of jobs twice", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "naive", workers: 8 }, metric: "dupPct" }, expect: { min: 0.27, max: 0.29 } },
    { id: "fu", claim: "FOR UPDATE caps eight workers near 400 jobs a second", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "forupdate", workers: 8 }, metric: "jobsPerSec" }, expect: { max: 500 } },
    { id: "fu-big", claim: "…and 64 workers still cap at 500", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "forupdate", workers: 64 }, metric: "jobsPerSec" }, expect: { max: 500 } },
    { id: "skip", claim: "SKIP LOCKED with 40 workers runs 2,000 jobs a second", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "skip", workers: 40 }, metric: "jobsPerSec" }, expect: { min: 2000, max: 2000 } },
    { id: "skip-dupes", claim: "…with no duplicates", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "skip", workers: 40 }, metric: "dupPct" }, expect: { max: 0 } },
    { id: "poll", claim: "Polling every 5 ms from 40 workers makes 8,000 queries a second", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "skip", workers: 40, pollMs: 5, notify: false }, metric: "idlePolls" }, expect: { min: 8000 } },
    { id: "notify", claim: "LISTEN/NOTIFY removes idle polling", run: "lab", params: { model: "pgqueue-lab", config: PGQ_CHALLENGE, values: { method: "skip", workers: 40, notify: true }, metric: "idlePolls" }, expect: { max: 0 } },
  ],
});
