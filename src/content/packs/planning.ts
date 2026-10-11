import { definePack } from "../define";

export const PLAN = { start: { style: "replan", replans: 3 } };
export const PLAN_CHALLENGE = {};

const PLAN_AND_SOLVE = { id: "plan-and-solve", title: "L. Wang et al. (2023), Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models", url: "https://arxiv.org/abs/2305.04091" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (planning, checkpoints)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const WENG = { id: "weng-agents", title: "L. Weng (2023), LLM Powered Autonomous Agents (task decomposition and reflection)", url: "https://lilianweng.github.io/posts/2023-06-23-agent/" };

export default definePack({
  id: "planning",
  title: "Planning",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "agent · task abandoned at step 7 of 10", detail: "a tool timed out and the plan had no way to continue" },
    lines: [
      { speaker: "kabir", line: "The agent makes a clear plan for a ten-step task, and when step seven fails it just stops. Without a plan it never stops, and it never finishes either." },
      { speaker: "meera", line: "A plan is a prediction of how the work goes. It needs a way to notice when the prediction is wrong, and to write a new one." },
    ],
  },
  predictions: [
    {
      id: "no-plan",
      kind: "choice",
      prompt: "A task has 10 steps and each step fails 8% of the time. With no plan the agent decides each step as it goes. In the lab it wanders on 50% more steps. How often does it complete the task?",
      options: [
        { id: "ninety", label: "About 90%" },
        { id: "fifty-five", label: "About 55%" },
        { id: "ten", label: "About 10%" },
      ],
      answer: "fifty-five",
      observe: "derailed",
      reveal: {
        text: "Without a plan the agent forgets what it was doing and repeats or skips steps, so it uses about 15 steps for the 10 needed and completes the task around 55% of the time in the lab. A plan gives it something to check progress against.",
        derived: true,
        line: { speaker: "meera", line: "Without a plan there is no way to say how far along you are." },
      },
    },
    {
      id: "fixed",
      kind: "choice",
      prompt: "You give the agent a good plan but no way to revise it. Each of the 10 steps still fails 8% of the time, and any failure ends the task. How often does it complete?",
      options: [
        { id: "ninety", label: "About 90%" },
        { id: "forty-three", label: "About 43%" },
        { id: "eight", label: "About 8%" },
      ],
      answer: "forty-three",
      observe: "brittle-plan",
      reveal: {
        text: "0.92 raised to the tenth power is 0.43: a ten-step chain fails more often than it succeeds when each link is 92% reliable. A fixed plan multiplies the failure chances. Letting the agent replan after a failure turns a broken chain into a detour.",
        derived: true,
        line: { speaker: "rao", line: "Ten links at 92% is a chain that breaks more often than it holds." },
      },
    },
  ],
  widget: { id: "agentplan-lab", config: PLAN },
  mechanism: [
    {
      id: "why",
      text: "Planning means writing the steps before taking them. It gives a long task a structure the model can follow and check, reduces wandering, and lets people review the intended work before anything happens. Decomposing a task into steps also lets each step be small enough for the model to do reliably.",
      sourceIds: ["plan-and-solve", "weng-agents"],
    },
    {
      id: "fixed",
      scene: "fixed",
      text: "A plan is a prediction. Real tasks surprise: a tool fails, a file is missing, an assumption was wrong. A fixed plan executed as written breaks at the first surprise, and long plans break often, since the chance of success is the product of the chance of each step. Plans need a way out.",
      sourceIds: ["building-effective-agents"],
      derived: true,
    },
    {
      id: "replan",
      scene: "replan",
      text: "Replanning closes the gap. After each step, or after a failure, the agent compares what happened with what the plan expected, and revises the remaining steps. Allow a small number of replans so it cannot loop forever. Each revision costs some tokens, and turns most failures into delays rather than endings.",
      sourceIds: ["building-effective-agents", "weng-agents"],
    },
    {
      id: "checkpoint",
      scene: "none",
      text: "Make the plan visible. Write it as a checklist the model updates as it works, which also tells a human how far it has got. Check results at the steps that matter most, with tests or a reviewing model. Keep plans short: a plan of three clear steps is followed far more reliably than one of thirty.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  challenges: [
    {
      id: "reliable-plan",
      title: "Make a ten-step task reliable",
      brief: "Ten steps, each failing 8% of the time. Choose how the agent plans and how many replans it may use so at least 97% of tasks complete, a task uses at most 13 steps, and costs at most $0.25.",
      line: { speaker: "rao", line: "Each replan costs money. Allow as many as the reliability needs and no more." },
      widget: { id: "agentplan-lab", config: PLAN_CHALLENGE },
      conditions: [
        { metric: "success", op: ">=", value: 0.97, label: "At least 97% of tasks complete" },
        { metric: "steps", op: "<=", value: 13, label: "At most 13 steps" },
        { metric: "costUsd", op: "<=", value: 0.25, label: "At most $0.25 per task" },
      ],
      stars: [],
      hints: [
        "What fraction of tasks have no failures at all?",
        "What does allowing one failure add? Two? Three?",
        "A plan with no way to revise is only as reliable as its weakest run.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why agents plan, and why plans need revising.",
    rubric: [
      { id: "why", criterion: "A plan breaks a long task into checkable steps, reducing wandering and letting people review intended work", keyIdea: "structure and visibility" },
      { id: "chain", criterion: "Success of a fixed plan is the product of each step's reliability, so long plans fail often", keyIdea: "reliability multiplies" },
      { id: "replan", criterion: "Replanning after a failure, with a bounded number of revisions, turns failures into detours", keyIdea: "bounded replanning" },
    ],
    exemplar:
      "A plan breaks a long task into steps the model can follow and check, which reduces wandering and lets a person review the intended work first. A fixed plan only succeeds if every step does, so reliability multiplies, and ten steps at 92% each complete only 43% of the time. I would let the agent compare each result with the plan and revise the remaining steps after a failure, with a limit of a few replans so it cannot loop, which turns most failures into detours.",
  },
  reviews: [
    {
      id: "pl-est",
      format: "estimate",
      scenario: "A plan has 12 steps, each succeeding 95% of the time, and any failure ends the task. About what share of tasks complete? (0.95¹²)",
      unit: "%",
      answer: 54,
      acceptFactor: 1.05,
      breakdown: ["0.95¹² = 0.540", "54%"],
      explain: "Even good steps compound badly over a long chain, which is the case for short plans and for replanning.",
    },
    {
      id: "pl-pick",
      format: "pick-fix",
      scenario: "An agent follows a 20-step plan and stops when a tool returns an error at step 9. What is the best change?",
      options: [
        { id: "a", label: "Let it replan the remaining steps after a failure, within a limit" },
        { id: "b", label: "Make the plan longer" },
        { id: "c", label: "Remove the plan" },
        { id: "d", label: "Retry the whole task from step 1" },
      ],
      answer: "a",
      explain: "Replanning keeps the work already done and routes around the failure. Restarting wastes the first nine steps.",
    },
    {
      id: "pl-order",
      format: "order",
      scenario: "Order these by tasks completed in the lab, lowest first.",
      items: [
        { id: "fixed", label: "Fixed plan, no replans" },
        { id: "none", label: "No plan" },
        { id: "r1", label: "Plan with one replan" },
        { id: "r3", label: "Plan with three replans" },
      ],
      answer: ["fixed", "none", "r1", "r3"],
      explain: "43%, 55%, 81% and 99%: a fixed plan is more brittle than wandering, and replanning repairs it quickly.",
    },
    {
      id: "pl-graph",
      format: "predict-graph",
      scenario: "With ten steps at 92% each, as the allowed number of replans rises from 0 to 6, how does the share of tasks completed change?",
      xLabel: "replans allowed →",
      yLabel: "tasks completed",
      options: [
        { id: "sat", label: "Climbs steeply, then flattens near 100%", points: [43, 81, 96, 99.4, 99.9, 100, 100, 100] },
        { id: "linear", label: "Rises in a straight line", points: [43, 52, 61, 70, 79, 88, 97, 100] },
        { id: "flat", label: "Stays at 43%", points: [43, 43, 43, 43, 43, 43, 43, 43] },
      ],
      answer: "sat",
      explain: "Most tasks have zero to two failures, so a few replans cover almost all of them.",
    },
    {
      id: "pl-flaw",
      format: "spot-flaw",
      scenario: "An agent is allowed to replan without limit. After a hard step fails, it revises the plan, fails again, and revises again, for hours. Tap the missing control.",
      diagram: {
        nodes: [
          { id: "fail", label: "step fails", kind: "worker", col: 0, row: 1 },
          { id: "replan", label: "replan (no limit)", kind: "llm", col: 1, row: 1 },
          { id: "retry", label: "same step fails again", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "fail", to: "replan" },
          { from: "replan", to: "retry" },
        ],
      },
      answer: "fail->replan",
      explain: "Replanning must be bounded, with a handoff to a person when it is exhausted. Otherwise a hard failure turns into an endless loop of new plans.",
    },
    {
      id: "pl-explain",
      format: "explain",
      scenario: "In two sentences: why keep plans short?",
      rubric: [
        { id: "reliability", criterion: "Every step is a chance to fail, so reliability falls with plan length" },
        { id: "follow", criterion: "Models follow and update short plans better, and short plans are easier for a person to review" },
      ],
      exemplar: "Every step is a chance to fail, so reliability falls as the plan gets longer. Models also follow and update short plans more reliably, and a person can review them at a glance.",
      explain: "Plan in a few clear steps and replan as you learn.",
    },
  ],
  codex: {
    oneLiner: "Write the steps first, check progress against them, and replan on failure within a limit. Fixed plans multiply the chance of failure.",
    keyNumbers: [
      { label: "Success of a fixed 10-step plan at 92% a step", value: "43%", sourceId: "building-effective-agents" },
      { label: "With 3 replans allowed (lab)", value: "99%", sourceId: "building-effective-agents" },
    ],
    tradeoffs: [
      { choice: "No plan", gain: "Flexible and cheap to start", cost: "Wanders; no sense of progress" },
      { choice: "Fixed plan", gain: "Structured and reviewable", cost: "Breaks at the first surprise" },
      { choice: "Plan with bounded replanning", gain: "Robust to failure", cost: "Extra tokens per revision" },
    ],
    seenIn: ["Coding agents that write and update a to-do list.", "Plan-and-execute agent frameworks."],
    interviewAngle: "Say: 'plan in a few checkable steps, update the plan from each result, and bound the replans so there is a handoff'.",
    aws: [{ concept: "Orchestration with retries and catch states", service: "AWS Step Functions with Bedrock" }],
    replay: { id: "agentplan-lab", config: PLAN, scene: "replan" },
  },
  interview: [
    "Why do agents plan before acting?",
    "What happens to a long plan when one step fails?",
    "How do you stop replanning from looping?",
  ],
  deeper: [
    {
      title: "Reflection",
      body: "A close cousin of replanning is reflection: after an attempt, the agent critiques its own result, writes down what went wrong, and tries again with that note in context. It helps most when there is a concrete signal to reflect on, such as a failing test or an error message, and least when the only signal is the model's own opinion.",
      sourceIds: ["weng-agents"],
    },
  ],
  honestPhysics: [
    "A task of 10 steps, each failing independently 8% of the time. With no plan the agent wanders on 50% more steps and completes about 55% of tasks. A fixed plan is abandoned at the first failure: 0.92¹⁰, 43%.",
    "With replanning the agent revises the remaining plan after a failure, up to a set number of times; each replan costs 1.5 steps' worth of tokens. Success is the chance of at most that many failures in 10 steps. A step costs $0.02.",
    "Failures are independent and a replan always succeeds within the budget.",
  ],
  sources: [PLAN_AND_SOLVE, BEA, WENG],
  verify: [
    { id: "none", claim: "No plan completes 55% of tasks in 15 steps", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "none" }, metric: "success" }, expect: { min: 0.55, max: 0.55 } },
    { id: "fixed", claim: "A fixed plan completes 43%", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "fixed" }, metric: "success" }, expect: { min: 0.43, max: 0.44 } },
    { id: "r1", claim: "One replan lifts it to 81%", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "replan", replans: 1 }, metric: "success" }, expect: { min: 0.8, max: 0.82 } },
    { id: "r2", claim: "Two replans give 96%, short of the target", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "replan", replans: 2 }, metric: "success" }, expect: { max: 0.97 } },
    { id: "r3", claim: "Three replans give 99%", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "replan", replans: 3 }, metric: "success" }, expect: { min: 0.97 } },
    { id: "r3-steps", claim: "…in about 11 steps", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "replan", replans: 3 }, metric: "steps" }, expect: { max: 13 } },
    { id: "r3-cost", claim: "…for 22 cents", run: "lab", params: { model: "agentplan-lab", config: PLAN_CHALLENGE, values: { style: "replan", replans: 3 }, metric: "costUsd" }, expect: { max: 0.25 } },
  ],
});
