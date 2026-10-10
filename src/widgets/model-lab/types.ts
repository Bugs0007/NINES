/**
 * Model Lab: a data-driven widget. A *model* is a pure function from control values to metrics plus a view
 * (a curve, bars, a waterfall, a grid, or a step list). Content packs pick a model by widget id, so a new
 * concept needs a model and a pack, not new React. Everything here is React-free so verifiers and tests can
 * evaluate models directly.
 */

export type Values = Record<string, number | string | boolean>;
export type Fmt = "int" | "num" | "pct" | "ms" | "s" | "usd" | "x" | "gb" | "bytes" | "raw";
export type Tone = "ok" | "warn" | "alert" | "info" | "muted" | "lilac" | "amber";

export type Control =
  | { kind: "slider"; id: string; label: string; min: number; max: number; step?: number; log?: boolean; fmt?: Fmt; hint?: string }
  | { kind: "choice"; id: string; label: string; options: { id: string; label: string; detail?: string }[] }
  | { kind: "toggle"; id: string; label: string; detail?: string };

export interface Readout {
  label: string;
  value: number | string;
  fmt?: Fmt;
  tone?: Tone;
  sub?: string;
}

export interface CurveSeries {
  id: string;
  label: string;
  tone?: Tone;
  points: [number, number][];
  dashed?: boolean;
}

export type View =
  | {
      kind: "curve";
      xLabel: string;
      yLabel: string;
      xFmt?: Fmt;
      yFmt?: Fmt;
      xLog?: boolean;
      yLog?: boolean;
      yMax?: number;
      series: CurveSeries[];
      marker?: { x: number; y: number; label?: string; tone?: Tone };
      hLines?: { y: number; label: string; tone?: Tone }[];
      vLines?: { x: number; label: string; tone?: Tone }[];
    }
  | {
      kind: "bars";
      fmt?: Fmt;
      /** A bar is one value, or stacked segments. */
      bars: { label: string; value?: number; segs?: { value: number; tone?: Tone; label?: string }[]; tone?: Tone; sub?: string }[];
      lines?: { value: number; label: string; tone?: Tone }[];
      max?: number;
    }
  | {
      kind: "waterfall";
      rows: { label: string; start: number; ms: number; tone?: Tone; note?: string }[];
      target?: { ms: number; label: string };
    }
  | { kind: "grid"; cols: number; cells: { label?: string; tone?: Tone; title?: string }[]; caption?: string; legend?: { tone: Tone; label: string }[] }
  | { kind: "steps"; steps: { label: string; detail?: string; value?: string; tone?: Tone }[] };

export interface LabOutput {
  metrics: Record<string, number>;
  readouts: Readout[];
  view: View;
  /** One-line commentary on what the current state means. */
  notes?: string[];
}

export interface LabModel {
  id: string;
  /** Metric names this model reports (challenge conditions compare against them). */
  metrics: string[];
  /** Events the model can raise in play mode (`events`). */
  observes: string[];
  /** Scene names a mechanism caption can request. */
  scenes: string[];
  /** Label of the button that finalises a challenge run. */
  runLabel?: string;
  /** Where the model simplifies reality. Shown in the stage's info panel. */
  honest?: string[];
  init(cfg: Record<string, unknown>): Values;
  controls(cfg: Record<string, unknown>): Control[];
  evaluate(v: Values, cfg: Record<string, unknown>): LabOutput;
  /** Events satisfied by the current state. Each fires once. */
  events?(v: Values, out: LabOutput, cfg: Record<string, unknown>): string[];
  /** A scene may move controls to a value, highlight controls, or both. */
  scene?(name: string, cfg: Record<string, unknown>): { set?: Values; focus?: string[] } | undefined;
}

export const num = (v: Values, id: string): number => Number(v[id]);
export const str = (v: Values, id: string): string => String(v[id]);
export const bool = (v: Values, id: string): boolean => Boolean(v[id]);

/** Format a value for display. */
export function fmtVal(x: number | string, fmt: Fmt = "num"): string {
  if (typeof x === "string") return x;
  if (!Number.isFinite(x)) return "∞";
  switch (fmt) {
    case "int":
      return Math.round(x).toLocaleString("en-US");
    case "pct":
      return `${(x * 100).toFixed(Math.abs(x) < 0.1 && x !== 0 ? 2 : 1)}%`;
    case "ms":
      return x === 0 ? "0ms" : x < 1 ? `${x.toFixed(2)}ms` : x < 100 ? `${x.toFixed(1)}ms` : `${Math.round(x).toLocaleString("en-US")}ms`;
    case "s":
      return x < 1 ? `${Math.round(x * 1000)}ms` : x < 60 ? `${x.toFixed(x < 10 ? 2 : 1)}s` : x < 3600 ? `${(x / 60).toFixed(1)}min` : `${(x / 3600).toFixed(1)}h`;
    case "usd":
      return x >= 1000 ? `$${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k` : `$${x.toFixed(x < 10 ? 2 : 0)}`;
    case "x":
      return `${x >= 100 ? Math.round(x) : x.toFixed(x < 10 ? 2 : 1)}×`;
    case "gb":
      return x >= 1024 ? `${(x / 1024).toFixed(1)}TB` : x >= 1 ? `${x.toFixed(x < 10 ? 1 : 0)}GB` : `${(x * 1024).toFixed(0)}MB`;
    case "bytes": {
      const u = ["B", "KB", "MB", "GB", "TB", "PB"];
      let i = 0;
      let y = x;
      while (y >= 1000 && i < u.length - 1) {
        y /= 1000;
        i++;
      }
      return `${y.toFixed(y < 10 && i ? 1 : 0)}${u[i]}`;
    }
    case "raw":
      return String(x);
    default:
      return Math.abs(x) >= 1e9 ? `${(x / 1e9).toFixed(1)}B` : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e4 ? `${(x / 1e3).toFixed(0)}k` : Math.abs(x) >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : Number.isInteger(x) ? String(x) : x.toFixed(x < 10 ? 2 : 1);
  }
}

/** A sweep of x values, linear or log-spaced. */
export function sweep(min: number, max: number, n: number, log = false): number[] {
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    return log ? Math.exp(Math.log(min) + f * (Math.log(max) - Math.log(min))) : min + f * (max - min);
  });
}
