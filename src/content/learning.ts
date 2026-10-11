/**
 * The learning layer: what each part of NINES teaches, and why. Shown in section intros, chapter pages,
 * missions, debriefs, and the "How NINES teaches" page, so the player always knows what a screen is for.
 *
 * Every built node needs an entry (tests/content/learning.test.ts). Keep lines short: one idea each.
 */
import { GRAPH, NODE_BY_ID, type PlannedNode } from "./graph";

export interface ConceptLearning {
  /** What you'll be able to do afterwards. Starts with a verb. */
  canDo: string;
  /** Why it's worth your time: the real problem it solves, at work or in an interview. */
  why: string;
  /** The single idea to remember if you remember nothing else. */
  keyIdea: string;
}

export const CONCEPT_LEARNING: Record<string, ConceptLearning> = {
  "latency-numbers": {
    canDo: "Estimate how long any step takes, from a memory read to a round trip across an ocean, and find the step that dominates a slow request.",
    why: "Every performance decision starts with knowing what's expensive. At your scale, slow pages are usually too many network round trips, not slow code.",
    keyIdea: "Count round trips before you optimise code.",
  },
  "littles-law": {
    canDo: "Size worker pools and connection pools from traffic and latency with L = λW.",
    why: "When a dependency slows down, in-flight requests pile up and use every worker long before the CPU is busy. That is the classic '502s at 40% CPU' outage.",
    keyIdea: "In flight = arrival rate × time in the system.",
  },
  "queueing-utilization": {
    canDo: "Predict how waiting time grows as a server gets busy, and choose how much headroom to keep.",
    why: "A server at 90% busy looks efficient on a dashboard and feels like an outage to users. Capacity planning is picking your spot on that curve.",
    keyIdea: "Waiting explodes near 100% busy; plan for the peak with headroom.",
  },
  "scale-up-vs-out": {
    canDo: "Choose between a bigger box and more boxes using cost, failure impact, and pooling.",
    why: "It's the first fork in every scaling discussion, in interviews and in real launches, and the right answer depends on what a failure costs you.",
    keyIdea: "Bigger boxes pool better; more boxes fail smaller.",
  },
  "load-balancing": {
    canDo: "Pick a balancing algorithm and health checks that route around slow and dead servers.",
    why: "The balancer decides whether one bad server hurts a few requests or a quarter of them. Interviewers expect you to name both the algorithm and the health check.",
    keyIdea: "Route by how busy servers are, and check health through the real request path.",
  },
  "stateless-services": {
    canDo: "Move session state off the app server so boxes can be added, removed, and restarted freely.",
    why: "Scaling out, deploys, and autoscaling all assume any box can serve any request. State kept on a box quietly breaks all three.",
    keyIdea: "Keep state in a shared store or the client, never in one process.",
  },
  "boss-launch-day": {
    canDo: "Combine all six ideas into one design that survives a launch: sizing, headroom, N−1, routing, and stateless sessions.",
    why: "Real incidents never test one concept at a time. Deciding which idea applies, without being told, is what carries over to interviews and on-call.",
    keyIdea: "Design for the worst minute, not the average one.",
  },
  "inc-fourth-box": {
    canDo: "Work a live incident from dashboards, logs, and traces: stop the bleeding first, then prove the root cause.",
    why: "On-call is where these ideas get used for real. Finding the cause from evidence under time pressure is a different skill from knowing the theory.",
    keyIdea: "Mitigate first, explain second, prevent third.",
  },
  "inc-pool-exhaustion": {
    canDo: "Trace a total outage to a connection pool that a few slow queries drained, and free it without adding servers that make it worse.",
    why: "Pool exhaustion looks like an app problem with idle app servers. Reading the wait for a connection, not the CPU, is what points at the database.",
    keyIdea: "Idle app servers and failing requests: look at what they wait for.",
  },
  "inc-dns-ttl": {
    canDo: "Explain why a migration left a share of users on a dead address, and restore them without waiting for caches to expire.",
    why: "DNS changes are the one deploy you cannot roll back for clients that already cached the answer. Planning the TTL before the move is the whole job.",
    keyIdea: "Lower the TTL before the move; keep the old address answering.",
  },
  "inc-stampede": {
    canDo: "Find why a healthy cache stopped caching, read the hit ratio and TTL, and protect the database behind it.",
    why: "A cache hides database load until it stops. When the hit ratio collapses, the database sees the real traffic, usually at the worst moment.",
    keyIdea: "A cache that is up is not necessarily caching.",
  },
  "inc-replica-lag": {
    canDo: "Trace missing or stale reads to a lagging replica, and stop sending traffic to it without waiting for it to catch up.",
    why: "Replication lag looks like a bug in the app: rows that exist are not found. The only signal is how far behind each replica is.",
    keyIdea: "Reads from a replica can be older than the write you just made.",
  },
  "inc-hot-shard": {
    canDo: "Tell a hot key from a bad hash, and relieve one overloaded shard when adding more shards cannot help.",
    why: "Sharding spreads keys evenly only if the keys are used evenly. A single popular key lands on one machine no matter how many there are.",
    keyIdea: "Add shards for more keys, not for one hot key.",
  },
  "inc-retry-storm": {
    canDo: "Recognise a retry storm that outlives its trigger, and end it by cutting retries or adding capacity rather than by shedding or waiting.",
    why: "Retries turn a small slowdown into a self-sustaining overload. The trigger can be long gone while the queues stay full of abandoned work.",
    keyIdea: "Retries multiply load exactly when you can least afford it.",
  },
  "inc-poison-message": {
    canDo: "Find the message that keeps killing queue workers, and stop it with a dead-letter policy and a shorter processing timeout.",
    why: "A queue redelivers failures forever unless told otherwise. One bad message can occupy every worker while good messages wait.",
    keyIdea: "Every queue needs a redrive limit and a dead-letter queue.",
  },
  "inc-agent-loop": {
    canDo: "Diagnose an agent stuck in a tool loop from calls per task and cost, and stop it with step caps, loop guards, or a kill switch.",
    why: "An agent with no stopping rule turns a failed tool call into dozens of model calls. The bill and the error rate rise together.",
    keyIdea: "Cap steps and spend per task, not just per month.",
  },
  "inc-429-storm": {
    canDo: "Work out who is using a shared rate limit, and restore interactive traffic by throttling batch work and honouring Retry-After.",
    why: "A 429 is your own limit, not the provider failing. Batch jobs that retry hard on a shared key starve the users that matter.",
    keyIdea: "Separate batch from interactive traffic, and obey Retry-After.",
  },
  "inc-injected-support-bot": {
    canDo: "Trace bad bot behaviour to untrusted text in its context, and contain it with source control, approvals, and tool limits.",
    why: "Retrieved documents are data, but a model reads them as instructions. When the bot can act, one poisoned page becomes real damage.",
    keyIdea: "Treat retrieved text as untrusted, and keep tools on a short leash.",
  },
  "inc-oom-container": {
    canDo: "Read a crash loop to its cause (OOMKilled, exit 137), tell it from probe and node problems, and fix the memory growth.",
    why: "Restarting pods on a schedule is the kernel enforcing a memory limit. Scaling out or loosening probes only multiplies the crashes.",
    keyIdea: "A pod that dies on a schedule has a limit it keeps hitting.",
  },
  "prod-polling-storm": {
    canDo: "Find the endpoint behind a traffic jump, size it with Little's Law, and cut polling load with push, backoff, or caching.",
    why: "A client release can multiply request rate by 30 without any new users. Rate times cost per request, compared with cores, tells you the answer.",
    keyIdea: "Polling cost = clients x frequency x response size.",
  },
  "prod-t3-unreachable": {
    canDo: "Recognise a burstable instance out of CPU credits from the credit balance and steal time, and restore it with unlimited mode or a larger type.",
    why: "A machine can be running and healthy by every status check while the hypervisor withholds its CPU. Logs on the box will not tell you.",
    keyIdea: "Burstable CPU is a budget: watch the credit balance.",
  },
  "prod-certbot-404": {
    canDo: "Fix an expired certificate, then find why automatic renewal failed, and make sure it can never fail silently again.",
    why: "Certificates expire on a date no one watches. Renewal depends on a proxy path that unrelated config changes can quietly break.",
    keyIdea: "Alert on days to expiry, not on the outage.",
  },
  tokens: {
    canDo: "Explain what a token is, why counts differ by language and format, and what a prompt costs per month.",
    why: "Tokens are the unit of cost, speed, and context limits for every LLM feature you'll build.",
    keyIdea: "Cost = tokens × price × volume, and tokens aren't words.",
  },
  "context-windows": {
    canDo: "Decide what goes into each request (what to keep, pin, summarise, or retrieve) and what it costs per conversation.",
    why: "The model only knows what you send it. Most 'it forgot' bugs and runaway bills in LLM products are context decisions.",
    keyIdea: "The model is stateless: you choose what it remembers, every turn.",
  },
  "boss-the-bill": {
    canDo: "Cut an LLM bill by attacking tokens, price per token, and model choice without losing answer quality.",
    why: "Cost reviews come with every AI feature that ships, and 'how would you cut this bill' is a favourite AI-engineering interview question.",
    keyIdea: "Fewer tokens, cheaper tokens, cheaper model where it's safe.",
  },
  "tail-latency": {
    canDo: "Predict how a page that waits on many parallel calls behaves, and cut the tail with fewer calls and hedged reads.",
    why: "Every page that fans out to services is slower than any one of them. This is why a dashboard of healthy services can sit next to unhappy users.",
    keyIdea: "A fan-out is as slow as its slowest call.",
  },
  "estimation-qps": {
    canDo: "Turn a user count into peak requests per second with a chain you can defend, and round it to the right power of ten.",
    why: "Every capacity discussion and system design interview starts with this arithmetic. A written chain beats a confident guess.",
    keyIdea: "Users × actions ÷ 86,400 × peak factor.",
  },
  "estimation-storage": {
    canDo: "Estimate storage and bandwidth from items, sizes, and retention, and decide what counts before you multiply.",
    why: "Budgets, disk plans, and interview questions all need a storage number. Scope (replicas, indexes) moves it more than rounding does.",
    keyIdea: "Rate × size × time × copies, with the scope stated.",
  },
  "estimation-memory": {
    canDo: "Size a cache from the hot working set, the bytes per entry, and the overhead the software adds.",
    why: "An undersized cache evicts the entries you wanted and sends the load back to the database. Sizing on purpose avoids both that and an oversized bill.",
    keyIdea: "Size the hot set, not the dataset.",
  },
  "connection-pooling": {
    canDo: "Work out how many database connections a deployment asks for, and fix it with right-sized pools or a transaction-mode pooler.",
    why: "'Too many clients' appears the first time you autoscale or add workers. The database looks idle while it refuses new connections.",
    keyIdea: "Connections multiply: workers × pool × instances.",
  },
  autoscaling: {
    canDo: "Explain why autoscaling arrives late, and choose headroom, warm pools, or scheduled scaling to cover a spike.",
    why: "Autoscaling is often presented as the answer to spikes. Knowing its lag is what separates a design that survives launch day from one that merely has the feature.",
    keyIdea: "Autoscaling reacts late; headroom covers the gap.",
  },
  "boss-viral-tuesday": {
    canDo: "Combine autoscaling lag, the connection budget, and fan-out tails into one design that survives a surprise spike.",
    why: "Real spikes break layers together, and a fix in one layer often overloads the next. Seeing the interactions is the skill.",
    keyIdea: "Every layer needs its own budget.",
  },
  "dns": {
    canDo: "Trace a DNS lookup through its caches, and choose a TTL that balances lookup speed against how fast a change spreads.",
    why: "Every migration and failover plan meets DNS caching. Knowing why half the office still sees the old server saves a bad afternoon.",
    keyIdea: "A TTL is a promise to every cache.",
  },
  "tcp-udp": {
    canDo: "Explain what TCP's handshake costs, when UDP is the better base, and how QUIC combines the two.",
    why: "Round trips set the first-byte time for distant users, and the transport decides how many you pay before any data moves.",
    keyIdea: "Count round trips before data.",
  },
  "tls-handshake": {
    canDo: "Describe what a TLS handshake agrees on, why 1.3 saves a round trip, and what resumption and 0-RTT trade away.",
    why: "Security teams ask for TLS 1.3, and on long links it is also a free speed-up. Expired certificates are a classic outage.",
    keyIdea: "TLS 1.3 needs one round trip, resumption can skip it.",
  },
  "http-versions": {
    canDo: "Compare HTTP/1.1, 2, and 3 on a real page, and explain when HTTP/2 loses on a lossy link.",
    why: "Upgrading protocols is easy to claim and easy to get wrong. The right answer depends on loss and latency, which is where mobile users live.",
    keyIdea: "Multiplexing needs independent loss recovery.",
  },
  "keep-alive": {
    canDo: "Spot a handshake tax in a chatty service and fix it with connection reuse, pools, and sensible idle timeouts.",
    why: "A service that opens a fresh connection per call pays more for the handshake than for the work. It is one of the cheapest big wins in service-to-service latency.",
    keyIdea: "Pay the handshake once.",
  },
  "reverse-proxy": {
    canDo: "Explain why workers sit idle behind slow clients, and use a buffering reverse proxy to restore capacity.",
    why: "A busy worker pool at low CPU is a classic production puzzle. Nginx in front of the app is the standard answer, and knowing why is what interviewers ask.",
    keyIdea: "A worker is a seat; slow clients keep it warm.",
  },
  "cdn": {
    canDo: "Predict a CDN's hit ratio from request rate and TTL, and choose edges, TTLs, and headers for fast, fresh content.",
    why: "Distance is the one latency you cannot tune away. A CDN is the standard way to avoid it for everything that can be cached.",
    keyIdea: "Hit ratio follows request rate times TTL.",
  },
  "anycast": {
    canDo: "Compare anycast with DNS routing for nearest-site routing and failover, and say what each does to a dead site.",
    why: "Multi-region designs depend on how users find a site and how fast they leave a failed one. DNS and anycast answer that differently.",
    keyIdea: "Anycast moves the road, DNS moves the user.",
  },
  "request-journey": {
    canDo: "List every step between a tap and the first byte, find which ones cross the long distance, and remove or shorten them.",
    why: "For distant users, the handshakes and the request dominate the time, not your code. Finding that early stops you optimising the wrong thing.",
    keyIdea: "Distance sets the floor; code sits on top.",
  },
  "boss-far-away-users": {
    canDo: "Combine an edge, TTLs, newer protocols, and connection reuse to make a far-away market fast within a budget.",
    why: "Going global means choosing which round trips to remove and what freshness and money to spend. Real launches force exactly this trade.",
    keyIdea: "Shorten the long trips first.",
  },
  "cache-aside": {
    canDo: "Add a cache-aside layer, read its hit ratio, and say how much database load it removes.",
    why: "Read-heavy products hit database limits long before they run out of ideas. A cache is the cheapest way to buy headroom, and the hit ratio tells you what you bought.",
    keyIdea: "The database only sees the misses.",
  },
  "zipf-and-sizing": {
    canDo: "Size a cache from skewed traffic, reading the knee in the hit-ratio curve, and turn entries into memory and cost.",
    why: "Buying memory for the long tail is a common, quiet waste. Zipf traffic means a small head does most of the work.",
    keyIdea: "Each tenfold of cache buys the same slice.",
  },
  "eviction-policies": {
    canDo: "Choose between LRU, LFU, and others by access pattern, and explain what a scan does to each.",
    why: "A nightly job can empty a cache that took all day to warm. Knowing which policy resists it is a favourite follow-up in design interviews.",
    keyIdea: "Recency is a guess; scans make it lie.",
  },
  "write-policies": {
    canDo: "Pick write-through, write-back, or write-around, and compute what write-back saves and risks.",
    why: "Write storms on counters take down databases that read caches never touched. The right policy turns thousands of writes into a few.",
    keyIdea: "Write-back trades a loss window for fewer writes.",
  },
  "ttl-invalidation": {
    canDo: "Trade staleness against hit ratio with a TTL, and keep a cache fresh by deleting on write with a TTL backstop.",
    why: "Invalidation is the hard half of caching. Stale profile photos and prices are what users actually notice.",
    keyIdea: "Delete after the write; keep the TTL as a net.",
  },
  "cache-stampede": {
    canDo: "Recognise the sawtooth of a stampede, and stop it with single-flight, early refresh or stale serving, and TTL jitter.",
    why: "A cache that works until it expires is a timed outage. Hot keys expiring together is a classic cause of database collapse.",
    keyIdea: "One rebuild per key, and never all at once.",
  },
  "hot-keys": {
    canDo: "Find a hot key in a sharded cache and spread it with replicas or a local cache.",
    why: "Adding nodes does not help a key that lives on one. Skewed traffic makes this the first thing to break in a growing cache cluster.",
    keyIdea: "A key lives on one node.",
  },
  "cdn-caching": {
    canDo: "Design a CDN cache key and Cache-Control headers that keep a high hit ratio without caching personal data.",
    why: "A single marketing parameter can drop a hit ratio from the nineties to a few percent. The cache key is where that is decided.",
    keyIdea: "Key only on what changes the response.",
  },
  "boss-celebrity-post": {
    canDo: "Combine edge caching, expiry protection, hot-key handling, and write-back counters inside a budget.",
    why: "A viral post breaks the cache layer in several ways at once. Choosing fixes in order, within a bill, is the job.",
    keyIdea: "Each layer needs its own fix, and its own budget.",
  },
  "indexes-btree": {
    canDo: "Explain why a B-tree lookup stays cheap as a table grows, and choose indexes by what the queries ask and what writes will pay.",
    why: "A missing index is the most common cause of a slow query, and too many indexes quietly slow every write. Interviewers expect both halves.",
    keyIdea: "Depth grows with the log; every index taxes writes.",
  },
  "query-plans": {
    canDo: "Read an EXPLAIN plan, spot the expensive node, and design a composite or covering index that removes it.",
    why: "An index that exists is not an index that is used. Reading the plan is how you find out why a query is slow and prove your fix.",
    keyIdea: "Equality columns first, then the sort column.",
  },
  "normalization": {
    canDo: "Decide per column whether to join, copy, or cache, by comparing how often it is read with how often it changes.",
    why: "Join-heavy feeds are slow and copied columns drift. The choice is a trade of read speed for write cost, made one fact at a time.",
    keyIdea: "Copy what is read hot and changes cold.",
  },
  "transactions-acid": {
    canDo: "Use a transaction to make multi-step changes atomic, and explain how the write-ahead log makes commits durable.",
    why: "A crash between two statements is a real incident, and money or orders silently vanish. Atomicity and durability are the first things you check.",
    keyIdea: "Log first, pages later; commit means the log is on disk.",
  },
  "isolation-levels": {
    canDo: "Name the anomalies each isolation level permits, and choose between Serializable and explicit row locks.",
    why: "Double bookings and negative stock come from races that pass every unit test. Matching the tool to the anomaly is a staple of design interviews.",
    keyIdea: "Different rows, shared rule: that is write skew.",
  },
  "mvcc": {
    canDo: "Explain row versions and vacuum, and find why a table is bloated when one long transaction is the cause.",
    why: "Bloat and slow scans on update-heavy Postgres tables usually trace back to something holding a snapshot open, not to vacuum settings.",
    keyIdea: "Vacuum cannot remove what an old snapshot might see.",
  },
  "sql-vs-nosql": {
    canDo: "Match a workload to relational, key-value, document, wide-column, or graph storage by its access pattern and guarantees.",
    why: "Choosing a database by fashion is expensive to undo. Starting from the access pattern is the habit interviewers look for.",
    keyIdea: "Match the store to the access pattern.",
  },
  "lsm-vs-btree": {
    canDo: "Compare B-tree and LSM storage by write, read, and space amplification, and say what compaction costs.",
    why: "Write-heavy systems choose engines by how many bytes hit the disk per row. Knowing the three amplifications explains most storage engine choices.",
    keyIdea: "Append and merge: cheap writes, paid for by compaction.",
  },
  "postgres-is-enough": {
    canDo: "Decide when Postgres can carry a workload and when a measured load justifies one more system, adding them one at a time.",
    why: "Every new datastore is a permanent operating cost. 'Start boring and justify each addition' is both good engineering and a good interview answer.",
    keyIdea: "Each extra system needs a measured reason.",
  },
  "boss-seat-rush": {
    canDo: "Combine indexes, locking, short holds, and replica reports to run a ticket sale that never sells a seat twice.",
    why: "A sale puts every database fundamental under pressure at once. Choosing which tool fixes which failure is the skill.",
    keyIdea: "Hold locks for milliseconds, not through payment.",
  },
  "sampling": {
    canDo: "Explain what temperature, top-p, and top-k do to the next-token choice, and set them for extraction versus brainstorming.",
    why: "The same prompt giving different answers confuses every team once. Knowing the sampler is the difference between flaky tests and a controlled feature.",
    keyIdea: "Temperature adds probability to the unlikely.",
  },
  "hallucination": {
    canDo: "Explain why models fabricate when knowledge runs out, and layer retrieval, abstention, citation, and verification against it.",
    why: "A confident wrong answer in production is a refund, a legal issue, or a lost customer. Defending against it is the first question in any AI interview.",
    keyIdea: "Plausible is not the same as true.",
  },
  "ttft-throughput": {
    canDo: "Separate prefill delay from decode speed, and fix a slow response with streaming, caching, shorter prompts, or a smaller model.",
    why: "Users judge an AI feature by how soon it starts and how long it takes. The two delays have different causes and different fixes.",
    keyIdea: "Prefill sets the first token; decode sets the rest.",
  },
  "llm-cost-math": {
    canDo: "Estimate an LLM feature's monthly bill from traffic and tokens, and cut it with caching, routing, and batching.",
    why: "The AI line item is often the fastest-growing cost in a product. Doing the arithmetic aloud is expected in AI-engineering interviews.",
    keyIdea: "Requests × tokens × price, split input and output.",
  },
  "system-prompts": {
    canDo: "Write a system prompt as separate, explicit rules with examples where needed, and see why compliance multiplies across rules.",
    why: "Most production prompt bugs are rules the prompt never stated or stated badly. A prompt is a spec you can test.",
    keyIdea: "Reliability multiplies across rules.",
  },
  "prompt-structure": {
    canDo: "Lay out a long prompt with documents first, tags, a few examples, and the question last, and test each choice.",
    why: "Layout is the cheapest lever on a long-context prompt, and a few points of accuracy cost almost nothing in tokens.",
    keyIdea: "Stable and long first, the question last.",
  },
  "extended-thinking": {
    canDo: "Set a thinking budget at the knee of the accuracy curve, and decide which tasks deserve reasoning tokens.",
    why: "Reasoning modes can turn a failing task into a working one, and they can burn money on tasks that never needed them.",
    keyIdea: "Spend thinking where the curve is steep.",
  },
  "structured-outputs": {
    canDo: "Get reliably parseable output with schemas and constrained decoding, and know what no schema guarantees.",
    why: "Parse errors at volume are a daily incident. A contract enforced by the decoder beats a polite request.",
    keyIdea: "Structure is enforced; truth is not.",
  },
  "prompt-caching": {
    canDo: "Lay out a prompt so a stable prefix is cached, and judge whether the hit rate justifies the write premium.",
    why: "Repeated context is the largest, easiest saving in most LLM bills, and one timestamp at the front can erase it.",
    keyIdea: "Stable prefix first; a change early breaks the rest.",
  },
  "prompt-versioning": {
    canDo: "Version prompts, gate releases on a regression set, and size the set so noise does not hide real changes.",
    why: "A small wording tweak can quietly break a feature. A gate that ignores noise either misses regressions or blocks good changes.",
    keyIdea: "A small test set gives a number, not an answer.",
  },
  "embeddings": {
    canDo: "Explain what an embedding is, how nearest-neighbour search finds meaning without shared words, and where it fails.",
    why: "Semantic search and RAG start here. Knowing that distance stands in for meaning, and where that breaks, is the foundation for every later retrieval choice.",
    keyIdea: "Distance in the space stands in for meaning.",
  },
  "cosine-similarity": {
    canDo: "Choose between dot product, cosine, and Euclidean distance, and know when normalised vectors make them agree.",
    why: "A mismatched metric gives plausible, quietly wrong rankings, and the longest document wins. It is a small detail that interviewers use to test depth.",
    keyIdea: "Dot product mixes in length; cosine is the angle.",
  },
  "bi-vs-cross-encoder": {
    canDo: "Explain why bi-encoders are fast and cross-encoders accurate, and pick K for a retrieve-then-rerank pipeline.",
    why: "Almost every serious search or RAG system is a two-stage cascade. The skill is choosing how wide the first stage is and what it costs.",
    keyIdea: "Anything that needs the query cannot be precomputed.",
  },
  "chunking": {
    canDo: "Pick chunk size and overlap from the size of real answers, and say what too small and too large each break.",
    why: "Many RAG failures are cutting failures: the right document was found but the answer was split. Chunking sets the ceiling on everything after it.",
    keyIdea: "Chunk near the answer's size, with overlap.",
  },
  "bm25": {
    canDo: "Explain BM25's three ingredients, tune k1 and b, and say when keyword search beats embeddings.",
    why: "BM25 is the baseline every retriever must beat, and it is excellent at exact words, names, and IDs where embeddings are weak.",
    keyIdea: "Rare words, saturating counts, length normalised.",
  },
  "hybrid-search-rrf": {
    canDo: "Combine keyword and vector results with reciprocal rank fusion and explain why adding raw scores fails.",
    why: "Production search almost always mixes both. Fusing by rank is the robust, no-tuning default, and the score trap is a common interview probe.",
    keyIdea: "Fuse ranks, not scores.",
  },
  "hyde": {
    canDo: "Use query rewriting and HyDE to close the question-answer gap, and recognise when they drift or cost too much.",
    why: "Short questions and long answers rarely embed near each other. Rewriting helps, and each trick adds latency and a failure mode to measure.",
    keyIdea: "Borrow the shape of an answer, not its truth.",
  },
  "reranking": {
    canDo: "Add a reranker, choose its depth K, and weigh cross-encoders against LLM rerankers by latency and cost.",
    why: "Reranking is usually the cheapest big quality gain in RAG, and it also shortens the context you pay for.",
    keyIdea: "Retrieve wide for recall, rerank narrow for precision.",
  },
  "metadata-filtering": {
    canDo: "Choose post-filtering, pre-filtering, or partitions for filtered vector search, and design multi-tenant retrieval safely.",
    why: "A small tenant getting one result in ten is a classic production bug, and cross-tenant leaks are worse. Isolation by construction avoids both.",
    keyIdea: "Post-filtering starves narrow filters.",
  },
  "ann-indexes": {
    canDo: "Compare flat, HNSW, and IVF indexes, do the memory arithmetic, and tune recall against latency with quantisation.",
    why: "Index choice decides cost and latency at scale. Starting from memory arithmetic is how strong candidates answer vector-search design questions.",
    keyIdea: "Memory decides your index before speed does.",
  },
  "retrieval-eval": {
    canDo: "Measure a retriever with recall@k, MRR, and nDCG on labelled queries, and pick the metric that matches the task.",
    why: "Without a measurement, retrieval is a matter of opinion. Choosing the right metric is the first step toward evals that mean something.",
    keyIdea: "Recall asks if it was found; nDCG asks how soon.",
  },
  "leader-follower": {
    canDo: "Add read replicas, work out the load per node, and explain why writes still do not scale.",
    why: "Read replicas are the first scaling step for most databases, and 'replicas do not scale writes' is the answer interviewers listen for.",
    keyIdea: "Replication copies; it does not divide.",
  },
  "sync-async-replication": {
    canDo: "Choose synchronous, semi-synchronous, or asynchronous commits per failure domain, and say how much data each can lose.",
    why: "The commit rule decides what 'saved' means when a primary dies. Stating the loss window is how strong designs are judged.",
    keyIdea: "Async says yes before the copy exists.",
  },
  "replication-lag": {
    canDo: "Predict how often replica lag shows a user their own write missing, and fix it with pinning or log-position waits.",
    why: "Vanishing posts after a refresh are a classic read-replica bug. Matching the fix to the anomaly is a favourite follow-up question.",
    keyIdea: "Pay for freshness only where it is noticed.",
  },
  "failover": {
    canDo: "Tune failure detection against needless failovers, add a proxy, and prevent split brain with fencing.",
    why: "Real outages are often made worse by the failover itself. Detection, redirection, and fencing are three separate things to get right.",
    keyIdea: "Silence is ambiguous; fence the old primary.",
  },
  "multi-leader": {
    canDo: "Estimate conflicts in multi-region writes and choose last-writer-wins, merging, or a home region.",
    why: "Multi-region writes are tempting and risky. Knowing the conflict rule is the difference between a design and a hope.",
    keyIdea: "Convergence is not correctness.",
  },
  "leaderless-quorums": {
    canDo: "Choose N, W, and R for a Dynamo-style system, and say when reads are guaranteed to see the latest write.",
    why: "Consistency levels in Cassandra and DynamoDB are quorum choices. R + W > N is one of the most-asked distributed systems facts.",
    keyIdea: "Two big sets in a small room must meet.",
  },
  "boss-primary-down": {
    canDo: "Combine commit rules, detection timing, a proxy, fencing, and read policy into one failover design within a budget.",
    why: "A primary failure tests every replication choice at once. The skill is knowing which setting guards which failure.",
    keyIdea: "Each setting guards one failure; check the bill.",
  },
  "sharding-strategies": {
    canDo: "Choose range, hash, compound, or directory sharding for a workload and say which queries stay on one shard.",
    why: "The sharding scheme decides whether writes spread and which queries are cheap. Naming the hot tail of a time-ordered range is a standard design-review catch.",
    keyIdea: "Ranges keep neighbours together; hashes spread them.",
  },
  "shard-keys": {
    canDo: "Pick a shard key from the main access paths and serve a second path with a copy, counting the write cost.",
    why: "The shard key is the hardest decision to undo. Interviewers listen for whether you start from the queries or from the data.",
    keyIdea: "The key chooses which query is cheap.",
  },
  "hot-partitions": {
    canDo: "Work out how overloaded a shard gets from one hot key, and relieve it with a cache and salting.",
    why: "Celebrity keys overload a single shard while the cluster looks healthy. Knowing that more shards will not help is the first step.",
    keyIdea: "More shards spread keys, not one key.",
  },
  "consistent-hashing": {
    canDo: "Explain why hash mod N reshuffles everything, and use a ring with virtual nodes so only about 1 in N+1 keys move.",
    why: "Consistent hashing is one of the most-asked distributed systems topics, and the virtual node follow-up separates memorised answers from understood ones.",
    keyIdea: "Only the new node's arc moves.",
  },
  "rebalancing": {
    canDo: "Estimate how much data a rebalance moves and pick a throttle that balances duration against user-visible latency.",
    why: "Adding nodes under load is where sharded systems hurt. The honest answer names the amount moved, the time it takes, and the cost to users.",
    keyIdea: "Rebalancing is a tax on live traffic.",
  },
  "timeouts": {
    canDo: "Set timeouts as a budget down a call chain, and pass the deadline along so abandoned work stops.",
    why: "A timeout longer than the caller's is wasted load. Deadline propagation is the standard answer to cascading slowness.",
    keyIdea: "Inner timeouts shorter than outer.",
  },
  "retries-backoff-jitter": {
    canDo: "Estimate how retries multiply load in an outage, and combine backoff, jitter and a retry budget to stay safe.",
    why: "Retry storms turn short blips into long outages. Naming the amplification and the budget is a standard resilience answer.",
    keyIdea: "Backoff changes timing; only a cap changes the total.",
  },
  "idempotency": {
    canDo: "Make a non-idempotent API retry-safe with a per-action key, a long enough key lifetime, and atomic reservation.",
    why: "Every client times out sometimes. Without idempotency, a lost response becomes a double charge.",
    keyIdea: "The key belongs to the action, not the attempt.",
  },
  "circuit-breakers": {
    canDo: "Tune a circuit breaker so it sheds a failing dependency quickly without tripping on noise or lingering shut.",
    why: "Breakers keep one dead dependency from tying up every thread. Tuning them is where candidates differ.",
    keyIdea: "Fail fast, probe gently.",
  },
  "bulkheads": {
    canDo: "Size separate pools per dependency from calls per second times duration, and show a shared pool failing together.",
    why: "A slow dependency can starve a shared pool and take healthy features with it. Isolation is the fix.",
    keyIdea: "One slow dependency should exhaust only its own pool.",
  },
  "cap-pacelc": {
    canDo: "Choose consistency or availability during a partition for a given kind of data, and name the latency trade-off otherwise.",
    why: "CAP is asked in nearly every distributed systems interview. PACELC is what shows you understand it beyond the slogan.",
    keyIdea: "Partitions are a given; choose C or A, then latency or consistency.",
  },
  "consistency-models": {
    canDo: "Compare linearizable, causal and eventual reads by what a user can notice, and pick the cheapest that is enough.",
    why: "Most products need session guarantees, not linearizability. Knowing the ladder lets you avoid both over- and under-paying.",
    keyIdea: "Guarantee only what a user can notice.",
  },
  "clocks-ordering": {
    canDo: "Explain why wall clocks misorder writes, and choose logical, hybrid, bounded or vector clocks for the need.",
    why: "Last-writer-wins by timestamp silently loses data. Clock questions come up in every replicated-database design.",
    keyIdea: "Counters track causes, not clocks.",
  },
  "consensus-raft": {
    canDo: "Explain Raft's election and majority commit, and tune the election timeout against needless elections and slow failover.",
    why: "Raft underlies etcd, Consul and many databases. Interviewers ask how it elects a leader and what the timers do.",
    keyIdea: "Any two majorities overlap.",
  },
  "distributed-locks": {
    canDo: "Explain why a lease can expire under a paused holder, and protect a resource with fencing tokens.",
    why: "Distributed locks look simple and fail in subtle ways. Fencing is the answer that distinguishes careful designs.",
    keyIdea: "Enforce at the point of effect.",
  },
  "two-pc-vs-sagas": {
    canDo: "Choose between two-phase commit and a saga for a cross-service workflow, and make the saga's steps and compensations safe to retry.",
    why: "Microservices cannot share a transaction. Sagas are the standard answer, and their weaknesses are the follow-up.",
    keyIdea: "Sagas trade atomicity for availability.",
  },
  "outbox-pattern": {
    canDo: "Avoid lost or phantom events with a transactional outbox, and get exactly-once effects from at-least-once delivery.",
    why: "The dual-write problem appears in every event-driven design. The outbox is the pattern interviewers expect.",
    keyIdea: "Put the event in the same transaction as the data.",
  },
  "queues-vs-logs": {
    canDo: "Choose between a queue and a log for a workload, size the partitions, and estimate retention storage.",
    why: "Queue versus log is the first question in most messaging designs. Knowing partitions, offsets and replay shows you have used both.",
    keyIdea: "The queue forgets so you do not have to; the log remembers so you can.",
  },
  "delivery-semantics": {
    canDo: "Explain at-most-once and at-least-once, estimate losses and duplicates, and get exactly-once effects with dedup by id.",
    why: "Every messaging interview probes exactly-once. The clear answer is at-least-once plus idempotent consumers.",
    keyIdea: "Delivery is at least once; the effect can be once.",
  },
  "dlq-poison": {
    canDo: "Set a retry limit and dead-letter queue so poison messages leave without losing healthy ones or blocking an ordered queue.",
    why: "A single bad message can take down a worker fleet. Bounded retries and an alarmed dead-letter queue are the standard defence.",
    keyIdea: "Retry with a limit, then set aside.",
  },
  "backpressure": {
    canDo: "Predict the backlog and wait from a spike, and choose bounded buffers, dropping or backpressure over an unbounded queue.",
    why: "Queues hide overload until it is late. Bounding them and pushing back is how real systems survive spikes.",
    keyIdea: "A queue converts overload into delay; it does not remove it.",
  },
  "fan-out-pubsub": {
    canDo: "Replace chains of synchronous calls with a topic and a queue per subscriber, and compute the latency and failure savings.",
    why: "Fan-out is the standard way to add consumers without touching the producer. The queue-per-subscriber detail is the follow-up.",
    keyIdea: "Publishers announce; subscribers decide.",
  },
  "event-driven": {
    canDo: "Decide which calls become events, accept eventual consistency, and keep flows traceable with correlation ids.",
    why: "Event-driven designs are faster and looser and harder to debug. Naming both sides is what interviewers want.",
    keyIdea: "Events for what can follow; calls for what must come first.",
  },
  "cqrs": {
    canDo: "Separate a write model from a read model, estimate the read savings, and handle the lag for the user who just wrote.",
    why: "CQRS is easy to over-apply. Knowing when reads dominate, and what the projection costs, shows judgement.",
    keyIdea: "Do the expensive work where it happens least often.",
  },
  "event-sourcing": {
    canDo: "Explain events as the record, estimate replay time, and plan snapshots and parallel rebuilds.",
    why: "Event sourcing gives audit and replay and costs replay time and versioning. Snapshots are the standard follow-up.",
    keyIdea: "A snapshot is a cache of a replay; the log stays the truth.",
  },
  "postgres-queue": {
    canDo: "Build a job queue on Postgres with FOR UPDATE SKIP LOCKED and LISTEN/NOTIFY, and say when to move to a broker.",
    why: "Many systems never need a broker. Knowing how to make the database you have do the job is a practical senior skill.",
    keyIdea: "Use the system you already run until it is the limit.",
  },
  "api-styles": {
    canDo: "Choose REST, GraphQL or gRPC for a caller and network, and spot the N+1 problem in GraphQL.",
    why: "API style is a standard design question. Tying the choice to the client and the network, not to fashion, is what interviewers look for.",
    keyIdea: "Match the style to the caller.",
  },
  "pagination": {
    canDo: "Explain why offset pagination slows and drifts, and use cursor pagination on an indexed unique sort key.",
    why: "Deep offsets and repeated items are common production bugs. Cursor pagination is the expected answer.",
    keyIdea: "A cursor remembers the item, not a position.",
  },
  "idempotency-keys": {
    canDo: "Specify what a server does with an idempotency key in each edge case: in flight, mismatched, failed, and cross-account.",
    why: "Adding a key is easy. The edge cases decide whether it works, and they are where follow-up questions go.",
    keyIdea: "Claim first, work second.",
  },
  "api-versioning": {
    canDo: "Choose between URL versions, additive evolution and pinned versions, and size a deprecation window from client upgrade data.",
    why: "Breaking partners costs trust. A versioning plan with numbers shows maturity.",
    keyIdea: "You decide who pays for slow upgraders.",
  },
  "rate-limiting": {
    canDo: "Compare fixed window, token bucket and sliding window limiters on worst-case burst, rejection and memory.",
    why: "Rate limiter design is a staple interview case, and the boundary burst is the detail that separates answers.",
    keyIdea: "The window edge doubles a fixed limit.",
  },
  "realtime-transport": {
    canDo: "Compare polling, long polling, SSE and WebSockets on requests, delay and connection memory.",
    why: "Real-time features start with this choice. Quoting the cost of each shows you have run one.",
    keyIdea: "Polling spends effort on the question, not the answer.",
  },
  "webhooks": {
    canDo: "Design webhook delivery with long backoff, HMAC signing, timestamp checks and receiver-side dedup.",
    why: "Webhooks are the way most products integrate. Reliability and security are both on the checklist.",
    keyIdea: "A secret URL is obscure; a signature is the lock.",
  },
  "sli-slo-error-budgets": {
    canDo: "Turn incidents into error-budget minutes for a chosen SLO, and set burn-rate alerts that catch floods and leaks without paging on blips.",
    why: "SLOs and error budgets are how reliability is traded against change. Burn-rate alerting is the usual follow-up.",
    keyIdea: "Page on how fast the budget burns.",
  },
  "observability": {
    canDo: "Choose metrics, traces and logs to detect, locate and explain an incident within a budget, using tail sampling and correlation ids.",
    why: "Observability spend is easy to overdo or underdo. Tying each signal to a question shows judgement.",
    keyIdea: "Metrics detect, traces locate, logs explain.",
  },
  "deploy-strategies": {
    canDo: "Compare all-at-once, rolling, blue-green and canary releases by users exposed and time to roll back, and size a canary.",
    why: "Safe deploys are a standard senior topic. The canary-sizing detail separates memorised from understood answers.",
    keyIdea: "Limit the audience and shorten the way back.",
  },
  "feature-flags": {
    canDo: "Plan a flag rollout with a small first step and a fast kill switch, and stop flag debt with owners and expiry dates.",
    why: "Flags decouple deploy from release. Their costs, dead branches and slow switches, are the follow-up.",
    keyIdea: "A flag is a loan; somebody must pay it back.",
  },
  "graceful-degradation": {
    canDo: "Classify dependencies as critical or optional, add fallbacks, and shed optional work under overload.",
    why: "Availability multiplies down with every required dependency. Degrading gracefully is how pages survive bad days.",
    keyIdea: "Not everything on a page is the page.",
  },
  "rpo-rto": {
    canDo: "Meet stated RPO and RTO targets with backups, replicas or cross-region copies, and prove them with restore drills.",
    why: "Recovery targets drive disaster recovery cost. Knowing that replication is not a backup is a classic check.",
    keyIdea: "A backup nobody has restored is a hope.",
  },
  "multi-region": {
    canDo: "Compare single region, active-passive and active-active on downtime, latency, data loss and cost.",
    why: "Going multi-region is a large commitment. Pricing it against the real failure rate is the senior answer.",
    keyIdea: "Fix outages with a standby, distance with active-active.",
  },
  "boss-region-outage": {
    canDo: "Combine detection, automatic failover, DNS, replication and degradation into a region-loss plan within a budget.",
    why: "A region failure tests every operations choice at once. The skill is finding the slowest link.",
    keyIdea: "Add up the minutes, then attack the longest.",
  },
  "authn-authz": {
    canDo: "Separate login from permission, and place role and ownership checks where an attacker cannot skip them.",
    why: "Broken access control is the top web risk. Naming object-level authorization is what interviewers listen for.",
    keyIdea: "Role says what you may do; ownership says to which things.",
  },
  "sessions-vs-jwt": {
    canDo: "Compare sessions and tokens on revocation, lookups and size, and design cut-off with short lifetimes or a deny-list.",
    why: "The sessions versus JWT debate hides one question: how fast can you revoke. Answer that and the design follows.",
    keyIdea: "Stateless means nobody remembers to say no.",
  },
  "oauth-oidc": {
    canDo: "Choose the right OAuth flow for a client, explain why PKCE exists, and request only the scopes needed.",
    why: "OAuth flows are asked in nearly every security interview, and implicit and password flows are the common traps.",
    keyIdea: "Redirects are public; put only a one-time code in them.",
  },
  "owasp-top-risks": {
    canDo: "Rank web weaknesses by harm and fix cost, and prevent injection, scripting, guessing and outdated dependencies.",
    why: "Security time is scarce. Spending it on the big, cheap holes first is the practical skill.",
    keyIdea: "Fix the biggest, cheapest risk first.",
  },
  "secrets-management": {
    canDo: "Reduce leak damage by scanning commits, issuing short-lived credentials and scoping keys to least privilege.",
    why: "Leaked keys cause many real breaches. Treating leak as certain and designing for speed and reach is the senior answer.",
    keyIdea: "Shrink hours, rate and reach.",
  },
  "multi-tenant-isolation": {
    canDo: "Pick pooled, schema or database isolation for a tenant count, and enforce the wall below the application.",
    why: "SaaS leaks come from one forgotten filter. Enforcing isolation in the database is the standard answer.",
    keyIdea: "A rule everyone must remember will be forgotten.",
  },
  "boss-breach": {
    canDo: "Run a breach response: detect, contain, limit blast radius, prove scope with logs, and close every other door.",
    why: "A breach tests every earlier security choice at once. The skill is knowing which choice limited the damage.",
    keyIdea: "What you set up before decides what you can do now.",
  },
  "blob-storage": {
    canDo: "Design uploads with presigned multipart URLs and cut storage cost with lifecycle tiers, stating what each tier gives up.",
    why: "Almost every product stores files. Knowing direct upload and tiering separates working designs from ones that melt app servers and budgets.",
    keyIdea: "Keep bytes off your servers; let old data sink.",
  },
  "inverted-index": {
    canDo: "Explain term-to-document posting lists, intersect them from the shortest, and weigh positions against index size.",
    why: "Search is behind every product with a search box. The inverted index is the one idea to know.",
    keyIdea: "Do the reading once, at index time.",
  },
  "geospatial-index": {
    canDo: "Index points by geohash or similar cells, size cells to the search radius, and search neighbouring cells to avoid edge misses.",
    why: "Nearby search is the heart of ride-hailing and delivery designs. Cell size and edges are the follow-up questions.",
    keyIdea: "Cells about the size of the radius, plus their neighbours.",
  },
  "time-series": {
    canDo: "Plan compression, downsampling tiers and retention for a metrics store, and keep label cardinality bounded.",
    why: "Metrics and IoT data overwhelm general databases. Tiering and cardinality are the levers that matter.",
    keyIdea: "Keep the recent past sharp and the distant past blurred.",
  },
  "eval-test-sets": {
    canDo: "Size an eval set for the smallest change that matters, cover rare input kinds on purpose, and keep it out of the prompt.",
    why: "Every AI team is asked how it knows a change helped. A trustworthy eval set is the answer.",
    keyIdea: "Enough examples, the right ones, kept apart.",
  },
  "code-graders": {
    canDo: "Choose and validate code-based graders, weighing false fails against false passes.",
    why: "Code graders are fast and repeatable, but a bad one quietly lies. Measuring its errors is the expert move.",
    keyIdea: "Grade the meaning, not the typography.",
  },
  "llm-as-judge": {
    canDo: "Set up an LLM judge with a rubric, counter its biases, and calibrate it against human labels.",
    why: "Judges scale evaluation and mislead when unchecked. Knowing the biases and how to measure agreement is the core skill.",
    keyIdea: "Measure the thing that measures.",
  },
  "prompt-regression": {
    canDo: "Build a regression gate whose noise is below the effect, using paired comparisons and a threshold between effect and noise.",
    why: "Flaky prompt tests teach teams to ignore them. Understanding the statistics keeps the gate honest.",
    keyIdea: "A gate sees only changes bigger than its noise.",
  },
  "offline-online-evals": {
    canDo: "Layer offline suites, shadow traffic and guarded live tests, and compute the users exposed at each stage.",
    why: "Offline passes can hide regressions in slices the suite lacks. Layered testing is how production teams ship safely.",
    keyIdea: "Shadow tests what you say; live tests what users do.",
  },
  "boss-ship-the-prompt": {
    canDo: "Design a complete release gate: suite, graders, calibrated judge, pairing, threshold and guarded canary, within a budget.",
    why: "Shipping a prompt safely uses every eval skill at once. The skill is finding the weakest link in the gate.",
    keyIdea: "Find the weakest link in the gate.",
  },
  "tool-calling": {
    canDo: "Design tool schemas and sets a model uses reliably, and keep the number of tools in view small with retrieval.",
    why: "Tool design decides whether an agent works. Interviewers ask how you would prevent wrong-tool and bad-argument failures.",
    keyIdea: "The model requests; your code validates and executes.",
  },
  "agent-loop": {
    canDo: "Explain the loop, compute why cost grows with the square of the steps, and cap steps and cost sensibly.",
    why: "Runaway agent bills are the classic production story. Knowing why they grow quadratically shows real understanding.",
    keyIdea: "Every turn re-reads everything before it.",
  },
  "react-pattern": {
    canDo: "Describe ReAct's thought-action-observation cycle and why it beats answering from memory or acting blindly.",
    why: "ReAct is the root of most agent designs. Naming what each alternative lacks is a standard question.",
    keyIdea: "Thinking needs something to think about.",
  },
  "planning": {
    canDo: "Compute the success of a fixed plan as a product of steps, and add bounded replanning to make long tasks reliable.",
    why: "Long agent tasks fail by compounding. Bounded replanning is the standard remedy.",
    keyIdea: "Reliability multiplies down a chain.",
  },
  "agent-memory": {
    canDo: "Layer a recent window, a summary, pinned facts and retrieval to remember a long conversation within a token budget.",
    why: "Memory is a selection problem, and the layered answer is what separates a demo from a product.",
    keyIdea: "Memory is a selection problem.",
  },
  "agent-failure-modes": {
    canDo: "Name the main agent failure modes and defend against loops, bad tool calls and silent wrong answers.",
    why: "Agents fail in ways ordinary software does not. Layered limits and tracing are the practical answer.",
    keyIdea: "The loop will never decide to stop on its own.",
  },
  "human-in-the-loop": {
    canDo: "Gate agent actions by consequence, make low-risk mistakes reversible, and avoid approval fatigue.",
    why: "Putting a human in the loop is easy; putting them where they help is the skill.",
    keyIdea: "Approve what cannot be undone.",
  },
  "workflows-vs-agents": {
    canDo: "Choose a workflow, an agent, or a router between them based on how predictable the task is.",
    why: "Not every task needs an agent. Starting simple and routing by need is the advice teams most often wish they had taken.",
    keyIdea: "Add autonomy where it pays.",
  },
  "orchestrator-worker": {
    canDo: "Split a task across parallel workers with clean contexts, and weigh the quality gain against coordination cost.",
    why: "Research agents use this pattern. The knee in the quality curve is the detail interviewers look for.",
    keyIdea: "Small clean contexts, and a cost to combine them.",
  },
  "parallelization": {
    canDo: "Choose sectioning or voting, size a vote, and use a quorum to avoid the tail latency of the slowest call.",
    why: "Parallel calls help accuracy and speed and hurt cost and tail latency. Quorums are the standard fix.",
    keyIdea: "Divide for speed, repeat for certainty.",
  },
  "multi-agent": {
    canDo: "Compare supervisor, debate and swarm organisations on quality, tokens and failures.",
    why: "Multi-agent designs are fashionable and costly. Reasoning about their communication cost shows judgement.",
    keyIdea: "Earn the complexity.",
  },
  "boss-agent-meltdown": {
    canDo: "Contain a runaway agent with layered limits, a consequence-based gate, idempotent tools and an independent alert.",
    why: "A runaway agent tests every agent safeguard at once. The skill is knowing which control stops what.",
    keyIdea: "Bound the loop, gate the damage, alert independently.",
  },
  "mcp-architecture": {
    canDo: "Explain hosts, clients and servers, and compute why a shared protocol turns M times N integrations into M plus N.",
    why: "MCP is how tools reach models. Knowing what it standardises, and what it costs in context, is a current interview topic.",
    keyIdea: "Write the integration once, use it everywhere.",
  },
  "mcp-transports": {
    canDo: "Choose between stdio and streamable HTTP, and add authentication to a remote server.",
    why: "Where a server runs decides who can reach it and what it costs. Remote servers without auth are a common mistake.",
    keyIdea: "Local is one process per user; remote is shared and must be authenticated.",
  },
  "mcp-primitives": {
    canDo: "Decide whether a capability should be a tool, a resource or a prompt, and say who controls each.",
    why: "Mapping capabilities to the right primitive is the core design decision when writing a server.",
    keyIdea: "Tools act, resources inform, prompts guide.",
  },
  "mcp-build-server": {
    canDo: "Design an MCP server whose tools are task-shaped, trimmed, well-described, scoped per user and protocol-clean.",
    why: "Most servers fail from too many tools and noisy output. Design for the model, not for the API.",
    keyIdea: "Design tools for the model that reads them.",
  },
  "claude-code-anatomy": {
    canDo: "Explain what fills a coding agent's context and keep a long session healthy with lean setup, subagents and compaction.",
    why: "Coding agents are the most common daily use of AI engineering. Context management is what separates good sessions from bad.",
    keyIdea: "One window holds everything; the permanent part is rent.",
  },
  "directing-coding-agents": {
    canDo: "Brief a coding agent with tests, constraints, files and a plan so each change is small and reviewable.",
    why: "Directing an agent is delegation. Reviewers who brief well get better changes in less time.",
    keyIdea: "Give it a way to know it is wrong.",
  },
  "llm-gateway": {
    canDo: "Set up a gateway with one key, per-team limits, failover and cheap logging, and say what it costs.",
    why: "Gateways are how companies run models at scale. Naming the single point of failure shows judgement.",
    keyIdea: "One door for every call.",
  },
  "model-routing": {
    canDo: "Route requests between model tiers by difficulty, and compare classifier and cascade routing on cost, quality and latency.",
    why: "Routing is the main lever on inference cost. Interviewers ask how you would cut the bill without losing quality.",
    keyIdea: "Spend follows difficulty.",
  },
  "semantic-caching": {
    canDo: "Choose a similarity threshold, add verification, and scope the cache key so hits are right and private.",
    why: "Semantic caches save money and cause subtle wrong answers. Knowing the threshold trade-off is the skill.",
    keyIdea: "Safe and useful need a second check.",
  },
  "llm-rate-limits-retries": {
    canDo: "Retry rate-limited calls with jitter and bounded attempts, honour retry-after, and avoid a retry storm.",
    why: "Retry storms turn a blip into an outage. This is a classic production question.",
    keyIdea: "A 429 is capacity, not a glitch.",
  },
  "streaming": {
    canDo: "Stream tokens so the first text appears in under a second, find what buffers it, and cancel when users leave.",
    why: "Time to first token is what users feel. Streaming through real infrastructure is where it breaks.",
    keyIdea: "Total time is the same, waiting is not.",
  },
  "llm-tracing": {
    canDo: "Capture prompts, context and tool data in traces, tail-sample failures, and redact before storing.",
    why: "You cannot fix what you cannot see. Tracing that omits content cannot explain a wrong answer.",
    keyIdea: "Capture content, sample failures, redact.",
  },
  "guardrails": {
    canDo: "Layer rules, classifiers and schema checks around a model and tune them for leaks and false blocks.",
    why: "Prompts are requests, not walls. Guardrails are judged on both errors.",
    keyIdea: "Checks that do not depend on the model agreeing.",
  },
  "pii-handling": {
    canDo: "Redact personal data before it leaves your system, restore placeholders, choose a detector and limit retention.",
    why: "Personal data in prompts and logs is a standing liability. The cheapest control is to remove it early.",
    keyIdea: "Data you never send cannot leak.",
  },
  "llm-cost-controls": {
    canDo: "Measure the cost distribution, cap output and context, set quotas above ordinary use, then route, cache and batch.",
    why: "Bills are set by the tail. Controls go where the tail is.",
    keyIdea: "Bills are paid on the mean, not the median.",
  },
  "prompt-injection-direct": {
    canDo: "Explain why instructions and user input are not separable, layer defences, and limit what an injection can reach.",
    why: "Prompt injection is the top-ranked LLM risk. Interviewers expect you to say filters are not a boundary.",
    keyIdea: "Assume the prompt will be read out loud.",
  },
  "prompt-injection-indirect": {
    canDo: "Describe attacks carried by retrieved content, estimate exposure from retrieval volume, and contain them by quarantining and restricting actions.",
    why: "Agents that read untrusted content and act are the real attack surface. This is how you reason about it.",
    keyIdea: "The attacker writes the data.",
  },
  "tool-exfiltration": {
    canDo: "List the channels a hijacked agent can use to move data out and close them in rendering and tools.",
    why: "Stealing needs a channel. Closing channels beats detecting intent.",
    keyIdea: "Each tool is a door.",
  },
  "least-privilege-tools": {
    canDo: "Add up an agent's worst case from its grants and cut it with narrow tools and scoped, short-lived credentials.",
    why: "Least privilege holds even when the model fails. It is the control interviewers want to hear.",
    keyIdea: "The permissions list is the blast radius.",
  },
  "rag-vs-finetune": {
    canDo: "Choose between prompting, retrieval and fine-tuning from the failure you measure, and combine retrieval for facts with tuning for format.",
    why: "'Should we fine-tune?' is the most common wrong question. Knowing what each tool is for saves months.",
    keyIdea: "Retrieval changes what it answers from; tuning changes how.",
  },
  "lora": {
    canDo: "Explain low-rank adapters, choose rank and target layers, and use QLoRA to fit a job on a small GPU.",
    why: "Parameter-efficient tuning is how most teams fine-tune. Knowing the dials shows you have done it.",
    keyIdea: "A habit is a small change to a big skill.",
  },
  "quantization": {
    canDo: "Compute model size from bits, explain why smaller is faster, and pick a bit width and method by measuring quality.",
    why: "Quantization decides what you can serve and at what cost. Knowing the knee in the curve is practical judgement.",
    keyIdea: "Size is arithmetic; quality is what you buy with it.",
  },
  "local-models": {
    canDo: "Work out whether a model fits a GPU from weights, key-value cache and overhead, and choose bits, context and offload to make it fit.",
    why: "Context length costs memory, not only tokens. This is the question behind every local setup.",
    keyIdea: "Weights are only part of what you hold.",
  },
  "container-basics": {
    canDo: "Explain a container as a restricted process, and choose the namespace, cgroup and hardening switches that contain it.",
    why: "'Is a container a VM?' is a standard question. Knowing which switch controls which risk is the better answer.",
    keyIdea: "Seeing and using are different switches.",
  },
  "docker-images-layers": {
    canDo: "Explain why layers only add, and cut an image's size and attack surface with multi-stage builds, same-layer cleanup and a small base.",
    why: "Image size is scale-up latency and attack surface. Reviewers look at Dockerfiles for exactly these habits.",
    keyIdea: "Layers add. They never subtract.",
  },
  "dockerfile-cache": {
    canDo: "Order a Dockerfile for the build cache, keep the cache on CI, and use cache mounts for packages.",
    why: "Slow builds cost a team hours a day. Knowing why the cache breaks is a quick, visible win.",
    keyIdea: "Stable steps first.",
  },
  "docker-volumes": {
    canDo: "Explain what survives a restart, a recreation and a host loss, and place data accordingly with backups.",
    why: "Losing data on a redeploy is the classic container mistake. Choosing storage by lifetime is the fix.",
    keyIdea: "Replaceable compute, durable data.",
  },
  "docker-networking": {
    canDo: "Explain per-container localhost, connect services by name on a user-defined network, and publish only what outsiders need.",
    why: "'Why can't my container connect to the database?' is the most common Docker question.",
    keyIdea: "Localhost is a namespace, not the machine.",
  },
  "docker-compose": {
    canDo: "Explain why start order is not readiness, and make a Compose stack start reliably with healthchecks and resilient clients.",
    why: "Compose is the first orchestration tool most developers use. The readiness trap is its most common bug.",
    keyIdea: "Started is not ready.",
  },
  "kubernetes-core": {
    canDo: "Describe declared state and reconciliation, tune rolling updates, and spread replicas across failure domains.",
    why: "Kubernetes questions test whether you understand what the system guarantees and what it does not.",
    keyIdea: "Redundancy needs independence.",
  },
  "kubernetes-probes-scaling": {
    canDo: "Set memory limits from measured peaks, delay liveness past boot time, gate traffic with readiness, and size autoscaling for the spike.",
    why: "CrashLoopBackOff and slow scaling are the two production Kubernetes problems everyone meets.",
    keyIdea: "A limit is a kill switch with a number on it.",
  },
  "processes-signals": {
    canDo: "Explain how a container is told to stop, and set up exec form, a SIGTERM handler, an init and a grace period so shutdown is clean.",
    why: "Dropped requests on every deploy usually come from a signal that never arrives. It is a quick, concrete win.",
    keyIdea: "A handler only runs in the process that gets the signal.",
  },
  "memory-oom": {
    canDo: "Explain how the OOM killer chooses, contain a leak with limits, and protect the database.",
    why: "Exit code 137 is among the most common production mysteries. Knowing who the kernel kills and why is the answer.",
    keyIdea: "The kernel knows who is big, not who is at fault.",
  },
  "file-descriptors": {
    canDo: "Work out descriptors per connection, size the limit where the process is launched, and close what you open.",
    why: "'Too many open files' is a classic limit that looks like a capacity problem. The fix is arithmetic and discipline.",
    keyIdea: "A bigger limit buys time. Only closing the file stops the leak.",
  },
  "systemd": {
    canDo: "Write a unit that restarts transient failures quickly, stops retrying hopeless ones, and fails visibly.",
    why: "Every host runs a supervisor. Restart policy is part of the availability number.",
    keyIdea: "Heal what can heal. Give up loudly on what can't.",
  },
  "reading-logs": {
    canDo: "Find the cause of a vanished service with journalctl and the kernel log, and keep evidence that survives a reboot.",
    why: "The first minutes of an incident decide how well you can investigate it. Logs that survive are what make that possible.",
    keyIdea: "Logs outlive the machine that wrote them.",
  },
  "cpu-credits": {
    canDo: "Compare average CPU use with a baseline, predict a throttle, and decide between standard, unlimited and fixed-performance instances.",
    why: "Burstable instances are everywhere, and their throttle looks like an idle machine. Knowing the cliff saves a long debugging session.",
    keyIdea: "A pinned low number is a throttle, not a rest.",
  },
  "git-dag": {
    canDo: "Explain a branch as a pointer into a graph of immutable commits, and keep work reachable so it survives gc.",
    why: "'I lost my commits' is one of the most common Git panics. Knowing reachability removes most of the fear.",
    keyIdea: "A branch is a label on a commit.",
  },
  "merge-vs-rebase": {
    canDo: "Compare merge, rebase and squash by history shape, conflicts and bisect granularity, and never rewrite shared history.",
    why: "Teams argue about this constantly. The judgement is knowing what each rewrites and who it affects.",
    keyIdea: "Never rewrite what others are standing on.",
  },
  "cherry-pick-reset": {
    canDo: "Choose between soft, mixed and hard reset by what each keeps, and cherry-pick a fix to another branch.",
    why: "A forum command that deletes uncommitted work is a rite of passage. Knowing the three areas avoids it.",
    keyIdea: "Move the label. Keep the work.",
  },
  "reflog-rescue": {
    canDo: "Recover lost commits with the reflog, fsck and a remote copy, and know what Git never recorded.",
    why: "The calm way to answer 'I deleted it' is knowing the windows. Pushing early beats all of them.",
    keyIdea: "Find the hash, then give it a name.",
  },
  "ci-pipelines": {
    canDo: "Design a pipeline for fast, trustworthy feedback: cheap checks first, parallel and cached, flaky tests quarantined.",
    why: "A slow or noisy pipeline changes how a team behaves. Interviewers ask how you would speed one up.",
    keyIdea: "Fast feedback, and red that means something.",
  },
  "iac-basics": {
    canDo: "Run a plan, review, apply workflow with remote locked state, and detect and reconcile drift.",
    why: "'It works in staging' often means the environments differ. Code as the only path to change fixes that.",
    keyIdea: "The code is true only if it is the only way things change.",
  },
  "threads-processes-async": {
    canDo: "Compare threads, processes and async by memory per connection and CPU use, and keep CPU work off the event loop.",
    why: "Concurrency model is the first design decision of a server. Interviewers ask what you would pick for 20,000 connections.",
    keyIdea: "Waiting is free for a CPU and expensive for a stack.",
  },
  "python-gil": {
    canDo: "Explain the GIL, predict when threads help, and choose processes for CPU-bound Python.",
    why: "The GIL question separates people who have profiled from people who have read about threads.",
    keyIdea: "Threads parallelise waiting; processes parallelise computing.",
  },
  "race-conditions": {
    canDo: "Spot a read-modify-write race, and fix it with an atomic operation, a lock or by not sharing state.",
    why: "Races are the bugs that appear only under load. Naming the interleaving is the skill.",
    keyIdea: "A read that updates is a write.",
  },
  "locks-deadlocks": {
    canDo: "Explain deadlock as a cycle of waiting, and break it with lock ordering, admission limits or timeouts.",
    why: "Deadlocks stall a service at zero CPU. Knowing the four conditions gives you the fix.",
    keyIdea: "Break one link of the cycle.",
  },
  "oop-solid": {
    canDo: "Apply the SOLID principles to a tangled class and say what each one buys and costs.",
    why: "Interviewers want to see structure that makes change cheap, and judgement about when not to add it.",
    keyIdea: "Abstract where the change is.",
  },
  "design-patterns": {
    canDo: "Match strategy, observer, factory and decorator to the problems they solve, and avoid patterns that do not fit.",
    why: "A pattern is a name for a problem. Using the right name is half of a design discussion.",
    keyIdea: "Use a pattern when you have the problem.",
  },
  "lld-lru-cache": {
    canDo: "Build an LRU cache with constant-time operations from a hash map and a linked list, and make it safe for threads.",
    why: "The LRU cache is the most common machine-coding question. The follow-up is always concurrency.",
    keyIdea: "A read that updates recency is a write.",
  },
  "lld-parking-lot": {
    canDo: "Design a parking lot with efficient allocation, extensible vehicle and pricing models, and atomic claims.",
    why: "A classic design round. The signal is allocation structure and concurrency, not the class list.",
    keyIdea: "Don't search for free spots. Keep a list of them.",
  },
  "lld-splitwise": {
    canDo: "Model shared expenses with split strategies and integer cents, and settle a group in at most N−1 payments.",
    why: "Splitwise tests money handling and a graph reduction in one problem.",
    keyIdea: "Settle balances, not bills.",
  },
  "lld-elevator": {
    canDo: "Design an elevator with a state machine and a scheduler, and compare FCFS, nearest-first and LOOK on mean and worst-case wait.",
    why: "Scheduling trade-offs are the heart of this question. The tail matters more than the mean.",
    keyIdea: "People remember the worst wait.",
  },
  "lld-rate-limiter-class": {
    canDo: "Write a rate limiter class with a small interface, an injected clock, atomic updates and bounded memory.",
    why: "Rate limiting is asked as both a system and a class design. This is the class version.",
    keyIdea: "Time is a dependency.",
  },
  "case-url-shortener": {
    canDo: "Size a read-heavy service from its numbers, choose the store, cache and ID scheme, and defend 301 versus 302.",
    why: "The URL shortener is the interview warm-up. The signal is estimating first and designing the read path second.",
    keyIdea: "Estimate first; the read path decides the design.",
  },
  "case-kv-store": {
    canDo: "Design a distributed key-value store: consistent hashing, replication with quorums, and an LSM engine, with the cost of each.",
    why: "KV stores are the textbook for placement, replication and consistency. Each choice has a number behind it.",
    keyIdea: "Placement, replication and engine each answer a different question.",
  },
  "case-payment-system": {
    canDo: "Design payments that charge once, lose nothing and stay auditable: idempotency keys, an outbox, isolation and a ledger.",
    why: "Payments test whether you know what 'exactly once' costs. Each guarantee has its own mechanism.",
    keyIdea: "Money moves once and leaves a trail.",
  },
  "case-ticket-booking": {
    canDo: "Prevent double booking under a rush with atomic claims, short holds and a waiting room.",
    why: "Seat contention is hot-row contention in disguise. The answer is atomic claims and metered demand.",
    keyIdea: "Make the claim atomic and meter the crowd.",
  },
  "case-notification-system": {
    canDo: "Absorb a blast above the provider's rate with a queue, keyed retries, a dead-letter queue and per-user limits.",
    why: "Notifications combine queues, retries and idempotency. The trade-off is loss, duplicates, delay and spam.",
    keyIdea: "Turn the provider's rate limit into delay, not loss.",
  },
  "case-news-feed": {
    canDo: "Choose fan-out on write, read or a hybrid from the follower distribution, and cache feeds.",
    why: "The feed is the classic skew problem: a few accounts carry most of the work.",
    keyIdea: "Push for the many, pull for the few.",
  },
  "case-web-crawler": {
    canDo: "Design a polite, fast crawler: a per-host frontier, politeness as a throughput cap, a Bloom filter and a DNS cache.",
    why: "A crawler is politeness plus scale. The memory for ten billion URLs is its own question.",
    keyIdea: "Politeness is a throughput cap.",
  },
  "case-rate-limiter": {
    canDo: "Design a limiter shared by many instances: central counts with periodic sync, and a defined failure mode.",
    why: "Rate limiters are asked as systems and as classes. The failure mode is the part people forget.",
    keyIdea: "Decide what happens when the shared state is gone.",
  },
  "case-chat": {
    canDo: "Design chat with persistent connections, acknowledged delivery with dedup, presence on demand and sharded history.",
    why: "Chat packs connections, delivery guarantees, storage and presence into one question.",
    keyIdea: "The green dot is the expensive part.",
  },
  "case-autocomplete": {
    canDo: "Serve prefix lookups in milliseconds by precomputing top completions in a trie, with a refresh policy.",
    why: "Autocomplete is a latency budget. Moving ranking from query time to build time is the idea.",
    keyIdea: "Compute the answer before anyone asks.",
  },
  "case-ride-hailing": {
    canDo: "Design dispatch: an adaptive spatial index, an update interval chosen by position error, and batch matching.",
    why: "Ride hailing blends geospatial indexing, a write firehose and an assignment decision.",
    keyIdea: "Batch the decision; adapt the index.",
  },
  "case-video-pipeline": {
    canDo: "Design a video pipeline: resumable uploads, parallel segment encodes, a right-sized ladder, a CDN and storage tiers.",
    why: "Video shows how each stage of a pipeline has its own bottleneck and its own bill.",
    keyIdea: "Delivery is the bill; parallelism is the speed.",
  },
  "case-chat-service": {
    canDo: "Control chat cost: full history with prompt caching, streaming, token budgets and routing for chatty turns.",
    why: "Chat is where per-turn input growth bites. Interviewers want caching, history policy and abuse control.",
    keyIdea: "Every turn resends the conversation.",
  },
  "case-legal-rag": {
    canDo: "Design retrieval for confidential multi-tenant documents: hybrid search, reranking, isolation in the index and quantized vectors.",
    why: "Legal RAG makes tenant isolation as important as recall. Isolation belongs in the structure, not a filter.",
    keyIdea: "Put the boundary in the index.",
  },
  "case-coding-agent": {
    canDo: "Design a coding agent that finishes tasks, costs little and cannot do much damage: a test loop, a microVM and an allowlist.",
    why: "Capability and safety are one design. The environment, not the prompt, bounds the damage.",
    keyIdea: "The environment holds the line.",
  },
  "case-llm-gateway": {
    canDo: "Design the gateway every AI feature uses: cascade routing, a verified cache, failover, safe retries, budgets and async logs.",
    why: "A gateway has to be cheaper than what it saves and must not become the next outage.",
    keyIdea: "The door must not become the outage.",
  },
  "case-support-agent": {
    canDo: "Choose an escalation threshold with retrieval, a policy check and sampled review, trading wrong answers against human hours.",
    why: "Human escalation is a threshold, and every point moves work between customers and people.",
    keyIdea: "The threshold trades customers against queues.",
  },
  "case-doc-pipeline": {
    canDo: "Design an extraction pipeline with a queue, schema-constrained output, validation and a dead-letter queue.",
    why: "Document pipelines fail by surge, by poison documents and by quiet inaccuracy. Each has its own control.",
    keyIdea: "Give every failure somewhere to go.",
  },
  "prod-state-fanout": {
    canDo: "Keep a fan-out to many services alive when a few are slow, with bulkheads, short timeouts, capped retries, load shedding and partial answers.",
    why: "Fan-outs fail together through the one thing they share. Spotting the shared pool and the multiplying retries is the core of resilience design.",
    keyIdea: "A shared pool turns a slow few into a dead many.",
  },
  "prod-pg-job-queue": {
    canDo: "Make a Postgres job queue safe in production with leases, idempotent handlers, attempt limits, dead letters and a table that stays small.",
    why: "A queue that claims correctly can still lose jobs, loop on bad ones and bloat. These are the failures that page you in the second month.",
    keyIdea: "Every claim needs an expiry, and every retry a limit.",
  },
  "capstone-legal-search": {
    canDo: "Design a national-scale search service end to end: resilient ingest, firm isolation, hybrid retrieval and a controlled answer bill.",
    why: "Real systems are all the earlier chapters at once, with a contract and a budget. Choosing which idea applies, without being told, is the skill.",
    keyIdea: "Every setting is a lesson you already paid for.",
  },
};

export interface ChapterLearning {
  /** The story of the chapter in one line. */
  story: string;
  /** What you'll be able to do by the end. */
  outcomes: string[];
  /** Why this chapter comes where it does, and why it matters. */
  why: string;
  /** Concrete payoff: interviews and work. */
  payoff: string;
}

export const CHAPTER_LEARNING: Record<string, ChapterLearning> = {
  a1: {
    story: "Pigeon goes from one server to surviving a Product Hunt launch.",
    outcomes: [
      "Estimate latency and find the slow step",
      "Size workers and pools with Little's Law",
      "Keep headroom, and know why 90% busy feels like an outage",
      "Scale out behind a balancer that routes around failure",
      "Make servers stateless so any box can serve anyone",
    ],
    why: "These are the fundamentals every system design interview assumes, and the root cause of most incidents at small and medium scale. Everything later in the Core Grid builds on them.",
    payoff: "In an interview you can size a service from traffic and latency and defend losing a box. At work you'll recognise pool exhaustion and bad routing in your own Django and Postgres stack.",
  },
  a2: {
    story: "Pigeon trends on social media and every cushion you thought you had turns out to be thin.",
    outcomes: [
      "Explain why a page that fans out has a worse tail than any one call",
      "Estimate traffic, storage, and cache memory from a user count",
      "Budget database connections before autoscaling multiplies them",
      "Plan for autoscaling lag with headroom and warm capacity",
    ],
    why: "Growth turns small effects into outages: tails compound, pools multiply, and automation arrives late. This chapter teaches the arithmetic that predicts each one before it pages you.",
    payoff: "In an interview you can size a service from users and name the first thing that breaks. At work you will recognise 'too many clients' and the three-minute autoscaling gap on sight.",
  },
  b1: {
    story: "Pigeon ships an AI copilot and learns what the model actually sees, and what it costs.",
    outcomes: ["Count and price tokens, and know why languages and formats differ", "Design context: keep, pin, summarise, retrieve", "Cut an LLM bill with trimming, caching, and routing"],
    why: "Every AI-engineering role starts here: the cost, speed, and memory of an LLM feature are all decided by what goes into the context window. It has no prerequisites, so you can start it on day one.",
    payoff: "You'll be able to estimate and defend the cost of an LLM feature, design its memory, and answer the cost and context questions AI-engineering interviews lean on.",
  },
  a3: {
    story: "Pigeon launches in Jakarta and Frankfurt, and learns that the server was never the slow part.",
    outcomes: ["Trace a lookup through DNS caches and pick a TTL", "Count the round trips in TCP, TLS, and HTTP, and cut them", "Explain why a reverse proxy frees application workers", "Predict a CDN's hit ratio and choose between DNS and anycast routing"],
    why: "For users far away, the network path costs more than the code. This chapter turns that path into numbers you can reason about, so you know which trip to remove first.",
    payoff: "In an interview you can walk a request from thumb to server and say where the time goes. At work you will read a network waterfall and know which step to fix.",
  },
  a4: {
    story: "A celebrity discovers Pigeon, and the cache layer you built for ordinary days meets a very uneven internet.",
    outcomes: ["Size a cache from skewed traffic and read its hit ratio", "Choose eviction and write policies by access pattern", "Keep caches fresh with TTLs and invalidation", "Stop stampedes and spread hot keys"],
    why: "Most of the internet's read traffic is skewed, so caching is the cheapest scaling lever. It is also where subtle bugs live: stale data, stampedes, and hot keys. This chapter turns each into a number.",
    payoff: "In an interview you can add a cache to any design and say how you would size it, keep it fresh, and stop it falling over. At work you will read a hit-ratio graph and know what is behind it.",
  },
  a5: {
    story: "Pigeon's Postgres starts to sweat, and every shortcut taken earlier shows up in the query log.",
    outcomes: ["Choose indexes and read EXPLAIN plans", "Decide when to join, copy, or cache a column", "Use transactions and isolation levels to prevent races", "Explain MVCC, vacuum, and bloat; compare B-trees and LSM trees; know when Postgres is enough"],
    why: "The database is where most systems finally hit their limits, and where mistakes are hardest to undo. This chapter turns indexes, transactions, and storage into numbers you can reason about.",
    payoff: "In an interview you can design a schema, name the index, and say what isolation level a booking needs. At work you will read a slow-query log and know where to look.",
  },
  b2: {
    story: "The demo goes well. Then Pigeon Copilot meets real users, real traffic, and a real invoice.",
    outcomes: ["Control sampling for stable or creative output", "Layer defences against hallucination", "Separate time to first token from output speed", "Estimate and cut an LLM bill"],
    why: "Everything that goes wrong after a demo is a behaviour of the model under real conditions: variation, fabrication, delay, and cost. This chapter makes each of those a number you can reason about.",
    payoff: "You can explain why outputs vary, how to keep a bot honest, why a response feels slow, and what a feature will cost, which are the first questions in an AI-engineering interview.",
  },
  b3: {
    story: "Prompts become production code, and Pigeon learns that wording tweaks can break things quietly.",
    outcomes: ["Write system prompts as explicit, testable rules", "Structure long prompts and choose examples", "Spend reasoning tokens where they pay", "Enforce output schemas, cache prefixes, and gate prompt releases"],
    why: "Once a prompt is in production it needs the discipline of any other code: a spec, a layout, a contract for its output, a cost model, and a release gate. This chapter gives each one a number.",
    payoff: "You can describe how you would build and ship a prompt like an engineer, with the numbers to back each choice, which is the core of an AI-engineering interview.",
  },
  b4: {
    story: "Copilot has to answer from Pigeon's own documents, and retrieval turns out to be the hard part.",
    outcomes: ["Explain embeddings and cosine similarity, and where they fail", "Combine keyword and vector search with rank fusion", "Chunk, filter, and index documents for retrieval at scale", "Rerank candidates and measure retrieval with recall, MRR, and nDCG"],
    why: "A RAG system is only as good as what it retrieves. This chapter takes retrieval apart: how text becomes vectors, how results are found, fused, filtered, and reranked, and how to measure all of it.",
    payoff: "You can design and defend a retrieval pipeline in an interview, with the numbers for each stage, and you will know which metric to look at when a RAG system gives wrong answers.",
  },
  a6: {
    story: "Pigeon's primary database becomes the single point everyone depends on, and the team starts making copies.",
    outcomes: ["Scale reads with replicas and know why writes do not scale", "Choose commit rules by what data you can afford to lose", "Prevent stale reads and split brain", "Use quorums and know their limits"],
    why: "Copies are how databases survive failures and serve more reads, and each copy brings a new way to be wrong: lag, loss, conflict, and split brain. This chapter puts a number on each.",
    payoff: "In an interview you can design replication for a service and state, for each failure, what is lost and for how long. At work you will read a failover postmortem and know which setting mattered.",
  },
  a7: {
    story: "Pigeon's data no longer fits on one machine, and the team has to decide which rows live where.",
    outcomes: ["Choose a sharding scheme and shard key from the access paths", "Recognise and relieve hot keys", "Add nodes with a consistent hashing ring and virtual nodes", "Estimate and throttle a rebalance"],
    why: "Splitting data is the first step that cannot be undone cheaply. The key you choose decides what is fast, what fans out, and where the hot spots appear.",
    payoff: "In an interview you can shard a table, justify the key, and say what happens when a node is added or a celebrity appears. At work you will spot a hot partition from a graph.",
  },
  a8: {
    story: "Pigeon now depends on many services, and the team learns what happens when each of them is slow, wrong or gone.",
    outcomes: ["Set timeouts, retries and breakers that contain failures instead of spreading them", "Make operations safe to repeat", "Choose consistency and ordering guarantees for a given kind of data", "Coordinate across services without distributed locks that lie"],
    why: "Failure in a distributed system is partial, slow and ambiguous. Each tool in this chapter closes one gap, and each also opens another if used carelessly.",
    payoff: "In an interview you can walk a request through its failures and say what contains each. At work you will read an outage review and see which of these was missing.",
  },
  a9: {
    story: "Pigeon starts moving work between services instead of waiting on it, and the team learns what queues really promise.",
    outcomes: ["Choose between queues and logs and size them", "Reason about delivery guarantees, duplicates and poison messages", "Handle overload with bounded queues and backpressure", "Decide when events, CQRS or event sourcing are worth their cost"],
    why: "Messaging decouples services and moves failure around rather than removing it. Each guarantee has a cost, and each missing guarantee shows up as a customer-visible bug.",
    payoff: "In an interview you can pick a broker, state its delivery guarantee, and say what happens under overload. At work you will know why a queue is growing before the pager does.",
  },
  a10: {
    story: "Pigeon opens up to partners and apps, and the team discovers how an API is a promise.",
    outcomes: ["Choose an API style by caller and network", "Paginate and rate limit without surprises", "Make requests safe to retry and changes safe to ship", "Push events to clients and partners reliably and securely"],
    why: "An API is read by code you did not write and cannot update. Every shortcut shows up later as someone else's outage.",
    payoff: "In an interview you can design an API and defend each choice. At work you will review one and know which promises it makes.",
  },
  a11: {
    story: "Pigeon becomes a service people depend on, and the team learns to run it: measure it, ship it carefully, and survive its worst day.",
    outcomes: ["Set SLOs and alerts that mean something", "Release changes with a small blast radius", "Degrade gracefully instead of failing", "Plan recovery and multi-region with numbers"],
    why: "Running a system is a different skill from building it. Each practice here converts a vague worry into a number you can act on.",
    payoff: "In an interview you can describe how you would measure, release and recover a service. At work you will recognise which of these your team is missing.",
  },
  a12: {
    story: "Pigeon holds other people's data, and the team learns what it takes to deserve that.",
    outcomes: ["Separate who you are from what you may do", "Choose session and OAuth designs that can be revoked and cannot be intercepted", "Spend security effort where the risk is", "Limit the damage when something leaks"],
    why: "Security failures are rarely clever. They are a forgotten check, a long-lived key or a rule that depended on everyone being careful. Each tool here removes one such dependency.",
    payoff: "In an interview you can design sign-in, access control and secrets handling and say how each fails. At work you will review a change and know which check it skipped.",
  },
  a13: {
    story: "Pigeon's data stops looking like rows, and the team meets stores built for files, words, places and time.",
    outcomes: ["Store and serve files cheaply with object storage", "Search text with inverted indexes", "Find nearby things with cell indexes", "Keep metrics affordable with compression and rollups"],
    why: "A general database can hold anything and does nothing well at scale. Each store here exploits the shape of one kind of data.",
    payoff: "In an interview you can match a data shape to its store and give the numbers. At work you will know when Postgres has stopped being the right answer.",
  },
  b5: {
    story: "Pigeon's prompts start changing weekly, and the team needs to know whether each change helped.",
    outcomes: ["Build eval sets that can be trusted", "Choose graders and judges and measure their errors", "Gate prompt changes without crying wolf", "Test on real traffic without hurting real users"],
    why: "Without evals, prompt work is opinion. Each tool here removes a way to fool yourself.",
    payoff: "In an interview you can describe how you would know a prompt change is safe to ship. At work you will argue from a measured gate instead of three examples.",
  },
  b6: {
    story: "Pigeon's assistant starts taking actions, not just writing answers, and the team learns what that costs.",
    outcomes: ["Design tools and loops that work and stay bounded", "Plan, remember and verify across long tasks", "Put people where mistakes cannot be undone", "Choose between workflows, agents and teams of agents"],
    why: "An agent is a model with permission to act. Every capability here comes with a way to fail, and each safeguard removes one.",
    payoff: "In an interview you can design an agent and say how it fails and what bounds it. At work you will review an agent design for loops, scope and cost.",
  },
  b7: {
    story: "The assistant needs to reach the company's systems without a custom connector for each one.",
    outcomes: ["Explain what MCP standardises", "Pick a transport and secure it", "Map capabilities to tools, resources and prompts", "Build a server a model can use well"],
    why: "A model is only as useful as what it can reach. A shared protocol makes that reach cheap to build, and context cost is the price.",
    payoff: "In an interview you can explain MCP and design a server. At work you will decide which servers to connect and which to write.",
  },
  b8: {
    story: "The team starts using a coding agent on the codebase and learns that the quality of the work depends on how it is directed.",
    outcomes: ["Explain how a coding agent uses its context", "Keep long sessions lean with subagents", "Brief an agent so changes are small and verifiable"],
    why: "A coding agent is the agent loop with a code editor. Its limits are the context window and the quality of the brief.",
    payoff: "In an interview you can describe how you work with coding agents. At work you will get better changes in fewer rounds.",
  },
  b9: {
    story: "Pigeon's assistant becomes a product with a bill, an uptime target and a security review.",
    outcomes: ["Put a gateway between teams and providers", "Route, cache and cap to control cost", "Retry, stream and trace without making incidents", "Keep bad inputs, bad outputs and personal data in check"],
    why: "A prototype calls a model. A product runs it for thousands of users, which makes cost, limits, speed, visibility and safety all engineering problems.",
    payoff: "In an interview you can design the infrastructure around a model. At work you will find where the money, the 429s and the unseen failures are.",
  },
  b10: {
    story: "A security review of the assistant finds that anyone who can write text it reads can steer it.",
    outcomes: ["Explain direct and indirect prompt injection", "Estimate exposure from retrieval", "Close the channels data can leave through", "Scope tools and credentials to cap the worst case"],
    why: "A model follows text, and text comes from strangers. Security here means limiting what a fooled model can reach, not trusting it to resist.",
    payoff: "In an interview you can threat-model an agent. At work you will review an agent's tools and credentials for blast radius.",
  },
  b11: {
    story: "The team asks whether to fine-tune a model, and whether it could run on their own hardware.",
    outcomes: ["Pick between prompting, retrieval and fine-tuning", "Tune a model cheaply with adapters", "Shrink a model with quantization", "Fit a model and its context on a small GPU"],
    why: "Prompting is not the only way to change what a model does. Each alternative has a price in effort, memory and quality.",
    payoff: "In an interview you can say when you would fine-tune and how you would serve it. At work you will size a model for the hardware you have.",
  },
  c1: {
    story: "The team moves its services into containers and meets everything containers do not do for them.",
    outcomes: ["Explain what a container is and is not", "Build small images and fast builds", "Keep data and networks right", "Run on Kubernetes with probes, limits and autoscaling"],
    why: "Containers and Kubernetes are the default way to ship software. Most of their problems come from assuming they do more than they do.",
    payoff: "In an interview you can explain containers and an orchestrator from first principles. At work you will review a Dockerfile and a manifest for the mistakes that cause outages.",
  },
  c2: {
    story: "A server that worked in testing starts dying at night, and the team has to learn what the operating system is doing.",
    outcomes: ["Explain signals, memory limits and descriptor limits", "Write a restart policy that heals without looping", "Keep evidence that survives a reboot", "Recognise a CPU throttle on a burstable instance"],
    why: "Production problems are usually the operating system doing what it was designed to do. Knowing the defaults is half of every diagnosis.",
    payoff: "In an interview you can walk through why a process died. At work you will read a kernel log and know what you are looking at.",
  },
  c3: {
    story: "A teammate deletes a branch, a rebase goes wrong, and the team learns what Git actually stores.",
    outcomes: ["Explain commits, branches and reachability", "Choose between merge, rebase and squash", "Pick the right reset and move a single fix", "Recover work that seems lost"],
    why: "Git is a database of snapshots with names on top. Once you see the shape, almost every mistake is recoverable and every workflow debate has a clear trade-off.",
    payoff: "In an interview you can explain Git's model and its rules of thumb. At work you will fix a bad rebase calmly.",
  },
  c4: {
    story: "Deploys are slow, environments differ, and nobody trusts the pipeline.",
    outcomes: ["Design a fast, trusted CI pipeline", "Describe infrastructure in reviewed code", "Detect and fix drift"],
    why: "Shipping is a loop of change, check and release. Making the loop fast and repeatable is most of what DevOps means.",
    payoff: "In an interview you can design a pipeline and an infrastructure workflow. At work you will make both faster and safer.",
  },
  c5: {
    story: "The service handles load well in testing and then stalls, miscounts or deadlocks in production.",
    outcomes: ["Choose a concurrency model for a workload", "Know what the GIL does and does not limit", "Find and fix a race", "Prevent a deadlock"],
    why: "Concurrency bugs depend on timing, so they hide until load finds them. A few rules turn them into design decisions.",
    payoff: "In an interview you can reason about threads, locks and event loops. At work you will recognise a race or a deadlock from the symptoms.",
  },
  c6: {
    story: "The team's code works and every change is slow and risky. They practise designing classes that change cheaply.",
    outcomes: ["Apply SOLID with judgement", "Match patterns to problems", "Design the classic machine-coding problems", "Reason about complexity, concurrency and memory in a class"],
    why: "Low-level design is about confining change. Every classic problem teaches a data structure choice, a concurrency question and an extension point.",
    payoff: "In an interview you can design the usual machine-coding problems and defend the trade-offs. At work your classes will be easier to change and to test.",
  },
  d1: {
    story: "The team has run the drills and now meets real outages, the kind that arrive with a vague page and three plausible causes.",
    outcomes: ["Find the endpoint behind a traffic jump and size it", "Recognise a burstable instance out of CPU credits", "Trace an expired certificate to a broken renewal", "Design and run the production versions of fan-out and job queues"],
    why: "The last mile is judgement under noise: logs that mislead, fixes that feel productive and are not, and causes that sit several steps back from the symptom.",
    payoff: "In an interview you can walk through a production incident from page to postmortem. At work you will know what to check first and what not to touch.",
  },
  b12: {
    story: "Pigeon's AI features are in production, and the team rehearses the design questions an interviewer would ask about them.",
    outcomes: ["Design a chat service, a gateway and a coding agent with their costs", "Keep confidential documents apart in a shared search", "Choose an escalation threshold with data", "Build a document pipeline that survives a surge"],
    why: "The AI interview cases combine every earlier chapter into a design with a bill, an error rate and a risk. Each lab shows the trade-off with numbers.",
    payoff: "In an interview you can design an AI system and defend its cost and failure modes. At work you will review one with the same questions.",
  },
};

export type SectionId = "campaign" | "foundry" | "shift" | "incident" | "codex" | "boss";

export interface SectionLearning {
  name: string;
  /** What you do here, in one line. */
  does: string;
  /** What it trains. */
  trains: string;
  /** The learning reason this mode exists. */
  because: string;
}

export const SECTION_LEARNING: Record<SectionId, SectionLearning> = {
  campaign: {
    name: "Core Grid",
    does: "Learn one new idea per mission, by breaking a simulated system.",
    trains: "Understanding: why systems behave the way they do.",
    because: "You predict what will happen before you see it. A wrong guess you've committed to is the moment learning sticks best, so every mission starts with one.",
  },
  foundry: {
    name: "Agent Foundry",
    does: "The AI-engineering track: the same missions, for LLM systems.",
    trains: "Building with models: tokens, context, cost, and later retrieval and agents.",
    because: "It runs alongside the Core Grid and borrows from it where production AI needs real systems thinking: queues, caching, rate limits.",
  },
  shift: {
    name: "Daily Shift",
    does: "A short daily round: reviews, a micro-challenge, and an estimation drill.",
    trains: "Memory: keeping what you learned.",
    because: "Each review is scheduled just before you'd forget (spaced repetition), and pulling an answer from memory strengthens it far more than rereading. Services you don't review start to rust on the map.",
  },
  incident: {
    name: "Incident Room",
    does: "Take a live page on the simulation: find the cause, stop the bleeding, write the postmortem.",
    trains: "Transfer: using ideas when nobody tells you which one applies.",
    because: "Knowing Little's Law and spotting it in a log line at 2 a.m. are different skills. Incidents practise the second.",
  },
  codex: {
    name: "Codex",
    does: "Cards you earn by building concepts: key numbers, trade-offs, AWS mapping, and the interview angle.",
    trains: "Recall and interview prep.",
    because: "A compact reference you built yourself is the best thing to skim the night before an interview.",
  },
  boss: {
    name: "Boss fights",
    does: "End-of-chapter challenges that mix every idea in the chapter, with your own forecast scored.",
    trains: "Judgement: combining ideas, and knowing how sure you are.",
    because: "Mixing topics (interleaving) is harder in the moment and better for the long run, and scoring your forecast trains calibration.",
  },
};

/** The mission loop, step by step, with the reason each step exists. Used on the "How NINES teaches" page. */
export const LOOP: { step: string; what: string; why: string }[] = [
  { step: "Hook", what: "A real problem lands: a page, a complaint, a bill.", why: "Ideas stick when they arrive as the answer to a problem you already care about." },
  { step: "Predict", what: "You commit to what will happen, and how sure you are.", why: "Committing to a guess, then seeing the truth, is one of the strongest ways to learn. Your confidence is tracked so you learn how calibrated you are." },
  { step: "Play", what: "You make it happen in a live simulation.", why: "Seeing the system behave beats being told how it behaves." },
  { step: "Why", what: "The mechanism, in a few short captions, played on the simulation.", why: "Short explanations right after a surprise land better than long ones before it." },
  { step: "Challenge", what: "Use the idea to hit a target under constraints.", why: "Applying an idea is where understanding becomes skill." },
  { step: "Explain", what: "Say it back in two or three sentences.", why: "Putting an idea into your own words exposes the gaps; the AI coach grades it against a rubric." },
  { step: "Review", what: "The concept joins your Daily Shift and comes back on a schedule.", why: "Spaced retrieval is what makes it last for months instead of days." },
];

export function conceptLearning(id: string): ConceptLearning | undefined {
  return CONCEPT_LEARNING[id];
}

/** Concepts that list this one as a prerequisite: "where this comes back". */
export function buildsInto(id: string): PlannedNode[] {
  return GRAPH.filter((n) => n.prereqs.includes(id));
}

/** Titles of the next few concepts this one unlocks, nearest chapters first. */
export function comesBackIn(id: string, max = 4): string[] {
  const self = NODE_BY_ID.get(id);
  return buildsInto(id)
    .sort((a, b) => Number(a.chapter !== self?.chapter) - Number(b.chapter !== self?.chapter))
    .slice(0, max)
    .map((n) => n.title.replace(/^(Boss|Case|INC-\d+|INC|Field): /, ""));
}
