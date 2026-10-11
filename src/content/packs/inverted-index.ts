import { definePack } from "../define";

export const INV = { start: { strategy: "skip", positions: false } };
export const INV_CHALLENGE = {};

const IR_BOOK = { id: "manning-ir", title: "C. Manning, P. Raghavan, H. Schütze, Introduction to Information Retrieval, ch. 1-2: Boolean retrieval, building an inverted index", url: "https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html" };
const IR_SKIP = { id: "manning-skip", title: "Introduction to Information Retrieval, ch. 2.3: Faster postings list intersection via skip pointers", url: "https://nlp.stanford.edu/IR-book/html/htmledition/faster-postings-list-intersection-via-skip-pointers-1.html" };
const LUCENE = { id: "lucene-docs", title: "Apache Lucene documentation: index file formats (postings, positions)", url: "https://lucene.apache.org/core/9_9_0/core/org/apache/lucene/codecs/lucene99/package-summary.html" };

export default definePack({
  id: "inverted-index",
  title: "Inverted Indexes",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "search · full-text query takes 20 seconds", detail: "LIKE '%invoice%' over 10 million documents" },
    lines: [
      { speaker: "kabir", line: "Search for a word over ten million documents takes twenty seconds, because the database reads every document and looks for it. Nothing about the query is complicated." },
      { speaker: "meera", line: "Flip the table around. Instead of listing the words in each document, list the documents for each word, and a search becomes a lookup." },
    ],
  },
  predictions: [
    {
      id: "scan",
      kind: "choice",
      prompt: "10 million documents of 2 KB are searched by reading each one, at about 2 microseconds a document. How long does one query take?",
      options: [
        { id: "ms", label: "About 20 milliseconds" },
        { id: "s2", label: "About 2 seconds" },
        { id: "s20", label: "About 20 seconds" },
        { id: "min", label: "About 20 minutes" },
      ],
      answer: "s20",
      observe: "slow-query",
      reveal: {
        text: "10 million × 2 µs is 20 seconds, and it grows with the corpus: twice the documents, twice the time, whatever the query. An inverted index precomputes, for each word, the documents containing it, so a query reads only the lists for its words.",
        derived: true,
        line: { speaker: "meera", line: "Do the reading once, at index time, instead of on every search." },
      },
    },
    {
      id: "positions",
      kind: "choice",
      prompt: "The index takes 5 GB for a 20 GB corpus. You add word positions so that phrase searches like \"credit note\" work. How big is the index now?",
      options: [
        { id: "same", label: "About the same, 5 GB" },
        { id: "double", label: "About 12 GB, more than twice as large" },
        { id: "huge", label: "About 50 GB" },
      ],
      answer: "double",
      observe: "big-index",
      reveal: {
        text: "Each posting now carries the positions of the term in the document, so a word that appears ten times is ten numbers instead of one. In the lab the index grows from 25% to 60% of the corpus, 12 GB. Store positions only for fields where phrase search matters.",
        derived: true,
        line: { speaker: "rao", line: "Every feature in a search index is paid for in bytes." },
      },
    },
  ],
  widget: { id: "invindex-lab", config: INV },
  mechanism: [
    {
      id: "idea",
      scene: "scan",
      text: "A forward index maps each document to its words. An inverted index reverses it: each term maps to a posting list of the sorted ids of documents containing it. Searching for a word becomes a dictionary lookup that returns a list, not a scan of the corpus. Text is first split into tokens and normalised, lower-cased and stemmed.",
      sourceIds: ["manning-ir"],
    },
    {
      id: "and",
      scene: "merge",
      text: "A query for two terms joined by AND intersects their posting lists. Merging walks both sorted lists in step, costing about the sum of their lengths: fast for short lists, slow when one term is very common and its list has millions of entries. Process the shortest list first, as it bounds the result.",
      sourceIds: ["manning-ir"],
    },
    {
      id: "skip",
      scene: "skip",
      text: "Skip pointers let the long list be jumped through. For each entry of the short list the search leaps ahead in the long one, so the cost is the short list's length times the logarithm of the long one's. Rare AND common becomes a thousand probes, not five million steps. This is why order and list lengths matter.",
      sourceIds: ["manning-skip", "lucene-docs"],
    },
    {
      id: "size",
      text: "An index trades space and update work for query speed. Postings are compressed, typically to a fraction of the corpus, and word positions, needed for phrases, enlarge it. New documents go into small segments that are searched together and merged in the background, so search is near-real-time rather than instant.",
      sourceIds: ["lucene-docs", "manning-ir"],
    },
  ],
  challenges: [
    {
      id: "search-engine",
      title: "Build the search",
      brief: "10 million documents. A typical query is a rare term (1,000 documents) AND a common term (5 million), and users also search for exact phrases. Choose the strategy so the query takes at most 10 ms, the index is at most 15 GB, and phrase search works.",
      line: { speaker: "kabir", line: "Users type two words and expect an answer before they finish blinking." },
      widget: { id: "invindex-lab", config: INV_CHALLENGE },
      conditions: [
        { metric: "queryMs", op: "<=", value: 10, label: "Query at most 10 ms" },
        { metric: "indexGB", op: "<=", value: 15, label: "Index at most 15 GB" },
        { metric: "phraseOk", op: ">=", value: 1, label: "Phrase search works" },
      ],
      stars: [],
      hints: [
        "What does a scan cost on 10 million documents?",
        "What does merging cost when one list has 5 million entries?",
        "What does phrase search need the index to remember?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain an inverted index and why query time depends on posting list lengths.",
    rubric: [
      { id: "idea", criterion: "An inverted index maps each term to a sorted list of documents containing it, so search is a lookup not a scan", keyIdea: "term to document list" },
      { id: "and", criterion: "AND queries intersect posting lists, costing about the lengths of the lists when merged, less with skip pointers starting from the shortest", keyIdea: "intersect, shortest first" },
      { id: "size", criterion: "Positions enable phrase search but enlarge the index; new documents arrive in small segments merged later", keyIdea: "space and update trade-offs" },
    ],
    exemplar:
      "An inverted index maps each term to a sorted list of the documents that contain it, so a search is a lookup instead of a scan of every document. An AND query intersects the lists, and merging costs about the sum of their lengths, which is poor when one term is very common, so engines start from the shortest list and probe the longer one with skip pointers. Storing word positions allows phrase search but makes the index much larger, and new documents go into small segments that are merged in the background.",
  },
  reviews: [
    {
      id: "ii-est",
      format: "estimate",
      scenario: "Two posting lists have 2,000 and 3,000,000 entries. Merging them walks both at 10 ns an entry. About how long does the intersection take, in milliseconds?",
      unit: "ms",
      answer: 30,
      acceptFactor: 1.1,
      breakdown: ["(2,000 + 3,000,000) × 10 ns", "= 30,020,000 ns", "≈ 30 ms"],
      explain: "The long list dominates. Probing it from the short list would take about 2,000 × 22 × 10 ns, under half a millisecond.",
    },
    {
      id: "ii-pick",
      format: "pick-fix",
      scenario: "A search for 'the AND rareword' is slow because 'the' appears in 9 of 10 documents. What is the best change?",
      options: [
        { id: "a", label: "Intersect starting from the rare term's list and probe the long one, or treat 'the' as a stop word" },
        { id: "b", label: "Add more RAM" },
        { id: "c", label: "Scan the documents instead" },
        { id: "d", label: "Remove the index" },
      ],
      answer: "a",
      explain: "Very common words add almost no information. Starting from the shortest list bounds the work by the rare term.",
    },
    {
      id: "ii-order",
      format: "order",
      scenario: "Order these approaches by time for a rare AND common query over 10 million documents, slowest first.",
      items: [
        { id: "scan", label: "Scan every document" },
        { id: "merge", label: "Merge the two lists" },
        { id: "skip", label: "Probe the long list from the short one" },
      ],
      answer: ["scan", "merge", "skip"],
      explain: "20 seconds, 50 milliseconds, 0.2 milliseconds: each step uses more of what the index knows.",
    },
    {
      id: "ii-graph",
      format: "predict-graph",
      scenario: "A rare term appears in 1,000 documents. As the common term's list grows from 10,000 to 10 million entries, how does the query time change under merging, and under probing from the short list?",
      xLabel: "common term's list length →",
      yLabel: "query time",
      options: [
        { id: "diverge", label: "Merging grows in proportion; probing barely grows", points: [0.2, 0.5, 1, 5, 10, 25, 50, 100] },
        { id: "same", label: "Both grow in proportion", points: [0.2, 0.5, 1, 5, 10, 25, 50, 100] },
        { id: "flat", label: "Neither changes", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "diverge",
      explain: "Merging reads the long list; probing is bounded by the short list times the logarithm of the long one, which grows slowly.",
    },
    {
      id: "ii-flaw",
      format: "spot-flaw",
      scenario: "A team indexes documents but searches with LIKE '%term%' on the original text column for 'flexibility'. The query still takes seconds. Tap the step that ignores the index.",
      diagram: {
        nodes: [
          { id: "query", label: "user query", kind: "client", col: 0, row: 1 },
          { id: "like", label: "WHERE body LIKE '%term%'", kind: "server", col: 1, row: 1 },
          { id: "index", label: "inverted index (unused)", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "query", to: "like" },
          { from: "like", to: "index" },
        ],
      },
      answer: "like->index",
      explain: "A leading wildcard cannot use a normal index, and the query never touches the inverted index. Use the full-text query operators that read the posting lists.",
    },
    {
      id: "ii-explain",
      format: "explain",
      scenario: "In two sentences: why does a search index lag slightly behind new documents?",
      rubric: [
        { id: "segments", criterion: "New documents are written into small segments that are made searchable in batches rather than updating the big structure in place" },
        { id: "merge", criterion: "Background merges combine segments, so freshness trades against indexing cost" },
      ],
      exemplar: "New documents are written into small segments that become searchable in periodic batches, not by editing the large index in place. Segments are merged in the background, so freshness trades against indexing cost.",
      explain: "Near-real-time, not real-time.",
    },
  ],
  codex: {
    oneLiner: "An inverted index maps each term to a sorted list of documents. AND queries intersect lists from the shortest; positions add phrase search and size.",
    keyNumbers: [
      { label: "Merge cost", value: "sum of the list lengths", sourceId: "manning-ir" },
      { label: "Skip-pointer cost", value: "short list × log(long list)", sourceId: "manning-skip" },
    ],
    tradeoffs: [
      { choice: "Inverted index", gain: "Search without scanning", cost: "Space, and update work in segments" },
      { choice: "Storing positions", gain: "Phrase and proximity search", cost: "Index grows from about 25% to 60% of the corpus (lab)" },
      { choice: "Frequent segment merges", gain: "Faster queries, smaller index", cost: "Heavier indexing load" },
    ],
    seenIn: ["Lucene, Elasticsearch, OpenSearch and Solr.", "Postgres full-text search with GIN indexes."],
    interviewAngle: "Say: 'term to sorted posting list, intersect from the shortest, positions only where phrase search is needed, new data in segments merged later'.",
    aws: [{ concept: "Managed search", service: "Amazon OpenSearch Service" }],
    replay: { id: "invindex-lab", config: INV, scene: "skip" },
  },
  interview: [
    "What is an inverted index?",
    "How does a search engine answer a multi-word query?",
    "Why is search not instantly up to date?",
  ],
  deeper: [
    {
      title: "Ranking comes after retrieval",
      body: "The index finds the candidate documents; a ranking function then orders them, usually BM25 over term frequencies and document lengths, sometimes re-ranked by a learned model. Retrieval must be fast and cover everything relevant, and ranking can be slow because it only sees the shortlist.",
      sourceIds: ["manning-ir"],
    },
  ],
  honestPhysics: [
    "10 million documents of 2 KB, 20 GB. A query asks for a rare term (1,000 documents) AND a common term (5 million).",
    "Scanning costs 2 microseconds a document, 20 seconds. Merging the lists costs (1,000 + 5,000,000) × 10 ns = 50 ms. Probing the long list from the short one costs 1,000 × log₂(5,000,000) × 10 ns, about 0.2 ms.",
    "The index takes 25% of the corpus size, 5 GB; with word positions 60%, 12 GB.",
  ],
  sources: [IR_BOOK, IR_SKIP, LUCENE],
  verify: [
    { id: "scan", claim: "Scanning takes 20 seconds", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "scan" }, metric: "queryMs" }, expect: { min: 20000, max: 20000 } },
    { id: "merge", claim: "Merging takes about 50 ms", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "merge" }, metric: "queryMs" }, expect: { min: 49, max: 51 } },
    { id: "skip", claim: "Probing takes about 0.2 ms", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "skip" }, metric: "queryMs" }, expect: { max: 1 } },
    { id: "size", claim: "Without positions the index is 5 GB", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "skip", positions: false }, metric: "indexGB" }, expect: { min: 5, max: 5 } },
    { id: "size-pos", claim: "With positions it is 12 GB", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "skip", positions: true }, metric: "indexGB" }, expect: { min: 12, max: 12 } },
    { id: "phrase", claim: "Only an index with positions supports phrase search", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "skip", positions: true }, metric: "phraseOk" }, expect: { min: 1 } },
    { id: "no-phrase", claim: "…and not without them", run: "lab", params: { model: "invindex-lab", config: INV_CHALLENGE, values: { strategy: "skip", positions: false }, metric: "phraseOk" }, expect: { max: 0 } },
  ],
});
