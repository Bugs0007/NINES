"use client";
/**
 * Challenge harness for simulation widgets: setup -> run -> evaluate -> (slow-motion replay with the cause highlighted).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findCause } from "@/engine/metrics";
import type { Aggregate, NotableEvent, SimSpec, TimedPatch, WindowMetrics } from "@/engine/types";
import { aggregateWindows } from "@/engine/metrics";
import { useSim } from "@/engine/useSim";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, fmtLatency, fmtPct } from "@/ui/kit";
import type { ChallengeVerdict } from "../types";

export type ChallengePhase = "setup" | "running" | "done" | "replay";

export interface SimChallengeOptions {
  seed: string;
  durationS: number;
  /** Evaluate from here (skip warm-up). */
  fromS?: number;
  speed?: number;
  slo: { p99?: number; errorRate?: number };
  /** Map the run's aggregate to the metrics the pack's conditions use. */
  toMetrics: (agg: Aggregate, windows: WindowMetrics[]) => Record<string, number>;
  onResult?: (m: Record<string, number>) => void;
  vizTarget?: number;
}

export function useSimChallenge(o: SimChallengeOptions) {
  const [phase, setPhase] = useState<ChallengePhase>("setup");
  const [runSpec, setRunSpec] = useState<SimSpec | null>(null);
  const [speed, setSpeed] = useState(o.speed ?? 3);
  const [result, setResult] = useState<{ metrics: Record<string, number>; agg: Aggregate } | null>(null);
  const [cause, setCause] = useState<{ event?: NotableEvent; firstBad?: WindowMetrics } | null>(null);
  const log = useRef<TimedPatch[]>([]);
  const opts = useRef(o);
  opts.current = o;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const sim = useSim({
    spec: runSpec,
    seed: o.seed,
    speed,
    until: o.durationS,
    vizTarget: o.vizTarget ?? 450,
    keepWindows: 400,
    onDone: (_t, patchLog) => {
      if (phaseRef.current === "replay") {
        setPhase("done");
        return;
      }
      log.current = patchLog;
      const windows = sim.allWindows.current;
      const agg = aggregateWindows(windows, opts.current.fromS ?? 0, opts.current.durationS);
      const metrics = opts.current.toMetrics(agg, windows);
      setResult({ metrics, agg });
      setCause(findCause(windows.filter((w) => w.t >= (opts.current.fromS ?? 0)), sim.allNotables.current, opts.current.slo));
      setPhase("done");
      opts.current.onResult?.(metrics);
    },
  });

  const run = useCallback(
    (spec: SimSpec) => {
      setResult(null);
      setCause(null);
      setSpeed(opts.current.speed ?? 3);
      setPhase("running");
      if (runSpec && JSON.stringify(runSpec) === JSON.stringify(spec)) sim.restart();
      else setRunSpec(spec);
      sfx.whoosh();
    },
    [runSpec, sim],
  );

  const replay = useCallback(() => {
    if (!runSpec) return;
    setPhase("replay");
    setSpeed(0.6);
    sim.replay(log.current, 0.6, opts.current.durationS);
  }, [runSpec, sim]);

  const reset = useCallback(() => {
    setPhase("setup");
    setResult(null);
    setCause(null);
    setRunSpec(null);
  }, []);

  return { phase, sim, run, replay, reset, result, cause, speed, setSpeed, runSpec };
}

export type SimChallenge = ReturnType<typeof useSimChallenge>;

/** Why a Run button is greyed out: the controls unlock once the predictions are locked in. */
export const WAIT_REASON = "Lock in your predictions first to unlock this.";

/** Run / fast-forward / replay controls and the post-run cause readout. */
export function ChallengeControls({
  ch,
  onRun,
  runLabel = "Run it",
  verdict,
  disabled,
  className,
}: {
  ch: SimChallenge;
  onRun: () => void;
  runLabel?: string;
  verdict?: ChallengeVerdict | null;
  disabled?: boolean;
  className?: string;
}) {
  const { phase } = ch;
  const inReplay = phase === "replay";
  const t = ch.sim.t;
  const cause = ch.cause?.event;
  const highlightNow = inReplay && cause && t >= cause.t - 3;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {phase === "setup" && (
          <>
            <Button variant="go" onClick={onRun} disabled={disabled} sound="thunk" title={disabled ? WAIT_REASON : undefined}>
              {runLabel}
            </Button>
            {disabled && <span className="text-[13px] text-ink-2">{WAIT_REASON}</span>}
          </>
        )}
        {(phase === "running" || phase === "replay") && (
          <>
            <Chip tone={inReplay ? "warn" : "ok"}>{inReplay ? "replay · slow motion" : "live"}</Chip>
            <Button size="sm" variant="ghost" onClick={() => ch.setSpeed(ch.speed >= 12 ? 3 : ch.speed * 2)}>
              {ch.speed.toFixed(ch.speed < 1 ? 1 : 0)}× speed
            </Button>
          </>
        )}
        {phase === "done" && (
          <>
            <Button variant="secondary" onClick={ch.reset}>
              Change setup
            </Button>
            {verdict && !verdict.won && ch.cause?.event && (
              <Button variant="primary" onClick={ch.replay}>
                Replay in slow motion
              </Button>
            )}
          </>
        )}
      </div>
      {((phase === "done" && verdict && !verdict.won) || inReplay) && ch.cause?.firstBad && cause && (
        <div className={cx("rounded-md border px-4 py-3 text-sm transition-colors duration-300", highlightNow || phase === "done" ? "border-amber-3/70 bg-amber-dim/40" : "border-line/80 bg-bg-1/60")}>
          <div className="eyebrow text-xs text-amber">
            First domino · <span className="font-mono tabular">t+{cause.t.toFixed(0)}s</span>
          </div>
          <div className="mt-1 text-ink-0">{cause.detail}</div>
          <div className="mt-1.5 text-xs tabular text-ink-2">
            SLO first broke at t+{ch.cause.firstBad.t.toFixed(0)}s: p99 {fmtLatency(ch.cause.firstBad.p99)}, errors {fmtPct(ch.cause.firstBad.errorRate, 1)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Nodes to ring during a replay, once the sim clock nears the cause. */
export function useReplayHighlight(ch: SimChallenge): string[] {
  const cause = ch.cause?.event;
  return useMemo(() => {
    if (!cause?.node) return [];
    if (ch.phase === "replay" && ch.sim.t >= cause.t - 3) return [cause.node];
    if (ch.phase === "done") return [cause.node];
    return [];
  }, [cause, ch.phase, ch.sim.t]);
}

/** Alarm while a live run is breaking its SLO for 2+ consecutive windows. */
export function useSloAlarm(windows: WindowMetrics[], slo: { p99?: number; errorRate?: number }, active: boolean) {
  const breached = useMemo(() => {
    if (!active || windows.length < 2) return false;
    const bad = (w: WindowMetrics) => (slo.p99 !== undefined && w.ok > 0 && w.p99 > slo.p99) || (slo.errorRate !== undefined && w.errorRate > slo.errorRate);
    return bad(windows[windows.length - 1]!) && bad(windows[windows.length - 2]!);
  }, [windows, slo.p99, slo.errorRate, active]);
  const was = useRef(false);
  useEffect(() => {
    if (breached && !was.current) sfx.alarm(true);
    if (!breached && was.current) {
      sfx.alarm(false);
      if (active) sfx.recovery();
    }
    was.current = breached;
  }, [breached, active]);
  useEffect(() => () => sfx.alarm(false), []);
  return breached;
}
