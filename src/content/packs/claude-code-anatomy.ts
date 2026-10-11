import { definePack } from "../define";

export const CC = { start: { claudeMd: 1500, mcp: 2, offload: true, compact: false } };
export const CC_CHALLENGE = {};

const CC_OVERVIEW = { id: "claude-code-overview", title: "Claude Code docs: Overview", url: "https://docs.anthropic.com/en/docs/claude-code/overview" };
const CC_MEMORY = { id: "claude-code-memory", title: "Claude Code docs: Manage Claude's memory (CLAUDE.md)", url: "https://docs.anthropic.com/en/docs/claude-code/memory" };
const CC_SUBAGENTS = { id: "claude-code-subagents", title: "Claude Code docs: Subagents (separate context windows)", url: "https://docs.anthropic.com/en/docs/claude-code/sub-agents" };
const CC_BEST = { id: "claude-code-best", title: "Anthropic: Claude Code best practices for agentic coding", url: "https://www.anthropic.com/engineering/claude-code-best-practices" };

export default definePack({
  id: "claude-code-anatomy",
  title: "How Claude Code Works",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "session · context 94% full after 38 turns", detail: "twelve files read, forty commands run" },
    lines: [
      { speaker: "kabir", line: "Half an hour into a refactor the assistant forgot what we agreed at the start, then the session compacted itself in the middle of a change." },
      { speaker: "meera", line: "A coding agent is the agent loop with a code editor attached. Everything it reads and runs goes into a fixed window." },
    ],
  },
  predictions: [
    {
      id: "start",
      kind: "choice",
      prompt: "You connect 12 MCP servers and keep a 15,000-token CLAUDE.md. The built-in prompt and tools take about 12,000 tokens, each MCP server about 2,000. How much of the 200,000-token window is used before you type anything?",
      options: [
        { id: "6", label: "About 6%" },
        { id: "13", label: "About 13%" },
        { id: "25", label: "About 25%" },
        { id: "50", label: "About 50%" },
      ],
      answer: "25",
      observe: "heavy-start",
      reveal: {
        text: "12,000 + 12 × 2,000 + 15,000 is 51,000 tokens: 25% of the window gone before the first message, and re-read on every turn. A lean setup of two servers and a 1,500-token memory file starts at 17,500, under 9%. Everything permanent competes with the work.",
        derived: true,
        line: { speaker: "meera", line: "Whatever you load up front is rent paid on every turn." },
      },
    },
    {
      id: "overflow",
      kind: "choice",
      prompt: "A 60-turn session reads 12 files and runs 40 commands, with no subagents and no compaction, from a start of 26,000 tokens. What happens to the 200,000-token window?",
      options: [
        { id: "fine", label: "It stays comfortably under half full" },
        { id: "tight", label: "It reaches about 80%" },
        { id: "over", label: "It would reach about 116%: the session cannot continue as it is" },
      ],
      answer: "over",
      observe: "overflow",
      reveal: {
        text: "Conversation adds 90,000 tokens, file reads 36,000 and command output 80,000, on top of 26,000 to start: 232,000 tokens. Sending exploration to subagents keeps three quarters of the command output out of the main window; auto-compaction summarises the conversation when the window passes 80%.",
        derived: true,
        line: { speaker: "rao", line: "Output from commands is the quiet bulk of the window." },
      },
    },
  ],
  widget: { id: "ccsession-lab", config: CC },
  mechanism: [
    {
      id: "loop",
      text: "Claude Code is the agent loop running in your terminal or editor. The model reads your request, then uses tools to read files, search, edit and run commands, looking at each result before choosing the next step, until it can report back. The tools and the loop make it a coding agent.",
      sourceIds: ["claude-code-overview"],
    },
    {
      id: "context",
      scene: "fixed",
      text: "Everything the agent knows is in one context window: the system prompt and built-in tools, connected MCP servers, your CLAUDE.md file, the conversation, files read and command output. All of it is read again every turn, so the permanent parts tax the whole session.",
      sourceIds: ["claude-code-memory", "claude-code-best"],
    },
    {
      id: "subagent",
      scene: "subagent",
      text: "A subagent works in its own context window. Hand it a search or a survey of a large area, and the bulky files and output stay in its window; only a short report returns to yours. This keeps the main conversation focused and makes long sessions possible. Each subagent can have its own instructions and a limited tool set.",
      sourceIds: ["claude-code-subagents"],
    },
    {
      id: "compact",
      scene: "compact",
      text: "When the window fills, the session can be compacted: older turns are summarised, and detail is lost. Compacting at a task boundary, or starting a fresh session with a short written handoff, is better than letting it happen mid-change. Put lasting rules and commands in CLAUDE.md, kept short, so each session starts informed without starting full.",
      sourceIds: ["claude-code-best", "claude-code-memory"],
    },
  ],
  challenges: [
    {
      id: "session-plan",
      title: "Plan a long session",
      brief: "A 60-turn session reading 12 files and running 40 commands. Choose the memory file, connected servers and habits so the peak is at most 85% of the window with no compaction, the permanent overhead is at most 30,000 tokens, and the session costs at most $1.90.",
      line: { speaker: "rao", line: "I would like the session to finish before the window does." },
      widget: { id: "ccsession-lab", config: CC_CHALLENGE },
      conditions: [
        { metric: "peakPct", op: "<=", value: 0.85, label: "Peak at most 85% of the window" },
        { metric: "compactions", op: "<=", value: 0, label: "No compaction mid-task" },
        { metric: "fixedTokens", op: "<=", value: 30000, label: "Permanent overhead at most 30,000 tokens" },
        { metric: "costSession", op: "<=", value: 1.9, label: "Session costs at most $1.90" },
      ],
      stars: [{ metric: "costSession", op: "<=", value: 1.75, label: "Session costs at most $1.75" }],
      hints: [
        "What fills the window fastest in this session?",
        "Where can that bulk be kept out of the main context?",
        "How much permanent overhead can you drop?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what fills a coding agent's context and how to keep a long session healthy.",
    rubric: [
      { id: "fill", criterion: "The window holds the system prompt, tool and MCP definitions, CLAUDE.md, conversation, file reads and command output, all re-read each turn", keyIdea: "everything shares one window" },
      { id: "subagent", criterion: "Subagents run in their own windows so bulky exploration returns only a summary", keyIdea: "subagents isolate bulk" },
      { id: "lean", criterion: "Keep permanent overhead small, compact or restart at task boundaries, and record lasting rules in a short CLAUDE.md", keyIdea: "lean setup and clean boundaries" },
    ],
    exemplar:
      "Everything the agent knows is in one window: the system prompt and tool definitions, connected MCP servers, CLAUDE.md, the conversation, the files it has read and the output of commands, and all of it is re-read each turn. I would send searches and surveys to subagents, which keep the bulky output in their own windows and return a summary, and keep the permanent overhead small with few servers and a short CLAUDE.md. And I would compact or restart at a task boundary, with a written handoff, rather than in the middle of a change.",
  },
  reviews: [
    {
      id: "ca-est",
      format: "estimate",
      scenario: "A session starts at 20,000 tokens. Forty commands each add 2,000 tokens of output to the main context. How many tokens of output is that, and what fraction of a 200,000 window?",
      unit: "% of window",
      answer: 40,
      acceptFactor: 1.05,
      breakdown: ["40 × 2,000 = 80,000 tokens", "÷ 200,000 = 40% of the window"],
      explain: "Command output is the biggest item in a typical session, and the easiest to keep out of the main window.",
    },
    {
      id: "ca-pick",
      format: "pick-fix",
      scenario: "A repo-wide search returns hundreds of matches and the main session's window fills with them. What is the best way to handle this?",
      options: [
        { id: "a", label: "Delegate the search to a subagent that returns a short summary of what matters" },
        { id: "b", label: "Paste the results into CLAUDE.md" },
        { id: "c", label: "Use a model with a larger window" },
        { id: "d", label: "Turn off the search tool" },
      ],
      answer: "a",
      explain: "The subagent reads the bulk in its own context and returns only what is needed, keeping the main window for the work.",
    },
    {
      id: "ca-order",
      format: "order",
      scenario: "Order these by tokens added to the main context in the lab session, most first.",
      items: [
        { id: "turns", label: "60 turns of conversation" },
        { id: "cmds", label: "40 command outputs" },
        { id: "files", label: "12 file reads" },
      ],
      answer: ["turns", "cmds", "files"],
      explain: "90,000, 80,000 and 36,000 tokens: conversation and command output dominate, file reads are modest.",
    },
    {
      id: "ca-graph",
      format: "predict-graph",
      scenario: "Over a 60-turn session with no subagents or compaction, how does the context used change with turn number?",
      xLabel: "turn →",
      yLabel: "context used",
      options: [
        { id: "linear", label: "Grows steadily from the starting overhead to over the window", points: [26, 55, 83, 112, 140, 168, 199, 232] },
        { id: "flat", label: "Stays level", points: [26, 26, 26, 26, 26, 26, 26, 26] },
        { id: "jump", label: "Jumps once, then levels", points: [26, 200, 200, 200, 200, 200, 200, 200] },
      ],
      answer: "linear",
      explain: "Each turn adds its conversation and the output of what was read or run, and nothing leaves.",
    },
    {
      id: "ca-flaw",
      format: "spot-flaw",
      scenario: "A developer pastes a 40-page design document into CLAUDE.md 'so the agent always knows it'. Every session now starts with a third of the window used. Tap the problem.",
      diagram: {
        nodes: [
          { id: "doc", label: "40-page design document", kind: "store", col: 0, row: 1 },
          { id: "md", label: "CLAUDE.md, loaded on every turn", kind: "cache", col: 1, row: 1 },
          { id: "window", label: "context window", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "doc", to: "md" },
          { from: "md", to: "window" },
        ],
      },
      answer: "doc->md",
      explain: "CLAUDE.md is loaded every turn, so it should hold short rules and commands. Keep long documents in files the agent can read when relevant.",
    },
    {
      id: "ca-explain",
      format: "explain",
      scenario: "In two sentences: why is compacting in the middle of a change risky?",
      rubric: [
        { id: "lossy", criterion: "Compaction summarises earlier turns, losing detail such as exact decisions, file contents and error messages" },
        { id: "mid", criterion: "In the middle of a change that lost detail is exactly what the work depends on, so errors creep in" },
      ],
      exemplar: "Compaction summarises earlier turns and loses detail such as exact decisions, file contents and error messages. In the middle of a change that detail is what the work depends on, so mistakes creep in.",
      explain: "Compact at the boundaries between tasks.",
    },
  ],
  codex: {
    oneLiner: "A coding agent is the agent loop with file and shell tools. One window holds everything: keep fixed overhead lean and use subagents for bulk.",
    keyNumbers: [
      { label: "Built-in prompt and tools (lab)", value: "about 12,000 tokens", sourceId: "claude-code-best" },
      { label: "Each connected MCP server (lab)", value: "about 2,000 tokens", sourceId: "claude-code-memory" },
    ],
    tradeoffs: [
      { choice: "Many MCP servers and a long CLAUDE.md", gain: "Rich built-in knowledge and reach", cost: "A permanent tax on every turn" },
      { choice: "Subagents", gain: "Bulk stays out of the main window", cost: "A summary can miss detail" },
      { choice: "Compaction", gain: "Session continues", cost: "Lossy" },
    ],
    seenIn: ["Claude Code, Cursor and other terminal and IDE coding agents.", "CLAUDE.md and AGENTS.md convention files."],
    interviewAngle: "Say: 'one context holds prompt, tools, memory, conversation and tool output; keep the fixed part lean, delegate bulk to subagents, and compact at boundaries'.",
    aws: [{ concept: "Coding agent in the IDE", service: "Amazon Q Developer / Kiro" }],
    replay: { id: "ccsession-lab", config: CC, scene: "subagent" },
  },
  interview: [
    "How does a coding agent like Claude Code work?",
    "What takes up the context window in a long coding session?",
    "When would you use a subagent?",
  ],
  deeper: [
    {
      title: "Permissions and safety",
      body: "A coding agent can run commands and edit files, so it asks permission for risky actions, and you can pre-approve safe ones, such as running the tests, and deny dangerous ones. Run it in a repository with a clean working tree, use version control as the undo button, and keep secrets out of the files it can read.",
      sourceIds: ["claude-code-overview"],
    },
  ],
  honestPhysics: [
    "A 200,000-token window. The system prompt and built-in tools take about 12,000 tokens, each MCP server about 2,000, and CLAUDE.md its own length, all re-read every turn.",
    "A 60-turn session adds about 1,500 tokens a turn of conversation, 12 file reads of about 3,000 tokens each and 40 commands of about 2,000 tokens of output each. Subagents keep three quarters of the command output out of the main window. Compaction at 80% leaves about 15,000 tokens of summary.",
    "Cost uses the teaching prices: $2 per million input tokens, cached reads at a tenth, $10 per million output, 600 output tokens a turn.",
  ],
  sources: [CC_OVERVIEW, CC_MEMORY, CC_SUBAGENTS, CC_BEST],
  verify: [
    { id: "start", claim: "12 servers and a 15,000-token memory file use about 51,000 tokens before you start", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 15000, mcp: 12 }, metric: "fixedTokens" }, expect: { min: 51000, max: 51000 } },
    { id: "overflow", claim: "The default session overflows the window", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 2000, mcp: 6, offload: false, compact: false }, metric: "peakPct" }, expect: { min: 1.1 } },
    { id: "offload", claim: "Subagents bring the peak to 86%", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 2000, mcp: 6, offload: true, compact: false }, metric: "peakPct" }, expect: { min: 0.85, max: 0.87 } },
    { id: "lean", claim: "A lean setup with subagents peaks at 82% and needs no compaction", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 1500, mcp: 2, offload: true, compact: false }, metric: "peakPct" }, expect: { max: 0.85 } },
    { id: "lean-cost", claim: "…for about $1.72", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 1500, mcp: 2, offload: true, compact: false }, metric: "costSession" }, expect: { max: 1.9 } },
    { id: "compact", claim: "Compaction rescues an overflowing session with one summary", run: "lab", params: { model: "ccsession-lab", config: CC_CHALLENGE, values: { claudeMd: 2000, mcp: 6, offload: false, compact: true }, metric: "compactions" }, expect: { min: 1 } },
  ],
});
