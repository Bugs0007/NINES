"use client";
/**
 * Latency Ladder: your predicted order races on a log-scaled clock. Then flip to human scale:
 * "if an L1 cache hit took one second…"
 */
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, fmtLatency, Panel, Segmented } from "@/ui/kit";
import { spring, useReducedMotion } from "@/ui/motion";
import type { WidgetProps } from "../types";

export const LadderConfig = z.object({
  items: z.array(z.object({ id: z.string(), label: z.string(), ns: z.number(), note: z.string().optional() })).min(3),
  /** Item whose time maps to one second in human scale. */
  scaleRef: z.string(),
  /** The prediction whose value is the player's order. */
  predictionId: z.string().default("order"),
  raceSeconds: z.number().default(7),
});
export type LadderConfig = z.infer<typeof LadderConfig>;

const MIN_LOG = -0.3; // ~0.5 ns
const MAX_LOG = 9.5; // ~3 s

function humanDuration(s: number): string {
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} seconds`;
  if (s < 3600) return `${(s / 60).toFixed(1)} minutes`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} hours`;
  if (s < 86400 * 60) return `${(s / 86400).toFixed(1)} days`;
  if (s < 86400 * 365 * 2) return `${(s / (86400 * 30.4)).toFixed(1)} months`;
  return `${(s / (86400 * 365)).toFixed(1)} years`;
}

export default function LatencyLadder({ config, mode, scene, calls, onObserve }: WidgetProps<LadderConfig>) {
  const c = LadderConfig.parse(config);
  const reduced = useReducedMotion();
  const predicted = (calls?.[c.predictionId] as string[] | undefined) ?? null;
  const order = predicted && predicted.length === c.items.length ? predicted : c.items.map((i) => i.id);
  const truth = [...c.items].sort((a, b) => a.ns - b.ns).map((i) => i.id);
  const [phase, setPhase] = useState<"idle" | "racing" | "done">("idle");
  const [clock, setClock] = useState(MIN_LOG); // current log10(ns)
  const [human, setHuman] = useState(false);
  const finished = useRef(new Set<string>());
  const [finishOrder, setFinishOrder] = useState<string[]>([]);
  const ref = c.items.find((i) => i.id === c.scaleRef)!;

  const race = useCallback(() => {
    finished.current = new Set();
    setFinishOrder([]);
    setPhase("racing");
    sfx.whoosh();
    if (reduced) {
      setClock(MAX_LOG);
      setFinishOrder(truth);
      setPhase("done");
      onObserve?.("raced");
      return;
    }
    const start = performance.now();
    const dur = c.raceSeconds * 1000;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const lg = MIN_LOG + p * (MAX_LOG - MIN_LOG);
      setClock(lg);
      for (const it of c.items) {
        if (!finished.current.has(it.id) && Math.log10(it.ns) <= lg) {
          finished.current.add(it.id);
          setFinishOrder((f) => [...f, it.id]);
          sfx.blip(it.ns / 1e9);
        }
      }
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        setPhase("done");
        sfx.confirm();
        onObserve?.("raced");
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [c.items, c.raceSeconds, onObserve, reduced, truth]);

  useEffect(() => {
    if (scene === "race" && phase === "idle") race();
    if (scene === "human-scale") setHuman(true);
    if (scene === "race") setHuman(false);
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === "codex" && phase === "idle") race();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const x = (lg: number) => ((lg - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100;
  const ticks = [
    { lg: 0, label: "1 ns" },
    { lg: 3, label: "1 µs" },
    { lg: 6, label: "1 ms" },
    { lg: 9, label: "1 s" },
  ];
  const clockNs = Math.pow(10, clock);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Panel
        label="The race · log scale"
        right={
          <span>
            Clock{" "}
            <span className="font-mono tabular text-ink-1">
              {phase === "idle" ? "0" : fmtLatency(clockNs / 1e9)}
              {human && ` · ×${(1e9 / ref.ns).toExponential(0).replace("e+", "e")}`}
            </span>
          </span>
        }
        className="flex-1"
        bodyClassName="flex h-full flex-col gap-3"
      >
        {/* axis */}
        <div className="relative ml-[38%] h-6 sm:ml-[32%]">
          {ticks.map((t) => (
            <span key={t.lg} className="absolute top-0 -translate-x-1/2 font-mono text-[11px] text-ink-3" style={{ left: `${x(t.lg)}%` }}>
              {t.label}
            </span>
          ))}
          <span className="absolute top-3 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-amber" style={{ left: `${x(8)}%` }}>
            ▼ 100 ms feels instant
          </span>
        </div>
        <div className="relative flex flex-1 flex-col justify-around gap-1">
          {/* grid lines */}
          <div className="pointer-events-none absolute inset-y-0 left-[38%] right-0 sm:left-[32%]">
            {ticks.map((t) => (
              <span key={t.lg} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${x(t.lg)}%` }} />
            ))}
            <span className="absolute inset-y-0 w-px bg-amber/40" style={{ left: `${x(8)}%` }} />
            {phase !== "idle" && <span className="absolute inset-y-0 w-px bg-phos shadow-[0_0_6px_color-mix(in_srgb,var(--color-phos)_55%,transparent)]" style={{ left: `${Math.min(100, x(clock))}%` }} />}
          </div>
          {order.map((id, i) => {
            const it = c.items.find((q) => q.id === id)!;
            const lg = Math.log10(it.ns);
            const done = finishOrder.includes(id);
            const pos = finishOrder.indexOf(id);
            const correct = truth.indexOf(id) === i;
            const progress = phase === "idle" ? 0 : Math.min(x(lg), x(clock));
            return (
              <div key={id} className="relative flex min-h-9 items-center gap-2">
                <div className="flex w-[38%] items-center gap-2 pr-2 sm:w-[32%]">
                  <span className="w-4 shrink-0 font-mono text-2xs text-ink-3">{i + 1}</span>
                  <span className="truncate text-sm text-ink-0" title={it.label}>
                    {it.label}
                  </span>
                </div>
                <div className="relative h-5 flex-1">
                  <motion.div
                    className={cx("absolute inset-y-1 left-0 rounded-full", done ? (phase === "done" && !correct ? "bg-amber/60" : "bg-phos/60") : "bg-phos/30")}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.05, ease: "linear" }}
                  />
                  <AnimatePresence>
                    {done && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={spring.bounce}
                        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 font-mono text-xs tabular"
                        style={{ left: `${Math.min(x(lg), 70)}%` }}
                      >
                        <span className="text-ink-0">{human ? humanDuration(it.ns / ref.ns) : fmtLatency(it.ns / 1e9)}</span>
                        <span className={cx("ml-2", phase === "done" ? (correct ? "text-phos" : "text-amber") : "text-ink-3")}>#{pos + 1}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        {phase !== "racing" && mode !== "preview" && (
          <Button variant={phase === "idle" ? "go" : "secondary"} onClick={race} sound="none">
            {phase === "idle" ? "Race them" : "Race again"}
          </Button>
        )}
        {phase === "done" && (
          <Segmented
            label="Scale"
            size="sm"
            value={human ? "human" : "real"}
            onChange={(v) => setHuman(v === "human")}
            options={[
              { value: "real", label: "Real time" },
              { value: "human", label: `If ${ref.label.toLowerCase()} took 1s` },
            ]}
          />
        )}
        {predicted && phase === "done" && (
          <Chip tone={order.every((id, i) => truth[i] === id) ? "ok" : "warn"}>
            Your order: {order.filter((id, i) => truth[i] === id).length}/{order.length} in place
          </Chip>
        )}
      </div>
      <AnimatePresence>
        {scene === "physics" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-md border border-amber-3/70 bg-amber-dim/30 px-4 py-3 text-sm leading-relaxed text-ink-1">
            <span className="eyebrow text-xs text-amber">Physics check</span>
            <div className="mt-1">
              Light in fiber ≈ 200 km per millisecond. Mumbai → Virginia is ~13,000 km each way, so the best possible round trip is ~130 ms before a single router, queue, or handshake.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
