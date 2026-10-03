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
import { useGame } from "@/game/store";

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
        return { k, label: "Errors", value: last ? fmtPct(last.errorRate, last.errorRate < 0.1 ? 2 : 1) : "—", series: w.map((x) => x.errorRate), tone: bad ? ("alert" as const) : ("ink" as const), bad, max: 1 };
      }
      case "rps":
        return { k, label: "Throughput", short: "Rate", value: last ? `${fmtNum(last.throughput)}/s` : "—", series: w.map((x) => x.throughput), tone: "ink" as const };
      case "cost":
        return { k, label: "Cost / mo", short: "Cost", value: last ? fmtUsd(last.costPerMonth) : "—", series: w.map((x) => x.costPerMonth), tone: "ink" as const };
      case "inflight": {
        const v = last && inflightNode ? last.nodes[inflightNode]?.inflight ?? 0 : 0;
        return { k, label: "In flight (L)", short: "In flight", value: last ? v.toFixed(1) : "—", series: w.map((x) => (inflightNode ? x.nodes[inflightNode]?.inflight ?? 0 : 0)), tone: "amber" as const };
      }
      case "queue": {
        const v = last && inflightNode ? last.nodes[inflightNode]?.queue ?? 0 : 0;
        return { k, label: "Queued", value: last ? v.toFixed(0) : "—", series: w.map((x) => (inflightNode ? x.nodes[inflightNode]?.queue ?? 0 : 0)), tone: v > 5 ? ("alert" as const) : ("ink" as const) };
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
        return { k, label: "Busy", value: last ? fmtPct(v, 0) : "—", series: w.map(pick), tone: v > 0.9 ? ("alert" as const) : v > 0.75 ? ("amber" as const) : ("phos" as const), max: 1 };
      }
    }
  });
  return (
    <div className={cx("grid divide-x divide-line/60 overflow-hidden rounded-lg border border-line/70 bg-bg-1/75 shadow-card", className)} style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
      {tiles.map((t) => (
        // Each tile is a container: the label and value keep their full width, and the sparkline sits beside them
        // only when the tile is wide enough, otherwise it drops underneath. Numbers are never cut.
        <div key={t.k} className={cx("@container relative min-w-0 px-2.5 py-2 transition-colors duration-300 sm:px-3", "bad" in t && t.bad && "bg-alert-dim/50")}>
          <div className="flex flex-col gap-1.5 @[11rem]:flex-row @[11rem]:items-end @[11rem]:justify-between @[11rem]:gap-3">
            <div className="min-w-0 shrink-0">
              <div className="eyebrow truncate text-[11px] text-ink-2 @[7rem]:text-xs">
                {"short" in t && t.short ? (
                  <>
                    <span className="@[7.5rem]:hidden">{t.short}</span>
                    <span className="hidden @[7.5rem]:inline">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
              </div>
              <div className={cx("mt-0.5 whitespace-nowrap font-mono text-sm tabular @[8rem]:text-base", t.tone === "alert" ? "text-alert" : t.tone === "amber" ? "text-amber" : t.tone === "phos" ? "text-phos" : "text-ink-0")}>{t.value}</div>
            </div>
            <Sparkline
              values={t.series}
              width={120}
              height={18}
              className="block w-full min-w-0 max-w-[120px] @[11rem]:mb-1 @[11rem]:flex-1"
              tone={t.tone === "alert" ? "alert" : t.tone === "amber" ? "amber" : t.tone === "phos" ? "phos" : "ink"}
              threshold={"threshold" in t ? t.threshold : undefined}
              max={"max" in t ? t.max : undefined}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotableTicker({ notables, className }: { notables: NotableEvent[]; className?: string }) {
  const last = notables.slice(-3).reverse();
  return (
    <div className={cx("min-h-[1.5rem] overflow-hidden px-1 text-[13px]", className)} aria-live="polite">
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
            <span className="w-12 shrink-0 font-mono text-xs tabular text-ink-3">t+{e.t.toFixed(0)}s</span>
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
  const showHonest = useGame((s) => s.profile.settings.showHonestPhysics);
  const loadNodes = useMemo(() => nodes.filter((n) => n.kind !== "client" && n.kind !== "lb").map((n) => n.id), [nodes]);
  useLoadSound(sim.windows, loadNodes, sound);
  const hpOpen = useRef<HTMLDetailsElement>(null);
  return (
    <div className={cx("flex min-h-0 flex-col gap-3", className)}>
      <MetricStrip windows={sim.windows} keys={metrics} slo={slo} utilNode={utilNode} inflightNode={inflightNode} />
      <div className={cx("relative min-h-[240px] flex-1 overflow-hidden rounded-lg border border-line/70 grid-paper", flowClassName)}>
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
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <Chip tone="muted" className="bg-bg-1/70">
            <span className="text-ink-3">Sim</span> <span className="font-mono tabular">t+{sim.t.toFixed(0)}s</span>
          </Chip>
          {overlay}
        </div>
      </div>
      {/* Under the canvas, not on it: the chip used to sit on top of nodes on narrow screens. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
        <NotableTicker notables={sim.notables} className="min-w-0 flex-1" />
        {showHonest && honestPhysics && honestPhysics.length > 0 && (
          <details ref={hpOpen} className="relative shrink-0 self-end sm:self-auto">
            <summary className="inline-flex min-h-8 cursor-pointer list-none items-center rounded-full px-3 text-xs font-medium text-ink-2 transition-colors hover:text-amber">Honest physics</summary>
            <ul className="absolute bottom-full right-0 z-20 mb-1.5 w-[min(360px,calc(100vw-2rem))] space-y-1.5 rounded-md border border-line-2/80 bg-bg-1/95 p-3 text-left text-[13px] leading-snug text-ink-1 shadow-card">
              {honestPhysics.map((h, i) => (
                <li key={i}>· {h}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
