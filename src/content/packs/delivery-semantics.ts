import { definePack } from "../define";

export const DELIV = { start: { order: "ackAfter", dedup: true, ttlMin: 60 } };
export const DELIV_CHALLENGE = {};

const KAFKA_SEM = { id: "kafka-semantics", title: "Apache Kafka docs: Message delivery semantics (at most once, at least once, exactly once)", url: "https://kafka.apache.org/documentation/#semantics" };
const SQS_STD = { id: "sqs-standard", title: "AWS docs: Amazon SQS standard queues (at-least-once delivery, occasional duplicates)", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html" };
const TREAT = { id: "treat-exactly-once", title: "T. Treat (2015), You Cannot Have Exactly-Once Delivery", url: "https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/" };

export default definePack({
  id: "delivery-semantics",
  title: "Delivery Semantics & Dedup",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'the welcome email arrived twice'", detail: "and one customer never got theirs" },
    lines: [
      { speaker: "kabir", line: "Some customers get two welcome emails, a few get none. Both come from the same worker, and it only crashes occasionally." },
      { speaker: "meera", line: "A worker can crash between doing the job and saying it is done. Whichever order it does those two in decides whether the message is lost or repeated." },
    ],
  },
  predictions: [
    {
      id: "lost",
      kind: "choice",
      prompt: "A worker acknowledges each message first, then processes it, and crashes between the two on 1 in 10,000 messages. Per million messages, how many are lost?",
      options: [
        { id: "none", label: "None" },
        { id: "ten", label: "About 10" },
        { id: "hundred", label: "About 100" },
        { id: "thousand", label: "About 1,000" },
      ],
      answer: "hundred",
      observe: "lost-seen",
      reveal: {
        text: "One crash in 10,000 messages is 100 per million, and each hits the moment after the broker was told 'done'. The broker deletes the message and the work never happens: no error, no retry, no trace. That is at-most-once delivery.",
        derived: true,
        line: { speaker: "meera", line: "Acknowledge first and the broker believes you. Nothing is left to retry." },
      },
    },
    {
      id: "ttl",
      kind: "choice",
      prompt: "You now acknowledge after processing and skip ids already seen, but you remember ids for only 5 minutes. Redeliveries arrive after about 5 minutes on average. How many effects are still applied twice per million?",
      options: [
        { id: "none", label: "None" },
        { id: "few", label: "About 4" },
        { id: "many", label: "About 37" },
        { id: "all", label: "All 100" },
      ],
      answer: "many",
      observe: "dup-seen",
      reveal: {
        text: "A redelivery is skipped only if its id is still remembered. With a 5-minute memory and a 5-minute average delay, 37% of redeliveries arrive after the id is gone, so 37 of the 100 repeats per million still apply. The memory must outlast the longest redelivery.",
        derived: true,
        line: { speaker: "rao", line: "The dedup store is only as good as its memory." },
      },
    },
  ],
  widget: { id: "delivery-lab", config: DELIV },
  mechanism: [
    {
      id: "gap",
      text: "A consumer does two things: the work and the acknowledgement. They are separate, and a crash can fall between them. Which order you choose decides what the failure looks like. No network protocol removes this gap; it only chooses which side of it to be wrong on.",
      sourceIds: ["treat-exactly-once", "kafka-semantics"],
    },
    {
      id: "atmost",
      scene: "atmost",
      text: "At-most-once acknowledges first, then works. A crash in between loses the message, and nobody knows. It suits data where a gap is harmless, like a sampled metric or a heartbeat. Nothing is ever repeated, but sometimes nothing happens.",
      sourceIds: ["kafka-semantics"],
    },
    {
      id: "atleast",
      scene: "atleast",
      text: "At-least-once works first, then acknowledges. A crash in between makes the broker redeliver, so the work may happen twice. This is the default of most queues, including SQS standard. Nothing is lost, and consumers must cope with duplicates.",
      sourceIds: ["sqs-standard", "kafka-semantics"],
    },
    {
      id: "dedup",
      scene: "dedup",
      text: "Exactly-once effects are at-least-once plus deduplication. Give each message a unique id, record the ids you have processed in the same transaction as the effect, and skip repeats. Remember ids for longer than the longest redelivery, since an expired id lets a repeat through.",
      sourceIds: ["treat-exactly-once", "kafka-semantics"],
    },
  ],
  challenges: [
    {
      id: "no-loss-no-dupe",
      title: "Neither lost nor doubled",
      brief: "A worker crashes between steps on 1 in 10,000 messages and redeliveries arrive after about 5 minutes. Lose nothing, let at most one effect per million repeat, add at most 3 ms, and keep the dedup store under 0.05 GB.",
      line: { speaker: "kabir", line: "A double email is embarrassing and a double payment is a refund. I want neither." },
      widget: { id: "delivery-lab", config: DELIV_CHALLENGE },
      conditions: [
        { metric: "lostPerMillion", op: "<=", value: 0, label: "No lost messages" },
        { metric: "dupEffectsPerMillion", op: "<=", value: 1, label: "At most 1 repeated effect per million" },
        { metric: "extraMs", op: "<=", value: 3, label: "At most 3 ms added" },
        { metric: "dedupGB", op: "<=", value: 0.05, label: "Dedup store under 0.05 GB" },
      ],
      stars: [{ metric: "dedupGB", op: "<=", value: 0.02, label: "Dedup store under 0.02 GB" }],
      hints: [
        "Which acknowledgement order never loses a message?",
        "How long must an id be remembered for repeats to be caught?",
        "What does remembering too long cost?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain at-most-once, at-least-once, and how to get exactly-once effects.",
    rubric: [
      { id: "atmost", criterion: "At-most-once acknowledges before working, so a crash in between loses the message", keyIdea: "ack first loses" },
      { id: "atleast", criterion: "At-least-once acknowledges after working, so a crash in between causes redelivery and duplicates", keyIdea: "ack after duplicates" },
      { id: "dedup", criterion: "Exactly-once effects come from at-least-once plus deduplication by message id, remembered longer than any redelivery", keyIdea: "dedup by id" },
    ],
    exemplar:
      "At-most-once acknowledges before doing the work, so a crash in between loses the message. At-least-once does the work first and acknowledges after, so a crash in between makes the broker redeliver and the work can happen twice. Exactly-once effects come from at-least-once plus deduplication: each message has a unique id, the consumer records processed ids with the effect, and the record is kept longer than the longest redelivery.",
  },
  reviews: [
    {
      id: "ds-est",
      format: "estimate",
      scenario: "A worker crashes between work and acknowledgement on 1 in 20,000 messages, and handles 40 million messages a day. With acknowledgement after work and no dedup, about how many duplicate effects a day?",
      unit: "duplicates",
      answer: 2000,
      acceptFactor: 1.05,
      breakdown: ["40,000,000 ÷ 20,000", "= 2,000 a day"],
      explain: "At-least-once turns every crash in the gap into a duplicate.",
    },
    {
      id: "ds-pick",
      format: "pick-fix",
      scenario: "A payments consumer uses at-least-once delivery and occasionally charges a customer twice. What should change?",
      options: [
        { id: "a", label: "Record the message id in the same transaction as the charge, and skip ids already recorded" },
        { id: "b", label: "Acknowledge before charging" },
        { id: "c", label: "Add more consumers" },
        { id: "d", label: "Delay acknowledgements by an hour" },
      ],
      answer: "a",
      explain: "Acknowledging first would lose payments instead. Recording the id with the effect makes repeats harmless.",
    },
    {
      id: "ds-order",
      format: "order",
      scenario: "Order these by how many messages are lost per million when the worker crashes in the gap on 1 in 10,000 messages, most first.",
      items: [
        { id: "first", label: "Acknowledge first, no dedup" },
        { id: "after", label: "Acknowledge after, no dedup" },
        { id: "dedup", label: "Acknowledge after, with dedup" },
      ],
      answer: ["first", "after", "dedup"],
      explain: "Only acknowledging first loses messages. The other two lose none, and differ in duplicates.",
    },
    {
      id: "ds-graph",
      format: "predict-graph",
      scenario: "Redeliveries arrive after about 5 minutes on average. As you raise the dedup memory from 1 minute to 4 hours, how does the number of repeated effects per million change?",
      xLabel: "how long ids are remembered →",
      yLabel: "repeated effects per million",
      options: [
        { id: "fall", label: "Falls steeply, then is almost zero", points: [82, 67, 37, 14, 1.8, 0, 0, 0] },
        { id: "flat", label: "Stays at 100", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "linear", label: "Falls in a straight line", points: [100, 85, 70, 55, 40, 25, 10, 0] },
      ],
      answer: "fall",
      explain: "The share of redeliveries that outlast the memory falls exponentially, e^(−memory ÷ 5 min).",
    },
    {
      id: "ds-flaw",
      format: "spot-flaw",
      scenario: "A consumer reads a message, sends the email, writes the message id to a 'seen' table, and acknowledges. Occasionally customers get two emails. Tap the step that leaves the gap.",
      diagram: {
        nodes: [
          { id: "email", label: "send the email", kind: "external", col: 0, row: 1 },
          { id: "seen", label: "write id to 'seen' table", kind: "db", col: 1, row: 1 },
          { id: "ack", label: "acknowledge", kind: "queue", col: 2, row: 1 },
        ],
        edges: [
          { from: "email", to: "seen" },
          { from: "seen", to: "ack" },
        ],
      },
      answer: "email->seen",
      explain: "A crash after the email and before the id is recorded makes the redelivery look new. Record the id first, or make the email itself idempotent.",
    },
    {
      id: "ds-explain",
      format: "explain",
      scenario: "In two sentences: why can't a network give you true exactly-once delivery?",
      rubric: [
        { id: "ambiguity", criterion: "A sender cannot tell whether a message or its acknowledgement was lost, so it must choose to resend or not" },
        { id: "effects", criterion: "What can be achieved is exactly-once effects, by resending and deduplicating at the receiver" },
      ],
      exemplar: "If no acknowledgement arrives, the sender cannot know whether the message or the reply was lost, so it must either resend or risk loss. What is achievable is exactly-once effects, by resending freely and deduplicating at the receiver.",
      explain: "Delivery is at least once; the effect can be once.",
    },
  ],
  codex: {
    oneLiner: "Ack first loses messages; ack after repeats them. Exactly-once effects are at-least-once plus dedup by id, remembered longer than any redelivery.",
    keyNumbers: [
      { label: "Lost per million, ack first, 1 in 10,000 crashes in the gap", value: "100", sourceId: "kafka-semantics" },
      { label: "Repeats that outlast a 5-minute memory with 5-minute redeliveries", value: "37%", sourceId: "treat-exactly-once" },
    ],
    tradeoffs: [
      { choice: "At-most-once", gain: "No duplicates; simplest", cost: "Silent loss" },
      { choice: "At-least-once", gain: "Nothing lost", cost: "Duplicates to handle" },
      { choice: "Dedup store", gain: "Exactly-once effects", cost: "A lookup per message and memory for ids" },
    ],
    seenIn: ["SQS standard queues and Kafka consumers: at-least-once by default.", "Kafka idempotent producer and transactions."],
    interviewAngle: "Say: 'at-least-once delivery with idempotent consumers; record the message id in the same transaction as the effect'.",
    aws: [{ concept: "Message deduplication id (FIFO) and idempotent handlers", service: "SQS FIFO / Lambda Powertools" }],
    replay: { id: "delivery-lab", config: DELIV, scene: "dedup" },
  },
  interview: [
    "What is the difference between at-most-once, at-least-once and exactly-once?",
    "How do you make a consumer idempotent?",
    "Why is exactly-once delivery impossible but exactly-once processing achievable?",
  ],
  deeper: [
    {
      title: "Kafka's exactly-once",
      body: "Kafka offers exactly-once semantics inside its own system by combining idempotent producers, which deduplicate resends by sequence number, with transactions that commit consumed offsets and produced messages together. The guarantee holds only for effects within Kafka. A side effect such as sending an email is outside it, and still needs an idempotent design.",
      sourceIds: ["kafka-semantics"],
    },
  ],
  honestPhysics: [
    "A consumer crashes in the gap between work and acknowledgement on 1 in 10,000 messages. Acknowledging first loses the message; acknowledging after redelivers it.",
    "A dedup store remembers processed ids for the time you set. Redeliveries arrive after an exponential delay with a mean of 5 minutes. 10 million messages a day, 40 bytes an id, and a lookup adds 2 ms.",
    "'Exactly once' means exactly-once effects, not that the network never repeats a message.",
  ],
  sources: [KAFKA_SEM, SQS_STD, TREAT],
  verify: [
    { id: "lost", claim: "Acknowledging first loses 100 messages per million", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackFirst" }, metric: "lostPerMillion" }, expect: { min: 100, max: 100 } },
    { id: "dups", claim: "Acknowledging after repeats 100 effects per million", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: false }, metric: "dupEffectsPerMillion" }, expect: { min: 100, max: 100 } },
    { id: "ttl5", claim: "A 5-minute dedup memory still repeats 37 per million", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: true, ttlMin: 5 }, metric: "dupEffectsPerMillion" }, expect: { min: 36, max: 38 } },
    { id: "ttl25", claim: "A 25-minute memory gets it under 1 per million", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: true, ttlMin: 25 }, metric: "dupEffectsPerMillion" }, expect: { max: 1 } },
    { id: "ttl20", claim: "A 20-minute memory is not quite enough", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: true, ttlMin: 20 }, metric: "dupEffectsPerMillion" }, expect: { min: 1 } },
    { id: "store60", claim: "An hour of ids takes under 0.02 GB", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: true, ttlMin: 60 }, metric: "dedupGB" }, expect: { max: 0.02 } },
    { id: "store240", claim: "Four hours takes over 0.05 GB", run: "lab", params: { model: "delivery-lab", config: DELIV_CHALLENGE, values: { order: "ackAfter", dedup: true, ttlMin: 240 }, metric: "dedupGB" }, expect: { min: 0.05 } },
  ],
});
