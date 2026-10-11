import { definePack } from "../define";

export const DEP = { start: { strategy: "canary", weight: 1, hold: 10 } };
export const DEP_CHALLENGE = {};

const BLUE_GREEN = { id: "fowler-bluegreen", title: "M. Fowler: BlueGreenDeployment", url: "https://martinfowler.com/bliki/BlueGreenDeployment.html" };
const CANARY = { id: "fowler-canary", title: "M. Fowler: CanaryRelease", url: "https://martinfowler.com/bliki/CanaryRelease.html" };
const SRE_CANARY = { id: "sre-workbook-canary", title: "Google SRE Workbook, ch. 16: Canarying Releases", url: "https://sre.google/workbook/canarying-releases/" };

export default definePack({
  id: "deploy-strategies",
  title: "Blue-green & Canary Deploys",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "checkout · error rate 5.5% since 14:02 deploy", detail: "release 412 went to every server at once" },
    lines: [
      { speaker: "kabir", line: "Release 412 had a bug, and it reached every user the moment it deployed. Rolling back took twenty minutes while twenty thousand orders failed." },
      { speaker: "meera", line: "A deploy is an experiment on real users. Decide in advance how many users the experiment may hurt, and how fast you can stop it." },
    ],
  },
  predictions: [
    {
      id: "wide",
      kind: "choice",
      prompt: "A bug fails 5% of the requests it serves, at 2,000 requests a second. You deploy to every server at once, spot it in a fraction of a second, and need 20 minutes to redeploy the old version. How many requests fail?",
      options: [
        { id: "few", label: "About 1,000" },
        { id: "many", label: "About 12,000" },
        { id: "lots", label: "About 120,000" },
      ],
      answer: "lots",
      observe: "wide",
      reveal: {
        text: "Everyone is on the bad version, so 5% of 2,000 requests a second fail: 100 a second, for 20 minutes. That is 120,000 failed requests. Spotting the bug in a second would not have helped: what matters is how many users were exposed and how long the fix takes.",
        derived: true,
        line: { speaker: "meera", line: "Detection is only half of it. The other half is the size of the audience." },
      },
    },
    {
      id: "hold",
      kind: "choice",
      prompt: "You try a canary of 0.1% of traffic held for 3 minutes. Spotting the bug needs 400 requests on the new version, and 0.1% of 2,000 a second is 2 a second. What happens?",
      options: [
        { id: "caught", label: "It is caught in 3 minutes" },
        { id: "promoted", label: "The hold ends before there is enough data, so the release goes to everyone" },
        { id: "never", label: "The canary never starts" },
      ],
      answer: "promoted",
      observe: "promoted",
      reveal: {
        text: "At 2 requests a second the canary needs 200 seconds to gather 400 requests, but the hold ends at 180. The release is promoted before the numbers could speak, and the bug reaches everyone. A canary must be big enough, and held long enough, to give a verdict.",
        derived: true,
        line: { speaker: "rao", line: "A canary too small to see anything is just a delay." },
      },
    },
  ],
  widget: { id: "deploy-lab", config: DEP },
  mechanism: [
    {
      id: "risk",
      text: "Every release carries risk, and the risk to manage is how many users meet a bad version and for how long. That depends on two things: how widely the new version is exposed before you know it is bad, and how quickly you can go back. Deployment strategies are different ways of trading these.",
      sourceIds: ["sre-workbook-canary"],
      derived: true,
    },
    {
      id: "allatonce",
      scene: "allatonce",
      text: "Replacing every server at once is the simplest, and gives the largest audience for a bug. Rolling updates replace servers in batches, so at most a batch is exposed at a time, and a bad batch can be stopped, but undoing a roll means rolling back every batch, which is slow.",
      sourceIds: ["sre-workbook-canary"],
    },
    {
      id: "bluegreen",
      scene: "bluegreen",
      text: "Blue-green runs the old version (blue) and the new one (green) side by side, then flips all traffic to green at once. Rollback is a flip back, almost instant. But the whole audience moves together, so a bug still hurts everyone until you flip, and you pay for double the capacity while both run.",
      sourceIds: ["fowler-bluegreen"],
    },
    {
      id: "canary",
      scene: "canary",
      text: "A canary sends a small share of real traffic to the new version and compares its errors and latency with the old. If the numbers hold, the share grows; if not, you route away. The share must be large enough to collect a verdict quickly, and the hold long enough for it to arrive.",
      sourceIds: ["fowler-canary", "sre-workbook-canary"],
    },
  ],
  challenges: [
    {
      id: "ship-safely",
      title: "Ship the release",
      brief: "The release has a bug that fails 5% of requests it serves, but nobody knows yet. Choose a strategy so at most 500 requests fail, rollback takes at most 5 minutes, and the extra capacity needed is at most 1.1 times.",
      line: { speaker: "kabir", line: "I want to learn about the bug from a dashboard, not from customers." },
      widget: { id: "deploy-lab", config: DEP_CHALLENGE },
      conditions: [
        { metric: "badRequests", op: "<=", value: 500, label: "At most 500 failed requests" },
        { metric: "rollbackMin", op: "<=", value: 5, label: "Rollback within 5 minutes" },
        { metric: "capacityX", op: "<=", value: 1.1, label: "At most 1.1× capacity" },
      ],
      stars: [{ metric: "badRequests", op: "<=", value: 100, label: "At most 100 failed requests" }],
      hints: [
        "Which strategies expose everyone to the bug before you can react?",
        "How many requests does a canary need to see a 5% error rate?",
        "How long a hold does that canary share need?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare all-at-once, rolling, blue-green and canary deployments.",
    rubric: [
      { id: "blast", criterion: "All-at-once and blue-green expose everyone to a bad version at once; rolling and canary limit the audience", keyIdea: "exposure" },
      { id: "rollback", criterion: "Blue-green rolls back with a flip; rolling and all-at-once take many minutes to undo", keyIdea: "rollback speed" },
      { id: "canary", criterion: "A canary needs enough traffic and hold time to detect a problem, or it promotes a bad version", keyIdea: "canary sizing" },
    ],
    exemplar:
      "All-at-once puts a bad release in front of everyone and takes a redeploy to undo. Rolling limits exposure to a batch at a time but is slow to roll back. Blue-green rolls back with a flip, but moves everyone together and needs double capacity while it runs. A canary exposes a small share of real traffic and compares its metrics, but it must be big enough and held long enough to collect a verdict, or it will promote a bad release.",
  },
  reviews: [
    {
      id: "dp-est",
      format: "estimate",
      scenario: "A bug fails 5% of requests. A canary takes 1% of 2,000 requests a second, spots the bug in 20 seconds, and traffic is routed away in 1 minute. About how many requests fail?",
      unit: "requests",
      answer: 80,
      acceptFactor: 1.1,
      breakdown: ["canary traffic: 20 requests a second", "× 5% = 1 failure a second", "× 80 seconds = 80"],
      explain: "Small exposure and fast rollback multiply, so the damage is tiny.",
    },
    {
      id: "dp-pick",
      format: "pick-fix",
      scenario: "A team uses blue-green and flips all traffic to green. A bug fails 5% of requests for the two minutes before they notice and flip back. What would limit the damage further?",
      options: [
        { id: "a", label: "Send a small share of traffic to green first, as a canary, before flipping" },
        { id: "b", label: "Flip faster after full traffic arrives" },
        { id: "c", label: "Add more capacity to green" },
        { id: "d", label: "Test in staging for longer" },
      ],
      answer: "a",
      explain: "Blue-green gives fast rollback but full exposure. Starting with a small share keeps its fast rollback and shrinks the audience.",
    },
    {
      id: "dp-order",
      format: "order",
      scenario: "Order these strategies by users exposed to a bad release before any reaction, most first.",
      items: [
        { id: "all", label: "All at once" },
        { id: "rolling", label: "Rolling, first batch of 10%" },
        { id: "canary", label: "Canary at 1%" },
      ],
      answer: ["all", "rolling", "canary"],
      explain: "Exposure is the share of traffic on the new version when the problem is first visible.",
    },
    {
      id: "dp-graph",
      format: "predict-graph",
      scenario: "As the canary's traffic share grows from 0.05% to 50% with a 10-minute hold, how do failed requests change?",
      xLabel: "canary share →",
      yLabel: "failed requests",
      options: [
        { id: "ushape", label: "High when too small to detect in the hold, low in the middle, rising again when large", points: [6000, 6000, 26, 80, 320, 620, 1500, 3000] },
        { id: "rise", label: "Rises steadily", points: [10, 20, 40, 80, 320, 620, 1500, 3000] },
        { id: "fall", label: "Falls steadily", points: [6000, 3000, 1500, 620, 320, 80, 40, 20] },
      ],
      answer: "ushape",
      explain: "Too small and the canary cannot reach a verdict within the hold, so the bug is promoted. Too large and many users meet the bug while it is detected.",
    },
    {
      id: "dp-flaw",
      format: "spot-flaw",
      scenario: "A team runs a canary on 1% of traffic, but only checks that the new pods are 'healthy' (respond to /health). A bug that fails real requests goes unnoticed. Tap the missing step.",
      diagram: {
        nodes: [
          { id: "canary", label: "canary pods, 1% traffic", kind: "server", col: 0, row: 1 },
          { id: "check", label: "check: /health returns 200", kind: "lb", col: 1, row: 1 },
          { id: "promote", label: "promote to 100%", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "canary", to: "check" },
          { from: "check", to: "promote" },
        ],
      },
      answer: "canary->check",
      explain: "Compare the canary's real error rate and latency with the baseline, not just whether the process is alive. Health checks do not see wrong answers.",
    },
    {
      id: "dp-explain",
      format: "explain",
      scenario: "In two sentences: why is database schema change the hardest part of any zero-downtime deploy?",
      rubric: [
        { id: "both", criterion: "During a rollout old and new code run against the same database, so the schema must work for both" },
        { id: "steps", criterion: "Make changes in compatible steps, add first, migrate, then remove, so any version can be rolled back" },
      ],
      exemplar: "During a rollout the old and new versions of the code share one database, so the schema has to work for both of them. Make changes in compatible steps: add the new column, deploy and migrate, and only later remove the old one, so a rollback is always safe.",
      explain: "Roll the schema forward in steps code can survive.",
    },
  ],
  codex: {
    oneLiner: "Limit how many users meet a bad release and how long. Canary for small exposure, blue-green for instant rollback, and compare real metrics.",
    keyNumbers: [
      { label: "Requests needed to see a 5% bug against 0.5% baseline", value: "about 400", sourceId: "sre-workbook-canary" },
      { label: "Blue-green capacity during the switch", value: "about 2×", sourceId: "fowler-bluegreen" },
    ],
    tradeoffs: [
      { choice: "All at once", gain: "Simple, fast", cost: "Full exposure; slow rollback" },
      { choice: "Rolling", gain: "Low extra capacity", cost: "Slow to undo; mixed versions for a while" },
      { choice: "Blue-green", gain: "Instant rollback", cost: "Full exposure; double capacity" },
      { choice: "Canary", gain: "Small exposure; real data", cost: "Needs good metrics and enough traffic" },
    ],
    seenIn: ["Kubernetes rolling updates and Argo Rollouts canaries.", "Service mesh traffic splitting with Istio or Envoy."],
    interviewAngle: "Say: 'canary on a small share, compare error rate and latency to baseline, promote in steps, with instant rollback and backward-compatible schema changes'.",
    aws: [{ concept: "Canary and linear deployment configurations", service: "CodeDeploy, Lambda aliases" }],
    replay: { id: "deploy-lab", config: DEP, scene: "canary" },
  },
  interview: [
    "What is the difference between blue-green and canary deployments?",
    "How would you roll out a risky change to a million users?",
    "How do you handle database migrations during a rolling deploy?",
  ],
  deeper: [
    {
      title: "Automatic canary analysis",
      body: "Mature systems judge the canary automatically. They compare the canary and baseline on several metrics at once, using a statistical test, and promote or roll back without a person. Comparing against a baseline running at the same time, not against yesterday, cancels the effect of time-of-day traffic shifts.",
      sourceIds: ["sre-workbook-canary"],
    },
  ],
  honestPhysics: [
    "A release has a bug that fails 5% of the requests it serves, against 0.5% normally. The service takes 2,000 requests a second. Noticing the difference takes about 400 requests on the new version.",
    "All-at-once: 100% exposure, 20 minutes to redeploy. Rolling: 10% exposure, 15 minutes to undo, averaging half the exposure while rolling back. Blue-green: 100% exposure, 1 minute to flip back, 2× capacity. Canary: the share you set, 1 minute to route away; if the hold ends before detection, it promotes to 100%.",
    "Failed requests are those served wrongly from release to the end of rollback.",
  ],
  sources: [BLUE_GREEN, CANARY, SRE_CANARY],
  verify: [
    { id: "all", claim: "All-at-once with a 20-minute redeploy fails about 120,000 requests", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "all" }, metric: "badRequests" }, expect: { min: 100000, max: 140000 } },
    { id: "bg", claim: "Blue-green fails about 6,000 requests", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "bluegreen" }, metric: "badRequests" }, expect: { min: 5000, max: 7000 } },
    { id: "bg-cap", claim: "…and needs twice the capacity", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "bluegreen" }, metric: "capacityX" }, expect: { min: 2, max: 2 } },
    { id: "rolling", claim: "Rolling fails about 4,500 requests and takes 15 minutes to undo", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "rolling" }, metric: "rollbackMin" }, expect: { min: 15 } },
    { id: "canary1", claim: "A 1% canary held 10 minutes fails 80 requests", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "canary", weight: 1, hold: 10 }, metric: "badRequests" }, expect: { min: 70, max: 90 } },
    { id: "small", claim: "A 0.1% canary held 3 minutes promotes the bug", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "canary", weight: 0.1, hold: 3 }, metric: "promoted" }, expect: { min: 1 } },
    { id: "big", claim: "A 50% canary fails over 3,000 requests", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "canary", weight: 50, hold: 10 }, metric: "badRequests" }, expect: { min: 3000 } },
    { id: "mid", claim: "A 5% canary stays under 500", run: "lab", params: { model: "deploy-lab", config: DEP_CHALLENGE, values: { strategy: "canary", weight: 5, hold: 10 }, metric: "badRequests" }, expect: { max: 500 } },
  ],
});
