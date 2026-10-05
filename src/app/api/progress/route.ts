import { currentUser } from "@/auth";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000;

/** The signed-in player's synced save (the same blob as Settings → Export). */
export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  const p = await store().getProgress(u.id);
  return Response.json({ ok: true, progress: p });
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ ok: false, reason: "too-large" }, { status: 413 });
  let body: { blob?: unknown; savedAt?: number };
  try {
    body = JSON.parse(text) as { blob?: unknown; savedAt?: number };
  } catch {
    return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const savedAt = Number(body.savedAt);
  if (!body.blob || typeof body.blob !== "object" || !Number.isFinite(savedAt)) return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  await store().putProgress(u.id, body.blob, savedAt);
  return Response.json({ ok: true });
}
