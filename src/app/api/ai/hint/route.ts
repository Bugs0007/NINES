import { MODELS } from "@/config/models";
import { HINT_SYSTEM, hintUserPrompt, unquote } from "@/ai/prompts";
import { HintRequest } from "@/ai/schemas";
import { assertBudget, assertQuota, caller, chat, hasKey, reasonOf, record, unavailable } from "@/server/ai";

export const dynamic = "force-dynamic";

/** The shared coach (the site's key, within quotas and the budget cap). Players' own keys never come here. */
export async function POST(req: Request) {
  if (!hasKey()) return unavailable("no-key");
  const parsed = HintRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unavailable("bad-request", 400);
  const h = parsed.data;
  try {
    const who = await caller(req);
    await assertQuota(who, "hint");
    await assertBudget();
    const res = await chat({ model: MODELS.fast, system: HINT_SYSTEM, user: hintUserPrompt(h), maxTokens: 700, reasoningEffort: "low" });
    const usd = await record("hint", MODELS.fast, res.usage, who.subject);
    if (!res.text) return unavailable("no-hint");
    return Response.json({ ok: true, hint: unquote(res.text), usd });
  } catch (e) {
    return unavailable(reasonOf(e));
  }
}
