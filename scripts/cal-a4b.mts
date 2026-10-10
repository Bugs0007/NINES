import { LAB_MODELS } from "../src/widgets/model-lab/models";
const m = LAB_MODELS["stampede-lab"]!;
const cfg = { lockKeys: true, keys: 40, perKeyRps: 30, dbCap: 600, start: { mode: "lock", jitter: true, keys: 40 } };
for (const [mode, jit] of [["none", false], ["none", true], ["lock", false]] as const) { const o = m.evaluate({ ...m.init(cfg), ...cfg.start, mode, jitter: jit }, cfg); console.log(mode, jit, o.metrics.dbPeakUtil, o.metrics.errorRate); }
