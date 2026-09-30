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
  The website's are Crystal on paper. The native apps' launcher icon is the
  sign-in badge (the logo approved for Google's consent screen) on an ink
  tile (`src/lib/brand/app-icon-art.ts`): a paper disc with grid-paper dots
  and two silver sparkles, Crystal standing on a white stepped card of five
  progress cells (four lit), the ink flooding out from the badge's ring to the
  tile's edge so the icon holds its own on light and dark wallpapers. One
  44-cell grid, Crystal unchanged, a clear cell of paper around every mark.
  iOS gets one opaque 1024 square; Android an adaptive icon (the ground, card
  and sparkles in the background layer, Crystal and her cells in the
  foreground, inside the safe circle) and a themed icon of Crystal's darks.
- **Crystal's egg** (`src/lib/brand/egg-art.ts`, native apps only): a
  speckled pixel egg in Crystal's own palette (her charcoal outline, belly
  white and shade, a white glint, speckles in her head and crown browns),
  lit from the upper left. It is the apps' loading screen and their native
  splash; the same tool renders the splash image from it.

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
- **Page gutter:** 24px on a phone, on every screen (the tabs, the header,
  the welcome guide, sign-in, standalone screens), so cards sit off the
  glass; desktop keeps its own (48px beside the sidebar). A phone's copy
  wraps `pretty` (no one-word last lines); page-header gaps are 8px there so
  titles like "Savings goals" stay on one line.
- **Buttons** (`ui.tsx`): primary = red fill on a 2px raised edge (`px-raise`,
  a `drop-shadow` that paints outside the box, so rows stay aligned; one per
  view); secondary = stone line, ink on hover; danger = red line; quiet
  utilities = `TextButton`. Sizes: `md` 36px, `lg` 44px for a screen's
  closing action and standalone pages (Sign in, Sign out, 404, Offline).
- **Chips / segmented control:** selected = solid ink (`aria-pressed`); others
  = gray frame, muted text.
- **Rules:** solid 1px `--divider` (`px-rule`, `px-rule-v`); rows in one card
  are divided by `px-rows`. Spacing groups first; a rule only where rows need it.
- **Progress:** a segmented line of square cells, as tall as the bar (8px in
  rows, 10px on goal cards, 12px on lead cards) with 2px+ gaps, as many as
  fit, so a longer bar has more cells, never wider ones. The first and last
  cells sit flush with the bar's ends. One painted strip per bar (`px-cells`
  → `.px-bar`: two repeating gradients, the count from container units), not
  a node per cell; lit cells = round(share × count), at least one once
  anything counts. A step tracker (`cells={n}`) fixes the count and sizes the
  bar to fit. Ink when on track, red when near/over, green for savings. The
  figure is always printed beside it.
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
off under `prefers-reduced-motion`. Two exceptions, neither of which reflows
anything: the sign-in ticker's typing, which steps the width and caret color
of an absolutely positioned line, and the progress bars' cells stepping in,
which count up a registered `--sweep` number that only resizes the bar's own
painted background.

Entrance animations fill `backwards`, never `both`/`forwards`. A held end
keyframe leaves an identity transform on the element, which traps every
`position: fixed` descendant: the bottom sheets then open inside the page,
off-screen, instead of on the screen. `tests/unit/motion-guardrails.test.ts`
enforces this.

| Motion | Meaning |
| --- | --- |
| `page-enter` (screen rises in) | A new screen arrived |
| `reveal` cascade (`--i`) | Reading order of the sections |
| `cell` (stepped, sprite-like) | Magnitude being built, cell by cell (charts) |
| `cells-sweep` (`.px-bar`) | A progress bar's cells arrive left to right, one whole cell at a time, over the same 352ms whatever the bar's length; stacked rows start a step later each (`start`) |
| Robin blink / chirp / hop | The brand is alive: a single then a double blink every 4.8s, a two-note chirp every 4s (`--robin-chirp`), a hop on hover. Runs wherever the robin shows, the header logo included |
| Crystal on Home (`crystal-*`, `crystal-perch.tsx`, `src/lib/crystal/roam.ts`) | Your budget buddy walks the top edge of the Money left card: she flutters down onto its middle (the art's raised-wing frame, `wingUp`), lands with a squash and a dust puff, says hi, then one note on the month ("55% saved!"). Then she roams it end to end: 2-4 small hops at a time (36px on a phone, 48px wider), 4.5-8.5s rests between, the odd peck, turning back at each end, a "+$" rising from her chirp while the month is saving, and at most every 8s, while she rests, a line of encouragement to the month's mood (`crystalCheers`: getting started, regrouping, or keeping a saving month going), wrapping to two lines on a phone. Noticed, never distracting: she stays put while she talks, and pauses while the card is off screen or the tab is hidden. Tap her: she jumps, flaps, chirps back, hearts and sparkles fan out, and she says the next line, her bubble opening toward the middle of the card. Motion off: she sits in the middle with her note |
| Rolling figures (`roll-*`, `rolling-amount.tsx`) | Money settles into place: each digit's reel spins in (ones and cents a full lap), left to right, then glides to each new value. Clipped to the digits' own ink band, so a rolling reel never shows stray fragments. Resting style is the final figure |
| Scroll reveal (`reveal.tsx`) | A block that starts below the fold waits, and its cells and reels play as it scrolls into view, not unseen at load |
| Over-budget flash (`cells-over`) | An over row fills, then flashes twice once it's full |
| Idea lamp (`lamp`) | "What can I change?" switches on: the bulb catches, stutters, holds |
| Sign-in stage (`stage-*`, `saving`, `wm-*`, `ticker-*`) | The brand's one big moment, on an 8s beat: the robin hops within ±8px of center (4px sprite steps), turns and chirps; a "+$" saving rises from each chirp; the wordmark steps in, then ripples when the robin lands; five savings lines type and erase in turn |
| Welcome guide (`src/components/tour/guide.module.css`) | Teaching by showing: each card enters from the direction of travel and its heading rises word by word; its scene acts out the feature (Crystal drops in and says hi, purchases land, a "?" flips to its category, Money Left counts up, a saving lands on a goal, confetti and a tour of the four tabs at the end). Every scene's resting state is its finished state |
| `press` (scale 0.98) / `lift` | A tap was felt / a card is interactive |
| `pip` | The active-tab marker snaps in |
| `.skeleton` sweep | Content is loading, shaped like what's coming |
| Egg loader (native apps, `egg-loader.tsx`, art and loop in `egg-art.ts`) | The app is starting, signing in or opening the account. Its first frame is the native splash's egg, standing on its blunt end, same size and place; the splash fades out over it (200ms), onto a window that is paper too (`expo.backgroundColor`), never black. Each launch holds its own splash until the loader has laid out, a warm relaunch included (`mobile/patches/expo-splash-screen+57.0.9.patch`). A row of progress cells steps in beneath it left to right (`cells-sweep`, 352ms) while the egg is already rolling: from the first step it rolls end over end half a turn right onto its pointed end, a beat, a whole turn back left past the middle, a beat, and half a turn right home, where it stands for three steps before the next lap: 37 steps of 80ms (3s), 32 of them rolling, on a 16-cell row. The lap fits the window with at least 16px of paper to each edge: where half a turn each way doesn't (under 338dp: an iPhone SE with Display Zoom, Android at its largest display size), it rolls a quarter turn each way onto its sides instead, on a 12-cell row (21 steps, 16 rolling). Either way one pre-drawn frame per step (16 per turn), each step moving it by the arc of shell that met the ground, so it rolls, never slides. The two cells it just rolled off fade behind it, ink then `--cell-past`, then back to the track; the cell under it stays track, so nothing reads as a stalk. A chase, never a bar that fills. No text; one busy progress bar to screen readers, the screens under it hidden from them. It never delays the app: when loading ends the screen beneath takes touches at once and the loader fades out (200ms, after two frames' grace so a screen taking over the load never dips it). Motion off: the standing egg on a still, full row |
| `rise` / `pop` (`--at`) | One-off entrances placed on the beat: the greeting word by word, a hero's detail lines, a tag snapping on after its chart column builds |

## Native apps (iOS + Android)

The Expo apps are **visually identical to this web system at phone width**
(owner bar, 2026-09-26). Everything in this document applies unchanged. The
native side reads the **same sources**, so the two can't drift.

**Built in Stage 2A (2026-09-29, not deployed):** the tokens, the four
primitives, fonts and type roles below, in `mobile/components/brand/*`. The
app imports the web files themselves through Metro `watchFolders`
(`mobile/metro.config.js`, `mobile/lib/brand/shared.ts`); those files stay
pure TypeScript (`tests/unit/brand-purity.test.ts`). Motion, progress cells
and Crystal's walk come with the screens in Phase 3. The first native motion,
the egg loader, came first (2026-09-29): Reanimated is installed.

| Web | Native |
| --- | --- |
| Color / spacing / type / shadow / motion tokens in `globals.css` | One `src/lib/brand/tokens.ts`, imported by the app and by `pixel-frame.ts`; `tests/unit/brand-tokens.test.ts` parses `globals.css` and fails on any difference |
| Stepped frames (`pixel-frames.css`, generated from `src/lib/brand/pixel-frame.ts`) | `<PixelFrame>`: the same `FRAMES` 9-slice, stretched exactly as `border-image` does, with react-native-svg at the view's measured size; the same transparent `k`-cell border, so padding means the same; `raise` draws `.px-raise`'s edge |
| `--shadow-card` / `--shadow-raised` | React Native `boxShadow` with the same values, on `px-card` / `px-card-raised` automatically |
| Geist + Dogica via `next/font`, the `.px-*` / `.t-*` roles | The same font files (`src/app/fonts`: Dogica, and Geist Regular / Medium / SemiBold and Geist Mono as Google Fonts' static instances of what `next/font/google` serves) via expo-font; `<Text variant>` sets each role's size, line height, tracking and weight file. React Native has no `word-spacing`, so Dogica's spaces get the same quarter-em trim as a letter-spacing on the space itself |
| Pixelarticons through `<Icon>` at 12/24/36/48 | The same glyph data (`src/lib/brand/icons.ts`, which the web `<Icon>` now draws from too; a test pins it to the package) at the same sizes |
| `shape-rendering: crispEdges` | react-native-svg always anti-aliases, so every cell edge is snapped to the device-pixel grid first (`mobile/lib/brand/snap.ts`, ties to the top-left as the rasteriser does): the same pixels, nothing to blur |
| The robin (`robin-art.ts`) and Crystal (`crystal-perch.tsx`, `src/lib/crystal/roam.ts`) | `<Robin>` from the same art at whole px per cell, every mood, the chirp and flap frames; roam logic shared; motion in Reanimated (Phase 3) |
| Motion table above (durations, `steps()`, delays) | Reanimated with the same timings and stepped easing; off under Reduce Motion. `steps()` is a Reanimated CSS keyframe animation's `steps()` timing, declared on the view: the UI thread plays it from the frame the view mounts, so sprite motion keeps time while JavaScript is busy (the egg loader's frame clock, switched on from a React effect, stood still for seconds on a busy start) |
| (native only) the loading screen and splash | `<EggLoader>` at 6px per cell (the egg is 78×90), one instance for every full-screen load (`components/loading-screen.tsx`: start-up, the sign-in link, the profile) so the egg rolls straight through the handoffs. The native splash (`expo-splash-screen`) shows its first frame: paper `#F4F4F4`, the egg centred in a 96dp/pt square, one exact-size image per Android density bucket and iOS's @3x, so the splash egg is the loader's pixel for pixel on devices at a bucket's own density (mdpi to xxxhdpi, @3x iPhones); between buckets (a 420dpi phone) and on @2x iPhones the OS scales it, slightly soft. On hide it fades out: iOS because the app sets `fade`, Android always, over the same `duration` |
| Progress cells (`.px-bar`: square cells, count = fit) | The same geometry and lit math, drawn once per bar with react-native-svg |
| 24px phone gutter, 16px card padding | Identical, inside the safe areas |

- **Native additions must not change the look:** haptics on key actions,
  iOS swipe-back, pull-to-refresh, the system keyboard and share sheet,
  native Plaid Link.
- **Proof, not eyeballing:** a screen ships only after the parity check in
  `docs/specs/2026-09-17-mobile-app-launch-design.md` §15a passes. That
  means web and native captures at the same device size, geometry within
  1pt, exact token colors, and the per-screen pixel-diff budget.
- **The primitives pass it (2026-09-29, Android emulator at 412×915,
  2.625x):** the dev screen `budgts://dev/brand` (development builds only)
  lays out every primitive at the places in `mobile/lib/brand/specimen.ts`;
  the same list drawn with the web's CSS and markup lines up within 0.38pt
  (one device pixel) for every frame, state, robin and icon, with exact
  token colours. Known difference: long Geist reading lines set up to ~1.5%
  wider on Android (3.8pt over a 250pt line), from Android's per-glyph
  advance rounding; line starts, heights and pixel/figure roles stay within
  0.76pt.

## What not to do

- No second accent color, gradients, glows or drop shadows doing layout work.
- No pixel font in reading text, figures, form labels or buttons; no Dogica
  off its 8px grid.
- No `border-radius`, hand-drawn SVG icons or a second icon set.
- No uppercase eyebrow over every section, no outline where a surface
  already separates, no em-dash in UI copy.
- No colored category dots or rainbow charts.
- No centered marketing layouts inside the app.
