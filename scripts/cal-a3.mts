import { LAB_MODELS } from "../src/widgets/model-lab/models";
const run = (id: string, v: Record<string, number | string | boolean>, keys: string[], cfg: Record<string, unknown> = {}) => { const m = LAB_MODELS[id]!; const o = m.evaluate({ ...m.init(cfg), ...v }, cfg); console.log(id, JSON.stringify(v), keys.map((k) => `${k}=${o.metrics[k]!.toFixed(3)}`).join(" ")); };
for (const ttl of [30, 60, 300, 3600]) for (const lb of [false, true]) run("dns-lab", { ttl, lb, rate: 0.02 }, ["avgMs", "staleSec", "hitRatio", "authLoad"]);
for (const st of ["h1-tls12", "h2-tls13", "h3-quic"]) for (const res of [false, true]) run("connect-lab", { stack: st, resumed: res, rtt: 100 }, ["ttfbMs", "totalMs"]);
for (const re of [false, true]) run("connect-lab", { stack: "h1-tls12", reuse: re, requests: 10, rtt: 100 }, ["ttfbMs", "totalMs", "setupMs"]);
for (const p of ["h1", "h2", "h3"]) for (const l of [0, 0.01, 0.03]) run("lane-lab", { proto: p, loss: l }, ["loadMs", "stallMs"]);
for (const b of [false, true]) for (const sl of [0.05, 0.2]) run("proxy-lab", { buffering: b, slowShare: sl }, ["capacityRps", "util", "p99", "errorRate"]);
for (const pops of [1, 2, 3, 5]) run("cdn-lab", { cdn: true, pops, rate: 0.5, ttl: 300 }, ["avgMs", "worstMs", "hitRatio"]);
run("cdn-lab", { cdn: false }, ["avgMs", "worstMs"]);
for (const m of ["dns", "anycast"]) for (const s of [1, 2, 4]) run("anycast-lab", { method: m, sites: s, down: true }, ["avgMs", "failoverS"]);
for (const reg of ["jakarta", "frankfurt"]) { run("journey-lab", { region: reg }, ["ttfbMs", "roundTrips"]); run("journey-lab", { region: reg, dnsCached: true, tls13: true, reuse: true }, ["ttfbMs"]); run("journey-lab", { region: reg, edge: true }, ["ttfbMs"]); run("journey-lab", { region: reg, dnsCached: true, tls13: true, reuse: true, edge: true }, ["ttfbMs"]); }
for (const v of [{}, { cdn: true }, { cdn: true, tls13: true, h3: true, keepalive: true }, { cdn: true, tls13: true, h3: true, keepalive: true, ttl: 86400 }, { tls13: true, region2: "sg" }, { tls13: true, region2: "sg", keepalive: true }, { cdn: true, tls13: true, keepalive: true }, { cdn: true, h3: true, keepalive: true, ttl: 600 }]) run("far-lab", v, ["p75Ms", "worstMs", "costPerMonth"]);
