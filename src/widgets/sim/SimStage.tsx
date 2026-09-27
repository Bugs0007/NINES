"use client";
/**
 * Shared stage for simulation widgets: live metric strip + flow view + notable-event ticker.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import type { SimHandle } from "@/engine/useSim";
import type { NotableEvent, WindowMetrics } from "@/engine/types";
import { FlowView, type FlowEdge, type FlowNode } from "@/ui/flow/FlowView";
import { Chip, cx, fmtLatency, fmtNum, fmtPct, fmtUsd, Led, Sparkline } from "@/ui/kit";
import { spring, useReducedMotion } from "@/ui/motion";

export type MetricKey = "p50" | "p99" | "errors" | "rps" | "cost" | "inflight" | "util" | "queue";

export interface StageSlo {
  p99?: number;
  errorRate?: number;
}

export function useLoadSound(windows: WindowMetrics[], nodeIds: string[], enabled = true) {
  const last = windows[windows.length - 1];
  useEffect(() => {
    if (!enabled || !last) return;
    let u = 0;
    for (const id of nodeIds) {
      const n = last.nodes[id];
      if (n) u = Math.max(u, n.util, n.workerUtil);
    }
    sfx.setLoad(u);
  }, [last, nodeIds, enabled]);
  useEffect(() => () => sfx.stopLoad(), []);
}

function tail<T>(xs: T[], n: number): T[] {
  return xs.length > n ? xs.slice(xs.length - n) : xs;
}

export function MetricStrip({
  windows,
  keys,
  slo,
  utilNode,
  inflightNode,
  className,
}: {
  windows: WindowMetrics[];
  keys: MetricKey[];
  slo?: StageSlo;
  utilNode?: string;
  inflightNode?: string;
  className?: string;
}) {
  const w = tail(windows, 60);
  const last = w[w.length - 1];
  const tiles = keys.map((k) => {
    switch (k) {
      case "p50":
        return { k, label: "p50", value: last ? fmtLatency(last.p50) : "—", series: w.map((x) => x.p50), tone: "ink" as const };
      case "p99": {
        const bad = !!(slo?.p99 && last && last.p99 > slo.p99);
        const tone = slo?.p99 ? (bad ? ("alert" as const) : ("phos" as const)) : last && last.p99 > 1 ? ("amber" as const) : ("ink" as const);
        return { k, label: "p99", value: last ? fmtLatency(last.p99) : "—", series: w.map((x) => x.p99), tone, threshold: slo?.p99, bad };
      }
      case "errors": {
        const bad = !!(last && last.errorRate > (slo?.errorRate ?? 0.01));
        return { k, label: "errors", value: last ? fmtPct(last.errorRate, last.errorRate < 0.1 ? 2 : 1) : "—", series: w.map((x) => x.errorRate), tone: bad ? ("alert" as const) : ("ink" as const), bad, max: 1 };
      }
      case "rps":
        return { k, label: "throughput", value: last ? `${fmtNum(last.throughput)}/s` : "—", series: w.map((x) => x.throughput), tone: "ink" as const };
      case "cost":
        return { k, label: "cost / mo", value: last ? fmtUsd(last.costPerMonth) : "—", series: w.map((x) => x.costPerMonth), tone: "ink" as const };
      case "inflight": {
        const v = last && inflightNode ? last.nodes[inflightNode]?.inflight ?? 0 : 0;
        return { k, label: "in flight (L)", value: last ? v.toFixed(1) : "—", series: w.map((x) => (inflightNode ? x.nodes[inflightNode]?.inflight ?? 0 : 0)), tone: "amber" as const };
      }
      case "queue": {
        const v = last && inflightNode ? last.nodes[inflightNode]?.queue ?? 0 : 0;
        return { k, label: "queued", value: last ? v.toFixed(0) : "—", series: w.map((x) => (inflightNode ? x.nodes[inflightNode]?.queue ?? 0 : 0)), tone: v > 5 ? ("alert" as const) : ("ink" as const) };
      }
      case "util": {
        const pick = (x: WindowMetrics) => {
          if (utilNode) {
            const n = x.nodes[utilNode];
            return n ? Math.max(n.util, n.workerUtil) : 0;
          }
          let u = 0;
          for (const n of Object.values(x.nodes)) u = Math.max(u, n.util, n.workerUtil);
          return u;
        };
        const v = last ? pick(last) : 0;
        return { k, label: "busy", value: last ? fmtPct(v, 0) : "—", series: w.map(pick), tone: v > 0.9 ? ("alert" as const) : v > 0.75 ? ("amber" as const) : ("phos" as const), max: 1 };
      }
    }
  });
  return (
    <div className={cx("grid gap-px overflow-hidden rounded-sm border border-line bg-line", className)} style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
      {tiles.map((t) => (
        <div key={t.k} className={cx("relative min-w-0 bg-bg-1 px-2 py-1.5", "bad" in t && t.bad && "bg-alert-dim/60")}>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">{t.label}</div>
          <div className={cx("font-mono text-sm tabular sm:text-base", t.tone === "alert" ? "text-alert glow-alert" : t.tone === "amber" ? "text-amber" : t.tone === "phos" ? "text-phos" : "text-ink-0")}>{t.value}</div>
          <Sparkline
            values={t.series}
            width={120}
            height={18}
            className="mt-0.5 w-full"
            tone={t.tone === "alert" ? "alert" : t.tone === "amber" ? "amber" : t.tone === "phos" ? "phos" : "ink"}
            threshold={"threshold" in t ? t.threshold : undefined}
            max={"max" in t ? t.max : undefined}
          />
        </div>
      ))}
    </div>
  );
}

export function NotableTicker({ notables, className }: { notables: NotableEvent[]; className?: string }) {
  const last = notables.slice(-3).reverse();
  return (
    <div className={cx("min-h-[1.5rem] overflow-hidden font-mono text-2xs", className)} aria-live="polite">
      <AnimatePresence initial={false}>
        {last.map((e) => (
          <motion.div
            key={`${e.t}-${e.kind}-${e.node ?? ""}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.snap}
            className="flex items-center gap-2 truncate text-ink-1"
          >
            <span className="text-ink-3">t+{e.t.toFixed(0)}s</span>
            <Led tone={toneOf(e.kind)} />
            <span className="truncate">{e.detail}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function toneOf(k: NotableEvent["kind"]): "ok" | "warn" | "alert" | "info" {
  switch (k) {
    case "recovered":
    case "health-restore":
    case "node-up":
      return "ok";
    case "saturated":
    case "retry-amplification":
    case "patch":
      return "warn";
    case "queue-overflow":
    case "timeouts":
    case "health-eject":
    case "outlier-eject":
    case "node-down":
    case "session-loss":
      return "alert";
  }
}

export interface SimStageProps {
  sim: SimHandle;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metrics?: MetricKey[];
  slo?: StageSlo;
  utilNode?: string;
  inflightNode?: string;
  highlight?: string[];
  selected?: string | null;
  onNodeTap?: (id: string) => void;
  /** Extra overlay content drawn on top of the flow view (top-left). */
  overlay?: ReactNode;
  className?: string;
  flowClassName?: string;
  sound?: boolean;
  honestPhysics?: string[];
}

export function SimStage({
  sim,
  nodes,
  edges,
  metrics = ["p50", "p99", "errors", "rps", "util"],
  slo,
  utilNode,
  inflightNode,
  highlight,
  selected,
  onNodeTap,
  overlay,
  className,
  flowClassName,
  sound = true,
  honestPhysics,
}: SimStageProps) {
  const reduced = useReducedMotion();
  const loadNodes = useMemo(() => nodes.filter((n) => n.kind !== "client" && n.kind !== "lb").map((n) => n.id), [nodes]);
  useLoadSound(sim.windows, loadNodes, sound);
  const hpOpen = useRef<HTMLDetailsElement>(null);
  return (
    <div className={cx("flex min-h-0 flex-col gap-2", className)}>
      <MetricStrip windows={sim.windows} keys={metrics} slo={slo} utilNode={utilNode} inflightNode={inflightNode} />
      <div className={cx("relative min-h-[240px] flex-1 overflow-hidden rounded-sm border border-line grid-paper", flowClassName)}>
        <FlowView
          nodes={nodes}
          edges={edges}
          frame={sim.frame}
          consumeFinished={sim.consumeFinished}
          highlight={highlight}
          selected={selected}
          onNodeTap={onNodeTap}
          reducedMotion={reduced}
          sound={sound}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          <Chip tone="muted">
            <span className="text-ink-3">sim</span> t+{sim.t.toFixed(0)}s
          </Chip>
          {overlay}
        </div>
        {honestPhysics && honestPhysics.length > 0 && (
          <details ref={hpOpen} className="absolute bottom-2 right-2 max-w-[min(360px,80%)] text-right">
            <summary className="cursor-pointer list-none font-mono text-2xs uppercase tracking-[0.12em] text-ink-2 hover:text-amber">Honest physics</summary>
            <ul className="mt-1 space-y-1 rounded-sm border border-line-2 bg-bg-1/95 p-2 text-left text-xs text-ink-1">
              {honestPhysics.map((h, i) => (
                <li key={i}>· {h}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <NotableTicker notables={sim.notables} />
    </div>
  );
}
