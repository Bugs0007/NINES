import { definePack } from "../define";

export const EV = { start: { n: 800, strat: true, real: true, leak: false } };
export const EV_CHALLENGE = {};

const ANTHROPIC_EVALS = { id: "anthropic-evals", title: "Anthropic docs: Create strong empirical evaluations (task-specific, automate where possible, edge cases)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests" };
const HUSAIN = { id: "husain-evals", title: "H. Husain: Your AI Product Needs Evals", url: "https://hamel.dev/blog/posts/evals/" };
const MILLER = { id: "miller-sample", title: "E. Miller: Sample size calculator for A/B tests (binomial proportions)", url: "https://www.evanmiller.org/ab-testing/sample-size.html" };

export default definePack({
  id: "eval-test-sets",
  title: "Building Eval Sets",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "summariser · eval score 94%, support tickets up 30%", detail: "the eval set is the 100 examples the team wrote by hand" },
    lines: [
      { speaker: "kabir", line: "The summariser scored ninety-four percent on our eval set, yet support says it got worse. The set is the hundred examples we wrote the day we built it." },
      { speaker: "meera", line: "A test that cannot fail is not a test. Make the set big enough to trust, wide enough to cover real inputs, and separate from anything the prompt has seen." },
    ],
  },
  predictions: [
    {
      id: "margin",
      kind: "choice",
      prompt: "The summariser truly passes about 80% of inputs. You measure it on 100 random examples. How far off can the score be, either way, with ordinary luck?",
      options: [
        { id: "one", label: "About 1 point" },
        { id: "three", label: "About 3 points" },
        { id: "eight", label: "About 8 points" },
        { id: "twenty", label: "About 20 points" },
      ],
      answer: "eight",
      observe: "wide-margin",
      reveal: {
        text: "The margin is 1.96 × √(0.8 × 0.2 ÷ 100) = 7.8 points. A prompt change that improves the real pass rate by 4 points is invisible next to ±8: the score might rise, fall or stay the same. A set must be large enough that its noise is smaller than the changes you want to detect.",
        derived: true,
        line: { speaker: "meera", line: "With a hundred cases, a four-point improvement and a four-point regression look the same." },
      },
    },
    {
      id: "rare",
      kind: "choice",
      prompt: "Inputs come in six kinds, and the rarest is 3% of traffic. In a random set of 100, how many examples of the rare kind do you expect?",
      options: [
        { id: "0", label: "None" },
        { id: "3", label: "About 3: far too few to notice a regression there" },
        { id: "10", label: "About 10" },
      ],
      answer: "3",
      observe: "blind-spot",
      reveal: {
        text: "3% of 100 is 3 examples, so whether the prompt handles this kind could swing the whole score by a point or two and no one would see why. If a kind is rare in traffic but costly when wrong, sample it on purpose: a stratified set holds enough of each to test it.",
        derived: true,
        line: { speaker: "rao", line: "The awkward inputs are rare and they are the ones that make the news." },
      },
    },
  ],
  widget: { id: "evalset-lab", config: EV },
  mechanism: [
    {
      id: "why",
      text: "An eval set is a fixed collection of inputs with known good outputs or grading rules, used to tell whether a prompt or model change helped. It replaces opinion with a number. The number is only as trustworthy as the set: its size, its coverage and its independence from the prompt.",
      sourceIds: ["anthropic-evals", "husain-evals"],
    },
    {
      id: "size",
      scene: "size",
      text: "Size sets the noise. The score of N examples is uncertain by about 1.96 × √(p(1−p) ÷ N). With a pass rate near 80%, 100 examples give ±8 points, 400 give ±4, 1,600 give ±2. Halving the noise needs four times the examples, so decide the smallest change that matters, then size the set to see it.",
      sourceIds: ["miller-sample"],
      derived: true,
    },
    {
      id: "strata",
      scene: "strata",
      text: "Coverage matters more than count. Sample real traffic, not only cases you invent, since users produce inputs you would never think of. List the kinds of input and failure, then make sure each has enough examples to test, on purpose if it is rare. Add every real failure you meet, so the set remembers.",
      sourceIds: ["husain-evals", "anthropic-evals"],
    },
    {
      id: "leak",
      scene: "leak",
      text: "Keep the set apart from the prompt. If eval examples also appear as demonstrations in the prompt, the model has seen the answers, and the score is inflated, here by 15 points. Split a development set you may learn from and tune on, from a held-out set that you only score on.",
      sourceIds: ["anthropic-evals"],
    },
  ],
  challenges: [
    {
      id: "build-set",
      title: "Build a set you can believe",
      brief: "The summariser has six kinds of input. Choose the size, sampling and separation so scores are accurate to within 3 points, every kind of input has at least 10 examples, no example appears in the prompt, and labelling at $2 an example costs at most $2,000.",
      line: { speaker: "rao", line: "Labels cost money. Spend it on cases that can tell us something." },
      widget: { id: "evalset-lab", config: EV_CHALLENGE },
      conditions: [
        { metric: "marginPts", op: "<=", value: 3, label: "Accurate to within 3 points" },
        { metric: "uncovered", op: "<=", value: 0, label: "Every kind has at least 10 examples" },
        { metric: "inflationPts", op: "<=", value: 0, label: "No leakage into the prompt" },
        { metric: "labelCost", op: "<=", value: 2000, label: "Labelling at most $2,000" },
      ],
      stars: [{ metric: "marginPts", op: "<=", value: 2.5, label: "Accurate to within 2.5 points" }],
      hints: [
        "How many examples does ±3 points need at an 80% pass rate?",
        "Which kinds of input does a hand-written set miss?",
        "Where else do the eval examples appear?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what makes an eval set trustworthy and how big it needs to be.",
    rubric: [
      { id: "size", criterion: "The score's noise falls with the square root of the number of examples, so size the set to see the smallest change that matters", keyIdea: "size sets noise" },
      { id: "coverage", criterion: "Sample real traffic and cover every kind of input and failure, rare ones on purpose", keyIdea: "coverage of real inputs" },
      { id: "leak", criterion: "Keep eval examples out of the prompt and tune on a separate development set", keyIdea: "no leakage" },
    ],
    exemplar:
      "The score's noise falls with the square root of the number of examples, so I would decide the smallest change worth detecting, say two or three points, and size the set to see it, which is roughly a thousand examples at an 80% pass rate. I would sample real traffic and list the kinds of input, making sure each, including the rare awkward ones, has enough examples to test. And I would keep eval examples out of the prompt, tuning on a development set and scoring on a held-out one.",
  },
  reviews: [
    {
      id: "es-est",
      format: "estimate",
      scenario: "A pass rate near 85% is measured on 400 examples. About how many points either way is the 95% margin? (1.96 × √(0.85 × 0.15 ÷ 400))",
      unit: "points",
      answer: 3.5,
      acceptFactor: 1.1,
      breakdown: ["0.85 × 0.15 = 0.1275", "÷ 400 = 0.000319; √ = 0.0179", "× 1.96 = 0.035: 3.5 points"],
      explain: "Four hundred examples cannot see a two-point change. It takes about 1,200 to get to ±2.",
    },
    {
      id: "es-pick",
      format: "pick-fix",
      scenario: "A team improves its prompt by adding five worked examples copied from its eval set, and the score jumps 12 points. What is the problem?",
      options: [
        { id: "a", label: "The score is inflated: the model was shown the answers; use a separate development set" },
        { id: "b", label: "Nothing: more examples help" },
        { id: "c", label: "The eval set is too large" },
        { id: "d", label: "The grader is broken" },
      ],
      answer: "a",
      explain: "Demonstrations drawn from the eval set make the score measure memory, not skill. Held-out data is held out for exactly this.",
    },
    {
      id: "es-order",
      format: "order",
      scenario: "Order these eval set sizes by how accurately they measure an 80% pass rate, least accurate first.",
      items: [
        { id: "n50", label: "50 examples" },
        { id: "n400", label: "400 examples" },
        { id: "n1600", label: "1,600 examples" },
      ],
      answer: ["n50", "n400", "n1600"],
      explain: "Margins of about 11, 4 and 2 points: each fourfold increase halves the noise.",
    },
    {
      id: "es-graph",
      format: "predict-graph",
      scenario: "As the number of eval examples grows from 25 to 5,000, how does the margin of error on an 80% pass rate change?",
      xLabel: "examples →",
      yLabel: "margin of error (points)",
      options: [
        { id: "sqrt", label: "Falls steeply at first, then slowly, as 1 ÷ √N", points: [15.7, 11.1, 7.8, 5.5, 3.9, 2.8, 1.9, 1.1] },
        { id: "linear", label: "Falls in a straight line to zero", points: [15, 13, 11, 9, 7, 5, 3, 0] },
        { id: "flat", label: "Stays about 8", points: [8, 8, 8, 8, 8, 8, 8, 8] },
      ],
      answer: "sqrt",
      explain: "Noise falls with the square root of N, so each extra example buys less than the one before.",
    },
    {
      id: "es-flaw",
      format: "spot-flaw",
      scenario: "A team builds its eval set by asking the model to generate 500 questions and answers about its own documents. The prompt then scores 99%. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "gen", label: "model generates questions and answers", kind: "llm", col: 0, row: 1 },
          { id: "set", label: "500-case eval set", kind: "store", col: 1, row: 1 },
          { id: "score", label: "same model scores 99%", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "gen", to: "set" },
          { from: "set", to: "score" },
        ],
      },
      answer: "gen->set",
      explain: "Cases written by the system under test only test what it already finds easy. Sample real questions, and have people check the answers.",
    },
    {
      id: "es-explain",
      format: "explain",
      scenario: "In two sentences: why add every real production failure to the eval set?",
      rubric: [
        { id: "remember", criterion: "The set then remembers past failures, so a regression to a known bug is caught immediately" },
        { id: "coverage", criterion: "Real failures show the inputs the original set did not anticipate, steadily improving coverage" },
      ],
      exemplar: "It makes the set remember, so any future change that brings back a known failure is caught at once. Real failures also reveal kinds of input the original set missed, so coverage improves with every incident.",
      explain: "A good eval set is a log of everything that has gone wrong.",
    },
  ],
  codex: {
    oneLiner: "Size the set to see the change you care about, cover real inputs including rare ones, and keep it out of the prompt.",
    keyNumbers: [
      { label: "Margin of error at 80%", value: "1.96 × √(0.8 × 0.2 ÷ N)", sourceId: "miller-sample" },
      { label: "N for ±3 points at 80%", value: "about 700", sourceId: "miller-sample" },
    ],
    tradeoffs: [
      { choice: "Bigger set", gain: "Smaller noise", cost: "Labelling cost; slower runs" },
      { choice: "Stratified sampling", gain: "Every kind tested", cost: "Overall score needs reweighting" },
      { choice: "Held-out split", gain: "Honest score", cost: "Fewer examples to tune on" },
    ],
    seenIn: ["Golden sets built from support tickets.", "Held-out test splits in machine learning."],
    interviewAngle: "Say: 'size the set to the smallest change that matters, sample real traffic, cover rare kinds on purpose, and keep it out of the prompt'.",
    aws: [{ concept: "Evaluation jobs on labelled datasets", service: "Amazon Bedrock model evaluation" }],
    replay: { id: "evalset-lab", config: EV, scene: "strata" },
  },
  interview: [
    "How big should an eval set be?",
    "How do you make sure an eval set covers real usage?",
    "What is eval set leakage?",
  ],
  deeper: [
    {
      title: "Labelling is the bottleneck",
      body: "Writing the expected answer for each case is the slow, costly part, and it is where quality is lost: tired labellers disagree. Measure agreement between two labellers on a sample, and where they differ, tighten the guideline rather than averaging. A smaller set with reliable labels beats a large noisy one.",
      sourceIds: ["husain-evals"],
    },
  ],
  honestPhysics: [
    "A summariser with six kinds of input in these shares: 40%, 25%, 15%, 10%, 7%, 3%. Its true pass rate is about 80%. The score of N examples is accurate to ±1.96 × √(0.8 × 0.2 ÷ N).",
    "A kind is covered if the set holds at least 10 examples of it: N × share when random, N ÷ 6 when stratified. Hand-written sets without real traffic miss two further kinds. Leakage into the prompt inflates the score by about 15 points. Labelling costs $2 an example.",
    "Round figures for the exercise.",
  ],
  sources: [ANTHROPIC_EVALS, HUSAIN, MILLER],
  verify: [
    { id: "n100", claim: "100 examples are accurate to ±7.8 points", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 100 }, metric: "marginPts" }, expect: { min: 7.7, max: 7.9 } },
    { id: "n800", claim: "800 are accurate to ±2.8", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 800 }, metric: "marginPts" }, expect: { max: 3 } },
    { id: "rare", claim: "A random set of 100 leaves kinds under-covered", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 100, strat: false, real: true }, metric: "uncovered" }, expect: { min: 1 } },
    { id: "hand", claim: "Hand-written sets miss two more kinds", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 800, strat: true, real: false }, metric: "uncovered" }, expect: { min: 2 } },
    { id: "leak", claim: "Leakage inflates the score by 15 points", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { leak: true }, metric: "inflationPts" }, expect: { min: 15, max: 15 } },
    { id: "cost", claim: "1,000 examples cost $2,000", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 1000 }, metric: "labelCost" }, expect: { min: 2000, max: 2000 } },
    { id: "n700", claim: "700 random real examples are enough for ±3", run: "lab", params: { model: "evalset-lab", config: EV_CHALLENGE, values: { n: 700, strat: false, real: true, leak: false }, metric: "marginPts" }, expect: { max: 3 } },
  ],
});
