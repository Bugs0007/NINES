import { definePack } from "../define";

export const VER = { start: { strategy: "datepin", window: 24 } };
export const VER_CHALLENGE = {};

const STRIPE_VER = { id: "stripe-versioning", title: "Stripe Blog: APIs as infrastructure, future-proofing Stripe with versioning", url: "https://stripe.com/blog/api-versioning" };
const AIP180 = { id: "google-aip-180", title: "Google API Improvement Proposals, AIP-180: Backwards compatibility", url: "https://google.aip.dev/180" };
const SEMVER = { id: "semver", title: "Semantic Versioning 2.0.0", url: "https://semver.org/" };

export default definePack({
  id: "api-versioning",
  title: "API Versioning",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "partners · 312 integrations failing since the deploy", detail: "field 'amount' renamed to 'total'" },
    lines: [
      { speaker: "kabir", line: "We renamed one field to tidy up the API. Three hundred partner integrations broke at once, and half of them are maintained by one person who is on holiday." },
      { speaker: "meera", line: "Your clients will not upgrade on your schedule. A versioning plan decides who pays for that gap: you, or them." },
    ],
  },
  predictions: [
    {
      id: "slow-upgrade",
      kind: "choice",
      prompt: "Clients take a median of 9 months to upgrade, and the slowest tenth take over 30 months. You keep each old major version for 24 months. What share of integrations break at sunset?",
      options: [
        { id: "none", label: "None: 24 months is generous" },
        { id: "three", label: "About 3%" },
        { id: "quarter", label: "About 25%" },
        { id: "half", label: "About half" },
      ],
      answer: "three",
      observe: "broke-clients",
      reveal: {
        text: "Upgrade times have a long tail. With a median of 9 months and a 90th percentile of 30, about 3% of a thousand integrations, thirty, are still on the old version at 24 months. They are often the ones nobody is watching, and they call you when it breaks.",
        derived: true,
        line: { speaker: "meera", line: "A deadline does not move anyone who is not looking at their calendar." },
      },
    },
    {
      id: "additive",
      kind: "choice",
      prompt: "You decide never to break anyone: only add fields, never remove or change. After a few years, what is the cost?",
      options: [
        { id: "free", label: "Nothing: this is free" },
        { id: "blocked", label: "Needed changes get blocked, and old cruft piles up" },
        { id: "slow", label: "Every response gets slower" },
      ],
      answer: "blocked",
      observe: "blocked",
      reveal: {
        text: "Nothing breaks, and nothing can be fixed. A misnamed field, a wrong type or a dangerous default stays forever, and each year some needed changes, about three in the lab, cannot be made. Compatibility is bought with an API that only ever gets bigger.",
        derived: true,
        line: { speaker: "rao", line: "No version bill, and a design debt that keeps compounding." },
      },
    },
  ],
  widget: { id: "apiversion-lab", config: VER },
  mechanism: [
    {
      id: "breaking",
      scene: "breaking",
      text: "A breaking change alters something existing clients rely on: removing or renaming a field, changing a type or meaning, or tightening validation. Adding an optional field or a new endpoint is not breaking. The rule of thumb is that old clients, unchanged, must keep working.",
      sourceIds: ["google-aip-180", "semver"],
    },
    {
      id: "urls",
      scene: "urls",
      text: "Versioning in the URL, /v1 and /v2, lets old and new live side by side. You keep each major version running for a deprecation window and then switch it off. The clients that have not upgraded by then break, and every live version is code you still maintain and secure.",
      sourceIds: ["semver", "stripe-versioning"],
    },
    {
      id: "additive",
      text: "Evolving additively avoids versions entirely: only add, never remove or reinterpret, and clients ignore fields they do not know (the tolerant reader). It suits slow-moving APIs. The cost is an interface that can never be cleaned up, and some changes that simply cannot be made.",
      sourceIds: ["google-aip-180"],
      derived: true,
    },
    {
      id: "datepin",
      scene: "datepin",
      text: "Stripe pins each account to the API version, a date, on which it first called. A chain of small compatibility transformations turns the current internal shape into any older version a client expects. Old clients keep working for years, with one cost: each release adds a transformation to maintain.",
      sourceIds: ["stripe-versioning"],
    },
  ],
  challenges: [
    {
      id: "migration",
      title: "Plan the migration",
      brief: "1,000 integrations, a breaking change every year. Choose a strategy so at most 2% of integrations break, the maintenance cost is no more than 1.5 engineers, and no needed change is blocked.",
      line: { speaker: "rao", line: "Every version we keep alive is an engineer who is not building something new." },
      widget: { id: "apiversion-lab", config: VER_CHALLENGE },
      conditions: [
        { metric: "brokenPct", op: "<=", value: 0.02, label: "At most 2% of integrations broken" },
        { metric: "costFTE", op: "<=", value: 1.5, label: "At most 1.5 engineers to maintain" },
        { metric: "blockedPerYear", op: "<=", value: 0, label: "No needed change blocked" },
      ],
      stars: [],
      hints: [
        "What window would URL versions need to keep 98% of integrations safe?",
        "What does that many live versions cost in engineers?",
        "Which approach keeps old shapes alive without keeping old code alive?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare ways to ship breaking changes to an API with many slow-upgrading clients.",
    rubric: [
      { id: "urls", criterion: "URL versions keep old and new side by side for a window, but laggards break at sunset and each version costs maintenance", keyIdea: "URL versions and sunsets" },
      { id: "additive", criterion: "Additive-only evolution never breaks clients but blocks some changes and accumulates cruft", keyIdea: "additive cruft" },
      { id: "compat", criterion: "Pinning clients to a version with a compatibility layer keeps them working with a cost that grows slowly", keyIdea: "pin and translate" },
    ],
    exemplar:
      "With URL versions, old and new run side by side for a deprecation window, but the slowest clients, often a few percent, break at sunset and every live version is code to maintain. Additive-only evolution never breaks anyone, but it blocks changes that need removal and the API fills with cruft. Pinning each client to a version and translating between versions with a compatibility layer keeps old clients working for years, for a modest ongoing cost per release.",
  },
  reviews: [
    {
      id: "av-est",
      format: "estimate",
      scenario: "You keep 4 live major versions, each costing half an engineer to maintain. How many engineers is that?",
      unit: "engineers",
      answer: 2,
      acceptFactor: 1.05,
      breakdown: ["4 versions × 0.5", "= 2 engineers"],
      explain: "Every live version needs fixes, security patches and tests, so the cost grows with how many you keep.",
    },
    {
      id: "av-pick",
      format: "pick-fix",
      scenario: "Which of these changes to a JSON response is safe without a new version?",
      options: [
        { id: "a", label: "Add a new optional field" },
        { id: "b", label: "Rename 'amount' to 'total'" },
        { id: "c", label: "Change 'amount' from a number to a string" },
        { id: "d", label: "Remove a deprecated field" },
      ],
      answer: "a",
      explain: "Clients that ignore unknown fields do not notice an addition. Renames, type changes and removals break anyone who relied on the old shape.",
    },
    {
      id: "av-order",
      format: "order",
      scenario: "Order these windows for keeping an old major version by share of integrations broken at sunset, most first.",
      items: [
        { id: "m12", label: "12 months" },
        { id: "m24", label: "24 months" },
        { id: "m36", label: "36 months" },
      ],
      answer: ["m12", "m24", "m36"],
      explain: "The longer the window, the more of the long upgrade tail is covered, with diminishing returns.",
    },
    {
      id: "av-graph",
      format: "predict-graph",
      scenario: "As you extend the support window for an old major version from 6 to 60 months, how does the share of integrations broken at sunset change?",
      xLabel: "support window →",
      yLabel: "broken at sunset",
      options: [
        { id: "fall", label: "Falls steeply at first, then slowly: a long tail", points: [75, 45, 29, 10, 3, 0.4, 0.05, 0.01] },
        { id: "linear", label: "Falls in a straight line to zero", points: [90, 77, 64, 51, 38, 25, 12, 0] },
        { id: "flat", label: "Stays the same", points: [30, 30, 30, 30, 30, 30, 30, 30] },
      ],
      answer: "fall",
      explain: "Upgrade times are long-tailed, so each extra year catches fewer stragglers than the last.",
    },
    {
      id: "av-flaw",
      format: "spot-flaw",
      scenario: "A team renames a field 'for consistency' in the existing endpoint, with a changelog entry. Partner integrations break the next day. Tap the step that skipped a compatibility plan.",
      diagram: {
        nodes: [
          { id: "change", label: "rename field in /orders", kind: "server", col: 0, row: 1 },
          { id: "deploy", label: "deploy to all clients at once", kind: "lb", col: 1, row: 1 },
          { id: "partners", label: "partner integrations", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "change", to: "deploy" },
          { from: "deploy", to: "partners" },
        ],
      },
      answer: "deploy->partners",
      explain: "A breaking change shipped to every client at once leaves no time to adapt. Ship it behind a version or a compatibility layer, and let clients move when ready.",
    },
    {
      id: "av-explain",
      format: "explain",
      scenario: "In two sentences: why does supporting many versions cost more than it appears?",
      rubric: [
        { id: "work", criterion: "Every version needs bug fixes, security patches, tests and documentation for as long as it lives" },
        { id: "branches", criterion: "Old behaviour spreads through the code as branches, which slow every future change" },
      ],
      exemplar: "Each live version needs its own fixes, security patches, tests and documentation for as long as it exists. Old behaviour also spreads through the code as special cases, which slows every later change.",
      explain: "Versions are a standing cost, not a one-off.",
    },
  ],
  codex: {
    oneLiner: "Never break old clients unannounced. URL versions need sunsets; additive-only blocks change; pinning plus a compatibility layer lets everyone move at their pace.",
    keyNumbers: [
      { label: "Integrations still on an old version at 24 months (median 9, p90 30)", value: "about 3%", sourceId: "stripe-versioning" },
      { label: "Safe changes", value: "adding optional fields and endpoints", sourceId: "google-aip-180" },
    ],
    tradeoffs: [
      { choice: "URL versions", gain: "Clear, explicit, easy to route", cost: "Laggards break at sunset; each version is a code base" },
      { choice: "Additive only", gain: "Nobody breaks", cost: "Mistakes stay forever; changes blocked" },
      { choice: "Date-pinned with compatibility layer", gain: "Clients upgrade on their own schedule", cost: "A transformation per release to maintain" },
    ],
    seenIn: ["Stripe's date-based API versions.", "Google APIs' compatibility rules in AIP-180."],
    interviewAngle: "Say: 'additive where possible, explicit versions for the rest, a deprecation window set from real upgrade data, and measure who is still on the old one'.",
    aws: [{ concept: "Stages and versioned API deployments", service: "API Gateway" }],
    replay: { id: "apiversion-lab", config: VER, scene: "datepin" },
  },
  interview: [
    "How do you roll out a breaking API change?",
    "What counts as a breaking change?",
    "How long should you support an old API version?",
  ],
  deeper: [
    {
      title: "Measure, then sunset",
      body: "Log the version each client uses and which fields they send. Before switching a version off, contact the callers still on it; most deprecations that go wrong do so because nobody knew who the stragglers were. Brownouts help too: switch the old version off for a few minutes in advance so any forgotten integration fails loudly and early.",
      sourceIds: ["stripe-versioning"],
    },
  ],
  honestPhysics: [
    "An API with 1,000 integrations and a breaking change each year. Clients' upgrade time is lognormal with a median of 9 months and a 90th percentile of 30. A breaking change with no versioning breaks everyone still on the old behaviour: everyone, here.",
    "URL versions keep each major version for the support window; clients not upgraded by sunset break, and each live version costs half an engineer. Additive-only evolution blocks 3 needed changes a year and costs 1.2 engineers by year five. A date-pinned scheme with a compatibility layer costs 0.5 plus 0.1 for each release kept, 1.0 after five years.",
    "Costs are round figures for comparison, not budgets.",
  ],
  sources: [STRIPE_VER, AIP180, SEMVER],
  verify: [
    { id: "breaking", claim: "A breaking change with no versioning breaks everyone on the old behaviour", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "breaking" }, metric: "brokenPct" }, expect: { min: 1, max: 1 } },
    { id: "urls24", claim: "A 24-month window breaks about 3%", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "urls", window: 24 }, metric: "brokenPct" }, expect: { min: 0.025, max: 0.035 } },
    { id: "urls24-cost", claim: "…for 1.5 engineers", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "urls", window: 24 }, metric: "costFTE" }, expect: { min: 1.5, max: 1.5 } },
    { id: "urls36-cost", claim: "A 36-month window costs 2 engineers", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "urls", window: 36 }, metric: "costFTE" }, expect: { min: 2, max: 2 } },
    { id: "additive", claim: "Additive-only blocks 3 changes a year", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "additive" }, metric: "blockedPerYear" }, expect: { min: 3, max: 3 } },
    { id: "datepin", claim: "Date pinning breaks nobody and costs 1.0", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "datepin" }, metric: "costFTE" }, expect: { max: 1.5 } },
    { id: "datepin-broken", claim: "…with nobody broken", run: "lab", params: { model: "apiversion-lab", config: VER_CHALLENGE, values: { strategy: "datepin" }, metric: "brokenPct" }, expect: { max: 0 } },
  ],
});
