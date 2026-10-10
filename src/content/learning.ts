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
