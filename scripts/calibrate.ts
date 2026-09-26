import { Simulation } from "../src/engine/sim";
import type { SimSpec } from "../src/engine/types";

function capacity(c: number, peak: number) {
  const spec: SimSpec = {
    nodes: [
      { kind: "client", id: "c", target: "api", rate: { kind: "keyframes", points: [[0, 40], [30, peak], [90, peak], [100, 60]] }, timeoutS: 10 },
      { kind: "server", id: "api", cores: c, workers: c, steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.02, p99: 0.12 } }] },
    ],
  };
  const s = new Simulation(spec, "capacity");
  s.runUntil(100);
  const a = s.aggregate(35, 90);
  return `c=${c} p99=${a.p99.toFixed(3)} p50=${a.p50.toFixed(3)} err=${a.errorRate.toFixed(4)} util=${a.util["api"]?.toFixed(2)}`;
}
for (const peak of [140]) for (const c of [4, 5, 6, 7, 8]) console.log(capacity(c, peak));
