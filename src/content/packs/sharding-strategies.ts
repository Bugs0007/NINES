import { definePack } from "../define";

export const SHARD = { lockWorkload: false, start: { strategy: "compound", workload: "timeseries" } };
export const SHARD_CHALLENGE = { lockWorkload: true, start: { strategy: "range", workload: "timeseries", shards: 8 } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 6: Partitioning (by key range, by hash of key)", url: "https://dataintensive.net/" };
const MONGO = { id: "mongo-sharding", title: "MongoDB docs: Hashed sharding and ranged sharding (monotonically increasing keys)", url: "https://www.mongodb.com/docs/manual/core/hashed-sharding/" };
const DYNAMO_KEY = { id: "dynamodb-keys", title: "AWS docs: Best practices for designing and using partition keys effectively", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html" };

export default definePack({
  id: "sharding-strategies",
  title: "Sharding Strategies",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "readings-db · shard 8 at 100% CPU", detail: "shards 1 to 7 idle, p99 write 4 s" },
    lines: [
      { speaker: "kabir", line: "We split the sensor table across eight machines by time range. Seven of them are asleep and the eighth is on fire." },
      { speaker: "meera", line: "Every new reading has the newest timestamp. Splitting by it sends all the writes to one place." },
    ],
  },
  predictions: [
    {
      id: "range-writes",
      kind: "choice",
      prompt: "Sensor readings arrive in time order, and the table is split into eight shards by timestamp range. About what share of new writes hits the busiest shard?",
      options: [
        { id: "eighth", label: "About an eighth, 12.5%" },
        { id: "quarter", label: "About a quarter" },
        { id: "half", label: "About half" },
        { id: "all", label: "Nearly all of them" },
      ],
      answer: "all",
      observe: "hot-tail",
      reveal: {
        text: "The newest range owns every timestamp from now on, so every new reading lands on its shard. The other seven hold history, which is read but never written. One machine does the work of eight.",
        derived: true,
        line: { speaker: "meera", line: "Ranges keep neighbours together. When the neighbours all arrive at once, that is the problem." },
      },
    },
    {
      id: "hash-reads",
      kind: "choice",
      prompt: "You switch to hashing the whole key, so writes spread evenly. How many of the eight shards must one device's 'last hour' query ask?",
      options: [
        { id: "one", label: "One: that device's data is together" },
        { id: "two", label: "Two" },
        { id: "all", label: "All eight: its readings are scattered by the hash" },
      ],
      answer: "all",
      observe: "scattered",
      reveal: {
        text: "A hash of the device and timestamp sends neighbouring readings to unrelated shards, so a range query has to ask every shard and merge the answers. Hashing buys even writes and pays for it in range scans.",
        derived: true,
        line: { speaker: "kabir", line: "So the cure for the hot shard breaks the dashboard." },
      },
    },
  ],
  widget: { id: "shard-lab", config: SHARD },
  mechanism: [
    {
      id: "why",
      text: "Sharding splits one table across machines so no single machine holds all the data or takes all the writes. The scheme that decides which row goes where is the whole design: it sets how evenly writes spread and which queries stay on one shard.",
      sourceIds: ["ddia"],
    },
    {
      id: "range",
      scene: "range",
      text: "Range sharding gives each shard a contiguous slice of keys. Neighbours stay together, so range scans are cheap. But if keys grow over time, such as timestamps or auto-increment ids, every new write lands in the last range and one shard takes them all.",
      sourceIds: ["ddia", "mongo-sharding"],
    },
    {
      id: "hash",
      scene: "hash",
      text: "Hash sharding applies a hash to the key and uses the result to pick a shard. Writes spread evenly whatever the key looks like. The price is that neighbouring keys are scattered, so a range query must ask every shard.",
      sourceIds: ["ddia", "mongo-sharding"],
    },
    {
      id: "compound",
      scene: "compound",
      text: "A compound key takes both. Hash the first part, such as the device id, to pick the shard, then order by the second part, the timestamp, inside it. Writes spread by device, and one device's time range stays together on one shard.",
      sourceIds: ["ddia", "dynamodb-keys"],
    },
  ],
  challenges: [
    {
      id: "time-series",
      title: "Spread the sensor writes",
      brief: "Eight shards, sensor readings arriving in time order. Choose the scheme so no shard takes more than 20% of writes, one device's last hour comes from a single shard, and you add no directory service.",
      line: { speaker: "rao", line: "Every extra service is another pager. Make the key do the work." },
      widget: { id: "shard-lab", config: SHARD_CHALLENGE },
      conditions: [
        { metric: "maxShare", op: "<=", value: 0.2, label: "No shard takes over 20% of writes" },
        { metric: "deviceRangeFanout", op: "<=", value: 1, label: "One device's last hour reads one shard" },
        { metric: "metaCost", op: "<=", value: 1, label: "No directory service" },
      ],
      stars: [],
      hints: [
        "Which schemes spread time-ordered writes evenly?",
        "Which of those keep one device's readings together?",
        "A directory solves both but adds a service that every request depends on.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare range, hash, and compound sharding for a time-series table, and say which you would choose.",
    rubric: [
      { id: "range", criterion: "Range sharding keeps neighbours together but puts all new time-ordered writes on the last shard", keyIdea: "hot tail" },
      { id: "hash", criterion: "Hash sharding spreads writes evenly but scatters ranges so range queries touch every shard", keyIdea: "scatter" },
      { id: "compound", criterion: "A compound key hashes one part to pick the shard and orders by another inside it, giving both", keyIdea: "hash then range" },
    ],
    exemplar:
      "Range sharding by timestamp sends every new write to the last range, so one shard does all the work. Hashing the whole key spreads writes evenly but scatters one device's readings, so range queries ask every shard. I would use a compound key: hash the device id to pick the shard and order by time inside it, so writes spread across devices and each device's recent readings stay together.",
  },
  reviews: [
    {
      id: "ss-est",
      format: "estimate",
      scenario: "A table is hash-sharded across 16 shards and a dashboard query needs data from every device in the last hour. How many shards does the query contact?",
      unit: "shards",
      answer: 16,
      acceptFactor: 1.05,
      breakdown: ["Hashing scatters neighbours", "the query has no shard key to narrow on", "all 16"],
      explain: "Without the shard key in the query, there is nothing to route on, so the query goes to every shard and merges.",
    },
    {
      id: "ss-pick",
      format: "pick-fix",
      scenario: "A table is range-sharded by an auto-increment id, and the newest shard is always the busiest. What is the smallest change that spreads the writes?",
      options: [
        { id: "a", label: "Shard by a hash of the id (or a compound key)" },
        { id: "b", label: "Add more shards on the end" },
        { id: "c", label: "Make the newest shard's machine bigger" },
        { id: "d", label: "Add a read replica to the newest shard" },
      ],
      answer: "a",
      explain: "More shards on the end just move the hot tail. Hashing the key breaks the link between arrival order and shard.",
    },
    {
      id: "ss-order",
      format: "order",
      scenario: "Order these schemes by how many shards a 'one device, last hour' query touches on a time-series table, most first.",
      items: [
        { id: "hash", label: "Hash of device and timestamp" },
        { id: "dir", label: "Directory with a few shards per device" },
        { id: "comp", label: "Hash of device, ordered by time" },
      ],
      answer: ["hash", "dir", "comp"],
      explain: "Hashing the whole key scatters one device across all shards. A directory can place a device on a few. A compound key keeps it on one.",
    },
    {
      id: "ss-graph",
      format: "predict-graph",
      scenario: "A time-series table is range-sharded by timestamp. As you add shards from 2 to 32, how does the share of writes landing on the busiest shard change?",
      xLabel: "shards →",
      yLabel: "busiest shard's share of writes",
      options: [
        { id: "flat", label: "Stays at 100%: only the newest range takes writes", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "fall", label: "Falls as 1 ÷ shards", points: [50, 25, 12.5, 8, 6, 4, 3, 2] },
        { id: "rise", label: "Rises", points: [10, 20, 30, 40, 50, 60, 70, 80] },
      ],
      answer: "flat",
      explain: "Adding shards to a range-sharded table of increasing keys just adds idle history. The newest range still takes everything.",
    },
    {
      id: "ss-flaw",
      format: "spot-flaw",
      scenario: "A team shards an orders table by order date to make daily reports fast. During a sale, one shard saturates. Tap the step where the design goes wrong.",
      diagram: {
        nodes: [
          { id: "order", label: "new order", kind: "client", col: 0, row: 1 },
          { id: "route", label: "route by order date", kind: "lb", col: 1, row: 1 },
          { id: "today", label: "today's shard", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "order", to: "route" },
          { from: "route", to: "today" },
        ],
      },
      answer: "route->today",
      explain: "Every order today has today's date, so the router sends all writes to one shard. The choice that made reports fast made writes hot.",
    },
    {
      id: "ss-explain",
      format: "explain",
      scenario: "In two sentences: why would you ever choose range sharding over hash sharding?",
      rubric: [
        { id: "scan", criterion: "Range sharding keeps neighbouring keys together, so range scans and ordered reads hit few shards" },
        { id: "keys", criterion: "It works well when writes are spread across the key space rather than arriving in key order" },
      ],
      exemplar: "Range sharding keeps neighbouring keys on one shard, so scans and ordered queries are cheap. It is the right choice when writes arrive spread across the key space instead of piling onto its newest end.",
      explain: "Pick the scheme that matches both the writes and the reads.",
    },
  ],
  codex: {
    oneLiner: "Range keeps neighbours together but heats the newest end. Hash spreads writes but scatters ranges. A compound key hashes one part, orders the other.",
    keyNumbers: [
      { label: "Writes on the busiest shard, range-sharded increasing key", value: "all of them", sourceId: "mongo-sharding" },
      { label: "Shards a keyless query contacts", value: "all of them", sourceId: "ddia" },
    ],
    tradeoffs: [
      { choice: "Range", gain: "Cheap range scans and ordered reads", cost: "Hot tail for time-ordered or sequential keys" },
      { choice: "Hash", gain: "Even writes whatever the key", cost: "Range queries ask every shard" },
      { choice: "Compound", gain: "Even writes and per-entity ranges on one shard", cost: "Queries across entities still fan out" },
      { choice: "Directory", gain: "Place any key anywhere, rebalance freely", cost: "A lookup service on every request's path" },
    ],
    seenIn: ["DynamoDB and Cassandra partition and sort keys.", "MongoDB hashed versus ranged shard keys."],
    interviewAngle: "Say which queries you must keep on one shard, then pick the key: 'hash the entity, sort by time inside it'.",
    aws: [{ concept: "Partition key and sort key", service: "DynamoDB" }],
    replay: { id: "shard-lab", config: { lockWorkload: false, start: { strategy: "compound", workload: "timeseries" } }, scene: "compound" },
  },
  interview: [
    "How would you shard a table of time-ordered events?",
    "What are the trade-offs between range and hash sharding?",
    "What is a compound shard key and when does it help?",
  ],
  deeper: [
    {
      title: "Cross-shard queries",
      body: "Once data is sharded, any query that does not include the shard key has to ask every shard and merge the answers, which is slower and fails more often as shards are added. Joins across shards are worse. Good shard design starts from the queries that must be fast and makes sure they carry the key.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "Eight shards by default. Sensor readings arrive in timestamp order; user records have keys spread evenly. Shares are exact for these idealised workloads.",
    "A 'last hour' query for one device is one shard when the device id picks the shard, and all shards when a hash covers the timestamp as well.",
    "A directory is modelled as two shards per device and an extra service to run, with the lookup itself not simulated.",
  ],
  sources: [DDIA, MONGO, DYNAMO_KEY],
  verify: [
    { id: "range-hot", claim: "Range sharding on a time-ordered key puts all writes on one shard", run: "lab", params: { model: "shard-lab", config: SHARD_CHALLENGE, values: { strategy: "range" }, metric: "maxShare" }, expect: { min: 0.99 } },
    { id: "hash-scatter", claim: "Hashing the whole key sends a device's last hour to all eight shards", run: "lab", params: { model: "shard-lab", config: SHARD_CHALLENGE, values: { strategy: "hash" }, metric: "deviceRangeFanout" }, expect: { min: 8 } },
    { id: "compound-even", claim: "A compound key spreads writes evenly", run: "lab", params: { model: "shard-lab", config: SHARD_CHALLENGE, values: { strategy: "compound" }, metric: "maxShare" }, expect: { max: 0.2 } },
    { id: "compound-one", claim: "…and keeps one device's hour on one shard", run: "lab", params: { model: "shard-lab", config: SHARD_CHALLENGE, values: { strategy: "compound" }, metric: "deviceRangeFanout" }, expect: { max: 1 } },
    { id: "directory", claim: "A directory adds a service to run", run: "lab", params: { model: "shard-lab", config: SHARD_CHALLENGE, values: { strategy: "directory" }, metric: "metaCost" }, expect: { min: 2 } },
  ],
});
