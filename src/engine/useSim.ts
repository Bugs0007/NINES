"use client";
/**
 * React binding for the simulation: spins up the worker (or a main-thread fallback),
 * keeps windows/notables in state, and particle frames in a ref for the canvas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SimHost, type HostIn, type HostOut, type InstantNode } from "./host";
import type { NotableEvent, SimPatch, SimSpec, TimedPatch, VizParticle, WindowMetrics } from "./types";

export interface FrameData {
  t: number;
  live: VizParticle[];
  finished: VizParticle[];
  instant: Record<string, InstantNode>;
  /** Monotonic counter so consumers can tell frames apart. */
  seq: number;
}

interface Port {
  send: (m: HostIn) => void;
  close: () => void;
}

function openPort(onMsg: (m: HostOut) => void): Port {
  if (typeof Worker !== "undefined") {
    try {
      const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<HostOut>) => onMsg(e.data);
      return { send: (m) => w.postMessage(m), close: () => w.terminate() };
    } catch {
      /* fall through */
    }
  }
  const host = new SimHost(onMsg);
  return { send: (m) => host.handle(m), close: () => host.handle({ type: "dispose" }) };
}

export interface UseSimOptions {
  spec: SimSpec | null;
  seed?: string;
  speed?: number;
  vizTarget?: number;
  until?: number;
  /** Keep at most this many windows in state. */
  keepWindows?: number;
  onWindow?: (w: WindowMetrics) => void;
  onNotable?: (e: NotableEvent) => void;
  onDone?: (t: number, log: TimedPatch[]) => void;
}

export function useSim(opts: UseSimOptions) {
  const { spec, seed = "nines", speed = 1, vizTarget = 400, until, keepWindows = 180 } = opts;
  const port = useRef<Port | null>(null);
  const frame = useRef<FrameData>({ t: 0, live: [], finished: [], instant: {}, seq: 0 });
  const [windows, setWindows] = useState<WindowMetrics[]>([]);
  /** Every window of the current run (not truncated), for end-of-run evaluation. */
  const allWindows = useRef<WindowMetrics[]>([]);
  const allNotables = useRef<NotableEvent[]>([]);
  const [notables, setNotables] = useState<NotableEvent[]>([]);
  const [t, setT] = useState(0);
  const [done, setDone] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const cbs = useRef(opts);
  cbs.current = opts;
  const speedRef = useRef(speed);

  useEffect(() => {
    const p = openPort((m) => {
      switch (m.type) {
        case "frame": {
          const f = frame.current;
          // accumulate finished particles until the renderer consumes them
          frame.current = { t: m.t, live: m.live, finished: f.finished.concat(m.finished).slice(-600), instant: m.instant, seq: f.seq + 1 };
          return;
        }
        case "window":
          allWindows.current.push(m.w);
          setWindows((ws) => {
            const next = ws.length >= keepWindows ? ws.slice(ws.length - keepWindows + 1) : ws.slice();
            next.push(m.w);
            return next;
          });
          setT(m.w.t + m.w.dt);
          cbs.current.onWindow?.(m.w);
          return;
        case "notable":
          allNotables.current.push(m.e);
          setNotables((ns) => [...ns.slice(-50), m.e]);
          cbs.current.onNotable?.(m.e);
          return;
        case "done":
          setDone(true);
          setT(m.t);
          cbs.current.onDone?.(m.t, m.patchLog);
          return;
        case "ready":
          return;
      }
    });
    port.current = p;
    return () => {
      p.close();
      port.current = null;
    };
  }, [keepWindows]);

  const specKey = spec ? JSON.stringify(spec) : "";
  useEffect(() => {
    if (!spec || !port.current) return;
    allWindows.current = [];
    allNotables.current = [];
    setWindows([]);
    setNotables([]);
    setT(0);
    setDone(false);
    frame.current = { t: 0, live: [], finished: [], instant: {}, seq: frame.current.seq + 1 };
    port.current.send({ type: "init", spec, seed, speed: speedRef.current, vizTarget, until });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, seed, until, epoch]);

  useEffect(() => {
    speedRef.current = speed;
    port.current?.send({ type: "speed", speed });
  }, [speed]);

  useEffect(() => {
    port.current?.send({ type: "vizTarget", value: vizTarget });
  }, [vizTarget]);

  const patch = useCallback((p: SimPatch) => port.current?.send({ type: "patch", patch: p }), []);
  const restart = useCallback(() => setEpoch((e) => e + 1), []);
  const replay = useCallback(
    (log: TimedPatch[], replaySpeed: number, replayUntil: number) => {
      if (!spec) return;
      allWindows.current = [];
      allNotables.current = [];
      setWindows([]);
      setNotables([]);
      setT(0);
      setDone(false);
      port.current?.send({ type: "replay", spec, seed, log, speed: replaySpeed, vizTarget, until: replayUntil });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specKey, seed, vizTarget],
  );
  const fastForward = useCallback((to: number) => port.current?.send({ type: "fast", until: to }), []);
  const consumeFinished = useCallback(() => {
    const f = frame.current.finished;
    frame.current = { ...frame.current, finished: [] };
    return f;
  }, []);

  return { windows, notables, t, done, frame, patch, restart, replay, fastForward, consumeFinished, allWindows, allNotables };
}

export type SimHandle = ReturnType<typeof useSim>;
