"use client";
/**
 * Section intros: the game-style opener shown the first time you enter a part of NINES (a chapter, the
 * Foundry, the Daily Shift, the Incident Room, the Codex, a boss). An animated scene sets the place; the
 * text says what you're about to do, what you'll learn, and why it matters. Always skippable.
 */
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { sfx } from "@/audio/engine";
import type { CastLine as CastLineT } from "@/content/schema";
import { CastLine } from "@/ui/Cast";
import { Button, cx, Kbd } from "@/ui/kit";
import { useReducedMotion } from "@/ui/motion";
import { SCENES, type SceneId } from "./scenes";

export type IntroTone = "phos" | "lilac" | "alert" | "amber" | "sky";

export interface IntroSpec {
  /** Seen-key suffix: the intro shows once per id unless replayed. */
  id: string;
  kicker: string;
  title: string;
  /** The premise, one line. */
  story: string;
  scene: SceneId;
  tone: IntroTone;
  /** "What you'll learn" (or "What you'll do"), 2–5 short lines. */
  learn: string[];
  learnLabel?: string;
  why: string;
  cast?: CastLineT[];
  cta?: string;
}

const TONE_TEXT: Record<IntroTone, string> = {
  phos: "text-phos",
  lilac: "text-lilac",
  alert: "text-alert",
  amber: "text-amber",
  sky: "text-sky",
};
const TONE_DOT: Record<IntroTone, string> = {
  phos: "bg-phos",
  lilac: "bg-lilac",
  alert: "bg-alert",
  amber: "bg-amber",
  sky: "bg-sky",
};

const ease = [0.22, 1, 0.36, 1] as const;

export function SectionIntro({ spec, onDone }: { spec: IntroSpec; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(reduced);
  const Scene = SCENES[spec.scene];

  const t = (s: number) => (reduced ? 0 : s);
  const finish = useCallback(() => {
    if (leaving) return;
    sfx.unlock();
    sfx.confirm();
    setLeaving(true);
    setTimeout(onDone, reduced ? 0 : 450);
  }, [leaving, onDone, reduced]);

  useEffect(() => {
    sfx.whoosh();
    if (reduced) return;
    const id = setTimeout(() => setReady(true), 3200);
    return () => clearTimeout(id);
  }, [reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if ((e.key === "Enter" || e.key === " ") && ready) {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, ready]);

  const words = spec.title.split(" ");

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${spec.kicker}: ${spec.title}`}
          className="fixed inset-0 z-50 overflow-y-auto bg-bg-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45 } }}
          transition={{ duration: t(0.6) }}
        >
          {/* the scene */}
          <motion.div
            className="pointer-events-none absolute inset-0 h-[55dvh] lg:h-full"
            initial={{ opacity: 0, scale: reduced ? 1 : 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: t(2.4), ease }}
            aria-hidden
          >
            <Scene reduced={reduced} />
          </motion.div>
          {/* legibility wash: text side on desktop, bottom on phones */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_25%,var(--color-bg-0)_58%)] lg:bg-[linear-gradient(to_right,var(--color-bg-0)_30%,rgb(15_21_25/0.75)_48%,transparent_72%)]" aria-hidden />

          <button
            onClick={finish}
            className="absolute right-4 top-4 z-10 rounded-full border border-line-2 bg-bg-1/70 px-3.5 py-1.5 text-[13px] text-ink-1 backdrop-blur hover:text-ink-0 lg:right-8 lg:top-6"
          >
            Skip intro
          </button>

          <div className="relative flex min-h-full flex-col justify-end px-5 pb-10 pt-[46dvh] lg:max-w-[46rem] lg:justify-center lg:px-16 lg:py-16">
            <motion.div className={cx("eyebrow flex items-center gap-2 text-sm", TONE_TEXT[spec.tone])} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: t(0.8), delay: t(0.5), ease }}>
              <span className={cx("inline-block h-1.5 w-1.5 rounded-full", TONE_DOT[spec.tone])} />
              {spec.kicker}
            </motion.div>

            <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.02] text-ink-0 sm:text-6xl lg:text-7xl">
              {words.map((w, i) => (
                <Fragment key={i}>
                  <motion.span
                    className="inline-block"
                    initial={{ opacity: 0, y: reduced ? 0 : 22, filter: reduced ? "none" : "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: t(0.9), delay: t(0.8 + i * 0.12), ease }}
                  >
                    {w}
                  </motion.span>
                  {i < words.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h1>

            <motion.p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: t(0.9), delay: t(1.4) }}>
              {spec.story}
            </motion.p>

            <div className="mt-7 max-w-xl">
              <motion.div className="eyebrow text-xs text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: t(0.6), delay: t(1.9) }}>
                {spec.learnLabel ?? "What you'll learn"}
              </motion.div>
              <ul className="mt-2 space-y-2">
                {spec.learn.map((l, i) => (
                  <motion.li
                    key={i}
                    className="flex items-start gap-3 text-[15px] text-ink-0"
                    initial={{ opacity: 0, x: reduced ? 0 : -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: t(0.7), delay: t(2.1 + i * 0.16), ease }}
                  >
                    <span className={cx("mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[spec.tone])} />
                    <span>{l}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <motion.div
              className="mt-6 max-w-xl rounded-md border border-line/80 bg-bg-1/70 p-4 backdrop-blur-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: t(0.8), delay: t(2.3 + spec.learn.length * 0.16), ease }}
            >
              <div className="eyebrow text-xs text-ink-2">Why it matters</div>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-1">{spec.why}</p>
            </motion.div>

            {spec.cast && spec.cast.length > 0 && (
              <div className="mt-5 max-w-xl space-y-3">
                {spec.cast.map((line, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: t(0.6), delay: t(2.8 + spec.learn.length * 0.16 + i * 0.5) }}>
                    <CastLine line={line} typewriter={false} compact />
                  </motion.div>
                ))}
              </div>
            )}

            <motion.div className="mt-8 flex items-center gap-3" style={{ pointerEvents: ready ? "auto" : "none" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 8 }} transition={{ duration: t(0.6), ease }}>
              <Button variant="primary" size="lg" onClick={finish} sound="none">
                {spec.cta ?? "Begin"}
              </Button>
              <span className="hidden text-[13px] text-ink-3 sm:inline">
                <Kbd>Enter</Kbd>
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
