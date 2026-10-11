import { definePack } from "../define";

export const VERSION = { start: { cases: 100, margin: 0.02 } };
export const VERSION_CHALLENGE = { start: { cases: 50, margin: 0.02 } };

const MILLER = { id: "miller-2024", title: "E. Miller (2024), Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations", url: "https://arxiv.org/abs/2411.00640" };
const ANTHROPIC_EVALS = { id: "anthropic-evals", title: "Anthropic docs: Define success criteria and build evaluations", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests" };
const SRE_RELEASE = { id: "sre-release", title: "Google SRE Book, ch. 8: Release Engineering (versioned, reproducible releases)", url: "https://sre.google/sre-book/release-engineering/" };

export default definePack({
  id: "prompt-versioning",
  title: "Prompt Versioning & Regression Tests",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "Copilot · refund-policy answers", detail: "regressed after Tuesday's 'small wording tweak'" },
    lines: [
      { speaker: "kabir", line: "Someone shortened the system prompt on Tuesday to save tokens. Nobody noticed that refund answers got worse until a customer pointed it out." },
      { speaker: "meera", line: "A prompt is code that changes behaviour. It needs versions, a test set, and a gate, like anything else you ship." },
    ],
  },
  predictions: [
    {
      id: "small-set",
      kind: "choice",
      prompt: "A prompt scores 80% on your test set. You test a candidate on 20 cases and it scores 75%. Do you know it is worse?",
      options: [
        { id: "yes", label: "Yes, it dropped five points" },
        { id: "maybe", label: "No: with 20 cases the noise is about 9 points, so five could be luck" },
        { id: "no-never", label: "No, a test set can never show a difference" },
        { id: "worse", label: "Yes, because it is lower on the same cases" },
      ],
      answer: "maybe",
      observe: "underpowered",
      reveal: {
        text: "At an 80% pass rate, the noise in a score from n cases is about the square root of 0.8 × 0.2 ÷ n, which is 9 points for 20 cases. A five-point drop is well inside that, so a twenty-case test can neither confirm a regression nor clear a change.",
        derived: true,
        line: { speaker: "meera", line: "A small test set gives you a number, not an answer." },
      },
    },
  ],
  widget: { id: "version-lab", config: VERSION },
  mechanism: [
    {
      id: "version",
      text: "Treat prompts as versioned artefacts. Keep them in source control or a prompt registry, give each release an identifier, and log which version produced each response. That makes a regression traceable to a change and a rollback a one-line operation.",
      sourceIds: ["sre-release"],
    },
    {
      id: "noise",
      scene: "noise",
      text: "Evaluation scores are noisy. A pass rate measured on n cases has a standard error of about √(p(1−p) ÷ n), 4 points at n = 100 for an 80% prompt and 2 points at 400. Differences smaller than the noise are not evidence, and a single run of a few cases settles nothing.",
      sourceIds: ["miller-2024"],
      derived: true,
    },
    {
      id: "gate",
      scene: "margin",
      text: "A release gate turns the score into a decision: ship if the candidate is no worse than the baseline minus a margin. The margin trades two errors: set it tight and you block good changes by noise, loose and you ship real regressions. More cases narrow both, at a cost per run.",
      derived: true,
    },
    {
      id: "process",
      text: "Keep the set growing: every production failure becomes a new case, so the same bug cannot return. Run the gate on every prompt change in CI, compare against the current baseline on the same cases, and require sign-off for changes the gate cannot judge. The next chapter builds the evals themselves.",
      sourceIds: ["anthropic-evals"],
    },
  ],
  challenges: [
    {
      id: "release-gate",
      title: "Set the release gate",
      brief: "A prompt passes 80% of cases. A candidate is either unchanged or five points worse. Choose the number of test cases and the allowed drop so the gate catches at least 80% of real regressions, wrongly blocks at most 10% of good prompts, and one eval run costs at most $4.50 at a cent per case.",
      line: { speaker: "rao", line: "Each eval run is real money. Give me the smallest set that makes the gate honest." },
      widget: { id: "version-lab", config: VERSION_CHALLENGE },
      conditions: [
        { metric: "power", op: ">=", value: 0.8, label: "Catches at least 80% of regressions" },
        { metric: "falseAlarm", op: "<=", value: 0.1, label: "Blocks at most 10% of good prompts" },
        { metric: "evalCostUsd", op: "<=", value: 4.5, label: "At most $4.50 per eval run" },
      ],
      stars: [{ metric: "evalCostUsd", op: "<=", value: 3.5, label: "At most $3.50 per run" }],
      hints: [
        "With few cases, can any margin satisfy both error rates?",
        "Look at where the two curves cross, and how much noise remains at each size.",
        "A margin near the middle of zero and the five-point regression balances the two errors.",
      ],
    },
  ],
  explainBack: {
    prompt: "How would you ship prompt changes safely?",
    rubric: [
      { id: "version", criterion: "Version prompts, log which version produced each response, and keep rollback easy", keyIdea: "versioned and rollbackable" },
      { id: "test", criterion: "Run a regression test set against the baseline on every change, growing it from production failures", keyIdea: "regression set" },
      { id: "stats", criterion: "Account for noise: use enough cases and a margin so small differences are not mistaken for signal", keyIdea: "noise and sample size" },
    ],
    exemplar:
      "I keep prompts in version control with an id logged on every response, so a regression is traceable and rollback is trivial. Every change runs against a regression test set that grows from production failures, compared to the baseline on the same cases. Because scores are noisy I use enough cases and a margin so that a small difference is not mistaken for a real one, and I weigh the cost of each run.",
  },
  reviews: [
    {
      id: "pv-est-se",
      format: "estimate",
      scenario: "A prompt passes about 80% of cases. What is the standard error, in percentage points, of its score measured on 100 cases? (√(p(1−p) ÷ n))",
      unit: "points",
      answer: 4,
      acceptFactor: 1.2,
      breakdown: ["√(0.8 × 0.2 ÷ 100)", "= √0.0016", "= 0.04 = 4 points"],
      explain: "Four points of noise on a hundred cases. A two-point difference there is meaningless.",
    },
    {
      id: "pv-est-n",
      format: "estimate",
      scenario: "To get the standard error down to 2 points for an 80% pass rate, about how many cases do you need?",
      unit: "cases",
      answer: 400,
      acceptFactor: 1.2,
      breakdown: ["n = p(1−p) ÷ se² = 0.16 ÷ 0.0004", "= 400 cases"],
      explain: "Halving the noise takes four times the cases, so precision gets expensive quickly.",
    },
    {
      id: "pv-pick",
      format: "pick-fix",
      scenario: "A candidate prompt scores 83% against the baseline's 80% on 40 test cases, and a teammate wants to ship it as 'better'. What is the right response?",
      options: [
        { id: "a", label: "Run it on a larger set, or check whether a 3-point difference exceeds the noise, before claiming it is better" },
        { id: "b", label: "Ship it immediately; higher is higher" },
        { id: "c", label: "Reject it; any change is risky" },
        { id: "d", label: "Test on the same 40 again" },
      ],
      answer: "a",
      explain: "With 40 cases the noise is about 6 points, so three points is not evidence. Re-running the same cases will not add information; more cases will.",
    },
    {
      id: "pv-order",
      format: "order",
      scenario: "Order these eval set sizes by how reliably they detect a five-point regression, least reliably first.",
      items: [
        { id: "n20", label: "20 cases" },
        { id: "n100", label: "100 cases" },
        { id: "n400", label: "400 cases" },
        { id: "n2000", label: "2,000 cases" },
      ],
      answer: ["n20", "n100", "n400", "n2000"],
      explain: "Noise falls with the square root of the number of cases, so detection improves with size, with diminishing returns per dollar.",
    },
    {
      id: "pv-flaw",
      format: "spot-flaw",
      scenario: "Prompts live in a shared document that anyone can edit. Production reads the latest text, and responses are logged without a prompt id. A regression appears and nobody can tell which edit caused it. Tap what is missing.",
      diagram: {
        nodes: [
          { id: "doc", label: "shared doc · edited freely, no versions", kind: "store", col: 0, row: 1 },
          { id: "prod", label: "production · reads the latest text", kind: "server", col: 1, row: 1 },
        ],
        edges: [{ from: "doc", to: "prod" }],
      },
      answer: "doc",
      explain: "Without immutable versions and a logged id, behaviour cannot be traced to a change or rolled back. Keep prompts in version control, deploy specific versions, and log the version with each response.",
    },
    {
      id: "pv-explain",
      format: "explain",
      scenario: "In two sentences: why should every production failure become a regression test case?",
      rubric: [
        { id: "recur", criterion: "A fixed bug can return with a later prompt or model change unless a test catches it" },
        { id: "grow", criterion: "The test set grows to reflect real failures, so the gate protects what has actually gone wrong" },
      ],
      exemplar: "A fixed failure can come back after a later prompt or model change unless a test catches it. Adding each failure makes the set reflect what has really gone wrong, so the gate protects against it.",
      explain: "Regression tests are the memory of past incidents.",
    },
  ],
  codex: {
    oneLiner: "Version prompts, test every change against a growing regression set, and size the set so noise is smaller than the changes you care about.",
    keyNumbers: [
      { label: "Standard error of a pass rate", value: "√(p(1−p) ÷ n)", sourceId: "miller-2024" },
      { label: "80% prompt, 100 cases", value: "about 4 points of noise", sourceId: "miller-2024" },
      { label: "Four times the cases", value: "half the noise", sourceId: "miller-2024" },
    ],
    tradeoffs: [
      { choice: "More test cases", gain: "A gate that catches real regressions without false alarms", cost: "More money and time per run" },
      { choice: "A tighter margin", gain: "Catches smaller regressions", cost: "Blocks more good changes by chance" },
    ],
    seenIn: ["Prompt registries and CI checks that run evals on every change.", "Rollbacks of a prompt version after a regression."],
    interviewAngle: "Say 'prompt versions, a regression set, and a gate that accounts for noise': 'I would not trust a three-point difference on fifty cases.'",
    aws: [{ concept: "Prompt versions", service: "Amazon Bedrock Prompt Management (versioned prompts)" }],
    replay: { id: "version-lab", config: VERSION_CHALLENGE, scene: "noise" },
  },
  interview: [
    "How do you manage prompts in production?",
    "How many eval cases do you need to detect a 3-point improvement?",
    "What would you do when a prompt change helps one metric and hurts another?",
  ],
  deeper: [
    {
      title: "Paired comparisons",
      body: "When the candidate and baseline are scored on the same cases, the comparison is paired: cases that both pass or both fail carry no information about the difference, and only the cases where they disagree matter. That makes a paired test much more sensitive than comparing two independent scores, which is why the lab treats the two runs as correlated and why you should always compare on identical cases.",
      sourceIds: ["miller-2024"],
    },
  ],
  honestPhysics: [
    "The baseline passes 80% of cases. A candidate is either unchanged or five points worse. The standard error of the measured difference is taken as √(p(1−p) ÷ n), which assumes the runs on the same cases are correlated about as strongly as real eval runs often are.",
    "The normal approximation is rough for small n. A case costs about a cent to run and grade.",
  ],
  sources: [MILLER, ANTHROPIC_EVALS, SRE_RELEASE],
  verify: [
    { id: "se20", claim: "With 20 cases a five-point regression is caught less than 70% of the time at a 2-point margin", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 20, margin: 0.02 }, metric: "power" }, expect: { max: 0.7 } },
    { id: "se20-fa", claim: "…while good prompts are blocked far too often", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 20, margin: 0.02 }, metric: "falseAlarm" }, expect: { min: 0.3 } },
    { id: "win-power", claim: "300 cases with a 3-point margin catch at least 80% of regressions", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 300, margin: 0.03 }, metric: "power" }, expect: { min: 0.8 } },
    { id: "win-fa", claim: "…and block under 10% of good prompts", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 300, margin: 0.03 }, metric: "falseAlarm" }, expect: { max: 0.1 } },
    { id: "too-small", claim: "100 cases cannot satisfy both at any margin: at 2.5 points false alarms exceed 10%", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 100, margin: 0.025 }, metric: "falseAlarm" }, expect: { min: 0.1 } },
    { id: "too-costly", claim: "500 cases cost more than $4.50", run: "lab", params: { model: "version-lab", config: VERSION_CHALLENGE, values: { cases: 500, margin: 0.03 }, metric: "evalCostUsd" }, expect: { min: 4.5 } },
  ],
});
