import { definePack } from "../define";

export const PI = { start: { detector: "ner", prompt: true, logs: true, reversible: true, retention: 30 } };
export const PI_CHALLENGE = { start: { detector: "none", prompt: false, logs: false, reversible: false, retention: 365 } };

const PRESIDIO = { id: "presidio", title: "Microsoft Presidio: PII detection and anonymization (recognizers, NER, anonymizers)", url: "https://microsoft.github.io/presidio/" };
const NIST_PII = { id: "nist-800-122", title: "NIST SP 800-122: Guide to protecting the confidentiality of personally identifiable information", url: "https://csrc.nist.gov/pubs/sp/800/122/final" };
const GDPR_MIN = { id: "gdpr-minimisation", title: "GDPR Article 5: principles including data minimisation and storage limitation", url: "https://gdpr-info.eu/art-5-gdpr/" };

export default definePack({
  id: "pii-handling",
  title: "PII Handling",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "security review · 14 months of prompts in the log index", detail: "includes emails, phone numbers and account IDs" },
    lines: [
      { speaker: "kabir", line: "Our debug logging records every prompt. Security found customer emails and ID numbers in fourteen months of it, and a third-party provider has seen all of it." },
      { speaker: "meera", line: "Personal data you never send and never store cannot leak. The cheapest control is to remove it early, then keep little for a short time." },
    ],
  },
  predictions: [
    {
      id: "exposure",
      kind: "choice",
      prompt: "Each request carries 1.2 pieces of personal data. With no redaction and logs kept 365 days, how much exposure sits in your logs per 1,000 requests, in item-months (items stored times months kept)?",
      options: [
        { id: "1200", label: "About 1,200" },
        { id: "14600", label: "About 14,600" },
        { id: "146000", label: "About 146,000" },
      ],
      answer: "14600",
      observe: "leaky-logs",
      reveal: {
        text: "1.2 items × 1,000 requests is 1,200 items, each kept 12.2 months: about 14,600 item-months. Halving retention halves the exposure without touching a line of code, and redaction cuts it by the share of items it finds.",
        derived: true,
        line: { speaker: "rao", line: "Retention is a dial. Most teams never turn it." },
      },
    },
    {
      id: "placeholders",
      kind: "choice",
      prompt: "You redact before the prompt with a named-entity model, replacing values with placeholders, and do not restore them in the reply. What share of answers is still useful?",
      options: [
        { id: "98", label: "About 98%" },
        { id: "85", label: "About 85%" },
        { id: "60", label: "About 60%" },
      ],
      answer: "85",
      observe: "broken-answers",
      reveal: {
        text: "The model sees [EMAIL_1] instead of the address, so a reply that must say it contains the placeholder: 12% of answers in the lab, plus 3% from harmless text wrongly redacted. Restoring placeholders in the response, from a mapping kept on your side, brings it back to 97%.",
        derived: true,
        line: { speaker: "meera", line: "Redact with a way back, or the answer arrives with a hole in it." },
      },
    },
  ],
  widget: { id: "pii-lab", config: PI },
  mechanism: [
    {
      id: "why",
      text: "Prompts routinely carry personal data: names, emails, phone numbers, account and ID numbers. That data goes to the model provider and into your logs, traces, caches and evaluation sets. Each copy is a liability, a compliance obligation and a breach waiting to happen. Minimising what you send and keep is the first control.",
      sourceIds: ["nist-800-122", "gdpr-minimisation"],
    },
    {
      id: "detect",
      scene: "ner",
      text: "Detection comes in tiers. Patterns find well-formed values like emails and card numbers. Named-entity models find names, places and addresses in free text. An LLM check catches more, at higher cost and with more harmless text wrongly redacted. No detector is perfect, so measure recall on your own data and treat redaction as reducing exposure, not eliminating it.",
      sourceIds: ["presidio"],
    },
    {
      id: "placeholders",
      scene: "reversible",
      text: "Replace each value with a stable placeholder, such as [EMAIL_1], and keep the mapping on your side. The model can still reason about it, and you substitute the real values back into the reply for the user. Without that last step, answers arrive with placeholders where the user needed the value.",
      sourceIds: ["presidio"],
    },
    {
      id: "retention",
      scene: "retention",
      text: "Where redaction is not possible, limit what you keep. Set short retention on logs and traces, restrict who can read them, and delete on request. Redact before the prompt leaves your system, which also keeps the data out of logs written afterwards. Redacting only in logs leaves the provider seeing everything.",
      sourceIds: ["gdpr-minimisation", "nist-800-122"],
    },
  ],
  challenges: [
    {
      id: "pii-plan",
      title: "Set the PII handling",
      brief: "Send at most 100 pieces of personal data to the provider per 1,000 requests, keep answers at least 95% useful, and hold log exposure to 150 item-months per 1,000 requests or less.",
      line: { speaker: "rao", line: "Strip it early, keep the answers useful, and don't hold on to anything." },
      widget: { id: "pii-lab", config: PI_CHALLENGE },
      conditions: [
        { metric: "promptLeak", op: "<=", value: 100, label: "At most 100 items sent per 1,000 requests" },
        { metric: "utility", op: ">=", value: 0.95, label: "Answers at least 95% useful" },
        { metric: "exposure", op: "<=", value: 150, label: "Log exposure at most 150 item-months" },
      ],
      stars: [],
      hints: ["Which detector finds names as well as emails?", "What do placeholders cost the answer?", "How long do the logs need to be kept?"],
    },
  ],
  explainBack: {
    prompt: "Explain how you would handle personal data in an LLM application.",
    rubric: [
      { id: "early", criterion: "Detect and redact before the prompt leaves your system, which also keeps the data out of logs and traces", keyIdea: "redact early" },
      { id: "tier", criterion: "Choose the detector by recall on your data (patterns, named-entity models, LLM checks) and know none is perfect", keyIdea: "detectors are imperfect" },
      { id: "keep", criterion: "Use reversible placeholders so answers stay useful, and keep little for a short time", keyIdea: "placeholders and retention" },
    ],
    exemplar:
      "I would detect and redact personal data before the prompt leaves my system, which also keeps it out of logs and traces written afterwards. I would choose the detector by its recall on my own data, knowing patterns miss free-text names and no detector is perfect. I would use stable placeholders with the mapping kept on my side so replies can be restored, and set short retention on whatever is stored.",
  },
  reviews: [
    {
      id: "pi-est",
      format: "estimate",
      scenario: "Each request carries 1.2 pieces of personal data and a pattern detector misses 33% of them. How many pieces reach the provider per 1,000 requests?",
      unit: "items",
      answer: 391,
      acceptFactor: 1.05,
      breakdown: ["miss = 70% × 8% + 30% × 90% = 32.6%", "1.2 × 1,000 × 32.6% = 391"],
      explain: "Patterns find emails but not names. The free-text share is what slips through.",
    },
    {
      id: "pi-pick",
      format: "pick-fix",
      scenario: "A team redacts personal data in the logs only, and the provider receives prompts with names and emails. What should change?",
      options: [
        { id: "a", label: "Redact before the prompt leaves your system, so the provider and the logs both see placeholders" },
        { id: "b", label: "Delete the logs sooner" },
        { id: "c", label: "Encrypt the logs" },
        { id: "d", label: "Trust the provider's policy" },
      ],
      answer: "a",
      explain: "The earlier the redaction, the more copies of the data you never create.",
    },
    {
      id: "pi-order",
      format: "order",
      scenario: "Order these detectors by personal data sent to the provider per 1,000 requests, most first (all redacting before the prompt).",
      items: [
        { id: "none", label: "No detector" },
        { id: "regex", label: "Pattern matching" },
        { id: "ner", label: "Named-entity model" },
        { id: "llm", label: "Named-entity model plus an LLM check" },
      ],
      answer: ["none", "regex", "ner", "llm"],
      explain: "1,200, 391, 90 and 34 pieces per 1,000 requests.",
    },
    {
      id: "pi-graph",
      format: "predict-graph",
      scenario: "With no redaction, how does log exposure (item-months per 1,000 requests) change with retention from 7 to 365 days?",
      xLabel: "retention days →",
      yLabel: "exposure",
      options: [
        { id: "linear", label: "Grows in proportion to retention", points: [280, 1000, 2000, 3500, 5500, 8000, 11000, 14600] },
        { id: "flat", label: "Stays level", points: [7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000] },
        { id: "log", label: "Rises fast then levels off", points: [8000, 12000, 13500, 14200, 14400, 14500, 14600, 14600] },
      ],
      answer: "linear",
      explain: "Items stored times time kept. Halving retention halves exposure.",
    },
    {
      id: "pi-flaw",
      format: "spot-flaw",
      scenario: "A pipeline stores raw prompts in the evaluation set so engineers can replay failures, with the redaction step run only on what is shown in the dashboard. Tap the problem.",
      diagram: {
        nodes: [
          { id: "app", label: "assistant", kind: "server", col: 0, row: 1 },
          { id: "eval", label: "evaluation set: raw prompts", kind: "store", col: 1, row: 1 },
          { id: "dash", label: "dashboard (redacted view)", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "app", to: "eval" },
          { from: "eval", to: "dash" },
        ],
      },
      answer: "app->eval",
      explain: "The raw data is still stored, copied into a new place that the redaction does not protect. Redact on the way in.",
    },
    {
      id: "pi-explain",
      format: "explain",
      scenario: "In two sentences: why use stable placeholders instead of removing personal data entirely?",
      rubric: [
        { id: "meaning", criterion: "The model still sees that there is an email or a name and can reason about the structure, so the answer stays coherent" },
        { id: "restore", criterion: "Because the mapping is kept on your side, real values can be substituted back into the reply for the user" },
      ],
      exemplar: "The model still sees that there is an email or a name in a given place and can reason about it, so the answer stays coherent. Because the mapping stays on your side, the real values can be substituted back into the reply for the user.",
      explain: "Redact with a way back.",
    },
  ],
  codex: {
    oneLiner: "Redact personal data before it leaves your system, with reversible placeholders, a detector chosen by recall, and short retention on whatever you store.",
    keyNumbers: [
      { label: "Pattern matching misses (lab)", value: "about a third of items", sourceId: "presidio" },
      { label: "No redaction, one year of logs (lab)", value: "14,600 item-months per 1,000 requests", sourceId: "gdpr-minimisation" },
    ],
    tradeoffs: [
      { choice: "Stronger detector", gain: "Fewer leaks", cost: "More harmless text redacted; cost and latency" },
      { choice: "Placeholders without restore", gain: "Simple", cost: "Answers with holes in them" },
      { choice: "Long retention", gain: "Easier debugging", cost: "Exposure grows with time" },
    ],
    seenIn: ["Presidio and cloud DLP services.", "Gateway-level redaction and zero-retention provider settings."],
    interviewAngle: "Say: 'minimise what you send and keep: detect early, placeholders with a restore step, short retention, and measure recall on real data'.",
    aws: [{ concept: "PII detection", service: "Amazon Comprehend PII; Bedrock Guardrails sensitive-information filters" }],
    replay: { id: "pii-lab", config: PI, scene: "reversible" },
  },
  interview: [
    "How do you keep personal data out of an LLM provider and your logs?",
    "What are the limits of PII detection?",
    "How long should you retain prompts?",
  ],
  deeper: [
    {
      title: "Provider settings are part of the design",
      body: "Check what the provider does with your requests: whether they are retained, for how long, whether they are used for training, and where they are processed. Zero-retention agreements, regional endpoints and enterprise terms change the picture. Put these in the design review next to the redaction, not after it.",
      sourceIds: ["nist-800-122"],
    },
  ],
  honestPhysics: [
    "Each request carries 1.2 pieces of personal data. 70% are structured (emails, phone and ID numbers) and 30% unstructured (names, addresses). Pattern matching finds 92% of structured and 10% of unstructured; a named-entity model 97% and 82%; adding an LLM check 99% and 93%. Each step wrongly redacts more harmless text (0.2%, 1%, 2% of requests).",
    "Without restoring placeholders, 12% of answers contain one where the user needed the value. Exposure is items left in logs times retention in months, per 1,000 requests. Round figures.",
  ],
  sources: [PRESIDIO, NIST_PII, GDPR_MIN],
  verify: [
    { id: "exposure", claim: "No redaction and a year of logs is 14,600 item-months per 1,000 requests", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: {}, metric: "exposure" }, expect: { min: 14500, max: 14700 } },
    { id: "regex", claim: "Pattern matching still sends 391 items per 1,000 requests", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "regex", prompt: true, logs: true }, metric: "promptLeak" }, expect: { min: 385, max: 395 } },
    { id: "ner-leak", claim: "A named-entity model sends 90 per 1,000", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "ner", prompt: true, logs: true, reversible: true, retention: 30 }, metric: "promptLeak" }, expect: { min: 88, max: 92 } },
    { id: "no-restore", claim: "Without restoring placeholders only 85% of answers are useful", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "ner", prompt: true, logs: true, reversible: false, retention: 30 }, metric: "utility" }, expect: { min: 0.84, max: 0.86 } },
    { id: "restore", claim: "Restoring brings it to 97%", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "ner", prompt: true, logs: true, reversible: true, retention: 30 }, metric: "utility" }, expect: { min: 0.96, max: 0.98 } },
    { id: "llm-utility", claim: "An LLM check reaches 34 per 1,000 but costs answer quality (94%)", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "llm", prompt: true, logs: true, reversible: true, retention: 30 }, metric: "utility" }, expect: { max: 0.95 } },
    { id: "log-only", claim: "Redacting only in logs sends all 1,200 items to the provider", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "ner", prompt: false, logs: true, reversible: true, retention: 30 }, metric: "promptLeak" }, expect: { min: 1190, max: 1210 } },
    { id: "retention", claim: "With the right detector, 45 days of retention meets the exposure limit", run: "lab", params: { model: "pii-lab", config: PI_CHALLENGE, values: { detector: "ner", prompt: true, logs: true, reversible: true, retention: 45 }, metric: "exposure" }, expect: { max: 150 } },
  ],
});
