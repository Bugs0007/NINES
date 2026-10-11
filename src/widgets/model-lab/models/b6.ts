/**
 * Chapter B6 "Agents" models: tool calling, the agent loop, ReAct, planning, memory, failure modes, human in the
 * loop, workflows versus agents, orchestrator-worker, parallelisation, multi-agent patterns, and the meltdown boss.
 * Closed forms and small numeric integrals with labelled round constants (see each model's `honest` text).
 */
import { TEACHING_CACHE_READ_MULT, TEACHING_PRICES } from "../../../content/prices";
import { lognormal } from "../math";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const P_IN = TEACHING_PRICES.big.input / 1e6;
const P_OUT = TEACHING_PRICES.big.output / 1e6;

// ------------------------------------------------------------------ tool calling

export const toolcallLab: LabModel = {
  id: "toolcall-lab",
  metrics: ["selectionAcc", "argValid", "toolTokens", "costPer1k"],
  observes: ["confused", "bad-args"],
  scenes: ["schema", "count", "retrieve"],
  runLabel: "Design the tool set",
  honest: [
    "An agent with a catalogue of tools, each described to the model in a JSON schema. The model must pick the right tool and fill its arguments. With up to 5 tools in view, selection is right 99% of the time; each further tool in view costs 0.8 points. Vague one-line descriptions cut accuracy by 12%; clear ones with examples cost 220 tokens a tool instead of 120.",
    "A schema with enums, required fields and descriptions makes 98.5% of argument sets valid; a loose one with free-text fields 88%. Retrieving the 8 most relevant tools for each request (tool search) keeps the number in view small.",
    "Cost per 1,000 calls counts only the tool definitions sent as input at the teaching price of $2 per million tokens.",
  ],
  init: (c) => ({ count: (c as { count?: number }).count ?? 40, clear: false, strict: false, retrieve: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockCount?: boolean }).lockCount) out.push({ kind: "slider", id: "count", label: "Tools in the catalogue", min: 2, max: 80, step: 1, fmt: "int" });
    out.push({ kind: "toggle", id: "clear", label: "Clear descriptions with examples" }, { kind: "toggle", id: "strict", label: "Strict schemas: enums, required fields" }, { kind: "toggle", id: "retrieve", label: "Show only the 8 most relevant tools per request" });
    return out;
  },
  evaluate: (v) => {
    const count = Math.round(num(v, "count"));
    const shown = bool(v, "retrieve") ? Math.min(count, 8) : count;
    const clear = bool(v, "clear");
    const acc = Math.max(0.3, 0.99 - 0.008 * Math.max(0, shown - 5)) * (clear ? 1 : 0.88);
    const argv = bool(v, "strict") ? 0.985 : 0.88;
    const tokens = shown * (clear ? 220 : 120);
    const cost = tokens * P_IN * 1000;
    return {
      metrics: { selectionAcc: acc, argValid: argv, toolTokens: tokens, costPer1k: cost },
      readouts: [
        { label: "Right tool chosen", value: acc, fmt: "pct", tone: acc < 0.9 ? "alert" : acc < 0.95 ? "warn" : "ok" },
        { label: "Arguments valid", value: argv, fmt: "pct", tone: argv < 0.95 ? "alert" : "ok" },
        { label: "Tool definition tokens per call", value: tokens, fmt: "int", tone: tone(tokens, 3000, 6000) },
        { label: "Definitions cost per 1,000 calls", value: cost, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Right tool", value: acc, tone: acc < 0.95 ? "warn" : "ok" }, { label: "Valid arguments", value: argv, tone: argv < 0.95 ? "warn" : "ok" }] },
      notes: [shown > 20 ? "With dozens of tools in view the model confuses similar ones." : !bool(v, "strict") ? "Loose schemas let free-text arguments through that the tool cannot use." : "A small, well-described set with tight schemas."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.selectionAcc! < 0.85) ev.push("confused");
    if (out.metrics.argValid! < 0.9) ev.push("bad-args");
    return ev;
  },
  scene: (n): SceneOut => (n === "schema" ? { set: { strict: true }, focus: ["strict"] } : n === "count" ? { set: { retrieve: false }, focus: ["retrieve"] } : n === "retrieve" ? { set: { retrieve: true, clear: true }, focus: ["retrieve", "clear"] } : undefined),
};

// ------------------------------------------------------------------ the agent loop

const STEPS = lognormal(6, 30);

function loopCost(n: number, obs: number, cache: boolean): number {
  const base = 2000;
  let c = 0;
  for (let k = 1; k <= n; k++) {
    const ctx = base + (k - 1) * (obs + 300);
    const fresh = k === 1 ? ctx : obs + 300;
    const prefix = k === 1 ? 0 : ctx - fresh;
    const inCost = (cache ? prefix * TEACHING_CACHE_READ_MULT : prefix) + fresh;
    c += inCost * P_IN + 300 * P_OUT;
  }
  return c;
}

export function loopRun(cap: number, trunc: boolean, cache: boolean) {
  const obs = trunc ? 300 : 3000;
  const q = 400;
  let eCost = 0;
  let eSteps = 0;
  for (let i = 0; i < q; i++) {
    const s = Math.min(cap, Math.max(1, Math.round(STEPS.quantile((i + 0.5) / q))));
    eCost += loopCost(s, obs, cache) / q;
    eSteps += s / q;
  }
  const worst = loopCost(cap, obs, cache);
  const success = 0.95 * STEPS.cdf(cap + 0.5);
  return { success, cost: 0.95 * eCost + 0.05 * worst, steps: 0.95 * eSteps + 0.05 * cap, worst };
}

export const loopLab: LabModel = {
  id: "loop-lab",
  metrics: ["successRate", "costPerTask", "avgSteps", "worstCost"],
  observes: ["cut-short", "runaway"],
  scenes: ["cap", "context", "cache"],
  runLabel: "Set up the loop",
  honest: [
    "An agent loops: model call, tool call, observation, repeat. The number of steps a task needs is lognormal with a median of 6 and a 99th percentile of 30. 5% of tasks never finish by themselves (a stuck loop) and run until the step cap.",
    "Each step adds the model's 300-token output and the tool's observation to the context, so the input grows with every step and the total tokens grow with the square of the steps. Raw observations are 3,000 tokens; truncated or summarised ones 300. The system prompt and tools start the context at 2,000 tokens. Prices are the teaching prices: $2 per million input, $10 per million output; cached prefix reads cost a tenth.",
    "Success is the finishing share of tasks reached within the cap.",
  ],
  init: () => ({ cap: 50, trunc: false, cache: false }),
  controls: () => [
    { kind: "slider", id: "cap", label: "Maximum steps", min: 1, max: 60, step: 1, fmt: "int" },
    { kind: "toggle", id: "trunc", label: "Truncate observations to 300 tokens" },
    { kind: "toggle", id: "cache", label: "Cache the conversation prefix" },
  ],
  evaluate: (v) => {
    const r = loopRun(Math.round(num(v, "cap")), bool(v, "trunc"), bool(v, "cache"));
    return {
      metrics: { successRate: r.success, costPerTask: r.cost, avgSteps: r.steps, worstCost: r.worst },
      readouts: [
        { label: "Tasks finished", value: r.success, fmt: "pct", tone: r.success < 0.8 ? "alert" : r.success < 0.9 ? "warn" : "ok" },
        { label: "Cost per task", value: r.cost, fmt: "usd", tone: tone(r.cost, 0.1, 0.5) },
        { label: "Cost of the worst case (hits the cap)", value: r.worst, fmt: "usd", tone: tone(r.worst, 0.5, 2) },
        { label: "Average steps", value: r.steps, fmt: "num" },
      ],
      view: { kind: "bars", fmt: "usd", bars: [{ label: "Average task", value: r.cost, tone: tone(r.cost, 0.1, 0.5) }, { label: "Stuck task", value: r.worst, tone: tone(r.worst, 0.5, 2) }] },
      notes: [r.success < 0.85 ? "The cap cuts off tasks that would have finished." : r.worst > 1 ? "A stuck run is expensive, because every step re-reads everything before it." : "The cap leaves room for real tasks and limits the stuck ones."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.successRate! < 0.6) ev.push("cut-short");
    if (out.metrics.worstCost! > 2) ev.push("runaway");
    return ev;
  },
  scene: (n): SceneOut => (n === "cap" ? { set: { cap: 20 }, focus: ["cap"] } : n === "context" ? { set: { trunc: true }, focus: ["trunc"] } : n === "cache" ? { set: { cache: true }, focus: ["cache"] } : undefined),
};

// ------------------------------------------------------------------ ReAct

const REACT: Record<string, { label: string; acc: number; hall: number; tok: number }> = {
  direct: { label: "Answer directly from memory", acc: 0.38, hall: 0.45, tok: 300 },
  cot: { label: "Reason step by step, no tools", acc: 0.52, hall: 0.35, tok: 900 },
  act: { label: "Call tools with no reasoning shown", acc: 0.61, hall: 0.12, tok: 1800 },
  react: { label: "ReAct: reason, act, observe, repeat", acc: 0.78, hall: 0.06, tok: 2600 },
};

export const reactLab: LabModel = {
  id: "react-lab",
  metrics: ["accuracy", "hallucination", "tokens", "usd1k"],
  observes: ["invented", "blind-tools"],
  scenes: ["direct", "react", "verify"],
  runLabel: "Choose the pattern",
  honest: [
    "A multi-hop question that needs facts from a search tool, such as 'Which of the founders of the company that makes X was born in a city with a population over a million?'. In the lab: answering directly gets 38% right, with 45% of answers invented; reasoning without tools 52%, 35% invented; calling tools without reasoning 61%, 12%; and ReAct, which alternates a thought, a tool call and the observation, 78% right and 6% invented.",
    "Verifying that the final answer is supported by the retrieved text adds 4 points of accuracy and cuts invented answers by 1.5 points, for 400 more tokens, in the lab.",
    "Token counts are per question; the dollar figure is per 1,000 questions at $2 per million tokens.",
  ],
  init: () => ({ mode: "direct", verify: false }),
  controls: () => [
    { kind: "choice", id: "mode", label: "Pattern", options: Object.entries(REACT).map(([id, t]) => ({ id, label: t.label })) },
    { kind: "toggle", id: "verify", label: "Check the answer against the retrieved text" },
  ],
  evaluate: (v) => {
    const t = REACT[str(v, "mode")]!;
    const ver = bool(v, "verify") && str(v, "mode") !== "direct" && str(v, "mode") !== "cot";
    const acc = t.acc + (ver ? 0.04 : 0);
    const hall = Math.max(0, t.hall - (ver ? 0.015 : 0));
    const tokens = t.tok + (ver ? 400 : 0);
    return {
      metrics: { accuracy: acc, hallucination: hall, tokens, usd1k: tokens * P_IN * 1000 },
      readouts: [
        { label: "Right answers", value: acc, fmt: "pct", tone: acc < 0.6 ? "alert" : acc < 0.8 ? "warn" : "ok" },
        { label: "Answers invented", value: hall, fmt: "pct", tone: hall > 0.1 ? "alert" : hall > 0.05 ? "warn" : "ok" },
        { label: "Tokens per question", value: tokens, fmt: "int" },
        { label: "Cost per 1,000 questions", value: tokens * P_IN * 1000, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Right", value: acc, tone: "ok" }, { label: "Invented", value: hall, tone: hall > 0.05 ? "alert" : "ok" }] },
      notes: [str(v, "mode") === "direct" ? "The model answers from whatever it remembers, confidently." : str(v, "mode") === "act" ? "It fetches, but without thinking about what to fetch next." : str(v, "mode") === "react" ? "Each observation changes the next thought." : "Thinking helps, and nothing is checked against the world."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.hallucination! > 0.3) ev.push("invented");
    if (str(v, "mode") === "act") ev.push("blind-tools");
    return ev;
  },
  scene: (n): SceneOut => (n === "direct" ? { set: { mode: "direct" }, focus: ["mode"] } : n === "react" ? { set: { mode: "react" }, focus: ["mode"] } : n === "verify" ? { set: { mode: "react", verify: true }, focus: ["verify"] } : undefined),
};

// ------------------------------------------------------------------ planning

function binomLeq(n: number, p: number, r: number): number {
  let s = 0;
  let c = 1;
  for (let k = 0; k <= r; k++) {
    if (k > 0) c = (c * (n - k + 1)) / k;
    s += c * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  return s;
}

export const agentPlanLab: LabModel = {
  id: "agentplan-lab",
  metrics: ["success", "steps", "costUsd"],
  observes: ["derailed", "brittle-plan"],
  scenes: ["none", "fixed", "replan"],
  runLabel: "Run the plan",
  honest: [
    "A task of 10 steps, each failing independently 8% of the time (a tool error, a wrong result). With no plan the agent decides step by step, wanders on 50% more steps and finishes correctly about 55% of the time. A fixed plan executes the 10 steps and abandons the task at the first failure: 0.92¹⁰, 43%.",
    "With replanning the agent notices a failed step, revises the remaining plan, and carries on, up to a set number of times. Each replan costs 1.5 steps' worth of tokens. Success is the chance of at most that many failures in 10 steps. A step costs $0.02.",
    "Failures are independent here, and a replan always works if the budget allows it.",
  ],
  init: () => ({ style: "none", replans: 0 }),
  controls: () => [
    { kind: "choice", id: "style", label: "Planning", options: [{ id: "none", label: "No plan: decide each step as you go" }, { id: "fixed", label: "Plan upfront, execute as written" }, { id: "replan", label: "Plan upfront and revise on failure" }] },
    { kind: "slider", id: "replans", label: "Replans allowed", min: 0, max: 6, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const s = str(v, "style");
    const r = s === "replan" ? Math.round(num(v, "replans")) : 0;
    let success = 0.55;
    let steps = 15;
    if (s !== "none") {
      success = binomLeq(10, 0.08, r);
      steps = r === 0 ? 10 - (1 - success) * 4 : 10 + 0.8 * 1.5;
    }
    return {
      metrics: { success, steps, costUsd: steps * 0.02 },
      readouts: [
        { label: "Tasks completed", value: success, fmt: "pct", tone: success < 0.8 ? "alert" : success < 0.97 ? "warn" : "ok" },
        { label: "Steps used", value: steps, fmt: "num", tone: steps > 13 ? "warn" : "ok" },
        { label: "Cost per task", value: steps * 0.02, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Completed", value: success, tone: success < 0.97 ? "warn" : "ok" }] },
      notes: [s === "none" ? "Without a plan the agent drifts, repeating and detouring." : r === 0 ? "A fixed plan breaks at the first surprise." : "A failed step triggers a revision, so one bad step does not end the task."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "style") === "none") ev.push("derailed");
    if (str(v, "style") !== "none" && out.metrics.success! < 0.5) ev.push("brittle-plan");
    return ev;
  },
  scene: (n): SceneOut => (n === "none" ? { set: { style: "none" }, focus: ["style"] } : n === "fixed" ? { set: { style: "fixed" }, focus: ["style"] } : n === "replan" ? { set: { style: "replan", replans: 3 }, focus: ["replans"] } : undefined),
};

// ------------------------------------------------------------------ memory

const rr = (k: number) => 1 - Math.pow(0.55, k / 3);

export const memoryLab: LabModel = {
  id: "memory-lab",
  metrics: ["recall", "tokensPerTurn", "costPer1kTurns"],
  observes: ["forgot", "stuffed"],
  scenes: ["window", "summary", "retrieval"],
  runLabel: "Design the memory",
  honest: [
    "A 200-turn conversation in which the user states facts (their name, preferences, constraints) at random points, and later questions can ask about any of them, evenly across the conversation. A turn is about 400 tokens.",
    "A sliding window keeps the last W turns and remembers W ÷ 200 of the facts. A running summary keeps 55% of older facts at a cost of 800 tokens. Retrieval stores every turn in a vector index and fetches the top K for each question: it recalls an older fact with probability 1 − 0.55^(K ÷ 3), at 200 tokens per fetched item. The hybrid of summary and retrieval fails only when both miss.",
    "Round figures for comparison; real recall depends on what is stored and how it is searched.",
  ],
  init: () => ({ kind: "window", w: 10, k: 5 }),
  controls: () => [
    { kind: "choice", id: "kind", label: "Memory", options: [{ id: "window", label: "Last turns only" }, { id: "summary", label: "Last turns plus a running summary" }, { id: "retrieval", label: "Last turns plus retrieval from a store" }, { id: "hybrid", label: "Summary and retrieval together" }] },
    { kind: "slider", id: "w", label: "Recent turns kept verbatim", min: 2, max: 80, step: 1, fmt: "int" },
    { kind: "slider", id: "k", label: "Items retrieved per question", min: 1, max: 20, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const kind = str(v, "kind");
    const w = Math.round(num(v, "w"));
    const k = Math.round(num(v, "k"));
    const recent = w / 200;
    const sum = kind === "summary" || kind === "hybrid" ? 0.55 : 0;
    const ret = kind === "retrieval" || kind === "hybrid" ? rr(k) : 0;
    const recall = recent + (1 - recent) * (1 - (1 - sum) * (1 - ret));
    const tokens = w * 400 + (sum ? 800 : 0) + (ret ? k * 200 : 0);
    return {
      metrics: { recall, tokensPerTurn: tokens, costPer1kTurns: tokens * P_IN * 1000 },
      readouts: [
        { label: "Facts remembered", value: recall, fmt: "pct", tone: recall < 0.6 ? "alert" : recall < 0.9 ? "warn" : "ok" },
        { label: "Input tokens per turn", value: tokens, fmt: "int", tone: tone(tokens, 6000, 20000) },
        { label: "Cost per 1,000 turns", value: tokens * P_IN * 1000, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Remembered", value: recall, tone: recall < 0.9 ? "warn" : "ok" }] },
      notes: [kind === "window" ? "Anything older than the window is gone." : kind === "summary" ? "A summary keeps the gist and drops the details." : kind === "retrieval" ? "Old facts come back only if the search finds them." : "Two nets: the gist, and the details on demand."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.recall! < 0.3) ev.push("forgot");
    if (out.metrics.tokensPerTurn! > 15000) ev.push("stuffed");
    return ev;
  },
  scene: (n): SceneOut => (n === "window" ? { set: { kind: "window", w: 10 }, focus: ["kind"] } : n === "summary" ? { set: { kind: "summary" }, focus: ["kind"] } : n === "retrieval" ? { set: { kind: "retrieval", k: 8 }, focus: ["kind", "k"] } : undefined),
};

// ------------------------------------------------------------------ failure modes

export const failureLab: LabModel = {
  id: "failure-lab",
  metrics: ["worstRunCost", "badArgsPer1k", "silentUndetected", "stuckRuns"],
  observes: ["runaway-run", "silent"],
  scenes: ["cap", "validate", "trace"],
  runLabel: "Harden the agent",
  honest: [
    "Per 1,000 agent runs: 40 get stuck in a loop, 80 make a tool call with invalid arguments, and 50 end with a confident wrong answer that nobody notices unless the trace is reviewed. An uncapped loop can run until stopped, $400 in the lab; a 20-step cap holds a stuck run to $0.90; loop detection (the same call three times) stops it at $0.15; a budget cap holds any run to its limit.",
    "Argument validation against the schema rejects 90% of invalid calls before they run, returning an error the model can fix. Tracing every run with an automatic review catches 80% of silent wrong answers; without it, 20%.",
    "Round figures for the exercise.",
  ],
  init: () => ({ stepCap: false, loopDetect: false, budget: 0, validate: false, trace: false }),
  controls: () => [
    { kind: "toggle", id: "stepCap", label: "Cap steps at 20" },
    { kind: "toggle", id: "loopDetect", label: "Stop when the same call repeats three times" },
    { kind: "slider", id: "budget", label: "Budget cap per run (0 for none)", min: 0, max: 50, step: 0.5, fmt: "usd" },
    { kind: "toggle", id: "validate", label: "Validate tool arguments against the schema" },
    { kind: "toggle", id: "trace", label: "Trace every run and review automatically" },
  ],
  evaluate: (v) => {
    let worst = 400;
    if (bool(v, "stepCap")) worst = Math.min(worst, 0.9);
    if (bool(v, "loopDetect")) worst = Math.min(worst, 0.15);
    const b = num(v, "budget");
    if (b > 0) worst = Math.min(worst, b);
    const args = bool(v, "validate") ? 8 : 80;
    const silent = bool(v, "trace") ? 10 : 40;
    return {
      metrics: { worstRunCost: worst, badArgsPer1k: args, silentUndetected: silent, stuckRuns: 40 },
      readouts: [
        { label: "Cost of the worst stuck run", value: worst, fmt: "usd", tone: tone(worst, 1, 10) },
        { label: "Invalid tool calls per 1,000 runs that execute", value: args, fmt: "int", tone: args > 20 ? "warn" : "ok" },
        { label: "Wrong answers nobody notices per 1,000 runs", value: silent, fmt: "int", tone: silent > 20 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Worst run, dollars", value: worst, tone: tone(worst, 1, 10) }, { label: "Bad calls", value: args, tone: args > 20 ? "warn" : "ok" }, { label: "Silent errors", value: silent, tone: silent > 20 ? "warn" : "ok" }] },
      notes: [worst > 10 ? "Nothing stops a loop, so one stuck run can cost hundreds of dollars." : "A stuck run now costs about a dollar at most."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.worstRunCost! > 100) ev.push("runaway-run");
    if (out.metrics.silentUndetected! > 30) ev.push("silent");
    return ev;
  },
  scene: (n): SceneOut => (n === "cap" ? { set: { stepCap: true }, focus: ["stepCap"] } : n === "validate" ? { set: { validate: true }, focus: ["validate"] } : n === "trace" ? { set: { trace: true }, focus: ["trace"] } : undefined),
};

// ------------------------------------------------------------------ human in the loop

export const hitlLab: LabModel = {
  id: "hitl-lab",
  metrics: ["irreversibleErrors", "reviewerHours", "reversibleDamage", "meanDelayMin"],
  observes: ["rubber-stamp", "unreviewed"],
  scenes: ["all", "risk", "undo"],
  runLabel: "Set the approval gate",
  honest: [
    "An agent takes 1,000 actions a day: 700 reads, 250 reversible writes (draft an email, tag a ticket) and 50 irreversible ones (send money, delete data). It errs on 0.5% of reads, 3% of reversible writes and 1.5% of irreversible ones. Reads are harmless.",
    "A reviewer takes 30 seconds per approval and waits an average of 20 minutes to get to one. Attention decays with load: the chance a reviewer catches a bad action is 97% × e^(−approvals per hour ÷ 150), over an 8-hour day. Approving everything buries the reviewer and the catch rate collapses.",
    "If reversible actions can be undone within a day, their errors do no lasting damage; otherwise each uncaught one counts.",
  ],
  init: () => ({ policy: "none", undo: false }),
  controls: () => [
    { kind: "choice", id: "policy", label: "Which actions need a person's approval", options: [{ id: "none", label: "None" }, { id: "all", label: "Every action" }, { id: "writes", label: "Every write" }, { id: "irreversible", label: "Irreversible actions only" }] },
    { kind: "toggle", id: "undo", label: "Reversible actions can be undone within a day" },
  ],
  evaluate: (v) => {
    const p = str(v, "policy");
    const approvals = p === "none" ? 0 : p === "all" ? 1000 : p === "writes" ? 300 : 50;
    const perHour = approvals / 8;
    const catchRate = approvals === 0 ? 0 : 0.97 * Math.exp(-perHour / 150);
    const irrGated = p !== "none";
    const revGated = p === "all" || p === "writes";
    const irr = 50 * 0.015 * (1 - (irrGated ? catchRate : 0));
    const revUncaught = 250 * 0.03 * (1 - (revGated ? catchRate : 0));
    const hours = (approvals * 0.5) / 60;
    const delay = (approvals / 1000) * 20;
    return {
      metrics: { irreversibleErrors: irr, reviewerHours: hours, reversibleDamage: bool(v, "undo") ? 0 : revUncaught, meanDelayMin: delay },
      readouts: [
        { label: "Irreversible mistakes that happen a day", value: irr, fmt: "num", tone: irr > 0.1 ? "alert" : irr > 0.05 ? "warn" : "ok" },
        { label: "Reviewer hours a day", value: hours, fmt: "num", tone: hours > 3 ? "alert" : "ok" },
        { label: "Chance the reviewer catches a bad action", value: catchRate, fmt: "pct", tone: catchRate < 0.8 && approvals ? "warn" : "ok" },
        { label: "Lasting damage from reversible mistakes a day", value: bool(v, "undo") ? 0 : revUncaught, fmt: "num", tone: bool(v, "undo") ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Irreversible errors a day", value: irr, tone: irr > 0.1 ? "alert" : "ok" }, { label: "Reviewer hours", value: hours, tone: hours > 3 ? "alert" : "ok" }] },
      notes: [p === "none" ? "Nobody is asked, so every mistake happens." : p === "all" ? "A thousand approvals a day train the reviewer to click yes." : p === "writes" ? "Better, but still a flood of low-risk approvals." : "A few weighty decisions, each given real attention."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "policy") === "all" && out.metrics.reviewerHours! > 5) ev.push("rubber-stamp");
    if (str(v, "policy") === "none") ev.push("unreviewed");
    return ev;
  },
  scene: (n): SceneOut => (n === "all" ? { set: { policy: "all" }, focus: ["policy"] } : n === "risk" ? { set: { policy: "irreversible" }, focus: ["policy"] } : n === "undo" ? { set: { undo: true }, focus: ["undo"] } : undefined),
};

// ------------------------------------------------------------------ workflows vs agents

export const wfagentLab: LabModel = {
  id: "wfagent-lab",
  metrics: ["success", "costUsd", "latencyS"],
  observes: ["brittle-flow", "pricey-agent"],
  scenes: ["workflow", "agent", "router"],
  runLabel: "Choose the design",
  honest: [
    "A support assistant. Routine requests follow a known pattern; novel ones need open-ended exploration. A fixed workflow of prompts succeeds on 97% of routine requests and 40% of novel ones, costs $0.02 and takes 3 seconds. A free-running agent succeeds on 92% of routine and 78% of novel requests, costs $0.15 and takes 25 seconds.",
    "A router sends routine requests to the workflow and novel ones to the agent. It recognises 90% of novel requests; the rest go to the workflow.",
    "The novel share is set by the slider.",
  ],
  init: (c) => ({ design: "workflow", novel: (c as { novel?: number }).novel ?? 15 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "design", label: "Design", options: [{ id: "workflow", label: "Fixed workflow of prompts" }, { id: "agent", label: "Agent with tools, free to decide" }, { id: "router", label: "Workflow for routine requests, agent for novel ones" }] }];
    if (!(c as { lockNovel?: boolean }).lockNovel) out.push({ kind: "slider", id: "novel", label: "Novel requests", min: 0, max: 100, step: 1, fmt: "num", hint: "percent" });
    return out;
  },
  evaluate: (v) => {
    const n = num(v, "novel") / 100;
    const d = str(v, "design");
    const wf = { s: [0.97, 0.4], c: 0.02, t: 3 };
    const ag = { s: [0.92, 0.78], c: 0.15, t: 25 };
    let s: number;
    let c: number;
    let t: number;
    if (d === "workflow") {
      s = (1 - n) * wf.s[0]! + n * wf.s[1]!;
      c = wf.c;
      t = wf.t;
    } else if (d === "agent") {
      s = (1 - n) * ag.s[0]! + n * ag.s[1]!;
      c = ag.c;
      t = ag.t;
    } else {
      s = (1 - n) * wf.s[0]! + n * (0.9 * ag.s[1]! + 0.1 * wf.s[1]!);
      c = (1 - n) * wf.c + n * (0.9 * ag.c + 0.1 * wf.c);
      t = (1 - n) * wf.t + n * (0.9 * ag.t + 0.1 * wf.t);
    }
    return {
      metrics: { success: s, costUsd: c, latencyS: t },
      readouts: [
        { label: "Requests handled well", value: s, fmt: "pct", tone: s < 0.9 ? "alert" : s < 0.93 ? "warn" : "ok" },
        { label: "Cost per request", value: c, fmt: "usd", tone: c > 0.1 ? "alert" : c > 0.05 ? "warn" : "ok" },
        { label: "Average time", value: t, fmt: "s", tone: t > 15 ? "alert" : t > 8 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Handled well", value: s, tone: s < 0.93 ? "warn" : "ok" }] },
      notes: [d === "workflow" ? "Cheap and predictable on the routine, and stumped by anything new." : d === "agent" ? "Flexible, and slow and costly for every request, routine or not." : "Each request gets the lightest design that can handle it."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.success! < 0.9) ev.push("brittle-flow");
    if (out.metrics.costUsd! > 0.1) ev.push("pricey-agent");
    return ev;
  },
  scene: (n): SceneOut => (n === "workflow" ? { set: { design: "workflow" }, focus: ["design"] } : n === "agent" ? { set: { design: "agent" }, focus: ["design"] } : n === "router" ? { set: { design: "router" }, focus: ["design"] } : undefined),
};

// ------------------------------------------------------------------ orchestrator-worker

export const orchLab: LabModel = {
  id: "orch-lab",
  metrics: ["quality", "latencyS", "costUsd"],
  observes: ["muddled", "slow-serial"],
  scenes: ["single", "workers", "parallel"],
  runLabel: "Plan the workers",
  honest: [
    "A research task of 6 subtasks, each needing about 8,000 tokens of working context and 25 seconds. One agent holding all of it carries 48,000 tokens; quality falls with how much it must hold: 0.95 − 0.005 per thousand tokens of context. Splitting the task across W workers gives each 6 ÷ W subtasks, plus 2,000 tokens of instructions. A final synthesis step holds the workers' summaries (1,500 tokens each) and 2,000 tokens of instructions. Final quality is the product of worker and synthesis quality.",
    "Latency: an orchestrator plan of 5 seconds, then the workers (the slowest, if they run in parallel, or the sum if one after another), then 8 seconds to synthesise. Tokens: 48,000 for the work, plus 4,000 for the orchestrator and 1,000 more per worker, plus 3,000 and 1,000 per worker for synthesis, priced at an average $4 per million.",
    "Round figures for comparison.",
  ],
  init: () => ({ w: 1, parallel: true }),
  controls: () => [
    { kind: "slider", id: "w", label: "Workers (1 is a single agent)", min: 1, max: 8, step: 1, fmt: "int" },
    { kind: "toggle", id: "parallel", label: "Run the workers in parallel" },
  ],
  evaluate: (v) => {
    const w = Math.round(num(v, "w"));
    const ctxW = (8 * 6) / w + 2;
    const qw = Math.max(0.1, 0.95 - 0.005 * ctxW);
    const synthCtx = w * 1.5 + 2;
    const qs = w === 1 ? 1 : Math.max(0.1, 0.95 - 0.005 * synthCtx);
    const q = qw * qs;
    const perWorker = (6 / w) * 25;
    const lat = w === 1 ? perWorker : 5 + (bool(v, "parallel") ? perWorker : perWorker * w) + 8;
    const tokens = 48000 + (w === 1 ? 0 : 4000 + 1000 * w + 3000 + 1000 * w);
    return {
      metrics: { quality: q, latencyS: lat, costUsd: (tokens * 4) / 1e6 },
      readouts: [
        { label: "Quality of the result", value: q, fmt: "pct", tone: q < 0.75 ? "alert" : q < 0.82 ? "warn" : "ok" },
        { label: "Time to finish", value: lat, fmt: "s", tone: lat > 120 ? "alert" : lat > 90 ? "warn" : "ok" },
        { label: "Cost per task", value: (tokens * 4) / 1e6, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Worker quality", value: qw, tone: "info" }, { label: "Synthesis quality", value: qs, tone: "info" }, { label: "Overall", value: q, tone: q < 0.82 ? "warn" : "ok" }] },
      notes: [w === 1 ? "One agent holds everything, and quality slips as its context swells." : !bool(v, "parallel") ? "Workers run one after another, so splitting the work saved no time." : "Smaller contexts for the workers, and a coordination cost to pay."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.quality! < 0.75) ev.push("muddled");
    if (!bool(v, "parallel") && Math.round(num(v, "w")) > 1 && out.metrics.latencyS! > 150) ev.push("slow-serial");
    return ev;
  },
  scene: (n): SceneOut => (n === "single" ? { set: { w: 1 }, focus: ["w"] } : n === "workers" ? { set: { w: 4 }, focus: ["w"] } : n === "parallel" ? { set: { w: 4, parallel: true }, focus: ["parallel"] } : undefined),
};

// ------------------------------------------------------------------ parallelisation

const Lat = lognormal(10, 40);
const majority = (k: number, p: number): number => {
  let s = 0;
  let c = 1;
  const need = Math.floor(k / 2) + 1;
  for (let i = 0; i <= k; i++) {
    if (i > 0) c = (c * (k - i + 1)) / i;
    if (i >= need) s += c * Math.pow(p, i) * Math.pow(1 - p, k - i);
  }
  return s;
};
/** p99 of the time until m of k parallel calls have finished. */
function orderStatP99(k: number, m: number): number {
  let lo = 0.1;
  let hi = 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const f = Lat.cdf(mid);
    let s = 0;
    let c = 1;
    for (let j = 0; j <= k; j++) {
      if (j > 0) c = (c * (k - j + 1)) / j;
      if (j >= m) s += c * Math.pow(f, j) * Math.pow(1 - f, k - j);
    }
    if (s >= 0.99) hi = mid;
    else lo = mid;
  }
  return hi;
}

export const paraLab: LabModel = {
  id: "para-lab",
  metrics: ["accuracy", "p99S", "costX"],
  observes: ["tail-hit", "quorum-used"],
  scenes: ["vote", "quorum", "section"],
  runLabel: "Fan out the calls",
  honest: [
    "Voting: the same question is put to K agents and the majority answer wins. One agent is right 75% of the time; the agents' mistakes are partly shared, with a correlation of 0.2, so accuracy is 0.8 × (chance a true majority of K independent agents is right) + 0.2 × 0.75. Cost is K times a single call.",
    "Each agent takes a lognormal time with a median of 10 seconds and a 99th percentile of 40. Waiting for all K makes the 99th percentile that of the slowest. Waiting only for a majority (⌊K ÷ 2⌋ + 1 answers) uses the quorum's order statistic, and the late answers cannot change the vote.",
    "Round figures for comparison.",
  ],
  init: () => ({ k: 1, quorum: false }),
  controls: () => [
    { kind: "slider", id: "k", label: "Agents asked", min: 1, max: 15, step: 1, fmt: "int" },
    { kind: "toggle", id: "quorum", label: "Stop as soon as a majority has answered" },
  ],
  evaluate: (v) => {
    const k = Math.round(num(v, "k"));
    const acc = 0.8 * majority(k, 0.75) + 0.2 * 0.75;
    const need = bool(v, "quorum") ? Math.floor(k / 2) + 1 : k;
    const p99 = orderStatP99(k, need);
    return {
      metrics: { accuracy: acc, p99S: p99, costX: k },
      readouts: [
        { label: "Right answers", value: acc, fmt: "pct", tone: acc < 0.8 ? "alert" : acc < 0.85 ? "warn" : "ok" },
        { label: "Slowest 1% of tasks take", value: p99, fmt: "s", tone: tone(p99, 30, 45) },
        { label: "Cost vs a single agent", value: k, fmt: "x", tone: k > 6 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Right answers", value: acc, tone: acc < 0.85 ? "warn" : "ok" }] },
      notes: [k === 1 ? "A single agent is right three times in four." : !bool(v, "quorum") && p99 > 45 ? "Waiting for the slowest of many agents means living in the tail." : acc >= 0.85 ? "Enough agents that a few wrong ones are outvoted." : "More agents help, with shrinking returns, because their mistakes overlap."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.p99S! > 45) ev.push("tail-hit");
    if (bool(v, "quorum") && Math.round(num(v, "k")) >= 3) ev.push("quorum-used");
    return ev;
  },
  scene: (n): SceneOut => (n === "vote" ? { set: { k: 5 }, focus: ["k"] } : n === "quorum" ? { set: { k: 5, quorum: true }, focus: ["quorum"] } : n === "section" ? { set: { k: 1 }, focus: ["k"] } : undefined),
};

// ------------------------------------------------------------------ multi-agent

export const multiLab: LabModel = {
  id: "multiagent-lab",
  metrics: ["quality", "tokensX", "failurePct"],
  observes: ["chatter", "overbuilt"],
  scenes: ["single", "supervisor", "swarm"],
  runLabel: "Choose the organisation",
  honest: [
    "A complex task with a single-agent baseline: quality 78%, 1× the tokens, 2% of runs fail on coordination. A supervisor with N specialists adds 2 points of quality per specialist up to 4, costs 1 + 0.6 N times the tokens, and adds 1% failure per specialist. A debate of N agents over 2 rounds costs 1.8 N times the tokens, adds 1.5 points per agent up to 4 and 0.8% failures per agent. A peer swarm of N agents that all talk to each other costs N(N − 1) ÷ 2 × 0.5 + N times the tokens, adds 1 point per agent up to 4 and 1.5% failures per agent.",
    "Gains stop after four agents in the lab; messages grow with pairs.",
    "Round figures for comparison.",
  ],
  init: () => ({ pattern: "single", n: 3 }),
  controls: () => [
    { kind: "choice", id: "pattern", label: "Organisation", options: [{ id: "single", label: "One agent" }, { id: "supervisor", label: "A supervisor and specialists" }, { id: "debate", label: "Agents that debate" }, { id: "swarm", label: "Peers that all talk to each other" }] },
    { kind: "slider", id: "n", label: "Agents", min: 2, max: 8, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const p = str(v, "pattern");
    const n = Math.round(num(v, "n"));
    let q = 0.78;
    let tok = 1;
    let fail = 0.02;
    const gain = Math.min(n, 4);
    if (p === "supervisor") {
      q += 0.02 * gain;
      tok = 1 + 0.6 * n;
      fail += 0.01 * n;
    } else if (p === "debate") {
      q += 0.015 * gain;
      tok = 1.8 * n;
      fail += 0.008 * n;
    } else if (p === "swarm") {
      q += 0.01 * gain;
      tok = (n * (n - 1)) / 4 + n;
      fail += 0.015 * n;
    }
    return {
      metrics: { quality: q, tokensX: tok, failurePct: fail },
      readouts: [
        { label: "Quality", value: q, fmt: "pct", tone: q < 0.8 ? "warn" : "ok" },
        { label: "Tokens vs one agent", value: tok, fmt: "x", tone: tok > 6 ? "alert" : tok > 4 ? "warn" : "ok" },
        { label: "Runs that fail on coordination", value: fail, fmt: "pct", tone: fail > 0.08 ? "alert" : fail > 0.05 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "x", bars: [{ label: "Tokens", value: tok, tone: tok > 4 ? "warn" : "ok" }] },
      notes: [p === "single" ? "The simplest thing that might work." : p === "swarm" ? "Every pair of agents is a conversation, so cost grows with the square of the team." : p === "debate" ? "Agents check each other, at a cost in rounds." : "One agent plans and the specialists do the parts."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.tokensX! > 8) ev.push("chatter");
    if (str(v, "pattern") !== "single" && out.metrics.quality! < 0.83 && out.metrics.tokensX! > 4) ev.push("overbuilt");
    return ev;
  },
  scene: (n): SceneOut => (n === "single" ? { set: { pattern: "single" }, focus: ["pattern"] } : n === "supervisor" ? { set: { pattern: "supervisor", n: 4 }, focus: ["pattern", "n"] } : n === "swarm" ? { set: { pattern: "swarm", n: 6 }, focus: ["pattern", "n"] } : undefined),
};

// ------------------------------------------------------------------ meltdown boss

export const meltdownLab: LabModel = {
  id: "meltdown-lab",
  metrics: ["worstCost", "refundsIssued", "detectMin", "reviewerHours", "successRate"],
  observes: [],
  scenes: ["caps", "gate", "alert"],
  runLabel: "Contain the agent",
  honest: [
    "A support agent can search, email, refund and delete. In a bad run it loops, calling the refund tool every step. With no limits it issues 40 refunds and spends $400 before anyone stops it; each step costs about $0.045 as the context grows. A step cap of S stops a stuck run at S steps, S × $0.045 and S ÷ 2 refunds; loop detection (the same call three times) stops it after 3 calls; a budget cap holds the cost to its limit.",
    "An approval gate on irreversible actions (refunds) stops 97% of bad ones, as a reviewer sees about 50 a day; approving everything means 1,000 a day and the reviewer lets nearly everything through. A page on cost rate finds a runaway in 3 minutes; without it the bill finds you in 90.",
    "Ordinary tasks need up to 18 steps; a step cap below that blocks real work. Idempotent tools make a repeated call do nothing.",
  ],
  init: () => ({ cap: 10000, loop: false, budget: 400, gate: "none", idem: false, alert: false }),
  controls: () => [
    { kind: "slider", id: "cap", label: "Step cap per run", min: 5, max: 10000, log: true, fmt: "int" },
    { kind: "toggle", id: "loop", label: "Stop when the same call repeats three times" },
    { kind: "slider", id: "budget", label: "Dollar cap per run", min: 0.5, max: 400, log: true, fmt: "usd" },
    { kind: "choice", id: "gate", label: "Human approval", options: [{ id: "none", label: "None" }, { id: "irreversible", label: "Refunds and deletes only" }, { id: "all", label: "Every action" }] },
    { kind: "toggle", id: "idem", label: "Refund tool is idempotent per order" },
    { kind: "toggle", id: "alert", label: "Page when cost per minute spikes" },
  ],
  evaluate: (v) => {
    const cap = Math.round(num(v, "cap"));
    const steps = bool(v, "loop") ? Math.min(cap, 3) : cap;
    const cost = Math.min(steps * 0.045, num(v, "budget"), 400);
    const actualSteps = Math.min(steps, num(v, "budget") / 0.045);
    let refunds = Math.min(40, actualSteps / 2);
    if (bool(v, "idem")) refunds = Math.min(refunds, 1);
    const gate = str(v, "gate");
    const approvals = gate === "none" ? 0 : gate === "all" ? 1000 : 50;
    const catchRate = approvals === 0 ? 0 : 0.97 * Math.exp(-approvals / 8 / 150);
    refunds = refunds * (1 - catchRate);
    const hours = (approvals * 0.5) / 60;
    const success = cap >= 18 ? 0.97 : cap >= 10 ? 0.7 : 0.3;
    return {
      metrics: { worstCost: cost, refundsIssued: refunds, detectMin: bool(v, "alert") ? 3 : 90, reviewerHours: hours, successRate: success },
      readouts: [
        { label: "Cost of a runaway run", value: cost, fmt: "usd", tone: tone(cost, 5, 50) },
        { label: "Refunds the runaway issues", value: refunds, fmt: "num", tone: refunds > 1 ? "alert" : refunds > 0.3 ? "warn" : "ok" },
        { label: "Minutes until someone knows", value: bool(v, "alert") ? 3 : 90, fmt: "int", tone: bool(v, "alert") ? "ok" : "alert" },
        { label: "Reviewer hours a day", value: hours, fmt: "num", tone: hours > 2 ? "alert" : "ok" },
        { label: "Real tasks that still finish", value: success, fmt: "pct", tone: success < 0.9 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Runaway cost, dollars", value: cost, tone: tone(cost, 5, 50) }, { label: "Refunds issued", value: refunds, tone: refunds > 1 ? "alert" : "ok" }] },
      notes: [success < 0.9 ? "The cap is cutting off ordinary tasks." : cost > 5 ? "A runaway run can still spend real money." : "A runaway is contained, and ordinary work is untouched."],
    };
  },
  scene: (n): SceneOut => (n === "caps" ? { set: { cap: 20, loop: true, budget: 2 }, focus: ["cap", "loop"] } : n === "gate" ? { set: { gate: "irreversible" }, focus: ["gate"] } : n === "alert" ? { set: { alert: true }, focus: ["alert"] } : undefined),
};

export const B6_MODELS: LabModel[] = [toolcallLab, loopLab, reactLab, agentPlanLab, memoryLab, failureLab, hitlLab, wfagentLab, orchLab, paraLab, multiLab, meltdownLab];
