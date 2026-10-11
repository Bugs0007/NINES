import { definePack } from "../define";

export const WFA = { lockNovel: true, novel: 15, start: { design: "router" } };
export const WFA_CHALLENGE = { lockNovel: true, novel: 15 };

const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (workflows versus agents; start simple)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const OPENAI_AGENTS = { id: "openai-agents-guide", title: "OpenAI: A practical guide to building agents (when to use an agent)", url: "https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/" };

export default definePack({
  id: "workflows-vs-agents",
  title: "Workflows vs Agents",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "support bot · $0.15 and 25 seconds for a password reset", detail: "built as a free-running agent" },
    lines: [
      { speaker: "kabir", line: "We built the support bot as an agent that can do anything. A password reset now takes twenty-five seconds and fifteen cents, against three seconds before." },
      { speaker: "meera", line: "A workflow is a path you drew; an agent finds its own. Drawing the path is cheaper and safer wherever you know it in advance." },
    ],
  },
  predictions: [
    {
      id: "pricey",
      kind: "choice",
      prompt: "A free-running agent handles 85% routine requests and 15% novel ones, at $0.15 and 25 seconds each. A workflow does routine requests at $0.02 and 3 seconds. What does the agent-for-everything design cost compared with the workflow?",
      options: [
        { id: "same", label: "About the same" },
        { id: "three", label: "About three times as much" },
        { id: "seven", label: "About seven times as much" },
      ],
      answer: "seven",
      observe: "pricey-agent",
      reveal: {
        text: "$0.15 against $0.02 is 7.5 times, and 25 seconds against 3 is eight times slower. For the 85% of requests that follow a known pattern, the agent's flexibility is bought and never used. Its benefit appears only on the novel 15%.",
        derived: true,
        line: { speaker: "meera", line: "Flexibility you do not need is just cost with extra steps." },
      },
    },
    {
      id: "brittle",
      kind: "choice",
      prompt: "You switch to the fixed workflow. It succeeds on 97% of routine requests and 40% of novel ones. With 15% of requests novel, what is the overall success rate?",
      options: [
        { id: "97", label: "About 97%" },
        { id: "88", label: "About 88%" },
        { id: "70", label: "About 70%" },
      ],
      answer: "88",
      observe: "brittle-flow",
      reveal: {
        text: "0.85 × 97% plus 0.15 × 40% is 88%. The workflow is excellent where it was designed to be and falls over on anything outside, which is what happens to the other 15%. The agent gets 90% overall, at seven times the price; neither alone is the answer.",
        derived: true,
        line: { speaker: "kabir", line: "So the cheap one fails the hard ones, and the flexible one is dear for the easy ones." },
      },
    },
  ],
  widget: { id: "wfagent-lab", config: WFA },
  mechanism: [
    {
      id: "defs",
      text: "A workflow runs a path that code defines: step one calls the model, step two calls a tool, step three formats the answer. The model fills in steps, but the steps and their order are fixed. An agent lets the model decide the next step, and the tools to use, in a loop. Both use the same models and tools.",
      sourceIds: ["building-effective-agents"],
    },
    {
      id: "workflow",
      scene: "workflow",
      text: "Workflows are predictable. They cost the same each time, take a known time, are easy to test and debug, and fail in understandable ways. They suit tasks whose steps you can write down: classify, extract, route, summarise, draft. Common shapes are chains, routing by type, and running parts in parallel.",
      sourceIds: ["building-effective-agents"],
    },
    {
      id: "agent",
      scene: "agent",
      text: "Agents are flexible. They cope with problems whose steps cannot be known in advance, such as open-ended research or fixing an unfamiliar bug. They cost more and take longer, vary from run to run, and can fail in ways that are harder to foresee. Use one only where the flexibility pays for itself.",
      sourceIds: ["building-effective-agents", "openai-agents-guide"],
    },
    {
      id: "router",
      scene: "router",
      text: "Start with the simplest design that works and add autonomy only where measurements show a gap. A common arrangement sends routine requests down a workflow and passes the unusual ones to an agent. The router's accuracy sets how much of the saving is real: here it recognises 90% of the novel requests.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  challenges: [
    {
      id: "pick-design",
      title: "Pick the design",
      brief: "85% of requests are routine and 15% novel. Choose the design so at least 93% of requests are handled well, a request costs at most 5 cents on average, and the average time is at most 8 seconds.",
      line: { speaker: "rao", line: "I will pay for an agent where it earns its keep and not on password resets." },
      widget: { id: "wfagent-lab", config: WFA_CHALLENGE },
      conditions: [
        { metric: "success", op: ">=", value: 0.93, label: "At least 93% handled well" },
        { metric: "costUsd", op: "<=", value: 0.05, label: "At most 5 cents a request" },
        { metric: "latencyS", op: "<=", value: 8, label: "At most 8 seconds on average" },
      ],
      stars: [],
      hints: [
        "How does the workflow do on novel requests?",
        "What does the agent cost on routine ones?",
        "Is there a design that gives each request the lightest tool that can handle it?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain when to build a workflow, when an agent, and how they combine.",
    rubric: [
      { id: "workflow", criterion: "Workflows follow code-defined paths: predictable, cheap, fast and easy to test; best when steps are known", keyIdea: "workflow: known steps" },
      { id: "agent", criterion: "Agents let the model choose steps in a loop: flexible for open-ended tasks but slower, costlier and more variable", keyIdea: "agent: open-ended, costly" },
      { id: "combine", criterion: "Start simple and route routine requests to workflows and only novel ones to an agent, measuring where the gap is", keyIdea: "route by need" },
    ],
    exemplar:
      "A workflow follows a path defined in code, so it is cheap, fast, predictable and easy to test, and it suits tasks where I know the steps. An agent lets the model choose its own steps in a loop, which copes with open-ended problems but costs more, takes longer and varies between runs. I would start with the simplest design, route routine requests to a workflow and only the novel ones to an agent, and add autonomy where measurements show the workflow falling short.",
  },
  reviews: [
    {
      id: "wa-est",
      format: "estimate",
      scenario: "A router sends 85% of requests to a workflow at $0.02 and 15% to an agent at $0.15. Ignoring routing errors, what is the average cost per request?",
      unit: "USD",
      answer: 0.0395,
      acceptFactor: 1.1,
      breakdown: ["0.85 × $0.02 = $0.017", "0.15 × $0.15 = $0.0225", "total ≈ $0.04"],
      explain: "Most of the saving comes from the share handled by the cheap path.",
    },
    {
      id: "wa-pick",
      format: "pick-fix",
      scenario: "A team uses an agent to extract fields from invoices of 12 known formats. Cost and variance are high and accuracy is 94%. What is the best redesign?",
      options: [
        { id: "a", label: "A workflow: classify the format, then run a fixed extraction prompt for that format" },
        { id: "b", label: "A bigger agent" },
        { id: "c", label: "More tools" },
        { id: "d", label: "A multi-agent system" },
      ],
      answer: "a",
      explain: "The steps are known, so write them down. A workflow is cheaper, faster and usually more accurate when the task is well defined.",
    },
    {
      id: "wa-order",
      format: "order",
      scenario: "Order these designs by average cost per request in the lab, highest first.",
      items: [
        { id: "agent", label: "Agent for everything" },
        { id: "router", label: "Router: workflow plus agent" },
        { id: "workflow", label: "Workflow only" },
      ],
      answer: ["agent", "router", "workflow"],
      explain: "$0.15, $0.038 and $0.02: the router pays for the agent only on the share that needs it.",
    },
    {
      id: "wa-graph",
      format: "predict-graph",
      scenario: "As the share of novel requests grows from 0% to 100%, how does the success rate of a fixed workflow change?",
      xLabel: "novel share →",
      yLabel: "workflow success",
      options: [
        { id: "fall", label: "Falls steadily from 97% to 40%", points: [97, 91, 85, 79, 73, 62, 51, 40] },
        { id: "flat", label: "Stays at 97%", points: [97, 97, 97, 97, 97, 97, 97, 97] },
        { id: "rise", label: "Rises", points: [40, 51, 62, 73, 79, 85, 91, 97] },
      ],
      answer: "fall",
      explain: "A workflow is only as good as the paths you wrote. The more requests fall outside them, the more it fails.",
    },
    {
      id: "wa-flaw",
      format: "spot-flaw",
      scenario: "The router sends every request mentioning 'refund' to the refund workflow. A customer writes 'I want a refund but also need my address changed and a call back'. The workflow handles only the refund. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "req", label: "multi-part request", kind: "client", col: 0, row: 1 },
          { id: "router", label: "router: keyword 'refund'", kind: "lb", col: 1, row: 1 },
          { id: "wf", label: "refund workflow only", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "router" },
          { from: "router", to: "wf" },
        ],
      },
      answer: "req->router",
      explain: "A keyword rule cannot recognise a request outside the pattern. A model-based classifier with an 'other' route to the agent catches the unusual ones.",
    },
    {
      id: "wa-explain",
      format: "explain",
      scenario: "In two sentences: why does Anthropic's guidance say to start with the simplest solution?",
      rubric: [
        { id: "cost", criterion: "Agents add latency, cost and variability, so they should be used only where measured benefit justifies them" },
        { id: "debug", criterion: "Simpler designs are easier to test and debug, and can be made more autonomous later where the data shows a gap" },
      ],
      exemplar: "Agents add latency, cost and variability, so they should earn their place with a measured benefit. Simple designs are easier to test and debug, and can be given more autonomy later where the data shows a gap.",
      explain: "Add autonomy where it pays.",
    },
  ],
  codex: {
    oneLiner: "Workflows follow paths you define: cheap, fast, testable. Agents choose their own steps: flexible, costly, variable. Route by need and start simple.",
    keyNumbers: [
      { label: "Workflow versus agent cost per request (lab)", value: "$0.02 versus $0.15", sourceId: "building-effective-agents" },
      { label: "Workflow versus agent time (lab)", value: "3 s versus 25 s", sourceId: "building-effective-agents" },
    ],
    tradeoffs: [
      { choice: "Workflow", gain: "Predictable, cheap, fast", cost: "Brittle outside its paths" },
      { choice: "Agent", gain: "Handles the unforeseen", cost: "Cost, latency, variance" },
      { choice: "Router", gain: "Each request gets the lightest handler", cost: "Router errors and two systems to maintain" },
    ],
    seenIn: ["Support bots with fixed flows for common intents and an agent for the rest.", "Document pipelines with classify, extract and validate stages."],
    interviewAngle: "Say: 'workflow wherever the steps are known, an agent only for open-ended work, and a router to send each request to the cheapest handler that works'.",
    aws: [{ concept: "State machines versus agents", service: "AWS Step Functions and Amazon Bedrock Agents" }],
    replay: { id: "wfagent-lab", config: WFA, scene: "router" },
  },
  interview: [
    "What is the difference between a workflow and an agent?",
    "When would you not use an agent?",
    "How would you combine a workflow with an agent?",
  ],
  deeper: [
    {
      title: "The patterns that sit between",
      body: "Between a single call and a free agent lie a handful of workflow patterns: prompt chaining (step after step), routing (classify, then specialise), parallelisation (run parts at once or vote), orchestrator-workers (a model splits the task and farms it out) and evaluator-optimizer (one model proposes, another critiques). Most production systems are some combination of these.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "A support assistant. A fixed workflow succeeds on 97% of routine requests and 40% of novel ones, costs $0.02 and takes 3 seconds. A free-running agent succeeds on 92% of routine and 78% of novel requests, costs $0.15 and takes 25 seconds.",
    "A router sends routine requests to the workflow and novel ones to the agent; it recognises 90% of novel requests and the rest go to the workflow. The novel share is 15% in the challenge.",
    "Round figures for comparison.",
  ],
  sources: [BEA, OPENAI_AGENTS],
  verify: [
    { id: "wf-s", claim: "A workflow alone handles 88% well", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "workflow" }, metric: "success" }, expect: { min: 0.88, max: 0.89 } },
    { id: "ag-s", claim: "An agent alone handles 90%", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "agent" }, metric: "success" }, expect: { min: 0.89, max: 0.91 } },
    { id: "ag-c", claim: "…at 15 cents a request", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "agent" }, metric: "costUsd" }, expect: { min: 0.15, max: 0.15 } },
    { id: "rt-s", claim: "A router handles 93.6% well", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "router" }, metric: "success" }, expect: { min: 0.93 } },
    { id: "rt-c", claim: "…at under 4 cents", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "router" }, metric: "costUsd" }, expect: { max: 0.05 } },
    { id: "rt-t", claim: "…in about 6 seconds", run: "lab", params: { model: "wfagent-lab", config: WFA_CHALLENGE, values: { design: "router" }, metric: "latencyS" }, expect: { max: 8 } },
  ],
});
