import { definePack } from "../define";

export const FAIL = { start: { interval: 2, missed: 7, proxy: false, fencing: false } };
export const FAIL_CHALLENGE = { start: { interval: 1, missed: 2, proxy: false, fencing: false } };

const GITHUB = { id: "github-2018", title: "GitHub Engineering: October 21 post-incident analysis (a network partition, a database failover, and a day of data reconciliation)", url: "https://github.blog/news-insights/company-news/oct21-post-incident-analysis/" };
const KLEPPMANN_LOCK = { id: "kleppmann-fencing", title: "M. Kleppmann (2016), How to do distributed locking (fencing tokens)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html" };
const CHANDRA = { id: "chandra-toueg", title: "T. Chandra and S. Toueg (1996), Unreliable Failure Detectors for Reliable Distributed Systems, JACM 43(2)", url: "https://doi.org/10.1145/226643.226647" };
const RDS_FAILOVER = { id: "rds-failover", title: "AWS docs: Failover process for Amazon RDS Multi-AZ (detection, standby promotion, DNS change)", url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html" };

export default definePack({
  id: "failover",
  title: "Failover & Split Brain",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "orders-db · two primaries", detail: "both accepted writes for 4 minutes" },
    lines: [
      { speaker: "pager", line: "The database failed over because a health check timed out, but the old primary was fine. Now two nodes think they are primary and both took orders." },
      { speaker: "meera", line: "Failing over fast is easy. Failing over only when the primary is truly dead is the hard part." },
    ],
  },
  predictions: [
    {
      id: "aggressive",
      kind: "choice",
      prompt: "A health check sends a heartbeat every second and declares the primary dead after 2 missed. Healthy primaries pause for over 2 seconds a few percent of the time, 200 times a month. How many needless failovers a month do you expect?",
      options: [
        { id: "zero", label: "None; timeouts are fine" },
        { id: "one", label: "About one" },
        { id: "many", label: "Dozens: about 24 a month" },
        { id: "thousand", label: "Thousands" },
      ],
      answer: "many",
      observe: "too-eager",
      reveal: {
        text: "In the lab, pauses are lognormal with a 0.5 s median and 8 s 99th percentile, and about 12% of them exceed 2 seconds. Two hundred pauses a month gives roughly 24 needless failovers, each one a chance for split brain and a stampede of clients.",
        derived: true,
        line: { speaker: "meera", line: "A short timeout does not detect failure. It detects slowness, and slowness is normal." },
      },
    },
  ],
  widget: { id: "failover-lab", config: FAIL },
  mechanism: [
    {
      id: "steps",
      scene: "detect",
      text: "A failover has four steps: detect that the primary is gone, elect or choose a new one, promote it, and redirect clients. Detection is usually a heartbeat check with a timeout; promotion needs the replica to finish replaying; redirection is a proxy update or a DNS change that clients may cache.",
      sourceIds: ["rds-failover"],
    },
    {
      id: "tradeoff",
      scene: "false",
      text: "Detection is a guess. A node that does not answer might be dead, or just busy, or cut off by the network, and you cannot tell which from outside. Wait long and a real failure drags on; wait short and every long pause triggers a failover nobody needed. Failure detectors formalise exactly this trade-off.",
      sourceIds: ["chandra-toueg"],
    },
    {
      id: "split",
      scene: "fence",
      text: "The worst result of a wrong guess is split brain: the old primary is alive, a new one is promoted, and both accept writes, so the data diverges and must be reconciled by hand. GitHub's 2018 outage began with a brief partition and a failover, and took a day to repair.",
      sourceIds: ["github-2018"],
    },
    {
      id: "fence",
      text: "Fence the old primary before promoting the new one: revoke its access to storage, cut its network, or have the storage layer reject its writes by a token that only the current leader holds. A fencing token that increases with each new leader lets storage refuse a stale leader even if it does not know it was replaced.",
      sourceIds: ["kleppmann-fencing"],
    },
  ],
  challenges: [
    {
      id: "failover-rules",
      title: "Set the failover rules",
      brief: "Choose the heartbeat and missed-count so a real failure costs at most 30 seconds of downtime, with at most half a needless failover a month, and zero chance of split brain by fencing. Clients reconnect in 1 second through a proxy, or wait for DNS for 30 seconds.",
      line: { speaker: "kabir", line: "I would like to be fast and also never wrong. I hear that is not on the menu." },
      widget: { id: "failover-lab", config: FAIL_CHALLENGE },
      conditions: [
        { metric: "downtimeS", op: "<=", value: 30, label: "Real failure downtime at most 30 s" },
        { metric: "falseFailovers", op: "<=", value: 0.5, label: "At most 0.5 needless failovers a month" },
        { metric: "splitBrains", op: "<=", value: 0.05, label: "At most 0.05 split-brain incidents a month" },
      ],
      stars: [{ metric: "downtimeS", op: "<=", value: 24, label: "Downtime at most 24 s" }],
      hints: [
        "How long after a failure do clients wait just to find the new primary?",
        "A needless failover needs a pause longer than your detection time. Find the detection time where those become rare.",
        "A needless failover only becomes split brain if the old primary can still write. What stops it?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what happens in a database failover, why detection is hard, and how to avoid split brain.",
    rubric: [
      { id: "steps", criterion: "Detect the failure, choose and promote a new primary, then redirect clients, each adding to downtime", keyIdea: "detect, promote, redirect" },
      { id: "detect", criterion: "A missing heartbeat cannot distinguish a dead node from a slow or unreachable one, so short timeouts cause needless failovers and long ones prolong real outages", keyIdea: "slow versus dead" },
      { id: "split", criterion: "A needless failover can leave two primaries; fence the old one so it cannot accept writes", keyIdea: "fencing prevents split brain" },
    ],
    exemplar:
      "A failover detects that the primary is gone, promotes a replica, and redirects clients, and each step adds downtime. Detection is a guess, because a missing heartbeat could mean dead, slow, or partitioned, so a short timeout fails over needlessly on pauses and a long one prolongs real outages. A needless failover can leave two primaries accepting writes, so I fence the old one, cutting its storage or network access, before promoting the new one.",
  },
  reviews: [
    {
      id: "fo-est",
      format: "estimate",
      scenario: "A heartbeat every 2 seconds with 5 misses allowed, 6 seconds of election and promotion, and clients reconnecting through a proxy in 1 second. About how long is the outage after a real failure?",
      unit: "s",
      answer: 17,
      acceptFactor: 1.1,
      breakdown: ["Detection: 2 × 5 = 10 s", "Election and promotion: 6 s", "Reconnect: 1 s", "= 17 s"],
      explain: "Detection is usually the biggest share, and it is the part you chose.",
    },
    {
      id: "fo-pick",
      format: "pick-fix",
      scenario: "A cluster failed over twice last month with no real failure; each time a long garbage-collection pause made the heartbeat time out. What is the best change?",
      options: [
        { id: "a", label: "Lengthen the failure-detection timeout, and fix the long pauses" },
        { id: "b", label: "Shorten the timeout to fail over faster" },
        { id: "c", label: "Disable failover entirely" },
        { id: "d", label: "Add a second heartbeat on the same path" },
      ],
      answer: "a",
      explain: "The timeout is shorter than the pauses a healthy node has. Lengthening it, and shrinking the pauses, removes the false positives at a small cost to real-failure recovery.",
    },
    {
      id: "fo-order",
      format: "order",
      scenario: "Order these failover setups by downtime after a real primary failure, shortest first.",
      items: [
        { id: "proxy-fast", label: "5 s detection, proxy" },
        { id: "proxy-slow", label: "20 s detection, proxy" },
        { id: "dns-fast", label: "5 s detection, DNS with a 30 s TTL" },
        { id: "dns-slow", label: "20 s detection, DNS with a 30 s TTL" },
      ],
      answer: ["proxy-fast", "proxy-slow", "dns-fast", "dns-slow"],
      explain: "The proxy saves about 30 seconds of client waiting; a longer detection adds its extra 15 seconds on either path.",
    },
    {
      id: "fo-graph",
      format: "predict-graph",
      scenario: "Lengthen the time to declare the primary dead from 1 second to 40 seconds. How does the number of needless failovers per month change?",
      xLabel: "time to declare dead →",
      yLabel: "needless failovers",
      options: [
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "decay", label: "Falls steeply, then flattens near zero", points: [8, 3.4, 1.4, 0.6, 0.3, 0.15, 0.08, 0.05] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "decay",
      explain: "Pauses have a long tail, so most are short and few are long: each extra second of patience eliminates a smaller share of them.",
    },
    {
      id: "fo-flaw",
      format: "spot-flaw",
      scenario: "A failover script promotes the replica as soon as the health check fails, without touching the old primary. During a network partition both nodes accept writes. Tap the missing step.",
      diagram: {
        nodes: [
          { id: "old", label: "old primary · alive, partitioned", kind: "db", col: 0, row: 0 },
          { id: "script", label: "failover script: promote replica", kind: "worker", col: 1, row: 1 },
          { id: "new", label: "new primary", kind: "db", col: 2, row: 0 },
        ],
        edges: [
          { from: "script", to: "old" },
          { from: "script", to: "new" },
        ],
      },
      answer: "script->old",
      explain: "The script never fences the old primary. Cut its storage or network, or have storage reject its writes, before promoting the replica.",
    },
    {
      id: "fo-explain",
      format: "explain",
      scenario: "In two sentences: why can a failure detector never be both fast and always right?",
      rubric: [
        { id: "ambig", criterion: "From outside, a dead node and a slow or unreachable one look the same: no answer" },
        { id: "tradeoff", criterion: "So waiting longer reduces false alarms but delays detecting real failures" },
      ],
      exemplar: "A dead node, a very slow node, and an unreachable node all look the same from outside: they do not answer. Waiting longer reduces false alarms but delays noticing real failures, so you must pick a trade-off.",
      explain: "Silence is ambiguous.",
    },
  ],
  codex: {
    oneLiner: "Failover is detect, promote, redirect. Short timeouts cause needless failovers, long ones prolong outages. Fence the old primary to prevent split brain.",
    keyNumbers: [
      { label: "Downtime of a failover", value: "detection + election + promotion + client redirect", sourceId: "rds-failover" },
      { label: "Needless failovers", value: "pause rate × P(pause longer than the timeout)", sourceId: "chandra-toueg" },
      { label: "Fencing", value: "increasing tokens reject a stale leader", sourceId: "kleppmann-fencing" },
    ],
    tradeoffs: [
      { choice: "Short detection timeout", gain: "Fast recovery from real failures", cost: "Needless failovers on pauses; split-brain risk" },
      { choice: "Long timeout", gain: "Rare false positives", cost: "Longer real outages" },
      { choice: "Connection proxy", gain: "Clients redirected in about a second", cost: "Another component that must itself be highly available" },
    ],
    seenIn: ["Patroni, Orchestrator, and managed failover in RDS and Aurora.", "Postmortems where a failover made a bad situation worse."],
    interviewAngle: "Say 'fencing' unprompted: 'automatic failover with a timeout tuned against real pause data, a proxy to redirect clients, and fencing so a stale primary cannot write.'",
    aws: [{ concept: "Managed failover", service: "RDS Multi-AZ and Aurora automatic failover; RDS Proxy" }],
    replay: { id: "failover-lab", config: FAIL, scene: "fence" },
  },
  interview: [
    "What happens during a database failover, and how long does it take?",
    "What is split brain and how do you prevent it?",
    "How would you choose a heartbeat timeout?",
  ],
  deeper: [
    {
      title: "Why consensus enters the picture",
      body: "Deciding who the primary is, with machines that can fail and networks that can partition, is a consensus problem. Systems that need no split brain use a consensus protocol, such as Raft, to elect a leader that a majority agrees on, so a minority partition cannot elect its own. Simple heartbeat failover is a weaker, easier mechanism, which is why it needs fencing.",
      derived: true,
    },
  ],
  honestPhysics: [
    "The primary is declared dead after `missed` consecutive heartbeats, spaced `interval` seconds apart. Real health checks add network and scheduling noise.",
    "Pauses on healthy primaries are lognormal with a 0.5 s median and an 8 s 99th percentile, 200 times a month. Any longer than the detection time triggers a needless failover.",
    "Election takes 2 s and promotion 4 s. Clients reconnect in 1 s through a proxy or wait 30 s for DNS. Fencing is assumed to work 99% of the time.",
  ],
  sources: [GITHUB, KLEPPMANN_LOCK, CHANDRA, RDS_FAILOVER],
  verify: [
    { id: "eager", claim: "A 2 s detection fails over needlessly dozens of times a month", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 1, missed: 2 }, metric: "falseFailovers" }, expect: { min: 20 } },
    { id: "dns", claim: "Waiting for DNS adds 29 seconds of downtime over a proxy", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 3, missed: 5, proxy: false }, metric: "downtimeS" }, expect: { min: 40 } },
    { id: "good-down", claim: "15 s detection with a proxy recovers in 22 s", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 3, missed: 5, proxy: true, fencing: true }, metric: "downtimeS" }, expect: { max: 30 } },
    { id: "good-false", claim: "…with under half a needless failover a month", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 3, missed: 5, proxy: true, fencing: true }, metric: "falseFailovers" }, expect: { max: 0.5 } },
    { id: "good-split", claim: "…and fencing keeps split brain below 0.05 a month", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 3, missed: 5, proxy: true, fencing: true }, metric: "splitBrains" }, expect: { max: 0.05 } },
    { id: "unfenced", claim: "Without fencing the same settings risk split brain", run: "lab", params: { model: "failover-lab", config: FAIL_CHALLENGE, values: { interval: 3, missed: 5, proxy: true, fencing: false }, metric: "splitBrains" }, expect: { min: 0.05 } },
  ],
});
