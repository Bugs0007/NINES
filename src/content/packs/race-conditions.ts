import { definePack } from "../define";

export const RC = { start: { fix: "atomic", threads: 8 } };
export const RC_CHALLENGE = { lockThreads: true, threads: 8, start: { fix: "none" } };

const GO_MEM = { id: "go-memory-model", title: "The Go Memory Model (data races and synchronisation)", url: "https://go.dev/ref/mem" };
const CPP_ATOMIC = { id: "cpp-atomic", title: "cppreference: std::atomic (atomic read-modify-write operations)", url: "https://en.cppreference.com/w/cpp/atomic/atomic" };
const PY_LOCK = { id: "py-lock", title: "Python docs: threading Lock objects", url: "https://docs.python.org/3/library/threading.html#lock-objects" };
const PG_CONCURRENCY = { id: "pg-lost-update", title: "PostgreSQL docs: Transaction isolation (lost updates and serialisation failures)", url: "https://www.postgresql.org/docs/current/transaction-iso.html" };

export default definePack({
  id: "race-conditions",
  title: "Race Conditions",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "metrics · page views today: 8,412,907 (expected 12,000,000)", detail: "counter updated from 8 worker threads" },
    lines: [
      { speaker: "kabir", line: "The page view counter is a third lower than the load balancer logs, and it is wrong by a different amount every time we restart." },
      { speaker: "meera", line: "Adding one is three steps, and another thread can step in between them. The answer depends on who gets the CPU, and that changes every run." },
    ],
  },
  predictions: [
    {
      id: "lost",
      kind: "choice",
      prompt: "Eight threads each do counter += 1 a million times with no protection. With the overlap in this lab, what share of the increments is lost?",
      options: [
        { id: "0", label: "None, += is a single operation" },
        { id: "5", label: "About 5%" },
        { id: "51", label: "About 51%" },
      ],
      answer: "51",
      observe: "lost-updates",
      reveal: {
        text: "counter += 1 is read, add, write. If two threads read the same value, both write value + 1, and one increment vanishes. More threads mean more overlap: 51% at 8 threads in this model. Real losses depend on timing, and the point is that the result is wrong and different each run.",
        derived: true,
        line: { speaker: "rao", line: "A bug that changes with timing is a race, not a typo." },
      },
    },
    {
      id: "mutex",
      kind: "choice",
      prompt: "You wrap the increment in a mutex. The total is now right. With 8 threads, how fast is it compared with one thread?",
      options: [
        { id: "8", label: "About 8× faster, the work is shared" },
        { id: "1", label: "About the same as one thread" },
        { id: "36", label: "About 36% of one thread: the threads queue on the lock" },
      ],
      answer: "36",
      observe: "slow-lock",
      reveal: {
        text: "A lock admits one thread at a time and the others wait, and each handoff costs something: 36% of one thread in the lab. An atomic add does the same read-modify-write in one hardware instruction: 64%. A counter per thread, summed at the end, shares nothing: 95%.",
        derived: true,
        line: { speaker: "meera", line: "Correct is the first requirement. Fast is the second, and it is a design question." },
      },
    },
  ],
  widget: { id: "race-lab", config: RC },
  mechanism: [
    {
      id: "race",
      text: "A race condition is a bug in which the outcome depends on the timing of operations in different threads or processes. The classic case is read-modify-write on shared data: two threads read a counter, each adds one and writes, and one update is lost. The same shape appears as check-then-act: check stock, then decrement, with another buyer in between.",
      sourceIds: ["go-memory-model", "py-lock"],
    },
    {
      id: "mutex",
      scene: "mutex",
      text: "A mutex makes a section of code exclusive: one thread at a time, the rest wait. It fixes the race and creates contention: the more threads and the longer the section, the more time they spend waiting for each other. Keep critical sections as short as possible, and lock the data you need, not more.",
      sourceIds: ["py-lock"],
    },
    {
      id: "atomic",
      scene: "atomic",
      text: "Atomic operations are single, indivisible read-modify-write instructions provided by the hardware: fetch-and-add, compare-and-swap. They need no lock, have less overhead and handle a single variable. They do not make a multi-step invariant safe, such as updating two fields that must stay consistent, which needs a lock or a transaction.",
      sourceIds: ["cpp-atomic"],
    },
    {
      id: "design",
      scene: "none",
      text: "The best fix is often to avoid sharing. Give each thread its own counter and add them up at the end, or send updates through a single owner, such as a queue consumed by one thread. In a database use atomic statements, such as UPDATE ... SET n = n + 1, instead of reading then writing from the application.",
      sourceIds: ["pg-lost-update", "go-memory-model"],
    },
  ],
  challenges: [
    {
      id: "fix-counter",
      title: "Fix the counter",
      brief: "With 8 threads, make the final count always correct and keep at least half the speed of a single thread.",
      line: { speaker: "rao", line: "Right first, and not much slower than one thread." },
      widget: { id: "race-lab", config: RC_CHALLENGE },
      conditions: [
        { metric: "correct", op: ">=", value: 1, label: "Final count always correct" },
        { metric: "relativeSpeed", op: ">=", value: 0.5, label: "At least half the single-thread speed" },
      ],
      stars: [{ metric: "relativeSpeed", op: ">=", value: 0.9, label: "At least 90% of single-thread speed" }],
      hints: ["What does no protection lose?", "What does a mutex cost at 8 threads?", "What if the threads shared nothing?"],
    },
  ],
  explainBack: {
    prompt: "Explain what a race condition is and how to fix one.",
    rubric: [
      { id: "what", criterion: "The outcome depends on the interleaving of operations; read-modify-write on shared data can lose updates", keyIdea: "timing-dependent outcome" },
      { id: "fixes", criterion: "Mutexes make the section exclusive at the cost of contention; atomic operations do a single update cheaply; neither covers a multi-step invariant", keyIdea: "mutex and atomic" },
      { id: "design", criterion: "Better to avoid sharing: per-thread state merged later, a single owner, or atomic database statements", keyIdea: "avoid sharing" },
    ],
    exemplar:
      "A race condition is a bug where the outcome depends on how operations from different threads interleave, such as a read-modify-write on shared data losing updates. A mutex makes the section exclusive at the cost of contention, and an atomic operation does a single update cheaply but cannot protect a multi-step invariant. The best fix is often to avoid sharing, with per-thread state merged later, a single owner, or an atomic statement in the database.",
  },
  reviews: [
    {
      id: "rc-est",
      format: "estimate",
      scenario: "With a mutex, speed relative to one thread is 1 ÷ (1 + 0.25 × (threads − 1)). What is it at 5 threads?",
      unit: "× one thread",
      answer: 0.5,
      acceptFactor: 1.05,
      breakdown: ["1 ÷ (1 + 0.25 × 4) = 1 ÷ 2 = 0.5"],
      explain: "Five threads behind one lock do half the work of one thread alone in this model.",
    },
    {
      id: "rc-pick",
      format: "pick-fix",
      scenario: "An online shop reads an item's stock, checks it is above zero, then writes stock − 1, and sometimes oversells. What is the most robust fix?",
      options: [
        { id: "a", label: "Do it in one atomic database statement: UPDATE ... SET stock = stock − 1 WHERE stock > 0" },
        { id: "b", label: "Add a short sleep between the read and the write" },
        { id: "c", label: "Run the shop on a bigger server" },
        { id: "d", label: "Check twice" },
      ],
      answer: "a",
      explain: "The check and the update become one operation the database makes indivisible. Sleeping or checking twice only narrows the window.",
    },
    {
      id: "rc-order",
      format: "order",
      scenario: "Order these protections by speed at 8 threads relative to one, fastest first.",
      items: [
        { id: "shard", label: "A counter per thread" },
        { id: "atomic", label: "An atomic add" },
        { id: "mutex", label: "A mutex" },
      ],
      answer: ["shard", "atomic", "mutex"],
      explain: "95%, 64% and 36%.",
    },
    {
      id: "rc-graph",
      format: "predict-graph",
      scenario: "With no protection, as the threads rise from 1 to 32, how does the share of lost increments change?",
      xLabel: "threads →",
      yLabel: "increments lost",
      options: [
        { id: "rise", label: "Rises and levels off toward the top", points: [0, 13, 23, 34, 43, 51, 63, 82] },
        { id: "flat", label: "Stays at zero", points: [0, 0, 0, 0, 0, 0, 0, 0] },
        { id: "const", label: "Is a constant 50%", points: [50, 50, 50, 50, 50, 50, 50, 50] },
      ],
      answer: "rise",
      explain: "One thread has no race. More threads mean more overlap, so more updates collide.",
    },
    {
      id: "rc-flaw",
      format: "spot-flaw",
      scenario: "A web handler reads a user's balance from the database, adds a credit in the application, and writes it back. Two requests arrive at once. Tap the unsafe step.",
      diagram: {
        nodes: [
          { id: "r1", label: "request 1 reads balance 100", kind: "client", col: 0, row: 0 },
          { id: "r2", label: "request 2 reads balance 100", kind: "client", col: 0, row: 2 },
          { id: "db", label: "write balance back as 110", kind: "db", col: 1, row: 1 },
        ],
        edges: [
          { from: "r1", to: "db" },
          { from: "r2", to: "db" },
        ],
      },
      answer: "r2->db",
      explain: "Both compute from the old value and the second write overwrites the first. Use an atomic increment in SQL, row locking with SELECT FOR UPDATE, or optimistic versioning.",
    },
    {
      id: "rc-explain",
      format: "explain",
      scenario: "In two sentences: why is a race condition so hard to debug?",
      rubric: [
        { id: "timing", criterion: "It depends on the exact timing of threads, so it appears rarely, disappears when you add logging or a debugger, and differs between runs" },
        { id: "symptom", criterion: "The symptom is a wrong result far from the cause, with no error raised at the point where two threads collided" },
      ],
      exemplar: "It depends on the exact timing of threads, so it appears rarely, disappears when you add logging or a debugger, and differs between runs. The symptom is a wrong result far from the cause, with no error raised where the two threads collided.",
      explain: "Reason about the possible interleavings, not the one you saw.",
    },
  ],
  codex: {
    oneLiner: "A race is an outcome that depends on thread timing. Fix it with a mutex or atomic operation; better, avoid sharing.",
    keyNumbers: [
      { label: "Increments lost, 8 threads, no protection (lab)", value: "51%", sourceId: "go-memory-model" },
      { label: "Mutex speed at 8 threads vs one (lab)", value: "36%", sourceId: "py-lock" },
    ],
    tradeoffs: [
      { choice: "Mutex", gain: "Protects any section", cost: "Contention; deadlock risk" },
      { choice: "Atomic operation", gain: "Fast for one variable", cost: "Cannot guard multi-step invariants" },
      { choice: "Per-thread state", gain: "No sharing, fastest", cost: "Needs a merge step" },
    ],
    seenIn: ["Counters, caches and inventory in any concurrent service.", "Go's race detector and ThreadSanitizer."],
    interviewAngle: "Say: 'read-modify-write loses updates; mutex or atomic, but prefer to avoid sharing; in a database use atomic statements or the right isolation'.",
    aws: [{ concept: "Atomic counters", service: "DynamoDB atomic counters; Redis INCR" }],
    replay: { id: "race-lab", config: RC, scene: "mutex" },
  },
  interview: [
    "What is a race condition? Give an example.",
    "How do you make a counter thread-safe?",
    "How do you prevent overselling inventory?",
  ],
  deeper: [
    {
      title: "Detecting races",
      body: "Tools help: ThreadSanitizer and Go's -race flag instrument memory accesses and report conflicting ones, and stress tests with many threads and random delays make a rare interleaving common. A clean run does not prove there is no race, only that the tested interleavings were fine. Design reviews that ask 'what is shared and who writes it' find most of them first.",
      sourceIds: ["go-memory-model"],
    },
  ],
  honestPhysics: [
    "Several threads each add 1 to a shared counter a million times. The share of increments lost with no protection is 1 − 1 ÷ (1 + 0.15 × (threads − 1)), 51% at 8 threads. Speed relative to one thread: a mutex 1 ÷ (1 + 0.25 × (threads − 1)), an atomic add 1 ÷ (1 + 0.08 × (threads − 1)), a counter per thread 95%.",
    "Round figures for the shape of the trade-off; real contention depends on the hardware and the length of the critical section.",
  ],
  sources: [GO_MEM, CPP_ATOMIC, PY_LOCK, PG_CONCURRENCY],
  verify: [
    { id: "lost", claim: "8 unprotected threads lose 51% of increments", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "none" }, metric: "lostUpdates" }, expect: { min: 0.5, max: 0.52 } },
    { id: "mutex", claim: "A mutex at 8 threads runs at 36%", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "mutex" }, metric: "relativeSpeed" }, expect: { min: 0.36, max: 0.37 } },
    { id: "atomic", claim: "An atomic add runs at 64%", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "atomic" }, metric: "relativeSpeed" }, expect: { min: 0.64, max: 0.65 } },
    { id: "atomic-ok", claim: "…and is correct", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "atomic" }, metric: "correct" }, expect: { min: 1 } },
    { id: "shard", claim: "Per-thread counters run at 95%", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "sharded" }, metric: "relativeSpeed" }, expect: { min: 0.94, max: 0.96 } },
    { id: "two", claim: "With two threads a mutex still runs at 80%", run: "lab", params: { model: "race-lab", config: RC_CHALLENGE, values: { fix: "mutex", threads: 2 }, metric: "relativeSpeed" }, expect: { min: 0.79, max: 0.81 } },
  ],
});
