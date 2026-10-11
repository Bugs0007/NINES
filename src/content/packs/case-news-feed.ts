import { defineBoss } from "../define";

export const NFC = {};

const TWITTER = { id: "twitter-timelines", title: "Raffi Krikorian (2012), Timelines at Scale (fan-out on write, and celebrity accounts)", url: "https://www.infoq.com/presentations/Twitter-Timeline-Scalability/" };
const INSTAGRAM = { id: "instagram-feed", title: "System Design Primer: Design the Twitter timeline and search", url: "https://github.com/donnemartin/system-design-primer/blob/master/solutions/system_design/twitter/README.md" };
const LITTLE = { id: "zipf-hot", title: "Zipf's law and heavy-tailed popularity (a few accounts carry most followers)", url: "https://en.wikipedia.org/wiki/Zipf%27s_law" };

export default defineBoss({
  id: "case-news-feed",
  title: "Case: News Feed",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "write queue · 2,000,000 feed inserts from one post", detail: "a celebrity posted; ordinary users' posts are 200 seconds late" },
    lines: [{ speaker: "kabir", line: "One celebrity posted and the feed writers spent three minutes copying it into two million feeds. Everyone else's posts waited in line behind it." }],
  },
  intro: [
    { speaker: "meera", line: "A feed is a reading problem and a writing problem. Where you do the work decides who pays for it." },
    { speaker: "rao", line: "Ninety-nine percent of accounts are small and one percent are enormous. Design for both without doubling the cost for either." },
  ],
  forecast: {
    metric: "writeAmplification",
    prompt: "Pushing every post into every follower's feed, how many feed writes does the average post cause? (99% of accounts have 200 followers, 1% have 2 million.)",
    unit: "writes",
    scale: 1,
    min: 100,
    max: 100000,
    tolerance: 1.5,
  },
  exercises: ["fan-out-pubsub", "cache-aside", "hot-partitions"],
  challenge: {
    id: "design-feed",
    title: "Design the feed",
    brief: "Keep writes per post at 1,000 or fewer, feed reads at 10 lookups or fewer, a celebrity's post reaching everyone within 30 seconds, and the feed read p99 at 15 ms or less.",
    line: { speaker: "meera", line: "Push for the many, pull for the few, and cache the result." },
    widget: { id: "feed-lab", config: NFC },
    conditions: [
      { metric: "writeAmplification", op: "<=", value: 1000, label: "At most 1,000 writes per post" },
      { metric: "readLookups", op: "<=", value: 10, label: "At most 10 lookups per feed read" },
      { metric: "celebDelaySec", op: "<=", value: 30, label: "Celebrity posts reach everyone within 30 s" },
      { metric: "feedP99Ms", op: "<=", value: 15, label: "Feed read p99 at most 15 ms" },
    ],
    stars: [],
    hints: ["Which accounts make fan-out on write expensive?", "What does a read cost if you fan out on read?", "Where should the line between push and pull sit?"],
  },
  debrief: [
    { id: "skew", text: "Followers are heavy-tailed: 1% of accounts carry 99% of the fan-out work. Pushing everyone's posts costs 20,198 writes per post on average, almost all of it for celebrities, and a celebrity post takes 200 seconds to land.", sourceIds: ["twitter-timelines", "zipf-hot"] },
    { id: "hybrid", text: "The hybrid pushes ordinary accounts (198 writes per post) and pulls celebrities' posts when the feed is read: four lookups instead of 200 for pure pull, and no 200-second delay. The threshold only has to sit below the celebrity range.", sourceIds: ["twitter-timelines"] },
    { id: "cache", text: "A cached feed halves the base read time, to 10 ms with four lookups. Reads are far more frequent than posts, so that is where the next millisecond comes from.", derived: true },
  ],
  outro: { speaker: "kabir", line: "Hybrid, threshold at a hundred thousand followers, feeds cached. Two hundred writes a post and a ten millisecond read." },
  explainBack: {
    prompt: "Explain how your news feed works and why you split ordinary and celebrity accounts.",
    rubric: [
      { id: "push", criterion: "Fan-out on write precomputes each follower's feed so reads are one lookup, and its cost is the follower count per post", keyIdea: "push cost" },
      { id: "pull", criterion: "Fan-out on read computes the feed at read time: cheap writes, expensive reads", keyIdea: "pull cost" },
      { id: "hybrid", criterion: "Push for ordinary accounts and pull celebrities' posts at read time, with a follower-count threshold, avoids both extremes", keyIdea: "hybrid" },
      { id: "cache", criterion: "Cache feeds because reads outnumber posts", keyIdea: "cache reads" },
    ],
    exemplar:
      "Fan-out on write precomputes each follower's feed so a read is one lookup, but its cost is the follower count, and celebrities make that millions of writes for one post. Fan-out on read has cheap writes and an expensive read, gathering hundreds of timelines. So I push for ordinary accounts and pull the posts of celebrities above a follower threshold at read time, which makes a post about two hundred writes and a read four lookups, and cache each user's feed because reads outnumber posts.",
  },
  honestPhysics: [
    "99% of accounts have 200 followers and 1% are celebrities with 2 million; every account posts at the same rate. Pushing everything makes 0.99 × 200 + 0.01 × 2,000,000 = 20,198 writes per post, and a celebrity post lands in 2,000,000 ÷ 10,000 = 200 seconds. Pulling needs 200 lookups per read.",
    "The hybrid makes 198 writes per post and four lookups per read (the user's feed plus three celebrities followed). A feed cache cuts the base read from 20 ms to 8 ms; each lookup is 0.6 ms. Round figures.",
  ],
  sources: [TWITTER, INSTAGRAM, LITTLE],
  verify: [
    { id: "forecast", claim: "Pushing everything costs 20,198 writes per post", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "write" }, metric: "writeAmplification" }, expect: { min: 20197, max: 20199 } },
    { id: "delay", claim: "A celebrity post takes 200 seconds to land", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "write" }, metric: "celebDelaySec" }, expect: { min: 200, max: 200 } },
    { id: "pull", claim: "Pure pull needs 200 lookups per read", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "read" }, metric: "readLookups" }, expect: { min: 200, max: 200 } },
    { id: "hybrid", claim: "The hybrid makes 198 writes per post", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "hybrid", thresholdK: 100 }, metric: "writeAmplification" }, expect: { min: 197, max: 199 } },
    { id: "hybrid-read", claim: "…and four lookups per read", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "hybrid", thresholdK: 100 }, metric: "readLookups" }, expect: { min: 4, max: 4 } },
    { id: "cache", claim: "Caching brings the feed read to 10.4 ms", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "hybrid", thresholdK: 100, cache: true }, metric: "feedP99Ms" }, expect: { min: 10.3, max: 10.5 } },
    { id: "high", claim: "A threshold above the celebrity range pushes them again", run: "lab", params: { model: "feed-lab", config: NFC, values: { mode: "hybrid", thresholdK: 5000 }, metric: "writeAmplification" }, expect: { min: 20000 } },
  ],
});
