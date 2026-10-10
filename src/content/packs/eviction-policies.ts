import { definePack } from "../define";

export const EVICT = { entries: 400, start: { policy: "lru", entries: 400, scan: 0 } };
export const EVICT_SCAN = { entries: 400, lockScan: true, scan: 0.3, start: { policy: "lru", entries: 400 } };

const REDIS_EVICTION = { id: "redis-eviction", title: "Redis docs: Key eviction (LRU, LFU, and approximated algorithms)", url: "https://redis.io/docs/latest/develop/reference/eviction/" };
const MEGIDDO = { id: "arc-2003", title: "N. Megiddo and D. Modha (2003), ARC: A Self-Tuning, Low Overhead Replacement Cache, USENIX FAST", url: "https://www.usenix.org/conference/fast-03/arc-self-tuning-low-overhead-replacement-cache" };
const TINYLFU = { id: "tinylfu-2017", title: "G. Einziger, R. Friedman, B. Manes (2017), TinyLFU: A Highly Efficient Cache Admission Policy, ACM TOS", url: "https://doi.org/10.1145/3149371" };

export default definePack({
  id: "eviction-policies",
  title: "Eviction: LRU vs LFU",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "redis · hit ratio", detail: "dropped when the nightly export started" },
    lines: [
      { speaker: "kabir", line: "At two in the morning the export job reads every user once, and by three the cache has forgotten all the popular ones." },
      { speaker: "meera", line: "Your cache treated a one-time read as proof of popularity. Pick a policy that asks for more evidence." },
    ],
  },
  predictions: [
    {
      id: "scan",
      kind: "choice",
      prompt: "A job reads thousands of one-off keys through your cache while normal traffic continues. Which policy suffers most: LRU, LFU, FIFO, or random?",
      options: [
        { id: "lru", label: "LRU: recent one-offs push out older popular keys" },
        { id: "lfu", label: "LFU: it favours frequent keys, so it suffers most" },
        { id: "none", label: "None of them; the policy does not matter" },
        { id: "random", label: "Random, because it picks victims blindly" },
      ],
      answer: "lru",
      observe: "scan-hurts",
      reveal: {
        text: "LRU treats recency as a sign of value, and a scan makes thousands of worthless keys the most recent. LFU keeps what is requested often, so one-time keys are the first to go. FIFO and random also lose to the scan, but start lower.",
        sourceIds: ["redis-eviction"],
        line: { speaker: "meera", line: "Recency is a guess about the future. A scan is a very confident liar." },
      },
    },
  ],
  widget: { id: "evict-lab", config: EVICT },
  mechanism: [
    {
      id: "policies",
      text: "When the cache is full it must drop something. LRU evicts the least recently used, FIFO the oldest inserted, random any entry, and LFU the least frequently used. Each encodes a different guess about which keys will be read again.",
      sourceIds: ["redis-eviction"],
    },
    {
      id: "scan",
      scene: "scan",
      text: "Scans break recency. A job that touches many keys once makes every one of them recent, so LRU keeps them and evicts popular keys that were last read a little earlier. With 30% scan traffic the LRU hit ratio drops by a third in the lab.",
      derived: true,
    },
    {
      id: "lfu",
      scene: "lfu",
      text: "LFU counts how often a key is read, so a key seen once loses to a key seen a hundred times. It resists scans, but it is slow to forget: a key that was popular last week can hang on, which is why real LFUs decay their counts.",
      sourceIds: ["redis-eviction"],
    },
    {
      id: "real",
      text: "Production caches rarely run textbook policies. Redis samples a few keys and evicts the best candidate, and newer designs such as ARC and TinyLFU combine recency and frequency with an admission test. The right choice depends on the access pattern you actually have.",
      sourceIds: ["arc-2003", "tinylfu-2017"],
    },
  ],
  challenges: [
    {
      id: "scan-proof",
      title: "Survive the nightly scan",
      brief: "A report job sends 30% of reads to one-off keys. The cache can hold at most 500 entries. Choose the policy and size so the hit ratio stays at 36% or better.",
      line: { speaker: "rao", line: "I will not buy more memory because a cron job has bad manners." },
      widget: { id: "evict-lab", config: EVICT_SCAN },
      conditions: [
        { metric: "hitRatio", op: ">=", value: 0.36, label: "Hit ratio at least 36%" },
        { metric: "entries", op: "<=", value: 500, label: "No more than 500 entries" },
      ],
      stars: [{ metric: "entries", op: "<=", value: 400, label: "Four hundred entries or fewer" }],
      hints: [
        "Compare the four policies at this scan share. Which gains the most?",
        "More memory helps every policy a little. Is it enough for the weakest ones within the limit?",
        "Which policy treats a key seen once as unimportant?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare LRU and LFU, and explain what a scan does to each.",
    rubric: [
      { id: "lru", criterion: "LRU evicts the least recently used, assuming recent keys will be used again", keyIdea: "recency" },
      { id: "lfu", criterion: "LFU evicts the least frequently used, keeping keys with a history of repeated reads", keyIdea: "frequency" },
      { id: "scan", criterion: "A scan pollutes LRU with one-time keys, while LFU resists it, though LFU is slow to forget old favourites", keyIdea: "scan resistance" },
    ],
    exemplar:
      "LRU evicts whatever was used longest ago, betting that recent keys come back, while LFU evicts the key used least often, betting on repeated popularity. A scan makes thousands of one-time keys the most recent, so LRU keeps them and loses the popular ones, whereas LFU treats them as unimportant. LFU's weakness is that it can hold on to keys that were popular long ago unless counts decay.",
  },
  reviews: [
    {
      id: "ev-pick",
      format: "pick-fix",
      scenario: "A cache serves a catalogue where a few thousand items are popular all week, and a nightly sync reads every item once. Hit ratio sags after each sync. What do you change?",
      options: [
        { id: "a", label: "Switch from LRU to an LFU-style policy" },
        { id: "b", label: "Shorten the TTL" },
        { id: "c", label: "Move to FIFO" },
        { id: "d", label: "Run the sync more often" },
      ],
      answer: "a",
      explain: "Frequency-based eviction ignores the one-time reads of the sync. Keeping the sync out of the cache entirely, by reading the database directly, is also a good fix.",
    },
    {
      id: "ev-pick2",
      format: "pick-fix",
      scenario: "Traffic has no skew: every key is equally likely, and the cache holds 10% of them. Which policy gets the best hit ratio?",
      options: [
        { id: "a", label: "LFU, it keeps the popular keys" },
        { id: "b", label: "LRU, it keeps recent keys" },
        { id: "c", label: "All of them, about 10%" },
        { id: "d", label: "None; uniform traffic cannot be cached" },
      ],
      answer: "c",
      explain: "With no skew there are no popular keys to find, so any policy hits about as often as the share of keys it holds. Policies only matter when traffic has structure.",
    },
    {
      id: "ev-order",
      format: "order",
      scenario: "With 30% of reads coming from a one-off scan and a modest cache, order these policies by hit ratio, best first.",
      items: [
        { id: "lfu", label: "LFU" },
        { id: "lru", label: "LRU" },
        { id: "fifo", label: "FIFO" },
      ],
      answer: ["lfu", "lru", "fifo"],
      explain: "LFU resists the scan. LRU beats FIFO because it at least refreshes keys that are hit again, while FIFO evicts popular keys on schedule.",
    },
    {
      id: "ev-graph",
      format: "predict-graph",
      scenario: "Raise the share of scan traffic from 0% to 60%, with a fixed cache. What happens to LRU's hit ratio?",
      xLabel: "scan share →",
      yLabel: "LRU hit ratio",
      options: [
        { id: "flat", label: "Barely changes", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "fall", label: "Falls steadily", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "cliff", label: "Holds, then collapses", points: [8, 8, 8, 7, 3, 1, 1, 1] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "fall",
      explain: "Scan reads never hit and each one displaces a useful entry, so the damage grows with the scan share. Half the reads missing outright plus evictions of useful keys takes the hit ratio down fast.",
    },
    {
      id: "ev-flaw",
      format: "spot-flaw",
      scenario: "An analytics service reads every row of a large table through the same Redis the app uses, with maxmemory-policy allkeys-lru. Hit ratio for the app collapses during each run. Tap the part causing it.",
      diagram: {
        nodes: [
          { id: "app", label: "app", kind: "server", col: 0, row: 0 },
          { id: "analytics", label: "analytics full-table reads", kind: "worker", col: 0, row: 2 },
          { id: "redis", label: "shared redis · allkeys-lru", kind: "cache", col: 1, row: 1 },
        ],
        edges: [
          { from: "app", to: "redis" },
          { from: "analytics", to: "redis" },
        ],
      },
      answer: "analytics->redis",
      explain: "A one-pass scan through a shared LRU cache flushes the working set. Batch jobs should bypass the cache, or use a separate one, or the cache should use scan-resistant eviction.",
    },
    {
      id: "ev-explain",
      format: "explain",
      scenario: "In two sentences: why can LFU hold on to stale favourites, and how do real systems handle it?",
      rubric: [
        { id: "history", criterion: "LFU counts accumulate, so a key that was popular long ago keeps a high count after it stops being read" },
        { id: "decay", criterion: "Real systems decay or age counts, or combine frequency with recency" },
      ],
      exemplar: "A key that was read thousands of times last week keeps a high count, so LFU is slow to evict it even when nobody reads it now. Real implementations decay the counts over time or mix recency and frequency.",
      explain: "Frequency is evidence of the past; the cache needs a guess about the future.",
    },
  ],
  codex: {
    oneLiner: "Eviction picks the entry to drop. LRU bets on recency, LFU on frequency; scans fool LRU, and LFU forgets slowly.",
    keyNumbers: [
      { label: "Redis eviction policies", value: "allkeys-lru, allkeys-lfu, volatile-*, random, noeviction", sourceId: "redis-eviction" },
      { label: "Redis LRU/LFU", value: "approximated by sampling a few keys", sourceId: "redis-eviction" },
    ],
    tradeoffs: [
      { choice: "LRU", gain: "Simple, tracks shifting popularity quickly", cost: "A scan flushes the working set" },
      { choice: "LFU", gain: "Resists scans, keeps proven favourites", cost: "Slow to forget; needs count decay" },
      { choice: "Scan-resistant hybrids (ARC, TinyLFU)", gain: "Good under mixed patterns", cost: "More metadata and complexity" },
    ],
    seenIn: ["Redis maxmemory-policy settings.", "Caffeine's W-TinyLFU in Java services."],
    interviewAngle: "Name the policy and the pattern it fails on: 'LRU unless there are scans, in which case LFU or keep scans out of the cache.'",
    aws: [{ concept: "Eviction policy", service: "ElastiCache maxmemory-policy parameter", note: "Default is volatile-lru for Redis" }],
    replay: { id: "evict-lab", config: { ...EVICT, start: { policy: "lru", entries: 400, scan: 0.5 } }, scene: "scan" },
  },
  interview: [
    "How do LRU and LFU differ, and when does each fail?",
    "A batch job tanks your cache hit ratio. What do you do?",
    "Why does Redis approximate LRU instead of tracking exact order?",
  ],
  deeper: [
    {
      title: "Admission versus eviction",
      body: "Evicting well is half the problem; deciding whether to admit a new key at all is the other half. TinyLFU keeps a compact sketch of recent request frequencies and only admits a new key if it looks more popular than the one it would evict. That is why a one-time scan never gets in, and it is how modern caches get scan resistance without tracking every key forever.",
      sourceIds: ["tinylfu-2017"],
    },
  ],
  honestPhysics: [
    "Traffic is Zipf with exponent 0.99 over 20,000 keys, with scan keys that are read once and never again. Real workloads mix patterns in more ways.",
    "LFU here samples 8 entries and evicts the least frequently used, as Redis does, without decay.",
    "Hit ratios come from a seeded simulation of 20,000 reads, so they are exact for the setup but a few points of noise would be normal in practice.",
  ],
  sources: [REDIS_EVICTION, MEGIDDO, TINYLFU],
  verify: [
    { id: "lru-scan", claim: "With a 30% scan LRU at 400 entries is under 36%", run: "lab", params: { model: "evict-lab", config: EVICT_SCAN, values: { policy: "lru", entries: 400 }, metric: "hitRatio" }, expect: { max: 0.36 } },
    { id: "lru-500", claim: "…and still under 36% at 500 entries", run: "lab", params: { model: "evict-lab", config: EVICT_SCAN, values: { policy: "lru", entries: 500 }, metric: "hitRatio" }, expect: { max: 0.36 } },
    { id: "lfu-wins", claim: "LFU at 400 entries holds 36%", run: "lab", params: { model: "evict-lab", config: EVICT_SCAN, values: { policy: "lfu", entries: 400 }, metric: "hitRatio" }, expect: { min: 0.36 } },
    { id: "lfu-small", claim: "LFU at 300 entries is a bit short", run: "lab", params: { model: "evict-lab", config: EVICT_SCAN, values: { policy: "lfu", entries: 300 }, metric: "hitRatio" }, expect: { max: 0.36 } },
    { id: "order", claim: "LFU beats LRU under a scan", run: "lab", params: { model: "evict-lab", config: EVICT_SCAN, values: { policy: "lfu", entries: 400 }, metric: "lfuHit" }, expect: { min: 0.34 } },
  ],
});
