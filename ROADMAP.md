# NINES Roadmap

## Next session starts here
1. The Phase 2 slice is complete and waiting at the playtest checkpoint: wait for Bhagath's feedback (what to try is listed under Checkpoint below), apply it, then promote the 11 slice nodes from "built" to "verified" in `src/content/graph.ts` STATUS.
2. Done 2026-10-02: Foundry B1 (Context Tetris, The Bill), Settings, PWA, generative music, perf on the GPU (D-014), all 21 screens at 390px, and the accuracy pass (CONTENT_PLAN accuracy log).
3. After feedback: Phase 3, starting with Sandbox/Architect, then Interview Arena, then chapters A2, A4, B2, and B4.
4. Checks: `npm test` (134), `npx tsc --noEmit`, `npx playwright test` (34 flows, incl. `tour` at both widths and `perf` on the GPU). Dev server: `.claude/launch.json` on port 3100.
5. Gotchas: responsive grids need `grid-cols-1`; headless Chromium caps near 30fps, so judge perf with `e2e/perf.spec.ts`; Python file writes on Windows default to CRLF, so pass `newline="\n"`.

---

## Phase 0 · Plan
- [x] `GAME_DESIGN.md`, `CONTENT_PLAN.md`, `ROADMAP.md`, `DECISIONS.md`, `CLAUDE.md`
- [x] Curriculum as code (`src/content/graph.ts`)

## Phase 1 · Foundations
- [x] Next.js 16 + TS strict + Tailwind v4 scaffold, fonts, tokens
- [x] Design system: panels, buttons, meters, stat readouts, chips, segmented, sliders, sheets, dock
- [x] Motion primitives: springs, Appear/Stagger, Ticker, GlitchText, Shake, Cinematic
- [x] Audio engine: channels, UI sounds, latency-pitched blips, load hum, alarm, recovery chord, generative score
- [x] Persistence: Dexie schema, Zustand store, export/import/reset
- [x] FSRS wrapper (`ts-fsrs`), retrievability -> building health, rating from performance
- [x] Rank math (nines), XP ledger, gates
- [x] Content schema (Zod) + content lint + engine-backed `verify` blocks
- [x] Simulation engine core: RNG, distributions, event queue, client/LB/server/cache/db, metrics, notable events
- [x] Engine validation tests (M/M/1, M/M/c, Little's Law, Zipf+LRU, retries, fan-out, determinism)
- [x] Web Worker host + typed protocol + React hook
- [x] Flow view (Canvas 2D particles)

## Phase 2 · Vertical slice (final quality)
- [x] HQ: uptime headline, rank, infrastructure map with decay states (flicker, rust, sparks, incident), pan/zoom/pinch
- [x] Mission Runner: hook -> predict (confidence) -> play -> reveal -> mechanism -> challenge -> explain -> debrief
- [x] Chapter A1 "Launch Day": latency-numbers, littles-law, queueing-utilization, scale-up-vs-out, load-balancing, stateless-services, boss-launch-day
- [x] Agent Foundry B1: tokens (Tokenizer Slicer + Token Diet), context-windows (Context Tetris), boss-the-bill
- [x] Incident Room: INC-0001 "The Fourth Box" on the live simulation
- [x] Daily Shift: seven review formats, "Why?" follow-ups, micro-challenge, Estimathon, streak + freeze tokens
- [x] Codex: cards, search, AWS mapping, calibration profile
- [x] Claude routes: grade (structured), hint (Ask the SRE), token count, status; usage ledger + hard monthly cap; no-key fallbacks
- [x] Cinematics: chapter intro, boss intro, incident page, rank-up
- [x] Music: generative score in boss fights and incidents
- [x] Settings: audio channels, reduced motion, cinematics, API status + spend, time warp, export/import/reset
- [x] PWA manifest + icons
- [x] Accuracy pass (fact-check workflow + adversarial verifier) on Chapter A1 + B1 + INC-0001
- [x] Playwright: every flow played end to end; all 21 screens at 1440px and 390px with a no-sideways-scroll check
- [x] Perf check: ~2,000 particles at 60fps on the hardware GPU (D-014)

## Checkpoint · Playtest the slice
- [x] Hand Bhagath a short list of what to try and what feedback is needed (2026-10-02)
- [ ] Feedback received and applied
- What to try: Chapter A1 in order and the Launch Day boss; Foundry B1 and The Bill (forecast before you ship); INC-0001 cold, without hints; a Daily Shift after setting time warp to +10 days; the HQ on your phone; Settings.

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
