import { definePack } from "../define";

export const SYS = {};

const ANTHROPIC_SYS = { id: "anthropic-system-prompts", title: "Anthropic docs: Giving Claude a role with a system prompt", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts" };
const ANTHROPIC_OVERVIEW = { id: "anthropic-prompting", title: "Anthropic docs: Prompt engineering overview (be clear and direct, success criteria, evals)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" };
const BROWN = { id: "brown-2020", title: "T. Brown et al. (2020), Language Models are Few-Shot Learners, NeurIPS", url: "https://arxiv.org/abs/2005.14165" };

export default definePack({
  id: "system-prompts",
  title: "System Prompts",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Copilot QA · 200 sampled replies", detail: "41 broke at least one rule" },
    lines: [
      { speaker: "kabir", line: "Copilot sometimes answers in prose when our app needs JSON, and once promised a customer a refund. The prompt just says 'be a helpful assistant'." },
      { speaker: "meera", line: "A rule the prompt never mentions is a rule the model follows by accident. Write down what you need, and check it." },
    ],
  },
  predictions: [
    {
      id: "five-rules",
      kind: "choice",
      prompt: "The prompt states five rules, each of which the model follows 90% of the time when it is told about it. What share of replies follows all five?",
      options: [
        { id: "ninety", label: "About 90%" },
        { id: "eighty", label: "About 80%" },
        { id: "sixty", label: "About 60%" },
        { id: "forty", label: "About 40%" },
      ],
      answer: "sixty",
      observe: "stated",
      reveal: {
        text: "Each rule is a separate chance to fail. 0.9 to the fifth power is 59%, so four in ten replies break something. Examples raise each rule's rate, which is why they are worth their tokens.",
        derived: true,
        line: { speaker: "meera", line: "Reliability multiplies. Five good rules is a mediocre system." },
      },
    },
  ],
  widget: { id: "prompt-lab", config: SYS },
  mechanism: [
    {
      id: "role",
      scene: "silent",
      text: "The system prompt is the standing instruction: who the model is, what it is for, and the rules every reply must follow. It is sent on every request and gets read before the user's message, so it is the place for what must always be true.",
      sourceIds: ["anthropic-system-prompts"],
    },
    {
      id: "explicit",
      scene: "stated",
      text: "Be explicit and specific. A rule the prompt never mentions is followed by luck; a stated rule is followed far more often. State the format, the scope, the limits, and the tone as separate, checkable requirements, and write down what success looks like before you tune.",
      sourceIds: ["anthropic-prompting"],
    },
    {
      id: "examples",
      scene: "example",
      text: "Show, do not only tell. One or two short examples of the exact output you want raise how often the model follows a rule, especially for formats and tone. GPT-3's paper showed that a few examples in the prompt can teach a task without any training.",
      sourceIds: ["brown-2020", "anthropic-prompting"],
    },
    {
      id: "budget",
      text: "Every instruction costs tokens on every request, and the rates multiply across rules. So spend them where the failures are: measure which rules break on a test set, and add words or examples for those, not for rules the model already follows.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "reliable-prompt",
      title: "Write the prompt that holds",
      brief: "Copilot has five rules to follow on every reply. Choose how each is expressed so at least 75% of replies follow all five, keeping the added prompt under 280 tokens, because that cost is paid on every request.",
      line: { speaker: "rao", line: "Every token is on every call. Spend them where they change the outcome." },
      widget: { id: "prompt-lab", config: SYS },
      conditions: [
        { metric: "passAll", op: ">=", value: 0.75, label: "At least 75% of replies follow all rules" },
        { metric: "tokens", op: "<=", value: 280, label: "At most 280 prompt tokens added" },
      ],
      stars: [{ metric: "passAll", op: ">=", value: 0.76, label: "At least 76% follow all rules" }],
      hints: [
        "What happens to the pass rate if rules are only stated?",
        "Which choice raises a rule's rate the most, and what does it cost in tokens?",
        "You cannot afford an example for every rule. Which can stay stated only?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how you would write and improve a system prompt for a production assistant.",
    rubric: [
      { id: "explicit", criterion: "Specify the role and each requirement explicitly and separately: format, scope, limits, tone", keyIdea: "explicit requirements" },
      { id: "examples", criterion: "Use short examples for formats and tone that must be exact", keyIdea: "show with examples" },
      { id: "measure", criterion: "Measure pass rates per rule on a test set and spend tokens on the rules that fail, since rates multiply and tokens cost on every call", keyIdea: "measure, then spend tokens" },
    ],
    exemplar:
      "I write the role and each requirement as its own explicit rule: the format the app parses, what is out of scope, length limits, and tone. For rules that must be exact I add a short example. Because the pass rates multiply across rules and every token is paid on every request, I measure which rules fail on a test set and add words or examples only for those.",
  },
  reviews: [
    {
      id: "sp-est",
      format: "estimate",
      scenario: "A prompt states four rules, and the model follows each stated rule 95% of the time, independently. What percentage of replies follows all four?",
      unit: "%",
      answer: 81,
      acceptFactor: 1.1,
      breakdown: ["0.95 × 0.95 × 0.95 × 0.95", "= 0.8145", "≈ 81%"],
      explain: "Four 95% rules give an 81% system. The more rules, the more each one's reliability matters.",
    },
    {
      id: "sp-pick",
      format: "pick-fix",
      scenario: "The app parses the model's reply as JSON, but about one reply in ten arrives as prose. The system prompt says 'Please respond in JSON.' What is the strongest improvement?",
      options: [
        { id: "a", label: "State the exact schema and include one example of a correct reply, and use a structured-output feature where available" },
        { id: "b", label: "Say 'IMPORTANT' in capital letters three times" },
        { id: "c", label: "Raise the temperature" },
        { id: "d", label: "Lengthen the prompt with background about the company" },
      ],
      answer: "a",
      explain: "A precise schema and an example remove ambiguity, and a structured-output mode enforces the format. Shouting and background do not change what the model can parse.",
    },
    {
      id: "sp-pick2",
      format: "pick-fix",
      scenario: "Your system prompt has grown to 4,000 tokens of rules added after each incident, and replies have become slower and more expensive, with some rules contradicting each other. What do you do?",
      options: [
        { id: "a", label: "Audit with an eval set: remove rules that never fail or conflict, and test the shorter prompt" },
        { id: "b", label: "Keep adding rules" },
        { id: "c", label: "Move all rules to the user message" },
        { id: "d", label: "Switch to a smaller model" },
      ],
      answer: "a",
      explain: "Prompts accrete rules. Conflicting or unnecessary ones cost tokens and can hurt compliance, so prune with evidence from a test set.",
    },
    {
      id: "sp-order",
      format: "order",
      scenario: "Order these ways to specify a rule by how reliably the model follows it, most reliably first.",
      items: [
        { id: "ex", label: "Stated with a short example" },
        { id: "stated", label: "Stated clearly" },
        { id: "vague", label: "Hinted at vaguely ('be careful')" },
        { id: "none", label: "Not mentioned" },
      ],
      answer: ["ex", "stated", "vague", "none"],
      explain: "Each step adds clarity. A rule the model is never told is followed only when it would have done it anyway.",
    },
    {
      id: "sp-flaw",
      format: "spot-flaw",
      scenario: "The system prompt says both 'Always answer in one sentence' and 'Always explain your reasoning step by step.' Replies are inconsistent. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "sys", label: "system prompt: 'one sentence' and 'explain step by step'", kind: "llm", col: 0, row: 1 },
          { id: "out", label: "replies: sometimes short, sometimes long", kind: "client", col: 1, row: 1 },
        ],
        edges: [{ from: "sys", to: "out" }],
      },
      answer: "sys",
      explain: "Two instructions that cannot both be satisfied leave the model to pick one at random. Resolve the conflict in the prompt: say which wins, or when each applies.",
    },
    {
      id: "sp-explain",
      format: "explain",
      scenario: "In two sentences: why does adding more rules to a prompt not guarantee better compliance?",
      rubric: [
        { id: "multiply", criterion: "Each rule is another chance to fail, so overall compliance is the product of the rates" },
        { id: "conflict", criterion: "More rules cost tokens and can conflict or dilute attention, so each addition needs evidence it helps" },
      ],
      exemplar: "Each rule is another chance to be broken, so the chance of following all of them is the product of the individual rates. More rules also add tokens and can conflict, so each one should earn its place on a test set.",
      explain: "Prompts are tested, not hoped.",
    },
  ],
  codex: {
    oneLiner: "A system prompt sets standing rules. State each requirement explicitly, add a short example where it must be exact, and measure per-rule compliance.",
    keyNumbers: [
      { label: "Compliance with n independent rules", value: "p^n (five 90% rules give 59%)", sourceId: "anthropic-prompting" },
      { label: "Few-shot prompting", value: "examples in the prompt can teach a task", sourceId: "brown-2020" },
    ],
    tradeoffs: [
      { choice: "More explicit rules", gain: "Higher compliance on each rule", cost: "More tokens on every call; possible conflicts" },
      { choice: "Examples", gain: "Strong effect on format and tone", cost: "More tokens; the model may copy the example too closely" },
    ],
    seenIn: ["Product prompts with sections for role, rules, and format.", "QA reports of replies that break one rule in ten."],
    interviewAngle: "Talk about measuring: 'I list the requirements, write checks for each, and see which rule fails before changing the prompt.'",
    aws: [{ concept: "System prompt", service: "Amazon Bedrock Converse API 'system' field" }],
    replay: { id: "prompt-lab", config: SYS, scene: "stated" },
  },
  interview: [
    "How do you structure a system prompt for a production assistant?",
    "A rule in your prompt is ignored 10% of the time. What do you try?",
    "Why can long prompts perform worse than short ones?",
  ],
  deeper: [
    {
      title: "System versus user messages",
      body: "The system prompt carries the stable behaviour of the product, and the user message carries the changing request. Putting standing rules in the system prompt keeps them in a cacheable prefix that is the same on every call, which also makes them cheaper, as a later lesson shows.",
      sourceIds: ["anthropic-system-prompts"],
    },
  ],
  honestPhysics: [
    "Pass rates are illustrative: 55% for an unmentioned rule, 90% stated, 96% stated with an example. Real rates depend on the model and the rule, and are measured with evals.",
    "Rates are treated as independent across rules. In practice failures correlate, and some rules interfere with others.",
    "Stating a rule costs about 25 tokens and an example about 60 more.",
  ],
  sources: [ANTHROPIC_SYS, ANTHROPIC_OVERVIEW, BROWN],
  verify: [
    { id: "silent", claim: "With no rules stated almost every reply breaks one", run: "lab", params: { model: "prompt-lab", config: SYS, values: {}, metric: "passAll" }, expect: { max: 0.1 } },
    { id: "stated", claim: "Stating all five rules gets about 59%", run: "lab", params: { model: "prompt-lab", config: SYS, values: { json: "stated", scope: "stated", short: "stated", refund: "stated", tone: "stated" }, metric: "passAll" }, expect: { min: 0.58, max: 0.6 } },
    { id: "all-ex", claim: "Examples for all five exceed the token budget", run: "lab", params: { model: "prompt-lab", config: SYS, values: { json: "example", scope: "example", short: "example", refund: "example", tone: "example" }, metric: "tokens" }, expect: { min: 281 } },
    { id: "win", claim: "Four examples and one stated rule clear 75% under 280 tokens", run: "lab", params: { model: "prompt-lab", config: SYS, values: { json: "example", scope: "example", short: "stated", refund: "example", tone: "example" }, metric: "passAll" }, expect: { min: 0.75 } },
    { id: "win-tokens", claim: "…at 265 tokens", run: "lab", params: { model: "prompt-lab", config: SYS, values: { json: "example", scope: "example", short: "stated", refund: "example", tone: "example" }, metric: "tokens" }, expect: { max: 280 } },
  ],
});
