/**
 * Field missions: build something real on your own machine, then paste the evidence. Content is data (like packs);
 * `FieldRunner` renders any mission. The proof is checked locally by patterns (works offline) and, when the coach is
 * on, graded against the criteria.
 */
import type { CastLine, Source } from "@/content/schema";

export interface FieldStep {
  id: string;
  title: string;
  detail: string;
  /** Shell commands or snippets to copy. */
  commands?: string[];
}

export interface FieldCriterion {
  id: string;
  criterion: string;
}

export interface FieldCheck {
  id: string;
  label: string;
  /** Regular expression source, tested against the pasted proof. */
  pattern: string;
  flags?: string;
}

export interface FieldHint {
  text: string;
  /** XP taken off the reward when this hint is opened. */
  cost: number;
}

export interface FieldMission {
  id: string;
  title: string;
  estimatedMinutes: number;
  xp: number;
  brief: CastLine[];
  goal: string;
  /** What you need installed or at hand. */
  needs: string[];
  steps: FieldStep[];
  /** What the finished work must show, graded against the proof. */
  criteria: FieldCriterion[];
  hints: FieldHint[];
  proof: {
    prompt: string;
    placeholder: string;
    /** Automatic checks run on the pasted text; all must pass. */
    checks: FieldCheck[];
    /** An example that passes every check, shown after completion and used by tests. */
    sample: string;
  };
  debrief: string[];
  honestPhysics: string[];
  sources: Source[];
}

export const defineField = (m: FieldMission): FieldMission => m;
