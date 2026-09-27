/**
 * Incidents must behave as their story claims: the page is real, fixes fix, and harmful actions don't.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "@/engine/sim";
import { INCIDENTS } from "@/incident";
import type { Incident } from "@/incident/types";

function runWith(inc: Incident, actions: string[], at: number, until: number) {
  const sim = new Simulation(inc.spec, inc.seed);
  sim.runUntil(at);
  for (const id of actions) {
    const m = inc.mitigations.find((x) => x.id === id)!;
    for (const p of m.patches({ t: at, applied: actions })) sim.apply({ op: "after", delay: p.delay, patch: p.patch });
  }
  sim.runUntil(until);
  return sim;
}

describe.each(INCIDENTS.map((i) => [i.code, i] as const))("%s", (_code, inc) => {
  it("is burning when the page fires", () => {
    const sim = new Simulation(inc.spec, inc.seed);
    sim.runUntil(inc.pageAt + 5);
    expect(sim.aggregate(inc.pageAt - 30, inc.pageAt).errorRate).toBeGreaterThan(0.1);
  });

  it("keeps burning if nobody acts", () => {
    const sim = runWith(inc, [], inc.pageAt, inc.pageAt + 240);
    expect(sim.aggregate(inc.pageAt + 180, inc.pageAt + 240).errorRate).toBeGreaterThan(0.1);
  });

  const fixes = inc.mitigations.filter((m) => m.kind === "fix" || m.kind === "mitigate");
  it.each(fixes.map((m) => [m.id, m] as const))("'%s' brings checkout back within SLO", (_id, m) => {
    const sim = runWith(inc, [m.id], inc.pageAt, inc.pageAt + 300);
    const agg = sim.aggregate(inc.pageAt + 200, inc.pageAt + 300);
    expect(agg.errorRate).toBeLessThan(inc.slo.errorRate);
  });

  const bad = inc.mitigations.filter((m) => m.kind === "harmful" || m.kind === "neutral");
  it.each(bad.map((m) => [m.id, m] as const))("'%s' does not resolve it", (_id, m) => {
    const sim = runWith(inc, [m.id], inc.pageAt, inc.pageAt + 300);
    expect(sim.aggregate(inc.pageAt + 200, inc.pageAt + 300).errorRate).toBeGreaterThan(inc.slo.errorRate);
  });

  it("has exactly one correct hypothesis and evidence for it", () => {
    expect(inc.hypotheses.filter((h) => h.correct)).toHaveLength(1);
    expect(inc.evidence.filter((e) => e.key).length).toBeGreaterThanOrEqual(3);
    const cats = new Set([...inc.staticLogs.map((l) => l.evidence), ...inc.traces.map((t) => t.evidence)].filter(Boolean));
    for (const e of inc.evidence) if (!["cpu-low", "env-missing", "gunicorn-1-worker", "health-nginx", "target-latency"].includes(e.id)) expect(cats.has(e.id), e.id).toBe(true);
  });
});
