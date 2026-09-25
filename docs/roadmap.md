# Roadmap

> **Goal:** Budgts is a **personal-use** budgeting PWA at budgts.com (decided
> 2026-09-24; the App Store / Play Store plan was dropped). Each tier below is
> only done when it works for every connected account, with no silent failure
> states. See `CLAUDE.md` → "The goal".

Build order for Budgts. **Phase 1** (manual core) and **Phase 2a** (savings
goals) are shipped. Everything after is organised as capability tiers —
**V1 → V1.5 → V2 → V2+** — sequenced so the passive-ingestion experience lands
first: if the ledger fills itself via Plaid, routine tracking needs no user
input. That is the wedge that makes Budgts different.

Manual transaction entry stays as a permanent fallback (cash, unsupported
institutions). Email and receipt ingestion are **deferred until Plaid ingestion
and the intelligence built on it are stable**.

```
BUDGTS
│
├── Phase 1   Core budgeting foundation ......................... ✅
│
├── Phase 2a  Savings Goals ...................................... ✅  (2d46178)
│
├── UI Redesign  Budgts brand + information architecture ......... ✅  COMPLETE (closed 2026-09-14) — design system,
│                                                                       app shell, every screen, v2 brand, robin
│                                                                       mascot rebrand, Money Left hero; live on main.
│                                                                       Leftover items moved to the backlog below
│
├── V1        Plaid transaction ingestion  (primary path) ....... ✅  live in prod (`4590520`); Plaid UI flag ON —
│                                                                       3 real bank connections since 2026-09-11
│                                                                       (retroactively documented 2026-09-14)
│   ├── Plaid Sandbox ............................................ ✅
│   ├── PlaidAdapter ............................................. ✅
│   ├── Account linking .......................................... ✅
│   ├── Transaction synchronization .............................. ✅
│   ├── Transaction normalization ................................ ✅
│   ├── Automatic categorization ................................. ✅
│   ├── Budget / dashboard integration ........................... ✅
│   ├── Sign-convention / event-role / budget-effect / transfer-
│   │   ownership correctness chain .............................. ✅
│   ├── Money Left + Savings Rate dashboard tiles ................ ✅
│   └── Account calculation-exclusion (bad bank-feed safety valve) ✅
│
├── V1.5      Recurring & transfer intelligence
│   ├── Recurring transaction detection
│   ├── Subscription detection
│   ├── Bill detection (upcoming / missed)
│   ├── User confirmation / muting
│   └── Paired transfer detection
│
├── V2        Ingestion breadth + spending intelligence
│   ├── Email / receipt ingestion
│   ├── Advanced spending insights
│   ├── Cash-flow forecasting
│   ├── Safe-to-spend
│   └── Net worth
│
└── V2+       AI financial assistant
    ├── AI financial assistant
    ├── Purchase affordability
    ├── Financial recommendations
    └── Advanced automation
```

Native mobile apps were dropped (2026-09-24) — see the retired track at the end
of this file. **Scale & Infrastructure** is a second parallel track
(capacity observability, no plan upgrades yet) — same section. Working
detail for every tier: `docs/workflow.md §4`.

## Phase 1 — Core budgeting foundation ✅

(Scaffold = the old "Phase 0"; history in `docs/workflow.md §1`.) Deployed,
installable, multi-device. Sign up → add transactions manually → categorize →
set a monthly budget per category → dashboard shows budget-vs-actual for the
current month. Live sync via Supabase Realtime. The `IngestionAdapter` seam is
in place with only `ManualAdapter` implemented, so every later tier plugs in
without refactoring. Live at **https://budgts.com**.

Full design: `docs/specs/2026-09-07-budget-app-phase-1-design.md`.

## Phase 2a — Savings Goals ✅ (`2d46178`)

`savings_goals` + `savings_contributions` (migration `0003`, `/goals` screen):
target amount, optional target date, a standalone contribution ledger
(deliberately decoupled from `transactions` and account balances), progress
display. "Add" and "Withdraw / correct" are separate actions so the user never
types a minus.

Spec: `docs/specs/2026-09-09-…-phase-2a-…`.

## UI Redesign — Budgts brand + information architecture ✅ COMPLETE

**Closed 2026-09-14.** Everything in scope has shipped to `main` and is live
at `https://budgts.com` (last commit `b08cfcf`). The items under "Deferred"
at the end of this section are **not** redesign work any more — they are
standalone backlog items, picked up on their own merits (the onboarding
wizard most naturally alongside V1.5, since Plaid is now live).

Presentation-layer redesign ("Budgts" → "Budgt": black-cat mascot, a new
screen hierarchy — Home leads with Money Left → Savings Rate → Spending →
Where it went → What can I change → Save more, not a transaction ledger).
Explicitly does not touch financial semantics, Plaid ingestion,
categorization, or any domain math — every screen reuses existing
selectors/server actions.

Done: shared design system (buttons, progress bar, segmented control,
category icons, empty states); responsive app shell (bottom nav on mobile,
persistent desktop sidebar — not a stretched mobile layout); Home rework;
Budgets as category cards + a Category Detail drill-in; Activity search +
kind filter; a one-tap transfer toggle on Transaction Detail; new
More/Insights/Accounts/Connected-Banks/Help/About screens and a
reorganized, menu-based Settings.

**v2 brand pass:** the palette and typeface above changed again — cream/
coral/sage/sky/lavender/pink (sampled from `Budgts Reference V2.png`) and
Poppins (from `Assets V2.svg`), replacing the original warm-white/yellow/
orange/blue palette and Nunito Sans. Same design-system architecture and
screen hierarchy, new tokens + real cropped brand artwork (logo, mascot,
category iconography) throughout. See `docs/BRAND_GUIDELINES.md` — the
current source of truth for all of it.

**Logo-asset correction:** the v2 pass's logo/mascot artwork (auto-cropped
from `Assets V2.svg`'s embedded PNG sheet) had visible edge/bleed defects.
Replaced with the brand owner's own finished exports (`Downloads/Logo
Assets/`) — a badge mark (also the source for every generated app icon), a
sunburst lockup now used as the sign-in/onboarding hero art (replacing a
CSS-simulated glow), and the four mascot mood expressions. Unused
solid-color mark variants and decorative blob/sparkle crops were dropped
rather than replaced (nothing in the app referenced them).

**Mascot/logo rebrand** (`22067c0`): the black-cat mascot and "Budgt" name
were replaced by a robin mascot and the "Budgts" name/wordmark from `Logo
Assets V2` — resolving the old in-app-name vs `budgts.com` mismatch. Palette
and typography unchanged.

**Money Left hero card** (`d0e48f2`, `b08cfcf`): light-coral hero fill,
redesigned fill + type hierarchy, mascot mirrored on the insight card —
the final redesign pass.

**First-run tour** (branch `v1.5/first-run-tour`): the deferred 3-screen
onboarding wizard, expanded into a convenience-first pitch and picked up on
its own merits once Plaid went live in production. Welcome → Every purchase,
tracked (phone tap/card/online order, auto-captured once a bank is
connected) → Currency (`/onboarding`, unchanged data flow), then Connect your
bank → Sorted for you (auto-categorization) → Know what's left → All set
(`/tour`). Shown once to new users and once to every already-onboarded user
(`profiles.tour_seen_at`); replayable from Help. Every pitch card
self-hides where its claim wouldn't be true (Plaid off, or a bank already
connected). Spec: `docs/specs/2026-09-15-first-run-tour-design.md`. **This
is the currently-live tour** — a live-coachmark redesign (v2, spotlight +
tooltip on the real button on the real page) has been fully specced
(`docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md`) and
planned (`docs/superpowers/plans/2026-09-15-first-run-tour-coachmarks.md`)
but **not implemented** — none of its tasks have run yet.

**"How Budgts Works" guide** (`/help/how-it-works`, branch
`v1.5/first-run-tour`): a permanent, static Help page teaching the
end-to-end mental model (connect → transactions arrive → auto-categorize →
review exceptions → set a budget → Money Left → track progress) — what the
tour shows *where* for, this teaches *how the workflow fits together and
why it's convenient*. Linked from a new entry card at the top of `/help`
and from the live tour's final card. No DB reads, no new dependency. Spec:
`docs/specs/2026-09-15-how-budgts-works-guide-design.md`.

Deferred → backlog, outside the closed redesign (see the spec's own
§"remaining issues" classification): a Net Worth tab on Insights (spec
explicitly forbids faking it before the feature exists); per-category "top
merchants" in Category Detail; a real Notifications settings screen (no
backend exists for it).

Spec: `docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md` (IA/behavior
— its brand sections are superseded, see its header). Brand:
`docs/BRAND_GUIDELINES.md`.

## V1 — Plaid transaction ingestion (the primary path)

**Goal:** the transaction ledger fills itself. Plaid becomes the primary
ingestion path; manual entry stays as the fallback for cash and unsupported
institutions.

Plaid returns structured transactions with a stable `transaction_id`, so there
is nothing to parse and dedupe is exact. This slots into the existing
`IngestionAdapter` → `landTransaction()` seam with no change to the transfer /
refund / unique-index rules.

- **Plaid Sandbox** — build and test entirely against Sandbox (free, no
  application). Production is a separate gate: a short application, then
  ~$0.30–$1.50 per connected item / month for Transactions (Plaid's public
  pricing page no longer lists per-unit rates — treat this figure as
  unverified/stale until reconfirmed via Plaid's sales contact).
- **`PlaidAdapter`** — `normalize()` maps each Plaid transaction to a
  `NormalizedTxn` (`source: 'bank'`, `sourceRef: transaction_id`).
- **Account linking** — Plaid Link (hosted UI) → `public_token` →
  server-exchanged `access_token`, stored per institution **server-side only,
  encrypted at rest**. Plaid accounts map onto our `accounts` rows.
- **Transaction synchronization** — cursor-based `/transactions/sync` pulls
  added / modified / **removed** transactions; the `SYNC_UPDATES_AVAILABLE`
  webhook triggers a pull, daily cron as backstop. Removals must be handled
  (mark or delete) or the numbers silently drift.
- **Transaction normalization** — Plaid categories / merchant names / sign
  conventions mapped to our model.
- **Automatic categorization** — assign each incoming transaction to one of the
  user's categories, seeded from Plaid's `personal_finance_category`.
- **Budget / dashboard integration** — synced transactions flow through the
  existing budget-vs-actual and dashboard view-models unchanged.

**New tables** (both RLS-scoped, access token never reaches the client):
`plaid_items` (item_id, institution, access_token, sync cursor, status) and
`plaid_accounts` (Plaid `account_id` → our `accounts.id`).

**Fallbacks.** If an institution is missing, TrueLayer / GoCardless / a regional
aggregator drop into the same adapter interface.

**Status (2026-09-13):** built and accepted on staging, then the code + schema
promoted to production (`main` fast-forwarded `5b668b2→4590520`, migration
`0012` applied to the production Supabase project, deployed and live at
`https://budgts.com`). `NEXT_PUBLIC_PLAID_ENABLED` shipped with this promotion
still off — that part of the paragraph is historical.

**Update (2026-09-14):** the flag was turned on in the Vercel dashboard at
some point after the promotion above, with no corresponding commit or doc
update — Milestone 10 (Plaid Production API access, owner-gated) is done.
Confirmed by querying the production `plaid_items` table directly: 3 real
connections (**Capital One**, **SoFi**, **Advancial Federal Credit Union**),
all connected 2026-09-11, syncing live. Plaid bank-connect is live for the
real user now, not staging-only. See `docs/workflow.md` §1 and §4, and
memory `plaid-live-in-production.md`, for the verification trail. **V1.5 is
unblocked.**

Alongside the core ingestion pipeline, a budget-correctness chain shipped with
it (sign-convention detection → event-role classification → budget-effect
resolution → `qualify.ts` integration → transfer ownership), plus two new
dashboard tiles that are **live now** for the real user regardless of the Plaid
flag (Money Left, Savings Rate — both computed over all transactions,
Plaid-sourced or manual), and an account-level calculation-exclusion control so
an owner can pull a bank connection with unreliable data (e.g. duplicate-feed
replay) out of every financial total without deleting anything. Full detail:
`docs/workflow.md §4/§7`.

## V1.5 — Recurring & transfer intelligence

**Goal:** detect the *structure* in a self-filling ledger — subscriptions,
bills, transfers — so the user confirms patterns instead of entering rules.

- **Recurring transaction detection** — find repeating merchant + amount +
  interval in the synced history. Plaid's `/transactions/recurring/get`
  (`outflow_streams` / `inflow_streams`) is the seed; our own pass covers what
  Plaid misses plus manual / cash data.
- **Subscription detection** — classify recurring outflows as subscriptions
  (streaming, SaaS, memberships); a subscriptions list with total monthly cost.
- **Bill detection (upcoming / missed)** — predicted next-due date + amount per
  stream; dashboard surfaces upcoming bills and flags a missed one. Recurring
  **income** (`inflow_streams`) gives "expected paycheck" → a real *projected
  savings* tile (expected income − budgeted) and a "paycheck didn't arrive"
  alert, the mirror of missed-bill detection.
- **User confirmation / muting** — every detected stream is a suggestion: the
  user confirms, edits (amount / cadence / category), or mutes it. Confirmed
  streams persist; muted ones don't re-surface. **This replaces the earlier
  plan of a user-entered `recurring_rules` table** — no one types a cadence
  unless they want to override.
- **Paired transfer detection** — match the two legs of a transfer / card
  payment (opposite amounts, near dates, linked accounts) and link them so
  neither counts as spend. Runs **after** Plaid ingestion because it needs both
  legs as real transactions.

## V2 — Ingestion breadth + spending intelligence

**Goal:** widen ingestion beyond linked banks, and turn a clean ledger into
forward-looking guidance. Starts only once V1 + V1.5 are stable.

- **Email / receipt ingestion** — per-user inbound email address → provider
  webhook → `EmailAdapter` → Claude extraction → `pending_review` queue with
  confirm/fix UI, dedupe on `Message-ID`. PWA camera capture → Supabase Storage
  → Claude vision parse → "which card / account?" popup → transaction with the
  image attached. Covers cash, split bills, and institutions Plaid can't reach.
  Open decisions: inbound-email provider (Cloudflare Email Routing / Postmark /
  Mailgun), domain; Claude vision vs a dedicated OCR API (settle with a small
  bake-off).
- **Advanced spending insights** — trends, category drift, month-over-month,
  merchant-level breakdowns.
- **Cash-flow forecasting** — project balances forward from recurring inflows /
  outflows + budgeted discretionary spend.
- **Safe-to-spend** — today's discretionary headroom after known upcoming bills
  and goal contributions.
- **Net worth** — aggregate account balances (Plaid `/accounts/balance`),
  assets − liabilities, tracked over time.

## V2+ — AI financial assistant

**Goal:** a natural-language layer over the whole model. Only meaningful once
the data underneath (V1–V2) is trustworthy.

- **AI financial assistant** — ask questions about spending, budgets and goals
  in plain language.
- **Purchase affordability** — "can I afford this?" against safe-to-spend +
  forecast + goals.
- **Financial recommendations** — surface overspend, unused subscriptions,
  goal-pace suggestions.
- **Advanced automation** — proactive nudges, auto-categorization learning,
  rule suggestions.

## Deferred / out of scope until requested

- Household / shared budgets (needs a sharing + roles model).
- Multi-currency transactions with conversion.

## Delivery track — Native apps (retired)

Retired 2026-09-24: Budgts is a personal-use PWA at budgts.com, so the native iOS/Android track and App Store / Play Store distribution are not planned. The Expo app and account-deletion work built for it are archived on branch `archive/mobile-and-deletion-2026-09-24`.

## Delivery track (parallel) — Scale & Infrastructure

Not a capability tier — runs alongside V1.5 and V2 without blocking either.
Purpose: measure real capacity limits and remove genuine bottlenecks before
they're hit, without paying for headroom nobody has used yet.

- **`sync-due` instrumentation** — per-item and per-invocation duration
  logging on the Plaid poller, so capacity decisions use measured data
  instead of estimates.
- **Capacity boundary, documented not guessed** — the serial `sync-due`
  design has sufficient headroom for expected steady-state traffic at the
  500-user initial target; synchronized bursts (mass onboarding, a webhook
  storm) are the known weakness. No queue/fan-out architecture is planned
  unless measured production behavior demonstrates it's actually required.
- **Bounded `LIMIT` + `ORDER BY` on `findItemsToSync`** — optional
  hardening, built only if/when measured data justifies it. Not built yet.
- **Production usage/cost monitoring** — Supabase DB size, connection
  counts, Plaid per-item spend, tracked against real usage rather than
  assumed.
- **Supabase/Vercel plan upgrade** — an explicit **launch-readiness
  milestone**, not a development-phase expense. Trigger: Supabase DB size
  approaching its 500MB Free-tier cap, or a concrete dev/prod limitation —
  whichever comes first, not an arbitrary user count.

This track does not block V1.5 or V2.

**Empirical signal (2026-09-16), not yet acted on.** Running the local e2e
suite against a production-backed build surfaced a real Postgres
`canceling statement due to statement timeout` error, twice, including once
during an otherwise-passing, unrelated run — i.e. not tied to one specific
test. Two pre-existing specs (`budgets.spec.ts`, `goals.spec.ts`) failed or
went flaky waiting on a mutation to reflect (a stuck "Saving…" state, or a
post-save `router.refresh()` still showing pre-save data), never a wrong
computed value. Primary suspected factor: Nano/shared-compute contention on
the single production Postgres instance — the `/budgets` page's `router
.refresh()` re-runs its full multi-query data-fetch on every mutation
rather than updating incrementally, which is a plausible amplifier but not
shown to be the root cause. The `transactions_user_occurred_idx` composite
index and the plain `auth.uid() = user_id` RLS policy mean the query itself
is not inherently expensive against the ~32k-row table. **Caveat:** manual
read-only SQL-editor queries were running against this same production
database during the investigation and may have contributed to the
contention observed — this was not an isolated measurement. No
architectural change made or planned from this alone; treat it as one
data point for the controlled measurement this track already calls for
(`sync-due` instrumentation, above), not a conclusion.
