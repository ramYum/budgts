# Legacy Budgts brand — superseded

Do not use this folder for product UI work. The active brand source is
`New Branding guidelines.png` and `New Assets.svg`; the running application consumes its
prepared assets from `public/brand/` and the tokens in `src/app/globals.css`.

The material below is retained only as historical reference for the previous identity.

# Previous Budgts brand

| File | What it is |
| --- | --- |
| `Branding-guidelines.html` | Editable source for the old brand sheet. The rendered PNG (`../Branding-guidelines.png`) has been deleted — superseded by `../New Branding guidelines.png`. |
| `Logo.png` | The original logo supplied by the owner. Source of truth for the mark. |
| `budgts-mark.svg` | The mark, single colour (`currentColor`). Clean vector redraw of `Logo.png`. |
| `budgts-mark-volt.svg` / `-pine.svg` / `-paper.svg` | Same mark, colour baked in. |
| `budgts-logo-horizontal.svg` / `budgts-logo-stacked.svg` | Mark + `budgts` wordmark lock-ups. |
| `favicon.svg` | Lime mark on a pine rounded square. |
| `tokens.css` | Design tokens (colour + type) as CSS variables, light/dark. Import at the app root. |
| `mark.mjs` | Generator for the mark SVGs — edit the rect list here, not the SVGs by hand. |

## Colours

`#B5FF00` Volt Lime · `#001E16` Deep Pine · `#141918` Carbon · `#FFFFFF` Paper ·
`#EEF4E2` Avocado (page wash) / `#E4EDCF` Avocado-2 (soft chips).
Semantic: over-budget `#FF5C3A`, approaching `#FFC24B`, info `#7FB2FF`. Full ramps in the PNG and `tokens.css`.

**Colour budget per screen:** ~75% Avocado page + white cards · ~10% Deep Pine (primary
buttons, the one balance card, the active tab, headings) · ~4% Volt Lime (logo mark +
progress fills only — never a button) · ~5% Avocado-2 · rest neutral grey. One Pine block
per screen, never two.

## Logo

The mark is **always** a Volt Lime symbol on a Deep Pine rounded square (`favicon.svg`
style) — the bare lime mark vanishes on the light page. `Logo` / `LogoMark` in
`src/components/logo.tsx` render this badge at any size.

## Type

Poppins (600/700) for the wordmark, headings and display numbers. Inter (400/500/600) for
everything else, with tabular figures on every amount.

## Re-rendering the sheet

```
npm run screenshot -- brand/Branding-guidelines.html brand-sheet 1600
```

Then copy the newest `screenshots/screenshot-*-brand-sheet.png` to `Branding-guidelines.png`.
Keep the page under ~8100 px tall so the 2× screenshot stays within Chrome's 16 384 px limit.

## Regenerating the mark

```
node brand/mark.mjs      # writes SVGs to brand/out4/ — copy the ones you want up into brand/
```
