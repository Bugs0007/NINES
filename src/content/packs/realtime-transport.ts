import { definePack } from "../define";

export const RT = { lockClients: true, clients: 200000, start: { transport: "sse", pollS: 5 } };
export const RT_CHALLENGE = { lockClients: true, clients: 200000 };

const RFC6202 = { id: "rfc6202", title: "RFC 6202: Known Issues and Best Practices for the Use of Long Polling and Streaming in Bidirectional HTTP", url: "https://www.rfc-editor.org/rfc/rfc6202" };
const RFC6455 = { id: "rfc6455", title: "RFC 6455: The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455" };
const MDN_SSE = { id: "mdn-sse", title: "MDN: Using server-sent events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events" };

export default definePack({
  id: "realtime-transport",
  title: "Polling, Long-polling, SSE, WebSockets",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "scores-api · 200,000 requests a second", detail: "almost all return 'no change'" },
    lines: [
      { speaker: "kabir", line: "The live scores page polls every second so that it feels instant. Two hundred thousand viewers means two hundred thousand requests a second for 'nothing new'." },
      { speaker: "meera", line: "The client is asking the same question over and over. Let the server answer when there is something to say." },
    ],
  },
  predictions: [
    {
      id: "flood",
      kind: "choice",
      prompt: "200,000 clients poll every second. Each client receives about 2 events a minute. About how many requests a second hit the server, and what share return nothing?",
      options: [
        { id: "small", label: "20,000, and a third return nothing" },
        { id: "mid", label: "200,000, and about 97% return nothing" },
        { id: "big", label: "2 million, and half return nothing" },
      ],
      answer: "mid",
      observe: "poll-flood",
      reveal: {
        text: "One request per client per second is 200,000 a second, and with only 2 events a minute, 58 of every 60 polls find nothing: 97% wasted. Polling less often saves the server and makes the page late; the cost sits on one side or the other.",
        derived: true,
        line: { speaker: "meera", line: "Polling spends the server's effort on the question, not the answer." },
      },
    },
    {
      id: "memory",
      kind: "choice",
      prompt: "You switch to WebSockets so events arrive in about 40 ms. Each open connection holds around 40 KB on the server. What does that cost for 200,000 clients?",
      options: [
        { id: "small", label: "About 80 MB" },
        { id: "mid", label: "About 800 MB" },
        { id: "gb", label: "About 8 GB" },
        { id: "big", label: "About 80 GB" },
      ],
      answer: "gb",
      observe: "mem-heavy",
      reveal: {
        text: "200,000 connections × 40 KB is 8 GB held open before any message is sent, and the server needs to be sized and load balanced for that many long-lived connections. Push removes the request flood and replaces it with a memory bill.",
        derived: true,
        line: { speaker: "rao", line: "Everything saves something and spends something. Check what you are spending." },
      },
    },
  ],
  widget: { id: "transport-lab", config: RT },
  mechanism: [
    {
      id: "polling",
      scene: "polling",
      text: "Polling is the client asking on a timer. It is plain HTTP, works everywhere and needs no special servers. The interval trades freshness against load: the average delay is half the interval, and every poll that finds nothing is wasted work for the server and the network.",
      sourceIds: ["rfc6202"],
    },
    {
      id: "longpoll",
      scene: "longpoll",
      text: "Long polling lets the server hold the request open until it has something to send, or a timeout, and the client immediately asks again. Events arrive at once, over ordinary HTTP. It needs a connection held for each client, and a reconnect for each event, so it costs more per event than a socket.",
      sourceIds: ["rfc6202"],
    },
    {
      id: "sse",
      text: "Server-sent events keep one HTTP response open and stream events down it. They are one-way, from server to client, reconnect automatically and pass through ordinary proxies. They suit feeds, scores and notifications where the client mostly listens.",
      sourceIds: ["mdn-sse"],
    },
    {
      id: "ws",
      scene: "sockets",
      text: "A WebSocket upgrades an HTTP connection into a two-way channel, so either side can send at any time with little overhead. It fits chat, games and collaboration. It is the heaviest to run: long-lived connections to balance, scale and drain on deploys, and some proxies interfere.",
      sourceIds: ["rfc6455"],
    },
  ],
  challenges: [
    {
      id: "live-scores",
      title: "Pick the transport for live scores",
      brief: "200,000 clients, mostly listening. Choose a transport and poll interval so events arrive within a second on average, the server takes at most 20,000 requests a second, held connections use at most 6 GB, and at most 20% of polls find nothing.",
      line: { speaker: "kabir", line: "Fans want the goal the instant it happens. Operations wants a server that stays up." },
      widget: { id: "transport-lab", config: RT_CHALLENGE },
      conditions: [
        { metric: "avgDelayMs", op: "<=", value: 1000, label: "Average delay at most 1 s" },
        { metric: "reqPerSec", op: "<=", value: 20000, label: "At most 20,000 requests a second" },
        { metric: "memGB", op: "<=", value: 6, label: "At most 6 GB of connections" },
        { metric: "wastedPct", op: "<=", value: 0.2, label: "At most 20% of polls empty" },
      ],
      stars: [{ metric: "reqPerSec", op: "<=", value: 1000, label: "At most 1,000 requests a second" }],
      hints: [
        "Polling cannot be both fresh and cheap. Why?",
        "Which push transports use the least memory per client?",
        "What does the client send to the server in a scoreboard?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare polling, long polling, server-sent events and WebSockets for a live scoreboard and for a chat.",
    rubric: [
      { id: "polling", criterion: "Polling is simple but trades freshness for load, with most requests returning nothing", keyIdea: "polling wastes" },
      { id: "push", criterion: "Long polling and SSE push events as they happen, SSE one-way over one open connection", keyIdea: "server push" },
      { id: "ws", criterion: "WebSockets give a two-way channel for chat, at the cost of long-lived connection memory and operations", keyIdea: "WebSocket for two-way" },
    ],
    exemplar:
      "Polling is simple and works everywhere, but a short interval floods the server with requests that mostly return nothing and a long one makes the page late. Long polling and server-sent events let the server push an event the moment it exists, with SSE using one open one-way connection that fits a scoreboard. WebSockets give a two-way channel that fits chat, but each long-lived connection costs memory and must be scaled and drained carefully.",
  },
  reviews: [
    {
      id: "rt-est",
      format: "estimate",
      scenario: "100,000 clients poll every 5 seconds. About how many requests a second does the server receive?",
      unit: "req/s",
      answer: 20000,
      acceptFactor: 1.05,
      breakdown: ["100,000 ÷ 5", "= 20,000 per second"],
      explain: "Requests a second equal clients divided by the interval, whether or not anything has changed.",
    },
    {
      id: "rt-pick",
      format: "pick-fix",
      scenario: "A notification bell must show new items within a second for 1 million users, who only receive. Which transport is the best fit?",
      options: [
        { id: "a", label: "Server-sent events" },
        { id: "b", label: "Polling every 100 ms" },
        { id: "c", label: "WebSockets for two-way messaging" },
        { id: "d", label: "Email" },
      ],
      answer: "a",
      explain: "One-way, low-latency push is exactly what SSE offers, cheaply and over plain HTTP. Polling at 100 ms would be 10 million requests a second.",
    },
    {
      id: "rt-order",
      format: "order",
      scenario: "Order these by average delay before an event reaches the client, longest first.",
      items: [
        { id: "poll10", label: "Polling every 10 seconds" },
        { id: "poll1", label: "Polling every second" },
        { id: "sse", label: "Server-sent events" },
      ],
      answer: ["poll10", "poll1", "sse"],
      explain: "Polling delay averages half the interval: 5 s, 0.5 s. A push arrives after only the network delay.",
    },
    {
      id: "rt-graph",
      format: "predict-graph",
      scenario: "As you lengthen the polling interval from 1 to 60 seconds, how do the server's requests a second and the average delay for an event change?",
      xLabel: "polling interval →",
      yLabel: "requests a second (falling), delay (rising)",
      options: [
        { id: "opposite", label: "Requests fall as 1 ÷ interval while the delay rises in proportion", points: [200000, 100000, 40000, 20000, 10000, 5000, 3300, 3300] },
        { id: "same", label: "Both fall", points: [200000, 100000, 40000, 20000, 10000, 5000, 3300, 1000] },
        { id: "flat", label: "Neither changes", points: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000] },
      ],
      answer: "opposite",
      explain: "Polling cannot get both: halving the load doubles the delay.",
    },
    {
      id: "rt-flaw",
      format: "spot-flaw",
      scenario: "A chat app uses server-sent events for incoming messages and for sending them, by opening a new SSE connection per message. Sending is slow and breaks on mobile networks. Tap the part that is misused.",
      diagram: {
        nodes: [
          { id: "client", label: "client", kind: "client", col: 0, row: 1 },
          { id: "sse", label: "SSE connection per outgoing message", kind: "lb", col: 1, row: 1 },
          { id: "server", label: "server", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "sse" },
          { from: "sse", to: "server" },
        ],
      },
      answer: "client->sse",
      explain: "SSE is one-way, server to client. For sending, use ordinary requests, or use a WebSocket for a true two-way channel.",
    },
    {
      id: "rt-explain",
      format: "explain",
      scenario: "In two sentences: why can long-lived connections make deployments harder?",
      rubric: [
        { id: "drain", criterion: "Restarting a server drops all its open connections, so clients must reconnect, often all at once" },
        { id: "balance", criterion: "Connections stay on one server for their lifetime, so load balancing and draining need care" },
      ],
      exemplar: "Restarting a server drops every connection it holds, and the clients all reconnect at once, which can overload the others. Connections also stay on one server for as long as they live, so balancing and draining them takes care.",
      explain: "Stateful connections turn deploys into events.",
    },
  ],
  codex: {
    oneLiner: "Polling is simple but wasteful or late. Long-polling and SSE push over HTTP. WebSockets add two-way at the cost of heavier connections.",
    keyNumbers: [
      { label: "Requests a second for polling", value: "clients ÷ interval", sourceId: "rfc6202" },
      { label: "Average polling delay", value: "half the interval", sourceId: "rfc6202" },
    ],
    tradeoffs: [
      { choice: "Polling", gain: "Simplest; works everywhere", cost: "Waste or delay" },
      { choice: "Server-sent events", gain: "Cheap one-way push over HTTP", cost: "One-way; connections held" },
      { choice: "WebSockets", gain: "Two-way, low overhead", cost: "Heaviest to run; proxy quirks" },
    ],
    seenIn: ["Live scores and notification feeds (SSE).", "Chat and collaborative editors (WebSockets)."],
    interviewAngle: "Say: 'SSE or long polling for one-way updates, WebSockets for two-way, and a reconnect strategy with jitter for deploys'.",
    aws: [{ concept: "WebSocket APIs and managed connections", service: "API Gateway WebSocket, AppSync subscriptions" }],
    replay: { id: "transport-lab", config: RT, scene: "longpoll" },
  },
  interview: [
    "When would you use WebSockets instead of SSE?",
    "What is long polling?",
    "How do you scale a WebSocket service to a million connections?",
  ],
  deeper: [
    {
      title: "Reconnect storms",
      body: "When a server with 100,000 connections restarts, all of its clients reconnect within seconds, and the load balancer sends them to the remaining servers, which may then fail in turn. The remedy is the same as for retries: reconnect with exponential backoff and random jitter, and drain servers slowly during deploys.",
      sourceIds: ["rfc6202"],
    },
  ],
  honestPhysics: [
    "Clients each receive about 2 events a minute. Polling: requests a second are clients ÷ interval, delay is half the interval, and a poll finds something only if an event arrived within the interval.",
    "Long-polling, SSE and WebSockets hold a connection per client: 20, 25 and 40 KB. Reconnects add one request per client every 30 seconds-ish for long-polling (or per event), per 5 minutes for SSE and per 10 minutes for WebSockets. Push delay is 40 to 50 ms.",
    "These are round figures to compare transports.",
  ],
  sources: [RFC6202, RFC6455, MDN_SSE],
  verify: [
    { id: "poll1", claim: "Polling every second makes 200,000 requests a second", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "polling", pollS: 1 }, metric: "reqPerSec" }, expect: { min: 200000, max: 200000 } },
    { id: "poll1-waste", claim: "…and 97% of polls find nothing", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "polling", pollS: 1 }, metric: "wastedPct" }, expect: { min: 0.96 } },
    { id: "poll10", claim: "Polling every 10 seconds is cheap and 5 seconds late", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "polling", pollS: 10 }, metric: "avgDelayMs" }, expect: { min: 5000 } },
    { id: "ws", claim: "WebSockets hold 8 GB for 200,000 clients", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "ws" }, metric: "memGB" }, expect: { min: 8, max: 8 } },
    { id: "sse", claim: "SSE holds 5 GB and makes under 1,000 requests a second", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "sse" }, metric: "reqPerSec" }, expect: { max: 1000 } },
    { id: "sse-mem", claim: "…within the 6 GB limit", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "sse" }, metric: "memGB" }, expect: { max: 6 } },
    { id: "longpoll", claim: "Long polling meets the limits at 4 GB", run: "lab", params: { model: "transport-lab", config: RT_CHALLENGE, values: { transport: "longpoll" }, metric: "memGB" }, expect: { max: 6 } },
  ],
});
