/**
 * What's playable: a node is available when all its prerequisites are built (bosses: all prereqs built).
 */
import { CHAPTERS, GRAPH, NODE_BY_ID, type PlannedNode } from "./graph";
import { INCIDENT_BY_ID } from "@/incident";
import { CONCEPT_LEARNING } from "./learning";
import { BOSS_BY_ID, PACK_BY_ID } from "./packs";

/** Built in this release: a concept pack, a boss, or an incident scenario. */
export function isPlayable(id: string): boolean {
  return PACK_BY_ID.has(id) || BOSS_BY_ID.has(id) || INCIDENT_BY_ID.has(id);
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

// ---------------------------------------------------------------- what to do next, and why something is locked

export interface NextStep {
  kind: "repair" | "build" | "boss" | "incident" | "done";
  title: string;
  why: string;
  href: string;
  cta: string;
  minutes?: number;
}

/**
 * The single best thing to do now, for the HQ "next step" prompt. `done` holds every concept built, boss beaten
 * and incident resolved. Repairs come first (forgetting compounds), then the next mission in graph order, then a
 * boss, then an incident.
 */
export function nextStep(done: ReadonlySet<string>, dueCount: number): NextStep {
  if (dueCount > 0) {
    const minutes = Math.max(6, Math.min(15, Math.round(dueCount * 1.4 + 5)));
    return {
      kind: "repair",
      title: `${dueCount} service${dueCount === 1 ? " needs" : "s need"} a repair`,
      why: "A short review brings them back before they rust further.",
      href: "/shift",
      cta: "Start the daily shift",
      minutes,
    };
  }
  const open = (n: PlannedNode) => isPlayable(n.id) && !done.has(n.id) && n.prereqs.every((p) => done.has(p));
  const mission = GRAPH.find((n) => n.kind === "concept" && open(n));
  if (mission) {
    const pack = PACK_BY_ID.get(mission.id);
    return { kind: "build", title: mission.title, why: CONCEPT_LEARNING[mission.id]?.canDo ?? mission.interaction, href: hrefFor(mission), cta: done.size === 0 ? "Start level 1" : "Build it", minutes: pack?.estimatedMinutes };
  }
  const boss = GRAPH.find((n) => (n.kind === "boss" || n.kind === "case") && open(n));
  if (boss) {
    const b = BOSS_BY_ID.get(boss.id);
    return { kind: "boss", title: boss.title.replace(/^Boss: /, ""), why: CONCEPT_LEARNING[boss.id]?.canDo ?? "Everything from this chapter, at once.", href: hrefFor(boss), cta: "Face the boss", minutes: b?.estimatedMinutes };
  }
  const incident = GRAPH.find((n) => n.kind === "incident" && open(n));
  if (incident) return { kind: "incident", title: incident.title.replace(/^INC(-\d+)?: /, ""), why: CONCEPT_LEARNING[incident.id]?.canDo ?? "A live page on the simulation.", href: hrefFor(incident), cta: "Take the page" };
  return { kind: "done", title: "Every service in this build is online", why: "More chapters are on the way. Meanwhile, a shift keeps what you built from fading.", href: "/shift", cta: "Run a shift" };
}

/** Why a node can't be started yet, in plain words, or null when it can. */
export function lockReason(id: string, done: ReadonlySet<string>): string | null {
  const n = NODE_BY_ID.get(id);
  if (!n || done.has(id)) return null;
  const missing = n.prereqs.filter((p) => !done.has(p)).map((p) => NODE_BY_ID.get(p)?.title.replace(/^(Boss|INC-\d+|INC): /, "") ?? p);
  if (missing.length) return `Unlocks after you finish ${missing.length > 3 ? `${missing.slice(0, 3).join(", ")} and ${missing.length - 3} more` : missing.join(", ")}.`;
  if (!isPlayable(id)) return "Planned for a later release. It isn't built yet.";
  return null;
}
