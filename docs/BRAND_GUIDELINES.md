# Budgts Brand Guidelines

> Design language: **editorial Swiss minimalism + modern premium fintech UI +
> restrained retro/pixel branding.** The financial UI is calm, precise and
> highly readable; the pixel robin and Dogica type carry the personality.
> The app is not pixel art. (Adopted 2026-09-25; replaces the cream/coral,
> Poppins, raster-robin brand.)

Source of truth in code: `src/app/globals.css` (tokens, motion),
`src/components/ui.tsx` (primitives), `src/lib/brand/robin-art.ts` (the robin).

## Principles

1. **One number per moment.** Each screen leads with a single figure, stated
   plainly and large; everything else supports it.
2. **One accent.** Signal red marks only what earns attention: the active
   tab, the current month, an over-budget category, the primary action.
3. **Pixels are brand, not chrome.** The robin, the Dogica wordmark and
   square-cell data marks carry the retro note. Body copy, controls and
   layout stay clean and modern.
4. **Left-aligned, grid-true, generous air.** Swiss editorial restraint: no
   centered heroes, no decoration that doesn't organize content.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--charcoal` (ink) | `#111111` | Text, filled cells, selected chips, secondary-button borders |
| `--ash` (muted) | `#6E6E6E` | Secondary text (5.1:1 on white) |
| `--silver` | `#B9B9B9` | Chevrons, quiet marks |
| `--gray` (hairline/track) | `#E6E6E6` | Borders, dividers, empty cells |
| `--paper` (canvas) | `#F4F4F4` | App background |
| `--white` (surface) | `#FFFFFF` | Cards and sheets |
| `--signal` | `#E54848` | Accent for **graphics only** (3.9:1 on white) |
| `--signal-strong` | `#D63C3C` | Accent as a fill behind white text: primary buttons (4.6:1) |
| `--signal-ink` | `#C93434` | Accent as text: negative figures, "Over by" (5.2:1) |
| `--growth` | `#18794A` | Money in (income amounts) only |

Light theme only. Category identity is carried by icon + name, never by hue.

## Typography

- **Geist** for all UI text and figures (`tnum` for amounts, tight tracking on
  large numbers). Hero figure 40px/600, screen titles 22px, section heads 15px,
  body 14px, meta 12–13px muted.
- **Geist Mono** is available for technical labels (rarely needed).
- **Dogica** (Roberto Mocci, SIL OFL 1.1, `src/app/fonts/dogica/`) for brand
  moments only: the wordmark (Dogica Bold) and small uppercase tags such as
  `TRACK : PLAN : GROW` (Dogica Pixel). Set at multiples of 8px so it stays
  crisp. Never for body copy, numbers or controls.

## Logo & mascot

- **Mark:** the pixel robin (24×20 cells + outline), facing right, red breast,
  three red chirp marks. Rendered as SVG with `crispEdges`; always an integer
  scale in raster exports.
- **Wordmark:** "Budgts" in Dogica Bold, live text.
- **Lockup:** mark left, wordmark right (`<Logo />`). The robin in the logo is
  alive: it blinks and chirps on a loop. Sign-in centers the brand stage
  (`src/app/(auth)/brand-stage.tsx`): the robin, the wordmark, the
  `TRACK : PLAN : GROW` tag, a short red rule and a typed savings line.
- **Name:** the robin is **Crystal** (she). She introduces herself in the
  welcome guide and narrates it; her name tag is Dogica Bold, "CRYSTAL". On
  Home she lives beside the greeting and reacts when tapped; her speech
  bubbles are ink pixel chips in Dogica Bold with a stepped tail.
- **Moods:** `normal`/`happy` (chirping: the beak opens twice while the marks
  sound; the marks rest hidden while animated), `curious` ("?", used for
  errors and a negative month), `sleepy` (eyes shut, "z", used for empty lists
  and offline).
- **App icons:** generated from the same art by `node tools/generate-app-icons.mjs`.

## Components

- **Shape rule:** cards and sheets 16px radius (sheets 24px top), controls
  (buttons, inputs, icon buttons) 12px, selected chips/tags use the stepped
  `.pixel-corners` edge. No pill buttons.
- **Buttons:** primary = red fill, white label (one per view); secondary =
  white with a 1px ink border; quiet utilities = text buttons.
- **Chips / segmented control:** selected = solid ink, pixel corners; others =
  hairline outline, muted text.
- **Progress:** a row of 16 square cells; ink when on track, red when
  near/over. The figure is always printed beside it.
- **Charts:** server-rendered square cells, no chart library. Trend = two-cell
  columns, past months gray, current month red with a tagged value. Breakdown
  = a ring of cells, largest share in red, the rest down a gray ramp, with a
  legend naming every slice and its share.
- **Icons:** Phosphor, regular weight; `fill` marks the active tab. Category
  icons sit on a quiet 12px tile.
- **Lists:** one white sheet with hairline dividers; day groups use a quiet
  header band inside the sheet.

## Motion

Every animation communicates something, uses transform/opacity only, and is
off under `prefers-reduced-motion`. The one exception is the sign-in ticker's
typing, which steps the width and caret color of an absolutely positioned
line, so nothing around it reflows.

Entrance animations fill `backwards`, never `both`/`forwards`. A held end
keyframe leaves an identity transform on the element, which traps every
`position: fixed` descendant: the bottom sheets then open inside the page,
off-screen, instead of on the screen. `tests/unit/motion-guardrails.test.ts`
enforces this.

| Motion | Meaning |
| --- | --- |
| `page-enter` (screen rises in) | A new screen arrived |
| `reveal` cascade (`--i`) | Reading order of the sections |
| `cell` (stepped, sprite-like) | Magnitude being built, cell by cell |
| Robin blink / chirp / hop | The brand is alive: a single then a double blink every 4.8s, a two-note chirp every 4s (`--robin-chirp`), a hop on hover. Runs wherever the robin shows, the header logo included |
| Crystal on Home (`crystal-*`, `crystal-perch.tsx`) | Your budget buddy lives beside the greeting: she flutters down (the art's raised-wing frame, `wingUp`), lands with a squash and a dust puff, says hi, then one note on the month ("55% saved!"). Her 16s life loop waits for the bubbles, then: a flutter-hop, a "+$" rising from a chirp while the month is saving, a look back at your greeting, two pecks. Tap her: she jumps, flaps, chirps back, hearts and sparkles fan out, and she lands and says the next line. Motion off: she sits with her note |
| Rolling figures (`roll-*`, `rolling-amount.tsx`) | Money settles into place: each digit's reel spins in (ones and cents a full lap), left to right, then glides to each new value. Clipped to the digits' own ink band, so a rolling reel never shows stray fragments. Resting style is the final figure |
| Scroll reveal (`reveal.tsx`) | A block that starts below the fold waits, and its cells and reels play as it scrolls into view, not unseen at load |
| Over-budget flash (`cells-over`) | An over row fills, then flashes twice once it's full |
| Idea lamp (`lamp`) | "What can I change?" switches on: the bulb catches, stutters, holds |
| Sign-in stage (`stage-*`, `saving`, `wm-*`, `ticker-*`) | The brand's one big moment, on an 8s beat: the robin hops within ±8px of center (4px sprite steps), turns and chirps; a "+$" saving rises from each chirp; the wordmark steps in, then ripples when the robin lands; five savings lines type and erase in turn |
| Welcome guide (`src/components/tour/guide.module.css`) | Teaching by showing: each card enters from the direction of travel and its heading rises word by word; its scene acts out the feature (Crystal drops in and says hi, purchases land, a "?" flips to its category, Money Left counts up, a saving lands on a goal, confetti and a tour of the four tabs at the end). Every scene's resting state is its finished state |
| `press` (scale 0.98) / `lift` | A tap was felt / a card is interactive |
| `pip` | The active-tab marker snaps in |
| `.skeleton` sweep | Content is loading, shaped like what's coming |
| `rise` / `pop` (`--at`) | One-off entrances placed on the beat: the greeting word by word, a hero's detail lines, a tag snapping on after its chart column builds |

## What not to do

- No second accent color, gradients, glows or drop shadows doing layout work.
- No pixel font in body copy, figures or buttons.
- No colored category dots or rainbow charts.
- No centered marketing layouts inside the app.
