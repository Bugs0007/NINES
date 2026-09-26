import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/config/models";
import { CountRequest } from "@/claude/schemas";
import { claude, hasKey, unavailable } from "@/server/claude";

export const dynamic = "force-dynamic";

/** Exact Claude token count for the Tokenizer Slicer. Token counting is free, so it skips the ledger. */
export async function POST(req: Request) {
  if (!hasKey()) return unavailable("no-key");
  const parsed = CountRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unavailable("bad-request", 400);
  try {
    const res = await claude().messages.countTokens({ model: MODELS.tokenizer, messages: [{ role: "user", content: parsed.data.text }] });
    return Response.json({ ok: true, tokens: res.input_tokens, model: MODELS.tokenizer });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return unavailable(`api-${e.status ?? "error"}`);
    return unavailable("error");
  }
}
