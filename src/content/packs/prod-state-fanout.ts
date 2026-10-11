import { definePack } from "../define";

export const FO = { start: { slow: 0, timeout: 5, attempts: 3, bulkhead: false, partial: false, shed: false } };
export const FO_CHALLENGE = { lockSlow: true, start: { slow: 3, timeout: 5, attempts: 3, bulkhead: false, partial: false, shed: false } };

const BULKHEAD = { id: "azure-bulkhead", title: "Azure Architecture Center: Bulkhead pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead" };
const TIMEOUTS = { id: "aws-timeouts-retries", title: "AWS Builders' Library: Timeouts, retries and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };
const SHED = { id: "aws-load-shedding", title: "AWS Builders' Library: Using load shedding to avoid overload", url: "https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/" };
const TAIL = { id: "tail-at-scale", title: "Dean and Barroso (2013), The Tail at Scale", url: "https://research.google/pubs/the-tail-at-scale/" };

export default definePack({
  id: "prod-state-fanout",
  title: "Production: State-wide Fan-out",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "state-wide lookup · timeouts for every district", detail: "three district services slow; all forty failing" },
    lines: [
      { speaker: "kabir", line: "One request asks all forty district systems a question. Three of them went slow, and now the thirty-seven healthy ones time out too." },
      { speaker: "meera", line: "They share a pool of threads. The slow ones are holding most of it, and the healthy ones are queueing behind them." },
    ],
  },
  predictions: [
    {
      id: "starve",
      kind: "choice",
      prompt: "A request fans out to 40 districts, 5 times a second, through one pool of 100 threads. Three districts hang for 10 s. Calls time out at 5 s, up to 3 attempts. What share of the 37 healthy districts is still answered?",
      options: [
        { id: "all", label: "About 99%: only three districts are slow" },
        { id: "most", label: "About 80%" },
        { id: "some", label: "About 38%" },
        { id: "few", label: "About 14%" },
      ],
      answer: "few",
      observe: "starved",
      reveal: {
        text: "The slow calls arrive at 15 a second and each holds a thread for 5 s × 3 attempts: 225 threads against a pool of 100. Healthy calls get about 38% of what they need, and with no shedding callers give up, taking it to about 14%.",
        derived: true,
        line: { speaker: "meera", line: "Rate times hold time is threads in use. Retries multiply the hold time." },
      },
    },
    {
      id: "contain",
      kind: "choice",
      prompt: "You cap each district at 8 threads (a bulkhead). The same three districts are still slow. What share of healthy districts is reached now?",
      options: [
        { id: "same", label: "About 14%: nothing changed for the slow ones" },
        { id: "half", label: "About 50%" },
        { id: "all", label: "About 99%" },
      ],
      answer: "all",
      observe: "contained",
      reveal: {
        text: "The slow districts can now hold at most 24 threads between them, and the healthy ones need about 40 of the 100. The pool has room, so every healthy district is reached. The slow ones still fail, and now only for themselves.",
        derived: true,
        line: { speaker: "rao", line: "Three bad districts is a partial answer, not an outage." },
      },
    },
  ],
  widget: { id: "fanout-guard-lab", config: FO },
  mechanism: [
    {
      id: "pool",
      scene: "no-guard",
      text: "A shared pool is shared fate. Threads in use equal arrival rate times how long each call holds one (Little's Law). A call to a hung district holds a thread for the whole timeout, and each retry holds another one, so a few slow dependencies can claim the pool.",
      sourceIds: ["aws-timeouts-retries", "tail-at-scale"],
    },
    {
      id: "timeouts",
      text: "Retries and long timeouts both lengthen the hold. A 5 s timeout with 3 attempts holds a thread 15 s per call. Choose timeouts from what a healthy call takes (200 ms here), not from the slowest thing you have seen, and retry only what is cheap and likely to succeed.",
      sourceIds: ["aws-timeouts-retries"],
    },
    {
      id: "bulkhead",
      scene: "bulkhead",
      text: "A bulkhead limits how much of a shared resource one dependency can use, like the watertight compartments of a ship. With at most 8 threads per district, a slow district fails on its own and the pool stays available to the rest.",
      sourceIds: ["azure-bulkhead"],
    },
    {
      id: "partial",
      scene: "partial",
      text: "Do not wait for the slowest district. Answer with the districts that responded and say which ones did not, and shed work when the pool is full so the queue does not grow past what anyone will wait for. A fast partial answer beats a slow complete one that never comes.",
      sourceIds: ["aws-load-shedding", "tail-at-scale"],
    },
  ],
  challenges: [
    {
      id: "contain-slow",
      title: "Survive three slow districts",
      brief: "Three of the 40 districts are hanging. Configure timeouts, retries and guards so at least 97% of healthy districts are reached, the answer comes back within a second, a slow district is called at most 1.5 times per request, and the pool is at most 70% used.",
      line: { speaker: "rao", line: "Give me an answer in a second, and tell me which districts did not respond." },
      widget: { id: "fanout-guard-lab", config: FO_CHALLENGE },
      conditions: [
        { metric: "healthyReach", op: ">=", value: 0.97, label: "At least 97% of healthy districts reached" },
        { metric: "answerSeconds", op: "<=", value: 1, label: "Answer within a second" },
        { metric: "amplification", op: "<=", value: 1.5, label: "A slow district is called at most 1.5 times" },
        { metric: "poolUsed", op: "<=", value: 0.7, label: "Pool at most 70% in use" },
      ],
      stars: [{ metric: "slowThreads", op: "<=", value: 10, label: "Slow districts hold at most 10 threads" }],
      hints: [
        "What does a healthy district take? Is a 5 s timeout justified?",
        "Each retry holds another thread for the whole timeout. How many attempts does a hung district deserve?",
        "Which setting lets the answer go out without waiting for the slowest district?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how a few slow dependencies can take down a fan-out, and how you contain them.",
    rubric: [
      { id: "shared", criterion: "Calls share one pool of threads, and a hung dependency holds threads for the whole timeout, multiplied by retries, so slow calls starve healthy ones", keyIdea: "shared pool starvation" },
      { id: "contain", criterion: "Contain with a bulkhead (a per-dependency cap), short timeouts based on healthy latency, and few retries", keyIdea: "bulkhead and timeouts" },
      { id: "degrade", criterion: "Return a partial answer and shed work when full, instead of waiting for the slowest dependency", keyIdea: "partial results" },
    ],
    exemplar:
      "All the calls share one pool of threads. A hung district holds a thread for the entire timeout, and every retry holds another, so by Little's Law a few slow dependencies can want more threads than the pool has and starve the healthy ones. I would cap each dependency with a bulkhead, set timeouts from healthy latency, retry rarely, shed work when the pool is full, and return a partial answer that says which districts did not respond.",
  },
  reviews: [
    {
      id: "fo-est",
      format: "estimate",
      scenario: "Three slow districts are each called 5 times a second. Each call holds a thread for 5 s (the timeout), with one attempt. How many threads do they hold in total?",
      unit: "threads",
      answer: 75,
      acceptFactor: 1.1,
      breakdown: ["calls a second: 3 × 5 = 15", "hold time 5 s each", "threads = 15 × 5 = 75"],
      explain: "Rate times hold time is the number of threads in use, which is Little's Law.",
    },
    {
      id: "fo-pick",
      format: "pick-fix",
      scenario: "A fan-out calls 40 services through one shared thread pool. One service hangs and the whole fan-out starts timing out. What is the best first change?",
      options: [
        { id: "a", label: "Cap each service's share of the pool (a bulkhead) and shorten the timeout" },
        { id: "b", label: "Raise the pool size and the timeout" },
        { id: "c", label: "Retry every failed call five times" },
        { id: "d", label: "Restart the fan-out service" },
      ],
      answer: "a",
      explain: "A bulkhead keeps one dependency from using the pool, and a short timeout shortens how long it can try. A bigger pool and longer timeout only delay the same problem, and retries add threads held.",
    },
    {
      id: "fo-order",
      format: "order",
      scenario: "Three slow districts get 15 calls a second. Order these settings by threads held, highest first.",
      items: [
        { id: "three", label: "Timeout 2 s, 3 attempts" },
        { id: "one5", label: "Timeout 5 s, 1 attempt" },
        { id: "one1", label: "Timeout 1 s, 1 attempt" },
      ],
      answer: ["three", "one5", "one1"],
      explain: "Threads held = 15 × timeout × attempts: 90, 75 and 15. Three short attempts hold more than one long one.",
    },
    {
      id: "fo-graph",
      format: "predict-graph",
      scenario: "With no bulkhead, as you raise the number of slow districts from 0 to 10 (timeout 5 s, 3 attempts), how does the share of healthy districts reached change?",
      xLabel: "slow districts →",
      yLabel: "healthy districts reached",
      options: [
        { id: "cliff", label: "Stays high for a moment, then collapses once the pool is full", points: [99, 38, 14, 5, 3, 2, 1, 1] },
        { id: "linear", label: "Falls in a straight line", points: [99, 86, 73, 60, 47, 34, 21, 8] },
        { id: "flat", label: "Stays flat", points: [99, 99, 99, 99, 99, 99, 99, 99] },
      ],
      answer: "cliff",
      explain: "Until the slow districts want more than the pool has, nothing changes. After that the healthy ones are starved, and it gets worse quickly because the shortfall squares.",
    },
    {
      id: "fo-flaw",
      format: "spot-flaw",
      scenario: "A state-wide lookup waits for all 40 districts before replying to the user. One district is down and the user waits the full timeout every time. Tap the step that causes it.",
      diagram: {
        nodes: [
          { id: "user", label: "user request", kind: "client", col: 0, row: 1 },
          { id: "fan", label: "fan-out service (waits for all)", kind: "server", col: 1, row: 1 },
          { id: "d", label: "district service (down)", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "user", to: "fan" },
          { from: "fan", to: "d" },
        ],
      },
      answer: "fan->d",
      explain: "Waiting for every dependency makes the answer as slow as the slowest. Return what you have by a deadline and name the districts that did not respond.",
    },
    {
      id: "fo-explain",
      format: "explain",
      scenario: "In two sentences: why is a longer timeout often worse than a shorter one in a fan-out?",
      rubric: [
        { id: "hold", criterion: "A longer timeout makes every failing call hold a worker for longer, so slow dependencies use more of a shared pool" },
        { id: "healthy", criterion: "Timeouts should come from healthy latency; waiting longer rarely turns a hung call into a good one" },
      ],
      exemplar: "A longer timeout makes every call to a hung dependency hold a worker thread for longer, so it consumes more of the shared pool and starves healthy calls. A timeout should be set from what a healthy call takes, because waiting longer almost never rescues a hung one.",
      explain: "Timeouts are a resource limit as much as a failure signal.",
    },
  ],
  codex: {
    oneLiner: "A fan-out is as available as its worst shared resource. Short timeouts, few retries, bulkheads, shedding and partial answers stop slow dependencies becoming an outage.",
    keyNumbers: [
      { label: "Threads in use", value: "arrival rate × time each call holds one", sourceId: "aws-timeouts-retries" },
      { label: "Call time with retries", value: "timeout × attempts", sourceId: "aws-timeouts-retries" },
    ],
    tradeoffs: [
      { choice: "Bulkhead per dependency", gain: "Failure stays local", cost: "Unused capacity in one compartment cannot help another" },
      { choice: "Short timeout", gain: "Frees threads fast", cost: "Some slow but valid answers are given up on" },
      { choice: "Partial results", gain: "Fast answer even when a dependency is down", cost: "Callers must handle missing parts" },
    ],
    seenIn: ["Search and recommendation services that query many shards.", "National and state data aggregation across independent systems."],
    interviewAngle: "Say: 'Little's Law on the pool, a bulkhead per dependency, timeouts from healthy p99, retries capped and jittered, shed when full, and return partial results with the failures named'.",
    aws: [{ concept: "Bulkheads and timeouts at the edge of a service", service: "Resilience4j, Envoy or App Mesh circuit breaking" }],
    replay: { id: "fanout-guard-lab", config: FO_CHALLENGE, scene: "bulkhead" },
  },
  interview: [
    "A request fans out to 40 services and one is slow. What happens and how do you prevent it?",
    "How do timeouts and retries interact with a thread pool?",
    "What is a bulkhead and where would you put one?",
  ],
  deeper: [
    {
      title: "Hedged requests and the tail",
      body: "When many parallel calls are needed, the slowest one decides the response time. Sending a duplicate of a slow-looking call to another replica after a short delay (a hedged request) trims the tail at a small cost in extra load. It only helps when the slowness is random, not when a dependency is down.",
      sourceIds: ["tail-at-scale"],
    },
  ],
  honestPhysics: [
    "Forty district services, 5 requests a second, one shared pool of 100 threads. A healthy district answers in 200 ms; a slow one takes 10 s, or until your timeout, and fails 30% of the time. Threads in use are rate × hold time; a bulkhead caps a slow district at 8 threads.",
    "Over capacity, every call gets only its share of the pool; with no shedding the queue makes callers give up, and reach falls with the square of the share. These are round figures for the shape of the failure, not measurements.",
  ],
  sources: [BULKHEAD, TIMEOUTS, SHED, TAIL],
  verify: [
    { id: "starve", claim: "Three slow districts with a 5 s timeout and 3 attempts starve the healthy ones down to about 14%", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 3, timeout: 5, attempts: 3 }, metric: "healthyReach" }, expect: { min: 0.13, max: 0.16 } },
    { id: "contain", claim: "A bulkhead restores healthy reach to 99%", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 3, timeout: 5, attempts: 3, bulkhead: true }, metric: "healthyReach" }, expect: { min: 0.98 } },
    { id: "amp", claim: "Three attempts call a hung district three times per request", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 3, timeout: 5, attempts: 3 }, metric: "amplification" }, expect: { min: 2.9, max: 3.1 } },
    { id: "wait", claim: "Waiting for a hung district costs 15 s (5 s × 3)", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 3, timeout: 5, attempts: 3, partial: false }, metric: "answerSeconds" }, expect: { min: 14.9, max: 15.1 } },
    { id: "partial", claim: "Answering with partial results takes half a second", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 3, timeout: 5, attempts: 3, partial: true }, metric: "answerSeconds" }, expect: { min: 0.4, max: 0.6 } },
    { id: "healthy", claim: "With no slow districts the pool is 40% used", run: "lab", params: { model: "fanout-guard-lab", config: FO, values: { slow: 0 }, metric: "poolUsed" }, expect: { min: 0.39, max: 0.41 } },
    { id: "solve", claim: "A 1 s timeout, 1 attempt, bulkhead and partial results pass the challenge", run: "lab", params: { model: "fanout-guard-lab", config: FO_CHALLENGE, values: { timeout: 1, attempts: 1, bulkhead: true, partial: true }, metric: "healthyReach" }, expect: { min: 0.97 } },
  ],
});
