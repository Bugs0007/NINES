import { defineBoss } from "../define";

export const SAC = {};

const CALIBRATION = { id: "calibration", title: "Guo et al. (2017), On calibration of modern neural networks", url: "https://arxiv.org/abs/1706.04599" };
const REDUCE_HALLUC = { id: "anthropic-hallucinations", title: "Claude docs: Reduce hallucinations (ground answers in quotes, allow 'I don't know')", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (human checkpoints for consequential actions)", url: "https://www.anthropic.com/engineering/building-effective-agents" };

export default defineBoss({
  id: "case-support-agent",
  title: "Case: Support Agent with Human Escalation",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "support · the bot told 1,033 customers a day the wrong refund policy", detail: "10,000 tickets a day; every ticket answered by the bot" },
    lines: [{ speaker: "kabir", line: "The bot answers every ticket and a quarter are wrong, so a thousand customers a day get bad advice. Sending everything to humans would take a thousand hours." }],
  },
  intro: [
    { speaker: "meera", line: "The agent will be wrong sometimes. The design is a threshold: how confident must it be before it answers instead of handing over?" },
    { speaker: "rao", line: "Every point of that threshold moves work between customers who get a wrong answer and people who answer the queue." },
  ],
  forecast: {
    metric: "wrongShippedPer10k",
    prompt: "With no retrieval, no checks and an escalation threshold of 0.5, how many wrong answers reach customers per 10,000 tickets? (The bot is right 72% of the time.)",
    unit: "per 10,000",
    scale: 1,
    min: 10,
    max: 5000,
    tolerance: 1.5,
  },
  exercises: ["human-in-the-loop", "guardrails", "retrieval-eval"],
  challenge: {
    id: "design-support-agent",
    title: "Run a day of tickets",
    brief: "Send no more than 30 wrong answers per 10,000 tickets, use no more than 250 human hours a day, and resolve at least 75% of tickets automatically.",
    line: { speaker: "rao", line: "Fewer wrong answers, fewer people, and neither at the other's expense." },
    widget: { id: "supportagent-lab", config: SAC },
    conditions: [
      { metric: "wrongShippedPer10k", op: "<=", value: 30, label: "At most 30 wrong answers per 10,000" },
      { metric: "humanHoursDay", op: "<=", value: 250, label: "At most 250 human hours a day" },
      { metric: "autoResolveRate", op: ">=", value: 0.75, label: "At least 75% resolved automatically" },
    ],
    stars: [{ metric: "wrongShippedPer10k", op: "<=", value: 25, label: "At most 25 wrong answers per 10,000" }],
    hints: ["What raises the share the bot gets right?", "What does a policy check do to wrong answers that still get through?", "What does the threshold trade?"],
  },
  debrief: [
    { id: "ground", text: "Grounding answers in the help centre raised correct answers from 72% to 90%, which cut wrong answers by almost two thirds before any threshold. It also made the bot's confidence more informative, because it can quote what it relied on.", sourceIds: ["anthropic-hallucinations"] },
    { id: "thr", text: "A threshold sends low-confidence answers to a person. At 0.7 about one in five tickets went to humans, 207 hours a day, and wrong answers dropped from 1,033 to 48 per 10,000. The more separated confidence is for right and wrong answers, the better the trade; calibration measures it.", sourceIds: ["calibration"] },
    { id: "guard", text: "A policy check on the answer halved the wrong ones that still got through, for 1% of good answers wrongly held, and a sampled review of sent answers catches more. These are layers: none is enough alone.", sourceIds: ["building-effective-agents"] },
  ],
  outro: { speaker: "kabir", line: "Retrieval, a policy check, a threshold at seventy percent. Twenty-four wrong answers in ten thousand, and a team of twenty-six, not four hundred." },
  explainBack: {
    prompt: "Explain how your support agent decides when to answer and when to hand over.",
    rubric: [
      { id: "ground", criterion: "Ground answers in retrieved documents to raise the share that is right", keyIdea: "ground the answers" },
      { id: "thr", criterion: "An escalation threshold on confidence trades wrong answers sent against tickets handled by people", keyIdea: "threshold trade-off" },
      { id: "layers", criterion: "Add a policy check and sampled human review, because no single layer catches everything", keyIdea: "layers" },
      { id: "measure", criterion: "Measure with an evaluation set and calibration, tuning the threshold with data", keyIdea: "evaluate and calibrate" },
    ],
    exemplar:
      "I would ground answers in the help centre, which raised the share answered correctly from 72 to 90 percent, and have the agent report a confidence for each. Answers below a threshold of about 0.7 go to a person, which sends one ticket in five to humans, about 200 hours a day, and cuts wrong answers from over a thousand to around twenty-four per ten thousand once a policy check halves the rest. I would review a sample of sent answers and tune the threshold against an evaluation set, checking that confidence is calibrated.",
  },
  honestPhysics: [
    "10,000 tickets a day. Without retrieval the agent answers 72% correctly, with retrieval 90%. Its confidence is 0.82 (spread 0.10) on correct answers and 0.45 (spread 0.15) on wrong ones. Answers below the threshold go to a person at 6 minutes each.",
    "A policy check halves the wrong answers that ship and wrongly holds 1% of good ones. A reviewed sample catches 80% of the wrong answers in it, at 30% of a human handling per reviewed ticket. Round figures; real confidence is rarely this well behaved.",
  ],
  sources: [CALIBRATION, REDUCE_HALLUC, BEA],
  verify: [
    { id: "forecast", claim: "The default sends about 1,030 wrong answers per 10,000", run: "lab", params: { model: "supportagent-lab", config: SAC, values: {}, metric: "wrongShippedPer10k" }, expect: { min: 1000, max: 1070 } },
    { id: "retrieval", claim: "Retrieval cuts that by about two thirds", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true }, metric: "wrongShippedPer10k" }, expect: { min: 300, max: 400 } },
    { id: "thr", claim: "At threshold 0.7 with retrieval, about 48 wrong answers per 10,000 ship", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true, thr: 0.7 }, metric: "wrongShippedPer10k" }, expect: { min: 45, max: 50 } },
    { id: "good", claim: "Adding the policy check leaves 24", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true, guard: true, thr: 0.7, review: "0" }, metric: "wrongShippedPer10k" }, expect: { min: 22, max: 26 } },
    { id: "hours", claim: "…for about 207 human hours a day", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true, guard: true, thr: 0.7, review: "0" }, metric: "humanHoursDay" }, expect: { min: 200, max: 215 } },
    { id: "auto", claim: "…resolving 79% automatically", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true, guard: true, thr: 0.7, review: "0" }, metric: "autoResolveRate" }, expect: { min: 0.78, max: 0.8 } },
    { id: "strict", claim: "A threshold of 0.8 needs over 450 human hours a day", run: "lab", params: { model: "supportagent-lab", config: SAC, values: { retrieval: true, guard: true, thr: 0.8 }, metric: "humanHoursDay" }, expect: { min: 450 } },
  ],
});
