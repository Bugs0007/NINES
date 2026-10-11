import { definePack } from "../define";

export const LM = { start: { model: "7", bits: "4", ctx: 8, kv8: false, offload: 0 } };
export const LM_CHALLENGE = { start: { model: "7", bits: "4", ctx: 8, kv8: false, offload: 0 } };

const LLAMACPP = { id: "llamacpp", title: "llama.cpp: LLM inference in C/C++ (GGUF formats, GPU layer offload, KV cache types)", url: "https://github.com/ggml-org/llama.cpp" };
const OLLAMA = { id: "ollama", title: "Ollama: run open models locally (model library and context settings)", url: "https://github.com/ollama/ollama" };
const KV = { id: "kv-cache", title: "Hugging Face: Best practices for generation with cache (the key-value cache grows with context)", url: "https://huggingface.co/docs/transformers/en/kv_cache" };

export default definePack({
  id: "local-models",
  title: "Running Local Models",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "ollama · error: model requires more system memory (8.3 GiB) than is available", detail: "context set to 32,768" },
    lines: [
      { speaker: "kabir", line: "The model file is 3.5 gigabytes and my GPU has six. It loaded fine with the default context and fell over the moment I asked for a long one." },
      { speaker: "meera", line: "The weights are only part of what you hold in memory. Context has a cost that grows with every token you keep." },
    ],
  },
  predictions: [
    {
      id: "oom",
      kind: "choice",
      prompt: "A 7B model at 4 bits (3.5 GB) with an 8,000-token context uses 5.3 GB on a 6 GB GPU. You raise the context to 32,000 tokens with a 16-bit cache. How much GPU memory is needed?",
      options: [
        { id: "55", label: "About 5.5 GB, the cache is small" },
        { id: "83", label: "About 8.3 GB" },
        { id: "14", label: "About 14 GB" },
      ],
      answer: "83",
      observe: "oom",
      reveal: {
        text: "The key-value cache stores keys and values for every token and every layer, about 128 MB per thousand tokens for a 7B model: 4 GB at 32,000 tokens. With the 3.5 GB of weights and 0.8 GB of overhead, that is 8.3 GB. Context is not free; it competes with the weights for the same memory.",
        derived: true,
        line: { speaker: "rao", line: "Long contexts are paid for in cache, not just in tokens." },
      },
    },
    {
      id: "offload",
      kind: "choice",
      prompt: "To fit that long context with a 16-bit cache, you move 70% of the weights to system memory. The GPU reads at 200 GB/s and the CPU path at 40 GB/s. What happens to generation speed, from about 57 tokens a second?",
      options: [
        { id: "same", label: "About the same, the GPU still does the work" },
        { id: "15", label: "Falls to about 15 tokens a second" },
        { id: "1", label: "Falls to about 1 token a second" },
      ],
      answer: "15",
      observe: "offload-slow",
      reveal: {
        text: "Each token reads every weight once, and the 70% in system memory is read five times slower: 2.45 GB at 40 GB/s plus 1.05 GB at 200 GB/s takes 66 ms, or 15 tokens a second. Offloading works, and a quarter of the speed is the price. An 8-bit cache keeps the weights on the GPU instead.",
        derived: true,
        line: { speaker: "meera", line: "The slowest memory your weights live in sets the speed." },
      },
    },
  ],
  widget: { id: "local-lab", config: LM },
  mechanism: [
    {
      id: "memory",
      text: "To run a model on your own machine, everything it needs at once has to fit: the weights, the key-value cache for the conversation so far, and some working memory. Weights are parameters times bits divided by eight. The cache grows with context length and model size. Past GPU memory, the model will not load or will crash.",
      sourceIds: ["llamacpp", "kv-cache"],
    },
    {
      id: "fit",
      scene: "fit",
      text: "Fit by choosing the right model and precision. A 7-billion-parameter model quantized to 4 bits is about 3.5 GB and runs well on a 6 GB card. A 13-billion model at 4 bits does not fit, and a smaller model at higher precision may beat a bigger one at 2 bits. Check quality on your own prompts.",
      sourceIds: ["llamacpp"],
    },
    {
      id: "kv",
      scene: "kvcache",
      text: "Long context is the hidden cost. Keep the context you need, not the largest one allowed. Storing the cache in 8 bits halves its memory with little loss, and some models use fewer key-value heads to shrink it. A larger window that never fills still reserves memory in many runtimes, so set it to the length you use.",
      sourceIds: ["kv-cache", "llamacpp"],
    },
    {
      id: "offload",
      scene: "offload",
      text: "When it still does not fit, you can offload some layers to system memory and run them on the CPU. It works, and it is slow: generation is limited by the slowest memory holding any layer. A small offload helps with a tight fit, while a large one makes the model too slow to use interactively.",
      sourceIds: ["llamacpp"],
    },
  ],
  challenges: [
    {
      id: "fit-6gb",
      title: "Plan the local setup",
      brief: "On a 6 GB GPU, run a model of at least 7 billion parameters with a 32,000-token context, at 20 tokens a second or faster, keeping at least 97% of its quality.",
      line: { speaker: "rao", line: "Long documents on a small card, without waiting minutes for a sentence." },
      widget: { id: "local-lab", config: LM_CHALLENGE },
      conditions: [
        { metric: "fitsGpu", op: ">=", value: 1, label: "Fits in 6 GB" },
        { metric: "modelB", op: ">=", value: 7, label: "At least a 7B model" },
        { metric: "contextK", op: ">=", value: 32, label: "At least 32,000 tokens of context" },
        { metric: "tokensPerSec", op: ">=", value: 20, label: "At least 20 tokens a second" },
        { metric: "quality", op: ">=", value: 0.97, label: "At least 97% of quality retained" },
      ],
      stars: [{ metric: "tokensPerSec", op: ">=", value: 30, label: "At least 30 tokens a second" }],
      hints: ["What does the cache cost at 32,000 tokens?", "What shrinks the cache without moving weights?", "How much offloading is enough?"],
    },
  ],
  explainBack: {
    prompt: "Explain what decides whether a model runs on a given GPU and how to make it fit.",
    rubric: [
      { id: "memory", criterion: "Weights (parameters × bits ÷ 8), the key-value cache that grows with context, and overhead must fit together in GPU memory", keyIdea: "weights plus cache plus overhead" },
      { id: "levers", criterion: "Lower the bits, choose a smaller model, shorten the context or store the cache in 8-bit", keyIdea: "bits, size, context, cache" },
      { id: "offload", criterion: "Offloading layers to the CPU makes it fit but speed is set by the slowest memory, so keep it small", keyIdea: "offload is slow" },
    ],
    exemplar:
      "The weights, the key-value cache that grows with context, and some overhead all have to fit in GPU memory together. To make it fit I would lower the bits, choose a smaller model, shorten the context or store the cache in 8-bit. Offloading some layers to the CPU also works, but speed is set by the slowest memory holding any layer, so I would keep it small.",
  },
  reviews: [
    {
      id: "lm-est",
      format: "estimate",
      scenario: "A 7B model's cache takes about 128 MB per thousand tokens in 16-bit. How much memory does a 32,000-token context need, in GB?",
      unit: "GB",
      answer: 4,
      acceptFactor: 1.05,
      breakdown: ["128 MB × 32 = 4,096 MB", "= 4 GB, as much as the 4-bit weights"],
      explain: "A long context can cost as much memory as the model itself.",
    },
    {
      id: "lm-pick",
      format: "pick-fix",
      scenario: "A 13B model at 4 bits (6.5 GB) will not load on a 6 GB GPU. Which change keeps most quality and speed?",
      options: [
        { id: "a", label: "Use a 7B model at 4 bits, or a 13B at 3 bits with a calibrated method" },
        { id: "b", label: "Offload 90% of the layers to the CPU" },
        { id: "c", label: "Use 2-bit weights" },
        { id: "d", label: "Increase the context length" },
      ],
      answer: "a",
      explain: "Heavy offloading makes it slow, and 2 bits damages quality. A smaller model, or one slightly more compressed, fits and stays usable.",
    },
    {
      id: "lm-order",
      format: "order",
      scenario: "Order these 7B-model setups by generation speed, fastest first.",
      items: [
        { id: "gpu", label: "4-bit, all layers on the GPU" },
        { id: "off30", label: "4-bit, 30% of weights in system memory" },
        { id: "off70", label: "4-bit, 70% of weights in system memory" },
      ],
      answer: ["gpu", "off30", "off70"],
      explain: "57, 26 and 15 tokens a second.",
    },
    {
      id: "lm-graph",
      format: "predict-graph",
      scenario: "For a 7B model, as the context window rises from 1,000 to 128,000 tokens, how does total memory change?",
      xLabel: "context →",
      yLabel: "memory needed",
      options: [
        { id: "linear", label: "Rises in a straight line from the weights plus overhead", points: [4.4, 4.6, 5.0, 5.8, 7.3, 10.3, 16.3, 20.3] },
        { id: "flat", label: "Does not change", points: [4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4] },
        { id: "flat-then", label: "Flat, then a sudden jump", points: [4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 20.3] },
      ],
      answer: "linear",
      explain: "The cache grows linearly with the number of tokens kept, on top of fixed weights and overhead.",
    },
    {
      id: "lm-flaw",
      format: "spot-flaw",
      scenario: "A developer sets the context to the model's maximum of 128,000 tokens 'just in case' for a chatbot whose conversations are 2,000 tokens long. Tap the waste.",
      diagram: {
        nodes: [
          { id: "gpu", label: "6 GB GPU", kind: "worker", col: 0, row: 1 },
          { id: "cache", label: "reserved cache for 128k tokens", kind: "cache", col: 1, row: 1 },
          { id: "conv", label: "2,000-token conversations", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "gpu", to: "cache" },
          { from: "cache", to: "conv" },
        ],
      },
      answer: "gpu->cache",
      explain: "The runtime reserves cache memory for the full window. Set the context to what you use and the memory goes to the weights or a bigger model.",
    },
    {
      id: "lm-explain",
      format: "explain",
      scenario: "In two sentences: why does generation slow down when part of the model is offloaded to system memory?",
      rubric: [
        { id: "read", criterion: "Every token needs every weight read once, so the time is the sum of reading each part from its memory" },
        { id: "slow", criterion: "System memory is several times slower than GPU memory, so the offloaded share dominates the time" },
      ],
      exemplar: "Every token needs every weight read once, so the time per token is the sum of reading each part from the memory it lives in. System memory is several times slower than GPU memory, so even a minority of weights there dominates the time.",
      explain: "The slow path sets the pace.",
    },
  ],
  codex: {
    oneLiner: "Weights + key-value cache + overhead must fit in GPU memory. Choose bits and model size, set context to what you use, and offload sparingly.",
    keyNumbers: [
      { label: "7B at 4 bits (lab)", value: "3.5 GB weights", sourceId: "llamacpp" },
      { label: "7B cache at 32,000 tokens, 16-bit (lab)", value: "4 GB", sourceId: "kv-cache" },
    ],
    tradeoffs: [
      { choice: "Longer context", gain: "More in view", cost: "Cache memory that scales linearly" },
      { choice: "8-bit cache", gain: "Halves cache memory", cost: "A small quality cost" },
      { choice: "CPU offload", gain: "Lets a bigger model load", cost: "Speed set by system memory" },
    ],
    seenIn: ["Ollama and llama.cpp setups on laptops and desktops.", "LM Studio and similar desktop runners."],
    interviewAngle: "Say: 'memory is weights plus cache plus overhead; shrink bits, model or context; offload last because it sets the speed'.",
    aws: [{ concept: "Self-hosted inference sizing", service: "EC2 GPU instances; SageMaker real-time inference" }],
    replay: { id: "local-lab", config: LM, scene: "kvcache" },
  },
  interview: [
    "How would you decide whether a model fits on a GPU?",
    "Why does a long context use so much memory?",
    "What are the trade-offs of offloading layers to the CPU?",
  ],
  deeper: [
    {
      title: "Why run locally at all",
      body: "Reasons include privacy (data never leaves the machine), cost at high volume, offline use, and control over versions. Reasons against include quality (small local models trail the largest hosted ones), operations (you own the updates and the failures) and speed on modest hardware. Many teams use both: local for sensitive or high-volume simple work, hosted for hard problems.",
      sourceIds: ["ollama"],
    },
  ],
  honestPhysics: [
    "A GPU with 6 GB and about 200 GB/s of bandwidth, and system memory at about 40 GB/s. Memory is the weights (parameters × bits ÷ 8), the key-value cache (about 128 MB per thousand tokens for a 7B model in 16-bit, 56 for 3B, 200 for 13B, 240 for 34B; half with an 8-bit cache) and 0.8 GB of overhead.",
    "Layers offloaded to system memory are read five times slower. Speed is the reciprocal of the time to read the weights once. Quality uses calibrated quantization: for a 7B model, 99.8% at 8 bits, 98.2% at 4, 94% at 3 and 78% at 2. Round figures.",
  ],
  sources: [LLAMACPP, OLLAMA, KV],
  verify: [
    { id: "default", claim: "A 7B model at 4 bits with 8,000 tokens of context needs 5.3 GB", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: {}, metric: "vramNeeded" }, expect: { min: 5.2, max: 5.4 } },
    { id: "oom", claim: "At 32,000 tokens with a 16-bit cache it needs 8.3 GB", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { ctx: 32, kv8: false }, metric: "vramNeeded" }, expect: { min: 8.2, max: 8.4 } },
    { id: "oom-fits", claim: "…which does not fit in 6 GB", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { ctx: 32, kv8: false }, metric: "fitsGpu" }, expect: { max: 0 } },
    { id: "offload-speed", claim: "Offloading 70% of weights lets it fit at 15 tokens a second", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { ctx: 32, kv8: false, offload: 0.7 }, metric: "tokensPerSec" }, expect: { min: 14, max: 16 } },
    { id: "kv8", claim: "An 8-bit cache and 20% offload fit at 32 tokens a second", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { ctx: 32, kv8: true, offload: 0.2 }, metric: "tokensPerSec" }, expect: { min: 31, max: 33 } },
    { id: "kv8-fit", claim: "…in 5.6 GB", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { ctx: 32, kv8: true, offload: 0.2 }, metric: "fitsGpu" }, expect: { min: 1 } },
    { id: "13b", claim: "A 13B model at 4 bits cannot meet the target on this card", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: { model: "13", bits: "4", ctx: 32, kv8: true, offload: 0.45 }, metric: "fitsGpu" }, expect: { max: 0 } },
    { id: "quality", claim: "4-bit weights keep 98% of quality", run: "lab", params: { model: "local-lab", config: LM_CHALLENGE, values: {}, metric: "quality" }, expect: { min: 0.975, max: 0.99 } },
  ],
});
