"use client";
/**
 * The reveal: your call vs what happened. Confidently wrong gets the loudest treatment in the game.
 */
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { sfx } from "@/audio/engine";
import type { Prediction } from "@/content/schema";
import { surprise, type Confidence } from "@/game/scoring";
import { CastLine } from "@/ui/Cast";
import { Button, cx } from "@/ui/kit";
import { GlitchText, Shake, spring, useReducedMotion } from "@/ui/motion";
import { describeAnswer, describeCall, type Call } from "./PredictPanel";

export function RevealOverlay({ p, call, correct, detail, xp, onDone }: { p: Prediction; call: Call; correct: boolean; detail?: string; xp: number; onDone: () => void }) {
  const s = surprise(correct, call.confidence as Confidence);
  const [shake, setShake] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    sfx.reveal(s);
    if (s > 0.5) setShake(1);
  }, [s]);
  const tone = correct ? "phos" : s > 0.5 ? "alert" : "amber";
  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/80 p-3 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Prediction result"
    >
      {!correct && s > 0.5 && !reduced && <motion.div className="pointer-events-none absolute inset-0 bg-alert/15" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.6 }} />}
      <Shake trigger={shake} intensity={1.4} className="w-full max-w-lg">
        <motion.div
          initial={{ scale: 0.94, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={spring.heavy}
          className={cx(
            "rounded-sm border bg-bg-1 p-5",
            tone === "phos" ? "border-phos-3 shadow-glow-phos" : tone === "alert" ? "border-alert-3 shadow-glow-alert" : "border-amber-3 shadow-glow-amber",
          )}
        >
          <div className={cx("font-display text-4xl font-extrabold uppercase leading-none", tone === "phos" ? "text-phos glow-phos" : tone === "alert" ? "text-alert glow-alert" : "text-amber glow-amber")}>
            <GlitchText text={correct ? "Called it." : s > 0.5 ? "Confidently wrong." : "Not quite."} duration={correct ? 0.35 : 0.8} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-sm border border-line-2 bg-bg-2 p-2.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">You said · {call.confidence}% sure</div>
              <div className={cx("mt-0.5 text-sm", correct ? "text-ink-0" : "text-ink-1 line-through decoration-alert/60")}>{describeCall(p, call.value)}</div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: reduced ? 1 : 1.3 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.heavy, delay: 0.25 }}
              className="rounded-sm border border-line-3 bg-bg-3 p-2.5"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">Reality</div>
              <div className="mt-0.5 text-sm font-medium text-ink-0">{describeAnswer(p)}</div>
            </motion.div>
          </div>
          {detail && <div className="mt-2 font-mono text-2xs text-ink-2">{detail}</div>}
          <p className="mt-4 text-[15px] leading-snug text-ink-0">{p.reveal.text}</p>
          {p.reveal.line && <CastLine className="mt-4" line={p.reveal.line} />}
          <div className="mt-5 flex items-center justify-between">
            <span className={cx("font-mono text-xs", xp > 0 ? "text-phos" : "text-ink-3")}>{xp > 0 ? `+${xp} XP` : "no XP · but now you know"}</span>
            <Button variant="primary" onClick={onDone} autoFocus>
              Why?
            </Button>
          </div>
        </motion.div>
      </Shake>
    </motion.div>
  );
}
