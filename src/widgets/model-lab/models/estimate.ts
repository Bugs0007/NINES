/**
 * Estimation lab: a back-of-envelope chain (answer = k x product of steps, some steps divided). Packs choose how
 * much scaffolding to show: "worked" (every step filled in and locked), "faded" (some given), or "solo" (one guess).
 */
import { num, sweep, type Control, type Fmt, type LabModel, type Values } from "../types";

export interface EstStep {
  id: string;
  label: string;
  fmt?: Fmt;
  min: number;
  max: number;
  log?: boolean;
  /** The reference assumption for this step. */
  truth: number;
  /** Divide by this step instead of multiplying. */
  inverse?: boolean;
  hint?: string;
}

export interface EstCfg {
  answerLabel: string;
  answerFmt: Fmt;
  answerMin: number;
  answerMax: number;
  k: number;
  steps: EstStep[];
  mode: "worked" | "faded" | "solo";
  /** Steps filled in with their reference value (faded mode). */
  given: string[];
  hideTruth: boolean;
  /** How the chain reads, for solo mode ("users x requests per user x ..."). */
  chain: string;
}

const estCfg = (c: Record<string, unknown>): EstCfg => ({ answerFmt: "num", k: 1, mode: "faded", given: [], hideTruth: false, chain: "", answerMin: 1, answerMax: 1e12, answerLabel: "Answer", steps: [], ...(c as Partial<EstCfg>) });

const chainValue = (c: EstCfg, pick: (s: EstStep) => number) => c.steps.reduce((acc, s) => acc * (s.inverse ? 1 / pick(s) : pick(s)), c.k);
export const estTruth = (c: Record<string, unknown>) => chainValue(estCfg(c), (s) => s.truth);

export function estEval(cfg: Record<string, unknown>, v: Values) {
  const c = estCfg(cfg);
  const truth = chainValue(c, (s) => s.truth);
  const est = c.mode === "solo" ? num(v, "guess") : chainValue(c, (s) => (c.mode === "worked" || c.given.includes(s.id) ? s.truth : num(v, s.id)));
  const factor = Math.max(est / truth, truth / est);
  return { truth, est, factor };
}

export const estimateLab: LabModel = {
  id: "estimate-lab",
  metrics: ["factor", "estimate", "within2"],
  observes: ["close", "exact"],
  scenes: ["chain", "round"],
  runLabel: "Lock in my estimate",
  honest: ["Reference values are round, defensible assumptions, not measurements of your system. The point is the order of magnitude and the habit of writing the chain down."],
  init: (cfg) => {
    const c = estCfg(cfg);
    const v: Values = { guess: Math.sqrt(c.answerMin * c.answerMax) };
    for (const s of c.steps) v[s.id] = c.mode === "worked" || c.given.includes(s.id) ? s.truth : s.log ? Math.sqrt(s.min * s.max) : (s.min + s.max) / 2;
    return v;
  },
  controls: (cfg) => {
    const c = estCfg(cfg);
    if (c.mode === "solo") return [{ kind: "slider", id: "guess", label: c.answerLabel, min: c.answerMin, max: c.answerMax, log: true, fmt: c.answerFmt, hint: c.chain }];
    return c.steps
      .filter((s) => c.mode !== "worked" && !c.given.includes(s.id))
      .map<Control>((s) => ({ kind: "slider", id: s.id, label: s.label, min: s.min, max: s.max, log: s.log ?? true, fmt: s.fmt, hint: s.hint }));
  },
  evaluate: (v, cfg) => {
    const c = estCfg(cfg);
    const { truth, est, factor } = estEval(cfg, v);
    const steps: { label: string; detail?: string; value?: string; tone?: "ok" | "info" | "muted" | "warn" }[] = [];
    if (c.mode === "solo") {
      steps.push({ label: "Think in a chain", detail: c.chain || "Break the question into factors you can estimate, then multiply.", tone: "info" });
    } else {
      steps.push({ label: "Start", value: String(c.k), tone: "muted", detail: c.k === 1 ? undefined : "constant" });
      let run = c.k;
      for (const s of c.steps) {
        const val = c.mode === "worked" || c.given.includes(s.id) ? s.truth : num(v, s.id);
        run = run * (s.inverse ? 1 / val : val);
        steps.push({
          label: `${s.inverse ? "÷" : "×"} ${s.label}`,
          detail: c.mode === "worked" || c.given.includes(s.id) ? (s.hint ?? "given") : undefined,
          value: `${s.inverse ? "÷" : "×"} ${fmtShort(val, s.fmt)} → ${fmtShort(run, c.answerFmt)}`,
          tone: c.mode === "worked" || c.given.includes(s.id) ? "muted" : "info",
        });
      }
    }
    const tone = factor <= 2 ? "ok" : factor <= 5 ? "warn" : "alert";
    return {
      metrics: { factor, estimate: est, within2: factor <= 2 ? 1 : 0 },
      readouts: [
        { label: `Your ${c.answerLabel.toLowerCase()}`, value: fmtShort(est, c.answerFmt) },
        ...(c.hideTruth ? [] : [{ label: "Reference answer", value: fmtShort(truth, c.answerFmt) }, { label: "Off by", value: factor, fmt: "x" as Fmt, tone: tone as "ok" | "warn" | "alert" }]),
      ],
      view: { kind: "steps", steps },
      notes: c.hideTruth ? [] : [factor <= 2 ? "Within a factor of two: good enough to make a design decision." : "More than 2x off. Which step is carrying the error?"],
    };
  },
  events: (v, _out, cfg) => {
    const { factor } = estEval(cfg, v);
    const ev: string[] = [];
    if (factor <= 2) ev.push("close");
    if (factor <= 1.25) ev.push("exact");
    return ev;
  },
};

function fmtShort(x: number, fmt: Fmt = "num"): string {
  if (fmt === "num" || fmt === "int") {
    if (x >= 1e12) return `${(x / 1e12).toFixed(1)}T`;
    if (x >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
    if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
    if (x >= 1e4) return `${(x / 1e3).toFixed(0)}k`;
    if (x >= 1e3) return `${(x / 1e3).toFixed(1)}k`;
    return x < 10 && x % 1 ? x.toFixed(2) : x.toFixed(0);
  }
  if (fmt === "bytes") {
    const u = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0;
    let y = x;
    while (y >= 1000 && i < u.length - 1) {
      y /= 1000;
      i++;
    }
    return `${y.toFixed(y < 10 && i ? 1 : 0)} ${u[i]}`;
  }
  if (fmt === "pct") return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  if (fmt === "usd") return x >= 1000 ? `$${(x / 1000).toFixed(1)}k` : `$${x.toFixed(x < 10 ? 2 : 0)}`;
  if (fmt === "s") return x < 1 ? `${Math.round(x * 1000)}ms` : `${x.toFixed(1)}s`;
  if (fmt === "ms") return `${x.toFixed(x < 10 ? 1 : 0)}ms`;
  return String(Math.round(x * 100) / 100);
}

void sweep;
