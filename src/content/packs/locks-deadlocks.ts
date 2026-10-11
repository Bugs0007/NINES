import { definePack } from "../define";

export const LD = { start: { strategy: "limit", n: 5 } };
export const LD_CHALLENGE = { lockN: true, n: 5, start: { strategy: "naive" } };

const DINING = { id: "dining-philosophers", title: "Dijkstra's dining philosophers problem (deadlock, ordering and resource hierarchy)", url: "https://en.wikipedia.org/wiki/Dining_philosophers_problem" };
const COFFMAN = { id: "coffman", title: "Coffman et al. (1971), System deadlocks: the four conditions for deadlock", url: "https://en.wikipedia.org/wiki/Deadlock_(computer_science)" };
const PG_DEADLOCK = { id: "pg-deadlocks", title: "PostgreSQL docs: Deadlocks (lock ordering and automatic detection)", url: "https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS" };

export default definePack({
  id: "locks-deadlocks",
  title: "Locks & Deadlocks",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "orders-api · 0 requests served for 9 minutes, CPU idle", detail: "all 32 workers blocked on a lock; thread dump shows a cycle" },
    lines: [
      { speaker: "kabir", line: "The service stopped answering and used no CPU at all. Every worker was waiting for a lock that another worker held, in a circle." },
      { speaker: "meera", line: "A deadlock is a cycle of waiting: nobody is slow, nobody can move. Break one link of the cycle and it cannot form." },
    ],
  },
  predictions: [
    {
      id: "deadlock",
      kind: "choice",
      prompt: "Five philosophers each pick up their left fork, then their right. A philosopher holds one fork and waits for the other about 20% of the time, 100 rounds a second. How often will the table deadlock?",
      options: [
        { id: "never", label: "Practically never, it needs everyone to hold a left fork at once" },
        { id: "115", label: "About 115 times an hour" },
        { id: "1", label: "Once a day" },
      ],
      answer: "115",
      observe: "deadlock",
      reveal: {
        text: "All five must be between picks at the same moment: 0.2⁵ is 0.032% per round, and at 100 rounds a second that is 360,000 rounds an hour, so about 115 deadlocks. A rare race at one round is a regular failure at production volume. This is why locking bugs surface under load, not in testing.",
        derived: true,
        line: { speaker: "rao", line: "Rare per attempt is routine per hour." },
      },
    },
    {
      id: "global",
      kind: "choice",
      prompt: "To be safe, you put one lock around the whole table so only one philosopher eats at a time. With five philosophers, two could eat at once. What share of the ideal throughput remains?",
      options: [
        { id: "100", label: "All of it, it is safe" },
        { id: "50", label: "Half: one eater instead of two" },
        { id: "10", label: "A tenth" },
      ],
      answer: "50",
      observe: "serial",
      reveal: {
        text: "Five forks allow at most two philosophers to eat together (each needs two). One big lock lets only one eat: 50% of the ideal. The lock removes deadlock and also removes the parallelism you wanted. A finer scheme, such as lock ordering or limiting the number at the table to four, keeps 90–95% and no cycle.",
        derived: true,
        line: { speaker: "meera", line: "A coarse lock is a deadlock fix that costs you the concurrency." },
      },
    },
  ],
  widget: { id: "dining-lab", config: LD },
  mechanism: [
    {
      id: "cycle",
      text: "A deadlock needs four things at once: resources that cannot be shared, a thread holding one while waiting for another, no way to take a resource back, and a cycle of waiting. Every thread in the cycle holds what the next one wants. Nothing is running, so CPU stays idle, and without outside help it never ends.",
      sourceIds: ["coffman"],
    },
    {
      id: "order",
      scene: "ordered",
      text: "The standard fix is a global order. Give every lock a rank, and always acquire in increasing rank. A cycle would need someone to take a lower lock after a higher one, which the rule forbids. Databases do the same: updating rows in a consistent order, such as by primary key, avoids deadlocks between transactions.",
      sourceIds: ["dining-philosophers", "pg-deadlocks"],
    },
    {
      id: "limit",
      scene: "limit",
      text: "Other fixes break a different condition. Admit at most N − 1 of N contenders at a time so at least one can always finish. Use try-lock with a timeout, release what you hold when it fails and retry after a random delay; this costs throughput. A single coarse lock removes the problem and the parallelism.",
      sourceIds: ["dining-philosophers", "coffman"],
    },
    {
      id: "detect",
      text: "Databases detect deadlocks by finding cycles in the wait graph and aborting one transaction, so the application must be ready to retry. In your own code, hold locks briefly, avoid calling unknown code while holding one, take them in a documented order, and set timeouts. A thread dump showing threads waiting for each other's locks is the signature.",
      sourceIds: ["pg-deadlocks", "coffman"],
    },
  ],
  challenges: [
    {
      id: "order-locks",
      title: "Order the locks",
      brief: "Five philosophers: at most 0.01 deadlocks an hour, at least 80% of the ideal throughput, and no more than 5% risk of starvation.",
      line: { speaker: "rao", line: "No stalls, and keep the table busy." },
      widget: { id: "dining-lab", config: LD_CHALLENGE },
      conditions: [
        { metric: "deadlocksPerHour", op: "<=", value: 0.01, label: "At most 0.01 deadlocks an hour" },
        { metric: "throughput", op: ">=", value: 0.8, label: "At least 80% of ideal throughput" },
        { metric: "starvation", op: "<=", value: 0.05, label: "At most 5% starvation risk" },
      ],
      stars: [],
      hints: ["Which strategies have no deadlock at all?", "Which one wastes a third of the throughput?", "Which gives some philosophers a worse deal?"],
    },
  ],
  explainBack: {
    prompt: "Explain deadlocks and how to prevent them.",
    rubric: [
      { id: "cycle", criterion: "A deadlock is a cycle of threads each holding a lock another needs; nothing runs and CPU is idle", keyIdea: "a cycle of waiting" },
      { id: "fixes", criterion: "Break the cycle with a global lock order, by admitting at most N−1 contenders, or by try-locks with timeouts and backoff", keyIdea: "order, limit or time out" },
      { id: "cost", criterion: "A single coarse lock avoids deadlock but removes concurrency; databases detect cycles and abort one transaction, so retries are needed", keyIdea: "coarse locks cost parallelism" },
    ],
    exemplar:
      "A deadlock is a cycle of threads each holding a lock that another needs, so nothing runs and CPU sits idle. I would break the cycle with a global lock order, by admitting at most N minus one contenders, or with try-locks, timeouts and backoff. A single coarse lock avoids deadlock but removes the concurrency, and databases detect cycles and abort one transaction, so callers must retry.",
  },
  reviews: [
    {
      id: "ld-est",
      format: "estimate",
      scenario: "Five philosophers each hold one fork 20% of the time. What is the chance that all five do at the same moment, as a percentage?",
      unit: "%",
      answer: 0.032,
      acceptFactor: 1.1,
      breakdown: ["0.2⁵ = 0.00032", "0.032% per round"],
      explain: "The chance is small per round and large over thousands of rounds.",
    },
    {
      id: "ld-pick",
      format: "pick-fix",
      scenario: "Two services update the same two database rows in opposite order and deadlock about once a day. What is the best fix?",
      options: [
        { id: "a", label: "Make both update the rows in the same order, for example by primary key, and retry on a deadlock error" },
        { id: "b", label: "Use a longer lock timeout" },
        { id: "c", label: "Run the services on separate days" },
        { id: "d", label: "Turn off transactions" },
      ],
      answer: "a",
      explain: "A consistent order removes the cycle. The retry handles the rare case the database still resolves by aborting one transaction.",
    },
    {
      id: "ld-order",
      format: "order",
      scenario: "Order these strategies by throughput for five philosophers, highest first.",
      items: [
        { id: "limit", label: "At most 4 at the table (semaphore)" },
        { id: "ordered", label: "Lower-numbered fork first" },
        { id: "timeout", label: "Try, put back on timeout" },
        { id: "global", label: "One lock for the table" },
      ],
      answer: ["limit", "ordered", "timeout", "global"],
      explain: "95%, 90%, 70% and 50%.",
    },
    {
      id: "ld-graph",
      format: "predict-graph",
      scenario: "With the naive left-then-right strategy, as the number of philosophers rises from 2 to 12, how does the chance of deadlock per round change?",
      xLabel: "philosophers →",
      yLabel: "deadlocks an hour",
      options: [
        { id: "fall", label: "Falls steeply, since all must hold a fork at once", points: [14400, 2880, 576, 115, 23, 4.6, 0.92, 0.04] },
        { id: "rise", label: "Rises with more philosophers", points: [1, 10, 100, 1000, 10000, 100000, 1e6, 1e7] },
        { id: "flat", label: "Stays the same", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "fall",
      explain: "More contenders mean a larger set must all be in the dangerous state together: 0.2^N falls fast. A small cycle is the dangerous one.",
    },
    {
      id: "ld-flaw",
      format: "spot-flaw",
      scenario: "Transfer(A, B) locks account A, then account B. Transfer(B, A) is called at the same time. Tap the problem.",
      diagram: {
        nodes: [
          { id: "t1", label: "transfer A to B: lock A, then B", kind: "worker", col: 0, row: 0 },
          { id: "t2", label: "transfer B to A: lock B, then A", kind: "worker", col: 0, row: 2 },
          { id: "locks", label: "locks on A and B", kind: "store", col: 1, row: 1 },
        ],
        edges: [
          { from: "t1", to: "locks" },
          { from: "t2", to: "locks" },
        ],
      },
      answer: "t2->locks",
      explain: "The order of locking depends on the arguments, so two transfers can each hold one lock and wait for the other. Always lock the lower account ID first.",
    },
    {
      id: "ld-explain",
      format: "explain",
      scenario: "In two sentences: why does a global lock order prevent deadlock?",
      rubric: [
        { id: "cycle", criterion: "A deadlock needs a cycle of waiting, where the last thread waits for a lock held by the first" },
        { id: "order", criterion: "With a fixed order every thread waits only on a higher-ranked lock, so the waits point one way and cannot form a cycle" },
      ],
      exemplar: "A deadlock needs a cycle of waiting, where the last thread waits for a lock held by the first. With a fixed order every thread waits only on a higher-ranked lock, so the waits all point one way and cannot form a cycle.",
      explain: "No cycle, no deadlock.",
    },
  ],
  codex: {
    oneLiner: "A deadlock is a cycle of waiting. Prevent it with a global lock order, admission limits or timeouts, and retry when a database aborts you.",
    keyNumbers: [
      { label: "Naive 5 philosophers at 100 rounds a second (lab)", value: "about 115 deadlocks an hour", sourceId: "dining-philosophers" },
      { label: "Global lock for 5 philosophers (lab)", value: "50% of ideal", sourceId: "dining-philosophers" },
    ],
    tradeoffs: [
      { choice: "Lock ordering", gain: "No deadlock, little cost", cost: "Needs a discipline and sometimes unfairness" },
      { choice: "Timeouts and retries", gain: "Recover from anything", cost: "Wasted work; livelock risk" },
      { choice: "Coarse lock", gain: "Simple and safe", cost: "No parallelism" },
    ],
    seenIn: ["Postgres 'deadlock detected' errors.", "Java thread dumps showing 'waiting to lock' cycles."],
    interviewAngle: "Say: 'four conditions; break the cycle with a global lock order; N−1 admission or timeouts as alternatives; databases detect and abort, so retry'.",
    aws: [{ concept: "Transaction retries", service: "Aurora and RDS deadlock handling; DynamoDB transactions" }],
    replay: { id: "dining-lab", config: LD, scene: "ordered" },
  },
  interview: [
    "What is a deadlock and what are the conditions for one?",
    "How would you prevent deadlocks in code that takes several locks?",
    "How does a database deal with deadlocks?",
  ],
  deeper: [
    {
      title: "Livelock and starvation",
      body: "A system can be busy and make no progress: threads that keep backing off and retrying in step (livelock), or a thread that is never chosen (starvation). Random delays break the first. Fair queues and ageing break the second. Lock ordering prevents deadlock and can still starve the thread that always needs the contended lock last.",
      sourceIds: ["coffman"],
    },
  ],
  honestPhysics: [
    "Philosophers each pick their left fork, then their right, and spend about 20% of each cycle holding one and waiting for the other. All N must be in that state at once to deadlock: 0.2^N per round, at 100 rounds a second, 360,000 rounds an hour.",
    "Throughput is relative to the ideal of N ÷ 2 philosophers eating at once: lock ordering 90% (starvation risk 10%), try and put back on timeout 70%, at most N − 1 at the table 95%, one lock for the whole table 1 ÷ (N ÷ 2). Round figures.",
  ],
  sources: [DINING, COFFMAN, PG_DEADLOCK],
  verify: [
    { id: "naive", claim: "The naive table deadlocks about 115 times an hour", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: {}, metric: "deadlocksPerHour" }, expect: { min: 114, max: 116 } },
    { id: "ordered", claim: "Lock ordering never deadlocks and keeps 90%", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "ordered" }, metric: "throughput" }, expect: { min: 0.89, max: 0.91 } },
    { id: "ordered-starve", claim: "…at a 10% starvation risk", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "ordered" }, metric: "starvation" }, expect: { min: 0.09, max: 0.11 } },
    { id: "limit", claim: "Admitting four at a time keeps 95% with 2% starvation", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "limit" }, metric: "starvation" }, expect: { min: 0.01, max: 0.03 } },
    { id: "global", claim: "One lock keeps 50% of the ideal", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "global" }, metric: "throughput" }, expect: { min: 0.49, max: 0.51 } },
    { id: "timeout", claim: "Timeouts keep 70%", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "timeout" }, metric: "throughput" }, expect: { min: 0.69, max: 0.71 } },
    { id: "seven", claim: "Seven naive philosophers deadlock far less often", run: "lab", params: { model: "dining-lab", config: LD_CHALLENGE, values: { strategy: "naive", n: 7 }, metric: "deadlocksPerHour" }, expect: { max: 6 } },
  ],
});
