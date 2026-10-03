/**
 * Intro definitions for every section. Text comes from the learning layer (src/content/learning.ts), the
 * chapter cast lines, and the boss packs, so there is one source of truth for "what this teaches and why".
 */
import { CHAPTER_INTROS } from "@/content/chapters";
import { CHAPTERS, NODE_BY_ID, TRACKS } from "@/content/graph";
import { CHAPTER_LEARNING, SECTION_LEARNING } from "@/content/learning";
import { BOSS_BY_ID } from "@/content/packs";
import type { IntroSpec } from "./SectionIntro";

const CHAPTER_SCENE: Record<string, { scene: IntroSpec["scene"]; tone: IntroSpec["tone"] }> = {
  a1: { scene: "launch", tone: "phos" },
  b1: { scene: "tokens", tone: "lilac" },
};

export function chapterIntro(chapterId: string): IntroSpec | null {
  const ch = CHAPTERS.find((c) => c.id === chapterId);
  const learn = CHAPTER_LEARNING[chapterId];
  const look = CHAPTER_SCENE[chapterId];
  if (!ch || !learn || !look) return null;
  return {
    id: `chapter:${chapterId}`,
    kicker: `Chapter ${ch.id.toUpperCase()} · ${TRACKS[ch.track].district}`,
    title: ch.title,
    story: learn.story,
    scene: look.scene,
    tone: look.tone,
    learn: learn.outcomes,
    why: learn.why,
    cast: CHAPTER_INTROS[chapterId]?.lines,
    cta: "Start the chapter",
  };
}

/** One-line premises for boss intros (the full brief is shown in the fight). */
const BOSS_STORY: Record<string, string> = {
  "boss-launch-day": "Product Hunt at midnight Pacific. A traffic spike, a noisy neighbour, a crash, and a hotfix deploy, all in one night.",
  "boss-the-bill": "Copilot costs $107,000 a month and still forgets a peanut allergy. Get it under $45,000 without making it worse.",
};

export function bossIntro(bossId: string): IntroSpec | null {
  const boss = BOSS_BY_ID.get(bossId);
  if (!boss) return null;
  const node = NODE_BY_ID.get(bossId);
  return {
    id: `boss:${bossId}`,
    kicker: `Boss · Chapter ${(node?.chapter ?? "").toUpperCase()}`,
    title: boss.title.replace(/^Boss: /, ""),
    story: BOSS_STORY[bossId] ?? boss.challenge.brief,
    scene: bossId === "boss-the-bill" ? "bill" : "launch",
    tone: bossId === "boss-the-bill" ? "amber" : "alert",
    learnLabel: "What it tests",
    learn: boss.exercises.map((id) => NODE_BY_ID.get(id)?.title ?? id),
    why: SECTION_LEARNING.boss.because,
    cast: boss.intro.slice(0, 2),
    cta: boss.challenge.title,
  };
}

export const WELCOME_INTRO: IntroSpec = {
  id: "welcome",
  kicker: "Welcome to NINES",
  title: "Keep Pigeon online",
  story: "You're the first backend engineer at Pigeon, a messaging startup in Hyderabad. Every idea you learn becomes a running service on your map, and your uptime is your rank.",
  scene: "launch",
  tone: "phos",
  learnLabel: "How it works",
  learn: [
    "Missions: predict what a system will do, break it in a live simulation, then use the idea",
    "Daily Shift: a few minutes of reviews, timed for just before you'd forget",
    "Incidents and bosses: use everything at once, when nobody tells you which idea applies",
  ],
  why: "Interviews and on-call both test whether you can reason about a system you haven't seen before. NINES trains that directly, then keeps it from fading.",
  cta: "Show me HQ",
};

export const SECTION_INTROS: Record<"shift" | "incident" | "codex", IntroSpec> = {
  shift: {
    id: "section:shift",
    kicker: "Daily Shift",
    title: "Morning rounds",
    story: SECTION_LEARNING.shift.does,
    scene: "shift",
    tone: "amber",
    learnLabel: "What you'll do",
    learn: ["Answer a few reviews in mixed formats, each one timed for just before you'd forget it", "Fix a rusting service with a short micro-challenge", "Estimate something real, then compare with the worked answer"],
    why: SECTION_LEARNING.shift.because,
    cta: "Start the shift",
  },
  incident: {
    id: "section:incident",
    kicker: "Incident Room",
    title: "You're on call",
    story: SECTION_LEARNING.incident.does,
    scene: "incident",
    tone: "alert",
    learnLabel: "What you'll do",
    learn: ["Read dashboards, logs, and traces, and pin the evidence", "Stop the bleeding without breaking something else", "Name the root cause and write a three-line postmortem"],
    why: SECTION_LEARNING.incident.because,
    cta: "See the pages",
  },
  codex: {
    id: "section:codex",
    kicker: "Codex",
    title: "Your field guide",
    story: SECTION_LEARNING.codex.does,
    scene: "codex",
    tone: "sky",
    learnLabel: "What's inside",
    learn: ["One card per concept you've built: key numbers, trade-offs, where you've seen it", "How each idea maps to AWS and the other clouds", "Your calibration: how often you're right when you say you're 90% sure"],
    why: SECTION_LEARNING.codex.because,
    cta: "Open the Codex",
  },
};
