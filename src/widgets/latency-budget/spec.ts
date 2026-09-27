/** Pure model of the latency-budget puzzle (shared by the widget and the content verifiers). */
import { z } from "zod";

const Span = z.object({
  id: z.string(),
  label: z.string(),
  ms: z.number(),
  kind: z.enum(["net", "db", "cache", "cpu", "cdn"]),
  /** Spans with the same group run in parallel (the group takes the max). */
  group: z.string().optional(),
});

const Fix = z.object({
  id: z.string(),
  label: z.string(),
  days: z.number(),
  detail: z.string(),
  /** Replace span durations. */
  set: z.record(z.string(), z.number()).default({}),
  /** Remove spans from the critical path. */
  remove: z.array(z.string()).default([]),
  /** Put spans into one parallel group. */
  parallel: z.array(z.string()).default([]),
  /** Fixes that make this one pointless or impossible. */
  conflicts: z.array(z.string()).default([]),
});

export const BudgetConfig = z.object({
  title: z.string(),
  spans: z.array(Span).min(2),
  fixes: z.array(Fix).min(2),
  days: z.number(),
  targetMs: z.number(),
});
export type BudgetConfig = z.infer<typeof BudgetConfig>;

export type SpanT = z.infer<typeof Span>;

interface Laid {
  span: SpanT;
  start: number;
  ms: number;
}

export function computeWaterfall(c: BudgetConfig, chosen: string[]): { laid: Laid[]; total: number; days: number } {
  const spans = c.spans.map((s) => ({ ...s }));
  let removed = new Set<string>();
  let days = 0;
  for (const id of chosen) {
    const f = c.fixes.find((x) => x.id === id);
    if (!f) continue;
    days += f.days;
    for (const [sid, ms] of Object.entries(f.set)) {
      const s = spans.find((x) => x.id === sid);
      if (s) s.ms = ms;
    }
    removed = new Set([...removed, ...f.remove]);
    if (f.parallel.length) for (const sid of f.parallel) {
      const s = spans.find((x) => x.id === sid);
      if (s) s.group = `par-${f.id}`;
    }
  }
  const laid: Laid[] = [];
  let t = 0;
  const seen = new Set<string>();
  for (const s of spans) {
    if (removed.has(s.id)) continue;
    if (s.group) {
      if (seen.has(s.group)) continue;
      seen.add(s.group);
      const members = spans.filter((x) => x.group === s.group && !removed.has(x.id));
      const len = Math.max(...members.map((m) => m.ms));
      for (const m of members) laid.push({ span: m, start: t, ms: m.ms });
      t += len;
    } else {
      laid.push({ span: s, start: t, ms: s.ms });
      t += s.ms;
    }
  }
  return { laid, total: t, days };
}

