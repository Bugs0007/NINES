import { definePack } from "../define";

export const PARA = { start: { k: 1, quorum: false } };
export const PARA_CHALLENGE = {};

const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (parallelisation: sectioning and voting)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const TAIL = { id: "tail-at-scale", title: "J. Dean and L. Barroso (2013), The Tail at Scale, Communications of the ACM 56(2)", url: "https://research.google/pubs/the-tail-at-scale/" };
const SC = { id: "self-consistency", title: "X. Wang et al. (2022), Self-Consistency Improves Chain of Thought Reasoning in Language Models", url: "https://arxiv.org/abs/2203.11171" };

export default definePack({
  id: "parallelization",
  title: "Parallelization",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "classifier · 5 votes per request, p99 latency 56 s", detail: "median 12 seconds, one slow call holds the answer" },
    lines: [
      { speaker: "kabir", line: "We ask five agents the same question and take the majority. Accuracy improved, and now every request waits for whichever of the five is slowest." },
      { speaker: "meera", line: "Fan-out buys accuracy with money and loses time to the tail. You can have the vote without waiting for every voter." },
    ],
  },
  predictions: [
    {
      id: "tail",
      kind: "choice",
      prompt: "Each agent call has a median of 10 seconds and a 99th percentile of 40. You ask 5 in parallel and wait for all of them. What is the 99th percentile of the wait?",
      options: [
        { id: "40", label: "About 40 seconds, the same" },
        { id: "55", label: "About 55 seconds" },
        { id: "100", label: "About 100 seconds" },
      ],
      answer: "55",
      observe: "tail-hit",
      reveal: {
        text: "The wait is the slowest of five, so you need all five to be fast. A single call exceeds 40 seconds 1% of the time, but five calls together exceed it about 5% of the time. The 99th percentile of the maximum is the 99.8th percentile of one call: about 56 seconds.",
        derived: true,
        sourceIds: ["tail-at-scale"],
        line: { speaker: "meera", line: "The more things you wait for, the more you inherit the worst one." },
      },
    },
    {
      id: "quorum",
      kind: "choice",
      prompt: "You keep five votes but stop as soon as a majority, three answers, has arrived. What happens to the 99th percentile of the wait, and to accuracy?",
      options: [
        { id: "same", label: "Both stay the same" },
        { id: "better", label: "Latency falls to about 21 seconds; accuracy is unchanged" },
        { id: "worse", label: "Both get worse" },
      ],
      answer: "better",
      observe: "quorum-used",
      reveal: {
        text: "The third answer to arrive is much faster than the fifth, about 21 seconds at the 99th percentile. Accuracy is unchanged only if the late votes could not have changed the result, which holds for a vote already decided; the lab treats it that way. The slow stragglers are simply not waited for.",
        derived: true,
        line: { speaker: "rao", line: "Do not wait for the last runner if the race is already won." },
      },
    },
  ],
  widget: { id: "para-lab", config: PARA },
  mechanism: [
    {
      id: "kinds",
      scene: "section",
      text: "Parallelisation has two forms. Sectioning splits a task into independent parts handled at the same time, such as checking a text for several kinds of policy violation at once. Voting asks the same question several times and combines the answers. Sectioning buys speed; voting buys confidence.",
      sourceIds: ["building-effective-agents"],
    },
    {
      id: "vote",
      scene: "vote",
      text: "Voting works because independent errors cancel: if each agent is right 75% of the time and errors were independent, five of them would be right about 90% of the time. In reality their mistakes are correlated, since they share a model and a prompt, so the gain is smaller. Diversity, such as different prompts or models, helps.",
      sourceIds: ["self-consistency", "building-effective-agents"],
    },
    {
      id: "tail",
      text: "Latency is the other cost. If you wait for all K parallel calls, the time is the slowest of K, which sits far out in the tail, and the more calls the worse it gets. Cost is K times as well. Accuracy gains shrink after a handful of votes, while cost and tail latency keep growing.",
      sourceIds: ["tail-at-scale"],
    },
    {
      id: "quorum",
      scene: "quorum",
      text: "Wait only for what you need. For a majority vote, stop once a majority agrees, and cancel the rest. The time becomes that of the m-th fastest call, much less than the slowest. The same trick, hedging, sends a duplicate request after a delay and uses whichever answers first.",
      sourceIds: ["tail-at-scale"],
    },
  ],
  challenges: [
    {
      id: "vote-design",
      title: "Design the vote",
      brief: "One agent is right 75% of the time. Choose how many to ask and whether to stop at a majority so accuracy is at least 85%, the slowest 1% of requests finish within 30 seconds, and cost is at most 6 times a single call.",
      line: { speaker: "kabir", line: "I want better answers than one agent gives, and I do not want to wait for the slowest one." },
      widget: { id: "para-lab", config: PARA_CHALLENGE },
      conditions: [
        { metric: "accuracy", op: ">=", value: 0.85, label: "At least 85% accurate" },
        { metric: "p99S", op: "<=", value: 30, label: "Slowest 1% within 30 seconds" },
        { metric: "costX", op: "<=", value: 6, label: "At most 6× the cost of one agent" },
      ],
      stars: [],
      hints: [
        "How many votes does 85% need when mistakes overlap?",
        "What does waiting for all of them do to the tail?",
        "An even number of voters can tie.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain sectioning and voting, and the cost of waiting for parallel calls.",
    rubric: [
      { id: "forms", criterion: "Sectioning runs independent parts at once for speed; voting repeats the same task and combines answers for confidence", keyIdea: "sectioning versus voting" },
      { id: "correlated", criterion: "Voting gains less than independence suggests because the agents' errors are correlated, and returns diminish with more votes", keyIdea: "correlated errors" },
      { id: "tail", criterion: "Waiting for all calls puts latency at the slowest, so stop at a quorum or hedge", keyIdea: "quorum against the tail" },
    ],
    exemplar:
      "Sectioning runs independent parts of a task at the same time for speed, and voting asks the same question several times and combines the answers for confidence. Voting helps less than independent errors would suggest, because the agents share a model and a prompt and make similar mistakes, and returns diminish after a handful of votes. Waiting for every call puts the latency at the slowest of them, so I would stop once a majority has answered.",
  },
  reviews: [
    {
      id: "pa-est",
      format: "estimate",
      scenario: "Each of three independent agents is right 75% of the time, and you take the majority. About how often is the majority right? (P at least 2 of 3 right)",
      unit: "%",
      answer: 84,
      acceptFactor: 1.03,
      breakdown: ["3 × 0.75² × 0.25 = 0.422", "+ 0.75³ = 0.422", "= 0.844"],
      explain: "With independent errors three votes lift 75% to 84%. With correlated errors the gain is smaller.",
    },
    {
      id: "pa-pick",
      format: "pick-fix",
      scenario: "A team votes with five copies of the same model with the same prompt, and the vote barely beats one call. What would help more than adding voters?",
      options: [
        { id: "a", label: "Diversify the voters: different prompts, models or sampled reasoning paths" },
        { id: "b", label: "Add ten more identical voters" },
        { id: "c", label: "Lower the temperature to zero" },
        { id: "d", label: "Use a longer prompt" },
      ],
      answer: "a",
      explain: "Identical voters make identical mistakes. Voting pays only to the extent that errors differ.",
    },
    {
      id: "pa-order",
      format: "order",
      scenario: "Order these by 99th percentile latency in the lab, slowest first.",
      items: [
        { id: "all5", label: "Wait for all 5" },
        { id: "all3", label: "Wait for all 3" },
        { id: "q5", label: "5 voters, stop at 3" },
      ],
      answer: ["all5", "all3", "q5"],
      explain: "Waiting for all of more calls is worse; stopping at a majority of five beats waiting for all three.",
    },
    {
      id: "pa-graph",
      format: "predict-graph",
      scenario: "As the number of voters rises from 1 to 15 (odd numbers, with majority vote), how does accuracy change in the lab?",
      xLabel: "voters →",
      yLabel: "accuracy",
      options: [
        { id: "sat", label: "Rises, with shrinking gains", points: [75, 82.5, 86.7, 89.4, 91.1, 92.4, 93.6, 94.2] },
        { id: "linear", label: "Rises in a straight line", points: [75, 80, 85, 90, 95, 100, 100, 100] },
        { id: "flat", label: "Stays at 75%", points: [75, 75, 75, 75, 75, 75, 75, 75] },
      ],
      answer: "sat",
      explain: "Each pair of added voters moves fewer ties and fewer close calls, and correlated errors put a ceiling on the gain.",
    },
    {
      id: "pa-flaw",
      format: "spot-flaw",
      scenario: "A pipeline fans out five calls and waits for all of them. When one call hangs for two minutes, the whole request hangs for two minutes. Tap the design flaw.",
      diagram: {
        nodes: [
          { id: "fan", label: "fan out to 5 agents", kind: "lb", col: 0, row: 1 },
          { id: "wait", label: "wait for all 5, no timeout", kind: "queue", col: 1, row: 1 },
          { id: "answer", label: "answer", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "fan", to: "wait" },
          { from: "wait", to: "answer" },
        ],
      },
      answer: "fan->wait",
      explain: "A straggler can stall everything. Wait only for a quorum, add a timeout, and cancel the rest.",
    },
    {
      id: "pa-explain",
      format: "explain",
      scenario: "In two sentences: when is sectioning a better use of parallelism than voting?",
      rubric: [
        { id: "independent", criterion: "When the task naturally splits into independent parts, so each part can be done at once" },
        { id: "latency", criterion: "It cuts latency by dividing the work, whereas voting adds cost and tail latency for confidence" },
      ],
      exemplar: "When the task splits naturally into independent parts, each can be done at the same time. That divides the work and cuts latency, whereas voting spends more to gain confidence and adds tail latency.",
      explain: "Divide for speed, repeat for certainty.",
    },
  ],
  codex: {
    oneLiner: "Sectioning splits independent parts for speed; voting repeats a task for confidence. Waiting for all calls inherits the tail, so stop at a quorum.",
    keyNumbers: [
      { label: "5 voters, each 75% right, errors correlated at 0.2 (lab)", value: "about 87%", sourceId: "self-consistency" },
      { label: "p99 wait, all 5 versus first 3 (lab)", value: "56 s versus 21 s", sourceId: "tail-at-scale" },
    ],
    tradeoffs: [
      { choice: "More voters", gain: "Higher accuracy, diminishing", cost: "Cost grows linearly; tail latency grows" },
      { choice: "Quorum", gain: "Latency of the m-th call", cost: "Late answers ignored" },
      { choice: "Diverse voters", gain: "Less correlated errors", cost: "More prompts or models to maintain" },
    ],
    seenIn: ["Self-consistency decoding for reasoning problems.", "Guardrail checks run in parallel with the main response."],
    interviewAngle: "Say: 'sectioning for independent parts, voting with diverse voters for confidence, a quorum and timeout to avoid the tail, and watch the cost multiple'.",
    aws: [{ concept: "Parallel states and map states", service: "AWS Step Functions Parallel and Map" }],
    replay: { id: "para-lab", config: { start: { k: 5, quorum: true } }, scene: "quorum" },
  },
  interview: [
    "What is the difference between sectioning and voting in parallelised LLM calls?",
    "Why does fan-out increase tail latency?",
    "What is a hedged request?",
  ],
  deeper: [
    {
      title: "Hedged requests",
      body: "Google's tail-latency work describes sending a second copy of a slow request after a short delay, such as the 95th percentile of normal latency, and using whichever reply arrives first. It cuts the tail sharply for a few percent more load. For LLM calls, where requests are expensive, hedge sparingly and cancel the loser promptly.",
      sourceIds: ["tail-at-scale"],
    },
  ],
  honestPhysics: [
    "Voting: the same question is put to K agents and the majority answer wins. One agent is right 75% of the time; the agents' mistakes are partly shared, with a correlation of 0.2, so accuracy is 0.8 × (the chance a majority of K independent agents is right) + 0.2 × 0.75. Cost is K times a single call.",
    "Each agent takes a lognormal time with a median of 10 seconds and a 99th percentile of 40. Waiting for all K makes the 99th percentile that of the slowest. Waiting for a majority (⌊K ÷ 2⌋ + 1 answers) uses that order statistic.",
    "Round figures for comparison.",
  ],
  sources: [BEA, TAIL, SC],
  verify: [
    { id: "one", claim: "One agent is 75% accurate", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 1 }, metric: "accuracy" }, expect: { min: 0.749, max: 0.751 } },
    { id: "five", claim: "Five voters reach 87%", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 5, quorum: true }, metric: "accuracy" }, expect: { min: 0.85 } },
    { id: "five-all", claim: "Waiting for all five puts the p99 above 50 seconds", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 5, quorum: false }, metric: "p99S" }, expect: { min: 50 } },
    { id: "five-quorum", claim: "Stopping at a majority brings it to about 21", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 5, quorum: true }, metric: "p99S" }, expect: { max: 30 } },
    { id: "three", claim: "Three voters fall short of 85%", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 3, quorum: true }, metric: "accuracy" }, expect: { max: 0.85 } },
    { id: "nine", claim: "Nine voters cost more than 6 times a single call", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 9, quorum: true }, metric: "costX" }, expect: { min: 6 } },
    { id: "six", claim: "An even number of voters is no better than five: six is under 85%", run: "lab", params: { model: "para-lab", config: PARA_CHALLENGE, values: { k: 6, quorum: true }, metric: "accuracy" }, expect: { max: 0.85 } },
  ],
});
