import { definePack } from "../define";

export const TTFT = { promptTokens: 2000, outputTokens: 300, start: { model: "big", stream: false, cached: false } };
export const TTFT_CHALLENGE = { lockTokens: true, promptTokens: 50000, outputTokens: 300, start: { model: "big", stream: false, cached: false } };

const ANTHROPIC_LAT = { id: "anthropic-reduce-latency", title: "Anthropic docs: Reduce latency (model choice, output length, streaming, prompt caching)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-latency" };
const ANTHROPIC_STREAM = { id: "anthropic-streaming", title: "Anthropic docs: Streaming Messages (server-sent events, token deltas)", url: "https://docs.anthropic.com/en/api/messages-streaming" };
const SPLITWISE = { id: "splitwise-2023", title: "P. Patel et al. (2023), Splitwise: Efficient Generative LLM Inference Using Phase Splitting (prefill is compute-bound, decode is memory-bound)", url: "https://arxiv.org/abs/2311.18677" };
const CACHING = { id: "anthropic-prompt-caching", title: "Anthropic docs: Prompt caching (cache a stable prompt prefix; lower cost and latency)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };

export default definePack({
  id: "ttft-throughput",
  title: "Time to First Token & Throughput",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "Copilot · document Q&A", detail: "users stare at a blank screen for 10 seconds, then the answer appears" },
    lines: [
      { speaker: "kabir", line: "Document Q&A takes ten seconds to show anything, and then the whole answer lands at once. Is that the model being slow?" },
      { speaker: "meera", line: "Two different delays: reading your enormous prompt, then writing the answer one token at a time. They have different fixes." },
    ],
  },
  predictions: [
    {
      id: "prefill",
      kind: "choice",
      prompt: "A large model reads 50,000 prompt tokens at about 5,000 tokens a second before it can write the first one. How long is the wait before the first token appears?",
      options: [
        { id: "instant", label: "Under a second" },
        { id: "three", label: "About 3 seconds" },
        { id: "ten", label: "About 10 seconds" },
        { id: "minute", label: "About a minute" },
      ],
      answer: "ten",
      observe: "ttft-moved",
      reveal: {
        text: "50,000 tokens at 5,000 a second is 10 seconds of prefill, plus a little network time. The model has to read the whole prompt before it can start the answer, however short the answer will be.",
        derived: true,
        line: { speaker: "meera", line: "Long prompts have a fixed entry fee, paid before the first word." },
      },
    },
  ],
  widget: { id: "ttft-lab", config: TTFT },
  mechanism: [
    {
      id: "phases",
      scene: "prefill",
      text: "Generation has two phases. Prefill processes the whole prompt in parallel and builds the model's internal state; its time grows with prompt length and sets the time to first token. Decode then writes one token at a time, each needing a pass over the model's weights, so output length sets the rest.",
      sourceIds: ["splitwise-2023"],
    },
    {
      id: "decode",
      scene: "decode",
      text: "Decode speed is the throughput a single user sees, in tokens per second, and it is much slower than prefill because each token depends on the one before. A 1,500-token answer at 50 tokens a second takes 30 seconds, regardless of how fast the prompt was read.",
      sourceIds: ["splitwise-2023"],
      derived: true,
    },
    {
      id: "stream",
      scene: "stream",
      text: "Streaming sends tokens as they are generated, so a reader starts after the first token and reads while the rest is written. It does not make the model faster, but it cuts the perceived wait from the whole response to roughly the time to first token.",
      sourceIds: ["anthropic-streaming"],
    },
    {
      id: "levers",
      text: "Pick the lever for the phase that hurts. For a slow first token: shorten the prompt, cache the stable prefix, or use a smaller model. For a slow finish: ask for shorter answers, use a faster model, or split the work. Always stream anything a person is watching.",
      sourceIds: ["anthropic-reduce-latency", "anthropic-prompt-caching"],
    },
  ],
  challenges: [
    {
      id: "doc-qa",
      title: "Make the answer start now",
      brief: "Document Q&A sends a 50,000-token prompt and gets a 300-token answer. First token must arrive within 1.5 seconds, and what the reader waits for must be under 2 seconds. Choose the model, prefix caching, and streaming.",
      line: { speaker: "kabir", line: "The documents are the same for every question about that contract. Does that matter?" },
      widget: { id: "ttft-lab", config: TTFT_CHALLENGE },
      conditions: [
        { metric: "ttftMs", op: "<=", value: 1500, label: "First token within 1.5 s" },
        { metric: "perceivedMs", op: "<=", value: 2000, label: "Reader waits under 2 s" },
      ],
      stars: [{ metric: "decodeTokPerSec", op: "<=", value: 60, label: "Still on the large model" }],
      hints: [
        "How much of the delay is reading the prompt, and how much is writing the answer?",
        "The same contract text is sent with every question. What can be reused?",
        "Even with a fast first token, the reader sees nothing until the end unless you do something about it.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain time to first token and output speed, what drives each, and how you would improve the experience of a slow response.",
    rubric: [
      { id: "prefill", criterion: "Time to first token is dominated by prefill, which grows with prompt length", keyIdea: "prefill sets TTFT" },
      { id: "decode", criterion: "Output speed is tokens per second in decode, so total time grows with answer length", keyIdea: "decode speed sets the rest" },
      { id: "fix", criterion: "Improves it by streaming, caching a stable prefix, shortening prompts or answers, or using a smaller model", keyIdea: "stream, cache, shorten" },
    ],
    exemplar:
      "Time to first token is mostly prefill, the model reading the whole prompt, so it grows with prompt length. After that decode produces one token at a time at a speed measured in tokens per second, so the total grows with the length of the answer. I would stream so the reader sees text immediately, cache a stable prompt prefix so repeated context is not re-read, keep prompts and answers short, and use a smaller model where quality allows.",
  },
  reviews: [
    {
      id: "tt-est-prefill",
      format: "estimate",
      scenario: "A model prefills at 5,000 tokens a second. How long does it take to read a 20,000-token prompt?",
      unit: "s",
      answer: 4,
      acceptFactor: 1.2,
      breakdown: ["20,000 ÷ 5,000", "= 4 seconds"],
      explain: "Prefill time grows in proportion to the prompt, so a long document has a long entry fee before any output.",
    },
    {
      id: "tt-est-decode",
      format: "estimate",
      scenario: "A model decodes at 50 tokens a second. About how long does a 1,200-token answer take to finish writing?",
      unit: "s",
      answer: 24,
      acceptFactor: 1.2,
      breakdown: ["1,200 ÷ 50", "= 24 seconds"],
      explain: "Long answers take long even on a fast first token. Streaming makes that tolerable; shorter answers make it faster.",
    },
    {
      id: "tt-pick",
      format: "pick-fix",
      scenario: "A chat feature's answers are fast to start but take 25 seconds to finish, and users complain they cannot tell if it is working. The answers are long because the prompt asks for thoroughness. What helps first?",
      options: [
        { id: "a", label: "Stream the response, and ask for concise answers where long ones add little" },
        { id: "b", label: "Cache the prompt prefix" },
        { id: "c", label: "Reduce the prompt length" },
        { id: "d", label: "Add a loading spinner only" },
      ],
      answer: "a",
      explain: "The delay is in decode, which streaming hides and shorter answers shrink. Caching and shorter prompts fix prefill, which is already fast here.",
    },
    {
      id: "tt-order",
      format: "order",
      scenario: "Order these by time until the reader sees the first token, shortest first, for a 50,000-token prompt.",
      items: [
        { id: "small-cached", label: "Small model, cached prefix" },
        { id: "big-cached", label: "Large model, cached prefix" },
        { id: "small", label: "Small model, no cache" },
        { id: "big", label: "Large model, no cache" },
      ],
      answer: ["small-cached", "big-cached", "small", "big"],
      explain: "Caching removes most of the prefill, and a smaller model prefills faster still. The large uncached model pays the full entry fee.",
    },
    {
      id: "tt-graph",
      format: "predict-graph",
      scenario: "Hold the answer at 300 tokens and grow the prompt from 1,000 to 100,000 tokens. How does time to first token change?",
      xLabel: "prompt tokens →",
      yLabel: "time to first token",
      options: [
        { id: "flat", label: "Flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "linear", label: "Grows in proportion to the prompt", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "log", label: "Grows slowly with the log", points: [1, 1.8, 2.3, 2.7, 3, 3.2, 3.4, 3.5] },
        { id: "hockey", label: "Flat, then shoots up", points: [1, 1, 1, 1.2, 1.5, 2.5, 5, 12] },
      ],
      answer: "linear",
      explain: "Prefill processes every prompt token, so its time grows with prompt length. (Attention adds a little more at very long lengths.)",
    },
    {
      id: "tt-flaw",
      format: "spot-flaw",
      scenario: "A voice assistant waits for the model's full response before starting text-to-speech, so replies feel slow even though the first token arrives in 400 ms. Tap the design choice.",
      diagram: {
        nodes: [
          { id: "user", label: "user", kind: "client", col: 0, row: 1 },
          { id: "llm", label: "model · full response, no streaming", kind: "llm", col: 1, row: 1 },
          { id: "tts", label: "text-to-speech starts after the last token", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "user", to: "llm" },
          { from: "llm", to: "tts" },
        ],
      },
      answer: "llm->tts",
      explain: "Streaming the tokens into the speech engine, a sentence at a time, lets speech start after the first sentence instead of the whole answer.",
    },
    {
      id: "tt-explain",
      format: "explain",
      scenario: "In two sentences: why does caching a prompt prefix reduce time to first token?",
      rubric: [
        { id: "prefill", criterion: "The model must process every prompt token before generating, and that is the main part of the delay" },
        { id: "reuse", criterion: "A cached prefix has already been processed, so only the new part of the prompt needs prefill" },
      ],
      exemplar: "The model processes every prompt token before it can start answering, and that prefill is most of the delay for long prompts. A cached prefix has already been processed, so only the new tokens need work.",
      explain: "Reuse the reading, not just the text.",
    },
  ],
  codex: {
    oneLiner: "Time to first token is prefill, growing with the prompt. Then decode writes tokens one by one at a fixed speed. Stream, cache, and shorten.",
    keyNumbers: [
      { label: "Prefill versus decode", value: "prefill is compute-bound; decode is memory-bound", sourceId: "splitwise-2023" },
      { label: "Streaming", value: "tokens sent as generated via server-sent events", sourceId: "anthropic-streaming" },
      { label: "Prompt caching", value: "reuses a processed prefix", sourceId: "anthropic-prompt-caching" },
    ],
    tradeoffs: [
      { choice: "Stream responses", gain: "Reader sees text immediately", cost: "Clients must handle partial output, and moderation must work on chunks" },
      { choice: "Cache the prefix", gain: "Lower first-token time and cost for repeated context", cost: "The prefix must be stable and exactly reused" },
      { choice: "Smaller model", gain: "Faster prefill and decode", cost: "Lower quality on hard tasks" },
    ],
    seenIn: ["Blank screens followed by a wall of text.", "Streaming APIs in every chat product."],
    interviewAngle: "Separate the two delays: 'prefill drives time to first token, decode drives the rest; I stream, cache the stable prefix, and keep outputs short.'",
    aws: [{ concept: "Streaming inference", service: "Amazon Bedrock ConverseStream / InvokeModelWithResponseStream" }],
    replay: { id: "ttft-lab", config: TTFT, scene: "prefill" },
  },
  interview: [
    "What decides how fast the first token of an LLM response arrives?",
    "Why is generating output slower per token than reading input?",
    "How would you make a long-document question feel fast?",
  ],
  deeper: [
    {
      title: "Why decode is slow",
      body: "Each new token needs the model's weights and the stored state for every earlier token, read out of memory, to produce a single token. That makes decode limited by memory bandwidth rather than arithmetic, so it runs at tens of tokens per second per request even on very fast hardware. Servers batch many requests together to use the hardware well, which trades a little latency per request for throughput.",
      sourceIds: ["splitwise-2023"],
    },
  ],
  honestPhysics: [
    "Prefill speed and decode speed are round figures: 20,000 and 150 tokens a second for a small model, 5,000 and 50 for a large one. Real values depend on the model, hardware, load, and provider.",
    "Time to first token is 80 ms of network and queueing plus prefill. A cached prefix removes 90% of prefill time in the lab.",
    "With streaming, perceived wait is the time to first token plus the time to read the first 15 tokens.",
  ],
  sources: [ANTHROPIC_LAT, ANTHROPIC_STREAM, SPLITWISE, CACHING],
  verify: [
    { id: "base", claim: "A 50,000-token prompt on the large model takes about 10 seconds to first token", run: "lab", params: { model: "ttft-lab", config: TTFT_CHALLENGE, values: {}, metric: "ttftMs" }, expect: { min: 9500, max: 10500 } },
    { id: "cache-only", claim: "Caching alone leaves the reader waiting for the whole answer", run: "lab", params: { model: "ttft-lab", config: TTFT_CHALLENGE, values: { cached: true }, metric: "perceivedMs" }, expect: { min: 2000 } },
    { id: "stream-only", claim: "Streaming alone leaves the first token far too late", run: "lab", params: { model: "ttft-lab", config: TTFT_CHALLENGE, values: { stream: true }, metric: "ttftMs" }, expect: { min: 1500 } },
    { id: "both", claim: "Caching plus streaming meets the time to first token", run: "lab", params: { model: "ttft-lab", config: TTFT_CHALLENGE, values: { cached: true, stream: true }, metric: "ttftMs" }, expect: { max: 1500 } },
    { id: "both-perceived", claim: "…and the reader's wait", run: "lab", params: { model: "ttft-lab", config: TTFT_CHALLENGE, values: { cached: true, stream: true }, metric: "perceivedMs" }, expect: { max: 2000 } },
  ],
});
