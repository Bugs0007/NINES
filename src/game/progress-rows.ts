/**
 * Turn the local save into the rows the server stores (see src/content/progress-model.ts). Pure: the same save
 * always gives the same rows, so uploading twice is harmless.
 */
import { BOSS_BY_ID, PACK_BY_ID } from "@/content/packs";
import { LEVEL_BY_ID, type ClientRow } from "@/content/progress-model";
import type { ConceptProgress, GameEvent, Profile } from "./db";

const percent = (stars: number, max: number) => Math.round((Math.min(Math.max(stars, 0), max) / Math.max(1, max)) * 100);

export function deriveRows(concepts: readonly ConceptProgress[], profile: Pick<Profile, "bossesBeaten" | "incidentsResolved">, events: readonly GameEvent[]): ClientRow[] {
  const rows = new Map<string, ClientRow>();
  const put = (r: ClientRow) => rows.set(r.level, r);

  // Levels the player has started but not finished: any activity recorded against them.
  const touched = new Set(events.filter((e) => e.conceptId && ["prediction", "challenge", "hint", "explain"].includes(e.type)).map((e) => e.conceptId!));
  for (const id of touched) {
    const node = LEVEL_BY_ID.get(id);
    if (node) put({ section: node.chapter, level: id, status: "in_progress", score: null, attempts: 0 });
  }

  for (const c of concepts) {
    const node = LEVEL_BY_ID.get(c.id);
    if (!node || !c.builtAt) continue;
    const max = PACK_BY_ID.get(c.id)?.challenges[0]?.stars.length ?? 0;
    put({ section: node.chapter, level: c.id, status: "completed", score: percent(c.bestStars, max), attempts: Math.min(c.missionRuns, 1000) });
  }

  for (const id of profile.bossesBeaten) {
    const node = LEVEL_BY_ID.get(id);
    if (!node) continue;
    const runs = events.filter((e) => e.type === "boss" && e.conceptId === id);
    const stars = Math.max(0, ...runs.map((e) => Number(e.data?.stars) || 0));
    const max = BOSS_BY_ID.get(id)?.challenge.stars.length ?? 0;
    put({ section: node.chapter, level: id, status: "completed", score: percent(stars, max), attempts: Math.min(Math.max(1, runs.length), 1000) });
  }

  for (const id of profile.incidentsResolved) {
    const node = LEVEL_BY_ID.get(id);
    if (!node) continue;
    const runs = events.filter((e) => e.type === "incident" && e.conceptId === id).length;
    put({ section: node.chapter, level: id, status: "completed", score: null, attempts: Math.min(Math.max(1, runs), 1000) });
  }

  return [...rows.values()];
}
