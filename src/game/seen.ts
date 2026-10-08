"use client";
/**
 * "Has this player already seen X?" for first-visit things (the briefing, the tour, the sign-in prompt).
 *
 * The answer lives in two places on purpose: the save (profile.seen, which follows a signed-in player across
 * devices) and a plain localStorage flag on this browser. A save can be replaced (an import from the server, a
 * reset, a restored backup) and a first-visit overlay must never come back because of that, so either source
 * saying "seen" is enough. Mark things seen when they START, not when they finish: leaving mid-way (reload, back
 * button, closing the tab) must not make them play again.
 */
import { useGame } from "./store";

const PREFIX = "nines:seen:";

export function seenLocally(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export function markSeenEverywhere(key: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, "1");
  } catch {
    /* storage blocked: the save still remembers it */
  }
  void useGame.getState().markSeen(key);
}

export function useSeen(key: string): boolean {
  const inSave = useGame((s) => s.profile.seen.includes(key));
  return inSave || seenLocally(key);
}
