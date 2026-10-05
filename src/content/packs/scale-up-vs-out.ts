import { definePack, SRC } from "../define";

const CPU = { kind: "lognormal", median: 0.016, p99: 0.06 };

const COMPARE = { variant: "compare", cpu: CPU, bigInstance: "m7i.2xlarge", smallInstance: "m7i.large", smallCount: 4, seed: "scale" };

export const HUG = {
  variant: "hug",
  cpu: CPU,
  peakRps: 300,
  baseRps: 30,
  durationS: 150,
  fromS: 10,
  crashAt: 60,
  hcIntervalS: 5,
  sloP99: 0.2,
  seed: "scale",
  instances: ["m7i.large", "m7i.xlarge", "m7i.2xlarge", "m7i.4xlarge"],
};

const AWS_M7I = { id: "aws-m7i", title: "Amazon EC2 M7i instances (vCPU and memory per size)", url: "https://aws.amazon.com/ec2/instance-types/m7i/" };

export default definePack({
  id: "scale-up-vs-out",
  title: "Scale Up vs Scale Out",
  kind: "concept",
  estimatedMinutes: 16,
  hook: {
    visual: "launch",
    alert: { severity: "info", title: "Hacker News · front page", detail: "Show HN: Pigeon, messaging that doesn't spy on you" },
    lines: [
      { speaker: "kabir", line: "We're number three on Hacker News. Please tell me we have more than one server." },
      { speaker: "meera", line: "We have one, and it's a nice one. Bigger box or more boxes: pick fast." },
    ],
  },
  predictions: [
    {
      id: "tail",
      kind: "choice",
      prompt: "Same 8 vCPUs, same traffic, both running 80% busy: one m7i.2xlarge, or four m7i.large behind a round-robin load balancer. Which has the lower p99?",
      options: [
        { id: "big", label: "The one big box" },
        { id: "small", label: "The four small boxes" },
        { id: "same", label: "About the same: same vCPUs, same work" },
      ],
      answer: "big",
      observe: "compared",
      reveal: {
        text: "The big box wins on latency. All eight cores pull from one shared line, so a request never waits behind a busy core while another core sits idle. Four boxes means four separate lines, and round-robin can't see which one is short.",
        derived: true,
        line: { speaker: "meera", line: "Scaling out isn't free speed. It buys something else." },
      },
    },
    {
      id: "kill",
      kind: "choice",
      prompt: "Now one box dies on each side. What do users see?",
      options: [
        { id: "a", label: "Big box: total outage until it's back. Fleet: a short blip, then fine" },
        { id: "b", label: "Both: a short blip, then fine" },
        { id: "c", label: "Both: total outage" },
        { id: "d", label: "Big box: fine. Fleet: total outage" },
      ],
      answer: "a",
      observe: "killed-both",
      reveal: {
        text: "One box is a single point of failure: when it goes, everything goes. The fleet loses a quarter of its capacity and returns 502s on the dead box's share until health checks eject it (about 10 s here, up to a minute with ALB's default 30 s × 2), then runs hotter. That's what you were paying for.",
        sourceIds: ["alb-health"],
        derived: true,
      },
    },
  ],
  widget: { id: "scale-lab", config: COMPARE },
  mechanism: [
    {
      id: "up",
      scene: "pooling",
      text: "Scaling up means a bigger box, same code. One shared queue keeps latency low and nothing about your app changes. It's the right first move more often than people admit.",
    },
    {
      id: "limits",
      scene: "spof",
      text: "But a single box is a single point of failure, and resizing an EC2 instance means stopping it: minutes of downtime, at exactly the moment you need more capacity. And there is always a biggest instance.",
      sourceIds: ["aws-change-type"],
    },
    {
      id: "out",
      text: "Scaling out means many boxes behind a load balancer. Lose one, lose a fraction. Add capacity while serving traffic. The price: your app must not care which box handles a request, and you need a load balancer and health checks.",
    },
    {
      id: "n-1",
      text: "Size a fleet for N−1: when one box dies at peak, the rest must carry its share without crossing into the steep part of the hockey stick. Within a fixed-performance family like m7i, 2× the vCPUs costs 2× the money, so the choice is about failure and headroom, not instance price.",
      sourceIds: ["aws-ec2-pricing"],
    },
  ],
  challenges: [
    {
      id: "hn-hug",
      title: "The Hacker News hug",
      brief: "Traffic ramps to 300 req/s and stays there. One minute in, one of your boxes will die. Keep p99 under 200ms and errors under 1%, for under $520 a month including the load balancer.",
      line: { speaker: "rao", line: "I have been told this is 'a good problem to have'. I would like it to be a cheap one." },
      widget: { id: "scale-lab", config: HUG },
      conditions: [
        { metric: "p99", op: "<", value: 0.2, label: "p99 under 200 ms" },
        { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
        { metric: "costPerMonth", op: "<=", value: 520, label: "Under $520/month" },
      ],
      stars: [{ metric: "costPerMonth", op: "<=", value: 400, label: "Under $400/month" }],
      hints: [
        "What happens to your plan the moment the box dies? Plan for the fleet you'll have then, not the one you start with.",
        "After one box dies, how busy are the survivors at 300 req/s? Where is that on the hockey stick?",
        "Smaller boxes lose a smaller slice when one dies. Compare the cost of the same vCPUs split more ways.",
      ],
    },
  ],
  explainBack: {
    prompt: "Kabir asks why you didn't just buy one enormous server. Explain the tradeoff between scaling up and scaling out.",
    rubric: [
      { id: "up", criterion: "Scaling up is simpler and can even have better latency (one shared queue, no distribution)", keyIdea: "pooling, simplicity" },
      { id: "spof", criterion: "One box is a single point of failure, resizing needs downtime, and there's a ceiling", keyIdea: "SPOF, resize downtime, ceiling" },
      { id: "out", criterion: "Scaling out survives a box dying and adds capacity live, but needs stateless apps, a load balancer, and N−1 headroom", keyIdea: "availability, N−1" },
    ],
    exemplar:
      "One big box is simpler and its single shared queue can actually give better latency, but it's a single point of failure, resizing it means downtime, and it has a ceiling. Several smaller boxes behind a load balancer survive losing one and let us add capacity without stopping, as long as the app is stateless and the survivors have headroom to absorb a dead box's traffic.",
  },
  reviews: [
    {
      id: "su-pick-resize",
      format: "pick-fix",
      scenario: "Your single m7i.xlarge API box is at 90% CPU every evening. Launch is in two days. What's the safest move?",
      options: [
        { id: "a", label: "Resize it to m7i.4xlarge during the evening peak" },
        { id: "b", label: "Put an ALB in front and run three m7i.xlarge boxes" },
        { id: "c", label: "Raise gunicorn workers from 9 to 40" },
        { id: "d", label: "Switch to a burstable t3 instance" },
      ],
      answer: "b",
      explain: "Resizing EC2 requires a stop and start (downtime at peak). More workers can't add CPU. Three boxes behind a load balancer add capacity and survive losing one.",
      why: {
        prompt: "Why not resize during the peak?",
        options: [
          { id: "a", label: "Changing an EBS-backed instance's type requires stopping it" },
          { id: "b", label: "Bigger instances have slower CPUs" },
          { id: "c", label: "AWS doesn't allow resizing" },
        ],
        answer: "a",
      },
    },
    {
      id: "su-est-n1",
      format: "estimate",
      scenario: "Four boxes each run 60% busy at peak. One dies. How busy are the other three?",
      unit: "% busy",
      answer: 80,
      acceptFactor: 1.15,
      breakdown: ["Total work = 4 × 60% = 240% of one box", "Spread over 3 boxes = 240 ÷ 3", "= 80% each"],
      explain: "Losing one of N multiplies the survivors' load by N ÷ (N−1). At 80% you're near the steep part of the curve; start at 75% with four boxes and the survivors are at 100%.",
    },
    {
      id: "su-order-cost",
      format: "order",
      scenario: "Same total vCPUs. Order these fleets by how much capacity you lose when one box dies, least first.",
      items: [
        { id: "a", label: "1 × m7i.4xlarge (16 vCPU)" },
        { id: "b", label: "2 × m7i.2xlarge (8 vCPU each)" },
        { id: "c", label: "8 × m7i.large (2 vCPU each)" },
        { id: "d", label: "4 × m7i.xlarge (4 vCPU each)" },
      ],
      answer: ["c", "d", "b", "a"],
      explain: "12.5%, 25%, 50%, 100%. More, smaller boxes make each failure smaller, at the cost of more moving parts and less pooling per box.",
    },
    {
      id: "su-flaw-spof",
      format: "spot-flaw",
      scenario: "This design survived load testing. Tap the part that takes the whole product down when it fails.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "ALB (multi-AZ)", kind: "lb", col: 1, row: 1 },
          { id: "a", label: "app-1", kind: "server", col: 2, row: 0 },
          { id: "b", label: "app-2", kind: "server", col: 2, row: 2 },
          { id: "db", label: "postgres (one EC2 box)", kind: "db", col: 3, row: 1 },
        ],
        edges: [
          { from: "users", to: "lb" },
          { from: "lb", to: "a" },
          { from: "lb", to: "b" },
          { from: "a", to: "db" },
          { from: "b", to: "db" },
        ],
      },
      answer: "db",
      explain: "The app tier scales out, but every request still needs the single database box. Replication and failover (chapter A6) remove that single point of failure.",
    },
    {
      id: "su-graph-pool",
      format: "predict-graph",
      scenario: "As load rises from 30% to 90%, how do the p99s of one 8-vCPU box and four 2-vCPU boxes compare?",
      xLabel: "load →",
      yLabel: "p99",
      options: [
        { id: "same", label: "Identical curves", points: [1, 1.1, 1.2, 1.4, 1.8, 2.5, 4, 7] },
        { id: "big-better", label: "Both rise; the four boxes rise sooner and higher", points: [1, 1.1, 1.3, 1.7, 2.4, 3.6, 6, 11] },
        { id: "small-better", label: "Four boxes stay flatter", points: [1, 1, 1, 1.1, 1.2, 1.4, 1.7, 2] },
      ],
      answer: "big-better",
      explain: "Pooling: one queue in front of all eight cores never lets a request wait while a core idles. Separate queues do, and the gap grows with load.",
    },
    {
      id: "su-explain",
      format: "explain",
      scenario: "In two sentences: when is scaling up the right call, and what makes you switch to scaling out?",
      rubric: [
        { id: "when-up", criterion: "Scale up while one box has room: it's simpler and has no distribution overhead" },
        { id: "switch", criterion: "Scale out for availability (no single point of failure), past the biggest box, or to add capacity without downtime" },
      ],
      exemplar: "Scale up first while a bigger box is available and a short outage is acceptable, because it keeps the system simple. Scale out once you need to survive a box dying, grow past the largest instance, or add capacity without downtime.",
      explain: "Most real systems do both: reasonably sized boxes, several of them.",
    },
  ],
  codex: {
    oneLiner: "Scale up for simplicity and pooling; scale out for availability, live growth, and no ceiling. Size fleets for N−1.",
    keyNumbers: [
      { label: "m7i.large / xlarge / 2xlarge", value: "2 / 4 / 8 vCPU", sourceId: "aws-m7i" },
      { label: "m7i.large on-demand (us-east-1)", value: "≈ $0.10/hour", sourceId: "aws-ec2-pricing" },
      { label: "Price per vCPU within m7i", value: "linear", sourceId: "aws-ec2-pricing" },
      { label: "Resize an EBS-backed instance", value: "stop → change type → start", sourceId: "aws-change-type" },
    ],
    tradeoffs: [
      { choice: "One big box", gain: "Simplest, one shared queue, no load balancer", cost: "Single point of failure, downtime to resize, hard ceiling" },
      { choice: "Many small boxes", gain: "Survives failures, grows live, no ceiling", cost: "Needs stateless apps, a load balancer, health checks, and N−1 headroom" },
      { choice: "Few medium boxes", gain: "Usually the sweet spot: some pooling, tolerable failure blast", cost: "Still plan for losing one at peak" },
    ],
    seenIn: [
      { text: "Case Intel runs on a single EC2 box: simple and cheap, and every incident on it is a full outage.", audience: "owner" },
      "A side project on a single EC2 box: simple and cheap, and every incident on it is a full outage.",
      { text: "The 1 GB box that fell over under the polling storm was a scale-up ceiling you hit early.", audience: "owner" },
      "A 1 GB box that falls over when clients start polling every few seconds is a scale-up ceiling you hit early.",
    ],
    interviewAngle: "Don't say 'scale horizontally' as a reflex. Say 'start with one reasonable box, then N boxes behind a load balancer sized so N−1 handles peak', and name what scaling out requires (stateless app tier).",
    aws: [
      { concept: "Scale up", service: "Change EC2 instance type (requires stop)" },
      { concept: "Scale out", service: "Auto Scaling group + Application Load Balancer" },
      { concept: "Spread failures", service: "Multiple Availability Zones" },
    ],
    otherClouds: "GCP: managed instance groups + Cloud Load Balancing · Azure: VM Scale Sets + Load Balancer",
    replay: { id: "scale-lab", config: COMPARE },
  },
  interview: [
    "When would you choose vertical scaling over horizontal? Give a real example.",
    "You have 4 app servers at 70% CPU at peak. Is that enough? What would you change?",
    "What must be true of an application before you can scale it horizontally?",
  ],
  deeper: [
    {
      title: "Why one big queue beats several small ones",
      body: "Eight cores sharing one queue behave like an M/M/8 system: a request waits only when all eight are busy. Four boxes of two cores each behave like four separate M/M/2 systems: a request can wait on a busy box while another box idles. At the same total utilization the pooled system has much shorter waits, and the gap widens as load rises. Least-outstanding load balancing (next mission) recovers some of it.",
    },
    {
      title: "N−1 arithmetic",
      body: "With N boxes each at utilization u, losing one puts the survivors at u × N ÷ (N − 1). Two boxes at 60% become one at 120% (overloaded). Four at 60% become three at 80%. Eight at 60% become seven at about 69%. More boxes make the same headroom go further, which is why a slightly larger fleet of smaller instances is often cheaper to run safely. Count failure domains, not just boxes: six boxes across three AZs lose two at once when an AZ goes, so the survivors run at u × 3 ÷ 2.",
      derived: true,
    },
    {
      title: "Where the ceiling actually is",
      body: "EC2's largest general-purpose instances have hundreds of vCPUs, so for most startups the ceiling isn't raw size. The real limits of scaling up are availability (one box), resize downtime, and the fact that some parts of the stack (connections, locks, a single Postgres primary) stop scaling long before the CPU does.",
    },
  ],
  honestPhysics: [
    "Every request is CPU-bound in this lab, so vCPUs are the only resource that matters. Real apps also run out of memory, connections, and I/O.",
    "Boot time for a replacement box is not modelled in the challenge: the dead box stays dead.",
    "Health checks here fire every 5 seconds and eject after two failures. ALB's default is 30 s × 2, so real ejection takes 30 to 60 seconds.",
    "The ALB charge assumes a steady 2 LCUs. LCUs bill on the busiest dimension each hour, and heavy responses (1 GB/hour per LCU) raise it.",
    "vCPUs are hyperthreads, not full cores: an m7i.large is one physical core with two threads.",
  ],
  sources: [SRC.awsEc2Pricing, SRC.awsResize, AWS_M7I, SRC.albHealth],
  verify: [
    { id: "pool-big", claim: "At 80% busy, the big box's p99 is about 70ms", run: "scale-compare", params: { config: COMPARE, load: 0.8, side: "big", metric: "p99" }, expect: { max: 0.075 } },
    { id: "pool-small", claim: "At 80% busy, four small boxes' p99 is about 30% worse", run: "scale-compare", params: { config: COMPARE, load: 0.8, side: "small", metric: "p99" }, expect: { min: 0.085 } },
    { id: "single-dies", claim: "One big box fails the hug (outage after the crash)", run: "scale-hug", params: { config: HUG, instance: "m7i.2xlarge", count: 1, metric: "errorRate" }, expect: { min: 0.3 } },
    { id: "two-overload", claim: "Two xlarge can't carry the load after losing one", run: "scale-hug", params: { config: HUG, instance: "m7i.xlarge", count: 2, metric: "errorRate" }, expect: { min: 0.05 } },
    { id: "four-large-tail", claim: "Four large survive but break the 200ms p99 at N−1", run: "scale-hug", params: { config: HUG, instance: "m7i.large", count: 4, metric: "p99" }, expect: { min: 0.2 } },
    { id: "five-large-wins-p99", claim: "Five large hold p99", run: "scale-hug", params: { config: HUG, instance: "m7i.large", count: 5, metric: "p99" }, expect: { max: 0.2 } },
    { id: "five-large-wins-err", claim: "Five large keep errors under 1%", run: "scale-hug", params: { config: HUG, instance: "m7i.large", count: 5, metric: "errorRate" }, expect: { max: 0.01 } },
    { id: "three-xl-err", claim: "Three xlarge keep errors under 1%", run: "scale-hug", params: { config: HUG, instance: "m7i.xlarge", count: 3, metric: "errorRate" }, expect: { max: 0.01 } },
  ],
});
