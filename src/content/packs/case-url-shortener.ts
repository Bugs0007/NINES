import { defineBoss } from "../define";

export const URLC = {};

const BIRTHDAY = { id: "birthday-problem", title: "The birthday problem (collision probability when picking random values from a space)", url: "https://en.wikipedia.org/wiki/Birthday_problem" };
const MDN_301 = { id: "mdn-301", title: "MDN: 301 Moved Permanently (cacheable by clients)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/301" };
const MDN_302 = { id: "mdn-302", title: "MDN: 302 Found (a temporary redirect, not cached by default)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/302" };
const SDP = { id: "system-design-primer", title: "The System Design Primer: Design Pastebin.com (or Bit.ly)", url: "https://github.com/donnemartin/system-design-primer/blob/master/solutions/system_design/pastebin/README.md" };

export default defineBoss({
  id: "case-url-shortener",
  title: "Case: URL Shortener",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "launch",
    alert: { severity: "info", title: "interview · 'Design a URL shortener'", detail: "100 million new links a month, 100 redirects for every link created" },
    lines: [{ speaker: "kabir", line: "A hundred million links a month, redirects a hundred times more often than creation, and a short code that must not be guessable. Sixty minutes of whiteboard." }],
  },
  intro: [
    { speaker: "meera", line: "Start from the numbers. How many redirects a second at peak, and what does one lookup cost?" },
    { speaker: "rao", line: "Then decide where the code comes from, where it lives, and whether the browser or your servers answer the repeat visits." },
  ],
  forecast: {
    metric: "storeRps",
    prompt: "With a single SQL database, no cache and permanent (301) redirects, how many reads a second must the database serve at peak?",
    unit: "per second",
    scale: 1,
    min: 100,
    max: 100000,
    tolerance: 1.5,
  },
  exercises: ["cache-aside", "indexes-btree", "estimation-storage"],
  challenge: {
    id: "design-shortener",
    title: "Design the shortener",
    brief: "Serve peak redirects at a p99 of 20 ms or less, keep collisions on new codes under 0.2% after five years, make codes unguessable, count every visit, and spend $1,300 a month or less.",
    line: { speaker: "meera", line: "Each choice answers a different question: speed, uniqueness, secrecy, measurement and cost." },
    widget: { id: "urlshort-lab", config: URLC },
    conditions: [
      { metric: "p99Ms", op: "<=", value: 20, label: "Redirect p99 at most 20 ms at peak" },
      { metric: "collisionRetry", op: "<=", value: 0.002, label: "Under 0.2% of inserts collide" },
      { metric: "guessable", op: "<=", value: 0, label: "Codes cannot be counted through" },
      { metric: "analyticsAccurate", op: ">=", value: 1, label: "Every visit is counted" },
      { metric: "costMonth", op: "<=", value: 1300, label: "At most $1,300 a month" },
    ],
    stars: [{ metric: "p99Ms", op: "<=", value: 10, label: "Redirect p99 at most 10 ms" }],
    hints: [
      "What does a redirect cost the store at peak, and what does a cache take off it?",
      "Which ID schemes can be counted through, and which can collide?",
      "What do you lose by letting browsers cache the redirect?",
    ],
  },
  debrief: [
    { id: "load", text: "The read path decides the architecture: 11,400 redirects a second at peak is more than one SQL database serves at a sane latency, so either a cache absorbing 80% of reads, read replicas or a key-value store carries it. The writes, 38 a second, were never the problem.", derived: true },
    { id: "ids", text: "A counter gives unique codes without collisions and invites enumeration; shuffling its bits, or using a random or hashed code, gives unguessable ones. At 6 billion links in a 3.5 trillion space, random codes collide on 0.17% of inserts, which a retry handles.", sourceIds: ["birthday-problem"] },
    { id: "redirect", text: "A 301 is cached by the browser, which removes about 30% of repeat visits and hides them from analytics. A 302 reaches the server every time. Products that sell click counts choose 302 and pay for the load.", sourceIds: ["mdn-301", "mdn-302"] },
  ],
  outro: { speaker: "kabir", line: "Replicas and a cache, shuffled counters, 302. Twelve hundred dollars and a seventeen millisecond p99. That is the answer I will give." },
  explainBack: {
    prompt: "Present your URL shortener design as you would in an interview: the numbers, the choices and the trade-offs.",
    rubric: [
      { id: "numbers", criterion: "States the load: about 38 writes and 3,800 redirects a second, 11,400 at peak, and that reads dominate", keyIdea: "estimate first" },
      { id: "store", criterion: "A cache for the hot links plus read replicas or a key-value store serves the read path; the database alone does not", keyIdea: "read path design" },
      { id: "ids", criterion: "Codes are unique and unguessable: random or hashed with collision retry, or a counter with shuffled bits", keyIdea: "id generation" },
      { id: "redirect", criterion: "302 keeps analytics accurate at a load cost; 301 lets browsers cache but hides visits", keyIdea: "301 versus 302" },
    ],
    exemplar:
      "The load is about 38 writes and 3,800 redirects a second, 11,400 at peak, so it is a read-heavy system. A cache for the hot 20% of links plus read replicas serves that read path at a 16 millisecond p99 where one database cannot. Codes come from a counter with shuffled bits, which are unique and unguessable, or random codes with a collision retry. I would use a 302 so every visit is counted for analytics, accepting the extra load instead of letting browsers cache a 301.",
  },
  honestPhysics: [
    "100 million new links a month with 100 redirects each is 38 writes and 3,800 reads a second, peaking at three times the average. Storage is 600 GB over five years at 500 bytes a link, which fits comfortably, and never decides the design.",
    "A single SQL database serves about 5,000 lookups a second, three read replicas 15,000, a key-value store 60,000; a cache absorbs 80% of reads. A 301 removes about 30% of repeat visits. p99 is the store's p99 stretched by 1 ÷ (1 − load). Round figures.",
  ],
  sources: [BIRTHDAY, MDN_301, MDN_302, SDP],
  verify: [
    { id: "forecast", claim: "A single database with 301 redirects must serve 7,980 reads a second", run: "lab", params: { model: "urlshort-lab", config: URLC, values: {}, metric: "storeRps" }, expect: { min: 7900, max: 8100 } },
    { id: "overload", claim: "…more than it can handle", run: "lab", params: { model: "urlshort-lab", config: URLC, values: {}, metric: "p99Ms" }, expect: { min: 9000 } },
    { id: "cache", claim: "A cache cuts the store's load to a fifth", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { cache: true, redirect: "302" }, metric: "storeRps" }, expect: { min: 2200, max: 2350 } },
    { id: "good", claim: "Replicas, a cache and a 302 give a 16.5 ms p99 for $1,200", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { idgen: "shuffled", store: "sqlr", cache: true, redirect: "302" }, metric: "p99Ms" }, expect: { min: 16, max: 17 } },
    { id: "cost", claim: "…and $1,200 a month", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { idgen: "shuffled", store: "sqlr", cache: true, redirect: "302" }, metric: "costMonth" }, expect: { min: 1200, max: 1200 } },
    { id: "counter", claim: "A plain counter can be counted through", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { idgen: "counter" }, metric: "guessable" }, expect: { min: 1 } },
    { id: "collide", claim: "Random codes collide on 0.17% of inserts after five years", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { idgen: "random" }, metric: "collisionRetry" }, expect: { min: 0.0016, max: 0.0018 } },
    { id: "301", claim: "A 301 hides visits from analytics", run: "lab", params: { model: "urlshort-lab", config: URLC, values: { redirect: "301" }, metric: "analyticsAccurate" }, expect: { max: 0 } },
  ],
});
