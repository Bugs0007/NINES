import { definePack } from "../define";

export const CB = { start: { pid: true, mnt: true, mem: true, cpu: true, pids: true, user: false, sec: false, ro: false } };
export const CB_CHALLENGE = { start: { pid: false, mnt: false, mem: false, cpu: false, pids: false, user: false, sec: false, ro: false } };

const NS_MAN = { id: "namespaces-man", title: "Linux man-pages: namespaces(7)", url: "https://man7.org/linux/man-pages/man7/namespaces.7.html" };
const CGROUPS = { id: "cgroup-v2", title: "Linux kernel docs: Control Group v2", url: "https://docs.kernel.org/admin-guide/cgroup-v2.html" };
const DOCKER_SEC = { id: "docker-security", title: "Docker docs: Security (namespaces, control groups, seccomp, user namespaces)", url: "https://docs.docker.com/engine/security/" };

export default definePack({
  id: "container-basics",
  title: "What a Container Actually Is",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "host · load 212, free memory 0, 9 containers unresponsive", detail: "one container's job leaked memory" },
    lines: [
      { speaker: "kabir", line: "One container ate the whole machine and took nine others down with it. I thought containers were isolated." },
      { speaker: "meera", line: "A container is a normal process with a restricted view. Isolation is a list of kernel switches, and you only get the ones you turn on." },
    ],
  },
  predictions: [
    {
      id: "runaway",
      kind: "choice",
      prompt: "A container has its own process, mount and network views but no memory or CPU limits. A job inside leaks 16 GB on a host with 12 GB free. How much host memory can it take?",
      options: [
        { id: "05", label: "About 0.5 GB, the container is isolated" },
        { id: "4", label: "About 4 GB, a fair share" },
        { id: "12", label: "All 12 GB, until the host runs out" },
      ],
      answer: "12",
      observe: "runaway",
      reveal: {
        text: "Namespaces control what a process can see, not what it can use. Without a control group limit it draws on host memory like any other process until the host's out-of-memory killer picks a victim, which may not be the leaker. A 512 MB limit stops the leak at 0.5 GB and kills only that container.",
        derived: true,
        line: { speaker: "rao", line: "Seeing and using are different switches." },
      },
    },
    {
      id: "sees",
      kind: "choice",
      prompt: "A container has memory, CPU and process-count limits but shares the host's process and mount views. How many host processes can it see?",
      options: [
        { id: "3", label: "Only its own, about 3" },
        { id: "50", label: "About 50" },
        { id: "312", label: "All of the host's 312" },
      ],
      answer: "312",
      observe: "sees-host",
      reveal: {
        text: "Limits and views are separate features. Without a process namespace, the container's processes share the host's process table and can list, and with enough privilege signal, everything. Without a mount namespace it sees the host's 18,400 files. Both are one-line options, and neither is implied by the other.",
        derived: true,
        line: { speaker: "meera", line: "Resource limits do not hide anything." },
      },
    },
  ],
  widget: { id: "isolation-lab", config: CB },
  mechanism: [
    {
      id: "process",
      text: "A container is not a small virtual machine. It is a process, or a few, running on the host's kernel, started with restrictions. There is no second operating system: the container shares the host's kernel, which is why it starts in milliseconds and also why a kernel vulnerability affects every container on the host.",
      sourceIds: ["docker-security"],
    },
    {
      id: "namespaces",
      scene: "namespaces",
      text: "Namespaces limit what a process can see. A process namespace gives it its own process numbering and hides the host's, a mount namespace gives it its own filesystem tree, a network namespace gives it its own interfaces and ports, and a user namespace maps its users to different ones outside. Each is a separate switch.",
      sourceIds: ["namespaces-man"],
    },
    {
      id: "cgroups",
      scene: "cgroups",
      text: "Control groups limit what a process can use: memory, CPU time, number of processes, disk and network bandwidth. When a container exceeds its memory limit the kernel kills it, not its neighbours. Without limits, one container can starve the rest, which is the usual cause of one bad container taking a host down.",
      sourceIds: ["cgroup-v2"],
    },
    {
      id: "hardening",
      scene: "hardening",
      text: "Because the kernel is shared, harden the boundary. Run as a non-root user, map the container's root to an unprivileged host user with a user namespace, filter system calls with seccomp, drop capabilities and mount the root filesystem read-only. Each costs some compatibility, so enable what the workload tolerates and test it.",
      sourceIds: ["docker-security"],
    },
  ],
  challenges: [
    {
      id: "isolate",
      title: "Isolate the process",
      brief: "See at most 5 host processes and 100 host files, let a leak take at most 1 GB, slow neighbours at most 1.2×, contain a fork bomb, keep breakout risk at or below 5 per 100, and spend no more than 1.5 compatibility units.",
      line: { speaker: "rao", line: "Everything contained, nothing broken." },
      widget: { id: "isolation-lab", config: CB_CHALLENGE },
      conditions: [
        { metric: "visibleProcs", op: "<=", value: 5, label: "At most 5 host processes visible" },
        { metric: "hostFiles", op: "<=", value: 100, label: "At most 100 host files visible" },
        { metric: "hostMemGB", op: "<=", value: 1, label: "A leak takes at most 1 GB" },
        { metric: "neighbourSlowdown", op: "<=", value: 1.2, label: "Neighbours slowed at most 1.2×" },
        { metric: "forkBombContained", op: ">=", value: 1, label: "A fork bomb is contained" },
        { metric: "escapeRisk", op: "<=", value: 5, label: "At most 5 host compromises per 100 breakouts" },
        { metric: "compatIssues", op: "<=", value: 1.5, label: "At most 1.5 compatibility units" },
      ],
      stars: [{ metric: "escapeRisk", op: "<=", value: 2, label: "At most 2 per 100 breakouts" }],
      hints: ["Which switches control seeing, and which control using?", "Which hardening option is the biggest single cut in risk?", "You cannot afford all the hardening options at once."],
    },
  ],
  explainBack: {
    prompt: "Explain what a container is and what isolates it.",
    rubric: [
      { id: "process", criterion: "A container is a process on the host's kernel with restrictions, not a virtual machine with its own kernel", keyIdea: "a process, not a VM" },
      { id: "kernel", criterion: "Namespaces limit what it sees (processes, filesystem, network, users) and control groups limit what it uses (memory, CPU, process count)", keyIdea: "namespaces see, cgroups use" },
      { id: "harden", criterion: "A shared kernel means hardening matters: non-root or user namespaces, seccomp, dropped capabilities and read-only filesystems", keyIdea: "harden the boundary" },
    ],
    exemplar:
      "A container is a process, or a few, running on the host's kernel with restrictions, not a virtual machine with its own kernel. Namespaces limit what it can see: processes, filesystem, network and users. Control groups limit what it can use, such as memory, CPU and process count. Because the kernel is shared I would also harden the boundary with a non-root user or user namespace, seccomp, dropped capabilities and a read-only filesystem.",
  },
  reviews: [
    {
      id: "cb-est",
      format: "estimate",
      scenario: "A host has 12 GB free. A container with a 512 MB memory limit leaks 16 GB. How much memory does the host lose before the leaker is killed, in MB?",
      unit: "MB",
      answer: 512,
      acceptFactor: 1.05,
      breakdown: ["The cgroup limit is 512 MB", "the kernel kills the container when it passes that"],
      explain: "The limit caps the damage at the limit, whatever the program tries to take.",
    },
    {
      id: "cb-pick",
      format: "pick-fix",
      scenario: "A container runs as root with all default capabilities, and a kernel bug lets it escape. Which change most reduces what an escaped process can do on the host?",
      options: [
        { id: "a", label: "A user namespace, so root inside the container is an unprivileged user outside" },
        { id: "b", label: "A larger memory limit" },
        { id: "c", label: "A different image tag" },
        { id: "d", label: "More replicas" },
      ],
      answer: "a",
      explain: "If the process breaks out it is still an unprivileged user on the host. That cuts the damage without trying to prevent the bug.",
    },
    {
      id: "cb-order",
      format: "order",
      scenario: "Order these by the number of host files the container can see, most first.",
      items: [
        { id: "none", label: "No mount namespace" },
        { id: "ns", label: "Mount namespace, image filesystem" },
        { id: "ro", label: "Mount namespace, read-only image with no extra mounts" },
      ],
      answer: ["none", "ns", "ro"],
      explain: "18,400 host files, then 12, then a smaller read-only subset of those 12. The ordering of the last two is by what the container can do with them.",
    },
    {
      id: "cb-graph",
      format: "predict-graph",
      scenario: "As you turn on isolation switches one at a time (namespaces first, then cgroups, then hardening), how does the host-compromise risk per 100 kernel breakouts change?",
      xLabel: "switches turned on →",
      yLabel: "compromises per 100",
      options: [
        { id: "flat-then", label: "Stays at 30 until the hardening switches, then falls", points: [30, 30, 30, 30, 30, 3, 1.2, 1] },
        { id: "linear", label: "Falls steadily with each switch", points: [30, 26, 22, 18, 14, 10, 6, 2] },
        { id: "first", label: "Falls to near zero after namespaces", points: [30, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "flat-then",
      explain: "Namespaces and cgroups prevent accidents and limit visibility. A kernel breakout is stopped by user namespaces, seccomp and a read-only filesystem.",
    },
    {
      id: "cb-flaw",
      format: "spot-flaw",
      scenario: "A team runs a risky third-party converter in a container without a process-count limit, believing the container 'sandboxes' it. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "job", label: "converter job", kind: "worker", col: 0, row: 1 },
          { id: "ctr", label: "container: no pids limit", kind: "server", col: 1, row: 1 },
          { id: "host", label: "shared host kernel", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "job", to: "ctr" },
          { from: "ctr", to: "host" },
        ],
      },
      answer: "ctr->host",
      explain: "A fork bomb exhausts the host's process table, which the container shares. A pids limit in the cgroup keeps it inside.",
    },
    {
      id: "cb-explain",
      format: "explain",
      scenario: "In two sentences: why do containers start faster than virtual machines, and what do they give up?",
      rubric: [
        { id: "fast", criterion: "A container is a process on the running kernel, with no operating system to boot" },
        { id: "give", criterion: "It shares the host kernel, so isolation is weaker than a VM's: a kernel vulnerability can cross the boundary" },
      ],
      exemplar: "A container is a process on the already-running kernel, so there is no operating system to boot. It gives up the stronger boundary of a VM because it shares the host kernel, so a kernel vulnerability can cross it.",
      explain: "Speed and weaker isolation have the same cause.",
    },
  ],
  codex: {
    oneLiner: "A process on the host kernel with restrictions: namespaces limit what it sees, cgroups what it uses, and hardening what a breakout can do.",
    keyNumbers: [
      { label: "Host processes visible with and without a process namespace (lab)", value: "3 vs 312", sourceId: "namespaces-man" },
      { label: "Leak with and without a memory limit (lab)", value: "0.5 GB vs 12 GB", sourceId: "cgroup-v2" },
    ],
    tradeoffs: [
      { choice: "Containers", gain: "Fast start, density, shared kernel efficiency", cost: "Weaker isolation than a VM" },
      { choice: "User namespaces and seccomp", gain: "Cut breakout damage", cost: "Compatibility issues to test" },
      { choice: "No resource limits", gain: "Nothing to tune", cost: "One container can starve a host" },
    ],
    seenIn: ["Docker, containerd and Kubernetes nodes.", "gVisor and Firecracker where stronger isolation is needed."],
    interviewAngle: "Say: 'a container is a process with namespaces to limit what it sees and cgroups to limit what it uses, on a shared kernel, so I set limits and harden'.",
    aws: [{ concept: "Stronger isolation", service: "AWS Fargate (Firecracker microVMs)" }],
    replay: { id: "isolation-lab", config: CB, scene: "hardening" },
  },
  interview: [
    "What is a container, and how is it different from a VM?",
    "What are namespaces and cgroups?",
    "How would you run untrusted code in a container?",
  ],
  deeper: [
    {
      title: "When a container is not enough",
      body: "For code from strangers, the shared kernel is too thin a wall. Use a sandboxed runtime that intercepts system calls in user space, such as gVisor, or a lightweight virtual machine per workload, such as Firecracker. You pay in start-up time and some performance for a boundary that a kernel bug does not cross.",
      sourceIds: ["docker-security"],
    },
  ],
  honestPhysics: [
    "A process namespace shows a container 3 processes instead of the host's 312, and a mount namespace gives it its own 12 files instead of the host's 18,400. A 512 MB memory limit stops a 16 GB leak at 0.5 GB instead of the 12 GB the host has free, and a one-core CPU limit keeps a spinning process to a 1.1× slowdown for neighbours instead of 6×.",
    "A user namespace multiplies breakout risk by 0.1, seccomp by 0.4 and a read-only filesystem by 0.8, from a baseline of 30 host compromises per 100 breakouts of that kind. They cost 1, 0.5 and 1 compatibility units. Round figures.",
  ],
  sources: [NS_MAN, CGROUPS, DOCKER_SEC],
  verify: [
    { id: "visible", claim: "Without a process namespace a container sees 312 host processes", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: {}, metric: "visibleProcs" }, expect: { min: 312, max: 312 } },
    { id: "ns", claim: "With one it sees 3", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { pid: true }, metric: "visibleProcs" }, expect: { min: 3, max: 3 } },
    { id: "leak", claim: "Without a memory limit a leak takes 12 GB", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { pid: true, mnt: true }, metric: "hostMemGB" }, expect: { min: 12, max: 12 } },
    { id: "limit", claim: "With one it takes 0.5 GB", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { mem: true }, metric: "hostMemGB" }, expect: { min: 0.49, max: 0.51 } },
    { id: "user", claim: "A user namespace cuts breakout risk to 3 per 100", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { user: true }, metric: "escapeRisk" }, expect: { min: 2.9, max: 3.1 } },
    { id: "all", claim: "All three hardening options together cost 2.5 compatibility units", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { user: true, sec: true, ro: true }, metric: "compatIssues" }, expect: { min: 2.4, max: 2.6 } },
    { id: "good", claim: "Namespaces, limits and a user namespace meet the target", run: "lab", params: { model: "isolation-lab", config: CB_CHALLENGE, values: { pid: true, mnt: true, mem: true, cpu: true, pids: true, user: true }, metric: "escapeRisk" }, expect: { max: 5 } },
  ],
});
