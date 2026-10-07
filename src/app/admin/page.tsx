import { notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { dailyBudgetUsd, monthlyBudgetUsd } from "@/config/ai";
import { computeFunnel } from "@/server/funnel";
import { analyticsCounts, posthogConfigured } from "@/server/posthog";
import { dayKey, store } from "@/server/store";

export const dynamic = "force-dynamic";

const fmtUsd = (x: number) => `$${x.toFixed(x < 10 ? 2 : 0)}`;
const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const u = await currentUser();
  // Role comes from the server (ADMIN_EMAILS); anyone else gets a plain 404, not a hint that this page exists.
  if (u?.role !== "admin") notFound();
  const day = dayKey();
  const [stats, month, today, feedback, users, bySection, counts] = await Promise.all([
    store().stats(),
    store().spend(day.slice(0, 7)),
    store().spend(day),
    store().listFeedback(100),
    store().listUsers(500),
    store().completedBySection(),
    analyticsCounts(),
  ]);
  const funnel = computeFunnel(stats.users, bySection);
  const cards: [string, string][] = [
    ["Signups", String(stats.users)],
    ["Active in 7 days", String(stats.active7d)],
    ["Synced saves", String(stats.withSave)],
    ["AI spend this month", `${fmtUsd(month.usd)} / ${fmtUsd(monthlyBudgetUsd())}`],
    ["AI spend today", `${fmtUsd(today.usd)} / ${fmtUsd(dailyBudgetUsd())}`],
    ["Quota hits today", String(stats.quotaHitsToday)],
  ];
  // One row per step. `n` is null when it can't be measured (analytics not configured).
  const steps: { label: string; n: number | null; note?: string }[] = [
    { label: "Visited", n: counts?.visit ?? null, note: "analytics" },
    { label: "Started a level", n: counts?.level_started ?? null, note: "analytics" },
    { label: "Signed up", n: funnel.signedUp, note: "accounts" },
    { label: "Finished level 1", n: funnel.finishedLevel1, note: "accounts with a completed level" },
    ...funnel.sections.map((s) => ({ label: `Finished ${s.title}`, n: s.finished, note: `section ${s.section.toUpperCase()}: every mission and the boss` })),
  ];
  const pct = (i: number) => {
    const prev = steps[i - 1]?.n;
    const n = steps[i]?.n;
    return i > 0 && prev && n !== null && n !== undefined && prev > 0 ? `${Math.round((n / prev) * 100)}%` : "";
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 lg:px-8">
      <div className="eyebrow text-sm text-sky">Admin</div>
      <h1 className="mt-1 font-display text-4xl font-semibold text-ink-0">Admin</h1>
      <p className="mt-2 text-sm text-ink-2">Guests appear only in anonymous analytics counts, AI usage and feedback; their progress never leaves their browser.</p>

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
            <div className="eyebrow text-xs text-ink-2">{k}</div>
            <div className="mt-1 font-display text-3xl font-semibold tabular text-ink-0">{v}</div>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
        <h2 className="font-display text-xl font-semibold text-ink-0">Funnel</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <tbody>
              {steps.map((s, i) => (
                <tr key={s.label} className="border-t border-line/60 first:border-t-0">
                  <td className="py-2 pr-3 text-ink-0">{s.label}</td>
                  <td className="py-2 pr-3 text-right font-medium tabular text-ink-0">{s.n ?? "n/a"}</td>
                  <td className="w-14 py-2 pr-3 text-right tabular text-ink-2">{pct(i)}</td>
                  <td className="hidden py-2 text-xs text-ink-3 sm:table-cell">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!posthogConfigured() && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Visited and Started come from analytics. Set NEXT_PUBLIC_POSTHOG_KEY to collect them, and POSTHOG_PROJECT_ID plus POSTHOG_PERSONAL_API_KEY to show them here (SUPABASE_SETUP.md, PostHog step); until then they read n/a. Visit counts are per page load, not unique people.
          </p>
        )}
        {posthogConfigured() && !counts && <p className="mt-3 text-xs text-alert">Analytics is configured but the query failed. Check the project id, the API key scope and POSTHOG_API_HOST.</p>}
      </section>

      <section className="mt-6 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
        <h2 className="font-display text-xl font-semibold text-ink-0">Players ({users.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="pb-2 pr-3 font-medium">Email</th>
                <th className="pb-2 pr-3 font-medium">Signed up</th>
                <th className="pb-2 pr-3 font-medium">Last active</th>
                <th className="pb-2 text-right font-medium">Levels done / started</th>
              </tr>
            </thead>
            <tbody>
              {users.map((p) => (
                <tr key={p.id} className="border-t border-line/60">
                  <td className="max-w-[16rem] truncate py-2 pr-3 text-ink-0">{p.email ?? p.displayName ?? p.id}</td>
                  <td className="py-2 pr-3 tabular text-ink-2">{fmtDate(p.createdAt)}</td>
                  <td className="py-2 pr-3 tabular text-ink-2">{fmtDate(p.lastActiveAt)}</td>
                  <td className="py-2 text-right tabular text-ink-0">
                    {p.completedLevels} / {p.startedLevels}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-ink-3">
                    No signups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                <span className="tabular">{fmtDate(f.at)}</span> · {f.email ?? "guest"} · {f.page || "unknown page"}
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
