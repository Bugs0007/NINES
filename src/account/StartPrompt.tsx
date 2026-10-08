"use client";
/**
 * Offers sign-in right after the Pigeon briefing, once. "Continue as a guest" is always there and level 1 is never
 * behind it. Marked seen the moment it appears, so a reload doesn't bring it back.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { onboardingOff } from "@/briefing/flags";
import { useBriefingUi } from "@/briefing/Briefing";
import { BRIEFING_SEEN_KEY } from "@/briefing/screens";
import { track } from "@/analytics/track";
import { useAccount } from "@/game/account";
import { markSeenEverywhere, useSeen } from "@/game/seen";
import { useGame } from "@/game/store";
import { START_PROMPT_KEY } from "./gate";
import { useSignInUi } from "./ui";

const QUIET_PATHS = ["/dev", "/admin", "/privacy", "/auth"];

export function StartPrompt() {
  const hydrated = useGame((s) => s.hydrated);
  const acct = useAccount();
  const briefingSeen = useSeen(BRIEFING_SEEN_KEY);
  const briefingOpen = useBriefingUi((s) => s.open);
  const startSeen = useSeen(START_PROMPT_KEY);
  const show = useSignInUi((s) => s.show);
  const path = usePathname();

  useEffect(() => {
    if (!hydrated || onboardingOff() || startSeen || briefingOpen || !briefingSeen) return;
    if (acct.status !== "guest" || !(acct.auth.supabase || acct.auth.dev)) return;
    if (QUIET_PATHS.some((p) => path.startsWith(p))) return;
    markSeenEverywhere(START_PROMPT_KEY);
    track("signup_prompt_shown", { where: "start" });
    show("start");
  }, [hydrated, acct.status, acct.auth.supabase, acct.auth.dev, briefingSeen, briefingOpen, startSeen, path, show]);

  return null;
}
