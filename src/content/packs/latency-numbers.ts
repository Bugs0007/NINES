import { definePack, SRC } from "../define";

const FIBER = { id: "fiber-speed", title: "Optical fiber: light travels at roughly c/1.47 (about 200,000 km/s) in glass", url: "https://en.wikipedia.org/wiki/Optical_fiber#Refractive_index" };
const RFC8446 = { id: "rfc8446", title: "RFC 8446: TLS 1.3 (full handshake in one round trip)", url: "https://www.rfc-editor.org/rfc/rfc8446" };
const VERIZON = { id: "verizon-latency", title: "Verizon Business: IP latency statistics (monthly round-trip averages)", url: "https://www.verizon.com/business/terms/latency/" };

const ITEMS = [
  { id: "l1", label: "L1 cache hit", ns: 1 },
  { id: "mutex", label: "Mutex lock/unlock", ns: 25 },
  { id: "ram", label: "Main memory read", ns: 100 },
  { id: "ssd", label: "Local SSD random read", ns: 50_000 },
  { id: "dc", label: "Datacenter round trip", ns: 500_000 },
  { id: "disk", label: "Spinning-disk seek", ns: 8_000_000 },
  { id: "ocean", label: "California → Netherlands → California packet", ns: 150_000_000 },
];

const LADDER = { items: ITEMS, scaleRef: "l1", predictionId: "order", raceSeconds: 7 };

export const BUDGET = {
  title: "GET /u/:handle (profile)",
  targetMs: 200,
  days: 5,
  spans: [
    { id: "session", label: "Session lookup (Redis, same AZ)", ms: 0.6, kind: "cache" },
    { id: "nplus1", label: "41 sequential Postgres queries (N+1)", ms: 45, kind: "db" },
    { id: "avatar", label: "Avatar from S3 bucket in us-east-1", ms: 230, kind: "net" },
    { id: "recs", label: "Recs API, Virginia: 3 round trips per call (new TCP + TLS + GET)", ms: 570, kind: "net" },
    { id: "render", label: "Template render (CPU)", ms: 25, kind: "cpu" },
  ],
  fixes: [
    { id: "join", label: "Batch the N+1 into one JOIN", days: 1, detail: "select_related (one JOIN) or prefetch_related (one extra query): 41 round trips become 1 or 2.", set: { nplus1: 3 } },
    { id: "cdn", label: "Serve avatars from ap-south-1 via CloudFront", days: 1, detail: "Copy the bucket to Mumbai and put a CDN in front.", set: { avatar: 15 } },
    { id: "keepalive", label: "Reuse one HTTPS connection to the recs API", days: 0.5, detail: "A warm pooled connection skips the TCP and TLS handshakes: one round trip instead of three.", set: { recs: 190 }, conflicts: ["async"] },
    { id: "async", label: "Take recs off the critical path", days: 1, detail: "Render the page, then fetch recommendations from the browser.", remove: ["recs"], conflicts: ["keepalive"] },
    { id: "parallel", label: "Fetch avatar and recs in parallel", days: 0.5, detail: "Two independent calls, so wait for the slower one only.", parallel: ["avatar", "recs"] },
    { id: "bigger", label: "Upgrade to a bigger EC2 instance", days: 0, detail: "Twice the vCPUs at the same per-core speed, so one request renders no faster. The CFO will have questions.", set: {} },
    { id: "index", label: "Add an index on users.handle", days: 0.5, detail: "handle is already UNIQUE, so Postgres already has an index on it.", set: {} },
    { id: "recs-mumbai", label: "Deploy a recs replica in Mumbai", days: 4, detail: "Same API, same region as the app. A big project.", set: { recs: 6 } },
  ],
};

export default definePack({
  id: "latency-numbers",
  title: "Latency Numbers",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "complaint",
    alert: {
      severity: "info",
      title: "Support",
      detail: "Profile pages take forever to load on my phone.|It's 2026. Why does tapping a profile take a full second?|Your app is slower than my bank's app. My BANK.",
    },
    lines: [
      { speaker: "kabir", line: "Let's just add more servers. Servers fix things, right?" },
      { speaker: "meera", line: "Before anyone buys anything, tell me where one second actually goes." },
    ],
  },
  predictions: [
    {
      id: "order",
      kind: "order",
      prompt: "Put these in order, fastest first.",
      items: ITEMS.map(({ id, label }) => ({ id, label })),
      answer: ["l1", "mutex", "ram", "ssd", "dc", "disk", "ocean"],
      observe: "raced",
      reveal: {
        text: "Seven operations, eight orders of magnitude. The gap that runs backend work is memory versus network: one datacenter round trip costs about five thousand RAM reads, and crossing an ocean costs hundreds of datacenter round trips.",
        sourceIds: ["norvig-21-days", "dean-ladis-2009"],
        derived: true,
        line: { speaker: "meera", line: "Your intuition works in seconds and computers work in nanoseconds. Rescale, or be fooled." },
      },
    },
  ],
  widget: { id: "latency-ladder", config: LADDER },
  mechanism: [
    {
      id: "span",
      scene: "race",
      text: "Latency in this ladder spans eight orders of magnitude. A human can't feel the difference between a nanosecond and a microsecond, so we reason about it wrong. The fix is to rescale everything to a clock we understand.",
    },
    {
      id: "human",
      scene: "human-scale",
      text: "If an L1 cache hit took one second, a RAM read would take under two minutes, an SSD read about fourteen hours, a datacenter round trip almost six days, and one California–Netherlands round trip nearly five years.",
      sourceIds: ["norvig-21-days", "dean-ladis-2009", "gregg-sysperf"],
      derived: true,
    },
    {
      id: "physics",
      scene: "physics",
      text: "Network time is mostly physics. Light in fiber covers about 200 km per millisecond, so a round trip between Mumbai and the US East Coast can't beat roughly 130 ms, no matter what you pay.",
      sourceIds: ["fiber-speed"],
      derived: true,
    },
    {
      id: "count",
      text: "So count round trips, not instructions. An N+1 query loop, a fresh TLS handshake to another continent, or an image fetched from the wrong region dwarfs anything your CPU does. Read the waterfall before you buy servers.",
    },
  ],
  challenges: [
    {
      id: "profile-budget",
      title: "The one-second profile",
      brief: "Here is the real trace for a profile view from Mumbai. Get p50 under 200ms. You have 5 engineering days, and every fix costs some.",
      line: { speaker: "kabir", line: "Can we have it by Friday? I promised a journalist a fast app." },
      widget: { id: "latency-budget", config: BUDGET },
      conditions: [
        { metric: "latency", op: "<", value: 0.2, label: "p50 page load under 200 ms" },
        { metric: "days", op: "<=", value: 5, label: "Fits in 5 engineering days" },
      ],
      stars: [
        { metric: "days", op: "<=", value: 2, label: "Done in 2 days or less" },
        { metric: "latency", op: "<", value: 0.1, label: "Under 100 ms" },
      ],
      hints: [
        "Look at the bars before the fixes. Which two are an order of magnitude bigger than the rest?",
        "Network round trips cost the most. Which fixes remove round trips instead of shaving CPU?",
        "Not everything has to be on the critical path. What does the user need before the page can render?",
      ],
    },
  ],
  explainBack: {
    prompt: "A teammate wants a bigger instance because a page takes 900ms. Using latency numbers, explain what you'd check first and why.",
    rubric: [
      { id: "network", criterion: "Network round trips and I/O dominate web latency, orders of magnitude above CPU work", keyIdea: "memory vs network gap" },
      { id: "trace", criterion: "Look at the request's trace/waterfall and count the round trips (DB queries, cross-region calls, handshakes)", keyIdea: "count round trips" },
      { id: "fix", criterion: "Fix by removing, batching, parallelizing, or moving round trips closer, not by adding CPU", keyIdea: "remove round trips" },
    ],
    exemplar:
      "A page that takes 900ms is almost never CPU-bound: one datacenter round trip is thousands of memory reads, and a call across an ocean is hundreds of those. I'd open the trace and count round trips: N+1 queries, calls to other regions, fresh TLS handshakes. Then remove, batch, parallelize, or move those closer to the user; a bigger instance adds capacity, not per-request speed.",
  },
  reviews: [
    {
      id: "ln-order-backend",
      format: "order",
      scenario: "Order by typical latency, fastest first.",
      items: [
        { id: "ram", label: "Read a value from RAM" },
        { id: "redis", label: "Redis GET in the same AZ" },
        { id: "ssd", label: "Random read from a local NVMe SSD" },
        { id: "xregion", label: "Postgres query to a region across an ocean" },
      ],
      answer: ["ram", "ssd", "redis", "xregion"],
      explain: "~100ns, tens of µs, ~0.5ms (a network round trip), and 100ms+ (an ocean). The same-AZ Redis call is slower than a local NVMe read because it crosses the network. On EC2 the default disk is EBS, which also crosses the network: expect roughly 0.5 ms to a few ms per read.",
    },
    {
      id: "ln-est-nplus1",
      format: "estimate",
      scenario: "A view makes 40 sequential queries, each about 1ms (almost all of it network round trip). How much does that add to the page?",
      unit: "ms",
      answer: 40,
      acceptFactor: 1.5,
      breakdown: ["40 queries × ~1 ms each", "≈ 40 ms, before any real work"],
      explain: "Sequential round trips add linearly. One JOIN or prefetch turns 40 round trips into 1 or 2.",
    },
    {
      id: "ln-est-human",
      format: "estimate",
      scenario: "Human scale: if a 100ns RAM read took one second, how many days would a 150 ms California–Netherlands round trip take?",
      unit: "days",
      answer: 17.4,
      acceptFactor: 1.5,
      breakdown: ["150 ms ÷ 100 ns = 1,500,000", "1,500,000 seconds ÷ 86,400", "≈ 17 days"],
      explain: "A single round trip across an ocean is worth over a million memory reads.",
    },
    {
      id: "ln-pick-tls",
      format: "pick-fix",
      scenario: "A Django view in Mumbai calls an API in Virginia three times in sequence per request, opening a new HTTPS connection each time. p50 is 1.8 s. Best first fix?",
      options: [
        { id: "a", label: "Move to an instance with more vCPUs" },
        { id: "b", label: "Reuse one connection and batch the three calls into one" },
        { id: "c", label: "Add a Postgres index" },
        { id: "d", label: "Turn on gzip" },
      ],
      answer: "b",
      explain: "Each fresh HTTPS connection pays TCP and TLS handshakes before the request itself, and each costs a cross-ocean round trip. Reusing one warm connection and batching turns nine cross-ocean round trips into one.",
      why: {
        prompt: "What dominates the 1.8 s?",
        options: [
          { id: "a", label: "Cross-region round trips, including handshakes" },
          { id: "b", label: "Python CPU time" },
          { id: "c", label: "JSON serialization" },
        ],
        answer: "a",
      },
    },
    {
      id: "ln-graph-servers",
      format: "predict-graph",
      scenario: "A page's latency is dominated by a 200ms cross-region call. Traffic is low. You scale from 1 server to 8. What does p50 do?",
      xLabel: "servers (1 → 8)",
      yLabel: "p50 latency",
      options: [
        { id: "drop", label: "Falls steadily", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "flat", label: "Barely moves", points: [5, 5, 4.9, 4.9, 4.9, 4.9, 4.9, 4.9] },
        { id: "halves", label: "Halves, then flattens", points: [8, 4, 3, 2.7, 2.5, 2.4, 2.4, 2.4] },
      ],
      answer: "flat",
      explain: "More servers add capacity, not speed. At low load nobody is queueing, so the 200ms of physics is still there on every request.",
    },
    {
      id: "ln-flaw-avatar",
      format: "spot-flaw",
      scenario: "Profile pages for users in India take 400ms. Tap the hop that costs the most.",
      diagram: {
        nodes: [
          { id: "user", label: "user · Hyderabad", kind: "client", col: 0, row: 1 },
          { id: "alb", label: "ALB · ap-south-1", kind: "lb", col: 1, row: 1 },
          { id: "api", label: "api · ap-south-1", kind: "server", col: 2, row: 1 },
          { id: "db", label: "postgres · ap-south-1", kind: "db", col: 3, row: 0 },
          { id: "s3", label: "avatars · S3 us-east-1", kind: "store", col: 3, row: 2 },
        ],
        edges: [
          { from: "user", to: "alb" },
          { from: "alb", to: "api" },
          { from: "api", to: "db" },
          { from: "api", to: "s3" },
        ],
      },
      answer: "api->s3",
      explain: "Everything else is in Mumbai. The avatar fetch crosses to Virginia and back on every page. Move the bucket or put a CDN in front of it.",
    },
    {
      id: "ln-explain-count",
      format: "explain",
      scenario: "Why does 'count the round trips' usually beat 'optimize the code' for web latency?",
      rubric: [
        { id: "gap", criterion: "Network round trips cost orders of magnitude more than in-memory work" },
        { id: "dominate", criterion: "So a few round trips dominate total latency; shaving CPU barely moves it" },
      ],
      exemplar: "A single datacenter round trip costs as much as thousands of memory reads, and a round trip across an ocean hundreds of those. A request's time is mostly spent waiting on the network, so removing one round trip saves more than any code optimization.",
      explain: "Profile first. The waterfall almost always shows network and I/O as the big bars.",
    },
  ],
  codex: {
    oneLiner: "Latency spans eight orders of magnitude; in backend work, network round trips dwarf everything the CPU does.",
    keyNumbers: [
      { label: "L1 cache hit", value: "≈ 0.5–1 ns", sourceId: "norvig-21-days" },
      { label: "Main memory read", value: "≈ 100 ns", sourceId: "norvig-21-days" },
      { label: "SSD I/O", value: "≈ 10–100 µs", sourceId: "gregg-sysperf" },
      { label: "Datacenter round trip", value: "≈ 500 µs", sourceId: "dean-ladis-2009" },
      { label: "Disk seek", value: "≈ 8 ms", sourceId: "norvig-21-days" },
      { label: "California ↔ Netherlands round trip", value: "≈ 150 ms", sourceId: "dean-ladis-2009" },
      { label: "New York ↔ London round trip", value: "≈ 70 ms", sourceId: "verizon-latency" },
      { label: "Feels instantaneous", value: "≤ 100 ms", sourceId: "nielsen-response" },
      { label: "Light in fiber", value: "≈ 200 km / ms", sourceId: "fiber-speed" },
      { label: "TLS 1.3 full handshake", value: "1 round trip", sourceId: "rfc8446" },
    ],
    tradeoffs: [
      { choice: "Cache near the user (CDN, edge)", gain: "Removes long-haul round trips", cost: "Staleness and invalidation work" },
      { choice: "Batch or pipeline calls", gain: "Pay one round trip instead of N", cost: "More complex code, bigger payloads" },
      { choice: "Keep connections alive", gain: "Skips TCP and TLS handshakes", cost: "Idle connections hold memory on both ends" },
    ],
    seenIn: [
      { text: "Case Intel's eCourts scraping: every district request paid a full round trip to a server you don't control, which is why fan-out concurrency mattered.", audience: "owner" },
      "A scraper or fan-out that calls a slow third-party site once per item pays a full round trip each time, which is why concurrency matters.",
      "Every Django N+1 you've fixed with select_related was round-trip counting.",
    ],
    interviewAngle: "Open latency discussions by listing the round trips in the request path with rough costs: 'two cross-region hops, ~300ms, before we've done any work'. It anchors the whole design.",
    aws: [
      { concept: "Edge caching", service: "Amazon CloudFront" },
      { concept: "Put compute near users", service: "ap-south-1 (Mumbai) / ap-south-2 (Hyderabad) regions" },
      { concept: "Measure user-facing latency", service: "CloudWatch RUM / Internet Monitor" },
    ],
    otherClouds: "GCP: Cloud CDN, asia-south1 · Azure: Front Door, Central India",
    replay: { id: "latency-ladder", config: LADDER, scene: "race" },
  },
  interview: [
    "Estimate the p50 of a request that does 3 DB queries, one Redis call, and one call to a service in another region.",
    "Why is a same-AZ Redis GET slower than reading from a local SSD?",
    "Users in Europe complain about latency to your Mumbai-hosted API. What are your options, cheapest first?",
  ],
  deeper: [
    {
      title: "Where these numbers come from, and why they drift",
      body: "The classic table comes from Jeff Dean's talks and Peter Norvig's essay; Brendan Gregg's Systems Performance scales them to human time. Hardware moves: SSDs got faster, memory got a little faster, the speed of light didn't. Treat the table as orders of magnitude and measure your own stack. On AWS, same-AZ round trips are often well under a millisecond, and cross-AZ round trips a little more.",
      sourceIds: ["norvig-21-days", "dean-ladis-2009", "gregg-sysperf"],
    },
    {
      title: "The speed-of-light floor",
      body: "Glass slows light to about c/1.47, roughly 200,000 km/s, or 200 km per millisecond. Real cables don't follow great circles, and routers add queueing, so observed round trips run well above the floor. The floor is still useful: no caching trick makes a request to another continent faster than physics allows. Only moving the data closer does.",
      sourceIds: ["fiber-speed"],
    },
    {
      title: "The handshake tax",
      body: "A new HTTPS connection costs a TCP handshake (one round trip) plus a TLS handshake (one round trip with TLS 1.3, two with TLS 1.2) before the first request byte. To a server 190ms away, that's 380ms of setup before your 190ms request. Connection reuse (keep-alive, pooled sessions) pays it once.",
      sourceIds: ["rfc8446"],
    },
  ],
  honestPhysics: [
    "The ladder uses representative values from published tables; your hardware and cloud will differ, sometimes by 10×.",
    "The profile trace is a scenario, not a measurement of a real app; its shape is typical of what an APM waterfall shows.",
    "SSD numbers are local NVMe. On EC2 the default disk is EBS, a network block device, so a read costs about 0.5 ms to a few ms. The 500 µs datacenter round trip is Dean's 2009 figure; same-AZ on AWS is usually lower and cross-AZ is about 1 ms.",
  ],
  sources: [SRC.norvig, SRC.deanLadis, SRC.gregg, SRC.nielsen, FIBER, RFC8446, VERIZON],
  verify: [
    { id: "untouched", claim: "The untouched page is near one second", run: "budget-total", params: { config: BUDGET, fixes: [] }, expect: { min: 800, max: 950 } },
    { id: "two-days", claim: "Moving recs off the path and fixing avatars (2 days) beats 200ms", run: "budget-total", params: { config: BUDGET, fixes: ["async", "cdn"] }, expect: { max: 199 } },
    { id: "cpu-fails", claim: "A bigger instance plus an index does almost nothing", run: "budget-total", params: { config: BUDGET, fixes: ["bigger", "index"] }, expect: { min: 800 } },
    { id: "keepalive-not-enough", claim: "Keep-alive + CDN + JOIN (2.5 days) still misses 200ms", run: "budget-total", params: { config: BUDGET, fixes: ["keepalive", "cdn", "join"] }, expect: { min: 200 } },
  ],
});
