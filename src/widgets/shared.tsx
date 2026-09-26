"use client";
/** Helpers shared by widgets and the mission runner. */
import { AnimatePresence, motion } from "motion/react";
import { cx, fmtLatency, fmtNum, fmtPct, fmtUsd, Panel } from "@/ui/kit";
import type { WidgetProps } from "./types";

export function ConditionList({ conditions, metrics }: { conditions?: WidgetProps["conditions"]; metrics?: Record<string, number> }) {
  if (!conditions?.length) return null;
  return (
    <Panel label="win conditions">
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {conditions.map((cond, i) => {
            const v = metrics?.[cond.metric];
            const pass = v === undefined ? null : evalCond(v, cond.op, cond.value);
            return (
              <motion.li key={i} layout className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-1">{cond.label}</span>
                <span className={cx("font-mono text-xs tabular", pass === null ? "text-ink-3" : pass ? "text-phos" : "text-alert")}>
                  {v === undefined ? "—" : formatMetric(cond.metric, v)} {pass === null ? "" : pass ? "✓" : "✗"}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}

export function evalCond(v: number, op: string, target: number): boolean {
  switch (op) {
    case "<":
      return v < target;
    case "<=":
      return v <= target;
    case ">":
      return v > target;
    case ">=":
      return v >= target;
    default:
      return Math.abs(v - target) < 1e-9;
  }
}

export function formatMetric(metric: string, v: number): string {
  if (/^p\d+|latency|mean|ms$/i.test(metric)) return fmtLatency(v);
  if (/rate|availability|util|good/i.test(metric)) return fmtPct(v, v < 0.1 ? 2 : 1);
  if (/cost|usd/i.test(metric)) return fmtUsd(v);
  if (/GiB/i.test(metric)) return `${v.toFixed(1)} GiB`;
  return fmtNum(v);
}
