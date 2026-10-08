import { currentUser } from "@/auth";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Delete the signed-in account and everything stored about it: the profile, progress rows, synced save, AI usage
 * and any feedback sent while signed in. The browser's local save is the player's to reset.
 */
export async function DELETE() {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  try {
    await store().deleteUser(u.id);
  } catch {
    return Response.json({ ok: false, reason: "error" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
