# NINES visual design: "Dusk"

NINES is played for hours at a time. The interface should feel like a quiet evening workspace: warm, legible, unhurried. Excitement comes from the simulations and the story, not from the chrome. (Replaces the "Night Shift" control-room look; see DECISIONS D-018.)

## Principles

1. **Calm by default, loud only when it matters.** Surfaces are low-contrast neighbours. Colour and motion are spent on state: something healthy, something failing, something to press.
2. **Sentence case, human type.** No ALL-CAPS, no letter-spaced labels, no `[ BRACKETS ]`. Labels read like a person wrote them.
3. **Soft geometry.** Rounded cards, pill chips, gentle shadows. No neon glow, no scanlines, no hard 2px corners.
4. **Numbers are the exception to calm.** Live metrics stay tabular and steady so the eye can track them, but they are not shouted.
5. **Breathing room.** Generous padding and gaps. If a screen feels busy, remove chrome before shrinking text.

## Colour (tokens in `src/app/globals.css`, mirrors in `src/ui/palette.ts`)

| Token | Hex | Meaning |
|---|---|---|
| `bg-0` | `#0f1519` | Page (with the faint dusk wash and grain behind it) |
| `bg-1` | `#151d22` | Cards and panels |
| `bg-2` / `bg-3` | `#1b252b` / `#233038` | Inputs, raised and hover |
| `line`, `line-2`, `line-3` | `#243139` … `#42545e` | Hairlines, borders (prefer `/60`–`/80` opacity on cards) |
| `ink-0 … ink-3` | `#e4dfd5` … `#657069` | Primary text (parchment, never pure white), secondary, muted, disabled |
| `phos` (sage) | `#8fd4b2` | Healthy, success, live and good |
| `amber` (sand) | `#e8b77d` | Interactive, primary action, focus, attention |
| `alert` (coral) | `#ec8f80` | Failure, alarms, destructive |
| `sky` | `#93bde3` | Information, the Codex, review and memory |
| `lilac` | `#b9a7e8` | The AI track (Agent Foundry) |

Each accent has `-2` (hover/darker), `-3` (borders), `-dim` (tinted fills). Section colours: Campaign/Core Grid = sage, Agent Foundry = lilac, Incident Room = coral, Daily Shift = sand, Codex = sky.

Canvas and SVG code import `PALETTE` / `alpha()` / `canvasFont()` from `src/ui/palette.ts`; never hard-code hex.

## Type

| Role | Face | How |
|---|---|---|
| Headings, titles, big readouts | Fraunces (soft serif) | `font-display font-semibold` (never extrabold), sentence case. Big numbers: `num-display`. |
| Everything you read | Figtree | Default body (15px). Small labels: `eyebrow text-xs text-ink-2`. |
| Live metrics, code, logs, IDs, keyboard keys | IBM Plex Mono | `font-mono tabular`. Only for values that change or must align; never for prose or labels. |

- Minimum text size 11px (`text-[11px]`), and only for dense chart ticks. Body copy 14–15px; secondary 13px (`text-[13px]`); labels 12px (`text-xs`).
- Line length for reading: `max-w-prose` / `max-w-xl`.

## Components (`src/ui/kit.tsx`)

- **Panel**: `rounded-lg` card, `bg-bg-1/75`, soft `shadow-card`, label as an eyebrow (no brackets, no divider). Body `p-4`.
- **Button**: sentence case, `font-semibold`, `rounded-sm` (10px). `primary` (sand) for the one main action on a screen, `go` (sage) for run/ship/commit, `secondary` otherwise, `ghost` for tertiary, `danger` for destructive.
- **Chip**: pill, `text-xs font-medium`. Tones: default, ok, warn, alert, muted, info (sky), ai (lilac).
- **Segmented**: pill track; the active option is a sand pill.
- **Meter**: smooth rounded bar that shifts sage → sand → coral.
- **Led**: a small dot with a soft halo ring; `blink` is a slow breath, never on/off.

## Layout and spacing

- Page gutters `px-4 lg:px-8`; content max widths `max-w-5xl` (reading) or full width for labs.
- Cards `p-4`/`p-5`; gaps `gap-3`/`gap-4`; section spacing `mt-6`–`mt-10`.
- Radii: `rounded-xs` 6px (small controls), `rounded-sm` 10px (buttons, inputs), `rounded-md` 14px, `rounded-lg` 18px (cards), `rounded-xl` 24px (hero blocks), `rounded-full` (chips, dots).
- Responsive grids always start with `grid-cols-1`. Nothing scrolls sideways at 390px.

## Motion (`src/ui/motion.tsx`)

- Default `spring.soft`; UI transitions 200–400ms ease-out. Things settle, they don't snap.
- No blinking, flicker only for genuinely decaying services, and slow. Ambient motion (the dusk wash, map traces) is slow enough to ignore.
- Section intros and cinematics may be expressive, but always skippable and reduced-motion aware.

## Don'ts

ALL-CAPS text, `tracking-[…em]` letter-spacing, `font-mono` for prose, `[ bracket ]` labels, neon `text-shadow`, pure `#000`/`#fff`, text under 11px, `rounded-[2px]`, more than one primary button per view.
