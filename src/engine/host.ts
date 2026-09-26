/**
 * SimHost drives a Simulation in (scaled) real time and streams frames + metrics.
 * Runs inside the Web Worker, or on the main thread as a fallback.
 */
import { Simulation } from "./sim";
import type { NotableEvent, SimPatch, SimSpec, TimedPatch, VizParticle, WindowMetrics } from "./types";

export type HostIn =
  | { type: "init"; spec: SimSpec; seed: string; speed: number; vizTarget: number; until?: number }
  | { type: "patch"; patch: SimPatch }
  | { type: "speed"; speed: number }
  | { type: "vizTarget"; value: number }
  /** Deterministic replay of a recorded run, played at `speed`. */
  | { type: "replay"; spec: SimSpec; seed: string; log: TimedPatch[]; speed: number; vizTarget: number; until: number }
  /** Run as fast as possible to `until`, streaming windows (no particles). */
  | { type: "fast"; until: number }
  | { type: "dispose" };

export interface InstantNode {
  busyCores: number;
  busyWorkers: number;
  queue: number;
  inflight: number;
  up: boolean;
}

export type HostOut =
  | { type: "frame"; t: number; live: VizParticle[]; finished: VizParticle[]; instant: Record<string, InstantNode> }
  | { type: "window"; w: WindowMetrics }
  | { type: "notable"; e: NotableEvent }
  | { type: "done"; t: number; patchLog: TimedPatch[] }
  | { type: "ready"; t: number };

const TICK_MS = 16;
const FRAME_MS = 33;
const BUDGET_MS = 11;

export class SimHost {
  private sim: Simulation | null = null;
  private speed = 1;
  private vizTarget = 400;
  private until = Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastReal = 0;
  private lastFrame = 0;
  private replayLog: TimedPatch[] | null = null;
  private replayIdx = 0;
  private finished = false;

  constructor(private post: (m: HostOut) => void) {}

  handle(m: HostIn): void {
    switch (m.type) {
      case "init":
        this.start(m.spec, m.seed, m.speed, m.vizTarget, m.until ?? Infinity, null);
        return;
      case "replay":
        this.start(m.spec, m.seed, m.speed, m.vizTarget, m.until, m.log);
        return;
      case "patch":
        if (this.sim && !this.replayLog) this.sim.apply(m.patch);
        return;
      case "speed":
        this.speed = Math.max(0, m.speed);
        return;
      case "vizTarget":
        this.vizTarget = m.value;
        return;
      case "fast":
        this.fast(m.until);
        return;
      case "dispose":
        this.stop();
        this.sim = null;
        return;
    }
  }

  private start(spec: SimSpec, seed: string, speed: number, vizTarget: number, until: number, log: TimedPatch[] | null): void {
    this.stop();
    this.speed = speed;
    this.vizTarget = vizTarget;
    this.until = until;
    this.replayLog = log;
    this.replayIdx = 0;
    this.finished = false;
    this.sim = new Simulation({ ...spec, vizRate: vizTarget > 0 ? 0.2 : 0 }, seed, {
      onWindow: (w) => this.post({ type: "window", w }),
      onNotable: (e) => this.post({ type: "notable", e }),
    });
    this.lastReal = now();
    this.lastFrame = 0;
    this.post({ type: "ready", t: 0 });
    this.loop();
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private advanceTo(target: number, budgetMs: number): void {
    const sim = this.sim!;
    const t0 = now();
    while (sim.now < target && now() - t0 < budgetMs) {
      let next = Math.min(target, sim.now + 0.05);
      if (this.replayLog) {
        const p = this.replayLog[this.replayIdx];
        if (p && p.t <= next) {
          sim.runUntil(p.t);
          sim.apply(p.patch);
          this.replayIdx++;
          continue;
        }
      }
      sim.runUntil(next);
      next = sim.now;
    }
  }

  private loop = (): void => {
    const sim = this.sim;
    if (!sim) return;
    const real = now();
    const dt = Math.min(0.25, (real - this.lastReal) / 1000);
    this.lastReal = real;
    if (this.speed > 0 && !this.finished) {
      const target = Math.min(this.until, sim.now + dt * this.speed);
      this.advanceTo(target, BUDGET_MS);
      if (sim.now >= this.until - 1e-9 && !this.finished) {
        this.finished = true;
        this.emitFrame();
        this.post({ type: "done", t: sim.now, patchLog: sim.patchLog });
      }
    }
    if (real - this.lastFrame >= FRAME_MS) {
      this.lastFrame = real;
      this.emitFrame();
    }
    this.timer = setTimeout(this.loop, TICK_MS);
  };

  private emitFrame(): void {
    const sim = this.sim!;
    // Keep roughly vizTarget particles alive by steering the sampling rate.
    if (this.vizTarget > 0) {
      const live = sim.liveCount;
      const ratio = this.vizTarget / Math.max(1, live);
      const next = Math.min(1, Math.max(0.0005, sim.vizRate * Math.min(1.25, Math.max(0.8, ratio))));
      sim.setVizRate(next);
    } else sim.setVizRate(0);
    const { live, finished } = sim.particles();
    const instant: Record<string, InstantNode> = {};
    for (const id of sim.nodeIds()) {
      const s = sim.instant(id);
      if (s) instant[id] = s;
    }
    this.post({ type: "frame", t: sim.now, live, finished, instant });
  }

  private fast(until: number): void {
    const sim = this.sim;
    if (!sim) return;
    this.stop();
    sim.setVizRate(0);
    sim.runUntil(until);
    this.finished = true;
    this.post({ type: "done", t: sim.now, patchLog: sim.patchLog });
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
