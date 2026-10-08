import { describe, expect, it } from "vitest";
import { GRAPH, TRACKS } from "@/content/graph";
import { INCIDENTS } from "@/incident";
import { PACKS } from "@/content/packs";
import { SECTIONS, sectionForTrack, trackLabel } from "@/content/sections";

const built = GRAPH.filter((n) => n.status === "built" || n.status === "verified");
const strip = (t: string) => t.replace(/^(Boss|Case|INC-\d+|INC|Field): /, "");

describe("section labels are generated from what is built", () => {
  it("every label is 'Name (contents)'", () => {
    for (const s of SECTIONS) {
      expect(s.label).toBe(`${s.name} (${s.short})`);
      expect(s.short.length, s.id).toBeGreaterThan(10);
      expect(s.story.length, s.id).toBeGreaterThan(10);
    }
  });

  it("the Core Grid and Agent Foundry list every built node in their details, and nothing unbuilt", () => {
    for (const track of ["A", "B"] as const) {
      const s = sectionForTrack(track)!;
      expect(s.name).toBe(TRACKS[track].district);
      const text = s.detail.flatMap((d) => d.points).join("\n");
      for (const n of built.filter((x) => x.track === track)) expect(text, `${track}:${n.id}`).toContain(strip(n.title));
      for (const n of GRAPH.filter((x) => x.track === track && !built.includes(x))) expect(text, `${track}:${n.id}`).not.toContain(strip(n.title));
    }
  });

  it("the short bracket names the first built concepts of the track", () => {
    for (const track of ["A", "B"] as const) {
      const concepts = built.filter((n) => n.track === track && n.kind === "concept");
      const s = sectionForTrack(track)!;
      for (const n of concepts.slice(0, 3)) expect(s.short).toContain(n.title);
      if (concepts.length > 3) expect(s.short).toContain(`and ${concepts.length - 3} more`);
    }
  });

  it("the Daily Shift, Incident Room and Codex labels count real content", () => {
    const get = (id: string) => SECTIONS.find((s) => s.id === id)!;
    const reviews = PACKS.flatMap((p) => p.reviews);
    expect(get("daily-shift").short).toContain(`${reviews.length} questions`);
    expect(get("codex").short).toContain(`${PACKS.length} cards`);
    for (const i of INCIDENTS) expect(get("incident-room").short).toContain(strip(i.title));
  });

  it("tracks with nothing built fall back to their district name", () => {
    expect(trackLabel("C")).toBe(TRACKS.C.district);
    expect(trackLabel("A")).toContain("Core Grid (");
  });
});
