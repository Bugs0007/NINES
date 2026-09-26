# NINES Roadmap

## Next session starts here
1. The mission runner works up to the hook screen (`/mission/littles-law`). The e2e test `e2e/mission-shots.spec.ts` fails at the third hook click because the hook button's label changes between clicks. Fix the test (or the selector), then walk the whole mission.
2. Done: engine + 21 validation tests, content schema/lint/verifiers (13 content tests green), Queue Lab widget, Mission Runner, Claude routes (grade/hint/count-tokens) with a budget ledger, and the first pack (`littles-law`).
3. Next: packs + widgets for latency-numbers (Latency Ladder + latency-budget), queueing-utilization, scale-up-vs-out, load-balancing, stateless-services; then the HQ map, Daily Shift, Codex, Incident Room, Foundry B1, and the boss.
4. Commands: `npm test` (engine + content), `npx tsc --noEmit`, dev server via `.claude/launch.json` (port 3100), `npx playwright test`.
5. Network here is slow: fonts are self-hosted in `src/fonts/`. If Vitest fails on a missing rolldown binding, run `npm i --no-save @rolldown/binding-win32-x64-msvc`.

---

## Phase 0 · Plan
- [x] `GAME_DESIGN.md`, `CONTENT_PLAN.md`, `ROADMAP.md`, `DECISIONS.md`, `CLAUDE.md`
- [x] Curriculum as code (`src/content/graph.ts`)

## Phase 1 · Foundations
- [x] Next.js 16 + TS strict + Tailwind v4 scaffold, fonts, tokens
- [~] Design system: panels, buttons, meters, stat readouts, tags, sheets, dock
- [x] Motion primitives: springs, Appear/Stagger, Ticker, GlitchText, Shake, Cinematic
- [x] Audio engine: channels, UI sounds, latency-pitched blips, load hum, alarm, recovery chord, ambient
- [x] Persistence: Dexie schema, Zustand store, export/reset
- [x] FSRS wrapper (`ts-fsrs`), retrievability -> building health, rating from performance
- [x] Rank math (nines), XP ledger, gates
- [x] Content schema (Zod) + content lint + engine-backed `verify` blocks
- [x] Simulation engine core: RNG, distributions, event queue, client/LB/server/cache/db, metrics, notable events
- [x] Engine validation tests (M/M/1, M/M/c, Little's Law, Zipf+LRU, retries, fan-out, determinism)
- [x] Web Worker host + typed protocol + React hook
- [x] Flow view (Canvas 2D particles, 2,000 at 60fps)

## Phase 2 · Vertical slice (final quality)
- [ ] HQ: uptime headline, rank, infrastructure map with decay states and repair animation
- [~] Mission Runner (built; end-to-end walkthrough pending) (hook -> predict -> play -> reveal -> mechanism -> challenge -> explain -> debrief)
- [ ] Chapter 1 "Launch Day" packs + widgets
  - [ ] latency-numbers (Latency Ladder)
  - [~] littles-law (Queue Lab): pack + widget drafted, lint + engine verification green
  - [ ] queueing-utilization (Queue Lab: load dial)
  - [ ] scale-up-vs-out (Scale Lab)
  - [ ] load-balancing (LB Lab)
  - [ ] stateless-services (Session Shuffle)
  - [ ] boss-launch-day
- [ ] Agent Foundry B1: tokens (Tokenizer Slicer), context-windows (Context Tetris), boss-the-bill
- [ ] Incident Room: INC-0001 "The Fourth Box"
- [ ] Daily Shift: reviews (all formats), "Why?" follow-ups, micro-challenge, Estimathon, streak + freeze tokens
- [ ] Codex: cards, search, AWS mapping, calibration profile
- [~] Claude routes (grade, hint, count-tokens, status + budget ledger done; UI wiring in runner done): grade, hint (Ask the SRE), token count; usage ledger + budget cap; no-key fallbacks
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
