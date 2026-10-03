"use client";
/**
 * The Incident Room: investigate a live incident on the simulation, pin evidence, state a hypothesis,
 * mitigate, confirm recovery, write a three-line postmortem. Scored on time-to-mitigate, root cause,
 * evidence, and collateral damage.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { askSre, aiStatus, gradeExplanation } from "@/ai/client";
import type { WindowMetrics } from "@/engine/types";
import { useSim } from "@/engine/useSim";
import { useGame } from "@/game/store";
import { useMusic } from "@/audio/useMusic";
import { CastLine } from "@/ui/Cast";
import { Cinematic } from "@/ui/Cinematic";
import { Button, Chip, cx, fmtLatency, fmtPct, Led } from "@/ui/kit";
import { spring, Ticker } from "@/ui/motion";
import { clockAt } from "./inc-fourth-box";
import { Dashboards, Hosts, Logs, Timeline, Traces, type Pin } from "./panels";
import type { Incident, IncidentState, LogLine } from "./types";
import { HonestNotes } from "@/ui/HonestNotes";

type Phase = "page" | "room" | "postmortem" | "score";
type Tab = "dash" | "logs" | "hosts" | "traces" | "timeline";

const GOOD_STREAK = 20;

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function IncidentRoom({ inc }: { inc: Incident }) {
  const [phase, setPhase] = useState<Phase>("page");
  const markSeen = useGame((s) => s.markSeen);
  const skipIntro = useGame((s) => s.hydrated && s.profile.settings.skipSeenCinematics && s.profile.seen.includes(`intro:${inc.id}`));
  if (skipIntro && phase === "page") setPhase("room");
  const [tab, setTab] = useState<Tab>("dash");
  const [speed, setSpeed] = useState(1);
  const sim = useSim({ spec: phase === "page" ? null : inc.spec, seed: inc.seed, speed: phase === "room" ? speed : 0, vizTarget: 220, keepWindows: 900 });
  const [pins, setPins] = useState<Pin[]>([]);
  const [hyp, setHyp] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ id: string; at: number }[]>([]);
  const [feed, setFeed] = useState<{ t: number; label: string; kind: string }[]>([]);
  const [pendingNotes, setPendingNotes] = useState<{ t: number; label: string }[]>([]);
  const [logs, setLogs] = useState<LogLine[]>(inc.staticLogs);
  const [recovered, setRecovered] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const seeked = useRef(false);
  const rand = useRef(mulberry(7));
  const goodRun = useRef(0);

  // Pre-roll to the page, so dashboards have history when you walk in.
  useEffect(() => {
    if (phase === "room" && !seeked.current && sim.windows.length > 0) {
      seeked.current = true;
      sim.seek(inc.pageAt);
    }
  }, [phase, sim.windows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // New windows: live logs, recovery detection.
  const last = sim.windows[sim.windows.length - 1];
  const lastSeen = useRef(-1);
  useEffect(() => {
    const fresh = sim.windows.filter((w) => w.t > lastSeen.current);
    if (!fresh.length) return;
    lastSeen.current = fresh[fresh.length - 1]!.t;
    setLogs((ls) => [...ls, ...fresh.flatMap((w) => inc.liveLogs(w, rand.current))].slice(-3000));
    for (const w of fresh) {
      if (w.t < inc.pageAt) continue;
      const good = w.errorRate < inc.slo.errorRate && (w.ok === 0 || w.p99 < inc.slo.p99);
      goodRun.current = good ? goodRun.current + 1 : 0;
      if (goodRun.current >= GOOD_STREAK && recovered === null && applied.length) {
        const at = w.t - GOOD_STREAK + 1;
        setRecovered(at);
        setFeed((f) => [...f, { t: at, label: "Checkout back within SLO", kind: "recover" }]);
        sfx.alarm(false);
        sfx.recovery();
      }
    }
  }, [sim.windows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Action notes appear when their sim time arrives.
  useEffect(() => {
    const due = pendingNotes.filter((n) => n.t <= sim.t);
    if (!due.length) return;
    setFeed((f) => [...f, ...due.map((n) => ({ ...n, kind: "action" }))]);
    setPendingNotes((n) => n.filter((x) => x.t > sim.t));
  }, [sim.t, pendingNotes]);

  // Alarm while burning.
  const burning = !!last && last.t >= inc.pageAt && last.errorRate > inc.slo.errorRate * 3 && recovered === null;
  // Score: tense while burning, easing off once mitigated, silent for the postmortem.
  useMusic(phase === "room" ? { root: 50, scale: "dorian", intensity: recovered !== null ? 0.15 : burning ? 0.8 : 0.45 } : null);
  useEffect(() => {
    sfx.alarm(burning && phase === "room");
    return () => sfx.alarm(false);
  }, [burning, phase]);

  const state: IncidentState = { t: sim.t, applied: applied.map((a) => a.id), last };
  const pin = (p: Pin) => setPins((ps) => (ps.some((x) => x.key === p.key) ? ps.filter((x) => x.key !== p.key) : [...ps, p]));

  const apply = (id: string) => {
    const m = inc.mitigations.find((x) => x.id === id)!;
    const now = sim.t;
    setApplied((a) => [...a, { id, at: now }]);
    setFeed((f) => [...f, { t: now, label: `You: ${m.label}`, kind: "action" }]);
    sfx.thunk();
    // Actions take time: each patch lands after its delay in sim time (deterministic, replayable).
    for (const p of m.patches({ ...state, applied: [...state.applied, id] })) sim.patch({ op: "after", delay: p.delay, patch: p.patch });
    setPendingNotes((n) => [...n, { t: now + m.takesS, label: m.note }]);
    setConfirm(null);
  };

  const failedSincePage = useMemo(() => sim.windows.filter((w) => w.t >= inc.pageAt).reduce((s, w) => s + w.failed, 0), [sim.windows, inc.pageAt]);
  const sincePage = Math.max(0, sim.t - inc.pageAt);
  const sincePageLabel = `${Math.floor(sincePage / 60)}m${String(Math.floor(sincePage % 60)).padStart(2, "0")}s`;

  const ask = async () => {
    const level = Math.min(3, hints.length + 1);
    const status = await aiStatus();
    let h: string | null = null;
    if (status?.enabled) {
      h = await askSre({
        mission: `${inc.code} ${inc.title}`,
        goal: "Find the root cause from evidence and mitigate the incident.",
        situation: `Page: ${inc.page.title}. ${inc.page.detail} Pinned evidence: ${pins.map((p) => p.text.slice(0, 80)).join(" | ") || "none"}. Actions taken: ${applied.map((a) => a.id).join(", ") || "none"}.`,
        previous: hints,
        level,
      });
    }
    setHints((x) => [...x, h ?? inc.hints[Math.min(x.length, inc.hints.length - 1)]!]);
  };

  if (phase === "page") {
    return (
      <Cinematic
        tone="alert"
        sound="alarm"
        frames={[{ kind: "title", kicker: `${inc.severity} · ${clockAt(inc.pageAt, inc.clock0)} IST`, title: inc.page.title, sub: inc.page.detail, tone: "alert", ms: 3200 }, ...inc.intro.map((line) => ({ kind: "line" as const, line }))]}
        onDone={() => {
          void markSeen(`intro:${inc.id}`);
          setPhase("room");
        }}
      />
    );
  }

  if (phase === "postmortem" || phase === "score") {
    return <Postmortem inc={inc} pins={pins} hyp={hyp} applied={applied} recovered={recovered} failed={failedSincePage} onScored={() => setPhase("score")} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className={cx("sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur transition-colors duration-700 lg:gap-4 lg:px-8", burning ? "border-alert-3/50 bg-alert-dim/90" : "border-line/60 bg-bg-0/90")}>
        <Link href="/incident" aria-label="Back to the incident list" className="-ml-2.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] text-ink-2 transition-colors hover:bg-bg-2 hover:text-amber">
          ←
        </Link>
        <Chip tone={recovered !== null ? "ok" : "alert"} className="shrink-0 whitespace-nowrap">{inc.severity}</Chip>
        <span className="min-w-0 truncate font-display text-lg font-semibold text-ink-0">
          <span className="hidden font-mono text-[13px] font-normal text-ink-2 sm:inline">{inc.code} · </span>
          {inc.title}
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs tabular text-ink-1">
          {clockAt(sim.t, inc.clock0)}
          <span className="hidden lg:inline"> IST · page +{sincePageLabel}</span>
        </span>
        <SpeedControl value={speed} onChange={setSpeed} className="hidden md:inline-flex" />
      </header>

      {/* Below lg the status card sits under the tools, so the numbers that matter ride along under the header. */}
      <div className={cx("sticky top-14 z-30 flex h-10 items-center gap-3 border-b px-4 text-xs backdrop-blur transition-colors duration-700 lg:hidden", burning ? "border-alert-3/40 bg-alert-dim/90" : "border-line/60 bg-bg-0/90")}>
        <span className={cx("flex shrink-0 items-center gap-1.5 font-semibold", recovered !== null ? "text-phos" : "text-alert")}>
          <Led tone={recovered !== null ? "ok" : "alert"} />
          {recovered !== null ? "Recovered" : "Burning"}
        </span>
        <span className="shrink-0 text-ink-2">
          page <span className="font-mono tabular text-ink-1">+{sincePageLabel}</span>
        </span>
        <span className="ml-auto shrink-0 text-ink-2">
          errors <span className={cx("font-mono tabular", (last?.errorRate ?? 0) > inc.slo.errorRate ? "text-alert" : "text-phos")}>{last ? fmtPct(last.errorRate, 1) : "—"}</span>
        </span>
        <span className="shrink-0 text-ink-2">
          p99 <span className="font-mono tabular text-ink-0">{last?.ok ? fmtLatency(last.p99) : "—"}</span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:px-8 lg:py-5">
        <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:h-[calc(100dvh-96px)]">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-full border border-line/70 bg-bg-1/70 p-1 no-scrollbar" role="tablist" aria-label="War room tools">
              {(
                [
                  ["dash", "Dashboards"],
                  ["logs", "Logs"],
                  ["hosts", "Hosts"],
                  ["traces", "Traces"],
                  ["timeline", "Timeline"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("h-8 shrink-0 rounded-full px-2.5 text-[13px] font-semibold transition-colors duration-200 sm:px-3.5", tab === id ? "bg-amber text-bg-0" : "text-ink-2 hover:bg-bg-2 hover:text-ink-0")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 md:hidden">
              <span className="text-xs text-ink-3" aria-hidden>
                Sim speed
              </span>
              <SpeedControl value={speed} onChange={setSpeed} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "dash" && <Dashboards inc={inc} sim={sim} pins={pins} pin={pin} />}
            {tab === "logs" && <Logs lines={logs} pins={pins} pin={pin} clock0={inc.clock0} />}
            {tab === "hosts" && <Hosts inc={inc} state={state} pins={pins} pin={pin} />}
            {tab === "traces" && <Traces traces={inc.traces} pins={pins} pin={pin} />}
            {tab === "timeline" && <Timeline inc={inc} feed={feed} />}
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col gap-6 rounded-lg border border-line/80 bg-bg-1/75 p-4 shadow-card lg:h-[calc(100dvh-96px)] lg:overflow-y-auto lg:p-5">
          <Status last={last} failed={failedSincePage} recovered={recovered} inc={inc} />
          <section>
            <div className="mb-2 flex items-center justify-between eyebrow text-xs text-ink-2">
              <span>Evidence board</span>
              <span className="font-mono tabular text-ink-3">{pins.length}</span>
            </div>
            {pins.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-ink-3">Pin log lines, command output, dashboard rows, or traces that support your theory.</p>
            ) : (
              <ul className="space-y-2">
                {pins.map((p) => (
                  <li key={p.key} className="group rounded-md border border-line-2/70 bg-bg-2/60 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <pre className="min-w-0 whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-1 [overflow-wrap:anywhere]">{p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text}</pre>
                      <button onClick={() => pin(p)} className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs text-ink-3 transition-colors hover:bg-alert-dim hover:text-alert" aria-label="Unpin">
                        ✕
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-ink-3">{p.where}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-2 eyebrow text-xs text-ink-2">Hypothesis</div>
            <div className="flex flex-col gap-1.5">
              {inc.hypotheses.map((h) => (
                <button key={h.id} onClick={() => setHyp(h.id)} aria-pressed={hyp === h.id} className={cx("rounded-md border px-3 py-2 text-left text-[13px] leading-snug transition-colors duration-200", hyp === h.id ? "border-amber/70 bg-amber-dim/50 text-ink-0" : "border-line-2/70 text-ink-1 hover:border-line-3 hover:bg-bg-2/60")}>
                  {h.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-2 eyebrow text-xs text-ink-2">Actions</div>
            <div className="flex flex-col gap-1.5">
              {inc.mitigations.map((m) => {
                const done = applied.some((a) => a.id === m.id);
                return (
                  <div key={m.id}>
                    <button
                      disabled={done}
                      onClick={() => (confirm === m.id ? apply(m.id) : setConfirm(m.id))}
                      className={cx("w-full rounded-md border px-3 py-2 text-left text-[13px] leading-snug transition-colors duration-200", done ? "border-line/70 text-ink-3" : confirm === m.id ? "border-alert/70 bg-alert-dim/60 text-ink-0" : "border-line-2/70 text-ink-1 hover:border-line-3 hover:bg-bg-2/60")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{m.label}</span>
                        <span className={cx("shrink-0 text-xs", confirm === m.id && !done ? "font-medium text-alert" : "font-mono tabular text-ink-3")}>{done ? "Done" : confirm === m.id ? "Tap to confirm" : `~${m.takesS}s`}</span>
                      </div>
                      {confirm === m.id && <div className="mt-1.5 text-xs leading-relaxed text-ink-2">{m.detail}</div>}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-md border border-line/70 bg-bg-2/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow text-xs text-ink-2">Ask the SRE</span>
              <Button size="sm" variant="ghost" onClick={ask} disabled={hints.length >= 3}>
                {hints.length ? "Narrower" : "Nudge me"}
              </Button>
            </div>
            {hints.map((h, i) => (
              <CastLine key={i} line={{ speaker: "meera", line: h }} compact typewriter={i === hints.length - 1} className="mt-2" />
            ))}
          </section>
          <Button variant={recovered !== null ? "go" : "secondary"} size="lg" disabled={recovered === null || !hyp} onClick={() => setPhase("postmortem")} className="mt-auto shrink-0">
            {recovered === null ? "Recover checkout first" : !hyp ? "Pick a hypothesis" : "Resolve and write the postmortem"}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Status({ last, failed, recovered, inc }: { last?: WindowMetrics; failed: number; recovered: number | null; inc: Incident }) {
  return (
    <section className={cx("rounded-md border p-4 transition-colors duration-700", recovered !== null ? "border-phos-3/60 bg-phos-dim/30" : "border-alert-3/60 bg-alert-dim/35")}>
      <div className="flex items-center gap-2.5 text-sm font-semibold">
        <Led tone={recovered !== null ? "ok" : "alert"} blink={recovered === null} />
        <span className={recovered !== null ? "text-phos" : "text-alert"}>{recovered !== null ? <>Recovered at <span className="font-mono tabular">{clockAt(recovered, inc.clock0)}</span></> : "Burning"}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs leading-tight text-ink-2">
        <div className="min-w-0">
          Errors<span className={cx("mt-1 block font-mono text-lg tabular", (last?.errorRate ?? 0) > inc.slo.errorRate ? "text-alert" : "text-phos")}>{last ? fmtPct(last.errorRate, 1) : "—"}</span>
        </div>
        <div className="min-w-0">
          p99<span className="mt-1 block font-mono text-lg tabular text-ink-0">{last?.ok ? fmtLatency(last.p99) : "—"}</span>
        </div>
        <div className="min-w-0">
          Failed since page<span className="mt-1 block font-mono text-lg tabular text-ink-0">{failed.toLocaleString()}</span>
        </div>
      </div>
    </section>
  );
}

/** Sim speed as a quiet radio group: the header's loudest element shouldn't be a playback control. */
function SpeedControl({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Speed" className={cx("shrink-0 gap-0.5 rounded-full border border-line/70 bg-bg-1/60 p-0.5", className ?? "inline-flex")}>
      {[1, 2, 4].map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (active) return;
              sfx.unlock();
              sfx.tick();
              onChange(v);
            }}
            className={cx("h-9 min-w-10 rounded-full px-2.5 font-mono text-xs tabular transition-colors duration-200 sm:pointer-fine:h-7 sm:pointer-fine:min-w-9", active ? "bg-bg-3 text-ink-0" : "text-ink-2 hover:text-ink-0")}
          >
            {v}×
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- postmortem + score

const EXEMPLAR_PARTS = /(What happened|Root cause|Mitigation|Prevention):\s*/g;

/** The reference postmortem, split on its own labels so it reads as four short parts, not one paragraph. */
function Exemplar({ text, className }: { text: string; className?: string }) {
  const marks = [...text.matchAll(EXEMPLAR_PARTS)];
  if (marks.length < 2 || marks[0]!.index !== 0) return <p className={cx("max-w-prose text-[15px] leading-relaxed text-ink-0", className)}>{text}</p>;
  return (
    <dl className={cx("max-w-prose space-y-4", className)}>
      {marks.map((m, i) => (
        <div key={m[1]}>
          <dt className="eyebrow text-xs text-ink-2">{m[1]}</dt>
          <dd className="mt-1 text-[15px] leading-relaxed text-ink-0">{text.slice(m.index! + m[0].length, marks[i + 1]?.index ?? text.length).trim()}</dd>
        </div>
      ))}
    </dl>
  );
}

function Postmortem({ inc, pins, hyp, applied, recovered, failed, onScored }: { inc: Incident; pins: Pin[]; hyp: string | null; applied: { id: string; at: number }[]; recovered: number | null; failed: number; onScored: () => void }) {
  const store = useGame();
  const [lines, setLines] = useState({ what: "", cause: "", prevent: "" });
  const [grading, setGrading] = useState(false);
  const [score, setScore] = useState<null | { pm: number; how: string; gap?: string; xp: number; parts: [string, number][] }>(null);
  const [self, setSelf] = useState<Record<string, "met" | "partial" | "missed">>({});
  const [needSelf, setNeedSelf] = useState(false);
  const ready = lines.what.split(/\s+/).length >= 5 && lines.cause.split(/\s+/).length >= 5 && lines.prevent.split(/\s+/).length >= 4;

  const ttm = recovered !== null ? Math.max(0, recovered - inc.pageAt) : 999;
  const rootOk = inc.hypotheses.find((h) => h.id === hyp)?.correct ?? false;
  const keyCats = new Set(pins.map((p) => p.evidence).filter((e) => e && inc.evidence.find((x) => x.id === e)?.key));
  const herrings = new Set(pins.map((p) => p.evidence).filter((e) => e && inc.evidence.find((x) => x.id === e && !x.key)));
  const harmful = applied.filter((a) => inc.mitigations.find((m) => m.id === a.id)?.kind === "harmful").length;

  const finish = async (pm: number, how: string, gap?: string) => {
    const speed = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, ttm - 90) / 3)));
    const parts: [string, number][] = [
      ["Resolved", 100],
      [`Time to mitigate ${Math.floor(ttm / 60)}m${Math.round(ttm % 60)}s`, speed],
      [`Root cause ${rootOk ? "correct" : "wrong"}`, rootOk ? 60 : 0],
      [`Evidence: ${keyCats.size} key${herrings.size ? `, ${herrings.size} red herring` : ""}`, Math.max(0, Math.min(4, keyCats.size) * 10 - herrings.size * 10)],
      [`Collateral: ${harmful} harmful action${harmful === 1 ? "" : "s"}`, -25 * harmful],
      [`Postmortem (${Math.round(pm * 100)}%${how === "self" ? ", self-graded" : ""})`, Math.round(40 * pm)],
    ];
    const xp = Math.max(50, parts.reduce((s, [, v]) => s + v, 0));
    await store.resolveIncident(inc.id, xp, { ttm, rootOk, evidence: keyCats.size, harmful, pm });
    if (rootOk) await store.recordTransfer(inc.exercises);
    setScore({ pm, how, gap, xp, parts });
    sfx.recovery();
    onScored();
  };

  const submit = async () => {
    setGrading(true);
    const status = await aiStatus();
    if (status?.enabled) {
      const g = await gradeExplanation({
        concept: `${inc.code} ${inc.title} postmortem`,
        prompt: "Write a three-line postmortem: what happened and what stopped it, the root cause, and how to prevent it.",
        rubric: inc.postmortem.rubric,
        exemplar: inc.postmortem.exemplar,
        answer: `What happened: ${lines.what}\nRoot cause: ${lines.cause}\nPrevention: ${lines.prevent}`,
      });
      setGrading(false);
      if (g) return finish(g.score, "claude", g.gap);
    }
    setGrading(false);
    setNeedSelf(true);
  };

  if (score) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 lg:pt-14">
        <div className="eyebrow text-xs text-phos">{inc.code} resolved</div>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink-0 sm:text-5xl">{inc.title}</h1>
        <ul className="mt-8 divide-y divide-line/60 rounded-lg border border-line/80 bg-bg-1/75 shadow-card">
          {score.parts.map(([label, v], i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: i * 0.1 }} className="flex items-baseline justify-between gap-4 px-5 py-3">
              <span className="text-[15px] text-ink-1">{label}</span>
              <span className={cx("shrink-0 font-mono text-sm tabular", v > 0 ? "text-phos" : v < 0 ? "text-alert" : "text-ink-3")}>{v > 0 ? `+${v}` : v}</span>
            </motion.li>
          ))}
          <li className="flex items-baseline justify-between gap-4 px-5 py-4">
            <span className="font-semibold text-ink-0">Total</span>
            <Ticker value={score.xp} format={(v) => `+${Math.round(v)} XP`} className="num-display text-3xl font-semibold text-phos" />
          </li>
        </ul>
        {score.gap && (
          <div className="mt-5 rounded-lg border border-amber-3/60 bg-amber-dim/25 p-5">
            <div className="eyebrow text-xs text-amber">Postmortem gap</div>
            <div className="mt-1.5 text-[15px] leading-relaxed text-ink-0">{score.gap}</div>
          </div>
        )}
        <div className="mt-5 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
          <h2 className="font-display text-xl font-semibold text-ink-0">What actually happened</h2>
          <Exemplar text={inc.postmortem.exemplar} className="mt-4" />
        </div>
        <HonestNotes className="mt-5" notes={inc.honestPhysics ?? []} />
        <CastLine className="mt-6" line={{ speaker: "meera", line: rootOk ? "Good. Now go fix the launch template before it does this again." : "Mitigated isn't understood. Read the real cause and come back to this one." }} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/">
            <Button variant="primary" size="lg">
              Back to HQ
            </Button>
          </Link>
          <Link href="/incident">
            <Button variant="secondary" size="lg">
              Incident list
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10 lg:pt-14">
      <div className="eyebrow text-xs text-alert">{inc.code} · postmortem</div>
      <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink-0 sm:text-5xl">Three lines</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-1">Blameless, specific, short. What someone reading this in six months needs.</p>
      <div className="mt-8 flex flex-col gap-5">
        {(
          [
            ["what", "What happened (impact, duration, what stopped it)"],
            ["cause", "Root cause (the mechanism, not the symptom)"],
            ["prevent", "Prevention (what stops this class of incident)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink-1">{label}</span>
            <textarea value={lines[k]} onChange={(e) => setLines((l) => ({ ...l, [k]: e.target.value }))} rows={2} className="rounded-md border border-line-2 bg-bg-2/60 p-3.5 text-[15px] leading-relaxed text-ink-0 outline-none transition-colors focus:border-amber/80" />
          </label>
        ))}
        {!needSelf ? (
          <Button variant="primary" size="lg" disabled={!ready || grading} onClick={submit} className="sm:self-start">
            {grading ? "Grading…" : "File the postmortem"}
          </Button>
        ) : (
          <div className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-6">
            <div className="text-sm text-ink-2">No Claude key: grade yourself against the rubric.</div>
            <Exemplar text={inc.postmortem.exemplar} className="mt-4" />
            <ul className="mt-4 space-y-4">
              {inc.postmortem.rubric.map((r) => (
                <li key={r.id}>
                  <div className="text-sm leading-relaxed text-ink-0">{r.criterion}</div>
                  <div className="mt-2 flex gap-1.5">
                    {(["met", "partial", "missed"] as const).map((v) => (
                      <button key={v} onClick={() => setSelf((s) => ({ ...s, [r.id]: v }))} className={cx("h-9 flex-1 rounded-full border text-[13px] font-medium capitalize transition-colors", self[r.id] === v ? "border-amber/70 bg-amber-dim/60 text-amber" : "border-line-2/80 text-ink-2 hover:border-line-3 hover:text-ink-1")}>
                        {v}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <Button
              className="mt-5"
              variant="primary"
              disabled={Object.keys(self).length < inc.postmortem.rubric.length}
              onClick={() => finish((inc.postmortem.rubric.reduce((s, r) => s + (self[r.id] === "met" ? 1 : self[r.id] === "partial" ? 0.5 : 0), 0) / inc.postmortem.rubric.length) * 0.75, "self")}
            >
              Record my grade
            </Button>
          </div>
        )}
      </div>
      <AnimatePresence />
      <div className="mt-8 text-xs leading-relaxed text-ink-3">
        Failed checkouts during the incident: <span className="font-mono tabular text-ink-2">{failed.toLocaleString()}</span> · time to mitigate:{" "}
        <span className="font-mono tabular text-ink-2">{recovered === null ? "—" : `${Math.round(recovered - inc.pageAt)}s`}</span>
      </div>
    </div>
  );
}
