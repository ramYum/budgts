# Phase 1 Design — Core Budgeting Slice

Date: 2026-09-07
Status: approved (planning), not yet implemented

## Purpose

Ship a thin, deployed, multi-device end-to-end slice of the budget tracking
app: a user signs up, adds transactions by hand, organizes them into
categories, sets a monthly budget per category, and sees budget-vs-actual for
the current month. No automatic ingestion yet — but the ingestion seam is built
so the later tiers (V1 Plaid, V2 email / receipt) plug in without refactoring.

Success = the Phase 1 verification steps (bottom) all pass.

## Non-goals for Phase 1

- Recurring bills and savings goals (later tiers — savings goals shipped in
  Phase 2a; recurring detection is V1.5).
- Any automatic ingestion — bank (V1 Plaid), email, receipt (V2).
- Household / shared budgets, multi-currency.
- Rich reporting / export.

## Architecture

Next.js (App Router) app on Vercel. Supabase provides Postgres, Auth, Storage,
and Realtime. Drizzle ORM owns the schema and migrations; `supabase-js` handles
auth, realtime, and (later) storage. Row-Level Security on every table is the
primary authorization boundary; server code additionally filters by the
authenticated user id.

```
Browser (PWA)
  └─ Next.js server actions ──► Drizzle ──► Supabase Postgres (RLS)
  └─ supabase-js ─────────────► Supabase Auth
  └─ supabase-js Realtime ◄──── Postgres change feed (transactions, budgets)
```

## Data model

All tables carry `user_id uuid` and an RLS policy limiting every operation to
`user_id = auth.uid()`. Money columns are `integer` minor units.

### `profiles`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | equals the Supabase auth user id |
| `currency` | text | ISO 4217, chosen at signup |
| `created_at` | timestamptz | default now() |

### `accounts`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | |
| `name` | text | e.g. "Everyday debit" |
| `type` | text | `checking` \| `credit` \| `cash` \| `savings` |
| `is_archived` | boolean | default false |
| `created_at` | timestamptz | |

### `categories`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | |
| `name` | text | |
| `kind` | text | `expense` \| `income` |
| `color` | text | hex, for the dashboard |
| `is_archived` | boolean | default false |
| `created_at` | timestamptz | |

Seeded on first login by the `handle_new_user()` trigger (migration 0002):
**Insurances**, **Personal Care**, **Housing**, **Entertainment**,
**Transportation**, **Food / Groceries** (expense); **Salary**,
**Other Income** (income). Editable in `/settings` (rename, recolour, add,
archive). Budgets are per category; the specific bill or merchant (Rent, Fuel,
Uber, …) goes in the transaction description. Tapping a category name opens its
transactions (`?category=`).

### `transactions`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | |
| `account_id` | uuid FK → accounts | |
| `category_id` | uuid FK → categories | nullable (uncategorized) |
| `amount` | integer | minor units, always positive |
| `direction` | text | `debit` (money out) \| `credit` (money in) |
| `occurred_at` | timestamptz | when the transaction happened |
| `description` | text | |
| `note` | text | nullable |
| `source` | text | `manual` \| `email` \| `receipt` \| `bank` |
| `source_ref` | text | nullable; dedupe key for non-manual sources |
| `status` | text | `confirmed` \| `pending_review` |
| `is_transfer` | boolean | default false; excluded from spend/income rollups |
| `created_at` | timestamptz | |

Partial unique index on `(user_id, source, source_ref)` where `source_ref is
not null` — idempotent ingestion for the automatic sources (V1 Plaid, V2
email / receipt).

**Transfers.** Moving money between the user's own accounts (paying a credit
card, funding savings) is `is_transfer = true` and never counts as spend or
income. Phase 1 sets the flag on a single transaction via a manual toggle;
V1.5 adds paired-transfer detection so both legs of a transfer reconcile.

**Refunds.** A refund is a `credit` in the same expense category as the
original purchase — not a separate concept. It nets against that category's
spend (see `monthlyActuals`). Refunds usually arrive as their own email
notification or bank update, so the normal ingestion path captures them.

### `budgets`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | |
| `category_id` | uuid FK → categories | |
| `month` | date | first day of the month |
| `amount` | integer | minor units |

Unique on `(user_id, category_id, month)`.

> `savings_goals` shipped in Phase 2a. Recurring-transaction *detection* is
> V1.5 (over synced data — no user-entered `recurring_rules` table). Schema
> direction was noted here so Phase 1 choices didn't box them out.

## Domain logic — `src/lib/budget/`

Pure functions over already-fetched rows (no DB calls inside), unit-tested with
fixtures first. All of these ignore `is_transfer = true` rows and any row whose
`status` is not `confirmed`.

- `monthlyActuals(txns, month)` → `Map<categoryId, number>`: for each category,
  `sum(debit) − sum(credit)` over its transactions with `occurred_at` in
  `month`. For an expense category this is **net spend** — a refund (a `credit`
  in an expense category) reduces it, and a month with more refunds than
  purchases can go negative.
- `budgetVsActual(budgets, actuals)` → per category `{ categoryId, budget,
  actual, remaining, pctUsed, state }` where `state` is `under` (< 80%),
  `near` (80–100%), or `over` (> 100%). `pctUsed` is clamped to 0 when `actual`
  is negative. Categories with a budget but no spend, and spend but no budget,
  both appear.
- `rollup(txns, budgets, month)` → `{ income, spend, net, totalBudgeted,
  totalRemaining }`. `spend` = Σ net actual over expense categories; `income` =
  Σ `(credit − debit)` over income categories; `net` = `income − spend`.

## Ingestion seam — `src/lib/ingestion/`

```ts
type TransactionSource = 'manual' | 'email' | 'receipt' | 'bank'

interface NormalizedTxn {
  accountId: string
  categoryId: string | null
  amount: number            // minor units, positive
  direction: 'debit' | 'credit'
  occurredAt: string        // ISO
  description: string
  note?: string
  isTransfer: boolean       // between the user's own accounts; excluded from rollups
  source: TransactionSource
  sourceRef?: string
  status: 'confirmed' | 'pending_review'
}

interface IngestionAdapter {
  source: TransactionSource
  normalize(raw: unknown): NormalizedTxn
  dedupeKey(n: NormalizedTxn): string | null
}
```

`landTransaction(userId, n: NormalizedTxn)` is the single insert path: it
validates, applies the dedupe unique index (on conflict → no-op or return the
existing row), and inserts. Every adapter — now and later — goes through it.

Phase 1 implements only `ManualAdapter`: `normalize` validates a form payload
(Zod), `dedupeKey` returns `null` (manual entries are never deduped).

## API surface — Next.js server actions

All inputs Zod-validated; all queries filtered by the authenticated `user_id`
and protected by RLS.

- Auth: `signIn`, `signUp` via Supabase (email magic link + Google OAuth). A
  Postgres `handle_new_user()` trigger on `auth.users` (security definer)
  atomically seeds the `profiles` row (currency defaulted), the default
  `categories`, and one starter `accounts` row. The first-run screen's currency
  choice is persisted by a `setCurrency` server action (RLS lets a user update
  their own profile).
- Transactions: `createTransaction`, `updateTransaction`, `deleteTransaction`,
  `listTransactions({ month, categoryId?, accountId? })`.
- Categories: `createCategory`, `updateCategory`, `archiveCategory`,
  `listCategories`.
- Accounts: `createAccount`, `updateAccount`, `archiveAccount`, `listAccounts`.
- Budgets: `setBudget({ categoryId, month, amount })` (upsert),
  `listBudgets({ month })`, `copyBudgetsFromPreviousMonth({ month })`.
- Dashboard: `getDashboard({ month })` → `budgetVsActual` + `rollup`.

## Screens (mobile-first PWA)

1. **Auth** — sign in / sign up; currency picker on first run.
2. **Dashboard** `/` — month switcher; rollup tiles (spend, net, remaining);
   per-category budget-vs-actual bars with `under` / `near` / `over` styling.
3. **Transactions** `/transactions` — month-grouped list; filters by category /
   account; add/edit sheet (amount, account, category, date, description, note).
4. **Budgets** `/budgets` — per-category budget input for the selected month;
   "copy last month" action.
5. **Settings** `/settings` — categories CRUD, accounts CRUD, currency display,
   sign out.
6. **PWA shell** — `manifest.webmanifest`, icons, service worker for app-shell
   caching. Offline read of the last-loaded month is a nice-to-have, not part
   of "done".

Live sync: subscribe via Supabase Realtime to `transactions` and `budgets`
filtered to the active month; re-run `getDashboard` / list on change.

## Error handling

- Zod errors → inline field messages; never a raw 500 to the user.
- Auth/session loss → redirect to sign-in, preserve the intended route.
- Write failure → toast + keep the unsaved form open (no data loss).
- Realtime drop → silent reconnect; a manual refresh is always available.
- All money math in integer minor units; format only at the display edge.

## Testing — definition of done

- **Unit (Vitest):** `budgetVsActual` (incl. negative actual → `pctUsed` 0),
  `monthlyActuals` (refund nets against spend), `rollup` (transfers and
  unconfirmed rows excluded), every Zod schema, `ManualAdapter.normalize`,
  `landTransaction` dedupe — tests first.
- **Component (RTL):** dashboard bar states; transaction add/edit sheet
  validation.
- **E2E (Playwright):** sign up → add account + category → add transaction →
  set budget → dashboard shows the correct budget-vs-actual → in a second
  browser context the transaction appears (multi-device sync).
- CI: `lint`, `test`, `build`; e2e against local Supabase or a preview deploy.

## Verification (end to end)

1. Create a Supabase project and a Vercel project; set env vars (`DIRECT_URL`
   = the non-pooled connection for migrations); run migrations; enable the
   `supabase_realtime` publication for `transactions` and `budgets`.
2. Install the PWA on a phone and open it on a desktop. Sign up, pick a
   currency — default categories and a starter account appear.
3. Add several transactions across categories; set a monthly budget per
   category.
4. The dashboard shows correct per-category actual, remaining, and
   under/near/over state, and correct rollup totals — cross-check against a
   hand calculation. Add a refund (a `credit` in an expense category) and an
   account-to-account transfer: the refund lowers that category's spend, the
   transfer changes neither spend nor income.
5. With the app open on both devices, add a transaction on one — it appears on
   the other within a second or two.
6. Reload while offline — the last-loaded month still renders (nice-to-have).
7. `npm run test` and `npm run test:e2e` are green in CI.

## Open decisions (do not block Phase 1)

- Exact default category list; app name / branding.
- Whether Supabase RLS/migration patterns need their own section in
  `docs/conventions.md` or stay inline in the layer-order steps.
