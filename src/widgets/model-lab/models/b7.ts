/**
 * Chapter B7 "MCP" models: the host/client/server architecture, transports, the three primitives, and building a
 * server that models can use. Closed forms with labelled round constants.
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ architecture

export const mcpArchLab: LabModel = {
  id: "mcparch-lab",
  metrics: ["integrations", "toolTokens", "setupWeeks"],
  observes: ["n-times-m", "tool-flood"],
  scenes: ["nm", "protocol", "enable"],
  runLabel: "Wire up the tools",
  honest: [
    "Hosts are AI applications (an IDE, a chat app, an agent); sources are the systems they need to reach (a ticket tracker, a database, a calendar). Without a shared protocol each host needs its own integration with each source: hosts × sources. With MCP each host implements a client once and each source a server once: hosts + sources.",
    "Each integration takes about 2 weeks to build and maintain. Every MCP server exposes about 10 tools of 200 tokens each; a host that connects to a server adds all its tool definitions to the model's context, so enabling many servers floods it.",
    "Round figures for comparison.",
  ],
  init: (c) => ({ mode: "custom", hosts: (c as { hosts?: number }).hosts ?? 5, sources: (c as { sources?: number }).sources ?? 12, enabled: 12 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "mode", label: "How hosts connect to sources", options: [{ id: "custom", label: "A custom integration for each pair" }, { id: "mcp", label: "MCP: a client in each host, a server for each source" }] }];
    if (!(c as { lockSize?: boolean }).lockSize) out.push({ kind: "slider", id: "hosts", label: "AI applications (hosts)", min: 1, max: 12, step: 1, fmt: "int" }, { kind: "slider", id: "sources", label: "Systems to reach", min: 1, max: 30, step: 1, fmt: "int" });
    out.push({ kind: "slider", id: "enabled", label: "Servers switched on for one task", min: 1, max: 30, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const h = Math.round(num(v, "hosts"));
    const s = Math.round(num(v, "sources"));
    const mcp = str(v, "mode") === "mcp";
    const integ = mcp ? h + s : h * s;
    const en = Math.min(Math.round(num(v, "enabled")), s);
    const tokens = en * 10 * 200;
    return {
      metrics: { integrations: integ, toolTokens: tokens, setupWeeks: integ * 2 },
      readouts: [
        { label: "Integrations to build and maintain", value: integ, fmt: "int", tone: integ > 40 ? "alert" : integ > 20 ? "warn" : "ok" },
        { label: "Engineer-weeks to build", value: integ * 2, fmt: "int" },
        { label: "Tool definitions in the model's context", value: tokens, fmt: "int", sub: "tokens", tone: tone(tokens, 8000, 20000) },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Integrations", value: integ, tone: integ > 20 ? "warn" : "ok" }, { label: "Tool tokens ÷ 100", value: tokens / 100, tone: tokens > 8000 ? "warn" : "ok" }] },
      notes: [mcp ? "Each side implements the protocol once, and any host can reach any server." : "Every new host or source multiplies the integrations."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.integrations! > 40) ev.push("n-times-m");
    if (out.metrics.toolTokens! > 20000) ev.push("tool-flood");
    return ev;
  },
  scene: (n): SceneOut => (n === "nm" ? { set: { mode: "custom" }, focus: ["mode"] } : n === "protocol" ? { set: { mode: "mcp" }, focus: ["mode"] } : n === "enable" ? { set: { mode: "mcp", enabled: 3 }, focus: ["enabled"] } : undefined),
};

// ------------------------------------------------------------------ transports

export const mcpTransportLab: LabModel = {
  id: "mcptransport-lab",
  metrics: ["memoryGB", "overheadMs", "exposedUnauth", "startupMs"],
  observes: ["process-flood", "open-door"],
  scenes: ["stdio", "http", "auth"],
  runLabel: "Choose the transport",
  honest: [
    "stdio launches the server as a child process of the host and talks over standard input and output: nothing crosses the network, a message costs about 0.2 ms, and starting the process takes about 150 ms. Each user's host starts its own copy, about 60 MB each, with no sharing. Streamable HTTP runs one server that many clients reach over the network with POST requests (and optional server-sent events): about 25 ms per request, a base of 60 MB plus 0.05 MB per session, and it needs authentication because it is reachable by others.",
    "An HTTP server with no authentication is open to anyone who can reach it. Adding OAuth-based authorization closes it.",
    "Round figures for comparison.",
  ],
  init: (c) => ({ transport: "stdio", users: (c as { users?: number }).users ?? 2000, auth: false }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "transport", label: "Transport", options: [{ id: "stdio", label: "stdio: a process per user, on their machine" }, { id: "http", label: "Streamable HTTP: one shared server" }] }];
    if (!(c as { lockUsers?: boolean }).lockUsers) out.push({ kind: "slider", id: "users", label: "Users", min: 1, max: 10000, log: true, fmt: "int" });
    out.push({ kind: "toggle", id: "auth", label: "OAuth authorization on the server" });
    return out;
  },
  evaluate: (v) => {
    const http = str(v, "transport") === "http";
    const n = Math.round(num(v, "users"));
    const mem = http ? (60 + 0.05 * n) / 1000 : (60 * n) / 1000;
    const over = http ? 25 : 0.2;
    const open = http && !bool(v, "auth") ? 1 : 0;
    return {
      metrics: { memoryGB: mem, overheadMs: over, exposedUnauth: open, startupMs: http ? 0 : 150 },
      readouts: [
        { label: "Memory across all users", value: mem, fmt: "num", sub: "GB", tone: tone(mem, 8, 40) },
        { label: "Per-request overhead", value: over, fmt: "ms", tone: over > 50 ? "warn" : "ok" },
        { label: "Reachable by anyone, unauthenticated", value: open ? "yes" : "no", tone: open ? "alert" : "ok" },
        { label: "Start-up for each user", value: http ? 0 : 150, fmt: "ms" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Memory, GB", value: mem, tone: tone(mem, 8, 40) }, { label: "Overhead, ms", value: over, tone: "info" }] },
      notes: [open ? "A reachable server with no login is an open door to every tool it offers." : !http ? "Private to one user's machine, and one copy per user." : "One shared server, behind a login."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.memoryGB! > 40) ev.push("process-flood");
    if (out.metrics.exposedUnauth! > 0) ev.push("open-door");
    return ev;
  },
  scene: (n): SceneOut => (n === "stdio" ? { set: { transport: "stdio" }, focus: ["transport"] } : n === "http" ? { set: { transport: "http" }, focus: ["transport"] } : n === "auth" ? { set: { transport: "http", auth: true }, focus: ["auth"] } : undefined),
};

// ------------------------------------------------------------------ primitives

const ITEMS: { id: string; label: string; best: "tool" | "resource" | "prompt" }[] = [
  { id: "invoice", label: "Read a customer's invoice by id", best: "resource" },
  { id: "refund", label: "Issue a refund", best: "tool" },
  { id: "weekly", label: "A /weekly slash command that summarises the week's tickets", best: "prompt" },
  { id: "search", label: "Search the knowledge base for a query", best: "tool" },
  { id: "schema", label: "The database schema, for context", best: "resource" },
  { id: "review", label: "A /review command with a fixed code-review instruction", best: "prompt" },
];

export const primitiveLab: LabModel = {
  id: "primitive-lab",
  metrics: ["correct", "toolTokens", "misplaced"],
  observes: ["all-tools", "controlled"],
  scenes: ["tool", "resource", "prompt"],
  runLabel: "Sort the capabilities",
  honest: [
    "MCP servers offer three primitives, distinguished by who decides when they are used. Tools are model-controlled: the model chooses to call one, usually to do something or to search. Resources are application-controlled: the host decides which data to attach to the context. Prompts are user-controlled: a template the user picks, like a slash command.",
    "Putting a capability under the wrong primitive has costs. Exposing read-only data as a tool puts its definition in every request and lets the model fetch it at will; exposing an action as a resource hides it from the model; a fixed instruction offered as a tool makes the model decide when to apply it. Each tool definition costs 200 tokens of context.",
    "'Correct' counts capabilities placed under their best-fit primitive.",
  ],
  init: () => Object.fromEntries(ITEMS.map((i) => [i.id, "tool"])),
  controls: () => ITEMS.map((i) => ({ kind: "choice" as const, id: i.id, label: i.label, options: [{ id: "tool", label: "Tool: the model decides" }, { id: "resource", label: "Resource: the host decides" }, { id: "prompt", label: "Prompt: the user decides" }] })),
  evaluate: (v) => {
    let correct = 0;
    let tools = 0;
    for (const i of ITEMS) {
      if (str(v, i.id) === i.best) correct++;
      if (str(v, i.id) === "tool") tools++;
    }
    return {
      metrics: { correct, toolTokens: tools * 200, misplaced: ITEMS.length - correct },
      readouts: [
        { label: "Placed where they fit best", value: correct, fmt: "int", sub: "of 6", tone: correct === 6 ? "ok" : correct >= 4 ? "warn" : "alert" },
        { label: "Tool definitions in every request", value: tools * 200, fmt: "int", sub: "tokens", tone: tools > 3 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Correct", value: correct, tone: correct === 6 ? "ok" : "warn" }, { label: "Misplaced", value: ITEMS.length - correct, tone: ITEMS.length - correct ? "alert" : "ok" }] },
      notes: [tools === 6 ? "Everything is a tool, which is the default and rarely the best fit." : correct === 6 ? "Each capability is controlled by the party that should decide." : "Ask who should decide when this is used: the model, the host or the user."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (ITEMS.every((i) => str(v, i.id) === "tool")) ev.push("all-tools");
    if (out.metrics.correct! >= 5) ev.push("controlled");
    return ev;
  },
  scene: (n): SceneOut => (n === "tool" ? { set: { refund: "tool" }, focus: ["refund"] } : n === "resource" ? { set: { invoice: "resource" }, focus: ["invoice"] } : n === "prompt" ? { set: { weekly: "prompt" }, focus: ["weekly"] } : undefined),
};

// ------------------------------------------------------------------ building a server

export const mcpBuildLab: LabModel = {
  id: "mcpbuild-lab",
  metrics: ["successRate", "tokensPerTask", "scoped", "protocolOk"],
  observes: ["bloated", "leaky"],
  scenes: ["tools", "output", "safety"],
  runLabel: "Design the server",
  honest: [
    "A server wrapping a ticketing API with 40 endpoints. Mapping each endpoint to a tool gives 40 tools (150 tokens each) and a task takes about 9 calls; designing around tasks gives 6 tools and 3 calls. The model picks the right tool 71% of the time with 40 to choose from and 99% with 6.",
    "Raw API responses average 6,000 tokens a call; trimming to the fields the model needs, 600. Error messages that say what went wrong and how to fix it let the model recover 90% of the time; stack traces 40%. A task succeeds with probability selection × (1 − 12% × the share of failures it cannot recover from).",
    "Tokens a task = calls × (tool definitions + output + 500). A shared service token can reach everyone's tickets; per-user OAuth scopes limit each call to the caller. Over stdio, anything printed to standard output other than protocol messages corrupts the stream, so logs must go to standard error.",
  ],
  init: () => ({ gran: "endpoint", out: "raw", errors: "trace", auth: "shared", stderr: false }),
  controls: () => [
    { kind: "choice", id: "gran", label: "Tools", options: [{ id: "endpoint", label: "One tool for each API endpoint" }, { id: "task", label: "A few tools designed around tasks" }] },
    { kind: "choice", id: "out", label: "What a tool returns", options: [{ id: "raw", label: "The raw API response" }, { id: "trimmed", label: "Only the fields the model needs" }] },
    { kind: "choice", id: "errors", label: "Errors", options: [{ id: "trace", label: "The exception and stack trace" }, { id: "helpful", label: "What went wrong and what to try" }] },
    { kind: "choice", id: "auth", label: "Credentials", options: [{ id: "shared", label: "One service token for everyone" }, { id: "user", label: "The calling user's own OAuth token and scopes" }] },
    { kind: "toggle", id: "stderr", label: "Send logs to standard error, not standard output" },
  ],
  evaluate: (v) => {
    const task = str(v, "gran") === "task";
    const tools = task ? 6 : 40;
    const calls = task ? 3 : 9;
    const sel = task ? 0.99 : 0.71;
    const rec = str(v, "errors") === "helpful" ? 0.9 : 0.4;
    const success = sel * (1 - 0.12 * (1 - rec));
    const outTok = str(v, "out") === "trimmed" ? 600 : 6000;
    const tokens = calls * (tools * 150 + outTok + 500);
    const scoped = str(v, "auth") === "user" ? 1 : 0;
    const proto = bool(v, "stderr") ? 1 : 0;
    return {
      metrics: { successRate: success, tokensPerTask: tokens, scoped, protocolOk: proto },
      readouts: [
        { label: "Tasks completed", value: success, fmt: "pct", tone: success < 0.8 ? "alert" : success < 0.9 ? "warn" : "ok" },
        { label: "Tokens per task", value: tokens, fmt: "int", tone: tone(tokens, 12000, 50000) },
        { label: "Calls limited to the caller's rights", value: scoped ? "yes" : "no", tone: scoped ? "ok" : "alert" },
        { label: "Protocol stream stays clean (stdio)", value: proto ? "yes" : "no", tone: proto ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Tasks completed", value: success, tone: success < 0.9 ? "warn" : "ok" }] },
      notes: [!task ? "Forty look-alike tools and a pile of raw JSON: the model gets lost and the context fills." : "A small set of task-shaped tools that return only what matters."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.tokensPerTask! > 50000) ev.push("bloated");
    if (out.metrics.scoped! < 1) ev.push("leaky");
    return ev;
  },
  scene: (n): SceneOut => (n === "tools" ? { set: { gran: "task" }, focus: ["gran"] } : n === "output" ? { set: { out: "trimmed", errors: "helpful" }, focus: ["out", "errors"] } : n === "safety" ? { set: { auth: "user", stderr: true }, focus: ["auth", "stderr"] } : undefined),
};

export const B7_MODELS: LabModel[] = [mcpArchLab, mcpTransportLab, primitiveLab, mcpBuildLab];
