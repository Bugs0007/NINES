import { definePack } from "../define";

export const QN = { start: { params: "7", bits: "16", method: "rtn", hw: "laptop" } };
export const QN_CHALLENGE = { start: { params: "7", bits: "16", method: "rtn", hw: "laptop" } };

const GPTQ = { id: "gptq", title: "Frantar et al. (2022), GPTQ: accurate post-training quantization for generative pre-trained transformers", url: "https://arxiv.org/abs/2210.17323" };
const AWQ = { id: "awq", title: "Lin et al. (2023), AWQ: activation-aware weight quantization for LLM compression and acceleration", url: "https://arxiv.org/abs/2306.00978" };
const LLAMACPP = { id: "llamacpp", title: "llama.cpp: LLM inference in C/C++ (GGUF quantization formats)", url: "https://github.com/ggml-org/llama.cpp" };

export default definePack({
  id: "quantization",
  title: "Quantization",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "info", title: "download · 13B-instruct-fp16 · 26 GB", detail: "target machine: laptop, 6 GB GPU" },
    lines: [
      { speaker: "kabir", line: "The thirteen-billion model is twenty-six gigabytes at full precision. Our laptops have six gigabytes of GPU memory." },
      { speaker: "meera", line: "A weight does not need sixteen bits to be useful. Store fewer, and find out how much you lose." },
    ],
  },
  predictions: [
    {
      id: "fit",
      kind: "choice",
      prompt: "A 13-billion-parameter model on a laptop GPU with 6 GB, keeping 1 GB for the cache and overhead. At which weight width does it first fit?",
      options: [
        { id: "8", label: "8 bits, 13 GB" },
        { id: "4", label: "4 bits, 6.5 GB" },
        { id: "3", label: "3 bits, 4.9 GB" },
      ],
      answer: "3",
      observe: "fits-laptop",
      reveal: {
        text: "Size is parameters × bits ÷ 8: 13 GB at 8 bits, 6.5 at 4 (over the 5 GB left), 4.9 at 3 bits, which fits. With calibration, 3 bits keeps 95% of the quality. A 7B model at 4 bits is smaller, 3.5 GB, and loses less. The best fit is a quality question, not only a size one.",
        derived: true,
        line: { speaker: "rao", line: "Size is arithmetic. Quality is what you are buying with the arithmetic." },
      },
    },
    {
      id: "two",
      kind: "choice",
      prompt: "You push a 7B model to 2 bits per weight with simple round-to-nearest. How much of its quality is left?",
      options: [
        { id: "95", label: "About 95%" },
        { id: "80", label: "About 80%" },
        { id: "55", label: "About 55%, it is barely usable" },
      ],
      answer: "55",
      observe: "collapse",
      reveal: {
        text: "Four levels per weight is too few to represent the distribution, and rounding errors accumulate through 32 layers. In the lab, plain rounding at 2 bits retains 55%; calibrated methods that pick how to round using sample data retain 78%. 8 bits is nearly free and 4 bits costs a few points; below 4 the damage grows quickly.",
        derived: true,
        line: { speaker: "meera", line: "Each bit you remove is cheaper than the last, until it is not." },
      },
    },
  ],
  widget: { id: "quant-lab", config: QN },
  mechanism: [
    {
      id: "what",
      text: "Quantization stores each weight in fewer bits: 8, 4 or lower instead of 16. Model size is parameters times bits divided by 8, so halving the bits halves the memory. Weights are stored in groups with a scale, and converted back to higher precision during the computation. It is usually applied after training, without more training.",
      sourceIds: ["gptq", "llamacpp"],
    },
    {
      id: "speed",
      text: "Smaller is also faster. Generating a token reads every weight once, so on a typical GPU the limit is memory bandwidth, and speed is bandwidth divided by model size. A model a quarter the size can be about four times as quick on the same card, until another limit takes over. Quantization often improves speed and cost together.",
      sourceIds: ["llamacpp"],
    },
    {
      id: "quality",
      scene: "four",
      text: "Quality falls as bits shrink. Eight bits is nearly lossless, 4-bit is usually acceptable, 3-bit starts to hurt and 2-bit often breaks the model. Larger models tolerate fewer bits better than small ones. Always measure on your own task, because averages hide failures in reasoning, code and rare languages.",
      sourceIds: ["gptq", "awq"],
    },
    {
      id: "calibrated",
      scene: "calibrated",
      text: "Method matters. Rounding to the nearest value treats every weight alike. Calibrated methods such as GPTQ and AWQ run sample data through the model to find which weights matter most and round to protect them, which lowers the loss at the same size. Common file formats bundle these choices, so check which one you are downloading.",
      sourceIds: ["gptq", "awq", "llamacpp"],
    },
  ],
  challenges: [
    {
      id: "fit-laptop",
      title: "Choose the quantization",
      brief: "On a 6 GB laptop GPU, run a model of at least 13 billion parameters at 20 tokens a second or faster, keeping at least 94% of its quality.",
      line: { speaker: "rao", line: "The biggest model that fits, and still feels like itself." },
      widget: { id: "quant-lab", config: QN_CHALLENGE },
      conditions: [
        { metric: "fits", op: ">=", value: 1, label: "Fits on the laptop GPU" },
        { metric: "paramsB", op: ">=", value: 13, label: "At least 13 billion parameters" },
        { metric: "quality", op: ">=", value: 0.94, label: "At least 94% of quality retained" },
        { metric: "tokensPerSec", op: ">=", value: 20, label: "At least 20 tokens a second" },
      ],
      stars: [],
      hints: ["What size must the weights be to fit?", "Which method loses least at low bit widths?", "How much quality does a larger model give back?"],
    },
  ],
  explainBack: {
    prompt: "Explain quantization and its trade-offs.",
    rubric: [
      { id: "size", criterion: "Fewer bits per weight shrinks memory in proportion (parameters × bits ÷ 8) and, being memory-bound, also speeds up generation", keyIdea: "smaller and faster" },
      { id: "quality", criterion: "Quality falls with fewer bits: 8-bit nearly free, 4-bit usually fine, 3-bit and lower costly; larger models tolerate it better", keyIdea: "quality falls with bits" },
      { id: "method", criterion: "Calibrated methods (GPTQ, AWQ) lose less than plain rounding; measure on your own task", keyIdea: "method and measurement" },
    ],
    exemplar:
      "Quantization stores each weight in fewer bits, so memory shrinks in proportion to parameters times bits over eight, and because generation is memory-bound it also gets faster. Quality falls as bits drop: 8-bit is nearly free, 4-bit is usually fine, and 3-bit or lower costs more, though larger models tolerate it better. Calibrated methods like GPTQ and AWQ lose less than plain rounding, and I would always measure on my own task.",
  },
  reviews: [
    {
      id: "qn-est",
      format: "estimate",
      scenario: "A 70-billion-parameter model is stored at 4 bits per weight. How many gigabytes are the weights?",
      unit: "GB",
      answer: 35,
      acceptFactor: 1.05,
      breakdown: ["70 × 4 ÷ 8 = 35 GB", "against 140 GB at 16 bits"],
      explain: "Bits divided by eight gives bytes per parameter. Four bits is half a byte.",
    },
    {
      id: "qn-pick",
      format: "pick-fix",
      scenario: "A 7B model at 2 bits fits your phone, but its answers are poor. What is the most sensible next step?",
      options: [
        { id: "a", label: "Try 4 bits with a calibrated method, or a smaller model at higher precision" },
        { id: "b", label: "Quantize the model to 1 bit" },
        { id: "c", label: "Lower the temperature" },
        { id: "d", label: "Add a longer prompt" },
      ],
      answer: "a",
      explain: "Two bits is below where the model degrades gracefully. More bits on a smaller model often beats fewer bits on a larger one.",
    },
    {
      id: "qn-order",
      format: "order",
      scenario: "Order these by quality retained for a 7B model with plain rounding, highest first.",
      items: [
        { id: "b8", label: "8 bits" },
        { id: "b4", label: "4 bits" },
        { id: "b3", label: "3 bits" },
        { id: "b2", label: "2 bits" },
      ],
      answer: ["b8", "b4", "b3", "b2"],
      explain: "99.7%, 95.5%, 85% and 55%.",
    },
    {
      id: "qn-graph",
      format: "predict-graph",
      scenario: "As bits per weight fall from 16 to 2, how does quality retained change?",
      xLabel: "bits per weight falls →",
      yLabel: "quality retained",
      options: [
        { id: "knee", label: "Nearly flat, then falls steeply at low bit widths", points: [100, 99.8, 99.5, 98, 95, 85, 70, 55] },
        { id: "linear", label: "Falls in a straight line", points: [100, 89, 78, 67, 56, 45, 34, 23] },
        { id: "flat", label: "Does not change", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "knee",
      explain: "The weights carry redundancy, so the first bits are nearly free. Below about 4 bits there is no slack left.",
    },
    {
      id: "qn-flaw",
      format: "spot-flaw",
      scenario: "A team benchmarks a 4-bit model on a general knowledge test, sees a 1-point drop and ships it for a code-review tool. Tap the gap.",
      diagram: {
        nodes: [
          { id: "bench", label: "general knowledge benchmark: -1 point", kind: "client", col: 0, row: 1 },
          { id: "decide", label: "ship it", kind: "server", col: 1, row: 1 },
          { id: "task", label: "code review in production", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "bench", to: "decide" },
          { from: "decide", to: "task" },
        ],
      },
      answer: "decide->task",
      explain: "Quantization loss is uneven. Code, math and rare languages can degrade more than the average. Evaluate on the task that you will serve.",
    },
    {
      id: "qn-explain",
      format: "explain",
      scenario: "In two sentences: why does quantizing a model usually make it faster as well as smaller?",
      rubric: [
        { id: "bound", criterion: "Token generation is memory-bandwidth bound: every weight is read for each token" },
        { id: "less", criterion: "Fewer bits mean fewer bytes to read, so tokens come out faster until compute becomes the limit" },
      ],
      exemplar: "Token generation is memory-bandwidth bound, because every weight is read for each token. Fewer bits mean fewer bytes to read, so tokens come out faster until compute becomes the limit.",
      explain: "Speed is bandwidth over size.",
    },
  ],
  codex: {
    oneLiner: "Fewer bits per weight: memory is parameters × bits ÷ 8, speed is bandwidth over size. 8-bit is nearly free, 4-bit usually fine.",
    keyNumbers: [
      { label: "7B model at 16, 8, 4 bits", value: "14, 7, 3.5 GB", sourceId: "llamacpp" },
      { label: "7B at 4 bits, rounding vs calibrated (lab)", value: "95.5% vs 98.2% retained", sourceId: "gptq" },
    ],
    tradeoffs: [
      { choice: "Fewer bits", gain: "Smaller, faster, cheaper to serve", cost: "Quality, unevenly" },
      { choice: "Calibrated methods", gain: "Less loss at the same size", cost: "Needs sample data and a conversion step" },
      { choice: "Smaller model at more bits", gain: "Sometimes better quality for the same memory", cost: "Less capability headroom" },
    ],
    seenIn: ["GGUF files in llama.cpp and Ollama.", "GPTQ and AWQ checkpoints for GPU serving."],
    interviewAngle: "Say: 'size is params × bits ÷ 8; speed is memory-bound; 4-bit calibrated is the usual sweet spot; evaluate on the real task'.",
    aws: [{ concept: "Quantized serving", service: "Amazon SageMaker with vLLM or TensorRT-LLM quantized models" }],
    replay: { id: "quant-lab", config: QN, scene: "calibrated" },
  },
  interview: [
    "What is quantization and why does it help?",
    "How much quality do you lose at 4-bit?",
    "What is the difference between rounding and calibrated quantization?",
  ],
  deeper: [
    {
      title: "Quantizing more than weights",
      body: "Weights are only part of the memory. Activations and the key-value cache can be stored in lower precision too, and an 8-bit cache halves the memory for long contexts at a small cost. Different parts tolerate different precision, so mixed schemes that keep sensitive layers at higher precision are common.",
      sourceIds: ["llamacpp"],
    },
  ],
  honestPhysics: [
    "A model with P billion parameters at b bits takes P × b ÷ 8 gigabytes. Generating a token reads every weight once, so speed is memory bandwidth divided by model size. Hardware: laptop GPU 6 GB at 200 GB/s, desktop 24 GB at 900, server 80 GB at 2,000, keeping 1 GB for the cache and overhead.",
    "Quality retained for a 7B model with plain rounding: 99.7% at 8 bits, 95.5% at 4, 85% at 3, 55% at 2. With calibrated methods: 99.8%, 98.2%, 94% and 78%. Larger models lose less, scaled by (7 ÷ size)^0.3. Round figures, not benchmarks.",
  ],
  sources: [GPTQ, AWQ, LLAMACPP],
  verify: [
    { id: "size", claim: "A 7B model is 14 GB at 16 bits", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: {}, metric: "sizeGB" }, expect: { min: 13.9, max: 14.1 } },
    { id: "fits-13-4", claim: "13B at 4 bits is 6.5 GB and does not fit the laptop", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "13", bits: "4", method: "calib" }, metric: "fits" }, expect: { max: 0 } },
    { id: "fits-13-3", claim: "13B at 3 bits fits", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "13", bits: "3", method: "calib" }, metric: "fits" }, expect: { min: 1 } },
    { id: "q-13-3", claim: "…retaining 95% with a calibrated method", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "13", bits: "3", method: "calib" }, metric: "quality" }, expect: { min: 0.945, max: 0.955 } },
    { id: "q-13-3-rtn", claim: "Plain rounding would keep only 87%", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "13", bits: "3", method: "rtn" }, metric: "quality" }, expect: { min: 0.86, max: 0.88 } },
    { id: "collapse", claim: "A 7B model at 2 bits with plain rounding keeps 55%", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "7", bits: "2", method: "rtn" }, metric: "quality" }, expect: { min: 0.54, max: 0.56 } },
    { id: "speed", claim: "7B at 4 bits runs at 57 tokens a second on the laptop", run: "lab", params: { model: "quant-lab", config: QN_CHALLENGE, values: { params: "7", bits: "4" }, metric: "tokensPerSec" }, expect: { min: 56, max: 58 } },
  ],
});
