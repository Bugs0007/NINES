import { defineBoss } from "../define";

export const RLC = {};

const STRIPE_LIM = { id: "stripe-limiters", title: "Stripe Engineering: Scaling your API with rate limiters", url: "https://stripe.com/blog/rate-limiters" };
const ENVOY_GRL = { id: "envoy-grl", title: "Envoy docs: Global rate limiting (a central service consulted by many proxies)", url: "https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting" };
const CF_COUNT = { id: "cf-counting", title: "Cloudflare: How we built rate limiting capable of scaling to millions of domains", url: "https://blog.cloudflare.com/counting-things-a-lot-of-different-things/" };

export default defineBoss({
  id: "case-rate-limiter",
  title: "Case: Distributed Rate Limiter",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "api · a client sent 18,000 requests a minute against a limit of 1,000", detail: "20 instances each counting on their own" },
    lines: [{ speaker: "kabir", line: "Our limit is a thousand requests a minute per client and one client sent eighteen thousand. Each of the twenty servers thought it was the only one counting." }],
  },
  intro: [
    { speaker: "meera", line: "A limiter shared by twenty servers needs shared state, and shared state costs latency and can fail." },
    { speaker: "rao", line: "Decide what happens when the shared state is gone. That is the design, not a footnote." },
  ],
  forecast: {
    metric: "overshoot",
    prompt: "With each of 20 instances counting in its own memory, how many times the limit can a client reach by spreading requests across them?",
    unit: "× the limit",
    scale: 1,
    min: 1,
    max: 100,
    tolerance: 1.3,
  },
  exercises: ["rate-limiting", "cache-aside", "consistent-hashing"],
  challenge: {
    id: "design-limiter",
    title: "Design the limiter",
    brief: "Hold clients to 1.25 times the limit or less, add at most 2 ms of latency, stay 99.9% available when Redis is down, and keep the limit within 2× during that outage.",
    line: { speaker: "meera", line: "Accuracy, speed and failure behaviour pull in different directions." },
    widget: { id: "dlimiter-lab", config: RLC },
    conditions: [
      { metric: "overshoot", op: "<=", value: 1.25, label: "At most 1.25× the limit" },
      { metric: "addedMs", op: "<=", value: 2, label: "At most 2 ms added" },
      { metric: "outageAvailability", op: ">=", value: 0.999, label: "99.9% available when Redis is down" },
      { metric: "outageOvershoot", op: "<=", value: 2, label: "At most 2× the limit during the outage" },
    ],
    stars: [],
    hints: ["What does a strict central counter cost per request?", "Which failure mode keeps the API up?", "What can protect you while the shared state is gone?"],
  },
  debrief: [
    { id: "local", text: "Local counters let a client multiply its limit by the number of instances it reaches: 20 times here. Any shared limit needs a shared count, or counts that are merged often enough.", derived: true },
    { id: "sync", text: "A strict central increment per request is exact and adds 3.4 ms. Counting locally and syncing every second keeps the fast path in memory, adds 0.2 ms and accepts about 20% overshoot, the accuracy most limits can live with.", sourceIds: ["stripe-limiters", "cf-counting"] },
    { id: "fail", text: "Failing closed turns a Redis outage into an API outage. Failing open turns it into no limit at all. Falling back to local counters with the limit divided across instances keeps the API up and bounds the damage to about 1.5 times the limit.", sourceIds: ["envoy-grl"] },
  ],
  outro: { speaker: "kabir", line: "Central Redis, counts synced every second, fail open with local counters as a fallback. The limit holds, and so does the API when Redis does not." },
  explainBack: {
    prompt: "Design a distributed rate limiter and explain how it behaves when the shared store fails.",
    rubric: [
      { id: "shared", criterion: "Counts must be shared (a central store or merged counts); per-instance counters multiply the limit by the number of instances", keyIdea: "shared state" },
      { id: "latency", criterion: "A strict central update per request adds a round trip; local counting with periodic sync trades a little accuracy for speed", keyIdea: "accuracy versus latency" },
      { id: "fail", criterion: "Decide failure behaviour: fail open keeps the API up, fail closed stops it; fall back to local counters to bound the overshoot", keyIdea: "failure mode" },
    ],
    exemplar:
      "The counts have to be shared, because twenty instances counting alone let a client send twenty times the limit. I would keep a central counter in Redis and have instances count locally and sync every second, which adds 0.2 milliseconds and allows about 20 percent overshoot, instead of paying 3.4 milliseconds for a strict update on every request. When Redis is down I would fail open so the API stays up, and fall back to local counters with the limit split across instances so the overshoot stays near one and a half times.",
  },
  honestPhysics: [
    "An API behind 20 instances enforces 1,000 requests a minute per client. Local counters allow up to 20×; a central Redis counter 1× at 1.2 ms per request; local counts synced every second about 1.2× at 0.2 ms; a strictly serialised counter 1× at 3.4 ms.",
    "When Redis fails, failing closed rejects everything and failing open removes the limit (100× in the lab); falling back to local counters bounds it to about 1.5×. Round figures.",
  ],
  sources: [STRIPE_LIM, ENVOY_GRL, CF_COUNT],
  verify: [
    { id: "forecast", claim: "Local counters let a client reach 20× the limit", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: {}, metric: "overshoot" }, expect: { min: 20, max: 20 } },
    { id: "strict", claim: "A strict counter is exact and adds 3.4 ms", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: { store: "central", sync: "strict" }, metric: "addedMs" }, expect: { min: 3.4, max: 3.4 } },
    { id: "periodic", claim: "Synced counts add 0.2 ms with 20% overshoot", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: { store: "central", sync: "periodic" }, metric: "overshoot" }, expect: { min: 1.2, max: 1.2 } },
    { id: "closed", claim: "Failing closed makes the API unavailable in an outage", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: { store: "central", sync: "periodic", fail: "closed" }, metric: "outageAvailability" }, expect: { max: 0 } },
    { id: "open", claim: "Failing open removes the limit: 100×", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: { store: "central", sync: "periodic", fail: "open", fallback: false }, metric: "outageOvershoot" }, expect: { min: 100, max: 100 } },
    { id: "good", claim: "A local fallback bounds the outage overshoot to 1.5×", run: "lab", params: { model: "dlimiter-lab", config: RLC, values: { store: "central", sync: "periodic", fail: "open", fallback: true }, metric: "outageOvershoot" }, expect: { min: 1.5, max: 1.5 } },
  ],
});
