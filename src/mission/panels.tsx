"use client";
/**
 * Mission rail panels: mechanism captions, challenge brief + Ask the SRE, explain-it-back.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { askSre, aiStatus, gradeExplanation } from "@/ai/client";
import type { GradeResult } from "@/ai/schemas";
import type { Caption, Challenge, Deeper, ExplainBack, Source } from "@/content/schema";
import { sfx } from "@/audio/engine";
import { CastLine } from "@/ui/Cast";
import { Button, Chip, cx } from "@/ui/kit";
import { spring, useReducedMotion } from "@/ui/motion";
import { evalCond, formatMetric } from "@/widgets/shared";
import type { ChallengeVerdict } from "@/widgets/types";

// ---------------------------------------------------------------- mechanism

export function MechanismPanel({
  captions,
  index,
  onIndex,
  onDone,
  sources,
  onDeeper,
}: {
  captions: Caption[];
  index: number;
  onIndex: (i: number) => void;
  onDone: () => void;
  sources: Source[];
  onDeeper: () => void;
}) {
  const c = captions[index]!;
  const last = index === captions.length - 1;
  const cited = (c.sourceIds ?? []).map((id) => sources.find((s) => s.id === id)).filter(Boolean) as Source[];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow text-xs text-amber">The mechanism</div>
        <div className="flex items-center" aria-label={`Caption ${index + 1} of ${captions.length}`}>
          {captions.map((_, i) => (
            <button key={i} aria-label={`Caption ${i + 1}`} onClick={() => onIndex(i)} className="group grid h-6 place-items-center px-1">
              <span
                className={cx(
                  "block h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-6 bg-amber" : i < index ? "w-1.5 bg-amber-3 group-hover:bg-amber-2" : "w-1.5 bg-line-3 group-hover:bg-ink-3",
                )}
              />
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={c.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring.soft}>
          <p className="text-[17px] leading-[1.7] text-ink-0">{c.text}</p>
          {cited.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {cited.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full truncate rounded-full border border-line-2/70 px-2.5 py-0.5 text-xs text-ink-2 transition-colors hover:border-amber-3 hover:text-amber"
                >
                  Source: {s.title}
                </a>
              ))}
            </div>
          )}
          {c.derived && <div className="mt-3 text-xs italic text-ink-3">Numbers computed from the figures above</div>}
        </motion.div>
      </AnimatePresence>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-5">
        <Button variant="ghost" size="sm" onClick={onDeeper}>
          Go deeper
        </Button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="secondary" onClick={() => onIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button variant="primary" onClick={() => (last ? onDone() : onIndex(index + 1))}>
            {last ? "To the challenge" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- go deeper

export function DeeperSheet({ open, onClose, deeper, honest, sources, interview }: { open: boolean; onClose: () => void; deeper: Deeper[]; honest: string[]; sources: Source[]; interview: string[] }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex justify-end bg-bg-0/65 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Go deeper"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-line-2/70 bg-bg-1 px-5 py-6 shadow-lift sm:rounded-l-xl sm:px-8 sm:py-8"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-3xl font-semibold text-ink-0">Go deeper</h2>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
            <div className="mt-6 space-y-8">
              {deeper.map((d, i) => (
                <section key={i}>
                  <h3 className="font-display text-lg font-semibold text-ink-0">{d.title}</h3>
                  <RichText text={d.body} className="mt-2" />
                </section>
              ))}
              {interview.length > 0 && (
                <section>
                  <h3 className="font-display text-lg font-semibold text-ink-0">In the interview</h3>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-1 marker:text-ink-3">
                    {interview.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {honest.length > 0 && (
                <section>
                  <h3 className="font-display text-lg font-semibold text-ink-0">Honest physics</h3>
                  <ul className="mt-2 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-1 marker:text-ink-3">
                    {honest.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="border-t border-line/60 pt-6">
                <h3 className="eyebrow text-xs text-ink-2">Sources</h3>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
                  {sources.map((s) => (
                    <li key={s.id}>
                      <a className="text-ink-1 underline decoration-line-3 underline-offset-2 hover:text-amber" href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                      {s.note && <span className="text-ink-3"> · {s.note}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Tiny formatter: paragraphs, `code`, and lines starting with "$ " or "    " as math/code blocks. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className={cx("space-y-2 text-[15px] leading-relaxed text-ink-1", className)}>
      {blocks.map((b, i) =>
        b.startsWith("    ") || b.startsWith("$$") ? (
          <pre key={i} className="overflow-x-auto rounded-md border border-line/70 bg-bg-0/70 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-0">
            {b.replace(/^\$\$|\$\$$/g, "").replace(/^ {4}/gm, "")}
          </pre>
        ) : (
          <p key={i}>
            {b.split(/(`[^`]+`)/).map((part, j) =>
              part.startsWith("`") ? (
                <code key={j} className="rounded-xs bg-bg-3/80 px-1.5 py-px font-mono text-[0.88em] text-ink-0">
                  {part.slice(1, -1)}
                </code>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- challenge

export function ChallengePanel({
  challenge,
  missionTitle,
  verdict,
  attempts,
  onHintUsed,
  situation,
  children,
}: {
  challenge: Challenge;
  missionTitle: string;
  verdict: ChallengeVerdict | null;
  attempts: number;
  onHintUsed: (n: number) => void;
  situation: string;
  /** The runner's own block (forecast, Collect, retry): sits right under the verdict, above Ask the SRE. */
  children?: ReactNode;
}) {
  const [hints, setHints] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const reduced = useReducedMotion();
  const outcome = useRef<HTMLDivElement>(null);
  // On desktop the rail scrolls on its own: bring the verdict and what follows it into view when a run ends.
  useEffect(() => {
    if (!verdict || typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
    const t = setTimeout(() => outcome.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }), 120);
    return () => clearTimeout(t);
  }, [verdict, reduced]);
  // Live-traffic challenges hold (or break) an SLO; design-and-ship ones (prompts, policies) just pass or don't.
  const live = challenge.conditions.some((c) => ["p99", "errorRate", "sessionLoss"].includes(c.metric));
  const ask = async () => {
    setAsking(true);
    const level = Math.min(3, hints.length + 1);
    const status = await aiStatus();
    let h: string | null = null;
    if (status?.enabled) {
      h = await askSre({
        mission: missionTitle,
        goal: `${challenge.brief} Win conditions: ${challenge.conditions.map((c) => c.label).join("; ")}.`,
        situation,
        previous: hints,
        level,
      });
    }
    h ??= challenge.hints[Math.min(hints.length, challenge.hints.length - 1)]!;
    const next = [...hints, h];
    setHints(next);
    onHintUsed(next.length);
    setAsking(false);
    sfx.select();
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow text-xs text-amber">
          Challenge{attempts > 0 ? <span className="tabular"> · attempt {attempts + 1}</span> : ""}
        </div>
        <h2 className="mt-2 text-balance font-display text-[1.75rem] font-semibold leading-tight text-ink-0">{challenge.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-1">{challenge.brief}</p>
      </div>
      {challenge.line && <CastLine line={challenge.line} compact />}
      <div className="rounded-md border border-line/70 bg-bg-2/40 p-4">
        <div className="mb-2.5 eyebrow text-xs text-ink-2">To win</div>
        <ul className="space-y-2">
          {challenge.conditions.map((c, i) => {
            const v = verdict?.metrics[c.metric];
            const failed = verdict && verdict.failed.includes(c);
            return (
              <li key={i} className="flex items-start justify-between gap-3 text-sm leading-snug">
                <span className={cx("flex min-w-0 gap-2", verdict ? (failed ? "text-alert" : "text-phos") : "text-ink-0")}>
                  <span aria-hidden className={cx("w-3.5 shrink-0 text-center", !verdict && "text-ink-3")}>
                    {verdict ? (failed ? "✗" : "✓") : "·"}
                  </span>
                  <span>{c.label}</span>
                </span>
                {v !== undefined && <span className="shrink-0 font-mono text-xs tabular text-ink-2">{formatMetric(c.metric, v)}</span>}
              </li>
            );
          })}
        </ul>
        {challenge.stars.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
            {challenge.stars.map((s, i) => {
              const v = verdict?.metrics[s.metric];
              const got = verdict?.won && v !== undefined && evalCond(v, s.op, s.value);
              return (
                <div key={i} className={cx("flex items-start gap-2 text-[13px] leading-snug", got ? "text-amber" : "text-ink-2")}>
                  <span aria-hidden className={cx("w-3.5 shrink-0 text-center", got ? "text-amber" : "text-ink-3")}>
                    {got ? "★" : "☆"}
                  </span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div ref={outcome} className="flex scroll-mb-2 flex-col gap-5 empty:hidden">
        <AnimatePresence>
          {verdict && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
              className={cx("rounded-md border p-4", verdict.won ? "border-phos-3/60 bg-phos-dim/40" : "border-alert-3/60 bg-alert-dim/40")}
            >
              <div className={cx("font-display text-2xl font-semibold", verdict.won ? "text-phos" : "text-alert")}>{verdict.won ? (live ? "SLO held." : "Shipped.") : live ? "Outage." : "Not yet."}</div>
              <div className="mt-1 text-sm leading-relaxed text-ink-1">{verdict.won ? "That's the win. Collect it." : live ? "Replay it slowly and find the first domino, then change one thing." : "Find the condition that failed, then change one thing."}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {children}
      </div>
      <div className="rounded-md border border-line/70 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow text-xs text-ink-2">Ask the SRE</span>
          <Button size="sm" variant="ghost" className="-mr-2" onClick={ask} disabled={asking || hints.length >= 3}>
            {asking ? "…" : hints.length === 0 ? "Nudge me" : hints.length >= 3 ? "No more nudges" : "Narrower"}
          </Button>
        </div>
        {hints.length > 0 && (
          <div className="mt-2 space-y-3">
            {hints.map((h, i) => (
              <CastLine key={i} line={{ speaker: "meera", line: h }} compact typewriter={i === hints.length - 1} />
            ))}
          </div>
        )}
        {hints.length > 0 && <div className="mt-3 text-xs text-ink-3">First nudge free · each narrower one costs 10 XP</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- explain it back

export function ExplainPanel({ concept, eb, required, onDone }: { concept: string; eb: ExplainBack; required: boolean; onDone: (score01: number, graded: "claude" | "self" | "skipped") => void }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"write" | "grading" | "claude" | "self">("write");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [self, setSelf] = useState<Record<string, "met" | "partial" | "missed">>({});
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const submit = async () => {
    setPhase("grading");
    const status = await aiStatus();
    if (status?.enabled) {
      const r = await gradeExplanation({ concept, prompt: eb.prompt, rubric: eb.rubric, exemplar: eb.exemplar, answer: text });
      if (r) {
        setResult(r);
        setPhase("claude");
        sfx.reveal(r.score >= 0.7 ? 0 : 0.4);
        return;
      }
    }
    setPhase("self");
  };

  const selfScore = eb.rubric.length ? eb.rubric.reduce((s, r) => s + (self[r.id] === "met" ? 1 : self[r.id] === "partial" ? 0.5 : 0), 0) / eb.rubric.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow text-xs text-amber">Explain it back</div>
        <p className="mt-2 text-[17px] font-medium leading-relaxed text-ink-0">{eb.prompt}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Two or three sentences, your own words. Pretend it&apos;s the interview.</p>
      </div>
      {phase === "write" || phase === "grading" ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label="Your explanation"
            className="w-full resize-y rounded-md border border-line-2/70 bg-bg-0/60 px-4 py-3 text-[15px] leading-relaxed text-ink-0 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-3 focus:border-amber-3 focus:shadow-[0_0_0_3px_rgb(232_183_125/0.12)]"
            placeholder="Because…"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular text-ink-3">{words} words</span>
            <div className="flex gap-2">
              {!required && (
                <Button variant="ghost" onClick={() => onDone(0, "skipped")}>
                  Skip
                </Button>
              )}
              <Button variant="primary" onClick={submit} disabled={words < 8 || phase === "grading"}>
                {phase === "grading" ? "Grading…" : "Submit"}
              </Button>
            </div>
          </div>
        </>
      ) : phase === "claude" && result ? (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="num-display text-5xl font-semibold text-ink-0">{Math.round(result.score * 100)}%</span>
            <Chip tone="muted">Graded by Claude</Chip>
          </div>
          <ul className="space-y-2.5">
            {eb.rubric.map((r) => {
              const c = result.criteria.find((x) => x.id === r.id);
              return (
                <li key={r.id} className="flex gap-2.5 text-sm leading-snug">
                  <span className={cx("w-3.5 shrink-0 text-center font-semibold", c?.verdict === "met" ? "text-phos" : c?.verdict === "partial" ? "text-amber" : "text-alert")}>
                    {c?.verdict === "met" ? "✓" : c?.verdict === "partial" ? "~" : "✗"}
                  </span>
                  <div className="min-w-0">
                    <span className="text-ink-0">{r.criterion}</span>
                    {c?.note && <div className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.note}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          <CastLine line={{ speaker: "meera", line: result.feedback }} compact />
          {result.gap && (
            <div className="rounded-md border border-amber-3/50 bg-amber-dim/30 p-4 text-sm">
              <span className="eyebrow text-xs text-amber">The gap</span>
              <div className="mt-1 leading-relaxed text-ink-0">{result.gap}</div>
            </div>
          )}
          <Exemplar text={eb.exemplar} />
          <Button variant="primary" onClick={() => onDone(result.score, "claude")}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm leading-relaxed text-ink-1">No Claude key configured, so you grade yourself against the rubric. Be strict: the only person you can fool here is you.</div>
          <Exemplar text={eb.exemplar} />
          <ul className="space-y-4">
            {eb.rubric.map((r) => (
              <li key={r.id}>
                <div className="text-sm leading-snug text-ink-0">{r.criterion}</div>
                <div className="mt-2 flex gap-1.5">
                  {(["met", "partial", "missed"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setSelf((s) => ({ ...s, [r.id]: v }))}
                      className={cx(
                        "h-9 flex-1 rounded-sm border text-[13px] font-medium capitalize transition-colors duration-200",
                        self[r.id] === v
                          ? v === "met"
                            ? "border-phos-3 bg-phos-dim/60 text-phos"
                            : v === "partial"
                              ? "border-amber-3 bg-amber-dim/60 text-amber"
                              : "border-alert-3 bg-alert-dim/60 text-alert"
                          : "border-line-2/70 bg-bg-2/50 text-ink-2 hover:border-line-3 hover:text-ink-1",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <Button variant="primary" disabled={Object.keys(self).length < eb.rubric.length} onClick={() => onDone(selfScore * 0.75, "self")}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

function Exemplar({ text }: { text: string }) {
  return (
    <details className="group rounded-md border border-line/70 bg-bg-2/30 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink-0 [&::-webkit-details-marker]:hidden">
        <span>A strong answer</span>
        <span aria-hidden className="text-ink-3 transition-transform duration-200 group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-ink-1">{text}</p>
    </details>
  );
}
