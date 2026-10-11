import { defineBoss } from "../define";

export const DPC = {};

const BATCH = { id: "anthropic-batch", title: "Claude docs: Message Batches (half price, results within 24 hours)", url: "https://docs.anthropic.com/en/docs/build-with-claude/batch-processing" };
const TOOL_USE = { id: "anthropic-tool-use", title: "Claude docs: Tool use (a JSON schema constrains the shape of the output)", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" };
const SQS_DLQ = { id: "sqs-dlq", title: "AWS docs: Amazon SQS dead-letter queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" };

export default defineBoss({
  id: "case-doc-pipeline",
  title: "Case: Document-processing Pipeline",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "ops · 6,000 invoices dropped during the month-end surge", detail: "one malformed PDF has blocked a worker for three hours" },
    lines: [{ speaker: "kabir", line: "At month end twelve thousand invoices an hour arrive and our workers read six thousand, so half were dropped. One malformed PDF has blocked a worker since lunch." }],
  },
  intro: [
    { speaker: "meera", line: "A document pipeline is a queue, a fallible reader and a checker. Each stage fails differently, and the failures need somewhere to go." },
    { speaker: "rao", line: "Accuracy is the product, but the budget is per document, and the surge arrives whether you are ready or not." },
  ],
  forecast: {
    metric: "droppedShare",
    prompt: "Ten workers, no queue, 600 documents an hour each, and a surge of 12,000 an hour. What share of documents in the surge is dropped?",
    unit: "%",
    scale: 100,
    min: 1,
    max: 100,
    tolerance: 1.3,
  },
  exercises: ["queues-vs-logs", "structured-outputs", "dlq-poison"],
  challenge: {
    id: "design-doc-pipeline",
    title: "Run the pipeline",
    brief: "Extract at least 97% of documents fully right at $0.013 or less each, get stuck documents under 0.1%, drop none in a surge, and clear a surge within an hour.",
    line: { speaker: "rao", line: "Every document read, accurately, cheaply, and none lost in a spike." },
    widget: { id: "docpipe-lab", config: DPC },
    conditions: [
      { metric: "extractionAccuracy", op: ">=", value: 0.97, label: "At least 97% extracted fully right" },
      { metric: "costPerDoc", op: "<=", value: 0.013, label: "At most $0.013 a document" },
      { metric: "stuckShare", op: "<=", value: 0.001, label: "Under 0.1% stuck" },
      { metric: "droppedShare", op: "<=", value: 0, label: "Nothing dropped in a surge" },
      { metric: "latencyHours", op: "<=", value: 1, label: "A surge clears within an hour" },
    ],
    stars: [],
    hints: ["What holds a surge bigger than the workers?", "What bounds the shape of a model's answer?", "Where should a document that crashes the extractor go?"],
  },
  debrief: [
    { id: "queue", text: "Without a queue, anything above the workers' rate is dropped: 50% of a surge. A queue turns the surge into delay. A poison document, one that crashes the extractor, can block its place; a dead-letter queue moves it aside for a person.", sourceIds: ["sqs-dlq"] },
    { id: "schema", text: "Constraining extraction to a schema took documents extracted fully right from 86% to 95% and cut the cost per document, since there are fewer retries and shorter outputs. Validating against business rules (totals add up, dates are real) added three points more.", sourceIds: ["anthropic-tool-use"] },
    { id: "batch", text: "The batch interface halves the model cost and answers within hours, which suits a back-office pipeline with no one waiting and not a surge you must clear within the hour. Choose it where latency is allowed.", sourceIds: ["anthropic-batch"] },
  ],
  outro: { speaker: "kabir", line: "Queue, schema, validation, a dead-letter queue, twenty workers. Ninety-eight percent right, a penny and a quarter a document, and the surge clears in minutes." },
  explainBack: {
    prompt: "Explain how your pipeline survives a surge, stays accurate and handles documents it cannot read.",
    rubric: [
      { id: "queue", criterion: "A queue absorbs the surge so excess becomes delay and not loss, with workers sized to clear it in time", keyIdea: "queue the surge" },
      { id: "schema", criterion: "Constrain extraction to a schema and validate with business rules to raise accuracy", keyIdea: "schema and validation" },
      { id: "dlq", criterion: "Send failures to a dead-letter queue for review so a poison document cannot block the line", keyIdea: "dead-letter queue" },
      { id: "cost", criterion: "Match the interface to the latency need: batch for half price when nobody is waiting, real-time when someone is", keyIdea: "batch versus real time" },
    ],
    exemplar:
      "A queue between upload and workers absorbs the month-end surge so the excess becomes a short delay instead of dropped documents, with twenty workers clearing it in minutes. Extraction is constrained to a schema and validated against business rules, which lifts documents fully right from 86 to 98 percent at about a penny and a quarter each. Failures go to a dead-letter queue for a person, so a malformed PDF cannot block a worker, and I would use the cheaper batch interface only where no one is waiting.",
  },
  honestPhysics: [
    "200,000 scanned documents a day in surges of 12,000 an hour. A worker handles 600 an hour. Free-text extraction is fully right for 86% of documents, schema-constrained 95%; business-rule validation adds 4 points to free text, 3 to structured output.",
    "Without a queue, documents above the workers' rate are dropped. A poison document blocks its line: 0.5% get stuck unless failures go to a dead-letter queue. Batch pricing is half and returns within 12 hours. A document costs $0.011 with a schema, $0.014 without, plus $0.0015 for OCR. Round figures.",
  ],
  sources: [BATCH, TOOL_USE, SQS_DLQ],
  verify: [
    { id: "forecast", claim: "Ten workers and no queue drop half of a surge", run: "lab", params: { model: "docpipe-lab", config: DPC, values: {}, metric: "droppedShare" }, expect: { min: 0.5, max: 0.5 } },
    { id: "free", claim: "Free-text extraction is right 86% of the time", run: "lab", params: { model: "docpipe-lab", config: DPC, values: {}, metric: "extractionAccuracy" }, expect: { min: 0.86, max: 0.86 } },
    { id: "schema", claim: "A schema and validation reach 98%", run: "lab", params: { model: "docpipe-lab", config: DPC, values: { structured: true, validate: true }, metric: "extractionAccuracy" }, expect: { min: 0.98, max: 0.98 } },
    { id: "stuck", claim: "Without a dead-letter queue 0.5% are stuck", run: "lab", params: { model: "docpipe-lab", config: DPC, values: { queue: true }, metric: "stuckShare" }, expect: { min: 0.005, max: 0.005 } },
    { id: "good", claim: "The full design costs $0.0125 a document", run: "lab", params: { model: "docpipe-lab", config: DPC, values: { queue: true, workers: 21, structured: true, validate: true, dlq: true }, metric: "costPerDoc" }, expect: { min: 0.0124, max: 0.0126 } },
    { id: "queue-slow", claim: "A queue with 10 workers takes 6 hours to clear a surge", run: "lab", params: { model: "docpipe-lab", config: DPC, values: { queue: true, workers: 10 }, metric: "latencyHours" }, expect: { min: 5.9, max: 6.2 } },
    { id: "batch", claim: "The batch interface halves the extraction cost but takes 12 hours", run: "lab", params: { model: "docpipe-lab", config: DPC, values: { queue: true, workers: 21, structured: true, validate: true, dlq: true, batch: true }, metric: "latencyHours" }, expect: { min: 12, max: 12 } },
  ],
});
