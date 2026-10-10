import { definePack } from "../define";

export const JOURNEY = { region: "frankfurt" };

const HPBN = { id: "hpbn", title: "I. Grigorik, High Performance Browser Networking (DNS, TCP, TLS, HTTP, and the cost of round trips)", url: "https://hpbn.co/" };
const WEBDEV_TTFB = { id: "webdev-ttfb", title: "web.dev: Time to First Byte (TTFB)", url: "https://web.dev/articles/ttfb" };

export default definePack({
  id: "request-journey",
  title: "Follow One Request",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "RUM · time to first byte · Frankfurt", detail: "p75 is five times our server time" },
    lines: [
      { speaker: "kabir", line: "The server answers in twenty milliseconds, yet users in Frankfurt wait half a second for the first byte. Where is the rest going?" },
      { speaker: "meera", line: "Follow one request from the thumb to your code and count the round trips. Your code is the shortest part." },
    ],
  },
  predictions: [
    {
      id: "trips",
      kind: "choice",
      prompt: "A browser has never visited your site. How many round trips to the far-away origin does it make before the first byte of the response, with TLS 1.2 and no CDN? Count the TCP handshake, TLS, and the request.",
      options: [
        { id: "one", label: "One" },
        { id: "two", label: "Two" },
        { id: "four", label: "Four" },
        { id: "eight", label: "Eight" },
      ],
      answer: "four",
      observe: "fixed-one",
      reveal: {
        text: "TCP handshake: one. TLS 1.2: two. The request and its first byte: one. Four round trips to the origin, plus a DNS lookup, before the first byte arrives. At 110ms each that is over 400ms of waiting.",
        derived: true,
        line: { speaker: "meera", line: "Every optimisation from here removes a trip or shortens one." },
      },
    },
  ],
  widget: { id: "journey-lab", config: JOURNEY },
  mechanism: [
    {
      id: "walk",
      text: "A cold request does five things in order: look up the name, open a TCP connection, run the TLS handshake, send the request, and wait for the first byte. Only the last has anything to do with your code.",
      sourceIds: ["hpbn"],
    },
    {
      id: "dns",
      scene: "dns",
      text: "Caching removes steps. A cached DNS answer skips the lookup. A kept-alive connection skips the TCP and TLS handshakes. TLS 1.3 shortens the handshake by a round trip. Each of these is free once set up correctly.",
    },
    {
      id: "edge",
      scene: "cache",
      text: "The biggest lever is distance. Serve from an edge a few milliseconds away and every round trip in the list gets cheap, including the ones you could not remove. A cacheable response never reaches the origin at all.",
    },
    {
      id: "measure",
      text: "Time to first byte, measured from real users, is the sum of this whole chain. Look at its parts before tuning code: if the handshakes are most of it, no server change will move the number.",
      sourceIds: ["webdev-ttfb"],
    },
  ],
  challenges: [
    {
      id: "frankfurt",
      title: "Shave Frankfurt's first byte",
      brief: "Frankfurt users are far from the origin. Their first byte is 500 ms. Combine DNS caching, TLS 1.3, connection reuse, and an edge cache to get it under 150 ms with at most one trip to the origin.",
      line: { speaker: "kabir", line: "I will take any combination, as long as I can explain it to finance." },
      widget: { id: "journey-lab", config: JOURNEY },
      conditions: [
        { metric: "ttfbMs", op: "<", value: 150, label: "First byte under 150 ms" },
        { metric: "originTrips", op: "<=", value: 1, label: "At most one trip to the origin" },
      ],
      stars: [{ metric: "ttfbMs", op: "<=", value: 60, label: "First byte within 60 ms" }],
      hints: [
        "List the round trips and the one lookup before the first byte. Which ones are expensive because they cross the ocean?",
        "Which steps disappear when the connection is already open?",
        "What would make every remaining round trip short?",
      ],
    },
  ],
  explainBack: {
    prompt: "Walk through everything that happens between a user tapping a link and the first byte arriving, and name three ways to shorten it.",
    rubric: [
      { id: "steps", criterion: "Lists DNS, TCP handshake, TLS handshake, request, and server time in order", keyIdea: "the chain" },
      { id: "trips", criterion: "Notes that round trips to a distant server dominate, not server processing time", keyIdea: "round trips dominate" },
      { id: "fixes", criterion: "Names fixes such as caching DNS, connection reuse, TLS 1.3 or HTTP/3, and serving from a nearby edge", keyIdea: "remove or shorten trips" },
    ],
    exemplar:
      "The browser looks up the name, opens a TCP connection, runs a TLS handshake, sends the request, and waits for the first byte. For a distant server the handshakes and the request are each a long round trip, so they dominate the 20 ms your code takes. I would cache DNS, reuse connections or use HTTP/3, move to TLS 1.3, and serve cacheable content from an edge near the user.",
  },
  reviews: [
    {
      id: "rj-est",
      format: "estimate",
      scenario: "A user is 110 ms round trip from the origin, with DNS cached. They use TCP with TLS 1.2 on a new connection, and server work is 20 ms. How long to the first byte?",
      unit: "ms",
      answer: 460,
      acceptFactor: 1.15,
      breakdown: ["TCP: 110 ms", "TLS 1.2: 220 ms", "Request and response: 110 ms", "Server: 20 ms", "= 460 ms"],
      explain: "Four round trips plus the server's 20 ms. The server's share of the total is under 5%.",
    },
    {
      id: "rj-pick",
      format: "pick-fix",
      scenario: "RUM shows first byte at 480 ms for far-away users and the server's own time is 25 ms. Which change helps most?",
      options: [
        { id: "a", label: "Rewrite the view in a faster language" },
        { id: "b", label: "Serve through a nearby edge with keep-alive and TLS 1.3" },
        { id: "c", label: "Add more database indexes" },
        { id: "d", label: "Increase the worker count" },
      ],
      answer: "b",
      explain: "The time is in round trips, not in the server. Moving the first hop close to the user shortens every one of them.",
    },
    {
      id: "rj-order",
      format: "order",
      scenario: "Order these steps of a cold request as they happen.",
      items: [
        { id: "tls", label: "TLS handshake" },
        { id: "dns", label: "DNS lookup" },
        { id: "req", label: "HTTP request and response" },
        { id: "tcp", label: "TCP handshake" },
      ],
      answer: ["dns", "tcp", "tls", "req"],
      explain: "Name, connection, encryption, then the request. Each layer needs the one below.",
    },
    {
      id: "rj-flaw",
      format: "spot-flaw",
      scenario: "First byte is slow for far-away users on every first visit. The origin is fast. Tap the choice that adds the most avoidable round trips.",
      diagram: {
        nodes: [
          { id: "user", label: "user · 150 ms away", kind: "client", col: 0, row: 1 },
          { id: "origin", label: "origin · TLS 1.2, no keep-alive, no CDN", kind: "server", col: 1, row: 1 },
        ],
        edges: [{ from: "user", to: "origin" }],
      },
      answer: "user->origin",
      explain: "A long path with the oldest handshake, a fresh connection each time, and no nearby cache makes every round trip expensive and keeps all four of them.",
    },
    {
      id: "rj-est-edge",
      format: "estimate",
      scenario: "The same user now hits an edge 10 ms away that has the response cached, with TLS 1.3, DNS uncached at 40 ms, and 20 ms of edge work. How long to the first byte?",
      unit: "ms",
      answer: 90,
      acceptFactor: 1.15,
      breakdown: ["DNS: 40 ms", "TCP: 10 ms", "TLS 1.3: 10 ms", "Request: 10 ms", "Edge work: 20 ms", "= 90 ms"],
      explain: "From 460 to about 90 milliseconds without touching the application at all.",
    },
    {
      id: "rj-explain",
      format: "explain",
      scenario: "In two sentences: why does optimising application code often barely move time to first byte for distant users?",
      rubric: [
        { id: "trips", criterion: "Handshakes and the request itself are several long round trips" },
        { id: "small", criterion: "Server processing is a small share of the total" },
      ],
      exemplar: "For distant users the DNS lookup, TCP and TLS handshakes, and the request are each a long round trip. The server's own processing is a small share of the total.",
      explain: "Distance sets the floor, and code only sits on top of it.",
    },
  ],
  codex: {
    oneLiner: "A cold request is DNS, TCP, TLS, then the request. Cache, reuse, upgrade, and move closer, because round trips dominate.",
    keyNumbers: [
      { label: "Round trips before the first byte (TCP + TLS 1.2)", value: "4, plus a DNS lookup", sourceId: "hpbn" },
      { label: "TTFB guidance", value: "measured from real users", sourceId: "webdev-ttfb" },
    ],
    tradeoffs: [
      { choice: "Edge in front", gain: "Short round trips and cached responses", cost: "Cache invalidation and a new layer to run" },
      { choice: "Newer protocols (TLS 1.3, HTTP/3)", gain: "Fewer round trips for free", cost: "Compatibility and monitoring" },
    ],
    seenIn: ["Chrome DevTools network waterfalls and the timing breakdown.", "RUM tools reporting TTFB by region."],
    interviewAngle: "When a design has global users, walk the chain aloud: 'DNS, TCP, TLS, request, with an edge near the user and connections reused.' It shows you know where the time goes.",
    aws: [{ concept: "Edge in front of the origin", service: "Amazon CloudFront", note: "TLS termination and caching near the user" }],
    replay: { id: "journey-lab", config: JOURNEY, scene: "cache" },
  },
  interview: [
    "What happens when you type a URL and press enter?",
    "A page is slow for users in another continent. What do you check first?",
    "Which parts of a request's journey can you cache?",
  ],
  deeper: [
    {
      title: "What the chain leaves out",
      body: "The walk above stops at the first byte. A real page then downloads more files, runs scripts, and renders, and each of those adds its own trips. The same approach applies: list the steps, mark which ones cross the long distance, and remove or shorten those first.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Every step is counted in round trips plus 20 ms of server time and a 40 ms DNS lookup. Real journeys also include redirects, certificate checks, and rendering.",
    "Distances come from the origin in ap-south-2 at 8 ms plus 0.015 ms per km of round-trip time.",
  ],
  sources: [HPBN, WEBDEV_TTFB],
  verify: [
    { id: "base", claim: "A cold request from Frankfurt takes about 500 ms to first byte", run: "lab", params: { model: "journey-lab", config: JOURNEY, values: {}, metric: "ttfbMs" }, expect: { min: 480, max: 520 } },
    { id: "trips", claim: "It makes four round trips", run: "lab", params: { model: "journey-lab", config: JOURNEY, values: { tls13: false }, metric: "roundTrips" }, expect: { min: 4, max: 4 } },
    { id: "edge-only", claim: "An edge alone gets under 150 ms with no origin trips", run: "lab", params: { model: "journey-lab", config: JOURNEY, values: { edge: true }, metric: "ttfbMs" }, expect: { max: 150 } },
    { id: "reuse-combo", claim: "DNS cache, TLS 1.3 and reuse get under 150 ms", run: "lab", params: { model: "journey-lab", config: JOURNEY, values: { dnsCached: true, tls13: true, reuse: true }, metric: "ttfbMs" }, expect: { max: 150 } },
    { id: "reuse-alone", claim: "Reuse alone is not enough", run: "lab", params: { model: "journey-lab", config: JOURNEY, values: { reuse: true }, metric: "ttfbMs" }, expect: { min: 150 } },
  ],
});
