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

/** Compact human time for axis ticks and narrow screens: 17 min, 12 d, 4.8 yr. */
function humanShort(s: number): string {
  const f = (v: number, u: string) => `${v < 10 && Math.abs(v - Math.round(v)) > 0.05 ? v.toFixed(1) : Math.round(v)} ${u}`;
  if (s < 60) return f(s, "s");
  if (s < 3600) return f(s / 60, "min");
  if (s < 86400) return f(s / 3600, "h");
  if (s < 86400 * 60) return f(s / 86400, "d");
  if (s < 86400 * 365 * 2) return f(s / (86400 * 30.4), "mo");
  return f(s / (86400 * 365), "yr");
}

/** Label column, gap, track, gap, value column: the axis and grid lines sit exactly over the tracks. */
const AXIS_INSET = "sm:ml-[calc(32%+0.75rem)] sm:mr-[8.25rem]";

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
        className="flex flex-1 flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="my-auto flex flex-col gap-2">
          {/* axis: tick labels, then the 100 ms marker on its own line, pointing down at its grid line */}
          <div className={cx("relative h-9", AXIS_INSET)}>
            {ticks.map((t, k) => (
              <span
                key={t.lg}
                className={cx("absolute top-0 whitespace-nowrap font-mono text-[11px] text-ink-2", k === ticks.length - 1 ? "-translate-x-full sm:-translate-x-1/2" : "-translate-x-1/2")}
                style={{ left: `${x(t.lg)}%` }}
              >
                {human ? humanShort(Math.pow(10, t.lg) / ref.ns) : t.label}
              </span>
            ))}
            <span className="absolute top-[18px] -translate-x-[calc(100%-0.4rem)] whitespace-nowrap text-[11px] font-medium text-amber" style={{ left: `${x(8)}%` }}>
              100 ms feels instant ▼
            </span>
          </div>
          <div className="relative flex flex-col gap-2.5 sm:gap-1">
            {/* grid lines (sm and up; phones get tick marks inside each track) */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[calc(32%+0.75rem)] right-[8.25rem] hidden sm:block">
              {ticks.map((t) => (
                <span key={t.lg} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${x(t.lg)}%` }} />
              ))}
              <span className="absolute inset-y-0 w-px bg-amber/40" style={{ left: `${x(8)}%` }} />
              {phase !== "idle" && <span className="absolute inset-y-0 w-px bg-phos/80" style={{ left: `${Math.min(100, x(clock))}%` }} />}
            </div>
            {order.map((id, i) => {
              const it = c.items.find((q) => q.id === id)!;
              const lg = Math.log10(it.ns);
              const done = finishOrder.includes(id);
              const pos = finishOrder.indexOf(id);
              const correct = truth.indexOf(id) === i;
              const progress = phase === "idle" ? 0 : Math.min(x(lg), x(clock));
              return (
                <div key={id} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:min-h-9 sm:grid-cols-[32%_minmax(0,1fr)_7.5rem]">
                  <div className="col-start-1 row-start-1 flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 font-mono text-2xs text-ink-3">{i + 1}</span>
                    <span className="min-w-0 text-[13px] leading-snug text-ink-0 sm:text-sm">{it.label}</span>
                  </div>
                  <div className="relative col-span-2 row-start-2 h-5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    <div aria-hidden className="absolute inset-0 sm:hidden">
                      {ticks.map((t) => (
                        <span key={t.lg} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${x(t.lg)}%` }} />
                      ))}
                      <span className="absolute inset-y-0 w-px bg-amber/40" style={{ left: `${x(8)}%` }} />
                    </div>
                    <motion.div
                      className={cx("absolute inset-y-1 left-0 rounded-full", done ? (phase === "done" && !correct ? "bg-amber/60" : "bg-phos/60") : "bg-phos/30")}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.05, ease: "linear" }}
                    />
                  </div>
                  <div className="col-start-2 row-start-1 min-h-5 min-w-[4.75rem] text-right sm:col-start-3 sm:min-w-0">
                    <AnimatePresence>
                      {done && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={spring.bounce}
                          className="inline-block origin-right whitespace-nowrap font-mono text-xs tabular"
                        >
                          {human ? (
                            <>
                              <span className="text-ink-0 sm:hidden">{humanShort(it.ns / ref.ns)}</span>
                              <span className="hidden text-ink-0 sm:inline">{humanDuration(it.ns / ref.ns)}</span>
                            </>
                          ) : (
                            <span className="text-ink-0">{fmtLatency(it.ns / 1e9)}</span>
                          )}
                          <span className={cx("ml-2", phase === "done" ? (correct ? "text-phos" : "text-amber") : "text-ink-3")}>#{pos + 1}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
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
              { value: "human", label: `If ${ref.label.replace(/^[A-Z](?=[a-z])/, (m) => m.toLowerCase())} took 1s` },
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
