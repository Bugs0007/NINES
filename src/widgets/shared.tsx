"use client";
/** Helpers shared by widgets and the mission runner. */
import { Chip, fmtLatency, fmtNum, fmtPct, fmtUsd, Panel } from "@/ui/kit";
import type { WidgetProps } from "./types";

/**
 * The result of the last run against the win conditions, as one compact row of chips.
 * Before a run it renders nothing: the rail's "To win" list is the only checklist.
 */
export function ConditionList({ conditions, metrics }: { conditions?: WidgetProps["conditions"]; metrics?: Record<string, number> }) {
  if (!conditions?.length || !metrics) return null;
  return (
    <Panel label="Last run">
      <ul className="flex flex-wrap gap-1.5">
        {conditions.map((cond, i) => {
          const v = metrics[cond.metric];
          const pass = v === undefined ? null : evalCond(v, cond.op, cond.value);
          return (
            <li key={i} title={cond.label}>
              <Chip tone={pass === null ? "muted" : pass ? "ok" : "alert"} className="font-mono tabular">
                <span className="sr-only">
                  {cond.label}: {pass === null ? "not measured" : pass ? "met" : "missed"},{" "}
                </span>
                <span aria-hidden>{pass === null ? "–" : pass ? "✓" : "✗"}</span>
                <span>{v === undefined ? cond.label : resultText(cond.metric, v)}</span>
              </Chip>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** A short readout of one measured metric for the result chips ("p99 608ms", "$1.12 per chat"). */
export function resultText(metric: string, v: number): string {
  switch (metric) {
    case "memFits":
      return v >= 1 ? "fits in RAM" : "won't fit in RAM";
    case "overflow":
      return v ? "window overflowed" : "no overflow";
    case "factsKept":
      return v ? "facts kept" : "facts lost";
    case "quality":
      return `${fmtNum(v)}/5 answers`;
    case "days":
      return `${fmtNum(v)} days`;
    case "workers":
      return `${fmtNum(v)} workers`;
    case "cores":
      return `${fmtNum(v)} vCPU`;
    case "tokens":
      return `${fmtNum(v)} tokens`;
    case "memGiB":
      return `${v.toFixed(1)} GiB`;
    case "ttft":
      return `first token ${fmtLatency(v)}`;
    case "latency":
      return `page ${fmtLatency(v)}`;
    case "errorRate":
      return `errors ${fmtPct(v, v < 0.1 ? 2 : 1)}`;
    case "sessionLoss":
      return `logged out ${fmtPct(v, v < 0.1 ? 2 : 1)}`;
    case "costPerMonth":
    case "monthly":
      return `${fmtUsd(v)}/mo`;
    case "costPerConversation":
      return `${fmtUsd(v)} per chat`;
  }
  if (/^p\d+$/.test(metric)) return `${metric} ${fmtLatency(v)}`;
  return formatMetric(metric, v);
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
