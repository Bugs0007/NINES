/** Calibration for the Context Tetris model: `npx tsx scripts/ctx.mts`. */
import { ContextConfig, evaluate, type Policy } from "../src/widgets/context/model";
const c = ContextConfig.parse({ variant: "challenge" });
const row = (n: string, p: Policy) => {
  const e = evaluate(c, p);
  console.log(n.padEnd(28), "ovf", String(e.overflowTurn).padEnd(4), "q", e.quality, "in", String(e.inputTokens).padEnd(7), "$/conv", e.costPerConversation.toFixed(3), "$/mo", String(Math.round(e.monthly)).padEnd(6), "ttft", e.ttftS.toFixed(2));
};
console.log("--- mission");
for (const mode of ["full", "last", "summary", "pinned"] as const)
  for (const lastN of mode === "full" || mode === "summary" ? [40] : [2, 5, 6, 10, 26, 34])
    for (const docs of [2, 3, 8]) row(`${mode}${lastN} k${docs}`, { mode, lastN, docs });
console.log("--- bill");
for (const model of ["grader", "fast", "router"] as const)
  for (const cache of [false, true])
    for (const [mode, lastN] of [["last", 34], ["pinned", 6], ["pinned", 10], ["summary", 40]] as const) row(`${mode}${lastN} k3 ${model}${cache ? " cache" : ""}`, { mode, lastN, docs: 3, cache, model });
let s = 0;
for (let t = 1; t <= 20; t++) s += 6400 + 700 * (t - 1);
console.log("prediction: 20-turn full-history input sum", s);
