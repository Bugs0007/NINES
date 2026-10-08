import { currentUser, devLoginEnabled } from "@/auth";
import { serviceConfigured, supabaseConfigured } from "@/server/supabase";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

/** Who the browser is, and which ways of signing in this server offers. Also records the visit for "last active". */
export async function GET() {
  const user = await currentUser();
  let username: string | null = null;
  if (user) {
    await store().upsertUser({ id: user.id, email: user.email, name: user.name }).catch(() => undefined);
    username = await store().getUsername(user.id).catch(() => null);
  }
  return Response.json(
    {
      status: user ? "signed-in" : "guest",
      user: user ? { ...user, username } : null,
      // `google` and `email` need the Supabase project set up as in SUPABASE_SETUP.md.
      auth: { supabase: supabaseConfigured(), storage: serviceConfigured() ? "supabase" : "local", dev: devLoginEnabled() },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
