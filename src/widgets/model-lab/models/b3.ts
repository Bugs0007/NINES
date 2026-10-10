/**
 * Chapter B3 "Prompting as Engineering" models: system prompts, structure, extended thinking, structured outputs,
 * prompt caching, and versioned prompts with regression gates. Pass rates and accuracies here are labelled,
 * round figures that show the mechanism; real values come from your own evals (chapter B5).
 */
import { TEACHING_CACHE_READ_MULT, TEACHING_PRICES } from "../../../content/prices";
import { normCdf } from "../math";
import { bool, num, str, sweep, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ system prompt rules

const RULES = [
  { id: "json", label: "Answer in the JSON shape the app parses" },
  { id: "scope", label: "Politely refuse questions outside Pigeon" },
  { id: "short", label: "Keep answers to three sentences" },
  { id: "refund", label: "Never promise a refund" },
  { id: "tone", label: "Warm, plain tone, no jargon" },
];
const RULE_P: Record<string, { p: number; tokens: number }> = { none: { p: 0.55, tokens: 0 }, stated: { p: 0.9, tokens: 25 }, example: { p: 0.96, tokens: 60 } };

export const promptLab: LabModel = {
  id: "prompt-lab",
  metrics: ["passAll", "minRule", "tokens", "rulesStated"],
  observes: ["stated", "examples"],
  scenes: ["silent", "stated", "example"],
  runLabel: "Ship the system prompt",
  honest: [
    "Pass rates are illustrative: a rule the prompt never mentions is followed about 55% of the time by accident, one that is stated about 90%, and one that comes with a short example about 96%. Real rates depend on the model and the rule, and are measured with evals.",
    "A response passes only if it follows every rule, so the rates multiply: five rules at 90% pass together 59% of the time.",
    "Stating a rule costs about 25 tokens and an example about 60 more. Those tokens are paid on every request.",
  ],
  init: () => ({ json: "none", scope: "none", short: "none", refund: "none", tone: "none" }),
  controls: () => RULES.map<Control>((r) => ({ kind: "choice", id: r.id, label: r.label, options: [{ id: "none", label: "Not mentioned" }, { id: "stated", label: "Stated in the prompt" }, { id: "example", label: "Stated, with a short example" }] })),
  evaluate: (v) => {
    const ps = RULES.map((r) => RULE_P[str(v, r.id)]!);
    const all = ps.reduce((a, b) => a * b.p, 1);
    const tokens = ps.reduce((a, b) => a + b.tokens, 0);
    const min = Math.min(...ps.map((p) => p.p));
    return {
      metrics: { passAll: all, minRule: min, tokens, rulesStated: RULES.filter((r) => str(v, r.id) !== "none").length },
      readouts: [
        { label: "Replies that follow every rule", value: all, fmt: "pct", tone: all > 0.75 ? "ok" : all > 0.5 ? "warn" : "alert" },
        { label: "Weakest rule", value: min, fmt: "pct" },
        { label: "Prompt tokens added", value: tokens, fmt: "int", sub: "on every request" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: RULES.map((r, i) => ({ label: r.label, value: ps[i]!.p, tone: ps[i]!.p > 0.94 ? ("ok" as Tone) : ps[i]!.p > 0.8 ? ("warn" as Tone) : ("alert" as Tone), sub: str(v, r.id) === "none" ? "left to chance" : str(v, r.id) === "stated" ? "stated" : "stated with an example" })) },
      notes: ["The model can only follow a rule it was told about."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (RULES.some((r) => str(v, r.id) !== "none")) ev.push("stated");
    if (RULES.some((r) => str(v, r.id) === "example")) ev.push("examples");
    return ev;
  },
  scene: (n): SceneOut => (n === "silent" ? { set: { json: "none", scope: "none", short: "none", refund: "none", tone: "none" }, focus: [] } : n === "stated" ? { set: { json: "stated", scope: "stated", short: "stated", refund: "stated", tone: "stated" }, focus: ["json", "refund"] } : n === "example" ? { set: { json: "example" }, focus: ["json"] } : undefined),
};

// ------------------------------------------------------------------ prompt structure

export const structureLab: LabModel = {
  id: "structure-lab",
  metrics: ["accuracy", "tokens", "costPerRequest"],
  observes: ["examples-added", "reordered"],
  scenes: ["order", "tags", "examples"],
  runLabel: "Ship the prompt layout",
  honest: [
    "Accuracy is an illustrative curve for a question-answering prompt over long documents: a baseline of 62%, rising with each worked example (diminishing returns), plus small gains for putting the documents first with the question last, and for marking the parts with tags.",
    "Anthropic's guidance recommends placing long documents above the question and structuring multiple documents with tags. The lab uses small round gains, not the figures of any one test.",
    "Each example costs about 150 tokens, and the prompt cost uses the reference large-model input price.",
  ],
  init: (c) => ({ examples: 0, docsFirst: false, tags: false, docTokens: (c as { docTokens?: number }).docTokens ?? 8000 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "slider", id: "examples", label: "Worked examples in the prompt", min: 0, max: 8, step: 1, fmt: "int" },
      { kind: "toggle", id: "docsFirst", label: "Documents first, question last" },
      { kind: "toggle", id: "tags", label: "Mark parts with XML tags", detail: "<documents>, <examples>, <question>" },
    ];
    if (!(c as { lockDocs?: boolean }).lockDocs) out.push({ kind: "slider", id: "docTokens", label: "Document tokens", min: 500, max: 100000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const n = num(v, "examples");
    const acc = Math.min(0.97, 0.62 + 0.3 * (1 - Math.exp(-n / 2)) + (bool(v, "docsFirst") ? 0.04 : 0) + (bool(v, "tags") ? 0.03 : 0));
    const tokens = num(v, "docTokens") + n * 150 + 100 + (bool(v, "tags") ? 30 : 0);
    const cost = (tokens / 1e6) * TEACHING_PRICES.big.input;
    const xs = sweep(0, 8, 9);
    return {
      metrics: { accuracy: acc, tokens, costPerRequest: cost },
      readouts: [
        { label: "Answers correct", value: acc, fmt: "pct", tone: acc > 0.9 ? "ok" : acc > 0.8 ? "warn" : "alert" },
        { label: "Prompt size", value: tokens, fmt: "int", sub: "tokens" },
        { label: "Prompt cost per request", value: cost, fmt: "usd" },
      ],
      view: { kind: "curve", xLabel: "worked examples", yLabel: "answers correct", xFmt: "int", yFmt: "pct", yMax: 1, series: [{ id: "acc", label: "Accuracy", tone: "ok", points: xs.map((x) => [x, Math.min(0.97, 0.62 + 0.3 * (1 - Math.exp(-x / 2)) + (bool(v, "docsFirst") ? 0.04 : 0) + (bool(v, "tags") ? 0.03 : 0))] as [number, number]) }], marker: { x: n, y: acc, label: `${(acc * 100).toFixed(0)}%`, tone: "amber" }, hLines: [{ y: 0.9, label: "90%", tone: "info" }] },
      notes: ["Each example helps a little less than the one before, and costs the same tokens."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "examples") >= 2) ev.push("examples-added");
    if (bool(v, "docsFirst")) ev.push("reordered");
    return ev;
  },
  scene: (n): SceneOut => (n === "order" ? { set: { docsFirst: true }, focus: ["docsFirst"] } : n === "tags" ? { set: { tags: true }, focus: ["tags"] } : n === "examples" ? { set: { examples: 3 }, focus: ["examples"] } : undefined),
};

// ------------------------------------------------------------------ extended thinking

const TASKS = { easy: { label: "Easy: classify a ticket", a0: 0.85, max: 0.97, k: 500 }, medium: { label: "Medium: a multi-step refund calculation", a0: 0.5, max: 0.92, k: 2000 }, hard: { label: "Hard: debug a multi-service outage from logs", a0: 0.2, max: 0.85, k: 3000 } };

export const thinkLab: LabModel = {
  id: "think-lab",
  metrics: ["accuracy", "latencyS", "costPerCall", "budget"],
  observes: ["think-helps", "think-waste"],
  scenes: ["budget", "easy", "hard"],
  runLabel: "Set the thinking budget",
  honest: [
    "Accuracy follows a saturating curve per task: a floor with no thinking, a ceiling, and a scale (500, 2,000, 3,000 tokens) at which most of the gain arrives. The numbers are illustrative; real gains differ by model and task, and you measure them with evals.",
    "Thinking tokens are generated and billed like output tokens, at the large model's $10 per million, and arrive at about 80 tokens a second before the answer starts.",
    "Extended thinking is not free reasoning: it spends tokens and time, and on easy tasks it spends them for no gain.",
  ],
  init: (c) => ({ task: (c as { task?: string }).task ?? "hard", budget: 0 }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockTask?: boolean }).lockTask) out.push({ kind: "choice", id: "task", label: "Task", options: Object.entries(TASKS).map(([id, t]) => ({ id, label: t.label })) });
    out.push({ kind: "slider", id: "budget", label: "Thinking budget (tokens)", min: 0, max: 32000, step: 500, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const t = TASKS[str(v, "task") as keyof typeof TASKS];
    const b = num(v, "budget");
    const acc = t.a0 + (t.max - t.a0) * (1 - Math.exp(-b / t.k));
    const latency = 1 + b / 80;
    const cost = (b / 1e6) * TEACHING_PRICES.big.output + 0.003;
    const xs = sweep(0, 32000, 33);
    return {
      metrics: { accuracy: acc, latencyS: latency, costPerCall: cost, budget: b },
      readouts: [
        { label: "Correct answers", value: acc, fmt: "pct", tone: acc > 0.8 ? "ok" : acc > 0.6 ? "warn" : "alert" },
        { label: "Time to the answer", value: latency, fmt: "s" },
        { label: "Cost per call", value: cost, fmt: "usd" },
      ],
      view: { kind: "curve", xLabel: "thinking tokens", yLabel: "correct answers", xFmt: "int", yFmt: "pct", yMax: 1, series: [{ id: "acc", label: t.label, tone: "ok", points: xs.map((x) => [x, t.a0 + (t.max - t.a0) * (1 - Math.exp(-x / t.k))] as [number, number]) }], marker: { x: b, y: acc, label: `${(acc * 100).toFixed(0)}%`, tone: "amber" } },
      notes: [str(v, "task") === "easy" ? "An easy task is mostly solved already; thinking adds cost and delay for a small gain." : "Gains come early and flatten: past the knee you are paying for tokens that buy little."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "task") === "hard" && out.metrics.accuracy! > 0.5 && num(v, "budget") > 0) ev.push("think-helps");
    if (str(v, "task") === "easy" && num(v, "budget") >= 4000) ev.push("think-waste");
    return ev;
  },
  scene: (n): SceneOut => (n === "budget" ? { set: { task: "hard", budget: 6000 }, focus: ["budget"] } : n === "easy" ? { set: { task: "easy", budget: 8000 }, focus: ["task"] } : n === "hard" ? { set: { task: "hard", budget: 10000 }, focus: ["task"] } : undefined),
};

// ------------------------------------------------------------------ structured outputs

const METHODS = {
  prompt: { label: "Ask for JSON in the prompt", bad: 0.06 },
  json: { label: "JSON mode", bad: 0.03 },
  tool: { label: "Tool use with a schema", bad: 0.01 },
  strict: { label: "Constrained decoding to the schema", bad: 0 },
};

export const schemaLab: LabModel = {
  id: "schema-lab",
  metrics: ["failRate", "avgCalls", "extraCostPct"],
  observes: ["retried", "strict"],
  scenes: ["prompt", "tool", "strict"],
  runLabel: "Ship the output contract",
  honest: [
    "Invalid-output rates are illustrative: about 6% when you only ask for JSON in the prompt, 3% for JSON mode (valid syntax, but the schema may be violated), 1% for tool use with a schema, and 0 for constrained decoding. Real rates depend on the model and the schema.",
    "Constrained decoding guarantees that the output parses and matches the schema's types. It cannot guarantee the values are right: a valid JSON object can still hold a wrong answer.",
    "Each retry costs another call; the lab counts that as extra cost. Retries help only when failures are independent between attempts.",
  ],
  init: () => ({ method: "prompt", retries: 0 }),
  controls: () => [
    { kind: "choice", id: "method", label: "How you get the structure", options: Object.entries(METHODS).map(([id, m]) => ({ id, label: m.label })) },
    { kind: "slider", id: "retries", label: "Retries on invalid output", min: 0, max: 3, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const p = METHODS[str(v, "method") as keyof typeof METHODS].bad;
    const r = Math.round(num(v, "retries"));
    const fail = Math.pow(p, r + 1);
    let calls = 0;
    for (let i = 0; i <= r; i++) calls += Math.pow(p, i);
    return {
      metrics: { failRate: fail, avgCalls: calls, extraCostPct: (calls - 1) * 100 },
      readouts: [
        { label: "Requests that end invalid", value: fail, fmt: "pct", tone: fail > 0.01 ? "alert" : fail > 0.001 ? "warn" : "ok" },
        { label: "Calls per request", value: calls, fmt: "num", sub: "average" },
        { label: "Extra cost from retries", value: (calls - 1) * 100, fmt: "num", sub: "percent" },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.07, bars: Object.entries(METHODS).map(([id, m]) => ({ label: m.label, value: m.bad, tone: id === str(v, "method") ? ("amber" as Tone) : ("muted" as Tone), sub: id === str(v, "method") ? "selected: first-try failure rate" : undefined })) },
      notes: [str(v, "method") === "strict" ? "The decoder cannot emit tokens that break the schema, so nothing to retry." : "Failures are rare per call and add up across millions of calls."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "retries") > 0) ev.push("retried");
    if (str(v, "method") === "strict") ev.push("strict");
    return ev;
  },
  scene: (n): SceneOut => (n === "prompt" ? { set: { method: "prompt", retries: 0 }, focus: ["method"] } : n === "tool" ? { set: { method: "tool", retries: 1 }, focus: ["method"] } : n === "strict" ? { set: { method: "strict", retries: 0 }, focus: ["method"] } : undefined),
};

// ------------------------------------------------------------------ prompt caching

export const prefixLab: LabModel = {
  id: "prefix-lab",
  metrics: ["hitRate", "costPerRequest", "savingsPct"],
  observes: ["cached", "broken"],
  scenes: ["stable", "ttl", "order"],
  runLabel: "Ship the prompt layout",
  honest: [
    "Cache reads cost 0.1 times the input price, a 5-minute cache write 1.25 times and a 1-hour cache write 2 times, as in the lesson's reference sheet. Check the provider's current rules.",
    "A request hits the cache if another request with the same prefix arrived within the cache lifetime, and each hit refreshes it. With Poisson arrivals at rate r the hit chance is 1 − e^(−r × lifetime).",
    "Any change to the cached prefix, even a timestamp near the start, means the prefix differs and every request is a miss.",
  ],
  init: (c) => ({ staticTokens: (c as { staticTokens?: number }).staticTokens ?? 10000, dynamicTokens: (c as { dynamicTokens?: number }).dynamicTokens ?? 500, perMin: 0.2, ttl: "5m", dynamicFirst: false }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "slider", id: "perMin", label: "Requests per minute with this prefix", min: 0.02, max: 600, log: true, fmt: "num" },
      { kind: "choice", id: "ttl", label: "Cache lifetime", options: [{ id: "5m", label: "5 minutes", detail: "Writes cost 1.25× input" }, { id: "1h", label: "1 hour", detail: "Writes cost 2× input" }] },
      { kind: "toggle", id: "dynamicFirst", label: "Put a timestamp at the start of the prompt", detail: "Anything that changes every request, before the stable text" },
    ];
    if (!(c as { lockTokens?: boolean }).lockTokens) out.push({ kind: "slider", id: "staticTokens", label: "Stable prefix tokens", min: 500, max: 100000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const S = num(v, "staticTokens");
    const D = num(v, "dynamicTokens");
    const price = TEACHING_PRICES.big.input;
    const life = str(v, "ttl") === "1h" ? 3600 : 300;
    const w = str(v, "ttl") === "1h" ? 2 : 1.25;
    const r = num(v, "perMin") / 60;
    const hit = bool(v, "dynamicFirst") ? 0 : 1 - Math.exp(-r * life);
    const perM = (t: number, mult: number) => (t / 1e6) * price * mult;
    const hitCost = perM(S, TEACHING_CACHE_READ_MULT) + perM(D, 1);
    const missCost = perM(S, bool(v, "dynamicFirst") ? 1 : w) + perM(D, 1);
    const cost = hit * hitCost + (1 - hit) * missCost;
    const plain = perM(S + D, 1);
    return {
      metrics: { hitRate: hit, costPerRequest: cost, savingsPct: (1 - cost / plain) * 100 },
      readouts: [
        { label: "Cache hit rate", value: hit, fmt: "pct", tone: hit > 0.9 ? "ok" : hit > 0.5 ? "warn" : "alert" },
        { label: "Cost per request", value: cost, fmt: "usd", sub: `${(cost * 1000).toFixed(2)} per 1,000` },
        { label: "Saved against no caching", value: (1 - cost / plain) * 100, fmt: "num", sub: "percent", tone: cost < plain ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "usd", bars: [{ label: "No caching", value: plain, tone: "muted" }, { label: "With this layout", value: cost, tone: cost < plain ? ("ok" as Tone) : ("alert" as Tone) }] },
      notes: [bool(v, "dynamicFirst") ? "The prompt changes from the first token, so there is no reusable prefix and nothing to read from the cache." : hit < 0.7 ? "Requests arrive too rarely for the cache to still be warm." : "Most requests find the prefix still cached."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.hitRate! > 0.6) ev.push("cached");
    if (bool(v, "dynamicFirst")) ev.push("broken");
    return ev;
  },
  scene: (n): SceneOut => (n === "stable" ? { set: { dynamicFirst: false, perMin: 6 }, focus: [] } : n === "ttl" ? { set: { perMin: 0.2, ttl: "1h" }, focus: ["ttl", "perMin"] } : n === "order" ? { set: { dynamicFirst: true }, focus: ["dynamicFirst"] } : undefined),
};

// ------------------------------------------------------------------ prompt versioning and regression gates

export const versionLab: LabModel = {
  id: "version-lab",
  metrics: ["power", "falseAlarm", "evalCostUsd", "cases"],
  observes: ["gated", "underpowered"],
  scenes: ["noise", "margin"],
  runLabel: "Set the release gate",
  honest: [
    "The baseline prompt passes 80% of cases. A candidate is either unchanged or five points worse. The same cases are used for both, so their results are correlated and the difference has a standard error of about √(p(1−p) ÷ n).",
    "A candidate ships if its measured score is no more than the margin below the baseline. Power is the chance of blocking a real five-point regression; false alarm is the chance of blocking a candidate that is no worse.",
    "Each test case costs about a cent to run and grade. The normal approximation is rough for small n.",
  ],
  init: () => ({ cases: 50, margin: 0.02 }),
  controls: () => [
    { kind: "slider", id: "cases", label: "Test cases", min: 10, max: 2000, log: true, fmt: "int" },
    { kind: "slider", id: "margin", label: "Allowed drop before blocking", min: 0, max: 0.06, step: 0.005, fmt: "pct", hint: "In score points" },
  ],
  evaluate: (v) => {
    const n = num(v, "cases");
    const m = num(v, "margin");
    const p = 0.8;
    const se = Math.sqrt((p * (1 - p)) / n);
    const power = normCdf((-m + 0.05) / se);
    const falseAlarm = normCdf(-m / se);
    const xs = sweep(10, 2000, 24, true);
    const pw = (x: number) => normCdf((-m + 0.05) / Math.sqrt((p * (1 - p)) / x));
    const fa = (x: number) => normCdf(-m / Math.sqrt((p * (1 - p)) / x));
    return {
      metrics: { power, falseAlarm, evalCostUsd: n * 0.01, cases: n },
      readouts: [
        { label: "Regressions caught", value: power, fmt: "pct", tone: power >= 0.8 ? "ok" : power >= 0.6 ? "warn" : "alert" },
        { label: "Good prompts wrongly blocked", value: falseAlarm, fmt: "pct", tone: falseAlarm <= 0.1 ? "ok" : "alert" },
        { label: "Cost of one eval run", value: n * 0.01, fmt: "usd" },
        { label: "Noise in the measured difference", value: se, fmt: "pct", sub: "standard error" },
      ],
      view: { kind: "curve", xLabel: "test cases", yLabel: "probability", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "power", label: "Regression caught", tone: "ok", points: xs.map((x) => [x, pw(x)] as [number, number]) }, { id: "fa", label: "Good prompt blocked", tone: "alert", points: xs.map((x) => [x, fa(x)] as [number, number]) }], marker: { x: n, y: power, label: `${(power * 100).toFixed(0)}% caught`, tone: "amber" }, hLines: [{ y: 0.8, label: "80% caught", tone: "info" }] },
      notes: ["With few cases the difference is mostly noise, so a gate either misses regressions or blocks good prompts."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.power! >= 0.8 && out.metrics.falseAlarm! <= 0.1) ev.push("gated");
    if (num(v, "cases") <= 30) ev.push("underpowered");
    return ev;
  },
  scene: (n): SceneOut => (n === "noise" ? { set: { cases: 20, margin: 0.02 }, focus: ["cases"] } : n === "margin" ? { set: { cases: 400, margin: 0.03 }, focus: ["margin"] } : undefined),
};

export const B3_MODELS: LabModel[] = [promptLab, structureLab, thinkLab, schemaLab, prefixLab, versionLab];
