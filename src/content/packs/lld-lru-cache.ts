import { definePack } from "../define";

export const LR = { start: { structure: "hashlist", n: 100000, threads: 8, lock: "global" } };
export const LR_CHALLENGE = { lockN: true, n: 100000, lockThreads: true, threads: 8, start: { structure: "array", lock: "global" } };

const LEETCODE_LRU = { id: "lru-problem", title: "LeetCode 146: LRU Cache (get and put in O(1) average time)", url: "https://leetcode.com/problems/lru-cache/" };
const JAVA_LHM = { id: "java-lhm", title: "Java docs: LinkedHashMap (access-ordered hash map with removeEldestEntry)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedHashMap.html" };
const CAFFEINE = { id: "caffeine", title: "Caffeine: a high-performance caching library (striped buffers and approximate recency)", url: "https://github.com/ben-manes/caffeine" };

export default definePack({
  id: "lld-lru-cache",
  title: "LLD: LRU Cache",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "profile · LruCache.get() 91% of CPU", detail: "array-backed, 100,000 entries, scanning on every hit" },
    lines: [
      { speaker: "kabir", line: "Our hand-written LRU cache scans a list on every lookup. With a hundred thousand entries it is slower than the database call it is meant to save." },
      { speaker: "meera", line: "An LRU cache is two data structures welded together: one for finding things fast and one for knowing what is oldest. Each operation must be constant time." },
    ],
  },
  predictions: [
    {
      id: "scan",
      kind: "choice",
      prompt: "An LRU cache stores 100,000 entries in an array kept in recency order. A get must find the entry and move it to the front. About how many steps does that take on average?",
      options: [
        { id: "4", label: "About 4" },
        { id: "17", label: "About 17" },
        { id: "50000", label: "About 50,000" },
      ],
      answer: "50000",
      observe: "slow-scan",
      reveal: {
        text: "Finding an entry in an unsorted array takes N ÷ 2 steps on average, and moving it shifts the elements ahead of it: 50,000 steps per get. A hash map finds the entry in one step, and a doubly linked list moves a node in a handful of pointer updates: 4 steps. Together they give constant time for every operation.",
        derived: true,
        line: { speaker: "rao", line: "Pick one structure for lookup and a second for order, and link them." },
      },
    },
    {
      id: "corrupt",
      kind: "choice",
      prompt: "Eight threads call get and put on the hash-map-and-list cache with no locking. What happens?",
      options: [
        { id: "fast", label: "8× faster, since reads do not change anything" },
        { id: "corrupt", label: "It is fast and wrong: even a get rewires the list, so threads corrupt it" },
        { id: "same", label: "Nothing, the map is thread-safe" },
      ],
      answer: "corrupt",
      observe: "corrupt",
      reveal: {
        text: "In an LRU cache every get changes the order, so every operation writes. Two threads moving nodes at once can leave a node pointing at itself or a dropped entry still in the map. Without protection you get lost entries, an infinite loop or a crash. A global lock fixes correctness and serialises everything; sharding trades exact order for parallelism.",
        derived: true,
        line: { speaker: "meera", line: "A read that updates recency is a write." },
      },
    },
  ],
  widget: { id: "lru-lab", config: LR },
  mechanism: [
    {
      id: "contract",
      text: "The cache has a capacity N and two operations. get(key) returns the value and marks the key most recently used, or misses. put(key, value) stores it as most recent, evicting the least recently used key first if the cache is full. Both must run in constant time, since the cache is on the hot path.",
      sourceIds: ["lru-problem"],
    },
    {
      id: "structure",
      scene: "hashlist",
      text: "The standard design is a hash map from key to a node in a doubly linked list. The map finds a key in one step. The list holds entries in recency order: moving a node to the head is a few pointer changes, and the tail is the next to evict. Sentinel nodes remove the empty-list cases.",
      sourceIds: ["lru-problem", "java-lhm"],
    },
    {
      id: "alternatives",
      scene: "heap",
      text: "Other structures trade differently. Timestamps in a hash map make get and put constant and eviction a scan of everything. A min-heap on timestamps makes eviction logarithmic, and every get pays log N to fix the heap. A scanned array is simple and slow under load. Only the map-and-list pair is constant in all three.",
      sourceIds: ["lru-problem"],
    },
    {
      id: "threads",
      scene: "sharded",
      text: "Concurrency needs a decision. One lock around the whole cache is correct and serialises every call. Sharding splits the keys over several independent caches by hash, each with its own lock, which scales with threads and makes the eviction order approximate across shards. Production libraries go further, buffering recency updates, and the interview answer names the trade-off.",
      sourceIds: ["caffeine"],
    },
  ],
  challenges: [
    {
      id: "design-cache",
      title: "Design the cache",
      brief: "100,000 entries, 8 threads: constant-time get and eviction (10 steps or fewer), safe under threads, at least 3× the single-thread throughput, and under 10 MB.",
      line: { speaker: "rao", line: "Fast per call, correct, and scaling with the threads." },
      widget: { id: "lru-lab", config: LR_CHALLENGE },
      conditions: [
        { metric: "getOps", op: "<=", value: 10, label: "At most 10 steps per get" },
        { metric: "evictOps", op: "<=", value: 10, label: "At most 10 steps per eviction" },
        { metric: "threadSafe", op: ">=", value: 1, label: "Safe with 8 threads" },
        { metric: "concurrentSpeedup", op: ">=", value: 3, label: "At least 3× single-thread throughput" },
        { metric: "memoryMB", op: "<=", value: 10, label: "At most 10 MB" },
      ],
      stars: [],
      hints: ["Which structure is constant time for all three operations?", "What does a global lock do to throughput?", "What do you give up with shards?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to build an LRU cache with constant-time operations, and how to make it concurrent.",
    rubric: [
      { id: "structure", criterion: "A hash map from key to a node in a doubly linked list ordered by recency; the map finds, the list orders; move to head on use, evict the tail", keyIdea: "map plus doubly linked list" },
      { id: "why", criterion: "Alternatives such as arrays, timestamp scans or heaps make at least one operation linear or logarithmic", keyIdea: "why the pair" },
      { id: "threads", criterion: "Every get mutates the order, so use a lock; one lock serialises, sharding scales at the cost of exact global order", keyIdea: "lock or shard" },
    ],
    exemplar:
      "I would use a hash map from key to a node in a doubly linked list ordered by recency: the map finds the entry, the list keeps the order, a use moves the node to the head, and eviction removes the tail, all in constant time. Arrays, timestamp scans and heaps each make at least one operation linear or logarithmic. Every get changes the order, so concurrent use needs a lock; a single lock serialises, and sharding scales at the cost of an exact global order.",
  },
  reviews: [
    {
      id: "lru-est",
      format: "estimate",
      scenario: "A hash map with a min-heap on timestamps needs about log₂ N steps to fix the heap on a get. For 100,000 entries, about how many steps is that?",
      unit: "steps",
      answer: 17,
      acceptFactor: 1.05,
      breakdown: ["log₂ 100,000 = 16.6", "so a get costs about 2 + 17 = 19 steps"],
      explain: "Logarithmic is cheap, and constant is still better on a hot path.",
    },
    {
      id: "lru-pick",
      format: "pick-fix",
      scenario: "A cache is protected by one global lock and throughput does not improve past one thread. Which change scales it, accepting approximate ordering?",
      options: [
        { id: "a", label: "Split into shards by key hash, each with its own lock" },
        { id: "b", label: "Remove the lock" },
        { id: "c", label: "Use a bigger lock" },
        { id: "d", label: "Add a sleep" },
      ],
      answer: "a",
      explain: "Shards let different keys proceed in parallel. Without a lock the list corrupts.",
    },
    {
      id: "lru-order",
      format: "order",
      scenario: "Order these by steps per eviction at 100,000 entries, most first.",
      items: [
        { id: "ts", label: "Hash map with timestamps, scan to evict" },
        { id: "heap", label: "Hash map with a heap on timestamps" },
        { id: "list", label: "Hash map with a doubly linked list" },
      ],
      answer: ["ts", "heap", "list"],
      explain: "100,000, 17 and 3 steps.",
    },
    {
      id: "lru-graph",
      format: "predict-graph",
      scenario: "As the number of threads rises from 1 to 16 with a global lock, how does throughput relative to one thread change?",
      xLabel: "threads →",
      yLabel: "relative throughput",
      options: [
        { id: "flat", label: "Stays at or below 1×", points: [1, 0.95, 0.91, 0.87, 0.83, 0.8, 0.77, 0.74] },
        { id: "linear", label: "Rises in proportion", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "peak", label: "Rises, then falls", points: [1, 2, 3, 4, 3, 2, 1, 0.5] },
      ],
      answer: "flat",
      explain: "Every operation takes the same lock, so the cache does one at a time. Extra threads only wait.",
    },
    {
      id: "lru-flaw",
      format: "spot-flaw",
      scenario: "An LRU design stores recency by a timestamp on each entry, and evicts by scanning the map for the smallest. Tap the operation that does not scale.",
      diagram: {
        nodes: [
          { id: "get", label: "get: set timestamp", kind: "server", col: 0, row: 1 },
          { id: "map", label: "hash map with timestamps", kind: "store", col: 1, row: 1 },
          { id: "evict", label: "evict: scan all entries for the oldest", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "get", to: "map" },
          { from: "map", to: "evict" },
        ],
      },
      answer: "map->evict",
      explain: "Finding the minimum by scanning is linear in the number of entries, and a full cache evicts on every put. Keep the order in a linked list or a heap.",
    },
    {
      id: "lru-explain",
      format: "explain",
      scenario: "In two sentences: why does an LRU cache need both a hash map and a linked list?",
      rubric: [
        { id: "map", criterion: "The hash map finds an entry by key in constant time, which a list cannot do" },
        { id: "list", criterion: "The linked list keeps recency order and moves or removes a node in constant time once found, which a hash map cannot do" },
      ],
      exemplar: "The hash map finds an entry by key in constant time, which a list cannot do. The linked list keeps the recency order and moves or removes a node in constant time once found, which a hash map cannot do.",
      explain: "Each structure covers the other's weakness.",
    },
  ],
  codex: {
    oneLiner: "Hash map plus doubly linked list gives constant-time get, put and evict. Every get writes: lock it, or shard at the cost of exact order.",
    keyNumbers: [
      { label: "Array LRU, 100,000 entries (lab)", value: "50,000 steps per get", sourceId: "lru-problem" },
      { label: "Map and list, sharded across 8 threads (lab)", value: "5.6× throughput", sourceId: "caffeine" },
    ],
    tradeoffs: [
      { choice: "Map plus list", gain: "O(1) everything", cost: "Pointer-heavy; 64 bytes an entry" },
      { choice: "Global lock", gain: "Exact order, simple", cost: "No parallel speedup" },
      { choice: "Sharding", gain: "Scales with threads", cost: "Approximate global order" },
    ],
    seenIn: ["LinkedHashMap with access order, functools.lru_cache, Caffeine and Guava.", "A staple machine-coding round."],
    interviewAngle: "Say: 'hash map to a doubly linked list with sentinels; move to head on get and put; evict the tail; one lock or shards'.",
    aws: [{ concept: "Managed in-memory cache", service: "Amazon ElastiCache with maxmemory-policy allkeys-lru" }],
    replay: { id: "lru-lab", config: LR, scene: "sharded" },
  },
  interview: [
    "Design an LRU cache with O(1) get and put.",
    "How would you make it thread-safe?",
    "What changes if you want LFU instead of LRU?",
  ],
  deeper: [
    {
      title: "Approximate LRU in production",
      body: "Real caches avoid per-access list updates. Redis samples a few keys and evicts the oldest of the sample. Caffeine records accesses in a buffer and applies them in batches. Both give up exact order for far less contention. If a cache is hot and shared, exact LRU is rarely worth its cost; approximate recency usually hits as often.",
      sourceIds: ["caffeine"],
    },
  ],
  honestPhysics: [
    "Costs in elementary steps for N entries. Array scanned linearly: get and put N ÷ 2, evict 1. Hash map and doubly linked list: 4, 4 and 3. Hash map with timestamps: 2, 2 and N (a scan). Hash map with a min-heap: 2 + log₂ N for get and put, log₂ N to evict. Memory per entry: 16, 64, 40 and 56 bytes.",
    "With threads, no lock is fastest and corrupts the list. A global lock is correct and slightly slower than one thread, 1 ÷ (1 + 0.05 × (T − 1)). Sixteen shards give T ÷ (1 + (T − 1) ÷ 16) and approximate order. Round figures.",
  ],
  sources: [LEETCODE_LRU, JAVA_LHM, CAFFEINE],
  verify: [
    { id: "array", claim: "An array scans 50,000 steps per get", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "array" }, metric: "getOps" }, expect: { min: 49999, max: 50001 } },
    { id: "list", claim: "Map and list take 4 steps", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashlist" }, metric: "getOps" }, expect: { min: 4, max: 4 } },
    { id: "evict", claim: "…and 3 to evict", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashlist" }, metric: "evictOps" }, expect: { min: 3, max: 3 } },
    { id: "global", claim: "A global lock gives no speedup", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashlist", lock: "global" }, metric: "concurrentSpeedup" }, expect: { max: 1 } },
    { id: "sharded", claim: "16 shards give 5.6× on 8 threads", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashlist", lock: "sharded" }, metric: "concurrentSpeedup" }, expect: { min: 5.5, max: 5.7 } },
    { id: "unsafe", claim: "No lock is not thread-safe", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashlist", lock: "none" }, metric: "threadSafe" }, expect: { max: 0 } },
    { id: "heap", claim: "The heap version is not constant-time", run: "lab", params: { model: "lru-lab", config: LR_CHALLENGE, values: { structure: "hashheap", lock: "sharded" }, metric: "getOps" }, expect: { min: 18, max: 20 } },
  ],
});
