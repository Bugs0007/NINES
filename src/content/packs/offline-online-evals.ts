import { definePack } from "../define";

export const ON = { start: { method: "canary", share: 5, shadowFirst: true, guard: true } };
export const ON_CHALLENGE = {};

const KOHAVI = { id: "kohavi-experiments", title: "R. Kohavi, D. Tang, Y. Xu, Trustworthy Online Controlled Experiments (Cambridge University Press, 2020)", url: "https://experimentguide.com/" };
const MILLER = { id: "miller-sample", title: "E. Miller: Sample size calculator for A/B tests", url: "https://www.evanmiller.org/ab-testing/sample-size.html" };
const SRE_CANARY = { id: "sre-workbook-canary", title: "Google SRE Workbook, ch. 16: Canarying Releases", url: "https://sre.google/workbook/canarying-releases/" };

export default definePack({
  id: "offline-online-evals",
  title: "Offline vs Online Evals",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "prompt v7 · passed every offline eval, refund questions got worse", detail: "refunds were 30% of traffic and 3% of the suite" },
    lines: [
      { speaker: "kabir", line: "Prompt v7 beat v6 on every test we have, then refund questions got clearly worse. They are a third of our traffic and almost none of our suite." },
      { speaker: "meera", line: "The suite is a model of your users, and models leave things out. Real traffic is the only test that cannot be wrong about what users ask." },
    ],
  },
  predictions: [
    {
      id: "offline-only",
      kind: "choice",
      prompt: "A candidate is worse by 8 points for a slice that is 30% of traffic but missing from the offline suite. You ship on the offline result, and a week passes unnoticed. With 20,000 users a day, how many user-days of worse answers?",
      options: [
        { id: "few", label: "About 400" },
        { id: "mid", label: "About 4,000" },
        { id: "many", label: "About 42,000" },
      ],
      answer: "many",
      observe: "shipped-bad",
      reveal: {
        text: "30% of 20,000 users is 6,000 people a day, for 7 days: 42,000 user-days. The offline score was right about what it measured, it just did not measure this. Anything that can ship on an offline result alone will eventually ship a regression the suite never covered.",
        derived: true,
        line: { speaker: "meera", line: "The test passed. The test was not about this." },
      },
    },
    {
      id: "live-cost",
      kind: "choice",
      prompt: "You test live to find out. Seeing an 8-point difference in a binary metric takes about 9,600 users per arm. If 30% of them are in the affected slice, how many people get the worse prompt before the test can decide?",
      options: [
        { id: "few", label: "About 300" },
        { id: "mid", label: "About 2,900" },
        { id: "many", label: "About 9,600" },
      ],
      answer: "mid",
      observe: "users-hurt",
      reveal: {
        text: "Of the 9,600 who see the candidate, 30% are in the slice: 2,880 people get worse answers during the test, whatever the split, since the sample you need is fixed. Live tests are honest and are not free. Shadow runs and early-stop guardrails reduce who is hurt.",
        derived: true,
        sourceIds: ["miller-sample"],
        line: { speaker: "rao", line: "Experiments have a bill, and the people in the control group's opposite arm pay it." },
      },
    },
  ],
  widget: { id: "onoff-lab", config: ON },
  mechanism: [
    {
      id: "offline",
      scene: "offline",
      text: "Offline evals run a fixed suite before release. They are fast, cheap and safe, and give a clean comparison between prompts. Their weakness is coverage: a suite contains what you thought of, and users bring what you did not. A passing offline result says the change is fine on the cases you tested.",
      sourceIds: ["kohavi-experiments"],
    },
    {
      id: "shadow",
      scene: "shadow",
      text: "Shadow traffic copies real requests to the candidate while users continue to get the current answer. Outputs are scored by code and by a judge, or compared with the current ones. You see real inputs, including the slices the suite missed, with no user at risk. You do not see real feedback, only graded output.",
      sourceIds: ["sre-workbook-canary"],
    },
    {
      id: "online",
      text: "Online tests expose a share of users to the candidate and measure what they do: thumbs, retries, escalation, task success. They are the ground truth and need enough users to see the effect, so detectable differences depend on traffic. Pick one primary metric in advance and decide the stopping rule, or noise will pick a winner for you.",
      sourceIds: ["kohavi-experiments", "miller-sample"],
    },
    {
      id: "guardrail",
      scene: "guardrail",
      text: "Layer them. Offline evals reject the obviously bad. Shadow traffic tests the rest on real inputs. A small live canary confirms with real users, and a guardrail stops it if a slice drops sharply. Each layer catches some of what the previous one missed, and each costs more per change than the one before.",
      sourceIds: ["sre-workbook-canary", "kohavi-experiments"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "rollout-plan",
      title: "Plan the rollout of a risky prompt",
      brief: "A candidate may be worse for an uncovered slice. Choose how to test it so the chance it ships bad is at most 2%, the expected number of users hurt is at most 1,000, and you decide within 14 days.",
      line: { speaker: "kabir", line: "I want to find out before a thousand people do." },
      widget: { id: "onoff-lab", config: ON_CHALLENGE },
      conditions: [
        { metric: "missProb", op: "<=", value: 0.02, label: "At most a 2% chance a bad prompt ships" },
        { metric: "harmedUsers", op: "<=", value: 1000, label: "At most 1,000 users expected to be hurt" },
        { metric: "days", op: "<=", value: 14, label: "Decide within 14 days" },
      ],
      stars: [{ metric: "harmedUsers", op: "<=", value: 400, label: "At most 400 users expected to be hurt" }],
      hints: [
        "What does an offline suite miss, and what does shadow traffic catch?",
        "What do the people in a live test pay, and how can a guardrail cut it?",
        "How many days does a small live share need?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how offline and online evaluation complement each other for a prompt change.",
    rubric: [
      { id: "offline", criterion: "Offline evals are fast and safe but only cover what the suite contains, so they miss uncovered slices", keyIdea: "offline: safe, limited coverage" },
      { id: "shadow", criterion: "Shadow traffic tests real inputs with no user at risk, graded by code or a judge", keyIdea: "shadow: real inputs, no risk" },
      { id: "online", criterion: "Live tests give ground truth but expose users and need enough traffic, so use a small share with a guardrail after shadow", keyIdea: "live: truth at a price" },
    ],
    exemplar:
      "Offline evals are fast, cheap and safe but only cover the cases in the suite, so they can miss a slice that real users send. Shadow traffic runs the candidate on copies of real requests with no user at risk, and grades the output with code and a judge. Live tests give the ground truth, and need enough users to see the effect, so I would run a small canary after shadow with a guardrail that stops it early if a slice drops, which keeps the harm to a few hundred people.",
  },
  reviews: [
    {
      id: "oo-est",
      format: "estimate",
      scenario: "A live test needs 9,600 users per arm and the candidate gets 5% of 20,000 users a day, 1,000 a day. About how many days to collect the sample?",
      unit: "days",
      answer: 9.6,
      acceptFactor: 1.05,
      breakdown: ["9,600 ÷ 1,000 per day", "= 9.6 days"],
      explain: "A smaller share is safer and slower. At 1% the same test would take 48 days.",
    },
    {
      id: "oo-pick",
      format: "pick-fix",
      scenario: "A prompt change affects only a minority of rare, expensive conversations. The offline suite barely contains them and a live test would take months to see the effect. What is the best way to test?",
      options: [
        { id: "a", label: "Build an eval slice from logged examples of those conversations and use shadow traffic on them" },
        { id: "b", label: "Ship and watch complaints" },
        { id: "c", label: "Rely on the existing suite" },
        { id: "d", label: "Run a live test for a year" },
      ],
      answer: "a",
      explain: "When a slice is rare, targeted offline data and shadow replays give evidence far sooner than waiting for enough live users.",
    },
    {
      id: "oo-order",
      format: "order",
      scenario: "Order these testing stages by the number of users exposed to a bad candidate, fewest first.",
      items: [
        { id: "offline", label: "Offline suite" },
        { id: "shadow", label: "Shadow traffic" },
        { id: "canary", label: "Live canary with a guardrail" },
        { id: "ab", label: "Live A/B at 50%, no guardrail" },
      ],
      answer: ["offline", "shadow", "canary", "ab"],
      explain: "Offline and shadow expose nobody during the test; a guarded canary exposes a few hundred; an unguarded A/B exposes thousands.",
    },
    {
      id: "oo-graph",
      format: "predict-graph",
      scenario: "As the share of users in a live canary falls from 50% to 1% of 20,000 a day, how does the time to collect 9,600 users change?",
      xLabel: "canary share (smaller →)",
      yLabel: "days to decide",
      options: [
        { id: "inv", label: "Rises as 1 ÷ share: about a day at 50%, 48 days at 1%", points: [1, 1.6, 2.4, 4.8, 9.6, 16, 32, 48] },
        { id: "flat", label: "Stays the same", points: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: "fall", label: "Falls", points: [48, 32, 16, 9.6, 4.8, 2.4, 1.6, 1] },
      ],
      answer: "inv",
      explain: "The sample is fixed, so the time is the sample divided by the daily users in the arm.",
    },
    {
      id: "oo-flaw",
      format: "spot-flaw",
      scenario: "A team checks the live test's results every day and stops as soon as the candidate is ahead with p < 0.05. Over many tests, far more than 5% of 'winners' turn out to be no better. Tap the practice that causes this.",
      diagram: {
        nodes: [
          { id: "run", label: "live test runs", kind: "server", col: 0, row: 1 },
          { id: "peek", label: "check daily, stop when p < 0.05", kind: "client", col: 1, row: 1 },
          { id: "ship", label: "ship the 'winner'", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "run", to: "peek" },
          { from: "peek", to: "ship" },
        ],
      },
      answer: "run->peek",
      explain: "Each daily look is another chance for noise to cross the line. Fix the sample size and the stopping rule in advance, or use a sequential method designed for repeated looks.",
    },
    {
      id: "oo-explain",
      format: "explain",
      scenario: "In two sentences: why can shadow traffic not replace a live test?",
      rubric: [
        { id: "feedback", criterion: "Users never see the shadow output, so there is no real feedback such as clicks, retries or satisfaction, only graded output" },
        { id: "interaction", criterion: "It cannot show how a different answer changes what users do next, which is often the thing that matters" },
      ],
      exemplar: "Users never see shadow outputs, so there is no real behaviour to measure, only what a grader thinks of them. It also cannot show how a different answer changes what users do next, which is often what really matters.",
      explain: "Shadow tests what you say; live tests what users do.",
    },
  ],
  codex: {
    oneLiner: "Offline evals are safe but cover only the suite. Shadow traffic tests real inputs without risk. A small guarded live canary confirms with real users.",
    keyNumbers: [
      { label: "Users per arm for an 8-point difference in a binary metric", value: "about 9,600", sourceId: "miller-sample" },
      { label: "Days at a 5% canary of 20,000 users a day", value: "about 10", sourceId: "kohavi-experiments" },
    ],
    tradeoffs: [
      { choice: "Offline suite", gain: "Fast and safe", cost: "Blind to uncovered slices" },
      { choice: "Shadow traffic", gain: "Real inputs, no user at risk", cost: "Judged output, not behaviour" },
      { choice: "Live test with guardrail", gain: "Ground truth", cost: "Exposes some users; takes days" },
    ],
    seenIn: ["Shadow deployments of new models behind a gateway.", "A/B tests of prompt variants with feedback metrics."],
    interviewAngle: "Say: 'offline gate, then shadow on real traffic, then a small canary with a slice guardrail; fix the sample size before looking'.",
    aws: [{ concept: "Traffic mirroring and weighted routing", service: "Application Load Balancer, API Gateway canary" }],
    replay: { id: "onoff-lab", config: ON, scene: "guardrail" },
  },
  interview: [
    "What is the difference between offline and online evals?",
    "How do you test a prompt change that might hurt a small user segment?",
    "What is shadow traffic?",
  ],
  deeper: [
    {
      title: "Metrics that move with the model",
      body: "Online metrics for LLM features are indirect: a thumbs-up rate, a retry, a handoff to a person, a copy of the answer. Each is noisy and can move for reasons unrelated to quality. Choose one primary metric and several guardrails in advance, and read a change in one against the others before concluding anything.",
      sourceIds: ["kohavi-experiments"],
    },
  ],
  honestPhysics: [
    "20,000 users a day. A candidate is worse by 8 points for a slice that is 30% of traffic and that the offline suite does not cover. A live test needs about 9,600 users per arm; of those, 30% are in the slice, so about 2,880 people see the worse prompt before it can decide.",
    "Offline-only misses the slice 100% of the time. Shadow traffic judged by a model catches 85% of such regressions without any user seeing it; a live canary or A/B test catches 95%. Running shadow first means only the 15% of bad candidates that pass shadow reach users.",
    "A guardrail stops the live test after about a tenth of the sample. A bad candidate that ships undetected hurts 30% of 20,000 users for 7 days: 42,000 user-days.",
  ],
  sources: [KOHAVI, MILLER, SRE_CANARY],
  verify: [
    { id: "offline", claim: "Offline-only misses a bad candidate and costs 42,000 user-days", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "offline" }, metric: "harmedUsers" }, expect: { min: 42000, max: 42000 } },
    { id: "shadow", claim: "Shadow alone misses 15%", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "shadow" }, metric: "missProb" }, expect: { min: 0.15, max: 0.15 } },
    { id: "canary-harm", claim: "A plain canary hurts about 5,000", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "canary", share: 5, shadowFirst: false, guard: false }, metric: "harmedUsers" }, expect: { min: 4500, max: 5500 } },
    { id: "layered", claim: "Shadow, canary and a guardrail hurt about 360", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "canary", share: 5, shadowFirst: true, guard: true }, metric: "harmedUsers" }, expect: { max: 1000 } },
    { id: "layered-miss", claim: "…and let a bad prompt ship 0.75% of the time", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "canary", share: 5, shadowFirst: true, guard: true }, metric: "missProb" }, expect: { max: 0.02 } },
    { id: "days-5", claim: "A 5% canary takes about 10 days, including the shadow day", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "canary", share: 5, shadowFirst: true, guard: true }, metric: "days" }, expect: { max: 14 } },
    { id: "days-3", claim: "A 3% canary takes too long", run: "lab", params: { model: "onoff-lab", config: ON_CHALLENGE, values: { method: "canary", share: 3, shadowFirst: true, guard: true }, metric: "days" }, expect: { min: 14 } },
  ],
});
