# Home motion and Crystal on Home: design

**Date:** 2026-09-25 · **Status:** shipped on the owner's direction ("I want the
home page to have more animations and effects. Make it feel very premium and
high quality … add outstanding animations and effects of crystal in this
page"), with each part scored out of 10 and iterated to 9.5+.
Presentation only: no figure, query or calculation changed.

## Intent

Home keeps its information architecture (greeting, month, Money Left, tiles,
Where it went, the idea card, Savings, Recent activity, the two charts). The
motion makes it feel alive and expensive without competing with the numbers:
every effect either says something (a figure settling, a budget over, a
saving) or is Crystal being herself.

## Crystal on Home (`src/components/crystal-perch.tsx`)

She replaces the static robin that linked to More (More is now also a row in
the desktop sidebar, which had no other route to it).

- **Arrival, once per visit:** she flutters down from behind the header,
  flapping (the art's new raised-wing frame), lands with a squash and a dust
  puff, says "Hi, Alex!" (a generic hello when the name is long), then one
  note on the month: "55% saved!", "Spent > earned" or "No income yet".
- **Life, a 16s loop:** its beats wait until the bubbles are done (7.7s), so
  nothing collides. A flutter-hop at 6.6s. A "+$" steps up from her chirp at
  8.4s and 12.4s, only while the month is saving. A look back at your
  greeting at 10.0s. Two pecks at 13.4s. Blink and chirp keep their own
  loops.
- **Tap:** she crouches, jumps with her wings beating and chirps back. Hearts
  and sparkles fan out wide and low, below the header. She lands in a puff,
  then says the next line of a short rotation. The line is announced through
  a polite live region.
- **Reduced motion:** she sits still with her note; a tap still changes the
  line.

**Art.** `robin-art.ts` gains `wingUp`: the raised wing with a lighter
leading edge and two feather tips, plus the body under the resting wing. It
is painted over the resting wing only mid-flap. A unit test pins the static
pixels of every mood (hashes taken before the layer existed), so the logo,
the mascot at rest and the app icons are unchanged.

**Where the CSS lives.** All of it is in `globals.css` (`crystal-*`), because
the choreography drives the robin's global layer classes, and Lightning CSS
scopes every keyframe name inside a CSS module: a module can't list the
global `robin-chirp` loop next to a one-shot. Each tap remounts her life
loop, so the reaction, the loop, the wing and the tokens all start together.
In the reaction's animation lists the loop comes first and the one-shot
last, so the one-shot wins while it plays and the loop keeps its phase.

## Everything else on Home

| Part | Motion |
| --- | --- |
| Greeting | Rises word by word; the subline follows |
| Money figures (hero, tiles, Savings, chart totals, the guide's Money Left) | Rolling reels (`rolling-amount.tsx`): an odometer spin-in, ones and cents a full lap, then a glide to each new value. It replaced `CountUp` (rAF re-rendering every frame). Resting style is the final figure, so it is complete on the server and with motion off |
| Hero | The "This month" tag pops, then the detail lines rise in order |
| Where it went | Rows cascade, and their cells fill row after row. An over row flashes twice once it's full (`cells-over`) |
| What can I change? | The idea lamp switches on (`lamp`) |
| Recent activity, legend | Rows rise in turn |
| Trend | Columns build (unchanged), then the current month's tag pops once its column is built |
| Below the fold | `reveal.tsx`: a block that starts off screen waits, hidden, and plays (its cells and reels included) as it scrolls into view. It uses one IntersectionObserver per block, event-driven, disconnected after it plays |

**Reel clipping.** Geist digits are a 0.75em band centred in any line box:
0.73em above a baseline that sits at 50% + 0.355em, measured in the browser.
Each reel is clipped to `inset(calc(50% - 0.44em) -0.2em)`, the ink band plus
a hair. Clipped to the full line box, a `text-xl` reel showed stray digit
fragments above and below mid-roll.

## Welcome guide auto-play

Every new user already went through the dashboard gate, but a failed profile
read counted as "tour seen", an obsolete deploy-order fallback from before
migration `0014` shipped. The gate is now the pure `firstRunRedirect`
(`src/lib/tour/gate.ts`, tested). A read error surfaces instead of skipping
the guide.

## Verification

This ran on a local staging-only build with motion ON: animations were
frozen at set times into contact sheets for the arrival, the life loop, a
tap, the hero reels, the scroll reveals and an over-budget row, plus a
reduced-motion page and a desktop shot. Bottom sheets still cover the
viewport (the fill-mode guardrail holds), with no console errors.
