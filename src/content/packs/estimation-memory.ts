import { definePack } from "../define";

const SDP = { id: "sdp-estimation", title: "System Design Primer: Back-of-the-envelope calculations (latency numbers, powers of two)", url: "https://github.com/donnemartin/system-design-primer#back-of-the-envelope-calculations" };
const REDIS_MEM = { id: "redis-memory", title: "Redis docs: Memory optimization (per-key and data-structure overhead)", url: "https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/" };

export const MEMORY_PLAY = {
  title: "Pigeon · recent-message cache",
  answerLabel: "Cache memory",
  answerMin: 1e7,
  answerMax: 1e13,
  answerFmt: "bytes",
  mode: "faded",
  given: ["overhead"],
  chain: "hot conversations × messages kept × bytes each × overhead",
  steps: [
    { id: "chats", label: "Hot conversations", min: 1e3, max: 1e8, truth: 5e5 },
    { id: "kept", label: "Messages kept per conversation", min: 1, max: 5000, truth: 100 },
    { id: "bytes", label: "Bytes per cached message", min: 20, max: 1e4, truth: 400, fmt: "bytes" },
    { id: "overhead", label: "Overhead (keys, pointers, fragmentation)", min: 1, max: 4, truth: 1.3, fmt: "x" },
  ],
  start: { chats: 1e4, kept: 5, bytes: 50 },
};

export const MEMORY_SOLO = {
  title: "Pigeon · profile cache",
  answerLabel: "Cache memory",
  answerMin: 1e7,
  answerMax: 1e13,
  answerFmt: "bytes",
  mode: "solo",
  hideTruth: true,
  chain: "profiles active today × bytes per profile × overhead",
  steps: [
    { id: "active", label: "Profiles active today", min: 1e4, max: 1e9, truth: 2e6 },
    { id: "bytes", label: "Bytes per profile", min: 100, max: 1e5, truth: 1200, fmt: "bytes" },
    { id: "overhead", label: "Overhead", min: 1, max: 4, truth: 1.5, fmt: "x" },
  ],
};

export default definePack({
  id: "estimation-memory",
  title: "Estimation: Memory & Cache Sizing",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "Redis · evictions climbing", detail: "memory limit reached" },
    lines: [
      { speaker: "kabir", line: "The cache keeps evicting, and someone picked 8 GB because it sounded nice. Was that too small?" },
      { speaker: "meera", line: "Size it on purpose: what are you keeping, how big is each piece, and how much room does the software add on top?" },
    ],
  },
  predictions: [
    {
      id: "chat-cache",
      kind: "numeric",
      prompt: "Pigeon caches the last 100 messages of 500,000 hot conversations. Each cached message takes about 400 bytes, and the cache needs about 30% extra for keys and overhead. Roughly how much memory?",
      unit: "GB",
      min: 1,
      max: 1000,
      log: true,
      answer: 26,
      tolerance: 1.5,
      observe: "close",
      reveal: {
        text: "500,000 conversations times 100 messages is 50 million messages. At 400 bytes that is 20 GB, and 30% overhead makes it about 26 GB. An 8 GB cache holds less than a third of it.",
        derived: true,
        line: { speaker: "rao", line: "Twenty-six gigabytes is one node. Eight was a guess dressed up as a number." },
      },
    },
  ],
  widget: { id: "estimate-lab", config: MEMORY_PLAY },
  mechanism: [
    {
      id: "chain",
      scene: "chain",
      text: "Cache memory is entries kept times bytes per entry times an overhead factor. Entries kept comes from your working set: how many distinct things are hot, not how many exist.",
      derived: true,
    },
    {
      id: "overhead",
      scene: "round",
      text: "Software adds its own cost on top of your data: keys, pointers, expiry metadata, and allocator fragmentation. Redis documents per-key and per-structure overhead, so for small values the overhead can match the payload. Measure with a real sample before you commit.",
      sourceIds: ["redis-memory"],
    },
    {
      id: "hot",
      text: "Do not cache everything. Traffic is skewed: a small share of keys serves most reads. Size for the hot set that gives you a high hit ratio, and use eviction to handle the rest. The next chapters put numbers on that skew.",
    },
    {
      id: "headroom",
      text: "Leave room to grow and to avoid evicting during a spike. A cache run at its limit is a cache that evicts useful entries, so add headroom on top of the estimate and watch the eviction counter.",
    },
  ],
  challenges: [
    {
      id: "profile-cache",
      title: "Size the profile cache",
      brief: "Pigeon has 20 million registered users, but about 2 million are active on a given day. Each profile is about 1.2 KB and Redis adds about 50% overhead. Estimate the memory to cache the day's active profiles. Within a factor of two wins.",
      line: { speaker: "kabir", line: "Should we cache all twenty million or just today's crowd?" },
      widget: { id: "estimate-lab", config: MEMORY_SOLO },
      conditions: [{ metric: "factor", op: "<=", value: 2, label: "Within 2× of the reference" }],
      stars: [{ metric: "factor", op: "<=", value: 1.25, label: "Within 25%" }],
      hints: [
        "How many profiles are actually hot on a given day?",
        "Multiply that count by the bytes per profile.",
        "Then add the overhead factor on top.",
      ],
    },
  ],
  explainBack: {
    prompt: "How do you decide how much memory a cache needs?",
    rubric: [
      { id: "workingset", criterion: "Sizes the working set (hot items), not the whole dataset", keyIdea: "hot set" },
      { id: "overhead", criterion: "Multiplies by bytes per entry and adds software overhead on top", keyIdea: "entries × size × overhead" },
      { id: "headroom", criterion: "Adds headroom and watches evictions, since a full cache evicts useful entries", keyIdea: "headroom" },
    ],
    exemplar:
      "I count how many items are in the hot working set rather than everything that exists, multiply by the bytes per entry, and add the overhead the cache itself uses for keys and pointers. Then I leave headroom and watch the eviction rate, because a cache at its limit throws out useful entries.",
  },
  reviews: [
    {
      id: "em-est-1",
      format: "estimate",
      scenario: "You cache 10 million items of 500 bytes each, and the cache adds 50% overhead. About how many GB of memory?",
      unit: "GB",
      answer: 7.5,
      acceptFactor: 1.3,
      breakdown: ["10,000,000 × 500 bytes = 5 GB", "× 1.5 overhead", "= 7.5 GB"],
      explain: "Data first, overhead second. 5 GB of values needs about 7.5 GB of memory.",
    },
    {
      id: "em-est-2",
      format: "estimate",
      scenario: "A session store holds 3 million active sessions at 2 KB each, with no overhead counted. How many GB?",
      unit: "GB",
      answer: 6,
      acceptFactor: 1.3,
      breakdown: ["3,000,000 × 2,000 bytes", "= 6,000,000,000 bytes", "= 6 GB"],
      explain: "Millions of kilobytes are gigabytes: 3 million times 2 KB is 6 GB.",
    },
    {
      id: "em-pick",
      format: "pick-fix",
      scenario: "You are asked to size a cache for a catalogue of 500 million products, but only about 2 million are viewed in a day. What should you size for?",
      options: [
        { id: "a", label: "All 500 million products, to be safe" },
        { id: "b", label: "The hot working set of about 2 million, plus headroom" },
        { id: "c", label: "10,000 products, since that is what fits in 1 GB" },
        { id: "d", label: "The number of servers" },
      ],
      answer: "b",
      explain: "A cache holds the hot set, not the dataset. Sizing for the full catalogue wastes money; sizing for the memory you happen to own wastes hit ratio.",
    },
    {
      id: "em-order",
      format: "order",
      scenario: "Order these cache sizes by memory needed, smallest first.",
      items: [
        { id: "a", label: "1 million sessions × 2 KB" },
        { id: "b", label: "100 million flags × 1 byte" },
        { id: "c", label: "10 million profiles × 1 KB" },
        { id: "d", label: "50,000 images × 1 MB" },
      ],
      answer: ["b", "a", "c", "d"],
      explain: "The flags are 100 MB, the sessions 2 GB, the profiles 10 GB, and the images 50 GB. Multiply count by size and compare in one unit.",
    },
    {
      id: "em-flaw",
      format: "spot-flaw",
      scenario: "The cache is sized to hold exactly the estimated 26 GB of data, and evictions are climbing. Tap where the sizing went wrong.",
      diagram: {
        nodes: [
          { id: "api", label: "api", kind: "server", col: 0, row: 1 },
          { id: "redis", label: "redis · 26 GB limit, 26 GB of data, no headroom", kind: "cache", col: 1, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "api", to: "redis" },
          { from: "redis", to: "db" },
        ],
      },
      answer: "redis",
      explain: "A cache sized to exactly its data has no room for overhead, growth, or spikes, so it evicts hot entries and the hit ratio falls. Add headroom.",
    },
    {
      id: "em-explain",
      format: "explain",
      scenario: "In two sentences: why size a cache for the hot working set rather than for the whole dataset?",
      rubric: [
        { id: "skew", criterion: "A small share of items serves most requests" },
        { id: "cost", criterion: "Caching everything costs memory with little extra hit ratio" },
      ],
      exemplar: "A small share of items serves most of the requests, so holding just those gives most of the benefit. Caching the long tail costs a lot of memory for very little extra hit ratio.",
      explain: "Hit ratio flattens quickly as you add the cold tail.",
    },
  ],
  codex: {
    oneLiner: "Cache memory is hot entries × bytes per entry × overhead, plus headroom. Size the working set, not the dataset.",
    keyNumbers: [
      { label: "1M items × 1 KB", value: "1 GB", sourceId: "sdp-estimation" },
      { label: "Typical software overhead", value: "measure it; can match the payload for small values", sourceId: "redis-memory" },
    ],
    tradeoffs: [
      { choice: "Bigger cache", gain: "Higher hit ratio", cost: "More memory cost, with diminishing returns past the hot set" },
      { choice: "Smaller cache with eviction", gain: "Cheaper", cost: "Hot entries get evicted under pressure; the database sees more load" },
    ],
    seenIn: ["Redis maxmemory settings and eviction counters.", "Sizing ElastiCache or a memcached pool for a read-heavy service."],
    interviewAngle: "Say 'working set' and 'overhead factor' in the same breath as the number: '2M hot profiles, 1.2 KB each, 1.5x overhead, so about 4 GB, plus headroom.'",
    aws: [{ concept: "Managed Redis", service: "Amazon ElastiCache for Redis", note: "Node types are sized by memory" }],
    replay: { id: "estimate-lab", config: { ...MEMORY_PLAY, mode: "worked" }, scene: "chain" },
  },
  interview: [
    "How much memory do you need to cache the last 100 messages of 500,000 conversations?",
    "Why not cache the whole dataset?",
    "What do you watch to know a cache is too small?",
  ],
  deeper: [
    {
      title: "Where overhead comes from",
      body: "A cache entry carries more than its value: the key, a pointer or two, expiry data, and the allocator's rounding up to a size class. For many small values the bookkeeping rivals the payload. Compact encodings and packing many small values into one structure shrink it, which is why the Redis docs have a whole page on memory optimisation.",
      sourceIds: ["redis-memory"],
    },
  ],
  honestPhysics: [
    "The overhead factors (1.3, 1.5) are round assumptions. Measure your own: load a sample into the real cache and divide.",
    "Hit ratio is not modelled here. It depends on how skewed traffic is, which the Cache chapter measures.",
  ],
  sources: [SDP, REDIS_MEM],
  verify: [
    { id: "ref", claim: "The chat cache chain gives about 26 GB", run: "lab", params: { model: "estimate-lab", config: MEMORY_PLAY, values: { chats: 5e5, kept: 100, bytes: 400 }, metric: "estimate" }, expect: { min: 2.5e10, max: 2.7e10 } },
    { id: "profile-ref", claim: "The profile cache is about 3.6 GB", run: "lab", params: { model: "estimate-lab", config: MEMORY_SOLO, values: { guess: 3.6e9 }, metric: "factor" }, expect: { max: 1.02 } },
  ],
});
