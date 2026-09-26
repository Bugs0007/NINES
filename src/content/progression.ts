/**
 * What's playable: a node is available when all its prerequisites are built (bosses: all prereqs built).
 */
import { CHAPTERS, GRAPH, NODE_BY_ID, type PlannedNode } from "./graph";
import { BOSS_BY_ID, PACK_BY_ID } from "./packs";

export function isPlayable(id: string): boolean {
  return PACK_BY_ID.has(id) || BOSS_BY_ID.has(id);
}

export function hrefFor(n: PlannedNode): string {
  if (n.kind === "boss" || n.kind === "case") return `/boss/${n.id}`;
  if (n.kind === "incident") return `/incident/${n.id}`;
  return `/mission/${n.id}`;
}

export function unlocked(id: string, built: ReadonlySet<string>): boolean {
  const n = NODE_BY_ID.get(id);
  if (!n) return false;
  return n.prereqs.every((p) => built.has(p));
}

/** The next playable node in the same chapter after `id` (by graph order). */
export function nextMission(id: string): { href: string; label: string } | undefined {
  const n = NODE_BY_ID.get(id);
  if (!n) return undefined;
  const same = GRAPH.filter((g) => g.chapter === n.chapter);
  const i = same.findIndex((g) => g.id === id);
  for (const cand of same.slice(i + 1)) {
    if (isPlayable(cand.id)) return { href: hrefFor(cand), label: `Next: ${cand.title}` };
  }
  const ch = CHAPTERS.find((c) => c.id === n.chapter);
  return ch ? { href: `/campaign/${ch.id}`, label: `Back to ${ch.title}` } : undefined;
}
