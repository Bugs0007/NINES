import "server-only";
/**
 * Server-side Claude access: client, cost ledger, and the hard monthly budget.
 * The key lives in .env.local (ANTHROPIC_API_KEY) and never reaches the browser.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { monthlyBudgetUsd } from "@/config/claude";
import { CACHE_READ_MULT, CACHE_WRITE_MULT, PRICING } from "@/config/models";

const LEDGER = path.join(process.cwd(), ".nines", "usage.json");

interface Ledger {
  month: string;
  spentUsd: number;
  calls: number;
  byRoute: Record<string, { calls: number; usd: number }>;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

async function readLedger(): Promise<Ledger> {
  try {
    const l = JSON.parse(await readFile(LEDGER, "utf8")) as Ledger;
    if (l.month === thisMonth()) return l;
  } catch {
    /* first run */
  }
  return { month: thisMonth(), spentUsd: 0, calls: 0, byRoute: {} };
}

let memLedger: Ledger | null = null;

async function writeLedger(l: Ledger) {
  memLedger = l;
  try {
    await mkdir(path.dirname(LEDGER), { recursive: true });
    await writeFile(LEDGER, JSON.stringify(l, null, 2));
  } catch {
    /* read-only FS (e.g. serverless): keep the in-memory copy */
  }
}

export async function ledger(): Promise<Ledger> {
  if (memLedger && memLedger.month === thisMonth()) return memLedger;
  memLedger = await readLedger();
  return memLedger;
}

export function hasKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export class BudgetExceeded extends Error {}

export async function assertBudget(): Promise<void> {
  const l = await ledger();
  if (l.spentUsd >= monthlyBudgetUsd()) throw new BudgetExceeded(`Monthly Claude budget of $${monthlyBudgetUsd()} reached`);
}

export function costOf(model: string, u: Anthropic.Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const input = u.input_tokens * p.input + cacheWrite * p.input * CACHE_WRITE_MULT + cacheRead * p.input * CACHE_READ_MULT;
  return (input + u.output_tokens * p.output) / 1e6;
}

export async function record(route: string, model: string, usage: Anthropic.Usage): Promise<number> {
  const usd = costOf(model, usage);
  const l = await ledger();
  const r = l.byRoute[route] ?? { calls: 0, usd: 0 };
  await writeLedger({
    ...l,
    spentUsd: l.spentUsd + usd,
    calls: l.calls + 1,
    byRoute: { ...l.byRoute, [route]: { calls: r.calls + 1, usd: r.usd + usd } },
  });
  return usd;
}

/** Common JSON error responses for the routes. */
export function unavailable(reason: string, status = 200) {
  return Response.json({ ok: false, reason }, { status });
}
