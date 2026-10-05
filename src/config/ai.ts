/**
 * Spend and fairness limits for the AI coach. All env-tunable; defaults suit a free public launch.
 * Over any limit the game falls back to self-grading and scripted hints.
 */
import type { Role } from "@/server/store";

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
}

/** Hard monthly cap across everyone. */
export const DEFAULT_MONTHLY_BUDGET_USD = 5;
export function monthlyBudgetUsd(): number {
  const v = num("NINES_MONTHLY_BUDGET_USD", DEFAULT_MONTHLY_BUDGET_USD);
  return v > 0 ? v : DEFAULT_MONTHLY_BUDGET_USD;
}

/** Daily cap across everyone, so one busy day can't spend the month. Default: a tenth of the monthly cap. */
export function dailyBudgetUsd(): number {
  return num("NINES_DAILY_BUDGET_USD", monthlyBudgetUsd() / 10);
}

export type AiRoute = "grade" | "hint";

/** Calls per person per UTC day. Owner is unlimited (still under the global caps). */
export function dailyQuota(role: Role, route: AiRoute): number {
  if (role === "owner") return Infinity;
  const table: Record<Exclude<Role, "owner">, Record<AiRoute, [string, number]>> = {
    guest: { grade: ["NINES_GUEST_GRADES_PER_DAY", 5], hint: ["NINES_GUEST_HINTS_PER_DAY", 10] },
    player: { grade: ["NINES_PLAYER_GRADES_PER_DAY", 20], hint: ["NINES_PLAYER_HINTS_PER_DAY", 40] },
  };
  const [env, fallback] = table[role][route];
  return num(env, fallback);
}
