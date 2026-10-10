/**
 * Chapter B4 "Retrieval" models: embeddings in a 2D meaning space, cosine similarity, BM25, rank fusion, HyDE,
 * two-stage reranking, chunking, metadata filtering, ANN indexes, and retrieval metrics. Geometry, BM25, RRF, and
 * the ranking metrics are computed exactly; the encoder, ANN, and filter models use explicit closed forms with
 * labelled round constants.
 */
import { Rng } from "../../../engine/rng";
import { normCdf, normInv } from "../math";
import { bool, num, str, sweep, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

// ------------------------------------------------------------------ embeddings: a 2D meaning space

const CLUSTERS = [
  { id: "billing", cx: 0.2, cy: 0.76, labels: ["refund policy", "card declined", "invoice copy", "cancel subscription", "update payment method", "charged twice", "billing date"] },
  { id: "shipping", cx: 0.78, cy: 0.78, labels: ["track my order", "delivery delay", "change address", "courier contact", "lost parcel", "delivery slots", "shipping fees"] },
  { id: "account", cx: 0.22, cy: 0.24, labels: ["reset password", "two-factor setup", "change email", "delete account", "login blocked", "profile photo", "privacy settings"] },
  { id: "devices", cx: 0.78, cy: 0.24, labels: ["battery charging", "charger not working", "phone overheating", "screen cracked", "firmware update", "pair earbuds", "wireless charging"] },
];

export function embedPoints() {
  const rng = new Rng("embed-space");
  return CLUSTERS.flatMap((c) =>
    c.labels.map((label) => ({ cluster: c.id, label, x: Math.min(0.97, Math.max(0.03, c.cx + (rng.next() - 0.5) * 0.2)), y: Math.min(0.97, Math.max(0.03, c.cy + (rng.next() - 0.5) * 0.2)) })),
  );
}

const QUERIES = [
  { id: "stuck", label: "'my money is stuck'", x: 0.25, y: 0.7, want: "billing" },
  { id: "parcel", label: "'where is my package'", x: 0.74, y: 0.8, want: "shipping" },
  { id: "signin", label: "'can't get into my profile'", x: 0.24, y: 0.3, want: "account" },
  { id: "charge", label: "'charge' (ambiguous)", x: 0.5, y: 0.52, want: "billing" },
];

export const embedLab: LabModel = {
  id: "embed-lab",
  metrics: ["precision", "recall", "found"],
  observes: ["searched", "ambiguous"],
  scenes: ["space", "ambiguous", "rewrite"],
  runLabel: "Ship the search",
  honest: [
    "The embedding space is flattened to two dimensions and the phrases are placed by hand into four neighbourhoods. A real embedding has hundreds or thousands of dimensions, and phrases land where a trained model puts them.",
    "A rewritten query is the same question with context added ('charge on my card'), which a model or an app can do before searching. Here it moves the query toward the intended neighbourhood.",
    "Relevance is the neighbourhood the searcher meant: 7 phrases per neighbourhood, so a perfect search of 7 returns all 7 and nothing else.",
  ],
  init: (c) => ({ query: (c as { query?: string }).query ?? "stuck", k: 7, rewrite: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockQuery?: boolean }).lockQuery) out.push({ kind: "choice", id: "query", label: "Search for", options: QUERIES.map((q) => ({ id: q.id, label: q.label })) });
    out.push({ kind: "slider", id: "k", label: "Results returned (top-k)", min: 1, max: 14, step: 1, fmt: "int" }, { kind: "toggle", id: "rewrite", label: "Rewrite the query with context", detail: "'charge' becomes 'charge on my card'" });
    return out;
  },
  evaluate: (v) => {
    const pts = embedPoints();
    const q0 = QUERIES.find((q) => q.id === str(v, "query"))!;
    const target = CLUSTERS.find((c) => c.id === q0.want)!;
    const q = bool(v, "rewrite") ? { x: q0.x + (target.cx - q0.x) * 0.7, y: q0.y + (target.cy - q0.y) * 0.7 } : { x: q0.x, y: q0.y };
    const ranked = pts.map((p) => ({ ...p, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d);
    const k = Math.round(num(v, "k"));
    const top = new Set(ranked.slice(0, k).map((p) => p.label));
    const hits = ranked.slice(0, k).filter((p) => p.cluster === q0.want).length;
    const rel = pts.filter((p) => p.cluster === q0.want).length;
    const radius = ranked[Math.min(k, ranked.length) - 1]!.d;
    const tone = (c: string): Tone => (c === "billing" ? "info" : c === "shipping" ? "ok" : c === "account" ? "lilac" : "warn");
    return {
      metrics: { precision: hits / k, recall: hits / rel, found: hits },
      readouts: [
        { label: "Results that are relevant", value: hits / k, fmt: "pct", tone: hits / k >= 0.8 ? "ok" : hits / k >= 0.5 ? "warn" : "alert", sub: "precision" },
        { label: "Relevant phrases found", value: hits / rel, fmt: "pct", tone: hits / rel >= 0.8 ? "ok" : "warn", sub: `${hits} of ${rel}` },
        { label: "Radius of the search", value: radius, fmt: "num" },
      ],
      view: {
        kind: "scatter",
        points: [...pts.map((p) => ({ x: p.x, y: p.y, label: top.has(p.label) ? p.label : undefined, tone: top.has(p.label) ? (p.cluster === q0.want ? ("ok" as Tone) : ("alert" as Tone)) : tone(p.cluster), size: top.has(p.label) ? 6.5 : 4 })), { x: q.x, y: q.y, ring: true, label: q0.label }],
        radius,
        caption: "Nearby points have similar meaning. The dashed circle is what the search returns.",
        legend: [{ tone: "info", label: "billing" }, { tone: "ok", label: "shipping / relevant" }, { tone: "lilac", label: "account" }, { tone: "warn", label: "devices" }, { tone: "alert", label: "returned but irrelevant" }],
      },
      notes: [str(v, "query") === "charge" && !bool(v, "rewrite") ? "'charge' sits between billing and devices: both are close, so the neighbours are a mix." : "Meaning, not matching words, decides who is near."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "query") !== "stuck" || num(v, "k") !== 7) ev.push("searched");
    if (str(v, "query") === "charge") ev.push("ambiguous");
    return ev;
  },
  scene: (n): SceneOut => (n === "space" ? { set: { query: "stuck", k: 7, rewrite: false }, focus: ["query"] } : n === "ambiguous" ? { set: { query: "charge", k: 7, rewrite: false }, focus: ["query"] } : n === "rewrite" ? { set: { query: "charge", rewrite: true }, focus: ["rewrite"] } : undefined),
};

// ------------------------------------------------------------------ cosine similarity vs dot product vs distance

const COS_DOCS = [
  { id: "match", label: "Refund policy (short, on topic)", angle: 12, norm: 1 },
  { id: "long", label: "Terms of service (long, partly on topic)", angle: 55, norm: 3.2 },
  { id: "off", label: "Shipping times (off topic)", angle: 100, norm: 1.4 },
  { id: "wrong", label: "Privacy policy (opposite)", angle: 170, norm: 1.2 },
];

export const cosineLab: LabModel = {
  id: "cosine-lab",
  metrics: ["topIsRight", "matchRank", "matchScoreShare"],
  observes: ["metric-changed", "normalised"],
  scenes: ["dot", "cosine", "norm"],
  runLabel: "Pick the metric",
  honest: [
    "Vectors are two-dimensional and the query points along the x axis with length 1. Real embeddings have hundreds of dimensions, and many models return vectors already normalised to length 1.",
    "Dot product mixes angle and length, cosine similarity is the dot product of unit vectors, and Euclidean distance mixes angle and length too. For normalised vectors all three order results identically.",
    "The 'on topic' answer is the document whose direction matches the query, not the one with the biggest vector.",
  ],
  init: () => ({ metric: "dot", normalise: false }),
  controls: () => [
    { kind: "choice", id: "metric", label: "Similarity measure", options: [{ id: "dot", label: "Dot product" }, { id: "cosine", label: "Cosine similarity" }, { id: "euclid", label: "Euclidean distance (smaller is closer)" }] },
    { kind: "toggle", id: "normalise", label: "Normalise every vector to length 1 first" },
  ],
  evaluate: (v) => {
    const q = { x: 1, y: 0 };
    const rows = COS_DOCS.map((d) => {
      const n = bool(v, "normalise") ? 1 : d.norm;
      const x = n * Math.cos((d.angle * Math.PI) / 180);
      const y = n * Math.sin((d.angle * Math.PI) / 180);
      const dot = x * q.x + y * q.y;
      const cos = dot / (n * 1);
      const dist = Math.hypot(x - q.x, y - q.y);
      const score = str(v, "metric") === "dot" ? dot : str(v, "metric") === "cosine" ? cos : -dist;
      return { d, x, y, dot, cos, dist, score };
    });
    const ranked = [...rows].sort((a, b) => b.score - a.score);
    const matchRank = ranked.findIndex((r) => r.d.id === "match") + 1;
    const share = rows.find((r) => r.d.id === "match")!.score;
    return {
      metrics: { topIsRight: matchRank === 1 ? 1 : 0, matchRank, matchScoreShare: share },
      readouts: [
        { label: "Top result", value: ranked[0]!.d.label.split(" (")[0]!, tone: matchRank === 1 ? "ok" : "alert" },
        { label: "The on-topic document ranks", value: matchRank, fmt: "int", tone: matchRank === 1 ? "ok" : "alert", sub: "of 4" },
      ],
      view: { kind: "bars", fmt: "num", max: str(v, "metric") === "dot" ? Math.max(...rows.map((r) => Math.abs(r.score)), 1) * 1.1 : undefined, bars: ranked.map((r) => ({ label: r.d.label, value: Math.max(0, r.score + (str(v, "metric") === "euclid" ? 3 : 0)), tone: r.d.id === "match" ? ("ok" as Tone) : ("muted" as Tone), sub: `${str(v, "metric") === "euclid" ? "distance " + r.dist.toFixed(2) : "score " + r.score.toFixed(2)} · length ${(bool(v, "normalise") ? 1 : r.d.norm).toFixed(1)}` })) },
      notes: [str(v, "metric") === "dot" && !bool(v, "normalise") ? "A long vector wins the dot product even when it points elsewhere: length is mixing into the score." : "Direction alone decides the order."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "metric") !== "dot") ev.push("metric-changed");
    if (bool(v, "normalise")) ev.push("normalised");
    return ev;
  },
  scene: (n): SceneOut => (n === "dot" ? { set: { metric: "dot", normalise: false }, focus: ["metric"] } : n === "cosine" ? { set: { metric: "cosine" }, focus: ["metric"] } : n === "norm" ? { set: { metric: "dot", normalise: true }, focus: ["normalise"] } : undefined),
};

// ------------------------------------------------------------------ BM25

const BM_DOCS: { id: string; text: string }[] = [
  { id: "d1", text: "Refund requests are processed within seven days of cancelling." },
  { id: "d2", text: "Our refund policy page also covers returns timing exceptions return labels warranty claims shipping charges gift cards loyalty points and how our refund team handles every refund request that comes in through chat email or phone during busy periods." },
  { id: "d3", text: "Shipping usually takes three to five days across the country." },
  { id: "d4", text: "Gift cards cannot be refunded once redeemed." },
  { id: "d5", text: "Cancel your plan from settings and then open billing." },
  { id: "d6", text: "Pigeon is a messaging app. Pigeon keeps your chats fast. Pigeon works on every phone, and Pigeon never sells your data." },
];
const tok = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []) as string[];
const BM_TOK = BM_DOCS.map((d) => tok(d.text));
const AVG_LEN = BM_TOK.reduce((s, t) => s + t.length, 0) / BM_TOK.length;

export function bm25Scores(query: string, k1: number, b: number) {
  const N = BM_TOK.length;
  const terms = tok(query);
  return BM_DOCS.map((d, i) => {
    const t = BM_TOK[i]!;
    let s = 0;
    for (const term of terms) {
      const df = BM_TOK.filter((x) => x.includes(term)).length;
      if (!df) continue;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const tf = t.filter((w) => w === term).length;
      s += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * t.length) / AVG_LEN)));
    }
    return { id: d.id, text: d.text, score: s, len: t.length };
  });
}

const BM_QUERIES = [
  { id: "refund", label: "refund", want: "d1", note: "the concise policy, not the long page that repeats the word" },
  { id: "gift", label: "gift cards", want: "d4", note: "the one-line answer, not the long page that mentions them once" },
  { id: "pigeon", label: "pigeon chats", want: "d6", note: "the only document about Pigeon" },
];

export const bm25Lab: LabModel = {
  id: "bm25-lab",
  metrics: ["rightCount", "topIsRight", "rightRank"],
  observes: ["length-bias", "tuned"],
  scenes: ["tf", "length", "idf"],
  runLabel: "Set the ranking",
  honest: [
    "Six short documents, with Okapi BM25 computed exactly: score = Σ IDF(term) × tf × (k1 + 1) ÷ (tf + k1 × (1 − b + b × length ÷ average length)), with IDF = ln(1 + (N − n + 0.5) ÷ (n + 0.5)).",
    "The corpus is tiny, so IDF values are coarse and there is no stemming: 'refunded' and 'refund' are different words. In a real index IDF separates common words from rare ones much more sharply.",
    "k1 controls how quickly repeated terms saturate and b how strongly long documents are penalised. Common defaults are k1 around 1.2 and b around 0.75.",
  ],
  init: () => ({ query: "refund", k1: 1.2, b: 0 }),
  controls: () => [
    { kind: "choice", id: "query", label: "Show the ranking for", options: BM_QUERIES.map((q) => ({ id: q.id, label: q.label })) },
    { kind: "slider", id: "k1", label: "k1: how fast repeated terms saturate", min: 0, max: 3, step: 0.1, fmt: "num" },
    { kind: "slider", id: "b", label: "b: how much long documents are penalised", min: 0, max: 1, step: 0.05, fmt: "num" },
  ],
  evaluate: (v) => {
    const k1 = num(v, "k1");
    const b = num(v, "b");
    const rankOf = (q: (typeof BM_QUERIES)[number]) => {
      const rows = bm25Scores(q.label, k1, b).sort((a, c) => c.score - a.score);
      return { rows, rank: rows.findIndex((r) => r.id === q.want) + 1 };
    };
    const all = BM_QUERIES.map(rankOf);
    const count = all.filter((r) => r.rank === 1).length;
    const q = BM_QUERIES.find((x) => x.id === str(v, "query"))!;
    const cur = all[BM_QUERIES.indexOf(q)]!;
    return {
      metrics: { rightCount: count, topIsRight: cur.rank === 1 ? 1 : 0, rightRank: cur.rank },
      readouts: [
        { label: "Queries answered correctly", value: count, fmt: "int", sub: "of 3", tone: count === 3 ? "ok" : "warn" },
        { label: `For "${q.label}", the right document ranks`, value: cur.rank, fmt: "int", tone: cur.rank === 1 ? "ok" : "alert", sub: "of 6" },
        { label: "Best match", value: cur.rows[0]!.text.split(" ").slice(0, 4).join(" ") + " …" },
      ],
      view: { kind: "bars", fmt: "num", bars: cur.rows.map((r) => ({ label: `${r.id} · ${r.len} words · "${r.text.slice(0, 44)}${r.text.length > 44 ? "…" : ""}"`, value: r.score, tone: r.id === q.want ? ("ok" as Tone) : ("muted" as Tone) })) },
      notes: [`The right answer for "${q.label}" is ${q.note}.`],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.rightCount! < 3 && num(v, "b") === 0) ev.push("length-bias");
    if (out.metrics.rightCount === 3) ev.push("tuned");
    return ev;
  },
  scene: (n): SceneOut => (n === "tf" ? { set: { query: "refund", k1: 3, b: 0 }, focus: ["k1"] } : n === "length" ? { set: { query: "refund", k1: 1.2, b: 1 }, focus: ["b"] } : n === "idf" ? { set: { query: "pigeon", k1: 1.2, b: 0.75 }, focus: ["query"] } : undefined),
};

// ------------------------------------------------------------------ hybrid search: reciprocal rank fusion

// For each query, where the one relevant document sits in the keyword list and the vector list (0 = not in the top 10).
const RRF_QUERIES = [
  { id: "id", label: "Error code E-4417 on checkout", rb: 1, rv: 0, sb: 14.2, sv: 0.51, hub: [4, 3] },
  { id: "para", label: "My card keeps getting rejected", rb: 0, rv: 1, sb: 3.1, sv: 0.82, hub: [2, 5] },
  { id: "both", label: "Refund for the Pigeon Plus plan", rb: 3, rv: 2, sb: 9.4, sv: 0.74, hub: [1, 5] },
  { id: "name", label: "Meera Iyer's cancellation request", rb: 1, rv: 6, sb: 12.6, sv: 0.63, hub: [5, 4] },
  { id: "vague", label: "Why is the app so slow lately", rb: 9, rv: 2, sb: 4.4, sv: 0.7, hub: [3, 5] },
];

/** Two ranked lists of 10 for a query: the relevant document "R", one document both retrievers like ("hub"), and distractors unique to each list. */
function rrfLists(q: (typeof RRF_QUERIES)[number]) {
  const make = (rank: number, hubRank: number, topScore: number, decay: number, prefix: string) => {
    const ids: string[] = [];
    let u = 1;
    for (let r = 1; r <= 10; r++) ids.push(r === rank ? "R" : r === hubRank ? "hub" : `${prefix}${u++}`);
    return ids.map((id, i) => ({ id, score: topScore * Math.pow(decay, i) }));
  };
  const bm = make(q.rb, q.hub[0]!, q.sb, 0.86, "b");
  const vec = make(q.rv, q.hub[1]!, q.sv, 0.96, "v");
  return { bm: q.rb ? bm : bm.filter((x) => x.id !== "R"), vec: q.rv ? vec : vec.filter((x) => x.id !== "R") };
}

export function rrfRanks(method: string, k: number) {
  return RRF_QUERIES.map((q) => {
    const { bm, vec } = rrfLists(q);
    const total = new Map<string, number>();
    const add = (list: { id: string; score: number }[], f: (rank: number, score: number) => number) => list.forEach((x, i) => total.set(x.id, (total.get(x.id) ?? 0) + f(i + 1, x.score)));
    if (method === "bm25") add(bm, (_r, sc) => sc);
    else if (method === "vec") add(vec, (_r, sc) => sc);
    else if (method === "sum") {
      add(bm, (_r, sc) => sc);
      add(vec, (_r, sc) => sc);
    } else {
      add(bm, (r) => 1 / (k + r));
      add(vec, (r) => 1 / (k + r));
    }
    if (!total.has("R")) return 11;
    const sorted = [...total.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.findIndex(([id]) => id === "R") + 1;
  });
}

export const rrfLab: LabModel = {
  id: "rrf-lab",
  metrics: ["mrr", "inTop3", "worstRank"],
  observes: ["fused", "scale-trap"],
  scenes: ["lists", "rrf", "scores"],
  runLabel: "Ship the retriever",
  honest: [
    "Five test queries; each has two ranked lists of ten (keyword and vector) with the one relevant document placed where the query says, and distractors shared between the lists. A document missing from both top-10 lists ranks 11th. Real systems fuse longer lists and evaluate on hundreds of queries.",
    "Reciprocal rank fusion scores each document by Σ 1 ÷ (k + rank) over the lists it appears in, so it needs no calibration between scores of different scales.",
    "Adding raw scores is the trap: BM25 scores run from 3 to 15 and cosine scores sit between 0 and 1, so the keyword list dominates the sum.",
  ],
  init: () => ({ method: "bm25", k: 60 }),
  controls: () => [
    { kind: "choice", id: "method", label: "How results are ranked", options: [{ id: "bm25", label: "Keyword (BM25) only" }, { id: "vec", label: "Vector only" }, { id: "sum", label: "Add the raw scores" }, { id: "rrf", label: "Reciprocal rank fusion" }] },
    { kind: "slider", id: "k", label: "RRF constant k", min: 1, max: 100, step: 1, fmt: "int", hint: "Larger k flattens the difference between ranks" },
  ],
  evaluate: (v) => {
    const ranks = rrfRanks(str(v, "method"), num(v, "k"));
    const mrr = ranks.reduce((s, r) => s + (r <= 10 ? 1 / r : 0), 0) / ranks.length;
    const top3 = ranks.filter((r) => r <= 3).length;
    const worst = Math.max(...ranks);
    const m = str(v, "method");
    return {
      metrics: { mrr, inTop3: top3, worstRank: worst },
      readouts: [
        { label: "Mean reciprocal rank", value: mrr, fmt: "num", tone: mrr > 0.8 ? "ok" : mrr > 0.5 ? "warn" : "alert" },
        { label: "Queries with the answer in the top 3", value: top3, fmt: "int", sub: "of 5", tone: top3 === 5 ? "ok" : "warn" },
        { label: "Worst rank of the right document", value: worst > 10 ? "missing" : worst, fmt: "int", tone: worst > 3 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", max: 11, bars: RRF_QUERIES.map((q, i) => ({ label: q.label, value: Math.max(0.3, 11 - ranks[i]!), tone: ranks[i]! <= 3 ? ("ok" as Tone) : ("alert" as Tone), sub: ranks[i]! > 10 ? "right answer not in the top 10" : `right answer at rank ${ranks[i]!}` })) },
      notes: [m === "sum" ? "Keyword scores are an order of magnitude larger than cosine scores, so adding them mostly reproduces the keyword ranking." : m === "rrf" ? "Ranks from both lists are combined without comparing their scores, so a document both lists like rises." : "Each retriever alone misses the queries the other handles."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "method") === "rrf") ev.push("fused");
    if (str(v, "method") === "sum" && out.metrics.inTop3! < 5) ev.push("scale-trap");
    return ev;
  },
  scene: (n): SceneOut => (n === "lists" ? { set: { method: "bm25" }, focus: ["method"] } : n === "rrf" ? { set: { method: "rrf", k: 60 }, focus: ["method"] } : n === "scores" ? { set: { method: "sum" }, focus: ["method"] } : undefined),
};

// ------------------------------------------------------------------ HyDE: embed a hypothetical answer

export function hydeRun(method: string, quality: number) {
  const rng = new Rng("hyde-space");
  const docs: { x: number; y: number; relevant: boolean }[] = [];
  for (let i = 0; i < 40; i++) docs.push({ x: 0.74 + (rng.next() - 0.5) * 0.34, y: 0.7 + (rng.next() - 0.5) * 0.34, relevant: true });
  for (let i = 0; i < 160; i++) docs.push({ x: rng.next(), y: rng.next(), relevant: false });
  const question = { x: 0.2, y: 0.28 };
  const target = { x: 0.78, y: 0.72 };
  const wrong = { x: 0.3, y: 0.85 };
  const hypo = method === "hyde" ? { x: question.x + (target.x - question.x) * quality + (wrong.x - question.x) * (1 - quality) * 0.9, y: question.y + (target.y - question.y) * quality + (wrong.y - question.y) * (1 - quality) * 0.9 } : question;
  const ranked = docs.map((d) => ({ ...d, dist: Math.hypot(d.x - hypo.x, d.y - hypo.y) })).sort((a, b) => a.dist - b.dist);
  const top = ranked.slice(0, 10);
  const topSet = new Set(top.map((d) => `${d.x},${d.y}`));
  return { docs, question, hypo, top, topSet, recall: top.filter((d) => d.relevant).length / 10 };
}

export const hydeLab: LabModel = {
  id: "hyde-lab",
  metrics: ["precisionAt10", "extraMs", "extraUsd"],
  observes: ["hyde-on", "drifted"],
  scenes: ["gap", "hyde", "drift"],
  runLabel: "Ship the retriever",
  honest: [
    "Questions and answers live in different regions of the embedding space in this lab, because they are phrased differently. HyDE asks a model to write a hypothetical answer and embeds that, which lands nearer to real answers.",
    "A hypothetical answer is only as good as what the model knows. If it lacks the domain it writes a plausible answer about the wrong thing, which drifts the search toward the wrong documents. Showing it a few retrieved passages first raises its quality, at the price of another retrieval and a longer prompt.",
    "The extra call adds about 700 ms and a fraction of a cent. Precision is measured over the 10 nearest of 200 documents, 40 of which are relevant.",
  ],
  init: (c) => ({ method: "plain", quality: (c as { quality?: number }).quality ?? 0.85, ground: false }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "method", label: "What is embedded for search", options: [{ id: "plain", label: "The question itself" }, { id: "hyde", label: "A hypothetical answer written by an LLM (HyDE)" }] }];
    if (!(c as { lockQuality?: boolean }).lockQuality) out.push({ kind: "slider", id: "quality", label: "How much the LLM knows about this domain", min: 0, max: 1, step: 0.05, fmt: "pct" });
    out.push({ kind: "toggle", id: "ground", label: "Show the LLM a few retrieved passages first", detail: "Raises the quality of the hypothetical answer; adds a retrieval and about 400 ms" });
    return out;
  },
  evaluate: (v) => {
    const hyde = str(v, "method") === "hyde";
    const q = Math.min(0.95, num(v, "quality") + (bool(v, "ground") ? 0.4 : 0));
    const r = hydeRun(str(v, "method"), q);
    const ms = hyde ? 700 + (bool(v, "ground") ? 400 : 0) : 0;
    const usd = hyde ? 0.003 + (bool(v, "ground") ? 0.002 : 0) : 0;
    return {
      metrics: { precisionAt10: r.recall, extraMs: ms, extraUsd: usd },
      readouts: [
        { label: "Relevant results in the top 10", value: r.recall, fmt: "pct", tone: r.recall > 0.6 ? "ok" : r.recall > 0.3 ? "warn" : "alert" },
        { label: "Added latency", value: ms, fmt: "ms" },
        { label: "Added cost per query", value: usd, fmt: "usd" },
      ],
      view: { kind: "scatter", points: [...r.docs.map((d) => ({ x: d.x, y: d.y, tone: (r.topSet.has(`${d.x},${d.y}`) ? (d.relevant ? "ok" : "alert") : d.relevant ? "info" : "muted") as Tone, size: r.topSet.has(`${d.x},${d.y}`) ? 6 : 3 })), { x: r.question.x, y: r.question.y, label: "question", ring: !hyde }, ...(hyde ? [{ x: r.hypo.x, y: r.hypo.y, label: "hypothetical answer", ring: true }] : [])], radius: Math.hypot(r.top[9]!.x - (hyde ? r.hypo.x : r.question.x), r.top[9]!.y - (hyde ? r.hypo.y : r.question.y)), caption: "Blue points are the relevant documents. Green and red points are what the search returned.", legend: [{ tone: "info", label: "relevant, not returned" }, { tone: "ok", label: "returned, relevant" }, { tone: "alert", label: "returned, irrelevant" }] },
      notes: [hyde ? (q < 0.5 ? "The model does not know this domain, so its invented answer points at the wrong documents." : "The hypothetical answer sits near real answers, so the search finds them.") : "The question is phrased unlike the answers, so it lands far from them in the space."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "method") === "hyde") ev.push("hyde-on");
    if (str(v, "method") === "hyde" && num(v, "quality") < 0.5 && !bool(v, "ground")) ev.push("drifted");
    return ev;
  },
  scene: (n): SceneOut => (n === "gap" ? { set: { method: "plain" }, focus: ["method"] } : n === "hyde" ? { set: { method: "hyde", quality: 0.85, ground: false }, focus: ["method"] } : n === "drift" ? { set: { method: "hyde", quality: 0.2, ground: false }, focus: ["quality"] } : undefined),
};

// ------------------------------------------------------------------ two-stage retrieval and reranking

export const rerankLab: LabModel = {
  id: "rerank-lab",
  metrics: ["precisionAt3", "recallAtK", "latencyMs", "costUsd", "candidates"],
  observes: ["two-stage", "all-cross"],
  scenes: ["bi", "cross", "two"],
  runLabel: "Ship the pipeline",
  honest: [
    "Relevant and irrelevant documents are separated by d standard deviations of score noise: 4.5 for the fast bi-encoder, 6 for a cross-encoder reranker, 7 for an LLM reranker. These are illustrative separations, chosen so the trends match published ones; measure your own.",
    "The first stage returns the K highest-scoring documents out of a million. Recall at K is the chance the relevant document is among them; the reranker then orders those K, and precision at 3 is the chance the relevant document is in the top three.",
    "Bi-encoder search costs about 15 ms via an ANN index. A cross-encoder reads each query and document together, about 0.5 ms per candidate when batched; an LLM reranker costs about 3 ms and $0.0005 per candidate.",
  ],
  init: (c) => ({ mode: (c as { mode?: string }).mode ?? "bi", k: 50, reranker: "cross" }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockMode?: boolean }).lockMode) out.push({ kind: "choice", id: "mode", label: "Pipeline", options: [{ id: "bi", label: "Bi-encoder only", detail: "Embed the query, search the index" }, { id: "cross-all", label: "Cross-encoder on every document", detail: "Score each query and document pair" }, { id: "two", label: "Bi-encoder, then rerank the top K" }] });
    out.push({ kind: "slider", id: "k", label: "Candidates passed to the reranker (K)", min: 5, max: 2000, log: true, fmt: "int" });
    out.push({ kind: "choice", id: "reranker", label: "Reranker", options: [{ id: "cross", label: "Cross-encoder", detail: "About 0.5 ms per candidate" }, { id: "llm", label: "LLM reranker", detail: "Most accurate, about 3 ms and $0.0005 per candidate" }] });
    return out;
  },
  evaluate: (v) => {
    const N = 1e6;
    const mode = str(v, "mode");
    const llm = str(v, "reranker") === "llm";
    const d1 = 4.5;
    const d2 = llm ? 7 : 6;
    const perMs = llm ? 3 : 0.5;
    const perUsd = llm ? 0.0005 : 0.00001;
    const K = mode === "bi" ? 3 : Math.round(num(v, "k"));
    const recallAt = (k: number) => 1 - normCdf(normInv(1 - Math.min(k, N - 1) / N) - d1);
    const rerankedPrecision = (k: number) => recallAt(k) * normCdf(d2 - normInv(1 - Math.min(0.99, 3 / Math.max(k, 4))));
    let precision: number;
    let latency: number;
    let cost: number;
    let recall: number;
    if (mode === "bi") {
      recall = recallAt(3);
      precision = recallAt(3);
      latency = 15;
      cost = 0.00002;
    } else if (mode === "cross-all") {
      recall = 1;
      precision = normCdf(d2 - normInv(1 - 3 / N));
      latency = N * perMs;
      cost = N * perUsd;
    } else {
      recall = recallAt(K);
      precision = rerankedPrecision(K);
      latency = 15 + K * perMs;
      cost = 0.00002 + K * perUsd;
    }
    const xs = sweep(5, 2000, 24, true).map((x) => Math.round(x));
    return {
      metrics: { precisionAt3: precision, recallAtK: recall, latencyMs: latency, costUsd: cost, candidates: mode === "bi" ? 0 : mode === "cross-all" ? N : K },
      readouts: [
        { label: "Right document in the top 3", value: precision, fmt: "pct", tone: precision > 0.85 ? "ok" : precision > 0.6 ? "warn" : "alert" },
        { label: "Found by the first stage", value: recall, fmt: "pct", sub: mode === "two" ? `top ${K}` : undefined },
        { label: "Latency", value: latency, fmt: "ms", tone: latency > 1000 ? "alert" : latency > 200 ? "warn" : "ok" },
        { label: "Cost per query", value: cost, fmt: "usd", sub: cost < 0.01 ? `$${(cost * 1000).toFixed(2)} per 1,000` : undefined },
      ],
      view: { kind: "curve", xLabel: "candidates K reranked", yLabel: "right document in the top 3", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "p", label: "Two-stage precision", tone: "ok", points: xs.map((x) => [x, rerankedPrecision(x)] as [number, number]) }, { id: "r", label: "First-stage recall at K", tone: "info", dashed: true, points: xs.map((x) => [x, recallAt(x)] as [number, number]) }], marker: mode === "two" ? { x: K, y: precision, label: `${(precision * 100).toFixed(0)}%`, tone: "amber" } : undefined },
      notes: [mode === "cross-all" ? `Scoring all ${N.toLocaleString("en-US")} documents with a cross-encoder would take about ${(latency / 3600000).toFixed(1)} hours per query.` : mode === "bi" ? "A bi-encoder is fast because documents are embedded ahead of time, but it never reads the query and document together." : "The reranker can only reorder what the first stage found, so recall at K caps the result."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "mode") === "two") ev.push("two-stage");
    if (str(v, "mode") === "cross-all") ev.push("all-cross");
    return ev;
  },
  scene: (n): SceneOut => (n === "bi" ? { set: { mode: "bi" }, focus: ["mode"] } : n === "cross" ? { set: { mode: "cross-all" }, focus: ["mode"] } : n === "two" ? { set: { mode: "two", k: 100 }, focus: ["k"] } : undefined),
};

// ------------------------------------------------------------------ chunking

export const chunkLab: LabModel = {
  id: "chunk-lab",
  metrics: ["quality", "coverage", "tokensToLlm", "indexMultiplier"],
  observes: ["overlap-used", "too-big"],
  scenes: ["small", "big", "overlap"],
  runLabel: "Re-index the documents",
  honest: [
    "A question is answered by one span of about 150 tokens somewhere in a long document. Coverage is the chance a chunk contains the whole span: min(1, (C − span) ÷ (C − overlap)) for chunk size C.",
    "Large chunks dilute the embedding with unrelated text, so the chance the right chunk ranks highly falls as C grows past about twice the span. The lab uses 0.4 + 0.6 × √min(1, 2 × span ÷ C), an illustrative curve.",
    "Overlap repeats text across neighbouring chunks, which raises coverage and multiplies the size of the index by C ÷ (C − overlap).",
  ],
  init: (c) => ({ size: 256, overlap: 0, k: (c as { k?: number }).k ?? 5 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "slider", id: "size", label: "Chunk size (tokens)", min: 50, max: 2000, log: true, fmt: "int" }, { kind: "slider", id: "overlap", label: "Overlap between chunks (tokens)", min: 0, max: 1000, step: 10, fmt: "int" }];
    if (!(c as { lockK?: boolean }).lockK) out.push({ kind: "slider", id: "k", label: "Chunks sent to the model", min: 1, max: 10, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v, c) => {
    const L = Number((c as { span?: number }).span ?? 150);
    const C = num(v, "size");
    const O = Math.min(num(v, "overlap"), C - 10);
    const cover = C <= L ? 0 : Math.min(1, (C - L) / (C - O));
    const ret = 0.4 + 0.6 * Math.sqrt(Math.min(1, (2 * L) / C));
    const quality = cover * ret;
    const k = Math.round(num(v, "k"));
    const xs = sweep(50, 2000, 28, true);
    const q = (s: number) => {
      const cc = Math.max(0, s <= L ? 0 : Math.min(1, (s - L) / (s - Math.min(O, s - 10)))) * (0.4 + 0.6 * Math.sqrt(Math.min(1, (2 * L) / s)));
      return cc;
    };
    return {
      metrics: { quality, coverage: cover, tokensToLlm: k * C, indexMultiplier: C / (C - O) },
      readouts: [
        { label: "Questions answered by the retrieved chunks", value: quality, fmt: "pct", tone: quality > 0.85 ? "ok" : quality > 0.65 ? "warn" : "alert" },
        { label: "A chunk holds the whole answer span", value: cover, fmt: "pct" },
        { label: "Tokens sent to the model", value: k * C, fmt: "int", sub: "per question" },
        { label: "Index size vs no overlap", value: C / (C - O), fmt: "x" },
      ],
      view: { kind: "curve", xLabel: "chunk size (tokens)", yLabel: "questions answered", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "q", label: "With this overlap", tone: "ok", points: xs.map((x) => [x, q(x)] as [number, number]) }], marker: { x: C, y: quality, label: `${(quality * 100).toFixed(0)}%`, tone: "amber" }, vLines: [{ x: L, label: "answer span", tone: "info" }] },
      notes: [C <= L ? "Chunks shorter than the answer span can never hold it whole." : C > 4 * L ? "Big chunks mostly carry text unrelated to the question, which dilutes their embedding." : "Chunks a little larger than the span, with some overlap, hold whole answers and stay focused."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "overlap") > 0) ev.push("overlap-used");
    if (num(v, "size") >= 1000) ev.push("too-big");
    return ev;
  },
  scene: (n): SceneOut => (n === "small" ? { set: { size: 100, overlap: 0 }, focus: ["size"] } : n === "big" ? { set: { size: 1500, overlap: 0 }, focus: ["size"] } : n === "overlap" ? { set: { size: 400, overlap: 130 }, focus: ["overlap"] } : undefined),
};

// ------------------------------------------------------------------ metadata filtering

export const filterLab: LabModel = {
  id: "filter-lab",
  metrics: ["resultsFound", "latencyMs", "complete"],
  observes: ["post-starved", "pre-ok"],
  scenes: ["post", "pre", "partition"],
  runLabel: "Ship the query path",
  honest: [
    "An index of 10 million vectors, a request for the top 10 results that match a filter, and a filter that keeps a share f of the corpus (a tenant, a language, a date range). Post-filtering searches top-K first and drops mismatches, so it returns about K × f results.",
    "Pre-filtering applies the filter first and scans the matching vectors exactly, at about one microsecond each. Partitioning by the filter value gives each tenant its own small index.",
    "ANN search costs about 5 ms plus 0.01 ms per candidate fetched. Real engines have filtered-search modes whose cost sits between these.",
  ],
  init: (c) => ({ method: "post", f: (c as { f?: number }).f ?? 0.01, k: 100 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "method", label: "How the filter is applied", options: [{ id: "post", label: "Post-filter: search top-K, then drop mismatches" }, { id: "pre", label: "Pre-filter: filter first, then scan the matches exactly" }, { id: "partition", label: "Partition the index by the filter value" }] }];
    if (!(c as { lockF?: boolean }).lockF) out.push({ kind: "slider", id: "f", label: "Share of the corpus the filter keeps", min: 0.0001, max: 1, log: true, fmt: "pct" });
    out.push({ kind: "slider", id: "k", label: "K: candidates fetched by post-filtering", min: 10, max: 20000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const N = 1e7;
    const f = num(v, "f");
    const K = num(v, "k");
    const m = str(v, "method");
    let found: number;
    let lat: number;
    if (m === "post") {
      found = Math.min(10, K * f);
      lat = 5 + 0.01 * K;
    } else if (m === "pre") {
      found = Math.min(10, N * f);
      lat = (N * f) / 1000;
    } else {
      found = Math.min(10, N * f);
      lat = 5 + 0.05;
    }
    const xs = sweep(0.0001, 1, 24, true);
    const need = (x: number) => 5 + 0.01 * (10 / x);
    return {
      metrics: { resultsFound: found, latencyMs: lat, complete: found >= 9.5 ? 1 : 0 },
      readouts: [
        { label: "Results returned", value: found, fmt: "num", sub: "wanted 10", tone: found >= 9.5 ? "ok" : "alert" },
        { label: "Latency", value: lat, fmt: "ms", tone: lat > 100 ? "alert" : lat > 30 ? "warn" : "ok" },
        { label: "Candidates a post-filter needs for 10 results", value: Math.min(1e7, 10 / f), fmt: "int" },
      ],
      view: { kind: "curve", xLabel: "share of the corpus the filter keeps", yLabel: "latency to get 10 results", xFmt: "pct", yFmt: "ms", xLog: true, yLog: true, series: [{ id: "post", label: "Post-filter with enough K", tone: "alert", points: xs.map((x) => [x, need(x)] as [number, number]) }, { id: "pre", label: "Pre-filter scan", tone: "warn", points: xs.map((x) => [x, Math.max(0.5, (1e7 * x) / 1000)] as [number, number]) }, { id: "part", label: "Partitioned index", tone: "ok", points: xs.map((x) => [x, 5.05] as [number, number]) }], marker: { x: f, y: Math.max(lat, 0.5), label: m, tone: "amber" } },
      notes: [m === "post" && K * f < 10 ? `Only about ${(K * f).toFixed(1)} of the ${Math.round(K).toLocaleString("en-US")} candidates match the filter, so the user gets fewer results than they asked for.` : m === "pre" ? "Exact scanning is fine for a small tenant and slow for a big one." : "Each filter value has its own small index, so search cost does not depend on the corpus."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "method") === "post" && out.metrics.complete === 0) ev.push("post-starved");
    if (str(v, "method") !== "post" && out.metrics.complete === 1) ev.push("pre-ok");
    return ev;
  },
  scene: (n): SceneOut => (n === "post" ? { set: { method: "post", f: 0.002, k: 100 }, focus: ["method"] } : n === "pre" ? { set: { method: "pre", f: 0.002 }, focus: ["method"] } : n === "partition" ? { set: { method: "partition" }, focus: ["method"] } : undefined),
};

// ------------------------------------------------------------------ ANN indexes

const ANN = {
  flat: { label: "Flat (exact)", recallAt: () => 1, latency: (n: number) => (n * 768) / 5e8, bytes: (n: number) => n * 768 * 4 },
};

export const annLab: LabModel = {
  id: "ann-lab",
  metrics: ["recall", "latencyMs", "memoryGB", "fitsRam"],
  observes: ["recall-moved", "ram-blown"],
  scenes: ["flat", "hnsw", "pq"],
  runLabel: "Build the index",
  honest: [
    "Illustrative curves for 768-dimension float vectors: flat search scans every vector (about 0.2 ms per 100,000 vectors per thread), HNSW recall rises as 1 − e^(−ef ÷ 60) with latency about 0.1 ms plus 0.02 ms per ef step, and IVF recall rises with the share of lists probed. Real behaviour depends on the data and implementation.",
    "Memory: float32 is 4 bytes per dimension, int8 is 1, product quantisation about 64 bytes per vector; HNSW adds about 128 bytes per vector of graph links. Quantisation lowers recall by a few points.",
    "Latency here is per query on one thread at the stated size, with the index in RAM.",
  ],
  init: (c) => ({ index: "flat", param: 100, quant: "f32", n: (c as { n?: number }).n ?? 50000000 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "index", label: "Index", options: [{ id: "flat", label: "Flat: exact scan" }, { id: "ivf", label: "IVF: probe a few clusters" }, { id: "hnsw", label: "HNSW: navigable graph" }] },
      { kind: "choice", id: "quant", label: "Vector storage", options: [{ id: "f32", label: "float32" }, { id: "i8", label: "int8 (scalar quantised)" }, { id: "pq", label: "Product quantised (about 64 bytes)" }] },
      { kind: "slider", id: "param", label: "Search effort (nprobe or ef)", min: 5, max: 1000, log: true, fmt: "int" },
    ];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "Vectors", min: 100000, max: 1000000000, log: true, fmt: "num" });
    return out;
  },
  evaluate: (v) => {
    const n = num(v, "n");
    const p = num(v, "param");
    const idx = str(v, "index");
    const q = str(v, "quant");
    const qLoss = q === "f32" ? 0 : q === "i8" ? 0.01 : 0.07;
    const base = idx === "flat" ? 1 : idx === "hnsw" ? 1 - Math.exp(-p / 60) : 1 - Math.exp(-p / 120);
    const recall = Math.max(0, base - qLoss * (idx === "flat" ? 0 : 1));
    const bytesPerVec = (q === "f32" ? 3072 : q === "i8" ? 768 : 64) + (idx === "hnsw" ? 128 : idx === "ivf" ? 8 : 0);
    const gb = (n * bytesPerVec) / 1e9;
    const bytesScan = q === "f32" ? 1 : q === "i8" ? 0.5 : 0.2;
    const lat = idx === "flat" ? ((n / 1e5) * 0.2) * bytesScan : idx === "hnsw" ? 0.1 + 0.02 * p * Math.log10(Math.max(10, n)) / 6 : 0.2 + (p / 100) * (n / 1e7) * 0.8 * bytesScan;
    const ram = 64;
    const xs = sweep(5, 1000, 20, true);
    const rc = (x: number) => Math.max(0, (idx === "flat" ? 1 : idx === "hnsw" ? 1 - Math.exp(-x / 60) : 1 - Math.exp(-x / 120)) - qLoss * (idx === "flat" ? 0 : 1));
    return {
      metrics: { recall, latencyMs: lat, memoryGB: gb, fitsRam: gb <= ram ? 1 : 0 },
      readouts: [
        { label: "Recall of the true top 10", value: recall, fmt: "pct", tone: recall > 0.95 ? "ok" : recall > 0.85 ? "warn" : "alert" },
        { label: "Latency per query", value: lat, fmt: "ms", tone: lat > 50 ? "alert" : lat > 20 ? "warn" : "ok" },
        { label: "Memory for the index", value: gb, fmt: "num", sub: "GB", tone: gb > ram ? "alert" : "ok" },
        { label: "Fits in a 64 GB machine", value: gb <= ram ? "yes" : "no", tone: gb <= ram ? "ok" : "alert" },
      ],
      view: { kind: "curve", xLabel: "search effort (nprobe or ef)", yLabel: "recall", xFmt: "int", yFmt: "pct", xLog: true, yMax: 1, series: [{ id: "recall", label: "Recall", tone: "ok", points: xs.map((x) => [x, rc(x)] as [number, number]) }], marker: { x: p, y: recall, label: `${(recall * 100).toFixed(0)}%`, tone: "amber" }, hLines: [{ y: 0.95, label: "95%", tone: "info" }] },
      notes: [gb > 64 ? "The index is larger than the machine's RAM. Quantise the vectors, shard the index, or move to disk-based search." : idx === "flat" ? "Exact search is perfect and scales linearly with the corpus." : "Searching harder buys recall at the cost of latency, with diminishing returns."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "index") !== "flat") ev.push("recall-moved");
    if (out.metrics.fitsRam === 0) ev.push("ram-blown");
    return ev;
  },
  scene: (n): SceneOut => (n === "flat" ? { set: { index: "flat", quant: "f32" }, focus: ["index"] } : n === "hnsw" ? { set: { index: "hnsw", quant: "f32", param: 100 }, focus: ["index", "param"] } : n === "pq" ? { set: { quant: "pq" }, focus: ["quant"] } : undefined),
};
void ANN;

// ------------------------------------------------------------------ retrieval evaluation

// Ranked relevance (1 = relevant) for the top 5 results of each of 8 queries, for three systems. Total relevant per query in the corpus.
const EVAL_Q = [
  { q: "refund after cancel", rel: 2, sys: { bm25: [1, 0, 0, 1, 0], vec: [0, 1, 1, 0, 0], hybrid: [1, 1, 0, 0, 0] } },
  { q: "error E-4417", rel: 1, sys: { bm25: [1, 0, 0, 0, 0], vec: [0, 0, 0, 1, 0], hybrid: [1, 0, 0, 0, 0] } },
  { q: "card keeps failing", rel: 3, sys: { bm25: [0, 0, 1, 0, 0], vec: [1, 1, 0, 1, 0], hybrid: [1, 1, 1, 0, 0] } },
  { q: "change my email", rel: 2, sys: { bm25: [1, 0, 1, 0, 0], vec: [1, 1, 0, 0, 0], hybrid: [1, 1, 0, 0, 0] } },
  { q: "app is slow lately", rel: 2, sys: { bm25: [0, 0, 0, 1, 0], vec: [0, 1, 0, 0, 1], hybrid: [0, 1, 1, 0, 0] } },
  { q: "cancel Pigeon Plus", rel: 2, sys: { bm25: [1, 0, 0, 0, 1], vec: [0, 1, 0, 0, 0], hybrid: [1, 1, 0, 0, 0] } },
  { q: "delivery to a new address", rel: 3, sys: { bm25: [0, 1, 0, 0, 0], vec: [1, 0, 1, 0, 0], hybrid: [1, 1, 0, 1, 0] } },
  { q: "two-factor codes not arriving", rel: 2, sys: { bm25: [0, 0, 0, 0, 0], vec: [1, 0, 0, 1, 0], hybrid: [1, 0, 1, 0, 0] } },
];

export function retrievalMetrics(sys: "bm25" | "vec" | "hybrid", k: number) {
  let recall = 0;
  let prec = 0;
  let mrr = 0;
  let ndcg = 0;
  for (const q of EVAL_Q) {
    const list = q.sys[sys].slice(0, k);
    const hits = list.reduce((a, b) => a + b, 0);
    recall += hits / q.rel;
    prec += hits / k;
    const first = list.indexOf(1);
    mrr += first >= 0 ? 1 / (first + 1) : 0;
    const dcg = list.reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
    const ideal = Array.from({ length: Math.min(k, q.rel) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
    ndcg += ideal ? dcg / ideal : 0;
  }
  const n = EVAL_Q.length;
  return { recall: recall / n, precision: prec / n, mrr: mrr / n, ndcg: ndcg / n };
}

export const retevalLab: LabModel = {
  id: "reteval-lab",
  metrics: ["recallAtK", "precisionAtK", "mrr", "ndcg"],
  observes: ["compared", "k-moved"],
  scenes: ["recall", "mrr", "ndcg"],
  runLabel: "Choose the retriever",
  honest: [
    "Eight labelled queries with the first five results of each system marked relevant or not. Eight is far too few to trust in practice; the point is to compute the metrics by hand and see what each rewards.",
    "Recall@k is the share of a query's relevant documents found in the top k. MRR is the mean of 1 ÷ rank of the first relevant result. nDCG@k discounts relevant results by log₂(rank + 1) and divides by the best possible ordering.",
    "A real evaluation uses hundreds of queries, labels from people or a validated judge, and error bars.",
  ],
  init: () => ({ system: "bm25", k: 3 }),
  controls: () => [
    { kind: "choice", id: "system", label: "Retriever", options: [{ id: "bm25", label: "Keyword (BM25)" }, { id: "vec", label: "Vector" }, { id: "hybrid", label: "Hybrid (fused)" }] },
    { kind: "slider", id: "k", label: "k (results considered)", min: 1, max: 5, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const s = str(v, "system") as "bm25" | "vec" | "hybrid";
    const k = Math.round(num(v, "k"));
    const m = retrievalMetrics(s, k);
    const all = (["bm25", "vec", "hybrid"] as const).map((x) => ({ x, m: retrievalMetrics(x, k) }));
    return {
      metrics: { recallAtK: m.recall, precisionAtK: m.precision, mrr: m.mrr, ndcg: m.ndcg },
      readouts: [
        { label: `Recall@${k}`, value: m.recall, fmt: "pct", tone: m.recall > 0.8 ? "ok" : m.recall > 0.5 ? "warn" : "alert" },
        { label: `Precision@${k}`, value: m.precision, fmt: "pct" },
        { label: "MRR", value: m.mrr, fmt: "num" },
        { label: `nDCG@${k}`, value: m.ndcg, fmt: "num", tone: m.ndcg > 0.8 ? "ok" : m.ndcg > 0.55 ? "warn" : "alert" },
      ],
      view: { kind: "bars", fmt: "num", max: 1, bars: all.map((r) => ({ label: `${r.x === "bm25" ? "Keyword" : r.x === "vec" ? "Vector" : "Hybrid"} · nDCG@${k}`, value: r.m.ndcg, tone: r.x === s ? ("amber" as Tone) : ("muted" as Tone), sub: `recall ${(r.m.recall * 100).toFixed(0)}% · MRR ${r.m.mrr.toFixed(2)}` })) },
      notes: ["Each metric rewards a different thing: recall asks 'did we find them', MRR 'how soon is the first', nDCG 'how good is the whole ordering'."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "system") !== "bm25") ev.push("compared");
    if (num(v, "k") !== 3) ev.push("k-moved");
    return ev;
  },
  scene: (n): SceneOut => (n === "recall" ? { set: { k: 5 }, focus: ["k"] } : n === "mrr" ? { set: { k: 1 }, focus: ["k"] } : n === "ndcg" ? { set: { system: "hybrid", k: 5 }, focus: ["system"] } : undefined),
};

export const B4_MODELS: LabModel[] = [embedLab, cosineLab, bm25Lab, rrfLab, hydeLab, rerankLab, chunkLab, filterLab, annLab, retevalLab];
