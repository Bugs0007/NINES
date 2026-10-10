import { definePack } from "../define";

export const CONS = { lockLag: true, lagMs: 800, start: { level: "causal" } };

const JEPSEN = { id: "jepsen-consistency", title: "Jepsen: Consistency Models (map of linearizable, sequential, causal, session guarantees)", url: "https://jepsen.io/consistency" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5 and 9: Consistency and consensus", url: "https://dataintensive.net/" };
const VOGELS = { id: "vogels-eventual", title: "W. Vogels (2009), Eventually Consistent, Communications of the ACM 52(1)", url: "https://www.allthingsdistributed.com/2008/12/eventually_consistent.html" };

export default definePack({
  id: "consistency-models",
  title: "Consistency Models",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'my reply vanished and came back'", detail: "reads are served by the nearest replica" },
    lines: [
      { speaker: "kabir", line: "Replies vanish and reappear, and comments show up in a strange order. Engineering says the system is eventually consistent." },
      { speaker: "meera", line: "Eventual is a floor, not a promise. There are stronger guarantees in between, and most of them are cheap." },
    ],
  },
  predictions: [
    {
      id: "own",
      kind: "choice",
      prompt: "Replicas lag by 800 ms, users write once every 30 seconds, and reads go to any replica (eventual consistency). What share of a user's reads miss their own write?",
      options: [
        { id: "tiny", label: "About 0.03%" },
        { id: "few", label: "About 2.6%" },
        { id: "quarter", label: "About 26%" },
        { id: "most", label: "About 80%" },
      ],
      answer: "few",
      observe: "stale-seen",
      reveal: {
        text: "A read misses the write if it lands within the lag after it: 1 − e^(−0.8 ÷ 30) = 2.6%. Small per read, but thousands of confused users a day. A session token that remembers the user's last write fixes it without making every read slow.",
        derived: true,
        line: { speaker: "meera", line: "Everyone else's reads can be stale. Your own should never be." },
      },
    },
    {
      id: "linear",
      kind: "choice",
      prompt: "You switch to linearizable reads, always the latest, served by the leader 120 ms away. What happens to read latency?",
      options: [
        { id: "same", label: "Stays about 8 ms" },
        { id: "double", label: "Doubles" },
        { id: "sixteen", label: "Becomes about 128 ms, 16 times slower" },
      ],
      answer: "sixteen",
      observe: "linear-slow",
      reveal: {
        text: "A local replica answers in about 8 ms. Reading the latest value means asking the leader, a 120 ms round trip away, so each read costs 128 ms. During a partition the side without the leader cannot answer at all, which is half the users here.",
        derived: true,
        line: { speaker: "rao", line: "Always-latest is a luxury for the few reads that need it." },
      },
    },
  ],
  widget: { id: "consistency-lab", config: CONS },
  mechanism: [
    {
      id: "spectrum",
      text: "Consistency models describe what a read may return. At one end, linearizable systems behave like a single copy that updates instantly. At the other, eventual systems promise only that replicas agree if updates stop. In between are guarantees that cost little and prevent the confusing cases.",
      sourceIds: ["jepsen-consistency", "vogels-eventual"],
    },
    {
      id: "linear",
      scene: "linear",
      text: "Linearizability says every operation appears to happen at one instant between its start and finish, in an order everyone agrees on. A read after a completed write sees it, anywhere. It needs coordination on every operation, so it is slow across regions and unavailable on the minority side of a partition.",
      sourceIds: ["jepsen-consistency", "ddia"],
    },
    {
      id: "causal",
      scene: "causal",
      text: "Causal consistency, with session guarantees, is the useful middle. If you saw something before you wrote, anyone who sees your write also sees that. You always read your own writes and never go backward in time. Reads stay local and fast, and keep working during a partition.",
      sourceIds: ["jepsen-consistency", "ddia"],
    },
    {
      id: "eventual",
      scene: "eventual",
      text: "Eventual consistency promises only convergence. Reads go to any replica, so a user may miss their own write or see an older page after a newer one. It is the cheapest and always available, and it suits data where being briefly stale does not matter, such as view counts.",
      sourceIds: ["vogels-eventual"],
    },
  ],
  challenges: [
    {
      id: "feed-guarantee",
      title: "Pick the guarantee for the feed",
      brief: "A social feed with replicas lagging by 800 ms. Choose the read guarantee so users miss at most 0.1% of their own writes, never see time go backward, reads take at most 30 ms, and at least 99% of reads work during a region partition.",
      line: { speaker: "kabir", line: "I do not need every post to be fresh. I need people to trust their own screen." },
      widget: { id: "consistency-lab", config: CONS },
      conditions: [
        { metric: "ownMiss", op: "<=", value: 0.001, label: "At most 0.1% of own writes missed" },
        { metric: "monotonic", op: "<=", value: 0, label: "No reads that go back in time" },
        { metric: "readMs", op: "<=", value: 30, label: "Reads at most 30 ms" },
        { metric: "availPartition", op: ">=", value: 0.99, label: "At least 99% of reads work in a partition" },
      ],
      stars: [],
      hints: [
        "Which guarantees give fast local reads?",
        "Which of those also stop a user missing their own write?",
        "Which of those also prevent going back in time?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the difference between linearizable, causal and eventual consistency, and which you would use for a social feed.",
    rubric: [
      { id: "linear", criterion: "Linearizable behaves like one copy and always returns the latest, at the cost of latency and availability", keyIdea: "linearizable is single-copy" },
      { id: "eventual", criterion: "Eventual only guarantees convergence; users can miss their own writes or see time go backward", keyIdea: "eventual anomalies" },
      { id: "causal", criterion: "Causal with session guarantees keeps reads local while giving read-your-writes and monotonic reads", keyIdea: "causal and sessions" },
    ],
    exemplar:
      "Linearizable behaves like a single copy and always returns the latest value, but it needs coordination, so it is slow across regions and unavailable on the minority side of a partition. Eventual only promises that replicas converge, so a user can miss their own write or see an older page after a newer one. For a feed I would use causal consistency with session tokens, which keeps reads local and fast while giving read-your-writes and monotonic reads.",
  },
  reviews: [
    {
      id: "cm-est",
      format: "estimate",
      scenario: "Replicas lag 500 ms and other users post about once every 2 seconds. With eventual reads, what share of reads miss some other user's most recent post? (1 − e^(−lag ÷ gap))",
      unit: "%",
      answer: 22,
      acceptFactor: 1.15,
      breakdown: ["lag ÷ gap = 0.5 ÷ 2 = 0.25", "1 − e^(−0.25) = 0.221", "≈ 22%"],
      explain: "Feeds are always a little behind the writers. It is fine unless it is the user's own post.",
    },
    {
      id: "cm-pick",
      format: "pick-fix",
      scenario: "A user posts a comment and refreshes. Sometimes it is missing, sometimes it appears. All reads go to random replicas. The smallest fix that keeps reads local?",
      options: [
        { id: "a", label: "Session guarantees: the client sends the position of its last write and replicas wait until they reach it" },
        { id: "b", label: "Make all reads linearizable" },
        { id: "c", label: "Add more replicas" },
        { id: "d", label: "Shorten the cache TTL" },
      ],
      answer: "a",
      explain: "A session token fixes the case that hurts, the user's own writes, without sending every read to the leader.",
    },
    {
      id: "cm-order",
      format: "order",
      scenario: "Order these models from weakest to strongest guarantee.",
      items: [
        { id: "eventual", label: "Eventual" },
        { id: "causal", label: "Causal" },
        { id: "sequential", label: "Sequential" },
        { id: "linear", label: "Linearizable" },
      ],
      answer: ["eventual", "causal", "sequential", "linear"],
      explain: "Each step adds ordering promises. Causal orders related events, sequential orders all of them, and linearizable also ties that order to real time.",
    },
    {
      id: "cm-graph",
      format: "predict-graph",
      scenario: "With eventual reads, a user writes once every 30 seconds. As replica lag goes from 10 ms to 5 seconds, how does the share of reads missing the user's own write change?",
      xLabel: "replica lag →",
      yLabel: "own writes missed",
      options: [
        { id: "rise", label: "Rises roughly in proportion to the lag, then bends over", points: [0.03, 0.1, 0.3, 0.8, 1.7, 3.3, 6.2, 15] },
        { id: "flat", label: "Stays flat", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "fall", label: "Falls", points: [15, 6, 3, 1.7, 0.8, 0.3, 0.1, 0.03] },
      ],
      answer: "rise",
      explain: "The chance a read falls within the lag of a write is 1 − e^(−lag ÷ gap), so it grows with lag.",
    },
    {
      id: "cm-flaw",
      format: "spot-flaw",
      scenario: "A team makes every read linearizable 'to be safe'. Their multi-region app is slow and half the users see errors during a network split. Tap the step that causes both problems.",
      diagram: {
        nodes: [
          { id: "client", label: "client in region B", kind: "client", col: 0, row: 1 },
          { id: "read", label: "every read goes to the leader", kind: "lb", col: 1, row: 1 },
          { id: "leader", label: "leader in region A", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "read" },
          { from: "read", to: "leader" },
        ],
      },
      answer: "read->leader",
      explain: "Reading the latest value means asking the leader across the ocean, and when the link is down there is nobody to ask. Use it only for reads that need it.",
    },
    {
      id: "cm-explain",
      format: "explain",
      scenario: "In two sentences: why is read-your-writes much cheaper to provide than linearizability?",
      rubric: [
        { id: "local", criterion: "It only needs to constrain one user's session, so reads can stay on a local replica that has caught up to that user's last write" },
        { id: "global", criterion: "Linearizability needs a global order agreed by everyone on every operation, which needs coordination" },
      ],
      exemplar: "Read-your-writes only concerns one user's own session, so a local replica just has to be at least as new as that user's last write. Linearizability needs everyone to agree on one order for every operation, which takes coordination.",
      explain: "Guarantee only what a user can notice.",
    },
  ],
  codex: {
    oneLiner: "Linearizable is single-copy and slow; eventual is fast and surprising. Session guarantees or causal consistency give most users what they notice.",
    keyNumbers: [
      { label: "Own-write miss rate, eventual, 800 ms lag, one write per 30 s", value: "2.6%", sourceId: "ddia" },
      { label: "Linearizable read across a 120 ms link", value: "about 128 ms", sourceId: "jepsen-consistency" },
    ],
    tradeoffs: [
      { choice: "Linearizable", gain: "Behaves like one copy", cost: "Slow cross-region; unavailable on the minority side" },
      { choice: "Causal with sessions", gain: "Fast local reads with sensible ordering", cost: "Session tokens and replica wait logic" },
      { choice: "Eventual", gain: "Cheapest and always available", cost: "Anomalies a user can see" },
    ],
    seenIn: ["DynamoDB strongly consistent versus eventually consistent reads.", "MongoDB read concerns and causally consistent sessions."],
    interviewAngle: "Say: 'linearizable only where needed (locks, uniqueness), session guarantees for users, eventual for the rest'.",
    aws: [{ concept: "ConsistentRead flag", service: "DynamoDB" }],
    replay: { id: "consistency-lab", config: CONS, scene: "causal" },
  },
  interview: [
    "What is the difference between linearizability and eventual consistency?",
    "What is read-your-writes and how do you provide it?",
    "When do you actually need linearizable reads?",
  ],
  deeper: [
    {
      title: "Consistency in the database is not consistency in ACID",
      body: "The C in ACID means a transaction leaves the database satisfying its own rules, such as foreign keys. The consistency in CAP and in these models is about how replicas agree and what reads can see. They share a word and little else, which is why interviewers sometimes ask for the difference.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "A social app with two regions 120 ms apart. A user writes about once every 30 seconds; other people's posts arrive about every 2 seconds. Replicas lag by the set number of milliseconds.",
    "Linearizable reads go to the leader (128 ms) and cannot be served on the minority side of a partition. Other levels read locally in 8 to 9 ms.",
    "Miss and stale rates are 1 − e^(−lag ÷ gap).",
  ],
  sources: [JEPSEN, DDIA, VOGELS],
  verify: [
    { id: "eventual-own", claim: "Eventual reads miss a user's own write 2.6% of the time at 800 ms lag", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "eventual" }, metric: "ownMiss" }, expect: { min: 0.025, max: 0.027 } },
    { id: "eventual-mono", claim: "…and show time going backward on a substantial share of reads", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "eventual" }, metric: "monotonic" }, expect: { min: 0.1 } },
    { id: "linear-ms", claim: "Linearizable reads take 128 ms", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "linear" }, metric: "readMs" }, expect: { min: 128, max: 128 } },
    { id: "linear-avail", claim: "…and only half of reads work during a partition", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "linear" }, metric: "availPartition" }, expect: { max: 0.5 } },
    { id: "sequential", claim: "Sequential consistency still misses own writes", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "sequential" }, metric: "ownMiss" }, expect: { min: 0.02 } },
    { id: "causal-own", claim: "Causal sessions never miss own writes", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "causal" }, metric: "ownMiss" }, expect: { max: 0 } },
    { id: "causal-ms", claim: "…with fast reads", run: "lab", params: { model: "consistency-lab", config: CONS, values: { level: "causal" }, metric: "readMs" }, expect: { max: 30 } },
  ],
});
