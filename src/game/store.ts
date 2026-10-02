"use client";
/**
 * Game state: Zustand store hydrated from Dexie, writing through on every action.
 */
import { useMemo } from "react";
import { create } from "zustand";
import {
  db,
  DEFAULT_SETTINGS,
  freshConcept,
  freshProfile,
  type ConceptProgress,
  type GameEvent,
  type GameEventType,
  type MasteryLevel,
  type Profile,
  type Settings,
} from "./db";
import { gameNow } from "./clock";
import { newCard, rateCard, Rating, retrievability, type Grade } from "./fsrs";
import { liveNines, rankFromXp, type RankState } from "./rank";
import type { Confidence } from "./scoring";

const DAY_MS = 86_400_000;
const SPACED_GAP_MS = 20 * 3_600_000;

/** Calendar day in Asia/Kolkata, as YYYY-MM-DD. */
/** Calendar day in IST on the game clock (so time warp moves streaks and reviews together). */
export function istDay(t = gameNow().getTime()): string {
  return new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export function computeMastery(c: ConceptProgress): MasteryLevel {
  if (!c.builtAt) return 0;
  const stability = c.card?.stability ?? 0;
  if (c.spacedSuccesses >= 2 && stability >= 21 && c.transferWins >= 1) return 3;
  if (c.spacedSuccesses >= 2) return 2;
  return 1;
}

export interface GameState {
  hydrated: boolean;
  profile: Profile;
  concepts: Record<string, ConceptProgress>;
  /** Bumps whenever the map should re-evaluate decay (e.g., after a review). */
  tick: number;

  hydrate: () => Promise<void>;
  log: (type: GameEventType, xp: number, data?: Record<string, unknown>, conceptId?: string) => Promise<void>;
  recordPrediction: (p: { conceptId: string; predictionId: string; correct: boolean; confidence: Confidence; xp: number }) => Promise<void>;
  completeMission: (m: { conceptId: string; stars: number; xp: number; cleanRun: boolean }) => Promise<{ firstBuild: boolean }>;
  recordReview: (r: { conceptId: string; reviewId: string; format: string; grade: Grade; xp: number; seconds: number; whyCorrect?: boolean; interleaved?: boolean }) => Promise<void>;
  recordTransfer: (conceptIds: string[]) => Promise<void>;
  beatBoss: (bossId: string, xp: number, data?: Record<string, unknown>) => Promise<void>;
  resolveIncident: (incidentId: string, xp: number, data?: Record<string, unknown>) => Promise<void>;
  completeShift: (xp: number, data?: Record<string, unknown>) => Promise<{ streak: number; froze: number; tokenEarned: boolean }>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  markSeen: (key: string) => Promise<void>;
  setLastSeenNines: (n: number) => Promise<void>;
  replaceAll: (profile: Profile, concepts: ConceptProgress[]) => void;
}

async function saveProfile(p: Profile) {
  try {
    await db().profile.put(p);
  } catch {
    /* storage unavailable (private mode): the game still runs in memory */
  }
}
async function saveConcept(c: ConceptProgress) {
  try {
    await db().concepts.put(c);
  } catch {
    /* ignore */
  }
}
async function saveEvent(e: GameEvent) {
  try {
    await db().events.add(e);
  } catch {
    /* ignore */
  }
}

export const useGame = create<GameState>()((set, get) => ({
  hydrated: false,
  profile: freshProfile(0),
  concepts: {},
  tick: 0,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const d = db();
      let profile = await d.profile.get("me");
      if (!profile) {
        profile = freshProfile();
        await d.profile.put(profile);
      }
      // Older saves may predate newer settings fields.
      profile = { ...profile, settings: { ...DEFAULT_SETTINGS, ...profile.settings, audio: { ...DEFAULT_SETTINGS.audio, ...profile.settings?.audio } } };
      const list = await d.concepts.toArray();
      const concepts: Record<string, ConceptProgress> = {};
      for (const c of list) concepts[c.id] = c;
      set({ hydrated: true, profile, concepts });
    } catch {
      set({ hydrated: true, profile: freshProfile() });
    }
  },

  log: async (type, xp, data = {}, conceptId) => {
    const profile = { ...get().profile, xp: get().profile.xp + xp };
    set({ profile });
    await Promise.all([saveProfile(profile), saveEvent({ t: Date.now(), type, xp, data, conceptId })]);
  },

  recordPrediction: async ({ conceptId, predictionId, correct, confidence, xp }) => {
    const prev = get().profile;
    const key = String(confidence) as "50" | "70" | "90";
    const bin = prev.calibration[key];
    const profile: Profile = {
      ...prev,
      xp: prev.xp + xp,
      calibration: { ...prev.calibration, [key]: { n: bin.n + 1, correct: bin.correct + (correct ? 1 : 0) } },
    };
    set({ profile });
    await Promise.all([saveProfile(profile), saveEvent({ t: Date.now(), type: "prediction", xp, conceptId, data: { predictionId, correct, confidence } })]);
  },

  completeMission: async ({ conceptId, stars, xp, cleanRun }) => {
    const now = gameNow().getTime();
    const prev = get().concepts[conceptId] ?? freshConcept(conceptId);
    const firstBuild = !prev.builtAt;
    let card = prev.card;
    if (firstBuild) {
      // The mission is the first exposure: a clean run schedules like "Good", otherwise "Hard" (sooner review).
      card = rateCard(newCard(new Date(now)), cleanRun ? Rating.Good : Rating.Hard, new Date(now));
    }
    const next: ConceptProgress = {
      ...prev,
      builtAt: prev.builtAt ?? now,
      card,
      bestStars: Math.max(prev.bestStars, stars),
      missionRuns: prev.missionRuns + 1,
    };
    next.mastery = computeMastery(next);
    const profile = { ...get().profile, xp: get().profile.xp + xp };
    set({ concepts: { ...get().concepts, [conceptId]: next }, profile, tick: get().tick + 1 });
    await Promise.all([
      saveConcept(next),
      saveProfile(profile),
      saveEvent({ t: now, type: "mission", xp, conceptId, data: { stars, firstBuild, cleanRun } }),
    ]);
    return { firstBuild };
  },

  recordReview: async ({ conceptId, reviewId, format, grade, xp, seconds, whyCorrect, interleaved }) => {
    const now = gameNow().getTime();
    const prev = get().concepts[conceptId] ?? freshConcept(conceptId);
    const card = rateCard(prev.card ?? newCard(new Date(now)), grade, new Date(now));
    const success = grade !== Rating.Again;
    const spaced = success && (!prev.lastSuccessAt || now - prev.lastSuccessAt >= SPACED_GAP_MS);
    const next: ConceptProgress = {
      ...prev,
      card,
      reviews: prev.reviews + 1,
      lapses: prev.lapses + (success ? 0 : 1),
      spacedSuccesses: prev.spacedSuccesses + (spaced ? 1 : 0),
      lastSuccessAt: success ? now : prev.lastSuccessAt,
      lastReviewAt: now,
      lastRepairAt: success ? now : prev.lastRepairAt,
      transferWins: prev.transferWins + (success && interleaved ? 1 : 0),
      recentReviewIds: [reviewId, ...prev.recentReviewIds.filter((x) => x !== reviewId)].slice(0, 4),
    };
    next.mastery = computeMastery(next);
    const profile = { ...get().profile, xp: get().profile.xp + xp };
    set({ concepts: { ...get().concepts, [conceptId]: next }, profile, tick: get().tick + 1 });
    await Promise.all([
      saveConcept(next),
      saveProfile(profile),
      saveEvent({ t: now, type: "review", xp, conceptId, data: { reviewId, format, grade, seconds, whyCorrect } }),
    ]);
  },

  recordTransfer: async (conceptIds) => {
    const updates: ConceptProgress[] = [];
    const concepts = { ...get().concepts };
    for (const id of conceptIds) {
      const c = concepts[id];
      if (!c?.builtAt) continue;
      const next = { ...c, transferWins: c.transferWins + 1 };
      next.mastery = computeMastery(next);
      concepts[id] = next;
      updates.push(next);
    }
    set({ concepts, tick: get().tick + 1 });
    await Promise.all(updates.map(saveConcept));
  },

  beatBoss: async (bossId, xp, data = {}) => {
    const prev = get().profile;
    const profile: Profile = {
      ...prev,
      xp: prev.xp + xp,
      bossesBeaten: prev.bossesBeaten.includes(bossId) ? prev.bossesBeaten : [...prev.bossesBeaten, bossId],
    };
    set({ profile });
    await Promise.all([saveProfile(profile), saveEvent({ t: Date.now(), type: "boss", xp, conceptId: bossId, data })]);
  },

  resolveIncident: async (incidentId, xp, data = {}) => {
    const prev = get().profile;
    const profile: Profile = {
      ...prev,
      xp: prev.xp + xp,
      incidentsResolved: prev.incidentsResolved.includes(incidentId) ? prev.incidentsResolved : [...prev.incidentsResolved, incidentId],
    };
    set({ profile });
    await Promise.all([saveProfile(profile), saveEvent({ t: Date.now(), type: "incident", xp, conceptId: incidentId, data })]);
  },

  completeShift: async (xp, data = {}) => {
    const prev = get().profile;
    const today = istDay();
    const s = { ...prev.streak, frozenDays: [...prev.streak.frozenDays] };
    let froze = 0;
    let tokenEarned = false;
    if (s.lastDay !== today) {
      const gap = s.lastDay ? dayDiff(s.lastDay, today) : 1;
      if (gap === 1) s.count += 1;
      else if (gap > 1 && s.freezeTokens >= gap - 1) {
        froze = gap - 1;
        s.freezeTokens -= froze;
        for (let i = 1; i < gap; i++) s.frozenDays.push(istDay(Date.parse(s.lastDay!) + i * DAY_MS));
        s.count += 1;
      } else s.count = 1;
      s.lastDay = today;
      s.best = Math.max(s.best, s.count);
      if (s.count % 7 === 0 && s.freezeTokens < 2) {
        s.freezeTokens += 1;
        tokenEarned = true;
      }
    }
    const profile: Profile = { ...prev, xp: prev.xp + xp, streak: s };
    set({ profile });
    await Promise.all([saveProfile(profile), saveEvent({ t: Date.now(), type: "shift", xp, data: { ...data, streak: s.count, froze } })]);
    return { streak: s.count, froze, tokenEarned };
  },

  updateSettings: async (patch) => {
    const prev = get().profile;
    const profile: Profile = { ...prev, settings: { ...prev.settings, ...patch } };
    set({ profile });
    await saveProfile(profile);
  },

  markSeen: async (key) => {
    const prev = get().profile;
    if (prev.seen.includes(key)) return;
    const profile: Profile = { ...prev, seen: [...prev.seen, key] };
    set({ profile });
    await saveProfile(profile);
  },

  setLastSeenNines: async (n) => {
    const profile: Profile = { ...get().profile, lastSeenNines: n };
    set({ profile });
    await saveProfile(profile);
  },

  replaceAll: (profile, list) => {
    const concepts: Record<string, ConceptProgress> = {};
    for (const c of list) concepts[c.id] = c;
    set({ profile, concepts, tick: get().tick + 1 });
  },
}));

// ---------------------------------------------------------------- selectors

export function selectRank(s: Pick<GameState, "profile">): RankState {
  return rankFromXp(s.profile.xp, new Set(s.profile.bossesBeaten));
}

export interface ConceptHealth {
  id: string;
  r: number;
  due: boolean;
}

export function conceptHealth(concepts: Record<string, ConceptProgress>, now = gameNow()): ConceptHealth[] {
  const out: ConceptHealth[] = [];
  for (const c of Object.values(concepts)) {
    if (!c.builtAt || !c.card) continue;
    const r = retrievability(c.card, now);
    out.push({ id: c.id, r, due: new Date(c.card.due).getTime() <= now.getTime() });
  }
  return out;
}

export function selectLive(s: Pick<GameState, "profile" | "concepts">, now = gameNow()) {
  const rank = selectRank(s);
  const health = conceptHealth(s.concepts, now);
  const live = liveNines(rank.nines, health);
  return { rank, health, ...live };
}

export function dueConcepts(concepts: Record<string, ConceptProgress>, now = gameNow()): ConceptHealth[] {
  return conceptHealth(concepts, now)
    .filter((h) => h.due)
    .sort((a, b) => a.r - b.r);
}

// ---------------------------------------------------------------- hooks
// Selectors above build new objects; subscribing to them directly would loop (zustand v5 compares by
// reference). These hooks subscribe to primitives and memoize the derived value.

export function useRank(): RankState {
  const xp = useGame((s) => s.profile.xp);
  const beaten = useGame((s) => s.profile.bossesBeaten);
  return useMemo(() => rankFromXp(xp, new Set(beaten)), [xp, beaten]);
}

export function useLive(now?: Date) {
  const profile = useGame((s) => s.profile);
  const concepts = useGame((s) => s.concepts);
  const tick = useGame((s) => s.tick);
  const t = now?.getTime();
  const warp = profile.settings.timeWarpDays;
  return useMemo(() => selectLive({ profile, concepts }, t ? new Date(t) : gameNow()), [profile, concepts, tick, t, warp]); // eslint-disable-line react-hooks/exhaustive-deps
}
