"use client";
/**
 * The order of first-visit things: briefing, then the sign-in prompt (skippable), then picking a username if you
 * signed in, then the HQ tour. Each waits for the one before it so they never stack or fight for the screen.
 */
import { onboardingOff } from "@/briefing/flags";
import { useAccount } from "@/game/account";
import { useSeen } from "@/game/seen";
import { useSignInUi, useUsernameUi } from "./ui";

export const START_PROMPT_KEY = "signin-start:v1";
const LATER_KEY = "nines:username-later";

export function usernameLaterThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUsernameLater(): void {
  try {
    window.sessionStorage.setItem(LATER_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True once nothing about signing in or choosing a username is still waiting to be shown. */
export function useAccountStepsDone(): boolean {
  const acct = useAccount();
  const startSeen = useSeen(START_PROMPT_KEY);
  const signInOpen = useSignInUi((s) => s.open);
  const usernameOpen = useUsernameUi((s) => s.open);
  if (signInOpen || usernameOpen) return false;
  if (onboardingOff()) return true;
  if (acct.status === "loading") return false;
  if (acct.status === "signed-in") return !!acct.username || usernameLaterThisVisit();
  // A guest: the start prompt has been shown (or can't be, because sign-in isn't available here).
  return startSeen || !(acct.auth.supabase || acct.auth.dev);
}
