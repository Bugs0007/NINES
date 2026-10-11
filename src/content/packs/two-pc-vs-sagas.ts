import { definePack } from "../define";

export const SAGA = { failPct: 0.02, start: { proto: "twopc", retries: 0, idemComp: false } };

const GARCIA = { id: "sagas-1987", title: "H. Garcia-Molina and K. Salem (1987), Sagas, ACM SIGMOD", url: "https://dl.acm.org/doi/10.1145/38713.38742" };
const MSIO = { id: "microservices-saga", title: "C. Richardson: Pattern, Saga (microservices.io)", url: "https://microservices.io/patterns/data/saga.html" };
const AZURE_SAGA = { id: "azure-saga", title: "Microsoft Azure Architecture Center: Saga distributed transactions pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/saga" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 9: Distributed transactions and two-phase commit", url: "https://dataintensive.net/" };

export default definePack({
  id: "two-pc-vs-sagas",
  title: "2PC vs Sagas",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "bookings · locks held on flights and hotels for 30 minutes", detail: "the transaction coordinator is down" },
    lines: [
      { speaker: "kabir", line: "Booking a trip reserves a flight, a hotel and a payment. The coordinator crashed halfway and now rows are locked in three databases, waiting for it to return." },
      { speaker: "meera", line: "Two-phase commit is all-or-nothing, and it keeps everyone waiting while it decides. A saga commits as it goes and undoes what it must." },
    ],
  },
  predictions: [
    {
      id: "locks",
      kind: "choice",
      prompt: "A booking runs across three services 40 ms from the coordinator, each taking 10 ms. You switch from two-phase commit to a saga. How long is each service's row locked during a booking?",
      options: [
        { id: "same", label: "About the same, 90 ms" },
        { id: "half", label: "About 45 ms" },
        { id: "ten", label: "About 10 ms: only its own local transaction" },
      ],
      answer: "ten",
      observe: "saga-on",
      reveal: {
        text: "With two-phase commit a row stays locked from prepare until the final commit, a couple of network round trips, about 90 ms here. A saga commits each step locally and releases its lock at once, 10 ms. The price is that other readers can see the booking half done.",
        derived: true,
        line: { speaker: "meera", line: "A saga does not remove the wait. It moves it from a lock to a visible in-between state." },
      },
    },
    {
      id: "retries",
      kind: "choice",
      prompt: "Each step fails independently 2% of the time. With no retries, 94% of bookings succeed. You let each saga step retry twice. What share of bookings succeed now?",
      options: [
        { id: "95", label: "About 95%" },
        { id: "99", label: "About 99%" },
        { id: "9999", label: "More than 99.99%" },
      ],
      answer: "9999",
      observe: "retried",
      reveal: {
        text: "A step now fails only if all three attempts fail: 0.02³ = 0.000008. Three steps give a failure chance of about 0.00002, so more than 99.99% succeed. Retries make sagas robust, provided each step can safely be repeated.",
        derived: true,
        line: { speaker: "rao", line: "Retrying a local step is cheap. Retrying a distributed commit is how locks pile up." },
      },
    },
  ],
  widget: { id: "saga-lab", config: SAGA },
  mechanism: [
    {
      id: "twopc",
      scene: "twopc",
      text: "Two-phase commit has a coordinator ask every participant to prepare, which locks the rows and promises to commit, then tells everyone to commit if all agreed. It is atomic across databases, at the cost of holding locks over network round trips, and if the coordinator dies, participants wait.",
      sourceIds: ["ddia"],
    },
    {
      id: "saga",
      scene: "saga",
      text: "A saga splits the work into local transactions, each committed immediately. If a later step fails, earlier steps are undone by compensating actions: cancel the hotel, refund the payment. No cross-service lock is held, but the booking is briefly half done, visible to anyone who looks.",
      sourceIds: ["sagas-1987", "microservices-saga"],
    },
    {
      id: "comp",
      scene: "compensate",
      text: "Compensations are real actions, and they can fail or run twice. Make each step and each compensation idempotent, retry them until they succeed, and record where the saga is so it can resume after a crash. A refund that is not idempotent can pay twice.",
      sourceIds: ["azure-saga", "microservices-saga"],
    },
    {
      id: "choose",
      text: "Pick by what a half-done state costs. Within one database, use a normal transaction. Across a few systems you control with short operations, 2PC can work. Across services, vendors or long processes, sagas fit better, if the business can tolerate the in-between states.",
      sourceIds: ["ddia", "azure-saga"],
    },
  ],
  challenges: [
    {
      id: "booking",
      title: "Book without long locks",
      brief: "Each of three steps fails 2% of the time. Choose the protocol and its settings so locks are held at most 20 ms, at least 99.95% of bookings succeed, and no customer is refunded twice.",
      line: { speaker: "kabir", line: "Rows locked for a tenth of a second across three services is too long at our volume. Double refunds are worse." },
      widget: { id: "saga-lab", config: SAGA },
      conditions: [
        { metric: "lockHoldMs", op: "<=", value: 20, label: "Locks held at most 20 ms" },
        { metric: "successRate", op: ">=", value: 0.9995, label: "At least 99.95% of bookings succeed" },
        { metric: "dupRefundsPerMillion", op: "<=", value: 0, label: "No double refunds" },
      ],
      stars: [],
      hints: [
        "Which protocol commits each step on its own?",
        "How many retries per step make 99.95% reachable at 2% failure?",
        "What happens to an undo that runs twice?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare two-phase commit with a saga for a booking across three services.",
    rubric: [
      { id: "twopc", criterion: "2PC is atomic but holds locks across round trips and blocks if the coordinator fails", keyIdea: "atomic but blocking" },
      { id: "saga", criterion: "A saga commits each step locally and undoes earlier steps with compensating actions if a later one fails", keyIdea: "local commits and compensations" },
      { id: "care", criterion: "Sagas expose intermediate states and need idempotent steps and compensations with retries", keyIdea: "idempotent steps" },
    ],
    exemplar:
      "Two-phase commit makes the booking atomic across the three databases, but the rows stay locked over several network round trips and participants block if the coordinator crashes. A saga commits each step locally and undoes earlier steps with compensating actions such as refunds if a later step fails, so no long lock is held. The price is that other readers can see a half-finished booking, and every step and compensation must be idempotent and retried so a refund cannot happen twice.",
  },
  reviews: [
    {
      id: "sg-est",
      format: "estimate",
      scenario: "A booking has 4 steps. Each fails independently 1% of the time, and it has no retries. What share of bookings succeed?",
      unit: "%",
      answer: 96,
      acceptFactor: 1.01,
      breakdown: ["0.99⁴ = 0.9606", "≈ 96%"],
      explain: "Independent failures multiply. More steps and more services mean less success unless steps can be retried.",
    },
    {
      id: "sg-pick",
      format: "pick-fix",
      scenario: "A saga's refund step fails halfway and is retried by the orchestrator. Some customers are refunded twice. What is the fix?",
      options: [
        { id: "a", label: "Make the refund idempotent with a key per order, so a repeat does nothing" },
        { id: "b", label: "Never retry compensations" },
        { id: "c", label: "Switch to two-phase commit across the payment provider" },
        { id: "d", label: "Add a longer timeout" },
      ],
      answer: "a",
      explain: "Retries are required for reliability, so the step must tolerate being run twice. An idempotency key makes the second refund a no-op.",
    },
    {
      id: "sg-order",
      format: "order",
      scenario: "With 2% step failure across three steps, order these designs by the share of bookings that succeed, highest first.",
      items: [
        { id: "saga2", label: "Saga, 2 retries per step" },
        { id: "saga1", label: "Saga, 1 retry per step" },
        { id: "twopc", label: "Two-phase commit, no retries" },
      ],
      answer: ["saga2", "saga1", "twopc"],
      explain: "Each retry multiplies a step's failure chance by 0.02 again: 99.998%, then 99.88%, against 94.1% when any single failure aborts the transaction.",
    },
    {
      id: "sg-graph",
      format: "predict-graph",
      scenario: "A saga's steps each fail 2% of the time. As you raise retries per step from 0 to 4, how does the share of bookings succeeding change?",
      xLabel: "retries per step →",
      yLabel: "bookings succeeding",
      options: [
        { id: "climb", label: "Jumps at the first retry, then flattens just under 100%", points: [94.1, 99.88, 99.998, 100, 100, 100, 100, 100] },
        { id: "linear", label: "Rises in a straight line", points: [94, 95, 96, 97, 98, 99, 99.5, 100] },
        { id: "flat", label: "Stays at 94%", points: [94, 94, 94, 94, 94, 94, 94, 94] },
      ],
      answer: "climb",
      explain: "Each retry multiplies the failure chance by 0.02 again, so the first retry removes most failures and later ones add little.",
    },
    {
      id: "sg-flaw",
      format: "spot-flaw",
      scenario: "A saga books the flight, then the hotel, then charges the card. The charge fails, and the compensation is 'cancel the flight' only. Customers end up with unpaid hotel rooms. Tap the step that is missing.",
      diagram: {
        nodes: [
          { id: "flight", label: "book flight", kind: "external", col: 0, row: 1 },
          { id: "hotel", label: "book hotel", kind: "external", col: 1, row: 1 },
          { id: "charge", label: "charge card (fails)", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "flight", to: "hotel" },
          { from: "hotel", to: "charge" },
        ],
      },
      answer: "hotel->charge",
      explain: "Every completed step before the failure needs a compensation, in reverse order. Cancelling only the flight leaves the hotel booked.",
    },
    {
      id: "sg-explain",
      format: "explain",
      scenario: "In two sentences: why can't a saga give the same guarantees as two-phase commit?",
      rubric: [
        { id: "visible", criterion: "Intermediate states are visible to others while the saga runs, since each step commits immediately" },
        { id: "undo", criterion: "Compensations undo effects semantically rather than rolling them back, so some effects such as sent emails cannot be unsent" },
      ],
      exemplar: "In a saga each step commits straight away, so other readers can see the booking half done. A compensation is a new action that reverses an effect, not a true rollback, so some effects, like an email already sent, cannot be undone.",
      explain: "Sagas trade atomicity for availability.",
    },
  ],
  codex: {
    oneLiner: "2PC is atomic but holds locks over round trips and blocks on coordinator failure. Sagas commit locally and compensate, exposing in-between states.",
    keyNumbers: [
      { label: "Lock hold, 2PC across three services in the lab", value: "about 90 ms", sourceId: "ddia" },
      { label: "Success with 2% step failure, 3 steps, no retries", value: "94.1%", sourceId: "sagas-1987" },
    ],
    tradeoffs: [
      { choice: "Two-phase commit", gain: "Atomic across databases", cost: "Locks over round trips; blocks if the coordinator dies" },
      { choice: "Saga (orchestrated)", gain: "No cross-service locks; clear flow", cost: "Visible in-between states; compensations to write" },
      { choice: "Saga (choreographed)", gain: "No central coordinator", cost: "Flow is spread across services and harder to follow" },
    ],
    seenIn: ["AWS Step Functions, Temporal and Camunda orchestrating sagas.", "XA transactions between a database and a message broker."],
    interviewAngle: "Say: 'sagas with idempotent steps and compensations, orchestrated for visibility, and accept the in-between state'.",
    aws: [{ concept: "Saga orchestration with retries and catch states", service: "AWS Step Functions" }],
    replay: { id: "saga-lab", config: SAGA, scene: "compensate" },
  },
  interview: [
    "Why not use two-phase commit across microservices?",
    "How does a saga handle failure?",
    "What makes a compensating action safe to retry?",
  ],
  deeper: [
    {
      title: "Orchestration versus choreography",
      body: "An orchestrated saga has one component that tells each service what to do next, which makes the flow easy to see and test. A choreographed saga lets each service react to events from the others, with no central owner, which scales organisationally but spreads the logic out. Teams often start with orchestration for any flow with more than a few steps.",
      sourceIds: ["microservices-saga", "azure-saga"],
    },
  ],
  honestPhysics: [
    "A booking touches three services, each 40 ms from the coordinator and taking 10 ms for its local transaction. Each step fails independently with the probability shown, 2% by default.",
    "Two-phase commit holds locks from prepare to commit, about 90 ms, and one failure aborts everything. If the coordinator dies in between, locks are held until resolved: 4 crashes a year × 30 minutes. A saga holds each lock for 10 ms and retries each step.",
    "A compensation that is not idempotent can run twice after a retry; 1% of failed bookings then refund twice. A half-finished saga is visible for the sum of the step times, 150 ms.",
  ],
  sources: [GARCIA, MSIO, AZURE_SAGA, DDIA],
  verify: [
    { id: "lock2pc", claim: "Two-phase commit holds locks for about 90 ms", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "twopc" }, metric: "lockHoldMs" }, expect: { min: 90, max: 90 } },
    { id: "locksaga", claim: "A saga holds each lock for 10 ms", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga" }, metric: "lockHoldMs" }, expect: { max: 10 } },
    { id: "succ0", claim: "With 2% step failure and no retries 94% succeed", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga", retries: 0 }, metric: "successRate" }, expect: { min: 0.94, max: 0.945 } },
    { id: "succ2", claim: "Two retries per step lift success above 99.99%", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga", retries: 2, idemComp: true }, metric: "successRate" }, expect: { min: 0.9999 } },
    { id: "succ1", claim: "One retry per step is not quite 99.95%", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga", retries: 1, idemComp: true }, metric: "successRate" }, expect: { max: 0.9995 } },
    { id: "dup", claim: "Non-idempotent compensations still refund twice sometimes", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga", retries: 2, idemComp: false }, metric: "dupRefundsPerMillion" }, expect: { min: 0.01 } },
    { id: "idem", claim: "Idempotent compensations never do", run: "lab", params: { model: "saga-lab", config: SAGA, values: { proto: "saga", retries: 2, idemComp: true }, metric: "dupRefundsPerMillion" }, expect: { max: 0 } },
  ],
});
