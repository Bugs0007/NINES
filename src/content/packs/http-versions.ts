import { definePack } from "../define";

export const LANES = { start: { proto: "h1", objects: 60, rtt: 80, loss: 0 } };
export const LANES_LOSSY = { start: { proto: "h1", objects: 60, rtt: 80, loss: 0.03 }, readonly: ["loss", "rtt", "objects"] };

const RFC9113 = { id: "rfc9113", title: "RFC 9113: HTTP/2 (streams, multiplexing, head-of-line blocking at the TCP layer)", url: "https://www.rfc-editor.org/rfc/rfc9113" };
const RFC9114 = { id: "rfc9114", title: "RFC 9114: HTTP/3", url: "https://www.rfc-editor.org/rfc/rfc9114" };
const HPBN = { id: "hpbn", title: "I. Grigorik, High Performance Browser Networking (HTTP/1.x, HTTP/2, and TCP head-of-line blocking)", url: "https://hpbn.co/" };

export default definePack({
  id: "http-versions",
  title: "HTTP/1.1 vs 2 vs 3",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "info", title: "Real-user monitoring · page load", detail: "mobile p75 is twice desktop p75" },
    lines: [
      { speaker: "kabir", line: "HTTP/2 made desktop faster and mobile on bad networks slower. How is a newer protocol slower?" },
      { speaker: "meera", line: "HTTP/2 puts everything on one connection. If that connection stalls, everything stalls together." },
    ],
  },
  predictions: [
    {
      id: "lossy",
      kind: "choice",
      prompt: "A page has 60 objects and the network drops about 3% of packets. Which protocol loads the page fastest: HTTP/1.1 with six connections, HTTP/2 on one, or HTTP/3?",
      options: [
        { id: "h1", label: "HTTP/1.1, six independent connections" },
        { id: "h2", label: "HTTP/2, one multiplexed connection" },
        { id: "h3", label: "HTTP/3, multiplexed with per-stream recovery" },
        { id: "same", label: "They are about the same" },
      ],
      answer: "h3",
      observe: "loss-hurts",
      reveal: {
        text: "With 3% loss, HTTP/2 stalls every stream on its single TCP connection at each loss, and falls behind even HTTP/1.1. HTTP/3 over QUIC recovers lost packets per stream, so the rest of the page keeps moving.",
        derived: true,
        line: { speaker: "meera", line: "Multiplexing is only a win if one stall can't stop the lanes." },
      },
    },
  ],
  widget: { id: "lane-lab", config: LANES },
  mechanism: [
    {
      id: "h1",
      scene: "h1",
      text: "HTTP/1.1 sends one request at a time on a connection, so browsers open about six per host. A page of sixty objects needs ten rounds of requests on those six lanes, and each round costs a round trip.",
      sourceIds: ["hpbn"],
      derived: true,
    },
    {
      id: "h2",
      scene: "h2",
      text: "HTTP/2 multiplexes many streams over one connection, so all sixty requests go out at once. The catch is TCP: it delivers bytes in order, so one lost packet holds back every stream behind it until the retransmission arrives.",
      sourceIds: ["rfc9113"],
    },
    {
      id: "h3",
      scene: "h3",
      text: "HTTP/3 runs the same streams over QUIC, which tracks loss per stream. A lost packet pauses only the stream it belonged to, and the handshake needs one round trip instead of the two or three of TCP with TLS.",
      sourceIds: ["rfc9114"],
    },
    {
      id: "choose",
      text: "On a clean, fast network HTTP/2 and HTTP/3 are close, and both beat HTTP/1.1. The gap opens on lossy, high-latency links, which is exactly where mobile users live. Measure your real users before and after, not just the lab.",
    },
  ],
  challenges: [
    {
      id: "lossy-mobile",
      title: "Fix the mobile page",
      brief: "Mobile users see 3% packet loss at 80 ms round trip, loading a 60-object page. Choose the protocol that gets the page load under 1.5 seconds.",
      line: { speaker: "kabir", line: "Same page, same servers. Only the protocol is allowed to change." },
      widget: { id: "lane-lab", config: LANES_LOSSY },
      conditions: [{ metric: "loadMs", op: "<", value: 1500, label: "Page load under 1.5 s" }],
      stars: [{ metric: "stallMs", op: "<", value: 200, label: "Less than 200 ms lost to retransmissions" }],
      hints: [
        "Compare all three protocols at this loss rate before choosing.",
        "Which protocols share one TCP connection, and what happens to every stream when it loses a packet?",
        "Which protocol keeps multiplexing but recovers loss one stream at a time?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare HTTP/1.1, HTTP/2, and HTTP/3 for a page with many small objects, and say when HTTP/2 can be worse than HTTP/1.1.",
    rubric: [
      { id: "h1", criterion: "HTTP/1.1 handles one request at a time per connection, so pages use several connections and many request rounds", keyIdea: "one request per lane" },
      { id: "mux", criterion: "HTTP/2 and 3 multiplex streams on one connection, removing request rounds", keyIdea: "multiplexing" },
      { id: "hol", criterion: "On TCP a lost packet blocks all streams (head-of-line blocking), so HTTP/2 can lose on lossy links; HTTP/3's per-stream recovery avoids that", keyIdea: "TCP head-of-line blocking" },
    ],
    exemplar:
      "HTTP/1.1 sends one request at a time per connection, so a page uses six connections and many rounds of requests. HTTP/2 multiplexes everything over one connection, which removes the rounds but means one lost TCP packet stalls every stream. HTTP/3 keeps multiplexing but recovers loss per stream over QUIC, so on lossy links HTTP/2 can be slower than HTTP/1.1 while HTTP/3 stays fast.",
  },
  reviews: [
    {
      id: "hv-est-waves",
      format: "estimate",
      scenario: "A browser fetches 60 objects over HTTP/1.1 using 6 connections, one request at a time on each. How many request rounds does it need?",
      unit: "rounds",
      answer: 10,
      acceptFactor: 1.1,
      breakdown: ["60 objects ÷ 6 connections", "= 10 rounds"],
      explain: "Each round costs about one round trip, so at 80 ms that is 800 ms of just waiting for requests.",
    },
    {
      id: "hv-pick",
      format: "pick-fix",
      scenario: "An old trick, domain sharding (spreading assets across several hostnames) sped up HTTP/1.1 pages. What happens to it under HTTP/2?",
      options: [
        { id: "a", label: "It keeps helping; more hostnames mean more connections" },
        { id: "b", label: "It usually hurts: extra hostnames mean extra connection setups and split prioritisation" },
        { id: "c", label: "It is required for HTTP/2 to work" },
        { id: "d", label: "It has no effect at all" },
      ],
      answer: "b",
      explain: "HTTP/2 wants one connection per origin and multiplexes inside it. Sharding adds DNS lookups and handshakes and spreads the streams over connections that cannot be prioritised together.",
    },
    {
      id: "hv-order",
      format: "order",
      scenario: "At 3% packet loss on a 60-object page, order the protocols by page load time, fastest first.",
      items: [
        { id: "h1", label: "HTTP/1.1, six connections" },
        { id: "h2", label: "HTTP/2, one TCP connection" },
        { id: "h3", label: "HTTP/3, QUIC" },
      ],
      answer: ["h3", "h1", "h2"],
      explain: "HTTP/3 keeps the multiplexing win and avoids the shared stall. HTTP/1.1's six connections spread the damage, so on a lossy link HTTP/2 can finish last.",
    },
    {
      id: "hv-graph",
      format: "predict-graph",
      scenario: "Raise packet loss from 0% to 5% on a multiplexed HTTP/2 page. How does page load time change?",
      xLabel: "packet loss →",
      yLabel: "page load",
      options: [
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "linear", label: "Rises steadily", points: [1, 1.8, 2.7, 3.6, 4.5, 5.4, 6.3, 7.2] },
        { id: "cliff", label: "Flat, then one cliff", points: [1, 1, 1, 1, 1, 6, 6, 6] },
        { id: "falls", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "linear",
      explain: "Every lost packet stalls the whole connection for about a round trip, and the number of losses grows with the loss rate, so the stall time grows steadily with it.",
    },
    {
      id: "hv-flaw",
      format: "spot-flaw",
      scenario: "A team shards images across img1, img2, img3, and img4.pigeon.chat 'for HTTP/2 performance'. Tap the part of the design that works against HTTP/2.",
      diagram: {
        nodes: [
          { id: "browser", label: "browser (HTTP/2)", kind: "client", col: 0, row: 1 },
          { id: "shards", label: "4 image hostnames → 4 connections", kind: "external", col: 1, row: 1 },
          { id: "cdn", label: "CDN", kind: "cache", col: 2, row: 1 },
        ],
        edges: [
          { from: "browser", to: "shards" },
          { from: "shards", to: "cdn" },
        ],
      },
      answer: "shards",
      explain: "Four hostnames mean four DNS lookups, four handshakes, and four congestion windows starting from scratch. HTTP/2 does better with one connection and many streams.",
    },
    {
      id: "hv-explain",
      format: "explain",
      scenario: "In two sentences: what is head-of-line blocking in HTTP/2 over TCP, and how does HTTP/3 avoid it?",
      rubric: [
        { id: "hol", criterion: "TCP delivers bytes in order, so one lost packet holds up all streams on the connection" },
        { id: "quic", criterion: "QUIC recovers loss per stream so other streams keep flowing" },
      ],
      exemplar: "TCP delivers bytes in order, so a lost packet makes every HTTP/2 stream on that connection wait for the retransmission. QUIC tracks each stream separately, so only the stream that lost a packet pauses.",
      explain: "The multiplexing was never the problem; the single ordered pipe underneath was.",
    },
  ],
  codex: {
    oneLiner: "HTTP/1.1 uses many connections and many request rounds. HTTP/2 multiplexes on one TCP connection. HTTP/3 multiplexes over QUIC with per-stream recovery.",
    keyNumbers: [
      { label: "HTTP/1.1 parallelism", value: "about 6 connections per host in browsers", sourceId: "hpbn" },
      { label: "HTTP/2 transport", value: "one TCP connection, many streams", sourceId: "rfc9113" },
      { label: "HTTP/3 transport", value: "QUIC over UDP", sourceId: "rfc9114" },
    ],
    tradeoffs: [
      { choice: "HTTP/2", gain: "No request rounds, header compression, one connection", cost: "Head-of-line blocking at the TCP layer on lossy links" },
      { choice: "HTTP/3", gain: "Per-stream loss recovery, fewer handshake round trips", cost: "UDP may be blocked, more CPU, newer tooling" },
      { choice: "Fewer, bigger objects", gain: "Fewer requests under any version", cost: "Worse caching granularity" },
    ],
    seenIn: ["Browsers negotiating h2 via ALPN, and discovering h3 through Alt-Svc.", "CDNs enabling HTTP/3 with a single toggle."],
    interviewAngle: "Give one reason each version exists: 'HTTP/2 removes request rounds, HTTP/3 removes TCP's head-of-line blocking.' Then say you would measure real users on lossy networks.",
    aws: [{ concept: "HTTP/2 and HTTP/3 to clients", service: "Amazon CloudFront", note: "Both can be enabled on a distribution" }, { concept: "HTTP/2 at the balancer", service: "Application Load Balancer" }],
    replay: { id: "lane-lab", config: LANES, scene: "h2" },
  },
  interview: [
    "Why was HTTP/2 introduced, and what problem does it not solve?",
    "What does HTTP/3 change at the transport layer?",
    "Is domain sharding still a good idea?",
  ],
  deeper: [
    {
      title: "Why six connections?",
      body: "Browsers settled on about six connections per host as a compromise: more parallelism than one, without flooding servers and the network with connections that each start slow. HTTP/2 replaced that compromise with real multiplexing on a single connection, which is also kinder to congestion control.",
      sourceIds: ["hpbn"],
    },
  ],
  honestPhysics: [
    "Objects are equal in size and bandwidth is shared evenly. Real pages mix a few heavy objects with many tiny ones.",
    "The stall model charges about one round trip per lost packet, spread over the streams that were waiting. Real loss comes in bursts and congestion control reacts to it.",
    "HTTP/3 deployment adds CPU cost on servers and sometimes falls back to HTTP/2 when UDP is blocked.",
  ],
  sources: [RFC9113, RFC9114, HPBN],
  verify: [
    { id: "h1", claim: "On a lossy link HTTP/1.1 loads in over 1.5 s", run: "lab", params: { model: "lane-lab", config: LANES_LOSSY, values: { proto: "h1" }, metric: "loadMs" }, expect: { min: 1500 } },
    { id: "h2", claim: "HTTP/2 is slower than HTTP/1.1 at 3% loss", run: "lab", params: { model: "lane-lab", config: LANES_LOSSY, values: { proto: "h2" }, metric: "loadMs" }, expect: { min: 3000 } },
    { id: "h3", claim: "HTTP/3 loads in under 1.5 s", run: "lab", params: { model: "lane-lab", config: LANES_LOSSY, values: { proto: "h3" }, metric: "loadMs" }, expect: { max: 1500 } },
    { id: "clean", claim: "On a clean link HTTP/2 beats HTTP/1.1", run: "lab", params: { model: "lane-lab", config: LANES, values: { proto: "h2", loss: 0 }, metric: "loadMs" }, expect: { max: 1500 } },
  ],
});
