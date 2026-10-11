import { definePack } from "../define";

export const RLG = { start: { persistent: true, sizeMB: 500, level: "info", central: true, ratelimit: false } };
export const RLG_CHALLENGE = { start: { persistent: false, sizeMB: 100, level: "info", central: false, ratelimit: true } };

const JOURNALCTL = { id: "journalctl", title: "journalctl(1): query the systemd journal (-u, -b, -p, --since)", url: "https://www.freedesktop.org/software/systemd/man/latest/journalctl.html" };
const JOURNALD_CONF = { id: "journald-conf", title: "journald.conf(5): Storage=, SystemMaxUse=, RateLimitBurst=", url: "https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html" };
const DMESG = { id: "dmesg-man", title: "Linux man-pages: dmesg(1) (kernel ring buffer)", url: "https://man7.org/linux/man-pages/man1/dmesg.1.html" };

export default definePack({
  id: "reading-logs",
  title: "Reading Logs (journalctl, dmesg)",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "journalctl -u api --since yesterday · -- No entries --", detail: "host rebooted at 03:40; incident at 03:12" },
    lines: [
      { speaker: "kabir", line: "We know the service died at 3 a.m. We rebooted the machine to get it back, and now the logs from that night are not there." },
      { speaker: "meera", line: "Logs are evidence, and by default they are kept somewhere that vanishes when you do the thing everyone does first." },
    ],
  },
  predictions: [
    {
      id: "lost",
      kind: "choice",
      prompt: "The journal is in its default volatile mode. You reboot to recover the service, then investigate the 03:12 incident 20 hours later. What evidence do you have?",
      options: [
        { id: "all", label: "All of it, the journal is on disk" },
        { id: "none", label: "None from before the reboot" },
        { id: "half", label: "Half, the older half" },
      ],
      answer: "none",
      observe: "lost-evidence",
      reveal: {
        text: "A journal with Storage=volatile or auto and no /var/log/journal directory lives in memory under /run, which is cleared at boot. The reboot erased exactly the lines you needed. Creating the directory, or setting Storage=persistent, keeps them on disk, and forwarding them off the host keeps them if the host is lost.",
        derived: true,
        line: { speaker: "rao", line: "Reboot is also an erase button. Know before you press it." },
      },
    },
    {
      id: "dropped",
      kind: "choice",
      prompt: "Journal rate limiting is on, and the crash produced a burst of error lines in one second. Roughly what share of the incident's lines goes missing?",
      options: [
        { id: "0", label: "None, rate limits only affect noisy services" },
        { id: "40", label: "About 40% in these figures: the crash is the noisy moment" },
        { id: "100", label: "All of them" },
      ],
      answer: "40",
      observe: "dropped-lines",
      reveal: {
        text: "Rate limiting caps messages per service per interval, protecting the system from a log flood, and a crash is a flood: a stack trace, repeated errors, a restart. Messages past the limit are dropped, with a single note saying how many. The lines that explain the crash are the ones most likely to be missing.",
        derived: true,
        line: { speaker: "meera", line: "A safety valve for noise can silence the one thing you needed to hear." },
      },
    },
  ],
  widget: { id: "log-lab", config: RLG },
  mechanism: [
    {
      id: "journal",
      text: "systemd's journal collects the output of every service, plus the kernel's messages, in a structured, indexed store. journalctl queries it: by service with -u, since boot with -b, by priority with -p, by time with --since and --until, and live with -f. A good first question for a failure is what the unit said just before it stopped.",
      sourceIds: ["journalctl"],
    },
    {
      id: "kernel",
      text: "The kernel keeps its own ring buffer, which dmesg prints and the journal also records. Out-of-memory kills, disk errors, network driver trouble and segfaults appear here, and not in your application's logs, because the application was killed before it could write. When a service just vanishes, read the kernel log before the application log.",
      sourceIds: ["dmesg-man", "journalctl"],
    },
    {
      id: "keep",
      scene: "persist",
      text: "Keeping logs is a decision. Volatile storage is lost at reboot, persistent storage is capped by size and rotates, so retention is the cap divided by the write rate. Chatty levels shorten it fast. Decide how far back you need to look, which is usually days, and size for that, or send logs to a central store.",
      sourceIds: ["journald-conf"],
    },
    {
      id: "central",
      scene: "forward",
      text: "Central logging forwards each line off the host, to a collector and a search service. It survives the host's loss and reboot, holds weeks, is searchable across machines and keeps the local disk small. Use a level that records the story, usually info, and mind the rate limits, which can discard the burst around an incident.",
      sourceIds: ["journald-conf"],
    },
  ],
  challenges: [
    {
      id: "keep-evidence",
      title: "Set up logging",
      brief: "Keep 72 hours of logs that survive a reboot, with at most 500 MB on the host and at least 80% of the story recorded.",
      line: { speaker: "rao", line: "The next incident should leave a trail." },
      widget: { id: "log-lab", config: RLG_CHALLENGE },
      conditions: [
        { metric: "retentionHours", op: ">=", value: 72, label: "At least 72 hours kept" },
        { metric: "survivesReboot", op: ">=", value: 1, label: "Survives a reboot" },
        { metric: "diskMB", op: "<=", value: 500, label: "At most 500 MB on the host" },
        { metric: "evidenceQuality", op: ">=", value: 0.8, label: "At least 80% of the story recorded" },
      ],
      stars: [],
      hints: ["Where are logs lost at reboot?", "How long does 500 MB last at the info level?", "What does the rate limit do to a burst?"],
    },
  ],
  explainBack: {
    prompt: "Explain how you would make sure logs exist when you need to investigate an incident.",
    rubric: [
      { id: "persist", criterion: "A volatile journal is lost at reboot; use persistent storage or forward off the host so evidence survives", keyIdea: "survive the reboot" },
      { id: "retention", criterion: "Retention is the size cap divided by the write rate, so the log level and cap decide how far back you can look; central logging keeps longer", keyIdea: "retention arithmetic" },
      { id: "burst", criterion: "Rate limiting can drop the burst of lines around a crash, and kernel messages such as OOM kills live in the kernel log", keyIdea: "bursts and the kernel log" },
    ],
    exemplar:
      "A volatile journal is lost at reboot, so I would use persistent storage or forward logs off the host so evidence survives. Retention is the size cap divided by the write rate, so the level and the cap decide how far back I can look, and central logging keeps much longer without filling the disk. I would watch for rate limiting dropping the burst around a crash, and read the kernel log for things like OOM kills that the application never gets to write.",
  },
  reviews: [
    {
      id: "rg-est",
      format: "estimate",
      scenario: "A persistent journal capped at 1,500 MB receives 20 MB of logs an hour at the info level. How many hours does it keep?",
      unit: "hours",
      answer: 75,
      acceptFactor: 1.05,
      breakdown: ["1,500 ÷ 20 = 75 hours", "about three days"],
      explain: "Retention is the cap divided by the rate. A level 10× chattier keeps 10× less.",
    },
    {
      id: "rg-pick",
      format: "pick-fix",
      scenario: "A service disappeared at 03:12 with no error in its own logs. Where should you look first?",
      options: [
        { id: "a", label: "The kernel log (dmesg or journalctl -k), for an OOM kill or a segfault" },
        { id: "b", label: "The service's access log" },
        { id: "c", label: "The web server's configuration" },
        { id: "d", label: "The DNS records" },
      ],
      answer: "a",
      explain: "A process killed by the kernel cannot log its own death. The kernel records the kill.",
    },
    {
      id: "rg-order",
      format: "order",
      scenario: "Order these log levels by hours kept in a 500 MB persistent journal, most first (2, 20 and 200 MB an hour).",
      items: [
        { id: "error", label: "Errors only" },
        { id: "info", label: "Info" },
        { id: "debug", label: "Debug" },
      ],
      answer: ["error", "info", "debug"],
      explain: "250, 25 and 2.5 hours.",
    },
    {
      id: "rg-graph",
      format: "predict-graph",
      scenario: "With a 500 MB persistent journal, as the log volume rises from 2 to 200 MB an hour, how does retention in hours change?",
      xLabel: "write rate →",
      yLabel: "retention",
      options: [
        { id: "inverse", label: "Falls steeply and flattens (inverse)", points: [250, 125, 50, 25, 12, 5, 3, 2.5] },
        { id: "linear", label: "Falls in a straight line", points: [250, 220, 190, 160, 130, 100, 70, 40] },
        { id: "flat", label: "Stays the same", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "inverse",
      explain: "Retention = cap ÷ rate. A 10× chattier log keeps one tenth as long.",
    },
    {
      id: "rg-flaw",
      format: "spot-flaw",
      scenario: "A service writes debug logs to the local journal, which is capped at 200 MB and rotates. An incident is reported two days later. Tap the problem.",
      diagram: {
        nodes: [
          { id: "svc", label: "service at debug level, 200 MB an hour", kind: "server", col: 0, row: 1 },
          { id: "journal", label: "local journal, 200 MB cap", kind: "store", col: 1, row: 1 },
          { id: "eng", label: "investigation 48 h later", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "svc", to: "journal" },
          { from: "journal", to: "eng" },
        ],
      },
      answer: "svc->journal",
      explain: "200 MB lasts one hour at that rate. The debug volume pushes the evidence out long before the investigation starts. Use info locally, and ship to a store with room.",
    },
    {
      id: "rg-explain",
      format: "explain",
      scenario: "In two sentences: why should logs be sent off the host?",
      rubric: [
        { id: "survive", criterion: "A host that is lost, rebuilt or rebooted takes its local logs with it, often at exactly the moment you need them" },
        { id: "search", criterion: "A central store keeps longer, is searchable across hosts and lets you correlate a failure across services" },
      ],
      exemplar: "A host that is lost, rebuilt or rebooted takes its local logs with it, often at exactly the moment you need them. A central store also keeps them longer, can be searched across hosts and lets you correlate a failure across services.",
      explain: "Logs outlive the machine that wrote them.",
    },
  ],
  codex: {
    oneLiner: "The journal and kernel log are evidence. Survive reboots, size retention as cap ÷ rate, mind rate limits, ship logs off the host.",
    keyNumbers: [
      { label: "Retention at 20 MB/h with a 1,500 MB cap (lab)", value: "75 hours", sourceId: "journald-conf" },
      { label: "Kernel messages worth reading first", value: "OOM kills, segfaults, disk errors", sourceId: "dmesg-man" },
    ],
    tradeoffs: [
      { choice: "Persistent journal", gain: "Survives reboots", cost: "Disk use; a cap shortens history" },
      { choice: "Debug level", gain: "Every detail", cost: "Retention and signal-to-noise" },
      { choice: "Central logging", gain: "Survives the host, searchable", cost: "A service to run and pay for" },
    ],
    seenIn: ["journalctl -u service --since, journalctl -b -1 and dmesg -T.", "Fluent Bit, Vector and cloud agents shipping logs."],
    interviewAngle: "Say: 'persistent or centralised logs, retention is cap over rate, read the kernel log when a process just vanishes, and watch rate limits'.",
    aws: [{ concept: "Central logs", service: "Amazon CloudWatch Logs agent; OpenSearch" }],
    replay: { id: "log-lab", config: RLG, scene: "forward" },
  },
  interview: [
    "How do you find out why a service died?",
    "What is the difference between journalctl and dmesg?",
    "How long should you keep logs?",
  ],
  deeper: [
    {
      title: "Structured and correlated",
      body: "Plain text lines are hard to search and join. Log in a structured form, with a timestamp, a level, a service name and a request or trace ID, and each line can be filtered by field and tied to the rest of a request across services. The ID that links a user's complaint to the three services it touched is worth more than any single log level.",
      sourceIds: ["journalctl"],
    },
  ],
  honestPhysics: [
    "The incident was at 03:12 and the investigation begins 20 hours later, after a reboot. A volatile journal is cleared at boot. The host writes about 2 MB an hour at the error level, 20 at info and 200 at debug; retention on the host is the cap divided by the rate. A central service keeps 30 days (720 hours).",
    "The level records 40% (error), 90% (info) or 100% (debug) of the story. The journal's rate limit drops bursts, and with it on 40% of the lines at the incident are missing. Round figures.",
  ],
  sources: [JOURNALCTL, JOURNALD_CONF, DMESG],
  verify: [
    { id: "volatile", claim: "A volatile journal does not survive a reboot", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { persistent: false, central: false }, metric: "survivesReboot" }, expect: { max: 0 } },
    { id: "retention", claim: "A 1,500 MB persistent journal at info keeps 75 hours", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { persistent: true, sizeMB: 1500, level: "info", central: false }, metric: "retentionHours" }, expect: { min: 75, max: 75 } },
    { id: "disk", claim: "…using 1,500 MB of disk", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { persistent: true, sizeMB: 1500, level: "info", central: false }, metric: "diskMB" }, expect: { min: 1500, max: 1500 } },
    { id: "ratelimit", claim: "Rate limiting drops 40% of the story at info", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { level: "info", ratelimit: true }, metric: "evidenceQuality" }, expect: { min: 0.53, max: 0.55 } },
    { id: "good", claim: "Central logging at info with no rate limit keeps 720 hours", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { central: true, level: "info", ratelimit: false }, metric: "retentionHours" }, expect: { min: 720, max: 720 } },
    { id: "good-q", claim: "…and records 90% of the story with 16 MB on the host", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { central: true, level: "info", ratelimit: false, persistent: false }, metric: "evidenceQuality" }, expect: { min: 0.89, max: 0.91 } },
    { id: "error-only", claim: "Errors only keeps a long history of a thin story", run: "lab", params: { model: "log-lab", config: RLG_CHALLENGE, values: { persistent: true, sizeMB: 500, level: "error", central: false, ratelimit: false }, metric: "evidenceQuality" }, expect: { max: 0.45 } },
  ],
});
