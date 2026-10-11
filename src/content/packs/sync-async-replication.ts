import { definePack } from "../define";

export const SYNC = { lockRtt: false, writes: 2000, start: { required: "0", rtt: 80 } };
export const SYNC_CHALLENGE = { lockRtt: true, rtt: 80, writes: 2000, start: { required: "2" } };

const PG_SYNC = { id: "pg-sync-repl", title: "PostgreSQL docs: Synchronous Replication (synchronous_commit, standby names, quorum commit)", url: "https://www.postgresql.org/docs/current/warm-standby.html#SYNCHRONOUS-REPLICATION" };
const MYSQL_SEMI = { id: "mysql-semisync", title: "MySQL docs: Semisynchronous Replication (the source waits for at least one replica to acknowledge)", url: "https://dev.mysql.com/doc/refman/8.0/en/replication-semisync.html" };
const RDS_MULTIAZ = { id: "rds-multi-az", title: "AWS docs: Multi-AZ deployments for Amazon RDS (synchronous standby in another zone)", url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5: Synchronous versus asynchronous replication", url: "https://dataintensive.net/" };

export default definePack({
  id: "sync-async-replication",
  title: "Sync vs Async Replication",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "primary failed over · 42 acknowledged writes missing", detail: "the new primary was behind" },
    lines: [
      { speaker: "pager", line: "The primary's zone died and a replica took over. Forty-two orders that customers were told succeeded are not in the new primary." },
      { speaker: "meera", line: "Asynchronous replication tells the user yes before the copy exists. That gap is the data you lose when the primary dies." },
    ],
  },
  predictions: [
    {
      id: "wait-remote",
      kind: "choice",
      prompt: "A primary will not acknowledge a commit until a replica in another region, 80 ms away, has the write. How long does each commit take?",
      options: [
        { id: "same", label: "About 3 ms, the same as local" },
        { id: "eighty", label: "About 83 ms: the local write plus a round trip to the remote region" },
        { id: "half", label: "About 40 ms" },
        { id: "second", label: "About a second" },
      ],
      answer: "eighty",
      observe: "sync-slow",
      reveal: {
        text: "The commit returns only after the remote replica confirms, so it pays the round trip: 3 ms of local work plus the 80 ms to the other region. Every write in the system is that slow, and writes stall entirely if the remote replica is unreachable.",
        derived: true,
        line: { speaker: "meera", line: "Distance is a latency tax on durability." },
      },
    },
  ],
  widget: { id: "sync-lab", config: SYNC },
  mechanism: [
    {
      id: "async",
      scene: "async",
      text: "Asynchronous replication acknowledges the commit as soon as the primary has the write and sends it to replicas afterwards. It is fast and keeps working if replicas are down, but writes still in flight when the primary dies are lost to any replica that takes over, a window set by replication lag.",
      sourceIds: ["ddia"],
    },
    {
      id: "sync",
      scene: "sync",
      text: "Synchronous replication waits for replicas to confirm before acknowledging, so an acknowledged write exists on more than one machine. The commit now takes the slowest required round trip, and if a required replica is down, writes block until it returns or is removed from the requirement.",
      sourceIds: ["pg-sync-repl", "ddia"],
    },
    {
      id: "semi",
      scene: "semi",
      text: "Semi-synchronous replication is the compromise: require acknowledgement from one replica, usually a nearby one in another availability zone, and let the rest follow asynchronously. A zone failure loses nothing and commits stay quick, while a regional disaster can still lose the writes the remote copy had not received. RDS Multi-AZ and MySQL semi-sync follow this pattern.",
      sourceIds: ["mysql-semisync", "rds-multi-az"],
    },
    {
      id: "rpo",
      text: "The decision is about the recovery point objective: how much acknowledged data you can afford to lose in each kind of failure. Pick the replication mode per failure domain, a zone and a region, and say what each costs in commit latency.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "rpo",
      title: "Set the commit rule",
      brief: "A primary with a replica in another zone (1 ms away) and one in another region (80 ms away), handling 2,000 writes a second. Commits must take at most 10 ms, no acknowledged write may be lost if the primary's zone fails, and a regional disaster may lose at most 250 writes.",
      line: { speaker: "kabir", line: "Region failures are rare and zone failures are not, so I want to be safe for the one that happens." },
      widget: { id: "sync-lab", config: SYNC_CHALLENGE },
      conditions: [
        { metric: "commitMs", op: "<=", value: 10, label: "Commits at most 10 ms" },
        { metric: "lostAzWrites", op: "<=", value: 0, label: "No writes lost if the zone fails" },
        { metric: "lostRegionWrites", op: "<=", value: 250, label: "At most 250 writes lost in a regional disaster" },
      ],
      stars: [{ metric: "commitMs", op: "<=", value: 4, label: "Commits at most 4 ms" }],
      hints: [
        "What does requiring both replicas do to the commit time?",
        "What do you lose in each failure if you require none?",
        "Which single replica gives zone safety without the long round trip?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare synchronous, asynchronous, and semi-synchronous replication in terms of latency, data loss, and availability.",
    rubric: [
      { id: "async", criterion: "Asynchronous is fast and available, but acknowledged writes can be lost on failover", keyIdea: "fast, may lose data" },
      { id: "sync", criterion: "Synchronous waits for replicas, so no acknowledged loss, but commit latency includes the round trip and writes stall if a replica is down", keyIdea: "durable, slower, less available" },
      { id: "semi", criterion: "Semi-synchronous requires one nearby replica, balancing the two; choose per failure domain based on the data you can afford to lose", keyIdea: "one nearby replica" },
    ],
    exemplar:
      "Asynchronous replication acknowledges after the primary alone has the write, which is fast and keeps working when replicas are down, but acknowledged writes can be lost on failover. Synchronous replication waits for replicas, so nothing acknowledged is lost, but commits pay the round trip and writes stall if a required replica is down. Semi-synchronous requires one nearby replica, which protects against a zone failure at low cost; I choose per failure domain by how much data I can afford to lose.",
  },
  reviews: [
    {
      id: "sa-est",
      format: "estimate",
      scenario: "A system takes 2,000 writes a second, and its async replica trails by about 100 ms. If the primary dies, about how many acknowledged writes are missing from the replica?",
      unit: "writes",
      answer: 200,
      acceptFactor: 1.2,
      breakdown: ["2,000 writes/s × 0.1 s", "= 200 writes"],
      explain: "Writes lost on failover are the write rate times the replication lag.",
    },
    {
      id: "sa-pick",
      format: "pick-fix",
      scenario: "A payment service must never lose an acknowledged payment if a zone fails, but cannot tolerate 80 ms commits to another region. Which design fits?",
      options: [
        { id: "a", label: "Synchronous replication to a replica in another zone of the same region, and async to the remote region" },
        { id: "b", label: "Fully asynchronous replication everywhere" },
        { id: "c", label: "Synchronous replication to the remote region only" },
        { id: "d", label: "No replicas" },
      ],
      answer: "a",
      explain: "A same-region second zone is a millisecond away, so it gives zone-level safety cheaply. The remote region follows asynchronously for disaster recovery.",
    },
    {
      id: "sa-order",
      format: "order",
      scenario: "Order these setups by commit latency, fastest first, with a remote replica 80 ms away.",
      items: [
        { id: "async", label: "Asynchronous" },
        { id: "semi", label: "Synchronous to a nearby-zone replica" },
        { id: "both", label: "Synchronous to a nearby-zone and a remote replica" },
      ],
      answer: ["async", "semi", "both"],
      explain: "Each required replica adds its round trip, and the slowest one sets the time.",
    },
    {
      id: "sa-graph",
      format: "predict-graph",
      scenario: "Require synchronous acknowledgement from a remote replica, and increase its distance from 5 ms to 250 ms. How does commit latency change?",
      xLabel: "distance to the replica →",
      yLabel: "commit latency",
      options: [
        { id: "flat", label: "Flat", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "linear", label: "Rises one-for-one with the round trip", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "log", label: "Rises slowly", points: [1, 2, 2.6, 3, 3.3, 3.5, 3.7, 3.8] },
        { id: "hockey", label: "Flat, then shoots up", points: [1, 1, 1, 1.2, 1.6, 2.6, 5, 12] },
      ],
      answer: "linear",
      explain: "The commit waits a whole round trip, so latency grows in step with distance. That is why cross-region synchronous replication is rare.",
    },
    {
      id: "sa-flaw",
      format: "spot-flaw",
      scenario: "A service requires synchronous acknowledgement from both of its replicas. One replica's host is rebooted for patching and the application stops accepting writes for ten minutes. Tap the design choice.",
      diagram: {
        nodes: [
          { id: "app", label: "app", kind: "server", col: 0, row: 1 },
          { id: "primary", label: "primary · commit needs both replicas", kind: "db", col: 1, row: 1 },
          { id: "r2", label: "replica 2 · rebooting", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "app", to: "primary" },
          { from: "primary", to: "r2" },
        ],
      },
      answer: "primary->r2",
      explain: "Requiring every replica makes any one of them a single point of failure for writes. Require one acknowledgement out of several (a quorum) so a single replica can be down.",
    },
    {
      id: "sa-explain",
      format: "explain",
      scenario: "In two sentences: why can an acknowledged write be lost with asynchronous replication?",
      rubric: [
        { id: "ack", criterion: "The primary acknowledges before replicas have the write" },
        { id: "fail", criterion: "If the primary fails before the write is replicated, the promoted replica never has it" },
      ],
      exemplar: "The primary tells the client the write succeeded before any replica has it. If the primary dies before replication catches up, the replica that takes over never received it.",
      explain: "Yes was said before the copy existed.",
    },
  ],
  codex: {
    oneLiner: "Async acks before the copy exists: fast but lossy on failover. Sync waits for replicas: durable but slower and less available. Semi-sync requires one nearby.",
    keyNumbers: [
      { label: "Writes lost on failover (async)", value: "write rate × replication lag", sourceId: "ddia" },
      { label: "Commit latency (sync)", value: "local time + slowest required round trip", sourceId: "pg-sync-repl" },
      { label: "RDS Multi-AZ", value: "synchronous standby in a second zone", sourceId: "rds-multi-az" },
    ],
    tradeoffs: [
      { choice: "Asynchronous", gain: "Lowest latency; unaffected by replica outages", cost: "Acknowledged writes can be lost on failover" },
      { choice: "Synchronous to one nearby replica", gain: "Zone-failure safety at about a millisecond", cost: "A regional disaster can still lose data" },
      { choice: "Synchronous to all", gain: "No acknowledged loss anywhere", cost: "Slowest replica sets commit time; one outage blocks writes" },
    ],
    seenIn: ["RDS Multi-AZ and Aurora's quorum writes.", "synchronous_commit and synchronous_standby_names in Postgres."],
    interviewAngle: "Frame it as RPO per failure domain: 'synchronous within a region for zone safety, asynchronous across regions, with the data-loss window stated.'",
    aws: [{ concept: "Synchronous standby", service: "Amazon RDS Multi-AZ; Aurora (writes acknowledged by a storage quorum)" }],
    replay: { id: "sync-lab", config: SYNC, scene: "semi" },
  },
  interview: [
    "What is the difference between synchronous and asynchronous replication?",
    "What data can you lose with asynchronous replication, and how would you estimate it?",
    "Why not make every replica synchronous?",
  ],
  deeper: [
    {
      title: "Quorum commit",
      body: "Instead of naming specific replicas, many systems require acknowledgement from any k of n replicas. Postgres supports FIRST k and ANY k lists in synchronous_standby_names, and consensus systems require a majority. A quorum keeps durability across several machines while letting a minority be slow or down, which is the compromise between waiting for one and waiting for all.",
      sourceIds: ["pg-sync-repl"],
    },
  ],
  honestPhysics: [
    "A primary with one replica in another zone (1 ms away) and one in another region (80 ms away by default). A commit costs 3 ms locally plus the slowest required round trip.",
    "An unrequired replica trails by its round trip plus 20 ms of apply time; the lab counts writes in flight as write rate × that lag.",
    "If a required replica is down, writes block. The lab shows that as a flag, not a duration.",
  ],
  sources: [PG_SYNC, MYSQL_SEMI, RDS_MULTIAZ, DDIA],
  verify: [
    { id: "async", claim: "Async loses writes if the zone fails", run: "lab", params: { model: "sync-lab", config: SYNC_CHALLENGE, values: { required: "0" }, metric: "lostAzWrites" }, expect: { min: 1 } },
    { id: "both", claim: "Requiring both replicas makes commits about 83 ms", run: "lab", params: { model: "sync-lab", config: SYNC_CHALLENGE, values: { required: "2" }, metric: "commitMs" }, expect: { min: 80, max: 90 } },
    { id: "semi", claim: "Requiring the nearby replica commits in 4 ms", run: "lab", params: { model: "sync-lab", config: SYNC_CHALLENGE, values: { required: "1" }, metric: "commitMs" }, expect: { max: 4 } },
    { id: "semi-az", claim: "…with no loss if the zone fails", run: "lab", params: { model: "sync-lab", config: SYNC_CHALLENGE, values: { required: "1" }, metric: "lostAzWrites" }, expect: { max: 0 } },
    { id: "semi-region", claim: "…and under 250 writes lost in a regional disaster", run: "lab", params: { model: "sync-lab", config: SYNC_CHALLENGE, values: { required: "1" }, metric: "lostRegionWrites" }, expect: { max: 250 } },
  ],
});
