import { definePack } from "../define";

export const SAMPLE = { set: "capital", start: { temperature: 0.7, topP: 1, topK: 8 } };
export const SAMPLE_TAGLINE = { set: "tagline", start: { temperature: 0.3, topP: 1, topK: 8 } };

const HOLTZMAN = { id: "holtzman-2020", title: "A. Holtzman et al. (2020), The Curious Case of Neural Text Degeneration (nucleus / top-p sampling), ICLR", url: "https://arxiv.org/abs/1904.09751" };
const ANTHROPIC_API = { id: "anthropic-messages-api", title: "Anthropic API reference: Messages (temperature, top_p, top_k parameters)", url: "https://docs.anthropic.com/en/api/messages" };

export default definePack({
  id: "sampling",
  title: "Sampling: Temperature, Top-p, Top-k",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "info", title: "Pigeon Copilot · same prompt, two answers", detail: "QA flagged the 'identical' regression tests: output differs between runs" },
    lines: [
      { speaker: "kabir", line: "I ran the same prompt twice and got two different answers. Is the model broken, or is it supposed to do that?" },
      { speaker: "meera", line: "It is picking from a distribution, not looking up an answer. Your sampler decides how adventurous the pick is." },
    ],
  },
  predictions: [
    {
      id: "hot",
      kind: "choice",
      prompt: "A model's next-token probabilities for 'The capital of France is' put 97% on ' Paris'. You raise the temperature to 2. What happens to the chance of a nonsense token like ' banana'?",
      options: [
        { id: "same", label: "Nothing; temperature does not change the probabilities" },
        { id: "tiny", label: "It stays negligible" },
        { id: "rises", label: "It rises noticeably, and Paris loses a lot of share" },
        { id: "zero", label: "It drops to zero" },
      ],
      answer: "rises",
      observe: "hot",
      reveal: {
        text: "Temperature divides the logits before the softmax, flattening the distribution. At 2, ' Paris' falls to about 70% and the nonsense tokens together take about 8% of the probability, so roughly one answer in twelve goes wrong.",
        derived: true,
        line: { speaker: "meera", line: "Higher temperature does not add creativity. It adds probability to everything that was unlikely." },
      },
    },
  ],
  widget: { id: "sampling-lab", config: SAMPLE },
  mechanism: [
    {
      id: "dist",
      text: "At each step the model produces a score for every token in its vocabulary. A softmax turns the scores into probabilities, and the sampler draws one token from them. Different draws are why the same prompt can give different answers.",
    },
    {
      id: "temp",
      scene: "temp",
      text: "Temperature divides the scores before the softmax. Below 1 it sharpens the distribution toward the top token, at 0 it is greedy and always picks the most likely, and above 1 it flattens, giving unlikely tokens a real chance.",
      sourceIds: ["anthropic-messages-api"],
    },
    {
      id: "topp",
      scene: "topp",
      text: "Top-p, or nucleus sampling, keeps the smallest set of tokens whose probabilities add up to p, and drops the rest. Top-k keeps the k most likely. Both cut the long tail of nonsense that high temperature feeds, which is why they are used together.",
      sourceIds: ["holtzman-2020"],
    },
    {
      id: "choose",
      scene: "greedy",
      text: "Match the sampler to the task. Extraction, classification, and tool calls want low temperature, since there is one right answer. Brainstorming and drafting benefit from variety, with top-p to keep it sensible. And because outputs vary, tests should check properties, not exact strings.",
    },
  ],
  challenges: [
    {
      id: "taglines",
      title: "Variety without nonsense",
      brief: "Pigeon's marketing tool suggests taglines for 'Pigeon: messaging that …'. You want varied options, an entropy of at least 2.3 bits across the candidates, while keeping nonsense completions at 0.5% or below. Set the temperature and top-p.",
      line: { speaker: "kabir", line: "I would like a different tagline each time, and none of them about gnomes." },
      widget: { id: "sampling-lab", config: SAMPLE_TAGLINE },
      conditions: [
        { metric: "entropyBits", op: ">=", value: 2.3, label: "Variety of at least 2.3 bits" },
        { metric: "pBad", op: "<=", value: 0.005, label: "Nonsense at most 0.5%" },
      ],
      stars: [{ metric: "entropyBits", op: ">=", value: 2.5, label: "Variety of at least 2.5 bits" }],
      hints: [
        "How does variety change as you raise the temperature, and what happens to the nonsense tokens?",
        "At a higher temperature, which control cuts the tail without cutting the good candidates?",
        "Try a temperature of 1 or more with top-p below 1.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what temperature, top-p, and top-k each do to the model's next-token choice, and how you would set them for extraction versus brainstorming.",
    rubric: [
      { id: "temp", criterion: "Temperature rescales the scores: low sharpens toward the top token, high flattens the distribution", keyIdea: "temperature reshapes the distribution" },
      { id: "cut", criterion: "Top-p and top-k truncate the candidate set to the likely tokens before sampling", keyIdea: "truncate the tail" },
      { id: "task", criterion: "Low temperature for deterministic tasks, higher with top-p for creative ones; tests should not rely on exact strings", keyIdea: "match the task" },
    ],
    exemplar:
      "The model scores every token and a softmax makes probabilities. Temperature rescales the scores, so low values sharpen the distribution toward the best token and high values flatten it. Top-p and top-k then cut the candidate list to the likely tokens before one is sampled. For extraction I use a low temperature, for brainstorming a higher one with top-p to keep out the tail, and I write tests on properties because the output varies.",
  },
  reviews: [
    {
      id: "sa-pick",
      format: "pick-fix",
      scenario: "A pipeline extracts invoice totals from emails and returns JSON. Results vary run to run, causing flaky downstream checks. What do you change first?",
      options: [
        { id: "a", label: "Lower the temperature, close to 0" },
        { id: "b", label: "Raise the temperature to explore more options" },
        { id: "c", label: "Raise top-k to 100" },
        { id: "d", label: "Ask the model to be creative" },
      ],
      answer: "a",
      explain: "Extraction has one right answer, so you want the most likely tokens every time. Lower temperature makes the output nearly deterministic.",
    },
    {
      id: "sa-pick2",
      format: "pick-fix",
      scenario: "A story generator at temperature 1.4 occasionally produces a word that wrecks a sentence. You still want lively output. What helps most?",
      options: [
        { id: "a", label: "Add top-p around 0.9 to cut the unlikely tail" },
        { id: "b", label: "Set temperature to 0" },
        { id: "c", label: "Use a longer prompt" },
        { id: "d", label: "Lower top-k to 1" },
      ],
      answer: "a",
      explain: "Top-p removes the improbable tokens that high temperature inflates, keeping variety among the sensible ones. Top-k of 1 would be greedy decoding.",
    },
    {
      id: "sa-est",
      format: "estimate",
      scenario: "A token has a 1% chance at one step. Across 100 independent steps, roughly what is the chance that unlikely token is picked at least once? (1 − 0.99^100)",
      unit: "%",
      answer: 63,
      acceptFactor: 1.1,
      breakdown: ["0.99^100 ≈ 0.366", "1 − 0.366", "≈ 63%"],
      explain: "Small per-step chances add up over a long output, which is why tail probability matters more for long generations.",
    },
    {
      id: "sa-order",
      format: "order",
      scenario: "Order these settings by how likely the model is to give the same answer twice, most likely first.",
      items: [
        { id: "t0", label: "Temperature 0" },
        { id: "t03", label: "Temperature 0.3" },
        { id: "t1", label: "Temperature 1" },
        { id: "t2", label: "Temperature 2" },
      ],
      answer: ["t0", "t03", "t1", "t2"],
      explain: "Lower temperature concentrates probability on the top token, so repeated runs agree more. Even temperature 0 can vary slightly in practice because of floating point behaviour on GPUs.",
    },
    {
      id: "sa-graph",
      format: "predict-graph",
      scenario: "Raise temperature from 0 to 2 on a distribution where the best token has a large lead. How does the best token's probability change?",
      xLabel: "temperature →",
      yLabel: "probability of the best token",
      options: [
        { id: "flat", label: "Stays at 100% until temperature 2", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "fall", label: "Near 100% at low temperature, then falls", points: [8, 8, 7.9, 7.5, 6.8, 6, 5.2, 4.5] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "linear", label: "Falls steadily from the start", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "fall",
      explain: "A big lead survives a lot of flattening, so the top token stays near certain until the temperature is well above 1, then loses share quickly.",
    },
    {
      id: "sa-flaw",
      format: "spot-flaw",
      scenario: "A regression test asserts that the model's answer equals a stored string exactly, at temperature 0.8, and it fails on about one run in five. Tap the part of the setup that is wrong.",
      diagram: {
        nodes: [
          { id: "test", label: "test: assert output == expected_string", kind: "client", col: 0, row: 1 },
          { id: "llm", label: "model · temperature 0.8", kind: "llm", col: 1, row: 1 },
        ],
        edges: [{ from: "test", to: "llm" }],
      },
      answer: "test",
      explain: "Sampled output varies, so an exact-match assertion is brittle. Test properties (valid JSON, required fields, a grader score), and use a low temperature where you need stability.",
    },
    {
      id: "sa-explain",
      format: "explain",
      scenario: "In two sentences: why does raising the temperature increase the chance of nonsense rather than just creativity?",
      rubric: [
        { id: "flatten", criterion: "Temperature flattens the distribution, moving probability from likely tokens to unlikely ones" },
        { id: "tail", criterion: "The unlikely tokens include many bad ones, so a flatter distribution picks them more often" },
      ],
      exemplar: "Temperature flattens the probabilities, so tokens that were unlikely get a bigger share. Many of those are poor choices, so the output gets more varied and also more often wrong.",
      explain: "Variety and error share the same dial.",
    },
  ],
  codex: {
    oneLiner: "The model samples each token from a distribution. Temperature reshapes it, top-p and top-k cut its tail, and low settings suit extraction.",
    keyNumbers: [
      { label: "Temperature 0", value: "greedy: always the most likely token", sourceId: "anthropic-messages-api" },
      { label: "Top-p", value: "smallest set whose probability reaches p", sourceId: "holtzman-2020" },
    ],
    tradeoffs: [
      { choice: "Low temperature", gain: "Stable, repeatable output", cost: "Repetitive; no variety" },
      { choice: "High temperature with top-p", gain: "Variety that stays sensible", cost: "Occasional off-target output; harder to test" },
    ],
    seenIn: ["Temperature fields in every LLM API.", "Flaky exact-match tests on model output."],
    interviewAngle: "Tie settings to tasks: 'temperature near 0 for extraction and tool calls, moderate with top-p for drafting, and tests that check properties instead of strings.'",
    aws: [{ concept: "Sampling parameters", service: "Amazon Bedrock inference parameters (temperature, topP, topK)" }],
    otherClouds: "GCP Vertex AI and Azure OpenAI expose the same knobs",
    replay: { id: "sampling-lab", config: SAMPLE, scene: "temp" },
  },
  interview: [
    "What does temperature do, mathematically and practically?",
    "How do top-p and top-k differ?",
    "How would you test an LLM feature whose output varies?",
  ],
  deeper: [
    {
      title: "Why nucleus sampling exists",
      body: "Sampling from the full distribution gives plausible text that sometimes derails, because many low-probability tokens add up to a lot of mass. Pure greedy decoding avoids that but produces repetitive text. Holtzman and colleagues showed that truncating to the top-p nucleus keeps the diversity of sampling while removing the unreliable tail, which is why it became a default.",
      sourceIds: ["holtzman-2020"],
    },
  ],
  honestPhysics: [
    "The distribution is a toy: eight candidate tokens with fixed scores for one prompt. A real vocabulary has tens of thousands of tokens and a new distribution at every step.",
    "Temperature 0 is treated as greedy decoding, with 0.05 as the lab's floor. Real systems can still vary a little at temperature 0.",
    "Entropy is measured in bits over the kept tokens, as a measure of how many different continuations the sampler might produce.",
  ],
  sources: [HOLTZMAN, ANTHROPIC_API],
  verify: [
    { id: "paris", claim: "At temperature 1 the model picks ' Paris' about 97% of the time", run: "lab", params: { model: "sampling-lab", config: SAMPLE, values: { temperature: 1, topP: 1, topK: 8 }, metric: "pTop" }, expect: { min: 0.95, max: 0.99 } },
    { id: "hot", claim: "At temperature 2 nonsense tokens take about 8% of the probability", run: "lab", params: { model: "sampling-lab", config: SAMPLE, values: { temperature: 2, topP: 1, topK: 8 }, metric: "pBad" }, expect: { min: 0.06, max: 0.1 } },
    { id: "hot-paris", claim: "…and Paris falls to about 70%", run: "lab", params: { model: "sampling-lab", config: SAMPLE, values: { temperature: 2, topP: 1, topK: 8 }, metric: "pTop" }, expect: { min: 0.65, max: 0.75 } },
    { id: "tag-cold", claim: "Low temperature is not varied enough for taglines", run: "lab", params: { model: "sampling-lab", config: SAMPLE_TAGLINE, values: { temperature: 0.3 }, metric: "entropyBits" }, expect: { max: 2.3 } },
    { id: "tag-wild", claim: "Temperature 1 without top-p lets nonsense through", run: "lab", params: { model: "sampling-lab", config: SAMPLE_TAGLINE, values: { temperature: 1, topP: 1 }, metric: "pBad" }, expect: { min: 0.005 } },
    { id: "tag-win", claim: "Temperature 1.5 with top-p 0.9 gives variety without nonsense", run: "lab", params: { model: "sampling-lab", config: SAMPLE_TAGLINE, values: { temperature: 1.5, topP: 0.9 }, metric: "entropyBits" }, expect: { min: 2.5 } },
    { id: "tag-win-bad", claim: "…with no nonsense tokens", run: "lab", params: { model: "sampling-lab", config: SAMPLE_TAGLINE, values: { temperature: 1.5, topP: 0.9 }, metric: "pBad" }, expect: { max: 0.005 } },
  ],
});
