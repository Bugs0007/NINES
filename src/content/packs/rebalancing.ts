import { definePack } from "../define";

export const REBAL = { start: { rate: 50, streams: 4 } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 6: Rebalancing partitions (fixed number of partitions, dynamic partitioning)", url: "https://dataintensive.net/" };
const REDIS = { id: "redis-cluster", title: "Redis docs: Cluster specification (16,384 hash slots, resharding by moving slots)", url: "https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/" };
const KAFKA = { id: "kafka-throttle", title: "Apache Kafka docs: Limiting bandwidth usage during data migration (replication throttle)", url: "https://kafka.apache.org/documentation/#rep-throttle" };

export default definePack({
  id: "rebalancing",
  title: "Rebalancing",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "orders-cluster · rebalance in progress", detail: "p99 up 60%, 2 of 12 nodes still empty" },
    lines: [
      { speaker: "kabir", line: "We added two nodes on Monday morning and told the cluster to use them. By lunch the checkout page was slow and the new nodes were still empty." },
      { speaker: "meera", line: "Moving data is work, and it runs on the same disks and network as your customers. Speed and pain trade off." },
    ],
  },
  predictions: [
    {
      id: "duration",
      kind: "choice",
      prompt: "A 10-node cluster holds 40 TB. Two nodes are added and about 6.7 TB must move. Streams are throttled to 80 MB/s in total to protect users. How long does the move take?",
      options: [
        { id: "hour", label: "About an hour" },
        { id: "six", label: "About 6 hours" },
        { id: "day", label: "About a day" },
        { id: "week", label: "About a week" },
      ],
      answer: "day",
      observe: "too-slow",
      reveal: {
        text: "6.7 TB is about 6.7 million MB. At 80 MB/s that is 83,000 seconds, a little over 23 hours. A throttle that feels cautious can leave the cluster unbalanced for a full day, with the new nodes idle and the old ones still overloaded.",
        derived: true,
        line: { speaker: "meera", line: "Slow is safe for users and unsafe for the cluster. Both are costs." },
      },
    },
    {
      id: "pain",
      kind: "choice",
      prompt: "To finish in two hours you run the move at 1,000 MB/s in total. What happens to foreground p99 latency in the lab's model?",
      options: [
        { id: "none", label: "Nothing measurable" },
        { id: "small", label: "Up about 5%" },
        { id: "big", label: "Up about 60%" },
        { id: "dead", label: "The cluster stops answering" },
      ],
      answer: "big",
      observe: "too-fast",
      reveal: {
        text: "In this model, p99 grows faster than the move rate: doubling the rate more than doubles the added delay, because the move and the customers share the same disks. At 1,000 MB/s the lab adds 60%. The curve is illustrative, but the convex shape is real.",
        derived: true,
        line: { speaker: "rao", line: "Fast finishes and gentle finishes are different budgets." },
      },
    },
  ],
  widget: { id: "rebalance-lab", config: REBAL },
  mechanism: [
    {
      id: "fixed",
      scene: "partitions",
      text: "The cheapest rebalance moves whole units. Create many more partitions than nodes up front, such as Redis Cluster's 16,384 hash slots, and let each node own a set. Adding a node means moving some existing partitions to it, never re-splitting every key.",
      sourceIds: ["redis-cluster", "ddia"],
    },
    {
      id: "amount",
      text: "How much must move is easy to estimate. If you go from N to N + k nodes with even partitions, the new nodes need k ÷ (N + k) of the data, and that is all that should move. Here, 2 ÷ 12 of 40 TB is 6.7 TB.",
      sourceIds: ["ddia"],
      derived: true,
    },
    {
      id: "throttle",
      scene: "throttle",
      text: "The move shares disks and network with live traffic, so most systems throttle it. A faster move finishes sooner but raises foreground latency; a slower move spares users but leaves the cluster unbalanced and exposed. Pick a rate from the time you can tolerate and the latency you can spare.",
      sourceIds: ["kafka-throttle"],
    },
    {
      id: "split",
      scene: "split",
      text: "Dynamic partitioning splits a partition when it grows too large and merges small ones, so partition count follows data size. Moves then happen in small, steady steps. Copy first, switch reads to the new copy once it is current, and delete the old data last.",
      sourceIds: ["ddia"],
    },
  ],
  challenges: [
    {
      id: "move-rate",
      title: "Finish the move without hurting users",
      brief: "Move 6.7 TB onto the two new nodes. Choose a rate and number of streams so the move finishes within 8 hours and adds at most 12% to foreground p99.",
      line: { speaker: "kabir", line: "Black Friday is in nine hours. I want the cluster balanced and the checkout quick." },
      widget: { id: "rebalance-lab", config: REBAL },
      conditions: [
        { metric: "hours", op: "<=", value: 8, label: "Finishes within 8 hours" },
        { metric: "p99Increase", op: "<=", value: 0.12, label: "Adds at most 12% to p99" },
      ],
      stars: [{ metric: "hours", op: "<=", value: 7, label: "Finishes within 7 hours" }],
      hints: [
        "How many MB per second in total would finish 6.7 TB in 8 hours?",
        "What total rate adds 12% to p99 in the lab's model?",
        "Between those two totals sits the answer. Rate times streams is what counts.",
      ],
    },
  ],
  explainBack: {
    prompt: "A cluster of 10 nodes gets 2 more. How much data moves, how do you move it, and what is the trade-off in speed?",
    rubric: [
      { id: "amount", criterion: "About 2/12 of the data should move to the new nodes, not all of it, if partitions are fixed and even", keyIdea: "move only what the new nodes need" },
      { id: "units", criterion: "Move whole partitions, using many more partitions than nodes, rather than re-hashing keys", keyIdea: "fixed partitions" },
      { id: "throttle", criterion: "Throttle the move: faster finishes sooner but hurts foreground latency; slower is gentler but leaves the cluster unbalanced", keyIdea: "rate trade-off" },
    ],
    exemplar:
      "Only what the new nodes need should move: with ten nodes becoming twelve, about a sixth of the data. I would use many fixed partitions, far more than nodes, and move whole partitions to the new nodes, copying first and switching over once the copy is current. I would throttle the move, because faster finishes sooner but raises user-visible latency, and slower is gentle but leaves the cluster unbalanced longer.",
  },
  reviews: [
    {
      id: "rb-est",
      format: "estimate",
      scenario: "A cluster of 8 nodes holds 24 TB evenly. You add 4 nodes. How many TB must move to even it out?",
      unit: "TB",
      answer: 8,
      acceptFactor: 1.05,
      breakdown: ["New nodes should hold 4 ÷ 12 = 1/3 of the data", "1/3 × 24 TB = 8 TB"],
      explain: "Only the new nodes' share moves; the rest stays where it is.",
    },
    {
      id: "rb-pick",
      format: "pick-fix",
      scenario: "A rebalance moves data at full speed and checkout latency doubles. Customers are complaining. What do you change first?",
      options: [
        { id: "a", label: "Lower the migration throttle so the move uses less of the disks and network" },
        { id: "b", label: "Stop the move and leave the cluster unbalanced indefinitely" },
        { id: "c", label: "Add more streams" },
        { id: "d", label: "Restart the cluster" },
      ],
      answer: "a",
      explain: "Throttle first: the move should finish later, not never. Stopping leaves the overloaded nodes overloaded.",
    },
    {
      id: "rb-order",
      format: "order",
      scenario: "Order these migration rates by hours to move 6.7 TB, longest first.",
      items: [
        { id: "slow", label: "40 MB/s total" },
        { id: "mid", label: "300 MB/s total" },
        { id: "fast", label: "1,000 MB/s total" },
      ],
      answer: ["slow", "mid", "fast"],
      explain: "Time is data divided by rate: about 46, 6.2, and 1.9 hours.",
    },
    {
      id: "rb-graph",
      format: "predict-graph",
      scenario: "As you raise the total migration rate from 50 to 800 MB/s, how does the added p99 latency in the lab change?",
      xLabel: "migration rate →",
      yLabel: "added p99",
      options: [
        { id: "convex", label: "Grows slowly at first, then faster and faster", points: [1, 2, 4, 8, 14, 22, 32, 44] },
        { id: "linear", label: "Grows in a straight line", points: [6, 12, 18, 24, 30, 36, 42, 48] },
        { id: "flat", label: "Stays flat", points: [5, 5, 5, 5, 5, 5, 5, 5] },
      ],
      answer: "convex",
      explain: "The move and the live traffic share disks and network, so added contention grows faster than the rate.",
    },
    {
      id: "rb-flaw",
      format: "spot-flaw",
      scenario: "A team 'rebalances' by recomputing every key's node with hash mod 12 instead of 10 and moving each key. The cluster is saturated for a day. Tap the step that moves too much data.",
      diagram: {
        nodes: [
          { id: "add", label: "add 2 nodes", kind: "server", col: 0, row: 1 },
          { id: "rehash", label: "rehash every key mod 12", kind: "lb", col: 1, row: 1 },
          { id: "move", label: "move ~90% of the data", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "add", to: "rehash" },
          { from: "rehash", to: "move" },
        ],
      },
      answer: "rehash->move",
      explain: "Rehashing everything mod the new node count reshuffles almost every key. Fixed partitions or a ring move only the new nodes' share.",
    },
    {
      id: "rb-explain",
      format: "explain",
      scenario: "In two sentences: why not just rebalance as fast as possible?",
      rubric: [
        { id: "shared", criterion: "The move uses the same disks and network as live traffic, so it raises user-visible latency" },
        { id: "balance", criterion: "Choose the rate from how long imbalance is tolerable versus how much latency is acceptable" },
      ],
      exemplar: "The move runs on the same disks and network as customers, so a fast rebalance slows them. The rate balances how long the cluster can stay unbalanced against how much latency users will accept.",
      explain: "Rebalancing is a tax on live traffic.",
    },
  ],
  codex: {
    oneLiner: "Add nodes by moving whole partitions: only the new nodes' share moves. Throttle the copy to balance speed against foreground latency.",
    keyNumbers: [
      { label: "Data to move when going from N to N + k nodes", value: "k ÷ (N + k) of the total", sourceId: "ddia" },
      { label: "Redis Cluster hash slots", value: "16,384", sourceId: "redis-cluster" },
    ],
    tradeoffs: [
      { choice: "Fixed partitions", gain: "Simple, predictable moves", cost: "Partition count is fixed up front" },
      { choice: "Dynamic splitting", gain: "Partitions follow data size", cost: "More machinery and split storms" },
      { choice: "Faster migration", gain: "Short imbalance", cost: "Higher live latency" },
    ],
    seenIn: ["Redis Cluster slot migration.", "Kafka partition reassignment with a throttle."],
    interviewAngle: "Say: 'use many fixed partitions, move only the new nodes' share, throttle it, and switch over after the copy is current'.",
    aws: [{ concept: "Online resharding", service: "ElastiCache (Redis cluster mode)" }],
    replay: { id: "rebalance-lab", config: REBAL, scene: "throttle" },
  },
  interview: [
    "How would you add nodes to a sharded database without downtime?",
    "How much data has to move when you add a node?",
    "What are the risks of rebalancing under load?",
  ],
  deeper: [
    {
      title: "Automatic versus manual rebalancing",
      body: "Fully automatic rebalancing is convenient but dangerous: a node that is slow may look dead, triggering a move that adds load to the cluster and slows it further. Many systems propose a rebalance and wait for an operator to confirm, which trades some convenience for fewer cascading failures.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "A cluster of 10 nodes holds 40 TB and two nodes are added. With even fixed partitions, 2 ÷ 12 of the data, 6.7 TB, moves.",
    "Added p99 is 0.6 × (total rate ÷ 1,000 MB/s)^1.5, a convex curve chosen to show the shape, not a measurement.",
    "Real systems pause moves at peak, move cold data first, and keep serving from the old copy until the new one is current.",
  ],
  sources: [DDIA, REDIS, KAFKA],
  verify: [
    { id: "slow", claim: "At 80 MB/s the move takes over 23 hours", run: "lab", params: { model: "rebalance-lab", config: REBAL, values: { rate: 20, streams: 4 }, metric: "hours" }, expect: { min: 23, max: 24 } },
    { id: "fast-p99", claim: "At 1,000 MB/s p99 rises 60%", run: "lab", params: { model: "rebalance-lab", config: REBAL, values: { rate: 100, streams: 10 }, metric: "p99Increase" }, expect: { min: 0.59, max: 0.61 } },
    { id: "good-h", claim: "At 300 MB/s the move takes about 6 hours", run: "lab", params: { model: "rebalance-lab", config: REBAL, values: { rate: 60, streams: 5 }, metric: "hours" }, expect: { max: 8 } },
    { id: "good-p", claim: "…adding about 10% to p99", run: "lab", params: { model: "rebalance-lab", config: REBAL, values: { rate: 60, streams: 5 }, metric: "p99Increase" }, expect: { max: 0.12 } },
    { id: "moved", claim: "6.7 TB moves", run: "lab", params: { model: "rebalance-lab", config: REBAL, values: {}, metric: "movedTB" }, expect: { min: 6.6, max: 6.7 } },
  ],
});
