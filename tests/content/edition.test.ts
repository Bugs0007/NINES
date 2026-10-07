import { describe, expect, it } from "vitest";
import { dailyQuota } from "@/config/ai";
import { CHAPTERS, GRAPH, TRACKS } from "@/content/graph";
import { CHAPTER_LEARNING, CONCEPT_LEARNING, LOOP, SECTION_LEARNING } from "@/content/learning";
import { BOSSES, PACKS } from "@/content/packs";
import { INCIDENTS } from "@/incident";
import { BRIEFING } from "@/briefing/screens";
import { SECTIONS } from "@/content/sections";
import { bossIntro, chapterIntro, SECTION_INTROS } from "@/intro/specs";

/** Names, products and places that tie the build to its author. Public text must never mention them. */
const PERSONAL = /case\s*intel|caseintel|bhagath|samalla|ecourts|hyderabad/i;

/** Everything a stranger can read in the app. */
function publicText(): string {
  const intros = [...Object.values(SECTION_INTROS), ...CHAPTERS.map((c) => chapterIntro(c.id)), ...BOSSES.map((b) => bossIntro(b.id))];
  return JSON.stringify([PACKS, BOSSES, INCIDENTS, GRAPH, CHAPTERS, TRACKS, CONCEPT_LEARNING, CHAPTER_LEARNING, SECTION_LEARNING, LOOP, intros, BRIEFING, SECTIONS]);
}

describe("public text", () => {
  it("never mentions the author, their company, or their city", () => {
    // "ap-south-2 (Hyderabad)" is AWS's own name for a region, quoted in the cloud mapping; it is not a personal reference.
    const text = publicText().replace(/ap-south-2 \(Hyderabad\)/g, "ap-south-2");
    const hits = text.match(new RegExp(PERSONAL.source, "gi")) ?? [];
    expect(hits).toEqual([]);
  });
});

describe("AI quotas", () => {
  it("signing in raises the allowance; an admin is unlimited", () => {
    expect(dailyQuota("guest", "grade")).toBeLessThan(dailyQuota("player", "grade"));
    expect(dailyQuota("guest", "hint")).toBeLessThan(dailyQuota("player", "hint"));
    expect(dailyQuota("admin", "grade")).toBe(Infinity);
  });
});
