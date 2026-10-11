import { definePack } from "../define";

export const TOOL = { lockCount: true, count: 40, start: { clear: true, strict: true, retrieve: true } };
export const TOOL_CHALLENGE = { lockCount: true, count: 40 };

const ANTHROPIC_TOOLS = { id: "anthropic-tool-use", title: "Anthropic docs: Tool use with Claude (tool definitions, input_schema, tool_use and tool_result blocks)", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" };
const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (tool design, agent-computer interface)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const JSON_SCHEMA = { id: "json-schema", title: "JSON Schema: a vocabulary for validating JSON documents", url: "https://json-schema.org/understanding-json-schema" };

export default definePack({
  id: "tool-calling",
  title: "Tool Calling & JSON Schemas",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "assistant · called delete_order instead of cancel_order", detail: "forty tools, two with similar names" },
    lines: [
      { speaker: "kabir", line: "We gave the assistant forty tools and it started picking the wrong one, and passing a date as a free-text string the tool cannot parse." },
      { speaker: "meera", line: "A tool is an interface for a model to read. Fewer tools, clearer descriptions and tighter schemas are a design job, the same as any API." },
    ],
  },
  predictions: [
    {
      id: "confused",
      kind: "choice",
      prompt: "The model sees all 40 tool definitions on every call. With up to 5 in view it picks the right tool 99% of the time and each additional tool costs 0.8 points. How often does it pick right with 40 in view and clear descriptions?",
      options: [
        { id: "99", label: "About 99%" },
        { id: "95", label: "About 90%" },
        { id: "71", label: "About 71%" },
        { id: "50", label: "About 50%" },
      ],
      answer: "71",
      observe: "confused",
      reveal: {
        text: "35 tools beyond the first five cost 28 points, leaving 71%: roughly three calls in ten go to the wrong tool. The tool definitions also cost 8,800 tokens on every single call. Showing only the handful of tools relevant to the request fixes both.",
        derived: true,
        line: { speaker: "meera", line: "More choices is not more capability. It is more ways to be wrong." },
      },
    },
    {
      id: "args",
      kind: "choice",
      prompt: "A tool takes a date and a status. The schema says both are 'string' with no further constraint. In the lab what share of calls pass arguments the tool can actually use?",
      options: [
        { id: "all", label: "Almost all" },
        { id: "88", label: "About 88%" },
        { id: "half", label: "About half" },
      ],
      answer: "88",
      observe: "bad-args",
      reveal: {
        text: "Free-text fields invite '5th March', 'next Tuesday' and 'Pending approval'. A schema that uses a date format and an enum for the status ('open', 'shipped', 'cancelled') leaves the model nothing to improvise, and lifts valid calls from 88% to 98.5%. Validate every call anyway, and return errors the model can read.",
        derived: true,
        sourceIds: ["json-schema"],
        line: { speaker: "rao", line: "Every free-text field is a field the model will get creative with." },
      },
    },
  ],
  widget: { id: "toolcall-lab", config: TOOL },
  mechanism: [
    {
      id: "what",
      text: "Tool calling lets a model request that your code run a function. You describe each tool with a name, a description and an input schema. The model replies with a tool-use block naming the tool and its arguments; your code runs it and returns a tool-result block. The model never runs anything itself.",
      sourceIds: ["anthropic-tool-use"],
    },
    {
      id: "schema",
      scene: "schema",
      text: "The schema is the contract. Use types, enums for closed sets, required fields, formats for dates and ids, and short descriptions of what each field means. The tighter the schema, the less the model improvises. Validate the arguments on your side regardless, and return a clear error when they are wrong so the model can correct itself.",
      sourceIds: ["json-schema", "anthropic-tool-use"],
    },
    {
      id: "count",
      scene: "count",
      text: "Every tool definition is read on every call, so the catalogue is both a cost and a source of confusion. Models choose well among a handful of distinct tools and badly among dozens of overlapping ones. Merge near-duplicates, name tools for what they do, and make their descriptions say when not to use them.",
      sourceIds: ["building-effective-agents"],
      derived: true,
    },
    {
      id: "retrieve",
      scene: "retrieve",
      text: "When there are genuinely many tools, do not show them all. Retrieve the few most relevant to the request, by embedding the tool descriptions or with a small routing step, and pass only those. The model then chooses among eight, not forty, and the definitions cost a fifth as many tokens.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  challenges: [
    {
      id: "tool-set",
      title: "Design the tool set",
      brief: "The catalogue has 40 tools. Choose descriptions, schemas and how many tools to show so the model picks the right tool at least 95% of the time, arguments are valid at least 97% of the time, and the definitions cost at most 3,000 tokens a call.",
      line: { speaker: "rao", line: "Every call pays for every tool definition. Show what the request needs." },
      widget: { id: "toolcall-lab", config: TOOL_CHALLENGE },
      conditions: [
        { metric: "selectionAcc", op: ">=", value: 0.95, label: "Right tool at least 95% of the time" },
        { metric: "argValid", op: ">=", value: 0.97, label: "Valid arguments at least 97% of the time" },
        { metric: "toolTokens", op: "<=", value: 3000, label: "Definitions at most 3,000 tokens" },
      ],
      stars: [{ metric: "toolTokens", op: "<=", value: 2000, label: "Definitions at most 2,000 tokens" }],
      hints: [
        "How does accuracy fall as tools in view grow?",
        "What changes the share of valid arguments?",
        "What do vague descriptions cost in selection accuracy?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how tool calling works and how to design tools a model uses well.",
    rubric: [
      { id: "flow", criterion: "The model returns a tool-use request, the application runs it and returns the result; the model never executes anything itself", keyIdea: "model requests, code executes" },
      { id: "schema", criterion: "Strict schemas with types, enums and required fields reduce invalid arguments; validate and return readable errors", keyIdea: "tight schemas" },
      { id: "few", criterion: "Fewer, clearly described tools in view improve selection; retrieve relevant tools when there are many", keyIdea: "few clear tools in view" },
    ],
    exemplar:
      "The model returns a request to use a named tool with arguments, my code runs the function and sends back the result, and the model carries on; the model never runs anything itself. I would write tight schemas with types, enums for closed sets and required fields, validate every call, and return errors the model can read. And I would keep the tools in view few and clearly described, retrieving only the relevant ones when the catalogue is large, since selection accuracy drops and token cost rises with every tool shown.",
  },
  reviews: [
    {
      id: "tc-est",
      format: "estimate",
      scenario: "Each tool definition takes 220 tokens, and 40 tools are sent with every call at $2 per million input tokens. About what do the definitions alone cost for 1,000 calls?",
      unit: "USD",
      answer: 17.6,
      acceptFactor: 1.05,
      breakdown: ["40 × 220 = 8,800 tokens a call", "× 1,000 calls = 8.8 million tokens", "× $2 per million = $17.60"],
      explain: "Showing 8 tools instead of 40 cuts that to $3.52.",
    },
    {
      id: "tc-pick",
      format: "pick-fix",
      scenario: "A tool takes 'priority' as a free-text string, and the model sends 'urgent!!', 'High', 'p1' and 'asap'. The tool accepts only low, medium and high. What is the best fix?",
      options: [
        { id: "a", label: "Declare priority as an enum of low, medium, high in the schema" },
        { id: "b", label: "Add a longer instruction to the system prompt" },
        { id: "c", label: "Lower the temperature" },
        { id: "d", label: "Map every variant in the tool's code" },
      ],
      answer: "a",
      explain: "An enum is a closed set the model sees and obeys. Cleaning up variants in code treats the symptom and lets new ones appear.",
    },
    {
      id: "tc-order",
      format: "order",
      scenario: "Order these by right-tool accuracy in the lab with clear descriptions, lowest first.",
      items: [
        { id: "40", label: "All 40 tools shown" },
        { id: "20", label: "20 tools shown" },
        { id: "8", label: "8 tools shown" },
      ],
      answer: ["40", "20", "8"],
      explain: "Accuracy is 71%, 87% and 97%: it falls steadily with every tool added beyond five.",
    },
    {
      id: "tc-graph",
      format: "predict-graph",
      scenario: "With clear descriptions, as the number of tools shown rises from 2 to 80, how does the chance of choosing the right tool change?",
      xLabel: "tools in view →",
      yLabel: "right tool chosen",
      options: [
        { id: "fall", label: "Flat at 99% to about five tools, then declining steadily", points: [99, 99, 95, 87, 71, 55, 30, 30] },
        { id: "flat", label: "Stays at 99%", points: [99, 99, 99, 99, 99, 99, 99, 99] },
        { id: "rise", label: "Rises", points: [50, 60, 70, 80, 90, 95, 98, 99] },
      ],
      answer: "fall",
      explain: "Each tool beyond the first few adds another candidate to confuse with, so accuracy slips linearly in the lab.",
    },
    {
      id: "tc-flaw",
      format: "spot-flaw",
      scenario: "The agent calls 'transfer_funds' with an amount the model made up. The application passes the tool's arguments straight to the payment API without checking. Tap the missing step.",
      diagram: {
        nodes: [
          { id: "model", label: "model emits tool call", kind: "llm", col: 0, row: 1 },
          { id: "app", label: "app runs it as given", kind: "server", col: 1, row: 1 },
          { id: "pay", label: "payment API", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "model", to: "app" },
          { from: "app", to: "pay" },
        ],
      },
      answer: "model->app",
      explain: "Model output is untrusted input. Validate arguments against the schema and against business rules such as limits and ownership before running anything with side effects.",
    },
    {
      id: "tc-explain",
      format: "explain",
      scenario: "In two sentences: why should a tool description say when not to use the tool?",
      rubric: [
        { id: "overlap", criterion: "Tools overlap, and the model chooses by comparing descriptions, so boundaries reduce picks of the wrong similar tool" },
        { id: "cost", criterion: "A wrong call can have side effects or waste a step, so telling the model what the tool is not for is cheap protection" },
      ],
      exemplar: "Tools overlap and the model picks by comparing descriptions, so stating the boundary stops it choosing the wrong neighbour. A wrong call can have side effects or waste a step, so saying what a tool is not for is cheap protection.",
      explain: "Good interfaces say what they are not for.",
    },
  ],
  codex: {
    oneLiner: "The model requests, your code executes. Tight schemas, few clearly described tools in view, retrieval when there are many, and validate every call.",
    keyNumbers: [
      { label: "Selection accuracy, 40 tools in view (lab)", value: "71%", sourceId: "building-effective-agents" },
      { label: "Valid arguments, loose versus strict schema (lab)", value: "88% versus 98.5%", sourceId: "json-schema" },
    ],
    tradeoffs: [
      { choice: "Many tools in view", gain: "Everything available", cost: "Confusion and token cost" },
      { choice: "Strict schemas", gain: "Valid arguments", cost: "More up-front design" },
      { choice: "Tool retrieval", gain: "Few relevant tools per call", cost: "A retrieval step that can miss the right tool" },
    ],
    seenIn: ["Claude tool use and OpenAI function calling.", "MCP servers exposing tools with JSON Schemas."],
    interviewAngle: "Say: 'tight JSON schemas with enums, clear non-overlapping descriptions, validation on my side, and retrieval of a few relevant tools when the catalogue is large'.",
    aws: [{ concept: "Tool use with Converse API tool configuration", service: "Amazon Bedrock" }],
    replay: { id: "toolcall-lab", config: TOOL, scene: "retrieve" },
  },
  interview: [
    "How does tool calling work?",
    "How would you design tools for a model to use reliably?",
    "What do you do when you have hundreds of tools?",
  ],
  deeper: [
    {
      title: "The agent-computer interface",
      body: "Anthropic's guidance on agents compares tool design to interface design for people: put real effort into the descriptions, return concise and meaningful results, and test the tools by watching how the model misuses them. Small changes, such as requiring absolute file paths instead of relative ones, removed whole classes of errors.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "An agent with a catalogue of tools described in JSON schemas. With up to 5 tools in view, selection is right 99% of the time; each further tool in view costs 0.8 points; vague one-line descriptions cost 12%. Clear descriptions cost 220 tokens a tool, vague ones 120.",
    "A strict schema (enums, required fields) makes 98.5% of argument sets valid; a loose one 88%. Retrieving the 8 most relevant tools per request keeps the number in view small.",
    "Cost counts only the tool definitions as input at $2 per million tokens.",
  ],
  sources: [ANTHROPIC_TOOLS, BEA, JSON_SCHEMA],
  verify: [
    { id: "forty", claim: "With 40 clear tools in view the model picks right 71% of the time", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { clear: true, strict: true, retrieve: false }, metric: "selectionAcc" }, expect: { min: 0.7, max: 0.72 } },
    { id: "forty-tokens", claim: "…with 8,800 tokens of definitions a call", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { clear: true, strict: true, retrieve: false }, metric: "toolTokens" }, expect: { min: 8800, max: 8800 } },
    { id: "retrieved", claim: "Showing 8 tools lifts it to 97%", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { clear: true, strict: true, retrieve: true }, metric: "selectionAcc" }, expect: { min: 0.95 } },
    { id: "retrieved-tokens", claim: "…for 1,760 tokens", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { clear: true, strict: true, retrieve: true }, metric: "toolTokens" }, expect: { max: 3000 } },
    { id: "loose", claim: "A loose schema gives 88% valid arguments", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { strict: false }, metric: "argValid" }, expect: { min: 0.88, max: 0.88 } },
    { id: "strict", claim: "A strict one 98.5%", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { strict: true }, metric: "argValid" }, expect: { min: 0.97 } },
    { id: "vague", claim: "Vague descriptions cost accuracy even with 8 tools", run: "lab", params: { model: "toolcall-lab", config: TOOL_CHALLENGE, values: { clear: false, strict: true, retrieve: true }, metric: "selectionAcc" }, expect: { max: 0.9 } },
  ],
});
