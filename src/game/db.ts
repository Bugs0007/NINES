/**
 * Local-first persistence (IndexedDB via Dexie). The Zustand store hydrates from here and writes through.
 */
import Dexie, { type Table } from "dexie";
import type { Card } from "./fsrs";

export type ReducedMotionPref = "system" | "on" | "off";

export interface AudioSettings {
  master: number;
  ui: number;
  sim: number;
  alerts: number;
  music: number;
  muted: boolean;
}

export interface Settings {
  audio: AudioSettings;
  reducedMotion: ReducedMotionPref;
  /** Skip cinematics the player has already seen. */
  skipSeenCinematics: boolean;
  /** Show the "Honest physics" chip on sims. */
  showHonestPhysics: boolean;
  /** Playtest only: pretend this many days have passed (to see knowledge decay). */
  timeWarpDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  audio: { master: 0.7, ui: 0.6, sim: 0.5, alerts: 0.6, music: 0.35, muted: false },
  reducedMotion: "system",
  skipSeenCinematics: false,
  showHonestPhysics: true,
  timeWarpDays: 0,
};

export interface Streak {
  count: number;
  best: number;
  /** YYYY-MM-DD (Asia/Kolkata) of the last completed shift. */
  lastDay?: string;
  freezeTokens: number;
  /** Days bridged by a freeze token (for the shift report). */
  frozenDays: string[];
}

export interface CalibrationBin {
  n: number;
  correct: number;
}

export interface Profile {
  id: "me";
  createdAt: number;
  xp: number;
  bossesBeaten: string[];
  incidentsResolved: string[];
  streak: Streak;
  settings: Settings;
  /** Cinematics / intros already shown. */
  seen: string[];
  calibration: Record<"50" | "70" | "90", CalibrationBin>;
  /** Last nines value the player saw (drives the rank-up cinematic). */
  lastSeenNines: number;
}

export type MasteryLevel = 0 | 1 | 2 | 3; // 0 none, 1 built, 2 hardened, 3 mastered

export interface ConceptProgress {
  id: string;
  builtAt?: number;
  card?: Card;
  mastery: MasteryLevel;
  reviews: number;
  lapses: number;
  /** Successful reviews at least ~1 day apart. */
  spacedSuccesses: number;
  lastSuccessAt?: number;
  lastReviewAt?: number;
  lastRepairAt?: number;
  /** Times the concept was used successfully without being named (boss, incident, interleaved). */
  transferWins: number;
  recentReviewIds: string[];
  bestStars: number;
  missionRuns: number;
}

export type GameEventType =
  | "prediction"
  | "challenge"
  | "mission"
  | "review"
  | "why"
  | "explain"
  | "estimate"
  | "boss"
  | "incident"
  | "shift"
  | "hint"
  | "micro";

export interface GameEvent {
  id?: number;
  t: number;
  type: GameEventType;
  conceptId?: string;
  xp: number;
  data: Record<string, unknown>;
}

export interface SavedDesign {
  id: string;
  name: string;
  updatedAt: number;
  spec: unknown;
}

class NinesDB extends Dexie {
  profile!: Table<Profile, string>;
  concepts!: Table<ConceptProgress, string>;
  events!: Table<GameEvent, number>;
  designs!: Table<SavedDesign, string>;

  constructor() {
    super("nines");
    this.version(1).stores({
      profile: "id",
      concepts: "id, builtAt, mastery",
      events: "++id, t, type, conceptId",
      designs: "id, updatedAt",
    });
  }
}

let _db: NinesDB | null = null;

/** Lazily create the DB (never on the server). */
export function db(): NinesDB {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
  _db ??= new NinesDB();
  return _db;
}

export function freshProfile(now = Date.now()): Profile {
  return {
    id: "me",
    createdAt: now,
    xp: 0,
    bossesBeaten: [],
    incidentsResolved: [],
    streak: { count: 0, best: 0, freezeTokens: 0, frozenDays: [] },
    settings: structuredClone(DEFAULT_SETTINGS),
    seen: [],
    calibration: { "50": { n: 0, correct: 0 }, "70": { n: 0, correct: 0 }, "90": { n: 0, correct: 0 } },
    lastSeenNines: 1,
  };
}

export function freshConcept(id: string): ConceptProgress {
  return {
    id,
    mastery: 0,
    reviews: 0,
    lapses: 0,
    spacedSuccesses: 0,
    transferWins: 0,
    recentReviewIds: [],
    bestStars: 0,
    missionRuns: 0,
  };
}

export interface ExportBlob {
  version: 1;
  exportedAt: number;
  profile: Profile;
  concepts: ConceptProgress[];
  events: GameEvent[];
  designs: SavedDesign[];
}

export async function exportAll(): Promise<ExportBlob> {
  const d = db();
  const [profile, concepts, events, designs] = await Promise.all([d.profile.get("me"), d.concepts.toArray(), d.events.toArray(), d.designs.toArray()]);
  return { version: 1, exportedAt: Date.now(), profile: profile ?? freshProfile(), concepts, events, designs };
}

export async function importAll(blob: ExportBlob): Promise<void> {
  const d = db();
  await d.transaction("rw", [d.profile, d.concepts, d.events, d.designs], async () => {
    await Promise.all([d.profile.clear(), d.concepts.clear(), d.events.clear(), d.designs.clear()]);
    await d.profile.put(blob.profile);
    await d.concepts.bulkPut(
      blob.concepts.map((c) => ({
        ...c,
        card: c.card ? { ...c.card, due: new Date(c.card.due), last_review: c.card.last_review ? new Date(c.card.last_review) : undefined } : undefined,
      })),
    );
    await d.events.bulkPut(blob.events);
    await d.designs.bulkPut(blob.designs);
  });
}

export async function resetAll(): Promise<void> {
  const d = db();
  await d.transaction("rw", [d.profile, d.concepts, d.events, d.designs], async () => {
    await Promise.all([d.profile.clear(), d.concepts.clear(), d.events.clear(), d.designs.clear()]);
  });
}
