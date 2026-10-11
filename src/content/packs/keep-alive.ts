import { definePack } from "../define";

export const KEEP = { hide: ["stack", "resumed"], start: { rtt: 100, stack: "h1-tls12", resumed: false, reuse: false, requests: 1 } };
export const KEEP_CHALLENGE = { hide: ["stack", "resumed"], start: { rtt: 100, stack: "h1-tls12", resumed: false, reuse: false, requests: 10 } };

const RFC9112 = { id: "rfc9112", title: "RFC 9112: HTTP/1.1 (persistent connections)", url: "https://www.rfc-editor.org/rfc/rfc9112" };
const NGINX_KEEPALIVE = { id: "nginx-upstream-keepalive", title: "nginx docs: Module ngx_http_upstream_module, the keepalive directive (connections cached per worker)", url: "https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive" };
const REQUESTS_SESSION = { id: "requests-session", title: "Python Requests docs: Session objects (connection pooling and keep-alive)", url: "https://requests.readthedocs.io/en/latest/user/advanced/#session-objects" };

export default definePack({
  id: "keep-alive",
  title: "Keep-alive & Connection Reuse",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "Order service → payments API", detail: "p50 doubled after the move to another region" },
    lines: [
      { speaker: "kabir", line: "Ten calls to the payments API take four seconds from our new region, and the API itself answers in twenty milliseconds." },
      { speaker: "meera", line: "Are you opening a fresh connection for every call? Because at that distance each handshake costs more than the work." },
    ],
  },
  predictions: [
    {
      id: "ten-calls",
      kind: "numeric",
      prompt: "A client 100 ms from a server makes 10 sequential calls over HTTP/1.1 with TLS 1.2, opening a new connection for each. The server takes 20 ms. Roughly how long do all ten take?",
      unit: "ms",
      min: 300,
      max: 20000,
      log: true,
      answer: 4200,
      tolerance: 1.4,
      observe: "reused",
      reveal: {
        text: "Each call pays a TCP handshake, two TLS round trips, and the request itself: four round trips of 100ms plus 20ms of work, about 420ms. Ten calls is about 4.2 seconds. With one reused connection, the nine later calls cost 120ms each.",
        derived: true,
        line: { speaker: "meera", line: "The handshake is a toll. Pay it once." },
      },
    },
  ],
  widget: { id: "connect-lab", config: KEEP },
  mechanism: [
    {
      id: "persist",
      scene: "reuse",
      text: "HTTP/1.1 connections are persistent by default: after a response the connection stays open for the next request. Reuse skips the TCP and TLS handshakes entirely, so later requests cost one round trip plus the server's work.",
      sourceIds: ["rfc9112"],
    },
    {
      id: "tax",
      text: "The handshake tax is fixed per connection, so it hurts most when requests are short and many. At 100 ms round trip a TLS 1.2 handshake costs about 300 ms, which is more than ten times the server's 20 ms of work.",
      derived: true,
    },
    {
      id: "pool",
      text: "Clients reuse connections through a pool or session object. Python's requests does it only if you use a Session, and nginx reuses upstream connections only when you configure keepalive and HTTP/1.1 toward the upstream. Defaults that skip reuse are a common hidden cost.",
      sourceIds: ["requests-session", "nginx-upstream-keepalive"],
    },
    {
      id: "limits",
      text: "Idle connections are not free and are not forever: servers and load balancers close them after an idle timeout, and each open connection holds memory. Set the client's idle limit shorter than the server's, or the first request after a lull can hit a connection the server already closed.",
    },
  ],
  challenges: [
    {
      id: "ten-calls",
      title: "Bring the ten calls under two seconds",
      brief: "The order service makes 10 sequential calls to the payments API, 100 ms away. Each currently opens a fresh connection with TLS 1.2. Turn on connection reuse and get the total under 1.8 seconds.",
      line: { speaker: "rao", line: "It's a one-line change in the client, if you know which line." },
      widget: { id: "connect-lab", config: KEEP_CHALLENGE },
      conditions: [{ metric: "totalMs", op: "<", value: 1800, label: "All ten calls under 1.8 s" }],
      stars: [{ metric: "setupMs", op: "<=", value: 300, label: "One handshake's worth of setup" }],
      hints: [
        "How much of each call is handshake, and how much is the request?",
        "What happens to the handshake for the second call if the first connection stays open?",
        "Turn on keep-alive and run it again.",
      ],
    },
  ],
  explainBack: {
    prompt: "Why do clients reuse connections, and what can go wrong with it?",
    rubric: [
      { id: "tax", criterion: "Each new connection pays TCP and TLS handshakes, which at high latency cost more than the request", keyIdea: "handshake tax" },
      { id: "reuse", criterion: "Keep-alive and pooling pay the handshake once and reuse the connection", keyIdea: "pay once" },
      { id: "caveat", criterion: "Names a caveat: idle timeouts, a stale closed connection, or per-connection memory", keyIdea: "idle timeouts" },
    ],
    exemplar:
      "Every new connection costs a TCP handshake and a TLS handshake before the first byte, which at long distances costs more than the request itself. Keep-alive and connection pools pay that once and reuse the connection for later requests. The caveats are idle timeouts, since a connection the server already closed fails the next request, and the memory each open connection holds.",
  },
  reviews: [
    {
      id: "ka-est-one",
      format: "estimate",
      scenario: "A client 50 ms from the server opens a new connection with TLS 1.2 for one request. Server work is 10 ms and DNS is cached. About how long does the request take?",
      unit: "ms",
      answer: 210,
      acceptFactor: 1.2,
      breakdown: ["TCP: 50 ms", "TLS 1.2: 100 ms", "Request: 50 ms", "Server: 10 ms", "= 210 ms"],
      explain: "Four round trips, three of them handshake. The 10 ms of real work is under 5% of the total.",
    },
    {
      id: "ka-est-reused",
      format: "estimate",
      scenario: "Same client and server (50 ms round trip, 10 ms of work), but the connection is reused. How long does each later request take?",
      unit: "ms",
      answer: 60,
      acceptFactor: 1.2,
      breakdown: ["Request and response: 50 ms", "Server work: 10 ms", "= 60 ms"],
      explain: "With the handshake already paid, a request costs one round trip plus the server's work.",
    },
    {
      id: "ka-pick",
      format: "pick-fix",
      scenario: "A Python service calls an internal API 200 times per request using requests.get() in a loop. Latency is high even though the API is fast. What do you change?",
      options: [
        { id: "a", label: "Use a requests.Session so connections are pooled and reused" },
        { id: "b", label: "Add more API servers" },
        { id: "c", label: "Increase the API's CPU" },
        { id: "d", label: "Lower the log level" },
      ],
      answer: "a",
      explain: "requests.get() makes a new connection each time unless you use a Session. Reusing connections removes the handshake from 199 of the 200 calls.",
    },
    {
      id: "ka-order",
      format: "order",
      scenario: "Order these by total time for ten sequential 100 ms round-trip calls, fastest first.",
      items: [
        { id: "reuse13", label: "Reused connection, TLS 1.3" },
        { id: "reuse12", label: "Reused connection, TLS 1.2" },
        { id: "new13", label: "New connection each time, TLS 1.3" },
        { id: "new12", label: "New connection each time, TLS 1.2" },
      ],
      answer: ["reuse13", "reuse12", "new13", "new12"],
      explain: "Reuse removes nine handshakes, which is worth far more than the one round trip TLS 1.3 saves per handshake. Newer TLS and reuse stack.",
    },
    {
      id: "ka-flaw",
      format: "spot-flaw",
      scenario: "nginx proxies to an app on the same host but opens a new TCP connection to the app for every request, so the host shows thousands of TIME_WAIT sockets. Tap the part that needs fixing.",
      diagram: {
        nodes: [
          { id: "client", label: "client", kind: "client", col: 0, row: 1 },
          { id: "nginx", label: "nginx (proxy_pass, default settings)", kind: "server", col: 1, row: 1 },
          { id: "app", label: "app", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "nginx" },
          { from: "nginx", to: "app" },
        ],
      },
      answer: "nginx->app",
      explain: "By default nginx opens a fresh connection to the upstream per request. Enable upstream keepalive, with HTTP/1.1 and a cleared Connection header, so those connections are reused.",
    },
    {
      id: "ka-explain",
      format: "explain",
      scenario: "In two sentences: why can a keep-alive connection cause an error on the first request after a quiet period?",
      rubric: [
        { id: "idle", criterion: "The server or a middlebox closes idle connections after a timeout" },
        { id: "stale", criterion: "The client reuses a connection it does not know is closed, so the request fails or must be retried" },
      ],
      exemplar: "Servers and load balancers close idle connections after a timeout. A client that still thinks the connection is open sends on it and gets a reset, so the client's idle limit should be shorter than the server's.",
      explain: "Reuse needs both ends to agree on when a connection is dead.",
    },
  ],
  codex: {
    oneLiner: "A new connection pays TCP and TLS handshakes before any data. Keep-alive and pools pay once and reuse, which matters most for many short requests.",
    keyNumbers: [
      { label: "Handshake before data (TCP + TLS 1.2)", value: "3 round trips", sourceId: "rfc9112" },
      { label: "Reused connection", value: "1 round trip per request", sourceId: "rfc9112" },
    ],
    tradeoffs: [
      { choice: "Reuse connections", gain: "Removes handshake latency and CPU for later requests", cost: "Idle timeouts and stale connections need handling; open sockets hold memory" },
      { choice: "New connection per request", gain: "Simple, no stale state", cost: "Handshake on every request" },
    ],
    seenIn: ["Database and HTTP client pools.", "nginx upstream keepalive and ALB idle timeouts."],
    interviewAngle: "When a service-to-service call is chatty, say 'persistent connections with a pool' unprompted, and name the idle-timeout caveat.",
    aws: [{ concept: "Idle timeout", service: "ALB idle timeout (default 60 seconds)", note: "Keep client idle timeouts below it" }],
    replay: { id: "connect-lab", config: { ...KEEP, start: { ...KEEP.start, requests: 10, reuse: true } }, scene: "reuse" },
  },
  interview: [
    "Why is the first request to a server slower than later ones?",
    "What does nginx need to reuse connections to an upstream?",
    "How do you avoid errors caused by idle connection timeouts?",
  ],
  deeper: [
    {
      title: "Reuse and multiplexing",
      body: "HTTP/2 and HTTP/3 take reuse further: one connection carries many requests at once, so a client needs far fewer connections. A pool of a few HTTP/2 connections can replace dozens of HTTP/1.1 ones, which also relieves servers, load balancers, and NAT tables of connection counts.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Costs are whole round trips with 20 ms of server time and a 40 ms DNS lookup on the first request only.",
    "Requests here are sequential. Real clients also open several connections in parallel.",
  ],
  sources: [RFC9112, NGINX_KEEPALIVE, REQUESTS_SESSION],
  verify: [
    { id: "new-each", claim: "Ten calls on fresh connections take over 4 s", run: "lab", params: { model: "connect-lab", config: KEEP_CHALLENGE, values: { reuse: false }, metric: "totalMs" }, expect: { min: 4000 } },
    { id: "reuse", claim: "With reuse they take under 1.8 s", run: "lab", params: { model: "connect-lab", config: KEEP_CHALLENGE, values: { reuse: true }, metric: "totalMs" }, expect: { max: 1800 } },
  ],
});
