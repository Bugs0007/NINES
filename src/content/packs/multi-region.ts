import { definePack } from "../define";

export const REGION = { start: { topo: "passive", auto: true, repl: "async" } };
export const REGION_CHALLENGE = {};

const BUILDERS_STATIC = { id: "builders-static-stability", title: "Amazon Builders' Library: Static stability using Availability Zones", url: "https://aws.amazon.com/builders-library/static-stability-using-availability-zones/" };
const AWS_DR = { id: "aws-dr", title: "AWS Whitepaper: Disaster Recovery of Workloads on AWS (warm standby, multi-site active-active)", url: "https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html" };
const SPANNER = { id: "spanner-2012", title: "J. Corbett et al. (2012), Spanner: Google's Globally-Distributed Database", url: "https://research.google/pubs/spanner-googles-globally-distributed-database-2/" };

export default definePack({
  id: "multi-region",
  title: "Multi-region",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "provider status · us-east-1 degraded for 2 hours", detail: "single-region customers are offline" },
    lines: [
      { speaker: "kabir", line: "The cloud region we run in had a bad afternoon. We were down the entire time, and our users in Singapore were slow even on good days." },
      { speaker: "meera", line: "A second region can fix both problems. It can also double the bill, split the database in two, and create failures you have never had before." },
    ],
  },
  predictions: [
    {
      id: "long",
      kind: "choice",
      prompt: "A region fails twice a year for two hours. You run in a single region. About how many minutes a year are you down because of region failures?",
      options: [
        { id: "few", label: "About 4" },
        { id: "forty", label: "About 40" },
        { id: "two-forty", label: "About 240" },
        { id: "day", label: "About a day" },
      ],
      answer: "two-forty",
      observe: "long-down",
      reveal: {
        text: "Two failures of two hours is four hours, 240 minutes, a year: roughly 99.95% availability from the region alone, before anything of your own breaks. A standby that takes over automatically in minutes turns four hours into a few minutes.",
        derived: true,
        line: { speaker: "meera", line: "You inherit the availability of whatever you sit on." },
      },
    },
    {
      id: "sync",
      kind: "choice",
      prompt: "To lose no writes at failover you replicate synchronously, so each write waits for the other region 80 ms away. What happens to write latency?",
      options: [
        { id: "same", label: "About the same, 5 ms" },
        { id: "double", label: "About 10 ms" },
        { id: "slow", label: "About 85 ms" },
      ],
      answer: "slow",
      observe: "slow-write",
      reveal: {
        text: "A synchronous write must be acknowledged by the other region before it commits, so it pays a full 80 ms round trip on top of the 5 ms local write: 85 ms. That is the price of zero data loss. Asynchronous replication keeps writes at 5 ms and risks about 2 seconds of writes at failover.",
        derived: true,
        line: { speaker: "rao", line: "The speed of light is the part of the bill that does not go down." },
      },
    },
  ],
  widget: { id: "region-lab", config: REGION },
  mechanism: [
    {
      id: "why",
      text: "Two reasons to leave one region. Availability: a region is a failure domain, and an outage there takes everything in it down. Latency: users far from the region pay for the distance on every request. Multi-region architectures buy one or both, at a cost in money and complexity.",
      sourceIds: ["aws-dr"],
    },
    {
      id: "single",
      scene: "single",
      text: "One region is the baseline: simple, cheap, and exactly as available as the region. Within it, spread across zones so that losing a data centre is survivable. Region-wide failures are rare but long, and a single-region system has no answer to them except waiting.",
      sourceIds: ["builders-static-stability"],
    },
    {
      id: "passive",
      scene: "passive",
      text: "Active-passive keeps a standby region with a replicated copy of the data and enough capacity to take over. It improves availability, not latency, since users still go to one region. The question is who flips the switch: a person takes tens of minutes, while automated failover takes a few, with the risk of failing over by mistake.",
      sourceIds: ["aws-dr"],
    },
    {
      id: "active",
      scene: "active",
      text: "Active-active serves users from several regions at once, each from the nearest, and shifts traffic away from a failed one. It cuts latency and failover time to a minute. The hard part is data: writes in two places can conflict, so you need a conflict rule, a single writer per record, or a database built for it.",
      sourceIds: ["spanner-2012", "aws-dr"],
    },
  ],
  challenges: [
    {
      id: "topology",
      title: "Choose the topology",
      brief: "Region outages cost 240 minutes a year and far users see 220 ms. Choose topology and replication so downtime is at most 10 minutes a year, far users see at most 100 ms, writes take at most 50 ms, at most 5 seconds of writes are lost, and cost is at most 2.5 times one region.",
      line: { speaker: "kabir", line: "Singapore, São Paulo and Frankfurt all want to feel local." },
      widget: { id: "region-lab", config: REGION_CHALLENGE },
      conditions: [
        { metric: "downtimeMinYr", op: "<=", value: 10, label: "At most 10 minutes of downtime a year" },
        { metric: "farUserMs", op: "<=", value: 100, label: "Far users under 100 ms" },
        { metric: "writeMs", op: "<=", value: 50, label: "Writes under 50 ms" },
        { metric: "rpoS", op: "<=", value: 5, label: "Lose at most 5 seconds of writes" },
        { metric: "costX", op: "<=", value: 2.5, label: "At most 2.5× the cost of one region" },
      ],
      stars: [],
      hints: [
        "Which topology serves users from the nearest region?",
        "Synchronous replication loses nothing. What does it do to writes?",
        "How much data does asynchronous replication risk?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare single region, active-passive and active-active, and say what each costs.",
    rubric: [
      { id: "single", criterion: "A single region is as available as the region and slow for distant users", keyIdea: "single region limits" },
      { id: "passive", criterion: "Active-passive adds a standby for availability but not latency, with failover time depending on automation", keyIdea: "standby failover" },
      { id: "active", criterion: "Active-active serves from the nearest region with fast failover but needs a plan for conflicting writes and costs most", keyIdea: "conflicts and cost" },
    ],
    exemplar:
      "A single region is exactly as available as the region and slow for distant users. Active-passive keeps a standby that takes over, which improves availability but not latency, and failover takes tens of minutes if manual, a few if automated. Active-active serves users from the nearest region and shifts traffic in about a minute, but costs the most and needs a plan for conflicting writes, such as one writer per record.",
  },
  reviews: [
    {
      id: "mr-est",
      format: "estimate",
      scenario: "A region fails 3 times a year for 90 minutes each. A manual failover takes 35 minutes each time. About how many minutes of downtime a year does active-passive with manual failover give?",
      unit: "minutes",
      answer: 105,
      acceptFactor: 1.05,
      breakdown: ["3 failures × 35 minutes", "= 105 minutes"],
      explain: "With a standby, downtime is the failover time for each failure, not the length of the outage. A single region would be 3 × 90 = 270.",
    },
    {
      id: "mr-pick",
      format: "pick-fix",
      scenario: "An e-commerce site serves the whole world from one region. Users in Asia complain of slow pages, and region outages have hurt twice. The budget allows roughly doubling the cost. What fits?",
      options: [
        { id: "a", label: "Active-active in two or three regions, with each user served from the nearest" },
        { id: "b", label: "A bigger instance in the same region" },
        { id: "c", label: "An active-passive standby in a nearby region" },
        { id: "d", label: "A CDN only" },
      ],
      answer: "a",
      explain: "An active-passive standby fixes outages but not distance. Active-active addresses both, at about twice the cost.",
    },
    {
      id: "mr-order",
      format: "order",
      scenario: "Order these by downtime a year from region outages, most first.",
      items: [
        { id: "single", label: "Single region" },
        { id: "manual", label: "Active-passive, manual failover" },
        { id: "auto", label: "Active-passive, automatic failover" },
        { id: "active", label: "Active-active" },
      ],
      answer: ["single", "manual", "auto", "active"],
      explain: "Each step removes work from the path: no standby, a person, a health check, and no failover at all.",
    },
    {
      id: "mr-graph",
      format: "predict-graph",
      scenario: "As the distance between two regions grows, from 10 ms to 150 ms round trip, how does the write latency under synchronous replication change?",
      xLabel: "distance between regions →",
      yLabel: "write latency",
      options: [
        { id: "linear", label: "Rises one-for-one with the round trip", points: [15, 25, 45, 65, 85, 105, 135, 155] },
        { id: "flat", label: "Stays at 5 ms", points: [5, 5, 5, 5, 5, 5, 5, 5] },
        { id: "sqrt", label: "Rises, then flattens", points: [15, 40, 60, 70, 75, 78, 80, 80] },
      ],
      answer: "linear",
      explain: "A synchronous write waits for one full round trip, so its latency is the local time plus the distance, which light cannot beat.",
    },
    {
      id: "mr-flaw",
      format: "spot-flaw",
      scenario: "A team goes active-active with both regions writing the same user table asynchronously. A user changes their address in each region within a second, and one change silently vanishes. Tap the step that loses it.",
      diagram: {
        nodes: [
          { id: "a", label: "write in region A", kind: "client", col: 0, row: 0 },
          { id: "b", label: "write in region B", kind: "client", col: 0, row: 2 },
          { id: "merge", label: "async replication, last write wins", kind: "db", col: 1, row: 1 },
        ],
        edges: [
          { from: "a", to: "merge" },
          { from: "b", to: "merge" },
        ],
      },
      answer: "b->merge",
      explain: "Two regions accept conflicting writes and a blind last-write-wins rule picks one. Give each record a home region, or use a merge rule or a database that resolves conflicts.",
    },
    {
      id: "mr-explain",
      format: "explain",
      scenario: "In two sentences: why can a multi-region setup be less reliable than a single region if done carelessly?",
      rubric: [
        { id: "untested", criterion: "Failover paths run rarely and often fail when needed, or trigger by mistake" },
        { id: "complexity", criterion: "Cross-region replication, conflicts and extra moving parts add new ways to fail" },
      ],
      exemplar: "Failover paths are rarely exercised, so they often fail when needed or trigger when they should not. Cross-region replication and conflicting writes also add new ways to fail that a single region never had.",
      explain: "Complexity is a failure mode.",
    },
  ],
  codex: {
    oneLiner: "One region is as available as the region. A standby fixes outages, not distance. Active-active fixes both, costs most, and needs a conflict plan.",
    keyNumbers: [
      { label: "Synchronous write across a 80 ms link", value: "about 85 ms", sourceId: "spanner-2012" },
      { label: "Active-active cost vs one region (lab)", value: "about 2.2×", sourceId: "aws-dr" },
    ],
    tradeoffs: [
      { choice: "Single region", gain: "Cheapest and simplest", cost: "Region outage means downtime; far users are slow" },
      { choice: "Active-passive", gain: "Survives a region loss", cost: "Idle capacity; slow failover if manual" },
      { choice: "Active-active", gain: "Nearest region and fast failover", cost: "Highest cost; conflicts" },
      { choice: "Synchronous replication", gain: "No lost writes", cost: "Round trip on every write" },
    ],
    seenIn: ["Spanner and CockroachDB multi-region tables.", "DynamoDB global tables and Aurora Global Database."],
    interviewAngle: "Say: 'decide RPO and RTO, then pick standby or active-active; give each record a home region to avoid write conflicts'.",
    aws: [{ concept: "Global tables, global databases and Route 53 failover routing", service: "DynamoDB, Aurora Global, Route 53" }],
    replay: { id: "region-lab", config: { start: { topo: "active", auto: true, repl: "async" } }, scene: "active" },
  },
  interview: [
    "When is multi-region worth it?",
    "What is the difference between active-passive and active-active?",
    "How do you handle writes in an active-active system?",
  ],
  deeper: [
    {
      title: "Home regions and cells",
      body: "A common way to tame active-active is to give each user or tenant a home region, where their writes go, and replicate read-only copies elsewhere. Failure then affects only the users homed in the failed region until they are moved. The same idea, partitioning the system into independent cells, limits how much any one failure can take down.",
      sourceIds: ["builders-static-stability"],
    },
  ],
  honestPhysics: [
    "A region fails twice a year for two hours. Users far from one region see 220 ms to it and 45 ms to a nearby one; cross-region round trips are 80 ms.",
    "Single region: 240 minutes of downtime a year, daily backups only. Active-passive: 35 minutes per failover manually, 3 automated. Active-active: about a minute each. Async replication keeps writes at 5 ms and can lose 2 seconds; synchronous writes take 85 ms and lose none.",
    "Costs are relative to one region: 1×, 1.6× and 2.2×. Conflict handling is not charged.",
  ],
  sources: [BUILDERS_STATIC, AWS_DR, SPANNER],
  verify: [
    { id: "single", claim: "A single region is down 240 minutes a year", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "single" }, metric: "downtimeMinYr" }, expect: { min: 240, max: 240 } },
    { id: "passive-manual", claim: "Manual failover leaves 70 minutes", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "passive", auto: false }, metric: "downtimeMinYr" }, expect: { min: 70, max: 70 } },
    { id: "passive-auto", claim: "Automatic failover leaves 6", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "passive", auto: true }, metric: "downtimeMinYr" }, expect: { max: 10 } },
    { id: "passive-far", claim: "Active-passive leaves far users at 220 ms", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "passive", auto: true }, metric: "farUserMs" }, expect: { min: 200 } },
    { id: "active-far", claim: "Active-active brings them to 45 ms", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "active" }, metric: "farUserMs" }, expect: { max: 100 } },
    { id: "sync", claim: "Synchronous replication makes writes 85 ms", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "active", repl: "sync" }, metric: "writeMs" }, expect: { min: 85, max: 85 } },
    { id: "cost", claim: "Active-active costs 2.2 times one region", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "active", repl: "async" }, metric: "costX" }, expect: { max: 2.5 } },
    { id: "rpo", claim: "…and loses at most 2 seconds of writes", run: "lab", params: { model: "region-lab", config: REGION_CHALLENGE, values: { topo: "active", repl: "async" }, metric: "rpoS" }, expect: { max: 5 } },
  ],
});
