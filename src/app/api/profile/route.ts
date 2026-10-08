import { z } from "zod";
import { currentUser } from "@/auth";
import { normalizeUsername, usernameProblem } from "@/account/username";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const Body = z.object({ username: z.string().max(60) }).strict();

/**
 * Choose or change your username. Validated here (the database repeats the format check), rate-limited per
 * player, and unique: a name someone else has gets a 409 so the dialog can ask for another.
 */
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ ok: false, reason: "signed-out" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  if (!(await store().rateLimit(`username:${u.id}`, 60, 10))) return Response.json({ ok: false, reason: "rate-limited" }, { status: 429, headers: { "retry-after": "30" } });
  const username = normalizeUsername(parsed.data.username);
  const problem = usernameProblem(username);
  if (problem) return Response.json({ ok: false, reason: "invalid", message: problem }, { status: 400 });
  try {
    const result = await store().setUsername(u.id, username);
    if (result === "taken") return Response.json({ ok: false, reason: "taken", message: "Someone already has that username. Try another." }, { status: 409 });
  } catch {
    return Response.json({ ok: false, reason: "error" }, { status: 500 });
  }
  return Response.json({ ok: true, username });
}
