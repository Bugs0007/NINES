import { definePack } from "../define";

export const WH = { start: { attempts: 12, baseS: 5, signature: true, tolerance: 5 } };
export const WH_CHALLENGE = {};

const STRIPE_WH = { id: "stripe-webhooks", title: "Stripe docs: Receive Stripe events in your webhook endpoint (signatures, retries, timestamps)", url: "https://docs.stripe.com/webhooks" };
const STANDARD_WH = { id: "standard-webhooks", title: "Standard Webhooks specification (signing, timestamps, retries)", url: "https://www.standardwebhooks.com/" };
const GITHUB_WH = { id: "github-webhooks", title: "GitHub docs: Best practices for using webhooks", url: "https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks" };

export default definePack({
  id: "webhooks",
  title: "Webhooks",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Partner ticket · 'we missed 40 payment events last Tuesday'", detail: "their server was down for 3 hours" },
    lines: [
      { speaker: "kabir", line: "A partner's server was down for three hours and our webhooks gave up after a minute. They missed forty payments and found out from their customers." },
      { speaker: "meera", line: "A webhook is a promise to keep trying someone else's server, which is down more often than ours. How long the promise lasts is a design decision." },
    ],
  },
  predictions: [
    {
      id: "short",
      kind: "choice",
      prompt: "A receiver is down 1% of the time in outages averaging 30 minutes. You retry 3 times, starting after 5 seconds and doubling: about 35 seconds in all. What share of events is lost?",
      options: [
        { id: "tiny", label: "Under 0.001%" },
        { id: "small", label: "About 0.01%" },
        { id: "one", label: "About 1%: nearly every event during an outage" },
        { id: "ten", label: "About 10%" },
      ],
      answer: "one",
      observe: "lost-seen",
      reveal: {
        text: "A 30-minute outage lasts far longer than 35 seconds of retries, so any event sent during one is lost: nearly all of the 1% of the time the receiver is down. Retrying for minutes protects against blips but not against real outages.",
        derived: true,
        line: { speaker: "meera", line: "Retry for as long as an outage lasts, not as long as a hiccup does." },
      },
    },
    {
      id: "spoof",
      kind: "choice",
      prompt: "Your webhook URL is guessed or leaked, and anyone can post to it. With no signature on the requests, how many forged events does the receiver accept?",
      options: [
        { id: "none", label: "None: the URL is secret" },
        { id: "some", label: "Some, if they guess the format" },
        { id: "all", label: "All of them" },
      ],
      answer: "all",
      observe: "spoofed",
      reveal: {
        text: "Without a signature, the receiver cannot tell your request from anyone else's: a forged 'payment succeeded' is as valid as a real one. Signing each request with a shared secret lets the receiver verify the sender, and a timestamp covered by the signature stops captured requests being replayed later.",
        derived: true,
        line: { speaker: "rao", line: "A secret URL is an obscure URL. Signatures are the actual lock." },
      },
    },
  ],
  widget: { id: "webhook-lab", config: WH },
  mechanism: [
    {
      id: "what",
      text: "A webhook reverses the API: instead of the customer asking whether anything happened, you send an HTTP request to a URL they provide when it does. It is cheap polling avoided. It also means your delivery depends on a server you do not run, with its own outages, slow handlers and mistakes.",
      sourceIds: ["stripe-webhooks", "standard-webhooks"],
    },
    {
      id: "retries",
      scene: "retries",
      text: "Deliveries must be retried with growing delays, since receivers are down. Retry for a horizon longer than a typical outage, hours to days, with backoff and jitter. Stripe retries for up to three days. An event is lost only if an outage outlasts the whole retry horizon.",
      sourceIds: ["stripe-webhooks", "standard-webhooks"],
    },
    {
      id: "signature",
      scene: "signature",
      text: "Sign each request with an HMAC of the body and a timestamp using a secret shared with the receiver, and send the signature in a header. The receiver recomputes it and compares in constant time. A request with no valid signature is rejected, so a leaked URL is harmless.",
      sourceIds: ["stripe-webhooks", "standard-webhooks"],
    },
    {
      id: "replay",
      scene: "replay",
      text: "A valid signature proves who sent it, not when. An attacker who captures a real request can send it again. Include the timestamp in what is signed, and have the receiver reject requests older than a few minutes. Receivers should also deduplicate by event id, because retries and replays both cause repeats.",
      sourceIds: ["stripe-webhooks", "github-webhooks"],
    },
  ],
  challenges: [
    {
      id: "delivery-rules",
      title: "Make webhooks reliable and safe",
      brief: "Receivers are down 1% of the time in outages averaging 30 minutes. Set attempts, backoff, signing and the timestamp tolerance so at most one event in a million is lost, retries stop within 24 hours, forged requests are rejected, and replays are rejected.",
      line: { speaker: "kabir", line: "I want partners to trust that if we sent it, they will see it, and that nobody else can send it." },
      widget: { id: "webhook-lab", config: WH_CHALLENGE },
      conditions: [
        { metric: "lostFrac", op: "<=", value: 0.000001, label: "At most 1 event in a million lost" },
        { metric: "horizonH", op: "<=", value: 24, label: "Retries stop within 24 hours" },
        { metric: "spoofAccepted", op: "<=", value: 0, label: "Forged requests rejected" },
        { metric: "replayAccepted", op: "<=", value: 0, label: "Replayed requests rejected" },
      ],
      stars: [],
      hints: [
        "How long do outages last, and how long must retries last to outlast most of them?",
        "What does a signature prove, and what does it not?",
        "How does the receiver know a request is fresh?",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe how to build webhooks that are reliable and secure.",
    rubric: [
      { id: "retry", criterion: "Retry with exponential backoff over a horizon longer than typical outages, hours to days", keyIdea: "long retry horizon" },
      { id: "sign", criterion: "Sign each request with an HMAC and shared secret so receivers can verify the sender", keyIdea: "HMAC signature" },
      { id: "replay", criterion: "Include a timestamp in the signature and reject old requests; receivers dedupe by event id", keyIdea: "timestamp and dedupe" },
    ],
    exemplar:
      "I would retry failed deliveries with exponential backoff and jitter over hours or days, longer than a typical receiver outage, so events are lost only in extreme cases. Each request carries an HMAC signature over the body and a timestamp using a shared secret, so receivers can verify who sent it and reject anything without a valid signature. The receiver also rejects timestamps older than a few minutes to stop replays, and deduplicates by event id because retries cause repeats.",
  },
  reviews: [
    {
      id: "wh-est",
      format: "estimate",
      scenario: "You retry up to 10 times, first after 30 seconds and doubling each time. About how long, in hours, do retries continue? (30 s × (2¹⁰ − 1))",
      unit: "hours",
      answer: 8.5,
      acceptFactor: 1.1,
      breakdown: ["30 × (1024 − 1) = 30,690 seconds", "÷ 3,600", "≈ 8.5 hours"],
      explain: "Doubling delays add up fast: the last gap alone is over four hours.",
    },
    {
      id: "wh-pick",
      format: "pick-fix",
      scenario: "A webhook receiver verifies the signature but a partner reports a month-old captured request was accepted and caused an action. What is missing?",
      options: [
        { id: "a", label: "A signed timestamp checked against a tolerance of a few minutes" },
        { id: "b", label: "A longer secret" },
        { id: "c", label: "A different hash function" },
        { id: "d", label: "More retries" },
      ],
      answer: "a",
      explain: "A signature proves the sender, not freshness. Binding a timestamp into the signature and rejecting old ones stops replays.",
    },
    {
      id: "wh-order",
      format: "order",
      scenario: "Order these retry schedules by the share of events lost during a 30-minute average outage, most first.",
      items: [
        { id: "once", label: "3 attempts over 35 seconds" },
        { id: "hour", label: "8 attempts over 4 hours" },
        { id: "day", label: "14 attempts over 22 hours" },
      ],
      answer: ["once", "hour", "day"],
      explain: "Loss falls exponentially with the horizon, e^(−horizon ÷ 30 min).",
    },
    {
      id: "wh-graph",
      format: "predict-graph",
      scenario: "Receivers have outages averaging 30 minutes. As the retry horizon grows from 1 minute to 24 hours, how does the share of events lost change?",
      xLabel: "retry horizon →",
      yLabel: "events lost",
      options: [
        { id: "exp", label: "Falls exponentially: large early gains, then negligible", points: [1, 0.97, 0.7, 0.3, 0.05, 0.001, 0, 0] },
        { id: "linear", label: "Falls in a straight line to zero", points: [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0] },
        { id: "flat", label: "Stays the same", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "exp",
      explain: "Outage lengths are roughly exponential, so the chance that one outlasts the horizon falls exponentially with it.",
    },
    {
      id: "wh-flaw",
      format: "spot-flaw",
      scenario: "A receiver parses the JSON body, acts on it, and only afterwards checks the signature in the header. An attacker's forged event is processed before it is rejected. Tap the step that is wrong.",
      diagram: {
        nodes: [
          { id: "req", label: "incoming request", kind: "client", col: 0, row: 1 },
          { id: "act", label: "parse and act on the event", kind: "server", col: 1, row: 1 },
          { id: "verify", label: "verify signature (too late)", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "act" },
          { from: "act", to: "verify" },
        ],
      },
      answer: "req->act",
      explain: "Verify the signature against the raw body first and reject anything invalid before parsing or acting on it.",
    },
    {
      id: "wh-explain",
      format: "explain",
      scenario: "In two sentences: why should webhook receivers respond quickly and process the event afterwards?",
      rubric: [
        { id: "timeout", criterion: "Senders time out slow receivers and treat them as failed, which triggers retries and duplicates" },
        { id: "queue", criterion: "Acknowledging fast and handing the event to a queue keeps the endpoint reliable and moves slow work off the request" },
      ],
      exemplar: "Senders give up on slow receivers and retry, which causes duplicates and extra load. Acknowledging quickly and handing the event to a queue keeps the endpoint reliable and moves the slow work out of the request.",
      explain: "Acknowledge fast; work later.",
    },
  ],
  codex: {
    oneLiner: "Webhooks need long backoff retries, an HMAC signature, a signed timestamp to stop replays, and receivers that acknowledge fast and dedupe by id.",
    keyNumbers: [
      { label: "Events lost", value: "outage rate × e^(−retry horizon ÷ mean outage)", sourceId: "stripe-webhooks" },
      { label: "Stripe's retry horizon", value: "up to three days", sourceId: "stripe-webhooks" },
    ],
    tradeoffs: [
      { choice: "Long retry horizon", gain: "Few lost events", cost: "Old events arrive late; queues of failing deliveries" },
      { choice: "Signed requests with timestamp", gain: "Authenticity and freshness", cost: "Receivers must verify, and clocks must be roughly aligned" },
      { choice: "Fast acknowledge, async processing", gain: "Reliable endpoint", cost: "A queue to run" },
    ],
    seenIn: ["Stripe, GitHub and Shopify webhooks.", "The Standard Webhooks specification."],
    interviewAngle: "Say: 'at-least-once with backoff over days, HMAC with a timestamp, event ids for dedup, and a replay or redelivery tool for partners'.",
    aws: [{ concept: "Event destinations with retries and dead-letter queues", service: "EventBridge API destinations" }],
    replay: { id: "webhook-lab", config: WH, scene: "replay" },
  },
  interview: [
    "How would you design a reliable webhook system?",
    "How do receivers verify a webhook is genuine?",
    "What stops a replay attack on a webhook?",
  ],
  deeper: [
    {
      title: "Disabling failing endpoints",
      body: "An endpoint that fails for days wastes retries and clogs queues. Mature senders disable an endpoint after a long run of failures, tell the owner, and offer a way to replay missed events once it is fixed. Showing a delivery log with the last responses also saves many support tickets.",
      sourceIds: ["stripe-webhooks", "github-webhooks"],
    },
  ],
  honestPhysics: [
    "A receiver is down 1% of the time, in outages averaging 30 minutes (exponential). Retries double from the base delay each attempt. An event is lost if the outage outlasts the whole horizon: 1% × e^(−horizon ÷ 30 min).",
    "Without a signature a forged event is accepted. With a signature but no timestamp check, a captured request can be replayed. The horizon is the base delay × (2^attempts − 1).",
    "The model is exact for these assumptions.",
  ],
  sources: [STRIPE_WH, STANDARD_WH, GITHUB_WH],
  verify: [
    { id: "short", claim: "Three attempts over 35 seconds lose almost every event sent during an outage", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { attempts: 3, baseS: 5 }, metric: "lostFrac" }, expect: { min: 0.009 } },
    { id: "good", claim: "Twelve attempts from 5 seconds retry for 5.7 hours", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { attempts: 12, baseS: 5 }, metric: "horizonH" }, expect: { min: 5.5, max: 5.9 } },
    { id: "good-lost", claim: "…and lose about one event in ten million", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { attempts: 12, baseS: 5 }, metric: "lostFrac" }, expect: { max: 0.000001 } },
    { id: "eleven", claim: "Eleven attempts are not enough", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { attempts: 11, baseS: 5 }, metric: "lostFrac" }, expect: { min: 0.000001 } },
    { id: "nosig", claim: "Unsigned requests accept forgeries", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { signature: false }, metric: "spoofAccepted" }, expect: { min: 1 } },
    { id: "notol", claim: "A signature with no timestamp check accepts replays", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { signature: true, tolerance: 0 }, metric: "replayAccepted" }, expect: { min: 1 } },
    { id: "all", claim: "Signature plus a 5-minute tolerance rejects both", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { signature: true, tolerance: 5 }, metric: "replayAccepted" }, expect: { max: 0 } },
    { id: "too-long", claim: "14 attempts from a minute retry for over 24 hours", run: "lab", params: { model: "webhook-lab", config: WH_CHALLENGE, values: { attempts: 14, baseS: 60 }, metric: "horizonH" }, expect: { min: 24 } },
  ],
});
