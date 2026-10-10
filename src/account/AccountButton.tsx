"use client";
/**
 * The account control for the top-right of every screen: the player's @username (or first name) when signed in,
 * a "Sign in" button for guests. Used by the HQ top bar and by PageBar, so it is the same everywhere.
 */
import Link from "next/link";
import { useAccount } from "@/game/account";
import { cx } from "@/ui/kit";
import { useSignInUi } from "./ui";

const BASE = "inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium transition-colors duration-200 hover:bg-bg-2";

function label(username: string | null, name: string | null): string {
  if (username) return `@${username}`;
  const first = name?.trim().split(/\s+/)[0];
  return first || "Account";
}

export function AccountButton({ className }: { className?: string }) {
  const acct = useAccount();
  const show = useSignInUi((u) => u.show);

  if (acct.status === "signed-in") {
    return (
      <Link href="/settings" title="Your profile and settings" data-testid="account-chip" className={cx(BASE, "max-w-[9rem] gap-2 text-phos hover:text-phos", className)}>
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-phos" />
        <span className="truncate">{label(acct.username, acct.name)}</span>
      </Link>
    );
  }
  if (acct.status === "guest") {
    return (
      <button
        type="button"
        onClick={() => show("manual")}
        aria-label="Sign in to save your progress"
        data-testid="account-signin"
        title="Sign in to keep your progress and use it on another device"
        className={cx(BASE, "text-amber hover:text-amber-2", className)}
      >
        Sign in
      </button>
    );
  }
  return null;
}
