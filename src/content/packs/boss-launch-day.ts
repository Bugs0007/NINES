import { defineBoss, SRC } from "../define";

export const LAUNCH = {
  cpu: { kind: "lognormal", median: 0.012, p99: 0.05 },
  io: { kind: "lognormal", median: 0.05, p99: 0.2 },
  baseRps: 50,
  peakRps: 400,
  spikeRps: 650,
  users: 5000,
  durationS: 240,
  fromS: 10,
  budget: 600,
  sloP99: 0.6,
  seed: "launch-day",
};

export default defineBoss({
  id: "boss-launch-day",
  title: "Boss: Launch Day",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "launch",
    alert: { severity: "page", title: "Product Hunt", detail: "Pigeon launches at 00:01 PT. Everything you built this chapter, at once." },
    lines: [{ speaker: "kabir", line: "Product Hunt resets at 00:01 Pacific. In September that's 12:31 in the afternoon for us, so I skipped lunch." }],
  },
  intro: [
    { speaker: "kabir", line: "We're launching on Product Hunt this afternoon. I may have also scheduled a tweet." },
    { speaker: "meera", line: "Things will break today. Design so they break small." },
    { speaker: "rao", line: "The budget is six hundred dollars a month. That is not an opening offer." },
  ],
  forecast: {
    metric: "p99",
    prompt: "Before you go live: what p99 will your design deliver over the whole launch?",
    unit: "ms",
    scale: 1000,
    min: 20,
    max: 20000,
    tolerance: 1.6,
  },
  exercises: ["littles-law", "queueing-utilization", "scale-up-vs-out", "load-balancing", "stateless-services", "latency-numbers"],
  challenge: {
    id: "launch",
    title: "Survive the launch",
    brief: "Traffic ramps to 400 req/s with a spike to 650. Each request needs about 15ms of CPU and 60ms waiting on Postgres. Expect a noisy neighbour, a crashed app process, and a hotfix deploy. Design the fleet, then go live.",
    line: { speaker: "meera", line: "Read the timeline. None of it is a surprise except which box." },
    widget: { id: "launch-builder", config: LAUNCH },
    conditions: [
      { metric: "p99", op: "<", value: 0.6, label: "p99 under 600 ms across the launch" },
      { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
      { metric: "sessionLoss", op: "<", value: 0.01, label: "Under 1% of requests logged out" },
      { metric: "costPerMonth", op: "<=", value: 600, label: "Bill under $600/month" },
      { metric: "memFits", op: ">=", value: 1, label: "Workers fit in RAM" },
    ],
    stars: [
      { metric: "costPerMonth", op: "<=", value: 500, label: "Bill under $500/month" },
      { metric: "p99", op: "<", value: 0.45, label: "p99 under 450 ms" },
    ],
    hints: [
      "Go through the timeline event by event and ask which of your choices handles each one.",
      "Each request spends most of its time waiting on Postgres. How many requests is each box holding at once at 650 req/s, and how many workers did you give it?",
      "A box will die at the peak and another will be slow. How busy are the survivors then, and where does your balancer send traffic?",
    ],
  },
  debrief: [
    { id: "workers", text: "Workers, not cores. Each box holds its share of λ times W: at 650 req/s over seven boxes and about 75ms per request, roughly 7 in flight per box, more when one dies. Gunicorn's (2 × vCPU) + 1 starting point gives a 2-vCPU box 5 workers, which run out long before the CPU does. Little's Law sizes them.", sourceIds: ["gunicorn-workers", "little-1961"], derived: true },
    { id: "headroom", text: "Headroom for the worst minute. The spike, a slow box, and a dead box all land on the survivors. Sized for the average, they sit on the vertical part of the hockey stick." },
    { id: "fleet", text: "Small boxes, N−1. Losing one of seven costs a seventh; losing one of three costs a third. Scaling out wasn't about speed, it was about how much a failure hurts." },
    { id: "lb", text: "A balancer that notices. Least-outstanding routes around the noisy neighbour; passive ejection stops the dead box from becoming a black hole the moment it fails." },
    { id: "state", text: "Nobody logged out. The hotfix deploy restarted a box mid-launch. Sessions in Redis or a signed cookie make that invisible." },
  ],
  outro: { speaker: "kabir", line: "We survived Product Hunt. I'm telling TechCrunch we're web scale." },
  explainBack: {
    prompt: "Walk Kabir through your launch design in three or four sentences: how you sized it, and which choice handled which failure.",
    rubric: [
      { id: "size", criterion: "Sizes capacity from the peak with headroom (utilization), and workers from in-flight requests (Little's Law)", keyIdea: "sizing from λ and W" },
      { id: "n1", criterion: "Uses several boxes so losing one at peak is survivable (N−1)", keyIdea: "N−1" },
      { id: "lb", criterion: "Load balancer choice handles the slow box and the dead box (least-outstanding plus ejection or health checks)", keyIdea: "routing around failure" },
      { id: "state", criterion: "Keeps the app stateless so restarts and deploys don't log users out", keyIdea: "sessions off-box" },
    ],
    exemplar:
      "I sized for the 650 req/s spike, not the average: enough vCPUs to stay around 70% busy even after losing a box, and enough gunicorn workers per box for about λ × W requests in flight plus headroom, within RAM. Seven small boxes mean one crashed box costs a seventh of capacity. Least-outstanding routing avoided the noisy neighbour and passive ejection pulled the dead box out immediately. Sessions live in a signed cookie, so the hotfix deploy didn't log anyone out.",
  },
  honestPhysics: [
    "The balancer offers passive ejection and least outstanding together. A real ALB has neither passive outlier ejection nor anomaly mitigation with least outstanding requests; for ejection you'd put Envoy or a service mesh behind it.",
    "The crash is a dead app process behind a live nginx, so requests fail instantly. A host that hangs (a kernel panic) sends nothing back, and the ALB waits out its connect timeout instead.",
    "Workers are sync at about 150 MB each. An I/O-bound Django app would often use gthread or gevent workers (or --threads) rather than 16 sync workers on 2 vCPUs.",
    "Clients retry once after up to 100 ms.",
  ],
  sources: [SRC.gunicornWorkers, SRC.little1961],
  verify: [
    { id: "single-box", claim: "One big box dies with the crash", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.2xlarge", count: 1, workers: 17, algorithm: "round-robin", outlier: false, hc: "shallow", session: "local" }, metric: "errorRate" }, expect: { min: 0.3 } },
    { id: "default-workers", claim: "Gunicorn's (2 × vCPU) + 1 starting point runs out (Little's Law)", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 5, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "redis" }, metric: "p99" }, expect: { min: 0.6 } },
    { id: "rr-noisy", claim: "Round-robin drowns in the noisy neighbour", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 16, algorithm: "round-robin", outlier: false, hc: "shallow", session: "redis" }, metric: "errorRate" }, expect: { min: 0.01 } },
    { id: "blackhole", claim: "Least-outstanding without ejection black-holes the crash", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: false, hc: "shallow", session: "redis" }, metric: "errorRate" }, expect: { min: 0.01 } },
    { id: "memory-sessions", claim: "In-memory sessions log users out", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "local" }, metric: "sessionLoss" }, expect: { min: 0.01 } },
    { id: "good-7", claim: "Seven large, 16 workers, least-outstanding + ejection, cookie sessions: p99 holds", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "cookie" }, metric: "p99" }, expect: { max: 0.45 } },
    { id: "good-7-err", claim: "…with errors under 1%", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 7, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "cookie" }, metric: "errorRate" }, expect: { max: 0.01 } },
    { id: "lean-6", claim: "A lean six-box design also wins", run: "launch", params: { config: LAUNCH, design: { instance: "m7i.large", count: 6, workers: 16, algorithm: "least-outstanding", outlier: true, hc: "shallow", session: "cookie" }, metric: "p99" }, expect: { max: 0.6 } },
  ],
});
