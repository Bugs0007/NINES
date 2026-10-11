import { defineBoss } from "../define";

export const ACC = {};

const TRIE = { id: "trie", title: "Trie (prefix tree): structure and lookup cost", url: "https://en.wikipedia.org/wiki/Trie" };
const ES_SUGGEST = { id: "es-suggesters", title: "Elasticsearch docs: Suggesters (completion suggester backed by an in-memory FST)", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/search-suggesters.html" };
const ZIPF = { id: "zipf-hot", title: "Zipf's law and heavy-tailed popularity of queries", url: "https://en.wikipedia.org/wiki/Zipf%27s_law" };

export default defineBoss({
  id: "case-autocomplete",
  title: "Case: Search Autocomplete",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "search · suggestions take 600 ms after the first keystroke", detail: "100,000 lookups a second at peak; 500 servers" },
    lines: [{ speaker: "kabir", line: "Suggestions appear almost a second after the first letter, by which time the user has typed the next three. We run five hundred servers just to say 'apple'." }],
  },
  intro: [
    { speaker: "meera", line: "Autocomplete is a latency budget. You have tens of milliseconds, a hundred thousand lookups a second, and a prefix that matches millions of strings." },
    { speaker: "rao", line: "The answer for short prefixes is the same for everyone, so it should be computed before anyone asks." },
  ],
  forecast: {
    metric: "serversNeeded",
    prompt: "With a sorted array scanned for matches, serving 200 lookups a second per server, how many servers does 100,000 lookups a second need?",
    unit: "servers",
    scale: 1,
    min: 1,
    max: 5000,
    tolerance: 1.5,
  },
  exercises: ["inverted-index", "cache-aside", "estimation-memory"],
  challenge: {
    id: "design-autocomplete",
    title: "Design the suggester",
    brief: "Answer in 20 ms or less at p99, with at most 10 servers, trends no more than 60 minutes stale, and memory under 32 GB.",
    line: { speaker: "meera", line: "The ranking work moves from query time to build time." },
    widget: { id: "autocomplete-lab", config: ACC },
    conditions: [
      { metric: "p99Ms", op: "<=", value: 20, label: "Lookup p99 at most 20 ms" },
      { metric: "serversNeeded", op: "<=", value: 10, label: "At most 10 servers" },
      { metric: "freshnessMin", op: "<=", value: 60, label: "Trends at most 60 minutes stale" },
      { metric: "memoryGB", op: "<=", value: 32, label: "Under 32 GB of memory" },
    ],
    stars: [{ metric: "serversNeeded", op: "<=", value: 2, label: "At most 2 servers" }],
    hints: ["What does each lookup do after finding the prefix?", "What can be computed ahead of time?", "How often must the counts be refreshed?"],
  },
  debrief: [
    { id: "rank", text: "Finding the prefix is cheap and ranking its matches is not: a short prefix matches millions of queries. Storing the top ten completions at every trie node moves that work to build time, so a lookup is one step: 1.5 ms instead of 40 ms for a trie that ranks on demand and 600 ms for the array.", sourceIds: ["trie", "es-suggesters"] },
    { id: "mem", text: "The precomputed lists cost memory, 20 GB against 12 for the plain trie, and buy a thirty-fold speedup. Capacity per server rises from 3,000 to 50,000 lookups a second, so two servers carry what 500 did.", derived: true },
    { id: "fresh", text: "Query popularity moves quickly. Rebuilding daily shows yesterday's trends; hourly keeps them under an hour; applying updates continuously keeps them in seconds. A cache for popular prefixes absorbs 90% of traffic and adds a few minutes of staleness.", sourceIds: ["zipf-hot"] },
  ],
  outro: { speaker: "kabir", line: "A trie with the top ten stored at each node, rebuilt hourly. Two servers and a millisecond and a half." },
  explainBack: {
    prompt: "Explain how your autocomplete service answers in milliseconds at 100,000 lookups a second.",
    rubric: [
      { id: "trie", criterion: "A trie finds a prefix in time proportional to its length; the cost is ranking the matches below it", keyIdea: "trie lookup" },
      { id: "topk", criterion: "Precompute the top completions at each node so a lookup does no ranking at query time", keyIdea: "precompute top-k" },
      { id: "fresh", criterion: "Refresh counts hourly or continuously; the cache and rebuild period decide how stale trends are", keyIdea: "freshness" },
      { id: "memory", criterion: "Names the memory cost of the precomputed lists and why it is worth it", keyIdea: "memory for latency" },
    ],
    exemplar:
      "A trie finds a prefix in time proportional to its length, but ranking the millions of matches below a short prefix is slow, so I precompute the top ten completions at every node and a lookup does no ranking at all, about a millisecond and a half. That costs 20 gigabytes against 12, and it raises capacity from three thousand to fifty thousand lookups a second per server, so two servers do the work of five hundred. I would rebuild the counts hourly, accepting up to an hour of staleness for trending queries.",
  },
  honestPhysics: [
    "100 million distinct queries and 100,000 lookups a second at peak. A sorted array: p99 600 ms, 200 lookups a second per server, 4 GB. A trie ranking on demand: 40 ms, 3,000 a second, 12 GB. A trie with the top ten at each node: 1.5 ms, 50,000 a second, 20 GB.",
    "A prefix cache absorbs 90% of traffic and adds 5 minutes of staleness; it does not improve p99. Rebuilding daily leaves trends 24 hours stale, hourly 60 minutes, continuous updates seconds. Round figures.",
  ],
  sources: [TRIE, ES_SUGGEST, ZIPF],
  verify: [
    { id: "forecast", claim: "The array needs 500 servers", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: {}, metric: "serversNeeded" }, expect: { min: 500, max: 500 } },
    { id: "trie", claim: "A trie ranking on demand has a 40 ms p99", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "trie" }, metric: "p99Ms" }, expect: { min: 40, max: 40 } },
    { id: "topk", claim: "A trie with stored top ten answers in 1.5 ms", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "topk" }, metric: "p99Ms" }, expect: { min: 1.5, max: 1.5 } },
    { id: "topk-servers", claim: "…on 2 servers", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "topk" }, metric: "serversNeeded" }, expect: { min: 2, max: 2 } },
    { id: "topk-mem", claim: "…using 20 GB", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "topk" }, metric: "memoryGB" }, expect: { min: 20, max: 20 } },
    { id: "daily", claim: "A daily rebuild leaves trends 24 hours stale", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "topk", update: "daily" }, metric: "freshnessMin" }, expect: { min: 1440, max: 1440 } },
    { id: "hourly", claim: "An hourly rebuild meets the 60 minute target", run: "lab", params: { model: "autocomplete-lab", config: ACC, values: { structure: "topk", update: "hourly" }, metric: "freshnessMin" }, expect: { min: 60, max: 60 } },
  ],
});
