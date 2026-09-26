import { monthlyBudgetUsd } from "@/config/claude";
import { MODELS } from "@/config/models";
import { hasKey, ledger } from "@/server/claude";

export const dynamic = "force-dynamic";

export async function GET() {
  const l = await ledger();
  return Response.json({ enabled: hasKey(), spentUsd: l.spentUsd, calls: l.calls, budgetUsd: monthlyBudgetUsd(), month: l.month, models: MODELS, byRoute: l.byRoute });
}
