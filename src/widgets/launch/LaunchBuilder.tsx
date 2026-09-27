"use client";
/**
 * Launch Day: design the fleet, then survive the launch. Every Chapter 1 idea is load-bearing:
 * workers (Little's Law), headroom (utilization), N−1 (scale out), the balancer, and sessions.
 */
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { albMonthly, instance, monthly, REDIS_NODES } from "@/engine/catalog";
import type { LbAlgorithm } from "@/engine/types";
import { Button, Chip, cx, fmtUsd, Meter, Panel, Segmented } from "@/ui/kit";
import { Slider } from "@/ui/Slider";
import type { FlowNode } from "@/ui/flow/FlowView";
import { ChallengeControls, useReplayHighlight, useSimChallenge, useSloAlarm } from "../sim/challenge";
import { SimStage } from "../sim/SimStage";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { fleetLayout, serverId, type HcMode, type SessionMode } from "../fleet/spec";
import { DEFAULT_DESIGN, designCost, extraServer, LaunchConfig, launchOptions, launchSpec, memPerBox, TIMELINE, type LaunchDesign } from "./spec";

export { LaunchConfig };

const ALGS: { value: LbAlgorithm; label: string }[] = [
  { value: "round-robin", label: "round robin" },
  { value: "random", label: "random" },
  { value: "least-outstanding", label: "least outstanding" },
  { value: "p2c", label: "power of 2" },
];
const SESSIONS: { value: Exclude<SessionMode, "none">; label: string; hint: string }[] = [
  { value: "local", label: "in memory", hint: "Django default on this box" },
  { value: "sticky", label: "sticky", hint: "hash users to boxes" },
  { value: "redis", label: "redis", hint: `+${fmtUsd(monthly(REDIS_NODES[1]!.usdPerHour))}/mo` },
  { value: "cookie", label: "signed cookie", hint: "no server state" },
];
const MAX_LAUNCHES = 2;

export default function LaunchBuilder({ config, onResult, verdict, locked, runLocked, conditions, onDesign }: WidgetProps<LaunchConfig>) {
  const c = LaunchConfig.parse(config);
  const [d, setD] = useState<LaunchDesign>(DEFAULT_DESIGN);
  const [launched, setLaunched] = useState<string[]>([]);
  const set = <K extends keyof LaunchDesign>(k: K, v: LaunchDesign[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const it = instance(d.instance);
  const mem = memPerBox(c, d);
  const memFits = mem.used <= mem.total;
  const baseCost = designCost(d);
  const cost = baseCost + launched.length * monthly(it.usdPerHour);
  const vcpu = it.vcpu * d.count;

  useEffect(() => {
    onDesign?.({ ...d, cost: baseCost, vcpu });
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const slo = { p99: c.sloP99, errorRate: 0.01 };
  const ch = useSimChallenge({
    seed: c.seed,
    durationS: c.durationS,
    fromS: c.fromS,
    speed: 4,
    slo,
    onResult,
    toMetrics: (agg) => {
      const tot = Math.max(1, agg.ok + agg.failed);
      return {
        p99: agg.p99,
        errorRate: agg.errorRate,
        sessionLoss: agg.failReasons.session / tot,
        costPerMonth: cost,
        memFits: memFits ? 1 : 0,
        launches: launched.length,
      };
    },
  });
  const running = ch.phase === "running";
  const layout = useMemo(() => {
    const opts = launchOptions(c, d);
    const extra = launched.map((id) => ({ id, label: id, cores: it.vcpu, workers: d.workers, instance: d.instance }));
    const base = fleetLayout({ servers: [...opts.servers, ...extra], session: d.session });
    return base as { nodes: FlowNode[]; edges: { from: string; to: string }[] };
  }, [c, d, launched, it.vcpu]);
  const highlight = useReplayHighlight(ch);
  useSloAlarm(ch.sim.windows, slo, running);

  const launch = () => {
    const id = serverId(d.count + launched.length);
    ch.sim.patch({ op: "launch", spec: extraServer(c, d, d.count + launched.length), lb: "lb", bootS: 20 });
    setLaunched((l) => [...l, id]);
  };

  const run = () => {
    setLaunched([]);
    ch.run(launchSpec(c, d));
  };

  const designing = ch.phase === "setup";
  const cannotRun = !memFits || cost > c.budget * 1.5;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Timeline t={ch.sim.t} duration={c.durationS} active={ch.phase !== "setup"} />
        <SimStage className="min-h-[340px] flex-1" sim={ch.sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps", "util"]} slo={slo} highlight={highlight} />
        {running && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={launch} disabled={launched.length >= MAX_LAUNCHES}>
              Launch another {d.instance} (+{fmtUsd(monthly(it.usdPerHour))}/mo, 20s boot)
            </Button>
            <span className="font-mono text-2xs text-ink-3">{MAX_LAUNCHES - launched.length} launches left</span>
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 lg:w-[330px] lg:overflow-y-auto">
        <Panel label="launch plan">
          <div className={cx("flex flex-col gap-3", (!designing || locked) && "pointer-events-none opacity-50")}>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">instances</div>
              <Segmented
                size="sm"
                label="Instance type"
                value={d.instance}
                onChange={(v) => setD((cur) => ({ ...cur, instance: v, workers: Math.min(cur.workers, Math.floor(((instance(v).memGiB - c.reservedGiB) * 1024) / c.workerMb)) }))}
                options={c.instances.map((n) => ({ value: n, label: n.replace("m7i.", ""), hint: `${instance(n).vcpu} vCPU · ${instance(n).memGiB} GiB` }))}
              />
            </div>
            <Slider label="how many" value={d.count} min={1} max={8} step={1} onChange={(v) => set("count", v)} format={(v) => `${v} × ${d.instance} · ${v * it.vcpu} vCPU`} />
            <div>
              <Slider label="gunicorn workers per box" value={d.workers} min={1} max={48} step={1} onChange={(v) => set("workers", v)} format={(v) => `${v}`} />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-2">
                <span>RAM per box</span>
                <span className={cx("tabular", memFits ? "text-ink-1" : "text-alert")}>
                  {mem.used.toFixed(1)} / {mem.total} GiB{memFits ? "" : " · won't fit"}
                </span>
              </div>
              <Meter value={mem.used / mem.total} warnAt={0.8} alertAt={1} className="mt-1" label="memory per box" />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">load balancer</div>
              <div className="grid grid-cols-2 gap-1">
                {ALGS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => set("algorithm", a.value)}
                    className={cx("h-8 rounded-[2px] border font-mono text-2xs uppercase tracking-[0.06em]", d.algorithm === a.value ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1 hover:border-line-3")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Segmented size="sm" label="Health checks" value={d.hc} onChange={(v: HcMode) => set("hc", v)} options={[{ value: "off", label: "no hc" }, { value: "shallow", label: "shallow" }, { value: "deep", label: "deep" }]} />
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-1">
                <input type="checkbox" checked={d.outlier} onChange={(e) => set("outlier", e.target.checked)} className="h-4 w-4 accent-[#ffb547]" />
                Passive ejection
              </label>
            </div>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">sessions</div>
              <div className="grid grid-cols-2 gap-1">
                {SESSIONS.map((s) => (
                  <button
                    key={s.value}
                    title={s.hint}
                    onClick={() => set("session", s.value)}
                    className={cx("rounded-[2px] border px-2 py-1.5 text-left", d.session === s.value ? "border-amber bg-amber-dim/50" : "border-line-2 hover:border-line-3")}
                  >
                    <div className="font-mono text-2xs uppercase tracking-[0.06em] text-ink-0">{s.label}</div>
                    <div className="text-[10px] text-ink-2">{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-2">
            <div className="flex justify-between font-mono text-2xs text-ink-2">
              <span>monthly bill (incl. ALB {fmtUsd(albMonthly())})</span>
              <span className={cx("tabular", cost > c.budget ? "text-alert" : "text-ink-0")}>
                {fmtUsd(cost)} / {fmtUsd(c.budget)}
              </span>
            </div>
            <Meter value={cost / c.budget} warnAt={0.85} alertAt={1} className="mt-1" label="budget used" />
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={ch.result?.metrics} />
        {runLocked && designing ? (
          <Chip tone="warn">Lock your forecast (right) before going live</Chip>
        ) : (
          <ChallengeControls ch={ch} onRun={run} verdict={verdict} disabled={locked || cannotRun} runLabel="Go live" />
        )}
      </div>
    </div>
  );
}

function Timeline({ t, duration, active }: { t: number; duration: number; active: boolean }) {
  return (
    <div className="h-14 rounded-sm border border-line bg-bg-1 px-6">
      <div className="relative h-full">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-2" />
        {TIMELINE.map((e, i) => {
          const past = active && t >= e.t;
          const up = i % 2 === 1;
          return (
            <div key={e.t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(e.t / duration) * 100}%` }} title={e.label}>
              <div className={cx("mx-auto h-2 w-2 rotate-45 border", past ? "border-amber bg-amber" : "border-line-3 bg-bg-1")} />
              <div className={cx("absolute left-1/2 hidden w-[120px] -translate-x-1/2 truncate text-center font-mono text-[9px] lg:block", up ? "bottom-3" : "top-3", past ? "text-amber" : "text-ink-3")}>{e.label}</div>
            </div>
          );
        })}
        {active && <motion.div className="absolute bottom-1 top-1 w-px bg-phos shadow-[0_0_6px_rgb(92_242_154/0.8)]" style={{ left: `${Math.min(1, t / duration) * 100}%` }} />}
      </div>
    </div>
  );
}
