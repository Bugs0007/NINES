/** Hard monthly budget for Claude calls. Override with NINES_MONTHLY_BUDGET_USD in .env.local. */
export const DEFAULT_MONTHLY_BUDGET_USD = 5;

export function monthlyBudgetUsd(): number {
  const v = Number(process.env.NINES_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MONTHLY_BUDGET_USD;
}
