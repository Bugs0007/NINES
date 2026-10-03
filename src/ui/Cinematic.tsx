"use client";
/**
 * Short, skippable cinematics for big moments: chapter intros, boss intros, rank-ups, outages, recoveries.
 * Frames auto-advance; Esc, Enter, or tapping skips. Reduced motion shows the frames as a static card.
 */
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import type { CastLine as CastLineT } from "@/content/schema";
import { CastLine } from "./Cast";
import { cx } from "./kit";
import { spring, useReducedMotion } from "./motion";
import { alpha, PALETTE } from "./palette";

export type Frame =
  | { kind: "title"; kicker: string; title: string; sub?: string; tone?: "phos" | "amber" | "alert"; ms?: number; stencil?: boolean }
  | { kind: "line"; line: CastLineT; ms?: number }
  | { kind: "custom"; node: ReactNode; ms?: number };

export function Cinematic({ frames, onDone, sound = "whoosh", tone = "default" }: { frames: Frame[]; onDone: () => void; sound?: "whoosh" | "alarm" | "rank" | "none"; tone?: "default" | "alert" }) {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  const finish = useCallback(() => {
    sfx.alarm(false);
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (sound === "whoosh") sfx.whoosh();
    if (sound === "alarm") sfx.pager();
    if (sound === "rank") sfx.rankUp();
  }, [sound]);

  useEffect(() => {
    const f = frames[i];
    if (!f) return;
    const ms = f.ms ?? (f.kind === "line" ? 1400 + f.line.line.length * 38 : 2200);
    const t = setTimeout(() => (i + 1 < frames.length ? setI(i + 1) : finish()), reduced ? ms * 1.5 : ms);
    return () => clearTimeout(t);
  }, [i, frames, finish, reduced]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (i + 1 < frames.length) setI(i + 1);
        else finish();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, frames.length, finish]);

  const f = frames[i];
  const toneText = (t?: "phos" | "amber" | "alert") => (t === "alert" ? "text-alert" : t === "amber" ? "text-amber" : t === "phos" ? "text-phos" : "text-ink-0");
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bg-0/95 px-6 py-16 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic"
      onClick={() => (i + 1 < frames.length ? setI(i + 1) : finish())}
    >
      {/* A slow coral dusk for alarms instead of a flashing border. */}
      {tone === "alert" && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(70% 60% at 50% 45%, ${alpha(PALETTE.alert, 0.13)}, transparent 70%), radial-gradient(120% 90% at 50% 100%, ${alpha(PALETTE.alertDim, 0.6)}, transparent 70%)` }}
          animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="relative w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {f && (
            <motion.div key={i} initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={spring.soft}>
              {f.kind === "title" && (
                <div className="text-center">
                  <div className={cx("eyebrow text-[13px]", f.tone ? toneText(f.tone) : "text-phos")}>{f.kicker}</div>
                  <h1 className={cx("mt-4 text-balance font-display text-[clamp(2.75rem,10vw,5.5rem)] font-semibold leading-[1.02]", toneText(f.tone))}>
                    <motion.span
                      className="inline-block"
                      initial={{ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "none" : "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                    >
                      {f.title}
                    </motion.span>
                  </h1>
                  {f.sub && <p className="mx-auto mt-5 max-w-lg text-pretty text-base leading-relaxed text-ink-1 tabular">{f.sub}</p>}
                </div>
              )}
              {f.kind === "line" && (
                <div className="mx-auto max-w-lg rounded-xl border border-line/70 bg-bg-1/80 p-5 shadow-lift">
                  <CastLine line={f.line} />
                </div>
              )}
              {f.kind === "custom" && f.node}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute bottom-5 right-5 rounded-full border border-line-2/70 bg-bg-1/70 px-4 py-1.5 text-[13px] font-medium text-ink-1 transition-colors hover:border-amber-3 hover:text-amber"
      >
        Skip →
      </button>
      <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5" aria-hidden>
        {frames.map((_, k) => (
          <span key={k} className={cx("h-1.5 rounded-full transition-all duration-300", k === i ? "w-5 bg-amber" : k < i ? "w-1.5 bg-amber-3" : "w-1.5 bg-line-3")} />
        ))}
      </div>
    </motion.div>
  );
}
