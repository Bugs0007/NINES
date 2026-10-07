import "server-only";
/**
 * Supabase on the server. Two clients:
 *   - serverClient(): acts as the signed-in player (reads their session cookie); used to find out who is calling.
 *   - adminClient(): the service-role key, which bypasses row level security. Server only, never sent to the
 *     browser; every use must validate its input first.
 * Without the env vars the app runs in guest/dev mode (local JSON store, dev login) so it still works offline.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Sign-in is available (URL + public key). */
export const supabaseConfigured = () => !!supabaseUrl() && !!supabaseAnonKey();
/** Storage is available too (adds the secret service-role key). */
export const serviceConfigured = () => supabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (!serviceConfigured()) throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  admin ??= createClient(supabaseUrl()!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** A client bound to the request's cookies, i.e. to whoever is signed in. */
export async function serverClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          /* called from a Server Component, where cookies are read-only: the proxy refreshes the session instead */
        }
      },
    },
  });
}
