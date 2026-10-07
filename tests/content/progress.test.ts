import { describe, expect, it } from "vitest";
import { isSectionFinished, LEVELS, mergeRows, requiredLevels, SECTIONS_WITH_LEVELS, validateRows, type ClientRow, type ProgressRow } from "@/content/progress-model";
import { deriveRows } from "@/game/progress-rows";
import { freshConcept, type ConceptProgress, type GameEvent } from "@/game/db";
import { computeFunnel } from "@/server/funnel";

const row = (level: string, over: Partial<ClientRow> = {}): ClientRow => ({ section: "a1", level, status: "completed", score: 50, attempts: 1, ...over });
const stored = (level: string, over: Partial<ProgressRow> = {}): ProgressRow => ({ ...row(level), completedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over });

describe("the progress model", () => {
  it("knows the levels in this build and the sections they sit in", () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(11);
    expect(SECTIONS_WITH_LEVELS).toEqual(expect.arrayContaining(["a1", "b1"]));
    expect(requiredLevels("a1")).toContain("boss-launch-day");
    expect(requiredLevels("a1")).not.toContain("inc-fourth-box"); // side incidents are optional
  });

  it("a section is finished only when every mission and the boss are done", () => {
    const need = requiredLevels("b1");
    expect(isSectionFinished("b1", new Set(need))).toBe(true);
    expect(isSectionFinished("b1", new Set(need.slice(1)))).toBe(false);
    expect(isSectionFinished("nope", new Set())).toBe(false);
  });
});

describe("validateRows: what the server refuses", () => {
  it("accepts a legitimate first level", () => {
    const { ok, errors } = validateRows([row("latency-numbers")], []);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(1);
  });

  it("rejects levels that don't exist, or sit in the wrong section", () => {
    const { ok, errors } = validateRows([row("not-a-level"), row("latency-numbers", { section: "b1" })], []);
    expect(ok).toEqual([]);
    expect(errors.map((e) => e.reason)).toEqual(["unknown level", "wrong section"]);
  });

  it("rejects a completed level whose prerequisites aren't done (faking a boss)", () => {
    const { ok, errors } = validateRows([row("boss-launch-day", { score: 100 })], []);
    expect(ok).toEqual([]);
    expect(errors[0]?.reason).toMatch(/prerequisites not completed/);
  });

  it("allows a level whose prerequisites are done earlier or in the same write", () => {
    expect(validateRows([row("littles-law")], [stored("latency-numbers")]).errors).toEqual([]);
    expect(validateRows([row("latency-numbers"), row("littles-law")], []).errors).toEqual([]);
  });

  it("rejects out-of-range numbers, unknown fields and oversized writes outright", () => {
    for (const bad of [row("latency-numbers", { score: 101 }), row("latency-numbers", { score: -1 }), row("latency-numbers", { attempts: 5000 }), { ...row("latency-numbers"), xp: 9999 }, row("latency-numbers", { status: "done" as never })]) {
      const r = validateRows([bad], []);
      expect(r.ok, JSON.stringify(bad)).toEqual([]);
      expect(r.errors.length).toBeGreaterThan(0);
    }
    expect(validateRows(new Array(201).fill(row("latency-numbers")), []).ok).toEqual([]);
    expect(validateRows("nope", []).ok).toEqual([]);
  });

  it("rejects a score on an unfinished level and duplicates in one write", () => {
    expect(validateRows([row("latency-numbers", { status: "in_progress", score: 80 })], []).errors[0]?.reason).toMatch(/no score/);
    expect(validateRows([row("latency-numbers"), row("latency-numbers")], []).errors[0]?.reason).toMatch(/duplicate/);
  });

  it("one bad row doesn't block a good one", () => {
    const { ok, errors } = validateRows([row("latency-numbers"), row("boss-launch-day")], []);
    expect(ok.map((r) => r.level)).toEqual(["latency-numbers"]);
    expect(errors).toHaveLength(1);
  });
});

describe("mergeRows: progress only moves forward", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("sets completedAt once, on first completion, and keeps it", () => {
    const first = mergeRows([], [row("latency-numbers")], now)[0]!;
    expect(first.completedAt).toBe(now.toISOString());
    const again = mergeRows([first], [row("latency-numbers")], new Date("2026-11-01T00:00:00.000Z"))[0]!;
    expect(again.completedAt).toBe(now.toISOString());
  });

  it("never takes a completed level back to in progress, and keeps the best score and most attempts", () => {
    const prev = stored("latency-numbers", { score: 80, attempts: 4 });
    const m = mergeRows([prev], [row("latency-numbers", { status: "in_progress", score: null, attempts: 1 })], now)[0]!;
    expect(m.status).toBe("completed");
    expect(m.score).toBe(80);
    expect(m.attempts).toBe(4);
    expect(m.completedAt).toBe(prev.completedAt);
    const better = mergeRows([prev], [row("latency-numbers", { score: 100, attempts: 6 })], now)[0]!;
    expect([better.score, better.attempts]).toEqual([100, 6]);
  });

  it("an unfinished level has no score and no completion time", () => {
    const m = mergeRows([], [row("latency-numbers", { status: "in_progress", score: null, attempts: 0 })], now)[0]!;
    expect([m.status, m.score, m.completedAt]).toEqual(["in_progress", null, null]);
  });
});

describe("deriveRows: the local save becomes rows", () => {
  const built = (id: string, over: Partial<ConceptProgress> = {}): ConceptProgress => ({ ...freshConcept(id), builtAt: 1, missionRuns: 2, bestStars: 1, ...over });
  const ev = (type: GameEvent["type"], conceptId: string, data: Record<string, unknown> = {}): GameEvent => ({ t: 1, type, xp: 0, conceptId, data });

  it("a built concept is a completed level with a score and its run count", () => {
    const rows = deriveRows([built("latency-numbers")], { bossesBeaten: [], incidentsResolved: [] }, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ section: "a1", level: "latency-numbers", status: "completed", attempts: 2 });
    expect(rows[0]!.score).toBeGreaterThanOrEqual(0);
    expect(rows[0]!.score).toBeLessThanOrEqual(100);
  });

  it("activity without a build is in progress; bosses and incidents count when beaten", () => {
    const rows = deriveRows([], { bossesBeaten: ["boss-launch-day"], incidentsResolved: ["inc-fourth-box"] }, [ev("prediction", "tokens"), ev("boss", "boss-launch-day", { stars: 2 })]);
    const by = Object.fromEntries(rows.map((r) => [r.level, r]));
    expect(by.tokens).toMatchObject({ status: "in_progress", score: null });
    expect(by["boss-launch-day"]).toMatchObject({ status: "completed" });
    expect(by["inc-fourth-box"]).toMatchObject({ status: "completed", score: null });
  });

  it("what the browser derives from a sensible save always passes the server's validation", () => {
    const ids = ["latency-numbers", "littles-law", "queueing-utilization", "scale-up-vs-out", "load-balancing", "stateless-services"];
    const rows = deriveRows(ids.map((i) => built(i)), { bossesBeaten: ["boss-launch-day"], incidentsResolved: ["inc-fourth-box"] }, [ev("boss", "boss-launch-day", { stars: 1 })]);
    const { ok, errors } = validateRows(rows, []);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(rows.length);
  });
});

describe("computeFunnel", () => {
  const user = (userId: string, section: string, completed: string[]) => ({ userId, section, completed });
  it("counts signups, level 1 finishers and section finishers", () => {
    const b1 = requiredLevels("b1");
    const f = computeFunnel(5, [user("u1", "a1", ["latency-numbers"]), user("u2", "b1", b1), user("u3", "b1", b1.slice(1)), user("u2", "a1", ["latency-numbers", "littles-law"])]);
    expect(f.signedUp).toBe(5);
    expect(f.finishedLevel1).toBe(3);
    expect(f.sections.find((s) => s.section === "b1")?.finished).toBe(1);
    expect(f.sections.find((s) => s.section === "a1")?.finished).toBe(0);
  });
  it("is all zeros with no progress", () => {
    const f = computeFunnel(0, []);
    expect([f.signedUp, f.finishedLevel1, ...f.sections.map((s) => s.finished)]).toEqual([0, 0, 0, 0]);
  });
});
