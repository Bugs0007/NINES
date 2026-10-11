import { definePack } from "../define";

export const ARCH = { lockSize: true, hosts: 5, sources: 12, start: { mode: "mcp", enabled: 3 } };
export const ARCH_CHALLENGE = { lockSize: true, hosts: 5, sources: 12 };

const MCP_ARCH = { id: "mcp-architecture", title: "Model Context Protocol docs: Architecture (hosts, clients, servers)", url: "https://modelcontextprotocol.io/docs/concepts/architecture" };
const MCP_INTRO = { id: "mcp-intro", title: "Model Context Protocol: Introduction", url: "https://modelcontextprotocol.io/introduction" };
const MCP_SPEC = { id: "mcp-spec", title: "Model Context Protocol specification (2025-06-18)", url: "https://modelcontextprotocol.io/specification/2025-06-18" };
const JSONRPC = { id: "jsonrpc", title: "JSON-RPC 2.0 Specification", url: "https://www.jsonrpc.org/specification" };

export default definePack({
  id: "mcp-architecture",
  title: "MCP: Host, Client, Server",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "platform · 5 AI apps x 12 internal systems = 60 integrations", detail: "each one written, secured and maintained separately" },
    lines: [
      { speaker: "kabir", line: "Five teams are building AI apps, and each wants the ticket tracker, the wiki, the database and nine other systems. That is sixty integrations, written five different ways." },
      { speaker: "meera", line: "A shared protocol turns a grid into a row and a column. Each app learns the protocol once, and each system speaks it once." },
    ],
  },
  predictions: [
    {
      id: "grid",
      kind: "choice",
      prompt: "Five AI applications each need to reach twelve systems. With a custom integration for every pair, how many integrations is that? And with a shared protocol where each side implements it once?",
      options: [
        { id: "a", label: "60 custom, 17 with a protocol" },
        { id: "b", label: "17 custom, 60 with a protocol" },
        { id: "c", label: "60 either way" },
      ],
      answer: "a",
      observe: "n-times-m",
      reveal: {
        text: "Custom pairs multiply: 5 × 12 = 60. A protocol adds: one client in each of the 5 applications and one server for each of the 12 systems, 17. Add a sixth application and the custom total rises by 12, the protocol total by 1. The saving grows with both numbers.",
        derived: true,
        line: { speaker: "meera", line: "Standards turn multiplication into addition." },
      },
    },
    {
      id: "flood",
      kind: "choice",
      prompt: "Each MCP server offers about 10 tools of 200 tokens. A host connects to all 12 servers at once. How many tokens of tool definitions does the model have to read before it even starts?",
      options: [
        { id: "2k", label: "About 2,400" },
        { id: "24k", label: "About 24,000" },
        { id: "240k", label: "About 240,000" },
      ],
      answer: "24k",
      observe: "tool-flood",
      reveal: {
        text: "12 servers × 10 tools × 200 tokens is 24,000 tokens on every request, a large share of a prompt, plus the confusion from 120 candidate tools. A protocol makes connecting easy, and that is the danger: connect only the servers a task needs, and let the host or the user switch them on and off.",
        derived: true,
        line: { speaker: "rao", line: "Easy to connect does not mean free to keep connected." },
      },
    },
  ],
  widget: { id: "mcparch-lab", config: ARCH },
  mechanism: [
    {
      id: "problem",
      scene: "nm",
      text: "Before a shared protocol, every AI application wrote its own connector to every system it needed: custom code for each pair, with its own authentication and its own idea of what a tool is. The number of integrations is hosts times systems, and each is a separate thing to secure and maintain.",
      sourceIds: ["mcp-intro"],
    },
    {
      id: "roles",
      scene: "protocol",
      text: "MCP defines three roles. The host is the AI application the user works in, such as an IDE or chat app. Inside it, an MCP client keeps one connection to each server. A server is a small program exposing tools, data and prompts from one system. Hosts and servers need only the protocol in common.",
      sourceIds: ["mcp-architecture", "mcp-intro"],
    },
    {
      id: "wire",
      text: "Messages are JSON-RPC 2.0: requests with an id, responses, and one-way notifications. When a connection opens, client and server exchange their protocol version and capabilities, so each knows what the other supports, then the client lists the server's tools, resources and prompts. After that the host's model can choose to use them.",
      sourceIds: ["mcp-spec", "jsonrpc"],
    },
    {
      id: "enable",
      scene: "enable",
      text: "The model sees the definitions of everything it can use, so more connected servers means more tokens and more confusable tools. Good hosts let users and policies decide which servers are active for a task. The protocol's value is reach; judgement about what to switch on is still yours.",
      sourceIds: ["mcp-architecture"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "platform",
      title: "Wire up the platform",
      brief: "Five AI applications and twelve systems. Choose how they connect and how many servers to switch on for a task so there are at most 20 integrations in all, and the tool definitions in the model's context stay at or under 8,000 tokens.",
      line: { speaker: "rao", line: "Sixty integrations is a team. Seventeen is a side project." },
      widget: { id: "mcparch-lab", config: ARCH_CHALLENGE },
      conditions: [
        { metric: "integrations", op: "<=", value: 20, label: "At most 20 integrations" },
        { metric: "toolTokens", op: "<=", value: 8000, label: "Tool definitions at most 8,000 tokens" },
      ],
      stars: [{ metric: "toolTokens", op: "<=", value: 6000, label: "Tool definitions at most 6,000 tokens" }],
      hints: [
        "How does the count of integrations grow with each approach?",
        "What does each connected server add to the model's context?",
        "How many servers does a typical task actually need?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain MCP's roles and why a standard protocol helps.",
    rubric: [
      { id: "roles", criterion: "The host is the AI app, it runs a client per server, and each server exposes one system's tools, resources and prompts", keyIdea: "host, client, server" },
      { id: "nm", criterion: "A shared protocol replaces hosts × systems custom integrations with hosts + systems", keyIdea: "N times M becomes N plus M" },
      { id: "context", criterion: "Every connected server's definitions enter the model's context, so enable only what a task needs", keyIdea: "enable selectively" },
    ],
    exemplar:
      "The host is the AI application, it keeps an MCP client connection to each server, and each server exposes one system's tools, resources and prompts over JSON-RPC. A shared protocol turns hosts times systems custom integrations into hosts plus systems, so five apps and twelve systems need seventeen pieces, not sixty. Every connected server's definitions go into the model's context, so I would switch on only the servers a task needs.",
  },
  reviews: [
    {
      id: "ma-est",
      format: "estimate",
      scenario: "Eight AI applications need to reach twenty systems. How many integrations without a shared protocol, and with one?",
      unit: "integrations (without)",
      answer: 160,
      acceptFactor: 1.01,
      breakdown: ["8 × 20 = 160 custom", "8 + 20 = 28 with a protocol"],
      explain: "The grid grows with the product; the protocol with the sum.",
    },
    {
      id: "ma-pick",
      format: "pick-fix",
      scenario: "A coding assistant connects to 30 MCP servers by default. Its answers are slower, pricier and sometimes call the wrong tool. What is the best change?",
      options: [
        { id: "a", label: "Enable only the servers a task or project needs, and group the rest behind explicit choice" },
        { id: "b", label: "Remove the protocol" },
        { id: "c", label: "Write longer tool descriptions" },
        { id: "d", label: "Use a bigger model" },
      ],
      answer: "a",
      explain: "Thirty servers is thousands of tokens of definitions on every request and hundreds of tools to confuse. Narrowing what is connected addresses both.",
    },
    {
      id: "ma-order",
      format: "order",
      scenario: "Order these by their place in an MCP setup, from the user's side to the system's side.",
      items: [
        { id: "host", label: "Host (the AI application)" },
        { id: "client", label: "MCP client (one per server)" },
        { id: "server", label: "MCP server" },
        { id: "system", label: "The underlying system or API" },
      ],
      answer: ["host", "client", "server", "system"],
      explain: "The user works in the host; its client talks the protocol to a server; the server calls the real system.",
    },
    {
      id: "ma-graph",
      format: "predict-graph",
      scenario: "With 5 applications, as the number of systems grows from 1 to 30, how does the number of integrations grow with custom code, and with a protocol?",
      xLabel: "systems →",
      yLabel: "integrations",
      options: [
        { id: "diverge", label: "Custom grows 5 per system; the protocol 1 per system", points: [5, 10, 20, 35, 50, 75, 100, 150] },
        { id: "same", label: "Both grow at the same rate", points: [5, 10, 20, 35, 50, 75, 100, 150] },
        { id: "flat", label: "Neither grows", points: [5, 5, 5, 5, 5, 5, 5, 5] },
      ],
      answer: "diverge",
      explain: "Each new system costs five more custom connectors but a single server under the protocol.",
    },
    {
      id: "ma-flaw",
      format: "spot-flaw",
      scenario: "A team builds an MCP server and has the host application call the underlying API's endpoints directly too, 'in case'. Credentials are now handled in two places. Tap the unnecessary link.",
      diagram: {
        nodes: [
          { id: "host", label: "host app", kind: "client", col: 0, row: 1 },
          { id: "server", label: "MCP server", kind: "server", col: 1, row: 0 },
          { id: "api", label: "ticket API", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "host", to: "server" },
          { from: "server", to: "api" },
          { from: "host", to: "api" },
        ],
      },
      answer: "host->api",
      explain: "The point of the server is to be the single, governed path to the system. A direct route around it duplicates credentials and bypasses its checks.",
    },
    {
      id: "ma-explain",
      format: "explain",
      scenario: "In two sentences: why does MCP use a capability exchange when a connection opens?",
      rubric: [
        { id: "versions", criterion: "Client and server may support different protocol versions and features, so they agree on what both can do" },
        { id: "evolve", criterion: "It lets the protocol add optional features without breaking older clients and servers" },
      ],
      exemplar: "Client and server may support different versions and features, so they exchange them to agree on what both can do. That lets the protocol add optional features without breaking older clients or servers.",
      explain: "Negotiate, then proceed.",
    },
  ],
  codex: {
    oneLiner: "A host runs one MCP client per server; servers expose tools, resources and prompts. A shared protocol turns N × M into N + M.",
    keyNumbers: [
      { label: "5 hosts × 12 systems", value: "60 custom versus 17 with MCP", sourceId: "mcp-intro" },
      { label: "Tool definitions for 12 servers of 10 tools (lab)", value: "about 24,000 tokens", sourceId: "mcp-architecture" },
    ],
    tradeoffs: [
      { choice: "Custom integrations", gain: "Full control of each", cost: "Multiplicative effort" },
      { choice: "MCP", gain: "Write once, reach any host", cost: "A protocol layer and servers to run" },
      { choice: "Many servers on at once", gain: "Wide reach", cost: "Context cost and tool confusion" },
    ],
    seenIn: ["Claude, IDE assistants and other hosts that act as MCP clients.", "Servers for GitHub, Slack, databases and file systems."],
    interviewAngle: "Say: 'host, client per server, server per system, JSON-RPC, capability negotiation; enable only the servers a task needs'.",
    aws: [{ concept: "Hosting MCP servers", service: "AWS Lambda / Bedrock AgentCore" }],
    replay: { id: "mcparch-lab", config: ARCH, scene: "protocol" },
  },
  interview: [
    "What problem does MCP solve?",
    "What are the roles of host, client and server?",
    "How do you limit the context cost of many MCP servers?",
  ],
  deeper: [
    {
      title: "A protocol is not a security boundary",
      body: "MCP standardises how tools are described and called, not whether a call is safe. A server can return text that instructs the model to do something, or expose a destructive tool. Treat each server as code you are choosing to trust, give it the narrowest credentials it needs, and let a person approve sensitive calls.",
      sourceIds: ["mcp-spec"],
    },
  ],
  honestPhysics: [
    "Hosts are AI applications and sources the systems they need. Without a shared protocol each needs its own integration with each source: hosts × sources. With MCP each host implements a client once and each source a server once: hosts + sources.",
    "Each integration takes about 2 weeks. Each MCP server exposes about 10 tools of 200 tokens, all of which enter the model's context when enabled.",
    "Round figures for comparison.",
  ],
  sources: [MCP_ARCH, MCP_INTRO, MCP_SPEC, JSONRPC],
  verify: [
    { id: "custom", claim: "Five hosts and twelve systems need 60 custom integrations", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "custom" }, metric: "integrations" }, expect: { min: 60, max: 60 } },
    { id: "mcp", claim: "With MCP, 17", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "mcp" }, metric: "integrations" }, expect: { min: 17, max: 17 } },
    { id: "flood", claim: "All twelve servers on means 24,000 tokens of tool definitions", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "mcp", enabled: 12 }, metric: "toolTokens" }, expect: { min: 24000, max: 24000 } },
    { id: "four", claim: "Four servers keep it at 8,000", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "mcp", enabled: 4 }, metric: "toolTokens" }, expect: { max: 8000 } },
    { id: "five", claim: "Five servers go over", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "mcp", enabled: 5 }, metric: "toolTokens" }, expect: { min: 8001 } },
    { id: "weeks", claim: "Sixty integrations take 120 engineer-weeks", run: "lab", params: { model: "mcparch-lab", config: ARCH_CHALLENGE, values: { mode: "custom" }, metric: "setupWeeks" }, expect: { min: 120, max: 120 } },
  ],
});
