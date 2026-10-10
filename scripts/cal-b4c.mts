import { LAB_MODELS } from "../src/widgets/model-lab/models";
const run = (id: string, v: Record<string, number | string | boolean>, keys: string[], cfg: Record<string, unknown> = {}) => { const m = LAB_MODELS[id]!; const o = m.evaluate({ ...m.init(cfg), ...((cfg.start ?? {}) as object), ...v }, cfg); console.log(id, JSON.stringify(v), keys.map((k) => `${k}=${typeof o.metrics[k] === "number" ? o.metrics[k]!.toFixed(3) : o.metrics[k]}`).join(" ")); };
const hc = { lockQuality: true, quality: 0.35 };
for (const v of [{ method: "plain" }, { method: "hyde" }, { method: "hyde", ground: true }, { method: "plain", ground: true }]) run("hyde-lab", v, ["precisionAt10", "extraMs"], hc);
