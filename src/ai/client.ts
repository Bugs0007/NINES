"use client";
/**
 * Browser-side helpers for the AI routes. Every call returns null when the AI coach is unavailable
 * (no key, budget reached, rate limited, network), and callers fall back to offline behaviour.
 */
import type { GradeRequest, GradeResult, HintRequest } from "./schemas";

export interface AiStatus {
  enabled: boolean;
  provider: string;
  spentUsd: number;
  calls: number;
  budgetUsd: number;
  month: string;
}

let statusCache: { at: number; v: AiStatus | null } | null = null;

export async function aiStatus(force = false): Promise<AiStatus | null> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.v;
  try {
    const r = await fetch("/api/ai/status", { cache: "no-store" });
    const v = (await r.json()) as AiStatus;
    statusCache = { at: Date.now(), v };
    return v;
  } catch {
    statusCache = { at: Date.now(), v: null };
    return null;
  }
}

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json()) as { ok: boolean } & T;
    statusCache = null;
    return j.ok ? j : null;
  } catch {
    return null;
  }
}

export async function gradeExplanation(req: GradeRequest): Promise<GradeResult | null> {
  const r = await post<{ result: GradeResult }>("/api/ai/grade", req);
  return r?.result ?? null;
}

export async function askSre(req: HintRequest): Promise<string | null> {
  const r = await post<{ hint: string }>("/api/ai/hint", req);
  return r?.hint ?? null;
}
