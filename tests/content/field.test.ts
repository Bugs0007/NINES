/**
 * Field missions are content with a contract: a runnable path, hints that cost something, proof checks that a
 * passing sample satisfies, and no copy the style guide forbids.
 */
import { describe, expect, it } from "vitest";
import { NODE_BY_ID } from "@/content/graph";
import { FIELD_MISSIONS } from "@/field";
import { fieldXp, runChecks, trimProof } from "@/field/check";

const words = (s: string) => s.trim().split(/\s+/).length;
const EMOJI = /\p{Extended_Pictographic}/u;

describe("field missions", () => {
  it("covers every field node in the graph", () => {
    const planned = [...NODE_BY_ID.values()].filter((n) => n.kind === "field").map((n) => n.id).sort();
    expect(FIELD_MISSIONS.map((m) => m.id).sort()).toEqual(planned);
  });

  describe.each(FIELD_MISSIONS.map((m) => [m.id, m] as const))("%s", (_id, m) => {
    it("has a title that matches the graph", () => {
      expect(NODE_BY_ID.get(m.id)?.title).toBe(m.title);
    });

    it("has a runnable shape", () => {
      expect(m.steps.length).toBeGreaterThanOrEqual(4);
      expect(m.criteria.length).toBeGreaterThanOrEqual(3);
      expect(m.hints.length).toBeGreaterThanOrEqual(2);
      expect(m.proof.checks.length).toBeGreaterThanOrEqual(3);
      expect(m.sources.length).toBeGreaterThanOrEqual(2);
      expect(m.brief.length).toBeGreaterThanOrEqual(1);
      expect(new Set(m.steps.map((s) => s.id)).size).toBe(m.steps.length);
      expect(new Set(m.criteria.map((c) => c.id)).size).toBe(m.criteria.length);
      expect(new Set(m.proof.checks.map((c) => c.id)).size).toBe(m.proof.checks.length);
    });

    it("keeps cast lines to two sentences", () => {
      for (const l of m.brief) expect(l.line.split(/(?<=[.?])\s+/).length, l.line).toBeLessThanOrEqual(2);
    });

    it("follows the copy rules", () => {
      const text = JSON.stringify([m.title, m.goal, m.needs, m.steps, m.criteria, m.hints, m.debrief, m.honestPhysics, m.brief]);
      expect(text).not.toContain("!");
      expect(EMOJI.test(text)).toBe(false);
    });

    it("has a sample that passes every automatic check", () => {
      const results = runChecks(m.proof.checks, m.proof.sample);
      expect(results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
    });

    it("rejects an empty or irrelevant paste", () => {
      expect(runChecks(m.proof.checks, "").some((r) => r.ok)).toBe(false);
      expect(runChecks(m.proof.checks, "I did it and it worked fine").every((r) => r.ok)).toBe(false);
    });

    it("fits the grader's request limits", () => {
      expect(m.proof.prompt.length).toBeLessThanOrEqual(600);
      expect(m.proof.sample.length).toBeLessThanOrEqual(1200);
      expect(m.criteria.length).toBeLessThanOrEqual(6);
      for (const c of m.criteria) expect(c.criterion.length).toBeLessThanOrEqual(300);
      expect(words(m.goal)).toBeLessThanOrEqual(45);
    });

    it("prices hints so the reward never reaches zero", () => {
      expect(fieldXp(m, 0)).toBe(m.xp);
      expect(fieldXp(m, m.hints.length)).toBeGreaterThanOrEqual(Math.round(m.xp * 0.2));
      expect(fieldXp(m, m.hints.length)).toBeLessThan(m.xp);
    });

    it("links sources to https URLs", () => {
      for (const s of m.sources) expect(s.url).toMatch(/^https:\/\//);
    });
  });

  it("trims a long paste to its tail", () => {
    const t = trimProof("a".repeat(5000) + "RESULT");
    expect(t.length).toBe(1900);
    expect(t.endsWith("RESULT")).toBe(true);
  });
});
