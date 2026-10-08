"use client";
/**
 * The Daily Shift (10-15 minutes): repairs (FSRS-due reviews, interleaved, unnamed), one micro-challenge,
 * one estimation drill, then the shift report. Never punishing: no guilt copy, freeze tokens bridge gaps.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sfx } from "@/audio/engine";
import { NODE_BY_ID } from "@/content/graph";
import { PACK_BY_ID } from "@/content/packs";
import type { ReviewItem } from "@/content/schema";
import { gameNow } from "@/game/clock";
import { db } from "@/game/db";
import { retrievability } from "@/game/fsrs";
import { gradeReview, REVIEW_XP, scoreEstimate } from "@/game/scoring";
import { dueConcepts, istDay, useGame } from "@/game/store";
import { ReviewCard, parseNumber, type ReviewOutcome } from "@/review/ReviewCard";
import { CastLine } from "@/ui/Cast";
import { Button, Chip, cx, fmtPct, LinkButton } from "@/ui/kit";
import { spring, Ticker } from "@/ui/motion";
import { problemFor, scaffoldLevel, type EstProblem } from "./estimation";
import { useIntro } from "@/intro/useIntro";
import { SECTION_INTROS } from "@/intro/specs";
import { SectionHeader } from "@/ui/SectionLabel";
import { BriefingButton } from "@/briefing/BriefingButton";

const MAX_REVIEWS = 8;

type Task =
  | { kind: "review"; conceptId: string; item: ReviewItem; askWhy: boolean; rBefore: number }
  | { kind: "micro"; conceptId: string; item: ReviewItem }
  | { kind: "estimate"; problem: EstProblem; level: 0 | 1 | 2 };

interface Done {
  task: Task;
  xp: number;
  label: string;
  ok: boolean;
  /** Days until this concept is due again. */
  nextInDays?: number;
}

function pickItem(conceptId: string, recent: string[], exclude: ReviewItem["format"][] = ["tune"]): ReviewItem | null {
  const pack = PACK_BY_ID.get(conceptId);
  if (!pack) return null;
  const pool = pack.reviews.filter((r) => !exclude.includes(r.format));
  const fresh = pool.filter((r) => !recent.includes(r.id));
  const lastFormat = pack.reviews.find((r) => r.id === recent[0])?.format;
  const varied = fresh.filter((r) => r.format !== lastFormat);
  const from = varied.length ? varied : fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)] ?? null;
}

export function Shift() {
  const intro = useIntro(SECTION_INTROS.shift);
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const store = useGame();
  const params = useSearchParams();
  const focus = params.get("focus");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [i, setI] = useState(-1); // -1 = briefing
  const [done, setDone] = useState<Done[]>([]);
  const [report, setReport] = useState<{ streak: number; froze: number; tokenEarned: boolean } | null>(null);
  const built = Object.values(concepts).filter((c) => c.builtAt);

  // Build the shift once state is hydrated.
  useEffect(() => {
    if (!hydrated || tasks) return;
    (async () => {
      const now = gameNow();
      let due = dueConcepts(concepts, now).map((d) => d.id);
      if (focus && concepts[focus]?.builtAt) due = [focus, ...due.filter((d) => d !== focus)];
      // Nothing due: a little practice on the weakest built concept keeps the shift worth doing.
      if (!due.length && built.length) due = built.map((c) => ({ id: c.id, r: retrievability(c.card, now) })).sort((a, b) => a.r - b.r).slice(0, 2).map((x) => x.id);
      const list: Task[] = [];
      for (const id of due.slice(0, MAX_REVIEWS)) {
        const item = pickItem(id, concepts[id]?.recentReviewIds ?? []);
        if (item) list.push({ kind: "review", conceptId: id, item, askWhy: !!item.why && Math.random() < 0.4, rBefore: retrievability(concepts[id]?.card, now) });
      }
      // Interleave: avoid two in a row from the same chapter when possible.
      list.sort(() => Math.random() - 0.5);
      const tuneable = built.map((c) => ({ id: c.id, t: PACK_BY_ID.get(c.id)?.reviews.filter((r) => r.format === "tune") ?? [] })).filter((x) => x.t.length);
      if (tuneable.length) {
        const pick = tuneable[Math.floor(Math.random() * tuneable.length)]!;
        list.push({ kind: "micro", conceptId: pick.id, item: pick.t[Math.floor(Math.random() * pick.t.length)]! });
      }
      let drills = 0;
      try {
        drills = await db().events.where("type").equals("estimate").count();
      } catch {
        /* ignore */
      }
      list.push({ kind: "estimate", problem: problemFor(istDay(), drills), level: scaffoldLevel(drills) });
      setTasks(list);
    })();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishReview = async (t: Extract<Task, { kind: "review" | "micro" }>, o: ReviewOutcome) => {
    const grade = gradeReview({ correct: o.correct, partial: o.partial, confidence: o.confidence, seconds: o.seconds, format: t.item.format, whyCorrect: o.whyCorrect });
    const xp = (t.kind === "micro" ? (o.correct ? 20 : o.partial ? 10 : 0) : REVIEW_XP[grade] ?? 0) + (o.whyCorrect ? 5 : 0);
    await store.recordReview({ conceptId: t.conceptId, reviewId: t.item.id, format: t.item.format, grade, xp, seconds: o.seconds, whyCorrect: o.whyCorrect });
    const c = useGame.getState().concepts[t.conceptId];
    const nextInDays = c?.card ? Math.max(0, (new Date(c.card.due).getTime() - gameNow().getTime()) / 86_400_000) : undefined;
    const title = NODE_BY_ID.get(t.conceptId)?.title ?? t.conceptId;
    setDone((d) => [...d, { task: t, xp, ok: o.correct, label: t.kind === "micro" ? `Micro-challenge: ${title}` : title, nextInDays }]);
    next();
  };

  const finishEstimate = async (t: Extract<Task, { kind: "estimate" }>, xp: number, ok: boolean) => {
    await store.log("estimate", xp, { id: t.problem.id, level: t.level });
    setDone((d) => [...d, { task: t, xp, ok, label: `Estimate: ${t.problem.topic}` }]);
    next();
  };

  const next = () => {
    sfx.whoosh();
    setI((k) => k + 1);
  };

  useEffect(() => {
    if (tasks && i === tasks.length && !report) {
      (async () => {
        const r = await store.completeShift(0, { tasks: tasks.length, xp: done.reduce((s, d) => s + d.xp, 0) });
        setReport(r);
        sfx.recovery();
      })();
    }
  }, [i, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated || !tasks) return <div className="grid min-h-dvh place-items-center text-sm text-ink-3">Clocking in…</div>;

  const reviews = tasks.filter((t) => t.kind === "review").length;
  const task = tasks[i];

  return (
    <div className="flex min-h-dvh flex-col">
      {intro.node}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-line/60 bg-bg-0/85 px-4 backdrop-blur lg:px-8">
        <Link href="/" className="shrink-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-amber">
          ← HQ
        </Link>
        <span className="truncate font-display text-lg font-semibold text-ink-0">Daily Shift</span>
        <BriefingButton className="ml-auto" />
        <div className="flex shrink-0 items-center gap-1.5 sm:ml-2" role="img" aria-label={`Task ${Math.max(0, i) + 1} of ${tasks.length}`}>
          {tasks.map((t, k) => (
            <span
              key={k}
              className={cx(
                "h-1.5 w-3.5 rounded-full transition-colors duration-500 sm:w-5",
                k < i ? (done[k]?.ok ? "bg-phos/80" : "bg-amber/70") : k === i ? "bg-ink-1" : t.kind === "estimate" ? "bg-amber-3/70" : "bg-line-2",
              )}
            />
          ))}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-8 sm:pt-12">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={spring.soft}>
            {i === -1 && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="eyebrow text-xs text-amber">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</div>
                  <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink-0 sm:text-5xl">Clocking in</h1>
                </div>
                <SectionHeader id="daily-shift" />
                <CastLine
                  line={{
                    speaker: "meera",
                    line: built.length === 0 ? "No services in rotation yet, so today it's arithmetic. Then go build something." : reviews ? `${reviews} service${reviews > 1 ? "s" : ""} flickering. Coffee's cold. Let's go.` : "Nothing's on fire. We'll poke the weakest thing anyway.",
                  }}
                />
                <ul className="divide-y divide-line/60 rounded-lg border border-line/80 bg-bg-1/75 text-[15px] text-ink-0 shadow-card">
                  {reviews > 0 && (
                    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-5 py-3.5">
                      <span>
                        <span className="tabular">{reviews}</span> repair{reviews > 1 ? "s" : ""}
                      </span>
                      <span className="text-[13px] text-ink-2">(unnamed until you answer)</span>
                    </li>
                  )}
                  {tasks.some((t) => t.kind === "micro") && (
                    <li className="px-5 py-3.5">
                      <span className="tabular">1</span> micro-challenge
                    </li>
                  )}
                  <li className="px-5 py-3.5">
                    <span className="tabular">1</span> estimation drill
                  </li>
                </ul>
                <Button variant="primary" size="lg" onClick={next} className="sm:min-w-44 sm:self-start">
                  Start
                </Button>
              </div>
            )}
            {task?.kind === "review" && <ReviewCard item={task.item} conceptTitle={NODE_BY_ID.get(task.conceptId)?.title ?? ""} askWhy={task.askWhy} onDone={(o) => finishReview(task, o)} />}
            {task?.kind === "micro" && (
              <div className="flex flex-col gap-3">
                <Chip tone="warn" className="self-start">
                  Micro-challenge
                </Chip>
                <ReviewCard item={task.item} conceptTitle={NODE_BY_ID.get(task.conceptId)?.title ?? ""} askWhy={false} onDone={(o) => finishReview(task, o)} />
              </div>
            )}
            {task?.kind === "estimate" && <Estimathon task={task} onDone={(xp, ok) => finishEstimate(task, xp, ok)} />}
            {tasks && i >= tasks.length && <ShiftReport done={done} report={report} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Estimathon({ task, onDone }: { task: Extract<Task, { kind: "estimate" }>; onDone: (xp: number, ok: boolean) => void }) {
  const p = task.problem;
  const [text, setText] = useState("");
  const [res, setRes] = useState<ReturnType<typeof scoreEstimate> | null>(null);
  const [left, setLeft] = useState(90);
  const tRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tRef.current = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => {
      if (tRef.current) clearInterval(tRef.current);
    };
  }, []);
  const shown = task.level === 0 ? p.steps.slice(0, -1) : task.level === 1 ? p.steps.slice(0, 1) : [];
  const submit = () => {
    const g = parseNumber(text);
    if (g === null) return;
    if (tRef.current) clearInterval(tRef.current);
    const r = scoreEstimate(g, p.answer, p.acceptFactor);
    setRes(r);
    sfx.reveal(r.grade === "exact" || r.grade === "close" ? 0 : r.grade === "ballpark" ? 0.3 : 0.6);
  };
  const bonus = res && left > 30 && (res.grade === "exact" || res.grade === "close") ? 5 : 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <Chip tone="warn">Estimathon · {task.level === 0 ? "worked" : task.level === 1 ? "faded" : "solo"}</Chip>
          <span className={cx("font-mono text-sm tabular transition-colors duration-500", left < 20 ? "text-amber" : "text-ink-2")}>{left}s</span>
        </div>
        <p className="text-[17px] leading-relaxed text-ink-0">{p.prompt}</p>
        {shown.length > 0 && !res && (
          <ol className="space-y-2 rounded-md bg-bg-2/60 px-4 py-3.5 text-sm leading-relaxed text-ink-1">
            {shown.map((s, k) => (
              <li key={k} className="flex gap-2.5">
                <span className="tabular text-ink-3">{k + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
            <li className="flex gap-2.5 text-amber">
              <span className="tabular">{shown.length + 1}.</span>
              <span>your turn…</span>
            </li>
          </ol>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          value={text}
          disabled={!!res}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label={`Your estimate in ${p.unit}`}
          placeholder="e.g. 3.5k"
          className="h-12 w-44 rounded-sm border border-line-2 bg-bg-2/70 px-4 font-mono text-xl tabular text-amber outline-none transition-colors placeholder:text-ink-3 focus:border-amber/80 disabled:opacity-70"
        />
        <span className="text-[15px] text-ink-1">{p.unit}</span>
      </div>
      {!res ? (
        <Button variant="primary" size="lg" disabled={parseNumber(text) === null} onClick={submit} className="sm:min-w-44 sm:self-start">
          Commit
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={cx("rounded-lg border p-5", res.grade === "exact" || res.grade === "close" ? "border-phos-3/60 bg-phos-dim/25" : res.grade === "ballpark" ? "border-amber-3/60 bg-amber-dim/25" : "border-alert-3/60 bg-alert-dim/25")}>
            <div className={cx("font-display text-2xl font-semibold", res.grade === "exact" || res.grade === "close" ? "text-phos" : res.grade === "ballpark" ? "text-amber" : "text-alert")}>{res.grade === "exact" ? "Dead on" : res.grade === "close" ? "Right order of magnitude" : res.grade === "ballpark" ? "Ballpark" : "Off by 10× or more"}</div>
            <div className="mt-1.5 text-sm text-ink-1">
              Answer ≈{" "}
              <span className="font-mono tabular text-ink-0">
                {+p.answer.toPrecision(3)} {p.unit}
              </span>
            </div>
            <ol className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
              {p.steps.map((s, k) => (
                <li key={k} className="flex gap-2.5">
                  <span className="tabular text-ink-3">{k + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <Button variant="primary" size="lg" onClick={() => onDone(res.xp + bonus, res.grade === "exact" || res.grade === "close")} className="sm:min-w-44 sm:self-start">
            Continue (+{res.xp + bonus} XP)
          </Button>
        </div>
      )}
    </div>
  );
}

function ShiftReport({ done, report }: { done: Done[]; report: { streak: number; froze: number; tokenEarned: boolean } | null }) {
  const total = done.reduce((s, d) => s + d.xp, 0);
  const repairs = done.filter((d) => d.task.kind === "review");
  const fixed = useMemo(() => repairs.filter((d) => d.ok).length, [repairs]);
  return (
    <div className="flex flex-col gap-7">
      <div>
        <div className="eyebrow text-xs text-phos">Shift complete</div>
        <h1 className="num-display mt-2 text-5xl font-semibold leading-none text-ink-0 sm:text-6xl">
          <Ticker value={total} format={(v) => `+${Math.round(v)} XP`} />
        </h1>
      </div>
      {repairs.length > 0 && (
        <div>
          <div className="mb-2.5 eyebrow text-xs text-ink-2">
            Repairs · <span className="tabular">{fixed}/{repairs.length}</span> clean
          </div>
          <ul className="divide-y divide-line/60 rounded-lg border border-line/80 bg-bg-1/75 shadow-card">
            {repairs.map((d, k) => {
              const t = d.task as Extract<Task, { kind: "review" }>;
              return (
                <li key={k} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="text-[15px] text-ink-0">{d.label}</span>
                  <span className="shrink-0 text-[13px] text-ink-2">
                    recall was <span className="tabular">{fmtPct(t.rBefore, 0)}</span> · <span className={d.ok ? "text-phos" : "text-amber"}>{d.ok ? "repaired" : "patched"}</span> · next check {d.nextInDays === undefined ? "—" : d.nextInDays < 1 ? "tomorrow" : `in ${Math.round(d.nextInDays)}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {done.some((d) => d.task.kind !== "review") && (
        <ul className="divide-y divide-line/60 rounded-lg border border-line/80 bg-bg-1/75 shadow-card">
          {done
            .filter((d) => d.task.kind !== "review")
            .map((d, k) => (
              <li key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-[15px] text-ink-1">{d.label}</span>
                <span className="font-mono text-sm tabular text-phos">+{d.xp}</span>
              </li>
            ))}
        </ul>
      )}
      {report && (
        <div className="rounded-lg border border-line/60 bg-bg-2/40 px-5 py-4 text-[15px] leading-relaxed text-ink-1">
          Streak: <span className="tabular font-semibold text-ink-0">{report.streak}</span> day{report.streak === 1 ? "" : "s"}
          {report.froze > 0 && <span className="text-amber"> · a freeze token covered {report.froze} missed day{report.froze > 1 ? "s" : ""}</span>}
          {report.tokenEarned && <span className="text-phos"> · earned a freeze token</span>}
        </div>
      )}
      <CastLine line={{ speaker: "meera", line: repairs.length ? "Lights are back on. Same time tomorrow, roughly." : "Good. Now go build something worth repairing." }} />
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/" variant="primary" size="lg">
            Back to HQ
          </LinkButton>
        {repairs.length === 0 && (
          <LinkButton href="/campaign/a1" variant="secondary" size="lg">
              Campaign
            </LinkButton>
        )}
      </div>
    </div>
  );
}
