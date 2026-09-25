# Budgts Brand Guidelines

**This document is the single source of truth for Budgts' visual identity** —
color, typography, logo, mascot, iconography, and component styling. It
supersedes every earlier brand reference in this repo, including
`docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md`'s palette and
asset sections (see that file's header for what still applies vs. what this
doc replaces) and any mention of `New Branding guidelines.png` / `New
Assets.svg` in `docs/conventions.md`.

It was built by studying **`Budgts Reference V2.png`** (a set of four mockup
screens: Get Started, Home, Budgets, Insights) pixel-by-pixel — colors were
sampled directly off its icons, progress bars, and chart legend, not
guessed. Typography (Poppins) is per `Assets V2.svg`'s own type specimen.
Both source files live at the repo root as local working references; they
are not part of the shipped app.

The logo and mascot artwork are the brand owner's own finished exports —
not cropped or redrawn from either reference file. See Provenance below.

## Brand positioning

> **A brighter way to budget.**

Budgts is calm, friendly, and premium — closer to a well-made health app
than a bank or a spreadsheet. The robin mascot carries personality so the
numbers don't have to feel cold. Voice: plain language, encouraging,
conversational, focused on progress over perfection. Avoid financial
jargon, alarmist framing, and traditional-bank visual clichés.

## Color

Raw palette (`src/app/globals.css` `:root`) — a pale tint for backgrounds
and a "strong" variant of the same hue for glyphs, chart fills, and
progress bars, since the mockup's own swatch values are all pale:

| Role | Pale token | Hex | Strong token | Hex |
| --- | --- | --- | --- | --- |
| Background | `--cream` | `#FFF8F0` | — | — |
| Card surface | `--surface-raw` | `#FFFDF9` | — | — |
| Text / ink | `--ink` | `#0F0F0F` | — | — |
| Coral (action/energy) | `--coral` | `#FF7B61` | `--coral-strong` | `#FF6347` |
| Sun (optimism) | `--sun` | `#FFD166` | `--sun-strong` | `#F7B733` |
| Sage (growth) | `--sage` | `#A7C7A1` | `--sage-strong` | `#3FA772` |
| Sky (clarity) | `--sky` | `#A7D8FF` | `--sky-strong` | `#4F8FE8` |
| Lavender (creativity) | `--lavender` | `#CDB8FF` | `--lavender-strong` | `#9B7FE0` |
| Pink (emotion) | `--pink` | `#FBD1E0` | `--pink-strong` | `#F0699B` |
| Gray (neutral/"other") | `--gray` | `#ECECEC` | `--gray-strong` | `#9AA0AC` |

`--coral-tint` (`#FFEBE5`) and `--sun-tint` (`#FFF3D6`) exist separately
because coral/sun are already fairly saturated at their "pale" value — icon
badges need something lighter behind them.

Never reference these raw tokens directly from a component. Style through
the **semantic roles** in the same file's `@theme inline` block —
`bg-surface`, `text-muted`, `border-border`, `bg-accent`, `bg-primary-btn`,
`bg-pos`/`bg-neg`, `bg-fill-under`/`-near`/`-over`, `bg-coral-tint`, etc.
This is enforced, not a suggestion — grep for `var(--` in `src/components`
before adding a new raw color reference; if a role you need doesn't exist,
add it to `globals.css` rather than reaching for a hex value in a
component.

### Semantic assignment (deliberately different from the mockup in one way)

- **Primary button = Sun-yellow pill, ink text.** `PrimaryButton`/
  `PrimaryLinkButton` need no color prop, they already read
  `--primary-btn`/`--on-primary-btn` (`--sun` / `--ink`). White text on Sun
  measures ~1.4–1.8:1 contrast (WCAG needs 4.5:1 for normal text), so the
  button text is ink, not white. Reserve this fill for the one primary
  action per screen (Get started, Save, Continue, Build my budget).
  `--primary-btn`/`--on-primary-btn` are deliberately separate tokens from
  `--primary`/`--on-primary` below — the button fill changed without
  repainting the hero cards or the link-style text that also reads
  `--primary`.
- **`--primary` (ink) is now hero-card- and link-only**, not a button
  token: the solid-ink hero cards (below) and `text-primary` link/accent
  usages (e.g. "See spending", "View goals") keep reading it unchanged.
- **Coral (`--accent`) is the energetic highlight**: active bottom-nav
  item (text/icon only, no filled pill — the mockup has none), the
  segmented-control active tint, the circular "+" add action, links.
- **Category colors are pale-tint background + strong-hue glyph**, sampled
  from the mockup's own icon circles and insights-donut legend (e.g.
  Groceries = sage tint bg + sage-strong basket icon). See
  `CATEGORY_ICON_MAP` in `src/components/ui.tsx`.
- **Budget progress bars keep the app's existing under/near/over
  status semantic** (sage-strong / sun-strong / coral-strong) rather than
  coloring by category the way the mockup's example screenshots do. This
  is a deliberate deviation: knowing at a glance whether a category is
  over budget is real product value the mockup's static examples don't
  need to demonstrate, and `docs/conventions.md` explicitly protects
  existing financial-status UI from being changed for cosmetic reasons.
- **Insights' "Your money story" is the one solid-ink hero card** — never
  carries the mascot, per the "no mascot on a solid ink card" rule below.
- **Home's "Money Left" hero card is `--sun` lightened 50% toward white, ink
  text** (`bg-hero-fill text-on-hero`, backed by `--sun-light` in
  `globals.css`; `src/components/dashboard-view.tsx`) — the one deliberate
  divergence from the ink hero-card treatment above. The card leads with one
  hero number and one supporting sentence (left-to-spend/budgeted and
  savings rate combined), not several separately-captioned stats, and its
  text runs at full opacity rather than a dimmed tone.

## Typography

**Poppins**, loaded via `next/font/google` in `src/app/layout.tsx`
(weights 400/500/600/700/800), replacing the previous Nunito Sans.

| Element | Weight | Size |
| --- | --- | --- |
| H1 | Bold (700) | 32px |
| H2 | Bold (700) | 24px |
| H3 | Bold (700) | 20px |
| Body | Regular (400) | 16px |
| Small | Regular (400) | 14px |
| Caption | Regular (400) | 12px |

Large money figures (the Home/Insights hero numbers) may run bigger
(~1.7–1.9rem) and bolder than H1 — they're the single most important
number on the screen. Ink (`--ink` / `--text`) is the dominant text color;
`--muted` for secondary copy (dates, captions, "of $2,500").

## Logo

The mark, mascot, and wordmark are the brand owner's own finished exports
(supplied via a local `Logo Assets V2/` folder) — never hand-redrawn, never
auto-cropped from a mockup sheet. Files live in `public/brand/`:

- `logo-mark.png` — the robin mark (the "Happy" pose). This one file is the
  source for everything that needs the mark: `LogoMark`/`Logo`
  (`src/components/logo.tsx`) in nav bars, the About screen, and compact
  contexts, **and** every generated app icon (`public/icon-512.png`,
  `public/icon-maskable.png`, `src/app/icon.png`, `src/app/apple-icon.png`
  — all regenerated from this one file, composited onto a cream `#FFF8F0`
  background; the maskable variant scales the mark down to ~68% of the
  canvas so Android's circular safe-zone mask doesn't clip the wings).
- `wordmark.png` — the raster "Budgts" lockup (dark green serif + leaf
  sprout). Used inside `<Logo>`'s `wordmark` slot instead of live text —
  a deliberate choice for this brand's custom serif treatment, which
  isn't a web font in the app's type stack. Never recolor or re-render it
  as text; if it ever needs a dark-background variant, that requires a new
  export, not a CSS filter.
- `logo-sunburst.png` — the robin perched on the "Budgts" wordmark, with
  the "A brighter way to budget" tagline baked in. The brand's one
  big-illustration moment: the sign-in/onboarding hero
  (`.brand-mascot-stage`). Not used anywhere else — it's deliberately a
  single, memorable placement, and because it already carries the
  wordmark, it's never paired with a separate `<Logo>` on the same screen.

Never recolor, distort, or redraw any of these. Always go through
`<Logo>` / `<LogoMark>` — never hardcode a `<img src="/brand/...">` for the
logo itself, except the one-off hero placement of `logo-sunburst.png` in the
auth/onboarding layouts, which isn't a `<Logo>`-shaped use (it's
illustration, not a lockup).

## Mascot

Four expressions, via the `<Mascot mood="…">` component
(`src/components/mascot.tsx`):

| Mood | File | Use |
| --- | --- | --- |
| `normal` | `mood-normal.png` | Default state, header avatar |
| `happy` | `logo-mark.png` (the mark itself — no separate file) | On-track, positive progress |
| `curious` | `mood-curious.png` | An insight/opportunity worth a look; empty states inviting an action |
| `sleepy` | `mood-sleepy.png` | Nothing needs attention (e.g. empty transaction list) |

Rules:

- Never place the mascot on a solid `--primary` (ink) card — see above.
- One mascot per screen at most, and only where it earns its place
  (a header avatar, an empty state, or a single insight card) — never as
  decoration on every card.
- Don't invent new moods without sourcing the matching art first. The
  source folder also has unused pose shots (left/right profile, looking
  up, wings open, back) that aren't wired to a mood — don't repurpose
  those as a new mood without deciding what state they'd represent first.

## Iconography

- **Category icons** (`CategoryIcon` in `src/components/ui.tsx`): a
  pale-tint circular badge with a bold, minimal inline SVG glyph in the
  matching strong hue — see the Color section. Known category names map to
  a fixed hue; an unrecognized/custom category falls back to a solid badge
  in its own stored `color` with a white glyph (arbitrary user colors can't
  be reliably split into a pale/strong pair).
- **Navigation icons** (`NavIcon` in `src/components/nav-icons.tsx`):
  simple rounded-stroke line icons, unchanged in shape by this redesign —
  only their color changed (coral when active, muted gray otherwise, no
  filled pill behind the active item on mobile).

## Components

- **Primary button** — Sun-yellow pill, ink text (`PrimaryButton`;
  `bg-primary-btn text-on-primary-btn`).
- **Secondary button** — cream/white surface, ink text, thin border
  (`SecondaryButton`).
- **Segmented control** — flat neutral-gray track, active segment gets a
  pale coral tint background with coral-strong text (`SegmentedControl`).
- **Cards** — `rounded-2xl`/`rounded-3xl`, `--surface` background, a
  hairline border (`--border`), no heavy shadows.
- **Progress bars** — `--track` trough, semantic fill color (see above).
- **Bottom nav / desktop sidebar** — active item is coral (mobile: text +
  icon only; desktop: a pale-coral-tint pill behind the row, since the
  sidebar has more room and no direct mockup to match against).

## What NOT to do

Carried forward because they remain true regardless of which mockup drove
the palette:

- Don't turn every category into a saturated rainbow — six hues, used
  consistently, is the ceiling.
- Don't put the mascot on more than one place per screen, or on a black
  card.
- Don't use financial jargon without plain-language context.
- Don't introduce a second typeface, a second mascot, gradients/glassmorphism,
  or realistic/photographic imagery — none of that appears in the source
  reference and it would read as a different brand.
- Don't change budget-status color semantics (under/near/over) to chase
  cosmetic consistency with a static mockup.

## Where things live

```
public/brand/            Logo, mascot art (see Logo/Mascot above)
src/app/globals.css       Color tokens + semantic roles, Poppins font wiring
src/app/layout.tsx        Poppins next/font setup
src/components/logo.tsx   <Logo> / <LogoMark>
src/components/mascot.tsx <Mascot mood="…">
src/components/ui.tsx     PrimaryButton, SecondaryButton, ProgressBar,
                           SegmentedControl, CategoryIcon, EmptyState, MascotMessage
src/components/nav-icons.tsx, bottom-nav.tsx, desktop-sidebar.tsx
                           Navigation icon set + active-state color rules
```

## Provenance

- `Budgts Reference V2.png` — the four-screen mockup this doc's palette,
  type scale, and component styling were sampled from.
- `Assets V2.svg` — the Poppins type specimen this doc's typography choice
  came from. It was also, briefly, an early source for logo/mascot artwork
  (an SVG wrapper around one embedded raster sheet, auto-cropped) — those
  crops had visible edge/bleed defects and have been fully replaced; it is
  **not** the source for anything in `public/brand/` anymore.
- **`public/brand/*` (logo, mascot, wordmark)** — the brand owner's own
  finished exports, supplied directly via a local `Logo Assets V2/` folder:
  a robin mascot in several poses/expressions (mapped to the mood table
  above; "Happy" doubles as the logo mark), a "Get Started Page" hero
  lockup (robin + wordmark + tagline, used as `logo-sunburst.png`), and a
  standalone "Budgts Main Text" wordmark. This supersedes an earlier
  black-cat asset set (originally from a `Downloads/Logo Assets/` folder)
  that this redesign fully replaced — nothing from that earlier set remains
  in `public/brand/`. Treat `Logo Assets V2` as final unless the brand
  owner supplies a further revision.
- The two flattened source exports (`Get Started Page.png`, `Budgts Main
  Text.png`) ship with a flat white background, not transparency — both
  were re-exported with the white keyed out to alpha (a per-pixel
  brightness threshold, not a corner flood-fill, so enclosed white regions
  like letter counters in "B"/"d"/"g" go transparent too) before landing
  in `public/brand/`, and downsized from their multi-megapixel originals to
  a size sane for a UI asset. Re-do both steps if re-exporting from source,
  then run `node tools/optimize-brand-images.mjs` once: it palette-compresses
  every brand PNG and app icon in place (PSNR 43–55 dB
  vs the exports — visually lossless; ~70% smaller). Files stay PNG at the
  same paths.
- A third file, `Branding guidelines V2.png`, was supplied alongside
  `Assets V2.svg` but was **not** used as a source for this doc — palette
  and type values here come only from `Budgts Reference V2.png` and the
  Poppins specimen in `Assets V2.svg`, per an explicit decision made while
  building this redesign.
