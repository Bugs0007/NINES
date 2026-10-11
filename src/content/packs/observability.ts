import { definePack } from "../define";

export const OBS = { start: { metrics: true, logs: "error", corr: true, sample: 0.1, tail: true } };
export const OBS_CHALLENGE = {};

const OTEL = { id: "otel-primer", title: "OpenTelemetry docs: Observability primer (logs, metrics, traces)", url: "https://opentelemetry.io/docs/concepts/observability-primer/" };
const DAPPER = { id: "dapper-2010", title: "B. Sigelman et al. (2010), Dapper, a Large-Scale Distributed Systems Tracing Infrastructure (Google Technical Report)", url: "https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/" };
const SRE_MON = { id: "sre-book-monitoring", title: "Google SRE Book, ch. 6: Monitoring Distributed Systems (the four golden signals)", url: "https://sre.google/sre-book/monitoring-distributed-systems/" };

export default definePack({
  id: "observability",
  title: "Logs, Metrics & Traces",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'my order has been stuck for an hour'", detail: "twelve services, no obvious error" },
    lines: [
      { speaker: "kabir", line: "One customer's order is stuck somewhere across twelve services. Every dashboard is green and the logs are a wall of text with nothing tying lines to that order." },
      { speaker: "meera", line: "Each signal answers a different question: is something wrong, where is it, and why. Pay for the ones you will actually need at three in the morning." },
    ],
  },
  predictions: [
    {
      id: "blind",
      kind: "choice",
      prompt: "You log at error level only, without a correlation id, and sample 0.1% of traces at random. One customer's request fails. How long does it take to explain why it failed?",
      options: [
        { id: "min", label: "A few minutes" },
        { id: "half", label: "About half an hour" },
        { id: "hour", label: "More than an hour of searching" },
        { id: "never", label: "It cannot be done" },
      ],
      answer: "hour",
      observe: "blind",
      reveal: {
        text: "Only 1 request in a thousand has a trace, so the failing request almost certainly has none, and error logs with nothing tying them to the request give no thread to follow. Searching twelve services by timestamp and guesswork takes about an hour and a half in the lab.",
        derived: true,
        line: { speaker: "meera", line: "You can only look into what you wrote down at the time." },
      },
    },
    {
      id: "bill",
      kind: "choice",
      prompt: "To never be blind, you log at debug level, trace every request, and keep everything. At 20,000 requests a second, what does the monthly bill look like?",
      options: [
        { id: "k", label: "Around $10,000" },
        { id: "hundred", label: "Around $100,000" },
        { id: "million", label: "Over $1 million" },
      ],
      answer: "million",
      observe: "bill",
      reveal: {
        text: "Tracing every request at 8 spans each is about $829,000 a month, and debug-level logs add about $300,000 more. Telemetry volume scales with traffic, so it grows with your success. Keeping all of it is rarely the best use of the money.",
        derived: true,
        line: { speaker: "rao", line: "An observability bill can exceed the cost of the thing observed." },
      },
    },
  ],
  widget: { id: "observe-lab", config: OBS },
  mechanism: [
    {
      id: "metrics",
      scene: "metrics",
      text: "Metrics are numbers over time: request rate, error rate, latency percentiles, saturation. They are cheap, fast to query and good for alerts, so they answer is something wrong. They carry no detail about any one request. The four golden signals, latency, traffic, errors and saturation, are the usual start.",
      sourceIds: ["sre-book-monitoring", "otel-primer"],
    },
    {
      id: "traces",
      scene: "traces",
      text: "A trace follows one request through every service as a tree of timed spans, linked by a trace id passed along each call. It answers where: which hop was slow or failed. Tracing everything is expensive, so most systems sample, and tail-based sampling keeps the traces that errored or ran slow.",
      sourceIds: ["dapper-2010", "otel-primer"],
    },
    {
      id: "logs",
      scene: "logs",
      text: "Logs are the detailed account of what a service did. They answer why, but only if you can find the right lines. Log structured fields, include the trace or request id in every line, and choose levels with cost in mind: info-level logs for a busy service can cost tens of thousands of dollars a month.",
      sourceIds: ["otel-primer"],
    },
    {
      id: "together",
      text: "The signals work as a path. A metric alert says the error rate rose; a trace shows the payment hop is failing; the logs for that trace id show why. Without a shared id between them each step is a search. Connect them with one correlation id, and spend where each signal adds the most.",
      sourceIds: ["otel-primer", "sre-book-monitoring"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "telemetry",
      title: "Buy the right telemetry",
      brief: "Choose what to collect so an incident is noticed within 5 minutes, located within 10, and one failed request can be explained within 10, for under $20,000 a month at 20,000 requests a second.",
      line: { speaker: "rao", line: "I would like to find the problem fast and not fund a second data centre of logs to do it." },
      widget: { id: "observe-lab", config: OBS_CHALLENGE },
      conditions: [
        { metric: "detectMin", op: "<=", value: 5, label: "Notice within 5 minutes" },
        { metric: "locateMin", op: "<=", value: 10, label: "Locate within 10 minutes" },
        { metric: "explainMin", op: "<=", value: 10, label: "Explain one failure within 10 minutes" },
        { metric: "costPerMonth", op: "<=", value: 20000, label: "Under $20,000 a month" },
      ],
      stars: [{ metric: "costPerMonth", op: "<=", value: 10000, label: "Under $10,000 a month" }],
      hints: [
        "Which signal gives the earliest warning, and what does it cost?",
        "Which requests do you most need a trace for?",
        "What does it cost to log everything, versus to keep the traces that failed?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what logs, metrics and traces each answer, and how you would use them together in an incident.",
    rubric: [
      { id: "metrics", criterion: "Metrics are cheap numbers over time and tell you that something is wrong, driving alerts", keyIdea: "metrics detect" },
      { id: "traces", criterion: "Traces follow one request across services and show where it was slow or failed", keyIdea: "traces locate" },
      { id: "logs", criterion: "Logs give the detailed why, and need a correlation id to be found; cost is controlled by level and sampling", keyIdea: "logs explain" },
    ],
    exemplar:
      "Metrics are cheap numbers over time that drive alerts, so they tell me something is wrong. A trace follows one request across the services and shows where it was slow or failed. Logs give the detailed reason, and only help if every line carries the trace id so I can find the right ones. In an incident I follow the path from alert to trace to logs, and I control cost with tail sampling and sensible log levels.",
  },
  reviews: [
    {
      id: "ob-est",
      format: "estimate",
      scenario: "A service emits 20,000 requests a second with 8 spans each. Tracing every request costs $2 per million spans. About what does a month (2.6 million seconds) cost? ",
      unit: "$ thousand",
      answer: 830,
      acceptFactor: 1.1,
      breakdown: ["20,000 × 8 = 160,000 spans a second", "× 2.6 million seconds = 4.2 × 10¹¹ spans", "× $2 per million ≈ $830,000"],
      explain: "Span volume is traffic times hops, which is why sampling is not optional at scale.",
    },
    {
      id: "ob-pick",
      format: "pick-fix",
      scenario: "Traces are sampled at random at 1%. The failing requests you investigate rarely have a trace. What is the best change that does not raise the cost much?",
      options: [
        { id: "a", label: "Tail-based sampling that always keeps traces that errored or were slow" },
        { id: "b", label: "Trace 100% of requests" },
        { id: "c", label: "Increase the log level to debug" },
        { id: "d", label: "Drop traces and use logs only" },
      ],
      answer: "a",
      explain: "Errors and slow requests are a small share, so keeping all of them costs little while ensuring the interesting traces exist.",
    },
    {
      id: "ob-order",
      format: "order",
      scenario: "Order these signals by cost to collect at 20,000 requests a second, highest first.",
      items: [
        { id: "debug", label: "Debug-level logs" },
        { id: "info", label: "Info-level logs" },
        { id: "metrics", label: "Metrics with alerts" },
      ],
      answer: ["debug", "info", "metrics"],
      explain: "Log volume grows with the level, while metrics are aggregated and cheap whatever the traffic.",
    },
    {
      id: "ob-graph",
      format: "predict-graph",
      scenario: "Without tail sampling, as the share of requests traced rises from 0.01% to 100%, how does the monthly trace cost change?",
      xLabel: "share traced →",
      yLabel: "monthly trace cost",
      options: [
        { id: "linear", label: "Rises in proportion to the share", points: [83, 830, 8300, 41000, 83000, 415000, 830000, 829000] },
        { id: "flat", label: "Stays about the same", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "knee", label: "Flat then jumps at 1%", points: [100, 100, 100, 8300, 8300, 8300, 8300, 829000] },
      ],
      answer: "linear",
      explain: "Each traced request costs the same number of spans, so cost is proportional to the sampling rate.",
    },
    {
      id: "ob-flaw",
      format: "spot-flaw",
      scenario: "Each service logs the order id in its own field name (orderId, order_id, oid, id), and no trace id is passed between services. An engineer needs to follow one order. Tap the part that breaks the trail.",
      diagram: {
        nodes: [
          { id: "api", label: "api (orderId)", kind: "server", col: 0, row: 1 },
          { id: "pay", label: "payments (order_id)", kind: "server", col: 1, row: 1 },
          { id: "ship", label: "shipping (oid)", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "api", to: "pay" },
          { from: "pay", to: "ship" },
        ],
      },
      answer: "api->pay",
      explain: "No identifier is carried across the call, and names differ, so lines cannot be joined. Pass a trace or correlation id on every call and log it under one agreed field.",
    },
    {
      id: "ob-explain",
      format: "explain",
      scenario: "In two sentences: why not just rely on logs for everything?",
      rubric: [
        { id: "cost", criterion: "Logs are the most expensive signal at scale and slow to search, so using them for detection and aggregates is wasteful" },
        { id: "shape", criterion: "Metrics aggregate cheaply for alerts and traces show structure across services, which free-text logs do not" },
      ],
      exemplar: "Logs are the most costly signal per event and slow to search, so using them to detect problems or compute rates is wasteful. Metrics aggregate cheaply for alerts and traces show the shape of a request across services, which free-text logs do not.",
      explain: "Use each signal for the question it answers best.",
    },
  ],
  codex: {
    oneLiner: "Metrics detect, traces locate, logs explain. Connect them with one correlation id, keep errors and slow traces, and watch the telemetry bill.",
    keyNumbers: [
      { label: "The four golden signals", value: "latency, traffic, errors, saturation", sourceId: "sre-book-monitoring" },
      { label: "Tracing every request at 20,000 req/s, 8 spans each", value: "about $830,000 a month", sourceId: "dapper-2010" },
    ],
    tradeoffs: [
      { choice: "Metrics and alerts", gain: "Cheap, fast detection", cost: "No per-request detail" },
      { choice: "Head-sampled traces", gain: "Predictable cost", cost: "Most failures are unsampled" },
      { choice: "Tail-sampled traces", gain: "Keeps the failures and slow requests", cost: "Needs buffering infrastructure" },
      { choice: "Verbose logs", gain: "Every detail", cost: "Cost and noise" },
    ],
    seenIn: ["OpenTelemetry collectors with tail sampling.", "Dashboards built on the four golden signals."],
    interviewAngle: "Say: 'metrics for alerts, traces to find the hop, logs with the trace id to explain, and tail sampling to keep what matters'.",
    aws: [{ concept: "Metrics, traces and logs", service: "CloudWatch, X-Ray" }],
    replay: { id: "observe-lab", config: OBS, scene: "traces" },
  },
  interview: [
    "What are the three pillars of observability?",
    "How do you debug one slow request across many services?",
    "How do you keep tracing affordable?",
  ],
  deeper: [
    {
      title: "High-cardinality events",
      body: "Metrics become expensive and slow when labelled by something with millions of values, like a user id. Wide structured events, one per request with dozens of fields, let you slice by any field after the fact and answer questions nobody planned for. Many teams store those events with sampling instead of pre-aggregating everything into metrics.",
      sourceIds: ["otel-primer"],
    },
  ],
  honestPhysics: [
    "A service handling 20,000 requests a second with 8 spans each. Metrics alert in about 2 minutes (25 without them). Traces locate the failing hop in 4 minutes if the failing requests have traces, 12 if 5% of them do, 30 otherwise. Logs explain in 8 minutes with an id at info level, 25 at error level, 90 without an id. A kept trace carries the detail, so tail sampling also explains in 8.",
    "Costs per month: metrics $2,000; logs at error level $750, info $30,000, debug $300,000; traces $829,000 if all are kept, and tail sampling adds 0.5% for errors and slow requests.",
    "All are round figures for comparison.",
  ],
  sources: [OTEL, DAPPER, SRE_MON],
  verify: [
    { id: "good-cost", claim: "Metrics, error logs with ids and tail-sampled traces cost under $10,000", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "error", corr: true, sample: 0.1, tail: true }, metric: "costPerMonth" }, expect: { max: 10000 } },
    { id: "good-detect", claim: "…and detect in 2 minutes", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "error", corr: true, sample: 0.1, tail: true }, metric: "detectMin" }, expect: { max: 5 } },
    { id: "good-locate", claim: "…locate in 4", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "error", corr: true, sample: 0.1, tail: true }, metric: "locateMin" }, expect: { max: 10 } },
    { id: "good-explain", claim: "…and explain in 8", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "error", corr: true, sample: 0.1, tail: true }, metric: "explainMin" }, expect: { max: 10 } },
    { id: "head-sampled", claim: "Head-sampling 1% leaves failures untraced: 30 minutes to locate", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "info", corr: true, sample: 1, tail: false }, metric: "locateMin" }, expect: { min: 30 } },
    { id: "info-logs", claim: "Info-level logs alone cost over $30,000", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "info", corr: true, sample: 1, tail: false }, metric: "costPerMonth" }, expect: { min: 30000 } },
    { id: "all", claim: "Debug logs and full tracing cost over $1 million", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: true, logs: "debug", corr: true, sample: 100, tail: false }, metric: "costPerMonth" }, expect: { min: 1000000 } },
    { id: "no-metrics", claim: "Without metrics customers tell you after 25 minutes", run: "lab", params: { model: "observe-lab", config: OBS_CHALLENGE, values: { metrics: false }, metric: "detectMin" }, expect: { min: 25 } },
  ],
});
