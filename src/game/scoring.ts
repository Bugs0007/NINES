/**
 * Scoring rules: predictions (calibrated), reviews (performance -> FSRS grade), estimates (order of magnitude).
 */
import { Rating, type Grade } from "./fsrs";

export type Confidence = 50 | 70 | 90;
export const CONFIDENCES: Confidence[] = [50, 70, 90];
export const CONFIDENCE_LABEL: Record<Confidence, string> = { 50: "Coin flip", 70: "Fairly sure", 90: "Certain" };

/** XP for a prediction: 0 when wrong; 10 / 15 / 20 when right at 50 / 70 / 90% confidence. */
export function predictionXp(correct: boolean, confidence: Confidence): number {
  if (!correct) return 0;
  return Math.round(10 + (10 * (confidence - 50)) / 40);
}

/** Log score (natural log of the probability you gave the outcome that happened). Higher is better; 0 is perfect. */
export function logScore(correct: boolean, confidence: Confidence): number {
  const p = confidence / 100;
  return Math.log(correct ? p : 1 - p);
}

/** How dramatic the reveal should be: 0 = calm, 1 = confidently wrong. */
export function surprise(correct: boolean, confidence: Confidence): number {
  if (correct) return 0;
  return (confidence - 40) / 50;
}

/** Numeric prediction/estimate: correct when within `factor` of the answer either way. */
export function withinFactor(guess: number, answer: number, factor: number): boolean {
  if (guess <= 0 || answer <= 0) return guess === answer;
  const r = guess / answer;
  return r <= factor && r >= 1 / factor;
}

/** Orders of magnitude off (0 = exact). */
export function magnitudeError(guess: number, answer: number): number {
  if (guess <= 0 || answer <= 0) return Infinity;
  return Math.abs(Math.log10(guess / answer));
}

export interface EstimateResult {
  error: number;
  grade: "exact" | "close" | "ballpark" | "off";
  xp: number;
}

export function scoreEstimate(guess: number, answer: number, acceptFactor: number): EstimateResult {
  const e = magnitudeError(guess, answer);
  const accept = Math.log10(acceptFactor);
  if (e <= Math.min(0.05, accept)) return { error: e, grade: "exact", xp: 30 };
  if (e <= accept) return { error: e, grade: "close", xp: 20 };
  if (e <= 1) return { error: e, grade: "ballpark", xp: 10 - Math.round(5 * e) };
  return { error: e, grade: "off", xp: 0 };
}

/** Seconds after which an answer counts as slow, per review format. */
export const SLOW_AFTER_S: Record<string, number> = {
  "pick-fix": 40,
  "spot-flaw": 45,
  estimate: 90,
  order: 60,
  "predict-graph": 35,
  explain: 240,
  tune: 90,
};
export const FAST_UNDER_FRACTION = 0.4;

/** Performance -> FSRS grade. Wrong answers are Again; the why follow-up can only downgrade. */
export function gradeReview(opts: {
  correct: boolean;
  partial?: boolean;
  confidence: Confidence;
  seconds: number;
  format: string;
  whyCorrect?: boolean;
}): Grade {
  if (!opts.correct && !opts.partial) return Rating.Again;
  if (opts.partial) return Rating.Hard;
  const slow = SLOW_AFTER_S[opts.format] ?? 60;
  let g: Grade;
  if (opts.confidence === 50 || opts.seconds > slow) g = Rating.Hard;
  else if (opts.confidence === 90 && opts.seconds < slow * FAST_UNDER_FRACTION) g = Rating.Easy;
  else g = Rating.Good;
  if (opts.whyCorrect === false && g > Rating.Hard) g = Rating.Hard;
  return g;
}

export const REVIEW_XP: Record<number, number> = { [Rating.Again]: 0, [Rating.Hard]: 5, [Rating.Good]: 10, [Rating.Easy]: 15 };

/** Challenge XP: 100 for the win, 25 per star. */
export function challengeXp(won: boolean, stars: number): number {
  return won ? 100 + 25 * stars : 0;
}

export function explainXp(score01: number): number {
  return Math.round(10 + 30 * Math.max(0, Math.min(1, score01)));
}
