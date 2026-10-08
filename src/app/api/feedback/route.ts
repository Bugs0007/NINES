import { z } from "zod";
import { caller } from "@/server/ai";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().trim().min(3).max(2000), page: z.string().max(200).default("") });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, reason: "bad-request" }, { status: 400 });
  const who = await caller(req);
  await store().addFeedback({ subject: who.subject, email: who.email, page: parsed.data.page, message: parsed.data.message });
  return Response.json({ ok: true });
}
