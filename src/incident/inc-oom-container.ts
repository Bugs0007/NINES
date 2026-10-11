/**
 * INC-0012 · CrashLoopBackOff.
 *
 * Release v2.4 added an in-process cache with no size limit. Each pod's memory climbs steadily and hits its 512 MiB
 * limit about every 30 seconds under load; the kernel kills it (exit 137, OOMKilled), Kubernetes restarts it, and it is
 * unavailable for about 20 s while it starts. Three pods are out of step, so roughly two of three are down at any
 * moment. Red herrings: a liveness probe that fails (a symptom) and a node with plenty of spare memory.
 * Pods are restarted by script events; the fix replaces them with pods that have a larger limit and a bounded cache.
 */
import type { ServerSpec, SimPatch, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const PODS = ["api-1", "api-2", "api-3"];
const SCRIPTED = [...PODS, "api-4", "api-5", "api-6", "api-7", "api-8"];

const pod = (id: string): ServerSpec => ({ kind: "server", id, label: id, cores: 2, workers: 16, steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.015, p99: 0.06 } }], bootS: 20 });

function spec(): SimSpec {
  const script: NonNullable<SimSpec["script"]> = [];
  SCRIPTED.forEach((id, i) => {
    for (let k = 0; k < 40; k++) script.push({ t: 12 + (i % 3) * 10 + k * 30, patch: { op: "restart", node: id }, note: "OOMKilled" });
  });
  script.sort((a, b) => a.t - b.t);
  return {
    nodes: [
      { kind: "client", id: "users", target: "lb", rate: { kind: "const", rps: 120 }, users: 6000, timeoutS: 5 },
      { kind: "lb", id: "lb", label: "Service (kube-proxy)", targets: PODS, algorithm: "round-robin", overhead: { kind: "const", value: 0.0003 } },
      ...PODS.map(pod),
    ],
    script,
  };
}

const STATIC: LogLine[] = [
  { t: -2400, host: "ci", source: "deploy", level: "INFO", text: "deploy api v2.4.0: adds in-process LRU 'ProductCache' (max_entries: unset)", evidence: "cache-no-limit" },
  { t: -1500, host: "node-a", source: "app", level: "INFO", text: "node memory 31% used, 5.4 GiB free of 7.8 GiB (no pressure)", evidence: "node-fine" },
  { t: -900, host: "api-1", source: "app", level: "WARN", text: "kubelet: Liveness probe failed: Get http://10.1.4.7:8080/healthz: connection refused (restart count 31)", evidence: "liveness" },
  { t: -600, host: "api-2", source: "app", level: "ERROR", text: "kubelet: Container api terminated: reason=OOMKilled exitCode=137 (memory limit 512Mi, last usage 511Mi)", evidence: "oomkilled" },
  { t: -300, host: "api-3", source: "app", level: "ERROR", text: "kubelet: Back-off restarting failed container api (CrashLoopBackOff), restarts 44", evidence: "oomkilled" },
  { t: -90, host: "api-1", source: "app", level: "WARN", text: "heap: ProductCache entries=412,880 (live set 497 MiB) - growing 17 MiB/s under load", evidence: "heap-growth" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 3 === 0) out.push({ t: w.t + rand(), host: PODS[Math.floor(rand() * 3)]!, source: "app", level: "ERROR", text: "kubelet: Container api terminated: reason=OOMKilled exitCode=137 (memory limit 512Mi); restarts " + (44 + Math.floor(w.t / 30)), evidence: "oomkilled" });
  if (Math.floor(w.t) % 4 === 0 && w.failed > 0) out.push({ t: w.t + 0.5, host: "lb", source: "alb", level: "ERROR", text: "upstream connect error: no healthy endpoints for 1 of 3 pods (connection refused)", evidence: "liveness" });
  return out;
}

/** New pods (bounded cache) join the service, then the crash-looping ones are removed. */
const replacePods = (launchAt: number, removeAt: number): { delay: number; patch: SimPatch }[] => [
  ...PODS.map((_, i) => ({ delay: launchAt, patch: { op: "launch", spec: pod("fix-" + (i + 1)), lb: "lb", bootS: 20 } as SimPatch })),
  ...PODS.map((id) => ({ delay: removeAt, patch: { op: "remove", node: id } as SimPatch })),
];

const replaced = (s: { applied: string[] }) => s.applied.includes("raise-limit") || s.applied.includes("rollback");

export const INC_OOM: Incident = {
  id: "inc-oom-container",
  code: "INC-0012",
  title: "CrashLoopBackOff",
  severity: "SEV-2",
  clock0: "09:30:00",
  pageAt: 90,
  page: { title: "API returning 502s; pods restarting every 30 seconds", detail: "All three API pods show CrashLoopBackOff with restart counts above 30. The node has plenty of free memory." },
  intro: [
    { speaker: "pager", line: "SEV-2: API unavailable about two-thirds of the time. Pods keep restarting." },
    { speaker: "meera", line: "A pod that dies on a schedule is being killed by something. Read why before you restart anything." },
  ],
  spec: spec(),
  seed: "inc-oom-container",
  service: "the API",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "OOM kills are scripted at a fixed 30 s interval per pod. In reality the interval depends on load: the heavier the traffic, the faster the cache grows and the sooner each pod is killed.",
    "Replacement pods are new ids with a bounded cache; in a real cluster the ReplicaSet rolls them in one at a time.",
  ],
  hosts: ["node-a", ...PODS],
  services: ["kube-proxy", ...PODS],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("api pods", [...PODS, "api-4", "api-5", "api-6", "fix-1", "fix-2", "fix-3"], (id, nw) => (!nw.up ? "oomkilled" : undefined), tierMap(PODS, {})),
  commands: [
    {
      cmd: "kubectl get pods -l app=api",
      describe: "pod status and restart counts",
      run: (h, s) => ({ out: replaced(s) ? "NAME       READY  STATUS   RESTARTS  AGE\nfix-1      1/1    Running  0         1m\nfix-2      1/1    Running  0         1m\nfix-3      1/1    Running  0         1m" : "NAME       READY  STATUS             RESTARTS  AGE\napi-1      0/1    CrashLoopBackOff   46        41m\napi-2      1/1    Running            45        41m\napi-3      0/1    OOMKilled          44        41m", evidence: replaced(s) ? undefined : "oomkilled" }),
    },
    {
      cmd: "kubectl describe pod api-3 | grep -A6 'Last State'",
      describe: "why the last container died",
      run: (h, s) => ({ out: replaced(s) ? "(pod is new: no previous state)" : "Last State:  Terminated\n  Reason:    OOMKilled\n  Exit Code: 137\nLimits:  memory: 512Mi\nRequests: memory: 256Mi", evidence: replaced(s) ? undefined : "oomkilled" }),
    },
    {
      cmd: "kubectl top pod -l app=api",
      describe: "current memory by pod",
      run: (h, s) => ({ out: replaced(s) ? "fix-1  41m  210Mi\nfix-2  38m  204Mi\nfix-3  44m  208Mi" : "api-1  120m  498Mi\napi-2  131m  367Mi\napi-3  118m  508Mi\n(limit 512Mi; each pod climbs to the limit and dies)", evidence: replaced(s) ? undefined : "heap-growth" }),
    },
    { cmd: "git log -3 --oneline -- src/cache.py", describe: "recent changes to the cache code", run: () => ({ out: "9be41a2 v2.4: add ProductCache (LRU, max_entries unset => unbounded)\n0c33d10 v2.3: refactor", evidence: "cache-no-limit" }) },
    { cmd: "kubectl top node", describe: "node memory", run: () => ({ out: "node-a  412m  21%  2.4Gi  31%", evidence: "node-fine" }) },
    uptime((h) => (h.startsWith("api") ? 1.4 : 0.5)),
    free((h) => (h.startsWith("api") ? 470 : 2400)),
    df(),
  ],
  evidence: [
    { id: "oomkilled", label: "Containers end with OOMKilled, exit code 137, at the 512 MiB limit", key: true },
    { id: "heap-growth", label: "Memory grows steadily to the limit in each pod", key: true },
    { id: "cache-no-limit", label: "v2.4 added an in-process cache with no size limit", key: true },
    { id: "liveness", label: "Liveness probes fail on restarting pods", key: false },
    { id: "node-fine", label: "The node has plenty of free memory", key: false },
  ],
  hypotheses: [
    { id: "leak", label: "An unbounded cache grows each pod's memory to its limit, and the kernel kills the container, over and over", correct: true },
    { id: "probe", label: "The liveness probe is too strict and kills healthy pods", correct: false },
    { id: "node", label: "The node is out of memory", correct: false },
    { id: "cpu", label: "The pods are CPU-starved and fail health checks", correct: false },
    { id: "net", label: "A cluster networking problem is dropping traffic", correct: false },
  ],
  mitigations: [
    {
      id: "raise-limit",
      label: "Cap the cache at 20,000 entries and raise the pod memory limit to 1 GiB",
      detail: "A bounded cache stops the growth; the larger limit gives headroom.",
      takesS: 45,
      kind: "fix",
      patches: () => replacePods(45, 70),
      note: "deployment api: CACHE_MAX_ENTRIES=20000, resources.limits.memory=1Gi. New pods rolled in; old pods terminated.",
    },
    {
      id: "rollback",
      label: "Roll back to v2.3.2 (no cache)",
      detail: "Previous image has no in-process cache.",
      takesS: 40,
      kind: "mitigate",
      patches: () => replacePods(40, 65),
      note: "kubectl rollout undo deployment/api. v2.3.2 pods are stable at 180 MiB.",
    },
    { ...decoy("scale-pods", "Scale the deployment to 6 replicas", "More pods to share the load.", "replicas 3 -> 6. The new pods run the same image and are OOMKilled on the same schedule.", 20, "harmful"), patches: () => ["api-4", "api-5", "api-6"].map((id) => ({ delay: 20, patch: { op: "launch" as const, spec: pod(id), lb: "lb", bootS: 20 } })) },
    decoy("loosen-probe", "Relax the liveness probe (failureThreshold 10)", "Give pods more time before restarting.", "Probe relaxed. The pods are not being killed by the probe; the kernel kills them first.", 20),
    decoy("add-node", "Add a bigger node to the cluster", "More node memory.", "node-b joining. The pod limit is 512 MiB regardless of how much the node has.", 120),
    decoy("delete-pods", "Delete the crashing pods so they restart clean", "kubectl delete pod -l app=api.", "Pods recreated. They reach 512 MiB again in about 30 seconds.", 20),
  ],
  traces: [
    {
      id: "dead",
      title: "GET /products/118 · 502 · kube-proxy",
      status: 502,
      evidence: "oomkilled",
      spans: [
        { name: "kube-proxy → api-3 (container restarting)", start: 0, ms: 5000, depth: 0, kind: "net" },
        { name: "connect: connection refused", start: 2, ms: 3, depth: 1, kind: "net" },
      ],
    },
    {
      id: "ok",
      title: "GET /products/118 · 200 · api-2 (first 20 seconds after start)",
      status: 200,
      spans: [
        { name: "kube-proxy → api-2", start: 0, ms: 22, depth: 0, kind: "net" },
        { name: "handler + ProductCache (hit)", start: 2, ms: 3, depth: 1, kind: "cache" },
      ],
    },
  ],
  timeline: [
    { t: -2400, label: "deploy api v2.4.0 (adds ProductCache)", kind: "deploy" },
    { t: -900, label: "first OOMKilled", kind: "scale" },
    { t: 90, label: "Page: API 502s", kind: "page" },
  ],
  extraSeries: [{ id: "mem", label: "Pod memory (percent of limit)", unit: "%", at: (t) => ((((t % 30) + 30) % 30) / 30) * 100 }],
  evidenceVia: ["oomkilled", "heap-growth", "node-fine", "liveness"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: about two-thirds of API requests failing, and for how long" },
      { id: "cause", criterion: "Root cause: v2.4's unbounded in-process cache grew each pod to its 512 MiB limit; the container was OOMKilled (137) and restarted repeatedly" },
      { id: "detect", criterion: "Why the symptoms misled: the node had plenty of memory and the liveness probe failed, but the probe was a symptom of the restarts, not the cause" },
      { id: "prevent", criterion: "Prevention: bound caches, set requests and limits from measured usage, test memory under load before release, alert on restart count and OOMKilled" },
      { id: "mitigate", criterion: "States what worked (rollback, or a bounded cache with a higher limit) and why scaling out or relaxing the probe did not" },
    ],
    exemplar:
      "What happened: From 09:31 to about 09:40, about two-thirds of API requests returned 502 while pods cycled through CrashLoopBackOff. Root cause: release v2.4 added an in-process product cache with no size bound; under load each pod's memory reached its 512 MiB limit in about 30 seconds and the kernel killed it (exit 137). The node had spare memory and the liveness probe failures were a consequence. Mitigation: bounding the cache and raising the limit, or rolling back to v2.3.2, gave stable pods; adding replicas just added more pods that crashed. Prevention: bound every in-process cache, size limits from load tests, and alert on restart counts and OOMKilled events.",
  },
  hints: [
    "Pods are restarting. Ask Kubernetes why the last container ended.",
    "The node has plenty of free memory, so what has a memory limit of its own?",
    "What did the latest release change about how the process uses memory?",
  ],
  exercises: ["kubernetes-probes-scaling"],
};
