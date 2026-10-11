/**
 * Chapter A13 "Special stores" models: object storage, inverted indexes, geospatial indexes, and time series.
 * Closed forms with labelled round constants, using list-price-like numbers for storage (see each `honest`).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ blob storage

export const blobLab: LabModel = {
  id: "blob-lab",
  metrics: ["costPerMonth", "slowReadsPct", "appServers", "wastedUploadPct"],
  observes: ["big-bill", "wasted"],
  scenes: ["classes", "presign", "multipart"],
  runLabel: "Plan the storage",
  honest: [
    "500 TB of user uploads. 10% of it is under 30 days old, 30% is 30 to 180 days old, 60% is older. 90% of the 100 TB read each month hits the newest data, 8% the middle band and 2% the oldest.",
    "Illustrative per-TB monthly prices in the style of S3 list prices: standard $23, infrequent access $12.50 (plus $10 per TB read), archive $3.60 (plus $10 per TB read and hours of delay). Moving data between classes is a lifecycle rule. Reads of archived data take hours, so 2% of reads are slow when the oldest data is archived.",
    "Uploads: 20 a second averaging 100 MB, so 2 GB a second, 16 Gbps. Sending it through app servers needs one server per 2 Gbps. A presigned URL lets the client upload straight to the store. A single PUT of a 5 GB file fails about 10% of the time (2% a GB) and restarts; multipart uploads of 100 MB parts retry only the failed part.",
  ],
  init: () => ({ life: "standard", path: "server", multipart: false }),
  controls: () => [
    { kind: "choice", id: "life", label: "Lifecycle rules", options: [{ id: "standard", label: "Keep everything in standard" }, { id: "ia", label: "Infrequent access after 30 days" }, { id: "archive", label: "Infrequent after 30 days, archive after 180" }] },
    { kind: "choice", id: "path", label: "Upload path", options: [{ id: "server", label: "Through our app servers" }, { id: "presigned", label: "Direct to storage with presigned URLs" }] },
    { kind: "toggle", id: "multipart", label: "Multipart uploads with part retries" },
  ],
  evaluate: (v) => {
    const l = str(v, "life");
    const hot = 50;
    const mid = 150;
    const old = 300;
    let cost = 0;
    let slow = 0;
    if (l === "standard") cost = 500 * 23;
    else if (l === "ia") cost = hot * 23 + (mid + old) * 12.5 + (8 + 2) * 10;
    else {
      cost = hot * 23 + mid * 12.5 + old * 3.6 + 8 * 10 + 2 * 10;
      slow = 0.02;
    }
    const servers = str(v, "path") === "server" ? 8 : 0;
    const wasted = bool(v, "multipart") ? 0.002 : 0.1;
    return {
      metrics: { costPerMonth: cost, slowReadsPct: slow, appServers: servers, wastedUploadPct: wasted },
      readouts: [
        { label: "Storage and read cost a month", value: cost, fmt: "usd", tone: tone(cost, 5000, 10000) },
        { label: "Reads that wait hours", value: slow, fmt: "pct", tone: slow > 0.03 ? "warn" : "ok" },
        { label: "App servers just for upload traffic", value: servers, fmt: "int", tone: servers ? "warn" : "ok" },
        { label: "Upload bandwidth wasted on retries", value: wasted, fmt: "pct", tone: wasted > 0.01 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "usd", bars: [{ label: "Monthly cost", value: cost, tone: tone(cost, 5000, 10000) }] },
      notes: [l === "standard" ? "Most of the data is old and untouched, and it is paid for at the hot rate." : l === "archive" ? "The old data is cheap to hold, and the rare read of it waits." : "Cheaper, with the oldest data still readable at once."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.costPerMonth! > 10000) ev.push("big-bill");
    if (out.metrics.wastedUploadPct! > 0.05) ev.push("wasted");
    return ev;
  },
  scene: (n): SceneOut => (n === "classes" ? { set: { life: "archive" }, focus: ["life"] } : n === "presign" ? { set: { path: "presigned" }, focus: ["path"] } : n === "multipart" ? { set: { multipart: true }, focus: ["multipart"] } : undefined),
};

// ------------------------------------------------------------------ inverted index

export const indexLab: LabModel = {
  id: "invindex-lab",
  metrics: ["queryMs", "indexGB", "phraseOk"],
  observes: ["slow-query", "big-index"],
  scenes: ["scan", "merge", "skip"],
  runLabel: "Index the corpus",
  honest: [
    "10 million documents of 2 KB, 20 GB in all. A query asks for a rare term (in 1,000 documents) AND a common term (in 5 million).",
    "Scanning reads every document at 2 microseconds each, 20 seconds. An inverted index lists, for each term, the sorted documents containing it. Intersecting by merging walks both lists: (1,000 + 5,000,000) × 10 ns = 50 ms. With skip pointers, or searching the longer list for each entry of the shorter, the cost is the short list × log₂ of the long: 1,000 × 23 × 10 ns, about 0.2 ms.",
    "The index takes about 25% of the corpus size, 5 GB. Storing word positions, needed for phrase search, grows it to 60%, 12 GB.",
  ],
  init: () => ({ strategy: "scan", positions: false }),
  controls: () => [
    { kind: "choice", id: "strategy", label: "How the query runs", options: [{ id: "scan", label: "Scan every document" }, { id: "merge", label: "Inverted index, merge the two lists" }, { id: "skip", label: "Inverted index, short list probes the long one" }] },
    { kind: "toggle", id: "positions", label: "Store word positions (phrase search)" },
  ],
  evaluate: (v) => {
    const s = str(v, "strategy");
    const rare = 1000;
    const common = 5e6;
    const ms = s === "scan" ? (1e7 * 2) / 1000 : s === "merge" ? ((rare + common) * 10) / 1e6 : (rare * Math.log2(common) * 10) / 1e6;
    const pos = bool(v, "positions");
    const size = s === "scan" ? 0 : pos ? 12 : 5;
    return {
      metrics: { queryMs: ms, indexGB: size, phraseOk: pos && s !== "scan" ? 1 : 0 },
      readouts: [
        { label: "Time for the query", value: ms, fmt: "ms", tone: tone(ms, 10, 1000) },
        { label: "Index size", value: size, fmt: "num", sub: "GB", tone: size > 10 ? "warn" : "ok" },
        { label: "Phrase search possible", value: pos && s !== "scan" ? "yes" : "no", tone: "info" },
      ],
      view: { kind: "bars", fmt: "ms", bars: [{ label: "Query time", value: ms, tone: tone(ms, 10, 1000) }] },
      notes: [s === "scan" ? "Every document is read to answer one question." : s === "merge" ? "Fast, but the long list is walked from end to end." : "The short list does the work, and the long one is only probed."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.queryMs! > 1000) ev.push("slow-query");
    if (out.metrics.indexGB! > 10) ev.push("big-index");
    return ev;
  },
  scene: (n): SceneOut => (n === "scan" ? { set: { strategy: "scan" }, focus: ["strategy"] } : n === "merge" ? { set: { strategy: "merge" }, focus: ["strategy"] } : n === "skip" ? { set: { strategy: "skip" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ geospatial

const CELL_KM: Record<string, number> = { "4": 28, "5": 4.9, "6": 0.87, "7": 0.153, "8": 0.038 };

export const geoLab: LabModel = {
  id: "geo-lab",
  metrics: ["queryMs", "candidates", "missPct", "lookups"],
  observes: ["slow-geo", "missed"],
  scenes: ["scan", "cells", "edges"],
  runLabel: "Index the drivers",
  honest: [
    "1 million drivers spread evenly over a city of 2,500 km² (400 per km²). A rider asks for drivers within 1 km. About 1,260 are inside the circle.",
    "A scan measures every driver (2 microseconds each). An index on latitude alone reads a band 2 km tall across the whole 50 km width, 100 km², 40,000 drivers. A geohash index names each map cell by a code; a longer code means a smaller cell, about 28, 4.9, 0.87, 0.15 and 0.04 km on a side for precisions 4 to 8. Each cell you read is one index lookup (0.05 ms), each driver checked costs 0.002 ms.",
    "Searching only the rider's own cell misses drivers just across a cell edge: with 1 km radius and a cell of side s, the share of true neighbours missed is 1 − (1 − 1.27 ÷ s)². Searching neighbouring cells too reads (2k + 1)² cells, where k is the number of cell widths needed to cover 1 km.",
  ],
  init: () => ({ method: "scan", precision: "6", neighbours: false }),
  controls: () => [
    { kind: "choice", id: "method", label: "Index", options: [{ id: "scan", label: "None: check every driver" }, { id: "lat", label: "B-tree on latitude" }, { id: "geohash", label: "Geohash cells" }] },
    { kind: "choice", id: "precision", label: "Geohash length", options: Object.entries(CELL_KM).map(([id, s]) => ({ id, label: `${id} characters, cells about ${s} km wide` })) },
    { kind: "toggle", id: "neighbours", label: "Also search the surrounding cells" },
  ],
  evaluate: (v) => {
    const m = str(v, "method");
    const r = 1;
    const density = 400;
    let lookups = 1;
    let cand = 0;
    let miss = 0;
    if (m === "scan") cand = 1e6;
    else if (m === "lat") cand = 100 * density;
    else {
      const s = CELL_KM[str(v, "precision")]!;
      const k = Math.ceil(r / s);
      const side = bool(v, "neighbours") ? 2 * k + 1 : 1;
      lookups = side * side;
      cand = lookups * s * s * density;
      miss = bool(v, "neighbours") ? 0 : 1 - Math.pow(Math.max(0, 1 - (1.27 * r) / s), 2);
    }
    const ms = lookups * 0.05 + cand * 0.002;
    return {
      metrics: { queryMs: ms, candidates: cand, missPct: miss, lookups },
      readouts: [
        { label: "Query time", value: ms, fmt: "ms", tone: tone(ms, 20, 100) },
        { label: "Drivers measured", value: cand, fmt: "int", tone: cand > 10000 ? "warn" : "ok" },
        { label: "Index lookups", value: lookups, fmt: "int", tone: lookups > 500 ? "warn" : "ok" },
        { label: "Nearby drivers missed", value: miss, fmt: "pct", tone: miss > 0.01 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Drivers measured", value: cand, tone: cand > 10000 ? "warn" : "ok" }, { label: "Index lookups", value: lookups, tone: "info" }] },
      notes: [m === "scan" ? "Every driver is measured for every request." : m === "lat" ? "The latitude band is narrow and enormously long." : miss > 0.01 ? "A rider near a cell edge cannot see the driver one street away." : lookups > 500 ? "Tiny cells mean hundreds of lookups per request." : cand > 10000 ? "Big cells mean thousands of drivers to measure." : "Cells about the size of the search radius keep both counts small."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.queryMs! > 100) ev.push("slow-geo");
    if (out.metrics.missPct! > 0.01) ev.push("missed");
    return ev;
  },
  scene: (n): SceneOut => (n === "scan" ? { set: { method: "scan" }, focus: ["method"] } : n === "cells" ? { set: { method: "geohash", precision: "6", neighbours: true }, focus: ["precision"] } : n === "edges" ? { set: { method: "geohash", precision: "5", neighbours: false }, focus: ["neighbours"] } : undefined),
};

// ------------------------------------------------------------------ time series

export const tsdbLab: LabModel = {
  id: "tsdb-lab",
  metrics: ["storageGB", "yearQueryMs", "indexMemGB", "recentResolutionS", "yearCoverage"],
  observes: ["slow-year", "blown"],
  scenes: ["downsample", "compress", "cardinality"],
  runLabel: "Plan retention",
  honest: [
    "1 million devices, each reporting a value every 10 seconds, so 8,640 points a day per series. Raw points take 16 bytes, or 1.6 with delta-of-delta compression. A one-minute rollup keeps min, max, mean and count: 1,440 rows a day at 16 bytes. An hourly rollup keeps 24 rows a day.",
    "A chart of the last year reads the coarsest tier that covers the whole year: hourly gives 8,760 points per series, one-minute 525,600. Reading a point costs 2 microseconds. Each distinct series also takes about 3 KB of index memory; adding an unbounded label such as the user id makes every device-and-user pair its own series: 1,000 times as many.",
    "Round figures for comparison.",
  ],
  init: () => ({ rawDays: 7, r1m: 0, r1h: 0, compress: false, userTag: false }),
  controls: () => [
    { kind: "slider", id: "rawDays", label: "Keep raw points for", min: 1, max: 30, step: 1, fmt: "int", hint: "days" },
    { kind: "slider", id: "r1m", label: "Keep one-minute rollups for", min: 0, max: 365, step: 1, fmt: "int", hint: "days" },
    { kind: "slider", id: "r1h", label: "Keep hourly rollups for", min: 0, max: 1825, step: 1, fmt: "int", hint: "days" },
    { kind: "toggle", id: "compress", label: "Compress raw points (delta-of-delta)" },
    { kind: "toggle", id: "userTag", label: "Tag every point with the user id" },
  ],
  evaluate: (v) => {
    const S = 1e6;
    const raw = num(v, "rawDays");
    const r1m = num(v, "r1m");
    const r1h = num(v, "r1h");
    const bytes = bool(v, "compress") ? 1.6 : 16;
    const gb = (S * 8640 * bytes * raw + S * 1440 * 16 * r1m + S * 24 * 16 * r1h) / 1e9;
    const year = r1h >= 365 ? 8760 : r1m >= 365 ? 525600 : 0;
    const ms = year ? year * 0.002 : Infinity;
    const series = bool(v, "userTag") ? S * 1000 : S;
    const mem = (series * 3000) / 1e9;
    const cov = Math.max(raw, r1m, r1h);
    return {
      metrics: { storageGB: gb, yearQueryMs: Number.isFinite(ms) ? ms : 1e9, indexMemGB: mem, recentResolutionS: 10, yearCoverage: cov },
      readouts: [
        { label: "Storage", value: gb, fmt: "num", sub: "GB", tone: tone(gb, 1000, 5000) },
        { label: "Chart of the last year", value: Number.isFinite(ms) ? ms : "not available", fmt: "ms", tone: !Number.isFinite(ms) ? "alert" : tone(ms, 100, 1000) },
        { label: "Index memory", value: mem, fmt: "num", sub: "GB", tone: tone(mem, 8, 20) },
        { label: "Longest history kept", value: cov, fmt: "int", sub: "days" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Storage, GB", value: gb, tone: tone(gb, 1000, 5000) }, { label: "Index memory, GB", value: mem, tone: tone(mem, 8, 20) }] },
      notes: [bool(v, "userTag") ? "Every value of the label becomes a new series, and the index outgrows memory." : !year ? "There is no tier that reaches back a year." : "Coarse tiers answer long questions cheaply."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.yearQueryMs! > 1000) ev.push("slow-year");
    if (out.metrics.indexMemGB! > 20) ev.push("blown");
    return ev;
  },
  scene: (n): SceneOut => (n === "downsample" ? { set: { r1h: 730, r1m: 14 }, focus: ["r1h", "r1m"] } : n === "compress" ? { set: { compress: true }, focus: ["compress"] } : n === "cardinality" ? { set: { userTag: true }, focus: ["userTag"] } : undefined),
};

export const A13_MODELS: LabModel[] = [blobLab, indexLab, geoLab, tsdbLab];
