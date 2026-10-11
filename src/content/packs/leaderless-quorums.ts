import { definePack } from "../define";

export const QUORUM = { lockN: false, start: { n: 5, w: 1, r: 1 } };
export const QUORUM_CHALLENGE = { lockN: true, n: 5, start: { w: 1, r: 1 } };

const DYNAMO = { id: "dynamo-2007", title: "G. DeCandia et al. (2007), Dynamo: Amazon's Highly Available Key-value Store, ACM SOSP (N, R, W quorums, hinted handoff)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf" };
const CASSANDRA_DYNAMO = { id: "cassandra-dynamo", title: "Apache Cassandra docs: Dynamo (replication, consistency levels, quorum, hinted handoff, read repair)", url: "https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html" };
const GIFFORD = { id: "gifford-1979", title: "D. Gifford (1979), Weighted Voting for Replicated Data, SOSP", url: "https://doi.org/10.1145/800215.806583" };
const PBS = { id: "bailis-2012", title: "P. Bailis et al. (2012), Probabilistically Bounded Staleness for Practical Partial Quorums, PVLDB 5(8)", url: "https://doi.org/10.14778/2350229.2350261" };

export default definePack({
  id: "leaderless-quorums",
  title: "Leaderless Replication & Quorums",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "terminal",
    alert: { severity: "info", title: "cassandra · consistency level", detail: "ONE for speed, QUORUM for safety. What is the difference?" },
    lines: [
      { speaker: "kabir", line: "With no leader, how does a read know it has the latest value? Do I just ask all five copies?" },
      { speaker: "meera", line: "You ask enough of them that your set must overlap the set that took the write. That is what a quorum is." },
    ],
  },
  predictions: [
    {
      id: "overlap",
      kind: "choice",
      prompt: "Five replicas. A write is acknowledged by 3 of them and a read asks any 3. Can a read miss the latest write?",
      options: [
        { id: "yes", label: "Yes, sometimes: 3 random replicas can all miss it" },
        { id: "no", label: "No: any 3 replicas must include at least one of the 3 that took the write" },
        { id: "half", label: "Half the time" },
        { id: "depends", label: "Only if a replica is down" },
      ],
      answer: "no",
      observe: "overlap",
      reveal: {
        text: "Three replicas took the write and two did not. A read of any three replicas out of five must include at least one of the three that have it, since only two are without it. When R + W exceeds N the sets always overlap.",
        sourceIds: ["gifford-1979", "dynamo-2007"],
        line: { speaker: "meera", line: "Pigeonhole, not luck." },
      },
    },
  ],
  widget: { id: "quorum-lab", config: QUORUM },
  mechanism: [
    {
      id: "leaderless",
      text: "In leaderless replication, as in Dynamo and Cassandra, any replica can accept a write and there is no single leader. A client sends each write to several replicas and reads from several, and the system relies on how many must answer: N copies of each item, W acknowledgements required for a write, and R responses required for a read.",
      sourceIds: ["dynamo-2007", "cassandra-dynamo"],
    },
    {
      id: "overlap",
      scene: "overlap",
      text: "If R + W > N, every read set shares a replica with every write set, so a read sees the latest acknowledged write, if the client can tell which version is newest. N = 3 with W = 2 and R = 2 is common. Otherwise the sets can miss each other.",
      sourceIds: ["gifford-1979", "cassandra-dynamo"],
    },
    {
      id: "tradeoff",
      scene: "tradeoff",
      text: "The numbers set the trade-off. A large W makes writes slow and fragile when replicas are down, and a large R does the same for reads. W = N with R = 1 favours reads, W = 1 with R = N favours writes, and 3 of 5 for both tolerates two failures.",
      derived: true,
    },
    {
      id: "sloppy",
      scene: "sloppy",
      text: "Dropping below the overlap rule buys speed and availability at the cost of consistency: W = R = 1 is fast and always available and can return stale values. Systems repair gaps in the background with read repair and anti-entropy. The staleness of partial quorums can be quantified and is often small, but never zero.",
      sourceIds: ["bailis-2012", "dynamo-2007"],
    },
  ],
  challenges: [
    {
      id: "pick-quorums",
      title: "Set N, W, and R",
      brief: "Five replicas. Reads must always see the latest write. Both reads and writes must stay available at 99.99% with 1% of replicas down at random, and each must have a p99 of at most 20 ms. Choose the write and read quorums.",
      line: { speaker: "rao", line: "Waiting for more replicas costs latency and buys safety. Find the cheapest point that is still safe." },
      widget: { id: "quorum-lab", config: QUORUM_CHALLENGE },
      conditions: [
        { metric: "consistent", op: ">=", value: 1, label: "Reads always see the latest write" },
        { metric: "writeAvail", op: ">=", value: 0.9999, label: "Writes available at least 99.99%" },
        { metric: "readAvail", op: ">=", value: 0.9999, label: "Reads available at least 99.99%" },
        { metric: "writeP99", op: "<=", value: 0.02, label: "Write p99 at most 20 ms" },
        { metric: "readP99", op: "<=", value: 0.02, label: "Read p99 at most 20 ms" },
      ],
      stars: [{ metric: "writeP99", op: "<=", value: 0.016, label: "Write p99 at most 16 ms" }],
      hints: [
        "Which settings guarantee that read and write sets overlap?",
        "Among those, which let both reads and writes survive failures of a couple of replicas?",
        "Waiting for more replicas raises the slowest one you wait on. Check the p99 for each choice.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain N, W, and R, when quorums guarantee reading the latest write, and what the trade-offs are.",
    rubric: [
      { id: "def", criterion: "N replicas per item; a write needs W acknowledgements and a read needs R responses", keyIdea: "N, W, R" },
      { id: "overlap", criterion: "If R + W > N the read and write sets overlap, so a read includes a replica with the latest write", keyIdea: "R + W > N" },
      { id: "tradeoff", criterion: "Larger W or R means higher latency and lower availability; smaller values are faster and more available but can read stale data", keyIdea: "latency, availability, staleness" },
    ],
    exemplar:
      "Each item is stored on N replicas; a write must be acknowledged by W of them and a read asks R. If R + W is greater than N the read and write sets must overlap, so a read always includes at least one replica with the latest write, provided versions can be compared. Larger W or R raise latency and lower availability because you wait for more replicas, while smaller values are faster and more available but can return stale data.",
  },
  reviews: [
    {
      id: "lq-est",
      format: "estimate",
      scenario: "N = 5, W = 3, R = 3. How many replicas can be down while both reads and writes still succeed?",
      unit: "replicas",
      answer: 2,
      acceptFactor: 1.1,
      breakdown: ["A write needs 3 of 5 acknowledgements", "A read needs 3 of 5 responses", "So 5 − 3 = 2 replicas can be down"],
      explain: "Both quorums can still be met with three live replicas, so two failures are tolerated.",
    },
    {
      id: "lq-est2",
      format: "estimate",
      scenario: "N = 5, W = 1, R = 1. When a write reaches one replica and a read asks one replica chosen at random, what is the chance the read misses the write? (C(N − W, R) ÷ C(N, R))",
      unit: "%",
      answer: 80,
      acceptFactor: 1.1,
      breakdown: ["C(4, 1) ÷ C(5, 1) = 4 ÷ 5", "= 80%"],
      explain: "Immediately after a write only one replica has it, so a random read misses it four times out of five until the others catch up.",
    },
    {
      id: "lq-pick",
      format: "pick-fix",
      scenario: "A read-heavy service wants very fast reads and can tolerate slower writes, with N = 3. Which settings keep reads consistent?",
      options: [
        { id: "a", label: "W = 3, R = 1" },
        { id: "b", label: "W = 1, R = 1" },
        { id: "c", label: "W = 1, R = 2" },
        { id: "d", label: "W = 2, R = 1" },
      ],
      answer: "a",
      explain: "R + W must exceed N = 3. W = 3 and R = 1 gives 4 and makes reads the fastest, at the cost of writes that wait for every replica and fail if one is down.",
    },
    {
      id: "lq-order",
      format: "order",
      scenario: "Order these settings for N = 5 by write availability, highest first, when 1% of replicas are down at random.",
      items: [
        { id: "w1", label: "W = 1" },
        { id: "w3", label: "W = 3" },
        { id: "w4", label: "W = 4" },
        { id: "w5", label: "W = 5" },
      ],
      answer: ["w1", "w3", "w4", "w5"],
      explain: "The more acknowledgements a write needs, the more likely it is that too few replicas are up.",
    },
    {
      id: "lq-graph",
      format: "predict-graph",
      scenario: "For N = 5, raise the write quorum W from 1 to 5. How does the write's p99 latency change, if each replica's latency has a long tail?",
      xLabel: "W →",
      yLabel: "write p99",
      options: [
        { id: "flat", label: "Flat", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "rise", label: "Rises slowly, then jumps for the last replicas", points: [1, 1.5, 2.4, 3.8, 8, 8, 8, 8] },
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "fall", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "rise",
      explain: "Waiting for the W fastest of N means the last replicas you wait for are the slow tail ones, so the cost per extra acknowledgement grows as W approaches N.",
    },
    {
      id: "lq-flaw",
      format: "spot-flaw",
      scenario: "A team uses N = 3, W = 1, R = 1 'for speed' and is surprised that a freshly written value sometimes reads back as the old one. Tap the settings that cause it.",
      diagram: {
        nodes: [
          { id: "app", label: "app", kind: "server", col: 0, row: 1 },
          { id: "cluster", label: "N = 3, W = 1, R = 1: R + W = 2, not above N", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "cluster" }],
      },
      answer: "cluster",
      explain: "R + W = 2 is not greater than N = 3, so a read can land on a replica the write has not reached. Use W = 2, R = 2 for overlap, or accept the staleness knowingly.",
    },
    {
      id: "lq-explain",
      format: "explain",
      scenario: "In two sentences: why does R + W > N guarantee that a read sees the latest write?",
      rubric: [
        { id: "overlap", criterion: "The set of W replicas that took the write and the set of R replicas asked must share at least one replica when R + W exceeds N" },
        { id: "latest", criterion: "That shared replica holds the latest write, so the read sees it" },
      ],
      exemplar: "If R plus W exceeds N, any set of R replicas and any set of W replicas must share at least one replica. That replica has the latest write, so the read includes it.",
      explain: "Two big sets in a small room must meet.",
    },
  ],
  codex: {
    oneLiner: "No leader: N copies, W write acks, R read responses. R + W > N guarantees overlap; larger W or R costs latency and availability.",
    keyNumbers: [
      { label: "Consistent reads", value: "R + W > N", sourceId: "gifford-1979" },
      { label: "Common choice", value: "N = 3, W = 2, R = 2", sourceId: "cassandra-dynamo" },
      { label: "Miss chance when R + W ≤ N", value: "C(N − W, R) ÷ C(N, R) right after a write", sourceId: "bailis-2012" },
    ],
    tradeoffs: [
      { choice: "W = R = majority", gain: "Consistent reads and tolerates minority failures", cost: "Waits for several replicas; slower than ONE" },
      { choice: "W = 1, R = 1", gain: "Fastest and always available", cost: "Stale reads until replicas converge" },
      { choice: "Read repair and hinted handoff", gain: "Replicas converge in the background", cost: "Extra background work; not instant" },
    ],
    seenIn: ["Cassandra consistency levels ONE, QUORUM, ALL.", "DynamoDB's strongly versus eventually consistent reads."],
    interviewAngle: "Quote the rule and the trade: 'R plus W greater than N for overlap; I would pick QUORUM for both on N = 3, and ONE only where staleness is acceptable.'",
    aws: [{ concept: "Tunable consistency", service: "Amazon Keyspaces (Cassandra) consistency levels; DynamoDB strongly consistent reads" }],
    replay: { id: "quorum-lab", config: { lockN: true, n: 5, start: { w: 3, r: 3 } }, scene: "overlap" },
  },
  interview: [
    "What do N, W, and R mean in a Dynamo-style system?",
    "When do reads see the latest write, and when can they not?",
    "How do you choose W and R?",
  ],
  deeper: [
    {
      title: "Quorums are not the whole story",
      body: "Overlap guarantees a read can see the latest write, not that it will know which value is latest: versions need vector clocks or timestamps, and concurrent writes still produce conflicts. Sloppy quorums and hinted handoff let writes succeed on stand-in nodes during failures, which breaks the overlap guarantee for a while. And two writes racing, or a failed write that is partly applied, can leave a read returning values that never settled. Quorums are a tool, not linearizability.",
      sourceIds: ["dynamo-2007"],
    },
  ],
  honestPhysics: [
    "Replicas fail independently with probability 1% at any moment, and latencies are independent lognormals with a 5 ms median and 40 ms 99th percentile. A write waits for the W fastest acknowledgements.",
    "Overlap guarantees a read can see the latest acknowledged write. Real systems also need a way to pick the newest version and handle concurrent writes.",
    "Hinted handoff, read repair, and clock questions are ignored.",
  ],
  sources: [DYNAMO, CASSANDRA_DYNAMO, GIFFORD, PBS],
  verify: [
    { id: "w1r1", claim: "W = R = 1 on five replicas does not guarantee consistent reads", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 1, r: 1 }, metric: "consistent" }, expect: { max: 0 } },
    { id: "w1r1-stale", claim: "…and misses a fresh write 80% of the time", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 1, r: 1 }, metric: "staleProb" }, expect: { min: 0.79, max: 0.81 } },
    { id: "w3r3", claim: "W = R = 3 gives consistent reads", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 3, r: 3 }, metric: "consistent" }, expect: { min: 1 } },
    { id: "w3r3-avail", claim: "…with writes available at 99.99% or better", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 3, r: 3 }, metric: "writeAvail" }, expect: { min: 0.9999 } },
    { id: "w3r3-p99", claim: "…and a p99 under 20 ms", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 3, r: 3 }, metric: "writeP99" }, expect: { max: 0.02 } },
    { id: "w5r1", claim: "W = 5, R = 1 breaks write availability", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 5, r: 1 }, metric: "writeAvail" }, expect: { max: 0.9999 } },
    { id: "w4r2", claim: "W = 4, R = 2 falls just short on write availability", run: "lab", params: { model: "quorum-lab", config: QUORUM_CHALLENGE, values: { w: 4, r: 2 }, metric: "writeAvail" }, expect: { max: 0.9999 } },
  ],
});
