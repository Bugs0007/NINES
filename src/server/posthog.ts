import "server-only";
/**
 * Visit and start counts for the admin funnel, read back from PostHog. Optional: needs POSTHOG_PROJECT_ID and a
 * personal API key (POSTHOG_PERSONAL_API_KEY, "query read" scope). Returns null when not configured or when the
 * query fails, and the admin page then points at the setup steps instead.
 */
export interface AnalyticsCounts {
  visit: number;
  briefing_done: number;
  level_started: number;
  signup_prompt_shown: number;
  signup_clicked: number;
}

export function posthogConfigured(): boolean {
  return !!process.env.POSTHOG_PROJECT_ID && !!process.env.POSTHOG_PERSONAL_API_KEY;
}

function apiHost(): string {
  if (process.env.POSTHOG_API_HOST) return process.env.POSTHOG_API_HOST.replace(/\/$/, "");
  // The ingestion host (us.i.posthog.com) differs from the API host (us.posthog.com).
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(".i.posthog.com", ".posthog.com").replace(/\/$/, "");
}

export async function analyticsCounts(days = 90): Promise<AnalyticsCounts | null> {
  if (!posthogConfigured()) return null;
  try {
    const res = await fetch(`${apiHost()}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `SELECT event, count(DISTINCT distinct_id) FROM events WHERE event IN ('visit', 'briefing_done', 'level_started', 'signup_prompt_shown', 'signup_clicked') AND timestamp > now() - INTERVAL ${Math.max(1, Math.floor(days))} DAY GROUP BY event`,
        },
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: [string, number][] };
    const out: AnalyticsCounts = { visit: 0, briefing_done: 0, level_started: 0, signup_prompt_shown: 0, signup_clicked: 0 };
    for (const [event, n] of json.results ?? []) if (event in out) out[event as keyof AnalyticsCounts] = Number(n);
    return out;
  } catch {
    return null;
  }
}
