import { definePack } from "../define";

export const RING = { start: { method: "mod", nodes: 10, vnodes: 1 } };
export const RING_CHALLENGE = { lockNodes: true, start: { method: "mod", nodes: 10, vnodes: 1 } };

const KARGER = { id: "karger-1997", title: "D. Karger et al. (1997), Consistent Hashing and Random Trees, STOC", url: "https://doi.org/10.1145/258533.258660" };
const DYNAMO = { id: "dynamo-2007", title: "G. DeCandia et al. (2007), Dynamo: Amazon's Highly Available Key-value Store (partitioning and virtual nodes)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf" };
const CASSANDRA = { id: "cassandra-dynamo", title: "Apache Cassandra docs: Dynamo-style architecture, token ring and virtual nodes", url: "https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html" };

export default definePack({
  id: "consistent-hashing",
  title: "Consistent Hashing & Virtual Nodes",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "page", title: "cache cluster · hit rate 94% → 6%", detail: "11th node added 30 seconds ago" },
    lines: [
      { speaker: "kabir", line: "We added one cache node to get ahead of the holiday traffic. Hit rate fell from ninety-four percent to six and the database is melting." },
      { speaker: "meera", line: "Keys were placed by hash mod N. Changing N from ten to eleven moved almost every key." },
    ],
  },
  predictions: [
    {
      id: "one-point",
      kind: "choice",
      prompt: "A ring places each of 10 servers at one random point and gives each key to the next server clockwise. Compared with a perfectly fair share, how much does the busiest server hold?",
      options: [
        { id: "fair", label: "Exactly its fair share, 1.0×" },
        { id: "mild", label: "About 1.3×" },
        { id: "big", label: "About 2.4× its fair share" },
        { id: "huge", label: "About 10×" },
      ],
      answer: "big",
      observe: "ring-on",
      reveal: {
        text: "Ten random points cut a circle into ten very unequal arcs. The largest of ten random arcs is typically near three times the average. Here the busiest server owns 2.4 times its fair share, so one server is overloaded while others idle.",
        derived: true,
        line: { speaker: "meera", line: "Random is not even. With few points, random is lumpy." },
      },
    },
    {
      id: "vnodes",
      kind: "choice",
      prompt: "Each server now takes 200 points on the ring instead of one, spread randomly. About how much does the busiest server hold compared with its fair share?",
      options: [
        { id: "same", label: "Still about 2.4×" },
        { id: "mild", label: "About 1.5×" },
        { id: "near", label: "About 1.17×" },
        { id: "exact", label: "Exactly 1.0×" },
      ],
      answer: "near",
      observe: "vnodes-added",
      reveal: {
        text: "Each server's share is now the sum of 200 small, random arcs, and sums of many small random pieces vary little, by about a thirteenth here. The busiest server holds 1.17 times its fair share, never exactly one, but close enough.",
        derived: true,
        line: { speaker: "kabir", line: "So the fix for a lumpy ring is more points, not a smarter ring." },
      },
    },
  ],
  widget: { id: "ring-lab", config: RING },
  mechanism: [
    {
      id: "mod",
      scene: "mod",
      text: "Hash mod N assigns a key to node hash(key) mod N. It is even and trivial, and it falls apart when N changes: going from ten to eleven nodes changes the answer for nearly every key. A cache loses almost all of its contents, and a database must move almost all of its data.",
      sourceIds: ["karger-1997"],
      derived: true,
    },
    {
      id: "ring",
      scene: "ring",
      text: "Consistent hashing places nodes and keys on the same circle of hash values. A key belongs to the next node clockwise. Adding a node takes over only the arc just before it, so about 1 ÷ (N + 1) of the keys move, and every other key stays put.",
      sourceIds: ["karger-1997", "dynamo-2007"],
    },
    {
      id: "vnodes",
      scene: "vnodes",
      text: "With one point per server the arcs are very uneven. Virtual nodes give each server many points scattered around the ring, so its share is the sum of many small arcs and evens out. Hundreds per server get the busiest within about 15% of the average.",
      sourceIds: ["dynamo-2007", "cassandra-dynamo"],
    },
    {
      id: "uses",
      text: "The ring also gives a natural replication rule: store each key on the next few distinct servers clockwise. Servers of different sizes take proportionally more points. The cost is memory and a bit of lookup time for the sorted list of points.",
      sourceIds: ["dynamo-2007", "cassandra-dynamo"],
    },
  ],
  challenges: [
    {
      id: "ring-design",
      title: "Add a node without a meltdown",
      brief: "Ten nodes. Switch to a consistent hashing ring and choose virtual nodes so adding a node moves at most 12% of the keys, the busiest node holds at most 1.25 times its fair share, and the ring has at most 3,000 entries.",
      line: { speaker: "rao", line: "More points cost memory on every client. I want enough, not all of them." },
      widget: { id: "ring-lab", config: RING_CHALLENGE },
      conditions: [
        { metric: "movedOnAdd", op: "<=", value: 0.12, label: "At most 12% of keys move when a node is added" },
        { metric: "imbalance", op: "<=", value: 1.25, label: "Busiest node at most 1.25× fair share" },
        { metric: "ringEntries", op: "<=", value: 3000, label: "At most 3,000 ring entries" },
      ],
      stars: [],
      hints: [
        "How many keys move under mod-N hashing?",
        "How lumpy is a ring with one point per node?",
        "Ring entries are nodes times virtual nodes: how many virtual nodes fit under 3,000?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why hash mod N is a problem when nodes change, and how consistent hashing and virtual nodes fix it.",
    rubric: [
      { id: "mod", criterion: "With hash mod N, changing N changes the node for almost every key, so nearly all data moves or cache entries are lost", keyIdea: "mod N reshuffles everything" },
      { id: "ring", criterion: "On a ring each key belongs to the next node clockwise, so adding a node moves only about 1/(N+1) of keys", keyIdea: "only one arc moves" },
      { id: "vnodes", criterion: "Virtual nodes give each server many points to even out the arcs and balance load", keyIdea: "many points per server" },
    ],
    exemplar:
      "With hash mod N, changing the number of nodes changes the result for almost every key, so a cache loses nearly everything and a store has to move nearly all of its data. A consistent hashing ring puts nodes and keys on one circle and gives each key to the next node clockwise, so adding a node only takes over one arc, about 1 over N plus one of the keys. Because a single point per node gives very uneven arcs, each server takes many virtual nodes so its load evens out.",
  },
  reviews: [
    {
      id: "ch-est",
      format: "estimate",
      scenario: "A cache of 10 nodes uses hash mod N. You add an 11th. What percentage of keys are expected to map to the same node as before? (a key keeps its node when hash mod 10 = hash mod 11)",
      unit: "%",
      answer: 9,
      acceptFactor: 1.5,
      breakdown: ["A key keeps its node only if both remainders agree", "that happens for about 1 key in 11", "≈ 9%"],
      explain: "Only about 9% keep their node, so about 91% of keys move. A ring would move about 9% instead.",
    },
    {
      id: "ch-pick",
      format: "pick-fix",
      scenario: "A ring with one point per node has one node holding twice its fair share. Which change reduces the imbalance without changing the node count?",
      options: [
        { id: "a", label: "Give each node many virtual nodes" },
        { id: "b", label: "Use a stronger hash function" },
        { id: "c", label: "Add a replica of the busy node" },
        { id: "d", label: "Switch to hash mod N" },
      ],
      answer: "a",
      explain: "The unevenness comes from having few random points, not from the hash. Many virtual nodes average the arcs out.",
    },
    {
      id: "ch-order",
      format: "order",
      scenario: "Order these by the share of keys that move when an 11th node joins ten, most first.",
      items: [
        { id: "mod", label: "hash mod N" },
        { id: "ring", label: "Consistent hashing, 200 virtual nodes each" },
        { id: "none", label: "A fixed directory, adding an empty node" },
      ],
      answer: ["mod", "ring", "none"],
      explain: "Mod N moves nearly everything. A ring moves about 1 ÷ 11. A directory can add an empty node and move nothing until you rebalance on purpose.",
    },
    {
      id: "ch-graph",
      format: "predict-graph",
      scenario: "On a ring of 10 nodes, you raise virtual nodes per server from 1 to 400. How does the busiest node's share, compared with fair, change?",
      xLabel: "virtual nodes →",
      yLabel: "busiest node vs fair share",
      options: [
        { id: "fall", label: "Falls quickly at first, then flattens near 1.1 to 1.2", points: [2.4, 1.7, 1.5, 1.3, 1.25, 1.2, 1.15, 1.15] },
        { id: "flat", label: "Stays about 2.4", points: [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4] },
        { id: "zero", label: "Falls steadily to exactly 1.0", points: [2.4, 2.1, 1.8, 1.6, 1.4, 1.2, 1.1, 1.0] },
      ],
      answer: "fall",
      explain: "Averaging more random arcs helps roughly with the square root of their number, so the early gains are large and later ones small.",
    },
    {
      id: "ch-flaw",
      format: "spot-flaw",
      scenario: "A team routes cache keys with hash(key) mod number_of_nodes. Autoscaling adds a node and the database falls over. Tap the step that causes the stampede.",
      diagram: {
        nodes: [
          { id: "client", label: "client", kind: "client", col: 0, row: 1 },
          { id: "route", label: "node = hash(key) mod N", kind: "lb", col: 1, row: 1 },
          { id: "cache", label: "cache nodes (N changes)", kind: "cache", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "route" },
          { from: "route", to: "cache" },
        ],
      },
      answer: "route->cache",
      explain: "When N changes the mapping changes for nearly every key, so almost every lookup misses the cache and goes to the database.",
    },
    {
      id: "ch-explain",
      format: "explain",
      scenario: "In two sentences: why does a consistent hashing ring need virtual nodes?",
      rubric: [
        { id: "lumpy", criterion: "With one random point per server the arcs between points are very uneven, so some servers hold much more than others" },
        { id: "fix", criterion: "Many points per server average out the arcs, evening the load, and also allow weighting by capacity" },
      ],
      exemplar: "One random point per server leaves very uneven arcs, so some servers get far more keys than others. Many virtual nodes per server average the arcs out and also let bigger machines take proportionally more.",
      explain: "Lumpy with few points, smooth with many.",
    },
  ],
  codex: {
    oneLiner: "A ring gives each key to the next node clockwise, so a new node moves about 1 in N+1 keys. Virtual nodes even the load.",
    keyNumbers: [
      { label: "Keys moved by mod N when going from 10 to 11 nodes", value: "about 91%", sourceId: "karger-1997" },
      { label: "Keys moved by a ring, 10 to 11 nodes", value: "about 9%", sourceId: "karger-1997" },
      { label: "Busiest of 10 nodes, 1 point each versus 200 each", value: "2.4× versus 1.17× fair", sourceId: "dynamo-2007" },
    ],
    tradeoffs: [
      { choice: "Hash mod N", gain: "Trivial and perfectly even", cost: "Changing N moves nearly everything" },
      { choice: "Ring, few points", gain: "Small, local movement", cost: "Lumpy load" },
      { choice: "Ring, many virtual nodes", gain: "Small movement and even load, weighted by capacity", cost: "Memory for the point list; ring metadata to gossip" },
    ],
    seenIn: ["Dynamo, Cassandra and Riak token rings.", "Memcached client libraries with ketama hashing."],
    interviewAngle: "Say: 'mod N reshuffles everything when N changes; a ring moves only the new node's arc, and virtual nodes smooth the load'.",
    aws: [{ concept: "Partitioning by consistent hashing", service: "DynamoDB (as described in the Dynamo paper)" }],
    replay: { id: "ring-lab", config: { start: { method: "ring", nodes: 10, vnodes: 200 } }, scene: "vnodes" },
  },
  interview: [
    "What is consistent hashing and why is it used?",
    "What are virtual nodes and what problem do they solve?",
    "How does a ring decide where to replicate a key?",
  ],
  deeper: [
    {
      title: "Other ways to avoid reshuffling",
      body: "A ring is one answer to 'how do nodes join without moving everything'. Another is a large fixed number of slots, as in Redis Cluster's 16,384 hash slots, where each node owns a set of slots and adding a node moves whole slots. A third is rendezvous hashing, which scores every node for each key and picks the highest, with no ring to store.",
      sourceIds: ["karger-1997"],
    },
  ],
  honestPhysics: [
    "20,000 keys with uniformly random positions on a 0 to 1 ring, from a seeded generator, so the numbers are exact for this setup and repeatable.",
    "'Moved' is the share of keys whose owner changes when one more node joins. For mod N it is the share where hash mod N differs from hash mod (N + 1).",
    "Real rings also weight nodes by capacity, replicate to the next distinct nodes, and handle failures. The lab shows placement only.",
  ],
  sources: [KARGER, DYNAMO, CASSANDRA],
  verify: [
    { id: "mod-moves", claim: "Hash mod N moves about 91% of keys when a node is added", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "mod" }, metric: "movedOnAdd" }, expect: { min: 0.85 } },
    { id: "one-point", claim: "A ring with one point per node leaves the busiest at 2.4× fair share", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 1 }, metric: "imbalance" }, expect: { min: 2.3, max: 2.5 } },
    { id: "ring-moves", claim: "A ring with 200 virtual nodes moves about 9% of keys", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 200 }, metric: "movedOnAdd" }, expect: { min: 0.08, max: 0.11 } },
    { id: "v200", claim: "…with the busiest node at 1.17× fair share", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 200 }, metric: "imbalance" }, expect: { max: 1.25 } },
    { id: "v100", claim: "100 virtual nodes already meet the target", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 100 }, metric: "imbalance" }, expect: { max: 1.25 } },
    { id: "v300", claim: "300 virtual nodes use exactly 3,000 entries", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 300 }, metric: "ringEntries" }, expect: { min: 3000, max: 3000 } },
    { id: "v50", claim: "50 virtual nodes are not enough", run: "lab", params: { model: "ring-lab", config: RING_CHALLENGE, values: { method: "ring", vnodes: 50 }, metric: "imbalance" }, expect: { min: 1.25 } },
  ],
});
