import { defineBoss } from "../define";

export const CELEB = {};

const NISHTALA = { id: "nishtala-2013", title: "R. Nishtala et al. (2013), Scaling Memcache at Facebook, USENIX NSDI", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala" };
const RFC5861 = { id: "rfc5861", title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content", url: "https://www.rfc-editor.org/rfc/rfc5861" };

export default defineBoss({
  id: "boss-celebrity-post",
  title: "Boss: The Celebrity Post",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "One post, 90,000 reads a second", detail: "a celebrity just posted to Pigeon" },
    lines: [{ speaker: "pager", line: "A verified account with thirty million followers just posted. One key is taking the whole read load, and every reader is also adding a like." }],
  },
  intro: [
    { speaker: "kabir", line: "The post is one row, and ninety thousand people a second want it. The like button writes twenty thousand times a second to the same counter." },
    { speaker: "meera", line: "Hot key, expiry cliff, write storm, and a read path that was sized for ordinary days. They all land in the same ten seconds." },
    { speaker: "rao", line: "The monthly budget for this tier is five hundred and twenty dollars. Buying every fix would cost a little more." },
  ],
  forecast: {
    metric: "p99",
    prompt: "Before the post goes out: what page p99 will your design deliver across the storm?",
    unit: "ms",
    scale: 1000,
    min: 20,
    max: 10000,
    tolerance: 1.6,
  },
  exercises: ["cache-aside", "zipf-and-sizing", "eviction-policies", "write-policies", "ttl-invalidation", "cache-stampede", "hot-keys", "cdn-caching"],
  challenge: {
    id: "celebrity",
    title: "Let it go viral",
    brief: "90,000 reads a second hit one post, 70% of cache traffic, and 20,000 like writes a second hit one counter. Cache nodes handle 50,000 reads a second; the database 1,000 operations. Choose edge caching, TTL, expiry protection, replicas, and the counter. Keep p99 under 200 ms, errors under 1%, the database under 80%, and the bill under $520 a month.",
    line: { speaker: "meera", line: "Count what each layer is asked to carry before you buy anything." },
    widget: { id: "celeb-lab", config: CELEB },
    conditions: [
      { metric: "p99", op: "<", value: 0.2, label: "Page p99 under 200 ms" },
      { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
      { metric: "dbPeakUtil", op: "<", value: 0.8, label: "Database under 80% busy" },
      { metric: "costPerMonth", op: "<=", value: 520, label: "Bill under $520/month" },
    ],
    stars: [{ metric: "costPerMonth", op: "<=", value: 500, label: "Bill at $500 or less" }],
    hints: [
      "Where does the post's read traffic land, and what is the busiest cache node asked to carry?",
      "Even a good cache has a TTL. What happens when the post's entry expires with ninety thousand readers waiting?",
      "Twenty thousand writes a second on one counter. Does the database need to see each of them?",
    ],
  },
  debrief: [
    { id: "edge", text: "The edge first. One key with ninety thousand reads a second is a read storm no cache node should see. Serving the post through the edge with a sensible TTL turned most of those reads into hits that never reached the cluster.", derived: true },
    { id: "expiry", text: "Then the cliff. At each expiry every waiting reader would rebuild the post at once. Serving the stale copy while one request revalidates, or a single-flight lock, keeps the database out of the herd.", sourceIds: ["rfc5861", "nishtala-2013"] },
    { id: "writes", text: "Then the writes. A like counter is the textbook write-back candidate: thousands of increments to the same key collapse into a few database writes per flush, and losing a few seconds of likes is tolerable.", derived: true },
    { id: "money", text: "And the money. Extra cache replicas would also have spread the hot key, but the edge made them unnecessary. Each fix has to earn its place in a budget." },
  ],
  outro: { speaker: "kabir", line: "The post hit forty million views and Pigeon stayed up. Marketing wants to tell the story. I would like them to wait a day." },
  explainBack: {
    prompt: "Walk Kabir through the storm: what would have broken first, and how did you fix each layer?",
    rubric: [
      { id: "hot", criterion: "Identifies the hot key as the first failure: one cache node cannot serve 70% of 90,000 reads a second, and fixes it with the edge, replicas, or local caches", keyIdea: "hot key" },
      { id: "stampede", criterion: "Prevents an expiry stampede with stale-while-revalidate or a lock, since all readers would rebuild together", keyIdea: "expiry cliff" },
      { id: "writes", criterion: "Handles the like-counter write storm with write-back and a flush interval, noting the small loss window", keyIdea: "write-back counters" },
      { id: "budget", criterion: "Chooses fixes within the budget, noting what each costs and which are unnecessary", keyIdea: "spend deliberately" },
    ],
    exemplar:
      "The first thing to break was the cache node holding the post: 70% of 90,000 reads a second is far more than one node can serve, so I served the post from the edge with a TTL that gave a high hit ratio. Then I stopped the expiry cliff with stale-while-revalidate, so the readers waiting at each expiry never rebuilt the post. The like counter got write-back with a short flush, collapsing 20,000 writes a second into a few hundred, accepting that a crash could lose a few seconds of likes. Cache replicas would have worked but were not needed, which kept me inside the budget.",
  },
  honestPhysics: [
    "Five simplified models run together: edge caching, stampede protection, hot-key spreading, write-back counters, and cost. Real incidents have more moving parts.",
    "The post is one hot key that takes 70% of cache traffic, and the like counter is one hot row. Real viral posts also fan out to comments, media, and feeds.",
    "Costs are round monthly figures: a $400 baseline, edge caching $60, cache replicas $90, a write-back buffer $40.",
  ],
  sources: [NISHTALA, RFC5861],
  verify: [
    { id: "default", claim: "The default design collapses under the storm", run: "lab", params: { model: "celeb-lab", config: CELEB, values: {}, metric: "errorRate" }, expect: { min: 0.5 } },
    { id: "good", claim: "Edge, 60 s TTL, stale-while-revalidate, and a write-back counter pass on p99", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { edge: true, ttl: 60, protect: "swr", writeback: true, flush: 10 }, metric: "p99" }, expect: { max: 0.2 } },
    { id: "good-db", claim: "…with the database under 80%", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { edge: true, ttl: 60, protect: "swr", writeback: true, flush: 10 }, metric: "dbPeakUtil" }, expect: { max: 0.8 } },
    { id: "good-cost", claim: "…and a bill of $500", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { edge: true, ttl: 60, protect: "swr", writeback: true, flush: 10 }, metric: "costPerMonth" }, expect: { max: 500 } },
    { id: "no-writeback", claim: "Without write-back the database is crushed by the likes", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { edge: true, ttl: 60, protect: "swr" }, metric: "dbPeakUtil" }, expect: { min: 1 } },
    { id: "no-edge", claim: "Without the edge even replicas and write-back cannot hold the database", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { replicas: 8, ttl: 60, protect: "swr", writeback: true, flush: 10 }, metric: "dbPeakUtil" }, expect: { min: 1 } },
    { id: "overspend", claim: "Buying replicas as well breaks the budget", run: "lab", params: { model: "celeb-lab", config: CELEB, values: { edge: true, ttl: 60, protect: "swr", replicas: 4, writeback: true, flush: 10 }, metric: "costPerMonth" }, expect: { min: 521 } },
  ],
});
