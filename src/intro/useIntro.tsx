"use client";
/**
 * Show a section intro once (the first time a player enters), with a replay handle for "Replay intro".
 * Seen state lives in the save (profile.seen: "intro:<spec id>").
 */
import { useState, type ReactNode } from "react";
import { useGame } from "@/game/store";
import { SectionIntro, type IntroSpec } from "./SectionIntro";

export function useIntro(spec: IntroSpec | null): { node: ReactNode; replay: () => void; showing: boolean } {
  const hydrated = useGame((s) => s.hydrated);
  const seen = useGame((s) => (spec ? s.profile.seen.includes(`intro:${spec.id}`) : true));
  const markSeen = useGame((s) => s.markSeen);
  const [forced, setForced] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showing = !!spec && hydrated && (forced || (!seen && !dismissed));
  const node = showing ? (
    <SectionIntro
      spec={spec}
      onDone={() => {
        setDismissed(true);
        setForced(false);
        if (!seen) void markSeen(`intro:${spec.id}`);
      }}
    />
  ) : null;
  return { node, replay: () => setForced(true), showing };
}
