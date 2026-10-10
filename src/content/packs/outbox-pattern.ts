import { definePack } from "../define";

export const OB = { start: { pattern: "poll", pollMs: 1000, dedup: true } };
export const OB_CHALLENGE = { start: { pattern: "dbfirst", pollMs: 1000, dedup: false } };

const MSIO_OUTBOX = { id: "microservices-outbox", title: "C. Richardson: Pattern, Transactional outbox (microservices.io)", url: "https://microservices.io/patterns/data/transactional-outbox.html" };
const DEBEZIUM = { id: "debezium-outbox", title: "Debezium blog: Reliable Microservices Data Exchange With the Outbox Pattern", url: "https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 11: Keeping systems in sync, change data capture", url: "https://dataintensive.net/" };

export default definePack({
  id: "outbox-pattern",
  title: "The Outbox Pattern",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'my order never shipped'", detail: "order saved, no OrderPlaced event" },
    lines: [
      { speaker: "kabir", line: "The order is in the database but the warehouse never heard about it. The service crashed between saving it and sending the message." },
      { speaker: "meera", line: "Two writes to two systems cannot be made atomic by being careful. A crash between them always leaves one ahead of the other." },
    ],
  },
  predictions: [
    {
      id: "lost",
      kind: "choice",
      prompt: "5 million events a day. The service saves to the database, then publishes to the broker, and 1 in 50,000 operations crashes between the two. How many events are lost a day?",
      options: [
        { id: "none", label: "None: a crash is not that likely" },
        { id: "ten", label: "About 10" },
        { id: "hundred", label: "About 100" },
        { id: "thousand", label: "About 1,000" },
      ],
      answer: "hundred",
      observe: "lost-seen",
      reveal: {
        text: "5 million operations at 1 in 50,000 is 100 crashes in the gap each day, and each leaves an order saved with no event. Reverse the order of the two steps and the crash instead publishes an event for something that never saved. Neither order is safe.",
        derived: true,
        line: { speaker: "meera", line: "Pick which way you want to be wrong. You cannot pick right." },
      },
    },
    {
      id: "dup",
      kind: "choice",
      prompt: "You write the event to an outbox table in the same transaction as the order, and a relay publishes it. The relay occasionally crashes after publishing and before marking the row sent. What does that cause?",
      options: [
        { id: "lost", label: "Lost events" },
        { id: "dupes", label: "Duplicate events: some are delivered twice" },
        { id: "nothing", label: "Nothing: the transaction covers it" },
      ],
      answer: "dupes",
      observe: "twice-seen",
      reveal: {
        text: "The relay restarts, finds the row still unsent, and publishes it again. Events are never lost, but about 25 a day are delivered twice. Consumers that remember the ids they have processed turn at-least-once delivery into exactly-once effects.",
        derived: true,
        line: { speaker: "rao", line: "A duplicate we can absorb is better than a loss we cannot see." },
      },
    },
  ],
  widget: { id: "outbox-lab", config: OB },
  mechanism: [
    {
      id: "dual",
      scene: "dual",
      text: "Updating a database and publishing a message are two separate systems. If you write first and the service dies before publishing, the event is lost. If you publish first and the write fails, you announce something that never happened. Without a shared transaction, a gap always exists.",
      sourceIds: ["microservices-outbox", "ddia"],
    },
    {
      id: "outbox",
      scene: "outbox",
      text: "The outbox pattern writes the event into an outbox table in the same database transaction as the data. Either both are saved or neither is. A separate relay then reads unsent rows and publishes them, marking each sent afterwards. The atomic step is now local to one database.",
      sourceIds: ["microservices-outbox", "debezium-outbox"],
    },
    {
      id: "relay",
      text: "The relay can poll the table every so often, which adds up to the polling interval in delay, or read the database's change log with change data capture, which adds tens of milliseconds and no query load. Either way it delivers at least once, because it can crash between publishing and marking.",
      sourceIds: ["debezium-outbox", "ddia"],
    },
    {
      id: "dedup",
      scene: "dedup",
      text: "At-least-once delivery means consumers must tolerate duplicates. Give each event a unique id, and have consumers record the ids they have handled in the same transaction as their own effects, skipping any they have seen. The result is that each event takes effect once.",
      sourceIds: ["microservices-outbox"],
    },
  ],
  challenges: [
    {
      id: "reliable-events",
      title: "Never lose or duplicate an order event",
      brief: "5 million events a day. Choose how events are published so none are lost, none are announced without being saved, none take effect twice, and the added delay is at most 250 ms.",
      line: { speaker: "kabir", line: "I can live with a quarter-second delay. I cannot live with the warehouse missing an order." },
      widget: { id: "outbox-lab", config: OB_CHALLENGE },
      conditions: [
        { metric: "lostPerDay", op: "<=", value: 0, label: "No lost events" },
        { metric: "phantomPerDay", op: "<=", value: 0, label: "No events for unsaved data" },
        { metric: "appliedTwicePerDay", op: "<=", value: 0, label: "No event takes effect twice" },
        { metric: "extraLatencyMs", op: "<=", value: 250, label: "Added delay at most 250 ms" },
      ],
      stars: [{ metric: "extraLatencyMs", op: "<=", value: 50, label: "Added delay at most 50 ms" }],
      hints: [
        "Which publishing orders leave a gap between the two writes?",
        "An outbox delivers at least once. What handles the repeats?",
        "How often must a polling relay run to add under 250 ms on average?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the dual-write problem and how the outbox pattern solves it.",
    rubric: [
      { id: "dual", criterion: "Writing to a database and a broker separately can leave one ahead of the other if the service crashes between them", keyIdea: "two writes cannot be atomic" },
      { id: "outbox", criterion: "Write the event to an outbox table in the same transaction as the data, and have a relay publish it afterwards", keyIdea: "event in the same transaction" },
      { id: "dedup", criterion: "The relay delivers at least once, so consumers deduplicate by event id", keyIdea: "at-least-once plus dedup" },
    ],
    exemplar:
      "Saving to a database and publishing to a broker are two separate writes, so a crash between them leaves an order with no event or an event with no order. With an outbox, the event is written to a table in the same transaction as the data, so both succeed or neither does. A relay then publishes the unsent rows, which can deliver twice after a crash, so consumers deduplicate by event id.",
  },
  reviews: [
    {
      id: "ob-est",
      format: "estimate",
      scenario: "A relay polls the outbox every 600 ms. On average, about how long after the commit does an event get picked up? (half the interval plus 5 ms to publish)",
      unit: "ms",
      answer: 305,
      acceptFactor: 1.1,
      breakdown: ["average wait = 600 ÷ 2 = 300 ms", "+ 5 ms to publish", "= 305 ms"],
      explain: "An event arrives at a random point in the polling cycle, so on average it waits half the interval.",
    },
    {
      id: "ob-pick",
      format: "pick-fix",
      scenario: "A service saves an order and then publishes an event, in two separate steps. Occasionally the event is missing. What is the smallest fix that does not need distributed transactions?",
      options: [
        { id: "a", label: "Write the event to an outbox table in the same transaction, and publish from there" },
        { id: "b", label: "Publish first, then save" },
        { id: "c", label: "Retry the publish forever inside the request" },
        { id: "d", label: "Use a bigger broker" },
      ],
      answer: "a",
      explain: "Publishing first just reverses the problem. A retry loop inside the request is lost when the service crashes. Only a durable record in the same transaction survives.",
    },
    {
      id: "ob-order",
      format: "order",
      scenario: "Order these publishing approaches by the number of events lost or phantom per day in the lab, most first.",
      items: [
        { id: "dbfirst", label: "Save, then publish (100 lost)" },
        { id: "both", label: "Outbox, no dedup (25 delivered twice)" },
        { id: "outbox", label: "Outbox with dedup" },
      ],
      answer: ["dbfirst", "both", "outbox"],
      explain: "A lost event cannot be recovered. A duplicate is harmless once consumers deduplicate. The outbox with dedup has neither.",
    },
    {
      id: "ob-graph",
      format: "predict-graph",
      scenario: "An outbox relay polls at intervals from 50 ms to 5 seconds. How does the average added delay change?",
      xLabel: "poll interval →",
      yLabel: "average added delay",
      options: [
        { id: "linear", label: "Grows in proportion to the interval", points: [30, 55, 105, 255, 505, 1005, 1505, 2505] },
        { id: "flat", label: "Stays the same", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "fall", label: "Falls", points: [2505, 1505, 1005, 505, 255, 105, 55, 30] },
      ],
      answer: "linear",
      explain: "On average an event waits half the interval, so the delay grows in step with it. Change data capture avoids polling and adds only tens of milliseconds.",
    },
    {
      id: "ob-flaw",
      format: "spot-flaw",
      scenario: "A service writes the order to the database, commits, and then in the request handler publishes to Kafka. If Kafka is slow the response times out, and sometimes the event is never sent. Tap the step that causes the loss.",
      diagram: {
        nodes: [
          { id: "save", label: "save order (commit)", kind: "db", col: 0, row: 1 },
          { id: "publish", label: "publish to Kafka", kind: "queue", col: 1, row: 1 },
          { id: "crash", label: "crash or timeout in between", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "save", to: "publish" },
          { from: "publish", to: "crash" },
        ],
      },
      answer: "save->publish",
      explain: "Between the commit and the publish there is a gap where nothing durable records the intent to send. The outbox puts that intent in the commit.",
    },
    {
      id: "ob-explain",
      format: "explain",
      scenario: "In two sentences: why does the outbox pattern still need idempotent consumers?",
      rubric: [
        { id: "atleast", criterion: "The relay can publish an event and crash before marking it sent, so it publishes again later" },
        { id: "dedup", criterion: "Consumers must therefore skip event ids they have already processed" },
      ],
      exemplar: "The relay may publish an event and crash before recording that it did, so it will publish it again after restarting. Consumers therefore need to skip event ids they have already processed.",
      explain: "Exactly-once effects are built from at-least-once delivery plus deduplication.",
    },
  ],
  codex: {
    oneLiner: "Write the event to an outbox table in the same transaction as the data. A relay publishes it at least once. Consumers deduplicate by id.",
    keyNumbers: [
      { label: "Lost events with save-then-publish, 5M a day, 1 in 50,000 crash", value: "about 100 a day", sourceId: "microservices-outbox" },
      { label: "Added delay from a polling relay", value: "about half the interval", sourceId: "debezium-outbox" },
    ],
    tradeoffs: [
      { choice: "Polling relay", gain: "Simple, any database", cost: "Delay and query load" },
      { choice: "Change data capture", gain: "Low delay, no polling", cost: "Needs log access and a CDC tool" },
      { choice: "Dedup in consumers", gain: "Exactly-once effects", cost: "A processed-ids table per consumer" },
    ],
    seenIn: ["Debezium with Kafka Connect outbox event router.", "Event-driven systems such as order and payment services."],
    interviewAngle: "Say: 'an event table in the same transaction, a relay or CDC publishes at least once, and consumers dedupe by id'.",
    aws: [{ concept: "DynamoDB Streams / RDS change capture to EventBridge or Kinesis", service: "DynamoDB, DMS" }],
    replay: { id: "outbox-lab", config: OB, scene: "outbox" },
  },
  interview: [
    "What is the dual-write problem?",
    "How does the transactional outbox work?",
    "How do you get exactly-once effects from at-least-once delivery?",
  ],
  deeper: [
    {
      title: "Listen to yourself",
      body: "A variant avoids the polling relay: the service publishes the event to the broker first, and then consumes its own topic to update its database. The log becomes the source of truth. It removes the dual write but changes the data flow, since reads must wait for the log to be applied, and is closer to event sourcing than to a patch on an existing service.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "5 million events a day. Doing the database write and the publish as two separate steps leaves a crash window: 2 × 10⁻⁵ of operations crash there, about 100 a day.",
    "An outbox makes the event atomic with the data. The relay can crash after publishing and before marking the row sent, so 5 × 10⁻⁶ of events, about 25 a day, are delivered twice.",
    "Extra latency: polling adds half the interval plus 5 ms; change data capture about 25 ms; a direct publish about 2 ms.",
  ],
  sources: [MSIO_OUTBOX, DEBEZIUM, DDIA],
  verify: [
    { id: "lost", claim: "Save-then-publish loses about 100 events a day", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "dbfirst" }, metric: "lostPerDay" }, expect: { min: 100, max: 100 } },
    { id: "phantom", claim: "Publish-then-save announces about 100 unsaved events a day", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "brokerfirst" }, metric: "phantomPerDay" }, expect: { min: 100, max: 100 } },
    { id: "twice", claim: "An outbox without dedup applies about 25 events twice a day", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "poll", dedup: false }, metric: "appliedTwicePerDay" }, expect: { min: 25, max: 25 } },
    { id: "dedup", claim: "…and none with dedup", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "poll", dedup: true }, metric: "appliedTwicePerDay" }, expect: { max: 0 } },
    { id: "lat400", claim: "Polling every 400 ms adds about 205 ms", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "poll", pollMs: 400, dedup: true }, metric: "extraLatencyMs" }, expect: { max: 250 } },
    { id: "lat1000", claim: "Polling every second adds over 500 ms", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "poll", pollMs: 1000, dedup: true }, metric: "extraLatencyMs" }, expect: { min: 500 } },
    { id: "cdc", claim: "Change data capture adds about 25 ms", run: "lab", params: { model: "outbox-lab", config: OB_CHALLENGE, values: { pattern: "cdc", dedup: true }, metric: "extraLatencyMs" }, expect: { max: 50 } },
  ],
});
