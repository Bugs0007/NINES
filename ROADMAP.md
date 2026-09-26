# NINES Roadmap

## Next session starts here
1. Phase 1 (foundations) and Phase 2 (vertical slice) are in progress this session; see checkboxes below.
2. Run `npm install`, then `npm test` (engine + content lint) and `npm run dev`.
3. Read `CLAUDE.md` for conventions and `GAME_DESIGN.md` for the design as built.
4. The curriculum graph is `src/content/graph.ts`; regenerate `CONTENT_PLAN.md` with `npm run content:plan`.
5. Pick up at the first unchecked box below.

---

## Phase 0 · Plan
- [x] `GAME_DESIGN.md`, `CONTENT_PLAN.md`, `ROADMAP.md`, `DECISIONS.md`, `CLAUDE.md`
- [x] Curriculum as code (`src/content/graph.ts`)

## Phase 1 · Foundations
- [ ] Next.js 16 + TS strict + Tailwind v4 scaffold, fonts, tokens
- [ ] Design system: panels, buttons, meters, stat readouts, tags, sheets, dock
- [ ] Motion primitives: springs, Appear/Stagger, Ticker, GlitchText, Shake, Cinematic
- [ ] Audio engine: channels, UI sounds, latency-pitched blips, load hum, alarm, recovery chord, ambient
- [ ] Persistence: Dexie schema, Zustand store, export/reset
- [ ] FSRS wrapper (`ts-fsrs`), retrievability -> building health, rating from performance
- [ ] Rank math (nines), XP ledger, gates
- [ ] Content schema (Zod) + content lint + engine-backed `verify` blocks
- [ ] Simulation engine core: RNG, distributions, event queue, client/LB/server/cache/db, metrics, notable events
- [ ] Engine validation tests (M/M/1, M/M/c, Little's Law, Zipf+LRU, retries, fan-out, determinism)
- [ ] Web Worker host + typed protocol + React hook
- [ ] Flow view (Canvas 2D particles, 2,000 at 60fps)

## Phase 2 · Vertical slice (final quality)
- [ ] HQ: uptime headline, rank, infrastructure map with decay states and repair animation
- [ ] Mission Runner (hook -> predict -> play -> reveal -> mechanism -> challenge -> explain -> debrief)
- [ ] Chapter 1 "Launch Day" packs + widgets
  - [ ] latency-numbers (Latency Ladder)
  - [ ] littles-law (Queue Lab)
  - [ ] queueing-utilization (Queue Lab: load dial)
  - [ ] scale-up-vs-out (Scale Lab)
  - [ ] load-balancing (LB Lab)
  - [ ] stateless-services (Session Shuffle)
  - [ ] boss-launch-day
- [ ] Agent Foundry B1: tokens (Tokenizer Slicer), context-windows (Context Tetris), boss-the-bill
- [ ] Incident Room: INC-0001 "The Fourth Box"
- [ ] Daily Shift: reviews (all formats), "Why?" follow-ups, micro-challenge, Estimathon, streak + freeze tokens
- [ ] Codex: cards, search, AWS mapping, calibration profile
- [ ] Claude routes: grade, hint (Ask the SRE), token count; usage ledger + budget cap; no-key fallbacks
- [ ] Cinematics: chapter intro, boss intro, rank-up, outage, recovery
- [ ] Settings: audio channels, reduced motion, API status + cost, export/reset
- [ ] PWA manifest + icons
- [ ] Accuracy pass (subagent) on Chapter 1 + B1 content
- [ ] Playwright: key flows + screenshots at 1440px and 390px, reviewed and fixed
- [ ] Perf check: 2,000 particles at 60fps

## Checkpoint · Playtest the slice
- [ ] Hand Bhagath a short list of what to try and what feedback is needed

## Phase 3 · Expand (order chosen to make the graph playable fastest)
- [ ] Apply playtest feedback
- [ ] Sandbox / Architect (xyflow canvas, presets, chaos monkey, save/load)
- [ ] Interview Arena (streaming interviewer, clocks, rubric debrief, estimation duels)
- [ ] Chapter A2 Growing Pains, A4 Read Heavy, B2 How Models Behave, B4 Retrieval
- [ ] Track D: Case Intel Files incidents
- [ ] Track C: Containers + Linux
- [ ] Remaining chapters per CONTENT_PLAN.md

## Phase 4 · Later
- [ ] Field Missions with Claude verification
- [ ] Sync to Postgres (Neon) behind a passcode; deploy to Vercel
- [ ] Daily session summary POST to ASCEND (ask Bhagath for the endpoint)
