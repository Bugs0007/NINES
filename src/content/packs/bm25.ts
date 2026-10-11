import { definePack } from "../define";

export const BM = { start: { query: "refund", k1: 1.2, b: 0.75 } };
export const BM_CHALLENGE = { start: { query: "refund", k1: 1.2, b: 0 } };

const ROBERTSON = { id: "robertson-2009", title: "S. Robertson and H. Zaragoza (2009), The Probabilistic Relevance Framework: BM25 and Beyond, Foundations and Trends in IR 3(4)", url: "https://doi.org/10.1561/1500000019" };
const ELASTIC_SIM = { id: "elastic-similarity", title: "Elasticsearch docs: Similarity module (BM25 is the default; k1 default 1.2, b default 0.75)", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-similarity.html" };
const IR_BOOK = { id: "manning-ir", title: "C. Manning, P. Raghavan, H. Schütze, Introduction to Information Retrieval, ch. 11: Probabilistic information retrieval (Okapi BM25)", url: "https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html" };

export default definePack({
  id: "bm25",
  title: "BM25 & Keyword Search",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "Search · 'refund' query", detail: "a long policy page outranks the one-line answer" },
    lines: [
      { speaker: "kabir", line: "Search for 'refund' and the first hit is a sprawling policy page that says the word three times. The one-line answer we actually want is third." },
      { speaker: "meera", line: "Keyword search is not simply counting. It weighs how rare a word is, how often it repeats, and how long the page is." },
    ],
  },
  predictions: [
    {
      id: "length",
      kind: "choice",
      prompt: "BM25 scores 'refund' for a one-line answer (9 words, the word once) and a long page (40 words, the word three times). With length normalisation switched off, which scores higher?",
      options: [
        { id: "short", label: "The one-line answer: it is more focused" },
        { id: "long", label: "The long page: it repeats the word more, and nothing penalises its length" },
        { id: "tie", label: "They tie" },
        { id: "zero", label: "Neither; one occurrence scores zero" },
      ],
      answer: "long",
      observe: "length-bias",
      reveal: {
        text: "With length normalisation off (b = 0), the score depends only on how often the term appears, with diminishing returns. Three mentions score about 1.6 times one mention, so the long page wins. Turning b up shrinks scores for long documents.",
        derived: true,
        line: { speaker: "meera", line: "Without a length penalty, being long is a way of looking relevant." },
      },
    },
  ],
  widget: { id: "bm25-lab", config: BM },
  mechanism: [
    {
      id: "idf",
      scene: "idf",
      text: "BM25 scores a document by summing over the query's words. Each word is weighted by its inverse document frequency: a word in few documents tells you a lot, a word in every document tells you nothing. So 'seven' matters more than 'the', and the rare word does the ranking.",
      sourceIds: ["robertson-2009", "manning-ir"],
    },
    {
      id: "tf",
      scene: "tf",
      text: "Term frequency counts how often the word appears in the document, but with diminishing returns controlled by k1. The tenth mention adds far less than the second, so repeating a word does not buy a high score. Larger k1 lets repetition count for longer; k1 of 0 ignores frequency beyond presence.",
      sourceIds: ["robertson-2009", "elastic-similarity"],
    },
    {
      id: "length",
      scene: "length",
      text: "Length normalisation, controlled by b, compares each document's length to the average. A long document has more chances to contain the word by accident, so its term frequency is discounted. b of 0 ignores length, 1 fully normalises, and 0.75 is the usual default.",
      sourceIds: ["elastic-similarity"],
    },
    {
      id: "use",
      text: "BM25 is fast, needs no model, and is excellent at exact words, names, and identifiers. It cannot match meaning: 'refunded' and 'refund' are different words unless you stem them, and a paraphrase scores zero. That gap is what embeddings fill, and why systems often combine the two.",
    },
  ],
  challenges: [
    {
      id: "tune-bm25",
      title: "Tune the ranking",
      brief: "Three queries should return a specific document first: 'refund' wants the concise policy, 'gift cards' wants the one-line answer, and 'pigeon chats' wants the only document about Pigeon. Set k1 and b so all three queries are answered correctly.",
      line: { speaker: "meera", line: "Check each query, because a setting that fixes one can break another." },
      widget: { id: "bm25-lab", config: BM_CHALLENGE },
      conditions: [{ metric: "rightCount", op: ">=", value: 3, label: "All 3 queries put the right document first" }],
      hints: [
        "Which query goes wrong with length normalisation off, and why?",
        "What does b do to the score of the 40-word page?",
        "Try the default values k1 = 1.2 and b = 0.75.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how BM25 scores a document, in terms of its three ingredients.",
    rubric: [
      { id: "idf", criterion: "Inverse document frequency weights rare terms more than common ones", keyIdea: "rare words matter more" },
      { id: "tf", criterion: "Term frequency counts occurrences with diminishing returns (saturation, k1)", keyIdea: "saturating term frequency" },
      { id: "length", criterion: "Length normalisation (b) discounts long documents, which would otherwise score higher by chance", keyIdea: "length normalisation" },
    ],
    exemplar:
      "BM25 sums a score for each query word. A word's weight is its inverse document frequency, so rare words count more. The document's score for the word grows with how often it appears but saturates, controlled by k1, so repeating a word does not run away. And it is normalised by document length, controlled by b, so a long document does not win just by having more room.",
  },
  reviews: [
    {
      id: "bm-est",
      format: "estimate",
      scenario: "A term appears in 1 of 1,000 documents. Using IDF = ln(1 + (N − n + 0.5) ÷ (n + 0.5)), roughly what is its IDF?",
      unit: "idf",
      answer: 6.5,
      acceptFactor: 1.1,
      breakdown: ["(1,000 − 1 + 0.5) ÷ (1 + 0.5) = 666", "ln(1 + 666)", "≈ 6.5 to 7"],
      explain: "A rare term gets a weight near 7, while a term in half the documents gets under 1.",
    },
    {
      id: "bm-pick",
      format: "pick-fix",
      scenario: "Users search 'refunded' and get nothing, but documents say 'refund' and 'refunds'. What is the usual fix in a keyword index?",
      options: [
        { id: "a", label: "Apply stemming or lemmatisation at index and query time" },
        { id: "b", label: "Lower k1" },
        { id: "c", label: "Increase b" },
        { id: "d", label: "Use a longer query" },
      ],
      answer: "a",
      explain: "Keyword search matches tokens, so word forms must be normalised to a common root. This is one place where embeddings are more forgiving.",
    },
    {
      id: "bm-pick2",
      format: "pick-fix",
      scenario: "Search results are dominated by very long documents that mention the query terms many times. Which BM25 parameter should you raise?",
      options: [
        { id: "a", label: "b, to penalise long documents more" },
        { id: "b", label: "k1, to let repetition count more" },
        { id: "c", label: "Neither; BM25 cannot be tuned" },
        { id: "d", label: "The IDF" },
      ],
      answer: "a",
      explain: "b controls length normalisation. Raising it shrinks the scores of documents much longer than average.",
    },
    {
      id: "bm-order",
      format: "order",
      scenario: "Order these query words by how much weight BM25 gives them, highest first, in a corpus where the document counts are shown.",
      items: [
        { id: "serial", label: "'E-4417' (in 1 document)" },
        { id: "refund", label: "'refund' (in 40 documents)" },
        { id: "policy", label: "'policy' (in 400 documents)" },
        { id: "the", label: "'the' (in every document)" },
      ],
      answer: ["serial", "refund", "policy", "the"],
      explain: "IDF falls as the word becomes more common. A word in every document has almost no weight.",
    },
    {
      id: "bm-graph",
      format: "predict-graph",
      scenario: "For one document, raise the number of times a query word appears from 1 to 20, with k1 = 1.2 and no length effect. How does its BM25 term score change?",
      xLabel: "occurrences →",
      yLabel: "term score",
      options: [
        { id: "linear", label: "Grows in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises, then levels off toward a ceiling", points: [1, 2.6, 3.7, 4.4, 4.9, 5.2, 5.4, 5.5] },
        { id: "flat", label: "Stays flat", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "peak", label: "Rises then falls", points: [1, 3, 5, 6, 5, 4, 3, 2] },
      ],
      answer: "sat",
      explain: "The saturation term tf × (k1 + 1) ÷ (tf + k1) approaches k1 + 1, so repetition stops paying quickly.",
    },
    {
      id: "bm-explain",
      format: "explain",
      scenario: "In two sentences: why can BM25 miss a relevant document that an embedding search finds?",
      rubric: [
        { id: "words", criterion: "BM25 matches the exact tokens, so a paraphrase with different words scores zero" },
        { id: "meaning", criterion: "Embeddings capture meaning, so documents with similar meaning but different words are found" },
      ],
      exemplar: "BM25 only scores words that appear in both the query and the document, so a paraphrase with different words gets nothing. Embeddings place similar meanings near each other, so they find it.",
      explain: "Keyword search is exact; embeddings are fuzzy.",
    },
  ],
  codex: {
    oneLiner: "BM25 scores by rare-word weight, saturating term frequency, and length normalisation. Fast, exact on words, blind to meaning.",
    keyNumbers: [
      { label: "BM25 defaults", value: "k1 = 1.2, b = 0.75", sourceId: "elastic-similarity" },
      { label: "IDF", value: "ln(1 + (N − n + 0.5) ÷ (n + 0.5))", sourceId: "robertson-2009" },
    ],
    tradeoffs: [
      { choice: "BM25", gain: "Fast, no model, precise on words, names, and IDs", cost: "No synonyms or paraphrase; needs stemming and analyzers" },
      { choice: "Higher b", gain: "Short focused documents compete with long ones", cost: "Genuinely long, relevant documents are penalised" },
    ],
    seenIn: ["Elasticsearch, OpenSearch, and Lucene default scoring.", "Postgres full-text ranking (ts_rank) is a similar idea."],
    interviewAngle: "Name the three parts: 'IDF for rarity, saturating term frequency, and length normalisation', and say it is the baseline to beat.",
    aws: [{ concept: "Keyword search", service: "Amazon OpenSearch Service (BM25 default)" }],
    replay: { id: "bm25-lab", config: BM, scene: "length" },
  },
  interview: [
    "How does BM25 differ from simple term-frequency counting?",
    "What do k1 and b control?",
    "When would you prefer BM25 to embeddings?",
  ],
  deeper: [
    {
      title: "Why keep BM25 in the age of embeddings",
      body: "Embedding models can fail on exact identifiers, rare names, and out-of-domain jargon, which is where keyword search is strongest. BM25 also needs no training, has no vector storage, and its scores are explainable down to the word. Benchmarks such as BEIR found BM25 a surprisingly strong baseline that many neural retrievers failed to beat on out-of-domain data.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Six short documents with Okapi BM25 computed exactly, with IDF = ln(1 + (N − n + 0.5) ÷ (n + 0.5)). The corpus is tiny, so IDF values are coarse.",
    "There is no stemming: 'refunded' and 'refund' are different words. Real analyzers stem, lowercase, and remove stop words.",
    "The documents are written so the failure shows. Real corpora are messier, and the right defaults depend on them.",
  ],
  sources: [ROBERTSON, ELASTIC_SIM, IR_BOOK],
  verify: [
    { id: "b0", claim: "With no length normalisation only one of the three queries is right", run: "lab", params: { model: "bm25-lab", config: BM_CHALLENGE, values: { k1: 1.2, b: 0 }, metric: "rightCount" }, expect: { max: 1 } },
    { id: "defaults", claim: "The default settings answer all three", run: "lab", params: { model: "bm25-lab", config: BM, values: { k1: 1.2, b: 0.75 }, metric: "rightCount" }, expect: { min: 3 } },
    { id: "k0", claim: "With k1 = 0 term frequency is ignored and queries go wrong", run: "lab", params: { model: "bm25-lab", config: BM, values: { k1: 0, b: 0.75 }, metric: "rightCount" }, expect: { max: 2 } },
  ],
});
