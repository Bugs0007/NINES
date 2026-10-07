/**
 * What "progress" means, in one place, for the browser, the server, and the admin funnel.
 *
 *   section = a chapter id ("a1", "b1")
 *   level   = a playable node in it: a mission, a boss, or an incident ("latency-numbers")
 *
 * The browser derives rows from the local save and sends them; the server validates every row against this
 * model before storing it (see src/app/api/progress). The simulations run in the browser, so the server cannot
 * prove a level was played; what it can do, and does, is refuse rows that are impossible: unknown levels,
 * levels whose prerequisites aren't done, scores out of range, a completed level going backwards, or a flood
 * of writes. Pure functions only (no React, no server imports) so tests and both sides can use them.
 */
import { z } from "zod";
import { GRAPH, NODE_BY_ID } from "./graph";
import { isPlayable } from "./progression";

export type ProgressStatus = "in_progress" | "completed";

/** A row as the browser sends it. Timestamps are decided by the server. */
export interface ClientRow {
  section: string;
  level: string;
  status: ProgressStatus;
  /** 0-100: the share of the level's bonus stars earned. Null when the level has no score. */
  score: number | null;
  attempts: number;
}

/** A row as stored. */
export interface ProgressRow extends ClientRow {
  completedAt: string | null;
  updatedAt: string;
}

export const MAX_ROWS_PER_WRITE = 200;
export const MAX_ATTEMPTS = 1000;

export const ClientRowSchema = z
  .object({
    section: z.string().min(1).max(40),
    level: z.string().min(1).max(80),
    status: z.enum(["in_progress", "completed"]),
    score: z.number().int().min(0).max(100).nullable(),
    attempts: z.number().int().min(0).max(MAX_ATTEMPTS),
  })
  .strict();

export const ClientRowsSchema = z.array(ClientRowSchema).max(MAX_ROWS_PER_WRITE);

/** Every level that exists in this build. */
export const LEVELS = GRAPH.filter((n) => isPlayable(n.id));
export const LEVEL_BY_ID: ReadonlyMap<string, (typeof LEVELS)[number]> = new Map(LEVELS.map((n) => [n.id, n]));

/** Sections that have at least one level in this build, in curriculum order. */
export const SECTIONS_WITH_LEVELS: string[] = [...new Set(LEVELS.map((n) => n.chapter))];

/** The levels a player must complete to finish a section: its missions and its boss. Side incidents are optional. */
export function requiredLevels(section: string): string[] {
  return LEVELS.filter((n) => n.chapter === section && (n.kind === "concept" || n.kind === "boss" || n.kind === "case")).map((n) => n.id);
}

export function isSectionFinished(section: string, completed: ReadonlySet<string>): boolean {
  const need = requiredLevels(section);
  return need.length > 0 && need.every((id) => completed.has(id));
}

export interface RowError {
  level: string;
  reason: string;
}

/**
 * Check rows from a browser against the model. `existing` is what is already stored for this user. Returns the
 * rows that pass and a reason for each that doesn't; a bad row never blocks a good one.
 */
export function validateRows(input: unknown, existing: readonly ProgressRow[]): { ok: ClientRow[]; errors: RowError[] } {
  const parsed = ClientRowsSchema.safeParse(input);
  if (!parsed.success) return { ok: [], errors: [{ level: "*", reason: "malformed rows" }] };

  const done = new Set(existing.filter((r) => r.status === "completed").map((r) => r.level));
  const rows = parsed.data;
  // A completed level counts as done for its dependants in the same batch.
  const batchDone = new Set(rows.filter((r) => r.status === "completed").map((r) => r.level));
  const errors: RowError[] = [];
  const ok: ClientRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const node = LEVEL_BY_ID.get(r.level);
    if (!node) {
      errors.push({ level: r.level, reason: "unknown level" });
      continue;
    }
    if (node.chapter !== r.section) {
      errors.push({ level: r.level, reason: "wrong section" });
      continue;
    }
    if (seen.has(r.level)) {
      errors.push({ level: r.level, reason: "duplicate level in one write" });
      continue;
    }
    seen.add(r.level);
    if (r.status === "completed") {
      const missing = node.prereqs.filter((p) => !done.has(p) && !batchDone.has(p));
      if (missing.length) {
        errors.push({ level: r.level, reason: `prerequisites not completed: ${missing.join(", ")}` });
        continue;
      }
    } else if (r.score !== null) {
      errors.push({ level: r.level, reason: "an unfinished level has no score" });
      continue;
    }
    ok.push(r);
  }
  return { ok, errors };
}

/**
 * Apply validated rows onto what is stored. Rules that make progress hard to fake or lose:
 *   - a completed level never goes back to in progress;
 *   - attempts and score only go up (the best score is kept);
 *   - `completedAt` is set by the server the first time a level completes and never changes.
 */
export function mergeRows(existing: readonly ProgressRow[], incoming: readonly ClientRow[], now: Date): ProgressRow[] {
  const byKey = new Map(existing.map((r) => [`${r.section}/${r.level}`, r]));
  const stamp = now.toISOString();
  const out: ProgressRow[] = [];
  for (const r of incoming) {
    const prev = byKey.get(`${r.section}/${r.level}`);
    const completed = prev?.status === "completed" || r.status === "completed";
    const score = prev?.score == null ? r.score : r.score == null ? prev.score : Math.max(prev.score, r.score);
    out.push({
      section: r.section,
      level: r.level,
      status: completed ? "completed" : "in_progress",
      score: completed ? score : null,
      attempts: Math.max(prev?.attempts ?? 0, r.attempts),
      completedAt: completed ? (prev?.completedAt ?? stamp) : null,
      updatedAt: stamp,
    });
  }
  return out;
}

/** The node ids a level row can refer to, for sanity checks in tests. */
export function levelTitle(id: string): string {
  return NODE_BY_ID.get(id)?.title ?? id;
}
