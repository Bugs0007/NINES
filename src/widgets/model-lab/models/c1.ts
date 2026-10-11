/**
 * Chapter C1 "Containers" models: what a container is, images and layers, the build cache, volumes, networking,
 * Compose, Kubernetes core and probes with autoscaling. Closed forms with labelled round constants.
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ what a container is

export function isolationRun(f: { pid: boolean; mnt: boolean; user: boolean; mem: boolean; cpu: boolean; pids: boolean; ro: boolean; sec: boolean }) {
  const visible = f.pid ? 3 : 312;
  const hostFiles = f.mnt ? 12 : 18400;
  const memImpact = f.mem ? 0.5 : 12;
  const neighbour = f.cpu ? 1.1 : 6;
  const forkBomb = f.pids ? 1 : 0;
  let escape = 30;
  if (f.user) escape *= 0.1;
  if (f.sec) escape *= 0.4;
  if (f.ro) escape *= 0.8;
  const compat = (f.user ? 1 : 0) + (f.ro ? 1 : 0) + (f.sec ? 0.5 : 0);
  return { visible, hostFiles, memImpact, neighbour, forkBomb, escape, compat };
}

export const isolationLab: LabModel = {
  id: "isolation-lab",
  metrics: ["visibleProcs", "hostFiles", "hostMemGB", "neighbourSlowdown", "forkBombContained", "escapeRisk", "compatIssues"],
  observes: ["sees-host", "runaway"],
  scenes: ["namespaces", "cgroups", "hardening"],
  runLabel: "Isolate the process",
  honest: [
    "A container is an ordinary Linux process with a restricted view and restricted resources. Namespaces restrict what it can see: with a process namespace it sees 3 processes instead of the host's 312, and with a mount namespace it sees its own 12 files instead of the host's 18,400. Control groups restrict what it can use: a memory limit of 512 MB stops a 16 GB leak from reaching the 12 GB the host has free, a CPU limit of one core keeps a spinning process from slowing its neighbours (1.1× instead of 6×), and a process limit stops a fork bomb.",
    "Three more switches reduce what a kernel vulnerability can do. A user namespace maps the container's root to an unprivileged user on the host (escape risk × 0.1), a seccomp profile blocks rarely needed system calls (× 0.4), a read-only root filesystem stops persistence (× 0.8). The baseline is 30 successful host compromises per 100 container breakouts of that kind. Each costs compatibility: user namespaces 1 unit, read-only 1, seccomp 0.5, for volume permissions, scratch paths and unusual system calls.",
    "Round figures to show which switch controls which risk.",
  ],
  init: () => ({ pid: false, mnt: false, user: false, mem: false, cpu: false, pids: false, ro: false, sec: false }),
  controls: () => [
    { kind: "toggle", id: "pid", label: "Process namespace" },
    { kind: "toggle", id: "mnt", label: "Mount namespace (own filesystem view)" },
    { kind: "toggle", id: "mem", label: "Memory limit (cgroup), 512 MB" },
    { kind: "toggle", id: "cpu", label: "CPU limit (cgroup), one core" },
    { kind: "toggle", id: "pids", label: "Process count limit" },
    { kind: "toggle", id: "user", label: "User namespace (container root is not host root)" },
    { kind: "toggle", id: "sec", label: "Seccomp system-call filter" },
    { kind: "toggle", id: "ro", label: "Read-only root filesystem" },
  ],
  evaluate: (v) => {
    const r = isolationRun({ pid: bool(v, "pid"), mnt: bool(v, "mnt"), user: bool(v, "user"), mem: bool(v, "mem"), cpu: bool(v, "cpu"), pids: bool(v, "pids"), ro: bool(v, "ro"), sec: bool(v, "sec") });
    return {
      metrics: { visibleProcs: r.visible, hostFiles: r.hostFiles, hostMemGB: r.memImpact, neighbourSlowdown: r.neighbour, forkBombContained: r.forkBomb, escapeRisk: r.escape, compatIssues: r.compat },
      readouts: [
        { label: "Host processes the container can see", value: r.visible, fmt: "int", tone: tone(r.visible, 10, 50) },
        { label: "Host files it can see", value: r.hostFiles, fmt: "int", tone: tone(r.hostFiles, 100, 1000) },
        { label: "Host memory a leak can take", value: r.memImpact, fmt: "gb", tone: tone(r.memImpact, 1, 4) },
        { label: "Neighbour slowdown from a spinning process", value: r.neighbour, fmt: "x", tone: tone(r.neighbour, 1.3, 2) },
        { label: "Host compromises per 100 kernel breakouts", value: r.escape, fmt: "num", tone: tone(r.escape, 5, 15) },
        { label: "Compatibility cost", value: r.compat, fmt: "num", tone: tone(r.compat, 1, 2) },
      ],
      view: { kind: "bars", fmt: "num", max: 35, bars: [{ label: "Breakout risk", value: r.escape, tone: tone(r.escape, 5, 15) }, { label: "Compatibility cost", value: r.compat, tone: tone(r.compat, 1, 2) }] },
      notes: [r.visible > 100 ? "Nothing is hidden: this is just a process on the host." : r.memImpact > 1 ? "It cannot see the host, but it can still eat it." : "Contained, with the switches that cost the least."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!bool(v, "pid") && !bool(v, "mnt") && out.metrics.visibleProcs! > 100 && (bool(v, "mem") || bool(v, "cpu") || bool(v, "pids"))) ev.push("sees-host");
    if (!bool(v, "mem") && !bool(v, "cpu") && (bool(v, "pid") || bool(v, "mnt"))) ev.push("runaway");
    return ev;
  },
  scene: (n): SceneOut => (n === "namespaces" ? { set: { pid: true, mnt: true }, focus: ["pid", "mnt"] } : n === "cgroups" ? { set: { mem: true, cpu: true, pids: true }, focus: ["mem", "cpu", "pids"] } : n === "hardening" ? { set: { user: true, sec: true }, focus: ["user", "sec"] } : undefined),
};

// ------------------------------------------------------------------ images and layers

const BASES: Record<string, { mb: number; vulns: number; compat: number }> = { full: { mb: 1000, vulns: 180, compat: 0 }, slim: { mb: 150, vulns: 40, compat: 0 }, alpine: { mb: 60, vulns: 8, compat: 1 }, distroless: { mb: 40, vulns: 3, compat: 0.5 } };

export function imageRun(base: string, multi: boolean, clean: boolean, ignore: boolean) {
  const b = BASES[base]!;
  const mb = b.mb + 125 + (multi ? 0 : 600) + (clean ? 0 : 150) + (ignore ? 0 : 300);
  const vulns = b.vulns + (multi ? 0 : 60);
  return { mb, vulns, compat: b.compat, pull: mb / 25 };
}

export const imageLab: LabModel = {
  id: "image-lab",
  metrics: ["imageMB", "pullSec", "vulnerabilities", "compatIssues"],
  observes: ["fat-image", "slim-image"],
  scenes: ["multistage", "clean", "base"],
  runLabel: "Build the image",
  honest: [
    "An image is a stack of read-only layers, each the result of one instruction, and its size is the sum of the layers that remain. Base images differ: a full distribution is about 1,000 MB, a slim one 150, Alpine 60 and a distroless runtime 40, with about 180, 40, 8 and 3 known vulnerabilities in their packages. The application's dependencies and code add 125 MB.",
    "Three habits add weight if skipped: a multi-stage build leaves the 600 MB toolchain and 60 more vulnerable packages behind in the build stage; deleting the package cache in the same instruction that created it saves 150 MB (deleting it in a later layer saves nothing, because the earlier layer still holds it); a .dockerignore keeps 300 MB of git history and local dependencies out of the build context and out of the image. Alpine uses a different C library that breaks some prebuilt packages (compatibility cost 1), and distroless has no shell to debug with (0.5).",
    "Pulling at 25 MB/s onto a cold node: seconds are size ÷ 25. Round figures.",
  ],
  init: () => ({ base: "full", multi: false, clean: false, ignore: false }),
  controls: () => [
    { kind: "choice", id: "base", label: "Base image", options: [{ id: "full", label: "Full distribution (1,000 MB)" }, { id: "slim", label: "Slim (150 MB)" }, { id: "alpine", label: "Alpine (60 MB)" }, { id: "distroless", label: "Distroless runtime (40 MB)" }] },
    { kind: "toggle", id: "multi", label: "Multi-stage build: copy only the result" },
    { kind: "toggle", id: "clean", label: "Remove the package cache in the same instruction" },
    { kind: "toggle", id: "ignore", label: ".dockerignore keeps junk out of the context" },
  ],
  evaluate: (v) => {
    const r = imageRun(str(v, "base"), bool(v, "multi"), bool(v, "clean"), bool(v, "ignore"));
    return {
      metrics: { imageMB: r.mb, pullSec: r.pull, vulnerabilities: r.vulns, compatIssues: r.compat },
      readouts: [
        { label: "Image size", value: r.mb, fmt: "num", sub: "MB", tone: tone(r.mb, 300, 800) },
        { label: "Cold pull", value: r.pull, fmt: "s", tone: tone(r.pull, 12, 30) },
        { label: "Known vulnerable packages", value: r.vulns, fmt: "int", tone: tone(r.vulns, 50, 100) },
        { label: "Compatibility cost", value: r.compat, fmt: "num", tone: tone(r.compat, 0.5, 1) },
      ],
      view: { kind: "bars", fmt: "num", max: 2400, bars: [{ label: "Image size (MB)", segs: [{ value: BASES[str(v, "base")]!.mb, tone: "info", label: "base" }, { value: 125, tone: "ok", label: "app" }, { value: bool(v, "multi") ? 0 : 600, tone: "warn", label: "toolchain" }, { value: bool(v, "clean") ? 0 : 150, tone: "warn", label: "cache" }, { value: bool(v, "ignore") ? 0 : 300, tone: "alert", label: "junk" }] }] },
      notes: [r.mb > 1500 ? "Every node pulls a gigabyte and a half before it can start." : r.mb > 300 ? "Still carrying build tools or junk." : "Small enough to pull in seconds."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.imageMB! > 1500) ev.push("fat-image");
    if (out.metrics.imageMB! < 300 && str(v, "base") !== "full") ev.push("slim-image");
    return ev;
  },
  scene: (n): SceneOut => (n === "multistage" ? { set: { multi: true }, focus: ["multi"] } : n === "clean" ? { set: { clean: true, ignore: true }, focus: ["clean", "ignore"] } : n === "base" ? { set: { base: "slim" }, focus: ["base"] } : undefined),
};

// ------------------------------------------------------------------ build cache

export function cacheRun(depsFirst: boolean, ciCache: boolean, mount: boolean, pin: boolean) {
  const pip = 90;
  const tail = 32;
  const pipDep = mount ? 25 : pip;
  const cold = 20 + 60 + pipDep + tail;
  const src = ciCache ? (depsFirst ? tail : pipDep + tail) : cold;
  const dep = ciCache ? pipDep + tail : cold;
  const base = cold;
  const pBase = pin ? 0.01 : 0.06;
  const pDep = 0.12;
  const pSrc = 1 - pBase - pDep;
  return { src, dep, expected: pSrc * src + pDep * dep + pBase * base };
}

export const cacheLab: LabModel = {
  id: "cache-build-lab",
  metrics: ["srcBuildSec", "depBuildSec", "expectedBuildSec"],
  observes: ["busted", "cold-ci"],
  scenes: ["order", "ci", "mount"],
  runLabel: "Order the Dockerfile",
  honest: [
    "A Dockerfile builds in steps, and each step's result is cached by its instruction and the files it depends on. When a step changes, it and every step after it rebuild. The steps here: pull the base image 20 s, install system packages 60 s, install Python dependencies 90 s, copy the source 2 s, then build and test 30 s.",
    "If the source is copied before the dependencies install, every code change rebuilds the 90 s dependency layer. Copying only the dependency manifest first, installing, and copying the source afterwards means a code change costs 32 s. A build cache mount keeps downloaded wheels between builds, cutting the dependency install to 25 s. CI runners start empty, so without a shared cache every build is cold (202 s).",
    "Commits are 81% code only, 12% dependency changes and 6% base image changes (1% if the base is pinned to a tag you update on purpose). Round figures.",
  ],
  init: () => ({ depsFirst: false, ciCache: false, mount: false, pin: false }),
  controls: () => [
    { kind: "toggle", id: "depsFirst", label: "Copy the dependency manifest, install, then copy the source" },
    { kind: "toggle", id: "ciCache", label: "CI keeps the layer cache between runs" },
    { kind: "toggle", id: "mount", label: "Build cache mount for downloaded packages" },
    { kind: "toggle", id: "pin", label: "Pin the base image to a version" },
  ],
  evaluate: (v) => {
    const r = cacheRun(bool(v, "depsFirst"), bool(v, "ciCache"), bool(v, "mount"), bool(v, "pin"));
    return {
      metrics: { srcBuildSec: r.src, depBuildSec: r.dep, expectedBuildSec: r.expected },
      readouts: [
        { label: "Build after a code change", value: r.src, fmt: "s", tone: tone(r.src, 40, 100) },
        { label: "Build after a dependency change", value: r.dep, fmt: "s", tone: tone(r.dep, 60, 120) },
        { label: "Average build", value: r.expected, fmt: "s", tone: tone(r.expected, 45, 100) },
      ],
      view: { kind: "bars", fmt: "s", max: 210, bars: [{ label: "Code change", value: r.src, tone: tone(r.src, 40, 100) }, { label: "Dependency change", value: r.dep, tone: tone(r.dep, 60, 120) }] },
      notes: [!bool(v, "ciCache") ? "Every CI build starts from nothing." : !bool(v, "depsFirst") ? "Each code change reinstalls the dependencies." : "A code change only rebuilds the last steps."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (bool(v, "ciCache") && !bool(v, "depsFirst") && out.metrics.srcBuildSec! > 100) ev.push("busted");
    if (!bool(v, "ciCache") && out.metrics.srcBuildSec! > 200) ev.push("cold-ci");
    return ev;
  },
  scene: (n): SceneOut => (n === "order" ? { set: { depsFirst: true, ciCache: true }, focus: ["depsFirst"] } : n === "ci" ? { set: { ciCache: true }, focus: ["ciCache"] } : n === "mount" ? { set: { depsFirst: true, ciCache: true, mount: true }, focus: ["mount"] } : undefined),
};

// ------------------------------------------------------------------ volumes

const SURV: Record<string, [boolean, boolean, boolean, boolean]> = {
  layer: [true, false, false, false],
  bind: [true, true, false, true],
  named: [true, true, false, false],
  tmpfs: [false, false, false, false],
  db: [true, true, true, true],
};

export function volumeRun(store: string, backup: boolean, cloud: boolean) {
  const s = SURV[store]!.slice();
  if (store === "named" && cloud) s[2] = true;
  const rate = [52, 12, 0.5, 0.5];
  let lost = 0;
  for (let i = 0; i < 4; i++) if (!s[i]) lost += rate[i]!;
  const recover = backup || store === "db";
  return { unrecoverable: recover ? 0 : lost, lostHours: recover ? (store === "db" ? 0 : lost * 12) : 0, events: lost, writeRel: store === "layer" ? 0.85 : store === "bind" ? 0.95 : store === "tmpfs" ? 3 : store === "db" ? 0.6 : 1 };
}

export const volumeLab: LabModel = {
  id: "volume-lab",
  metrics: ["unrecoverableLosses", "lostHoursPerYear", "lossEvents", "writeSpeed"],
  observes: ["recreate-wipe", "safe"],
  scenes: ["layer", "volume", "backup"],
  runLabel: "Place the data",
  honest: [
    "A container's writable layer lives and dies with the container. Four things happen in a year: the container restarts about 52 times, is recreated from a new image about 12 times (a redeploy, or compose down then up), the host is lost about 0.5 times, and a cleanup command (prune) deletes unattached volumes about 0.5 times.",
    "Which storage survives which: the container layer survives only restarts; a bind mount of a host directory survives restarts, recreation and prune but not losing the host; a named volume survives restarts and recreation but not a prune of unused volumes, and survives the host only if its driver is a cloud disk; a memory-backed tmpfs survives nothing; an external managed database survives everything.",
    "A backup turns every other loss into a recovery that loses on average 12 hours of data. Write speed is relative to a named volume: the layer's copy-on-write costs 15%, a database over the network is 0.6, tmpfs is 3.",
  ],
  init: () => ({ store: "layer", backup: false, cloud: false }),
  controls: () => [
    { kind: "choice", id: "store", label: "Where the data lives", options: [{ id: "layer", label: "The container's writable layer" }, { id: "bind", label: "Bind mount of a host directory" }, { id: "named", label: "Named volume" }, { id: "tmpfs", label: "tmpfs (memory)" }, { id: "db", label: "An external managed database" }] },
    { kind: "toggle", id: "cloud", label: "Volume lives on a network-attached cloud disk" },
    { kind: "toggle", id: "backup", label: "Nightly backup to object storage" },
  ],
  evaluate: (v) => {
    const r = volumeRun(str(v, "store"), bool(v, "backup"), bool(v, "cloud"));
    return {
      metrics: { unrecoverableLosses: r.unrecoverable, lostHoursPerYear: r.lostHours, lossEvents: r.events, writeSpeed: r.writeRel },
      readouts: [
        { label: "Events a year that lose the live copy", value: r.events, fmt: "num", tone: tone(r.events, 0.5, 5) },
        { label: "Of those, unrecoverable", value: r.unrecoverable, fmt: "num", tone: tone(r.unrecoverable, 0.1, 1) },
        { label: "Data lost to restores a year", value: r.lostHours, fmt: "int", sub: "hours of writes", tone: tone(r.lostHours, 10, 100) },
        { label: "Write speed", value: r.writeRel, fmt: "x" },
      ],
      view: { kind: "bars", fmt: "num", max: 70, bars: [{ label: "Losses a year, unrecoverable", value: r.unrecoverable, tone: tone(r.unrecoverable, 0.1, 1) }, { label: "Losses a year, recoverable", value: r.events - r.unrecoverable, tone: "warn" }] },
      notes: [r.events > 10 ? "The data does not survive a redeploy." : r.unrecoverable > 0 ? "There is no copy anywhere else." : "A copy survives the failures that happen in a year."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "store") === "layer" && out.metrics.lossEvents! >= 12) ev.push("recreate-wipe");
    if (out.metrics.unrecoverableLosses! <= 0.1 && out.metrics.lostHoursPerYear! <= 10) ev.push("safe");
    return ev;
  },
  scene: (n): SceneOut => (n === "layer" ? { set: { store: "layer" }, focus: ["store"] } : n === "volume" ? { set: { store: "named" }, focus: ["store"] } : n === "backup" ? { set: { backup: true }, focus: ["backup"] } : undefined),
};

// ------------------------------------------------------------------ networking

export function netRun(net: string, host: string, publish: string) {
  const sameNet = net === "user";
  const works = (host === "service" && sameNet) || (host === "gateway" && publish === "all") || (host === "localhost" && net === "host");
  const exposed = publish === "all" || net === "host" ? 1 : 0;
  return { works: works ? 1 : 0, exposed };
}

export const netLab: LabModel = {
  id: "net-lab",
  metrics: ["appConnects", "dbExposed"],
  observes: ["localhost-fails", "exposed"],
  scenes: ["dns", "publish", "host"],
  runLabel: "Wire the containers",
  honest: [
    "Two containers, an app and a database, and a rule: the app connects to the database, and the database is not reachable from outside the machine. Each container has its own network namespace, so 'localhost' inside the app container is the app container itself.",
    "On the default bridge network containers can reach each other only by IP address, which changes. On a user-defined bridge network Docker's built-in DNS resolves service names. A published port forwards a host port to a container port: published on all interfaces it is reachable from the network (and from other containers through the host's address), published on 127.0.0.1 only from the host itself. In host network mode the container shares the host's network namespace, so localhost works, and so does the whole network: the database listens on the host's interfaces.",
    "The model checks whether the app's connection string reaches the database and whether the database is exposed.",
  ],
  init: () => ({ net: "bridge", host: "localhost", publish: "none" }),
  controls: () => [
    { kind: "choice", id: "net", label: "Network", options: [{ id: "bridge", label: "Default bridge" }, { id: "user", label: "User-defined bridge, shared by both" }, { id: "host", label: "Host networking" }] },
    { kind: "choice", id: "host", label: "App connects to the database at", options: [{ id: "localhost", label: "localhost" }, { id: "service", label: "the service name (db)" }, { id: "gateway", label: "the host's address and the published port" }] },
    { kind: "choice", id: "publish", label: "Database port published", options: [{ id: "none", label: "Not published" }, { id: "local", label: "On 127.0.0.1 only" }, { id: "all", label: "On all interfaces" }] },
  ],
  evaluate: (v) => {
    const r = netRun(str(v, "net"), str(v, "host"), str(v, "publish"));
    const ok = r.works === 1 && r.exposed === 0;
    return {
      metrics: { appConnects: r.works, dbExposed: r.exposed },
      readouts: [
        { label: "App reaches the database", value: r.works ? "yes" : "no", tone: r.works ? "ok" : "alert" },
        { label: "Database reachable from the network", value: r.exposed ? "yes" : "no", tone: r.exposed ? "alert" : "ok" },
      ],
      view: { kind: "steps", steps: [{ label: "App connects to", value: str(v, "host"), tone: r.works ? "ok" : "alert" }, { label: "Network", value: str(v, "net"), tone: "info" }, { label: "Published", value: str(v, "publish"), tone: r.exposed ? "alert" : "ok" }, { label: "Result", value: ok ? "works, private" : r.works ? "works, exposed" : "connection refused", tone: ok ? "ok" : r.works ? "warn" : "alert" }] },
      notes: [str(v, "host") === "localhost" && str(v, "net") !== "host" ? "Inside a container, localhost is the container itself." : r.exposed ? "It works, and so can anyone on the network." : "Connected and private."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "host") === "localhost" && str(v, "net") === "bridge" && out.metrics.appConnects === 0) ev.push("localhost-fails");
    if (out.metrics.dbExposed === 1 && out.metrics.appConnects === 1) ev.push("exposed");
    return ev;
  },
  scene: (n): SceneOut => (n === "dns" ? { set: { net: "user", host: "service" }, focus: ["net", "host"] } : n === "publish" ? { set: { publish: "all", host: "gateway" }, focus: ["publish"] } : n === "host" ? { set: { net: "host", host: "localhost" }, focus: ["net"] } : undefined),
};

// ------------------------------------------------------------------ compose

export function composeRun(depends: string, health: boolean, retry: boolean, restart: string) {
  const dbReady = 12;
  const apiBoot = 2;
  let crashes = 0;
  let ready = dbReady + apiBoot;
  let works = 1;
  if (depends === "healthy" && health) {
    ready = dbReady + apiBoot;
  } else if (retry) {
    ready = dbReady + apiBoot + 1;
  } else if (restart === "no") {
    works = 0;
    crashes = 1;
    ready = Infinity;
  } else {
    crashes = Math.ceil(dbReady / (apiBoot + 3));
    ready = crashes * (apiBoot + 3) + apiBoot;
  }
  if (depends === "healthy" && !health) {
    works = 0;
    crashes = 0;
    ready = Infinity;
  }
  return { crashes, ready, works };
}

export const composeLab: LabModel = {
  id: "compose-lab",
  metrics: ["worksFirstTry", "crashRestarts", "readySec"],
  observes: ["race", "stuck"],
  scenes: ["healthy", "retry", "restart"],
  runLabel: "Write the Compose file",
  honest: [
    "A Compose file starts an API and a database together. The database takes 12 s to accept connections; the API starts in 2 s and fails if it cannot connect. 'Started' dependency ordering waits only for the container to start, not for the database inside it to be ready.",
    "A healthcheck lets Compose know when the database answers; 'healthy' ordering then holds the API back until it does (14 s to ready). Without a healthcheck, 'healthy' ordering waits for a signal that never comes and the stack never starts. If the API retries its connection with a short backoff, order does not matter (15 s). If neither is done, the API exits; with a restart policy it crashes and restarts every 5 s until the database is up, four restarts here, and with no restart policy it stays down.",
    "Round figures to show why start order is not readiness.",
  ],
  init: () => ({ depends: "started", health: false, retry: false, restart: "no" }),
  controls: () => [
    { kind: "choice", id: "depends", label: "API starts after the database", options: [{ id: "started", label: "once it has started" }, { id: "healthy", label: "once it is healthy" }] },
    { kind: "toggle", id: "health", label: "Database healthcheck defined" },
    { kind: "toggle", id: "retry", label: "API retries its database connection" },
    { kind: "choice", id: "restart", label: "Restart policy", options: [{ id: "no", label: "No" }, { id: "on-failure", label: "On failure" }] },
  ],
  evaluate: (v) => {
    const r = composeRun(str(v, "depends"), bool(v, "health"), bool(v, "retry"), str(v, "restart"));
    return {
      metrics: { worksFirstTry: r.works, crashRestarts: r.crashes, readySec: Number.isFinite(r.ready) ? r.ready : 999 },
      readouts: [
        { label: "Stack comes up", value: r.works ? "yes" : "no", tone: r.works ? "ok" : "alert" },
        { label: "API crash restarts", value: r.crashes, fmt: "int", tone: tone(r.crashes, 0, 2) },
        { label: "Time until ready", value: Number.isFinite(r.ready) ? r.ready : "never", fmt: "s", tone: !Number.isFinite(r.ready) ? "alert" : tone(r.ready, 15, 30) },
      ],
      view: { kind: "steps", steps: [{ label: "Database ready", value: "12 s", tone: "info" }, { label: "API", value: r.works ? (r.crashes ? `${r.crashes} crashes, then up` : "starts cleanly") : "down", tone: r.works ? (r.crashes ? "warn" : "ok") : "alert" }] },
      notes: [r.works === 0 ? "The API exited and nothing brought it back." : r.crashes > 0 ? "It works by crashing until the database is ready." : "Clean start."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "depends") === "started" && !bool(v, "retry") && out.metrics.worksFirstTry === 0) ev.push("race");
    if (str(v, "depends") === "healthy" && !bool(v, "health")) ev.push("stuck");
    return ev;
  },
  scene: (n): SceneOut => (n === "healthy" ? { set: { depends: "healthy", health: true }, focus: ["depends", "health"] } : n === "retry" ? { set: { retry: true }, focus: ["retry"] } : n === "restart" ? { set: { restart: "on-failure" }, focus: ["restart"] } : undefined),
};

// ------------------------------------------------------------------ Kubernetes core

export function k8sRun(replicas: number, maxUnavail: number, maxSurge: number, ready: boolean, spread: boolean, nodes: number) {
  const unavailable = Math.min(replicas, Math.ceil(replicas * maxUnavail));
  const surge = Math.ceil(replicas * maxSurge);
  const minAvail = (replicas - unavailable) / replicas;
  const batch = Math.max(1, unavailable + surge);
  const rounds = Math.ceil(replicas / batch);
  const roll = rounds * (ready ? 30 : 8);
  const effAvail = ready ? minAvail : Math.max(0, minAvail - 0.3 * (batch / replicas));
  const perNode = spread ? Math.ceil(replicas / nodes) : replicas;
  const afterLoss = (replicas - perNode) / replicas;
  return { minAvail: effAvail, roll, afterLoss, drop: !ready };
}

export const k8sLab: LabModel = {
  id: "k8s-lab",
  metrics: ["minAvailability", "rolloutSec", "afterNodeLoss", "unreadyTraffic"],
  observes: ["outage-deploy", "lost-all"],
  scenes: ["rolling", "readiness", "spread"],
  runLabel: "Configure the deployment",
  honest: [
    "A Deployment declares 'run N copies'; a controller compares what exists with what was declared and creates or removes pods until they match. A rolling update replaces pods in batches: maxUnavailable pods may be down at once and maxSurge extra pods may be created above the target. The minimum availability during a rollout is (N − maxUnavailable) ÷ N.",
    "A readiness probe tells the Service when a new pod can take traffic; each batch then takes 30 s to become ready. Without one a pod is counted ready the moment it starts (8 s), so traffic reaches pods that are still booting and availability falls by 30% of the batch size as seen by users. The cluster has 3 nodes. By default the scheduler may put every replica on one node; with topology spread or anti-affinity the replicas are spread evenly, so losing a node loses at most ⌈N ÷ 3⌉ of them.",
    "Round figures for the shape of the behaviour, not a cluster benchmark.",
  ],
  init: () => ({ replicas: 6, maxUnavail: "25", maxSurge: "25", ready: false, spread: false }),
  controls: () => [
    { kind: "slider", id: "replicas", label: "Replicas", min: 1, max: 12, step: 1, fmt: "int" },
    { kind: "choice", id: "maxUnavail", label: "maxUnavailable", options: [{ id: "0", label: "0" }, { id: "25", label: "25%" }, { id: "50", label: "50%" }] },
    { kind: "choice", id: "maxSurge", label: "maxSurge", options: [{ id: "0", label: "0" }, { id: "25", label: "25%" }, { id: "50", label: "50%" }] },
    { kind: "toggle", id: "ready", label: "Readiness probe on the pods" },
    { kind: "toggle", id: "spread", label: "Spread replicas across nodes" },
  ],
  evaluate: (v) => {
    const r = k8sRun(Math.round(num(v, "replicas")), Number(str(v, "maxUnavail")) / 100, Number(str(v, "maxSurge")) / 100, bool(v, "ready"), bool(v, "spread"), 3);
    return {
      metrics: { minAvailability: r.minAvail, rolloutSec: r.roll, afterNodeLoss: r.afterLoss, unreadyTraffic: r.drop ? 1 : 0 },
      readouts: [
        { label: "Lowest availability during a rollout", value: r.minAvail, fmt: "pct", tone: toneLow(r.minAvail, 0.9, 0.7) },
        { label: "Rollout takes", value: r.roll, fmt: "s", tone: tone(r.roll, 90, 180) },
        { label: "Capacity left after losing a node", value: r.afterLoss, fmt: "pct", tone: toneLow(r.afterLoss, 0.6, 0.3) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Lowest availability in a rollout", value: r.minAvail, tone: toneLow(r.minAvail, 0.9, 0.7) }, { label: "After losing a node", value: r.afterLoss, tone: toneLow(r.afterLoss, 0.6, 0.3) }] },
      notes: [r.afterLoss <= 0 ? "Every replica was on the node that failed." : !bool(v, "ready") ? "Pods receive traffic before they are ready." : "Rolling, with the service staying up."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (!bool(v, "ready") && out.metrics.minAvailability! < 0.8) ev.push("outage-deploy");
    if (out.metrics.afterNodeLoss! <= 0) ev.push("lost-all");
    return ev;
  },
  scene: (n): SceneOut => (n === "rolling" ? { set: { maxUnavail: "25", maxSurge: "25" }, focus: ["maxUnavail", "maxSurge"] } : n === "readiness" ? { set: { ready: true }, focus: ["ready"] } : n === "spread" ? { set: { spread: true }, focus: ["spread"] } : undefined),
};

// ------------------------------------------------------------------ probes, limits and autoscaling

export function probeRun(memLimit: number, liveDelay: number, readiness: boolean, hpaTarget: number, minReplicas: number) {
  const peak = 600;
  const start = 40;
  const oom = memLimit < peak ? 1 : 0;
  const liveKill = liveDelay < start ? 1 : 0;
  const t = hpaTarget / 100;
  const demand = 400;
  const cap = minReplicas * 100 * t;
  const deficit = Math.max(0, demand - cap);
  const lag = deficit > 0 ? 45 + 40 : 0;
  let dropped = deficit * lag;
  if (!readiness && deficit > 0) dropped *= 1.4;
  const pods = Math.max(minReplicas, Math.ceil(demand / (100 * t)));
  return { oom, liveKill, dropped, pods, healthy: oom === 0 && liveKill === 0 ? 1 : 0 };
}

export const probesLab: LabModel = {
  id: "probes-lab",
  metrics: ["oomKills", "livenessKills", "droppedRequests", "peakPods", "basePods"],
  observes: ["crashloop", "spike-drops"],
  scenes: ["limits", "liveness", "hpa"],
  runLabel: "Configure the pod",
  honest: [
    "A pod runs an app that uses 600 MB of memory at peak and takes 40 s to start. A memory limit below the peak makes the kernel kill the container (OOMKilled) and Kubernetes restart it, over and over. A liveness probe that starts checking before the app has started (initial delay under 40 s) fails and kills a healthy container the same way.",
    "A horizontal pod autoscaler adds pods when average CPU use passes its target. Demand jumps from 100 to 400 requests a second, and each pod handles 100 at full use, or 100 × the target if you want headroom. Capacity before scaling is minimum replicas × 100 × the target. The autoscaler reacts after about 45 s of metrics and the new pods need 40 s to start, so for 85 s the shortfall is dropped. Without a readiness probe, traffic also reaches pods that are still starting, and drops are 40% worse.",
    "Round figures for the shape of the behaviour.",
  ],
  init: () => ({ memLimit: 256, liveDelay: 10, readiness: false, hpaTarget: 80, minReplicas: 1 }),
  controls: () => [
    { kind: "slider", id: "memLimit", label: "Memory limit", min: 128, max: 1024, step: 64, fmt: "int", hint: "MB" },
    { kind: "slider", id: "liveDelay", label: "Liveness probe initial delay", min: 0, max: 90, step: 5, fmt: "int", hint: "seconds" },
    { kind: "toggle", id: "readiness", label: "Readiness probe" },
    { kind: "slider", id: "hpaTarget", label: "Autoscaler CPU target", min: 30, max: 95, step: 5, fmt: "int", hint: "%" },
    { kind: "slider", id: "minReplicas", label: "Minimum replicas", min: 1, max: 8, step: 1, fmt: "int" },
  ],
  evaluate: (v) => {
    const r = probeRun(num(v, "memLimit"), num(v, "liveDelay"), bool(v, "readiness"), num(v, "hpaTarget"), Math.round(num(v, "minReplicas")));
    return {
      metrics: { oomKills: r.oom, livenessKills: r.liveKill, droppedRequests: r.dropped, peakPods: r.pods, basePods: Math.round(num(v, "minReplicas")) },
      readouts: [
        { label: "Killed for exceeding memory", value: r.oom ? "yes, every start" : "no", tone: r.oom ? "alert" : "ok" },
        { label: "Killed by an early liveness probe", value: r.liveKill ? "yes, every start" : "no", tone: r.liveKill ? "alert" : "ok" },
        { label: "Requests dropped in a spike", value: r.dropped, fmt: "int", tone: tone(r.dropped, 1000, 10000) },
        { label: "Pods at peak", value: r.pods, fmt: "int" },
      ],
      view: { kind: "bars", fmt: "int", max: 40000, bars: [{ label: "Dropped in the spike", value: r.dropped, tone: tone(r.dropped, 1000, 10000) }] },
      notes: [r.oom || r.liveKill ? "CrashLoopBackOff: the pod never stays up." : r.dropped > 10000 ? "The autoscaler is too slow for a jump this size." : "Stays up, and scales in time."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.oomKills! + out.metrics.livenessKills! > 0) ev.push("crashloop");
    if (out.metrics.droppedRequests! > 10000) ev.push("spike-drops");
    return ev;
  },
  scene: (n): SceneOut => (n === "limits" ? { set: { memLimit: 768 }, focus: ["memLimit"] } : n === "liveness" ? { set: { liveDelay: 60 }, focus: ["liveDelay"] } : n === "hpa" ? { set: { hpaTarget: 50, minReplicas: 3, readiness: true }, focus: ["hpaTarget", "minReplicas"] } : undefined),
};

export const C1_MODELS: LabModel[] = [isolationLab, imageLab, cacheLab, volumeLab, netLab, composeLab, k8sLab, probesLab];
