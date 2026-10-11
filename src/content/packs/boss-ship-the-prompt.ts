import { defineBoss } from "../define";

export const SHIP = {};

const ANTHROPIC_EVALS = { id: "anthropic-evals", title: "Anthropic docs: Create strong empirical evaluations", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests" };
const MTBENCH = { id: "mt-bench", title: "L. Zheng et al. (2023), Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", url: "https://arxiv.org/abs/2306.05685" };
const KOHAVI = { id: "kohavi-experiments", title: "R. Kohavi, D. Tang, Y. Xu, Trustworthy Online Controlled Experiments", url: "https://experimentguide.com/" };

export default defineBoss({
  id: "boss-ship-the-prompt",
  title: "Boss: Ship the Prompt",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "launch",
    alert: { severity: "info", title: "release · prompt v8 ready to ship", detail: "new system prompt, same model, no gate yet" },
    lines: [{ speaker: "kabir", line: "Prompt v8 looks great on the three examples I tried. It goes to everyone on Friday, unless you build a gate that can stop it." }],
  },
  intro: [
    { speaker: "meera", line: "Assume v8 really is four points worse: one point of formatting mistakes and three of quality. Your gate has to find that and not cry wolf." },
    { speaker: "rao", line: "Every case costs money and every day of testing delays the launch. A gate that costs more than it saves is not a gate." },
    { speaker: "kabir", line: "Whatever slips through must hurt as few customers as possible, and I want to hear about it from a dashboard." },
  ],
  forecast: {
    metric: "harmedUsers",
    prompt: "Before you build the gate: if v8 ships as things stand, how many user-days of worse answers should you expect?",
    unit: "user-days",
    scale: 1,
    min: 100,
    max: 100000,
    tolerance: 1.5,
  },
  exercises: ["eval-test-sets", "code-graders", "llm-as-judge", "prompt-regression", "offline-online-evals"],
  challenge: {
    id: "ship-gate",
    title: "Build the release gate",
    brief: "Prompt v8 is secretly 4 points worse. Choose the suite size, graders, judge checking, pairing, threshold and rollout so the chance it ships is at most 2%, a good prompt is blocked at most 10% of the time, at most 1,500 user-days of harm are expected, a gate run costs at most $8, and you ship within 10 days.",
    line: { speaker: "meera", line: "Find the weakest link first. Is it the noise, the graders, or what happens after?" },
    widget: { id: "ship-lab", config: SHIP },
    conditions: [
      { metric: "shipBadProb", op: "<=", value: 0.02, label: "At most a 2% chance the bad prompt ships" },
      { metric: "falseBlockProb", op: "<=", value: 0.1, label: "A good prompt is blocked at most 10% of the time" },
      { metric: "harmedUsers", op: "<=", value: 1500, label: "At most 1,500 user-days of harm" },
      { metric: "costPerRun", op: "<=", value: 8, label: "At most $8 per gate run" },
      { metric: "days", op: "<=", value: 10, label: "Ship within 10 days" },
    ],
    stars: [{ metric: "harmedUsers", op: "<=", value: 500, label: "At most 500 user-days of harm" }],
    hints: [
      "Which regression can a code check see, and which needs a judge?",
      "What does an unchecked judge miss?",
      "What catches what the gate lets through?",
    ],
  },
  debrief: [
    { id: "graders", text: "Code checks saw the one point of formatting damage and the judge saw most of the three points of quality, but only once it had been checked against people. An unchecked judge saw 40% as much and let the regression through too often.", sourceIds: ["mt-bench", "anthropic-evals"] },
    { id: "noise", text: "Pairing the two prompts on the same cases cut the noise by about a third, which let a suite of fifteen hundred cases do the work of three thousand, at half the cost.", derived: true },
    { id: "net", text: "The gate alone still let the bad prompt through about one time in eight. A short live canary with a guardrail caught nearly all of the rest and limited the harm to a few hundred user-days.", sourceIds: ["kohavi-experiments"] },
    { id: "threshold", text: "The threshold sat between the effect and the noise: low enough to block a four-point drop, high enough that a harmless change passed nine times out of ten.", derived: true },
  ],
  outro: { speaker: "kabir", line: "v8 was blocked on Wednesday, with a graph that showed exactly where it was worse. I would like that graph on every future launch." },
  explainBack: {
    prompt: "Walk Kabir through the gate: what it measures, how it avoids false alarms, and what happens to what slips through.",
    rubric: [
      { id: "graders", criterion: "Code checks cover mechanical failures; an LLM judge covers quality and must be checked against human labels", keyIdea: "code plus a calibrated judge" },
      { id: "noise", criterion: "Size the suite and pair both prompts on the same cases so the noise is smaller than the regression, with the threshold between effect and noise", keyIdea: "noise below the effect" },
      { id: "net", criterion: "A live canary with a guardrail catches the rest and limits harm to a few hundred user-days", keyIdea: "canary as a safety net" },
    ],
    exemplar:
      "I used code checks for the formatting failures and an LLM judge for quality, and checked the judge against hand-graded cases, since an unchecked judge saw less than half the regression. I ran both prompts on the same fifteen hundred cases so the noise fell below the four-point effect, and put the threshold at two points, between the effect and the noise. Whatever the gate missed went to a short canary with a guardrail, which kept the expected harm to a few hundred user-days.",
  },
  honestPhysics: [
    "A new prompt is really 4 points worse: 1 point from formatting a code check can see, 3 from quality a judge can see. The gate blocks if the measured drop exceeds the threshold. Noise comes from the suite size (√(2 × 0.85 × 0.15 ÷ N), 0.71 of that if both prompts run on the same cases) and from the judge (1 extra point). A checked judge sees 85% of the quality drop; an unchecked one 40%.",
    "A live canary catches 95% of what the gate lets through, exposing 2,880 users, or 288 with a guardrail. A bad prompt that ships undetected costs 42,000 user-days. A code check is $0.0005 a case, a judge $0.003 a case. A canary takes 7 days.",
    "Normal approximation throughout.",
  ],
  sources: [ANTHROPIC_EVALS, MTBENCH, KOHAVI],
  verify: [
    { id: "default", claim: "With no gate, v8 ships and costs over 30,000 user-days", run: "lab", params: { model: "ship-lab", config: SHIP, values: {}, metric: "harmedUsers" }, expect: { min: 30000 } },
    { id: "good-ship", claim: "The full gate lets the bad prompt ship under 2% of the time", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: true, calibrated: true, paired: true, t: 2, canary: true, guard: true }, metric: "shipBadProb" }, expect: { max: 0.02 } },
    { id: "good-harm", claim: "…with about 300 user-days of harm", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: true, calibrated: true, paired: true, t: 2, canary: true, guard: true }, metric: "harmedUsers" }, expect: { max: 500 } },
    { id: "good-block", claim: "…blocking a good prompt 7% of the time", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: true, calibrated: true, paired: true, t: 2, canary: true, guard: true }, metric: "falseBlockProb" }, expect: { max: 0.1 } },
    { id: "unchecked", claim: "An unchecked judge lets it ship over 2% of the time", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: true, calibrated: false, paired: true, t: 2, canary: true, guard: true }, metric: "shipBadProb" }, expect: { min: 0.02 } },
    { id: "no-canary", claim: "Without a canary the bad prompt ships over 10% of the time", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: true, calibrated: true, paired: true, t: 2, canary: false }, metric: "shipBadProb" }, expect: { min: 0.1 } },
    { id: "code-only", claim: "Code checks alone see only the formatting point", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 1500, code: true, judge: false, paired: true, t: 2, canary: true, guard: true }, metric: "shipBadProb" }, expect: { min: 0.03 } },
    { id: "big", claim: "A 3,000-case suite costs over $8", run: "lab", params: { model: "ship-lab", config: SHIP, values: { n: 3000, code: true, judge: true }, metric: "costPerRun" }, expect: { min: 8 } },
  ],
});
