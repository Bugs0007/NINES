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
import { askSre, claudeStatus, gradeExplanation } from "@/claude/client";
import type { WindowMetrics } from "@/engine/types";
import { useSim } from "@/engine/useSim";
import { useGame } from "@/game/store";
import { useMusic } from "@/audio/useMusic";
import { CastLine } from "@/ui/Cast";
import { Cinematic } from "@/ui/Cinematic";
import { Button, Chip, cx, fmtLatency, fmtPct, Led, Segmented } from "@/ui/kit";
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

  const ask = async () => {
    const level = Math.min(3, hints.length + 1);
    const status = await claudeStatus();
    let h: string | null = null;
    if (status?.enabled) {
      h = await askSre({
        mission: `${inc.code} ${inc.title}`,
        goal: "Find the root cause from evidence and mitigate the incident.",
        situation: `Page: ${inc.page.title}. Pinned evidence: ${pins.map((p) => p.text.slice(0, 80)).join(" | ") || "none"}. Actions taken: ${applied.map((a) => a.id).join(", ") || "none"}.`,
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
      <header className={cx("sticky top-0 z-40 flex h-12 items-center gap-3 border-b px-3 backdrop-blur lg:px-4", burning ? "border-alert-3 bg-alert-dim/80" : "border-line bg-bg-0/90")}>
        <Link href="/incident" className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber">
          ←
        </Link>
        <Chip tone={recovered !== null ? "ok" : "alert"} className="shrink-0 whitespace-nowrap">{inc.severity}</Chip>
        <span className="truncate font-display text-lg font-extrabold uppercase text-ink-0">
          {inc.code} · {inc.title}
        </span>
        <span className="ml-auto hidden font-mono text-2xs text-ink-1 sm:inline">
          {clockAt(sim.t, inc.clock0)} IST · page +{Math.floor(sincePage / 60)}m{String(Math.floor(sincePage % 60)).padStart(2, "0")}s
        </span>
        <Segmented size="sm" label="Speed" value={speed} onChange={setSpeed} options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }, { value: 4, label: "4×" }]} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-4">
        <div className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-88px)]">
          <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="War room tools">
            {(
              [
                ["dash", "Dashboards"],
                ["logs", "Logs"],
                ["hosts", "Hosts"],
                ["traces", "Traces"],
                ["timeline", "Timeline"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("h-9 shrink-0 rounded-[2px] border px-3 font-mono text-2xs uppercase tracking-[0.1em]", tab === id ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1 hover:border-line-3")}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "dash" && <Dashboards inc={inc} sim={sim} pins={pins} pin={pin} />}
            {tab === "logs" && <Logs lines={logs} pins={pins} pin={pin} clock0={inc.clock0} />}
            {tab === "hosts" && <Hosts inc={inc} state={state} pins={pins} pin={pin} />}
            {tab === "traces" && <Traces traces={inc.traces} pins={pins} pin={pin} />}
            {tab === "timeline" && <Timeline inc={inc} feed={feed} />}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-3 rounded-sm border border-line bg-bg-1/80 p-3 lg:h-[calc(100dvh-88px)] lg:overflow-y-auto">
          <Status last={last} failed={failedSincePage} recovered={recovered} inc={inc} />
          <section>
            <div className="mb-1 flex items-center justify-between font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">
              <span>Evidence board</span>
              <span>{pins.length}</span>
            </div>
            {pins.length === 0 ? (
              <p className="text-xs text-ink-3">Pin log lines, command output, dashboard rows, or traces that support your theory.</p>
            ) : (
              <ul className="space-y-1">
                {pins.map((p) => (
                  <li key={p.key} className="group rounded-sm border border-line-2 bg-bg-2 p-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-ink-1">{p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text}</pre>
                      <button onClick={() => pin(p)} className="font-mono text-[10px] text-ink-3 hover:text-alert" aria-label="Unpin">
                        ✕
                      </button>
                    </div>
                    <div className="font-mono text-[9px] text-ink-3">{p.where}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-1 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">Hypothesis</div>
            <div className="flex flex-col gap-1">
              {inc.hypotheses.map((h) => (
                <button key={h.id} onClick={() => setHyp(h.id)} aria-pressed={hyp === h.id} className={cx("rounded-sm border px-2 py-1.5 text-left text-xs", hyp === h.id ? "border-amber bg-amber-dim/50 text-ink-0" : "border-line-2 text-ink-1 hover:border-line-3")}>
                  {h.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-1 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">Actions</div>
            <div className="flex flex-col gap-1">
              {inc.mitigations.map((m) => {
                const done = applied.some((a) => a.id === m.id);
                return (
                  <div key={m.id}>
                    <button
                      disabled={done}
                      onClick={() => (confirm === m.id ? apply(m.id) : setConfirm(m.id))}
                      className={cx("w-full rounded-sm border px-2 py-1.5 text-left text-xs", done ? "border-line text-ink-3" : confirm === m.id ? "border-alert bg-alert-dim/60 text-ink-0" : "border-line-2 text-ink-1 hover:border-line-3")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{m.label}</span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-3">{done ? "done" : confirm === m.id ? "tap to confirm" : `~${m.takesS}s`}</span>
                      </div>
                      {confirm === m.id && <div className="mt-0.5 text-[11px] text-ink-2">{m.detail}</div>}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-sm border border-line p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">Ask the SRE</span>
              <Button size="sm" variant="ghost" onClick={ask} disabled={hints.length >= 3}>
                {hints.length ? "Narrower" : "Nudge me"}
              </Button>
            </div>
            {hints.map((h, i) => (
              <CastLine key={i} line={{ speaker: "meera", line: h }} compact typewriter={i === hints.length - 1} className="mt-1" />
            ))}
          </section>
          <Button variant={recovered !== null ? "go" : "secondary"} size="lg" disabled={recovered === null || !hyp} onClick={() => setPhase("postmortem")}>
            {recovered === null ? "Recover checkout first" : !hyp ? "Pick a hypothesis" : "Resolve and write the postmortem"}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Status({ last, failed, recovered, inc }: { last?: WindowMetrics; failed: number; recovered: number | null; inc: Incident }) {
  return (
    <section className={cx("rounded-sm border p-2.5", recovered !== null ? "border-phos-3 bg-phos-dim/30" : "border-alert-3 bg-alert-dim/40")}>
      <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.14em]">
        <Led tone={recovered !== null ? "ok" : "alert"} blink={recovered === null} />
        <span className={recovered !== null ? "text-phos" : "text-alert"}>{recovered !== null ? `recovered at ${clockAt(recovered, inc.clock0)}` : "burning"}</span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-2xs text-ink-2">
        <div>
          errors<span className={cx("block text-base tabular", (last?.errorRate ?? 0) > inc.slo.errorRate ? "text-alert" : "text-phos")}>{last ? fmtPct(last.errorRate, 1) : "—"}</span>
        </div>
        <div>
          p99<span className="block text-base tabular text-ink-0">{last?.ok ? fmtLatency(last.p99) : "—"}</span>
        </div>
        <div>
          failed since page<span className="block text-base tabular text-ink-0">{failed.toLocaleString()}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- postmortem + score

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
    const status = await claudeStatus();
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
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="font-mono text-2xs uppercase tracking-[0.3em] text-phos">{inc.code} resolved</div>
        <h1 className="font-display text-6xl font-extrabold uppercase leading-none text-ink-0">{inc.title}</h1>
        <ul className="mt-6 space-y-1.5">
          {score.parts.map(([label, v], i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: i * 0.1 }} className="flex justify-between border-b border-line pb-1.5 font-mono text-sm">
              <span className="text-ink-1">{label}</span>
              <span className={cx("tabular", v > 0 ? "text-phos" : v < 0 ? "text-alert" : "text-ink-3")}>{v > 0 ? `+${v}` : v}</span>
            </motion.li>
          ))}
          <li className="flex justify-between pt-1 font-mono">
            <span className="text-ink-0">Total</span>
            <Ticker value={score.xp} format={(v) => `+${Math.round(v)} XP`} className="tabular text-phos glow-phos" />
          </li>
        </ul>
        {score.gap && (
          <div className="mt-4 rounded-sm border border-amber-3 bg-amber-dim/30 p-3 text-sm">
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-amber">Postmortem gap</span>
            <div className="text-ink-0">{score.gap}</div>
          </div>
        )}
        <div className="mt-4 rounded-sm border border-line p-3">
          <div className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">What actually happened</div>
          <p className="mt-1 text-sm text-ink-0">{inc.postmortem.exemplar}</p>
        </div>
        <HonestNotes className="mt-4" notes={inc.honestPhysics ?? []} />
        <CastLine className="mt-4" line={{ speaker: "meera", line: rootOk ? "Good. Now go fix the launch template before it does this again." : "Mitigated isn't understood. Read the real cause and come back to this one." }} />
        <div className="mt-6 flex gap-2">
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="font-mono text-2xs uppercase tracking-[0.3em] text-amber">{inc.code} · postmortem</div>
      <h1 className="font-display text-5xl font-extrabold uppercase leading-none text-ink-0">Three lines</h1>
      <p className="mt-2 text-sm text-ink-1">Blameless, specific, short. What someone reading this in six months needs.</p>
      <div className="mt-5 flex flex-col gap-3">
        {(
          [
            ["what", "What happened (impact, duration, what stopped it)"],
            ["cause", "Root cause (the mechanism, not the symptom)"],
            ["prevent", "Prevention (what stops this class of incident)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">{label}</span>
            <textarea value={lines[k]} onChange={(e) => setLines((l) => ({ ...l, [k]: e.target.value }))} rows={2} className="rounded-sm border border-line-2 bg-bg-0 p-2.5 text-sm text-ink-0 outline-none focus:border-amber" />
          </label>
        ))}
        {!needSelf ? (
          <Button variant="primary" size="lg" disabled={!ready || grading} onClick={submit}>
            {grading ? "Grading…" : "File the postmortem"}
          </Button>
        ) : (
          <div className="rounded-sm border border-line-2 p-3">
            <div className="text-sm text-ink-1">No Claude key: grade yourself against the rubric.</div>
            <p className="mt-1 text-sm text-ink-0">{inc.postmortem.exemplar}</p>
            <ul className="mt-2 space-y-2">
              {inc.postmortem.rubric.map((r) => (
                <li key={r.id}>
                  <div className="text-sm text-ink-0">{r.criterion}</div>
                  <div className="mt-1 flex gap-1">
                    {(["met", "partial", "missed"] as const).map((v) => (
                      <button key={v} onClick={() => setSelf((s) => ({ ...s, [r.id]: v }))} className={cx("h-8 flex-1 rounded-[2px] border font-mono text-2xs uppercase", self[r.id] === v ? "border-amber text-amber" : "border-line-2 text-ink-2")}>
                        {v}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <Button
              className="mt-3"
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
      <div className="mt-6 font-mono text-[10px] text-ink-3">
        failed checkouts during the incident: {failed.toLocaleString()} · time to mitigate: {recovered === null ? "—" : `${Math.round(recovered - inc.pageAt)}s`}
      </div>
    </div>
  );
}
