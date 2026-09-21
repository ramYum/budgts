# First-run tour v2 — live coachmarks

**Status: REMOVED from the release path (2026-09-20, commit `7468365` on `mobile/native-home`).** Budgts ships with no app tour for now; a replacement will be built separately. This document is kept as **history and input for that replacement**, not as a description of the app. The pre-removal code is on the local archive branches `archive/native-home-with-claude-tour` and `archive/claude-tour-redesign`. Originally: approved, superseding the tour half of
`docs/specs/2026-09-15-first-run-tour-design.md`. **Branch:**
`v1.5/first-run-tour`.

## Why this changes

The first version's "Connect your bank" / "Sorted for you" cards illustrated
those ideas in the abstract (mascot + copy), never showing the real button.
Feedback: the tour should show the actual app — a real screenshot of the
screen, with the specific button highlighted — not a drawing of the idea.
Chosen approach (over pre-rendered annotated screenshots): **live
coachmarks** — a spotlight + tooltip anchored to the real, currently-running
button on its real page, so it's never stale and never fakes data.

**Unchanged:** `/onboarding` (Welcome → Every purchase, tracked → Currency),
`profiles.tour_seen_at`, `completeTour`, migration `0014`, and the Money
Left / All-set cards' content. **Removed:** the standalone `/tour` route and
its card-wizard rendering of Connect-bank / Sorted-for-you. **New:** a
persistent overlay that follows the user across real dashboard pages,
spotlighting one real element per step.

## Step sequence

A pure function resolves this once per dashboard load:

1. **Money Left** (full-screen card, shown wherever the user currently is —
   typically Home right after onboarding) — same copy as before.
2. **Connect your bank** (coachmark) — navigates to `/connected-banks`,
   spotlights the real `<ConnectBank>` button. Only if `plaidUiEnabled()`
   and the user has zero `plaid_items`.
3. **Add it yourself** (coachmark) — navigates to `/transactions`,
   spotlights the real "+ Add" button. Always shown (manual entry is
   always available).
4. **The needs-a-category bell** (coachmark) — same page, spotlights the
   header bell. Only if `plaidUiEnabled()`.
5. **Set a budget** (coachmark) — navigates to `/budgets`, spotlights
   either the empty-state "Build my budget" button or the first category
   card, whichever is actually rendered.
6. **All set** (full-screen card) — same copy as before; "See my finances"
   submits `completeTour` (unchanged action), which redirects to `/`.

Every step keeps a **Skip** control reachable from any page, always ending
the tour via the same `completeTour` action.

## Architecture

**`buildCoachSteps({ plaidEnabled, hasBank })`** — pure, in
`src/lib/tour/coach-steps.ts`. Returns an ordered list of `{ id, kind: "card" }`
or `{ id, kind: "coachmark", route, target, placement }`. `target` matches a
`data-tour="<target>"` attribute added to the real element; `route` is the
dashboard page that element lives on.

**`data-tour` anchors** — one attribute added to each real element, no
behavior change:
- `src/components/plaid/connect-bank.tsx` → `data-tour="connect-bank"` on
  the connect button.
- `src/components/add-transaction.tsx` → `data-tour="add-transaction"` on
  the "+ Add" button.
- `src/components/needs-category-bell.tsx` → `data-tour="needs-category-bell"`
  on the link. Rendered twice (mobile header + desktop position, see
  `(dashboard)/layout.tsx`) — the lookup below must pick the *visible* one,
  not just the first in DOM order.
- `src/components/budgets-view.tsx` → `data-tour="set-budget"` on **both**
  the empty-state "Build my budget" button and the first category-card
  button (only one of the two branches ever renders at once, so this is
  never a duplicate-in-DOM case).

**`useElementRect(target, onNotFound, timeoutMs)`** —
`src/lib/tour/use-element-rect.ts`, a client hook. Polls
`document.querySelectorAll('[data-tour="<target>"]')` for the first element
whose `offsetParent !== null` (i.e., actually visible — filters out the
`md:hidden`/`hidden md:flex` twin), tracks its `getBoundingClientRect()` via
`ResizeObserver` plus scroll/resize listeners (so it stays anchored through
layout shifts), and calls `onNotFound()` once after `timeoutMs` if nothing
visible ever appears (e.g., deep-linking to a step whose precondition
changed underfoot) — the caller advances past that step.

**`computeTooltipPosition(...)`** — `src/lib/tour/tooltip-position.ts`, a
pure function (no DOM) that places the tooltip bubble relative to a target
rect and the viewport, clamped so it never runs off-screen at phone width.

**`<Coachmark>`** — `src/components/tour/coachmark.tsx`, presentational.
Given a resolved `DOMRect`, renders a dimmed backdrop with a spotlight cutout
around the target (box-shadow technique — no clip-path, no canvas) and a
tooltip bubble (title, body, step label, Next, Skip) positioned by
`computeTooltipPosition`.

**`<TourOverlay>`** — `src/components/tour/tour-overlay.tsx`, the
orchestrator, mounted once in `(dashboard)/layout.tsx` so it survives
client-side navigation between dashboard pages (they share that layout).
Freezes its resolved `coachSteps` prop into a `useState` initializer (same
no-reshuffle-mid-tour principle as v1). Tracks a step index; when the
current step is a coachmark whose `route` doesn't match `usePathname()`, it
`router.push`es there. Renders `<TourCard>` for `"card"` steps (Money Left,
All set — same component `/onboarding` already uses) and `<Coachmark>` for
`"coachmark"` steps once `useElementRect` resolves a rect. Starts active
when `initialActive` is true (fresh, un-toured user) or when the URL carries
`?tour=replay` (Help's replay link), stripping that query param on start via
`router.replace`. Renders nothing once finished or when inactive.

## Removed

- `src/app/(app)/tour/` (route, `tour-wizard-content.tsx` + its test).
- `src/components/tour/tour-wizard.tsx` (the generic same-page step
  navigator — superseded by `TourOverlay`, which must navigate real routes).
- The `(dashboard)/layout.tsx` `redirect("/tour")` gate — replaced by
  rendering `<TourOverlay>` unconditionally (it no-ops when inactive).
- `completeOnboarding`'s redirect reverts to `/` (no more `?new=1` — the
  live tour no longer needs to know it was "just onboarded", since it never
  repeats the onboarding-only Welcome/Every-purchase-tracked cards).

## Gate (unchanged mechanics, new shape)

`(dashboard)/layout.tsx` still separately queries `tour_seen_at` (same
deploy-order fail-open as before: a query error is treated as "seen", never
forces the overlay). What changes is what happens on `!tour_seen_at`: no
redirect — `initialActive={true}` is passed to `<TourOverlay>`, which is
mounted alongside `children` on every dashboard page, so it can run
regardless of which page the user happens to land on.

`plaidUiEnabled()` is a sync check (free). The `plaid_items` head-count
query needed for `hasBank` only runs when `plaidUiEnabled()` is true (same
existing pattern as `needsCategoryCount`) — cheap, and needed unconditionally
(not just when the tour is active) so a **replay** later still has the
correct, current `hasBank` value to build steps from.

## Testing

- Unit: `computeTooltipPosition` (clamping at small/large viewports, both
  placements), `buildCoachSteps` (Plaid on/off, hasBank true/false, "done"
  always last).
- Unit (hook): `useElementRect` — finds a target already in the DOM, finds
  one added asynchronously (polling), prefers the visible one when two
  elements share a `data-tour` value (mock `offsetParent`), calls
  `onNotFound` after the timeout when nothing appears, cleans up its
  observers/listeners/timers on unmount.
- Component: `Coachmark` renders the backdrop/tooltip from a given rect,
  clamps at a narrow viewport. `TourOverlay` — card steps render via
  `TourCard`; a coachmark step against a synthetic `data-tour` div in the
  test DOM renders `Coachmark` once resolved; Next on a coachmark whose
  route differs from the current pathname calls `router.push`; Skip and the
  final card's button both call the same `completeTour` action; steps stay
  fixed across a `coachSteps` prop change after mount; `?tour=replay`
  activates an otherwise-inactive overlay and strips the param.
- E2E: `tour.spec.ts` rewritten to walk the real pages (Home → Connected
  Banks → Activity → Budgets → Home), asserting each spotlighted element is
  the real one and clicking through actually works there (not a fake).

## Out of scope

Same as the v1 spec's "Out of scope" section — unchanged.
