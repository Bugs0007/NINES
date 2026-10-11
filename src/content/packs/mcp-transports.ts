import { definePack } from "../define";

export const TRANS = { lockUsers: true, users: 2000, start: { transport: "http", auth: true } };
export const TRANS_CHALLENGE = { lockUsers: true, users: 2000 };

const MCP_TRANSPORTS = { id: "mcp-transports", title: "Model Context Protocol specification: Transports (stdio and Streamable HTTP)", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/transports" };
const MCP_AUTH = { id: "mcp-auth", title: "Model Context Protocol specification: Authorization (OAuth 2.1 for HTTP transports)", url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization" };
const RFC6202 = { id: "rfc6202", title: "RFC 6202: Known Issues and Best Practices for the Use of Long Polling and Streaming in Bidirectional HTTP", url: "https://www.rfc-editor.org/rfc/rfc6202" };

export default definePack({
  id: "mcp-transports",
  title: "MCP Transports",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "security scan · CRM tools reachable from the internet without a login", detail: "an MCP server was deployed over HTTP for the whole sales team" },
    lines: [
      { speaker: "kabir", line: "Someone put our CRM's MCP server on a public address for the sales team. Nobody has to log in, so anyone who finds it can edit every account." },
      { speaker: "meera", line: "On a laptop the operating system is the front door. Put the same server on a network and you need to build a door." },
    ],
  },
  predictions: [
    {
      id: "scale",
      kind: "choice",
      prompt: "Each of 2,000 salespeople runs their own copy of the MCP server over stdio, about 60 MB each. How much memory is that across the company?",
      options: [
        { id: "gb", label: "About 1.2 GB" },
        { id: "12", label: "About 12 GB" },
        { id: "120", label: "About 120 GB" },
      ],
      answer: "120",
      observe: "process-flood",
      reveal: {
        text: "2,000 processes × 60 MB is 120 GB, spread across 2,000 laptops, which is fine for each laptop but means 2,000 copies to update and no shared state. Over Streamable HTTP, one server handles all of them for about 160 MB. Sharing is the point of the network transport.",
        derived: true,
        line: { speaker: "meera", line: "Two thousand copies to patch is its own cost, whatever it does to memory." },
      },
    },
    {
      id: "door",
      kind: "choice",
      prompt: "You move to one shared HTTP server and skip authorization 'for now'. Who can call its tools?",
      options: [
        { id: "team", label: "Only the sales team" },
        { id: "network", label: "Anyone who can reach the address" },
        { id: "nobody", label: "Nobody: MCP requires a token" },
      ],
      answer: "network",
      observe: "open-door",
      reveal: {
        text: "A transport only moves bytes. Without authorization anyone who can reach the server can list and call its tools, and the CRM's tools read and write real customer data. The MCP specification applies OAuth 2.1 to HTTP transports: the server verifies a bearer token and scopes each user's access.",
        derived: true,
        sourceIds: ["mcp-auth"],
        line: { speaker: "rao", line: "A reachable server without a login is a public API with admin rights." },
      },
    },
  ],
  widget: { id: "mcptransport-lab", config: TRANS },
  mechanism: [
    {
      id: "stdio",
      scene: "stdio",
      text: "With stdio the host launches the server as a child process and the two exchange JSON-RPC messages over standard input and output. Nothing touches the network, so there is nothing to authenticate and no port to protect; the server runs with the user's own permissions. It is the simplest transport and suits local tools, one user, one machine.",
      sourceIds: ["mcp-transports"],
    },
    {
      id: "stdout",
      text: "Because the protocol owns standard output, a stray print statement corrupts the stream, and the host sees broken messages. Servers over stdio must write logs to standard error only. Each user also gets their own process, so a team of thousands has thousands of copies to install and keep current.",
      sourceIds: ["mcp-transports"],
    },
    {
      id: "http",
      scene: "http",
      text: "Streamable HTTP runs the server as a network service. Clients send JSON-RPC in HTTP POST requests and the server may reply with a single response or stream events back over server-sent events. One deployment serves many users, can hold shared state and scales like any web service, at about tens of milliseconds a request.",
      sourceIds: ["mcp-transports", "rfc6202"],
    },
    {
      id: "auth",
      scene: "auth",
      text: "A server on a network needs authentication and authorization. The specification builds on OAuth 2.1: the client obtains a token for the user, the server validates it and limits each call to what that user may do. Also validate the Origin header and bind local servers to localhost, or a web page can reach them.",
      sourceIds: ["mcp-auth", "mcp-transports"],
    },
  ],
  challenges: [
    {
      id: "company-server",
      title: "Serve the sales team",
      brief: "2,000 salespeople need the CRM tools. Choose the transport and authorization so memory across the company is at most 8 GB, the server is never reachable without a login, and each request adds at most 50 ms.",
      line: { speaker: "kabir", line: "One server we can patch, and a login in front of it." },
      widget: { id: "mcptransport-lab", config: TRANS_CHALLENGE },
      conditions: [
        { metric: "memoryGB", op: "<=", value: 8, label: "At most 8 GB of memory" },
        { metric: "exposedUnauth", op: "<=", value: 0, label: "Never reachable without a login" },
        { metric: "overheadMs", op: "<=", value: 50, label: "At most 50 ms per request" },
      ],
      stars: [],
      hints: [
        "What does a process per user cost at 2,000 users?",
        "What does a network service need before anyone can reach it?",
        "Does a shared server meet the latency limit?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare stdio and Streamable HTTP for MCP and say what each needs.",
    rubric: [
      { id: "stdio", criterion: "stdio runs the server as a local child process: simple, fast and private to the user, but one copy per user and logs must avoid stdout", keyIdea: "stdio: local and per user" },
      { id: "http", criterion: "Streamable HTTP is one shared network service for many users, with request overhead", keyIdea: "HTTP: shared service" },
      { id: "auth", criterion: "An HTTP server needs OAuth-based authorization and origin checks; without it anyone reachable can use the tools", keyIdea: "authorize network servers" },
    ],
    exemplar:
      "With stdio the host launches the server as a child process and they talk over standard input and output: it is simple, fast and private to the user, but each user runs their own copy and logs must go to standard error so the protocol stream stays clean. With Streamable HTTP one shared server handles many users at the cost of some milliseconds per request. Because a network server is reachable by others it needs OAuth authorization and origin checks, or anyone who finds it can call its tools.",
  },
  reviews: [
    {
      id: "mt-est",
      format: "estimate",
      scenario: "A shared HTTP server uses 60 MB plus 0.05 MB per session. About how much memory does it need for 5,000 sessions, in MB?",
      unit: "MB",
      answer: 310,
      acceptFactor: 1.05,
      breakdown: ["5,000 × 0.05 = 250 MB", "+ 60 MB = 310 MB"],
      explain: "Sessions share one process, so memory grows slowly. 5,000 stdio copies would take 300 GB.",
    },
    {
      id: "mt-pick",
      format: "pick-fix",
      scenario: "A local MCP server over stdio prints debug messages with print(), and the host reports parse errors on every call. What is the fix?",
      options: [
        { id: "a", label: "Write logs to standard error, never to standard output" },
        { id: "b", label: "Switch to HTTP" },
        { id: "c", label: "Disable the host's parser" },
        { id: "d", label: "Print the messages in JSON" },
      ],
      answer: "a",
      explain: "Standard output carries protocol messages. Anything else on it breaks the stream, so logs belong on standard error.",
    },
    {
      id: "mt-order",
      format: "order",
      scenario: "Order these by memory for 1,000 users, highest first.",
      items: [
        { id: "stdio", label: "stdio, a process per user, 1,000 users" },
        { id: "stdio100", label: "stdio, a process per user, 100 users" },
        { id: "http", label: "One Streamable HTTP server, 1,000 users" },
      ],
      answer: ["stdio", "stdio100", "http"],
      explain: "60 GB across 1,000 processes, 6 GB across 100, against about 110 MB for the shared server.",
    },
    {
      id: "mt-graph",
      format: "predict-graph",
      scenario: "As users grow from 1 to 10,000, how does the total memory of the stdio design compare with a shared HTTP server?",
      xLabel: "users →",
      yLabel: "memory",
      options: [
        { id: "diverge", label: "stdio grows in proportion; HTTP stays nearly flat", points: [0.06, 0.6, 3, 6, 30, 60, 300, 600] },
        { id: "same", label: "Both grow in proportion", points: [0.06, 0.6, 3, 6, 30, 60, 300, 600] },
        { id: "flat", label: "Neither grows", points: [0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06] },
      ],
      answer: "diverge",
      explain: "A process per user adds 60 MB per user. A shared server adds a few kilobytes of state per session.",
    },
    {
      id: "mt-flaw",
      format: "spot-flaw",
      scenario: "A developer runs a local MCP server bound to 0.0.0.0 so a teammate can try it. A web page the teammate visits makes requests to it and reads their files. Tap the step that is unsafe.",
      diagram: {
        nodes: [
          { id: "page", label: "malicious web page", kind: "client", col: 0, row: 1 },
          { id: "bind", label: "server on 0.0.0.0, no origin check", kind: "server", col: 1, row: 1 },
          { id: "files", label: "local files and tools", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "page", to: "bind" },
          { from: "bind", to: "files" },
        ],
      },
      answer: "page->bind",
      explain: "A local server should bind to localhost and check the Origin header, or any web page open in the browser can call it as the user.",
    },
    {
      id: "mt-explain",
      format: "explain",
      scenario: "In two sentences: when is stdio the right transport and when is HTTP?",
      rubric: [
        { id: "stdio", criterion: "stdio for local tools used by one person on their machine, where the OS provides identity and nothing is exposed" },
        { id: "http", criterion: "HTTP for a shared service across many users or machines, with authorization, central updates and shared state" },
      ],
      exemplar: "Use stdio for local tools used by one person on their own machine, where the operating system provides identity and nothing is exposed to the network. Use HTTP for a shared service across many users, with authorization, central updates and shared state.",
      explain: "Local and personal: stdio. Shared and remote: HTTP.",
    },
  ],
  codex: {
    oneLiner: "stdio: a local child process, private, one copy per user, logs to stderr. Streamable HTTP: one shared service that needs OAuth authorization.",
    keyNumbers: [
      { label: "stdio per-request overhead / HTTP (lab)", value: "0.2 ms versus 25 ms", sourceId: "mcp-transports" },
      { label: "Memory for 2,000 users, stdio versus HTTP (lab)", value: "120 GB versus 0.16 GB", sourceId: "mcp-transports" },
    ],
    tradeoffs: [
      { choice: "stdio", gain: "Simple, fast, private", cost: "A process and an install per user" },
      { choice: "Streamable HTTP", gain: "One shared, updatable service", cost: "Network latency; authorization to build" },
      { choice: "No authorization on HTTP", gain: "Quick demo", cost: "An open door to every tool" },
    ],
    seenIn: ["Local IDE integrations via stdio.", "Hosted MCP servers for SaaS products over HTTP with OAuth."],
    interviewAngle: "Say: 'stdio for local single-user tools, Streamable HTTP with OAuth for shared services, bind locally, check origins, and never log to stdout'.",
    aws: [{ concept: "Remote MCP server hosting with identity", service: "Lambda function URLs / AgentCore Gateway with Cognito" }],
    replay: { id: "mcptransport-lab", config: TRANS, scene: "auth" },
  },
  interview: [
    "What transports does MCP support and when would you use each?",
    "Why must a stdio MCP server not print to stdout?",
    "How do you secure a remote MCP server?",
  ],
  deeper: [
    {
      title: "Sessions and resumability",
      body: "A Streamable HTTP server may assign a session id so a client can continue a conversation across requests, and may stream results over server-sent events. Because networks drop, the specification lets a client resume a stream from the last event it saw. That means servers that stream must be careful to keep or replay events rather than assume one unbroken connection.",
      sourceIds: ["mcp-transports"],
    },
  ],
  honestPhysics: [
    "stdio launches the server as a child process: no network, about 0.2 ms a message, about 150 ms to start, about 60 MB for each user's own copy. Streamable HTTP runs one shared server that many clients reach over the network: about 25 ms a request, 60 MB plus 0.05 MB per session, and it needs authorization because others can reach it.",
    "An HTTP server without authorization is open to anyone who can reach it; adding OAuth-based authorization closes it.",
    "Round figures for comparison.",
  ],
  sources: [MCP_TRANSPORTS, MCP_AUTH, RFC6202],
  verify: [
    { id: "stdio-mem", claim: "2,000 stdio copies take 120 GB", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "stdio" }, metric: "memoryGB" }, expect: { min: 120, max: 120 } },
    { id: "http-mem", claim: "One shared HTTP server takes about 0.16 GB", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "http", auth: true }, metric: "memoryGB" }, expect: { max: 8 } },
    { id: "open", claim: "HTTP without authorization is reachable by anyone", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "http", auth: false }, metric: "exposedUnauth" }, expect: { min: 1 } },
    { id: "closed", claim: "With authorization it is not", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "http", auth: true }, metric: "exposedUnauth" }, expect: { max: 0 } },
    { id: "overhead", claim: "HTTP adds 25 ms a request", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "http" }, metric: "overheadMs" }, expect: { min: 25, max: 25 } },
    { id: "stdio-over", claim: "stdio adds 0.2 ms", run: "lab", params: { model: "mcptransport-lab", config: TRANS_CHALLENGE, values: { transport: "stdio" }, metric: "overheadMs" }, expect: { max: 1 } },
  ],
});
