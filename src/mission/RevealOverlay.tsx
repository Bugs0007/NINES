"use client";
/**
 * The reveal: your call vs what happened. Confidently wrong gets the loudest treatment in the game.
 * Anchored to the viewport, not the stage: a bottom sheet on phones, a centred card from `sm` up,
 * so it opens where the player is looking and the "Why?" row is always on screen.
 */
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import type { Prediction } from "@/content/schema";
import { surprise, type Confidence } from "@/game/scoring";
import { CastLine } from "@/ui/Cast";
import { Button, cx } from "@/ui/kit";
import { Shake, spring, useReducedMotion } from "@/ui/motion";
import { describeAnswer, describeCall, type Call } from "./PredictPanel";

export function RevealOverlay({ p, call, correct, detail, xp, onDone }: { p: Prediction; call: Call; correct: boolean; detail?: string; xp: number; onDone: () => void }) {
  const s = surprise(correct, call.confidence as Confidence);
  const [shake, setShake] = useState(0);
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sfx.reveal(s);
    if (s > 0.5) setShake(1);
  }, [s]);
  // Move focus into the dialog (not onto the button, which would wear a ring before anyone pressed a key).
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
  }, []);
  const tone = correct ? "phos" : s > 0.5 ? "alert" : "amber";
  const headline = correct ? "Called it." : s > 0.5 ? "Confidently wrong." : "Not quite.";
  return (
    <motion.div
      ref={dialog}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg-0/75 pt-3 outline-none backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Prediction result"
    >
      {!correct && s > 0.5 && !reduced && <motion.div className="pointer-events-none absolute inset-0 bg-alert/10" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} />}
      <Shake trigger={shake} intensity={1.2} className="w-full max-w-lg">
        <motion.div
          initial={{ scale: reduced ? 1 : 0.97, y: reduced ? 0 : 24 }}
          animate={{ scale: 1, y: 0 }}
          transition={reduced ? { duration: 0.15 } : spring.soft}
          className={cx(
            "max-h-[calc(100dvh-0.75rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-xl border border-b-0 bg-bg-1 px-5 pt-5 shadow-lift sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl sm:border-b sm:px-6 sm:pt-6",
            tone === "phos" ? "border-phos-3/60 shadow-glow-phos" : tone === "alert" ? "border-alert-3/60 shadow-glow-alert" : "border-amber-3/60 shadow-glow-amber",
          )}
        >
          <h2 className={cx("font-display text-4xl font-semibold leading-tight", tone === "phos" ? "text-phos" : tone === "alert" ? "text-alert" : "text-amber")}>
            <motion.span
              className="inline-block"
              initial={{ opacity: 0, y: reduced ? 0 : 6, filter: reduced ? "none" : "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: correct ? 0.4 : 0.7, ease: "easeOut" }}
            >
              {headline}
            </motion.span>
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-line/70 bg-bg-2/60 p-3.5">
              <div className="eyebrow text-xs text-ink-2">
                You said · <span className="tabular">{call.confidence}%</span> sure
              </div>
              <div className={cx("mt-1 text-sm leading-snug", correct ? "text-ink-0" : "text-ink-1 line-through decoration-alert/50")}>{describeCall(p, call.value)}</div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: reduced ? 1 : 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.soft, delay: 0.25 }}
              className={cx("rounded-md border p-3.5", tone === "phos" ? "border-phos-3/50 bg-phos-dim/40" : "border-line-3/60 bg-bg-3/70")}
            >
              <div className="eyebrow text-xs text-ink-2">Reality</div>
              <div className="mt-1 text-sm font-medium leading-snug text-ink-0">{describeAnswer(p)}</div>
            </motion.div>
          </div>
          {detail && <div className="mt-2.5 text-[13px] text-ink-2">{detail}</div>}
          <p className="mt-5 text-[15px] leading-relaxed text-ink-0">{p.reveal.text}</p>
          {p.reveal.line && <CastLine className="mt-5" line={p.reveal.line} />}
          {/* The action row stays pinned to the bottom of the card while the explanation scrolls. */}
          <div className="sticky bottom-0 -mx-5 mt-6 flex items-center justify-between gap-3 border-t border-line/60 bg-bg-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:-mx-6 sm:px-6 sm:pb-6">
            <span className={cx("text-sm", xp > 0 ? "font-semibold tabular text-phos" : "text-ink-2")}>{xp > 0 ? `+${xp} XP` : "No XP · but now you know"}</span>
            <Button variant="primary" onClick={onDone}>
              Why?
            </Button>
          </div>
        </motion.div>
      </Shake>
    </motion.div>
  );
}
