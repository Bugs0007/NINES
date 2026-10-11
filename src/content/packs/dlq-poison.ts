import { definePack } from "../define";

export const DLQ = { lockOrdered: true, ordered: true, start: { receives: 10, dlq: true } };
export const DLQ_CHALLENGE = { lockOrdered: true, ordered: true };

const SQS_DLQ = { id: "sqs-dlq", title: "AWS docs: Amazon SQS dead-letter queues (maxReceiveCount, redrive)", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" };
const UBER = { id: "uber-reprocessing", title: "Uber Engineering: Building Reliable Reprocessing and Dead Letter Queues with Apache Kafka", url: "https://www.uber.com/blog/reliable-reprocessing/" };
const BUILDERS = { id: "builders-timeouts", title: "Amazon Builders' Library: Timeouts, retries and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };

export default definePack({
  id: "dlq-poison",
  title: "Poison Messages & DLQs",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "workers · all 20 hung, queue depth rising", detail: "the same message id appears in every worker's log" },
    lines: [
      { speaker: "kabir", line: "One malformed message crashes the parser. The queue delivers it again, another worker crashes, and by the weekend all twenty are stuck on four bad messages." },
      { speaker: "meera", line: "A message that can never succeed will be retried forever unless something sets it aside. The queue needs somewhere to put the ones that failed." },
    ],
  },
  predictions: [
    {
      id: "jam",
      kind: "choice",
      prompt: "Four poison messages arrive a day. Each attempt on one hangs a worker for 30 seconds, then the message is redelivered. There is no dead-letter queue and there are 20 workers. After a week, how many workers are jammed?",
      options: [
        { id: "none", label: "None: the hangs time out" },
        { id: "few", label: "A few, then it recovers" },
        { id: "all", label: "All 20: poison messages outnumber the workers" },
      ],
      answer: "all",
      observe: "jam",
      reveal: {
        text: "Each poison message cycles forever, always occupying a worker. Four a day is 28 after a week, more than the 20 workers, so every worker is always busy on a message that can never succeed, and good messages wait behind them.",
        derived: true,
        line: { speaker: "meera", line: "Retrying forever is not persistence. It is a leak." },
      },
    },
    {
      id: "noisy",
      kind: "choice",
      prompt: "You add a dead-letter queue but give up after 3 receives. 2% of ordinary messages hit a transient error and each retry fails again half the time. Of a million messages a day, how many ordinary ones are dead-lettered?",
      options: [
        { id: "few", label: "About 25" },
        { id: "hundreds", label: "About 300" },
        { id: "thousands", label: "About 2,500" },
        { id: "all", label: "About 20,000" },
      ],
      answer: "thousands",
      observe: "noisy",
      reveal: {
        text: "20,000 messages a day hit a transient error. Each has a one-in-eight chance of failing all three attempts, so 2,500 healthy messages a day land in the dead-letter queue, drowning the real poison in noise. Giving up too early is its own failure.",
        derived: true,
        line: { speaker: "rao", line: "A dead-letter queue nobody can read is just a different way to lose messages." },
      },
    },
  ],
  widget: { id: "dlq-lab", config: DLQ },
  mechanism: [
    {
      id: "poison",
      scene: "poison",
      text: "A poison message is one that fails every time it is processed, because it is malformed, refers to something deleted, or hits a bug. A queue redelivers failures, so it comes back again and again, holding a worker each time. Without a limit, a few such messages can occupy the whole fleet.",
      sourceIds: ["sqs-dlq", "uber-reprocessing"],
    },
    {
      id: "dlq",
      scene: "dlq",
      text: "A dead-letter queue is a side queue. After a message has been received a set number of times, the broker moves it there instead of redelivering. Workers carry on with healthy messages, and the failures wait where people can inspect them, fix the cause, and send them back.",
      sourceIds: ["sqs-dlq"],
    },
    {
      id: "receives",
      scene: "receives",
      text: "The receive limit is a balance. Too low, and ordinary messages that fail a couple of times on a transient error are dead-lettered needlessly. Too high, and each poison message wastes more work, and in an ordered queue blocks everything behind it for the whole retry period.",
      sourceIds: ["builders-timeouts"],
      derived: true,
    },
    {
      id: "ops",
      text: "A dead-letter queue is only useful if somebody looks. Alarm on its depth, keep the original message and the error, and build a way to replay messages after a fix. Treat a growing dead-letter queue as an incident, not a log.",
      sourceIds: ["uber-reprocessing", "sqs-dlq"],
    },
  ],
  challenges: [
    {
      id: "retry-limit",
      title: "Set the retry limit",
      brief: "One million messages a day, 4 poison messages, and 2% transient errors. This queue is ordered. Add a dead-letter queue and choose the receive limit so at most 25 healthy messages a day are dead-lettered, no worker is ever jammed, and a poison message blocks the queue for at most 400 seconds.",
      line: { speaker: "kabir", line: "I would like the poison out of the way quickly without throwing away good messages." },
      widget: { id: "dlq-lab", config: DLQ_CHALLENGE },
      conditions: [
        { metric: "falseDlqPerDay", op: "<=", value: 25, label: "At most 25 healthy messages dead-lettered a day" },
        { metric: "stuckWorkers", op: "<=", value: 0, label: "No jammed workers" },
        { metric: "blockedSec", op: "<=", value: 400, label: "Blocked at most 400 s per poison message" },
      ],
      stars: [],
      hints: [
        "What happens with no dead-letter queue at all?",
        "How many receives does it take for healthy messages to almost always succeed?",
        "Each receive on a poison message costs 30 seconds of blocking.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what a poison message is and how a dead-letter queue and retry limit deal with it.",
    rubric: [
      { id: "poison", criterion: "A poison message fails every time, so unlimited redelivery ties up workers forever", keyIdea: "never succeeds, never leaves" },
      { id: "dlq", criterion: "After a retry limit the broker moves it to a dead-letter queue where it can be inspected and replayed", keyIdea: "set aside after N receives" },
      { id: "limit", criterion: "Too low a limit dead-letters healthy messages; too high wastes work and blocks ordered queues", keyIdea: "limit trade-off" },
    ],
    exemplar:
      "A poison message fails every time it is processed, so a queue that keeps redelivering it ties up workers indefinitely. I would add a dead-letter queue and move a message there after a set number of receives, then alarm on its depth so someone inspects the messages, fixes the cause and replays them. The limit has to be high enough that transient failures succeed, but low enough that a poison message does not waste work or block an ordered queue for long.",
  },
  reviews: [
    {
      id: "dq-est",
      format: "estimate",
      scenario: "A million messages a day, 3% hit a transient error, each retry fails again with probability 0.5, and the receive limit is 4. About how many healthy messages are dead-lettered a day? (1,000,000 × 3% × 0.5⁴)",
      unit: "messages",
      answer: 1875,
      acceptFactor: 1.05,
      breakdown: ["1,000,000 × 0.03 = 30,000", "0.5⁴ = 0.0625", "30,000 × 0.0625 = 1,875"],
      explain: "Each extra receive halves the loss, so a few more attempts remove most of it.",
    },
    {
      id: "dq-pick",
      format: "pick-fix",
      scenario: "An ordered queue is stuck: the first message fails on every attempt and a million messages wait behind it. What is the best fix?",
      options: [
        { id: "a", label: "Move it to a dead-letter queue after a few receives so the rest can proceed" },
        { id: "b", label: "Add more workers" },
        { id: "c", label: "Raise the visibility timeout" },
        { id: "d", label: "Delete the whole queue" },
      ],
      answer: "a",
      explain: "More workers cannot help since order forces one message at a time. The poison must be set aside.",
    },
    {
      id: "dq-order",
      format: "order",
      scenario: "Order these receive limits by the number of healthy messages dead-lettered per day, most first.",
      items: [
        { id: "r2", label: "2 receives" },
        { id: "r5", label: "5 receives" },
        { id: "r10", label: "10 receives" },
      ],
      answer: ["r2", "r5", "r10"],
      explain: "Each extra receive halves the number of healthy messages that fail every attempt.",
    },
    {
      id: "dq-graph",
      format: "predict-graph",
      scenario: "As the receive limit goes from 1 to 20, how does the time one poison message blocks an ordered queue change, at 30 seconds an attempt?",
      xLabel: "receive limit →",
      yLabel: "time the queue is blocked",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [30, 60, 150, 300, 420, 450, 540, 600] },
        { id: "flat", label: "Stays the same", points: [30, 30, 30, 30, 30, 30, 30, 30] },
        { id: "fall", label: "Falls", points: [600, 540, 450, 420, 300, 150, 60, 30] },
      ],
      answer: "linear",
      explain: "Each attempt on the poison message costs another 30 seconds, so blocking grows linearly with the limit.",
    },
    {
      id: "dq-flaw",
      format: "spot-flaw",
      scenario: "A team adds a dead-letter queue and considers the problem solved. Months later they find 40,000 messages in it, including a week of failed invoices. Tap the missing piece.",
      diagram: {
        nodes: [
          { id: "queue", label: "main queue", kind: "queue", col: 0, row: 1 },
          { id: "dlq", label: "dead-letter queue", kind: "queue", col: 1, row: 1 },
          { id: "nobody", label: "nobody alerted or reading", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "queue", to: "dlq" },
          { from: "dlq", to: "nobody" },
        ],
      },
      answer: "dlq->nobody",
      explain: "A dead-letter queue nobody watches only hides the loss. Alarm on its depth and build a way to inspect and replay.",
    },
    {
      id: "dq-explain",
      format: "explain",
      scenario: "In two sentences: why is redelivering a failed message forever dangerous?",
      rubric: [
        { id: "capacity", criterion: "Messages that can never succeed keep occupying workers, so capacity drains until good messages starve" },
        { id: "blocking", criterion: "In an ordered queue a single poison message blocks everything behind it" },
      ],
      exemplar: "Messages that can never succeed keep occupying workers, so capacity drains away until good messages starve. In an ordered queue one such message also blocks everything behind it.",
      explain: "Retry with a limit, then set aside.",
    },
  ],
  codex: {
    oneLiner: "After a set number of receives, move a failing message to a dead-letter queue, alarm on its depth, and replay after fixing the cause.",
    keyNumbers: [
      { label: "Healthy messages dead-lettered", value: "volume × error rate × 0.5^receives (lab)", sourceId: "sqs-dlq" },
      { label: "Time blocked by one poison message in an ordered queue", value: "receives × attempt time", sourceId: "uber-reprocessing" },
    ],
    tradeoffs: [
      { choice: "Low receive limit", gain: "Poison cleared fast", cost: "Healthy messages dead-lettered" },
      { choice: "High receive limit", gain: "Transient errors succeed", cost: "More wasted work; longer blocking when ordered" },
      { choice: "Delayed retries between attempts", gain: "Gives a dependency time to recover", cost: "Slower processing" },
    ],
    seenIn: ["SQS redrive policy with maxReceiveCount.", "Retry topics and dead-letter topics in Kafka consumers."],
    interviewAngle: "Say: 'bounded retries with backoff, then a dead-letter queue with an alarm and a replay tool'.",
    aws: [{ concept: "Redrive policy and DLQ redrive", service: "SQS" }],
    replay: { id: "dlq-lab", config: DLQ, scene: "dlq" },
  },
  interview: [
    "What is a poison message?",
    "How do you choose a dead-letter queue's retry limit?",
    "What do you do with messages in a dead-letter queue?",
  ],
  deeper: [
    {
      title: "Retry topics in log-based systems",
      body: "A log has no per-message redelivery, so failing messages are republished to a retry topic with a delay, and to a dead-letter topic after the last attempt. That moves failures out of the way of the main partition, at the cost of losing strict ordering for the retried messages, which is the same trade the receive limit makes in a queue.",
      sourceIds: ["uber-reprocessing"],
    },
  ],
  honestPhysics: [
    "One million messages a day served by 20 workers. 4 poison messages arrive daily; each attempt on one hangs a worker for 30 seconds. 2% of ordinary messages hit a transient error, and each retry of those fails again with probability one half.",
    "Without a dead-letter queue a poison message circulates forever; after a week 28 outnumber the 20 workers. In an ordered queue the poison message blocks everything behind it for receives × 30 seconds.",
    "Needlessly dead-lettered messages are 1,000,000 × 2% × 0.5^receives.",
  ],
  sources: [SQS_DLQ, UBER, BUILDERS],
  verify: [
    { id: "nodlq", claim: "Without a dead-letter queue all 20 workers end up jammed", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: false }, metric: "stuckWorkers" }, expect: { min: 20, max: 20 } },
    { id: "r3", claim: "Giving up after 3 receives dead-letters 2,500 healthy messages a day", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: true, receives: 3 }, metric: "falseDlqPerDay" }, expect: { min: 2400, max: 2600 } },
    { id: "r9", claim: "9 receives is not quite enough", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: true, receives: 9 }, metric: "falseDlqPerDay" }, expect: { min: 25 } },
    { id: "r10", claim: "10 receives dead-letters about 20 a day", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: true, receives: 10 }, metric: "falseDlqPerDay" }, expect: { max: 25 } },
    { id: "r10-block", claim: "…blocking the queue for 300 seconds", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: true, receives: 10 }, metric: "blockedSec" }, expect: { min: 300, max: 300 } },
    { id: "r14", claim: "14 receives blocks the queue for 420 seconds", run: "lab", params: { model: "dlq-lab", config: DLQ_CHALLENGE, values: { dlq: true, receives: 14 }, metric: "blockedSec" }, expect: { min: 400 } },
  ],
});
