/**
 * Validation tests: the engine must reproduce queueing theory and the emergent behaviours
 * the game teaches. If one of these fails, the game is lying to the player.
 */
import { describe, expect, it } from "vitest";
import { Simulation } from "./sim";
import type { ServerSpec, SimSpec } from "./types";
import { lognormalQuantile, Zipf } from "./dist";

function singleQueue(lambda: number, meanS: number, c = 1, extra: Partial<ServerSpec> = {}): SimSpec {
  return {
    hopS: 0,
    nodes: [
      { kind: "client", id: "c", target: "s", rate: { kind: "const", rps: lambda }, timeoutS: 1e9 },
      { kind: "server", id: "s", cores: c, workers: c, steps: [{ kind: "cpu", dist: { kind: "exp", mean: meanS } }], ...extra },
    ],
  };
}

function erlangC(c: number, a: number): number {
  // a = lambda * S (offered load in Erlangs)
  let sum = 0;
  let term = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) term *= a / k;
    sum += term;
  }
  const top = term * (a / c) * (c / (c - a));
  return top / (sum + top);
}

describe("queueing theory", () => {
  it.each([
    [0.5, 0.05],
    [0.8, 0.05],
    [0.9, 0.08],
  ])("M/M/1 mean sojourn matches S/(1-rho) at rho=%s", (rho, tol) => {
    const S = 0.01;
    const lambda = rho / S;
    const sim = new Simulation(singleQueue(lambda, S), "mm1");
    sim.runUntil(6000);
    const agg = sim.aggregate(200);
    const theory = S / (1 - rho);
    expect(Math.abs(agg.mean - theory) / theory).toBeLessThan(tol);
  });

  it("M/M/1 p99 matches ln(100)/(mu-lambda)", () => {
    const S = 0.01;
    const lambda = 80;
    const sim = new Simulation(singleQueue(lambda, S), "mm1-p99");
    sim.runUntil(4000);
    const agg = sim.aggregate(200);
    const theory = Math.log(100) / (1 / S - lambda);
    expect(Math.abs(agg.p99 - theory) / theory).toBeLessThan(0.08);
  });

  it("M/M/c waiting time matches Erlang C", () => {
    const c = 4;
    const S = 0.04;
    const lambda = 80; // rho = 0.8
    const sim = new Simulation(singleQueue(lambda, S, c), "mmc");
    sim.runUntil(4000);
    const agg = sim.aggregate(200);
    const a = lambda * S;
    const wq = erlangC(c, a) / (c / S - lambda);
    const theory = wq + S;
    expect(Math.abs(agg.mean - theory) / theory).toBeLessThan(0.05);
  });

  it("Little's Law holds: L = lambda * W", () => {
    const sim = new Simulation(singleQueue(70, 0.01), "little");
    sim.runUntil(3000);
    const agg = sim.aggregate(100);
    const ws = sim.windows.filter((w) => w.t >= 100);
    const L = ws.reduce((s, w) => s + w.nodes["s"]!.inflight, 0) / ws.length;
    const predicted = agg.throughput * agg.mean;
    expect(Math.abs(L - predicted) / predicted).toBeLessThan(0.03);
  });

  it("latency explodes past ~80% utilization (the hockey stick)", () => {
    const S = 0.02;
    const at = (rho: number) => {
      const sim = new Simulation(singleQueue(rho / S, S), `hockey-${rho}`);
      sim.runUntil(3000);
      return sim.aggregate(200).mean;
    };
    const w40 = at(0.4);
    const w80 = at(0.8);
    const w95 = at(0.95);
    // Doubling load from 40% to 80% roughly triples latency; 80% -> 95% quadruples it again.
    expect(w80 / w40).toBeGreaterThan(2.5);
    expect(w95 / w80).toBeGreaterThan(3);
  });

  it("CPU-bound work is limited by cores, not workers", () => {
    // 9 workers on 2 cores: throughput caps near cores / S, the rest waits in the run-queue.
    const spec = singleQueue(150, 0.02, 2, { workers: 9, cores: 2 });
    const sim = new Simulation(spec, "cores");
    sim.runUntil(300);
    const agg = sim.aggregate(50);
    expect(agg.throughput).toBeLessThan(2 / 0.02 + 3);
    expect(agg.throughput).toBeGreaterThan(2 / 0.02 - 5);
  });
});

describe("caching", () => {
  function cacheSpec(capacity: number): SimSpec {
    return {
      hopS: 0,
      nodes: [
        { kind: "client", id: "c", target: "cache", rate: { kind: "const", rps: 400 }, keys: { n: 10_000, s: 0.9 }, timeoutS: 1e9 },
        { kind: "cache", id: "cache", capacity, op: { kind: "const", value: 0.0002 }, backing: "db", cores: 8 },
        { kind: "db", id: "db", cores: 64, workers: 64, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.002 } }] },
      ],
    };
  }

  function hitRatio(capacity: number): number {
    const sim = new Simulation(cacheSpec(capacity), `cache-${capacity}`);
    sim.runUntil(400);
    let hits = 0,
      misses = 0;
    for (const w of sim.windows.filter((x) => x.t >= 100)) {
      hits += w.nodes["cache"]!.hits ?? 0;
      misses += w.nodes["cache"]!.misses ?? 0;
    }
    return hits / (hits + misses);
  }

  function cheApprox(n: number, s: number, C: number): number {
    const z = new Zipf(n, s);
    const p = Array.from({ length: n }, (_, i) => z.p(i));
    const filled = (T: number) => p.reduce((acc, pi) => acc + (1 - Math.exp(-pi * T)), 0);
    let lo = 0,
      hi = 1e9;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (filled(mid) < C) lo = mid;
      else hi = mid;
    }
    const T = (lo + hi) / 2;
    return p.reduce((acc, pi) => acc + pi * (1 - Math.exp(-pi * T)), 0);
  }

  it("hit ratio rises with cache size under Zipf traffic", () => {
    const h = [100, 500, 2000].map(hitRatio);
    expect(h[1]!).toBeGreaterThan(h[0]! + 0.05);
    expect(h[2]!).toBeGreaterThan(h[1]! + 0.05);
  });

  it("LRU hit ratio matches the Che approximation", () => {
    for (const C of [200, 1000]) {
      const measured = hitRatio(C);
      const theory = cheApprox(10_000, 0.9, C);
      expect(Math.abs(measured - theory)).toBeLessThan(0.03);
    }
  });
});

describe("resilience", () => {
  function outage(retry: boolean): number {
    const spec: SimSpec = {
      hopS: 0,
      nodes: [
        {
          kind: "client",
          id: "c",
          target: "s",
          rate: { kind: "const", rps: 80 },
          timeoutS: 0.5,
          retry: retry ? { maxAttempts: 4, backoff: "constant", baseS: 0.05, capS: 0.05, jitter: "none" } : undefined,
        },
        { kind: "server", id: "s", cores: 1, workers: 1, steps: [{ kind: "cpu", dist: { kind: "exp", mean: 0.01 } }] },
      ],
    };
    const sim = new Simulation(spec, "retry-storm");
    sim.runUntil(100);
    sim.apply({ op: "set", node: "s", changes: { failure: { slowFactor: 2 } } });
    sim.runUntil(130);
    sim.apply({ op: "set", node: "s", changes: { failure: {} } });
    sim.runUntil(400);
    return sim.aggregate(160, 400).errorRate;
  }

  it("retries without jitter turn a 30s slowdown into a lasting outage", () => {
    const without = outage(false);
    const withRetries = outage(true);
    expect(without).toBeLessThan(0.05);
    expect(withRetries).toBeGreaterThan(0.5);
  });

  it("fan-out amplifies the tail as 1-(1-p)^N predicts", () => {
    const median = 0.01;
    const p99 = 0.05;
    const run = (N: number) => {
      const leaves = Array.from({ length: N }, (_, i) => `leaf${i}`);
      const spec: SimSpec = {
        hopS: 0,
        nodes: [
          { kind: "client", id: "c", target: "agg", rate: { kind: "const", rps: 50 }, timeoutS: 1e9 },
          { kind: "server", id: "agg", cores: 64, workers: 256, steps: [{ kind: "fanout", targets: leaves }] },
          ...leaves.map(
            (id): ServerSpec => ({ kind: "server", id, cores: 64, workers: 64, steps: [{ kind: "io", dist: { kind: "lognormal", median, p99 } }] }),
          ),
        ],
      };
      const sim = new Simulation(spec, `fanout-${N}`);
      sim.runUntil(1200);
      return sim.aggregate(20).p99;
    };
    const p1 = run(1);
    const p10 = run(10);
    expect(Math.abs(p1 - p99) / p99).toBeLessThan(0.1);
    const expected10 = lognormalQuantile(median, p99, Math.pow(0.99, 1 / 10));
    expect(Math.abs(p10 - expected10) / expected10).toBeLessThan(0.15);
    expect(p10).toBeGreaterThan(p1 * 1.4);
  });
});

describe("load balancing", () => {
  function fleet(algorithm: "round-robin" | "least-outstanding", slowFactor = 5): SimSpec {
    const servers = ["a", "b", "c"];
    return {
      nodes: [
        { kind: "client", id: "c0", target: "lb", rate: { kind: "const", rps: 120 }, timeoutS: 30 },
        { kind: "lb", id: "lb", targets: servers, algorithm },
        ...servers.map(
          (id, i): ServerSpec => ({
            kind: "server",
            id,
            cores: 2,
            workers: 8,
            steps: [{ kind: "cpu", dist: { kind: "exp", mean: 0.02 } }],
            failure: i === 0 ? { slowFactor } : undefined,
          }),
        ),
      ],
    };
  }

  it("least-outstanding routes around a slow box; round-robin keeps feeding it", () => {
    const rr = new Simulation(fleet("round-robin"), "lb");
    rr.runUntil(300);
    const lor = new Simulation(fleet("least-outstanding"), "lb");
    lor.runUntil(300);
    expect(lor.aggregate(30).p99).toBeLessThan(rr.aggregate(30).p99 * 0.5);
  });

  it("health checks eject a dead server and errors stop", () => {
    const spec = fleet("round-robin", 1);
    const lb = spec.nodes[1] as Extract<(typeof spec.nodes)[number], { kind: "lb" }>;
    lb.healthCheck = { intervalS: 5, timeoutS: 2, unhealthyThreshold: 2, healthyThreshold: 2, deep: false };
    const sim = new Simulation(spec, "hc");
    sim.runUntil(30);
    sim.apply({ op: "set", node: "a", changes: { failure: { down: true } } });
    sim.runUntil(120);
    expect(sim.notables.some((e) => e.kind === "health-eject" && e.node === "a")).toBe(true);
    expect(sim.aggregate(30, 34).errorRate).toBeGreaterThan(0.2);
    expect(sim.aggregate(60, 120).errorRate).toBe(0);
  });

  it("shallow health checks miss a box that is up but broken; deep checks catch it", () => {
    // Three boxes; "a" came up with 1 worker instead of 16 (a bad launch template).
    const run = (deep: boolean) => {
      const servers = ["a", "b", "c"];
      const spec: SimSpec = {
        nodes: [
          { kind: "client", id: "c0", target: "lb", rate: { kind: "const", rps: 240 }, timeoutS: 30 },
          {
            kind: "lb",
            id: "lb",
            targets: servers,
            algorithm: "round-robin",
            healthCheck: { intervalS: 5, timeoutS: 2, unhealthyThreshold: 2, healthyThreshold: 3, deep },
          },
          ...servers.map(
            (id): ServerSpec => ({
              kind: "server",
              id,
              cores: id === "a" ? 1 : 4,
              workers: id === "a" ? 1 : 16,
              steps: [{ kind: "cpu", dist: { kind: "exp", mean: 0.02 } }],
            }),
          ),
        ],
      };
      const sim = new Simulation(spec, "deep-hc");
      sim.runUntil(240);
      const agg = sim.aggregate(120, 240, 0.5);
      return { good: agg.sloGood, errors: agg.errorRate, ejected: sim.notables.some((e) => e.kind === "health-eject" && e.node === "a") };
    };
    const shallow = run(false);
    const deep = run(true);
    expect(shallow.ejected).toBe(false);
    // Shallow: a third of all traffic rots in the broken box's queue until clients give up.
    expect(shallow.errors).toBeGreaterThan(0.25);
    expect(deep.ejected).toBe(true);
    expect(deep.good).toBeGreaterThan(shallow.good + 0.1);
  });
});

describe("sessions", () => {
  function sessions(mode: "local" | "external", algorithm: "round-robin" | "sticky"): number {
    const servers = ["a", "b"];
    const spec: SimSpec = {
      nodes: [
        { kind: "client", id: "c", target: "lb", rate: { kind: "const", rps: 100 }, users: 500 },
        { kind: "lb", id: "lb", targets: servers, algorithm },
        ...servers.map(
          (id): ServerSpec => ({
            kind: "server",
            id,
            cores: 2,
            workers: 8,
            steps: [{ kind: "session" }, { kind: "cpu", dist: { kind: "exp", mean: 0.01 } }],
            session: mode === "local" ? { mode: "local" } : { mode: "external", store: "redis" },
          }),
        ),
        { kind: "db", id: "redis", cores: 1, workers: 1000, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.0002 } }] },
      ],
    };
    const sim = new Simulation(spec, "sessions");
    sim.runUntil(120);
    const agg = sim.aggregate(60);
    return agg.failReasons.session / (agg.ok + agg.failed);
  }

  it("in-memory sessions behind round-robin log users out constantly", () => {
    expect(sessions("local", "round-robin")).toBeGreaterThan(0.3);
  });
  it("sticky routing hides the problem while the fleet is stable", () => {
    expect(sessions("local", "sticky")).toBeLessThan(0.01);
  });
  it("an external session store fixes it", () => {
    expect(sessions("external", "round-robin")).toBe(0);
  });
});

describe("determinism", () => {
  const spec = (): SimSpec => ({
    nodes: [
      { kind: "client", id: "c", target: "lb", rate: { kind: "spike", base: 50, peak: 200, at: 10, rampS: 5, holdS: 10, decayS: 5 }, timeoutS: 1, retry: { maxAttempts: 3, backoff: "exponential", baseS: 0.1, capS: 1, jitter: "full" } },
      { kind: "lb", id: "lb", targets: ["a", "b"], algorithm: "p2c" },
      { kind: "server", id: "a", cores: 2, workers: 4, steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.01, p99: 0.08 } }] },
      { kind: "server", id: "b", cores: 2, workers: 4, steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.01, p99: 0.08 } }] },
    ],
  });

  it("same seed + same patches => identical metrics", () => {
    const run = () => {
      const sim = new Simulation(spec(), "det");
      sim.runUntil(15);
      sim.apply({ op: "restart", node: "a" });
      sim.runUntil(60);
      return JSON.stringify(sim.windows);
    };
    expect(run()).toBe(run());
  });

  it("replaying the patch log reproduces a live run exactly", () => {
    const live = new Simulation(spec(), "replay");
    live.runUntil(12.345);
    live.apply({ op: "set", node: "b", changes: { failure: { slowFactor: 3 } } });
    live.runUntil(30);
    live.apply({ op: "set", node: "c", changes: { rateScale: 1.5 } });
    live.runUntil(50);
    const replay = Simulation.replay(spec(), "replay", live.patchLog, 50);
    expect(JSON.stringify(replay.windows)).toBe(JSON.stringify(live.windows));
  });

  it("particle sampling does not perturb the simulation", () => {
    const a = new Simulation({ ...spec(), vizRate: 0 }, "viz");
    a.runUntil(40);
    const b = new Simulation({ ...spec(), vizRate: 0.5 }, "viz");
    b.runUntil(20);
    b.particles();
    b.setVizRate(0.1);
    b.runUntil(40);
    expect(JSON.stringify(b.windows)).toBe(JSON.stringify(a.windows));
  });
});
