"use client";
/**
 * A standing but dismissible invitation on the HQ screen for guests: sign in to keep progress on every device.
 * It waits for the first-visit steps (briefing, start prompt, tour) so nothing stacks, and "Not now" hides it for
 * the rest of the visit. Level 1 and everything else stay open to guests either way.
 */
import { useState } from "react";
import { useAccount } from "@/game/account";
import { Button } from "@/ui/kit";
import { useAccountStepsDone } from "./gate";
import { useSignInUi } from "./ui";

const DISMISS_KEY = "nines:home-signin-dismissed";

export function HomeSignInBanner() {
  const acct = useAccount();
  const stepsDone = useAccountStepsDone();
  const show = useSignInUi((u) => u.show);
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (hidden || !stepsDone || acct.status !== "guest" || !(acct.auth.supabase || acct.auth.dev)) return null;

  return (
    <section aria-label="Sign in" data-testid="home-signin" className="mx-4 mt-3 lg:mx-8">
      <div className="flex flex-col gap-3 rounded-lg border border-line/80 bg-bg-1/75 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-ink-1">
          <span className="font-semibold text-ink-0">Keep your progress on every device.</span> Sign in with Google and your game follows you. What you have done so far is kept.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" onClick={() => show("manual")}>
            Sign in
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setHidden(true);
              try {
                window.sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {
                /* ignore */
              }
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </section>
  );
}
