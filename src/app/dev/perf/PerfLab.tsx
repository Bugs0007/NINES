"use client";
/**
 * Dev-only stress test for the renderer: a busy fleet with ~2,000 live particles, and a frame-time meter.
 * e2e/perf.spec.ts reads window.__perf.
 */
import { useEffect, useMemo, useState } from "react";
import { useSim } from "@/engine/useSim";
import { buildFleet, fleetLayout, serversFor } from "@/widgets/fleet/spec";
import { SimStage } from "@/widgets/sim/SimStage";

interface PerfStats {
  frames: number;
  fps: number;
  p95FrameMs: number;
  worstFrameMs: number;
  particles: number;
}

declare global {
  interface Window {
    __perf?: PerfStats;
  }
}

export function PerfLab({ target }: { target: number }) {
  const servers = useMemo(() => serversFor("m7i.4xlarge", 12, 60).map((s) => ({ ...s, workers: 220 })), []);
  const spec = useMemo(
    () =>
      buildFleet({
        servers,
        algorithm: "least-outstanding",
        hc: "off",
        session: "none",
        rate: { kind: "const", rps: 3000 },
        cpu: { kind: "lognormal", median: 0.004, p99: 0.02 },
        io: { kind: "lognormal", median: 0.6, p99: 1.4 },
        users: 50000,
        timeoutS: 30,
      }),
    [servers],
  );
  const layout = useMemo(() => fleetLayout({ servers, session: "none" }), [servers]);
  const sim = useSim({ spec, seed: "perf", vizTarget: target });
  const [stats, setStats] = useState<PerfStats | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let dts: number[] = [];
    let windowStart = last;
    const loop = (now: number) => {
      dts.push(now - last);
      last = now;
      if (now - windowStart > 2000) {
        const sorted = [...dts].sort((a, b) => a - b);
        const s: PerfStats = {
          frames: dts.length,
          fps: (dts.length * 1000) / (now - windowStart),
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          worstFrameMs: sorted[sorted.length - 1] ?? 0,
          particles: sim.frame.current.live.length,
        };
        window.__perf = s;
        setStats(s);
        dts = [];
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim.frame]);

  return (
    <div className="flex h-dvh flex-col gap-2 p-3">
      <div className="font-mono text-xs text-ink-1" data-testid="perf">
        {stats
          ? `${stats.particles} particles · ${stats.fps.toFixed(1)} fps · p95 frame ${stats.p95FrameMs.toFixed(1)}ms · worst ${stats.worstFrameMs.toFixed(1)}ms`
          : "warming up…"}
      </div>
      <SimStage className="min-h-0 flex-1" sim={sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "rps", "util"]} sound={false} />
    </div>
  );
}
