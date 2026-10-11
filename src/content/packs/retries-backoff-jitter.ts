import { definePack } from "../define";

export const RETRY = { start: { retries: 0, backoff: "none", budget: false } };

const AWS_BACKOFF = { id: "aws-backoff", title: "AWS Architecture Blog: Exponential Backoff And Jitter", url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/" };
const BUILDERS = { id: "builders-timeouts", title: "Amazon Builders' Library: Timeouts, retries and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };
const SRE_OVERLOAD = { id: "sre-book-overload", title: "Google SRE Book, ch. 21: Handling Overload (retry budgets, per-request retry limits)", url: "https://sre.google/sre-book/handling-overload/" };

export default definePack({
  id: "retries-backoff-jitter",
  title: "Retries, Backoff & Jitter",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "api · load 3,600 req/s, capacity 1,000", detail: "dependency recovered 4 minutes ago" },
    lines: [
      { speaker: "kabir", line: "The dependency was down for ten seconds. It has been back for four minutes and we are still failing, because every client is hammering us with retries." },
      { speaker: "meera", line: "Each failure came back as three more requests. The fix for a blip became the cause of an outage." },
    ],
  },
  predictions: [
    {
      id: "storm",
      kind: "choice",
      prompt: "A service handles 900 requests a second and can serve 1,000. A dependency fails for 10 seconds. Every failed request is retried three times, one second apart. How high does the load on the service go?",
      options: [
        { id: "same", label: "Still about 900" },
        { id: "half", label: "About 1.5 times normal" },
        { id: "four", label: "About 4 times normal" },
        { id: "ten", label: "About 10 times normal" },
      ],
      answer: "four",
      observe: "storm",
      reveal: {
        text: "During the outage every request fails and returns up to three more times, so each second carries the fresh requests plus the first, second and third retries of earlier ones: up to 4 × 900 = 3,600. The service cannot serve that even after the dependency is back.",
        derived: true,
        line: { speaker: "meera", line: "Retries multiply load exactly when there is least capacity to spare." },
      },
    },
    {
      id: "budget",
      kind: "choice",
      prompt: "Now cap all retries at 10% of the fresh request rate, a retry budget. What is the peak load?",
      options: [
        { id: "same", label: "About 1.1 times normal" },
        { id: "two", label: "About 2 times normal" },
        { id: "four", label: "Still about 4 times normal" },
      ],
      answer: "same",
      observe: "calmed",
      reveal: {
        text: "The budget lets only 90 extra attempts a second through, however many requests fail. Load never exceeds 990, under capacity, so the service recovers the moment the dependency does. Some requests give up sooner, which is the price.",
        derived: true,
        line: { speaker: "rao", line: "Fewer retries, and no outage afterwards. That is a good trade." },
      },
    },
  ],
  widget: { id: "retry-lab", config: RETRY },
  mechanism: [
    {
      id: "why",
      text: "Retries fix transient failures: a dropped packet, a restarting server, a brief overload. If one attempt in thirty fails at random, a single retry makes that nearly invisible. The danger is that retries add load, and they add the most when the system is least able to take it.",
      sourceIds: ["builders-timeouts"],
    },
    {
      id: "immediate",
      scene: "immediate",
      text: "Immediate retries amplify. With three retries each failure becomes up to four attempts, and a service that was only slightly overloaded is pushed further over, which causes more failures and more retries. This feedback is how a ten-second blip becomes a long outage.",
      sourceIds: ["sre-book-overload"],
      derived: true,
    },
    {
      id: "backoff",
      scene: "backoff",
      text: "Exponential backoff waits longer after each failure, 1, 2, 4 seconds. If all clients fail together they also retry together, in waves. Jitter randomises each wait, spreading the waves into a steady trickle. Backoff and jitter smooth the load but do not reduce how many retries happen.",
      sourceIds: ["aws-backoff"],
    },
    {
      id: "budget",
      scene: "budget",
      text: "A retry budget limits the total. Allow retries only while they stay under a fraction of normal traffic, 10% for example, and drop the rest. Retry at one layer of the stack, not all of them, or three layers of three retries make 27 attempts.",
      sourceIds: ["sre-book-overload", "builders-timeouts"],
    },
  ],
  challenges: [
    {
      id: "no-storm",
      title: "Survive the blip",
      brief: "A dependency fails for 10 seconds while 900 requests a second arrive at a service that can serve 1,000. Choose retries, backoff and a budget so peak load stays under 1.5 times normal, the service recovers within 5 seconds of the dependency returning, and at most 6.5% of requests never succeed.",
      line: { speaker: "kabir", line: "I do not want to choose between no retries and a retry storm." },
      widget: { id: "retry-lab", config: RETRY },
      conditions: [
        { metric: "peakX", op: "<=", value: 1.5, label: "Peak load under 1.5× normal" },
        { metric: "recoveryS", op: "<=", value: 5, label: "Recovers within 5 s" },
        { metric: "errorRate", op: "<=", value: 0.065, label: "At most 6.5% of requests never succeed" },
      ],
      stars: [],
      hints: [
        "What happens to errors with no retries at all?",
        "What do backoff and jitter change about the number of retries?",
        "Something has to cap the total.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how retries can turn a short outage into a long one, and how you would retry safely.",
    rubric: [
      { id: "amplify", criterion: "Each failure produces more requests, so load multiplies exactly when the system is overloaded", keyIdea: "retries amplify load" },
      { id: "jitter", criterion: "Exponential backoff with jitter spaces retries out so clients do not retry in waves", keyIdea: "backoff and jitter" },
      { id: "budget", criterion: "Cap retries with a budget and retry at only one layer, so total extra load is bounded", keyIdea: "retry budget" },
    ],
    exemplar:
      "When a dependency fails, every client retries, so a service already short of capacity sees several times its normal load, which causes more failures and more retries. Exponential backoff with jitter spreads the retries out in time so they do not arrive in waves, but it does not reduce their number. A retry budget caps the extra load, for example to ten percent of fresh traffic, and I would retry in only one layer.",
  },
  reviews: [
    {
      id: "rb-est",
      format: "estimate",
      scenario: "A service takes 500 requests a second. A dependency fails and every failed request is retried 4 times with no backoff. At the worst, about how many requests a second does the service receive once all retry generations overlap?",
      unit: "req/s",
      answer: 2500,
      acceptFactor: 1.05,
      breakdown: ["fresh + 4 generations of retries", "5 × 500", "= 2,500"],
      explain: "Each attempt generation adds the whole request rate while the dependency is failing.",
    },
    {
      id: "rb-pick",
      format: "pick-fix",
      scenario: "Three layers of a stack (browser, API, database client) each retry failed calls 3 times. A database blip produces massive load. What is the best fix?",
      options: [
        { id: "a", label: "Retry in one layer only, with a budget, and pass errors up elsewhere" },
        { id: "b", label: "Raise the retry count at every layer" },
        { id: "c", label: "Remove timeouts" },
        { id: "d", label: "Add jitter at every layer and keep the counts" },
      ],
      answer: "a",
      explain: "Three layers of three retries make up to 64 attempts for one request. Jitter spreads them but does not cut the total.",
    },
    {
      id: "rb-order",
      format: "order",
      scenario: "Order these policies by peak load during a 10-second dependency outage, highest first.",
      items: [
        { id: "six", label: "6 immediate retries, no budget" },
        { id: "three", label: "3 immediate retries, no budget" },
        { id: "budget", label: "6 retries with a 10% budget" },
      ],
      answer: ["six", "three", "budget"],
      explain: "Peak load grows with the number of unbudgeted retry generations. A budget caps it near 1.1×.",
    },
    {
      id: "rb-graph",
      format: "predict-graph",
      scenario: "With three immediate retries and no budget, a dependency fails for 10 seconds. How does load on your service change over time, in relation to its capacity?",
      xLabel: "time →",
      yLabel: "load on your service",
      options: [
        { id: "storm", label: "Climbs through the outage and stays high for a while after it ends", points: [90, 90, 150, 280, 400, 360, 250, 150] },
        { id: "blip", label: "A 10-second hump that drops back immediately", points: [90, 90, 90, 100, 100, 90, 90, 90] },
        { id: "flat", label: "Flat", points: [90, 90, 90, 90, 90, 90, 90, 90] },
      ],
      answer: "storm",
      explain: "Retries of requests that failed during the outage keep arriving after it ends, and they fail again if the service is over capacity.",
    },
    {
      id: "rb-flaw",
      format: "spot-flaw",
      scenario: "When a request fails, a client waits exactly 2 seconds and retries once, for every one of 10,000 clients. After a 5-second outage the service is hit by a spike every 2 seconds. Tap the step that causes the spikes.",
      diagram: {
        nodes: [
          { id: "fail", label: "request fails together", kind: "client", col: 0, row: 1 },
          { id: "wait", label: "wait exactly 2 s", kind: "queue", col: 1, row: 1 },
          { id: "retry", label: "all clients retry at once", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "fail", to: "wait" },
          { from: "wait", to: "retry" },
        ],
      },
      answer: "fail->wait",
      explain: "Identical waits keep clients in step. Adding random jitter to the wait spreads their retries over time.",
    },
    {
      id: "rb-explain",
      format: "explain",
      scenario: "In two sentences: why does exponential backoff alone not prevent a retry storm?",
      rubric: [
        { id: "count", criterion: "It spaces retries out in time but does not reduce how many are sent" },
        { id: "sync", criterion: "Clients that fail together still retry in synchronized waves unless jitter randomises the delay" },
      ],
      exemplar: "Backoff delays retries but each failed request still comes back, so the total extra load is the same. Clients that failed together also retry together in waves unless jitter spreads them out.",
      explain: "Backoff changes timing; only a cap changes the total.",
    },
  ],
  codex: {
    oneLiner: "Retry only transient errors, with exponential backoff and jitter, at one layer, under a budget that caps extra load at a small fraction.",
    keyNumbers: [
      { label: "Peak load, 3 immediate retries", value: "up to 4× normal", sourceId: "builders-timeouts" },
      { label: "Typical retry budget", value: "about 10% of fresh traffic", sourceId: "sre-book-overload" },
    ],
    tradeoffs: [
      { choice: "Retry aggressively", gain: "Hides transient failures", cost: "Multiplies load during an outage" },
      { choice: "Backoff with jitter", gain: "No synchronized waves", cost: "Slower recovery per request" },
      { choice: "Retry budget", gain: "Bounded extra load", cost: "Some requests fail that a retry would have saved" },
    ],
    seenIn: ["AWS SDK retry modes with exponential backoff and jitter.", "gRPC retry throttling."],
    interviewAngle: "Say: 'retry transient failures with exponential backoff and jitter, at one layer, under a retry budget'.",
    aws: [{ concept: "Standard and adaptive retry modes", service: "AWS SDKs" }],
    replay: { id: "retry-lab", config: { start: { retries: 3, backoff: "jitter", budget: true } }, scene: "budget" },
  },
  interview: [
    "What is a retry storm and how do you prevent one?",
    "Why add jitter to backoff?",
    "What is a retry budget?",
  ],
  deeper: [
    {
      title: "Only retry what is safe to repeat",
      body: "A retry sends the request again, so it is only safe when repeating it has the same effect as sending it once. Reads are, and writes with idempotency keys are. Retrying a non-idempotent payment can charge twice. Also retry only errors that are likely transient, such as timeouts and overload responses, not invalid input.",
      sourceIds: ["builders-timeouts"],
    },
  ],
  honestPhysics: [
    "A service takes 900 requests a second and can serve 1,000. A dependency is down from second 20 to second 30. Requests over capacity fail, and 3% of attempts fail at random even when all is well.",
    "'No backoff' retries a second later; 'exponential' waits 1, 2, 4 seconds; 'jitter' spreads each wait over twice that window. A budget caps retries at 10% of the fresh rate.",
    "The model is deterministic and fluid, so it shows shapes rather than exact counts.",
  ],
  sources: [AWS_BACKOFF, BUILDERS, SRE_OVERLOAD],
  verify: [
    { id: "peak3", claim: "Three immediate retries multiply the peak load by four", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "none", budget: false }, metric: "peakX" }, expect: { min: 3.9, max: 4.1 } },
    { id: "slow", claim: "…and the service takes over 10 seconds to recover", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "none", budget: false }, metric: "recoveryS" }, expect: { min: 10 } },
    { id: "peak6", claim: "Six immediate retries reach seven times normal", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 6, backoff: "none", budget: false }, metric: "peakX" }, expect: { min: 6.9 } },
    { id: "jitter", claim: "Jitter trims the peak only a little", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "jitter", budget: false }, metric: "peakX" }, expect: { min: 3.5, max: 3.9 } },
    { id: "budget-peak", claim: "A 10% budget holds the peak at 1.1×", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "jitter", budget: true }, metric: "peakX" }, expect: { max: 1.11 } },
    { id: "budget-rec", claim: "…and recovery is immediate", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "jitter", budget: true }, metric: "recoveryS" }, expect: { max: 1 } },
    { id: "budget-err", claim: "…with fewer than 6.5% of requests failing", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 3, backoff: "jitter", budget: true }, metric: "errorRate" }, expect: { max: 0.065 } },
    { id: "none-err", claim: "No retries at all leaves over 8% failing", run: "lab", params: { model: "retry-lab", config: RETRY, values: { retries: 0 }, metric: "errorRate" }, expect: { min: 0.08 } },
  ],
});
