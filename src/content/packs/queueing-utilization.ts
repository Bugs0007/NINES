import { definePack, SRC } from "../define";

const HOCKEY = {
  variant: "hockey",
  label: "resize-1",
  cpu: { kind: "exp", mean: 0.02 },
  cores: 1,
  workers: 1,
  seed: "hockey",
};

export const CAPACITY = {
  variant: "capacity",
  label: "resize",
  cpu: { kind: "lognormal", median: 0.02, p99: 0.12 },
  peakRps: 140,
  baseRps: 40,
  usdPerCoreMonth: 36.8,
  maxCores: 12,
  durationS: 90,
  fromS: 35,
  sloP99: 0.2,
  seed: "capacity",
};

const KINGMAN = { id: "kingman-1961", title: "J.F.C. Kingman (1961), The single server queue in heavy traffic, Proc. Cambridge Philosophical Society 57(4)", url: "https://doi.org/10.1017/S0305004100036094" };
const AWS_TT = { id: "aws-target-tracking", title: "AWS docs: Target tracking scaling policies for Amazon EC2 Auto Scaling", url: "https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html" };

export default definePack({
  id: "queueing-utilization",
  title: "Utilization & the Hockey Stick",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "p99 latency · resize service", detail: "90ms → 2.4s" },
    lines: [
      { speaker: "kabir", line: "Traffic went up 30% and latency went up twenty-five times. How is that legal?" },
      { speaker: "meera", line: "You had 30% headroom on average. Queues don't care about your average." },
    ],
  },
  predictions: [
    {
      id: "double",
      kind: "choice",
      prompt: "One worker, requests take 20ms on average, arrivals are random. Traffic doubles, taking the box from 45% busy to 90% busy. What happens to average latency?",
      options: [
        { id: "x2", label: "About 2× (twice the traffic)" },
        { id: "x3", label: "About 3×" },
        { id: "x5", label: "About 5×" },
        { id: "x20", label: "About 20×" },
      ],
      answer: "x5",
      observe: "rho-high",
      reveal: {
        text: "Average time in system goes from about 1.8× the service time to 10×: roughly 5.5 times slower for twice the traffic. The formula is S ÷ (1 − ρ), and as ρ approaches 1 the denominator collapses.",
        sourceIds: ["harchol-balter"],
        line: { speaker: "meera", line: "Linear intuition, meet a nonlinear system." },
      },
    },
  ],
  widget: { id: "queue-lab", config: HOCKEY },
  mechanism: [
    {
      id: "bunching",
      scene: "curve",
      text: "Arrivals are random. Even below capacity, requests sometimes arrive in bunches, and a bunch has to wait its turn. The busier the server, the less idle time it has to clear one bunch before the next one lands.",
    },
    {
      id: "formula",
      scene: "curve",
      text: "For one server with random arrivals and service times, average time in system is S ÷ (1 − ρ). At 50% busy that's 2× the service time. At 80%, 5×. At 90%, 10×. At 99%, 100×.",
      sourceIds: ["harchol-balter"],
    },
    {
      id: "stick",
      scene: "curve",
      text: "That's the hockey stick: flat, flat, then vertical. On the flat part, a traffic bump barely registers. Near the top, going from 85% to 95% busy triples the average wait. Your capacity plan lives or dies by which part of the curve your peak sits on.",
      derived: true,
    },
    {
      id: "headroom",
      text: "Variance makes it worse: GC pauses, slow queries, and bursty clients all behave like extra load. Kingman's formula scales the wait by how variable arrivals and service times are. Plan for the peak, not the average, and leave headroom.",
      sourceIds: ["kingman-1961"],
    },
  ],
  challenges: [
    {
      id: "peak-plan",
      title: "Plan the peak",
      brief: "Pigeon's image-resize service is CPU-bound: about 27ms of CPU per request, one worker per vCPU. Tonight's peak is 140 req/s. Pick the fleet size that keeps p99 under 200ms at peak without wasting money.",
      line: { speaker: "rao", line: "Each vCPU is thirty-seven dollars a month. I have counted them." },
      widget: { id: "queue-lab", config: CAPACITY },
      conditions: [
        { metric: "p99", op: "<", value: 0.2, label: "p99 under 200 ms through the peak" },
        { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
        { metric: "costPerMonth", op: "<=", value: 260, label: "Under $260/month" },
      ],
      stars: [{ metric: "cores", op: "<=", value: 5, label: "Cheapest fleet that holds" }],
      hints: [
        "Before running anything: how busy would each option be at the peak?",
        "Busy fraction = arrival rate × service time ÷ vCPUs. Where does that land on the hockey stick?",
        "An option that averages under 100% busy can still wreck the tail. How much headroom does the curve say you need?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why does latency explode as a server approaches 100% busy, even though it isn't technically overloaded yet?",
    rubric: [
      { id: "random", criterion: "Random arrivals bunch up, so requests queue even when average load is below capacity", keyIdea: "variability causes waiting below saturation" },
      { id: "nonlinear", criterion: "Waiting grows nonlinearly, like ρ/(1−ρ), so the last few percent of utilization cost the most", keyIdea: "hockey stick" },
      { id: "headroom", criterion: "Draws the practical conclusion: plan capacity for peak with headroom, not for the average", keyIdea: "headroom" },
    ],
    exemplar:
      "Arrivals are random, so even below capacity requests sometimes bunch up and wait. The time spent waiting grows like ρ/(1−ρ), so it barely moves at 50% busy but explodes as utilization nears 100%, where any bunch takes ages to clear. That's why you size for the peak with headroom instead of running near full.",
  },
  reviews: [
    {
      id: "qu-est-80",
      format: "estimate",
      scenario: "One server, 10ms per request on average, random arrivals. It's 80% busy. Roughly what's the average time a request spends in the system?",
      unit: "ms",
      answer: 50,
      acceptFactor: 1.4,
      breakdown: ["W = S ÷ (1 − ρ)", "10ms ÷ (1 − 0.8)", "= 50ms"],
      explain: "At 80% busy the average request spends 5× its service time in the system. Most of that is waiting in line.",
    },
    {
      id: "qu-graph",
      format: "predict-graph",
      scenario: "Utilization climbs steadily from 10% to 95% over an hour. What does average latency do?",
      xLabel: "utilization →",
      yLabel: "avg latency",
      options: [
        { id: "linear", label: "Rises in a straight line", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "hockey", label: "Flat, then shoots up near the end", points: [1, 1.1, 1.2, 1.4, 1.7, 2.3, 4, 12] },
        { id: "flat", label: "Stays flat until 100%, then fails", points: [1, 1, 1, 1, 1, 1, 1, 9] },
        { id: "sqrt", label: "Rises fast early, then levels off", points: [1, 4, 5.5, 6.5, 7, 7.4, 7.7, 7.9] },
      ],
      answer: "hockey",
      explain: "S ÷ (1 − ρ) is nearly flat at low ρ and vertical near 1. Most of the damage happens in the last 15%.",
    },
    {
      id: "qu-pick-cfo",
      format: "pick-fix",
      scenario: "Four API boxes hit 85% CPU at the daily peak; average CPU across the day is 55%. The CFO wants to drop one box. What do you say?",
      options: [
        { id: "a", label: "Drop it: 55% average means plenty of headroom" },
        { id: "b", label: "Keep it: peak sets the tail, and three boxes push the peak past 100%" },
        { id: "c", label: "Drop it and enable swap on the others" },
        { id: "d", label: "Swap all four for burstable instances" },
      ],
      answer: "b",
      explain: "The same peak load on three boxes is 85% × 4 ÷ 3 ≈ 113%: over capacity, so the queue grows without limit at every peak. Size from the peak, not the daily average.",
      why: {
        prompt: "What happens to peak utilization with three boxes?",
        options: [
          { id: "a", label: "About 113%: overloaded every peak" },
          { id: "b", label: "Still 85%" },
          { id: "c", label: "About 64%" },
        ],
        answer: "a",
      },
    },
    {
      id: "qu-order",
      format: "order",
      scenario: "One server with 10ms average service time. Order these by average time in system, fastest first.",
      items: [
        { id: "u50", label: "50% busy" },
        { id: "u90", label: "90% busy" },
        { id: "u20", label: "20% busy" },
        { id: "u75", label: "75% busy" },
      ],
      answer: ["u20", "u50", "u75", "u90"],
      explain: "12.5ms, 20ms, 40ms, 100ms. The gap from 75% to 90% is bigger than everything before it.",
    },
    {
      id: "qu-tune",
      format: "tune",
      scenario: "150 req/s of CPU-bound work, 20ms per request, one worker per vCPU. Find the fewest vCPUs that keep p99 under 120ms.",
      tuneScenario: "qu-cores",
      param: { label: "vCPUs", min: 2, max: 10, step: 1, unit: "" },
      target: { metric: "p99", op: "<", value: 0.12, label: "p99 under 120 ms" },
      explain: "Offered load is 150 × 0.02 = 3 vCPUs' worth of work. Three would be 100% busy; the tail needs real headroom above that.",
    },
    {
      id: "qu-flaw",
      format: "spot-flaw",
      scenario: "Tomorrow is Black Friday, with twice the usual peak. Tap the component that hurts you first.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "ALB", kind: "lb", col: 1, row: 1 },
          { id: "api", label: "api fleet · 48% busy at peak", kind: "server", col: 2, row: 1 },
          { id: "db", label: "postgres · 55% busy at peak", kind: "db", col: 3, row: 0 },
          { id: "cache", label: "redis · 8% busy", kind: "cache", col: 3, row: 2 },
        ],
        edges: [
          { from: "users", to: "lb" },
          { from: "lb", to: "api" },
          { from: "api", to: "db" },
          { from: "api", to: "cache" },
        ],
      },
      answer: "db",
      explain: "Double the peak: the API goes to about 96% busy, Postgres to 110%. Only the database is over capacity, and it's the hardest thing here to scale overnight.",
    },
    {
      id: "qu-explain-headroom",
      format: "explain",
      scenario: "In two sentences: why do teams keep servers well below 100% busy at peak instead of squeezing out every cycle?",
      rubric: [
        { id: "curve", criterion: "Latency grows nonlinearly near full utilization" },
        { id: "spikes", criterion: "Headroom absorbs spikes, variance, and failover when a box dies" },
      ],
      exemplar: "Queueing delay explodes as utilization approaches 100%, so a box at 95% has terrible tail latency even before it's overloaded. Headroom also absorbs traffic spikes, slow requests, and the extra load when another box fails.",
      explain: "Headroom isn't waste; it's what keeps the tail flat and survives the bad hour.",
    },
  ],
  codex: {
    oneLiner: "Waiting grows like ρ ÷ (1 − ρ): flat at low load, vertical near 100%. Plan for the peak and keep headroom.",
    keyNumbers: [
      { label: "M/M/1 time in system", value: "S ÷ (1 − ρ)", sourceId: "harchol-balter" },
      { label: "At 50% / 80% / 90% busy", value: "2× / 5× / 10× S", sourceId: "harchol-balter" },
      { label: "M/M/1 p99 time in system", value: "≈ 4.6 × S ÷ (1 − ρ)", sourceId: "harchol-balter" },
      { label: "Kingman's heavy-traffic wait", value: "≈ ρ/(1−ρ) · (Ca²+Cs²)/2 · S", sourceId: "kingman-1961" },
    ],
    tradeoffs: [
      { choice: "Run hot at peak", gain: "Fewer servers, lower bill", cost: "Tails are fragile: a small spike or a slow dependency tips it over" },
      { choice: "Keep headroom at peak", gain: "Stable tails, room for spikes and for losing a box", cost: "You pay for capacity that idles most of the day" },
      { choice: "Shed load when the queue grows", gain: "Protects latency for the requests you accept", cost: "Some users get fast errors instead of slow successes" },
    ],
    seenIn: [
      "Case Intel's t3.micro fan-out: once CPU credits ran out, capacity dropped to the baseline and the box sat at 100% with a growing queue.",
      "Every Postgres that is fine at noon and crawling at month-end is sitting on the steep part of this curve.",
    ],
    interviewAngle: "Say your utilization target out loud when sizing: 'I'll plan for roughly 60 to 70% at peak because latency goes nonlinear past that.' Then back it with ρ/(1−ρ).",
    aws: [
      { concept: "Utilization target", service: "EC2 Auto Scaling target tracking", note: "e.g. average CPU 50–60%" },
      { concept: "Latency under load", service: "ALB TargetResponseTime (p99)" },
    ],
    otherClouds: "GCP: managed instance group autoscaling on CPU target · Azure: VM Scale Sets autoscale rules",
    replay: { id: "queue-lab", config: HOCKEY },
  },
  interview: [
    "Your service is at 70% CPU at peak. Is that fine? What would make you nervous?",
    "Why does p99 degrade before p50 as load rises?",
    "How would you decide when to add capacity: CPU, queue depth, or latency?",
  ],
  deeper: [
    {
      title: "Where S ÷ (1 − ρ) comes from",
      body: "For an M/M/1 queue (Poisson arrivals at rate λ, exponential service at rate μ, one server), the number in the system is geometric: P(n) = (1 − ρ)ρⁿ with ρ = λ/μ. Its mean is ρ/(1 − ρ). By Little's Law, W = L/λ = 1/(μ − λ) = S/(1 − ρ). The time in system is itself exponential with rate μ − λ, so its p99 is ln(100)/(μ − λ) ≈ 4.6 × S/(1 − ρ).",
      sourceIds: ["harchol-balter"],
    },
    {
      title: "Variance: Kingman's formula",
      body: "Real traffic isn't exponential. For a single server with general arrivals and service (G/G/1) in heavy traffic, the average wait is roughly ρ/(1 − ρ) × (Ca² + Cs²)/2 × S, where Ca and Cs are the coefficients of variation of inter-arrival and service times. Bursty clients (high Ca) and occasional slow requests (high Cs) multiply the wait. Cutting variance, for example by fixing the slow query, moves you down the curve as effectively as adding servers.",
      sourceIds: ["kingman-1961"],
    },
    {
      title: "Pooling: one line, many servers",
      body: "Five cores pulling from one shared queue (M/M/5) wait far less than five separate single-server queues at the same utilization, because an idle server never sits next to a waiting request. That's why a multi-worker box can run hotter than a single-threaded one, and it's the latency argument for one big shared queue in the next mission.",
    },
    {
      title: "When the peak is too much: shed load",
      body: "If you can't add capacity in time, protect the requests you do serve: cap the queue, reject early with a fast error, and let clients back off. Google's SRE book calls this handling overload: serving degraded or rejecting cheaply beats timing out everyone.",
      sourceIds: ["sre-book-overload"],
    },
  ],
  honestPhysics: [
    "The play box has exponential service times, which matches the M/M/1 curve drawn behind it. The challenge uses a heavier-tailed lognormal, closer to real request timings.",
  ],
  sources: [SRC.harcholBalter, KINGMAN, SRC.sreBookOverload, AWS_TT],
  verify: [
    { id: "ratio", claim: "Doubling load from 45% to 90% makes average latency about 5.5× worse", run: "queue-ratio", params: { from: 0.45, to: 0.9, S: 0.02 }, expect: { min: 4.5, max: 6.8 } },
    { id: "four-fails", claim: "4 vCPUs (about 94% busy at peak) break the 200ms p99", run: "queue-challenge", params: { config: CAPACITY, choice: 4, metric: "p99" }, expect: { min: 0.2 } },
    { id: "five-holds", claim: "5 vCPUs hold p99 under 200ms", run: "queue-challenge", params: { config: CAPACITY, choice: 5, metric: "p99" }, expect: { max: 0.2 } },
  ],
});
