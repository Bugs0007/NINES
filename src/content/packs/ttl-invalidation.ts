import { definePack } from "../define";

export const STALE = { readRate: 1, changeRate: 0.01, start: { ttl: 2, invalidate: false } };
export const STALE_CHALLENGE = { readRate: 1, changeRate: 0.01, start: { ttl: 300, invalidate: false } };

const NISHTALA = { id: "nishtala-2013", title: "R. Nishtala et al. (2013), Scaling Memcache at Facebook, USENIX NSDI (invalidation, leases, stale sets)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala" };
const AZURE_CA = { id: "azure-cache-aside", title: "Microsoft Azure Architecture Center: Cache-Aside pattern (expiration and invalidation)", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside" };
const RFC9111 = { id: "rfc9111", title: "RFC 9111: HTTP Caching (freshness, validation, Cache-Control)", url: "https://www.rfc-editor.org/rfc/rfc9111" };

export default definePack({
  id: "ttl-invalidation",
  title: "TTLs & Invalidation",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · profile edits", detail: "'I changed my photo and the old one keeps coming back'" },
    lines: [
      { speaker: "kabir", line: "A user changes their profile photo and sees the old one for five minutes. Support is calling it a bug and I am calling it a TTL." },
      { speaker: "meera", line: "Both are right. Invalidation is the part of caching that is actually hard, so let us look at what you can trade." },
    ],
  },
  predictions: [
    {
      id: "stale-share",
      kind: "choice",
      prompt: "A key is read once a second and changes about once every 100 seconds. It is cached with a 5-minute TTL and nothing deletes it on writes. What share of reads return an old value?",
      options: [
        { id: "few", label: "Under 5%" },
        { id: "third", label: "About a third" },
        { id: "two-thirds", label: "About two thirds" },
        { id: "all", label: "Nearly all of them" },
      ],
      answer: "two-thirds",
      observe: "stale-seen",
      reveal: {
        text: "The cached copy lives up to 300 seconds, but the data changes every 100 on average. A copy is stale from the first change onward, so for most of its life it is out of date. About 68% of reads see old data.",
        derived: true,
        line: { speaker: "meera", line: "A TTL longer than the change interval means the cache is usually wrong." },
      },
    },
  ],
  widget: { id: "stale-lab", config: STALE },
  mechanism: [
    {
      id: "ttl",
      scene: "ttl",
      text: "A TTL is a bound on how long a wrong answer can live. Longer means more hits and fewer database reads, and more stale reads. When a key changes about every 100 seconds, a 5-minute TTL means the cached copy is wrong for most of its life.",
      sourceIds: ["azure-cache-aside"],
    },
    {
      id: "delete",
      scene: "delete",
      text: "Invalidating on write removes the trade. When the data changes, delete the cached key and the next read refills it from the database. Staleness no longer depends on the TTL, which can then be long, so hit ratio stays high.",
      sourceIds: ["nishtala-2013"],
    },
    {
      id: "race",
      scene: "race",
      text: "Deleting is not perfect. A reader can load the old row, a writer can commit and delete, and the reader can then store the old value back, leaving a stale entry until the TTL. Facebook's memcache uses leases so only the right writer may fill the key. Keep a TTL as a backstop either way.",
      sourceIds: ["nishtala-2013"],
    },
    {
      id: "http",
      text: "HTTP caches follow the same rules. Cache-Control sets freshness lifetimes, and validators like ETag let a cache ask cheaply whether its copy is still good. When you cannot reach every cache to invalidate it, short TTLs, validation, or changing the URL on every new version are the tools.",
      sourceIds: ["rfc9111"],
    },
  ],
  challenges: [
    {
      id: "profile-cache",
      title: "Fresh enough, fast enough",
      brief: "Each profile is read about once a second and changes about once every 100 seconds. Reads that return old data must stay under 1%, and the cache hit ratio must stay at 90% or better. Choose a TTL and whether to delete on write.",
      line: { speaker: "rao", line: "I would like it correct and cheap. I am told those are two different asks." },
      widget: { id: "stale-lab", config: STALE_CHALLENGE },
      conditions: [
        { metric: "staleShare", op: "<", value: 0.01, label: "Under 1% stale reads" },
        { metric: "hitRatio", op: ">=", value: 0.9, label: "Hit ratio at least 90%" },
      ],
      stars: [{ metric: "dbRps", op: "<", value: 0.02, label: "Under 0.02 database reads a second per key" }],
      hints: [
        "With a TTL alone, how short must it be to keep stale reads under 1%, and what does that do to the hit ratio?",
        "Is there a way to make the cache wrong for much less time than the TTL?",
        "Delete on write, then see how long the TTL can be.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the tradeoff a TTL makes, how invalidation on write changes it, and one way invalidation can still go wrong.",
    rubric: [
      { id: "ttl", criterion: "A TTL bounds staleness but trades it against hit ratio: longer means fewer database reads and more stale data", keyIdea: "TTL tradeoff" },
      { id: "invalidate", criterion: "Deleting the key on write makes staleness independent of the TTL, so the TTL can be long", keyIdea: "delete on write" },
      { id: "race", criterion: "A race can refill the cache with an old value (reader loads old row, writer commits and deletes, reader stores), so a TTL backstop or leases are needed", keyIdea: "refill race" },
    ],
    exemplar:
      "A TTL caps how long a wrong answer can live, but a short TTL means more database reads and a long one means more stale data, so you are trading hit ratio against freshness. Deleting the key whenever the data changes makes staleness independent of the TTL, so the TTL can be long and hit ratio high. It can still fail through a race: a reader loads the old row, the writer commits and deletes, then the reader stores the old value, so I keep a TTL as a backstop or use leases.",
  },
  reviews: [
    {
      id: "ti-est",
      format: "estimate",
      scenario: "A key changes once a minute on average and is cached with a 60-second TTL, with no invalidation. Roughly what share of reads see an old value? (Use 1 − (1 − e^(−x)) ÷ x with x = TTL ÷ change interval.)",
      unit: "%",
      answer: 37,
      acceptFactor: 1.2,
      breakdown: ["x = 60 ÷ 60 = 1", "1 − e^(−1) = 0.632", "1 − 0.632 ÷ 1 = 0.368", "≈ 37%"],
      explain: "When the TTL equals the typical change interval, about a third of reads are stale. Much longer and nearly all are.",
    },
    {
      id: "ti-pick",
      format: "pick-fix",
      scenario: "Users change their display name and keep seeing the old one for up to an hour because of a 1-hour TTL. You want fresh names without a short TTL. What do you do?",
      options: [
        { id: "a", label: "Delete or update the cached key when the name changes, and keep the long TTL as a backstop" },
        { id: "b", label: "Set the TTL to 1 second" },
        { id: "c", label: "Disable the cache for profiles" },
        { id: "d", label: "Tell users to refresh" },
      ],
      answer: "a",
      explain: "Invalidating on write keeps the cache fresh without losing the hit ratio. The TTL still protects against missed invalidations.",
    },
    {
      id: "ti-pick2",
      format: "pick-fix",
      scenario: "You cache static JavaScript on a CDN with a long TTL and cannot purge every edge reliably. How do you ship a new version without stale code?",
      options: [
        { id: "a", label: "Put a content hash in the file name so a new version is a new URL" },
        { id: "b", label: "Use a 5-second TTL" },
        { id: "c", label: "Email users" },
        { id: "d", label: "Overwrite the file in place and hope" },
      ],
      answer: "a",
      explain: "A URL that never changes content can be cached for a year. A new version has a new name, so there is nothing to invalidate.",
    },
    {
      id: "ti-order",
      format: "order",
      scenario: "Order these caching setups by how often reads return old data, least often first. The key changes every 100 seconds.",
      items: [
        { id: "inv", label: "Delete on write, 1-hour TTL" },
        { id: "t10", label: "TTL only, 10 seconds" },
        { id: "t100", label: "TTL only, 100 seconds" },
        { id: "t3600", label: "TTL only, 1 hour" },
      ],
      answer: ["inv", "t10", "t100", "t3600"],
      explain: "Invalidation removes most staleness. Among TTL-only setups, the shorter the TTL relative to the change interval, the fewer stale reads.",
    },
    {
      id: "ti-graph",
      format: "predict-graph",
      scenario: "For a key that changes every 100 seconds, raise the TTL from 1 second to 1 hour with no invalidation. How does the share of stale reads change?",
      xLabel: "TTL →",
      yLabel: "stale reads",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises, then saturates near 100%", points: [0.5, 1.5, 4, 6.5, 7.5, 7.8, 7.9, 8] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "fall", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "sat",
      explain: "Stale reads track TTL ÷ change interval, so they climb while the TTL is shorter than the interval, then approach all reads once it is much longer.",
    },
    {
      id: "ti-flaw",
      format: "spot-flaw",
      scenario: "A product service deletes the cache key before committing the database change. Under load, readers refill the cache with the old price just after the delete, and it stays wrong until the TTL. Tap the step in the wrong order.",
      diagram: {
        nodes: [
          { id: "api", label: "api · delete cache, then commit", kind: "server", col: 0, row: 1 },
          { id: "cache", label: "redis", kind: "cache", col: 1, row: 0 },
          { id: "db", label: "postgres", kind: "db", col: 1, row: 2 },
        ],
        edges: [
          { from: "api", to: "cache" },
          { from: "api", to: "db" },
        ],
      },
      answer: "api->cache",
      explain: "Delete after the commit. If you delete first, a reader can reload the old row and re-cache it before your write lands, which is the stale entry you were trying to prevent.",
    },
    {
      id: "ti-explain",
      format: "explain",
      scenario: "In two sentences: why keep a TTL even when you invalidate on every write?",
      rubric: [
        { id: "miss", criterion: "Invalidations can be missed or lost: a failed delete, a race, or a writer that bypasses the hook" },
        { id: "bound", criterion: "The TTL bounds how long any such error can last" },
      ],
      exemplar: "A delete can fail, race with a refill, or be skipped by a writer that bypasses your code. The TTL bounds how long any of those mistakes can stay visible.",
      explain: "Invalidation is the fast path and the TTL is the safety net.",
    },
  ],
  codex: {
    oneLiner: "A TTL bounds staleness but trades it against hit ratio. Deleting on write frees the TTL from freshness; keep it as a backstop.",
    keyNumbers: [
      { label: "Stale share with TTL only", value: "1 − (1 − e^(−x)) ÷ x, x = TTL ÷ change interval", sourceId: "azure-cache-aside" },
      { label: "HTTP freshness", value: "Cache-Control max-age, ETag validation", sourceId: "rfc9111" },
    ],
    tradeoffs: [
      { choice: "Short TTL", gain: "Simple, bounded staleness", cost: "Lower hit ratio, more database load" },
      { choice: "Delete on write plus TTL backstop", gain: "Fresh and fast", cost: "Every writer must invalidate; refill races need care" },
      { choice: "Versioned keys or URLs", gain: "Nothing to invalidate", cost: "Old versions linger until evicted" },
    ],
    seenIn: ["Redis profile and session caches.", "CDN cache-busting with hashed file names."],
    interviewAngle: "State the freshness requirement first ('a user must see their own edit at once') and then pick: invalidate on write, with a TTL backstop and read-your-writes from the primary.",
    aws: [{ concept: "Invalidation", service: "CloudFront invalidation requests, ElastiCache DEL on write" }],
    replay: { id: "stale-lab", config: { ...STALE, start: { ttl: 3600, invalidate: true } }, scene: "delete" },
  },
  interview: [
    "How do you keep a cache consistent with a database?",
    "What is wrong with deleting the cache key before the database write?",
    "When would you rather version the key than invalidate it?",
  ],
  deeper: [
    {
      title: "Leases and thundering herds",
      body: "Facebook's memcache gives a reader a lease token on a miss. Only the holder may fill the key, and an invalidation voids the token, so a stale fill is refused. Leases also rate-limit refills, so a hot key that just got invalidated sends one reader to the database instead of thousands, which is the next lesson's problem.",
      sourceIds: ["nishtala-2013"],
    },
  ],
  honestPhysics: [
    "Reads and changes are Poisson processes on one key. Real keys change in bursts, such as a user editing their profile several times in a minute.",
    "The race window after a delete is set to 100 ms. Real windows depend on replication lag and queueing.",
    "Hit ratio is the fixed-TTL approximation rT ÷ (1 + rT), with the effective TTL capped by the change interval when invalidating.",
  ],
  sources: [NISHTALA, AZURE_CA, RFC9111],
  verify: [
    { id: "two-thirds", claim: "A 5-minute TTL on a key that changes every 100 s serves about two thirds stale reads", run: "lab", params: { model: "stale-lab", config: STALE_CHALLENGE, values: { ttl: 300, invalidate: false }, metric: "staleShare" }, expect: { min: 0.64, max: 0.72 } },
    { id: "short-ttl", claim: "A 2 s TTL is fresh enough but misses the hit ratio", run: "lab", params: { model: "stale-lab", config: STALE_CHALLENGE, values: { ttl: 2, invalidate: false }, metric: "hitRatio" }, expect: { max: 0.9 } },
    { id: "inv-fresh", claim: "Delete on write keeps stale reads under 1%", run: "lab", params: { model: "stale-lab", config: STALE_CHALLENGE, values: { ttl: 300, invalidate: true }, metric: "staleShare" }, expect: { max: 0.01 } },
    { id: "inv-hit", claim: "…with a 99% hit ratio", run: "lab", params: { model: "stale-lab", config: STALE_CHALLENGE, values: { ttl: 300, invalidate: true }, metric: "hitRatio" }, expect: { min: 0.95 } },
  ],
});
