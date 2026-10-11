import { definePack } from "../define";

export const TO = { lockClient: true, clientT: 800, start: { dbT: 800, propagate: false } };
export const TO_CHALLENGE = { lockClient: true, clientT: 800 };

const BUILDERS = { id: "builders-timeouts", title: "Amazon Builders' Library: Timeouts, retries and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };
const SRE_CASCADE = { id: "sre-cascading", title: "Google SRE Book, ch. 22: Addressing Cascading Failures (deadlines and deadline propagation)", url: "https://sre.google/sre-book/addressing-cascading-failures/" };
const GRPC = { id: "grpc-deadlines", title: "gRPC docs: Deadlines (a deadline is sent with the call and propagates)", url: "https://grpc.io/docs/guides/deadlines/" };

export default definePack({
  id: "timeouts",
  title: "Timeouts",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "orders-db · CPU 98%", detail: "users abandoned the page 40 seconds ago" },
    lines: [
      { speaker: "kabir", line: "Checkout times out after 800 milliseconds, but the database is still grinding through queries from users who left a minute ago." },
      { speaker: "meera", line: "A timeout that only the caller knows about does not stop the work. Someone downstream has to hear it too." },
    ],
  },
  predictions: [
    {
      id: "waste",
      kind: "choice",
      prompt: "The client gives up after 800 ms. The API waits up to 5 seconds for the database, whose slowest 1% of queries take over 1.5 seconds. What share of the database's time goes to answers nobody is waiting for?",
      options: [
        { id: "none", label: "Under 1%" },
        { id: "five", label: "About 5%" },
        { id: "fifth", label: "About 21%" },
        { id: "most", label: "About 60%" },
      ],
      answer: "fifth",
      observe: "waste-seen",
      reveal: {
        text: "Slow queries are rare but long, so they carry most of the database's time. Letting them run to 5 seconds after the client left at 0.8 seconds spends about a fifth of all database time on results that are thrown away, and it grows as the database slows.",
        derived: true,
        line: { speaker: "meera", line: "The tail is a small share of requests and a large share of the work." },
      },
    },
    {
      id: "propagate",
      kind: "choice",
      prompt: "You pass the client's remaining time down so the database stops when the client does. How does the share of requests answered in time change?",
      options: [
        { id: "up", label: "It rises a few points" },
        { id: "same", label: "It barely changes: those requests were already too late" },
        { id: "down", label: "It falls" },
      ],
      answer: "same",
      observe: "propagated",
      reveal: {
        text: "A request that would finish after the client left was already a failure. Cutting it off saves the database's time without changing who got an answer, and that spare capacity then speeds up everyone else.",
        derived: true,
        line: { speaker: "rao", line: "Same customers served, a fifth less database bill." },
      },
    },
  ],
  widget: { id: "timeout-lab", config: TO },
  mechanism: [
    {
      id: "none",
      scene: "chain",
      text: "Without a timeout, a call waits as long as the other side takes, and a hung dependency can hold your thread, your connection and your memory forever. Every network call needs a timeout, including the ones inside a library you did not write.",
      sourceIds: ["builders-timeouts"],
    },
    {
      id: "budget",
      scene: "budget",
      text: "A timeout is a budget. The client has 800 ms in total, the API spends some of it, and the database call can only use what is left. A database timeout longer than the caller's deadline is a promise to keep working after nobody is listening.",
      sourceIds: ["sre-cascading", "builders-timeouts"],
      derived: true,
    },
    {
      id: "propagate",
      scene: "propagate",
      text: "Deadline propagation sends the remaining time with each call, as gRPC does, so every hop stops at the same moment. Work for an abandoned request stops all the way down the stack, and the slowest dependency stops being a source of wasted load.",
      sourceIds: ["grpc-deadlines", "sre-cascading"],
    },
    {
      id: "set",
      text: "Choose timeouts from measurements, not guesses. Set the value just above the latency you need to cover, often the 99th or 99.9th percentile. Too short and you cut off good requests and invite retries. Too long and the failure spreads.",
      sourceIds: ["builders-timeouts"],
    },
  ],
  challenges: [
    {
      id: "deadline-budget",
      title: "Spend the 800 ms well",
      brief: "The client gives up after 800 ms. Set the API's timeout on the database, or pass the deadline down, so at least 96% of requests are answered in time and at most 2% of database work is wasted.",
      line: { speaker: "kabir", line: "I want the slow ones cut off at the same moment the customer leaves." },
      widget: { id: "timeout-lab", config: TO_CHALLENGE },
      conditions: [
        { metric: "success", op: ">=", value: 0.96, label: "At least 96% answered in time" },
        { metric: "wastedPct", op: "<=", value: 0.02, label: "At most 2% of database work wasted" },
      ],
      stars: [{ metric: "dbMsPerReq", op: "<=", value: 109, label: "Database time per request under 109 ms" }],
      hints: [
        "What happens to the answered rate when the database timeout is far shorter than the client's?",
        "What happens to wasted work when it is far longer?",
        "A timeout that follows the caller's remaining time makes the choice for you.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why a timeout longer than the caller's deadline wastes work, and how deadlines should flow through a call chain.",
    rubric: [
      { id: "waste", criterion: "If the downstream keeps working after the caller gave up, that work is thrown away and adds load", keyIdea: "work after the caller left" },
      { id: "budget", criterion: "Timeouts form a budget: each hop gets at most what the caller has left", keyIdea: "inner timeouts shorter than outer" },
      { id: "propagate", criterion: "Pass the deadline down the chain so every hop stops together", keyIdea: "deadline propagation" },
    ],
    exemplar:
      "If the database timeout is longer than the client's, the database keeps working on queries nobody is waiting for, which is pure waste and extra load. Timeouts are a budget, so each inner call should get no more than the time the caller has left. The best way is to pass the deadline down with the request so every hop stops at the same moment.",
  },
  reviews: [
    {
      id: "to-est",
      format: "estimate",
      scenario: "A request has a total deadline of 800 ms. The API itself uses 120 ms and you keep a 10 ms margin. How many milliseconds should the database call be allowed?",
      unit: "ms",
      answer: 670,
      acceptFactor: 1.05,
      breakdown: ["800 − 120 = 680", "680 − 10 = 670"],
      explain: "Each hop gets what the caller has left, less a margin to send the answer back.",
    },
    {
      id: "to-pick",
      format: "pick-fix",
      scenario: "Users abandon checkout at 3 seconds, but the payment service's timeout to the fraud check is 30 seconds. The fraud service is overloaded by queries nobody is waiting for. What is the fix?",
      options: [
        { id: "a", label: "Propagate the checkout deadline so the fraud call stops at about 3 seconds" },
        { id: "b", label: "Raise the fraud service's capacity" },
        { id: "c", label: "Raise the payment timeout to 60 seconds" },
        { id: "d", label: "Remove the timeout" },
      ],
      answer: "a",
      explain: "More capacity feeds the waste. A shorter, propagated deadline removes it.",
    },
    {
      id: "to-order",
      format: "order",
      scenario: "Order these timeouts for a call chain from outermost to innermost, longest first.",
      items: [
        { id: "client", label: "Browser to load balancer" },
        { id: "api", label: "API to the order service" },
        { id: "db", label: "Order service to the database" },
      ],
      answer: ["client", "api", "db"],
      explain: "Each inner timeout must be shorter than the one outside it, or the inner call outlives the caller.",
    },
    {
      id: "to-graph",
      format: "predict-graph",
      scenario: "The client waits 800 ms. As you raise the API's database timeout from 100 ms to 10 seconds, what happens to the share of database work that is wasted?",
      xLabel: "database timeout →",
      yLabel: "wasted database work",
      options: [
        { id: "step", label: "Near zero until the timeout passes the client's, then climbs and levels off", points: [0, 0, 0, 1, 8, 15, 20, 22] },
        { id: "flat", label: "Flat", points: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: "fall", label: "Falls", points: [22, 20, 15, 8, 3, 1, 0, 0] },
      ],
      answer: "step",
      explain: "While the database gives up before the client does, none of its work is wasted. Beyond that, each extra millisecond of timeout can be spent on an abandoned query.",
    },
    {
      id: "to-flaw",
      format: "spot-flaw",
      scenario: "The web tier waits 5 seconds for the API. The API waits 10 seconds for the database. A slow database causes thread exhaustion at the API. Tap the link in the chain that is set wrong.",
      diagram: {
        nodes: [
          { id: "web", label: "web (5 s)", kind: "client", col: 0, row: 1 },
          { id: "api", label: "API", kind: "server", col: 1, row: 1 },
          { id: "db", label: "database (10 s)", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "web", to: "api" },
          { from: "api", to: "db" },
        ],
      },
      answer: "api->db",
      explain: "The API holds a thread for up to 10 seconds, but the web tier left after 5. The inner timeout must be shorter than the outer.",
    },
    {
      id: "to-explain",
      format: "explain",
      scenario: "In two sentences: why not set every timeout to a very large value to avoid cutting off slow but valid requests?",
      rubric: [
        { id: "resources", criterion: "A hung call holds threads, connections and memory, so slow failures exhaust the caller" },
        { id: "cascade", criterion: "Long timeouts let a slow dependency drag down its callers and keep work running that nobody wants" },
      ],
      exemplar: "A slow call keeps holding a thread and a connection, so a few stuck calls can exhaust the caller. Long timeouts also let a slow dependency spread its trouble up the stack while doing work nobody wants.",
      explain: "A timeout is how slowness stays local.",
    },
  ],
  codex: {
    oneLiner: "Every call needs a timeout. Treat timeouts as a budget: inner calls get no more than the caller has left, ideally via a propagated deadline.",
    keyNumbers: [
      { label: "Wasted database work, 5 s timeout under an 800 ms client", value: "about 21% in the lab", sourceId: "sre-cascading" },
      { label: "Timeout for the inner call", value: "caller's deadline − own work − margin", sourceId: "grpc-deadlines" },
    ],
    tradeoffs: [
      { choice: "Short timeout", gain: "Fails fast; frees threads and connections", cost: "Cuts off slow but valid requests" },
      { choice: "Long timeout", gain: "Few valid requests cut off", cost: "Slow failures exhaust the caller; wasted work" },
      { choice: "Propagated deadline", gain: "Whole chain stops together", cost: "Every hop must honour it" },
    ],
    seenIn: ["gRPC deadlines carried in call metadata.", "HTTP clients with connect, read and total timeouts."],
    interviewAngle: "Say: 'inner timeouts shorter than outer, deadlines propagated down, and values set from the p99 of measured latency'.",
    aws: [{ concept: "Idle and request timeouts", service: "Application Load Balancer" }],
    replay: { id: "timeout-lab", config: TO, scene: "propagate" },
  },
  interview: [
    "How do you choose a timeout?",
    "What is deadline propagation?",
    "Why must inner timeouts be shorter than outer ones?",
  ],
  deeper: [
    {
      title: "Timeouts do not cancel work by themselves",
      body: "A client that gives up closes its side of the connection, but the server may never notice, and the database may keep running the query. Real cancellation needs the receiver to check for it: closing the request context, setting a statement timeout on the database, or checking a deadline between steps of long work.",
      sourceIds: ["sre-cascading"],
    },
  ],
  honestPhysics: [
    "The client calls an API with 20 ms of its own work (p99 60 ms), which calls a database with a median of 40 ms and a p99 of 1.5 seconds. Latencies are lognormal, drawn from a seeded generator over 20,000 requests.",
    "Wasted work is database time spent after the client's deadline. A request is answered in time only if the database finishes before its own timeout and the whole call fits the client's deadline.",
    "With propagation the database gets the client's deadline minus the API's work and a 10 ms margin.",
  ],
  sources: [BUILDERS, SRE_CASCADE, GRPC],
  verify: [
    { id: "waste", claim: "With a 5-second database timeout under an 800 ms client, about a fifth of database work is wasted", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 5000, propagate: false }, metric: "wastedPct" }, expect: { min: 0.19, max: 0.23 } },
    { id: "matched", claim: "A database timeout equal to the client's wastes under 1%", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 800, propagate: false }, metric: "wastedPct" }, expect: { max: 0.01 } },
    { id: "prop-waste", claim: "Propagating the deadline wastes nothing", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 5000, propagate: true }, metric: "wastedPct" }, expect: { max: 0.001 } },
    { id: "prop-success", claim: "…and still answers at least 96% in time", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 5000, propagate: true }, metric: "success" }, expect: { min: 0.96 } },
    { id: "too-short", claim: "A 200 ms database timeout cuts off many good requests", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 200, propagate: false }, metric: "success" }, expect: { max: 0.9 } },
    { id: "slightly-long", claim: "A 900 ms database timeout already wastes over 2.5%", run: "lab", params: { model: "timeout-lab", config: TO_CHALLENGE, values: { dbT: 900, propagate: false }, metric: "wastedPct" }, expect: { min: 0.025 } },
  ],
});
