/**
 * Content schemas. Content is data, validated by Zod and linted by tests/content/*.test.ts.
 *
 * Word caps and structural rules live in `lintPack()` (tests call it; the dev build logs it).
 */
import { z } from "zod";

// ---------------------------------------------------------------- primitives

export const SpeakerSchema = z.enum(["meera", "kabir", "rao", "system", "pager", "user"]);
export type Speaker = z.infer<typeof SpeakerSchema>;

export const CastLineSchema = z.object({
  speaker: SpeakerSchema,
  line: z.string().min(1),
});
export type CastLine = z.infer<typeof CastLineSchema>;

export const SourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const OptionSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
export type Option = z.infer<typeof OptionSchema>;

/** Text that may contain numeric claims: needs sources unless it is derived from the sim. */
export const CaptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /** Named widget scene to play while this caption shows. */
  scene: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  /** True when numbers in the text come from the simulation itself. */
  derived: z.boolean().optional(),
});
export type Caption = z.infer<typeof CaptionSchema>;

export const WidgetRefSchema = z.object({
  id: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type WidgetRef = z.infer<typeof WidgetRefSchema>;

// ---------------------------------------------------------------- predictions

const RevealSchema = z.object({
  /** What actually happened, in <= 60 words. Shown next to the player's call. */
  text: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
  derived: z.boolean().optional(),
  line: CastLineSchema.optional(),
});

const PredictionBase = {
  id: z.string().min(1),
  prompt: z.string().min(1),
  /** Widget event that means "the player has now seen the answer happen". */
  observe: z.string().min(1),
  reveal: RevealSchema,
};

export const PredictionSchema = z.discriminatedUnion("kind", [
  z.object({
    ...PredictionBase,
    kind: z.literal("choice"),
    options: z.array(OptionSchema).min(2).max(5),
    answer: z.string(),
  }),
  z.object({
    ...PredictionBase,
    kind: z.literal("numeric"),
    unit: z.string(),
    min: z.number(),
    max: z.number(),
    log: z.boolean().default(false),
    step: z.number().optional(),
    answer: z.number(),
    /** Correct if within this factor of the answer (e.g. 1.5 = within 1.5x either way). */
    tolerance: z.number().min(1),
  }),
  z.object({
    ...PredictionBase,
    kind: z.literal("order"),
    items: z.array(OptionSchema).min(3).max(8),
    answer: z.array(z.string()),
  }),
]);
export type Prediction = z.infer<typeof PredictionSchema>;

// ---------------------------------------------------------------- challenges

export const ConditionSchema = z.object({
  /** A metric the widget reports (declared in the widget manifest). */
  metric: z.string().min(1),
  op: z.enum(["<", "<=", ">", ">=", "=="]),
  value: z.number(),
  label: z.string().min(1),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ChallengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brief: z.string().min(1),
  line: CastLineSchema.optional(),
  widget: WidgetRefSchema,
  conditions: z.array(ConditionSchema).min(1),
  /** Optional bonus stars (max 2). */
  stars: z.array(ConditionSchema).max(2).default([]),
  /** Socratic nudges, broadest first. Used by Ask the SRE when there is no API key. */
  hints: z.array(z.string()).min(2),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

// ---------------------------------------------------------------- reviews

export const WhySchema = z.object({
  prompt: z.string().min(1),
  options: z.array(OptionSchema).min(2).max(4),
  answer: z.string(),
});
export type Why = z.infer<typeof WhySchema>;

const DiagramSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(["client", "lb", "server", "db", "cache", "queue", "store", "external", "worker", "llm"]),
      /** Grid position (column, row) for the mini diagram. */
      col: z.number(),
      row: z.number(),
      note: z.string().optional(),
    }),
  ),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
});
export type Diagram = z.infer<typeof DiagramSchema>;

const ReviewBase = {
  id: z.string().min(1),
  /** The micro-scenario. */
  scenario: z.string().min(1),
  /** Why the answer is right, shown after answering. <= 60 words. */
  explain: z.string().min(1),
  why: WhySchema.optional(),
};

export const ReviewItemSchema = z.discriminatedUnion("format", [
  z.object({ ...ReviewBase, format: z.literal("pick-fix"), options: z.array(OptionSchema).min(2).max(5), answer: z.string() }),
  z.object({ ...ReviewBase, format: z.literal("spot-flaw"), diagram: DiagramSchema, answer: z.string() }),
  z.object({
    ...ReviewBase,
    format: z.literal("estimate"),
    unit: z.string(),
    answer: z.number(),
    /** Full marks within this factor; partial marks scale down by order of magnitude. */
    acceptFactor: z.number().min(1),
    breakdown: z.array(z.string()).min(1),
  }),
  z.object({ ...ReviewBase, format: z.literal("order"), items: z.array(OptionSchema).min(3).max(8), answer: z.array(z.string()) }),
  z.object({
    ...ReviewBase,
    format: z.literal("predict-graph"),
    xLabel: z.string(),
    yLabel: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string(), points: z.array(z.number()).min(3) })).min(2).max(4),
    answer: z.string(),
  }),
  z.object({
    ...ReviewBase,
    format: z.literal("explain"),
    rubric: z.array(z.object({ id: z.string(), criterion: z.string() })).min(2).max(5),
    exemplar: z.string().min(1),
  }),
  z.object({
    ...ReviewBase,
    format: z.literal("tune"),
    /** Scenario id from src/content/scenarios.ts. */
    tuneScenario: z.string().min(1),
    param: z.object({ label: z.string(), min: z.number(), max: z.number(), step: z.number(), unit: z.string().default("") }),
    target: ConditionSchema,
  }),
]);
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type ReviewFormat = ReviewItem["format"];

// ---------------------------------------------------------------- codex, deeper, verify

export const KeyNumberSchema = z.object({ label: z.string(), value: z.string(), sourceId: z.string() });

export const CodexSchema = z.object({
  oneLiner: z.string().min(1),
  keyNumbers: z.array(KeyNumberSchema).min(1),
  tradeoffs: z.array(z.object({ choice: z.string(), gain: z.string(), cost: z.string() })).min(1),
  /**
   * Where you meet this concept in real life. Lines tagged audience "owner" are the owner's personal edition
   * (shown only to OWNER_EMAILS accounts); public players see the untagged lines.
   */
  seenIn: z.array(z.union([z.string(), z.object({ text: z.string(), audience: z.literal("owner") })])).min(1),
  interviewAngle: z.string().min(1),
  aws: z.array(z.object({ concept: z.string(), service: z.string(), note: z.string().optional() })).default([]),
  otherClouds: z.string().optional(),
  /** Replayable animation: a widget + config (+ scene) that plays inside the card. */
  replay: WidgetRefSchema.extend({ scene: z.string().optional() }),
});
export type Codex = z.infer<typeof CodexSchema>;

export const DeeperSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
  derived: z.boolean().optional(),
});
export type Deeper = z.infer<typeof DeeperSchema>;

export const VerifySchema = z.object({
  id: z.string(),
  claim: z.string(),
  /** Verifier id from src/content/verifiers.ts. */
  run: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  expect: z.object({ min: z.number().optional(), max: z.number().optional() }),
});
export type Verify = z.infer<typeof VerifySchema>;

export const ExplainBackSchema = z.object({
  prompt: z.string().min(1),
  rubric: z.array(z.object({ id: z.string(), criterion: z.string(), keyIdea: z.string() })).min(2).max(5),
  exemplar: z.string().min(1),
});
export type ExplainBack = z.infer<typeof ExplainBackSchema>;

export const HookSchema = z.object({
  visual: z.enum(["pager", "graph-spike", "complaint", "bill", "launch", "terminal"]),
  alert: z.object({ severity: z.enum(["page", "warn", "info"]), title: z.string(), detail: z.string() }).optional(),
  lines: z.array(CastLineSchema).min(1).max(2),
});
export type Hook = z.infer<typeof HookSchema>;

// ---------------------------------------------------------------- packs

export const ConceptPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.literal("concept"),
  estimatedMinutes: z.number().min(5).max(30),
  hook: HookSchema,
  predictions: z.array(PredictionSchema).min(1),
  widget: WidgetRefSchema,
  mechanism: z.array(CaptionSchema).min(2).max(6),
  challenges: z.array(ChallengeSchema).min(1),
  explainBack: ExplainBackSchema,
  reviews: z.array(ReviewItemSchema).min(6),
  codex: CodexSchema,
  interview: z.array(z.string()).min(1),
  deeper: z.array(DeeperSchema).default([]),
  honestPhysics: z.array(z.string()).default([]),
  sources: z.array(SourceSchema).min(1),
  verify: z.array(VerifySchema).default([]),
});
export type ConceptPack = z.infer<typeof ConceptPackSchema>;
export type ConceptPackInput = z.input<typeof ConceptPackSchema>;

export const BossPackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.literal("boss"),
  estimatedMinutes: z.number().min(5).max(40),
  hook: HookSchema,
  /** Short cinematic lines before the fight. */
  intro: z.array(CastLineSchema).min(1).max(4),
  /** The player forecasts a metric of their own design before running it (calibration on your own work). */
  forecast: z.object({
    metric: z.string(),
    prompt: z.string(),
    unit: z.string(),
    /** Multiply the metric by this for display (e.g. 1000 for seconds -> ms). */
    scale: z.number().default(1),
    min: z.number(),
    max: z.number(),
    tolerance: z.number().min(1),
  }),
  /** Concepts this boss exercises (transfer credit on a win). */
  exercises: z.array(z.string()).min(1),
  challenge: ChallengeSchema,
  debrief: z.array(CaptionSchema).min(1).max(6),
  outro: CastLineSchema.optional(),
  explainBack: ExplainBackSchema,
  /** Where the boss's model simplifies reality, said plainly (shown in the debrief). */
  honestPhysics: z.array(z.string()).default([]),
  sources: z.array(SourceSchema).default([]),
  verify: z.array(VerifySchema).default([]),
});
export type BossPack = z.infer<typeof BossPackSchema>;
export type BossPackInput = z.input<typeof BossPackSchema>;

// ---------------------------------------------------------------- lint

export const LIMITS = {
  captionWords: 60,
  revealWords: 60,
  hookLineWords: 30,
  promptWords: 45,
  oneLinerWords: 25,
  scenarioWords: 70,
  explainWords: 60,
  briefWords: 60,
  castLineSentences: 2,
  minReviews: 6,
  minReviewFormats: 3,
} as const;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const sentenceCount = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((x) => x.trim().length > 0).length;

/** Numbers with units (or money) that make a factual claim. */
export const NUMERIC_CLAIM = /(\$\s?\d)|(₹\s?\d)|(\b\d[\d,.]*\s?(ns|µs|μs|us|ms|s|sec|seconds?|min|minutes?|hours?|GB|MB|KB|TB|GiB|MiB|%|rps|req\/s|QPS|vCPUs?|tokens?|cycles?)\b)/i;

export interface LintIssue {
  pack: string;
  path: string;
  message: string;
}

export function lintPack(pack: ConceptPack | BossPack, knownWidgetMetrics?: (widgetId: string) => string[] | undefined): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (path: string, message: string) => issues.push({ pack: pack.id, path, message });
  const sourceIds = new Set(pack.sources.map((s) => s.id));
  const cap = (path: string, text: string, max: number) => {
    const n = wordCount(text);
    if (n > max) add(path, `${n} words (cap ${max})`);
  };
  const claim = (path: string, text: string, ids?: string[], derived?: boolean) => {
    for (const id of ids ?? []) if (!sourceIds.has(id)) add(path, `unknown source id "${id}"`);
    if (NUMERIC_CLAIM.test(text) && !derived && !(ids && ids.length)) add(path, `numeric claim without a source (or derived: true): "${text.slice(0, 60)}…"`);
  };
  const castLine = (path: string, l: CastLine) => {
    cap(path, l.line, LIMITS.hookLineWords);
    if (sentenceCount(l.line) > LIMITS.castLineSentences) add(path, `cast line has more than ${LIMITS.castLineSentences} sentences`);
  };

  pack.hook.lines.forEach((l, i) => castLine(`hook.lines[${i}]`, l));
  const predictions = pack.kind === "concept" ? pack.predictions : [];
  predictions.forEach((p, i) => {
    cap(`predictions[${i}].prompt`, p.prompt, LIMITS.promptWords);
    cap(`predictions[${i}].reveal`, p.reveal.text, LIMITS.revealWords);
    claim(`predictions[${i}].reveal`, p.reveal.text, p.reveal.sourceIds, p.reveal.derived);
    if (p.reveal.line) castLine(`predictions[${i}].reveal.line`, p.reveal.line);
    if (p.kind === "choice" && !p.options.some((o) => o.id === p.answer)) add(`predictions[${i}]`, "answer is not an option id");
    if (p.kind === "order") {
      const ids = new Set(p.items.map((x) => x.id));
      if (p.answer.length !== p.items.length || !p.answer.every((a) => ids.has(a))) add(`predictions[${i}]`, "order answer must be a permutation of item ids");
    }
    if (p.kind === "numeric" && (p.answer < p.min || p.answer > p.max)) add(`predictions[${i}]`, "numeric answer outside slider range");
  });

  const checkChallenge = (path: string, c: Challenge) => {
    cap(`${path}.brief`, c.brief, LIMITS.briefWords);
    if (c.line) castLine(`${path}.line`, c.line);
    const metrics = knownWidgetMetrics?.(c.widget.id);
    if (knownWidgetMetrics && !metrics) add(`${path}.widget`, `unknown widget "${c.widget.id}"`);
    for (const cond of [...c.conditions, ...c.stars]) {
      if (metrics && !metrics.includes(cond.metric)) add(`${path}`, `metric "${cond.metric}" not reported by widget "${c.widget.id}"`);
    }
  };

  if (pack.kind === "concept") {
    if (knownWidgetMetrics && !knownWidgetMetrics(pack.widget.id)) add("widget", `unknown widget "${pack.widget.id}"`);
    pack.mechanism.forEach((c, i) => {
      cap(`mechanism[${i}]`, c.text, LIMITS.captionWords);
      claim(`mechanism[${i}]`, c.text, c.sourceIds, c.derived);
    });
    pack.challenges.forEach((c, i) => checkChallenge(`challenges[${i}]`, c));
    const formats = new Set(pack.reviews.map((r) => r.format));
    if (pack.reviews.length < LIMITS.minReviews) add("reviews", `${pack.reviews.length} review items (need ${LIMITS.minReviews})`);
    if (formats.size < LIMITS.minReviewFormats) add("reviews", `${formats.size} review formats (need ${LIMITS.minReviewFormats})`);
    const reviewIds = new Set<string>();
    pack.reviews.forEach((r, i) => {
      if (reviewIds.has(r.id)) add(`reviews[${i}]`, `duplicate review id ${r.id}`);
      reviewIds.add(r.id);
      cap(`reviews[${i}].scenario`, r.scenario, LIMITS.scenarioWords);
      cap(`reviews[${i}].explain`, r.explain, LIMITS.explainWords);
      if ((r.format === "pick-fix" || r.format === "predict-graph") && !r.options.some((o) => o.id === r.answer)) add(`reviews[${i}]`, "answer is not an option id");
      if (r.format === "spot-flaw" && !r.diagram.nodes.some((n) => n.id === r.answer) && !r.diagram.edges.some((e) => `${e.from}->${e.to}` === r.answer)) add(`reviews[${i}]`, "spot-flaw answer must be a node id or 'from->to'");
      if (r.format === "order") {
        const ids = new Set(r.items.map((x) => x.id));
        if (r.answer.length !== r.items.length || !r.answer.every((a) => ids.has(a))) add(`reviews[${i}]`, "order answer must be a permutation of item ids");
      }
      if (r.why && !r.why.options.some((o) => o.id === r.why!.answer)) add(`reviews[${i}].why`, "why answer is not an option id");
    });
    cap("codex.oneLiner", pack.codex.oneLiner, LIMITS.oneLinerWords);
    pack.codex.keyNumbers.forEach((k, i) => {
      if (!sourceIds.has(k.sourceId)) add(`codex.keyNumbers[${i}]`, `unknown source id "${k.sourceId}"`);
    });
    pack.deeper.forEach((d, i) => claim(`deeper[${i}]`, d.body, d.sourceIds, d.derived));
    if (pack.explainBack.rubric.length < 2) add("explainBack", "rubric needs at least 2 criteria");
  } else {
    pack.intro.forEach((l, i) => castLine(`intro[${i}]`, l));
    cap("forecast.prompt", pack.forecast.prompt, LIMITS.promptWords);
    checkChallenge("challenge", pack.challenge);
    pack.debrief.forEach((c, i) => {
      cap(`debrief[${i}]`, c.text, LIMITS.captionWords);
      claim(`debrief[${i}]`, c.text, c.sourceIds, c.derived);
    });
  }
  return issues;
}
