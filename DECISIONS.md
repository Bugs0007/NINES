# Decisions

Architecture decision log. Newest at the bottom. Each entry: context, decision, why, consequences.

---

### D-001 · Next.js 16 App Router + React 19 + TypeScript 5.9 (strict)
- **Context:** The brief asks for Next.js App Router + strict TS. npm's `latest` TypeScript is 7.x (the native Go port).
- **Decision:** Pin `typescript@5.9`. Next 16 with Turbopack.
- **Why:** TS 7 is new; Next's type-checking integration and several libraries still assume the 5.x API. 5.9 is stable and strict mode is identical for our purposes.
- **Consequence:** Revisit when Next officially documents TS 7 support.

### D-002 · Canvas 2D instead of PixiJS for particles and the flow view
- **Decision:** Hand-rolled Canvas 2D renderer (`src/ui/flow`), batched by colour, with `devicePixelRatio` scaling.
- **Why:** 2,000 particles is ~2,000 `arc`/`fillRect` calls per frame, well inside Canvas 2D's budget on a mid-range laptop and phone when batched into a handful of paths per colour bucket. PixiJS v8 adds ~450KB and a second scene graph to keep in sync with React for no visual gain at this scale.
- **Consequence:** If the Sandbox ever needs >10k particles or shaders, swap the renderer behind the same `FlowRenderer` interface.

### D-003 · Raw Web Audio API instead of Tone.js
- **Decision:** A small custom audio engine (`src/audio`) on the Web Audio API.
- **Why:** Everything we need (oscillators, envelopes, filters, noise bursts, scheduling on `AudioContext.currentTime`) is native. Tone.js is ~350KB, brings its own transport and timing model, and we'd use a fraction of it. A custom engine also makes the latency->pitch sonification and voice-limiting explicit.
- **Consequence:** Generative music is written by hand (drone + scheduler). Fine for ambient beds.

### D-004 · Deterministic discrete-event simulation (not fluid/analytic models)
- **Decision:** Event-driven sim with seeded RNG; every request is an entity (up to ~20k rps of sim traffic, sampled above that).
- **Why:** The brief requires behaviour that *emerges* (saturation blowup, retry storms, hit ratios, tail amplification). Analytic formulas would hard-code the lesson. Determinism gives us slow-motion replays and testable content claims.
- **Consequence:** Heavy scenarios need the sampling mode described in GAME_DESIGN 7.6, disclosed in Honest physics.

### D-005 · The sim runs in a Web Worker, with a synchronous fallback
- **Decision:** `src/engine/worker.ts` hosts a `SimHost`; UI talks to it via a typed message protocol. Tests and tiny widgets can run the engine synchronously on the main thread.
- **Why:** Keeps 60fps rendering independent of sim load. The sync path keeps unit tests simple and lets small widgets avoid worker startup latency.

### D-006 · Local-first persistence with Dexie; Zustand for UI state
- **Decision:** Dexie (IndexedDB) is the source of truth for progress; Zustand holds the hydrated in-memory view and writes through.
- **Why:** Works offline and on phone, no backend needed for the single-player game. Sync to Postgres (Neon) is a later optional phase.

### D-007 · FSRS card = concept, not review item
- **Decision:** One `ts-fsrs` card per concept. Each review picks a review item from that concept's pool (varying formats, avoiding the last one shown).
- **Why:** The brief schedules *concepts*. Item-level cards would let you memorise individual questions; concept-level cards with rotating formats test the idea.

### D-008 · The planned curriculum lives in code (`src/content/graph.ts`)
- **Decision:** The full prerequisite graph is a typed array; `CONTENT_PLAN.md` tables are generated from it (`npm run content:plan`).
- **Why:** The HQ map needs every planned concept (to draw blueprints), the lint needs to validate prerequisites, and a hand-maintained markdown table would drift.

### D-009 · Content claims are verified against the engine
- **Decision:** Concept packs may contain `verify` blocks (scenario + expected metric range). A Vitest suite runs them.
- **Why:** "Numbers must be realistic" is easy to write and hard to keep. If a mechanism caption says p99 triples, the sim must agree.

### D-010 · Offline tokenizer proxy: `gpt-tokenizer` (o200k_base)
- **Decision:** Tokenizer Slicer splits text with a real BPE (o200k_base) offline, labelled as a proxy. With an API key, it also shows Claude's exact count from the token-counting endpoint.
- **Why:** Claude's tokenizer isn't published. A real BPE teaches the true mechanics (subwords, whitespace, digits, non-Latin scripts inflating counts); the honest-physics note covers the difference.

### D-011 · Fonts: Big Shoulders Display (+ Stencil) + IBM Plex Sans + IBM Plex Mono, self-hosted
- **Why:** Condensed industrial display face reads as control-room signage and is distinct from the usual AI-product look; Plex Sans/Mono are engineered, highly legible at small sizes, and have tabular figures for metrics.
- **How:** Latin-subset woff2 files from Fontsource are committed in `src/fonts/` and loaded with `next/font/local`. `next/font/google` fetches at build time and failed on a slow network; self-hosting also makes the PWA work offline. All four families are SIL Open Font License.

### D-012 · Claude usage ledger on the server filesystem (local), Postgres later
- **Decision:** `.nines/usage.json` (gitignored) records cost per call; the hard monthly cap is enforced server-side before each call.
- **Why:** The key and the budget must be enforced where the key lives. A file is enough for local single-user use; the Vercel phase will move it to Postgres.

### D-013 · React Compiler lint advisories are warnings, not errors
- **Context:** `eslint-config-next` now ships the React Compiler rules. NINES doesn't run the compiler.
- **Decision:** `react-hooks/set-state-in-effect`, `react-hooks/refs`, and `react-hooks/preserve-manual-memoization` are warnings. Purity, immutability, and use-before-declare stay errors.
- **Why:** The flagged patterns are deliberate: widgets sync to a narrated `scene` prop, and hooks keep the latest callbacks in a ref. The rules that stayed errors caught real bugs (a render-time `Date.now()` that ignored the time-warp clock).

### D-014 · The 60fps bar is measured on the hardware GPU
- **Context:** Headless Chromium composites in software and caps every page near 30fps, including an empty canvas with zero particles. CPU profiling showed the renderer's JS at about 10% of the main thread.
- **Decision:** `e2e/perf.spec.ts` launches Chromium with ANGLE/D3D11 and skips itself when only a software renderer exists. Result: 1,969 particles at 60fps, p95 frame 16.8ms (RTX 4050 laptop).
- **Consequence:** FlowView also drops its additive glow pass when the frame-time average runs long with many particles, as insurance for weak phones.

### D-015 · Unbuilt content appears only as blueprints on the HQ map
- **Decision:** Lists (Incident Room, chapter rows) show only content that exists in the build. The HQ map keeps drawing the whole curriculum as blueprint lots.
- **Why:** The brief rules out "coming soon" tiles. The map's blueprints are the curriculum itself (D-008), not placeholders for a feature; a list row that says "not yet constructed" is.

### D-016 · Context Tetris is a stylized model, priced from the real config
- **Decision:** A deterministic model (`src/widgets/context/model.ts`): a 32k window over a 40-turn chat; a question is answerable when the needed fact is in the request; lost-in-the-middle applies to buried docs in a crowded window; a router sends 20% of turns to the Sonnet-class model; TTFT is a fixed overhead plus prefill on uncached input. Prices and cache multipliers come from `src/config/models.ts`.
- **Why:** The lesson is the arithmetic (re-sent history, quadratic cost, what falls out) and the trade-offs between policies, which a model shows exactly and reproducibly; honest-physics notes disclose the simplifications.
- **Consequence:** In The Bill the dollar figure stays hidden until you ship, so the forecast is an estimate from tokens and the price sheet, not a read-off.

### D-017 · Runtime AI moves from Claude to Groq; the lessons keep Claude as reference
- **Context:** Bhagath won't add an Anthropic key; he added `GROQ_API_KEY`.
- **Decision:** Grading and hints call Groq with plain `fetch` (`src/server/ai.ts`): `openai/gpt-oss-120b` grades with strict JSON-schema structured outputs, `openai/gpt-oss-20b` gives hints. Reasoning effort is set per route and reasoning text is never returned. The Anthropic SDK and the token-count route are removed.
- **Why:** Same shape as before (capable model for judgement, cheap model for chatter), structured outputs with constrained decoding, automatic prefix caching, and prices low enough that the $5 cap covers thousands of grades (a grade costs about $0.0006).
- **Consequence:** The AI-engineering lessons still teach with Claude's pricing and docs (a stable, sourced reference), now in `src/content/prices.ts`, decoupled from the runtime config so switching providers can't shift a calibrated challenge. The Tokenizer Slicer's o200k counts are now exact for the models NINES actually calls.

### D-018 · "Dusk" replaces the "Night Shift" control-room look
- **Context:** First playtest: the UI "looks too artificial and robotic"; Bhagath wants something soothing to look at for hours.
- **Decision:** A new design system (DESIGN.md): blue-slate surfaces, parchment ink, sage/sand/coral plus sky and lilac accents; Fraunces + Figtree (self-hosted), mono only for live numbers and code; sentence case; rounded cards and pills; soft shadows; a faint dusk wash instead of scanlines; softer sounds. A codemod (`scripts/codemod-dusk.py`) did the mechanical part (colours, ALL-CAPS, letter-spacing) and four agents restyled each area by hand against the spec, checked with screenshots at 1440px and 390px.
- **Why:** The robotic feel came from type and texture (all-caps mono labels, brackets, neon, scanlines, hard corners), not from layout, so it could be fixed at the token and component level without touching game logic.

### D-019 · A learning layer and section intros, from one source of truth
- **Context:** Bhagath couldn't see how the game is designed to teach, which parts teach what, or why he's learning it; and wanted game-style openers for each section.
- **Decision:** `src/content/learning.ts` holds, per concept, what you can do afterwards, why it matters, and the key idea; per chapter, outcomes, why, and payoff; per section, what it trains and the learning reason. Section intros (`src/intro/`: animated SVG scenes + that text), chapter pages, mission hooks and debriefs, and the `/learn` page all read from it. A test requires an entry for every built node.
- **Why:** One place to write "what and why" keeps it short, consistent, and impossible to forget when a concept ships.

### D-020 · The AI coach has a per-browser off switch; tests use it
- **Context:** With a key configured, the e2e suite was grading explanations through the live provider (slow, rate-limited, costs money, nondeterministic).
- **Decision:** `localStorage['nines:ai'] = 'off'` makes the browser treat the coach as unavailable (offline paths everywhere). It's a Settings option for players who prefer self-grading, and Playwright starts every context with it via `storageState`.

### D-022 · Launch polish: Supabase accounts, a briefing, plain-language sections, bring-your-own AI key
- **Context:** The public launch brings strangers, mostly on phones. They need to know what each section holds, why the game exists, and what to press; the build must carry no personal references; and tracking has to be useful without gating play or over-collecting.
- **Decision:** Auth and storage move from Auth.js + Neon to Supabase (Google and emailed link/code, Postgres with RLS). Browsers read their own rows only; every write goes through server routes that validate against the curriculum and rate-limit. Progress rows (`profiles`, `progress`) are the admin's view; the synced save blob is kept so reviews follow a player across devices (disclosed on /privacy). Section labels ("Core Grid (System Design: ...)") are generated from the graph and registries (`src/content/sections.ts`). A four-screen briefing replaces the welcome intro. Analytics is anonymous PostHog counts, cookieless, opt-out. Players may use their own Groq or Claude key, kept in localStorage and called directly from the browser, so we never see it. The personal "owner edition" is removed; the owner role becomes a plain admin allowlist.
- **Why:** Neon + Auth.js had no magic link, no per-level data and no funnel. Direct browser-to-provider calls make "we don't collect your key" literally true. Generated labels can't drift from content.
- **Consequence:** The server cannot prove a level was played (the sims run in the browser), so progress is validated for plausibility, not trusted as anti-cheat. Magic links only complete in the requesting browser (PKCE), so emails carry a code too. Public text is guarded by a test.

### D-021 · Public launch: optional accounts, owner edition, capped shared AI
- **Context:** Bhagath is sharing NINES on LinkedIn for anyone to play. Personal content (Case Intel) should stay his only.
- **Decision:** Guest-first: no sign-in wall, progress local. Optional Auth.js sign-in (Google, GitHub) syncs progress through a small server store (Neon Postgres in production, a JSON file locally). Roles guest / player / owner; the owner (OWNER_EMAILS) gets the personal edition and `/admin`. The shared Groq key is protected by per-person daily quotas (guests keyed by a salted hash), a daily cap, and the monthly cap, all falling back to self-grading. Hosting on Vercel; repo stays private.
- **Why:** Zero-friction trial matters most for a social post; accounts only add value (sync, bigger allowance), never gate play. Editions are text-level (generic public twins), so nothing structural forks.
- **Consequence:** Server-side role checks in every protected route; a content test guards the public edition.
