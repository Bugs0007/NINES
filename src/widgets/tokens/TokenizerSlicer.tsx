"use client";
/**
 * Tokenizer Slicer: guess the token count, then watch the text split. English vs Telugu vs code vs JSON.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { magnitudeError } from "@/game/scoring";
import { Button, Chip, cx, fmtUsd, Panel } from "@/ui/kit";
import { spring, useReducedMotion } from "@/ui/motion";
import type { WidgetProps } from "../types";
import { SAMPLES, SlicerConfig } from "./spec";

export { SlicerConfig };

type Tok = { encode: (s: string) => number[]; decode: (ids: number[]) => string };

export function useTokenizer(): Tok | null {
  const [tok, setTok] = useState<Tok | null>(null);
  useEffect(() => {
    let alive = true;
    import("gpt-tokenizer/encoding/o200k_base").then((m) => alive && setTok({ encode: m.encode, decode: m.decode }));
    return () => {
      alive = false;
    };
  }, []);
  return tok;
}

const CHIP_TONES = ["bg-phos/15 border-phos-3/70", "bg-amber/15 border-amber-3/70", "bg-ink-2/15 border-line-3/80"];

export function TokenChips({ pieces, animate, max = 400 }: { pieces: string[]; animate: boolean; max?: number }) {
  const reduced = useReducedMotion();
  const shown = pieces.slice(0, max);
  return (
    <div className="flex flex-wrap gap-[3px] font-mono text-[13px] leading-tight" aria-label={`${pieces.length} tokens`}>
      {shown.map((p, i) => (
        <motion.span
          key={i}
          initial={animate && !reduced ? { opacity: 0, y: -6, scale: 0.8 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.snap, delay: animate && !reduced ? Math.min(1.6, i * 0.035) : 0 }}
          className={cx("whitespace-pre rounded-xs border px-[3px] py-[1px] text-ink-0", CHIP_TONES[i % CHIP_TONES.length])}
        >
          {p.replace(/\n/g, "↵").replace(/ /g, "·") || "∅"}
        </motion.span>
      ))}
      {pieces.length > max && <span className="font-mono text-2xs text-ink-3">+{pieces.length - max} more</span>}
    </div>
  );
}

export default function TokenizerSlicer({ config, scene, onObserve, locked, mode }: WidgetProps<SlicerConfig>) {
  const c = SlicerConfig.parse(config);
  const tok = useTokenizer();
  const samples = SAMPLES.filter((s) => c.samples.includes(s.id));
  const [sel, setSel] = useState(samples[0]!.id);
  const [custom, setCustom] = useState("");
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { guess: number | null; actual: number }>>({});
  const fired = useRef(new Set<string>());
  const text = sel === "custom" ? custom : samples.find((s) => s.id === sel)?.text ?? "";
  const pieces = useMemo(() => (tok && text ? tok.encode(text).map((id) => tok.decode([id])) : []), [tok, text]);
  const isRevealed = sel === "custom" ? !!custom : !!revealed[sel];

  useEffect(() => {
    if (scene === "scripts") setSel("te");
    if (scene === "strawberry") setSel("straw");
  }, [scene]);

  const fire = (e: string) => {
    if (fired.current.has(e)) return;
    fired.current.add(e);
    onObserve?.(e);
  };

  const slice = () => {
    if (!tok) return;
    const g = Number(guess);
    setRevealed((r) => ({ ...r, [sel]: { guess: Number.isFinite(g) && guess ? g : null, actual: pieces.length } }));
    sfx.whoosh();
    setGuess("");
    fire("sliced");
    if (sel === "te" || sel === "hi") fire("script-gap");
    if (sel === "json") fire("json-dense");
    if (sel === "straw") fire("strawberry");
  };

  const en = revealed["en"]?.actual;
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sample text">
          {samples.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sel === s.id}
              onClick={() => setSel(s.id)}
              className={cx("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-200", sel === s.id ? "border-amber bg-amber text-bg-0" : revealed[s.id] ? "border-phos-3/70 text-phos" : "border-line-2/80 text-ink-1 hover:border-line-3")}
            >
              {s.label}
              {revealed[s.id] ? ` · ${revealed[s.id]!.actual}` : ""}
            </button>
          ))}
          <button role="tab" aria-selected={sel === "custom"} onClick={() => setSel("custom")} className={cx("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-200", sel === "custom" ? "border-amber bg-amber text-bg-0" : "border-line-2/80 text-ink-1 hover:border-line-3")}>
            Your text
          </button>
        </div>
        <Panel label="Text" className="flex-1" bodyClassName="flex h-full flex-col gap-4">
          {sel === "custom" ? (
            <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={4} aria-label="Your text" placeholder="Paste anything: a prompt, a log line, a paragraph in Telugu…" className="rounded-sm border border-line-2 bg-bg-0/70 p-3 font-mono text-sm text-ink-0 outline-none transition-colors focus:border-amber" />
          ) : (
            <p className="text-lg leading-relaxed text-ink-0">{text}</p>
          )}
          <div className="text-xs tabular text-ink-2">{[...text].length} characters</div>
          <AnimatePresence mode="wait">
            {isRevealed && tok ? (
              <motion.div key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                <TokenChips pieces={pieces} animate={sel !== "custom"} />
                <div className="flex flex-wrap items-center gap-2 text-xs tabular text-ink-2">
                  <Chip tone="ok">{pieces.length} tokens · o200k</Chip>
                  <span>{([...text].length / Math.max(1, pieces.length)).toFixed(1)} characters per token</span>
                  {en && sel !== "en" && sel !== "custom" && <span>· {(pieces.length / en).toFixed(1)}× the English message</span>}
                </div>
                {revealed[sel]?.guess != null && (
                  <div className="text-[13px] tabular text-ink-1">
                    You guessed {revealed[sel]!.guess} ·{" "}
                    <span className={magnitudeError(revealed[sel]!.guess!, pieces.length) < 0.1 ? "text-phos" : "text-amber"}>
                      {magnitudeError(revealed[sel]!.guess!, pieces.length) < 0.1 ? "within 25%" : `off by ${Math.pow(10, magnitudeError(revealed[sel]!.guess!, pieces.length)).toFixed(1)}×`}
                    </span>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className={cx("flex flex-wrap items-end gap-3", (locked || mode === "preview") && "pointer-events-none opacity-40")}>
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow text-xs text-ink-2">Your guess</span>
                  <input value={guess} onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Guess the token count" className="h-10 w-28 rounded-sm border border-line-2 bg-bg-0 px-2 font-mono text-lg tabular text-amber outline-none focus:border-amber" />
                </label>
                <Button variant="go" onClick={slice} disabled={!tok} sound="none">
                  {tok ? "Slice it" : "Loading tokenizer…"}
                </Button>
              </div>
            )}
          </AnimatePresence>
        </Panel>
      </div>
      <div className="flex w-full flex-col gap-4 lg:w-[300px]">
        <Panel label="What it costs">
          <div className="text-xs tabular text-ink-2">At ${c.usdPerMTok} per million input tokens</div>
          <div className="mt-1.5 text-sm text-ink-0">
            1M of these = <span className="font-mono tabular">{isRevealed ? fmtUsd((pieces.length * c.usdPerMTok * 1e6) / 1e6) : "?"}</span>
          </div>
          <div className="mt-1.5 text-xs leading-snug text-ink-3">Output tokens usually cost several times more than input.</div>
        </Panel>
        <Panel label="Scoreboard">
          <ul className="space-y-1.5 text-[13px]">
            {samples.map((s) => {
              const r = revealed[s.id];
              return (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="text-ink-1">{s.label}</span>
                  <span className="font-mono text-xs tabular text-ink-0">{r ? `${r.guess ?? "–"} → ${r.actual}` : "?"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <p className="text-xs leading-relaxed text-ink-3">
          NINES splits text with o200k, a real byte-pair encoder. It is the vocabulary of the gpt-oss models NINES calls for coaching, so these counts are exact for them (chat formatting adds a few tokens per message). Other model families, Claude included, use their own tokenizers, so the same text counts differently there.
        </p>
      </div>
    </div>
  );
}
