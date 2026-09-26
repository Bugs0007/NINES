/**
 * Micro-scenarios for `tune` reviews: one parameter, one metric, evaluated synchronously in the browser.
 */
import { Simulation } from "@/engine/sim";
import type { SimSpec } from "@/engine/types";

export interface TuneScenario {
  /** Build the spec for a parameter value. */
  build: (v: number) => SimSpec;
  durationS: number;
  fromS: number;
  seed: string;
}

export const TUNE: Record<string, TuneScenario> = {
  "ll-workers": {
    build: (workers) => ({
      nodes: [
        { kind: "client", id: "users", target: "api", rate: { kind: "const", rps: 60 }, timeoutS: 10 },
        { kind: "server", id: "api", cores: 4, workers, steps: [{ kind: "cpu", dist: { kind: "exp", mean: 0.01 } }, { kind: "io", dist: { kind: "lognormal", median: 0.13, p99: 0.25 } }] },
      ],
    }),
    durationS: 60,
    fromS: 10,
    seed: "tune-ll",
  },
  "qu-cores": {
    build: (cores) => ({
      nodes: [
        { kind: "client", id: "users", target: "api", rate: { kind: "const", rps: 150 }, timeoutS: 10 },
        { kind: "server", id: "api", cores, workers: cores, steps: [{ kind: "cpu", dist: { kind: "exp", mean: 0.02 } }] },
      ],
    }),
    durationS: 60,
    fromS: 10,
    seed: "tune-qu",
  },
};

export function runTune(id: string, v: number): Record<string, number> {
  const s = TUNE[id];
  if (!s) throw new Error(`unknown tune scenario ${id}`);
  const sim = new Simulation(s.build(v), s.seed);
  sim.runUntil(s.durationS);
  const a = sim.aggregate(s.fromS, s.durationS);
  return { p50: a.p50, p99: a.p99, errorRate: a.errorRate, throughput: a.throughput, mean: a.mean };
}
