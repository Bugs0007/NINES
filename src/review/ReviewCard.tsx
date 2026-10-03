"use client";
/**
 * One review: a micro-scenario in any of seven formats. Unnamed until answered (retrieval, not recognition).
 * Correct answers sometimes get a "Why?" follow-up, so guessing never pays.
 */
import { AnimatePresence, motion, Reorder } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { aiStatus, gradeExplanation } from "@/ai/client";
import type { ReviewItem } from "@/content/schema";
import { runTune } from "@/content/scenarios";
import { scoreEstimate, type Confidence } from "@/game/scoring";
import { ConfidencePicker } from "@/mission/PredictPanel";
import { Button, Chip, cx, fmtLatency } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { Slider } from "@/ui/Slider";
import { evalCond, formatMetric } from "@/widgets/shared";
import { GraphOption, MiniDiagram } from "./Diagram";

export interface ReviewOutcome {
  correct: boolean;
  partial: boolean;
  confidence: Confidence;
  seconds: number;
  whyCorrect?: boolean;
}

/** Parse "2.5k", "40", "1e6", "3M", "1,200". */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/,/g, "").replace(/\s+/g, "");
  const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)([kmbt]?)$/i.exec(t);
  if (!m) return null;
  const mult = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]!.toLowerCase() as "" | "k" | "m" | "b" | "t"];
  return Number(m[1]) * mult;
}

const FORMAT_LABEL: Record<ReviewItem["format"], string> = {
  "pick-fix": "Pick the fix",
  "spot-flaw": "Spot the flaw",
  estimate: "Estimate",
  order: "Put in order",
  "predict-graph": "Predict the graph",
  explain: "Explain it",
  tune: "Tune it",
};

export function ReviewCard({ item, conceptTitle, askWhy, onDone }: { item: ReviewItem; conceptTitle: string; askWhy: boolean; onDone: (o: ReviewOutcome) => void }) {
  const started = useRef(0);
  useEffect(() => {
    started.current = performance.now();
  }, [item.id]);
  const [phase, setPhase] = useState<"answer" | "feedback" | "why" | "whyDone">("answer");
  const [conf, setConf] = useState<Confidence | null>(null);
  const [result, setResult] = useState<{ correct: boolean; partial: boolean; note?: string } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [whyPick, setWhyPick] = useState<string | null>(null);

  // format state
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [order, setOrder] = useState<string[]>(() => (item.format === "order" ? scramble(item.items.map((i) => i.id), item.answer) : []));
  const [tuneV, setTuneV] = useState(() => (item.format === "tune" ? item.param.min : 0));
  const [tuneRuns, setTuneRuns] = useState<{ v: number; m: Record<string, number> }[]>([]);
  const [busy, setBusy] = useState(false);
  const [selfGrade, setSelfGrade] = useState<Record<string, "met" | "partial" | "missed">>({});

  const needsConf = item.format !== "explain";
  const ready =
    (!needsConf || conf !== null) &&
    (item.format === "pick-fix" || item.format === "predict-graph" || item.format === "spot-flaw"
      ? choice !== null
      : item.format === "estimate"
        ? parseNumber(text) !== null
        : item.format === "explain"
          ? text.trim().split(/\s+/).length >= 8
          : item.format === "tune"
            ? tuneRuns.length > 0
            : true);

  const submit = async () => {
    const secs = (performance.now() - started.current) / 1000;
    setSeconds(secs);
    let r: { correct: boolean; partial: boolean; note?: string };
    switch (item.format) {
      case "pick-fix":
      case "predict-graph":
      case "spot-flaw":
        r = { correct: choice === item.answer, partial: false };
        break;
      case "estimate": {
        const g = parseNumber(text)!;
        const s = scoreEstimate(g, item.answer, item.acceptFactor);
        r = { correct: s.grade === "exact" || s.grade === "close", partial: s.grade === "ballpark", note: `${s.grade} · off by ${s.error < 0.05 ? "almost nothing" : `${Math.pow(10, s.error).toFixed(1)}×`}` };
        break;
      }
      case "order": {
        const pos = new Map(item.answer.map((id, i) => [id, i]));
        let inv = 0;
        for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (pos.get(order[i]!)! > pos.get(order[j]!)!) inv++;
        r = { correct: inv === 0, partial: inv === 1, note: inv ? `${inv} swap${inv > 1 ? "s" : ""} away` : undefined };
        break;
      }
      case "tune": {
        setBusy(true);
        await new Promise((res) => setTimeout(res, 30));
        const last = tuneRuns[tuneRuns.length - 1]!;
        const meets = evalCond(last.m[item.target.metric] ?? NaN, item.target.op, item.target.value);
        let min = item.param.max;
        for (let v = item.param.min; v <= item.param.max; v += item.param.step) {
          const m = runTune(item.tuneScenario, v);
          if (evalCond(m[item.target.metric] ?? NaN, item.target.op, item.target.value)) {
            min = v;
            break;
          }
        }
        setBusy(false);
        const lean = last.v <= min + 2 * item.param.step;
        r = { correct: meets && lean, partial: meets && !lean, note: `lowest value that works: ${min}${item.param.unit}` };
        break;
      }
      case "explain": {
        setBusy(true);
        const status = await aiStatus();
        const g = status?.enabled ? await gradeExplanation({ concept: conceptTitle, prompt: item.scenario, rubric: item.rubric.map((x) => ({ id: x.id, criterion: x.criterion })), exemplar: item.exemplar, answer: text }) : null;
        setBusy(false);
        if (g) r = { correct: g.score >= 0.67, partial: g.score >= 0.34 && g.score < 0.67, note: g.gap ? `gap: ${g.gap}` : g.feedback };
        else {
          setPhase("feedback");
          setResult(null);
          return;
        }
        break;
      }
    }
    setResult(r);
    setPhase("feedback");
    sfx.reveal(r.correct ? 0 : r.partial ? 0.3 : 0.6);
  };

  const finish = (whyCorrect?: boolean) => {
    onDone({ correct: !!result?.correct, partial: !!result?.partial, confidence: conf ?? 70, seconds, whyCorrect });
  };

  const selfScore = item.format === "explain" ? item.rubric.reduce((s, r) => s + (selfGrade[r.id] === "met" ? 1 : selfGrade[r.id] === "partial" ? 0.5 : 0), 0) / item.rubric.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-5 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone="info">{FORMAT_LABEL[item.format]}</Chip>
        {phase !== "answer" && <Chip tone="ok">{conceptTitle}</Chip>}
      </div>
      <p className="text-[17px] leading-relaxed text-ink-0">{item.scenario}</p>

      {/* ---- inputs ---- */}
      {(item.format === "pick-fix") && (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Options">
          {item.options.map((o, i) => {
            const st = phase === "answer" ? (choice === o.id ? "picked" : "none") : o.id === item.answer ? "ok" : choice === o.id ? "bad" : "none";
            return (
              <button
                key={o.id}
                role="radio"
                aria-checked={choice === o.id}
                disabled={phase !== "answer"}
                onClick={() => {
                  sfx.tick();
                  setChoice(o.id);
                }}
                className={cx(
                  "flex min-h-12 items-center gap-3.5 rounded-md border px-4 py-2.5 text-left text-[15px] leading-snug transition-colors duration-200",
                  st === "ok" ? "border-phos-3 bg-phos-dim/40 text-ink-0" : st === "bad" ? "border-alert-3 bg-alert-dim/40 text-ink-0" : st === "picked" ? "border-amber/70 bg-amber-dim/50 text-ink-0" : "border-line-2/80 bg-bg-2/60 text-ink-1 hover:border-line-3 hover:bg-bg-2 disabled:hover:border-line-2/80",
                )}
              >
                <span
                  className={cx(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
                    st === "ok" ? "border-phos-3 text-phos" : st === "bad" ? "border-alert-3 text-alert" : st === "picked" ? "border-amber/70 text-amber" : "border-line-3 text-ink-2",
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
      {item.format === "predict-graph" && (
        <div>
          <div className="mb-2 flex justify-between gap-3 text-xs text-ink-2">
            <span>y: {item.yLabel}</span>
            <span className="text-right">x: {item.xLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {item.options.map((o) => (
              <GraphOption
                key={o.id}
                points={o.points}
                label={o.label}
                selected={choice === o.id}
                state={phase === "answer" ? "none" : o.id === item.answer ? "ok" : choice === o.id ? "bad" : "none"}
                onClick={() => phase === "answer" && (sfx.tick(), setChoice(o.id))}
              />
            ))}
          </div>
        </div>
      )}
      {item.format === "spot-flaw" && (
        <div>
        <div className="overflow-x-auto rounded-md border border-line/70 bg-bg-0/60 p-3">
          <MiniDiagram
            d={item.diagram}
            picked={choice}
            answer={item.answer}
            reveal={phase !== "answer"}
            onPick={(id) => {
              sfx.tick();
              setChoice(id);
            }}
          />
        </div>
          <div className="mt-2 text-xs text-ink-2">
            {choice ? (
              <>
                Selected: <span className="font-mono text-ink-1">{choice.replace("->", " → ")}</span>
              </>
            ) : (
              "Tap a box or a connection"
            )}
          </div>
        </div>
      )}
      {item.format === "estimate" && (
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            value={text}
            disabled={phase !== "answer"}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Your estimate in ${item.unit}`}
            placeholder="e.g. 40, 2.5k, 1e6"
            className="h-12 w-44 rounded-sm border border-line-2 bg-bg-2/70 px-4 font-mono text-xl tabular text-amber outline-none transition-colors placeholder:text-ink-3 focus:border-amber/80 disabled:opacity-70"
          />
          <span className="text-[15px] text-ink-1">{item.unit}</span>
        </div>
      )}
      {item.format === "order" && (
        <Reorder.Group axis="y" values={order} onReorder={phase === "answer" ? setOrder : () => undefined} className="flex flex-col gap-2">
          {order.map((id, i) => {
            const it = item.items.find((x) => x.id === id)!;
            const right = phase !== "answer" && item.answer[i] === id;
            return (
              <Reorder.Item key={id} value={id} className={cx("flex min-h-12 touch-none select-none items-center gap-3 rounded-md border py-1.5 pl-4 pr-1.5 text-[15px] leading-snug text-ink-0", phase === "answer" ? "cursor-grab border-line-2/80 bg-bg-2/60" : right ? "border-phos-3/70 bg-phos-dim/30" : "border-alert-3/70 bg-alert-dim/30")}>
                <span className="w-4 shrink-0 font-mono text-xs tabular text-ink-3">{i + 1}</span>
                <span className="min-w-0 flex-1">{it.label}</span>
                {phase === "answer" && (
                  <span className="flex shrink-0 gap-0.5">
                    <button aria-label={`Move ${it.label} up`} className="grid h-9 w-9 place-items-center rounded-xs text-xs text-ink-3 transition-colors hover:bg-bg-3 hover:text-ink-0" onClick={() => swap(order, setOrder, i, -1)}>
                      ▲
                    </button>
                    <button aria-label={`Move ${it.label} down`} className="grid h-9 w-9 place-items-center rounded-xs text-xs text-ink-3 transition-colors hover:bg-bg-3 hover:text-ink-0" onClick={() => swap(order, setOrder, i, 1)}>
                      ▼
                    </button>
                  </span>
                )}
                {phase !== "answer" && !right && <span className="shrink-0 pr-2.5 text-xs tabular text-ink-2">→ #{item.answer.indexOf(id) + 1}</span>}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
      {item.format === "tune" && (
        <div className="rounded-md border border-line/70 bg-bg-2/50 p-4">
          <Slider label={item.param.label} value={tuneV} min={item.param.min} max={item.param.max} step={item.param.step} onChange={setTuneV} format={(v) => `${v}${item.param.unit}`} disabled={phase !== "answer"} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={phase !== "answer" || busy}
              onClick={async () => {
                setBusy(true);
                await new Promise((r) => setTimeout(r, 20));
                const m = runTune(item.tuneScenario, tuneV);
                setTuneRuns((xs) => [...xs, { v: tuneV, m }]);
                setBusy(false);
                sfx.select();
              }}
            >
              {busy ? "Simulating…" : "Run 60s"}
            </Button>
            <span className="text-[13px] text-ink-2">Target: {item.target.label}</span>
          </div>
          {tuneRuns.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-sm bg-bg-0/50 px-3 py-2 font-mono text-xs tabular">
              {tuneRuns.slice(-4).map((r, i) => {
                const ok = evalCond(r.m[item.target.metric] ?? NaN, item.target.op, item.target.value);
                return (
                  <li key={i} className={ok ? "text-phos" : "text-alert"}>
                    {item.param.label} {r.v}
                    {item.param.unit} → {item.target.metric} {formatMetric(item.target.metric, r.m[item.target.metric] ?? NaN)} {ok ? "✓" : "✗"}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 text-xs leading-relaxed text-ink-2">Your last run is your answer. Hit the target without overbuying.</div>
        </div>
      )}
      {item.format === "explain" && phase === "answer" && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          aria-label="Your explanation"
          className="w-full rounded-md border border-line-2 bg-bg-2/60 p-4 text-[15px] leading-relaxed text-ink-0 outline-none transition-colors placeholder:text-ink-3 focus:border-amber/80"
          placeholder="Two sentences, your own words."
        />
      )}
      </div>

      {/* ---- answer controls ---- */}
      {phase === "answer" && (
        <>
          {needsConf && <ConfidencePicker value={conf} onChange={setConf} />}
          <Button variant="primary" size="lg" sound="latch" disabled={!ready || busy} onClick={submit} className="sm:min-w-44 sm:self-start">
            {busy ? "Checking…" : "Submit"}
          </Button>
        </>
      )}

      {/* ---- feedback ---- */}
      <AnimatePresence>
        {phase !== "answer" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="flex flex-col gap-4">
            {result ? (
              <div className={cx("rounded-lg border p-5 sm:p-6", result.correct ? "border-phos-3/60 bg-phos-dim/25" : result.partial ? "border-amber-3/60 bg-amber-dim/25" : "border-alert-3/60 bg-alert-dim/25")}>
                <div className={cx("font-display text-2xl font-semibold", result.correct ? "text-phos" : result.partial ? "text-amber" : "text-alert")}>{result.correct ? "Correct" : result.partial ? "Close" : "Not this time"}</div>
                {result.note && <div className="mt-1 text-sm text-ink-1">{result.note}</div>}
                {item.format === "estimate" && (
                  <div className="mt-3 text-sm text-ink-1">
                    Answer ≈{" "}
                    <span className="font-mono tabular text-ink-0">
                      {item.answer.toLocaleString()} {item.unit}
                    </span>
                    <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
                      {item.breakdown.map((b, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="tabular text-ink-3">{i + 1}.</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-0">{item.explain}</p>
              </div>
            ) : (
              item.format === "explain" && (
                <div className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-6">
                  <div className="text-sm text-ink-2">Grade yourself against the rubric. A strong answer:</div>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-0">{item.exemplar}</p>
                  <ul className="mt-4 space-y-4">
                    {item.rubric.map((r) => (
                      <li key={r.id}>
                        <div className="text-sm leading-relaxed text-ink-0">{r.criterion}</div>
                        <div className="mt-2 flex gap-1.5">
                          {(["met", "partial", "missed"] as const).map((v) => (
                            <button key={v} onClick={() => setSelfGrade((s) => ({ ...s, [r.id]: v }))} className={cx("h-9 flex-1 rounded-full border text-[13px] font-medium capitalize transition-colors", selfGrade[r.id] === v ? "border-amber/70 bg-amber-dim/60 text-amber" : "border-line-2/80 text-ink-2 hover:border-line-3 hover:text-ink-1")}>
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
                    disabled={Object.keys(selfGrade).length < item.rubric.length}
                    onClick={() => {
                      const r = { correct: selfScore >= 0.67, partial: selfScore >= 0.34 && selfScore < 0.67 };
                      setResult(r);
                    }}
                  >
                    Record my grade
                  </Button>
                </div>
              )
            )}

            {phase === "feedback" && result && (
              <Button
                variant="primary"
                size="lg"
                className="sm:min-w-44 sm:self-start"
                onClick={() => {
                  if (result.correct && askWhy && item.why) setPhase("why");
                  else finish();
                }}
              >
                Continue
              </Button>
            )}
            {(phase === "why" || phase === "whyDone") && item.why && (
              <div className="rounded-lg border border-amber-3/60 bg-amber-dim/20 p-5 sm:p-6">
                <div className="font-display text-xl font-semibold text-amber">Why?</div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-0">{item.why.prompt}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {item.why.options.map((o) => {
                    const st = phase === "whyDone" ? (o.id === item.why!.answer ? "ok" : whyPick === o.id ? "bad" : "none") : "none";
                    return (
                      <button
                        key={o.id}
                        disabled={phase === "whyDone"}
                        onClick={() => {
                          setWhyPick(o.id);
                          setPhase("whyDone");
                          sfx.reveal(o.id === item.why!.answer ? 0 : 0.5);
                        }}
                        className={cx("min-h-11 rounded-md border px-4 py-2.5 text-left text-[15px] leading-snug transition-colors duration-200", st === "ok" ? "border-phos-3 bg-phos-dim/40 text-ink-0" : st === "bad" ? "border-alert-3 bg-alert-dim/40 text-ink-0" : "border-line-2/80 bg-bg-2/60 text-ink-1 hover:border-line-3 hover:bg-bg-2 disabled:hover:border-line-2/80")}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {phase === "whyDone" && (
                  <Button className="mt-5" variant="primary" size="lg" onClick={() => finish(whyPick === item.why!.answer)}>
                    Continue
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {phase !== "answer" && seconds > 0 && (
        <div className="text-xs text-ink-3">
          Answered in <span className="tabular">{fmtLatency(seconds)}</span>
        </div>
      )}
    </div>
  );
}

function swap(order: string[], set: (o: string[]) => void, i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= order.length) return;
  const next = order.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  sfx.tick();
  set(next);
}

function scramble(ids: string[], answer: string[]): string[] {
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (out.join() === answer.join()) out.reverse();
  return out;
}

export const useStableRandom = (seed: string) => useMemo(() => Math.abs([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) / 2147483647, [seed]);
