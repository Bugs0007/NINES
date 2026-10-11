import { defineBoss, SRC } from "../define";

export const VIRAL = {};

export default defineBoss({
  id: "boss-viral-tuesday",
  title: "Boss: Viral Tuesday",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "launch",
    alert: { severity: "page", title: "Pigeon is trending", detail: "traffic climbing, everything you built this chapter, at once" },
    lines: [{ speaker: "kabir", line: "A creator with eleven million followers just posted a Pigeon screenshot. I'd like the site to still exist by lunch." }],
  },
  intro: [
    { speaker: "kabir", line: "Traffic is going from two hundred to eighteen hundred a second in four minutes. The autoscaler has opinions." },
    { speaker: "meera", line: "Autoscaling, the database connection budget, and the page fan-out all fail together. Fix them in the right order." },
    { speaker: "rao", line: "The standing fleet has a ceiling of eight hundred and fifty dollars a month. Do not make me repeat that." },
  ],
  forecast: {
    metric: "p99",
    prompt: "Before you take the traffic: what page p99 will your design deliver across the whole spike?",
    unit: "ms",
    scale: 1000,
    min: 100,
    max: 10000,
    tolerance: 1.6,
  },
  exercises: ["tail-latency", "connection-pooling", "autoscaling", "estimation-memory", "queueing-utilization", "littles-law"],
  challenge: {
    id: "viral",
    title: "Take the traffic",
    brief: "Load climbs from 200 to 1,800 requests a second over four minutes. Each page makes 12 parallel backend calls. Each app instance runs 4 workers and serves 100 requests a second. Postgres has 8 cores and 100 connections. Set the fleet, the pools, and the tail handling.",
    line: { speaker: "meera", line: "Do the arithmetic for the largest fleet the autoscaler can build, not the one you start with." },
    widget: { id: "viral-lab", config: VIRAL },
    conditions: [
      { metric: "p99", op: "<", value: 0.45, label: "Page p99 under 450 ms" },
      { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
      { metric: "costPerMonth", op: "<=", value: 850, label: "Standing fleet under $850/month" },
    ],
    stars: [{ metric: "costPerMonth", op: "<=", value: 780, label: "Standing fleet under $780/month" }],
    hints: [
      "Read the connection line. How many connections does the biggest fleet ask the database for?",
      "The ramp is four minutes and a cold instance takes two and a half. What shortens that gap, and what keeps spare capacity running?",
      "Even a healthy fleet leaves the page tail at the mercy of twelve calls. What cuts it cheaply?",
    ],
  },
  debrief: [
    { id: "gap", text: "The gap. Autoscaling alone cannot cover a four-minute ramp when new instances take minutes to serve. Warm capacity and a lower target close the gap, and a modest standing fleet covers the first minutes.", derived: true },
    { id: "connections", text: "The hidden multiplier. Every instance the autoscaler adds brings its own workers and pools, so the fleet that saves the site asks for more database connections than Postgres can give. A pooler decouples the two.", derived: true },
    { id: "tail", text: "The tail of the whole. A page that waits for twelve calls is as slow as the slowest of them, so hedging the slow reads trims the page p99 for a few percent more load.", sourceIds: ["tail-at-scale"] },
    { id: "order", text: "The order of failure. A healthy fleet with a dead database is down, and a healthy database behind a slow fleet is slow. Each layer needs its own budget." },
  ],
  outro: { speaker: "kabir", line: "We stayed up. The creator wants us to sponsor a podcast. I said we're busy." },
  explainBack: {
    prompt: "Walk Kabir through how you survived the spike: the three things that would each have taken the site down, and what you did about each.",
    rubric: [
      { id: "scale", criterion: "Handles autoscaling lag with headroom, a lower target, or a warm pool", keyIdea: "autoscaling lag" },
      { id: "conns", criterion: "Notices that more instances multiply database connections and adds a pooler or smaller pools", keyIdea: "connection multiplication" },
      { id: "tail", criterion: "Addresses fan-out tail latency, for example by hedging idempotent reads", keyIdea: "tail of the whole" },
    ],
    exemplar:
      "A cold autoscaler is minutes late to a four-minute ramp, so I kept a standing fleet, set a lower target, and used a warm pool to close the gap. The fleet it builds multiplies database connections, so I put PgBouncer in front of Postgres. And the page waits for twelve calls, so I hedged the slow ones to trim the tail for a few percent more load.",
  },
  honestPhysics: [
    "Three simplified models run together: a fluid autoscaler, a connection budget, and independent lognormal calls. Cache misses, disk, and third-party limits are out of scope.",
    "The page p99 adds the fleet's worst-case latency to the fan-out tail, which is pessimistic but keeps the arithmetic readable.",
    "The autoscaler overshoots because CPU saturates at 100%: a saturated fleet keeps asking for more until the reading drops.",
  ],
  sources: [{ id: "tail-at-scale", title: "J. Dean and L. Barroso (2013), The Tail at Scale, Communications of the ACM 56(2)", url: "https://doi.org/10.1145/2408776.2408794" }, SRC.pgConnections],
  verify: [
    { id: "default-fails", claim: "The default fleet drops most traffic", run: "lab", params: { model: "viral-lab", config: VIRAL, values: {}, metric: "errorRate" }, expect: { min: 0.5 } },
    { id: "no-pooler", claim: "A good fleet with no pooler still loses most requests to connection limits", run: "lab", params: { model: "viral-lab", config: VIRAL, values: { warm: true, target: 0.3, minInst: 10, hedgeMs: 60 }, metric: "errorRate" }, expect: { min: 0.5 } },
    { id: "good", claim: "Warm pool, 30% target, 10 instances, PgBouncer, and 60ms hedging pass", run: "lab", params: { model: "viral-lab", config: VIRAL, values: { warm: true, target: 0.3, minInst: 10, pooler: true, hedgeMs: 60 }, metric: "p99" }, expect: { max: 0.45 } },
    { id: "good-err", claim: "…with no errors", run: "lab", params: { model: "viral-lab", config: VIRAL, values: { warm: true, target: 0.3, minInst: 10, pooler: true, hedgeMs: 60 }, metric: "errorRate" }, expect: { max: 0.01 } },
    { id: "good-cost", claim: "…and a standing fleet under $780 a month", run: "lab", params: { model: "viral-lab", config: VIRAL, values: { warm: true, target: 0.3, minInst: 10, pooler: true, hedgeMs: 60 }, metric: "costPerMonth" }, expect: { max: 780 } },
    { id: "no-hedge", claim: "Without hedging the page p99 misses 450ms", run: "lab", params: { model: "viral-lab", config: VIRAL, values: { warm: true, target: 0.3, minInst: 10, pooler: true, hedgeMs: 0 }, metric: "p99" }, expect: { min: 0.45 } },
  ],
});
