/**
 * Chapter C2 "Linux for production" models: processes and signals, memory and the OOM killer, file descriptors,
 * systemd units, reading logs, and burstable CPU credits. Closed forms with labelled round constants.
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ processes and signals

export function signalRun(form: string, handles: boolean, init: boolean, grace: number) {
  const drain = 8;
  const receives = form === "exec";
  let stop: number;
  let graceful: number;
  let dropped: number;
  if (receives && handles) {
    stop = Math.min(drain, grace);
    graceful = grace >= drain ? 1 : 0;
    dropped = grace >= drain ? 0 : Math.round(120 * (1 - grace / drain));
  } else if (receives && init) {
    stop = 0.5;
    graceful = 0;
    dropped = 120;
  } else {
    stop = grace;
    graceful = 0;
    dropped = 120;
  }
  const zombies = init ? 0 : 60;
  return { stop, graceful, dropped, zombies };
}

export const signalLab: LabModel = {
  id: "signal-lab",
  metrics: ["stopSec", "gracefulShutdown", "droppedRequests", "zombiesPerHour"],
  observes: ["killed", "zombies"],
  scenes: ["exec", "handler", "init"],
  runLabel: "Set up shutdown",
  honest: [
    "'docker stop' (and a Kubernetes pod deletion) sends SIGTERM to the container's first process, PID 1, waits for the grace period, then sends SIGKILL, which cannot be caught. The app needs 8 s to finish 120 in-flight requests after it is told to stop.",
    "In shell form (CMD ./app, which runs through /bin/sh -c) PID 1 is the shell, which does not pass SIGTERM on to the app, so the app is killed at the end of the grace period with its requests dropped. In exec form the app receives the signal. If it is PID 1 and has no handler, the signal is ignored, because PID 1 gets no default actions; behind a small init such as tini, which also reaps zombies (exited children nobody collected, 60 an hour here), the default action terminates it at once, still dropping requests. Only an app with a handler drains.",
    "Round figures to show which pieces have to be in place.",
  ],
  init: () => ({ form: "shell", handles: false, init: false, grace: 10 }),
  controls: () => [
    { kind: "choice", id: "form", label: "Start command", options: [{ id: "shell", label: "Shell form: CMD ./app" }, { id: "exec", label: "Exec form: CMD [\"./app\"]" }] },
    { kind: "toggle", id: "handles", label: "The app handles SIGTERM and drains" },
    { kind: "toggle", id: "init", label: "Run a small init (tini) as PID 1" },
    { kind: "slider", id: "grace", label: "Grace period before SIGKILL", min: 2, max: 60, step: 1, fmt: "int", hint: "seconds" },
  ],
  evaluate: (v) => {
    const r = signalRun(str(v, "form"), bool(v, "handles"), bool(v, "init"), num(v, "grace"));
    return {
      metrics: { stopSec: r.stop, gracefulShutdown: r.graceful, droppedRequests: r.dropped, zombiesPerHour: r.zombies },
      readouts: [
        { label: "Container stops after", value: r.stop, fmt: "s", tone: tone(r.stop, 10, 20) },
        { label: "Shutdown graceful", value: r.graceful ? "yes" : "no, killed", tone: r.graceful ? "ok" : "alert" },
        { label: "In-flight requests dropped", value: r.dropped, fmt: "int", tone: tone(r.dropped, 0, 20) },
        { label: "Zombie processes a hour", value: r.zombies, fmt: "int", tone: tone(r.zombies, 0, 10) },
      ],
      view: { kind: "steps", steps: [{ label: "SIGTERM sent to PID 1", value: str(v, "form") === "shell" && !bool(v, "init") ? "the shell, which ignores it" : "the app", tone: str(v, "form") === "shell" && !bool(v, "init") ? "alert" : "ok" }, { label: "App drains requests", value: r.graceful ? "8 s" : "never told", tone: r.graceful ? "ok" : "alert" }, { label: "Ends", value: r.graceful ? "clean exit" : `SIGKILL at ${num(v, "grace")} s`, tone: r.graceful ? "ok" : "alert" }] },
      notes: [!r.graceful ? "Every deploy kills requests mid-flight." : "Drained and stopped before the deadline."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!out.metrics.gracefulShutdown && out.metrics.stopSec! >= num(v, "grace")) ev.push("killed");
    if (out.metrics.zombiesPerHour! > 0 && !bool(v, "init") && bool(v, "handles") && str(v, "form") === "exec") ev.push("zombies");
    return ev;
  },
  scene: (n): SceneOut => (n === "exec" ? { set: { form: "exec" }, focus: ["form"] } : n === "handler" ? { set: { form: "exec", handles: true }, focus: ["handles"] } : n === "init" ? { set: { init: true }, focus: ["init"] } : undefined),
};

// ------------------------------------------------------------------ memory and the OOM killer

export function oomRun(limit: string, swap: boolean, protect: boolean) {
  const leak = 0.5;
  const dbGB = 3.5;
  const free = 8 - 1 - dbGB - 1;
  const cap = limit === "none" ? Infinity : Number(limit);
  let dbKilled = 0;
  let thrash = 0;
  let restarts: number;
  if (cap < free) {
    restarts = 24 / (cap / leak);
  } else {
    const pressureAt = free / leak;
    const swapExtra = swap ? 4 / leak : 0;
    thrash = swap ? swapExtra : 0;
    restarts = 24 / (pressureAt + swapExtra);
    dbKilled = protect ? 0 : 1;
  }
  return { dbKilled, thrash, restarts };
}

export const oomLab: LabModel = {
  id: "oom-lab",
  metrics: ["dbKilled", "thrashHours", "workerRestartsPerDay"],
  observes: ["db-dies", "thrash"],
  scenes: ["cgroup", "swap", "protect"],
  runLabel: "Contain the leak",
  honest: [
    "An 8 GB node runs a database using 3.5 GB, a cache using 1 GB and the system's 1 GB, leaving 2.5 GB for a worker that has a memory leak of 0.5 GB an hour. When free memory runs out, the kernel's out-of-memory killer picks the process with the highest badness score, roughly the one using the most memory (adjusted by its oom_score_adj), and the database is bigger than the worker at that point.",
    "A cgroup limit on the worker kills it, and only it, when it reaches the limit: a 1 GB limit means a restart every 2 hours, 2 GB every 4. A limit above 2.5 GB is never reached because the node runs out first. Swap lets the node continue into 4 GB of disk, an extra 8 hours of leak, at a speed so slow that everything crawls (thrashing) until the kill. Protecting the database with a strongly negative oom_score_adj makes the kernel kill the worker instead.",
    "Round figures. The leak is a bug; the controls decide which process dies, and when.",
  ],
  init: () => ({ limit: "none", swap: false, protect: false }),
  controls: () => [
    { kind: "choice", id: "limit", label: "Worker memory limit (cgroup)", options: [{ id: "none", label: "None" }, { id: "1", label: "1 GB" }, { id: "2", label: "2 GB" }, { id: "4", label: "4 GB" }] },
    { kind: "toggle", id: "swap", label: "4 GB of swap on the node" },
    { kind: "toggle", id: "protect", label: "Protect the database from the OOM killer" },
  ],
  evaluate: (v) => {
    const r = oomRun(str(v, "limit"), bool(v, "swap"), bool(v, "protect"));
    return {
      metrics: { dbKilled: r.dbKilled, thrashHours: r.thrash, workerRestartsPerDay: r.restarts },
      readouts: [
        { label: "Database killed", value: r.dbKilled ? "yes" : "no", tone: r.dbKilled ? "alert" : "ok" },
        { label: "Hours the node crawls (swap thrash)", value: r.thrash, fmt: "num", tone: tone(r.thrash, 0, 2) },
        { label: "Worker restarts a day", value: r.restarts, fmt: "num", tone: tone(r.restarts, 6, 12) },
      ],
      view: { kind: "bars", fmt: "num", max: 14, bars: [{ label: "Worker restarts a day", value: r.restarts, tone: tone(r.restarts, 6, 12) }, { label: "Thrash hours", value: r.thrash, tone: tone(r.thrash, 0, 2) }] },
      notes: [r.dbKilled ? "The kernel killed the biggest process, which was the database." : r.thrash > 0 ? "Swap kept it alive and made everything slow." : "Only the leaking worker pays."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.dbKilled === 1) ev.push("db-dies");
    if (out.metrics.thrashHours! > 0) ev.push("thrash");
    return ev;
  },
  scene: (n): SceneOut => (n === "cgroup" ? { set: { limit: "2" }, focus: ["limit"] } : n === "swap" ? { set: { limit: "none", swap: true }, focus: ["swap"] } : n === "protect" ? { set: { limit: "none", protect: true }, focus: ["protect"] } : undefined),
};

// ------------------------------------------------------------------ file descriptors

export function fdRun(ulimit: number, pooled: boolean, closes: boolean) {
  const perConn = pooled ? 1.2 : 2;
  const capacity = Math.max(0, Math.floor((ulimit - 60) / perConn));
  const leakPerSec = closes ? 0 : 2;
  const hours = leakPerSec > 0 ? ulimit / leakPerSec / 3600 : Infinity;
  const load = 6000;
  const errors = load > capacity ? (load - capacity) / load : 0;
  return { capacity, hours, errors };
}

export const fdLab: LabModel = {
  id: "fd-lab",
  metrics: ["connectionCapacity", "hoursToExhaust", "errorShare"],
  observes: ["too-many", "leak-clock"],
  scenes: ["limit", "pool", "close"],
  runLabel: "Raise the right limits",
  honest: [
    "On Linux a socket, a file, a pipe and a timer are all file descriptors, and a process is limited to a number of them (ulimit -n; 1,024 is a common default for a login shell, and a service manager sets its own). A server that proxies requests holds a descriptor for each client connection and one for each upstream connection: 2 per client without a connection pool, about 1.2 with one that reuses connections. About 60 more go to logs, listeners and libraries.",
    "A bug that opens files and does not close them leaks 2 descriptors a second, and the process fails when the limit is reached, however large it is. At 6,000 concurrent clients the process needs 12,000 descriptors without pooling. When descriptors run out, accept() fails with 'too many open files' and new connections are refused, while existing ones carry on.",
    "Round figures to show that the limit and the leak are separate problems.",
  ],
  init: () => ({ ulimit: 1024, pooled: false, closes: false }),
  controls: () => [
    { kind: "slider", id: "ulimit", label: "Descriptor limit (ulimit -n)", min: 256, max: 1048576, step: 1, log: true, fmt: "int" },
    { kind: "toggle", id: "pooled", label: "Reuse upstream connections (a pool)" },
    { kind: "toggle", id: "closes", label: "Always close files and sockets (no leak)" },
  ],
  evaluate: (v) => {
    const r = fdRun(num(v, "ulimit"), bool(v, "pooled"), bool(v, "closes"));
    return {
      metrics: { connectionCapacity: r.capacity, hoursToExhaust: Number.isFinite(r.hours) ? r.hours : 99999, errorShare: r.errors },
      readouts: [
        { label: "Concurrent clients served", value: r.capacity, fmt: "int", tone: toneLow(r.capacity, 6000, 3000) },
        { label: "Time until a leak exhausts the limit", value: Number.isFinite(r.hours) ? r.hours : "never", fmt: "num", sub: Number.isFinite(r.hours) ? "hours" : undefined, tone: Number.isFinite(r.hours) ? toneLow(r.hours, 24, 4) : "ok" },
        { label: "Clients refused at 6,000 concurrent", value: r.errors, fmt: "pct", tone: tone(r.errors, 0, 0.1) },
      ],
      view: { kind: "bars", fmt: "int", max: 12000, bars: [{ label: "Clients served", value: Math.min(r.capacity, 12000), tone: toneLow(r.capacity, 6000, 3000) }], lines: [{ value: 6000, label: "load", tone: "warn" }] },
      notes: [r.errors > 0 ? "New connections are refused with 'too many open files'." : Number.isFinite(r.hours) && r.hours < 24 ? "Fine until the leak fills the table." : "Enough descriptors, and nothing leaking."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.errorShare! > 0) ev.push("too-many");
    if (!bool(v, "closes") && num(v, "ulimit") > 100000) ev.push("leak-clock");
    return ev;
  },
  scene: (n): SceneOut => (n === "limit" ? { set: { ulimit: 65536 }, focus: ["ulimit"] } : n === "pool" ? { set: { pooled: true }, focus: ["pooled"] } : n === "close" ? { set: { closes: true }, focus: ["closes"] } : undefined),
};

// ------------------------------------------------------------------ systemd units

export function unitRun(restart: string, restartSec: number, limited: boolean) {
  const crashesPerHour = 1;
  const boot = 5;
  const down = restart === "no" ? 900 : restartSec + boot;
  const transient = crashesPerHour * down;
  const loop = restart === "no" || limited ? 0 : 60 / (restartSec + 0.2);
  return { transient, loop, gaveUp: restart !== "no" && limited ? 1 : 0 };
}

export const unitLab: LabModel = {
  id: "unit-lab",
  metrics: ["downtimePerHour", "loopRestartsPerMin", "gaveUpOnBadConfig"],
  observes: ["no-restart", "hot-loop"],
  scenes: ["restart", "backoff", "limit"],
  runLabel: "Write the unit",
  honest: [
    "A service crashes about once an hour from a transient fault and takes 5 s to start. With Restart=no it stays down until a person notices, about 15 minutes in these figures; with a restart policy it is back after RestartSec plus the start time.",
    "A separate failure is a bad configuration after a deploy: the service dies the instant it starts. Restart=on-failure with no limit then restarts it forever, once every RestartSec plus 0.2 s, filling logs and burning CPU. systemd's start limit (StartLimitBurst starts within StartLimitIntervalSec) stops the retries and marks the unit failed, which is a clear signal for a person and for monitoring.",
    "Round figures for the shape of the trade-off between recovering fast and not looping.",
  ],
  init: () => ({ restart: "no", restartSec: 1, limited: false }),
  controls: () => [
    { kind: "choice", id: "restart", label: "Restart=", options: [{ id: "no", label: "no" }, { id: "on-failure", label: "on-failure" }] },
    { kind: "slider", id: "restartSec", label: "RestartSec=", min: 0, max: 30, step: 1, fmt: "int", hint: "seconds" },
    { kind: "toggle", id: "limited", label: "Stop retrying after 5 failed starts in 60 seconds" },
  ],
  evaluate: (v) => {
    const r = unitRun(str(v, "restart"), num(v, "restartSec"), bool(v, "limited"));
    return {
      metrics: { downtimePerHour: r.transient, loopRestartsPerMin: r.loop, gaveUpOnBadConfig: r.gaveUp },
      readouts: [
        { label: "Downtime a hour from the transient crash", value: r.transient, fmt: "s", tone: tone(r.transient, 30, 120) },
        { label: "Restarts a minute with a bad configuration", value: r.loop, fmt: "num", tone: tone(r.loop, 5, 20) },
        { label: "Unit marked failed on a bad configuration", value: r.gaveUp ? "yes" : "no", tone: r.gaveUp ? "ok" : "warn" },
      ],
      view: { kind: "bars", fmt: "num", max: 900, bars: [{ label: "Downtime per hour (s)", value: r.transient, tone: tone(r.transient, 30, 120) }] },
      notes: [str(v, "restart") === "no" ? "Every crash is an outage until someone logs in." : r.loop > 20 ? "A bad deploy turns into a restart storm." : "Recovers quickly and gives up on a hopeless unit."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "restart") === "no" && out.metrics.downtimePerHour! > 600) ev.push("no-restart");
    if (out.metrics.loopRestartsPerMin! > 20) ev.push("hot-loop");
    return ev;
  },
  scene: (n): SceneOut => (n === "restart" ? { set: { restart: "on-failure", restartSec: 1 }, focus: ["restart"] } : n === "backoff" ? { set: { restart: "on-failure", restartSec: 15 }, focus: ["restartSec"] } : n === "limit" ? { set: { restart: "on-failure", limited: true }, focus: ["limited"] } : undefined),
};

// ------------------------------------------------------------------ reading logs

const RATE: Record<string, number> = { error: 2, info: 20, debug: 200 };
const CONTEXT: Record<string, number> = { error: 0.4, info: 0.9, debug: 1 };

export function logRun(persistent: boolean, sizeMB: number, level: string, central: boolean, ratelimit: boolean) {
  const rate = RATE[level]!;
  const localHours = persistent ? sizeMB / rate : 0;
  const retention = central ? 720 : localHours;
  const survives = persistent || central;
  const dropped = ratelimit ? 0.4 : 0;
  return { retention, survives: survives ? 1 : 0, disk: persistent ? sizeMB : 16, context: CONTEXT[level]! * (1 - dropped), dropped };
}

export const logLab: LabModel = {
  id: "log-lab",
  metrics: ["retentionHours", "survivesReboot", "diskMB", "evidenceQuality"],
  observes: ["lost-evidence", "dropped-lines"],
  scenes: ["persist", "forward", "level"],
  runLabel: "Set up logging",
  honest: [
    "The incident happened at 03:12 and the investigation starts 20 hours later, after the host rebooted. By default the journal is volatile: kept in memory and gone at reboot. A persistent journal is written under /var/log/journal and capped by size. At a log level of error the host writes about 2 MB an hour, at info 20 and at debug 200.",
    "Retention on one machine is the size cap divided by the write rate. Forwarding to a central log service keeps 30 days (720 hours) regardless of the host, uses little local disk and survives the host. Evidence quality is how much of the story the level records (error 40%, info 90%, debug 100%). The journal's rate limit drops bursts of messages from one service, and a crash is exactly a burst: with it on, 40% of the lines at the incident are missing.",
    "Round figures for the shape of the trade-offs.",
  ],
  init: () => ({ persistent: false, sizeMB: 100, level: "info", central: false, ratelimit: true }),
  controls: () => [
    { kind: "toggle", id: "persistent", label: "Persistent journal on disk" },
    { kind: "slider", id: "sizeMB", label: "Journal size cap", min: 50, max: 4000, step: 50, log: true, fmt: "int", hint: "MB" },
    { kind: "choice", id: "level", label: "Log level", options: [{ id: "error", label: "Errors only" }, { id: "info", label: "Info" }, { id: "debug", label: "Debug" }] },
    { kind: "toggle", id: "central", label: "Forward to a central log service" },
    { kind: "toggle", id: "ratelimit", label: "Journal rate limiting on" },
  ],
  evaluate: (v) => {
    const r = logRun(bool(v, "persistent"), num(v, "sizeMB"), str(v, "level"), bool(v, "central"), bool(v, "ratelimit"));
    return {
      metrics: { retentionHours: r.retention, survivesReboot: r.survives, diskMB: r.disk, evidenceQuality: r.context },
      readouts: [
        { label: "Logs kept for", value: r.retention, fmt: "num", sub: "hours", tone: toneLow(r.retention, 72, 24) },
        { label: "Survive a reboot", value: r.survives ? "yes" : "no", tone: r.survives ? "ok" : "alert" },
        { label: "Local disk used", value: r.disk, fmt: "int", sub: "MB", tone: tone(r.disk, 500, 2000) },
        { label: "How much of the story is recorded", value: r.context, fmt: "pct", tone: toneLow(r.context, 0.8, 0.5) },
      ],
      view: { kind: "bars", fmt: "num", max: 800, bars: [{ label: "Hours of logs kept", value: Math.min(r.retention, 800), tone: toneLow(r.retention, 72, 24) }], lines: [{ value: 72, label: "target", tone: "ok" }] },
      notes: [!r.survives ? "A reboot erased the evidence." : r.context < 0.7 ? "The lines that explain it were dropped or never written." : "The story is still there."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!out.metrics.survivesReboot) ev.push("lost-evidence");
    if (bool(v, "ratelimit") && out.metrics.evidenceQuality! < 0.6 && str(v, "level") !== "error") ev.push("dropped-lines");
    return ev;
  },
  scene: (n): SceneOut => (n === "persist" ? { set: { persistent: true }, focus: ["persistent"] } : n === "forward" ? { set: { central: true }, focus: ["central"] } : n === "level" ? { set: { level: "info" }, focus: ["level"] } : undefined),
};

// ------------------------------------------------------------------ burstable CPU credits

const INST: Record<string, { base: number; price: number }> = { micro: { base: 0.1, price: 7.6 }, small: { base: 0.2, price: 15 }, medium: { base: 0.2, price: 30 }, large: { base: 1, price: 70 } };

export function creditRun(type: string, unlimited: boolean, util: number) {
  const i = INST[type]!;
  const burn = Math.max(0, util - i.base) * 60;
  const bank = 144;
  const hours = burn > 0 ? bank / burn : Infinity;
  const throttled = burn > 0 && !unlimited && hours < 730;
  const speed = throttled ? i.base / util : 1;
  const surcharge = unlimited ? Math.max(0, util - i.base) * 730 * 0.05 : 0;
  return { hours, speed, cost: i.price + surcharge, throttled };
}

export const creditLab: LabModel = {
  id: "credit-lab",
  metrics: ["hoursToThrottle", "speedAfterCredits", "monthlyCost"],
  observes: ["throttled", "unlimited-bill"],
  scenes: ["standard", "unlimited", "bigger"],
  runLabel: "Pick the instance",
  honest: [
    "A burstable instance has a baseline CPU share and earns credits while it runs below it; running above it spends them. One credit is one minute of a full vCPU. In these figures a micro has a 10% baseline ($7.60 a month), a small 20% ($15), a medium 20% ($30) and a general-purpose large has 100% with no credits ($70). A launch bank of 144 credits is available.",
    "Spending is (use − baseline) × 60 credits an hour. When the bank is empty a standard instance is held to its baseline, so throughput falls to baseline ÷ use. In unlimited mode it is never throttled, and surplus use is billed at $0.05 per vCPU-hour above the baseline.",
    "Round figures for the shape of the choice. Check the provider's current credit rules before you rely on these.",
  ],
  init: (c) => ({ type: "micro", unlimited: false, util: (c as { util?: number }).util ?? 0.18 }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "choice", id: "type", label: "Instance", options: [{ id: "micro", label: "Micro, 10% baseline, $7.60" }, { id: "small", label: "Small, 20% baseline, $15" }, { id: "medium", label: "Medium, 20% baseline, $30" }, { id: "large", label: "General-purpose large, $70" }] },
      { kind: "toggle", id: "unlimited", label: "Unlimited mode (pay for surplus use)" },
    ];
    if (!(c as { lockUtil?: boolean }).lockUtil) out.push({ kind: "slider", id: "util", label: "Average CPU use, in vCPUs", min: 0.05, max: 0.9, step: 0.01, fmt: "pct" });
    return out;
  },
  evaluate: (v) => {
    const r = creditRun(str(v, "type"), bool(v, "unlimited"), num(v, "util"));
    return {
      metrics: { hoursToThrottle: Number.isFinite(r.hours) ? r.hours : 99999, speedAfterCredits: r.speed, monthlyCost: r.cost },
      readouts: [
        { label: "Credits last", value: Number.isFinite(r.hours) ? r.hours : "forever", fmt: "num", sub: Number.isFinite(r.hours) ? "hours" : undefined, tone: Number.isFinite(r.hours) ? toneLow(r.hours, 730, 48) : "ok" },
        { label: "Throughput once credits are gone", value: r.speed, fmt: "pct", tone: toneLow(r.speed, 0.99, 0.6) },
        { label: "Cost a month", value: r.cost, fmt: "usd", tone: tone(r.cost, 20, 40) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Throughput after credits", value: r.speed, tone: toneLow(r.speed, 0.99, 0.6) }] },
      notes: [r.throttled ? "Healthy for a day and then slowed to the baseline." : bool(v, "unlimited") && num(v, "util") > INST[str(v, "type")]!.base ? "Never throttled, and the surplus is on the bill." : "Within the baseline: credits never run out."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.speedAfterCredits! < 0.9) ev.push("throttled");
    if (bool(v, "unlimited") && out.metrics.monthlyCost! > INST[str(v, "type")]!.price * 1.5) ev.push("unlimited-bill");
    return ev;
  },
  scene: (n): SceneOut => (n === "standard" ? { set: { unlimited: false }, focus: ["type"] } : n === "unlimited" ? { set: { unlimited: true }, focus: ["unlimited"] } : n === "bigger" ? { set: { type: "small", unlimited: false }, focus: ["type"] } : undefined),
};

export const C2_MODELS: LabModel[] = [signalLab, oomLab, fdLab, unitLab, logLab, creditLab];
