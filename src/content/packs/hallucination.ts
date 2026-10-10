import { definePack } from "../define";

export const HALL = { start: { retrieval: false, abstain: false, verify: false } };

const JI = { id: "ji-2023", title: "Z. Ji et al. (2023), Survey of Hallucination in Natural Language Generation, ACM Computing Surveys 55(12)", url: "https://doi.org/10.1145/3571730" };
const LEWIS = { id: "lewis-2020", title: "P. Lewis et al. (2020), Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks, NeurIPS", url: "https://arxiv.org/abs/2005.11401" };
const ANTHROPIC_HALL = { id: "anthropic-reduce-hallucinations", title: "Anthropic docs: Reduce hallucinations (allow 'I don't know', quote sources, verify)", url: "https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations" };
const KADAVATH = { id: "kadavath-2022", title: "S. Kadavath et al. (2022), Language Models (Mostly) Know What They Know", url: "https://arxiv.org/abs/2207.05221" };

export default definePack({
  id: "hallucination",
  title: "Hallucination",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "page", title: "Support · Copilot answered a refund question", detail: "'refunds within 30 days' (our policy is 7)" },
    lines: [
      { speaker: "kabir", line: "Copilot told a customer we refund within thirty days, which we do not, with total confidence and an invented section number." },
      { speaker: "meera", line: "It was trained to produce plausible text, not to know what it does not know. We have to give it facts and permission to be unsure." },
    ],
  },
  predictions: [
    {
      id: "baseline",
      kind: "choice",
      prompt: "Of 100 support questions, 60 are about general topics the model knows and 40 need Pigeon's own policies, which it has never seen. With no documents and no instruction to admit uncertainty, how many answers are confidently wrong?",
      options: [
        { id: "few", label: "About 5 of 100" },
        { id: "fifteen", label: "About 15 of 100" },
        { id: "forty", label: "About 39 of 100" },
        { id: "all", label: "All 100" },
      ],
      answer: "forty",
      observe: "grounded",
      reveal: {
        text: "In the lab, a model without the information fabricates an answer 85% of the time. Of the 40 questions that need Pigeon's policies, about 34 get a made-up answer, plus about 5 mistakes on the 60 it knows: about 39 confidently wrong in 100.",
        derived: true,
        line: { speaker: "meera", line: "The model is not lying. It has no way to notice it is guessing." },
      },
    },
  ],
  widget: { id: "hallucination-lab", config: HALL },
  mechanism: [
    {
      id: "why",
      scene: "fabricate",
      text: "A language model is trained to continue text plausibly. When it lacks the facts, the most plausible continuation is still a fluent, confident answer, so it produces one. Hallucination is the default behaviour when knowledge runs out, not a rare malfunction.",
      sourceIds: ["ji-2023"],
    },
    {
      id: "ground",
      scene: "ground",
      text: "Grounding gives the model the facts. Retrieval finds the relevant passages in your documents and puts them in the prompt, so the answer can come from the text in front of it. This is retrieval-augmented generation, and it moves questions from guesswork to reading.",
      sourceIds: ["lewis-2020"],
    },
    {
      id: "abstain",
      scene: "abstain",
      text: "Give it permission to decline. Telling the model to say it does not know when the context lacks the answer, and to quote the passage it relied on, turns many fabrications into abstentions. Models carry some signal about what they know, which is why this works at all.",
      sourceIds: ["anthropic-reduce-hallucinations", "kadavath-2022"],
    },
    {
      id: "verify",
      text: "Then check. A second pass can compare each claim against its cited source and withhold unsupported answers. None of these layers is perfect, so combine them, measure the wrong-answer rate on a test set, and decide how wrong is acceptable for the task.",
      sourceIds: ["anthropic-reduce-hallucinations"],
    },
  ],
  challenges: [
    {
      id: "support-bot",
      title: "Make the support bot trustworthy",
      brief: "Of every 100 questions, 60 are general and 40 need Pigeon's own documents. Turn on the right safeguards so no more than 5% of all answers are confidently wrong, while at least 85% of questions still get a correct answer.",
      line: { speaker: "rao", line: "Declining to answer is cheap. Wrong answers are refunds." },
      widget: { id: "hallucination-lab", config: HALL },
      conditions: [
        { metric: "wrongRate", op: "<=", value: 0.05, label: "At most 5% confidently wrong" },
        { metric: "correctRate", op: ">=", value: 0.85, label: "At least 85% answered correctly" },
      ],
      stars: [{ metric: "wrongRate", op: "<=", value: 0.035, label: "At most 3.5% wrong" }],
      hints: [
        "Which safeguard gives the model facts it does not have?",
        "Which ones turn a fabricated answer into an honest one? Does one of them lose correct answers?",
        "Combine them and watch both numbers: wrong answers and correct answers.",
      ],
    },
  ],
  explainBack: {
    prompt: "Why do language models hallucinate, and what are the layers of defence?",
    rubric: [
      { id: "why", criterion: "Models generate plausible text and have no reliable way to notice missing knowledge, so they produce confident answers", keyIdea: "plausible not true" },
      { id: "ground", criterion: "Grounding in retrieved documents gives the model the facts to answer from", keyIdea: "retrieval grounding" },
      { id: "layers", criterion: "Allowing 'I don't know', requiring citations, and verifying answers against sources further reduce errors; none is perfect so measure", keyIdea: "abstain, cite, verify, measure" },
    ],
    exemplar:
      "A model is trained to continue text plausibly, so when it lacks the facts it still produces a fluent, confident answer. I would ground it by retrieving the relevant documents into the prompt, tell it to say it does not know when the context lacks the answer and to cite what it used, and verify claims against the cited sources. None of those is perfect, so I would measure the wrong-answer rate on a test set.",
  },
  reviews: [
    {
      id: "ha-est",
      format: "estimate",
      scenario: "Of 100 questions, 40 need documents the model has not seen. Without safeguards it fabricates on 85% of those. About how many fabricated answers per 100 questions?",
      unit: "answers",
      answer: 34,
      acceptFactor: 1.1,
      breakdown: ["40 × 0.85", "= 34 fabricated answers"],
      explain: "A large share of confidently wrong answers comes from the questions the model could never have known.",
    },
    {
      id: "ha-pick",
      format: "pick-fix",
      scenario: "A legal assistant sometimes cites case names that do not exist. Which change addresses this most directly?",
      options: [
        { id: "a", label: "Retrieve real case text, require quotes from it, and check each citation against the source" },
        { id: "b", label: "Raise the temperature" },
        { id: "c", label: "Ask the model to be more careful" },
        { id: "d", label: "Use a longer system prompt about honesty" },
      ],
      answer: "a",
      explain: "Fabricated citations need grounding in real text and a check that each one exists. An instruction to be careful does not give the model facts it does not have.",
    },
    {
      id: "ha-pick2",
      format: "pick-fix",
      scenario: "Your assistant answers 'I don't know' to 20% of questions, and users are annoyed. Evaluation shows that half of those had the answer in the retrieved passages. What is the likely issue?",
      options: [
        { id: "a", label: "The abstain instruction is too eager; tune the prompt and improve passage ranking" },
        { id: "b", label: "Retrieval is working perfectly" },
        { id: "c", label: "The model is too small to read" },
        { id: "d", label: "Users should rephrase" },
      ],
      answer: "a",
      explain: "Abstention trades wrong answers for refusals. If it refuses when the answer is present, the prompt or the ranking of the passages needs work; measure both rates.",
    },
    {
      id: "ha-order",
      format: "order",
      scenario: "Order these setups by rate of confidently wrong answers, lowest first.",
      items: [
        { id: "all", label: "Retrieval, abstain, and verification" },
        { id: "rag", label: "Retrieval only" },
        { id: "abs", label: "Abstain instruction only" },
        { id: "none", label: "Nothing: a bare model" },
      ],
      answer: ["all", "rag", "abs", "none"],
      explain: "Grounding gives the biggest drop, abstention helps by declining, and layering them compounds. A bare model is the worst.",
    },
    {
      id: "ha-flaw",
      format: "spot-flaw",
      scenario: "An internal Q&A bot has retrieval, but its prompt says 'Always give a helpful answer, even if you are not sure.' It still invents policy details when retrieval misses. Tap the part to fix.",
      diagram: {
        nodes: [
          { id: "q", label: "question", kind: "client", col: 0, row: 1 },
          { id: "rag", label: "retrieval (misses 15% of the time)", kind: "store", col: 1, row: 0 },
          { id: "prompt", label: "prompt: 'always give a helpful answer'", kind: "llm", col: 1, row: 2 },
        ],
        edges: [
          { from: "q", to: "rag" },
          { from: "q", to: "prompt" },
        ],
      },
      answer: "prompt",
      explain: "When retrieval misses, the instruction forces a fabricated answer. The prompt should let the model say the documents do not cover it, and cite what it used.",
    },
    {
      id: "ha-explain",
      format: "explain",
      scenario: "In two sentences: why does retrieval reduce hallucination, and what does it not fix?",
      rubric: [
        { id: "facts", criterion: "It puts the relevant facts in the prompt so the model answers from them instead of guessing" },
        { id: "limits", criterion: "It does not help when retrieval misses, when sources conflict, or when the model ignores or misreads the context" },
      ],
      exemplar: "Retrieval puts the relevant passages in the prompt so the model can answer from them instead of guessing from memory. It does not help when retrieval misses the right passage, or when the model misreads or ignores what it was given.",
      explain: "Retrieval removes one cause, not all of them.",
    },
  ],
  codex: {
    oneLiner: "Models produce plausible text, so missing knowledge becomes confident fabrication. Ground in documents, allow 'I don't know', cite, verify, and measure.",
    keyNumbers: [
      { label: "Defences", value: "retrieval grounding, abstention, citation, verification", sourceId: "anthropic-reduce-hallucinations" },
      { label: "Retrieval-augmented generation", value: "retrieve passages, then generate from them", sourceId: "lewis-2020" },
    ],
    tradeoffs: [
      { choice: "Ground with retrieval", gain: "Answers come from your documents", cost: "A retrieval system to build and measure; misses still happen" },
      { choice: "Allow abstention", gain: "Fewer confident wrong answers", cost: "More 'I don't know', including some unnecessary" },
      { choice: "Verify against sources", gain: "Catches unsupported claims", cost: "An extra model call, latency, and cost" },
    ],
    seenIn: ["Invented citations and policy details in assistants.", "Prompts that say 'only answer from the context provided'."],
    interviewAngle: "Show you measure it: 'ground it with retrieval, let it abstain, require quotes, and track the wrong-answer rate on a labelled set.'",
    aws: [{ concept: "Grounded answers", service: "Amazon Bedrock Knowledge Bases and Guardrails (contextual grounding check)" }],
    replay: { id: "hallucination-lab", config: HALL, scene: "ground" },
  },
  interview: [
    "Why do LLMs hallucinate, and how do you reduce it in production?",
    "What is the trade-off between abstaining and answering?",
    "How would you measure hallucination in an application?",
  ],
  deeper: [
    {
      title: "Types of hallucination",
      body: "Surveys distinguish claims that contradict the provided source (unfaithful to context) from claims that are simply not true in the world (factually wrong), and from claims that cannot be checked at all. The mitigations differ: faithfulness problems call for better prompting and verification against the source, factual problems for grounding in correct data.",
      sourceIds: ["ji-2023"],
    },
  ],
  honestPhysics: [
    "This is an illustrative model, not a measurement of any model. 60 of every 100 questions are general knowledge and 40 need Pigeon's documents.",
    "The 85% fabrication rate, the 85% retrieval recall, the 95% accuracy given a retrieved passage, and the 60% verification catch rate are round numbers for showing how the layers combine.",
    "Real error rates depend on the model, the prompt, the documents, and the questions, and must be measured on your own test set.",
  ],
  sources: [JI, LEWIS, ANTHROPIC_HALL, KADAVATH],
  verify: [
    { id: "bare", claim: "A bare model is confidently wrong on about 39% of questions", run: "lab", params: { model: "hallucination-lab", config: HALL, values: {}, metric: "wrongRate" }, expect: { min: 0.37, max: 0.41 } },
    { id: "rag-only", claim: "Retrieval alone still leaves over 5% wrong", run: "lab", params: { model: "hallucination-lab", config: HALL, values: { retrieval: true }, metric: "wrongRate" }, expect: { min: 0.05 } },
    { id: "all", claim: "Retrieval, abstention, and verification bring it under 5%", run: "lab", params: { model: "hallucination-lab", config: HALL, values: { retrieval: true, abstain: true, verify: true }, metric: "wrongRate" }, expect: { max: 0.05 } },
    { id: "all-correct", claim: "…while 85% or more are answered correctly", run: "lab", params: { model: "hallucination-lab", config: HALL, values: { retrieval: true, abstain: true, verify: true }, metric: "correctRate" }, expect: { min: 0.85 } },
    { id: "abstain-only", claim: "Abstention alone loses too many correct answers", run: "lab", params: { model: "hallucination-lab", config: HALL, values: { abstain: true }, metric: "correctRate" }, expect: { max: 0.85 } },
  ],
});
