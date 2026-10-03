import { monthlyBudgetUsd } from "@/config/ai";
import { AI_PROVIDER, MODELS } from "@/config/models";
import { hasKey, ledger } from "@/server/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const l = await ledger();
  return Response.json({ enabled: hasKey(), provider: AI_PROVIDER.name, spentUsd: l.spentUsd, calls: l.calls, budgetUsd: monthlyBudgetUsd(), month: l.month, models: MODELS, byRoute: l.byRoute });
}
