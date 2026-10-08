import { describe, expect, it } from "vitest";
import { GRAPH } from "@/content/graph";
import { lockReason, nextStep } from "@/content/progression";

describe("nextStep", () => {
  it("starts a brand-new player on the first mission", () => {
    const n = nextStep(new Set(), 0);
    expect(n.kind).toBe("build");
    expect(n.href).toBe("/mission/latency-numbers");
    expect(n.cta).toBe("Start level 1");
  });

  it("puts repairs before new missions", () => {
    const n = nextStep(new Set(["latency-numbers"]), 2);
    expect(n.kind).toBe("repair");
    expect(n.href).toBe("/shift");
    expect(n.title).toContain("2 services");
  });

  it("moves on to the next unlocked mission, then the boss", () => {
    const a1 = ["latency-numbers", "littles-law", "queueing-utilization", "scale-up-vs-out", "load-balancing", "stateless-services"];
    const mid = nextStep(new Set(a1.slice(0, 2)), 0);
    expect(mid.kind).toBe("build");
    expect(mid.href).toBe("/mission/queueing-utilization");
    // the Foundry has no prerequisites, so once Core Grid A1 is built the next mission is still a real one
    const afterA1 = nextStep(new Set(a1), 0);
    expect(["build", "boss"]).toContain(afterA1.kind);
  });

  it("says so when everything built is done", () => {
    const all = new Set(GRAPH.filter((n) => n.status === "built").map((n) => n.id));
    expect(nextStep(all, 0).kind).toBe("done");
  });
});

describe("lockReason", () => {
  it("names the missing prerequisites", () => {
    expect(lockReason("littles-law", new Set())).toMatch(/Unlocks after you finish Latency Numbers/);
  });
  it("is null for something you can start or have finished", () => {
    expect(lockReason("latency-numbers", new Set())).toBeNull();
    expect(lockReason("littles-law", new Set(["latency-numbers"]))).toBeNull();
    expect(lockReason("latency-numbers", new Set(["latency-numbers"]))).toBeNull();
  });
  it("explains unbuilt content", () => {
    expect(lockReason("tail-latency", new Set(["latency-numbers", "littles-law", "queueing-utilization"]))).toMatch(/later release/);
  });
});
