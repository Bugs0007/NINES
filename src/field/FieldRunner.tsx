"use client";
/**
 * Field mission runner: a brief, numbered steps, a hint ladder that costs XP, and a proof box. The proof is checked
 * by patterns (offline) and graded against the criteria when the coach is available, else the player ticks the
 * criteria themselves. Completing records the mission as resolved and awards XP.
 */
import { useMemo, useState } from "react";
import { aiStatus, gradeExplanation } from "@/ai/client";
import type { GradeResult } from "@/ai/schemas";
import { useTrackLevelStart } from "@/analytics/hooks";
import { NODE_BY_ID } from "@/content/graph";
import { useGame } from "@/game/store";
import { CastLine } from "@/ui/Cast";
import { HonestNotes } from "@/ui/HonestNotes";
import { PageBar } from "@/ui/Shell";
import { Button, Chip, cx, LinkButton, Panel } from "@/ui/kit";
import { fieldXp, runChecks, trimProof } from "./check";
import type { FieldMission } from "./types";

const PASS = 0.7;

export function FieldRunner({ mission: m }: { mission: FieldMission }) {
  useTrackLevelStart(m.id);
  const node = NODE_BY_ID.get(m.id);
  const resolved = useGame((s) => s.profile.incidentsResolved.includes(m.id));
  const complete = useGame((s) => s.completeField);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [hints, setHints] = useState(0);
  const [proof, setProof] = useState("");
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<"write" | "grading" | "graded" | "self">("write");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [self, setSelf] = useState<Set<string>>(new Set());
  const [earned, setEarned] = useState<number | null>(null);

  const checks = useMemo(() => runChecks(m.proof.checks, proof), [m.proof.checks, proof]);
  const allChecks = checks.every((c) => c.ok);
  const xp = fieldXp(m, hints);
  const words = proof.trim() ? proof.trim().split(/\s+/).length : 0;

  const toggle = (set: Set<string>, id: string, write: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  };

  const submit = async () => {
    setChecked(true);
    if (!allChecks) return;
    setPhase("grading");
    const status = await aiStatus();
    if (status?.enabled) {
      const r = await gradeExplanation({
        concept: m.title.slice(0, 120),
        prompt: m.proof.prompt.slice(0, 600),
        rubric: m.criteria.slice(0, 6).map((c) => ({ id: c.id, criterion: c.criterion.slice(0, 300) })),
        exemplar: m.proof.sample.slice(0, 1200),
        answer: trimProof(proof),
      });
      if (r) {
        setResult(r);
        setPhase("graded");
        return;
      }
    }
    setPhase("self");
  };

  const passed = phase === "graded" ? (result?.score ?? 0) >= PASS : phase === "self" ? self.size >= Math.ceil(m.criteria.length * PASS) : false;

  const finish = async () => {
    await complete(m.id, xp, { hints, graded: phase === "graded" ? "claude" : "self" });
    setEarned(xp);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <PageBar backHref={node ? `/campaign/${node.chapter}` : "/"} backLabel="Chapter" title="Field mission" />
      <main className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 px-4 pb-20 pt-8 lg:px-8">
        <header>
          <div className="eyebrow text-xs text-amber">Field · {m.estimatedMinutes} min · {m.xp} XP</div>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-ink-0 sm:text-5xl">{m.title.replace(/^Field: /, "")}</h1>
          <div className="mt-5 grid grid-cols-1 gap-3">
            {m.brief.map((l, i) => (
              <CastLine key={i} line={l} typewriter={false} />
            ))}
          </div>
        </header>

        <Panel label="The goal" tone="amber">
          <p className="text-[15px] leading-relaxed text-ink-0">{m.goal}</p>
          <div className="eyebrow mt-4 text-xs text-ink-2">You will need</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-1">
            {m.needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Panel>

        <Panel label="Steps" right={<span className="tabular">{doneSteps.size} / {m.steps.length}</span>}>
          <ol className="grid grid-cols-1 gap-4">
            {m.steps.map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <input type="checkbox" aria-label={`Step ${i + 1} done`} checked={doneSteps.has(s.id)} onChange={() => toggle(doneSteps, s.id, setDoneSteps)} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--color-phos)]" />
                <div className="min-w-0">
                  <div className={cx("text-[15px] font-medium", doneSteps.has(s.id) ? "text-ink-2 line-through decoration-ink-3" : "text-ink-0")}>
                    {i + 1}. {s.title}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-1">{s.detail}</p>
                  {s.commands?.map((c) => (
                    <pre key={c} className="mt-2 overflow-x-auto rounded-md border border-line/70 bg-bg-0/70 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink-1">
                      {c}
                    </pre>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel label="Hints" right={<span className="tabular">worth {xp} XP now</span>}>
          <div className="grid grid-cols-1 gap-2.5">
            {m.hints.slice(0, hints).map((h, i) => (
              <p key={i} className="rounded-md border border-line/70 bg-bg-0/50 px-3 py-2.5 text-sm leading-relaxed text-ink-1">
                {h.text}
              </p>
            ))}
            {hints < m.hints.length ? (
              <div>
                <Button variant="secondary" size="sm" onClick={() => setHints((n) => n + 1)}>
                  Open a hint (−{m.hints[hints]!.cost} XP)
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">No more hints.</p>
            )}
          </div>
        </Panel>

        <Panel label="Show your work" tone={earned !== null ? "phos" : "default"}>
          <p className="text-[15px] leading-relaxed text-ink-0">{m.proof.prompt}</p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5">
            {m.criteria.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <span aria-hidden className="text-ink-3">·</span>
                {c.criterion}
              </li>
            ))}
          </ul>
          {earned === null && (
            <>
              <textarea
                value={proof}
                onChange={(e) => {
                  setProof(e.target.value);
                  setPhase("write");
                  setChecked(false);
                  setResult(null);
                }}
                rows={10}
                aria-label="Your proof"
                placeholder={m.proof.placeholder}
                className="mt-4 w-full resize-y rounded-md border border-line-2/70 bg-bg-0/60 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-0 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-3 focus:border-amber-3 focus:shadow-[0_0_0_3px_rgb(232_183_125/0.12)]"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs tabular text-ink-3">{words} words</span>
                <Button variant="primary" onClick={submit} disabled={words < 12 || phase === "grading"}>
                  {phase === "grading" ? "Checking…" : "Check my proof"}
                </Button>
              </div>
              {checked && (
                <ul className="mt-4 grid grid-cols-1 gap-1.5" aria-label="Automatic checks">
                  {checks.map((c) => (
                    <li key={c.id} className="flex gap-2.5 text-sm leading-snug">
                      <span className={cx("w-3.5 shrink-0 text-center font-semibold", c.ok ? "text-phos" : "text-alert")}>{c.ok ? "✓" : "✗"}</span>
                      <span className={c.ok ? "text-ink-1" : "text-ink-0"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {checked && !allChecks && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">Some evidence is missing from what you pasted. Add it and check again.</p>}
              {phase === "graded" && result && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="num-display text-4xl font-semibold text-ink-0">{Math.round(result.score * 100)}%</span>
                    <Chip tone="muted">Graded by Claude</Chip>
                  </div>
                  <ul className="grid grid-cols-1 gap-2">
                    {m.criteria.map((c) => {
                      const v = result.criteria.find((x) => x.id === c.id);
                      return (
                        <li key={c.id} className="flex gap-2.5 text-sm leading-snug">
                          <span className={cx("w-3.5 shrink-0 text-center font-semibold", v?.verdict === "met" ? "text-phos" : v?.verdict === "partial" ? "text-amber" : "text-alert")}>{v?.verdict === "met" ? "✓" : v?.verdict === "partial" ? "~" : "✗"}</span>
                          <div className="min-w-0">
                            <span className="text-ink-0">{c.criterion}</span>
                            {v?.note && <div className="mt-0.5 text-[13px] text-ink-2">{v.note}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <CastLine line={{ speaker: "meera", line: result.feedback }} compact typewriter={false} />
                </div>
              )}
              {phase === "self" && (
                <div className="mt-5">
                  <div className="eyebrow text-xs text-amber">Check yourself</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">The coach is not available, so tick what your pasted work shows. Be honest; the sample below is what a passing answer looks like.</p>
                  <ul className="mt-3 grid grid-cols-1 gap-2">
                    {m.criteria.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-ink-0">
                          <input type="checkbox" checked={self.has(c.id)} onChange={() => toggle(self, c.id, setSelf)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-phos)]" />
                          {c.criterion}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <details className="mt-3 text-sm text-ink-1">
                    <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink-0">Show a passing sample</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-line/70 bg-bg-0/70 p-3 font-mono text-[12.5px] leading-relaxed text-ink-1">{m.proof.sample}</pre>
                  </details>
                </div>
              )}
              {(phase === "graded" || phase === "self") && (
                <div className="mt-5">
                  <Button variant="go" onClick={finish} disabled={!passed}>
                    {resolved ? "Record again" : "Complete the mission"} · +{xp} XP
                  </Button>
                  {!passed && <p className="mt-2 text-[13px] text-ink-2">{phase === "graded" ? "Not quite there yet. Fix the gaps above and check again." : "Tick at least most of the criteria to finish."}</p>}
                </div>
              )}
            </>
          )}
          {earned !== null && (
            <div className="mt-5 space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="num-display text-4xl font-semibold text-phos">+{earned} XP</span>
                <Chip tone="ok">Mission complete</Chip>
              </div>
              {m.debrief.map((d) => (
                <p key={d} className="text-[15px] leading-relaxed text-ink-1">
                  {d}
                </p>
              ))}
              <LinkButton href={node ? `/campaign/${node.chapter}` : "/"} variant="primary">
                Back to the chapter
              </LinkButton>
            </div>
          )}
          {resolved && earned === null && <Chip tone="ok" className="mt-4">Completed before</Chip>}
        </Panel>

        <HonestNotes notes={m.honestPhysics} />
        <section aria-label="Sources" className="text-[13px] leading-relaxed text-ink-2">
          <div className="eyebrow text-xs text-ink-2">Sources</div>
          <ul className="mt-2 grid grid-cols-1 gap-1">
            {m.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-amber hover:text-amber-2">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
