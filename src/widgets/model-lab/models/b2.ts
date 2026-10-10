/**
 * Chapter B2 "How Models Behave" models: sampling, hallucination, latency, and LLM cost arithmetic.
 * Sampling is real arithmetic on a toy next-token distribution. Hallucination and latency are explicit, labelled
 * models with round figures (they illustrate the mechanism; they are not benchmarks of any model).
 */
import { TEACHING_CACHE_READ_MULT, TEACHING_CACHE_WRITE_MULT, TEACHING_PRICES } from "../../../content/prices";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ sampling

export const SAMPLING_SETS: Record<string, { prompt: string; tokens: { t: string; logit: number; bad?: boolean }[] }> = {
  capital: {
    prompt: "The capital of France is",
    tokens: [
      { t: " Paris", logit: 9.0 },
      { t: " a", logit: 4.5 },
      { t: " the", logit: 4.2 },
      { t: " located", logit: 3.8 },
      { t: " Lyon", logit: 3.5, bad: true },
      { t: " known", logit: 3.2 },
      { t: " Berlin", logit: 2.0, bad: true },
      { t: " banana", logit: 0.5, bad: true },
    ],
  },
  tagline: {
    prompt: "Pigeon: messaging that",
    tokens: [
      { t: " just works", logit: 5.0 },
      { t: " feels like home", logit: 4.7 },
      { t: " keeps up", logit: 4.5 },
      { t: " travels light", logit: 4.3 },
      { t: " flies", logit: 4.1 },
      { t: " respects you", logit: 3.9 },
      { t: " are gnomes", logit: 1.2, bad: true },
      { t: " quarterly", logit: 0.4, bad: true },
    ],
  },
};

export function samplingDist(set: string, temperature: number, topK: number, topP: number) {
  const tokens = (SAMPLING_SETS[set] ?? SAMPLING_SETS.capital!).tokens;
  const T = Math.max(0.05, temperature);
  const scaled = tokens.map((x) => x.logit / T);
  const m = Math.max(...scaled);
  const ex = scaled.map((s) => Math.exp(s - m));
  const z = ex.reduce((a, b) => a + b, 0);
  const full = ex.map((e) => e / z);
  // Order by probability, keep the top-k, then the smallest prefix whose mass reaches top-p.
  const order = full.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const kept = new Set<number>();
  let cum = 0;
  for (let r = 0; r < order.length && r < topK; r++) {
    kept.add(order[r]![1]);
    cum += order[r]![0];
    if (cum >= topP) break;
  }
  const mass = [...kept].reduce((s, i) => s + full[i]!, 0);
  const final = full.map((p, i) => (kept.has(i) ? p / mass : 0));
  const entropy = -final.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
  const pBad = final.reduce((s, p, i) => s + (tokens[i]!.bad ? p : 0), 0);
  return { tokens, full, final, kept, entropy, pBad, nucleus: kept.size, pTop: Math.max(...final) };
}

export const samplingLab: LabModel = {
  id: "sampling-lab",
  metrics: ["pTop", "pBad", "entropyBits", "nucleus"],
  observes: ["greedy", "hot", "nucleus-cut"],
  scenes: ["temp", "topp", "greedy"],
  runLabel: "Set the sampler",
  honest: [
    "The distribution is a toy: eight candidate next tokens with fixed logits for one prompt. A real model has a vocabulary of tens of thousands of tokens and a different distribution at every step.",
    "Temperature divides the logits before the softmax. Top-k keeps the k most likely tokens, and top-p keeps the smallest set whose probabilities reach p, then the rest are renormalised.",
    "Temperature 0 is greedy decoding; the lab uses 0.05 as its floor. Real APIs may also vary slightly run to run even at 0 because of how GPUs add numbers.",
  ],
  init: (c) => ({ temperature: 1, topP: 1, topK: 8, set: (c as { set?: string }).set ?? "capital" }),
  controls: () => [
    { kind: "slider", id: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05, fmt: "num", hint: "0 is greedy; higher flattens the distribution" },
    { kind: "slider", id: "topP", label: "Top-p (nucleus)", min: 0.1, max: 1, step: 0.05, fmt: "num" },
    { kind: "slider", id: "topK", label: "Top-k", min: 1, max: 8, step: 1, fmt: "int" },
  ],
  evaluate: (v, c) => {
    const set = (c as { set?: string }).set ?? "capital";
    const d = samplingDist(set, num(v, "temperature"), Math.round(num(v, "topK")), num(v, "topP"));
    const bad = SAMPLING_SETS[set]!.tokens;
    return {
      metrics: { pTop: d.pTop, pBad: d.pBad, entropyBits: d.entropy, nucleus: d.nucleus },
      readouts: [
        { label: `Chance of "${bad[0]!.t.trim()}"`, value: d.final[0]!, fmt: "pct" },
        { label: "Chance of a nonsense token", value: d.pBad, fmt: "pct", tone: d.pBad > 0.05 ? "alert" : d.pBad > 0.01 ? "warn" : "ok" },
        { label: "Variety (entropy)", value: d.entropy, fmt: "num", sub: "bits" },
        { label: "Candidates kept", value: d.nucleus, fmt: "int", sub: "of 8" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: d.tokens.map((x, i) => ({ label: `"${x.t.trim()}"${x.bad ? " ✗" : ""}`, value: d.final[i]!, tone: !d.kept.has(i) ? ("muted" as Tone) : x.bad ? ("alert" as Tone) : ("ok" as Tone), sub: !d.kept.has(i) ? "cut" : undefined })) },
      notes: [`Prompt: "${SAMPLING_SETS[set]!.prompt}" …`],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "temperature") <= 0.1) ev.push("greedy");
    if (num(v, "temperature") >= 1.5) ev.push("hot");
    if (num(v, "topP") <= 0.9 && num(v, "temperature") >= 1) ev.push("nucleus-cut");
    return ev;
  },
  scene: (n): SceneOut => (n === "temp" ? { set: { temperature: 1.6, topP: 1, topK: 8 }, focus: ["temperature"] } : n === "topp" ? { set: { temperature: 1.2, topP: 0.8, topK: 8 }, focus: ["topP"] } : n === "greedy" ? { set: { temperature: 0, topP: 1, topK: 8 }, focus: ["temperature"] } : undefined),
};

// ------------------------------------------------------------------ hallucination

export const hallucinationLab: LabModel = {
  id: "hallucination-lab",
  metrics: ["wrongRate", "correctRate", "abstainRate", "answeredWrong"],
  observes: ["fabricated", "grounded"],
  scenes: ["fabricate", "ground", "abstain"],
  runLabel: "Ship the assistant",
  honest: [
    "This is an illustrative model, not a measurement of any model. Of every 100 questions, 60 are about things the model learned in training and 40 need Pigeon's own documents.",
    "When it lacks the information the model fabricates a confident answer unless told it may say it does not know. The lab uses 85% for that, a round number to show the mechanism.",
    "Retrieval finds the right passage 85% of the time; if it does, the model answers correctly 95% of the time. A verification pass catches 60% of wrong answers and turns them into abstentions.",
  ],
  init: () => ({ retrieval: false, abstain: false, verify: false }),
  controls: () => [
    { kind: "toggle", id: "retrieval", label: "Ground answers in retrieved documents" },
    { kind: "toggle", id: "abstain", label: "Allow 'I don't know'", detail: "The prompt tells the model to say so when the answer is not in the context" },
    { kind: "toggle", id: "verify", label: "Verify each answer against its sources", detail: "A second pass checks the claim and withholds unsupported answers" },
  ],
  evaluate: (v) => {
    const known = 0.6;
    const unknown = 0.4;
    const ground = bool(v, "retrieval");
    const recall = 0.85;
    const abst = bool(v, "abstain") ? 0.75 : 0;
    // Answers when the model knows the topic.
    let correct = known * 0.92;
    let wrong = known * 0.08;
    let abstain = 0;
    // Questions needing Pigeon's documents.
    const withDocs = ground ? unknown * recall : 0;
    const without = unknown - withDocs;
    correct += withDocs * 0.95;
    wrong += withDocs * 0.05;
    const noInfoAbstain = without * abst;
    const fabricated = without - noInfoAbstain;
    abstain += noInfoAbstain;
    correct += fabricated * 0.15;
    wrong += fabricated * 0.85;
    if (bool(v, "verify")) {
      const caught = wrong * 0.6;
      wrong -= caught;
      abstain += caught;
    }
    const answered = correct + wrong;
    return {
      metrics: { wrongRate: wrong, correctRate: correct, abstainRate: abstain, answeredWrong: answered > 0 ? wrong / answered : 0 },
      readouts: [
        { label: "Confidently wrong", value: wrong, fmt: "pct", tone: wrong > 0.1 ? "alert" : wrong > 0.05 ? "warn" : "ok", sub: "of all questions" },
        { label: "Correct answers", value: correct, fmt: "pct", tone: correct > 0.85 ? "ok" : undefined },
        { label: "Declined to answer", value: abstain, fmt: "pct" },
        { label: "Share of answers that are wrong", value: answered > 0 ? wrong / answered : 0, fmt: "pct" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Correct", value: correct, tone: "ok" }, { label: "Wrong, said confidently", value: wrong, tone: "alert" }, { label: "Said it does not know", value: abstain, tone: "info" }] },
      notes: [ground ? "Answers can now point at a source, so unsupported claims are easier to catch." : "Without documents the model answers questions about Pigeon from whatever it half-remembers."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (!bool(v, "retrieval") && !bool(v, "abstain") && !bool(v, "verify")) ev.push("fabricated");
    if (bool(v, "retrieval")) ev.push("grounded");
    return ev;
  },
  scene: (n): SceneOut => (n === "fabricate" ? { set: { retrieval: false, abstain: false, verify: false }, focus: [] } : n === "ground" ? { set: { retrieval: true }, focus: ["retrieval"] } : n === "abstain" ? { set: { abstain: true }, focus: ["abstain"] } : undefined),
};

// ------------------------------------------------------------------ latency: time to first token, throughput

const MODELS = {
  small: { label: "Small model", prefill: 20000, decode: 150, usdIn: TEACHING_PRICES.small.input, usdOut: TEACHING_PRICES.small.output },
  big: { label: "Large model", prefill: 5000, decode: 50, usdIn: TEACHING_PRICES.big.input, usdOut: TEACHING_PRICES.big.output },
};

export const latencyLab: LabModel = {
  id: "ttft-lab",
  metrics: ["ttftMs", "totalMs", "perceivedMs", "decodeTokPerSec"],
  observes: ["ttft-moved", "streamed"],
  scenes: ["prefill", "decode", "stream"],
  runLabel: "Ship the endpoint",
  honest: [
    "Prefill speed (prompt tokens processed per second) and decode speed (output tokens per second) are round figures for a small and a large model: 20,000 and 150, and 5,000 and 50. Real values depend on the model, hardware, load, and provider.",
    "Time to first token is network time plus queueing plus prefill. Output tokens then arrive one at a time at the decode speed.",
    "With streaming, a reader starts after the first token arrives, so perceived latency is about time to first token plus the time to read the first sentence, which the lab sets at 15 tokens.",
  ],
  init: (c) => ({ model: "big", promptTokens: (c as { promptTokens?: number }).promptTokens ?? 2000, outputTokens: (c as { outputTokens?: number }).outputTokens ?? 300, stream: false, cached: false }),
  controls: (c) => {
    const lock = (c as { lockTokens?: boolean }).lockTokens;
    const out: Control[] = [{ kind: "choice", id: "model", label: "Model", options: [{ id: "small", label: "Small and fast", detail: "Prefills quickly, decodes quickly" }, { id: "big", label: "Large and capable", detail: "Slower on both" }] }];
    if (!lock) {
      out.push({ kind: "slider", id: "promptTokens", label: "Prompt tokens", min: 100, max: 100000, log: true, fmt: "int" });
      out.push({ kind: "slider", id: "outputTokens", label: "Output tokens", min: 10, max: 4000, log: true, fmt: "int" });
    }
    out.push({ kind: "toggle", id: "stream", label: "Stream the response" }, { kind: "toggle", id: "cached", label: "Prompt prefix cached", detail: "The shared first 90% of the prompt skips prefill" });
    return out;
  },
  evaluate: (v) => {
    const m = MODELS[str(v, "model") as keyof typeof MODELS];
    const p = num(v, "promptTokens");
    const o = num(v, "outputTokens");
    const prefillTokens = bool(v, "cached") ? p * 0.1 : p;
    const prefillMs = (prefillTokens / m.prefill) * 1000;
    const ttft = 80 + prefillMs;
    const decodeMs = (o / m.decode) * 1000;
    const total = ttft + decodeMs;
    const perceived = bool(v, "stream") ? ttft + (Math.min(15, o) / m.decode) * 1000 : total;
    return {
      metrics: { ttftMs: ttft, totalMs: total, perceivedMs: perceived, decodeTokPerSec: m.decode },
      readouts: [
        { label: "Time to first token", value: ttft, fmt: "ms", tone: ttft > 1000 ? "warn" : "ok" },
        { label: "Whole response", value: total, fmt: "ms" },
        { label: "What the reader waits", value: perceived, fmt: "ms", tone: perceived > 3000 ? "alert" : perceived > 1500 ? "warn" : "ok", sub: bool(v, "stream") ? "streaming" : "waits for the end" },
        { label: "Decode speed", value: m.decode, fmt: "int", sub: "tokens per second" },
      ],
      view: { kind: "waterfall", rows: [{ label: "Network and queue", start: 0, ms: 80, tone: "muted" }, { label: `Prefill ${Math.round(prefillTokens).toLocaleString("en-US")} tokens`, start: 80, ms: prefillMs, tone: "warn" }, { label: `Decode ${Math.round(o).toLocaleString("en-US")} tokens`, start: ttft, ms: decodeMs, tone: "ok" }], target: { ms: perceived, label: "reader starts here" } },
      notes: [bool(v, "stream") ? "Streaming turns a long wait into a short one followed by reading." : "Without streaming the reader sees nothing until the last token is generated."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "promptTokens") >= 20000) ev.push("ttft-moved");
    if (bool(v, "stream")) ev.push("streamed");
    return ev;
  },
  scene: (n): SceneOut => (n === "prefill" ? { set: { promptTokens: 30000, stream: false, cached: false }, focus: ["promptTokens"] } : n === "decode" ? { set: { outputTokens: 1500, stream: false }, focus: ["outputTokens"] } : n === "stream" ? { set: { stream: true }, focus: ["stream"] } : undefined),
};

// ------------------------------------------------------------------ LLM cost math

export const costLab: LabModel = {
  id: "cost-lab",
  metrics: ["monthlyUsd", "perRequestUsd", "inputShare"],
  observes: ["cost-moved", "cheaper"],
  scenes: ["meter", "cache", "route"],
  runLabel: "Approve the budget",
  honest: [
    "Prices are the lesson's reference sheet: a Sonnet-class model at $2 per million input tokens and $10 per million output tokens, and a Haiku-class model at $1 and $5. Check current prices before budgeting for real.",
    "Prompt caching charges 1.25 times the input price to write a prefix and 0.1 times to read it. The lab assumes the cached prefix is read on 95% of requests.",
    "Routing sends a share of easy requests to the cheap model. The batch option takes half off, for work that can wait for a result within a day.",
  ],
  init: (c) => ({ requests: (c as { requests?: number }).requests ?? 50000, inTok: (c as { inTok?: number }).inTok ?? 3000, outTok: (c as { outTok?: number }).outTok ?? 400, cachedShare: 0, small: 0, batch: false }),
  controls: (c) => {
    const lock = (c as { lockLoad?: boolean }).lockLoad;
    const out: Control[] = [];
    if (!lock) {
      out.push({ kind: "slider", id: "requests", label: "Requests per day", min: 1000, max: 5000000, log: true, fmt: "int" });
      out.push({ kind: "slider", id: "inTok", label: "Input tokens per request", min: 100, max: 50000, log: true, fmt: "int" });
      out.push({ kind: "slider", id: "outTok", label: "Output tokens per request", min: 10, max: 4000, log: true, fmt: "int" });
    }
    out.push({ kind: "slider", id: "cachedShare", label: "Share of the prompt that is a cached prefix", min: 0, max: 0.9, step: 0.05, fmt: "pct" });
    out.push({ kind: "slider", id: "small", label: "Share of requests routed to the small model", min: 0, max: 0.9, step: 0.05, fmt: "pct" });
    out.push({ kind: "toggle", id: "batch", label: "Run as a batch job (half price)", detail: "Results within a day, not in real time" });
    return out;
  },
  evaluate: (v) => {
    const n = num(v, "requests");
    const inTok = num(v, "inTok");
    const outTok = num(v, "outTok");
    const cs = num(v, "cachedShare");
    const small = num(v, "small");
    const perM = (tokens: number, usd: number) => (tokens / 1e6) * usd;
    const inputCost = (price: number) => perM(inTok * (1 - cs), price) + perM(inTok * cs, price * (0.95 * TEACHING_CACHE_READ_MULT + 0.05 * TEACHING_CACHE_WRITE_MULT));
    const big = inputCost(TEACHING_PRICES.big.input) + perM(outTok, TEACHING_PRICES.big.output);
    const sm = inputCost(TEACHING_PRICES.small.input) + perM(outTok, TEACHING_PRICES.small.output);
    let per = big * (1 - small) + sm * small;
    if (bool(v, "batch")) per *= 0.5;
    const monthly = per * n * 30;
    const inputOnly = inputCost(TEACHING_PRICES.big.input);
    return {
      metrics: { monthlyUsd: monthly, perRequestUsd: per, inputShare: inputOnly / big },
      readouts: [
        { label: "Per month", value: monthly, fmt: "usd", tone: monthly > 10000 ? "alert" : monthly > 4000 ? "warn" : "ok" },
        { label: "Per request", value: per, fmt: "usd" },
        { label: "Share of the bill that is input", value: inputOnly / big, fmt: "pct", sub: "on the large model" },
      ],
      view: { kind: "bars", fmt: "usd", bars: [{ label: "Input tokens", value: inputCost(TEACHING_PRICES.big.input) * n * 30 * (1 - small) * (bool(v, "batch") ? 0.5 : 1), tone: "info" }, { label: "Output tokens", value: perM(outTok, TEACHING_PRICES.big.output) * n * 30 * (1 - small) * (bool(v, "batch") ? 0.5 : 1), tone: "warn" }, { label: "Small-model share (all tokens)", value: sm * small * n * 30 * (bool(v, "batch") ? 0.5 : 1), tone: "ok" }] },
      notes: ["Output tokens cost several times input tokens, so long answers dominate even when prompts are long."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (num(v, "cachedShare") > 0 || num(v, "small") > 0 || bool(v, "batch")) ev.push("cost-moved");
    if (out.metrics.monthlyUsd! < 4000) ev.push("cheaper");
    return ev;
  },
  scene: (n): SceneOut => (n === "meter" ? { set: { cachedShare: 0, small: 0, batch: false }, focus: [] } : n === "cache" ? { set: { cachedShare: 0.7 }, focus: ["cachedShare"] } : n === "route" ? { set: { small: 0.6 }, focus: ["small"] } : undefined),
};

export const B2_MODELS: LabModel[] = [samplingLab, hallucinationLab, latencyLab, costLab];
