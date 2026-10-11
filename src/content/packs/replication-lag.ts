import { definePack } from "../define";

export const LAG = { lockLag: false, start: { strategy: "replica", lagMs: 100, pinS: 1 } };
export const LAG_CHALLENGE = { lockLag: true, lagMs: 800, start: { strategy: "replica", pinS: 1 } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 5: Problems with replication lag (read-your-writes, monotonic reads)", url: "https://dataintensive.net/" };
const PG_HOTSTANDBY = { id: "pg-hot-standby", title: "PostgreSQL docs: Hot Standby (queries on a standby; replay conflicts and lag)", url: "https://www.postgresql.org/docs/current/hot-standby.html" };
const AURORA_LAG = { id: "aurora-replica-lag", title: "AWS docs: Amazon Aurora replica lag (typically milliseconds; reader endpoints and failover)", url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html" };

export default definePack({
  id: "replication-lag",
  title: "Replication Lag & Read-Your-Writes",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'my post disappeared'", detail: "reappears after a refresh" },
    lines: [
      { speaker: "kabir", line: "Users post something, reload, and it is gone, then back a second later. Support thinks we are losing data." },
      { speaker: "meera", line: "The write went to the primary and the reload read from a replica that had not caught up. Nothing was lost, it was just late." },
    ],
  },
  predictions: [
    {
      id: "how-often",
      kind: "choice",
      prompt: "Replicas lag the primary by 800 ms. Users write about once every 30 seconds on average, and reads go to replicas. About what share of reads misses the user's own recent write?",
      options: [
        { id: "tiny", label: "Practically never, under 0.01%" },
        { id: "few", label: "A few percent: about 2.6% of reads land within the lag of a write" },
        { id: "third", label: "About a third" },
        { id: "half", label: "About half" },
      ],
      answer: "few",
      observe: "stale-seen",
      reveal: {
        text: "A read is stale if it lands within the lag of the user's own last write. With one write per 30 seconds and 800 ms of lag, that is 1 − e^(−0.8 ÷ 30) = 2.6% of reads. Small, but for a feed that is thousands of confused users a day.",
        derived: true,
        line: { speaker: "meera", line: "A rare bug is a daily one at scale." },
      },
    },
  ],
  widget: { id: "lag-lab", config: LAG },
  mechanism: [
    {
      id: "why",
      scene: "stale",
      text: "A replica applies changes after the primary commits them, so it is always a little behind: milliseconds on a healthy system, seconds or minutes under load or after a network problem. Reading from it returns the world as it was a moment ago, which is usually fine and sometimes wrong.",
      sourceIds: ["ddia", "aurora-replica-lag"],
    },
    {
      id: "ryw",
      text: "The failure users notice is read-your-writes: a user writes something and then reads from a replica that has not seen it, so their own change seems to vanish. A related one is a time warp: two reads in a row hit different replicas, and the second shows older data than the first.",
      sourceIds: ["ddia"],
    },
    {
      id: "pin",
      scene: "pin",
      text: "A simple fix: after a user writes, read from the primary for a short window, longer than the typical lag, then go back to replicas. Most reads still go to replicas, because most users are not writing; only the recent writers' reads cost the primary. Pin a user's session to one replica as well, and reads never go backward.",
      sourceIds: ["ddia"],
      derived: true,
    },
    {
      id: "lsn",
      scene: "lsn",
      text: "A more precise fix tracks the write's position in the log. The client remembers the position of its last write, and the replica waits until it has replayed up to it before answering. That is always correct, but a read right after a write waits out the lag, which shows up in the slowest reads.",
      sourceIds: ["pg-hot-standby"],
    },
  ],
  challenges: [
    {
      id: "own-writes",
      title: "Stop the vanishing posts",
      brief: "Replicas lag by about 800 ms during busy hours. Choose the read policy so no more than 0.1% of reads miss the user's own write, no more than 10% of reads go to the primary, and the slowest reads are delayed by at most 300 ms.",
      line: { speaker: "rao", line: "Sending everything to the primary defeats the purpose of replicas. Send only what must go." },
      widget: { id: "lag-lab", config: LAG_CHALLENGE },
      conditions: [
        { metric: "missRate", op: "<=", value: 0.001, label: "At most 0.1% of reads miss the user's write" },
        { metric: "primaryShare", op: "<=", value: 0.1, label: "At most 10% of reads go to the primary" },
        { metric: "extraP99Ms", op: "<=", value: 300, label: "Slowest reads delayed at most 300 ms" },
      ],
      stars: [{ metric: "primaryShare", op: "<=", value: 0.05, label: "At most 5% of reads to the primary" }],
      hints: [
        "How long after a write can a replica still be stale?",
        "What does waiting for the replica cost in the slowest reads?",
        "Pin to the primary for a window longer than the lag but short enough to keep the primary light.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain read-your-writes anomalies with replicas and two ways to prevent them.",
    rubric: [
      { id: "cause", criterion: "A replica lags the primary, so a read right after a write can miss it", keyIdea: "lag causes stale own-writes" },
      { id: "pin", criterion: "Route the user's reads to the primary for a short window after they write, then back to replicas", keyIdea: "pin to primary after a write" },
      { id: "lsn", criterion: "Or wait for the replica to reach the user's write position, trading latency for correctness", keyIdea: "wait for the log position" },
    ],
    exemplar:
      "A replica applies changes after the primary commits them, so a read right after a write can miss the user's own change even though nothing was lost. One fix is to send that user's reads to the primary for a short window after they write, longer than the typical lag. Another is to have the replica wait until it has replayed up to the user's write position, which is always correct but delays reads that follow a write.",
  },
  reviews: [
    {
      id: "rl-est",
      format: "estimate",
      scenario: "Users write once every 30 seconds on average. If you pin a user's reads to the primary for 3 seconds after each write, about what share of reads goes to the primary? (1 − e^(−3 ÷ 30))",
      unit: "%",
      answer: 9.5,
      acceptFactor: 1.2,
      breakdown: ["1 − e^(−0.1)", "= 1 − 0.905", "≈ 9.5%"],
      explain: "A short window keeps almost all reads on replicas, because most reads are far from the user's last write.",
    },
    {
      id: "rl-pick",
      format: "pick-fix",
      scenario: "A user refreshes a page twice and the second refresh shows older comments than the first. Reads rotate randomly across three replicas. What anomaly is this, and what is the fix?",
      options: [
        { id: "a", label: "A time warp (non-monotonic reads); pin the user's session to one replica" },
        { id: "b", label: "A lost update; use a transaction" },
        { id: "c", label: "A phantom; raise the isolation level" },
        { id: "d", label: "A cache stampede; add jitter" },
      ],
      answer: "a",
      explain: "Different replicas are at different positions, so the user can move backward in time. Sending one user to the same replica keeps their view monotonic.",
    },
    {
      id: "rl-order",
      format: "order",
      scenario: "Order these read policies by the share of reads that miss the user's own recent write, highest first, at 800 ms of lag.",
      items: [
        { id: "replica", label: "Replicas only" },
        { id: "short", label: "Pin to the primary for 0.3 s after a write" },
        { id: "long", label: "Pin to the primary for 3 s after a write" },
        { id: "lsn", label: "Wait for the replica to reach the write" },
      ],
      answer: ["replica", "short", "long", "lsn"],
      explain: "A pinning window shorter than the lag still lets some reads through to stale replicas. A window longer than the lag, or an exact wait, removes the problem.",
    },
    {
      id: "rl-graph",
      format: "predict-graph",
      scenario: "Hold writes at one per 30 seconds per user and raise replica lag from 10 ms to 10 seconds, with reads going to replicas. How does the share of reads that miss the user's own write change?",
      xLabel: "replica lag →",
      yLabel: "reads missing own writes",
      options: [
        { id: "flat", label: "Stays flat", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "rise", label: "Grows roughly in proportion to the lag, then bends over", points: [0.1, 0.5, 1.2, 2.2, 3.5, 5, 6.2, 7] },
        { id: "step", label: "Jumps once", points: [0, 0, 0, 0, 8, 8, 8, 8] },
        { id: "fall", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "rise",
      explain: "The chance a read falls within the lag of a write is 1 − e^(−lag ÷ gap), roughly lag ÷ gap for small lag, so it grows with lag.",
    },
    {
      id: "rl-flaw",
      format: "spot-flaw",
      scenario: "The app saves a profile edit, then immediately redirects to the profile page, which reads from a replica. About one user in fifty sees the old profile. Tap the part of the flow that should read differently.",
      diagram: {
        nodes: [
          { id: "save", label: "save → write to primary", kind: "server", col: 0, row: 1 },
          { id: "redirect", label: "redirect to /profile", kind: "client", col: 1, row: 1 },
          { id: "read", label: "profile read from a replica", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "save", to: "redirect" },
          { from: "redirect", to: "read" },
        ],
      },
      answer: "redirect->read",
      explain: "The read that immediately follows the user's own write should go to the primary, or wait for the replica to catch up, because that is exactly when lag is visible.",
    },
    {
      id: "rl-explain",
      format: "explain",
      scenario: "In two sentences: why not simply send all reads to the primary to avoid stale reads?",
      rubric: [
        { id: "load", criterion: "That puts all the read load on one node and defeats the purpose of the replicas" },
        { id: "targeted", criterion: "Most reads do not need to see a user's fresh write, so route only those that do to the primary" },
      ],
      exemplar: "That would put all read traffic back on the primary and waste the replicas. Most reads do not depend on the user's own fresh write, so only the few that do need the primary.",
      explain: "Pay for freshness only where it is noticed.",
    },
  ],
  codex: {
    oneLiner: "Replicas lag the primary. After a write, read from the primary for a window longer than the lag, or wait for the replica's log position.",
    keyNumbers: [
      { label: "Own-write miss rate", value: "1 − e^(−lag ÷ write gap)", sourceId: "ddia" },
      { label: "Typical Aurora replica lag", value: "tens of milliseconds, not guaranteed", sourceId: "aurora-replica-lag" },
    ],
    tradeoffs: [
      { choice: "Pin to primary after a write", gain: "Simple; removes own-write misses", cost: "Extra load on the primary, proportional to the window" },
      { choice: "Wait for the log position", gain: "Always correct without sending reads to the primary", cost: "Reads right after writes wait out the lag" },
      { choice: "Session-sticky replica", gain: "Monotonic reads", cost: "Does not fix own-write misses by itself" },
    ],
    seenIn: ["Redirects after form posts that read from a replica.", "Frameworks with 'use primary for the next N seconds' middleware."],
    interviewAngle: "Name the anomaly and the fix: 'read-your-writes via a short primary-pinning window or LSN wait, and session stickiness for monotonic reads.'",
    aws: [{ concept: "Reader and writer endpoints", service: "Aurora reader endpoint and writer endpoint" }],
    replay: { id: "lag-lab", config: { lockLag: false, start: { strategy: "pin", lagMs: 800, pinS: 3 } }, scene: "pin" },
  },
  interview: [
    "What is replication lag and what bugs does it cause?",
    "How do you give a user read-your-writes with read replicas?",
    "What is a monotonic-reads anomaly?",
  ],
  deeper: [
    {
      title: "Consistency promises below linearizability",
      body: "Between 'always the latest' and 'anything goes' sit useful guarantees. Read-your-writes means you see your own updates; monotonic reads means you never go back in time; consistent prefix means you see writes in the order they happened. They can be provided per user with cheap routing and tokens, without paying for full linearizability on every read.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "Users write about once every 30 seconds; a read is 'recent' if it comes within the pinning window of the user's last write. Round figures for a social feature.",
    "A read misses the user's own write if it hits a replica within the lag of that write: 1 − e^(−lag ÷ 30 s).",
    "Waiting for a replica to reach the write adds up to the lag to reads right after a write. The lab charges the whole lag to the 99th percentile once more than 1% of reads are recent.",
  ],
  sources: [DDIA, PG_HOTSTANDBY, AURORA_LAG],
  verify: [
    { id: "miss", claim: "Reads to replicas at 800 ms lag miss the user's write about 2.6% of the time", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "replica" }, metric: "missRate" }, expect: { min: 0.025, max: 0.027 } },
    { id: "short-pin", claim: "A 0.3 s pin is shorter than the lag and still misses", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "pin", pinS: 0.3 }, metric: "missRate" }, expect: { min: 0.001 } },
    { id: "pin", claim: "A 1 s pin removes the misses", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "pin", pinS: 1 }, metric: "missRate" }, expect: { max: 0.001 } },
    { id: "pin-share", claim: "…at about 3% of reads on the primary", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "pin", pinS: 1 }, metric: "primaryShare" }, expect: { max: 0.05 } },
    { id: "lsn", claim: "Waiting for the log position delays the slowest reads by the whole lag", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "lsn" }, metric: "extraP99Ms" }, expect: { min: 300 } },
    { id: "long-pin", claim: "A 10 s pin sends over 10% of reads to the primary", run: "lab", params: { model: "lag-lab", config: LAG_CHALLENGE, values: { strategy: "pin", pinS: 10 }, metric: "primaryShare" }, expect: { min: 0.1 } },
  ],
});
