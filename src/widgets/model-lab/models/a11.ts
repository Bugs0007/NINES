/**
 * Chapter A11 "Running it" models: SLOs and error budgets, observability, deploy strategies, feature flags,
 * graceful degradation, RPO and RTO, multi-region, and the region-outage game day. Closed forms with labelled
 * round constants (see each model's `honest` text).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ SLOs and error budgets

const MONTH_MIN = 43200;

export const sloLab: LabModel = {
  id: "slo-lab",
  metrics: ["sloValue", "budgetMin", "remaining", "slowBurnCaught", "outageDelayMin", "falsePages"],
  observes: ["budget-gone", "missed-slow"],
  scenes: ["budget", "burn", "window"],
  runLabel: "Set the SLO and alerts",
  honest: [
    "A 30-day month is 43,200 minutes. The error budget is (1 − SLO) × 43,200. This month had three kinds of trouble: a total outage of 8 minutes, a slow burn of 2% errors for 6 hours, and 20 one-minute spikes of 5% errors that fix themselves.",
    "Budget used is 8 + (6 × 60 × 2%) + (20 × 1 × 5%) = 16.2 minutes of full outage. The burn rate is the windowed error rate divided by (1 − SLO): a burn rate of 1 uses the budget exactly over the month.",
    "An alert fires when the error rate over its window reaches a multiple of the budget rate. A longer window needs more time to fill; a shorter one reacts quickly and is jumpier. Time to page is the window × threshold × (1 − SLO) ÷ error rate.",
  ],
  init: () => ({ slo: "99.99", window: "360", thr: 50 }),
  controls: () => [
    { kind: "choice", id: "slo", label: "SLO", options: ["99", "99.5", "99.9", "99.95", "99.99", "99.999"].map((x) => ({ id: x, label: `${x}%` })) },
    { kind: "choice", id: "window", label: "Alert window", options: [{ id: "5", label: "5 minutes" }, { id: "60", label: "1 hour" }, { id: "360", label: "6 hours" }] },
    { kind: "slider", id: "thr", label: "Page when the burn rate reaches", min: 1, max: 1000, log: true, fmt: "num", hint: "times budget rate" },
  ],
  evaluate: (v) => {
    const slo = Number(str(v, "slo")) / 100;
    const budget = (1 - slo) * MONTH_MIN;
    const used = 8 + 6 * 60 * 0.02 + 20 * 1 * 0.05;
    const remaining = 1 - used / budget;
    const w = Number(str(v, "window"));
    const thr = num(v, "thr");
    const need = thr * (1 - slo);
    const after = (e: number, d: number): number => (need <= (e * Math.min(d, w)) / w ? (w * need) / e : Infinity);
    const outage = after(1, 8);
    const slow = after(0.02, 360);
    const noise = after(0.05, 1);
    const falsePages = Number.isFinite(noise) ? 20 : 0;
    return {
      metrics: { sloValue: slo * 100, budgetMin: budget, remaining, slowBurnCaught: Number.isFinite(slow) ? 1 : 0, outageDelayMin: Number.isFinite(outage) ? outage : 999, falsePages },
      readouts: [
        { label: "Error budget this month", value: budget, fmt: "num", sub: "minutes", tone: budget < 10 ? "warn" : "ok" },
        { label: "Budget left after this month's trouble", value: remaining, fmt: "pct", tone: remaining < 0 ? "alert" : remaining < 0.25 ? "warn" : "ok" },
        { label: "Slow burn (2% errors for 6 hours) pages", value: Number.isFinite(slow) ? "yes" : "no", tone: Number.isFinite(slow) ? "ok" : "alert" },
        { label: "Total outage pages after", value: Number.isFinite(outage) ? outage : "never", fmt: "num", sub: "minutes", tone: tone(Number.isFinite(outage) ? outage : 999, 5, 15) },
        { label: "False pages from self-healing spikes", value: falsePages, fmt: "int", tone: falsePages > 1 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Budget, minutes", value: budget, tone: "info" }, { label: "Used this month", value: used, tone: used > budget ? "alert" : "ok" }] },
      notes: [remaining < 0 ? "The budget is gone. By the usual policy, risky changes wait until it recovers." : "There is room to ship, and the alerts tell the difference between a blip and a burn."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.remaining! < 0) ev.push("budget-gone");
    if (out.metrics.slowBurnCaught! < 1) ev.push("missed-slow");
    return ev;
  },
  scene: (n): SceneOut => (n === "budget" ? { set: { slo: "99.99" }, focus: ["slo"] } : n === "burn" ? { set: { slo: "99.9", window: "60", thr: 14 }, focus: ["thr"] } : n === "window" ? { set: { window: "5" }, focus: ["window"] } : undefined),
};

// ------------------------------------------------------------------ observability

export const observeLab: LabModel = {
  id: "observe-lab",
  metrics: ["detectMin", "locateMin", "explainMin", "costPerMonth"],
  observes: ["blind", "bill"],
  scenes: ["metrics", "traces", "logs"],
  runLabel: "Choose what to collect",
  honest: [
    "A service handling 20,000 requests a second with 8 spans in each. An incident has three questions: is something wrong (detect), which service is it (locate), and why did this request fail (explain).",
    "Metrics tell you something is wrong in about 2 minutes; without alerts customers tell you in about 25. Traces locate the slow or failing hop in about 4 minutes if the failing requests have traces, 12 if 5% of them do, and 30 otherwise. Logs explain in about 8 minutes at info level with a correlation id, 25 at error level, 90 with none. Tail sampling keeps every error and slow trace, and a kept trace carries what the logs would have said.",
    "Costs: metrics $2,000 a month. Logs at $0.50 a GB: error level $750, info $30,000, debug $300,000. Traces at 100% sampling would cost $829,000; tail sampling adds 0.5% for errors and slow requests. All round figures.",
  ],
  init: () => ({ metrics: false, logs: "info", corr: false, sample: 100, tail: false }),
  controls: () => [
    { kind: "toggle", id: "metrics", label: "Metrics with alerts" },
    { kind: "choice", id: "logs", label: "Logs", options: [{ id: "off", label: "Off" }, { id: "error", label: "Errors only" }, { id: "info", label: "Info level" }, { id: "debug", label: "Debug level" }] },
    { kind: "toggle", id: "corr", label: "Correlation id on every log line and span" },
    { kind: "slider", id: "sample", label: "Share of requests traced", min: 0.01, max: 100, log: true, fmt: "num", hint: "percent" },
    { kind: "toggle", id: "tail", label: "Tail sampling", detail: "Always keep traces that errored or were slow" },
  ],
  evaluate: (v) => {
    const metrics = bool(v, "metrics");
    const logs = str(v, "logs");
    const corr = bool(v, "corr");
    const sample = num(v, "sample") / 100;
    const tail = bool(v, "tail");
    const coverage = tail ? 1 : sample;
    const detect = metrics ? 2 : 25;
    const locate = coverage >= 0.5 ? 4 : coverage >= 0.05 ? 12 : 30;
    const explain = tail ? 8 : (logs === "info" || logs === "debug") && corr ? 8 : logs !== "off" && corr ? 25 : 90;
    const logCost = ({ off: 0, error: 750, info: 30000, debug: 300000 } as Record<string, number>)[logs]!;
    const traceCost = 829000 * sample + (tail ? 829000 * 0.005 : 0);
    const cost = (metrics ? 2000 : 0) + logCost + traceCost;
    return {
      metrics: { detectMin: detect, locateMin: locate, explainMin: explain, costPerMonth: cost },
      readouts: [
        { label: "Time to notice something is wrong", value: detect, fmt: "num", sub: "minutes", tone: tone(detect, 5, 15) },
        { label: "Time to find which service", value: locate, fmt: "num", sub: "minutes", tone: tone(locate, 10, 20) },
        { label: "Time to explain one failed request", value: explain, fmt: "num", sub: "minutes", tone: tone(explain, 10, 30) },
        { label: "Monthly cost", value: cost, fmt: "usd", tone: tone(cost, 20000, 50000) },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Detect", value: detect, tone: tone(detect, 5, 15) }, { label: "Locate", value: locate, tone: tone(locate, 10, 20) }, { label: "Explain", value: explain, tone: tone(explain, 10, 30) }] },
      notes: [cost > 50000 ? "Everything, all the time: you can see it all and the bill is the incident." : tail ? "The traces you keep are the ones you will need." : "What you did not record is what you will wish you had."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.locateMin! > 20 || out.metrics.explainMin! > 60) ev.push("blind");
    if (out.metrics.costPerMonth! > 50000) ev.push("bill");
    return ev;
  },
  scene: (n): SceneOut => (n === "metrics" ? { set: { metrics: true }, focus: ["metrics"] } : n === "traces" ? { set: { tail: true, sample: 0.1 }, focus: ["tail", "sample"] } : n === "logs" ? { set: { logs: "error", corr: true }, focus: ["logs", "corr"] } : undefined),
};

// ------------------------------------------------------------------ deploy strategies

export const deployLab: LabModel = {
  id: "deploy-lab",
  metrics: ["badRequests", "detectS", "rollbackMin", "capacityX", "promoted"],
  observes: ["wide", "promoted"],
  scenes: ["allatonce", "canary", "bluegreen"],
  runLabel: "Ship the release",
  honest: [
    "A release has a bug that fails 5% of the requests it serves, against a normal error rate of 0.5%. The service takes 2,000 requests a second. Spotting a difference this size takes about 400 requests on the new version.",
    "All-at-once and blue-green send 100% to the new version straight away (blue-green flips back in about a minute; all-at-once needs a 20-minute redeploy). Rolling replaces 10% of the fleet every 5 minutes and takes 15 minutes to undo. A canary sends a small share for a hold time first; if the hold ends before the bug is detected, it promotes to 100%.",
    "Bad requests are requests served wrongly from release until the rollback finishes. Blue-green needs 2× the capacity while both run; rolling about 1.1×.",
  ],
  init: () => ({ strategy: "all", weight: 1, hold: 10 }),
  controls: () => [
    { kind: "choice", id: "strategy", label: "Strategy", options: [{ id: "all", label: "All at once" }, { id: "rolling", label: "Rolling, 10% every 5 minutes" }, { id: "canary", label: "Canary, then everyone" }, { id: "bluegreen", label: "Blue-green flip" }] },
    { kind: "slider", id: "weight", label: "Canary share of traffic", min: 0.05, max: 50, log: true, fmt: "num", hint: "percent" },
    { kind: "slider", id: "hold", label: "Canary hold time", min: 1, max: 60, step: 1, fmt: "int", hint: "minutes" },
  ],
  evaluate: (v) => {
    const s = str(v, "strategy");
    const rps = 2000;
    const bugRate = 0.05;
    const share = s === "canary" ? num(v, "weight") / 100 : s === "rolling" ? 0.1 : 1;
    const detect = 400 / (rps * share);
    const rollback = s === "all" ? 20 : s === "rolling" ? 15 : 1;
    let bad: number;
    let promoted = false;
    if (s === "canary") {
      const hold = num(v, "hold") * 60;
      if (hold < detect) {
        promoted = true;
        bad = rps * bugRate * (share * hold + 0.2 + rollback * 60);
      } else bad = rps * share * bugRate * (detect + rollback * 60);
    } else if (s === "rolling") bad = rps * bugRate * (0.1 * detect + 0.05 * rollback * 60);
    else bad = rps * bugRate * (detect + rollback * 60);
    const cap = s === "bluegreen" ? 2 : s === "rolling" ? 1.1 : s === "canary" ? 1.01 : 1;
    return {
      metrics: { badRequests: bad, detectS: detect, rollbackMin: rollback, capacityX: cap, promoted: promoted ? 1 : 0 },
      readouts: [
        { label: "Requests failed by the bug", value: bad, fmt: "int", tone: bad > 5000 ? "alert" : bad > 500 ? "warn" : "ok" },
        { label: "Time to spot the bug", value: detect, fmt: "s" },
        { label: "Time to roll back", value: rollback, fmt: "num", sub: "minutes", tone: rollback > 5 ? "warn" : "ok" },
        { label: "Capacity needed", value: cap, fmt: "x", tone: cap > 1.5 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Failed requests", value: bad, tone: bad > 5000 ? "alert" : bad > 500 ? "warn" : "ok" }] },
      notes: [promoted ? "The hold ended before the canary had enough traffic to show the bug, so it went to everyone." : s === "canary" ? "A small share limits who is hurt, and the hold gives the numbers time to speak." : s === "bluegreen" ? "Rollback is a flip, but everyone is exposed to the bug first." : s === "rolling" ? "Gradual, but slow to undo." : "Everyone gets the bug at once, and the fix takes a redeploy."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.badRequests! > 50000) ev.push("wide");
    if (out.metrics.promoted! > 0) ev.push("promoted");
    return ev;
  },
  scene: (n): SceneOut => (n === "allatonce" ? { set: { strategy: "all" }, focus: ["strategy"] } : n === "canary" ? { set: { strategy: "canary", weight: 1, hold: 10 }, focus: ["strategy", "weight"] } : n === "bluegreen" ? { set: { strategy: "bluegreen" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ feature flags

export const flagLab: LabModel = {
  id: "flag-lab",
  metrics: ["exposedPct", "killS", "staleFlags"],
  observes: ["wide-exposure", "stale"],
  scenes: ["rollout", "kill", "debt"],
  runLabel: "Plan the rollout",
  honest: [
    "A new feature behind a flag turns out to be broken. It is on for the share of users you set. Noticing needs at least a minute of metrics, and at 2,000 requests a second it takes 400 flagged requests to see the problem. Turning the flag off then waits for the change to reach servers: 300 seconds if they poll every 5 minutes, 30 if every 30 seconds, 2 if streamed.",
    "Users exposed is the share on the flag × the fraction of the five-minute activity window that the problem was live. Flags that are never removed pile up: 50 new flags a year; with an owner and an expiry date enforced, about 5 survive past their date.",
    "Round figures for comparison.",
  ],
  init: () => ({ pct: 100, prop: "poll5m", expiry: false }),
  controls: () => [
    { kind: "slider", id: "pct", label: "Users on the new flag", min: 0.1, max: 100, log: true, fmt: "num", hint: "percent" },
    { kind: "choice", id: "prop", label: "How a flag change reaches servers", options: [{ id: "poll5m", label: "Servers poll every 5 minutes" }, { id: "poll30s", label: "Servers poll every 30 seconds" }, { id: "stream", label: "Changes are streamed" }] },
    { kind: "toggle", id: "expiry", label: "Every flag has an owner and an expiry date, enforced" },
  ],
  evaluate: (v) => {
    const p = num(v, "pct") / 100;
    const kill = ({ poll5m: 300, poll30s: 30, stream: 2 } as Record<string, number>)[str(v, "prop")]!;
    const detect = Math.max(60, 400 / (2000 * p));
    const exposed = p * Math.min(1, (detect + kill) / 300);
    const stale = bool(v, "expiry") ? 5 : 50;
    return {
      metrics: { exposedPct: exposed, killS: kill, staleFlags: stale },
      readouts: [
        { label: "Users who hit the bug", value: exposed, fmt: "pct", tone: exposed > 0.005 ? "alert" : exposed > 0.002 ? "warn" : "ok" },
        { label: "Time for a kill switch to take effect", value: kill, fmt: "s", tone: kill > 30 ? "alert" : "ok" },
        { label: "Flags past their useful life after a year", value: stale, fmt: "int", tone: stale > 10 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", bars: [{ label: "Users hit", value: exposed, tone: exposed > 0.005 ? "alert" : "ok" }] },
      notes: [p > 0.1 ? "A wide rollout turns a bad flag into everyone's problem before the numbers say so." : kill > 30 ? "Switching off is slow, so the damage runs long." : "Small exposure and a quick switch keep a mistake small."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.exposedPct! > 0.02) ev.push("wide-exposure");
    if (out.metrics.staleFlags! > 20) ev.push("stale");
    return ev;
  },
  scene: (n): SceneOut => (n === "rollout" ? { set: { pct: 1 }, focus: ["pct"] } : n === "kill" ? { set: { prop: "stream" }, focus: ["prop"] } : n === "debt" ? { set: { expiry: true }, focus: ["expiry"] } : undefined),
};

// ------------------------------------------------------------------ graceful degradation

export const degradeLab: LabModel = {
  id: "degrade-lab",
  metrics: ["availNormal", "availOverload", "degradedShare"],
  observes: ["cascade", "brittle"],
  scenes: ["fallback", "shed", "brownout"],
  runLabel: "Design the fallbacks",
  honest: [
    "A product page needs payment (99.99% available) and inventory (99.97%). It also shows recommendations (99%), reviews (99%) and a personalised banner (98%). If every one is required, the page is up only when all five are: about 96%. If the optional three have fallbacks, the page is up when the two required ones are: 99.96%.",
    "Under overload at 1.5× normal load, a page that does all its work serves only 1 ÷ 1.5 = 67% of requests. Shedding the optional parts costs 0.55 of a full page, so capacity covers 1 ÷ (1.5 × 0.55) = 121%, all requests, as simpler pages.",
    "Degraded share counts how often the page shows a fallback in normal operation: 1 − 0.99 × 0.99 × 0.98.",
  ],
  init: () => ({ optional: "required", shed: false }),
  controls: () => [
    { kind: "choice", id: "optional", label: "When a recommendations, reviews or banner service fails", options: [{ id: "required", label: "The page fails" }, { id: "fallback", label: "Show a default or cached version" }, { id: "hide", label: "Hide that part of the page" }] },
    { kind: "toggle", id: "shed", label: "Under overload, switch off the optional parts first" },
  ],
  evaluate: (v) => {
    const req = 0.9999 * 0.9997;
    const opt = 0.99 * 0.99 * 0.98;
    const optionalOk = str(v, "optional") !== "required";
    const normal = req * (optionalOk ? 1 : opt);
    const cost = bool(v, "shed") ? 0.55 : 1;
    const overload = normal * Math.min(1, 1 / (1.5 * cost));
    const degraded = optionalOk ? 1 - opt : 0;
    return {
      metrics: { availNormal: normal, availOverload: overload, degradedShare: degraded },
      readouts: [
        { label: "Pages served in normal operation", value: normal, fmt: "pct", tone: normal < 0.999 ? "alert" : "ok" },
        { label: "Pages served at 1.5× load", value: overload, fmt: "pct", tone: overload < 0.99 ? "alert" : "ok" },
        { label: "Pages showing a fallback", value: degraded, fmt: "pct", tone: degraded > 0.05 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Normal", value: normal, tone: normal < 0.999 ? "alert" : "ok" }, { label: "Overloaded", value: overload, tone: overload < 0.99 ? "alert" : "ok" }] },
      notes: [!optionalOk ? "Every nice-to-have has become a must-have, and their failures add up." : bool(v, "shed") ? "Under pressure the page gets simpler instead of failing." : "In a spike, the page still tries to do everything and serves fewer people."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.availOverload! < 0.9) ev.push("cascade");
    if (out.metrics.availNormal! < 0.99) ev.push("brittle");
    return ev;
  },
  scene: (n): SceneOut => (n === "fallback" ? { set: { optional: "fallback" }, focus: ["optional"] } : n === "shed" ? { set: { shed: true }, focus: ["shed"] } : n === "brownout" ? { set: { optional: "fallback", shed: true }, focus: ["optional", "shed"] } : undefined),
};

// ------------------------------------------------------------------ RPO and RTO

const RPO_TABLE: Record<string, { label: string; rpo: number; rto: number; cost: number; region: number }> = {
  nightly: { label: "Nightly backup", rpo: 1440, rto: 170, cost: 300, region: 99999 },
  snapshots: { label: "Hourly snapshots", rpo: 60, rto: 60, cost: 600, region: 99999 },
  pitr: { label: "Backups with archived write-ahead log (point in time)", rpo: 5, rto: 120, cost: 900, region: 99999 },
  replica: { label: "Async replica in the same region", rpo: 0.02, rto: 2, cost: 2200, region: 99999 },
  sync: { label: "Synchronous standby in another zone", rpo: 0, rto: 2, cost: 2600, region: 99999 },
  xregion: { label: "Async replica in another region", rpo: 0.1, rto: 15, cost: 3500, region: 15 },
};

export const rpoLab: LabModel = {
  id: "rpo-lab",
  metrics: ["rpoMin", "rtoMin", "regionRtoMin", "costPerMonth", "restorable"],
  observes: ["lost-day", "untested"],
  scenes: ["backups", "replicas", "drills"],
  runLabel: "Choose the recovery plan",
  honest: [
    "A 2 TB database. Restoring from backup runs at 200 MB/s, about 170 minutes. RPO, the recovery point objective, is how much recent data you can lose; RTO, the recovery time objective, is how long you can be down.",
    "Nightly backups lose up to a day. Hourly snapshots lose up to an hour and restore lazily in an hour. Archiving the write-ahead log lets you replay to within about 5 minutes, but replay takes 2 hours. A replica in the same region fails over in about 2 minutes losing about a second; a synchronous standby loses nothing; a replica in another region loses about 6 seconds and fails over in 15 minutes, and is the only plan here that survives losing the region. Copying backups to another region also survives it, but means a 4-hour restore.",
    "A backup nobody has restored may not work: 80% of untested backups restore cleanly, 99% of drilled ones. Drills cost $200 a month of engineer time.",
  ],
  init: () => ({ method: "nightly", copy: false, drills: false }),
  controls: () => [
    { kind: "choice", id: "method", label: "Primary protection", options: Object.entries(RPO_TABLE).map(([id, t]) => ({ id, label: t.label })) },
    { kind: "toggle", id: "copy", label: "Copy backups to another region", detail: "$250 a month" },
    { kind: "toggle", id: "drills", label: "Practise restores regularly" },
  ],
  evaluate: (v) => {
    const t = RPO_TABLE[str(v, "method")]!;
    const copy = bool(v, "copy");
    const region = t.region < 99999 ? t.region : copy ? 240 : 99999;
    const cost = t.cost + (copy ? 250 : 0) + (bool(v, "drills") ? 200 : 0);
    const restorable = bool(v, "drills") ? 0.99 : 0.8;
    return {
      metrics: { rpoMin: t.rpo, rtoMin: t.rto, regionRtoMin: region, costPerMonth: cost, restorable },
      readouts: [
        { label: "Most recent data you can lose", value: t.rpo, fmt: "num", sub: "minutes", tone: tone(t.rpo, 5, 60) },
        { label: "Time to recover (node or zone failure)", value: t.rto, fmt: "num", sub: "minutes", tone: tone(t.rto, 30, 120) },
        { label: "Time to recover if the region is lost", value: region >= 99999 ? "not possible" : region, fmt: "num", sub: region >= 99999 ? undefined : "minutes", tone: region >= 99999 ? "alert" : tone(region, 30, 120) },
        { label: "Cost a month", value: cost, fmt: "usd" },
        { label: "Chance a backup restores", value: restorable, fmt: "pct", tone: restorable < 0.95 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "RPO, minutes", value: t.rpo, tone: tone(t.rpo, 5, 60) }, { label: "RTO, minutes", value: t.rto, tone: tone(t.rto, 30, 120) }] },
      notes: [!bool(v, "drills") ? "Nobody has tried a restore. Until someone has, it is a hope." : t.region === 99999 && !copy ? "One region is one point of failure." : "The plan matches the numbers the business asked for."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.rpoMin! > 720) ev.push("lost-day");
    if (out.metrics.restorable! < 0.9) ev.push("untested");
    return ev;
  },
  scene: (n): SceneOut => (n === "backups" ? { set: { method: "snapshots" }, focus: ["method"] } : n === "replicas" ? { set: { method: "xregion" }, focus: ["method"] } : n === "drills" ? { set: { drills: true }, focus: ["drills"] } : undefined),
};

// ------------------------------------------------------------------ multi-region

export const regionLab: LabModel = {
  id: "region-lab",
  metrics: ["downtimeMinYr", "writeMs", "rpoS", "costX", "farUserMs"],
  observes: ["long-down", "slow-write"],
  scenes: ["single", "passive", "active"],
  runLabel: "Choose the topology",
  honest: [
    "A region fails twice a year for two hours. Users on the other side of the world are 220 ms from one region and 45 ms from a nearby one. Cross-region round trips are 80 ms.",
    "Single region: down for the whole outage, 240 minutes a year, with only daily backups to recover. Active-passive: a standby takes over; manually that is about 35 minutes each time including DNS, automated about 3. Active-active: both regions serve users all the time, and a failure shifts traffic in about a minute.",
    "Asynchronous replication keeps writes at 5 ms and can lose about 2 seconds of writes at failover; synchronous waits for the other region, 85 ms a write, and loses none. Costs are relative to one region: 1×, 1.6× and 2.2×. Active-active writes to both regions need conflict handling; the lab does not charge for that work.",
  ],
  init: () => ({ topo: "single", auto: false, repl: "async" }),
  controls: () => [
    { kind: "choice", id: "topo", label: "Topology", options: [{ id: "single", label: "One region" }, { id: "passive", label: "Active-passive: a warm standby" }, { id: "active", label: "Active-active: serve from both" }] },
    { kind: "toggle", id: "auto", label: "Automated failover", detail: "Active-passive only" },
    { kind: "choice", id: "repl", label: "Replication between regions", options: [{ id: "async", label: "Asynchronous" }, { id: "sync", label: "Synchronous" }] },
  ],
  evaluate: (v) => {
    const t = str(v, "topo");
    const auto = bool(v, "auto");
    const sync = str(v, "repl") === "sync";
    const down = t === "single" ? 240 : t === "passive" ? 2 * (auto ? 3 : 35) : 2;
    const write = t === "single" ? 5 : sync ? 85 : 5;
    const rpo = t === "single" ? 86400 : sync ? 0 : 2;
    const cost = t === "single" ? 1 : t === "passive" ? 1.6 : 2.2;
    const far = t === "active" ? 45 : 220;
    return {
      metrics: { downtimeMinYr: down, writeMs: write, rpoS: rpo, costX: cost, farUserMs: far },
      readouts: [
        { label: "Downtime a year", value: down, fmt: "num", sub: "minutes", tone: tone(down, 10, 60) },
        { label: "Write latency", value: write, fmt: "ms", tone: write > 50 ? "warn" : "ok" },
        { label: "Data lost at failover", value: rpo >= 86400 ? "up to a day" : rpo, fmt: "num", sub: rpo >= 86400 ? undefined : "seconds", tone: rpo > 5 ? "alert" : "ok" },
        { label: "Cost vs one region", value: cost, fmt: "x" },
        { label: "Latency for far-away users", value: far, fmt: "ms", tone: far > 100 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Downtime, minutes a year", value: down, tone: tone(down, 10, 60) }, { label: "Far-user latency, ms", value: far, tone: far > 100 ? "warn" : "ok" }] },
      notes: [t === "single" ? "The region is a single point of failure, and far users are far." : t === "passive" ? "Safe, but the standby does no serving, and far users are still far." : "Both regions work all the time, and each has to be ready to carry everything."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.downtimeMinYr! > 60) ev.push("long-down");
    if (out.metrics.writeMs! > 50) ev.push("slow-write");
    return ev;
  },
  scene: (n): SceneOut => (n === "single" ? { set: { topo: "single" }, focus: ["topo"] } : n === "passive" ? { set: { topo: "passive", auto: true }, focus: ["topo", "auto"] } : n === "active" ? { set: { topo: "active" }, focus: ["topo"] } : undefined),
};

// ------------------------------------------------------------------ game day boss

export const gamedayLab: LabModel = {
  id: "gameday-lab",
  metrics: ["downtimeMin", "writesLost", "successPct", "writeMs", "costPerMonth", "detectMin"],
  observes: [],
  scenes: ["detect", "failover", "degrade"],
  runLabel: "Pull the plug on the region",
  honest: [
    "Region A, with 2,000 writes a second, fails for two hours. The surviving region gets twice the traffic. Four models run together: detection, failover, data loss and degradation.",
    "Detection: an alert on the burn rate pages in 2 minutes; waiting for customer reports takes 18. Failover for active-passive is automatic in 1 minute, or manual: 25 minutes, 8 if the runbook has been practised. Traffic then follows DNS, which takes up to the record's TTL to move; active-active serves from both regions already and steers away from a failed one in about 90 seconds.",
    "Asynchronous replication loses about 2 seconds of writes (4,000) and writes take 5 ms; synchronous loses none but writes take 85 ms. At 2× load the surviving region serves 62% of requests unless the optional parts of the page are shed, then 99%. Cost per month: $18,000 for one region, ×1.6 for active-passive, ×2.2 for active-active.",
  ],
  init: () => ({ topo: "passive", failover: "manual", repl: "async", ttl: "3600", degrade: false, alert: false, drill: false }),
  controls: () => [
    { kind: "choice", id: "topo", label: "Topology", options: [{ id: "passive", label: "Active-passive" }, { id: "active", label: "Active-active" }] },
    { kind: "choice", id: "failover", label: "Failover (active-passive)", options: [{ id: "manual", label: "A person decides and runs it" }, { id: "auto", label: "Automatic on health checks" }] },
    { kind: "choice", id: "repl", label: "Replication", options: [{ id: "async", label: "Asynchronous" }, { id: "sync", label: "Synchronous" }] },
    { kind: "choice", id: "ttl", label: "DNS TTL (active-passive)", options: [{ id: "30", label: "30 seconds" }, { id: "300", label: "5 minutes" }, { id: "3600", label: "1 hour" }] },
    { kind: "toggle", id: "degrade", label: "Shed optional features on the surviving region" },
    { kind: "toggle", id: "alert", label: "Page on error-budget burn rate" },
    { kind: "toggle", id: "drill", label: "The failover runbook has been practised" },
  ],
  evaluate: (v) => {
    const active = str(v, "topo") === "active";
    const auto = str(v, "failover") === "auto";
    const detect = bool(v, "alert") ? 2 : 18;
    const dns = Number(str(v, "ttl")) / 60;
    const manualTime = bool(v, "drill") ? 8 : 25;
    const down = active ? 1.5 : (auto ? 1 : detect) + (auto ? 1 : manualTime) + dns;
    const lost = str(v, "repl") === "async" ? 4000 : 0;
    const write = str(v, "repl") === "async" ? 5 : 85;
    const success = bool(v, "degrade") ? 99 : 62;
    const cost = 18000 * (active ? 2.2 : 1.6);
    return {
      metrics: { downtimeMin: down, writesLost: lost, successPct: success, writeMs: write, costPerMonth: cost, detectMin: detect },
      readouts: [
        { label: "Customers down for", value: down, fmt: "num", sub: "minutes", tone: tone(down, 5, 30) },
        { label: "Writes lost at failover", value: lost, fmt: "int", tone: lost > 5000 ? "alert" : lost > 0 ? "warn" : "ok" },
        { label: "Requests succeeding in the survivor", value: success / 100, fmt: "pct", tone: success < 95 ? "alert" : "ok" },
        { label: "Write latency", value: write, fmt: "ms", tone: write > 50 ? "warn" : "ok" },
        { label: "Cost a month", value: cost, fmt: "usd", tone: cost > 42000 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Minutes down", value: down, tone: tone(down, 5, 30) }, { label: "Survivor success, percent", value: success, tone: success < 95 ? "alert" : "ok" }] },
      notes: [!active && !auto ? "A person has to notice, decide and wait for DNS: each step adds minutes." : active ? "Both regions were already serving, so the failure is mostly a traffic shift." : "Health checks do the deciding, and the DNS TTL sets the tail."],
    };
  },
  scene: (n): SceneOut => (n === "detect" ? { set: { alert: true }, focus: ["alert"] } : n === "failover" ? { set: { failover: "auto", ttl: "30" }, focus: ["failover", "ttl"] } : n === "degrade" ? { set: { degrade: true }, focus: ["degrade"] } : undefined),
};

export const A11_MODELS: LabModel[] = [sloLab, observeLab, deployLab, flagLab, degradeLab, rpoLab, regionLab, gamedayLab];
