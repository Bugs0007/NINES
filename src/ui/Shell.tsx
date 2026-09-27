"use client";
/**
 * App shell: hydrates game state, applies settings (audio, reduced motion), unlocks audio on first gesture.
 */
import { useEffect, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import { setTimeWarp } from "@/game/clock";
import { useGame } from "@/game/store";
import { useReducedMotion } from "./motion";

export function Shell({ children }: { children: ReactNode }) {
  const hydrate = useGame((s) => s.hydrate);
  const audio = useGame((s) => s.profile.settings.audio);
  const rmPref = useGame((s) => s.profile.settings.reducedMotion);
  const warp = useGame((s) => s.profile.settings.timeWarpDays ?? 0);
  setTimeWarp(warp);
  const reduced = useReducedMotion();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    sfx.apply(audio);
  }, [audio]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = rmPref === "system" ? "system" : rmPref === "on" ? "true" : "false";
  }, [rmPref]);

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <>
      {!reduced && <div className="scanband" aria-hidden />}
      {children}
    </>
  );
}
