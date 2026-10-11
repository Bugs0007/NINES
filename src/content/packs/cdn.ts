import { definePack } from "../define";

export const CDN = { start: { cdn: false, ttl: 300, rate: 0.5, pops: 5 } };
export const CDN_CHALLENGE = { start: { cdn: true, ttl: 60, rate: 0.01, pops: 1 }, hide: ["cdn", "rate"] };

const CF_CDN = { id: "cf-cdn", title: "Cloudflare Learning Center: What is a CDN?", url: "https://www.cloudflare.com/learning/cdn/what-is-a-cdn/" };
const CLOUDFRONT_EXP = { id: "cloudfront-expiration", title: "AWS docs: Manage how long content stays in the CloudFront cache (expiration)", url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html" };

export default definePack({
  id: "cdn",
  title: "CDNs",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · Jakarta and Frankfurt", detail: "'images take forever to load'" },
    lines: [
      { speaker: "kabir", line: "Our origin is in ap-south-2 and the images are tiny, yet users in Frankfurt say the app crawls. The server is barely warm." },
      { speaker: "meera", line: "Tiny files still cross the ocean. Put copies of them where the users are." },
    ],
  },
  predictions: [
    {
      id: "cut",
      kind: "choice",
      prompt: "Pigeon serves cacheable images from one origin in ap-south-2 to users in five regions. You put a CDN with an edge in every region in front. About how much does the average image fetch time fall?",
      options: [
        { id: "few", label: "A few percent; it only helps static sites" },
        { id: "quarter", label: "About a quarter" },
        { id: "half", label: "About half" },
        { id: "most", label: "About 90%" },
      ],
      answer: "most",
      observe: "cdn-on",
      reveal: {
        text: "A popular image is a hit at the edge almost every time, so the user pays about 10ms to a nearby edge instead of a long round trip to the origin. Averaged over regions, the fetch drops from about 270ms to about 30ms.",
        derived: true,
        line: { speaker: "meera", line: "Distance is the one cost you cannot tune away, only avoid." },
      },
    },
  ],
  widget: { id: "cdn-lab", config: CDN },
  mechanism: [
    {
      id: "edge",
      scene: "edge",
      text: "A CDN is a fleet of caches near users. A request goes to the closest edge. A hit is answered there, a round trip of tens of milliseconds. A miss goes to your origin once, the edge stores the answer, and everyone after it gets a hit.",
      sourceIds: ["cf-cdn"],
    },
    {
      id: "hit",
      scene: "miss",
      text: "Hit ratio depends on how often an object is asked for at an edge, and for how long it may be kept. With r requests a second and a TTL of T seconds, an edge hits about rT ÷ (1 + rT) of the time. Rarely requested objects need long TTLs to be worth caching.",
      derived: true,
    },
    {
      id: "ttl",
      text: "The TTL is set by your Cache-Control headers. A long one means fewer origin trips and staler content, so use long TTLs for files whose URLs change when the content changes, and short ones, or explicit purges, for content that changes in place.",
      sourceIds: ["cloudfront-expiration"],
    },
    {
      id: "coverage",
      text: "Coverage matters as much as the cache. A user far from the nearest edge pays that distance on every request, hit or not. The number of edge locations a provider has near your users is part of the choice.",
    },
  ],
  challenges: [
    {
      id: "rare-objects",
      title: "Cache the long tail",
      brief: "Most of Pigeon's images are requested rarely: about once every 100 seconds at an edge. You have an edge in one region and a TTL of 60 seconds. Spread the CDN and tune the TTL so the average fetch is under 100 ms, the worst region under 200 ms, and at least 90% of requests are edge hits.",
      line: { speaker: "rao", line: "Edges are priced per region and per gigabyte. Do not turn on all of them for the sake of it." },
      widget: { id: "cdn-lab", config: CDN_CHALLENGE },
      conditions: [
        { metric: "avgMs", op: "<", value: 100, label: "Average fetch under 100 ms" },
        { metric: "worstMs", op: "<", value: 200, label: "Worst region under 200 ms" },
        { metric: "hitRatio", op: ">=", value: 0.9, label: "At least 90% edge hits" },
      ],
      stars: [{ metric: "avgMs", op: "<", value: 85, label: "Average fetch under 85 ms" }],
      hints: [
        "With one request every 100 seconds and a 60-second TTL, how often is the edge's copy still fresh?",
        "What TTL gives a 90% hit ratio at that request rate?",
        "Which regions are still far from an edge? Add edges until the worst one is under 200 ms.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how a CDN reduces latency, and what decides its hit ratio.",
    rubric: [
      { id: "distance", criterion: "Serves content from an edge close to the user, avoiding the long round trip to the origin", keyIdea: "move data closer" },
      { id: "hit", criterion: "Hit ratio depends on how often the object is requested at each edge and how long it is cached (TTL)", keyIdea: "request rate × TTL" },
      { id: "tradeoff", criterion: "Long TTLs trade freshness for hits; mentions purging, versioned URLs, or coverage", keyIdea: "freshness vs hits" },
    ],
    exemplar:
      "A CDN keeps copies of content at edges near users, so a hit costs a short local round trip instead of a long one to the origin. How often that happens depends on how frequently each object is requested at an edge and how long it may be cached, so rare objects need long TTLs. Long TTLs mean staler content, so I version file names or purge when content changes.",
  },
  reviews: [
    {
      id: "cdn-est-hit",
      format: "estimate",
      scenario: "An image is requested once every 10 seconds at an edge, and its TTL is 300 seconds. What percentage of requests are edge hits?",
      unit: "%",
      answer: 97,
      acceptFactor: 1.1,
      breakdown: ["Requests per TTL window: 300 ÷ 10 = 30", "One miss, then hits: 30 ÷ (1 + 30)", "≈ 97%"],
      explain: "Thirty requests per window, and only the first misses. Popular objects with moderate TTLs are almost all hits.",
    },
    {
      id: "cdn-est-ms",
      format: "estimate",
      scenario: "Origin round trip from Frankfurt is about 110 ms; the nearest edge is 10 ms. With a 95% hit ratio, about what is the average round-trip cost per fetch?",
      unit: "ms",
      answer: 15,
      acceptFactor: 1.4,
      breakdown: ["Hits: 95% × 10 ms = 9.5", "Misses: 5% × (10 + 110) = 6", "≈ 15 ms"],
      explain: "Even misses are a small share when the hit ratio is high, so the average sits close to the edge's round trip.",
    },
    {
      id: "cdn-pick",
      format: "pick-fix",
      scenario: "You set a 30-day TTL on app.js, then ship a bug fix and users keep getting the old file. What is the standard fix going forward?",
      options: [
        { id: "a", label: "Use content-hashed file names (app.3fa9.js), so a new version is a new URL" },
        { id: "b", label: "Set the TTL to 5 seconds for everything" },
        { id: "c", label: "Ask users to clear their browser cache" },
        { id: "d", label: "Disable the CDN" },
      ],
      answer: "a",
      explain: "When a URL's content never changes, it can be cached for a year. A new build gets a new name, so there is nothing stale to invalidate.",
    },
    {
      id: "cdn-order",
      format: "order",
      scenario: "Order these by time to fetch an image for a user in Frankfurt, fastest first. The origin is far away; the edge is near.",
      items: [
        { id: "browser", label: "Browser cache hit" },
        { id: "edge", label: "CDN edge hit" },
        { id: "miss", label: "CDN edge miss, filled from the origin" },
        { id: "nocdn", label: "No CDN, straight to the origin" },
      ],
      answer: ["browser", "edge", "nocdn", "miss"],
      explain: "A miss pays the edge and the origin, so it is a little slower than going direct, which is why hit ratio matters. Hits are the whole point.",
    },
    {
      id: "cdn-graph",
      format: "predict-graph",
      scenario: "Hold TTL fixed and raise the number of requests per second for an object at one edge. How does its hit ratio change?",
      xLabel: "requests per second →",
      yLabel: "hit ratio",
      options: [
        { id: "linear", label: "Straight line up to 100%", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises quickly, then saturates near 100%", points: [1, 4, 6, 7, 7.5, 7.8, 7.9, 8] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "down", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "sat",
      explain: "Hit ratio is rT ÷ (1 + rT): a steep climb while requests are rare, then almost no further gain once hits dominate.",
    },
    {
      id: "cdn-flaw",
      format: "spot-flaw",
      scenario: "A CDN fronts an API whose responses are personalised per user, with Cache-Control: public, max-age=86400. Users report seeing each other's data. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "cdn", label: "CDN · caches public responses for 24 hours", kind: "cache", col: 1, row: 1 },
          { id: "api", label: "api · personalised responses marked public", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "users", to: "cdn" },
          { from: "cdn", to: "api" },
        ],
      },
      answer: "api",
      explain: "Marking per-user data public lets a shared cache serve one user's response to another. Personalised responses should be private or no-store, and vary on whatever identifies the user.",
    },
  ],
  codex: {
    oneLiner: "A CDN serves copies from edges near users. Hit ratio follows request rate times TTL; coverage decides how far the misses and gaps travel.",
    keyNumbers: [
      { label: "Edge hit ratio", value: "about rT ÷ (1 + rT) for r requests/s and TTL T", sourceId: "cloudfront-expiration" },
      { label: "What a CDN is", value: "geographically distributed caches", sourceId: "cf-cdn" },
    ],
    tradeoffs: [
      { choice: "Long TTL with versioned URLs", gain: "Highest hit ratio, almost no origin load", cost: "A build step that renames files" },
      { choice: "Short TTL for mutable content", gain: "Fresh content", cost: "More origin traffic and slower misses" },
      { choice: "More edge regions", gain: "Lower latency for far users", cost: "Cost, and more caches to warm" },
    ],
    seenIn: ["CloudFront or Cloudflare in front of an S3 bucket or an app.", "Cache-Control headers and cache-busting file names."],
    interviewAngle: "Say what is cacheable, what the TTL is, and how you invalidate: 'static assets with hashed names and long TTLs, HTML short, API responses private.'",
    aws: [{ concept: "CDN", service: "Amazon CloudFront", note: "Edge locations, origin shield, invalidations" }],
    otherClouds: "GCP: Cloud CDN · Azure: Azure Front Door and CDN",
    replay: { id: "cdn-lab", config: CDN, scene: "edge" },
  },
  interview: [
    "How does a CDN improve latency for a user on the other side of the world?",
    "How would you handle a deploy of new JavaScript with a CDN in front?",
    "What should never be cached at a shared edge?",
  ],
  deeper: [
    {
      title: "Origin shield",
      body: "With many edges, a rarely requested object can be missed at each one in turn, hitting your origin dozens of times. An origin shield is a regional cache between the edges and the origin that collapses those into one request, raising the hit ratio the origin sees at the price of one more hop on a miss.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Round trips come from distance: 8 ms plus 0.015 ms per km, an estimate for fibre routes. Real paths and peering vary.",
    "Each object's hit ratio assumes steady Poisson requests and a fixed TTL, at every edge alike.",
    "A user without an edge in their own region is served by the nearest listed edge, a thousand kilometres further than the distance suggests, as an allowance for routing detours.",
  ],
  sources: [CF_CDN, CLOUDFRONT_EXP],
  verify: [
    { id: "one-edge-fails", claim: "With one edge and a 60 s TTL the hit ratio is far below 90%", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: {}, metric: "hitRatio" }, expect: { max: 0.5 } },
    { id: "pops-only-fails", claim: "Three edges but a short TTL still misses the hit-ratio target", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: { pops: 3, ttl: 300 }, metric: "hitRatio" }, expect: { max: 0.9 } },
    { id: "wins-avg", claim: "Three edges and a 900 s TTL average under 100 ms", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: { pops: 3, ttl: 900 }, metric: "avgMs" }, expect: { max: 100 } },
    { id: "wins-worst", claim: "…with the worst region under 200 ms", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: { pops: 3, ttl: 900 }, metric: "worstMs" }, expect: { max: 200 } },
    { id: "wins-hit", claim: "…and at least 90% hits", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: { pops: 3, ttl: 900 }, metric: "hitRatio" }, expect: { min: 0.9 } },
    { id: "two-pops", claim: "Two edges leave average fetch above 100 ms", run: "lab", params: { model: "cdn-lab", config: CDN_CHALLENGE, values: { pops: 2, ttl: 3600 }, metric: "avgMs" }, expect: { min: 100 } },
  ],
});
