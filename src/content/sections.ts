/**
 * The sections of NINES, named once. Every label the player sees for a section (the HQ dock, chapter and
 * page headers, intros, progress screens, tooltips) comes from here, and the bracketed contents are generated
 * from what is actually built (the graph, the pack registry, the incident registry), so a label cannot drift
 * from the section it names. Lists show only content that exists in this build (D-015).
 *
 * Pure data and functions: no React, so tests can import it.
 */
import { INCIDENTS } from "@/incident";
import { CHAPTERS, GRAPH, TRACKS, type PlannedNode, type Track } from "./graph";
import { CONCEPT_LEARNING, SECTION_LEARNING } from "./learning";
import { PACKS } from "./packs";
import type { ReviewFormat } from "./schema";

export type SectionId = "core-grid" | "agent-foundry" | "daily-shift" | "incident-room" | "codex";

export interface SectionDetail {
  heading: string;
  points: string[];
}

export interface Section {
  id: SectionId;
  /** The place's name: "Core Grid". */
  name: string;
  /** Plain-language area, shown before the contents: "System Design". */
  area: string;
  href: string;
  /** The bracket text, short: "System Design: Latency Numbers, Little's Law, …". */
  short: string;
  /** The full label: "Core Grid (System Design: …)". */
  label: string;
  /** The fuller breakdown shown on expand. */
  detail: SectionDetail[];
  /** The company department this section stands for in the story. */
  department: string;
  /** One line tying the section to the Pigeon story, shown at the top of the section (after the department). */
  story: string;
}

const SHORT_LIST = 3;

const TRACK_SECTION: Partial<Record<Track, SectionId>> = { A: "core-grid", B: "agent-foundry" };

const REVIEW_FORMAT_NAMES: Record<ReviewFormat, string> = {
  "pick-fix": "pick the fix",
  "spot-flaw": "spot the flaw",
  estimate: "estimate",
  order: "put in order",
  "predict-graph": "predict the graph",
  explain: "explain",
  tune: "tune a dial",
};

const STORY: Record<SectionId, { department: string; story: string }> = {
  "core-grid": { department: "Platform Engineering", story: "You keep Pigeon standing while traffic doubles every week." },
  "agent-foundry": { department: "The AI team", story: "You own Pigeon Copilot, the feature the board wants in everything." },
  "daily-shift": { department: "Morning rounds", story: "Before the day starts, you walk the services that are starting to rust." },
  "incident-room": { department: "On-call", story: "When the pager goes, the page is yours until the service is healthy." },
  codex: { department: "The team wiki", story: "What Pigeon's engineers wrote down so nobody learns it twice at 3 a.m." },
};

const isBuilt = (n: PlannedNode) => n.status === "built" || n.status === "verified";

function stripPrefix(title: string): string {
  return title.replace(/^(Boss|Case|INC-\d+|INC|Field): /, "");
}

function trackSection(id: SectionId, track: Track): Section {
  const built = GRAPH.filter((n) => n.track === track && isBuilt(n));
  const concepts = built.filter((n) => n.kind === "concept");
  const topics = concepts.map((n) => n.title);
  const area = TRACKS[track].name;
  const more = topics.length - SHORT_LIST;
  const short = `${area}: ${topics.slice(0, SHORT_LIST).join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
  const detail: SectionDetail[] = CHAPTERS.filter((c) => c.track === track)
    .map((c) => {
      const nodes = built.filter((n) => n.chapter === c.id);
      return {
        heading: `${c.id.toUpperCase()} · ${c.title}`,
        points: nodes.map((n) => {
          const kind = n.kind === "boss" ? "Boss: " : n.kind === "incident" ? "Incident: " : "";
          const can = CONCEPT_LEARNING[n.id]?.canDo;
          return `${kind}${stripPrefix(n.title)}${can ? `: ${can}` : ""}`;
        }),
      };
    })
    .filter((d) => d.points.length > 0);
  return { id, name: TRACKS[track].district, area, href: track === "A" ? "/campaign/a1" : "/foundry", short, label: "", detail, ...STORY[id] };
}

function shiftSection(): Section {
  const reviews = PACKS.flatMap((p) => p.reviews);
  const formats = [...new Set(reviews.map((r) => r.format))];
  const short = `Spaced review: ${reviews.length} questions in ${formats.length} formats, a micro-challenge, an estimation drill`;
  const detail: SectionDetail[] = [
    { heading: "What a shift holds", points: [SECTION_LEARNING.shift.does, SECTION_LEARNING.shift.trains] },
    { heading: "Question formats", points: formats.map((f) => REVIEW_FORMAT_NAMES[f]) },
    { heading: "Services it keeps fresh", points: PACKS.map((p) => p.title) },
  ];
  return { id: "daily-shift", name: SECTION_LEARNING.shift.name, area: "Spaced review", href: "/shift", short, label: "", detail, ...STORY["daily-shift"] };
}

function incidentSection(): Section {
  const short = `On-call practice: ${INCIDENTS.map((i) => stripPrefix(i.title)).join(", ")}`;
  const detail: SectionDetail[] = [
    { heading: "What you do on a page", points: [SECTION_LEARNING.incident.does, SECTION_LEARNING.incident.trains] },
    { heading: "Pages in this build", points: INCIDENTS.map((i) => `${i.title}: ${i.page.title}`) },
  ];
  return { id: "incident-room", name: SECTION_LEARNING.incident.name, area: "On-call practice", href: "/incident", short, label: "", detail, ...STORY["incident-room"] };
}

function codexSection(): Section {
  const short = `Your field guide: ${PACKS.length} cards with key numbers, trade-offs, cloud mapping, interview angles`;
  const detail: SectionDetail[] = [
    { heading: "What a card holds", points: [SECTION_LEARNING.codex.does, SECTION_LEARNING.codex.trains] },
    { heading: "Cards you can earn in this build", points: PACKS.map((p) => p.title) },
  ];
  return { id: "codex", name: SECTION_LEARNING.codex.name, area: "Field guide", href: "/codex", short, label: "", detail, ...STORY.codex };
}

export const SECTIONS: Section[] = [
  trackSection("core-grid", "A"),
  trackSection("agent-foundry", "B"),
  shiftSection(),
  incidentSection(),
  codexSection(),
].map((s) => ({ ...s, label: `${s.name} (${s.short})` }));

export const SECTION_BY_ID: ReadonlyMap<SectionId, Section> = new Map(SECTIONS.map((s) => [s.id, s]));

export function getSection(id: SectionId): Section {
  const s = SECTION_BY_ID.get(id);
  if (!s) throw new Error(`Unknown section ${id}`);
  return s;
}

/** The section a curriculum track belongs to, if it has built content. */
export function sectionForTrack(track: Track): Section | undefined {
  const id = TRACK_SECTION[track];
  return id ? SECTION_BY_ID.get(id) : undefined;
}

/** The label for a track: "Core Grid (System Design: …)". Tracks with nothing built fall back to their district name. */
export function trackLabel(track: Track): string {
  return sectionForTrack(track)?.label ?? TRACKS[track].district;
}
