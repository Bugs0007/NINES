"use client";
/**
 * Latency Budget: a real request waterfall. Spend limited engineering days on fixes and watch the
 * critical path shrink. Only the big bars matter; the widget is built so that the tempting fixes don't.
 */
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, fmtLatency, Meter, Panel } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { BudgetConfig, computeWaterfall, type SpanT } from "./spec";

export { BudgetConfig };

const LEGEND = { net: "Network", db: "DB", cache: "Cache", cpu: "CPU" } as const;

const KIND_COLOR: Record<SpanT["kind"], string> = {
  net: "bg-alert/70",
  db: "bg-amber/70",
  cache: "bg-phos/70",
  cpu: "bg-ink-1/60",
  cdn: "bg-phos/50",
};

export default function LatencyBudget({ config, onResult, conditions, locked, verdict }: WidgetProps<BudgetConfig>) {
  const c = BudgetConfig.parse(config);
  const [chosen, setChosen] = useState<string[]>([]);
  const [shipped, setShipped] = useState(false);
  const base = useMemo(() => computeWaterfall(c, []), [c]);
  const w = computeWaterfall(c, chosen);
  const scale = Math.max(base.total, c.targetMs * 1.2);
  const over = w.days > c.days;

  const toggle = (id: string) => {
    if (shipped) return;
    const f = c.fixes.find((x) => x.id === id)!;
    setChosen((cur) => {
      if (cur.includes(id)) {
        sfx.tick();
        return cur.filter((x) => x !== id);
      }
      sfx.thunk();
      return [...cur.filter((x) => !f.conflicts.includes(x)), id];
    });
  };

  const ship = () => {
    setShipped(true);
    sfx.confirm();
    onResult?.({ latency: w.total / 1000, days: w.days });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Panel label={`Trace · ${c.title}`} right={<span className="font-mono tabular">{fmtLatency(w.total / 1000)} total</span>}>
          <div className="relative mt-4 space-y-2">
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(34% + ${(c.targetMs / scale) * 66}%)` }}>
              <div className="h-full w-px bg-phos/50" />
              <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular text-phos">Target {c.targetMs}ms</span>
            </div>
            {c.spans.map((s) => {
              const l = w.laid.find((x) => x.span.id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div className={cx("line-clamp-2 w-[34%] text-xs leading-tight", l ? "text-ink-0" : "text-ink-3 line-through")} title={s.label}>
                    {s.label}
                  </div>
                  <div className="relative h-5 flex-1 rounded-full bg-bg-0/70">
                    <AnimatePresence>
                      {l && (
                        <motion.div
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1, left: `${(l.start / scale) * 100}%`, width: `${Math.max(0.4, (l.ms / scale) * 100)}%` }}
                          exit={{ opacity: 0, scaleX: 0 }}
                          transition={spring.soft}
                          className={cx("absolute inset-y-0.5 rounded-full", KIND_COLOR[s.kind])}
                        />
                      )}
                    </AnimatePresence>
                    {l && (
                      <span className="absolute top-1/2 -translate-y-1/2 pl-1 font-mono text-[11px] tabular text-ink-0" style={{ left: `${Math.min(88, ((l.start + l.ms) / scale) * 100)}%` }}>
                        {l.ms < 10 ? l.ms.toFixed(1) : Math.round(l.ms)}ms
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
            {(["net", "db", "cache", "cpu"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cx("inline-block h-2 w-3 rounded-full", KIND_COLOR[k])} /> {LEGEND[k]}
              </span>
            ))}
          </div>
        </Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {c.fixes.map((f) => {
            const on = chosen.includes(f.id);
            return (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggle(f.id)}
                disabled={locked || shipped}
                aria-pressed={on}
                className={cx(
                  "rounded-md border p-3.5 text-left transition-colors duration-200 disabled:cursor-not-allowed",
                  on ? "border-amber/80 bg-amber-dim/40" : "border-line-2/80 bg-bg-1/70 hover:border-line-3",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-ink-0">{f.label}</span>
                  <Chip tone={on ? "warn" : "muted"}>{f.days}d</Chip>
                </div>
                <div className="mt-1.5 text-xs leading-snug text-ink-2">{f.detail}</div>
              </motion.button>
            );
          })}
        </div>
      </div>
      <div className="flex w-full flex-col gap-4 lg:w-[280px]">
        <Panel label="Sprint">
          <div className="mb-1.5 flex justify-between gap-3 text-xs text-ink-2">
            <span>Engineering days</span>
            <span className={cx("font-mono tabular", over ? "text-alert" : "text-ink-0")}>
              {w.days} / {c.days}
            </span>
          </div>
          <Meter value={w.days / c.days} warnAt={0.8} alertAt={1} label="days used" />
          <div className="mt-4 border-t border-line/60 pt-3 text-xs text-ink-2">
            p50 page load
            <div className={cx("num-display mt-1 text-4xl font-semibold transition-colors duration-300", w.total <= c.targetMs ? "text-phos" : "text-alert")}>{fmtLatency(w.total / 1000)}</div>
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={shipped ? { latency: w.total / 1000, days: w.days } : undefined} />
        {!shipped ? (
          <Button variant="go" size="lg" onClick={ship} disabled={locked || chosen.length === 0} sound="none">
            Ship it
          </Button>
        ) : (
          verdict &&
          !verdict.won && (
            <Button
              variant="secondary"
              onClick={() => {
                setShipped(false);
              }}
            >
              Back to the plan
            </Button>
          )
        )}
      </div>
    </div>
  );
}
