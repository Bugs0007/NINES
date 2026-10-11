import { definePack } from "../define";

export const CHUNK = { span: 150, lockK: true, k: 5, start: { size: 256, overlap: 0 } };
export const CHUNK_CHALLENGE = { span: 150, lockK: true, k: 5, start: { size: 1024, overlap: 0 } };

const PINECONE = { id: "pinecone-chunking", title: "Pinecone Learning Center: Chunking strategies for LLM applications", url: "https://www.pinecone.io/learn/chunking-strategies/" };
const CTX_RETRIEVAL = { id: "anthropic-contextual-retrieval", title: "Anthropic: Introducing Contextual Retrieval (adding document context to each chunk before embedding)", url: "https://www.anthropic.com/news/contextual-retrieval" };
const LIU = { id: "liu-2023", title: "N. Liu et al. (2023), Lost in the Middle: How Language Models Use Long Contexts, TACL", url: "https://arxiv.org/abs/2307.03172" };

export default definePack({
  id: "chunking",
  title: "Chunking Strategies",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Policy assistant · wrong answers", detail: "the retrieved text is the right page, but it is the wrong half of it" },
    lines: [
      { speaker: "kabir", line: "The assistant keeps quoting the first half of a refund rule and missing the exception that comes right after. The right document was retrieved." },
      { speaker: "meera", line: "The document was cut in the middle of the answer. How you cut it decides what the model can ever see." },
    ],
  },
  predictions: [
    {
      id: "boundary",
      kind: "choice",
      prompt: "A document is split into 256-token chunks with no overlap. The sentence that answers a question needs about 150 tokens, and sits at a random place. How often does a single chunk contain the whole of it?",
      options: [
        { id: "all", label: "Always: 256 is bigger than 150" },
        { id: "most", label: "About 80% of the time" },
        { id: "less", label: "About 40% of the time" },
        { id: "never", label: "Almost never" },
      ],
      answer: "less",
      observe: "overlap-used",
      reveal: {
        text: "A 150-token span fits inside a 256-token chunk only if it starts in the first 106 tokens of that chunk, so about 106 ÷ 256, or 41%, of spans are whole. The rest are cut across a boundary, and neither chunk holds the full answer.",
        derived: true,
        line: { speaker: "meera", line: "Chunk boundaries are cuts through the middle of ideas. Overlap sews them back." },
      },
    },
  ],
  widget: { id: "chunk-lab", config: CHUNK },
  mechanism: [
    {
      id: "why",
      text: "Documents are too long to embed whole and too long to paste into every prompt, so they are split into chunks, each embedded and retrieved on its own. The chunk is the unit the retriever can return and the model can read, so the cut points decide what an answer can be built from.",
      sourceIds: ["pinecone-chunking"],
    },
    {
      id: "small",
      scene: "small",
      text: "Chunks that are too small cut ideas apart: an answer spread across two chunks is found in neither whole. Chunks smaller than the answer's span can never contain it. Overlapping neighbouring chunks by a fraction of their size lets a boundary-crossing answer sit whole in at least one chunk.",
      sourceIds: ["pinecone-chunking"],
      derived: true,
    },
    {
      id: "big",
      scene: "big",
      text: "Chunks that are too big dilute the embedding. A 1,500-token chunk containing one relevant paragraph is mostly about other things, so its vector points between topics and ranks lower than a focused chunk would. Big chunks also use more of the model's context and cost more per query.",
      sourceIds: ["liu-2023"],
      derived: true,
    },
    {
      id: "smarter",
      scene: "overlap",
      text: "Split on structure where you can: headings, paragraphs, sentences, code blocks, rather than at a fixed length. Then pick a size near the size of a typical answer, add some overlap, and consider adding a line of document context to each chunk before embedding, which helps a chunk that says 'the company' know which one.",
      sourceIds: ["anthropic-contextual-retrieval"],
    },
  ],
  challenges: [
    {
      id: "chunk-size",
      title: "Size the chunks",
      brief: "Answers span about 150 tokens. The index uses 1,024-token chunks with no overlap, and the model gets 5 chunks per question. Choose chunk size and overlap so at least 85% of questions are answered by the retrieved chunks, the index grows at most 1.5 times from overlap, and no more than 3,000 tokens go to the model.",
      line: { speaker: "rao", line: "Overlap is storage, and bigger chunks are tokens on every question. Pay for neither more than you need." },
      widget: { id: "chunk-lab", config: CHUNK_CHALLENGE },
      conditions: [
        { metric: "quality", op: ">=", value: 0.85, label: "At least 85% of questions answered" },
        { metric: "indexMultiplier", op: "<=", value: 1.5, label: "Index at most 1.5× larger from overlap" },
        { metric: "tokensToLlm", op: "<=", value: 3000, label: "At most 3,000 tokens sent to the model" },
      ],
      stars: [{ metric: "quality", op: ">=", value: 0.89, label: "At least 89% answered" }],
      hints: [
        "How well do 1,024-token chunks rank, compared with chunks near the answer's size?",
        "With no overlap, how often is a 150-token answer cut across a boundary?",
        "Aim a little above the span, with about a third of the chunk as overlap.",
      ],
    },
  ],
  explainBack: {
    prompt: "How do you choose a chunking strategy for a retrieval system?",
    rubric: [
      { id: "size", criterion: "Chunks near the size of a typical answer: too small cuts ideas apart, too large dilutes the embedding and wastes context", keyIdea: "size near the answer" },
      { id: "overlap", criterion: "Overlap lets answers that cross a boundary appear whole in a chunk, at the cost of a larger index", keyIdea: "overlap sews boundaries" },
      { id: "structure", criterion: "Prefer structure-aware splits (headings, paragraphs) and test on real questions", keyIdea: "split on structure, test" },
    ],
    exemplar:
      "I size chunks near the length of a typical answer: smaller cuts ideas across boundaries and larger dilutes the embedding and wastes context. I add overlap so an answer that crosses a boundary appears whole in at least one chunk, accepting a bigger index. I split on structure like headings and paragraphs where possible, and I test candidate settings on real questions rather than guessing.",
  },
  reviews: [
    {
      id: "ch-est-cover",
      format: "estimate",
      scenario: "Chunks are 400 tokens with 100 tokens of overlap. A 150-token answer sits at a random place. What share of answers falls whole inside some chunk? (min(1, (C − span) ÷ (C − overlap)))",
      unit: "%",
      answer: 83,
      acceptFactor: 1.1,
      breakdown: ["(400 − 150) ÷ (400 − 100)", "= 250 ÷ 300", "≈ 83%"],
      explain: "Chunks start every 300 tokens, and an answer is whole if it starts in the first 250 tokens of a chunk.",
    },
    {
      id: "ch-est-index",
      format: "estimate",
      scenario: "Chunks are 500 tokens with 250 tokens of overlap. By what factor does the index grow compared with no overlap?",
      unit: "×",
      answer: 2,
      acceptFactor: 1.1,
      breakdown: ["C ÷ (C − overlap)", "500 ÷ 250", "= 2×"],
      explain: "Half-overlap stores every token twice. Overlap is cheap insurance, but it is not free.",
    },
    {
      id: "ch-pick",
      format: "pick-fix",
      scenario: "Source documents are Markdown with clear headings, and fixed 512-token chunks keep splitting a section's table from its caption. What do you change?",
      options: [
        { id: "a", label: "Split by headings and paragraphs, merging small sections and splitting large ones, and keep tables with their captions" },
        { id: "b", label: "Use 128-token chunks" },
        { id: "c", label: "Use 4,096-token chunks" },
        { id: "d", label: "Shuffle the chunks" },
      ],
      answer: "a",
      explain: "Structure-aware splitting follows the way the author organised the ideas, so related text stays together.",
    },
    {
      id: "ch-order",
      format: "order",
      scenario: "Order these chunk settings by how well they answer 150-token questions, best first.",
      items: [
        { id: "good", label: "450 tokens, 150 overlap" },
        { id: "o0", label: "450 tokens, no overlap" },
        { id: "big", label: "1,500 tokens, no overlap" },
        { id: "tiny", label: "100 tokens, no overlap" },
      ],
      answer: ["good", "o0", "big", "tiny"],
      explain: "Chunks smaller than the answer can never hold it, so they are worst. Big chunks hold it but dilute it. Overlap beats no overlap at the right size.",
    },
    {
      id: "ch-flaw",
      format: "spot-flaw",
      scenario: "A RAG index uses one chunk per whole 20-page contract, and answers are often wrong or vague though retrieval 'works'. Tap the design choice.",
      diagram: {
        nodes: [
          { id: "docs", label: "20-page contracts", kind: "store", col: 0, row: 1 },
          { id: "chunks", label: "one 15,000-token chunk per contract", kind: "store", col: 1, row: 1 },
          { id: "llm", label: "model gets the top 3 chunks", kind: "llm", col: 2, row: 1 },
        ],
        edges: [
          { from: "docs", to: "chunks" },
          { from: "chunks", to: "llm" },
        ],
      },
      answer: "chunks",
      explain: "One vector for a whole contract averages many topics, so it matches nothing specifically, and the model receives 45,000 tokens of mostly irrelevant text. Chunk by section.",
    },
    {
      id: "ch-explain",
      format: "explain",
      scenario: "In two sentences: why does overlap between chunks improve retrieval?",
      rubric: [
        { id: "boundary", criterion: "Answers that cross a chunk boundary would otherwise be split across two chunks and found whole in neither" },
        { id: "cost", criterion: "Overlap repeats text so a boundary-crossing answer sits whole in at least one chunk, at the cost of a larger index" },
      ],
      exemplar: "Without overlap an answer that crosses a boundary is split between two chunks and found whole in neither. Overlap repeats text across neighbours so at least one chunk holds it whole, at the cost of a bigger index.",
      explain: "Overlap is insurance against bad cuts.",
    },
  ],
  codex: {
    oneLiner: "Chunk near the answer's size, overlap by about a third, split on structure, and test: too small cuts ideas, too big dilutes them.",
    keyNumbers: [
      { label: "Coverage of an answer span L", value: "min(1, (C − L) ÷ (C − overlap)) for chunk size C", sourceId: "pinecone-chunking" },
      { label: "Index growth from overlap", value: "C ÷ (C − overlap)", sourceId: "pinecone-chunking" },
    ],
    tradeoffs: [
      { choice: "Small chunks", gain: "Focused embeddings; cheap prompts", cost: "Answers get cut apart; more chunks to store" },
      { choice: "Large chunks", gain: "Whole answers stay together", cost: "Diluted embeddings and more tokens per question" },
      { choice: "Overlap", gain: "Boundary-crossing answers survive", cost: "A larger index and some duplicate retrieval" },
    ],
    seenIn: ["Recursive text splitters in LLM frameworks.", "RAG quality reports where the right page is retrieved but the answer is incomplete."],
    interviewAngle: "State the trade: 'chunks a bit larger than the typical answer, with overlap, split on headings, tuned against a labelled question set.'",
    aws: [{ concept: "Chunking configuration", service: "Amazon Bedrock Knowledge Bases (fixed-size, hierarchical, semantic chunking)" }],
    replay: { id: "chunk-lab", config: CHUNK, scene: "overlap" },
  },
  interview: [
    "How would you decide chunk size and overlap?",
    "What goes wrong with very large chunks? Very small ones?",
    "How does structure-aware splitting differ from fixed-size splitting?",
  ],
  deeper: [
    {
      title: "Contextual chunks",
      body: "A chunk taken out of its document often loses what it was about: 'the company's revenue grew 3% over the previous quarter' does not say which company or quarter. Contextual retrieval prepends a short generated summary of where the chunk sits in the document before embedding and indexing it, which Anthropic reported reduced failed retrievals substantially in their tests. The cost is one extra model call per chunk at indexing time.",
      sourceIds: ["anthropic-contextual-retrieval"],
    },
  ],
  honestPhysics: [
    "A question is answered by one span of about 150 tokens placed at random in a long document. Real answers vary in length and often draw on several places.",
    "Large chunks dilute embeddings as 0.4 + 0.6 × √min(1, 2 × span ÷ C), an illustrative curve for how ranking quality falls as a chunk grows past twice the span.",
    "Overlap multiplies the index by C ÷ (C − overlap). Retrieval is assumed to place the right chunk in the top 5 whenever the embedding quality term allows.",
  ],
  sources: [PINECONE, CTX_RETRIEVAL, LIU],
  verify: [
    { id: "start", claim: "1,024-token chunks answer under 70% of questions", run: "lab", params: { model: "chunk-lab", config: CHUNK_CHALLENGE, values: {}, metric: "quality" }, expect: { max: 0.7 } },
    { id: "boundary", claim: "256-token chunks with no overlap hold the span whole about 41% of the time", run: "lab", params: { model: "chunk-lab", config: CHUNK, values: { size: 256, overlap: 0 }, metric: "coverage" }, expect: { min: 0.4, max: 0.43 } },
    { id: "win", claim: "450-token chunks with 150 overlap pass the quality bar", run: "lab", params: { model: "chunk-lab", config: CHUNK_CHALLENGE, values: { size: 450, overlap: 150 }, metric: "quality" }, expect: { min: 0.85 } },
    { id: "win-index", claim: "…with the index at 1.5×", run: "lab", params: { model: "chunk-lab", config: CHUNK_CHALLENGE, values: { size: 450, overlap: 150 }, metric: "indexMultiplier" }, expect: { max: 1.5 } },
    { id: "win-tokens", claim: "…and 2,250 tokens to the model", run: "lab", params: { model: "chunk-lab", config: CHUNK_CHALLENGE, values: { size: 450, overlap: 150 }, metric: "tokensToLlm" }, expect: { max: 3000 } },
    { id: "half", claim: "Half-overlap breaks the index budget", run: "lab", params: { model: "chunk-lab", config: CHUNK_CHALLENGE, values: { size: 500, overlap: 250 }, metric: "indexMultiplier" }, expect: { min: 1.5 } },
  ],
});
