import { NextResponse } from "next/server";
import { serverClient, supabaseConfigured } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Only same-site paths: a sign-in link must not be able to send the player to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

/** Where Google and the emailed link send the player back to. Exchanges the one-time code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (!supabaseConfigured() || !code) return NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}auth=error`, url.origin));
  const sb = await serverClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  const dest = new URL(next, url.origin);
  dest.searchParams.set("auth", error ? "error" : "ok");
  return NextResponse.redirect(dest);
}
