# Budgts Brand Guidelines

> Design language: **editorial Swiss minimalism + modern premium fintech UI +
> restrained retro/pixel branding.** The financial UI is calm, precise and
> highly readable; the pixel robin and Dogica type carry the personality.
> The app is not pixel art. (Adopted 2026-09-25; replaces the cream/coral,
> Poppins, raster-robin brand. Pixel-frame pass 2026-09-26: stepped frames and
> Pixelarticons. Soft-pixel pass the same day: borderless stepped surfaces on
> soft shadows, Geist figures, sentence-case section heads, a compact phone
> scale.)

Source of truth in code: `src/app/globals.css` (tokens, type roles, motion),
`src/lib/brand/pixel-frame.ts` (the frame table; `src/app/pixel-frames.css` is
generated from it), `src/components/ui.tsx` (primitives),
`src/components/icon.tsx` (icons), `src/lib/brand/robin-art.ts` (the robin).

## Principles

1. **One number per moment.** Each screen leads with a single figure, stated
   plainly and large; everything else supports it.
2. **One accent.** Signal red marks only what earns attention: the active
   tab, the current month, an over-budget category, the primary action.
3. **Pixel silhouettes, soft surfaces.** Stepped corners, pixel icons,
   segmented data marks, the robin and Dogica titles carry the retro note.
   Everything people read or act on (figures, labels, buttons, list rows)
   is Geist, on borderless white sheets. Quiet by default: no outlines where
   a surface already separates, no uppercase shouting.
4. **Left-aligned, grid-true, generous air.** Swiss editorial restraint: no
   centered heroes, no decoration that doesn't organize content.

## Color

| Token | Hex | Use |
| --- | --- | --- |
| `--charcoal` (ink) | `#111111` | Text, filled cells, selected chips, focus lines |
| `--ash` (muted) | `#6E6E6E` | Secondary text (5.1:1 on white) |
| `--stone` | `#949494` | Control lines: fields, secondary buttons, switches (3:1 on white) |
| `--silver` | `#B9B9B9` | Chevrons, quiet marks, past-month columns |
| `--gray` (track) | `#E6E6E6` | Hover lines, empty cells |
| `--divider` | `#ECECEC` | 1px rules between rows |
| `--paper` (canvas) | `#F4F4F4` | App background |
| `--white` (surface) | `#FFFFFF` | Cards and sheets |
| `--signal` | `#E54848` | Accent for **graphics only** (3.9:1 on white) |
| `--signal-strong` | `#D63C3C` | Accent as a fill behind white text: primary buttons (4.6:1) |
| `--signal-ink` | `#C93434` | Accent as text: negative figures, "Over by" (5.2:1) |
| `--growth` | `#18794A` | Money in (income amounts) only |
| `--signal-wash` / `--signal-line` | tints | Accent tiles and "what can I change" cards / their frame line |
| `--signal-edge` | `#9F2A2A` | The raised edge under a primary button |
| `--growth-wash` / `--warn-wash` | tints | Growth badges and tiles / warning panels |

Light theme only. Category identity is carried by icon + name, never by hue.
The frame generator's palette mirrors these tokens;
`tests/unit/pixel-frames.test.ts` fails if they drift.

## Typography

- **Dogica** (Roberto Mocci, SIL OFL 1.1, `src/app/fonts/dogica/`) sets only
  on its 8px grid, weight 400 with synthesis off, word-spacing −0.25em (one
  font pixel), never negative letter-spacing. Roles (`globals.css`):

  | Class | Size / line | Use |
  | --- | --- | --- |
  | `.px-title` | 16/24, md 24/32 | Screen and sheet titles, the greeting |
  | `.px-figure` | 16/24 | Stage headlines (404, Offline, Security, the OAuth return) |
  | `.px-figure-lg` | 32/40 | The 404 digits |
  | `.px-tag` / `.px-tag-bold` | 8/12, uppercase | Brand only: `TRACK : PLAN : GROW`, Crystal's bubble |

  Dogica never sets money or percentages: its zero reads as an eight.

- **Geist** for everything read or acted on (`globals.css` roles, phone then md):

  | Class | Size | Use |
  | --- | --- | --- |
  | `.t-num-xl` | 32 → 48, semibold, tabular | A screen's one figure (`figureSize()`) |
  | `.t-num-lg` | 22 → 28 | A card's figure |
  | `.t-num` | 17 → 20 | Secondary figures (Came in / Went out) |
  | `.t-head` | 15 → 16, semibold | Section heads, sentence case, count in muted |
  | `.t-label` / `.t-label-strong` | 12/16 | Badges, day bands, shares, small labels |

  Body 15/24, list names 15px medium, meta 13/20 muted, a figure's name 14px
  muted, form labels 14px, buttons 15px semibold, inputs 16px (iOS never
  zooms).
- **Geist Mono** is available for technical labels (rarely needed).

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

- **Shape rule: stepped frames, no border-radius.** Every card, control and
  chip is a 9-slice SVG `border-image` on a 2px cell: chips r1, controls r2,
  cards r3. A frame's border box is constant across states, so hover, focus
  and selection never shift layout; focus thickens the line instead of a
  square `outline`. Frames are defined once in `FRAMES`
  (`src/lib/brand/pixel-frame.ts`) and generated into
  `src/app/pixel-frames.css` by `node --no-warnings tools/generate-pixel-frames.mjs`;
  never edit the CSS by hand. Classes: `px-card` (a white stepped sheet, no
  line, `--shadow-card` below it), `px-card-raised` (the screen's lead card,
  `--shadow-raised`), `px-card-quiet`, `px-wash` (accent wash), `px-warn`,
  `px-band`, `px-field` / `px-search` (stone line), `px-btn` /
  `px-btn-primary` / `px-btn-danger`, `px-step` (a white square that draws
  its line on hover), `px-tile*`, `px-nav`, `px-chip`, `px-badge*`,
  `px-check`, `px-switch`. Shadows use a negative spread wider than the
  corner steps, so they only ever show below a card, never beside a notch.
- **Padding:** cards 16px inside on a phone (8px frame + 8px), 24px from md;
  lead cards 16 → 32. Icon tiles 32px on a phone, 40px from md.
- **Buttons** (`ui.tsx`): primary = red fill on a 2px raised edge (`px-raise`,
  a `drop-shadow` that paints outside the box, so rows stay aligned; one per
  view); secondary = stone line, ink on hover; danger = red line; quiet
  utilities = `TextButton`. Sizes: `md` 36px, `lg` 44px for a screen's
  closing action and standalone pages (Sign in, Sign out, 404, Offline).
- **Chips / segmented control:** selected = solid ink (`aria-pressed`); others
  = gray frame, muted text.
- **Rules:** solid 1px `--divider` (`px-rule`, `px-rule-v`); rows in one card
  are divided by `px-rows`. Spacing groups first; a rule only where rows need it.
- **Progress:** a segmented line of 16 cells snapped to whole pixels
  (`px-cells`, CSS `round()` with container units), 8px tall in rows and
  10–12px on lead cards; ink when on track, red when near/over, green for
  savings. The figure is always printed beside it.
- **Charts:** server-rendered cells, no chart library. Trend = one column of
  flat 24×4px segments per month, past months gray, current month red with a
  tagged value. Breakdown = a fine ring of 6px cells, largest share in red,
  the rest down a gray ramp, with a legend naming every slice and its share.
  Savings rate = a 10×10 waffle of 6px cells.
- **Icons:** Pixelarticons (MIT) through `<Icon name>` (`src/components/icon.tsx`),
  named by meaning so a glyph changes in one place. Only at 12/24/36/48px, the
  set's 12-cell grid, with `crispEdges`. "More" and the kebab are three solid
  cells drawn on the set's grid (its own "more" reads as diamonds). The set has
  no columned-bank glyph; `bank` is its University. The active tab reads by
  the red marker bar and ink label. Category icons sit on a quiet tile.
- **Lists:** one white card with 1px dividers; day groups are a small
  semibold label and the day's total, set off by space, not a band.
- **Standalone screens** (Offline, the bank's OAuth return, a signed-out 404):
  `<StandaloneShell>`, the brand top-left and one 440px column centred in
  the viewport, led by a dotted `<Stage>`. The route error boundary
  (`src/app/error.tsx`) and sign-in use the same system; loading skeletons
  are shaped like the screen they stand in for.

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
| Crystal on Home (`crystal-*`, `crystal-perch.tsx`, `src/lib/crystal/roam.ts`) | Your budget buddy walks the top edge of the Money left card: she flutters down onto its right end (the art's raised-wing frame, `wingUp`), lands with a squash and a dust puff, says hi, then one note on the month ("55% saved!"). Then she roams it end to end: 2-4 small hops at a time (36px on a phone, 48px wider), 4.5-8.5s rests between, the odd peck, turning back at each end, a "+$" rising from her chirp while the month is saving. Noticed, never distracting: she stays put while she talks, and pauses while the card is off screen or the tab is hidden. Tap her: she jumps, flaps, chirps back, hearts and sparkles fan out, and she says the next line, her bubble opening toward the middle of the card. Motion off: she sits at the right end with her note |
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
- No pixel font in reading text, figures, form labels or buttons; no Dogica
  off its 8px grid.
- No `border-radius`, hand-drawn SVG icons or a second icon set.
- No uppercase eyebrow over every section, no outline where a surface
  already separates, no em-dash in UI copy.
- No colored category dots or rainbow charts.
- No centered marketing layouts inside the app.
