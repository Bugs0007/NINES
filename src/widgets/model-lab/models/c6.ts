/**
 * Chapter C6 "Low-level design" models: SOLID refactoring, design patterns, an LRU cache, a parking lot, expense
 * splitting, elevator scheduling (a seeded simulation) and a rate limiter class. Closed forms with labelled round
 * constants, and one small simulation.
 */
import { Rng } from "../../../engine/rng";
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ SOLID

export function solidRun(f: { iface: boolean; di: boolean; split: boolean; compose: boolean; segregate: boolean }) {
  const files = f.iface ? 2 : 6;
  const testMin = f.di ? 3 : f.iface ? 20 : 25;
  let risk = 0.3;
  if (f.iface) risk *= 0.6;
  if (f.split) risk *= 0.7;
  if (f.segregate) risk *= 0.9;
  if (f.compose) risk *= 0.85;
  if (f.di) risk *= 0.9;
  const classes = 2 + (f.iface ? 2 : 0) + (f.di ? 1 : 0) + (f.split ? 2 : 0) + (f.segregate ? 2 : 0);
  const respons = f.split ? 1.5 : 5;
  return { files, testMin, risk, classes, respons };
}

export const solidLab: LabModel = {
  id: "solid-lab",
  metrics: ["filesToAddChannel", "testSetupMin", "changeRisk", "classCount", "responsibilities"],
  observes: ["tangled", "over-built"],
  scenes: ["interface", "inject", "split"],
  runLabel: "Refactor the notifier",
  honest: [
    "A notification module sends email, SMS and push messages from one big class with a switch on the channel type, a hard-wired call to each provider, and formatting, sending and retry logic mixed together. Adding a seventh channel touches 6 files; testing one change needs real provider accounts and takes 25 minutes; a change breaks something existing 30% of the time; the class has 5 responsibilities.",
    "Each refactoring is a trade. A channel interface with a registry (open for extension) makes a new channel 2 files and cuts the risk of a change by 40%, and adds 2 classes. Injecting the dependencies (providers passed in) lets tests use fakes, 3 minutes instead of 25, risk down 10%, and 1 class more. Splitting by responsibility (formatting, sending, retry) leaves 1.5 responsibilities per class, risk down 30%, and 2 classes more. Composition instead of inheritance cuts risk by 15% at no extra classes. Segregated interfaces (small and focused) cut risk by 10% and add 2 classes.",
    "Round figures. The aim is to show that each principle buys something specific and costs structure.",
  ],
  init: () => ({ iface: false, di: false, split: false, compose: false, segregate: false }),
  controls: () => [
    { kind: "toggle", id: "iface", label: "Channel interface and a registry (open/closed)" },
    { kind: "toggle", id: "di", label: "Inject the providers (dependency inversion)" },
    { kind: "toggle", id: "split", label: "Split formatting, sending and retry (single responsibility)" },
    { kind: "toggle", id: "compose", label: "Compose behaviour instead of inheriting it" },
    { kind: "toggle", id: "segregate", label: "Small, focused interfaces (interface segregation)" },
  ],
  evaluate: (v) => {
    const r = solidRun({ iface: bool(v, "iface"), di: bool(v, "di"), split: bool(v, "split"), compose: bool(v, "compose"), segregate: bool(v, "segregate") });
    return {
      metrics: { filesToAddChannel: r.files, testSetupMin: r.testMin, changeRisk: r.risk, classCount: r.classes, responsibilities: r.respons },
      readouts: [
        { label: "Files touched to add a channel", value: r.files, fmt: "int", tone: tone(r.files, 2, 4) },
        { label: "Time to test a change", value: r.testMin, fmt: "int", sub: "minutes", tone: tone(r.testMin, 5, 15) },
        { label: "Chance a change breaks something", value: r.risk, fmt: "pct", tone: tone(r.risk, 0.12, 0.2) },
        { label: "Classes", value: r.classes, fmt: "int", tone: tone(r.classes, 7, 9) },
        { label: "Responsibilities per class", value: r.respons, fmt: "num", tone: tone(r.respons, 2, 3) },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.4, bars: [{ label: "Chance a change breaks something", value: r.risk, tone: tone(r.risk, 0.12, 0.2) }] },
      notes: [r.files >= 6 ? "Every new channel means editing the same tangle." : r.classes >= 9 ? "More structure than the problem needs." : "Each piece has a reason to exist."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.filesToAddChannel! >= 6) ev.push("tangled");
    if (out.metrics.classCount! >= 9) ev.push("over-built");
    return ev;
  },
  scene: (n): SceneOut => (n === "interface" ? { set: { iface: true }, focus: ["iface"] } : n === "inject" ? { set: { di: true }, focus: ["di"] } : n === "split" ? { set: { split: true }, focus: ["split"] } : undefined),
};

// ------------------------------------------------------------------ design patterns

const NEED = { s1: "strategy", s2: "observer", s3: "factory", s4: "decorator" } as const;

export function patternRun(choice: Record<string, string>) {
  let matched = 0;
  let extra = 0;
  let change = 0;
  for (const k of Object.keys(NEED) as (keyof typeof NEED)[]) {
    const c = choice[k]!;
    if (c === NEED[k]) {
      matched++;
      extra += 2;
      change += 1;
    } else if (c === "none") {
      change += 4;
    } else {
      extra += 3;
      change += 3;
    }
  }
  return { matched, extra, change };
}

export const patternLab: LabModel = {
  id: "pattern-lab",
  metrics: ["matched", "extraClasses", "changeCost"],
  observes: ["mismatch", "perfect"],
  scenes: ["strategy", "observer", "decorator"],
  runLabel: "Match the patterns",
  honest: [
    "Four requirements, each with one pattern that fits it: choose a pricing rule at run time (strategy: a family of interchangeable algorithms behind one interface); tell several parts of the system when an order ships (observer: subscribers register and are called on an event); build the right payment client without the caller naming a concrete class (factory: a function that decides which object to create); add logging, caching and retries around a client in any combination (decorator: wrappers that share the wrapped object's interface).",
    "A fitting pattern costs 2 classes and makes a new variant 1 file. A plain if/else costs nothing now and 4 files per variant later. A misapplied pattern costs 3 classes and still 3 files per variant: the structure of the wrong shape.",
    "Round figures. The point is that a pattern names a recurring problem; use one when you have the problem.",
  ],
  init: () => ({ s1: "none", s2: "none", s3: "none", s4: "none" }),
  controls: () => {
    const opts = [{ id: "none", label: "if / else" }, { id: "strategy", label: "Strategy" }, { id: "observer", label: "Observer" }, { id: "factory", label: "Factory" }, { id: "decorator", label: "Decorator" }, { id: "singleton", label: "Singleton" }];
    return [
      { kind: "choice", id: "s1", label: "Choose the pricing rule at run time", options: opts },
      { kind: "choice", id: "s2", label: "Notify several parts when an order ships", options: opts },
      { kind: "choice", id: "s3", label: "Create the right payment client without naming a class", options: opts },
      { kind: "choice", id: "s4", label: "Wrap a client with logging, caching and retries in any mix", options: opts },
    ];
  },
  evaluate: (v) => {
    const r = patternRun({ s1: str(v, "s1"), s2: str(v, "s2"), s3: str(v, "s3"), s4: str(v, "s4") });
    return {
      metrics: { matched: r.matched, extraClasses: r.extra, changeCost: r.change },
      readouts: [
        { label: "Requirements with a fitting pattern", value: r.matched, fmt: "int", sub: "of 4", tone: toneLow(r.matched, 4, 2) },
        { label: "Extra classes", value: r.extra, fmt: "int", tone: tone(r.extra, 8, 11) },
        { label: "Files touched to add one variant to each", value: r.change, fmt: "int", tone: tone(r.change, 4, 10) },
      ],
      view: { kind: "bars", fmt: "int", max: 16, bars: [{ label: "Files per new variant", value: r.change, tone: tone(r.change, 4, 10) }] },
      notes: [r.matched === 4 ? "Each pattern answers the problem it was made for." : r.matched === 0 ? "Plain conditionals everywhere: cheap now, expensive per change." : "Some requirements are met by structure that does not fit."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.matched! < 4 && out.metrics.extraClasses! > out.metrics.matched! * 2) ev.push("mismatch");
    if (out.metrics.matched === 4) ev.push("perfect");
    return ev;
  },
  scene: (n): SceneOut => (n === "strategy" ? { set: { s1: "strategy" }, focus: ["s1"] } : n === "observer" ? { set: { s2: "observer" }, focus: ["s2"] } : n === "decorator" ? { set: { s4: "decorator" }, focus: ["s4"] } : undefined),
};

// ------------------------------------------------------------------ LRU cache

export function lruRun(structure: string, n: number, threads: number, lock: string) {
  const logN = Math.log2(n);
  let get: number;
  let put: number;
  let evict: number;
  let bytes: number;
  if (structure === "array") {
    get = n / 2;
    put = n / 2;
    evict = 1;
    bytes = 16;
  } else if (structure === "hashlist") {
    get = 4;
    put = 4;
    evict = 3;
    bytes = 64;
  } else if (structure === "hashts") {
    get = 2;
    put = 2;
    evict = n;
    bytes = 40;
  } else {
    get = 2 + logN;
    put = 2 + logN;
    evict = logN;
    bytes = 56;
  }
  const T = threads;
  let safe = 1;
  let speed = 1;
  let exact = 1;
  if (T > 1) {
    if (lock === "none") {
      safe = 0;
      speed = T;
    } else if (lock === "global") {
      speed = 1 / (1 + 0.05 * (T - 1));
    } else {
      speed = T / (1 + (T - 1) / 16);
      exact = 0;
    }
  }
  return { get, put, evict, memMB: (n * bytes) / 1e6, safe, speed, exact };
}

export const lruLab: LabModel = {
  id: "lru-lab",
  metrics: ["getOps", "evictOps", "memoryMB", "threadSafe", "concurrentSpeedup", "exactLru"],
  observes: ["slow-scan", "corrupt"],
  scenes: ["hashlist", "heap", "sharded"],
  runLabel: "Design the cache",
  honest: [
    "An LRU cache holds N entries and evicts the least recently used one when full. The operations are get (and mark as most recent), put, and evict. Costs are in elementary steps for N entries. An array scanned linearly: get and put N ÷ 2 steps. A hash map plus a doubly linked list: a lookup, then moving a node, 4 steps for get and put and 3 to evict. A hash map with a timestamp per entry: 2 steps, and a scan of every entry to find the oldest on eviction, N steps. A hash map with a min-heap on timestamps: 2 + log₂ N for get and put, log₂ N to evict.",
    "Memory per entry: array 16 bytes, hash map and list 64, timestamps 40, heap 56. Every get changes the recency order, so threads writing to a shared structure need protection. No lock is fastest and corrupts the list. A global lock is correct and serialises everything (a little worse than one thread). Splitting the cache into 16 independently locked shards gives T ÷ (1 + (T − 1) ÷ 16) speedup at the price of exact global recency order, which becomes approximate.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: (c) => ({ structure: "array", n: (c as { n?: number }).n ?? 100000, threads: (c as { threads?: number }).threads ?? 8, lock: "global" }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "structure", label: "Data structure", options: [{ id: "array", label: "Array, scanned" }, { id: "hashlist", label: "Hash map and doubly linked list" }, { id: "hashts", label: "Hash map with timestamps" }, { id: "hashheap", label: "Hash map with a min-heap on timestamps" }] }];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "Entries", min: 1000, max: 1000000, step: 1000, log: true, fmt: "int" });
    if (!(c as { lockThreads?: boolean }).lockThreads) out.push({ kind: "slider", id: "threads", label: "Threads", min: 1, max: 16, step: 1, fmt: "int" });
    out.push({ kind: "choice", id: "lock", label: "Locking", options: [{ id: "none", label: "None" }, { id: "global", label: "One global lock" }, { id: "sharded", label: "16 shards, a lock each" }] });
    return out;
  },
  evaluate: (v) => {
    const r = lruRun(str(v, "structure"), num(v, "n"), Math.round(num(v, "threads")), str(v, "lock"));
    return {
      metrics: { getOps: r.get, evictOps: r.evict, memoryMB: r.memMB, threadSafe: r.safe, concurrentSpeedup: r.speed, exactLru: r.exact },
      readouts: [
        { label: "Steps per get", value: r.get, fmt: "num", tone: tone(r.get, 10, 100) },
        { label: "Steps per eviction", value: r.evict, fmt: "num", tone: tone(r.evict, 10, 100) },
        { label: "Memory", value: r.memMB, fmt: "num", sub: "MB", tone: tone(r.memMB, 10, 50) },
        { label: "Safe with several threads", value: r.safe ? "yes" : "no", tone: r.safe ? "ok" : "alert" },
        { label: "Speedup with several threads", value: r.speed, fmt: "x", tone: toneLow(r.speed, 3, 1.5) },
        { label: "Exact recency order", value: r.exact ? "yes" : "approximate", tone: r.exact ? "ok" : "info" },
      ],
      view: { kind: "bars", fmt: "num", max: 120, bars: [{ label: "Steps per get", value: Math.min(120, r.get), tone: tone(r.get, 10, 100) }, { label: "Steps per eviction", value: Math.min(120, r.evict), tone: tone(r.evict, 10, 100) }] },
      notes: [r.get > 1000 ? "Scanning on every get does not survive real traffic." : r.safe === 0 ? "Fast and wrong: threads corrupt the list." : "Constant-time operations."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.getOps! > 1000 || out.metrics.evictOps! > 1000) ev.push("slow-scan");
    if (out.metrics.threadSafe === 0) ev.push("corrupt");
    return ev;
  },
  scene: (n): SceneOut => (n === "hashlist" ? { set: { structure: "hashlist" }, focus: ["structure"] } : n === "heap" ? { set: { structure: "hashheap" }, focus: ["structure"] } : n === "sharded" ? { set: { structure: "hashlist", lock: "sharded" }, focus: ["lock"] } : undefined),
};

// ------------------------------------------------------------------ parking lot

export function parkingRun(index: string, vehicles: string, pricing: string, locking: string) {
  const n = 10000;
  const find = index === "scan" ? n / 2 : index === "freelists" ? 3 : Math.log2(n);
  const walk = index === "scan" ? 90 : index === "freelists" ? 60 : 25;
  const vehicleFiles = vehicles === "enum" ? 5 : 1;
  const pricingFiles = pricing === "hard" ? 4 : 1;
  const doubles = locking === "none" ? 4.2 : 0;
  const tput = locking === "none" ? 1 : locking === "perspot" ? 0.9 : 0.1;
  return { find, walk, vehicleFiles, pricingFiles, doubles, tput };
}

export const parkingLab: LabModel = {
  id: "parking-lab",
  metrics: ["findSpotOps", "walkMetres", "filesNewVehicle", "filesPricingChange", "doubleBookingsDay", "throughput"],
  observes: ["slow-find", "double-booked"],
  scenes: ["freelists", "heap", "strategy"],
  runLabel: "Design the lot",
  honest: [
    "A lot with 10,000 spots, four vehicle types and 50 cars arriving at once. Finding a spot by scanning all spots takes 5,000 steps on average and takes the first free one (an average walk of 90 m). Free lists per spot size make the lookup 3 steps and a walk of 60 m. A min-heap of free spots ordered by distance to the entrance takes log₂ 10,000, about 13 steps, and assigns the nearest (25 m).",
    "Modelling vehicles with an enum and switch statements means a new vehicle type touches 5 places; polymorphic classes touch 1. Pricing written into the exit code touches 4 places to change; a pricing strategy object touches 1. Without a lock on spot assignment, two cars concurrently take the same spot, about 4.2 times a day; a lock per spot prevents it with 10% lost throughput; one global lock prevents it and reduces throughput to a tenth.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ index: "scan", vehicles: "enum", pricing: "hard", locking: "none" }),
  controls: () => [
    { kind: "choice", id: "index", label: "Finding a spot", options: [{ id: "scan", label: "Scan all spots" }, { id: "freelists", label: "Free lists per spot size" }, { id: "heap", label: "Min-heap of free spots by distance to the entrance" }] },
    { kind: "choice", id: "vehicles", label: "Vehicle types", options: [{ id: "enum", label: "An enum and switch statements" }, { id: "poly", label: "A class per type" }] },
    { kind: "choice", id: "pricing", label: "Pricing", options: [{ id: "hard", label: "Written into the exit code" }, { id: "strategy", label: "A pluggable pricing strategy" }] },
    { kind: "choice", id: "locking", label: "Taking a spot", options: [{ id: "none", label: "No lock" }, { id: "perspot", label: "A lock per spot" }, { id: "global", label: "One global lock" }] },
  ],
  evaluate: (v) => {
    const r = parkingRun(str(v, "index"), str(v, "vehicles"), str(v, "pricing"), str(v, "locking"));
    return {
      metrics: { findSpotOps: r.find, walkMetres: r.walk, filesNewVehicle: r.vehicleFiles, filesPricingChange: r.pricingFiles, doubleBookingsDay: r.doubles, throughput: r.tput },
      readouts: [
        { label: "Steps to find a spot", value: r.find, fmt: "num", tone: tone(r.find, 20, 500) },
        { label: "Average walk to the entrance", value: r.walk, fmt: "int", sub: "metres", tone: tone(r.walk, 40, 70) },
        { label: "Files to add a vehicle type", value: r.vehicleFiles, fmt: "int", tone: tone(r.vehicleFiles, 1, 3) },
        { label: "Files to change pricing", value: r.pricingFiles, fmt: "int", tone: tone(r.pricingFiles, 1, 3) },
        { label: "Double bookings a day", value: r.doubles, fmt: "num", tone: tone(r.doubles, 0, 1) },
        { label: "Throughput", value: r.tput, fmt: "pct", tone: toneLow(r.tput, 0.5, 0.2) },
      ],
      view: { kind: "bars", fmt: "num", max: 100, bars: [{ label: "Average walk (m)", value: r.walk, tone: tone(r.walk, 40, 70) }] },
      notes: [r.doubles > 0 ? "Two cars were given the same spot." : r.find > 500 ? "Scanning every spot for every car." : "Fast to find, safe to take and easy to extend."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.findSpotOps! > 1000) ev.push("slow-find");
    if (out.metrics.doubleBookingsDay! > 0) ev.push("double-booked");
    return ev;
  },
  scene: (n): SceneOut => (n === "freelists" ? { set: { index: "freelists" }, focus: ["index"] } : n === "heap" ? { set: { index: "heap" }, focus: ["index"] } : n === "strategy" ? { set: { pricing: "strategy", vehicles: "poly" }, focus: ["pricing", "vehicles"] } : undefined),
};

// ------------------------------------------------------------------ expense splitting

export function splitRun(algo: string, money: string, n: number) {
  const expenses = 40;
  const payments = expenses * 2;
  let tx: number;
  let ops: number;
  if (algo === "each") {
    tx = payments;
    ops = expenses;
  } else if (algo === "pairwise") {
    tx = Math.round(0.8 * ((n * (n - 1)) / 2));
    ops = expenses * 3 + (n * (n - 1)) / 2;
  } else if (algo === "greedy") {
    tx = n - 1;
    ops = Math.round(2 * n * Math.log2(n));
  } else {
    tx = n - 2;
    ops = Math.pow(2, n) * n;
  }
  const err = money === "float" ? expenses * 0.075 : 0;
  return { tx, ops, err };
}

export const splitLab: LabModel = {
  id: "split-lab",
  metrics: ["transactions", "computeOps", "errorCents"],
  observes: ["too-many-payments", "drift"],
  scenes: ["greedy", "cents", "optimal"],
  runLabel: "Settle the group",
  honest: [
    "A group of N people has made 40 shared expenses, each split among about three of them. Settling each expense separately takes 80 payments. Netting every pair gives at most N(N − 1) ÷ 2 payments (about 80% of that in practice). Computing each person's net balance and repeatedly matching the largest debtor with the largest creditor settles everyone in at most N − 1 payments, in about 2N log₂ N steps. The true minimum is N − 2 when the group splits into two sub-groups that already balance, and finding it means trying subsets: about 2^N × N steps.",
    "Storing money as floating-point dollars accumulates rounding error: about 0.075 cents per expense, 3 cents over 40, so someone is always owed a cent that nobody owes. Integer cents are exact. Round figures to show the trade-offs between an easy algorithm, a good one and a perfect one.",
  ],
  init: (c) => ({ algo: "each", money: "float", n: (c as { n?: number }).n ?? 8 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "algo", label: "Settle by", options: [{ id: "each", label: "Paying back each expense" }, { id: "pairwise", label: "Netting each pair of people" }, { id: "greedy", label: "Net balances, largest debtor to largest creditor" }, { id: "optimal", label: "Trying every subset for the true minimum" }] },
      { kind: "choice", id: "money", label: "Store amounts as", options: [{ id: "float", label: "Floating-point dollars" }, { id: "cents", label: "Integer cents" }] },
    ];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "People", min: 3, max: 20, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = splitRun(str(v, "algo"), str(v, "money"), Math.round(num(v, "n")));
    return {
      metrics: { transactions: r.tx, computeOps: r.ops, errorCents: r.err },
      readouts: [
        { label: "Payments to settle", value: r.tx, fmt: "int", tone: tone(r.tx, 10, 30) },
        { label: "Computation", value: r.ops, fmt: "int", sub: "steps", tone: tone(r.ops, 200, 5000) },
        { label: "Rounding error", value: r.err, fmt: "num", sub: "cents", tone: tone(r.err, 0, 1) },
      ],
      view: { kind: "bars", fmt: "int", max: 100, bars: [{ label: "Payments", value: Math.min(100, r.tx), tone: tone(r.tx, 10, 30) }] },
      notes: [r.tx > 30 ? "Everyone pays everyone for everything." : r.ops > 5000 ? "The perfect answer costs more than it saves." : r.err > 0 ? "Floating point leaves a few cents nobody owes." : "Few payments, exact money."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.transactions! > 30) ev.push("too-many-payments");
    if (out.metrics.errorCents! > 0) ev.push("drift");
    return ev;
  },
  scene: (n): SceneOut => (n === "greedy" ? { set: { algo: "greedy" }, focus: ["algo"] } : n === "cents" ? { set: { money: "cents" }, focus: ["money"] } : n === "optimal" ? { set: { algo: "optimal", n: 16 }, focus: ["algo", "n"] } : undefined),
};

// ------------------------------------------------------------------ elevators

export function elevatorRun(algo: string, cars: number, ratePerMin: number) {
  const F = 20;
  const T = 1800;
  const rng = new Rng("elevator-" + ratePerMin);
  type Req = { t: number; from: number; to: number; picked: number };
  const reqs: Req[] = [];
  let t = 0;
  const lambda = ratePerMin / 60;
  for (;;) {
    t += -Math.log(rng.nextOpen()) / lambda;
    if (t > T) break;
    const from = rng.int(F);
    let to = rng.int(F - 1);
    if (to >= from) to++;
    reqs.push({ t, from, to, picked: -1 });
  }
  type Car = { pos: number; dir: number; until: number; waiting: Req[]; riders: Req[] };
  const fleet: Car[] = Array.from({ length: cars }, (_, i) => ({ pos: 2 * Math.floor((F * (i + 0.5)) / cars), dir: 1, until: 0, waiting: [], riders: [] }));
  let next = 0;
  const waits: number[] = [];
  for (let now = 0; now < T + 900; now++) {
    while (next < reqs.length && reqs[next]!.t <= now) {
      const r = reqs[next++]!;
      let best = 0;
      let bestCost = Infinity;
      fleet.forEach((c, i) => {
        const cost = Math.abs(c.pos - 2 * r.from) + (c.waiting.length + c.riders.length) * 6;
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      });
      fleet[best]!.waiting.push(r);
    }
    for (const c of fleet) {
      if (now < c.until) continue;
      const cands: number[] = [...c.waiting.map((r) => 2 * r.from), ...c.riders.map((r) => 2 * r.to)];
      if (!cands.length) continue;
      let target: number;
      if (algo === "fcfs") {
        const items: { time: number; floor: number }[] = [...c.waiting.map((r) => ({ time: r.t, floor: 2 * r.from })), ...c.riders.map((r) => ({ time: r.picked, floor: 2 * r.to }))];
        items.sort((a, b) => a.time - b.time);
        target = items[0]!.floor;
      } else if (algo === "sstf") {
        target = cands.reduce((a, b) => (Math.abs(b - c.pos) < Math.abs(a - c.pos) ? b : a));
      } else {
        const ahead = cands.filter((x) => (x - c.pos) * c.dir >= 0);
        if (!ahead.length) c.dir = -c.dir;
        const pool = cands.filter((x) => (x - c.pos) * c.dir >= 0);
        target = pool.reduce((a, b) => (Math.abs(b - c.pos) < Math.abs(a - c.pos) ? b : a));
      }
      const atFloor = c.pos % 2 === 0;
      if (atFloor) {
        const here = c.pos / 2;
        const stopHere = algo === "fcfs" ? c.pos === target : true;
        if (stopHere) {
          const dropped = c.riders.filter((r) => r.to === here);
          const picks = c.waiting.filter((r) => r.from === here);
          if (dropped.length || picks.length) {
            c.riders = c.riders.filter((r) => r.to !== here);
            c.waiting = c.waiting.filter((r) => r.from !== here);
            for (const p of picks) {
              p.picked = now;
              waits.push(now - p.t);
              c.riders.push(p);
            }
            c.until = now + 5;
            continue;
          }
        }
      }
      if (c.pos === target) {
        c.until = now + 1;
        continue;
      }
      c.pos += Math.sign(target - c.pos);
      if (algo === "look") c.dir = Math.sign(target - c.pos) || c.dir;
    }
  }
  for (const r of reqs) if (r.picked < 0) waits.push(T + 900 - r.t);
  waits.sort((a, b) => a - b);
  const mean = waits.reduce((a, b) => a + b, 0) / Math.max(1, waits.length);
  return { mean, p95: waits[Math.floor(0.95 * (waits.length - 1))] ?? 0, max: waits[waits.length - 1] ?? 0, n: reqs.length };
}

export const elevatorLab: LabModel = {
  id: "elevator-lab",
  metrics: ["meanWaitSec", "p95WaitSec", "maxWaitSec"],
  observes: ["starved", "efficient"],
  scenes: ["fcfs", "sstf", "look"],
  runLabel: "Choose the scheduler",
  honest: [
    "A 20-floor building, a half-hour of requests arriving at random (a rate you set, in requests per minute), each from one floor to another. Cars move one floor in 2 s and stop 5 s to load and unload. A new request goes to the car with the least cost (distance plus 6 s per passenger it already has). A car chooses where to go next by its scheduler.",
    "First come first served always goes to the oldest outstanding stop, zig-zagging across the building, and only stops at that floor. Shortest seek first goes to the nearest stop, which is efficient and can leave a far floor waiting while nearer requests keep arriving. LOOK keeps travelling in one direction, serving every stop on the way, and reverses when nothing is ahead, which keeps both the average and the longest wait low. Waits count until pickup; a request still waiting at the end counts its wait so far.",
    "A seeded simulation, so the same settings give the same numbers.",
  ],
  init: (c) => ({ algo: "fcfs", cars: (c as { cars?: number }).cars ?? 1, rate: (c as { rate?: number }).rate ?? 6 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "algo", label: "Scheduler", options: [{ id: "fcfs", label: "First come, first served" }, { id: "sstf", label: "Nearest stop first" }, { id: "look", label: "LOOK: sweep one way, then the other" }] }];
    if (!(c as { lockCars?: boolean }).lockCars) out.push({ kind: "slider", id: "cars", label: "Elevators", min: 1, max: 3, step: 1, fmt: "int" });
    if (!(c as { lockRate?: boolean }).lockRate) out.push({ kind: "slider", id: "rate", label: "Requests per minute", min: 1, max: 12, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = elevatorRun(str(v, "algo"), Math.round(num(v, "cars")), Math.round(num(v, "rate")));
    return {
      metrics: { meanWaitSec: r.mean, p95WaitSec: r.p95, maxWaitSec: r.max },
      readouts: [
        { label: "Average wait", value: r.mean, fmt: "s", tone: tone(r.mean, 40, 90) },
        { label: "95th percentile wait", value: r.p95, fmt: "s", tone: tone(r.p95, 90, 200) },
        { label: "Longest wait", value: r.max, fmt: "s", tone: tone(r.max, 150, 300) },
      ],
      view: { kind: "bars", fmt: "s", max: 600, bars: [{ label: "Average", value: Math.min(600, r.mean), tone: tone(r.mean, 40, 90) }, { label: "95th percentile", value: Math.min(600, r.p95), tone: tone(r.p95, 90, 200) }, { label: "Longest", value: Math.min(600, r.max), tone: tone(r.max, 150, 300) }] },
      notes: [r.max > 300 ? "Someone is waiting a very long time." : r.mean > 90 ? "The cars cannot keep up with the demand." : "Waits are short and no one is stranded."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.maxWaitSec! > 350) ev.push("starved");
    if (out.metrics.meanWaitSec! < 50 && out.metrics.maxWaitSec! < 250) ev.push("efficient");
    return ev;
  },
  scene: (n): SceneOut => (n === "fcfs" ? { set: { algo: "fcfs" }, focus: ["algo"] } : n === "sstf" ? { set: { algo: "sstf" }, focus: ["algo"] } : n === "look" ? { set: { algo: "look" }, focus: ["algo"] } : undefined),
};

// ------------------------------------------------------------------ the rate limiter class

const RL_ALGOS: Record<string, { burst: number; bytes: number; cas: boolean }> = {
  fixed: { burst: 2, bytes: 16, cas: true },
  log: { burst: 1, bytes: 800, cas: false },
  counter: { burst: 1.05, bytes: 32, cas: true },
  token: { burst: 1.5, bytes: 24, cas: true },
  leaky: { burst: 1, bytes: 24, cas: true },
};

export function limiterRun(algo: string, clock: boolean, sync: string, evict: boolean) {
  const a = RL_ALGOS[algo]!;
  const correct = sync === "lock" || (sync === "cas" && a.cas) ? 1 : 0;
  const tput = sync === "none" ? 1 : sync === "lock" ? 0.5 : a.cas ? 0.9 : 0.5;
  const mem = evict ? a.bytes * 0.05 : a.bytes;
  return { burst: a.burst, mem, testable: clock ? 1 : 0, correct, tput, leak: evict ? 0 : 1 };
}

export const limiterClassLab: LabModel = {
  id: "limiterclass-lab",
  metrics: ["boundaryBurst", "memoryMB", "testable", "correctUnderLoad", "throughputRel", "keyLeak"],
  observes: ["double-burst", "flaky-tests"],
  scenes: ["algorithm", "clock", "concurrency"],
  runLabel: "Write the class",
  honest: [
    "A RateLimiter class allows 100 requests a minute per client key, for a million keys. Algorithms differ in what they remember: a fixed window counter (16 bytes a key) allows a burst of up to twice the limit across a window boundary; a sliding log of timestamps (800 bytes) is exact; a sliding window counter blends two windows (32 bytes, within 5% of exact); a token bucket (24 bytes) allows a burst of half the limit by design; a leaky bucket (24 bytes) smooths to the rate.",
    "Design choices around the algorithm decide whether the class is usable. If the clock is read directly, a test must sleep for real minutes, so it is slow and flaky; an injected clock lets a test advance time instantly. Under concurrent calls, unsynchronised updates miss counts. A lock is correct at half the throughput; compare-and-swap on a single value is correct at 90%, and cannot protect a list of timestamps. Keys that are never evicted grow without bound, and evicting idle keys keeps 5% of them.",
    "Round figures for the shape of the choices.",
  ],
  init: () => ({ algo: "fixed", clock: false, sync: "none", evict: false }),
  controls: () => [
    { kind: "choice", id: "algo", label: "Algorithm", options: [{ id: "fixed", label: "Fixed window counter" }, { id: "log", label: "Sliding log of timestamps" }, { id: "counter", label: "Sliding window counter" }, { id: "token", label: "Token bucket" }, { id: "leaky", label: "Leaky bucket" }] },
    { kind: "toggle", id: "clock", label: "Inject the clock (testable without sleeping)" },
    { kind: "choice", id: "sync", label: "Concurrency", options: [{ id: "none", label: "No synchronisation" }, { id: "lock", label: "A lock per key" }, { id: "cas", label: "Compare-and-swap on the state" }] },
    { kind: "toggle", id: "evict", label: "Evict idle keys" },
  ],
  evaluate: (v) => {
    const r = limiterRun(str(v, "algo"), bool(v, "clock"), str(v, "sync"), bool(v, "evict"));
    return {
      metrics: { boundaryBurst: r.burst, memoryMB: r.mem, testable: r.testable, correctUnderLoad: r.correct, throughputRel: r.tput, keyLeak: r.leak },
      readouts: [
        { label: "Largest burst in any window, as a share of the limit", value: r.burst, fmt: "x", tone: tone(r.burst, 1.1, 1.4) },
        { label: "Memory for a million keys", value: r.mem, fmt: "num", sub: "MB", tone: tone(r.mem, 100, 400) },
        { label: "Test without sleeping", value: r.testable ? "yes" : "no", tone: r.testable ? "ok" : "warn" },
        { label: "Correct under concurrency", value: r.correct ? "yes" : "no", tone: r.correct ? "ok" : "alert" },
        { label: "Throughput", value: r.tput, fmt: "pct", tone: toneLow(r.tput, 0.8, 0.5) },
        { label: "Keys leak", value: r.leak ? "yes" : "no", tone: r.leak ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "x", max: 2.2, bars: [{ label: "Burst across a boundary", value: r.burst, tone: tone(r.burst, 1.1, 1.4) }] },
      notes: [r.burst >= 2 ? "A client can send twice the limit around a window boundary." : r.correct === 0 ? "Counts are lost under concurrent calls." : "Accurate enough, and a unit test can run it."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.boundaryBurst! >= 2) ev.push("double-burst");
    if (!bool(v, "clock")) ev.push("flaky-tests");
    return ev;
  },
  scene: (n): SceneOut => (n === "algorithm" ? { set: { algo: "counter" }, focus: ["algo"] } : n === "clock" ? { set: { clock: true }, focus: ["clock"] } : n === "concurrency" ? { set: { sync: "cas" }, focus: ["sync"] } : undefined),
};

export const C6_MODELS: LabModel[] = [solidLab, patternLab, lruLab, parkingLab, splitLab, elevatorLab, limiterClassLab];
