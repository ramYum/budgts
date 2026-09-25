# First-run tour — design

> **Visuals and copy superseded (2026-09-25)** by the welcome guide,
> `docs/specs/2026-09-25-welcome-guide-design.md` (Crystal's narration, animated
> scenes, the `crystal` and `plan` steps). The flow, gating, Skip and
> completion rules below still hold.

**Status:** implemented and shipped (`e96a428`; migration `0014` confirmed applied on production 2026-09-25) — this card wizard is what runs today. **Branch:** `v1.5/first-run-tour` (merged).

## Problem

New Budgts users land on a single currency-picker screen (`/onboarding`) and
are then dropped onto Home with no explanation of what the app does or why
it's worth using. The redesign spec's 3-screen wizard (spec §6, Welcome →
Connect Bank → All Set) was deferred only because Plaid UI was flag-gated off
everywhere it was built; Plaid is now live in production, so that premise no
longer holds (`docs/roadmap.md` "Deferred" note).

## Goal

A short, robin-guided, full-screen card wizard whose job is to sell the app's
core promise — **convenience** — then get the user set up:

1. **It tracks spending for you.** Phone-tap (Apple/Google Pay), card, and
   online-order purchases show up automatically once a bank is connected.
2. **It sorts spending for you.** Transactions get categorized automatically,
   and it asks less the more it's used.

Everyone sees it once: new users get the full flow during signup; existing
onboarded users see it once on their next visit. It's replayable anytime from
Help.

## Copy guardrails

- Never claim "instant" or "real time" — bank syncs aren't instant.
- Automatic-capture claims are always paired with "once your bank is
  connected" — never implied to work without it.
- Categorization copy matches actual behavior: files obvious transactions
  automatically, asks once when unsure, remembers the answer per merchant.
  Same claims as the existing Help FAQ (`src/app/(app)/(dashboard)/help/page.tsx`).

## The cards

**On `/onboarding`** (before `profiles.onboarded_at` is set — required, can't
be skipped past currency):

| # | Card | Mascot | Copy | Action |
|---|---|---|---|---|
| 1 | Welcome | happy | "Budgeting that does itself." Budgts keeps track of your money for you — so you don't have to. | *Get started* |
| 2 | Every purchase, tracked | curious | Three icons (phone tap · card · online order). "Tap, swipe or shop online — Budgts picks up your purchases automatically. No typing. No receipts." | *Next* |
| 3 | Your currency | normal | Existing currency `<select>` | *Start budgeting* → `completeOnboarding` → `/tour?new=1` |

Card 2 is hidden when `plaidUiEnabled()` is false (its promise isn't true on
that deployment); card 1's body falls back to "Budgts helps you see where
your money goes."

**On `/tour`** (after onboarding; also reachable anytime from Help):

| # | Card | Mascot | Copy | Action |
|---|---|---|---|---|
| 4 | Connect your bank | curious | "Connect your bank to turn it on. This is what makes tracking automatic. Your bank login never reaches Budgts." | `<ConnectBank>` · *I'll add things by hand →* |
| 5 | Sorted for you | happy | "Budgts puts each purchase in the right category. Not sure? It asks once — then remembers. The more you use it, the less it asks." | *Next* |
| 6 | Know what's left | normal | "Home shows your Money Left this month. Set budgets to see what you can still spend." | *Next* |
| 7 | All set | happy | "You're all set. Spend like normal — Budgts handles the rest." Small print: replay anytime from Help. | *See my finances* → `completeTour` → `/` |

Card 4 only renders when `plaidUiEnabled()` is true and the user has zero
`plaid_items`. On a Plaid-off deployment, cards 4 and 5 are both hidden
(sorting can't be demonstrated without capture). A `/tour` visit without
`?new=1` (replay, or an existing user's first post-migration visit) prepends
cards 1–2 so the pitch is always seen once; `?new=1` skips them since they
were just shown on `/onboarding`.

Every `/tour` card has **Skip** → `completeTour`. On `/onboarding`, Skip on
cards 1–2 jumps to card 3 (currency stays required). Progress dots count only
the cards actually visible for that user/session, continuous across both
routes.

## Data model

`profiles` gains one nullable column:

```
tour_seen_at: timestamptz, null by default
```

Set once, on finishing or skipping `/tour`. Never reset. Covered by the
existing `"own profile"` RLS policy (`FOR ALL` scoped to `auth.uid()`,
`0000_noisy_hannibal_king.sql:84`) — no new policy needed. The
`handle_new_user()` seed trigger is unaffected; new rows leave it null.

## Gate

`src/app/(app)/(dashboard)/layout.tsx`, after the existing `onboarded_at`
check:

```
if (!profile.tour_seen_at) redirect("/tour");
```

Queried as a separate `select` from `onboarded_at`, so that a deploy where the
app code ships before the migration runs degrades to "treat as seen" (log,
don't loop) rather than folding into the `onboarded_at` check and producing
`/onboarding` → `/` → `/onboarding` redirect loop. The migration still must
land on prod before the deploy that reads this column ships — this is a
belt-and-suspenders guard, not a substitute for ordering.

## Step sequencing

A pure function decides which cards apply — no component owns this logic, so
it's unit-testable without rendering anything:

```ts
buildTourSteps({
  phase: "onboarding" | "tour",
  plaidEnabled: boolean,
  hasBank: boolean,      // user already has ≥1 plaid_items row
  justOnboarded: boolean, // true when arriving via ?new=1
}): { id: TourStepId; }[]
```

`TourStepId = "welcome" | "auto-capture" | "currency" | "bank" | "auto-sort" |
"money-left" | "done"`.

`TourWizard` (client) stores the resolved step list in a `useState`
initializer, not derived live from props — a bank connection inside the
wizard triggers `router.refresh()` (existing `ConnectBank` behavior), which
would otherwise re-run server data fetching and could reorder/hide the
`"bank"` step mid-flow. The list is fixed for the lifetime of one wizard
mount.

## Components

- `src/components/tour/tour-card.tsx` — shared shell: `<Mascot>`
  (`src/components/mascot.tsx`), heading, body, optional slot (icons/form/
  ConnectBank), primary + secondary action, progress dots, Skip. Existing
  design tokens only (`bg-bg`, `card`, `bg-primary-btn`, `text-muted`), per
  `docs/BRAND_GUIDELINES.md` and the layer-order UI rules in
  `docs/conventions.md`.
- `src/components/tour/purchase-icons.tsx` — three small inline-SVG glyphs
  (phone tap, card, shopping bag) with short labels, styled to match
  `src/components/nav-icons.tsx`'s stroke conventions.
- `src/components/tour/tour-wizard.tsx` (client) — index state, Next/Back,
  ←/→ keys, moves focus to the card heading on step change, `aria-live`
  region announcing the step, respects `prefers-reduced-motion`. Final step
  and Skip both submit `completeTour` via `useActionState`.

## Routes

- `src/app/(app)/onboarding/page.tsx` + `onboarding-form.tsx` — restructured
  into Welcome → Every-purchase-tracked → Currency as `TourCard`s sharing one
  client step state. `completeOnboarding`'s redirect changes from `/` to
  `/tour?new=1`.
- `src/app/(app)/tour/page.tsx` (new, server component, sibling of
  `onboarding/`, outside `(dashboard)` — no nav chrome, matches the
  onboarding shell): requires a session; redirects to `/onboarding` if not
  yet onboarded; reads `searchParams.new`; computes `plaidUiEnabled()`, the
  user's `plaid_items` count (a query error, e.g. table not migrated yet, is
  treated as 0 — same defensive pattern as `BankConnections`), and
  non-archived `accounts` for `<ConnectBank accounts=…>`. Always renders
  (no "already seen" redirect), so replay from Help works.
- `src/server/tour.ts` (new) — `completeTour()`: get the session user, set
  `profiles.tour_seen_at = now()`, redirect to `/`. No form input, so no Zod
  schema; a failed update returns a plain-language message instead of
  throwing (no raw 500).
- `src/app/(app)/(dashboard)/help/page.tsx` — add a "Replay the tour" link to
  `/tour`.

## Testing

- Unit: `src/lib/tour/steps.ts` (`buildTourSteps`) — Plaid off hides
  auto-capture/bank/auto-sort; `hasBank` hides the bank card;
  `justOnboarded` skips welcome + auto-capture on `/tour`; `"done"` is always
  last; dot count/offset stays continuous across the two routes.
- Component (Vitest + RTL): `TourWizard` — Next/Back/keyboard navigation,
  dots reflect only visible steps, Skip and the final action both call
  `completeTour`, the step list doesn't reshuffle when props change after
  mount.
- E2E: `tests/e2e/helpers/onboard.ts` gains `onboardAndSkipTour(page)`
  (select currency → Get started/Next through the pitch cards → Start
  budgeting → wait for `/tour` → Skip → wait for `/`); replaces the inline
  onboarding block duplicated across `transactions`, `settings`, `plaid`,
  `budgets`, `goals` specs. New `tests/e2e/tour.spec.ts`: a new user walks
  every card via Next and lands on `/`; a reload of `/` doesn't return to
  `/tour`; Help → "Replay the tour" opens `/tour` at Welcome.

## Out of scope

- Net Worth, per-category top merchants, real Notifications settings — all
  already deferred in `docs/roadmap.md` for unrelated reasons (no backend /
  spec explicitly forbids faking).
- A "Getting started" checklist on Home (goals, first budget, etc.) —
  possible future iteration, not part of this tour.
- Any change to categorization or ingestion logic itself — this only
  *explains* existing behavior.
