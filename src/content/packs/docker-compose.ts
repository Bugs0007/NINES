import { definePack } from "../define";

export const DCO = { start: { depends: "healthy", health: true, retry: false, restart: "no" } };
export const DCO_CHALLENGE = { start: { depends: "started", health: false, retry: false, restart: "no" } };

const COMPOSE_ORDER = { id: "compose-startup-order", title: "Docker docs: Control startup and shutdown order in Compose (depends_on, healthchecks)", url: "https://docs.docker.com/compose/how-tos/startup-order/" };
const COMPOSE_FILE = { id: "compose-file", title: "Docker docs: Compose file reference (services, networks, volumes, restart)", url: "https://docs.docker.com/reference/compose-file/" };
const HEALTHCHECK = { id: "dockerfile-healthcheck", title: "Docker docs: HEALTHCHECK instruction", url: "https://docs.docker.com/reference/dockerfile/#healthcheck" };

export default definePack({
  id: "docker-compose",
  title: "Docker Compose",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "warn", title: "compose up · api exited with code 1 (connection refused)", detail: "db: starting, ready in 12 s" },
    lines: [
      { speaker: "kabir", line: "docker compose up fails the first time and works if I run it again. The new hires think the repo is broken." },
      { speaker: "meera", line: "Compose starts containers in order. It does not wait for what is inside them to be ready unless you tell it how to tell." },
    ],
  },
  predictions: [
    {
      id: "race",
      kind: "choice",
      prompt: "The API depends on the database with 'started' ordering. The database takes 12 s to accept connections, the API fails if it cannot connect, and there is no restart policy. What happens?",
      options: [
        { id: "works", label: "It works, depends_on waits for the database" },
        { id: "down", label: "The API exits at once and stays down" },
        { id: "retry", label: "Compose retries it automatically" },
      ],
      answer: "down",
      observe: "race",
      reveal: {
        text: "'Started' means the database container has been launched, not that Postgres inside it is listening. The API boots in 2 s, finds nothing at the port and exits with an error. With no restart policy Compose leaves it stopped. This is the classic first-run failure that works on the second try.",
        derived: true,
        line: { speaker: "rao", line: "Started is a fact about the process. Ready is a fact about the service." },
      },
    },
    {
      id: "stuck",
      kind: "choice",
      prompt: "You switch to 'service_healthy' ordering but never define a healthcheck for the database. What happens?",
      options: [
        { id: "fine", label: "Compose guesses and waits a sensible time" },
        { id: "never", label: "The API waits for a health status that never comes and the stack never starts" },
        { id: "ignore", label: "It falls back to started ordering" },
      ],
      answer: "never",
      observe: "stuck",
      reveal: {
        text: "Compose can only wait for a signal the container reports. With no healthcheck there is no health status to become healthy, and the dependent service is stuck or the up command reports an error. The condition and the check go together; one without the other is a bug.",
        derived: true,
        line: { speaker: "meera", line: "A condition with nothing behind it waits forever." },
      },
    },
  ],
  widget: { id: "compose-lab", config: DCO },
  mechanism: [
    {
      id: "file",
      text: "Compose describes a multi-container application in one file: services, the images or builds behind them, environment, ports, volumes and networks. 'docker compose up' creates a private network, attaches every service to it, and starts them. Services reach each other by name. The file is code, so it goes in version control beside the application.",
      sourceIds: ["compose-file"],
    },
    {
      id: "order",
      text: "By default depends_on only controls start order: a dependency's container starts first. It does not know whether the program inside is ready. A database can take seconds to initialise, and a dependent service that connects immediately fails. Start order is a convenience for launching, and it is not a readiness guarantee.",
      sourceIds: ["compose-startup-order"],
    },
    {
      id: "healthy",
      scene: "healthy",
      text: "Define a healthcheck: a command that succeeds when the service really works, such as pg_isready for Postgres. Then ask for the condition service_healthy and Compose holds back the dependent service until the check passes. It needs both pieces, and the check should test what the dependent service actually needs.",
      sourceIds: ["compose-startup-order", "dockerfile-healthcheck"],
    },
    {
      id: "retry",
      scene: "retry",
      text: "Make the application tolerant. Services start in any order in production, in orchestrators that give no ordering guarantee at all, and databases restart. An application that retries its connection with a short backoff survives all of it. A restart policy is a backstop for crashes, and it makes failures noisy and slow when used as the only strategy.",
      sourceIds: ["compose-file"],
    },
  ],
  challenges: [
    {
      id: "write-compose",
      title: "Write the Compose file",
      brief: "The stack must come up on the first try, with no crash restarts, and be ready within 20 seconds.",
      line: { speaker: "rao", line: "One command should work for a new hire." },
      widget: { id: "compose-lab", config: DCO_CHALLENGE },
      conditions: [
        { metric: "worksFirstTry", op: ">=", value: 1, label: "Comes up on the first try" },
        { metric: "crashRestarts", op: "<=", value: 0, label: "No crash restarts" },
        { metric: "readySec", op: "<=", value: 20, label: "Ready within 20 s" },
      ],
      stars: [{ metric: "readySec", op: "<=", value: 14, label: "Ready within 14 s" }],
      hints: ["What does 'started' tell Compose?", "What does 'healthy' need?", "What would make the app robust to any order?"],
    },
  ],
  explainBack: {
    prompt: "Explain why a Compose stack can fail on first start and how to fix it.",
    rubric: [
      { id: "order", criterion: "depends_on by default waits only for the container to start, not for the service inside to be ready", keyIdea: "started is not ready" },
      { id: "health", criterion: "A healthcheck plus the service_healthy condition holds back the dependent service until the dependency works", keyIdea: "healthcheck and condition" },
      { id: "retry", criterion: "Make the application retry its connections with backoff, so it works in any order and after restarts; restart policies are a backstop", keyIdea: "resilient clients" },
    ],
    exemplar:
      "By default depends_on waits only for the dependency's container to start, not for the service inside it to be ready, so the API can try to connect to a database that is still initialising and exit. I would add a healthcheck to the database and use the service_healthy condition. Better still, I would make the application retry its connections with backoff so it works in any order and after restarts, with a restart policy only as a backstop.",
  },
  reviews: [
    {
      id: "dco-est",
      format: "estimate",
      scenario: "The database is ready after 12 s. The API boots in 2 s and restarts every 5 s when it fails. How many failed starts before it works?",
      unit: "crashes",
      answer: 3,
      acceptFactor: 1.5,
      breakdown: ["Each attempt takes about 5 s including restart", "12 ÷ 5 rounds up to 3 attempts that fail"],
      explain: "Each failure also writes error logs and delays the stack. Better to wait than to crash and restart.",
    },
    {
      id: "dco-pick",
      format: "pick-fix",
      scenario: "A web service starts before its API in Compose and logs connection errors for a few seconds each time. Which fix is the most robust?",
      options: [
        { id: "a", label: "Add a healthcheck and depends_on with condition: service_healthy, and also retry connections in the client" },
        { id: "b", label: "Add a sleep of 30 seconds to the entrypoint" },
        { id: "c", label: "Start the services in separate terminals" },
        { id: "d", label: "Remove the restart policy" },
      ],
      answer: "a",
      explain: "A fixed sleep is a guess that fails when the dependency is slower. A readiness signal and a tolerant client adapt.",
    },
    {
      id: "dco-order",
      format: "order",
      scenario: "Order these Compose setups by time until the stack is ready, longest first.",
      items: [
        { id: "crash", label: "Started ordering, restart on failure, no retry" },
        { id: "retry", label: "Started ordering, client retries" },
        { id: "healthy", label: "Healthy ordering with a healthcheck" },
      ],
      answer: ["crash", "retry", "healthy"],
      explain: "17 s, 15 s and 14 s: the crash loop wastes the restart delay, retries add a second.",
    },
    {
      id: "dco-graph",
      format: "predict-graph",
      scenario: "As the database's start-up time rises from 2 s to 60 s, how does the number of API crash restarts change with started ordering and an on-failure restart policy?",
      xLabel: "database start-up →",
      yLabel: "API crash restarts",
      options: [
        { id: "rise", label: "Rises in proportion to the start-up time", points: [0, 1, 2, 4, 6, 8, 10, 12] },
        { id: "flat", label: "Stays at zero", points: [0, 0, 0, 0, 0, 0, 0, 0] },
        { id: "const", label: "Is always one", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "rise",
      explain: "Each restart interval is a fixed few seconds, so the slower the dependency, the more attempts fail.",
    },
    {
      id: "dco-flaw",
      format: "spot-flaw",
      scenario: "A Compose file hard-codes the database password in the environment section and commits it, and publishes the database port. Tap the first thing to remove.",
      diagram: {
        nodes: [
          { id: "file", label: "docker-compose.yml with password in plain text", kind: "store", col: 0, row: 1 },
          { id: "repo", label: "shared repository", kind: "external", col: 1, row: 1 },
          { id: "db", label: "database published to the host", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "file", to: "repo" },
          { from: "repo", to: "db" },
        ],
      },
      answer: "file->repo",
      explain: "Secrets in version control are copied to every clone and fork. Use an environment file that is not committed, or secrets support, and rotate what leaked.",
    },
    {
      id: "dco-explain",
      format: "explain",
      scenario: "In two sentences: why is an application that retries its connections more robust than one relying on start order?",
      rubric: [
        { id: "any", criterion: "Dependencies can be down or restarting at any time in production, not only at startup, and ordering does not cover that" },
        { id: "adapt", criterion: "Retries with backoff adapt to however long the dependency takes, with no guessed delay" },
      ],
      exemplar: "Dependencies can be down or restarting at any time in production, not only at startup, and start order does not cover that. Retries with backoff adapt to however long the dependency takes, with no guessed delay.",
      explain: "Design for the dependency being unavailable, not for the order of launch.",
    },
  ],
  codex: {
    oneLiner: "Compose runs a multi-container app from one file on a private network. depends_on orders starts, not readiness: use healthchecks and resilient clients.",
    keyNumbers: [
      { label: "Started ordering, no retry (lab)", value: "API exits, stack down", sourceId: "compose-startup-order" },
      { label: "Healthy ordering (lab)", value: "ready in 14 s", sourceId: "compose-startup-order" },
    ],
    tradeoffs: [
      { choice: "service_healthy ordering", gain: "Clean first start", cost: "Needs a good healthcheck; only covers startup" },
      { choice: "Client retries", gain: "Works in any order and after restarts", cost: "Code in every client" },
      { choice: "Restart policy only", gain: "Zero code", cost: "Crash noise and slow starts" },
    ],
    seenIn: ["Local development stacks and demo environments.", "Single-host deployments of small applications."],
    interviewAngle: "Say: 'depends_on is start order; add healthchecks for readiness, retries in the client, and treat Compose as the dev and small-deploy tool'.",
    aws: [{ concept: "Compose to cloud", service: "Amazon ECS with Compose-format deployment" }],
    replay: { id: "compose-lab", config: DCO, scene: "retry" },
  },
  interview: [
    "What does depends_on actually guarantee in Compose?",
    "How would you make a Compose stack start reliably?",
    "When is Compose the wrong tool?",
  ],
  deeper: [
    {
      title: "Where Compose stops",
      body: "Compose manages containers on one host. It has no scheduler across machines, no rolling updates with health-based gating and no self-healing beyond restart policies. That is why teams use it for development, tests and small deployments, and use an orchestrator for anything that must run across several machines with zero downtime.",
      sourceIds: ["compose-file"],
    },
  ],
  honestPhysics: [
    "A Compose stack with an API and a database. The database takes 12 s to accept connections, the API starts in 2 s and exits if it cannot connect. Started ordering does not wait for readiness.",
    "With a healthcheck and healthy ordering the stack is ready in 14 s. With client retries it is ready in 15 s. With neither, the API exits; with a restart policy it restarts every 5 s, four times here, and with none it stays down. Healthy ordering without a healthcheck never starts. Round figures.",
  ],
  sources: [COMPOSE_ORDER, COMPOSE_FILE, HEALTHCHECK],
  verify: [
    { id: "race", claim: "Started ordering with no retry and no restart leaves the API down", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: {}, metric: "worksFirstTry" }, expect: { max: 0 } },
    { id: "crash", claim: "With a restart policy it crashes four times, then works", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: { restart: "on-failure" }, metric: "crashRestarts" }, expect: { min: 3, max: 3 } },
    { id: "healthy", claim: "A healthcheck with healthy ordering is ready in 14 seconds", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: { depends: "healthy", health: true }, metric: "readySec" }, expect: { min: 14, max: 14 } },
    { id: "stuck", claim: "Healthy ordering with no healthcheck never starts", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: { depends: "healthy", health: false }, metric: "worksFirstTry" }, expect: { max: 0 } },
    { id: "retry", claim: "Client retries bring it up in 15 seconds with no crashes", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: { retry: true }, metric: "readySec" }, expect: { min: 15, max: 15 } },
    { id: "retry-crash", claim: "…with no crash restarts", run: "lab", params: { model: "compose-lab", config: DCO_CHALLENGE, values: { retry: true }, metric: "crashRestarts" }, expect: { max: 0 } },
  ],
});
