import { defineBoss } from "../define";

export const PAYC = {};

const STRIPE_IDEM = { id: "stripe-idempotency", title: "Stripe: Designing robust and predictable APIs with idempotency", url: "https://stripe.com/blog/idempotency" };
const OUTBOX = { id: "outbox", title: "microservices.io: Transactional outbox pattern", url: "https://microservices.io/patterns/data/transactional-outbox.html" };
const SAGAS = { id: "sagas", title: "Garcia-Molina and Salem (1987), Sagas", url: "https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf" };
const PG_ISO = { id: "pg-iso", title: "PostgreSQL docs: Transaction isolation levels", url: "https://www.postgresql.org/docs/current/transaction-iso.html" };

export default defineBoss({
  id: "case-payment-system",
  title: "Case: Payment System",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "support · 1,200 customers charged twice after a provider timeout", detail: "retry logic with no idempotency key" },
    lines: [{ speaker: "kabir", line: "A payment must happen once, be recorded once and be explainable later. Our retries charged twelve hundred people twice last night." }],
  },
  intro: [
    { speaker: "meera", line: "Three failures to design against: the request that times out, the step that half-completes, and two requests that read the same balance." },
    { speaker: "rao", line: "And finance will ask you to prove where every cent went. That is a design requirement too." },
  ],
  forecast: {
    metric: "lostPayments",
    prompt: "With no retries and no idempotency keys, how many payments per million are lost to network failures?",
    unit: "per million",
    scale: 1,
    min: 10,
    max: 20000,
    tolerance: 1.5,
  },
  exercises: ["idempotency", "two-pc-vs-sagas", "outbox-pattern", "isolation-levels"],
  challenge: {
    id: "design-payments",
    title: "Design the payment path",
    brief: "Charge no one twice (at most 1 per million), lose at most 10 per million, leave at most 5 per million stuck or inconsistent, have at most 1 balance anomaly per million, sustain 1,500 payments a second, and keep every change auditable.",
    line: { speaker: "meera", line: "Each guarantee has a mechanism. You cannot buy them with one." },
    widget: { id: "payment-lab", config: PAYC },
    conditions: [
      { metric: "doubleCharges", op: "<=", value: 1, label: "At most 1 double charge per million" },
      { metric: "lostPayments", op: "<=", value: 10, label: "At most 10 lost per million" },
      { metric: "inconsistent", op: "<=", value: 5, label: "At most 5 stuck or inconsistent per million" },
      { metric: "anomalies", op: "<=", value: 1, label: "At most 1 balance anomaly per million" },
      { metric: "paymentsPerSec", op: ">=", value: 1500, label: "At least 1,500 payments a second" },
      { metric: "auditable", op: ">=", value: 1, label: "Every change auditable" },
    ],
    stars: [],
    hints: ["What makes a retry safe?", "Which coordination does not block when something crashes?", "What does the strongest isolation level cost in throughput?"],
  },
  debrief: [
    { id: "idem", text: "Retries without keys double-charge; no retries lose payments to the first network blip. Retrying with an idempotency key makes the retry safe: the server recognises it and returns the first result, leaving about 5 lost per million.", sourceIds: ["stripe-idempotency"] },
    { id: "flow", text: "Two-phase commit is atomic and blocks when its coordinator fails: 30 stuck per million at 400 a second. A saga is fast and leaves a brief inconsistency while compensations run. An outbox commits the state change and the event in one transaction and publishes afterwards: 1 per million at 3,000 a second.", sourceIds: ["sagas", "outbox"] },
    { id: "iso", text: "Read committed lets two requests read the same balance and each subtract from it: 15 anomalies per million. Repeatable read cuts it to 3, and serializable removes it for 40% of the throughput, which the outbox path can afford and the saga path could not.", sourceIds: ["pg-iso"] },
  ],
  outro: { speaker: "kabir", line: "Keys, an outbox, serializable writes and a ledger. Finance can follow every cent, and nobody pays twice." },
  explainBack: {
    prompt: "Explain your payment design, and the failure each part prevents.",
    rubric: [
      { id: "idem", criterion: "Idempotency keys make retries safe, preventing double charges while allowing retries that prevent lost payments", keyIdea: "idempotency keys" },
      { id: "flow", criterion: "A transactional outbox (or saga) avoids the blocking of two-phase commit; the state change and the event are committed together", keyIdea: "outbox over 2PC" },
      { id: "iso", criterion: "Serializable isolation (or explicit locking) prevents balance anomalies, with a throughput cost", keyIdea: "isolation level" },
      { id: "ledger", criterion: "A double-entry ledger makes every movement auditable and the totals checkable", keyIdea: "ledger" },
    ],
    exemplar:
      "Every charge carries an idempotency key, so a client can retry timeouts without ever charging twice, and retries mean few payments are lost. The payment record and the event that tells the ledger and provider are committed in one transaction through an outbox and published afterwards, which avoids the blocking of two-phase commit. Serializable isolation removes balance anomalies for a 40 percent throughput cost that the outbox path can afford at 1,800 a second, and a double-entry ledger makes every movement auditable.",
  },
  honestPhysics: [
    "Per million payments: retries without an idempotency key charge 1,200 twice; no retries lose 800; retries with a key lose about 5. Two-phase commit leaves 30 stuck at 400 a second; a saga leaves 4 inconsistent at 2,000 a second; an outbox leaves 1 at 3,000 a second.",
    "Balance anomalies per million: read committed 15, repeatable read 3, serializable 0 at 60% of the throughput. A double-entry ledger is what makes the movements auditable. Round figures.",
  ],
  sources: [STRIPE_IDEM, OUTBOX, SAGAS, PG_ISO],
  verify: [
    { id: "forecast", claim: "With no retries, 800 payments per million are lost", run: "lab", params: { model: "payment-lab", config: PAYC, values: {}, metric: "lostPayments" }, expect: { min: 800, max: 800 } },
    { id: "double", claim: "Retries without keys charge 1,200 per million twice", run: "lab", params: { model: "payment-lab", config: PAYC, values: { retry: true, idem: false }, metric: "doubleCharges" }, expect: { min: 1200, max: 1200 } },
    { id: "safe-retry", claim: "Retries with keys charge no one twice", run: "lab", params: { model: "payment-lab", config: PAYC, values: { retry: true, idem: true }, metric: "doubleCharges" }, expect: { max: 0 } },
    { id: "2pc", claim: "Two-phase commit leaves 30 stuck per million", run: "lab", params: { model: "payment-lab", config: PAYC, values: { flow: "2pc" }, metric: "inconsistent" }, expect: { min: 30, max: 30 } },
    { id: "ser-saga", claim: "A saga with serializable isolation falls to 1,200 a second", run: "lab", params: { model: "payment-lab", config: PAYC, values: { flow: "saga", iso: "ser" }, metric: "paymentsPerSec" }, expect: { min: 1200, max: 1200 } },
    { id: "rr", claim: "Repeatable read leaves 3 anomalies per million", run: "lab", params: { model: "payment-lab", config: PAYC, values: { iso: "rr" }, metric: "anomalies" }, expect: { min: 3, max: 3 } },
    { id: "good", claim: "Keys, retries, outbox, serializable and a ledger reach 1,800 a second", run: "lab", params: { model: "payment-lab", config: PAYC, values: { idem: true, retry: true, flow: "outbox", iso: "ser", ledger: true }, metric: "paymentsPerSec" }, expect: { min: 1800, max: 1800 } },
  ],
});
