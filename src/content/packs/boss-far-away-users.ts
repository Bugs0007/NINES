import { defineBoss } from "../define";

export const FAR = {};

const HPBN = { id: "hpbn", title: "I. Grigorik, High Performance Browser Networking", url: "https://hpbn.co/" };
const CF_CDN = { id: "cf-cdn", title: "Cloudflare Learning Center: What is a CDN?", url: "https://www.cloudflare.com/learning/cdn/what-is-a-cdn/" };

export default defineBoss({
  id: "boss-far-away-users",
  title: "Boss: Users in Jakarta",
  kind: "boss",
  estimatedMinutes: 18,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Jakarta launch", detail: "pages take seconds; the server is idle" },
    lines: [{ speaker: "kabir", line: "We launched in Indonesia on Monday. The pages feel like they come from the moon, and I would like that fixed by the second press release." }],
  },
  intro: [
    { speaker: "kabir", line: "Our users in Jakarta wait most of a second for a page that our server builds in twenty milliseconds." },
    { speaker: "meera", line: "Everything you learned in this chapter is about the same trip, from different ends. Choose which ends to spend money on." },
    { speaker: "rao", line: "The infrastructure budget is three hundred and fifty dollars a month. A second region alone would eat most of it." },
  ],
  forecast: {
    metric: "p75Ms",
    prompt: "Before you ship: what page p75 will your Jakarta users see?",
    unit: "ms",
    scale: 1,
    min: 100,
    max: 2000,
    tolerance: 1.4,
  },
  exercises: ["request-journey", "anycast", "keep-alive", "cdn", "tls-handshake", "http-versions"],
  challenge: {
    id: "far",
    title: "Go live in Jakarta",
    brief: "Jakarta users are far from the ap-south-2 origin and see about 670 ms at p75. Choose your stack: CDN and TTL, TLS 1.3, HTTP/3, keep-alive to the origin, and whether to add a Singapore origin. Reach p75 under 250 ms, content no staler than two hours, and a bill under $350 a month.",
    line: { speaker: "meera", line: "The edge is the lever. The rest decides whether the edge is fast." },
    widget: { id: "far-lab", config: FAR },
    conditions: [
      { metric: "p75Ms", op: "<", value: 250, label: "Page p75 under 250 ms" },
      { metric: "staleSec", op: "<=", value: 7200, label: "Content at most 2 hours stale" },
      { metric: "costPerMonth", op: "<=", value: 350, label: "Bill under $350/month" },
    ],
    stars: [{ metric: "p75Ms", op: "<", value: 240, label: "p75 under 240 ms" }],
    hints: [
      "List the round trips between Jakarta and the origin. Which of them can a nearby edge shorten?",
      "A second origin region costs more than the whole budget allows. What does the CDN's cache do for repeat requests?",
      "A longer cache TTL raises hits but allows staler content. How long is allowed?",
    ],
  },
  debrief: [
    { id: "distance", text: "Distance first. A page in Jakarta spends its time in round trips to ap-south-2, and the server's own work is a rounding error. The CDN's edge turns each of those trips into one a few milliseconds long.", derived: true },
    { id: "handshakes", text: "Then the handshakes. HTTP/3 merges the transport and TLS handshakes into one round trip, and keep-alive spares the edge a fresh connection to the origin on each miss.", sourceIds: ["hpbn"] },
    { id: "ttl", text: "TTL is the dial between speed and freshness. A longer TTL means more edge hits, and the two-hour limit says how far you may turn it." },
    { id: "budget", text: "Money decides what is allowed. A second origin region would cut the round trip but cost more than the whole budget, while a CDN does more for a quarter of the price.", sourceIds: ["cf-cdn"] },
  ],
  outro: { speaker: "kabir", line: "Jakarta loads in a quarter second. Marketing has asked whether we can do Lagos next. I said yes before thinking." },
  explainBack: {
    prompt: "Tell Kabir how you made Jakarta fast, in order: what dominates the page time, what you changed, and what you traded off.",
    rubric: [
      { id: "trips", criterion: "Identifies round trips to a far origin as the dominant cost, not server time", keyIdea: "distance and round trips" },
      { id: "edge", criterion: "Uses a CDN edge with a sensible TTL to serve most requests from nearby", keyIdea: "edge and TTL" },
      { id: "proto", criterion: "Cuts handshake round trips (HTTP/3 or TLS 1.3) and reuses origin connections", keyIdea: "fewer handshakes" },
      { id: "trade", criterion: "Names the tradeoffs: TTL against staleness, and cost against a second region", keyIdea: "freshness and cost" },
    ],
    exemplar:
      "The server's 20 ms was never the problem; Jakarta users paid for several round trips to ap-south-2. I put a CDN edge in front so most requests are served nearby, used a TTL up to the two-hour staleness limit to raise the hit ratio, enabled HTTP/3 to collapse the handshake to one round trip, and kept connections to the origin alive for the misses. A second origin region would have cost more than the whole budget.",
  },
  honestPhysics: [
    "A page is one first-byte time plus four more round trips on a warm connection, with Jakarta at about 66 ms from the origin. Real pages vary with weight and rendering.",
    "Edge hit ratio is modelled for one object at 0.002 requests a second per edge. Real sites mix popular and rare objects.",
    "Costs are round monthly figures for a small site, not quotes.",
    "A second origin region would need the content replicated there. This lab assumes read-only content, so no replication cost or lag appears yet.",
  ],
  sources: [HPBN, CF_CDN],
  verify: [
    { id: "base", claim: "The default stack is far over 250 ms", run: "lab", params: { model: "far-lab", config: FAR, values: {}, metric: "p75Ms" }, expect: { min: 600 } },
    { id: "cdn-only", claim: "A CDN alone is not enough", run: "lab", params: { model: "far-lab", config: FAR, values: { cdn: true }, metric: "p75Ms" }, expect: { min: 250 } },
    { id: "sg", claim: "A Singapore origin without a CDN breaks the budget", run: "lab", params: { model: "far-lab", config: FAR, values: { tls13: true, region2: "sg" }, metric: "costPerMonth" }, expect: { min: 351 } },
    { id: "good", claim: "CDN, 2-hour TTL, HTTP/3, and keep-alive pass", run: "lab", params: { model: "far-lab", config: FAR, values: { cdn: true, ttl: 7200, h3: true, keepalive: true }, metric: "p75Ms" }, expect: { max: 240 } },
    { id: "good-cost", claim: "…within budget", run: "lab", params: { model: "far-lab", config: FAR, values: { cdn: true, ttl: 7200, h3: true, keepalive: true }, metric: "costPerMonth" }, expect: { max: 350 } },
    { id: "long-ttl", claim: "Going past the staleness limit would be faster but is not allowed", run: "lab", params: { model: "far-lab", config: FAR, values: { cdn: true, ttl: 86400, h3: true, keepalive: true }, metric: "staleSec" }, expect: { min: 7201 } },
  ],
});
