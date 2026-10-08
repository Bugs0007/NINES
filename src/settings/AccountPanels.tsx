"use client";
/**
 * Settings → Account and Feedback. Accounts are optional: they keep progress across devices and raise the
 * AI coach's daily allowance. Feedback goes to the admin inbox.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignInUi, useUsernameUi } from "@/account/ui";
import { useAccount } from "@/game/account";
import { Button, Chip, Panel } from "@/ui/kit";

export function AccountPanel() {
  const acct = useAccount();
  const showSignIn = useSignInUi((s) => s.show);
  const showUsername = useUsernameUi((s) => s.show);
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 8000);
    return () => clearTimeout(t);
  }, [armed]);

  const deleteAccount = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setMsg("Account and synced data deleted. Your progress stays in this browser.");
      await acct.signOut();
    } else {
      setBusy(false);
      setMsg("Couldn't delete the account. Try again in a moment.");
    }
  };

  return (
    <Panel
      label="Account"
      right={acct.status === "signed-in" ? <Chip tone={acct.role === "admin" ? "info" : "ok"}>{acct.role === "admin" ? "Admin" : "Signed in"}</Chip> : <Chip tone="muted">Guest</Chip>}
    >
      {acct.status === "signed-in" ? (
        <div className="space-y-3 text-sm text-ink-1">
          <p>
            Signed in as <span className="font-medium text-ink-0">{acct.email ?? acct.name}</span>. Your progress syncs across devices automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-2">Username</span>
            <span className="font-medium text-ink-0">{acct.username ? `@${acct.username}` : "not chosen yet"}</span>
            <Button size="sm" variant="secondary" onClick={showUsername}>
              {acct.username ? "Change" : "Choose one"}
            </Button>
          </div>
          {acct.role === "admin" && (
            <p className="text-[13px] text-ink-2">
              You are an admin. Open the{" "}
              <Link href="/admin" className="font-medium text-amber hover:text-amber-2">
                admin page
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void acct.signOut()}>
              Sign out
            </Button>
            <Button variant="danger" onClick={() => void deleteAccount()} disabled={busy} title="Deletes your account, your synced progress and any feedback you sent while signed in">
              {armed ? "Tap again: delete my account and data" : "Delete my account and data"}
            </Button>
          </div>
          {armed && <p className="text-xs text-alert">This permanently removes your account, your synced progress and save, your AI usage and feedback sent while signed in. The save in this browser stays until you reset it below.</p>}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-ink-1">
          <p>You&apos;re playing as a guest: everything works, and progress is saved in this browser. Sign in to keep it across devices and get a larger daily allowance from the AI coach.</p>
          <Button variant="primary" onClick={() => showSignIn("manual")} disabled={acct.status === "loading"}>
            Sign in to save progress
          </Button>
          {acct.status !== "loading" && !acct.auth.supabase && !acct.auth.dev && <p className="text-[13px] text-ink-3">Sign-in isn&apos;t configured on this server yet.</p>}
          <p className="text-xs text-ink-3">
            We store your email and your progress, nothing else.{" "}
            <Link href="/privacy" className="text-ink-2 underline decoration-line-3 underline-offset-2 hover:text-ink-0">
              Privacy
            </Link>
          </p>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
    </Panel>
  );
}

export function FeedbackPanel() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const short = text.trim().length < 3;
  const send = async () => {
    setState("sending");
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, page: "settings" }) }).catch(() => null);
    if (r?.ok) {
      setState("sent");
      setText("");
    } else setState("error");
  };
  return (
    <Panel label="Feedback">
      <p className="text-sm text-ink-1">Where did you get stuck, bored, or confused? What would you add? It goes straight to the team that makes NINES.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "sending") setState("idle");
        }}
        rows={3}
        maxLength={2000}
        aria-label="Your feedback"
        className="mt-3 w-full rounded-sm border border-line-2 bg-bg-0 p-3 text-sm text-ink-0 outline-none focus:border-amber/80"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void send()} disabled={short || state === "sending"} title={short ? "Write at least a few words first" : undefined}>
          {state === "sending" ? "Sending…" : "Send feedback"}
        </Button>
        {short && state === "idle" && <span className="text-[13px] text-ink-3">Write a few words to send.</span>}
        {state === "sent" && <span className="text-[13px] text-phos">Thank you. Sent.</span>}
        {state === "error" && <span className="text-[13px] text-alert">Couldn&apos;t send. Try again.</span>}
      </div>
    </Panel>
  );
}
