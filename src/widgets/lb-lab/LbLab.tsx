"use client";
/**
 * LB Lab: four servers behind a load balancer.
 *  - lab:   pick the algorithm and health checks, then sabotage servers and watch where traffic goes.
 *  - noisy: challenge. A noisy neighbour, then a crashed app. Configure the LB to ride it out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { HealthCheckSpec, LbAlgorithm, WindowMetrics } from "@/engine/types";
import { useSim } from "@/engine/useSim";
import { Chip, cx, fmtLatency, Panel, Segmented } from "@/ui/kit";
import { Slider } from "@/ui/Slider";
import { ChallengeControls, useReplayHighlight, useSimChallenge, useSloAlarm } from "../sim/challenge";
import { SimStage } from "../sim/SimStage";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { buildFleet, fleetLayout, serversFor, type HcMode } from "../fleet/spec";
import { labSpec, LbConfig, noisyOptions } from "./spec";

export { LbConfig };

const ALGS: { value: LbAlgorithm; label: string; hint: string }[] = [
  { value: "round-robin", label: "round robin", hint: "Each target in turn" },
  { value: "random", label: "random", hint: "Pick any target" },
  { value: "least-outstanding", label: "least outstanding", hint: "Fewest requests in flight (ALB supports this)" },
  { value: "p2c", label: "power of 2", hint: "Pick two at random, send to the less busy one" },
];
const HCS: { value: HcMode; label: string; hint: string }[] = [
  { value: "off", label: "off", hint: "No health checks" },
  { value: "shallow", label: "shallow", hint: "GET /health: is the process up?" },
  { value: "deep", label: "deep", hint: "Health check runs the real request path" },
];

const HONEST = [
  "Health checks run every 10s; a target is ejected after 2 failures and readmitted after 3 passes.",
  "A crashed app behind a live nginx fails every request instantly, so it looks 'not busy' to a least-outstanding balancer.",
  "Passive ejection is modelled on nginx max_fails / Envoy outlier detection: 5 straight errors, out for 30s.",
];

export default function LbLab(props: WidgetProps<LbConfig>) {
  const c = LbConfig.parse(props.config);
  return c.variant === "lab" ? <Lab {...props} config={c} /> : <Noisy {...props} config={c} />;
}

function tailOf(ws: WindowMetrics[], n = 6) {
  const xs = ws.slice(-n).filter((w) => w.ok > 0);
  return xs.length ? xs.reduce((s, w) => s + w.p99, 0) / xs.length : 0;
}

// ---------------------------------------------------------------- lab

function Lab({ config: c, onObserve, locked, mode, scene }: WidgetProps<LbConfig>) {
  const servers = useMemo(() => serversFor(c.instance, c.count, 30), [c.instance, c.count]);
  const spec = useMemo(() => labSpec(c), [c]);
  const sim = useSim({ spec: mode === "preview" ? null : spec, seed: c.seed, vizTarget: 320 });
  const [alg, setAlg] = useState<LbAlgorithm>("round-robin");
  const [hc, setHc] = useState<HcMode>("off");
  const [outlier, setOutlier] = useState(false);
  const [rps, setRps] = useState(c.rps);
  const [state, setState] = useState<Record<string, "ok" | "slow" | "dead">>({});
  const layout = fleetLayout({ servers, session: "none" });

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const healthCheck: HealthCheckSpec | undefined = hc === "off" ? undefined : { intervalS: 10, timeoutS: 2, unhealthyThreshold: 2, healthyThreshold: 3, deep: hc === "deep" };
    sim.patch({ op: "set", node: "lb", changes: { algorithm: alg, healthCheck, outlier: outlier ? { consecutiveErrors: 5, ejectS: 30 } : undefined } });
  }, [alg, hc, outlier]); // eslint-disable-line react-hooks/exhaustive-deps
  const mountedR = useRef(false);
  useEffect(() => {
    if (!mountedR.current) {
      mountedR.current = true;
      return;
    }
    sim.patch({ op: "set", node: "users", changes: { rate: { kind: "const", rps } } });
  }, [rps]); // eslint-disable-line react-hooks/exhaustive-deps

  const setServer = (id: string, s: "ok" | "slow" | "dead") => {
    setState((cur) => ({ ...cur, [id]: s }));
    sim.patch({ op: "set", node: id, changes: { failure: s === "slow" ? { slowFactor: 5 } : s === "dead" ? { down: true } : {} } });
  };

  // baseline tail, captured while everything is healthy
  const baseline = useRef(0);
  const anySick = Object.values(state).some((v) => v !== "ok");
  const anySlow = Object.values(state).includes("slow");
  const last = sim.windows[sim.windows.length - 1];
  const fired = useRef(new Set<string>());
  const runs = useRef({ rr: 0, lor: 0 });
  useEffect(() => {
    if (!last) return;
    const fire = (e: string) => {
      if (fired.current.has(e)) return;
      fired.current.add(e);
      onObserve?.(e);
    };
    const t = tailOf(sim.windows);
    if (!anySick && sim.windows.length > 5) baseline.current = baseline.current ? baseline.current * 0.8 + t * 0.2 : t;
    const base = baseline.current || 0.06;
    runs.current.rr = anySlow && alg === "round-robin" && t > base * 3 ? runs.current.rr + 1 : 0;
    runs.current.lor = anySlow && (alg === "least-outstanding" || alg === "p2c") && tailOf(sim.windows, 4) < Math.max(base * 3, 0.3) ? runs.current.lor + 1 : 0;
    if (runs.current.rr >= 5) fire("slow-rr");
    if (runs.current.lor >= 6) fire("lor-recovers");
    if (sim.notables.some((e) => e.kind === "health-eject" || e.kind === "outlier-eject")) fire("ejected");
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  const perServer = servers.map((s) => ({ s, w: last?.nodes[s.id] }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <SimStage
        className="min-h-[360px] flex-1"
        sim={sim}
        nodes={layout.nodes}
        edges={layout.edges}
        metrics={["p50", "p99", "errors", "rps"]}
        highlight={scene === "rr" || scene === "lor" ? ["lb"] : scene === "blackhole" ? servers.filter((s) => state[s.id] === "dead").map((s) => s.id) : []}
        honestPhysics={HONEST}
      />
      <div className="flex w-full flex-col gap-3 lg:w-[320px]">
        <Panel label="load balancer">
          <div className={cx("flex flex-col gap-3", locked && "pointer-events-none opacity-40")}>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">algorithm</div>
              <div className="grid grid-cols-2 gap-1">
                {ALGS.map((a) => (
                  <button
                    key={a.value}
                    title={a.hint}
                    onClick={() => setAlg(a.value)}
                    className={cx("h-9 rounded-[2px] border font-mono text-2xs uppercase tracking-[0.08em]", alg === a.value ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1 hover:border-line-3")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">health checks</div>
              <Segmented size="sm" label="Health checks" value={hc} onChange={setHc} options={HCS} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-1">
              <input type="checkbox" checked={outlier} onChange={(e) => setOutlier(e.target.checked)} className="h-4 w-4 accent-[#ffb547]" />
              Passive ejection (5 straight errors)
            </label>
            <Slider label="traffic" value={rps} min={40} max={320} step={10} onChange={setRps} format={(v) => `${v} req/s`} />
          </div>
        </Panel>
        <Panel label="servers" bodyClassName="p-0">
          <table className="w-full text-left font-mono text-2xs">
            <thead className="text-ink-3">
              <tr>
                <th className="px-2 py-1 font-normal">box</th>
                <th className="px-1 py-1 font-normal">busy</th>
                <th className="px-1 py-1 font-normal">p99</th>
                <th className="px-1 py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {perServer.map(({ s, w }) => {
                const st = state[s.id] ?? "ok";
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className={cx("px-2 py-1.5", st === "dead" ? "text-alert" : st === "slow" ? "text-amber" : "text-ink-0")}>{s.label}</td>
                    <td className="px-1 tabular text-ink-1">{w ? `${Math.round(Math.max(w.util, w.workerUtil) * 100)}%` : "—"}</td>
                    <td className="px-1 tabular text-ink-1">{w && w.completed ? fmtLatency(w.p99) : "—"}</td>
                    <td className="px-1 py-1 text-right">
                      <div className={cx("inline-flex gap-1", locked && "pointer-events-none opacity-40")}>
                        {st !== "slow" && (
                          <button onClick={() => setServer(s.id, "slow")} className="rounded-[2px] border border-amber-3 px-1.5 py-0.5 text-amber hover:bg-amber-dim">
                            slow
                          </button>
                        )}
                        {st !== "dead" && (
                          <button onClick={() => setServer(s.id, "dead")} className="rounded-[2px] border border-alert-3 px-1.5 py-0.5 text-alert hover:bg-alert-dim">
                            kill
                          </button>
                        )}
                        {st !== "ok" && (
                          <button onClick={() => setServer(s.id, "ok")} className="rounded-[2px] border border-phos-3 px-1.5 py-0.5 text-phos hover:bg-phos-dim">
                            heal
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- noisy neighbour challenge

function Noisy({ config: c, onResult, verdict, locked, conditions }: WidgetProps<LbConfig>) {
  const [alg, setAlg] = useState<LbAlgorithm>("round-robin");
  const [hc, setHc] = useState<HcMode>("shallow");
  const [outlier, setOutlier] = useState(false);
  const opts = noisyOptions(c, { algorithm: alg, hc, outlier });
  const layout = fleetLayout(opts);
  const slo = { p99: c.sloP99, errorRate: 0.005 };
  const ch = useSimChallenge({
    seed: c.seed,
    durationS: c.durationS,
    fromS: c.fromS,
    speed: 4,
    slo,
    onResult,
    toMetrics: (agg) => ({ p99: agg.p99, errorRate: agg.errorRate }),
  });
  const running = ch.phase === "running" || ch.phase === "replay";
  const highlight = useReplayHighlight(ch);
  useSloAlarm(ch.sim.windows, slo, ch.phase === "running");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <SimStage className="min-h-[360px] flex-1" sim={ch.sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps", "util"]} slo={slo} highlight={highlight} honestPhysics={HONEST} />
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label="Balancer config">
          <div className={cx("flex flex-col gap-3", (running || locked) && "pointer-events-none opacity-50")}>
            <div className="grid grid-cols-2 gap-1">
              {ALGS.map((a) => (
                <button
                  key={a.value}
                  title={a.hint}
                  onClick={() => setAlg(a.value)}
                  className={cx("h-9 rounded-[2px] border font-mono text-2xs uppercase tracking-[0.08em]", alg === a.value ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1 hover:border-line-3")}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">health checks</div>
              <Segmented size="sm" label="Health checks" value={hc} onChange={setHc} options={HCS} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-1">
              <input type="checkbox" checked={outlier} onChange={(e) => setOutlier(e.target.checked)} className="h-4 w-4 accent-[#ffb547]" />
              Passive ejection (5 straight errors)
            </label>
            <div className="font-mono text-[10px] text-ink-3">
              {c.count} × {c.instance} · {c.rps} req/s · no client retries
            </div>
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={ch.result?.metrics} />
        <ChallengeControls ch={ch} onRun={() => ch.run(buildFleet(opts))} verdict={verdict} disabled={locked} runLabel="Start the night shift" />
        {running && <Chip tone="muted">t+{c.slowAt}s noisy neighbour · t+{c.crashAt}s app crash</Chip>}
      </div>
    </div>
  );
}
