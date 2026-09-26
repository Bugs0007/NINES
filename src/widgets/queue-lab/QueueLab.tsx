"use client";
/**
 * Queue Lab: one box, one queue. Variants:
 *  - little:   the in-flight counter. L = lambda x W, live.
 *  - hockey:   the load dial. Utilization vs latency against the M/M/1 curve.
 *  - sizing:   challenge. Pick gunicorn workers for an I/O-heavy API under a memory cap.
 *  - capacity: challenge. Pick vCPUs for a CPU-bound service through a traffic peak.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { Dist } from "@/engine/dist";
import { mean } from "@/engine/dist";
import type { SimSpec, WindowMetrics } from "@/engine/types";
import type { RateCurve } from "@/engine/traffic";
import { useSim } from "@/engine/useSim";
import { Chip, cx, fmtLatency, fmtNum, fmtPct, fmtUsd, Meter, Panel } from "@/ui/kit";
import { Slider } from "@/ui/Slider";
import { spring } from "@/ui/motion";
import type { FlowEdge, FlowNode } from "@/ui/flow/FlowView";
import { ChallengeControls, useReplayHighlight, useSimChallenge, useSloAlarm } from "../sim/challenge";
import { SimStage } from "../sim/SimStage";
import type { WidgetProps } from "../types";

const DistSchema: z.ZodType<Dist> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("const"), value: z.number() }),
    z.object({ kind: z.literal("exp"), mean: z.number() }),
    z.object({ kind: z.literal("uniform"), min: z.number(), max: z.number() }),
    z.object({ kind: z.literal("lognormal"), median: z.number(), p99: z.number() }),
    z.object({ kind: z.literal("pareto"), min: z.number(), alpha: z.number(), max: z.number() }),
    z.object({ kind: z.literal("mix"), p: z.number(), a: DistSchema, b: DistSchema }),
  ]),
);

export const QueueLabConfig = z.object({
  variant: z.enum(["little", "hockey", "sizing", "capacity"]),
  label: z.string().default("api-1"),
  /** CPU time per request. */
  cpu: DistSchema.optional(),
  /** Waiting per request that holds a worker but not a core (DB, external calls). */
  io: DistSchema.optional(),
  cores: z.number().default(2),
  workers: z.number().default(4),
  rps: z.number().default(10),
  rpsMax: z.number().default(60),
  // sizing challenge
  ramGiB: z.number().optional(),
  reservedGiB: z.number().optional(),
  workerMb: z.number().optional(),
  maxWorkers: z.number().optional(),
  // capacity challenge
  peakRps: z.number().optional(),
  baseRps: z.number().optional(),
  usdPerCoreMonth: z.number().optional(),
  maxCores: z.number().optional(),
  durationS: z.number().default(70),
  fromS: z.number().default(10),
  sloP99: z.number().optional(),
  seed: z.string().default("queue-lab"),
});
export type QueueLabConfig = z.infer<typeof QueueLabConfig>;

const NODES = (label: string, workers: number, cores: number, sub?: string): FlowNode[] => [
  { id: "users", label: "users", kind: "client", x: 110, y: 300 },
  { id: "api", label, kind: "server", x: 760, y: 300, workers, cores, sub },
];
const EDGES: FlowEdge[] = [{ from: "users", to: "api" }];

function spec(c: QueueLabConfig, rps: number, workers: number, cores: number): SimSpec {
  const steps = [] as { kind: "cpu" | "io"; dist: Dist }[];
  if (c.cpu) steps.push({ kind: "cpu", dist: c.cpu });
  if (c.io) steps.push({ kind: "io", dist: c.io });
  return {
    nodes: [
      { kind: "client", id: "users", target: "api", rate: { kind: "const", rps }, timeoutS: 30 },
      { kind: "server", id: "api", label: c.label, cores, workers, steps },
    ],
  };
}

function serviceMean(c: QueueLabConfig): number {
  return (c.cpu ? mean(c.cpu) : 0) + (c.io ? mean(c.io) : 0);
}

/** Rolling average over the last n windows. */
function rolling(ws: WindowMetrics[], n: number, f: (w: WindowMetrics) => number): number {
  const xs = ws.slice(-n);
  if (!xs.length) return 0;
  return xs.reduce((s, w) => s + f(w), 0) / xs.length;
}

export default function QueueLab(props: WidgetProps<QueueLabConfig>) {
  const c = QueueLabConfig.parse(props.config);
  if (c.variant === "sizing" || c.variant === "capacity") return <QueueChallenge {...props} config={c} />;
  return <QueuePlay {...props} config={c} />;
}

// ---------------------------------------------------------------- play variants

function QueuePlay({ config: c, scene, onObserve, locked, mode }: WidgetProps<QueueLabConfig>) {
  const S = serviceMean(c);
  const hockey = c.variant === "hockey";
  const [workers, setWorkers] = useState(c.workers);
  const [rps, setRps] = useState(c.rps);
  const [rho, setRho] = useState(0.3);
  const effectiveRps = hockey ? (rho * c.cores) / S : rps;
  const initial = useMemo(() => spec(c, hockey ? (0.3 * c.cores) / S : c.rps, c.workers, c.cores), [c, hockey, S]);
  const sim = useSim({ spec: mode === "preview" ? null : initial, seed: c.seed, speed: 1, vizTarget: 260 });

  // live patches
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    sim.patch({ op: "set", node: "users", changes: { rate: { kind: "const", rps: effectiveRps } } });
  }, [effectiveRps, sim]);
  const firstW = useRef(true);
  useEffect(() => {
    if (firstW.current) {
      firstW.current = false;
      return;
    }
    sim.patch({ op: "set", node: "api", changes: { workers } });
  }, [workers, sim]);

  const ws = sim.windows;
  const last = ws[ws.length - 1];
  const L = rolling(ws, 5, (w) => w.nodes["api"]?.inflight ?? 0);
  const lam = rolling(ws, 5, (w) => w.throughput);
  const W = rolling(ws, 5, (w) => w.mean);
  const capacity = Math.min(workers / S, c.cpu ? c.cores / mean(c.cpu) : Infinity);
  const measuredRho = rolling(ws, 8, (w) => Math.max(w.nodes["api"]?.util ?? 0, w.nodes["api"]?.workerUtil ?? 0));

  // observations
  const overRun = useRef(0);
  const highRun = useRef(0);
  const observed = useRef(new Set<string>());
  useEffect(() => {
    if (!last) return;
    const fire = (e: string, data?: Record<string, unknown>) => {
      if (observed.current.has(e)) return;
      observed.current.add(e);
      onObserve?.(e, data);
    };
    if (!hockey) {
      const q = last.nodes["api"]?.queue ?? 0;
      overRun.current = effectiveRps > capacity * 1.08 && q > workers ? overRun.current + 1 : 0;
      if (overRun.current >= 4) fire("over-capacity", { capacity, rps: effectiveRps });
      if (ws.length >= 6) fire("little-holds", { L, lam, W });
    } else {
      highRun.current = rho >= 0.85 ? highRun.current + 1 : 0;
      if (highRun.current >= 8) fire("rho-high", { rho, W });
    }
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = scene ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <SimStage
        className="min-h-[340px] flex-1"
        sim={sim}
        nodes={NODES(c.label, workers, c.cores, hockey ? "1 worker · 1 core" : `${workers} workers · ${c.cores} vCPU`)}
        edges={EDGES}
        metrics={hockey ? ["p50", "p99", "util", "queue"] : ["p50", "p99", "rps", "queue"]}
        inflightNode="api"
        utilNode="api"
        highlight={focus === "focus-queue" || focus === "focus-capacity" ? ["api"] : []}
        honestPhysics={[
          "Arrivals are Poisson: independent, random, at the rate you set.",
          "Service times are drawn from a distribution, so identical requests still vary.",
          "The OS scheduler is modelled as a FIFO run-queue per core. Real kernels time-slice, which changes the tail slightly but not the average.",
          "Network hops add 0.25ms each way (intra-AZ).",
        ]}
      />
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        {!hockey ? (
          <LittlePanel L={L} lam={lam} W={W} focus={focus} />
        ) : (
          <HockeyChart points={ws} S={S} rho={measuredRho} W={W} focus={focus} />
        )}
        <Panel label="controls">
          <div className={cx("flex flex-col gap-3", locked && "pointer-events-none opacity-40")}>
            {!hockey ? (
              <>
                <Slider label="arrivals (λ)" value={rps} min={1} max={c.rpsMax} step={1} onChange={setRps} format={(v) => `${v} req/s`} zone={{ from: Math.min(c.rpsMax, capacity), to: c.rpsMax, tone: "alert" }} />
                <Slider label="gunicorn workers" value={workers} min={1} max={16} step={1} onChange={setWorkers} format={(v) => `${v}`} />
                <div className="flex items-center justify-between font-mono text-2xs text-ink-2">
                  <span>capacity ≈ workers ÷ time per request</span>
                  <span className={cx("tabular", rps > capacity ? "text-alert" : "text-phos")}>{fmtNum(capacity)}/s</span>
                </div>
              </>
            ) : (
              <>
                <Slider
                  label="load (utilization ρ)"
                  value={rho}
                  min={0.05}
                  max={0.98}
                  step={0.01}
                  onChange={setRho}
                  format={(v) => `${Math.round(v * 100)}% · ${fmtNum((v * c.cores) / S)} req/s`}
                  zone={{ from: 0.8, to: 0.98, tone: "alert" }}
                  marks={[
                    { value: 0.5, label: "50" },
                    { value: 0.7, label: "70" },
                    { value: 0.9, label: "90" },
                  ]}
                />
                <p className="text-xs text-ink-2">Service time is fixed at {fmtLatency(S)} on average. Only the arrival rate changes.</p>
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LittlePanel({ L, lam, W, focus }: { L: number; lam: number; W: number; focus: string | null }) {
  const predicted = lam * W;
  const cell = (label: string, v: string, hot: boolean) => (
    <motion.div animate={{ scale: hot ? 1.06 : 1 }} transition={spring.snap} className={cx("rounded-sm border px-2 py-1.5 text-center", hot ? "border-amber shadow-glow-amber" : "border-line-2")}>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">{label}</div>
      <div className="font-mono text-lg tabular text-ink-0">{v}</div>
    </motion.div>
  );
  return (
    <Panel label="little's law · live" right={<Chip tone={Math.abs(L - predicted) / Math.max(0.1, L) < 0.08 ? "ok" : "muted"}>holds</Chip>}>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5">
        {cell("L in flight", L.toFixed(1), focus === "focus-L")}
        <span className="font-display text-2xl text-ink-2">=</span>
        {cell("λ /s", lam.toFixed(1), focus === "focus-lambda")}
        <span className="font-display text-2xl text-ink-2">×</span>
        {cell("W", fmtLatency(W), focus === "focus-W")}
      </div>
      <div className="mt-2 font-mono text-2xs text-ink-2">
        λ × W = <span className="text-amber tabular">{predicted.toFixed(1)}</span> · measured L = <span className="text-amber tabular">{L.toFixed(1)}</span>
      </div>
    </Panel>
  );
}

function HockeyChart({ points, S, rho, W, focus }: { points: WindowMetrics[]; S: number; rho: number; W: number; focus: string | null }) {
  const w = 300;
  const h = 190;
  const pad = { l: 34, r: 8, t: 10, b: 24 };
  const maxY = 20; // in multiples of S
  const x = (r: number) => pad.l + r * (w - pad.l - pad.r);
  const y = (m: number) => h - pad.b - (Math.min(maxY, m) / maxY) * (h - pad.t - pad.b);
  const theory = Array.from({ length: 95 }, (_, i) => {
    const r = i / 100;
    return `${i ? "L" : "M"}${x(r).toFixed(1)},${y(1 / (1 - r)).toFixed(1)}`;
  }).join("");
  // trail of measured points: rolling 6-window averages
  const trail: [number, number][] = [];
  for (let i = 6; i <= points.length; i += 2) {
    const seg = points.slice(i - 6, i);
    const r = seg.reduce((s, p) => s + Math.max(p.nodes["api"]?.util ?? 0, 0), 0) / seg.length;
    const m = seg.reduce((s, p) => s + p.mean, 0) / seg.length / S;
    if (Number.isFinite(m) && m > 0) trail.push([r, m]);
  }
  const cur: [number, number] = [rho, W / S];
  return (
    <Panel label="the hockey stick" right={<span className="tabular">W ÷ S = {(W / S || 0).toFixed(1)}×</span>}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Average latency against utilization, measured points over the theoretical curve">
        {[0.5, 0.7, 0.9].map((r) => (
          <g key={r}>
            <line x1={x(r)} x2={x(r)} y1={pad.t} y2={h - pad.b} stroke="#1a2a31" />
            <text x={x(r)} y={h - 8} fill="#6f857c" fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)">
              {r * 100}%
            </text>
          </g>
        ))}
        {[1, 5, 10, 20].map((m) => (
          <g key={m}>
            <line x1={pad.l} x2={w - pad.r} y1={y(m)} y2={y(m)} stroke="#1a2a31" />
            <text x={pad.l - 4} y={y(m) + 3} fill="#6f857c" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
              {m}×
            </text>
          </g>
        ))}
        <rect x={x(0.8)} y={pad.t} width={x(0.98) - x(0.8)} height={h - pad.t - pad.b} fill="rgb(255 90 78 / 0.07)" />
        <path d={theory} fill="none" stroke={focus === "curve" ? "#ffb547" : "#465851"} strokeWidth={focus === "curve" ? 2 : 1.5} strokeDasharray={focus === "curve" ? "0" : "4 3"} />
        {trail.map(([r, m], i) => (
          <circle key={i} cx={x(r)} cy={y(m)} r={1.8} fill="#5cf29a" opacity={0.25 + (0.6 * i) / Math.max(1, trail.length)} />
        ))}
        {rho > 0 && <circle cx={x(cur[0])} cy={y(cur[1])} r={4.5} fill="#5cf29a" stroke="#04070a" strokeWidth={1.5} />}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
        <span>x: busy %</span>
        <span>y: latency ÷ service time</span>
        <span>dashed: M/M/1 theory</span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- challenge variants

function QueueChallenge({ config: c, onResult, verdict, locked, conditions }: WidgetProps<QueueLabConfig>) {
  const sizing = c.variant === "sizing";
  const [workers, setWorkers] = useState(sizing ? Math.min(c.maxWorkers ?? 48, 12) : 2);
  const cores = sizing ? c.cores : workers;
  const w = workers;
  const S = serviceMean(c);
  const memGiB = sizing ? (c.reservedGiB ?? 1) + (w * (c.workerMb ?? 150)) / 1024 : 0;
  const cost = !sizing ? w * (c.usdPerCoreMonth ?? 36.8) : 0;
  const slo = { p99: c.sloP99, errorRate: 0.01 };

  const ch = useSimChallenge({
    seed: c.seed,
    durationS: c.durationS,
    fromS: c.fromS,
    speed: 3,
    slo,
    onResult,
    toMetrics: (agg) => ({
      p99: agg.p99,
      p50: agg.p50,
      errorRate: agg.errorRate,
      workers: w,
      cores,
      memGiB,
      costPerMonth: cost,
      util: agg.util["api"] ?? 0,
    }),
  });
  const running = ch.phase === "running" || ch.phase === "replay";
  const highlight = useReplayHighlight(ch);
  useSloAlarm(ch.sim.windows, slo, ch.phase === "running");

  const buildSpec = (): SimSpec => {
    const steps = [] as { kind: "cpu" | "io"; dist: Dist }[];
    if (c.cpu) steps.push({ kind: "cpu", dist: c.cpu });
    if (c.io) steps.push({ kind: "io", dist: c.io });
    const rate: RateCurve = sizing
      ? { kind: "const", rps: c.rps }
      : {
          kind: "keyframes",
          points: [
            [0, c.baseRps ?? 40],
            [30, c.peakRps ?? 140],
            [c.durationS - 10, c.peakRps ?? 140],
            [c.durationS, (c.baseRps ?? 40) * 1.5],
          ],
        };
    return {
      nodes: [
        { kind: "client", id: "users", target: "api", rate, timeoutS: 10 },
        { kind: "server", id: "api", label: c.label, cores, workers: w, steps, costPerMonth: cost },
      ],
    };
  };

  const memOk = memGiB <= (c.ramGiB ?? Infinity);
  const offered = sizing ? c.rps * S : ((c.peakRps ?? 140) * S) / Math.max(1, cores);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <SimStage
        className="min-h-[340px] flex-1"
        sim={ch.sim}
        nodes={NODES(c.label, w, cores, sizing ? `${w} workers · ${cores} vCPU` : `${cores} vCPU · 1 worker each`)}
        edges={EDGES}
        metrics={sizing ? ["p50", "p99", "errors", "inflight"] : ["p99", "errors", "rps", "util"]}
        slo={slo}
        inflightNode="api"
        utilNode="api"
        highlight={highlight}
        honestPhysics={[
          "Arrivals are Poisson; service times are drawn per request.",
          sizing ? "Memory is counted, not simulated: going over the box's RAM would mean swapping or the OOM killer." : "Each vCPU runs one worker; cost is linear in vCPUs, as it is within an EC2 family.",
          "The run is seeded, so the same setup always produces the same result.",
        ]}
      />
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label={sizing ? "gunicorn config" : "capacity plan"}>
          <div className={cx("flex flex-col gap-3", (running || locked) && "pointer-events-none opacity-50")}>
            {sizing ? (
              <>
                <Slider label="workers" value={workers} min={1} max={c.maxWorkers ?? 60} step={1} onChange={setWorkers} format={(v) => `${v}`} />
                <div>
                  <div className="mb-1 flex justify-between font-mono text-2xs text-ink-2">
                    <span>memory</span>
                    <span className={cx("tabular", memOk ? "text-ink-1" : "text-alert")}>
                      {memGiB.toFixed(1)} / {c.ramGiB} GiB
                    </span>
                  </div>
                  <Meter value={memGiB / (c.ramGiB ?? 8)} warnAt={0.75} alertAt={0.9} label="memory used" />
                  <div className="mt-1 font-mono text-[10px] text-ink-3">
                    {c.workerMb} MB per worker + {c.reservedGiB} GiB for OS, nginx, page cache
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-2xs text-ink-2">
                  <div>
                    traffic <span className="block text-sm text-ink-0 tabular">{c.rps} req/s</span>
                  </div>
                  <div>
                    avg time / req <span className="block text-sm text-ink-0 tabular">{fmtLatency(S)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Slider label="vCPUs (1 worker each)" value={workers} min={1} max={c.maxCores ?? 12} step={1} onChange={setWorkers} format={(v) => `${v}`} />
                <div className="grid grid-cols-2 gap-2 font-mono text-2xs text-ink-2">
                  <div>
                    peak traffic <span className="block text-sm text-ink-0 tabular">{c.peakRps} req/s</span>
                  </div>
                  <div>
                    avg service <span className="block text-sm text-ink-0 tabular">{fmtLatency(S)}</span>
                  </div>
                  <div>
                    peak busy (est.) <span className={cx("block text-sm tabular", offered >= 1 ? "text-alert" : offered > 0.8 ? "text-amber" : "text-ink-0")}>{fmtPct(Math.min(offered, 9.99), 0)}</span>
                  </div>
                  <div>
                    cost <span className="block text-sm text-ink-0 tabular">{fmtUsd(cost)}/mo</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={ch.result?.metrics} />
        <ChallengeControls ch={ch} onRun={() => ch.run(buildSpec())} verdict={verdict} disabled={locked} runLabel={sizing ? "Deploy & take traffic" : "Run the peak"} />
      </div>
    </div>
  );
}

export function ConditionList({ conditions, metrics }: { conditions?: WidgetProps["conditions"]; metrics?: Record<string, number> }) {
  if (!conditions?.length) return null;
  return (
    <Panel label="win conditions">
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {conditions.map((cond, i) => {
            const v = metrics?.[cond.metric];
            const pass = v === undefined ? null : evalCond(v, cond.op, cond.value);
            return (
              <motion.li key={i} layout className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-1">{cond.label}</span>
                <span className={cx("font-mono text-xs tabular", pass === null ? "text-ink-3" : pass ? "text-phos" : "text-alert")}>
                  {v === undefined ? "—" : formatMetric(cond.metric, v)} {pass === null ? "" : pass ? "✓" : "✗"}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}

export function evalCond(v: number, op: string, target: number): boolean {
  switch (op) {
    case "<":
      return v < target;
    case "<=":
      return v <= target;
    case ">":
      return v > target;
    case ">=":
      return v >= target;
    default:
      return Math.abs(v - target) < 1e-9;
  }
}

export function formatMetric(metric: string, v: number): string {
  if (/^p\d+|latency|mean|ms$/i.test(metric)) return fmtLatency(v);
  if (/rate|availability|util|good/i.test(metric)) return fmtPct(v, v < 0.1 ? 2 : 1);
  if (/cost|usd/i.test(metric)) return fmtUsd(v);
  if (/GiB/i.test(metric)) return `${v.toFixed(1)} GiB`;
  return fmtNum(v);
}
