import { definePack } from "../define";

export const SD = { start: { restart: "on-failure", restartSec: 5, limited: true } };
export const SD_CHALLENGE = { start: { restart: "no", restartSec: 1, limited: false } };

const SERVICE = { id: "systemd-service", title: "systemd.service(5): Restart=, RestartSec= and service types", url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html" };
const UNIT = { id: "systemd-unit", title: "systemd.unit(5): StartLimitIntervalSec= and StartLimitBurst=", url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html" };
const SYSTEMCTL = { id: "systemctl", title: "systemctl(1): status, restart, reset-failed", url: "https://www.freedesktop.org/software/systemd/man/latest/systemctl.html" };

export default definePack({
  id: "systemd",
  title: "systemd Units",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "api.service · inactive (dead) since 02:14, 6 h ago", detail: "no one was paged; the process crashed once" },
    lines: [
      { speaker: "kabir", line: "The API crashed at 2 a.m. from a one-off error and stayed down until someone logged in at 8. Nothing restarted it." },
      { speaker: "meera", line: "A process manager is only as good as its restart rules. Too little and one crash is an outage; too much and a bad deploy is a storm." },
    ],
  },
  predictions: [
    {
      id: "norestart",
      kind: "choice",
      prompt: "A service crashes once an hour from a transient fault and takes 5 s to start. The unit has the default Restart=no, and a person notices after about 15 minutes. How much of each hour is it down?",
      options: [
        { id: "5", label: "About 5 seconds" },
        { id: "60", label: "About a minute" },
        { id: "900", label: "About 15 minutes" },
      ],
      answer: "900",
      observe: "no-restart",
      reveal: {
        text: "With Restart=no nothing brings it back until a human does, so each crash costs the notice time: 900 s, a quarter of every hour. Restart=on-failure with a short RestartSec makes the same crash cost the restart delay plus the start time, 10 s with a 5 s delay.",
        derived: true,
        line: { speaker: "rao", line: "The restart policy is part of your availability number." },
      },
    },
    {
      id: "loop",
      kind: "choice",
      prompt: "A deploy ships a broken configuration: the service dies the instant it starts. You set Restart=on-failure and RestartSec=0 with no start limit. How often does it restart?",
      options: [
        { id: "1", label: "About once a minute" },
        { id: "60", label: "About once a second" },
        { id: "300", label: "About 300 times a minute" },
      ],
      answer: "300",
      observe: "hot-loop",
      reveal: {
        text: "With no delay, each start takes about 0.2 s and fails, and the next starts at once: 300 a minute, filling the journal and pinning a CPU. Left to itself systemd applies a default start limit of five starts in ten seconds and marks the unit failed, and a unit that disables that limit restarts forever.",
        derived: true,
        line: { speaker: "meera", line: "A fast retry of a hopeless job is a denial of service on yourself." },
      },
    },
  ],
  widget: { id: "unit-lab", config: SD },
  mechanism: [
    {
      id: "unit",
      text: "systemd is the first process on most Linux hosts and supervises everything else. A unit file describes a service: the command, the user, the environment, its dependencies, when it starts and what to do if it stops. You manage it with systemctl; its state and recent output show in systemctl status and journalctl.",
      sourceIds: ["systemd-service", "systemctl"],
    },
    {
      id: "restart",
      scene: "restart",
      text: "Restart= says when to bring a service back: no, on-failure for crashes and non-zero exits, or always. RestartSec= is the pause before trying. A short pause recovers fast from a transient fault. Without a restart policy, a one-off crash is an outage that lasts until someone notices, so most long-running services want on-failure.",
      sourceIds: ["systemd-service"],
    },
    {
      id: "backoff",
      scene: "backoff",
      text: "A restart loop on a permanent fault wastes resources and drowns the logs that explain it. A longer RestartSec slows the loop, at the price of a slower recovery from transient crashes. Pick the smallest delay that stops the loop from hurting, and prefer the start limit to a guess, since it handles both cases.",
      sourceIds: ["systemd-service"],
    },
    {
      id: "limit",
      scene: "limit",
      text: "StartLimitBurst and StartLimitIntervalSec cap how many starts are allowed in a window. Past it, systemd stops trying and marks the unit failed, a state that monitoring can alert on and that a person must reset after fixing the cause. A crash once an hour never reaches the limit, and a broken deploy reaches it in seconds.",
      sourceIds: ["systemd-unit", "systemctl"],
    },
  ],
  challenges: [
    {
      id: "write-unit",
      title: "Write the unit",
      brief: "Recover from a transient crash in 20 seconds or less per hour, stop retrying a broken configuration, and leave the unit failed so monitoring can see it.",
      line: { speaker: "rao", line: "Heal what can heal. Give up loudly on what can't." },
      widget: { id: "unit-lab", config: SD_CHALLENGE },
      conditions: [
        { metric: "downtimePerHour", op: "<=", value: 20, label: "At most 20 s down per hour" },
        { metric: "loopRestartsPerMin", op: "<=", value: 5, label: "At most 5 restarts a minute on a bad configuration" },
        { metric: "gaveUpOnBadConfig", op: ">=", value: 1, label: "Marked failed on a bad configuration" },
      ],
      stars: [{ metric: "downtimePerHour", op: "<=", value: 10, label: "At most 10 s down per hour" }],
      hints: ["What does the default policy do after a crash?", "What stops a fast loop on a hopeless unit?", "How long a pause can you afford?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to configure a systemd service to be resilient without looping.",
    rubric: [
      { id: "restart", criterion: "Use Restart=on-failure with a short RestartSec so a transient crash recovers in seconds", keyIdea: "restart on failure" },
      { id: "loop", criterion: "A permanent fault would restart forever, so use the start limit to stop after a few failures and mark the unit failed", keyIdea: "start limit" },
      { id: "observe", criterion: "A failed unit is a signal: alert on it, read the journal, fix the cause and reset-failed", keyIdea: "make failure visible" },
    ],
    exemplar:
      "I would use Restart=on-failure with a short RestartSec so a transient crash recovers in seconds. A permanent fault would restart forever, so I would rely on the start limit to stop after a few failures and mark the unit failed. That state is a signal: monitoring alerts on it, someone reads the journal, fixes the cause and runs reset-failed.",
  },
  reviews: [
    {
      id: "sd-est",
      format: "estimate",
      scenario: "A service crashes once an hour, takes 5 s to start, and RestartSec is 10 s. How many seconds of each hour is it down?",
      unit: "seconds",
      answer: 15,
      acceptFactor: 1.05,
      breakdown: ["10 s pause + 5 s start = 15 s", "once an hour"],
      explain: "Downtime is crashes per hour times the recovery time. Both can be improved.",
    },
    {
      id: "sd-pick",
      format: "pick-fix",
      scenario: "After a bad deploy a unit restarts 300 times a minute, and the journal is full of its start-up errors. What is the best change?",
      options: [
        { id: "a", label: "Keep Restart=on-failure, add a few seconds of RestartSec and rely on the start limit to stop the loop" },
        { id: "b", label: "Set Restart=always" },
        { id: "c", label: "Set RestartSec=0" },
        { id: "d", label: "Delete the journal" },
      ],
      answer: "a",
      explain: "A pause makes the loop cheap, and the start limit ends it and marks the unit failed.",
    },
    {
      id: "sd-order",
      format: "order",
      scenario: "Order these by downtime per hour for a transient crash, most first.",
      items: [
        { id: "no", label: "Restart=no" },
        { id: "slow", label: "Restart=on-failure, RestartSec=25" },
        { id: "mid", label: "Restart=on-failure, RestartSec=5" },
        { id: "fast", label: "Restart=on-failure, RestartSec=0" },
      ],
      answer: ["no", "slow", "mid", "fast"],
      explain: "900 s, 30 s, 10 s and 5 s.",
    },
    {
      id: "sd-graph",
      format: "predict-graph",
      scenario: "With no start limit, as RestartSec rises from 0 to 30 s, how does the number of restarts per minute on a broken configuration change?",
      xLabel: "RestartSec →",
      yLabel: "restarts a minute",
      options: [
        { id: "fall", label: "Falls steeply, then flattens", points: [300, 60, 12, 5.7, 3.9, 3, 2.4, 2] },
        { id: "linear", label: "Falls in a straight line", points: [300, 250, 200, 150, 100, 50, 25, 2] },
        { id: "flat", label: "Stays the same", points: [300, 300, 300, 300, 300, 300, 300, 300] },
      ],
      answer: "fall",
      explain: "Restarts per minute is 60 ÷ (RestartSec + 0.2), so a small pause makes most of the difference.",
    },
    {
      id: "sd-flaw",
      format: "spot-flaw",
      scenario: "A unit sets Restart=always, RestartSec=0 and StartLimitIntervalSec=0 'so it never gives up'. After a bad deploy the host is unreachable. Tap the setting that caused it.",
      diagram: {
        nodes: [
          { id: "svc", label: "service dying at start", kind: "server", col: 0, row: 1 },
          { id: "policy", label: "RestartSec=0, no start limit", kind: "queue", col: 1, row: 1 },
          { id: "host", label: "CPU and journal saturated", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "svc", to: "policy" },
          { from: "policy", to: "host" },
        ],
      },
      answer: "svc->policy",
      explain: "Retries with no pause and no cap turn a broken start into a busy loop that starves the host. Keep a pause and a limit.",
    },
    {
      id: "sd-explain",
      format: "explain",
      scenario: "In two sentences: why is a unit in the failed state better than one restarting forever?",
      rubric: [
        { id: "signal", criterion: "Failed is a clear state that monitoring can alert on and a person can investigate, where a loop hides in noise" },
        { id: "cost", criterion: "It stops wasting CPU and flooding the journal with the same error, so the logs that explain the fault survive" },
      ],
      exemplar: "Failed is a clear state that monitoring can alert on and a person can investigate, where a loop hides in noise. It also stops wasting CPU and flooding the journal with the same error, so the logs that explain the fault survive.",
      explain: "Make hopeless failures loud.",
    },
  ],
  codex: {
    oneLiner: "A unit describes a service. Restart=on-failure with a short RestartSec heals transient crashes; the start limit stops hopeless loops and marks the unit failed.",
    keyNumbers: [
      { label: "Restarts a minute with RestartSec=0 on instant failure (lab)", value: "300", sourceId: "systemd-service" },
      { label: "Downtime from a crash an hour, Restart=no (lab)", value: "900 s", sourceId: "systemd-service" },
    ],
    tradeoffs: [
      { choice: "Short RestartSec", gain: "Fast recovery", cost: "Hot loops on permanent faults without a limit" },
      { choice: "Start limit", gain: "Ends loops, signals failure", cost: "Needs a person to reset after the fix" },
      { choice: "Restart=always", gain: "Also restarts clean exits", cost: "Hides deliberate stops" },
    ],
    seenIn: ["Every Linux server that runs a daemon.", "Unit files for nginx, postgres and application services."],
    interviewAngle: "Say: 'Restart=on-failure, a short RestartSec, the start limit as the loop breaker, and an alert on failed units'.",
    aws: [{ concept: "Process supervision on instances", service: "systemd on EC2; ECS task restart policies" }],
    replay: { id: "unit-lab", config: SD, scene: "limit" },
  },
  interview: [
    "How does systemd restart a crashed service?",
    "What stops a restart loop?",
    "How do you see why a service failed?",
  ],
  deeper: [
    {
      title: "Types, dependencies and ordering",
      body: "Type=simple treats the service as started the moment it launches. Type=notify waits until the program says it is ready, which matters for units that others depend on. Ordering (After=) and requirement (Requires=) are separate: After=network-online.target orders, and Wants= or Requires= pulls the target in. Mixing them up is the usual cause of boot-time races.",
      sourceIds: ["systemd-service"],
    },
  ],
  honestPhysics: [
    "A service crashes about once an hour from a transient fault and takes 5 s to start. With Restart=no it is down until a person notices, about 15 minutes in these figures; with on-failure it is back after RestartSec plus the start time.",
    "After a bad deploy it dies instantly. Restarts a minute are 60 ÷ (RestartSec + 0.2), forever, unless the start limit (five starts in 60 s here) marks the unit failed. Round figures.",
  ],
  sources: [SERVICE, UNIT, SYSTEMCTL],
  verify: [
    { id: "no", claim: "Restart=no costs 900 s an hour", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: {}, metric: "downtimePerHour" }, expect: { min: 900, max: 900 } },
    { id: "fast", claim: "Restart=on-failure with no pause costs 5 s an hour", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: { restart: "on-failure", restartSec: 0 }, metric: "downtimePerHour" }, expect: { min: 5, max: 5 } },
    { id: "storm", claim: "…and loops 300 times a minute on a bad configuration", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: { restart: "on-failure", restartSec: 0, limited: false }, metric: "loopRestartsPerMin" }, expect: { min: 299, max: 301 } },
    { id: "limit", claim: "A start limit ends the loop and marks the unit failed", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: { restart: "on-failure", restartSec: 5, limited: true }, metric: "gaveUpOnBadConfig" }, expect: { min: 1 } },
    { id: "good", claim: "On-failure with a 5 s pause and a limit costs 10 s an hour", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: { restart: "on-failure", restartSec: 5, limited: true }, metric: "downtimePerHour" }, expect: { min: 10, max: 10 } },
    { id: "no-limit-slow", claim: "A 15 s pause without a limit still restarts about 4 times a minute", run: "lab", params: { model: "unit-lab", config: SD_CHALLENGE, values: { restart: "on-failure", restartSec: 15, limited: false }, metric: "loopRestartsPerMin" }, expect: { min: 3.5, max: 4.5 } },
  ],
});
