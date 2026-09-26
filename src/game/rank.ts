/**
 * Rank = nines of availability. `n` in [1, 5]; uptime = 1 - 10^-n.
 * XP moves n within a tier; crossing an integer requires beating that tier's gate.
 */

export const MIN_NINES = 1;
export const MAX_NINES = 5;

/** XP needed to cross each tier (index = floor(n)). */
export const TIER_XP: Record<number, number> = { 1: 1500, 2: 4500, 3: 10000, 4: 18000 };

/** Gates between tiers: beating any `count` of the listed bosses opens the next nine. */
export const GATES: Record<number, { bosses: string[]; count: number; label: string }> = {
  1: { bosses: ["boss-launch-day"], count: 1, label: "Launch Day" },
  2: { bosses: ["boss-viral-tuesday", "boss-far-away-users", "boss-celebrity-post", "boss-seat-rush", "boss-the-bill"], count: 3, label: "3 of the Two Nines bosses" },
  3: { bosses: ["boss-primary-down", "case-kv-store", "case-payment-system", "boss-ship-the-prompt", "boss-agent-meltdown", "case-notification-system"], count: 4, label: "4 of the Three Nines bosses" },
  4: { bosses: ["boss-region-outage", "boss-breach", "capstone-case-intel-india"], count: 3, label: "Region Down, The Breach, and the Capstone" },
};

/** How far below the next integer XP alone can take you while the gate is shut. */
const GATE_CEILING = 0.97;

export const TIER_NAMES = ["", "One Nine", "Two Nines", "Three Nines", "Four Nines", "Five Nines"];
const SUB = ["I", "II", "III"];

export function uptime(n: number): number {
  return 1 - Math.pow(10, -n);
}

/** Format uptime with enough decimals to show movement at this rank. */
export function formatUptime(n: number): string {
  const u = uptime(n) * 100;
  const decimals = n < 2 ? 2 : n < 3 ? 2 : n < 4 ? 3 : 4;
  return u.toFixed(decimals);
}

export function gateOpen(tier: number, beaten: ReadonlySet<string>): boolean {
  const g = GATES[tier];
  if (!g) return true;
  return g.bosses.filter((b) => beaten.has(b)).length >= g.count;
}

export interface RankState {
  /** Earned nines (never decreases). */
  nines: number;
  tier: number;
  tierName: string;
  sub: string;
  /** 0..1 progress through the current tier. */
  progress: number;
  xpIntoTier: number;
  xpForTier: number;
  /** True when XP is banked behind a shut gate. */
  gated: boolean;
  gate?: { label: string; bosses: string[]; count: number };
}

export function rankFromXp(xp: number, beaten: ReadonlySet<string>): RankState {
  let tier = MIN_NINES;
  let remaining = Math.max(0, xp);
  while (tier < MAX_NINES) {
    const need = TIER_XP[tier]!;
    if (remaining >= need && gateOpen(tier, beaten)) {
      remaining -= need;
      tier++;
    } else break;
  }
  if (tier >= MAX_NINES) {
    return { nines: MAX_NINES, tier: MAX_NINES, tierName: TIER_NAMES[MAX_NINES]!, sub: "", progress: 1, xpIntoTier: 0, xpForTier: 0, gated: false };
  }
  const need = TIER_XP[tier]!;
  const raw = remaining / need;
  const gatedShut = !gateOpen(tier, beaten);
  const progress = gatedShut ? Math.min(raw, GATE_CEILING) : Math.min(raw, 0.999);
  const nines = tier + progress;
  const g = GATES[tier];
  return {
    nines,
    tier,
    tierName: TIER_NAMES[tier]!,
    sub: SUB[Math.min(2, Math.floor(progress * 3))]!,
    progress,
    xpIntoTier: remaining,
    xpForTier: need,
    gated: gatedShut && raw >= GATE_CEILING,
    gate: gatedShut && g ? { label: g.label, bosses: g.bosses, count: g.count } : undefined,
  };
}

/**
 * Knowledge decay dents live uptime: each degraded concept contributes debt, capped at 0.3 nines,
 * never below the current rank's integer floor.
 */
export const MAX_DEBT = 0.3;

export function debtFor(retrievability: number): number {
  return retrievability >= 0.9 ? 0 : Math.min(0.12, (0.9 - retrievability) * 0.5);
}

export function liveNines(earned: number, retrievabilities: number[]): { nines: number; debt: number; degraded: number } {
  let debt = 0;
  let degraded = 0;
  for (const r of retrievabilities) {
    const d = debtFor(r);
    if (d > 0) degraded++;
    debt += d;
  }
  debt = Math.min(MAX_DEBT, debt);
  const floor = Math.floor(earned);
  return { nines: Math.max(floor, earned - debt), debt, degraded };
}
