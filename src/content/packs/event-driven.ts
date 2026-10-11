import { definePack } from "../define";

export const EVENTS = { start: { style: "events", reactions: 6, tracing: true } };
export const EVENTS_CHALLENGE = {};

const FOWLER_EVENTS = { id: "fowler-events", title: "M. Fowler (2017), What do you mean by 'Event-Driven'?", url: "https://martinfowler.com/articles/201701-event-driven.html" };
const NEWMAN = { id: "newman-microservices", title: "S. Newman, Building Microservices, 2nd ed. (2021), ch. 6: Workflow (orchestration and choreography)", url: "https://samnewman.io/books/building_microservices_2nd_edition/" };
const OTEL = { id: "otel-traces", title: "OpenTelemetry docs: Traces (spans and context propagation)", url: "https://opentelemetry.io/docs/concepts/signals/traces/" };

export default definePack({
  id: "event-driven",
  title: "Event-driven Architecture",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'order paid, never shipped'", detail: "nobody can say which service dropped it" },
    lines: [
      { speaker: "kabir", line: "We moved checkout to events and it is faster and calmer. Then an order went missing, and nobody could say where it got lost." },
      { speaker: "meera", line: "Events cut the wires between services, and the wires were also how we saw what happened. You have to put the trail back on purpose." },
    ],
  },
  predictions: [
    {
      id: "coupled",
      kind: "choice",
      prompt: "Checkout calls six services in turn, 40 ms each, after 30 ms of its own work. How long does checkout take?",
      options: [
        { id: "ms70", label: "About 70 ms" },
        { id: "ms150", label: "About 150 ms" },
        { id: "ms270", label: "About 270 ms" },
        { id: "ms600", label: "About 600 ms" },
      ],
      answer: "ms270",
      observe: "coupled",
      reveal: {
        text: "30 ms plus six calls of 40 ms is 270 ms, and every extra reaction adds another 40. Six services each failing 0.1% of the time also fail 0.7% of checkouts. Each new feature that wants to hear about an order makes checkout slower and a little less reliable.",
        derived: true,
        line: { speaker: "meera", line: "Checkout should not pay for every idea the company has about orders." },
      },
    },
    {
      id: "trail",
      kind: "choice",
      prompt: "With events, checkout publishes OrderPlaced and returns in 70 ms. An order is missing downstream. Without a correlation id on each event, how do you find where it stopped?",
      options: [
        { id: "easy", label: "Follow the trace in one place" },
        { id: "manual", label: "Search each service's logs by hand and guess" },
        { id: "never", label: "You cannot: events carry no history" },
      ],
      answer: "manual",
      observe: "lost-trail",
      reveal: {
        text: "Nothing links the six reactions to the one order, so each service's log must be searched separately, matching on whatever fields happen to be there. Put a correlation id on every event and log it everywhere, and one search shows the whole path.",
        derived: true,
        line: { speaker: "rao", line: "Cheap to add on day one, painful to retrofit." },
      },
    },
  ],
  widget: { id: "event-lab", config: EVENTS },
  mechanism: [
    {
      id: "what",
      text: "In an event-driven design a service announces that something happened, an order was placed, and other services react. It does not tell them what to do or wait for them. The sender and the reactors are connected only by the shape of the event, not by calls between them.",
      sourceIds: ["fowler-events"],
    },
    {
      id: "gains",
      scene: "events",
      text: "The gains are shorter requests, since checkout only writes and publishes; independence, since a failing reactor does not fail checkout; and extensibility, since a new reaction subscribes without touching the sender. The price is that results arrive a moment later: the data is eventually consistent.",
      sourceIds: ["fowler-events", "newman-microservices"],
    },
    {
      id: "sync",
      scene: "sync",
      text: "Direct calls are still the right choice when the caller needs the answer to continue, such as payment authorisation, or when a failure must stop the request. A mix is normal: synchronous for what the user must see now, events for what can follow.",
      sourceIds: ["newman-microservices"],
      derived: true,
    },
    {
      id: "trace",
      scene: "trace",
      text: "Without calls, nothing records the path of a business flow. Give every event a correlation id, pass it into every reaction and log line, and send traces through a tracing system. Then the question where did order 88213 stop can be answered in one query, not by searching six logs.",
      sourceIds: ["otel-traces", "newman-microservices"],
    },
  ],
  challenges: [
    {
      id: "checkout",
      title: "Redesign checkout",
      brief: "Checkout triggers six reactions. Make checkout take at most 150 ms, fail at most 0.2% of the time because of downstream services, have every reaction done within 5 seconds, and let an engineer follow one order end to end.",
      line: { speaker: "kabir", line: "Fast, calm, and when someone asks where an order went, I want an answer in a minute." },
      widget: { id: "event-lab", config: EVENTS_CHALLENGE },
      conditions: [
        { metric: "checkoutMs", op: "<=", value: 150, label: "Checkout at most 150 ms" },
        { metric: "failPct", op: "<=", value: 0.002, label: "At most 0.2% failures from reactions" },
        { metric: "staleS", op: "<=", value: 5, label: "Everything reacted within 5 s" },
        { metric: "traceable", op: ">=", value: 1, label: "A flow can be followed end to end" },
      ],
      stars: [],
      hints: [
        "How long does checkout take with six synchronous calls?",
        "What do events cost in how soon the other services know?",
        "What did the calls give you that events do not?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what event-driven architecture gives you and what it costs, using checkout as the example.",
    rubric: [
      { id: "decouple", criterion: "Checkout publishes an event and returns quickly; reactors are independent and new ones can be added without changing it", keyIdea: "decoupled and fast" },
      { id: "eventual", criterion: "Reactions happen afterwards, so the system is eventually consistent", keyIdea: "eventual consistency" },
      { id: "trace", criterion: "Flows become hard to follow, so use correlation ids and tracing", keyIdea: "observability cost" },
    ],
    exemplar:
      "Checkout writes the order and publishes an OrderPlaced event, then returns quickly, and the other services react independently, so a slow or failing one does not fail checkout and a new one can be added without touching it. The price is that the reactions happen a moment later, so the system is eventually consistent, and with no calls to follow, a flow is hard to trace unless every event carries a correlation id that every service logs.",
  },
  reviews: [
    {
      id: "ed-est",
      format: "estimate",
      scenario: "Checkout does 30 ms of its own work and calls 8 services in turn at 40 ms each. How long does it take?",
      unit: "ms",
      answer: 350,
      acceptFactor: 1.05,
      breakdown: ["8 × 40 = 320", "+ 30 = 350"],
      explain: "Calls in sequence add up. Publishing an event replaces all eight with a single write.",
    },
    {
      id: "ed-pick",
      format: "pick-fix",
      scenario: "After moving to events, support cannot tell why an order was never shipped. Which change helps most?",
      options: [
        { id: "a", label: "A correlation id on every event, logged by every service, with distributed tracing" },
        { id: "b", label: "Return to synchronous calls" },
        { id: "c", label: "Add a log line to checkout only" },
        { id: "d", label: "Retry every event three times" },
      ],
      answer: "a",
      explain: "The problem is visibility. A shared id links every step of the flow, so one search shows where it stopped.",
    },
    {
      id: "ed-order",
      format: "order",
      scenario: "Order these designs by checkout latency with 10 reacting services, slowest first.",
      items: [
        { id: "sync10", label: "10 synchronous calls" },
        { id: "sync3", label: "3 synchronous calls, 7 events" },
        { id: "events", label: "All events" },
      ],
      answer: ["sync10", "sync3", "events"],
      explain: "Each synchronous call adds time to the request; events add none beyond the publish.",
    },
    {
      id: "ed-graph",
      format: "predict-graph",
      scenario: "As the number of reacting services grows from 1 to 12, how does checkout time change with synchronous calls, and with events?",
      xLabel: "reacting services →",
      yLabel: "checkout time",
      options: [
        { id: "diverge", label: "Synchronous grows in proportion; events stay flat", points: [70, 110, 150, 190, 230, 270, 350, 510] },
        { id: "both", label: "Both grow in proportion", points: [70, 110, 150, 190, 230, 270, 350, 510] },
        { id: "flat", label: "Both stay flat", points: [70, 70, 70, 70, 70, 70, 70, 70] },
      ],
      answer: "diverge",
      explain: "Synchronous calls are in the request path, so each one adds 40 ms. A published event adds nothing however many listen.",
    },
    {
      id: "ed-flaw",
      format: "spot-flaw",
      scenario: "A user changes their address and immediately sees the old one on the profile page, because the profile service updates from an event a second later. The team calls it a bug in the event system. Tap the real cause.",
      diagram: {
        nodes: [
          { id: "write", label: "address saved, event published", kind: "server", col: 0, row: 1 },
          { id: "event", label: "event in flight (~1 s)", kind: "queue", col: 1, row: 1 },
          { id: "read", label: "profile page read", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "write", to: "event" },
          { from: "event", to: "read" },
        ],
      },
      answer: "event->read",
      explain: "Events are asynchronous by design, so the read model is briefly behind. The page needs read-your-writes handling, not a different event system.",
    },
    {
      id: "ed-explain",
      format: "explain",
      scenario: "In two sentences: when should a call stay synchronous rather than become an event?",
      rubric: [
        { id: "need", criterion: "When the caller needs the result to continue, such as authorising a payment" },
        { id: "stop", criterion: "When a failure must stop the request instead of being handled afterwards" },
      ],
      exemplar: "Keep a call synchronous when the caller needs the result to continue, like a payment authorisation. Also keep it when failure must stop the request rather than being dealt with later.",
      explain: "Events for what can follow; calls for what must come first.",
    },
  ],
  codex: {
    oneLiner: "Services announce facts as events and others react. Faster, looser and extensible, but eventually consistent and hard to trace without correlation ids.",
    keyNumbers: [
      { label: "Checkout time, 6 synchronous 40 ms calls", value: "270 ms", sourceId: "newman-microservices" },
      { label: "Checkout time with an event", value: "about 70 ms", sourceId: "fowler-events" },
    ],
    tradeoffs: [
      { choice: "Synchronous calls", gain: "Immediate results; simple to follow", cost: "Latency and failure add up; tight coupling" },
      { choice: "Events", gain: "Fast request; independent services; easy to extend", cost: "Eventual consistency; flow is hard to trace" },
      { choice: "Orchestrator", gain: "One place shows the flow", cost: "The orchestrator knows every step" },
    ],
    seenIn: ["Order, shipping and notification flows in e-commerce.", "Domain events in microservice platforms."],
    interviewAngle: "Say: 'events for what can happen afterwards, synchronous for what the user must see, and a correlation id on every event so flows stay traceable'.",
    aws: [{ concept: "Event bus and routing rules", service: "Amazon EventBridge" }],
    replay: { id: "event-lab", config: EVENTS, scene: "trace" },
  },
  interview: [
    "What are the benefits and costs of an event-driven design?",
    "How do you debug a flow that spans many services via events?",
    "What is the difference between orchestration and choreography?",
  ],
  deeper: [
    {
      title: "Four things people mean by event-driven",
      body: "Fowler distinguishes event notification, where an event only says something happened; event-carried state transfer, where it holds the data so receivers need not call back; event sourcing, where events are the source of truth; and CQRS. Teams often say event-driven and mean different ones, so ask which pattern is meant before agreeing to the design.",
      sourceIds: ["fowler-events"],
    },
  ],
  honestPhysics: [
    "A checkout triggers six reactions. Synchronously, each is a call of 40 ms in sequence after 30 ms of checkout's work, and each fails 0.1% of the time. With events, checkout writes and publishes in about 70 ms and the reactions happen afterwards, within about 4 seconds.",
    "A flow is traceable if every event carries a correlation id and each service logs it. Without it, finding the path of one order means searching each service's logs by hand.",
    "Payment authorisation is assumed to be part of checkout's own 30 ms.",
  ],
  sources: [FOWLER_EVENTS, NEWMAN, OTEL],
  verify: [
    { id: "sync-ms", claim: "Six synchronous calls make checkout 270 ms", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "sync", reactions: 6 }, metric: "checkoutMs" }, expect: { min: 270, max: 270 } },
    { id: "sync-fail", claim: "…and 0.7% of checkouts fail", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "sync", reactions: 6 }, metric: "failPct" }, expect: { min: 0.006, max: 0.008 } },
    { id: "ev-ms", claim: "Publishing an event keeps checkout to 70 ms", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "events", reactions: 6 }, metric: "checkoutMs" }, expect: { max: 150 } },
    { id: "ev-stale", claim: "…with reactions done in 4 seconds", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "events" }, metric: "staleS" }, expect: { max: 5 } },
    { id: "ev-trace", claim: "Without correlation ids a flow cannot be followed", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "events", tracing: false }, metric: "traceable" }, expect: { max: 0 } },
    { id: "ev-trace-on", claim: "With them it can", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "events", tracing: true }, metric: "traceable" }, expect: { min: 1 } },
    { id: "twelve", claim: "Twelve synchronous reactions take over 500 ms", run: "lab", params: { model: "event-lab", config: EVENTS_CHALLENGE, values: { style: "sync", reactions: 12 }, metric: "checkoutMs" }, expect: { min: 500 } },
  ],
});
