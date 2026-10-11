import { definePack } from "../define";

export const EDGE = { start: { normalize: true, vary: false, ttl: 120, swr: false } };
export const EDGE_BAD = { start: { normalize: false, vary: true, ttl: 120, swr: false } };

const RFC9111 = { id: "rfc9111", title: "RFC 9111: HTTP Caching (Cache-Control, Vary, shared caches)", url: "https://www.rfc-editor.org/rfc/rfc9111" };
const MDN_CC = { id: "mdn-cache-control", title: "MDN: Cache-Control header (max-age, s-maxage, private, stale-while-revalidate)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control" };
const CLOUDFRONT_KEY = { id: "cloudfront-cache-key", title: "AWS docs: Control the cache key with a cache policy (query strings, headers, cookies)", url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html" };
const RFC5861 = { id: "rfc5861", title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content", url: "https://www.rfc-editor.org/rfc/rfc5861" };

export default definePack({
  id: "cdn-caching",
  title: "CDN Caching",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "CloudFront · hit ratio", detail: "dropped to 4% after the marketing launch" },
    lines: [
      { speaker: "kabir", line: "The CDN's hit ratio went from ninety-five percent to four after marketing added tracking links, and our origin is on fire." },
      { speaker: "meera", line: "Every different link, to the cache, is a different page. Look at what is in the cache key." },
    ],
  },
  predictions: [
    {
      id: "fragmented",
      kind: "choice",
      prompt: "A site has 2,000 popular pages. Marketing appends a tracking parameter that takes about 12 different values, and the app sets a per-visitor cookie that the CDN varies on, about 50 values. What happens to the hit ratio?",
      options: [
        { id: "same", label: "Nothing, it is the same page" },
        { id: "small", label: "A small dip, 5 to 10 points" },
        { id: "collapse", label: "It collapses to a few percent, because each page splits into hundreds of cache keys" },
        { id: "up", label: "It rises, because there is more variety" },
      ],
      answer: "collapse",
      observe: "fragmented",
      reveal: {
        text: "The cache keys 12 times 50 variants of each page. At 400 requests a second over 2,000 pages, each of the 1.2 million keys sees a request every 1.5 hours, so almost every request is a first request. The hit ratio falls to a few percent.",
        derived: true,
        line: { speaker: "meera", line: "The cache did its job perfectly. We gave it the wrong question." },
      },
    },
  ],
  widget: { id: "edgecache-lab", config: EDGE },
  mechanism: [
    {
      id: "key",
      scene: "key",
      text: "A CDN stores a response under a cache key: by default the URL, plus whatever you tell it to include. If a query parameter that does not change the content, such as a tracking tag, is in the key, every distinct value is a separate cached object.",
      sourceIds: ["cloudfront-cache-key"],
    },
    {
      id: "vary",
      scene: "vary",
      text: "Vary and cookie settings make it worse. Varying on a header or a session cookie stores one copy per value, which for a per-visitor cookie is one copy per visitor. Keep the key to what actually changes the response, and never cache personalised responses in a shared cache.",
      sourceIds: ["rfc9111", "cloudfront-cache-key"],
    },
    {
      id: "headers",
      text: "Cache-Control tells caches what to do. max-age sets freshness for any cache, s-maxage overrides it for shared caches like a CDN, private keeps a response out of shared caches, and no-store forbids storing it. Set them deliberately, per route.",
      sourceIds: ["mdn-cache-control"],
    },
    {
      id: "swr",
      scene: "swr",
      text: "stale-while-revalidate lets the CDN serve an expired copy while it fetches a fresh one in the background, so the visitor never waits for a refresh and the origin sees one request per object rather than a wave. It trades a short period of staleness for steadiness.",
      sourceIds: ["rfc5861"],
    },
  ],
  challenges: [
    {
      id: "rescue-hit-ratio",
      title: "Rescue the hit ratio",
      brief: "Tracking parameters and a per-visitor cookie have split every page into hundreds of cache keys. Get the edge hit ratio to 90% or better, with no more than 40 requests a second reaching the origin and content no more than 5 minutes stale. Public pages are the same for everyone.",
      line: { speaker: "rao", line: "Each origin request is a server I'm paying for. I will not pay for tracking tags." },
      widget: { id: "edgecache-lab", config: EDGE_BAD },
      conditions: [
        { metric: "hitRatio", op: ">=", value: 0.9, label: "Edge hit ratio at least 90%" },
        { metric: "originRps", op: "<=", value: 40, label: "At most 40 origin requests per second" },
        { metric: "staleSec", op: "<=", value: 300, label: "Content at most 5 minutes stale" },
      ],
      stars: [{ metric: "staleSec", op: "<=", value: 120, label: "Content at most 2 minutes stale" }],
      hints: [
        "How many cache keys does each page have right now?",
        "A longer TTL can raise the hit ratio, but the freshness limit stops it. What else splits the keys?",
        "Which two things in the key do not change the page for public content?",
      ],
    },
  ],
  explainBack: {
    prompt: "What decides whether a CDN can cache a response, and why can a small change like a tracking parameter wreck the hit ratio?",
    rubric: [
      { id: "key", criterion: "A CDN stores objects under a cache key, usually the URL plus whatever is configured; distinct keys are distinct objects", keyIdea: "cache key" },
      { id: "frag", criterion: "Parameters or cookies in the key split one page into many objects, each requested rarely and missing most of the time", keyIdea: "fragmentation" },
      { id: "fix", criterion: "Normalise the key (ignore irrelevant parameters, avoid varying on cookies), and set Cache-Control correctly", keyIdea: "normalise the key" },
    ],
    exemplar:
      "The CDN stores each response under a cache key, normally the URL plus any configured headers, cookies or query strings, and each different key is a separate object. A tracking parameter or per-visitor cookie multiplies one page into hundreds of keys, each requested rarely, so nearly every request misses. I would ignore parameters that do not change the content, avoid varying on cookies for public pages, and set Cache-Control per route.",
  },
  reviews: [
    {
      id: "cc-est-keys",
      format: "estimate",
      scenario: "A page has 12 tracking-parameter values and a cookie with 50 values in its cache key. How many separate cached copies could one page have?",
      unit: "copies",
      answer: 600,
      acceptFactor: 1.1,
      breakdown: ["12 × 50", "= 600 copies of one page"],
      explain: "Variants multiply. Each copy sees a small share of the page's traffic, so it expires before it is reused.",
    },
    {
      id: "cc-est-hit",
      format: "estimate",
      scenario: "After normalising, a page is requested once every 5 seconds at an edge, with a 120-second TTL. What percentage of requests hit?",
      unit: "%",
      answer: 96,
      acceptFactor: 1.05,
      breakdown: ["Requests per TTL window = 120 ÷ 5 = 24", "24 ÷ (1 + 24)", "= 96%"],
      explain: "Twenty-four requests per window, of which only the first misses.",
    },
    {
      id: "cc-pick",
      format: "pick-fix",
      scenario: "An API returns each user's own order list at /api/orders, with Cache-Control: public, max-age=3600. Users sometimes see someone else's orders. What is the fix?",
      options: [
        { id: "a", label: "Cache-Control: private (or no-store) for personalised responses" },
        { id: "b", label: "Lower the TTL to 60 seconds" },
        { id: "c", label: "Add a query parameter" },
        { id: "d", label: "Use a bigger CDN" },
      ],
      answer: "a",
      explain: "public lets shared caches store a response and serve it to anyone who asks for the URL. Personalised data must be private, or not cached at all, or the cache key must include the user.",
    },
    {
      id: "cc-order",
      format: "order",
      scenario: "Order these cache-key designs by expected hit ratio, highest first. Content is the same for everyone.",
      items: [
        { id: "clean", label: "URL only, tracking parameters ignored" },
        { id: "qs", label: "URL plus all query parameters" },
        { id: "cookie", label: "URL plus all query parameters plus a per-visitor cookie" },
      ],
      answer: ["clean", "qs", "cookie"],
      explain: "Each extra dimension in the key multiplies the number of objects and divides the requests each one sees.",
    },
    {
      id: "cc-graph",
      format: "predict-graph",
      scenario: "Hold request rate and TTL fixed and raise the number of cache-key variants per page from 1 to 600. What happens to the hit ratio?",
      xLabel: "variants per page →",
      yLabel: "hit ratio",
      options: [
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "fall", label: "Falls quickly toward zero", points: [8, 4.5, 2.5, 1.5, 1, 0.7, 0.5, 0.4] },
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "rise", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "fall",
      explain: "Each variant sees 1 ÷ variants of the requests, so its rT term shrinks and the hit ratio rT ÷ (1 + rT) falls toward zero.",
    },
    {
      id: "cc-flaw",
      format: "spot-flaw",
      scenario: "The CDN is configured to forward all cookies and all query strings to the origin and to include them in the cache key 'to be safe'. Tap the setting that makes the cache useless for public pages.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "cdn", label: "CDN · cache key: URL + all cookies + all query strings", kind: "cache", col: 1, row: 1 },
          { id: "origin", label: "origin", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "users", to: "cdn" },
          { from: "cdn", to: "origin" },
        ],
      },
      answer: "cdn",
      explain: "Including every cookie and query string in the key gives each visitor and each link its own cache entry. Include only what changes the response.",
    },
    {
      id: "cc-explain",
      format: "explain",
      scenario: "In two sentences: what does stale-while-revalidate do for a user and for the origin?",
      rubric: [
        { id: "user", criterion: "The user gets the cached copy immediately, with no wait for a refresh" },
        { id: "origin", criterion: "The CDN refreshes in the background, so the origin sees one request per object instead of a burst" },
      ],
      exemplar: "The user gets the cached copy right away, even if it has just expired, instead of waiting for a refresh. The CDN fetches a new copy in the background, so the origin sees one request per object rather than a burst when many users arrive at expiry.",
      explain: "Staleness for a moment buys steady latency and steady load.",
    },
  ],
  codex: {
    oneLiner: "A CDN caches by key. Keep the key to what changes the response, set Cache-Control per route, and use stale-while-revalidate to smooth expiry.",
    keyNumbers: [
      { label: "Cache-Control directives", value: "max-age, s-maxage, private, no-store, stale-while-revalidate", sourceId: "mdn-cache-control" },
      { label: "Hit ratio per cache key", value: "rT ÷ (1 + rT)", sourceId: "rfc9111" },
    ],
    tradeoffs: [
      { choice: "Normalise the cache key", gain: "Fewer objects, higher hit ratio", cost: "You must be sure ignored parameters really do not change the response" },
      { choice: "Long TTL with versioned URLs", gain: "Edge keeps assets for a year", cost: "A build step that renames files" },
      { choice: "stale-while-revalidate", gain: "No visible refresh wait; smooth origin load", cost: "Content can lag a moment behind" },
    ],
    seenIn: ["CloudFront cache policies and origin request policies.", "A hit ratio that collapses after a campaign adds UTM parameters."],
    interviewAngle: "For anything behind a CDN say what is in the cache key and what the Cache-Control headers are: 'public assets hashed and cached for a year, HTML short with stale-while-revalidate, anything personalised private.'",
    aws: [{ concept: "Cache key policy", service: "CloudFront cache policy and origin request policy" }],
    replay: { id: "edgecache-lab", config: EDGE, scene: "key" },
  },
  interview: [
    "Your CDN hit ratio dropped suddenly. What do you check?",
    "What is the difference between max-age and s-maxage?",
    "How do you cache a page that is mostly the same for everyone but has a personalised greeting?",
  ],
  deeper: [
    {
      title: "Personalised pages at the edge",
      body: "A page that is the same for everyone except a small block can be cached whole, with the personalised block loaded separately by the browser from a private, uncached endpoint. Edge-side includes and edge functions can stitch the pieces at the edge instead. Either way, the shared part keeps one cache key and a high hit ratio.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Pages are requested uniformly at 400 requests a second across 2,000 popular URLs. Real traffic is skewed, so popular pages hit more and the long tail less.",
    "Hit ratio per cache key is the fixed-TTL approximation rT ÷ (1 + rT). Each tracking-parameter value or cookie value is its own key, with 12 and 50 variants as the lab's example.",
    "Revalidation adds a few seconds to staleness in the lab. Real values depend on origin speed.",
  ],
  sources: [RFC9111, MDN_CC, CLOUDFRONT_KEY, RFC5861],
  verify: [
    { id: "start", claim: "With 600 variants per page the hit ratio is a few percent", run: "lab", params: { model: "edgecache-lab", config: EDGE_BAD, values: {}, metric: "hitRatio" }, expect: { max: 0.06 } },
    { id: "one-fix", claim: "Normalising parameters alone is not enough", run: "lab", params: { model: "edgecache-lab", config: EDGE_BAD, values: { normalize: true }, metric: "hitRatio" }, expect: { max: 0.9 } },
    { id: "vary-only", claim: "Dropping the cookie alone is not enough either", run: "lab", params: { model: "edgecache-lab", config: EDGE_BAD, values: { vary: false }, metric: "hitRatio" }, expect: { max: 0.9 } },
    { id: "both", claim: "Both fixes reach 90%", run: "lab", params: { model: "edgecache-lab", config: EDGE_BAD, values: { normalize: true, vary: false }, metric: "hitRatio" }, expect: { min: 0.9 } },
    { id: "both-origin", claim: "…with the origin under 40 requests a second", run: "lab", params: { model: "edgecache-lab", config: EDGE_BAD, values: { normalize: true, vary: false }, metric: "originRps" }, expect: { max: 40 } },
  ],
});
