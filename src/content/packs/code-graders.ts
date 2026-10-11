import { definePack } from "../define";

export const GR = { start: { g: "numeric", norm: false } };
export const GR_CHALLENGE = {};

const ANTHROPIC_EVALS = { id: "anthropic-evals", title: "Anthropic docs: Create strong empirical evaluations (code-based grading is fastest and most reliable)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests" };
const HUSAIN = { id: "husain-evals", title: "H. Husain: Your AI Product Needs Evals (assertions first)", url: "https://hamel.dev/blog/posts/evals/" };
const JSONSCHEMA = { id: "json-schema", title: "JSON Schema: a vocabulary for validating JSON documents", url: "https://json-schema.org/understanding-json-schema" };

export default definePack({
  id: "code-graders",
  title: "Code-based Graders",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "evals · 22% of correct answers marked wrong", detail: "'1,204.50' did not match '1204.5'" },
    lines: [
      { speaker: "kabir", line: "Our grader says a fifth of the invoice totals are wrong. A person checked, and most are right: the grader wanted the exact same characters." },
      { speaker: "meera", line: "If a program can check the answer, write the program. Then check the program against people, because a grader is code with its own bugs." },
    ],
  },
  predictions: [
    {
      id: "brittle",
      kind: "choice",
      prompt: "A grader requires the model's total to match the expected string exactly. Humans say 22% of the answers it rejects are actually correct ('1,204.50' against '1204.5'). What does that do to your score?",
      options: [
        { id: "nothing", label: "Nothing: errors average out" },
        { id: "under", label: "It understates quality by up to 22 points and hides which prompt is better" },
        { id: "over", label: "It overstates quality" },
      ],
      answer: "under",
      observe: "brittle",
      reveal: {
        text: "A strict grader turns formatting differences into failures. A prompt that writes '1204.5' loses to one that writes '1204.50' for no real reason, and real improvements vanish into the noise. Parse the value, or normalise both sides, then compare what you actually care about.",
        derived: true,
        line: { speaker: "meera", line: "Grade the meaning, not the typography." },
      },
    },
    {
      id: "lenient",
      kind: "choice",
      prompt: "You switch to 'the output contains the expected total'. 12% of the answers it accepts are wrong, such as '11,204.50' which contains '1,204.50'. What kind of error is this?",
      options: [
        { id: "ff", label: "False fail: right answers rejected" },
        { id: "fp", label: "False pass: wrong answers accepted" },
        { id: "none", label: "Neither: it is a rounding issue" },
      ],
      answer: "fp",
      observe: "lenient",
      reveal: {
        text: "Looser matching trades false fails for false passes. A false pass is worse for gating a release, since it lets bad output through. The aim is a grader whose mistakes are both rare: here, parsing the number and comparing with a tolerance gets 1.5% and 0.5%.",
        derived: true,
        line: { speaker: "rao", line: "A grader that approves everything is a rubber stamp." },
      },
    },
  ],
  widget: { id: "grader-lab", config: GR },
  mechanism: [
    {
      id: "why",
      text: "A code-based grader is a program that decides whether an output passes: compare strings, run a regular expression, validate JSON, parse a number, execute generated code against tests. It is fast, free of model calls and repeatable, so use it wherever the answer can be checked mechanically, and keep model judges for what cannot.",
      sourceIds: ["anthropic-evals", "husain-evals"],
    },
    {
      id: "exact",
      scene: "exact",
      text: "Exact match is the simplest and the most brittle: the right answer in a different format fails. Normalise first, trimming, lower-casing, removing thousands separators, and compare after. That removes most false fails from string graders but not their false passes. Contains-checks swap one problem for the other.",
      sourceIds: ["anthropic-evals"],
    },
    {
      id: "shape",
      scene: "shape",
      text: "A schema check confirms output is well-formed: valid JSON, required fields, correct types. It is essential, and it says nothing about whether the values are right: a perfectly formed wrong total passes. Use it as a first gate and a cheap signal, never as the only measure of quality.",
      sourceIds: ["json-schema"],
    },
    {
      id: "numeric",
      scene: "numeric",
      text: "The strongest code graders check meaning: parse the number and compare within a tolerance, run the generated function against unit tests, check that a cited source exists. Validate any grader before trusting it: grade a few hundred by hand, count its false fails and false passes, and fix it until both are low.",
      sourceIds: ["husain-evals", "anthropic-evals"],
    },
  ],
  challenges: [
    {
      id: "pick-grader",
      title: "Choose the grader",
      brief: "The task extracts an invoice total from messy text. Choose the grader so that at most 2% of correct answers are rejected and at most 1% of wrong answers are accepted.",
      line: { speaker: "kabir", line: "I need a grader I can leave running in CI without a person double-checking it." },
      widget: { id: "grader-lab", config: GR_CHALLENGE },
      conditions: [
        { metric: "falseFailPct", op: "<=", value: 0.02, label: "At most 2% of correct answers rejected" },
        { metric: "falsePassPct", op: "<=", value: 0.01, label: "At most 1% of wrong answers accepted" },
      ],
      stars: [],
      hints: [
        "Which graders reject right answers written differently?",
        "Which accept answers that look right but are not?",
        "Is there a grader that checks the value itself?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how to choose and validate a code-based grader.",
    rubric: [
      { id: "mechanical", criterion: "Use code to check what can be checked mechanically: parsed values, schemas, tests, and normalise before comparing", keyIdea: "check meaning mechanically" },
      { id: "errors", criterion: "Strict graders give false fails, loose ones false passes; a schema check alone passes well-formed wrong answers", keyIdea: "two kinds of error" },
      { id: "validate", criterion: "Validate the grader against hand-graded cases and measure both error rates", keyIdea: "validate the grader" },
    ],
    exemplar:
      "I would use code wherever the answer can be checked mechanically, and compare the parsed meaning, such as a number within a tolerance, not the raw string. Strict matching gives false fails and loose matching gives false passes, and a schema check passes anything well-formed even when the value is wrong. Before trusting a grader I would grade a few hundred outputs by hand and measure both error rates against it.",
  },
  reviews: [
    {
      id: "cg-est",
      format: "estimate",
      scenario: "A grader falsely rejects 8% of correct answers. The prompt truly gets 90% of answers right. About what score does the grader report? (90% × (1 − 8%))",
      unit: "%",
      answer: 83,
      acceptFactor: 1.01,
      breakdown: ["0.90 × 0.92 = 0.828", "≈ 83%"],
      explain: "A brittle grader makes a good prompt look seven points worse than it is.",
    },
    {
      id: "cg-pick",
      format: "pick-fix",
      scenario: "A grader checks that the output is valid JSON with the right fields, and a prompt scores 100%, but users report wrong values. What is missing?",
      options: [
        { id: "a", label: "A check of the values themselves, such as parsing and comparing numbers or running tests" },
        { id: "b", label: "A stricter schema" },
        { id: "c", label: "More examples" },
        { id: "d", label: "A longer prompt" },
      ],
      answer: "a",
      explain: "A schema checks the shape, not the facts. Add a grader that checks the values.",
    },
    {
      id: "cg-order",
      format: "order",
      scenario: "Order these graders by false passes (wrong answers accepted), most first.",
      items: [
        { id: "schema", label: "Valid JSON only" },
        { id: "contains", label: "Contains the expected string" },
        { id: "numeric", label: "Parse and compare the number" },
      ],
      answer: ["schema", "contains", "numeric"],
      explain: "40%, 12% and 0.5% in the lab: the more the grader checks the actual value, the fewer wrong answers it lets through.",
    },
    {
      id: "cg-graph",
      format: "predict-graph",
      scenario: "A string grader falsely rejects 22% of correct answers. As normalisation removes more of the formatting differences, from none to all, how does the false-fail rate change?",
      xLabel: "share of formatting differences normalised →",
      yLabel: "false fails",
      options: [
        { id: "fall", label: "Falls steadily toward a small floor", points: [22, 19, 16, 13, 10, 7, 4, 2] },
        { id: "flat", label: "Stays at 22%", points: [22, 22, 22, 22, 22, 22, 22, 22] },
        { id: "rise", label: "Rises", points: [2, 4, 7, 10, 13, 16, 19, 22] },
      ],
      answer: "fall",
      explain: "Each formatting difference you normalise away removes a class of false fails, until only real errors remain.",
    },
    {
      id: "cg-flaw",
      format: "spot-flaw",
      scenario: "A team never checked its regex grader against human labels. It marks every output containing a dollar sign as correct. The score reads 97% and customers disagree. Tap the missing step.",
      diagram: {
        nodes: [
          { id: "out", label: "model output", kind: "llm", col: 0, row: 1 },
          { id: "grader", label: "regex: contains '$'", kind: "worker", col: 1, row: 1 },
          { id: "score", label: "score 97%", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "out", to: "grader" },
          { from: "grader", to: "score" },
        ],
      },
      answer: "out->grader",
      explain: "The grader was never compared with human judgement, so its flaws went unseen. Validate it on a hand-graded sample before it gates anything.",
    },
    {
      id: "cg-explain",
      format: "explain",
      scenario: "In two sentences: why prefer code-based grading to an LLM judge when you can?",
      rubric: [
        { id: "cheap", criterion: "It is fast, free of model costs and exactly repeatable" },
        { id: "reliable", criterion: "It has no judge bias or drift, and its errors can be found and fixed deterministically" },
      ],
      exemplar: "Code graders are fast, cost no model calls and give the same answer every time. They have no judge bias or drift, and any error in one can be found and fixed deterministically.",
      explain: "Reach for a model judge only when code cannot decide.",
    },
  ],
  codex: {
    oneLiner: "Check what code can check: parse values, validate schemas, run tests, normalise before comparing. Validate the grader against hand-graded cases.",
    keyNumbers: [
      { label: "Exact match false fails (lab)", value: "22%", sourceId: "anthropic-evals" },
      { label: "Parse-and-compare (lab)", value: "1.5% false fails, 0.5% false passes", sourceId: "husain-evals" },
    ],
    tradeoffs: [
      { choice: "Exact or strict matching", gain: "No false passes", cost: "Rejects right answers in other formats" },
      { choice: "Contains or loose matching", gain: "Few false fails", cost: "Accepts wrong answers that contain the right text" },
      { choice: "Semantic code check", gain: "Both errors low", cost: "Task-specific work to write" },
    ],
    seenIn: ["Unit tests for generated code (pass@k).", "JSON schema validators in structured-output pipelines."],
    interviewAngle: "Say: 'assertions first, parsed values and tests where possible, normalisation, and a hand-checked sample to measure the grader's own false fails and passes'.",
    aws: [{ concept: "Programmatic evaluation metrics", service: "Amazon Bedrock evaluations" }],
    replay: { id: "grader-lab", config: GR, scene: "numeric" },
  },
  interview: [
    "When would you use a code-based grader instead of an LLM judge?",
    "How do you know a grader is any good?",
    "What is the difference between a false fail and a false pass in an eval?",
  ],
  deeper: [
    {
      title: "Executable checks for code",
      body: "For code generation the best grader runs the code. Hidden unit tests give a pass or fail that no judge can argue with, and the pass@k metric reports whether any of k attempts passes. The cost is a sandbox: generated code must run with no network, limited time and memory, and no access to anything valuable.",
      sourceIds: ["anthropic-evals"],
    },
  ],
  honestPhysics: [
    "A task that extracts the invoice total from messy text. Humans grade 1,000 outputs and the grader is compared with them. A false fail is a correct answer rejected; a false pass is a wrong answer accepted.",
    "Exact match: 22% false fails, 0% false passes. Contains: 3% and 12%. Regex: 8% and 3%. Schema only: 0.5% and 40%. Parse and compare the number: 1.5% and 0.5%. Normalising removes 70% of false fails for the string graders.",
    "Code graders cost nothing in model calls and run in about a millisecond a case.",
  ],
  sources: [ANTHROPIC_EVALS, HUSAIN, JSONSCHEMA],
  verify: [
    { id: "exact", claim: "Exact match falsely rejects 22% of correct answers", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "exact", norm: false }, metric: "falseFailPct" }, expect: { min: 0.22, max: 0.22 } },
    { id: "norm", claim: "Normalising cuts it to 6.6%", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "exact", norm: true }, metric: "falseFailPct" }, expect: { min: 0.06, max: 0.07 } },
    { id: "contains", claim: "Contains accepts 12% of wrong answers", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "contains", norm: true }, metric: "falsePassPct" }, expect: { min: 0.12, max: 0.12 } },
    { id: "schema", claim: "A schema check accepts 40% of wrong answers", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "schema" }, metric: "falsePassPct" }, expect: { min: 0.4, max: 0.4 } },
    { id: "numeric-ff", claim: "Parse-and-compare rejects 1.5% of correct answers", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "numeric" }, metric: "falseFailPct" }, expect: { max: 0.02 } },
    { id: "numeric-fp", claim: "…and accepts 0.5% of wrong ones", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "numeric" }, metric: "falsePassPct" }, expect: { max: 0.01 } },
    { id: "regex", claim: "A regex with normalising is still over 2% on both counts", run: "lab", params: { model: "grader-lab", config: GR_CHALLENGE, values: { g: "regex", norm: true }, metric: "falsePassPct" }, expect: { min: 0.01 } },
  ],
});
