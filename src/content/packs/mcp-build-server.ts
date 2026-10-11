import { definePack } from "../define";

export const BUILD = { start: { gran: "task", out: "raw", errors: "trace", auth: "user", stderr: true } };
export const BUILD_CHALLENGE = {};

const MCP_QUICKSTART = { id: "mcp-quickstart", title: "Model Context Protocol docs: Quickstart, build an MCP server", url: "https://modelcontextprotocol.io/quickstart/server" };
const MCP_AUTH = { id: "mcp-auth", title: "Model Context Protocol specification: Authorization", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (tool design and the agent-computer interface)", url: "https://www.anthropic.com/engineering/building-effective-agents" };

export default definePack({
  id: "mcp-build-server",
  title: "Build an MCP Server",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "MCP server · forty tools wrapping the ticketing API 1:1", detail: "tasks take nine calls and 112,000 tokens" },
    lines: [
      { speaker: "kabir", line: "We wrapped our ticketing API's forty endpoints as forty tools. Tasks take nine calls, each returns a wall of JSON, and a third pick the wrong tool." },
      { speaker: "meera", line: "A server is a user interface for a model. Design it around what the model is trying to do, not around how your database happens to be laid out." },
    ],
  },
  predictions: [
    {
      id: "bloat",
      kind: "choice",
      prompt: "A server exposes 40 endpoint-shaped tools (150 tokens each). A task takes 9 calls, and each returns about 6,000 tokens of raw JSON. About how many tokens does one task use?",
      options: [
        { id: "10k", label: "About 10,000" },
        { id: "30k", label: "About 30,000" },
        { id: "110k", label: "About 110,000" },
      ],
      answer: "110k",
      observe: "bloated",
      reveal: {
        text: "Each call carries 6,000 tokens of tool definitions, 6,000 of output and 500 of other context: 12,500 tokens, times 9 calls is about 112,000. Designing 6 tools around tasks and returning only needed fields brings it to 3 calls of 2,000 tokens, 6,000 in all.",
        derived: true,
        line: { speaker: "meera", line: "A tool that returns everything makes the model read everything, every time." },
      },
    },
    {
      id: "shared",
      kind: "choice",
      prompt: "The server calls the ticketing API with one shared service token. A user asks the assistant about tickets in a team they do not belong to. What happens?",
      options: [
        { id: "blocked", label: "It is blocked, because the user is not in the team" },
        { id: "allowed", label: "It works: the service token can see every team's tickets" },
        { id: "error", label: "An error: the tool does not accept team names" },
      ],
      answer: "allowed",
      observe: "leaky",
      reveal: {
        text: "The API sees only the service identity, so the user's own permissions are lost along the way. Anything the model asks, it answers with the service's reach. Passing the user's own OAuth token, with narrow scopes, makes the API enforce the same rules as in its own interface.",
        derived: true,
        sourceIds: ["mcp-auth"],
        line: { speaker: "rao", line: "A shared token turns every user into the most privileged one." },
      },
    },
  ],
  widget: { id: "mcpbuild-lab", config: BUILD },
  mechanism: [
    {
      id: "sdk",
      text: "An MCP server is a small program. An official SDK handles the protocol: you declare tools with names, descriptions and input schemas, resources and prompts, and write handlers that run when they are called. The quickstart is a few dozen lines. The work is not the plumbing; it is deciding what to expose and what to return.",
      sourceIds: ["mcp-quickstart"],
    },
    {
      id: "tools",
      scene: "tools",
      text: "Design tools around tasks, not endpoints. A tool such as find_overdue_tickets that does the joins and returns a short answer beats five endpoint-shaped tools the model must chain. Fewer, well-named tools are chosen more accurately, use fewer tokens, and need fewer calls. Say what each does and when not to use it.",
      sourceIds: ["building-effective-agents"],
    },
    {
      id: "output",
      scene: "output",
      text: "Return what the model needs. Trim responses to the relevant fields, paginate large lists, and prefer readable names over raw ids. When something fails, return a message that says what went wrong and what to try next, so the model can recover, instead of an exception trace. Validate inputs and reject nonsense early.",
      sourceIds: ["building-effective-agents", "mcp-quickstart"],
    },
    {
      id: "safety",
      scene: "safety",
      text: "A server is a capability you grant. Use the caller's own credentials with the narrowest scopes, not one shared token. Treat everything returned to the model as content that may contain instructions. Over stdio, write logs to standard error, since standard output carries the protocol. Test the server by letting a model use it and reading the transcripts.",
      sourceIds: ["mcp-auth", "mcp-quickstart"],
    },
  ],
  challenges: [
    {
      id: "good-server",
      title: "Design the server",
      brief: "A server wrapping a ticketing API with 40 endpoints. Choose its tool design, outputs, error messages, credentials and logging so tasks succeed at least 95% of the time, use at most 12,000 tokens, act with each user's own rights, and keep the protocol stream clean.",
      line: { speaker: "kabir", line: "Build it so the model succeeds, and so it cannot see what the user cannot." },
      widget: { id: "mcpbuild-lab", config: BUILD_CHALLENGE },
      conditions: [
        { metric: "successRate", op: ">=", value: 0.95, label: "Tasks succeed at least 95% of the time" },
        { metric: "tokensPerTask", op: "<=", value: 12000, label: "At most 12,000 tokens a task" },
        { metric: "scoped", op: ">=", value: 1, label: "Each call uses the user's own rights" },
        { metric: "protocolOk", op: ">=", value: 1, label: "Logs kept off standard output" },
      ],
      stars: [{ metric: "tokensPerTask", op: "<=", value: 7000, label: "At most 7,000 tokens a task" }],
      hints: [
        "How many tools can a model choose among reliably?",
        "What should a tool return?",
        "What does the model do when a call fails?",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe how you would design an MCP server around an existing API.",
    rubric: [
      { id: "tasks", criterion: "Expose a few task-shaped tools instead of one tool per endpoint, with clear descriptions", keyIdea: "task-shaped tools" },
      { id: "output", criterion: "Return trimmed, readable output and actionable error messages so the model can recover", keyIdea: "trim and explain errors" },
      { id: "safety", criterion: "Use the caller's own scoped credentials, treat returned content as untrusted, and log to stderr over stdio", keyIdea: "scoped auth and clean stream" },
    ],
    exemplar:
      "I would expose a handful of tools shaped around what the model is trying to do, not one tool per endpoint, with descriptions that say when to use and not use each. Each tool would return only the fields needed, paginate long lists, and on failure say what went wrong and what to try so the model can recover. I would call the API with the user's own scoped credentials, treat returned text as untrusted, and write logs to standard error so the protocol stream stays clean.",
  },
  reviews: [
    {
      id: "bs-est",
      format: "estimate",
      scenario: "A task takes 3 calls. Each call carries 900 tokens of definitions, 600 of output and 500 of other context. How many tokens is the task?",
      unit: "tokens",
      answer: 6000,
      acceptFactor: 1.01,
      breakdown: ["900 + 600 + 500 = 2,000", "× 3 = 6,000"],
      explain: "The same task done with 40 endpoint tools and raw output is about 19 times larger.",
    },
    {
      id: "bs-pick",
      format: "pick-fix",
      scenario: "A tool returns 'KeyError: customer_id' as a stack trace when the model sends an unknown id. The model tries the same call three more times. What is the best change?",
      options: [
        { id: "a", label: "Return 'Customer 77 not found. Use search_customers to find the right id.'" },
        { id: "b", label: "Raise the retry limit" },
        { id: "c", label: "Return an empty string" },
        { id: "d", label: "Remove the tool" },
      ],
      answer: "a",
      explain: "An actionable message tells the model what happened and what to do, so it recovers instead of repeating.",
    },
    {
      id: "bs-order",
      format: "order",
      scenario: "Order these server designs by tokens per task in the lab, highest first.",
      items: [
        { id: "ep-raw", label: "40 endpoint tools, raw output" },
        { id: "ep-trim", label: "40 endpoint tools, trimmed output" },
        { id: "task-raw", label: "6 task tools, raw output" },
        { id: "task-trim", label: "6 task tools, trimmed output" },
      ],
      answer: ["ep-raw", "ep-trim", "task-raw", "task-trim"],
      explain: "112,500, 63,900, 22,200 and 6,000: tool count and output size each matter.",
    },
    {
      id: "bs-graph",
      format: "predict-graph",
      scenario: "As you shrink what each tool returns from 6,000 tokens down to 300, with 6 task-shaped tools, how does the tokens per task change?",
      xLabel: "tokens returned per call (falls) →",
      yLabel: "tokens per task",
      options: [
        { id: "linear", label: "Falls in proportion to the output, to a floor set by definitions and context", points: [22200, 18900, 15600, 12300, 9000, 7200, 6300, 5700] },
        { id: "flat", label: "Barely changes", points: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000] },
        { id: "rise", label: "Rises", points: [5700, 6300, 7200, 9000, 12300, 15600, 18900, 22200] },
      ],
      answer: "linear",
      explain: "Output tokens scale with calls × size; definitions and context are fixed costs underneath.",
    },
    {
      id: "bs-flaw",
      format: "spot-flaw",
      scenario: "An MCP server run over stdio logs each request with print(). The host disconnects with a JSON parse error on the first call. Tap the cause.",
      diagram: {
        nodes: [
          { id: "host", label: "host reads standard output as protocol", kind: "client", col: 0, row: 1 },
          { id: "print", label: "server print() writes log lines to stdout", kind: "server", col: 1, row: 1 },
          { id: "err", label: "JSON parse error", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "print", to: "host" },
          { from: "host", to: "err" },
        ],
      },
      answer: "print->host",
      explain: "Standard output is the protocol channel. Logs must go to standard error.",
    },
    {
      id: "bs-explain",
      format: "explain",
      scenario: "In two sentences: why is it risky to give an MCP server a single powerful service token?",
      rubric: [
        { id: "reach", criterion: "Every user's request then runs with the service's full reach, so a user or an injected instruction can read or change what they should not" },
        { id: "audit", criterion: "Calls are attributed to the service, not the person, and the underlying system's own permission rules are bypassed" },
      ],
      exemplar: "Every request then runs with the service's full reach, so a user or an injected instruction can read or change things they should not be able to. Calls are also attributed to the service rather than the person, and the system's own permission rules are bypassed.",
      explain: "Pass the user's rights through; do not replace them.",
    },
  ],
  codex: {
    oneLiner: "Expose few task-shaped tools, return trimmed output and actionable errors, call the API with the user's scoped credentials, and keep logs off stdout.",
    keyNumbers: [
      { label: "40 endpoint tools with raw output (lab)", value: "about 112,000 tokens a task", sourceId: "building-effective-agents" },
      { label: "6 task tools with trimmed output (lab)", value: "about 6,000 tokens a task", sourceId: "building-effective-agents" },
    ],
    tradeoffs: [
      { choice: "Endpoint-per-tool", gain: "Trivial to generate", cost: "Confusion, calls and tokens" },
      { choice: "Task-shaped tools", gain: "Accurate and cheap", cost: "Design work and some API logic in the server" },
      { choice: "Per-user OAuth", gain: "Enforces real permissions", cost: "More auth plumbing than one token" },
    ],
    seenIn: ["Official servers for GitHub, Slack and databases.", "Internal servers that wrap company APIs for agents."],
    interviewAngle: "Say: 'task-shaped tools, trimmed output, helpful errors, per-user scoped OAuth, stderr logging, and test it by watching a model use it'.",
    aws: [{ concept: "Turn APIs into MCP tools", service: "Amazon Bedrock AgentCore Gateway" }],
    replay: { id: "mcpbuild-lab", config: BUILD, scene: "tools" },
  },
  interview: [
    "How would you build an MCP server for an internal API?",
    "What makes a tool easy for a model to use?",
    "How do you handle authentication in an MCP server?",
  ],
  deeper: [
    {
      title: "Evaluate with real tasks",
      body: "The best test of a tool set is a list of realistic tasks and a model attempting them. Read the transcripts: where did the model choose the wrong tool, misread an output, or loop? Fixing descriptions, renaming a parameter, or merging two tools often removes whole classes of failure. Repeat after every change, as with any interface.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "A server wrapping a ticketing API with 40 endpoints. One tool per endpoint gives 40 tools of 150 tokens and about 9 calls a task; task-shaped design gives 6 tools and 3 calls. The model picks the right tool 71% of the time among 40 and 99% among 6.",
    "Raw API responses average 6,000 tokens a call, trimmed ones 600. Actionable errors let the model recover 90% of the time, stack traces 40%; a task succeeds with probability selection × (1 − 12% × the share of failures it cannot recover from). Tokens a task are calls × (definitions + output + 500).",
    "A shared token reaches everyone's tickets; per-user OAuth limits each call to the caller. Over stdio, anything but protocol messages on standard output corrupts the stream.",
  ],
  sources: [MCP_QUICKSTART, MCP_AUTH, BEA],
  verify: [
    { id: "bad-tokens", claim: "An endpoint-per-tool server with raw output uses over 100,000 tokens a task", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "endpoint", out: "raw" }, metric: "tokensPerTask" }, expect: { min: 100000 } },
    { id: "bad-success", claim: "…and succeeds about 66% of the time", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "endpoint", out: "raw", errors: "trace" }, metric: "successRate" }, expect: { max: 0.7 } },
    { id: "good-tokens", claim: "Six task tools with trimmed output use 6,000 tokens", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "task", out: "trimmed" }, metric: "tokensPerTask" }, expect: { min: 6000, max: 6000 } },
    { id: "good-success", claim: "…and succeed 98% of the time", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "task", out: "trimmed", errors: "helpful" }, metric: "successRate" }, expect: { min: 0.95 } },
    { id: "trace", claim: "Stack-trace errors cost recovery: 92% not 98%", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "task", out: "trimmed", errors: "trace" }, metric: "successRate" }, expect: { max: 0.95 } },
    { id: "raw", claim: "Raw output breaks the token limit even with task tools", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { gran: "task", out: "raw" }, metric: "tokensPerTask" }, expect: { min: 12000 } },
    { id: "shared", claim: "A shared token is not scoped to the user", run: "lab", params: { model: "mcpbuild-lab", config: BUILD_CHALLENGE, values: { auth: "shared" }, metric: "scoped" }, expect: { max: 0 } },
  ],
});
