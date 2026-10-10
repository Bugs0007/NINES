import { definePack } from "../define";

export const WRITE = { hotKeys: 10000, start: { policy: "through", flush: 5, writes: 5000 } };
export const WRITE_CHALLENGE = { hotKeys: 10000, lockLoad: true, writes: 5000, start: { policy: "through", flush: 5 } };

const AWS_CACHING = { id: "aws-caching-patterns", title: "AWS whitepaper: Database Caching Strategies Using Redis (lazy loading, write-through, TTL)", url: "https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html" };
const WIKI_CACHE = { id: "wiki-cache-writing", title: "Wikipedia: Cache (computing), writing policies (write-through, write-back, write-around)", url: "https://en.wikipedia.org/wiki/Cache_(computing)#Writing_policies" };
const REDIS_PERSIST = { id: "redis-persistence", title: "Redis docs: Persistence (RDB snapshots and the append-only file)", url: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/" };

export default definePack({
  id: "write-policies",
  title: "Write-through, Write-back, Write-around",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "postgres · write latency", detail: "like counter: 5,000 updates a second on 10,000 posts" },
    lines: [
      { speaker: "pager", line: "Postgres is saturated on writes. Ninety percent of them are likes on the same ten thousand posts." },
      { speaker: "meera", line: "Many of those writes overwrite each other. The database does not have to see each one." },
    ],
  },
  predictions: [
    {
      id: "coalesce",
      kind: "choice",
      prompt: "A like counter takes 5,000 writes a second spread over 10,000 hot posts. The cache buffers the writes and flushes to the database every 10 seconds. About how many database writes a second reach Postgres?",
      options: [
        { id: "same", label: "5,000, every write still reaches it" },
        { id: "half", label: "About 2,500" },
        { id: "thousand", label: "About 1,000, the same posts overwrite each other" },
        { id: "ten", label: "About 10" },
      ],
      answer: "thousand",
      observe: "coalesced",
      reveal: {
        text: "In 10 seconds there are 50,000 writes but only about 10,000 distinct posts, so each flush writes at most one row per post. 9,900 rows every 10 seconds is about 990 writes a second, a fifth of the arrivals.",
        derived: true,
        line: { speaker: "rao", line: "Four out of five writes were redundant. I would like that on a plaque." },
      },
    },
  ],
  widget: { id: "write-lab", config: WRITE },
  mechanism: [
    {
      id: "through",
      scene: "through",
      text: "Write-through writes the cache and the database together before acknowledging. The cache is always as fresh as the database and a crash loses nothing, but every write pays the database's latency and the database sees every write.",
      sourceIds: ["aws-caching-patterns", "wiki-cache-writing"],
    },
    {
      id: "back",
      scene: "back",
      text: "Write-back acknowledges after writing the cache and flushes to the database later, in batches. Repeated writes to a key coalesce into one, so the database does far fewer writes. The price is durability: anything not yet flushed is lost if the cache dies.",
      sourceIds: ["wiki-cache-writing", "redis-persistence"],
    },
    {
      id: "around",
      scene: "around",
      text: "Write-around writes straight to the database and leaves the cache alone. It avoids filling the cache with data that may never be read, which suits write-heavy, read-rarely data, but the first read after a write is a miss.",
      sourceIds: ["wiki-cache-writing"],
    },
    {
      id: "choose",
      text: "Choose by what a lost write costs and how bursty the writes are. Likes and view counts tolerate a few seconds of loss and coalesce well. Payments do not tolerate loss at all and belong in the database first. Ask the business how many seconds of data it can lose.",
    },
  ],
  challenges: [
    {
      id: "likes",
      title: "Survive the like storm",
      brief: "5,000 like writes a second land on 10,000 hot posts. Postgres can take 600 writes a second. Pick a write policy and flush interval so the database stays at or below 600 a second while risking no more than 20 seconds of likes.",
      line: { speaker: "kabir", line: "If we lose twenty seconds of likes in a crash, I think nobody will notice. If the database goes down, they will." },
      widget: { id: "write-lab", config: WRITE_CHALLENGE },
      conditions: [
        { metric: "dbWriteRps", op: "<=", value: 600, label: "Database at most 600 writes/s" },
        { metric: "atRiskSec", op: "<=", value: 20, label: "At most 20 s of writes at risk" },
      ],
      stars: [{ metric: "atRiskSec", op: "<=", value: 18, label: "At most 18 s at risk" }],
      hints: [
        "Which policies send every write to the database?",
        "With write-back, what does a longer flush interval do to the database writes, and to what you can lose?",
        "There is a window between the interval the database needs and the interval the business tolerates.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare write-through, write-back, and write-around, and say when you would pick each.",
    rubric: [
      { id: "through", criterion: "Write-through writes cache and database together: consistent and durable but slower, with the database taking every write", keyIdea: "consistent, slower" },
      { id: "back", criterion: "Write-back writes the cache and flushes later: fast and coalescing, but unflushed writes are lost on a crash", keyIdea: "fast but risky" },
      { id: "around", criterion: "Write-around skips the cache on writes: avoids polluting it but the next read misses", keyIdea: "write to the database only" },
    ],
    exemplar:
      "Write-through writes the cache and database together, so both stay consistent and nothing is lost, at the cost of database latency on every write. Write-back acknowledges after the cache and flushes later, which is fast and coalesces repeated writes but loses whatever has not been flushed if the cache dies. Write-around writes only the database, which keeps the cache from filling with data nobody reads, though the next read is a miss. I would use write-back for tolerable-loss counters, write-through where reads follow writes, and write-around for write-once data.",
  },
  reviews: [
    {
      id: "wp-est-coalesce",
      format: "estimate",
      scenario: "A cache buffers 1,000 writes a second spread evenly over only 100 hot keys, flushing every 10 seconds. Roughly how many database writes a second?",
      unit: "writes/s",
      answer: 10,
      acceptFactor: 1.3,
      breakdown: ["In 10 s there are 10,000 writes but only 100 distinct keys", "One row per key per flush: 100 per 10 s", "= 10 writes/s"],
      explain: "When hot keys take most writes, write-back collapses them to one write per key per flush.",
    },
    {
      id: "wp-pick",
      format: "pick-fix",
      scenario: "A payments ledger must never lose an acknowledged write, and reads should see the latest balance. Which policy fits?",
      options: [
        { id: "a", label: "Write-back with a 30-second flush" },
        { id: "b", label: "Write-through, with the database as the source of truth" },
        { id: "c", label: "Write-around with a long TTL" },
        { id: "d", label: "No policy; keep data only in the cache" },
      ],
      answer: "b",
      explain: "An acknowledged payment has to be durable. Write-through puts it in the database before the acknowledgement, and the cache stays current. Write-back would risk the unflushed window.",
    },
    {
      id: "wp-pick2",
      format: "pick-fix",
      scenario: "An audit log is written constantly and almost never read. Caching each entry on write only churns the cache. Which policy fits?",
      options: [
        { id: "a", label: "Write-around: write to the database, skip the cache" },
        { id: "b", label: "Write-through with a long TTL" },
        { id: "c", label: "Write-back with a one-second flush" },
        { id: "d", label: "Cache every entry for a year" },
      ],
      answer: "a",
      explain: "If the data is rarely read, caching it on write wastes memory and evicts useful keys. Write-around leaves the cache for data that actually gets read.",
    },
    {
      id: "wp-order",
      format: "order",
      scenario: "Order these by how many writes per second reach the database for 5,000 writes a second on 10,000 hot keys, fewest first.",
      items: [
        { id: "b20", label: "Write-back, 20 s flush" },
        { id: "b5", label: "Write-back, 5 s flush" },
        { id: "b1", label: "Write-back, 1 s flush" },
        { id: "wt", label: "Write-through" },
      ],
      answer: ["b20", "b5", "b1", "wt"],
      explain: "The longer the flush interval, the more repeated writes coalesce. Write-through sends every write.",
    },
    {
      id: "wp-graph",
      format: "predict-graph",
      scenario: "Hold the load fixed and lengthen the write-back flush interval from 1 second to 60 seconds. How does the database's write rate change?",
      xLabel: "flush interval →",
      yLabel: "database writes/s",
      options: [
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "decay", label: "Falls quickly, then flattens", points: [8, 4.5, 3, 2.2, 1.7, 1.4, 1.2, 1.1] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "decay",
      explain: "Writes per flush are capped by the number of distinct keys, so the rate is that number divided by the interval, which falls like 1 over F. The loss exposure, meanwhile, grows linearly with F.",
    },
    {
      id: "wp-flaw",
      format: "spot-flaw",
      scenario: "A shopping cart writes only to Redis with write-back, with no persistence and a 60-second flush. During a Redis restart customers lose items. Tap the part that is wrong for this data.",
      diagram: {
        nodes: [
          { id: "web", label: "web", kind: "client", col: 0, row: 1 },
          { id: "redis", label: "redis · write-back, 60 s flush, no persistence", kind: "cache", col: 1, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "web", to: "redis" },
          { from: "redis", to: "db" },
        ],
      },
      answer: "redis",
      explain: "A minute of unflushed carts is lost when Redis restarts. Carts matter to customers, so use write-through, or at least enable persistence and shorten the flush.",
    },
    {
      id: "wp-explain",
      format: "explain",
      scenario: "In two sentences: why does write-back cut database writes, and what does it risk?",
      rubric: [
        { id: "coalesce", criterion: "Repeated writes to the same key between flushes coalesce into one database write" },
        { id: "risk", criterion: "Unflushed writes are lost if the cache fails before they reach the database" },
      ],
      exemplar: "Write-back holds writes in the cache and flushes in batches, so repeated writes to one key become a single database write. The risk is that anything not yet flushed is lost if the cache dies.",
      explain: "Speed and savings come from deferring durability.",
    },
  ],
  codex: {
    oneLiner: "Write-through is consistent, write-back is fast and coalesces but can lose the unflushed window, write-around keeps the cache for reads.",
    keyNumbers: [
      { label: "Write-back DB writes", value: "K(1 − e^(−W·F/K)) ÷ F for K hot keys, W writes/s, flush F", sourceId: "wiki-cache-writing" },
      { label: "Data at risk with write-back", value: "W × F writes", sourceId: "wiki-cache-writing" },
    ],
    tradeoffs: [
      { choice: "Write-through", gain: "Cache and database agree; nothing lost", cost: "Every write pays database latency and load" },
      { choice: "Write-back", gain: "Low latency, fewer database writes", cost: "Unflushed writes lost on failure; more complex recovery" },
      { choice: "Write-around", gain: "Cache holds only data that is read", cost: "First read after a write misses" },
    ],
    seenIn: ["Counters, view counts, and like buttons with periodic flushes.", "Hardware and OS page caches, which are write-back."],
    interviewAngle: "Ask how many seconds of data the business can lose, then choose: 'counters tolerate write-back with a short flush; money and orders go write-through.'",
    aws: [{ concept: "Buffered writes", service: "ElastiCache plus a flush worker, or DynamoDB Accelerator (DAX) for write-through" }],
    replay: { id: "write-lab", config: WRITE, scene: "back" },
  },
  interview: [
    "When would you use write-back caching, and what could go wrong?",
    "How does write-through affect write latency?",
    "Which write policy would you pick for a counter versus an order?",
  ],
  deeper: [
    {
      title: "Where the coalescing formula comes from",
      body: "If W writes a second land uniformly on K hot keys, then in F seconds each key is hit W·F÷K times on average and the chance it is untouched is e^(−W·F÷K). The number of distinct keys dirtied is therefore K(1 − e^(−W·F÷K)), and flushing once per F seconds writes that many rows. As F grows the term approaches K and the rate falls toward K÷F.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Writes spread evenly over the hot keys. Real write skew coalesces better when it is concentrated, worse when it is spread.",
    "Latencies are round numbers: 1 ms for the cache and 12 ms for a database write.",
    "The lab shows the size of the loss window, not the work to repair it, and treats the cache as the only buffer.",
  ],
  sources: [AWS_CACHING, WIKI_CACHE, REDIS_PERSIST],
  verify: [
    { id: "through", claim: "Write-through sends every write to the database", run: "lab", params: { model: "write-lab", config: WRITE_CHALLENGE, values: { policy: "through" }, metric: "dbWriteRps" }, expect: { min: 5000, max: 5000 } },
    { id: "back-10", claim: "Write-back with a 10 s flush sends about 990 writes a second", run: "lab", params: { model: "write-lab", config: WRITE_CHALLENGE, values: { policy: "back", flush: 10 }, metric: "dbWriteRps" }, expect: { min: 950, max: 1050 } },
    { id: "back-short", claim: "A 5 s flush is still over the 600 limit", run: "lab", params: { model: "write-lab", config: WRITE_CHALLENGE, values: { policy: "back", flush: 5 }, metric: "dbWriteRps" }, expect: { min: 600 } },
    { id: "back-win", claim: "A 18 s flush fits the limit", run: "lab", params: { model: "write-lab", config: WRITE_CHALLENGE, values: { policy: "back", flush: 18 }, metric: "dbWriteRps" }, expect: { max: 600 } },
    { id: "back-long", claim: "A 30 s flush fits the database but risks too much", run: "lab", params: { model: "write-lab", config: WRITE_CHALLENGE, values: { policy: "back", flush: 30 }, metric: "atRiskSec" }, expect: { min: 21 } },
  ],
});
