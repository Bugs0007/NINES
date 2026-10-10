import { definePack, SRC } from "../define";

export const AUTO = {};

const AWS_TT = { id: "aws-target-tracking", title: "AWS docs: Target tracking scaling policies for Amazon EC2 Auto Scaling", url: "https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html" };
const AWS_WARM = { id: "aws-warm-pools", title: "AWS docs: Warm pools for Amazon EC2 Auto Scaling", url: "https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-warm-pools.html" };

export default definePack({
  id: "autoscaling",
  title: "Autoscaling & Its Lag",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "p99 latency · api", detail: "autoscaling group launching instances" },
    lines: [
      { speaker: "kabir", line: "Autoscaling added nine boxes and the site was still down for four minutes. What is it for, then?" },
      { speaker: "meera", line: "For the next spike, not this one. It reacts to load that has already arrived, and new boxes take minutes to help." },
    ],
  },
  predictions: [
    {
      id: "keeps-up",
      kind: "choice",
      prompt: "Traffic ramps from 200 to 1,800 requests a second over four minutes. An instance serves 100 a second, a new one takes 2.5 minutes to boot, and the group starts with 3 and tracks 60% CPU. What happens?",
      options: [
        { id: "fine", label: "It keeps up the whole way" },
        { id: "blip", label: "A brief blip of a few seconds" },
        { id: "behind", label: "It falls behind for minutes and drops requests" },
        { id: "never", label: "It never scales" },
      ],
      answer: "behind",
      observe: "lag-hurts",
      reveal: {
        text: "Each check can add a fixed ratio of capacity, and every new instance then takes 2.5 minutes to serve. Demand outruns capacity for minutes and the queue overflows, so requests are dropped.",
        derived: true,
        line: { speaker: "rao", line: "It scales perfectly, and about three minutes late." },
      },
    },
  ],
  widget: { id: "autoscale-lab", config: { ...AUTO, start: { minInst: 22, target: 0.6, warm: false } } },
  mechanism: [
    {
      id: "lag",
      scene: "lag",
      text: "Autoscaling reacts to what already happened. It reads a metric once a minute, decides to add instances, then waits for them to boot and pass health checks. For two to three minutes after load arrives, you have only the fleet you started with.",
      derived: true,
    },
    {
      id: "ratio",
      text: "Target tracking sizes the fleet so average utilization would match the target. CPU cannot read above 100%, so a saturated fleet grows by about 1 ÷ target each check: at a 60% target, 1.7 times. Three instances become 5, then 8, then 14.",
      sourceIds: ["aws-target-tracking"],
      derived: true,
    },
    {
      id: "headroom",
      scene: "headroom",
      text: "Headroom works at once because it is already running. A higher minimum covers the first minutes of any spike; a lower target keeps spare capacity and grows faster when load rises. Both cost money all day, which is the price of not being late.",
    },
    {
      id: "warm",
      scene: "warm",
      text: "Shorten the gap instead. A warm pool keeps pre-initialised instances ready alongside the group, so scale-out takes seconds rather than minutes. Smaller images and health checks that pass sooner shrink the same gap.",
      sourceIds: ["aws-warm-pools"],
    },
  ],
  challenges: [
    {
      id: "survive-ramp",
      title: "Survive the ramp",
      brief: "Load climbs from 200 to 1,800 requests a second over four minutes. Each instance serves 100. Keep failed requests under 1% and the worst latency under one second, with a standing fleet that costs at most $900 a month.",
      line: { speaker: "rao", line: "Every instance idling all month is on my invoice. Every dropped request is on yours." },
      widget: { id: "autoscale-lab", config: AUTO },
      conditions: [
        { metric: "errorRate", op: "<", value: 0.01, label: "Failed requests under 1%" },
        { metric: "peakLatency", op: "<", value: 1, label: "Worst latency under 1 s" },
        { metric: "costPerMonth", op: "<=", value: 900, label: "Standing fleet under $900/month" },
      ],
      stars: [{ metric: "costPerMonth", op: "<=", value: 750, label: "Standing fleet under $750/month" }],
      hints: [
        "How many instances are needed at the peak, and how many does the standing fleet cover?",
        "Boot time is the real enemy. Is there a way to make new instances arrive sooner?",
        "A lower utilization target makes each scale-out step bigger. How low can you go before the fleet is oversized?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why does autoscaling fail to save you from a fast spike, and what do you do about it?",
    rubric: [
      { id: "reactive", criterion: "Autoscaling reacts after load arrives, on a metric that is sampled periodically", keyIdea: "reactive and delayed" },
      { id: "boot", criterion: "New instances take minutes to boot and pass health checks, so capacity arrives late", keyIdea: "boot time" },
      { id: "fix", criterion: "Mitigates with headroom (higher minimum, lower target), warm pools or faster boot, or scheduled scaling for known spikes", keyIdea: "headroom or warm pool" },
    ],
    exemplar:
      "Autoscaling looks at a metric every minute, decides to add capacity, then waits minutes for instances to boot, so it reacts to load that has already arrived. A fast spike overwhelms the fleet in that gap. I keep headroom with a higher minimum and a lower target, use a warm pool or faster boot, and schedule capacity ahead of known spikes.",
  },
  reviews: [
    {
      id: "as-est-ratio",
      format: "estimate",
      scenario: "A fleet is saturated at 100% CPU and your target tracking policy aims for 50%. By roughly what factor can it ask for more instances at one check?",
      unit: "×",
      answer: 2,
      acceptFactor: 1.25,
      breakdown: ["desired = current × (observed ÷ target)", "observed is capped at 100%", "100 ÷ 50 = 2×"],
      explain: "A lower target means bigger steps, because the ratio of observed to target is larger. At 60% it is only 1.7×.",
    },
    {
      id: "as-est-fleet",
      format: "estimate",
      scenario: "Peak demand is 1,800 requests a second. An instance serves 100 a second at 100% CPU, and you keep a 60% target. How many instances does the fleet settle at?",
      unit: "instances",
      answer: 30,
      acceptFactor: 1.15,
      breakdown: ["1,800 ÷ 100 = 18 instances at 100%", "18 ÷ 0.6", "= 30"],
      explain: "A 60% target means each instance does 60 requests a second, so you need 30 of them, not 18.",
    },
    {
      id: "as-pick",
      format: "pick-fix",
      scenario: "A push notification goes out at 09:00 every day and the site buckles for three minutes while autoscaling catches up. What is the best fix?",
      options: [
        { id: "a", label: "Lower the CPU target to 20% all day" },
        { id: "b", label: "Use scheduled scaling to add capacity shortly before 09:00" },
        { id: "c", label: "Move to bigger instances" },
        { id: "d", label: "Lengthen the cooldown" },
      ],
      answer: "b",
      explain: "When the spike is predictable, do not wait for the metric: raise capacity ahead of time and let target tracking handle the remainder. Always-low targets pay for it all day.",
    },
    {
      id: "as-order",
      format: "order",
      scenario: "Order these ways of getting capacity by how soon it can serve traffic, soonest first.",
      items: [
        { id: "spare", label: "Instances already running as headroom" },
        { id: "cold", label: "A new instance booting from scratch" },
        { id: "warm", label: "An instance drawn from a warm pool" },
        { id: "rack", label: "A new physical server racked in a data centre" },
      ],
      answer: ["spare", "warm", "cold", "rack"],
      explain: "Spare capacity is instant, a warm instance takes seconds, a cold one minutes, and hardware days. Pick the cheapest option that is fast enough for your spike.",
    },
    {
      id: "as-graph",
      format: "predict-graph",
      scenario: "Load ramps up over four minutes and then plateaus. The autoscaler is reactive and instances take minutes to boot. What does user latency do over time?",
      xLabel: "time →",
      yLabel: "latency",
      options: [
        { id: "flat", label: "Stays flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "spike", label: "Climbs mid-ramp, stays high, then recovers once instances land", points: [1, 1.1, 2, 6, 9, 8, 3, 1.2] },
        { id: "up", label: "Rises steadily and never recovers", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "end", label: "Fine until the very end, then spikes", points: [1, 1, 1, 1, 1, 1, 2, 8] },
      ],
      answer: "spike",
      explain: "Latency stays flat while spare capacity absorbs the early ramp, climbs as demand passes capacity, and recovers when the delayed instances finally arrive.",
    },
    {
      id: "as-flaw",
      format: "spot-flaw",
      scenario: "Every spike hurts for minutes. Tap the setting that makes the spike hurt most.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "alb", label: "ALB", kind: "lb", col: 1, row: 1 },
          { id: "asg", label: "asg · min 1, target 85% CPU, 4-min boot, no warm pool", kind: "server", col: 2, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 3, row: 1 },
        ],
        edges: [
          { from: "users", to: "alb" },
          { from: "alb", to: "asg" },
          { from: "asg", to: "db" },
        ],
      },
      answer: "asg",
      explain: "A minimum of one and an 85% target leave almost no spare capacity, and a four-minute boot with no warm pool means the response arrives long after the spike does.",
    },
    {
      id: "as-explain",
      format: "explain",
      scenario: "In two sentences: why does a lower utilization target help with spikes, and what does it cost?",
      rubric: [
        { id: "headroom", criterion: "A lower target keeps more spare capacity running and makes each scale-out step bigger" },
        { id: "cost", criterion: "It costs more because more instances run all the time" },
      ],
      exemplar: "A lower target means the fleet always has spare capacity, and when load rises the autoscaler asks for a bigger step. The price is paying for more instances all day.",
      explain: "Headroom is bought in advance, with money.",
    },
  ],
  codex: {
    oneLiner: "Autoscaling reacts after the load arrives, then waits for boots. Cover fast spikes with headroom, warm pools, and scheduled capacity.",
    keyNumbers: [
      { label: "Growth per check when saturated", value: "about 1 ÷ target", sourceId: "aws-target-tracking" },
      { label: "Instance type price in this sim", value: "m7i.large, $0.1008/hour on demand", sourceId: "aws-ec2-pricing" },
      { label: "Warm pool", value: "pre-initialised instances cut scale-out time", sourceId: "aws-warm-pools" },
    ],
    tradeoffs: [
      { choice: "Lower utilization target", gain: "More spare capacity and bigger scale-out steps", cost: "More instances running all day" },
      { choice: "Warm pool", gain: "Capacity in seconds, not minutes", cost: "Paying for pre-initialised instances (stopped ones cost less)" },
      { choice: "Scheduled scaling", gain: "Capacity ready before a known spike", cost: "Useless for surprises; needs maintenance" },
    ],
    seenIn: ["A launch or push notification that overwhelms the fleet for three minutes.", "A scale-in that was too eager and caused the next spike to hurt."],
    interviewAngle: "Never say 'autoscaling handles spikes' alone. Say what the lag is: 'it adds capacity minutes later, so I keep headroom for the first minutes and pre-scale for known events.'",
    aws: [
      { concept: "Target tracking", service: "EC2 Auto Scaling target tracking policy" },
      { concept: "Pre-initialised capacity", service: "EC2 Auto Scaling warm pools" },
      { concept: "Known spikes", service: "Scheduled scaling actions" },
    ],
    otherClouds: "GCP: managed instance group autoscaler with initialization period · Azure: VM Scale Sets autoscale with scheduled profiles",
    replay: { id: "autoscale-lab", config: AUTO, scene: "lag" },
  },
  interview: [
    "Your service autoscales but still falls over in a spike. Why, and what do you change?",
    "How do you pick a CPU target for target tracking?",
    "What is the difference between headroom, a warm pool, and scheduled scaling?",
  ],
  deeper: [
    {
      title: "Why the metric must move inversely with capacity",
      body: "Target tracking works because adding an instance lowers the average CPU: the metric moves opposite to capacity. A metric that does not do that, like total request count, cannot be tracked directly; use requests per instance instead. And because the policy errs toward scaling out aggressively and scaling in slowly, a flapping fleet is rarer than a lagging one.",
      sourceIds: ["aws-target-tracking"],
    },
    {
      title: "Queues are the other answer",
      body: "If work can wait, put it in a queue and scale on queue depth. The spike then becomes a backlog that drains, instead of a wall of failed requests. User-facing requests cannot wait, which is why they need headroom; background jobs can use the queue.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Load is a smooth ramp and the fleet is a fluid. Real spikes are jagged, and the first seconds of a jagged spike are worse.",
    "Instances serve 100 requests a second at 100% CPU, a round figure. Real throughput depends on the workload.",
    "Scale-in waits three calm checks and removes 30% at a time, a simplification of AWS's slower scale-in rules.",
  ],
  sources: [AWS_TT, AWS_WARM, SRC.awsEc2Pricing],
  verify: [
    { id: "cold-fails", claim: "Starting with 3 cold instances on a 60% target drops requests", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.6, minInst: 3, warm: false }, metric: "errorRate" }, expect: { min: 0.1 } },
    { id: "headroom-holds", claim: "A standing fleet of 22 holds the ramp with no drops", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.6, minInst: 22, warm: false }, metric: "errorRate" }, expect: { max: 0.001 } },
    { id: "headroom-costly", claim: "That standing fleet costs well over $900 a month", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.6, minInst: 22, warm: false }, metric: "costPerMonth" }, expect: { min: 1500 } },
    { id: "warm-wins", claim: "A warm pool with a 30% target and 10 instances survives for under $900 a month", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.3, minInst: 10, warm: true }, metric: "peakLatency" }, expect: { max: 1 } },
    { id: "warm-errors", claim: "…without dropping requests", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.3, minInst: 10, warm: true }, metric: "errorRate" }, expect: { max: 0.01 } },
    { id: "warm-cheap", claim: "…and the standing fleet is under $900 a month", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.3, minInst: 10, warm: true }, metric: "costPerMonth" }, expect: { max: 900 } },
    { id: "warm-high-target", claim: "A warm pool with a 40% target and 12 instances still goes over a second", run: "lab", params: { model: "autoscale-lab", config: AUTO, values: { target: 0.4, minInst: 12, warm: true }, metric: "peakLatency" }, expect: { min: 1 } },
  ],
});
