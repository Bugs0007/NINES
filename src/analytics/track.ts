/**
 * Product analytics, behind one function. Events are anonymous counts of what players do (a screen reached, a
 * level finished), never content they type. It does nothing until analytics is configured (src/analytics/posthog.ts)
 * and does nothing when the player has opted out in Settings or sends Do Not Track.
 */
export type AnalyticsEvent =
  | "visit"
  | "briefing_started"
  | "briefing_done"
  | "briefing_skipped"
  | "tour_started"
  | "tour_done"
  | "tour_skipped"
  | "level_started"
  | "level_completed"
  | "section_completed"
  | "signup_prompt_shown"
  | "signup_prompt_dismissed"
  | "signup_clicked"
  | "signed_up";

type Sink = (event: AnalyticsEvent, props?: Record<string, string | number | boolean>) => void;

let sink: Sink | null = null;

/** Set by the analytics provider once PostHog is ready. */
export function setAnalyticsSink(s: Sink | null): void {
  sink = s;
}

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  try {
    sink?.(event, props);
  } catch {
    /* analytics must never break the game */
  }
}
