import { definePack } from "../define";

export const LOOP = { start: { cap: 20, trunc: true, cache: true } };
export const LOOP_CHALLENGE = {};

const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (the agent loop, stopping conditions)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const ANTHROPIC_CACHE = { id: "anthropic-caching", title: "Anthropic docs: Prompt caching (cache reads cost 10% of input)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" };
const ANTHROPIC_TOOLS = { id: "anthropic-tool-use", title: "Anthropic docs: Tool use with Claude", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" };

export default definePack({
  id: "agent-loop",
  title: "The Agent Loop",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "agent · one stuck run cost $8.40", detail: "50 steps, each re-reading the whole conversation" },
    lines: [
      { speaker: "kabir", line: "Most tasks cost a few cents, and one run got stuck calling the same tool for fifty steps and cost eight dollars. Each step cost more than the last." },
      { speaker: "meera", line: "An agent is a loop, and every turn re-reads everything before it. The cost of a long run grows with the square of its length." },
    ],
  },
  predictions: [
    {
      id: "cut",
      kind: "choice",
      prompt: "Tasks need a median of 6 steps with a long tail, and 5% of tasks get stuck and never finish. You cap the loop at 5 steps. What share of tasks finish?",
      options: [
        { id: "95", label: "About 95%" },
        { id: "75", label: "About 75%" },
        { id: "44", label: "Under half, about 44%" },
      ],
      answer: "44",
      observe: "cut-short",
      reveal: {
        text: "A median of 6 means about half of the tasks need more than 5 steps, so a cap of 5 cuts off real work along with the stuck runs: roughly 44% finish. The cap has to sit above the work most tasks need and below the cost of a runaway; here about 20 steps finishes 91%.",
        derived: true,
        line: { speaker: "meera", line: "A cap that is too low stops the good tasks along with the bad ones." },
      },
    },
    {
      id: "runaway",
      kind: "choice",
      prompt: "A stuck run goes to a 50-step cap with raw tool results of 3,000 tokens each. Each step re-sends the conversation so far. About what does that one run cost?",
      options: [
        { id: "cents", label: "About 50 cents" },
        { id: "eight", label: "About $8" },
        { id: "eighty", label: "About $80" },
      ],
      answer: "eight",
      observe: "runaway",
      reveal: {
        text: "By step 50 the input is around 165,000 tokens, and the total across all steps is about 4 million input tokens: roughly $8.40. Truncating each result to 300 tokens cuts it to $0.40 or so, and caching the repeated prefix cuts it by another large factor.",
        derived: true,
        sourceIds: ["anthropic-caching"],
        line: { speaker: "rao", line: "The tenth step is cheap. The fiftieth is the one that appears on the bill." },
      },
    },
  ],
  widget: { id: "loop-lab", config: LOOP },
  mechanism: [
    {
      id: "loop",
      text: "An agent is a loop. The model reads the conversation and either answers or requests a tool; the code runs the tool and appends the result; the loop repeats. It ends when the model answers, or a limit is hit. The model decides each next step, which is what makes it flexible and what makes its length unpredictable.",
      sourceIds: ["building-effective-agents", "anthropic-tool-use"],
    },
    {
      id: "growth",
      scene: "context",
      text: "Every step appends the model's output and the tool result, so the context grows by a fixed amount each turn and each call re-reads all of it. Total input tokens over n steps therefore grow with n squared. Truncating or summarising tool results keeps the per-step growth small, which matters more as runs lengthen.",
      sourceIds: ["building-effective-agents"],
      derived: true,
    },
    {
      id: "cap",
      scene: "cap",
      text: "A step cap is the safety net. Set it from data: above the number of steps most real tasks need, below the cost you can tolerate for a run that never ends. Pair it with a cost cap and with repeated-call detection, and return something useful, a partial result or a handoff, when a limit is hit.",
      sourceIds: ["building-effective-agents"],
    },
    {
      id: "cache",
      scene: "cache",
      text: "Most of each step's input is the same as the previous step's. Prompt caching lets the repeated prefix be read at a tenth of the input price. In a long loop that turns a quadratic bill into something much closer to linear. Keep the prefix stable: put changing content at the end.",
      sourceIds: ["anthropic-caching"],
    },
  ],
  challenges: [
    {
      id: "loop-budget",
      title: "Cap the loop",
      brief: "Tasks need a median of 6 steps; 5% get stuck. Choose the step cap and context handling so at least 90% of tasks finish, the average task costs at most $0.12, and a stuck run costs at most $0.40.",
      line: { speaker: "rao", line: "I will fund a loop that finishes the work. I will not fund the one that finishes the budget." },
      widget: { id: "loop-lab", config: LOOP_CHALLENGE },
      conditions: [
        { metric: "successRate", op: ">=", value: 0.9, label: "At least 90% of tasks finish" },
        { metric: "costPerTask", op: "<=", value: 0.12, label: "Average task at most $0.12" },
        { metric: "worstCost", op: "<=", value: 0.4, label: "A stuck run at most $0.40" },
      ],
      stars: [{ metric: "costPerTask", op: "<=", value: 0.05, label: "Average task at most $0.05" }],
      hints: [
        "How many steps do 90% of tasks need?",
        "What does a stuck run cost with raw 3,000-token results?",
        "Which two settings shrink the cost of re-reading?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the agent loop and why its cost grows faster than its length.",
    rubric: [
      { id: "loop", criterion: "The model picks a tool or answers, the code runs it and appends the result, and the loop repeats until the model answers or a limit is hit", keyIdea: "model decides each step" },
      { id: "quad", criterion: "Each step re-reads the growing conversation, so total input tokens grow with the square of the steps", keyIdea: "cost grows quadratically" },
      { id: "limits", criterion: "Cap steps and cost, truncate results and cache the prefix, with caps above what real tasks need", keyIdea: "caps, truncation, caching" },
    ],
    exemplar:
      "The model reads the conversation and either answers or asks for a tool; my code runs the tool and appends the result, and the loop repeats until the model answers or a limit is hit. Every step re-reads everything before it, so the total input tokens grow with the square of the number of steps, and a stuck run gets expensive quickly. I would set a step cap above what most tasks need, truncate tool results, cache the stable prefix, and return a partial result when a limit is hit.",
  },
  reviews: [
    {
      id: "al-est",
      format: "estimate",
      scenario: "A loop starts at 2,000 tokens and adds 3,300 tokens (a 3,000-token result plus 300 of output) per step. About how many input tokens does step 20 read?",
      unit: "tokens",
      answer: 64700,
      acceptFactor: 1.05,
      breakdown: ["2,000 + 19 × 3,300", "= 64,700"],
      explain: "Step 20 re-reads all nineteen earlier results, so its input is thirty times that of step 1.",
    },
    {
      id: "al-pick",
      format: "pick-fix",
      scenario: "An agent repeatedly calls a search tool with the same query and gets the same result. It has a 50-step cap and no other limit. What is the most direct addition?",
      options: [
        { id: "a", label: "Detect repeated identical calls and stop the loop or change approach" },
        { id: "b", label: "Raise the step cap" },
        { id: "c", label: "Increase the temperature" },
        { id: "d", label: "Add more tools" },
      ],
      answer: "a",
      explain: "A repeated call with the same result means no progress. Detecting it stops the waste in three steps, not fifty.",
    },
    {
      id: "al-order",
      format: "order",
      scenario: "Order these by cost of a run stuck at a 20-step cap, highest first.",
      items: [
        { id: "raw", label: "Raw results, no cache" },
        { id: "trunc", label: "Truncated results, no cache" },
        { id: "both", label: "Truncated results and cached prefix" },
      ],
      answer: ["raw", "trunc", "both"],
      explain: "$1.39, $0.37 and $0.11 in the lab: shrinking what is added and discounting what is repeated both help.",
    },
    {
      id: "al-graph",
      format: "predict-graph",
      scenario: "With truncated results and no caching, as the step cap rises from 5 to 60, how does the cost of a run that hits the cap change?",
      xLabel: "step cap →",
      yLabel: "cost of a capped run",
      options: [
        { id: "quad", label: "Curves upward: roughly in proportion to the cap squared", points: [0.02, 0.07, 0.15, 0.37, 0.8, 1.3, 1.9, 2.6] },
        { id: "linear", label: "Rises in a straight line", points: [0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2] },
        { id: "flat", label: "Stays the same", points: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2] },
      ],
      answer: "quad",
      explain: "Every added step re-reads a longer conversation than the last, so total tokens grow with the square of the steps.",
    },
    {
      id: "al-flaw",
      format: "spot-flaw",
      scenario: "A team lets the loop run 'until the model says it is done', with no step or cost limit. One run keeps asking for another search and never finishes. Tap the missing control.",
      diagram: {
        nodes: [
          { id: "model", label: "model: 'one more search'", kind: "llm", col: 0, row: 1 },
          { id: "loop", label: "loop continues forever", kind: "worker", col: 1, row: 1 },
          { id: "bill", label: "bill grows each step", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "model", to: "loop" },
          { from: "loop", to: "bill" },
        ],
      },
      answer: "model->loop",
      explain: "The only exit depends on the model's own decision. A step cap and a cost cap give the loop an exit that does not.",
    },
    {
      id: "al-explain",
      format: "explain",
      scenario: "In two sentences: why does truncating tool results help more in long runs than short ones?",
      rubric: [
        { id: "reread", criterion: "Every later step re-reads every earlier result, so each token added early is paid for again at every later step" },
        { id: "compound", criterion: "The saving per result is multiplied by the remaining steps, so it grows with run length" },
      ],
      exemplar: "Every later step re-reads every earlier result, so a token added early is paid for again at each following step. The saving on each result is multiplied by the number of steps still to come, so it grows with the length of the run.",
      explain: "Early tokens are paid for repeatedly.",
    },
  ],
  codex: {
    oneLiner: "An agent loops: call, tool, observe. Each turn re-reads everything, so cost grows with steps squared. Cap steps and cost, truncate results, cache the prefix.",
    keyNumbers: [
      { label: "Total input tokens over n steps", value: "grows as n²", sourceId: "building-effective-agents" },
      { label: "Cached prefix read price", value: "10% of input", sourceId: "anthropic-caching" },
    ],
    tradeoffs: [
      { choice: "Higher step cap", gain: "More tasks finish", cost: "Costlier stuck runs" },
      { choice: "Truncate or summarise results", gain: "Much slower context growth", cost: "May drop detail the model needs" },
      { choice: "Cache the prefix", gain: "Large saving on repeated input", cost: "Needs a stable prefix" },
    ],
    seenIn: ["Coding agents and research agents capping iterations.", "Agent SDK max-turn and budget settings."],
    interviewAngle: "Say: 'cap steps and cost from data, detect repeated calls, truncate tool results, cache the prefix, and return a partial result at the limit'.",
    aws: [{ concept: "Agent session limits and prompt caching", service: "Amazon Bedrock Agents / Converse" }],
    replay: { id: "loop-lab", config: LOOP, scene: "cache" },
  },
  interview: [
    "What is an agent loop?",
    "Why is a long agent run expensive?",
    "How do you stop an agent running forever?",
  ],
  deeper: [
    {
      title: "Stopping gracefully",
      body: "Hitting a limit should not throw away the work. When a cap triggers, ask the model for a summary of what it did and what remains, return that as a partial result, or hand the task to a person with the trace attached. A well-handled limit turns a failed run into a useful one.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "An agent loops: model call, tool call, observation. Steps needed are lognormal with a median of 6 and a 99th percentile of 30. 5% of tasks never finish by themselves and run to the step cap.",
    "Each step adds 300 tokens of output and the tool result (3,000 tokens raw or 300 truncated) to a 2,000-token starting context, and re-reads the lot. Prices are $2 per million input and $10 per million output; cached prefix reads cost a tenth.",
    "Success counts finishing tasks reached within the cap.",
  ],
  sources: [BEA, ANTHROPIC_CACHE, ANTHROPIC_TOOLS],
  verify: [
    { id: "cap5", claim: "A 5-step cap finishes under half the tasks", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 5 }, metric: "successRate" }, expect: { max: 0.5 } },
    { id: "cap20", claim: "A 20-step cap finishes 91%", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 20, trunc: true, cache: true }, metric: "successRate" }, expect: { min: 0.9 } },
    { id: "runaway", claim: "A raw 50-step run costs over $8", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 50, trunc: false, cache: false }, metric: "worstCost" }, expect: { min: 8, max: 9 } },
    { id: "trunc", claim: "Truncating drops a 20-step stuck run to under $0.40", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 20, trunc: true, cache: false }, metric: "worstCost" }, expect: { max: 0.4 } },
    { id: "avg", claim: "…and the average task to about 11 cents", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 20, trunc: true, cache: false }, metric: "costPerTask" }, expect: { max: 0.12 } },
    { id: "cached", claim: "Adding the cache brings the average to about 4 cents", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 20, trunc: true, cache: true }, metric: "costPerTask" }, expect: { max: 0.05 } },
    { id: "raw-avg", claim: "Without either, 20 steps cost over 30 cents on average", run: "lab", params: { model: "loop-lab", config: LOOP_CHALLENGE, values: { cap: 20, trunc: false, cache: false }, metric: "costPerTask" }, expect: { min: 0.3 } },
  ],
});
