import { describe, expect, it } from "vitest";
import { CHAPTERS, GRAPH, NODE_BY_ID } from "@/content/graph";

describe("curriculum graph", () => {
  it("has unique ids", () => {
    const seen = new Set<string>();
    const dupes = GRAPH.filter((n) => (seen.has(n.id) ? true : (seen.add(n.id), false))).map((n) => n.id);
    expect(dupes).toEqual([]);
  });

  it("only references prerequisites that exist", () => {
    const missing = GRAPH.flatMap((n) => n.prereqs.filter((p) => !NODE_BY_ID.has(p)).map((p) => `${n.id} -> ${p}`));
    expect(missing).toEqual([]);
  });

  it("is acyclic", () => {
    const state = new Map<string, 0 | 1 | 2>();
    const cycles: string[] = [];
    const visit = (id: string, path: string[]) => {
      const s = state.get(id);
      if (s === 2) return;
      if (s === 1) {
        cycles.push([...path, id].join(" -> "));
        return;
      }
      state.set(id, 1);
      for (const p of NODE_BY_ID.get(id)!.prereqs) visit(p, [...path, id]);
      state.set(id, 2);
    };
    for (const n of GRAPH) visit(n.id, []);
    expect(cycles).toEqual([]);
  });

  it("puts every node in a known chapter, and every chapter has nodes", () => {
    const ids = new Set(CHAPTERS.map((c) => c.id));
    expect(GRAPH.filter((n) => !ids.has(n.chapter)).map((n) => n.id)).toEqual([]);
    expect(CHAPTERS.filter((c) => !GRAPH.some((n) => n.chapter === c.id)).map((c) => c.id)).toEqual([]);
  });

  it("covers the brief's required breadth", () => {
    expect(GRAPH.length).toBeGreaterThan(180);
    for (const id of ["latency-numbers", "littles-law", "consistent-hashing", "consensus-raft", "hybrid-search-rrf", "prompt-injection-indirect", "docker-images-layers", "git-dag", "prod-polling-storm", "capstone-legal-search"]) {
      expect(NODE_BY_ID.has(id), id).toBe(true);
    }
  });
});
