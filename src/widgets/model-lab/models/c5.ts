/**
 * Chapter C5 "Concurrency" models: threads, processes and async; Python's GIL; race conditions; locks and deadlocks.
 * Closed forms and small seeded simulations with labelled round constants (see each model's `honest` text).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ threads, processes, async

export function workerRun(model: string, workers: number, conns: number, heavy: boolean) {
  const lambda = 600;
  const cores = 8;
  const cpu = 0.005 + (heavy ? 0.05 * 0.08 : 0);
  const baseP99 = 195;
  let memGB: number;
  let maxConns: number;
  let capacity: number;
  let p99 = baseP99;
  if (model === "thread") {
    memGB = 0.5 + conns * 0.001;
    maxConns = 32000;
    capacity = (cores / cpu) / (1 + conns / 4000);
    p99 += conns / 200;
  } else if (model === "process") {
    memGB = 0.2 + workers * 0.06;
    maxConns = workers;
    capacity = Math.min(cores / cpu, workers / 0.195);
  } else if (model === "async") {
    memGB = 0.1 * workers + conns * 0.00002;
    maxConns = 1e6;
    capacity = Math.min(workers, cores) / cpu;
    if (heavy) p99 += 80;
  } else {
    memGB = 0.1 * workers + conns * 0.00002 + 0.1;
    maxConns = 1e6;
    capacity = Math.min(workers, cores) / 0.005;
    p99 += 2;
  }
  const util = lambda / capacity;
  if (util >= 1) p99 = 99999;
  else if (util > 0.7) p99 += (baseP99 * (util - 0.7)) / (1 - util);
  return { memGB, maxConns, capacity, p99, serves: maxConns >= conns && capacity >= lambda ? 1 : 0 };
}

export const workerLab: LabModel = {
  id: "worker-lab",
  metrics: ["memoryGB", "capacityReqS", "servesLoad", "p99ms"],
  observes: ["oom-threads", "blocked-loop"],
  scenes: ["thread", "process", "async"],
  runLabel: "Choose the worker model",
  honest: [
    "A server with 8 cores must handle 600 requests a second plus a crowd of mostly idle connections. A typical request needs 5 ms of CPU and waits 190 ms on other services; 5% of requests also do 80 ms of CPU work. Without waiting, one core would handle 200 of the light ones a second.",
    "A thread per connection costs about 1 MB each, so 20,000 connections need 20 GB and the scheduler's overhead grows with the count. A pool of processes costs 60 MB each, and each handles one connection at a time, so connections beyond the pool cannot be held. An async event loop holds a connection in about 20 KB and does the waiting for free, one loop per core, but one slow CPU task blocks every other request on its loop: adding 80 ms to the slowest requests. Offloading CPU work to a thread pool keeps the loop free.",
    "Round figures to compare the models; real costs depend on the runtime.",
  ],
  init: (c) => ({ model: "thread", workers: 4, conns: (c as { conns?: number }).conns ?? 20000, heavy: true }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "model", label: "Worker model", options: [{ id: "thread", label: "A thread per connection" }, { id: "process", label: "A pool of processes" }, { id: "async", label: "Async event loops" }, { id: "asyncpool", label: "Async loops with CPU work in a thread pool" }] },
      { kind: "slider", id: "workers", label: "Processes or loops", min: 1, max: 64, step: 1, fmt: "int" },
    ];
    if (!(c as { lockConns?: boolean }).lockConns) out.push({ kind: "slider", id: "conns", label: "Concurrent connections", min: 100, max: 100000, step: 100, log: true, fmt: "int" });
    out.push({ kind: "toggle", id: "heavy", label: "Some requests do 80 ms of CPU work" });
    return out;
  },
  evaluate: (v) => {
    const r = workerRun(str(v, "model"), Math.round(num(v, "workers")), num(v, "conns"), bool(v, "heavy"));
    return {
      metrics: { memoryGB: r.memGB, capacityReqS: r.capacity, servesLoad: r.serves, p99ms: Math.min(r.p99, 99999) },
      readouts: [
        { label: "Memory", value: r.memGB, fmt: "gb", tone: tone(r.memGB, 8, 16) },
        { label: "Request capacity", value: r.capacity, fmt: "int", sub: "per second, 600 needed", tone: toneLow(r.capacity, 900, 600) },
        { label: "Holds all connections", value: r.maxConns >= num(v, "conns") ? "yes" : "no", tone: r.maxConns >= num(v, "conns") ? "ok" : "alert" },
        { label: "Slowest 1% of requests", value: r.p99, fmt: "ms", tone: tone(r.p99, 250, 400) },
      ],
      view: { kind: "bars", fmt: "gb", max: 24, bars: [{ label: "Memory", value: Math.min(r.memGB, 24), tone: tone(r.memGB, 8, 16) }] },
      notes: [r.memGB > 16 ? "Memory goes on idle stacks and process copies." : r.p99 > 250 ? "One slow handler holds up the others on its loop." : "Waiting is cheap, and the CPU work has somewhere to go."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "model") === "thread" && out.metrics.memoryGB! > 8) ev.push("oom-threads");
    if (str(v, "model") === "async" && bool(v, "heavy") && out.metrics.p99ms! > 250) ev.push("blocked-loop");
    return ev;
  },
  scene: (n): SceneOut => (n === "thread" ? { set: { model: "thread" }, focus: ["model"] } : n === "process" ? { set: { model: "process" }, focus: ["model", "workers"] } : n === "async" ? { set: { model: "async", workers: 4 }, focus: ["model", "heavy"] } : undefined),
};

// ------------------------------------------------------------------ the GIL

export function gilRun(approach: string, n: number, cpuShare: number) {
  const cores = 8;
  const c = cpuShare;
  let speed: number;
  let mem: number;
  if (approach === "threads") {
    speed = Math.min(n, 1 / c) * (n > 1 ? 0.95 : 1);
    mem = 1 + 0.05 * (n - 1);
  } else if (approach === "processes") {
    speed = Math.min(n, cores / c);
    mem = n;
  } else {
    speed = Math.min(1 / c, 1e9);
    mem = 1.05;
  }
  return { speed, mem, cores: approach === "processes" ? Math.min(n, cores) : 1 };
}

export const gilLab: LabModel = {
  id: "gil-lab",
  metrics: ["speedup", "memoryX", "coresUsed"],
  observes: ["no-speedup", "io-speedup"],
  scenes: ["threads", "processes", "asyncio"],
  runLabel: "Pick the concurrency",
  honest: [
    "CPython's global interpreter lock lets only one thread run Python bytecode at a time. A task takes 1 unit of time in total, of which a share c is CPU and the rest waiting on I/O (the lock is released while waiting). On an 8-core machine:",
    "N threads: waiting overlaps, so throughput grows with N until the CPU part saturates the one lock, at 1 ÷ c times a single worker, minus 5% for contention. N processes: each has its own interpreter and lock, so CPU work spreads over the cores up to 8 ÷ c, and memory grows with N, since each process loads the program (1× per process). asyncio: one thread overlaps all the waiting, up to 1 ÷ c, with little extra memory.",
    "Round figures: free-threaded builds and extension code that releases the lock change the picture.",
  ],
  init: (c) => ({ approach: "threads", n: 4, cpuShare: (c as { cpuShare?: number }).cpuShare ?? 0.9 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "approach", label: "Approach", options: [{ id: "threads", label: "Threads" }, { id: "processes", label: "Processes" }, { id: "asyncio", label: "asyncio" }] },
      { kind: "slider", id: "n", label: "Workers", min: 1, max: 16, step: 1, fmt: "int" },
    ];
    if (!(c as { lockCpu?: boolean }).lockCpu) out.push({ kind: "slider", id: "cpuShare", label: "Share of each task spent on CPU", min: 0.02, max: 1, step: 0.02, fmt: "pct" });
    return out;
  },
  evaluate: (v) => {
    const r = gilRun(str(v, "approach"), Math.round(num(v, "n")), num(v, "cpuShare"));
    return {
      metrics: { speedup: r.speed, memoryX: r.mem, coresUsed: r.cores },
      readouts: [
        { label: "Throughput versus one worker", value: r.speed, fmt: "x", tone: toneLow(r.speed, 4, 1.5) },
        { label: "Memory versus one worker", value: r.mem, fmt: "x", tone: tone(r.mem, 4, 8) },
        { label: "Cores doing Python work", value: r.cores, fmt: "int" },
      ],
      view: { kind: "bars", fmt: "x", max: 10, bars: [{ label: "Throughput", value: Math.min(r.speed, 10), tone: toneLow(r.speed, 4, 1.5) }, { label: "Memory", value: Math.min(r.mem, 10), tone: tone(r.mem, 4, 8) }] },
      notes: [str(v, "approach") === "threads" && num(v, "cpuShare") > 0.5 ? "Threads queue for the lock. More of them changes nothing." : "Each approach is right for a different share of CPU work."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "approach") === "threads" && Math.round(num(v, "n")) >= 4 && out.metrics.speedup! < 1.5) ev.push("no-speedup");
    if (str(v, "approach") === "threads" && num(v, "cpuShare") <= 0.2 && out.metrics.speedup! >= 3) ev.push("io-speedup");
    return ev;
  },
  scene: (n): SceneOut => (n === "threads" ? { set: { approach: "threads", n: 8 }, focus: ["approach"] } : n === "processes" ? { set: { approach: "processes", n: 8 }, focus: ["approach"] } : n === "asyncio" ? { set: { approach: "asyncio", cpuShare: 0.1 }, focus: ["approach", "cpuShare"] } : undefined),
};

// ------------------------------------------------------------------ race conditions

export function raceRun(fix: string, threads: number) {
  const t = threads;
  let lost = 0;
  let speed = 1;
  if (fix === "none") {
    lost = 1 - 1 / (1 + 0.15 * (t - 1));
    speed = 1;
  } else if (fix === "mutex") {
    speed = 1 / (1 + 0.25 * (t - 1));
  } else if (fix === "atomic") {
    speed = 1 / (1 + 0.08 * (t - 1));
  } else {
    speed = 0.95;
  }
  return { lost, speed, correct: lost === 0 ? 1 : 0 };
}

export const raceLab: LabModel = {
  id: "race-lab",
  metrics: ["lostUpdates", "relativeSpeed", "correct"],
  observes: ["lost-updates", "slow-lock"],
  scenes: ["none", "mutex", "atomic"],
  runLabel: "Fix the counter",
  honest: [
    "Several threads each add 1 to a shared counter a million times. 'counter += 1' is three steps: read, add, write. If two threads read the same value before either writes, one increment is lost. The more threads, the more often they overlap: in this model the share of updates lost is 1 − 1 ÷ (1 + 0.15 × (threads − 1)), about 51% at 8 threads.",
    "A mutex makes the three steps one at a time, and every thread queues on it: speed relative to one thread is 1 ÷ (1 + 0.25 × (threads − 1)). An atomic add does it in one hardware instruction with less waiting: 1 ÷ (1 + 0.08 × (threads − 1)). Giving each thread its own counter and adding them at the end shares nothing while it works, at 95% of ideal.",
    "Round figures for the shape of the trade-off.",
  ],
  init: (c) => ({ fix: "mutex", threads: (c as { threads?: number }).threads ?? 8 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "fix", label: "Protection", options: [{ id: "none", label: "None: counter += 1" }, { id: "mutex", label: "A mutex around it" }, { id: "atomic", label: "An atomic add" }, { id: "sharded", label: "A counter per thread, summed at the end" }] }];
    if (!(c as { lockThreads?: boolean }).lockThreads) out.push({ kind: "slider", id: "threads", label: "Threads", min: 1, max: 32, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = raceRun(str(v, "fix"), Math.round(num(v, "threads")));
    return {
      metrics: { lostUpdates: r.lost, relativeSpeed: r.speed, correct: r.correct },
      readouts: [
        { label: "Increments lost", value: r.lost, fmt: "pct", tone: tone(r.lost, 0, 0.05) },
        { label: "Speed relative to one thread", value: r.speed, fmt: "x", tone: toneLow(r.speed, 0.6, 0.3) },
        { label: "Final count correct", value: r.correct ? "always" : "no", tone: r.correct ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Increments lost", value: r.lost, tone: tone(r.lost, 0, 0.05) }, { label: "Relative speed", value: Math.min(r.speed, 1), tone: toneLow(r.speed, 0.6, 0.3) }] },
      notes: [r.lost > 0 ? "The total is wrong, and wrong differently each run." : r.speed < 0.4 ? "Correct, and the threads spend their time waiting for each other." : "Correct without queuing."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostUpdates! > 0.1) ev.push("lost-updates");
    if (str(v, "fix") === "mutex" && out.metrics.relativeSpeed! < 0.4) ev.push("slow-lock");
    return ev;
  },
  scene: (n): SceneOut => (n === "none" ? { set: { fix: "none" }, focus: ["fix"] } : n === "mutex" ? { set: { fix: "mutex" }, focus: ["fix"] } : n === "atomic" ? { set: { fix: "atomic" }, focus: ["fix"] } : undefined),
};

// ------------------------------------------------------------------ locks and deadlocks

export function diningRun(strategy: string, n: number) {
  const maxEaters = Math.floor(n / 2);
  const window = 0.2;
  const rounds = 360000;
  let deadlocks = 0;
  let tp = 1;
  let starve = 0.02;
  if (strategy === "naive") {
    deadlocks = rounds * Math.pow(window, n);
    tp = 1;
  } else if (strategy === "ordered") {
    tp = 0.9;
    starve = 0.1;
  } else if (strategy === "timeout") {
    tp = 0.7;
    starve = 0.08;
  } else if (strategy === "limit") {
    tp = 0.95;
    starve = 0.02;
  } else {
    tp = 1 / maxEaters;
    starve = 0.05;
  }
  void maxEaters;
  return { deadlocks, tp, starve };
}

export const diningLab: LabModel = {
  id: "dining-lab",
  metrics: ["deadlocksPerHour", "throughput", "starvation"],
  observes: ["deadlock", "serial"],
  scenes: ["naive", "ordered", "limit"],
  runLabel: "Order the locks",
  honest: [
    "Philosophers sit around a table with a fork between each pair. To eat, each picks up the left fork, then the right, eats, and puts both back. If every philosopher holds a left fork at the same moment, each waits forever for a right fork: a deadlock. A philosopher spends about 20% of each cycle holding one fork and waiting for the other, so the chance that all N do at once is 0.2^N per round, and at 100 rounds a second that is 360,000 rounds an hour.",
    "Remedies: always take the lower-numbered fork first (a global lock order) breaks the cycle, at about 90% of the ideal throughput and with some unfairness (starvation risk 10%); try the second fork and put the first back after a timeout avoids permanent deadlock and wastes 30% on retries; letting only N − 1 philosophers reach the table at once (a semaphore) makes a cycle impossible and loses 5%; a single global lock is safe and serialises everything, one eater at a time out of the N ÷ 2 possible.",
    "Throughput is relative to the ideal in which N ÷ 2 philosophers eat at once. Round figures.",
  ],
  init: (c) => ({ strategy: "naive", n: (c as { n?: number }).n ?? 5 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "strategy", label: "Strategy", options: [{ id: "naive", label: "Left fork, then right fork" }, { id: "ordered", label: "Always the lower-numbered fork first" }, { id: "timeout", label: "Try the second fork; put the first back on timeout" }, { id: "limit", label: "At most N − 1 at the table (semaphore)" }, { id: "global", label: "One lock for the whole table" }] }];
    if (!(c as { lockN?: boolean }).lockN) out.push({ kind: "slider", id: "n", label: "Philosophers", min: 2, max: 12, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = diningRun(str(v, "strategy"), Math.round(num(v, "n")));
    return {
      metrics: { deadlocksPerHour: r.deadlocks, throughput: r.tp, starvation: r.starve },
      readouts: [
        { label: "Deadlocks an hour", value: r.deadlocks, fmt: "num", tone: tone(r.deadlocks, 0.01, 1) },
        { label: "Throughput versus ideal", value: r.tp, fmt: "pct", tone: toneLow(r.tp, 0.8, 0.5) },
        { label: "Chance a philosopher is starved", value: r.starve, fmt: "pct", tone: tone(r.starve, 0.05, 0.1) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Throughput", value: Math.min(r.tp, 1), tone: toneLow(r.tp, 0.8, 0.5) }, { label: "Starvation risk", value: r.starve, tone: tone(r.starve, 0.05, 0.1) }] },
      notes: [r.deadlocks > 1 ? "It will deadlock several times an hour: every philosopher waits on the next." : r.tp < 0.6 ? "Safe, and mostly waiting." : "No cycle can form."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.deadlocksPerHour! > 1) ev.push("deadlock");
    if (str(v, "strategy") === "global" && out.metrics.throughput! <= 0.5) ev.push("serial");
    return ev;
  },
  scene: (n): SceneOut => (n === "naive" ? { set: { strategy: "naive" }, focus: ["strategy"] } : n === "ordered" ? { set: { strategy: "ordered" }, focus: ["strategy"] } : n === "limit" ? { set: { strategy: "limit" }, focus: ["strategy"] } : undefined),
};

export const C5_MODELS: LabModel[] = [workerLab, gilLab, raceLab, diningLab];
