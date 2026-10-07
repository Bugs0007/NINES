"use client";
/**
 * Sign in to keep your progress. Google, or an email link/code (no passwords). Guests can always close this and
 * keep playing; level 1 is never behind it. Mounted once in the app shell and opened from anywhere through
 * useSignInUi (the header's "Save progress", the card after your first level).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/analytics/track";
import { useAccount } from "@/game/account";
import { Button, cx } from "@/ui/kit";
import { supabaseBrowser } from "./supabase-browser";
import { inAppBrowser } from "./webview";
import { useSignInUi } from "./ui";

type Step = "choose" | "sent";

const INPUT = "h-11 w-full rounded-sm border border-line-2 bg-bg-0 px-3 text-[15px] text-ink-0 outline-none transition-colors placeholder:text-ink-3 focus:border-amber/80";

function callbackUrl(): string {
  const here = window.location.pathname + window.location.search;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(here)}`;
}

export function SignInDialog() {
  const open = useSignInUi((s) => s.open);
  const reason = useSignInUi((s) => s.reason);
  const hide = useSignInUi((s) => s.hide);
  const acct = useAccount();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  // A failed return from Google or an emailed link reopens the dialog with an explanation.
  const show = useSignInUi((s) => s.show);
  useEffect(() => {
    if (acct.authError) {
      setError("That sign-in didn't work. The link may have expired, or was opened in a different browser. Try again, or use the code from the email.");
      show("manual");
    }
  }, [acct.authError, show]);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setCode("");
    setBusy(false);
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Signed in (here or in another tab): nothing left to ask.
  useEffect(() => {
    if (open && acct.status === "signed-in") hide();
  }, [open, acct.status, hide]);

  function close() {
    if (reason === "first-level") track("signup_prompt_dismissed");
    setError(null);
    hide();
  }

  if (!open) return null;
  const sb = supabaseBrowser();
  const firstLevel = reason === "first-level";

  const google = async () => {
    if (!sb) return;
    track("signup_clicked", { method: "google" });
    setBusy(true);
    const { error: e } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
    if (e) {
      setError("Couldn't start Google sign-in. Try the email option instead.");
      setBusy(false);
    }
  };

  const emailMe = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    track("signup_clicked", { method: "email" });
    if (sb) {
      const { error: e } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } });
      setBusy(false);
      if (e) setError(e.status === 429 ? "Too many emails just now. Wait a minute and try again." : "Couldn't send the email. Check the address and try again.");
      else setStep("sent");
      return;
    }
    // Development only: no Supabase, so "sign in" with a plain cookie.
    const r = await fetch("/api/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) await acct.refresh();
    else setError("Couldn't sign in.");
  };

  const verify = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!sb) return;
    setError(null);
    setBusy(true);
    const { error: e } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (e) setError("That code didn't match, or it expired. Check the latest email, or send a new one.");
    else await acct.refresh();
  };

  const canSignIn = acct.auth.supabase || acct.auth.dev;
  const webview = inAppBrowser();

  return (
    <div className="fixed inset-0 z-[65] grid place-items-end bg-bg-0/80 p-3 backdrop-blur-sm sm:place-items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="signin-title" className="w-full max-w-md rounded-xl border border-line-2 bg-bg-1 p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow text-xs text-amber">{firstLevel ? "Level 1 cleared" : "Your progress"}</div>
            <h2 id="signin-title" className="mt-1 font-display text-2xl font-semibold leading-tight text-ink-0">
              {firstLevel ? "Save it so it's yours" : "Save your progress"}
            </h2>
          </div>
          <button onClick={close} aria-label="Close" title="Close" className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-bg-2 hover:text-ink-0">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-1">Sign in to keep your game on any device and get a bigger daily allowance from the AI coach. You can also keep playing as a guest: nothing is locked.</p>

        {!canSignIn ? (
          <p className="mt-4 rounded-md border border-line-2/70 bg-bg-2/50 p-3 text-[13px] text-ink-1">Sign-in isn&apos;t set up on this server yet. Your progress is still saved in this browser.</p>
        ) : step === "choose" ? (
          <div className="mt-4 space-y-3">
            {acct.auth.supabase && !webview && (
              <Button variant="secondary" size="lg" className="w-full" onClick={() => void google()} disabled={busy}>
                Continue with Google
              </Button>
            )}
            {acct.auth.supabase && !webview && <div className="text-center text-xs text-ink-3">or</div>}
            {acct.auth.supabase && webview && (
              <p className="rounded-md border border-line-2/70 bg-bg-2/50 px-3 py-2 text-[13px] leading-relaxed text-ink-1">
                Google sign-in doesn&apos;t work inside this app&apos;s built-in browser. Use your email below (you&apos;ll get a code to type in here), or open NINES in Chrome or Safari to use Google.
              </p>
            )}
            <form onSubmit={emailMe} className="space-y-2">
              <label className="block">
                <span className="sr-only">Email address</span>
                <input ref={first} type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={INPUT} />
              </label>
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !email.includes("@")}>
                {acct.auth.supabase ? "Email me a sign-in link" : "Sign in (development only)"}
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={verify} className="mt-4 space-y-3">
            <p className="text-sm leading-relaxed text-ink-1">
              We emailed <span className="font-medium text-ink-0">{email}</span>. Open the link on this device, or type the code from the email here.
            </p>
            <label className="block">
              <span className="sr-only">Code from the email</span>
              <input ref={first} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Code from the email" className={cx(INPUT, "tabular tracking-widest")} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy || code.length < 6}>
                Verify code
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Use a different email
              </Button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-alert">
            {error}
          </p>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          By continuing you agree to the{" "}
          <Link href="/privacy" className="text-ink-2 underline decoration-line-3 underline-offset-2 hover:text-ink-0">
            privacy notice
          </Link>
          : we store your email address, your name if Google shares it, and your progress, and nothing else. You can delete it all in Settings.
        </p>
        <button onClick={close} className="mt-3 w-full rounded-sm py-2 text-[13px] font-medium text-ink-2 hover:text-ink-0">
          {firstLevel ? "Not now, keep playing" : "Close"}
        </button>
      </div>
    </div>
  );
}
