import { definePack } from "../define";

export const TCP = { hide: ["resumed", "reuse", "requests"], start: { rtt: 100, stack: "h1-tls12", resumed: false, reuse: false, requests: 1 } };
export const TCP_MOBILE = { hide: ["reuse", "requests", "resumed"], start: { rtt: 150, stack: "h1-tls12", resumed: false } };

const RFC9293 = { id: "rfc9293", title: "RFC 9293: Transmission Control Protocol (TCP)", url: "https://www.rfc-editor.org/rfc/rfc9293" };
const RFC768 = { id: "rfc768", title: "RFC 768: User Datagram Protocol (UDP)", url: "https://www.rfc-editor.org/rfc/rfc768" };
const RFC9000 = { id: "rfc9000", title: "RFC 9000: QUIC, a UDP-Based Multiplexed and Secure Transport", url: "https://www.rfc-editor.org/rfc/rfc9000" };

export default definePack({
  id: "tcp-udp",
  title: "TCP vs UDP",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "Mobile first-byte · Kerala", detail: "users on 4G wait before anything arrives" },
    lines: [
      { speaker: "kabir", line: "Our server answers in twenty milliseconds, yet users on 4G wait half a second for the first byte. Where did the time go?" },
      { speaker: "meera", line: "Before your server hears the request, the two machines have to agree to talk. Agreements cost round trips." },
    ],
  },
  predictions: [
    {
      id: "round-trips",
      kind: "choice",
      prompt: "A browser opens a plain TCP connection to a server, then sends its first request. How many round trips does it wait before the request can leave?",
      options: [
        { id: "zero", label: "None, the request goes straight out" },
        { id: "one", label: "One, for the handshake" },
        { id: "two", label: "Two" },
        { id: "three", label: "Three" },
      ],
      answer: "one",
      observe: "compared",
      reveal: {
        text: "TCP's handshake costs one round trip: the client sends SYN, the server answers SYN-ACK, and the client can send data with its ACK. Layer TLS 1.2 on top and there are two more.",
        sourceIds: ["rfc9293"],
        line: { speaker: "meera", line: "Count round trips, not code. At 150ms each, they are the whole story." },
      },
    },
  ],
  widget: { id: "connect-lab", config: TCP },
  mechanism: [
    {
      id: "tcp",
      scene: "tcp",
      text: "TCP gives you a reliable, ordered stream. To do that it sets up a connection first, numbers every byte, retransmits what is lost, and slows down when the network is congested. The setup is a round trip the first request cannot skip.",
      sourceIds: ["rfc9293"],
    },
    {
      id: "udp",
      text: "UDP gives you datagrams and nothing else: no connection, no ordering, no retransmission. That makes it the right base for things that care more about freshness than completeness, like voice and games, and for protocols that build their own reliability.",
      sourceIds: ["rfc768"],
    },
    {
      id: "quic",
      scene: "udp",
      text: "QUIC builds reliable, encrypted streams on top of UDP. It combines the transport and TLS handshakes into one round trip, and because loss recovery is per stream, a lost packet no longer stalls every request on the connection. HTTP/3 runs on it.",
      sourceIds: ["rfc9000"],
    },
    {
      id: "choose",
      text: "Choose by what a late or missing packet means. A web page needs every byte, in order, so reliable streams matter. A video call prefers to skip a frame than to wait. Round-trip count dominates for short requests; bandwidth dominates for large ones.",
    },
  ],
  challenges: [
    {
      id: "mobile-first-byte",
      title: "Win back the first byte",
      brief: "Pigeon's mobile users are 150 ms from the server. Their first byte takes 660 ms with HTTP/1.1 over TCP and TLS 1.2. Pick a stack so the first byte arrives in under 400 ms.",
      line: { speaker: "kabir", line: "I can't move the server closer. I can change the protocols." },
      widget: { id: "connect-lab", config: TCP_MOBILE },
      conditions: [{ metric: "ttfbMs", op: "<", value: 400, label: "First byte under 400 ms" }],
      stars: [{ metric: "roundTrips", op: "<=", value: 2, label: "Two round trips in total, request included" }],
      hints: [
        "How many round trips does each stack spend before the request is even sent?",
        "At 150ms per round trip, which stacks can fit under 400ms with DNS and 20ms of server time?",
        "Which protocol merges the transport and TLS handshakes?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain TCP versus UDP, and why connection setup matters for latency.",
    rubric: [
      { id: "tcp", criterion: "TCP gives reliable, ordered streams using a handshake, retransmission, and congestion control", keyIdea: "reliable ordered stream" },
      { id: "udp", criterion: "UDP is connectionless datagrams with no delivery guarantee, useful for freshness-sensitive traffic or as a base for other protocols", keyIdea: "datagrams, no guarantees" },
      { id: "setup", criterion: "Each handshake is a round trip before data, so at high RTT setup dominates short requests", keyIdea: "round trips before data" },
    ],
    exemplar:
      "TCP provides a reliable, ordered byte stream, which it achieves with a handshake, retransmission, and congestion control. UDP just sends datagrams with no guarantee, which suits voice and games and is the base QUIC builds on. Because every handshake is a round trip before the first byte, at a long round-trip time the setup can cost more than the server's work.",
  },
  reviews: [
    {
      id: "tu-est-first",
      format: "estimate",
      scenario: "A client is 80 ms round trip from a server. It opens a TCP connection and sends one request, with 20 ms of server time and no TLS and a cached DNS answer. When does the first byte arrive?",
      unit: "ms",
      answer: 180,
      acceptFactor: 1.2,
      breakdown: ["TCP handshake: 80 ms", "Request out and response back: 80 ms", "Server time: 20 ms", "= 180 ms"],
      explain: "Handshake round trip plus request round trip plus processing. Two round trips before anything useful.",
    },
    {
      id: "tu-pick",
      format: "pick-fix",
      scenario: "You are building a live multiplayer game where a position update that arrives 200 ms late is worse than a lost one. Which transport fits best?",
      options: [
        { id: "a", label: "TCP, so every update arrives in order" },
        { id: "b", label: "UDP, with the game tolerating loss" },
        { id: "c", label: "TCP with a bigger window" },
        { id: "d", label: "HTTP long polling" },
      ],
      answer: "b",
      explain: "With TCP, one lost packet delays everything behind it until it is retransmitted. For state that is stale a moment later, dropping the packet and sending fresh state is better.",
    },
    {
      id: "tu-order",
      format: "order",
      scenario: "Order these by round trips needed before the first request can leave the client, fewest first.",
      items: [
        { id: "quic0", label: "QUIC resuming a recent session (0-RTT)" },
        { id: "quic", label: "QUIC, first connection" },
        { id: "tls13", label: "TCP + TLS 1.3" },
        { id: "tls12", label: "TCP + TLS 1.2" },
      ],
      answer: ["quic0", "quic", "tls13", "tls12"],
      explain: "Zero, one, two, and three round trips. Each protocol revision removed a round trip from the handshake.",
    },
    {
      id: "tu-graph",
      format: "predict-graph",
      scenario: "Hold the server work at 20 ms and raise the client's round-trip time from 10 ms to 300 ms. How does the first byte on TCP + TLS 1.2 change?",
      xLabel: "round-trip time →",
      yLabel: "first byte",
      options: [
        { id: "linear", label: "Rises in a straight line, steeply", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "flat", label: "Barely changes", points: [1, 1.05, 1.1, 1.1, 1.15, 1.2, 1.2, 1.25] },
        { id: "hockey", label: "Flat, then shoots up", points: [1, 1, 1.1, 1.3, 1.7, 2.5, 4, 8] },
        { id: "step", label: "Jumps once, then stays flat", points: [1, 1, 1, 5, 5, 5, 5, 5] },
      ],
      answer: "linear",
      explain: "Four round trips are in front of the first byte, so the first byte grows by four times the round-trip time. The 20 ms of server work is a small constant.",
    },
    {
      id: "tu-flaw",
      format: "spot-flaw",
      scenario: "A team streams live telemetry from sensors, where only the latest reading matters, over TCP. During a bad network patch the dashboard freezes, then dumps old readings. Tap the choice that caused the freeze.",
      diagram: {
        nodes: [
          { id: "sensors", label: "sensors", kind: "client", col: 0, row: 1 },
          { id: "tcp", label: "TCP stream (ordered, retransmits)", kind: "external", col: 1, row: 1 },
          { id: "dash", label: "dashboard", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "sensors", to: "tcp" },
          { from: "tcp", to: "dash" },
        ],
      },
      answer: "tcp",
      explain: "TCP delivers in order, so a lost packet blocks every later reading until it is retransmitted. For latest-value data, datagrams that can be dropped avoid the stall.",
    },
    {
      id: "tu-explain",
      format: "explain",
      scenario: "In two sentences: why does QUIC run over UDP instead of being a new transport protocol of its own?",
      rubric: [
        { id: "deploy", criterion: "Networks, firewalls, and middleboxes already pass UDP, while a new IP protocol would be blocked or rewritten" },
        { id: "user", criterion: "Running in user space lets it evolve and combine handshakes with TLS, with per-stream loss recovery" },
      ],
      exemplar: "Middleboxes and firewalls already allow UDP, whereas a brand-new transport would be dropped. Building on UDP also lets QUIC live in user space and evolve quickly, merging the TLS handshake in and recovering loss per stream.",
      explain: "QUIC is a new transport that happens to look like UDP so the internet will carry it.",
    },
  ],
  codex: {
    oneLiner: "TCP gives a reliable ordered stream at the cost of a handshake round trip. UDP gives bare datagrams. QUIC builds reliable streams on UDP.",
    keyNumbers: [
      { label: "TCP connection setup", value: "1 round trip", sourceId: "rfc9293" },
      { label: "QUIC with TLS 1.3", value: "1 round trip, 0 when resuming", sourceId: "rfc9000" },
    ],
    tradeoffs: [
      { choice: "TCP", gain: "Reliable, ordered, universally supported", cost: "Setup round trip and head-of-line blocking after loss" },
      { choice: "UDP", gain: "No setup, tolerates loss, fresh data", cost: "You build reliability yourself if you need it" },
      { choice: "QUIC / HTTP/3", gain: "Fewer round trips, per-stream recovery", cost: "Newer, some networks block UDP, more CPU" },
    ],
    seenIn: ["Browsers silently preferring HTTP/3 where available.", "DNS, voice and video calls, and game networking running on UDP."],
    interviewAngle: "Say what a lost packet means for the data: 'it must arrive, so TCP'; 'a stale frame is useless, so UDP'. Then mention round trips for connection setup.",
    aws: [{ concept: "HTTP/3 at the edge", service: "Amazon CloudFront (HTTP/3 support)" }],
    replay: { id: "connect-lab", config: TCP, scene: "tcp" },
  },
  interview: [
    "When would you choose UDP over TCP?",
    "Why is the first request on a new connection slower than later ones?",
    "What problem does QUIC solve that HTTP/2 over TCP did not?",
  ],
  deeper: [
    {
      title: "Why TCP's guarantees cost latency",
      body: "TCP numbers every byte and holds back delivery until earlier bytes arrive. If one packet is lost, later packets sit in the receiver's buffer until the retransmission lands, one round trip or more later. That head-of-line blocking is harmless for a single download and painful for many independent requests sharing one connection.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Costs are counted in whole round trips with a fixed 20 ms of server time and a 40 ms DNS lookup. Real handshakes also pay for certificate size and CPU.",
    "0-RTT resumption can send data in the first flight, which carries a replay risk, so servers limit what it can do.",
  ],
  sources: [RFC9293, RFC768, RFC9000],
  verify: [
    { id: "h1", claim: "HTTP/1.1 over TCP + TLS 1.2 at 150 ms takes 660 ms to first byte", run: "lab", params: { model: "connect-lab", config: TCP_MOBILE, values: { stack: "h1-tls12" }, metric: "ttfbMs" }, expect: { min: 659, max: 661 } },
    { id: "h2", claim: "HTTP/2 with TLS 1.3 is still over 400 ms", run: "lab", params: { model: "connect-lab", config: TCP_MOBILE, values: { stack: "h2-tls13" }, metric: "ttfbMs" }, expect: { min: 400 } },
    { id: "h3", claim: "QUIC gets under 400 ms", run: "lab", params: { model: "connect-lab", config: TCP_MOBILE, values: { stack: "h3-quic" }, metric: "ttfbMs" }, expect: { max: 399 } },
  ],
});
