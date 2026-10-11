import { definePack } from "../define";

export const BRIEF = { start: { tests: true, files: true, constraints: true, plan: true, run: true, big: false } };
export const BRIEF_CHALLENGE = {};

const CC_BEST = { id: "claude-code-best", title: "Anthropic: Claude Code best practices for agentic coding (explore, plan, code, commit; tests as targets)", url: "https://www.anthropic.com/engineering/claude-code-best-practices" };
const CC_OVERVIEW = { id: "claude-code-overview", title: "Claude Code docs: Overview", url: "https://docs.anthropic.com/en/docs/claude-code/overview" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (ground truth from the environment; testing in sandboxes)", url: "https://www.anthropic.com/engineering/building-effective-agents" };

export default definePack({
  id: "directing-coding-agents",
  title: "Directing Coding Agents",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "pull request · 41 files, 'adds export, fixes bugs, renames things'", detail: "review took four hours and missed a regression" },
    lines: [
      { speaker: "kabir", line: "I asked the agent for five things in one sentence. It did all five across forty-one files, and I spent four hours reviewing it." },
      { speaker: "meera", line: "You are the tech lead; the agent is a fast, literal engineer with no memory of last week. Brief it so, and give it a way to check its work." },
    ],
  },
  predictions: [
    {
      id: "vague",
      kind: "choice",
      prompt: "One line, five changes bundled, nothing else. In the lab a single bare change is right first time 35% of the time, and bundling five multiplies that by 0.6. What are the odds, and the review time?",
      options: [
        { id: "high", label: "About 70% right, 10 minutes of review" },
        { id: "mid", label: "About 35% right, 30 minutes" },
        { id: "low", label: "About 21% right, an hour of review across several rounds" },
      ],
      answer: "low",
      observe: "vague",
      reveal: {
        text: "0.35 × 0.6 is 21%: you will see about five attempts, each a 12-minute review, an hour in all. A mistake in any of the five spoils the change, and a large change is harder to read, so errors survive review. The cost of a vague request is paid by the reviewer.",
        derived: true,
        line: { speaker: "meera", line: "The review is where a vague brief bills you." },
      },
    },
    {
      id: "sprawl",
      kind: "choice",
      prompt: "You split the work, one change per request, and give the agent the acceptance tests and permission to run them. What happens to the chance the first attempt is right?",
      options: [
        { id: "same", label: "Roughly the same, about a fifth" },
        { id: "70", label: "It rises to about 70%" },
        { id: "100", label: "It reaches 100%" },
      ],
      answer: "70",
      observe: "sprawl",
      reveal: {
        text: "Tests give the agent a target, 15 points, and running them gives it feedback it can use without you, 20 more: 35% becomes 70% for a single change, and review falls to under 9 minutes. The agent's best habit is the one engineers have: run the tests, read the failure, try again.",
        derived: true,
        line: { speaker: "rao", line: "Give it a way to know it is wrong before you have to tell it." },
      },
    },
  ],
  widget: { id: "brief-lab", config: BRIEF },
  mechanism: [
    {
      id: "role",
      text: "Directing a coding agent is delegation. It has a lot of skill, no memory of your project beyond what it reads, and a tendency to do what you wrote rather than what you meant. Good delegation states the goal, the constraints, how success is checked, and where to look, and keeps each task small enough to review.",
      sourceIds: ["claude-code-best", "claude-code-overview"],
    },
    {
      id: "tests",
      scene: "tests",
      text: "Give it something to check against. Acceptance tests, an expected output or a failing test to fix turn a vague wish into a target, and letting the agent run them makes feedback instant. The agent gets ground truth from the environment at each step and can correct itself without waiting for you.",
      sourceIds: ["claude-code-best", "building-effective-agents"],
    },
    {
      id: "scope",
      scene: "scope",
      text: "Keep tasks small. A change you can review in minutes is a change you will review properly. Bundling several things multiplies the chance that one is wrong and the effort of finding it. Break a large goal into steps, commit each one that works, and let version control be the undo button.",
      sourceIds: ["claude-code-best"],
      derived: true,
    },
    {
      id: "plan",
      scene: "plan",
      text: "For anything non-trivial ask for a plan first: which files it will change, in what order, what it will leave alone. Reading a plan is cheap and fixing a misunderstanding there costs nothing. State constraints, such as do not change the public interface, and point at files and examples to follow, so the change fits the codebase.",
      sourceIds: ["claude-code-best"],
    },
  ],
  challenges: [
    {
      id: "good-brief",
      title: "Write the brief",
      brief: "Shape a request so the first attempt is right at least 75% of the time, your review takes at most 20 minutes, and the chance it breaks something else is at most 8%.",
      line: { speaker: "kabir", line: "I want to read one small change and trust it." },
      widget: { id: "brief-lab", config: BRIEF_CHALLENGE },
      conditions: [
        { metric: "firstTry", op: ">=", value: 0.75, label: "First attempt right at least 75% of the time" },
        { metric: "reviewMin", op: "<=", value: 20, label: "Review at most 20 minutes" },
        { metric: "regressionRisk", op: "<=", value: 0.08, label: "At most 8% chance of breaking something else" },
      ],
      stars: [{ metric: "firstTry", op: ">=", value: 0.9, label: "First attempt right 90% of the time" }],
      hints: [
        "What gives the agent a way to check its own work?",
        "What does asking for five things do to the odds?",
        "How do you stop it breaking something else?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how you would brief a coding agent for a non-trivial change.",
    rubric: [
      { id: "tests", criterion: "Give acceptance tests or expected behaviour and let the agent run them, so it has ground truth to check against", keyIdea: "tests as the target" },
      { id: "scope", criterion: "Keep each request small and reviewable, committing each step that works", keyIdea: "small steps" },
      { id: "plan", criterion: "Ask for a plan first, state constraints and point at relevant files so the change fits the codebase", keyIdea: "plan and constraints" },
    ],
    exemplar:
      "I would give the agent the acceptance tests or the expected behaviour and let it run them, so it can check itself and fix failures without waiting for me. I would keep each request to one small change that I can review in minutes, and commit each step that works. For anything non-trivial I would ask for a plan before any edit, state what must not change, and point at the files and examples to follow.",
  },
  reviews: [
    {
      id: "dc-est",
      format: "estimate",
      scenario: "A request has a 35% chance of first-try success. Expected attempts are 1 ÷ 35%. About how many attempts, and at 6 minutes of review each, how long?",
      unit: "minutes",
      answer: 17,
      acceptFactor: 1.05,
      breakdown: ["1 ÷ 0.35 = 2.86 attempts", "× 6 minutes ≈ 17 minutes"],
      explain: "Improving the odds from 35% to 70% halves the attempts and the review time.",
    },
    {
      id: "dc-pick",
      format: "pick-fix",
      scenario: "An agent changes a function's signature to make its new feature work and breaks eleven callers. What is the best way to prevent this next time?",
      options: [
        { id: "a", label: "State the constraint: do not change public signatures, and have it run the full test suite" },
        { id: "b", label: "Use a different model" },
        { id: "c", label: "Review more carefully" },
        { id: "d", label: "Ask for shorter changes" },
      ],
      answer: "a",
      explain: "The agent optimised for what it was told. Constraints and a test suite that covers the callers make the breakage visible to it first.",
    },
    {
      id: "dc-order",
      format: "order",
      scenario: "Order these requests by chance of a correct first attempt in the lab, lowest first.",
      items: [
        { id: "bare-big", label: "Five changes, one line" },
        { id: "bare", label: "One change, one line" },
        { id: "tests", label: "One change with tests and a test run" },
        { id: "full", label: "One change, tests, files, constraints, plan" },
      ],
      answer: ["bare-big", "bare", "tests", "full"],
      explain: "21%, 35%, 70% and 90%: each piece of guidance adds, and bundling subtracts.",
    },
    {
      id: "dc-graph",
      format: "predict-graph",
      scenario: "As you add guidance one piece at a time (tests, test runs, files, constraints, plan) to a single change, how does the chance of a correct first attempt change?",
      xLabel: "pieces of guidance added →",
      yLabel: "first attempt correct",
      options: [
        { id: "rise", label: "Rises with each, from 35% toward 90%", points: [35, 50, 70, 78, 85, 90, 90, 90] },
        { id: "flat", label: "Stays at 35%", points: [35, 35, 35, 35, 35, 35, 35, 35] },
        { id: "fall", label: "Falls as the brief grows", points: [35, 30, 25, 20, 15, 10, 5, 5] },
      ],
      answer: "rise",
      explain: "Each piece removes a way for the agent to guess wrong. Gains are largest for tests and for letting the agent run them.",
    },
    {
      id: "dc-flaw",
      format: "spot-flaw",
      scenario: "A developer tells the agent 'make the checkout faster' and approves the first plan without reading it. The agent rewrites the cart module. Tap the step that skipped the check.",
      diagram: {
        nodes: [
          { id: "ask", label: "'make checkout faster'", kind: "client", col: 0, row: 1 },
          { id: "plan", label: "plan: rewrite the cart module", kind: "llm", col: 1, row: 1 },
          { id: "edit", label: "edits 30 files", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "ask", to: "plan" },
          { from: "plan", to: "edit" },
        ],
      },
      answer: "plan->edit",
      explain: "The plan was the cheap place to catch the oversized scope. Reading it, and saying 'only the pricing query', would have saved the rewrite.",
    },
    {
      id: "dc-explain",
      format: "explain",
      scenario: "In two sentences: why do tests make a coding agent more reliable than instructions alone?",
      rubric: [
        { id: "truth", criterion: "Tests give objective feedback from the environment, so the agent knows whether it succeeded without relying on your reading" },
        { id: "loop", criterion: "It can run them, read failures and iterate on its own, which is how engineers work" },
      ],
      exemplar: "Tests give objective feedback from the environment, so the agent knows whether it succeeded without depending on your reading. It can run them, read the failures and iterate by itself, which is how engineers work.",
      explain: "Ground truth beats a description.",
    },
  ],
  codex: {
    oneLiner: "Brief a coding agent like a tech lead: constraints, tests it can run, relevant files, a plan to approve, one small change at a time.",
    keyNumbers: [
      { label: "First-attempt success, bare request versus full brief (lab)", value: "35% versus 90%", sourceId: "claude-code-best" },
      { label: "Bundling five changes (lab)", value: "× 0.6 on the odds", sourceId: "claude-code-best" },
    ],
    tradeoffs: [
      { choice: "Detailed brief", gain: "Higher first-try success; fewer rounds", cost: "Time to write it" },
      { choice: "Small steps", gain: "Easy review and rollback", cost: "More round trips" },
      { choice: "Plan first", gain: "Cheap place to correct scope", cost: "An extra approval step" },
    ],
    seenIn: ["Test-driven prompting with coding agents.", "Plan mode in Claude Code before edits."],
    interviewAngle: "Say: 'tests as the target, small steps, plan first, explicit constraints, and review as if a junior wrote it'.",
    aws: [{ concept: "Agentic coding in the IDE", service: "Amazon Q Developer / Kiro specs" }],
    replay: { id: "brief-lab", config: BRIEF, scene: "tests" },
  },
  interview: [
    "How do you get reliable results from a coding agent?",
    "Why keep requests to a coding agent small?",
    "What would you put in a CLAUDE.md?",
  ],
  deeper: [
    {
      title: "Review is still your job",
      body: "An agent that passes its own tests can still miss what the tests do not cover: a security flaw, a slow query, a change that fits badly with the design. Read every diff, run the full suite and look for what the agent did not touch. The better the brief, the less there is to find, but trust accrues by checking.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "A feature request to a coding agent. The chance its first attempt is right starts at 35% for a bare request. Acceptance tests add 15 points, naming the relevant files 8, stated constraints 7, approving a plan first 5, and letting the agent run the tests itself 20.",
    "Five changes in one request multiply the chance by 0.6. Expected attempts are 1 ÷ the chance. Reviewing one attempt takes 6 minutes for a focused change and 12 for a large one. Without stated constraints the chance a change breaks something else is 18%; with them 5%.",
    "Round figures to compare briefs, not measurements of any model.",
  ],
  sources: [CC_BEST, CC_OVERVIEW, BEA],
  verify: [
    { id: "bare-big", claim: "A bare request for five changes is right 21% of the time", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: false, files: false, constraints: false, plan: false, run: false, big: true }, metric: "firstTry" }, expect: { min: 0.2, max: 0.22 } },
    { id: "bare-review", claim: "…and takes nearly an hour to review", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: false, files: false, constraints: false, plan: false, run: false, big: true }, metric: "reviewMin" }, expect: { min: 55 } },
    { id: "tests-run", claim: "One change with tests and a test run is right 70% of the time", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: true, files: false, constraints: false, plan: false, run: true, big: false }, metric: "firstTry" }, expect: { min: 0.69, max: 0.71 } },
    { id: "full", claim: "A full brief reaches 90%", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: true, files: true, constraints: true, plan: true, run: true, big: false }, metric: "firstTry" }, expect: { min: 0.89 } },
    { id: "risk", claim: "Constraints cut the chance of breaking something else to 5%", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { constraints: true }, metric: "regressionRisk" }, expect: { max: 0.08 } },
    { id: "good-enough", claim: "Tests, a test run and constraints on one change meet the target", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: true, files: false, constraints: true, plan: false, run: true, big: false }, metric: "firstTry" }, expect: { min: 0.75 } },
    { id: "big", claim: "Bundling keeps it under the target even with a full brief", run: "lab", params: { model: "brief-lab", config: BRIEF_CHALLENGE, values: { tests: true, files: true, constraints: true, plan: true, run: true, big: true }, metric: "firstTry" }, expect: { max: 0.75 } },
  ],
});
