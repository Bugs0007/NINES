import { definePack } from "../define";

export const FANOUT = { median: 0.02, p99: 0.12, calls: 40, minCalls: 10, maxCalls: 200 };

const TAIL = { id: "tail-at-scale", title: "J. Dean and L. Barroso (2013), The Tail at Scale, Communications of the ACM 56(2)", url: "https://doi.org/10.1145/2408776.2408794" };

export default definePack({
  id: "tail-latency",
  title: "Tail Latency & Fan-out",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "p99 latency · GET /home", detail: "every backend call is under its SLO" },
    lines: [
      { speaker: "kabir", line: "Every service behind the home page meets its p99, yet a third of users get a slow page. Which service do I blame?" },
      { speaker: "meera", line: "None of them, and all of them. The page waits for forty calls, and it only needs one of them to have a bad day." },
    ],
  },
  predictions: [
    {
      id: "share",
      kind: "choice",
      prompt: "A page waits for 40 backend calls in parallel. Each call is slower than its own p99 about 1% of the time, independently. What share of pages gets at least one such call?",
      options: [
        { id: "p1", label: "About 1%" },
        { id: "p10", label: "About 10%" },
        { id: "p33", label: "About a third" },
        { id: "p99", label: "Almost all of them" },
      ],
      answer: "p33",
      observe: "fanout-bites",
      reveal: {
        text: "The chance that all 40 calls are fast is 0.99 to the 40th power, about 67%. So about 33% of pages see at least one slow call. A rare event per call becomes a common event per page.",
        derived: true,
        line: { speaker: "meera", line: "Rare times many is not rare." },
      },
    },
  ],
  widget: { id: "fanout-lab", config: FANOUT },
  mechanism: [
    {
      id: "multiply",
      scene: "multiply",
      text: "If a call is slow 1% of the time, a page that waits for N independent calls is slow with probability 1 − 0.99^N. At 10 calls that is about 10%, at 40 about 33%, at 100 about 63%. The Tail at Scale paper uses the 100-call case.",
      sourceIds: ["tail-at-scale"],
    },
    {
      id: "percentile",
      scene: "multiply",
      text: "Put differently, the page p99 is each call's 99.97th percentile when there are 40 calls. The extreme tail of the parts becomes the ordinary experience of the whole. The more you fan out, the more the slowest percentile of every dependency matters.",
      derived: true,
    },
    {
      id: "hedge",
      scene: "hedge",
      text: "Hedged requests cut the tail: if a call has not answered after about its p95, send the same request to another replica and use whichever answers first. The paper's BigTable benchmark cut the 99.9th percentile from 1,800ms to 74ms while sending about 2% more requests.",
      sourceIds: ["tail-at-scale"],
    },
    {
      id: "limits",
      text: "Hedging works when slowness is random per call: a GC pause, a noisy neighbour, a busy replica. It does not work when every replica shares the problem. Hedge only idempotent reads, cancel the loser, and cap how much extra load you will add.",
    },
  ],
  challenges: [
    {
      id: "page-p99",
      title: "Pull the page tail in",
      brief: "The home page waits on 40 parallel calls. Each call has a 20ms median and a 120ms p99. Get the page p99 under 150ms while adding at most 10% extra backend load.",
      line: { speaker: "rao", line: "Extra load is extra servers. Spend it where it pays." },
      widget: { id: "fanout-lab", config: { ...FANOUT, title: "Home page · 40 calls" } },
      conditions: [
        { metric: "p99", op: "<", value: 0.15, label: "Page p99 under 150 ms" },
        { metric: "extraLoad", op: "<=", value: 0.1, label: "At most 10% extra backend load" },
      ],
      stars: [{ metric: "extraLoad", op: "<=", value: 0.05, label: "Tail fixed for under 5% extra load" }],
      hints: [
        "Without hedging, where does the page p99 sit compared with one call's p99?",
        "A hedge fires only for calls that are still waiting. The later you fire, the fewer duplicates you send. What is a call's p95?",
        "Too early and you double the load; too late and the tail comes back. There is a window between them.",
      ],
    },
  ],
  explainBack: {
    prompt: "A page makes many parallel calls, and every service meets its p99. Why can the page still be slow often, and what can you do about it?",
    rubric: [
      { id: "multiply", criterion: "The page is as slow as its slowest call, so a small per-call slow rate compounds across N calls", keyIdea: "1 − 0.99^N" },
      { id: "tail", criterion: "Fan-out turns each dependency's extreme tail into the page's common case", keyIdea: "tail becomes body" },
      { id: "fix", criterion: "Names a remedy: hedged requests, fewer calls, or shorter timeouts, and notes a cost or limit", keyIdea: "hedging with a load cap" },
    ],
    exemplar:
      "The page waits for all its calls, so it is slow if any one is slow. A call that is slow 1% of the time makes a 40-call page slow about a third of the time, so the dependency's rare tail becomes the page's common case. Fewer calls helps; so does hedging slow reads to another replica after about the p95, for a few percent more load, as long as the calls are idempotent and the slowness is not shared.",
  },
  reviews: [
    {
      id: "tl-est-share",
      format: "estimate",
      scenario: "A page waits for 20 parallel calls. Each is slower than its own p99 about 1% of the time, independently. What percentage of pages sees at least one such call?",
      unit: "%",
      answer: 18,
      acceptFactor: 1.3,
      breakdown: ["P(all fast) = 0.99^20 ≈ 0.82", "P(at least one slow) = 1 − 0.82", "≈ 18%"],
      explain: "Twenty chances at 1% each is not 20%, because the events overlap, but it is close: about 18%.",
    },
    {
      id: "tl-graph",
      format: "predict-graph",
      scenario: "Calls per page rise from 1 to 200, each call a lognormal with a heavy-ish tail. How does the page p99, as a multiple of one call's p99, change?",
      xLabel: "parallel calls →",
      yLabel: "page p99",
      options: [
        { id: "linear", label: "Straight line up", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "concave", label: "Climbs fast, then flattens", points: [1, 1.8, 2.2, 2.6, 2.9, 3.1, 3.2, 3.3] },
        { id: "flat", label: "Stays flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "convex", label: "Flat, then shoots up", points: [1, 1, 1.1, 1.2, 1.5, 2, 3, 6] },
      ],
      answer: "concave",
      explain: "The first dozen calls push you from p99 to p99.9 of the single-call curve, which is a big jump. After that each extra call moves you only a little further out.",
    },
    {
      id: "tl-pick",
      format: "pick-fix",
      scenario: "A search page fans out to 80 shards. The page p99 is three times a single shard's p99, and shard slowness is random: GC pauses and busy replicas. Which change helps the tail most per unit of extra load?",
      options: [
        { id: "a", label: "Add more shards so each is smaller" },
        { id: "b", label: "Hedge slow shard requests to a replica after about the shard's p95" },
        { id: "c", label: "Raise the client timeout so slow shards finish" },
        { id: "d", label: "Always send every shard request twice" },
      ],
      answer: "b",
      explain: "Hedging fires only for the few calls still waiting, so extra load stays small. Always duplicating doubles the load, and more shards means more fan-out.",
      why: {
        prompt: "Why is hedging after the p95 cheap?",
        options: [
          { id: "a", label: "Only calls slower than the p95 get a duplicate" },
          { id: "b", label: "Duplicates are free on replicas" },
          { id: "c", label: "It removes the slow replica" },
        ],
        answer: "a",
      },
    },
    {
      id: "tl-order",
      format: "order",
      scenario: "Each call is slow 1% of the time. Order these pages by the share of requests that hit at least one slow call, lowest first.",
      items: [
        { id: "n100", label: "100 calls" },
        { id: "n5", label: "5 calls" },
        { id: "n50", label: "50 calls" },
        { id: "n20", label: "20 calls" },
      ],
      answer: ["n5", "n20", "n50", "n100"],
      explain: "About 5%, 18%, 39%, and 63%. The curve bends, but it climbs fast.",
    },
    {
      id: "tl-flaw",
      format: "spot-flaw",
      scenario: "The team enabled hedging on every call the checkout API makes. Tap the call that must not be hedged.",
      diagram: {
        nodes: [
          { id: "web", label: "web", kind: "client", col: 0, row: 1 },
          { id: "api", label: "checkout api", kind: "server", col: 1, row: 1 },
          { id: "catalog", label: "catalog (GET)", kind: "server", col: 2, row: 0 },
          { id: "pay", label: "payments (POST charge)", kind: "external", col: 2, row: 1 },
          { id: "prices", label: "prices (GET)", kind: "cache", col: 2, row: 2 },
        ],
        edges: [
          { from: "web", to: "api" },
          { from: "api", to: "catalog" },
          { from: "api", to: "pay" },
          { from: "api", to: "prices" },
        ],
      },
      answer: "api->pay",
      explain: "A hedged charge can run twice and bill the customer twice, unless the call is idempotent. Hedge safe reads; make writes idempotent before you duplicate them.",
    },
    {
      id: "tl-tune",
      format: "tune",
      scenario: "A 40-call page, calls at 20ms median and 120ms p99. Find the earliest hedge delay that keeps extra load under 10%.",
      tuneScenario: "tl-hedge",
      param: { label: "Hedge after", min: 20, max: 150, step: 5, unit: "ms" },
      target: { metric: "extraLoad", op: "<", value: 0.1, label: "Extra load under 10%" },
      explain: "Hedging earlier trims the tail more but sends more duplicates. The cheapest good setting is the earliest delay your load budget allows, around where only the slowest 8% of calls get a copy.",
    },
    {
      id: "tl-explain",
      format: "explain",
      scenario: "In two sentences: why does a page that makes many parallel calls have a worse p99 than any single call?",
      rubric: [
        { id: "max", criterion: "The page waits for the slowest call, so it is the maximum of many draws" },
        { id: "compound", criterion: "A rare slow event per call becomes common per page as the number of calls grows" },
      ],
      exemplar: "The page finishes only when its slowest call does, so it is the maximum of many latencies. A 1% slow case per call compounds across 40 calls into a third of all pages.",
      explain: "Fan-out is a lottery in which any losing ticket spoils the page.",
    },
  ],
  codex: {
    oneLiner: "A fan-out request is as slow as its slowest call, so each dependency's tail becomes the page's body. Fewer calls and hedging help.",
    keyNumbers: [
      { label: "Pages hit by a 1% tail, 100 calls", value: "63%", sourceId: "tail-at-scale" },
      { label: "Pages hit by a 1% tail, N calls", value: "1 − 0.99^N", sourceId: "tail-at-scale" },
      { label: "Hedged BigTable benchmark, 99.9th pct", value: "1,800ms → 74ms for ~2% more requests", sourceId: "tail-at-scale" },
    ],
    tradeoffs: [
      { choice: "Hedge slow reads", gain: "Cuts the tail sharply for a few percent more load", cost: "Needs idempotent calls and spare replica capacity; useless if slowness is shared" },
      { choice: "Make fewer calls (batch, denormalise)", gain: "Removes tail exposure at the source", cost: "Heavier calls, tighter coupling between services" },
      { choice: "Tighter timeouts with a fallback", gain: "Bounds the worst case", cost: "Some pages ship with a degraded part" },
    ],
    seenIn: [
      "A search results page that queries every index shard and waits for all of them.",
      "A feed assembled from a dozen microservices where the p99 is always worse than any one service's dashboard.",
    ],
    interviewAngle: "When a design fans out, say it: 'the page p99 is roughly each dependency's p99.9, so I would cap the fan-out, set per-call timeouts, and hedge idempotent reads.'",
    aws: [
      { concept: "Percentile latency", service: "CloudWatch percentile statistics (p99)", note: "Alarm on percentiles, not averages" },
      { concept: "Retry and timeout budgets", service: "AWS SDK retry modes and request timeouts" },
    ],
    otherClouds: "GCP: Cloud Monitoring percentile distributions · Azure: Application Insights percentile aggregation",
    replay: { id: "fanout-lab", config: FANOUT, scene: "multiply" },
  },
  interview: [
    "Your service meets its p99 but the page that calls it ten times does not. What is going on?",
    "When is hedging a request a bad idea?",
    "How would you set a timeout for one of forty parallel calls?",
  ],
  deeper: [
    {
      title: "Why the page p99 is the call's p99.97",
      body: "If calls are independent and the page waits for all N, then P(page ≤ x) = F(x)^N. Setting that to 0.99 gives F(x) = 0.99^(1/N). For N = 40, F(x) = 0.99975: the page p99 is the single-call p99.975. For N = 100 it is the p99.99. Everything in the extreme tail of your dependencies is now in the page's ordinary range.",
      derived: true,
    },
    {
      title: "Tied requests and other cousins of hedging",
      body: "Google's paper also describes tied requests: send the request to two replicas at once, each tagged with the other's identity, and let whichever starts first cancel the other. That keeps the latency win of duplication while avoiding most of the double work. Micro-partitioning and selective replication of hot items attack the same problem from the data side.",
      sourceIds: ["tail-at-scale"],
    },
  ],
  honestPhysics: [
    "Calls are modelled as independent lognormals. Real calls share hosts, caches, and databases, so their slowness is correlated and the true page tail is usually worse.",
    "Hedging here goes to an equally healthy replica. If that replica is just as loaded, the duplicate arrives late and only adds load.",
  ],
  sources: [TAIL],
  verify: [
    { id: "third", claim: "A 40-call page sees at least one slow call about a third of the time", run: "lab", params: { model: "fanout-lab", config: FANOUT, values: { calls: 40, hedgeMs: 0 }, metric: "slowShare" }, expect: { min: 0.32, max: 0.34 } },
    { id: "plain-fails", claim: "Without hedging the 40-call page p99 is far above 150ms", run: "lab", params: { model: "fanout-lab", config: FANOUT, values: { calls: 40, hedgeMs: 0 }, metric: "p99" }, expect: { min: 0.25 } },
    { id: "hedge-wins", claim: "Hedging after 75ms brings the page p99 under 150ms", run: "lab", params: { model: "fanout-lab", config: FANOUT, values: { calls: 40, hedgeMs: 75 }, metric: "p99" }, expect: { max: 0.15 } },
    { id: "hedge-cheap", claim: "Hedging after 75ms adds under 5% load", run: "lab", params: { model: "fanout-lab", config: FANOUT, values: { calls: 40, hedgeMs: 75 }, metric: "extraLoad" }, expect: { max: 0.05 } },
    { id: "too-early", claim: "Hedging after 40ms costs more than 10% extra load", run: "lab", params: { model: "fanout-lab", config: FANOUT, values: { calls: 40, hedgeMs: 40 }, metric: "extraLoad" }, expect: { min: 0.1 } },
  ],
});
