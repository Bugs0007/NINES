# NINES Roadmap

## Next session starts here
1. Launch polish is built (D-022): neutral public copy, generated section labels, a skippable briefing and HQ tour, a "next step" card, locked-state reasons, Supabase accounts with validated progress, an admin funnel, anonymous analytics, and bring-your-own AI keys. Next: set up Supabase, Google sign-in and PostHog per `SUPABASE_SETUP.md`, deploy per `DEPLOY.md`, then post.
2. After launch: read `/admin` (funnel and feedback) weekly; promote the slice nodes to "verified" once playtest round 2 is in.
3. Then Phase 3: Sandbox/Architect, Interview Arena, chapters A2, A4, B2, B4.
4. Checks: `npm test`, `npx tsc --noEmit`, `npx next build`, `npx playwright test` (incl. `accounts`, `onboarding`, `tour`, GPU `perf`; AI off; onboarding off; test admin `admin@nines.test`).
5. Gotchas: role checks are server-side; public text must pass `tests/content/edition.test.ts`; `npm i` can drop the rolldown binding; Tailwind scans only `src/`; never add a write policy for browsers in `supabase/migrations`.

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
- [x] Feedback received and applied (round 1, 2026-10-03; see below)

## Playtest round 1 · "soothing, and tell me what I'm learning"
- [x] Calm redesign ("Dusk", D-018): palette, Fraunces + Figtree, soft kit, every screen restyled and checked at 1440px and 390px, softer sound
- [x] Section intros with animated scenes (HQ welcome, chapters, Daily Shift, Incident Room, Codex, bosses)
- [x] Learning layer (D-019): what each concept, chapter, and section teaches and why, on chapter pages, mission hooks, debriefs, and `/learn`
- [x] AI coach on Groq (D-017): gpt-oss-120b grades, gpt-oss-20b hints; Settings switch to turn it off (D-020)
- [ ] Bhagath's second look
- What to try: Chapter A1 in order and the Launch Day boss; Foundry B1 and The Bill (forecast before you ship); INC-0001 cold, without hints; a Daily Shift after setting time warp to +10 days; the HQ on your phone; Settings.

## Phase 3 · Expand (order chosen to make the graph playable fastest)
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
