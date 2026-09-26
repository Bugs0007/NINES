# NINES: Game Design (as built)

This is the design we are actually building. `BRIEF.md` is the original ask; where this document differs, this document wins, and the reason is recorded in section 14 and in `DECISIONS.md`.

---

## 1. Pillars

1. **Do, then understand.** Every concept starts with a problem, asks for a committed prediction, lets you break a live system, and only then explains why. Reading is never the main verb.
2. **The simulation is honest.** Latency blowups, retry storms, hit ratios, and bills *emerge* from a deterministic discrete-event engine. Content claims are unit-tested against that engine. Where it simplifies, an "Honest physics" note says so.
3. **Mastery is performance over time.** Correct, confident, reasonably fast, across spaced intervals. Viewing content earns nothing.
4. **The map is your mind.** The home screen is a picture of what you know. Knowledge decays like infrastructure: visibly, repairably, never with guilt copy.
5. **15 to 25 minutes.** Every mission, shift, and incident fits in one sitting on a phone.

If a screen could be replaced by a PDF, it has failed.

---

## 2. Aesthetic: "Night Shift"

A late-night ops control room at 02:14 IST.

- **Palette.** Near-black blue-green background. Phosphor green = healthy and success. Amber = data accent, focus, attention. Red = failure and alarms. No purple, no glass cards, no gradients-for-decoration. Colour always means something.
- **Type.** `Big Shoulders Display` (condensed, industrial signage) for headlines and big numbers on cinematics. `IBM Plex Sans` for UI copy. `IBM Plex Mono` with tabular figures for every number, label, log line, and metric.
- **Texture.** A subtle scanline + vignette overlay (CSS only, disabled in reduced motion for the flicker part). Glow is reserved for live data (particles, the uptime number, active meters).
- **Shapes.** Hairline 1px rules, square-ish corners (2 to 4px), bracketed labels like `[ P99 ]`, panel headers styled like rack labels. Dense where data lives, generous where decisions happen.
- **Motion.** Springs everywhere (no linear tweens for UI). Every interaction responds within 100ms. Big moments get short, skippable cinematics.

Tokens live in `app/globals.css` (`@theme`) and are documented in `CLAUDE.md`.

---

## 3. Fiction

You are the first backend engineer at **Pigeon**, a messaging startup in Hyderabad. Pigeon grows from 10 users (the founder's cousins) to 100M, then pivots into an AI company ("Pigeon Copilot"). Each campaign chapter is a growth stage whose incidents force the next concept.

### Cast (one or two lines at a time, never more)
- **Meera Iyer, Principal SRE** (mentor). Twenty years of pagers. Dry, sardonic, kind underneath. Gives Socratic hints. *"Congratulations, you've discovered queueing. It was discovered in 1909, but still."*
- **Kabir Sethi, Founder & CEO.** Promises impossible dates to journalists. Genuinely delighted by everything. *"I told TechCrunch we'd handle a million users by Friday. It's Wednesday. How are we doing?"*
- **Mr. Rao, CFO.** Appears only when your bill spikes. Speaks in rupees and disappointment. *"Our AWS invoice has acquired a comma. I would like it to give the comma back."*

Rules: witty and understated, never cringe, never more than two lines on screen, never in the way of a decision. Cast lines are content data (`speaker` + `line`) so they can be linted for length.

---

## 4. Progression

### 4.1 Rank is measured in nines
Your **nines** value `n` is a real number between 1 and 5. Uptime is `1 - 10^(-n)`:

| n | Uptime | Rank |
|---|---|---|
| 1.00 | 90.00% | One Nine |
| 1.50 | 96.84% | One Nine II |
| 2.00 | 99.00% | Two Nines |
| 3.00 | 99.90% | Three Nines |
| 4.00 | 99.99% | Four Nines |
| 5.00 | 99.999% | Five Nines |

Each whole nine has three sub-tiers (I, II, III at thirds). XP moves `n` along its current tier; **you cannot cross an integer without beating that gate's boss fight**. XP earned while gated is banked, so the rank-up cinematic after a boss win can visibly sweep the number upward.

The uptime number on HQ is the headline of the whole game. It is rendered like a live metric: glowing, tabular, ticking.

### 4.2 Knowledge decay as tech debt
Every concept you have built is a building on the **infrastructure map**. Its health follows FSRS retrievability `R` (from `ts-fsrs`, desired retention 0.90):

| R | Building state |
|---|---|
| >= 0.90 | Online. Steady lights, particles flowing along its traces. |
| 0.85 to 0.90 | Due. Lights flicker occasionally. |
| 0.75 to 0.85 | Rust creeping in, amber status LED. |
| 0.60 to 0.75 | Error sparks, particles on its traces stall. |
| < 0.60 | Small incident badge ("INC") on the building. |

**Degraded services dent live uptime slightly** (at most 0.3 nines in total, never below your rank floor), and the number flickers amber. A review repairs the building with an animation and the uptime ticks back. Rank itself is never lost. Copy is neutral system status ("3 services degraded"), never guilt.

### 4.3 Mastery levels (per concept)
| Level | Earned by | Building |
|---|---|---|
| Locked | Prerequisites not built | Faint blueprint outline |
| Available | Prerequisites built | Blueprint with a pulsing "build" marker |
| Built | Mission complete: challenge won inside the sim | Small rack |
| Hardened | 2 successful spaced reviews, at least 1 day apart | Rack with its own power + cooling |
| Mastered | Stability >= 21 days, a transfer success (boss, incident, or interleaved review where the concept was unnamed) | Tower with beacon |

### 4.4 XP (earned, never granted for viewing)
| Source | XP |
|---|---|
| Prediction | 0 to 20, calibrated (log scoring on your stated confidence) |
| Challenge win | 100, plus up to 2 bonus stars (budget, speed) at 25 each |
| Explain it back | 10 to 40 by rubric score |
| Review | 5 (Hard) / 10 (Good) / 15 (Easy); 0 for Again |
| "Why?" follow-up correct | +5 |
| Estimation drill | 5 to 30 by order-of-magnitude error |
| Incident | 100 to 300 by time-to-mitigate and root-cause accuracy |
| Boss | 300 plus stars |
| Field mission | 500 |

Hints from "Ask the SRE" cost nothing on the first nudge and 10 XP for each further nudge. Field-mission hints cost more.

### 4.5 Calibration
Every prediction carries a confidence (50 / 70 / 90%). NINES keeps a calibration curve per player (Codex > Profile). Confidently wrong predictions trigger the strongest reveal treatment in the game (glitch, amber flash, the actual number slamming in next to your call, a Meera line). No XP is given for being wrong; the payoff is the moment.

### 4.6 Streaks
A Daily Shift completed on a calendar day (Asia/Kolkata) extends the streak. One freeze token is earned per 7-day streak (max 2) and is applied automatically on a missed day. Missing a day with no token resets quietly. No notifications, no "you'll lose your streak!" copy.

---

## 5. The learning engine as implemented

Every concept is a **Concept Pack** (data, validated by Zod). A generic **Mission Runner** plays any pack through these beats:

```
HOOK -> PREDICT -> PLAY -> REVEAL -> MECHANISM -> CHALLENGE -> EXPLAIN -> DEBRIEF
```

1. **Hook (< 30s).** A pager, a graph spike, a cast line. Never a definition.
2. **Predict.** The pack defines 1+ predictions: `choice`, `numeric` (log-scaled slider), or `order`. You set a confidence and press *Lock it in*. The locked call stays pinned on screen during Play.
3. **Play.** The pack's widget runs with its config. The widget emits `observed` events when the player has actually produced the predicted situation (e.g., pushed load past 90%).
4. **Reveal.** Your call vs reality, with a treatment that scales with how confident and how wrong you were.
5. **Mechanism.** 2 to 5 animated captions (<= 60 words each, lint-enforced). Each caption can drive a named widget scene (e.g., highlight the queue). "Go deeper" opens the real math and sources. "Honest physics" explains what the sim simplifies.
6. **Challenge.** A constrained problem with win conditions evaluated against the sim (e.g., `p99 < 250ms AND errorRate < 1% AND cost < $120/mo` during the peak window). Losing triggers a **slow-motion replay** of the deterministic run with the first causal event highlighted (e.g., "t=41s api-1 queue > 64: timeouts begin").
7. **Explain it back.** Occasionally (every pack defines one; the runner asks on roughly half of first completions and always in bosses). Claude grades against the pack's rubric with structured output and names the exact gap. With no API key: rubric self-check with an exemplar answer.
8. **Debrief.** XP breakdown, Codex card flip, the building constructs itself on the map, the concept is enrolled in FSRS.

Then **Spaced retrieval** (Daily Shift) and **Transfer** (bosses, incidents, interleaved reviews where the concept is unnamed).

### "Why?" follow-ups
After a correct review answer, about 1 in 3 times NINES asks *Why?* with a short set of plausible reasons. Getting the why wrong downgrades the FSRS rating to Hard. Guessing never pays.

### Procedural skills
Estimation, interview flow, and agent-building use **worked -> faded -> solo**: the first round shows every step, the second blanks out one or two steps, the third is yours.

---

## 6. Modes

| Mode | Slice (Phase 2) | Later |
|---|---|---|
| HQ / Infrastructure Map | Full | Districts added per track |
| Campaign | Chapter 1 "Launch Day": 6 missions + boss | Chapters 2+ |
| Daily Shift | Full (reviews, micro-challenge, estimation drill, streak) | More formats |
| Incident Room | INC-0001 "The Fourth Box" | Case Intel Files and one incident per chapter |
| Agent Foundry | Module B1 "Tokens & Context" (2 missions + module boss "The Bill") | Modules B2+ |
| Codex | Full (cards unlock from play, search, AWS mapping, calibration profile) | Grows with content |
| Sandbox / Architect | Not in slice | Phase 3 (early) |
| Interview Arena | Not in slice | Phase 3 (early) |
| Field Missions | Not in slice | Phase 4 |

### 6.1 HQ
- Top: live uptime (big, glowing), rank + sub-tier, XP to next tier, gate status ("Gate: Launch Day boss").
- Center: the **infrastructure map**. A circuit-board city: each track is a district, each chapter a block, each concept a building on a lot. Prerequisites are traces between lots; request particles flow along traces between healthy buildings. Unbuilt concepts are blueprints. Pan and zoom on desktop, pinch and drag on touch.
- Bottom dock: *Start shift* (with due count), *Campaign*, *Foundry*, *Incidents*, *Codex*, *Settings*.

### 6.2 Campaign
A chapter view shows its missions as a small prerequisite graph with the boss at the end. Missions unlock by prerequisites, not strict order.

### 6.3 Daily Shift (10 to 15 min)
Briefing line -> up to 8 reviews (lowest retrievability first, interleaved across tracks) -> one micro-challenge (a procedurally parameterised challenge from a built concept) -> one Estimathon round -> shift report (repairs animate on the map). Works with zero built concepts (estimation + "build your first service").

### 6.4 Incident Room
- A pager alert cinematic, then the war room: dashboards (latency, errors, saturation, per-host breakdowns), a searchable, filterable log stream, request traces, a timeline of changes (deploys, scaling events).
- **The incident runs on the live sim.** The error budget burns while you investigate. Mitigations are real changes to the simulated system, so their effect shows up on the dashboards.
- Flow: investigate -> pin evidence -> state a hypothesis (structured: *what*, *why*, *evidence*) -> apply mitigations -> confirm recovery -> three-line postmortem (what happened, root cause, prevention).
- Score: time-to-mitigate (sim clock), root-cause accuracy, evidence quality, collateral damage (e.g., restarting the wrong box).

### 6.5 Agent Foundry
Same Mission Runner, AI-flavoured widgets. Module B1: **Tokenizer Slicer** (tokens) and **Context Tetris** (context windows), then module boss **The Bill** (a chat product re-sends full history every turn; hit a quality bar under Mr. Rao's budget).

### 6.6 Codex
Cards unlock only by building concepts. Each card: one-line definition, a replayable mini animation from its mission, key numbers (each with a source), tradeoffs, "where you've seen it" (Case Intel callouts), the interview angle, AWS mapping (GCP/Azure footnote), sources. Search across everything. Profile tab: calibration curve, review heatmap, mastery by track.

### 6.7 Later modes (designed now so the slice doesn't paint us into a corner)
- **Sandbox**: `@xyflow/react` canvas using the same component catalog and engine; traffic presets (steady, diurnal, viral spike, Black Friday, DDoS, region outage, slow dependency, bad deploy), Chaos Monkey, live p50/p95/p99, throughput, errors, availability, monthly cost; save/load designs. Phones get a simplified slot-based touch mode.
- **Interview Arena**: Claude interviewer (streaming), 45-minute and 20-minute clocks, the same canvas as the whiteboard, rubric debrief (requirements, estimation, API, data model, HLD, deep dives, tradeoffs, communication). LLD rounds and estimation duels.
- **Field Missions**: goal, acceptance criteria, progressive hints (cost XP), verification by pasting output/logs/repo link for Claude to check.

---

## 7. Simulation engine (`src/engine`)

Pure TypeScript, no DOM, deterministic, runs in a Web Worker, tested with Vitest.

### 7.1 Core
- **Discrete-event simulation** over a binary-heap event queue with deterministic tie-breaking (time, then insertion sequence).
- **Seeded RNG** (`sfc32`), split into independent streams per concern (arrivals, service times, routing, failures) so changing one knob does not reshuffle unrelated randomness.
- **Distributions**: exponential, deterministic, uniform, lognormal (by median + p99), bounded Pareto, Zipf (via precomputed CDF + binary search).

### 7.2 Components
Every node has: `capacity` (workers/slots), `queueLimit`, a `service` program, failure modes, and `monthlyCostUsd`.

- `client`: a population generating Poisson arrivals from a rate curve (steady, diurnal, spike, ramp, custom keyframes); Zipf key selection; client timeout; retry policy (max attempts, backoff base, cap, jitter mode).
- `lb`: L4/L7 load balancer; algorithms: round-robin, random, least-outstanding, power-of-two-choices, hash/sticky; active health checks (path depth: shallow/deep, interval, thresholds); per-request overhead.
- `server`: workers (sync: a worker is held while waiting on downstream calls; async: the event loop releases it), CPU service time distribution, optional per-instance memory model, steps that call downstream nodes sequentially or in parallel (fan-out waits for all).
- `cache`: real LRU or LFU over keys with a capacity; hit/miss emerges from Zipf traffic; TTL; miss path calls the backing store.
- `db`: connection limit + service distribution by operation (read/write), optional replicas with replication lag.
- `queue`, `worker`, `llm`, `external` (rate limit + latency + token cost) arrive with their chapters.

Failure modes: `down`, `slow(multiplier)`, `errorRate(p)`, `misconfigured(workers)`, `partition`.

### 7.3 Emergent behaviour (and the tests that prove it)
| Behaviour | Validation test |
|---|---|
| Latency blows up near saturation | M/M/1 mean sojourn within 5% of `1/(mu - lambda)` at rho = 0.5, 0.8, 0.9 |
| Pooling | M/M/c wait matches Erlang C within tolerance |
| Little's Law | Measured `L = lambda * W` within 3% |
| Hit ratio from size + skew | LRU under Zipf rises monotonically with capacity and matches the Che approximation within tolerance |
| Retry storms | Retries without jitter produce a higher error rate than no retries during a partial outage |
| Tail amplification | Fan-out to N shards: p99 grows with N as predicted by `1 - (1-p)^N` |
| Determinism | Same seed + same input log => byte-identical metrics |

### 7.4 Output
Metrics in 1-second sim windows: p50/p95/p99 (from a log-bucket histogram), throughput, error rate, availability (good-minute ratio and request ratio), per-node utilization, queue depth, in-flight, cost. **Particles**: the worker samples up to ~2,000 in-flight requests and streams their hops; the main thread renders them on Canvas 2D, coloured by latency, visibly piling up at bottlenecks.

### 7.5 Replays and causality
Runs are `(seed, config, inputLog)`. A failed challenge re-runs deterministically at slow speed. The engine emits **notable events** (saturation crossed, queue overflow, first timeout, retry amplification > 1.5x, health-check ejection, cache stampede) and the replay highlights the first one in the causal chain.

### 7.6 Scale
The engine simulates every request up to roughly 20k requests/s of sim traffic. Above that, it simulates a 1-in-k sample of traffic against 1/k of each horizontally scaled fleet (independent per-instance queues make this nearly exact) and says so in Honest physics.

---

## 8. Motion and sound

### Motion (`src/ui/motion`)
- Spring presets: `snap` (UI response), `soft` (panels), `heavy` (placements, thunks), `bounce` (rewards).
- Primitives: `Appear`, `Stagger`, `Ticker` (spring-animated numbers), `GlitchText`, `ScanReveal`, `Shake` (restrained), `Cinematic` (skippable full-screen sequence with Esc / tap-to-skip).
- Cinematics: chapter intro, boss intro, rank-up, outage (screen dims, red alert bar, small shake), recovery (systems come back one by one on a rising chord).
- `prefers-reduced-motion`: shakes, flicker, and particles-in-motion become fades and static states. A settings toggle overrides.

### Sound (`src/audio`), raw Web Audio API
- Channels: `ui`, `sim`, `alerts`, `music`, each with its own gain, plus master and mute.
- UI tick, placement thunk, confirm, error buzz. Every sound gets slight random pitch (+-3%) and timing variation.
- **Request blips whose pitch tracks latency**: fast requests are bright and high, slow ones drop and lengthen. Rate-limited to ~12 blips/s with sampling so it never turns to noise. You can *hear* a system slow down.
- **Load hum**: a detuned oscillator pair whose gain, filter cutoff, and beat frequency rise with utilization.
- **Alarm** on SLO breach; **resolution chord** (rising arpeggio) on recovery.
- **Generative ambient** per chapter: a drone plus sparse pentatonic plucks; tempo, density, and filter open with system stress.
- Every audio cue has a visual twin (alarm = red status bar, hum = utilization meter glow, blips = particles).

---

## 9. Claude integration

- Server route handlers only (`app/api/claude/*`); the key lives in `.env.local` and never reaches the browser.
- Model IDs in one file (`src/config/models.ts`). Sonnet-class for grading and the interviewer, Haiku-class for cheap/fast calls (hints, the Heist bot's first line of defence).
- Structured outputs for all grading (rubric scores, one-line feedback, the specific gap). System prompts are cached. Interviewer replies stream.
- A server-side usage ledger (`.nines/usage.json`) tracks cost per call from the response's token usage; a hard monthly budget in `src/config/claude.ts` refuses calls once reached. Settings shows the running cost.
- **Fully playable without a key**: rubric self-assessment with exemplars, precomputed feedback, simulated Heist bot, scripted hints.

Uses in the slice: explain-it-back grading, postmortem grading, "Ask the SRE" (Socratic: nudge, then narrower nudge, never the answer), exact Claude token counts in Tokenizer Slicer.

---

## 10. Content architecture

- `src/content/graph.ts`: the **whole planned curriculum** as a prerequisite graph (id, title, track, chapter, prereqs, status, signature interaction). The HQ map renders it (unbuilt lots included), and `CONTENT_PLAN.md`'s tables are generated from it.
- `src/content/packs/<id>.ts`: Concept Packs (Zod schema in `src/content/schema.ts`).
- `src/widgets/registry.ts`: widget id -> component + Zod config schema. Adding a concept = write a pack, reuse or add a widget.
- **Content lint** (`tests/content/*.test.ts`, runs with `npm test`): caption word caps, >= 1 prediction and >= 1 challenge, >= 6 review items across >= 3 formats, Codex card present, every key number has a source, numbers-with-units in captions require a source or a `derived` flag, prerequisites exist and are acyclic, widget ids and configs are valid, cast lines <= 2 sentences.
- **Engine-backed claims**: packs can declare `verify` blocks (a sim scenario + an expected result). A test runs each and fails if the content lies.
- **Accuracy pass**: after drafting each track, a separate subagent fact-checks like a skeptical staff engineer; findings are fixed and logged in `CONTENT_PLAN.md`.

---

## 11. Review formats

| Format | What you do |
|---|---|
| `pick-fix` | A micro-scenario; choose the fix. Often followed by *Why?* |
| `spot-flaw` | Tap the flawed component or edge in a small architecture diagram |
| `estimate` | Type a number; scored by order of magnitude (log10 error) |
| `order` | Drag steps or values into order |
| `predict-graph` | Pick which curve the metric will follow |
| `explain` | Two sentences, graded (Claude or self-check) |
| `tune` | A micro-sim with one slider; hit the target |

Review ratings map to FSRS: wrong -> Again; right but slow or low-confidence -> Hard; right and confident -> Good; right, confident, and fast -> Easy.

---

## 12. Screens and routes

| Route | Screen |
|---|---|
| `/` | HQ |
| `/campaign`, `/campaign/[chapter]` | Chapter select, chapter graph |
| `/mission/[id]` | Mission Runner (any concept pack) |
| `/boss/[id]` | Boss fight |
| `/shift` | Daily Shift |
| `/incident`, `/incident/[id]` | Incident list, war room |
| `/foundry`, `/foundry/[module]` | Agent Foundry |
| `/codex`, `/codex/[id]` | Codex |
| `/settings` | Audio, motion, API key status + running cost, data export/reset |

Every screen works at 390px. The canvas-heavy screens switch to touch-first layouts on phones.

---

## 13. Accessibility

- Keyboard reachable everything; visible amber focus rings.
- Audio cues always have visual equivalents; captions for cast lines.
- Colour is never the only signal (latency also encoded in particle size/trail; status uses icons + text).
- `prefers-reduced-motion` respected, plus an in-app override.
- Minimum 44px touch targets on phones.

---

## 14. Changes from the brief (and why)

1. **Uptime uses real nines math** (`1 - 10^-n`) so progress feels like chasing nines, with boss gates at each integer.
2. **Decay dents live uptime a little**, bounded and never below your rank. It ties "tech debt" to the headline number without punishing rank.
3. **Incidents run on the live simulation**, so mitigations have honest, visible effects and the error budget burns while you investigate.
4. **Content claims are tested against the engine** (`verify` blocks), not just linted.
5. **The planned curriculum is code** (`graph.ts`), so the HQ map shows the whole future city as blueprints from day one and the content plan cannot drift from the app.
6. **The slice's incident is a Launch-Day incident ("The Fourth Box")** instead of a Case Intel one, so it transfers Chapter 1 concepts and keeps real mystery (you already know how your own incidents ended). Case Intel Files arrive as Track D.
7. **Raw Web Audio instead of Tone.js; Canvas 2D instead of PixiJS** (see `DECISIONS.md`).
8. **Tokenizer Slicer** uses a real BPE tokenizer offline as a proxy and asks Claude's token-counting endpoint for exact counts when a key is set.
