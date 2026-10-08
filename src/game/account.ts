"use client";
/**
 * The player's account as the browser sees it: signed out (guest), a player, or an admin. Guests play fully;
 * signing in only adds cross-device progress and a larger AI allowance. The server decides who you are
 * (/api/me); this just mirrors it and refreshes when Supabase says the session changed.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/account/supabase-browser";

export type Role = "guest" | "player" | "admin";

export interface AuthConfig {
  /** Supabase sign-in (Google, email link or code) is available. */
  supabase: boolean;
  storage: "supabase" | "local";
  /** The development-only email login. */
  dev: boolean;
}

export interface Account {
  status: "loading" | "guest" | "signed-in";
  id: string | null;
  email: string | null;
  name: string | null;
  role: Role;
  auth: AuthConfig;
  /** The last sign-in attempt failed (the link expired, the code was wrong, Google said no). */
  authError: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const NO_AUTH: AuthConfig = { supabase: false, storage: "local", dev: false };
const Ctx = createContext<Account>({ status: "loading", id: null, email: null, name: null, role: "guest", auth: NO_AUTH, authError: false, refresh: async () => undefined, signOut: async () => undefined });

interface MeResponse {
  status: "guest" | "signed-in";
  user: { id: string; email: string | null; name: string | null; role: Role } | null;
  auth: AuthConfig;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authError, setAuthError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) setMe((await r.json()) as MeResponse);
    } catch {
      /* offline: stay a guest */
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Back from Google or an emailed link: /auth/callback adds ?auth=ok|error. Read it once, then tidy the URL.
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("auth");
    if (flag) {
      setAuthError(flag === "error");
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    }
    const sb = supabaseBrowser();
    const sub = sb?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") void refresh();
    });
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabaseBrowser()?.auth.signOut();
    await fetch("/api/dev-login", { method: "DELETE" }).catch(() => undefined);
    window.location.reload();
  }, []);

  const value = useMemo<Account>(() => {
    const auth = me?.auth ?? NO_AUTH;
    if (!me) return { status: "loading", id: null, email: null, name: null, role: "guest", auth, authError, refresh, signOut };
    if (!me.user) return { status: "guest", id: null, email: null, name: null, role: "guest", auth, authError, refresh, signOut };
    return { status: "signed-in", id: me.user.id, email: me.user.email, name: me.user.name, role: me.user.role, auth, authError, refresh, signOut };
  }, [me, authError, refresh, signOut]);

  return createElement(Ctx.Provider, { value }, children);
}

export function useAccount(): Account {
  return useContext(Ctx);
}
