import { definePack } from "../define";

export const RG = { start: { n: 800, paired: true, t: 2.2 } };
export const RG_CHALLENGE = {};

const MILLER = { id: "miller-sample", title: "E. Miller: Sample size calculator for A/B tests (binomial proportions)", url: "https://www.evanmiller.org/ab-testing/sample-size.html" };
const MILLER_PEEK = { id: "miller-peek", title: "E. Miller: How Not To Run An A/B Test", url: "https://www.evanmiller.org/how-not-to-run-an-ab-test.html" };
const HUSAIN = { id: "husain-evals", title: "H. Husain: Your AI Product Needs Evals", url: "https://hamel.dev/blog/posts/evals/" };

export default definePack({
  id: "prompt-regression",
  title: "Prompt Regression Testing",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "CI · prompt eval 'failed' on a comment-only change", detail: "score dropped 3.1 points, retry passed" },
    lines: [
      { speaker: "kabir", line: "Our prompt tests fail at random, and last week they passed a change that made refunds worse. Now nobody trusts the red or the green." },
      { speaker: "meera", line: "A gate has two errors: letting a regression through and blocking a change that was fine. The suite size and the threshold decide both." },
    ],
  },
  predictions: [
    {
      id: "weak",
      kind: "choice",
      prompt: "A prompt change truly makes the pass rate 4 points worse. Your suite is 100 cases and the gate blocks on a drop of 4 points or more. What is the chance it blocks the change?",
      options: [
        { id: "sure", label: "Almost certain" },
        { id: "likely", label: "About 80%" },
        { id: "coin", label: "About 50%: a coin flip" },
        { id: "rare", label: "About 10%" },
      ],
      answer: "coin",
      observe: "missed",
      reveal: {
        text: "With 100 cases, the measured difference between two prompts is uncertain by about 5 points either way. A real 4-point drop shows up as a drop of more than 4 points exactly half the time. And the same gate blocks an unchanged prompt 21% of the time. A small suite makes the gate both blind and jumpy.",
        derived: true,
        line: { speaker: "meera", line: "The real drop and the noise are the same size, so the gate cannot tell them apart." },
      },
    },
    {
      id: "wolf",
      kind: "choice",
      prompt: "To catch more regressions you lower the threshold to 1 point on a 200-case suite. What happens to changes that did nothing?",
      options: [
        { id: "nothing", label: "Nothing: they pass as before" },
        { id: "blocked", label: "A large share are blocked by noise alone, and people stop trusting the gate" },
        { id: "faster", label: "They run faster" },
      ],
      answer: "blocked",
      observe: "cry-wolf",
      reveal: {
        text: "At 200 cases the noise in the difference is about 3.6 points, so a threshold of 1 point is exceeded by chance almost 40% of the time. A gate that blocks harmless changes at that rate trains the team to rerun until it is green, which is the same as having no gate.",
        derived: true,
        line: { speaker: "rao", line: "An alarm that rings all the time is the same as no alarm." },
      },
    },
  ],
  widget: { id: "regress-lab", config: RG },
  mechanism: [
    {
      id: "why",
      text: "A prompt is code that behaves differently on every input. Regression testing runs a fixed suite before and after a change and blocks the change if the score falls too far. It turns 'seems fine' into evidence, and lets people edit prompts without fear.",
      sourceIds: ["husain-evals"],
    },
    {
      id: "noise",
      scene: "power",
      text: "Scores are noisy. The difference between two prompts measured on N cases has a standard error of about √(2 × p × (1 − p) ÷ N), around 5 points for 100 cases and 1.8 for 800. A gate can only see changes larger than its noise. Decide the smallest regression you must catch and size the suite for it.",
      sourceIds: ["miller-sample"],
      derived: true,
    },
    {
      id: "paired",
      scene: "paired",
      text: "Run both prompts on the same cases and compare case by case. Cases that are hard for one prompt tend to be hard for the other, so most of the variation cancels. In the lab, pairing cuts the noise to 0.71 of its size, which lets a suite half as large see the same change.",
      sourceIds: ["miller-sample", "husain-evals"],
    },
    {
      id: "threshold",
      scene: "threshold",
      text: "The threshold balances the two errors. A low threshold catches more real regressions and blocks more harmless changes; a high one does the reverse. Set it between the real effect and the noise: about two standard errors in the lab. Do not rerun until green, which silently turns a 5% false-alarm gate into a gate that always passes.",
      sourceIds: ["miller-peek"],
    },
  ],
  challenges: [
    {
      id: "gate",
      title: "Set the regression gate",
      brief: "A real regression is 4 points. Choose the suite size, pairing and threshold so the gate blocks at least 85% of real 4-point regressions, blocks at most 5% of unchanged prompts, and a run costs at most $2.50 at $0.003 a case.",
      line: { speaker: "kabir", line: "I want red to mean something, and green to mean it too." },
      widget: { id: "regress-lab", config: RG_CHALLENGE },
      conditions: [
        { metric: "detectProb", op: ">=", value: 0.85, label: "Blocks 85% of real 4-point drops" },
        { metric: "falseAlarmProb", op: "<=", value: 0.05, label: "Blocks at most 5% of unchanged prompts" },
        { metric: "costPerRun", op: "<=", value: 2.5, label: "At most $2.50 per run" },
      ],
      stars: [],
      hints: [
        "How much noise does a 100-case suite have?",
        "What does running both prompts on the same cases do to the noise?",
        "Where should the threshold sit between the effect and the noise?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how to build a prompt regression gate that people can trust.",
    rubric: [
      { id: "noise", criterion: "The measured difference is noisy, with standard error falling as 1 over the root of the suite size; the gate can only see changes bigger than its noise", keyIdea: "noise limits what you can see" },
      { id: "paired", criterion: "Run both prompts on the same cases and compare per case to cut the noise", keyIdea: "paired comparison" },
      { id: "threshold", criterion: "Set the threshold between the effect to catch and the noise, balancing misses against false alarms, and never rerun until green", keyIdea: "threshold balances two errors" },
    ],
    exemplar:
      "The measured difference between two prompts is noisy, and the noise falls only with the square root of the suite size, so the gate can only see changes larger than that noise. I would run both prompts on the same cases and compare case by case, which cuts the noise by about a third, and size the suite for the smallest regression I must catch. Then I would set the threshold between that effect and the noise, to balance missed regressions against false alarms, and never rerun a failing gate until it goes green.",
  },
  reviews: [
    {
      id: "pr-est",
      format: "estimate",
      scenario: "Two prompts passing about 85% are compared on 800 independent cases. About how many points is the standard error of the difference? (√(2 × 0.85 × 0.15 ÷ 800))",
      unit: "points",
      answer: 1.8,
      acceptFactor: 1.1,
      breakdown: ["2 × 0.1275 = 0.255; ÷ 800 = 0.000319", "√ = 0.0179", "≈ 1.8 points"],
      explain: "A 4-point regression is a bit over two standard errors, which is why 800 cases are enough to see it most of the time.",
    },
    {
      id: "pr-pick",
      format: "pick-fix",
      scenario: "The prompt gate fails about one run in five on changes that did nothing. The team's habit is to rerun until it passes. What should they do instead?",
      options: [
        { id: "a", label: "Enlarge or pair the suite and raise the threshold until false alarms are rare" },
        { id: "b", label: "Keep rerunning" },
        { id: "c", label: "Remove the gate" },
        { id: "d", label: "Lower the threshold" },
      ],
      answer: "a",
      explain: "Rerunning until green hides the problem and turns the gate into a formality. The cure is less noise and a threshold that matches it.",
    },
    {
      id: "pr-order",
      format: "order",
      scenario: "Order these suites by noise in the measured difference, largest first (85% pass rate).",
      items: [
        { id: "n100", label: "100 cases, independent" },
        { id: "n800", label: "800 cases, independent" },
        { id: "n800p", label: "800 cases, paired" },
      ],
      answer: ["n100", "n800", "n800p"],
      explain: "5.0, 1.8 and 1.3 points: more cases and pairing both cut the noise.",
    },
    {
      id: "pr-graph",
      format: "predict-graph",
      scenario: "As the suite grows from 100 to 5,000 cases with the threshold set at 2.2 points and pairing on, how does the chance of catching a real 4-point drop change?",
      xLabel: "suite size →",
      yLabel: "chance of blocking a real drop",
      options: [
        { id: "s", label: "Rises from about 70% and levels near 100%", points: [69, 76, 84, 92, 97, 99.7, 100, 100] },
        { id: "flat", label: "Stays about 50%", points: [50, 50, 50, 50, 50, 50, 50, 50] },
        { id: "fall", label: "Falls", points: [100, 99, 97, 92, 83, 73, 58, 50] },
      ],
      answer: "s",
      explain: "As the noise shrinks below the 4-point effect, the gate sees it nearly every time.",
    },
    {
      id: "pr-flaw",
      format: "spot-flaw",
      scenario: "A prompt gate runs the old prompt on one random set of 300 cases and the new prompt on a different random set of 300. Scores differ by 3 points either way between runs. Tap the design flaw.",
      diagram: {
        nodes: [
          { id: "old", label: "old prompt on set A", kind: "llm", col: 0, row: 0 },
          { id: "new", label: "new prompt on set B", kind: "llm", col: 0, row: 2 },
          { id: "cmp", label: "compare scores", kind: "server", col: 1, row: 1 },
        ],
        edges: [
          { from: "old", to: "cmp" },
          { from: "new", to: "cmp" },
        ],
      },
      answer: "new->cmp",
      explain: "Different cases for each prompt add the variation between cases to the comparison. Use the same cases for both and compare per case.",
    },
    {
      id: "pr-explain",
      format: "explain",
      scenario: "In two sentences: why does halving the noise of a gate need four times as many cases?",
      rubric: [
        { id: "sqrt", criterion: "The standard error of a measured proportion falls with the square root of the number of cases" },
        { id: "cost", criterion: "So precision gets expensive quickly, which is why pairing and better graders are worth more than ever larger suites" },
      ],
      exemplar: "The standard error of a measured pass rate falls only with the square root of the number of cases, so halving it needs four times as many. That is why pairing the comparison and using better graders often beat simply running a bigger suite.",
      explain: "Precision gets dearer with every step.",
    },
  ],
  codex: {
    oneLiner: "A gate sees only changes bigger than its noise. Pair both prompts on the same cases and set the threshold between effect and noise.",
    keyNumbers: [
      { label: "Standard error of a difference, independent cases", value: "√(2p(1−p) ÷ N)", sourceId: "miller-sample" },
      { label: "Pairing", value: "about 0.71 of the noise in the lab", sourceId: "miller-sample" },
    ],
    tradeoffs: [
      { choice: "Bigger suite", gain: "Less noise", cost: "Run cost and time" },
      { choice: "Lower threshold", gain: "Catches more regressions", cost: "More false alarms" },
      { choice: "Paired comparison", gain: "Less noise for the same cost", cost: "Needs a per-case output from both prompts" },
    ],
    seenIn: ["Prompt CI in tools such as promptfoo and Braintrust.", "A/B test power calculations."],
    interviewAngle: "Say: 'size the suite for the smallest regression, pair both prompts on the same cases, set the threshold from the noise, and track false alarms'.",
    aws: [{ concept: "Automated evaluation in CI", service: "Amazon Bedrock evaluations with CodePipeline" }],
    replay: { id: "regress-lab", config: RG, scene: "paired" },
  },
  interview: [
    "How would you test a prompt change before shipping?",
    "Why is a prompt eval result noisy?",
    "How do you pick the threshold for a regression gate?",
  ],
  deeper: [
    {
      title: "Flaky because of the model, not the suite",
      body: "Even on a fixed suite, a model sampled at nonzero temperature gives different outputs each run, so the score varies without any change. Running each case several times, or setting temperature to zero for evaluation, separates that variation from the effect of your change. Fix a random seed where the API allows, and note that it is not a guarantee.",
      sourceIds: ["husain-evals"],
    },
  ],
  honestPhysics: [
    "The current prompt passes about 85% of cases. A candidate that is really 4 points worse is run on the same suite. The difference between two pass rates measured on N independent cases has a standard error of √(2 × 0.85 × 0.15 ÷ N); running both prompts on the same cases pairs them and cuts it to 0.71 of that.",
    "The gate blocks if the measured drop exceeds a threshold. Detect probability is the chance a real 4-point drop is blocked; false alarm is the chance an unchanged prompt is blocked. Each case costs $0.003.",
    "Normal approximation; it ignores dependence between cases beyond pairing.",
  ],
  sources: [MILLER, MILLER_PEEK, HUSAIN],
  verify: [
    { id: "n100", claim: "A 100-case gate with a 4-point threshold catches a real 4-point drop half the time", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 100, paired: false, t: 4 }, metric: "detectProb" }, expect: { min: 0.49, max: 0.51 } },
    { id: "n100-fa", claim: "…and blocks 21% of unchanged prompts", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 100, paired: false, t: 4 }, metric: "falseAlarmProb" }, expect: { min: 0.2, max: 0.23 } },
    { id: "good-detect", claim: "800 paired cases at a 2.2-point threshold catch 92%", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 800, paired: true, t: 2.2 }, metric: "detectProb" }, expect: { min: 0.85 } },
    { id: "good-fa", claim: "…with 4% false alarms", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 800, paired: true, t: 2.2 }, metric: "falseAlarmProb" }, expect: { max: 0.05 } },
    { id: "good-cost", claim: "…for $2.40 a run", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 800, paired: true, t: 2.2 }, metric: "costPerRun" }, expect: { max: 2.5 } },
    { id: "unpaired", claim: "Without pairing, 800 cases cannot meet both targets", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 800, paired: false, t: 2.4 }, metric: "detectProb" }, expect: { max: 0.85 } },
    { id: "wolf", claim: "A 1-point threshold on 200 independent cases cries wolf", run: "lab", params: { model: "regress-lab", config: RG_CHALLENGE, values: { n: 200, paired: false, t: 1 }, metric: "falseAlarmProb" }, expect: { min: 0.2 } },
  ],
});
