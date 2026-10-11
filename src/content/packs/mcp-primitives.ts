import { definePack } from "../define";

export const PRIM = { start: { invoice: "tool", refund: "tool", weekly: "prompt", search: "tool", schema: "tool", review: "tool" } };
export const PRIM_CHALLENGE = {};

const MCP_TOOLS = { id: "mcp-tools", title: "Model Context Protocol docs: Tools (model-controlled)", url: "https://modelcontextprotocol.io/docs/concepts/tools" };
const MCP_RESOURCES = { id: "mcp-resources", title: "Model Context Protocol docs: Resources (application-controlled)", url: "https://modelcontextprotocol.io/docs/concepts/resources" };
const MCP_PROMPTS = { id: "mcp-prompts", title: "Model Context Protocol docs: Prompts (user-controlled)", url: "https://modelcontextprotocol.io/docs/concepts/prompts" };

export default definePack({
  id: "mcp-primitives",
  title: "Tools, Resources & Prompts",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "MCP server · 31 tools, 14 of which just read a document", detail: "the model keeps fetching files it did not need" },
    lines: [
      { speaker: "kabir", line: "Our MCP server exposes everything as a tool, including reading files and a fixed review instruction. The model calls them at random, and the definitions fill the prompt." },
      { speaker: "meera", line: "MCP has three kinds of thing, and the difference is who decides when each is used. Put each where the right party is in charge." },
    ],
  },
  predictions: [
    {
      id: "alltools",
      kind: "choice",
      prompt: "A server exposes six capabilities: two reads of data, two actions or searches, and two fixed instructions a user would trigger with a slash command. You make all six tools. How many are in their best-fit primitive?",
      options: [
        { id: "0", label: "None" },
        { id: "2", label: "Two: the actions and searches" },
        { id: "4", label: "Four" },
        { id: "6", label: "All six" },
      ],
      answer: "2",
      observe: "all-tools",
      reveal: {
        text: "Tools suit things the model should decide to do: issue a refund, search. Reading a known document is data the host can attach to the context; a fixed instruction is a template the user triggers. Making everything a tool works, and it puts six definitions (1,200 tokens) in every request and lets the model decide on things it should not.",
        derived: true,
        line: { speaker: "meera", line: "Everything-is-a-tool is the default, not the design." },
      },
    },
    {
      id: "control",
      kind: "choice",
      prompt: "A fixed review instruction is exposed as a prompt, and the user picks it with a /review command. Who decides when the instruction is used?",
      options: [
        { id: "model", label: "The model" },
        { id: "host", label: "The host application" },
        { id: "user", label: "The user" },
      ],
      answer: "user",
      observe: "controlled",
      reveal: {
        text: "Prompts are user-controlled templates, surfaced as slash commands or menu items. Resources are application-controlled: the host chooses which data to attach. Tools are model-controlled: the model decides to call them. Matching the primitive to who should decide keeps unwanted calls out and wanted ones available.",
        derived: true,
        sourceIds: ["mcp-prompts"],
        line: { speaker: "rao", line: "Control is the design question. The primitive follows from it." },
      },
    },
  ],
  widget: { id: "primitive-lab", config: PRIM },
  mechanism: [
    {
      id: "three",
      text: "An MCP server can expose three things. Tools are functions the model can call to act or compute. Resources are data identified by URI, like files, records or schemas, that can be read. Prompts are reusable message templates with arguments. The differences are less about what they contain than about who is in control.",
      sourceIds: ["mcp-tools", "mcp-resources", "mcp-prompts"],
    },
    {
      id: "tool",
      scene: "tool",
      text: "Tools are model-controlled. The model sees their descriptions and decides to call one while working on a task. Use them for actions with effects, searches whose query the model must form, and computations. Each costs context, and each carries risk: a tool that can write or delete should be treated as a capability you are granting.",
      sourceIds: ["mcp-tools"],
    },
    {
      id: "resource",
      scene: "resource",
      text: "Resources are application-controlled. The host decides which to attach or offer, such as a selected file, a database schema, or a customer record the user has open. They can be listed, read and subscribed to for changes. Data the model does not need to hunt for belongs here, not behind a tool.",
      sourceIds: ["mcp-resources"],
    },
    {
      id: "prompt",
      scene: "prompt",
      text: "Prompts are user-controlled. A server provides named templates with arguments, which hosts show as slash commands or menu items; choosing one fills a message in the conversation. They package expert instructions so that users do not rewrite them. They are not called by the model; the user picks them.",
      sourceIds: ["mcp-prompts"],
    },
  ],
  challenges: [
    {
      id: "sort",
      title: "Sort the capabilities",
      brief: "Six capabilities, three primitives. Place each under the primitive whose controller should decide when it is used, so all six are correctly placed.",
      line: { speaker: "kabir", line: "Who should be pressing this button: the model, the app, or the person?" },
      widget: { id: "primitive-lab", config: PRIM_CHALLENGE },
      conditions: [{ metric: "correct", op: ">=", value: 6, label: "All six placed correctly" }],
      stars: [{ metric: "toolTokens", op: "<=", value: 400, label: "Only two tool definitions in context" }],
      hints: [
        "Which capabilities have side effects or need the model to form a query?",
        "Which are data the host can attach?",
        "Which would a user trigger by name?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain tools, resources and prompts in MCP and who controls each.",
    rubric: [
      { id: "tools", criterion: "Tools are model-controlled functions for actions and searches; each costs context and carries risk", keyIdea: "tools: model decides" },
      { id: "resources", criterion: "Resources are application-controlled data addressed by URI, attached by the host", keyIdea: "resources: host decides" },
      { id: "prompts", criterion: "Prompts are user-controlled templates, exposed as slash commands", keyIdea: "prompts: user decides" },
    ],
    exemplar:
      "Tools are functions the model decides to call, suited to actions and searches, and each one costs context and carries risk. Resources are data addressed by URI that the host application chooses to attach, such as a file or a schema. Prompts are reusable templates that the user picks, usually as slash commands. The primitive follows from who should decide when the capability is used.",
  },
  reviews: [
    {
      id: "pr-est",
      format: "estimate",
      scenario: "A server turns its 12 read-only lookups into resources instead of tools, saving 200 tokens of definition each. How many tokens does that remove from every request?",
      unit: "tokens",
      answer: 2400,
      acceptFactor: 1.01,
      breakdown: ["12 × 200", "= 2,400"],
      explain: "Across thousands of requests a day this adds up to real cost and fewer wrong calls.",
    },
    {
      id: "pr-pick",
      format: "pick-fix",
      scenario: "A server offers a 'summarise_standup' tool that always applies the same instruction. Users want to run it by name, and the model sometimes calls it unprompted. What primitive fits?",
      options: [
        { id: "a", label: "A prompt, surfaced as a command the user picks" },
        { id: "b", label: "A resource" },
        { id: "c", label: "A second tool" },
        { id: "d", label: "A notification" },
      ],
      answer: "a",
      explain: "A fixed instruction the user triggers is a prompt. It stops being something the model decides to do.",
    },
    {
      id: "pr-order",
      format: "order",
      scenario: "Order these by how much control the model has, most first.",
      items: [
        { id: "tool", label: "Tool" },
        { id: "resource", label: "Resource" },
        { id: "prompt", label: "Prompt" },
      ],
      answer: ["tool", "resource", "prompt"],
      explain: "The model chooses tool calls; the host chooses resources; the user chooses prompts.",
    },
    {
      id: "pr-graph",
      format: "predict-graph",
      scenario: "As the number of read-only lookups exposed as tools grows from 0 to 40, how do the tool-definition tokens in each request change?",
      xLabel: "lookups exposed as tools →",
      yLabel: "tokens per request",
      options: [
        { id: "linear", label: "Rise in proportion: 200 for each", points: [0, 1000, 2000, 3000, 4000, 5000, 6000, 8000] },
        { id: "flat", label: "Stay the same", points: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] },
        { id: "fall", label: "Fall", points: [8000, 6000, 5000, 4000, 3000, 2000, 1000, 0] },
      ],
      answer: "linear",
      explain: "Every tool definition is sent on every request, so cost scales with how many there are.",
    },
    {
      id: "pr-flaw",
      format: "spot-flaw",
      scenario: "A server exposes the company's whole document store as a resource template with no limits on the URI, and the host attaches whatever the model asks for. A prompt injection in one document makes the model fetch confidential files. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "model", label: "model asks for any resource", kind: "llm", col: 0, row: 1 },
          { id: "host", label: "host attaches without checking", kind: "client", col: 1, row: 1 },
          { id: "docs", label: "entire document store", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "model", to: "host" },
          { from: "host", to: "docs" },
        ],
      },
      answer: "model->host",
      explain: "Resources are meant to be chosen by the application, not by whatever the model says. The host should decide what is attached, within user-granted scope.",
    },
    {
      id: "pr-explain",
      format: "explain",
      scenario: "In two sentences: why does it matter who controls a primitive?",
      rubric: [
        { id: "safety", criterion: "Control determines who can trigger effects: model-controlled tools can be misled, user-controlled prompts cannot be called by the model" },
        { id: "fit", criterion: "It also fits the cost: only tools consume context in every request, so putting data and templates elsewhere saves tokens and reduces mistakes" },
      ],
      exemplar: "Control decides who can trigger something: a model-controlled tool can be misled by injected text, whereas a user-controlled prompt cannot be called by the model. It also decides cost, since only tools put their definitions into every request.",
      explain: "Choose the primitive by who should decide.",
    },
  ],
  codex: {
    oneLiner: "Tools: the model decides. Resources: the host attaches data. Prompts: the user picks a template. Put each capability where the right party is in control.",
    keyNumbers: [
      { label: "Tool definition cost (lab)", value: "about 200 tokens each, every request", sourceId: "mcp-tools" },
      { label: "Resources and prompts in every request", value: "not sent until used", sourceId: "mcp-resources" },
    ],
    tradeoffs: [
      { choice: "Tool", gain: "The model can act and search on its own", cost: "Context cost; the model can misuse it" },
      { choice: "Resource", gain: "Host controls what data enters context", cost: "The model cannot fetch it unprompted" },
      { choice: "Prompt", gain: "Reusable expert instructions", cost: "Needs the user to pick it" },
    ],
    seenIn: ["Slash commands backed by MCP prompts.", "File and database-schema resources attached by IDEs."],
    interviewAngle: "Say: 'tools are model-controlled, resources application-controlled, prompts user-controlled; I choose by who should decide, and keep the tool list short'.",
    aws: [{ concept: "MCP servers with tools, resources and prompts", service: "Bedrock AgentCore Gateway" }],
    replay: { id: "primitive-lab", config: { start: { invoice: "resource", refund: "tool", weekly: "prompt", search: "tool", schema: "resource", review: "prompt" } }, scene: "resource" },
  },
  interview: [
    "What are the three MCP primitives?",
    "When should something be a resource rather than a tool?",
    "Why are prompts user-controlled?",
  ],
  deeper: [
    {
      title: "Beyond the three",
      body: "Servers can also notify clients that their lists of tools, resources or prompts changed, and clients can offer capabilities back to servers, such as sampling, where a server asks the host's model to complete a prompt, and roots, where the client tells the server which directories it may touch. Each is optional and negotiated when the connection opens.",
      sourceIds: ["mcp-tools"],
    },
  ],
  honestPhysics: [
    "Six capabilities: read an invoice by id (resource), issue a refund (tool), a /weekly summary command (prompt), search the knowledge base (tool), the database schema (resource), and a /review command (prompt).",
    "Putting a capability under the wrong primitive costs context (each tool definition is 200 tokens) and control (the wrong party decides when it is used).",
    "'Correct' counts capabilities in their best-fit primitive.",
  ],
  sources: [MCP_TOOLS, MCP_RESOURCES, MCP_PROMPTS],
  verify: [
    { id: "all-tools", claim: "Making all six tools places only two correctly", run: "lab", params: { model: "primitive-lab", config: PRIM_CHALLENGE, values: {}, metric: "correct" }, expect: { min: 2, max: 2 } },
    { id: "tokens", claim: "…and costs 1,200 tokens in every request", run: "lab", params: { model: "primitive-lab", config: PRIM_CHALLENGE, values: {}, metric: "toolTokens" }, expect: { min: 1200, max: 1200 } },
    { id: "all-right", claim: "The right placement puts all six in order", run: "lab", params: { model: "primitive-lab", config: PRIM_CHALLENGE, values: { invoice: "resource", refund: "tool", weekly: "prompt", search: "tool", schema: "resource", review: "prompt" }, metric: "correct" }, expect: { min: 6 } },
    { id: "right-tokens", claim: "…with only 400 tokens of tool definitions", run: "lab", params: { model: "primitive-lab", config: PRIM_CHALLENGE, values: { invoice: "resource", refund: "tool", weekly: "prompt", search: "tool", schema: "resource", review: "prompt" }, metric: "toolTokens" }, expect: { max: 400 } },
    { id: "one-wrong", claim: "One mistake still leaves five correct", run: "lab", params: { model: "primitive-lab", config: PRIM_CHALLENGE, values: { invoice: "tool", refund: "tool", weekly: "prompt", search: "tool", schema: "resource", review: "prompt" }, metric: "correct" }, expect: { min: 5, max: 5 } },
  ],
});
