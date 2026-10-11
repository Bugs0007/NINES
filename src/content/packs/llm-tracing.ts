import { definePack } from "../define";

export const TR = { start: { prompts: false, tools: false, links: false, versions: false, tail: false, sampling: 1, redact: false } };
export const TR_CHALLENGE = { start: { prompts: false, tools: false, links: false, versions: false, tail: false, sampling: 1, redact: false } };

const OTEL_GENAI = { id: "otel-genai", title: "OpenTelemetry: Semantic conventions for generative AI (spans for model calls, tokens and tools)", url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/" };
const OTEL_SAMPLING = { id: "otel-sampling", title: "OpenTelemetry docs: Sampling (head and tail sampling)", url: "https://opentelemetry.io/docs/concepts/sampling/" };
const OTEL_TRACES = { id: "otel-traces", title: "OpenTelemetry docs: Traces and spans", url: "https://opentelemetry.io/docs/concepts/signals/traces/" };

export default definePack({
  id: "llm-tracing",
  title: "Tracing Prompts & Tool Calls",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "ticket · 'the assistant told me the wrong refund policy'", detail: "trace: 9 spans, 4.1 s, no errors" },
    lines: [
      { speaker: "kabir", line: "We found the trace for that complaint: nine spans, all green. It says the answer was slow, not why it was wrong." },
      { speaker: "meera", line: "A trace without the prompt, the retrieved text and the tool results tells you the system ran. It cannot tell you why it said what it said." },
    ],
  },
  predictions: [
    {
      id: "blind",
      kind: "choice",
      prompt: "Your tracing records every step as a span, linked to its parent, with timings. It does not record prompts, retrieved passages or tool results. What share of wrong-answer reports can you diagnose from it?",
      options: [
        { id: "all", label: "Nearly all: the timeline shows what happened" },
        { id: "half", label: "About half" },
        { id: "quarter", label: "About a quarter: you see the shape, not the content" },
      ],
      answer: "quarter",
      observe: "blind",
      reveal: {
        text: "Links tell you the order of steps, and that is a quarter of the story in the lab. The cause of a wrong answer is usually in the content: the passage retrieved, the argument passed to a tool, the result that came back. Without it you can see a slow step and no reason.",
        derived: true,
        line: { speaker: "rao", line: "Structure without content is a map with no place names." },
      },
    },
    {
      id: "bloat",
      kind: "choice",
      prompt: "You capture everything on every trace: prompts, tool payloads, links and versions. At five million traces a day, about how much storage is that per day?",
      options: [
        { id: "12", label: "About 12 GB" },
        { id: "117", label: "About 117 GB" },
        { id: "1200", label: "About 1.2 TB" },
      ],
      answer: "117",
      observe: "bloat",
      reveal: {
        text: "Each full trace is about 23.5 KB (2 for structure, 12 for prompts, 8 for tool payloads, 1.5 for links and versions), times five million is 117 GB a day, about 3.5 TB a month. Keeping everything is possible and costly. Tail sampling keeps all the failures and a slice of the rest.",
        derived: true,
        line: { speaker: "meera", line: "Keep what you will need. Sample the rest." },
      },
    },
  ],
  widget: { id: "trace-lab", config: TR },
  mechanism: [
    {
      id: "spans",
      text: "A trace is the story of one request: a tree of spans, each a timed step, linked to its parent. For an LLM application the spans are model calls, retrievals, tool calls and the code between them. Standard conventions name the fields (model, token counts, finish reason) so tools can read them.",
      sourceIds: ["otel-traces", "otel-genai"],
    },
    {
      id: "content",
      scene: "capture",
      text: "To debug a wrong answer you need content: the full prompt as the model saw it, the retrieved passages, the tool arguments and results, and the model version and parameters. With those a failure can usually be traced to its cause, such as a bad retrieval or a misread tool result. Without them it is a guess.",
      sourceIds: ["otel-genai"],
    },
    {
      id: "sampling",
      scene: "tail",
      text: "Storing everything is costly, and head sampling, keeping a random fraction, throws away failures at the same rate as successes. Tail sampling decides after the request is done: keep every trace that errored, was slow or scored badly, and a small share of the rest. That keeps what you need to debug.",
      sourceIds: ["otel-sampling"],
    },
    {
      id: "privacy",
      scene: "redact",
      text: "Prompts contain what users typed, so a trace store holds personal and sometimes confidential data. Redact before storing, restrict who can read traces, set a retention period, and keep them out of general logging. Tracing makes an application observable and, done carelessly, becomes the most sensitive database you run.",
      sourceIds: ["otel-genai"],
    },
  ],
  challenges: [
    {
      id: "trace-setup",
      title: "Set up tracing",
      brief: "Be able to diagnose at least 95% of failures, store at most 15 GB a day for five million traces, and redact personal data before storing.",
      line: { speaker: "rao", line: "I want to debug any bad answer without keeping the whole internet." },
      widget: { id: "trace-lab", config: TR_CHALLENGE },
      conditions: [
        { metric: "diagnosable", op: ">=", value: 0.95, label: "At least 95% of failures diagnosable" },
        { metric: "storageGBDay", op: "<=", value: 15, label: "At most 15 GB a day" },
        { metric: "redacted", op: ">=", value: 1, label: "Personal data redacted" },
      ],
      stars: [{ metric: "storageGBDay", op: "<=", value: 8, label: "At most 8 GB a day" }],
      hints: ["What must a trace contain to explain a wrong answer?", "What does random sampling do to your failures?", "What happens to personal data in a prompt?"],
    },
  ],
  explainBack: {
    prompt: "Explain what an LLM trace needs to contain and how to keep tracing affordable and safe.",
    rubric: [
      { id: "content", criterion: "Prompts and retrieved context, tool arguments and results, parent-child links, and model version and parameters", keyIdea: "content and structure" },
      { id: "sampling", criterion: "Tail sampling keeps failed and low-scoring traces and a share of the rest, where head sampling loses failures", keyIdea: "tail sampling" },
      { id: "privacy", criterion: "Redact personal data before storing, restrict access and set retention", keyIdea: "traces are sensitive" },
    ],
    exemplar:
      "A useful trace holds the prompt and retrieved context as the model saw them, the tool arguments and results, the parent-child links between steps, and the model version and parameters. Storing everything is expensive, so I would use tail sampling to keep every failed or low-scoring trace and a share of the rest, since random head sampling loses failures at the same rate as successes. And I would redact personal data before storing, limit access and set a retention period, because traces hold what users typed.",
  },
  reviews: [
    {
      id: "tr-est",
      format: "estimate",
      scenario: "A full trace is 23.5 KB. At five million traces a day, how many GB a day is that?",
      unit: "GB",
      answer: 117.5,
      acceptFactor: 1.05,
      breakdown: ["23.5 KB × 5,000,000 = 117,500,000 KB", "= 117.5 GB a day"],
      explain: "Prompts dominate a trace's size. That is also where the value is.",
    },
    {
      id: "tr-pick",
      format: "pick-fix",
      scenario: "Random 1% sampling of traces means you rarely have the trace for a user's complaint. What is the better design?",
      options: [
        { id: "a", label: "Tail sampling: keep every failed, slow or low-scoring trace plus a small share of the rest" },
        { id: "b", label: "Raise random sampling to 5%" },
        { id: "c", label: "Stop recording prompts" },
        { id: "d", label: "Ask users to reproduce the problem" },
      ],
      answer: "a",
      explain: "The traces worth keeping are the ones where something went wrong, and you only know after the request finishes.",
    },
    {
      id: "tr-order",
      format: "order",
      scenario: "Order these captures by share of failures diagnosable, most first (in the lab).",
      items: [
        { id: "all", label: "Prompts, tool data, links and versions" },
        { id: "three", label: "Prompts, tool data and links" },
        { id: "prompts", label: "Prompts only" },
        { id: "links", label: "Links only" },
      ],
      answer: ["all", "three", "prompts", "links"],
      explain: "100%, 90%, 35% and 25%: content matters, structure helps and versions close the gap.",
    },
    {
      id: "tr-graph",
      format: "predict-graph",
      scenario: "With head sampling and full capture, how does the share of failures you can diagnose vary with the share of traces kept?",
      xLabel: "share of traces kept →",
      yLabel: "failures diagnosable",
      options: [
        { id: "line", label: "A straight line: keep 10%, diagnose 10%", points: [10, 25, 40, 55, 70, 85, 95, 100] },
        { id: "flat", label: "Nearly all failures at any rate", points: [100, 100, 100, 100, 100, 100, 100, 100] },
        { id: "late", label: "Nothing until most traces are kept", points: [0, 0, 0, 0, 5, 20, 60, 100] },
      ],
      answer: "line",
      explain: "Random sampling does not know which traces failed, so it keeps failures at the same rate as everything else.",
    },
    {
      id: "tr-flaw",
      format: "spot-flaw",
      scenario: "A team stores full prompts and tool results in a general logging system that every engineer can search, with no retention limit. Tap the problem.",
      diagram: {
        nodes: [
          { id: "app", label: "assistant", kind: "server", col: 0, row: 1 },
          { id: "log", label: "shared log search, kept forever", kind: "store", col: 1, row: 1 },
          { id: "eng", label: "all engineers", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "app", to: "log" },
          { from: "log", to: "eng" },
        ],
      },
      answer: "app->log",
      explain: "Prompts hold what customers typed. Redact before storing, and keep traces in a store with access control and a retention period.",
    },
    {
      id: "tr-explain",
      format: "explain",
      scenario: "In two sentences: why is a trace with timings and links but no prompts of limited use for wrong answers?",
      rubric: [
        { id: "cause", criterion: "Wrong answers usually come from content: bad retrieval, a misread tool result or a poor prompt, which timings do not show" },
        { id: "shape", criterion: "Structure shows where time went and which step ran, but not what was said at that step" },
      ],
      exemplar: "Wrong answers usually come from content, such as a bad retrieval or a misread tool result, and timings do not show that. Structure tells you which step ran and how long it took, not what was said at that step.",
      explain: "Capture the content, carefully.",
    },
  ],
  codex: {
    oneLiner: "A trace is a tree of timed spans. For LLM apps, capture prompts, context and tool data, tail-sample failures, and redact before storing.",
    keyNumbers: [
      { label: "Full trace, five million a day (lab)", value: "117.5 GB a day", sourceId: "otel-genai" },
      { label: "With tail sampling at 5% (lab)", value: "8 GB a day", sourceId: "otel-sampling" },
    ],
    tradeoffs: [
      { choice: "Capture prompts and tool data", gain: "Can explain wrong answers", cost: "Storage and sensitive data" },
      { choice: "Head sampling", gain: "Simple and cheap", cost: "Loses failures" },
      { choice: "Tail sampling", gain: "Keeps what you need", cost: "Buffering until the request ends" },
    ],
    seenIn: ["Langfuse, LangSmith and Arize-style LLM observability tools.", "OpenTelemetry GenAI conventions."],
    interviewAngle: "Say: 'spans for each model call, retrieval and tool; content captured and redacted; tail-sample failures; link evals to traces'.",
    aws: [{ concept: "Tracing and storage", service: "AWS X-Ray or OpenTelemetry to CloudWatch; S3 for payloads" }],
    replay: { id: "trace-lab", config: TR, scene: "capture" },
  },
  interview: [
    "What would you log for an LLM application?",
    "How do you debug a wrong answer in production?",
    "How do you handle personal data in traces?",
  ],
  deeper: [
    {
      title: "Traces feed evaluation",
      body: "A trace store is also a source of test cases. Failed and thumbs-down traces become regression examples, with the right answer filled in, and a sample of passing traces can be scored automatically to watch quality drift. Link each trace to the prompt and model version so a regression can be tied to a change.",
      sourceIds: ["otel-genai"],
    },
  ],
  honestPhysics: [
    "Five million traces a day. To diagnose a failure you need the prompts and retrieved context (35 points of the story), the tool arguments and results (30), the parent-child links (25) and the model version and parameters (10).",
    "Capturing costs 2 KB of structure, 12 KB with prompts, 8 KB with tool data, 1 KB for links and 0.5 KB for versions. Head sampling keeps a share of failures equal to its rate. Tail sampling keeps every failed or low-scoring trace (2% of traffic) plus the share you set of the rest. Round figures.",
  ],
  sources: [OTEL_GENAI, OTEL_SAMPLING, OTEL_TRACES],
  verify: [
    { id: "blind", claim: "Links alone let you diagnose about a quarter of failures", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { links: true }, metric: "diagnosable" }, expect: { min: 0.24, max: 0.26 } },
    { id: "full", claim: "Full capture of every trace is about 117.5 GB a day", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { prompts: true, tools: true, links: true, versions: true, sampling: 1 }, metric: "storageGBDay" }, expect: { min: 117, max: 118 } },
    { id: "head", claim: "Head sampling at 10% diagnoses only 10% of failures", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { prompts: true, tools: true, links: true, versions: true, sampling: 0.1 }, metric: "diagnosable" }, expect: { min: 0.09, max: 0.11 } },
    { id: "tail", claim: "Tail sampling at 5% keeps every failure in 8 GB a day", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { prompts: true, tools: true, links: true, versions: true, tail: true, sampling: 0.05 }, metric: "storageGBDay" }, expect: { min: 7.5, max: 8.5 } },
    { id: "tail-diag", claim: "…and diagnoses all of them", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { prompts: true, tools: true, links: true, versions: true, tail: true, sampling: 0.05 }, metric: "diagnosable" }, expect: { min: 0.99 } },
    { id: "no-versions", claim: "Leaving out versions caps diagnosis at 90%", run: "lab", params: { model: "trace-lab", config: TR_CHALLENGE, values: { prompts: true, tools: true, links: true, versions: false, tail: true, sampling: 0.05 }, metric: "diagnosable" }, expect: { min: 0.89, max: 0.91 } },
  ],
});
