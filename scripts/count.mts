import { GRAPH, CHAPTERS } from "../src/content/graph";
const by: Record<string, number> = {};
for (const n of GRAPH) if (n.status === "planned") by[n.kind] = (by[n.kind] ?? 0) + 1;
console.log(by);
for (const c of CHAPTERS) { const ns = GRAPH.filter((n) => n.chapter === c.id && n.status === "planned"); console.log(c.id, ns.length, ns.map((n) => n.id + (n.kind !== "concept" ? `(${n.kind[0]})` : "")).join(" ")); }
