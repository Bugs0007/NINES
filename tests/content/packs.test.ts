/**
 * Content lint: runs with `npm test`. Enforces the brief's rules on every pack and verifies
 * numeric claims against the simulation engine.
 */
import { describe, expect, it } from "vitest";
import { NODE_BY_ID } from "@/content/graph";
import { BOSSES, PACKS } from "@/content/packs";
import { lintPack } from "@/content/schema";
import { TUNE } from "@/content/scenarios";
import { VERIFIERS } from "@/content/verifiers";
import { MANIFEST, widgetMetrics } from "@/widgets/manifest";

describe.each(PACKS.map((p) => [p.id, p] as const))("pack %s", (_id, pack) => {
  it("passes the lint (word caps, counts, sources)", () => {
    expect(lintPack(pack, widgetMetrics)).toEqual([]);
  });

  it("exists in the curriculum graph with a non-planned status", () => {
    const n = NODE_BY_ID.get(pack.id);
    expect(n, "missing from graph.ts").toBeDefined();
    expect(n!.status).not.toBe("planned");
  });

  it("wires predictions and captions to real widget events and scenes", () => {
    const m = MANIFEST[pack.widget.id]!;
    for (const p of pack.predictions) expect(m.observes, `observe ${p.observe}`).toContain(p.observe);
    for (const c of pack.mechanism) if (c.scene) expect(m.scenes, `scene ${c.scene}`).toContain(c.scene);
  });

  it("uses tune scenarios that exist", () => {
    for (const r of pack.reviews) if (r.format === "tune") expect(TUNE[r.tuneScenario], r.tuneScenario).toBeDefined();
  });

  it.each(pack.verify.map((v) => [v.id, v] as const))("claim holds in the engine: %s", (_vid, v) => {
    const run = VERIFIERS[v.run];
    expect(run, `verifier ${v.run}`).toBeDefined();
    const got = run!(v.params);
    if (v.expect.min !== undefined) expect(got, v.claim).toBeGreaterThanOrEqual(v.expect.min);
    if (v.expect.max !== undefined) expect(got, v.claim).toBeLessThanOrEqual(v.expect.max);
  });
});

describe.each(BOSSES.map((b) => [b.id, b] as const))("boss %s", (_id, boss) => {
  it("passes the lint", () => {
    expect(lintPack(boss, widgetMetrics)).toEqual([]);
  });

  it("exercises concepts that exist", () => {
    for (const id of boss.exercises) expect(NODE_BY_ID.has(id), id).toBe(true);
  });

  it.each(boss.verify.map((v) => [v.id, v] as const))("design behaves as claimed: %s", (_vid, v) => {
    const got = VERIFIERS[v.run]!(v.params);
    if (v.expect.min !== undefined) expect(got, v.claim).toBeGreaterThanOrEqual(v.expect.min);
    if (v.expect.max !== undefined) expect(got, v.claim).toBeLessThanOrEqual(v.expect.max);
  });
});
