import { definePack } from "../define";

export const PRESS = { start: { policy: "unbounded", buffer: 100000, consumers: 12 } };
export const PRESS_CHALLENGE = {};

const FERD = { id: "ferd-queues", title: "F. Hébert: Queues Don't Fix Overload", url: "https://ferd.ca/queues-don-t-fix-overload.html" };
const REACTIVE = { id: "reactive-manifesto", title: "The Reactive Manifesto, glossary: Back-Pressure", url: "https://www.reactivemanifesto.org/glossary#Back-Pressure" };
const SRE_OVERLOAD = { id: "sre-book-overload", title: "Google SRE Book, ch. 21: Handling Overload (load shedding, graceful degradation)", url: "https://sre.google/sre-book/handling-overload/" };

export default definePack({
  id: "backpressure",
  title: "Backpressure",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "image-resize queue · 19 minutes old", detail: "workers healthy, depth 240,000 and growing" },
    lines: [
      { speaker: "kabir", line: "A marketing email sent twelve hundred uploads a second to workers that can do eight hundred. The queue absorbed it beautifully, and now thumbnails arrive twenty minutes late." },
      { speaker: "meera", line: "A queue hides overload, it does not fix it. The delay has to land somewhere, and an unbounded queue puts it on every customer at once." },
    ],
  },
  predictions: [
    {
      id: "grow",
      kind: "choice",
      prompt: "Messages arrive at 1,200 a second for 10 minutes, and 8 consumers handle 800 a second. The queue is unbounded. How long does the last message wait?",
      options: [
        { id: "second", label: "About a second" },
        { id: "minute", label: "About a minute" },
        { id: "five", label: "About 5 minutes" },
        { id: "hour", label: "About an hour" },
      ],
      answer: "five",
      observe: "queue-grew",
      reveal: {
        text: "400 messages a second pile up for 600 seconds: 240,000 waiting. The consumers need 300 seconds to drain that, so the last message waits 5 minutes. And the queue keeps taking in more, so the wait never signals that anything is wrong until it is late.",
        derived: true,
        line: { speaker: "meera", line: "From the inside, the queue looks healthy right up until people complain." },
      },
    },
    {
      id: "block",
      kind: "choice",
      prompt: "You cap the buffer at 1,000 messages and tell producers to wait when it is full. With the same spike, how long is the longest wait in the queue?",
      options: [
        { id: "tenth", label: "About 0.1 seconds" },
        { id: "one", label: "About 1.25 seconds" },
        { id: "thirty", label: "About 30 seconds" },
        { id: "five", label: "Still about 5 minutes" },
      ],
      answer: "one",
      observe: "bounded",
      reveal: {
        text: "A full buffer of 1,000 messages drains in 1,000 ÷ 800 = 1.25 seconds, so no message waits longer. The cost moves to the producers, who are slowed by the excess: about a third of their attempts wait, which is the signal a bounded queue gives.",
        derived: true,
        line: { speaker: "rao", line: "Pain upstream is information. Pain downstream is a complaint." },
      },
    },
  ],
  widget: { id: "pressure-lab", config: PRESS },
  mechanism: [
    {
      id: "fluid",
      scene: "unbounded",
      text: "When messages arrive faster than they are processed, the surplus goes somewhere. An unbounded queue stores it and the wait grows without limit: the backlog divided by the consumers' rate. A longer queue does not add capacity, it only converts overload into delay and memory.",
      sourceIds: ["ferd-queues"],
    },
    {
      id: "bounded",
      scene: "bounded",
      text: "A bounded buffer limits both the wait and the memory, because the longest wait is the buffer size divided by the processing rate. When it is full, something must give. Either new messages are dropped, shedding load, or the producers are told to wait.",
      sourceIds: ["sre-book-overload", "ferd-queues"],
    },
    {
      id: "block",
      scene: "block",
      text: "Backpressure pushes the limit back to the source: a full buffer makes the producer wait, slow down, or fail fast, and it propagates through a chain of stages to the entry point. Nothing is lost, and the system runs at the speed of its slowest stage, with the delay shown where it can be acted on.",
      sourceIds: ["reactive-manifesto"],
    },
    {
      id: "choose",
      text: "Pick by who can bear the cost. Drop when messages are cheap and a newer one replaces the old, like telemetry. Slow the producer when work must not be lost and the producer can wait. Add capacity when the load is steady, since neither dropping nor waiting fixes a sustained shortage.",
      sourceIds: ["sre-book-overload"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "spike",
      title: "Absorb the spike",
      brief: "A 10-minute spike of 1,200 messages a second hits 8 consumers that handle 800 a second. Choose a policy, buffer size and number of consumers so nothing waits over 2 seconds, at most 0.1% of messages are dropped, producers are slowed at most 20% of the time, and extra consumers cost at most $200 a month.",
      line: { speaker: "kabir", line: "I do not want a twenty-minute queue and I do not want to throw away uploads." },
      widget: { id: "pressure-lab", config: PRESS_CHALLENGE },
      conditions: [
        { metric: "latencyS", op: "<=", value: 2, label: "No wait over 2 seconds" },
        { metric: "droppedPct", op: "<=", value: 0.001, label: "At most 0.1% dropped" },
        { metric: "producerSlowPct", op: "<=", value: 0.2, label: "Producers slowed at most 20%" },
        { metric: "costPerMonth", op: "<=", value: 200, label: "Extra consumers at most $200 a month" },
      ],
      stars: [{ metric: "costPerMonth", op: "<=", value: 100, label: "Extra consumers at most $100 a month" }],
      hints: [
        "How long does a full buffer take to drain? Does that fit in 2 seconds?",
        "What does dropping cost, and what does making producers wait cost?",
        "Two extra consumers cut the excess in half.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why an unbounded queue is dangerous and how backpressure works.",
    rubric: [
      { id: "unbounded", criterion: "An unbounded queue turns sustained overload into ever-growing delay and memory, hiding the problem until late", keyIdea: "overload becomes delay" },
      { id: "bounded", criterion: "A bounded buffer caps the wait at size divided by rate and forces a choice when full: drop or slow the producer", keyIdea: "bounded buffer" },
      { id: "bp", criterion: "Backpressure makes a full buffer slow the producer, propagating the limit to the source so nothing is lost", keyIdea: "push the limit upstream" },
    ],
    exemplar:
      "An unbounded queue turns overload into delay and memory that grow without limit, and it looks healthy until customers complain. A bounded buffer caps the wait at its size divided by the processing rate and forces a choice when full: drop messages or make producers wait. Backpressure does the second by slowing the producer when the buffer is full, passing the limit back to the source, so nothing is lost and the delay shows up where it can be acted on.",
  },
  reviews: [
    {
      id: "bp-est",
      format: "estimate",
      scenario: "Arrivals are 900 a second for 5 minutes into consumers that handle 600 a second, with an unbounded queue. How many messages are waiting at the end?",
      unit: "messages",
      answer: 90000,
      acceptFactor: 1.05,
      breakdown: ["excess = 900 − 600 = 300 a second", "× 300 seconds", "= 90,000"],
      explain: "The backlog grows by the excess rate for as long as the excess lasts.",
    },
    {
      id: "bp-pick",
      format: "pick-fix",
      scenario: "A queue's depth has been rising for hours, and the on-call suggests increasing the queue's maximum size 'to be safe'. What is the better fix?",
      options: [
        { id: "a", label: "Add consumers or shed load; a bigger queue only delays the same overload" },
        { id: "b", label: "Increase the queue size tenfold" },
        { id: "c", label: "Add a retry policy" },
        { id: "d", label: "Disable alerts on depth" },
      ],
      answer: "a",
      explain: "When arrivals exceed capacity, no buffer size helps in the long run. Capacity or load has to change.",
    },
    {
      id: "bp-order",
      format: "order",
      scenario: "Order these buffer sizes by the longest wait in the queue during an overload, longest first.",
      items: [
        { id: "inf", label: "Unbounded (240,000 queued)" },
        { id: "b5", label: "Bounded to 5,000" },
        { id: "b1", label: "Bounded to 1,000" },
      ],
      answer: ["inf", "b5", "b1"],
      explain: "The longest wait is the queue length divided by the processing rate, and a bound caps the length.",
    },
    {
      id: "bp-graph",
      format: "predict-graph",
      scenario: "Arrivals exceed capacity by 400 a second for 10 minutes into an unbounded queue. How does the wait for a newly arriving message change over those 10 minutes?",
      xLabel: "time into the spike →",
      yLabel: "wait for a new arrival",
      options: [
        { id: "linear", label: "Rises steadily, then falls after the spike ends", points: [0, 40, 80, 120, 160, 200, 250, 300] },
        { id: "flat", label: "Stays level", points: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: "spike", label: "Jumps at once, then stays", points: [300, 300, 300, 300, 300, 300, 300, 300] },
      ],
      answer: "linear",
      explain: "The backlog grows steadily, so each new arrival waits longer than the last until the arrival rate falls.",
    },
    {
      id: "bp-flaw",
      format: "spot-flaw",
      scenario: "A web server accepts uploads and puts them on an unbounded in-memory queue for a slow processor. During a spike the server runs out of memory and crashes, losing every queued upload. Tap the weak link.",
      diagram: {
        nodes: [
          { id: "upload", label: "uploads (fast)", kind: "client", col: 0, row: 1 },
          { id: "buffer", label: "unbounded in-memory queue", kind: "queue", col: 1, row: 1 },
          { id: "proc", label: "processor (slow)", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "upload", to: "buffer" },
          { from: "buffer", to: "proc" },
        ],
      },
      answer: "upload->buffer",
      explain: "Nothing limits what goes in. Bound the buffer, and either refuse uploads with a clear response or make the producer wait.",
    },
    {
      id: "bp-explain",
      format: "explain",
      scenario: "In two sentences: when should you drop messages rather than slow producers?",
      rubric: [
        { id: "cheap", criterion: "When messages are replaceable or low value, such as metrics or the latest position, and old ones lose value" },
        { id: "wait", criterion: "When messages must not be lost and producers can wait, slow them instead" },
      ],
      exemplar: "Drop when messages are cheap or quickly superseded, like telemetry or a latest location, since delayed ones are worth little. When messages must not be lost and the producer can wait, apply backpressure instead.",
      explain: "Match the policy to the message's value.",
    },
  ],
  codex: {
    oneLiner: "A queue cannot fix sustained overload. Bound it, then drop or slow producers when full; longest wait is buffer size divided by processing rate.",
    keyNumbers: [
      { label: "Backlog after a spike", value: "(arrival − capacity) × duration", sourceId: "ferd-queues" },
      { label: "Longest wait in a bounded buffer", value: "buffer size ÷ processing rate", sourceId: "reactive-manifesto" },
    ],
    tradeoffs: [
      { choice: "Unbounded queue", gain: "Nothing is refused", cost: "Unlimited delay and memory; hides overload" },
      { choice: "Drop when full", gain: "Bounded delay; producers unaffected", cost: "Lost messages" },
      { choice: "Backpressure", gain: "Bounded delay, no loss", cost: "Producers slowed" },
      { choice: "More consumers", gain: "Removes the shortage", cost: "Money; only helps if load is steady" },
    ],
    seenIn: ["Reactive Streams demand signalling.", "TCP flow control and HTTP 429 or 503 shedding."],
    interviewAngle: "Say: 'bound the queue, push back on producers or shed load, and scale consumers for sustained load; an unbounded queue only hides overload'.",
    aws: [{ concept: "Queue depth alarms, throttling and auto scaling on backlog per consumer", service: "SQS, Lambda, Application Auto Scaling" }],
    replay: { id: "pressure-lab", config: { start: { policy: "block", buffer: 1000, consumers: 10 } }, scene: "block" },
  },
  interview: [
    "What is backpressure?",
    "Why is an unbounded queue a risk?",
    "How would you handle a traffic spike bigger than your processing capacity?",
  ],
  deeper: [
    {
      title: "Load shedding at the edge",
      body: "The cheapest place to refuse work is the first place that can. Rejecting a request with a fast 503 or 429 before any queueing or processing costs almost nothing, while accepting it and failing late wastes everything done on the way. Many systems prioritise: shed low-value requests first, and keep critical ones.",
      sourceIds: ["sre-book-overload"],
    },
  ],
  honestPhysics: [
    "A 10-minute spike of 1,200 messages a second against consumers that each handle 100 a second, 8 of them included. Each extra consumer costs $50 a month. Messages are 1 KB. The model is fluid, so it shows shapes, not exact counts.",
    "Unbounded: the queue grows by the excess rate for the whole spike. Bounded with drops: once full, the excess is rejected. Bounded with backpressure: producers are held back by the excess.",
    "Real systems also autoscale, but that takes minutes; the lab shows what a fixed fleet does.",
  ],
  sources: [FERD, REACTIVE, SRE_OVERLOAD],
  verify: [
    { id: "wait", claim: "An unbounded queue leaves the last message waiting 5 minutes", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "unbounded", consumers: 8 }, metric: "latencyS" }, expect: { min: 300, max: 300 } },
    { id: "mem", claim: "…with 240,000 messages in memory", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "unbounded", consumers: 8 }, metric: "memoryGB" }, expect: { min: 0.2, max: 0.3 } },
    { id: "drop", claim: "Dropping at a 1,000 buffer loses a third of the messages", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "drop", buffer: 1000, consumers: 8 }, metric: "droppedPct" }, expect: { min: 0.3, max: 0.36 } },
    { id: "block-wait", claim: "Backpressure at a 1,000 buffer keeps the wait at 1.25 seconds", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "block", buffer: 1000, consumers: 8 }, metric: "latencyS" }, expect: { max: 1.3 } },
    { id: "block-slow", claim: "…while slowing producers a third of the time", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "block", buffer: 1000, consumers: 8 }, metric: "producerSlowPct" }, expect: { min: 0.3 } },
    { id: "good", claim: "Two extra consumers with backpressure slow producers only 17% of the time", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "block", buffer: 1000, consumers: 10 }, metric: "producerSlowPct" }, expect: { max: 0.2 } },
    { id: "good-cost", claim: "…for $100 a month", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "block", buffer: 1000, consumers: 10 }, metric: "costPerMonth" }, expect: { max: 100 } },
    { id: "big-buffer", claim: "A 5,000 buffer breaks the 2-second wait", run: "lab", params: { model: "pressure-lab", config: PRESS_CHALLENGE, values: { policy: "block", buffer: 5000, consumers: 10 }, metric: "latencyS" }, expect: { min: 2 } },
  ],
});
