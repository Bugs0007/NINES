import { defineBoss } from "../define";

export const CAC = {};

const CC_SECURITY = { id: "claude-code-security", title: "Claude Code docs: Security (permissions, sandboxing and prompt-injection safeguards)", url: "https://docs.anthropic.com/en/docs/claude-code/security" };
const CC_BEST = { id: "claude-code-best", title: "Anthropic: Claude Code best practices for agentic coding", url: "https://www.anthropic.com/engineering/claude-code-best-practices" };
const FIRECRACKER = { id: "firecracker", title: "Firecracker: secure and fast microVMs for serverless computing", url: "https://firecracker-microvm.github.io/" };
const OWASP_AGENCY = { id: "owasp-agency", title: "OWASP GenAI: LLM06 Excessive Agency", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" };

export default defineBoss({
  id: "case-coding-agent",
  title: "Case: AI Coding Agent",
  kind: "boss",
  estimatedMinutes: 24,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "incident review · agent ran 'rm -rf' in the wrong directory", detail: "it had the developer's full permissions on their own laptop" },
    lines: [{ speaker: "kabir", line: "We shipped a coding agent. It finished a third of its tasks, nobody read the dozen approval prompts per task, and last week it deleted a developer's working directory." }],
  },
  intro: [
    { speaker: "meera", line: "A coding agent is the agent loop with tools that can break things. How much can it finish, how much can it break, and how often does it interrupt?" },
    { speaker: "rao", line: "A prompt people click through without reading is not a control. It is a delay." },
  ],
  forecast: {
    metric: "blastRadius",
    prompt: "An agent runs directly on a developer's machine with permission to run any command. The value reachable from there is about $100,000. What is its worst case if it makes a mistake or is hijacked?",
    unit: "$",
    scale: 1,
    min: 100,
    max: 1000000,
    tolerance: 2,
  },
  exercises: ["claude-code-anatomy", "agent-failure-modes", "least-privilege-tools"],
  challenge: {
    id: "design-coding-agent",
    title: "Run the agent",
    brief: "Finish at least 75% of tasks for $2 or less each, limit the worst case to $300, and interrupt the developer no more than 3 times per task.",
    line: { speaker: "rao", line: "Capable, contained and quiet." },
    widget: { id: "codeagent-lab", config: CAC },
    conditions: [
      { metric: "successRate", op: ">=", value: 0.75, label: "At least 75% of tasks finished correctly" },
      { metric: "costPerTask", op: "<=", value: 2, label: "At most $2 a task" },
      { metric: "blastRadius", op: "<=", value: 300, label: "Worst case at most $300" },
      { metric: "interruptsPerTask", op: "<=", value: 3, label: "At most 3 approval prompts a task" },
    ],
    stars: [{ metric: "successRate", op: ">=", value: 0.8, label: "At least 80% of tasks finished" }],
    hints: ["What turns a plausible edit into a correct one?", "What bounds the damage without asking a person each time?", "How many steps does a verified edit need?"],
  },
  debrief: [
    { id: "verify", text: "Letting the agent run the tests and fix failures took success from 35% to 65%, because it gets ground truth after each change instead of a guess. A step limit below what the loop needs cuts that gain, so the limit has to match the verified loop.", sourceIds: ["claude-code-best"] },
    { id: "box", text: "A microVM with a scratch copy of the repository bounded the worst case to $500, against $100,000 on the developer's machine. The environment holds the line even when the model is wrong, which is why it works against a hijacked agent as well as an inept one.", sourceIds: ["firecracker", "claude-code-security", "owasp-agency"] },
    { id: "perms", text: "An allowlist of safe commands halved the worst case again, to $250, with 1.5 prompts a task. Approving every action cut the risk and added 12 prompts a task, which people stop reading, and 60% to the elapsed time.", derived: true },
  ],
  outro: { speaker: "kabir", line: "A microVM, an allowlist, subagents for exploration and a test loop. It finishes three tasks in four for a dollar nineteen and cannot reach anything that matters." },
  explainBack: {
    prompt: "Explain how your coding agent is made capable and safe at once.",
    rubric: [
      { id: "verify", criterion: "Run tests as ground truth so the agent can check and fix its own work; give it enough steps for the loop", keyIdea: "verification loop" },
      { id: "sandbox", criterion: "Run in an isolated environment on a scratch copy so mistakes and hijacks have a bounded blast radius", keyIdea: "contain the environment" },
      { id: "perms", criterion: "Allowlist safe commands rather than prompting for everything, because prompt fatigue makes approvals meaningless", keyIdea: "allowlist, not prompt-everything" },
      { id: "context", criterion: "Keep context lean with retrieval or subagents to reduce cost per task", keyIdea: "lean context" },
    ],
    exemplar:
      "The agent runs the tests after each change and fixes failures itself, which takes success from 35 percent to about 77 percent, with a step limit large enough for that loop. It runs in a microVM on a scratch copy of the repository, so even a hijacked agent can reach about five hundred dollars of value, not a hundred thousand, and a command allowlist halves that while interrupting the developer only once or twice a task. Subagents explore the codebase so the main context stays lean and a task costs about a dollar twenty.",
  },
  honestPhysics: [
    "A bare agent finishes 35% of tasks correctly; running tests and fixing failures adds 30 points, retrieval 8, subagents 12; it needs about 10 steps for a plain edit and 18 with tests, and less than that cuts success toward half. A step costs $0.06, 1.8× with the whole repository in context, 0.9× with subagents.",
    "Worst case if wrong or hijacked: $100,000 with no sandbox, $4,000 in a container, $500 in a microVM; × 0.5 with an allowlist, × 0.25 approving every action. Approval prompts per task: 0, 1.5 or 12. Round figures.",
  ],
  sources: [CC_SECURITY, CC_BEST, FIRECRACKER, OWASP_AGENCY],
  verify: [
    { id: "forecast", claim: "No sandbox and full permissions put $100,000 at risk", run: "lab", params: { model: "codeagent-lab", config: CAC, values: {}, metric: "blastRadius" }, expect: { min: 100000, max: 100000 } },
    { id: "base", claim: "A bare agent finishes 35% of tasks", run: "lab", params: { model: "codeagent-lab", config: CAC, values: {}, metric: "successRate" }, expect: { min: 0.35, max: 0.35 } },
    { id: "verify", claim: "With a test loop and enough steps it reaches 65%", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { verify: true, steps: 18 }, metric: "successRate" }, expect: { min: 0.64, max: 0.66 } },
    { id: "short", claim: "Too few steps cut the gain: 9 steps with tests give 49%", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { verify: true, steps: 9 }, metric: "successRate" }, expect: { min: 0.48, max: 0.5 } },
    { id: "good", claim: "A microVM, allowlist, subagents and a test loop reach 77% with a $250 worst case", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { sandbox: "microvm", perms: "allow", context: "subagents", verify: true, steps: 22 }, metric: "successRate" }, expect: { min: 0.76, max: 0.78 } },
    { id: "good-blast", claim: "…a $250 worst case", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { sandbox: "microvm", perms: "allow", context: "subagents", verify: true, steps: 22 }, metric: "blastRadius" }, expect: { min: 250, max: 250 } },
    { id: "ask", claim: "Approving every action means 12 prompts a task", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { perms: "ask" }, metric: "interruptsPerTask" }, expect: { min: 12, max: 12 } },
    { id: "cost", claim: "The good design costs $1.19 a task", run: "lab", params: { model: "codeagent-lab", config: CAC, values: { sandbox: "microvm", perms: "allow", context: "subagents", verify: true, steps: 22 }, metric: "costPerTask" }, expect: { min: 1.15, max: 1.22 } },
  ],
});
