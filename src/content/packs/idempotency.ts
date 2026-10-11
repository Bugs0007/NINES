import { definePack } from "../define";

export const IDEM = { start: { mode: "request", ttl: 48, atomic: true } };
export const IDEM_CHALLENGE = { start: { mode: "none", ttl: 1, atomic: false } };

const STRIPE = { id: "stripe-idempotency", title: "Stripe API docs: Idempotent requests (keys saved for 24 hours; same key returns the saved result)", url: "https://docs.stripe.com/api/idempotent_requests" };
const BRANDUR = { id: "brandur-idempotency", title: "Brandur Leach: Implementing Stripe-like Idempotency Keys in Postgres", url: "https://brandur.org/idempotency-keys" };
const BUILDERS = { id: "builders-timeouts", title: "Amazon Builders' Library: Timeouts, retries and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };

export default definePack({
  id: "idempotency",
  title: "Idempotency",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'I was charged twice'", detail: "6,000 duplicate charges this week" },
    lines: [
      { speaker: "kabir", line: "A customer taps pay, the screen spins, the app retries, and they are charged twice. Support has a spreadsheet of these." },
      { speaker: "meera", line: "The first charge worked. The response got lost, so the client could not know, and a retry looks exactly like a second purchase." },
    ],
  },
  predictions: [
    {
      id: "dupes",
      kind: "choice",
      prompt: "Two million charges a day. In 0.3% the server finishes the charge but the response is lost, so the client retries. With no way to tell a retry from a new purchase, how many customers are charged twice each day?",
      options: [
        { id: "six", label: "About 6" },
        { id: "sixty", label: "About 60" },
        { id: "six-hundred", label: "About 600" },
        { id: "six-thousand", label: "About 6,000" },
      ],
      answer: "six-thousand",
      observe: "dupes-seen",
      reveal: {
        text: "0.3% of two million is 6,000 lost responses a day, and every one is retried. Each retry arrives as a fresh charge, so 6,000 customers a day pay twice. A rate that sounds negligible is a spreadsheet of refunds at this volume.",
        derived: true,
        line: { speaker: "meera", line: "A one-in-three-hundred failure rate is a daily event at scale." },
      },
    },
    {
      id: "ttl",
      kind: "choice",
      prompt: "You deduplicate by key and keep keys for 2 hours. Retries arrive after an average of 6 hours, as mobile apps queue and resume. What share of retries are still charged twice?",
      options: [
        { id: "none", label: "None: the key exists" },
        { id: "few", label: "About 5%" },
        { id: "most", label: "About 72%" },
        { id: "all", label: "All of them" },
      ],
      answer: "most",
      observe: "expired",
      reveal: {
        text: "A retry is caught only if its key is still stored. With retry delays averaging 6 hours, the chance a retry comes after 2 hours is e^(−2 ÷ 6) = 72%, and those find no key and charge again. The key must outlive the longest retry you will accept.",
        derived: true,
        line: { speaker: "rao", line: "Storage for keys is cheap. Double refunds are not." },
      },
    },
  ],
  widget: { id: "idem-lab", config: IDEM },
  mechanism: [
    {
      id: "def",
      scene: "retry",
      text: "An operation is idempotent when doing it twice has the same effect as doing it once. Reading is. Setting a value is. 'Add £10 to the balance' is not. Retries are only safe on idempotent operations, so non-idempotent ones need help.",
      sourceIds: ["builders-timeouts"],
    },
    {
      id: "key",
      scene: "key",
      text: "An idempotency key is a unique id the client generates once per intended action and sends with every attempt. The server records the key with the result. A repeated key returns the saved result instead of running again. The key belongs to the action, not to the attempt.",
      sourceIds: ["stripe-idempotency", "brandur-idempotency"],
    },
    {
      id: "ttl",
      scene: "ttl",
      text: "Keys cost storage, so they expire. Keep them longer than the longest period in which a retry can arrive: Stripe keeps them for 24 hours. A retry after the key has expired is a second charge. Pick the window from how long your clients really retry.",
      sourceIds: ["stripe-idempotency"],
    },
    {
      id: "atomic",
      text: "Two copies of a request can arrive at once, so checking for a key and then inserting it is a race: both see no key and both run. Reserve the key atomically with a unique constraint in the same transaction as the work, and make the loser wait or reuse the winner's result.",
      sourceIds: ["brandur-idempotency"],
    },
  ],
  challenges: [
    {
      id: "no-double",
      title: "Stop the double charges",
      brief: "6,000 retries arrive each day, delayed 6 hours on average. Choose the key scheme, how long to keep keys, and how to reserve them, so at most 5 customers are charged twice a day while key storage stays under 1.5 GB.",
      line: { speaker: "rao", line: "I will pay for storage. I will not pay for a longer refund queue." },
      widget: { id: "idem-lab", config: IDEM_CHALLENGE },
      conditions: [
        { metric: "dupPerDay", op: "<=", value: 5, label: "At most 5 double charges a day" },
        { metric: "storageGB", op: "<=", value: 1.5, label: "Key storage at most 1.5 GB" },
      ],
      stars: [{ metric: "storageGB", op: "<=", value: 0.6, label: "Key storage at most 0.6 GB" }],
      hints: [
        "Should each attempt carry its own key, or one key for the whole request?",
        "How long after a failure can a retry still arrive?",
        "What happens when two copies of a request arrive together?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how to make a payment API safe to retry.",
    rubric: [
      { id: "key", criterion: "The client sends one idempotency key per intended action, reused on every retry; the server saves the result under it", keyIdea: "key per action" },
      { id: "ttl", criterion: "Keys are kept longer than the longest retry window, since an expired key lets a retry run again", keyIdea: "key lifetime" },
      { id: "atomic", criterion: "Reserve the key atomically with the work, for example a unique constraint, so concurrent duplicates cannot both run", keyIdea: "atomic reservation" },
    ],
    exemplar:
      "The client generates one idempotency key for each intended action and sends it with every attempt. The server stores the result under the key and returns it for repeats. I keep keys longer than the longest retry delay, since a retry after expiry would run again, and I reserve the key atomically with a unique constraint in the same transaction so two simultaneous copies cannot both run.",
  },
  reviews: [
    {
      id: "id-est",
      format: "estimate",
      scenario: "A payment API takes 1 million charges a day, and 0.5% of responses are lost and retried. With no idempotency protection, about how many customers are double charged per day?",
      unit: "customers",
      answer: 5000,
      acceptFactor: 1.05,
      breakdown: ["1,000,000 × 0.005 = 5,000", "each retry is a new charge"],
      explain: "Every lost response leads to a retry, and an unprotected retry is a second charge.",
    },
    {
      id: "id-pick",
      format: "pick-fix",
      scenario: "The mobile app generates a new UUID for the idempotency key on every retry. Customers are still charged twice. What is wrong?",
      options: [
        { id: "a", label: "The key must be generated once per action and reused on retries" },
        { id: "b", label: "The UUIDs are too long" },
        { id: "c", label: "The server should ignore keys" },
        { id: "d", label: "Keys must be sequential integers" },
      ],
      answer: "a",
      explain: "A new key per attempt makes every retry look like a new action, so the server sees nothing to deduplicate.",
    },
    {
      id: "id-order",
      format: "order",
      scenario: "Order these operations from most naturally idempotent to least.",
      items: [
        { id: "get", label: "GET /orders/42" },
        { id: "put", label: "PUT /orders/42 with the full order" },
        { id: "delete", label: "DELETE /orders/42" },
        { id: "post", label: "POST /orders (create a new one)" },
      ],
      answer: ["get", "put", "delete", "post"],
      explain: "Reads change nothing. Replacing sets the same state again. Deleting twice leaves it deleted, though the second may report an error. Creating twice makes two.",
    },
    {
      id: "id-graph",
      format: "predict-graph",
      scenario: "With one key per request and atomic reservation, retries arrive after an average of 6 hours. As you raise the key lifetime from 1 hour to 30 days, how do double charges per day change?",
      xLabel: "key lifetime →",
      yLabel: "double charges a day",
      options: [
        { id: "fall", label: "Fall quickly, then level off near zero", points: [5100, 2900, 1100, 110, 2, 0, 0, 0] },
        { id: "flat", label: "Stay the same", points: [6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000] },
        { id: "linear", label: "Fall in a straight line", points: [6000, 5200, 4400, 3600, 2800, 2000, 1200, 400] },
      ],
      answer: "fall",
      explain: "The share of retries that outlive the key falls exponentially with its lifetime, e^(−lifetime ÷ 6 h), so the first day does most of the work.",
    },
    {
      id: "id-flaw",
      format: "spot-flaw",
      scenario: "The server checks whether the key exists, and if not, runs the charge, then saves the key. Two copies of the same request arrive at the same moment and the customer is charged twice. Tap the step that is unsafe.",
      diagram: {
        nodes: [
          { id: "check", label: "SELECT key", kind: "server", col: 0, row: 1 },
          { id: "charge", label: "run the charge", kind: "external", col: 1, row: 1 },
          { id: "save", label: "INSERT key", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "check", to: "charge" },
          { from: "charge", to: "save" },
        ],
      },
      answer: "check->charge",
      explain: "Both copies see no key, so both charge. Reserve the key with a unique constraint before doing the work, and let only the winner proceed.",
    },
    {
      id: "id-explain",
      format: "explain",
      scenario: "In two sentences: why is a timeout on a payment request ambiguous, and how does an idempotency key resolve it?",
      rubric: [
        { id: "ambiguous", criterion: "The client cannot tell whether the server never got the request or did the work and lost the reply" },
        { id: "key", criterion: "With a key the client can safely retry; the server runs the action at most once and returns the saved result" },
      ],
      exemplar: "After a timeout the client cannot know whether the charge happened, because the request or the reply may have been lost. With an idempotency key the client simply retries, and the server runs the charge once and returns the saved result.",
      explain: "Make retrying always safe so ambiguity stops mattering.",
    },
  ],
  codex: {
    oneLiner: "An idempotency key per action, reused on every retry, saved with the result, kept longer than any retry window, and reserved atomically.",
    keyNumbers: [
      { label: "Stripe idempotency key retention", value: "24 hours", sourceId: "stripe-idempotency" },
      { label: "Double charges with no key, 0.3% lost responses on 2 million a day", value: "6,000 a day", sourceId: "brandur-idempotency" },
    ],
    tradeoffs: [
      { choice: "Long key retention", gain: "Catches late retries", cost: "More storage" },
      { choice: "Atomic reservation", gain: "No concurrent duplicates", cost: "A write before the work, and waiting for the winner" },
      { choice: "Natural idempotence (PUT, upsert)", gain: "No key bookkeeping", cost: "Only fits operations that can be expressed as setting state" },
    ],
    seenIn: ["Stripe's Idempotency-Key header.", "AWS API client tokens, such as in EC2 RunInstances."],
    interviewAngle: "Say: 'client-generated key per action, stored with the result under a unique constraint, kept past the longest retry window'.",
    aws: [{ concept: "Client request tokens", service: "EC2 RunInstances, Step Functions" }],
    replay: { id: "idem-lab", config: IDEM, scene: "key" },
  },
  interview: [
    "How do you make a payment API safe to retry?",
    "What makes an operation idempotent?",
    "What goes wrong with a check-then-insert key lookup?",
  ],
  deeper: [
    {
      title: "Same key, different request",
      body: "If a client reuses a key for a different request body, treating it as a repeat would return the wrong result. Good implementations store a hash of the request with the key and reject a reuse with a different body, which catches client bugs early.",
      sourceIds: ["stripe-idempotency"],
    },
  ],
  honestPhysics: [
    "2 million charges a day. In 0.3% the response is lost and the client retries, 6,000 retries a day, with retry delays exponential with a mean of 6 hours.",
    "2% of retries arrive while the first attempt is still running, and a non-atomic check lets them through. Each stored key takes about 120 bytes.",
    "These are round figures for a payments API, not measurements.",
  ],
  sources: [STRIPE, BRANDUR, BUILDERS],
  verify: [
    { id: "none", claim: "With no key, 6,000 customers a day are charged twice", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "none" }, metric: "dupPerDay" }, expect: { min: 6000, max: 6000 } },
    { id: "attempt", claim: "A fresh key per attempt does not help", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "attempt", ttl: 100, atomic: true }, metric: "dupPerDay" }, expect: { min: 6000 } },
    { id: "ttl2", claim: "Keeping keys 2 hours still charges about 72% of retries twice", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "request", ttl: 2, atomic: true }, metric: "dupPerDay" }, expect: { min: 4200, max: 4400 } },
    { id: "ttl48", claim: "Keeping keys 48 hours leaves about 2 a day", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "request", ttl: 48, atomic: true }, metric: "dupPerDay" }, expect: { max: 5 } },
    { id: "race", claim: "A non-atomic check lets over 100 a day through", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "request", ttl: 48, atomic: false }, metric: "dupPerDay" }, expect: { min: 100 } },
    { id: "store48", claim: "48 hours of keys take under 0.6 GB", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "request", ttl: 48, atomic: true }, metric: "storageGB" }, expect: { max: 0.6 } },
    { id: "store200", claim: "200 hours of keys take about 2 GB", run: "lab", params: { model: "idem-lab", config: IDEM_CHALLENGE, values: { mode: "request", ttl: 200, atomic: true }, metric: "storageGB" }, expect: { min: 1.5 } },
  ],
});
