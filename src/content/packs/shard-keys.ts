import { definePack } from "../define";

export const KEYS = { start: { key: "message", copy: false } };

const DDIA = { id: "ddia", title: "M. Kleppmann, Designing Data-Intensive Applications, ch. 6: Partitioning and secondary indexes", url: "https://dataintensive.net/" };
const DISCORD = { id: "discord-messages", title: "Discord Engineering: How Discord stores trillions of messages (partition by channel and time bucket)", url: "https://discord.com/blog/how-discord-stores-trillions-of-messages" };
const DYNAMO_KEY = { id: "dynamodb-keys", title: "AWS docs: Best practices for designing and using partition keys effectively", url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html" };

export default definePack({
  id: "shard-keys",
  title: "Choosing a Shard Key",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Inbox page · p99 2.1 s", detail: "queries 40 shards per load" },
    lines: [
      { speaker: "kabir", line: "We sharded messages by conversation. The conversation page is fast and the inbox, every chat a user is in, is crawling." },
      { speaker: "meera", line: "A shard key answers one question for free. Every other question pays for the choice." },
    ],
  },
  predictions: [
    {
      id: "inbox",
      kind: "choice",
      prompt: "Messages are sharded by conversation_id. A user's inbox shows the latest message of each chat they are in. Where does that data live?",
      options: [
        { id: "one", label: "On one shard, with the user" },
        { id: "few", label: "On a couple of shards" },
        { id: "many", label: "On the shards of every chat they are in, so potentially dozens" },
      ],
      answer: "many",
      observe: "key-picked",
      reveal: {
        text: "The key puts each conversation on one shard, so the conversation page is cheap. A user belongs to many conversations that hash to many shards, so the inbox must gather from all of them and wait for the slowest.",
        derived: true,
        line: { speaker: "meera", line: "The key chose which query to make cheap. This one was not it." },
      },
    },
    {
      id: "copy-cost",
      kind: "choice",
      prompt: "To make both pages fast you keep a second copy of each message, keyed the other way. How many writes does each new message cost?",
      options: [
        { id: "one", label: "One, as before" },
        { id: "two", label: "Two, one per copy, and they must stay in step" },
        { id: "ten", label: "Ten" },
      ],
      answer: "two",
      observe: "copy-on",
      reveal: {
        text: "Every message is written to both copies. Reads become single-shard, but writes double and the two copies can briefly disagree if one write fails. Duplicating data is the usual price of serving two access paths.",
        derived: true,
        line: { speaker: "rao", line: "Fast reads are paid for on the write side, every time." },
      },
    },
  ],
  widget: { id: "shardkey-lab", config: KEYS },
  mechanism: [
    {
      id: "access",
      text: "A shard key decides which rows live together, so it decides which queries are cheap. Start from the access paths: the few questions the product asks most. A query that carries the key goes to one shard; any other query asks them all.",
      sourceIds: ["ddia"],
    },
    {
      id: "good",
      scene: "key",
      text: "A good key has many distinct values, spreads writes evenly, and keeps the data of your main queries together. User id fits user-centred data. Conversation id fits messages. A key with few values or skewed sizes, such as country, makes giant shards.",
      sourceIds: ["dynamodb-keys", "discord-messages"],
    },
    {
      id: "bad",
      scene: "bad",
      text: "Keys that increase with time, such as created_at or an auto-increment id, send every new write to the newest range. Hashing the id removes the hot spot but scatters every query, so almost nothing stays on one shard.",
      sourceIds: ["dynamodb-keys", "ddia"],
    },
    {
      id: "copy",
      scene: "copy",
      text: "When two access paths both need to be fast, keep two copies keyed differently. This is a secondary index maintained by you. Reads stay on one shard, writes cost double, and the copies can disagree briefly after a partial failure.",
      sourceIds: ["ddia"],
    },
  ],
  challenges: [
    {
      id: "chat-key",
      title: "Pick the key for messages",
      brief: "70% of reads load one conversation, 30% load a user's inbox. Choose a key so writes are spread (at least 70% even), at least 95% of reads stay on one shard, hot-key risk stays under 20%, and each message is written at most twice.",
      line: { speaker: "rao", line: "I will pay for one extra copy. Not two." },
      widget: { id: "shardkey-lab", config: KEYS },
      conditions: [
        { metric: "balance", op: ">=", value: 0.7, label: "Writes at least 70% evenly spread" },
        { metric: "singleShardReads", op: ">=", value: 0.95, label: "At least 95% of reads on one shard" },
        { metric: "hotRisk", op: "<=", value: 0.2, label: "Hot-key risk at most 20%" },
        { metric: "writeAmp", op: "<=", value: 2, label: "At most 2 writes per message" },
      ],
      stars: [],
      hints: [
        "Which keys serve one of the two read paths with no copy?",
        "Which of those has the fewest hot keys? A huge group chat is one key.",
        "A copy makes the other path single-shard, at the price of the second write.",
      ],
    },
  ],
  explainBack: {
    prompt: "How do you choose a shard key, and what do you do when two queries both need to be fast?",
    rubric: [
      { id: "access", criterion: "Start from the main access paths: queries carrying the key go to one shard, others fan out", keyIdea: "key chooses the cheap query" },
      { id: "props", criterion: "A good key has high cardinality, spreads writes and avoids hot values or time-ordered growth", keyIdea: "cardinality and spread" },
      { id: "copy", criterion: "For a second access path keep a second copy keyed differently, paying double writes and consistency care", keyIdea: "duplicate to serve both" },
    ],
    exemplar:
      "I start from the access paths. The shard key makes queries that carry it single-shard and every other query fan out. A good key has many values, spreads writes evenly and avoids hot values such as a huge group or a time-ordered column. If two paths both need to be fast, I keep a second copy keyed the other way, which doubles writes and needs care to keep the copies in step.",
  },
  reviews: [
    {
      id: "sk-est",
      format: "estimate",
      scenario: "Messages are sharded by conversation across 64 shards. A user is in 20 conversations, which hash to random shards. About how many distinct shards does the inbox query touch? (64 × (1 − (63/64)^20))",
      unit: "shards",
      answer: 17,
      acceptFactor: 1.2,
      breakdown: ["(63/64)^20 ≈ 0.73", "1 − 0.73 = 0.27", "64 × 0.27 ≈ 17"],
      explain: "Twenty random placements across 64 shards land on about seventeen distinct ones, so the inbox waits on the slowest of seventeen shards.",
    },
    {
      id: "sk-pick",
      format: "pick-fix",
      scenario: "A multi-tenant app is sharded by country. The shard for the biggest country is five times the size of the rest and always the busiest. What is the best fix?",
      options: [
        { id: "a", label: "Choose a higher-cardinality key such as tenant or user id" },
        { id: "b", label: "Give the big country a bigger machine forever" },
        { id: "c", label: "Cache the big country's reads" },
        { id: "d", label: "Add replicas for the big country" },
      ],
      answer: "a",
      explain: "A key with few, uneven values cannot spread load evenly. Each tenant or user is a small, plentiful unit that can be spread across shards.",
    },
    {
      id: "sk-order",
      format: "order",
      scenario: "Order these shard keys for a messaging app by how evenly they spread writes, best first.",
      items: [
        { id: "msg", label: "Hash of message id" },
        { id: "user", label: "user_id" },
        { id: "conv", label: "conversation_id" },
        { id: "created", label: "created_at" },
      ],
      answer: ["msg", "user", "conv", "created"],
      explain: "A hashed message id is uniform. Users are many and similar. Conversations include huge group chats. Created_at sends every new write to the newest range.",
    },
    {
      id: "sk-graph",
      format: "predict-graph",
      scenario: "Messages are sharded by conversation and you add shards from 4 to 256. How does the number of shards a user's inbox query touches change, when a user is in 20 chats?",
      xLabel: "shards →",
      yLabel: "shards touched by the inbox query",
      options: [
        { id: "flat", label: "Stays at 20", points: [20, 20, 20, 20, 20, 20, 20, 20] },
        { id: "rise", label: "Rises toward 20 and levels off, since there are only 20 chats", points: [4, 7.5, 11.6, 15, 17.3, 18.5, 19.2, 19.6] },
        { id: "fall", label: "Falls as shards are added", points: [20, 18, 15, 12, 9, 6, 3, 1] },
      ],
      answer: "rise",
      explain: "With few shards, chats share them. With many, each chat has its own, so the query touches close to one shard per chat but never more than 20.",
    },
    {
      id: "sk-flaw",
      format: "spot-flaw",
      scenario: "A team shards a posts table by author, so each author's posts are together. The 'latest posts from people I follow' feed is the home page and is slow. Tap the step that makes it slow.",
      diagram: {
        nodes: [
          { id: "feed", label: "feed: posts from 200 followed authors", kind: "client", col: 0, row: 1 },
          { id: "route", label: "route by author", kind: "lb", col: 1, row: 1 },
          { id: "shards", label: "200 authors on dozens of shards", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "feed", to: "route" },
          { from: "route", to: "shards" },
        ],
      },
      answer: "route->shards",
      explain: "The key serves 'one author's posts' and the feed asks about many authors at once, so it gathers from dozens of shards. The feed needs its own copy or index.",
    },
    {
      id: "sk-explain",
      format: "explain",
      scenario: "In two sentences: why does keeping two copies of the data keyed differently make reads fast but writes harder?",
      rubric: [
        { id: "read", criterion: "Each access path finds its data on one shard, so reads avoid fan-out" },
        { id: "write", criterion: "Every write goes to both copies, which costs double and risks the copies disagreeing after a partial failure" },
      ],
      exemplar: "Each read path hits the copy keyed for it, so both are single-shard. Every write must go to both copies, doubling the work and letting the copies disagree if one write fails.",
      explain: "Reads gain what writes pay.",
    },
  ],
  codex: {
    oneLiner: "The shard key decides which queries stay on one shard. Pick it from your access paths and copy data for a second path.",
    keyNumbers: [
      { label: "Shards touched by a query without the shard key", value: "all of them", sourceId: "ddia" },
      { label: "Writes per message with one extra copy", value: "2", sourceId: "ddia" },
    ],
    tradeoffs: [
      { choice: "Key for the main read path", gain: "That path is one shard", cost: "Other paths fan out" },
      { choice: "Hash of a unique id", gain: "Perfect balance", cost: "Almost every query fans out" },
      { choice: "Second copy keyed differently", gain: "Both paths on one shard", cost: "Double writes and consistency care" },
    ],
    seenIn: ["Discord partitioning messages by channel and time bucket.", "DynamoDB tables with a global secondary index for the second access path."],
    interviewAngle: "List the top two queries first, then say: 'shard by the one that dominates, and keep an index or copy for the other'.",
    aws: [{ concept: "Global secondary index", service: "DynamoDB" }],
    replay: { id: "shardkey-lab", config: { start: { key: "user", copy: true } }, scene: "copy" },
  },
  interview: [
    "How do you choose a shard key?",
    "What goes wrong with a low-cardinality key?",
    "How would you serve a second access path on a sharded table?",
  ],
  deeper: [
    {
      title: "Resharding is expensive, so the key is a long-term bet",
      body: "Changing the shard key later means rewriting and moving most of the data while the system runs. Teams often pick a key by the queries of the first version of the product and live with it, so it is worth spending time on the first choice and keeping the key in the application's data model from day one.",
      sourceIds: ["ddia"],
    },
  ],
  honestPhysics: [
    "A messaging app: 70% of reads fetch one conversation's recent messages and 30% load one user's inbox. Each key is scored 0 to 1 for balance, and for how often each query stays on one shard.",
    "The scores are judgements for a typical chat workload, not measurements.",
    "A copy keyed the other way serves whichever read path the main key serves worst, and doubles the writes.",
  ],
  sources: [DDIA, DISCORD, DYNAMO_KEY],
  verify: [
    { id: "msg-hash", claim: "A hashed message id spreads writes perfectly but keeps few reads on one shard", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "message", copy: false }, metric: "singleShardReads" }, expect: { max: 0.2 } },
    { id: "conv-inbox", claim: "Sharding by conversation keeps the conversation page but not the inbox on one shard", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "conv", copy: false }, metric: "singleShardReads" }, expect: { min: 0.7, max: 0.8 } },
    { id: "created-hot", claim: "created_at makes the newest range take all writes", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "created" }, metric: "balance" }, expect: { max: 0.1 } },
    { id: "user-copy", claim: "user_id with a second copy keeps every read on one shard", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "user", copy: true }, metric: "singleShardReads" }, expect: { min: 0.95 } },
    { id: "user-copy-hot", claim: "…with low hot-key risk", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "user", copy: true }, metric: "hotRisk" }, expect: { max: 0.2 } },
    { id: "conv-copy-hot", claim: "Conversation id with a copy has hot huge group chats", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "conv", copy: true }, metric: "hotRisk" }, expect: { min: 0.3 } },
    { id: "copy-writes", claim: "A copy doubles writes", run: "lab", params: { model: "shardkey-lab", config: KEYS, values: { key: "user", copy: true }, metric: "writeAmp" }, expect: { min: 2, max: 2 } },
  ],
});
