import { definePack } from "../define";

export const MULTI = { start: { pattern: "supervisor", n: 4 } };
export const MULTI_CHALLENGE = {};

const AUTOGEN = { id: "autogen", title: "Q. Wu et al. (2023), AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation", url: "https://arxiv.org/abs/2308.08155" };
const MULTI_RESEARCH = { id: "multi-agent-research", title: "Anthropic (2025), How we built our multi-agent research system", url: "https://www.anthropic.com/engineering/multi-agent-research-system" };
const MAST = { id: "mast", title: "M. Cemri et al. (2025), Why Do Multi-Agent LLM Systems Fail?", url: "https://arxiv.org/abs/2503.13657" };
const DEBATE = { id: "debate", title: "Y. Du et al. (2023), Improving Factuality and Reasoning in Language Models through Multiagent Debate", url: "https://arxiv.org/abs/2305.14325" };

export default definePack({
  id: "multi-agent",
  title: "Multi-agent Patterns",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "agents · 6 peers chatting, 13x the tokens of one agent", detail: "quality up 4 points, failures up 9" },
    lines: [
      { speaker: "kabir", line: "Our swarm of six chatting agents scores four points above one agent, costs thirteen times as much and fails far more often." },
      { speaker: "meera", line: "Every extra agent is a conversation you have to pay for and a place for a misunderstanding. The shape of the team matters more than its size." },
    ],
  },
  predictions: [
    {
      id: "chatter",
      kind: "choice",
      prompt: "Six peer agents all talk to each other. In the lab the token cost of such a swarm is N(N − 1) ÷ 4 + N times a single agent. What is the cost for 6 agents?",
      options: [
        { id: "6", label: "About 6 times" },
        { id: "10", label: "About 10 times" },
        { id: "135", label: "About 13.5 times" },
        { id: "30", label: "About 30 times" },
      ],
      answer: "135",
      observe: "chatter",
      reveal: {
        text: "Six agents have 15 pairs, so there are many more conversations than agents: 6 × 5 ÷ 4 + 6 = 13.5. Messages in a fully connected group grow with the square of its size, so doubling the team roughly quadruples the chatter. A supervisor with specialists talks only along the spokes: 4.6 times for six.",
        derived: true,
        line: { speaker: "meera", line: "Every pair is a conversation. Fifteen pairs is a lot of conversation." },
      },
    },
    {
      id: "overbuilt",
      kind: "choice",
      prompt: "A debate of 3 agents over 2 rounds gains about 4.5 points over a single agent and costs 5.4 times the tokens. A supervisor with 4 specialists gains 8 points for 3.4 times. Which design is overbuilt for the benefit?",
      options: [
        { id: "debate", label: "The debate: more cost, less gain" },
        { id: "super", label: "The supervisor" },
        { id: "neither", label: "Neither" },
      ],
      answer: "debate",
      observe: "overbuilt",
      reveal: {
        text: "The debate pays for several rounds of agents rereading each other's long arguments, and the gain from agreeing is smaller than from dividing a task among specialists. Check whether a pattern's benefit comes from its structure or merely from spending more tokens, because spending more can be had much more cheaply.",
        derived: true,
        line: { speaker: "rao", line: "Ask what you get per extra token. Some patterns give back very little." },
      },
    },
  ],
  widget: { id: "multiagent-lab", config: MULTI },
  mechanism: [
    {
      id: "why",
      text: "Multi-agent systems split work among several model instances with their own roles, prompts and tools. They can help when tasks divide into distinct specialisms, when a single context is too crowded, or when independent checking matters. They also multiply cost and the ways coordination can fail, so a single agent that works is the better default.",
      sourceIds: ["autogen", "multi-agent-research"],
    },
    {
      id: "supervisor",
      scene: "supervisor",
      text: "In the supervisor pattern one agent plans and delegates to specialists, then assembles their results. Communication runs along the spokes, so cost grows linearly with the team. It resembles the orchestrator-worker pattern and works well for tasks with clear parts, such as research, code and review.",
      sourceIds: ["multi-agent-research", "autogen"],
    },
    {
      id: "debate",
      text: "In a debate, several agents answer independently, read each other's answers, and revise over a few rounds, often ending with a judge. It can improve factual accuracy and reasoning. Each round has every agent rereading every other agent's output, so the cost per round grows with the number of agents.",
      sourceIds: ["debate"],
    },
    {
      id: "swarm",
      scene: "swarm",
      text: "A swarm lets agents message one another freely. It is the most flexible and the hardest to control: messages grow with the square of the team, and failures such as agents ignoring instructions, withholding information or looping show up often. Research on traces finds most multi-agent failures are about design and coordination, not model ability.",
      sourceIds: ["mast"],
    },
  ],
  challenges: [
    {
      id: "organise",
      title: "Organise the team",
      brief: "A single agent gets 78%, 1× the tokens, 2% coordination failures. Choose the organisation and team size so quality is at least 85%, tokens at most 3.6 times, and coordination failures at most 6.5%.",
      line: { speaker: "rao", line: "Bring me quality per dollar, not agents per dollar." },
      widget: { id: "multiagent-lab", config: MULTI_CHALLENGE },
      conditions: [
        { metric: "quality", op: ">=", value: 0.85, label: "Quality at least 85%" },
        { metric: "tokensX", op: "<=", value: 3.6, label: "At most 3.6× the tokens" },
        { metric: "failurePct", op: "<=", value: 0.065, label: "Coordination failures at most 6.5%" },
      ],
      stars: [],
      hints: [
        "Which organisations keep communication linear?",
        "How many specialists does the quality gain last for?",
        "What does each extra agent cost in tokens and failures?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare supervisor, debate and swarm designs, and say when multiple agents are worth it.",
    rubric: [
      { id: "supervisor", criterion: "A supervisor delegates to specialists with linear communication; good for tasks with distinct parts", keyIdea: "supervisor: linear" },
      { id: "swarm", criterion: "Free-talking peers cost grows with the square of the team, and coordination failures increase", keyIdea: "swarm: quadratic chatter" },
      { id: "when", criterion: "Use multiple agents only when specialisation, context size or checking justify the extra cost, with a single agent as the default", keyIdea: "single agent by default" },
    ],
    exemplar:
      "A supervisor delegates to specialists and talks only along the spokes, so cost grows linearly and it suits tasks with distinct parts. Free-talking peers send messages between every pair, which grows with the square of the team and brings more coordination failures. A debate improves reasoning at the cost of rounds of rereading. I would default to a single agent and add more only when specialisation, crowded context or independent checking clearly justify the cost.",
  },
  reviews: [
    {
      id: "ma-est",
      format: "estimate",
      scenario: "A supervisor with N specialists costs 1 + 0.6 N times a single agent's tokens. For 5 specialists, how many times?",
      unit: "×",
      answer: 4,
      acceptFactor: 1.03,
      breakdown: ["1 + 0.6 × 5", "= 4×"],
      explain: "Cost grows linearly, but so do failures (1% each in the lab).",
    },
    {
      id: "ma-pick",
      format: "pick-fix",
      scenario: "A swarm of eight agents often loops, with agents repeating each other's messages. Cost is huge. What is the best change?",
      options: [
        { id: "a", label: "Replace free chatter with a supervisor that assigns tasks and collects results" },
        { id: "b", label: "Add more agents" },
        { id: "c", label: "Give each agent a longer prompt" },
        { id: "d", label: "Raise the temperature" },
      ],
      answer: "a",
      explain: "A central coordinator limits who talks to whom, cutting the quadratic chatter and the looping that comes from it.",
    },
    {
      id: "ma-order",
      format: "order",
      scenario: "Order these by tokens relative to one agent in the lab, highest first (all with 4 agents).",
      items: [
        { id: "swarm", label: "Swarm of 4" },
        { id: "debate", label: "Debate among 4" },
        { id: "super", label: "Supervisor with 4" },
        { id: "single", label: "One agent" },
      ],
      answer: ["debate", "swarm", "super", "single"],
      explain: "7.2×, 7×, 3.4× and 1×: debate is the costliest here because of repeated rounds, with a swarm close behind.",
    },
    {
      id: "ma-graph",
      format: "predict-graph",
      scenario: "For a fully connected swarm, as the number of agents grows from 2 to 8, how do the tokens relative to one agent change?",
      xLabel: "agents →",
      yLabel: "tokens vs one agent",
      options: [
        { id: "quad", label: "Curves upward: roughly with the square of the team", points: [2.5, 4.5, 7, 10, 13.5, 17.5, 22, 22] },
        { id: "linear", label: "Rises in a straight line", points: [2, 3, 4, 5, 6, 7, 8, 9] },
        { id: "flat", label: "Stays about the same", points: [2, 2, 2, 2, 2, 2, 2, 2] },
      ],
      answer: "quad",
      explain: "Pairs grow as N(N − 1) ÷ 2, so each added agent adds more conversations than the last.",
    },
    {
      id: "ma-flaw",
      format: "spot-flaw",
      scenario: "A team gives every agent the same tools and the same broad instructions: 'work together to solve the task'. They duplicate each other's searches and disagree about who is in charge. Tap the missing design element.",
      diagram: {
        nodes: [
          { id: "a1", label: "agent A: everything", kind: "llm", col: 0, row: 0 },
          { id: "a2", label: "agent B: everything", kind: "llm", col: 0, row: 2 },
          { id: "task", label: "'work together'", kind: "queue", col: 1, row: 1 },
        ],
        edges: [
          { from: "a1", to: "task" },
          { from: "a2", to: "task" },
        ],
      },
      answer: "a1->task",
      explain: "Roles and boundaries are missing. Each agent needs a distinct job, a tool set to match, and a clear owner for decisions.",
    },
    {
      id: "ma-explain",
      format: "explain",
      scenario: "In two sentences: why should you try a single well-prompted agent before a multi-agent design?",
      rubric: [
        { id: "cost", criterion: "Multi-agent systems multiply tokens, latency and coordination failures, so they must buy something a single agent cannot" },
        { id: "baseline", criterion: "A single-agent baseline shows whether the extra structure actually improves results and where it fails" },
      ],
      exemplar: "Multi-agent systems multiply tokens, latency and coordination failures, so they have to deliver something a single agent cannot. A single-agent baseline shows whether the extra structure really improves results and where it falls short.",
      explain: "Earn the complexity.",
    },
  ],
  codex: {
    oneLiner: "Supervisors scale linearly, peers cost the square of the team, debates repeat rounds. Start with one agent and add more only when specialisation pays.",
    keyNumbers: [
      { label: "Peer swarm of N, tokens vs one agent (lab)", value: "N(N − 1) ÷ 4 + N", sourceId: "mast" },
      { label: "Supervisor with N specialists (lab)", value: "1 + 0.6 N", sourceId: "multi-agent-research" },
    ],
    tradeoffs: [
      { choice: "Supervisor with specialists", gain: "Clear roles; linear cost", cost: "Supervisor can bottleneck and mis-delegate" },
      { choice: "Debate", gain: "Better reasoning and factuality", cost: "Rounds of rereading" },
      { choice: "Swarm", gain: "Maximum flexibility", cost: "Quadratic chatter; many failures" },
    ],
    seenIn: ["AutoGen and CrewAI team frameworks.", "Research systems with a lead agent and parallel sub-agents."],
    interviewAngle: "Say: 'default to one agent; add specialists under a supervisor for distinct parts; avoid free-for-all swarms; measure quality per token'.",
    aws: [{ concept: "Supervisor and collaborator agents", service: "Amazon Bedrock multi-agent collaboration" }],
    replay: { id: "multiagent-lab", config: MULTI, scene: "supervisor" },
  },
  interview: [
    "When would you use multiple agents instead of one?",
    "What are the costs of multi-agent systems?",
    "How do you stop agents from looping or conflicting?",
  ],
  deeper: [
    {
      title: "Shared state versus messages",
      body: "Agents can coordinate by sending messages or by reading and writing a shared artefact, such as a plan document, a task board or a file. Shared artefacts avoid the quadratic chatter and leave a record a person can read; messages are flexible but costly and easy to lose. Many production systems pass references to shared state instead of re-sending content.",
      sourceIds: ["multi-agent-research", "mast"],
    },
  ],
  honestPhysics: [
    "A single agent: quality 78%, 1× the tokens, 2% of runs fail on coordination. A supervisor with N specialists adds 2 points per specialist up to 4, costs 1 + 0.6 N times the tokens, and adds 1% failure per specialist. A debate of N agents over 2 rounds costs 1.8 N times the tokens, adds 1.5 points per agent up to 4 and 0.8% failures per agent. A peer swarm costs N(N − 1) ÷ 4 + N times the tokens, adds 1 point per agent up to 4 and 1.5% failures per agent.",
    "Gains stop after four agents in the lab; messages in a fully connected group grow with pairs.",
    "Round figures for comparison.",
  ],
  sources: [AUTOGEN, MULTI_RESEARCH, MAST, DEBATE],
  verify: [
    { id: "swarm6", claim: "A swarm of six costs 13.5 times a single agent", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "swarm", n: 6 }, metric: "tokensX" }, expect: { min: 13.4, max: 13.6 } },
    { id: "swarm-fail", claim: "…with 11% coordination failures", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "swarm", n: 6 }, metric: "failurePct" }, expect: { min: 0.1 } },
    { id: "super4", claim: "A supervisor with four specialists reaches 86% at 3.4×", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "supervisor", n: 4 }, metric: "quality" }, expect: { min: 0.85 } },
    { id: "super4-tok", claim: "…using 3.4 times the tokens", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "supervisor", n: 4 }, metric: "tokensX" }, expect: { max: 3.6 } },
    { id: "super4-fail", claim: "…with 6% failures", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "supervisor", n: 4 }, metric: "failurePct" }, expect: { max: 0.065 } },
    { id: "super3", claim: "Three specialists fall short on quality", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "supervisor", n: 3 }, metric: "quality" }, expect: { max: 0.85 } },
    { id: "super5", claim: "Five specialists cost more and fail more for no extra quality", run: "lab", params: { model: "multiagent-lab", config: MULTI_CHALLENGE, values: { pattern: "supervisor", n: 5 }, metric: "failurePct" }, expect: { min: 0.065 } },
  ],
});
