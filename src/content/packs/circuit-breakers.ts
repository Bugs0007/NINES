import { definePack } from "../define";

export const BREAKER = { start: { thr: 0.9, window: 30, openS: 10, probes: 3 } };

const FOWLER = { id: "fowler-cb", title: "M. Fowler: CircuitBreaker", url: "https://martinfowler.com/bliki/CircuitBreaker.html" };
const AZURE_CB = { id: "azure-cb", title: "Microsoft Azure Architecture Center: Circuit Breaker pattern (closed, open, half-open)", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker" };
const NYGARD = { id: "nygard-release-it", title: "M. Nygard, Release It! 2nd ed. (circuit breaker, fail fast)", url: "https://pragprog.com/titles/mnee2/release-it-second-edition/" };

export default definePack({
  id: "circuit-breakers",
  title: "Circuit Breakers",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "checkout · recommendations service timing out", detail: "every page waits 3 s, then fails" },
    lines: [
      { speaker: "kabir", line: "The recommendations service is down, and checkout, which only wanted to show a few suggestions, now takes three seconds per page and keeps failing." },
      { speaker: "meera", line: "Everyone is still knocking on a door that nobody answers. A breaker stops the knocking and lets us carry on without it." },
    ],
  },
  predictions: [
    {
      id: "calls",
      kind: "choice",
      prompt: "A dependency is dead for a minute and you call it 100 times a second, 6,000 calls. A breaker opens when 50% of the last 5 seconds' calls failed, and probes with 3 calls every 10 seconds. How many calls still reach the dead dependency?",
      options: [
        { id: "few", label: "About 30" },
        { id: "some", label: "About 300" },
        { id: "many", label: "About 3,000" },
        { id: "all", label: "All 6,000" },
      ],
      answer: "some",
      observe: "tripped",
      reveal: {
        text: "It takes about three seconds for half of a five-second window to fill with failures, which is 300 calls before the breaker opens. After that only a few probes every ten seconds reach the dead service, about a dozen more. The rest are refused instantly.",
        derived: true,
        line: { speaker: "meera", line: "A breaker turns a minute of failures into a few seconds of them." },
      },
    },
    {
      id: "noise",
      kind: "choice",
      prompt: "The dependency normally fails 8% of calls. You set the breaker to open at 10% errors over 3 seconds. What happens while it is healthy?",
      options: [
        { id: "calm", label: "Nothing: 8% is under 10%" },
        { id: "trips", label: "It trips on random noise, again and again" },
        { id: "never", label: "It never opens, even in an outage" },
      ],
      answer: "trips",
      observe: "flapped",
      reveal: {
        text: "With 100 calls a second, an 8% failure rate varies from second to second by about 3 points, so 3-second averages regularly cross 10%. The breaker trips on noise, rejects healthy traffic, and probes can fail the same way. The threshold must sit well above normal.",
        derived: true,
        line: { speaker: "rao", line: "A breaker that opens when nothing is wrong is its own outage." },
      },
    },
  ],
  widget: { id: "breaker-lab", config: BREAKER },
  mechanism: [
    {
      id: "why",
      text: "When a dependency is failing, more calls make things worse: each one ties up a thread for the whole timeout, and a struggling service gets no room to recover. A circuit breaker watches the failure rate and, past a threshold, stops calling at all for a while.",
      sourceIds: ["fowler-cb", "nygard-release-it"],
    },
    {
      id: "states",
      scene: "open",
      text: "A breaker has three states. Closed: calls pass, failures are counted. Open: calls are rejected immediately without reaching the dependency, for a set time. Half-open: a few probe calls are allowed through; if they succeed the breaker closes, and if not it opens again.",
      sourceIds: ["azure-cb", "fowler-cb"],
    },
    {
      id: "tune",
      scene: "noise",
      text: "The settings balance two mistakes. A threshold or window that is too sensitive trips on ordinary noise. One that is too slow lets hundreds of calls pile into a dead dependency first. A long open time delays recovery after the dependency heals, by up to the whole open period.",
      sourceIds: ["azure-cb"],
      derived: true,
    },
    {
      id: "fallback",
      scene: "half",
      text: "An open breaker is only useful if the caller has a plan: a cached value, a default, a reduced page, or a clear error. Decide the fallback for each dependency, and make the breaker's state visible, since an open breaker means a dependency is down.",
      sourceIds: ["fowler-cb", "nygard-release-it"],
    },
  ],
  challenges: [
    {
      id: "breaker-settings",
      title: "Set the breaker",
      brief: "A flaky dependency with 8% background errors fails completely for about a minute. Choose the settings so at most 600 calls reach it during the outage, the breaker never trips while it is healthy, and calls resume within 12 seconds of its recovery on average.",
      line: { speaker: "kabir", line: "I want it to notice quickly, ignore the noise, and not sit shut once the service is back." },
      widget: { id: "breaker-lab", config: BREAKER },
      conditions: [
        { metric: "callsToDead", op: "<=", value: 600, label: "At most 600 calls reach the dead dependency" },
        { metric: "falseTrips", op: "<=", value: 0, label: "No trips while healthy" },
        { metric: "recoveryLagS", op: "<=", value: 12, label: "Resumes within 12 s on average" },
      ],
      stars: [{ metric: "callsToDead", op: "<=", value: 200, label: "At most 200 calls reach it" }],
      hints: [
        "How long does the window take to fill with enough failures to cross the threshold?",
        "How far above the 8% background rate does the threshold need to sit?",
        "How long should the breaker stay open if you want it to resume within about a dozen seconds?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how a circuit breaker works and what its settings trade off.",
    rubric: [
      { id: "states", criterion: "Closed passes calls, open rejects them quickly, half-open lets probes through to test recovery", keyIdea: "closed, open, half-open" },
      { id: "why", criterion: "It stops a failing dependency from tying up the caller's threads and gives it room to recover", keyIdea: "fail fast, protect both sides" },
      { id: "tune", criterion: "Too sensitive trips on noise; too slow lets many calls in; long open time delays recovery", keyIdea: "sensitivity versus delay" },
    ],
    exemplar:
      "A circuit breaker has three states. While closed it lets calls through and counts failures; past a threshold it opens and rejects calls immediately, which frees the caller's threads and gives the dependency room to recover; after a pause it goes half-open and lets a few probes through, closing again if they succeed. The settings trade off: too sensitive and it trips on noise, too slow and many calls pile into a dead service, and a long open time delays recovery.",
  },
  reviews: [
    {
      id: "cb-est",
      format: "estimate",
      scenario: "A dependency fails for 90 seconds while you send it 200 calls a second. With no breaker every call waits 2 seconds before failing. About how many thread-seconds are tied up in total?",
      unit: "thread-seconds",
      answer: 36000,
      acceptFactor: 1.05,
      breakdown: ["200 × 90 = 18,000 calls", "× 2 s each", "= 36,000 thread-seconds"],
      explain: "With 36,000 thread-seconds over 90 seconds, about 400 threads are blocked at once. A breaker would cut this to a handful.",
    },
    {
      id: "cb-pick",
      format: "pick-fix",
      scenario: "The breaker opens during a brief blip and stays open for 5 minutes, long after the dependency recovered. What is the best change?",
      options: [
        { id: "a", label: "Shorten the open time so probes check for recovery sooner" },
        { id: "b", label: "Remove the breaker" },
        { id: "c", label: "Raise the failure threshold to 100%" },
        { id: "d", label: "Add more retries" },
      ],
      answer: "a",
      explain: "The open time sets how long recovery can go unnoticed. A short open time with a probe checks quickly and cheaply.",
    },
    {
      id: "cb-order",
      format: "order",
      scenario: "Order these breaker settings by calls that reach a dead dependency before it opens, most first.",
      items: [
        { id: "slow", label: "Open at 90% over 30 seconds" },
        { id: "mid", label: "Open at 50% over 5 seconds" },
        { id: "fast", label: "Open at 30% over 3 seconds" },
      ],
      answer: ["slow", "mid", "fast"],
      explain: "A longer window and a higher threshold both take longer to fill, so more calls get through first.",
    },
    {
      id: "cb-graph",
      format: "predict-graph",
      scenario: "A dependency heals at second 77. As you raise the breaker's open time from 5 to 60 seconds, how does the average wait before calls resume change?",
      xLabel: "open time →",
      yLabel: "average wait after recovery",
      options: [
        { id: "rise", label: "Rises roughly in proportion to the open time", points: [2, 5.5, 7, 8, 7, 37, 13, 20] },
        { id: "flat", label: "Stays the same", points: [5, 5, 5, 5, 5, 5, 5, 5] },
        { id: "fall", label: "Falls", points: [20, 15, 12, 10, 8, 6, 4, 2] },
      ],
      answer: "rise",
      explain: "The breaker only retries after the open period, so on average the wait is about half of it, plus the time to probe. The exact figure depends on where the recovery falls in the cycle.",
    },
    {
      id: "cb-flaw",
      format: "spot-flaw",
      scenario: "A breaker trips whenever 3 of the last 10 calls fail. The service normally fails 1 call in 20 and sees 2 calls a minute. Users keep getting error pages about recommendations although the service is fine. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "calls", label: "2 calls a minute", kind: "client", col: 0, row: 1 },
          { id: "breaker", label: "open at 3 of last 10", kind: "lb", col: 1, row: 1 },
          { id: "svc", label: "service (5% errors)", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "calls", to: "breaker" },
          { from: "breaker", to: "svc" },
        ],
      },
      answer: "calls->breaker",
      explain: "With so few calls, a count over the last 10 spans five minutes and a couple of unlucky failures trips it. Use a minimum number of calls and a time window.",
    },
    {
      id: "cb-explain",
      format: "explain",
      scenario: "In two sentences: why does a breaker have a half-open state rather than simply reopening after a timer?",
      rubric: [
        { id: "probe", criterion: "A few probe calls test the dependency before full traffic returns" },
        { id: "protect", criterion: "Sending all traffic at a recovering dependency could knock it over again, so the breaker returns gradually" },
      ],
      exemplar: "Half-open sends a few probes first to check that the dependency really works again. Releasing all traffic at once could overwhelm a service that is only just recovering and knock it down again.",
      explain: "Test the water before everyone jumps in.",
    },
  ],
  codex: {
    oneLiner: "A breaker watches failures and, past a threshold, stops calling for a while: closed, open, then half-open to test recovery.",
    keyNumbers: [
      { label: "Calls into a dead dependency, 50% over 5 s, 100 a second", value: "about 300 of 6,000", sourceId: "azure-cb" },
      { label: "Extra wait after recovery", value: "about half the open time", sourceId: "azure-cb" },
    ],
    tradeoffs: [
      { choice: "Sensitive breaker", gain: "Sheds a failing dependency quickly", cost: "Trips on noise" },
      { choice: "Long open time", gain: "Gives the dependency a long rest", cost: "Slow to resume after it heals" },
      { choice: "Many probes", gain: "Confident the dependency is back", cost: "One failed probe reopens the breaker; load on a recovering service" },
    ],
    seenIn: ["Resilience4j and Polly circuit breakers.", "Envoy outlier detection and Istio circuit breaking."],
    interviewAngle: "Say: 'closed, open, half-open; fail fast with a fallback, a minimum call volume to avoid noise, and a short open time with probes'.",
    aws: [{ concept: "Outlier detection and ejection", service: "App Mesh / Envoy" }],
    replay: { id: "breaker-lab", config: { start: { thr: 0.5, window: 5, openS: 10, probes: 3 } }, scene: "open" },
  },
  interview: [
    "What is a circuit breaker and what are its states?",
    "How do you tune a circuit breaker?",
    "What should a caller do while the breaker is open?",
  ],
  deeper: [
    {
      title: "Where to put the breaker",
      body: "Breakers can live in the client library, in a sidecar proxy, or at the load balancer as outlier detection. Putting them in a proxy gives every language the same behaviour and a central place to see their state, at the cost of one more moving part. Either way, scope each breaker to one dependency, or one endpoint, so a single bad endpoint does not shut off a healthy one.",
      sourceIds: ["fowler-cb"],
    },
  ],
  honestPhysics: [
    "100 calls a second to a dependency that fails completely from second 20 to second 77, with an 8% background error rate otherwise. Errors come from a seeded generator, so the same settings always give the same run.",
    "The breaker opens when the average error rate over the window reaches the threshold, rejects everything for the open time, then lets probe calls through and closes only if all succeed.",
    "'Seconds to resume' is averaged over eight different moments at which the dependency heals.",
  ],
  sources: [FOWLER, AZURE_CB, NYGARD],
  verify: [
    { id: "good", claim: "Opening at 50% over 5 seconds lets about 300 calls through", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.5, window: 5, openS: 10, probes: 3 }, metric: "callsToDead" }, expect: { min: 280, max: 340 } },
    { id: "good-false", claim: "…with no trips while healthy", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.5, window: 5, openS: 10, probes: 3 }, metric: "falseTrips" }, expect: { max: 0 } },
    { id: "good-lag", claim: "…and calls resume in about 6 seconds", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.5, window: 5, openS: 10, probes: 3 }, metric: "recoveryLagS" }, expect: { max: 12 } },
    { id: "noisy", claim: "Opening at 10% over 3 seconds trips on background noise", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.1, window: 3, openS: 10, probes: 3 }, metric: "falseTrips" }, expect: { min: 1 } },
    { id: "slow", claim: "Opening at 90% over 10 seconds lets over 800 calls through", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.9, window: 10, openS: 10, probes: 3 }, metric: "callsToDead" }, expect: { min: 800 } },
    { id: "long-open", claim: "A 45-second open time can leave calls shut for over 20 seconds after recovery", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.5, window: 5, openS: 45, probes: 3 }, metric: "recoveryLagS" }, expect: { min: 20 } },
    { id: "star", claim: "A quick 30% over 3 seconds sheds the dead dependency within about 120 calls", run: "lab", params: { model: "breaker-lab", config: BREAKER, values: { thr: 0.3, window: 3, openS: 10, probes: 3 }, metric: "callsToDead" }, expect: { max: 200 } },
  ],
});
