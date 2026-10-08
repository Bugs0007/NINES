import "server-only";
/**
 * Who is calling, on the server. Accounts are optional: anyone can play as a guest (progress in the browser).
 * Signing in (Supabase Auth: Google, or an emailed link/code) keeps progress across devices and raises the AI
 * coach's daily allowance. Roles: guest (no session), player, admin (emails in ADMIN_EMAILS; sees /admin).
 *
 * Role checks happen here, on the server, never only in the client.
 *
 * Without Supabase configured there is a dev-only email login (a plain cookie, not real auth) so local play and the
 * e2e suite can sign in. It exists outside production, or in production only with NINES_DEV_LOGIN=1, and never
 * when Supabase is configured.
 */
import { cookies } from "next/headers";
import { serverClient, supabaseConfigured } from "@/server/supabase";
import type { Role } from "@/server/store";

export const DEV_COOKIE = "nines-dev-user";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function roleFor(email: string | null | undefined): Role {
  if (!email) return "player";
  return adminEmails().includes(email.toLowerCase()) ? "admin" : "player";
}

export const devLoginEnabled = () => !supabaseConfigured() && (process.env.NODE_ENV !== "production" || process.env.NINES_DEV_LOGIN === "1");

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
}

/** The current user on the server (route handlers, server components), or null for a guest. */
export async function currentUser(): Promise<AuthUser | null> {
  if (supabaseConfigured()) {
    try {
      const sb = await serverClient();
      // getUser() asks the Auth server to verify the token, so a forged cookie is not trusted.
      const { data } = await sb.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const email = user.email ?? null;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name = (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || null;
      // Admin needs a confirmed address: an unconfirmed sign-up must never inherit an admin email.
      const confirmed = !!user.email_confirmed_at;
      return { id: user.id, email, name, role: confirmed ? roleFor(email) : "player" };
    } catch {
      return null;
    }
  }
  if (devLoginEnabled()) {
    const jar = await cookies();
    const email = jar.get(DEV_COOKIE)?.value?.trim().toLowerCase();
    if (email && /^[^@\s]+@[^@\s]+$/.test(email)) return { id: `dev:${email}`, email, name: email.split("@")[0] ?? null, role: roleFor(email) };
  }
  return null;
}
