import { describe, expect, it } from "vitest";
import { dailyQuota } from "@/config/ai";
import { chapterFor, nodeTitle, seenInFor, trackName } from "@/content/edition";
import { CHAPTERS, GRAPH, TRACKS } from "@/content/graph";
import { CHAPTER_LEARNING, CONCEPT_LEARNING, LOOP, SECTION_LEARNING } from "@/content/learning";
import { BOSSES, PACKS } from "@/content/packs";
import { INCIDENTS } from "@/incident";
import { bossIntro, chapterIntro, SECTION_INTROS, WELCOME_INTRO } from "@/intro/specs";

const PERSONAL = /case\s*intel|caseintel|bhagath|ecourts/i;

/** Everything a public player can read, rendered for the public edition. */
function publicText(): string {
  const packs = PACKS.map((p) => ({ ...p, codex: { ...p.codex, seenIn: seenInFor(p.codex.seenIn, "public") } }));
  const graph = GRAPH.map((n) => nodeTitle(n, "public"));
  const chapters = CHAPTERS.map((c) => chapterFor(c, "public"));
  const tracks = (Object.keys(TRACKS) as (keyof typeof TRACKS)[]).map((t) => trackName(t, "public"));
  const intros = [WELCOME_INTRO, ...Object.values(SECTION_INTROS), ...CHAPTERS.map((c) => chapterIntro(c.id)), ...BOSSES.map((b) => bossIntro(b.id))];
  return JSON.stringify([packs, BOSSES, INCIDENTS, graph, chapters, tracks, CONCEPT_LEARNING, CHAPTER_LEARNING, SECTION_LEARNING, LOOP, intros]);
}

describe("editions", () => {
  it("the public edition never mentions the owner's own company or name", () => {
    const hits = publicText().match(new RegExp(PERSONAL.source, "gi")) ?? [];
    expect(hits).toEqual([]);
  });

  it("every owner-only Codex line has a public line beside it", () => {
    for (const p of PACKS) {
      const owner = p.codex.seenIn.filter((s) => typeof s !== "string");
      if (owner.length) expect(seenInFor(p.codex.seenIn, "public").length, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("the owner edition keeps the personal notes and Track D", () => {
    const ownerLines = PACKS.flatMap((p) => seenInFor(p.codex.seenIn, "owner"));
    expect(ownerLines.some((l) => PERSONAL.test(l))).toBe(true);
    expect(trackName("D", "owner").name).toMatch(/Case Intel/);
    expect(nodeTitle({ id: "ci-polling-storm", title: "x" }, "owner")).toMatch(/Case Intel/);
    expect(chapterFor(CHAPTERS.find((c) => c.id === "d1")!, "owner").title).toMatch(/Case Intel/);
  });
});

describe("AI quotas", () => {
  it("signing in raises the allowance; the owner is unlimited", () => {
    expect(dailyQuota("guest", "grade")).toBeLessThan(dailyQuota("player", "grade"));
    expect(dailyQuota("guest", "hint")).toBeLessThan(dailyQuota("player", "hint"));
    expect(dailyQuota("owner", "grade")).toBe(Infinity);
  });
});
