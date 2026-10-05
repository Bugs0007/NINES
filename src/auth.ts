/**
 * Accounts are optional: anyone can play as a guest (progress in the browser). Signing in keeps progress
 * across devices and raises the AI coach's daily allowance. Roles: guest (no session), player, owner
 * (emails in OWNER_EMAILS; sees the personal edition and /admin).
 *
 * Providers appear only when their keys are set. The "dev" email login exists outside production (and in
 * production only with NINES_DEV_LOGIN=1) so local play and the e2e suite can sign in without OAuth.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { Role } from "@/server/store";

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function roleFor(email: string | null | undefined): Role {
  if (!email) return "player";
  return ownerEmails().includes(email.toLowerCase()) ? "owner" : "player";
}

export const devLoginEnabled = () => process.env.NODE_ENV !== "production" || process.env.NINES_DEV_LOGIN === "1";

const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) providers.push(GitHub);
if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (c) => {
        const email = String(c?.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null;
        return { id: `dev:${email}`, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  trustHost: true,
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV !== "production" ? "nines-local-dev-secret-not-for-production" : undefined),
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.uid = account?.provider && account.provider !== "dev" ? `${account.provider}:${account.providerAccountId}` : (user.id ?? token.sub);
        token.role = roleFor(user.email);
        try {
          const { store } = await import("@/server/store");
          await store().upsertUser({ id: String(token.uid), email: user.email ?? null, name: user.name ?? null, role: token.role as Role });
        } catch {
          /* the account still works; it just isn't listed in /admin */
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.uid ?? token.sub ?? "");
      (session.user as { role?: Role }).role = (token.role as Role) ?? "player";
      return session;
    },
  },
});

/** The current role on the server (route handlers, server components). */
export async function currentUser(): Promise<{ id: string; email: string | null; role: Role } | null> {
  const s = await auth();
  if (!s?.user?.id) return null;
  return { id: s.user.id, email: s.user.email ?? null, role: ((s.user as { role?: Role }).role ?? "player") as Role };
}
