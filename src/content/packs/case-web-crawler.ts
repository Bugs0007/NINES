import { defineBoss } from "../define";

export const WCC = {};

const MERCATOR = { id: "mercator", title: "Heydon and Najork (1999), Mercator: a scalable, extensible web crawler", url: "https://www.cs.cornell.edu/courses/cs685/2002fa/mercator.pdf" };
const ROBOTS = { id: "rfc9309", title: "RFC 9309: Robots Exclusion Protocol", url: "https://www.rfc-editor.org/rfc/rfc9309" };
const BLOOM = { id: "bloom", title: "Bloom (1970), Space/time trade-offs in hash coding with allowable errors", url: "https://en.wikipedia.org/wiki/Bloom_filter" };

export default defineBoss({
  id: "case-web-crawler",
  title: "Case: Web Crawler",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "abuse@ · crawler blocked by 140 hosts in an hour", detail: "30% of fetches were pages we had already fetched" },
    lines: [{ speaker: "kabir", line: "A billion pages a month, and the crawler has been blocked by a hundred and forty sites already. A third of what it fetches it has seen before." }],
  },
  intro: [
    { speaker: "meera", line: "A crawler is a politeness problem wearing a throughput problem. Every host has to be treated gently, and in aggregate you still need a fast machine." },
    { speaker: "rao", line: "Remembering ten billion URLs is its own design question." },
  ],
  forecast: {
    metric: "pagesPerSec",
    prompt: "With a FIFO frontier, a half-second delay per host, 10 workers and no DNS cache, how many pages a second does the crawler fetch?",
    unit: "per second",
    scale: 1,
    min: 5,
    max: 3000,
    tolerance: 1.5,
  },
  exercises: ["queues-vs-logs", "backpressure", "dns", "rate-limiting"],
  challenge: {
    id: "design-crawler",
    title: "Start the crawl",
    brief: "Fetch at least 390 pages a second (a billion a month), get blocked by fewer than 1% of hosts, waste at most 2% of fetches on repeats, and keep the seen-URL check under 40 GB.",
    line: { speaker: "rao", line: "Fast, polite, not repetitive, and not out of memory." },
    widget: { id: "crawler-lab", config: WCC },
    conditions: [
      { metric: "pagesPerSec", op: ">=", value: 390, label: "At least 390 pages a second" },
      { metric: "banRisk", op: "<=", value: 0.01, label: "Under 1% of hosts block us" },
      { metric: "wastedFetches", op: "<=", value: 0.02, label: "At most 2% wasted on repeats" },
      { metric: "dedupMemoryGB", op: "<=", value: 40, label: "Seen-URL check under 40 GB" },
    ],
    stars: [{ metric: "pagesPerSec", op: ">=", value: 1000, label: "At least 1,000 pages a second" }],
    hints: ["What bunches requests onto a few hosts?", "How does the delay trade politeness against throughput?", "What does remembering ten billion URLs cost?"],
  },
  debrief: [
    { id: "front", text: "A single FIFO queue sends a burst of requests to whichever host just yielded many links, which hosts read as an attack. A queue per host with a priority across hosts spaces the requests and lets 2,000 hosts be fetched in parallel.", sourceIds: ["mercator"] },
    { id: "polite", text: "Politeness is a throughput limit: with 2,000 hosts active, a one-second delay allows 2,000 pages a second and a five-second delay 400. Under a second the bans begin, so the delay is bounded below by etiquette and above by the throughput target. Honour robots.txt.", sourceIds: ["rfc9309", "mercator"] },
    { id: "dedup", text: "An exact set of ten billion hashes needs 160 GB. A Bloom filter at 1% false positives needs 12 GB and skips one new page in a hundred by mistake, which a crawler can live with because the next crawl will find it.", sourceIds: ["bloom"] },
  ],
  outro: { speaker: "kabir", line: "Per-host queues, a one-second delay, a Bloom filter and a DNS cache. A thousand pages a second, and nobody has banned us this week." },
  explainBack: {
    prompt: "Explain how your crawler stays fast, polite and efficient.",
    rubric: [
      { id: "front", criterion: "A frontier with a queue per host and priorities spaces requests to each host and keeps many hosts in flight", keyIdea: "per-host frontier" },
      { id: "polite", criterion: "Politeness delay and robots.txt prevent bans; the delay is a throughput cap of hosts divided by delay", keyIdea: "politeness is a throughput cap" },
      { id: "dedup", criterion: "A Bloom filter checks seen URLs in far less memory than an exact set, accepting a small false-positive rate", keyIdea: "Bloom filter" },
      { id: "dns", criterion: "A DNS cache removes a lookup from almost every fetch and doubles per-worker throughput", keyIdea: "DNS cache" },
    ],
    exemplar:
      "The frontier has a queue per host with priorities across hosts, so requests to one host are spaced out while thousands of hosts are in flight. The politeness delay and robots.txt prevent bans, and the delay caps throughput at the number of active hosts divided by the delay, so one second allows two thousand pages a second. A Bloom filter checks ten billion seen URLs in twelve gigabytes instead of one hundred sixty, accepting that it skips about one new page in a hundred, and a DNS cache doubles each worker's rate.",
  },
  honestPhysics: [
    "A billion pages a month is about 390 a second. A worker fetches 10 pages a second, 20 with a local DNS cache. With 2,000 hosts active at once, politeness caps throughput at 2,000 ÷ the delay; a single FIFO queue bunches requests onto 300 hosts, capping it at 300 ÷ the delay.",
    "No dedup wastes 30% of fetches; an exact set of 10 billion hashes costs 160 GB; a Bloom filter at 1% false positives costs 12 GB. Under one second of delay about 15% of hosts block the crawler, and a FIFO frontier adds 30%. Round figures.",
  ],
  sources: [MERCATOR, ROBOTS, BLOOM],
  verify: [
    { id: "forecast", claim: "The default crawler fetches 100 pages a second", run: "lab", params: { model: "crawler-lab", config: WCC, values: {}, metric: "pagesPerSec" }, expect: { min: 100, max: 100 } },
    { id: "ban", claim: "…and is blocked by 45% of hosts", run: "lab", params: { model: "crawler-lab", config: WCC, values: {}, metric: "banRisk" }, expect: { min: 0.44, max: 0.46 } },
    { id: "cap", claim: "A FIFO frontier at a 5-second delay is capped at 60 pages a second", run: "lab", params: { model: "crawler-lab", config: WCC, values: { delayS: 5, workers: 100, dns: true }, metric: "pagesPerSec" }, expect: { min: 59, max: 61 } },
    { id: "bloom", claim: "A Bloom filter uses 12 GB and wastes 1%", run: "lab", params: { model: "crawler-lab", config: WCC, values: { dedup: "bloom" }, metric: "dedupMemoryGB" }, expect: { min: 12, max: 12 } },
    { id: "set", claim: "An exact set uses 160 GB", run: "lab", params: { model: "crawler-lab", config: WCC, values: { dedup: "set" }, metric: "dedupMemoryGB" }, expect: { min: 160, max: 160 } },
    { id: "good", claim: "Per-host queues, a 1 s delay, Bloom, DNS cache and 53 workers fetch over 1,000 a second", run: "lab", params: { model: "crawler-lab", config: WCC, values: { frontier: "perhost", delayS: 1, dedup: "bloom", dns: true, workers: 53 }, metric: "pagesPerSec" }, expect: { min: 1000 } },
    { id: "fast-ban", claim: "A 0.5-second delay raises the ban risk to 15%", run: "lab", params: { model: "crawler-lab", config: WCC, values: { frontier: "perhost", delayS: 0.5 }, metric: "banRisk" }, expect: { min: 0.15, max: 0.16 } },
  ],
});
