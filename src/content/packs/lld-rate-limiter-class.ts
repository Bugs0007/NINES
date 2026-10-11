import { definePack } from "../define";

export const LC = { start: { algo: "counter", clock: true, sync: "cas", evict: true } };
export const LC_CHALLENGE = { start: { algo: "fixed", clock: false, sync: "none", evict: false } };

const STRIPE_LIMITERS = { id: "stripe-limiters", title: "Stripe Engineering: Scaling your API with rate limiters (token bucket and load shedders)", url: "https://stripe.com/blog/rate-limiters" };
const CLOUDFLARE_SLIDING = { id: "cf-sliding-window", title: "Cloudflare blog: How we built rate limiting capable of scaling to millions of domains (sliding window counter)", url: "https://blog.cloudflare.com/counting-things-a-lot-of-different-things/" };
const JAVA_ATOMIC = { id: "java-atomic", title: "Java docs: java.util.concurrent.atomic (compare-and-swap)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/package-summary.html" };

export default definePack({
  id: "lld-rate-limiter-class",
  title: "LLD: Rate Limiter Class",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "CI · RateLimiterTest.testWindowRollover · 61 s", detail: "the test sleeps for a real minute; it flaked three times this week" },
    lines: [
      { speaker: "kabir", line: "Our limiter test sleeps for a real minute, fails randomly on busy CI, and we found a client sending twice the limit around the top of the minute." },
      { speaker: "meera", line: "The algorithm is half of a rate limiter class. The other half is time you can control, counts that survive threads, and memory that doesn't grow forever." },
    ],
  },
  predictions: [
    {
      id: "burst",
      kind: "choice",
      prompt: "A fixed-window limiter allows 100 requests a minute and resets on the minute. A client sends 100 in the last second of one minute and 100 in the first second of the next. How many get through in those two seconds?",
      options: [
        { id: "100", label: "100, the limit holds" },
        { id: "200", label: "200, twice the limit" },
        { id: "150", label: "150" },
      ],
      answer: "200",
      observe: "double-burst",
      reveal: {
        text: "Each window sees only 100, so the counter allows both bursts, and the backend takes 200 in two seconds: a boundary burst of twice the limit. A sliding window counter, which blends the previous window's count by how far into the current one you are, cuts it to within 5% of the limit for 32 bytes a key.",
        derived: true,
        line: { speaker: "rao", line: "The cheap algorithm has a seam. Know where it is." },
      },
    },
    {
      id: "flaky",
      kind: "choice",
      prompt: "The limiter reads the system clock directly. To test that the window resets, what does a test have to do?",
      options: [
        { id: "instant", label: "Nothing, tests run instantly" },
        { id: "sleep", label: "Wait a real minute, so it is slow and flaky" },
        { id: "mock", label: "Mock the operating system" },
      ],
      answer: "sleep",
      observe: "flaky-tests",
      reveal: {
        text: "The class asks the world for the time and so the test must let the world move on: a real sleep, a minute long, subject to scheduler jitter on busy machines. Inject a Clock interface instead. Production passes the system clock; a test passes a fake that it advances by 61 seconds in a line of code.",
        derived: true,
        line: { speaker: "meera", line: "Time is a dependency. Inject it like any other." },
      },
    },
  ],
  widget: { id: "limiterclass-lab", config: LC },
  mechanism: [
    {
      id: "interface",
      text: "Start from a small interface: allow(key) returns true if the request may proceed. Callers depend on that and nothing else, so the algorithm can change without touching them, and several algorithms can be tried behind it. Configuration, such as the limit and the window, goes in the constructor, and the state of each key lives inside the implementation.",
      sourceIds: ["stripe-limiters"],
    },
    {
      id: "algorithms",
      scene: "algorithm",
      text: "Algorithms differ in memory, accuracy and burst. A fixed window counter is cheap and can pass twice the limit across a boundary. A sliding log is exact and stores every timestamp. A sliding window counter blends two windows in 32 bytes a key. A token bucket allows a set burst, and a leaky bucket smooths to the rate.",
      sourceIds: ["stripe-limiters", "cf-sliding-window"],
    },
    {
      id: "clock",
      scene: "clock",
      text: "Inject the clock. A Clock interface with now() lets production use real time and a test advance a fake clock by a minute in one line, so tests are instant and deterministic. The same habit applies to random numbers and IDs: anything the class asks the world for should be passed in.",
      sourceIds: ["stripe-limiters"],
    },
    {
      id: "safety",
      scene: "concurrency",
      text: "Make it correct under concurrency and bounded in memory. Two threads each reading the count and writing +1 lose a request, so protect the update with a lock per key, or a compare-and-swap loop when the state is one value. A timestamp log needs a lock. Evict idle keys, or the table grows with every client ever seen.",
      sourceIds: ["java-atomic"],
    },
  ],
  challenges: [
    {
      id: "write-limiter",
      title: "Write the class",
      brief: "A burst across a boundary of 1.1× the limit or less, 100 MB or less for a million keys, a test that does not sleep, correct under concurrency at 80% throughput or better, and no unbounded key growth.",
      line: { speaker: "rao", line: "Accurate, small, testable and safe." },
      widget: { id: "limiterclass-lab", config: LC_CHALLENGE },
      conditions: [
        { metric: "boundaryBurst", op: "<=", value: 1.1, label: "Burst at most 1.1× the limit" },
        { metric: "memoryMB", op: "<=", value: 100, label: "At most 100 MB for a million keys" },
        { metric: "testable", op: ">=", value: 1, label: "Testable without sleeping" },
        { metric: "correctUnderLoad", op: ">=", value: 1, label: "Correct under concurrency" },
        { metric: "throughputRel", op: ">=", value: 0.8, label: "At least 80% throughput" },
        { metric: "keyLeak", op: "<=", value: 0, label: "Keys do not leak" },
      ],
      stars: [],
      hints: ["Which algorithms keep the boundary burst small?", "What does a lock cost against compare-and-swap?", "What bounds the key table?"],
    },
  ],
  explainBack: {
    prompt: "Design a rate limiter class and explain the choices.",
    rubric: [
      { id: "interface", criterion: "A small allow(key) interface so the algorithm can change; limit and window in the constructor", keyIdea: "small interface" },
      { id: "algo", criterion: "Compare fixed window (boundary burst), sliding log (exact, memory heavy), sliding counter (cheap, close), token bucket (burst by design) and leaky bucket", keyIdea: "algorithm trade-offs" },
      { id: "quality", criterion: "Inject the clock for tests, make updates atomic with a lock or CAS, and evict idle keys", keyIdea: "clock, atomicity, eviction" },
    ],
    exemplar:
      "I would expose a small allow(key) interface with the limit and window in the constructor so the algorithm can change. A fixed window is cheap with a boundary burst of twice the limit, a sliding log is exact and memory heavy, a sliding window counter is cheap and close, a token bucket allows a burst by design and a leaky bucket smooths. I would inject the clock so tests do not sleep, make updates atomic with a lock or compare-and-swap, and evict idle keys so memory stays bounded.",
  },
  reviews: [
    {
      id: "lc-est",
      format: "estimate",
      scenario: "A sliding log stores a timestamp of 8 bytes for each of up to 100 requests per key. How much memory does a million keys use, in MB?",
      unit: "MB",
      answer: 800,
      acceptFactor: 1.03,
      breakdown: ["100 × 8 = 800 bytes a key", "× 1,000,000 keys = 800 MB"],
      explain: "Exactness is memory. Evicting idle keys keeps 5% of this.",
    },
    {
      id: "lc-pick",
      format: "pick-fix",
      scenario: "Under load the limiter's counts are lower than the real request counts. The update is: count = map.get(key); map.put(key, count + 1). What is the fix?",
      options: [
        { id: "a", label: "Make the read-modify-write atomic: a compare-and-swap loop or a lock per key" },
        { id: "b", label: "Increment twice" },
        { id: "c", label: "Increase the limit" },
        { id: "d", label: "Run on one core" },
      ],
      answer: "a",
      explain: "Two threads can read the same count and both write count + 1. Atomic update closes the gap.",
    },
    {
      id: "lc-order",
      format: "order",
      scenario: "Order these by memory for a million keys, most first (no eviction).",
      items: [
        { id: "log", label: "Sliding log" },
        { id: "counter", label: "Sliding window counter" },
        { id: "token", label: "Token bucket" },
        { id: "fixed", label: "Fixed window counter" },
      ],
      answer: ["log", "counter", "token", "fixed"],
      explain: "800, 32, 24 and 16 MB.",
    },
    {
      id: "lc-graph",
      format: "predict-graph",
      scenario: "As you move from fixed window to sliding counter to sliding log, how does the worst burst across a boundary change?",
      xLabel: "algorithm →",
      yLabel: "burst × limit",
      options: [
        { id: "fall", label: "Falls from 2× toward 1×", points: [2, 2, 1.5, 1.05, 1.05, 1, 1, 1] },
        { id: "rise", label: "Rises", points: [1, 1, 1.05, 1.5, 2, 2, 2, 2] },
        { id: "flat", label: "Stays at 2×", points: [2, 2, 2, 2, 2, 2, 2, 2] },
      ],
      answer: "fall",
      explain: "More precise algorithms hold more state and allow less overshoot.",
    },
    {
      id: "lc-flaw",
      format: "spot-flaw",
      scenario: "A limiter keeps a map from client ID to a counter and never removes entries. A scanner sends one request from each of ten million random IDs. Tap the problem.",
      diagram: {
        nodes: [
          { id: "req", label: "requests from 10M different IDs", kind: "client", col: 0, row: 1 },
          { id: "map", label: "limiter state map, no eviction", kind: "cache", col: 1, row: 1 },
          { id: "mem", label: "process memory", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "map" },
          { from: "map", to: "mem" },
        ],
      },
      answer: "map->mem",
      explain: "State for idle keys is never freed, so the limiter itself becomes the memory problem. Evict by TTL or LRU.",
    },
    {
      id: "lc-explain",
      format: "explain",
      scenario: "In two sentences: why inject the clock into a rate limiter?",
      rubric: [
        { id: "test", criterion: "A test can advance a fake clock instantly instead of sleeping, so it is fast and deterministic" },
        { id: "control", criterion: "It makes time a dependency like any other, so behaviour at window boundaries can be tested exactly" },
      ],
      exemplar: "A test can advance a fake clock instantly instead of sleeping, so it is fast and deterministic. It also makes time a dependency like any other, so behaviour at window boundaries can be tested exactly.",
      explain: "Control time and the edge cases become easy.",
    },
  ],
  codex: {
    oneLiner: "A small allow(key) interface; pick the algorithm by burst, memory and accuracy; inject the clock; update atomically; evict idle keys.",
    keyNumbers: [
      { label: "Fixed window boundary burst (lab)", value: "2× the limit", sourceId: "stripe-limiters" },
      { label: "Sliding window counter, per key (lab)", value: "32 bytes, within 5%", sourceId: "cf-sliding-window" },
    ],
    tradeoffs: [
      { choice: "Token bucket", gain: "Allows bursts by design", cost: "A burst above the average rate" },
      { choice: "Lock per key", gain: "Works for any state", cost: "Half the throughput in the lab" },
      { choice: "Compare-and-swap", gain: "Fast for one value", cost: "Cannot guard a list" },
    ],
    seenIn: ["Stripe, Cloudflare and API gateway limiters.", "A machine-coding round, usually with a clock injected."],
    interviewAngle: "Say: 'interface first, then the algorithm trade-offs, an injected clock, atomic per-key updates and TTL eviction'.",
    aws: [{ concept: "Managed limiting", service: "API Gateway usage plans; AWS WAF rate-based rules" }],
    replay: { id: "limiterclass-lab", config: LC, scene: "clock" },
  },
  interview: [
    "Design a rate limiter class.",
    "How would you unit test a rate limiter?",
    "Which algorithm would you choose and why?",
  ],
  deeper: [
    {
      title: "From one process to a fleet",
      body: "An in-process limiter counts per instance. For a global limit, keep the counters in a shared store such as Redis and make the update a single atomic script, so the check-and-increment cannot be split. Accept a little slack for latency, or allocate each instance a share of the limit and rebalance. The class interface can stay the same while the implementation changes.",
      sourceIds: ["stripe-limiters"],
    },
  ],
  honestPhysics: [
    "A limiter allowing 100 requests a minute per client, for a million keys. Fixed window counter: 16 bytes a key, a boundary burst of 2× the limit. Sliding log: exact, 800 bytes. Sliding window counter: 32 bytes, within 5% of exact. Token bucket: 24 bytes, a burst of 1.5× by design. Leaky bucket: 24 bytes, smoothed.",
    "A lock per key is correct at half the throughput, compare-and-swap at 90% and works only for single-value state. Evicting idle keys keeps 5% of the memory; without it the table grows with every client seen. Round figures.",
  ],
  sources: [STRIPE_LIMITERS, CLOUDFLARE_SLIDING, JAVA_ATOMIC],
  verify: [
    { id: "fixed", claim: "A fixed window allows a 2× boundary burst", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "fixed" }, metric: "boundaryBurst" }, expect: { min: 2, max: 2 } },
    { id: "log-mem", claim: "A sliding log of 100 timestamps uses 800 MB for a million keys", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "log", evict: false }, metric: "memoryMB" }, expect: { min: 800, max: 800 } },
    { id: "counter-mem", claim: "A sliding window counter uses 32 MB, or 1.6 MB with eviction", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "counter", evict: true }, metric: "memoryMB" }, expect: { min: 1.5, max: 1.7 } },
    { id: "cas-log", claim: "Compare-and-swap cannot protect a timestamp log", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "log", sync: "cas" }, metric: "correctUnderLoad" }, expect: { max: 0 } },
    { id: "lock-tput", claim: "A lock per key halves throughput", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "counter", sync: "lock" }, metric: "throughputRel" }, expect: { min: 0.5, max: 0.5 } },
    { id: "good", claim: "Counter, injected clock, compare-and-swap and eviction meet the target", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "counter", clock: true, sync: "cas", evict: true }, metric: "throughputRel" }, expect: { min: 0.89, max: 0.91 } },
    { id: "leaky", claim: "A leaky bucket also passes the burst target", run: "lab", params: { model: "limiterclass-lab", config: LC_CHALLENGE, values: { algo: "leaky", clock: true, sync: "cas", evict: true }, metric: "boundaryBurst" }, expect: { max: 1.1 } },
  ],
});
