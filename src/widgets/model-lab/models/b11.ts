/**
 * Chapter B11 "Beyond prompting" models: choosing between prompting, retrieval and fine-tuning, LoRA, quantization,
 * and running models locally. Closed forms with labelled round constants (see each model's `honest` text).
 */
import { TEACHING_PRICES } from "../../../content/prices";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");
const P_IN = TEACHING_PRICES.big.input / 1e6;
const P_OUT = TEACHING_PRICES.big.output / 1e6;

// ------------------------------------------------------------------ prompting vs RAG vs fine-tuning

export function decideRun(rag: boolean, k: number, ft: boolean, few: boolean, qpd: number) {
  const retr = 0.35 + 0.55 * (1 - Math.exp(-k / 2));
  const fact = rag ? retr + (ft ? 0.02 : 0) : ft ? 0.5 : 0.35;
  const fmt = ft ? (few ? 0.97 : 0.96) : few ? 0.85 : 0.6;
  const stale = rag ? 1 : ft ? 15 : 180;
  const tokIn = 500 + (rag ? k * 600 : 0) + (few ? 1200 : 0);
  const perQuery = (tokIn * P_IN + 400 * P_OUT) * (ft ? 1.5 : 1);
  const cost = perQuery * qpd * 30 + (rag ? 400 : 0) + (ft ? 125 : 0);
  const weeks = 0.5 + (rag ? 2 : 0) + (few ? 0.5 : 0) + (ft ? 5 : 0);
  return { fact, fmt, stale, cost, weeks };
}

export const decideLab: LabModel = {
  id: "decide-lab",
  metrics: ["factAccuracy", "formatScore", "staleDays", "monthlyCost", "weeksToShip"],
  observes: ["ft-facts", "stale-answers"],
  scenes: ["rag", "style", "both"],
  runLabel: "Choose the approach",
  honest: [
    "A legal assistant over a private corpus of 40 million tokens, of which about a fifth changes each month, answering 20,000 questions a day. It must cite correct facts and write in a consistent house format. Illustrative numbers for the shape of the decision, not measurements.",
    "A bare prompt knows nothing about the corpus (35% of facts right). Retrieval puts the relevant passages in the prompt: accuracy 35% plus up to 55 points as you retrieve more passages (600 tokens each), updated nightly, at $400 a month of infrastructure and two more weeks to build. Fine-tuning on 2,000 examples teaches format very well (96%) and facts poorly (50%), goes stale for the 30-day retraining cycle (15 days on average), costs $1,500 a run (about $125 a month spread over a year), serves at 1.5 times the token price, and takes five weeks. A few examples in the prompt lift format to 85% for 1,200 tokens a call.",
    "Prices use the teaching sheet ($2 in and $10 out per million tokens), 500 tokens of question and instructions, and 400 tokens of answer.",
  ],
  init: () => ({ rag: false, k: 5, ft: false, few: false, qpd: 20000 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "toggle", id: "rag", label: "Retrieve passages from the corpus (RAG)" },
      { kind: "slider", id: "k", label: "Passages retrieved", min: 1, max: 10, step: 1, fmt: "int" },
      { kind: "toggle", id: "ft", label: "Fine-tune on 2,000 examples of the house format" },
      { kind: "toggle", id: "few", label: "Put a few examples in every prompt" },
    ];
    if (!(c as { lockQpd?: boolean }).lockQpd) out.push({ kind: "slider", id: "qpd", label: "Questions a day", min: 1000, max: 200000, step: 1000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = decideRun(bool(v, "rag"), Math.round(num(v, "k")), bool(v, "ft"), bool(v, "few"), num(v, "qpd"));
    return {
      metrics: { factAccuracy: r.fact, formatScore: r.fmt, staleDays: r.stale, monthlyCost: r.cost, weeksToShip: r.weeks },
      readouts: [
        { label: "Facts right", value: r.fact, fmt: "pct", tone: toneLow(r.fact, 0.85, 0.6) },
        { label: "House format followed", value: r.fmt, fmt: "pct", tone: toneLow(r.fmt, 0.9, 0.7) },
        { label: "Knowledge out of date by", value: r.stale, fmt: "int", sub: "days", tone: tone(r.stale, 2, 20) },
        { label: "Cost a month", value: r.cost, fmt: "usd", tone: tone(r.cost, 9000, 15000) },
        { label: "Weeks to ship", value: r.weeks, fmt: "num", tone: tone(r.weeks, 6, 8) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Facts right", value: r.fact, tone: toneLow(r.fact, 0.85, 0.6) }, { label: "Format followed", value: r.fmt, tone: toneLow(r.fmt, 0.9, 0.7) }] },
      notes: [!bool(v, "rag") && bool(v, "ft") ? "Fine-tuning taught the style and little of the content, and it ages the day training stops." : !bool(v, "rag") ? "Without the corpus in front of it the model guesses." : "Facts come from the documents; style can come from examples or training."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (bool(v, "ft") && !bool(v, "rag") && out.metrics.factAccuracy! < 0.6) ev.push("ft-facts");
    if (!bool(v, "rag") && out.metrics.staleDays! > 10) ev.push("stale-answers");
    return ev;
  },
  scene: (n): SceneOut => (n === "rag" ? { set: { rag: true }, focus: ["rag", "k"] } : n === "style" ? { set: { ft: true }, focus: ["ft"] } : n === "both" ? { set: { rag: true, ft: true }, focus: ["rag", "ft"] } : undefined),
};

// ------------------------------------------------------------------ LoRA

const D = 4096;
const LAYERS = 32;
const BASE_B = 7;

export function loraRun(rank: number, mods: string, n: number, qlora: boolean) {
  const m = mods === "all" ? 3 : 1;
  const params = rank * (2 * D) * (2 * m) * LAYERS;
  const capacity = 1 - Math.exp(-(rank * m) / 12);
  const data = 1 - Math.exp(-n / 800);
  let acc = 0.55 + 0.37 * capacity * data;
  if (n < 500 && rank * m > 64) acc -= 0.08;
  const baseGB = qlora ? BASE_B * 0.5 + 0.5 : BASE_B * 2;
  const train = (params * 16) / 1e9;
  const act = 3;
  const vram = baseGB + train + act;
  return { params, acc, vram, adapterMB: (params * 2) / 1e6, fullGB: BASE_B * 16 };
}

export const loraLab: LabModel = {
  id: "lora-lab",
  metrics: ["trainableParams", "accuracy", "vramGB", "adapterMB"],
  observes: ["tiny-fraction", "overfit"],
  scenes: ["rank", "targets", "qlora"],
  runLabel: "Configure the adapter",
  honest: [
    "A 7-billion-parameter model with 32 layers and a hidden size of 4,096. Full fine-tuning updates every weight and, with gradients and optimiser state, needs about 16 bytes per parameter: 112 GB. LoRA freezes the model and trains small low-rank matrices beside the chosen weights. At rank r each adapted matrix adds 2 × 4,096 × r trainable parameters, so adapting the query and value projections of all 32 layers at rank 8 trains about 4 million parameters, 0.06% of the model.",
    "Task accuracy starts at 55% and rises toward 92% with adapter capacity (a saturating curve in rank × the number of adapted matrix types) and with the amount of training data (a saturating curve with a scale of 800 examples). With under 500 examples and a large adapter it overfits and loses 8 points. Memory is the frozen weights (14 GB in 16-bit; 4 GB in 4-bit with QLoRA), plus 16 bytes per adapter parameter, plus about 3 GB of activations.",
    "Round figures to show the shape of the trade, not measurements of any run.",
  ],
  init: () => ({ rank: 8, mods: "qv", n: 2000, qlora: false }),
  controls: () => [
    { kind: "slider", id: "rank", label: "LoRA rank", min: 1, max: 256, step: 1, log: true, fmt: "int" },
    { kind: "choice", id: "mods", label: "Adapt", options: [{ id: "qv", label: "Query and value projections" }, { id: "all", label: "All linear layers" }] },
    { kind: "slider", id: "n", label: "Training examples", min: 100, max: 100000, step: 100, log: true, fmt: "int" },
    { kind: "toggle", id: "qlora", label: "QLoRA: load the base model in 4-bit" },
  ],
  evaluate: (v) => {
    const r = loraRun(Math.round(num(v, "rank")), str(v, "mods"), num(v, "n"), bool(v, "qlora"));
    return {
      metrics: { trainableParams: r.params, accuracy: r.acc, vramGB: r.vram, adapterMB: r.adapterMB },
      readouts: [
        { label: "Trainable parameters", value: r.params, fmt: "num", sub: `${((r.params / (BASE_B * 1e9)) * 100).toFixed(2)}% of the model` },
        { label: "Task accuracy", value: r.acc, fmt: "pct", tone: toneLow(r.acc, 0.88, 0.75) },
        { label: "GPU memory to train", value: r.vram, fmt: "gb", sub: `full fine-tuning needs ${r.fullGB} GB`, tone: tone(r.vram, 12, 24) },
        { label: "Adapter file", value: r.adapterMB, fmt: "num", sub: "MB" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Accuracy", value: r.acc, tone: toneLow(r.acc, 0.88, 0.75) }] },
      notes: [num(v, "n") < 500 && r.params > 8e6 ? "A big adapter on a few examples memorises them." : r.acc < 0.8 ? "Too little capacity or too little data." : "A small adapter learns the task without touching the base."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.trainableParams! < 1e7) ev.push("tiny-fraction");
    if (num(v, "n") < 500 && Math.round(num(v, "rank")) * (str(v, "mods") === "all" ? 3 : 1) > 64) ev.push("overfit");
    return ev;
  },
  scene: (n): SceneOut => (n === "rank" ? { set: { rank: 16 }, focus: ["rank"] } : n === "targets" ? { set: { mods: "all" }, focus: ["mods"] } : n === "qlora" ? { set: { qlora: true }, focus: ["qlora"] } : undefined),
};

// ------------------------------------------------------------------ quantization

const DROP: Record<number, { rtn: number; calib: number }> = { 16: { rtn: 0, calib: 0 }, 8: { rtn: 0.003, calib: 0.002 }, 4: { rtn: 0.045, calib: 0.018 }, 3: { rtn: 0.15, calib: 0.06 }, 2: { rtn: 0.45, calib: 0.22 } };
const HW: Record<string, { gb: number; bw: number }> = { laptop: { gb: 6, bw: 200 }, desktop: { gb: 24, bw: 900 }, server: { gb: 80, bw: 2000 } };

export function quantRun(params: number, bits: number, method: string, hw: string) {
  const d = DROP[bits]!;
  const base = method === "calib" ? d.calib : d.rtn;
  const drop = base * Math.pow(7 / params, 0.3);
  const gb = (params * bits) / 8;
  const h = HW[hw]!;
  const tps = gb > 0 ? h.bw / gb : 0;
  return { gb, quality: 1 - drop, tps, fits: gb + 1 <= h.gb ? 1 : 0, vram: h.gb };
}

export const quantLab: LabModel = {
  id: "quant-lab",
  metrics: ["sizeGB", "quality", "tokensPerSec", "fits", "paramsB"],
  observes: ["fits-laptop", "collapse"],
  scenes: ["four", "calibrated", "two"],
  runLabel: "Choose the quantization",
  honest: [
    "Quantization stores each weight in fewer bits. A model with P billion parameters at b bits per weight takes P × b ÷ 8 gigabytes, so a 7-billion model is 14 GB at 16 bits, 7 at 8 and 3.5 at 4. Generating a token reads every weight once, so on a memory-bound GPU the speed is memory bandwidth divided by model size: a smaller model is also a faster one.",
    "Quality retained falls with fewer bits: simple rounding loses 0.3% at 8 bits, 4.5% at 4, 15% at 3 and 45% at 2 for a 7B model; calibrated methods that use sample data to choose how to round lose 0.2%, 1.8%, 6% and 22%. Larger models lose less (scaled by (7 ÷ size)^0.3). Hardware: a laptop GPU has 6 GB and 200 GB/s of bandwidth, a desktop 24 GB and 900, a server 80 GB and 2,000, and 1 GB is kept for the cache and overhead.",
    "Round figures for the shape of the trade-off, not benchmarks of any particular model.",
  ],
  init: () => ({ params: 7, bits: 16, method: "rtn", hw: "laptop" }),
  controls: () => [
    { kind: "choice", id: "params", label: "Model size", options: [{ id: "3", label: "3 billion" }, { id: "7", label: "7 billion" }, { id: "13", label: "13 billion" }, { id: "34", label: "34 billion" }, { id: "70", label: "70 billion" }] },
    { kind: "choice", id: "bits", label: "Bits per weight", options: [{ id: "16", label: "16" }, { id: "8", label: "8" }, { id: "4", label: "4" }, { id: "3", label: "3" }, { id: "2", label: "2" }] },
    { kind: "choice", id: "method", label: "Method", options: [{ id: "rtn", label: "Round to nearest" }, { id: "calib", label: "Calibrated (GPTQ, AWQ style)" }] },
    { kind: "choice", id: "hw", label: "Hardware", options: [{ id: "laptop", label: "Laptop GPU, 6 GB" }, { id: "desktop", label: "Desktop GPU, 24 GB" }, { id: "server", label: "Server GPU, 80 GB" }] },
  ],
  evaluate: (v) => {
    const r = quantRun(Number(str(v, "params")), Number(str(v, "bits")), str(v, "method"), str(v, "hw"));
    return {
      metrics: { sizeGB: r.gb, quality: r.quality, tokensPerSec: r.tps, fits: r.fits, paramsB: Number(str(v, "params")) },
      readouts: [
        { label: "Model size", value: r.gb, fmt: "gb", tone: r.fits ? "ok" : "alert" },
        { label: "Fits on the hardware", value: r.fits ? "yes" : `no, ${r.vram} GB`, tone: r.fits ? "ok" : "alert" },
        { label: "Quality retained", value: r.quality, fmt: "pct", tone: toneLow(r.quality, 0.97, 0.9) },
        { label: "Speed when it fits", value: r.tps, fmt: "num", sub: "tokens a second", tone: toneLow(r.tps, 20, 8) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Quality retained", value: r.quality, tone: toneLow(r.quality, 0.97, 0.9) }] },
      notes: [r.quality < 0.8 ? "Two bits keep the size and lose the model." : r.fits ? "It fits, with room to run." : "It does not fit: fewer bits or a smaller model."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "hw") === "laptop" && out.metrics.fits! >= 1 && Number(str(v, "params")) >= 13) ev.push("fits-laptop");
    if (out.metrics.quality! < 0.8) ev.push("collapse");
    return ev;
  },
  scene: (n): SceneOut => (n === "four" ? { set: { bits: "4" }, focus: ["bits"] } : n === "calibrated" ? { set: { bits: "4", method: "calib" }, focus: ["method"] } : n === "two" ? { set: { bits: "2" }, focus: ["bits"] } : undefined),
};

// ------------------------------------------------------------------ running local models

const MODELS: Record<string, { p: number; kvMBPerK: number }> = { "3": { p: 3, kvMBPerK: 56 }, "7": { p: 7, kvMBPerK: 128 }, "13": { p: 13, kvMBPerK: 200 }, "34": { p: 34, kvMBPerK: 240 } };

export function localRun(model: string, bits: number, ctx: number, kv8: boolean, offload: number, vramGB: number) {
  const m = MODELS[model]!;
  const w = (m.p * bits) / 8;
  const kv = (m.kvMBPerK * (kv8 ? 0.5 : 1) * ctx) / 1024;
  const wGpu = w * (1 - offload);
  const wCpu = w * offload;
  const need = wGpu + kv + 0.8;
  const tps = 1 / (wGpu / 200 + wCpu / 40 + 1e-6);
  const dropBase = DROP[bits]!.calib * Math.pow(7 / m.p, 0.3);
  return { weights: w, kv, need, fits: need <= vramGB ? 1 : 0, tps, quality: 1 - dropBase, vramGB };
}

export const localLab: LabModel = {
  id: "local-lab",
  metrics: ["vramNeeded", "fitsGpu", "tokensPerSec", "quality", "contextK", "modelB"],
  observes: ["oom", "offload-slow"],
  scenes: ["fit", "kvcache", "offload"],
  runLabel: "Plan the local setup",
  honest: [
    "A single GPU with 6 GB of memory and about 200 GB/s of bandwidth, plus system memory at about 40 GB/s. Memory needed is the weights (parameters × bits ÷ 8), plus the key-value cache that grows with context (about 128 MB per thousand tokens for a 7B model, 56 for 3B, 200 for 13B and 240 for 34B in 16-bit; half that with an 8-bit cache), plus about 0.8 GB of overhead.",
    "Layers that do not fit can be offloaded to system memory, where they run five times slower than on the GPU. Speed is the reciprocal of the time to read the weights once, split between GPU and CPU. Quality uses calibrated quantization, losing 0.2% at 8 bits, 1.8% at 4, 6% at 3 and 22% at 2 for a 7B model, less for larger ones.",
    "Round figures to show what decides whether a model runs: the weights, the cache and where the layers live.",
  ],
  init: () => ({ model: "7", bits: "4", ctx: 8, kv8: false, offload: 0 }),
  controls: () => [
    { kind: "choice", id: "model", label: "Model", options: [{ id: "3", label: "3 billion" }, { id: "7", label: "7 billion" }, { id: "13", label: "13 billion" }, { id: "34", label: "34 billion" }] },
    { kind: "choice", id: "bits", label: "Bits per weight", options: [{ id: "8", label: "8" }, { id: "4", label: "4" }, { id: "3", label: "3" }, { id: "2", label: "2" }] },
    { kind: "slider", id: "ctx", label: "Context length", min: 1, max: 128, step: 1, log: true, fmt: "int", hint: "thousand tokens" },
    { kind: "toggle", id: "kv8", label: "Store the key-value cache in 8-bit" },
    { kind: "slider", id: "offload", label: "Share of weights in system memory", min: 0, max: 1, step: 0.05, fmt: "pct" },
  ],
  evaluate: (v) => {
    const r = localRun(str(v, "model"), Number(str(v, "bits")), num(v, "ctx"), bool(v, "kv8"), num(v, "offload"), 6);
    return {
      metrics: { vramNeeded: r.need, fitsGpu: r.fits, tokensPerSec: r.tps, quality: r.quality, contextK: num(v, "ctx"), modelB: Number(str(v, "model")) },
      readouts: [
        { label: "Weights", value: r.weights, fmt: "gb" },
        { label: "Key-value cache", value: r.kv, fmt: "gb" },
        { label: "GPU memory needed", value: r.need, fmt: "gb", sub: "of 6 GB", tone: r.fits ? "ok" : "alert" },
        { label: "Speed", value: r.tps, fmt: "num", sub: "tokens a second", tone: toneLow(r.tps, 20, 8) },
        { label: "Quality retained", value: r.quality, fmt: "pct", tone: toneLow(r.quality, 0.97, 0.9) },
      ],
      view: { kind: "bars", fmt: "gb", max: 12, bars: [{ label: "GPU memory needed", segs: [{ value: r.weights * (1 - num(v, "offload")), tone: "info", label: "weights" }, { value: r.kv, tone: "lilac", label: "cache" }, { value: 0.8, tone: "muted", label: "overhead" }] }], lines: [{ value: 6, label: "GPU memory", tone: "alert" }] },
      notes: [r.fits ? "It fits." : "Out of memory: fewer bits, less context, an 8-bit cache or offloading."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!out.metrics.fitsGpu) ev.push("oom");
    if (num(v, "offload") > 0 && out.metrics.tokensPerSec! < 20) ev.push("offload-slow");
    return ev;
  },
  scene: (n): SceneOut => (n === "fit" ? { set: { model: "7", bits: "4" }, focus: ["model", "bits"] } : n === "kvcache" ? { set: { ctx: 32, kv8: true }, focus: ["ctx", "kv8"] } : n === "offload" ? { set: { model: "13", bits: "4", offload: 0.3 }, focus: ["offload"] } : undefined),
};

export const B11_MODELS: LabModel[] = [decideLab, loraLab, quantLab, localLab];
