/**
 * Verifiers run a pack's `verify` blocks against the engine, using the same spec builders the
 * widgets use. If a caption claims something the sim doesn't do, a test fails.
 */
import { Simulation } from "@/engine/sim";
import { challengeSpec, playSpec, QueueLabConfig } from "@/widgets/queue-lab/spec";
import { BudgetConfig, computeWaterfall } from "@/widgets/latency-budget/spec";
import { buildFleet } from "@/widgets/fleet/spec";
import { compareSpecs, hugOptions, ScaleConfig } from "@/widgets/scale-lab/spec";
import { LbConfig, noisyOptions, type LbChoice } from "@/widgets/lb-lab/spec";
import { deployOptions, SessionConfig } from "@/widgets/session-lab/spec";
import type { Aggregate, SimSpec } from "@/engine/types";

function runAgg(spec: SimSpec, seed: string, until: number, from: number): Aggregate {
  const sim = new Simulation(spec, seed);
  sim.runUntil(until);
  return sim.aggregate(from, until);
}

function pick(a: Aggregate, metric: string): number {
  if (metric === "sessionLoss") return a.failReasons.session / Math.max(1, a.ok + a.failed);
  return Number((a as unknown as Record<string, number>)[metric]);
}

type Params = Record<string, unknown>;

export const VERIFIERS: Record<string, (p: Params) => number> = {
  /** Scale Lab compare: one side's aggregate metric at a given utilization. */
  "scale-compare": (p) => {
    const c = ScaleConfig.parse(p.config);
    const specs = compareSpecs(c, Number(p.load));
    const side = p.side === "big" ? specs.big : specs.small;
    return pick(runAgg(side, `${c.seed}-${p.side}`, 300, 30), String(p.metric));
  },
  /** Scale Lab hug challenge, exactly as the widget runs it. */
  "scale-hug": (p) => {
    const c = ScaleConfig.parse(p.config);
    return pick(runAgg(buildFleet(hugOptions(c, String(p.instance), Number(p.count))), c.seed, c.durationS, c.fromS), String(p.metric));
  },
  /** LB Lab noisy-neighbour challenge. */
  "lb-noisy": (p) => {
    const c = LbConfig.parse(p.config);
    return pick(runAgg(buildFleet(noisyOptions(c, p.choice as LbChoice)), c.seed, c.durationS, c.fromS), String(p.metric));
  },
  /** Session Lab rolling-deploy challenge. */
  "session-deploy": (p) => {
    const c = SessionConfig.parse(p.config);
    return pick(runAgg(buildFleet(deployOptions(c, p.mode as "local" | "sticky" | "redis" | "cookie")), c.seed, c.durationS, c.fromS), String(p.metric));
  },
  /** Total critical-path ms of the latency-budget puzzle with a set of fixes applied. */
  "budget-total": (p) => computeWaterfall(BudgetConfig.parse(p.config), p.fixes as string[]).total,
  /** Server-side completion rate of the Queue Lab play box at a given offered rate (its capacity when overloaded). */
  "queue-play-throughput": (p) => {
    const c = QueueLabConfig.parse(p.config);
    const spec = playSpec(c, Number(p.rps), c.workers, c.cores);
    const sim = new Simulation(spec, c.seed);
    if (p.slow) sim.apply({ op: "set", node: "api", changes: { failure: { slowFactor: Number(p.slow) } } });
    sim.runUntil(90);
    const ws = sim.windows.filter((w) => w.t >= 15);
    return ws.reduce((s, w) => s + (w.nodes["api"]?.completed ?? 0), 0) / ws.reduce((s, w) => s + w.dt, 0);
  },
  /** Run a Queue Lab challenge exactly as the widget does and return one aggregate metric. */
  "queue-challenge": (p) => {
    const c = QueueLabConfig.parse(p.config);
    const b = challengeSpec(c, Number(p.choice));
    const sim = new Simulation(b.spec, c.seed);
    sim.runUntil(c.durationS);
    const agg = sim.aggregate(c.fromS, c.durationS);
    return Number((agg as unknown as Record<string, number>)[String(p.metric)]);
  },
  /** Mean latency ratio between two utilizations of an M/M/1-like box. */
  "queue-ratio": (p) => {
    const S = Number(p.S ?? 0.02);
    const run = (rho: number) => {
      const sim = new Simulation(
        { nodes: [
          { kind: "client", id: "users", target: "api", rate: { kind: "const", rps: rho / S }, timeoutS: 1e9 },
          { kind: "server", id: "api", cores: 1, workers: 1, steps: [{ kind: "cpu", dist: { kind: "exp", mean: S } }] },
        ] },
        `ratio-${rho}`,
      );
      sim.runUntil(3000);
      return sim.aggregate(200).mean;
    };
    return run(Number(p.to)) / run(Number(p.from));
  },
};
