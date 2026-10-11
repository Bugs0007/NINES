import { definePack } from "../define";

export const DEG = { start: { optional: "fallback", shed: true } };
export const DEG_CHALLENGE = {};

const BUILDERS_SHED = { id: "builders-load-shedding", title: "Amazon Builders' Library: Using load shedding to avoid overload", url: "https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/" };
const SRE_OVERLOAD = { id: "sre-book-overload", title: "Google SRE Book, ch. 21: Handling Overload (graceful degradation)", url: "https://sre.google/sre-book/handling-overload/" };
const SRE_CASCADE = { id: "sre-cascading", title: "Google SRE Book, ch. 22: Addressing Cascading Failures", url: "https://sre.google/sre-book/addressing-cascading-failures/" };

export default definePack({
  id: "graceful-degradation",
  title: "Graceful Degradation",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "product page · 33% of requests failing at 1.5× normal load", detail: "recommendations service is slow, the page waits for it" },
    lines: [
      { speaker: "kabir", line: "A sale doubled traffic and the recommendations service slowed down. The product page waits for it, so the whole page fails when it only needs to show the product." },
      { speaker: "meera", line: "Not everything on a page is the page. Decide what the page cannot live without, and let the rest fail quietly." },
    ],
  },
  predictions: [
    {
      id: "brittle",
      kind: "choice",
      prompt: "The product page needs payment (99.99%) and inventory (99.97%) and also shows recommendations (99%), reviews (99%) and a banner (98%). If all five are required, how often does the page load?",
      options: [
        { id: "9996", label: "About 99.96%" },
        { id: "99", label: "About 99%" },
        { id: "96", label: "About 96%" },
        { id: "90", label: "About 90%" },
      ],
      answer: "96",
      observe: "brittle",
      reveal: {
        text: "Multiply the five availabilities: 0.9999 × 0.9997 × 0.99 × 0.99 × 0.98 = 0.960. The three nice-to-haves, each 'pretty reliable', pull the page from 99.96% down to 96%, which is four failed loads in every hundred. Required dependencies multiply.",
        derived: true,
        line: { speaker: "meera", line: "Every dependency you cannot live without is a chance for the page to die." },
      },
    },
    {
      id: "cascade",
      kind: "choice",
      prompt: "Load rises to 1.5× what the fleet handles. The page does all its work for every request. What share of requests does it serve?",
      options: [
        { id: "all", label: "All of them, a little slower" },
        { id: "two-thirds", label: "About two thirds" },
        { id: "half", label: "About half" },
        { id: "none", label: "Almost none, as retries pile up" },
      ],
      answer: "two-thirds",
      observe: "cascade",
      reveal: {
        text: "The fleet can do one unit of work and is asked for 1.5, so it serves 1 ÷ 1.5 = 67% of requests, and the rest wait or fail. In practice it can be worse, since waiting requests hold resources. Switching off optional parts makes each page cost 0.55, and capacity then covers everyone.",
        derived: true,
        line: { speaker: "rao", line: "A simpler page for everyone beats a full page for two out of three." },
      },
    },
  ],
  widget: { id: "degrade-lab", config: DEG },
  mechanism: [
    {
      id: "critical",
      text: "Split what the user came for from what decorates it. Payment and inventory are critical: without them the page cannot do its job. Recommendations, reviews and banners are optional. Graceful degradation means a failure of the optional parts makes the page less rich, not unavailable.",
      sourceIds: ["sre-book-overload"],
    },
    {
      id: "fallback",
      scene: "fallback",
      text: "For each optional dependency, decide what happens when it fails: show a cached or default value, such as popular products instead of personalised ones, or hide the section. Use a short timeout and a circuit breaker, so a slow dependency costs little time. Test the fallback path; it is the one that runs during incidents.",
      sourceIds: ["sre-cascading"],
    },
    {
      id: "shed",
      scene: "shed",
      text: "Under overload, serve fewer features to everyone rather than errors to some. Load shedding drops work that can be skipped: optional calls, expensive options, low-priority requests. A request that is rejected early costs almost nothing, whereas one accepted and failed late wastes everything done on the way.",
      sourceIds: ["builders-load-shedding", "sre-book-overload"],
    },
    {
      id: "brownout",
      scene: "brownout",
      text: "A brownout is deliberate, partial degradation: switch off optional features at a threshold of load or errors, and switch them back on when pressure falls. Pair it with priorities: keep checkout working, then browse, then recommendations. Tell the business which pieces go first, before the incident.",
      sourceIds: ["builders-load-shedding"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "page-design",
      title: "Design the page's fallbacks",
      brief: "The page needs payment and inventory and optionally shows three other services. Choose behaviour so at least 99.9% of pages load normally, at least 99% are served at 1.5× load, and no more than 5% of normal pages show a fallback.",
      line: { speaker: "kabir", line: "Nobody abandons a cart because the reviews box was empty. They do abandon an error page." },
      widget: { id: "degrade-lab", config: DEG_CHALLENGE },
      conditions: [
        { metric: "availNormal", op: ">=", value: 0.999, label: "At least 99.9% of pages load" },
        { metric: "availOverload", op: ">=", value: 0.99, label: "At least 99% served at 1.5× load" },
        { metric: "degradedShare", op: "<=", value: 0.05, label: "At most 5% of pages show a fallback" },
      ],
      stars: [],
      hints: [
        "What happens to the page when an optional service is treated as required?",
        "What does the page cost to serve with and without its optional parts?",
        "Both settings are needed.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain graceful degradation and load shedding using a product page.",
    rubric: [
      { id: "split", criterion: "Separate critical dependencies from optional ones; optional failures should not fail the page", keyIdea: "critical versus optional" },
      { id: "fallback", criterion: "Optional parts get cached or default fallbacks with short timeouts and breakers", keyIdea: "fallbacks" },
      { id: "shed", criterion: "Under overload shed optional work so every request is served more simply rather than some failing", keyIdea: "shed load, keep serving" },
    ],
    exemplar:
      "I would separate what the page cannot live without, payment and inventory, from what only decorates it, such as recommendations, reviews and banners. Optional parts get short timeouts, circuit breakers and a cached or default fallback, so their failures make the page simpler instead of broken. Under overload I would shed the optional work first, so each request costs less and everyone gets a simpler page, rather than a full page for some and errors for the rest.",
  },
  reviews: [
    {
      id: "gd-est",
      format: "estimate",
      scenario: "A page requires two services of 99.9% and three of 99.5%, all in series. About what share of page loads succeed? (0.999² × 0.995³)",
      unit: "%",
      answer: 98.3,
      acceptFactor: 1.01,
      breakdown: ["0.999² = 0.998", "0.995³ = 0.985", "0.998 × 0.985 ≈ 0.983"],
      explain: "Availabilities multiply, so five fair services make a fairly unreliable page.",
    },
    {
      id: "gd-pick",
      format: "pick-fix",
      scenario: "During a sale the fleet is overloaded and 30% of requests time out. The page still calls five optional services for every request. What is the best immediate change?",
      options: [
        { id: "a", label: "Switch off the optional calls so each request does less work" },
        { id: "b", label: "Retry timed-out requests" },
        { id: "c", label: "Raise the timeouts" },
        { id: "d", label: "Add logging to the optional calls" },
      ],
      answer: "a",
      explain: "Retries and longer timeouts add load. Shedding optional work reduces the cost of each request, so capacity covers more of them.",
    },
    {
      id: "gd-order",
      format: "order",
      scenario: "At 1.5 times normal load, order these designs by the share of requests served, highest first.",
      items: [
        { id: "shed", label: "Fallbacks, and optional work shed under load" },
        { id: "fallback", label: "Fallbacks, but no shedding" },
        { id: "required", label: "Everything required, no shedding" },
      ],
      answer: ["shed", "fallback", "required"],
      explain: "Shedding makes each page cheap enough for everyone. Without it only two thirds are served, and a page that also requires every optional service loses a few percent more.",
    },
    {
      id: "gd-graph",
      format: "predict-graph",
      scenario: "A fleet can do one unit of work. With optional work shed so a page costs 0.55, as demand rises from 1× to 3×, how does the share of requests served change?",
      xLabel: "demand →",
      yLabel: "requests served",
      options: [
        { id: "knee", label: "Holds at 100% until about 1.8×, then falls as 1 ÷ (0.55 × demand)", points: [100, 100, 100, 100, 91, 81, 73, 61] },
        { id: "early", label: "Falls from the start as 1 ÷ demand", points: [100, 80, 67, 57, 50, 44, 40, 33] },
        { id: "flat", label: "Stays at 100%", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "knee",
      explain: "Shedding cuts the cost per request to 0.55, so capacity covers demand up to 1 ÷ 0.55 = 1.8×. Beyond that even shed pages fall short.",
    },
    {
      id: "gd-flaw",
      format: "spot-flaw",
      scenario: "The product page calls the recommendations service with a 30-second timeout. When it hangs, every page request hangs with it, and the thread pool fills. Tap the dependency that should have been treated as optional.",
      diagram: {
        nodes: [
          { id: "page", label: "product page", kind: "server", col: 0, row: 1 },
          { id: "recs", label: "recommendations (30 s timeout)", kind: "external", col: 1, row: 1 },
          { id: "pool", label: "thread pool fills", kind: "queue", col: 2, row: 1 },
        ],
        edges: [
          { from: "page", to: "recs" },
          { from: "recs", to: "pool" },
        ],
      },
      answer: "page->recs",
      explain: "An optional call with a long timeout can take the page with it. Give it a short timeout, a breaker and a fallback so the page carries on without it.",
    },
    {
      id: "gd-explain",
      format: "explain",
      scenario: "In two sentences: why test fallbacks regularly in production?",
      rubric: [
        { id: "rare", criterion: "Fallback paths run only during failures, so they are rarely exercised and often broken" },
        { id: "drill", criterion: "Deliberately switching off optional dependencies proves the page still works and the fallback is not the thing that fails" },
      ],
      exemplar: "Fallbacks only run when something is already failing, so they are rarely exercised and often broken. Switching off optional dependencies on purpose proves the page really works without them.",
      explain: "Untested fallbacks are hopes.",
    },
  ],
  codex: {
    oneLiner: "Split critical from optional. Give optional parts short timeouts, breakers and fallbacks, and shed them first under overload so every request is served.",
    keyNumbers: [
      { label: "Availability of dependencies in series", value: "the product of each", sourceId: "sre-cascading" },
      { label: "Served at 1.5× load without shedding", value: "1 ÷ 1.5 = 67%", sourceId: "builders-load-shedding" },
    ],
    tradeoffs: [
      { choice: "Required dependencies", gain: "Simplest page", cost: "Availability multiplies down" },
      { choice: "Fallbacks and hiding", gain: "Page survives optional failures", cost: "Fallback paths to build and test" },
      { choice: "Load shedding", gain: "Serves everyone under overload", cost: "Simpler pages, and a priority list to agree" },
    ],
    seenIn: ["Netflix serving popular titles when personalisation is down.", "E-commerce pages hiding reviews under load."],
    interviewAngle: "Say: 'classify dependencies as critical or optional, fall back on the optional ones, and shed optional work first under overload'.",
    aws: [{ concept: "Static stability and fallbacks to cached data", service: "CloudFront stale-if-error, Route 53 health checks" }],
    replay: { id: "degrade-lab", config: DEG, scene: "brownout" },
  },
  interview: [
    "What is graceful degradation?",
    "How do you decide which features to drop under load?",
    "What is load shedding?",
  ],
  deeper: [
    {
      title: "Static stability",
      body: "AWS describes designing so that a service keeps working when its control plane or a dependency fails, by using already-provisioned resources rather than making new calls. A page that falls back to cached data, or a fleet that never needs to launch capacity during an outage, is statically stable. It is graceful degradation applied to infrastructure.",
      sourceIds: ["builders-load-shedding"],
    },
  ],
  honestPhysics: [
    "A product page needs payment (99.99%) and inventory (99.97%). It also shows recommendations (99%), reviews (99%) and a banner (98%). Required together they give about 96%; with fallbacks for the optional three, 99.96%.",
    "Under overload at 1.5× normal load, a full page serves 1 ÷ 1.5 = 67%. Shedding the optional parts costs 0.55 of a full page, so capacity covers 1 ÷ (1.5 × 0.55) of demand, all of it.",
    "Degraded share is 1 − 0.99 × 0.99 × 0.98 of normal pages.",
  ],
  sources: [BUILDERS_SHED, SRE_OVERLOAD, SRE_CASCADE],
  verify: [
    { id: "req", claim: "Requiring all five services gives a page that loads 96% of the time", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "required" }, metric: "availNormal" }, expect: { min: 0.955, max: 0.965 } },
    { id: "fallback", claim: "Fallbacks restore 99.96%", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "fallback" }, metric: "availNormal" }, expect: { min: 0.999 } },
    { id: "over-noshed", claim: "At 1.5× load with no shedding about two thirds are served", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "fallback", shed: false }, metric: "availOverload" }, expect: { min: 0.66, max: 0.68 } },
    { id: "over-shed", claim: "Shedding serves everyone", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "fallback", shed: true }, metric: "availOverload" }, expect: { min: 0.99 } },
    { id: "degraded", claim: "About 4% of pages show a fallback", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "fallback" }, metric: "degradedShare" }, expect: { min: 0.038, max: 0.041 } },
    { id: "req-shed", claim: "Shedding without fallbacks still leaves 96%", run: "lab", params: { model: "degrade-lab", config: DEG_CHALLENGE, values: { optional: "required", shed: true }, metric: "availOverload" }, expect: { max: 0.97 } },
  ],
});
