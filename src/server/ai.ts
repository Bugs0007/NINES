import "server-only";
/**
 * Server-side AI access (Groq, OpenAI-compatible chat completions): the call, the cost ledger, and the hard
 * monthly budget. The key lives in .env (GROQ_API_KEY) and never reaches the browser.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { monthlyBudgetUsd } from "@/config/ai";
import { AI_PROVIDER, PRICING } from "@/config/models";

const LEDGER = path.join(process.cwd(), ".nines", "usage.json");

export interface Ledger {
  month: string;
  spentUsd: number;
  calls: number;
  byRoute: Record<string, { calls: number; usd: number }>;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

async function readLedger(): Promise<Ledger> {
  try {
    const l = JSON.parse(await readFile(LEDGER, "utf8")) as Ledger;
    if (l.month === thisMonth()) return l;
  } catch {
    /* first run */
  }
  return { month: thisMonth(), spentUsd: 0, calls: 0, byRoute: {} };
}

let memLedger: Ledger | null = null;

async function writeLedger(l: Ledger) {
  memLedger = l;
  try {
    await mkdir(path.dirname(LEDGER), { recursive: true });
    await writeFile(LEDGER, JSON.stringify(l, null, 2));
  } catch {
    /* read-only FS (e.g. serverless): keep the in-memory copy */
  }
}

export async function ledger(): Promise<Ledger> {
  if (memLedger && memLedger.month === thisMonth()) return memLedger;
  memLedger = await readLedger();
  return memLedger;
}

export function hasKey(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export class BudgetExceeded extends Error {}
/** The provider said no: rate limit (429), auth, or a server error. Callers fall back to offline behaviour. */
export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function assertBudget(): Promise<void> {
  const l = await ledger();
  if (l.spentUsd >= monthlyBudgetUsd()) throw new BudgetExceeded(`Monthly AI budget of $${monthlyBudgetUsd()} reached`);
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

export async function record(route: string, model: string, usage: Usage): Promise<number> {
  const usd = costOf(model, usage);
  const l = await ledger();
  const r = l.byRoute[route] ?? { calls: 0, usd: 0 };
  await writeLedger({
    ...l,
    spentUsd: l.spentUsd + usd,
    calls: l.calls + 1,
    byRoute: { ...l.byRoute, [route]: { calls: r.calls + 1, usd: r.usd + usd } },
  });
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
  if (e instanceof ProviderError) return e.status === 429 ? "rate-limited" : `provider-${e.status || e.message}`;
  return "error";
}
