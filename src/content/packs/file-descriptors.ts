import { definePack } from "../define";

export const FDP = { start: { ulimit: 65536, pooled: true, closes: true } };
export const FDP_CHALLENGE = { start: { ulimit: 1024, pooled: false, closes: false } };

const GETRLIMIT = { id: "getrlimit-man", title: "Linux man-pages: getrlimit(2) (RLIMIT_NOFILE)", url: "https://man7.org/linux/man-pages/man2/getrlimit.2.html" };
const ACCEPT_MAN = { id: "accept-man", title: "Linux man-pages: accept(2) (EMFILE: the per-process limit on open descriptors)", url: "https://man7.org/linux/man-pages/man2/accept.2.html" };
const SYSTEMD_EXEC = { id: "systemd-exec", title: "systemd.exec(5): LimitNOFILE and resource limits for services", url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html" };

export default definePack({
  id: "file-descriptors",
  title: "File Descriptors",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "proxy · accept4: too many open files", detail: "connections refused at 1,024 open sockets" },
    lines: [
      { speaker: "kabir", line: "The proxy has plenty of CPU and memory and refuses connections at exactly a thousand. The error is 'too many open files', and none of those are files." },
      { speaker: "meera", line: "On Linux nearly everything you hold open is a file descriptor, and each process has a quota of them. The quota is small by default." },
    ],
  },
  predictions: [
    {
      id: "limit",
      kind: "choice",
      prompt: "A proxy holds one socket to each client and one to an upstream, with about 60 more descriptors for logs and listeners, under a limit of 1,024. 6,000 clients connect at once. What share are refused?",
      options: [
        { id: "0", label: "None, the kernel queues them" },
        { id: "50", label: "About 50%" },
        { id: "92", label: "About 92%" },
      ],
      answer: "92",
      observe: "too-many",
      reveal: {
        text: "(1,024 − 60) ÷ 2 is 482 clients, a thirteenth of 6,000, so 92% are refused with EMFILE. The limit is per process, and the kernel's global limit is far above it. Raising it to 65,536 in the service's configuration lifts capacity to about 32,000 clients, with no change in code.",
        derived: true,
        line: { speaker: "rao", line: "The ceiling is a number someone chose years ago. Look it up." },
      },
    },
    {
      id: "leak",
      kind: "choice",
      prompt: "You raise the limit to 1,048,576 to be safe. The service has a bug that opens a file and never closes it, 2 a second. How long until it hits the limit?",
      options: [
        { id: "never", label: "Never, a million is more than it needs" },
        { id: "145", label: "About 6 days (145 hours)" },
        { id: "1", label: "About an hour" },
      ],
      answer: "145",
      observe: "leak-clock",
      reveal: {
        text: "1,048,576 ÷ 2 per second is 524,288 seconds: 145 hours. A bigger limit does not fix a leak, it moves the failure to a weekend and makes it harder to connect with the deploy that caused it. Watch the count of open descriptors over time, and alert on a rising line.",
        derived: true,
        line: { speaker: "meera", line: "A bigger limit buys time. Only closing the file stops the leak." },
      },
    },
  ],
  widget: { id: "fd-lab", config: FDP },
  mechanism: [
    {
      id: "what",
      text: "A file descriptor is a small integer a process uses to refer to something it has open: a file, a network socket, a pipe, a timer. Each process has a table of them and a limit on its size. A process that runs out can open nothing new, not even a socket for the next client.",
      sourceIds: ["getrlimit-man"],
    },
    {
      id: "limit",
      scene: "limit",
      text: "The per-process limit, RLIMIT_NOFILE, is set by whatever launches the process: often 1,024 for a shell, and a service manager has its own, set in the unit with LimitNOFILE. A busy proxy or database needs tens of thousands. When it is exhausted, the kernel returns EMFILE and the application logs 'too many open files'.",
      sourceIds: ["getrlimit-man", "systemd-exec", "accept-man"],
    },
    {
      id: "pool",
      scene: "pool",
      text: "Count how many descriptors each unit of work uses. A proxy without connection reuse opens a new upstream socket for each client connection, doubling the cost. A pool of long-lived upstream connections reuses them across clients. Fewer descriptors per client means more clients under the same limit, and fewer handshakes too.",
      sourceIds: ["accept-man"],
    },
    {
      id: "close",
      scene: "close",
      text: "A leak is a descriptor opened and never closed, usually on an error path. Close in a finally block or with the language's resource-management construct. Monitor the number of open descriptors per process, because it climbs steadily with a leak and stays flat with load. Raise the limit for capacity, never as a fix for a leak.",
      sourceIds: ["getrlimit-man"],
    },
  ],
  challenges: [
    {
      id: "raise-limits",
      title: "Raise the right limits",
      brief: "Serve 6,000 concurrent clients, with no descriptor leak that could exhaust the limit within a month.",
      line: { speaker: "rao", line: "A bigger number is not a fix if something is still leaking." },
      widget: { id: "fd-lab", config: FDP_CHALLENGE },
      conditions: [
        { metric: "connectionCapacity", op: ">=", value: 6000, label: "Capacity for 6,000 clients" },
        { metric: "hoursToExhaust", op: ">=", value: 720, label: "No leak exhausting the limit within a month" },
      ],
      stars: [{ metric: "connectionCapacity", op: ">=", value: 30000, label: "Capacity for 30,000 clients" }],
      hints: ["How many descriptors does each client use?", "What does a leak do to any limit?", "What could cut descriptors per client?"],
    },
  ],
  explainBack: {
    prompt: "Explain 'too many open files' and how to fix it properly.",
    rubric: [
      { id: "what", criterion: "Sockets, files and pipes are all file descriptors, each process has a limit, and exhaustion makes accept and open fail", keyIdea: "everything is a descriptor" },
      { id: "limit", criterion: "Raise the limit where the process is launched (ulimit or LimitNOFILE) to the capacity needed, and count descriptors per connection", keyIdea: "size the limit" },
      { id: "leak", criterion: "A leak exhausts any limit eventually, so close resources reliably and monitor the open descriptor count", keyIdea: "fix leaks, monitor the count" },
    ],
    exemplar:
      "Sockets, files and pipes are all file descriptors, and each process has a limit, so exhausting it makes accept and open fail with 'too many open files'. I would raise the limit where the process is launched, with ulimit or LimitNOFILE, to the capacity I need, counting the descriptors each connection uses and reusing upstream connections. And I would close resources reliably and monitor the open-descriptor count, because a leak exhausts any limit eventually.",
  },
  reviews: [
    {
      id: "fd-est",
      format: "estimate",
      scenario: "A proxy uses 2 descriptors per client and about 60 for itself. With a limit of 1,024, how many clients can it serve?",
      unit: "clients",
      answer: 482,
      acceptFactor: 1.05,
      breakdown: ["(1,024 − 60) ÷ 2 = 482", "so 6,000 clients need about 12,100 descriptors"],
      explain: "Work out descriptors per unit of load before choosing the limit.",
    },
    {
      id: "fd-pick",
      format: "pick-fix",
      scenario: "A systemd service logs 'too many open files' at about 1,000 connections. You raised ulimit -n in your shell and it did not help. Why?",
      options: [
        { id: "a", label: "The service gets its limit from its unit file (LimitNOFILE), not from your shell" },
        { id: "b", label: "The kernel has no more memory" },
        { id: "c", label: "The network card is full" },
        { id: "d", label: "The disk is full" },
      ],
      answer: "a",
      explain: "Limits are inherited from the process that started the service. Set it in the unit, then restart.",
    },
    {
      id: "fd-order",
      format: "order",
      scenario: "Order these by number of concurrent clients served under a limit of 16,384, most first.",
      items: [
        { id: "pool", label: "Pooled upstream connections (1.2 per client)" },
        { id: "nopool", label: "A new upstream socket for every client (2 per client)" },
        { id: "three", label: "Two upstream sockets per client plus a log file each (3 per client)" },
      ],
      answer: ["pool", "nopool", "three"],
      explain: "About 13,600, 8,100 and 5,400.",
    },
    {
      id: "fd-graph",
      format: "predict-graph",
      scenario: "With a leak of 2 descriptors a second, how does the time to exhaust the limit change as the limit rises from 1,024 to 1,048,576?",
      xLabel: "limit →",
      yLabel: "hours until exhausted",
      options: [
        { id: "linear", label: "Grows in proportion to the limit", points: [0.14, 0.5, 2, 9, 36, 145, 580, 1450] },
        { id: "flat", label: "Stays the same", points: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: "never", label: "Becomes infinite beyond a large limit", points: [0.14, 0.5, 2, 9, 36, 99999, 99999, 99999] },
      ],
      answer: "linear",
      explain: "Time = limit ÷ leak rate. A larger limit delays the failure and never removes it.",
    },
    {
      id: "fd-flaw",
      format: "spot-flaw",
      scenario: "A request handler opens a temporary file, processes it, and closes it at the end of the function. When parsing fails, it returns early. Tap the problem.",
      diagram: {
        nodes: [
          { id: "open", label: "open temp file", kind: "worker", col: 0, row: 1 },
          { id: "parse", label: "parse (may fail and return early)", kind: "server", col: 1, row: 1 },
          { id: "close", label: "close, at the end of the function", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "open", to: "parse" },
          { from: "parse", to: "close" },
        ],
      },
      answer: "parse->close",
      explain: "The early return skips the close. Use a finally block or a context manager so it runs on every path.",
    },
    {
      id: "fd-explain",
      format: "explain",
      scenario: "In two sentences: why does a leak fail more slowly but just as surely under a higher descriptor limit?",
      rubric: [
        { id: "rate", criterion: "A leak consumes descriptors at a steady rate, so time to exhaustion is the limit divided by the rate" },
        { id: "no-fix", criterion: "A higher limit only scales that time; the descriptors are never returned, so eventually the limit is reached" },
      ],
      exemplar: "A leak consumes descriptors at a steady rate, so the time to exhaustion is the limit divided by that rate. A higher limit only scales that time, because the descriptors are never returned, and so the limit is eventually reached.",
      explain: "Limits are for capacity. Closing is for leaks.",
    },
  ],
  codex: {
    oneLiner: "Sockets, files and pipes are file descriptors with a per-process limit. Count descriptors per client, set LimitNOFILE for the capacity, and close everything.",
    keyNumbers: [
      { label: "Common default limit", value: "1,024", sourceId: "getrlimit-man" },
      { label: "Clients under a 1,024 limit, 2 descriptors each (lab)", value: "482", sourceId: "accept-man" },
    ],
    tradeoffs: [
      { choice: "Higher limit", gain: "More concurrent connections", cost: "A leak takes longer to notice" },
      { choice: "Connection pool", gain: "Fewer descriptors and handshakes per client", cost: "Pool tuning and stale connections" },
      { choice: "Per-process monitoring", gain: "Catches leaks early", cost: "A metric to build and alert on" },
    ],
    seenIn: ["Nginx, HAProxy and database configuration guides.", "Postmortems that say 'too many open files'."],
    interviewAngle: "Say: 'descriptors per connection times connections plus overhead; set LimitNOFILE; pool upstream connections; close in finally; graph the open count'.",
    aws: [{ concept: "Connection limits", service: "Application Load Balancer idle timeouts; RDS Proxy connection pooling" }],
    replay: { id: "fd-lab", config: FDP, scene: "pool" },
  },
  interview: [
    "What does 'too many open files' mean?",
    "How do you raise the open-file limit for a service?",
    "How would you detect a file descriptor leak?",
  ],
  deeper: [
    {
      title: "Other limits that look the same",
      body: "The error can also come from the system-wide file table (fs.file-max), from inotify watches, or from a container runtime's own limit. Check the process's limits with /proc/PID/limits, count its descriptors with ls /proc/PID/fd, and compare. The count that grows between two samples is the leak.",
      sourceIds: ["getrlimit-man"],
    },
  ],
  honestPhysics: [
    "A proxy holds one descriptor per client and one per upstream connection (2 per client, or about 1.2 with a pool that reuses connections), plus about 60 for logs, listeners and libraries. 6,000 clients at once is the load.",
    "A bug that opens a file and never closes it leaks 2 descriptors a second, so the time to exhaust a limit is limit ÷ 2 seconds. Round figures.",
  ],
  sources: [GETRLIMIT, ACCEPT_MAN, SYSTEMD_EXEC],
  verify: [
    { id: "default", claim: "A limit of 1,024 serves 482 clients", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: {}, metric: "connectionCapacity" }, expect: { min: 481, max: 483 } },
    { id: "refused", claim: "…refusing 92% of 6,000", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: {}, metric: "errorShare" }, expect: { min: 0.91, max: 0.93 } },
    { id: "raised", claim: "A limit of 65,536 serves about 32,700 clients", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: { ulimit: 65536 }, metric: "connectionCapacity" }, expect: { min: 32000, max: 33500 } },
    { id: "leak", claim: "With a leak, a limit of 1,048,576 lasts 145 hours", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: { ulimit: 1048576 }, metric: "hoursToExhaust" }, expect: { min: 144, max: 147 } },
    { id: "pool", claim: "A pool lets 8,192 descriptors serve 6,700 clients", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: { ulimit: 8192, pooled: true, closes: true }, metric: "connectionCapacity" }, expect: { min: 6700, max: 6800 } },
    { id: "pool-no-leak", claim: "…and never exhausts", run: "lab", params: { model: "fd-lab", config: FDP_CHALLENGE, values: { ulimit: 8192, pooled: true, closes: true }, metric: "hoursToExhaust" }, expect: { min: 720 } },
  ],
});
