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
  { value: "round-robin", label: "Round robin" },
  { value: "random", label: "Random" },
  { value: "least-outstanding", label: "Least outstanding" },
  { value: "p2c", label: "Power of 2" },
];
const SESSIONS: { value: Exclude<SessionMode, "none">; label: string; hint: string }[] = [
  { value: "local", label: "In memory", hint: "Django default on this box" },
  { value: "sticky", label: "Sticky", hint: "Hash users to boxes" },
  { value: "redis", label: "Redis", hint: `+${fmtUsd(monthly(REDIS_NODES[1]!.usdPerHour))}/mo` },
  { value: "cookie", label: "Signed cookie", hint: "No server state" },
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
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Timeline t={ch.sim.t} duration={c.durationS} active={ch.phase !== "setup"} />
        <SimStage className="min-h-[340px] flex-1" sim={ch.sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps", "util"]} slo={slo} highlight={highlight} />
        {running && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={launch} disabled={launched.length >= MAX_LAUNCHES}>
              Launch another {d.instance} (+{fmtUsd(monthly(it.usdPerHour))}/mo, 20s boot)
            </Button>
            <span className="text-xs text-ink-3">
              <span className="font-mono tabular">{MAX_LAUNCHES - launched.length}</span> launches left
            </span>
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-4 lg:w-[330px] lg:overflow-y-auto">
        <Panel label="Launch plan">
          <div className={cx("flex flex-col gap-4", (!designing || locked) && "pointer-events-none opacity-50")}>
            <div>
              <div className="mb-2 eyebrow text-xs text-ink-2">Instances</div>
              <Segmented
                size="sm"
                label="Instance type"
                value={d.instance}
                onChange={(v) => setD((cur) => ({ ...cur, instance: v, workers: Math.min(cur.workers, Math.floor(((instance(v).memGiB - c.reservedGiB) * 1024) / c.workerMb)) }))}
                options={c.instances.map((n) => ({ value: n, label: n.replace("m7i.", ""), hint: `${instance(n).vcpu} vCPU · ${instance(n).memGiB} GiB` }))}
              />
            </div>
            <Slider label="How many" value={d.count} min={1} max={8} step={1} onChange={(v) => set("count", v)} format={(v) => `${v} × ${d.instance} · ${v * it.vcpu} vCPU`} />
            <div>
              <Slider label="Gunicorn workers per box" value={d.workers} min={1} max={48} step={1} onChange={(v) => set("workers", v)} format={(v) => `${v}`} />
              <div className="mt-1.5 flex justify-between gap-3 text-xs text-ink-2">
                <span>RAM per box</span>
                <span className={cx("font-mono tabular", memFits ? "text-ink-1" : "text-alert")}>
                  {mem.used.toFixed(1)} / {mem.total} GiB{memFits ? "" : " · won't fit"}
                </span>
              </div>
              <Meter value={mem.used / mem.total} warnAt={0.8} alertAt={1} className="mt-1" label="memory per box" />
            </div>
            <div>
              <div className="mb-2 eyebrow text-xs text-ink-2">Load balancer</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ALGS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => set("algorithm", a.value)}
                    className={cx("h-9 rounded-sm border px-2 text-[13px] font-medium transition-colors duration-200", d.algorithm === a.value ? "border-amber bg-amber text-bg-0" : "border-line-2/80 bg-bg-2/50 text-ink-1 hover:border-line-3 hover:text-ink-0")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-ink-2">Health checks</span>
                <Segmented size="sm" label="Health checks" value={d.hc} onChange={(v: HcMode) => set("hc", v)} options={[{ value: "off", label: "Off" }, { value: "shallow", label: "Shallow" }, { value: "deep", label: "Deep" }]} />
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-ink-1">
                <input type="checkbox" checked={d.outlier} onChange={(e) => set("outlier", e.target.checked)} className="h-4 w-4 accent-amber" />
                Passive ejection
              </label>
            </div>
            <div>
              <div className="mb-2 eyebrow text-xs text-ink-2">Sessions</div>
              <div className="grid grid-cols-2 gap-1.5">
                {SESSIONS.map((s) => (
                  <button
                    key={s.value}
                    title={s.hint}
                    onClick={() => set("session", s.value)}
                    className={cx("rounded-sm border px-2.5 py-2 text-left transition-colors duration-200", d.session === s.value ? "border-amber/80 bg-amber-dim/50" : "border-line-2/80 bg-bg-2/40 hover:border-line-3")}
                  >
                    <div className="text-[13px] font-semibold text-ink-0">{s.label}</div>
                    <div className="mt-0.5 text-xs text-ink-2">{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3">
            <div className="flex justify-between gap-3 text-xs text-ink-2">
              <span>Monthly bill (incl. ALB {fmtUsd(albMonthly())})</span>
              <span className={cx("shrink-0 font-mono tabular", cost > c.budget ? "text-alert" : "text-ink-0")}>
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
    <div className="h-12 rounded-lg border border-line/70 bg-bg-1/75 px-4 shadow-card lg:h-[5.5rem]">
      <div className="@container relative h-full">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-2/70" />
        {TIMELINE.map((e, i) => {
          const past = active && t >= e.t;
          const up = i % 2 === 1;
          const pos = (e.t / duration) * 100;
          // Labels near the ends hang inward so the story is never cut at the edge of the card.
          const anchor = pos < 12 ? "left-0 text-left" : pos > 88 ? "right-0 text-right" : "left-1/2 -translate-x-1/2 text-center";
          return (
            <div key={e.t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos}%` }} title={e.label}>
              <div className={cx("mx-auto h-2.5 w-2.5 rounded-full border transition-colors duration-300", past ? "border-amber bg-amber" : "border-line-3 bg-bg-1")} />
              <div className={cx("absolute hidden w-[min(140px,24cqw)] text-xs leading-tight transition-colors duration-300 lg:block", anchor, up ? "bottom-4" : "top-4", past ? "text-amber" : "text-ink-2")}>
                <div className="line-clamp-2">{e.label}</div>
              </div>
            </div>
          );
        })}
        {active && <motion.div className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-phos/80" style={{ left: `${Math.min(1, t / duration) * 100}%` }} />}
      </div>
    </div>
  );
}
