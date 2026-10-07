"use client";
/**
 * The nudge after a guest's first completed level: save your progress by signing in. Shown once, never blocks
 * play, and level 1 itself is never behind it. "Not now" is remembered in the save.
 */
import { useEffect } from "react";
import { track } from "@/analytics/track";
import { useAccount } from "@/game/account";
import { useGame } from "@/game/store";
import { Button } from "@/ui/kit";
import { useSignInUi } from "./ui";

export const SIGNUP_PROMPT_KEY = "signup-prompt:v1";

export function SavePrompt({ firstLevel }: { firstLevel: boolean }) {
  const acct = useAccount();
  const seen = useGame((s) => s.profile.seen.includes(SIGNUP_PROMPT_KEY));
  const markSeen = useGame((s) => s.markSeen);
  const show = useSignInUi((s) => s.show);
  const eligible = firstLevel && acct.status === "guest" && (acct.auth.supabase || acct.auth.dev) && !seen;

  useEffect(() => {
    if (eligible) track("signup_prompt_shown");
  }, [eligible]);

  if (!eligible) return null;
  return (
    <div className="rounded-lg border border-amber-3/70 bg-amber-dim/30 p-5 shadow-card" role="region" aria-label="Save your progress">
      <div className="eyebrow text-xs text-amber">First level done</div>
      <p className="mt-1.5 font-display text-xl font-semibold leading-snug text-ink-0">Want to keep this?</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-1">Your progress is saved in this browser. Sign in with Google or an emailed link and it follows you to any device. Nothing is locked either way.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            void markSeen(SIGNUP_PROMPT_KEY);
            show("first-level");
          }}
        >
          Save my progress
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void markSeen(SIGNUP_PROMPT_KEY);
            track("signup_prompt_dismissed");
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
