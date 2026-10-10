import { definePack } from "../define";

export const CACHE = { start: { view: "flow", entries: 20, rps: 2000, skew: 0.99 } };
export const CACHE_CHALLENGE = { lockView: "size", start: { view: "size", entries: 50, rps: 2400, skew: 0.99 }, hide: ["rps", "skew"] };

const AZURE_CA = { id: "azure-cache-aside", title: "Microsoft Azure Architecture Center: Cache-Aside pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside" };
const AWS_CACHING = { id: "aws-caching-patterns", title: "AWS whitepaper: Database Caching Strategies Using Redis (lazy loading, write-through, TTL)", url: "https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html" };
const BRESLAU = { id: "breslau-1999", title: "L. Breslau et al. (1999), Web Caching and Zipf-like Distributions: Evidence and Implications, IEEE INFOCOM", url: "https://doi.org/10.1109/INFCOM.1999.749260" };

export default definePack({
  id: "cache-aside",
  title: "Cache-Aside & Hit Ratio",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "postgres · read load", detail: "feed reads climbing with every new user" },
    lines: [
      { speaker: "kabir", line: "The feed query is the same for everyone's friends, and Postgres runs it again for every request. Why are we paying for the same answer twice?" },
      { speaker: "meera", line: "You are not required to. Keep recent answers in memory and check there first." },
    ],
  },
  predictions: [
    {
      id: "small-cache",
      kind: "choice",
      prompt: "Pigeon has 20,000 hot keys and traffic is skewed: a few keys get most reads. You cache just 1,000 of them, 5% of the keys. Roughly what share of reads does the cache answer?",
      options: [
        { id: "five", label: "About 5%, the share of keys it holds" },
        { id: "quarter", label: "About a quarter" },
        { id: "sixty", label: "About 60%" },
        { id: "all", label: "Nearly all of them" },
      ],
      answer: "sixty",
      observe: "filled",
      reveal: {
        text: "Real traffic is heavily skewed, so a cache holding 5% of the keys, if it keeps the right ones, answers around 60% of reads. Hit ratio tracks how skewed traffic is, not how much of the data fits.",
        sourceIds: ["breslau-1999"],
        line: { speaker: "meera", line: "A cache is a bet on popularity. Traffic usually pays out." },
      },
    },
  ],
  widget: { id: "cache-lab", config: CACHE },
  mechanism: [
    {
      id: "pattern",
      scene: "flow",
      text: "In cache-aside the application owns the logic. On a read it checks the cache, and on a miss it reads the database, stores the result in the cache with a TTL, and returns it. On a write it updates the database and deletes the cached key, so the next read refills it.",
      sourceIds: ["azure-cache-aside", "aws-caching-patterns"],
    },
    {
      id: "hit-ratio",
      scene: "size",
      text: "The number that matters is the hit ratio: the share of reads the cache answers. Database load is reads times the miss ratio, so going from 60% to 90% hits cuts the database's read load to a quarter, not by a third.",
      derived: true,
    },
    {
      id: "skew",
      text: "Hit ratio comes from skew. A handful of keys get most traffic, so the first few entries buy a lot and each doubling of the cache buys less. Studies of web traffic found request frequencies follow a Zipf-like distribution, which is why caches work at all.",
      sourceIds: ["breslau-1999"],
    },
    {
      id: "cost",
      text: "A cache is not free correctness. It adds a second copy of the data that can be stale, a failure mode if it goes down and everything lands on the database, and a warm-up period after a restart. Design for the cold cache, not only the warm one.",
    },
  ],
  challenges: [
    {
      id: "relieve-db",
      title: "Take the load off Postgres",
      brief: "Pigeon's feed gets 2,400 reads a second. Postgres sustains 800 before it queues. The cache has 50 entries. Choose the cache size so the database runs under 70% busy.",
      line: { speaker: "rao", line: "Memory is cheap, but I would like to know how much of it we actually need." },
      widget: { id: "cache-lab", config: CACHE_CHALLENGE },
      conditions: [{ metric: "dbUtil", op: "<", value: 0.7, label: "Database under 70% busy" }],
      stars: [{ metric: "cacheEntries", op: "<=", value: 4500, label: "Cache of 4,500 entries or fewer" }],
      hints: [
        "How many reads a second can the database take at 70%, and what miss ratio does that need?",
        "That is a hit ratio of about two thirds. Read the curve: how many entries reach it?",
        "The curve flattens, so do not overshoot. Stop where the database crosses under 70%.",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe the cache-aside pattern for reads and writes, and what decides how much a cache helps.",
    rubric: [
      { id: "read", criterion: "On a read: check the cache, on a miss load from the database, store in the cache, return", keyIdea: "lazy loading" },
      { id: "write", criterion: "On a write: update the database and invalidate (delete) the cached entry", keyIdea: "invalidate on write" },
      { id: "ratio", criterion: "Hit ratio follows traffic skew and cache size, and the database load is reads times the miss ratio", keyIdea: "hit ratio and skew" },
    ],
    exemplar:
      "On a read the app checks the cache first, and on a miss it reads the database, stores the value with a TTL and returns it. On a write it updates the database and deletes the cached key so the next read refills it. How much it helps depends on the hit ratio, which comes from how skewed traffic is and how many entries fit, and the database only sees the misses.",
  },
  reviews: [
    {
      id: "ca-est-load",
      format: "estimate",
      scenario: "A service makes 2,000 reads a second and the cache hit ratio is 90%. How many reads a second reach the database?",
      unit: "reads/s",
      answer: 200,
      acceptFactor: 1.2,
      breakdown: ["Misses = 2,000 × (1 − 0.9)", "= 200 reads/s"],
      explain: "The database only sees the misses. Raising the hit ratio from 90% to 95% halves its load.",
    },
    {
      id: "ca-est-avg",
      format: "estimate",
      scenario: "A cache hit costs 1 ms and a miss costs 13 ms in total (cache check plus database). At an 80% hit ratio, what is the average read time?",
      unit: "ms",
      answer: 3.4,
      acceptFactor: 1.2,
      breakdown: ["0.8 × 1 ms + 0.2 × 13 ms", "= 0.8 + 2.6", "= 3.4 ms"],
      explain: "The misses dominate the average even at 80% hits, which is why hit ratio improvements keep paying off.",
    },
    {
      id: "ca-pick",
      format: "pick-fix",
      scenario: "After a deploy that restarted the cache, the database falls over for ten minutes and then recovers on its own. What explains it?",
      options: [
        { id: "a", label: "A cold cache sent every read to the database until it warmed up" },
        { id: "b", label: "The cache has a memory leak" },
        { id: "c", label: "Redis cannot restart cleanly" },
        { id: "d", label: "The database ran out of disk" },
      ],
      answer: "a",
      explain: "The database was sized assuming a warm cache. After a flush every read misses, so load jumps to the full read rate until the hot keys are refilled. Plan for the cold start: warm the cache, or ramp traffic.",
    },
    {
      id: "ca-order",
      format: "order",
      scenario: "Order these by how much database read load they leave behind at 2,000 reads a second, least first.",
      items: [
        { id: "h95", label: "95% hit ratio" },
        { id: "h50", label: "50% hit ratio" },
        { id: "h90", label: "90% hit ratio" },
        { id: "h0", label: "No cache" },
      ],
      answer: ["h95", "h90", "h50", "h0"],
      explain: "100, 200, 1,000, and 2,000 reads a second. Moving from 90% to 95% hits halves the database load, which is as valuable as going from 50% to 75%.",
    },
    {
      id: "ca-graph",
      format: "predict-graph",
      scenario: "Grow the cache from 10 to 10,000 entries under skewed traffic. How does the hit ratio change?",
      xLabel: "cache entries →",
      yLabel: "hit ratio",
      options: [
        { id: "linear", label: "Straight line up", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "concave", label: "Steep at first, then flattening", points: [1.5, 3.5, 5, 6, 6.8, 7.3, 7.7, 7.9] },
        { id: "flat", label: "Flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "step", label: "Nothing, then a jump", points: [1, 1, 1, 1, 8, 8, 8, 8] },
      ],
      answer: "concave",
      explain: "Each new entry holds a slightly less popular key than the one before, so each adds less traffic than the last. That is the shape of every cache-sizing decision.",
    },
    {
      id: "ca-flaw",
      format: "spot-flaw",
      scenario: "A write path updates the database and then updates the cached value in place. Two writes race and the cache ends up holding the older value permanently. Tap the risky step.",
      diagram: {
        nodes: [
          { id: "api", label: "api", kind: "server", col: 0, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 1, row: 0 },
          { id: "cache", label: "redis · set the new value on write", kind: "cache", col: 1, row: 2 },
        ],
        edges: [
          { from: "api", to: "db" },
          { from: "api", to: "cache" },
        ],
      },
      answer: "api->cache",
      explain: "Two concurrent writers can apply their cache updates in a different order than their database updates. Deleting the key on write is safer: the next read fills it from the database's truth.",
    },
    {
      id: "ca-explain",
      format: "explain",
      scenario: "In two sentences: why does a cache with a 90% hit ratio cut database load by far more than 10% compared with 80%?",
      rubric: [
        { id: "misses", criterion: "The database only sees misses, so load is proportional to 1 minus the hit ratio" },
        { id: "half", criterion: "Going from 80% to 90% hits halves the miss ratio, from 20% to 10%" },
      ],
      exemplar: "The database only sees the misses, so its load follows one minus the hit ratio. Going from 80% to 90% hits cuts the miss ratio from 20% to 10%, which halves the database's work.",
      explain: "Look at the misses, not the hits.",
    },
  ],
  codex: {
    oneLiner: "Cache-aside: read the cache, fill it on a miss, delete the key on a write. The database sees only the misses.",
    keyNumbers: [
      { label: "Database load", value: "reads × (1 − hit ratio)", sourceId: "aws-caching-patterns" },
      { label: "Traffic shape", value: "Zipf-like: a few keys take most requests", sourceId: "breslau-1999" },
    ],
    tradeoffs: [
      { choice: "Cache-aside", gain: "Simple, caches only what is read, survives cache loss", cost: "A miss costs the full path; stale data until the key is deleted or expires" },
      { choice: "Bigger cache", gain: "Higher hit ratio", cost: "Diminishing returns past the hot set" },
    ],
    seenIn: ["Redis or Memcached in front of Postgres for read-heavy endpoints.", "ElastiCache with lazy loading and TTLs."],
    interviewAngle: "Name the pattern and its failure: 'cache-aside with a TTL, invalidate on write, and a plan for cold starts and stampedes'.",
    aws: [{ concept: "Managed cache", service: "Amazon ElastiCache (Redis or Memcached)" }],
    otherClouds: "GCP: Memorystore · Azure: Azure Cache for Redis",
    replay: { id: "cache-lab", config: CACHE, scene: "size" },
  },
  interview: [
    "Walk me through cache-aside for reads and for writes.",
    "How do you pick the cache size?",
    "What happens to your database when the cache is flushed?",
  ],
  deeper: [
    {
      title: "Other patterns",
      body: "Read-through puts the miss logic inside the cache layer, so the application only ever talks to the cache. Write-through and write-back extend that to writes. Cache-aside keeps all of it in the application, which is more code and more control, and it is the pattern most Redis deployments use.",
      sourceIds: ["aws-caching-patterns"],
    },
  ],
  honestPhysics: [
    "Traffic is Zipf-distributed over 20,000 keys, with exponent 0.99. Real popularity drifts through the day and with events.",
    "A hit costs 1 ms and a miss 13 ms. Real latencies depend on payload size and network.",
    "The cache is assumed always up. A real outage sends all reads to the database.",
  ],
  sources: [AZURE_CA, AWS_CACHING, BRESLAU],
  verify: [
    { id: "small-hits", claim: "A 1,000-entry cache over 20,000 skewed keys answers about 60% of reads", run: "lab", params: { model: "cache-lab", config: CACHE, values: { entries: 1000, view: "size" }, metric: "hitRatio" }, expect: { min: 0.55, max: 0.68 } },
    { id: "start-fails", claim: "50 entries leave the database overloaded", run: "lab", params: { model: "cache-lab", config: CACHE_CHALLENGE, values: {}, metric: "dbUtil" }, expect: { min: 1 } },
    { id: "sized", claim: "5,000 entries bring the database under 70%", run: "lab", params: { model: "cache-lab", config: CACHE_CHALLENGE, values: { entries: 5000 }, metric: "dbUtil" }, expect: { max: 0.7 } },
    { id: "lean", claim: "2,000 entries are not quite enough", run: "lab", params: { model: "cache-lab", config: CACHE_CHALLENGE, values: { entries: 2000 }, metric: "dbUtil" }, expect: { min: 0.7 } },
  ],
});
