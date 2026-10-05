"use client";
/**
 * Settings → Account and Feedback. Accounts are optional: they keep progress across devices and raise the
 * AI coach's daily allowance. Feedback goes to the owner's /admin inbox.
 */
import Link from "next/link";
import { getProviders, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useAccount } from "@/game/account";
import { Button, Chip, Panel } from "@/ui/kit";

type Providers = Awaited<ReturnType<typeof getProviders>>;

export function AccountPanel() {
  const acct = useAccount();
  const [providers, setProviders] = useState<Providers>(null);
  const [email, setEmail] = useState("");
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Retry a couple of times: a cold server can drop the first request.
    let alive = true;
    const load = (n: number) =>
      getProviders()
        .then((p) => {
          if (!alive) return;
          if (p) setProviders(p);
          else if (n > 0) setTimeout(() => load(n - 1), 1500);
        })
        .catch(() => alive && n > 0 && setTimeout(() => load(n - 1), 1500));
    load(3);
    return () => {
      alive = false;
    };
  }, []);

  const oauth = Object.values(providers ?? {}).filter((p) => p.type === "oauth" || p.type === "oidc");
  const dev = providers?.dev;

  const deleteAccount = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const r = await fetch("/api/account", { method: "DELETE" });
    if (r.ok) {
      setMsg("Account deleted. Your progress stays in this browser.");
      await signOut({ redirect: false });
      window.location.reload();
    } else setMsg("Couldn't delete the account. Try again in a moment.");
  };

  return (
    <Panel
      label="Account"
      right={acct.status === "signed-in" ? <Chip tone={acct.role === "owner" ? "info" : "ok"}>{acct.role === "owner" ? "Owner" : "Signed in"}</Chip> : <Chip tone="muted">Guest</Chip>}
    >
      {acct.status === "signed-in" ? (
        <div className="space-y-3 text-sm text-ink-1">
          <p>
            Signed in as <span className="font-medium text-ink-0">{acct.email ?? acct.name}</span>. Your progress syncs across devices automatically.
          </p>
          {acct.role === "owner" && (
            <p className="text-[13px] text-ink-2">
              You see the owner edition (your Case Intel notes) and the{" "}
              <Link href="/admin" className="font-medium text-amber hover:text-amber-2">
                admin page
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void signOut({ redirect: false }).then(() => window.location.reload())}>
              Sign out
            </Button>
            <Button variant="danger" onClick={() => void deleteAccount()}>
              {armed ? "Tap again: delete account" : "Delete account"}
            </Button>
          </div>
          {armed && <p className="text-xs text-alert">This removes your account and its synced copy. The save in this browser stays until you reset it below.</p>}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-ink-1">
          <p>You&apos;re playing as a guest: everything works, and progress is saved in this browser. Sign in to keep it across devices and get a larger daily allowance from the AI coach.</p>
          <div className="flex flex-wrap gap-2">
            {oauth.map((p) => (
              <Button key={p.id} variant="secondary" onClick={() => void signIn(p.id)}>
                Continue with {p.name}
              </Button>
            ))}
          </div>
          {dev && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void signIn("dev", { email, redirect: false }).then(() => window.location.reload());
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="eyebrow text-xs text-ink-2">Dev login (not in production)</span>
                <input
                  type="email"
                  aria-label="Dev login email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 rounded-sm border border-line-2 bg-bg-0 px-3 text-sm text-ink-0 outline-none focus:border-amber/80"
                />
              </label>
              <Button type="submit" variant="secondary">
                Sign in
              </Button>
            </form>
          )}
          {!oauth.length && !dev && <p className="text-[13px] text-ink-3">Sign-in isn&apos;t configured on this server yet.</p>}
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
      <p className="text-sm text-ink-1">Where did you get stuck, bored, or confused? What would you add? It goes straight to the person who made this.</p>
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
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" onClick={() => void send()} disabled={text.trim().length < 3 || state === "sending"}>
          {state === "sending" ? "Sending…" : "Send feedback"}
        </Button>
        {state === "sent" && <span className="text-[13px] text-phos">Thank you. Sent.</span>}
        {state === "error" && <span className="text-[13px] text-alert">Couldn&apos;t send. Try again.</span>}
      </div>
    </Panel>
  );
}
