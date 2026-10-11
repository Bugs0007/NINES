import { defineBoss } from "../define";

export const KVC = {};

const DYNAMO = { id: "dynamo", title: "DeCandia et al. (2007), Dynamo: Amazon's highly available key-value store", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf" };
const LSM = { id: "lsm-tree", title: "O'Neil et al. (1996), The log-structured merge-tree (LSM-tree)", url: "https://www.cs.umb.edu/~poneil/lsmtree.pdf" };
const KARGER = { id: "consistent-hashing", title: "Karger et al. (1997), Consistent hashing and random trees", url: "https://dl.acm.org/doi/10.1145/258533.258660" };

export default defineBoss({
  id: "case-kv-store",
  title: "Case: Distributed KV Store",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "pager",
    alert: { severity: "info", title: "interview · 'Design a distributed key-value store'", detail: "12 nodes today, one node failing a month, writes must not be lost" },
    lines: [{ speaker: "kabir", line: "Twelve nodes, a node dying every month, and customers who notice a stale read. Walk me through placement, replication and the storage engine." }],
  },
  intro: [
    { speaker: "meera", line: "Every choice here has a price in movement, consistency or speed. Decide which you are paying." },
    { speaker: "rao", line: "Adding the thirteenth node should not move most of the data. Losing one should not stop writes." },
  ],
  forecast: {
    metric: "movedOnAdd",
    prompt: "With hash-mod-N placement, what share of keys move when you add a thirteenth node to twelve?",
    unit: "%",
    scale: 100,
    min: 1,
    max: 100,
    tolerance: 1.3,
  },
  exercises: ["consistent-hashing", "leaderless-quorums", "rebalancing", "lsm-vs-btree"],
  challenge: {
    id: "design-kv",
    title: "Design the store",
    brief: "Move at most 10% of keys when adding a node, keep the busiest partition within 1.3× the average, fail no writes when a node is down, return no stale reads, and sustain 150,000 writes a second.",
    line: { speaker: "rao", line: "Placement, replication, quorums and the engine each answer one of these." },
    widget: { id: "kvstore-lab", config: KVC },
    conditions: [
      { metric: "movedOnAdd", op: "<=", value: 0.1, label: "At most 10% of keys move on adding a node" },
      { metric: "hotSkew", op: "<=", value: 1.3, label: "Busiest partition within 1.3× the average" },
      { metric: "writeFailNodeDown", op: "<=", value: 0.01, label: "Under 1% of writes fail with a node down" },
      { metric: "staleRead", op: "<=", value: 0.01, label: "Under 1% stale reads" },
      { metric: "writeKops", op: ">=", value: 150, label: "At least 150,000 writes a second" },
    ],
    stars: [{ metric: "writeKops", op: ">=", value: 200, label: "At least 200,000 writes a second" }],
    hints: ["What does mod N do when N changes?", "When does R + W exceed the replication factor?", "What does each copy cost in write throughput?"],
  },
  debrief: [
    { id: "place", text: "Consistent hashing moved 1 key in 13 where hash-mod-N moved 12 in 13, and spread sequential keys evenly where ranges piled them on one node. Virtual nodes smooth the ring so each machine takes a fair share.", sourceIds: ["consistent-hashing", "dynamo"] },
    { id: "quorum", text: "With three replicas and majority reads and writes, R + W = 4 > 3, so every read overlaps the latest write, and one node can fail without failing a write. Weak settings read stale about a third of the time; waiting for all replicas fails when any one is down.", sourceIds: ["dynamo"] },
    { id: "engine", text: "A log-structured engine turns random writes into sequential ones, three times a B-tree's rate here, and divides across three replicas to 218,000 a second. A B-tree reads faster and would need more nodes for the same writes.", sourceIds: ["lsm-tree"] },
  ],
  outro: { speaker: "kabir", line: "Ring, three replicas, majority quorums, LSM. I can defend every one of those with a number." },
  explainBack: {
    prompt: "Walk through your key-value store: placement, replication, consistency and the engine, with the trade-offs.",
    rubric: [
      { id: "place", criterion: "Consistent hashing with virtual nodes moves about 1/N of the keys on a membership change and avoids hot ranges, unlike hash-mod-N or ranges", keyIdea: "consistent hashing" },
      { id: "quorum", criterion: "Replication factor 3 with R and W as majorities gives R + W > N, so reads see the latest write and one node can fail", keyIdea: "quorums" },
      { id: "engine", criterion: "An LSM tree favours writes by appending; a B-tree favours reads; throughput divides by the replication factor", keyIdea: "engine choice" },
      { id: "tradeoff", criterion: "Names the costs: higher latency for quorums, read amplification and compaction for LSM, and more storage for replicas", keyIdea: "what each choice costs" },
    ],
    exemplar:
      "I would place keys with consistent hashing and virtual nodes, so adding a node moves about one key in thirteen instead of twelve in thirteen, and sequential keys spread evenly. Each key has three replicas with majority read and write quorums, so R plus W exceeds N, reads see the latest write and one node can fail without failing writes. I would use an LSM engine for write throughput, about 218,000 a second across twelve nodes, accepting read amplification and compaction work, and that every write costs three copies.",
  },
  honestPhysics: [
    "Twelve nodes. Adding a thirteenth moves 12 ÷ 13 of keys under hash-mod-N and 1 ÷ 13 under consistent hashing. Range partitioning concentrates sequential keys (3× the average load) where hashing spreads them (1.1×).",
    "Reads see the latest write when R + W > rf. Weak settings read stale about a third of the time after a write. Waiting for every replica fails writes for the share rf ÷ 12 of keys with one node down. A log-structured engine writes 60,000 a second per node, a B-tree 20,000, divided by the replication factor and the skew. Round figures.",
  ],
  sources: [DYNAMO, LSM, KARGER],
  verify: [
    { id: "forecast", claim: "Hash-mod-N moves 92% of keys when a thirteenth node joins", run: "lab", params: { model: "kvstore-lab", config: KVC, values: {}, metric: "movedOnAdd" }, expect: { min: 0.92, max: 0.93 } },
    { id: "ring", claim: "Consistent hashing moves 7.7%", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { part: "ring" }, metric: "movedOnAdd" }, expect: { min: 0.076, max: 0.078 } },
    { id: "range-skew", claim: "Range partitioning gives the busiest partition 3× the average", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { part: "range" }, metric: "hotSkew" }, expect: { min: 3, max: 3 } },
    { id: "weak", claim: "R = W = 1 reads stale about a third of the time", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { rf: "3", quorum: "weak" }, metric: "staleRead" }, expect: { min: 0.32, max: 0.34 } },
    { id: "all", claim: "Writing to all three replicas fails a quarter of writes when a node is down", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { rf: "3", quorum: "readone" }, metric: "writeFailNodeDown" }, expect: { min: 0.24, max: 0.26 } },
    { id: "good", claim: "Ring, three replicas, majority quorums and LSM sustain 218,000 writes a second", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { part: "ring", rf: "3", quorum: "quorum", engine: "lsm" }, metric: "writeKops" }, expect: { min: 215, max: 220 } },
    { id: "btree", claim: "A B-tree manages 73,000", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { part: "ring", rf: "3", quorum: "quorum", engine: "btree" }, metric: "writeKops" }, expect: { min: 70, max: 76 } },
    { id: "rf5", claim: "Five replicas fall short of 150,000", run: "lab", params: { model: "kvstore-lab", config: KVC, values: { part: "ring", rf: "5", quorum: "quorum", engine: "lsm" }, metric: "writeKops" }, expect: { max: 150 } },
  ],
});
