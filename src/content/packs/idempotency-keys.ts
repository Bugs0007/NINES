import { definePack } from "../define";

export const IKEY = { start: { inflight: "wait", mismatch: "reject", failure: "release", scope: "account" } };
export const IKEY_CHALLENGE = {};

const STRIPE = { id: "stripe-idempotency", title: "Stripe API docs: Idempotent requests (same key returns the saved result, including errors)", url: "https://docs.stripe.com/api/idempotent_requests" };
const IETF = { id: "ietf-idempotency", title: "IETF draft: The Idempotency-Key HTTP Header Field (draft-ietf-httpapi-idempotency-key-header)", url: "https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/" };
const BRANDUR = { id: "brandur-idempotency", title: "Brandur Leach: Implementing Stripe-like Idempotency Keys in Postgres", url: "https://brandur.org/idempotency-keys" };

export default definePack({
  id: "idempotency-keys",
  title: "Idempotency Keys",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · four kinds of 'payment' complaint this week", detail: "all from clients that retry with an idempotency key" },
    lines: [
      { speaker: "kabir", line: "We added idempotency keys and still get four complaints: a double charge, a wrong answer, a payment that cannot be retried, and someone else's receipt." },
      { speaker: "meera", line: "Having a key is the easy half. What the server does in each odd case decides whether it holds." },
    ],
  },
  predictions: [
    {
      id: "double",
      kind: "choice",
      prompt: "Out of a million requests, 200 are retried while the first attempt is still running. If the server treats the retry as a new attempt and runs it again, how many customers are charged twice?",
      options: [
        { id: "none", label: "None: the key protects them" },
        { id: "few", label: "About 2" },
        { id: "two-hundred", label: "About 200" },
        { id: "many", label: "About 2,000" },
      ],
      answer: "two-hundred",
      observe: "double",
      reveal: {
        text: "The key is not stored as finished yet, so the retry finds nothing to return and runs. Both attempts charge. The server has to notice the first is in flight and either make the retry wait for its result or answer 409 so the client tries later.",
        derived: true,
        line: { speaker: "meera", line: "The dangerous moment is when the first attempt has started and not finished." },
      },
    },
    {
      id: "stuck",
      kind: "choice",
      prompt: "A first attempt fails with a transient 500, and the server saves and replays that 500 for any request carrying the same key. What happens to a retry?",
      options: [
        { id: "works", label: "It works: the server retries internally" },
        { id: "same", label: "It gets the same 500 again, and can never succeed with that key" },
        { id: "double", label: "It charges twice" },
      ],
      answer: "same",
      observe: "stuck",
      reveal: {
        text: "A saved 500 says nothing about what the work would do now. Replaying it means the client can never recover with that key, and it must invent a new one and risk a duplicate. Save results that are final; release the key on server errors so the retry can run.",
        derived: true,
        line: { speaker: "rao", line: "A key should remember an outcome, not a failure that was only an accident." },
      },
    },
  ],
  widget: { id: "idemkey-lab", config: IKEY },
  mechanism: [
    {
      id: "contract",
      text: "An idempotency key is a promise between client and server: send the same key with the same request and the effect happens once. The client generates it, once per action, before the first attempt. The server stores the key with the response and returns the stored response to any later request carrying it.",
      sourceIds: ["stripe-idempotency", "ietf-idempotency"],
    },
    {
      id: "inflight",
      scene: "inflight",
      text: "The hard case is a retry while the first attempt is still running. Reserve the key before doing any work, with a unique constraint. A second request that finds a reserved but unfinished key must not run: it waits for the first and returns its result, or gets a 409 Conflict and tries again later.",
      sourceIds: ["brandur-idempotency"],
    },
    {
      id: "mismatch",
      scene: "mismatch",
      text: "Store a fingerprint of the request body with the key. If the same key comes back with a different body, that is a client bug, and returning the saved response would answer a question that was not asked. Reject it with an error (Stripe uses 400/422-style errors) so the bug is found early.",
      sourceIds: ["stripe-idempotency", "ietf-idempotency"],
    },
    {
      id: "failure",
      scene: "failure",
      text: "Save outcomes that are final: successes and client errors that would repeat. Do not save a server error, which may not repeat, or the client is stuck. Release the key on a 5xx so the retry can run again, safely if the work is itself transactional. Scope keys to the account, so two customers cannot collide.",
      sourceIds: ["brandur-idempotency", "ietf-idempotency"],
    },
  ],
  challenges: [
    {
      id: "key-rules",
      title: "Close all four holes",
      brief: "A payments API receives a million requests. Set the four rules so no customer is charged twice by a concurrent retry, no request is answered with another request's result, no retry is permanently stuck, and no account sees another's response.",
      line: { speaker: "kabir", line: "Four complaint types this week. I want the count to be zero for all four." },
      widget: { id: "idemkey-lab", config: IKEY_CHALLENGE },
      conditions: [
        { metric: "doublePerMillion", op: "<=", value: 0, label: "No concurrent double charges" },
        { metric: "wrongPerMillion", op: "<=", value: 0, label: "No wrong-request answers" },
        { metric: "stuckPerMillion", op: "<=", value: 0, label: "No permanently stuck retries" },
        { metric: "leakPerMillion", op: "<=", value: 0, label: "No cross-account responses" },
      ],
      stars: [],
      hints: [
        "Which rule covers the retry that arrives mid-flight?",
        "What does a mismatched body tell you about the client?",
        "Which outcomes deserve to be remembered?",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe the rules a server needs around an idempotency key beyond just storing it.",
    rubric: [
      { id: "inflight", criterion: "Reserve the key atomically before the work; a concurrent retry waits for the first or gets a 409", keyIdea: "reserve first" },
      { id: "fingerprint", criterion: "Store a fingerprint of the request and reject the same key with a different body", keyIdea: "reject mismatched bodies" },
      { id: "outcome", criterion: "Save final outcomes, release the key after a server error, and scope keys per account", keyIdea: "final outcomes, per-account scope" },
    ],
    exemplar:
      "First, reserve the key with a unique constraint before any work, so a retry that arrives while the first attempt is running waits for its result or gets a 409 instead of running again. Second, store a fingerprint of the request body and reject the same key with a different body, because that is a client bug. Third, save final outcomes but release the key after a server error so a retry can run, and scope keys per account so customers cannot collide.",
  },
  reviews: [
    {
      id: "ik-est",
      format: "estimate",
      scenario: "A million requests; 0.02% are retried while the first attempt is still running. If those retries run again, how many double charges is that?",
      unit: "charges",
      answer: 200,
      acceptFactor: 1.05,
      breakdown: ["1,000,000 × 0.0002", "= 200"],
      explain: "Small fractions of large volumes are daily events. This one is the mid-flight retry.",
    },
    {
      id: "ik-pick",
      format: "pick-fix",
      scenario: "A client reuses one idempotency key for every request in a batch job by mistake, and the server returns the first response for all of them. What should the server have done?",
      options: [
        { id: "a", label: "Rejected requests whose body differs from the one saved under the key" },
        { id: "b", label: "Returned the saved response, as it does now" },
        { id: "c", label: "Deleted the key after one hour" },
        { id: "d", label: "Ignored the key" },
      ],
      answer: "a",
      explain: "Matching the fingerprint turns a silent wrong answer into an immediate, findable error.",
    },
    {
      id: "ik-order",
      format: "order",
      scenario: "Order the outcomes of a first attempt by whether the server should save and replay them, most clearly yes first.",
      items: [
        { id: "ok", label: "201 Created" },
        { id: "bad", label: "422 invalid card" },
        { id: "fail", label: "503 service unavailable" },
      ],
      answer: ["ok", "bad", "fail"],
      explain: "Successes and repeatable client errors are final. A 503 may succeed on retry, so saving it would trap the client.",
    },
    {
      id: "ik-graph",
      format: "predict-graph",
      scenario: "Replaying server errors from the key store, as retries increase from 0 to 5 per request, how does the share of transient failures that can still succeed on retry change?",
      xLabel: "retries per request →",
      yLabel: "transient failures that recover",
      options: [
        { id: "zero", label: "Stays at zero: the stored error is replayed each time", points: [0, 0, 0, 0, 0, 0, 0, 0] },
        { id: "rise", label: "Rises with each retry", points: [0, 80, 96, 99, 99.8, 99.96, 99.99, 100] },
        { id: "flat", label: "Stays at about 80%", points: [80, 80, 80, 80, 80, 80, 80, 80] },
      ],
      answer: "zero",
      explain: "A replayed 500 never lets the work run again, so no number of retries helps. Releasing the key lets each retry try for real.",
    },
    {
      id: "ik-flaw",
      format: "spot-flaw",
      scenario: "Idempotency keys are stored globally, not per account. A customer chooses the key 'order-1' and is shown another customer's saved response. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "c1", label: "customer A: key order-1", kind: "client", col: 0, row: 0 },
          { id: "c2", label: "customer B: key order-1", kind: "client", col: 0, row: 2 },
          { id: "store", label: "one global key store", kind: "db", col: 1, row: 1 },
        ],
        edges: [
          { from: "c1", to: "store" },
          { from: "c2", to: "store" },
        ],
      },
      answer: "c2->store",
      explain: "Keys need a scope, normally the account, plus the endpoint. Otherwise two customers' keys can collide and one is served the other's response.",
    },
    {
      id: "ik-explain",
      format: "explain",
      scenario: "In two sentences: why must the key be reserved before the work starts?",
      rubric: [
        { id: "race", criterion: "A retry arriving during the work would otherwise find no key and run the work a second time" },
        { id: "reserve", criterion: "A unique constraint reserves it atomically, so one request wins and the others wait or get a conflict" },
      ],
      exemplar: "If the key is only saved after the work, a retry that arrives during it finds nothing and runs the work again. Reserving it first with a unique constraint lets exactly one request proceed while the others wait or get a conflict.",
      explain: "Claim first, work second.",
    },
  ],
  codex: {
    oneLiner: "Reserve the key before the work, fingerprint the body, save only final outcomes, release on server errors, and scope keys per account.",
    keyNumbers: [
      { label: "Concurrent retries double-charging, 200 per million without a reservation", value: "200 per million", sourceId: "brandur-idempotency" },
      { label: "Stripe key retention", value: "at least 24 hours", sourceId: "stripe-idempotency" },
    ],
    tradeoffs: [
      { choice: "Wait for the first attempt", gain: "The client gets a real answer", cost: "A request held open" },
      { choice: "409 Conflict", gain: "Simple; no waiting", cost: "The client must retry" },
      { choice: "Save every response", gain: "Simplest store", cost: "Replays accidents, such as a transient 500" },
    ],
    seenIn: ["Stripe's Idempotency-Key header.", "The IETF draft for a standard Idempotency-Key header."],
    interviewAngle: "Say: 'reserve the key atomically, fingerprint the body, replay only final outcomes, and scope per account'.",
    aws: [{ concept: "Idempotent request tokens and conditional puts", service: "EC2 client tokens, DynamoDB conditional writes" }],
    replay: { id: "idemkey-lab", config: IKEY, scene: "failure" },
  },
  interview: [
    "What do you do when a retry arrives while the first request is still in progress?",
    "Why store a hash of the request with the idempotency key?",
    "Should you save a 500 response under the key?",
  ],
  deeper: [
    {
      title: "Recovery points",
      body: "A payment touches several systems, and a crash can leave it half done. Store the key with a recovery point recording how far the request got, such as 'charge created' or 'receipt sent', and let a retry resume from there. This turns a failed request into one that continues, without repeating the steps already done.",
      sourceIds: ["brandur-idempotency"],
    },
  ],
  honestPhysics: [
    "A payments API with an Idempotency-Key header, per million requests: 200 retried while the first attempt runs, 50 with a reused key and a different body, 300 first attempts failing with a transient 500, and 5 key collisions between accounts.",
    "Running a concurrent retry charges twice; ignoring a changed body answers the wrong request; replaying a stored 500 leaves a retry that can never succeed; a global key scope returns another account's response.",
    "Counts are illustrative and exact for these assumptions.",
  ],
  sources: [STRIPE, IETF, BRANDUR],
  verify: [
    { id: "double", claim: "Running mid-flight retries again double-charges 200 per million", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { inflight: "again" }, metric: "doublePerMillion" }, expect: { min: 200, max: 200 } },
    { id: "wait", claim: "Waiting for the first attempt charges nobody twice", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { inflight: "wait" }, metric: "doublePerMillion" }, expect: { max: 0 } },
    { id: "conflict", claim: "A 409 does too", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { inflight: "conflict" }, metric: "doublePerMillion" }, expect: { max: 0 } },
    { id: "ignore", claim: "Ignoring a changed body answers 50 wrong requests per million", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { mismatch: "ignore" }, metric: "wrongPerMillion" }, expect: { min: 50 } },
    { id: "replay", claim: "Replaying a saved 500 leaves 300 per million stuck", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { failure: "replay" }, metric: "stuckPerMillion" }, expect: { min: 300 } },
    { id: "global", claim: "Global scope returns another account's response 5 per million", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { scope: "global" }, metric: "leakPerMillion" }, expect: { min: 5 } },
    { id: "all-good", claim: "All four rules together leave no problem", run: "lab", params: { model: "idemkey-lab", config: IKEY_CHALLENGE, values: { inflight: "wait", mismatch: "reject", failure: "release", scope: "account" }, metric: "stuckPerMillion" }, expect: { max: 0 } },
  ],
});
