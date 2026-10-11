import { definePack } from "../define";

export const ANN = { lockN: false, start: { index: "flat", quant: "f32", param: 100, n: 10000000 } };
export const ANN_CHALLENGE = { lockN: true, n: 50000000, start: { index: "flat", quant: "f32", param: 100 } };

const HNSW = { id: "hnsw-2016", title: "Y. Malkov and D. Yashunin (2016), Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs", url: "https://arxiv.org/abs/1603.09320" };
const PQ = { id: "pq-2011", title: "H. Jégou, M. Douze, C. Schmid (2011), Product Quantization for Nearest Neighbor Search, IEEE TPAMI 33(1)", url: "https://doi.org/10.1109/TPAMI.2010.57" };
const FAISS = { id: "faiss-2017", title: "J. Johnson, M. Douze, H. Jégou (2017), Billion-scale similarity search with GPUs (the Faiss library: flat, IVF, PQ)", url: "https://arxiv.org/abs/1702.08734" };
const ANNB = { id: "ann-benchmarks", title: "ANN-Benchmarks: comparing approximate nearest-neighbour algorithms on recall versus queries per second", url: "https://ann-benchmarks.com/" };

export default definePack({
  id: "ann-indexes",
  title: "Vector Indexes: HNSW & IVF",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "vector-search · p99 latency", detail: "exact search over 50 million vectors: 800 ms and rising" },
    lines: [
      { speaker: "pager", line: "Vector search over fifty million documents is taking most of a second per query, and the index will not fit on one machine's memory." },
      { speaker: "meera", line: "Exact search compares against every vector. Approximate indexes look at a few thousand, and accept missing a few of the true neighbours." },
    ],
  },
  predictions: [
    {
      id: "ram",
      kind: "numeric",
      prompt: "Pigeon has 50 million documents embedded as 768-dimension float32 vectors. About how many gigabytes of memory do the raw vectors take?",
      unit: "GB",
      min: 1,
      max: 2000,
      log: true,
      answer: 154,
      tolerance: 1.3,
      observe: "ram-blown",
      reveal: {
        text: "768 dimensions at 4 bytes is 3,072 bytes per vector, and 50 million of them is 154 GB before any index structure. That does not fit in a 64 GB machine, which is why index choice and vector compression are part of the design.",
        derived: true,
        line: { speaker: "meera", line: "Memory decides your index before speed does." },
      },
    },
  ],
  widget: { id: "ann-lab", config: ANN },
  mechanism: [
    {
      id: "flat",
      scene: "flat",
      text: "A flat index compares the query against every vector, so it is exact and its cost grows in proportion to the corpus. For fifty million 768-dimension vectors that is hundreds of gigabytes of memory traffic per query, far too slow for interactive search.",
      sourceIds: ["faiss-2017"],
    },
    {
      id: "hnsw",
      scene: "hnsw",
      text: "HNSW builds a layered graph in which each vector links to near neighbours. A query enters at a sparse top layer, hops greedily toward the query, and descends into denser layers, visiting a few hundred vectors instead of millions. A search-effort setting, ef, widens the walk: more effort finds more true neighbours and takes longer.",
      sourceIds: ["hnsw-2016"],
    },
    {
      id: "ivf",
      text: "IVF partitions the space into clusters by k-means. A query is compared with the cluster centres and only the closest few lists, nprobe of them, are scanned. A larger nprobe raises recall and cost. IVF uses little extra memory but its recall at a given speed usually trails HNSW's.",
      sourceIds: ["faiss-2017", "ann-benchmarks"],
    },
    {
      id: "pq",
      scene: "pq",
      text: "Compression decides what fits in RAM. Scalar quantisation stores each dimension as one byte instead of four. Product quantisation splits a vector into pieces and stores each as a short code, around 64 bytes in all, shrinking memory by about fifty times at some loss of recall. Every approximate method trades recall, latency, and memory.",
      sourceIds: ["pq-2011"],
    },
  ],
  challenges: [
    {
      id: "fifty-million",
      title: "Index fifty million vectors",
      brief: "50 million 768-dimension vectors, on a 64 GB machine. Queries need at least 95% recall of the true top 10 within 20 ms. Choose the index, the vector storage, and the search effort.",
      line: { speaker: "rao", line: "A bigger machine is a bigger bill. Fit it in the one we have." },
      widget: { id: "ann-lab", config: ANN_CHALLENGE },
      conditions: [
        { metric: "recall", op: ">=", value: 0.95, label: "Recall at least 95%" },
        { metric: "latencyMs", op: "<=", value: 20, label: "At most 20 ms per query" },
        { metric: "fitsRam", op: ">=", value: 1, label: "Fits in 64 GB of RAM" },
      ],
      stars: [{ metric: "latencyMs", op: "<=", value: 6, label: "At most 6 ms per query" }],
      hints: [
        "Check memory first: which storage formats fit 50 million vectors in 64 GB?",
        "Which index gives high recall at low latency, and how does recall depend on search effort?",
        "Quantisation loses a few points of recall. Can search effort make up for them?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare flat, IVF, and HNSW vector indexes, and say how you would fit a very large collection in memory.",
    rubric: [
      { id: "flat", criterion: "Flat search is exact but compares every vector, so it does not scale", keyIdea: "exact but linear" },
      { id: "ann", criterion: "HNSW (graph walk) and IVF (probe a few clusters) examine few vectors for approximate results; a search-effort parameter trades recall for latency", keyIdea: "approximate search, tunable effort" },
      { id: "mem", criterion: "Quantisation (scalar or product) shrinks memory at some recall cost, so memory, recall, and latency are traded together", keyIdea: "quantise to fit" },
    ],
    exemplar:
      "A flat index compares against every vector, so it is exact but its cost grows with the corpus. HNSW walks a graph of near neighbours and IVF scans only the nearest few clusters, so they look at a tiny fraction of the vectors for approximate answers, with an effort setting that trades recall for latency. To fit a large collection in memory I quantise the vectors, scalar to a quarter of the size or product quantisation to a fiftieth, accepting a small loss of recall.",
  },
  reviews: [
    {
      id: "an-est-mem",
      format: "estimate",
      scenario: "You store 20 million vectors of 1,024 dimensions as float32. About how many GB do the raw vectors take?",
      unit: "GB",
      answer: 82,
      acceptFactor: 1.15,
      breakdown: ["1,024 × 4 bytes = 4,096 bytes", "× 20,000,000", "= 82 GB"],
      explain: "Memory per vector is dimensions times bytes per dimension. Halving the bytes halves the footprint.",
    },
    {
      id: "an-est-int8",
      format: "estimate",
      scenario: "Scalar quantisation stores each dimension as 1 byte instead of 4. Starting from 154 GB of float32 vectors, about how much do the quantised vectors take?",
      unit: "GB",
      answer: 38,
      acceptFactor: 1.15,
      breakdown: ["154 ÷ 4", "≈ 38 GB"],
      explain: "A quarter of the memory, for a small recall loss. HNSW links add more on top.",
    },
    {
      id: "an-pick",
      format: "pick-fix",
      scenario: "Recall of an HNSW index is 91% at the default search effort, and you need 97% with latency to spare. What is the first change to try?",
      options: [
        { id: "a", label: "Raise the search effort (ef) and measure the latency" },
        { id: "b", label: "Switch to a flat index" },
        { id: "c", label: "Halve the vector dimensions" },
        { id: "d", label: "Double the shards without changing anything else" },
      ],
      answer: "a",
      explain: "ef is the recall-latency dial. Raising it widens the graph walk. If latency becomes a problem, consider other levers, such as parameters at build time.",
    },
    {
      id: "an-order",
      format: "order",
      scenario: "Order these by memory per vector, smallest first, for 768-dimension vectors.",
      items: [
        { id: "pq", label: "Product quantised (about 64 bytes)" },
        { id: "i8", label: "int8 scalar quantised" },
        { id: "f32", label: "float32" },
        { id: "f32h", label: "float32 plus HNSW graph links" },
      ],
      answer: ["pq", "i8", "f32", "f32h"],
      explain: "64 bytes, 768 bytes, 3,072 bytes, and about 3,200. The HNSW graph adds roughly a hundred bytes of links per vector.",
    },
    {
      id: "an-graph",
      format: "predict-graph",
      scenario: "For an HNSW index, raise the search effort ef from 5 to 1,000. How does recall change?",
      xLabel: "ef →",
      yLabel: "recall",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "sat", label: "Rises quickly, then flattens just under 100%", points: [2, 5, 6.7, 7.5, 7.8, 7.9, 8, 8] },
        { id: "flat", label: "Flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "peak", label: "Rises then falls", points: [1, 4, 6, 7, 6, 5, 4, 3] },
      ],
      answer: "sat",
      explain: "Early effort finds most true neighbours; the last few percent need much more effort. The curve has a knee, and the best setting sits near it.",
    },
    {
      id: "an-flaw",
      format: "spot-flaw",
      scenario: "A team indexes 100 million 1,536-dimension float32 vectors with HNSW on a 128 GB machine and the process is killed by the OOM killer during the build. Tap the part of the plan that was never checked.",
      diagram: {
        nodes: [
          { id: "plan", label: "plan: HNSW over 100M × 1,536 float32, 128 GB RAM", kind: "server", col: 0, row: 1 },
          { id: "mem", label: "needs about 650 GB before graph links", kind: "store", col: 1, row: 1 },
        ],
        edges: [{ from: "plan", to: "mem" }],
      },
      answer: "plan",
      explain: "A back-of-envelope memory estimate would have shown the index is several times larger than the machine. Quantise, shard, or use a disk-based index.",
    },
    {
      id: "an-explain",
      format: "explain",
      scenario: "In two sentences: why does approximate search trade a little recall for a large speed-up?",
      rubric: [
        { id: "subset", criterion: "It examines only a small fraction of the vectors, chosen by a graph walk or by clusters" },
        { id: "miss", criterion: "The true nearest neighbours that lie outside the examined region are missed, which is the recall loss" },
      ],
      exemplar: "Approximate indexes examine only a small, well-chosen fraction of the vectors, found by walking a graph or probing a few clusters. The price is that a true nearest neighbour outside that fraction is missed, which shows up as lower recall.",
      explain: "You do not have to look at everything to find most of what matters.",
    },
  ],
  codex: {
    oneLiner: "Flat search is exact but linear. HNSW and IVF examine few vectors for approximate answers; quantisation shrinks memory. Trade recall, latency, and RAM.",
    keyNumbers: [
      { label: "float32 vector memory", value: "dimensions × 4 bytes", sourceId: "faiss-2017" },
      { label: "Product quantisation", value: "about 64 bytes per vector", sourceId: "pq-2011" },
      { label: "HNSW search effort", value: "ef: more effort, more recall, more latency", sourceId: "hnsw-2016" },
    ],
    tradeoffs: [
      { choice: "HNSW", gain: "High recall at low latency", cost: "Memory-hungry graph; slower to build and update" },
      { choice: "IVF", gain: "Compact; easy to shard", cost: "Lower recall at the same speed; needs training" },
      { choice: "Quantisation", gain: "Fits far more vectors in RAM", cost: "A few points of recall" },
    ],
    seenIn: ["HNSW indexes in pgvector, OpenSearch, and every vector database.", "Faiss IVF-PQ for billion-scale collections."],
    interviewAngle: "Start with memory arithmetic, then pick: 'fifty million 768-dimension vectors is 154 GB raw, so I would use HNSW on int8 vectors and tune ef for 95% recall.'",
    aws: [{ concept: "Vector index", service: "Amazon OpenSearch Service k-NN (HNSW, IVF); Aurora PostgreSQL with pgvector" }],
    replay: { id: "ann-lab", config: ANN_CHALLENGE, scene: "hnsw" },
  },
  interview: [
    "How does HNSW find nearest neighbours without scanning everything?",
    "How would you fit 100 million embeddings in memory?",
    "What do you measure when tuning an ANN index?",
  ],
  deeper: [
    {
      title: "Measuring recall",
      body: "Index quality is measured as recall at k against ground truth: run exact search on a sample of queries to get the true top k, then see how many an approximate index returns. ANN-Benchmarks plots recall against queries per second for many libraries on the same data, which is how you compare settings fairly, because an index that is fast at 80% recall may be slow at 99%.",
      sourceIds: ["ann-benchmarks"],
    },
  ],
  honestPhysics: [
    "Illustrative curves for 768-dimension float vectors: flat search about 0.2 ms per 100,000 vectors per thread, HNSW recall rising as 1 − e^(−ef ÷ 60), and IVF recall as 1 − e^(−nprobe ÷ 120). Real behaviour depends on the data and implementation.",
    "Memory: float32 is 4 bytes per dimension, int8 is 1, product quantisation about 64 bytes per vector; HNSW adds about 128 bytes per vector of links. Quantisation costs 1 to 7 points of recall.",
    "Latency is per query on one thread, with the index in RAM.",
  ],
  sources: [HNSW, PQ, FAISS, ANNB],
  verify: [
    { id: "flat-mem", claim: "Flat float32 over 50 million vectors needs about 154 GB", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "flat", quant: "f32" }, metric: "memoryGB" }, expect: { min: 150, max: 160 } },
    { id: "hnsw-f32", claim: "HNSW on float32 does not fit in 64 GB", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "f32", param: 200 }, metric: "fitsRam" }, expect: { max: 0 } },
    { id: "pq", claim: "Product-quantised HNSW fits but misses 95% recall", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "pq", param: 200 }, metric: "recall" }, expect: { max: 0.95 } },
    { id: "win-recall", claim: "HNSW on int8 vectors with ef = 200 reaches 95% recall", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "i8", param: 200 }, metric: "recall" }, expect: { min: 0.95 } },
    { id: "win-fit", claim: "…and fits in RAM", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "i8", param: 200 }, metric: "fitsRam" }, expect: { min: 1 } },
    { id: "win-lat", claim: "…at about 5 ms", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "i8", param: 200 }, metric: "latencyMs" }, expect: { max: 6 } },
    { id: "low-ef", claim: "ef = 100 on int8 is not enough recall", run: "lab", params: { model: "ann-lab", config: ANN_CHALLENGE, values: { index: "hnsw", quant: "i8", param: 100 }, metric: "recall" }, expect: { max: 0.95 } },
  ],
});
