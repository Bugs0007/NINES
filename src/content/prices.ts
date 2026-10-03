/**
 * The price sheet the lessons teach with (The Bill, Context Windows, Estimathon). These are Claude API
 * list prices, the reference the AI-engineering track cites, and they are deliberately separate from the
 * runtime provider NINES itself calls (src/config/models.ts), so changing providers never moves a
 * calibrated challenge.
 */
export const TEACHING_PRICES = {
  /** Sonnet-class: the capable model. USD per million tokens. */
  big: { label: "Sonnet-class", input: 2, output: 10 },
  /** Haiku-class: the cheap, fast model. */
  small: { label: "Haiku-class", input: 1, output: 5 },
} as const;

/** Prompt caching on the Claude API: cache writes cost 1.25x input, cache reads 0.1x. */
export const TEACHING_CACHE_WRITE_MULT = 1.25;
export const TEACHING_CACHE_READ_MULT = 0.1;
