import { definePack } from "../define";

export const CQRS = { start: { cqrs: false, lagMs: 2000, pin: false } };
export const CQRS_CHALLENGE = { start: { cqrs: false, lagMs: 2000, pin: false } };

const FOWLER_CQRS = { id: "fowler-cqrs", title: "M. Fowler: CQRS", url: "https://martinfowler.com/bliki/CQRS.html" };
const AZURE_CQRS = { id: "azure-cqrs", title: "Microsoft Azure Architecture Center: CQRS pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 11: Deriving state from event logs (CQRS)", url: "https://dataintensive.net/" };

export default definePack({
  id: "cqrs",
  title: "CQRS",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "catalog-db · read queries 38% of CPU, 12 joins each", detail: "writes are 1% of traffic" },
    lines: [
      { speaker: "kabir", line: "Every product page joins twelve tables, a hundred times for each product update. The normalised model is lovely for writes and expensive for the thing we do most." },
      { speaker: "meera", line: "Writes want a tidy model, reads want one shaped like the page. Keep both, and let a projection keep the second up to date." },
    ],
  },
  predictions: [
    {
      id: "fast",
      kind: "choice",
      prompt: "A read from the normalised tables joins several tables and takes 40 ms. A pre-built view shaped like the page takes about 2 ms. At 100 reads for every write, what does a separate read model do to the database load per read?",
      options: [
        { id: "same", label: "Nothing" },
        { id: "half", label: "Halves it" },
        { id: "twenty", label: "Cuts it about twenty times" },
        { id: "up", label: "Raises it" },
      ],
      answer: "twenty",
      observe: "fast-read",
      reveal: {
        text: "The view answers from one denormalised record, 0.2 units of database work instead of 4: twenty times less. The joins are paid once, on each write, instead of on each of the hundred reads that follow it.",
        derived: true,
        line: { speaker: "meera", line: "Do the expensive work where it happens least often." },
      },
    },
    {
      id: "stale",
      kind: "choice",
      prompt: "The projection trails the write side by 2 seconds, and a user changes their listing about once a minute. What share of reads misses the user's own change?",
      options: [
        { id: "none", label: "None" },
        { id: "tiny", label: "About 0.3%" },
        { id: "few", label: "About 3.3%" },
        { id: "many", label: "About 30%" },
      ],
      answer: "few",
      observe: "stale-own",
      reveal: {
        text: "A read is stale if it comes within the lag of the user's last write: 1 − e^(−2 ÷ 60) = 3.3%. Most users will not see it, and some will see their change vanish. Pinning their reads to the write side for a few seconds after a write closes the gap for almost nothing.",
        derived: true,
        line: { speaker: "rao", line: "The lag is invisible to everyone except the person who just pressed save." },
      },
    },
  ],
  widget: { id: "cqrs-lab", config: CQRS },
  mechanism: [
    {
      id: "split",
      scene: "split",
      text: "CQRS, command query responsibility segregation, uses different models for changing data and for reading it. Commands go to a write model shaped for correctness. Reads come from one or more read models shaped for the screens, often denormalised and cached.",
      sourceIds: ["fowler-cqrs", "azure-cqrs"],
    },
    {
      id: "projection",
      text: "A projection keeps the read model current by consuming the changes, from the database log or from events. This is extra machinery: another store to run, a pipeline to monitor, and a way to rebuild the read model when the projection has a bug. That cost is why CQRS is not a default.",
      sourceIds: ["azure-cqrs", "ddia"],
    },
    {
      id: "lag",
      scene: "lag",
      text: "The read model is eventually consistent. Between the write and the projection catching up, reads show the old state. A user who has just saved something may not see it, with chance 1 − e^(−lag ÷ gap between their writes). Tell users, or handle read-your-writes explicitly.",
      sourceIds: ["fowler-cqrs"],
      derived: true,
    },
    {
      id: "pin",
      scene: "pin",
      text: "A cheap fix is to read from the write side for a few seconds after a user's own write, then go back to the read model. Only the writer's reads pay the cost of the slower path, and everyone else keeps the fast one. It is the same trick as with read replicas.",
      sourceIds: ["ddia"],
    },
  ],
  challenges: [
    {
      id: "read-side",
      title: "Make reads cheap, keep users happy",
      brief: "A catalogue with 100 reads for each write. Get reads under 10 ms, writes under 15 ms, database load per read under 1 unit, and no more than 0.1% of reads missing the user's own change, with a projection that lags by 2 seconds.",
      line: { speaker: "kabir", line: "The page has to be fast and the seller has to see what they just saved." },
      widget: { id: "cqrs-lab", config: CQRS_CHALLENGE },
      conditions: [
        { metric: "readMs", op: "<=", value: 10, label: "Reads under 10 ms" },
        { metric: "writeMs", op: "<=", value: 15, label: "Writes under 15 ms" },
        { metric: "readLoad", op: "<=", value: 1, label: "Under 1 unit of database load per read" },
        { metric: "ownMiss", op: "<=", value: 0.001, label: "At most 0.1% of own writes missed" },
      ],
      stars: [],
      hints: [
        "What does a separate read model do for read time and load?",
        "What new problem does the projection's lag create?",
        "Which reads must be treated differently?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain CQRS: what it separates, what it buys, and what it costs.",
    rubric: [
      { id: "split", criterion: "Commands update a write model while queries read from a separate read model shaped for the screens", keyIdea: "separate write and read models" },
      { id: "buy", criterion: "Reads become fast and cheap since joins are done once at write time", keyIdea: "cheap reads" },
      { id: "cost", criterion: "The read model is eventually consistent and needs a projection to maintain and rebuild", keyIdea: "lag and machinery" },
    ],
    exemplar:
      "CQRS separates the model that handles commands, tuned for correct writes, from one or more read models shaped for the screens. Reads get much faster and cheaper because the joins are done once when data changes, not on every read. The cost is a projection to build and run, and the read model is eventually consistent, so a user may not see their own change unless their reads are briefly routed to the write side.",
  },
  reviews: [
    {
      id: "cq-est",
      format: "estimate",
      scenario: "100 reads for each write, each normalised read costing 4 units of database work and each view read 0.2 units, with a write costing 5 units more to update the view. Per 100 reads and 1 write, how many units does the view save? (100 × 4 vs 100 × 0.2 + 5)",
      unit: "units",
      answer: 375,
      acceptFactor: 1.05,
      breakdown: ["without: 100 × 4 = 400", "with: 100 × 0.2 + 5 = 25", "saved: 375 units"],
      explain: "The work moves to the write. With reads far outnumbering writes, the trade is lopsided in the reader's favour.",
    },
    {
      id: "cq-pick",
      format: "pick-fix",
      scenario: "A CQRS system's seller updates a price and the product page shows the old one for a second. The seller reports it as a bug. What is the smallest change?",
      options: [
        { id: "a", label: "Serve the seller's reads from the write side for a few seconds after their write" },
        { id: "b", label: "Remove the read model" },
        { id: "c", label: "Make every read synchronous with the projection" },
        { id: "d", label: "Add a cache in front of the read model" },
      ],
      answer: "a",
      explain: "Only the writer notices the lag. Routing their reads to the write side briefly fixes it without slowing everyone else's.",
    },
    {
      id: "cq-order",
      format: "order",
      scenario: "Order these by database work per read, highest first.",
      items: [
        { id: "join", label: "Normalised join (4 units)" },
        { id: "view", label: "Denormalised view (0.2 units)" },
        { id: "cache", label: "A cache hit (almost none)" },
      ],
      answer: ["join", "view", "cache"],
      explain: "Each step moves work earlier. A join pays on every read; a view pays at write time; a cache hit pays nothing until it expires.",
    },
    {
      id: "cq-graph",
      format: "predict-graph",
      scenario: "A user writes about once a minute. As projection lag grows from 20 ms to 20 seconds, how does the share of reads missing their own latest write change, without pinning?",
      xLabel: "projection lag →",
      yLabel: "own writes missed",
      options: [
        { id: "rise", label: "Rises with the lag, bending over at the high end", points: [0.03, 0.1, 0.3, 1, 3.3, 8, 18, 28] },
        { id: "flat", label: "Stays about the same", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "fall", label: "Falls", points: [28, 18, 8, 3.3, 1, 0.3, 0.1, 0.03] },
      ],
      answer: "rise",
      explain: "A longer lag means a longer window after each write in which a read can be stale.",
    },
    {
      id: "cq-flaw",
      format: "spot-flaw",
      scenario: "A team adds CQRS to a small admin tool used by ten people, with a separate store and a projection. The projection has a bug and reports are wrong for a week. Tap the part that was not worth its cost.",
      diagram: {
        nodes: [
          { id: "write", label: "write model", kind: "db", col: 0, row: 1 },
          { id: "proj", label: "projection", kind: "worker", col: 1, row: 1 },
          { id: "read", label: "separate read store", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "write", to: "proj" },
          { from: "proj", to: "read" },
        ],
      },
      answer: "write->proj",
      explain: "With ten users and light load, one model is fast enough. The projection added a failure mode and lag for no gain. CQRS pays when reads dominate and are expensive.",
    },
    {
      id: "cq-explain",
      format: "explain",
      scenario: "In two sentences: when is CQRS not worth the trouble?",
      rubric: [
        { id: "simple", criterion: "When one model serves both reads and writes fast enough, since CQRS adds a projection and eventual consistency" },
        { id: "load", criterion: "It pays when reads and writes have very different shapes or volumes, such as heavy read joins against rare writes" },
      ],
      exemplar: "When a single model is already fast enough for both, the extra projection and eventual consistency are cost without gain. It pays when reads and writes differ greatly in shape or volume, such as expensive joins read far more often than data changes.",
      explain: "Reach for it when the read side is the problem.",
    },
  ],
  codex: {
    oneLiner: "Separate the write model from read models shaped for screens, kept current by a projection. Reads are fast; they trail writes slightly.",
    keyNumbers: [
      { label: "Own-write miss rate with lag L and a write every G seconds", value: "1 − e^(−L ÷ G)", sourceId: "fowler-cqrs" },
      { label: "Read cost, normalised join versus view (lab)", value: "4 versus 0.2 units", sourceId: "azure-cqrs" },
    ],
    tradeoffs: [
      { choice: "One model", gain: "Simple and immediately consistent", cost: "Reads pay for joins; one shape fits neither" },
      { choice: "CQRS", gain: "Fast cheap reads; models tuned separately", cost: "Projection to run; eventual consistency" },
      { choice: "Pin writer to the write side", gain: "Read-your-writes", cost: "A few slower reads" },
    ],
    seenIn: ["Search indexes and materialised views built from a primary database.", "Event-sourced systems with projections."],
    interviewAngle: "Say: 'CQRS when reads dominate and differ in shape from writes; a projection builds the read model; handle read-your-writes for the writer'.",
    aws: [{ concept: "Read models fed by change streams", service: "DynamoDB Streams + OpenSearch, Aurora + Lambda" }],
    replay: { id: "cqrs-lab", config: { start: { cqrs: true, lagMs: 2000, pin: true } }, scene: "pin" },
  },
  interview: [
    "What is CQRS?",
    "What are the downsides of CQRS?",
    "How do you give a user read-your-writes with a separate read model?",
  ],
  deeper: [
    {
      title: "CQRS does not require event sourcing",
      body: "The two are often discussed together, but a CQRS system can keep its write side in an ordinary relational database and build read models from a change feed. Event sourcing is a different choice, about how the write side stores its state. Using one does not oblige you to use the other.",
      sourceIds: ["fowler-cqrs"],
    },
  ],
  honestPhysics: [
    "100 reads for each write. A normalised read joins tables and takes 40 ms and 4 units of database work; a read from a denormalised view takes 2 ms and 0.2 units. A write takes 5 ms; maintaining the view adds 3 ms.",
    "A user writes about once a minute, so a read misses their own write with probability 1 − e^(−lag ÷ 60 s) unless their reads are pinned to the write side briefly after a write. Pinned reads take about half a millisecond more.",
    "The cost of building and running the projection is not modelled.",
  ],
  sources: [FOWLER_CQRS, AZURE_CQRS, DDIA],
  verify: [
    { id: "norm", claim: "A normalised read takes 40 ms", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: false }, metric: "readMs" }, expect: { min: 40, max: 40 } },
    { id: "view", claim: "A view read takes 2 ms with 20 times less load", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: true, pin: false }, metric: "readLoad" }, expect: { max: 0.2 } },
    { id: "stale", claim: "A 2-second lag misses 3.3% of own writes", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: true, pin: false, lagMs: 2000 }, metric: "ownMiss" }, expect: { min: 0.032, max: 0.034 } },
    { id: "pin", claim: "Pinning removes the misses", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: true, pin: true, lagMs: 2000 }, metric: "ownMiss" }, expect: { max: 0 } },
    { id: "pin-ms", claim: "…while reads stay under 10 ms", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: true, pin: true }, metric: "readMs" }, expect: { max: 10 } },
    { id: "write", claim: "The projection adds 3 ms to a write", run: "lab", params: { model: "cqrs-lab", config: CQRS, values: { cqrs: true }, metric: "writeMs" }, expect: { min: 8, max: 8 } },
  ],
});
