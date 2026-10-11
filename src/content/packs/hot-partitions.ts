import { definePack } from "../define";

export const HOT = { lockP: false, start: { p: 0.01, salt: 1, cache: false } };
export const HOT_CHALLENGE = { lockP: true, p: 0.4, start: { salt: 1, cache: false } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 6: Skewed workloads and relieving hot spots", url: "https://dataintensive.net/" };
const DYNAMO_SHARD = { id: "dynamodb-write-sharding", title: "AWS docs: Using write sharding to distribute workloads evenly", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html" };
const DYNAMO_KEY = { id: "dynamodb-keys", title: "AWS docs: Best practices for designing and using partition keys effectively", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html" };

export default definePack({
  id: "hot-partitions",
  title: "Hot Partitions & the Celebrity Problem",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "profile-db · shard 7 at 160% of capacity", detail: "cluster average 50%" },
    lines: [
      { speaker: "kabir", line: "A celebrity posted a photo of their lunch. The cluster is at fifty percent, and one shard has been falling over for ten minutes." },
      { speaker: "meera", line: "Sharding spreads keys evenly but cannot spread one key. That key lives on one machine." },
    ],
  },
  predictions: [
    {
      id: "celebrity",
      kind: "choice",
      prompt: "Sixteen shards each handle 20,000 requests a second, and the cluster serves 160,000 in total, 50% full. One account suddenly takes 15% of all traffic. How loaded is its shard?",
      options: [
        { id: "same", label: "Still about 50%, since the cluster has room" },
        { id: "eighty", label: "About 80%" },
        { id: "over", label: "About 160%: over capacity" },
        { id: "triple", label: "About 300%" },
      ],
      answer: "over",
      observe: "hot-shard",
      reveal: {
        text: "That one key now sends 24,000 requests a second to a single shard, on top of its normal 8,500, which is 32,500 against a limit of 20,000. The other fifteen shards sit at 43% while this one drowns.",
        derived: true,
        line: { speaker: "meera", line: "Spare capacity elsewhere does nothing for the shard that is failing." },
      },
    },
    {
      id: "salting",
      kind: "choice",
      prompt: "You store the hot account under four different suffixes, so it lives on four shards. What does a read that needs the account's total now cost?",
      options: [
        { id: "same", label: "The same: one read" },
        { id: "four", label: "Four reads, one per suffix, added together" },
        { id: "sixteen", label: "Sixteen reads" },
      ],
      answer: "four",
      observe: "salted",
      reveal: {
        text: "Salting trades read simplicity for write and read spread. Each suffix holds a quarter of the traffic, but anything needing the whole account must query every suffix and combine them. It is a good deal for a few hot keys and a bad one for all keys.",
        derived: true,
        line: { speaker: "rao", line: "Use it for the celebrities, not the crowd." },
      },
    },
  ],
  widget: { id: "hotpart-lab", config: HOT },
  mechanism: [
    {
      id: "skew",
      scene: "celebrity",
      text: "A hash spreads different keys evenly, but all the traffic for one key goes to one shard. When one key takes a large share of requests, a celebrity account, a viral post, or a flash-sale item, its shard hits its limit while the rest of the cluster sits idle.",
      sourceIds: ["ddia", "dynamodb-keys"],
    },
    {
      id: "salt",
      scene: "salt",
      text: "Salting spreads one hot key over several shards by adding a small suffix, such as user:42#0 to user:42#3, and picking one at random for writes. Reads that need a total must query every suffix and add them. Apply it only to keys known to be hot.",
      sourceIds: ["dynamodb-write-sharding", "ddia"],
    },
    {
      id: "cache",
      scene: "cache",
      text: "A cache in front of the shards absorbs repeated reads of the hot key before they arrive, which helps when the traffic is mostly reads. It does nothing for writes. Cache and salt together are the usual answer to a celebrity: cache the reads, salt the writes.",
      sourceIds: ["ddia"],
    },
    {
      id: "detect",
      text: "Hot keys are rare and unpredictable, so spread them when they appear. Track the top few keys per shard, flag any key over a set share of its shard's load, and move it to a salted or cached path automatically.",
      sourceIds: ["dynamodb-keys"],
    },
  ],
  challenges: [
    {
      id: "celebrity",
      title: "Calm the celebrity shard",
      brief: "A key now takes 40% of all traffic. Get the busiest shard to 80% of capacity or below, and keep the number of shards a total read must query to four or fewer.",
      line: { speaker: "kabir", line: "The cluster has room for it. The shard does not." },
      widget: { id: "hotpart-lab", config: HOT_CHALLENGE },
      conditions: [
        { metric: "hotUtil", op: "<=", value: 0.8, label: "Busiest shard at most 80% of capacity" },
        { metric: "readFanout", op: "<=", value: 4, label: "A total read queries at most 4 shards" },
      ],
      stars: [{ metric: "hotUtil", op: "<=", value: 0.65, label: "Busiest shard at most 65%" }],
      hints: [
        "How much traffic would one copy of the key carry, even with a cache in front?",
        "Salting alone to 8 buckets would help, but how many shards would a total read then ask?",
        "Combine the two.",
      ],
    },
  ],
  explainBack: {
    prompt: "A single account takes a large share of traffic and its shard is overloaded. Explain why and how you would fix it.",
    rubric: [
      { id: "why", criterion: "A hash spreads keys, not the traffic of one key, so the hot key sits on one shard whatever the cluster average is", keyIdea: "one key, one shard" },
      { id: "salt", criterion: "Salt the hot key across several suffixes to spread writes, at the price of fan-out on reads that need a total", keyIdea: "salting" },
      { id: "cache", criterion: "Cache the hot key's reads in front of the shards, and detect and treat only the hot keys", keyIdea: "cache the reads" },
    ],
    exemplar:
      "Hashing spreads different keys evenly but every request for one key hits the same shard, so a celebrity can overload it while the cluster average is fine. I would cache the hot key's reads in front of the shards and salt it across a few suffixes so writes spread, accepting that a total read has to query each suffix. I would detect hot keys and apply this only to them.",
  },
  reviews: [
    {
      id: "hp-est",
      format: "estimate",
      scenario: "A cluster of 16 shards serves 160,000 requests a second evenly, 10,000 per shard. One key suddenly takes 15% of all traffic. About how many requests a second does its shard get? (hot traffic plus the shard's normal share of the rest)",
      unit: "req/s",
      answer: 32500,
      acceptFactor: 1.1,
      breakdown: ["15% × 160,000 = 24,000", "rest: 85% × 160,000 ÷ 16 = 8,500", "24,000 + 8,500 = 32,500"],
      explain: "The hot key adds its whole load to one shard on top of that shard's ordinary share of everything else.",
    },
    {
      id: "hp-pick",
      format: "pick-fix",
      scenario: "A single post is read 50,000 times a second and the shard holding it is overloaded. Reads are 99% of the traffic. What is the cheapest first fix?",
      options: [
        { id: "a", label: "Cache the post in front of the shards" },
        { id: "b", label: "Reshard the whole table with twice as many shards" },
        { id: "c", label: "Salt every key in the table" },
        { id: "d", label: "Move the post to a bigger machine" },
      ],
      answer: "a",
      explain: "Resharding moves keys but one key still lives on one shard. A cache absorbs nearly all reads of one hot item.",
    },
    {
      id: "hp-order",
      format: "order",
      scenario: "Order these approaches for a hot WRITE key by how well they spread the writes, best first.",
      items: [
        { id: "salt16", label: "Salt across 16 suffixes" },
        { id: "salt4", label: "Salt across 4 suffixes" },
        { id: "cache", label: "A read cache in front" },
      ],
      answer: ["salt16", "salt4", "cache"],
      explain: "A read cache does nothing for writes. Salting spreads writes over as many shards as there are suffixes.",
    },
    {
      id: "hp-graph",
      format: "predict-graph",
      scenario: "One key takes 15% of 160,000 requests a second across 16 shards. As you spread it across 1 to 16 salt buckets, how does the busiest shard's load change?",
      xLabel: "salt buckets →",
      yLabel: "busiest shard's load",
      options: [
        { id: "fall", label: "Falls steeply at first, then levels off at the average", points: [162, 102, 72, 62, 57, 53, 52, 50] },
        { id: "flat", label: "Stays the same", points: [162, 162, 162, 162, 162, 162, 162, 162] },
        { id: "linear", label: "Falls in a straight line to zero", points: [162, 140, 120, 100, 80, 60, 40, 20] },
      ],
      answer: "fall",
      explain: "Each bucket carries a share of the hot traffic, so the first few buckets help most. Beyond that the shard's ordinary load dominates and nothing more is gained.",
    },
    {
      id: "hp-flaw",
      format: "spot-flaw",
      scenario: "A team salts every key in a counters table across 32 buckets 'to be safe'. Dashboards that read a counter now time out. Tap the step that went wrong.",
      diagram: {
        nodes: [
          { id: "read", label: "read counter total", kind: "client", col: 0, row: 1 },
          { id: "fan", label: "query 32 suffixes", kind: "lb", col: 1, row: 1 },
          { id: "shards", label: "32 shards, add the results", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "read", to: "fan" },
          { from: "fan", to: "shards" },
        ],
      },
      answer: "read->fan",
      explain: "Salting is a cost on every total read. Applied to every key it turns cheap single-shard reads into 32-way fan-outs. Use it only for keys that are known to be hot.",
    },
    {
      id: "hp-explain",
      format: "explain",
      scenario: "In two sentences: why does adding more shards not fix a celebrity key?",
      rubric: [
        { id: "one", criterion: "All requests for one key still go to one shard, because the hash maps a key to a single place" },
        { id: "spread", criterion: "The key itself has to be split (salting) or its reads absorbed (caching), since more shards only spread other keys" },
      ],
      exemplar: "A key maps to exactly one shard, so every request for it still lands there however many shards exist. The key's load has to be split with salting or absorbed with a cache.",
      explain: "More shards spread keys, not one key.",
    },
  ],
  codex: {
    oneLiner: "Hashing spreads keys, not one key's traffic. Cache a hot key's reads and salt its writes, only for keys that are hot.",
    keyNumbers: [
      { label: "Hot shard load, 15% key on 16 shards at 50% average", value: "162% of capacity", sourceId: "ddia" },
      { label: "Reads a salted total must query", value: "one per suffix", sourceId: "dynamodb-write-sharding" },
    ],
    tradeoffs: [
      { choice: "Cache the hot key", gain: "Absorbs reads cheaply", cost: "No help for writes; staleness" },
      { choice: "Salt the hot key", gain: "Spreads reads and writes", cost: "Totals need a fan-out read" },
      { choice: "Detect and isolate", gain: "Only hot keys pay", cost: "Detection and routing machinery" },
    ],
    seenIn: ["Celebrity accounts and viral posts on social feeds.", "DynamoDB write sharding for hot partition keys."],
    interviewAngle: "Say: 'sharding does not help one key; I would cache its reads and salt its writes, and only for detected hot keys'.",
    aws: [{ concept: "Write sharding and adaptive capacity", service: "DynamoDB" }],
    replay: { id: "hotpart-lab", config: { lockP: false, p: 0.15, start: { salt: 4, cache: true } }, scene: "salt" },
  },
  interview: [
    "What is a hot partition and how do you handle one?",
    "How would you design for a celebrity user on a sharded system?",
    "What is write sharding and what does it cost?",
  ],
  deeper: [
    {
      title: "Fan-out on write versus on read",
      body: "Social feeds meet the celebrity problem from both sides. Pushing a celebrity's post into every follower's feed (fan-out on write) is too expensive, while pulling it at read time is cheap for them but not for ordinary users. Many systems fan out for ordinary accounts and pull for celebrities, merging the two when a feed is built.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "160,000 requests a second across 16 shards of 20,000 each. One key takes a share p of all traffic, and everything else is spread evenly by hash.",
    "Salting spreads the hot key's traffic evenly over its buckets. The cache is assumed to absorb 80% of the hot key's traffic, the share that is reads.",
    "Real hot keys fluctuate, and detection takes seconds to minutes. The lab shows the steady state.",
  ],
  sources: [DDIA, DYNAMO_SHARD, DYNAMO_KEY],
  verify: [
    { id: "over", claim: "A key with 15% of traffic puts its shard at 162% of capacity", run: "lab", params: { model: "hotpart-lab", config: HOT, values: { p: 0.15, salt: 1, cache: false }, metric: "hotUtil" }, expect: { min: 1.6, max: 1.65 } },
    { id: "salt4", claim: "Salting across four shards brings it under 80%", run: "lab", params: { model: "hotpart-lab", config: HOT, values: { p: 0.15, salt: 4, cache: false }, metric: "hotUtil" }, expect: { max: 0.8 } },
    { id: "cache-only", claim: "At 40% traffic a cache alone leaves the shard at 94%", run: "lab", params: { model: "hotpart-lab", config: HOT_CHALLENGE, values: { salt: 1, cache: true }, metric: "hotUtil" }, expect: { min: 0.9 } },
    { id: "salt-only", claim: "Salting alone to eight buckets needs eight shards per total read", run: "lab", params: { model: "hotpart-lab", config: HOT_CHALLENGE, values: { salt: 8, cache: false }, metric: "readFanout" }, expect: { min: 8 } },
    { id: "both", claim: "A cache plus two salt buckets brings the shard to 62%", run: "lab", params: { model: "hotpart-lab", config: HOT_CHALLENGE, values: { salt: 2, cache: true }, metric: "hotUtil" }, expect: { max: 0.65 } },
    { id: "both-fan", claim: "…with a two-shard total read", run: "lab", params: { model: "hotpart-lab", config: HOT_CHALLENGE, values: { salt: 2, cache: true }, metric: "readFanout" }, expect: { max: 4 } },
  ],
});
