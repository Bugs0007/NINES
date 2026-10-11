import { definePack } from "../define";

export const SIZE = { keys: 1000000, rps: 50000, entryKb: 50, start: { entries: 1000, skew: 0.99 } };
export const SIZE_CHALLENGE = { keys: 1000000, rps: 50000, entryKb: 50, lockSkew: true, start: { entries: 5000, skew: 0.99 } };

const BRESLAU = { id: "breslau-1999", title: "L. Breslau et al. (1999), Web Caching and Zipf-like Distributions: Evidence and Implications, IEEE INFOCOM", url: "https://doi.org/10.1109/INFCOM.1999.749260" };
const ELASTICACHE = { id: "aws-elasticache-pricing", title: "Amazon ElastiCache pricing (on-demand node prices by instance type)", url: "https://aws.amazon.com/elasticache/pricing/" };
const REDIS_MEM = { id: "redis-memory", title: "Redis docs: Memory optimization (per-key and data-structure overhead)", url: "https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/" };

export default definePack({
  id: "zipf-and-sizing",
  title: "Zipf Traffic & Cache Sizing",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "Finance · ElastiCache", detail: "'why not just cache everything?'" },
    lines: [
      { speaker: "rao", line: "A million cached pages would cost nine hundred dollars a month. Someone suggested a million and a half, for safety." },
      { speaker: "meera", line: "Most of those pages almost nobody asks for. Size for the head of the curve, not the whole thing." },
    ],
  },
  predictions: [
    {
      id: "one-percent",
      kind: "numeric",
      prompt: "A site has a million pages, and traffic follows the usual Zipf curve with exponent about 1. What percentage of all requests go to the 10,000 most popular pages, which is 1% of them?",
      unit: "%",
      min: 1,
      max: 100,
      log: false,
      step: 1,
      answer: 66,
      tolerance: 1.25,
      observe: "knee",
      reveal: {
        text: "The top 1% of pages take about two thirds of all requests. With a Zipf exponent near 1, the share of traffic in the top k of n pages is roughly ln k ÷ ln n, so 10,000 of a million is 9.2 over 13.8.",
        derived: true,
        line: { speaker: "meera", line: "The head carries the traffic. The tail only carries the bill." },
      },
    },
  ],
  widget: { id: "size-lab", config: SIZE },
  mechanism: [
    {
      id: "zipf",
      text: "Zipf's law says the k-th most popular item gets traffic proportional to 1 ÷ k^s, with s near 1 for web pages, videos and search queries. A few items get a huge share and a long tail gets almost nothing each. Web caching studies found just this shape.",
      sourceIds: ["breslau-1999"],
    },
    {
      id: "knee",
      scene: "knee",
      text: "That makes hit ratio a function of cache size with a knee. For s near 1 the share captured by the top k of n items is about ln k ÷ ln n, so each tenfold increase in cache size adds the same slice, about 17 points here. Past the knee you pay for tails.",
      derived: true,
    },
    {
      id: "skew",
      scene: "skew",
      text: "The exponent is the dial. At s = 0.7 traffic is flatter and a small cache captures far less; at s = 1.2 it is so concentrated that a few hundred entries do most of the work. Measure your own skew before you buy memory.",
      derived: true,
    },
    {
      id: "money",
      text: "Memory is bought in nodes, so the cost steps up each time you cross a node's capacity, and each entry carries overhead on top of its payload. Look for the cheapest node count that clears your hit-ratio target, and note how much the last node bought.",
      sourceIds: ["aws-elasticache-pricing", "redis-memory"],
    },
  ],
  challenges: [
    {
      id: "buy-cache",
      title: "Buy the right cache",
      brief: "One million cached pages of about 50 KB, 50,000 reads a second, traffic skew near 1. Choose the number of entries so at least 90% of reads hit the cache without going past $400 a month. Nodes hold about 12 GiB usable each and cost about $150 a month.",
      line: { speaker: "rao", line: "Another node is another hundred and fifty. Show me what it buys before I sign." },
      widget: { id: "size-lab", config: SIZE_CHALLENGE },
      conditions: [
        { metric: "hitRatio", op: ">=", value: 0.9, label: "Hit ratio at least 90%" },
        { metric: "costPerMonth", op: "<=", value: 400, label: "Cache under $400/month" },
      ],
      stars: [{ metric: "dbRps", op: "<=", value: 5000, label: "Database sees 5,000 reads/s or fewer" }],
      hints: [
        "Where on the curve does the hit ratio cross 90%, and how many entries is that?",
        "How much memory is that, and how many nodes does it need?",
        "If you are one node over budget, how far back can you move along the curve before 90% slips?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why do small caches work so well, and how would you pick a cache size?",
    rubric: [
      { id: "zipf", criterion: "Traffic is Zipf-skewed: a small head of items takes most requests", keyIdea: "skewed popularity" },
      { id: "knee", criterion: "Hit ratio rises quickly then flattens, with diminishing returns per extra entry", keyIdea: "diminishing returns" },
      { id: "size", criterion: "Picks a size from a target hit ratio, converts entries to memory and nodes, and checks the cost step", keyIdea: "target hit ratio to nodes" },
    ],
    exemplar:
      "Popularity follows a Zipf-like curve, so a small head of items takes most requests and a long tail takes little each. Hit ratio therefore climbs fast and then flattens, and each tenfold of cache buys the same slice. I pick a target hit ratio, find the number of entries on the curve, convert it to memory with overhead, and see how many nodes that is and what the last node buys.",
  },
  reviews: [
    {
      id: "zs-est-share",
      format: "estimate",
      scenario: "Traffic is Zipf with exponent near 1 over 1 million items. Using hit share ≈ ln k ÷ ln n, roughly what percentage of requests do the top 1,000 items take?",
      unit: "%",
      answer: 50,
      acceptFactor: 1.25,
      breakdown: ["ln 1,000 ≈ 6.9", "ln 1,000,000 ≈ 13.8", "6.9 ÷ 13.8 = 0.5"],
      explain: "A thousand items out of a million, a tenth of a percent of the catalogue, take about half the traffic.",
    },
    {
      id: "zs-est-mem",
      format: "estimate",
      scenario: "You will cache 300,000 items of 50 KB each, with 1.5x overhead. About how many GiB of memory is that?",
      unit: "GiB",
      answer: 21,
      acceptFactor: 1.2,
      breakdown: ["300,000 × 50 KB = 15 GB", "× 1.5 overhead = 22.5 GB", "≈ 21 GiB"],
      explain: "Mind the units: 22.5 GB is about 21 GiB. Nodes are quoted in GiB.",
    },
    {
      id: "zs-pick",
      format: "pick-fix",
      scenario: "Your hit ratio is 85% and finance has asked to double the cache to reach 95%. What do you answer?",
      options: [
        { id: "a", label: "Doubling will get about 95%" },
        { id: "b", label: "Hit ratio gains flatten; going from 85% to 95% likely needs several times the memory" },
        { id: "c", label: "Doubling will lower the hit ratio" },
        { id: "d", label: "Hit ratio does not depend on size" },
      ],
      answer: "b",
      explain: "Each tenfold of cache adds a fixed slice, so the last ten points cost far more than the first. Tell finance what a node buys before you buy it.",
    },
    {
      id: "zs-order",
      format: "order",
      scenario: "For the same cache size, order these by hit ratio, highest first.",
      items: [
        { id: "s12", label: "Skew s = 1.2 (very concentrated)" },
        { id: "s1", label: "Skew s = 1.0" },
        { id: "s07", label: "Skew s = 0.7 (flatter)" },
        { id: "s0", label: "Uniform traffic over all keys" },
      ],
      answer: ["s12", "s1", "s07", "s0"],
      explain: "The more concentrated the traffic, the more a small cache captures. Uniform traffic gets only the share of keys the cache holds.",
    },
    {
      id: "zs-graph",
      format: "predict-graph",
      scenario: "Cache size grows tenfold at a time from 100 to 1 million entries. Plot the hit ratio against the number of entries on a log axis.",
      xLabel: "entries (log) →",
      yLabel: "hit ratio",
      options: [
        { id: "line", label: "A roughly straight line up to 100%", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Steep, then flat well below 100%", points: [1, 3, 5, 6, 6.5, 6.7, 6.8, 6.8] },
        { id: "sig", label: "An S-curve", points: [1, 1.2, 2, 4, 6, 7, 7.4, 7.5] },
        { id: "flat", label: "Flat", points: [3, 3, 3, 3, 3, 3, 3, 3] },
      ],
      answer: "line",
      explain: "On a log axis the hit ratio of Zipf traffic with s near 1 rises about linearly, because each tenfold adds the same share. It only flattens at the top, when you hold nearly everything.",
    },
    {
      id: "zs-flaw",
      format: "spot-flaw",
      scenario: "The capacity plan caches 'every product page' because storage is cheap, and the cache bill is the largest line in the budget. Tap what is wrong with the plan.",
      diagram: {
        nodes: [
          { id: "api", label: "api", kind: "server", col: 0, row: 1 },
          { id: "cache", label: "redis · all 20M product pages, 96% never read twice a day", kind: "cache", col: 1, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "api", to: "cache" },
          { from: "cache", to: "db" },
        ],
      },
      answer: "cache",
      explain: "Caching the long tail spends memory on items that rarely repeat. Size for the head that gives your target hit ratio and let the tail fall through to the database.",
    },
    {
      id: "zs-explain",
      format: "explain",
      scenario: "In two sentences: why does each tenfold increase in cache size add roughly the same hit-ratio gain for Zipf traffic?",
      rubric: [
        { id: "log", criterion: "For Zipf with s near 1 the traffic share of the top k items grows with ln k" },
        { id: "equal", criterion: "So multiplying the cache by ten adds a constant amount, which means growing returns per entry shrink" },
      ],
      exemplar: "For Zipf traffic with exponent near 1, the share captured by the top k items grows like ln k. Multiplying the cache by ten therefore adds a constant slice, so every extra entry is worth less than the one before.",
      explain: "Equal slices per tenfold means you pay exponentially for linear gains.",
    },
  ],
  codex: {
    oneLiner: "Request popularity is Zipf-like: a small head takes most traffic. Hit ratio grows with the log of cache size, so each tenfold buys one slice.",
    keyNumbers: [
      { label: "Share in the top k of n (s ≈ 1)", value: "≈ ln k ÷ ln n", sourceId: "breslau-1999" },
      { label: "Top 1% of a million items", value: "about 66% of requests (s = 0.99)", sourceId: "breslau-1999" },
      { label: "Node cost", value: "step function of memory (nodes)", sourceId: "aws-elasticache-pricing" },
    ],
    tradeoffs: [
      { choice: "Cache the head only", gain: "Most of the hit ratio for a fraction of the memory", cost: "A tail of misses always reaches the database" },
      { choice: "Cache the long tail too", gain: "Squeezes out the last few points of hit ratio", cost: "Memory cost grows with each tenfold, for diminishing returns" },
    ],
    seenIn: ["Capacity planning for any Redis or Memcached tier.", "CDN hit ratios that plateau in the high 90s."],
    interviewAngle: "Say 'Zipf' and size by target hit ratio: 'about 1% of keys serve two thirds of reads, so I cache the top few percent and let the rest fall through.'",
    aws: [{ concept: "Cache memory", service: "Amazon ElastiCache node types", note: "Priced per node-hour; choose by memory" }],
    replay: { id: "size-lab", config: SIZE, scene: "knee" },
  },
  interview: [
    "How do you decide how large a cache should be?",
    "Why is 99% hit ratio so much more expensive than 90%?",
    "How would you measure your own traffic skew?",
  ],
  deeper: [
    {
      title: "Where ln k ÷ ln n comes from",
      body: "For exponent 1 the weight of rank i is 1 ÷ i, so the top k items sum to the harmonic number H(k) ≈ ln k + 0.577. The total over n items is H(n). The ratio H(k) ÷ H(n) is about ln k ÷ ln n for large n. For exponents below 1 the head is flatter and for exponents above 1 it is steeper, which is why the exponent matters more than the cache size.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Hit ratio is the share of Zipf traffic in the top k keys, the best any static cache could do. A real LRU gets a little less.",
    "Entries are all 50 KB with a 1.5x overhead factor. Real objects vary widely in size, which changes what a node holds.",
    "Node prices are approximate on-demand figures, a node holds about 12 GiB usable, and nodes cannot be bought fractionally.",
  ],
  sources: [BRESLAU, ELASTICACHE, REDIS_MEM],
  verify: [
    { id: "top-1pct", claim: "The top 10,000 of a million pages take about two thirds of requests", run: "lab", params: { model: "size-lab", config: SIZE, values: { entries: 10000, skew: 0.99 }, metric: "hitRatio" }, expect: { min: 0.63, max: 0.69 } },
    { id: "start", claim: "Starting at 5,000 entries misses 90%", run: "lab", params: { model: "size-lab", config: SIZE_CHALLENGE, values: {}, metric: "hitRatio" }, expect: { max: 0.9 } },
    { id: "wins-hit", claim: "280,000 entries reach 90% hits", run: "lab", params: { model: "size-lab", config: SIZE_CHALLENGE, values: { entries: 280000 }, metric: "hitRatio" }, expect: { min: 0.9 } },
    { id: "wins-cost", claim: "…inside the $400 budget", run: "lab", params: { model: "size-lab", config: SIZE_CHALLENGE, values: { entries: 280000 }, metric: "costPerMonth" }, expect: { max: 400 } },
    { id: "over", claim: "400,000 entries need a third node and break the budget", run: "lab", params: { model: "size-lab", config: SIZE_CHALLENGE, values: { entries: 400000 }, metric: "costPerMonth" }, expect: { min: 400 } },
  ],
});
