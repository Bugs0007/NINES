import { LAB_MODELS } from "../src/widgets/model-lab/models";
const run = (id: string, v: Record<string, number | string | boolean>, keys: string[], cfg: Record<string, unknown> = {}) => {
  const m = LAB_MODELS[id]!;
  const o = m.evaluate({ ...m.init(cfg), ...((cfg.start ?? {}) as object), ...v }, cfg);
  console.log(id, JSON.stringify(v), keys.map((k) => `${k}=${typeof o.metrics[k] === "number" ? o.metrics[k]!.toFixed(3) : o.metrics[k]}`).join(" "));
};
for (const [k1, b] of [[1.2, 0], [1.2, 0.75], [1.2, 0.9], [1.2, 1], [3, 1], [0.5, 1], [0, 1], [1.2, 0.85], [2, 0.95], [0.3, 0.8]] as const) run("bm25-lab", { k1, b }, ["rightCount"]);
for (const m of ["bm25", "vec", "sum", "rrf"]) run("rrf-lab", { method: m, k: 60 }, ["mrr", "inTop3", "worstRank"]);
for (const k of [1, 5, 20, 100]) run("rrf-lab", { method: "rrf", k }, ["mrr", "inTop3", "worstRank"]);
for (const [m, q] of [["plain", 0.85], ["hyde", 0.95], ["hyde", 0.85], ["hyde", 0.7], ["hyde", 0.5], ["hyde", 0.3], ["hyde", 0.1]] as const) run("hyde-lab", { method: m, quality: q }, ["precisionAt10"]);
