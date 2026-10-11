import { definePack } from "../define";

export const RL = { start: { algo: "scounter", burst: 5 } };
export const RL_CHALLENGE = {};

const STRIPE_RL = { id: "stripe-rate-limiters", title: "Stripe Engineering: Scaling your API with rate limiters (request, concurrency, load shedders)", url: "https://stripe.com/blog/rate-limiters" };
const CLOUDFLARE = { id: "cloudflare-sliding", title: "Cloudflare Blog: How we built rate limiting capable of scaling to millions of domains (sliding window counter)", url: "https://blog.cloudflare.com/counting-things-a-lot-of-different-things/" };
const SRE_OVERLOAD = { id: "sre-book-overload", title: "Google SRE Book, ch. 21: Handling Overload", url: "https://sre.google/sre-book/handling-overload/" };

export default definePack({
  id: "rate-limiting",
  title: "Rate Limiting Algorithms",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "api · 2x limit at exactly :00 every minute", detail: "one client, always at the window boundary" },
    lines: [
      { speaker: "kabir", line: "The limit is ten requests a second, yet one client lands twenty in a moment, every minute, right at the clock tick. Our limiter says it is behaving." },
      { speaker: "meera", line: "The counter resets at the tick. Ten at the end of one second and ten at the start of the next are both allowed, and the backend sees twenty." },
    ],
  },
  predictions: [
    {
      id: "boundary",
      kind: "choice",
      prompt: "A fixed-window limiter allows 10 requests per clock second. What is the most requests a clever client can land in any one second-long span?",
      options: [
        { id: "ten", label: "10: the limit holds" },
        { id: "fifteen", label: "15" },
        { id: "twenty", label: "20: ten just before the reset, ten just after" },
        { id: "infinite", label: "Unlimited" },
      ],
      answer: "twenty",
      observe: "boundary",
      reveal: {
        text: "Sending 10 in the last instant of one window and 10 in the first of the next is allowed by both counters, but they fall within a single second. A fixed window can pass up to twice its limit across a boundary, which matters when the backend has a hard ceiling.",
        derived: true,
        line: { speaker: "meera", line: "The counter counts per window. The backend suffers per second, wherever the window starts." },
      },
    },
    {
      id: "legit",
      kind: "choice",
      prompt: "A well-behaved client sends 10 requests at once, then is quiet for 4 seconds. You switch to a token bucket of size 2 refilling 10 a second, to cap bursts at 12. What share of that client's burst is rejected?",
      options: [
        { id: "none", label: "None" },
        { id: "two", label: "About 20%" },
        { id: "eight", label: "About 80%" },
      ],
      answer: "eight",
      observe: "rejected-legit",
      reveal: {
        text: "A bucket of 2 holds 2 tokens when idle, so only 2 of the 10 requests go through at once and 8 are rejected. A small bucket caps the worst case at 12 a second but turns a legitimate burst into errors. The bucket size is the burst you promise to tolerate.",
        derived: true,
        line: { speaker: "rao", line: "Tight limits catch attackers and a few customers who did nothing wrong." },
      },
    },
  ],
  widget: { id: "ratelimiter-lab", config: RL },
  mechanism: [
    {
      id: "why",
      text: "Rate limits protect shared capacity from one client's excess, deliberate or accidental. A limiter needs an identity (API key, user or IP), a rule such as 10 a second, and a response, usually 429 Too Many Requests with a Retry-After header. The algorithm decides how accurately and cheaply the rule is enforced.",
      sourceIds: ["stripe-rate-limiters", "sre-book-overload"],
    },
    {
      id: "fixed",
      scene: "fixed",
      text: "A fixed window counts requests in each clock interval and resets at the boundary. It is tiny and fast, one counter per client. But a burst straddling the boundary can pass twice the limit, and a client can use its whole allowance in the first instant of every window.",
      sourceIds: ["cloudflare-sliding"],
    },
    {
      id: "bucket",
      scene: "bucket",
      text: "A token bucket holds up to B tokens and refills at the limit rate; each request spends one. A client that has been quiet can burst up to B at once, then is held to the refill rate. It is the usual choice for APIs, because bursts are normal. Worst case in a second is B plus the rate.",
      sourceIds: ["stripe-rate-limiters"],
    },
    {
      id: "sliding",
      scene: "window",
      text: "A sliding window removes the boundary problem. The log version stores a timestamp for every request, exact but heavy. The counter version keeps the current and previous window counts and weights the previous by how much of it still overlaps, close to exact in two numbers per client. Cloudflare reports it errs rarely.",
      sourceIds: ["cloudflare-sliding"],
    },
  ],
  challenges: [
    {
      id: "limiter",
      title: "Pick the limiter",
      brief: "The limit is 10 requests a second, and the backend can take 12 in any one second. Legitimate clients sometimes send 10 at once. Choose an algorithm so the worst second is at most 12, a legitimate burst is never rejected or delayed more than 100 ms, and each client costs at most 40 bytes.",
      line: { speaker: "kabir", line: "We have millions of clients, so a few bytes each add up quickly." },
      widget: { id: "ratelimiter-lab", config: RL_CHALLENGE },
      conditions: [
        { metric: "worstPerSec", op: "<=", value: 12, label: "Worst second at most 12 requests" },
        { metric: "legitRejectedPct", op: "<=", value: 0, label: "A legitimate burst of 10 is not rejected" },
        { metric: "legitDelayMs", op: "<=", value: 100, label: "That burst is delayed at most 100 ms" },
        { metric: "memoryBytes", op: "<=", value: 40, label: "At most 40 bytes per client" },
      ],
      stars: [],
      hints: [
        "Which algorithms cap the worst second near the limit?",
        "Of those, which keep memory small?",
        "What does a small token bucket do to a burst of 10?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare fixed window, token bucket and sliding window limiters.",
    rubric: [
      { id: "fixed", criterion: "A fixed window is cheap but allows up to double the limit across a boundary", keyIdea: "boundary burst" },
      { id: "bucket", criterion: "A token bucket allows bursts up to the bucket size and then the refill rate, with small state", keyIdea: "burst then steady rate" },
      { id: "sliding", criterion: "A sliding window counter approximates an exact window in constant memory, whereas a log is exact but stores every request", keyIdea: "sliding counter versus log" },
    ],
    exemplar:
      "A fixed window counter is the cheapest, but a client can send the limit at the end of one window and again at the start of the next, so twice the limit lands in a moment. A token bucket allows a burst up to its size and then limits to the refill rate, which fits APIs where bursts are normal, with two numbers of state. A sliding window counter weights the previous window to approximate an exact window in constant memory, while a sliding log is exact but stores every timestamp.",
  },
  reviews: [
    {
      id: "rl-est",
      format: "estimate",
      scenario: "A token bucket holds 20 tokens and refills at 10 per second. What is the most requests a client can land in one second after being idle?",
      unit: "requests",
      answer: 30,
      acceptFactor: 1.05,
      breakdown: ["20 tokens in the bucket", "+ 10 refilled during the second", "= 30"],
      explain: "The worst second is the bucket size plus one second of refill.",
    },
    {
      id: "rl-pick",
      format: "pick-fix",
      scenario: "A fixed-window limiter allows 100 requests a minute, but the backend melts when a client sends 200 requests in 2 seconds at the minute boundary. Which change fixes it with the least memory?",
      options: [
        { id: "a", label: "Switch to a sliding window counter" },
        { id: "b", label: "Switch to a sliding window log" },
        { id: "c", label: "Raise the limit to 200" },
        { id: "d", label: "Reset the counter every second" },
      ],
      answer: "a",
      explain: "The counter weights the previous window, removing the boundary spike in constant memory. The log works but stores every request.",
    },
    {
      id: "rl-order",
      format: "order",
      scenario: "Order these by memory per client, most first.",
      items: [
        { id: "log100", label: "Sliding log, limit of 100 a second" },
        { id: "log10", label: "Sliding log, limit of 10 a second" },
        { id: "counter", label: "Sliding window counter, any limit" },
      ],
      answer: ["log100", "log10", "counter"],
      explain: "The log stores a timestamp for every allowed request, so it grows with the limit. The counter keeps two counts whatever the limit.",
    },
    {
      id: "rl-graph",
      format: "predict-graph",
      scenario: "A token bucket refills at 10 a second. As you raise the bucket size from 1 to 50, what happens to the worst second a client can land and to the share of a 10-request legitimate burst that is rejected?",
      xLabel: "bucket size →",
      yLabel: "worst second (rising) and rejected share (falling)",
      options: [
        { id: "tradeoff", label: "Worst second rises, rejected share falls: a trade-off", points: [11, 12, 15, 20, 30, 40, 50, 60] },
        { id: "both-fall", label: "Both fall", points: [60, 50, 40, 30, 20, 15, 12, 11] },
        { id: "flat", label: "Neither changes", points: [20, 20, 20, 20, 20, 20, 20, 20] },
      ],
      answer: "tradeoff",
      explain: "A bigger bucket tolerates bigger legitimate bursts but also lets an attacker send more at once. The size is where you set the trade.",
    },
    {
      id: "rl-flaw",
      format: "spot-flaw",
      scenario: "A distributed limiter keeps its counter in each server's memory. With 10 servers behind a load balancer, a client can send 10 times the limit. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "client", label: "client", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "load balancer", kind: "lb", col: 1, row: 1 },
          { id: "servers", label: "10 servers, local counters", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "lb" },
          { from: "lb", to: "servers" },
        ],
      },
      answer: "lb->servers",
      explain: "Each server sees only a tenth of the client's traffic, so none reaches the limit. The counter has to be shared, in a store such as Redis, or the client routed consistently to one server.",
    },
    {
      id: "rl-explain",
      format: "explain",
      scenario: "In two sentences: why return 429 with a Retry-After header rather than just dropping excess requests?",
      rubric: [
        { id: "clear", criterion: "429 tells the client it is being limited, not that the service is broken, so it can behave correctly" },
        { id: "retry", criterion: "Retry-After tells it when to try again, which prevents immediate retries that worsen the overload" },
      ],
      exemplar: "A 429 tells the client it is being limited, not that the service failed, so it can back off instead of reporting an error. Retry-After says when to try again, which stops retries arriving all at once and making the overload worse.",
      explain: "Tell the client what to do next.",
    },
  ],
  codex: {
    oneLiner: "Fixed windows are cheap but double at boundaries. Token buckets allow bursts. Sliding window counters approximate exact limits in constant memory.",
    keyNumbers: [
      { label: "Fixed-window worst case", value: "2 × the limit across a boundary", sourceId: "cloudflare-sliding" },
      { label: "Token bucket worst second", value: "bucket size + refill rate", sourceId: "stripe-rate-limiters" },
    ],
    tradeoffs: [
      { choice: "Fixed window", gain: "Simplest and smallest", cost: "Boundary bursts of 2×" },
      { choice: "Token bucket", gain: "Allows normal bursts; small state", cost: "Worst second is bucket plus rate" },
      { choice: "Sliding log", gain: "Exact", cost: "Memory grows with the limit" },
      { choice: "Sliding window counter", gain: "Nearly exact, constant memory", cost: "An approximation" },
    ],
    seenIn: ["Stripe's request-rate, concurrency and load-shedding limiters.", "Cloudflare's sliding window counters."],
    interviewAngle: "Say: 'token bucket for bursty APIs, sliding window counter when the backend needs a hard ceiling; shared state in Redis, 429 with Retry-After'.",
    aws: [{ concept: "Throttling with token buckets", service: "API Gateway usage plans" }],
    replay: { id: "ratelimiter-lab", config: RL, scene: "window" },
  },
  interview: [
    "Compare token bucket and sliding window rate limiters.",
    "What is wrong with a fixed window counter?",
    "How would you rate limit across many servers?",
  ],
  deeper: [
    {
      title: "Limit more than requests",
      body: "Stripe describes four limiters used together: a request-rate limiter per user, a concurrency limiter for how many requests run at once, a fleet-usage limiter that reserves capacity for critical traffic, and a worker-utilisation load shedder that drops low-priority work first. Request counts alone miss slow, expensive requests.",
      sourceIds: ["stripe-rate-limiters"],
    },
  ],
  honestPhysics: [
    "A limit of 10 requests a second per client. The backend tolerates 12 in any one second. A legitimate client sometimes sends 10 requests at once, then is quiet for 4 seconds.",
    "Fixed window: worst 20, 16 bytes. Sliding log: worst 10, 8 bytes per allowed request, 80. Sliding counter: worst about 11, 16 bytes. Token bucket of size B: worst B + 10, rejects a burst larger than B. Leaky bucket of size B: worst 10, delays a burst by 100 ms per queued request.",
    "Memory is per client.",
  ],
  sources: [STRIPE_RL, CLOUDFLARE, SRE_OVERLOAD],
  verify: [
    { id: "fixed", claim: "A fixed window passes 20 in one second", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "fixed" }, metric: "worstPerSec" }, expect: { min: 20, max: 20 } },
    { id: "slog-mem", claim: "A sliding log takes 80 bytes per client", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "slog" }, metric: "memoryBytes" }, expect: { min: 80, max: 80 } },
    { id: "scounter", claim: "A sliding window counter keeps the worst second to 11", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "scounter" }, metric: "worstPerSec" }, expect: { max: 12 } },
    { id: "scounter-mem", claim: "…in 16 bytes", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "scounter" }, metric: "memoryBytes" }, expect: { max: 40 } },
    { id: "bucket2", claim: "A bucket of 2 caps the worst second at 12 but rejects 80% of a legitimate burst", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "bucket", burst: 2 }, metric: "legitRejectedPct" }, expect: { min: 0.8, max: 0.8 } },
    { id: "bucket10", claim: "A bucket of 10 lets 20 through in a second", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "bucket", burst: 10 }, metric: "worstPerSec" }, expect: { min: 20 } },
    { id: "leaky", claim: "A leaky bucket delays a legitimate burst by 900 ms", run: "lab", params: { model: "ratelimiter-lab", config: RL_CHALLENGE, values: { algo: "leaky", burst: 10 }, metric: "legitDelayMs" }, expect: { min: 900 } },
  ],
});
