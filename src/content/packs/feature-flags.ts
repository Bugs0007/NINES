import { definePack } from "../define";

export const FLAG = { start: { pct: 1, prop: "stream", expiry: true } };
export const FLAG_CHALLENGE = {};

const FOWLER_FLAGS = { id: "fowler-toggles", title: "P. Hodgson (2017), Feature Toggles (aka Feature Flags), martinfowler.com", url: "https://martinfowler.com/articles/feature-toggles.html" };
const OPENFEATURE = { id: "openfeature", title: "OpenFeature: an open standard for feature flag management", url: "https://openfeature.dev/" };
const SRE_CANARY = { id: "sre-workbook-canary", title: "Google SRE Workbook, ch. 16: Canarying Releases", url: "https://sre.google/workbook/canarying-releases/" };

export default definePack({
  id: "feature-flags",
  title: "Feature Flags",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "checkout · new payment flow failing for users in the rollout", detail: "flag on for 100%, off switch takes 5 minutes to reach servers" },
    lines: [
      { speaker: "kabir", line: "The new payment flow was behind a flag we turned on for everyone at once. It was broken, and turning it off took five minutes to reach the servers." },
      { speaker: "meera", line: "A flag separates deploying code from releasing it. It only helps if the roll-out is small and the off switch is fast." },
    ],
  },
  predictions: [
    {
      id: "exposure",
      kind: "choice",
      prompt: "A broken flag is on for 100% of users and servers poll for changes every 5 minutes. Spotting the problem takes about a minute and the off switch takes up to 5 minutes. What share of active users hit the bug?",
      options: [
        { id: "few", label: "About 5%" },
        { id: "half", label: "About half" },
        { id: "all", label: "All of them" },
      ],
      answer: "all",
      observe: "wide-exposure",
      reveal: {
        text: "The flag is on for everyone and the problem lives for over six minutes, longer than the five-minute window in which users are active, so effectively everyone who is active hits it. A flag at 1% with a streamed off switch exposes about 0.2%.",
        derived: true,
        line: { speaker: "meera", line: "A flag at 100% is just a deploy with extra steps." },
      },
    },
    {
      id: "debt",
      kind: "choice",
      prompt: "A team adds about 50 flags a year and never removes them. After a year, how many are still in the code past their useful life?",
      options: [
        { id: "few", label: "A handful" },
        { id: "half", label: "About half" },
        { id: "all", label: "Nearly all 50" },
      ],
      answer: "all",
      observe: "stale",
      reveal: {
        text: "Nobody owns removing a flag once the launch is over, and the cost of leaving it is invisible, so they pile up. Every live flag doubles the number of combinations the code can run in, and old flags hide dead branches. Giving each flag an owner and an expiry date, enforced, cuts the debt to a handful.",
        derived: true,
        line: { speaker: "rao", line: "A flag is a loan. Somebody has to pay it back." },
      },
    },
  ],
  widget: { id: "flag-lab", config: FLAG },
  mechanism: [
    {
      id: "decouple",
      text: "A feature flag is a runtime switch around a piece of code. It lets you deploy code switched off, then release it by changing configuration, to a few users first or to everyone, without another deploy. Releasing becomes a business decision that engineers can make safely and reverse quickly.",
      sourceIds: ["fowler-toggles", "openfeature"],
    },
    {
      id: "rollout",
      scene: "rollout",
      text: "A percentage rollout turns the flag on for a stable slice of users: 1%, then 5%, 25%, and everyone, checking metrics at each step. Hash the user id so a person always gets the same answer. The smaller the first step, the fewer users meet a bug while you are still finding out.",
      sourceIds: ["fowler-toggles", "sre-workbook-canary"],
    },
    {
      id: "kill",
      scene: "kill",
      text: "The kill switch is the flag turned off, and its value is how fast it works. If servers poll every five minutes, the bug runs for five more. Streaming flag changes, or polling every few seconds, makes the switch take effect in seconds. Test the off path as carefully as the on path.",
      sourceIds: ["fowler-toggles"],
    },
    {
      id: "debt",
      scene: "debt",
      text: "Flags are temporary or permanent. Release flags should be removed once the rollout is complete; permanent ones, like operational switches and entitlements, should be named as such. Give every flag an owner and an expiry date, and fail the build when one expires, or the code fills with dead branches.",
      sourceIds: ["fowler-toggles"],
    },
  ],
  challenges: [
    {
      id: "rollout-plan",
      title: "Plan the rollout",
      brief: "A new feature may be broken, and noticing takes about a minute of metrics. Choose the starting share, how flag changes reach servers, and whether flags expire, so at most 0.5% of users are hit by a bad flag, the kill switch works within 30 seconds, and no more than 10 stale flags build up a year.",
      line: { speaker: "kabir", line: "Start small, switch off fast, and clean up afterwards." },
      widget: { id: "flag-lab", config: FLAG_CHALLENGE },
      conditions: [
        { metric: "exposedPct", op: "<=", value: 0.005, label: "At most 0.5% of users hit a bad flag" },
        { metric: "killS", op: "<=", value: 30, label: "Kill switch within 30 seconds" },
        { metric: "staleFlags", op: "<=", value: 10, label: "At most 10 stale flags a year" },
      ],
      stars: [{ metric: "exposedPct", op: "<=", value: 0.0025, label: "At most 0.25% hit" }],
      hints: [
        "What share of users is exposed at the start, and for how long?",
        "How long does a polled change take to reach every server?",
        "What stops flags from piling up?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how feature flags make releases safer and what they cost.",
    rubric: [
      { id: "decouple", criterion: "Flags separate deploying code from releasing it, so a feature can be switched on gradually and off quickly", keyIdea: "deploy is not release" },
      { id: "rollout", criterion: "Roll out to a small share first, with a fast kill switch, so a bad flag hurts few users for a short time", keyIdea: "small share, fast switch" },
      { id: "debt", criterion: "Flags accumulate as dead branches, so give them owners and expiry dates and remove them", keyIdea: "flag debt" },
    ],
    exemplar:
      "Flags separate deploying code from releasing it, so I can ship the code switched off and turn it on gradually. I would start with a small share of users, check metrics at each step, and make the kill switch fast, by streaming flag changes or polling every few seconds, so a bad flag hurts few users for little time. The cost is flag debt: every old flag leaves dead branches and extra combinations, so each one needs an owner and an expiry date.",
  },
  reviews: [
    {
      id: "ff-est",
      format: "estimate",
      scenario: "A flag is on for 2% of users. It takes 60 seconds to spot a problem and 30 seconds for the off switch to reach servers. If active users turn over every 5 minutes, about what share of users hit the bug? (2% × 90 s ÷ 300 s)",
      unit: "%",
      answer: 0.6,
      acceptFactor: 1.1,
      breakdown: ["bug lives 60 + 30 = 90 seconds", "90 ÷ 300 = 0.3 of the active window", "2% × 0.3 = 0.6%"],
      explain: "Exposure is the share on the flag times the fraction of the window in which the problem is live.",
    },
    {
      id: "ff-pick",
      format: "pick-fix",
      scenario: "A flag service goes down and every server defaults all flags to 'on', turning on half-finished features. What should the default have been?",
      options: [
        { id: "a", label: "Each flag has a safe default (usually off), and servers keep the last known values" },
        { id: "b", label: "Fail the request" },
        { id: "c", label: "Default every flag to on so features are visible" },
        { id: "d", label: "Retry the flag service forever" },
      ],
      answer: "a",
      explain: "When the flag system is unreachable, servers should run on their last known values and fall back to a defined safe default per flag.",
    },
    {
      id: "ff-order",
      format: "order",
      scenario: "Order these kill-switch propagation methods by how long a bug keeps running after you flip the flag off, longest first.",
      items: [
        { id: "poll5", label: "Poll every 5 minutes" },
        { id: "poll30", label: "Poll every 30 seconds" },
        { id: "stream", label: "Streamed updates" },
      ],
      answer: ["poll5", "poll30", "stream"],
      explain: "Propagation delay is up to the poll interval, or a couple of seconds when pushed.",
    },
    {
      id: "ff-graph",
      format: "predict-graph",
      scenario: "A broken flag is detected after about a minute with a streamed kill switch. As the share of users on the flag grows from 0.1% to 100%, how does the share of users hit by the bug change?",
      xLabel: "share of users on the flag →",
      yLabel: "users hit",
      options: [
        { id: "linear", label: "Rises in proportion to the share", points: [0.02, 0.07, 0.2, 0.7, 2, 6.9, 20, 100] },
        { id: "flat", label: "Stays the same", points: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: "step", label: "Zero until 50%, then everything", points: [0, 0, 0, 0, 0, 0, 100, 100] },
      ],
      answer: "linear",
      explain: "While the problem is live, exposure is proportional to the share on the flag, which is why the first step should be small.",
    },
    {
      id: "ff-flaw",
      format: "spot-flaw",
      scenario: "A team has 40 permanent-looking flags from launches long ago. A refactor accidentally changes the behaviour of one dead branch, and a rare combination of three old flags breaks checkout. Tap the root cause.",
      diagram: {
        nodes: [
          { id: "launch", label: "feature launched, flag left in code", kind: "server", col: 0, row: 1 },
          { id: "years", label: "years pass, 40 flags accumulate", kind: "queue", col: 1, row: 1 },
          { id: "combo", label: "rare flag combination breaks checkout", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "launch", to: "years" },
          { from: "years", to: "combo" },
        ],
      },
      answer: "launch->years",
      explain: "The flag was never removed after the rollout finished. Each leftover flag multiplies the states the code can be in, until an untested combination fails.",
    },
    {
      id: "ff-explain",
      format: "explain",
      scenario: "In two sentences: why should a user always get the same flag value?",
      rubric: [
        { id: "consistent", criterion: "Flipping between old and new behaviour on each request confuses users and corrupts experiments" },
        { id: "hash", criterion: "Hash a stable id such as the user id so the same user always lands in the same bucket" },
      ],
      exemplar: "If the flag changed between requests a user would see the product flip between versions, and any experiment would be meaningless. Hashing a stable id, such as the user id, puts each user in the same bucket every time.",
      explain: "Stable assignment keeps the experience coherent.",
    },
  ],
  codex: {
    oneLiner: "Flags separate deploy from release. Roll out to a small hashed slice, keep the kill switch fast, and give flags expiry dates.",
    keyNumbers: [
      { label: "Users hit by a bad flag", value: "share on × fraction of the window the bug is live", sourceId: "fowler-toggles" },
      { label: "Combinations with n independent flags", value: "2^n", sourceId: "fowler-toggles" },
    ],
    tradeoffs: [
      { choice: "Percentage rollout", gain: "Small blast radius; real traffic", cost: "Slower release; metrics needed" },
      { choice: "Streamed flags", gain: "Seconds to switch off", cost: "A flag service to run" },
      { choice: "Many long-lived flags", gain: "Flexibility", cost: "Dead branches and untested combinations" },
    ],
    seenIn: ["LaunchDarkly, Unleash, Flagsmith and the OpenFeature standard.", "Operational kill switches for dependencies."],
    interviewAngle: "Say: 'flags decouple deploy from release; start at 1%, stream changes for a seconds-long kill switch, and expire every release flag'.",
    aws: [{ concept: "Feature flags and gradual rollout", service: "AWS AppConfig" }],
    replay: { id: "flag-lab", config: FLAG, scene: "kill" },
  },
  interview: [
    "What is a feature flag and what is it good for?",
    "How do you roll out a flag safely?",
    "What are the downsides of feature flags?",
  ],
  deeper: [
    {
      title: "Four kinds of flag",
      body: "Hodgson separates release flags, short-lived switches around unfinished features; experiment flags, which split users for A/B tests; ops flags, kill switches for risky dependencies; and permission flags, which gate paid features. They differ in lifetime and who flips them, so treat them differently: release flags must expire, and permission flags are really entitlements.",
      sourceIds: ["fowler-toggles"],
    },
  ],
  honestPhysics: [
    "A new feature behind a flag is broken. It is on for the share of users you set. Noticing needs at least a minute, and at 2,000 requests a second it takes 400 flagged requests. The change then reaches servers in 300 seconds if they poll every 5 minutes, 30 if every 30 seconds, 2 if streamed.",
    "Users hit = share on × the fraction of a five-minute activity window that the problem was live, at most the share on. Without enforcement 50 flags a year go stale; with owners and expiry dates, about 5.",
    "Round figures for comparison.",
  ],
  sources: [FOWLER_FLAGS, OPENFEATURE, SRE_CANARY],
  verify: [
    { id: "all", claim: "A flag at 100% with a 5-minute poll hits every active user", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { pct: 100, prop: "poll5m" }, metric: "exposedPct" }, expect: { min: 1, max: 1 } },
    { id: "small", claim: "A flag at 1% with streamed changes exposes about 0.2% of users", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { pct: 1, prop: "stream", expiry: true }, metric: "exposedPct" }, expect: { max: 0.003 } },
    { id: "slow-kill", claim: "A 1% flag with a 5-minute poll hits 1%", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { pct: 1, prop: "poll5m" }, metric: "exposedPct" }, expect: { min: 0.01 } },
    { id: "ten", claim: "A 10% flag exposes over 2% even with streaming", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { pct: 10, prop: "stream" }, metric: "exposedPct" }, expect: { min: 0.02 } },
    { id: "kill-stream", claim: "Streaming switches off in 2 seconds", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { prop: "stream" }, metric: "killS" }, expect: { max: 2 } },
    { id: "stale", claim: "Without expiry, 50 flags go stale in a year", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { expiry: false }, metric: "staleFlags" }, expect: { min: 50 } },
    { id: "stale-fixed", claim: "With expiry, about 5", run: "lab", params: { model: "flag-lab", config: FLAG_CHALLENGE, values: { expiry: true }, metric: "staleFlags" }, expect: { max: 10 } },
  ],
});
