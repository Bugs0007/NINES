import { definePack } from "../define";

export const EMBED = { start: { query: "stuck", k: 7, rewrite: false } };
export const EMBED_CHALLENGE = { lockQuery: true, query: "charge", start: { query: "charge", k: 7, rewrite: false } };

const SBERT = { id: "sbert-2019", title: "N. Reimers and I. Gurevych (2019), Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks, EMNLP", url: "https://arxiv.org/abs/1908.10084" };
const WORD2VEC = { id: "word2vec-2013", title: "T. Mikolov et al. (2013), Efficient Estimation of Word Representations in Vector Space", url: "https://arxiv.org/abs/1301.3781" };
const MTEB = { id: "mteb-2022", title: "N. Muennighoff et al. (2022), MTEB: Massive Text Embedding Benchmark", url: "https://arxiv.org/abs/2210.07316" };
const ANTHROPIC_EMB = { id: "anthropic-embeddings", title: "Anthropic docs: Embeddings (text to vectors, similarity search, embedding providers)", url: "https://docs.anthropic.com/en/docs/build-with-claude/embeddings" };

export default definePack({
  id: "embeddings",
  title: "Embeddings: Text as Vectors",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "Help centre search · zero-result rate", detail: "31% of searches return nothing" },
    lines: [
      { speaker: "kabir", line: "People search 'my money is stuck' and the help centre has an article called 'Refund timelines', but the keywords do not overlap, so they get nothing." },
      { speaker: "meera", line: "Keyword search matches letters. An embedding puts meanings on a map, so those two land next to each other." },
    ],
  },
  predictions: [
    {
      id: "no-shared-words",
      kind: "choice",
      prompt: "A user searches 'my money is stuck'. The help centre has 'refund policy' and 'charged twice' articles, which share no words with the query. Which approach finds them?",
      options: [
        { id: "keyword", label: "Keyword search, because they are about money" },
        { id: "embed", label: "Embedding search, because the meanings are close even without shared words" },
        { id: "neither", label: "Neither: the words must match" },
        { id: "both", label: "Both equally" },
      ],
      answer: "embed",
      observe: "searched",
      reveal: {
        text: "An embedding model maps text to a vector so that texts with similar meaning land close together. 'My money is stuck' sits in the billing neighbourhood next to refund and double-charge articles, with no word in common. Keyword search needs the words to match.",
        sourceIds: ["sbert-2019"],
        line: { speaker: "meera", line: "Distance in the space stands in for similarity of meaning." },
      },
    },
  ],
  widget: { id: "embed-lab", config: EMBED },
  mechanism: [
    {
      id: "vector",
      scene: "space",
      text: "An embedding model turns a piece of text into a list of numbers, a vector with hundreds or thousands of dimensions. It is trained so that texts with similar meaning get nearby vectors, which is why a search for a meaning can find texts that share none of its words.",
      sourceIds: ["sbert-2019", "word2vec-2013"],
    },
    {
      id: "search",
      text: "Search then becomes geometry. Embed every document once and store the vectors. To search, embed the query with the same model, and return the documents whose vectors are nearest. Top-k returns a fixed count; a similarity threshold returns whatever is close enough.",
      sourceIds: ["anthropic-embeddings"],
    },
    {
      id: "ambiguous",
      scene: "ambiguous",
      text: "Short or ambiguous queries land in between. 'Charge' could mean a payment or a battery, so its vector sits between the billing and device neighbourhoods and the nearest results are a mix. The model cannot know which you meant; more words give it more to go on.",
      derived: true,
    },
    {
      id: "rewrite",
      scene: "rewrite",
      text: "So add context before searching. Rewriting 'charge' as 'charge on my card', using the conversation or a small model, moves the query into the right neighbourhood. Embeddings capture meaning as the model learned it, and benchmarks like MTEB show how differently models perform by task, so evaluate on your own data.",
      sourceIds: ["mteb-2022"],
    },
  ],
  challenges: [
    {
      id: "ambiguous-query",
      title: "Search for 'charge'",
      brief: "Users type 'charge', meaning a payment charge. There are 7 billing articles, and the query sits between billing and device articles. Make the search return at least 85% of the billing articles with at least 85% of results relevant, using top-7.",
      line: { speaker: "kabir", line: "I cannot make users type longer queries. Can the system?" },
      widget: { id: "embed-lab", config: EMBED_CHALLENGE },
      conditions: [
        { metric: "precision", op: ">=", value: 0.85, label: "At least 85% of results relevant" },
        { metric: "recall", op: ">=", value: 0.85, label: "At least 85% of billing articles found" },
      ],
      stars: [{ metric: "found", op: ">=", value: 7, label: "All 7 billing articles" }],
      hints: [
        "Look at where the query lands. Which neighbourhoods are nearest?",
        "A different value of k will not help when the neighbours are a mix. What would move the query itself?",
        "Add context to the query before it is embedded.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what an embedding is and how embedding search works, including one failure mode.",
    rubric: [
      { id: "vector", criterion: "An embedding maps text to a vector so similar meanings are near each other", keyIdea: "meaning as position" },
      { id: "search", criterion: "Documents are embedded in advance, the query is embedded with the same model, and the nearest vectors are returned", keyIdea: "embed both, find nearest" },
      { id: "fail", criterion: "Names a failure: ambiguous or short queries land between meanings, or the model does not know your domain", keyIdea: "ambiguity and domain mismatch" },
    ],
    exemplar:
      "An embedding model maps text to a vector so that texts with similar meaning sit close together. I embed every document ahead of time, embed the query with the same model, and return the nearest vectors, which finds matches that share no words. It fails when the query is ambiguous and lands between meanings, or when the model has not seen my domain, so I add context to short queries and evaluate on my own data.",
  },
  reviews: [
    {
      id: "em-pick",
      format: "pick-fix",
      scenario: "Users search for exact error codes like 'E-4417', and embedding search returns articles about errors in general. What is the likely issue?",
      options: [
        { id: "a", label: "Embeddings capture meaning, not exact strings; combine with keyword search for identifiers" },
        { id: "b", label: "The vector dimension is too small" },
        { id: "c", label: "The index is stale" },
        { id: "d", label: "Use a bigger k" },
      ],
      answer: "a",
      explain: "Exact tokens like codes, names, and IDs are what keyword search is for. A hybrid of both covers meaning and exactness.",
    },
    {
      id: "em-pick2",
      format: "pick-fix",
      scenario: "You re-embed documents with a newer embedding model but leave old query code embedding queries with the previous model. Search quality collapses. Why?",
      options: [
        { id: "a", label: "Vectors from different models live in different spaces; queries and documents must use the same model" },
        { id: "b", label: "Newer models need more RAM" },
        { id: "c", label: "The index needs more shards" },
        { id: "d", label: "Cosine similarity stopped working" },
      ],
      answer: "a",
      explain: "Each model defines its own space, so distances across models are meaningless. When you change models, re-embed everything and the queries together.",
    },
    {
      id: "em-est",
      format: "estimate",
      scenario: "You store 10 million documents as 1,536-dimension float32 vectors. About how many GB do the vectors take?",
      unit: "GB",
      answer: 61,
      acceptFactor: 1.2,
      breakdown: ["1,536 × 4 bytes = 6,144 bytes per vector", "× 10,000,000", "= 61 GB"],
      explain: "Vectors are bigger than the text they describe. This is why dimension and quantisation matter at scale.",
    },
    {
      id: "em-order",
      format: "order",
      scenario: "Order these query-document pairs by how close their embeddings are likely to be, closest first.",
      items: [
        { id: "para", label: "'my money is stuck' and 'refund policy'" },
        { id: "same", label: "'refund policy' and 'return policy'" },
        { id: "off", label: "'refund policy' and 'battery charging'" },
        { id: "same2", label: "'refund policy' and 'refund policy'" },
      ],
      answer: ["same2", "same", "para", "off"],
      explain: "Identical text is the closest, a synonym next, then a paraphrase in the same neighbourhood, and last an unrelated topic.",
    },
    {
      id: "em-flaw",
      format: "spot-flaw",
      scenario: "The help search embeds each user query as typed, and the single word 'charge' returns a mix of billing and battery articles. Tap the step that lacks context.",
      diagram: {
        nodes: [
          { id: "user", label: "user types 'charge'", kind: "client", col: 0, row: 1 },
          { id: "embed", label: "embed the raw query", kind: "llm", col: 1, row: 1 },
          { id: "index", label: "vector index", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "user", to: "embed" },
          { from: "embed", to: "index" },
        ],
      },
      answer: "user->embed",
      explain: "A one-word query is ambiguous and the model has nothing else to go on. Add context from the page, the conversation, or a rewrite step before embedding.",
    },
    {
      id: "em-explain",
      format: "explain",
      scenario: "In two sentences: why does embedding search find documents that share no words with the query?",
      rubric: [
        { id: "meaning", criterion: "The model maps text to vectors so that similar meanings are close, regardless of the exact words" },
        { id: "nearest", criterion: "Search returns the nearest vectors, so semantically similar documents match" },
      ],
      exemplar: "The embedding model is trained so texts with similar meaning get nearby vectors, whatever words they use. Search simply returns the nearest vectors, so related documents match without shared words.",
      explain: "The words are gone; the meaning remains.",
    },
  ],
  codex: {
    oneLiner: "An embedding maps text to a vector so similar meanings are near each other. Search embeds the query and returns the nearest documents.",
    keyNumbers: [
      { label: "Typical embedding size", value: "hundreds to a few thousand dimensions", sourceId: "mteb-2022" },
      { label: "Storage per vector", value: "dimensions × 4 bytes (float32)", sourceId: "sbert-2019" },
    ],
    tradeoffs: [
      { choice: "Embedding search", gain: "Finds meaning without shared words", cost: "Weak on exact identifiers; domain and ambiguity problems" },
      { choice: "Bigger embedding models", gain: "Better quality on many tasks", cost: "More compute, storage, and latency" },
    ],
    seenIn: ["Semantic search in help centres and codebases.", "The retrieval step of RAG systems."],
    interviewAngle: "Say what the vectors are for: 'embed documents once, embed the query at search time with the same model, and return the nearest', then name the pitfalls.",
    aws: [{ concept: "Embedding models and vector search", service: "Amazon Bedrock embeddings; OpenSearch / pgvector for storage" }],
    replay: { id: "embed-lab", config: EMBED, scene: "space" },
  },
  interview: [
    "What is an embedding, and how is it used for search?",
    "Why must queries and documents use the same embedding model?",
    "When does embedding search fail?",
  ],
  deeper: [
    {
      title: "How the space is learned",
      body: "Embedding models are trained with a contrastive objective: pairs of texts that belong together, such as a question and its answer, are pulled close in the space while mismatched pairs are pushed apart. After training on millions of pairs, nearness reflects the relationships in that data, which is why an embedding model trained on web text may be weaker on legal or medical jargon.",
      sourceIds: ["sbert-2019"],
    },
  ],
  honestPhysics: [
    "The space is flattened to two dimensions with phrases placed by hand into four neighbourhoods. Real embeddings have hundreds or thousands of dimensions and phrases land where a trained model puts them.",
    "A rewritten query moves 70% of the way toward the intended neighbourhood, a stand-in for what added context does.",
    "Relevance is the neighbourhood the searcher meant: 7 phrases per neighbourhood.",
  ],
  sources: [SBERT, WORD2VEC, MTEB, ANTHROPIC_EMB],
  verify: [
    { id: "clean", claim: "A clear billing query returns only billing phrases in the top 7", run: "lab", params: { model: "embed-lab", config: EMBED, values: { query: "stuck", k: 7 }, metric: "precision" }, expect: { min: 1, max: 1 } },
    { id: "ambiguous", claim: "The ambiguous query returns a mix", run: "lab", params: { model: "embed-lab", config: EMBED_CHALLENGE, values: {}, metric: "precision" }, expect: { max: 0.5 } },
    { id: "rewrite", claim: "Rewriting the query fixes it", run: "lab", params: { model: "embed-lab", config: EMBED_CHALLENGE, values: { rewrite: true }, metric: "precision" }, expect: { min: 0.85 } },
    { id: "rewrite-recall", claim: "…and finds all the billing articles", run: "lab", params: { model: "embed-lab", config: EMBED_CHALLENGE, values: { rewrite: true }, metric: "recall" }, expect: { min: 0.85 } },
  ],
});
