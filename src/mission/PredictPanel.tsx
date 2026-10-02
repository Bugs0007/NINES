"use client";
/**
 * Prediction input: choice, numeric (log slider), or order (drag / tap to reorder), plus confidence.
 */
import { motion, Reorder } from "motion/react";
import { useState } from "react";
import { sfx } from "@/audio/engine";
import type { Prediction } from "@/content/schema";
import { CONFIDENCE_LABEL, CONFIDENCES, type Confidence } from "@/game/scoring";
import { Button, cx } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { Slider } from "@/ui/Slider";

export interface Call {
  value: string | number | string[];
  confidence: Confidence;
}

export function formatNumeric(v: number, unit: string): string {
  const s = v >= 10000 ? v.toLocaleString("en-US", { maximumSignificantDigits: 3 }) : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, "");
  return `${s}${unit ? ` ${unit}` : ""}`;
}

export function ConfidencePicker({ value, onChange }: { value: Confidence | null; onChange: (c: Confidence) => void }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">How sure are you?</div>
      <div role="radiogroup" aria-label="Confidence" className="grid grid-cols-3 gap-1.5">
        {CONFIDENCES.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              role="radio"
              aria-checked={on}
              onClick={() => {
                sfx.unlock();
                sfx.select();
                onChange(c);
              }}
              className={cx(
                "flex h-14 flex-col items-center justify-center rounded-sm border font-mono transition-colors",
                on ? "border-amber bg-amber-dim/60 text-amber" : "border-line-2 bg-bg-2 text-ink-1 hover:border-line-3",
              )}
            >
              <span className="text-lg tabular leading-none">{c}%</span>
              <span className="mt-1 text-[10px] uppercase tracking-[0.1em] opacity-80">{CONFIDENCE_LABEL[c]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PredictPanel({ p, onLock, index, total }: { p: Prediction; onLock: (c: Call) => void; index: number; total: number }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [num, setNum] = useState<number>(() => (p.kind === "numeric" ? Math.sqrt(p.min * p.max) : 0));
  const [touched, setTouched] = useState(false);
  const [order, setOrder] = useState<string[]>(() => (p.kind === "order" ? shuffled(p.items.map((i) => i.id), p.answer) : []));
  const [conf, setConf] = useState<Confidence | null>(null);

  const ready = conf !== null && (p.kind === "choice" ? choice !== null : p.kind === "numeric" ? touched : true);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 font-mono text-2xs uppercase tracking-[0.16em] text-amber">
          Your call {total > 1 ? `· ${index + 1} of ${total}` : ""}
        </div>
        <p className="text-[17px] leading-snug text-ink-0">{p.prompt}</p>
      </div>

      {p.kind === "choice" && (
        <div role="radiogroup" aria-label={p.prompt} className="flex flex-col gap-1.5">
          {p.options.map((o, i) => {
            const on = choice === o.id;
            return (
              <motion.button
                key={o.id}
                role="radio"
                aria-checked={on}
                whileTap={{ scale: 0.98 }}
                transition={spring.snap}
                onClick={() => {
                  sfx.unlock();
                  sfx.tick();
                  setChoice(o.id);
                }}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-sm border px-3 py-2 text-left text-sm transition-colors",
                  on ? "border-amber bg-amber-dim/50 text-ink-0" : "border-line-2 bg-bg-2 text-ink-1 hover:border-line-3 hover:text-ink-0",
                )}
              >
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-[2px] border font-mono text-2xs", on ? "border-amber text-amber" : "border-line-3 text-ink-2")}>
                  {String.fromCharCode(65 + i)}
                </span>
                {o.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {p.kind === "numeric" && (
        <div className="rounded-sm border border-line-2 bg-bg-2 p-3">
          <div className="mb-2 text-center font-mono text-3xl tabular text-amber glow-amber">{touched ? formatNumeric(num, p.unit) : "?"}</div>
          <Slider
            label="drag to set"
            value={num}
            min={p.min}
            max={p.max}
            log={p.log}
            step={p.step}
            onChange={(v) => {
              setTouched(true);
              setNum(v);
            }}
            hideValue
            marks={logMarks(p.min, p.max, p.log)}
          />
        </div>
      )}

      {p.kind === "order" && (
        <div>
          <div className="mb-1.5 flex justify-between font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">
            <span>Fastest</span>
            <span>drag or use arrows</span>
          </div>
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-1">
            {order.map((id, i) => {
              const item = p.items.find((x) => x.id === id)!;
              return (
                <Reorder.Item
                  key={id}
                  value={id}
                  onDragStart={() => sfx.tick()}
                  onDragEnd={() => sfx.thunk()}
                  className="flex min-h-11 cursor-grab touch-none select-none items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 py-1.5 text-sm text-ink-0 active:cursor-grabbing active:border-amber"
                >
                  <span className="w-5 font-mono text-2xs text-ink-3">{i + 1}</span>
                  <span className="flex-1">{item.label}</span>
                  <span className="flex gap-0.5">
                    <button aria-label={`Move ${item.label} up`} className="h-8 w-8 rounded-[2px] text-ink-2 hover:bg-bg-3 hover:text-ink-0" onClick={() => move(order, setOrder, i, -1)}>
                      ▲
                    </button>
                    <button aria-label={`Move ${item.label} down`} className="h-8 w-8 rounded-[2px] text-ink-2 hover:bg-bg-3 hover:text-ink-0" onClick={() => move(order, setOrder, i, 1)}>
                      ▼
                    </button>
                  </span>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          <div className="mt-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">Slowest</div>
        </div>
      )}

      <ConfidencePicker value={conf} onChange={setConf} />

      <Button
        variant="primary"
        size="lg"
        sound="latch"
        disabled={!ready}
        onClick={() => {
          const value = p.kind === "choice" ? choice! : p.kind === "numeric" ? num : order;
          onLock({ value, confidence: conf! });
        }}
      >
        Lock it in
      </Button>
    </div>
  );
}

function move(order: string[], set: (o: string[]) => void, i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= order.length) return;
  const next = order.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  sfx.tick();
  set(next);
}

/** Deterministic shuffle that never starts in the correct order. */
function shuffled(ids: string[], answer: string[]): string[] {
  const out = ids.slice();
  let seed = ids.join("").length * 7 + 3;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (out.join() === answer.join()) out.reverse();
  return out;
}

function logMarks(min: number, max: number, log: boolean) {
  if (!log) return undefined;
  const marks: { value: number; label: string }[] = [];
  for (let e = Math.ceil(Math.log10(min)); e <= Math.floor(Math.log10(max)); e++) {
    const v = Math.pow(10, e);
    marks.push({ value: v, label: v >= 1000 ? `${v / 1000}k` : String(v) });
  }
  return marks;
}

/** Is a call right? Order predictions allow one adjacent swap. */
export function judge(p: Prediction, value: Call["value"]): { correct: boolean; detail?: string } {
  if (p.kind === "choice") return { correct: value === p.answer };
  if (p.kind === "numeric") {
    const v = value as number;
    const r = v / p.answer;
    return { correct: r <= p.tolerance && r >= 1 / p.tolerance };
  }
  const got = value as string[];
  const pos = new Map(p.answer.map((id, i) => [id, i]));
  let inversions = 0;
  for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) if (pos.get(got[i]!)! > pos.get(got[j]!)!) inversions++;
  return { correct: inversions <= 1, detail: inversions === 0 ? "perfect order" : `${inversions} swap${inversions === 1 ? "" : "s"} away` };
}

export function describeCall(p: Prediction, value: Call["value"]): string {
  if (p.kind === "choice") return p.options.find((o) => o.id === value)?.label ?? String(value);
  if (p.kind === "numeric") return formatNumeric(value as number, p.unit);
  return (value as string[]).map((id) => p.items.find((i) => i.id === id)?.label ?? id).join(" → ");
}

export function describeAnswer(p: Prediction): string {
  if (p.kind === "choice") return p.options.find((o) => o.id === p.answer)?.label ?? p.answer;
  if (p.kind === "numeric") return formatNumeric(p.answer, p.unit);
  return p.answer.map((id) => p.items.find((i) => i.id === id)?.label ?? id).join(" → ");
}
