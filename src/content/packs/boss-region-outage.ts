import { defineBoss } from "../define";

export const GAMEDAY = {};

const AWS_DR = { id: "aws-dr", title: "AWS Whitepaper: Disaster Recovery of Workloads on AWS", url: "https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html" };
const SRE_ALERT = { id: "sre-workbook-alerting", title: "Google SRE Workbook, ch. 5: Alerting on SLOs", url: "https://sre.google/workbook/alerting-on-slos/" };
const BUILDERS_SHED = { id: "builders-load-shedding", title: "Amazon Builders' Library: Using load shedding to avoid overload", url: "https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/" };

export default defineBoss({
  id: "boss-region-outage",
  title: "Boss: Region Down (Game Day)",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "game day · region A is about to go dark", detail: "2,000 writes a second in flight, the survivor will see twice the traffic" },
    lines: [{ speaker: "pager", line: "In one minute region A stops answering for two hours. The exercise is real: whatever you configure is what customers get." }],
  },
  intro: [
    { speaker: "kabir", line: "Checkout must be back in under five minutes, and at most a few seconds of orders may be lost." },
    { speaker: "meera", line: "Detection, failover, DNS, replication and degradation are one decision each, and each can be the slow link." },
    { speaker: "rao", line: "Forty-two thousand a month is the ceiling for everything we run. A second full region is not free." },
  ],
  forecast: {
    metric: "downtimeMin",
    prompt: "Before you start: with the current setup, how many minutes will customers be unable to check out?",
    unit: "min",
    scale: 1,
    min: 1,
    max: 300,
    tolerance: 1.5,
  },
  exercises: ["rpo-rto", "multi-region", "graceful-degradation", "observability"],
  challenge: {
    id: "region-down",
    title: "Lose a region",
    brief: "Region A fails for two hours. Choose topology, failover, replication, DNS TTL, degradation, alerting and drills. Keep customer downtime under 5 minutes, lose at most 5,000 writes, keep at least 95% of requests succeeding in the survivor, writes under 50 ms, and cost at most $42,000 a month.",
    line: { speaker: "meera", line: "Add up the minutes. Then look at which line is the longest." },
    widget: { id: "gameday-lab", config: GAMEDAY },
    conditions: [
      { metric: "downtimeMin", op: "<=", value: 5, label: "Customer downtime under 5 minutes" },
      { metric: "writesLost", op: "<=", value: 5000, label: "At most 5,000 writes lost" },
      { metric: "successPct", op: ">=", value: 95, label: "At least 95% of requests succeed in the survivor" },
      { metric: "writeMs", op: "<=", value: 50, label: "Writes under 50 ms" },
      { metric: "costPerMonth", op: "<=", value: 42000, label: "Under $42,000 a month" },
    ],
    stars: [{ metric: "costPerMonth", op: "<=", value: 30000, label: "Under $30,000 a month" }],
    hints: [
      "Which parts of the downtime does a person control, and which does a health check?",
      "How long can a DNS record keep sending users to a dead region?",
      "What happens to the survivor at twice the traffic?",
    ],
  },
  debrief: [
    { id: "minutes", text: "Downtime was a sum: detection, the decision, the failover itself and the DNS tail. Automatic failover removed the human steps, and a 30-second TTL cut the longest tail from an hour to a minute.", derived: true },
    { id: "survivor", text: "The survivor at double traffic served only 62% of requests until optional features were shed. Degradation turned that into 99% with simpler pages.", sourceIds: ["builders-load-shedding"] },
    { id: "data", text: "Asynchronous replication lost about two seconds of writes, 4,000 here, and kept writes at 5 ms. Synchronous replication would have lost none for 85 ms a write.", sourceIds: ["aws-dr"] },
    { id: "cost", text: "A warm standby met every number for about $29,000. Active-active met them too, for about $40,000, and also made far users faster.", derived: true },
  ],
  outro: { speaker: "kabir", line: "Checkout was back in under three minutes and nobody paged me twice. I would still like to run this again next quarter." },
  explainBack: {
    prompt: "Walk Kabir through the failure: what you configured, what each setting protects, and what each costs.",
    rubric: [
      { id: "failover", criterion: "Automatic failover on health checks and a short DNS TTL cut the human and DNS delays", keyIdea: "automate and shorten TTL" },
      { id: "data", criterion: "Asynchronous replication bounds lost writes to seconds while keeping writes fast; synchronous would cost latency", keyIdea: "RPO versus write latency" },
      { id: "degrade", criterion: "Shedding optional features lets the surviving region serve nearly all requests at double traffic", keyIdea: "degrade to survive" },
      { id: "cost", criterion: "A warm standby or active-active both fit the budget; pick by whether latency for far users matters", keyIdea: "pick by cost and need" },
    ],
    exemplar:
      "I used a warm standby with automatic failover on health checks and a 30-second DNS TTL, so detection, decision and DNS added up to a few minutes instead of over an hour. Asynchronous replication kept writes at 5 ms and bounded the loss to about two seconds of orders; synchronous would have lost none at 85 ms a write. I shed optional features in the surviving region so it served 99% of requests at double traffic, and the whole setup cost about $29,000 a month, under the ceiling.",
  },
  honestPhysics: [
    "Four simplified models run together: detection, failover with DNS, replication loss and degradation. Region A fails for two hours with 2,000 writes a second in flight.",
    "Detection takes 2 minutes with a burn-rate alert and 18 without. Failover is 1 minute automatic, 25 manual or 8 with a practised runbook, then up to the DNS TTL. Active-active steers away in about 90 seconds.",
    "Costs are $18,000 a month per region-equivalent, ×1.6 for active-passive and ×2.2 for active-active.",
  ],
  sources: [AWS_DR, SRE_ALERT, BUILDERS_SHED],
  verify: [
    { id: "default", claim: "The default setup is down for 103 minutes", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: {}, metric: "downtimeMin" }, expect: { min: 100, max: 106 } },
    { id: "default-success", claim: "…and the survivor serves 62% of requests", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: {}, metric: "successPct" }, expect: { max: 65 } },
    { id: "good-down", claim: "Automatic failover, a 30-second TTL and degradation recover in under 3 minutes", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: { failover: "auto", ttl: "30", degrade: true, alert: true }, metric: "downtimeMin" }, expect: { max: 5 } },
    { id: "good-cost", claim: "…for about $29,000 a month", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: { failover: "auto", ttl: "30", degrade: true, alert: true }, metric: "costPerMonth" }, expect: { max: 30000 } },
    { id: "long-ttl", claim: "An hour-long TTL alone adds an hour", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: { failover: "auto", ttl: "3600", degrade: true, alert: true }, metric: "downtimeMin" }, expect: { min: 60 } },
    { id: "sync", claim: "Synchronous replication loses nothing but makes writes 85 ms", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: { repl: "sync" }, metric: "writeMs" }, expect: { min: 85, max: 85 } },
    { id: "active", claim: "Active-active is back in 1.5 minutes for about $40,000", run: "lab", params: { model: "gameday-lab", config: GAMEDAY, values: { topo: "active", degrade: true }, metric: "costPerMonth" }, expect: { max: 42000 } },
  ],
});
