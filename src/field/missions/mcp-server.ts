import { defineField } from "../types";

export default defineField({
  id: "field-mcp-server",
  title: "Field: Write an MCP Server",
  estimatedMinutes: 50,
  xp: 200,
  brief: [
    { speaker: "kabir", line: "I keep pasting the same notes into the assistant. Could it just read them itself?" },
    { speaker: "meera", line: "That is a tool. Write a Model Context Protocol server that exposes one, and prove a client can discover and call it." },
  ],
  goal: "Write an MCP server with one useful tool, connect it to a client, and show the tool listing and a successful call.",
  needs: ["Node 18 or later, or Python 3.10 or later", "The official MCP SDK for your language", "The MCP Inspector (npx @modelcontextprotocol/inspector) or any MCP client", "Some data to expose: a notes folder, a CSV, a small database"],
  steps: [
    {
      id: "tool",
      title: "Choose one tool and write its contract",
      detail: "Pick a single read-only action, for example search_notes(query) or get_note(id). Write the name, a one-sentence description that tells a model when to use it, and a JSON input schema with typed, described parameters.",
    },
    {
      id: "server",
      title: "Implement the server over stdio",
      detail: "Use the SDK to register the tool and serve over the stdio transport. Return results as text content, and return an error result (not a crash) for bad input.",
      commands: ["npm install @modelcontextprotocol/sdk zod", "node server.js"],
    },
    {
      id: "inspect",
      title: "Connect with the Inspector",
      detail: "Run the Inspector against your server, list the tools, and call yours with a real argument. Save the listing and the result.",
      commands: ["npx @modelcontextprotocol/inspector node server.js"],
    },
    {
      id: "bad",
      title: "Call it wrongly on purpose",
      detail: "Send a missing or mistyped argument and check that you get a clear error result the model could act on.",
    },
    {
      id: "client",
      title: "Connect a real client (optional)",
      detail: "Add the server to a client such as Claude Desktop or Claude Code and ask a question that needs the tool. Note whether the model chose it from your description alone.",
    },
  ],
  criteria: [
    { id: "list", criterion: "Shows a tools/list result containing the tool's name, description and input schema" },
    { id: "call", criterion: "Shows a successful tools/call with a real argument and a result" },
    { id: "error", criterion: "Shows or describes a clear error result for bad input" },
    { id: "desc", criterion: "The tool description says when to use it, not just what it is" },
  ],
  hints: [
    { text: "A tool is a name, a description and an input schema. The model sees only these, so the description is the interface documentation it reads.", cost: 20 },
    { text: "stdio servers must write only protocol messages to stdout. Send logs to stderr, or the client will fail to parse the stream.", cost: 25 },
    { text: "In the Inspector, the Tools tab lists tools and lets you fill in arguments. The raw messages are in the history pane.", cost: 15 },
  ],
  proof: {
    prompt: "Paste the tools/list response and one tools/call request and response (from the Inspector's history or your client logs), and describe what happens with a bad argument.",
    placeholder: "{\"result\": {\"tools\": [{\"name\": ..., \"description\": ..., \"inputSchema\": {...}}]}}\n{\"method\": \"tools/call\", ...}\n{\"result\": {\"content\": [...]}}\nBad argument: ...",
    checks: [
      { id: "tools", label: "Contains a tools listing", pattern: "\"tools\"\\s*:" },
      { id: "schema", label: "Contains an inputSchema", pattern: "inputSchema" },
      { id: "name", label: "Contains a tool name", pattern: "\"name\"\\s*:" },
      { id: "call", label: "Contains a tools/call", pattern: "tools/call" },
      { id: "content", label: "Contains a result with content", pattern: "\"content\"\\s*:" },
      { id: "bad", label: "Describes bad input handling", pattern: "(bad|invalid|missing|error)" },
    ],
    sample:
      "{\"result\": {\"tools\": [{\"name\": \"search_notes\", \"description\": \"Search my notes by keyword. Use when the user asks what they wrote about a topic.\", \"inputSchema\": {\"type\": \"object\", \"properties\": {\"query\": {\"type\": \"string\"}}, \"required\": [\"query\"]}}]}}\n{\"method\": \"tools/call\", \"params\": {\"name\": \"search_notes\", \"arguments\": {\"query\": \"retries\"}}}\n{\"result\": {\"content\": [{\"type\": \"text\", \"text\": \"2 notes: retries.md, backoff.md\"}], \"isError\": false}}\nBad argument: a missing query returns isError true with 'query is required'.",
  },
  debrief: [
    "An MCP server is a small typed API whose reader is a model. The description and the schema are what it knows, so writing them well matters more than the code inside.",
    "Errors are part of the interface: a clear message lets the model correct its call, and a crash ends the conversation.",
  ],
  honestPhysics: ["Which tool a model picks depends on the model and the client. Your listing is what you control; the choice is theirs."],
  sources: [
    { id: "mcp-spec", title: "Model Context Protocol specification: Tools", url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools" },
    { id: "mcp-inspector", title: "MCP Inspector: a tool for testing and debugging MCP servers", url: "https://github.com/modelcontextprotocol/inspector" },
  ],
});
