import { VERIFIERS } from "../src/content/verifiers";
const CPU = { kind: "lognormal", median: 0.016, p99: 0.06 };
for (const load of [0.7, 0.8, 0.85, 0.9]) {
  const cfg = { variant: "compare", cpu: CPU, bigInstance: "m7i.2xlarge", smallInstance: "m7i.large", smallCount: 4, seed: "scale" };
  const big = VERIFIERS["scale-compare"]!({ config: cfg, load, side: "big", metric: "p99" });
  const small = VERIFIERS["scale-compare"]!({ config: cfg, load, side: "small", metric: "p99" });
  const bigm = VERIFIERS["scale-compare"]!({ config: cfg, load, side: "big", metric: "mean" });
  const smallm = VERIFIERS["scale-compare"]!({ config: cfg, load, side: "small", metric: "mean" });
  console.log(`load ${load}: big p99 ${big.toFixed(3)} small p99 ${small.toFixed(3)} | mean ${bigm.toFixed(3)} vs ${smallm.toFixed(3)}`);
}
