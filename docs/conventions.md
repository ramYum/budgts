# Conventions & SOPs

Repeatable rules for building this app. Read the relevant section before
starting work. `CLAUDE.md` has the short version; this is the detail.

---

## Building a feature — the layer order

Every feature that touches data, an API, or the UI is built bottom-to-top in
this order. Each layer is finished (and tested where noted) before the next is
started. Reordering is how RLS gaps and float-money bugs get in.

1. **Schema + migration** — `src/lib/db/schema.ts` → `supabase/migrations/NNNN_*.sql`
   - Edit `schema.ts` first (schema-first). Money columns are `integer` (minor
     units). Run `npm run db:generate` to emit the SQL migration from the diff.
   - Hand-append what drizzle-kit cannot generate to that same migration file:
     the **RLS policy** for every new table (scoped to `auth.uid()` — the
     migration is not done without it), plus any trigger / seed SQL.
   - Must be reversible. Apply with `npm run db:migrate` (uses `DIRECT_URL`,
     the non-pooled connection) against a local or branch database.
2. **Zod schema** — `src/lib/validation/*.ts`
   - One schema per input shape, imported by both client and server.
   - Amounts validated as positive integers.
   - Unit-test the schema (valid + invalid cases).
3. **Domain logic** — `src/lib/budget/*.ts` (or `src/lib/ingestion/`)
   - Pure functions over already-fetched rows. **No DB calls inside.**
   - **Write failing unit tests first** (`superpowers:test-driven-development`),
     then implement.
   - Bucket transactions by `occurred_at` (when it happened), never
     `created_at`. Exclude `is_transfer` rows and non-`confirmed` rows from
     spend/income math.
4. **Server action / route** — `src/server/*.ts`
   - Parse input with the Zod schema.
   - Use the **request-scoped `supabase` server client** (the user's session) for
     all reads and writes. RLS enforces per-user isolation at the database — it
     is the guard, not a backstop. Still set `user_id` explicitly on inserts
     (the RLS `WITH CHECK` requires it to match `auth.uid()`).
   - Drizzle is **migrations only** — never used for request-time queries.
   - Call the domain function; return typed data. No raw 500 to the client.
5. **UI** — `src/app/**`, `src/components/**`
   - Mobile-first. Show inline Zod errors. A failed write keeps the form open
     with its data (no loss).
   - Light + dark theme from the start. Brand tokens live in
     `src/app/globals.css` (semantic roles: `bg`, `surface`, `text`, `muted`,
     `border`, `accent`/`accent-ink`, `pos`/`neg`/`warn`/`info` — all flip with
     `prefers-color-scheme`). Style with those utilities (`bg-surface`,
     `text-muted`, `border-border`, `bg-accent`…), never raw Tailwind colours or
     `dark:` variants. One lime `bg-accent` action per screen. Amounts get
     `tabular-nums`. Labelled inputs, keyboard-reachable, visible focus ring.
   - Logo: `<Logo>` / `<LogoMark>` from `src/components/logo.tsx`.
   - Subscribe to Supabase Realtime where the screen shows live shared data.
   - Reference: `New Branding guidelines.png` (repo root, the current brand
     source — supersedes the deleted `Branding-guidelines.png`) plus
     `docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md`; `brand/`
     holds only the retired previous identity now. Check UI visually with
     `npm run screenshot -- <url> <label>` (see `tools/README.md`).
6. **E2E** — `tests/e2e/*.spec.ts`
   - One Playwright test through the new UI, happy path. Add a
     multi-device/sync assertion when the feature writes shared data.

### E2E against Supabase — required posture

The e2e suite drives one real Supabase project, whose auth server rate-limits
and cold-starts. Configured accordingly, and keep it this way:

- `playwright.config.ts`: `workers: 1` (serial), `retries: 1`,
  `reuseExistingServer: false` (a stale dev server serves a wrong build).
- Tests that need a session use `tests/e2e/helpers/test-user.ts` — admin
  `createUser` + a magic-link `token_hash` through `/auth/callback`; the
  `finally` block deletes the user (FK cascade cleans its rows). A timed-out
  test skips `finally`, so orphans accumulate — sweep them with a
  `listUsers` + delete pass when the suite starts misbehaving.
- Wait on observable state, not tight URL regexes: `page.waitForURL(u => u.pathname === "/", { timeout: 20000 })` after a server-action redirect, and
  wait for a post-mutation UI signal (a flipped button label) before navigating.

### Quick reference

| Layer | Location | Gate before moving on |
| --- | --- | --- |
| Schema + migration | `src/lib/db/schema.ts` → `supabase/migrations/` | `db:generate` clean; RLS policy in the migration; applies + rolls back |
| Zod | `src/lib/validation/` | schema unit-tested |
| Domain | `src/lib/budget/` \| `src/lib/ingestion/` | tests written first, now green |
| Server action | `src/server/` | uses the user's `supabase` server client (RLS-enforced); input Zod-parsed; `user_id` set on inserts |
| UI | `src/app/`, `src/components/` | inline errors; no data loss on failure |
| E2E | `tests/e2e/` | happy path green in CI |

### Definition of done

See `CLAUDE.md` → "Definition of done". In short: `lint`/`test`/`build` green,
one e2e, RLS on any new table, money in integer minor units end to end, doc
updated if something surprised you.

### Common mistakes

- Building the component before the domain function it calls exists and is
  tested. Build the domain layer first; the UI just renders it.
- A new table without an RLS policy in the same migration.
- Using Drizzle (admin role — bypasses RLS) for a request-time query. Drizzle
  is migrations only; requests use the user's `supabase` client.
- An insert that omits `user_id` (or sets someone else's) — the RLS
  `WITH CHECK` rejects it, but set it right the first time.
- Float money. Store and compute in minor units; format only at the display
  edge.
- Bucketing by `created_at` instead of `occurred_at`.
- Counting `is_transfer` rows, or non-`confirmed` rows, in spend/income totals.
- Treating a refund as its own concept instead of a `credit` in the same
  expense category that nets against spend.

---

## Adding a transaction source — the ingestion-adapter contract

All transaction sources (manual, email, receipt, bank) implement one interface
and insert through one shared function. Adding a source in a later phase is
"write an adapter + a receiver", nothing else.

```ts
type TransactionSource = 'manual' | 'email' | 'receipt' | 'bank'

interface NormalizedTxn {
  accountId: string
  categoryId: string | null       // null = uncategorized
  amount: number                  // minor units, positive
  direction: 'debit' | 'credit'   // debit = money out
  occurredAt: string              // ISO 8601
  description: string
  note?: string
  isTransfer: boolean             // between the user's own accounts; excluded from rollups
  source: TransactionSource
  sourceRef?: string              // stable id from the source, for dedupe
  status: 'confirmed' | 'pending_review'
}

interface IngestionAdapter {
  source: TransactionSource
  normalize(raw: unknown): NormalizedTxn   // source payload -> common shape
  dedupeKey(n: NormalizedTxn): string | null
}
```

### Rules

- **One insert path.** `landTransaction(supabase, userId, n: NormalizedTxn)` in
  `src/lib/ingestion/land.ts` is the only place a transaction row is created.
  It applies the `(user_id, source, source_ref)` partial unique index (on
  conflict → no-op, return existing row) and inserts via the user's supabase
  client. `normalize()` stays pure and is unit-tested; `landTransaction` is a
  thin reviewed wrapper.
- **`status`**: `manual` and `bank` land as `confirmed`. `email` and `receipt`
  land as `pending_review` until the user confirms/fixes them in a queue.
- **`dedupeKey`** returns `null` for `manual` (never deduped). For automatic
  sources it returns a stable string written to `source_ref` — the bank
  transaction id, or for email the `Message-ID` (fall back to a content hash
  only to split several transactions parsed from one message, never to
  identify the message itself).
- **Categorization** is best-effort inside/after `normalize`; `null` is always
  acceptable and the user can set it later.
- **Transfers**: `isTransfer` is set by the user (manual toggle) or inferred by
  an adapter (e.g. a recognised credit-card payment). Transfer rows never enter
  `monthlyActuals` or `rollup`.
- **Refunds** need no special handling — a refund is a `credit` row in the
  original expense category; `monthlyActuals` nets it against spend.
- **Location**: `src/lib/ingestion/<source>.ts` for the adapter; the receiver
  (form handler, webhook, upload handler) lives in `src/server/` or
  `src/app/api/`.
- **Tests first**: `normalize` and the `landTransaction` dedupe path get unit
  tests before implementation.

### Adapter status by tier

- Shipped: `ManualAdapter` only (now the fallback path).
- **V1:** `PlaidAdapter` — Plaid Link + `/transactions/sync`; the primary
  automatic path.
- **V2:** `EmailAdapter` (inbound-email webhook) and `ReceiptAdapter` (camera
  upload + confirmation popup) for cash, split bills, and institutions Plaid
  can't reach.

---

## Supabase specifics

- **Data access.** The app talks to Postgres only through `supabase-js` with
  the user's session (PostgREST + RLS). Drizzle + the `DATABASE_URL` /
  `DIRECT_URL` connection strings exist **only** for `db:generate` /
  `db:migrate`. `DIRECT_URL` (port 5432) is what migrations use — the pooled
  `DATABASE_URL` (6543) runs PgBouncer in transaction mode and breaks some DDL.
- **Signup seed is a trigger.** `handle_new_user()` on `auth.users`
  (`security definer`) creates the `profiles` row, default `categories`, and a
  starter `accounts` row in one shot. Never rely on client code to seed a new
  account.
- **Realtime respects RLS** and only fires for tables added to the
  `supabase_realtime` publication. Add `transactions` and `budgets` in a
  migration; subscriptions still filter by `user_id`.
- **Storage** (V2 receipts) uses a private bucket with per-user path
  prefixes and a policy scoped to `auth.uid()`.

---

## AI extraction (V2 — email / receipt) — placeholder

When email/receipt parsing is built, add the extraction contract here (output
JSON schema, model, prompt structure, confidence → `pending_review` handling,
eval harness, cost notes). API mechanics: consult the `claude-api` skill.
