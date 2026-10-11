import { Simulation } from "../src/engine/sim";
import { INCIDENTS } from "../src/incident";
const only = process.argv[2];
for (const inc of INCIDENTS) {
  if (only && inc.id !== only) continue;
  const run = (actions: string[], until: number) => {
    const sim = new Simulation(inc.spec, inc.seed);
    sim.runUntil(inc.pageAt);
    for (const id of actions) {
      const m = inc.mitigations.find((x) => x.id === id)!;
      for (const p of m.patches({ t: inc.pageAt, applied: actions })) sim.apply({ op: "after", delay: p.delay, patch: p.patch });
    }
    sim.runUntil(until);
    return sim;
  };
  const f = (x: number) => (x * 100).toFixed(1) + "%";
  const s0 = new Simulation(inc.spec, inc.seed); s0.runUntil(inc.pageAt + 5);
  console.log(inc.id, "at page", f(s0.aggregate(inc.pageAt - 30, inc.pageAt).errorRate), "slo", inc.slo.errorRate);
  console.log("  none +180..240", f(run([], inc.pageAt + 240).aggregate(inc.pageAt + 180, inc.pageAt + 240).errorRate));
  for (const m of inc.mitigations) { const a = run([m.id], inc.pageAt + 300).aggregate(inc.pageAt + 200, inc.pageAt + 300); console.log(`  ${m.kind.padEnd(8)} ${m.id.padEnd(18)} err ${f(a.errorRate)} p99 ${a.p99.toFixed(2)}`); }
}
