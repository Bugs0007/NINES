import { definePack } from "../define";

export const MO = { start: { limit: "2", swap: false, protect: false } };
export const MO_CHALLENGE = { start: { limit: "none", swap: false, protect: false } };

const PROC_MAN = { id: "proc-man", title: "Linux man-pages: proc(5) (oom_score, oom_score_adj)", url: "https://man7.org/linux/man-pages/man5/proc.5.html" };
const CGROUP_V2 = { id: "cgroup-v2", title: "Linux kernel docs: Control Group v2 (memory.max, memory.high and the cgroup OOM killer)", url: "https://docs.kernel.org/admin-guide/cgroup-v2.html" };
const K8S_QOS = { id: "k8s-qos", title: "Kubernetes docs: Pod Quality of Service classes (eviction and OOM order)", url: "https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/" };

export default definePack({
  id: "memory-oom",
  title: "Memory & the OOM Killer",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "db-1 · postgres terminated by signal 9", detail: "kernel: Out of memory: Killed process 2211 (postgres)" },
    lines: [
      { speaker: "kabir", line: "The database was killed at 4 a.m., though a background worker was the one leaking." },
      { speaker: "meera", line: "When memory runs out the kernel kills the process with the highest badness, which is usually the biggest, not the guilty. Decide in advance who goes first." },
    ],
  },
  predictions: [
    {
      id: "db",
      kind: "choice",
      prompt: "An 8 GB node runs a 3.5 GB database, a 1 GB cache and 1 GB of system. A worker with no limit leaks 0.5 GB an hour. At hour 5 the node is out of memory. What does the OOM killer pick?",
      options: [
        { id: "worker", label: "The worker, because it is leaking" },
        { id: "db", label: "The database, because it is using the most memory" },
        { id: "nothing", label: "Nothing, the kernel uses swap" },
      ],
      answer: "db",
      observe: "db-dies",
      reveal: {
        text: "The kernel scores each process mainly by its memory use, and at hour 5 the worker holds 2.5 GB against the database's 3.5 GB. It kills the database, the process that has done nothing wrong. A limit on the worker kills only the worker at its limit. The score can also be adjusted per process to protect what matters.",
        derived: true,
        line: { speaker: "rao", line: "The kernel does not know who is at fault. It knows who is big." },
      },
    },
    {
      id: "swap",
      kind: "choice",
      prompt: "You add 4 GB of swap to the node so it can survive the leak. What happens over the next day?",
      options: [
        { id: "fine", label: "The node is fine, swap buys time" },
        { id: "crawl", label: "It buys 8 hours of leaking, all spent crawling, and then the same kill" },
        { id: "fixed", label: "The leak stops being a problem" },
      ],
      answer: "crawl",
      observe: "thrash",
      reveal: {
        text: "At 0.5 GB an hour, 4 GB of swap is 8 more hours. During them the working set no longer fits in memory and every page fault waits for a disk, so requests take seconds. Then swap fills and the kill happens anyway. Swap delays the failure and makes it slow.",
        derived: true,
        line: { speaker: "meera", line: "A fast, clean failure beats a slow, confusing one." },
      },
    },
  ],
  widget: { id: "oom-lab", config: MO },
  mechanism: [
    {
      id: "memory",
      text: "Linux hands out memory it may not have. When the machine truly runs out and cannot free enough cache, the out-of-memory killer picks a process and kills it with SIGKILL, so no handler runs. The choice is by a badness score, mostly the share of memory used, adjusted by oom_score_adj. It is a blunt last resort.",
      sourceIds: ["proc-man"],
    },
    {
      id: "cgroup",
      scene: "cgroup",
      text: "A memory limit on a control group changes the question. When a container exceeds its limit, the kernel kills a process inside that group and leaves the rest of the node alone. A leaking worker with a 2 GB limit dies at 2 GB and restarts, and the database never feels it.",
      sourceIds: ["cgroup-v2"],
    },
    {
      id: "swap",
      scene: "swap",
      text: "Swap moves memory pages to disk. A little helps with rarely used pages, and a lot hides a leak while the machine slows down. When the working set does not fit in RAM the node thrashes, moving pages. Many production systems run with little or no swap, so failure comes quickly.",
      sourceIds: ["proc-man"],
    },
    {
      id: "protect",
      scene: "protect",
      text: "Protect what matters. Lower oom_score_adj for the database so the kernel prefers other victims, or use Kubernetes quality-of-service classes: pods whose requests equal their limits are the last to be evicted or killed, and pods with no requests the first. Then fix the leak, because restarts only hide it and memory growth is a sign.",
      sourceIds: ["k8s-qos", "proc-man"],
    },
  ],
  challenges: [
    {
      id: "contain-leak",
      title: "Contain the leak",
      brief: "Never kill the database, never let the node thrash, and keep worker restarts to 6.5 a day or fewer. The worker has no memory limit today.",
      line: { speaker: "rao", line: "Let the leaker die. Leave the database alone." },
      widget: { id: "oom-lab", config: MO_CHALLENGE },
      conditions: [
        { metric: "dbKilled", op: "<=", value: 0, label: "Database never killed" },
        { metric: "thrashHours", op: "<=", value: 0, label: "No swap thrashing" },
        { metric: "workerRestartsPerDay", op: "<=", value: 6.5, label: "At most 6.5 worker restarts a day" },
      ],
      stars: [{ metric: "workerRestartsPerDay", op: "<=", value: 5, label: "At most 5 worker restarts a day" }],
      hints: ["Who does the kernel kill without a limit?", "What does swap do to the node?", "What are two ways to point the kill at the worker?"],
    },
  ],
  explainBack: {
    prompt: "Explain what the OOM killer does and how to make it harmless.",
    rubric: [
      { id: "killer", criterion: "When memory runs out the kernel kills the process with the highest badness score, mostly the biggest, with SIGKILL, regardless of who is at fault", keyIdea: "biggest, not guilty" },
      { id: "limits", criterion: "Memory limits per container or cgroup localise the damage: the offender is killed at its limit and restarted", keyIdea: "cgroup limits" },
      { id: "protect", criterion: "Protect critical processes with oom_score_adj or QoS, avoid relying on swap, and fix the leak", keyIdea: "protect, fail fast, fix the leak" },
    ],
    exemplar:
      "When memory runs out the kernel kills the process with the highest badness score, which is mostly the biggest, with SIGKILL, regardless of who is at fault. Memory limits per container localise the damage, so the offender is killed at its limit and restarted without touching its neighbours. I would also protect critical processes with oom_score_adj or QoS, avoid leaning on swap so failure is fast, and fix the leak, since restarts only hide it.",
  },
  reviews: [
    {
      id: "mo-est",
      format: "estimate",
      scenario: "A worker leaks 0.5 GB an hour and has a 2 GB limit. How many hours between restarts?",
      unit: "hours",
      answer: 4,
      acceptFactor: 1.05,
      breakdown: ["2 GB ÷ 0.5 GB an hour = 4 hours", "six restarts a day"],
      explain: "A limit gives you a restart cadence you can predict and alert on.",
    },
    {
      id: "mo-pick",
      format: "pick-fix",
      scenario: "A container exits with code 137 every few hours, but the host has plenty of free memory. What is the likely cause?",
      options: [
        { id: "a", label: "The container exceeded its own memory limit and was killed by its cgroup" },
        { id: "b", label: "The host ran out of disk" },
        { id: "c", label: "A network timeout" },
        { id: "d", label: "The image is too large" },
      ],
      answer: "a",
      explain: "137 is 128 plus 9, so SIGKILL. With free host memory it is the container's own limit that was hit.",
    },
    {
      id: "mo-order",
      format: "order",
      scenario: "Order these by worker restarts a day, most first.",
      items: [
        { id: "l1", label: "1 GB cgroup limit" },
        { id: "l2", label: "2 GB cgroup limit" },
        { id: "protect", label: "No limit, database protected" },
        { id: "swap", label: "No limit, 4 GB swap, database protected" },
      ],
      answer: ["l1", "l2", "protect", "swap"],
      explain: "12, 6, 4.8 and 1.85 a day. The last one looks best on restarts and spends eight hours a day crawling.",
    },
    {
      id: "mo-graph",
      format: "predict-graph",
      scenario: "As the worker's memory limit rises from 0.5 GB to 4 GB, how does the number of worker restarts per day change?",
      xLabel: "limit →",
      yLabel: "restarts a day",
      options: [
        { id: "fall", label: "Falls, then levels at the node-pressure point", points: [48, 24, 16, 12, 9.6, 6, 4.8, 4.8] },
        { id: "rise", label: "Rises with the limit", points: [4.8, 6, 9.6, 12, 16, 24, 36, 48] },
        { id: "flat", label: "Stays the same", points: [12, 12, 12, 12, 12, 12, 12, 12] },
      ],
      answer: "fall",
      explain: "A bigger limit means a longer time between restarts. Above 2.5 GB the node runs out first and the limit no longer matters.",
    },
    {
      id: "mo-flaw",
      format: "spot-flaw",
      scenario: "A node runs a database and a leaking batch job with no memory limit on either. The team adds swap so it 'stops crashing'. Tap the part that makes things worse.",
      diagram: {
        nodes: [
          { id: "job", label: "leaking batch job, no limit", kind: "worker", col: 0, row: 1 },
          { id: "swap", label: "swap: spill to disk", kind: "store", col: 1, row: 1 },
          { id: "db", label: "database, now slow", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "job", to: "swap" },
          { from: "swap", to: "db" },
        ],
      },
      answer: "swap->db",
      explain: "When the node pages heavily the database's own pages get swapped too, and every query waits for the disk. The crash is replaced by a slowdown that touches everything.",
    },
    {
      id: "mo-explain",
      format: "explain",
      scenario: "In two sentences: why is a container memory limit a better failure than a node running out of memory?",
      rubric: [
        { id: "local", criterion: "The kernel kills a process in the container that exceeded its limit, and other workloads on the node are not affected" },
        { id: "predict", criterion: "It happens at a known threshold and is easy to alert on and automate, where a node-wide OOM picks a victim by size at an unpredictable time" },
      ],
      exemplar: "The kernel kills a process in the container that exceeded its limit, and other workloads on the node are not affected. It happens at a known threshold, so it is easy to alert on and automate, where a node-wide OOM picks a victim by size at an unpredictable time.",
      explain: "Make the failure small, local and predictable.",
    },
  ],
  codex: {
    oneLiner: "The OOM killer picks the biggest process, not the guilty one. Use per-container limits, protect the database, avoid leaning on swap, and fix the leak.",
    keyNumbers: [
      { label: "Exit code for SIGKILL", value: "137", sourceId: "cgroup-v2" },
      { label: "Worker with a 2 GB limit and 0.5 GB/h leak (lab)", value: "restart every 4 h", sourceId: "cgroup-v2" },
    ],
    tradeoffs: [
      { choice: "Memory limits", gain: "Local, predictable kills", cost: "OOM kills if set below the peak" },
      { choice: "Swap", gain: "Absorbs short spikes", cost: "Thrashing hides leaks and slows everything" },
      { choice: "oom_score_adj / QoS", gain: "Protects critical processes", cost: "Others are killed first" },
    ],
    seenIn: ["Kubernetes OOMKilled pods and exit code 137.", "dmesg lines: 'Out of memory: Killed process'."],
    interviewAngle: "Say: 'the OOM killer picks by size; per-cgroup limits make it local; protect the critical process; fail fast and fix the leak'.",
    aws: [{ concept: "Memory limits", service: "ECS task memory hard limit; EKS pod limits" }],
    replay: { id: "oom-lab", config: MO, scene: "protect" },
  },
  interview: [
    "What does the OOM killer do and how does it choose?",
    "What does exit code 137 mean?",
    "Should a production server have swap?",
  ],
  deeper: [
    {
      title: "Memory is more than the heap",
      body: "A process's resident memory includes its heap, stacks, loaded libraries, memory-mapped files and kernel buffers it caused. A runtime may hold memory it has freed, so the number in a monitor can exceed what the program uses. Measure resident and working-set size, set limits above the observed peak with margin, and alert when use trends up between restarts.",
      sourceIds: ["proc-man"],
    },
  ],
  honestPhysics: [
    "An 8 GB node runs a 3.5 GB database, a 1 GB cache and 1 GB of system, leaving 2.5 GB for a worker that leaks 0.5 GB an hour. Without a limit the node runs out at hour 5 and the kernel kills the largest process, the database, unless it is protected; then the worker is killed.",
    "A cgroup limit L kills the worker when it reaches L (a restart every L ÷ 0.5 hours). 4 GB of swap adds 8 hours of leaking at a crawl before the same kill. Round figures.",
  ],
  sources: [PROC_MAN, CGROUP_V2, K8S_QOS],
  verify: [
    { id: "db-dies", claim: "With no limit the database is killed", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: {}, metric: "dbKilled" }, expect: { min: 1 } },
    { id: "limit2", claim: "A 2 GB limit restarts the worker six times a day", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { limit: "2" }, metric: "workerRestartsPerDay" }, expect: { min: 5.9, max: 6.1 } },
    { id: "limit2-db", claim: "…and the database is safe", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { limit: "2" }, metric: "dbKilled" }, expect: { max: 0 } },
    { id: "swap", claim: "Swap adds 8 hours of thrashing", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { swap: true }, metric: "thrashHours" }, expect: { min: 8, max: 8 } },
    { id: "protect", claim: "Protecting the database kills the worker every 5 hours instead", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { protect: true }, metric: "workerRestartsPerDay" }, expect: { min: 4.7, max: 4.9 } },
    { id: "limit4", claim: "A 4 GB limit is above the node's headroom and still kills the database", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { limit: "4" }, metric: "dbKilled" }, expect: { min: 1 } },
    { id: "limit1", claim: "A 1 GB limit restarts the worker twelve times a day, over the limit", run: "lab", params: { model: "oom-lab", config: MO_CHALLENGE, values: { limit: "1" }, metric: "workerRestartsPerDay" }, expect: { min: 11.9, max: 12.1 } },
  ],
});
