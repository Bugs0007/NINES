import { definePack } from "../define";

export const COS = { start: { metric: "dot", normalise: false } };

const IR_BOOK = { id: "manning-ir", title: "C. Manning, P. Raghavan, H. Schütze, Introduction to Information Retrieval, ch. 6: Scoring and the vector space model (cosine similarity)", url: "https://nlp.stanford.edu/IR-book/html/htmledition/dot-products-1.html" };
const SBERT = { id: "sbert-2019", title: "N. Reimers and I. Gurevych (2019), Sentence-BERT (cosine similarity between sentence embeddings), EMNLP", url: "https://arxiv.org/abs/1908.10084" };
const PGVECTOR = { id: "pgvector", title: "pgvector: distance operators (L2, inner product, cosine) and normalised vectors", url: "https://github.com/pgvector/pgvector" };

export default definePack({
  id: "cosine-similarity",
  title: "Cosine Similarity & Distance",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "Search ranking · top result", detail: "the 30-page terms of service outranks the one-page refund policy" },
    lines: [
      { speaker: "kabir", line: "Search ranks our giant terms-of-service document first for every billing question, and it is not the best answer, just the biggest." },
      { speaker: "meera", line: "You are scoring with a dot product, which rewards length. What you want is the angle between the vectors." },
    ],
  },
  predictions: [
    {
      id: "dot-wins",
      kind: "choice",
      prompt: "A query vector has length 1. A long document's vector has length 3.2 and points 55 degrees away; a short on-topic document's vector has length 1 and points 12 degrees away. Which has the larger dot product with the query?",
      options: [
        { id: "short", label: "The short, on-topic document" },
        { id: "long", label: "The long document: its length outweighs the larger angle" },
        { id: "tie", label: "They tie" },
        { id: "neither", label: "Neither; dot products need unit vectors" },
      ],
      answer: "long",
      observe: "metric-changed",
      reveal: {
        text: "The dot product is length times length times the cosine of the angle. The long document scores 3.2 × cos 55° = 1.84; the short one scores 1 × cos 12° = 0.98. Length mixed into the score pushes the wrong document to the top.",
        derived: true,
        line: { speaker: "meera", line: "A bigger vector shouts louder. It does not mean it agrees." },
      },
    },
  ],
  widget: { id: "cosine-lab", config: COS },
  mechanism: [
    {
      id: "dot",
      scene: "dot",
      text: "The dot product of two vectors is their lengths multiplied by the cosine of the angle between them. So it grows with direction agreement and with length, and a long vector can beat a better-aligned short one. That is fine when length means something, and wrong when it is an accident of the model.",
      sourceIds: ["manning-ir"],
    },
    {
      id: "cosine",
      scene: "cosine",
      text: "Cosine similarity divides the dot product by both lengths, leaving only the angle: 1 for the same direction, 0 for unrelated, −1 for opposite. It asks whether the vectors point the same way, regardless of how long they are, which is what meaning comparisons usually need.",
      sourceIds: ["manning-ir", "sbert-2019"],
    },
    {
      id: "norm",
      scene: "norm",
      text: "Normalising every vector to length 1 makes the three common measures agree. For unit vectors the dot product equals the cosine, and Euclidean distance is a decreasing function of it, so they rank results the same way. Many embedding models return unit vectors for this reason, and normalised dot product is the fastest to compute.",
      derived: true,
    },
    {
      id: "check",
      text: "Know what your model and your index assume. Match the metric to the one the embedding model was trained with, check whether the vectors are already normalised, and configure the vector database's distance accordingly. A mismatch gives plausible-looking, subtly wrong rankings.",
      sourceIds: ["pgvector"],
    },
  ],
  challenges: [
    {
      id: "fix-ranking",
      title: "Put the right document first",
      brief: "The refund policy is the on-topic document but its vector is short. A long terms-of-service vector points elsewhere. The index uses the dot product on unnormalised vectors and ranks the long document first. Choose the measure, or normalise, so the refund policy ranks first.",
      line: { speaker: "rao", line: "I would like the answer, not the biggest file." },
      widget: { id: "cosine-lab", config: COS },
      conditions: [{ metric: "topIsRight", op: ">=", value: 1, label: "The refund policy ranks first" }],
      stars: [{ metric: "matchScoreShare", op: ">=", value: 0.97, label: "Scores it near 1.0 on cosine or normalised dot" }],
      hints: [
        "What does the dot product reward besides direction?",
        "Which measure looks only at the angle?",
        "You can also change the vectors rather than the measure.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare dot product, cosine similarity, and Euclidean distance for ranking embeddings, and say when they agree.",
    rubric: [
      { id: "dot", criterion: "Dot product depends on both direction and length, so long vectors can win", keyIdea: "dot mixes length" },
      { id: "cos", criterion: "Cosine similarity uses only the angle, ignoring length", keyIdea: "cosine is the angle" },
      { id: "agree", criterion: "For normalised unit vectors, dot product, cosine, and Euclidean distance give the same ranking", keyIdea: "normalised vectors agree" },
    ],
    exemplar:
      "The dot product is the product of lengths times the cosine of the angle, so a long vector can outscore a better-aligned short one. Cosine similarity divides out the lengths and compares only direction. If the vectors are normalised to length 1, the dot product equals the cosine and Euclidean distance orders results identically, so the three agree.",
  },
  reviews: [
    {
      id: "cs-est",
      format: "estimate",
      scenario: "Two unit vectors point 60 degrees apart. What is their cosine similarity (and dot product)?",
      unit: "cosine",
      answer: 0.5,
      acceptFactor: 1.2,
      breakdown: ["cos 60° = 0.5", "For unit vectors the dot product equals the cosine", "= 0.5"],
      explain: "Cosine of 0 degrees is 1, of 90 degrees is 0, of 180 degrees is −1. Sixty degrees sits at one half.",
    },
    {
      id: "cs-pick",
      format: "pick-fix",
      scenario: "Your embedding model returns unit-length vectors. You must pick the pgvector operator for the index. Which is the fastest correct choice?",
      options: [
        { id: "a", label: "Inner product: for unit vectors it ranks like cosine and skips a division" },
        { id: "b", label: "Euclidean distance on the raw numbers, ignoring the model" },
        { id: "c", label: "Manhattan distance" },
        { id: "d", label: "None; unit vectors cannot be indexed" },
      ],
      answer: "a",
      explain: "With normalised vectors, maximising the inner product equals maximising cosine similarity, and it is cheaper to compute.",
    },
    {
      id: "cs-order",
      format: "order",
      scenario: "Order these cosine similarities from highest to lowest.",
      items: [
        { id: "same", label: "Vectors pointing the same way (0°)" },
        { id: "near", label: "Vectors 30° apart" },
        { id: "orth", label: "Vectors at right angles (90°)" },
        { id: "opp", label: "Vectors pointing opposite ways (180°)" },
      ],
      answer: ["same", "near", "orth", "opp"],
      explain: "Cosine runs from 1 down to −1 as the angle grows from 0 to 180 degrees.",
    },
    {
      id: "cs-flaw",
      format: "spot-flaw",
      scenario: "The index ranks by raw dot product, and documents with the most words always float to the top because the embedding model returns longer vectors for longer text. Tap the part to change.",
      diagram: {
        nodes: [
          { id: "docs", label: "document vectors, lengths vary with text length", kind: "store", col: 0, row: 1 },
          { id: "score", label: "ranking: raw dot product", kind: "server", col: 1, row: 1 },
        ],
        edges: [{ from: "docs", to: "score" }],
      },
      answer: "score",
      explain: "Length leaks into the score. Rank by cosine similarity, or normalise the vectors first, so only direction decides.",
    },
    {
      id: "cs-graph",
      format: "predict-graph",
      scenario: "Rotate a document vector away from the query from 0 to 180 degrees, keeping its length fixed. How does its cosine similarity to the query change?",
      xLabel: "angle →",
      yLabel: "cosine similarity",
      options: [
        { id: "linear", label: "Falls in a straight line from 1 to −1", points: [8, 6.3, 4.6, 3, 1.4, 0, -1.6, -3.3] },
        { id: "cos", label: "Falls slowly at first, fastest in the middle, then slowly", points: [8, 7.7, 6.5, 4.5, 2.5, 0.5, -1.2, -2] },
        { id: "flat", label: "Stays at 1", points: [8, 8, 8, 8, 8, 8, 8, 8] },
        { id: "step", label: "Stays at 1, then drops to −1", points: [8, 8, 8, 8, -2, -2, -2, -2] },
      ],
      answer: "cos",
      explain: "Cosine is flat near 0 and 180 degrees and steepest around 90, so small angles barely change the score and the middle of the range changes it fast.",
    },
    {
      id: "cs-explain",
      format: "explain",
      scenario: "In two sentences: why do many embedding models return normalised vectors?",
      rubric: [
        { id: "agree", criterion: "Normalised vectors make dot product, cosine, and distance rank identically, removing the length trap" },
        { id: "fast", criterion: "The dot product on unit vectors is cheap, so search is faster and simpler" },
      ],
      exemplar: "Normalised vectors make the different similarity measures agree and remove length as a source of error. The dot product is also the cheapest to compute, which speeds up nearest-neighbour search.",
      explain: "One less thing that can go wrong, and one less thing to compute.",
    },
  ],
  codex: {
    oneLiner: "Cosine similarity compares direction only. Dot product mixes in length; normalise vectors and the common measures rank identically.",
    keyNumbers: [
      { label: "Dot product", value: "|a| × |b| × cos θ", sourceId: "manning-ir" },
      { label: "Cosine similarity range", value: "−1 to 1", sourceId: "manning-ir" },
      { label: "Unit vectors", value: "dot product = cosine; ranks match Euclidean distance", sourceId: "pgvector" },
    ],
    tradeoffs: [
      { choice: "Cosine similarity", gain: "Ignores length; robust for text", cost: "An extra division unless vectors are normalised" },
      { choice: "Normalise then dot product", gain: "Fastest, equals cosine", cost: "Must normalise queries and documents consistently" },
      { choice: "Raw dot product", gain: "Keeps length as a signal (some recommenders want it)", cost: "Wrong for meaning when length is accidental" },
    ],
    seenIn: ["vector_cosine_ops and vector_ip_ops in pgvector.", "Distance metric settings in every vector database."],
    interviewAngle: "Say the metric choice explicitly: 'cosine on normalised embeddings, which is just the inner product', and name what breaks when you mix them.",
    aws: [{ concept: "Vector distance metrics", service: "Amazon OpenSearch k-NN (cosinesimil, innerproduct, l2)" }],
    replay: { id: "cosine-lab", config: COS, scene: "dot" },
  },
  interview: [
    "What is cosine similarity and why use it for text embeddings?",
    "When do dot product, cosine, and Euclidean distance give the same ranking?",
    "What can go wrong if your index metric does not match your embedding model?",
  ],
  deeper: [
    {
      title: "When length is a feature",
      body: "In some recommendation models the vector length carries meaning, such as popularity, and a dot product deliberately mixes it with direction. The choice is therefore not that dot products are bad, but that you should decide whether length should count. For text meaning it usually should not.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Vectors are two-dimensional and the query points along the x axis with length 1. Real embeddings have hundreds of dimensions.",
    "The documents' angles and lengths are chosen to show the failure: a long document 55 degrees off with length 3.2 versus a short on-topic one 12 degrees off.",
    "Euclidean distance happens to pick the right document here, because the on-topic vector is also the nearest in space.",
  ],
  sources: [IR_BOOK, SBERT, PGVECTOR],
  verify: [
    { id: "dot-fails", claim: "Raw dot product ranks the long document first", run: "lab", params: { model: "cosine-lab", config: COS, values: { metric: "dot", normalise: false }, metric: "topIsRight" }, expect: { max: 0 } },
    { id: "cosine-wins", claim: "Cosine similarity ranks the refund policy first", run: "lab", params: { model: "cosine-lab", config: COS, values: { metric: "cosine", normalise: false }, metric: "topIsRight" }, expect: { min: 1 } },
    { id: "norm-wins", claim: "Normalising first fixes the dot product", run: "lab", params: { model: "cosine-lab", config: COS, values: { metric: "dot", normalise: true }, metric: "topIsRight" }, expect: { min: 1 } },
    { id: "cos-share", claim: "The refund policy scores near 0.98 on cosine", run: "lab", params: { model: "cosine-lab", config: COS, values: { metric: "cosine", normalise: false }, metric: "matchScoreShare" }, expect: { min: 0.97 } },
  ],
});
