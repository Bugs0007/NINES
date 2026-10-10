import { definePack } from "../define";

export const STRUCT = { docTokens: 8000, lockDocs: true };

const XML = { id: "anthropic-xml-tags", title: "Anthropic docs: Use XML tags to structure your prompts", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags" };
const LONGCTX = { id: "anthropic-long-context", title: "Anthropic docs: Long context prompting tips (put long documents first, queries last)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips" };
const MULTISHOT = { id: "anthropic-multishot", title: "Anthropic docs: Use examples (multishot prompting)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting" };
const LIU = { id: "liu-2023", title: "N. Liu et al. (2023), Lost in the Middle: How Language Models Use Long Contexts, TACL", url: "https://arxiv.org/abs/2307.03172" };

export default definePack({
  id: "prompt-structure",
  title: "Prompt Structure: Examples, Tags, Order",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "info", title: "Contract Q&A · eval run 14", detail: "accuracy 62% with the same documents and a new layout" },
    lines: [
      { speaker: "kabir", line: "Same model and same contract, and moving the question to the top changed accuracy by several points. Why would order matter?" },
      { speaker: "meera", line: "The model reads left to right, and long contexts are not read evenly. Where things sit, and how they are marked, is part of the prompt." },
    ],
  },
  predictions: [
    {
      id: "examples",
      kind: "choice",
      prompt: "Adding worked examples to a prompt raises accuracy. In the lab, going from zero to three examples helps a lot. What does going from three to eight add?",
      options: [
        { id: "same", label: "Another jump as large as the first three" },
        { id: "half", label: "About half as much again" },
        { id: "little", label: "Only a few points: returns diminish quickly" },
        { id: "worse", label: "It lowers accuracy" },
      ],
      answer: "little",
      observe: "examples-added",
      reveal: {
        text: "The first examples teach the task and format, and later ones mostly repeat them. In the lab three examples add 23 points and examples four through eight add about 7 more, while costing 750 extra tokens on every call.",
        derived: true,
        line: { speaker: "meera", line: "Show it enough times to be sure. Not so many times that you pay per request for the repeats." },
      },
    },
  ],
  widget: { id: "structure-lab", config: STRUCT },
  mechanism: [
    {
      id: "examples",
      scene: "examples",
      text: "Worked examples teach the model the task and the exact output shape. The first one or two matter most; each further example adds less while costing its full tokens on every request. Choose varied, representative examples, and test how many you actually need.",
      sourceIds: ["anthropic-multishot"],
    },
    {
      id: "order",
      scene: "order",
      text: "Put long documents at the top and the question at the end. Models use the beginning and end of a long context better than the middle, and ending with the question keeps it fresh when the model starts answering. Anthropic's guidance reports clear gains for queries placed last.",
      sourceIds: ["anthropic-long-context", "liu-2023"],
    },
    {
      id: "tags",
      scene: "tags",
      text: "Mark the parts. XML-style tags such as <documents>, <examples>, and <question> tell the model where one section ends and the next begins, which prevents instructions, data, and examples from blurring together and makes multi-document prompts easier to reference.",
      sourceIds: ["anthropic-xml-tags"],
    },
    {
      id: "test",
      text: "Treat layout as something you test. Gains of a few points from order or tags are real but model-dependent, and they cost almost nothing. Change one thing at a time against an eval set and keep what helps.",
    },
  ],
  challenges: [
    {
      id: "layout",
      title: "Lay out the contract prompt",
      brief: "Contract Q&A sends 8,000 tokens of documents per request. Choose the number of examples and the layout so accuracy reaches 90%, while each request's prompt cost stays at or under 1.75 cents.",
      line: { speaker: "rao", line: "Each extra example is paid on every question. Give me the smallest prompt that clears ninety." },
      widget: { id: "structure-lab", config: STRUCT },
      conditions: [
        { metric: "accuracy", op: ">=", value: 0.9, label: "Accuracy at least 90%" },
        { metric: "costPerRequest", op: "<=", value: 0.0175, label: "Prompt cost at most $0.0175 per request" },
      ],
      stars: [{ metric: "accuracy", op: ">=", value: 0.92, label: "Accuracy at least 92%" }],
      hints: [
        "How far do examples alone get you, and what does each cost?",
        "Which layout changes cost almost nothing in tokens?",
        "Combine a few examples with the free layout improvements.",
      ],
    },
  ],
  explainBack: {
    prompt: "How do you structure a prompt that includes long documents, examples, and a question?",
    rubric: [
      { id: "order", criterion: "Put long documents first and the question last, since models use the start and end of long contexts better than the middle", keyIdea: "documents first, question last" },
      { id: "tags", criterion: "Mark sections with tags so instructions, documents, and examples stay distinct", keyIdea: "tags separate parts" },
      { id: "examples", criterion: "Use a few varied examples, noting diminishing returns and that they cost tokens on every call", keyIdea: "a few examples, diminishing returns" },
    ],
    exemplar:
      "I put the long documents at the top and the question at the end, because models read the start and end of a long context better than the middle. I wrap the parts in tags such as documents, examples, and question so they cannot blur together. And I add a few varied examples, since the first ones help most and each extra one costs tokens on every request.",
  },
  reviews: [
    {
      id: "ps-est",
      format: "estimate",
      scenario: "Each worked example is about 150 tokens, and you add 6 of them to a prompt sent 100,000 times a day at $2 per million input tokens. About how many dollars a day do the examples cost?",
      unit: "$",
      answer: 180,
      acceptFactor: 1.15,
      breakdown: ["6 × 150 = 900 tokens per request", "× 100,000 = 90 million tokens a day", "× $2 per million = $180"],
      explain: "Examples scale with traffic. A prompt tweak that looks free in a notebook costs real money at volume.",
    },
    {
      id: "ps-pick",
      format: "pick-fix",
      scenario: "A prompt puts a 30,000-token set of documents between the instructions and the question, and the model sometimes ignores facts from the middle of the documents. What is the best structural fix?",
      options: [
        { id: "a", label: "Put the documents first in tagged blocks, the instructions after, and the question last" },
        { id: "b", label: "Repeat the instructions ten times" },
        { id: "c", label: "Raise the temperature" },
        { id: "d", label: "Shorten the question" },
      ],
      answer: "a",
      explain: "Order and structure are cheap levers for long contexts. Stronger techniques include quoting relevant passages first, or retrieving only what is needed.",
    },
    {
      id: "ps-order",
      format: "order",
      scenario: "Order these layouts by expected accuracy on a long-document question, best first.",
      items: [
        { id: "full", label: "Documents first in tags, examples, question last" },
        { id: "docs", label: "Documents first, question last, no tags" },
        { id: "mid", label: "Question first, then documents" },
        { id: "bare", label: "Everything mixed in one paragraph, no examples" },
      ],
      answer: ["full", "docs", "mid", "bare"],
      explain: "Each structural step adds a little, and they stack. Mixing everything together is the weakest.",
    },
    {
      id: "ps-graph",
      format: "predict-graph",
      scenario: "Add worked examples one at a time, from 0 to 8. How does accuracy change?",
      xLabel: "examples →",
      yLabel: "accuracy",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises quickly, then flattens", points: [1, 4, 5.5, 6.3, 6.8, 7, 7.1, 7.2] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "peak", label: "Rises, then falls", points: [1, 3, 5, 6, 6, 5.5, 5, 4.5] },
      ],
      answer: "sat",
      explain: "The first examples define the task; later ones add less. Past a point, extra examples only add tokens (and sometimes confuse the model).",
    },
    {
      id: "ps-flaw",
      format: "spot-flaw",
      scenario: "A prompt puts the user's question, then the instructions, then three documents pasted back to back with no separators. The model sometimes treats text inside a document as an instruction. Tap what is missing.",
      diagram: {
        nodes: [
          { id: "prompt", label: "question + instructions + 3 documents, no tags or order", kind: "llm", col: 0, row: 1 },
          { id: "reply", label: "reply follows a command found inside a document", kind: "client", col: 1, row: 1 },
        ],
        edges: [{ from: "prompt", to: "reply" }],
      },
      answer: "prompt",
      explain: "Without tags the model cannot tell data from instructions. Wrapping each document in tags, and telling the model that tagged text is data, keeps them apart. It also helps against injected instructions.",
    },
    {
      id: "ps-explain",
      format: "explain",
      scenario: "In two sentences: why put the question at the end of a long prompt?",
      rubric: [
        { id: "recency", criterion: "Models attend better to the end of the context, so the question is fresh when generation begins" },
        { id: "middle", criterion: "Long contexts are used unevenly and information in the middle can be missed, so the question should not be buried" },
      ],
      exemplar: "Models use the beginning and end of a long context better than the middle, and ending with the question keeps it fresh as the answer starts. Burying it before many thousands of tokens of documents makes it easier to miss.",
      explain: "Put what the model must act on where it will see it.",
    },
  ],
  codex: {
    oneLiner: "Structure is part of the prompt: documents first, question last, tags to separate parts, and a few examples, with diminishing returns.",
    keyNumbers: [
      { label: "Examples", value: "first few help most; each costs tokens per request", sourceId: "anthropic-multishot" },
      { label: "Long-context layout", value: "documents at the top, query at the end", sourceId: "anthropic-long-context" },
      { label: "Middle of a long context", value: "used less reliably than start and end", sourceId: "liu-2023" },
    ],
    tradeoffs: [
      { choice: "More examples", gain: "Better format and task adherence", cost: "Tokens on every request; diminishing returns" },
      { choice: "Tags", gain: "Clear boundaries; less confusion between data and instructions", cost: "A few tokens" },
      { choice: "Documents first", gain: "Better recall on the question", cost: "None, but test it on your model" },
    ],
    seenIn: ["Prompts with <documents> and <question> sections.", "Eval comparisons of prompt layouts."],
    interviewAngle: "Mention three cheap levers: 'order, tags, and a couple of examples, each tested on an eval set.'",
    aws: [{ concept: "Prompt layout", service: "Amazon Bedrock Prompt Management (versions of structured prompts)" }],
    replay: { id: "structure-lab", config: STRUCT, scene: "order" },
  },
  interview: [
    "How would you lay out a prompt with several long documents and one question?",
    "How many examples should a prompt include?",
    "Why do XML tags help?",
  ],
  deeper: [
    {
      title: "Lost in the middle",
      body: "When Liu and colleagues placed the relevant passage at different positions in a long context, accuracy was highest when it sat at the start or end and dropped when it sat in the middle. Newer models do better, but the effect has not vanished, which is one reason to retrieve only what is relevant instead of stuffing the whole corpus into the window.",
      sourceIds: ["liu-2023"],
    },
  ],
  honestPhysics: [
    "Accuracy is an illustrative curve: 62% baseline, rising with examples (diminishing), plus 4 points for documents first and 3 points for tags. Real gains differ by model and task and must be measured.",
    "Each example costs about 150 tokens, and the cost uses the reference large-model input price of $2 per million tokens.",
  ],
  sources: [XML, LONGCTX, MULTISHOT, LIU],
  verify: [
    { id: "bare", claim: "A bare prompt on 8,000 tokens of documents is 62% accurate", run: "lab", params: { model: "structure-lab", config: STRUCT, values: {}, metric: "accuracy" }, expect: { min: 0.61, max: 0.63 } },
    { id: "examples-only", claim: "Three examples alone are below 90%", run: "lab", params: { model: "structure-lab", config: STRUCT, values: { examples: 3 }, metric: "accuracy" }, expect: { max: 0.9 } },
    { id: "win", claim: "Three examples with documents first and tags reach 90%", run: "lab", params: { model: "structure-lab", config: STRUCT, values: { examples: 3, docsFirst: true, tags: true }, metric: "accuracy" }, expect: { min: 0.9 } },
    { id: "win-cost", claim: "…for under 1.75 cents a request", run: "lab", params: { model: "structure-lab", config: STRUCT, values: { examples: 3, docsFirst: true, tags: true }, metric: "costPerRequest" }, expect: { max: 0.0175 } },
    { id: "late-examples", claim: "Examples four to eight add under 10 points", run: "lab", params: { model: "structure-lab", config: STRUCT, values: { examples: 8 }, metric: "accuracy" }, expect: { max: 0.95 } },
  ],
});
