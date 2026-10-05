"use client";
/**
 * Browser-side helpers for the AI routes. Every call returns null when the AI coach is unavailable
 * (no key, budget reached, rate limited, network), and callers fall back to offline behaviour.
 */
import type { GradeRequest, GradeResult, HintRequest } from "./schemas";

export interface AiStatus {
  enabled: boolean;
  /** A key is configured on the server (true even when switched off in this browser). */
  keyConfigured?: boolean;
  provider: string;
  role?: "guest" | "player" | "owner";
  /** Calls left today for this caller (null = unlimited). */
  remaining?: { grade: number | null; hint: number | null };
  spentUsd: number;
  calls: number;
  budgetUsd: number;
  month: string;
}

let statusCache: { at: number; v: AiStatus | null } | null = null;

/** Per-browser switch: the player can turn the AI coach off (Settings), and e2e runs start with it off. */
const OFF_KEY = "nines:ai";

export function aiCoachOn(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(OFF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAiCoachOn(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(OFF_KEY);
    else window.localStorage.setItem(OFF_KEY, "off");
  } catch {
    /* storage blocked: the setting just doesn't stick */
  }
  statusCache = null;
}

export async function aiStatus(force = false): Promise<AiStatus | null> {
  if (!force && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.v;
  try {
    const r = await fetch("/api/ai/status", { cache: "no-store" });
    const raw = (await r.json()) as AiStatus;
    // Switched off in this browser: report the coach as unavailable so every caller takes the offline path.
    const v = { ...raw, keyConfigured: raw.enabled, enabled: raw.enabled && aiCoachOn() };
    statusCache = { at: Date.now(), v };
    return v;
  } catch {
    statusCache = { at: Date.now(), v: null };
    return null;
  }
}

async function post<T>(url: string, body: unknown): Promise<T | null> {
  if (!aiCoachOn()) return null;
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
