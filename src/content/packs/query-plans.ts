import { definePack } from "../define";

export const PLAN = {};

const PG_EXPLAIN = { id: "pg-explain", title: "PostgreSQL docs: Using EXPLAIN (reading plans, costs, and actual times)", url: "https://www.postgresql.org/docs/current/using-explain.html" };
const PG_MULTI = { id: "pg-multicolumn", title: "PostgreSQL docs: Multicolumn Indexes (column order and which queries they serve)", url: "https://www.postgresql.org/docs/current/indexes-multicolumn.html" };
const PG_IOS = { id: "pg-index-only", title: "PostgreSQL docs: Index-Only Scans and Covering Indexes (INCLUDE)", url: "https://www.postgresql.org/docs/current/indexes-index-only-scans.html" };

export default definePack({
  id: "query-plans",
  title: "Query Plans (EXPLAIN)",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "slow query log", detail: "SELECT … WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 50" },
    lines: [
      { speaker: "kabir", line: "We have an index on conversation_id and this query is still slow. The index exists, so why is Postgres being difficult?" },
      { speaker: "meera", line: "Ask it what it is doing. EXPLAIN tells you the plan, and the plan tells you what the index is missing." },
    ],
  },
  predictions: [
    {
      id: "which-index",
      kind: "choice",
      prompt: "The query fetches a conversation's 50 newest messages: WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 50. Which index makes it fastest?",
      options: [
        { id: "conv", label: "An index on (conversation_id)" },
        { id: "sent", label: "An index on (sent_at)" },
        { id: "both", label: "A composite index on (conversation_id, sent_at DESC)" },
        { id: "two", label: "Two separate indexes, one per column" },
      ],
      answer: "both",
      observe: "sorted-away",
      reveal: {
        text: "The composite index stores each conversation's messages already in time order, so the database walks 50 entries and stops. With only conversation_id it must fetch all of a conversation's rows, then sort them, then take 50.",
        sourceIds: ["pg-multicolumn"],
        line: { speaker: "meera", line: "A good index does the sorting before the query arrives." },
      },
    },
  ],
  widget: { id: "plan-lab", config: PLAN },
  mechanism: [
    {
      id: "explain",
      scene: "seq",
      text: "EXPLAIN shows the plan: a tree of operations, each with an estimated cost and row count. EXPLAIN ANALYZE also runs the query and reports actual times. The first thing to look for is a Seq Scan on a large table where you expected an index.",
      sourceIds: ["pg-explain"],
    },
    {
      id: "composite",
      scene: "composite",
      text: "A composite index is sorted by its first column, then its second within each value of the first. It serves queries that filter on a leading prefix and, when the next column matches the ORDER BY, return rows already sorted, so the Sort node and the extra rows disappear.",
      sourceIds: ["pg-multicolumn"],
    },
    {
      id: "order",
      text: "Column order matters. An index on (sent_at, conversation_id) is sorted by time first, so finding one conversation means scanning across all of them. Put equality columns first and the ordering or range column last.",
      sourceIds: ["pg-multicolumn"],
    },
    {
      id: "covering",
      scene: "covering",
      text: "If the index holds every column the query needs, the database can answer from the index alone with an index-only scan and skip fetching rows from the table. INCLUDE adds columns to the index without sorting by them, trading index size for fewer random reads.",
      sourceIds: ["pg-index-only"],
    },
  ],
  challenges: [
    {
      id: "page-query",
      title: "Fix the conversation page",
      brief: "The messages table holds 500 million rows over 2 million conversations. The page query is WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 50. Choose the index so it runs in under 10 ms and examines no more than 100 rows.",
      line: { speaker: "kabir", line: "I can build one index tonight. Choose carefully." },
      widget: { id: "plan-lab", config: PLAN },
      conditions: [
        { metric: "ms", op: "<", value: 10, label: "Query under 10 ms" },
        { metric: "rowsExamined", op: "<=", value: 100, label: "At most 100 rows examined" },
      ],
      stars: [{ metric: "ms", op: "<", value: 1, label: "Under 1 ms with an index-only scan" }],
      hints: [
        "Read the plan: is there a Sort node, and how many rows does the scan return before it?",
        "Which index returns exactly the 50 rows you want, already in order?",
        "Once the order is right, can the query be answered from the index alone?",
      ],
    },
  ],
  explainBack: {
    prompt: "Read an EXPLAIN plan for a slow query and say how you would fix it with an index.",
    rubric: [
      { id: "read", criterion: "Looks for a Seq Scan, a large row count, or a Sort node as the expensive part of the plan", keyIdea: "find the expensive node" },
      { id: "composite", criterion: "Uses a composite index with equality columns first and the ORDER BY column next, so rows come out sorted", keyIdea: "equality then order" },
      { id: "cover", criterion: "Mentions index-only scans or covering indexes as a way to skip fetching table rows", keyIdea: "covering index" },
    ],
    exemplar:
      "I would run EXPLAIN ANALYZE and look for the costly node: a Seq Scan, a node returning far more rows than needed, or a Sort over them. For a filter plus ORDER BY I would add a composite index with the equality column first and the sort column second, so the rows come out in order and the query stops after the limit. If it still fetches rows, I might make the index covering with INCLUDE so an index-only scan answers it.",
  },
  reviews: [
    {
      id: "qp-pick",
      format: "pick-fix",
      scenario: "WHERE status = 'open' AND assignee_id = 7 ORDER BY created_at runs a Sort over 400,000 rows. An index on (status) exists. Which index serves the whole query best?",
      options: [
        { id: "a", label: "(assignee_id, status, created_at)" },
        { id: "b", label: "(created_at, status, assignee_id)" },
        { id: "c", label: "(status) plus (assignee_id) as two indexes" },
        { id: "d", label: "(created_at)" },
      ],
      answer: "a",
      explain: "Equality filters first, then the sort column. The index narrows to one assignee's open items already in created_at order, so there is no Sort. The leading column should be the most selective equality filter.",
    },
    {
      id: "qp-est",
      format: "estimate",
      scenario: "A conversation has 250 messages. With an index on conversation_id only, the page query fetches all 250 from the heap at 0.1 ms each. About how long does that take, ignoring the sort?",
      unit: "ms",
      answer: 25,
      acceptFactor: 1.3,
      breakdown: ["250 rows × 0.1 ms", "= 25 ms"],
      explain: "Fetching all 250 to keep 50 wastes four fifths of the work. The composite index fetches 50.",
    },
    {
      id: "qp-order",
      format: "order",
      scenario: "Order these plans for the page query by time, fastest first.",
      items: [
        { id: "ios", label: "Index-only scan on a covering composite index" },
        { id: "comp", label: "Composite index scan, then fetch 50 rows" },
        { id: "conv", label: "Index on conversation_id, fetch 250 rows and sort" },
        { id: "seq", label: "Seq Scan, filter, sort" },
      ],
      answer: ["ios", "comp", "conv", "seq"],
      explain: "Each improvement removes work: the fetch, the extra rows, then the sort, and finally the scan of everything.",
    },
    {
      id: "qp-flaw",
      format: "spot-flaw",
      scenario: "A team added an index on (sent_at) 'so ORDER BY sent_at is fast'. The page query is still slow. Tap the part of the plan that explains it.",
      diagram: {
        nodes: [
          { id: "q", label: "WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 50", kind: "client", col: 0, row: 1 },
          { id: "idx", label: "Index Scan Backward on sent_at, Filter: conversation_id = $1", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "q", to: "idx" }],
      },
      answer: "idx",
      explain: "The index is ordered by time across all conversations, so the scan walks backward through unrelated rows, discarding any that are not this conversation, until it finds 50.",
    },
    {
      id: "qp-graph",
      format: "predict-graph",
      scenario: "With an index on (conversation_id) only, raise LIMIT from 10 to 500 on a conversation with 250 messages. What happens to query time?",
      xLabel: "LIMIT →",
      yLabel: "query time",
      options: [
        { id: "linear", label: "Grows in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "flat", label: "Flat: it fetches all 250 rows either way", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "step", label: "Flat, then jumps", points: [1, 1, 1, 1, 8, 8, 8, 8] },
        { id: "fall", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "flat",
      explain: "Without the sorted composite index the database fetches and sorts every row in the conversation before applying LIMIT, so LIMIT does not reduce the work.",
    },
    {
      id: "qp-explain",
      format: "explain",
      scenario: "In two sentences: why does putting the ORDER BY column last in a composite index let the database skip the Sort?",
      rubric: [
        { id: "sorted", criterion: "Within each value of the leading column the index entries are stored in order of the next column" },
        { id: "stop", criterion: "So the database reads entries in the needed order and can stop after LIMIT rows" },
      ],
      exemplar: "Within each value of the leading column the entries are already sorted by the next column. The database reads them in that order and can stop after LIMIT rows, so no separate sort is needed.",
      explain: "The index is a pre-sorted answer.",
    },
  ],
  codex: {
    oneLiner: "EXPLAIN shows the plan. Equality columns first, then ORDER BY, lets an index return sorted rows and stop at LIMIT.",
    keyNumbers: [
      { label: "Plan node types to read", value: "Seq Scan, Index Scan, Index Only Scan, Sort, Nested Loop, Hash Join", sourceId: "pg-explain" },
      { label: "Covering index", value: "INCLUDE adds columns without sorting by them", sourceId: "pg-index-only" },
    ],
    tradeoffs: [
      { choice: "Composite index (equality, then order)", gain: "Sorted rows, early stop at LIMIT", cost: "Serves one query shape well; wider index" },
      { choice: "Covering index (INCLUDE)", gain: "Index-only scan, no heap fetches", cost: "Larger index and a need for a recent vacuum" },
    ],
    seenIn: ["EXPLAIN (ANALYZE, BUFFERS) in a slow-query investigation.", "pg_stat_statements pointing at the heaviest queries."],
    interviewAngle: "For any query you design, state the index: 'composite on (conversation_id, sent_at DESC) so the page is a single range scan with no sort.'",
    aws: [{ concept: "Query insight", service: "Amazon RDS Performance Insights", note: "Finds the heaviest queries to EXPLAIN" }],
    replay: { id: "plan-lab", config: PLAN, scene: "composite" },
  },
  interview: [
    "A query is slow even though there is an index. How do you investigate?",
    "How do you choose column order in a composite index?",
    "What is an index-only scan?",
  ],
  deeper: [
    {
      title: "Estimates versus actuals",
      body: "A plan's row counts come from table statistics, so a plan can be wrong when the statistics are stale or the data is skewed. EXPLAIN ANALYZE shows estimated and actual rows side by side; a big mismatch is the cue to run ANALYZE, add extended statistics, or rewrite the query.",
      sourceIds: ["pg-explain"],
    },
  ],
  honestPhysics: [
    "The table has 500 million messages over 2 million conversations. Costs use the lab's page model: 0.1 ms per random page and 0.01 ms per sequential page.",
    "The planner here is a rule that picks the cheapest plan the index allows. Real planners use statistics and can choose differently.",
    "An index-only scan assumes the visibility map is current, which needs a recent vacuum.",
  ],
  sources: [PG_EXPLAIN, PG_MULTI, PG_IOS],
  verify: [
    { id: "none", claim: "With no index the query takes about a minute", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "none" }, metric: "ms" }, expect: { min: 30000 } },
    { id: "conv", claim: "An index on conversation_id alone is not under 10 ms", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "conv" }, metric: "ms" }, expect: { min: 10 } },
    { id: "sent", claim: "An index on sent_at alone is barely better than a scan", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "sent" }, metric: "ms" }, expect: { min: 30000 } },
    { id: "both", claim: "The composite index runs in under 10 ms", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "both" }, metric: "ms" }, expect: { max: 10 } },
    { id: "both-rows", claim: "…examining 50 rows", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "both" }, metric: "rowsExamined" }, expect: { min: 50, max: 50 } },
    { id: "cover", claim: "A covering composite index is under 1 ms", run: "lab", params: { model: "plan-lab", config: PLAN, values: { index: "both", covering: true }, metric: "ms" }, expect: { max: 1 } },
  ],
});
