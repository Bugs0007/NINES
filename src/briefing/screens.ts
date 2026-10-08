/**
 * The first-visit briefing: four short screens that set up the story (Pigeon, why it is breaking, your role,
 * and where each part of NINES fits). Department and section names come from src/content/sections.ts so the
 * last screen cannot drift from the real sections. Keep it short: nobody reads a wall of text on a phone.
 */
import type { CastLine } from "@/content/schema";
import type { SceneId } from "@/intro/scenes";
import type { IntroTone } from "@/intro/SectionIntro";
import { SECTIONS, type SectionId } from "@/content/sections";

export interface BriefingScreen {
  id: "company" | "problem" | "role" | "map";
  kicker: string;
  title: string;
  /** One or two short lines. */
  lines: string[];
  scene: SceneId;
  tone: IntroTone;
  cast?: CastLine;
  /** The last screen maps each section to a department and the crisis it handles. */
  map?: { section: SectionId; crisis: string }[];
}

/** Bump when the story changes enough that returning players should see it again. */
export const BRIEFING_VERSION = "v1";
export const BRIEFING_SEEN_KEY = `briefing:${BRIEFING_VERSION}`;

export const BRIEFING: BriefingScreen[] = [
  {
    id: "company",
    kicker: "Day one",
    title: "Welcome to Pigeon",
    lines: ["A chat app that grew from a few friends to a few million people.", "You are its first backend engineer."],
    scene: "launch",
    tone: "phos",
    cast: { speaker: "kabir", line: "We crossed a million messages a day. Please don't touch anything." },
  },
  {
    id: "problem",
    kicker: "The situation",
    title: "Growing fast, breaking faster",
    lines: ["Traffic doubles every few weeks. Each week finds a new way to fall over.", "Slow pages, 502 errors, and an AI bill nobody can explain."],
    scene: "incident",
    tone: "alert",
    cast: { speaker: "meera", line: "Everything here is held together by hope. Let's replace the hope." },
  },
  {
    id: "role",
    kicker: "Your job",
    title: "Keep Pigeon online",
    lines: ["Each idea you learn becomes a running service on your map.", "Your uptime is your rank. Forget a service and it starts to rust."],
    scene: "shift",
    tone: "amber",
  },
  {
    id: "map",
    kicker: "Where you'll work",
    title: "Five places, five crises",
    lines: [],
    scene: "codex",
    tone: "sky",
    map: [
      { section: "core-grid", crisis: "Traffic is doubling. Keep the servers standing." },
      { section: "agent-foundry", crisis: "Copilot's bill is out of control." },
      { section: "daily-shift", crisis: "Services rust when nobody checks them." },
      { section: "incident-room", crisis: "The pager is going off. Right now." },
      { section: "codex", crisis: "Notes from every fix, so you only learn it once." },
    ],
  },
];

/** The map rows with the live section data (name, department, label) filled in. */
export function briefingMap(screen: BriefingScreen) {
  return (screen.map ?? []).map((m) => {
    const s = SECTIONS.find((x) => x.id === m.section);
    if (!s) throw new Error(`Briefing refers to unknown section ${m.section}`);
    return { ...m, name: s.name, department: s.department, label: s.label, href: s.href };
  });
}
