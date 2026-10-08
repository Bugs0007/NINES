import { DEV_COOKIE, devLoginEnabled } from "@/auth";

export const dynamic = "force-dynamic";

/** Development and e2e only: "sign in" as any email. Disabled whenever Supabase is configured. */
export async function POST(req: Request) {
  if (!devLoginEnabled()) return Response.json({ ok: false, reason: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return Response.json({ ok: false, reason: "bad-email" }, { status: 400 });
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${DEV_COOKIE}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${DEV_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
