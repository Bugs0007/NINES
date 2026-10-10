import { definePack } from "../define";

export const CLK = { sigma: 5, start: { scheme: "hlc" } };
export const CLK_CHALLENGE = { lockSigma: true, sigma: 5 };

const LAMPORT = { id: "lamport-1978", title: "L. Lamport (1978), Time, Clocks, and the Ordering of Events in a Distributed System, CACM 21(7)", url: "https://lamport.azurewebsites.net/pubs/time-clocks.pdf" };
const SPANNER = { id: "spanner-2012", title: "J. Corbett et al. (2012), Spanner: Google's Globally-Distributed Database, OSDI (TrueTime)", url: "https://research.google/pubs/spanner-googles-globally-distributed-database-2/" };
const HLC = { id: "hlc-2014", title: "S. Kulkarni et al. (2014), Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases", url: "https://cse.buffalo.edu/tech-reports/2014-04.pdf" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 8: Unreliable clocks; ch. 5: Detecting concurrent writes", url: "https://dataintensive.net/" };

export default definePack({
  id: "clocks-ordering",
  title: "Clocks & Ordering",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'my edit was undone'", detail: "the older version won the merge" },
    lines: [
      { speaker: "kabir", line: "A user fixes a typo, a teammate edits the same field a moment later, and the typo comes back. The logs say the teammate's edit came first." },
      { speaker: "meera", line: "Two servers' clocks disagreed by a few milliseconds, and the later write got the earlier timestamp. A clock is a guess about the time." },
    ],
  },
  predictions: [
    {
      id: "wrong",
      kind: "choice",
      prompt: "Two nodes' clocks differ by about 5 ms (standard deviation). A write on node A is followed, on average 100 ms later, by a dependent write on node B. Last-writer-wins by timestamp. How often does the wrong write win?",
      options: [
        { id: "never", label: "Almost never, under 0.01%" },
        { id: "rare", label: "About 0.3%" },
        { id: "few", label: "About 2.7%" },
        { id: "many", label: "About 25%" },
      ],
      answer: "few",
      observe: "skewed",
      reveal: {
        text: "The two writes are about 100 ms apart on average, but some pairs are only a few milliseconds apart, and then clock error decides the order. Integrating the chance across the gaps gives 2.7%, which is thousands of lost edits a day at modest volume.",
        derived: true,
        line: { speaker: "meera", line: "Most pairs are fine. The few that are not are exactly the busy, contended ones." },
      },
    },
    {
      id: "vector",
      kind: "choice",
      prompt: "Version vectors notice when two writes are concurrent and keep both. What do you pay compared with an 8-byte timestamp, with 12 nodes?",
      options: [
        { id: "nothing", label: "Nothing" },
        { id: "bytes", label: "Metadata that grows with the number of nodes: 96 bytes per write instead of 8" },
        { id: "wait", label: "A commit wait of tens of milliseconds" },
      ],
      answer: "bytes",
      observe: "vector-on",
      reveal: {
        text: "A version vector holds one counter per node that has written, so it grows with the cluster: 12 nodes at 8 bytes each is 96 bytes. In return, no concurrent write is silently dropped. The application or user gets both versions to merge.",
        derived: true,
        line: { speaker: "rao", line: "Ninety-six bytes is nothing next to a lost customer edit." },
      },
    },
  ],
  widget: { id: "clock-lab", config: CLK },
  mechanism: [
    {
      id: "time",
      scene: "physical",
      text: "Computers' clocks drift, and synchronisation protocols only bring them within milliseconds, sometimes much worse. If two nodes order writes by their own timestamps, a node whose clock runs fast wins arguments it should lose, and a write can seem to precede the one that caused it.",
      sourceIds: ["ddia"],
    },
    {
      id: "lamport",
      scene: "logical",
      text: "A Lamport clock replaces time with a counter. Each node increments it on every event and, on receiving a message, sets its counter above the sender's. If A happened before B, A's number is smaller, and no wall clock is involved. A hybrid logical clock does the same while staying close to real time.",
      sourceIds: ["lamport-1978", "hlc-2014"],
    },
    {
      id: "truetime",
      scene: "truetime",
      text: "Google's Spanner uses clocks with a known error bound: a time reported as an interval, in which the true time must lie. A transaction waits out the uncertainty before committing, so its timestamp is in the past by the time anyone sees it. Order is right, and every commit pays the wait.",
      sourceIds: ["spanner-2012"],
    },
    {
      id: "concurrent",
      text: "No clock can tell you which of two truly concurrent writes is right, because neither knew about the other. Last-writer-wins just picks one and drops the other. A version vector spots the concurrency and keeps both, leaving the merge to the application.",
      sourceIds: ["ddia", "lamport-1978"],
    },
  ],
  challenges: [
    {
      id: "ordering",
      title: "Order the edits",
      brief: "Clocks differ by about 5 ms. Choose an ordering scheme so at most 0.1% of dependent writes are ordered wrongly, no concurrent write is lost silently, commits wait at most 15 ms, and metadata is at most 128 bytes per write.",
      line: { speaker: "kabir", line: "If two people edit the same field at once I want to know, not to have one of them quietly lose." },
      widget: { id: "clock-lab", config: CLK_CHALLENGE },
      conditions: [
        { metric: "wrongOrderPct", op: "<=", value: 0.001, label: "At most 0.1% of dependent writes misordered" },
        { metric: "silentLossPerDay", op: "<=", value: 0, label: "No concurrent write lost silently" },
        { metric: "commitWaitMs", op: "<=", value: 15, label: "Commit wait at most 15 ms" },
        { metric: "metaBytes", op: "<=", value: 128, label: "At most 128 bytes of metadata" },
      ],
      stars: [],
      hints: [
        "Which schemes get dependent writes in the right order without trusting wall clocks?",
        "Which of those still pick a silent winner for concurrent writes?",
        "What is left?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why wall-clock timestamps are unsafe for ordering writes, and what to use instead.",
    rubric: [
      { id: "skew", criterion: "Clocks on different machines disagree, so a later write can get an earlier timestamp and lose", keyIdea: "clock skew" },
      { id: "logical", criterion: "Logical or hybrid clocks order by causality without depending on synchronised time", keyIdea: "logical clocks" },
      { id: "concurrent", criterion: "Concurrent writes need a version vector or merge rule, since last-writer-wins silently drops one", keyIdea: "detect concurrency" },
    ],
    exemplar:
      "Machine clocks disagree by milliseconds or more, so a write that really came later can carry an earlier timestamp and be overwritten. Logical clocks such as Lamport counters or hybrid logical clocks order events by causality instead of by synchronised time. For truly concurrent writes, last-writer-wins silently drops one, so I would use version vectors to detect the conflict and keep both for a merge.",
  },
  reviews: [
    {
      id: "co-est",
      format: "estimate",
      scenario: "A database uses a bounded-uncertainty clock with an error bound of ±7 ms. How long must a transaction wait at commit so its timestamp is certainly in the past? (twice the bound)",
      unit: "ms",
      answer: 14,
      acceptFactor: 1.05,
      breakdown: ["uncertainty interval = 2 × 7 ms", "wait out the whole interval", "= 14 ms"],
      explain: "The commit wait equals the width of the uncertainty window, which is why such systems invest in tight clocks.",
    },
    {
      id: "co-pick",
      format: "pick-fix",
      scenario: "A collaborative editor sometimes loses a user's edit when two people edit the same line at nearly the same time. Edits are ordered by server timestamps. What is the right change?",
      options: [
        { id: "a", label: "Detect concurrent edits with version vectors and merge them, rather than letting one win" },
        { id: "b", label: "Buy more precise clocks" },
        { id: "c", label: "Add a second timestamp field" },
        { id: "d", label: "Shorten the sync interval" },
      ],
      answer: "a",
      explain: "Truly concurrent edits have no right winner by time. Detect them and merge, or ask.",
    },
    {
      id: "co-order",
      format: "order",
      scenario: "Order these by the probability that a causally later write gets an earlier timestamp, highest first.",
      items: [
        { id: "skew50", label: "Wall clocks, 50 ms skew" },
        { id: "skew5", label: "Wall clocks, 5 ms skew" },
        { id: "hlc", label: "Hybrid logical clock" },
      ],
      answer: ["skew50", "skew5", "hlc"],
      explain: "More skew means more pairs where clock error exceeds the gap. A hybrid logical clock never orders a reaction before its cause.",
    },
    {
      id: "co-graph",
      format: "predict-graph",
      scenario: "With last-writer-wins by wall clock and dependent writes about 100 ms apart, how does the share of wrongly ordered pairs change as clock error grows from 0.5 ms to 100 ms?",
      xLabel: "clock error →",
      yLabel: "wrongly ordered pairs",
      options: [
        { id: "rise", label: "Rises, nearly in proportion at first, then flattens toward 50%", points: [0.3, 0.6, 1.1, 2.7, 5, 13, 22, 29] },
        { id: "flat", label: "Stays the same", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "step", label: "Zero until a threshold, then jumps", points: [0, 0, 0, 0, 0, 25, 25, 25] },
      ],
      answer: "rise",
      explain: "Each extra millisecond of clock error puts more pairs inside the window where error beats the gap. At very large error the order is a coin flip, 50%.",
    },
    {
      id: "co-flaw",
      format: "spot-flaw",
      scenario: "Two replicas each accept a write for the same key at the same instant and keep the one with the later timestamp. One customer's change disappears with no error. Tap the step that loses it.",
      diagram: {
        nodes: [
          { id: "w1", label: "write on replica A", kind: "client", col: 0, row: 0 },
          { id: "w2", label: "write on replica B", kind: "client", col: 0, row: 2 },
          { id: "merge", label: "keep the later timestamp", kind: "server", col: 1, row: 1 },
        ],
        edges: [
          { from: "w1", to: "merge" },
          { from: "w2", to: "merge" },
        ],
      },
      answer: "w1->merge",
      explain: "Neither write knew about the other, so neither is 'later'. Keeping one by timestamp silently discards the other; keep both and merge.",
    },
    {
      id: "co-explain",
      format: "explain",
      scenario: "In two sentences: what does a Lamport clock guarantee, and what does it not?",
      rubric: [
        { id: "does", criterion: "If event A happened before B then A's counter is smaller, so causally related events are ordered correctly" },
        { id: "doesnt", criterion: "A smaller counter does not mean happened-before; concurrent events get arbitrary order and the clock is not real time" },
      ],
      exemplar: "If one event caused or preceded another, the Lamport counter of the first is lower, so causal order is respected. The reverse is not true: a lower number does not mean it happened first, and concurrent events get an arbitrary order unrelated to real time.",
      explain: "Counters track causes, not clocks.",
    },
  ],
  codex: {
    oneLiner: "Wall clocks lie by milliseconds. Use logical or hybrid clocks for causal order and version vectors to detect concurrent writes.",
    keyNumbers: [
      { label: "Wrong order, 5 ms skew, writes 100 ms apart", value: "about 2.7%", sourceId: "ddia" },
      { label: "Bounded-uncertainty commit wait", value: "2 × the uncertainty bound", sourceId: "spanner-2012" },
    ],
    tradeoffs: [
      { choice: "Wall-clock LWW", gain: "Simple, tiny metadata", cost: "Wrong order and silent loss" },
      { choice: "Logical or hybrid clocks", gain: "Correct causal order", cost: "Concurrent writes still lose silently" },
      { choice: "Bounded clocks with commit wait", gain: "Global external order", cost: "Special hardware and a wait per commit" },
      { choice: "Version vectors", gain: "Detects every concurrent write", cost: "Metadata grows with nodes; app must merge" },
    ],
    seenIn: ["CockroachDB and MongoDB hybrid logical clocks.", "Spanner TrueTime; Dynamo-style systems with version vectors."],
    interviewAngle: "Say: 'never order by wall clocks; use logical or hybrid clocks for causality and version vectors when concurrent writes must not be dropped'.",
    aws: [{ concept: "Amazon Time Sync Service (microsecond-accurate clocks)", service: "EC2" }],
    replay: { id: "clock-lab", config: { sigma: 5, start: { scheme: "vector" } }, scene: "logical" },
  },
  interview: [
    "Why is it dangerous to order events by timestamp across machines?",
    "What is a Lamport clock?",
    "How does Spanner get a global order?",
  ],
  deeper: [
    {
      title: "Leap seconds and monotonic clocks",
      body: "Even on one machine wall clocks can jump: synchronisation steps them back, and leap seconds repeat a second. For measuring durations use a monotonic clock, which only moves forward; for timestamps that cross machines, use one of the logical or bounded schemes here.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "Twelve nodes whose wall clocks differ by a normal error with the standard deviation shown. A causally ordered pair of writes is separated by an exponential gap with a 100 ms mean; 'wrong order' is the chance the later write gets the earlier timestamp, found by numerical integration.",
    "Wall-clock, Lamport, hybrid and bounded schemes all pick a winner for concurrent writes, so the loser is lost silently; 500 concurrent conflicts a day are assumed. Only version vectors notice.",
    "Metadata per write: 8 bytes for a timestamp or counter, 12 for hybrid, 16 for an interval, 8 per node for a vector.",
  ],
  sources: [LAMPORT, SPANNER, HLC, DDIA],
  verify: [
    { id: "lww", claim: "At 5 ms skew and 100 ms gaps, last-writer-wins orders 2.7% of dependent writes wrongly", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "physical" }, metric: "wrongOrderPct" }, expect: { min: 0.025, max: 0.029 } },
    { id: "hlc", claim: "A hybrid logical clock orders them all correctly", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "hlc" }, metric: "wrongOrderPct" }, expect: { max: 0 } },
    { id: "hlc-loss", claim: "…but still loses concurrent writes silently", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "hlc" }, metric: "silentLossPerDay" }, expect: { min: 500 } },
    { id: "tt", claim: "A 7 ms bound costs a 14 ms commit wait", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "truetime", eps: 7 }, metric: "commitWaitMs" }, expect: { min: 14, max: 14 } },
    { id: "vec-loss", claim: "Version vectors lose no concurrent write silently", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "vector" }, metric: "silentLossPerDay" }, expect: { max: 0 } },
    { id: "vec-meta", claim: "…for 96 bytes of metadata", run: "lab", params: { model: "clock-lab", config: CLK_CHALLENGE, values: { scheme: "vector" }, metric: "metaBytes" }, expect: { min: 96, max: 96 } },
  ],
});
