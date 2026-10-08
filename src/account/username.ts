/**
 * Usernames: lowercase letters, digits and underscores, 3 to 20 characters. Shared by the dialog (to explain
 * problems as you type) and the server route (to enforce them); the database has the same check as a backstop
 * (supabase/migrations/20261008000000_username.sql). No React or server imports.
 */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Names that would look official or collide with the story's cast. */
const RESERVED = new Set(["admin", "administrator", "root", "support", "help", "staff", "moderator", "mod", "system", "nines", "pigeon", "meera", "kabir", "api", "www", "null", "undefined", "me", "you", "owner", "official"]);

/** What we store: trimmed, lowercase, a leading @ forgiven. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** A plain-language problem with a name, or null when it is fine. */
export function usernameProblem(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "Pick a username.";
  if (u.length < 3) return "Use at least 3 characters.";
  if (u.length > 20) return "Use at most 20 characters.";
  if (!USERNAME_RE.test(u)) return "Use only letters, numbers and underscores (no spaces).";
  if (/^_+$/.test(u) || /^\d+$/.test(u)) return "Add some letters to it.";
  if (RESERVED.has(u)) return "That name is reserved. Try another.";
  return null;
}

/** A starting suggestion from the player's name or email, already valid. */
export function suggestUsername(email: string | null, name: string | null): string {
  const base = (name || email?.split("@")[0] || "engineer").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16);
  const s = base.length >= 3 ? base : `${base || "pigeon"}_dev`.slice(0, 20);
  return usernameProblem(s) ? "pigeon_dev" : s;
}
