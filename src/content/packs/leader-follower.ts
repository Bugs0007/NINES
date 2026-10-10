import { definePack } from "../define";

export const REPL = { lockLoad: false, reads: 12000, writes: 600, start: { followers: 0 } };
export const REPL_CHALLENGE = { lockLoad: true, reads: 12000, writes: 600, start: { followers: 0 } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5: Replication (leaders and followers)", url: "https://dataintensive.net/" };
const PG_STANDBY = { id: "pg-warm-standby", title: "PostgreSQL docs: Log-Shipping Standby Servers (streaming replication)", url: "https://www.postgresql.org/docs/current/warm-standby.html" };
const AURORA_REPL = { id: "aurora-replicas", title: "AWS docs: Replication with Amazon Aurora (reader instances share storage with the writer)", url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html" };

export default definePack({
  id: "leader-follower",
  title: "Leader-Follower Replication",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "postgres primary · CPU 94%", detail: "95% of the load is reads" },
    lines: [
      { speaker: "kabir", line: "The primary is nearly at its limit, and almost everything it does is answer reads. Can we make more copies of it?" },
      { speaker: "meera", line: "You can copy the data to followers and send reads there. Writes still all go to one place, which is the catch." },
    ],
  },
  predictions: [
    {
      id: "scale-reads",
      kind: "choice",
      prompt: "A primary handles 12,000 reads and 600 writes a second and is overloaded. You add replicas and spread reads across all nodes. Each follower must also replay every write. How many nodes do you need to get the busiest node under 70%?",
      options: [
        { id: "two", label: "2 nodes in total" },
        { id: "three", label: "3 nodes" },
        { id: "five", label: "5 nodes: one primary and four followers" },
        { id: "ten", label: "10 nodes" },
      ],
      answer: "five",
      observe: "read-scaled",
      reveal: {
        text: "Each node handles 4,000 units a second, and a write costs 1 on the primary and half a unit on each follower. With four followers the load per node is (12,000 + 600 + 1,200) ÷ 20,000 = 69%. Each follower adds capacity, but also replays all the writes.",
        derived: true,
        line: { speaker: "rao", line: "Five nodes to serve reads we could not serve on one. Fine, but write capacity did not move." },
      },
    },
  ],
  widget: { id: "repl-lab", config: REPL },
  mechanism: [
    {
      id: "model",
      scene: "reads",
      text: "In leader-follower replication one node, the leader or primary, accepts every write and streams its changes to followers, which replay them in the same order. Followers can answer reads, so read capacity grows with each one. PostgreSQL streaming replication and Aurora readers work this way.",
      sourceIds: ["ddia", "pg-warm-standby", "aurora-replicas"],
    },
    {
      id: "limits",
      scene: "writes",
      text: "It scales reads and not writes. Every write still lands on the single primary and is also replayed on each follower, so adding followers makes each node a little busier with writes, not less. Read-heavy workloads gain a lot; write-heavy ones hit the primary's ceiling.",
      derived: true,
    },
    {
      id: "lag",
      scene: "lag",
      text: "Followers apply changes in order, usually one stream at a time, so they have a maximum replay rate. If writes arrive faster than that, replicas fall behind and lag grows without limit. Watch replication lag as closely as CPU, because stale replicas serve stale answers.",
      sourceIds: ["pg-warm-standby"],
      derived: true,
    },
    {
      id: "other",
      text: "Followers do more than serve reads. They are the hot standby that can be promoted if the primary dies, a place to run reports and backups without disturbing production, and a way to put data near users. Each role has different requirements for how fresh the data must be.",
      sourceIds: ["ddia"],
    },
  ],
  challenges: [
    {
      id: "scale-reads",
      title: "Scale the reads",
      brief: "12,000 reads and 600 writes a second hit one primary. Add read replicas so the busiest node runs under 70%, keeping the cluster at $1,600 a month or less at $300 per node.",
      line: { speaker: "rao", line: "Every replica is $300 a month. I want exactly as many as the arithmetic needs." },
      widget: { id: "repl-lab", config: REPL_CHALLENGE },
      conditions: [
        { metric: "util", op: "<=", value: 0.7, label: "Busiest node at most 70%" },
        { metric: "costPerMonth", op: "<=", value: 1600, label: "At most $1,600 a month" },
      ],
      stars: [{ metric: "followers", op: "<=", value: 4, label: "No more than four followers" }],
      hints: [
        "How busy is each node as you add followers? Watch the busiest-node number.",
        "A write costs more than nothing on every follower. What does that do to the benefit of each new node?",
        "Find the smallest number of followers that gets under 70%, then check the cost.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain leader-follower replication: what it scales, what it does not, and what to watch.",
    rubric: [
      { id: "what", criterion: "One leader takes all writes and ships changes to followers that replay them; reads can go to followers", keyIdea: "writes to one place, reads spread" },
      { id: "limit", criterion: "It scales reads, not writes: every write still hits the leader and is replayed on every follower", keyIdea: "reads scale, writes do not" },
      { id: "lag", criterion: "Followers can fall behind if they cannot replay as fast as writes arrive, so replication lag must be monitored", keyIdea: "watch replication lag" },
    ],
    exemplar:
      "One leader accepts all writes and streams them to followers that replay them in order, so reads can be spread across followers. That scales reads but not writes, because every write still lands on the leader and is also replayed on each follower. Followers can fall behind if writes outpace their replay, so I monitor replication lag, which decides how stale their answers are.",
  },
  reviews: [
    {
      id: "lf-est",
      format: "estimate",
      scenario: "Each node can handle 4,000 simple queries a second. A write costs 1 unit on the primary and 0.5 on each follower. With 1 primary and 3 followers, 12,000 reads and 600 writes a second, what is the load on each node as a percentage of capacity?",
      unit: "%",
      answer: 84,
      acceptFactor: 1.1,
      breakdown: ["Total units = 12,000 + 600 + 0.5 × 600 × 3 = 13,500", "Capacity = 4 × 4,000 = 16,000", "13,500 ÷ 16,000 ≈ 84%"],
      explain: "Adding followers reduces the load but the write replay is paid by every node.",
    },
    {
      id: "lf-pick",
      format: "pick-fix",
      scenario: "A write-heavy service (8,000 writes a second, 1,000 reads) is overloaded on its primary. The team plans to add five read replicas. What will happen?",
      options: [
        { id: "a", label: "Little help: the load is writes, which still land on one primary and are replayed on every replica" },
        { id: "b", label: "Write capacity will grow five times" },
        { id: "c", label: "Reads will become faster for writers" },
        { id: "d", label: "The primary will no longer need disk" },
      ],
      answer: "a",
      explain: "Replicas scale reads. To scale writes you partition the data across several primaries, which is the sharding chapter.",
    },
    {
      id: "lf-pick2",
      format: "pick-fix",
      scenario: "A reporting job that scans large tables slows the production primary every night. What is the standard fix?",
      options: [
        { id: "a", label: "Run the report against a read replica" },
        { id: "b", label: "Run it at the same time on the primary with a higher priority" },
        { id: "c", label: "Cache the report forever" },
        { id: "d", label: "Add an index on every column" },
      ],
      answer: "a",
      explain: "A replica keeps heavy reads off the primary. Remember its data lags a little, and long queries on replicas can also conflict with replay.",
    },
    {
      id: "lf-order",
      format: "order",
      scenario: "Order these workloads by how much they benefit from adding read replicas, most first.",
      items: [
        { id: "read", label: "95% reads, 5% writes" },
        { id: "mixed", label: "70% reads, 30% writes" },
        { id: "write", label: "30% reads, 70% writes" },
        { id: "wo", label: "Writes only" },
      ],
      answer: ["read", "mixed", "write", "wo"],
      explain: "The read share is what spreads out. A write-only workload gains nothing, and it pays for replay on every replica.",
    },
    {
      id: "lf-graph",
      format: "predict-graph",
      scenario: "Add followers one at a time to a cluster serving 12,000 reads and 600 writes a second. How does the load on the busiest node change?",
      xLabel: "followers →",
      yLabel: "busiest node load",
      options: [
        { id: "linear", label: "Falls in proportion to the number of nodes", points: [8, 4, 2.7, 2, 1.6, 1.3, 1.1, 1] },
        { id: "floor", label: "Falls quickly, then levels off at the cost of replaying writes", points: [8, 5, 3.7, 3, 2.7, 2.5, 2.4, 2.35] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "floor",
      explain: "Reads divide across nodes, so load drops, but the write replay is a fixed cost on every node, so it approaches a floor.",
    },
    {
      id: "lf-flaw",
      format: "spot-flaw",
      scenario: "A service runs five followers and reports 'plenty of read capacity' while users see old data. Replicas are 40 seconds behind. Tap the metric nobody was watching.",
      diagram: {
        nodes: [
          { id: "primary", label: "primary", kind: "db", col: 0, row: 1 },
          { id: "lag", label: "replication lag: 40 s, no alert", kind: "external", col: 1, row: 1 },
          { id: "followers", label: "5 followers serving reads", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "primary", to: "lag" },
          { from: "lag", to: "followers" },
        ],
      },
      answer: "lag",
      explain: "Followers with plenty of CPU can still be badly behind. Alert on replication lag and decide what staleness each read can tolerate.",
    },
    {
      id: "lf-explain",
      format: "explain",
      scenario: "In two sentences: why does adding replicas not raise write capacity?",
      rubric: [
        { id: "single", criterion: "All writes must go through the single leader, which sets the order" },
        { id: "replay", criterion: "Each follower must replay every write too, so writes add load to every node" },
      ],
      exemplar: "Every write still has to go through the one leader, which fixes the order of changes. Each follower then replays all of those writes, so writes add work to every node instead of being shared.",
      explain: "Replication copies; it does not divide.",
    },
  ],
  codex: {
    oneLiner: "One leader takes all writes and streams them to followers. Reads scale with followers; writes do not. Watch replication lag.",
    keyNumbers: [
      { label: "Write capacity", value: "unchanged by adding followers", sourceId: "ddia" },
      { label: "Streaming replication", value: "WAL shipped to standbys", sourceId: "pg-warm-standby" },
    ],
    tradeoffs: [
      { choice: "Read replicas", gain: "More read capacity, a hot standby, a place for reports", cost: "Stale reads, lag to monitor, and every write replayed everywhere" },
      { choice: "Shared-storage readers (Aurora)", gain: "Very small lag, fast to add", cost: "Tied to the vendor's storage layer" },
    ],
    seenIn: ["RDS read replicas and Aurora reader endpoints.", "Postgres streaming replication with hot standby."],
    interviewAngle: "Say what replicas do and do not do: 'read replicas to scale reads and for failover; for write scale I would shard.'",
    aws: [{ concept: "Read replicas", service: "Amazon RDS read replicas; Aurora readers" }],
    replay: { id: "repl-lab", config: { ...REPL, start: { followers: 3 } }, scene: "reads" },
  },
  interview: [
    "How do read replicas help, and what do they not help with?",
    "What can go wrong when reading from a follower?",
    "How would you scale a write-heavy database?",
  ],
  deeper: [
    {
      title: "Statement-based, logical, and physical replication",
      body: "Followers can receive different things: the SQL statements (simple but nondeterministic functions break it), the changed rows (logical replication, flexible across versions), or the exact storage-level log (physical, byte-for-byte copies). Physical replication gives identical replicas and the least overhead, while logical lets you replicate a subset or upgrade across versions. Which you use shapes lag, compatibility, and what a replica can do.",
      sourceIds: ["pg-warm-standby"],
    },
  ],
  honestPhysics: [
    "Each node handles 4,000 simple queries a second. A write costs 1 unit on the primary and 0.5 on each follower, and reads spread evenly over all nodes. Round figures for a modest instance.",
    "Followers apply changes at about 6,000 writes a second, one stream at a time. Real replay rates depend on the workload and version.",
    "Nodes cost $300 a month in the lab. Aurora-style shared storage changes the replay arithmetic.",
  ],
  sources: [DDIA, PG_STANDBY, AURORA_REPL],
  verify: [
    { id: "one", claim: "A single node is far over capacity for 12,000 reads and 600 writes a second", run: "lab", params: { model: "repl-lab", config: REPL_CHALLENGE, values: { followers: 0 }, metric: "util" }, expect: { min: 2 } },
    { id: "three", claim: "Three followers leave the busiest node above 70%", run: "lab", params: { model: "repl-lab", config: REPL_CHALLENGE, values: { followers: 3 }, metric: "util" }, expect: { min: 0.7 } },
    { id: "four", claim: "Four followers get it to 69%", run: "lab", params: { model: "repl-lab", config: REPL_CHALLENGE, values: { followers: 4 }, metric: "util" }, expect: { max: 0.7 } },
    { id: "five-cost", claim: "Five followers break the cost cap", run: "lab", params: { model: "repl-lab", config: REPL_CHALLENGE, values: { followers: 5 }, metric: "costPerMonth" }, expect: { min: 1601 } },
    { id: "wall", claim: "At 9,000 writes a second replicas fall behind by many seconds", run: "lab", params: { model: "repl-lab", config: REPL, values: { followers: 4, writes: 9000 }, metric: "lagSeconds" }, expect: { min: 20 } },
  ],
});
