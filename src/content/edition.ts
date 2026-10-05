/**
 * Editions: everyone plays the public edition; accounts listed in OWNER_EMAILS get the owner's personal
 * edition (Case Intel callouts and Track D as the owner's own production app). Pure functions so content
 * tests can render either edition.
 */
import { OWNER_EDITION, TRACKS, type ChapterDef, type PlannedNode, type Track } from "./graph";
import type { ConceptPack } from "./schema";

export type Edition = "public" | "owner";

type SeenIn = ConceptPack["codex"]["seenIn"][number];

/** Codex "where you've seen it" lines for an edition. The owner sees personal lines first, then the rest. */
export function seenInFor(items: SeenIn[], edition: Edition): string[] {
  if (edition === "owner") return items.map((s) => (typeof s === "string" ? s : s.text));
  return items.filter((s): s is string => typeof s === "string");
}

export function nodeTitle(n: Pick<PlannedNode, "id" | "title">, edition: Edition): string {
  return edition === "owner" ? (OWNER_EDITION.titles[n.id] ?? n.title) : n.title;
}

export function trackName(t: Track, edition: Edition): { name: string; district: string } {
  return edition === "owner" && t === "D" ? OWNER_EDITION.trackD : TRACKS[t];
}

export function chapterFor<C extends Pick<ChapterDef, "id" | "title" | "stage" | "blurb">>(ch: C, edition: Edition): C {
  return edition === "owner" && ch.id === "d1" ? { ...ch, ...OWNER_EDITION.chapterD1 } : ch;
}
