import { definePack } from "../define";

export const RF = { start: { rag: true, k: 5, ft: false, few: false } };
export const RF_CHALLENGE = { start: { rag: false, k: 5, ft: false, few: false } };

const RAG_PAPER = { id: "rag-paper", title: "Lewis et al. (2020), Retrieval-augmented generation for knowledge-intensive NLP tasks", url: "https://arxiv.org/abs/2005.11401" };
const OVADIA = { id: "ovadia", title: "Ovadia et al. (2023), Fine-tuning or retrieval? Comparing knowledge injection in LLMs", url: "https://arxiv.org/abs/2312.05934" };
const ANTHROPIC_FT = { id: "anthropic-prompting", title: "Claude docs: Prompt engineering overview (try prompting before fine-tuning)", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" };

export default definePack({
  id: "rag-vs-finetune",
  title: "Prompting vs RAG vs Fine-tuning",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "proposal · fine-tune a model on the whole legal corpus", detail: "estimate: 5 weeks, retrain monthly" },
    lines: [
      { speaker: "kabir", line: "The plan is to fine-tune a model on all forty million tokens of our documents so it knows them. That takes five weeks, then a retrain whenever the law changes." },
      { speaker: "meera", line: "Fine-tuning teaches habits and retrieval supplies facts. Decide which problem you have before you pick the tool." },
    ],
  },
  predictions: [
    {
      id: "facts",
      kind: "choice",
      prompt: "You fine-tune on 2,000 examples drawn from the corpus, instead of retrieving passages. The bare model gets 35% of facts right. After fine-tuning, about what share of facts is right?",
      options: [
        { id: "50", label: "About 50%, it learned the style and few of the facts" },
        { id: "85", label: "About 85%" },
        { id: "99", label: "About 99%, it has seen the documents" },
      ],
      answer: "50",
      observe: "ft-facts",
      reveal: {
        text: "In the lab, fine-tuning lifts facts from 35% to 50% and format from 60% to 96%. Training on examples moves behaviour well and knowledge poorly, and what it does absorb is blurred. Retrieval reaches 85% on the same questions because the passage is in front of the model when it answers.",
        derived: true,
        line: { speaker: "rao", line: "Tuning changes how it answers. Retrieval changes what it has to answer from." },
      },
    },
    {
      id: "stale",
      kind: "choice",
      prompt: "A fifth of the corpus changes each month, and you retrain on a 30-day cycle with no retrieval. On average, how out of date is what the model knows?",
      options: [
        { id: "0", label: "Not at all, it learns continuously" },
        { id: "15", label: "About 15 days" },
        { id: "30", label: "About 90 days" },
      ],
      answer: "15",
      observe: "stale-answers",
      reveal: {
        text: "A model is a snapshot: on a 30-day cycle the average answer reflects knowledge 15 days old, and the worst case is 30. Retrieval from an index refreshed nightly is at most a day behind, and updating it is a document write, not a training run.",
        derived: true,
        line: { speaker: "meera", line: "A model is frozen when training ends. An index is not." },
      },
    },
  ],
  widget: { id: "decide-lab", config: RF },
  mechanism: [
    {
      id: "ladder",
      text: "Start with the cheapest tool that could work. Prompting gives the model instructions and a few examples and costs a day. Retrieval adds knowledge the model lacks by fetching passages at question time and costs weeks. Fine-tuning changes the model's weights and costs more again. Climb only when the step below falls short on a measured failure.",
      sourceIds: ["anthropic-prompting", "rag-paper"],
    },
    {
      id: "rag",
      scene: "rag",
      text: "Use retrieval for facts: private, changing or too numerous to memorise. The passages go into the prompt, so answers can cite sources, access can be controlled per user, and an update is a write to an index. Quality depends on how many good passages you retrieve, and each one costs tokens on every question.",
      sourceIds: ["rag-paper", "ovadia"],
    },
    {
      id: "style",
      scene: "style",
      text: "Use fine-tuning for behaviour: a house format, a tone, a narrow task done the same way every time, or a smaller model taught to do what a larger one does. A few hundred to a few thousand good examples are enough. It gives poor recall of facts and goes stale on the day training stops.",
      sourceIds: ["ovadia"],
    },
    {
      id: "both",
      scene: "both",
      text: "Combine them when you have both problems: retrieval supplies the facts and a light fine-tune, often a LoRA adapter, supplies the format. Check the cost: a custom model can carry a price premium and an extra training cycle. Several examples in the prompt can be a cheaper way to get most of the format.",
      sourceIds: ["ovadia", "anthropic-prompting"],
    },
  ],
  challenges: [
    {
      id: "choose-approach",
      title: "Choose the approach",
      brief: "For 20,000 questions a day over the legal corpus: facts at least 85% right, house format at least 90%, knowledge no more than 2 days old, under $12,000 a month, and shipped within 8 weeks.",
      line: { speaker: "rao", line: "I need both the facts and the format, on a budget." },
      widget: { id: "decide-lab", config: RF_CHALLENGE },
      conditions: [
        { metric: "factAccuracy", op: ">=", value: 0.85, label: "Facts at least 85% right" },
        { metric: "formatScore", op: ">=", value: 0.9, label: "House format at least 90%" },
        { metric: "staleDays", op: "<=", value: 2, label: "Knowledge at most 2 days old" },
        { metric: "monthlyCost", op: "<=", value: 12000, label: "At most $12,000 a month" },
        { metric: "weeksToShip", op: "<=", value: 8, label: "Shipped within 8 weeks" },
      ],
      stars: [{ metric: "monthlyCost", op: "<=", value: 10500, label: "At most $10,500 a month" }],
      hints: ["Which approach supplies fresh facts?", "Which gets the format above 90%?", "How many passages does the accuracy target need?"],
    },
  ],
  explainBack: {
    prompt: "Explain when to use prompting, retrieval and fine-tuning.",
    rubric: [
      { id: "ladder", criterion: "Start with prompting, add retrieval for knowledge the model lacks, and fine-tune only for behaviour after measuring a gap", keyIdea: "cheapest tool first" },
      { id: "facts", criterion: "Retrieval is for facts: private, changing or numerous; it supports citations and access control and updates without training", keyIdea: "retrieval for facts" },
      { id: "style", criterion: "Fine-tuning is for behaviour and format: it teaches style well and facts poorly, and goes stale at the end of training", keyIdea: "fine-tuning for behaviour" },
    ],
    exemplar:
      "I would start with prompting, add retrieval when the model lacks knowledge, and fine-tune only for behaviour after measuring a gap that prompting cannot close. Retrieval is for facts that are private, changing or numerous: it supports citations and access control, and updating it is a write, not a training run. Fine-tuning is for format and behaviour, since it teaches style well and facts poorly and goes stale when training ends.",
  },
  reviews: [
    {
      id: "rf-est",
      format: "estimate",
      scenario: "Retrieving 5 passages of 600 tokens, with 500 tokens of question and 400 of answer, at $2 and $10 per million tokens, costs how much per question in thousandths of a dollar?",
      unit: "$ per 1,000 questions",
      answer: 11,
      acceptFactor: 1.05,
      breakdown: ["input 500 + 5 × 600 = 3,500 tokens × $2 = $0.007", "output 400 × $10 = $0.004", "$0.011 per question, $11 per 1,000"],
      explain: "Retrieval puts most of the tokens on the input side, and those are billed on every question.",
    },
    {
      id: "rf-pick",
      format: "pick-fix",
      scenario: "A support bot gives out of date policy information. The policies change weekly. What is the right fix?",
      options: [
        { id: "a", label: "Retrieve the current policy documents at question time" },
        { id: "b", label: "Fine-tune weekly on the new policies" },
        { id: "c", label: "Use a larger model" },
        { id: "d", label: "Lower the temperature" },
      ],
      answer: "a",
      explain: "Facts that change belong in an index. Retraining weekly is slower and costlier than updating a document.",
    },
    {
      id: "rf-order",
      format: "order",
      scenario: "Order these by how well they get the house format right in the lab, best first.",
      items: [
        { id: "ft", label: "Fine-tuned model" },
        { id: "few", label: "A few examples in the prompt" },
        { id: "bare", label: "Instructions only" },
      ],
      answer: ["ft", "few", "bare"],
      explain: "96%, 85% and 60%.",
    },
    {
      id: "rf-graph",
      format: "predict-graph",
      scenario: "As you retrieve more passages per question (1 to 10), how does the share of facts answered right change?",
      xLabel: "passages retrieved →",
      yLabel: "facts right",
      options: [
        { id: "sat", label: "Rises quickly, then flattens", points: [57, 70, 78, 84, 86, 88, 89, 90] },
        { id: "linear", label: "Rises in a straight line to 100%", points: [35, 44, 53, 62, 71, 80, 90, 100] },
        { id: "flat", label: "Does not change", points: [35, 35, 35, 35, 35, 35, 35, 35] },
      ],
      answer: "sat",
      explain: "The first few passages carry most of the gain. After that each extra passage costs tokens and adds little.",
    },
    {
      id: "rf-flaw",
      format: "spot-flaw",
      scenario: "A team fine-tunes a model on its product documentation so that it can answer product questions, and ships it without retrieval. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "docs", label: "product docs, changing weekly", kind: "store", col: 0, row: 1 },
          { id: "train", label: "fine-tuning run (monthly)", kind: "worker", col: 1, row: 1 },
          { id: "model", label: "tuned model answers questions", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "docs", to: "train" },
          { from: "train", to: "model" },
        ],
      },
      answer: "train->model",
      explain: "Knowledge baked in at training goes stale weekly and cannot be cited or permissioned. Fine-tune for the style and retrieve the facts.",
    },
    {
      id: "rf-explain",
      format: "explain",
      scenario: "In two sentences: why not just put the whole corpus in the prompt?",
      rubric: [
        { id: "size", criterion: "A corpus of millions of tokens does not fit in a context window, and even when it does it is slow and costly on every question" },
        { id: "focus", criterion: "Models answer better from a few relevant passages than from a huge mass, and retrieval also supports citations and access control" },
      ],
      exemplar: "A corpus of millions of tokens does not fit in a context window, and even when a smaller one does it is slow and costly to send on every question. Models also answer better from a few relevant passages than from a mass, and retrieval supports citations and access control.",
      explain: "Retrieval is a way to choose what the model reads.",
    },
  ],
  codex: {
    oneLiner: "Prompt first, retrieve for facts, fine-tune for behaviour. Retrieval is fresh and citable; fine-tuning is for style and goes stale.",
    keyNumbers: [
      { label: "Fine-tuning, facts vs format (lab)", value: "facts 50%, format 96%", sourceId: "ovadia" },
      { label: "Retrieval, 5 passages (lab)", value: "85% of facts, 1 day old", sourceId: "rag-paper" },
    ],
    tradeoffs: [
      { choice: "Retrieval", gain: "Fresh, citable, permissionable", cost: "Tokens on every question" },
      { choice: "Fine-tuning", gain: "Consistent behaviour, shorter prompts", cost: "Weak on facts; stale; weeks to build" },
      { choice: "Few-shot examples", gain: "Cheap and quick", cost: "Tokens per call; a lower ceiling" },
    ],
    seenIn: ["Enterprise search assistants (retrieval).", "Tuned classifiers and style adapters."],
    interviewAngle: "Say: 'prompt first; retrieve for knowledge; fine-tune for behaviour; measure the gap before climbing'.",
    aws: [{ concept: "Managed retrieval and tuning", service: "Amazon Bedrock Knowledge Bases; Bedrock custom model fine-tuning" }],
    replay: { id: "decide-lab", config: RF, scene: "both" },
  },
  interview: [
    "When would you fine-tune instead of using RAG?",
    "Why is fine-tuning a poor way to add knowledge?",
    "How would you decide between prompting, RAG and fine-tuning?",
  ],
  deeper: [
    {
      title: "Measure before you climb",
      body: "Build a small evaluation set first, then try the cheapest approach and look at the failures. If answers are wrong because the model lacks facts, retrieve. If they are right but badly formatted or toned, try examples in the prompt, then fine-tune. Write down the gap that justified each step; the next engineer will want to know.",
      sourceIds: ["anthropic-prompting"],
    },
  ],
  honestPhysics: [
    "A legal assistant over a private corpus of 40 million tokens, a fifth of which changes monthly, answering 20,000 questions a day. A bare prompt gets 35% of facts right. Retrieval adds up to 55 points as you retrieve more 600-token passages, refreshed nightly, at $400 a month and two weeks of work.",
    "Fine-tuning on 2,000 examples lifts format to 96% and facts to 50%, goes stale for a 30-day cycle (15 days average), costs $1,500 a run (about $125 a month), serves at 1.5 times the token price and takes five weeks. A few examples in the prompt lift format to 85% for 1,200 tokens a call. Prices use $2 and $10 per million tokens with 500 tokens of question and 400 of answer.",
  ],
  sources: [RAG_PAPER, OVADIA, ANTHROPIC_FT],
  verify: [
    { id: "ft-facts", claim: "Fine-tuning alone gets 50% of facts right", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: false, ft: true }, metric: "factAccuracy" }, expect: { min: 0.49, max: 0.51 } },
    { id: "ft-format", claim: "…and 96% of the format", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: false, ft: true }, metric: "formatScore" }, expect: { min: 0.95, max: 0.97 } },
    { id: "ft-stale", claim: "…with knowledge 15 days old on average", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: false, ft: true }, metric: "staleDays" }, expect: { min: 14.5, max: 15.5 } },
    { id: "rag-facts", claim: "Retrieval of five passages reaches 85% of facts", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: true, k: 5, ft: false }, metric: "factAccuracy" }, expect: { min: 0.85, max: 0.86 } },
    { id: "rag-format", claim: "…but only 60% of the format", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: true, k: 5, ft: false, few: false }, metric: "formatScore" }, expect: { min: 0.59, max: 0.61 } },
    { id: "both", claim: "Retrieval plus fine-tuning meets every target", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: true, k: 5, ft: true, few: false }, metric: "factAccuracy" }, expect: { min: 0.87, max: 0.88 } },
    { id: "both-cost", claim: "…for $10,425 a month", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: true, k: 5, ft: true, few: false }, metric: "monthlyCost" }, expect: { min: 10400, max: 10450 } },
    { id: "few-short", claim: "Retrieval with examples in the prompt stops at 85% format", run: "lab", params: { model: "decide-lab", config: RF_CHALLENGE, values: { rag: true, k: 5, ft: false, few: true }, metric: "formatScore" }, expect: { max: 0.9 } },
  ],
});
