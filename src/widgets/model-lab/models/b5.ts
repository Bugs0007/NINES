/**
 * Chapter B5 "Evals" models: building eval sets, code graders, LLM judges, prompt regression, offline versus online
 * evaluation, and the ship-the-prompt boss. Normal-approximation statistics and labelled round constants; see each
 * model's `honest` text.
 */
import { normCdf } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ eval sets

const MODES = [0.4, 0.25, 0.15, 0.1, 0.07, 0.03];

export const evalsetLab: LabModel = {
  id: "evalset-lab",
  metrics: ["marginPts", "uncovered", "inflationPts", "labelCost"],
  observes: ["wide-margin", "blind-spot"],
  scenes: ["size", "strata", "leak"],
  runLabel: "Build the set",
  honest: [
    "A summariser with six kinds of input, which occur in production in these shares: 40%, 25%, 15%, 10%, 7% and 3%. Its true pass rate is about 80%. A set of N independent examples measures that rate to within ±1.96 × √(0.8 × 0.2 ÷ N).",
    "A kind is 'covered' if the set holds at least 10 examples of it. A random sample of N has N × share of each; a stratified set gives each kind N ÷ 6. The 3% kind is the rare, awkward one. Examples written by hand, with no real traffic, miss two further kinds that only real users produce.",
    "If examples from the eval set also appear in the prompt as demonstrations, the score is inflated by about 15 points. Labelling costs $2 an example.",
  ],
  init: () => ({ n: 100, strat: false, real: false, leak: true }),
  controls: () => [
    { kind: "slider", id: "n", label: "Examples", min: 10, max: 5000, log: true, fmt: "int" },
    { kind: "toggle", id: "strat", label: "Stratified: equal numbers of each kind" },
    { kind: "toggle", id: "real", label: "Sampled from real traffic, not only written by hand" },
    { kind: "toggle", id: "leak", label: "Eval examples also used as prompt demonstrations" },
  ],
  evaluate: (v) => {
    const n = Math.round(num(v, "n"));
    const margin = 1.96 * Math.sqrt(0.16 / n) * 100;
    const strat = bool(v, "strat");
    let unc = MODES.filter((s) => (strat ? n / 6 : n * s) < 10).length;
    if (!bool(v, "real")) unc += 2;
    const infl = bool(v, "leak") ? 15 : 0;
    const cost = n * 2;
    return {
      metrics: { marginPts: margin, uncovered: unc, inflationPts: infl, labelCost: cost },
      readouts: [
        { label: "Score is accurate to about", value: margin, fmt: "num", sub: "points either way", tone: tone(margin, 3, 6) },
        { label: "Kinds of input with fewer than 10 examples", value: unc, fmt: "int", tone: unc ? "alert" : "ok" },
        { label: "Score inflated by leakage", value: infl, fmt: "num", sub: "points", tone: infl ? "alert" : "ok" },
        { label: "Cost to label", value: cost, fmt: "usd", tone: cost > 2000 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Margin, points", value: margin, tone: tone(margin, 3, 6) }, { label: "Blind spots", value: unc, tone: unc ? "alert" : "ok" }, { label: "Leak inflation", value: infl, tone: infl ? "alert" : "ok" }] },
      notes: [infl ? "The set is partly in the prompt, so the model is graded on questions it was shown the answers to." : unc ? "Some kinds of input are not tested at all, so regressions there are invisible." : margin > 5 ? "The score moves by more than a prompt change usually does." : "The set is big enough to be believed and wide enough to be fair."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.marginPts! > 6) ev.push("wide-margin");
    if (out.metrics.uncovered! > 0) ev.push("blind-spot");
    return ev;
  },
  scene: (n): SceneOut => (n === "size" ? { set: { n: 30 }, focus: ["n"] } : n === "strata" ? { set: { strat: true, real: true, n: 600 }, focus: ["strat"] } : n === "leak" ? { set: { leak: true }, focus: ["leak"] } : undefined),
};

// ------------------------------------------------------------------ code graders

const GRADERS: Record<string, { label: string; ff: number; fp: number; normalisable: boolean }> = {
  exact: { label: "Exact string match", ff: 0.22, fp: 0, normalisable: true },
  contains: { label: "Output contains the expected string", ff: 0.03, fp: 0.12, normalisable: true },
  regex: { label: "Regular expression for the pattern", ff: 0.08, fp: 0.03, normalisable: true },
  schema: { label: "Valid JSON that matches the schema", ff: 0.005, fp: 0.4, normalisable: false },
  numeric: { label: "Parse the number and compare with a tolerance", ff: 0.015, fp: 0.005, normalisable: false },
};

export const graderLab: LabModel = {
  id: "grader-lab",
  metrics: ["falseFailPct", "falsePassPct", "msPer1k"],
  observes: ["brittle", "lenient"],
  scenes: ["exact", "shape", "numeric"],
  runLabel: "Choose the grader",
  honest: [
    "A task that extracts the invoice total from messy text. Humans grade 1,000 outputs and the grader is compared with them. A false fail is a correct answer the grader rejects ('1,204.50' against '1204.5'); a false pass is a wrong answer it accepts.",
    "Exact match is strict and brittle: 22% false fails. Contains is lenient: 12% false passes ('1,204.50' matches inside '11,204.50'). A schema check passes anything well-formed: 40% false passes. Parsing and comparing numbers is the most accurate here. Normalising first (trim, lower-case, strip separators) removes 70% of false fails for the string graders.",
    "Code graders cost nothing in model calls and run in about a millisecond.",
  ],
  init: () => ({ g: "exact", norm: false }),
  controls: () => [
    { kind: "choice", id: "g", label: "Grader", options: Object.entries(GRADERS).map(([id, t]) => ({ id, label: t.label })) },
    { kind: "toggle", id: "norm", label: "Normalise text before comparing" },
  ],
  evaluate: (v) => {
    const t = GRADERS[str(v, "g")]!;
    const ff = t.ff * (bool(v, "norm") && t.normalisable ? 0.3 : 1);
    return {
      metrics: { falseFailPct: ff, falsePassPct: t.fp, msPer1k: 1000 },
      readouts: [
        { label: "Correct answers it rejects", value: ff, fmt: "pct", tone: tone(ff, 0.02, 0.1) },
        { label: "Wrong answers it accepts", value: t.fp, fmt: "pct", tone: tone(t.fp, 0.01, 0.1) },
        { label: "Cost to grade 1,000", value: "$0, about a second" },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.5, bars: [{ label: "False fails", value: ff, tone: tone(ff, 0.02, 0.1) }, { label: "False passes", value: t.fp, tone: tone(t.fp, 0.01, 0.1) }] },
      notes: [t.fp > 0.1 ? "It passes answers that merely look right." : ff > 0.1 ? "It fails answers that are right but written differently." : "Close to what a person would say."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.falseFailPct! > 0.1) ev.push("brittle");
    if (out.metrics.falsePassPct! > 0.1) ev.push("lenient");
    return ev;
  },
  scene: (n): SceneOut => (n === "exact" ? { set: { g: "exact", norm: false }, focus: ["g"] } : n === "shape" ? { set: { g: "schema" }, focus: ["g"] } : n === "numeric" ? { set: { g: "numeric" }, focus: ["g"] } : undefined),
};

// ------------------------------------------------------------------ LLM as judge

export const judgeLab: LabModel = {
  id: "judge-lab",
  metrics: ["agreement", "biasPts", "costPer1k", "measured"],
  observes: ["biased", "unmeasured"],
  scenes: ["bias", "rubric", "calibrate"],
  runLabel: "Set up the judge",
  honest: [
    "A model grades answers against humans' labels. A small judge agrees with humans on 68% of cases with a vague instruction and a large one on 78%; a detailed rubric adds 8 points and a few worked examples 4. Judges favour whichever answer comes first (position bias, about 6 points) and longer answers; showing both orders and requiring they agree removes the position effect and adds 3 points.",
    "Agreement is only known if you grade a sample of 200 by hand and compare. An uncalibrated judge may be anywhere in its range. Cost for 1,000 judgments, with 1,500 tokens in and 300 out at the teaching prices: small $3.00, large $6.00; showing both orders doubles it.",
    "Round figures for comparison.",
  ],
  init: () => ({ model: "small", rubric: "vague", shots: false, swap: false, calibrate: false }),
  controls: () => [
    { kind: "choice", id: "model", label: "Judge model", options: [{ id: "small", label: "Small, cheap" }, { id: "large", label: "Large, careful" }] },
    { kind: "choice", id: "rubric", label: "Instruction", options: [{ id: "vague", label: "'Is this a good answer?'" }, { id: "detailed", label: "A detailed rubric with scored criteria" }] },
    { kind: "toggle", id: "shots", label: "Include a few worked examples" },
    { kind: "toggle", id: "swap", label: "Judge both orders and require agreement" },
    { kind: "toggle", id: "calibrate", label: "Check against 200 hand-graded cases" },
  ],
  evaluate: (v) => {
    let a = str(v, "model") === "large" ? 78 : 68;
    if (str(v, "rubric") === "detailed") a += 8;
    if (bool(v, "shots")) a += 4;
    const swap = bool(v, "swap");
    if (swap) a += 3;
    const bias = swap ? 0 : 6;
    const base = str(v, "model") === "large" ? 6 : 3;
    const cost = base * (swap ? 2 : 1);
    const measured = bool(v, "calibrate") ? 1 : 0;
    return {
      metrics: { agreement: a / 100, biasPts: bias, costPer1k: cost, measured },
      readouts: [
        { label: "Agreement with human graders", value: a / 100, fmt: "pct", tone: a < 80 ? "alert" : a < 85 ? "warn" : "ok" },
        { label: "Position bias", value: bias, fmt: "num", sub: "points", tone: bias ? "warn" : "ok" },
        { label: "Cost per 1,000 judgments", value: cost, fmt: "usd" },
        { label: "Agreement has been measured", value: measured ? "yes" : "no", tone: measured ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Agreement with humans", value: a / 100, tone: a < 80 ? "alert" : a < 85 ? "warn" : "ok" }] },
      notes: [!measured ? "Nobody knows how far this judge can be trusted." : bias ? "The judge likes whichever answer it reads first." : a >= 85 ? "A judge worth building a gate on." : "Better than a coin and not yet good enough to gate on."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.biasPts! > 3) ev.push("biased");
    if (out.metrics.measured! < 1) ev.push("unmeasured");
    return ev;
  },
  scene: (n): SceneOut => (n === "bias" ? { set: { swap: true }, focus: ["swap"] } : n === "rubric" ? { set: { rubric: "detailed", shots: true }, focus: ["rubric", "shots"] } : n === "calibrate" ? { set: { calibrate: true }, focus: ["calibrate"] } : undefined),
};

// ------------------------------------------------------------------ prompt regression

export const regressLab: LabModel = {
  id: "regress-lab",
  metrics: ["detectProb", "falseAlarmProb", "costPerRun", "sePts"],
  observes: ["missed", "cry-wolf"],
  scenes: ["power", "paired", "threshold"],
  runLabel: "Set the gate",
  honest: [
    "The current prompt passes about 85% of cases. A candidate that is really 4 points worse is run on the same suite. The difference between two pass rates measured on N independent cases has a standard error of √(2 × 0.85 × 0.15 ÷ N); running both prompts on the same cases pairs them and cuts it to 0.71 of that.",
    "The gate blocks the change if the measured drop exceeds a threshold. Detect probability is the chance a real 4-point drop is blocked; false alarm is the chance a no-change prompt is blocked. Each case costs $0.003 to run.",
    "Normal approximation; it ignores case-by-case dependence beyond pairing.",
  ],
  init: () => ({ n: 100, paired: false, t: 4 }),
  controls: () => [
    { kind: "slider", id: "n", label: "Cases in the suite", min: 50, max: 5000, log: true, fmt: "int" },
    { kind: "toggle", id: "paired", label: "Run both prompts on the same cases and compare per case" },
    { kind: "slider", id: "t", label: "Block the change if the score drops by more than", min: 0.5, max: 10, step: 0.1, fmt: "num", hint: "points" },
  ],
  evaluate: (v) => {
    const n = Math.round(num(v, "n"));
    const se = Math.sqrt((2 * 0.1275) / n) * 100 * (bool(v, "paired") ? Math.SQRT1_2 : 1);
    const t = num(v, "t");
    const detect = 1 - normCdf((t - 4) / se);
    const fa = 1 - normCdf(t / se);
    const cost = n * 0.003;
    return {
      metrics: { detectProb: detect, falseAlarmProb: fa, costPerRun: cost, sePts: se },
      readouts: [
        { label: "Chance a real 4-point drop is blocked", value: detect, fmt: "pct", tone: detect < 0.5 ? "alert" : detect < 0.85 ? "warn" : "ok" },
        { label: "Chance an unchanged prompt is blocked", value: fa, fmt: "pct", tone: fa > 0.2 ? "alert" : fa > 0.05 ? "warn" : "ok" },
        { label: "Noise in the measured difference", value: se, fmt: "num", sub: "points" },
        { label: "Cost of one run", value: cost, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Real drop caught", value: detect, tone: detect < 0.85 ? "warn" : "ok" }, { label: "False alarm", value: fa, tone: fa > 0.05 ? "warn" : "ok" }] },
      notes: [se > 3 ? "The noise is bigger than the change being hunted." : fa > 0.2 ? "The gate cries wolf, and people will stop believing it." : detect < 0.5 ? "The gate lets most real regressions through." : "Sensitive, and rarely wrong when nothing changed."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.detectProb! < 0.6) ev.push("missed");
    if (out.metrics.falseAlarmProb! > 0.2) ev.push("cry-wolf");
    return ev;
  },
  scene: (n): SceneOut => (n === "power" ? { set: { n: 200 }, focus: ["n"] } : n === "paired" ? { set: { paired: true }, focus: ["paired"] } : n === "threshold" ? { set: { t: 2.2 }, focus: ["t"] } : undefined),
};

// ------------------------------------------------------------------ offline vs online

export const onoffLab: LabModel = {
  id: "onoff-lab",
  metrics: ["missProb", "harmedUsers", "days"],
  observes: ["shipped-bad", "users-hurt"],
  scenes: ["offline", "shadow", "guardrail"],
  runLabel: "Plan the rollout",
  honest: [
    "20,000 users a day. A candidate prompt is worse by 8 points for a slice that is 30% of traffic and that the offline suite does not cover. Detecting an effect of this size in a live test needs about 9,600 users per arm; of those, 30% are in the slice, so about 2,880 people see the worse prompt before the test can decide.",
    "Offline-only never sees the slice (it misses 100% of the time). Shadow runs the candidate on copies of real traffic and grades the output with a judge, catching 85% of such regressions without any user seeing it. A live canary or A/B test catches 95%. A shadow stage before the live test means only the 15% of bad candidates that pass shadow ever reach users.",
    "A guardrail on the slice's metric stops the test after about a tenth of the planned sample. A bad candidate that ships undetected hurts 30% of 20,000 users for about 7 days: 42,000 user-days.",
  ],
  init: () => ({ method: "offline", share: 5, shadowFirst: false, guard: false }),
  controls: () => [
    { kind: "choice", id: "method", label: "How the change is tested", options: [{ id: "offline", label: "Offline suite only" }, { id: "shadow", label: "Shadow traffic, judged offline" }, { id: "canary", label: "Live canary on a share of users" }, { id: "ab", label: "Live A/B test at 50%" }] },
    { kind: "slider", id: "share", label: "Canary share of users", min: 1, max: 50, log: true, fmt: "num", hint: "percent" },
    { kind: "toggle", id: "shadowFirst", label: "Run shadow first, then go live" },
    { kind: "toggle", id: "guard", label: "Stop the live test when a slice drops sharply" },
  ],
  evaluate: (v) => {
    const m = str(v, "method");
    const live = m === "canary" || m === "ab";
    const share = m === "ab" ? 0.5 : num(v, "share") / 100;
    const miss = m === "offline" ? 1 : m === "shadow" ? 0.15 : bool(v, "shadowFirst") ? 0.15 * 0.05 : 0.05;
    const reach = bool(v, "shadowFirst") ? 0.15 : 1;
    const testHarm = live ? reach * 2880 * (bool(v, "guard") ? 0.1 : 1) : 0;
    const harmed = testHarm + miss * 42000;
    const days = (m === "offline" ? 0.1 : m === "shadow" ? 1 : 9600 / (20000 * share)) + (live && bool(v, "shadowFirst") ? 1 : 0);
    return {
      metrics: { missProb: miss, harmedUsers: harmed, days },
      readouts: [
        { label: "Chance a bad prompt ships", value: miss, fmt: "pct", tone: miss > 0.5 ? "alert" : miss > 0.05 ? "warn" : "ok" },
        { label: "Users expected to be hurt", value: harmed, fmt: "int", tone: tone(harmed, 1000, 5000) },
        { label: "Days to decide", value: days, fmt: "num", tone: days > 14 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Users hurt (expected)", value: harmed, tone: tone(harmed, 1000, 5000) }] },
      notes: [m === "offline" ? "The suite does not cover the slice, so a bad prompt walks straight through." : live && !bool(v, "guard") ? "A live test is honest, and the people in it are the experiment." : bool(v, "guard") ? "The test stops itself before many people see the problem." : "Real traffic with no user at risk, judged by a model."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.missProb! > 0.5) ev.push("shipped-bad");
    if (out.metrics.harmedUsers! > 4000) ev.push("users-hurt");
    return ev;
  },
  scene: (n): SceneOut => (n === "offline" ? { set: { method: "offline" }, focus: ["method"] } : n === "shadow" ? { set: { method: "shadow" }, focus: ["method"] } : n === "guardrail" ? { set: { method: "canary", shadowFirst: true, guard: true }, focus: ["guard"] } : undefined),
};

// ------------------------------------------------------------------ ship the prompt (boss)

export const shipLab: LabModel = {
  id: "ship-lab",
  metrics: ["shipBadProb", "falseBlockProb", "harmedUsers", "costPerRun", "days"],
  observes: [],
  scenes: ["suite", "gate", "rollout"],
  runLabel: "Run the gate",
  honest: [
    "A new prompt is really 4 points worse: 1 point from formatting mistakes a code check can see and 3 from quality a judge can see. The gate compares scores on a suite and blocks if the drop exceeds the threshold. Noise comes from the suite size (standard error √(2 × 0.85 × 0.15 ÷ N), 0.71 of that if both prompts are run on the same cases) and from the judge (1 point of extra noise; a judge checked against hand-graded cases sees 85% of the quality drop, and an unchecked one only 40%).",
    "A live canary catches 95% of what the offline gate lets through and exposes about 2,880 users, 288 with a guardrail. A bad prompt that ships undetected hurts 42,000 user-days. A code check costs $0.0005 a case, the judge $0.003 a case. The canary takes 7 days.",
    "Normal approximation throughout.",
  ],
  init: () => ({ n: 100, code: false, judge: false, calibrated: false, paired: false, t: 4, canary: false, guard: false }),
  controls: () => [
    { kind: "slider", id: "n", label: "Cases in the suite", min: 50, max: 5000, log: true, fmt: "int" },
    { kind: "toggle", id: "code", label: "Code checks for format" },
    { kind: "toggle", id: "judge", label: "LLM judge for quality" },
    { kind: "toggle", id: "calibrated", label: "Judge checked against hand-graded cases" },
    { kind: "toggle", id: "paired", label: "Both prompts on the same cases" },
    { kind: "slider", id: "t", label: "Block if the score drops by more than", min: 0.5, max: 10, step: 0.1, fmt: "num", hint: "points" },
    { kind: "toggle", id: "canary", label: "Live canary after the gate" },
    { kind: "toggle", id: "guard", label: "Guardrail stops the canary early" },
  ],
  evaluate: (v) => {
    const n = Math.round(num(v, "n"));
    const code = bool(v, "code");
    const judge = bool(v, "judge");
    const delta = (code ? 1 : 0) + (judge ? 3 * (bool(v, "calibrated") ? 0.85 : 0.4) : 0);
    const seBase = Math.sqrt((2 * 0.1275) / n) * 100 * (bool(v, "paired") ? Math.SQRT1_2 : 1);
    const se = Math.sqrt(seBase * seBase + (judge ? 1 : 0));
    const t = num(v, "t");
    const detect = 1 - normCdf((t - delta) / se);
    const fa = 1 - normCdf(t / se);
    const canary = bool(v, "canary");
    const gateMiss = 1 - detect;
    const ship = gateMiss * (canary ? 0.05 : 1);
    const testHarm = canary ? gateMiss * 2880 * (bool(v, "guard") ? 0.1 : 1) : 0;
    const harmed = testHarm + ship * 42000;
    const cost = n * ((code ? 0.0005 : 0) + (judge ? 0.003 : 0));
    const days = 0.2 + (canary ? 7 : 0);
    return {
      metrics: { shipBadProb: ship, falseBlockProb: fa, harmedUsers: harmed, costPerRun: cost, days },
      readouts: [
        { label: "Chance the bad prompt ships", value: ship, fmt: "pct", tone: ship > 0.05 ? "alert" : ship > 0.02 ? "warn" : "ok" },
        { label: "Chance a good prompt is blocked", value: fa, fmt: "pct", tone: fa > 0.2 ? "alert" : fa > 0.1 ? "warn" : "ok" },
        { label: "Users expected to be hurt", value: harmed, fmt: "int", tone: tone(harmed, 1500, 5000) },
        { label: "Cost of one gate run", value: cost, fmt: "usd" },
        { label: "Days to ship", value: days, fmt: "num" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Bad prompt ships", value: ship, tone: ship > 0.02 ? "alert" : "ok" }, { label: "Good prompt blocked", value: fa, tone: fa > 0.1 ? "alert" : "ok" }] },
      notes: [!code && !judge ? "With no grader the gate has nothing to measure." : se > 2.5 ? "The score is too noisy to see a four-point change." : "The gate can see the change it is hunting."],
    };
  },
  scene: (n): SceneOut => (n === "suite" ? { set: { n: 1500, paired: true }, focus: ["n", "paired"] } : n === "gate" ? { set: { code: true, judge: true, calibrated: true, t: 2 }, focus: ["judge", "calibrated"] } : n === "rollout" ? { set: { canary: true, guard: true }, focus: ["canary", "guard"] } : undefined),
};

export const B5_MODELS: LabModel[] = [evalsetLab, graderLab, judgeLab, regressLab, onoffLab, shipLab];
