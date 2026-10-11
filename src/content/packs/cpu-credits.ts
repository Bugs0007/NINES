import { definePack } from "../define";

export const CC2 = { start: { type: "small", unlimited: false, util: 0.18 } };
export const CC2_CHALLENGE = { lockUtil: true, start: { type: "micro", unlimited: false, util: 0.18 } };

const AWS_BURST = { id: "aws-burstable", title: "AWS docs: Burstable performance instances (baseline, credits, launch credits)", url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances.html" };
const AWS_UNLIMITED = { id: "aws-unlimited", title: "AWS docs: Unlimited mode for burstable performance instances (surplus credits and charges)", url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html" };
const AWS_CREDITS = { id: "aws-credit-monitor", title: "AWS docs: Monitor CPU credits (CPUCreditBalance, CPUSurplusCreditBalance)", url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-monitoring-cpu-credits.html" };

export default definePack({
  id: "cpu-credits",
  title: "Burstable CPU & Credits",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "web-1 · CPUCreditBalance 144 → 0 over 30 h", detail: "latency p50 from 80 ms to 900 ms, CPU flat at 10%" },
    lines: [
      { speaker: "kabir", line: "The server was fine for a day and then got slow, and CPU sits at ten percent. Nothing has changed." },
      { speaker: "meera", line: "A burstable instance earns a little CPU and spends it when busy. When the balance is gone it is held to its baseline, however idle it looks." },
    ],
  },
  predictions: [
    {
      id: "throttle",
      kind: "choice",
      prompt: "A micro instance has a 10% baseline and a 144-credit launch balance. Your service averages 18% of a vCPU. Credits are spent at (use − baseline) × 60 an hour. After the balance runs out, what share of its normal throughput does it keep?",
      options: [
        { id: "100", label: "All of it, a few extra percent is nothing" },
        { id: "56", label: "About 56%: 10 ÷ 18" },
        { id: "10", label: "About 10%" },
      ],
      answer: "56",
      observe: "throttled",
      reveal: {
        text: "It spends 4.8 credits an hour, so the balance lasts 30 hours. Then it is held to the 10% baseline while demand wants 18%, so it serves 10 ÷ 18 = 56% of the work, and the queue grows. The service runs fine in a short test and degrades on day two, which is why it surprises people.",
        derived: true,
        line: { speaker: "rao", line: "A burst is a loan. Check what you do with the rest of the month." },
      },
    },
    {
      id: "bill",
      kind: "choice",
      prompt: "You turn on unlimited mode for a micro instance at 90% average use. It never throttles. Surplus use is billed at $0.05 per vCPU-hour above the baseline. The instance costs $7.60 a month. What is the monthly bill?",
      options: [
        { id: "8", label: "About $8" },
        { id: "37", label: "About $37" },
        { id: "70", label: "About $370" },
      ],
      answer: "37",
      observe: "unlimited-bill",
      reveal: {
        text: "The surplus is 0.8 vCPU for 730 hours at $0.05, $29.20, on top of the $7.60: $36.80. For steady load that busy a fixed-performance instance is cheaper: a general-purpose large is $70 for 1.0 vCPU all the time, and the breakeven for a micro is around 40% average use.",
        derived: true,
        line: { speaker: "meera", line: "Unlimited removes the cliff and adds a meter. Read the meter." },
      },
    },
  ],
  widget: { id: "credit-lab", config: CC2 },
  mechanism: [
    {
      id: "model",
      text: "A burstable instance has a baseline share of CPU and a balance of credits. Below baseline it earns credits, and above it spends them: one credit is a vCPU at 100% for a minute. This suits workloads that are mostly idle with bursts, and makes a cheap instance feel fast while the balance lasts.",
      sourceIds: ["aws-burstable"],
    },
    {
      id: "throttle",
      scene: "standard",
      text: "When the balance reaches zero a standard-mode instance is held to its baseline. CPU in the monitor looks flat and low, since it is pinned at the cap, while latency climbs as the work queues. A new instance starts with launch credits, which can make a trial look healthy for a day before the real behaviour appears.",
      sourceIds: ["aws-burstable", "aws-credit-monitor"],
    },
    {
      id: "unlimited",
      scene: "unlimited",
      text: "Unlimited mode lets the instance burst above baseline without limit and charges for surplus credits when its average use over 24 hours exceeds the baseline. It removes the throttle, and it turns a performance cliff into a cost line. For a service slightly above baseline it can be the cheapest answer; far above, it is not.",
      sourceIds: ["aws-unlimited"],
    },
    {
      id: "choose",
      scene: "bigger",
      text: "Choose with the numbers. Measure your average CPU over a month, not the peak. If it stays under the baseline, a burstable type is good. If it sits at or just above, compare the next size up with unlimited mode. If it is high and steady, use a fixed-performance type. Alarm on the credit balance, not only on CPU.",
      sourceIds: ["aws-credit-monitor", "aws-burstable"],
    },
  ],
  challenges: [
    {
      id: "pick-instance",
      title: "Pick the instance",
      brief: "A service averages 18% of a vCPU. Pick an instance that is never throttled and costs $20 a month or less.",
      line: { speaker: "rao", line: "Fast on day two, and not an expensive one." },
      widget: { id: "credit-lab", config: CC2_CHALLENGE },
      conditions: [
        { metric: "speedAfterCredits", op: ">=", value: 1, label: "Never throttled" },
        { metric: "monthlyCost", op: "<=", value: 20, label: "At most $20 a month" },
      ],
      stars: [{ metric: "monthlyCost", op: "<=", value: 11, label: "At most $11 a month" }],
      hints: ["What is the baseline compared with 18%?", "What does unlimited mode add to the bill at 18%?", "Which sizes cost more than $20?"],
    },
  ],
  explainBack: {
    prompt: "Explain how burstable instances work and how to choose one.",
    rubric: [
      { id: "credits", criterion: "A baseline share of CPU earns credits below it and spends them above it; when the balance is empty a standard instance is held to its baseline", keyIdea: "credits and baseline" },
      { id: "symptom", criterion: "CPU looks low and flat while latency climbs, and launch credits hide the problem for the first day", keyIdea: "the throttle looks like idle" },
      { id: "choose", criterion: "Compare average use with the baseline; just above it unlimited mode or a bigger size may be cheapest, and steady high use wants fixed performance", keyIdea: "choose by average use" },
    ],
    exemplar:
      "A burstable instance has a baseline share of CPU, earns credits when it runs below it and spends them above it, and when the balance is empty a standard instance is held to its baseline. The symptom is low flat CPU with climbing latency, and launch credits can hide it for the first day. I would compare average use with the baseline: just above it, unlimited mode or the next size may be cheapest, and steady high use wants a fixed-performance type.",
  },
  reviews: [
    {
      id: "cc-est",
      format: "estimate",
      scenario: "A micro has a 10% baseline and 144 launch credits. The service uses 18% of a vCPU. Credits are spent at (use − baseline) × 60 an hour. How many hours until the balance is empty?",
      unit: "hours",
      answer: 30,
      acceptFactor: 1.05,
      breakdown: ["(0.18 − 0.10) × 60 = 4.8 credits an hour", "144 ÷ 4.8 = 30 hours"],
      explain: "A modest overage empties a launch balance in about a day.",
    },
    {
      id: "cc-pick",
      format: "pick-fix",
      scenario: "A service on a t-type instance slows after a day, with CPU flat at the baseline and the credit balance at zero. It averages 25% use on a 20% baseline. What are the sensible fixes?",
      options: [
        { id: "a", label: "Turn on unlimited mode, or move to a larger size or a fixed-performance type, after comparing the cost" },
        { id: "b", label: "Reboot the instance to reset the credits" },
        { id: "c", label: "Add a second disk" },
        { id: "d", label: "Lower the log level" },
      ],
      answer: "a",
      explain: "Rebooting does not add credits. The workload is above the baseline, so it needs more baseline or paid surplus.",
    },
    {
      id: "cc-order",
      format: "order",
      scenario: "Order these at 18% average use by monthly cost, highest first.",
      items: [
        { id: "large", label: "General-purpose large" },
        { id: "medium", label: "Medium" },
        { id: "small", label: "Small" },
        { id: "micro", label: "Micro, unlimited" },
      ],
      answer: ["large", "medium", "small", "micro"],
      explain: "$70, $30, $15 and $10.52. The micro with unlimited mode is cheapest while use is just above its baseline.",
    },
    {
      id: "cc-graph",
      format: "predict-graph",
      scenario: "On a micro instance with unlimited mode, as average use rises from 5% to 90%, how does the monthly bill change?",
      xLabel: "average use →",
      yLabel: "monthly cost",
      options: [
        { id: "flat-rise", label: "Flat at $7.60 up to the baseline, then rising in a straight line", points: [7.6, 7.6, 7.6, 10.5, 18, 25, 33, 36.8] },
        { id: "flat", label: "Flat at $7.60", points: [7.6, 7.6, 7.6, 7.6, 7.6, 7.6, 7.6, 7.6] },
        { id: "step", label: "Jumps at the baseline then flat", points: [7.6, 7.6, 7.6, 30, 30, 30, 30, 30] },
      ],
      answer: "flat-rise",
      explain: "Surplus is billed in proportion to use above the baseline: $0.05 × hours × (use − 10%).",
    },
    {
      id: "cc-flaw",
      format: "spot-flaw",
      scenario: "A team load-tests a new t-type instance for an hour, sees fast responses, and ships it. The real load is 15% of a vCPU on a 10% baseline. Tap the misleading step.",
      diagram: {
        nodes: [
          { id: "test", label: "one-hour load test", kind: "client", col: 0, row: 1 },
          { id: "launch", label: "launch credits cover the test", kind: "cache", col: 1, row: 1 },
          { id: "prod", label: "production at day two", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "test", to: "launch" },
          { from: "launch", to: "prod" },
        ],
      },
      answer: "test->launch",
      explain: "A short test spends launch credits and never reaches steady state. Test long enough to drain the balance, or compute average use against baseline.",
    },
    {
      id: "cc-explain",
      format: "explain",
      scenario: "In two sentences: why does a throttled burstable instance show low CPU and high latency?",
      rubric: [
        { id: "cap", criterion: "It is being held at its baseline, so CPU use sits at that cap even though the work wants more" },
        { id: "queue", criterion: "The demand beyond the baseline waits, so requests queue and latency climbs" },
      ],
      exemplar: "It is being held at its baseline, so CPU use sits at that cap even though the work wants more. The demand beyond the baseline waits, so requests queue and latency climbs.",
      explain: "A pinned low number is a throttle, not a rest.",
    },
  ],
  codex: {
    oneLiner: "Baseline CPU earns credits, bursts spend them. At zero a standard instance is held to baseline; unlimited trades the cliff for a bill.",
    keyNumbers: [
      { label: "Micro at 18% use, launch balance (lab)", value: "throttled after 30 hours", sourceId: "aws-burstable" },
      { label: "Unlimited surplus (lab)", value: "$0.05 per vCPU-hour", sourceId: "aws-unlimited" },
    ],
    tradeoffs: [
      { choice: "Standard mode", gain: "Predictable cost", cost: "A throttle cliff when credits run out" },
      { choice: "Unlimited mode", gain: "No throttle", cost: "A bill that scales with surplus use" },
      { choice: "Fixed-performance type", gain: "Steady full CPU", cost: "Paying for idle time" },
    ],
    seenIn: ["Small web servers, bastions and dev boxes on t-type instances.", "CloudWatch alarms on CPUCreditBalance."],
    interviewAngle: "Say: 'credits and a baseline; average use against baseline decides; alarm on the balance; unlimited is a bill, not free'.",
    aws: [{ concept: "Burstable instances", service: "Amazon EC2 T-family with unlimited mode; CloudWatch credit metrics" }],
    replay: { id: "credit-lab", config: CC2, scene: "unlimited" },
  },
  interview: [
    "How do burstable instances work?",
    "Why would a t3 instance suddenly get slow?",
    "When is unlimited mode the right choice?",
  ],
  deeper: [
    {
      title: "Noisy neighbours and steal time",
      body: "Burstable instances are one form of shared CPU. On any shared host, a neighbour can take cycles, which shows up as steal time in the guest. A consistently high steal percentage means the host, not your code, is the bottleneck. Compare with credits first, and if that is not it, ask for a different instance or placement.",
      sourceIds: ["aws-burstable"],
    },
  ],
  honestPhysics: [
    "A micro has a 10% baseline ($7.60 a month), a small 20% ($15), a medium 20% ($30) and a general-purpose large 100% with no credits ($70). A launch balance of 144 credits is available. One credit is a vCPU at 100% for a minute; spending is (use − baseline) × 60 credits an hour.",
    "When the balance is empty a standard instance serves baseline ÷ use of its demand. In unlimited mode it never throttles and surplus use is billed at $0.05 per vCPU-hour above the baseline. Round figures; check current provider rules.",
  ],
  sources: [AWS_BURST, AWS_UNLIMITED, AWS_CREDITS],
  verify: [
    { id: "hours", claim: "A micro at 18% empties its launch balance in 30 hours", run: "lab", params: { model: "credit-lab", config: CC2_CHALLENGE, values: { type: "micro", unlimited: false }, metric: "hoursToThrottle" }, expect: { min: 29.9, max: 30.1 } },
    { id: "speed", claim: "…and then runs at 56% of demand", run: "lab", params: { model: "credit-lab", config: CC2_CHALLENGE, values: { type: "micro", unlimited: false }, metric: "speedAfterCredits" }, expect: { min: 0.55, max: 0.57 } },
    { id: "unl", claim: "Unlimited mode on a micro costs $10.52 a month at 18%", run: "lab", params: { model: "credit-lab", config: CC2_CHALLENGE, values: { type: "micro", unlimited: true }, metric: "monthlyCost" }, expect: { min: 10.4, max: 10.6 } },
    { id: "small", claim: "A small never throttles at 18% and costs $15", run: "lab", params: { model: "credit-lab", config: CC2_CHALLENGE, values: { type: "small", unlimited: false }, metric: "speedAfterCredits" }, expect: { min: 1 } },
    { id: "medium", claim: "A medium is over the cost limit", run: "lab", params: { model: "credit-lab", config: CC2_CHALLENGE, values: { type: "medium", unlimited: false }, metric: "monthlyCost" }, expect: { min: 20 } },
    { id: "heavy", claim: "Unlimited at 90% use costs $36.80", run: "lab", params: { model: "credit-lab", config: { start: { util: 0.9 } }, values: { type: "micro", unlimited: true, util: 0.9 }, metric: "monthlyCost" }, expect: { min: 36.7, max: 36.9 } },
  ],
});
