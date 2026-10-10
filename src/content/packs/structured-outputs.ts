import { definePack } from "../define";

export const SCHEMA = { start: { method: "prompt", retries: 0 } };

const ANTHROPIC_TOOLS = { id: "anthropic-tool-use", title: "Anthropic docs: Tool use with Claude (JSON schema for inputs; forcing a tool for structured output)", url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use" };
const ANTHROPIC_CONSISTENCY = { id: "anthropic-consistency", title: "Anthropic docs: Increase output consistency (JSON mode, prefilling, examples)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency" };
const WILLARD = { id: "willard-2023", title: "B. Willard and R. Louf (2023), Efficient Guided Generation for Large Language Models (grammar-constrained decoding)", url: "https://arxiv.org/abs/2307.09702" };
const JSONSCHEMA = { id: "json-schema", title: "JSON Schema: specification and documentation", url: "https://json-schema.org/" };

export default definePack({
  id: "structured-outputs",
  title: "Structured Outputs & JSON Schemas",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "orders-worker · JSONDecodeError", detail: "1 in 17 Copilot replies failed to parse overnight" },
    lines: [
      { speaker: "pager", line: "The order pipeline threw about three thousand parse errors overnight. The model wrapped the JSON in a friendly sentence." },
      { speaker: "meera", line: "Asking nicely for JSON is a request. A schema the decoder enforces is a contract." },
    ],
  },
  predictions: [
    {
      id: "volume",
      kind: "numeric",
      prompt: "Your pipeline asks for JSON in the prompt, and 6% of replies fail to parse. It processes 50,000 requests a day. About how many failures a day?",
      unit: "failures",
      min: 100,
      max: 20000,
      log: true,
      answer: 3000,
      tolerance: 1.2,
      observe: "retried",
      reveal: {
        text: "6% of 50,000 is 3,000 broken replies every day. A rate that sounds small is a steady stream at volume, and each one is either lost work or a retry that costs another call.",
        derived: true,
        line: { speaker: "rao", line: "A rare error at a million requests is a daily event." },
      },
    },
  ],
  widget: { id: "schema-lab", config: SCHEMA },
  mechanism: [
    {
      id: "ask",
      scene: "prompt",
      text: "Asking for JSON in the prompt works most of the time and fails some of the time: extra prose around it, a missing field, a trailing comma. Anything that parses the reply must treat it as untrusted input, with a parse check and a plan for failure.",
      sourceIds: ["anthropic-consistency"],
    },
    {
      id: "tool",
      scene: "tool",
      text: "Define a schema and have the model call a tool that takes it. The model is trained to produce arguments in the schema's shape, which is far more reliable than prose. You can force a specific tool so every reply is structured, and validate the result against the schema anyway.",
      sourceIds: ["anthropic-tool-use", "json-schema"],
    },
    {
      id: "strict",
      scene: "strict",
      text: "Constrained decoding goes further: at each step the decoder only allows tokens that keep the output valid under the schema, so the reply cannot fail to parse or break the types. It guarantees structure, not truth: a perfectly valid object can still hold a wrong answer.",
      sourceIds: ["willard-2023"],
    },
    {
      id: "retry",
      text: "Retries are the backstop for what remains. If failures are independent, retrying once cuts a 1% failure to 0.01% for about 1% more calls. But retries cost money and latency, and they cannot fix a prompt that is systematically wrong, so use them with a limit and log the failures.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "contract",
      title: "Make parse errors rare",
      brief: "50,000 requests a day, and today 6% fail to parse. Choose how the structure is obtained and how many retries are allowed so that at most 0.1% of requests end invalid, using no more than 2% extra calls on average.",
      line: { speaker: "rao", line: "A retry is another call on the bill. Do not retry your way out of a prompt problem." },
      widget: { id: "schema-lab", config: SCHEMA },
      conditions: [
        { metric: "failRate", op: "<=", value: 0.001, label: "At most 0.1% end invalid" },
        { metric: "avgCalls", op: "<=", value: 1.02, label: "At most 2% extra calls" },
      ],
      stars: [{ metric: "avgCalls", op: "<=", value: 1, label: "No retries needed at all" }],
      hints: [
        "How far do retries alone get you with prompt-only JSON, and what do they cost?",
        "Which methods have a much lower first-try failure rate?",
        "Combine a lower failure rate with at most one retry, or remove the failures at the source.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare getting JSON by prompting, by tool use with a schema, and by constrained decoding, and say what none of them guarantees.",
    rubric: [
      { id: "prompt", criterion: "Prompting for JSON is unreliable: extra prose or malformed output sometimes", keyIdea: "prompting is a request" },
      { id: "schema", criterion: "Tool use with a schema, and especially constrained decoding, makes the structure reliable or guaranteed", keyIdea: "schema and decoder enforce structure" },
      { id: "semantics", criterion: "Valid structure does not mean correct content, so validate and evaluate the values, and keep a retry or failure path", keyIdea: "structure is not truth" },
    ],
    exemplar:
      "Prompting for JSON is a request that sometimes comes back with extra prose or a malformed object. A tool call with a schema is much more reliable, and constrained decoding guarantees the output parses and matches the types by only allowing valid tokens. None of that guarantees the values are correct, so I validate the content, keep a retry or failure path, and evaluate accuracy separately.",
  },
  reviews: [
    {
      id: "so-est",
      format: "estimate",
      scenario: "A request fails 3% of the time, and you retry once on failure. What is the chance a request still ends invalid?",
      unit: "%",
      answer: 0.09,
      acceptFactor: 1.3,
      breakdown: ["0.03 × 0.03", "= 0.0009", "= 0.09%"],
      explain: "Independent failures multiply, so one retry squares the failure rate. It costs only 3% more calls.",
    },
    {
      id: "so-pick",
      format: "pick-fix",
      scenario: "A model returns valid JSON matching the schema, but the 'total' field is wrong in 4% of invoices. Which approach addresses it?",
      options: [
        { id: "a", label: "Evaluate the values against ground truth, add checks such as totals summing correctly, and improve the prompt or examples" },
        { id: "b", label: "Switch to constrained decoding; it guarantees correct values" },
        { id: "c", label: "Add more retries on parse failures" },
        { id: "d", label: "Ask for a longer JSON" },
      ],
      answer: "a",
      explain: "Schema enforcement guarantees shape, not truth. Content errors need validation rules and evals.",
    },
    {
      id: "so-order",
      format: "order",
      scenario: "Order these by how likely the first reply is to be invalid, most likely first.",
      items: [
        { id: "prompt", label: "JSON requested in the prompt" },
        { id: "json", label: "JSON mode" },
        { id: "tool", label: "Tool use with a schema" },
        { id: "strict", label: "Constrained decoding" },
      ],
      answer: ["prompt", "json", "tool", "strict"],
      explain: "Each step moves enforcement from a request toward the decoder. Constrained decoding cannot emit an invalid token.",
    },
    {
      id: "so-graph",
      format: "predict-graph",
      scenario: "A method fails 6% of the time on the first try. Add retries from 0 to 3. How does the share of requests that end invalid change?",
      xLabel: "retries →",
      yLabel: "requests ending invalid",
      options: [
        { id: "linear", label: "Falls by a fixed amount per retry", points: [8, 6, 4, 2, 0, 0, 0, 0] },
        { id: "decay", label: "Falls by a factor each time, quickly toward zero", points: [8, 0.5, 0.03, 0.002, 0.0001, 0, 0, 0] },
        { id: "flat", label: "Stays flat", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "decay",
      explain: "Each retry multiplies the failure rate by 6% again if attempts are independent, so the share ending invalid collapses geometrically.",
    },
    {
      id: "so-flaw",
      format: "spot-flaw",
      scenario: "The pipeline parses with json.loads on the raw model text and, on error, retries the exact same request up to 10 times at temperature 0. Errors persist for certain inputs. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "app", label: "app: retry up to 10×, identical request, temperature 0", kind: "server", col: 0, row: 1 },
          { id: "llm", label: "model · deterministic for this input", kind: "llm", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "llm" }],
      },
      answer: "app",
      explain: "At temperature 0 the same request tends to give the same bad output, so retries are not independent. Change something (use a schema, add the error to the prompt, or raise the temperature a little) and cap retries.",
    },
    {
      id: "so-explain",
      format: "explain",
      scenario: "In two sentences: why can constrained decoding guarantee valid JSON but not correct answers?",
      rubric: [
        { id: "mask", criterion: "The decoder only permits tokens that keep the output valid under the schema, so syntax and types cannot break" },
        { id: "semantics", criterion: "Within the allowed tokens the model still chooses the values, which can be wrong" },
      ],
      exemplar: "The decoder only allows tokens that keep the output valid under the schema, so it cannot produce malformed JSON or wrong types. Inside those limits the model still picks the actual values, and it can pick wrong ones.",
      explain: "Structure is enforced; meaning is not.",
    },
  ],
  codex: {
    oneLiner: "Prompted JSON is a request. Schemas and constrained decoding enforce structure, but not truth. Validate content and cap retries.",
    keyNumbers: [
      { label: "Retries with independent failures", value: "failure rate p becomes p^(r+1)", sourceId: "anthropic-consistency" },
      { label: "Constrained decoding", value: "only schema-valid tokens are allowed at each step", sourceId: "willard-2023" },
    ],
    tradeoffs: [
      { choice: "Tool use with a schema", gain: "Reliable structure with a standard API", cost: "Some schemas are awkward; content errors remain" },
      { choice: "Constrained decoding", gain: "Guaranteed parseable output", cost: "Provider or library support needed; may slightly limit fluency" },
      { choice: "Retries", gain: "Cheap backstop for rare failures", cost: "Extra calls; useless when failures are systematic" },
    ],
    seenIn: ["Pydantic models used as response schemas.", "Parse-error alarms on pipelines that consume model output."],
    interviewAngle: "Say 'schema' and 'validate': 'a JSON schema enforced by the API, validation of the values, and bounded retries, with failures logged.'",
    aws: [{ concept: "Structured output", service: "Amazon Bedrock Converse API tool use with a toolSpec JSON schema" }],
    replay: { id: "schema-lab", config: SCHEMA, scene: "strict" },
  },
  interview: [
    "How do you make an LLM return reliably parseable output?",
    "What are the limits of schema enforcement?",
    "How would you handle the rare invalid output?",
  ],
  deeper: [
    {
      title: "How constrained decoding works",
      body: "The schema is compiled into a state machine over tokens. At each generation step the decoder looks at which tokens are legal from the current state, masks out the rest before sampling, and advances the state with the chosen token. The cost is the compile step and the mask on each step; the benefit is that the output is valid by construction.",
      sourceIds: ["willard-2023"],
    },
  ],
  honestPhysics: [
    "Invalid-output rates are illustrative: 6% for JSON requested in the prompt, 3% for JSON mode, 1% for tool use with a schema, and 0 for constrained decoding. Real rates depend on the model and schema.",
    "Retries are assumed independent. At temperature 0 they often are not, which makes retries less effective.",
  ],
  sources: [ANTHROPIC_TOOLS, ANTHROPIC_CONSISTENCY, WILLARD, JSONSCHEMA],
  verify: [
    { id: "base", claim: "Prompted JSON fails 6% of the time", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: {}, metric: "failRate" }, expect: { min: 0.06, max: 0.06 } },
    { id: "prompt-retries", claim: "Prompted JSON with retries costs more than 2% extra", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: { method: "prompt", retries: 2 }, metric: "avgCalls" }, expect: { min: 1.02 } },
    { id: "tool-retry", claim: "Tool use with one retry meets the failure target", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: { method: "tool", retries: 1 }, metric: "failRate" }, expect: { max: 0.001 } },
    { id: "tool-calls", claim: "…with about 1% extra calls", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: { method: "tool", retries: 1 }, metric: "avgCalls" }, expect: { max: 1.02 } },
    { id: "strict", claim: "Constrained decoding needs no retries", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: { method: "strict", retries: 0 }, metric: "failRate" }, expect: { max: 0 } },
    { id: "json-mode", claim: "JSON mode with two retries exceeds the call budget", run: "lab", params: { model: "schema-lab", config: SCHEMA, values: { method: "json", retries: 2 }, metric: "avgCalls" }, expect: { min: 1.02 } },
  ],
});
