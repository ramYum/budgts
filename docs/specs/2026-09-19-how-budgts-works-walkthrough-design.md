# "How Budgts Works" walkthrough (replaces the v1 card tour)

**Status:** implemented on `main` (committed locally; not pushed). Supersedes
the card-wizard `/tour` described in `2026-09-15-first-run-tour-design.md` and the
static page in `2026-09-15-how-budgts-works-guide-design.md`. `/onboarding` is
unchanged (it still uses `TourWizard`/`TourCard`).

## Principle

Show the **actual Budgts UI** while explaining the concept — never an
illustration of it, never a parallel fake implementation.

## Steps (single source: `src/lib/tour/topics.ts`)

| # | Slug | Question | Real UI shown |
| --- | --- | --- | --- |
| 1 | `organize` | How does Budgts organize my money? | `DashboardView`, activity list ringed |
| 2 | `money-left` | What is Money Left? | `DashboardView`, Money Left card ringed, cropped |
| 3 | `categorization` | How does categorization work? | `NeedsCategory` (grouped by merchant) |
| 4 | `disconnect` | What happens if I disconnect a bank? | `ConnectedBanks`, **Disconnect** ringed |
| 5 | `excluded-account` | Why is an account excluded from my totals? | `ConnectedBanks` flagged (**Exclude** ringed), then excluded |
| 6 | `connect-bank` | How do I connect a bank? | the **live** `ConnectBank` (real flow) |

The Help FAQ renders from the same list, so the wording cannot drift.
Step 6 is last because it is the first *action* after the explanations; it is the
one place the CTA enters the real flow.

## How demo screens are made safe

- **Data:** `src/lib/tour/demo-data.ts` builds synthetic rows (`demo-` ids) and
  runs them through the real `buildDashboard` / `spendTrend` / `goalsSummary`,
  so the demo cannot disagree with the product's own math. Nothing is read from
  or written to the database for steps 1–5.
- **Interaction:** `DemoFrame` wraps the real components in an `inert` region.
  Nothing inside can be focused, clicked or submitted, so no server action
  (disconnect, exclude, categorize, add income) can fire from an explanation.
  Every frame is labelled "Example" with a caption saying it isn't the user's data.
- **Highlight:** additive `data-tour-target` attributes on the real components
  (`money-left`, `activity`, `disconnect`, `review-notice`, `exclude`) plus
  `.tour-demo[data-tour-highlight=…]` rules in `globals.css`. No behaviour change.

## Routing

- `/tour` → redirects to `/tour/organize` (the onboarding action and the
  dashboard gate still send users to `/tour`).
- `/tour/[topic]` lives **outside** `(dashboard)`: that layout redirects users who
  haven't seen the tour to `/tour`, so a step inside it would loop.
- First run (`profiles.tour_seen_at` null): Skip and Finish call the existing
  `completeTour`. Revisit: Close/Done go to `/help`. If the column isn't migrated
  the tour is treated as seen (same fail-safe as the dashboard gate).
- Entry points: Help (card, "Replay the tour", each FAQ answer's "See it →"),
  Settings and More ("How Budgts Works"), and `/help/how-it-works` (topic index).
- Sequential (Back/Next) and individual (step list, direct URL) access.

## Not done / follow-ups

- No Playwright e2e yet: `.env.local` targets production Supabase, and an e2e run
  here would create real rows. Verified instead by component tests + a local
  visual pass at 390px.
- `src/lib/tour/steps.ts` still carries the old `tour` phase (`bank`, `auto-sort`,
  `money-left`, `done`); only the `onboarding` phase is live. Prune with its tests.
- `docs/workflow.md`, `docs/roadmap.md` and `CLAUDE.md` still describe the v1 card
  tour as live; update them when their pending edits land.
