import "server-only";
/**
 * Server-side persistence for the public build: profiles, validated progress, synced saves, AI usage (spend and
 * quotas), feedback, and rate limits. Supabase Postgres when it is configured (service-role key, server only);
 * otherwise a local JSON file, so development and tests need no database. Keep this the only module that touches
 * the database. The schema is supabase/migrations/*.sql.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProgressRow } from "@/content/progress-model";
import { adminClient, serviceConfigured } from "./supabase";

export type Role = "guest" | "player" | "admin";

export interface UserSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: number;
  lastActiveAt: number;
  completedLevels: number;
  startedLevels: number;
}

export interface FeedbackRow {
  id: number;
  at: number;
  subject: string;
  email: string | null;
  page: string;
  message: string;
}

export interface Spend {
  usd: number;
  calls: number;
  byRoute: Record<string, { calls: number; usd: number }>;
}

export interface Stats {
  users: number;
  active7d: number;
  withSave: number;
  quotaHitsToday: number;
}

export interface UserSection {
  userId: string;
  section: string;
  completed: string[];
}

export interface Store {
  /** Create or touch a profile (last active). */
  upsertUser(u: { id: string; email: string | null; name: string | null }): Promise<void>;
  /** Delete the account and everything stored about it. */
  deleteUser(id: string): Promise<void>;
  getSave(userId: string): Promise<{ blob: unknown; savedAt: number } | null>;
  putSave(userId: string, blob: unknown, savedAt: number): Promise<void>;
  getProgress(userId: string): Promise<ProgressRow[]>;
  /** Store rows that have already been validated and merged (src/content/progress-model.ts). */
  putProgress(userId: string, rows: ProgressRow[]): Promise<void>;
  /** True while the caller is within `max` hits per `windowSeconds` for this bucket. */
  rateLimit(bucket: string, windowSeconds: number, max: number): Promise<boolean>;
  addUsage(subject: string, day: string, route: string, usd: number): Promise<void>;
  /** Calls per route for one subject on one day (quota checks). */
  usageFor(subject: string, day: string): Promise<Record<string, number>>;
  /** Spend for days starting with `prefix` ("2026-10" = the month, "2026-10-05" = one day). */
  spend(prefix: string): Promise<Spend>;
  addFeedback(f: Omit<FeedbackRow, "id" | "at">): Promise<void>;
  listFeedback(limit: number): Promise<FeedbackRow[]>;
  noteQuotaHit(day: string): Promise<void>;
  stats(): Promise<Stats>;
  listUsers(limit: number): Promise<UserSummary[]>;
  /** Completed levels per user and section, for the admin funnel. */
  completedBySection(): Promise<UserSection[]>;
}

const fail = (what: string, e: { message: string } | null) => {
  if (e) throw new Error(`supabase ${what}: ${e.message}`);
};

// ---------------------------------------------------------------- Supabase

class SupabaseStore implements Store {
  private touched = new Map<string, number>();
  private get sb() {
    return adminClient();
  }

  async upsertUser(u: { id: string; email: string | null; name: string | null }) {
    // A profile is created by a database trigger at sign-up; this keeps it current and records activity.
    const last = this.touched.get(u.id) ?? 0;
    if (Date.now() - last < 5 * 60_000) return;
    this.touched.set(u.id, Date.now());
    const { error } = await this.sb.from("profiles").upsert({ id: u.id, email: u.email, display_name: u.name, last_active_at: new Date().toISOString() }, { onConflict: "id" });
    fail("upsert profile", error);
  }

  async deleteUser(id: string) {
    const subject = `u:${id}`;
    await this.sb.from("feedback").delete().eq("subject", subject);
    await this.sb.from("ai_usage").delete().eq("subject", subject);
    // Deleting the auth user cascades to profiles, progress and saves.
    const { error } = await this.sb.auth.admin.deleteUser(id);
    fail("delete user", error);
    this.touched.delete(id);
  }

  async getSave(userId: string) {
    const { data, error } = await this.sb.from("saves").select("blob, saved_at").eq("user_id", userId).maybeSingle();
    fail("get save", error);
    return data ? { blob: data.blob as unknown, savedAt: Number(data.saved_at) } : null;
  }

  async putSave(userId: string, blob: unknown, savedAt: number) {
    const { error } = await this.sb.from("saves").upsert({ user_id: userId, blob, saved_at: savedAt, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    fail("put save", error);
  }

  async getProgress(userId: string) {
    const { data, error } = await this.sb.from("progress").select("section, level, status, score, attempts, completed_at, updated_at").eq("user_id", userId).limit(1000);
    fail("get progress", error);
    return (data ?? []).map((r) => ({
      section: r.section as string,
      level: r.level as string,
      status: r.status as ProgressRow["status"],
      score: (r.score as number | null) ?? null,
      attempts: Number(r.attempts),
      completedAt: (r.completed_at as string | null) ?? null,
      updatedAt: r.updated_at as string,
    }));
  }

  async putProgress(userId: string, rows: ProgressRow[]) {
    if (!rows.length) return;
    const { error } = await this.sb.from("progress").upsert(
      rows.map((r) => ({ user_id: userId, section: r.section, level: r.level, status: r.status, score: r.score, attempts: r.attempts, completed_at: r.completedAt, updated_at: r.updatedAt })),
      { onConflict: "user_id,section,level" },
    );
    fail("put progress", error);
  }

  async rateLimit(bucket: string, windowSeconds: number, max: number) {
    const { data, error } = await this.sb.rpc("rate_limit_hit", { p_bucket: bucket, p_window_seconds: windowSeconds, p_max: max });
    fail("rate limit", error);
    return data === true;
  }

  async addUsage(subject: string, day: string, route: string, usd: number) {
    const { error } = await this.sb.rpc("ai_usage_add", { p_subject: subject, p_day: day, p_route: route, p_usd: usd });
    fail("add usage", error);
  }

  async usageFor(subject: string, day: string) {
    const { data, error } = await this.sb.from("ai_usage").select("route, calls").eq("subject", subject).eq("day", day);
    fail("usage for", error);
    return Object.fromEntries((data ?? []).map((r) => [r.route as string, Number(r.calls)]));
  }

  async spend(prefix: string) {
    const { data, error } = await this.sb.rpc("ai_spend", { p_prefix: prefix });
    fail("spend", error);
    const rows = (data ?? []) as { route: string; calls: number; usd: number }[];
    const byRoute = Object.fromEntries(rows.map((r) => [r.route, { calls: Number(r.calls), usd: Number(r.usd) }]));
    return { usd: rows.reduce((s, r) => s + Number(r.usd), 0), calls: rows.reduce((s, r) => s + Number(r.calls), 0), byRoute };
  }

  async addFeedback(f: Omit<FeedbackRow, "id" | "at">) {
    const { error } = await this.sb.from("feedback").insert({ subject: f.subject, email: f.email, page: f.page, message: f.message });
    fail("add feedback", error);
  }

  async listFeedback(limit: number) {
    const { data, error } = await this.sb.from("feedback").select("id, at, subject, email, page, message").order("at", { ascending: false }).limit(limit);
    fail("list feedback", error);
    return (data ?? []).map((r) => ({ id: Number(r.id), at: Date.parse(r.at as string), subject: r.subject as string, email: (r.email as string | null) ?? null, page: r.page as string, message: r.message as string }));
  }

  async noteQuotaHit(day: string) {
    const { error } = await this.sb.rpc("counter_bump", { p_key: `quota:${day}` });
    fail("quota hit", error);
  }

  async stats() {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [users, active, saves, quota] = await Promise.all([
      this.sb.from("profiles").select("id", { count: "exact", head: true }),
      this.sb.from("profiles").select("id", { count: "exact", head: true }).gte("last_active_at", week),
      this.sb.from("saves").select("user_id", { count: "exact", head: true }),
      this.sb.from("counters").select("n").eq("key", `quota:${dayKey()}`).maybeSingle(),
    ]);
    fail("stats", users.error ?? active.error ?? saves.error ?? quota.error);
    return { users: users.count ?? 0, active7d: active.count ?? 0, withSave: saves.count ?? 0, quotaHitsToday: Number(quota.data?.n ?? 0) };
  }

  async listUsers(limit: number) {
    const { data, error } = await this.sb.rpc("admin_users", { p_limit: limit });
    fail("list users", error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      email: (r.email as string | null) ?? null,
      displayName: (r.display_name as string | null) ?? null,
      createdAt: Date.parse(r.created_at as string),
      lastActiveAt: Date.parse(r.last_active_at as string),
      completedLevels: Number(r.completed_levels),
      startedLevels: Number(r.started_levels),
    }));
  }

  async completedBySection() {
    const { data, error } = await this.sb.rpc("progress_by_user_section");
    fail("progress by section", error);
    return ((data ?? []) as { user_id: string; section: string; completed: string[] }[]).map((r) => ({ userId: r.user_id, section: r.section, completed: r.completed }));
  }
}

// ---------------------------------------------------------------- local file (development, tests, no database)

interface FileUser {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: number;
  lastSeen: number;
}
interface FileData {
  users: Record<string, FileUser>;
  saves: Record<string, { blob: unknown; savedAt: number }>;
  progress: Record<string, ProgressRow[]>;
  usage: Record<string, { calls: number; usd: number }>; // key: subject|day|route
  feedback: FeedbackRow[];
  counters: Record<string, number>;
}

class FileStore implements Store {
  private data: FileData | null = null;
  private file = path.join(process.cwd(), ".nines", "store.json");
  private windows = new Map<string, { start: number; hits: number }>();

  private async load(): Promise<FileData> {
    if (this.data) return this.data;
    let raw: Partial<FileData> = {};
    try {
      raw = JSON.parse(await readFile(this.file, "utf8")) as Partial<FileData>;
    } catch {
      /* first run */
    }
    // Older files used `progress` for the save blob; those entries are not rows, so start the rows empty.
    const progress = raw.saves ? (raw.progress ?? {}) : {};
    this.data = { users: raw.users ?? {}, saves: raw.saves ?? {}, progress, usage: raw.usage ?? {}, feedback: raw.feedback ?? [], counters: raw.counters ?? {} };
    return this.data;
  }
  private async save() {
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.data));
    } catch {
      /* read-only filesystem: keep it in memory */
    }
  }

  async upsertUser(u: { id: string; email: string | null; name: string | null }) {
    const d = await this.load();
    const now = Date.now();
    d.users[u.id] = { ...u, createdAt: d.users[u.id]?.createdAt ?? now, lastSeen: now };
    await this.save();
  }
  async deleteUser(id: string) {
    const d = await this.load();
    delete d.users[id];
    delete d.saves[id];
    delete d.progress[id];
    d.feedback = d.feedback.filter((f) => f.subject !== `u:${id}`);
    for (const k of Object.keys(d.usage)) if (k.startsWith(`u:${id}|`)) delete d.usage[k];
    await this.save();
  }
  async getSave(userId: string) {
    return (await this.load()).saves[userId] ?? null;
  }
  async putSave(userId: string, blob: unknown, savedAt: number) {
    const d = await this.load();
    d.saves[userId] = { blob, savedAt };
    await this.save();
  }
  async getProgress(userId: string) {
    return (await this.load()).progress[userId] ?? [];
  }
  async putProgress(userId: string, rows: ProgressRow[]) {
    const d = await this.load();
    const byKey = new Map((d.progress[userId] ?? []).map((r) => [`${r.section}/${r.level}`, r]));
    for (const r of rows) byKey.set(`${r.section}/${r.level}`, r);
    d.progress[userId] = [...byKey.values()];
    await this.save();
  }
  async rateLimit(bucket: string, windowSeconds: number, max: number) {
    const now = Date.now();
    const w = this.windows.get(bucket);
    if (!w || now - w.start > windowSeconds * 1000) {
      this.windows.set(bucket, { start: now, hits: 1 });
      return true;
    }
    w.hits += 1;
    return w.hits <= max;
  }
  async addUsage(subject: string, day: string, route: string, usd: number) {
    const d = await this.load();
    const k = `${subject}|${day}|${route}`;
    const r = d.usage[k] ?? { calls: 0, usd: 0 };
    d.usage[k] = { calls: r.calls + 1, usd: r.usd + usd };
    await this.save();
  }
  async usageFor(subject: string, day: string) {
    const d = await this.load();
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.usage)) {
      const [s, dy, route] = k.split("|");
      if (s === subject && dy === day && route) out[route] = v.calls;
    }
    return out;
  }
  async spend(prefix: string) {
    const d = await this.load();
    const byRoute: Spend["byRoute"] = {};
    for (const [k, v] of Object.entries(d.usage)) {
      const [, dy, route] = k.split("|");
      if (!dy?.startsWith(prefix) || !route) continue;
      const r = byRoute[route] ?? { calls: 0, usd: 0 };
      byRoute[route] = { calls: r.calls + v.calls, usd: r.usd + v.usd };
    }
    const rows = Object.values(byRoute);
    return { usd: rows.reduce((s, r) => s + r.usd, 0), calls: rows.reduce((s, r) => s + r.calls, 0), byRoute };
  }
  async addFeedback(f: Omit<FeedbackRow, "id" | "at">) {
    const d = await this.load();
    d.feedback.unshift({ ...f, id: d.feedback.length + 1, at: Date.now() });
    await this.save();
  }
  async listFeedback(limit: number) {
    return (await this.load()).feedback.slice(0, limit);
  }
  async noteQuotaHit(day: string) {
    const d = await this.load();
    d.counters[`quota:${day}`] = (d.counters[`quota:${day}`] ?? 0) + 1;
    await this.save();
  }
  async stats() {
    const d = await this.load();
    const week = Date.now() - 7 * 86_400_000;
    const users = Object.values(d.users);
    return { users: users.length, active7d: users.filter((u) => u.lastSeen > week).length, withSave: Object.keys(d.saves).length, quotaHitsToday: d.counters[`quota:${dayKey()}`] ?? 0 };
  }
  async listUsers(limit: number) {
    const d = await this.load();
    return Object.values(d.users)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((u) => {
        const rows = d.progress[u.id] ?? [];
        return { id: u.id, email: u.email, displayName: u.name, createdAt: u.createdAt, lastActiveAt: u.lastSeen, completedLevels: rows.filter((r) => r.status === "completed").length, startedLevels: rows.length };
      });
  }
  async completedBySection() {
    const d = await this.load();
    const out: UserSection[] = [];
    for (const [userId, rows] of Object.entries(d.progress)) {
      const bySection = new Map<string, string[]>();
      for (const r of rows) if (r.status === "completed") bySection.set(r.section, [...(bySection.get(r.section) ?? []), r.level]);
      for (const [section, completed] of bySection) out.push({ userId, section, completed });
    }
    return out;
  }
}

let instance: Store | null = null;
export function store(): Store {
  instance ??= serviceConfigured() ? new SupabaseStore() : new FileStore();
  return instance;
}

/** UTC calendar day, the unit for quotas and spend. */
export function dayKey(t = Date.now()): string {
  return new Date(t).toISOString().slice(0, 10);
}
