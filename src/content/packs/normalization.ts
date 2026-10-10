import { definePack } from "../define";

export const JOIN = {};

const CODD = { id: "codd-1970", title: "E. F. Codd (1970), A Relational Model of Data for Large Shared Data Banks, Communications of the ACM 13(6)", url: "https://doi.org/10.1145/362384.362685" };
const WIKI_NORM = { id: "wiki-normalization", title: "Wikipedia: Database normalization (normal forms, update anomalies, denormalization)", url: "https://en.wikipedia.org/wiki/Database_normalization" };
const KLEPPMANN = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 2 and 3 (normalization, denormalization, joins)", url: "https://dataintensive.net/" };

export default definePack({
  id: "normalization",
  title: "Normalization vs Denormalization",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Feed query · p95", detail: "four joins, 50 posts, and a user who renamed themselves" },
    lines: [
      { speaker: "kabir", line: "The feed joins posts to users on every row, and one user's old name still shows on some of their posts. Which problem is bigger?" },
      { speaker: "meera", line: "They are one trade seen from two sides: storing a fact once is correct, and copying it is fast. Choose per fact." },
    ],
  },
  predictions: [
    {
      id: "copy-hot",
      kind: "choice",
      prompt: "Each post stores its author's follower count as a copy, so the feed needs no join. An author with 400 posts gains a follower. About how many rows must be rewritten to keep every copy right?",
      options: [
        { id: "one", label: "One, the author's row" },
        { id: "fifty", label: "About 50, the feed page" },
        { id: "four-hundred", label: "About 400, every post they wrote" },
        { id: "none", label: "None; copies update themselves" },
      ],
      answer: "four-hundred",
      observe: "copied-hot",
      reveal: {
        text: "Every post carries its own copy, so a change to the author's value means rewriting all of that author's posts. A follower count that changes hundreds of times a second turns into tens of thousands of row writes a second.",
        derived: true,
        line: { speaker: "meera", line: "A copy is a promise to keep updating it. Make sure the fact is worth it." },
      },
    },
  ],
  widget: { id: "join-lab", config: JOIN },
  mechanism: [
    {
      id: "normal",
      scene: "join",
      text: "Normalising means storing each fact once and referring to it by key. An author's name lives in the users table and posts point at it. A rename is one write, and there is no copy that can disagree. Codd introduced the relational model on this idea.",
      sourceIds: ["codd-1970", "wiki-normalization"],
    },
    {
      id: "join-cost",
      text: "The price is the join. To show a post with its author the database looks up the user for each post, so a feed of 50 posts does 50 extra lookups. Indexed joins are cheap, but they add latency and CPU to every read, and a read-heavy product pays it constantly.",
      sourceIds: ["ddia"],
    },
    {
      id: "denormal",
      scene: "copy",
      text: "Denormalising copies a fact into the rows that need it. Reads become a single-table lookup. Writes become wider: every copy must be updated when the fact changes, and a failed update leaves a stale copy. It pays when the fact rarely changes and is read constantly.",
      sourceIds: ["wiki-normalization", "ddia"],
    },
    {
      id: "third",
      scene: "cache",
      text: "A third option suits hot values like counters: keep them out of both places and load them from a cache or a separate store when rendering. You avoid the join and the write amplification, and accept a few seconds of staleness.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "feed-schema",
      title: "Decide join, copy, or cache",
      brief: "The feed shows 50 posts, each with the author's name, avatar, verified badge and follower count. Choose how to serve each column so the feed query takes at most 4 ms and no more than 1,000 rows a second are rewritten by copies. Each author has about 400 posts.",
      line: { speaker: "rao", line: "Every row rewrite is I/O on the primary. I have a number in mind and it is not eighty thousand." },
      widget: { id: "join-lab", config: JOIN },
      conditions: [
        { metric: "readMs", op: "<=", value: 4, label: "Feed query at most 4 ms" },
        { metric: "writeRowsPerSec", op: "<=", value: 1000, label: "At most 1,000 copied rows rewritten per second" },
      ],
      stars: [{ metric: "writeRowsPerSec", op: "<=", value: 100, label: "Under 100 rows a second" }],
      hints: [
        "Which column changes constantly, and what would copying it cost?",
        "Which columns almost never change? What does a join cost compared with a copy of them?",
        "Even one join keeps the feed over 4 ms. What can serve the hot counter without a join or a copy?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the tradeoff between normalised and denormalised schemas, and how you decide per column.",
    rubric: [
      { id: "norm", criterion: "Normalised data stores each fact once, so updates are simple and consistent, but reads need joins", keyIdea: "one copy, joins on read" },
      { id: "denorm", criterion: "Denormalised data copies facts to speed reads, but every change must update all copies and they can go stale", keyIdea: "fast reads, wide writes" },
      { id: "decide", criterion: "Decides by read frequency versus change frequency of each fact: copy what rarely changes and is read a lot, keep or cache what changes often", keyIdea: "reads versus changes" },
    ],
    exemplar:
      "A normalised schema stores each fact once and joins at read time, so a change is one write and there are no disagreeing copies, but reads pay for the join. Denormalising copies the fact into the rows that use it so reads are cheap, but a change rewrites every copy and a missed update leaves stale data. I decide per column: copy facts that rarely change and are read constantly, and keep or cache the ones that change often.",
  },
  reviews: [
    {
      id: "no-est",
      format: "estimate",
      scenario: "An author has 400 posts, each with a copy of the author's name. They rename themselves. How many rows must be updated to keep the copies right?",
      unit: "rows",
      answer: 400,
      acceptFactor: 1.1,
      breakdown: ["One copy per post", "400 posts", "= 400 rows"],
      explain: "Copies multiply the cost of a change by the number of places the fact lives.",
    },
    {
      id: "no-est2",
      format: "estimate",
      scenario: "A value changes 200 times a second system-wide, and each change would rewrite 400 copies. How many row writes a second is that?",
      unit: "rows/s",
      answer: 80000,
      acceptFactor: 1.1,
      breakdown: ["200 changes/s × 400 copies", "= 80,000 row writes/s"],
      explain: "A hot value is the worst thing to copy: the write load dwarfs any read savings.",
    },
    {
      id: "no-pick",
      format: "pick-fix",
      scenario: "An order must keep the unit price the customer paid even if the product's price changes later. What does that suggest?",
      options: [
        { id: "a", label: "Copy the price onto the order line: the fact is a snapshot, not a reference" },
        { id: "b", label: "Join to the product price when displaying the order" },
        { id: "c", label: "Update old orders when the price changes" },
        { id: "d", label: "Store prices only in a cache" },
      ],
      answer: "a",
      explain: "Some copies are not denormalisation at all: they record what was true at that moment. An invoice must not change when a catalogue price does.",
    },
    {
      id: "no-order",
      format: "order",
      scenario: "Order these columns by how safe they are to copy into every post, safest first.",
      items: [
        { id: "verified", label: "Verified badge (changes a few times a day)" },
        { id: "name", label: "Display name (changes a few thousand times a day)" },
        { id: "likes", label: "Like count (changes constantly)" },
        { id: "followers", label: "Follower count (changes hundreds of times a second)" },
      ],
      answer: ["verified", "name", "likes", "followers"],
      explain: "Safe to copy means rare to change. Counters sit at the other end and belong in a cache or a counter store.",
    },
    {
      id: "no-flaw",
      format: "spot-flaw",
      scenario: "Customer addresses are stored in the customers table, and also copied into orders, invoices, shipments, and a marketing table. After a move, some documents show the old address. Tap the part of the design that causes it.",
      diagram: {
        nodes: [
          { id: "cust", label: "customers · address", kind: "db", col: 0, row: 1 },
          { id: "copies", label: "4 more tables, each with its own copy of the address", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "cust", to: "copies" }],
      },
      answer: "copies",
      explain: "Four unmanaged copies of a fact that changes will drift. Either reference the customer's current address where that is right, or snapshot it deliberately where history matters, and keep the rest as one source of truth.",
    },
    {
      id: "no-explain",
      format: "explain",
      scenario: "In two sentences: when is denormalising a column a good idea?",
      rubric: [
        { id: "rare", criterion: "The value changes rarely, so rewriting its copies is cheap" },
        { id: "read", criterion: "It is read very often, so avoiding the join pays off" },
      ],
      exemplar: "When the value rarely changes, so keeping its copies in sync is cheap, and it is read constantly, so skipping the join saves a lot. Hot values that change often belong elsewhere.",
      explain: "Copy cold facts that are read hot.",
    },
  ],
  codex: {
    oneLiner: "Normalise to store each fact once; denormalise to make reads cheap. Copy what is read hot and changes cold; cache what changes hot.",
    keyNumbers: [
      { label: "Cost of a change with copies", value: "changes × copies rows rewritten", sourceId: "ddia" },
      { label: "Relational model", value: "facts stored once, related by keys", sourceId: "codd-1970" },
    ],
    tradeoffs: [
      { choice: "Normalised with joins", gain: "One source of truth; cheap writes", cost: "Joins on every read" },
      { choice: "Denormalised copies", gain: "Single-row reads", cost: "Write amplification; stale copies after a failure" },
      { choice: "Cache the hot value", gain: "No join, no rewrite", cost: "A few seconds of staleness; another component" },
    ],
    seenIn: ["Feeds, product pages, and dashboards that avoid joins.", "Invoices that snapshot prices and addresses."],
    interviewAngle: "Say which columns you would copy and why: 'author name and avatar change rarely so I copy them into posts; follower counts change constantly so they come from a cache.'",
    aws: [{ concept: "Denormalised reads", service: "DynamoDB single-table design, or Postgres materialised views" }],
    replay: { id: "join-lab", config: JOIN, scene: "copy" },
  },
  interview: [
    "When would you denormalise, and what do you take on when you do?",
    "How do you keep copies consistent?",
    "Where would you keep a follower count?",
  ],
  deeper: [
    {
      title: "Materialised views and derived data",
      body: "Instead of copying columns by hand, a materialised view or a derived table computed from the source of truth does it for you, refreshed on a schedule or by events. The source stays normalised and the derived copy is rebuildable, which makes a stale or corrupted copy a recoverable problem instead of a silent one.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "The feed shows 50 posts. A join adds about 4 ms plus 0.4 ms per joined column group, and a batched cache lookup about 0.5 ms. Real costs depend on indexes, caching, and the planner.",
    "Each author has about 400 posts, and change rates are per second for the whole system.",
    "Copies can go stale if an update fails midway. The lab does not count that as a rate.",
  ],
  sources: [CODD, WIKI_NORM, KLEPPMANN],
  verify: [
    { id: "all-join", claim: "Joining everything costs more than 4 ms", run: "lab", params: { model: "join-lab", config: JOIN, values: {}, metric: "readMs" }, expect: { min: 4 } },
    { id: "copy-hot", claim: "Copying the follower count rewrites tens of thousands of rows a second", run: "lab", params: { model: "join-lab", config: JOIN, values: { followers: "copy" }, metric: "writeRowsPerSec" }, expect: { min: 50000 } },
    { id: "good", claim: "Copying the three stable columns and caching followers reads in 2.5 ms", run: "lab", params: { model: "join-lab", config: JOIN, values: { name: "copy", avatar: "copy", verified: "copy", followers: "cache" }, metric: "readMs" }, expect: { max: 4 } },
    { id: "good-writes", claim: "…at under 100 rows rewritten a second", run: "lab", params: { model: "join-lab", config: JOIN, values: { name: "copy", avatar: "copy", verified: "copy", followers: "cache" }, metric: "writeRowsPerSec" }, expect: { max: 100 } },
    { id: "one-join", claim: "Leaving the follower count as a join keeps the feed over 4 ms", run: "lab", params: { model: "join-lab", config: JOIN, values: { name: "copy", avatar: "copy", verified: "copy", followers: "join" }, metric: "readMs" }, expect: { min: 4 } },
  ],
});
