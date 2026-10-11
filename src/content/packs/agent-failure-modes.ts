import { definePack } from "../define";

export const FAIL = { start: { stepCap: true, loopDetect: true, budget: 2, validate: true, trace: true } };
export const FAIL_CHALLENGE = {};

const MAST = { id: "mast", title: "M. Cemri et al. (2025), Why Do Multi-Agent LLM Systems Fail? (a taxonomy of failure modes)", url: "https://arxiv.org/abs/2503.13657" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (stopping conditions, guardrails, testing in sandboxes)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const OWASP_LLM = { id: "owasp-llm", title: "OWASP Top 10 for LLM Applications (excessive agency, overreliance)", url: "https://genai.owasp.org/llm-top-10/" };

export default definePack({
  id: "agent-failure-modes",
  title: "Agent Failure Modes",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "agent-runner · one run, 3,114 tool calls, $412", detail: "the same search, over and over" },
    lines: [
      { speaker: "kabir", line: "One agent run kept searching for the same thing for six hours and cost four hundred dollars. The dashboard showed every request as a success." },
      { speaker: "meera", line: "Agents fail in ways ordinary software does not: they loop, they call tools wrongly, and they give confident wrong answers that nothing flags." },
    ],
  },
  predictions: [
    {
      id: "runaway",
      kind: "choice",
      prompt: "Out of 1,000 agent runs, 40 get stuck in a loop. With no step cap, no loop detection and no budget, how much can one stuck run cost before someone stops it, in the lab?",
      options: [
        { id: "cents", label: "About 50 cents" },
        { id: "dollars", label: "About $5" },
        { id: "hundreds", label: "About $400" },
      ],
      answer: "hundreds",
      observe: "runaway-run",
      reveal: {
        text: "With no limit, nothing ends a loop but a person noticing, and each step costs more than the last. The lab uses $400 for a run left going for hours. The fix is cheap and has several layers: a step cap, detection of repeated calls, and a spending limit that does not depend on the agent noticing anything.",
        derived: true,
        line: { speaker: "meera", line: "The loop will never decide to stop on its own." },
      },
    },
    {
      id: "silent",
      kind: "choice",
      prompt: "Of 1,000 runs, 50 end with a confident wrong answer. Without tracing and review, in the lab 40 of them go unnoticed. What does tracing every run, with automatic checks, do?",
      options: [
        { id: "nothing", label: "Nothing: the answers were already wrong" },
        { id: "catch", label: "It lets you catch most of them, leaving about 10 unnoticed" },
        { id: "fix", label: "It fixes them automatically" },
      ],
      answer: "catch",
      observe: "silent",
      reveal: {
        text: "Tracing records every step, tool call and result, so a reviewer, or another model, can check the final answer against what was actually found. It does not stop errors happening; it makes them findable, so they can be counted, fixed and used as eval cases. In the lab it moves 30 of the 40 unnoticed errors into view.",
        derived: true,
        line: { speaker: "rao", line: "An error you cannot see is an error you cannot fix." },
      },
    },
  ],
  widget: { id: "failure-lab", config: FAIL },
  mechanism: [
    {
      id: "loops",
      scene: "cap",
      text: "Loops: the agent repeats the same action or stops making progress, and since every step re-reads the context the cost climbs. Defend in layers: a step cap, detection of repeated identical calls, and a spending limit per run. Each catches what the others miss, and none depends on the model noticing.",
      sourceIds: ["building-effective-agents", "mast"],
    },
    {
      id: "args",
      scene: "validate",
      text: "Wrong tool use: the agent picks the wrong tool, or fills in arguments that are invalid or made up. Validate every call against the tool's schema and business rules before running it, and return a clear error the model can read and correct. Rejecting a bad call costs a step; running it can cost a customer.",
      sourceIds: ["building-effective-agents", "owasp-llm"],
    },
    {
      id: "silent",
      scene: "trace",
      text: "Silent failure: the agent finishes, with a confident answer that is wrong, or claims to have done something it did not. These are the worst, because nothing breaks. Trace every run, sample and grade the traces automatically and by hand, and check claims of action against the system of record.",
      sourceIds: ["mast", "building-effective-agents"],
    },
    {
      id: "more",
      text: "Others to plan for: context overflow in long runs, drift from the original goal, misreading tool output, prompt injection through content the agent reads, and acting on stale information. Test in a sandbox with realistic failures injected, and keep a catalogue of the failures you have met, as eval cases.",
      sourceIds: ["mast", "owasp-llm"],
    },
  ],
  challenges: [
    {
      id: "harden",
      title: "Harden the agent",
      brief: "Per 1,000 runs, 40 get stuck, 80 call tools with bad arguments and 50 end in an unnoticed wrong answer. Choose the defences so the worst stuck run costs at most $1, at most 10 bad calls per 1,000 runs, and at most 15 wrong answers go unnoticed.",
      line: { speaker: "rao", line: "I want the worst day to be a one-dollar day." },
      widget: { id: "failure-lab", config: FAIL_CHALLENGE },
      conditions: [
        { metric: "worstRunCost", op: "<=", value: 1, label: "A stuck run costs at most $1" },
        { metric: "badArgsPer1k", op: "<=", value: 10, label: "At most 10 bad calls per 1,000 runs" },
        { metric: "silentUndetected", op: "<=", value: 15, label: "At most 15 unnoticed wrong answers" },
      ],
      stars: [{ metric: "worstRunCost", op: "<=", value: 0.2, label: "A stuck run costs at most 20 cents" }],
      hints: [
        "Which limits end a loop without needing the model to notice?",
        "Where do you check tool arguments?",
        "How do you find the errors nobody complains about?",
      ],
    },
  ],
  explainBack: {
    prompt: "List the main ways agents fail and how you would defend against each.",
    rubric: [
      { id: "loop", criterion: "Loops are stopped by step caps, repeated-call detection and spending limits, none depending on the model", keyIdea: "layered limits" },
      { id: "args", criterion: "Wrong or invented tool arguments are caught by schema validation and business rules, with readable errors", keyIdea: "validate tool calls" },
      { id: "silent", criterion: "Silent wrong answers are found by tracing and grading runs and checking claims against the system of record", keyIdea: "trace and review" },
    ],
    exemplar:
      "Loops are the costliest, so I would stop them with a step cap, detection of repeated identical calls and a spending limit per run, none of which relies on the model noticing. Wrong or invented tool arguments are caught by validating each call against the schema and business rules and returning an error the model can read. Silent wrong answers are found by tracing every run, grading samples automatically and by hand, and checking claims of action against the real system.",
  },
  reviews: [
    {
      id: "fm-est",
      format: "estimate",
      scenario: "Per 1,000 runs, 80 make a tool call with invalid arguments. Schema validation rejects 90% of those before they run. How many invalid calls per 1,000 runs still execute?",
      unit: "calls",
      answer: 8,
      acceptFactor: 1.01,
      breakdown: ["80 × (1 − 0.90)", "= 8"],
      explain: "Validation does not remove the errors, it turns most of them into recoverable retries.",
    },
    {
      id: "fm-pick",
      format: "pick-fix",
      scenario: "An agent reports 'refund issued' but the payment system shows no refund. The agent had hallucinated the tool result. What is the best control?",
      options: [
        { id: "a", label: "Check claims of action against the system of record before reporting success" },
        { id: "b", label: "Ask the model to be more careful" },
        { id: "c", label: "Use a bigger model" },
        { id: "d", label: "Remove the refund tool" },
      ],
      answer: "a",
      explain: "Trust the system of record, not the agent's report. Confirm that the action happened before telling the user it did.",
    },
    {
      id: "fm-order",
      format: "order",
      scenario: "Order these defences by the cost of a stuck run they allow, highest first (lab values).",
      items: [
        { id: "none", label: "No limits" },
        { id: "cap", label: "20-step cap" },
        { id: "loop", label: "Repeated-call detection" },
      ],
      answer: ["none", "cap", "loop"],
      explain: "$400, $0.90 and $0.15: detecting repetition stops a loop after three calls, the cap after twenty, and without either it runs on.",
    },
    {
      id: "fm-graph",
      format: "predict-graph",
      scenario: "With no limits, a stuck agent run keeps going. As time passes from 1 minute to 6 hours, how does the cumulative cost change?",
      xLabel: "time stuck →",
      yLabel: "cost so far",
      options: [
        { id: "curve", label: "Accelerates: each step costs more than the last", points: [0.1, 0.5, 2, 8, 30, 90, 200, 410] },
        { id: "linear", label: "Rises in a straight line", points: [1, 5, 15, 30, 60, 120, 240, 400] },
        { id: "flat", label: "Levels off", points: [50, 100, 150, 200, 220, 230, 235, 240] },
      ],
      answer: "curve",
      explain: "Longer context makes every later step dearer, so the cost curve bends upward the longer the loop runs.",
    },
    {
      id: "fm-flaw",
      format: "spot-flaw",
      scenario: "The team monitors request success rate and latency for its agent service. A run loops for hours but every individual call returns 200 OK quickly. Tap the missing signal.",
      diagram: {
        nodes: [
          { id: "calls", label: "each tool call: 200 OK, fast", kind: "worker", col: 0, row: 1 },
          { id: "dash", label: "dashboard: success rate, latency", kind: "store", col: 1, row: 1 },
          { id: "bill", label: "bill: $412", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "calls", to: "dash" },
          { from: "dash", to: "bill" },
        ],
      },
      answer: "dash->bill",
      explain: "Per-call metrics cannot see a bad run. Track cost, steps and repeated calls per run, and alert on outliers.",
    },
    {
      id: "fm-explain",
      format: "explain",
      scenario: "In two sentences: why are silent failures the most dangerous agent failures?",
      rubric: [
        { id: "nosignal", criterion: "Nothing errors or alerts, so no one knows the answer was wrong until a customer is harmed" },
        { id: "trust", criterion: "A confident wrong answer is trusted and acted on, so the damage spreads before it is found" },
      ],
      exemplar: "Nothing errors or alerts, so no one knows the answer was wrong until a customer is affected. A confident wrong answer is trusted and acted on, so the harm spreads before anyone finds it.",
      explain: "The quiet ones are the expensive ones.",
    },
  ],
  codex: {
    oneLiner: "Agents loop, misuse tools and fail silently. Cap steps and cost, detect repeats, validate every call, and trace and grade runs.",
    keyNumbers: [
      { label: "Cost of an unlimited stuck run (lab)", value: "about $400", sourceId: "building-effective-agents" },
      { label: "Invalid calls after schema validation (lab)", value: "10% of those without", sourceId: "owasp-llm" },
    ],
    tradeoffs: [
      { choice: "Step and cost caps", gain: "Bounded worst case", cost: "May cut off a legitimate long task" },
      { choice: "Validation", gain: "Fewer bad calls run", cost: "Schemas to write and maintain" },
      { choice: "Tracing and review", gain: "Silent errors become visible", cost: "Storage and review effort" },
    ],
    seenIn: ["Agent runners with max-turn and budget settings.", "Tracing tools like LangSmith, Langfuse and Arize for agent traces."],
    interviewAngle: "Say: 'layered limits for loops, validation of every tool call, claims checked against the system of record, and traces graded continuously'.",
    aws: [{ concept: "Guardrails and agent traces", service: "Amazon Bedrock Guardrails, Agent tracing" }],
    replay: { id: "failure-lab", config: FAIL, scene: "trace" },
  },
  interview: [
    "What are the common failure modes of LLM agents?",
    "How do you stop an agent running up a huge bill?",
    "How do you detect an agent giving confidently wrong answers?",
  ],
  deeper: [
    {
      title: "A taxonomy of failures",
      body: "Researchers who studied hundreds of traces of multi-agent systems grouped failures into specification problems, such as unclear roles or ignoring instructions; inter-agent misalignment, such as withholding information or derailing; and verification problems, such as stopping too early or checking too little. Most were failures of design and checking, not of model ability.",
      sourceIds: ["mast"],
    },
  ],
  honestPhysics: [
    "Per 1,000 agent runs: 40 get stuck in a loop, 80 call a tool with invalid arguments, and 50 end with a confident wrong answer that nobody notices unless the trace is reviewed.",
    "An unlimited loop can run until stopped: $400 in the lab. A 20-step cap holds a stuck run to $0.90; loop detection (the same call three times) to $0.15; a budget cap holds any run to its limit. Schema validation rejects 90% of invalid calls before they run; tracing with automatic review catches 80% of silent wrong answers, compared with 20% without.",
    "Round figures for the exercise.",
  ],
  sources: [MAST, BEA, OWASP_LLM],
  verify: [
    { id: "unlimited", claim: "With no limits a stuck run costs $400", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: {}, metric: "worstRunCost" }, expect: { min: 400, max: 400 } },
    { id: "cap", claim: "A 20-step cap holds it to 90 cents", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: { stepCap: true }, metric: "worstRunCost" }, expect: { max: 1 } },
    { id: "loop", claim: "Loop detection holds it to 15 cents", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: { loopDetect: true }, metric: "worstRunCost" }, expect: { max: 0.2 } },
    { id: "validate", claim: "Validation cuts executed bad calls from 80 to 8", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: { validate: true }, metric: "badArgsPer1k" }, expect: { max: 10 } },
    { id: "trace", claim: "Tracing cuts unnoticed wrong answers from 40 to 10", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: { trace: true }, metric: "silentUndetected" }, expect: { max: 15 } },
    { id: "none-trace", claim: "Without tracing 40 go unnoticed", run: "lab", params: { model: "failure-lab", config: FAIL_CHALLENGE, values: { trace: false }, metric: "silentUndetected" }, expect: { min: 40 } },
  ],
});
