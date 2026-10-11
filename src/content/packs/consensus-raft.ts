import { definePack } from "../define";

export const RAFT = { start: { timeout: 1000, heartbeat: 100, nodes: "5" } };

const RAFT_PAPER = { id: "raft-paper", title: "D. Ongaro and J. Ousterhout (2014), In Search of an Understandable Consensus Algorithm (Raft), USENIX ATC", url: "https://raft.github.io/raft.pdf" };
const ETCD_TUNING = { id: "etcd-tuning", title: "etcd docs: Tuning (heartbeat interval and election timeout)", url: "https://etcd.io/docs/v3.5/tuning/" };
const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 9: Consistency and consensus", url: "https://dataintensive.net/" };

export default definePack({
  id: "consensus-raft",
  title: "Consensus (Raft)",
  kind: "concept",
  estimatedMinutes: 16,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "config-store · leader changed 14 times in the last hour", detail: "no node has crashed" },
    lines: [
      { speaker: "kabir", line: "Our coordination cluster keeps electing new leaders although every node is healthy, and each election pauses every service that depends on it." },
      { speaker: "meera", line: "A follower thought the leader was dead because a heartbeat was late. Consensus needs timers, and the timers are a guess." },
    ],
  },
  predictions: [
    {
      id: "twitchy",
      kind: "choice",
      prompt: "Five nodes, heartbeats every 50 ms, election timeout 150 ms, on a network where heartbeats usually take 5 ms but 1 in 100 takes over 80 ms. About how many needless elections start per hour?",
      options: [
        { id: "zero", label: "None" },
        { id: "ten", label: "About 10" },
        { id: "nine-hundred", label: "About 900" },
        { id: "thirty-thousand", label: "About 30,000" },
      ],
      answer: "nine-hundred",
      observe: "too-twitchy",
      reveal: {
        text: "Heartbeats go out 72,000 times an hour to each of four followers, and the chance that one is delayed past the follower's timeout is a fraction of a percent. Multiplied together that is hundreds of needless elections an hour, each pausing the cluster.",
        derived: true,
        line: { speaker: "meera", line: "A timeout that sits inside normal jitter will fire on normal days." },
      },
    },
    {
      id: "slow",
      kind: "choice",
      prompt: "To avoid false elections you set the timeout to 5 seconds. When the leader really crashes, how long is the cluster without a leader?",
      options: [
        { id: "under", label: "About 1 second" },
        { id: "two", label: "About 2 seconds" },
        { id: "six", label: "About 6 seconds" },
        { id: "minute", label: "About a minute" },
      ],
      answer: "six",
      observe: "too-slow",
      reveal: {
        text: "Followers wait their whole randomised timeout, between 5 and 10 seconds after the last heartbeat, before the first one stands for election. On average the cluster is leaderless for about 5.8 seconds. Safe against false alarms, slow against real failures.",
        derived: true,
        line: { speaker: "rao", line: "Long timeouts turn each real crash into a long pause." },
      },
    },
  ],
  widget: { id: "raft-lab", config: RAFT },
  mechanism: [
    {
      id: "why",
      text: "Consensus lets several nodes agree on a sequence of values even if some fail, so they can act as one reliable machine. Raft does it with one leader at a time. The leader orders every write, copies it to the followers, and counts it committed once a majority has stored it.",
      sourceIds: ["raft-paper", "ddia"],
    },
    {
      id: "majority",
      text: "A majority is the safety valve. Two majorities always overlap, so a new leader is always elected by at least one node that saw every committed write, and cannot lose them. With five nodes, three must agree and two can fail. Fewer than a majority is not enough to make progress.",
      sourceIds: ["raft-paper"],
    },
    {
      id: "timeout",
      scene: "timeout",
      text: "Followers expect heartbeats from the leader. If none arrives within a randomised election timeout, a follower becomes a candidate and asks for votes. Too short and a late heartbeat triggers needless elections; too long and a real crash leaves the cluster leaderless for that long.",
      sourceIds: ["raft-paper", "etcd-tuning"],
    },
    {
      id: "split",
      scene: "split",
      text: "If two followers time out at nearly the same moment, they split the vote and nobody wins, so they try again after another random wait. Random timeouts spread over a range make this rare; a narrow range or many followers make it likelier. Heartbeats should be a fraction of the timeout, about a tenth.",
      sourceIds: ["raft-paper", "etcd-tuning"],
    },
  ],
  challenges: [
    {
      id: "timers",
      title: "Tune the election timer",
      brief: "A five-node cluster on a network with occasional slow heartbeats. Choose the election timeout and heartbeat so a real crash leaves it leaderless for at most 1.5 seconds, there is at most one needless election an hour, and at most 5% of elections split the vote.",
      line: { speaker: "kabir", line: "I need it to wait out a hiccup and still notice a crash before the pager does." },
      widget: { id: "raft-lab", config: { start: { timeout: 300, heartbeat: 100, nodes: "5" } } },
      conditions: [
        { metric: "failoverMs", op: "<=", value: 1500, label: "Leaderless at most 1.5 s after a crash" },
        { metric: "falsePerHour", op: "<=", value: 1, label: "At most 1 needless election an hour" },
        { metric: "splitPct", op: "<=", value: 0.05, label: "At most 5% of elections split" },
      ],
      stars: [],
      hints: [
        "How large must the timeout be to sit above the occasional slow heartbeat?",
        "How large can it be before a real crash is noticed too late?",
        "A narrow election window makes split votes likelier.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how Raft elects a leader and how to tune the election timeout.",
    rubric: [
      { id: "majority", criterion: "A candidate needs votes from a majority, and any two majorities overlap, so a new leader has all committed writes", keyIdea: "majority overlap" },
      { id: "timeout", criterion: "A follower that hears no heartbeat within a randomised timeout becomes a candidate; random timeouts avoid split votes", keyIdea: "randomised timeout" },
      { id: "tune", criterion: "Too short causes needless elections on slow heartbeats; too long delays recovery from a real crash", keyIdea: "short versus long timeout" },
    ],
    exemplar:
      "A follower that hears no heartbeat within a randomised timeout becomes a candidate and asks for votes, and it wins with a majority. Because any two majorities overlap, the new leader is sure to have every committed write. Random timeouts make split votes rare. I would set the timeout above the network's normal jitter so late heartbeats do not trigger elections, but short enough that a real crash is noticed within a second or two.",
  },
  reviews: [
    {
      id: "rf-est",
      format: "estimate",
      scenario: "A cluster has 7 nodes. How many must be up and agree for a write to commit?",
      unit: "nodes",
      answer: 4,
      acceptFactor: 1.01,
      breakdown: ["majority of 7 = ⌊7 ÷ 2⌋ + 1", "= 4"],
      explain: "Three can fail and the cluster still works. Two groups of 4 would have to overlap, so there cannot be two leaders.",
    },
    {
      id: "rf-pick",
      format: "pick-fix",
      scenario: "A cluster with a 100 ms election timeout keeps electing leaders although nodes are healthy. Network jitter spikes to 300 ms occasionally. What is the best fix?",
      options: [
        { id: "a", label: "Raise the election timeout above the jitter and keep heartbeats well below it" },
        { id: "b", label: "Lower the heartbeat interval only" },
        { id: "c", label: "Add more nodes" },
        { id: "d", label: "Remove the timeout" },
      ],
      answer: "a",
      explain: "A timeout that sits inside normal jitter will fire on normal days. Set it above the slow tail, and heartbeats a fraction of it.",
    },
    {
      id: "rf-order",
      format: "order",
      scenario: "Order these clusters by the number of node failures they can survive and still commit writes, most first.",
      items: [
        { id: "seven", label: "7 nodes" },
        { id: "five", label: "5 nodes" },
        { id: "three", label: "3 nodes" },
      ],
      answer: ["seven", "five", "three"],
      explain: "Seven survive 3 failures, five survive 2 and three survive 1. An even size adds cost without adding tolerance, which is why odd sizes are standard.",
    },
    {
      id: "rf-graph",
      format: "predict-graph",
      scenario: "As you raise the election timeout from 100 ms to 5 seconds, how does the time the cluster is leaderless after a real crash change?",
      xLabel: "election timeout →",
      yLabel: "leaderless after a crash",
      options: [
        { id: "linear", label: "Rises roughly in proportion to the timeout", points: [0.17, 0.5, 0.9, 1.2, 1.8, 2.4, 4, 5.8] },
        { id: "flat", label: "Stays about the same", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "fall", label: "Falls", points: [5.8, 4, 2.4, 1.8, 1.2, 0.9, 0.5, 0.17] },
      ],
      answer: "linear",
      explain: "Followers wait their whole timeout before they stand for election, so the unavailable time grows with it.",
    },
    {
      id: "rf-flaw",
      format: "spot-flaw",
      scenario: "A team runs a two-node cluster 'for redundancy' and requires both nodes to agree. When one fails, the cluster stops. They then lower the quorum to one node. Tap the step that risks two leaders.",
      diagram: {
        nodes: [
          { id: "a", label: "node A", kind: "server", col: 0, row: 0 },
          { id: "b", label: "node B", kind: "server", col: 0, row: 2 },
          { id: "quorum", label: "quorum = 1", kind: "lb", col: 1, row: 1 },
        ],
        edges: [
          { from: "a", to: "quorum" },
          { from: "b", to: "quorum" },
        ],
      },
      answer: "a->quorum",
      explain: "With a quorum of one, each node can win alone during a network split, giving two leaders. Majorities are what guarantee a single leader, so use three nodes.",
    },
    {
      id: "rf-explain",
      format: "explain",
      scenario: "In two sentences: why does a Raft cluster need a majority rather than just a few nodes to agree?",
      rubric: [
        { id: "overlap", criterion: "Any two majorities share at least one node, so a new leader always includes a node with every committed write" },
        { id: "split", criterion: "A minority partition cannot elect a leader, so there is never more than one active leader" },
      ],
      exemplar: "Any two majorities overlap in at least one node, so whoever wins the next election knows every committed write. A minority side of a partition cannot reach a majority, so two leaders never operate at once.",
      explain: "Overlap is the safety property.",
    },
  ],
  codex: {
    oneLiner: "Raft: one leader, majority commits, randomised election timeouts. Set the timeout above network jitter, heartbeats at a tenth of it.",
    keyNumbers: [
      { label: "Majority of N nodes", value: "⌊N ÷ 2⌋ + 1", sourceId: "raft-paper" },
      { label: "Typical heartbeat to election timeout ratio", value: "about 1 to 10", sourceId: "etcd-tuning" },
    ],
    tradeoffs: [
      { choice: "Short timeout", gain: "Quick failover", cost: "Needless elections when heartbeats are late" },
      { choice: "Long timeout", gain: "Stable leadership", cost: "Long pause after a real crash" },
      { choice: "More nodes", gain: "Tolerates more failures", cost: "Every write waits for a larger majority" },
    ],
    seenIn: ["etcd (Kubernetes), Consul, CockroachDB, TiKV.", "Kafka KRaft metadata quorum."],
    interviewAngle: "Say: 'one leader, majority commit, randomised timeouts; run 3 or 5 nodes, keep the timeout above jitter'.",
    aws: [{ concept: "Managed Raft-based coordination", service: "Amazon MSK KRaft / EKS control plane (etcd)" }],
    replay: { id: "raft-lab", config: RAFT, scene: "timeout" },
  },
  interview: [
    "How does Raft elect a leader?",
    "Why do we run an odd number of nodes?",
    "How do you tune election timeouts?",
  ],
  deeper: [
    {
      title: "Pre-vote and leader leases",
      body: "A node that was partitioned away increments its term and, on returning, can force the healthy leader to step down. Pre-vote stops this: a candidate first asks whether others would vote for it, and only then starts a real election. Leader leases let a leader serve reads without a round trip while it knows no other leader can exist.",
      sourceIds: ["raft-paper", "etcd-tuning"],
    },
  ],
  honestPhysics: [
    "Election timeouts are uniform from T to 2T. After a crash, the first follower to time out starts an election and the others reply within a 10 ms round trip. A split vote happens when the two earliest timeouts fall within that round trip, and costs another timeout.",
    "Expected leaderless time is T × (1 + 1 ÷ N) − heartbeat ÷ 2 + 20 ms for the vote, plus the split chance times 1.5 T.",
    "Heartbeat delays are lognormal with a 5 ms median and an 80 ms p99, independent for each follower. Real implementations add pre-vote and leases.",
  ],
  sources: [RAFT_PAPER, ETCD_TUNING, DDIA],
  verify: [
    { id: "twitchy", claim: "A 150 ms timeout fires needlessly about 900 times an hour", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 150, heartbeat: 50, nodes: "5" }, metric: "falsePerHour" }, expect: { min: 500 } },
    { id: "slow", claim: "A 5-second timeout leaves the cluster leaderless for over 5 seconds", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 5000, heartbeat: 500, nodes: "5" }, metric: "failoverMs" }, expect: { min: 5000 } },
    { id: "good-fail", claim: "A 1-second timeout recovers in about 1.2 seconds", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 1000, heartbeat: 100, nodes: "5" }, metric: "failoverMs" }, expect: { max: 1500 } },
    { id: "good-false", claim: "…with under one needless election an hour", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 1000, heartbeat: 100, nodes: "5" }, metric: "falsePerHour" }, expect: { max: 1 } },
    { id: "good-split", claim: "…and under 5% split votes", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 1000, heartbeat: 100, nodes: "5" }, metric: "splitPct" }, expect: { max: 0.05 } },
    { id: "edge", claim: "A 500 ms timeout is too twitchy", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 500, heartbeat: 100, nodes: "5" }, metric: "falsePerHour" }, expect: { min: 5 } },
    { id: "seven", claim: "Seven nodes split votes more often", run: "lab", params: { model: "raft-lab", config: RAFT, values: { timeout: 1000, heartbeat: 100, nodes: "7" }, metric: "splitPct" }, expect: { min: 0.05 } },
  ],
});
