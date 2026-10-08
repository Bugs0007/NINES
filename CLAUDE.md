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
| Preview a section intro | `/dev/intro?id=chapter:a1` (also `chapter:b1`, `section:shift`, `section:incident`, `section:codex`, `boss:boss-the-bill`) |
| Production build + local prod server | `npx next build` then `npx next start -p 3200` (sign-in needs `AUTH_SECRET` in production) |
| Regenerate app icons | `npx tsx scripts/gen-icons.mts` (from `src/app/icon.svg`) |

Windows + OneDrive notes: installs are slow here. If Vitest dies with "Cannot find native binding" run `npm i --no-save @rolldown/binding-win32-x64-msvc`. Fonts are committed in `src/fonts/` because `next/font/google` can't fetch on this network.

## Layout

```
src/
  app/            Next.js routes (App Router). /mission/[id], /api/claude/*, /dev/widget/[id]
  engine/         Pure TS discrete-event sim. sim.ts (core), host.ts + sim.worker.ts (worker), useSim.ts (React)
  content/        graph.ts (whole curriculum), schema.ts (Zod + lint), packs/*.ts, verifiers.ts, scenarios.ts,
                  learning.ts (what each concept/chapter/section teaches and why), prices.ts (the lessons' price sheet)
  widgets/        Interactive widgets. registry.tsx (id -> component), manifest.ts (metrics/observes/scenes)
  mission/        Mission Runner, Boss Runner, and their panels (hook, predict, reveal, mechanism, challenge, explain, debrief)
  hq/             HQ: uptime headline, infrastructure map (decay states), dock
  campaign/       Chapter view (missions, boss, side incidents)
  shift/          Daily Shift (reviews, micro-challenge, Estimathon)
  review/         Review card formats and diagrams
  codex/          Codex cards, search, calibration profile
  incident/       Incident Room scenarios and war-room panels
  settings/       Settings page
  intro/          Section intros: SectionIntro (frame), scenes.tsx (animated SVG scenes), specs.ts, useIntro
  learn/          The "How NINES teaches" page (/learn)
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

## Design tokens ("Dusk": spec in `DESIGN.md`, tokens in `src/app/globals.css`, canvas mirrors in `src/ui/palette.ts`)

| Token | Use |
|---|---|
| `bg-0 … bg-3` | Blue-slate surfaces, page to raised |
| `line`, `line-2`, `line-3` | Hairlines and borders (cards usually at `/60`–`/80`) |
| `ink-0 … ink-3` | Text: parchment primary, secondary, muted, disabled |
| `phos` (sage) | Healthy, success, live and good |
| `amber` (sand) | Interactive, primary action, focus, attention |
| `alert` (coral) | Failure, alarms, destructive |
| `sky` / `lilac` | Information and memory / the AI track |
| `font-display` | Fraunces: headings and big readouts (`font-semibold`, sentence case; `num-display` for numbers) |
| `font-sans` | Figtree: everything you read; small labels use `eyebrow` |
| `font-mono` | IBM Plex Mono: only live numbers, code, logs, IDs (`tabular`) |
| `shadow-card` / `shadow-glow-*` | Soft lift; glow variants are a faint halo, not neon |

Never: ALL-CAPS, letter-spaced labels, `[ bracket ]` labels, mono prose, text under 11px, hard-coded hex (use tokens or `PALETTE`).

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
3. Add the concept's `canDo` / `why` / `keyIdea` to `src/content/learning.ts` (a test requires it for every built node). Write `src/content/packs/<id>.ts` with `definePack({...})`. Required: hook (1-2 cast lines), ≥1 prediction (each with an `observe` event), widget, 2-6 mechanism captions (≤60 words), ≥1 challenge, explain-back rubric, ≥6 reviews across ≥3 formats, Codex card, interview angles, sources. Add `deeper` sections and `honestPhysics`.
4. Calibrate the challenge with `scripts/calibrate.ts`, then add `verify` blocks that pin the claims (e.g. "24 workers fails, 28 wins"). Add verifier functions in `src/content/verifiers.ts` if needed, and `tune` scenarios in `src/content/scenarios.ts`.
5. Import the pack in `src/content/packs/index.ts`.
6. `npm test` must be green (lint + verification). Then play it end to end (`/mission/<id>`) and extend `e2e/` if the flow is new.
7. After drafting a track, run the accuracy pass (a fact-check subagent) and log it in `CONTENT_PLAN.md`.

## AI provider (Groq)

- Runtime AI is Groq's OpenAI-compatible API, called with plain `fetch` from `src/server/ai.ts` (no SDK). Key: `GROQ_API_KEY` in `.env` (gitignored), read server-side only.
- Routes: `/api/ai/status`, `/api/ai/grade` (gpt-oss-120b, strict JSON-schema output, medium reasoning), `/api/ai/hint` (gpt-oss-20b, low reasoning). `include_reasoning: false` always.
- Model IDs and runtime prices only in `src/config/models.ts`. The lessons' price sheet (Claude list prices the AI track teaches with) is `src/content/prices.ts`; never couple the two, or a provider change moves calibrated challenges.
- Spend and quotas go through `src/server/store.ts` (Postgres when `DATABASE_URL` is set, else `.nines/store.json`). Caps: `NINES_MONTHLY_BUDGET_USD` (default $5) and a daily cap; per-person daily quotas by role (`src/config/ai.ts`). Free tier: 30 requests/min, 8,000 tokens/min; a 429, quota, or cap falls back to offline behaviour.
- Groq caches matching prompt prefixes automatically on gpt-oss (cached tokens at half price): keep system prompts stable and first, volatile content last.
- Every feature must work without a key (self-graded rubric, scripted hints). The offline tokenizer (o200k) is exact for gpt-oss.
- A per-browser switch turns the coach off (`localStorage['nines:ai'] = 'off'`, in Settings). The e2e suite starts every context with it off (`storageState` in `playwright.config.ts`), so tests never call the live provider.

## Accounts, progress, roles (public build: DEPLOY.md, SUPABASE_SETUP.md, D-021, D-022)

- Guests play fully with progress in IndexedDB; level 1 is never gated. Signing in (Supabase Auth: Google or an emailed link/code, no passwords) syncs progress: the browser sends the save and derived progress rows to `/api/progress`, which validates every row (`src/content/progress-model.ts`), rate-limits, and stores them with the service-role key. Browsers can only read their own rows (RLS in `supabase/migrations/`); never add a write policy for `anon` or `authenticated`.
- Server identity is `currentUser()` in `src/auth.ts` (`src/server/supabase.ts` for the clients). Roles: guest, player, admin (`ADMIN_EMAILS`, confirmed addresses only). Check roles server-side, never only in the client. `/admin` and `/dev/*` (in production) are admin-only and 404 for everyone else.
- With no Supabase env, sign-in is a dev-only email cookie (`/api/dev-login`) and `src/server/store.ts` uses `.nines/store.json`; the e2e suite relies on this. `store.ts` is the only module that touches the database.
- Players' own AI keys (`src/ai/byok.ts`) live only in `localStorage["nines:byok"]` and go straight from the browser to Groq or Anthropic. No server code may import that module or read that key; `tests/content/byok.test.ts` enforces it. Keep them out of the save, export and analytics.
- Analytics (`src/analytics/`) is PostHog, anonymous, cookieless, event counts only, opt-out in Settings. Report through `track()`; never send typed content.
- First-run order is briefing, then the sign-in prompt (`StartPrompt`, skippable, "Continue as a guest"), then a username if signed in (`UsernameDialog`, `/api/profile`), then the HQ tour. `src/account/gate.ts` enforces the order. "Seen" lives in `src/game/seen.ts` (save plus a localStorage flag) and is set when a thing STARTS, not when it ends; a server save import merges `seen` (`src/game/merge.ts`). Never mark first-visit things seen on close.
- First-visit overlays (the briefing and the HQ tour) are skipped by `localStorage["nines:onboarding"] = "off"`, which the e2e storage state sets. Section names and their bracketed contents come from `src/content/sections.ts`; never hard-code a section label in a component.
- Tests: `npx playwright test` (local mode: Supabase env is blanked in `playwright.config.ts`, dev email login, JSON store) and `npm run test:e2e:real` (opt-in, real Supabase from `.env`, real emailed-code sign-in with delivery swallowed, creates and deletes throwaway users). `npm run db:migrate` applies `supabase/migrations/*.sql` using `SUPABASE_DB_URL`.
- Public text must not name the author, their company, or their city: `tests/content/edition.test.ts` fails if it does.
