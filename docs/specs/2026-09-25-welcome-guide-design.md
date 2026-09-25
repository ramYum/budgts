# Welcome guide (first-run tour v2): design

**Date:** 2026-09-25 · **Status:** approved by the owner with full design
discretion ("You have full discretion how to implement this welcome guide").
**Supersedes the visuals and copy of** `2026-09-15-first-run-tour-design.md`.
Its flow, gating and completion rules still hold; the live-coachmark v2 spec
stays unimplemented.

## Intent

The owner asked for a welcome guide that shows a new user what Budgts does
and how to use it. It should feel premium within the v3 design language
(`docs/BRAND_GUIDELINES.md`), use outstanding animation, and have **Crystal**,
the robin, introduce herself. The owner also asked for a high standard: score
each part out of 10 and iterate until everything reaches 9+.

## What stays (proven wiring, not rebuilt)

- `/onboarding` (pre-setup, ends at the required currency step), then
  `completeOnboarding`, then `/tour?new=1` (explainer), then `completeTour`,
  which sets `profiles.tour_seen_at` and redirects to `/`.
- The dashboard layout gate: not onboarded goes to `/onboarding`; tour not
  seen goes to `/tour`.
- Onboarding Skip jumps to the currency step. Tour Skip completes the tour.
  Replay comes from Help (`/tour` without `?new=1` prepends the intro cards).
- Step order is resolved once, server-side, by `buildTourSteps`, and frozen
  for the wizard's lifetime.

## What changes

**Steps.** There are two new ids: `crystal` (the introduction) and `plan`
(budgets and goals). The order is:

- **Onboarding:** crystal, welcome, auto-capture (Plaid on), currency.
- **Tour:** bank (Plaid on, no bank yet), auto-sort (Plaid on), money-left,
  plan, done.
- **Replay:** the tour steps with crystal, welcome and auto-capture in front.

**Narrator.** Crystal speaks on every card. Each card carries a small robin
avatar with a "CRYSTAL" name tag, and the copy is in her voice. The copy only
claims shipped behavior: Plaid capture, categorize-once-then-remember, Money
Left as income minus spending, monthly budgets, goals, and the four tabs.

**Shell (`TourCard`).** From top to bottom:

- A top bar: Back, then pixel-cell progress (a `progressbar`), then Skip.
- A fixed-height white "scene" card with a faint dot-grid texture.
- The narrator tag.
- The heading, with each word rising in turn.
- The body, then an optional form or media slot, then the actions and a
  footnote.

**Content** lives in one place (`guide-steps.tsx`), shared by both routes.
This replaces the duplicated welcome and auto-capture cards and the duplicated
label maps. It also replaces `purchase-icons.tsx`.

**Scenes** (`scenes.tsx`, `guide.module.css`) are animated vignettes built from
the real UI vocabulary: category tiles, square-cell progress, the Money Left
figure and the bottom nav.

| Step | Scene |
| --- | --- |
| crystal | Crystal drops in, lands with a pixel dust puff, then her "Hi!" bubble appears with twinkling pixel sparkles and a name plate |
| welcome | Track, Plan and Grow tiles light up in sequence along a stepping pixel path |
| auto-capture | Purchases from tap, card and online land in a list one after another, on a loop |
| currency | A live amount re-formats in the chosen currency |
| bank | Bank tile, then a secure dotted link with a traveling lock, then Budgts |
| auto-sort | A "?" category snaps to the right icon and label, and Crystal says "Got it" |
| money-left | Money Left counts up while square cells fill |
| plan | A budget row fills cell by cell, and a goal gains a rising "+$50" |
| done | A pixel confetti burst; a bottom-nav pip tours Home, Budgets, Activity and More with captions |

**Motion.** It is CSS only: transform and opacity, stepped where it's
pixel-native, and entrance fills are `backwards` (per the motion guardrail).

- **Step changes:** the card enters from the travel direction (right when
  going Next, left when going Back). Its parts then cascade in, starting with
  the scene.
- **Reduced motion:** every scene shows its complete final state, and nothing
  loops.

## Accessibility

- Focus moves to the step heading, which is announced through a polite live
  region.
- Arrow keys navigate.
- Scenes are `aria-hidden`: their meaning is repeated in the heading and body.
- Progress is a `progressbar` with its current and maximum values.
- Every control keeps its visible label. The primary actions are "Nice to
  meet you", "Show me how", "Next", "Start budgeting" and "See my finances".

## Testing

- **Unit:** `steps.test.ts` covers the new orders.
- **Component tests (both wizards):** the first card is Crystal; Skip
  semantics; the currency submit; the completion action; frozen steps; bank
  card controls; the progress values.
- **e2e:** `tour.spec.ts` walks every card from Crystal to Home, then replays
  from Help. The `onboardAndSkipTour` helper is unchanged (Skip labels kept).
- **Visual:** a local staging build with motion ON. Frames are frozen at set
  times for every step, and each part is scored out of 10 and iterated to 9+.
