/** Shared request/response shapes for the AI routes (client and server). */
import { z } from "zod";

export const GradeRequest = z.object({
  concept: z.string().max(120),
  prompt: z.string().max(600),
  rubric: z.array(z.object({ id: z.string().max(40), criterion: z.string().max(300), keyIdea: z.string().max(300).optional() })).min(1).max(6),
  exemplar: z.string().max(1200),
  answer: z.string().min(1).max(2000),
});
export type GradeRequest = z.infer<typeof GradeRequest>;

export const GradeResult = z.object({
  criteria: z.array(z.object({ id: z.string(), verdict: z.enum(["met", "partial", "missed"]), note: z.string() })),
  /** 0..1 */
  score: z.number(),
  /** One line, direct, in Meera's voice. */
  feedback: z.string(),
  /** The single most important thing missing or wrong, or "" if none. */
  gap: z.string(),
});
export type GradeResult = z.infer<typeof GradeResult>;

export const HintRequest = z.object({
  mission: z.string().max(120),
  situation: z.string().max(1500),
  goal: z.string().max(600),
  /** Hints already given, so the next one narrows. */
  previous: z.array(z.string().max(400)).max(6),
  /** 1 = broad nudge ... 3 = narrow nudge (still never the answer). */
  level: z.number().int().min(1).max(3),
});
export type HintRequest = z.infer<typeof HintRequest>;


/**
 * JSON Schema for strict structured outputs (Groq constrained decoding): every key required and
 * additionalProperties: false on every object. Mirrors GradeResult; the score is recomputed server-side.
 */
export const GRADE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "feedback", "gap"],
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "note"],
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["met", "partial", "missed"] },
          note: { type: "string" },
        },
      },
    },
    feedback: { type: "string" },
    gap: { type: "string" },
  },
} as const;
