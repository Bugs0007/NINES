import { describe, expect, it } from "vitest";
import { CHAPTERS, GRAPH } from "@/content/graph";
import { CHAPTER_LEARNING, CONCEPT_LEARNING, LOOP, SECTION_LEARNING } from "@/content/learning";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("learning layer", () => {
  it("every built node says what it teaches and why", () => {
    const missing = GRAPH.filter((n) => n.status !== "planned" && !CONCEPT_LEARNING[n.id]).map((n) => n.id);
    expect(missing).toEqual([]);
  });

  it("entries refer to real nodes and stay short", () => {
    for (const [id, l] of Object.entries(CONCEPT_LEARNING)) {
      expect(GRAPH.some((n) => n.id === id), id).toBe(true);
      expect(words(l.canDo), `${id}.canDo`).toBeLessThanOrEqual(32);
      expect(words(l.why), `${id}.why`).toBeLessThanOrEqual(40);
      expect(words(l.keyIdea), `${id}.keyIdea`).toBeLessThanOrEqual(16);
    }
  });

  it("every chapter with a built node has a learning summary", () => {
    const chapters = new Set(GRAPH.filter((n) => n.status !== "planned").map((n) => n.chapter));
    for (const c of chapters) {
      expect(CHAPTERS.some((ch) => ch.id === c)).toBe(true);
      expect(CHAPTER_LEARNING[c], c).toBeDefined();
      expect(CHAPTER_LEARNING[c]!.outcomes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("sections and the loop are complete and plain", () => {
    for (const s of Object.values(SECTION_LEARNING)) expect(words(s.because)).toBeLessThanOrEqual(45);
    expect(LOOP.map((l) => l.step)).toEqual(["Hook", "Predict", "Play", "Why", "Challenge", "Explain", "Review"]);
    const all = JSON.stringify([CONCEPT_LEARNING, CHAPTER_LEARNING, SECTION_LEARNING, LOOP]);
    expect(all).not.toMatch(/!/);
  });
});
