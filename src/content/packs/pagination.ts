import { definePack } from "../define";

export const PAGE = { lockPage: true, page: 100000, inserts: 20, start: { method: "cursor", indexed: true } };
export const PAGE_CHALLENGE = { lockPage: true, page: 100000, inserts: 20 };

const USE_INDEX = { id: "use-the-index-luke", title: "M. Winand, Use The Index, Luke: Paging Through Results (no offset)", url: "https://use-the-index-luke.com/no-offset" };
const SLACK = { id: "slack-pagination", title: "Slack Engineering: Evolving API Pagination at Slack", url: "https://slack.engineering/evolving-api-pagination-at-slack/" };
const STRIPE_PAGE = { id: "stripe-pagination", title: "Stripe API reference: Pagination (starting_after, ending_before)", url: "https://docs.stripe.com/api/pagination" };

export default definePack({
  id: "pagination",
  title: "Offset vs Cursor Pagination",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "orders-api · GET /orders?page=100000 takes 2.5 s", detail: "database CPU spikes whenever a crawler pages deeply" },
    lines: [
      { speaker: "kabir", line: "A partner's export crawls our orders list page by page. Page one is instant and page one hundred thousand takes two and a half seconds and eats a database core." },
      { speaker: "meera", line: "Offset means skip this many rows, and the database has to walk past every one of them. The deeper you go, the more it walks." },
    ],
  },
  predictions: [
    {
      id: "deep",
      kind: "choice",
      prompt: "A table of 50 million rows is read 50 rows to a page, with an index on the sort key. The database skips rows at about half a microsecond each. How long does page 100,000 take with offset pagination?",
      options: [
        { id: "ms", label: "About 1 ms, same as page 1" },
        { id: "ms50", label: "About 50 ms" },
        { id: "s25", label: "About 2.5 seconds" },
        { id: "min", label: "About 25 seconds" },
      ],
      answer: "s25",
      observe: "deep-slow",
      reveal: {
        text: "Page 100,000 is an offset of 5 million rows, and the database must step over each of them to find the first row to return: 5 million × 0.5 µs ≈ 2.5 seconds. Page one skips none. The cost grows with how deep you go, which is exactly what crawlers do.",
        derived: true,
        line: { speaker: "meera", line: "Skipping is not free. The database counts them one by one." },
      },
    },
    {
      id: "drift",
      kind: "choice",
      prompt: "New rows arrive at 20 a second at the top of the list, and a person takes about 10 seconds to read each page. With offset pagination, how many items on the next page are repeats of the previous one?",
      options: [
        { id: "none", label: "None" },
        { id: "few", label: "About 5" },
        { id: "all", label: "About 50: the whole page shifts" },
      ],
      answer: "all",
      observe: "skipped",
      reveal: {
        text: "In 10 seconds 200 new rows arrive above, pushing everything down by 200, more than a page. The next page 'offset 50' now starts 200 items before where the reader was, so the page repeats items already seen, or, with deletions, skips some. A cursor remembers the item, not a position.",
        derived: true,
        line: { speaker: "rao", line: "A position is only stable if nothing above it changes." },
      },
    },
  ],
  widget: { id: "pagination-lab", config: PAGE },
  mechanism: [
    {
      id: "offset",
      scene: "offset",
      text: "Offset pagination asks for page n with LIMIT 50 OFFSET 50 × (n − 1). It is easy to build and lets users jump to any page. But the database must walk past all the skipped rows, so cost grows with the offset, and deep pages become slow for everyone, including crawlers.",
      sourceIds: ["use-the-index-luke"],
    },
    {
      id: "drift",
      scene: "drift",
      text: "Offsets also drift. If rows are inserted or deleted while someone pages, the position of every later row shifts, so a page can repeat rows already seen or skip rows never seen. On a busy list this happens constantly, and the user cannot tell why items appear twice.",
      sourceIds: ["slack-pagination"],
    },
    {
      id: "cursor",
      scene: "cursor",
      text: "Cursor, or keyset, pagination returns an opaque token naming the last item, and the next request asks for rows after it: WHERE (created_at, id) < the last values. With an index the database seeks straight there, so every page costs the same, and the list can change without repeats or skips.",
      sourceIds: ["use-the-index-luke", "stripe-pagination"],
    },
    {
      id: "limits",
      text: "Cursors cannot jump to page 7,000 and need a stable, unique sort order, usually the sort key plus the id as a tiebreaker. They need the index. For interfaces where users really do jump, such as a small admin table, offset is fine; for feeds, exports and large lists, use cursors.",
      sourceIds: ["use-the-index-luke", "slack-pagination"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "export",
      title: "Serve the export",
      brief: "A partner pages through to page 100,000 while 20 new rows arrive each second. Choose the pagination and indexing so each page takes at most 50 ms and no page repeats items.",
      line: { speaker: "kabir", line: "They also read the first few pages during a sale, with new orders landing the whole time." },
      widget: { id: "pagination-lab", config: PAGE_CHALLENGE },
      conditions: [
        { metric: "queryMs", op: "<=", value: 50, label: "Each page at most 50 ms" },
        { metric: "dupPerPage", op: "<=", value: 0, label: "No repeated items" },
      ],
      stars: [],
      hints: [
        "What does the database do with an offset of five million?",
        "What changes the position of an item while someone is reading?",
        "A cursor needs something to seek on. What?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why offset pagination fails for big, busy lists and how cursors fix it.",
    rubric: [
      { id: "cost", criterion: "Offset makes the database walk past all skipped rows, so deep pages are slow", keyIdea: "offset cost grows with depth" },
      { id: "drift", criterion: "Inserts and deletes shift positions, so pages repeat or skip rows", keyIdea: "offsets drift" },
      { id: "cursor", criterion: "A cursor names the last item and uses an indexed seek, so every page costs the same and no rows repeat", keyIdea: "keyset seek" },
    ],
    exemplar:
      "With offset pagination the database walks past every skipped row, so deep pages get slower in proportion to the offset, and any insert or delete above shifts later rows so a page can repeat or skip items. A cursor returns a token naming the last item, and the next request seeks to rows after it using an index, so each page costs the same and the list can change without repeats. The cost is that you cannot jump to an arbitrary page.",
  },
  reviews: [
    {
      id: "pg-est",
      format: "estimate",
      scenario: "A database walks past skipped rows at 0.5 µs each. How long does page 20,000 take at 50 rows a page? (offset ≈ 1 million rows)",
      unit: "ms",
      answer: 500,
      acceptFactor: 1.1,
      breakdown: ["offset = 19,999 × 50 ≈ 1,000,000 rows", "× 0.5 µs = 0.5 s", "≈ 500 ms"],
      explain: "Time grows in step with the offset, so ten times deeper means ten times slower.",
    },
    {
      id: "pg-pick",
      format: "pick-fix",
      scenario: "A cursor query is ordered by created_at, but many rows share the same timestamp, and some rows are skipped between pages. What is the fix?",
      options: [
        { id: "a", label: "Order by (created_at, id) and continue after both values, so ties have a stable order" },
        { id: "b", label: "Switch back to offset pagination" },
        { id: "c", label: "Round timestamps" },
        { id: "d", label: "Increase the page size" },
      ],
      answer: "a",
      explain: "A cursor needs a unique ordering. Adding the id as a tiebreaker makes 'after this item' well defined.",
    },
    {
      id: "pg-order",
      format: "order",
      scenario: "Order these requests by database work, most first (with an index, 50 rows a page).",
      items: [
        { id: "p100k", label: "Offset, page 100,000" },
        { id: "p100", label: "Offset, page 100" },
        { id: "cur", label: "Cursor, any page" },
      ],
      answer: ["p100k", "p100", "cur"],
      explain: "Offset cost scales with page number. A cursor does the same small seek every time.",
    },
    {
      id: "pg-graph",
      format: "predict-graph",
      scenario: "As the page number reached goes from 1 to 1,000,000, how does query time change for offset pagination, and for cursor pagination?",
      xLabel: "page reached →",
      yLabel: "query time",
      options: [
        { id: "diverge", label: "Offset rises in proportion; cursor stays flat", points: [1, 1.5, 3.5, 26, 251, 2501, 25001, 250001] },
        { id: "both", label: "Both rise in proportion", points: [1, 1.5, 3.5, 26, 251, 2501, 25001, 250001] },
        { id: "flat", label: "Both stay flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "diverge",
      explain: "Offset time is proportional to the rows skipped. A keyset seek is a constant number of index steps.",
    },
    {
      id: "pg-flaw",
      format: "spot-flaw",
      scenario: "A cursor-paginated endpoint sorts by a column that has no index, and each page takes 100 seconds on a 50-million-row table. Tap the part that is missing.",
      diagram: {
        nodes: [
          { id: "req", label: "after=cursor", kind: "client", col: 0, row: 1 },
          { id: "query", label: "WHERE sort_key < cursor ORDER BY sort_key", kind: "server", col: 1, row: 1 },
          { id: "table", label: "table, no index on sort_key", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "query" },
          { from: "query", to: "table" },
        ],
      },
      answer: "query->table",
      explain: "A cursor only helps if the database can seek. Without an index on the sort key it still scans and sorts everything.",
    },
    {
      id: "pg-explain",
      format: "explain",
      scenario: "In two sentences: when is offset pagination still the right choice?",
      rubric: [
        { id: "small", criterion: "When the list is small or shallow, so skipping rows is cheap" },
        { id: "jump", criterion: "When users need to jump to an arbitrary page number and the data does not change much" },
      ],
      exemplar: "When the list is small or users rarely go deep, skipping rows costs little. It is also right when people need to jump to a numbered page and the data is fairly stable.",
      explain: "Choose by depth, churn and the need to jump.",
    },
  ],
  codex: {
    oneLiner: "Offset pagination walks past skipped rows and drifts under inserts. Cursor pagination seeks from the last item on an index: constant cost, no repeats.",
    keyNumbers: [
      { label: "Rows walked for page n, 50 per page", value: "50 × n", sourceId: "use-the-index-luke" },
      { label: "Page 100,000 at 0.5 µs a row, 50M-row table", value: "about 2.5 seconds", sourceId: "use-the-index-luke" },
    ],
    tradeoffs: [
      { choice: "Offset", gain: "Jump to any page; trivial to build", cost: "Deep pages slow; rows repeat or vanish as data changes" },
      { choice: "Cursor", gain: "Constant cost; stable under change", cost: "No jumping; needs a unique ordered index" },
    ],
    seenIn: ["Stripe, Slack and GitHub APIs using cursors.", "Admin tables using page numbers."],
    interviewAngle: "Say: 'cursor pagination on an indexed, unique sort key; offset only for small, stable lists'.",
    aws: [{ concept: "LastEvaluatedKey / ExclusiveStartKey", service: "DynamoDB" }],
    replay: { id: "pagination-lab", config: PAGE, scene: "cursor" },
  },
  interview: [
    "What is wrong with offset pagination?",
    "How does cursor pagination work?",
    "What does a cursor need to be reliable?",
  ],
  deeper: [
    {
      title: "Opaque cursors",
      body: "Return the cursor as an opaque string, often an encoded copy of the last sort values, and treat it as a promise to continue from there. Clients must not parse it. That lets you change the ordering fields or add a signature later without breaking anyone, and stops clients from forging positions.",
      sourceIds: ["slack-pagination", "stripe-pagination"],
    },
  ],
  honestPhysics: [
    "A table of 50 million rows listed newest first, 50 per page. An index on the sort key lets the database skip rows at about 0.5 microseconds each; without it every page scans and sorts all 50 million rows.",
    "Offset must walk past all earlier rows, so page n skips 50 × n. A cursor seeks straight to its position. A person takes about 10 seconds between pages, and rows arriving in that time push offset pages down, repeating up to a page of items.",
    "Cursors cannot jump to an arbitrary page.",
  ],
  sources: [USE_INDEX, SLACK, STRIPE_PAGE],
  verify: [
    { id: "deep", claim: "Offset page 100,000 takes about 2.5 seconds", run: "lab", params: { model: "pagination-lab", config: PAGE_CHALLENGE, values: { method: "offset", indexed: true }, metric: "queryMs" }, expect: { min: 2400, max: 2600 } },
    { id: "shallow", claim: "Offset page 100 takes under 5 ms", run: "lab", params: { model: "pagination-lab", config: { lockPage: false }, values: { method: "offset", page: 100, indexed: true }, metric: "queryMs" }, expect: { max: 5 } },
    { id: "drift", claim: "At 20 new rows a second an offset page repeats 50 items", run: "lab", params: { model: "pagination-lab", config: PAGE_CHALLENGE, values: { method: "offset" }, metric: "dupPerPage" }, expect: { min: 50, max: 50 } },
    { id: "cursor", claim: "A cursor with an index takes about 1 ms", run: "lab", params: { model: "pagination-lab", config: PAGE_CHALLENGE, values: { method: "cursor", indexed: true }, metric: "queryMs" }, expect: { max: 5 } },
    { id: "cursor-dup", claim: "…and repeats nothing", run: "lab", params: { model: "pagination-lab", config: PAGE_CHALLENGE, values: { method: "cursor", indexed: true }, metric: "dupPerPage" }, expect: { max: 0 } },
    { id: "noindex", claim: "A cursor without an index takes over a minute", run: "lab", params: { model: "pagination-lab", config: PAGE_CHALLENGE, values: { method: "cursor", indexed: false }, metric: "queryMs" }, expect: { min: 60000 } },
  ],
});
