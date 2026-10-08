import { currentUser } from "@/auth";
import { MAX_ROWS_PER_WRITE, mergeRows, validateRows } from "@/content/progress-model";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

/** The save blob can hold a long review history, so it gets a generous cap; the rows are tiny. */
const MAX_BYTES = 1_500_000;
/** Writes per player per minute. A sync fires a few seconds after play, so normal play never gets near this. */
const WRITES_PER_MINUTE = 20;

/** The signed-in player's synced save and their progress rows. */
export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  const [save, rows] = await Promise.all([store().getSave(u.id), store().getProgress(u.id)]);
  return Response.json({ ok: true, progress: save, rows }, { headers: { "cache-control": "no-store" } });
}

/**
 * Store a save and/or progress rows.
 *   { blob, savedAt }  the full game save (the same blob as Settings → Export)
 *   { rows }           progress rows, validated against the curriculum before they are stored
 * Rows that fail validation are reported back and skipped; they never block good rows or the save.
 */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  if (!(await store().rateLimit(`progress:${u.id}`, 60, WRITES_PER_MINUTE))) return Response.json({ ok: false, reason: "rate-limited" }, { status: 429, headers: { "retry-after": "30" } });

  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ ok: false, reason: "too-large" }, { status: 413 });
  let body: { blob?: unknown; savedAt?: unknown; rows?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });

  let savedBlob = false;
  if (body.blob !== undefined) {
    const savedAt = Number(body.savedAt);
    if (typeof body.blob !== "object" || body.blob === null || !Number.isFinite(savedAt)) return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
    await store().putSave(u.id, body.blob, savedAt);
    savedBlob = true;
  }

  let stored = 0;
  let rejected: { level: string; reason: string }[] = [];
  if (body.rows !== undefined) {
    if (Array.isArray(body.rows) && body.rows.length > MAX_ROWS_PER_WRITE) return Response.json({ ok: false, reason: "too-many-rows" }, { status: 413 });
    const existing = await store().getProgress(u.id);
    const { ok, errors } = validateRows(body.rows, existing);
    rejected = errors;
    const merged = mergeRows(existing, ok, new Date());
    await store().putProgress(u.id, merged);
    stored = merged.length;
  }
  return Response.json({ ok: true, savedBlob, rows: stored, rejected });
}
