/**
 * FSRS scheduling (ts-fsrs). One card per concept (see DECISIONS D-007).
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

export { Rating };
export type { Card, Grade };

export const DESIRED_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({
    request_retention: DESIRED_RETENTION,
    enable_fuzz: true,
    // Concepts are reviewed on a day scale; minute-level learning steps don't fit a daily shift.
    enable_short_term: false,
    maximum_interval: 365,
  }),
);

export function newCard(now = new Date()): Card {
  return createEmptyCard(now);
}

export function rateCard(card: Card, grade: Grade, now = new Date()): Card {
  return scheduler.next(card, now, grade).card;
}

export function retrievability(card: Card | undefined, now = new Date()): number {
  if (!card || card.reps === 0) return 1;
  const r = scheduler.get_retrievability(card, now, false);
  return Number.isFinite(r) ? r : 1;
}

export function isDue(card: Card | undefined, now = new Date()): boolean {
  if (!card || card.reps === 0) return false;
  return new Date(card.due).getTime() <= now.getTime();
}

export type BuildingHealth = "online" | "flicker" | "rust" | "sparks" | "incident";

/** Retrievability -> building condition on the infrastructure map. */
export function healthFrom(r: number): BuildingHealth {
  if (r >= 0.9) return "online";
  if (r >= 0.85) return "flicker";
  if (r >= 0.75) return "rust";
  if (r >= 0.6) return "sparks";
  return "incident";
}

/** Revive Dates after a JSON round-trip (export/import). */
export function reviveCard(c: Card): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  };
}
