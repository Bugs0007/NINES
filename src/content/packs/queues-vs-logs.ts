import { definePack } from "../define";

export const QL = { start: { engine: "log", partitions: 8, retention: 1, ordered: false } };
export const QL_CHALLENGE = {};

const KAFKA = { id: "kafka-intro", title: "Apache Kafka docs: Introduction (topics, partitions, consumer groups, retention)", url: "https://kafka.apache.org/documentation/#intro_concepts_and_terms" };
const SQS_TYPES = { id: "sqs-queue-types", title: "AWS docs: Amazon SQS queue types (standard and FIFO)", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html" };
const SQS_QUOTAS = { id: "sqs-quotas", title: "AWS docs: Amazon SQS message quotas (FIFO throughput, retention up to 14 days)", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html" };
const KREPS = { id: "kreps-log", title: "J. Kreps (2013), The Log: What every software engineer should know about real-time data's unifying abstraction", url: "https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying" };

export default definePack({
  id: "queues-vs-logs",
  title: "Queues vs Logs (SQS vs Kafka)",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "analytics · missing 2 days of events", detail: "a bug in the consumer, messages already deleted" },
    lines: [
      { speaker: "kabir", line: "The analytics consumer had a bug for two days. We fixed it, but the queue deleted every message once it was read, so those two days are gone." },
      { speaker: "meera", line: "A queue forgets what it delivered. A log remembers it, so a fixed consumer can go back and read it again." },
    ],
  },
  predictions: [
    {
      id: "fifo",
      kind: "choice",
      prompt: "You need every customer's events in order, on a queue, at 20,000 messages a second. A FIFO queue tops out near 3,000 a second in this lab (with batching). What is the most the queue can process?",
      options: [
        { id: "full", label: "All 20,000: queues scale without limit" },
        { id: "half", label: "About 10,000" },
        { id: "cap", label: "About 3,000" },
        { id: "tiny", label: "About 300" },
      ],
      answer: "cap",
      observe: "queue-limit",
      reveal: {
        text: "Standard queues scale almost without limit but give no order. Ordering needs one place to line messages up, so FIFO queues cap their throughput, around 3,000 messages a second with batching. At 20,000 a second a FIFO queue is about six times too small.",
        derived: true,
        sourceIds: ["sqs-quotas"],
        line: { speaker: "meera", line: "Order is not free. It is paid for in how many things can happen at once." },
      },
    },
    {
      id: "storage",
      kind: "choice",
      prompt: "A log with 24 partitions keeps 20,000 one-kilobyte events a second for 7 days, so it can be replayed. About how much storage does that take?",
      options: [
        { id: "small", label: "About 1.2 TB" },
        { id: "mid", label: "About 12 TB" },
        { id: "big", label: "About 120 TB" },
        { id: "huge", label: "More than a petabyte" },
      ],
      answer: "mid",
      observe: "log-replay",
      reveal: {
        text: "20,000 events × 1 KB × 86,400 seconds is 1.7 TB a day, and seven days is 12 TB. Replay is not free: retention is storage you keep paying for, which is why logs set a retention period and not 'forever' by default.",
        derived: true,
        line: { speaker: "rao", line: "Seven days of rewind is a nice thing to have, and a line on the bill." },
      },
    },
  ],
  widget: { id: "broker-lab", config: QL },
  mechanism: [
    {
      id: "queue",
      scene: "queue",
      text: "A queue hands each message to one consumer and deletes it once acknowledged. Consumers compete, so adding more scales throughput, and idle ones cost nothing. There is no replay, and several systems wanting the same message each need their own queue, usually fed by a fan-out.",
      sourceIds: ["sqs-queue-types"],
    },
    {
      id: "log",
      scene: "log",
      text: "A log appends messages in order and keeps them for a retention period. Consumers track their own position, an offset, so any number of independent groups read the same data at their own pace, and a consumer can rewind to reprocess. Messages are never 'taken'.",
      sourceIds: ["kafka-intro", "kreps-log"],
    },
    {
      id: "partitions",
      scene: "partitions",
      text: "A log is split into partitions. Order holds within a partition, so events for the same key, like one customer, go to the same one. Within a group each partition is read by one consumer, so the partition count is the ceiling on parallelism. Choose it for the throughput you will need.",
      sourceIds: ["kafka-intro"],
    },
    {
      id: "choose",
      text: "Pick a queue for work to be done once: tasks, jobs, emails. Pick a log for facts that many systems consume, that need order per key, or that you may replay: events, changes, audit trails. The queue forgets so you do not have to; the log remembers so you can.",
      sourceIds: ["kreps-log", "sqs-queue-types"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "pick-broker",
      title: "Choose the broker",
      brief: "20,000 events a second must reach billing, search and analytics. Each customer's events must stay in order, and the stream must be replayable for 7 days. Choose the broker and its size, and keep storage under 15 TB.",
      line: { speaker: "kabir", line: "If analytics breaks again I want to rewind, not apologise." },
      widget: { id: "broker-lab", config: QL_CHALLENGE },
      conditions: [
        { metric: "maxRate", op: ">=", value: 20000, label: "Handles 20,000 events a second" },
        { metric: "replayDays", op: ">=", value: 7, label: "Replay for at least 7 days" },
        { metric: "ordered", op: ">=", value: 1, label: "Order kept per customer" },
        { metric: "subscribers", op: ">=", value: 3, label: "Three independent subscribers" },
        { metric: "storageTB", op: "<=", value: 15, label: "Under 15 TB of storage" },
      ],
      stars: [{ metric: "storageTB", op: "<=", value: 12.5, label: "Under 12.5 TB of storage" }],
      hints: [
        "Which broker lets three systems read the same data without three copies?",
        "How many partitions does 20,000 events a second need, at 1,000 a consumer?",
        "Retention drives storage. How long is long enough?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare a queue and a log, and say when you would use each.",
    rubric: [
      { id: "queue", criterion: "A queue deletes a message once one consumer acknowledges it, so consumers compete and there is no replay", keyIdea: "queue: delete after ack" },
      { id: "log", criterion: "A log keeps messages for a retention period in order per partition, and each consumer group tracks its own offset", keyIdea: "log: retained, offsets" },
      { id: "partitions", criterion: "Parallelism in a log is capped by the partition count, and order holds per key within a partition", keyIdea: "partitions cap parallelism" },
    ],
    exemplar:
      "A queue gives each message to one consumer and deletes it after acknowledgement, so consumers compete and scale easily, but nothing can be replayed and each extra subscriber needs its own copy. A log keeps messages for a retention period and each consumer group tracks its own offset, so many systems can read the same data and rewind. Order holds within a partition, so I would key by customer, and the partition count caps how many consumers in a group can work in parallel.",
  },
  reviews: [
    {
      id: "ql-est",
      format: "estimate",
      scenario: "A topic carries 5,000 events a second of 2 KB each, kept for 3 days. About how many terabytes does the log hold? (one copy)",
      unit: "TB",
      answer: 2.6,
      acceptFactor: 1.1,
      breakdown: ["5,000 × 2 KB = 10 MB per second", "× 86,400 × 3 = 2.6 TB"],
      explain: "Rate times size times time. Replication multiplies it again, usually by three.",
    },
    {
      id: "ql-pick",
      format: "pick-fix",
      scenario: "A queue feeds an order processor. A bug corrupted yesterday's orders and the team wants to reprocess them with the fix. What does the design lack?",
      options: [
        { id: "a", label: "Retained messages that can be replayed, as a log provides" },
        { id: "b", label: "More consumers" },
        { id: "c", label: "A shorter visibility timeout" },
        { id: "d", label: "FIFO ordering" },
      ],
      answer: "a",
      explain: "A queue deletes what it delivers. Reprocessing needs the messages to still exist, which is what a retained log offers.",
    },
    {
      id: "ql-order",
      format: "order",
      scenario: "Order these by how many consumers in one group can read a topic in parallel, most first.",
      items: [
        { id: "std", label: "A standard queue" },
        { id: "p24", label: "A log with 24 partitions" },
        { id: "p4", label: "A log with 4 partitions" },
      ],
      answer: ["std", "p24", "p4"],
      explain: "A queue lets any number of consumers compete. A log group is limited to one consumer per partition.",
    },
    {
      id: "ql-graph",
      format: "predict-graph",
      scenario: "Each consumer handles 1,000 events a second. As you add partitions from 1 to 64 to a log with a large enough consumer group, how does the topic's maximum throughput change?",
      xLabel: "partitions →",
      yLabel: "throughput ceiling",
      options: [
        { id: "linear", label: "Rises in proportion to the partition count", points: [1, 4, 8, 16, 24, 32, 48, 64] },
        { id: "flat", label: "Stays the same", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "log", label: "Rises but flattens quickly", points: [1, 3, 4, 5, 5.5, 5.8, 5.9, 6] },
      ],
      answer: "linear",
      explain: "Each partition adds one parallel reader, so the ceiling grows linearly, until the brokers or the network become the limit.",
    },
    {
      id: "ql-flaw",
      format: "spot-flaw",
      scenario: "One SQS standard queue feeds billing, search and analytics, each with its own consumers. Messages are taken by whichever consumer polls first, so each system sees only some of them. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "producer", label: "producer", kind: "server", col: 0, row: 1 },
          { id: "queue", label: "one queue", kind: "queue", col: 1, row: 1 },
          { id: "consumers", label: "billing, search, analytics consumers", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "producer", to: "queue" },
          { from: "queue", to: "consumers" },
        ],
      },
      answer: "queue->consumers",
      explain: "Consumers of one queue compete for messages, so each message reaches only one of them. Use a topic with a queue per subscriber, or a log with a group per system.",
    },
    {
      id: "ql-explain",
      format: "explain",
      scenario: "In two sentences: what does a consumer's offset let a log do that a queue cannot?",
      rubric: [
        { id: "own", criterion: "Each consumer group records its own position, so groups read the same data independently" },
        { id: "replay", criterion: "A consumer can reset its offset to reread older messages, since nothing is deleted on read" },
      ],
      exemplar: "The offset is each group's own bookmark, so many groups read the same log without affecting one another. Resetting it lets a consumer reread old messages, because reading does not delete anything.",
      explain: "A bookmark, not a deletion.",
    },
  ],
  codex: {
    oneLiner: "Queues hand each message to one consumer and delete it. Logs retain ordered messages that many consumer groups read and replay.",
    keyNumbers: [
      { label: "SQS FIFO throughput with batching, per queue", value: "about 3,000 messages a second", sourceId: "sqs-quotas" },
      { label: "Log storage", value: "rate × size × retention", sourceId: "kafka-intro" },
    ],
    tradeoffs: [
      { choice: "Queue", gain: "Scales by adding consumers; simple; no ordering cost for standard", cost: "No replay; one subscriber per copy" },
      { choice: "Log", gain: "Replay, many groups, order per key", cost: "Storage; parallelism capped by partitions" },
      { choice: "More partitions", gain: "More parallelism", cost: "More overhead, and order only within a partition" },
    ],
    seenIn: ["SQS and RabbitMQ for work queues.", "Kafka, Kinesis and Pub/Sub for event streams."],
    interviewAngle: "Say: 'queue for tasks done once, log for events many systems read, keyed partitions for order, and size partitions for throughput'.",
    aws: [{ concept: "Queue and log services", service: "SQS and Kinesis Data Streams / MSK" }],
    replay: { id: "broker-lab", config: QL, scene: "log" },
  },
  interview: [
    "When would you choose Kafka over SQS?",
    "How do partitions affect ordering and parallelism?",
    "What does replay give you?",
  ],
  deeper: [
    {
      title: "Compaction and the log as a database",
      body: "A log can also keep only the latest message per key, a compacted topic, which makes it a table of current values that new consumers can read to catch up. Combined with long retention, a log becomes a source of truth from which other stores are built, which is the idea behind many stream-processing architectures.",
      sourceIds: ["kreps-log"],
    },
  ],
  honestPhysics: [
    "20,000 events a second of 1 KB each, to be read in full by three independent systems. One consumer handles 1,000 events a second.",
    "A queue's FIFO mode is capped at 3,000 a second in the lab; a standard queue is not ordered. A log's ceiling is partitions × 1,000, and it needs rate × size × retention in storage.",
    "Replication multiplies log storage, usually by three; the lab shows one copy.",
  ],
  sources: [KAFKA, SQS_TYPES, SQS_QUOTAS, KREPS],
  verify: [
    { id: "fifo", claim: "A FIFO queue tops out at 3,000 a second", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "queue", ordered: true }, metric: "maxRate" }, expect: { min: 3000, max: 3000 } },
    { id: "std", claim: "A standard queue is not ordered", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "queue", ordered: false }, metric: "ordered" }, expect: { max: 0 } },
    { id: "std-replay", claim: "…and cannot replay", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "queue" }, metric: "replayDays" }, expect: { max: 0 } },
    { id: "small-log", claim: "A log with 8 partitions tops out at 8,000 a second", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "log", partitions: 8, retention: 7 }, metric: "maxRate" }, expect: { max: 8000 } },
    { id: "good-log", claim: "24 partitions handle 24,000 a second", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "log", partitions: 24, retention: 7 }, metric: "maxRate" }, expect: { min: 20000 } },
    { id: "storage7", claim: "Seven days holds about 12 TB", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "log", partitions: 24, retention: 7 }, metric: "storageTB" }, expect: { min: 12, max: 12.2 } },
    { id: "storage9", claim: "Nine days takes more than 15 TB", run: "lab", params: { model: "broker-lab", config: QL_CHALLENGE, values: { engine: "log", partitions: 24, retention: 9 }, metric: "storageTB" }, expect: { min: 15 } },
  ],
});
