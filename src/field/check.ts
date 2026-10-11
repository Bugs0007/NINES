import type { FieldCheck, FieldMission } from "./types";

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
}

export function runChecks(checks: readonly FieldCheck[], text: string): CheckResult[] {
  return checks.map((c) => {
    let ok = false;
    try {
      ok = new RegExp(c.pattern, c.flags ?? "i").test(text);
    } catch {
      ok = false;
    }
    return { id: c.id, label: c.label, ok };
  });
}

/** XP after hints: each opened hint costs its price, never below a fifth of the reward. */
export function fieldXp(m: FieldMission, hintsOpened: number): number {
  const spent = m.hints.slice(0, hintsOpened).reduce((s, h) => s + h.cost, 0);
  return Math.max(Math.round(m.xp * 0.2), m.xp - spent);
}

/** The grader's request fields are capped, so keep the tail of long pastes (the end of a log is the result). */
export function trimProof(text: string, max = 1900): string {
  const t = text.trim();
  return t.length <= max ? t : `…${t.slice(t.length - (max - 1))}`;
}
