import { definePack } from "../define";

export const ST = { start: { stream: true, tokens: 800, transport: "sse", buffering: false, cancel: false } };
export const ST_CHALLENGE = { start: { stream: false, tokens: 800, transport: "poll", buffering: true, cancel: false } };

const ANTHROPIC_STREAM = { id: "anthropic-streaming", title: "Claude docs: Streaming Messages (server-sent events)", url: "https://docs.anthropic.com/en/api/messages-streaming" };
const MDN_SSE = { id: "mdn-sse", title: "MDN: Using server-sent events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events" };
const NGINX = { id: "nginx-buffering", title: "nginx docs: proxy_buffering (response buffering in a reverse proxy)", url: "https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering" };

export default definePack({
  id: "streaming",
  title: "Streaming Responses",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "feedback · 'the assistant hangs for ten seconds'", detail: "median answer 14 s, no output until done" },
    lines: [
      { speaker: "kabir", line: "The answers are good, but users stare at a spinner for fourteen seconds and assume it crashed. The model is not slow; we just show nothing until it finishes." },
      { speaker: "meera", line: "A long answer arrives as a stream of tokens. Showing them as they come turns fourteen seconds of waiting into reading." },
    ],
  },
  predictions: [
    {
      id: "wait",
      kind: "choice",
      prompt: "An answer is 800 tokens. The model takes 0.8 s to the first token, then writes 60 tokens a second. Without streaming, when does the user first see any text?",
      options: [
        { id: "1", label: "About 1 second" },
        { id: "7", label: "About 7 seconds" },
        { id: "14", label: "About 14 seconds" },
      ],
      answer: "14",
      observe: "long-wait",
      reveal: {
        text: "0.8 + 800 ÷ 60 is 14.1 seconds. Streaming does not make the answer finish sooner; it makes the first words appear after 0.8 seconds and lets the user read while the rest is written. What people feel is time to first token.",
        derived: true,
        line: { speaker: "meera", line: "Total time is the same. Waiting for nothing and reading while you wait feel very different." },
      },
    },
    {
      id: "buffer",
      kind: "choice",
      prompt: "You turn on streaming, but a reverse proxy buffers responses until it has 4 KB (about 1,000 tokens). For an 800-token answer, when does the user see the first text?",
      options: [
        { id: "08", label: "After 0.8 s, buffering is invisible" },
        { id: "5", label: "After about 5 seconds" },
        { id: "14", label: "After about 14 seconds, as if there were no streaming" },
      ],
      answer: "14",
      observe: "buffered",
      reveal: {
        text: "The proxy holds everything until 4 KB arrives or the response ends. This answer is shorter than the buffer, so the whole thing arrives at 14.1 seconds. Streaming that works on a laptop and not in production is nearly always a buffering proxy or CDN in between.",
        derived: true,
        line: { speaker: "rao", line: "Test streaming through the real path, not just localhost." },
      },
    },
  ],
  widget: { id: "stream-lab", config: ST },
  mechanism: [
    {
      id: "why",
      scene: "stream",
      text: "A model produces tokens one after another. Streaming sends each piece as it is generated instead of waiting for the end. The total time is unchanged, but the first text appears in under a second, so the interface feels responsive, and the user can start reading or stop an answer that is going the wrong way.",
      sourceIds: ["anthropic-streaming"],
    },
    {
      id: "transport",
      text: "Server-sent events are the usual transport: one HTTP response held open, text lines pushed from the server, with automatic reconnection in browsers. WebSockets also work and are worth their extra machinery when the client sends a lot too. Polling every second adds half a second of delay and a request per second per user.",
      sourceIds: ["mdn-sse", "anthropic-streaming"],
    },
    {
      id: "proxy",
      scene: "buffer",
      text: "Everything between the model and the user must pass the stream along. A reverse proxy, a CDN or a serverless platform that buffers responses will hold the text back and defeat streaming. Disable response buffering on that route, send the header that asks for it, and flush after each chunk.",
      sourceIds: ["nginx-buffering"],
    },
    {
      id: "cancel",
      scene: "cancel",
      text: "A stream is a connection held open for the length of the answer, so many users means many open connections: arrival rate times duration. When a user leaves or presses stop, cancel the generation upstream. Otherwise the model keeps writing for nobody and you pay for tokens that nobody reads.",
      sourceIds: ["anthropic-streaming"],
    },
  ],
  challenges: [
    {
      id: "stream-it",
      title: "Set up the stream",
      brief: "Show the first text within 1.2 seconds, use one request per answer, and waste at most 1% of generated tokens on abandoned answers. The proxy currently buffers.",
      line: { speaker: "rao", line: "Fast to first word, one connection, and no tokens for nobody." },
      widget: { id: "stream-lab", config: ST_CHALLENGE },
      conditions: [
        { metric: "firstVisibleSec", op: "<=", value: 1.2, label: "First text within 1.2 s" },
        { metric: "requestsPerAnswer", op: "<=", value: 1, label: "One request per answer" },
        { metric: "wastedTokens", op: "<=", value: 0.01, label: "At most 1% of tokens wasted" },
      ],
      stars: [],
      hints: ["What does streaming change?", "What is holding the text back?", "What happens when users leave?"],
    },
  ],
  explainBack: {
    prompt: "Explain why streaming improves a chat experience and what can defeat it.",
    rubric: [
      { id: "ttft", criterion: "The first tokens appear after the time to first token instead of after the whole answer, so it feels responsive even though total time is the same", keyIdea: "time to first token" },
      { id: "transport", criterion: "Use server-sent events or similar; polling adds delay and requests", keyIdea: "server-sent events" },
      { id: "defeat", criterion: "Buffering proxies and CDNs hold the text back; cancel generation when the user leaves", keyIdea: "buffering and cancellation" },
    ],
    exemplar:
      "Streaming sends tokens as they are generated, so the user sees text after the time to first token rather than after the whole answer, and the experience feels responsive even though the total time is the same. I would use server-sent events rather than polling. A buffering proxy or CDN can silently defeat it, so I would test through the real path, and I would cancel generation when the user leaves so tokens are not spent for nobody.",
  },
  reviews: [
    {
      id: "st-est",
      format: "estimate",
      scenario: "An answer is 1,200 tokens, the model writes 60 tokens a second and starts after 0.8 s. When is the answer complete, in seconds?",
      unit: "seconds",
      answer: 20.8,
      acceptFactor: 1.05,
      breakdown: ["1,200 ÷ 60 = 20 seconds of writing", "+ 0.8 = 20.8 seconds"],
      explain: "Long answers are long. Streaming makes the wait readable, not shorter.",
    },
    {
      id: "st-pick",
      format: "pick-fix",
      scenario: "Streaming works locally, but in production the whole answer appears at once. What should you check first?",
      options: [
        { id: "a", label: "Whether a proxy, CDN or platform in the path buffers the response" },
        { id: "b", label: "Whether the model is larger in production" },
        { id: "c", label: "Whether the answer is cached" },
        { id: "d", label: "Whether the font loads" },
      ],
      answer: "a",
      explain: "Local development has no proxy. Production usually does, and its default is to buffer responses.",
    },
    {
      id: "st-order",
      format: "order",
      scenario: "Order these by the time the user first sees text for an 800-token answer, longest first.",
      items: [
        { id: "off", label: "No streaming" },
        { id: "poll", label: "Streaming over one-second polling" },
        { id: "sse", label: "Streaming over server-sent events" },
      ],
      answer: ["off", "poll", "sse"],
      explain: "14.1 s, 1.3 s and 0.8 s.",
    },
    {
      id: "st-graph",
      format: "predict-graph",
      scenario: "As answers get longer (100 to 2,000 tokens), how does the time to first visible text change with and without streaming? Pick the pair that is true for the non-streaming case.",
      xLabel: "answer length →",
      yLabel: "time to first text",
      options: [
        { id: "linear", label: "Without streaming it grows with length", points: [2.5, 4, 6, 8, 11, 15, 20, 34] },
        { id: "flat", label: "Without streaming it stays level", points: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] },
        { id: "fall", label: "Without streaming it falls", points: [34, 20, 15, 11, 8, 6, 4, 2.5] },
      ],
      answer: "linear",
      explain: "The whole answer must be written first. With streaming the line is flat at the time to first token.",
    },
    {
      id: "st-flaw",
      format: "spot-flaw",
      scenario: "A chat service streams from the model to the server but the user closes the tab at second 3 of a 14-second answer. Tap the waste.",
      diagram: {
        nodes: [
          { id: "user", label: "browser (tab closed)", kind: "client", col: 0, row: 1 },
          { id: "app", label: "app server", kind: "server", col: 1, row: 1 },
          { id: "llm", label: "model keeps generating", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "user", to: "app" },
          { from: "app", to: "llm" },
        ],
      },
      answer: "app->llm",
      explain: "The server never cancels the upstream request when the client disconnects, so the remaining 11 seconds of tokens are generated and billed for nobody.",
    },
    {
      id: "st-explain",
      format: "explain",
      scenario: "In two sentences: why does streaming not reduce total latency but still improve the experience?",
      rubric: [
        { id: "total", criterion: "The model still has to generate every token, so the time to the last token is unchanged" },
        { id: "perceived", criterion: "The user starts reading after the first token, so waiting is replaced by progress" },
      ],
      exemplar: "The model still has to generate every token, so the time to the last token is unchanged. But the user starts reading after the first token, so waiting is replaced by visible progress.",
      explain: "Time to first token is the number people feel.",
    },
  ],
  codex: {
    oneLiner: "Send tokens as they are generated so the first text appears in under a second. Mind buffering proxies, and cancel upstream when users leave.",
    keyNumbers: [
      { label: "800-token answer without streaming (lab)", value: "14.1 s to first text", sourceId: "anthropic-streaming" },
      { label: "Same with streaming (lab)", value: "0.8 s", sourceId: "anthropic-streaming" },
    ],
    tradeoffs: [
      { choice: "Streaming", gain: "Fast first text; stop early", cost: "Long-lived connections; harder error handling mid-answer" },
      { choice: "Polling", gain: "Works anywhere", cost: "Half a second of delay and a request a second" },
      { choice: "Cancelling on disconnect", gain: "No tokens wasted", cost: "Needs the cancel signal wired through" },
    ],
    seenIn: ["Every chat assistant.", "Server-sent events from model SDKs."],
    interviewAngle: "Say: 'stream with server-sent events, check every proxy for buffering, cancel upstream on disconnect, and plan for errors halfway through'.",
    aws: [{ concept: "Streaming responses", service: "Bedrock InvokeModelWithResponseStream; API Gateway response streaming" }],
    replay: { id: "stream-lab", config: ST, scene: "buffer" },
  },
  interview: [
    "Why stream LLM responses?",
    "How do you stream through a load balancer or CDN?",
    "What happens if a stream fails halfway?",
  ],
  deeper: [
    {
      title: "Errors halfway through",
      body: "A stream that fails after 400 tokens has already shown the user part of an answer. Decide what to do: retry from scratch with a clear marker, continue from the received text, or show what exists and let the user ask again. Also send periodic keep-alive comments so idle proxies do not close a slow connection.",
      sourceIds: ["mdn-sse"],
    },
  ],
  honestPhysics: [
    "A model takes 0.8 s to the first token, then writes 60 tokens a second. Without streaming the user sees nothing until the whole answer is done.",
    "Polling once a second adds half a second to the first text and one request per second. A buffering proxy holds output until about 1,000 tokens or the end. 30% of users leave early; cancelling wastes about 2% of an answer, not cancelling about half. Connections open at 200 answers a second are the rate times the duration.",
  ],
  sources: [ANTHROPIC_STREAM, MDN_SSE, NGINX],
  verify: [
    { id: "no-stream", claim: "An 800-token answer shows nothing for 14.1 seconds without streaming", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: false }, metric: "firstVisibleSec" }, expect: { min: 14, max: 14.2 } },
    { id: "stream", claim: "With streaming the first text appears at 0.8 seconds", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: true, buffering: false, transport: "sse" }, metric: "firstVisibleSec" }, expect: { min: 0.79, max: 0.81 } },
    { id: "buffer", claim: "A buffering proxy brings it back to 14.1 seconds", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: true, buffering: true, transport: "sse" }, metric: "firstVisibleSec" }, expect: { min: 14, max: 14.2 } },
    { id: "poll", claim: "Polling needs about 16 requests for one answer", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: true, buffering: false, transport: "poll" }, metric: "requestsPerAnswer" }, expect: { min: 15, max: 17 } },
    { id: "waste", claim: "Without cancelling, 15% of tokens are generated for nobody", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: true, buffering: false, transport: "sse", cancel: false }, metric: "wastedTokens" }, expect: { min: 0.14, max: 0.16 } },
    { id: "cancel", claim: "Cancelling cuts that below 1%", run: "lab", params: { model: "stream-lab", config: ST_CHALLENGE, values: { stream: true, buffering: false, transport: "sse", cancel: true }, metric: "wastedTokens" }, expect: { max: 0.01 } },
  ],
});
