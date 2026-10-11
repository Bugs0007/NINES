/**
 * Chapter B8 "Coding agents" models: what fills a coding agent's context over a session, and how the way a task is
 * briefed changes the odds of a correct change. Small simulations and closed forms with labelled round numbers.
 */
import { TEACHING_CACHE_READ_MULT, TEACHING_PRICES } from "../../../content/prices";
import { bool, num, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const P_IN = TEACHING_PRICES.big.input / 1e6;
const P_OUT = TEACHING_PRICES.big.output / 1e6;

const WINDOW = 200000;

export function sessionRun(claudeMd: number, mcp: number, offload: boolean, compact: boolean) {
  const fixed = 12000 + 2000 * mcp + claudeMd;
  const turns = 60;
  const growth = 1500 + (12 * 3000 + 40 * 2000 * (offload ? 0.25 : 1)) / turns;
  let ctx = fixed;
  let peak = fixed;
  let compactions = 0;
  let cost = 0;
  for (let t = 1; t <= turns; t++) {
    const prefix = ctx;
    ctx += growth;
    cost += prefix * TEACHING_CACHE_READ_MULT * P_IN + growth * P_IN + 600 * P_OUT;
    peak = Math.max(peak, ctx);
    if (compact && ctx > 0.8 * WINDOW) {
      ctx = fixed + 15000;
      compactions++;
    }
  }
  return { fixed, peak, peakPct: peak / WINDOW, compactions, cost, growth };
}

export const sessionLab: LabModel = {
  id: "ccsession-lab",
  metrics: ["fixedTokens", "peakPct", "compactions", "costSession"],
  observes: ["overflow", "heavy-start"],
  scenes: ["fixed", "subagent", "compact"],
  runLabel: "Plan the session",
  honest: [
    "A 200,000-token context window. Before you type anything the system prompt and built-in tool definitions take about 12,000 tokens, each connected MCP server adds about 2,000 and the CLAUDE.md memory file adds its own length. All of it is re-read on every turn.",
    "A 60-turn session adds about 1,500 tokens a turn of conversation, plus 12 files read at about 3,000 tokens each and 40 commands run at about 2,000 tokens of output each. Handing exploration to a subagent keeps the bulky output in its own context and returns only a summary: a quarter of the output reaches the main context. Auto-compaction summarises the conversation to about 15,000 tokens when the window passes 80%.",
    "Cost uses the teaching prices of $2 per million input tokens with cached prefix reads at a tenth, and $10 per million output, 600 output tokens a turn. Round figures to compare habits.",
  ],
  init: () => ({ claudeMd: 2000, mcp: 6, offload: false, compact: false }),
  controls: () => [
    { kind: "slider", id: "claudeMd", label: "CLAUDE.md length", min: 0, max: 20000, step: 250, fmt: "int", hint: "tokens" },
    { kind: "slider", id: "mcp", label: "MCP servers connected", min: 0, max: 15, step: 1, fmt: "int" },
    { kind: "toggle", id: "offload", label: "Send searches and exploration to subagents" },
    { kind: "toggle", id: "compact", label: "Auto-compact at 80% of the window" },
  ],
  evaluate: (v) => {
    const r = sessionRun(num(v, "claudeMd"), Math.round(num(v, "mcp")), bool(v, "offload"), bool(v, "compact"));
    return {
      metrics: { fixedTokens: r.fixed, peakPct: r.peakPct, compactions: r.compactions, costSession: r.cost },
      readouts: [
        { label: "Context used before the first message", value: r.fixed, fmt: "int", sub: "tokens", tone: tone(r.fixed, 20000, 40000) },
        { label: "Peak share of the window", value: r.peakPct, fmt: "pct", tone: r.peakPct > 1 ? "alert" : r.peakPct > 0.8 ? "warn" : "ok" },
        { label: "Compactions in the session", value: r.compactions, fmt: "int" },
        { label: "Cost of the session", value: r.cost, fmt: "usd", tone: tone(r.cost, 2.5, 6) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1.4, bars: [{ label: "Peak context", value: r.peakPct, tone: r.peakPct > 1 ? "alert" : r.peakPct > 0.8 ? "warn" : "ok" }], lines: [{ value: 1, label: "window", tone: "alert" }] },
      notes: [r.peakPct > 1 ? "The conversation outgrows the window, and without compaction the session cannot continue." : r.fixed > 30000 ? "Much of the window is spoken for before the work begins." : "There is room for the work."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.peakPct! > 1) ev.push("overflow");
    if (out.metrics.fixedTokens! > 30000) ev.push("heavy-start");
    return ev;
  },
  scene: (n): SceneOut => (n === "fixed" ? { set: { claudeMd: 15000, mcp: 12 }, focus: ["claudeMd", "mcp"] } : n === "subagent" ? { set: { offload: true }, focus: ["offload"] } : n === "compact" ? { set: { compact: true }, focus: ["compact"] } : undefined),
};

// ------------------------------------------------------------------ briefing a coding agent

export const briefLab: LabModel = {
  id: "brief-lab",
  metrics: ["firstTry", "attempts", "reviewMin", "regressionRisk"],
  observes: ["vague", "sprawl"],
  scenes: ["tests", "scope", "plan"],
  runLabel: "Write the brief",
  honest: [
    "A feature request given to a coding agent. The chance its first attempt is right starts at 35% for a bare one-line request. Naming the acceptance tests adds 15 points, pointing at the relevant files 8, stating constraints (what not to touch) 7, asking for a plan you approve first 5, and letting the agent run the tests itself 20.",
    "Asking for five things at once multiplies the chance by 0.6, since a mistake in any one spoils the change and review gets harder. Expected attempts are 1 ÷ the chance of success. Reviewing one attempt takes 6 minutes for a focused change and 12 for a large one. Without stated constraints the chance a change breaks something else is 18%; with them 5%.",
    "Round figures to compare briefs, not measurements of any model.",
  ],
  init: () => ({ tests: false, files: false, constraints: false, plan: false, run: false, big: true }),
  controls: () => [
    { kind: "toggle", id: "tests", label: "State the acceptance tests or expected behaviour" },
    { kind: "toggle", id: "files", label: "Point at the relevant files and examples" },
    { kind: "toggle", id: "constraints", label: "State what must not change" },
    { kind: "toggle", id: "plan", label: "Ask for a plan and approve it before any edit" },
    { kind: "toggle", id: "run", label: "Let the agent run the tests and fix failures itself" },
    { kind: "toggle", id: "big", label: "Ask for five changes in one request" },
  ],
  evaluate: (v) => {
    let p = 0.35;
    if (bool(v, "tests")) p += 0.15;
    if (bool(v, "files")) p += 0.08;
    if (bool(v, "constraints")) p += 0.07;
    if (bool(v, "plan")) p += 0.05;
    if (bool(v, "run")) p += 0.2;
    if (bool(v, "big")) p *= 0.6;
    const attempts = 1 / p;
    const review = attempts * (bool(v, "big") ? 12 : 6);
    const risk = bool(v, "constraints") ? 0.05 : 0.18;
    return {
      metrics: { firstTry: p, attempts, reviewMin: review, regressionRisk: risk },
      readouts: [
        { label: "Chance the first attempt is right", value: p, fmt: "pct", tone: p < 0.5 ? "alert" : p < 0.75 ? "warn" : "ok" },
        { label: "Expected attempts", value: attempts, fmt: "num", tone: attempts > 2.5 ? "warn" : "ok" },
        { label: "Your review time", value: review, fmt: "num", sub: "minutes", tone: review > 20 ? "alert" : review > 12 ? "warn" : "ok" },
        { label: "Chance it breaks something else", value: risk, fmt: "pct", tone: risk > 0.1 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "First attempt right", value: p, tone: p < 0.75 ? "warn" : "ok" }, { label: "Breaks something else", value: risk, tone: risk > 0.1 ? "alert" : "ok" }] },
      notes: [p < 0.4 ? "A vague, sprawling request: the agent is guessing at what you want." : "The agent knows what done looks like, and can check it."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.firstTry! < 0.3) ev.push("vague");
    if (bool(v, "big") && out.metrics.reviewMin! > 25) ev.push("sprawl");
    return ev;
  },
  scene: (n): SceneOut => (n === "tests" ? { set: { tests: true, run: true }, focus: ["tests", "run"] } : n === "scope" ? { set: { big: false }, focus: ["big"] } : n === "plan" ? { set: { plan: true, constraints: true }, focus: ["plan", "constraints"] } : undefined),
};

export const B8_MODELS: LabModel[] = [sessionLab, briefLab];
