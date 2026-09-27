import { Simulation } from "../src/engine/sim";
import { designCost, LaunchConfig, launchSpec, memPerBox, type LaunchDesign } from "../src/widgets/launch/spec";

const c = LaunchConfig.parse({ cpu: { kind: "lognormal", median: 0.012, p99: 0.05 }, io: { kind: "lognormal", median: 0.05, p99: 0.2 } });
const designs: [string, LaunchDesign][] = [
  ["naive 1×2xl", { instance: "m7i.2xlarge", count: 1, workers: 17, algorithm: "round-robin", outlier: false, hc: "shallow", session: "local" }],
  ["5×L default workers", { instance: "m7i.large", count: 5, workers: 5, algorithm: "round-robin", outlier: false, hc: "shallow", session: "redis" }],
  ["6×L w16 RR redis", { instance: "m7i.large", count: 6, workers: 16, algorithm: "round-robin", outlier: false, hc: "shallow", session: "redis" }],
  ["6×L w16 LOR+out redis", { instance: "m7i.large", count: 6, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "redis" }],
  ["7×L w16 LOR+out redis", { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "redis" }],
  ["7×L w16 LOR+out local", { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "local" }],
  ["7×L w16 LOR+out cookie", { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "cookie" }],
  ["7×L w16 LOR noout redis", { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: false, hc: "shallow", session: "redis" }],
  ["3×XL w32 LOR+out redis", { instance: "m7i.xlarge", count: 3, workers: 32, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "redis" }],
  ["3×XL w32 P2C+out cookie", { instance: "m7i.xlarge", count: 3, workers: 32, algorithm: "p2c", outlier: true, hc: "shallow", session: "cookie" }],
  ["7×L w8 LOR+out redis", { instance: "m7i.large", count: 7, workers: 8, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "redis" }],
  ["8×L w12 LOR+out cookie", { instance: "m7i.large", count: 8, workers: 12, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "cookie" }],
];
for (const [name, d] of designs) {
  const sim = new Simulation(launchSpec(c, d), c.seed);
  sim.runUntil(c.durationS);
  const a = sim.aggregate(c.fromS, c.durationS);
  const tot = a.ok + a.failed;
  const m = memPerBox(c, d);
  console.log(`${name.padEnd(26)} p99=${a.p99.toFixed(3)} err=${(a.errorRate * 100).toFixed(2)}% loss=${((a.failReasons.session / tot) * 100).toFixed(2)}% cost=$${designCost(d).toFixed(0)} mem=${m.used.toFixed(1)}/${m.total}`);
}
