"use client";
/**
 * Mission rail panels: mechanism captions, challenge brief + Ask the SRE, explain-it-back.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { askSre, aiStatus, gradeExplanation } from "@/ai/client";
import type { GradeResult } from "@/ai/schemas";
import type { Caption, Challenge, Deeper, ExplainBack, Source } from "@/content/schema";
import { sfx } from "@/audio/engine";
import { CastLine } from "@/ui/Cast";
import { Button, Chip, cx } from "@/ui/kit";
import { spring } from "@/ui/motion";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">The mechanism</div>
        <div className="flex gap-1" aria-label={`Caption ${index + 1} of ${captions.length}`}>
          {captions.map((_, i) => (
            <button
              key={i}
              aria-label={`Caption ${i + 1}`}
              onClick={() => onIndex(i)}
              className={cx("h-1.5 w-6 rounded-full transition-colors", i === index ? "bg-amber" : i < index ? "bg-amber-3" : "bg-line-2")}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={c.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={spring.soft}>
          <p className="text-[17px] leading-relaxed text-ink-0">{c.text}</p>
          {cited.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cited.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-ink-2 underline decoration-line-3 underline-offset-2 hover:text-amber">
                  src: {s.title}
                </a>
              ))}
            </div>
          )}
          {c.derived && <div className="mt-2 font-mono text-[10px] text-ink-3">numbers computed from the figures above</div>}
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center justify-between gap-2">
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
        <motion.div className="fixed inset-0 z-50 flex justify-end bg-bg-0/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Go deeper"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-xl overflow-y-auto border-l border-line-2 bg-bg-1 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl font-extrabold uppercase text-ink-0">Go deeper</h2>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
            <div className="mt-4 space-y-5">
              {deeper.map((d, i) => (
                <section key={i}>
                  <h3 className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">{d.title}</h3>
                  <RichText text={d.body} className="mt-1.5" />
                </section>
              ))}
              {interview.length > 0 && (
                <section>
                  <h3 className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">In the interview</h3>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-ink-1">
                    {interview.map((q, i) => (
                      <li key={i}>· {q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {honest.length > 0 && (
                <section>
                  <h3 className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">Honest physics</h3>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-ink-1">
                    {honest.map((q, i) => (
                      <li key={i}>· {q}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h3 className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">Sources</h3>
                <ul className="mt-1.5 space-y-1 text-sm">
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
          <pre key={i} className="overflow-x-auto rounded-sm border border-line bg-bg-0 px-3 py-2 font-mono text-[13px] text-ink-0">
            {b.replace(/^\$\$|\$\$$/g, "").replace(/^ {4}/gm, "")}
          </pre>
        ) : (
          <p key={i}>
            {b.split(/(`[^`]+`)/).map((part, j) =>
              part.startsWith("`") ? (
                <code key={j} className="rounded-[2px] bg-bg-3 px-1 font-mono text-[0.9em] text-ink-0">
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
}: {
  challenge: Challenge;
  missionTitle: string;
  verdict: ChallengeVerdict | null;
  attempts: number;
  onHintUsed: (n: number) => void;
  situation: string;
}) {
  const [hints, setHints] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
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
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">Challenge{attempts > 0 ? ` · attempt ${attempts + 1}` : ""}</div>
        <h2 className="mt-1 font-display text-3xl font-extrabold uppercase leading-none text-ink-0">{challenge.title}</h2>
        <p className="mt-2 text-[15px] leading-snug text-ink-1">{challenge.brief}</p>
      </div>
      {challenge.line && <CastLine line={challenge.line} compact />}
      <div>
        <div className="mb-1 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">To win</div>
        <ul className="space-y-1">
          {challenge.conditions.map((c, i) => {
            const v = verdict?.metrics[c.metric];
            const failed = verdict && verdict.failed.includes(c);
            return (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className={cx(verdict ? (failed ? "text-alert" : "text-phos") : "text-ink-0")}>
                  {verdict ? (failed ? "✗ " : "✓ ") : "· "}
                  {c.label}
                </span>
                {v !== undefined && <span className="font-mono text-xs tabular text-ink-2">{formatMetric(c.metric, v)}</span>}
              </li>
            );
          })}
        </ul>
        {challenge.stars.length > 0 && (
          <div className="mt-2 space-y-1">
            {challenge.stars.map((s, i) => {
              const v = verdict?.metrics[s.metric];
              const got = verdict?.won && v !== undefined && evalCond(v, s.op, s.value);
              return (
                <div key={i} className={cx("flex items-center gap-2 text-xs", got ? "text-amber" : "text-ink-2")}>
                  <span className={got ? "text-amber" : "text-ink-3"}>{got ? "★" : "☆"}</span> {s.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <AnimatePresence>
        {verdict && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cx("rounded-sm border p-3", verdict.won ? "border-phos-3 bg-phos-dim/40" : "border-alert-3 bg-alert-dim/40")}
          >
            <div className={cx("font-display text-2xl font-extrabold uppercase", verdict.won ? "text-phos" : "text-alert")}>{verdict.won ? (live ? "SLO held." : "Shipped.") : live ? "Outage." : "Not yet."}</div>
            <div className="text-sm text-ink-1">{verdict.won ? "That's the win. Collect it." : live ? "Replay it slowly and find the first domino, then change one thing." : "Find the condition that failed, then change one thing."}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="rounded-sm border border-line p-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">Ask the SRE</span>
          <Button size="sm" variant="ghost" onClick={ask} disabled={asking || hints.length >= 3}>
            {asking ? "…" : hints.length === 0 ? "Nudge me" : hints.length >= 3 ? "No more nudges" : "Narrower"}
          </Button>
        </div>
        <div className="mt-1 space-y-2">
          {hints.map((h, i) => (
            <CastLine key={i} line={{ speaker: "meera", line: h }} compact typewriter={i === hints.length - 1} />
          ))}
        </div>
        {hints.length > 0 && <div className="mt-1 font-mono text-[10px] text-ink-3">first nudge free · each narrower one costs 10 XP</div>}
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
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">Explain it back</div>
        <p className="mt-1 text-[17px] leading-snug text-ink-0">{eb.prompt}</p>
        <p className="mt-1 text-xs text-ink-2">Two or three sentences, your own words. Pretend it&apos;s the interview.</p>
      </div>
      {phase === "write" || phase === "grading" ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label="Your explanation"
            className="w-full resize-y rounded-sm border border-line-2 bg-bg-0 p-3 text-[15px] leading-relaxed text-ink-0 outline-none placeholder:text-ink-3 focus:border-amber"
            placeholder="Because…"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xs text-ink-3">{words} words</span>
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
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-4xl font-extrabold text-ink-0">{Math.round(result.score * 100)}%</span>
            <Chip tone="muted">graded by Claude</Chip>
          </div>
          <ul className="space-y-1.5">
            {eb.rubric.map((r) => {
              const c = result.criteria.find((x) => x.id === r.id);
              return (
                <li key={r.id} className="text-sm">
                  <span className={cx("font-mono text-xs", c?.verdict === "met" ? "text-phos" : c?.verdict === "partial" ? "text-amber" : "text-alert")}>
                    {c?.verdict === "met" ? "✓" : c?.verdict === "partial" ? "~" : "✗"}
                  </span>{" "}
                  <span className="text-ink-0">{r.criterion}</span>
                  {c?.note && <div className="pl-4 text-xs text-ink-2">{c.note}</div>}
                </li>
              );
            })}
          </ul>
          <CastLine line={{ speaker: "meera", line: result.feedback }} compact />
          {result.gap && (
            <div className="rounded-sm border border-amber-3 bg-amber-dim/30 p-2.5 text-sm">
              <span className="font-mono text-2xs uppercase tracking-[0.14em] text-amber">The gap</span>
              <div className="text-ink-0">{result.gap}</div>
            </div>
          )}
          <Exemplar text={eb.exemplar} />
          <Button variant="primary" onClick={() => onDone(result.score, "claude")}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-ink-1">No Claude key configured, so you grade yourself against the rubric. Be strict: the only person you can fool here is you.</div>
          <Exemplar text={eb.exemplar} />
          <ul className="space-y-2">
            {eb.rubric.map((r) => (
              <li key={r.id}>
                <div className="text-sm text-ink-0">{r.criterion}</div>
                <div className="mt-1 flex gap-1">
                  {(["met", "partial", "missed"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setSelf((s) => ({ ...s, [r.id]: v }))}
                      className={cx(
                        "h-8 flex-1 rounded-[2px] border font-mono text-2xs uppercase tracking-[0.1em]",
                        self[r.id] === v ? (v === "met" ? "border-phos text-phos" : v === "partial" ? "border-amber text-amber" : "border-alert text-alert") : "border-line-2 text-ink-2",
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
    <details className="rounded-sm border border-line p-2.5">
      <summary className="cursor-pointer font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">A strong answer</summary>
      <p className="mt-1.5 text-sm text-ink-1">{text}</p>
    </details>
  );
}
