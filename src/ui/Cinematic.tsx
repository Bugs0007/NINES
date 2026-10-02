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
import { GlitchText, spring, useReducedMotion } from "./motion";

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
  return (
    <motion.div
      className={cx("fixed inset-0 z-[70] flex items-center justify-center p-6", tone === "alert" ? "bg-[#1f1614]/95" : "bg-bg-0/95")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic"
      onClick={() => (i + 1 < frames.length ? setI(i + 1) : finish())}
    >
      {tone === "alert" && !reduced && <motion.div className="pointer-events-none absolute inset-0 border-[6px] border-alert/60" animate={{ opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 1.4, repeat: Infinity }} />}
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {f && (
            <motion.div key={i} initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduced ? 0 : -10 }} transition={spring.soft}>
              {f.kind === "title" && (
                <div className="text-center">
                  <div className={cx("eyebrow text-2xs", f.tone === "alert" ? "text-alert" : f.tone === "amber" ? "text-amber" : "text-phos")}>{f.kicker}</div>
                  <h1
                    className={cx(
                      "mt-3 text-[clamp(3rem,12vw,7rem)] font-extrabold leading-[0.9] tracking-tight",
                      "font-display",
                      f.tone === "alert" ? "text-alert glow-alert" : f.tone === "amber" ? "text-amber glow-amber" : f.tone === "phos" ? "text-phos glow-phos" : "text-ink-0",
                    )}
                  >
                    <GlitchText text={f.title} duration={0.7} />
                  </h1>
                  {f.sub && <div className="mt-3 font-mono text-sm text-ink-1">{f.sub}</div>}
                </div>
              )}
              {f.kind === "line" && <CastLine line={f.line} className="mx-auto max-w-lg" />}
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
        className="absolute bottom-5 right-5 eyebrow text-2xs text-ink-2 hover:text-amber"
      >
        Skip ⟶
      </button>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
        {frames.map((_, k) => (
          <span key={k} className={cx("h-1 w-5 rounded-full", k <= i ? "bg-amber" : "bg-line-2")} />
        ))}
      </div>
    </motion.div>
  );
}
