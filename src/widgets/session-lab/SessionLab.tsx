"use client";
/**
 * Session Shuffle: where does a logged-in user's session live, and what happens when requests move?
 *  - lab:    session mode, fleet size, restarts. Watch users get logged out.
 *  - deploy: challenge. Survive a rolling deploy with nobody logged out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { REDIS_NODES, monthly } from "@/engine/catalog";
import { aggregateWindows } from "@/engine/metrics";
import type { WindowMetrics } from "@/engine/types";
import { useSim } from "@/engine/useSim";
import { Button, Chip, cx, fmtPct, fmtUsd, Panel, Segmented, Sparkline } from "@/ui/kit";
import { ChallengeControls, useReplayHighlight, useSimChallenge, useSloAlarm } from "../sim/challenge";
import { SimStage } from "../sim/SimStage";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { buildFleet, fleetLayout, serversFor, type SessionMode } from "../fleet/spec";
import { deployOptions, labSpec, MODE_LABEL, SessionConfig } from "./spec";

export { SessionConfig };

type Mode = Exclude<SessionMode, "none">;
const MODES: Mode[] = ["local", "sticky", "redis", "cookie"];
const MODE_HINT: Record<Mode, string> = {
  local: "Django's default cache/db-less setup: the session lives in this process",
  sticky: "The balancer hashes each user to one box (nginx `hash`), sessions in memory",
  redis: "Every box reads sessions from one shared Redis",
  cookie: "Django signed_cookies: the client carries the session, signed with SECRET_KEY",
};
const HONEST = [
  "Each user has one session cookie. A box that doesn't hold the session logs the user out, and they log in again on that box.",
  "Sticky routing here is hash-based (like nginx `hash`), so any change to the pool reshuffles users. ALB cookie stickiness pins users until their box dies.",
  "Restarts wipe in-process memory. Redis is modelled as always up in this lab.",
];

const lossOf = (w?: WindowMetrics) => (w && w.ok + w.failed > 0 ? w.failReasons.session / (w.ok + w.failed) : 0);

export default function SessionLab(props: WidgetProps<SessionConfig>) {
  const c = SessionConfig.parse(props.config);
  return c.variant === "lab" ? <Lab {...props} config={c} /> : <Deploy {...props} config={c} />;
}

function LossStrip({ windows }: { windows: WindowMetrics[] }) {
  const series = windows.slice(-60).map(lossOf);
  const last = series[series.length - 1] ?? 0;
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-line bg-bg-1 px-3 py-2">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">users logged out</div>
        <div className={cx("font-mono text-2xl tabular", last > 0.01 ? "text-alert glow-alert" : "text-phos")}>{fmtPct(last, 1)}</div>
      </div>
      <Sparkline values={series} width={200} height={34} max={1} tone={last > 0.01 ? "alert" : "phos"} />
    </div>
  );
}

// ---------------------------------------------------------------- lab

function Lab({ config: c, onObserve, locked, mode: wmode, scene }: WidgetProps<SessionConfig>) {
  const [mode, setMode] = useState<Mode>("local");
  const [active, setActive] = useState(2);
  const [spec, setSpec] = useState(() => labSpec(c, "local", 2));
  const sim = useSim({ spec: wmode === "preview" ? null : spec, seed: c.seed, vizTarget: 300 });
  const servers = useMemo(() => serversFor(c.instance, 4, 15).slice(0, active), [c.instance, active]);
  const layout = fleetLayout({ servers, session: mode === "redis" ? "redis" : "local" });
  const changedAt = useRef<number | null>(null);

  const changeMode = (m: Mode) => {
    setMode(m);
    setSpec(labSpec(c, m, active));
    changedAt.current = null;
  };
  const changeActive = (n: number) => {
    setActive(n);
    sim.patch({ op: "set", node: "lb", changes: { targets: serversFor(c.instance, 4, 15).slice(0, n).map((s) => s.id) } });
    changedAt.current = sim.t;
  };

  const last = sim.windows[sim.windows.length - 1];
  const fired = useRef(new Set<string>());
  const runs = useRef({ loss: 0, fixed: 0 });
  useEffect(() => {
    if (!last) return;
    const fire = (e: string) => {
      if (fired.current.has(e)) return;
      fired.current.add(e);
      onObserve?.(e);
    };
    const loss = lossOf(last);
    runs.current.loss = mode === "local" && loss > 0.1 ? runs.current.loss + 1 : 0;
    runs.current.fixed = (mode === "redis" || mode === "cookie") && loss === 0 ? runs.current.fixed + 1 : 0;
    if (runs.current.loss >= 3) fire("session-loss");
    if (mode === "sticky" && changedAt.current !== null && last.t >= changedAt.current && loss > 0.05) fire("sticky-reshuffle");
    if (runs.current.fixed >= 5 && fired.current.has("session-loss")) fire("fixed");
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <LossStrip windows={sim.windows} />
        <SimStage className="min-h-[320px] flex-1" sim={sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps"]} highlight={scene === "state" ? servers.map((s) => s.id) : scene === "store" ? ["redis"] : []} honestPhysics={HONEST} />
      </div>
      <div className="flex w-full flex-col gap-3 lg:w-[320px]">
        <Panel label="where sessions live">
          <div className={cx("flex flex-col gap-2", locked && "pointer-events-none opacity-40")}>
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={cx("rounded-sm border px-2.5 py-2 text-left", mode === m ? "border-amber bg-amber-dim/40" : "border-line-2 hover:border-line-3")}
              >
                <div className="font-mono text-2xs uppercase tracking-[0.1em] text-ink-0">{MODE_LABEL[m]}</div>
                <div className="text-xs text-ink-2">{MODE_HINT[m]}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel label="fleet">
          <div className={cx("flex flex-col gap-2", locked && "pointer-events-none opacity-40")}>
            <Segmented size="sm" label="Boxes in rotation" value={active} onChange={changeActive} options={[2, 3, 4].map((n) => ({ value: n, label: `${n} boxes` }))} />
            <Button size="sm" variant="danger" onClick={() => sim.patch({ op: "restart", node: "app-1" })}>
              Restart app-1
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- deploy challenge

function Deploy({ config: c, onResult, verdict, locked, conditions }: WidgetProps<SessionConfig>) {
  const [mode, setMode] = useState<Mode>("local");
  const opts = deployOptions(c, mode);
  const layout = fleetLayout(opts);
  const redisCost = monthly(REDIS_NODES[1]!.usdPerHour);
  const slo = { p99: 0.3, errorRate: 0.01 };
  const ch = useSimChallenge({
    seed: c.seed,
    durationS: c.durationS,
    fromS: c.fromS,
    speed: 4,
    slo,
    onResult,
    toMetrics: (agg) => {
      const tot = Math.max(1, agg.ok + agg.failed);
      return { sessionLoss: agg.failReasons.session / tot, errorRate: agg.errorRate, p99: agg.p99, costPerMonth: agg.costPerMonth, revocable: mode === "redis" ? 1 : 0 };
    },
  });
  const running = ch.phase === "running" || ch.phase === "replay";
  const highlight = useReplayHighlight(ch);
  useSloAlarm(ch.sim.windows, slo, ch.phase === "running");
  const lossSoFar = useMemo(() => {
    const a = aggregateWindows(ch.sim.windows);
    const tot = a.ok + a.failed;
    return tot ? a.failReasons.session / tot : 0;
  }, [ch.sim.windows]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <LossStrip windows={ch.sim.windows} />
        <SimStage className="min-h-[320px] flex-1" sim={ch.sim} nodes={layout.nodes} edges={layout.edges} metrics={["p99", "errors", "rps", "cost"]} slo={slo} highlight={highlight} honestPhysics={HONEST} />
      </div>
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label="session strategy">
          <div className={cx("flex flex-col gap-2", (running || locked) && "pointer-events-none opacity-50")}>
            {MODES.map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("rounded-sm border px-2.5 py-2 text-left", mode === m ? "border-amber bg-amber-dim/40" : "border-line-2 hover:border-line-3")}>
                <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-[0.1em] text-ink-0">
                  {MODE_LABEL[m]}
                  <span className="text-ink-2">{m === "redis" ? `+${fmtUsd(redisCost)}/mo` : "+$0"}</span>
                </div>
                <div className="text-xs text-ink-2">{MODE_HINT[m]}</div>
              </button>
            ))}
          </div>
        </Panel>
        <ConditionList conditions={conditions} metrics={ch.result?.metrics} />
        <ChallengeControls ch={ch} onRun={() => ch.run(buildFleet(opts))} verdict={verdict} disabled={locked} runLabel="Ship deploy v42" />
        {running && <Chip tone={lossSoFar > 0.005 ? "alert" : "muted"}>logged out so far: {fmtPct(lossSoFar, 2)}</Chip>}
      </div>
    </div>
  );
}
