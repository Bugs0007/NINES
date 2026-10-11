import { definePack } from "../define";

export const JG = { start: { model: "large", rubric: "detailed", shots: true, swap: true, calibrate: true } };
export const JG_CHALLENGE = {};

const MTBENCH = { id: "mt-bench", title: "L. Zheng et al. (2023), Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (position, verbosity and self-preference bias; agreement with humans)", url: "https://arxiv.org/abs/2306.05685" };
const NOT_FAIR = { id: "not-fair-evaluators", title: "P. Wang et al. (2023), Large Language Models are not Fair Evaluators (position bias)", url: "https://arxiv.org/abs/2305.17926" };
const ANTHROPIC_EVALS = { id: "anthropic-evals", title: "Anthropic docs: Create strong empirical evaluations (model-based grading)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests" };

export default definePack({
  id: "llm-as-judge",
  title: "LLM-as-Judge",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "evals · the judge prefers the longer answer 71% of the time", detail: "humans prefer it 52%" },
    lines: [
      { speaker: "kabir", line: "We use a model to grade the summaries, and it keeps picking whichever one is longer or comes first. People looking at the same pairs split evenly." },
      { speaker: "meera", line: "A judge is a model with opinions. Treat it as a measuring instrument: write down what it should look for, test it against people, and correct it." },
    ],
  },
  predictions: [
    {
      id: "bias",
      kind: "choice",
      prompt: "A judge compares two answers shown in a fixed order and tends to favour the first. In the lab this costs about 6 points. What stops it?",
      options: [
        { id: "temp", label: "Setting the temperature to zero" },
        { id: "swap", label: "Judging both orders and counting a win only when both agree" },
        { id: "longer", label: "Asking for a longer explanation" },
      ],
      answer: "swap",
      observe: "biased",
      reveal: {
        text: "Temperature makes the judge repeatable, not fair: a deterministic bias is still a bias. Showing both orders and keeping only the verdicts that agree cancels the position effect, at double the cost. In the lab it also lifts agreement with humans by three points.",
        derived: true,
        sourceIds: ["not-fair-evaluators"],
        line: { speaker: "meera", line: "Ask the question both ways round. Whatever is left is the real signal." },
      },
    },
    {
      id: "measure",
      kind: "choice",
      prompt: "You build a judge and use it to gate releases without ever comparing it with human labels. What do you know about how far to trust it?",
      options: [
        { id: "enough", label: "Enough: it is a strong model" },
        { id: "nothing", label: "Nothing: its agreement with people could be anywhere from 60% to 90%" },
        { id: "mostly", label: "It is probably about 85% accurate" },
      ],
      answer: "nothing",
      observe: "unmeasured",
      reveal: {
        text: "Agreement depends on your task, your rubric and your judge, and the only way to know it is to have people grade a sample, 200 cases is a usual start, and compare. The lab's judges range from 68% to 93% depending on setup. A gate built on an unmeasured judge is a guess with a number attached.",
        derived: true,
        line: { speaker: "rao", line: "Measure the thing that measures." },
      },
    },
  ],
  widget: { id: "judge-lab", config: JG },
  mechanism: [
    {
      id: "why",
      text: "Some qualities cannot be checked by code: is the summary faithful, the tone right, the answer helpful. A stronger model can grade them against a rubric, cheaper and faster than people. Strong judges agree with human preferences about as well as humans agree with each other on some tasks, which is why the method took off.",
      sourceIds: ["mt-bench", "anthropic-evals"],
    },
    {
      id: "bias",
      scene: "bias",
      text: "Judges have biases. They favour the answer shown first, longer answers, and answers written in their own style or by their own model. Mitigate: show both orders and keep agreeing verdicts, score each answer against a rubric rather than choosing between two, and use a different model as judge from the one being judged.",
      sourceIds: ["mt-bench", "not-fair-evaluators"],
    },
    {
      id: "rubric",
      scene: "rubric",
      text: "Be specific. 'Is this good?' leaves the judge to invent criteria. A rubric lists what to check, for example facts supported by the source, nothing invented, covers the main points, with a scale and a worked example of each score. Specific instructions and a few examples raise agreement with humans, and make disagreements easy to debug.",
      sourceIds: ["anthropic-evals", "mt-bench"],
    },
    {
      id: "calibrate",
      scene: "calibrate",
      text: "Calibrate against people. Have humans grade a sample, run the judge on the same cases and compute agreement and the kinds of disagreement. Revise the rubric until agreement is high enough for the decision, and re-check when the judge model or the task changes. Then the judge is a measured instrument.",
      sourceIds: ["mt-bench"],
    },
  ],
  challenges: [
    {
      id: "build-judge",
      title: "Build a judge you can gate on",
      brief: "Set up the judge so it agrees with humans at least 85% of the time, has no more than 3 points of position bias, costs at most $13 per 1,000 judgments, and has been checked against hand-graded cases.",
      line: { speaker: "rao", line: "Cheaper is better, but not if the gate is a coin flip." },
      widget: { id: "judge-lab", config: JG_CHALLENGE },
      conditions: [
        { metric: "agreement", op: ">=", value: 0.85, label: "At least 85% agreement with humans" },
        { metric: "biasPts", op: "<=", value: 3, label: "At most 3 points of position bias" },
        { metric: "costPer1k", op: "<=", value: 13, label: "At most $13 per 1,000 judgments" },
        { metric: "measured", op: ">=", value: 1, label: "Checked against hand-graded cases" },
      ],
      stars: [{ metric: "agreement", op: ">=", value: 0.9, label: "At least 90% agreement" }],
      hints: [
        "Which instruction and model combinations reach 85%?",
        "What removes the order effect, and what does it cost?",
        "How do you know the agreement figure is true for your task?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how to use an LLM as a judge responsibly.",
    rubric: [
      { id: "rubric", criterion: "Give the judge a specific rubric and examples; vague instructions lower agreement with humans", keyIdea: "specific rubric" },
      { id: "bias", criterion: "Counter position, length and self-preference bias, for example by judging both orders and using a different model", keyIdea: "counter the biases" },
      { id: "calibrate", criterion: "Measure the judge against hand-graded cases before gating on it, and re-check as things change", keyIdea: "calibrate against humans" },
    ],
    exemplar:
      "I would give the judge a specific rubric with a scale and a few worked examples, because vague instructions lower agreement with people. I would counter the known biases by showing both orders and keeping verdicts that agree, and by using a different model from the one being judged. Before gating on it I would have people grade a sample of a couple of hundred cases, compare, and re-check whenever the judge model or the task changes.",
  },
  reviews: [
    {
      id: "lj-est",
      format: "estimate",
      scenario: "A judgment uses 1,500 tokens in and 300 out. Prices are $2 per million input and $10 per million output tokens. About what do 1,000 judgments cost?",
      unit: "USD",
      answer: 6,
      acceptFactor: 1.05,
      breakdown: ["1,500 × $2 ÷ 1M = $0.003", "300 × $10 ÷ 1M = $0.003", "$0.006 each, $6 per 1,000"],
      explain: "Judging both orders doubles that, so check whether the bias you are removing matters for the decision.",
    },
    {
      id: "lj-pick",
      format: "pick-fix",
      scenario: "A judge model from the same family as the model being tested scores its stablemate's answers consistently higher than humans do. What is the best remedy?",
      options: [
        { id: "a", label: "Use a different model as judge, and check agreement with humans" },
        { id: "b", label: "Lower the temperature" },
        { id: "c", label: "Ask it to be harsher" },
        { id: "d", label: "Use the same model, but longer prompts" },
      ],
      answer: "a",
      explain: "Models tend to prefer their own style. A different judge, validated against people, removes the self-preference effect.",
    },
    {
      id: "lj-order",
      format: "order",
      scenario: "Order these judge setups by agreement with humans in the lab, lowest first.",
      items: [
        { id: "small-vague", label: "Small judge, vague instruction" },
        { id: "large-vague", label: "Large judge, vague instruction" },
        { id: "large-rubric", label: "Large judge, detailed rubric" },
        { id: "all", label: "Large, rubric, examples, both orders" },
      ],
      answer: ["small-vague", "large-vague", "large-rubric", "all"],
      explain: "68%, 78%, 86% and 93%: model size, a rubric, examples and order-swapping each add points.",
    },
    {
      id: "lj-graph",
      format: "predict-graph",
      scenario: "You grade more human-labelled cases to check a judge's agreement. As the sample grows from 20 to 1,000, how does the uncertainty about the agreement figure change?",
      xLabel: "hand-graded cases →",
      yLabel: "uncertainty in agreement",
      options: [
        { id: "fall", label: "Falls as 1 ÷ √N: wide with 20 cases, narrow with 1,000", points: [20, 14, 10, 7, 5, 4, 3, 2.5] },
        { id: "flat", label: "Stays the same", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "rise", label: "Rises", points: [2, 3, 4, 5, 7, 10, 14, 20] },
      ],
      answer: "fall",
      explain: "Agreement is itself a measured proportion, so its noise follows the same square-root law as any eval score.",
    },
    {
      id: "lj-flaw",
      format: "spot-flaw",
      scenario: "A team gates releases on a judge that was prompted with 'Rate this answer from 1 to 10' and never compared with human labels. The release gate passes a regression that users hate. Tap the missing step.",
      diagram: {
        nodes: [
          { id: "answers", label: "candidate answers", kind: "llm", col: 0, row: 1 },
          { id: "judge", label: "judge: 'rate 1 to 10'", kind: "llm", col: 1, row: 1 },
          { id: "gate", label: "release gate", kind: "lb", col: 2, row: 1 },
        ],
        edges: [
          { from: "answers", to: "judge" },
          { from: "judge", to: "gate" },
        ],
      },
      answer: "judge->gate",
      explain: "Nobody measured how well the judge's scores track human judgement, so the gate rests on an unknown. Calibrate the judge first.",
    },
    {
      id: "lj-explain",
      format: "explain",
      scenario: "In two sentences: why score each answer against a rubric rather than asking the judge which of two is better?",
      rubric: [
        { id: "pos", criterion: "Pairwise comparison invites position and length bias, while a rubric scores each answer on stated criteria" },
        { id: "debug", criterion: "Per-criterion scores show why an answer lost, which makes disagreements with humans easier to debug" },
      ],
      exemplar: "Pairwise comparison invites bias toward the first or the longer answer, whereas a rubric judges each answer against stated criteria. The per-criterion scores also show why an answer lost, which makes disagreements with humans easier to debug.",
      explain: "Criteria beat vibes.",
    },
  ],
  codex: {
    oneLiner: "A judge needs a specific rubric, bias countermeasures like judging both orders, a different model from the one judged, and a human-graded sample.",
    keyNumbers: [
      { label: "Judge agreement with humans, vague small to full setup (lab)", value: "68% to 93%", sourceId: "mt-bench" },
      { label: "Position bias (lab)", value: "about 6 points", sourceId: "not-fair-evaluators" },
    ],
    tradeoffs: [
      { choice: "Large judge", gain: "Higher agreement", cost: "Higher cost per judgment" },
      { choice: "Judge both orders", gain: "Removes position bias", cost: "Double the cost" },
      { choice: "Pairwise versus scored", gain: "Easier to rank two prompts", cost: "More bias" },
    ],
    seenIn: ["MT-Bench and Chatbot Arena style evaluations.", "Faithfulness and relevance graders in RAG evaluation tools."],
    interviewAngle: "Say: 'rubric plus examples, swap the order, use a different judge model, and calibrate against a few hundred human labels before gating'.",
    aws: [{ concept: "LLM-as-a-judge evaluation jobs", service: "Amazon Bedrock model evaluation" }],
    replay: { id: "judge-lab", config: JG, scene: "bias" },
  },
  interview: [
    "What biases do LLM judges have?",
    "How do you validate an LLM judge?",
    "When would you use a rubric rather than pairwise comparison?",
  ],
  deeper: [
    {
      title: "Judges drift",
      body: "A hosted judge model can change under you when the provider updates it, and a prompt that agreed with humans last quarter may not now. Pin the judge's version where you can, keep a small fixed set of human-graded anchors that you re-score regularly, and treat a change in agreement on that set as an alert.",
      sourceIds: ["mt-bench"],
    },
  ],
  honestPhysics: [
    "A small judge agrees with humans on 68% of cases with a vague instruction and a large one on 78%; a detailed rubric adds 8 points, a few worked examples 4. Position bias costs about 6 points; judging both orders and requiring agreement removes it and adds 3 points.",
    "Agreement is known only after grading a 200-case sample by hand. Cost for 1,000 judgments of 1,500 tokens in and 300 out at the teaching prices: small $3, large $6; both orders double it.",
    "Round figures for comparison.",
  ],
  sources: [MTBENCH, NOT_FAIR, ANTHROPIC_EVALS],
  verify: [
    { id: "base", claim: "A small judge with a vague instruction agrees 68%", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { model: "small", rubric: "vague", shots: false, swap: false }, metric: "agreement" }, expect: { min: 0.68, max: 0.68 } },
    { id: "full", claim: "A large judge with rubric, examples and swapped orders reaches 93%", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { model: "large", rubric: "detailed", shots: true, swap: true }, metric: "agreement" }, expect: { min: 0.9 } },
    { id: "bias", claim: "Without swapping there are 6 points of position bias", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { swap: false }, metric: "biasPts" }, expect: { min: 6, max: 6 } },
    { id: "bias-fixed", claim: "Swapping removes it", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { swap: true }, metric: "biasPts" }, expect: { max: 0 } },
    { id: "good-cost", claim: "A large judge with a rubric and swapped orders costs $12 per 1,000", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { model: "large", rubric: "detailed", shots: false, swap: true }, metric: "costPer1k" }, expect: { max: 13 } },
    { id: "good-agree", claim: "…and agrees 89%", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { model: "large", rubric: "detailed", shots: false, swap: true }, metric: "agreement" }, expect: { min: 0.85 } },
    { id: "small-fails", claim: "A small judge with every aid still stops at 83%", run: "lab", params: { model: "judge-lab", config: JG_CHALLENGE, values: { model: "small", rubric: "detailed", shots: true, swap: true }, metric: "agreement" }, expect: { max: 0.85 } },
  ],
});
