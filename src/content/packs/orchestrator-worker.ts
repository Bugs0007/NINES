import { definePack } from "../define";

export const ORCH = { start: { w: 4, parallel: true } };
export const ORCH_CHALLENGE = {};

const MULTI_RESEARCH = { id: "multi-agent-research", title: "Anthropic (2025), How we built our multi-agent research system", url: "https://www.anthropic.com/engineering/multi-agent-research-system" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (orchestrator-workers)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const LOST_MIDDLE = { id: "lost-in-the-middle", title: "N. Liu et al. (2023), Lost in the Middle: How Language Models Use Long Contexts", url: "https://arxiv.org/abs/2307.03172" };

export default definePack({
  id: "orchestrator-worker",
  title: "Orchestrator-Worker",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "research agent · quality fell on large reports", detail: "one agent, 48,000 tokens of working context" },
    lines: [
      { speaker: "kabir", line: "Our research agent writes good short reports and muddled long ones. By the sixth section it has forgotten what it said in the second." },
      { speaker: "meera", line: "One mind holding six topics is slower and sloppier than six minds holding one each, plus someone to put the pieces together." },
    ],
  },
  predictions: [
    {
      id: "single",
      kind: "choice",
      prompt: "A report has 6 sections, each needing about 8,000 tokens of working context. One agent holds all 48,000. In the lab, quality falls 0.5 points per thousand tokens of context from 95%. What quality does the single agent reach?",
      options: [
        { id: "95", label: "About 95%" },
        { id: "85", label: "About 85%" },
        { id: "70", label: "About 70%" },
      ],
      answer: "70",
      observe: "muddled",
      reveal: {
        text: "0.95 − 0.005 × 48 = 0.71. A very long working context dilutes attention: facts in the middle are used less than those at the ends, and the agent loses track of earlier work. It also takes six sections' worth of time in sequence: 150 seconds.",
        derived: true,
        sourceIds: ["lost-in-the-middle"],
        line: { speaker: "meera", line: "A bigger context window is not the same as using all of it well." },
      },
    },
    {
      id: "serial",
      kind: "choice",
      prompt: "You split the report across 4 workers but run them one after another. Does splitting the work save any time?",
      options: [
        { id: "yes", label: "Yes: each worker is faster" },
        { id: "no", label: "No: the total is the same, plus the coordination overhead" },
        { id: "half", label: "It halves the time" },
      ],
      answer: "no",
      observe: "slow-serial",
      reveal: {
        text: "Run in sequence, four workers still do the same six sections of work, 150 seconds, and add 5 seconds for planning and 8 for synthesis: 163 seconds, slower than the single agent. The speed-up comes only from running the workers in parallel, where the slowest worker sets the time: about 50 seconds.",
        derived: true,
        line: { speaker: "rao", line: "Splitting work and running it in parallel are two separate things." },
      },
    },
  ],
  widget: { id: "orch-lab", config: ORCH },
  mechanism: [
    {
      id: "pattern",
      text: "In the orchestrator-worker pattern, one model, the orchestrator, breaks a task into subtasks, sends each to a worker, and combines what comes back. The workers can be the same model with different instructions. Unlike a fixed workflow, the orchestrator decides at run time how many subtasks there are and what they are.",
      sourceIds: ["building-effective-agents", "multi-agent-research"],
    },
    {
      id: "context",
      scene: "single",
      text: "The main benefit is clean context. Each worker sees only its own subtask and instructions, a few thousand tokens, so it works at its best. The orchestrator and the final synthesis hold only summaries. Quality tracks how much each model must keep in mind, and splitting keeps every context small.",
      sourceIds: ["multi-agent-research", "lost-in-the-middle"],
    },
    {
      id: "parallel",
      scene: "parallel",
      text: "Workers on independent subtasks can run at the same time, so the wall-clock time is the slowest worker's, not the sum. This gives the pattern its speed on wide tasks like research. If the subtasks depend on each other, they must run in order, and the latency benefit disappears.",
      sourceIds: ["multi-agent-research"],
    },
    {
      id: "cost",
      scene: "workers",
      text: "Coordination is not free. The orchestrator's plan, the instructions given to each worker, and the synthesis step add tokens, and each added worker adds more. Quality gains flatten as workers multiply, while overhead keeps growing. Anthropic reports that its multi-agent research system uses several times the tokens of a single agent.",
      sourceIds: ["multi-agent-research"],
    },
  ],
  challenges: [
    {
      id: "split-report",
      title: "Plan the workers",
      brief: "A 6-section research task. Choose the number of workers and whether they run in parallel so quality is at least 80%, the task finishes within 60 seconds, and it costs at most $0.27.",
      line: { speaker: "rao", line: "More workers cost more. I want the smallest team that does the job." },
      widget: { id: "orch-lab", config: ORCH_CHALLENGE },
      conditions: [
        { metric: "quality", op: ">=", value: 0.8, label: "Quality at least 80%" },
        { metric: "latencyS", op: "<=", value: 60, label: "Finishes within 60 seconds" },
        { metric: "costUsd", op: "<=", value: 0.27, label: "At most $0.27" },
      ],
      stars: [{ metric: "costUsd", op: "<=", value: 0.255, label: "At most $0.255" }],
      hints: [
        "How does quality change as each worker's context shrinks?",
        "What does running workers one after another do to latency?",
        "Overhead grows with every worker. Where is the knee?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the orchestrator-worker pattern and what it costs.",
    rubric: [
      { id: "split", criterion: "An orchestrator splits the task, workers each handle a part with a small clean context, and a final step combines the results", keyIdea: "split, work, combine" },
      { id: "parallel", criterion: "Independent workers run in parallel so latency is the slowest worker, not the sum", keyIdea: "parallel workers" },
      { id: "cost", criterion: "Coordination adds tokens, and gains flatten as workers multiply, so use the smallest team that gets the quality", keyIdea: "coordination cost" },
    ],
    exemplar:
      "An orchestrator breaks the task into parts, each worker handles one part with a small, clean context, and a final step combines the results. Because the workers are independent they run in parallel, so the time is that of the slowest worker rather than the sum. Coordination costs tokens for the plan, the instructions and the synthesis, and quality gains flatten as workers multiply, so I would use the smallest team that reaches the quality needed.",
  },
  reviews: [
    {
      id: "ow-est",
      format: "estimate",
      scenario: "A task has 6 subtasks of 25 seconds each, split across 3 workers who run in parallel, with 5 seconds to plan and 8 to synthesise. About how long does it take?",
      unit: "seconds",
      answer: 63,
      acceptFactor: 1.05,
      breakdown: ["each worker does 2 subtasks: 50 seconds", "5 + 50 + 8 = 63 seconds"],
      explain: "The slowest worker sets the middle part, and the plan and synthesis are added on either side.",
    },
    {
      id: "ow-pick",
      format: "pick-fix",
      scenario: "Each subtask in a task depends on the result of the previous one. A team splits it across parallel workers and the results are inconsistent. What is the better design?",
      options: [
        { id: "a", label: "Run the steps in order, as a chain, since they depend on each other" },
        { id: "b", label: "Add more parallel workers" },
        { id: "c", label: "Increase the orchestrator's context" },
        { id: "d", label: "Remove the synthesis step" },
      ],
      answer: "a",
      explain: "Dependencies force an order. Parallel workers need independent subtasks; otherwise a prompt chain is the right shape.",
    },
    {
      id: "ow-order",
      format: "order",
      scenario: "Order these by time to finish a 6-subtask task in the lab, slowest first.",
      items: [
        { id: "serial", label: "4 workers, one after another" },
        { id: "single", label: "One agent" },
        { id: "par", label: "4 workers in parallel" },
      ],
      answer: ["serial", "single", "par"],
      explain: "163 seconds, 150 and about 50: serial workers add overhead for no speed, parallel ones divide the work.",
    },
    {
      id: "ow-graph",
      format: "predict-graph",
      scenario: "As the number of parallel workers grows from 1 to 8, how does the final quality in the lab change?",
      xLabel: "workers →",
      yLabel: "quality",
      options: [
        { id: "peak", label: "Rises, peaks around 5 or 6, then eases", points: [70, 76, 79, 80, 80.5, 80.6, 80.3, 80] },
        { id: "rise", label: "Keeps rising", points: [70, 76, 82, 88, 92, 95, 97, 98] },
        { id: "flat", label: "Stays at 70%", points: [70, 70, 70, 70, 70, 70, 70, 70] },
      ],
      answer: "peak",
      explain: "More workers shrink each worker's context but enlarge the synthesis step's, so the product of the two qualities flattens.",
    },
    {
      id: "ow-flaw",
      format: "spot-flaw",
      scenario: "The orchestrator tells each worker only 'research this topic'. Two workers research the same sources and a third misses the user's real question. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "orch", label: "orchestrator", kind: "llm", col: 0, row: 1 },
          { id: "brief", label: "brief: 'research this topic'", kind: "queue", col: 1, row: 1 },
          { id: "workers", label: "workers duplicate and drift", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "orch", to: "brief" },
          { from: "brief", to: "workers" },
        ],
      },
      answer: "orch->brief",
      explain: "Workers know only what the brief tells them. Give each a clear objective, output format, the sources to use and the boundaries with other workers.",
    },
    {
      id: "ow-explain",
      format: "explain",
      scenario: "In two sentences: why does splitting a task across workers sometimes lower total quality?",
      rubric: [
        { id: "context", criterion: "Workers lose the shared context, so their parts may not fit together or may duplicate or contradict each other" },
        { id: "synthesis", criterion: "The synthesis step must merge many summaries, which loses detail and adds its own errors" },
      ],
      exemplar: "Workers do not share context, so their parts may duplicate, contradict or not fit together. The synthesis step also has to merge many summaries, which loses detail and adds its own errors.",
      explain: "Splitting trades depth of context for width of attention.",
    },
  ],
  codex: {
    oneLiner: "An orchestrator splits the task, workers run in parallel with small clean contexts, and a final step combines. Use the smallest team that works.",
    keyNumbers: [
      { label: "Single agent vs 4 parallel workers: quality (lab)", value: "70% versus 80%", sourceId: "multi-agent-research" },
      { label: "Time (lab)", value: "150 s versus 50 s", sourceId: "multi-agent-research" },
    ],
    tradeoffs: [
      { choice: "More workers", gain: "Smaller contexts; faster in parallel", cost: "More coordination tokens" },
      { choice: "Parallel execution", gain: "Latency is the slowest worker", cost: "Needs independent subtasks" },
      { choice: "Single agent", gain: "Simple; shared context", cost: "Quality slips as context grows" },
    ],
    seenIn: ["Deep-research products with a lead agent and sub-agents.", "Coding agents that spawn sub-agents for searches."],
    interviewAngle: "Say: 'an orchestrator decomposes at run time, workers have isolated contexts and run in parallel, and clear briefs prevent duplication'.",
    aws: [{ concept: "Multi-agent collaboration", service: "Amazon Bedrock Agents multi-agent collaboration" }],
    replay: { id: "orch-lab", config: ORCH, scene: "parallel" },
  },
  interview: [
    "What is the orchestrator-worker pattern?",
    "When does parallelising agents help, and when not?",
    "How should an orchestrator brief its workers?",
  ],
  deeper: [
    {
      title: "Briefs are the interface",
      body: "In Anthropic's research system, early failures came from vague delegation: sub-agents duplicated work or left gaps because they were told too little. Good briefs state the objective, the output format, the tools and sources to use, and the boundaries with the other workers, and tell the worker how much effort the task deserves.",
      sourceIds: ["multi-agent-research"],
    },
  ],
  honestPhysics: [
    "A research task of 6 subtasks, each needing about 8,000 tokens of working context and 25 seconds. One agent holding all of it carries 48,000 tokens; quality is 0.95 − 0.005 per thousand tokens of context. Splitting across W workers gives each 6 ÷ W subtasks plus 2,000 tokens of instructions; a synthesis step holds the workers' summaries (1,500 tokens each) and 2,000 tokens of instructions. Final quality is the product of worker and synthesis quality.",
    "Latency is a 5-second plan, then the slowest worker (in parallel) or the sum (in series), then 8 seconds to synthesise. Tokens are 48,000 for the work plus 4,000 and 1,000 per worker for orchestration, plus 3,000 and 1,000 per worker for synthesis, priced at an average $4 per million.",
    "Round figures for comparison.",
  ],
  sources: [MULTI_RESEARCH, BEA, LOST_MIDDLE],
  verify: [
    { id: "single", claim: "One agent reaches 70% quality in 150 seconds", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 1 }, metric: "quality" }, expect: { min: 0.69, max: 0.71 } },
    { id: "single-lat", claim: "…taking 150 seconds", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 1 }, metric: "latencyS" }, expect: { min: 150, max: 150 } },
    { id: "four", claim: "Four parallel workers reach 80% in 50 seconds", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 4, parallel: true }, metric: "quality" }, expect: { min: 0.8 } },
    { id: "four-lat", claim: "…in 50 seconds", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 4, parallel: true }, metric: "latencyS" }, expect: { max: 60 } },
    { id: "serial", claim: "Four workers one after another take 163 seconds", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 4, parallel: false }, metric: "latencyS" }, expect: { min: 160, max: 165 } },
    { id: "three", claim: "Three workers fall just short of 80%", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 3, parallel: true }, metric: "quality" }, expect: { max: 0.8 } },
    { id: "eight-cost", claim: "Eight workers cost over $0.27", run: "lab", params: { model: "orch-lab", config: ORCH_CHALLENGE, values: { w: 8, parallel: true }, metric: "costUsd" }, expect: { min: 0.27 } },
  ],
});
