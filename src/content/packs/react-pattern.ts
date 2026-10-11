import { definePack } from "../define";

export const REACT = { start: { mode: "react", verify: true } };
export const REACT_CHALLENGE = {};

const YAO = { id: "yao-react", title: "S. Yao et al. (2022), ReAct: Synergizing Reasoning and Acting in Language Models", url: "https://arxiv.org/abs/2210.03629" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const WEI = { id: "wei-cot", title: "J. Wei et al. (2022), Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", url: "https://arxiv.org/abs/2201.11903" };

export default definePack({
  id: "react-pattern",
  title: "ReAct",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "assistant · confidently named the wrong founder", detail: "no search was run, the model answered from memory" },
    lines: [
      { speaker: "kabir", line: "Ask it a question that needs two lookups and it either makes up the second fact or searches for the wrong thing. Both answers look the same on screen." },
      { speaker: "meera", line: "Think, look something up, read what came back, then think again. The pattern is old and it still works." },
    ],
  },
  predictions: [
    {
      id: "invented",
      kind: "choice",
      prompt: "A multi-hop question needs facts from a search tool. If the model answers directly from memory, in the lab what share of its answers are invented?",
      options: [
        { id: "few", label: "About 5%" },
        { id: "fifth", label: "About 20%" },
        { id: "45", label: "About 45%" },
        { id: "most", label: "Over 80%" },
      ],
      answer: "45",
      observe: "invented",
      reveal: {
        text: "Without the facts in front of it, the model fills gaps with plausible guesses, and on multi-hop questions that is nearly half of its answers in the lab. Reasoning step by step without a tool helps a little (35% invented) but cannot supply a fact that it does not hold.",
        derived: true,
        line: { speaker: "meera", line: "Thinking harder about something you do not know produces better-sounding guesses." },
      },
    },
    {
      id: "act-only",
      kind: "choice",
      prompt: "The model calls tools with no reasoning shown between them. Compared with ReAct, which alternates a thought, a tool call and the observation, how accurate is it in the lab?",
      options: [
        { id: "same", label: "About the same" },
        { id: "17", label: "17 points worse: 61% against 78%" },
        { id: "half", label: "Half as accurate" },
      ],
      answer: "17",
      observe: "blind-tools",
      reveal: {
        text: "Without a thought after each observation, the next query is chosen blindly: the model does not note what it learned or what is still missing. Writing out a thought that reads the observation and states the next need lifts accuracy from 61% to 78%, for about 800 more tokens.",
        derived: true,
        line: { speaker: "rao", line: "The thought is where the next action gets chosen well." },
      },
    },
  ],
  widget: { id: "react-lab", config: REACT },
  mechanism: [
    {
      id: "pattern",
      text: "ReAct, from reasoning and acting, interleaves three things. A thought: the model says what it knows and what it needs next. An action: it calls a tool. An observation: the result is added to the context. The cycle repeats until the model has enough to answer. Each observation shapes the next thought.",
      sourceIds: ["yao-react"],
    },
    {
      id: "direct",
      scene: "direct",
      text: "The alternatives each lack one half. Answering directly relies on memory, which invents. Chain-of-thought reasoning thinks step by step but has no new facts to think about. Acting without reasoning fetches facts but chooses each query poorly. Combining them gives both grounding and direction.",
      sourceIds: ["yao-react", "wei-cot"],
    },
    {
      id: "react",
      scene: "react",
      text: "In practice it is a prompt and a loop: tools described to the model, instructions to reason before each call, and a loop that runs the call and returns the result. Modern models with built-in tool use do this natively. The cost is tokens: each thought and observation is added, so ReAct uses several times what a direct answer does.",
      sourceIds: ["yao-react", "building-effective-agents"],
    },
    {
      id: "verify",
      scene: "verify",
      text: "Add a final check: before answering, confirm that each claim is supported by something that was retrieved, and say so if it is not. This catches answers that drift from the evidence. It costs a few hundred tokens and trims invented answers further, which matters when a wrong answer is worse than 'I could not find it'.",
      sourceIds: ["building-effective-agents"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "grounded",
      title: "Make it accurate and honest",
      brief: "Multi-hop questions that need search. Choose the pattern and checks so at least 80% of answers are right, at most 5% are invented, and each question uses at most 3,500 tokens.",
      line: { speaker: "kabir", line: "A wrong answer that sounds sure is worse than no answer." },
      widget: { id: "react-lab", config: REACT_CHALLENGE },
      conditions: [
        { metric: "accuracy", op: ">=", value: 0.8, label: "At least 80% right" },
        { metric: "hallucination", op: "<=", value: 0.05, label: "At most 5% invented" },
        { metric: "tokens", op: "<=", value: 3500, label: "At most 3,500 tokens a question" },
      ],
      stars: [],
      hints: [
        "Which patterns get facts from a tool?",
        "Which of those chooses its next query with a reasoned thought?",
        "What can check the answer against what was retrieved?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the ReAct pattern and why it beats answering from memory or using tools without reasoning.",
    rubric: [
      { id: "cycle", criterion: "ReAct alternates thought, action and observation, each observation shaping the next thought", keyIdea: "thought, action, observation" },
      { id: "why", criterion: "Direct answers invent facts; reasoning alone has no new information; acting alone chooses queries poorly", keyIdea: "each alternative lacks half" },
      { id: "cost", criterion: "It costs more tokens, and a final check that claims are supported by retrieved text further reduces invention", keyIdea: "token cost and verification" },
    ],
    exemplar:
      "ReAct alternates a thought, an action and an observation: the model says what it knows and needs, calls a tool, reads the result, and thinks again, so each observation shapes the next step. Answering from memory invents facts, reasoning without a tool has nothing new to reason about, and calling tools without thinking picks poor queries. It uses several times the tokens of a direct answer, and a final check that every claim is supported by retrieved text cuts invention further.",
  },
  reviews: [
    {
      id: "rp-est",
      format: "estimate",
      scenario: "A direct answer uses 300 tokens and ReAct with verification uses 3,000. At $2 per million input tokens, about how much more does ReAct cost per 1,000 questions?",
      unit: "USD",
      answer: 5.4,
      acceptFactor: 1.05,
      breakdown: ["(3,000 − 300) × 1,000 = 2.7 million tokens", "× $2 per million = $5.40"],
      explain: "A few dollars per thousand questions buys a large jump in accuracy.",
    },
    {
      id: "rp-pick",
      format: "pick-fix",
      scenario: "An agent calls a search tool with its first guess of a query, then answers from the first result even when it is irrelevant. What pattern is missing?",
      options: [
        { id: "a", label: "A thought after each observation that checks the result and chooses the next query" },
        { id: "b", label: "A bigger model" },
        { id: "c", label: "More tools" },
        { id: "d", label: "A higher temperature" },
      ],
      answer: "a",
      explain: "Reading the observation and deciding what is still missing is the point of ReAct. Without it the agent never notices the result was wrong.",
    },
    {
      id: "rp-order",
      format: "order",
      scenario: "Order these patterns by answers invented in the lab, most first.",
      items: [
        { id: "direct", label: "Answer directly" },
        { id: "cot", label: "Reason step by step, no tools" },
        { id: "act", label: "Tools, no reasoning" },
        { id: "react", label: "ReAct" },
      ],
      answer: ["direct", "cot", "act", "react"],
      explain: "45%, 35%, 12% and 6%: grounding in tools cuts invention the most, and reasoning about the results cuts it further.",
    },
    {
      id: "rp-graph",
      format: "predict-graph",
      scenario: "As you move from answering directly to chain-of-thought, tools without reasoning, ReAct, and ReAct with verification, how does accuracy change?",
      xLabel: "pattern →",
      yLabel: "accuracy",
      options: [
        { id: "rise", label: "Rises at each step", points: [38, 52, 61, 78, 82, 82, 82, 82] },
        { id: "flat", label: "Barely changes", points: [50, 50, 50, 50, 50, 50, 50, 50] },
        { id: "peak", label: "Peaks at chain-of-thought and falls", points: [38, 52, 40, 30, 25, 20, 15, 10] },
      ],
      answer: "rise",
      explain: "Each element adds something the previous lacked: reasoning, then facts, then reasoning about the facts, then a check.",
    },
    {
      id: "rp-flaw",
      format: "spot-flaw",
      scenario: "A team gives the agent a search tool but tells it to 'answer concisely' and skip explanations. It now answers after one search, often wrongly, and never rereads what it found. Tap the instruction that removes the loop's thinking.",
      diagram: {
        nodes: [
          { id: "q", label: "question", kind: "client", col: 0, row: 1 },
          { id: "search", label: "one search, no thought", kind: "external", col: 1, row: 1 },
          { id: "a", label: "concise answer", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "q", to: "search" },
          { from: "search", to: "a" },
        ],
      },
      answer: "search->a",
      explain: "Skipping the thought after the observation removes the step that notices the result is poor. Keep the reasoning and shorten only the final answer.",
    },
    {
      id: "rp-explain",
      format: "explain",
      scenario: "In two sentences: why does chain-of-thought reasoning alone not fix hallucination?",
      rubric: [
        { id: "facts", criterion: "Reasoning works on information the model already has; it cannot supply a fact it does not know" },
        { id: "plausible", criterion: "Step-by-step text can make a wrong answer look well argued, so tools that bring in evidence are needed" },
      ],
      exemplar: "Reasoning works on information the model already holds and cannot supply a fact it does not know. A step-by-step argument can also make a wrong answer look convincing, so evidence from tools is needed.",
      explain: "Thinking needs something to think about.",
    },
  ],
  codex: {
    oneLiner: "ReAct alternates thought, tool call and observation. It beats answering from memory and calling tools blindly, and costs several times the tokens.",
    keyNumbers: [
      { label: "Answers invented, direct versus ReAct (lab)", value: "45% versus 6%", sourceId: "yao-react" },
      { label: "Tokens, direct versus ReAct (lab)", value: "300 versus 2,600", sourceId: "yao-react" },
    ],
    tradeoffs: [
      { choice: "ReAct", gain: "Grounded, directed answers", cost: "Several times the tokens and latency" },
      { choice: "Verification step", gain: "Fewer invented answers", cost: "A few hundred tokens" },
      { choice: "Direct answer", gain: "Cheap and fast", cost: "Invents on questions it cannot know" },
    ],
    seenIn: ["Research and coding agents' thought-action loops.", "LangChain and similar ReAct agent templates."],
    interviewAngle: "Say: 'ReAct interleaves reasoning with tool calls so each observation steers the next step; verify claims against retrieved text before answering'.",
    aws: [{ concept: "Agents that reason and call action groups", service: "Amazon Bedrock Agents" }],
    replay: { id: "react-lab", config: REACT, scene: "react" },
  },
  interview: [
    "What is the ReAct pattern?",
    "Why does acting without reasoning perform worse?",
    "How would you reduce hallucination in a tool-using agent?",
  ],
  deeper: [
    {
      title: "Reasoning models and extended thinking",
      body: "Newer models can think before they answer or call a tool, in hidden or visible reasoning blocks, which builds the 'thought' step into the model. The pattern is the same: reason about what is known and needed, act, observe. The budget for thinking becomes a setting, and thinking tokens are billed like output.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "A multi-hop question that needs facts from a search tool. Answering directly: 38% right, 45% invented, 300 tokens. Reasoning without tools: 52%, 35%, 900 tokens. Tools without reasoning: 61%, 12%, 1,800. ReAct: 78%, 6%, 2,600.",
    "Verifying the answer against the retrieved text adds 4 points of accuracy and trims invented answers by 1.5 points, for 400 more tokens, in patterns that use tools.",
    "Token counts are per question; the lab's numbers are invented for the exercise but follow the pattern the ReAct paper reports.",
  ],
  sources: [YAO, BEA, WEI],
  verify: [
    { id: "direct", claim: "Answering directly invents 45% of answers", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "direct" }, metric: "hallucination" }, expect: { min: 0.45, max: 0.45 } },
    { id: "act", claim: "Tools without reasoning get 61% right", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "act", verify: false }, metric: "accuracy" }, expect: { min: 0.61, max: 0.61 } },
    { id: "react", claim: "ReAct gets 78%", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "react", verify: false }, metric: "accuracy" }, expect: { min: 0.78, max: 0.78 } },
    { id: "react-halluc", claim: "…inventing 6%", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "react", verify: false }, metric: "hallucination" }, expect: { min: 0.06, max: 0.06 } },
    { id: "verified", claim: "Verification takes it to 82% and 4.5% invented", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "react", verify: true }, metric: "hallucination" }, expect: { max: 0.05 } },
    { id: "verified-acc", claim: "…at 82% right", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "react", verify: true }, metric: "accuracy" }, expect: { min: 0.8 } },
    { id: "verified-tokens", claim: "…for 3,000 tokens", run: "lab", params: { model: "react-lab", config: REACT_CHALLENGE, values: { mode: "react", verify: true }, metric: "tokens" }, expect: { max: 3500 } },
  ],
});
