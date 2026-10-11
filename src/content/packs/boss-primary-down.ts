import { defineBoss } from "../define";

export const PRIMARY = {};

const GITHUB = { id: "github-2018", title: "GitHub Engineering: October 21 post-incident analysis", url: "https://github.blog/news-insights/company-news/oct21-post-incident-analysis/" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5: Replication", url: "https://dataintensive.net/" };
const KLEPPMANN_LOCK = { id: "kleppmann-fencing", title: "M. Kleppmann (2016), How to do distributed locking (fencing tokens)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html" };

export default defineBoss({
  id: "boss-primary-down",
  title: "Boss: The Primary Goes Down",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "orders-db primary · unreachable", detail: "2,000 writes a second in flight, replica lag 120 ms" },
    lines: [{ speaker: "pager", line: "The primary's host just stopped answering. Orders are flowing in at two thousand a second and the nearest replica is about a tenth of a second behind." }],
  },
  intro: [
    { speaker: "kabir", line: "Every order that customers saw confirmed has to still exist after this. Every page has to load again in under half a minute." },
    { speaker: "meera", line: "Commit rule, detection, fencing, client redirect, and read policy are one decision each, and each is also a way to be wrong." },
    { speaker: "rao", line: "A thousand dollars a month is the ceiling for the whole database tier. A third replica is not free." },
  ],
  forecast: {
    metric: "downtimeS",
    prompt: "Before you pull the plug: how many seconds will your customers be unable to place orders?",
    unit: "s",
    scale: 1,
    min: 2,
    max: 300,
    tolerance: 1.5,
  },
  exercises: ["leader-follower", "sync-async-replication", "replication-lag", "failover"],
  challenge: {
    id: "primary-down",
    title: "Kill the primary",
    brief: "The primary dies with 2,000 writes a second in flight. Choose replicas, commit rule, detection timer, proxy, fencing, and read policy. Recover within 30 seconds, lose no acknowledged write, miss at most 0.1% of own-writes, commit in 10 ms or less, fail over needlessly under 0.5 times a month, and stay under $1,000 a month.",
    line: { speaker: "meera", line: "Work out which failure each setting protects against. Then check the bill." },
    widget: { id: "primary-lab", config: PRIMARY },
    conditions: [
      { metric: "downtimeS", op: "<=", value: 30, label: "Downtime at most 30 s" },
      { metric: "lostWrites", op: "<=", value: 0, label: "No acknowledged write lost" },
      { metric: "staleRate", op: "<=", value: 0.001, label: "At most 0.1% of reads miss their own write" },
      { metric: "commitMs", op: "<=", value: 10, label: "Commits at most 10 ms" },
      { metric: "falseFailovers", op: "<=", value: 0.5, label: "Under 0.5 needless failovers a month" },
      { metric: "costPerMonth", op: "<=", value: 1000, label: "Database tier under $1,000/month" },
    ],
    stars: [{ metric: "costPerMonth", op: "<=", value: 700, label: "Under $700 a month" }],
    hints: [
      "Which commit rule keeps the writes in flight and still commits quickly?",
      "How long can detection take before real outages pass 30 seconds, and how short before pauses cause failovers?",
      "Two settings affect how long clients wait, and one affects what happens if the old primary was alive. Which are they?",
    ],
  },
  debrief: [
    { id: "commit", text: "The commit rule. Asynchronous commits lose the writes in flight, about two hundred here. Waiting for one nearby replica closes that gap for about a millisecond, while waiting for every replica taxes each commit and makes writes depend on all of them.", derived: true },
    { id: "detect", text: "Detection time is a window with two walls. Too short and ordinary pauses trigger failovers nobody needed; too long and a real failure outlives the downtime budget. The answer sat in the middle, around fifteen seconds.", sourceIds: ["github-2018"] },
    { id: "fence", text: "Fencing and the proxy. A proxy that follows the new primary turned client waiting from thirty seconds into one, and fencing made a needless failover harmless by stopping the old primary from accepting writes.", sourceIds: ["kleppmann-fencing"] },
    { id: "reads", text: "And the reads. Pinning a user's reads to the primary for a couple of seconds after they write kept their own changes visible, for a few percent of the read load.", sourceIds: ["ddia"] },
  ],
  outro: { speaker: "kabir", line: "The replica took over in twenty seconds and every confirmed order was still there. I have asked the team never to say 'it probably fails over' again." },
  explainBack: {
    prompt: "Walk Kabir through the failure: what you configured, which failure each setting handles, and what each costs.",
    rubric: [
      { id: "commit", criterion: "Semi-synchronous commit to a nearby replica prevents losing acknowledged writes at low latency cost", keyIdea: "semi-sync commit" },
      { id: "timing", criterion: "Detection time balances needless failovers against real downtime, and a proxy cuts client redirection delay", keyIdea: "detection window and proxy" },
      { id: "fence", criterion: "Fencing the old primary prevents split brain if the failover was unnecessary", keyIdea: "fence the old primary" },
      { id: "reads", criterion: "Pin reads to the primary shortly after a write to avoid replication-lag anomalies, and watch cost", keyIdea: "read-your-writes" },
    ],
    exemplar:
      "I used semi-synchronous commit to one nearby replica, so acknowledged writes survive the primary's failure for about a millisecond of latency. I set detection around fifteen seconds so ordinary pauses do not trigger failovers while real outages stay under thirty seconds, and put a proxy in front so clients redirect in about a second. I fenced the old primary so a needless failover cannot create two writers, and pinned reads to the primary for two seconds after a write so users see their own changes. Two replicas and a proxy came in under the budget.",
  },
  honestPhysics: [
    "Four simplified models run together: commit rules, failover timing, read-your-writes, and cost. The primary dies once, 2,000 writes a second are in flight, and replica lag is 120 ms.",
    "A semi-synchronous replica in the primary's zone loses nothing when the primary dies; waiting for every replica adds about 12 ms per extra replica.",
    "Replicas cost $300 a month each beyond the primary, and a connection proxy costs $60.",
  ],
  sources: [GITHUB, DDIA, KLEPPMANN_LOCK],
  verify: [
    { id: "default-down", claim: "The default design is down for 42 seconds", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: {}, metric: "downtimeS" }, expect: { min: 40 } },
    { id: "default-lost", claim: "…and loses hundreds of writes", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: {}, metric: "lostWrites" }, expect: { min: 200 } },
    { id: "good-down", claim: "Semi-sync, a proxy, fencing, 14 s detection, and pinned reads recover in 21 s", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: { replicas: 1, commit: "semi", interval: 2, missed: 7, proxy: true, fencing: true, reads: "pin" }, metric: "downtimeS" }, expect: { max: 30 } },
    { id: "good-lost", claim: "…losing nothing", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: { replicas: 1, commit: "semi", interval: 2, missed: 7, proxy: true, fencing: true, reads: "pin" }, metric: "lostWrites" }, expect: { max: 0 } },
    { id: "good-cost", claim: "…for under $700 a month", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: { replicas: 1, commit: "semi", interval: 2, missed: 7, proxy: true, fencing: true, reads: "pin" }, metric: "costPerMonth" }, expect: { max: 700 } },
    { id: "sync-all", claim: "Waiting for three replicas pushes commits past 10 ms", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: { replicas: 3, commit: "sync", interval: 2, missed: 7, proxy: true, fencing: true, reads: "pin" }, metric: "commitMs" }, expect: { min: 10 } },
    { id: "eager", claim: "A 4 s detection fails over needlessly dozens of times a month", run: "lab", params: { model: "primary-lab", config: PRIMARY, values: { commit: "semi", interval: 1, missed: 4, proxy: true, fencing: false }, metric: "falseFailovers" }, expect: { min: 5 } },
  ],
});
