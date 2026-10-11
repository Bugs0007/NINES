import { defineBoss } from "../define";

export const NTC = {};

const SQS_DLQ = { id: "sqs-dlq", title: "AWS docs: Amazon SQS dead-letter queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" };
const AWS_BACKOFF = { id: "aws-backoff", title: "AWS Builders' Library: Timeouts, retries, and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };
const STRIPE_IDEM = { id: "stripe-idempotency", title: "Stripe: Designing robust and predictable APIs with idempotency", url: "https://stripe.com/blog/idempotency" };

export default defineBoss({
  id: "case-notification-system",
  title: "Case: Notification System",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "marketing blast · 10 million sends in 10 minutes", detail: "provider accepts 5,000 a second; 70% of messages dropped" },
    lines: [{ speaker: "kabir", line: "Marketing sent ten million notifications in ten minutes. The provider takes five thousand a second, so most were dropped, and retries sent some people three copies." }],
  },
  intro: [
    { speaker: "meera", line: "Four properties compete: nothing lost, nothing doubled, not too late, and not too many per person." },
    { speaker: "rao", line: "The provider is a rate you do not control. Everything you build sits between a burst and that rate." },
  ],
  forecast: {
    metric: "lostShare",
    prompt: "Sending directly to a provider that accepts 5,000 a second, what share of a 16,700-a-second blast is never delivered?",
    unit: "%",
    scale: 100,
    min: 1,
    max: 100,
    tolerance: 1.2,
  },
  exercises: ["fan-out-pubsub", "dlq-poison", "backpressure", "idempotency"],
  challenge: {
    id: "design-notifications",
    title: "Run the blast",
    brief: "Lose at most 0.1% of notifications, deliver at most 0.1% twice, have the last message arrive within 10 minutes, and let at most 0.5% of users be spammed.",
    line: { speaker: "meera", line: "A queue holds the burst. What the workers do with failures decides the rest." },
    widget: { id: "notification-lab", config: NTC },
    conditions: [
      { metric: "lostShare", op: "<=", value: 0.001, label: "At most 0.1% lost" },
      { metric: "duplicateShare", op: "<=", value: 0.001, label: "At most 0.1% delivered twice" },
      { metric: "delayMin", op: "<=", value: 10, label: "Last message within 10 minutes" },
      { metric: "spamShare", op: "<=", value: 0.005, label: "At most 0.5% of users spammed" },
    ],
    stars: [{ metric: "lostShare", op: "<=", value: 0.0001, label: "At most 0.01% lost" }],
    hints: ["What holds a burst bigger than the provider's rate?", "What makes a retry safe?", "How could the drain time be halved?"],
  },
  debrief: [
    { id: "queue", text: "Sending directly turns the provider's rate limit into message loss: 70% gone. A queue turns the same limit into delay: the backlog drains at the provider's rate, 23 minutes with one provider and 7 with two, and nothing is dropped.", derived: true },
    { id: "retry", text: "Workers retry failures with backoff and, after a few attempts, park the message in a dead-letter queue to inspect and replay: 0.5% lost became 0.05% and then none. A retry after a lost acknowledgement duplicates; an idempotency key per notification reduces 3% duplicates to 0.01%.", sourceIds: ["sqs-dlq", "aws-backoff", "stripe-idempotency"] },
    { id: "limit", text: "A per-user frequency limit stopped the 4% of users who would otherwise get more than five messages in an hour. It also protects the channel: spam gets the sender flagged.", derived: true },
  ],
  outro: { speaker: "kabir", line: "A queue, keyed retries with a dead-letter queue, a user limit and a second provider. Everyone gets one message within seven minutes." },
  explainBack: {
    prompt: "Explain how your notification system handles a blast far above the provider's rate.",
    rubric: [
      { id: "queue", criterion: "A queue decouples the burst from the provider's rate, so excess becomes delay and not loss; a second provider adds capacity", keyIdea: "queue the burst" },
      { id: "retry", criterion: "Retry with backoff and park poison messages in a dead-letter queue for replay", keyIdea: "retries and DLQ" },
      { id: "idem", criterion: "An idempotency key per notification prevents duplicates on retry", keyIdea: "idempotent sends" },
      { id: "limit", criterion: "Per-user limits stop spam and protect the sender's reputation", keyIdea: "per-user limits" },
    ],
    exemplar:
      "A queue sits between the burst and the provider, so the excess waits instead of being dropped, and a second provider doubles the drain rate so the last message arrives in about seven minutes. Workers retry failures with backoff and park the stubborn ones in a dead-letter queue for replay, and an idempotency key on each notification stops a retry after a lost acknowledgement from sending twice. A per-user frequency limit keeps people from being spammed and protects the sender's reputation.",
  },
  honestPhysics: [
    "A blast of 10 million notifications over 10 minutes is 16,700 a second against a provider that takes 5,000, or 10,000 with a second provider. Direct sending loses everything above the provider's rate; a queue turns it into delay, (16,700 − capacity) × 600 ÷ capacity seconds.",
    "A queue without retries drops 0.5% to provider errors, backoff retries 0.05%, a dead-letter queue with replay none. Retries duplicate 3% without an idempotency key and 0.01% with one. Without a per-user limit 4% of users receive more than five messages in an hour. Round figures.",
  ],
  sources: [SQS_DLQ, AWS_BACKOFF, STRIPE_IDEM],
  verify: [
    { id: "forecast", claim: "Direct sending loses 70% of the blast", run: "lab", params: { model: "notification-lab", config: NTC, values: {}, metric: "lostShare" }, expect: { min: 0.69, max: 0.71 } },
    { id: "delay1", claim: "A queue with one provider makes the last message 23 minutes late", run: "lab", params: { model: "notification-lab", config: NTC, values: { transport: "queue" }, metric: "delayMin" }, expect: { min: 23, max: 24 } },
    { id: "delay2", claim: "A second provider cuts it to 7 minutes", run: "lab", params: { model: "notification-lab", config: NTC, values: { transport: "queue", fallback: true }, metric: "delayMin" }, expect: { min: 6.5, max: 6.8 } },
    { id: "dupes", claim: "Retries without keys send 3% twice", run: "lab", params: { model: "notification-lab", config: NTC, values: { transport: "queue", retries: "backoff", dedupe: false }, metric: "duplicateShare" }, expect: { min: 0.029, max: 0.031 } },
    { id: "keys", claim: "Keys cut that to 0.01%", run: "lab", params: { model: "notification-lab", config: NTC, values: { transport: "queue", retries: "backoff", dedupe: true }, metric: "duplicateShare" }, expect: { max: 0.0002 } },
    { id: "dlq", claim: "A dead-letter queue with replay loses nothing", run: "lab", params: { model: "notification-lab", config: NTC, values: { transport: "queue", retries: "dlq", fallback: true }, metric: "lostShare" }, expect: { max: 0 } },
    { id: "spam", claim: "Without a limit 4% of users are spammed", run: "lab", params: { model: "notification-lab", config: NTC, values: { limit: false }, metric: "spamShare" }, expect: { min: 0.04, max: 0.04 } },
  ],
});
