"use client";
/**
 * App shell: hydrates game state, applies settings (audio, reduced motion), unlocks audio on first gesture.
 * Also the quiet top bar shared by the secondary screens (chapter, Codex, settings).
 */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import { setTimeWarp } from "@/game/clock";
import { useGame } from "@/game/store";
import { useProgressSync } from "@/game/sync";
import { AccountButton } from "@/account/AccountButton";
import { SignInDialog } from "@/account/SignInDialog";
import { StartPrompt } from "@/account/StartPrompt";
import { UsernameDialog } from "@/account/UsernameDialog";
import { Analytics } from "@/analytics/Analytics";
import { AccountProvider } from "@/game/account";
import { BriefingHost } from "@/briefing/Briefing";
import { BriefingButton } from "@/briefing/BriefingButton";
import { useReducedMotion } from "./motion";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <ShellInner>{children}</ShellInner>
    </AccountProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  useProgressSync();
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
      {children}
      <BriefingHost />
      <SignInDialog />
      <UsernameDialog />
      <StartPrompt />
      <Analytics />
    </>
  );
}

/** Top bar for a secondary screen: a back link, the screen's name, and an optional quiet action on the right. */
export function PageBar({
  backHref,
  backLabel,
  backAria,
  title,
  titleAs: Title = "span",
  right,
}: {
  backHref: string;
  backLabel: string;
  backAria?: string;
  title?: ReactNode;
  titleAs?: "h1" | "span";
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/70 px-4 lg:px-8">
      <Link
        href={backHref}
        aria-label={backAria}
        className="-ml-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-ink-2 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0"
      >
        <span aria-hidden>←</span>
        {backLabel}
      </Link>
      {title && (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-line-2" />
          <Title className="min-w-0 truncate font-display text-lg font-semibold text-ink-0">{title}</Title>
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <BriefingButton />
        {right}
        <AccountButton />
      </div>
    </header>
  );
}
