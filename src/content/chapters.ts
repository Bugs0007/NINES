/**
 * Chapter intros: a title card and one or two cast lines. Keep them short; they're skippable.
 */
import type { CastLine } from "./schema";

export const CHAPTER_INTROS: Record<string, { sub: string; lines: CastLine[] }> = {
  a1: {
    sub: "Pigeon · 10 users → 10,000",
    lines: [
      { speaker: "kabir", line: "We launch on Product Hunt on Friday. I've told everyone we're enterprise-grade." },
      { speaker: "meera", line: "We have one server and it's named after your cat. Let's get to work." },
    ],
  },
  b1: {
    sub: "Pigeon Copilot · day one",
    lines: [
      { speaker: "kabir", line: "The board wants AI in the product by next quarter. I said next week." },
      { speaker: "meera", line: "Before we build anything clever, let's learn what the model actually sees." },
    ],
  },
};
