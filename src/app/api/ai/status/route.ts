import { monthlyBudgetUsd } from "@/config/ai";
import { AI_PROVIDER, MODELS } from "@/config/models";
import { caller, hasKey, ledger, remaining } from "@/server/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [l, who] = await Promise.all([ledger(), caller(req)]);
  const left = await remaining(who);
  // Spend details are for admins; everyone else sees whether the coach is on and their own allowance.
  const admin = who.role === "admin";
  return Response.json({
    enabled: hasKey(),
    provider: AI_PROVIDER.name,
    role: who.role,
    remaining: left,
    spentUsd: admin ? l.spentUsd : 0,
    calls: admin ? l.calls : 0,
    budgetUsd: admin ? monthlyBudgetUsd() : 0,
    month: l.month,
    models: MODELS,
    byRoute: admin ? l.byRoute : {},
  });
}
