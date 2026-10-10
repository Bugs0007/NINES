import { poolEval } from "../src/widgets/model-lab/models/a2";
const pc = { appWorkers: 16, poolPerWorker: 10, dbCores: 4, maxConnections: 100, reserved: 3, queryMs: 8, rps: 600, poolerSize: 20 };
for (const p of [1,2,3,4,5,6,8,10]) { const e = poolEval(pc, 16, p, false); console.log("per", p, e.serverConns, "p99", e.p99.toFixed(4), "err", e.errorRate.toFixed(3), "util", e.util.toFixed(2), "cap", e.capacity.toFixed(0)); }
for (const s of [3,4,5,6,8,10,20,40,60]) { const e = poolEval(pc, 16, 10, true, s); console.log("pooler", s, "p99", e.p99.toFixed(4), "err", e.errorRate.toFixed(3), "util", e.util.toFixed(2)); }
