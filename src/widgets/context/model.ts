/**
 * Context Tetris model: what's in the window at each turn of a long chat, what it costs,
 * and which facts the model can still see. Deterministic and stylized (see honest physics).
 */
import { z } from "zod";
import { PRICING, MODELS, CACHE_READ_MULT, CACHE_WRITE_MULT } from "@/config/models";

export type HistoryMode = "full" | "last" | "summary" | "pinned";

export const ContextConfig = z.object({
  variant: z.enum(["lab", "challenge", "bill"]),
  window: z.number().default(32000),
  turns: z.number().default(40),
  systemTokens: z.number().default(1500),
  toolTokens: z.number().default(2800),
  docTokens: z.number().default(700),
  turnTokens: z.number().default(700),
  outputTokens: z.number().default(500),
  questionTokens: z.number().default(100),
  reserveTokens: z.number().default(1024),
  summaryTokens: z.number().default(400),
  pinnedTokens: z.number().default(150),
  // bill variant
  conversationsPerDay: z.number().default(2000),
  /** Starting policy (the bill variant starts from what's in production). */
  start: z
    .object({ mode: z.enum(["full", "last", "summary", "pinned"]), lastN: z.number(), docs: z.number(), cache: z.boolean().optional(), model: z.enum(["grader", "fast", "router"]).optional() })
    .optional(),
});
export type ContextConfig = z.infer<typeof ContextConfig>;

export interface Policy {
  mode: HistoryMode;
  lastN: number;
  docs: number;
  /** Bill variant: cache the stable prefix (system + tools + pinned). */
  cache?: boolean;
  /** Bill variant: Sonnet-class, Haiku-class, or a router that sends ~20% of turns (the hard ones) to Sonnet. */
  model?: "grader" | "fast" | "router";
}

export interface Fact {
  id: string;
  label: string;
  question: string;
  /** Turn it was said in, or "doc" for a retrieved document. */
  turn: number | "doc";
  docRank?: number;
  /** Survives summarization / pinned memory (a profile fact vs an episodic detail). */
  profile: boolean;
  hard?: boolean;
}

export const FACTS: Fact[] = [
  { id: "diet", label: "Vegetarian, allergic to peanuts", question: "Suggest a dessert for the party.", turn: 2, profile: true },
  { id: "name", label: "Their name is Aarav", question: "What's my name, again?", turn: 6, profile: true },
  { id: "party", label: "Party is Saturday, for 12 people", question: "How many servings should I order?", turn: 15, profile: false },
  { id: "policy", label: "Orders over ₹5,000 ship free (policy doc #3)", question: "Is delivery free on a ₹6,000 order?", turn: "doc", docRank: 3, profile: false, hard: true },
  { id: "menu", label: "Picked menu B from the three offered", question: "Swap the starter in that menu.", turn: 34, profile: false },
];

export interface TurnState {
  turn: number;
  blocks: { id: string; label: string; tokens: number; kind: "system" | "tools" | "docs" | "pinned" | "summary" | "history" | "question" | "reserve" }[];
  input: number;
  overflow: boolean;
  keptTurns: [number, number] | null;
}

export function turnState(c: ContextConfig, p: Policy, turn: number): TurnState {
  const prev = turn - 1; // completed turns before this one
  let keptFrom = 1;
  if (p.mode === "last" || p.mode === "pinned") keptFrom = Math.max(1, turn - p.lastN);
  if (p.mode === "summary") keptFrom = Math.max(1, Math.floor(prev / 10) * 10 + 1);
  const keptTurns = prev >= keptFrom ? prev - keptFrom + 1 : 0;
  const blocks: TurnState["blocks"] = [
    { id: "system", label: "system prompt", tokens: c.systemTokens, kind: "system" },
    { id: "tools", label: "4 tool definitions", tokens: c.toolTokens, kind: "tools" },
  ];
  // Stable blocks first: a cache can only reuse an identical prefix.
  if (p.mode === "pinned") blocks.push({ id: "pinned", label: "pinned user profile", tokens: c.pinnedTokens, kind: "pinned" });
  if (p.docs > 0) blocks.push({ id: "docs", label: `${p.docs} retrieved doc${p.docs > 1 ? "s" : ""}`, tokens: p.docs * c.docTokens, kind: "docs" });
  if (p.mode === "summary" && keptFrom > 1) blocks.push({ id: "summary", label: `summary of turns 1–${keptFrom - 1}`, tokens: c.summaryTokens, kind: "summary" });
  if (keptTurns > 0) blocks.push({ id: "history", label: `turns ${keptFrom}–${prev}`, tokens: keptTurns * c.turnTokens, kind: "history" });
  blocks.push({ id: "question", label: "new message", tokens: c.questionTokens, kind: "question" });
  const input = blocks.reduce((s, b) => s + b.tokens, 0);
  blocks.push({ id: "reserve", label: "room for the answer (max_tokens)", tokens: c.reserveTokens, kind: "reserve" });
  return { turn, blocks, input, overflow: input + c.reserveTokens > c.window, keptTurns: keptTurns ? [keptFrom, prev] : null };
}

export interface Evaluation {
  perTurn: TurnState[];
  overflowTurn: number | null;
  facts: { fact: Fact; ok: boolean; why: string }[];
  quality: number;
  inputTokens: number;
  costPerConversation: number;
  monthly: number;
  ttftS: number;
}

/** Router: share of turns sent to the fast model (the rest, the hard ones, go to the Sonnet-class model). */
export const ROUTER_FAST_SHARE = 0.8;

/** The stable prefix, identical on every turn: what prompt caching can reuse. */
export function prefixTokens(c: ContextConfig, p: Policy): number {
  return c.systemTokens + c.toolTokens + (p.mode === "pinned" ? c.pinnedTokens : 0);
}

/** Where in a long context a document sits matters: the middle of a crowded window is the weak spot. */
function lostInMiddle(p: Policy, fillFrac: number, rank: number): boolean {
  return p.docs >= 6 && rank > 2 && rank < p.docs && fillFrac > 0.6;
}

export function evaluate(c: ContextConfig, p: Policy): Evaluation {
  const perTurn = Array.from({ length: c.turns }, (_, i) => turnState(c, p, i + 1));
  const overflowTurn = perTurn.find((t) => t.overflow)?.turn ?? null;
  const last = perTurn[perTurn.length - 1]!;
  const fill = (last.input + c.reserveTokens) / c.window;
  const facts = FACTS.map((f) => {
    if (overflowTurn !== null) return { fact: f, ok: false, why: `request rejected at turn ${overflowTurn}: too long` };
    if (f.turn === "doc") {
      if (p.docs < (f.docRank ?? 1)) return { fact: f, ok: false, why: `lives in doc #${f.docRank}; you retrieve ${p.docs}` };
      if (lostInMiddle(p, fill, f.docRank ?? 1)) return { fact: f, ok: false, why: "buried in the middle of a crowded window" };
      if (f.hard && p.model === "fast") return { fact: f, ok: false, why: "needs a calculation the fast model gets wrong" };
      return { fact: f, ok: true, why: "retrieved" };
    }
    const kept = last.keptTurns && f.turn >= last.keptTurns[0] && f.turn <= last.keptTurns[1];
    if (kept) return { fact: f, ok: true, why: `turn ${f.turn} is still in the window` };
    if ((p.mode === "pinned" || p.mode === "summary") && f.profile) return { fact: f, ok: true, why: p.mode === "pinned" ? "pinned in the profile block" : "kept by the summary" };
    return { fact: f, ok: false, why: `turn ${f.turn} fell out of the window` };
  });
  const g = PRICING[MODELS.grader]!;
  const fp = PRICING[MODELS.fast]!;
  const r = ROUTER_FAST_SHARE;
  const price = p.model === "fast" ? fp : p.model === "router" ? { input: r * fp.input + (1 - r) * g.input, output: r * fp.output + (1 - r) * g.output } : g;
  let usd = 0;
  let inputTokens = 0;
  for (const t of perTurn) {
    if (t.overflow) break;
    inputTokens += t.input;
    const prefix = prefixTokens(c, p);
    if (p.cache) {
      const cacheCost = t.turn === 1 ? prefix * price.input * CACHE_WRITE_MULT : prefix * price.input * CACHE_READ_MULT;
      usd += (cacheCost + (t.input - prefix) * price.input) / 1e6;
    } else usd += (t.input * price.input) / 1e6;
    usd += (c.outputTokens * price.output) / 1e6;
    if (p.mode === "summary" && t.turn % 10 === 0) usd += ((t.keptTurns ? (t.keptTurns[1] - t.keptTurns[0] + 1) * c.turnTokens : 0) * price.input + c.summaryTokens * price.output) / 1e6;
  }
  // Stylized time-to-first-token: fixed overhead + prefill proportional to uncached input.
  const uncached = last.input - (p.cache ? prefixTokens(c, p) : 0);
  const share = p.model === "fast" ? 1 : p.model === "router" ? ROUTER_FAST_SHARE : 0;
  const ttftS = share * (0.25 + (uncached / 1000) * 0.02) + (1 - share) * (0.45 + (uncached / 1000) * 0.035);
  return {
    perTurn,
    overflowTurn,
    facts,
    quality: facts.filter((f) => f.ok).length,
    inputTokens,
    costPerConversation: usd,
    monthly: usd * c.conversationsPerDay * 30,
    ttftS,
  };
}
