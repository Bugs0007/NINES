import { definePack } from "../define";

export const MULTI = { start: { regions: 3, strategy: "lww" } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5: Multi-leader replication (conflict resolution)", url: "https://dataintensive.net/" };
const SHAPIRO = { id: "shapiro-2011", title: "M. Shapiro et al. (2011), Conflict-free Replicated Data Types, SSS", url: "https://inria.hal.science/inria-00555588" };
const DDB_GLOBAL = { id: "dynamodb-global-tables", title: "AWS docs: DynamoDB global tables (multi-Region, multi-active; last-writer-wins reconciliation)", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html" };

export default definePack({
  id: "multi-leader",
  title: "Multi-leader Replication & Conflicts",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Collaborative docs · lost edits", detail: "two people edit one paragraph from different regions" },
    lines: [
      { speaker: "kabir", line: "We made editing fast everywhere by letting every region take writes. Now two people edit the same paragraph and one of them silently loses their change." },
      { speaker: "meera", line: "When two leaders accept a write to the same thing at the same time, somebody has to decide who wins. Last writer wins is a decision, not a free lunch." },
    ],
  },
  predictions: [
    {
      id: "lww-loss",
      kind: "choice",
      prompt: "Three regions each accept writes to 10,000 shared documents, 50 edits a day per region per document, with 150 ms between regions. Using last-writer-wins, how many edits are silently lost per day?",
      options: [
        { id: "zero", label: "None: timestamps sort it out" },
        { id: "few", label: "A handful, under 10" },
        { id: "hundreds", label: "Hundreds: about 260" },
        { id: "thousands", label: "Tens of thousands" },
      ],
      answer: "hundreds",
      observe: "conflicts-seen",
      reveal: {
        text: "Two regions conflict when they edit the same document within 150 ms of each other. At these rates that is about 87 conflicts a day for each pair of regions, and with three pairs, about 260. Last-writer-wins keeps one edit of each pair and drops the other without telling anyone.",
        derived: true,
        line: { speaker: "meera", line: "Rare per document, constant across ten thousand of them." },
      },
    },
  ],
  widget: { id: "multi-lab", config: MULTI },
  mechanism: [
    {
      id: "why",
      text: "Multi-leader replication lets several regions accept writes, each replicating to the others. Writes are fast for everyone because each user writes to a nearby leader, and a region keeps working if the others are unreachable. Offline clients and multi-region databases use the same idea.",
      sourceIds: ["ddia"],
    },
    {
      id: "conflict",
      scene: "conflict",
      text: "The price is conflicts. If two leaders accept writes to the same item before they hear about each other's, neither write is wrong, and the system has two competing versions. The chance of a conflict grows with write rate and with the replication delay, and with the number of regions, since each pair can collide.",
      sourceIds: ["ddia"],
      derived: true,
    },
    {
      id: "lww",
      scene: "lww",
      text: "Last-writer-wins resolves a conflict by keeping the write with the later timestamp and discarding the other. It is simple and converges, and it silently loses data. DynamoDB global tables reconcile concurrent writes this way. It is acceptable for a status flag and wrong for a shared document.",
      sourceIds: ["dynamodb-global-tables", "ddia"],
    },
    {
      id: "merge",
      scene: "merge",
      text: "Better options keep both. A CRDT is a data type designed so concurrent updates merge identically on every replica, such as counters, sets, and text structures. Or let the application resolve conflicts with its own rule. Or avoid them by giving each item a home region that takes all its writes, at the cost of distance for everyone else.",
      sourceIds: ["shapiro-2011", "ddia"],
    },
  ],
  challenges: [
    {
      id: "no-lost-edits",
      title: "Keep every edit, stay fast",
      brief: "Three regions take writes to shared documents. No edits may be silently lost, and the average write must take at most 30 ms. Choose the conflict rule.",
      line: { speaker: "rao", line: "A home region is simple, and it is a hundred milliseconds for half our users. I will not sign off on that." },
      widget: { id: "multi-lab", config: MULTI },
      conditions: [
        { metric: "lostWritesPerDay", op: "<=", value: 0, label: "No edits silently lost" },
        { metric: "remoteWriteMs", op: "<=", value: 30, label: "Average write at most 30 ms" },
      ],
      hints: [
        "Which rule drops data? Which one makes distant users wait?",
        "What would let both versions of a concurrent edit survive?",
        "Merging automatically has an engineering cost. Is it worth it here?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why multi-leader replication produces conflicts and compare three ways to handle them.",
    rubric: [
      { id: "why", criterion: "Several leaders accept writes to the same item concurrently before hearing of each other's, producing competing versions", keyIdea: "concurrent writes at different leaders" },
      { id: "lww", criterion: "Last-writer-wins keeps one write and silently discards the other", keyIdea: "LWW loses data" },
      { id: "alt", criterion: "Alternatives: merge with CRDTs or application rules, or avoid conflicts with a home region per item at the cost of latency for distant users", keyIdea: "merge or avoid" },
    ],
    exemplar:
      "Each leader accepts writes locally, so two leaders can accept writes to the same item before they hear about each other's, and the system ends up with two competing versions. Last-writer-wins keeps the later one and silently discards the other. I can instead merge them with a CRDT or an application rule so both edits survive, or avoid conflicts by giving each item a home region, which makes distant users pay the round trip.",
  },
  reviews: [
    {
      id: "ml-est",
      format: "estimate",
      scenario: "Two regions each write the same document once every 20 minutes on average, and replication takes 200 ms. About what share of the time is a conflict possible at all, using 2 × rate × delay? (rate per second)",
      unit: "%",
      answer: 0.03,
      acceptFactor: 1.5,
      breakdown: ["λ = 1 ÷ 1,200 s = 0.00083 per second", "Another write lands within ±0.2 s: 2 × 0.2 × 0.00083", "≈ 0.00033 = 0.033% of writes conflict"],
      explain: "Per document the chance is tiny; the trouble is the number of documents and regions, so conflicts become a steady daily trickle.",
    },
    {
      id: "ml-pick",
      format: "pick-fix",
      scenario: "A shopping cart is edited from a phone and a laptop at the same time while offline. Last-writer-wins drops items. Which data design avoids losing items?",
      options: [
        { id: "a", label: "Model the cart as a set that merges (add-wins), so concurrent adds from both devices are both kept" },
        { id: "b", label: "Use a bigger timestamp" },
        { id: "c", label: "Lock the cart on the server" },
        { id: "d", label: "Reject the second device's edit" },
      ],
      answer: "a",
      explain: "A set CRDT merges concurrent additions without needing to choose. Lockout and rejection do not work offline, and a bigger timestamp is still last-writer-wins.",
    },
    {
      id: "ml-order",
      format: "order",
      scenario: "Order these conflict strategies by how many edits are lost, most first.",
      items: [
        { id: "lww", label: "Last writer wins" },
        { id: "merge", label: "Merge with a CRDT" },
        { id: "home", label: "Home region per item" },
        { id: "ser", label: "A single global leader" },
      ],
      answer: ["lww", "merge", "home", "ser"],
      explain: "LWW discards one side of each conflict. Merges, home regions, and a single leader keep every edit, with different latency and complexity costs.",
    },
    {
      id: "ml-graph",
      format: "predict-graph",
      scenario: "Add regions that accept writes, from 2 to 5, with a fixed write rate per region. How does the number of conflicts per day change?",
      xLabel: "regions →",
      yLabel: "conflicts per day",
      options: [
        { id: "flat", label: "Flat", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "linear", label: "Grows in proportion to the number of regions", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "quad", label: "Grows faster than the number of regions, with the number of pairs", points: [0.5, 1.5, 3, 4.5, 6, 7, 7.6, 8] },
        { id: "fall", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "quad",
      explain: "Each pair of regions can conflict, and the number of pairs grows with the square of the regions: 1, 3, 6, 10 for 2, 3, 4, 5.",
    },
    {
      id: "ml-flaw",
      format: "spot-flaw",
      scenario: "A multi-region profile service resolves conflicts by comparing wall-clock timestamps from each region's servers, and users sometimes see their newer edit overwritten by an older one. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "r1", label: "region A · clock 120 ms fast", kind: "server", col: 0, row: 0 },
          { id: "r2", label: "region B · clock accurate", kind: "server", col: 0, row: 2 },
          { id: "lww", label: "last writer wins by wall-clock timestamp", kind: "db", col: 1, row: 1 },
        ],
        edges: [
          { from: "r1", to: "lww" },
          { from: "r2", to: "lww" },
        ],
      },
      answer: "lww",
      explain: "Clocks on different machines disagree, so 'later' by timestamp can be earlier in reality. Use logical clocks or version vectors for ordering, or a merge that does not depend on time.",
    },
    {
      id: "ml-explain",
      format: "explain",
      scenario: "In two sentences: why is last-writer-wins easy but dangerous?",
      rubric: [
        { id: "easy", criterion: "It needs only a timestamp comparison and makes every replica converge to the same value" },
        { id: "danger", criterion: "It silently discards one of two concurrent writes, and clock skew can even pick the wrong one" },
      ],
      exemplar: "It only compares timestamps and makes all replicas agree on one value. But it throws away one of two concurrent writes without telling anyone, and clock differences can make it pick the wrong one.",
      explain: "Convergence is not the same as correctness.",
    },
  ],
  codex: {
    oneLiner: "Multi-leader means local fast writes and conflicts on concurrent edits. Last-writer-wins loses data; merge with CRDTs or give each item a home region.",
    keyNumbers: [
      { label: "Conflicts per pair of regions", value: "items × 2 λ² Δ for rate λ and delay Δ", sourceId: "ddia" },
      { label: "Pairs of regions", value: "n(n − 1) ÷ 2", sourceId: "ddia" },
      { label: "DynamoDB global tables", value: "last-writer-wins reconciliation", sourceId: "dynamodb-global-tables" },
    ],
    tradeoffs: [
      { choice: "Last-writer-wins", gain: "Simple; converges", cost: "Silently loses concurrent writes" },
      { choice: "CRDT or custom merge", gain: "Keeps every edit", cost: "Engineering effort; limited to data types that merge" },
      { choice: "Home region per item", gain: "No conflicts", cost: "Distant users pay round-trip latency" },
    ],
    seenIn: ["DynamoDB global tables, Cosmos DB multi-region writes.", "Collaborative editors and offline-first apps."],
    interviewAngle: "State the conflict rule explicitly when you propose multi-region writes: 'LWW for flags, CRDTs for collaborative data, a home region for money.'",
    aws: [{ concept: "Multi-region writes", service: "DynamoDB global tables; Aurora global database (single writer region)" }],
    replay: { id: "multi-lab", config: MULTI, scene: "lww" },
  },
  interview: [
    "Why would you use multi-leader replication, and what problems does it bring?",
    "How do you resolve write conflicts?",
    "Why is last-writer-wins risky?",
  ],
  deeper: [
    {
      title: "CRDTs in one paragraph",
      body: "A conflict-free replicated data type defines its merge so that it is commutative, associative, and idempotent: replicas can apply the same set of updates in any order, any number of times, and end up identical. A grow-only counter, an add-wins set, and structures for collaborative text all work this way. The cost is that you must express your data in those types, and some meanings, such as 'the balance may not go negative', do not merge.",
      sourceIds: ["shapiro-2011"],
    },
  ],
  honestPhysics: [
    "A conflict is two regions writing the same item within the replication delay of each other. The lab uses 10,000 items, 50 writes a day per region per item, and 150 ms between regions.",
    "Last-writer-wins drops one write per conflict. A merge keeps both. A home region removes conflicts and sends remote users' writes across the world.",
    "Home-region latency assumes users are spread evenly over the regions.",
  ],
  sources: [DDIA, SHAPIRO, DDB_GLOBAL],
  verify: [
    { id: "lww-loss", claim: "Three regions with last-writer-wins lose about 260 edits a day", run: "lab", params: { model: "multi-lab", config: MULTI, values: { regions: 3, strategy: "lww" }, metric: "lostWritesPerDay" }, expect: { min: 240, max: 280 } },
    { id: "home", claim: "A home region averages over 100 ms for writes", run: "lab", params: { model: "multi-lab", config: MULTI, values: { strategy: "home" }, metric: "remoteWriteMs" }, expect: { min: 100 } },
    { id: "merge-lost", claim: "A merge loses nothing", run: "lab", params: { model: "multi-lab", config: MULTI, values: { strategy: "merge" }, metric: "lostWritesPerDay" }, expect: { max: 0 } },
    { id: "merge-ms", claim: "…and keeps writes at 5 ms", run: "lab", params: { model: "multi-lab", config: MULTI, values: { strategy: "merge" }, metric: "remoteWriteMs" }, expect: { max: 30 } },
    { id: "pairs", claim: "Five regions have over three times the conflicts of three", run: "lab", params: { model: "multi-lab", config: MULTI, values: { regions: 5, strategy: "lww" }, metric: "conflictsPerDay" }, expect: { min: 800 } },
  ],
});
