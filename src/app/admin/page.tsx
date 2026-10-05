import { notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { dailyBudgetUsd, monthlyBudgetUsd } from "@/config/ai";
import { dayKey, store } from "@/server/store";

export const dynamic = "force-dynamic";

const fmtUsd = (x: number) => `$${x.toFixed(x < 10 ? 2 : 0)}`;
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const u = await currentUser();
  if (u?.role !== "owner") notFound();
  const day = dayKey();
  const [stats, month, today, feedback] = await Promise.all([store().stats(), store().spend(day.slice(0, 7)), store().spend(day), store().listFeedback(100)]);
  const cards: [string, string][] = [
    ["Accounts", String(stats.users)],
    ["Active in 7 days", String(stats.active7d)],
    ["Synced saves", String(stats.withProgress)],
    ["AI spend this month", `${fmtUsd(month.usd)} / ${fmtUsd(monthlyBudgetUsd())}`],
    ["AI spend today", `${fmtUsd(today.usd)} / ${fmtUsd(dailyBudgetUsd())}`],
    ["Quota hits today", String(stats.quotaHitsToday)],
  ];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 lg:px-8">
      <div className="eyebrow text-sm text-sky">Owner</div>
      <h1 className="mt-1 font-display text-4xl font-semibold text-ink-0">Admin</h1>
      <p className="mt-2 text-sm text-ink-2">Guests are counted only through AI usage and feedback; their progress never leaves their browser.</p>
      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
            <div className="eyebrow text-xs text-ink-2">{k}</div>
            <div className="mt-1 font-display text-3xl font-semibold tabular text-ink-0">{v}</div>
          </div>
        ))}
      </section>
      <section className="mt-6 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
        <h2 className="font-display text-xl font-semibold text-ink-0">AI usage this month</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {Object.entries(month.byRoute).map(([r, v]) => (
              <tr key={r} className="border-t border-line/60">
                <td className="py-2 font-mono text-xs text-ink-1">{r}</td>
                <td className="py-2 text-right tabular text-ink-2">{v.calls} calls</td>
                <td className="py-2 pl-4 text-right font-medium tabular text-ink-0">{fmtUsd(v.usd)}</td>
              </tr>
            ))}
            {Object.keys(month.byRoute).length === 0 && (
              <tr>
                <td className="py-2 text-ink-3">No AI calls yet this month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="mt-6">
        <h2 className="font-display text-xl font-semibold text-ink-0">Feedback ({feedback.length})</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3">
          {feedback.map((f) => (
            <li key={f.id} className="rounded-lg border border-line/80 bg-bg-1/75 p-4 shadow-card">
              <div className="text-xs text-ink-3">
                <span className="tabular">{new Date(f.at).toISOString().slice(0, 16).replace("T", " ")}</span> · {f.email ?? "guest"} · {f.page || "unknown page"}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-0">{f.message}</p>
            </li>
          ))}
          {feedback.length === 0 && <li className="text-sm text-ink-3">No feedback yet.</li>}
        </ul>
      </section>
    </main>
  );
}
