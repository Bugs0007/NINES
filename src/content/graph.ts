/**
 * The whole planned curriculum as a prerequisite graph.
 *
 * - The HQ map renders every node (unbuilt ones as blueprints).
 * - The content lint checks that packs and prerequisites line up with this graph.
 * - `npm run content:plan` regenerates the tables in CONTENT_PLAN.md from it.
 *
 * Status: planned -> drafted (pack exists) -> built (playable, lint green) -> verified (fact-checked + playtested).
 */

export type Track = "A" | "B" | "C" | "D";
export type NodeKind = "concept" | "boss" | "case" | "incident" | "field";
export type BuildStatus = "planned" | "drafted" | "built" | "verified";

export interface ChapterDef {
  id: string;
  track: Track;
  order: number;
  title: string;
  /** Where Pigeon is in its growth story when this chapter happens. */
  stage: string;
  blurb: string;
}

export interface PlannedNode {
  id: string;
  title: string;
  track: Track;
  chapter: string;
  kind: NodeKind;
  prereqs: string[];
  /** Signature interaction / mini-game. */
  interaction: string;
  status: BuildStatus;
}

export const TRACKS: Record<Track, { name: string; district: string }> = {
  A: { name: "System Design", district: "Core Grid" },
  B: { name: "AI Engineering", district: "Agent Foundry" },
  C: { name: "Dev Fundamentals", district: "The Yard" },
  D: { name: "The Case Intel Files", district: "Annex" },
};

export const CHAPTERS: ChapterDef[] = [
  // Track A: the campaign spine
  { id: "a1", track: "A", order: 1, title: "Launch Day", stage: "10 → 10k users", blurb: "One server, one launch, one very bad afternoon." },
  { id: "a2", track: "A", order: 2, title: "Growing Pains", stage: "10k → 100k users", blurb: "Tails, pools, and autoscalers that arrive late." },
  { id: "a3", track: "A", order: 3, title: "The Request Journey", stage: "Users outside Hyderabad", blurb: "Everything between a thumb and your code." },
  { id: "a4", track: "A", order: 4, title: "Read Heavy", stage: "1M users", blurb: "Caches: the fastest way to be fast, and wrong." },
  { id: "a5", track: "A", order: 5, title: "The Database Wall", stage: "Postgres is sweating", blurb: "Indexes, transactions, and the anomalies nobody warned you about." },
  { id: "a6", track: "A", order: 6, title: "Copies", stage: "Read replicas", blurb: "Replication, lag, and who gets to be leader." },
  { id: "a7", track: "A", order: 7, title: "Split", stage: "10M users", blurb: "Sharding, hot partitions, and the ring." },
  { id: "a8", track: "A", order: 8, title: "Things Fail", stage: "Microservices happened", blurb: "Timeouts, retries, consensus, and money that must not double." },
  { id: "a9", track: "A", order: 9, title: "Async", stage: "Background everything", blurb: "Queues, logs, and messages that arrive twice." },
  { id: "a10", track: "A", order: 10, title: "The Front Door", stage: "Public API", blurb: "Contracts, pagination, rate limits, and push." },
  { id: "a11", track: "A", order: 11, title: "Operate", stage: "On-call rotation", blurb: "SLOs, signals, safe deploys, and region failures." },
  { id: "a12", track: "A", order: 12, title: "Trust", stage: "Enterprise customers", blurb: "Identity, tokens, tenants, and secrets." },
  { id: "a13", track: "A", order: 13, title: "Find Everything", stage: "100M users", blurb: "Blobs, search, maps, and time." },
  // Track B: Agent Foundry
  { id: "b1", track: "B", order: 1, title: "Tokens & Context", stage: "Pigeon Copilot, day one", blurb: "What the model actually sees, and what it costs." },
  { id: "b2", track: "B", order: 2, title: "How Models Behave", stage: "The demo went well", blurb: "Sampling, hallucination, speed, and the bill." },
  { id: "b3", track: "B", order: 3, title: "Prompting as Engineering", stage: "Prompts in production", blurb: "Structure, schemas, caching, and versions." },
  { id: "b4", track: "B", order: 4, title: "Retrieval", stage: "Answers from our data", blurb: "Embeddings, hybrid search, reranking, and measuring it." },
  { id: "b5", track: "B", order: 5, title: "Evals", stage: "Did that prompt change break anything?", blurb: "The discipline most teams skip." },
  { id: "b6", track: "B", order: 6, title: "Tools & Agents", stage: "The model can act now", blurb: "Loops, plans, memory, and when not to use an agent." },
  { id: "b7", track: "B", order: 7, title: "MCP", stage: "Plug it into everything", blurb: "Hosts, clients, servers, and transports." },
  { id: "b8", track: "B", order: 8, title: "Agentic Coding", stage: "The team codes with agents", blurb: "How coding agents work and how to direct them." },
  { id: "b9", track: "B", order: 9, title: "Production AI", stage: "Millions of LLM calls a day", blurb: "Gateways, routing, caching, tracing, and cost." },
  { id: "b10", track: "B", order: 10, title: "AI Security", stage: "Someone is attacking Copilot", blurb: "Injection, exfiltration, least privilege." },
  { id: "b11", track: "B", order: 11, title: "Beyond Prompting", stage: "Should we fine-tune?", blurb: "RAG vs fine-tuning, LoRA, quantization, local models." },
  { id: "b12", track: "B", order: 12, title: "AI System Design", stage: "Interview loop: AI edition", blurb: "Whole AI systems, end to end." },
  // Track C: dev fundamentals
  { id: "c1", track: "C", order: 1, title: "Containers", stage: "It works on my machine", blurb: "Docker from zero, then Kubernetes." },
  { id: "c2", track: "C", order: 2, title: "Linux for Servers", stage: "SSH at 3am", blurb: "Processes, memory, OOM, systemd, logs." },
  { id: "c3", track: "C", order: 3, title: "Git Beyond Basics", stage: "Someone force-pushed", blurb: "The DAG, rebases, and reflog rescues." },
  { id: "c4", track: "C", order: 4, title: "Ship It", stage: "Deploys on Fridays", blurb: "Pipelines and infrastructure as code." },
  { id: "c5", track: "C", order: 5, title: "Concurrency", stage: "Two requests, one row", blurb: "Threads, processes, async, the GIL, races, deadlocks." },
  { id: "c6", track: "C", order: 6, title: "LLD & Machine Coding", stage: "The SDE1 loop", blurb: "OOP, SOLID, patterns, and classic problems." },
  // Track D
  { id: "d1", track: "D", order: 1, title: "The Case Intel Files", stage: "Your own production", blurb: "Real incidents from caseintel.in, and the capstone." },
];

type Row = [id: string, title: string, prereqs: string[], interaction: string, kind?: NodeKind];

const chapterRows: Record<string, Row[]> = {
  a1: [
    ["latency-numbers", "Latency Numbers", [], "Latency Ladder"],
    ["littles-law", "Little's Law", ["latency-numbers"], "Queue Lab: the in-flight counter"],
    ["queueing-utilization", "Utilization & the Hockey Stick", ["littles-law"], "Queue Lab: the load dial"],
    ["scale-up-vs-out", "Scale Up vs Scale Out", ["queueing-utilization"], "Scale Lab"],
    ["load-balancing", "Load Balancers", ["scale-up-vs-out"], "LB Lab"],
    ["stateless-services", "Stateless Services", ["load-balancing"], "Session Shuffle"],
    ["boss-launch-day", "Boss: Launch Day", ["latency-numbers", "littles-law", "queueing-utilization", "scale-up-vs-out", "load-balancing", "stateless-services"], "Launch-day war room", "boss"],
    ["inc-fourth-box", "INC-0001: The Fourth Box", ["littles-law", "load-balancing"], "Incident Room", "incident"],
  ],
  a2: [
    ["tail-latency", "Tail Latency & Fan-out", ["queueing-utilization"], "Fan-out Dice"],
    ["estimation-qps", "Estimation: QPS from Users", ["latency-numbers"], "Estimathon (worked → faded → solo)"],
    ["estimation-storage", "Estimation: Storage & Bandwidth", ["estimation-qps"], "Estimathon"],
    ["estimation-memory", "Estimation: Memory & Cache Sizing", ["estimation-storage"], "Estimathon"],
    ["connection-pooling", "Connection Pooling", ["littles-law", "scale-up-vs-out"], "Pool Party"],
    ["autoscaling", "Autoscaling & Its Lag", ["load-balancing", "queueing-utilization"], "Scaling Lag"],
    ["boss-viral-tuesday", "Boss: Viral Tuesday", ["tail-latency", "connection-pooling", "autoscaling", "estimation-memory"], "Spike survival", "boss"],
    ["inc-pool-exhaustion", "INC: The Pool Ran Dry", ["connection-pooling"], "Incident Room", "incident"],
    ["field-load-test", "Field: Load-test Your Own API", ["queueing-utilization", "tail-latency"], "Field Mission", "field"],
  ],
  a3: [
    ["dns", "DNS", ["latency-numbers"], "Resolver Relay"],
    ["tcp-udp", "TCP vs UDP", ["latency-numbers"], "Handshake Hopscotch"],
    ["tls-handshake", "TLS Handshake", ["tcp-udp"], "Key Exchange"],
    ["http-versions", "HTTP/1.1 vs 2 vs 3", ["tls-handshake"], "Lane Race"],
    ["keep-alive", "Keep-alive & Connection Reuse", ["http-versions", "connection-pooling"], "Handshake Tax"],
    ["reverse-proxy", "Reverse Proxies (Nginx)", ["load-balancing", "http-versions"], "Server Block Sorter"],
    ["cdn", "CDNs", ["dns", "http-versions"], "Edge Map"],
    ["anycast", "Anycast", ["cdn"], "Nearest Door"],
    ["request-journey", "Follow One Request", ["dns", "tls-handshake", "http-versions", "cdn", "reverse-proxy"], "End-to-end Journey"],
    ["boss-far-away-users", "Boss: Users in Jakarta", ["request-journey", "anycast", "keep-alive"], "Latency map", "boss"],
    ["inc-dns-ttl", "INC: The Migration That Wouldn't Propagate", ["dns"], "Incident Room", "incident"],
  ],
  a4: [
    ["cache-aside", "Cache-Aside & Hit Ratio", ["scale-up-vs-out", "latency-numbers"], "Cache Rush"],
    ["zipf-and-sizing", "Zipf Traffic & Cache Sizing", ["cache-aside", "estimation-memory"], "Cache Rush: sizing"],
    ["eviction-policies", "Eviction: LRU vs LFU", ["zipf-and-sizing"], "Eviction Arena"],
    ["write-policies", "Write-through, Write-back, Write-around", ["cache-aside"], "Write Paths"],
    ["ttl-invalidation", "TTLs & Invalidation", ["cache-aside"], "Stale Hunter"],
    ["cache-stampede", "Cache Stampedes", ["ttl-invalidation", "queueing-utilization"], "Stampede"],
    ["hot-keys", "Hot Keys", ["zipf-and-sizing"], "Hot Key Heatmap"],
    ["cdn-caching", "CDN Caching", ["cdn", "ttl-invalidation"], "Edge Cache"],
    ["boss-celebrity-post", "Boss: The Celebrity Post", ["cache-stampede", "hot-keys", "eviction-policies", "cdn-caching", "write-policies"], "Viral read storm", "boss"],
    ["inc-stampede", "INC: Midnight Expiry", ["cache-stampede"], "Incident Room", "incident"],
  ],
  a5: [
    ["indexes-btree", "Indexes & B-trees", ["latency-numbers"], "B-tree Builder"],
    ["query-plans", "Query Plans (EXPLAIN)", ["indexes-btree"], "EXPLAIN Detective"],
    ["normalization", "Normalization vs Denormalization", ["indexes-btree"], "Join or Copy"],
    ["transactions-acid", "Transactions & ACID", ["normalization"], "Crash Mid-Transfer"],
    ["isolation-levels", "Isolation Levels & Anomalies", ["transactions-acid"], "Isolation Race"],
    ["mvcc", "MVCC", ["isolation-levels"], "Version Chains"],
    ["sql-vs-nosql", "SQL vs NoSQL Families", ["normalization"], "Data Model Match"],
    ["lsm-vs-btree", "LSM Trees vs B-trees", ["indexes-btree", "sql-vs-nosql"], "Compaction Clock"],
    ["postgres-is-enough", "When Postgres Is Enough", ["mvcc", "sql-vs-nosql", "query-plans"], "Stack Diet"],
    ["boss-seat-rush", "Boss: The Seat Rush", ["isolation-levels", "mvcc", "query-plans"], "Contention on one row", "boss"],
    ["case-url-shortener", "Case: URL Shortener", ["cache-aside", "indexes-btree", "estimation-storage"], "Interview case", "case"],
  ],
  a6: [
    ["leader-follower", "Leader-Follower Replication", ["transactions-acid", "scale-up-vs-out"], "Follow the Leader"],
    ["sync-async-replication", "Sync vs Async Replication", ["leader-follower"], "Ack Race"],
    ["replication-lag", "Replication Lag Anomalies", ["sync-async-replication"], "Lag Lens"],
    ["failover", "Failover & Split Brain", ["leader-follower"], "Promote!"],
    ["multi-leader", "Multi-leader Replication", ["replication-lag"], "Conflict Court"],
    ["leaderless-quorums", "Leaderless Replication & Quorums", ["replication-lag"], "Quorum Dial"],
    ["boss-primary-down", "Boss: The Primary Is Gone", ["failover", "replication-lag", "leaderless-quorums"], "Failover under fire", "boss"],
    ["inc-replica-lag", "INC: My Post Disappeared", ["replication-lag"], "Incident Room", "incident"],
  ],
  a7: [
    ["sharding-strategies", "Sharding Strategies", ["leader-follower", "estimation-storage"], "Range or Hash"],
    ["shard-keys", "Choosing a Shard Key", ["sharding-strategies"], "Key Picker"],
    ["hot-partitions", "Hot Partitions & the Celebrity Problem", ["shard-keys", "hot-keys"], "Celebrity Problem"],
    ["consistent-hashing", "Consistent Hashing & Virtual Nodes", ["sharding-strategies"], "Hash Ring"],
    ["rebalancing", "Rebalancing", ["consistent-hashing"], "Move Fewer Keys"],
    ["case-kv-store", "Case: Distributed KV Store", ["consistent-hashing", "leaderless-quorums", "rebalancing", "lsm-vs-btree"], "Interview case", "case"],
    ["inc-hot-shard", "INC: Shard 7 Is on Fire", ["hot-partitions"], "Incident Room", "incident"],
  ],
  a8: [
    ["timeouts", "Timeouts", ["tail-latency"], "Deadline Budget"],
    ["retries-backoff-jitter", "Retries, Backoff & Jitter", ["timeouts"], "Retry Storm"],
    ["idempotency", "Idempotency", ["retries-backoff-jitter", "transactions-acid"], "Double Charge"],
    ["circuit-breakers", "Circuit Breakers", ["retries-backoff-jitter"], "Breaker Box"],
    ["bulkheads", "Bulkheads", ["circuit-breakers", "connection-pooling"], "Watertight"],
    ["cap-pacelc", "CAP & PACELC", ["replication-lag"], "Partition Split"],
    ["consistency-models", "Consistency Models", ["cap-pacelc"], "Linearizable or Not"],
    ["clocks-ordering", "Clocks & Ordering", ["consistency-models"], "Clock Drift"],
    ["consensus-raft", "Consensus (Raft)", ["failover", "clocks-ordering"], "Raft Arena"],
    ["distributed-locks", "Distributed Locks & Fencing Tokens", ["consensus-raft", "timeouts"], "Lock Heist"],
    ["two-pc-vs-sagas", "2PC vs Sagas", ["transactions-acid", "idempotency"], "Saga Steps"],
    ["outbox-pattern", "The Outbox Pattern", ["two-pc-vs-sagas"], "Dual Write Trap"],
    ["case-payment-system", "Case: Payment System", ["idempotency", "two-pc-vs-sagas", "outbox-pattern", "isolation-levels"], "Interview case", "case"],
    ["case-ticket-booking", "Case: Ticket Booking (Seat Contention)", ["distributed-locks", "isolation-levels", "cache-aside"], "Interview case", "case"],
    ["inc-retry-storm", "INC: The Retry Storm", ["retries-backoff-jitter"], "Incident Room", "incident"],
  ],
  a9: [
    ["queues-vs-logs", "Queues vs Logs (SQS vs Kafka)", ["littles-law"], "Queue Plumber"],
    ["delivery-semantics", "Delivery Semantics & Dedup", ["queues-vs-logs", "idempotency"], "At-least-once"],
    ["dlq-poison", "Poison Messages & DLQs", ["delivery-semantics"], "Poison Pill"],
    ["backpressure", "Backpressure", ["queues-vs-logs", "queueing-utilization"], "Pressure Valve"],
    ["fan-out-pubsub", "Fan-out & Pub/Sub", ["queues-vs-logs"], "Broadcast"],
    ["event-driven", "Event-driven Architecture", ["fan-out-pubsub"], "Event Web"],
    ["cqrs", "CQRS", ["event-driven", "replication-lag"], "Two Models"],
    ["event-sourcing", "Event Sourcing", ["cqrs"], "Replay the Ledger"],
    ["postgres-queue", "Postgres as a Queue (SKIP LOCKED)", ["queues-vs-logs", "mvcc"], "Lock Skipper"],
    ["case-notification-system", "Case: Notification System", ["fan-out-pubsub", "dlq-poison", "backpressure", "idempotency"], "Interview case", "case"],
    ["case-news-feed", "Case: News Feed", ["fan-out-pubsub", "cache-aside", "hot-partitions"], "Interview case", "case"],
    ["case-web-crawler", "Case: Web Crawler", ["queues-vs-logs", "backpressure", "dns", "rate-limiting"], "Interview case", "case"],
    ["inc-poison-message", "INC: The Message That Kills Workers", ["dlq-poison"], "Incident Room", "incident"],
  ],
  a10: [
    ["api-styles", "REST vs gRPC vs GraphQL", ["http-versions"], "Contract Clash"],
    ["pagination", "Offset vs Cursor Pagination", ["indexes-btree"], "Page Drift"],
    ["idempotency-keys", "Idempotency Keys", ["idempotency", "api-styles"], "Retry-safe POST"],
    ["api-versioning", "API Versioning", ["api-styles"], "Breaking Change"],
    ["rate-limiting", "Rate Limiting Algorithms", ["queueing-utilization"], "Token Bucket"],
    ["realtime-transport", "Polling, Long-polling, SSE, WebSockets", ["http-versions", "keep-alive"], "Push or Pull"],
    ["webhooks", "Webhooks", ["retries-backoff-jitter", "idempotency-keys"], "Callback Chaos"],
    ["case-rate-limiter", "Case: Distributed Rate Limiter", ["rate-limiting", "cache-aside", "consistent-hashing"], "Interview case", "case"],
    ["case-chat", "Case: Chat (WhatsApp)", ["realtime-transport", "fan-out-pubsub", "sharding-strategies", "delivery-semantics"], "Interview case", "case"],
  ],
  a11: [
    ["sli-slo-error-budgets", "SLIs, SLOs & Error Budgets", ["tail-latency"], "Budget Burn"],
    ["observability", "Logs, Metrics & Traces", ["sli-slo-error-budgets"], "Signal Hunt"],
    ["deploy-strategies", "Blue-green & Canary Deploys", ["load-balancing", "sli-slo-error-budgets"], "Canary Cage"],
    ["feature-flags", "Feature Flags", ["deploy-strategies"], "Kill Switch"],
    ["graceful-degradation", "Graceful Degradation", ["circuit-breakers", "feature-flags"], "Brownout"],
    ["rpo-rto", "RPO & RTO", ["sync-async-replication"], "Backup Clock"],
    ["multi-region", "Multi-region", ["rpo-rto", "cap-pacelc", "anycast"], "Two Continents"],
    ["boss-region-outage", "Boss: Region Down (Game Day)", ["multi-region", "graceful-degradation", "observability"], "Game day", "boss"],
  ],
  a12: [
    ["authn-authz", "AuthN vs AuthZ", ["stateless-services"], "Who vs What"],
    ["sessions-vs-jwt", "Sessions vs JWT", ["authn-authz"], "Token Trouble"],
    ["oauth-oidc", "OAuth2 & OIDC Flows", ["sessions-vs-jwt"], "Redirect Dance"],
    ["owasp-top-risks", "OWASP Top Risks", ["authn-authz"], "Break This App"],
    ["secrets-management", "Secrets Management", ["owasp-top-risks"], "Leaked Key"],
    ["multi-tenant-isolation", "Multi-tenant Isolation", ["authn-authz", "sharding-strategies"], "Tenant Wall"],
    ["boss-breach", "Boss: The Breach", ["oauth-oidc", "owasp-top-risks", "secrets-management", "multi-tenant-isolation"], "Breach response", "boss"],
  ],
  a13: [
    ["blob-storage", "Blob Storage", ["cdn"], "Bucket Brigade"],
    ["inverted-index", "Inverted Indexes", ["indexes-btree"], "Posting Lists"],
    ["geospatial-index", "Geospatial Indexes", ["indexes-btree"], "Geohash Grid"],
    ["time-series", "Time-series Data", ["lsm-vs-btree"], "Downsample"],
    ["case-autocomplete", "Case: Search Autocomplete", ["inverted-index", "cache-aside", "estimation-memory"], "Interview case", "case"],
    ["case-ride-hailing", "Case: Ride Hailing (Uber)", ["geospatial-index", "realtime-transport", "sharding-strategies"], "Interview case", "case"],
    ["case-video-pipeline", "Case: Video Pipeline (YouTube)", ["blob-storage", "queues-vs-logs", "cdn-caching"], "Interview case", "case"],
  ],
  b1: [
    ["tokens", "Tokens & Tokenization", [], "Tokenizer Slicer"],
    ["context-windows", "Context Windows", ["tokens"], "Context Tetris"],
    ["boss-the-bill", "Boss: The Bill", ["tokens", "context-windows"], "History vs budget", "boss"],
  ],
  b2: [
    ["sampling", "Sampling: Temperature & Top-p", ["tokens"], "Distribution Dial"],
    ["hallucination", "Why Models Hallucinate", ["sampling"], "Confident Nonsense"],
    ["ttft-throughput", "Time-to-first-token vs Throughput", ["tokens", "littles-law"], "Stream Race"],
    ["llm-cost-math", "LLM Cost Math", ["tokens", "estimation-qps"], "Token Meter"],
  ],
  b3: [
    ["system-prompts", "System Prompts", ["context-windows"], "Role Call"],
    ["prompt-structure", "Structure & Examples", ["system-prompts"], "Prompt Surgery"],
    ["extended-thinking", "Extended Thinking", ["prompt-structure", "llm-cost-math"], "Think Budget"],
    ["structured-outputs", "Structured Outputs", ["prompt-structure"], "Schema Lock"],
    ["prompt-caching", "Prompt Caching", ["context-windows", "llm-cost-math"], "Cache the Prefix"],
    ["prompt-versioning", "Prompt Versioning", ["prompt-structure"], "Prompt Diff"],
    ["field-telegram-summarizer", "Field: Telegram Link Summarizer", ["structured-outputs", "context-windows"], "Field Mission", "field"],
  ],
  b4: [
    ["embeddings", "Embeddings", ["tokens"], "Embedding Space Explorer"],
    ["cosine-similarity", "Cosine Similarity", ["embeddings"], "Angle Finder"],
    ["bi-vs-cross-encoder", "Bi-encoders vs Cross-encoders", ["cosine-similarity"], "Two Towers"],
    ["chunking", "Chunking Strategies", ["embeddings", "context-windows"], "Chunk Chef"],
    ["bm25", "BM25", ["inverted-index"], "Term Weights"],
    ["hybrid-search-rrf", "Hybrid Search & RRF", ["bm25", "cosine-similarity"], "RRF Mixer"],
    ["hyde", "HyDE", ["hybrid-search-rrf"], "Hypothetical Answer"],
    ["reranking", "Reranking", ["bi-vs-cross-encoder", "hybrid-search-rrf"], "Rerank Relay"],
    ["metadata-filtering", "Metadata Filtering", ["hybrid-search-rrf"], "Filter First?"],
    ["ann-indexes", "HNSW vs IVF", ["cosine-similarity"], "Graph Hop"],
    ["retrieval-eval", "Retrieval Evals (recall@k, MRR, nDCG)", ["reranking"], "Rank Judge"],
  ],
  b5: [
    ["eval-test-sets", "Building Eval Sets", ["structured-outputs"], "Golden Set"],
    ["code-graders", "Code-based Graders", ["eval-test-sets"], "Assert It"],
    ["llm-as-judge", "LLM-as-Judge", ["code-graders"], "Judge the Judge"],
    ["prompt-regression", "Prompt Regression Testing", ["llm-as-judge", "prompt-versioning"], "Eval Lab"],
    ["offline-online-evals", "Offline vs Online Evals", ["prompt-regression", "sli-slo-error-budgets"], "Shadow Traffic"],
    ["boss-ship-the-prompt", "Boss: Ship the Prompt", ["prompt-regression", "offline-online-evals", "retrieval-eval"], "Eval gauntlet", "boss"],
    ["field-case-intel-evals", "Field: An Eval Suite for Case Intel Search", ["retrieval-eval", "prompt-regression"], "Field Mission", "field"],
  ],
  b6: [
    ["tool-calling", "Tool Calling & JSON Schemas", ["structured-outputs"], "Schema Smith"],
    ["agent-loop", "The Agent Loop", ["tool-calling"], "Loop Stepper"],
    ["react-pattern", "ReAct", ["agent-loop"], "Think-Act-Observe"],
    ["planning", "Planning", ["react-pattern"], "Plan Board"],
    ["agent-memory", "Short- vs Long-term Memory", ["agent-loop", "embeddings"], "Memory Palace"],
    ["agent-failure-modes", "Agent Failure Modes", ["agent-loop"], "Agent Debugger"],
    ["human-in-the-loop", "Human-in-the-loop", ["agent-failure-modes"], "Approval Gate"],
    ["workflows-vs-agents", "Workflows vs Agents", ["agent-loop"], "Do You Need an Agent?"],
    ["orchestrator-worker", "Orchestrator-Worker", ["workflows-vs-agents"], "Dispatch"],
    ["parallelization", "Parallelization", ["orchestrator-worker", "tail-latency"], "Fan-out Agents"],
    ["multi-agent", "Multi-agent Patterns", ["orchestrator-worker"], "Agent Org Chart"],
    ["boss-agent-meltdown", "Boss: The Agent That Wouldn't Stop", ["agent-failure-modes", "human-in-the-loop", "planning"], "Live agent triage", "boss"],
    ["inc-agent-loop", "INC: $400 of Tool Calls", ["agent-failure-modes"], "Incident Room", "incident"],
  ],
  b7: [
    ["mcp-architecture", "MCP: Host, Client, Server", ["tool-calling"], "Wire It Up"],
    ["mcp-transports", "MCP Transports", ["mcp-architecture", "realtime-transport"], "stdio or HTTP"],
    ["mcp-primitives", "Tools, Resources & Prompts", ["mcp-architecture"], "Primitive Sort"],
    ["mcp-build-server", "Build an MCP Server", ["mcp-primitives", "mcp-transports"], "Server Forge"],
    ["field-mcp-server", "Field: Write an MCP Server", ["mcp-build-server"], "Field Mission", "field"],
  ],
  b8: [
    ["claude-code-anatomy", "How Claude Code Works", ["agent-loop", "context-windows"], "Context Inspector"],
    ["directing-coding-agents", "Directing Coding Agents", ["claude-code-anatomy"], "Brief the Bot"],
  ],
  b9: [
    ["llm-gateway", "LLM Gateways", ["reverse-proxy", "rate-limiting"], "Gateway Guard"],
    ["model-routing", "Routing by Cost, Quality & Latency", ["llm-gateway", "llm-cost-math"], "Model Router"],
    ["semantic-caching", "Semantic Caching", ["cache-aside", "cosine-similarity"], "Near Miss"],
    ["llm-rate-limits-retries", "LLM Rate Limits & Retries", ["retries-backoff-jitter", "llm-gateway"], "429 Storm"],
    ["streaming", "Streaming Responses", ["realtime-transport", "ttft-throughput"], "Token Stream"],
    ["llm-tracing", "Tracing Prompts & Tool Calls", ["observability", "agent-loop"], "Trace Viewer"],
    ["guardrails", "Guardrails", ["structured-outputs"], "Guard Post"],
    ["pii-handling", "PII Handling", ["guardrails"], "Redact"],
    ["llm-cost-controls", "LLM Cost Controls", ["model-routing", "prompt-caching"], "Budget Cap"],
    ["inc-429-storm", "INC: The 429 Storm", ["llm-rate-limits-retries"], "Incident Room", "incident"],
  ],
  b10: [
    ["prompt-injection-direct", "Direct Prompt Injection", ["system-prompts"], "Prompt Injection Heist"],
    ["prompt-injection-indirect", "Indirect Prompt Injection", ["prompt-injection-direct", "tool-calling"], "Poisoned Document"],
    ["tool-exfiltration", "Exfiltration Through Tools", ["prompt-injection-indirect"], "Leaky Tool"],
    ["least-privilege-tools", "Least-privilege Tool Design", ["tool-exfiltration"], "Scope It Down"],
    ["inc-injected-support-bot", "INC: The Support Bot Said What?", ["prompt-injection-indirect"], "Incident Room", "incident"],
  ],
  b11: [
    ["rag-vs-finetune", "Prompting vs RAG vs Fine-tuning", ["chunking", "prompt-structure"], "Decision Tree"],
    ["lora", "LoRA Intuition", ["rag-vs-finetune"], "Low-rank Dial"],
    ["quantization", "Quantization", ["rag-vs-finetune"], "Bit Squeeze"],
    ["local-models", "Running Local Models", ["quantization"], "Fit in 6GB"],
  ],
  b12: [
    ["case-chat-service", "Case: ChatGPT-style Chat Service", ["streaming", "context-windows", "llm-rate-limits-retries", "case-chat"], "Interview case", "case"],
    ["case-legal-rag", "Case: Legal-document RAG at Scale", ["retrieval-eval", "hybrid-search-rrf", "multi-tenant-isolation", "chunking"], "Interview case", "case"],
    ["case-coding-agent", "Case: AI Coding Agent", ["claude-code-anatomy", "agent-failure-modes", "least-privilege-tools"], "Interview case", "case"],
    ["case-llm-gateway", "Case: LLM Gateway", ["llm-gateway", "model-routing", "llm-cost-controls", "semantic-caching"], "Interview case", "case"],
    ["case-support-agent", "Case: Support Agent with Human Escalation", ["human-in-the-loop", "guardrails", "retrieval-eval"], "Interview case", "case"],
    ["case-doc-pipeline", "Case: Document-processing Pipeline", ["queues-vs-logs", "structured-outputs", "dlq-poison"], "Interview case", "case"],
  ],
  c1: [
    ["container-basics", "What a Container Actually Is", ["processes-signals"], "Namespace Nesting"],
    ["docker-images-layers", "Images & Layers", ["container-basics"], "Docker Layers"],
    ["dockerfile-cache", "Dockerfile Build Cache", ["docker-images-layers"], "Cache Busting"],
    ["docker-volumes", "Volumes & Persistence", ["docker-images-layers"], "Where Did My Data Go"],
    ["docker-networking", "Container Networking", ["container-basics", "dns"], "Port Maze"],
    ["docker-compose", "Docker Compose", ["docker-volumes", "docker-networking"], "Compose Up"],
    ["kubernetes-core", "Kubernetes Core", ["docker-compose", "load-balancing"], "Cluster Keeper"],
    ["kubernetes-probes-scaling", "Probes, Limits & HPA", ["kubernetes-core", "autoscaling", "memory-oom"], "Pod Doctor"],
    ["field-containerize-case-intel", "Field: Containerize Case Intel", ["docker-compose"], "Field Mission", "field"],
    ["inc-oom-container", "INC: CrashLoopBackOff", ["kubernetes-probes-scaling"], "Incident Room", "incident"],
  ],
  c2: [
    ["processes-signals", "Processes & Signals", [], "Process Tree"],
    ["memory-oom", "Memory & the OOM Killer", ["processes-signals"], "OOM Roulette"],
    ["file-descriptors", "File Descriptors", ["processes-signals"], "Too Many Open Files"],
    ["systemd", "systemd Units", ["processes-signals"], "Unit Doctor"],
    ["reading-logs", "Reading Logs (journalctl, dmesg)", ["systemd", "memory-oom"], "Log Diver"],
    ["cpu-credits", "Burstable CPU & Credits", ["queueing-utilization"], "Credit Drain"],
  ],
  c3: [
    ["git-dag", "The Commit DAG", [], "Git DAG"],
    ["merge-vs-rebase", "Merge vs Rebase", ["git-dag"], "Rewrite History"],
    ["cherry-pick-reset", "Cherry-pick & Reset", ["merge-vs-rebase"], "Surgeon"],
    ["reflog-rescue", "Reflog Rescues", ["cherry-pick-reset"], "Undo the Undo"],
  ],
  c4: [
    ["ci-pipelines", "CI/CD Pipelines", ["git-dag", "docker-images-layers"], "Pipeline Builder"],
    ["iac-basics", "Infrastructure as Code", ["ci-pipelines"], "Plan & Apply"],
    ["field-gh-actions", "Field: CI for Case Intel", ["ci-pipelines"], "Field Mission", "field"],
  ],
  c5: [
    ["threads-processes-async", "Threads vs Processes vs Async", ["processes-signals", "littles-law"], "Worker Models"],
    ["python-gil", "Python's GIL", ["threads-processes-async"], "The Big Lock"],
    ["race-conditions", "Race Conditions", ["threads-processes-async"], "Race Replay"],
    ["locks-deadlocks", "Locks & Deadlocks", ["race-conditions"], "Dining Deadlock"],
  ],
  c6: [
    ["oop-solid", "OOP & SOLID", [], "Refactor Arena"],
    ["design-patterns", "Design Patterns in Action", ["oop-solid"], "Pattern Match"],
    ["lld-lru-cache", "LLD: LRU Cache", ["design-patterns", "eviction-policies"], "Machine Coding"],
    ["lld-parking-lot", "LLD: Parking Lot", ["design-patterns"], "Machine Coding"],
    ["lld-splitwise", "LLD: Splitwise", ["design-patterns"], "Machine Coding"],
    ["lld-elevator", "LLD: Elevator", ["design-patterns"], "Machine Coding"],
    ["lld-rate-limiter-class", "LLD: Rate Limiter Class", ["design-patterns", "rate-limiting"], "Machine Coding"],
  ],
  d1: [
    ["ci-polling-storm", "Case Intel: The Polling Storm", ["littles-law", "pagination", "realtime-transport", "memory-oom"], "Incident Room", "incident"],
    ["ci-t3-unreachable", "Case Intel: The Unreachable t3.micro", ["memory-oom", "cpu-credits", "reading-logs"], "Incident Room", "incident"],
    ["ci-district-fanout", "Case Intel: State-wide Fan-out", ["retries-backoff-jitter", "bulkheads", "tail-latency", "backpressure"], "Fan-out Designer"],
    ["ci-pg-job-queue", "Case Intel: The Postgres Job Queue", ["postgres-queue", "dlq-poison"], "Lock Skipper: production"],
    ["ci-certbot-404", "Case Intel: Certbot's 404", ["reverse-proxy", "tls-handshake"], "Incident Room", "incident"],
    ["capstone-case-intel-india", "Capstone: Case Intel for Every Advocate in India", ["case-legal-rag", "case-web-crawler", "case-notification-system", "multi-tenant-isolation", "llm-cost-controls", "ci-district-fanout", "ci-pg-job-queue"], "Interview Arena capstone", "boss"],
  ],
};

/**
 * Per-node build status. Anything not listed is "planned".
 * Update this when a pack lands; the content lint checks it against the pack registry.
 */
const STATUS: Partial<Record<string, BuildStatus>> = {
  "latency-numbers": "drafted",
  "littles-law": "drafted",
  "queueing-utilization": "drafted",
  "scale-up-vs-out": "drafted",
  "load-balancing": "drafted",
  "stateless-services": "drafted",
  "boss-launch-day": "drafted",
};

function chapterTrack(chapterId: string): Track {
  const ch = CHAPTERS.find((c) => c.id === chapterId);
  if (!ch) throw new Error(`Unknown chapter ${chapterId}`);
  return ch.track;
}

export const GRAPH: PlannedNode[] = Object.entries(chapterRows).flatMap(([chapter, rows]) =>
  rows.map(([id, title, prereqs, interaction, kind]) => ({
    id,
    title,
    track: chapterTrack(chapter),
    chapter,
    kind: kind ?? "concept",
    prereqs,
    interaction,
    status: STATUS[id] ?? "planned",
  })),
);

export const NODE_BY_ID: ReadonlyMap<string, PlannedNode> = new Map(GRAPH.map((n) => [n.id, n]));

export function chapterNodes(chapterId: string): PlannedNode[] {
  return GRAPH.filter((n) => n.chapter === chapterId);
}

export function getNode(id: string): PlannedNode {
  const n = NODE_BY_ID.get(id);
  if (!n) throw new Error(`Unknown curriculum node: ${id}`);
  return n;
}
