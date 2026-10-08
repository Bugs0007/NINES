"use client";
/**
 * A one-time guided tour of the main controls. Each step points at an element tagged data-tour="<id>"; steps
 * whose target isn't on screen are skipped. Skippable, keyboard friendly, and on phones the card docks to the
 * bottom so it never covers what it points at.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { track } from "@/analytics/track";
import { onboardingOff } from "@/briefing/flags";
import { useBriefingUi } from "@/briefing/Briefing";
import { BRIEFING_SEEN_KEY } from "@/briefing/screens";
import { useAccountStepsDone } from "@/account/gate";
import { markSeenEverywhere, useSeen } from "@/game/seen";
import { Button, cx, Kbd } from "@/ui/kit";

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const HQ_TOUR_KEY = "tour:hq:v1";

export const HQ_TOUR: TourStep[] = [
  { target: "uptime", title: "Uptime is your rank", body: "Every service you build and keep fresh adds nines. Let one rust and the number drops." },
  { target: "next-step", title: "Your next step", body: "This card always names the one thing worth doing now. Start here if you're unsure." },
  { target: "map", title: "The map", body: "Each square is a concept. Tap one to see what it needs. Drag to pan, pinch or use + and − to zoom." },
  { target: "dock", title: "The five places", body: "Core Grid and Agent Foundry hold the lessons. Incident Room and Codex sit here too; hover any name for what's inside." },
  { target: "briefing", title: "The story, any time", body: "Briefing replays the Pigeon story. Save progress keeps your game if you want it on another device." },
];

/** Settings → "Take the tour again" sets this; the HQ picks it up. */
export const useTourUi = create<{ requested: boolean; request: () => void; clear: () => void }>()((set) => ({ requested: false, request: () => set({ requested: true }), clear: () => set({ requested: false }) }));

/** Runs the tour on the HQ the first time (after the briefing), or when requested from Settings. */
export function HqTour({ ready }: { ready: boolean }) {
  const seen = useSeen(HQ_TOUR_KEY);
  const briefingSeen = useSeen(BRIEFING_SEEN_KEY);
  const briefingOpen = useBriefingUi((s) => s.open);
  const accountStepsDone = useAccountStepsDone();
  const requested = useTourUi((s) => s.requested);
  const clear = useTourUi((s) => s.clear);
  const [running, setRunning] = useState(false);
  const auto = useRef(false);

  useEffect(() => {
    if (!ready || briefingOpen || running || !accountStepsDone) return;
    if (requested) {
      clear();
      setRunning(true);
      return;
    }
    if (!seen && briefingSeen && !auto.current && !onboardingOff()) {
      auto.current = true;
      // Seen from the moment it starts, so leaving half way never replays it.
      markSeenEverywhere(HQ_TOUR_KEY);
      setRunning(true);
    }
  }, [ready, briefingOpen, accountStepsDone, requested, seen, briefingSeen, running, clear]);

  if (!running) return null;
  return (
    <Tour
      steps={HQ_TOUR}
      onClose={(how) => {
        setRunning(false);
        track(how === "done" ? "tour_done" : "tour_skipped");
      }}
    />
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (how: "done" | "skipped") => void }) {
  const [live, setLive] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Only steps whose target exists right now.
  useEffect(() => {
    const present = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
    if (present.length === 0) closeRef.current("skipped");
    else {
      setLive(present);
      track("tour_started");
    }
  }, [steps]);

  const step = live?.[i];
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    next.current?.focus();
  }, [i, live]);

  const last = !!live && i === live.length - 1;
  const advance = useCallback(() => (last ? closeRef.current("done") : setI((k) => k + 1)), [last]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current("skipped");
      else if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") setI((k) => Math.max(0, k - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  if (!live || !step) return null;
  const pad = 6;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const below = box ? box.y + box.h + 12 + 190 < vh : true;
  return (
    <div role="dialog" aria-modal="true" aria-label="Guided tour" className="fixed inset-0 z-[70]">
      {/* The ring around the target dims everything else. */}
      {box && <div aria-hidden className="pointer-events-none fixed rounded-lg ring-2 ring-amber transition-all duration-300" style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, boxShadow: "0 0 0 9999px rgb(8 12 15 / 0.72)" }} />}
      <div
        className={cx(
          "fixed inset-x-3 bottom-3 rounded-lg border border-line-2 bg-bg-1 p-4 shadow-lift sm:inset-x-auto sm:w-[22rem]",
          // Desktop: next to the target. Phones: docked at the bottom unless the target is down there.
          "sm:bottom-auto",
        )}
        style={
          typeof window !== "undefined" && window.innerWidth >= 640 && box
            ? { left: Math.min(Math.max(12, box.x), window.innerWidth - 22 * 16 - 12), top: below ? box.y + box.h + 14 : Math.max(12, box.y - 14 - 190) }
            : undefined
        }
      >
        <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
          <span className="tabular">
            {i + 1} of {live.length}
          </span>
          <button onClick={() => closeRef.current("skipped")} className="rounded-full px-2 py-0.5 hover:text-ink-0">
            Skip tour
          </button>
        </div>
        <h2 className="mt-1.5 font-display text-xl font-semibold text-ink-0">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-1">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {i > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setI((k) => k - 1)} sound="none">
              Back
            </Button>
          )}
          <Button ref={next} variant="primary" size="sm" onClick={advance} sound="none" className="ml-auto">
            {last ? "Done" : "Next"}
          </Button>
        </div>
        <div className="mt-2 hidden text-[11px] text-ink-3 sm:block">
          <Kbd>←</Kbd> <Kbd>→</Kbd> <Kbd>Esc</Kbd>
        </div>
      </div>
    </div>
  );
}
