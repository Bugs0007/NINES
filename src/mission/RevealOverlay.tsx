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
import { Shake, spring, useReducedMotion } from "@/ui/motion";
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
  const headline = correct ? "Called it." : s > 0.5 ? "Confidently wrong." : "Not quite.";
  return (
    <motion.div
      className="absolute inset-0 z-30 flex overflow-y-auto bg-bg-0/75 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Prediction result"
    >
      {!correct && s > 0.5 && !reduced && <motion.div className="pointer-events-none absolute inset-0 bg-alert/10" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }} />}
      <Shake trigger={shake} intensity={1.2} className="m-auto w-full max-w-lg">
        <motion.div
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={spring.heavy}
          className={cx(
            "rounded-xl border bg-bg-1 p-6 shadow-lift",
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
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line/60 pt-5">
            <span className={cx("text-sm", xp > 0 ? "font-semibold tabular text-phos" : "text-ink-3")}>{xp > 0 ? `+${xp} XP` : "No XP · but now you know"}</span>
            <Button variant="primary" onClick={onDone} autoFocus>
              Why?
            </Button>
          </div>
        </motion.div>
      </Shake>
    </motion.div>
  );
}
