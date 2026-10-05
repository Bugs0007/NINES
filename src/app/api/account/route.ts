import { currentUser } from "@/auth";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

/** Delete the signed-in account and its synced progress. The browser's local save is the player's to reset. */
export async function DELETE() {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  await store().deleteUser(u.id);
  return Response.json({ ok: true });
}
