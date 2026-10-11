/**
 * Chapter A3 "The Request Journey" models: DNS, connection setup, HTTP lanes, reverse proxies, CDNs, anycast, the
 * whole journey, and the Jakarta boss. Round-trip times come from distance: RTT = 8 ms + 0.015 ms per km
 * (light in fibre covers about 200 km per millisecond one way; routes are about 1.5x longer than the great circle).
 */
import { bool, num, str, sweep, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

export const rttKm = (km: number) => 8 + 0.015 * km;

/** Distances from the origin (ap-south-2), km. */
export const REGIONS = [
  { id: "mumbai", label: "Mumbai", km: 620 },
  { id: "jakarta", label: "Jakarta", km: 3900 },
  { id: "frankfurt", label: "Frankfurt", km: 6800 },
  { id: "virginia", label: "Virginia", km: 13500 },
  { id: "saopaulo", label: "São Paulo", km: 14400 },
] as const;

// ------------------------------------------------------------------ DNS

const dnsHops = (rttStub: number) => [
  { id: "stub", label: "Your device asks its recursive resolver", ms: rttStub, detail: "A round trip to the ISP or public resolver" },
  { id: "root", label: "Resolver asks a root server: who handles .com?", ms: 30, detail: "Cached for days by almost every resolver" },
  { id: "tld", label: "Resolver asks the .com servers: who handles pigeon.chat?", ms: 40, detail: "Cached for the name server's TTL" },
  { id: "auth", label: "Resolver asks pigeon.chat's name servers for the address", ms: 60, detail: "The answer carries your TTL" },
];

export const dnsLab: LabModel = {
  id: "dns-lab",
  metrics: ["coldMs", "avgMs", "hitRatio", "staleSec", "authLoad"],
  observes: ["walked", "ttl-moved"],
  scenes: ["relay", "cache", "ttl"],
  runLabel: "Set the TTL",
  honest: [
    "Hop times are round numbers for a resolver a few tens of milliseconds from the root, TLD, and authoritative servers. Yours will differ by region.",
    "Hit ratio assumes one fixed TTL and Poisson query arrivals at each resolver. Real resolvers may cap or extend TTLs, and prefetch popular names.",
    "A resolver in front of many users sees many queries a second, which is why popular names are almost always cached.",
  ],
  init: () => ({ view: "chain", cache: "cold", ttl: 60, rate: 0.02, stubMs: 15, lb: false }),
  controls: (c) => {
    const lock = (c as { lockView?: string }).lockView;
    const out: Control[] = [];
    if (!lock) out.push({ kind: "choice", id: "view", label: "Show", options: [{ id: "chain", label: "Follow one lookup" }, { id: "ttl", label: "Cache hit ratio and TTL" }] });
    out.push({ kind: "choice", id: "cache", label: "What the resolver already knows", options: [{ id: "cold", label: "Nothing (cold)" }, { id: "tld", label: ".com servers (typical)" }, { id: "warm", label: "The answer for this name" }] });
    out.push({ kind: "slider", id: "ttl", label: "Record TTL", min: 1, max: 86400, log: true, fmt: "s", hint: "How long a resolver may reuse the answer" });
    out.push({ kind: "slider", id: "rate", label: "Lookups per second reaching one resolver", min: 0.001, max: 50, log: true, fmt: "num" });
    out.push({ kind: "toggle", id: "lb", label: "Address is a load balancer or anycast IP", detail: "Failures are handled behind the address, so DNS never has to change" });
    return out;
  },
  evaluate: (v) => {
    const stub = num(v, "stubMs");
    const hops = dnsHops(stub);
    const cache = str(v, "cache");
    const msFor = (h: (typeof hops)[number], i: number) => (i === 0 ? stub : i === 1 || i === 2 ? (cache === "cold" ? h.ms : 0) : cache === "warm" ? 0 : h.ms);
    const coldMs = stub + 30 + 40 + 60;
    const missMs = stub + 60;
    const thisMs = hops.reduce((sum, h, i) => sum + msFor(h, i), 0);
    const ttl = num(v, "ttl");
    const r = num(v, "rate");
    const hit = (r * ttl) / (1 + r * ttl);
    const avg = (1 - hit) * missMs + hit * stub;
    const stale = bool(v, "lb") ? 0 : ttl;
    const authLoad = (1 - hit) * r;
    const ttls = sweep(1, 86400, 30, true);
    const lookup = (t: number) => (1 - (r * t) / (1 + r * t)) * missMs + ((r * t) / (1 + r * t)) * stub;
    return {
      metrics: { coldMs, avgMs: avg, hitRatio: hit, staleSec: stale, authLoad, thisMs },
      readouts: [
        { label: "This lookup", value: thisMs, fmt: "ms" },
        { label: "Average lookup at this TTL", value: avg, fmt: "ms", tone: avg < 30 ? "ok" : avg < 60 ? "warn" : "alert" },
        { label: "Resolver cache hit ratio", value: hit, fmt: "pct" },
        { label: "Worst-case wait for a change", value: stale, fmt: "s", tone: stale > 300 ? "alert" : stale > 60 ? "warn" : "ok", sub: bool(v, "lb") ? "no DNS change needed" : "the TTL" },
        { label: "Queries reaching your name servers", value: authLoad, fmt: "num", sub: "per second, per resolver" },
      ],
      view:
        str(v, "view") === "ttl"
          ? { kind: "curve", xLabel: "record TTL", yLabel: "average lookup", xFmt: "s", yFmt: "ms", xLog: true, series: [{ id: "avg", label: "Average lookup", tone: "amber", points: ttls.map((t) => [t, lookup(t)] as [number, number]) }], marker: { x: ttl, y: avg, label: `${Math.round(ttl)}s`, tone: "amber" }, vLines: [{ x: 300, label: "5 min", tone: "info" }] }
          : { kind: "steps", steps: hops.map((h, i) => ({ label: h.label, detail: h.detail, value: i <= 0 ? `${msFor(h, i)}ms` : msFor(h, i) === 0 ? "cached" : `${msFor(h, i)}ms`, tone: i > 0 && msFor(h, i) === 0 ? "muted" : "info" })) },
      notes: [bool(v, "lb") ? "With an address that never changes, the TTL can be long and lookups stay cheap." : `A change can take up to ${Math.round(ttl)}s to reach every resolver that already cached the old answer.`],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "view") === "chain" && str(v, "cache") !== "cold") ev.push("walked");
    if (num(v, "ttl") !== 60) ev.push("ttl-moved");
    return ev;
  },
  scene: (n): SceneOut => (n === "relay" ? { set: { view: "chain", cache: "cold" }, focus: ["cache"] } : n === "cache" ? { set: { view: "chain", cache: "tld" }, focus: ["cache"] } : n === "ttl" ? { set: { view: "ttl" }, focus: ["ttl"] } : undefined),
};

// ------------------------------------------------------------------ connection setup (TCP, TLS, QUIC, keep-alive)

export type Stack = "h1-tls12" | "h2-tls13" | "h3-quic";
const STACKS: Record<Stack, { label: string; detail: string; connectRtts: number; resumedRtts: number }> = {
  "h1-tls12": { label: "HTTP/1.1 over TCP + TLS 1.2", detail: "TCP handshake, then two TLS round trips", connectRtts: 3, resumedRtts: 2 },
  "h2-tls13": { label: "HTTP/2 over TCP + TLS 1.3", detail: "TCP handshake, then one TLS round trip", connectRtts: 2, resumedRtts: 1 },
  "h3-quic": { label: "HTTP/3 over QUIC (UDP)", detail: "Transport and TLS 1.3 in one round trip", connectRtts: 1, resumedRtts: 0 },
};

export function connectCost(stack: Stack, rtt: number, resumed: boolean): number {
  const s = STACKS[stack];
  return (resumed ? s.resumedRtts : s.connectRtts) * rtt;
}

export const connectLab: LabModel = {
  id: "connect-lab",
  metrics: ["ttfbMs", "totalMs", "setupMs", "roundTrips"],
  observes: ["compared", "reused"],
  scenes: ["tcp", "tls", "reuse", "udp"],
  runLabel: "Ship it",
  honest: [
    "Setup costs are counted in whole round trips and server think time is a fixed 20 ms. Real handshakes also pay for certificate size, packet loss, and CPU.",
    "TLS 1.3 and QUIC 0-RTT resumption send data in the first flight, which carries a replay risk for non-idempotent requests, so servers restrict it.",
    "HTTP/1.1 without keep-alive opens a new connection per request; with keep-alive it reuses one. Browsers also open up to six connections in parallel, which this lab does not draw.",
  ],
  init: () => ({ rtt: 100, stack: "h1-tls12", resumed: false, reuse: false, requests: 1, dnsMs: 40 }),
  controls: () => [
    { kind: "slider", id: "rtt", label: "Round-trip time to the server", min: 5, max: 300, log: true, fmt: "ms" },
    { kind: "choice", id: "stack", label: "Protocol stack", options: (Object.keys(STACKS) as Stack[]).map((k) => ({ id: k, label: STACKS[k].label, detail: STACKS[k].detail })) },
    { kind: "toggle", id: "resumed", label: "Resumed session", detail: "The client has talked to this server recently" },
    { kind: "toggle", id: "reuse", label: "Keep the connection alive", detail: "Later requests reuse the open connection" },
    { kind: "slider", id: "requests", label: "Sequential requests to this server", min: 1, max: 30, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const rtt = num(v, "rtt");
    const stack = str(v, "stack") as Stack;
    const n = Math.round(num(v, "requests"));
    const think = 20;
    const dns = num(v, "dnsMs");
    const setup = connectCost(stack, rtt, bool(v, "resumed"));
    const first = dns + setup + rtt + think;
    const later = bool(v, "reuse") ? rtt + think : setup + rtt + think;
    const total = first + (n - 1) * later + (n > 1 ? 0 : 0);
    const handshakeRtts = (bool(v, "resumed") ? STACKS[stack].resumedRtts : STACKS[stack].connectRtts);
    const rows: { label: string; start: number; ms: number; tone: Tone }[] = [
      { label: "DNS lookup", start: 0, ms: dns, tone: "lilac" as const },
      { label: stack === "h3-quic" ? "QUIC + TLS 1.3 handshake" : "TCP handshake", start: dns, ms: stack === "h3-quic" ? setup : rtt, tone: "warn" as const },
      ...(stack === "h3-quic" ? [] : [{ label: "TLS handshake", start: dns + rtt, ms: setup - rtt, tone: "warn" as const }]),
      { label: "Request and first byte", start: dns + setup, ms: rtt + think, tone: "ok" as const },
    ].filter((r) => r.ms > 0);
    if (n > 1) rows.push({ label: `${n - 1} more request${n > 2 ? "s" : ""}${bool(v, "reuse") ? " (reused connection)" : " (new connection each)"}`, start: first, ms: (n - 1) * later, tone: bool(v, "reuse") ? ("ok" as const) : ("alert" as const) });
    return {
      metrics: { ttfbMs: first, totalMs: total, setupMs: setup, roundTrips: handshakeRtts + 1 },
      readouts: [
        { label: "First byte", value: first, fmt: "ms", tone: first > 500 ? "alert" : first > 300 ? "warn" : "ok" },
        { label: `All ${n} request${n > 1 ? "s" : ""}`, value: total, fmt: "ms" },
        { label: "Round trips before data", value: handshakeRtts, fmt: "int", sub: `${setup}ms of setup` },
        { label: "Share spent on setup", value: (setup * (bool(v, "reuse") ? 1 : n)) / total, fmt: "pct" },
      ],
      view: { kind: "waterfall", rows },
      notes: [bool(v, "reuse") ? "Setup is paid once; every later request costs one round trip." : n > 1 ? "Without reuse, every request repeats the handshake." : "The handshake sits in front of the first byte."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "stack") !== "h1-tls12") ev.push("compared");
    if (bool(v, "reuse") && num(v, "requests") > 1) ev.push("reused");
    return ev;
  },
  scene: (n): SceneOut => (n === "tcp" ? { set: { stack: "h1-tls12", resumed: false, reuse: false, requests: 1 }, focus: ["stack"] } : n === "tls" ? { set: { stack: "h2-tls13" }, focus: ["stack", "resumed"] } : n === "reuse" ? { set: { requests: 10, reuse: true }, focus: ["reuse", "requests"] } : n === "udp" ? { set: { stack: "h3-quic" }, focus: ["stack"] } : undefined),
};

// ------------------------------------------------------------------ HTTP lanes

export const laneLab: LabModel = {
  id: "lane-lab",
  metrics: ["loadMs", "stallMs", "lanes"],
  observes: ["raced", "loss-hurts"],
  scenes: ["h1", "h2", "h3"],
  runLabel: "Load the page",
  honest: [
    "Objects are equal in size and bandwidth is shared evenly. Real pages mix a few large and many small objects, and congestion control shapes the rest.",
    "A lost packet stalls every stream on a TCP connection until it is retransmitted (about one extra round trip here). QUIC stalls only the stream that lost it. Real loss comes in bursts.",
    "HTTP/1.1 uses six connections to one host, as browsers do. Setup costs are counted once per connection.",
  ],
  init: () => ({ proto: "h1", objects: 60, rtt: 80, loss: 0.01, mbps: 20, sizeKb: 40 }),
  controls: () => [
    { kind: "choice", id: "proto", label: "Protocol", options: [{ id: "h1", label: "HTTP/1.1", detail: "Six connections, one request at a time on each" }, { id: "h2", label: "HTTP/2", detail: "One TCP connection, many streams" }, { id: "h3", label: "HTTP/3", detail: "QUIC: many streams, independent loss recovery" }] },
    { kind: "slider", id: "objects", label: "Objects on the page", min: 5, max: 200, step: 5, fmt: "int" },
    { kind: "slider", id: "rtt", label: "Round-trip time", min: 10, max: 300, log: true, fmt: "ms" },
    { kind: "slider", id: "loss", label: "Packet loss", min: 0, max: 0.05, step: 0.0025, fmt: "pct" },
  ],
  evaluate: (v) => {
    const p = str(v, "proto");
    const n = num(v, "objects");
    const rtt = num(v, "rtt");
    const loss = num(v, "loss");
    const sizeBytes = num(v, "sizeKb") * 1000;
    const bw = (num(v, "mbps") * 1e6) / 8;
    const xfer = (n * sizeBytes) / bw; // seconds the pipe needs for everything
    const packets = (n * sizeBytes) / 1200;
    const lossEvents = packets * loss;
    // Setup: 6 connections in parallel for h1 (TCP+TLS1.2 = 3 RTT), one connection for h2 (2 RTT) and h3 (1 RTT).
    const setup = p === "h1" ? 3 * rtt : p === "h2" ? 2 * rtt : rtt;
    // Request waves: h1 needs ceil(n / 6) round trips of requests; multiplexed protocols send everything at once.
    const waves = p === "h1" ? Math.ceil(n / 6) : 1;
    const base = setup + waves * rtt + xfer * 1000;
    // Each lost packet costs about one RTT of stalled delivery. On h1 it blocks one of six connections, on h2 the
    // whole connection, on h3 only one stream (so the visible effect on the page is spread over many streams).
    const stall = p === "h1" ? (lossEvents * rtt) / 6 : p === "h2" ? lossEvents * rtt * 0.5 : (lossEvents * rtt) / Math.max(4, Math.min(n, 100)) * 2;
    const total = base + stall;
    return {
      metrics: { loadMs: total, stallMs: stall, lanes: p === "h1" ? 6 : 1 },
      readouts: [
        { label: "Page load", value: total, fmt: "ms", tone: total > 2500 ? "alert" : total > 1500 ? "warn" : "ok" },
        { label: "Connection setup", value: setup, fmt: "ms" },
        { label: "Request round trips", value: waves, fmt: "int", sub: p === "h1" ? "6 requests per wave" : "all at once" },
        { label: "Lost-packet stalls", value: stall, fmt: "ms", tone: stall > 400 ? "alert" : undefined },
      ],
      view: {
        kind: "bars",
        fmt: "ms",
        bars: [
          { label: "Handshake", value: setup, tone: "warn" },
          { label: "Waiting for request turns", value: (waves - 1) * rtt + rtt, tone: "info" },
          { label: "Moving the bytes", value: xfer * 1000, tone: "ok" },
          { label: "Waiting on lost packets", value: stall, tone: "alert" },
        ],
      },
      notes: [p === "h1" ? "Six lanes, each one request at a time, so the page needs many request rounds." : p === "h2" ? "One lane with many streams: no request rounds, but one lost packet stops them all." : "Many streams on UDP: a lost packet pauses only the stream it belonged to."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "proto") !== "h1") ev.push("raced");
    if (str(v, "proto") === "h2" && num(v, "loss") >= 0.02) ev.push("loss-hurts");
    return ev;
  },
  scene: (n): SceneOut => (n === "h1" ? { set: { proto: "h1" }, focus: ["proto"] } : n === "h2" ? { set: { proto: "h2", loss: 0.0 }, focus: ["proto"] } : n === "h3" ? { set: { proto: "h3", loss: 0.02 }, focus: ["proto", "loss"] } : undefined),
};

// ------------------------------------------------------------------ reverse proxy

export const proxyLab: LabModel = {
  id: "proxy-lab",
  metrics: ["capacityRps", "util", "p99", "errorRate", "workersHeld", "workers"],
  observes: ["slow-clients", "buffered"],
  scenes: ["direct", "buffer"],
  runLabel: "Reload nginx",
  honest: [
    "Slow clients are modelled as a fixed share that takes two seconds to receive a response. Real slow clients range from slightly slow to attackers.",
    "Worker busy time is service time plus any time the worker is tied up writing to the client. nginx's buffers hold a response of ordinary size entirely in memory.",
    "Queueing uses an M/M/c approximation with c = workers.",
  ],
  init: (c) => ({ buffering: false, slowShare: 0.1, workers: 16, rps: (c as { rps?: number }).rps ?? 150, tls: true }),
  controls: () => [
    { kind: "toggle", id: "buffering", label: "nginx proxy_buffering on", detail: "nginx takes the whole response from the app and serves the client itself" },
    { kind: "slider", id: "slowShare", label: "Clients on slow connections", min: 0, max: 0.4, step: 0.01, fmt: "pct" },
    { kind: "slider", id: "workers", label: "App workers", min: 2, max: 64, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const svc = 0.05;
    const slowS = 2;
    const slow = num(v, "slowShare");
    const w = Math.round(num(v, "workers"));
    const lambda = num(v, "rps");
    const held = bool(v, "buffering") ? svc : svc + slow * slowS;
    const cap = w / held;
    const util = lambda / cap;
    const tail = util >= 1 ? 10 : held * (1 + util / (1 - util)) * 3;
    const err = util >= 1 ? 1 - cap / lambda : 0;
    return {
      metrics: { capacityRps: cap, util, p99: tail, errorRate: err, workersHeld: lambda * held, workers: w },
      readouts: [
        { label: "Time a worker is tied up per request", value: held, fmt: "s", sub: bool(v, "buffering") ? "app time only" : "app time plus slow clients" },
        { label: "Capacity", value: cap, fmt: "int", sub: "requests per second" },
        { label: "Workers busy at this load", value: Math.min(lambda * held, w), fmt: "num", sub: `of ${w}` },
        { label: "Utilization", value: Math.min(util, 9.99), fmt: "pct", tone: util > 0.9 ? "alert" : util > 0.7 ? "warn" : "ok" },
        { label: "Failed", value: err, fmt: "pct", tone: err > 0.01 ? "alert" : "ok" },
      ],
      view: {
        kind: "bars",
        fmt: "s",
        bars: [
          { label: "Time in the app", segs: [{ value: svc, tone: "ok" }] },
          { label: "Writing to slow clients", segs: [{ value: bool(v, "buffering") ? 0 : slow * slowS, tone: "alert" }] },
        ],
      },
      notes: [bool(v, "buffering") ? "The worker hands the response to nginx and moves on." : "A worker waits for the slow client to take the whole response."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (!bool(v, "buffering") && num(v, "slowShare") >= 0.1) ev.push("slow-clients");
    if (bool(v, "buffering")) ev.push("buffered");
    return ev;
  },
  scene: (n): SceneOut => (n === "direct" ? { set: { buffering: false, slowShare: 0.2 }, focus: ["slowShare"] } : n === "buffer" ? { set: { buffering: true }, focus: ["buffering"] } : undefined),
};

// ------------------------------------------------------------------ CDN

export interface CdnCfg {
  popsMax: number;
}
export const cdnLab: LabModel = {
  id: "cdn-lab",
  metrics: ["avgMs", "worstMs", "hitRatio", "originRps"],
  observes: ["cdn-on", "far-pop"],
  scenes: ["edge", "miss"],
  runLabel: "Turn on the CDN",
  honest: [
    "Round trips come from distance (8 ms plus 0.015 ms per km), and a user reaches an edge in the same region in about 10 ms. Real paths, peering, and last-mile networks vary.",
    "Hit ratio per edge assumes Poisson requests for one object with a fixed TTL: r T ÷ (1 + r T).",
    "A miss costs the edge-to-origin round trip, plus the edge hop, plus a fixed 20 ms of origin time.",
  ],
  init: () => ({ cdn: false, ttl: 300, rate: 0.5, pops: 5 }),
  controls: () => [
    { kind: "toggle", id: "cdn", label: "Serve through a CDN" },
    { kind: "slider", id: "ttl", label: "Edge cache TTL", min: 5, max: 86400, log: true, fmt: "s" },
    { kind: "slider", id: "rate", label: "Requests per second per edge for this object", min: 0.001, max: 100, log: true, fmt: "num" },
    { kind: "slider", id: "pops", label: "Regions with an edge", min: 1, max: 5, step: 1, fmt: "int", hint: "Mumbai, Jakarta, Frankfurt, Virginia, São Paulo, in that order" },
  ],
  evaluate: (v) => {
    const on = bool(v, "cdn");
    const ttl = num(v, "ttl");
    const r = num(v, "rate");
    const hit = (r * ttl) / (1 + r * ttl);
    const pops = Math.round(num(v, "pops"));
    const edge = 10;
    const per = REGIONS.map((reg, i) => {
      const origin = rttKm(reg.km);
      if (!on) return { reg, ms: origin * 2 + 20 };
      // Region with its own edge: hit -> edge RTT; miss -> edge + origin. Without one: nearest listed edge.
      const nearest = i < pops ? edge : Math.min(...REGIONS.slice(0, pops).map((p) => rttKm(Math.abs(p.km - reg.km) + 1000)));
      return { reg, ms: hit * (nearest + 20) + (1 - hit) * (nearest + origin + 20 + origin * 0) + 0 };
    });
    // Page = a first byte and one more round trip on a warm connection (kept simple): use the numbers above.
    const avg = per.reduce((s, p) => s + p.ms, 0) / per.length;
    const worst = Math.max(...per.map((p) => p.ms));
    const originRps = on ? (1 - hit) * r * pops : r * REGIONS.length * 40;
    return {
      metrics: { avgMs: avg, worstMs: worst, hitRatio: on ? hit : 0, originRps },
      readouts: [
        { label: "Average across regions", value: avg, fmt: "ms", tone: avg < 150 ? "ok" : avg < 300 ? "warn" : "alert" },
        { label: "Worst region", value: worst, fmt: "ms" },
        { label: "Edge hit ratio", value: on ? hit : 0, fmt: "pct" },
        { label: "Requests reaching the origin", value: originRps, fmt: "num", sub: "per second" },
      ],
      view: { kind: "bars", fmt: "ms", bars: per.map((p) => ({ label: `${p.reg.label} · ${Math.round(rttKm(p.reg.km))}ms from origin`, value: p.ms, tone: p.ms < 100 ? ("ok" as const) : p.ms < 250 ? ("warn" as const) : ("alert" as const) })), lines: [{ value: 150, label: "a comfortable first byte", tone: "ok" }] },
      notes: [on ? `Each edge keeps ${(hit * 100).toFixed(0)}% of requests away from the origin.` : "Every request crosses the world to the origin."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (bool(v, "cdn")) ev.push("cdn-on");
    if (bool(v, "cdn") && num(v, "pops") <= 2) ev.push("far-pop");
    return ev;
  },
  scene: (n): SceneOut => (n === "edge" ? { set: { cdn: true, pops: 5, rate: 5 }, focus: ["cdn"] } : n === "miss" ? { set: { cdn: true, rate: 0.01 }, focus: ["rate"] } : undefined),
};

// ------------------------------------------------------------------ anycast

export const anycastLab: LabModel = {
  id: "anycast-lab",
  metrics: ["avgMs", "failoverS", "sites"],
  observes: ["sites-added", "site-down"],
  scenes: ["nearest", "failover"],
  runLabel: "Announce the prefix",
  honest: [
    "Anycast sends traffic to the closest site by BGP path, which usually but not always means closest by distance. The lab applies a 20% penalty when routing picks a longer path.",
    "DNS geo-routing is limited by where the user's resolver is, not where the user is, so it picks wrong more often than anycast.",
    "Failover time is the DNS TTL for DNS routing and a BGP withdrawal for anycast, a few tens of seconds here. Both vary with the network.",
  ],
  init: () => ({ method: "dns", sites: 2, ttl: 300, down: false }),
  controls: () => [
    { kind: "choice", id: "method", label: "How users find a site", options: [{ id: "dns", label: "DNS geo-routing", detail: "Different addresses per region; clients cache them for the TTL" }, { id: "anycast", label: "Anycast", detail: "One address announced from every site; routing sends users to the closest" }] },
    { kind: "slider", id: "sites", label: "Sites", min: 1, max: 5, step: 1, fmt: "int", hint: "ap-south-2, Frankfurt, Virginia, Singapore, São Paulo, in that order" },
    { kind: "slider", id: "ttl", label: "DNS TTL", min: 30, max: 3600, log: true, fmt: "s" },
    { kind: "toggle", id: "down", label: "The nearest site fails" },
  ],
  evaluate: (v) => {
    const sites = [
      { km: 0 },
      { km: 6800 },
      { km: 13500 },
      { km: 3400 },
      { km: 14400 },
    ].slice(0, Math.round(num(v, "sites")));
    const users = [620, 3900, 6800, 13500, 14400, 9000, 2800];
    const dist = (u: number) => Math.min(...sites.map((s) => Math.abs(s.km - u))) || 0;
    const anycast = str(v, "method") === "anycast";
    const per = users.map((u) => rttKm(dist(u) * (anycast ? 1.2 : 1) + (anycast ? 0 : 1500)) * 2);
    const avg = per.reduce((a, b) => a + b, 0) / per.length;
    const failover = anycast ? 20 : num(v, "ttl");
    return {
      metrics: { avgMs: avg, failoverS: bool(v, "down") ? failover : 0, sites: sites.length },
      readouts: [
        { label: "Average distance cost", value: avg, fmt: "ms", tone: avg < 120 ? "ok" : avg < 220 ? "warn" : "alert" },
        { label: "Time until users leave a dead site", value: failover, fmt: "s", tone: failover > 120 ? "alert" : "ok" },
        { label: "Sites announcing", value: sites.length, fmt: "int" },
      ],
      view: { kind: "bars", fmt: "ms", bars: users.map((u, i) => ({ label: `Users ${u.toLocaleString("en-US")} km from the origin`, value: per[i]!, tone: per[i]! < 120 ? ("ok" as const) : per[i]! < 220 ? ("warn" as const) : ("alert" as const) })) },
      notes: [bool(v, "down") ? `Users keep reaching the dead site for up to ${failover}s${anycast ? " until the route is withdrawn" : ", the DNS TTL"}.` : anycast ? "One address, announced everywhere; the network chooses." : "DNS chooses from where the resolver sits and what it cached."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (num(v, "sites") >= 3) ev.push("sites-added");
    if (bool(v, "down")) ev.push("site-down");
    return ev;
  },
  scene: (n): SceneOut => (n === "nearest" ? { set: { method: "anycast", sites: 4 }, focus: ["method"] } : n === "failover" ? { set: { down: true }, focus: ["down", "method"] } : undefined),
};

// ------------------------------------------------------------------ the whole journey

export const journeyLab: LabModel = {
  id: "journey-lab",
  metrics: ["ttfbMs", "roundTrips", "originTrips"],
  observes: ["fixed-one", "fixed-all"],
  scenes: ["dns", "connect", "cache"],
  runLabel: "Load the page",
  honest: ["Every step is counted in round trips plus a fixed 20 ms of server time and 40 ms for a cold DNS lookup. Real journeys also pay for redirects, certificate checks, and rendering."],
  init: (c) => ({ region: (c as { region?: string }).region ?? "jakarta", dnsCached: false, tls13: false, edge: false, reuse: false, h3: false }),
  controls: () => [
    { kind: "choice", id: "region", label: "User is in", options: REGIONS.map((r) => ({ id: r.id, label: r.label })) },
    { kind: "toggle", id: "dnsCached", label: "DNS answer cached" },
    { kind: "toggle", id: "tls13", label: "TLS 1.3 instead of 1.2" },
    { kind: "toggle", id: "reuse", label: "Connection kept alive" },
    { kind: "toggle", id: "edge", label: "Served by a nearby edge cache", detail: "A hit never reaches the origin" },
  ],
  evaluate: (v) => {
    const reg = REGIONS.find((r) => r.id === str(v, "region"))!;
    const origin = rttKm(reg.km);
    const edge = 10;
    const rtt = bool(v, "edge") ? edge : origin;
    const dns = bool(v, "dnsCached") ? 0 : 40 + rtt * 0;
    const tcp = bool(v, "reuse") ? 0 : rtt;
    const tls = bool(v, "reuse") ? 0 : (bool(v, "tls13") ? 1 : 2) * rtt;
    const req = rtt;
    const think = 20;
    const rows = [
      { label: "DNS lookup", start: 0, ms: dns, tone: "lilac" as const },
      { label: "TCP handshake", start: dns, ms: tcp, tone: "warn" as const },
      { label: "TLS handshake", start: dns + tcp, ms: tls, tone: "warn" as const },
      { label: "Request travels, response starts", start: dns + tcp + tls, ms: req + think, tone: "ok" as const },
    ].filter((r) => r.ms > 0);
    const ttfb = dns + tcp + tls + req + think;
    const trips = (tcp ? 1 : 0) + (tls ? (bool(v, "tls13") ? 1 : 2) : 0) + 1;
    return {
      metrics: { ttfbMs: ttfb, roundTrips: trips, originTrips: bool(v, "edge") ? 0 : trips },
      readouts: [
        { label: "Time to first byte", value: ttfb, fmt: "ms", tone: ttfb > 600 ? "alert" : ttfb > 300 ? "warn" : "ok" },
        { label: "Round trips", value: trips, fmt: "int", sub: `${Math.round(rtt)}ms each` },
        { label: "Crossing to the origin", value: bool(v, "edge") ? 0 : trips, fmt: "int", sub: "long round trips" },
      ],
      view: { kind: "waterfall", rows, target: { ms: 300, label: "300 ms" } },
      notes: [`${reg.label} is about ${Math.round(origin)}ms from the origin each way there and back.`],
    };
  },
  events: (v) => {
    const fixes = [bool(v, "dnsCached"), bool(v, "tls13"), bool(v, "reuse"), bool(v, "edge")].filter(Boolean).length;
    return fixes >= 1 ? (fixes >= 4 ? ["fixed-one", "fixed-all"] : ["fixed-one"]) : [];
  },
  scene: (n): SceneOut => (n === "dns" ? { set: { dnsCached: true }, focus: ["dnsCached"] } : n === "connect" ? { set: { tls13: true, reuse: true }, focus: ["tls13", "reuse"] } : n === "cache" ? { set: { edge: true }, focus: ["edge"] } : undefined),
};

// ------------------------------------------------------------------ boss: users in Jakarta

export const farLab: LabModel = {
  id: "far-lab",
  metrics: ["p75Ms", "worstMs", "costPerMonth", "originRegions", "staleSec"],
  observes: [],
  scenes: [],
  runLabel: "Go live in Jakarta",
  honest: [
    "A page costs one first-byte time plus four more round trips on a warm connection for its critical files, so p75 is the sum of those, with regional multipliers for last-mile jitter. Real pages vary with weight and rendering.",
    "Costs are round monthly figures for a small site: CDN $120, a second origin region $380, an edge-terminated TLS add-on $40.",
    "A second region needs the data it serves. This lab assumes read-only content, so no replication problems appear yet.",
  ],
  init: () => ({ cdn: false, tls13: false, h3: false, keepalive: false, region2: "none", ttl: 3600 }),
  controls: () => [
    { kind: "toggle", id: "cdn", label: "CDN with edges worldwide", detail: "About $120 a month" },
    { kind: "slider", id: "ttl", label: "Edge cache TTL", min: 60, max: 86400, log: true, fmt: "s", hint: "Longer means more hits and staler content" },
    { kind: "toggle", id: "tls13", label: "TLS 1.3", detail: "Free" },
    { kind: "toggle", id: "h3", label: "HTTP/3", detail: "Free at the CDN; one round trip for the whole handshake" },
    { kind: "toggle", id: "keepalive", label: "Keep-alive to the origin", detail: "Edge-to-origin connections stay open" },
    { kind: "choice", id: "region2", label: "Second origin region", options: [{ id: "none", label: "ap-south-2 only" }, { id: "sg", label: "Add Singapore", detail: "About $380 a month" }] },
  ],
  evaluate: (v) => {
    const jak = rttKm(3900);
    const sg = rttKm(900);
    const hyd = rttKm(0) / 2;
    void hyd;
    const originRtt = str(v, "region2") === "sg" ? sg : jak;
    const edgeRtt = 12;
    const cdn = bool(v, "cdn");
    const stackRtts = bool(v, "h3") && cdn ? 1 : (bool(v, "tls13") ? 2 : 3);
    const clientRtt = cdn ? edgeRtt : originRtt;
    const hit = cdn ? (0.002 * num(v, "ttl")) / (1 + 0.002 * num(v, "ttl")) : 0;
    const originLeg = bool(v, "keepalive") || !cdn ? originRtt : originRtt * 3;
    const firstByte = stackRtts * clientRtt + clientRtt + 20 + (cdn ? (1 - hit) * originLeg : 0) + 40;
    const warmPage = 4 * (clientRtt + 20 + (cdn ? (1 - hit) * originRtt : 0));
    const p75 = firstByte + warmPage;
    const worst = p75 * 1.6;
    const cost = (cdn ? 120 : 0) + (str(v, "region2") === "sg" ? 380 : 0) + 200;
    return {
      metrics: { p75Ms: p75, worstMs: worst, costPerMonth: cost, originRegions: str(v, "region2") === "sg" ? 2 : 1, staleSec: cdn ? num(v, "ttl") : 0 },
      readouts: [
        { label: "Page p75 in Jakarta", value: p75, fmt: "ms", tone: p75 > 1200 ? "alert" : p75 > 800 ? "warn" : "ok" },
        { label: "First byte", value: firstByte, fmt: "ms" },
        { label: "Edge hit ratio", value: hit, fmt: "pct" },
        { label: "Monthly cost", value: cost, fmt: "usd" },
      ],
      view: {
        kind: "waterfall",
        rows: [
          { label: "Connection setup", start: 0, ms: stackRtts * clientRtt, tone: "warn" },
          { label: "Request and first byte", start: stackRtts * clientRtt, ms: clientRtt + 20 + (cdn ? (1 - hit) * originLeg : 0) + 40, tone: "ok" },
          { label: "Four more critical files", start: firstByte, ms: warmPage, tone: "info" },
        ],
        target: { ms: 800, label: "800 ms" },
      },
      notes: [cdn ? `Misses cost an edge-to-origin trip of ${Math.round(originLeg)}ms.` : `Jakarta is ${Math.round(jak)}ms from the origin on every round trip.`],
    };
  },
};

export const A3_MODELS: LabModel[] = [dnsLab, connectLab, laneLab, proxyLab, cdnLab, anycastLab, journeyLab, farLab];
void sweep;
