# Roadmap

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
├── V1        Plaid transaction ingestion  (primary path)
│   ├── Plaid Sandbox
│   ├── PlaidAdapter
│   ├── Account linking
│   ├── Transaction synchronization
│   ├── Transaction normalization
│   ├── Automatic categorization
│   └── Budget / dashboard integration
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

Native mobile apps are a **separate delivery track**, not a tier — see the end
of this file. Working detail for every tier: `docs/workflow.md §4`.

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
  ~$0.30–$1.50 per connected item / month for Transactions.
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

## Delivery track (parallel) — Native apps

Not a capability tier. Expo / React Native + Expo Router; reuse domain logic +
Supabase; EAS Build (required — owner is on Windows, cannot build iOS locally).
Prereqs: Apple Developer Program ($99/yr), Google Play Console ($25 once). Can
run alongside any tier above once V1 is stable. Target: a few months.
