import "server-only";
/**
 * Server-side AI access (Groq, OpenAI-compatible chat completions): the call, spend accounting, the hard
 * monthly and daily caps, and per-person daily quotas. The key lives in .env (GROQ_API_KEY) and never
 * reaches the browser. Usage is stored through src/server/store.ts (Postgres in production).
 */
import { createHash } from "node:crypto";
import { currentUser } from "@/auth";
import { dailyBudgetUsd, dailyQuota, monthlyBudgetUsd, type AiRoute } from "@/config/ai";
import { AI_PROVIDER, PRICING } from "@/config/models";
import { dayKey, store, type Role } from "./store";

export interface Ledger {
  month: string;
  spentUsd: number;
  calls: number;
  byRoute: Record<string, { calls: number; usd: number }>;
}

/** Spend this month, across everyone. */
export async function ledger(): Promise<Ledger> {
  const month = dayKey().slice(0, 7);
  const s = await store().spend(month);
  return { month, spentUsd: s.usd, calls: s.calls, byRoute: s.byRoute };
}

export function hasKey(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export class BudgetExceeded extends Error {}
export class QuotaExceeded extends Error {}
/** The provider said no: rate limit (429), auth, or a server error. Callers fall back to offline behaviour. */
export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Caller {
  /** Stable id for quotas: "u:<user id>" when signed in, else a salted hash of the network address. */
  subject: string;
  role: Role;
  email: string | null;
}

/** Who is calling. Guests are identified only by a one-way hash; no address is stored. */
export async function caller(req: Request): Promise<Caller> {
  const u = await currentUser().catch(() => null);
  if (u) return { subject: `u:${u.id}`, role: u.role, email: u.email };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const ua = req.headers.get("user-agent") ?? "";
  const salt = process.env.IP_HASH_SALT ?? "nines-dev-salt";
  return { subject: `g:${createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 20)}`, role: "guest", email: null };
}

export async function assertBudget(): Promise<void> {
  const day = dayKey();
  const [month, today] = await Promise.all([store().spend(day.slice(0, 7)), store().spend(day)]);
  if (month.usd >= monthlyBudgetUsd()) throw new BudgetExceeded(`Monthly AI budget of $${monthlyBudgetUsd()} reached`);
  if (today.usd >= dailyBudgetUsd()) throw new BudgetExceeded(`Daily AI budget of $${dailyBudgetUsd().toFixed(2)} reached`);
}

export async function assertQuota(c: Caller, route: AiRoute): Promise<void> {
  const limit = dailyQuota(c.role, route);
  if (!Number.isFinite(limit)) return;
  const used = (await store().usageFor(c.subject, dayKey()))[route] ?? 0;
  if (used >= limit) {
    await store().noteQuotaHit(dayKey());
    throw new QuotaExceeded(`Daily ${route} allowance (${limit}) used`);
  }
}

/** Remaining calls today for this caller (shown in Settings). */
export async function remaining(c: Caller): Promise<Record<AiRoute, number | null>> {
  const used = await store().usageFor(c.subject, dayKey());
  const left = (r: AiRoute) => {
    const q = dailyQuota(c.role, r);
    return Number.isFinite(q) ? Math.max(0, q - (used[r] ?? 0)) : null;
  };
  return { grade: left("grade"), hint: left("hint") };
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

/** Cost of one call. Cached prefix tokens bill at the cached rate; reasoning tokens are already in completion_tokens. */
export function costOf(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return ((u.prompt_tokens - cached) * p.input + cached * p.cachedInput + u.completion_tokens * p.output) / 1e6;
}

export async function record(route: AiRoute, model: string, usage: Usage, subject: string): Promise<number> {
  const usd = costOf(model, usage);
  await store().addUsage(subject, dayKey(), route, usd);
  return usd;
}

export interface ChatRequest {
  model: string;
  /** Stable text first (system), volatile last: Groq caches matching prefixes automatically. */
  system: string;
  user: string;
  maxTokens: number;
  reasoningEffort: "low" | "medium" | "high";
  /** Strict JSON-schema output (constrained decoding). Every object needs all keys required and additionalProperties: false. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export interface ChatResult {
  text: string;
  finishReason: string;
  usage: Usage;
}

/** One chat completion. One quick retry on a short 429; anything else throws ProviderError. */
export async function chat(req: ChatRequest): Promise<ChatResult> {
  const body = {
    model: req.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    max_completion_tokens: req.maxTokens,
    reasoning_effort: req.reasoningEffort,
    include_reasoning: false,
    ...(req.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema } } } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(`${AI_PROVIDER.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) {
      throw new ProviderError(0, (e as Error).name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get("retry-after"));
      if (Number.isFinite(wait) && wait > 0 && wait <= 4) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
    }
    if (!res.ok) throw new ProviderError(res.status, `http-${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: Usage };
    const choice = j.choices?.[0];
    return {
      text: (choice?.message?.content ?? "").trim(),
      finishReason: choice?.finish_reason ?? "unknown",
      usage: j.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
    };
  }
}

/** Common JSON error responses for the routes. */
export function unavailable(reason: string, status = 200) {
  return Response.json({ ok: false, reason }, { status });
}

export function reasonOf(e: unknown): string {
  if (e instanceof BudgetExceeded) return "budget";
  if (e instanceof QuotaExceeded) return "quota";
  if (e instanceof ProviderError) return e.status === 429 ? "rate-limited" : `provider-${e.status || e.message}`;
  return "error";
}
