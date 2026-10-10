import { definePack } from "../define";

export const STAMPEDE = { lockKeys: true, keys: 40, perKeyRps: 30, dbCap: 600, start: { mode: "lock", jitter: true, keys: 40 } };
export const STAMPEDE_BIG = { lockKeys: true, keys: 400, perKeyRps: 30, dbCap: 2000, start: { mode: "none", jitter: false, keys: 400 } };

const NISHTALA = { id: "nishtala-2013", title: "R. Nishtala et al. (2013), Scaling Memcache at Facebook, USENIX NSDI (leases against thundering herds)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala" };
const VATTANI = { id: "vattani-2015", title: "A. Vattani, F. Chierichetti, K. Lowenstein (2015), Optimal Probabilistic Cache Stampede Prevention, PVLDB 8(8)", url: "https://www.vldb.org/pvldb/vol8/p886-vattani.pdf" };
const SINGLEFLIGHT = { id: "go-singleflight", title: "Go package singleflight: duplicate function call suppression", url: "https://pkg.go.dev/golang.org/x/sync/singleflight" };
const RFC5861 = { id: "rfc5861", title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content (stale-while-revalidate)", url: "https://www.rfc-editor.org/rfc/rfc5861" };

export default definePack({
  id: "cache-stampede",
  title: "Cache Stampedes",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "postgres · CPU 100%", detail: "every 20 seconds, in a perfect sawtooth" },
    lines: [
      { speaker: "pager", line: "Postgres spikes to 100% every twenty seconds and recovers. Traffic is flat." },
      { speaker: "meera", line: "Everything in the cache expires at the same instant. Every request that notices rebuilds the same page, together." },
    ],
  },
  predictions: [
    {
      id: "same-instant",
      kind: "choice",
      prompt: "Forty hot keys, each read 30 times a second, were all cached at the same moment with the same 20-second TTL. A rebuild takes 0.4 seconds, and the database handles 600 queries a second. What happens at the first expiry?",
      options: [
        { id: "fine", label: "Nothing; the database absorbs it" },
        { id: "blip", label: "A small blip, 20% over capacity" },
        { id: "double", label: "About double capacity, and rebuilds slow down further" },
        { id: "crash", label: "The cache cluster crashes" },
      ],
      answer: "double",
      observe: "stampede",
      reveal: {
        text: "Every read of an expired key misses and goes to the database. 40 keys times 30 reads a second is 1,200 queries a second for as long as each rebuild takes, twice the database's capacity. Overload slows each rebuild, which keeps the keys missing longer.",
        derived: true,
        line: { speaker: "rao", line: "A spike every twenty seconds is us attacking ourselves on a timer." },
      },
    },
  ],
  widget: { id: "stampede-lab", config: STAMPEDE },
  mechanism: [
    {
      id: "herd",
      scene: "expire",
      text: "When a popular key expires, every request that arrives before the first rebuild finishes sees a miss and runs the query. A key read 30 times a second with a 0.4-second rebuild sends 12 identical queries to the database. Forty such keys expiring together sends hundreds.",
      sourceIds: ["nishtala-2013"],
      derived: true,
    },
    {
      id: "lock",
      scene: "lock",
      text: "Collapse the duplicates. With a lock or single-flight, the first miss rebuilds and the others wait for its result, so the database runs one query per key. Facebook's leases and Go's singleflight package both work this way.",
      sourceIds: ["nishtala-2013", "go-singleflight"],
    },
    {
      id: "early",
      scene: "early",
      text: "Or avoid the miss. Refresh a key shortly before it expires, with a probability that rises as expiry nears, so one request rebuilds while everyone else still gets the old value. The VLDB paper on probabilistic early expiration shows how to pick the odds. Serving the stale value while revalidating, as HTTP's stale-while-revalidate does, has the same effect.",
      sourceIds: ["vattani-2015", "rfc5861"],
    },
    {
      id: "jitter",
      scene: "jitter",
      text: "Jitter the TTLs. Keys cached together with the same TTL expire together. Adding a random slice to each TTL spreads the expiries over time, so the rebuilds arrive as a trickle instead of a wave. It does nothing for one very hot key, so use it with a lock.",
    },
  ],
  challenges: [
    {
      id: "four-hundred",
      title: "Smooth the sawtooth",
      brief: "400 hot keys, each read 30 times a second, were cached together and expire together every 20 seconds. The database handles 2,000 queries a second. Choose protection and jitter so the database peaks under 30% of capacity with under 1% of requests failing.",
      line: { speaker: "meera", line: "One protection is not always enough. Think about which problem each one solves." },
      widget: { id: "stampede-lab", config: STAMPEDE_BIG },
      conditions: [
        { metric: "dbPeakUtil", op: "<", value: 0.3, label: "Database peak under 30% of capacity" },
        { metric: "errorRate", op: "<", value: 0.01, label: "Under 1% of requests fail" },
      ],
      stars: [{ metric: "dbPeakUtil", op: "<", value: 0.2, label: "Database peak under 20%" }],
      hints: [
        "How does the database load look with no protection at all?",
        "Each single protection helps. Is any one of them enough on its own for this load?",
        "Combine one thing that spreads the expiries in time with one that collapses duplicates.",
      ],
    },
  ],
  explainBack: {
    prompt: "What is a cache stampede, and how do you prevent one?",
    rubric: [
      { id: "cause", criterion: "A hot key expires and many concurrent requests miss and rebuild it at once, overloading the database", keyIdea: "many rebuilds at once" },
      { id: "collapse", criterion: "Collapses duplicate rebuilds with a lock or single-flight, or avoids misses with early refresh or stale-while-revalidate", keyIdea: "one rebuild" },
      { id: "jitter", criterion: "Adds jitter to TTLs so keys do not expire together", keyIdea: "spread expiries" },
    ],
    exemplar:
      "A stampede happens when a hot key expires and every request that arrives before it is rebuilt misses and runs the same expensive query, which can overload the database and make rebuilds slower. I would collapse duplicates with a lock or single-flight, or refresh early or serve stale while revalidating so there is no miss, and add jitter to TTLs so many keys do not expire at the same moment.",
  },
  reviews: [
    {
      id: "cs-est-dups",
      format: "estimate",
      scenario: "A hot key is read 200 times a second and takes 0.5 seconds to rebuild. With no protection, about how many duplicate rebuild queries run when it expires?",
      unit: "queries",
      answer: 100,
      acceptFactor: 1.2,
      breakdown: ["Reads during the rebuild: 200 × 0.5 s", "= 100 requests, each running the query"],
      explain: "Every read in the rebuild window misses. A lock cuts 100 queries to one.",
    },
    {
      id: "cs-est-load",
      format: "estimate",
      scenario: "50 keys, each read 20 times a second, expire together and rebuild in 0.4 seconds. What peak database load, in queries a second, does an unprotected expiry produce?",
      unit: "queries/s",
      answer: 1000,
      acceptFactor: 1.15,
      breakdown: ["50 keys × 20 reads/s", "= 1,000 queries/s while the keys are missing"],
      explain: "During the rebuild window the whole read rate of those keys goes to the database.",
    },
    {
      id: "cs-pick",
      format: "pick-fix",
      scenario: "One very popular key (the home page's data) causes a stampede each time it expires. Jitter does not help because there is only one key. What does?",
      options: [
        { id: "a", label: "A lock or single-flight so one request rebuilds it, or serve stale while revalidating" },
        { id: "b", label: "More jitter" },
        { id: "c", label: "A shorter TTL" },
        { id: "d", label: "More database replicas only" },
      ],
      answer: "a",
      explain: "Jitter spreads many keys over time; it cannot spread one key. A single rebuild, or serving the old value during it, removes the herd.",
    },
    {
      id: "cs-order",
      format: "order",
      scenario: "Order these approaches by how much peak database load they leave at a mass expiry, least first.",
      items: [
        { id: "lockjit", label: "Lock plus TTL jitter" },
        { id: "lock", label: "Lock only" },
        { id: "jit", label: "Jitter only" },
        { id: "none", label: "No protection" },
      ],
      answer: ["lockjit", "lock", "jit", "none"],
      explain: "The two together spread the expiries and collapse the duplicates. Either alone helps a lot; nothing leaves the full herd.",
    },
    {
      id: "cs-graph",
      format: "predict-graph",
      scenario: "Database load over time at a mass expiry with no protection, where the database is at 2 times capacity during the rebuild. What does the curve look like?",
      xLabel: "time →",
      yLabel: "database load",
      options: [
        { id: "flat", label: "Flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "spike", label: "A sharp spike at the expiry, then back down", points: [1, 1, 1, 8, 8, 2, 1, 1] },
        { id: "ramp", label: "A slow steady ramp", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "step", label: "A step that stays high", points: [1, 1, 1, 8, 8, 8, 8, 8] },
      ],
      answer: "spike",
      explain: "Load jumps when the keys expire, and falls once the rebuilds land and the cache holds the values again. Overload slows the rebuilds, so the spike lasts longer than the query time suggests.",
    },
    {
      id: "cs-flaw",
      format: "spot-flaw",
      scenario: "A warm-up script loads 10,000 product pages into Redis at 02:00 with a fixed 24-hour TTL. At 02:00 every day the database falls over. Tap the part causing the daily spike.",
      diagram: {
        nodes: [
          { id: "warm", label: "warm-up script · same TTL for all pages", kind: "worker", col: 0, row: 1 },
          { id: "redis", label: "redis · 10,000 keys expiring together", kind: "cache", col: 1, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "warm", to: "redis" },
          { from: "redis", to: "db" },
        ],
      },
      answer: "warm->redis",
      explain: "Keys written together with the same TTL expire together. Add random jitter to each TTL so expiry spreads over hours.",
    },
    {
      id: "cs-explain",
      format: "explain",
      scenario: "In two sentences: why does an overloaded database make a stampede last longer?",
      rubric: [
        { id: "slower", criterion: "Rebuild queries take longer when the database is overloaded" },
        { id: "longer", criterion: "While keys stay missing, more requests miss and add more load, a feedback loop" },
      ],
      exemplar: "When the database is overloaded each rebuild query slows down, so the key stays missing longer. During that time more requests miss and add load, which slows the rebuilds again.",
      explain: "A stampede is a positive feedback loop, so it needs to be broken, not waited out.",
    },
  ],
  codex: {
    oneLiner: "A stampede is many requests rebuilding the same expired key at once. Collapse rebuilds, refresh early or serve stale, and jitter TTLs.",
    keyNumbers: [
      { label: "Duplicate rebuilds", value: "reads/s × rebuild seconds", sourceId: "nishtala-2013" },
      { label: "Probabilistic early expiration", value: "refresh with rising probability near expiry", sourceId: "vattani-2015" },
      { label: "Stale content", value: "stale-while-revalidate (HTTP)", sourceId: "rfc5861" },
    ],
    tradeoffs: [
      { choice: "Lock or single-flight", gain: "One query per key", cost: "Waiters block on the rebuilder; needs a lock timeout" },
      { choice: "Early refresh or stale-while-revalidate", gain: "No visible miss at all", cost: "Slightly stale data and extra background reads" },
      { choice: "TTL jitter", gain: "Spreads many keys over time", cost: "Does nothing for a single hot key" },
    ],
    seenIn: ["Sawtooth load graphs on databases behind caches.", "Redis locks with SET NX, Go singleflight, and CDN stale-while-revalidate."],
    interviewAngle: "Always mention the expiry cliff when you add a cache: 'with TTL jitter and single-flight rebuilds so a hot key expiring does not stampede the database'.",
    aws: [{ concept: "Stale content at the edge", service: "CloudFront stale-while-revalidate and origin shield" }],
    replay: { id: "stampede-lab", config: STAMPEDE, scene: "expire" },
  },
  interview: [
    "What is a cache stampede and how do you prevent it?",
    "Why does adding jitter to TTLs help, and when does it not?",
    "How would you rebuild a hot key without sending thousands of queries to the database?",
  ],
  deeper: [
    {
      title: "Choosing the early-refresh odds",
      body: "Probabilistic early expiration decides, on each read, whether to refresh now, with a chance that rises as the expiry nears and as the rebuild gets more expensive. The paper proves the odds that minimise stampedes without refreshing wastefully, and the rule is short enough to fit in a few lines of code in the application, with no coordination between readers.",
      sourceIds: ["vattani-2015"],
    },
  ],
  honestPhysics: [
    "Keys expire at the same instant when cached together; jitter spreads them over 40% of the TTL. Real caches fill continuously, so a perfect synchronised expiry is the worst case.",
    "Rebuild time stretches in proportion to how far over capacity the database is, a simple stand-in for queueing.",
    "A lock lets one request per key through, and stale-while-revalidate does the same while serving old data.",
  ],
  sources: [NISHTALA, VATTANI, SINGLEFLIGHT, RFC5861],
  verify: [
    { id: "herd", claim: "Forty unprotected keys push the database to about twice capacity", run: "lab", params: { model: "stampede-lab", config: STAMPEDE, values: { mode: "none", jitter: false }, metric: "dbPeakUtil" }, expect: { min: 1.8, max: 2.3 } },
    { id: "big-herd", claim: "400 unprotected keys overload the database several times over", run: "lab", params: { model: "stampede-lab", config: STAMPEDE_BIG, values: {}, metric: "dbPeakUtil" }, expect: { min: 4 } },
    { id: "jitter-alone", claim: "Jitter alone is not enough for the 30% target", run: "lab", params: { model: "stampede-lab", config: STAMPEDE_BIG, values: { jitter: true }, metric: "dbPeakUtil" }, expect: { min: 0.3 } },
    { id: "lock-alone", claim: "A lock alone is not enough either", run: "lab", params: { model: "stampede-lab", config: STAMPEDE_BIG, values: { mode: "lock" }, metric: "dbPeakUtil" }, expect: { min: 0.3 } },
    { id: "both", claim: "Lock plus jitter holds the database under 30%", run: "lab", params: { model: "stampede-lab", config: STAMPEDE_BIG, values: { mode: "lock", jitter: true }, metric: "dbPeakUtil" }, expect: { max: 0.3 } },
    { id: "both-star", claim: "…and under 20%", run: "lab", params: { model: "stampede-lab", config: STAMPEDE_BIG, values: { mode: "lock", jitter: true }, metric: "dbPeakUtil" }, expect: { max: 0.2 } },
  ],
});
