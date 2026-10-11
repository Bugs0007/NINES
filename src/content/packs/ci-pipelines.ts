import { definePack } from "../define";

export const CIP = { start: { lint: true, unit: true, integ: true, e2e: true, failFast: true, parallel: true, cache: true, retries: false } };
export const CIP_CHALLENGE = { start: { lint: true, unit: true, integ: true, e2e: true, failFast: false, parallel: false, cache: false, retries: false } };

const FOWLER_CI = { id: "fowler-ci", title: "Martin Fowler: Continuous Integration (keep the build fast, fix broken builds at once)", url: "https://martinfowler.com/articles/continuousIntegration.html" };
const DORA_CI = { id: "dora-ci", title: "DORA: Continuous integration capability", url: "https://dora.dev/capabilities/continuous-integration/" };
const GH_CACHE = { id: "gh-caching", title: "GitHub Docs: Dependency caching to speed up workflows", url: "https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching" };
const FLAKY = { id: "swe-flaky", title: "Software Engineering at Google, chapter 11: Testing Overview (flaky tests)", url: "https://abseil.io/resources/swe-book/html/ch11.html" };

export default definePack({
  id: "ci-pipelines",
  title: "CI/CD Pipelines",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "PR #902 · checks running for 38 minutes", detail: "3 of 4 reruns this week were flaky end-to-end failures" },
    lines: [
      { speaker: "kabir", line: "A pull request needs thirty-eight minutes to go green, and when it goes red it is usually the flaky test. People merge without waiting." },
      { speaker: "meera", line: "A pipeline is a feedback loop. When it is slow or cries wolf, people stop listening, and then it protects nothing." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "A pipeline runs end-to-end tests (15 min) first, then integration (12), unit (6) and lint (1), one after another, after a 4-minute build. A change has a defect. About how long until it turns red, on average?",
      options: [
        { id: "5", label: "About 5 minutes" },
        { id: "17", label: "About 17 minutes" },
        { id: "35", label: "About 35 minutes" },
      ],
      answer: "35",
      observe: "slow-red",
      reveal: {
        text: "Most defects are caught by unit tests, which sit near the end of this order: they turn red only after the build and the 27 minutes of slower tests ahead of them, an average of about 35 minutes. The same checks run cheapest and strongest first, in parallel, and the same defect shows up in about 8.",
        derived: true,
        line: { speaker: "rao", line: "Order by usefulness per minute, not by importance." },
      },
    },
    {
      id: "leaky",
      kind: "choice",
      prompt: "To save time you remove the integration and end-to-end stages, keeping lint and unit tests. In the lab they catch 15% and 55% of defects. What share of defects reaches production?",
      options: [
        { id: "3", label: "About 3%, same as before" },
        { id: "10", label: "About 10%" },
        { id: "30", label: "About 30%" },
      ],
      answer: "30",
      observe: "leaky",
      reveal: {
        text: "The full pipeline lets 3% through. Without integration (20%) and end-to-end (7%) it lets 30% through: ten times as many defects. Speed that comes from dropping the checks that catch whole classes of defect is a bill paid in production. Make slow checks cheaper, run them later, or run them in parallel.",
        derived: true,
        line: { speaker: "meera", line: "Deleting a check is not the same as making it fast." },
      },
    },
  ],
  widget: { id: "pipeline-lab", config: CIP },
  mechanism: [
    {
      id: "loop",
      text: "Continuous integration means merging small changes into a shared branch often, with an automated build and test run on each. Its purpose is fast feedback: a change that breaks something is found in minutes, while its author still remembers it. Continuous delivery extends the pipeline so that every green change is releasable, and deployment can be a button or automatic.",
      sourceIds: ["fowler-ci", "dora-ci"],
    },
    {
      id: "order",
      scene: "fast-first",
      text: "Order the stages so the cheapest, strongest checks run first: lint and unit tests catch most defects in the first minutes, and the expensive integration and end-to-end stages only run on changes that passed those. Fail fast and cancel the rest. The time to the first red signal is the number developers feel.",
      sourceIds: ["fowler-ci"],
    },
    {
      id: "speed",
      scene: "parallel",
      text: "Make green fast too. Independent stages can run in parallel, so the pipeline takes as long as the slowest one. Cache dependencies and build outputs between runs. Run the heaviest end-to-end tests after merge instead of on every pull request, and keep a quick, trustworthy set on the pull request. A pipeline over ten minutes starts to change behaviour.",
      sourceIds: ["gh-caching", "fowler-ci"],
    },
    {
      id: "flaky",
      scene: "cache",
      text: "A flaky test fails with no change in the code. Retrying hides it and costs time, while ignoring it teaches everyone that red means nothing. Track flakiness, quarantine the worst offenders into a separate non-blocking job, fix them, and treat a failing pipeline on main as a stop-the-line event, fixed or reverted within minutes.",
      sourceIds: ["swe-flaky", "fowler-ci"],
    },
  ],
  challenges: [
    {
      id: "build-pipeline",
      title: "Build the pipeline",
      brief: "A green run in 15 minutes or less, a bad change red within 8 minutes on average, no more than 12% of defects reaching production, and under 2% flaky failures.",
      line: { speaker: "rao", line: "Fast enough that nobody merges before it finishes." },
      widget: { id: "pipeline-lab", config: CIP_CHALLENGE },
      conditions: [
        { metric: "totalMin", op: "<=", value: 15, label: "Green in 15 min or less" },
        { metric: "feedbackMin", op: "<=", value: 8, label: "Red within 8 min on average" },
        { metric: "escapeRate", op: "<=", value: 0.12, label: "At most 12% of defects escape" },
        { metric: "flakeRate", op: "<=", value: 0.02, label: "Under 2% flaky failures" },
      ],
      stars: [],
      hints: ["Which stage is the slowest and catches the least?", "What do independent stages allow?", "What makes the build and unit stages quicker?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to design a CI pipeline that people trust and wait for.",
    rubric: [
      { id: "feedback", criterion: "Fast feedback is the point: run the cheapest, strongest checks first and fail fast", keyIdea: "fast, early red" },
      { id: "speed", criterion: "Parallelise independent stages, cache dependencies, and move slow, low-yield checks to after merge", keyIdea: "parallel, cached, staged" },
      { id: "trust", criterion: "Flaky tests destroy trust; track and quarantine them, and fix a red main immediately", keyIdea: "keep red meaningful" },
    ],
    exemplar:
      "The point is fast feedback, so I would run the cheapest and strongest checks first and fail fast. I would run independent stages in parallel, cache dependencies, and move slow, low-yield checks such as the heaviest end-to-end tests to after the merge. Flaky tests destroy trust in red, so I would track and quarantine them, and treat a red main as something to fix or revert immediately.",
  },
  reviews: [
    {
      id: "ci-est",
      format: "estimate",
      scenario: "A build takes 2 minutes, then lint (1), unit (4) and integration (12) run in parallel. How long is a green run, in minutes?",
      unit: "minutes",
      answer: 14,
      acceptFactor: 1.03,
      breakdown: ["2-minute build", "+ the slowest parallel stage, 12 minutes = 14"],
      explain: "In parallel, the slowest stage sets the pace. Speed it up or move it.",
    },
    {
      id: "ci-pick",
      format: "pick-fix",
      scenario: "Engineers re-run the pipeline until it goes green because end-to-end tests fail randomly about 8% of the time. What is the best response?",
      options: [
        { id: "a", label: "Quarantine and fix the flaky tests, and make failures meaningful again" },
        { id: "b", label: "Tell people to ignore red" },
        { id: "c", label: "Remove all end-to-end tests" },
        { id: "d", label: "Add three automatic retries to everything" },
      ],
      answer: "a",
      explain: "Retrying hides the cost, and removing the tests loses the coverage. Fixing the flakes restores the signal.",
    },
    {
      id: "ci-order",
      format: "order",
      scenario: "Order these stages by defects caught per minute, best first.",
      items: [
        { id: "lint", label: "Lint (15% in 1 min)" },
        { id: "unit", label: "Unit tests (55% in 6 min)" },
        { id: "integ", label: "Integration tests (20% in 12 min)" },
        { id: "e2e", label: "End-to-end tests (7% in 15 min)" },
      ],
      answer: ["lint", "unit", "integ", "e2e"],
      explain: "15, 9.2, 1.7 and 0.5 percentage points per minute. Run the best returns first.",
    },
    {
      id: "ci-graph",
      format: "predict-graph",
      scenario: "As the pipeline's time to green rises from 5 to 40 minutes, how does the share of developers who merge without waiting change?",
      xLabel: "minutes to green →",
      yLabel: "merge without waiting",
      options: [
        { id: "rise", label: "Rises, slowly then sharply", points: [2, 4, 8, 15, 30, 50, 65, 75] },
        { id: "flat", label: "Stays near zero", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "fall", label: "Falls", points: [75, 65, 50, 30, 15, 8, 4, 2] },
      ],
      answer: "rise",
      explain: "Illustrative: people tolerate a wait of a few minutes and start to route around a longer one. The exact curve is a matter of team culture.",
    },
    {
      id: "ci-flaw",
      format: "spot-flaw",
      scenario: "A pipeline deploys to production automatically after the unit tests pass, while the integration tests run afterwards in a nightly job. Tap the gap.",
      diagram: {
        nodes: [
          { id: "unit", label: "unit tests (pass)", kind: "worker", col: 0, row: 1 },
          { id: "deploy", label: "automatic deploy to production", kind: "server", col: 1, row: 1 },
          { id: "nightly", label: "nightly integration tests", kind: "queue", col: 2, row: 1 },
        ],
        edges: [
          { from: "unit", to: "deploy" },
          { from: "deploy", to: "nightly" },
        ],
      },
      answer: "unit->deploy",
      explain: "The checks that catch integration defects run after the code is already live. Gate the deploy on the checks that matter, or deploy to a staging step first.",
    },
    {
      id: "ci-explain",
      format: "explain",
      scenario: "In two sentences: why do slow pipelines make software worse?",
      rubric: [
        { id: "batch", criterion: "People batch changes to avoid waiting, so each change is larger and riskier and harder to debug" },
        { id: "ignore", criterion: "People learn to merge before the result or to ignore red, so the checks stop protecting anything" },
      ],
      exemplar: "People batch changes to avoid waiting, so each change is larger, riskier and harder to debug. They also learn to merge before the result or ignore red, so the checks stop protecting anything.",
      explain: "The speed of feedback changes the behaviour of the team.",
    },
  ],
  codex: {
    oneLiner: "CI is fast feedback on small changes. Run cheap, strong checks first, parallelise, cache, move slow low-yield checks later, and keep red meaningful.",
    keyNumbers: [
      { label: "Sequential, expensive first (lab)", value: "35 min to red", sourceId: "fowler-ci" },
      { label: "Lint, unit, integration in parallel with cache (lab)", value: "14 min green, 7 min to red", sourceId: "gh-caching" },
    ],
    tradeoffs: [
      { choice: "Fewer checks on the PR", gain: "Faster merges", cost: "More defects escape" },
      { choice: "Retries", gain: "Fewer false reds", cost: "Hides flakiness and adds minutes" },
      { choice: "Post-merge heavy tests", gain: "Fast PRs", cost: "A broken main now and then" },
    ],
    seenIn: ["GitHub Actions, GitLab CI and Jenkins pipelines.", "DORA metrics for lead time and change failure rate."],
    interviewAngle: "Say: 'fast feedback, cheap checks first, parallel and cached, flaky tests quarantined, red on main fixed or reverted at once'.",
    aws: [{ concept: "Managed CI and delivery", service: "AWS CodePipeline and CodeBuild" }],
    replay: { id: "pipeline-lab", config: CIP, scene: "parallel" },
  },
  interview: [
    "How would you speed up a slow CI pipeline?",
    "What do you do about flaky tests?",
    "What is the difference between continuous delivery and continuous deployment?",
  ],
  deeper: [
    {
      title: "The pipeline is a product",
      body: "Treat the pipeline as something with users, a service level and an owner. Track its duration, its flake rate and how often main is red. Invest in it like any internal tool: a team that lets its pipeline rot pays the cost in every engineer's day, and the cost shows up in lead time and change failure rate.",
      sourceIds: ["dora-ci"],
    },
  ],
  honestPhysics: [
    "Lint takes 1 minute and catches 15% of defects, unit tests 6 minutes and 55%, integration tests 12 and 20%, end-to-end tests 15 and 7%, leaving 3% to reach production. A build takes 4 minutes before the tests, 2 with caching, which also saves 2 minutes on the unit stage.",
    "Parallel stages take as long as the slowest. Feedback time is the average time until red for a change with a defect. End-to-end tests fail for no reason 8% of runs; a retry lowers that to 0.5% and adds 3 minutes. Round figures.",
  ],
  sources: [FOWLER_CI, DORA_CI, GH_CACHE, FLAKY],
  verify: [
    { id: "slow", claim: "Sequential and expensive-first takes 38 minutes green", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: {}, metric: "totalMin" }, expect: { min: 37, max: 39 } },
    { id: "slow-red", claim: "…and about 35 minutes to red", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: {}, metric: "feedbackMin" }, expect: { min: 33, max: 37 } },
    { id: "good", claim: "Lint, unit and integration in parallel with a cache take 14 minutes", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: { e2e: false, parallel: true, cache: true }, metric: "totalMin" }, expect: { min: 13.9, max: 14.1 } },
    { id: "good-red", claim: "…and turn red in 7 minutes", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: { e2e: false, parallel: true, cache: true }, metric: "feedbackMin" }, expect: { min: 7, max: 7.6 } },
    { id: "good-escape", claim: "…letting 10% of defects through", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: { e2e: false, parallel: true, cache: true }, metric: "escapeRate" }, expect: { min: 0.09, max: 0.11 } },
    { id: "lean", claim: "Dropping integration and end-to-end lets 30% through", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: { integ: false, e2e: false, parallel: true, cache: true }, metric: "escapeRate" }, expect: { min: 0.29, max: 0.31 } },
    { id: "flaky", claim: "End-to-end tests without retries fail 8% of runs for no reason", run: "lab", params: { model: "pipeline-lab", config: CIP_CHALLENGE, values: { e2e: true, retries: false }, metric: "flakeRate" }, expect: { min: 0.08, max: 0.08 } },
  ],
});
