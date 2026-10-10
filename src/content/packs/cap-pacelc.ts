import { definePack } from "../define";

export const CAP = { lockPartition: true, partitionMin: 30, start: { policy: "ap", elsePart: "consistency", merge: true } };
export const CAP_CHALLENGE = { lockPartition: true, partitionMin: 30, start: { policy: "cp", elsePart: "consistency", merge: false } };

const GILBERT = { id: "gilbert-lynch", title: "S. Gilbert and N. Lynch (2002), Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services, ACM SIGACT News 33(2)", url: "https://dl.acm.org/doi/10.1145/564585.564601" };
const ABADI = { id: "abadi-pacelc", title: "D. Abadi (2012), Consistency Tradeoffs in Modern Distributed Database System Design (PACELC), IEEE Computer 45(2)", url: "https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf" };
const BREWER = { id: "brewer-cap12", title: "E. Brewer (2012), CAP Twelve Years Later: How the 'Rules' Have Changed, IEEE Computer 45(2)", url: "https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/" };

export default definePack({
  id: "cap-pacelc",
  title: "CAP & PACELC",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "network · link between eu-west and us-east down", detail: "both regions up, neither can see the other" },
    lines: [
      { speaker: "kabir", line: "Both regions are healthy but cannot see each other, and customers on both sides are filling carts. What should the carts service do?" },
      { speaker: "meera", line: "Refuse and be safe, or accept and sort it out later. There is no third answer while the link is down." },
    ],
  },
  predictions: [
    {
      id: "cp-cost",
      kind: "choice",
      prompt: "The link between two regions is down for 30 minutes a month. A cart service chooses consistency: the region that cannot reach a majority refuses writes. For how many minutes a month are half the users unable to add to their carts?",
      options: [
        { id: "zero", label: "None: consistency costs nothing" },
        { id: "few", label: "About 1.5" },
        { id: "fifteen", label: "About 15 minutes of lost service in total, spread across the half that cannot write" },
        { id: "thirty", label: "30 for all users" },
      ],
      answer: "fifteen",
      observe: "partition-cp",
      reveal: {
        text: "Half the users are on the side that cannot reach a majority, and for the full 30 minutes their writes are refused: 15 minutes of lost service counted across all users. Nothing diverges, so there is nothing to repair afterwards.",
        derived: true,
        line: { speaker: "meera", line: "Consistency is bought with unavailability, and the bill arrives during the partition." },
      },
    },
    {
      id: "ap-cost",
      kind: "choice",
      prompt: "Now both sides keep accepting writes. Carts change on both sides at 40 per minute for the 30 minutes. How many conflicting updates must be settled when the link returns, with no merge rule?",
      options: [
        { id: "twelve", label: "About 12" },
        { id: "hundred", label: "About 120" },
        { id: "twelve-hundred", label: "About 1,200" },
        { id: "tt", label: "About 12,000" },
      ],
      answer: "twelve-hundred",
      observe: "partition-ap",
      reveal: {
        text: "40 conflicting updates a minute for 30 minutes is 1,200. Availability keeps every customer shopping and moves the cost to afterwards: each conflict needs a rule, such as merging the two carts, or a person to decide.",
        derived: true,
        line: { speaker: "rao", line: "Cheap to start, expensive to settle. A merge rule makes it cheap again." },
      },
    },
  ],
  widget: { id: "cap-lab", config: CAP },
  mechanism: [
    {
      id: "cap",
      text: "When a network partition separates two groups of nodes, each has a choice. Either refuse requests that might conflict with the other side, keeping consistency and giving up availability, or serve them and give up consistency. Partitions are not optional in a real network, so the choice is between C and A.",
      sourceIds: ["gilbert-lynch", "brewer-cap12"],
    },
    {
      id: "cp",
      scene: "cp",
      text: "A consistency-first (CP) system keeps one agreed history by refusing writes on the side that cannot reach a majority. It never diverges and needs no repair, and the users on that side see errors until the link returns. Banks and inventories often choose this.",
      sourceIds: ["gilbert-lynch"],
    },
    {
      id: "ap",
      scene: "ap",
      text: "An availability-first (AP) system lets both sides keep working and reconciles afterwards. Carts, likes and presence fit it, because merging two carts by taking their union is easy. It needs a merge rule, and some conflicts, such as two people booking one seat, cannot be merged.",
      sourceIds: ["brewer-cap12"],
    },
    {
      id: "pacelc",
      scene: "else",
      text: "PACELC adds what CAP leaves out: even with no partition (Else), you trade latency against consistency. Waiting for the other region on each write is consistent and slow; replying after the local write is fast and stale elsewhere. Systems are described by both choices, such as PA/EL or PC/EC.",
      sourceIds: ["abadi-pacelc"],
    },
  ],
  challenges: [
    {
      id: "cart",
      title: "Design the cart service",
      brief: "Two regions 120 ms apart, 30 minutes of partition a month. Choose behaviour so the cart loses at most 5 minutes of service, at most 100 conflicts need settling, writes take at most 30 ms, and at most 2% of reads are stale.",
      line: { speaker: "kabir", line: "A cart that does not load costs me a sale. A cart with a duplicated sock does not." },
      widget: { id: "cap-lab", config: CAP_CHALLENGE },
      conditions: [
        { metric: "unavailMin", op: "<=", value: 5, label: "At most 5 minutes of lost service" },
        { metric: "conflicts", op: "<=", value: 100, label: "At most 100 conflicts to settle" },
        { metric: "commitMs", op: "<=", value: 30, label: "Writes at most 30 ms" },
        { metric: "stalePct", op: "<=", value: 0.02, label: "At most 2% stale reads" },
      ],
      stars: [],
      hints: [
        "Which choice leaves nobody locked out during the partition?",
        "What makes the cost of that choice small afterwards?",
        "What does waiting for the other region cost on every write?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain CAP and PACELC with a cart service and a bank ledger.",
    rubric: [
      { id: "cap", criterion: "In a partition you choose between refusing requests (consistency) and serving them with possible divergence (availability)", keyIdea: "C or A during a partition" },
      { id: "choice", criterion: "A cart can accept both sides and merge; a ledger usually refuses on the minority side", keyIdea: "match the choice to the data" },
      { id: "pacelc", criterion: "Even without a partition there is a latency versus consistency trade-off for cross-region writes", keyIdea: "else: latency or consistency" },
    ],
    exemplar:
      "When a partition splits two regions, each side has to choose between refusing requests to stay consistent or accepting them and reconciling later. A cart can accept writes on both sides and merge them by union, so I would choose availability there; a bank ledger usually refuses on the side that cannot reach a majority. PACELC adds that even with no partition, waiting for the other region on every write trades latency for consistency.",
  },
  reviews: [
    {
      id: "cp-est",
      format: "estimate",
      scenario: "A CP service loses a link for 60 minutes in a month, and half the users are on the side that must refuse writes. How many minutes of lost service is that, counted across all users?",
      unit: "minutes",
      answer: 30,
      acceptFactor: 1.05,
      breakdown: ["60 minutes × half the users", "= 30 user-share minutes"],
      explain: "Only the side without a majority is affected, so half the users lose service for the whole partition.",
    },
    {
      id: "cp-pick",
      format: "pick-fix",
      scenario: "A ticket seller allows both regions to sell seats during a partition. After it heals, two customers hold the same seat. Which design change fits?",
      options: [
        { id: "a", label: "Choose consistency for seat assignment: the minority side refuses sales, or has its own seat block" },
        { id: "b", label: "Merge the two orders by union" },
        { id: "c", label: "Add a cache" },
        { id: "d", label: "Make writes asynchronous" },
      ],
      answer: "a",
      explain: "Two people cannot share one seat, so there is no merge rule. Seat assignment needs consistency, or a design that never lets both sides sell the same seat.",
    },
    {
      id: "cp-order",
      format: "order",
      scenario: "Order these PACELC classes by write latency in normal operation, slowest first.",
      items: [
        { id: "ec", label: "PC/EC: consistent in both cases" },
        { id: "mix", label: "PA/EC: available in a partition, consistent otherwise" },
        { id: "el", label: "PA/EL: available and low latency" },
      ],
      answer: ["ec", "mix", "el"],
      explain: "Both EC classes wait for the other region on writes in normal operation. Only EL replies after the local write.",
    },
    {
      id: "cp-graph",
      format: "predict-graph",
      scenario: "A cart service chooses availability with no merge rule. As partition time grows from 1 to 240 minutes a month, how do conflicts to settle change?",
      xLabel: "partition minutes →",
      yLabel: "conflicts to settle",
      options: [
        { id: "linear", label: "Grow in proportion to partition time", points: [40, 200, 600, 1200, 2400, 4800, 7200, 9600] },
        { id: "flat", label: "Stay the same", points: [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200] },
        { id: "fall", label: "Fall", points: [9600, 7200, 4800, 2400, 1200, 600, 200, 40] },
      ],
      answer: "linear",
      explain: "Each minute of divergence adds more conflicting updates, so the repair bill grows with the length of the partition.",
    },
    {
      id: "cp-flaw",
      format: "spot-flaw",
      scenario: "A team says their database is 'CA': consistent and available, because 'partitions don't happen in our data centre'. During a switch failure the cluster splits and both halves accept writes. Tap the faulty assumption.",
      diagram: {
        nodes: [
          { id: "claim", label: "CA: no partitions", kind: "server", col: 0, row: 1 },
          { id: "net", label: "network switch", kind: "lb", col: 1, row: 1 },
          { id: "halves", label: "two halves, both writable", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "claim", to: "net" },
          { from: "net", to: "halves" },
        ],
      },
      answer: "claim->net",
      explain: "Partitions happen in any network, including a single data centre. The real choice is what the system does when one occurs.",
    },
    {
      id: "cp-explain",
      format: "explain",
      scenario: "In two sentences: why is 'pick two of consistency, availability and partition tolerance' misleading?",
      rubric: [
        { id: "p", criterion: "Partitions are not something you can opt out of, so you cannot choose to give up partition tolerance" },
        { id: "when", criterion: "The trade-off between C and A only applies during a partition; otherwise you can have both and trade latency instead" },
      ],
      exemplar: "You cannot choose to avoid partitions, so the real choice is only between consistency and availability, and only while one lasts. At other times the trade-off is between latency and consistency.",
      explain: "CAP is a statement about failure, not a menu.",
    },
  ],
  codex: {
    oneLiner: "During a partition choose consistency (refuse) or availability (diverge and merge). Otherwise trade latency against consistency. Match to the data.",
    keyNumbers: [
      { label: "Lost service, CP, 30-minute partition, half the users affected", value: "15 minutes", sourceId: "gilbert-lynch" },
      { label: "Cross-region round trip in the lab", value: "120 ms", sourceId: "abadi-pacelc" },
    ],
    tradeoffs: [
      { choice: "CP", gain: "One history; no repair", cost: "Part of the users locked out during a partition" },
      { choice: "AP with merge rules", gain: "Everyone keeps working", cost: "Reconciliation, and some conflicts cannot be merged" },
      { choice: "Synchronous cross-region writes", gain: "No stale reads", cost: "A round trip on every write" },
    ],
    seenIn: ["DynamoDB and Cassandra (PA/EL by default).", "Spanner and etcd (PC/EC)."],
    interviewAngle: "Say: 'partitions are a given, so it is C or A during one; carts merge, ledgers refuse; and else latency versus consistency'.",
    aws: [{ concept: "Global tables (last-writer-wins) versus strongly consistent reads", service: "DynamoDB" }],
    replay: { id: "cap-lab", config: CAP, scene: "ap" },
  },
  interview: [
    "Explain the CAP theorem.",
    "What does PACELC add to CAP?",
    "Would you choose CP or AP for a shopping cart? For a bank ledger?",
  ],
  deeper: [
    {
      title: "CAP's definitions are narrow",
      body: "In the formal result, consistency means linearizability and availability means every request to a working node gets a response. Real systems offer many points in between, such as read-your-writes, bounded staleness, or consistency per operation, so describing a database as simply CP or AP often hides more than it shows.",
      sourceIds: ["brewer-cap12", "gilbert-lynch"],
    },
  ],
  honestPhysics: [
    "A shopping-cart service runs in two regions 120 ms apart and each serves half the users. Partitions between them total 30 minutes a month.",
    "Under CP, half the users lose service for the whole partition. Under AP, 40 carts a minute are changed on both sides; with a merge rule 2% still need a person.",
    "In normal operation, waiting for the other region costs 120 ms on top of 8 ms locally; replying after the local write leaves about 1.5% of reads stale.",
  ],
  sources: [GILBERT, ABADI, BREWER],
  verify: [
    { id: "cp", claim: "A CP cart loses 15 minutes of service in a 30-minute partition", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { policy: "cp" }, metric: "unavailMin" }, expect: { min: 15, max: 15 } },
    { id: "ap-raw", claim: "An AP cart with no merge rule has 1,200 conflicts to settle", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { policy: "ap", merge: false }, metric: "conflicts" }, expect: { min: 1200, max: 1200 } },
    { id: "ap-merge", claim: "…and 24 with a merge rule", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { policy: "ap", merge: true }, metric: "conflicts" }, expect: { max: 100 } },
    { id: "slow", claim: "Waiting for the other region makes each write 128 ms", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { elsePart: "consistency" }, metric: "commitMs" }, expect: { min: 128, max: 128 } },
    { id: "fast", claim: "Replying after the local write takes 8 ms", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { elsePart: "latency" }, metric: "commitMs" }, expect: { max: 8 } },
    { id: "stale", claim: "…at the cost of 1.5% stale reads", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { elsePart: "latency" }, metric: "stalePct" }, expect: { min: 0.014, max: 0.016 } },
    { id: "unavail-ap", claim: "An AP cart never goes unavailable", run: "lab", params: { model: "cap-lab", config: CAP_CHALLENGE, values: { policy: "ap", elsePart: "latency", merge: true }, metric: "unavailMin" }, expect: { max: 0 } },
  ],
});
