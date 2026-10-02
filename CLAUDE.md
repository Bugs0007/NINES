# NINES: working notes for Claude

A game that teaches system design, AI engineering, and dev fundamentals. Read `ROADMAP.md` first (the top section says where to pick up), then `GAME_DESIGN.md` (the design as built) and `DECISIONS.md`. `BRIEF.md` is the original ask.

## Commands

| What | Command |
|---|---|
| Dev server | `npx next dev -p 3100` (or the `nines-dev` entry in `.claude/launch.json`) |
| Unit + engine + content tests | `npm test` |
| Content lint only | `npm run content:lint` |
| Type-check | `npx tsc --noEmit` |
| E2E + screenshots | `npx playwright test` (shots land in `e2e/__shots__/`, gitignored) |
| Regenerate CONTENT_PLAN tables | `npm run content:plan` |
| Calibrate a challenge | edit and run `npx tsx scripts/calibrate.ts` (sims), `scripts/ctx.mts` (Context Tetris), `scripts/tok.mts` (tokenizer) |
| Every screen at both widths | `npx playwright test e2e/tour.spec.ts` (fails on any sideways scroll) |
| Renderer perf (needs a GPU) | `npx playwright test e2e/perf.spec.ts` (stress page: `/dev/perf?n=2000`) |
| Regenerate app icons | `npx tsx scripts/gen-icons.mts` (from `src/app/icon.svg`) |

Windows + OneDrive notes: installs are slow here. If Vitest dies with "Cannot find native binding" run `npm i --no-save @rolldown/binding-win32-x64-msvc`. Fonts are committed in `src/fonts/` because `next/font/google` can't fetch on this network.

## Layout

```
src/
  app/            Next.js routes (App Router). /mission/[id], /api/claude/*, /dev/widget/[id]
  engine/         Pure TS discrete-event sim. sim.ts (core), host.ts + sim.worker.ts (worker), useSim.ts (React)
  content/        graph.ts (whole curriculum), schema.ts (Zod + lint), packs/*.ts, verifiers.ts, scenarios.ts
  widgets/        Interactive widgets. registry.tsx (id -> component), manifest.ts (metrics/observes/scenes)
  mission/        Mission Runner, Boss Runner, and their panels (hook, predict, reveal, mechanism, challenge, explain, debrief)
  hq/             HQ: uptime headline, infrastructure map (decay states), dock
  campaign/       Chapter view (missions, boss, side incidents)
  shift/          Daily Shift (reviews, micro-challenge, Estimathon)
  review/         Review card formats and diagrams
  codex/          Codex cards, search, calibration profile
  incident/       Incident Room scenarios and war-room panels
  settings/       Settings page
  game/           Dexie db, Zustand store, FSRS, rank (nines), scoring
  audio/          Web Audio engine (sfx singleton), useMusic() for the generative score
  ui/             Design system: kit.tsx, motion.tsx, Slider, Cast, flow/FlowView (canvas particles)
  ai/             Browser helpers + shared request schemas for the AI routes
  server/         Server-only AI client (Groq), usage ledger, budget cap
  config/         models.ts (every runtime model ID + price), ai.ts (budget)
tests/content/    Graph + pack lint + engine-verified claims
e2e/              Playwright flows and screenshot specs
```

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`. No `any` except the widget registry's component map.
- Client components start with `"use client"`. Engine, content, and game logic stay React-free where possible so tests can import them.
- Zustand v5: never subscribe with a selector that builds a new object (`useGame(selectRank)` loops forever). Use `useRank()` / `useLive()` or select primitives.
- Content is data. Never hard-code a mission screen; write a pack and reuse or add a widget.
- Every number a player reads as fact has a source (`sources` + `sourceIds`) or is marked `derived: true` because the sim produced it. The lint enforces this.
- Challenge thresholds are calibrated against the engine with the widget's exact spec and seed, then locked in with `verify` blocks. RNG streams are keyed by node id, so renaming a node changes results.
- Copy: dry, specific, no exclamation marks, no emoji, no guilt. Cast lines are at most two sentences.
- Responsive grids need a base `grid-cols-1` (minmax(0,1fr)); without it wide content (tables, truncated rows) stretches the column off a 390px screen.
- Lists show only content that exists in the build; unbuilt content appears only as blueprints on the HQ map (D-015).
- Commits end with the `Co-Authored-By` line from the session instructions.

## Design tokens (`src/app/globals.css`, Tailwind v4 `@theme`)

| Token | Use |
|---|---|
| `bg-0 … bg-3` | Near-black blue-green surfaces, darkest to raised |
| `line`, `line-2`, `line-3` | Hairlines and borders |
| `ink-0 … ink-3` | Text: primary, secondary, muted, disabled |
| `phos` (+ `-2`, `-3`, `-dim`) | Healthy, success, live data |
| `amber` (+ `-2`, `-3`, `-dim`) | Data accent, focus, interactive, attention |
| `alert` (+ `-2`, `-3`, `-dim`) | Failure, alarms |
| `font-display` | Big Shoulders Display: headlines, big numbers (uppercase, extrabold) |
| `font-sans` | IBM Plex Sans: UI copy |
| `font-mono` | IBM Plex Mono: numbers, labels, logs (`tabular` for figures) |
| `shadow-glow-*` / `glow-*` | Glow only on live data and key states |
| `rack-label` | `[ LABEL ]` bracketed panel headers |

Motion presets live in `src/ui/motion.tsx` (`spring.snap`, `soft`, `heavy`, `bounce`). Always go through `useReducedMotion()` (it respects the in-app override).

## How to add a concept pack

1. Find the node in `src/content/graph.ts` (id, prereqs, signature interaction). Set its status to `"drafted"` in the `STATUS` table.
2. Pick or build the widget. A widget is a component in `src/widgets/<name>/` taking `WidgetProps<Config>` (`src/widgets/types.ts`):
   - `mode`: `preview` (before predictions lock: render but don't run), `play`, `challenge`, `codex`.
   - Call `onObserve(event)` when the player has produced the situation a prediction is about.
   - In challenge mode, call `onResult(metrics)` when a run finishes. Conditions in the pack compare against these metric names.
   - React to `scene` (a mechanism caption's named scene) with highlights or animation.
   - Put pure spec builders in `spec.ts` next to the widget so verifiers can reuse them.
   - Register the component in `src/widgets/registry.tsx` and its metrics/observes/scenes in `src/widgets/manifest.ts`.
3. Write `src/content/packs/<id>.ts` with `definePack({...})`. Required: hook (1-2 cast lines), ≥1 prediction (each with an `observe` event), widget, 2-6 mechanism captions (≤60 words), ≥1 challenge, explain-back rubric, ≥6 reviews across ≥3 formats, Codex card, interview angles, sources. Add `deeper` sections and `honestPhysics`.
4. Calibrate the challenge with `scripts/calibrate.ts`, then add `verify` blocks that pin the claims (e.g. "24 workers fails, 28 wins"). Add verifier functions in `src/content/verifiers.ts` if needed, and `tune` scenarios in `src/content/scenarios.ts`.
5. Import the pack in `src/content/packs/index.ts`.
6. `npm test` must be green (lint + verification). Then play it end to end (`/mission/<id>`) and extend `e2e/` if the flow is new.
7. After drafting a track, run the accuracy pass (a fact-check subagent) and log it in `CONTENT_PLAN.md`.

## AI provider (Groq)

- Runtime AI is Groq's OpenAI-compatible API, called with plain `fetch` from `src/server/ai.ts` (no SDK). Key: `GROQ_API_KEY` in `.env` (gitignored), read server-side only.
- Routes: `/api/ai/status`, `/api/ai/grade` (gpt-oss-120b, strict JSON-schema output, medium reasoning), `/api/ai/hint` (gpt-oss-20b, low reasoning). `include_reasoning: false` always.
- Model IDs and runtime prices only in `src/config/models.ts`. The lessons' price sheet (Claude list prices the AI track teaches with) is `src/content/prices.ts`; never couple the two, or a provider change moves calibrated challenges.
- The ledger is `.nines/usage.json`; the monthly cap is `NINES_MONTHLY_BUDGET_USD` (default $5). Free tier: 30 requests/min, 8,000 tokens/min; a 429 falls back to offline behaviour.
- Groq caches matching prompt prefixes automatically on gpt-oss (cached tokens at half price): keep system prompts stable and first, volatile content last.
- Every feature must work without a key (self-graded rubric, scripted hints). The offline tokenizer (o200k) is exact for gpt-oss.
