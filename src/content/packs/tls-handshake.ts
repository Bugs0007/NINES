import { definePack } from "../define";

export const TLS = { hide: ["reuse", "requests"], start: { rtt: 100, stack: "h1-tls12", resumed: false } };
export const TLS_SLOW = { hide: ["reuse", "requests"], start: { rtt: 200, stack: "h1-tls12", resumed: false } };

const RFC8446 = { id: "rfc8446", title: "RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3", url: "https://www.rfc-editor.org/rfc/rfc8446" };
const CF_TLS = { id: "cf-tls", title: "Cloudflare Learning Center: What happens in a TLS handshake?", url: "https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/" };
const LE = { id: "letsencrypt-how", title: "Let's Encrypt: How it works (certificate issuance and validation)", url: "https://letsencrypt.org/how-it-works/" };

export default definePack({
  id: "tls-handshake",
  title: "TLS Handshake",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "terminal",
    alert: { severity: "info", title: "Security review · transport", detail: "TLS 1.2 still negotiated on 30% of connections" },
    lines: [
      { speaker: "rao", line: "Security wants TLS 1.3 everywhere. I want to know if it costs us anything besides a config change." },
      { speaker: "meera", line: "It saves you a round trip. Let's see why, starting with what the handshake is actually agreeing on." },
    ],
  },
  predictions: [
    {
      id: "tls-rtts",
      kind: "choice",
      prompt: "After the TCP handshake, how many extra round trips does TLS 1.2 add before the client can send its request? And TLS 1.3?",
      options: [
        { id: "a", label: "TLS 1.2: 1, TLS 1.3: 0" },
        { id: "b", label: "TLS 1.2: 2, TLS 1.3: 1" },
        { id: "c", label: "TLS 1.2: 3, TLS 1.3: 2" },
        { id: "d", label: "Both add the same" },
      ],
      answer: "b",
      observe: "compared",
      reveal: {
        text: "TLS 1.2 needs two round trips of negotiation and key exchange. TLS 1.3 sends the client's key share in its first message, so one round trip is enough. A resumed session can send data even sooner.",
        sourceIds: ["rfc8446"],
        line: { speaker: "meera", line: "Same security goals, one trip fewer." },
      },
    },
  ],
  widget: { id: "connect-lab", config: TLS },
  mechanism: [
    {
      id: "goal",
      text: "The handshake has three jobs: agree on a cipher suite, prove the server is who it claims to be with a certificate, and derive a shared secret nobody watching can compute. After that, both sides encrypt with fast symmetric keys.",
      sourceIds: ["cf-tls"],
    },
    {
      id: "one-rtt",
      scene: "tls",
      text: "TLS 1.3 guesses the key-exchange group and sends its key share in the very first message, so the server can finish its half in one reply. TLS 1.2 negotiated first and exchanged keys second, which is why it needs two round trips.",
      sourceIds: ["rfc8446"],
    },
    {
      id: "resume",
      scene: "tls",
      text: "A client that has talked to the server recently can resume the session with a ticket and skip the key exchange. TLS 1.3 even allows 0-RTT data in the first flight, but that data can be replayed by an attacker, so servers accept it only for safe, repeatable requests.",
      sourceIds: ["rfc8446"],
    },
    {
      id: "certs",
      text: "The certificate links the server's key to its name through a chain of signatures up to a root the client already trusts. Automated authorities such as Let's Encrypt issue and renew them for free, which makes expiry, not cost, the common failure.",
      sourceIds: ["letsencrypt-how"],
    },
  ],
  challenges: [
    {
      id: "slow-link",
      title: "Trim the handshake",
      brief: "Pigeon's users in a remote region are 200 ms from the nearest server, and the first byte takes 860 ms on TLS 1.2 over TCP. Pick a stack, and use session resumption for returning users, to get the first byte under 500 ms.",
      line: { speaker: "kabir", line: "Security wants 1.3 anyway. If it also fixes this, good." },
      widget: { id: "connect-lab", config: TLS_SLOW },
      conditions: [{ metric: "ttfbMs", op: "<", value: 500, label: "First byte under 500 ms" }],
      stars: [{ metric: "roundTrips", op: "<=", value: 1, label: "Request round trip only, no handshake wait" }],
      hints: [
        "How many round trips does TLS 1.2 spend before the request, at 200 ms each?",
        "Which version of the handshake removes one, and what removes the next?",
        "Resumption helps only for clients who have been here before. Which stacks drop below 500 ms?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what a TLS handshake achieves and why TLS 1.3 is faster than TLS 1.2.",
    rubric: [
      { id: "goals", criterion: "Authenticates the server with a certificate and derives a shared secret for symmetric encryption", keyIdea: "authenticate and agree on keys" },
      { id: "rtt", criterion: "TLS 1.3 needs one round trip because the client sends its key share in the first message, versus two for TLS 1.2", keyIdea: "1-RTT" },
      { id: "resume", criterion: "Mentions resumption or 0-RTT and its replay caveat", keyIdea: "resumption and replay risk" },
    ],
    exemplar:
      "The handshake proves the server's identity with a certificate and derives a shared secret so the rest of the traffic can use fast symmetric encryption. TLS 1.3 sends the client's key share in the first message, so it finishes in one round trip instead of two. Resuming a session can skip even that, and 0-RTT data can leave in the first flight, though a captured copy can be replayed so only safe requests should use it.",
  },
  reviews: [
    {
      id: "tls-est-first",
      format: "estimate",
      scenario: "A client is 100 ms round trip from a server and uses TCP with TLS 1.3. With cached DNS and 20 ms of server work, how long to the first byte?",
      unit: "ms",
      answer: 320,
      acceptFactor: 1.2,
      breakdown: ["TCP: 100 ms", "TLS 1.3: 100 ms", "Request and response: 100 ms", "Server work: 20 ms", "= 320 ms"],
      explain: "Three round trips plus the server's work. TLS 1.2 would have been 420 ms.",
    },
    {
      id: "tls-pick",
      format: "pick-fix",
      scenario: "Users complain the site is slow on every first visit from far-away regions, but fast after that. Server work is 20 ms. Which change helps first visits most?",
      options: [
        { id: "a", label: "Enable TLS 1.3 and session tickets" },
        { id: "b", label: "Compress images more" },
        { id: "c", label: "Add database indexes" },
        { id: "d", label: "Increase the connection pool" },
      ],
      answer: "a",
      explain: "On a long round trip the handshake dominates a fast first byte. Fewer round trips in the handshake cut straight into it.",
    },
    {
      id: "tls-order",
      format: "order",
      scenario: "Order these handshake designs by round trips before the first request can leave, fewest first.",
      items: [
        { id: "res13", label: "TLS 1.3 resumption with 0-RTT data" },
        { id: "tls13", label: "TLS 1.3 full handshake" },
        { id: "tls12", label: "TLS 1.2 full handshake" },
      ],
      answer: ["res13", "tls13", "tls12"],
      explain: "Zero, one, and two round trips of TLS, on top of TCP's own. Each revision removed a trip, and resumption removes the last one for returning clients.",
    },
    {
      id: "tls-flaw",
      format: "spot-flaw",
      scenario: "Users see browser certificate warnings at 03:00 every 90 days. Tap the part of the system that is failing.",
      diagram: {
        nodes: [
          { id: "browser", label: "browser", kind: "client", col: 0, row: 1 },
          { id: "nginx", label: "nginx · certificate expires every 90 days", kind: "server", col: 1, row: 1 },
          { id: "renew", label: "renewal: a cron job someone wrote by hand", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "browser", to: "nginx" },
          { from: "renew", to: "nginx" },
        ],
      },
      answer: "renew",
      explain: "Short-lived certificates are meant to be renewed automatically and monitored. A hand-rolled renewal that silently fails turns a 90-day certificate into a recurring outage.",
    },
    {
      id: "tls-graph",
      format: "predict-graph",
      scenario: "Round-trip time grows from 10 ms to 300 ms. How does the gap between TLS 1.2 and TLS 1.3 first byte change?",
      xLabel: "round-trip time →",
      yLabel: "gap",
      options: [
        { id: "grows", label: "Grows in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "const", label: "Stays the same", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "shrinks", label: "Shrinks to nothing", points: [8, 6, 4, 3, 2, 1, 0.5, 0] },
        { id: "step", label: "Jumps once", points: [1, 1, 1, 6, 6, 6, 6, 6] },
      ],
      answer: "grows",
      explain: "The gap is exactly one round trip, so it grows with the round-trip time. At 10 ms it is invisible; at 300 ms it is a third of a second.",
    },
    {
      id: "tls-explain",
      format: "explain",
      scenario: "In two sentences: why can 0-RTT data be dangerous, and what do servers do about it?",
      rubric: [
        { id: "replay", criterion: "0-RTT data can be captured and replayed by an attacker" },
        { id: "limit", criterion: "Servers accept it only for idempotent or safe requests, or reject it where replay would do harm" },
      ],
      exemplar: "Data sent in the first flight is not protected against replay, so an attacker could resend it. Servers therefore accept 0-RTT only for safe, repeatable requests.",
      explain: "Speed from skipping the handshake is paid for with replay risk.",
    },
  ],
  codex: {
    oneLiner: "The TLS handshake authenticates the server and derives a shared key. Version 1.3 does it in one round trip; resumption can skip it.",
    keyNumbers: [
      { label: "TLS 1.2 full handshake", value: "2 round trips", sourceId: "rfc8446" },
      { label: "TLS 1.3 full handshake", value: "1 round trip", sourceId: "rfc8446" },
      { label: "TLS 1.3 resumption", value: "0 round trips for early data, with replay risk", sourceId: "rfc8446" },
    ],
    tradeoffs: [
      { choice: "TLS 1.3 everywhere", gain: "One fewer round trip, simpler and safer cipher suites", cost: "Some legacy clients and middleboxes need care" },
      { choice: "0-RTT early data", gain: "No handshake wait for returning clients", cost: "Replay risk; limit to safe requests" },
      { choice: "Terminate TLS at a proxy or edge", gain: "Shorter handshake path, central certificates", cost: "Traffic behind the edge needs its own protection" },
    ],
    seenIn: ["Expired certificate outages.", "Terminating TLS at an ALB or CloudFront rather than on each app server."],
    interviewAngle: "Mention that TLS adds one to two round trips and that termination at the edge puts those round trips on a short path. Name the renewal story: 'automated, monitored certificates'.",
    aws: [{ concept: "Managed certificates", service: "AWS Certificate Manager (ACM)", note: "Free public certificates for ALB, CloudFront, and API Gateway" }],
    replay: { id: "connect-lab", config: TLS, scene: "tls" },
  },
  interview: [
    "What does a TLS handshake do, in plain terms?",
    "Why is TLS 1.3 faster than TLS 1.2?",
    "How do you keep certificates from expiring in production?",
  ],
  deeper: [
    {
      title: "Forward secrecy",
      body: "Modern handshakes use ephemeral key exchange, so each connection gets a fresh secret that is thrown away afterwards. Recording the traffic and stealing the server's long-term key later does not let an attacker decrypt it. TLS 1.3 requires this, which is one of its security improvements as well as a speed one.",
      sourceIds: ["rfc8446"],
    },
  ],
  honestPhysics: [
    "Costs are counted in whole round trips, with 20 ms of server work and a 40 ms DNS lookup. Real handshakes also cost certificate bytes and CPU.",
    "The lab treats each resumption as always available to a returning client. Ticket lifetimes and server rotation limit that in practice.",
  ],
  sources: [RFC8446, CF_TLS, LE],
  verify: [
    { id: "tls12", claim: "TLS 1.2 over TCP at 200 ms takes 860 ms to first byte", run: "lab", params: { model: "connect-lab", config: TLS_SLOW, values: { stack: "h1-tls12", resumed: false }, metric: "ttfbMs" }, expect: { min: 859, max: 861 } },
    { id: "tls13", claim: "TLS 1.3 alone is still over 500 ms", run: "lab", params: { model: "connect-lab", config: TLS_SLOW, values: { stack: "h2-tls13", resumed: false }, metric: "ttfbMs" }, expect: { min: 500 } },
    { id: "resumed", claim: "TLS 1.3 with resumption gets under 500 ms", run: "lab", params: { model: "connect-lab", config: TLS_SLOW, values: { stack: "h2-tls13", resumed: true }, metric: "ttfbMs" }, expect: { max: 499 } },
  ],
});
