# NINES: Build Brief

You are building **NINES**, a game that teaches system design, AI engineering, and modern dev fundamentals. Take your time, plan properly, and hold a very high bar. This is a long-horizon project spanning many sessions. Section 12 explains how to keep continuity between them.

---

## 1. Why this exists

I'm Bhagath, a 2026 CS grad in Hyderabad, job-hunting for SDE and AI engineer roles. I've tried learning from dense reference "consoles" (well-designed HTML notes). They looked great and I learned almost nothing, because reading isn't how I learn. I learn when I'm doing something: making a call, watching it blow up, and fixing it. The best feelings I know in engineering are a feature finally working after trial and error, and tracking a bug down through logs. Build around those feelings.

The goal is something I open because I want to, not because I should, and that leaves me able to:
- crush system design, LLD, and AI engineering interviews
- design and build production AI systems and agents with confidence

**If a screen could be replaced by a PDF, it has failed.**

---

## 2. Who's playing (calibrate difficulty to this)

- Production stack: Python, Django/DRF, PostgreSQL (+pgvector), Redis, AWS (EC2, RDS, S3, SQS, Lambda, EventBridge), Nginx/gunicorn/systemd, GitHub Actions. Java only for DSA. Roughly 250 LeetCode problems.
- I built and run **Case Intel** (caseintel.in), a multi-tenant legal case management + RAG platform for advocates in India: hybrid pgvector + tsvector search with RRF, HyDE, sentence-aware chunking, a cross-encoder reranker, a LangGraph pipeline, a Postgres-backed job queue, and eCourts scraping that fans out across districts.
- I learned most of that by shipping, so there are real conceptual gaps under things I've used. Don't treat me as a beginner. Rebuild foundations fast, then go deep.
- Known weak spots: Docker/containers (I don't understand it), frontend, formal distributed-systems theory, and the "why" behind patterns I copied.
- Time: 1 to 2 hours a day, 2 to 3 on Sundays. Everything must work in 15 to 25 minute sessions. I'll play on laptop and phone.

---

## 3. The learning engine (non-negotiable)

Every concept runs through this loop. Not every screen needs every step, but every concept must go through the whole loop.

1. **Hook.** A concrete problem or incident in under 30 seconds. Pager goes off, a graph spikes, a user complains. Never open with a definition.
2. **Predict.** Before I touch anything, I commit to a prediction (what happens to p99 if traffic doubles? which requests fail?) and a confidence level. Confidently wrong predictions are the most valuable moments. Make those reveals land.
3. **Play.** I manipulate a live simulation or build something: sliders, drag-and-drop, wiring, choosing.
4. **Reveal the mechanism.** An animated explanation of *why* it happened. Captions, not paragraphs. Hard cap of 60 words per explanation card, enforced by a content lint.
5. **Challenge.** A constrained problem (hit an SLO within a budget, survive a traffic event) with no hand-holding. Failure is fun and informative: replay it in slow motion with the cause highlighted.
6. **Explain it back.** Occasionally I type a 2 to 3 sentence explanation and Claude grades it against a rubric, naming the exact gap (a Feynman check). Also throw random "why?" follow-ups after correct answers so guessing never pays.
7. **Spaced retrieval.** The concept enters a review queue scheduled with FSRS (use `ts-fsrs`). Reviews are micro-scenarios, not flashcards: "Your write-heavy service takes 50k writes/s and…". Vary formats: pick the fix, spot the flaw in an architecture diagram, estimate a number, order the steps, predict the graph.
8. **Transfer.** The concept reappears, unnamed, inside bigger problems, boss fights, incidents, and interviews.

Other rules:
- Mastery is earned from performance (correct, confident, reasonably fast, across spaced intervals), never from viewing content.
- For anything procedural (estimation, interview flow, building an agent): worked example, then faded example, then solo.
- Interleave topics in boss fights and reviews.
- **Depth on demand.** The default view is minimal. I can always tap "go deeper" for the real math, mechanics, edge cases, and sources. Never force it on me.
- Numbers must be realistic (latency tables, Postgres/Redis throughput on typical hardware, token costs). Where the simulation simplifies, say so in an "Honest physics" note reachable from the sim.

---

## 4. The game

### Fiction
I'm the first backend engineer at a startup. The product grows from 10 users to 100M, and later turns into an AI company. Each chapter is a growth stage whose incidents force the next concept. A small recurring cast adds personality in one or two lines at a time: a dry, sardonic principal SRE mentor; a founder who promises impossible launch dates; a cost-obsessed CFO who appears when my cloud bill spikes. Witty and understated, never cringe.

### Rank = nines
Progression is measured in nines of availability: One Nine (90%) → Two Nines → Three Nines → Four Nines → Five Nines, with sub-tiers. XP feeds rank, but each rank gate also requires beating a boss fight that proves mastery. My current uptime is the big number on the HQ screen.

### Knowledge decay as tech debt
Every mastered concept is a building or component on my **infrastructure map**, the home screen and a living picture of what I know. As a concept's FSRS retrievability drops, its building visibly degrades: flickering lights, rust, error sparks, eventually a small incident badge. Reviewing repairs it with a satisfying animation. This is the main pull back into daily reviews. No guilt-trip copy.

### Modes
1. **Campaign.** Chapters from the curriculum. Each chapter has 4 to 8 concept missions and a boss incident.
2. **Daily Shift (10 to 15 min).** Review queue, one new micro-challenge, one estimation drill. Streak with freeze tokens, never punishing.
3. **Sandbox / Architect.** Free-build canvas with the full component palette and the live simulation. Traffic presets: steady, diurnal, viral spike, Black Friday, DDoS, region outage, slow dependency, bad deploy. A Chaos Monkey button. Shows p50/p95/p99, throughput, error rate, availability, and monthly cost. Save and reload designs.
4. **Incident Room.** On-call scenarios. A pager alert, dashboards (latency, errors, saturation), searchable logs, and traces. I investigate, form a hypothesis, apply a mitigation, then write a three-line postmortem. Scored on time-to-mitigate and correct root cause. This is my favourite kind of problem, so make it rich.
5. **Agent Foundry (AI Lab).** The AI engineering track, built around hands-on labs (see Track B and section 6).
6. **Interview Arena.** Mock system design interviews with a Claude-powered interviewer who asks clarifying questions and pushes back. 45-minute clock plus a 20-minute speed variant. The whiteboard is the same architecture canvas. Rubric debrief covering requirements, estimation, API, data model, high-level design, deep dives, tradeoffs, and communication. Also LLD/machine-coding rounds and quick estimation duels.
7. **Field Missions.** Real build quests I do outside the app, e.g. "build a Telegram bot that summarizes links with Claude", "write an MCP server", "containerize Case Intel's backend". Each has a goal, acceptance criteria, progressive hints (hints cost XP), and a verification step where I paste output, logs, or a repo link and Claude checks it against the criteria. Big XP.
8. **Codex.** Reference material exists here only as collectible cards unlocked by playing. Each card: one-line definition, the replayable animation from its mission, key numbers, tradeoffs, where I've seen it, the interview angle, sources. Searchable. The only note-like place in the app, and entry is earned.

---

## 5. Curriculum

Plan the full content map in `CONTENT_PLAN.md` as a **prerequisite graph**. The campaign map unlocks by prerequisites, not strict linear order. Cover at least the following, add what's missing, and order it well.

### Track A: System design (the campaign spine)
- **Fundamentals:** latency numbers (time-scaled: "if an L1 cache hit took one second…"), throughput vs latency, Little's Law, queueing and why latency explodes past roughly 70 to 80% utilization, tail latency and fan-out amplification, back-of-envelope estimation (QPS, storage, bandwidth, memory).
- **Networking path:** DNS, TCP/UDP, TLS handshake, HTTP/1.1 vs 2 vs 3, keep-alive, CDNs, anycast. A "follow one request end to end" journey.
- **Scaling:** vertical vs horizontal, stateless services, load balancers (L4/L7, algorithms, health checks), autoscaling and its lag, connection pooling.
- **Caching:** cache-aside, write-through, write-back, TTLs, LRU/LFU, Zipfian access, hit-ratio math, stampedes, hot keys, invalidation, CDN caching.
- **Databases:** indexes (animated B-tree), query plans, normalization vs denormalization, transactions, isolation levels (animated anomalies: dirty read, non-repeatable read, lost update, write skew), MVCC, SQL vs NoSQL families, LSM vs B-tree, when Postgres is enough.
- **Replication and partitioning:** leader-follower, multi-leader, leaderless, sync vs async, replication-lag anomalies (read-your-writes, monotonic reads), quorums (R+W>N), sharding strategies, shard keys, hot partitions / celebrity problem, consistent hashing with virtual nodes, rebalancing.
- **Distributed systems:** CAP and PACELC (play a partition), consistency models, clocks and ordering, idempotency, retries with exponential backoff and jitter, timeouts, circuit breakers, bulkheads, leader election and consensus (Raft visualized), distributed locks and their pitfalls, 2PC vs sagas, the outbox pattern.
- **Async and events:** queues vs logs (SQS vs Kafka), at-least-once delivery, dedup, DLQs, backpressure, fan-out, event-driven architecture, CQRS, event sourcing, Postgres as a queue (`SKIP LOCKED`) and when to graduate from it.
- **APIs:** REST vs gRPC vs GraphQL, offset vs cursor pagination, idempotency keys, versioning, rate limiting (token bucket, leaky bucket, sliding window), polling vs long-polling vs SSE vs WebSockets, webhooks.
- **Reliability and ops:** SLIs/SLOs/error budgets, logs/metrics/traces, blue-green, canary, feature flags, graceful degradation, RPO/RTO, multi-region.
- **Security every backend dev needs:** authn vs authz, sessions vs JWT, OAuth2/OIDC flows (animated), OWASP top risks, secrets management, multi-tenant isolation.
- **Storage and search:** blob storage, inverted indexes, geospatial indexes, time-series data.
- **Case studies as boss levels:** URL shortener, rate limiter, news feed, chat (WhatsApp), notification system, video pipeline (YouTube), ride hailing (Uber), search autocomplete, distributed KV store, payment system, web crawler, ticket booking with seat contention (BookMyShow-style).
- Map every abstract component to its AWS service in the Codex (GCP/Azure as a footnote), since AWS is where I work.

### Track B: AI engineering
- **How LLMs behave in practice:** tokens and tokenization, context windows and what happens at their edges, sampling (temperature/top-p on a visible distribution), why hallucinations happen, time-to-first-token vs throughput, cost math.
- **Prompting as engineering:** system prompts, structure, examples, extended thinking, structured outputs, prompt caching, prompt versioning.
- **Embeddings and retrieval:** embedding-space explorer, cosine similarity, bi-encoder vs cross-encoder (I use both and should understand why), chunking strategies, BM25, hybrid search, RRF math, HyDE, reranking, metadata filtering, HNSW vs IVF tradeoffs, retrieval evaluation (recall@k, MRR, nDCG).
- **Tool use and agents:** tool calling and JSON schemas, the agent loop, ReAct, planning, short- vs long-term memory, failure modes (loops, tool misuse, context bloat), human-in-the-loop, workflows vs agents (and when *not* to use an agent), orchestrator-worker, parallelization, multi-agent patterns.
- **MCP:** host/client/server model, transports, tools/resources/prompts, building a server.
- **Agentic coding:** how Claude Code works (context, CLAUDE.md, subagents, hooks, skills, slash commands) and how to direct coding agents well.
- **Evals:** building test sets, code-based vs LLM-as-judge graders, prompt regression testing, offline vs online evals. Most people skip this. Make it one of the strongest parts of the game.
- **Production AI systems:** LLM gateways, routing by cost/quality/latency, semantic caching, rate limits and retries, streaming, tracing prompts and tool calls, guardrails, PII handling, cost controls.
- **AI security:** direct and indirect prompt injection, exfiltration through tools, least-privilege tool design.
- **Beyond prompting:** prompting vs RAG vs fine-tuning decisions, LoRA intuition, quantization, running local models (my laptop has an RTX 4050 with 6GB VRAM, so Ollama-sized models).
- **AI system design cases:** a ChatGPT-style chat service, a legal-document RAG platform at scale, an AI coding agent, an LLM gateway, a support agent with human escalation, a document-processing pipeline.

### Track C: Dev fundamentals for the AI era
- **Containers:** Docker from zero (images, layers, containers, volumes, networking, compose), animated until it finally clicks. Then Kubernetes at a "can hold a real conversation" level.
- **Linux for servers:** processes, memory and what OOM actually is, file descriptors, systemd, reading logs.
- **Git beyond basics:** an animated commit DAG (merge vs rebase, cherry-pick, reset, reflog rescues).
- **CI/CD and infrastructure-as-code basics.**
- **Concurrency:** threads vs processes vs async (including Python's GIL), race conditions visualized, locks, deadlocks.
- **LLD / machine coding** (common in Indian SDE1 loops): OOP design, SOLID, key design patterns shown in action, classic problems (parking lot, Splitwise, elevator, rate-limiter class, LRU cache).

### Track D: The Case Intel Files (special chapter and capstone)
Real incidents from my own project, turned into Incident Room scenarios and campaign missions:
- A status-polling endpoint returned the full advocate-search result (130k results, about 38.7MB) every 1.5 seconds and crashed a 1GB EC2 box. → payload caps, pagination, polling vs SSE.
- A t3.micro went unreachable during a fan-out feature (100+ sequential OCR/CAPTCHA requests). Root cause was never confirmed. → how to actually tell memory exhaustion from CPU-credit exhaustion using kernel logs and metrics.
- State-wide fan-out across districts with a system-wide concurrency cap and incremental per-district persistence. → fan-out design, retries, bulkheads, respecting an upstream you don't control.
- Document processing on a Postgres-backed job queue. → queue design, `SKIP LOCKED`, when to move to SQS.
- Certbot generated duplicate Nginx server blocks with a `return 404` ahead of the proxy config. → how reverse proxies pick a server block.

**Capstone:** "Scale Case Intel to every advocate in India." A full system design + AI design boss fight in the Interview Arena format: scraping at scale, multi-tenancy, RAG over very large case files, notifications, and a hard cost budget.

---

## 6. Mini-game catalog (the bar for "fun")

Each concept needs a signature interaction. These show the level I expect. Invent more, and better ones.

- **Latency Ladder:** drag operations into order, then watch them race on a log-scaled timeline.
- **Cache Rush:** requests stream at a service; tune size, TTL, and eviction live while hit ratio and p99 react; then a hot key expires and a stampede hits.
- **Hash Ring:** add and remove nodes on a spinning ring, watch keys migrate, compare % moved with and without virtual nodes.
- **Quorum Dial:** set N, R, W; a partition happens; see which reads come back stale.
- **Partition Split:** the map literally tears in two; decide per service whether to stay available or consistent, then watch what users experience.
- **Isolation Race:** two transactions animated side by side; pause, step, spot the anomaly, choose the isolation level that prevents it.
- **Token Bucket:** a literal bucket filling with tokens; bots and humans arrive; tune rate and burst to stop the attack without blocking people.
- **Queue Plumber:** producers and consumers as pipes; balance rates, handle duplicates, poison messages, and a DLQ.
- **Estimathon:** timed back-of-envelope rounds scored by order of magnitude, with a worked breakdown afterwards.
- **Tokenizer Slicer:** text splits into tokens live; guess the count and cost before the reveal.
- **Context Tetris:** fit system prompt, tools, documents, and history into a fixed window; see what gets dropped and how answers degrade.
- **Chunk Chef:** tune chunk size, overlap, and strategy on a small (synthetic) legal-document corpus and watch recall@k and answer quality move.
- **Agent Debugger:** step through a broken agent's trace (infinite loop, bad tool schema, context blowup) and fix it.
- **Prompt Injection Heist:** red-team a guarded bot to extract a fake secret (real Claude calls when a key is configured), then switch to blue team and harden it. Levels escalate to indirect injection through a retrieved document and through a tool result.
- **Eval Lab:** change a prompt, run the suite, watch regressions light up.
- **Model Router:** route a stream of tasks between cheap/fast and expensive/smart models to hit quality targets under a budget.
- **Docker Layers:** build an image layer by layer; reorder Dockerfile lines and watch the cache invalidate.
- **Git DAG:** an animated commit graph that reacts to the commands I type.

---

## 7. Simulation engine (the core technical asset)

- Pure TypeScript, deterministic (seeded RNG), decoupled from rendering, running in a Web Worker, thoroughly unit-tested with Vitest.
- **Component model:** capacity, service-time distribution, concurrency limit, queue, failure modes, monthly cost. Components include client populations, DNS, CDN, load balancer, API servers, workers, caches, SQL primary/replicas, NoSQL store, queues/streams, object storage, search index, vector DB, LLM API (rate limits, latency, token cost), and third-party APIs.
- **Traffic:** Poisson arrivals, diurnal curves, bursts, and Zipf key popularity so caching and hot shards behave realistically.
- **Behaviour that must emerge rather than be hard-coded:** latency blowup near saturation, retry storms amplifying outages, hit ratio from cache size and access distribution, replication lag, tail amplification from fan-out, cost scaling.
- **Output:** p50/p95/p99, throughput, error rate, availability, per-component saturation, cost, as live sparklines. Plus a flow view where requests are particles moving along edges, coloured by latency, visibly piling up at bottlenecks.
- **Validation tests:** e.g. M/M/1 latency matches theory within tolerance; doubling cache size under Zipf traffic raises hit ratio as expected; adding retries without jitter worsens a partial outage.

---

## 8. Motion and sound (where the addiction comes from)

- **Commit to one bold, cohesive aesthetic.** Suggested direction: a late-night ops control room. Dark, phosphor green and amber data accents, crisp monospace for numbers, a characterful display face for headlines, a subtle CRT/scanline texture, glowing request particles. Avoid the generic AI-product look (purple gradients, glassmorphism everywhere, stock illustrations). Read any frontend-design guidance or skills available to you first.
- Every interaction responds within 100ms. Springs, not linear tweens. Sliders, snapping, and wiring components should feel tactile.
- **Big moments get short, skippable cinematics:** chapter intros, boss fights, rank-ups, outages (screen dims, red alert, restrained shake), recovery (systems come back online one by one on a rising chord).
- **Procedural sound via Web Audio / Tone.js** (no licensing issues): UI ticks, placement thunks, request blips whose **pitch tracks latency** so I can *hear* a system slowing down (sonification as a teaching tool, not decoration), a load hum that rises with utilization, an alarm on SLO breach, a resolution chord on recovery. Per-chapter generative ambient music that intensifies with system stress. Master and per-channel volume, mute. Add slight pitch/timing variation so nothing gets annoying on repeat.
- Respect `prefers-reduced-motion`. Every audio-only cue has a visual equivalent.

---

## 9. Claude API integration

- **Used for:** grading "explain it back" answers, the Interview Arena interviewer, Field Mission verification, the Prompt Injection Heist target bot, and a context-aware "Ask the SRE" hint button that is Socratic (nudges first, never hands over the answer).
- **Architecture:** a server-side route only (the key never reaches the browser), key in `.env`, all model IDs in one config file. Default to a Sonnet-class model for the interviewer and grading and a Haiku-class model for cheap, fast calls. **Verify current model IDs and API features (structured outputs, prompt caching, streaming) against docs.claude.com before writing this code.**
- Structured outputs for all grading (rubric scores, one-line feedback, the specific gap). Cache system prompts. Stream interviewer replies.
- A running API-cost counter in settings and a hard monthly budget cap in config.
- **Fully playable with no key:** fall back to rubric self-assessment, precomputed feedback, and simulated bot behaviour.

---

## 10. Tech stack

- **Next.js (App Router) + TypeScript (strict).** I already use Next.js in two projects, and route handlers cover the Claude proxy.
- Tailwind for layout, Motion (Framer Motion) for UI animation, PixiJS for the particle/simulation views (Canvas 2D if you judge it sufficient), `@xyflow/react` for the architecture canvas, Tone.js for audio, Zustand for state, Dexie (IndexedDB) for local-first progress, `ts-fsrs` for scheduling, Zod for content schemas, Vitest for engine and content tests, Playwright for end-to-end tests and visual QA.
- **PWA, mobile-first where it matters.** Every mode must work at 390px width. The canvas can switch to a simplified touch mode on phones.
- **Later phase (optional):** progress sync to Postgres (Neon) behind a single-user passcode, deployment to Vercel, and a daily POST of session summaries (minutes, XP, concepts reviewed) to my ASCEND progress-tracker API. Ask me for the endpoint when you get there.
- Swap any library if you have a clearly better choice, and record why in `DECISIONS.md`.

---

## 11. Content architecture

- Content is data, not hard-coded screens. Define a Zod schema for a **Concept Pack**: id, track, prerequisites, hook, predictions, interactive widget id + config, mechanism captions, challenges (win conditions evaluated against the sim), review items in multiple formats, Codex card, interview angles, "go deeper" material, sources.
- Interactive widgets are reusable components parameterized by config, so adding a concept is cheap.
- **Content lint** (runs with the tests) enforces: caption word caps, at least one prediction and one challenge per concept, at least 6 review items across at least 3 formats, a Codex card, and a source for every number.
- **Accuracy pass:** after drafting each track, run a separate review (use a subagent) that fact-checks like a skeptical staff engineer and fixes errors.

---

## 12. Process (read carefully)

This will take many sessions. Any future session must be able to continue from the repo's files alone.

1. **Plan first.** Write `GAME_DESIGN.md` (the design as you'll actually build it, including anything you improved from this brief), `CONTENT_PLAN.md` (full concept graph with a status per concept), `ROADMAP.md` (phases with checkboxes), `DECISIONS.md`, and a `CLAUDE.md` with conventions, design tokens, commands, and "how to add a concept pack". Then start building. Don't wait for approval.
2. **Phase 1, foundations:** design system, motion primitives, audio engine, persistence, FSRS, content schema + lint, simulation engine core with tests.
3. **Phase 2, a vertical slice at final quality:** the HQ map with the decay mechanic; Campaign Chapter 1, "Launch Day" (one server falls over: latency numbers, Little's Law, vertical vs horizontal scaling, stateless services, load balancer, first boss); one Agent Foundry module (tokens + context windows); one Incident Room scenario; Daily Shift; Codex. Fully juiced with animation, sound, and cinematics. This slice sets the quality bar for everything after it.
4. **Checkpoint:** stop and ask me to playtest the slice. Give me a short list of what to try and what feedback you need.
5. **Phase 3 onwards:** apply my feedback, then expand track by track in whatever order makes the prerequisite graph playable fastest. Bring Interview Arena and Sandbox in early, since I'm job hunting.
6. **End of every session:** update `ROADMAP.md` and `CONTENT_PLAN.md`, commit with clear messages, and put a five-line "next session starts here" note at the top of `ROADMAP.md`.

**Quality checks you run yourself, continuously:**
- Tests green: engine, content lint, key flows in Playwright.
- Screenshot every screen with Playwright at desktop and 390px widths and look at them critically. Fix anything generic, cramped, or unclear before moving on.
- Play each mission end to end yourself and ask: is there tension, a real decision, and a payoff? If a mission is just reading and clicking Next, redo it.
- Performance: 60fps in the simulation view with ~2,000 particles on a mid-range laptop. Audio never crackles.

Use subagents for parallel work (content drafting per track, fact-check passes, visual QA) and keep the main thread for architecture and integration.

---

## 13. Anti-patterns (reject your own work if you see these)

- Walls of text, or any screen whose main job is reading.
- Multiple-choice quizzes as the primary teaching mechanic.
- Progress that can be earned by clicking through.
- Placeholder content, lorem ipsum, or "coming soon" tiles inside the slice.
- Dumbed-down explanations. Go to real depth, math included, just make it interactive and optional to drill into.
- Generic AI-product visuals, emoji confetti, forced cheerfulness.
- Guilt-trip streaks or nagging notifications.

---

## 14. Definition of done

I can open NINES on my phone or laptop, play a 15-minute shift, walk away having genuinely learned or reinforced something, and want to come back tomorrow. By the end of the campaign I can run a 45-minute system design interview with confidence, design and ship production agents and RAG systems with proper evals, and explain every architectural choice I made in Case Intel.
