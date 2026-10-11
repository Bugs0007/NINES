import { definePack } from "../define";

export const BTREE = { lockRows: false, rows: 500000000 };
export const BTREE_CHALLENGE = { lockRows: true, rows: 500000000 };

const PG_BTREE = { id: "pg-btree", title: "PostgreSQL docs: B-Tree indexes (structure and implementation)", url: "https://www.postgresql.org/docs/current/btree.html" };
const PG_PAGE = { id: "pg-page-layout", title: "PostgreSQL docs: Database Page Layout (the default block size is 8 kB)", url: "https://www.postgresql.org/docs/current/storage-page-layout.html" };
const UTI = { id: "use-the-index-luke", title: "M. Winand, Use The Index, Luke: SQL indexing and tuning for developers", url: "https://use-the-index-luke.com/" };

export default definePack({
  id: "indexes-btree",
  title: "Indexes & B-trees",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "postgres · messages", detail: "conversation load 62 s, table 500M rows" },
    lines: [
      { speaker: "pager", line: "Opening a conversation takes a minute. The query has a WHERE clause and the table has an id, so what is it doing?" },
      { speaker: "meera", line: "Reading every row to find the few it wants. A B-tree is how a database avoids that." },
    ],
  },
  predictions: [
    {
      id: "depth",
      kind: "choice",
      prompt: "A B-tree index node holds about 300 entries. For a table of 500 million rows, how many pages does a lookup read from the root down to the right leaf?",
      options: [
        { id: "two", label: "About 2" },
        { id: "four", label: "About 4" },
        { id: "ten", label: "About 10" },
        { id: "hundred", label: "About 100" },
      ],
      answer: "four",
      observe: "indexed",
      reveal: {
        text: "Each level multiplies the reachable rows by about 300: 300, 90,000, 27 million, 8 billion. Four levels cover 500 million rows, so a lookup reads about four pages, instead of scanning a table of six million.",
        derived: true,
        line: { speaker: "meera", line: "Depth grows with the logarithm of the table. Doubling it adds almost nothing." },
      },
    },
  ],
  widget: { id: "btree-lab", config: BTREE },
  mechanism: [
    {
      id: "scan",
      scene: "scan",
      text: "Without an index the database reads the table from start to finish: 500 million rows at 80 per 8 KB page is over six million pages. Even at sequential speed that takes about a minute, and it grows with every row you add.",
      sourceIds: ["pg-page-layout"],
      derived: true,
    },
    {
      id: "tree",
      scene: "tree",
      text: "A B-tree keeps keys in sorted order across wide, shallow pages. Each page points to child pages for key ranges, so a lookup follows one path from the root to a leaf. With hundreds of entries per page, even billions of rows need only a handful of levels.",
      sourceIds: ["pg-btree"],
    },
    {
      id: "range",
      text: "Sorted keys also make ranges and ordering cheap: find the first key, then walk the leaves in order. That is why one index serves equality, range, and ORDER BY queries on its leading column. It does not help with LIKE '%word%', functions on the column, or leading columns you do not filter on.",
      sourceIds: ["use-the-index-luke"],
    },
    {
      id: "cost",
      scene: "writes",
      text: "Indexes are not free. Every insert and update must also update each index, so each one makes writes slower and takes disk and cache space. Add the indexes your real queries need, and drop the ones nobody uses.",
      sourceIds: ["pg-btree"],
    },
  ],
  challenges: [
    {
      id: "pick-indexes",
      title: "Index what the app asks",
      brief: "Pigeon has 500 million messages. The app runs three queries: a conversation's last 50, one user's last 100, and the last minute's messages. A search box also runs LIKE '%word%' on body. Add indexes so every query is under 20 ms without making inserts cost more than 2.6 ms.",
      line: { speaker: "rao", line: "Every index is disk I pay for and a write I wait for. Index what the app asks, not what it might ask someday." },
      widget: { id: "btree-lab", config: BTREE_CHALLENGE },
      conditions: [
        { metric: "worstMs", op: "<", value: 20, label: "Every listed query under 20 ms" },
        { metric: "writeMs", op: "<=", value: 2.6, label: "Insert cost at most 2.6 ms" },
      ],
      stars: [{ metric: "indexGB", op: "<=", value: 15, label: "Indexes under 15 GB in total" }],
      hints: [
        "Which of the three queries is still doing a full scan?",
        "What does each extra index do to the insert cost shown on the right?",
        "Can a B-tree on body make a '%word%' search fast?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how a B-tree index makes a lookup fast, and what it costs.",
    rubric: [
      { id: "tree", criterion: "A wide, shallow tree of sorted keys: a lookup follows one path from root to leaf, so depth grows with the log of the table", keyIdea: "log-depth tree" },
      { id: "range", criterion: "Sorted order makes ranges and ORDER BY cheap, but the index only helps queries on its leading columns", keyIdea: "sorted order" },
      { id: "cost", criterion: "Each index slows writes and takes space, so index what queries need", keyIdea: "write and space cost" },
    ],
    exemplar:
      "A B-tree keeps keys in sorted pages with hundreds of entries each, so a lookup follows one short path from the root to a leaf, and the depth grows with the logarithm of the table. Sorted order also makes ranges and ordering cheap, though it only helps queries on the leading columns of the index. The cost is that every insert and update maintains each index and every index takes space, so I add the ones the queries need.",
  },
  reviews: [
    {
      id: "ib-est-pages",
      format: "estimate",
      scenario: "A table has 100 million rows at 80 rows per 8 KB page. About how many pages does a full scan read?",
      unit: "pages",
      answer: 1250000,
      acceptFactor: 1.2,
      breakdown: ["100,000,000 ÷ 80", "= 1,250,000 pages", "≈ 10 GB at 8 KB each"],
      explain: "Over a million pages for one query. Doubling the table doubles this; an index lookup barely changes.",
    },
    {
      id: "ib-est-depth",
      format: "estimate",
      scenario: "An index node holds about 300 entries. How many levels does a B-tree need for 27 million rows?",
      unit: "levels",
      answer: 3,
      acceptFactor: 1.2,
      breakdown: ["300 × 300 × 300 = 27,000,000", "= 3 levels"],
      explain: "Each level multiplies reach by the fanout. Three levels cover tens of millions of rows; four cover billions.",
    },
    {
      id: "ib-pick",
      format: "pick-fix",
      scenario: "A search page runs WHERE name LIKE '%smith%' on a 50-million-row table, and an index on name exists but is never used. What is the right fix?",
      options: [
        { id: "a", label: "Use a full-text or trigram index instead of a plain B-tree" },
        { id: "b", label: "Add a second B-tree index on name" },
        { id: "c", label: "Increase shared_buffers" },
        { id: "d", label: "Add more rows per page" },
      ],
      answer: "a",
      explain: "A B-tree sorts by the start of the value, so a leading wildcard gives it nothing to search. Trigram or full-text indexes are built for substring and word search.",
    },
    {
      id: "ib-order",
      format: "order",
      scenario: "Order these by pages read to find one row in a 500-million-row table, fewest first.",
      items: [
        { id: "idx", label: "B-tree index lookup" },
        { id: "bm", label: "Scan the table in 10 parallel workers" },
        { id: "seq", label: "Sequential scan of the whole table" },
        { id: "idxonly", label: "Index-only lookup (covering index)" },
      ],
      answer: ["idxonly", "idx", "bm", "seq"],
      explain: "An index-only lookup reads about four pages, a normal one a fifth to fetch the row, and parallel scans divide millions of pages by ten without changing their order of magnitude.",
    },
    {
      id: "ib-graph",
      format: "predict-graph",
      scenario: "Hold the query the same and let the table grow from a thousand to a billion rows. Plot a B-tree lookup's page reads on a log x axis.",
      xLabel: "rows (log) →",
      yLabel: "pages read",
      options: [
        { id: "linear", label: "Grows in step with the rows", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "steps", label: "A few small steps (1, 2, 3, 4)", points: [1, 1, 2, 2, 3, 3, 4, 4] },
        { id: "flat", label: "Exactly flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "hockey", label: "Flat, then shoots up", points: [1, 1, 1, 1, 2, 4, 8, 16] },
      ],
      answer: "steps",
      explain: "Depth is the log base 300 of the row count, rounded up, so it grows by one level every time the table grows about 300 times.",
    },
    {
      id: "ib-flaw",
      format: "spot-flaw",
      scenario: "Inserts into a hot table slowed from 1 ms to 6 ms after a 'performance sprint' added an index on every column. Tap what is wrong.",
      diagram: {
        nodes: [
          { id: "api", label: "api · 3,000 inserts per second", kind: "server", col: 0, row: 1 },
          { id: "table", label: "messages · 11 indexes, 3 used by queries", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "api", to: "table" }],
      },
      answer: "table",
      explain: "Every insert updates all eleven indexes, and eight of them serve no query. Drop the unused indexes; pg_stat_user_indexes shows which ones are never scanned.",
    },
    {
      id: "ib-explain",
      format: "explain",
      scenario: "In two sentences: why does the cost of an index lookup barely change when a table grows tenfold?",
      rubric: [
        { id: "log", criterion: "Depth is the logarithm of the row count with a base equal to the number of entries per page" },
        { id: "wide", criterion: "Pages are wide (hundreds of entries), so tenfold more rows adds at most one level" },
      ],
      exemplar: "A B-tree's depth is the logarithm of the row count, with a base of a few hundred because each page is wide. Ten times more rows adds at most one level.",
      explain: "Wide pages turn a table's growth into a rounding error.",
    },
  ],
  codex: {
    oneLiner: "A B-tree is a wide, shallow sorted tree: a lookup reads about log₃₀₀ n pages. Indexes speed reads and tax every write.",
    keyNumbers: [
      { label: "Default page size", value: "8 KB", sourceId: "pg-page-layout" },
      { label: "Lookup cost", value: "O(log n) pages; 4 levels cover 500M rows at ~300 per page", sourceId: "pg-btree" },
      { label: "What a B-tree cannot do", value: "leading-wildcard LIKE, non-leading columns", sourceId: "use-the-index-luke" },
    ],
    tradeoffs: [
      { choice: "Add an index", gain: "Query goes from scanning the table to a few page reads", cost: "Slower writes, more disk and cache" },
      { choice: "Multiple single-column indexes", gain: "Flexible for varied queries", cost: "Each costs writes; one composite index often serves better" },
    ],
    seenIn: ["Every slow query that turns out to be a sequential scan.", "EXPLAIN output showing Index Scan versus Seq Scan."],
    interviewAngle: "When you say 'add an index', say which columns, in what order, and what it costs on writes: 'composite (conversation_id, sent_at) so the page query is one range scan.'",
    aws: [{ concept: "Relational database", service: "Amazon RDS for PostgreSQL / Aurora" }],
    replay: { id: "btree-lab", config: BTREE, scene: "tree" },
  },
  interview: [
    "How does a database find one row among a billion without reading them all?",
    "What are the downsides of adding an index?",
    "Why can a B-tree not help with LIKE '%word%'?",
  ],
  deeper: [
    {
      title: "Why wide pages",
      body: "A disk or SSD reads whole pages, so a B-tree packs as many keys per page as will fit, making each trip to storage narrow the search by a factor of hundreds. That is the whole design: minimise the number of page reads, not the number of comparisons. The upper levels are small enough to stay in memory, so most lookups touch the disk once or twice.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Rows are 100 bytes, 80 to an 8 KB page, and an index node holds 300 entries. A sequential page read costs 0.01 ms and a random one 0.1 ms: round numbers for an SSD with a cold cache.",
    "Matching rows are fetched from the heap with one random page each, as for an unclustered index. Real planners also use bitmap scans and caches.",
    "Each index adds about half a millisecond to every insert and 5 GB per 500 million rows in the lab.",
  ],
  sources: [PG_BTREE, PG_PAGE, UTI],
  verify: [
    { id: "no-index", claim: "With no index every query takes tens of seconds", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: {}, metric: "worstMs" }, expect: { min: 10000 } },
    { id: "depth", claim: "A 500-million-row B-tree is four levels deep", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: {}, metric: "depth" }, expect: { min: 4, max: 4 } },
    { id: "three", claim: "Three indexes put every listed query under 20 ms", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: { conv: true, user: true, created: true }, metric: "worstMs" }, expect: { max: 20 } },
    { id: "write", claim: "…at an insert cost of 2.5 ms", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: { conv: true, user: true, created: true }, metric: "writeMs" }, expect: { max: 2.6 } },
    { id: "body", claim: "A fourth index on body pushes inserts over the limit", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: { conv: true, user: true, created: true, body: true }, metric: "writeMs" }, expect: { min: 2.6 } },
    { id: "two", claim: "Two indexes leave one query scanning", run: "lab", params: { model: "btree-lab", config: BTREE_CHALLENGE, values: { conv: true, user: true }, metric: "worstMs" }, expect: { min: 20 } },
  ],
});
