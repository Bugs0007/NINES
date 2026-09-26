/**
 * Every Claude model ID NINES uses, in one place. Verified against the Claude API docs (2026-09).
 * Sonnet-class for grading and the interviewer, Haiku-class for cheap, fast calls (per the brief).
 */
export const MODELS = {
  /** Explain-it-back grading, postmortem grading, Interview Arena, Field Mission verification. */
  grader: "claude-sonnet-5",
  interviewer: "claude-sonnet-5",
  /** Ask the SRE hints, Heist bot first line, quick classification. */
  fast: "claude-haiku-4-5",
  /** Token counting uses the grader's tokenizer (counts are model-specific). */
  tokenizer: "claude-sonnet-5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** USD per million tokens (first-party API list prices). */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Cache writes cost 1.25x input; cache reads 0.1x input. */
export const CACHE_WRITE_MULT = 1.25;
export const CACHE_READ_MULT = 0.1;
