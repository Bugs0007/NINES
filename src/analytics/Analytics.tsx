"use client";
/**
 * Anonymous product analytics (PostHog), only when NEXT_PUBLIC_POSTHOG_KEY is set. What it records: that a screen
 * was reached and that a level or section was finished, as counts. It never records what you type, never sets
 * cookies (the id lives in memory and ends with the page), never creates person profiles, and stays off if you
 * switch it off in Settings or your browser sends Do Not Track. See /privacy.
 */
import { useEffect } from "react";
import { isSectionFinished, LEVEL_BY_ID } from "@/content/progress-model";
import { useGame } from "@/game/store";
import { setAnalyticsSink, track } from "./track";

const KEY = "nines:analytics";

export const analyticsConfigured = () => !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function analyticsOptedOut(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "off" || navigator.doNotTrack === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(off: boolean): void {
  try {
    if (off) window.localStorage.setItem(KEY, "off");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
  if (off) setAnalyticsSink(null);
}

export function Analytics() {
  const hydrated = useGame((s) => s.hydrated);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || analyticsOptedOut()) return;
    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        persistence: "memory",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        respect_dnt: true,
      });
      setAnalyticsSink((event, props) => posthog.capture(event, props));
      track("visit");
    });
    return () => {
      cancelled = true;
      setAnalyticsSink(null);
    };
  }, []);

  // Level and section completions, noticed from the save itself so no screen has to remember to report them.
  useEffect(() => {
    if (!hydrated) return;
    const doneOf = () => {
      const s = useGame.getState();
      return new Set([...Object.values(s.concepts).filter((c) => c.builtAt).map((c) => c.id), ...s.profile.bossesBeaten, ...s.profile.incidentsResolved]);
    };
    let prev = doneOf();
    return useGame.subscribe(() => {
      const now = doneOf();
      for (const id of now) {
        if (prev.has(id)) continue;
        const section = LEVEL_BY_ID.get(id)?.chapter;
        if (!section) continue;
        track("level_completed", { section, level: id, first: prev.size === 0 });
        if (isSectionFinished(section, now) && !isSectionFinished(section, prev)) track("section_completed", { section });
      }
      prev = now;
    });
  }, [hydrated]);

  return null;
}
