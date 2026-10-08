"use client";
/**
 * The briefing: four short screens, skippable at any point, replayable from the "Briefing" button.
 * First visit: opens by itself once (the seen flag lives in the save). Reduced motion: no animation.
 */
import { AnimatePresence, motion } from "motion/react";
import { create } from "zustand";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/analytics/track";
import { sfx } from "@/audio/engine";
import { SCENES } from "@/intro/scenes";
import { useGame } from "@/game/store";
import { CastLine } from "@/ui/Cast";
import { Button, cx, Kbd } from "@/ui/kit";
import { useReducedMotion } from "@/ui/motion";
import { onboardingOff } from "./flags";
import { BRIEFING, BRIEFING_SEEN_KEY, briefingMap } from "./screens";

interface BriefingUi {
  open: boolean;
  show: () => void;
  hide: () => void;
}
export const useBriefingUi = create<BriefingUi>()((set) => ({ open: false, show: () => set({ open: true }), hide: () => set({ open: false }) }));

const TONE: Record<string, { text: string; dot: string }> = {
  phos: { text: "text-phos", dot: "bg-phos" },
  lilac: { text: "text-lilac", dot: "bg-lilac" },
  alert: { text: "text-alert", dot: "bg-alert" },
  amber: { text: "text-amber", dot: "bg-amber" },
  sky: { text: "text-sky", dot: "bg-sky" },
};

/** Where the briefing opens by itself on a first visit. Not on internal or legal pages. */
const QUIET_PATHS = ["/dev", "/admin", "/privacy", "/auth"];

/** Mounted once in the app shell: opens the briefing on a first visit and renders it when asked. */
export function BriefingHost() {
  const hydrated = useGame((s) => s.hydrated);
  const seen = useGame((s) => s.profile.seen.includes(BRIEFING_SEEN_KEY));
  const markSeen = useGame((s) => s.markSeen);
  const open = useBriefingUi((s) => s.open);
  const show = useBriefingUi((s) => s.show);
  const hide = useBriefingUi((s) => s.hide);
  const path = usePathname();
  const auto = useRef(false);

  useEffect(() => {
    if (!hydrated || seen || auto.current || onboardingOff()) return;
    if (QUIET_PATHS.some((p) => path.startsWith(p))) return;
    auto.current = true;
    show();
  }, [hydrated, seen, path, show]);

  if (!open) return null;
  return (
    <Briefing
      onClose={(how) => {
        hide();
        if (!seen) void markSeen(BRIEFING_SEEN_KEY);
        track(how === "done" ? "briefing_done" : "briefing_skipped");
      }}
    />
  );
}

export function Briefing({ onClose }: { onClose: (how: "done" | "skipped") => void }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const screen = BRIEFING[i]!;
  const last = i === BRIEFING.length - 1;
  const Scene = SCENES[screen.scene];
  const tone = TONE[screen.tone]!;
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => track("briefing_started"), []);
  useEffect(() => {
    sfx.whoosh();
  }, []);
  useEffect(() => {
    primary.current?.focus();
  }, [i]);

  const go = useCallback(
    (to: number) => {
      setDir(to > i ? 1 : -1);
      setI(Math.max(0, Math.min(BRIEFING.length - 1, to)));
    },
    [i],
  );
  const next = useCallback(() => {
    sfx.unlock();
    if (last) {
      sfx.confirm();
      onClose("done");
    } else go(i + 1);
  }, [go, i, last, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("skipped");
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i, next, onClose]);

  const t = reduced ? 0 : 0.45;
  const rows = briefingMap(screen);

  return (
    <div role="dialog" aria-modal="true" aria-label="Briefing" className="fixed inset-0 z-[60] overflow-y-auto bg-bg-0">
      <div className="pointer-events-none absolute inset-0 h-[48dvh] lg:h-full" aria-hidden>
        <Scene reduced={reduced} />
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_20%,var(--color-bg-0)_50%)] lg:bg-[linear-gradient(to_right,var(--color-bg-0)_32%,rgb(15_21_25/0.75)_50%,transparent_74%)]"
        aria-hidden
      />
      <button
        onClick={() => onClose("skipped")}
        className="absolute right-4 top-4 z-10 rounded-full border border-line-2 bg-bg-1/70 px-3.5 py-1.5 text-[13px] text-ink-1 backdrop-blur hover:text-ink-0 lg:right-8 lg:top-6"
      >
        Skip briefing
      </button>

      <div className="relative flex min-h-full flex-col justify-end px-5 pb-8 pt-[40dvh] lg:max-w-[44rem] lg:justify-center lg:px-16 lg:py-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen.id}
            initial={{ opacity: 0, x: reduced ? 0 : 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -24 * dir }}
            transition={{ duration: t, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={cx("eyebrow flex items-center gap-2 text-sm", tone.text)}>
              <span className={cx("inline-block h-1.5 w-1.5 rounded-full", tone.dot)} />
              {screen.kicker}
            </div>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.05] text-ink-0 sm:text-5xl lg:text-6xl">{screen.title}</h1>
            {screen.lines.length > 0 && (
              <div className="mt-4 max-w-xl space-y-2 text-lg leading-relaxed text-ink-1">
                {screen.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <ul className="mt-5 grid max-w-xl grid-cols-1 gap-2">
                {rows.map((r) => (
                  <li key={r.section} title={r.label} className="rounded-md border border-line/70 bg-bg-1/70 px-3.5 py-2.5 backdrop-blur-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                      <span className="font-display font-semibold text-ink-0">{r.name}</span>
                      <span className="text-[13px] text-ink-2">{r.department}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] leading-snug text-ink-1">{r.crisis}</div>
                  </li>
                ))}
              </ul>
            )}
            {screen.cast && <CastLine line={screen.cast} typewriter={false} compact className="mt-5 max-w-xl" />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-7 flex max-w-xl items-center gap-3">
          <ol className="flex items-center gap-1.5" aria-label={`Screen ${i + 1} of ${BRIEFING.length}`}>
            {BRIEFING.map((b, k) => (
              <li key={b.id}>
                <button
                  onClick={() => go(k)}
                  aria-label={`Go to screen ${k + 1}: ${b.title}`}
                  aria-current={k === i ? "step" : undefined}
                  className="grid h-6 w-5 place-items-center"
                >
                  <span className={cx("block h-1.5 rounded-full transition-all duration-300", k === i ? cx("w-5", tone.dot) : "w-2.5 bg-line-3")} />
                </button>
              </li>
            ))}
          </ol>
          <div className="ml-auto flex items-center gap-2">
            {i > 0 && (
              <Button variant="ghost" size="lg" onClick={() => go(i - 1)} sound="none">
                Back
              </Button>
            )}
            <Button ref={primary} variant="primary" size="lg" onClick={next} sound="none">
              {last ? "Show me HQ" : "Next"}
            </Button>
          </div>
        </div>
        <div className="mt-3 hidden max-w-xl text-xs text-ink-3 sm:block">
          <Kbd>←</Kbd> <Kbd>→</Kbd> to move, <Kbd>Esc</Kbd> to skip. Replay it any time with the Briefing button.
        </div>
      </div>
    </div>
  );
}
