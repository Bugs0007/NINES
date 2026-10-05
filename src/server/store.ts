import "server-only";
/**
 * Server-side persistence for the public build: users, synced progress, AI usage (spend + quotas), and
 * feedback. Postgres (Neon) when DATABASE_URL is set; otherwise a local JSON file, so development and
 * tests need no database. Progress itself stays local-first in the browser; this only holds a copy for
 * signed-in players.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Role = "guest" | "player" | "owner";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  createdAt: number;
  lastSeen: number;
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

export interface Store {
  upsertUser(u: Omit<UserRow, "createdAt" | "lastSeen">): Promise<void>;
  deleteUser(id: string): Promise<void>;
  getProgress(userId: string): Promise<{ blob: unknown; savedAt: number } | null>;
  putProgress(userId: string, blob: unknown, savedAt: number): Promise<void>;
  addUsage(subject: string, day: string, route: string, usd: number): Promise<void>;
  /** Calls per route for one subject on one day (quota checks). */
  usageFor(subject: string, day: string): Promise<Record<string, number>>;
  /** Spend for days starting with `prefix` ("2026-10" = the month, "2026-10-05" = one day). */
  spend(prefix: string): Promise<Spend>;
  addFeedback(f: Omit<FeedbackRow, "id" | "at">): Promise<void>;
  listFeedback(limit: number): Promise<FeedbackRow[]>;
  stats(): Promise<{ users: number; active7d: number; withProgress: number; quotaHitsToday: number }>;
  noteQuotaHit(day: string): Promise<void>;
}

// ---------------------------------------------------------------- Postgres (Neon)

class PgStore implements Store {
  private ready: Promise<void> | null = null;
  constructor(private url: string) {}

  private async sql() {
    const { neon } = await import("@neondatabase/serverless");
    const q = neon(this.url);
    this.ready ??= (async () => {
      await q`create table if not exists nines_users (id text primary key, email text, name text, role text not null, created_at bigint not null, last_seen bigint not null)`;
      await q`create table if not exists nines_progress (user_id text primary key references nines_users(id) on delete cascade, blob jsonb not null, saved_at bigint not null)`;
      await q`create table if not exists nines_ai_usage (subject text not null, day text not null, route text not null, calls int not null default 0, usd double precision not null default 0, primary key (subject, day, route))`;
      await q`create table if not exists nines_feedback (id serial primary key, at bigint not null, subject text not null, email text, page text not null, message text not null)`;
      await q`create table if not exists nines_counters (key text primary key, n int not null default 0)`;
    })();
    await this.ready;
    return q;
  }

  async upsertUser(u: Omit<UserRow, "createdAt" | "lastSeen">) {
    const q = await this.sql();
    const now = Date.now();
    await q`insert into nines_users (id, email, name, role, created_at, last_seen) values (${u.id}, ${u.email}, ${u.name}, ${u.role}, ${now}, ${now})
            on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role, last_seen = excluded.last_seen`;
  }
  async deleteUser(id: string) {
    const q = await this.sql();
    await q`delete from nines_users where id = ${id}`;
  }
  async getProgress(userId: string) {
    const q = await this.sql();
    const rows = (await q`select blob, saved_at from nines_progress where user_id = ${userId}`) as { blob: unknown; saved_at: string | number }[];
    const r = rows[0];
    return r ? { blob: r.blob, savedAt: Number(r.saved_at) } : null;
  }
  async putProgress(userId: string, blob: unknown, savedAt: number) {
    const q = await this.sql();
    await q`insert into nines_progress (user_id, blob, saved_at) values (${userId}, ${JSON.stringify(blob)}::jsonb, ${savedAt})
            on conflict (user_id) do update set blob = excluded.blob, saved_at = excluded.saved_at`;
  }
  async addUsage(subject: string, day: string, route: string, usd: number) {
    const q = await this.sql();
    await q`insert into nines_ai_usage (subject, day, route, calls, usd) values (${subject}, ${day}, ${route}, 1, ${usd})
            on conflict (subject, day, route) do update set calls = nines_ai_usage.calls + 1, usd = nines_ai_usage.usd + excluded.usd`;
  }
  async usageFor(subject: string, day: string) {
    const q = await this.sql();
    const rows = (await q`select route, calls from nines_ai_usage where subject = ${subject} and day = ${day}`) as { route: string; calls: number }[];
    return Object.fromEntries(rows.map((r) => [r.route, Number(r.calls)]));
  }
  async spend(prefix: string) {
    const q = await this.sql();
    const rows = (await q`select route, sum(calls)::int as calls, sum(usd) as usd from nines_ai_usage where day like ${prefix + "%"} group by route`) as { route: string; calls: number; usd: number }[];
    const byRoute = Object.fromEntries(rows.map((r) => [r.route, { calls: Number(r.calls), usd: Number(r.usd) }]));
    return { usd: rows.reduce((s, r) => s + Number(r.usd), 0), calls: rows.reduce((s, r) => s + Number(r.calls), 0), byRoute };
  }
  async addFeedback(f: Omit<FeedbackRow, "id" | "at">) {
    const q = await this.sql();
    await q`insert into nines_feedback (at, subject, email, page, message) values (${Date.now()}, ${f.subject}, ${f.email}, ${f.page}, ${f.message})`;
  }
  async listFeedback(limit: number) {
    const q = await this.sql();
    const rows = (await q`select id, at, subject, email, page, message from nines_feedback order by at desc limit ${limit}`) as (Omit<FeedbackRow, "at"> & { at: string | number })[];
    return rows.map((r) => ({ ...r, at: Number(r.at) }));
  }
  async stats() {
    const q = await this.sql();
    const week = Date.now() - 7 * 86_400_000;
    const [u] = (await q`select count(*)::int as n, count(*) filter (where last_seen > ${week})::int as a from nines_users`) as { n: number; a: number }[];
    const [p] = (await q`select count(*)::int as n from nines_progress`) as { n: number }[];
    const [h] = (await q`select coalesce(max(n), 0)::int as n from nines_counters where key = ${"quota:" + dayKey()}`) as { n: number }[];
    return { users: u?.n ?? 0, active7d: u?.a ?? 0, withProgress: p?.n ?? 0, quotaHitsToday: h?.n ?? 0 };
  }
  async noteQuotaHit(day: string) {
    const q = await this.sql();
    await q`insert into nines_counters (key, n) values (${"quota:" + day}, 1) on conflict (key) do update set n = nines_counters.n + 1`;
  }
}

// ---------------------------------------------------------------- local file (dev, tests, no database)

interface FileData {
  users: Record<string, UserRow>;
  progress: Record<string, { blob: unknown; savedAt: number }>;
  usage: Record<string, { calls: number; usd: number }>; // key: subject|day|route
  feedback: FeedbackRow[];
  counters: Record<string, number>;
}

class FileStore implements Store {
  private data: FileData | null = null;
  private file = path.join(process.cwd(), ".nines", "store.json");

  private async load(): Promise<FileData> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8")) as FileData;
    } catch {
      this.data = { users: {}, progress: {}, usage: {}, feedback: [], counters: {} };
    }
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

  async upsertUser(u: Omit<UserRow, "createdAt" | "lastSeen">) {
    const d = await this.load();
    const now = Date.now();
    d.users[u.id] = { ...u, createdAt: d.users[u.id]?.createdAt ?? now, lastSeen: now };
    await this.save();
  }
  async deleteUser(id: string) {
    const d = await this.load();
    delete d.users[id];
    delete d.progress[id];
    await this.save();
  }
  async getProgress(userId: string) {
    return (await this.load()).progress[userId] ?? null;
  }
  async putProgress(userId: string, blob: unknown, savedAt: number) {
    const d = await this.load();
    d.progress[userId] = { blob, savedAt };
    await this.save();
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
  async stats() {
    const d = await this.load();
    const week = Date.now() - 7 * 86_400_000;
    const users = Object.values(d.users);
    return { users: users.length, active7d: users.filter((u) => u.lastSeen > week).length, withProgress: Object.keys(d.progress).length, quotaHitsToday: d.counters[`quota:${dayKey()}`] ?? 0 };
  }
  async noteQuotaHit(day: string) {
    const d = await this.load();
    d.counters[`quota:${day}`] = (d.counters[`quota:${day}`] ?? 0) + 1;
    await this.save();
  }
}

let instance: Store | null = null;
export function store(): Store {
  instance ??= process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  return instance;
}

/** UTC calendar day, the unit for quotas and spend. */
export function dayKey(t = Date.now()): string {
  return new Date(t).toISOString().slice(0, 10);
}
