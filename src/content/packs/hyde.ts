import { definePack } from "../define";

export const HYDE = { start: { method: "plain", quality: 0.85, ground: false } };
export const HYDE_CHALLENGE = { lockQuality: true, quality: 0.35, start: { method: "plain", ground: false } };

const GAO = { id: "hyde-2022", title: "L. Gao et al. (2022), Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)", url: "https://arxiv.org/abs/2212.10496" };
const DPR = { id: "dpr-2020", title: "V. Karpukhin et al. (2020), Dense Passage Retrieval for Open-Domain Question Answering, EMNLP", url: "https://arxiv.org/abs/2004.04906" };
const LEWIS = { id: "lewis-2020", title: "P. Lewis et al. (2020), Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks, NeurIPS", url: "https://arxiv.org/abs/2005.11401" };

export default definePack({
  id: "hyde",
  title: "Query Rewriting & HyDE",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Policy assistant · retrieval misses", detail: "short questions retrieve almost none of the right passages" },
    lines: [
      { speaker: "kabir", line: "People ask short questions and our passages are long formal paragraphs. Even good embeddings do not put them near each other." },
      { speaker: "meera", line: "A question and its answer do not look alike. So write a fake answer first, and search with that." },
    ],
  },
  predictions: [
    {
      id: "no-domain",
      kind: "choice",
      prompt: "HyDE asks an LLM to write a hypothetical answer, then searches with that. The domain is Pigeon's internal policies, which the model has never seen. What do you expect?",
      options: [
        { id: "great", label: "Large gains: HyDE always helps" },
        { id: "drift", label: "The invented answer is about the wrong thing and the search drifts toward the wrong documents" },
        { id: "same", label: "Exactly the same as searching with the question" },
        { id: "error", label: "An error" },
      ],
      answer: "drift",
      observe: "drifted",
      reveal: {
        text: "The hypothetical answer is only as good as the model's knowledge. With no knowledge of the domain it writes a plausible answer in generic terms, which lands near generic documents, not your policy pages. The lab's retrieval falls to nothing in the top 10.",
        derived: true,
        line: { speaker: "meera", line: "A made-up answer helps when the model could have made up the right one." },
      },
    },
  ],
  widget: { id: "hyde-lab", config: HYDE },
  mechanism: [
    {
      id: "gap",
      scene: "gap",
      text: "Questions and answers are phrased differently. A question is short and interrogative; the passage that answers it is long and declarative. Even good embedding models can place the question further from its answer than from unrelated text, especially for terse or ambiguous queries.",
      sourceIds: ["dpr-2020"],
    },
    {
      id: "hyde",
      scene: "hyde",
      text: "HyDE, hypothetical document embeddings, closes the gap. Ask an LLM to write a plausible answer to the question, then embed that answer and search with it. The made-up answer may be factually wrong, but it is phrased like a real document, so it lands among real answers, and the retriever finds the true ones.",
      sourceIds: ["hyde-2022"],
    },
    {
      id: "drift",
      scene: "drift",
      text: "The technique depends on the model. If the LLM knows nothing about your domain it writes a confident answer about something else, and the search moves toward the wrong documents. HyDE also adds an LLM call to every query: latency, cost, and a new thing that can fail.",
      sourceIds: ["hyde-2022"],
    },
    {
      id: "repair",
      text: "You can repair it by grounding. Retrieve a few passages with the plain query first and show them to the model when it writes the hypothetical answer, which gives it the vocabulary of your documents. The cost is a second retrieval and a longer prompt. As with every retrieval change, measure it on labelled queries before and after.",
      derived: true,
    },
  ],
  challenges: [
    {
      id: "internal-jargon",
      title: "Make HyDE work on jargon",
      brief: "Pigeon's policies use internal terms the LLM has not seen, so its answers are only 35% informed. Plain search finds none of the relevant passages in the top 10. Use HyDE well enough to find at least 6 of 10 relevant, keeping the added latency at or under 1.2 seconds.",
      line: { speaker: "rao", line: "An extra LLM call on every search is real money. Make sure it earns it." },
      widget: { id: "hyde-lab", config: HYDE_CHALLENGE },
      conditions: [
        { metric: "precisionAt10", op: ">=", value: 0.6, label: "At least 6 of the top 10 relevant" },
        { metric: "extraMs", op: "<=", value: 1200, label: "At most 1.2 s of added latency" },
      ],
      stars: [{ metric: "extraUsd", op: "<=", value: 0.005, label: "At most half a cent of added cost per query" }],
      hints: [
        "What does HyDE alone do when the model barely knows the domain?",
        "What could you show the model so its hypothetical answer uses your vocabulary?",
        "Check the added latency: grounding adds a retrieval step.",
      ],
    },
  ],
  explainBack: {
    prompt: "What is HyDE, why can it help retrieval, and when does it hurt?",
    rubric: [
      { id: "what", criterion: "An LLM writes a hypothetical answer to the question and the system embeds that answer to search", keyIdea: "search with a fake answer" },
      { id: "why", criterion: "Answers resemble documents more than questions do, so the hypothetical answer lands near real answers", keyIdea: "documents look like answers" },
      { id: "hurt", criterion: "If the model lacks domain knowledge the answer drifts to wrong documents, and it adds latency and cost per query", keyIdea: "drift, latency, cost" },
    ],
    exemplar:
      "HyDE has an LLM write a hypothetical answer to the question and then embeds that answer to search. Documents look more like answers than like questions, so the made-up answer lands near real ones even if its facts are wrong. It hurts when the model does not know the domain, because it then drifts toward the wrong documents, and it adds an LLM call of latency and cost to every query.",
  },
  reviews: [
    {
      id: "hy-pick",
      format: "pick-fix",
      scenario: "A medical question-answering system uses HyDE with a general model, and retrieved passages become less relevant than plain search. What is the most likely cause?",
      options: [
        { id: "a", label: "The general model's hypothetical answers use the wrong terminology for the domain, pulling the search off target" },
        { id: "b", label: "HyDE only works for legal text" },
        { id: "c", label: "The vector database is too small" },
        { id: "d", label: "The question is too long" },
      ],
      answer: "a",
      explain: "HyDE is only as good as the generator's grasp of the domain. Ground it with retrieved passages, use a domain-aware model, or fall back to plain search.",
    },
    {
      id: "hy-pick2",
      format: "pick-fix",
      scenario: "Users type very short, ambiguous queries like 'charge' into a support search. Which rewrite step helps most before embedding?",
      options: [
        { id: "a", label: "Expand the query with context from the conversation or page, or generate a fuller question" },
        { id: "b", label: "Remove all stop words" },
        { id: "c", label: "Lowercase it" },
        { id: "d", label: "Double the query text" },
      ],
      answer: "a",
      explain: "Rewriting adds the missing context so the embedding has something to work with. HyDE is one form of it; conversation-aware rewrites are another.",
    },
    {
      id: "hy-est",
      format: "estimate",
      scenario: "HyDE adds a 700 ms LLM call to each query and costs $0.003 per query. At 200,000 queries a day, about how many dollars a month is the extra cost?",
      unit: "$",
      answer: 18000,
      acceptFactor: 1.15,
      breakdown: ["$0.003 × 200,000 = $600 a day", "× 30", "= $18,000 a month"],
      explain: "A fraction of a cent per query is real money at volume, so it must buy a measurable retrieval gain.",
    },
    {
      id: "hy-order",
      format: "order",
      scenario: "Order these retrieval approaches by how many relevant passages they put in the top 10 when the model knows the domain well, fewest first.",
      items: [
        { id: "plain", label: "Search with the raw question" },
        { id: "hyde", label: "HyDE with a domain-aware model" },
        { id: "hyde-g", label: "HyDE grounded with retrieved passages" },
      ],
      answer: ["plain", "hyde", "hyde-g"],
      explain: "Each step gives the retriever a query nearer to real answers. Grounding adds the document vocabulary and costs a second retrieval.",
    },
    {
      id: "hy-flaw",
      format: "spot-flaw",
      scenario: "A system runs HyDE on every query, including exact product codes like 'SKU-88213', and results for code lookups got worse. Tap the step that hurts them.",
      diagram: {
        nodes: [
          { id: "q", label: "query 'SKU-88213'", kind: "client", col: 0, row: 1 },
          { id: "llm", label: "LLM invents a hypothetical answer", kind: "llm", col: 1, row: 1 },
          { id: "search", label: "vector search on the invented text", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "q", to: "llm" },
          { from: "llm", to: "search" },
        ],
      },
      answer: "q->llm",
      explain: "An exact identifier needs exact matching. Routing it through a model that invents an answer loses the code. Detect identifier queries and send them to keyword search.",
    },
    {
      id: "hy-explain",
      format: "explain",
      scenario: "In two sentences: why can a hypothetical answer that is factually wrong still retrieve the right documents?",
      rubric: [
        { id: "style", criterion: "It is phrased like a document in the corpus, so its embedding sits where real answers are" },
        { id: "topic", criterion: "Retrieval depends on topic and wording similarity, not on the facts being correct, so a plausible on-topic answer finds true on-topic documents" },
      ],
      exemplar: "The hypothetical answer is written in the style and vocabulary of real documents, so its embedding lands where answers live. Retrieval cares about topic and wording similarity, not about whether the made-up facts are right.",
      explain: "HyDE borrows the shape of an answer, not its truth.",
    },
  ],
  codex: {
    oneLiner: "HyDE searches with an LLM-written hypothetical answer, which sits nearer real answers than the question does. It needs a model that knows the domain.",
    keyNumbers: [
      { label: "HyDE overhead", value: "one extra LLM call per query", sourceId: "hyde-2022" },
      { label: "Question–answer gap", value: "queries and passages are phrased differently", sourceId: "dpr-2020" },
    ],
    tradeoffs: [
      { choice: "HyDE", gain: "Better retrieval for terse queries", cost: "Latency, money, and a new failure mode" },
      { choice: "Grounded HyDE", gain: "Works in jargon-heavy domains", cost: "A second retrieval and a longer prompt" },
      { choice: "Plain query rewriting", gain: "Cheap context for ambiguous queries", cost: "Needs conversation or page context" },
    ],
    seenIn: ["Query-expansion steps in RAG pipelines.", "Rewriters that turn chat turns into standalone search queries."],
    interviewAngle: "Offer HyDE as one tool, with its condition: 'it helps when queries are terse and the model knows the domain; I would A/B it against plain retrieval.'",
    aws: [{ concept: "Query expansion", service: "Bedrock Knowledge Bases query reformulation / Bedrock model invoke before retrieval" }],
    replay: { id: "hyde-lab", config: { start: { method: "hyde", quality: 0.85, ground: false } }, scene: "hyde" },
  },
  interview: [
    "What is HyDE and what problem does it address?",
    "When might HyDE make retrieval worse?",
    "How would you decide whether the extra LLM call is worth it?",
  ],
  deeper: [
    {
      title: "Related rewriting techniques",
      body: "HyDE is one of several query-side fixes. Multi-query retrieval has a model write several paraphrases of the question and merges the results; step-back prompting asks a broader question first; conversational rewriting turns a follow-up like 'and the second one?' into a standalone query using the history. All of them trade an LLM call for a better query, and all should be judged on a labelled retrieval set.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Questions and answers live in different regions of the lab's embedding space. HyDE moves the query toward the relevant documents by the model's quality, and toward the wrong region by what it lacks.",
    "The extra call adds about 700 ms and $0.003; showing the model retrieved passages first adds 400 ms and $0.002. Precision is measured over the 10 nearest of 200 documents, 40 relevant.",
  ],
  sources: [GAO, DPR, LEWIS],
  verify: [
    { id: "plain", claim: "Plain search finds none of the relevant passages in the top 10", run: "lab", params: { model: "hyde-lab", config: HYDE_CHALLENGE, values: { method: "plain" }, metric: "precisionAt10" }, expect: { max: 0 } },
    { id: "hyde-alone", claim: "HyDE alone with an uninformed model finds almost none", run: "lab", params: { model: "hyde-lab", config: HYDE_CHALLENGE, values: { method: "hyde" }, metric: "precisionAt10" }, expect: { max: 0.1 } },
    { id: "grounded", claim: "Grounded HyDE finds at least 6 of 10", run: "lab", params: { model: "hyde-lab", config: HYDE_CHALLENGE, values: { method: "hyde", ground: true }, metric: "precisionAt10" }, expect: { min: 0.6 } },
    { id: "grounded-ms", claim: "…within 1.2 s of added latency", run: "lab", params: { model: "hyde-lab", config: HYDE_CHALLENGE, values: { method: "hyde", ground: true }, metric: "extraMs" }, expect: { max: 1200 } },
    { id: "good-model", claim: "With a model that knows the domain HyDE finds most of them", run: "lab", params: { model: "hyde-lab", config: HYDE, values: { method: "hyde", quality: 0.85 }, metric: "precisionAt10" }, expect: { min: 0.6 } },
  ],
});
