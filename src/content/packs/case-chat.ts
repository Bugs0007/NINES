import { defineBoss } from "../define";

export const CHC = {};

const WEBSOCKET = { id: "rfc6455", title: "RFC 6455: The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455" };
const C10K = { id: "c10k", title: "Dan Kegel: The C10K problem", url: "http://www.kegel.com/c10k.html" };
const WHATSAPP = { id: "whatsapp-erlang", title: "WhatsApp: Scaling to millions of simultaneous connections (Rick Reed, Erlang Factory 2012)", url: "https://www.youtube.com/watch?v=c12cYAUTXXs" };

export default defineBoss({
  id: "case-chat",
  title: "Case: Chat (WhatsApp)",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "graph-spike",
    alert: { severity: "info", title: "interview · 'Design WhatsApp'", detail: "100 million users online, messages must arrive once, in order" },
    lines: [{ speaker: "kabir", line: "A hundred million people online at once, messages that must arrive exactly once, and a green dot next to every contact. Where do you start?" }],
  },
  intro: [
    { speaker: "meera", line: "Connections, delivery guarantees, storage and presence are four different problems that happen to live in one app." },
    { speaker: "rao", line: "The surprise is usually the green dot, not the messages." },
  ],
  forecast: {
    metric: "serversNeeded",
    prompt: "If every client polls every 5 seconds and one server answers 20,000 requests a second, how many servers does 100 million online users need?",
    unit: "servers",
    scale: 1,
    min: 10,
    max: 100000,
    tolerance: 1.5,
  },
  exercises: ["realtime-transport", "fan-out-pubsub", "sharding-strategies", "delivery-semantics"],
  challenge: {
    id: "design-chat",
    title: "Design the chat service",
    brief: "Use at most 2,000 connection servers, keep delivery p99 at or under 300 ms, lose at most 0.001% of messages, deliver at most 0.01% twice, keep presence traffic at 100,000 events a second or less, and store the history in a sharded database.",
    line: { speaker: "meera", line: "Hold the connections, acknowledge the messages, and don't tell everyone about everything." },
    widget: { id: "chat-lab", config: CHC },
    conditions: [
      { metric: "serversNeeded", op: "<=", value: 2000, label: "At most 2,000 connection servers" },
      { metric: "deliveryP99Ms", op: "<=", value: 300, label: "Delivery p99 at most 300 ms" },
      { metric: "lostShare", op: "<=", value: 0.00001, label: "At most 0.001% lost" },
      { metric: "duplicateShare", op: "<=", value: 0.0001, label: "At most 0.01% delivered twice" },
      { metric: "presenceEventsPerSec", op: "<=", value: 100000, label: "Presence under 100,000 events a second" },
      { metric: "storeHolds", op: ">=", value: 1, label: "History sharded across databases" },
    ],
    stars: [{ metric: "serversNeeded", op: "<=", value: 500, label: "At most 500 connection servers" }],
    hints: ["What does polling cost at this scale?", "How do you get exactly-once from at-least-once?", "Who needs to know a contact's status, and when?"],
  },
  debrief: [
    { id: "conn", text: "Polling every five seconds is 20 million requests a second to answer 'anything new?': a thousand servers and a 5-second p99. Persistent WebSocket connections push messages when they arrive, 80 ms, and a connection costs about 20 KB, so a server holds hundreds of thousands.", sourceIds: ["rfc6455", "c10k", "whatsapp-erlang"] },
    { id: "delivery", text: "At-most-once loses 0.5% of messages. At-least-once with acknowledgements loses none and delivers 0.2% twice; a message ID lets the receiver ignore the repeat, leaving 0.001%.", derived: true },
    { id: "presence", text: "Pushing every status change to each of 200 contacts is 926,000 events a second for green dots. Fetching presence only for the chats on screen is 20,000. Sharding messages by chat keeps a conversation's history and ordering on one shard.", derived: true },
  ],
  outro: { speaker: "kabir", line: "WebSockets, acknowledgements with dedup, presence on demand, sharded by chat. Under four hundred connection servers." },
  explainBack: {
    prompt: "Explain how your chat service keeps connections, delivers messages once, and handles presence.",
    rubric: [
      { id: "conn", criterion: "Persistent connections (WebSocket) hold users cheaply and push messages immediately, replacing a polling fleet", keyIdea: "persistent connections" },
      { id: "delivery", criterion: "At-least-once delivery with acknowledgements plus deduplication by message ID gives effectively-once", keyIdea: "ack and dedup" },
      { id: "presence", criterion: "Presence is fetched for visible chats instead of pushed to every contact, cutting an event storm", keyIdea: "presence on demand" },
      { id: "store", criterion: "Shard message storage by chat to keep conversations together and spread load", keyIdea: "shard by chat" },
    ],
    exemplar:
      "Clients hold persistent WebSocket connections so messages are pushed immediately, with each server holding a couple of hundred thousand connections, about four hundred servers instead of a thousand-server polling fleet. Delivery is at least once with acknowledgements and a message ID so the receiver drops repeats, giving effectively once. Presence is fetched for the chats on screen instead of pushed to every contact, avoiding hundreds of thousands of events a second, and messages are sharded by chat so a conversation stays together.",
  },
  honestPhysics: [
    "100 million users online. Polling every 5 seconds is 20 million requests a second at 20,000 a second per server: 1,000 servers, p99 5 seconds. A persistent connection costs about 20 KB; p99 is 80 ms plus 0.8 ms per thousand connections on a server.",
    "At-most-once loses 0.5%; at-least-once duplicates 0.2%; with a dedup key 0.001%. Pushing presence to 200 contacts each is 926,000 events a second; fetching on demand is 20,000. One database cannot hold the history. Round figures.",
  ],
  sources: [WEBSOCKET, C10K, WHATSAPP],
  verify: [
    { id: "forecast", claim: "A polling fleet needs 1,000 servers", run: "lab", params: { model: "chat-lab", config: CHC, values: {}, metric: "serversNeeded" }, expect: { min: 1000, max: 1000 } },
    { id: "ws", claim: "WebSockets at 255,000 connections a server need 393 servers", run: "lab", params: { model: "chat-lab", config: CHC, values: { transport: "ws", connsK: 255 }, metric: "serversNeeded" }, expect: { min: 392, max: 394 } },
    { id: "p99", claim: "…with a p99 of 284 ms", run: "lab", params: { model: "chat-lab", config: CHC, values: { transport: "ws", connsK: 255 }, metric: "deliveryP99Ms" }, expect: { min: 283, max: 285 } },
    { id: "dense", claim: "500,000 connections a server push the p99 past 300 ms", run: "lab", params: { model: "chat-lab", config: CHC, values: { transport: "ws", connsK: 500 }, metric: "deliveryP99Ms" }, expect: { min: 300 } },
    { id: "dedupe", claim: "A dedup key leaves 0.001% duplicates", run: "lab", params: { model: "chat-lab", config: CHC, values: { delivery: "dedupe" }, metric: "duplicateShare" }, expect: { min: 0.000009, max: 0.000011 } },
    { id: "presence", claim: "Pushing presence is 926,000 events a second", run: "lab", params: { model: "chat-lab", config: CHC, values: { presence: "push" }, metric: "presenceEventsPerSec" }, expect: { min: 926000, max: 926000 } },
    { id: "single", claim: "A single database cannot hold the history", run: "lab", params: { model: "chat-lab", config: CHC, values: { store: "single" }, metric: "storeHolds" }, expect: { max: 0 } },
  ],
});
