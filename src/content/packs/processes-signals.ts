import { definePack } from "../define";

export const PS = { start: { form: "exec", handles: true, init: true, grace: 10 } };
export const PS_CHALLENGE = { start: { form: "shell", handles: false, init: false, grace: 10 } };

const SIGNAL_MAN = { id: "signal-man", title: "Linux man-pages: signal(7)", url: "https://man7.org/linux/man-pages/man7/signal.7.html" };
const DOCKERFILE_CMD = { id: "dockerfile-cmd", title: "Docker docs: Dockerfile CMD (shell form and exec form)", url: "https://docs.docker.com/reference/dockerfile/#cmd" };
const POD_TERM = { id: "pod-termination", title: "Kubernetes docs: Pod lifecycle, termination of Pods (SIGTERM, grace period, SIGKILL)", url: "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination" };
const TINI = { id: "tini", title: "tini: a tiny init for containers (signal forwarding, zombie reaping)", url: "https://github.com/krallin/tini" };

export default definePack({
  id: "processes-signals",
  title: "Processes & Signals",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "deploy · 120 requests failed during rollout of 12 pods", detail: "pods took exactly 10 s to terminate" },
    lines: [
      { speaker: "kabir", line: "Every deploy drops a few hundred requests. The app has a clean shutdown handler, and it never seems to run." },
      { speaker: "meera", line: "A stop request is a signal sent to one process. Whether your code is that process decides whether the handler runs or the kernel pulls the plug." },
    ],
  },
  predictions: [
    {
      id: "killed",
      kind: "choice",
      prompt: "The Dockerfile says CMD ./app in shell form, and the app has a SIGTERM handler that drains in 8 s. 'docker stop' sends SIGTERM to the container's first process, then SIGKILL after 10 s. When does the container stop, and is it graceful?",
      options: [
        { id: "8", label: "After 8 s, gracefully" },
        { id: "10", label: "After 10 s, killed, with requests dropped" },
        { id: "0", label: "Immediately" },
      ],
      answer: "10",
      observe: "killed",
      reveal: {
        text: "Shell form starts /bin/sh -c ./app, so the shell is PID 1 and the app is its child. The shell receives SIGTERM and does not pass it on, so the app never hears about it. After the grace period the kernel sends SIGKILL, which cannot be caught, and 120 requests die. Exec form puts the app in PID 1.",
        derived: true,
        line: { speaker: "rao", line: "A handler only runs in the process that gets the signal." },
      },
    },
    {
      id: "zombies",
      kind: "choice",
      prompt: "The app is PID 1 in exec form, has a handler, and starts a helper process 60 times an hour. It never waits for the exited helpers. After a day, how many defunct processes are in the process table?",
      options: [
        { id: "0", label: "None, the kernel cleans up exited processes" },
        { id: "1440", label: "About 1,440: every helper that exited and was never reaped" },
        { id: "60", label: "About 60" },
      ],
      answer: "1440",
      observe: "zombies",
      reveal: {
        text: "An exited child stays in the process table as a zombie until its parent collects its exit status with wait(). Orphans are adopted by PID 1, which is expected to reap them, and an ordinary application is not written to. That is 1,440 zombies a day, until the table fills. A small init as PID 1 does the reaping.",
        derived: true,
        line: { speaker: "meera", line: "PID 1 has housekeeping duties most apps do not know about." },
      },
    },
  ],
  widget: { id: "signal-lab", config: PS },
  mechanism: [
    {
      id: "process",
      text: "A process is a running program with its own memory, an ID, open files and a parent. Processes form a tree: when a child exits it leaves an exit status for the parent to collect. An exited process nobody has collected is a zombie. It holds no memory, only a slot in the process table.",
      sourceIds: ["signal-man"],
    },
    {
      id: "signals",
      scene: "handler",
      text: "A signal is a small message sent to a process. SIGTERM asks it to stop and can be handled, so a program can finish its work and exit. SIGKILL cannot be caught or ignored and ends the process at once. Tools send SIGTERM first, wait a grace period, then SIGKILL. A handler turns the polite request into a clean shutdown.",
      sourceIds: ["signal-man", "pod-termination"],
    },
    {
      id: "pid1",
      scene: "exec",
      text: "In a container, your command is PID 1, which the kernel treats differently: signals with no installed handler are ignored instead of terminating it, and it inherits orphans. Shell form puts a shell at PID 1 that does not forward signals. Use exec form so the app receives them, and install a SIGTERM handler.",
      sourceIds: ["dockerfile-cmd", "signal-man"],
    },
    {
      id: "init",
      scene: "init",
      text: "A tiny init, such as tini or the runtime's init flag, runs as PID 1, starts your app as its child, forwards signals to it and reaps zombies. The app then runs as an ordinary process with default signal behaviour. Set the grace period above the time your app needs to drain, and the platform will wait for it.",
      sourceIds: ["tini", "pod-termination"],
    },
  ],
  challenges: [
    {
      id: "graceful-stop",
      title: "Set up shutdown",
      brief: "Make the shutdown graceful, finish within 15 seconds, and leave no zombie processes. It starts in shell form with no handler.",
      line: { speaker: "rao", line: "A deploy should not cost a single request." },
      widget: { id: "signal-lab", config: PS_CHALLENGE },
      conditions: [
        { metric: "gracefulShutdown", op: ">=", value: 1, label: "Shutdown is graceful" },
        { metric: "stopSec", op: "<=", value: 15, label: "Stops within 15 s" },
        { metric: "zombiesPerHour", op: "<=", value: 0, label: "No zombie processes" },
      ],
      stars: [],
      hints: ["Who receives the signal in shell form?", "What must the app do when it receives it?", "Who reaps exited helper processes?"],
    },
  ],
  explainBack: {
    prompt: "Explain how a container is told to stop and what can go wrong.",
    rubric: [
      { id: "signals", criterion: "The runtime sends SIGTERM to PID 1, waits the grace period, then sends SIGKILL, which cannot be handled", keyIdea: "TERM, wait, KILL" },
      { id: "pid1", criterion: "Shell form puts a shell at PID 1 that does not forward signals; exec form makes the app PID 1, which ignores signals without handlers", keyIdea: "PID 1 is special" },
      { id: "fix", criterion: "Use exec form with a SIGTERM handler that drains, an init to forward signals and reap zombies, and a grace period longer than the drain", keyIdea: "exec, handler, init, grace" },
    ],
    exemplar:
      "The runtime sends SIGTERM to PID 1, waits for the grace period, then sends SIGKILL, which cannot be handled. Shell form puts a shell at PID 1 that does not forward the signal, and in exec form an app that is PID 1 ignores signals it has no handler for. So I would use exec form, install a SIGTERM handler that drains requests, run a small init to forward signals and reap zombies, and set the grace period longer than the drain.",
  },
  reviews: [
    {
      id: "ps-est",
      format: "estimate",
      scenario: "The app drains 120 in-flight requests in 8 s once told to stop, and the grace period is 5 s. About how many requests are dropped, assuming the drain is steady?",
      unit: "requests",
      answer: 45,
      acceptFactor: 1.1,
      breakdown: ["In 5 s it drains 5 ÷ 8 of the 120", "the remaining 3 ÷ 8 × 120 = 45 are cut off by SIGKILL"],
      explain: "The grace period has to cover the real drain time, with margin.",
    },
    {
      id: "ps-pick",
      format: "pick-fix",
      scenario: "A container's logs show 'received SIGTERM' never appears, and 'docker stop' always takes the full 10 s. The Dockerfile has ENTRYPOINT ./start.sh, which runs the app as its last line. What is the best fix?",
      options: [
        { id: "a", label: "Make start.sh finish with 'exec ./app' (or use exec form) so the app replaces the shell" },
        { id: "b", label: "Increase the grace period to 60 s" },
        { id: "c", label: "Send SIGKILL instead" },
        { id: "d", label: "Add more logging" },
      ],
      answer: "a",
      explain: "The shell script is PID 1 and holds the signal. 'exec' replaces it with the app, so the app gets SIGTERM directly.",
    },
    {
      id: "ps-order",
      format: "order",
      scenario: "Order these setups by in-flight requests dropped on stop, most first (an 8 s drain).",
      items: [
        { id: "shell", label: "Shell form, with a handler" },
        { id: "g4", label: "Exec form with a handler, 4 s grace period" },
        { id: "g6", label: "Exec form with a handler, 6 s grace period" },
        { id: "good", label: "Exec form with a handler, 10 s grace period" },
      ],
      answer: ["shell", "g4", "g6", "good"],
      explain: "120, 60, 30 and 0. The shell never passes the signal on; a short grace period cuts the drain off.",
    },
    {
      id: "ps-graph",
      format: "predict-graph",
      scenario: "With a working handler that needs 8 s to drain, how do requests dropped change as the grace period rises from 2 s to 14 s?",
      xLabel: "grace period →",
      yLabel: "requests dropped",
      options: [
        { id: "fall", label: "Falls to zero at 8 s, then stays there", points: [90, 60, 30, 0, 0, 0, 0, 0] },
        { id: "linear", label: "Falls to zero at 14 s", points: [105, 90, 75, 60, 45, 30, 15, 0] },
        { id: "flat", label: "Does not change", points: [120, 120, 120, 120, 120, 120, 120, 120] },
      ],
      answer: "fall",
      explain: "Once the grace period covers the drain, nothing is cut off. More grace than that only delays a stuck shutdown.",
    },
    {
      id: "ps-flaw",
      format: "spot-flaw",
      scenario: "A Dockerfile runs 'CMD npm start', and npm launches the server as a child. On stop, the server keeps running until it is killed. Tap the hop that loses the signal.",
      diagram: {
        nodes: [
          { id: "rt", label: "runtime: SIGTERM to PID 1", kind: "worker", col: 0, row: 1 },
          { id: "npm", label: "npm (PID 1)", kind: "server", col: 1, row: 1 },
          { id: "app", label: "node server (child)", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "rt", to: "npm" },
          { from: "npm", to: "app" },
        ],
      },
      answer: "npm->app",
      explain: "The wrapper does not forward the signal to its child. Run the server directly with exec form, or use an init that forwards.",
    },
    {
      id: "ps-explain",
      format: "explain",
      scenario: "In two sentences: why can SIGKILL not be handled, and why is that useful?",
      rubric: [
        { id: "kernel", criterion: "SIGKILL is handled by the kernel itself, which removes the process without running any of its code" },
        { id: "backstop", criterion: "It guarantees a stuck or ignoring process can always be stopped, so SIGTERM can be a polite request with SIGKILL as the backstop" },
      ],
      exemplar: "SIGKILL is handled by the kernel itself, which removes the process without running any of its code. That guarantees a stuck or uncooperative process can always be stopped, so SIGTERM can be a polite request with SIGKILL as the backstop.",
      explain: "Ask politely first. Have something that always works second.",
    },
  ],
  codex: {
    oneLiner: "Stopping is a signal to PID 1: TERM, a grace period, then KILL. Use exec form, a SIGTERM handler, an init and enough grace.",
    keyNumbers: [
      { label: "Default grace period in Docker and Kubernetes", value: "10 s and 30 s", sourceId: "pod-termination" },
      { label: "Zombies from an app that never reaps 60 helpers an hour", value: "1,440 a day", sourceId: "tini" },
    ],
    tradeoffs: [
      { choice: "Exec form", gain: "App receives signals", cost: "No shell features in CMD" },
      { choice: "Longer grace period", gain: "More room to drain", cost: "Slower deploys when a process hangs" },
      { choice: "A tiny init", gain: "Signals forwarded, zombies reaped", cost: "One more binary in the image" },
    ],
    seenIn: ["Docker's --init flag and Kubernetes preStop hooks.", "Every graceful-shutdown handler in a web framework."],
    interviewAngle: "Say: 'SIGTERM then SIGKILL after a grace period; PID 1 is special; exec form, a handler that drains, an init, and grace longer than the drain'.",
    aws: [{ concept: "Stop timeouts", service: "ECS stopTimeout; load balancer deregistration delay" }],
    replay: { id: "signal-lab", config: PS, scene: "exec" },
  },
  interview: [
    "What happens when you run docker stop?",
    "Why does PID 1 in a container behave differently?",
    "What is a zombie process?",
  ],
  deeper: [
    {
      title: "Draining behind a load balancer",
      body: "Stopping gracefully also means telling the load balancer to stop sending new requests before the process exits. A pre-stop delay of a few seconds, or a readiness flip on SIGTERM, lets the balancer notice, and the app then finishes what it has. The shutdown order is: stop accepting, finish in-flight work, close connections, exit.",
      sourceIds: ["pod-termination"],
    },
  ],
  honestPhysics: [
    "A runtime sends SIGTERM to PID 1, waits for the grace period (10 s in these figures), then SIGKILL. The app needs 8 s to finish 120 in-flight requests once told to stop, and starts a helper process 60 times an hour.",
    "In shell form the shell is PID 1 and does not forward the signal, so the app is killed at the deadline. In exec form an app with a handler drains; an app without one is ignored when it is PID 1, and terminated at once behind an init. Without an init nobody reaps the exited helpers. Round figures.",
  ],
  sources: [SIGNAL_MAN, DOCKERFILE_CMD, POD_TERM, TINI],
  verify: [
    { id: "shell", claim: "Shell form with a handler is killed at the 10 s deadline", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "shell", handles: true, init: false }, metric: "stopSec" }, expect: { min: 10, max: 10 } },
    { id: "shell-drops", claim: "…dropping all 120 requests", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "shell", handles: true, init: false }, metric: "droppedRequests" }, expect: { min: 120, max: 120 } },
    { id: "exec", claim: "Exec form with a handler stops cleanly in 8 s", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "exec", handles: true, init: false }, metric: "stopSec" }, expect: { min: 8, max: 8 } },
    { id: "zombies", claim: "Without an init 60 zombies pile up an hour", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "exec", handles: true, init: false }, metric: "zombiesPerHour" }, expect: { min: 60, max: 60 } },
    { id: "short", claim: "A 4 s grace period drops 60 requests", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "exec", handles: true, init: true, grace: 4 }, metric: "droppedRequests" }, expect: { min: 59, max: 61 } },
    { id: "good", claim: "Exec form, a handler and an init meet the target", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "exec", handles: true, init: true, grace: 10 }, metric: "gracefulShutdown" }, expect: { min: 1 } },
    { id: "noh", claim: "An init without a handler terminates the app at once and drops everything", run: "lab", params: { model: "signal-lab", config: PS_CHALLENGE, values: { form: "exec", handles: false, init: true }, metric: "droppedRequests" }, expect: { min: 120, max: 120 } },
  ],
});
