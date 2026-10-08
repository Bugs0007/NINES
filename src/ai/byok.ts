"use client";
/**
 * Bring your own key. A player can use their own Groq or Claude (Anthropic) API key for the AI coach.
 *
 *   - The key is stored only in this browser (localStorage). It is never sent to NINES servers, never part of
 *     the synced save or the export file, never in analytics, and it isn't used by any server route.
 *   - Requests go straight from the browser to the provider (api.groq.com or api.anthropic.com), so the provider
 *     bills the player's own account and our daily allowance and budget don't apply.
 *   - Anyone with access to this browser profile (or a script injected into this site) could read the key, so the
 *     Settings screen tells people to remove it on shared computers.
 *
 * No React in here beyond the "use client" marker: pure request building and parsing, so it is unit tested.
 */
import { BYOK_MODELS } from "@/config/models";
import { GRADE_JSON_SCHEMA } from "./schemas";

export type ByokProvider = "groq" | "anthropic";

export const PROVIDERS: Record<ByokProvider, { name: string; host: string; keysUrl: string; prefix: string; hint: string }> = {
  groq: { name: "Groq", host: "api.groq.com", keysUrl: "https://console.groq.com/keys", prefix: "gsk_", hint: "Starts with gsk_" },
  anthropic: { name: "Claude (Anthropic)", host: "api.anthropic.com", keysUrl: "https://console.anthropic.com/settings/keys", prefix: "sk-ant-", hint: "Starts with sk-ant-" },
};

const STORE_KEY = "nines:byok";

export interface StoredKey {
  provider: ByokProvider;
  key: string;
}

export function getByok(): StoredKey | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredKey>;
    return (v.provider === "groq" || v.provider === "anthropic") && typeof v.key === "string" && v.key ? { provider: v.provider, key: v.key } : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser won't let us store it (private mode, blocked storage). */
export function setByok(provider: ByokProvider, key: string): boolean {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ provider, key: key.trim() }));
    return true;
  } catch {
    return false;
  }
}

export function clearByok(): void {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing stored, or storage blocked */
  }
}

/** "gsk_…a1b2": enough to recognise a key without showing it. */
export function maskKey(key: string): string {
  return key.length <= 10 ? "…" : `${key.slice(0, key.startsWith("sk-ant-") ? 7 : 4)}…${key.slice(-4)}`;
}

/** A light sanity check before saving; the real test is "Test key". Null when it looks fine. */
export function keyProblem(provider: ByokProvider, key: string): string | null {
  const k = key.trim();
  if (!k) return "Paste your key first.";
  if (/\s/.test(k)) return "A key has no spaces. Copy it again without the extra characters.";
  if (!k.startsWith(PROVIDERS[provider].prefix)) return `A ${PROVIDERS[provider].name} key ${PROVIDERS[provider].hint.toLowerCase()}. Check you picked the right provider.`;
  if (k.length < 20) return "That looks too short to be a full key.";
  return null;
}

export interface ByokCall {
  kind: "grade" | "hint" | "test";
  system: string;
  user: string;
  maxTokens: number;
}

export type ByokFailure = "invalid-key" | "rate-limited" | "network" | "no-output" | `provider-${number}`;

export function buildRequest(provider: ByokProvider, key: string, call: ByokCall): { url: string; init: RequestInit } {
  const json = { "content-type": "application/json" };
  if (provider === "groq") {
    const model = call.kind === "grade" ? BYOK_MODELS.groq.grader : BYOK_MODELS.groq.fast;
    const body = {
      model,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
      max_completion_tokens: call.maxTokens,
      reasoning_effort: call.kind === "grade" ? "medium" : "low",
      include_reasoning: false,
      ...(call.kind === "grade" ? { response_format: { type: "json_schema", json_schema: { name: "grade", strict: true, schema: GRADE_JSON_SCHEMA } } } : {}),
    };
    return { url: "https://api.groq.com/openai/v1/chat/completions", init: { method: "POST", headers: { ...json, authorization: `Bearer ${key}` }, body: JSON.stringify(body) } };
  }
  const body = {
    model: call.kind === "grade" ? BYOK_MODELS.anthropic.grader : BYOK_MODELS.anthropic.fast,
    max_tokens: call.maxTokens,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
    // A forced tool call is how Claude returns strictly structured output.
    ...(call.kind === "grade"
      ? { tools: [{ name: "submit_grade", description: "Submit the grade for the player's answer.", input_schema: GRADE_JSON_SCHEMA }], tool_choice: { type: "tool", name: "submit_grade" } }
      : {}),
  };
  return {
    url: "https://api.anthropic.com/v1/messages",
    // Anthropic requires this header to allow calls straight from a browser: the key is the player's own.
    init: { method: "POST", headers: { ...json, "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(body) },
  };
}

/** Pull the answer out of a provider response: parsed JSON for a grade, text otherwise. Null when there is none. */
export function parseResponse(provider: ByokProvider, call: ByokCall, data: unknown): { json?: unknown; text?: string } | null {
  if (provider === "groq") {
    const text = (data as { choices?: { message?: { content?: string | null } }[] })?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return null;
    if (call.kind !== "grade") return { text };
    try {
      return { json: JSON.parse(text) };
    } catch {
      return null;
    }
  }
  const blocks = (data as { content?: { type: string; text?: string; input?: unknown }[] })?.content ?? [];
  if (call.kind === "grade") {
    const tool = blocks.find((b) => b.type === "tool_use");
    return tool?.input ? { json: tool.input } : null;
  }
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  return text ? { text } : null;
}

export function failureFor(status: number): ByokFailure {
  if (status === 401 || status === 403) return "invalid-key";
  if (status === 429) return "rate-limited";
  return `provider-${status}`;
}

export const BYOK_FAILURE_TEXT: Record<string, string> = {
  "invalid-key": "The provider rejected this key. Check it is correct, active, and has credit.",
  "rate-limited": "The provider says you're sending too many requests, or out of quota. Try again shortly.",
  network: "Couldn't reach the provider from this browser. Check your connection or any extension that blocks requests.",
  "no-output": "The provider answered, but not in the shape we expected.",
};

export function describeFailure(f: ByokFailure): string {
  return BYOK_FAILURE_TEXT[f] ?? `The provider returned an error (${f.replace("provider-", "HTTP ")}).`;
}

let lastFailure: ByokFailure | null = null;
/** Why the last call with the player's key failed, for Settings to show. */
export const lastByokFailure = () => lastFailure;

/** One call with the player's own key, straight to the provider. Resolves to a failure code rather than throwing. */
export async function byokComplete(call: ByokCall): Promise<{ ok: true; json?: unknown; text?: string } | { ok: false; failure: ByokFailure }> {
  const stored = getByok();
  if (!stored) return { ok: false, failure: "invalid-key" };
  const { url, init } = buildRequest(stored.provider, stored.key, call);
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    lastFailure = "network";
    return { ok: false, failure: "network" };
  }
  if (!res.ok) {
    lastFailure = failureFor(res.status);
    return { ok: false, failure: lastFailure };
  }
  const parsed = parseResponse(stored.provider, call, await res.json().catch(() => null));
  if (!parsed) {
    lastFailure = "no-output";
    return { ok: false, failure: "no-output" };
  }
  lastFailure = null;
  return { ok: true, ...parsed };
}

/** A tiny request to check a key works before the player relies on it. */
export function testKey(): ReturnType<typeof byokComplete> {
  return byokComplete({ kind: "test", system: "Reply with the single word: ready", user: "ping", maxTokens: 64 });
}
