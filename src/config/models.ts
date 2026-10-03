/**
 * Every model ID NINES calls at runtime, in one place. Provider: Groq (OpenAI-compatible API).
 * Verified against console.groq.com/docs (models, structured outputs, prompt caching, reasoning), 2026-10.
 *
 * A capable model for grading and the interviewer, a small fast one for cheap calls (per the brief).
 * The lessons' price sheet is separate: src/content/prices.ts.
 */
export const AI_PROVIDER = { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" } as const;

export const MODELS = {
  /** Explain-it-back grading, postmortem grading, Interview Arena, Field Mission verification. Strict JSON-schema outputs. */
  grader: "openai/gpt-oss-120b",
  interviewer: "openai/gpt-oss-120b",
  /** Ask the SRE hints, quick classification. */
  fast: "openai/gpt-oss-20b",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/**
 * USD per million tokens (Groq on-demand list prices). Prompt caching is automatic on the gpt-oss models:
 * cached prefix tokens bill at half the input price. Reasoning tokens bill as output.
 */
export const PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, cachedInput: 0.0375, output: 0.3 },
};
