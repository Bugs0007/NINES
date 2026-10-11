import { definePack } from "../define";

export const THINK = { task: "hard", start: { task: "easy", budget: 0 } };
export const THINK_CHALLENGE = { task: "hard", lockTask: true, start: { task: "hard", budget: 0 } };

const WEI = { id: "wei-2022", title: "J. Wei et al. (2022), Chain-of-Thought Prompting Elicits Reasoning in Large Language Models, NeurIPS", url: "https://arxiv.org/abs/2201.11903" };
const ANTHROPIC_THINK = { id: "anthropic-extended-thinking", title: "Anthropic docs: Extended thinking (thinking budget, billed as output tokens)", url: "https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking" };
const ANTHROPIC_PRICING = { id: "anthropic-pricing", title: "Anthropic: Claude API pricing (thinking tokens are billed as output tokens)", url: "https://platform.claude.com/docs/en/about-claude/pricing" };

export default definePack({
  id: "extended-thinking",
  title: "Extended Thinking & Reasoning Budgets",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "Copilot · outage triage", detail: "accuracy 20% without reasoning; $0.08 and 100 s with it" },
    lines: [
      { speaker: "kabir", line: "Thinking fixed the hard outage-triage questions, but it also made the easy ones slower and pricier for no benefit. Is that expected?" },
      { speaker: "meera", line: "Thinking is a budget you spend on problems that need it. Spending it on easy ones is waste, and on hard ones the gains flatten." },
    ],
  },
  predictions: [
    {
      id: "easy-waste",
      kind: "choice",
      prompt: "You give a model a large thinking budget for a very easy task, classifying a support ticket, where it already gets 85% right. What do you expect?",
      options: [
        { id: "big", label: "A big accuracy gain, from 85% to nearly 100%" },
        { id: "small", label: "A small gain of a few points at a much higher cost and delay" },
        { id: "none", label: "No change at all" },
        { id: "worse", label: "Accuracy drops" },
      ],
      answer: "small",
      observe: "think-waste",
      reveal: {
        text: "Easy tasks have little room to improve. In the lab, a task at 85% reaches about 97% at most, most of that in the first 500 tokens, so 8,000 thinking tokens mostly add cost and delay.",
        derived: true,
        line: { speaker: "rao", line: "I will pay for thinking when there is something to think about." },
      },
    },
  ],
  widget: { id: "think-lab", config: THINK },
  mechanism: [
    {
      id: "cot",
      text: "Chain-of-thought prompting showed that having a model write out intermediate steps before answering improves multi-step reasoning. The extra tokens are working space: each step is conditioned on the ones before it, so a hard problem is decomposed into easier ones.",
      sourceIds: ["wei-2022"],
    },
    {
      id: "budget",
      scene: "budget",
      text: "Extended thinking makes that a controlled feature. You give the model a thinking budget in tokens; it reasons in a separate block before the final answer. Accuracy on hard problems rises with the budget, steeply at first and then more slowly, and the thinking tokens are billed like output tokens.",
      sourceIds: ["anthropic-extended-thinking", "anthropic-pricing"],
    },
    {
      id: "cost",
      scene: "hard",
      text: "That makes it a three-way trade between accuracy, time, and money. At about 80 tokens a second, 8,000 thinking tokens is 100 seconds of waiting and about eight cents, per call. Pick the smallest budget at the knee of the curve, not the largest the model allows.",
      derived: true,
    },
    {
      id: "when",
      scene: "easy",
      text: "Spend it where it pays. Hard multi-step problems, maths, debugging, and planning benefit. Classification, extraction, and short lookups do not, and for them a cheaper model or a plain prompt is better. Measure accuracy at several budgets on your own tasks.",
    },
  ],
  challenges: [
    {
      id: "triage-budget",
      title: "Find the knee",
      brief: "Outage triage is a hard task: 20% accuracy with no thinking. You need at least 80% accuracy, at most 10 cents per call, and an answer within 110 seconds. Set the thinking budget.",
      line: { speaker: "rao", line: "Past the knee I am paying for tokens that barely help. Find it."},
      widget: { id: "think-lab", config: THINK_CHALLENGE },
      conditions: [
        { metric: "accuracy", op: ">=", value: 0.8, label: "Accuracy at least 80%" },
        { metric: "costPerCall", op: "<=", value: 0.1, label: "At most $0.10 per call" },
        { metric: "latencyS", op: "<=", value: 110, label: "Answer within 110 s" },
      ],
      stars: [{ metric: "costPerCall", op: "<=", value: 0.085, label: "At most $0.085 per call" }],
      hints: [
        "Try a few budgets. What does accuracy do as the budget doubles?",
        "Where does the curve start to flatten, and what does each extra thousand tokens cost?",
        "Three limits at once: accuracy sets a minimum, and cost and time set a maximum.",
      ],
    },
  ],
  explainBack: {
    prompt: "What is extended thinking, what does it cost, and when would you use it?",
    rubric: [
      { id: "what", criterion: "The model writes intermediate reasoning before answering, within a token budget, which improves multi-step problems", keyIdea: "reasoning tokens before the answer" },
      { id: "cost", criterion: "Thinking tokens cost money like output tokens and add latency, with diminishing accuracy returns as the budget grows", keyIdea: "cost, latency, diminishing returns" },
      { id: "when", criterion: "Use it for hard reasoning tasks, not easy classification or lookups, and tune the budget with evals", keyIdea: "spend on hard tasks, tune the budget" },
    ],
    exemplar:
      "Extended thinking lets the model write out reasoning in a budgeted block before it answers, which improves multi-step problems. The thinking tokens are billed like output tokens and add delay, and accuracy rises quickly at first and then flattens, so I pick the budget near the knee. I use it for hard reasoning like debugging and planning, not for easy classification, and I choose the budget by measuring accuracy at several budgets.",
  },
  reviews: [
    {
      id: "et-est-cost",
      format: "estimate",
      scenario: "A call uses 8,000 thinking tokens billed at $10 per million output tokens, plus a little for the answer. About how many cents does the thinking cost?",
      unit: "cents",
      answer: 8,
      acceptFactor: 1.2,
      breakdown: ["8,000 ÷ 1,000,000 × $10", "= $0.08", "= 8 cents"],
      explain: "Eight cents a call becomes $4,000 for 50,000 calls. Only spend it on tasks that need it.",
    },
    {
      id: "et-est-time",
      format: "estimate",
      scenario: "The model generates thinking tokens at about 80 per second. About how long does a 12,000-token thinking budget take to use?",
      unit: "s",
      answer: 150,
      acceptFactor: 1.15,
      breakdown: ["12,000 ÷ 80", "= 150 seconds"],
      explain: "Reasoning is generated one token at a time like any output, so a large budget is minutes of waiting.",
    },
    {
      id: "et-pick",
      format: "pick-fix",
      scenario: "An extraction task, pulling invoice totals from emails, runs at 96% accuracy and the team turns on a 10,000-token thinking budget 'to be safe'. What is the likely result?",
      options: [
        { id: "a", label: "A tiny gain at much higher cost and latency; skip thinking and fix the prompt or examples instead" },
        { id: "b", label: "A big accuracy gain" },
        { id: "c", label: "Lower cost" },
        { id: "d", label: "Better JSON formatting guaranteed" },
      ],
      answer: "a",
      explain: "Simple extraction has little left to gain from reasoning. Look at the remaining errors; they are usually prompt or data issues.",
    },
    {
      id: "et-order",
      format: "order",
      scenario: "Order these tasks by how much extended thinking is likely to help, most first.",
      items: [
        { id: "debug", label: "Debug a multi-service outage from logs" },
        { id: "math", label: "A multi-step refund calculation" },
        { id: "classify", label: "Classify a support ticket" },
        { id: "lookup", label: "Return a field from a given record" },
      ],
      answer: ["debug", "math", "classify", "lookup"],
      explain: "The more steps a task needs, the more working space helps. Direct lookups and simple labelling have nothing to reason through.",
    },
    {
      id: "et-graph",
      format: "predict-graph",
      scenario: "On a hard task, raise the thinking budget from 0 to 32,000 tokens. How does accuracy change?",
      xLabel: "thinking tokens →",
      yLabel: "accuracy",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises steeply, then flattens near a ceiling", points: [1, 4, 5.8, 6.7, 7.2, 7.4, 7.5, 7.5] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "peak", label: "Rises, then falls sharply", points: [1, 4, 6, 7, 6, 5, 3, 1] },
      ],
      answer: "sat",
      explain: "Early thinking tokens do the decomposing, later ones mostly double-check. The curve flattens, which is the knee you want to find.",
    },
    {
      id: "et-flaw",
      format: "spot-flaw",
      scenario: "A chat feature enables a 32,000-token thinking budget on every message, including 'thanks!' and 'what time do you open?'. Latency and cost are high. Tap the setting.",
      diagram: {
        nodes: [
          { id: "user", label: "user · mostly simple questions", kind: "client", col: 0, row: 1 },
          { id: "llm", label: "model · 32,000-token thinking budget on every call", kind: "llm", col: 1, row: 1 },
        ],
        edges: [{ from: "user", to: "llm" }],
      },
      answer: "llm",
      explain: "Most messages do not need reasoning. Route only the hard ones to a thinking mode, or set a small budget, and use a plain call for the rest.",
    },
    {
      id: "et-explain",
      format: "explain",
      scenario: "In two sentences: why does extended thinking help with multi-step problems?",
      rubric: [
        { id: "steps", criterion: "Writing out intermediate steps lets the model build on earlier results instead of jumping to an answer" },
        { id: "tokens", criterion: "The extra tokens are working space, which is why it costs time and money" },
      ],
      exemplar: "Writing out intermediate steps lets each step build on the previous ones instead of the model jumping straight to an answer. Those tokens are the working space, which is why reasoning costs time and money.",
      explain: "Reasoning is computation, and computation is tokens.",
    },
  ],
  codex: {
    oneLiner: "Extended thinking spends tokens on reasoning before the answer. Accuracy on hard tasks rises then flattens, and the tokens cost money and time.",
    keyNumbers: [
      { label: "Thinking tokens", value: "billed as output tokens", sourceId: "anthropic-pricing" },
      { label: "Chain of thought", value: "intermediate steps improve multi-step reasoning", sourceId: "wei-2022" },
      { label: "Budget", value: "set per request in tokens", sourceId: "anthropic-extended-thinking" },
    ],
    tradeoffs: [
      { choice: "Large thinking budget", gain: "Higher accuracy on hard problems", cost: "Minutes of latency and real money per call" },
      { choice: "No thinking", gain: "Fast and cheap", cost: "Lower accuracy on multi-step tasks" },
      { choice: "Route by difficulty", gain: "Thinking only where it pays", cost: "A router to build and monitor" },
    ],
    seenIn: ["A 'thinking' toggle in model APIs.", "Cost reports where a few reasoning calls dominate the bill."],
    interviewAngle: "Frame it as budget allocation: 'thinking on the hard tail, none on the easy majority, with the budget set at the knee found by evals.'",
    aws: [{ concept: "Reasoning models", service: "Amazon Bedrock models with reasoning (budgeted thinking)" }],
    replay: { id: "think-lab", config: THINK_CHALLENGE, scene: "budget" },
  },
  interview: [
    "When would you enable extended thinking?",
    "How would you choose a thinking budget?",
    "What does reasoning add to cost and latency?",
  ],
  deeper: [
    {
      title: "Thinking is not a free lunch",
      body: "Reasoning tokens use the same decoding path as an answer, one token at a time, so a long reasoning trace costs as much as a long answer and delays the first visible token. They also can be wasted on a wrong path. Evaluating at several budgets, and comparing against simpler fixes such as better examples, tells you whether the extra spend is buying anything.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Accuracy follows a saturating curve per task: floors of 85%, 50%, and 20% and ceilings of 97%, 92%, and 85%, with scales of 500, 2,000, and 3,000 tokens. These numbers are illustrative; real gains depend on the model and task.",
    "Thinking tokens are billed at the large model's $10 per million and generated at about 80 tokens a second, round figures.",
  ],
  sources: [WEI, ANTHROPIC_THINK, ANTHROPIC_PRICING],
  verify: [
    { id: "no-think", claim: "With no thinking the hard task is 20% accurate", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 0 }, metric: "accuracy" }, expect: { min: 0.19, max: 0.21 } },
    { id: "win", claim: "An 8,000-token budget reaches 80%", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 8000 }, metric: "accuracy" }, expect: { min: 0.8 } },
    { id: "win-cost", claim: "…for under 10 cents", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 8000 }, metric: "costPerCall" }, expect: { max: 0.1 } },
    { id: "win-time", claim: "…within 110 seconds", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 8000 }, metric: "latencyS" }, expect: { max: 110 } },
    { id: "small", claim: "A 4,000-token budget falls short", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 4000 }, metric: "accuracy" }, expect: { max: 0.8 } },
    { id: "big", claim: "A 16,000-token budget breaks cost and time for little extra accuracy", run: "lab", params: { model: "think-lab", config: THINK_CHALLENGE, values: { budget: 16000 }, metric: "costPerCall" }, expect: { min: 0.1 } },
    { id: "easy", claim: "On an easy task 8,000 tokens add under 13 points", run: "lab", params: { model: "think-lab", config: { task: "easy", lockTask: true }, values: { task: "easy", budget: 8000 }, metric: "accuracy" }, expect: { max: 0.98 } },
  ],
});
