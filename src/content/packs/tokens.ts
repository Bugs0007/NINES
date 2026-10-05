import { definePack } from "../define";

const SLICER = { samples: ["en", "te", "hi", "code", "json", "straw"], usdPerMTok: 2 };
export const DIET = { title: "order-update prompt", requestsPerDay: 200000, usdPerMTok: 2, budgetTokens: 350 };

const SRC = {
  sennrich: { id: "sennrich-2016", title: "R. Sennrich, B. Haddow, A. Birch (2016), Neural Machine Translation of Rare Words with Subword Units (BPE), ACL", url: "https://aclanthology.org/P16-1162/" },
  anthropicTokens: { id: "anthropic-token-counting", title: "Anthropic docs: Token counting (count tokens before sending a message)", url: "https://platform.claude.com/docs/en/build-with-claude/token-counting" },
  anthropicPricing: { id: "anthropic-pricing", title: "Anthropic: Claude API pricing (input and output priced separately)", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  gptTokenizer: { id: "gpt-tokenizer", title: "gpt-tokenizer (o200k_base BPE, used here as an offline proxy)", url: "https://github.com/niieani/gpt-tokenizer" },
  radford: { id: "radford-2019", title: "A. Radford et al. (2019), Language Models are Unsupervised Multitask Learners (GPT-2; byte-level BPE)", url: "https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf" },
  petrov: { id: "petrov-2023", title: "A. Petrov, E. La Malfa, P. Torr, A. Bibi (2023), Language Model Tokenizers Introduce Unfairness Between Languages, NeurIPS", url: "https://arxiv.org/abs/2305.15425" },
};

export default definePack({
  id: "tokens",
  title: "Tokens & Tokenization",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "Pigeon Copilot · first invoice", detail: "$13,540 / month" },
    lines: [
      { speaker: "rao", line: "The AI invoice is in tokens. I do not know what a token is, and I would like fewer of them." },
      { speaker: "meera", line: "Neither does most of the team. Let's find out what we're actually paying for." },
    ],
  },
  predictions: [
    {
      id: "script",
      kind: "choice",
      prompt: "With the o200k tokenizer used here, 'Your order has been delivered. Enjoy your meal!' is 10 tokens. The same message in Telugu has a similar number of characters. How many tokens does it take?",
      options: [
        { id: "same", label: "About the same, ~10" },
        { id: "x2", label: "Roughly 2 to 3 times as many" },
        { id: "x8", label: "Roughly 8 to 10 times as many" },
        { id: "fewer", label: "Fewer: Telugu is more compact" },
      ],
      answer: "x2",
      observe: "script-gap",
      reveal: {
        text: "24 tokens, 2.4× the English. The vocabulary saw far less Telugu, so its words split into smaller pieces: same meaning, higher bill, less room in the context window. GPT-4's older cl100k vocabulary needs 96 tokens for the same sentence, so the premium depends on the tokenizer as much as the language.",
        derived: true,
        sourceIds: ["gpt-tokenizer"],
        line: { speaker: "meera", line: "Half of Pigeon's users read Telugu or Hindi. Budget for it." },
      },
    },
    {
      id: "dense",
      kind: "choice",
      prompt: "Which of these costs the most tokens per character?",
      options: [
        { id: "prose", label: "An English sentence" },
        { id: "code", label: "A line of Python" },
        { id: "json", label: "A small JSON object" },
      ],
      answer: "json",
      observe: "json-dense",
      reveal: {
        text: "The JSON: 34 tokens for 74 characters, about twice as dense as prose. Every key and value boundary costs a punctuation token like {\" or \":, and numbers split into chunks of up to three digits. Every tool call and structured payload you send pays this tax.",
        derived: true,
      },
    },
  ],
  widget: { id: "tokenizer", config: SLICER },
  mechanism: [
    {
      id: "what",
      scene: "chips",
      text: "Models don't read characters or words. They read tokens: chunks from a fixed vocabulary learned by byte-pair encoding. Common words are one token; rare words, long numbers, and scripts the tokenizer saw less of split into several.",
      sourceIds: ["sennrich-2016"],
    },
    {
      id: "priced",
      scene: "cost",
      text: "Everything is metered in tokens: the context window, rate limits, and the bill. Input and output are priced separately, and output costs several times more per token. Count before you send; the Claude API has an endpoint for exactly that.",
      sourceIds: ["anthropic-pricing", "anthropic-token-counting"],
    },
    {
      id: "scripts",
      scene: "scripts",
      text: "The same meaning can cost very different amounts. Telugu and Hindi take more tokens than English here, and JSON is denser than prose. Tokenizers differ between model families, so measure with the model you'll actually call.",
      sourceIds: ["gpt-tokenizer", "petrov-2023"],
    },
    {
      id: "strawberry",
      scene: "strawberry",
      text: "Tokenization is also why models fumble spelling and letter-counting: on its own, 'strawberry' is three chunks here, and mid-sentence ' strawberry' is a single token. The model sees individual letters only if it spells the word out first.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "token-diet",
      title: "Token diet",
      brief: "This prompt runs 200,000 times a day. Get it under 350 tokens without losing any fact the model needs to write the reply.",
      line: { speaker: "rao", line: "I will take any number smaller than the current one." },
      widget: { id: "token-diet", config: DIET },
      conditions: [
        { metric: "tokens", op: "<=", value: 350, label: "Under 350 tokens" },
        { metric: "factsKept", op: ">=", value: 1, label: "Every required fact survives" },
      ],
      stars: [{ metric: "tokens", op: "<=", value: 260, label: "Under 260 tokens" }],
      hints: [
        "Look at which parts of the prompt are big before you look at which are easy to cut.",
        "The model needs one order and one customer. How much of the context is about neither?",
        "Some cuts save tokens by deleting the very fact the reply depends on. Check the list on the right after every change.",
      ],
    },
  ],
  explainBack: {
    prompt: "Mr. Rao asks what a token is and why the Telugu version of a message costs more. Explain in two or three sentences.",
    rubric: [
      { id: "unit", criterion: "A token is a sub-word chunk from the model's vocabulary; text is split into tokens before the model sees it", keyIdea: "sub-word units" },
      { id: "cost", criterion: "Cost, context size, and rate limits are all counted in tokens", keyIdea: "metered in tokens" },
      { id: "script", criterion: "Languages or formats the tokenizer handles less efficiently split into more tokens, so the same meaning costs more", keyIdea: "more pieces, more cost" },
    ],
    exemplar:
      "A token is a chunk of text from the model's fixed vocabulary, usually a word or part of a word, and the model reads and bills in tokens, not characters. The vocabulary saw far less Telugu than English, so Telugu words split into more, smaller pieces. Same message, more tokens, more money and more of the context window used.",
  },
  reviews: [
    {
      id: "tk-est-cost",
      format: "estimate",
      scenario: "A prompt is 1,000 input tokens and runs 100,000 times a day. At $2 per million input tokens, what's the monthly input bill in dollars?",
      unit: "USD/month",
      answer: 6000,
      acceptFactor: 1.3,
      breakdown: ["1,000 × 100,000 = 100M tokens a day", "100M × $2/M = $200 a day", "× 30 = $6,000 a month"],
      explain: "Tokens × volume × price. Trimming 500 tokens from a hot prompt saves thousands a month.",
    },
    {
      id: "tk-pick-json",
      format: "pick-fix",
      scenario: "Your tool returns a 40-field JSON object per product, and the model only needs name, price, and stock. The prompt is blowing the budget. Best fix?",
      options: [
        { id: "a", label: "Return only the three fields the model needs" },
        { id: "b", label: "Switch to a model with a bigger context window" },
        { id: "c", label: "Ask the model to ignore irrelevant fields" },
        { id: "d", label: "Base64-encode the JSON" },
      ],
      answer: "a",
      explain: "Every field costs tokens whether or not the model uses it, and irrelevant context can distract it. Shape tool outputs for the model, not for your database.",
    },
    {
      id: "tk-order",
      format: "order",
      scenario: "Order by tokens for the same delivery message with the o200k tokenizer used here, fewest first.",
      items: [
        { id: "en", label: "English" },
        { id: "hi", label: "Hindi" },
        { id: "te", label: "Telugu" },
      ],
      answer: ["en", "hi", "te"],
      explain: "10, 18, and 24 tokens for the same meaning. Scripts that were rarer in the tokenizer's training text split into more pieces; GPT-4's older cl100k vocabulary needs 96 for the Telugu.",
    },
    {
      id: "tk-pick-count",
      format: "pick-fix",
      scenario: "You need to know if a 90-page contract fits in Claude's context window before you send it. How do you check?",
      options: [
        { id: "a", label: "Divide the character count by 4" },
        { id: "b", label: "Call the token-counting endpoint for the model you'll use" },
        { id: "c", label: "Count words and multiply by 1.3" },
        { id: "d", label: "Send it and catch the error" },
      ],
      answer: "b",
      explain: "Rules of thumb are fine for napkin math, but tokenizers differ by model and language. The count_tokens endpoint is free and counts with the model's own tokenizer, within a few tokens of what you'll be billed.",
      why: {
        prompt: "Why isn't characters ÷ 4 good enough here?",
        options: [
          { id: "a", label: "The ratio varies by language, format, and tokenizer" },
          { id: "b", label: "Claude uses exactly 3 characters per token" },
          { id: "c", label: "Characters don't include spaces" },
        ],
        answer: "a",
      },
    },
    {
      id: "tk-graph",
      format: "predict-graph",
      scenario: "You feed the same chat app messages in English, then Hindi, then Telugu, then minified JSON, then pretty-printed JSON. What does tokens per message look like?",
      xLabel: "English · Hindi · Telugu · min JSON · pretty JSON",
      yLabel: "tokens per message",
      options: [
        { id: "flat", label: "Flat", points: [10, 10, 10, 10, 10] },
        { id: "varies", label: "Varies a lot by language and format", points: [10, 18, 24, 20, 30] },
        { id: "down", label: "Falls steadily", points: [30, 24, 18, 12, 10] },
      ],
      answer: "varies",
      explain: "Same content, different token counts. Indentation and whitespace in pretty JSON are tokens too.",
    },
    {
      id: "tk-explain",
      format: "explain",
      scenario: "In two sentences: why do LLMs often miscount the letters in a word?",
      rubric: [
        { id: "chunks", criterion: "The model sees tokens (multi-letter chunks), not individual letters" },
        { id: "consequence", criterion: "So letter-level facts aren't directly visible and must be inferred" },
      ],
      exemplar: "The model receives words as tokens, chunks like 'st', 'raw', 'berry', not as letters. Counting letters means reasoning about characters it never directly sees, so it often gets it wrong.",
      explain: "Asking it to spell the word out first helps, because then each letter becomes its own token.",
    },
  ],
  codex: {
    oneLiner: "Models read and bill in tokens: sub-word chunks from a learned vocabulary. Different languages and formats cost different amounts.",
    keyNumbers: [
      { label: "Tokenization algorithm", value: "byte-pair encoding (subwords)", sourceId: "sennrich-2016" },
      { label: "Claude Sonnet 5 / 5.5 price", value: "$2 in / $10 out per M tokens", sourceId: "anthropic-pricing" },
      { label: "Model-specific counts", value: "messages.count_tokens endpoint", sourceId: "anthropic-token-counting" },
      { label: "Telugu vs English (o200k proxy)", value: "≈ 2.4× tokens", sourceId: "gpt-tokenizer" },
    ],
    tradeoffs: [
      { choice: "Compact structured context (minified, few fields)", gain: "Far fewer tokens, lower cost, more room in the window", cost: "Harder to read and debug the prompt" },
      { choice: "Natural-language instructions in the user's language", gain: "Better user experience", cost: "More tokens for some scripts" },
      { choice: "Many few-shot examples", gain: "Steadier output format", cost: "Every example is paid for on every request" },
    ],
    seenIn: [
      { text: "Case Intel's legal RAG: long judgment chunks and Indian-language text inflate token counts per chunk.", audience: "owner" },
      "A legal or document-search RAG: long chunks and Indian-language text inflate token counts per chunk.",
      "Every JSON tool result you've passed back to a model was billed at JSON's token density.",
    ],
    interviewAngle: "When costing an LLM feature, show the math: tokens per request × requests per day × price, input and output separately. Then name the levers: trim context, cache the stable prefix, shorten outputs, route easy requests to a cheaper model, and batch anything that isn't interactive at half price.",
    aws: [{ concept: "Token metering", service: "Amazon Bedrock InputTokenCount / OutputTokenCount metrics" }],
    otherClouds: "Vertex AI and Azure OpenAI report usage per request in tokens as well",
    replay: { id: "tokenizer", config: SLICER },
  },
  interview: [
    "Estimate the monthly cost of a feature that sends a 2k-token prompt and gets a 300-token reply, 1M times a day.",
    "Why might the same feature cost more for Hindi-speaking users?",
    "How would you reduce token usage in a RAG pipeline without hurting answer quality?",
  ],
  deeper: [
    {
      title: "How byte-pair encoding builds a vocabulary",
      body: "Start with individual characters; byte-level BPE, used by GPT-2 and later tokenizers including o200k, starts from raw bytes so any text can be encoded. Repeatedly find the most frequent adjacent pair in the training text and merge it into a new token, until the vocabulary reaches its target size (tens to hundreds of thousands). Frequent words become single tokens; rare strings stay as several pieces. Because merges come from the training corpus, languages and formats that were rarer there end up with less efficient tokenization.",
      sourceIds: ["sennrich-2016", "radford-2019"],
    },
    {
      title: "Why we show a proxy",
      body: "Claude's tokenizer isn't published as a library, so NINES splits text offline with o200k, a real BPE vocabulary. The mechanics are the same in kind; the exact counts are not. With an API key, the Tokenizer Slicer also asks the count_tokens endpoint for Claude's own count, which is what you should use for real budgets.",
      sourceIds: ["gpt-tokenizer", "anthropic-token-counting"],
    },
  ],
  honestPhysics: [
    "Token counts here come from o200k_base, a stand-in BPE; Claude's counts differ by model and by content. Claude 4.7 and later models, including Sonnet 5, use a newer tokenizer that produces about 30% more tokens than earlier models for the same text, so check real budgets with count_tokens.",
    "The invoice and the Token Diet bill count input tokens only. Replies add roughly $2,600 a month at $10 per million output tokens, which is why reply length is a lever too.",
    "The 2.4× Telugu premium belongs to o200k and this one sentence. Across tokenizers, the same text can take up to 15 times as many tokens in one language as in another (Petrov et al., 2023).",
    "Prompt caching can't rescue a prompt this small: at about 250 tokens the dieted prompt is under the minimum cacheable length (1,024 tokens on Sonnet 5, 512 on Sonnet 5.5), so trimming is the lever here.",
  ],
  sources: [SRC.sennrich, SRC.anthropicTokens, SRC.anthropicPricing, SRC.gptTokenizer, SRC.radford, SRC.petrov],
  verify: [
    { id: "en-10", claim: "The English message is 10 tokens", run: "token-count", params: { sample: "en" }, expect: { min: 10, max: 10 } },
    { id: "hi-18", claim: "The Hindi message is 18 tokens, between English and Telugu", run: "token-count", params: { sample: "hi" }, expect: { min: 18, max: 18 } },
    { id: "te-cl100k", claim: "GPT-4's older cl100k vocabulary needs 96 tokens for the Telugu sentence", run: "token-count", params: { sample: "te", encoding: "cl100k" }, expect: { min: 96, max: 96 } },
    { id: "te-24", claim: "The Telugu message is about 2–3× the English", run: "token-count", params: { sample: "te" }, expect: { min: 20, max: 30 } },
    { id: "json-dense", claim: "The JSON sample is the densest per character", run: "token-density-rank", params: { sample: "json" }, expect: { min: 1, max: 1 } },
    { id: "diet-base", claim: "The prompt starts above 1,000 tokens", run: "diet-tokens", params: { flags: [] }, expect: { min: 1000 } },
    { id: "diet-best", claim: "The honest cuts get it under 260", run: "diet-tokens", params: { flags: ["preamble", "examples", "fields", "keys", "minify", "history"] }, expect: { max: 260 } },
    { id: "diet-needs-history", claim: "Without trimming history it can't fit 350", run: "diet-tokens", params: { flags: ["preamble", "examples", "fields", "keys", "minify"] }, expect: { min: 351 } },
  ],
});
