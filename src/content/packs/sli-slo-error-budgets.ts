import { definePack } from "../define";

export const SLO = { start: { slo: "99.9", window: "60", thr: 14 } };
export const SLO_CHALLENGE = {};

const SRE_SLO = { id: "sre-book-slo", title: "Google SRE Book, ch. 4: Service Level Objectives", url: "https://sre.google/sre-book/service-level-objectives/" };
const SRE_ALERT = { id: "sre-workbook-alerting", title: "Google SRE Workbook, ch. 5: Alerting on SLOs (burn rates, multiple windows)", url: "https://sre.google/workbook/alerting-on-slos/" };
const SRE_BUDGET = { id: "sre-book-embracing-risk", title: "Google SRE Book, ch. 3: Embracing Risk (error budgets)", url: "https://sre.google/sre-book/embracing-risk/" };

export default definePack({
  id: "sli-slo-error-budgets",
  title: "SLIs, SLOs & Error Budgets",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "pager · 40 pages this week, 3 of them real", detail: "the rest were self-healing blips" },
    lines: [
      { speaker: "kabir", line: "The pager goes off for every spike, and the team has started to ignore it. Last Thursday it missed a slow leak that ran for six hours." },
      { speaker: "meera", line: "A pager should mean the promise to customers is at risk. To say that, you first have to write the promise down as a number." },
    ],
  },
  predictions: [
    {
      id: "budget",
      kind: "choice",
      prompt: "This month had an 8-minute total outage, a 6-hour slow burn of 2% errors, and 20 one-minute spikes of 5% errors, worth 16 minutes of full outage in all. You promise 99.99%. How does the month look?",
      options: [
        { id: "fine", label: "Fine: 16 minutes is small" },
        { id: "tight", label: "Tight, about 90% of the budget" },
        { id: "over", label: "Over budget, nearly four times the 4.3 minutes allowed" },
      ],
      answer: "over",
      observe: "budget-gone",
      reveal: {
        text: "A 99.99% promise allows 0.01% × 43,200 minutes = 4.3 minutes a month. This month used 16.2, almost four times that. At 99.9% the budget is 43 minutes and the same month used 38% of it, with room to ship. The number you promise decides whether this month was good.",
        derived: true,
        line: { speaker: "meera", line: "The same incidents are a triumph or a breach, depending on the promise." },
      },
    },
    {
      id: "slow",
      kind: "choice",
      prompt: "You page only when the burn rate reaches 100 times the budget rate, over one hour. The slow burn runs at 20 times for six hours. What happens?",
      options: [
        { id: "page", label: "It pages after a few minutes" },
        { id: "late", label: "It pages after an hour" },
        { id: "never", label: "It never pages, and uses the budget silently" },
      ],
      answer: "never",
      observe: "missed-slow",
      reveal: {
        text: "A burn of 20 stays below a threshold of 100 for the whole six hours, so nothing pages, yet the leak spends 7 minutes of budget, a sixth of the month's allowance. Burn-rate alerts need a lower threshold over a longer window for slow leaks, and a high one over a short window for floods.",
        derived: true,
        line: { speaker: "rao", line: "The expensive incidents are often the quiet ones." },
      },
    },
  ],
  widget: { id: "slo-lab", config: SLO },
  mechanism: [
    {
      id: "sli",
      text: "A service level indicator, SLI, is a measurement of something customers feel: the share of requests that succeed, or that finish under 300 ms. Choose it from the user's side, such as what the load balancer saw, not from what a server reports about itself, which misses requests that never arrived.",
      sourceIds: ["sre-book-slo"],
    },
    {
      id: "slo",
      text: "A service level objective, SLO, is a target for the SLI over a window: 99.9% of requests succeed over 30 days. It is an internal promise tighter than any contract. Each extra nine allows ten times less failure and costs much more, so choose the lowest target your users would still be happy with.",
      sourceIds: ["sre-book-slo", "sre-book-embracing-risk"],
    },
    {
      id: "budget",
      scene: "budget",
      text: "The error budget is what the SLO leaves unpromised: 0.1% of 43,200 minutes is 43 minutes of full failure. It makes reliability a shared currency. While there is budget left the team can ship and experiment; when it is spent, risky changes wait and reliability work takes priority.",
      sourceIds: ["sre-book-embracing-risk"],
    },
    {
      id: "burn",
      scene: "burn",
      text: "Alert on how fast the budget is burning, not on single spikes. A burn rate of 1 spends the budget exactly over the month; 14 would spend it in two days. Page on a high burn over a short window for a flood, a lower burn over a longer one for a leak, and ignore self-healing blips.",
      sourceIds: ["sre-workbook-alerting"],
    },
  ],
  challenges: [
    {
      id: "promise",
      title: "Write the promise and the pager",
      brief: "Customers need at least 99.9%. Choose the SLO and the alert so this month leaves budget, the slow burn pages, the total outage pages within 5 minutes, and the 20 self-healing spikes cause at most one false page.",
      line: { speaker: "kabir", line: "I want a pager that is quiet on a normal day and loud when we are really in trouble." },
      widget: { id: "slo-lab", config: SLO_CHALLENGE },
      conditions: [
        { metric: "sloValue", op: ">=", value: 99.9, label: "SLO of at least 99.9%" },
        { metric: "remaining", op: ">=", value: 0, label: "Budget left over this month" },
        { metric: "slowBurnCaught", op: ">=", value: 1, label: "The 6-hour slow burn pages" },
        { metric: "outageDelayMin", op: "<=", value: 5, label: "The total outage pages within 5 minutes" },
        { metric: "falsePages", op: "<=", value: 1, label: "At most 1 false page" },
      ],
      stars: [],
      hints: [
        "Which SLO values keep this month's 16 minutes under budget?",
        "What burn rate does the slow burn reach? A threshold above it never fires.",
        "What burn rate do the 1-minute spikes reach over a 5-minute window?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain SLIs, SLOs and error budgets and how burn-rate alerts use them.",
    rubric: [
      { id: "sli", criterion: "An SLI measures what users experience, such as the share of successful requests; the SLO is a target for it over a window", keyIdea: "SLI measures, SLO targets" },
      { id: "budget", criterion: "The error budget is 1 minus the SLO; while it lasts the team ships, and when it is spent reliability takes priority", keyIdea: "budget decides shipping" },
      { id: "burn", criterion: "Alert on burn rate over windows so floods and slow leaks page and self-healing blips do not", keyIdea: "page on burn rate" },
    ],
    exemplar:
      "An SLI measures something users feel, such as the share of requests that succeed, and the SLO is the target for it over a window, say 99.9% over 30 days. The error budget is what is left, 43 minutes a month, and while there is budget the team can ship, and when it is spent reliability work comes first. I would alert on the burn rate over windows, so a flood pages quickly and a slow leak pages on a lower burn over a longer window, while one-minute blips that heal themselves do not.",
  },
  reviews: [
    {
      id: "sl-est",
      format: "estimate",
      scenario: "An SLO of 99.95% over a 30-day month (43,200 minutes). How many minutes of full outage does the error budget allow?",
      unit: "minutes",
      answer: 21.6,
      acceptFactor: 1.05,
      breakdown: ["1 − 0.9995 = 0.0005", "× 43,200", "= 21.6 minutes"],
      explain: "Each extra nine cuts the allowed downtime tenfold. 99.9% allows 43 minutes, and 99.99% allows 4.3.",
    },
    {
      id: "sl-pick",
      format: "pick-fix",
      scenario: "A team pages whenever the error rate exceeds 1% for one minute. They get dozens of pages, mostly self-healing, and miss a slow 0.5% leak for hours. What is the better alert?",
      options: [
        { id: "a", label: "Burn-rate alerts over multiple windows: fast for floods, slower for leaks" },
        { id: "b", label: "A lower threshold for one minute" },
        { id: "c", label: "Page on every error" },
        { id: "d", label: "Remove alerts and watch dashboards" },
      ],
      answer: "a",
      explain: "A burn rate measures how fast the budget is going. Windows let you catch both a flood and a leak without paging on blips.",
    },
    {
      id: "sl-order",
      format: "order",
      scenario: "Order these SLOs by the downtime allowed in a month, most first.",
      items: [
        { id: "99", label: "99%" },
        { id: "999", label: "99.9%" },
        { id: "9999", label: "99.99%" },
        { id: "99999", label: "99.999%" },
      ],
      answer: ["99", "999", "9999", "99999"],
      explain: "Allowed downtime is 1% of 43,200 minutes (432), 43, 4.3 and 0.43 minutes: each extra nine is ten times stricter.",
    },
    {
      id: "sl-graph",
      format: "predict-graph",
      scenario: "Keeping the same monthly incidents of 16 minutes' worth, as you raise the SLO from 99% to 99.999%, how does the share of the error budget they use change?",
      xLabel: "SLO →",
      yLabel: "budget used",
      options: [
        { id: "explode", label: "Slowly at first, then explodes past 100%", points: [4, 8, 38, 75, 375, 3750, 37500, 375000] },
        { id: "flat", label: "Stays the same", points: [38, 38, 38, 38, 38, 38, 38, 38] },
        { id: "fall", label: "Falls", points: [375000, 37500, 3750, 375, 75, 38, 8, 4] },
      ],
      answer: "explode",
      explain: "The budget shrinks tenfold with each nine, so a fixed amount of trouble uses ten times more of it.",
    },
    {
      id: "sl-flaw",
      format: "spot-flaw",
      scenario: "A team measures availability from its own servers' logs, counts the requests they served successfully, and reports 99.99%. Customers complain about outages. Tap the part that misses them.",
      diagram: {
        nodes: [
          { id: "client", label: "customers", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "load balancer (dropped during incident)", kind: "lb", col: 1, row: 1 },
          { id: "logs", label: "servers' own logs", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "lb" },
          { from: "lb", to: "logs" },
        ],
      },
      answer: "lb->logs",
      explain: "Requests that never reached a server appear in no server log. Measure from the edge, or the user's side, where the failure is visible.",
    },
    {
      id: "sl-explain",
      format: "explain",
      scenario: "In two sentences: why set an SLO below 100%?",
      rubric: [
        { id: "cost", criterion: "Each extra nine costs much more, and users cannot perceive differences beyond their other dependencies' reliability" },
        { id: "change", criterion: "The error budget is what pays for shipping changes and taking risks, so 100% would mean never changing anything" },
      ],
      exemplar: "Each extra nine costs far more, and users rarely notice beyond the reliability of their phone and network. The budget that remains is also what pays for change, since 100% would mean never shipping anything risky.",
      explain: "Reliability is a trade-off, not a maximum.",
    },
  ],
  codex: {
    oneLiner: "Measure what users feel (SLI), promise a level (SLO), spend the rest as error budget, and page on burn rate, not on single spikes.",
    keyNumbers: [
      { label: "Error budget for 99.9% over 30 days", value: "43.2 minutes", sourceId: "sre-book-slo" },
      { label: "Burn rate of 1", value: "spends the budget exactly in the window", sourceId: "sre-workbook-alerting" },
    ],
    tradeoffs: [
      { choice: "Tighter SLO", gain: "Happier users on the margin", cost: "Ten times less failure allowed for each nine; much more cost" },
      { choice: "Short alert window", gain: "Fast page for floods", cost: "Jumpy; pages on blips" },
      { choice: "Long alert window", gain: "Catches slow leaks quietly", cost: "Slower to react to floods" },
    ],
    seenIn: ["Google SRE practice and the SRE Workbook's multi-window burn-rate alerts.", "Cloud providers' published SLAs and the internal SLOs behind them."],
    interviewAngle: "Say: 'user-facing SLIs, an SLO below 100%, an error budget that gates risky changes, and burn-rate alerts over two windows'.",
    aws: [{ concept: "CloudWatch alarms and Application Signals SLOs", service: "CloudWatch" }],
    replay: { id: "slo-lab", config: SLO, scene: "burn" },
  },
  interview: [
    "What is an error budget?",
    "How do you decide an SLO?",
    "How do you alert on an SLO without paging on every blip?",
  ],
  deeper: [
    {
      title: "SLOs are a conversation, not a number",
      body: "The useful part of an SLO is the agreement it records: product accepts a stated level of failure, engineering accepts being held to it, and both agree what happens when the budget runs out. Without that agreement the number is decoration, and teams cut corners on whichever promise was never written down.",
      sourceIds: ["sre-book-embracing-risk"],
    },
  ],
  honestPhysics: [
    "A 30-day month is 43,200 minutes; budget = (1 − SLO) × 43,200. This month: an 8-minute total outage, 2% errors for 6 hours and 20 one-minute spikes of 5% errors, a total of 8 + 7.2 + 1 = 16.2 minutes of full outage.",
    "Burn rate is the windowed error rate divided by (1 − SLO). An alert fires when it reaches the threshold; time to page is window × threshold × (1 − SLO) ÷ error rate, provided the incident lasts that long.",
    "The incident mix is a made-up example for working through the arithmetic.",
  ],
  sources: [SRE_SLO, SRE_ALERT, SRE_BUDGET],
  verify: [
    { id: "b999", claim: "A 99.9% SLO gives a 43.2-minute budget", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9" }, metric: "budgetMin" }, expect: { min: 43.1, max: 43.3 } },
    { id: "over", claim: "At 99.99% the month uses almost four times the budget", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.99" }, metric: "remaining" }, expect: { max: -2 } },
    { id: "left", claim: "At 99.9% there is 62% of the budget left", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9" }, metric: "remaining" }, expect: { min: 0.6, max: 0.65 } },
    { id: "missed", claim: "A threshold of 100 over one hour misses the slow burn", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9", window: "60", thr: 100 }, metric: "slowBurnCaught" }, expect: { max: 0 } },
    { id: "good-slow", claim: "A threshold of 14 over one hour catches it", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9", window: "60", thr: 14 }, metric: "slowBurnCaught" }, expect: { min: 1 } },
    { id: "good-outage", claim: "…and pages for a total outage within a minute", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9", window: "60", thr: 14 }, metric: "outageDelayMin" }, expect: { max: 1 } },
    { id: "jumpy", claim: "A 5-minute window at 5× pages 20 times on harmless spikes", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9", window: "5", thr: 5 }, metric: "falsePages" }, expect: { min: 20 } },
    { id: "slow-window", claim: "A 6-hour window is too slow for an outage", run: "lab", params: { model: "slo-lab", config: SLO_CHALLENGE, values: { slo: "99.9", window: "360", thr: 14 }, metric: "outageDelayMin" }, expect: { min: 5 } },
  ],
});
