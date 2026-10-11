import { definePack } from "../define";

export const ES = { start: { every: 20000, workers: 1 } };
export const ES_CHALLENGE = {};

const FOWLER_ES = { id: "fowler-es", title: "M. Fowler: Event Sourcing", url: "https://martinfowler.com/eaaDev/EventSourcing.html" };
const AZURE_ES = { id: "azure-es", title: "Microsoft Azure Architecture Center: Event Sourcing pattern (snapshots, replay, audit)", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 11: Event sourcing and immutability", url: "https://dataintensive.net/" };

export default definePack({
  id: "event-sourcing",
  title: "Event Sourcing",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "ledger · account 77 balance mismatch", detail: "finance wants to know exactly how it got there" },
    lines: [
      { speaker: "kabir", line: "A balance is wrong and finance asks how it got there, but our table only has today's number." },
      { speaker: "meera", line: "Store what happened, not what is true now. The balance is then something you compute, and the history is the data itself." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "An account's state is rebuilt by replaying its events. This account has 200,000 events and replay runs at 100,000 events a second. With no snapshots, how long does loading it take?",
      options: [
        { id: "fast", label: "About 20 ms" },
        { id: "sec", label: "About 200 ms" },
        { id: "two", label: "About 2 seconds" },
        { id: "min", label: "About 20 seconds" },
      ],
      answer: "two",
      observe: "slow-load",
      reveal: {
        text: "200,000 events at 100,000 a second is 2 seconds, on every load of that account. Event stores keep history forever, so the busiest accounts get slower to load with every event unless something bounds the replay.",
        derived: true,
        line: { speaker: "meera", line: "A history that only grows makes every read pay for all of it." },
      },
    },
    {
      id: "snap",
      kind: "choice",
      prompt: "You save a snapshot every 5,000 events and load the latest, then replay what came after. About how long does a load take now?",
      options: [
        { id: "ms30", label: "About 30 ms" },
        { id: "ms300", label: "About 300 ms" },
        { id: "s2", label: "Still about 2 seconds" },
      ],
      answer: "ms30",
      observe: "fast-load",
      reveal: {
        text: "On average half a snapshot interval, 2,500 events, is replayed: 25 ms, plus about 5 ms to fetch the snapshot. Loads become independent of how long the account has existed, and the snapshots add under 1% to storage.",
        derived: true,
        line: { speaker: "rao", line: "A snapshot is a cache of a replay, and the log stays the truth." },
      },
    },
  ],
  widget: { id: "sourcing-lab", config: ES },
  mechanism: [
    {
      id: "idea",
      text: "In event sourcing, the database stores the sequence of events that happened, an account was opened, 50 was deposited, and current state is derived by replaying them. Nothing is updated in place. The events are the record, so history, audit and the ability to reconstruct any past state come for free.",
      sourceIds: ["fowler-es", "azure-es"],
    },
    {
      id: "replay",
      scene: "replay",
      text: "The price is replay time. Loading an account means folding all its events into a state, so the cost grows with the account's age. Busy aggregates become slow to load, and a bug in the fold function changes every state it computes, which is both a risk and a way to repair history.",
      sourceIds: ["azure-es"],
      derived: true,
    },
    {
      id: "snapshot",
      scene: "snapshot",
      text: "Snapshots bound the replay. Every K events, store the folded state; to load, read the latest snapshot and replay only the events after it. Pick K so loads are fast, but not so small that snapshots dominate storage and writes. Snapshots are an optimisation and can always be thrown away and rebuilt.",
      sourceIds: ["azure-es", "fowler-es"],
    },
    {
      id: "rebuild",
      scene: "rebuild",
      text: "Read models and projections are derived from the log, so a new view of the data is a replay of everything. Rebuilding a read model from billions of events takes hours, so split the replay across workers by key, and budget for the time when planning a schema change.",
      sourceIds: ["ddia", "azure-es"],
    },
  ],
  challenges: [
    {
      id: "snapshots",
      title: "Plan the snapshots",
      brief: "A busy account has 200,000 events, and the history is 5 billion events. Choose how often to snapshot and how many workers rebuild a read model so a load takes at most 60 ms, snapshots add at most 20% to storage, and a rebuild finishes within 2 hours.",
      line: { speaker: "rao", line: "Snapshots cost storage and writes, replay costs time, and I would like both small." },
      widget: { id: "sourcing-lab", config: ES_CHALLENGE },
      conditions: [
        { metric: "loadMs", op: "<=", value: 60, label: "Loads at most 60 ms" },
        { metric: "storageOverhead", op: "<=", value: 0.2, label: "Snapshots add at most 20% to storage" },
        { metric: "rebuildHours", op: "<=", value: 2, label: "Rebuild within 2 hours" },
      ],
      stars: [],
      hints: [
        "How many events can be replayed in 55 ms?",
        "What does a snapshot every 50 events cost in storage?",
        "How many workers does 5 billion events need to finish in 2 hours?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain event sourcing and how snapshots keep it practical.",
    rubric: [
      { id: "store", criterion: "Store the sequence of events, not current state; state is derived by replaying them", keyIdea: "events are the record" },
      { id: "benefit", criterion: "History, audit and rebuilding past or new views come naturally", keyIdea: "audit and replay" },
      { id: "snap", criterion: "Replay time grows with history, so snapshots every K events bound it", keyIdea: "snapshots bound replay" },
    ],
    exemplar:
      "Event sourcing stores the sequence of events that happened, and derives current state by replaying them, so the full history is the data. That gives audit, the ability to reconstruct any past state, and new read models built by replay. Replay time grows with the number of events, so I would save a snapshot every few thousand events and load the latest snapshot plus the events after it, which keeps loads fast regardless of age.",
  },
  reviews: [
    {
      id: "es-est",
      format: "estimate",
      scenario: "Events replay at 100,000 a second and you snapshot every 10,000 events. On average about how many milliseconds of replay does a load need, ignoring the snapshot fetch? (half the interval)",
      unit: "ms",
      answer: 50,
      acceptFactor: 1.05,
      breakdown: ["average events replayed = 10,000 ÷ 2 = 5,000", "5,000 ÷ 100,000 per second = 0.05 s", "= 50 ms"],
      explain: "On average the latest snapshot is half an interval old.",
    },
    {
      id: "es-pick",
      format: "pick-fix",
      scenario: "Loading a long-lived account takes 4 seconds because it has 400,000 events. What is the standard remedy that keeps the event log as the source of truth?",
      options: [
        { id: "a", label: "Take periodic snapshots and replay only the events since the latest" },
        { id: "b", label: "Delete old events" },
        { id: "c", label: "Store the current state instead and drop the events" },
        { id: "d", label: "Add a larger server" },
      ],
      answer: "a",
      explain: "Deleting events destroys the history that is the whole point. Snapshots are a cache of the replay and can be rebuilt from the log.",
    },
    {
      id: "es-order",
      format: "order",
      scenario: "Order these snapshot intervals by load time, slowest first.",
      items: [
        { id: "never", label: "Never" },
        { id: "k20000", label: "Every 20,000 events" },
        { id: "k5000", label: "Every 5,000 events" },
      ],
      answer: ["never", "k20000", "k5000"],
      explain: "Load time grows with the average replay length: the whole history, then 10,000 events, then 2,500.",
    },
    {
      id: "es-graph",
      format: "predict-graph",
      scenario: "As you lower the snapshot interval K from 100,000 events down to 50, what happens to the extra storage the snapshots take?",
      xLabel: "snapshot every K events (K falls) →",
      yLabel: "storage overhead",
      options: [
        { id: "rise", label: "Rises slowly, then sharply when K gets small", points: [0.1, 0.2, 0.4, 1.3, 2.7, 13, 27, 53] },
        { id: "flat", label: "Stays the same", points: [5, 5, 5, 5, 5, 5, 5, 5] },
        { id: "fall", label: "Falls", points: [53, 27, 13, 2.7, 1.3, 0.4, 0.2, 0.1] },
      ],
      answer: "rise",
      explain: "Storage overhead is snapshot size ÷ (K × event size), so it grows as 1 ÷ K and explodes for small K.",
    },
    {
      id: "es-flaw",
      format: "spot-flaw",
      scenario: "A team fixes a bug in their order-total calculation and wants past orders corrected. They update every row of a table holding current totals, but the old rows had no history, so nobody can say what was wrong before. Tap the design choice that lost the information.",
      diagram: {
        nodes: [
          { id: "event", label: "order changed", kind: "client", col: 0, row: 1 },
          { id: "update", label: "overwrite the total in place", kind: "server", col: 1, row: 1 },
          { id: "table", label: "current-state table only", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "event", to: "update" },
          { from: "update", to: "table" },
        ],
      },
      answer: "event->update",
      explain: "Overwriting in place throws away the sequence of changes. Keeping events lets you fix the calculation and replay to recompute every past state.",
    },
    {
      id: "es-explain",
      format: "explain",
      scenario: "In two sentences: why can event sourcing make schema changes harder than a normal database?",
      rubric: [
        { id: "immutable", criterion: "Events are stored forever and are immutable, so old event shapes must still be readable" },
        { id: "upcast", criterion: "You need versioning or upcasting to handle old events, and any change to derived state means replaying the history" },
      ],
      exemplar: "Events are kept permanently and never edited, so every old event shape must still be readable by the current code. Handling that needs event versioning or upcasting, and changing how state is derived means replaying the entire history.",
      explain: "The past is a contract.",
    },
  ],
  codex: {
    oneLiner: "Store events, derive state by replay. History and audit come free; snapshots bound replay time; new views come from replaying the log.",
    keyNumbers: [
      { label: "Average replay with a snapshot every K events", value: "K ÷ 2 events", sourceId: "azure-es" },
      { label: "Snapshot storage overhead", value: "snapshot size ÷ (K × event size)", sourceId: "azure-es" },
    ],
    tradeoffs: [
      { choice: "Event sourcing", gain: "Full history, audit, rebuildable views", cost: "Replay cost; event versioning; harder queries" },
      { choice: "Frequent snapshots", gain: "Fast loads", cost: "Storage and extra writes" },
      { choice: "Parallel rebuild", gain: "Faster new read models", cost: "Needs partitioning by key" },
    ],
    seenIn: ["Ledgers and financial systems.", "Axon, EventStoreDB and Kafka-based event stores."],
    interviewAngle: "Say: 'events are the source of truth, state is a fold; snapshots every few thousand events, projections for queries, upcasting for old event versions'.",
    aws: [{ concept: "Append-only event store with streams to read models", service: "DynamoDB + Streams, Kinesis" }],
    replay: { id: "sourcing-lab", config: { start: { every: 5000, workers: 8 } }, scene: "snapshot" },
  },
  interview: [
    "What is event sourcing and when is it worth it?",
    "How do snapshots work in an event-sourced system?",
    "How do you change the shape of an event after it has been stored?",
  ],
  deeper: [
    {
      title: "When not to use it",
      body: "Event sourcing suits domains where history is the point: ledgers, orders, audit trails. For simple create-read-update-delete data it adds replay, versioning and query complexity for little gain. Many teams adopt it for the one or two aggregates that need an audit trail, and keep the rest as ordinary tables.",
      sourceIds: ["fowler-es", "ddia"],
    },
  ],
  honestPhysics: [
    "An account whose state is the replay of its events. One event is about 300 bytes and replays at 100,000 events a second. This account has 200,000 events. A snapshot is 4 KB and is fetched in about 5 ms.",
    "Loading replays the events since the last snapshot, on average K ÷ 2. Storage overhead is 4,000 bytes per K events of 300 bytes each; writes rise by one per K events.",
    "Rebuilding a read model replays 5 billion events at 200,000 a second per worker, split across the workers chosen.",
  ],
  sources: [FOWLER_ES, AZURE_ES, DDIA],
  verify: [
    { id: "none", claim: "With no snapshots a 200,000-event account takes 2 seconds to load", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { every: 0 }, metric: "loadMs" }, expect: { min: 2000, max: 2000 } },
    { id: "k5000", claim: "A snapshot every 5,000 events brings it to 30 ms", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { every: 5000 }, metric: "loadMs" }, expect: { min: 29, max: 31 } },
    { id: "k5000-st", claim: "…for under 1% extra storage", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { every: 5000 }, metric: "storageOverhead" }, expect: { max: 0.01 } },
    { id: "k50", claim: "A snapshot every 50 events costs over 20% extra storage", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { every: 50 }, metric: "storageOverhead" }, expect: { min: 0.2 } },
    { id: "k12000", claim: "A snapshot every 12,000 events is too slow to load", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { every: 12000 }, metric: "loadMs" }, expect: { min: 60 } },
    { id: "one-worker", claim: "One worker takes about 7 hours to rebuild", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { workers: 1 }, metric: "rebuildHours" }, expect: { min: 6.5, max: 7.5 } },
    { id: "four-workers", claim: "Four workers do it in under 2 hours", run: "lab", params: { model: "sourcing-lab", config: ES_CHALLENGE, values: { workers: 4 }, metric: "rebuildHours" }, expect: { max: 2 } },
  ],
});
