import { definePack } from "../define";

export const BULK = { lockDegraded: false, start: { layout: "shared", aShare: 0.2, degraded: false } };
export const BULK_CHALLENGE = { lockDegraded: true, start: { layout: "shared", aShare: 0.5, degraded: true } };

const AZURE_BULKHEAD = { id: "azure-bulkhead", title: "Microsoft Azure Architecture Center: Bulkhead pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead" };
const NYGARD = { id: "nygard-release-it", title: "M. Nygard, Release It! 2nd ed. (bulkheads, steady state, fail fast)", url: "https://pragprog.com/titles/mnee2/release-it-second-edition/" };
const ERLANG = { id: "erlang-b", title: "Erlang B formula: blocking probability of a loss system (Wikipedia, Erlang (unit))", url: "https://en.wikipedia.org/wiki/Erlang_(unit)" };

export default definePack({
  id: "bulkheads",
  title: "Bulkheads",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "profile-api · 60% of requests rejected", detail: "only the avatar service is slow" },
    lines: [
      { speaker: "kabir", line: "Avatars are slow, which is annoying but not fatal. The whole profile API is down, including the endpoints that never touch avatars." },
      { speaker: "meera", line: "All the calls share one pool of workers. The slow ones are holding every worker, so the fast ones have nowhere to stand." },
    ],
  },
  predictions: [
    {
      id: "collapse",
      kind: "choice",
      prompt: "A service has 100 worker slots. Calls to A take 20 ms (5.6 slots busy on average). Calls to B arrive at 120 a second and suddenly take 2 seconds each. All calls share the pool. What share of the healthy A calls is rejected?",
      options: [
        { id: "none", label: "None: A is unaffected" },
        { id: "five", label: "About 5%" },
        { id: "sixty", label: "About 60%" },
        { id: "all", label: "Practically all" },
      ],
      answer: "sixty",
      observe: "collapse",
      reveal: {
        text: "B's slow calls need 240 slots' worth of capacity and the pool has 100, so the pool is nearly always full. A call is rejected whenever it arrives to a full pool, whichever dependency it is for: 60% of all calls, A included.",
        derived: true,
        line: { speaker: "meera", line: "The pool does not know which calls are healthy. It only knows it is full." },
      },
    },
    {
      id: "isolated",
      kind: "choice",
      prompt: "You reserve 20 of the 100 slots for A and give B the other 80. How many of A's calls are rejected while B is slow?",
      options: [
        { id: "sixty", label: "Still about 60%" },
        { id: "twenty", label: "About 20%" },
        { id: "one", label: "About 1%" },
        { id: "zero", label: "Practically none" },
      ],
      answer: "zero",
      observe: "isolated",
      reveal: {
        text: "A needs about 5.6 slots on average and has 20, so it almost never finds its pool full: the chance is about one in a million. B's calls queue up in their own 80 slots, and B alone suffers.",
        derived: true,
        line: { speaker: "kabir", line: "One dependency down, one feature down, not both." },
      },
    },
  ],
  widget: { id: "bulkhead-lab", config: BULK },
  mechanism: [
    {
      id: "shared",
      scene: "shared",
      text: "A shared pool of workers, connections or threads is efficient while everything is healthy and fatal when one dependency is slow. Slow calls hold their slot for a long time, the pool fills up, and fast calls to healthy dependencies are rejected along with them.",
      sourceIds: ["nygard-release-it", "azure-bulkhead"],
    },
    {
      id: "split",
      scene: "split",
      text: "A bulkhead, named after the sealed compartments of a ship, gives each dependency its own pool. If B floods its compartment, the water stays there. A's slots remain free, and the service keeps working for everything that does not need B.",
      sourceIds: ["azure-bulkhead"],
    },
    {
      id: "size",
      scene: "size",
      text: "Size each pool from its load: a pool needs about the average number of busy slots (calls per second times duration) plus headroom for bursts. Erlang's loss formula gives the rejection rate for a given pool size. A pool of 20 for a load of 5.6 rejects almost nothing.",
      sourceIds: ["erlang-b"],
      derived: true,
    },
    {
      id: "cost",
      text: "Isolation has a price. Slots reserved for A sit idle when A is quiet, even if B could use them, so total utilisation is lower. Keep the compartments to the few dependencies that can hurt you, and pair them with timeouts and breakers so a full pool also drains.",
      sourceIds: ["nygard-release-it"],
    },
  ],
  challenges: [
    {
      id: "pools",
      title: "Split the pool",
      brief: "B is degraded and every call takes 2 seconds. Divide the 100 slots so at most 0.1% of calls to A are rejected, and at most 70% of calls to B are rejected.",
      line: { speaker: "rao", line: "B is not going to be saved by giving it more. A can be." },
      widget: { id: "bulkhead-lab", config: BULK_CHALLENGE },
      conditions: [
        { metric: "aBlock", op: "<=", value: 0.001, label: "At most 0.1% of A's calls rejected" },
        { metric: "bBlock", op: "<=", value: 0.7, label: "At most 70% of B's calls rejected" },
      ],
      stars: [{ metric: "bBlock", op: "<=", value: 0.66, label: "At most 66% of B's calls rejected" }],
      hints: [
        "How many slots does A need on average, and how many for it to almost never be full?",
        "Every slot A does not need could go to B.",
        "First switch from a shared pool to separate ones.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what a bulkhead protects against and what it costs.",
    rubric: [
      { id: "why", criterion: "In a shared pool a slow dependency's calls hold the slots, so calls to healthy dependencies are rejected too", keyIdea: "one slow dependency exhausts a shared pool" },
      { id: "split", criterion: "Separate pools per dependency contain the damage to the one that is slow", keyIdea: "separate compartments" },
      { id: "cost", criterion: "Reserved slots sit idle when their dependency is quiet, so total capacity is used less efficiently", keyIdea: "reserved capacity" },
    ],
    exemplar:
      "With one shared pool of workers, a slow dependency holds its slots for a long time, the pool fills and calls to healthy dependencies are rejected as well. Giving each dependency its own pool contains the problem, so only the slow one suffers. The cost is that reserved slots sit idle when their dependency is quiet, so I size each pool from its load and only isolate the dependencies that can hurt me.",
  },
  reviews: [
    {
      id: "bh-est",
      format: "estimate",
      scenario: "Calls to a dependency arrive at 50 a second and take 400 ms each. About how many slots are busy on average? (Little's law)",
      unit: "slots",
      answer: 20,
      acceptFactor: 1.05,
      breakdown: ["L = λ × W", "50 × 0.4 s", "= 20 slots"],
      explain: "Average slots busy is arrival rate times time held. When the time grows tenfold the demand does too.",
    },
    {
      id: "bh-pick",
      format: "pick-fix",
      scenario: "A service with one thread pool shares it between a payments call (fast, critical) and a recommendations call (slow when overloaded). Recommendations slow down and payments start failing. What is the right fix?",
      options: [
        { id: "a", label: "Give recommendations its own small pool, separate from payments" },
        { id: "b", label: "Double the shared pool" },
        { id: "c", label: "Retry payments more often" },
        { id: "d", label: "Remove timeouts from recommendations" },
      ],
      answer: "a",
      explain: "A bigger pool only delays the same exhaustion. Isolating the optional call protects the critical one.",
    },
    {
      id: "bh-order",
      format: "order",
      scenario: "Order these pools for dependency A (5.6 slots busy on average) by how many of A's calls are rejected, most first.",
      items: [
        { id: "five", label: "5 slots" },
        { id: "ten", label: "10 slots" },
        { id: "twenty", label: "20 slots" },
      ],
      answer: ["five", "ten", "twenty"],
      explain: "A pool smaller than the average load is full most of the time. Doubling the average already rejects only a few percent, and a few times the average rejects almost none.",
    },
    {
      id: "bh-graph",
      format: "predict-graph",
      scenario: "B is degraded. As you give A a larger share of the 100 slots, from 5% to 50%, how does the share of A's calls rejected change?",
      xLabel: "slots reserved for A →",
      yLabel: "A's calls rejected",
      options: [
        { id: "cliff", label: "Very high at first, then falls steeply to almost zero", points: [33, 3, 0.1, 0, 0, 0, 0, 0] },
        { id: "linear", label: "Falls steadily in a line", points: [60, 52, 44, 36, 28, 20, 12, 4] },
        { id: "flat", label: "Stays flat", points: [20, 20, 20, 20, 20, 20, 20, 20] },
      ],
      answer: "cliff",
      explain: "Once the pool is a few times larger than the average load, it is almost never full. Extra slots beyond that add nothing for A and are better given to B.",
    },
    {
      id: "bh-flaw",
      format: "spot-flaw",
      scenario: "An API uses one connection pool of 50 for its main database and a reporting database. A slow report query holds connections for 30 seconds each. Checkout starts failing. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "checkout", label: "checkout queries", kind: "client", col: 0, row: 0 },
          { id: "report", label: "report queries (slow)", kind: "client", col: 0, row: 2 },
          { id: "pool", label: "one pool of 50", kind: "server", col: 1, row: 1 },
        ],
        edges: [
          { from: "checkout", to: "pool" },
          { from: "report", to: "pool" },
        ],
      },
      answer: "report->pool",
      explain: "Reports and checkout compete for the same 50 connections. Slow reports should use a small separate pool so they cannot starve checkout.",
    },
    {
      id: "bh-explain",
      format: "explain",
      scenario: "In two sentences: why isn't one big shared pool the safest design?",
      rubric: [
        { id: "fill", criterion: "A slow dependency holds slots for a long time and fills the pool, and then every call is rejected, healthy ones included" },
        { id: "contain", criterion: "Separate pools keep the damage inside the pool of the slow dependency" },
      ],
      exemplar: "In a shared pool, calls to a slow dependency hold their slots so long that the pool fills and healthy calls are rejected too. Separate pools keep the damage inside the pool of the slow dependency.",
      explain: "Shared resources spread failure.",
    },
  ],
  codex: {
    oneLiner: "Give each dependency its own pool of workers or connections, so one slow dependency can exhaust only its own slots.",
    keyNumbers: [
      { label: "Slots busy on average", value: "calls per second × time held", sourceId: "erlang-b" },
      { label: "A shared pool of 100 with 245 slots of demand rejects", value: "about 60% of all calls", sourceId: "erlang-b" },
    ],
    tradeoffs: [
      { choice: "Shared pool", gain: "Best utilisation when healthy", cost: "One slow dependency can starve all" },
      { choice: "Separate pools", gain: "Failure stays local", cost: "Reserved slots sit idle" },
      { choice: "Bulkhead plus breaker and timeout", gain: "Compartments drain as well as hold", cost: "More settings to tune" },
    ],
    seenIn: ["Resilience4j and Hystrix thread-pool isolation.", "Separate connection pools for read-heavy reports."],
    interviewAngle: "Say: 'bulkhead per dependency, sized from calls per second times duration, with timeouts and breakers so the compartments drain'.",
    aws: [{ concept: "Separate target groups and connection pools", service: "ALB / RDS Proxy" }],
    replay: { id: "bulkhead-lab", config: { lockDegraded: false, start: { layout: "isolated", aShare: 0.2, degraded: true } }, scene: "split" },
  },
  interview: [
    "What is the bulkhead pattern?",
    "How would you size the pools?",
    "What does isolation cost you?",
  ],
  deeper: [
    {
      title: "Bulkheads at larger scales",
      body: "The same idea works above the process. Separate clusters per customer tier, cells that each serve a slice of users, and per-region deployments all limit how far one failure spreads. The trade is always the same: more isolation means more spare capacity held in reserve.",
      sourceIds: ["azure-bulkhead"],
    },
  ],
  honestPhysics: [
    "A service has 100 worker slots. A takes 280 calls a second at 20 ms each (5.6 slots busy on average). B takes 120 calls a second and, when degraded, 2 seconds each (240 slots of demand).",
    "A call that finds no free slot is rejected. Blocking is the Erlang B loss formula, exact for random arrivals and any service times; in a shared pool every call faces the same blocking.",
    "When B is healthy its demand is only 2.4 slots.",
  ],
  sources: [AZURE_BULKHEAD, NYGARD, ERLANG],
  verify: [
    { id: "shared", claim: "In a shared pool, a slow B causes about 60% of calls, A's included, to be rejected", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "shared" }, metric: "aBlock" }, expect: { min: 0.55, max: 0.65 } },
    { id: "iso", claim: "With 20 reserved slots, A's rejections are about one in a million", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "isolated", aShare: 0.2 }, metric: "aBlock" }, expect: { max: 0.00001 } },
    { id: "iso-b", claim: "…while B loses about 67%", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "isolated", aShare: 0.2 }, metric: "bBlock" }, expect: { min: 0.65, max: 0.7 } },
    { id: "small", claim: "A pool of 5 for A rejects a third of its calls", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "isolated", aShare: 0.05 }, metric: "aBlock" }, expect: { min: 0.3 } },
    { id: "edge", claim: "14 reserved slots just miss the 0.1% target", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "isolated", aShare: 0.14 }, metric: "aBlock" }, expect: { min: 0.001 } },
    { id: "too-big", claim: "Reserving 30 slots for A pushes B's rejections past 70%", run: "lab", params: { model: "bulkhead-lab", config: BULK_CHALLENGE, values: { layout: "isolated", aShare: 0.3 }, metric: "bBlock" }, expect: { min: 0.7 } },
    { id: "healthy", claim: "While B is healthy the shared pool rejects almost nothing", run: "lab", params: { model: "bulkhead-lab", config: BULK, values: { layout: "shared", degraded: false }, metric: "aBlock" }, expect: { max: 0.001 } },
  ],
});
