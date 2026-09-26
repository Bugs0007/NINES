"use client";
/**
 * Browser-side helpers for the Claude routes. Every call returns null when Claude is unavailable
 * (no key, budget reached, network), and callers fall back to offline behaviour.
 */
import type { GradeRequest, GradeResult, HintRequest } from "./schemas";

export interface ClaudeStatus {
  enabled: boolean;
  spentUsd: number;
  calls: number;
  budgetUsd: number;
  month: string;
}

let statusCache: { at: number; v: ClaudeStatus | null } | null = null;

export async function claudeStatus(force = false): Promise<ClaudeStatus | null> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.v;
  try {
    const r = await fetch("/api/claude/status", { cache: "no-store" });
    const v = (await r.json()) as ClaudeStatus;
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
  const r = await post<{ result: GradeResult }>("/api/claude/grade", req);
  return r?.result ?? null;
}

export async function askSre(req: HintRequest): Promise<string | null> {
  const r = await post<{ hint: string }>("/api/claude/hint", req);
  return r?.hint ?? null;
}

export async function claudeTokenCount(text: string): Promise<number | null> {
  const r = await post<{ tokens: number }>("/api/claude/count-tokens", { text });
  return r?.tokens ?? null;
}
