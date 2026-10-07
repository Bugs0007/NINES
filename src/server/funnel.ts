/**
 * The admin funnel from the database side: signed up, finished level 1, finished each section. (Visited and
 * Started come from analytics, see src/server/posthog.ts, because guests have no row.) Pure, so it is tested.
 */
import { CHAPTERS } from "@/content/graph";
import { isSectionFinished, SECTIONS_WITH_LEVELS } from "@/content/progress-model";
import type { UserSection } from "./store";

export interface Funnel {
  signedUp: number;
  /** Accounts with at least one completed level. */
  finishedLevel1: number;
  sections: { section: string; title: string; finished: number }[];
}

export function computeFunnel(signedUp: number, rows: readonly UserSection[]): Funnel {
  const completedBy = new Map<string, Map<string, Set<string>>>(); // user -> section -> levels
  for (const r of rows) {
    const sections = completedBy.get(r.userId) ?? new Map<string, Set<string>>();
    sections.set(r.section, new Set(r.completed));
    completedBy.set(r.userId, sections);
  }
  const anyCompleted = [...completedBy.values()].filter((m) => [...m.values()].some((s) => s.size > 0)).length;
  const sections = SECTIONS_WITH_LEVELS.map((section) => ({
    section,
    title: CHAPTERS.find((c) => c.id === section)?.title ?? section,
    finished: [...completedBy.values()].filter((m) => isSectionFinished(section, m.get(section) ?? new Set())).length,
  }));
  return { signedUp, finishedLevel1: anyCompleted, sections };
}
