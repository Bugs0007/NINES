import { definePack } from "../define";

export const HOT = { skew: 1.1, rps: 300000, start: { nodes: 8, replicas: 1, local: 0 } };
export const HOT_CHALLENGE = { skew: 1.1, rps: 300000, lockSkew: true, start: { nodes: 8, replicas: 1, local: 0 } };

const REDIS_CLUSTER = { id: "redis-cluster-spec", title: "Redis docs: Cluster specification (16,384 hash slots, key to slot mapping)", url: "https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/" };
const NISHTALA = { id: "nishtala-2013", title: "R. Nishtala et al. (2013), Scaling Memcache at Facebook, USENIX NSDI (replicating hot keys within regions)", url: "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala" };
const BRESLAU = { id: "breslau-1999", title: "L. Breslau et al. (1999), Web Caching and Zipf-like Distributions: Evidence and Implications, IEEE INFOCOM", url: "https://doi.org/10.1109/INFCOM.1999.749260" };

export default definePack({
  id: "hot-keys",
  title: "Hot Keys",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "redis cluster · node 3", detail: "CPU 100%; nodes 1, 2, 4 to 8 under 40%" },
    lines: [
      { speaker: "pager", line: "One Redis node is pinned at 100% and its neighbours are asleep. We added four nodes this morning and nothing changed." },
      { speaker: "meera", line: "One key is carrying a fifth of the traffic, and a key lives on exactly one node. More nodes cannot help it." },
    ],
  },
  predictions: [
    {
      id: "more-nodes",
      kind: "choice",
      prompt: "A cluster of 8 cache nodes has one node saturated by a very popular key. You double the cluster to 16 nodes. What happens to the saturated node?",
      options: [
        { id: "half", label: "Its load halves, since traffic is split across twice as many nodes" },
        { id: "same", label: "It stays about as hot, or gets hotter, because the hot key still lives on one node" },
        { id: "gone", label: "The problem disappears" },
        { id: "worse-all", label: "Every node gets slower" },
      ],
      answer: "same",
      observe: "hot-node",
      reveal: {
        text: "A key hashes to one node, and that node serves every read of it. A bigger cluster spreads the other keys more thinly, but the hot key's traffic does not change. The hottest node's load barely moves while the average falls, so imbalance gets worse.",
        derived: true,
        line: { speaker: "meera", line: "Sharding spreads keys, not traffic to one key." },
      },
    },
  ],
  widget: { id: "hotkey-lab", config: HOT },
  mechanism: [
    {
      id: "hash",
      scene: "hash",
      text: "A cache cluster maps each key to a node by hashing it, in Redis Cluster to one of 16,384 slots. That spreads keys evenly but not traffic: Zipf traffic puts a large share on a handful of keys, and each lives on one node.",
      sourceIds: ["redis-cluster-spec", "breslau-1999"],
    },
    {
      id: "replicate",
      scene: "replicate",
      text: "Replicate the hot keys. Store several copies under different names (post:7#1 to post:7#8) or on several nodes, and have readers pick one at random. One key's traffic now spreads over every copy, at the cost of writing all copies when it changes.",
      sourceIds: ["nishtala-2013"],
    },
    {
      id: "local",
      scene: "local",
      text: "Or keep the hottest keys in each application process for a few seconds. A local hit never reaches the cluster, and a small in-process cache holding the top handful of keys removes a large share of the load, since traffic is skewed.",
    },
    {
      id: "detect",
      text: "You can only fix what you see. Watch per-node load, not the cluster average, and sample or count key accesses to find the hot ones. The hot key is often a surprise: a viral post, a config flag every request reads, a tenant with a bulk job.",
    },
  ],
  challenges: [
    {
      id: "pinned-node",
      title: "Unpin the hot node",
      brief: "300,000 reads a second over 8 cache nodes, each good for 50,000. Traffic is skewed with exponent 1.1 and one node is saturated. Get the busiest node under 60% of capacity using at most 12 nodes.",
      line: { speaker: "rao", line: "Nodes cost money, and, as I learned this morning, they do not even help." },
      widget: { id: "hotkey-lab", config: HOT_CHALLENGE },
      conditions: [
        { metric: "hotNodeUtil", op: "<", value: 0.6, label: "Busiest node under 60%" },
        { metric: "nodes", op: "<=", value: 12, label: "At most 12 nodes" },
      ],
      stars: [{ metric: "nodes", op: "<=", value: 8, label: "No more nodes than now" }],
      hints: [
        "Try adding nodes. How much does the busiest node's load change?",
        "Which keys are responsible for the saturated node, and how can you give them more than one home?",
        "A copy inside each app, or several copies in the cluster. Which costs less?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why does adding cache nodes not fix a hot key, and what does?",
    rubric: [
      { id: "one-node", criterion: "A key maps to one node, so all its traffic lands there however big the cluster is", keyIdea: "a key lives on one node" },
      { id: "skew", criterion: "Zipf-skewed traffic means a few keys take a large share of reads", keyIdea: "skewed traffic" },
      { id: "fix", criterion: "Spreads the hot key: replicate it across nodes or cache it locally in each app with a short TTL", keyIdea: "replicate or cache locally" },
    ],
    exemplar:
      "Each key hashes to a single node, so every read of a hot key hits that node regardless of cluster size. Traffic is skewed, so a few keys take a big share. The fix is to give the hot keys more than one home, by replicating them across nodes under different names or by caching them in each application process for a few seconds, and to monitor per-node load so the hot key is found early.",
  },
  reviews: [
    {
      id: "hk-est-share",
      format: "estimate",
      scenario: "Traffic is Zipf with exponent 1 over 100,000 keys. Using share ≈ 1 ÷ (k × ln n), roughly what percentage of all reads goes to the single most popular key? (ln 100,000 ≈ 11.5, and the constant is about 0.577.)",
      unit: "%",
      answer: 8,
      acceptFactor: 1.3,
      breakdown: ["Weight of rank 1 = 1", "Total weight ≈ ln 100,000 + 0.577 ≈ 12.1", "Share ≈ 1 ÷ 12.1 ≈ 8%"],
      explain: "One key out of a hundred thousand takes about one read in twelve. At 100,000 reads a second, that is 8,000 on a single node.",
    },
    {
      id: "hk-pick",
      format: "pick-fix",
      scenario: "A single celebrity profile key takes a third of all reads and saturates its Redis node. Which change relieves it fastest?",
      options: [
        { id: "a", label: "Cache that key in each app server's memory for a few seconds" },
        { id: "b", label: "Add more Redis nodes" },
        { id: "c", label: "Increase the Redis node size for every node" },
        { id: "d", label: "Lower the TTL on that key" },
      ],
      answer: "a",
      explain: "A local copy removes most reads before they reach Redis at all. More nodes do not move the key, and a shorter TTL would cause more misses.",
    },
    {
      id: "hk-order",
      format: "order",
      scenario: "Order these fixes by how much they reduce load on the busiest node for a cluster with one extremely hot key, most first.",
      items: [
        { id: "local", label: "Cache the hot keys in each app process" },
        { id: "repl", label: "Replicate the hot key across all nodes" },
        { id: "nodes", label: "Double the number of nodes" },
        { id: "none", label: "Do nothing" },
      ],
      answer: ["local", "repl", "nodes", "none"],
      explain: "A local cache removes the reads entirely, replication divides them over all nodes, and more nodes leaves the hot key where it was.",
    },
    {
      id: "hk-graph",
      format: "predict-graph",
      scenario: "Double the cluster repeatedly, from 2 to 32 nodes, with traffic skewed and one very hot key. How does the busiest node's load, as a share of one node's capacity, change?",
      xLabel: "nodes →",
      yLabel: "busiest node load",
      options: [
        { id: "fall", label: "Falls in proportion to the number of nodes", points: [8, 4, 2, 1, 0.5, 0.25, 0.12, 0.06] },
        { id: "flatten", label: "Falls at first, then flattens at the hot key's load", points: [8, 4.5, 3, 2.4, 2.1, 2, 2, 2] },
        { id: "rise", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "flat", label: "Does not change at all", points: [4, 4, 4, 4, 4, 4, 4, 4] },
      ],
      answer: "flatten",
      explain: "Extra nodes spread the ordinary keys, so the load falls until the hot key alone is what the busiest node holds. After that no number of nodes lowers it.",
    },
    {
      id: "hk-flaw",
      format: "spot-flaw",
      scenario: "Dashboards show the cache cluster at 35% average CPU, so the team says there is plenty of room. Users see timeouts on celebrity profiles. Tap the metric or design choice that hides the problem.",
      diagram: {
        nodes: [
          { id: "app", label: "app", kind: "server", col: 0, row: 1 },
          { id: "dash", label: "dashboard: cluster-average CPU", kind: "external", col: 1, row: 0 },
          { id: "redis", label: "redis cluster · one node at 100%", kind: "cache", col: 1, row: 2 },
        ],
        edges: [
          { from: "app", to: "redis" },
          { from: "redis", to: "dash" },
        ],
      },
      answer: "dash",
      explain: "An average hides the one node that is saturated. Alert on the maximum or the per-node 99th percentile, not on the mean.",
    },
    {
      id: "hk-explain",
      format: "explain",
      scenario: "In two sentences: how does replicating a hot key spread its load, and what does it cost?",
      rubric: [
        { id: "spread", criterion: "Readers choose among several copies on different nodes, dividing the key's traffic" },
        { id: "cost", criterion: "Writes must update every copy, and copies can briefly disagree" },
      ],
      exemplar: "Several copies of the key live on different nodes and readers pick one at random, so its traffic is divided among them. The price is that every write has to update all copies, which can briefly disagree.",
      explain: "You are trading write cost and a little staleness for read capacity.",
    },
  ],
  codex: {
    oneLiner: "A key lives on one node, so Zipf traffic overloads one node however big the cluster is. Replicate hot keys or cache them locally.",
    keyNumbers: [
      { label: "Hash slots in Redis Cluster", value: "16,384", sourceId: "redis-cluster-spec" },
      { label: "Top-key share, s ≈ 1", value: "about 1 ÷ (ln n + 0.577)", sourceId: "breslau-1999" },
    ],
    tradeoffs: [
      { choice: "Replicate hot keys", gain: "Divides a key's reads across nodes", cost: "Write amplification and brief disagreement between copies" },
      { choice: "In-process local cache", gain: "Removes reads before the network", cost: "Staleness up to the local TTL; memory in every app" },
      { choice: "More nodes", gain: "Spreads ordinary keys", cost: "Does nothing for a single hot key" },
    ],
    seenIn: ["A celebrity or viral item overloading one Redis shard.", "A configuration flag every request reads, from a single key."],
    interviewAngle: "Whenever you shard, say what happens to a hot key: 'I would detect it, then replicate it or add an in-process cache with a short TTL.'",
    aws: [{ concept: "Sharded cache", service: "ElastiCache Redis cluster mode", note: "Add read replicas per shard for hot slots" }],
    replay: { id: "hotkey-lab", config: { ...HOT, start: { nodes: 8, replicas: 1, local: 0 } }, scene: "hash" },
  },
  interview: [
    "One shard of your cache is melting and the others are idle. What is happening and what do you do?",
    "How do you find hot keys in production?",
    "Why does adding shards not fix a hot key?",
  ],
  deeper: [
    {
      title: "Salting a hot key",
      body: "A common trick is to append a random suffix to the hot key when reading and writing, so post:7 becomes post:7#0 through post:7#7. Reads pick a suffix at random and so spread across up to eight nodes, and a write updates all eight. It needs the hot keys to be known in advance or detected at runtime, and a fallback when a copy is missing.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Keys are spread by a fixed hash and traffic is Zipf over 100,000 keys. Redis Cluster uses slot ranges, but the imbalance argument is the same.",
    "Replicating a hot key spreads only the 20 hottest keys over the chosen copies. A local cache of the top keys removes their reads before the cluster.",
    "Node capacity is a fixed 50,000 reads a second. Real nodes vary with value size and command mix.",
  ],
  sources: [REDIS_CLUSTER, NISHTALA, BRESLAU],
  verify: [
    { id: "pinned", claim: "Eight nodes under skewed traffic leave the busiest over capacity", run: "lab", params: { model: "hotkey-lab", config: HOT_CHALLENGE, values: {}, metric: "hotNodeUtil" }, expect: { min: 1 } },
    { id: "more-nodes", claim: "Doubling to 16 nodes does not get the busiest under 60%", run: "lab", params: { model: "hotkey-lab", config: HOT_CHALLENGE, values: { nodes: 16 }, metric: "hotNodeUtil" }, expect: { min: 0.6 } },
    { id: "local", claim: "A local cache of the top 20 keys brings it under 60% on 8 nodes", run: "lab", params: { model: "hotkey-lab", config: HOT_CHALLENGE, values: { local: 20 }, metric: "hotNodeUtil" }, expect: { max: 0.6 } },
    { id: "twelve", claim: "Twelve nodes alone are not enough", run: "lab", params: { model: "hotkey-lab", config: HOT_CHALLENGE, values: { nodes: 12 }, metric: "hotNodeUtil" }, expect: { min: 0.6 } },
  ],
});
