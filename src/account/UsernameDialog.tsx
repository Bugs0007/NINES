"use client";
/**
 * Pick a username. Opens by itself once after sign-in (until a name is chosen; "Later" hides it for this visit),
 * and from Settings to change it. The server checks the name again and keeps it unique.
 */
import { useEffect, useRef, useState } from "react";
import { onboardingOff } from "@/briefing/flags";
import { useAccount } from "@/game/account";
import { Button } from "@/ui/kit";
import { normalizeUsername, suggestUsername, usernameProblem } from "./username";
import { setUsernameLater, usernameLaterThisVisit } from "./gate";
import { useUsernameUi } from "./ui";

export function UsernameDialog() {
  const acct = useAccount();
  const open = useUsernameUi((s) => s.open);
  const show = useUsernameUi((s) => s.show);
  const hide = useUsernameUi((s) => s.hide);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const changing = !!acct.username;

  // Signed in without a username: ask once per visit (not in automated runs, and never on the admin page).
  useEffect(() => {
    if (acct.status !== "signed-in" || acct.username || onboardingOff() || usernameLaterThisVisit()) return;
    if (window.location.pathname.startsWith("/admin")) return;
    show();
  }, [acct.status, acct.username, show]);

  useEffect(() => {
    if (!open) return;
    setValue(acct.username ?? suggestUsername(acct.email, acct.name));
    setError(null);
    setBusy(false);
    const t = setTimeout(() => input.current?.select(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && later();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function later() {
    setUsernameLater();
    hide();
  }

  if (!open || acct.status !== "signed-in") return null;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const problem = usernameProblem(value);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const r = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: normalizeUsername(value) }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; message?: string; reason?: string } | null;
    setBusy(false);
    if (r?.ok && j?.ok) {
      await acct.refresh();
      hide();
    } else setError(j?.message ?? (j?.reason === "rate-limited" ? "Too many tries. Wait a moment." : "Couldn't save that. Try again."));
  };

  return (
    <div className="fixed inset-0 z-[66] grid place-items-end bg-bg-0/80 p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="username-title" className="w-full max-w-md rounded-xl border border-line-2 bg-bg-1 p-5 shadow-lift sm:p-6">
        <div className="eyebrow text-xs text-amber">{changing ? "Your profile" : "You're in"}</div>
        <h2 id="username-title" className="mt-1 font-display text-2xl font-semibold leading-tight text-ink-0">
          {changing ? "Change your username" : "Pick a username"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-1">This is how you appear on your profile. Letters, numbers and underscores, 3 to 20 characters.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">Username</span>
            <div className="flex items-center rounded-sm border border-line-2 bg-bg-0 focus-within:border-amber/80">
              <span className="pl-3 text-ink-3" aria-hidden>
                @
              </span>
              <input
                ref={input}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={21}
                aria-invalid={!!error}
                aria-describedby={error ? "username-error" : undefined}
                className="h-11 w-full bg-transparent px-2 text-[15px] text-ink-0 outline-none"
              />
            </div>
          </label>
          {error && (
            <p id="username-error" role="alert" className="text-[13px] text-alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={busy || !value.trim()}>
              {busy ? "Saving…" : "Save username"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={later}>
              {changing ? "Cancel" : "Later"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
