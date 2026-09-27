"use client";
/**
 * Scale Lab: one big box vs a fleet of small ones.
 *  - compare: the same 8 vCPUs and traffic, side by side. Then kill a box on each side.
 *  - hug:     challenge. Pick instance type and count for a Hacker News hug with a hardware failure mid-peak.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { albMonthly, INSTANCES, instance, monthly } from "@/engine/catalog";
import type { SimSpec } from "@/engine/types";
import { useSim } from "@/engine/useSim";
import { Button, Chip, cx, fmtLatency, fmtUsd, Panel, Segmented } from "@/ui/kit";
import { Slider } from "@/ui/Slider";
import { ChallengeControls, useReplayHighlight, useSimChallenge, useSloAlarm } from "../sim/challenge";
import { SimStage } from "../sim/SimStage";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { buildFleet, fleetLayout, serversFor } from "../fleet/spec";
import { compareSpecs, hugOptions, ScaleConfig } from "./spec";

export { ScaleConfig };



const HONEST = [
  "Each vCPU runs requests from a FIFO run-queue; gunicorn workers are (2 × vCPU) + 1 per box.",
  "Instance prices are us-east-1 on-demand; the ALB is billed at a small, steady LCU count.",
  "A dead box refuses connections instantly; the ALB returns 502 until health checks eject it.",
];

export default function ScaleLab(props: WidgetProps<ScaleConfig>) {
  const c = ScaleConfig.parse(props.config);
  return c.variant === "compare" ? <Compare {...props} config={c} /> : <Hug {...props} config={c} />;
}

// ---------------------------------------------------------------- compare

function Compare({ config: c, onObserve, locked, mode, scene }: WidgetProps<ScaleConfig>) {
  const big = instance(c.bigInstance);
  const small = instance(c.smallInstance);
  const vcpu = big.vcpu;
  const [load, setLoad] = useState(0.5);
  const rps = (load * vcpu) / 0.019;
  const bigSpec = useMemo<SimSpec>(() => compareSpecs(c, 0.5).big, [c]);
  const smallSpec = useMemo<SimSpec>(() => compareSpecs(c, 0.5).small, [c]);
  const smallServers = useMemo(() => serversFor(small.name, c.smallCount, 90), [small.name, c.smallCount]);
  const run = mode !== "preview";
  const A = useSim({ spec: run ? bigSpec : null, seed: `${c.seed}-big`, vizTarget: 200 });
  const B = useSim({ spec: run ? smallSpec : null, seed: `${c.seed}-small`, vizTarget: 200 });
  const [killed, setKilled] = useState({ big: false, small: false });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    A.patch({ op: "set", node: "users", changes: { rate: { kind: "const", rps } } });
    B.patch({ op: "set", node: "users", changes: { rate: { kind: "const", rps } } });
  }, [rps]); // eslint-disable-line react-hooks/exhaustive-deps

  // observation: both sides ran hot long enough to compare tails
  const hot = useRef(0);
  const fired = useRef(new Set<string>());
  const fire = (e: string) => {
    if (fired.current.has(e)) return;
    fired.current.add(e);
    onObserve?.(e);
  };
  const lastA = A.windows[A.windows.length - 1];
  useEffect(() => {
    if (!lastA) return;
    hot.current = load >= 0.8 && !killed.big && !killed.small ? hot.current + 1 : 0;
    if (hot.current >= 10) fire("compared");
  }, [lastA]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (killed.big && killed.small) {
      const t = setTimeout(() => fire("killed-both"), 12000);
      return () => clearTimeout(t);
    }
  }, [killed.big, killed.small]); // eslint-disable-line react-hooks/exhaustive-deps

  const p99 = (ws: typeof A.windows) => {
    const xs = ws.slice(-8).filter((w) => w.ok > 0);
    return xs.length ? xs.reduce((s, w) => s + w.p99, 0) / xs.length : 0;
  };
  const bigLayout = { nodes: [{ id: "users", label: "users", kind: "client" as const, x: 60, y: 300 }, { id: "big", label: "big box", kind: "server" as const, x: 520, y: 300, workers: 2 * big.vcpu + 1, cores: big.vcpu, sub: big.name }], edges: [{ from: "users", to: "big" }] };
  const smallLayout = fleetLayout({ servers: smallServers, session: "none" });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <Side
          title="Scale up"
          sub={`1 × ${big.name} · ${big.vcpu} vCPU · ${fmtUsd(monthly(big.usdPerHour))}/mo`}
          sim={A}
          layout={bigLayout}
          tail={p99(A.windows)}
          killLabel="Kill the box"
          killed={killed.big}
          onKill={() => {
            A.patch({ op: "set", node: "big", changes: { failure: { down: true } } });
            setKilled((k) => ({ ...k, big: true }));
          }}
          highlight={scene === "spof" ? ["big"] : []}
          locked={locked}
        />
        <Side
          title="Scale out"
          sub={`${c.smallCount} × ${small.name} · ${small.vcpu * c.smallCount} vCPU · ${fmtUsd(monthly(small.usdPerHour) * c.smallCount + albMonthly())}/mo incl. ALB`}
          sim={B}
          layout={smallLayout}
          tail={p99(B.windows)}
          killLabel="Kill one box"
          killed={killed.small}
          onKill={() => {
            B.patch({ op: "set", node: "app-1", changes: { failure: { down: true } } });
            setKilled((k) => ({ ...k, small: true }));
          }}
          highlight={scene === "pooling" ? smallServers.map((s) => s.id) : []}
          locked={locked}
        />
      </div>
      <Panel label="traffic (same on both sides)">
        <div className={cx(locked && "pointer-events-none opacity-40")}>
          <Slider
            label="how busy the 8 vCPUs are"
            value={load}
            min={0.2}
            max={0.95}
            step={0.05}
            onChange={setLoad}
            format={(v) => `${Math.round(v * 100)}% · ${Math.round((v * vcpu) / 0.019)} req/s`}
            zone={{ from: 0.8, to: 0.95, tone: "warn" }}
          />
        </div>
      </Panel>
    </div>
  );
}

function Side({
  title,
  sub,
  sim,
  layout,
  tail,
  killLabel,
  killed,
  onKill,
  highlight,
  locked,
}: {
  title: string;
  sub: string;
  sim: ReturnType<typeof useSim>;
  layout: ReturnType<typeof fleetLayout>;
  tail: number;
  killLabel: string;
  killed: boolean;
  onKill: () => void;
  highlight: string[];
  locked?: boolean;
}) {
  return (
    <div className="flex min-h-[360px] flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-display text-2xl font-extrabold uppercase leading-none text-ink-0">{title}</div>
          <div className="font-mono text-[10px] text-ink-2">{sub}</div>
        </div>
        <div className="text-right font-mono text-2xs text-ink-2">
          p99 (8s avg)
          <div className="text-lg tabular text-ink-0">{tail ? fmtLatency(tail) : "—"}</div>
        </div>
      </div>
      <SimStage sim={sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "util"]} className="flex-1" highlight={highlight} sound={false} honestPhysics={HONEST} />
      <Button variant="danger" size="sm" onClick={onKill} disabled={killed || locked}>
        {killed ? "dead" : killLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- hug challenge

function Hug({ config: c, onResult, verdict, locked, conditions }: WidgetProps<ScaleConfig>) {
  const [inst, setInst] = useState(c.instances[1] ?? "m7i.xlarge");
  const [count, setCount] = useState(2);
  const it = instance(inst);
  const opts = hugOptions(c, inst, count);
  const cost = monthly(it.usdPerHour) * count + albMonthly();
  const vcpu = it.vcpu * count;
  const peakBusy = (c.peakRps * 0.019) / vcpu;
  const n1Busy = count > 1 ? (c.peakRps * 0.019) / (vcpu - it.vcpu) : Infinity;
  const slo = { p99: c.sloP99, errorRate: 0.01 };

  const ch = useSimChallenge({
    seed: c.seed,
    durationS: c.durationS,
    fromS: c.fromS,
    speed: 4,
    slo,
    onResult,
    toMetrics: (agg) => ({ p99: agg.p99, errorRate: agg.errorRate, costPerMonth: cost, count, vcpu }),
  });
  const layout = fleetLayout(opts);
  const running = ch.phase === "running" || ch.phase === "replay";
  const highlight = useReplayHighlight(ch);
  useSloAlarm(ch.sim.windows, slo, ch.phase === "running");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <SimStage className="min-h-[340px] flex-1" sim={ch.sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps", "cost"]} slo={slo} highlight={highlight} honestPhysics={HONEST} />
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label="fleet plan">
          <div className={cx("flex flex-col gap-3", (running || locked) && "pointer-events-none opacity-50")}>
            <div>
              <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">instance type</div>
              <Segmented
                size="sm"
                label="Instance type"
                value={inst}
                onChange={setInst}
                options={c.instances.map((name) => ({ value: name, label: name.replace("m7i.", ""), hint: `${instance(name).vcpu} vCPU` }))}
              />
            </div>
            <Slider label="how many" value={count} min={1} max={8} step={1} onChange={setCount} format={(v) => `${v} × ${inst}`} />
            <div className="grid grid-cols-2 gap-2 font-mono text-2xs text-ink-2">
              <div>
                vCPUs<span className="block text-sm tabular text-ink-0">{vcpu}</span>
              </div>
              <div>
                cost / mo<span className="block text-sm tabular text-ink-0">{fmtUsd(cost)}</span>
              </div>
              <div>
                peak busy<span className={cx("block text-sm tabular", peakBusy > 0.85 ? "text-alert" : peakBusy > 0.7 ? "text-amber" : "text-ink-0")}>{Math.round(peakBusy * 100)}%</span>
              </div>
              <div>
                if one dies<span className={cx("block text-sm tabular", n1Busy > 0.9 ? "text-alert" : n1Busy > 0.75 ? "text-amber" : "text-ink-0")}>{Number.isFinite(n1Busy) ? `${Math.round(n1Busy * 100)}%` : "outage"}</span>
              </div>
            </div>
            <div className="font-mono text-[10px] text-ink-3">
              {INSTANCES.find((x) => x.name === inst)?.memGiB} GiB each · workers = (2 × vCPU) + 1 · the app retries a failed request once
            </div>
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={ch.result?.metrics} />
        <ChallengeControls ch={ch} onRun={() => ch.run(buildFleet(opts))} verdict={verdict} disabled={locked} runLabel="Post to Hacker News" />
        {running && <Chip tone="muted">A box will die at t+{c.crashAt}s. You were warned.</Chip>}
      </div>
    </div>
  );
}
