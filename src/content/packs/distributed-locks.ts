import { definePack } from "../define";

export const LOCK = { start: { ttl: 60, fencing: false } };

const KLEPPMANN = { id: "kleppmann-fencing", title: "M. Kleppmann (2016), How to do distributed locking (fencing tokens)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html" };
const CHUBBY = { id: "chubby-2006", title: "M. Burrows (2006), The Chubby Lock Service for Loosely-Coupled Distributed Systems, OSDI", url: "https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/" };
const ANTIREZ = { id: "antirez-redlock", title: "S. Sanfilippo (antirez): Is Redlock safe? (reply to Kleppmann)", url: "http://antirez.com/news/101" };

export default definePack({
  id: "distributed-locks",
  title: "Distributed Locks & Fencing Tokens",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "billing · invoice 88213 written twice", detail: "second write overwrote a newer one" },
    lines: [
      { speaker: "kabir", line: "Only one worker is allowed to update an invoice, guarded by a lock. Yet two did, and the older write landed last." },
      { speaker: "meera", line: "The first worker paused after taking the lock. The lock expired, the second took over, and then the first woke up and carried on as if nothing had happened." },
    ],
  },
  predictions: [
    {
      id: "pause",
      kind: "choice",
      prompt: "A million lock-guarded writes a day, a 10-second lease, and workers that occasionally stall for seconds. About how many writes a day arrive after the lease expired and corrupt data without fencing?",
      options: [
        { id: "none", label: "None: the lease protects them" },
        { id: "six", label: "About 6" },
        { id: "six-hundred", label: "About 600" },
        { id: "sixty-thousand", label: "About 60,000" },
      ],
      answer: "six",
      observe: "pause-bites",
      reveal: {
        text: "Long stalls are rare but heavy-tailed. With the lab's assumed tail, about 6 of every million writes find their lease already gone. A rare event at a million operations a day is a daily corruption, and a longer lease only makes it rarer, never impossible.",
        derived: true,
        line: { speaker: "meera", line: "The worker cannot know it paused. It checks the lock, then acts, and the world changes in between." },
      },
    },
    {
      id: "fence",
      kind: "choice",
      prompt: "Each lock grant carries a rising token, and the database rejects writes with a token older than one it has seen. How many of those late writes now corrupt data?",
      options: [
        { id: "same", label: "Still about 6" },
        { id: "half", label: "About 3" },
        { id: "zero", label: "None: they are rejected" },
      ],
      answer: "zero",
      observe: "fenced",
      reveal: {
        text: "The late writer holds token 41, but the database has already accepted token 42 from the new holder, so it refuses the write. The pause still happens; it just stops mattering. The protection lives in the resource, not in the lock.",
        derived: true,
        line: { speaker: "kabir", line: "So the lock was never what kept the data safe." },
      },
    },
  ],
  widget: { id: "lock-lab", config: LOCK },
  mechanism: [
    {
      id: "lease",
      text: "A distributed lock is usually a lease: a lock with an expiry. If the holder crashes, the lease runs out and someone else can proceed. That keeps the system alive but means the holder can lose the lock without knowing, because expiry depends on time that the holder may have stalled through.",
      sourceIds: ["chubby-2006", "kleppmann-fencing"],
    },
    {
      id: "pause",
      scene: "pause",
      text: "A process can pause anywhere: a garbage collection, a virtual machine freeze, a slow disk, a page fault. If it pauses after checking its lock and before writing, the lease may expire in between, and the write lands when another worker already holds the lock.",
      sourceIds: ["kleppmann-fencing"],
    },
    {
      id: "fence",
      scene: "fence",
      text: "A fencing token fixes this. The lock service hands out a number that increases with every grant, and the holder sends it with each write. The storage layer remembers the highest token it has seen and rejects anything lower, so a stale holder is refused no matter how late it wakes up.",
      sourceIds: ["kleppmann-fencing", "chubby-2006"],
    },
    {
      id: "ttl",
      scene: "ttl",
      text: "Lease length trades safety against recovery. A longer lease makes stale writes rarer but means a crashed holder blocks everyone for that long. With fencing in place, a short lease becomes safe, so you can choose the length for fast recovery alone.",
      sourceIds: ["kleppmann-fencing", "antirez-redlock"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "lease-design",
      title: "Make the lock safe",
      brief: "A million guarded writes a day. Set the lease length and fencing so no write ever corrupts data, and a crashed holder blocks others for at most 15 seconds.",
      line: { speaker: "rao", line: "I will not pay for a lock service and then find out it was only advisory." },
      widget: { id: "lock-lab", config: { start: { ttl: 60, fencing: false } } },
      conditions: [
        { metric: "corruptPerDay", op: "<=", value: 0, label: "No corrupting writes" },
        { metric: "recoveryS", op: "<=", value: 15, label: "Others wait at most 15 s after a crash" },
      ],
      stars: [{ metric: "recoveryS", op: "<=", value: 5, label: "Others wait at most 5 s" }],
      hints: [
        "How long a lease would stop every late write?",
        "What happens to recovery time if you choose that?",
        "Can the storage layer refuse stale writers by itself?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why a distributed lock with a timeout is not enough to protect a resource, and what fixes it.",
    rubric: [
      { id: "pause", criterion: "A holder can pause after acquiring and checking the lock, so the lease can expire before its write lands", keyIdea: "pauses break leases" },
      { id: "fence", criterion: "A fencing token that increases with each grant is checked by the resource, which rejects older tokens", keyIdea: "fencing token" },
      { id: "ttl", criterion: "With fencing the lease can be short for fast recovery; without it a longer lease only reduces the risk", keyIdea: "lease length trade-off" },
    ],
    exemplar:
      "A lock holder can pause between checking its lock and writing, for example in a long garbage collection, and by the time it wakes the lease has expired and another worker holds the lock. So the lock alone cannot protect the resource. Each lock grant should carry an increasing fencing token, which the storage checks, rejecting writes with an older token. With fencing, I can use a short lease for fast recovery.",
  },
  reviews: [
    {
      id: "dl-est",
      format: "estimate",
      scenario: "In the lab, the share of writes stalling longer than x seconds is 2 × 10⁻⁴ × x^−1.5. With 1 million writes a day and a 4-second lease, about how many writes a day outlive the lease? (x^−1.5 for 4 is 1 ÷ 8)",
      unit: "writes",
      answer: 25,
      acceptFactor: 1.1,
      breakdown: ["2 × 10⁻⁴ × 1/8 = 2.5 × 10⁻⁵", "× 1,000,000", "= 25"],
      explain: "Shorter leases are easy to outlast. Without fencing each of these is a potential corruption.",
    },
    {
      id: "dl-pick",
      format: "pick-fix",
      scenario: "A cron job takes a Redis lock with a 30-second timeout and rewrites a file in object storage. Occasionally two runs overlap and corrupt the file. What do you add?",
      options: [
        { id: "a", label: "A fencing token checked by the storage write (for example a conditional write on a version)" },
        { id: "b", label: "A longer timeout" },
        { id: "c", label: "A second Redis" },
        { id: "d", label: "Sleep before each write" },
      ],
      answer: "a",
      explain: "A longer timeout only makes overlap rarer. A conditional write on a version number lets the storage itself refuse a stale writer.",
    },
    {
      id: "dl-order",
      format: "order",
      scenario: "Order these lease lengths by the number of writes a day that outlive them in the lab, most first.",
      items: [
        { id: "s1", label: "1 second" },
        { id: "s10", label: "10 seconds" },
        { id: "s100", label: "100 seconds" },
      ],
      answer: ["s1", "s10", "s100"],
      explain: "The tail falls with the lease length to the power 1.5, so each tenfold increase cuts the count by about 30 times, and it never reaches zero.",
    },
    {
      id: "dl-graph",
      format: "predict-graph",
      scenario: "Without fencing, as the lease grows from 1 to 120 seconds, how do corrupting writes per day change?",
      xLabel: "lease length →",
      yLabel: "corrupting writes a day",
      options: [
        { id: "fall", label: "Fall steeply, but never reach zero", points: [200, 70, 18, 6, 1.2, 0.43, 0.2, 0.15] },
        { id: "zero", label: "Reach zero at some length", points: [200, 100, 40, 10, 1, 0, 0, 0] },
        { id: "flat", label: "Stay the same", points: [50, 50, 50, 50, 50, 50, 50, 50] },
      ],
      answer: "fall",
      explain: "Very long pauses are rare but possible, so any finite lease can be outlasted. Only a check at the resource closes the gap.",
    },
    {
      id: "dl-flaw",
      format: "spot-flaw",
      scenario: "A worker acquires a lock, checks 'am I still the holder?', which returns true, and then writes to the database. Occasionally a stale write lands. Tap the step that is unsafe.",
      diagram: {
        nodes: [
          { id: "check", label: "check lock: still mine", kind: "server", col: 0, row: 1 },
          { id: "pause", label: "pause (GC, VM stall)", kind: "queue", col: 1, row: 1 },
          { id: "write", label: "write to database", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "check", to: "pause" },
          { from: "pause", to: "write" },
        ],
      },
      answer: "pause->write",
      explain: "The check is true when made, but the world can change before the write lands. The write itself must carry a token the database can verify.",
    },
    {
      id: "dl-explain",
      format: "explain",
      scenario: "In two sentences: where does a fencing token get checked, and why there?",
      rubric: [
        { id: "where", criterion: "At the resource being protected, such as the database or storage, which rejects writes with an older token" },
        { id: "why", criterion: "Only the resource sees every write in order, whereas the worker cannot know whether it has paused or lost the lock" },
      ],
      exemplar: "The token is checked by the resource itself, the database or storage layer, which refuses writes with a token older than one it has seen. The worker cannot tell it has paused, but the resource sees every write and can enforce the order.",
      explain: "Enforce at the point of effect.",
    },
  ],
  codex: {
    oneLiner: "A lock lease can expire while its holder is paused. Send an increasing fencing token with each write and let the resource reject older ones.",
    keyNumbers: [
      { label: "Late writes a day, 10 s lease, 1 million writes (lab tail)", value: "about 6", sourceId: "kleppmann-fencing" },
      { label: "Time others wait after a holder crashes", value: "up to the lease length", sourceId: "chubby-2006" },
    ],
    tradeoffs: [
      { choice: "Long lease", gain: "Stale writes rarer", cost: "A crash blocks others for that long" },
      { choice: "Short lease with fencing", gain: "Fast recovery and safe", cost: "The resource must check tokens" },
      { choice: "Lock without fencing", gain: "Simple", cost: "Only efficient, not safe, for correctness" },
    ],
    seenIn: ["Chubby and ZooKeeper sequence numbers as tokens.", "Conditional writes with etags or versions."],
    interviewAngle: "Say: 'a lease can expire under a paused holder, so the resource checks a fencing token; without one, locks are only an optimisation'.",
    aws: [{ concept: "Conditional writes (version checks)", service: "DynamoDB / S3 conditional writes" }],
    replay: { id: "lock-lab", config: { start: { ttl: 10, fencing: true } }, scene: "fence" },
  },
  interview: [
    "Why can a distributed lock with a timeout be unsafe?",
    "What is a fencing token?",
    "When is a lock only an optimisation rather than a guarantee?",
  ],
  deeper: [
    {
      title: "Redlock and the argument over it",
      body: "Redis's Redlock algorithm takes a lock on a majority of independent Redis instances. Kleppmann argued it is not safe for correctness because it depends on timing assumptions and offers no fencing token; its author replied that the timing assumptions are acceptable in practice. The practical conclusion both sides agree on is to use locks as an optimisation unless the resource can verify a token.",
      sourceIds: ["kleppmann-fencing", "antirez-redlock"],
    },
  ],
  honestPhysics: [
    "A million lock-guarded writes a day. The share of writes stalling longer than x seconds is 2 × 10⁻⁴ × x^−1.5, a rounded heavy-tailed assumption in the spirit of observed pauses.",
    "A stall longer than the lease lets another worker take the lock; without fencing, the late write corrupts. After a crash, others wait out the lease.",
    "These are illustrative constants, not measurements.",
  ],
  sources: [KLEPPMANN, CHUBBY, ANTIREZ],
  verify: [
    { id: "ttl10", claim: "A 10-second lease with no fencing lets about 6 corrupting writes a day through", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 10, fencing: false }, metric: "corruptPerDay" }, expect: { min: 6, max: 6.6 } },
    { id: "ttl120", claim: "Even a 120-second lease does not reach zero", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 120, fencing: false }, metric: "corruptPerDay" }, expect: { min: 0.1 } },
    { id: "fenced", claim: "Fencing turns every corrupting write into a refused one", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 10, fencing: true }, metric: "corruptPerDay" }, expect: { max: 0 } },
    { id: "refused", claim: "…and about 6 writes a day are refused", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 10, fencing: true }, metric: "staleRejected" }, expect: { min: 6, max: 6.6 } },
    { id: "recover", claim: "A 5-second lease recovers in 5 seconds", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 5, fencing: true }, metric: "recoveryS" }, expect: { max: 5 } },
    { id: "long", claim: "A 60-second lease blocks others for a minute after a crash", run: "lab", params: { model: "lock-lab", config: LOCK, values: { ttl: 60, fencing: false }, metric: "recoveryS" }, expect: { min: 60 } },
  ],
});
