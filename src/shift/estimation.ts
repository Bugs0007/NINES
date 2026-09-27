/**
 * Estimathon: procedurally generated back-of-envelope problems with worked breakdowns.
 * Scaffolding fades with practice: worked (all steps but the last) -> faded (first step) -> solo.
 */
import { PRICING, MODELS } from "@/config/models";
import { Rng } from "@/engine/rng";

export interface EstProblem {
  id: string;
  prompt: string;
  unit: string;
  answer: number;
  acceptFactor: number;
  steps: string[];
  topic: string;
}

const fmt = (x: number) => {
  if (x >= 1e9) return `${+(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${+(x / 1e6).toFixed(2)}M`;
  if (x >= 1e4) return `${+(x / 1e3).toFixed(1)}k`;
  return `${+x.toFixed(x < 10 ? 2 : 0)}`;
};

type Gen = (r: Rng) => EstProblem;

const GENS: Gen[] = [
  (r) => {
    const dau = r.pick([2e5, 5e5, 1e6, 3e6, 1e7]);
    const m = r.pick([10, 20, 40, 60]);
    const pk = r.pick([2, 3, 4]);
    const perDay = dau * m;
    const avg = perDay / 86400;
    return {
      id: "qps",
      topic: "QPS from users",
      prompt: `Pigeon has ${fmt(dau)} daily active users, each sending about ${m} messages a day. Traffic peaks at ${pk}× the daily average. Estimate peak messages per second.`,
      unit: "msg/s",
      answer: avg * pk,
      acceptFactor: 2,
      steps: [`messages per day = ${fmt(dau)} × ${m} = ${fmt(perDay)}`, `average per second ≈ ${fmt(perDay)} ÷ 86,400 ≈ ${fmt(avg)} (a day is ~10⁵ seconds)`, `peak ≈ ${fmt(avg)} × ${pk} ≈ ${fmt(avg * pk)} msg/s`],
    };
  },
  (r) => {
    const dau = r.pick([1e5, 5e5, 1e6, 5e6]);
    const n = r.pick([1, 2, 5]);
    const kb = r.pick([200, 500, 1000]);
    const perDayKb = dau * n * kb;
    const tb = (perDayKb * 365) / 1e9;
    return {
      id: "storage",
      topic: "storage per year",
      prompt: `${fmt(dau)} users each upload ${n} photo${n > 1 ? "s" : ""} a day at about ${kb} KB each. How much storage do you need per year, in TB?`,
      unit: "TB",
      answer: tb,
      acceptFactor: 2,
      steps: [`per day = ${fmt(dau)} × ${n} × ${kb} KB = ${fmt(perDayKb)} KB ≈ ${fmt(perDayKb / 1e6)} GB`, `per year ≈ ${fmt(perDayKb / 1e6)} GB × 365 ≈ ${fmt((perDayKb * 365) / 1e6)} GB`, `≈ ${fmt(tb)} TB (1 TB = 1,000 GB)`],
    };
  },
  (r) => {
    const rps = r.pick([500, 2000, 8000, 20000]);
    const kb = r.pick([2, 10, 40, 100]);
    const mbps = (rps * kb * 8) / 1000;
    return {
      id: "bandwidth",
      topic: "bandwidth",
      prompt: `Your API serves ${fmt(rps)} requests per second and each response averages ${kb} KB. What's the outbound bandwidth, in megabits per second?`,
      unit: "Mbps",
      answer: mbps,
      acceptFactor: 1.5,
      steps: [`bytes/s = ${fmt(rps)} × ${kb} KB = ${fmt(rps * kb)} KB/s`, `bits/s = × 8 = ${fmt(rps * kb * 8)} kbit/s`, `≈ ${fmt(mbps)} Mbps (1 Mbps = 1,000 kbit/s)`],
    };
  },
  (r) => {
    const n = r.pick([1e5, 1e6, 5e6, 2e7]);
    const kb = r.pick([1, 2, 5, 10]);
    const gb = (n * kb * 1.3) / 1e6;
    return {
      id: "cache",
      topic: "cache memory",
      prompt: `You want the ${fmt(n)} most popular profiles in Redis, about ${kb} KB each, plus roughly 30% overhead for keys and data structures. How much RAM, in GB?`,
      unit: "GB",
      answer: gb,
      acceptFactor: 1.5,
      steps: [`raw = ${fmt(n)} × ${kb} KB = ${fmt(n * kb)} KB ≈ ${fmt((n * kb) / 1e6)} GB`, `with overhead ≈ ${fmt((n * kb) / 1e6)} × 1.3`, `≈ ${fmt(gb)} GB`],
    };
  },
  (r) => {
    const cap = r.pick([150, 200, 400, 800]);
    const rps = r.pick([1500, 3000, 6000, 12000]);
    const n = Math.ceil(rps / cap) + 1;
    return {
      id: "servers",
      topic: "fleet size",
      prompt: `Each app server handles about ${cap} req/s while staying near 60% CPU. Peak traffic is ${fmt(rps)} req/s. How many servers so that one can die at peak?`,
      unit: "servers",
      answer: n,
      acceptFactor: 1.25,
      steps: [`needed at peak = ${fmt(rps)} ÷ ${cap} = ${(rps / cap).toFixed(1)}, round up to ${Math.ceil(rps / cap)}`, `plus one spare for N−1`, `= ${n} servers`],
    };
  },
  (r) => {
    const rps = r.pick([200, 800, 2500, 10000]);
    const ms = r.pick([20, 50, 120, 300]);
    const L = (rps * ms) / 1000;
    return {
      id: "inflight",
      topic: "Little's Law",
      prompt: `A service takes ${fmt(rps)} req/s and each request spends ${ms}ms in the system on average. How many requests are in flight at any moment?`,
      unit: "requests",
      answer: L,
      acceptFactor: 1.3,
      steps: [`L = λ × W`, `= ${fmt(rps)} × ${ms / 1000} s`, `≈ ${fmt(L)} requests in flight`],
    };
  },
  (r) => {
    const reqs = r.pick([1e4, 5e4, 2e5, 1e6]);
    const tin = r.pick([800, 2000, 6000]);
    const tout = r.pick([200, 400, 800]);
    const p = PRICING[MODELS.grader]!;
    const usd = (reqs * tin * p.input + reqs * tout * p.output) / 1e6;
    return {
      id: "llm-cost",
      topic: "LLM cost",
      prompt: `Copilot gets ${fmt(reqs)} requests a day, each about ${fmt(tin)} input and ${tout} output tokens. At $${p.input} per million input tokens and $${p.output} per million output tokens, what's the daily bill in dollars?`,
      unit: "USD/day",
      answer: usd,
      acceptFactor: 1.5,
      steps: [`input = ${fmt(reqs)} × ${fmt(tin)} = ${fmt(reqs * tin)} tokens → × $${p.input}/M = $${fmt((reqs * tin * p.input) / 1e6)}`, `output = ${fmt(reqs)} × ${tout} = ${fmt(reqs * tout)} tokens → × $${p.output}/M = $${fmt((reqs * tout * p.output) / 1e6)}`, `total ≈ $${fmt(usd)} per day`],
    };
  },
];

/** A day's problem: deterministic per (day, index), so a shift can be replayed. */
export function problemFor(day: string, index: number, allow?: string[]): EstProblem {
  const r = new Rng(`est-${day}-${index}`);
  const gens = allow ? GENS.filter((g) => allow.includes(g(new Rng("probe")).id)) : GENS;
  return r.pick(gens)(r);
}

/** 0 = worked, 1 = faded, 2 = solo. */
export function scaffoldLevel(drillsDone: number): 0 | 1 | 2 {
  return drillsDone < 2 ? 0 : drillsDone < 5 ? 1 : 2;
}
