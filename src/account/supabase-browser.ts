"use client";
/**
 * The browser's Supabase client. It is used for sign-in only (Google, emailed link or code); it holds the public
 * anon key, which is safe to ship. It cannot write player data: row level security gives browsers read access to
 * their own rows and nothing else (supabase/migrations). Returns null when Supabase isn't configured.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function supabaseBrowser(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key ? createBrowserClient(url, key) : null;
  return client;
}
