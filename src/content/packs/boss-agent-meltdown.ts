import { defineBoss } from "../define";

export const MELT = {};

const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (stopping conditions, sandboxed testing, guardrails)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const OWASP_LLM = { id: "owasp-llm", title: "OWASP Top 10 for LLM Applications: Excessive Agency (LLM06)", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" };
const MAST = { id: "mast", title: "M. Cemri et al. (2025), Why Do Multi-Agent LLM Systems Fail?", url: "https://arxiv.org/abs/2503.13657" };

export default defineBoss({
  id: "boss-agent-meltdown",
  title: "Boss: The Agent That Wouldn't Stop",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "support-agent · 31 refunds in 4 minutes on one ticket", detail: "tool calls per minute: 480 and climbing" },
    lines: [{ speaker: "pager", line: "The support agent has called the refund tool on the same order thirty-one times and is still going. Nothing has told it to stop." }],
  },
  intro: [
    { speaker: "kabir", line: "Stop the bleeding without breaking the thousand normal tickets an hour that are fine. Ordinary tasks use up to eighteen steps." },
    { speaker: "meera", line: "Think in layers: limits that bound the loop, a gate on the actions that cannot be undone, and an alarm that does not depend on the agent noticing." },
    { speaker: "rao", line: "A reviewer who approves everything protects nothing, and costs a salary. Gate only what matters." },
  ],
  forecast: {
    metric: "worstCost",
    prompt: "Before you touch anything: if one run goes wrong with no limits at all, how much can it cost?",
    unit: "USD",
    scale: 1,
    min: 1,
    max: 1000,
    tolerance: 1.5,
  },
  exercises: ["agent-loop", "agent-failure-modes", "human-in-the-loop", "planning"],
  challenge: {
    id: "contain-agent",
    title: "Contain the runaway agent",
    brief: "A runaway run issues up to 40 refunds. Choose step cap, loop detection, dollar cap, human approval, tool idempotency and alerting so the worst run costs at most $1, at most one refund goes out, someone is paged within 5 minutes, the reviewer works at most 2 hours a day, and at least 90% of ordinary tasks still finish.",
    line: { speaker: "meera", line: "Which of these stops the loop, which stops the damage, and which tells a person?" },
    widget: { id: "meltdown-lab", config: MELT },
    conditions: [
      { metric: "worstCost", op: "<=", value: 1, label: "A runaway costs at most $1" },
      { metric: "refundsIssued", op: "<=", value: 1, label: "At most one refund goes out" },
      { metric: "detectMin", op: "<=", value: 5, label: "Paged within 5 minutes" },
      { metric: "reviewerHours", op: "<=", value: 2, label: "Reviewer works at most 2 hours a day" },
      { metric: "successRate", op: ">=", value: 0.9, label: "At least 90% of ordinary tasks finish" },
    ],
    stars: [{ metric: "refundsIssued", op: "<=", value: 0.2, label: "At most 0.2 expected refunds" }],
    hints: [
      "What number of steps do ordinary tasks need, and what does a cap below it do?",
      "What stops the refunds even if the loop continues?",
      "What tells a person without the agent noticing?",
    ],
  },
  debrief: [
    { id: "bound", text: "A step cap above eighteen, loop detection and a dollar cap bounded the loop three ways. Each caught what another could miss, and none relied on the agent noticing it was stuck.", sourceIds: ["building-effective-agents"] },
    { id: "gate", text: "Approval on refunds and deletes alone put about fifty decisions a day in front of a reviewer, for twenty-five minutes of work. Approving every action would have taken over eight hours and let nearly everything through.", sourceIds: ["owasp-llm"] },
    { id: "idem", text: "An idempotent refund tool made a repeated call a no-op, so even a loop that ran would have issued one refund. Reversible design beats review.", derived: true },
    { id: "alarm", text: "A page on cost per minute found the runaway in three minutes; without it the bill would have found it in ninety. The alarm is separate from the agent, so it works when the agent does not.", sourceIds: ["mast"] },
  ],
  outro: { speaker: "kabir", line: "One refund went out, caught by the reviewer in the queue. Finance noticed nothing. Please make the next agent boring in the same way." },
  explainBack: {
    prompt: "Walk Kabir through how you contained the agent: which control stopped what.",
    rubric: [
      { id: "bound", criterion: "Step cap above normal task length, loop detection and a dollar cap bound the loop without the agent's cooperation", keyIdea: "layered limits" },
      { id: "gate", criterion: "A human gate on irreversible actions only, so the reviewer reads the few that matter", keyIdea: "gate by consequence" },
      { id: "alarm", criterion: "An external alert on cost rate and idempotent tools limit damage and detection time", keyIdea: "independent alarm and idempotency" },
    ],
    exemplar:
      "I bounded the loop three ways: a step cap of twenty, above the eighteen ordinary tasks need, loop detection on repeated calls, and a dollar cap, so a runaway costs under a dollar whether or not the agent notices. Refunds and deletes need a person's approval, about fifty decisions a day, while reads and reversible actions flow, so the reviewer works well under two hours. I made the refund tool idempotent so a repeated call does nothing, and added a page on cost per minute so a person knows in three minutes without relying on the agent.",
  },
  honestPhysics: [
    "A support agent can search, email, refund and delete. In a bad run it loops, calling the refund tool every step. With no limits it issues 40 refunds and spends $400 before anyone stops it; each step costs about $0.045 as the context grows. A step cap stops a stuck run after that many steps, loop detection after 3, and a dollar cap at its limit.",
    "An approval gate on refunds and deletes stops 97% of bad ones at about 50 decisions a day; approving everything means 1,000 a day and the catch rate falls. A page on cost rate finds a runaway in 3 minutes; without it the bill finds you in 90.",
    "Ordinary tasks need up to 18 steps: a cap below 18 blocks real work, below 10 blocks most. Idempotent tools make a repeated call a no-op.",
  ],
  sources: [BEA, OWASP_LLM, MAST],
  verify: [
    { id: "default", claim: "With no limits a runaway costs $400", run: "lab", params: { model: "meltdown-lab", config: MELT, values: {}, metric: "worstCost" }, expect: { min: 400, max: 400 } },
    { id: "default-refunds", claim: "…and issues 40 refunds", run: "lab", params: { model: "meltdown-lab", config: MELT, values: {}, metric: "refundsIssued" }, expect: { min: 40, max: 40 } },
    { id: "good-cost", claim: "A 20-step cap, loop detection and a $2 budget hold it under a dollar", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { cap: 20, loop: true, budget: 2, gate: "irreversible", alert: true }, metric: "worstCost" }, expect: { max: 1 } },
    { id: "good-refunds", claim: "…with an approval gate at most one refund goes out", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { cap: 20, loop: true, budget: 2, gate: "irreversible", alert: true }, metric: "refundsIssued" }, expect: { max: 1 } },
    { id: "good-hours", claim: "…for 25 minutes of review", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { cap: 20, loop: true, budget: 2, gate: "irreversible", alert: true }, metric: "reviewerHours" }, expect: { max: 2 } },
    { id: "all-gate", claim: "Approving everything needs over 8 hours of review", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { gate: "all" }, metric: "reviewerHours" }, expect: { min: 8 } },
    { id: "low-cap", claim: "A cap of 8 steps breaks ordinary tasks", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { cap: 8, loop: true, gate: "irreversible", alert: true }, metric: "successRate" }, expect: { max: 0.5 } },
    { id: "idem", claim: "An idempotent refund tool limits a runaway to one refund", run: "lab", params: { model: "meltdown-lab", config: MELT, values: { cap: 20, idem: true }, metric: "refundsIssued" }, expect: { max: 1 } },
  ],
});
