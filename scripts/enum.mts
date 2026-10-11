/**
 * Enumerate a Model Lab model's control combinations and list those that pass a set of conditions.
 * Usage: npx tsx scripts/enum.mts <modelId> '<json conditions>' ['<json config>'] [--all]
 * Conditions: [{"m":"metric","op":"<=","v":1}, ...]. Sliders are sampled at min, mid and max.
 */
import { LAB_MODELS } from "../src/widgets/model-lab/models";

const [id, condJson, cfgJson, flag] = process.argv.slice(2) as [string, string?, string?, string?];
const model = LAB_MODELS[id];
if (!model) throw new Error(`no model ${id}`);
const conds = JSON.parse(condJson ?? "[]") as { m: string; op: string; v: number }[];
const cfg = JSON.parse(cfgJson && cfgJson !== "--all" ? cfgJson : "{}") as Record<string, unknown>;
const all = flag === "--all" || cfgJson === "--all";
const controls = model.controls(cfg);
const base = { ...model.init(cfg), ...((cfg.start ?? {}) as object) };

type V = Record<string, number | string | boolean>;
let combos: V[] = [{}];
for (const c of controls) {
  const opts: (number | string | boolean)[] =
    c.kind === "choice" ? c.options.map((o) => o.id) : c.kind === "toggle" ? [false, true] : [c.min, c.log ? Math.sqrt(c.min * c.max) : (c.min + c.max) / 2, c.max].map((x) => (c.step && c.step >= 1 ? Math.round(x) : x));
  combos = combos.flatMap((p) => opts.map((o) => ({ ...p, [c.id]: o })));
}
const ok = (x: number, op: string, v: number) => (op === "<=" ? x <= v : op === ">=" ? x >= v : op === "<" ? x < v : x > v);
let pass = 0;
const keys = new Set(conds.map((c) => c.m));
for (const v of combos) {
  const o = model.evaluate({ ...base, ...v }, cfg);
  const good = conds.every((c) => ok(o.metrics[c.m]!, c.op, c.v));
  if (good) pass++;
  if (good || all) console.log(good ? "PASS" : "    ", JSON.stringify(v), [...keys].concat(model.metrics.filter((k) => !keys.has(k))).map((k) => `${k}=${o.metrics[k]!.toPrecision(4)}`).join(" "));
}
console.log(`${pass} of ${combos.length} pass`);
