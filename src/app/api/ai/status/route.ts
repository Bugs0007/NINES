import { monthlyBudgetUsd } from "@/config/ai";
import { AI_PROVIDER, MODELS } from "@/config/models";
import { caller, hasKey, ledger, remaining } from "@/server/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [l, who] = await Promise.all([ledger(), caller(req)]);
  const left = await remaining(who);
  // Spend details are for the owner; everyone else sees whether the coach is on and their own allowance.
  const owner = who.role === "owner";
  return Response.json({
    enabled: hasKey(),
    provider: AI_PROVIDER.name,
    role: who.role,
    remaining: left,
    spentUsd: owner ? l.spentUsd : 0,
    calls: owner ? l.calls : 0,
    budgetUsd: owner ? monthlyBudgetUsd() : 0,
    month: l.month,
    models: MODELS,
    byRoute: owner ? l.byRoute : {},
  });
}
