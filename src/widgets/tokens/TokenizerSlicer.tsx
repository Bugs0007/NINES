"use client";
/**
 * Tokenizer Slicer: guess the token count, then watch the text split. English vs Telugu vs code vs JSON.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { claudeStatus, claudeTokenCount } from "@/claude/client";
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

const CHIP_TONES = ["bg-phos/20 border-phos-3", "bg-amber/20 border-amber-3", "bg-ink-2/20 border-line-3"];

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
          className={cx("whitespace-pre rounded-[2px] border px-[3px] py-[1px] text-ink-0", CHIP_TONES[i % CHIP_TONES.length])}
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
  const [claude, setClaude] = useState<Record<string, number | null>>({});
  const [keyOn, setKeyOn] = useState(false);
  const fired = useRef(new Set<string>());
  const text = sel === "custom" ? custom : samples.find((s) => s.id === sel)?.text ?? "";
  const pieces = useMemo(() => (tok && text ? tok.encode(text).map((id) => tok.decode([id])) : []), [tok, text]);
  const isRevealed = sel === "custom" ? !!custom : !!revealed[sel];

  useEffect(() => {
    void claudeStatus().then((s) => setKeyOn(!!s?.enabled));
  }, []);
  useEffect(() => {
    if (scene === "scripts") setSel("te");
    if (scene === "strawberry") setSel("straw");
  }, [scene]);

  const fire = (e: string) => {
    if (fired.current.has(e)) return;
    fired.current.add(e);
    onObserve?.(e);
  };

  const slice = async () => {
    if (!tok) return;
    const g = Number(guess);
    setRevealed((r) => ({ ...r, [sel]: { guess: Number.isFinite(g) && guess ? g : null, actual: pieces.length } }));
    sfx.whoosh();
    setGuess("");
    fire("sliced");
    if (sel === "te" || sel === "hi") fire("script-gap");
    if (sel === "json") fire("json-dense");
    if (sel === "straw") fire("strawberry");
    if (keyOn) {
      const n = await claudeTokenCount(text);
      setClaude((cc) => ({ ...cc, [sel]: n }));
    }
  };

  const en = revealed["en"]?.actual;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sample text">
          {samples.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sel === s.id}
              onClick={() => setSel(s.id)}
              className={cx("h-8 rounded-[2px] border px-2.5 font-mono text-2xs uppercase tracking-[0.08em]", sel === s.id ? "border-amber bg-amber text-bg-0" : revealed[s.id] ? "border-phos-3 text-phos" : "border-line-2 text-ink-1 hover:border-line-3")}
            >
              {s.label}
              {revealed[s.id] ? ` · ${revealed[s.id]!.actual}` : ""}
            </button>
          ))}
          <button role="tab" aria-selected={sel === "custom"} onClick={() => setSel("custom")} className={cx("h-8 rounded-[2px] border px-2.5 font-mono text-2xs uppercase tracking-[0.08em]", sel === "custom" ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1")}>
            your text
          </button>
        </div>
        <Panel label="text" className="flex-1" bodyClassName="flex h-full flex-col gap-3">
          {sel === "custom" ? (
            <textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={4} aria-label="Your text" placeholder="Paste anything: a prompt, a log line, a paragraph in Telugu…" className="rounded-sm border border-line-2 bg-bg-0 p-2 font-mono text-sm text-ink-0 outline-none focus:border-amber" />
          ) : (
            <p className="text-lg text-ink-0">{text}</p>
          )}
          <div className="font-mono text-2xs text-ink-2">{[...text].length} characters</div>
          <AnimatePresence mode="wait">
            {isRevealed && tok ? (
              <motion.div key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                <TokenChips pieces={pieces} animate={sel !== "custom"} />
                <div className="flex flex-wrap items-center gap-2 font-mono text-2xs text-ink-2">
                  <Chip tone="ok">{pieces.length} tokens · BPE proxy (o200k)</Chip>
                  {claude[sel] != null && <Chip tone="warn">Claude: {claude[sel]} tokens (exact)</Chip>}
                  <span>{([...text].length / Math.max(1, pieces.length)).toFixed(1)} characters per token</span>
                  {en && sel !== "en" && sel !== "custom" && <span>· {(pieces.length / en).toFixed(1)}× the English message</span>}
                </div>
                {revealed[sel]?.guess != null && (
                  <div className="font-mono text-xs text-ink-1">
                    you guessed {revealed[sel]!.guess} ·{" "}
                    <span className={magnitudeError(revealed[sel]!.guess!, pieces.length) < 0.1 ? "text-phos" : "text-amber"}>
                      {magnitudeError(revealed[sel]!.guess!, pieces.length) < 0.1 ? "within 25%" : `off by ${Math.pow(10, magnitudeError(revealed[sel]!.guess!, pieces.length)).toFixed(1)}×`}
                    </span>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className={cx("flex flex-wrap items-end gap-2", (locked || mode === "preview") && "pointer-events-none opacity-40")}>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">your guess</span>
                  <input value={guess} onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Guess the token count" className="h-10 w-28 rounded-sm border border-line-2 bg-bg-0 px-2 font-mono text-lg tabular text-amber outline-none focus:border-amber" />
                </label>
                <Button variant="go" onClick={slice} disabled={!tok} sound="none">
                  {tok ? "Slice it" : "loading tokenizer…"}
                </Button>
              </div>
            )}
          </AnimatePresence>
        </Panel>
      </div>
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label="what it costs">
          <div className="font-mono text-2xs text-ink-2">at ${c.usdPerMTok} per million input tokens</div>
          <div className="mt-1 font-mono text-sm text-ink-0">1M of these = {isRevealed ? fmtUsd((pieces.length * c.usdPerMTok * 1e6) / 1e6) : "?"}</div>
          <div className="mt-1 font-mono text-[10px] text-ink-3">Output tokens usually cost several times more than input.</div>
        </Panel>
        <Panel label="scoreboard">
          <ul className="space-y-1 font-mono text-xs">
            {samples.map((s) => {
              const r = revealed[s.id];
              return (
                <li key={s.id} className="flex justify-between">
                  <span className="text-ink-1">{s.label}</span>
                  <span className="tabular text-ink-0">{r ? `${r.guess ?? "–"} → ${r.actual}` : "?"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <p className="text-xs text-ink-3">
          Offline, NINES splits text with o200k, a real byte-pair encoder. Claude uses its own tokenizer, so exact counts differ{keyOn ? "; with your key, the Claude count comes from the token-counting API." : ". Add an API key to see Claude's exact counts."}
        </p>
      </div>
    </div>
  );
}
