import { defineField } from "../types";

export default defineField({
  id: "field-telegram-summarizer",
  title: "Field: Telegram Link Summarizer",
  estimatedMinutes: 60,
  xp: 200,
  brief: [
    { speaker: "kabir", line: "I paste links into a group chat all day and nobody reads them. A bot that sends back a three-line summary would." },
    { speaker: "meera", line: "Build it, keep it inside a token budget, and make the output a shape your code can rely on." },
  ],
  goal: "Build a Telegram bot that takes a URL, fetches the page, and replies with a structured summary from a language model, within a stated token budget.",
  needs: ["A Telegram account and a bot token from BotFather", "An API key for any chat model (a free tier is enough)", "Node or Python for the bot", "A way to test: send yourself the links"],
  steps: [
    {
      id: "bot",
      title: "Make the bot answer",
      detail: "Create a bot with BotFather, then write a small program that long-polls getUpdates and replies to any message that contains a URL. Start by echoing the URL back.",
      commands: ["curl -s \"https://api.telegram.org/bot$TOKEN/getMe\""],
    },
    {
      id: "fetch",
      title: "Fetch and clean the page",
      detail: "Download the page, strip scripts, styles and navigation, and keep the readable text. Count tokens and cap the text at a budget you choose, for example 6,000 tokens.",
    },
    {
      id: "schema",
      title: "Ask for a fixed shape",
      detail: "Request JSON with a title, a one-sentence summary, three bullet points and up to four tags, using your provider's structured output (a JSON schema) rather than asking nicely in prose. Validate the reply in code.",
    },
    {
      id: "edge",
      title: "Handle the two bad cases",
      detail: "A page that is too long for the budget, and a page that cannot be fetched. Decide what each should do and make the bot say so.",
    },
    {
      id: "cost",
      title: "Log tokens and cost for each run",
      detail: "Print input tokens, output tokens and the cost at your provider's price for every summary. Multiply by your expected links a day to estimate a month.",
    },
  ],
  criteria: [
    { id: "json", criterion: "Shows a model reply that is valid JSON with the agreed fields (title, summary, bullets, tags)" },
    { id: "budget", criterion: "Shows token counts for input and output and a stated budget for the page text" },
    { id: "cost", criterion: "Computes the cost of one summary and a monthly estimate" },
    { id: "edge", criterion: "Shows or describes the behaviour for an over-long page and a failed fetch" },
  ],
  hints: [
    { text: "Ask for structured output with a JSON schema in the request, and parse with a validator. If parsing fails, retry once and then say the summary failed.", cost: 20 },
    { text: "Long page: truncate to the budget from the start, or summarise in chunks and then summarise the summaries. Truncation is the simpler choice to start with.", cost: 25 },
    { text: "Cost = input tokens × input price + output tokens × output price. Prices are per million tokens on your provider's pricing page.", cost: 20 },
  ],
  proof: {
    prompt: "Paste one run of the bot: the URL, the JSON the model returned, the token counts and cost lines, and one sentence on how it behaves for a page that is too long.",
    placeholder: "URL: https://...\n{\"title\": ..., \"summary\": ..., \"bullets\": [...], \"tags\": [...]}\ninput_tokens=... output_tokens=... cost=$...\nToo long: ...",
    checks: [
      { id: "json", label: "Contains a JSON object with a summary field", pattern: "\"summary\"\\s*:" },
      { id: "bullets", label: "Contains bullets or tags", pattern: "\"(bullets|tags)\"\\s*:" },
      { id: "tokens", label: "Shows token counts", pattern: "(input_tokens|prompt_tokens|tokens_in|input tokens)" },
      { id: "cost", label: "Shows a cost", pattern: "(cost|\\$\\s*\\d)" },
      { id: "long", label: "Says how an over-long page is handled", pattern: "(too long|truncat|chunk|budget)" },
    ],
    sample:
      "URL: https://example.com/post/42\n{\"title\": \"Why queues need dead letters\", \"summary\": \"A queue that retries forever lets one bad message block every worker.\", \"bullets\": [\"Cap attempts\", \"Dead-letter failures\", \"Alert on depth\"], \"tags\": [\"queues\", \"reliability\"]}\ninput_tokens=3120 output_tokens=96 cost=$0.0012\nToo long: pages over 6,000 tokens are truncated from the start and the bot adds a note.",
  },
  debrief: [
    "A schema turns a model into a function with a return type. The bot's code never has to guess what the reply looks like, and a failure to parse is an event you can count.",
    "Tokens are the unit of cost and of limits. Setting a budget for the page text is the same decision as setting a timeout: it bounds the worst case.",
  ],
  honestPhysics: ["Prices and token counts depend on your provider and model. Use the numbers from your own run; the structure of the calculation is what carries over."],
  sources: [
    { id: "telegram-bot-api", title: "Telegram Bot API", url: "https://core.telegram.org/bots/api" },
    { id: "groq-structured", title: "Groq docs: Structured Outputs", url: "https://console.groq.com/docs/structured-outputs" },
    { id: "tiktoken", title: "OpenAI tiktoken: a fast BPE tokeniser", url: "https://github.com/openai/tiktoken" },
  ],
});
