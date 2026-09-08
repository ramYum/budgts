# Budgts brand

| File | What it is |
| --- | --- |
| `../Branding-guidelines.png` | The brand sheet — logo, colour, type, voice, application. The reference. |
| `Branding-guidelines.html` | Editable source for that PNG. Edit, then re-render (below). |
| `Logo.png` | The original logo supplied by the owner. Source of truth for the mark. |
| `budgts-mark.svg` | The mark, single colour (`currentColor`). Clean vector redraw of `Logo.png`. |
| `budgts-mark-volt.svg` / `-pine.svg` / `-paper.svg` | Same mark, colour baked in. |
| `budgts-logo-horizontal.svg` / `budgts-logo-stacked.svg` | Mark + `budgts` wordmark lock-ups. |
| `favicon.svg` | Lime mark on a pine rounded square. |
| `tokens.css` | Design tokens (colour + type) as CSS variables, light/dark. Import at the app root. |
| `mark.mjs` | Generator for the mark SVGs — edit the rect list here, not the SVGs by hand. |

## Colours

`#B5FF00` Volt Lime · `#001E16` Deep Pine · `#141918` Carbon · `#FFFFFF`/`#F4F6F2` Paper/Mist.
Semantic: over-budget `#FF5C3A`, approaching `#FFC24B`, info `#7FB2FF`. Full ramps in the PNG and `tokens.css`.

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
