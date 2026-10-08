import { MODELS } from "@/config/models";
import { finalizeGrade, GRADE_SYSTEM, gradeUserPrompt } from "@/ai/prompts";
import { GRADE_JSON_SCHEMA, GradeRequest } from "@/ai/schemas";
import { assertBudget, assertQuota, caller, chat, hasKey, reasonOf, record, unavailable } from "@/server/ai";

export const dynamic = "force-dynamic";

/** The shared coach (the site's key, within quotas and the budget cap). Players' own keys never come here. */
export async function POST(req: Request) {
  if (!hasKey()) return unavailable("no-key");
  const parsed = GradeRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unavailable("bad-request", 400);
  const g = parsed.data;
  try {
    const who = await caller(req);
    await assertQuota(who, "grade");
    await assertBudget();
    const res = await chat({ model: MODELS.grader, system: GRADE_SYSTEM, user: gradeUserPrompt(g), maxTokens: 3000, reasoningEffort: "medium", jsonSchema: { name: "grade", schema: GRADE_JSON_SCHEMA } });
    const usd = await record("grade", MODELS.grader, res.usage, who.subject);
    let json: unknown = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      return unavailable("no-grade");
    }
    const result = finalizeGrade(g, json);
    if (!result) return unavailable("no-grade");
    return Response.json({ ok: true, result, usd });
  } catch (e) {
    return unavailable(reasonOf(e));
  }
}
