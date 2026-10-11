import { definePack } from "../define";

export const PQP = { start: { lease: 15, attempts: 5, backoff: true, rows: "partition" } };
export const PQP_CHALLENGE = { start: { lease: 0, attempts: 0, backoff: false, rows: "keep" } };

const PG_LOCK = { id: "pg-select-locking", title: "PostgreSQL docs: SELECT, The Locking Clause (FOR UPDATE, SKIP LOCKED)", url: "https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE" };
const PG_VACUUM = { id: "pg-vacuum", title: "PostgreSQL docs: Routine Vacuuming", url: "https://www.postgresql.org/docs/current/routine-vacuuming.html" };
const PG_PART = { id: "pg-partitioning", title: "PostgreSQL docs: Table Partitioning", url: "https://www.postgresql.org/docs/current/ddl-partitioning.html" };
const SQS_VIS = { id: "sqs-visibility", title: "Amazon SQS docs: Visibility timeout", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html" };
const SQS_DLQ = { id: "sqs-dlq", title: "Amazon SQS docs: Dead-letter queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" };

export default definePack({
  id: "prod-pg-job-queue",
  title: "Production: The Postgres Job Queue",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "jobs · 48 stuck in 'running', queue table 52 GB", detail: "the SKIP LOCKED queue worked in the demo" },
    lines: [
      { speaker: "kabir", line: "The queue passed the load test. In production, jobs sit in 'running' forever after a deploy, one bad payload froze half the workers, and the table is 52 gigabytes." },
      { speaker: "meera", line: "Claiming a job was the easy part. Production asks what happens when the worker dies, the job never succeeds, or the table never stops growing." },
    ],
  },
  predictions: [
    {
      id: "stuck",
      kind: "choice",
      prompt: "Workers claim a job by marking it 'running'. There is no lease. A worker crashes about twice an hour. How many jobs a day stay in 'running' forever?",
      options: [
        { id: "none", label: "None: another worker notices" },
        { id: "few", label: "About 5" },
        { id: "many", label: "About 48" },
        { id: "all", label: "Hundreds" },
      ],
      answer: "many",
      observe: "stuck-forever",
      reveal: {
        text: "Nothing ever marks a crashed worker's job as available again, so every crash leaves one job running forever: two an hour is 48 a day. They are never retried and never fail, which is why nobody is paged.",
        derived: true,
        line: { speaker: "meera", line: "A claim without an expiry is a lock with no owner." },
      },
    },
    {
      id: "poison",
      kind: "choice",
      prompt: "One job in a thousand is poison: it fails every time. At 200 jobs a second with 40 workers and unlimited retries, what happens to your worker capacity?",
      options: [
        { id: "nothing", label: "Nothing: it is one in a thousand" },
        { id: "one", label: "About 1% is lost" },
        { id: "five", label: "About 5% is lost" },
        { id: "all", label: "Every worker ends up retrying poison jobs" },
      ],
      answer: "all",
      observe: "pinned",
      reveal: {
        text: "A new poison job arrives every five seconds (200 × 0.001 = 0.2 a second), and it never leaves. Each one occupies a worker in an endless retry loop, so the 40 workers are all taken within a few minutes. The good jobs wait behind them.",
        derived: true,
        line: { speaker: "rao", line: "That is the incident from last quarter." },
      },
    },
  ],
  widget: { id: "pgq-prod-lab", config: PQP },
  mechanism: [
    {
      id: "lease",
      scene: "lease",
      text: "A claim should carry a lease: a time by which the job must finish. If the worker dies, the lease expires and the job becomes claimable again. Too short and slow jobs are picked up while still running, so they run twice; too long and a crashed job waits. Pick it from your slow jobs, and make jobs idempotent.",
      sourceIds: ["sqs-visibility", "pg-select-locking"],
    },
    {
      id: "attempts",
      scene: "attempts",
      text: "Count attempts and stop at a limit. After the last attempt, move the job to a dead-letter table for a human, instead of retrying it for ever. Delay each retry with backoff, so a failing job does not burn three times the work in a tight loop.",
      sourceIds: ["sqs-dlq"],
    },
    {
      id: "rows",
      scene: "rows",
      text: "A queue is a table where every row is written, updated and finished. Keeping finished rows slows the claim query; deleting each one leaves dead tuples for vacuum to clean. Partitioning by day lets you drop whole days of finished jobs instantly and keeps the table small.",
      sourceIds: ["pg-vacuum", "pg-partitioning"],
    },
    {
      id: "txn",
      text: "Do not hold a transaction open while a job runs. A long transaction keeps a snapshot that stops vacuum from removing dead rows anywhere in the table. Claim and commit, run the job outside the transaction under its lease, and write the result in a second short transaction.",
      sourceIds: ["pg-vacuum"],
    },
  ],
  challenges: [
    {
      id: "production-safe",
      title: "Make the queue production-safe",
      brief: "The queue claims correctly but has no safeguards. Configure the lease, retry policy and storage so at most 1% of jobs run twice, no job is stuck forever, a crashed job returns within 30 s, poison jobs burn at most 6% of capacity, and the claim query stays under 10 ms.",
      line: { speaker: "rao", line: "Same table, same workers. I just want it to survive a bad week." },
      widget: { id: "pgq-prod-lab", config: PQP_CHALLENGE },
      conditions: [
        { metric: "duplicateShare", op: "<=", value: 0.01, label: "At most 1% of jobs run twice" },
        { metric: "stuckPerDay", op: "<=", value: 0, label: "No job stuck forever" },
        { metric: "recoverySeconds", op: "<=", value: 30, label: "A crashed job returns within 30 s" },
        { metric: "wastedCapacity", op: "<=", value: 0.06, label: "Poison jobs burn at most 6% of capacity" },
        { metric: "claimMs", op: "<=", value: 10, label: "Claim query under 10 ms" },
      ],
      stars: [{ metric: "tableGB", op: "<=", value: 1, label: "Table under 1 GB after a month" }],
      hints: [
        "How long can a job take before its lease should expire? How long can a crash wait?",
        "How many attempts keep the wasted capacity under 6% when each retry is delayed?",
        "Which way of dealing with finished rows keeps the table smallest?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what a Postgres job queue needs beyond SKIP LOCKED to run in production.",
    rubric: [
      { id: "lease", criterion: "A lease or visibility timeout so a crashed worker's job becomes claimable again, sized above normal job time to avoid duplicates, with idempotent handlers", keyIdea: "lease and idempotency" },
      { id: "dlq", criterion: "An attempt limit with backoff and a dead-letter table, so poison jobs stop consuming workers", keyIdea: "attempt limit and dead letters" },
      { id: "table", criterion: "Keep the table small: partition or purge finished rows, avoid long transactions, and tune vacuum", keyIdea: "table hygiene" },
    ],
    exemplar:
      "SKIP LOCKED only handles claiming. In production I add a lease so a crashed worker's job returns after a timeout longer than normal job time, and make handlers idempotent because a slow job can still run twice. I cap attempts, delay retries with backoff, and move failures to a dead-letter table so a poison job cannot pin workers. And I keep the table small by partitioning finished rows by day and dropping old partitions, avoiding long transactions so vacuum can work.",
  },
  reviews: [
    {
      id: "pqp-est",
      format: "estimate",
      scenario: "A queue handles 200 jobs a second and one in a thousand is poison. With a limit of 5 attempts and then a dead-letter table, how many jobs are dead-lettered an hour?",
      unit: "jobs/hour",
      answer: 720,
      acceptFactor: 1.05,
      breakdown: ["poison jobs a second: 200 × 0.001 = 0.2", "a second → an hour: × 3,600", "= 720"],
      explain: "Every poison job ends in the dead-letter table once, whatever the attempt limit; the limit only changes how much work it wastes first.",
    },
    {
      id: "pqp-pick",
      format: "pick-fix",
      scenario: "After a deploy, 12 jobs are stuck in 'running' and no worker holds them. What is the fix that prevents it recurring?",
      options: [
        { id: "a", label: "Give each claim a lease and re-queue jobs whose lease has expired" },
        { id: "b", label: "Run a nightly script that sets all 'running' jobs to 'pending'" },
        { id: "c", label: "Add more workers" },
        { id: "d", label: "Increase the database's connection limit" },
      ],
      answer: "a",
      explain: "A lease makes a claim expire on its own. A nightly reset also re-runs jobs that are still running, and more workers or connections do not touch the cause.",
    },
    {
      id: "pqp-order",
      format: "order",
      scenario: "Order these ways of handling finished jobs by table size after a month, largest first.",
      items: [
        { id: "keep", label: "Keep every finished row" },
        { id: "delete", label: "Delete each finished row immediately" },
        { id: "part", label: "Daily partitions, dropping old days" },
      ],
      answer: ["keep", "delete", "part"],
      explain: "Keeping rows grows without bound, deleting leaves dead tuples until vacuum, and dropping a partition frees the space at once.",
    },
    {
      id: "pqp-graph",
      format: "predict-graph",
      scenario: "As you lengthen the lease from 2 s to 30 s on jobs that take about 2 s, how does the share of jobs that run twice change?",
      xLabel: "lease length →",
      yLabel: "jobs run twice",
      options: [
        { id: "falls", label: "Falls steeply, then flattens near zero", points: [45, 13, 2, 0.3, 0.01, 0, 0, 0] },
        { id: "rises", label: "Rises", points: [0, 0.01, 0.3, 2, 13, 45, 60, 70] },
        { id: "flat", label: "Stays the same", points: [20, 20, 20, 20, 20, 20, 20, 20] },
      ],
      answer: "falls",
      explain: "Only jobs slower than the lease run twice, and slow jobs are rare in the tail, so lengthening the lease removes duplicates quickly. The cost is the longer wait for a crashed job.",
    },
    {
      id: "pqp-flaw",
      format: "spot-flaw",
      scenario: "A handler sends an email and then writes 'done'. A slow mail server makes the call outlast the lease, a second worker claims the job and sends the email again. Tap the step that needs fixing.",
      diagram: {
        nodes: [
          { id: "claim", label: "claim with a lease", kind: "db", col: 0, row: 1 },
          { id: "send", label: "send the email", kind: "external", col: 1, row: 1 },
          { id: "done", label: "write 'done'", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "claim", to: "send" },
          { from: "send", to: "done" },
        ],
      },
      answer: "send->done",
      explain: "Between the side effect and the record that it happened, a lease can expire. Make the send idempotent with a key derived from the job, so a second attempt is a no-op.",
    },
    {
      id: "pqp-explain",
      format: "explain",
      scenario: "In two sentences: why do poison jobs need an attempt limit and a dead-letter table?",
      rubric: [
        { id: "pin", criterion: "A job that always fails and is retried for ever occupies a worker permanently, and enough of them take all workers" },
        { id: "dlq", criterion: "A limit with a dead-letter table stops the loop and keeps the job for a human to inspect and fix" },
      ],
      exemplar: "A job that always fails and is retried for ever pins a worker each time one arrives, until none are left for good jobs. An attempt limit with a dead-letter table stops the loop and keeps the failed job so someone can inspect and repair it.",
      explain: "Retry is for transient failure. Permanent failure needs a place to go.",
    },
  ],
  codex: {
    oneLiner: "A production Postgres queue adds leases, idempotent handlers, an attempt cap with backoff and a dead-letter table, and partitions to keep the table small.",
    keyNumbers: [
      { label: "Stuck jobs with no lease", value: "crashes a day, one job each", sourceId: "sqs-visibility" },
      { label: "Poison job arrival", value: "job rate × poison share", sourceId: "sqs-dlq" },
    ],
    tradeoffs: [
      { choice: "Longer lease", gain: "Fewer duplicate runs", cost: "Crashed jobs wait longer to return" },
      { choice: "Fewer attempts", gain: "Less capacity wasted on poison jobs", cost: "Transient failures reach the dead-letter table sooner" },
      { choice: "Daily partitions", gain: "Instant cleanup, small table", cost: "Partition management and no cross-partition uniqueness" },
    ],
    seenIn: ["Que, GoodJob, Oban, pg-boss and Solid Queue.", "SQS visibility timeouts and redrive policies, which this copies."],
    interviewAngle: "Say: 'SKIP LOCKED to claim, a lease with a heartbeat, idempotent handlers, an attempt cap with backoff and a dead-letter table, no long transactions, and partitioned finished rows'.",
    aws: [{ concept: "Managed queue with visibility timeout and redrive", service: "Amazon SQS with a dead-letter queue" }],
    replay: { id: "pgq-prod-lab", config: PQP, scene: "lease" },
  },
  interview: [
    "How do you stop a crashed worker's job from being lost in a Postgres queue?",
    "What happens to a job that always fails?",
    "How do you stop a queue table from growing forever?",
  ],
  deeper: [
    {
      title: "Exactly once is a design, not a setting",
      body: "A queue with leases gives you at-least-once delivery: a slow or crashed worker can cause a second run. Exactly-once effects come from making the handler idempotent, for example by recording an idempotency key in the same transaction as the side effect on your own database, or passing the key to the external system.",
      sourceIds: ["sqs-visibility"],
    },
  ],
  honestPhysics: [
    "A Postgres queue at 200 jobs a second with 40 workers and jobs of about 2 s. Crashes happen about twice an hour. The share of jobs that outrun a lease of L seconds is modelled as exp(-L ÷ 2.5); one job in a thousand is poison.",
    "Finished rows: kept, they add about 52 GB a month; deleted one by one, about 4 GB of dead tuples; daily partitions about 0.2 GB. The claim query takes 2 ms plus 0.4 ms per GB. Round figures, not benchmarks.",
  ],
  sources: [PG_LOCK, PG_VACUUM, PG_PART, SQS_VIS, SQS_DLQ],
  verify: [
    { id: "stuck", claim: "With no lease, a crash twice an hour leaves 48 jobs a day stuck", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { lease: 0 }, metric: "stuckPerDay" }, expect: { min: 48, max: 48 } },
    { id: "pinned", claim: "Unlimited retries burn all the worker capacity", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { attempts: 0 }, metric: "wastedCapacity" }, expect: { min: 0.99 } },
    { id: "dup-short", claim: "A 2 s lease on 2 s jobs runs about 45% of them twice", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { lease: 2 }, metric: "duplicateShare" }, expect: { min: 0.43, max: 0.47 } },
    { id: "dup-ok", claim: "A 15 s lease runs under 1% twice", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { lease: 15 }, metric: "duplicateShare" }, expect: { max: 0.01 } },
    { id: "capped", claim: "Five delayed attempts burn about 5% of capacity", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { attempts: 5, backoff: true }, metric: "wastedCapacity" }, expect: { min: 0.049, max: 0.051 } },
    { id: "nobackoff", claim: "Five attempts with no backoff burn about 15%", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { attempts: 5, backoff: false }, metric: "wastedCapacity" }, expect: { min: 0.14, max: 0.16 } },
    { id: "dead", claim: "720 poison jobs an hour reach the dead-letter table", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { attempts: 5 }, metric: "deadLettersPerHour" }, expect: { min: 720, max: 720 } },
    { id: "keep", claim: "Keeping finished rows slows the claim query past 20 ms", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { rows: "keep" }, metric: "claimMs" }, expect: { min: 20 } },
    { id: "part", claim: "Daily partitions keep the table near 0.2 GB", run: "lab", params: { model: "pgq-prod-lab", config: PQP, values: { rows: "partition" }, metric: "tableGB" }, expect: { min: 0.19, max: 0.21 } },
  ],
});
