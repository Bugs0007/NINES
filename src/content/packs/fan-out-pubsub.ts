import { definePack } from "../define";

export const FAN = { lockN: true, n: 12, start: { style: "push" } };
export const FAN_CHALLENGE = { lockN: true, n: 12 };

const SNS_FANOUT = { id: "sns-fanout", title: "AWS docs: Common Amazon SNS scenarios (fanout to SQS queues)", url: "https://docs.aws.amazon.com/sns/latest/dg/sns-common-scenarios.html" };
const TAIL = { id: "tail-at-scale", title: "J. Dean and L. Barroso (2013), The Tail at Scale, Communications of the ACM 56(2)", url: "https://research.google/pubs/the-tail-at-scale/" };
const FOWLER_EVENTS = { id: "fowler-events", title: "M. Fowler (2017), What do you mean by 'Event-Driven'?", url: "https://martinfowler.com/articles/201701-event-driven.html" };

export default definePack({
  id: "fan-out-pubsub",
  title: "Fan-out & Pub/Sub",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "checkout · p99 1.6 s, 1.2% of orders failing", detail: "12 downstream services called in the request" },
    lines: [
      { speaker: "kabir", line: "Every new feature wants to hear about an order, so checkout now calls twelve services before it answers. One of them is always having a bad day." },
      { speaker: "meera", line: "The order service should say what happened, once, and let anyone who cares listen. Checkout should not be waiting on twelve friends." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "The order service calls 12 subscribers one after another. Each call has a median of 20 ms and a p99 of 400 ms. What is the 99th percentile of the customer's wait?",
      options: [
        { id: "hundred", label: "About 100 ms" },
        { id: "three", label: "About 300 ms" },
        { id: "sixteen", label: "About 1.6 seconds" },
        { id: "ten", label: "About 10 seconds" },
      ],
      answer: "sixteen",
      observe: "slow-seen",
      reveal: {
        text: "Twelve slow tails add up. A single call exceeds 400 ms one time in a hundred, but with twelve calls in a row, some call is slow in about one request in nine, and the sum's 99th percentile is about 1.6 seconds, thirteen times the typical call.",
        derived: true,
        sourceIds: ["tail-at-scale"],
        line: { speaker: "meera", line: "The more you depend on, the more of their worst days you inherit." },
      },
    },
    {
      id: "catchup",
      kind: "choice",
      prompt: "The order service publishes to a topic with a queue for each subscriber. A subscriber is down for an hour. What happens to the events it missed?",
      options: [
        { id: "lost", label: "They are lost" },
        { id: "wait", label: "They wait in its queue, and it catches up when it returns" },
        { id: "block", label: "They block checkout until the subscriber is back" },
      ],
      answer: "wait",
      observe: "queued",
      reveal: {
        text: "Each subscriber has its own queue, so the events pile up there while it is down and are delivered at its own pace when it returns. Checkout is unaffected, and one slow or failing subscriber cannot hurt another.",
        derived: true,
        line: { speaker: "rao", line: "Twelve consumers, twelve independent failures, none of them checkout's problem." },
      },
    },
  ],
  widget: { id: "pubsub-lab", config: FAN },
  mechanism: [
    {
      id: "direct",
      scene: "direct",
      text: "Calling every interested service directly couples the sender to all of them. The customer waits for the slowest, or for the sum of all, any one failure can fail the order, and each new subscriber means changing and redeploying the sender.",
      sourceIds: ["tail-at-scale", "fowler-events"],
    },
    {
      id: "pubsub",
      text: "Publish/subscribe inverts this. The sender publishes an event to a topic and does not know who listens. Subscribers register their own interest. Adding a seventh or twelfth subscriber changes nothing in the sender, and the sender's work is a single publish.",
      sourceIds: ["fowler-events", "sns-fanout"],
    },
    {
      id: "push",
      scene: "push",
      text: "A topic that pushes to each subscriber's endpoint is simple but fragile: if an endpoint is down longer than the retry window the event is lost to it, and a slow endpoint ties up delivery. It suits notifications where a miss is acceptable.",
      sourceIds: ["sns-fanout"],
    },
    {
      id: "queues",
      scene: "queues",
      text: "The robust pattern is fan-out to queues: the topic delivers a copy into a queue per subscriber, and each service reads its own queue at its own pace. Events are retained until consumed, slow subscribers do not affect others, and each gets its own retries and dead-letter queue.",
      sourceIds: ["sns-fanout"],
    },
  ],
  challenges: [
    {
      id: "twelve",
      title: "Tell twelve services",
      brief: "Twelve services need every order event. Choose how the order service tells them so the customer's wait is at most 100 ms, at most 0.2% of orders fail because of a subscriber, no subscriber ever misses an event, and adding a subscriber needs no change to the publisher.",
      line: { speaker: "kabir", line: "Next quarter there will be twenty. I do not want to touch checkout for each one." },
      widget: { id: "pubsub-lab", config: FAN_CHALLENGE },
      conditions: [
        { metric: "userMs", op: "<=", value: 100, label: "Customer wait at most 100 ms" },
        { metric: "userFailPct", op: "<=", value: 0.002, label: "At most 0.2% of orders failed by subscribers" },
        { metric: "lostPct", op: "<=", value: 0, label: "No subscriber misses an event" },
        { metric: "publisherChanges", op: "<=", value: 0, label: "No publisher change per new subscriber" },
      ],
      stars: [],
      hints: [
        "Which designs make the customer wait only for the publish itself?",
        "What can a push-based topic lose when an endpoint is down?",
        "What stores an event until its subscriber is ready?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain fan-out with pub/sub and why you would put a queue between the topic and each subscriber.",
    rubric: [
      { id: "decouple", criterion: "The publisher sends once to a topic and does not know the subscribers, so adding one needs no change to it", keyIdea: "publisher unaware of subscribers" },
      { id: "latency", criterion: "The customer waits only for the publish, not for every subscriber, and a failing subscriber cannot fail the request", keyIdea: "off the critical path" },
      { id: "queues", criterion: "A queue per subscriber retains events while it is slow or down, and isolates subscribers from each other", keyIdea: "queue per subscriber" },
    ],
    exemplar:
      "The order service publishes one event to a topic and does not know who listens, so adding a subscriber needs no change to it, and the customer waits only for the publish. Pushing straight to endpoints can lose events when one is down, so I would put a queue between the topic and each subscriber. Each service then reads at its own pace, events wait while it is down, and one slow subscriber cannot hurt the others.",
  },
  reviews: [
    {
      id: "fo-est",
      format: "estimate",
      scenario: "12 services are each unavailable for 0.1% of calls. If the order service calls all of them synchronously, about what share of orders fail because one is down? (1 − 0.999¹²)",
      unit: "%",
      answer: 1.2,
      acceptFactor: 1.1,
      breakdown: ["0.999¹² = 0.988", "1 − 0.988 = 0.012", "≈ 1.2%"],
      explain: "Small failure rates multiply with the number of dependencies. A hundred such services would fail almost one order in ten.",
    },
    {
      id: "fo-pick",
      format: "pick-fix",
      scenario: "A topic pushes events to HTTP endpoints. One team's service was down for 6 hours and permanently missed the events from that time. What is the right change?",
      options: [
        { id: "a", label: "Deliver to a queue per subscriber, which retains events until the service reads them" },
        { id: "b", label: "Retry for a week from the topic" },
        { id: "c", label: "Ask the team to keep their service up" },
        { id: "d", label: "Publish twice" },
      ],
      answer: "a",
      explain: "A queue decouples delivery from availability. The event waits for as long as the subscriber needs.",
    },
    {
      id: "fo-order",
      format: "order",
      scenario: "Order these designs by the chance a single subscriber's outage fails the customer's order, highest first.",
      items: [
        { id: "seq", label: "Call each in turn" },
        { id: "push", label: "Topic with push" },
        { id: "queues", label: "Topic with a queue per subscriber" },
      ],
      answer: ["seq", "push", "queues"],
      explain: "Synchronous calls fail the order. Both topic designs keep the order independent; push can also lose events, queues cannot.",
    },
    {
      id: "fo-graph",
      format: "predict-graph",
      scenario: "The order service calls its subscribers one after another. As you add subscribers from 1 to 50, how does the 99th percentile of the customer's wait change?",
      xLabel: "subscribers →",
      yLabel: "customer wait (p99)",
      options: [
        { id: "rise", label: "Rises roughly in proportion to the number of subscribers", points: [265, 510, 800, 1250, 1640, 2300, 3300, 5500] },
        { id: "flat", label: "Stays the same", points: [400, 400, 400, 400, 400, 400, 400, 400] },
        { id: "fall", label: "Falls", points: [5500, 3300, 2300, 1640, 1250, 800, 510, 265] },
      ],
      answer: "rise",
      explain: "Each call adds its own delay to the sum, so the total grows with the number of calls, and the tail grows with it.",
    },
    {
      id: "fo-flaw",
      format: "spot-flaw",
      scenario: "To add a new loyalty service, the team edits the order service to call it. A bug in the loyalty client blocks every order for ten minutes. Tap the link that couples them.",
      diagram: {
        nodes: [
          { id: "order", label: "order service", kind: "server", col: 0, row: 1 },
          { id: "loyalty", label: "loyalty service", kind: "server", col: 1, row: 1 },
          { id: "customer", label: "customer waits", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "order", to: "loyalty" },
          { from: "loyalty", to: "customer" },
        ],
      },
      answer: "order->loyalty",
      explain: "The order service calls loyalty inside the request. Publishing an event instead lets loyalty subscribe without being on the customer's critical path.",
    },
    {
      id: "fo-explain",
      format: "explain",
      scenario: "In two sentences: why does pub/sub make it easier to add a new consumer?",
      rubric: [
        { id: "unknown", criterion: "The publisher does not know its subscribers, so it does not need to change when a new one registers" },
        { id: "isolated", criterion: "Each subscriber consumes at its own pace and its failures do not reach the publisher or other subscribers" },
      ],
      exemplar: "The publisher sends to a topic without knowing who listens, so a new consumer just subscribes and the publisher is untouched. Each consumer reads at its own pace, so its failures stay its own.",
      explain: "Publishers announce; subscribers decide.",
    },
  ],
  codex: {
    oneLiner: "Publish one event to a topic; give each subscriber its own queue. The publisher stays unaware and uncoupled; slow subscribers stay isolated.",
    keyNumbers: [
      { label: "p99 wait calling 12 services in turn (median 20 ms, p99 400 ms)", value: "about 1.6 seconds", sourceId: "tail-at-scale" },
      { label: "Orders failed by 12 synchronous 0.1% dependencies", value: "about 1.2%", sourceId: "tail-at-scale" },
    ],
    tradeoffs: [
      { choice: "Synchronous calls", gain: "Simple; the answer is immediate", cost: "Latency and failure add up; the sender changes for every subscriber" },
      { choice: "Topic with push", gain: "Decoupled and simple", cost: "A subscriber that is down too long misses events" },
      { choice: "Topic with queues", gain: "Isolated and durable", cost: "More infrastructure; events arrive slightly later" },
    ],
    seenIn: ["SNS topics fanning out to SQS queues.", "Kafka topics read by independent consumer groups."],
    interviewAngle: "Say: 'publish once to a topic, fan out to a queue per consumer, so the request path is one publish and consumers fail independently'.",
    aws: [{ concept: "Fanout to queues", service: "SNS + SQS, EventBridge" }],
    replay: { id: "pubsub-lab", config: FAN, scene: "queues" },
  },
  interview: [
    "What is pub/sub and why use it?",
    "How would you notify twelve services of an order?",
    "Why a queue per subscriber rather than direct push?",
  ],
  deeper: [
    {
      title: "Fan-out on write versus on read",
      body: "In a social feed the same idea appears in another form: when someone posts, do you copy the post into every follower's feed (fan-out on write) or look up followed accounts when a feed is read (fan-out on read)? Writing is quick to read but explodes for accounts with millions of followers. Many systems combine them, writing for ordinary accounts and reading for celebrities.",
      sourceIds: ["fowler-events"],
    },
  ],
  honestPhysics: [
    "An order service must tell N other services. Each call has a median of 20 ms and a p99 of 400 ms, and each service fails 0.1% of calls. The 99th percentile of the wait is taken over 4,000 seeded trials.",
    "A topic with push loses an event for 0.02% of events (an endpoint down longer than the retry window). A queue per subscriber loses none. Publishing takes 5 ms.",
    "Adding a subscriber changes the publisher only in the direct designs.",
  ],
  sources: [SNS_FANOUT, TAIL, FOWLER_EVENTS],
  verify: [
    { id: "seq", claim: "Twelve calls in turn have a p99 wait above 1.4 seconds", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "seq" }, metric: "userMs" }, expect: { min: 1400, max: 1900 } },
    { id: "par", claim: "Calling them in parallel is still over a second at p99", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "par" }, metric: "userMs" }, expect: { min: 900 } },
    { id: "fail", claim: "Twelve 0.1% dependencies fail about 1.2% of orders", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "seq" }, metric: "userFailPct" }, expect: { min: 0.011, max: 0.013 } },
    { id: "push-lost", claim: "A push topic still loses some events", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "push" }, metric: "lostPct" }, expect: { min: 0.0001 } },
    { id: "queues-ms", claim: "A queue per subscriber returns in 5 ms", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "queues" }, metric: "userMs" }, expect: { max: 100 } },
    { id: "queues-lost", claim: "…and loses nothing", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "queues" }, metric: "lostPct" }, expect: { max: 0 } },
    { id: "queues-change", claim: "…and needs no publisher change for a new subscriber", run: "lab", params: { model: "pubsub-lab", config: FAN_CHALLENGE, values: { style: "queues" }, metric: "publisherChanges" }, expect: { max: 0 } },
  ],
});
