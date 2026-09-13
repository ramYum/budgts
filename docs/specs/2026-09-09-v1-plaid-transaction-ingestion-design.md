# V1 Design — Plaid Transaction Ingestion

Date: 2026-09-09
Status: **implemented, staging-accepted, and the code + schema promoted to
production** (`4590520`, 2026-09-13). Every step in §31 shipped — see
`docs/workflow.md` §4 (milestone tracker M1–M9, workstreams A–E, all done)
and §7. The one caveat that is still current: Plaid UI itself
(`NEXT_PUBLIC_PLAID_ENABLED`) stays flag-gated **off** in production pending
Milestone 10 (owner-gated Plaid Production API access) — everything else in
this document has shipped.
Supersedes: the "Phase 5 — Bank connect via Plaid" sketch in `docs/workflow.md`
(now V1).

---

## 1. Purpose

Make **Plaid the primary way transactions enter Budgts**. The user links their
bank/card accounts once; real transactions then flow in automatically, are
normalized to the Budgts ledger, auto-categorized, and immediately counted in
budget-vs-actual and the dashboard. Manual entry stays as a fallback for cash
and unsupported institutions.

After V1, a typical week needs **zero** transaction data entry. The only
recurring user action is fixing an ambiguous category.

Success = the verification steps in §25 pass in Sandbox, and (owner-gated) a
real linked account in Production syncs correctly.

## 2. Non-goals for V1

- Recurring / subscription / bill **detection** and the "upcoming bills" surface
  → **V1.5** (this doc only guarantees the data model supports it — §24).
- Paired-transfer **leg-linking** → V1.5 (V1 only *flags* obvious transfers so
  they don't miscount).
- Spending insights, cash-flow forecasting, safe-to-spend, net worth → V2.
- Multi-currency transactions with conversion (still deferred; V1 degrades
  safely — §13).
- Investments / liabilities / identity / auth (account & routing numbers) Plaid
  products. V1 uses **`transactions`** only.
- LLM categorization. V1 categorization is a deterministic mapping table; any
  ML/LLM refinement is later.
- A managed job queue. V1 uses a `needs_sync` flag + a scheduled poller (§20).

## 3. Product principle → concrete rules

| Principle | V1 rule |
| --- | --- |
| Minimize manual entry | Imported transactions **land live** as `status = 'confirmed'`. No per-transaction "approve" step. |
| Interaction only for exceptions | The only prompt is a **"Needs a category"** list (`category_id IS NULL`). Everything else is silent. |
| Corrections are cheap and sticky | When the user sets/changes a category on an imported row, it is marked `user_categorized` and **re-sync never overwrites it**. |
| The ledger is truth | `transactions` holds **real events only** — see §4. |

## 4. Hard architectural constraint — ledger vs predictions

**Do not create ledger rows for expected/future bills.** `transactions` is an
append-mostly record of financial events that actually happened (imported from
Plaid, or manually entered as a real event).

- "Upcoming bill" / "expected paycheck" is a **derived prediction**, not a row
  in `transactions`. In V1.5 predictions live in their own table
  (`recurring_streams`: merchant, cadence, expected amount, next date, status).
- When a real transaction arrives that matches a stream (merchant + amount
  tolerance + date window), V1.5 **links** it (`transactions.recurring_stream_id`)
  and advances the stream's `next_date`. The stream is never materialised into
  the ledger.
- V1 has no bills UI, so V1 cannot violate this — but the schema and the
  normalization path are built so V1.5 never has to restructure the ledger
  (§24).

## 5. What Plaid provides vs what Budgts builds

| Plaid provides | Budgts builds |
| --- | --- |
| Institution connectivity, credential capture, MFA | The `link_token` endpoint + client `<PlaidLink>` wiring |
| Hosted **Link** UI (security/PCI handled) | `public_token` → `access_token` exchange + **encrypted at-rest storage** |
| One `access_token` + `item_id` per linked institution ("Item") | `plaid_items` / `plaid_accounts` schema + RLS + the item lifecycle state machine |
| `/transactions/sync`: `added` / `modified` / `removed` + `next_cursor` / `has_more` | The **sync engine**: cursor persistence, page loop, mutation-during-pagination restart, transactional apply |
| Per-transaction fields: `amount`, `iso_currency_code`, `date`, `authorized_date`/`datetime`, `name`, `merchant_name`, `merchant_entity_id`, `personal_finance_category` (primary + detailed + confidence), `payment_channel`, `pending`, `pending_transaction_id`, `counterparties`, `location`, `website`, `logo_url` | `PlaidAdapter.normalize()` → the Budgts `NormalizedTxn` (sign → `direction`, decimal → integer minor units, currency guard, category mapping, transfer flag) |
| `/accounts/get`, `/accounts/balance/get` (metadata, balances) | Account-mapping UI (Plaid account → Budgts `accounts` row) |
| Webhooks: `SYNC_UPDATES_AVAILABLE`, legacy `TRANSACTIONS`, `ITEM/*` (login-required, pending-expiration, revoked, new-accounts), `HISTORICAL_UPDATE` | Webhook endpoint + **JWT verification** + item-state handling + sync trigger |
| Sandbox environment, test users, `/sandbox/*` helpers, webhook simulation | Test harness: fixtures, Sandbox integration suite, an E2E Link-bypass route |
| `/link/token/create` **update mode** for reconnect | Reconnect banner + update-mode flow + resume-from-cursor |
| `/item/remove` | "Disconnect bank" flow + data-retention policy |
| `/transactions/recurring/get` (V1.5) | (V1.5) recurring-stream table + matcher — V1 just stores the features it needs |
| ~24 months of history backfill (product/plan dependent) | Progress/"syncing…" UI; re-sync on `HISTORICAL_UPDATE` |

## 6. Architecture overview

```
Browser                         Budgts server (Next.js, Vercel)              Supabase (Postgres + RLS)        Plaid
───────                         ──────────────────────────────              ────────────────────────        ─────
<PlaidLink>  ──link token───▶   POST /api/plaid/link-token  ───────────────────────────────────────────▶  /link/token/create
   │  (Link UI, hosted by Plaid)
   │  public_token
   └──────────────────────▶     POST /api/plaid/exchange (user session)
                                  ├─ /item/public_token/exchange ───────────────────────────────────────▶  access_token, item_id
                                  ├─ encrypt(access_token) ─┐
                                  ├─ /accounts/get ─────────┼───────────────────────────────────────────▶  accounts[]
                                  └─ write plaid_items + plaid_accounts (user's supabase client, RLS) ──▶  rows
Account-mapping UI ────────▶     POST /api/plaid/map-accounts (user session) ──────────────────────────▶  plaid_accounts.account_id

Plaid ──webhook──▶ POST /api/plaid/webhook   (no user session)
                     ├─ verify JWT (Plaid-Verification) ◀──────────────────────────────────────────────  /webhook_verification_key/get
                     ├─ item_id → user_id           (service-role client)
                     └─ set plaid_items.needs_sync = true

Vercel Cron (every N min) ─▶ POST /api/plaid/sync-due  (CRON_SECRET)
                              └─ for each item where needs_sync or stale:
                                   runSync(item):
                                     loop /transactions/sync(cursor) ─────────────────────────────────▶  added/modified/removed, next_cursor
                                     PlaidAdapter.normalize(txn) → NormalizedTxn
                                     applyPlaidSync(added, modified, removed, existing)
                                       ├─ added   → landTransaction()          (insert, dedupe on source_ref)
                                       ├─ modified → store.update()  unless user_categorized
                                       └─ removed  → store.markRemoved()  (soft delete)
                                     persist next_cursor AFTER the apply commits   (service-role client, self-scoped by user_id)
```

Existing pieces reused unchanged: `src/lib/ingestion/land.ts` (`landTransaction`,
the `(user_id, source, source_ref)` dedupe + 23505 race recovery),
`src/lib/budget/rollup.ts` / `qualify.ts` (spend/income math),
`RealtimeRefresh` on `transactions` (imported rows appear live on the dashboard).

New modules:
- `src/lib/plaid/adapter.ts` — `PlaidAdapter.normalize()` (pure, TDD).
- `src/lib/plaid/category-map.ts` — Plaid PFC → Budgts category (pure, TDD).
- `src/lib/plaid/apply-sync.ts` — `applyPlaidSync()` reducer (pure, TDD).
- `src/lib/plaid/crypto.ts` — AES-256-GCM encrypt/decrypt for the access token.
- `src/server/plaid/*` — link-token, exchange, map-accounts, sync engine,
  webhook handler, cron handler (all server-only).
- `src/lib/ingestion/types.ts` — extend `NormalizedTxn` + `TransactionStore`
  (additive: `update`, `markRemoved`, and the new optional fields).

## 7. Plaid environments & Sandbox setup

| Env | Use | Keys |
| --- | --- | --- |
| `sandbox` | all development, the integration suite, CI, and E2E | `PLAID_CLIENT_ID`, `PLAID_SECRET` (sandbox value) |
| `production` | real linked accounts (owner-gated cutover, §26) | same client id, `PLAID_SECRET` (production value) |

Plaid removed the separate `development` environment; Sandbox is the only
pre-production tier.

**Sandbox specifics used by tests:**
- `/sandbox/public_token/create` — skip the Link UI entirely; returns a
  `public_token` for a chosen institution + products.
- `options.override_username` / a custom Sandbox user config — script exact
  transactions for deterministic assertions.
- `/sandbox/item/fire_webhook` — simulate `SYNC_UPDATES_AVAILABLE`,
  `DEFAULT_UPDATE`, etc.
- `/sandbox/item/reset_login` — force `ITEM_LOGIN_REQUIRED` to test reconnect.
- Sandbox can also emit `USER_PERMISSION_REVOKED` / `PENDING_EXPIRATION`.

**Config (constants, not per-env secrets):** `PLAID_PRODUCTS = ['transactions']`,
`PLAID_COUNTRY_CODES` (owner decision — §30.10), `Plaid-Version` header **pinned**
to a specific dated version, `PLAID_ENV` from an env var.

## 8. Account linking flow

1. **Client** mounts `<PlaidLink>` (Plaid's React SDK). On open it needs a
   `link_token`.
2. **`POST /api/plaid/link-token`** (user session): calls
   `/link/token/create` with `user.client_user_id = <budgts user id>`,
   `products: ['transactions']`, `country_codes`, `language`,
   `webhook: <site>/api/plaid/webhook`, `redirect_uri` (for OAuth banks — must
   be registered in the Plaid dashboard, uses `NEXT_PUBLIC_SITE_URL`).
   Returns `{ link_token }`. Link tokens are short-lived; create one per Link
   open.
3. **User** completes Link (institution pick, credentials, MFA, account
   selection) inside Plaid's iframe/redirect. Plaid returns a **`public_token`**
   plus lightweight `metadata` (institution, selected accounts).
4. **`POST /api/plaid/exchange`** (user session) — §9.
5. **Account-mapping step** — §11.

Update mode (reconnect) reuses steps 1–3 with `/link/token/create` given
`access_token` and **no** `products` (§23).

## 9. Secure token exchange & storage

`POST /api/plaid/exchange` (user session, server-only):

1. `/item/public_token/exchange(public_token)` → `{ access_token, item_id }`.
2. `/accounts/get(access_token)` → account list + institution.
3. `encrypt(access_token)` — **AES-256-GCM**, key = `PLAID_TOKEN_ENC_KEY`
   (32 bytes, base64, in Vercel env + `.env.local`, **never** `NEXT_PUBLIC_*`).
   Store `iv || ciphertext || authTag` (base64) in `plaid_items.access_token_enc`.
4. Insert `plaid_items` (one row) + `plaid_accounts` (one row per Plaid account)
   via the **user's** Supabase client, with `user_id` set explicitly (RLS
   `WITH CHECK`).
5. Response body contains **no token** — only the new `plaid_item` id and the
   accounts to map.

Rules:
- The `access_token` is only ever decrypted server-side, in the sync engine /
  reconnect / disconnect paths. It never appears in a response, a log, an error
  message, or client code.
- `public_token` and `link_token` are the only Plaid values the client sees;
  both are short-lived and useless without the server secret.
- Decision on encryption mechanism → §30.1 (recommend app-layer AES-GCM;
  alternatives: Supabase Vault, `pgcrypto`).

## 10. Data model (proposed — not migrated until approved)

All new tables: `id uuid pk`, `user_id uuid not null` FK → `auth.users` on
delete cascade, `created_at` / `updated_at timestamptz`, **RLS enabled**, policy
`FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
— identical idiom to the Phase 1 tables.

### `plaid_items`
| col | type | notes |
| --- | --- | --- |
| `item_id` | text unique | Plaid Item id |
| `institution_id` | text | |
| `institution_name` | text | |
| `access_token_enc` | text | AES-256-GCM blob; never leaves the server |
| `transactions_cursor` | text null | `/transactions/sync` cursor; null = never synced |
| `status` | enum `plaid_item_status` | `active` \| `login_required` \| `pending_expiration` \| `revoked` \| `error` |
| `error_code` | text null | last Plaid `error_code` when `status = 'error'` |
| `needs_sync` | boolean default false | set by webhook, cleared by the poller |
| `last_webhook_at` | timestamptz null | |
| `last_synced_at` | timestamptz null | |
| `sync_failures` | int default 0 | consecutive failures; drives backoff + `status='error'` |

### `plaid_accounts`
| col | type | notes |
| --- | --- | --- |
| `plaid_item_id` | uuid FK → plaid_items on delete cascade | |
| `plaid_account_id` | text unique (per user) | Plaid `account_id` |
| `account_id` | uuid FK → accounts, null | the mapped Budgts account; null = unmapped/ignored |
| `link_state` | enum | `mapped` \| `ignored` \| `unmapped` |
| `name` / `official_name` / `mask` | text | |
| `type` / `subtype` | text | `depository` / `credit` / … |
| `iso_currency_code` | text null | |
| `current_balance` / `available_balance` | integer null | minor units, refreshed opportunistically |
| `balance_as_of` | timestamptz null | |

### `transactions` — additive columns only (no change to existing columns/indexes)
| col | type | why |
| --- | --- | --- |
| `plaid_account_id` | uuid FK → plaid_accounts, null | which linked account this came from (also derivable via `account_id`, but explicit is cheaper for sync) |
| `pending` | boolean default false | Plaid pending state — **distinct from `status`** |
| `pending_plaid_transaction_id` | text null | the posted row records which pending row it replaced (audit + carry-over trace) |
| `merchant_name` | text null | normalized merchant (Plaid `merchant_name`) |
| `merchant_entity_id` | text null | **stable** Plaid merchant id — the key feature for V1.5 recurring/subscription detection |
| `plaid_category_primary` | text null | Plaid PFC primary (audit; lets us re-map later without re-fetching) |
| `plaid_category_detailed` | text null | Plaid PFC detailed |
| `plaid_pfc_confidence` | text null | `VERY_HIGH` … `LOW` |
| `user_categorized` | boolean default false | true once the user sets the category → sync never overwrites |
| `removed_at` | timestamptz null | soft delete for Plaid `removed` (and hard-purge later) |
| `authorized_at` | timestamptz null | Plaid `authorized_date`/`datetime` when present (better than post date for ordering) |
| `transfer_pair_id` | uuid null (self-FK) | **V1.5** paired-transfer leg-linking — nullable now, populate later |
| `recurring_stream_id` | uuid null | **V1.5** recurring-stream linkage — nullable now, populate later |
| `raw` | jsonb null | the raw Plaid transaction payload — decision §30.9; enables offline re-processing for V1.5 |

`qualify.countsForMonth` changes (small, in `src/lib/budget/`): also exclude
`removed_at IS NOT NULL`; **include or exclude `pending`** per decision §30.3.

### `plaid_webhook_events` (raw log / dead-letter)
`id`, `received_at`, `verified` bool, `webhook_type`, `webhook_code`, `item_id`,
`payload` jsonb, `handled` bool, `error` text null. Keeps a debuggable trail;
also the idempotency guard for duplicate webhook deliveries.

## 11. Account mapping (Plaid account → Budgts account)

After exchange, the mapping UI lists each `plaid_account` with: name, mask,
type/subtype, balance. For each, the user picks:
- **Create new** Budgts account (default) — inserts an `accounts` row with
  Plaid's name/mask, sets `plaid_accounts.account_id`, `link_state = 'mapped'`.
- **Map to existing** Budgts account (for users who pre-made accounts in Phase
  1c.2) — sets `account_id` to the chosen row.
- **Ignore** — `link_state = 'ignored'`, `account_id = null`; transactions on
  that Plaid account are **skipped** by the sync engine (not stored).

Multi-account within one Item (checking + savings + card at the same bank) → N
`plaid_accounts` rows, each mapped independently. Re-linking / update mode can
surface newly-available accounts to map (§23).

Decision: default to auto-create vs force explicit choice, and "ignore"
semantics → §30.5.

## 12. Ingestion flow: Plaid → PlaidAdapter → landTransaction

```
runSync(item):
  token = decrypt(item.access_token_enc)
  cursor = item.transactions_cursor            # null on first sync
  pages = []
  loop:
    res = plaid.transactionsSync({ access_token: token, cursor, count: 500 })
    pages.push(res)
    cursor = res.next_cursor
    if not res.has_more: break
  # one apply per run, after the full page set is in hand
  added    = pages.flatMap(p => p.added)
  modified = pages.flatMap(p => p.modified)
  removed  = pages.flatMap(p => p.removed)     # {transaction_id, account_id}

  existing = store.loadBySourceRefs(userId, 'bank',
               [...added, ...modified, ...removed].map(id))       # + pending refs
  plan = applyPlaidSync({
           added:    added.map(t => ({ raw: t, norm: PlaidAdapter.normalize(t, ctx) })),
           modified: modified.map(...),
           removed,
           existing,
           accountMap,        # plaid_account_id -> { budgtsAccountId, ignored }
         })
  # plan = { inserts: NormalizedTxn[], updates: {id, patch}[], softDeletes: id[] }

  db.transaction(() => {
     for i in plan.inserts:      landTransaction(store, userId, i)
     for u in plan.updates:      store.update(u.id, u.patch)
     for d in plan.softDeletes:  store.markRemoved(d)
     store.setCursor(item.id, cursor)          # persisted only here, after commit
  })
```

- **`PlaidAdapter.normalize(plaidTxn, ctx)`** is pure (no DB). `ctx` carries the
  account map, the user's currency, and the category map. Output is the existing
  `NormalizedTxn` extended with `pending`, `merchantName`, `merchantEntityId`,
  `plaidCategory*`, `authorizedAt`, `pendingSourceRef`, `raw`.
- **`landTransaction`** is unchanged — `source = 'bank'`, `sourceRef =
  transaction_id`. The partial unique index `transactions_source_ref_uq` gives
  free idempotency; the 23505 race path already exists.
- **`store.update` / `store.markRemoved`** are new `TransactionStore` methods
  (additive to the interface; the in-memory fake and `supabase-store.ts` both
  implement them).

## 13. Transaction normalization detail

| Plaid field | → Budgts | Rule |
| --- | --- | --- |
| `amount` (JSON number, +out/−in) | `amount` (int minor, `> 0`) + `direction` | `direction = amount > 0 ? 'debit' : 'credit'`; `amount = toMinorUnits(Math.abs(x))`. `x === 0` → **skip** (the `amount > 0` CHECK forbids storing zero; log it). |
| decimal → minor units | | Reuse `src/lib/budget/money.ts` parser (`"12.34" → 1234`). Guard against float artifacts: stringify with fixed precision from `iso_currency_code`'s exponent (always 2 here — 3-decimal currencies are already excluded by the product's "2-decimal currencies only" rule). Fixture tests for `12`, `12.1`, `12.30`, `0.05`, large values. |
| `iso_currency_code` (or `unofficial_currency_code`) | — | If it matches the user's currency → proceed. If not → land the row but set a `currency_mismatch` marker and **exclude from rollups** until resolved (decision §30.6). Never silently add a foreign amount to a same-currency total. |
| `date` / `authorized_date` / `datetime` | `occurred_at` (timestamptz) / `authorized_at` | `occurred_at = datetime ?? date` (Plaid `date` is date-only → treat as UTC midnight). `authorized_at = authorized_datetime ?? authorized_date` when present. Rollup keys by month of `occurred_at` (unchanged). |
| `name` / `merchant_name` | `description` / `merchant_name` | `description = merchant_name ?? name`. Store `merchant_name` separately for V1.5. |
| `merchant_entity_id` | `merchant_entity_id` | stored verbatim — stable key for recurring detection. |
| `personal_finance_category` {primary, detailed, confidence_level} | `category_id` + `plaid_category_*` | `category_id =` the deterministic **evidence chain** (§18: user rule → Budgts merchant knowledge → trusted `detailed` subtype → gated PFC primary). Store primary/detailed/confidence verbatim for audit + re-scan. |
| `pending` | `pending` | stored; `status` is still `'confirmed'` (it is a real event). |
| `pending_transaction_id` | `pendingSourceRef` (adapter) → carry-over (§16) | |
| PFC primary ∈ {`TRANSFER_IN`,`TRANSFER_OUT`} | `is_transfer = true`, `category_id = null` | Conservative. `LOAN_PAYMENTS` → transfer only if the counterparty is another linked Budgts account; else leave as expense. Leg-linking is V1.5. |
| `account_id` (Plaid) | `account_id` (Budgts) + `plaid_account_id` | via `accountMap`. If the Plaid account is `ignored` → the whole transaction is dropped. |
| `status` | `status = 'confirmed'` always | Imported = real. No `pending_review`. |

## 14. Initial sync

Triggered right after a successful exchange + mapping (and re-triggered on the
`HISTORICAL_UPDATE` webhook when Plaid finishes backfilling history):

1. `runSync(item)` with `cursor = null` — Plaid returns everything it has
   (backfill window is plan/product dependent, up to ~24 months), paginated.
2. UI shows a non-blocking "Importing your transactions…" state on the accounts
   card; the rest of the app is usable. `RealtimeRefresh` surfaces rows as they
   land.
3. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` (data changed mid-loop):
   discard the partial page set, restart the loop from the **last committed**
   cursor.
4. First successful run sets `transactions_cursor`, `last_synced_at`,
   `status = 'active'`.

## 15. Incremental `/transactions/sync`

- Cursor-based. Each poll passes the stored `transactions_cursor`; Plaid returns
  only what changed since, plus a new `next_cursor` and `has_more`.
- The page loop (§12) accumulates all pages, applies once, then persists the
  cursor **inside the same DB transaction** as the applied changes. A crash
  before commit ⇒ cursor unchanged ⇒ the next run re-fetches and re-applies
  idempotently. A crash after commit ⇒ nothing lost.
- `count` per page: 500 (Plaid max). A very large initial backfill may need many
  pages; the poller caps **pages per run** (e.g. 20) and leaves `has_more`
  handling to the next tick so a single Vercel function invocation never
  approaches its timeout (decision §30.2 covers the execution model).

## 16. Added / modified / removed + pending → posted carry-over

`applyPlaidSync` (pure reducer, exhaustively unit-tested):

- **added** → `insert` (`landTransaction`). If `pending_transaction_id` is set
  (this is a *posted* row replacing a *pending* one):
  - look up the local row for `source_ref = pending_transaction_id`;
  - if it exists and `user_categorized`, copy `category_id`, `user_categorized`,
    `note`, and any `is_transfer` override onto the new row **before** insert;
  - record `pending_plaid_transaction_id` on the new row.
- **modified** → `update` the existing row (matched by `source_ref`) with the
  re-normalized fields, **except**: never change `category_id` /
  `user_categorized` when `user_categorized = true`; never resurrect a
  `removed_at` row.
- **removed** → `markRemoved` (set `removed_at = now()`), matched by
  `source_ref`. Includes the pending row when its posted replacement arrives in
  the same batch.
- Ordering within a run: process `removed` and `added` **together** so the
  carry-over lookup sees the pending row before it is soft-deleted. Idempotent:
  re-applying the same batch is a no-op (insert hits the unique index; update is
  identical; markRemoved on an already-removed row is a no-op).

Soft-delete (not hard-delete) so: (a) `account_id` FK `ON DELETE restrict` is
never tripped, (b) an accidental Plaid removal is recoverable, (c) V1.5 detection
has a complete history. A later hard-purge job can drop rows `removed_at <
now() - 90d`.

## 17. Idempotency & deduplication

| Layer | Mechanism |
| --- | --- |
| Same transaction seen twice | `transactions_source_ref_uq` partial unique index on `(user_id, 'bank', transaction_id)` — `landTransaction` returns the existing row; the 23505 race path already exists. |
| Cursor replay after a crash | Cursor persisted only with the committed apply; re-fetch re-applies harmlessly. |
| Duplicate webhook delivery | `plaid_webhook_events` row keyed on Plaid's delivery; a repeat just re-sets `needs_sync` (already idempotent). |
| Pending vs posted (same economic event, two `transaction_id`s) | Carry-over via `pending_transaction_id` (§16); the pending row is soft-deleted, not left as a duplicate. |
| Re-link of the same institution (new Item) | New `item_id` ⇒ new `access_token`. Its transactions have **new `transaction_id`s** ⇒ they would double-count against the old Item's rows. Mitigation: on exchange, detect an existing `active` item for the same `institution_id` and prompt the user to reconnect the existing Item (update mode) instead of adding a second one. Decision §30.5. |

## 18. Automatic categorization & user corrections

> **Implemented 2026-09-10** as a deterministic evidence chain (no ML). Plan:
> `.claude/plans/whimsical-tumbling-origami.md`. The chain lives in
> `buildResolveCategory` (`src/lib/plaid/merchant-rules.ts`), is called by
> `normalizePlaidTxn` (§13), and is pure — the DB only supplies its deps.

**Evidence chain — first non-null wins** (runs *after* the adapter's
`TRANSFER_IN/OUT → is_transfer, no category` short-circuit):

| # | Resolver | LOW-confidence gate |
| --- | --- | --- |
| **R1** | **User merchant rule** — `plaid_merchant_rules[merchant_entity_id] → category_id`. Always wins, even an unusual choice (Uber→Groceries). | n/a |
| **R2** | **Budgts merchant knowledge** — `MERCHANT_KNOWLEDGE[normalizeMerchantName(merchant_name ?? name)] → seed category name → user's category id`. Static, hand-curated (`src/lib/plaid/merchant-knowledge.ts`, ~115 household-name chains; strict inclusion bar — marketplaces / payment rails excluded). `normalizeMerchantName` (`src/lib/plaid/merchant-name.ts`) is pure, exact-equality only, no fuzzy/substring. | **bypassed** |
| **R3** | **Trusted PFC `detailed` subtype** — `TRUSTED_DETAILED[detailed]` (`category-map.ts`): a conservative-core allowlist of specific-enough subtypes (ride-share, gas, fast food, coffee, groceries, utility subtypes, streaming, hair/beauty, gyms). Omits the fuzzy ones (`FOOD_AND_DRINK_RESTAURANT`, `RENT_AND_UTILITIES_RENT`, `INCOME_WAGES`). Unknown `detailed` → `null` (never throws). | **bypassed** |
| **R4** | **PFC primary fallback** — `resolvePlaidCategory(primary, detailed, confidence)`, **unchanged**: keeps the `LOW`/`UNKNOWN` → `null` gate; still **throws** `UnknownPfcPrimaryError` on an unknown primary (adapter catches → `null`); INCOME split by `detailed`. | **kept** |

Requirement: **do not globally lower the Plaid confidence threshold.** The gate
is bypassed only for merchant-specific evidence (R2) and specific-enough
subtypes (R3); the generic primary path (R4) is untouched.

- **No match / null** ⇒ `category_id = null`. Phase 1 rollup counts
  `category_id IS NULL` as expense-uncategorized, so budgets stay correct; the
  row shows in the **"Needs a category"** list (`source = 'bank' AND
  category_id IS NULL AND removed_at IS NULL AND is_transfer = false`,
  `id="needs-category"` anchor). This is the *only* place the user is asked.
  The in-app notification is a **header bell** (`NeedsCategoryBell`, rendered by
  the dashboard layout behind `plaidUiEnabled()`): a count of that same
  predicate, linking to `/transactions#needs-category`. `RealtimeRefresh` in the
  layout (`tables: ["transactions"]`) keeps the count fresh after a sync lands.
  No notifications table, feed, or push — the bell is the whole surface.
- **User correction** (`categorizeBankTransaction`, RLS client): writes
  `category_id` + `user_categorized = true` on the row; re-sync never overwrites
  it (§16). The picker offers the user's existing categories **or** a standard
  category they no longer have — Budgts re-adds it (un-archive / recreate from
  `src/lib/categories/standard.ts`, name+kind+colour from migration 0002) with
  no setup screen.
- **Per-merchant memory + backfill.** On a correction where the row has a
  `merchant_entity_id`: upsert `(user_id, merchant_entity_id) → category_id`
  into `plaid_merchant_rules` (R1 for the future), **and** run one blanks-only
  `UPDATE`: sibling `source='bank'` rows with the same `merchant_entity_id`,
  `category_id IS NULL AND user_categorized = false AND removed_at IS NULL AND
  is_transfer = false` get `category_id` set (only `category_id`;
  `user_categorized` stays `false` — auto, not manual). Never re-points a row
  that already carries a category.
- **Re-scan** — `recategorizeUncategorizedBankTxns(db, userId)` +
  `rescanUncategorized` action + a "Re-scan" button: runs the chain over stored
  row fields for every still-uncategorised bank row; idempotent; same guards.
  For the pre-existing backlog and future `MERCHANT_KNOWLEDGE` additions
  (no migration needed).
- **Deferred to V1.5:** name-keyed user rules (merchants with no
  `merchant_entity_id`); a `transactions.category_source` audit column;
  account-type / transaction-history signals; cron-driven re-scan.

## 19. How imported transactions update budgets & the dashboard

No new view-model code. Imported rows are ordinary `transactions`:

- `src/lib/budget/rollup.ts` / `monthlyActuals` / `buildDashboard` consume them
  as-is. `qualify.countsForMonth` gains two clauses: exclude `removed_at IS NOT
  NULL`; treat `pending` per §30.3.
- `is_transfer` rows are already excluded from every rollup.
- `RealtimeRefresh` is already subscribed to `transactions` ⇒ a completed sync
  makes the dashboard and `/transactions` update within a second, no code
  change.
- The dashboard's "so far this month" framing already communicates that figures
  are a running total — which fits Plaid's non-real-time sync latency.
- Recommendation: **count `pending` in actuals** (more truthful "so far",
  matches the framing; the amount can shift slightly when it posts). Alternative
  is to exclude pending and show it greyed. → §30.3.

## 20. Webhook architecture & sync triggers

**Endpoint:** `POST /api/plaid/webhook` (Next route handler, no auth session).

1. **Verify** the `Plaid-Verification` JWT: fetch the key via
   `/webhook_verification_key/get(key_id)` (cache the JWKS), verify ES256, check
   the body SHA-256 against the JWT `request_body_sha256`, and the `iat` age.
   Reject (and log to `plaid_webhook_events` with `verified = false`) on failure.
2. Persist the event, resolve `item_id → user_id` with the **service-role**
   client.
3. Dispatch by `webhook_code`:

| code | action |
| --- | --- |
| `SYNC_UPDATES_AVAILABLE` (and legacy `TRANSACTIONS` / `DEFAULT_UPDATE` / `INITIAL_UPDATE`) | `plaid_items.needs_sync = true`, `last_webhook_at = now()` |
| `HISTORICAL_UPDATE` | `needs_sync = true` (backfill finished — re-run initial sync) |
| `ITEM_LOGIN_REQUIRED` | `status = 'login_required'` → reconnect banner |
| `PENDING_EXPIRATION` | `status = 'pending_expiration'` → reconnect prompt (EU/UK re-consent) |
| `USER_PERMISSION_REVOKED` / `USER_ACCOUNT_REVOKED` | `status = 'revoked'`, stop syncing, prompt to reconnect or remove |
| `NEW_ACCOUNTS_AVAILABLE` | flag for an "add accounts" prompt (update mode) |
| `ITEM` `ERROR` | `status = 'error'`, store `error_code` |
| `WEBHOOK_UPDATE_ACKNOWLEDGED` | no-op |

4. Return **200 fast** (target < 2 s). No syncing inside the webhook.

**The poller:** `POST /api/plaid/sync-due` (protected by `CRON_SECRET`), run by
**Vercel Cron**:
- every N minutes: process items where `needs_sync = true` OR
  `last_synced_at < now() - staleness`, with per-item page caps and backoff;
- once daily: a full pass over all `active` items (backstop for missed
  webhooks).
- **Manual "Refresh now"** button (decision §30.12): calls `/transactions/refresh`
  (rate-limited, may carry cost) then `runSync`.

Execution-model decision (§30.2): webhook-flag + Vercel Cron poller
(recommended) vs inline sync in the webhook vs Supabase `pg_cron` / Edge
Function. Vercel **Hobby** cron is limited (cadence/count) — this may force the
Supabase option; to be confirmed at step 0.

## 21. Retry & error handling

Plaid errors carry `error_type` / `error_code`:

| class | handling |
| --- | --- |
| `ITEM_ERROR` (`ITEM_LOGIN_REQUIRED`, `INSTITUTION_NO_LONGER_SUPPORTED`, …) | **Do not retry.** Set item `status`, surface a reconnect/remove UI. |
| `RATE_LIMIT_EXCEEDED` | exponential backoff + jitter, retry; respect any `Retry-After`. |
| `API_ERROR` (Plaid-side) | retry with backoff; after N (e.g. 5) consecutive failures set `status = 'error'` + `error_code`, keep the daily backstop trying. |
| `INSTITUTION_ERROR` (`INSTITUTION_DOWN`, `INSTITUTION_NOT_RESPONDING`) | transient — retry next tick. |
| `INVALID_REQUEST` / `INVALID_INPUT` | our bug — log loudly, alert, stop retrying that item. |

- `sync_failures` counter drives backoff and the `error` transition; a success
  resets it.
- Partial-page failure ⇒ cursor not advanced ⇒ safe re-run.
- `plaid_webhook_events.handled = false` + `error` is the dead-letter view.
- Never surface a raw 500 to the user (Phase 1 DoD rule). Item problems render
  as a calm "Reconnect <bank>" card.

## 22. RLS & security boundaries

| Path | Client | Guard |
| --- | --- | --- |
| link-token, exchange, map-accounts, "Needs a category", disconnect, reconnect | **user's** Supabase client (session) | RLS `auth.uid() = user_id` — the isolation guard, as everywhere else |
| webhook handler, cron poller, sync engine | **service-role** client (`SUPABASE_SECRET_KEY`) | **RLS is bypassed here.** Every read/write is explicitly filtered by the `user_id` resolved from `plaid_items.item_id`. This code lives in one small module (`src/server/plaid/service-db.ts`), takes no user-supplied identifiers, and is never imported by a request handler that accepts user input. |

- `access_token`: encrypted at rest (§9); decrypted only in the
  service-role sync/reconnect/disconnect paths; never logged, never returned.
- `PLAID_SECRET`, `PLAID_TOKEN_ENC_KEY`, `CRON_SECRET`, `SUPABASE_SECRET_KEY`:
  server-only env vars; none `NEXT_PUBLIC_*`.
- Webhook authenticity: JWT verification is mandatory; unverified payloads are
  logged and dropped.
- `/api/plaid/sync-due` rejects requests without the `CRON_SECRET` header.
- Plaid `redirect_uri` for OAuth institutions must be pre-registered in the
  Plaid dashboard and exactly match `NEXT_PUBLIC_SITE_URL` + path.
- New tables carry the same RLS policy shape as Phase 1; add `transactions`
  additive columns without touching existing policies.
- `raw` jsonb (if kept) contains merchant/amount/location PII — same RLS, same
  row; no separate exposure.

## 23. Multi-account, multi-item, reconnect

- **Multi-account / one Item**: N `plaid_accounts` rows, mapped independently
  (§11). One `access_token`, one cursor, one sync.
- **Multi-item**: several `plaid_items` (different banks). Each syncs
  independently; the poller iterates all `active` items.
- **Reconnect (update mode)**: on `login_required` / `pending_expiration`, the
  `/settings` (or dashboard) shows a "Reconnect <bank>" card →
  `/api/plaid/link-token` with the item's `access_token` and no `products` →
  `<PlaidLink>` update mode → on success set `status = 'active'`, keep the
  **same** `access_token` and cursor, resume sync.
- **`NEW_ACCOUNTS_AVAILABLE`**: "Add accounts from <bank>" → update mode with
  account selection → new `plaid_accounts` rows → mapping step for the new ones
  only.
- **Same-institution re-link guard** (§17): detect an existing `active` item for
  the `institution_id` at exchange time and steer the user to reconnect rather
  than create a duplicate Item.

## 24. Disconnect vs delete a Plaid Item / revoke / retention

**These are two different operations. Only one of them ever removes transaction
history, and only behind an explicit, separate confirmation.**

### 24.1 Disconnect a Plaid Item — the normal action, **non-destructive to the ledger**

"Disconnect bank" (user-initiated) or `USER_PERMISSION_REVOKED` (Plaid-initiated)
tears down the *connection*, not the data:

1. `/item/remove(access_token)` — invalidates the token at Plaid, stops all
   future syncs and webhooks for that Item.
2. Delete the **`plaid_items`** row. `plaid_accounts` rows for that Item
   cascade-delete (`plaid_accounts.plaid_item_id → plaid_items.id ON DELETE
   CASCADE`).
3. **Imported `transactions` rows are kept, unchanged.** They are records of
   real financial events; they simply stop receiving updates. The cascading
   delete of `plaid_accounts` only nulls the pointer on those transactions —
   `transactions.plaid_account_id → plaid_accounts.id` is **`ON DELETE SET
   NULL`**. Every transaction keeps its `account_id`, `amount`, `direction`,
   `category_id`, `occurred_at`, `is_transfer`, `source = 'bank'`,
   `source_ref`, etc. Budgets and the dashboard are unaffected.

**Code-safety rules (enforced when Step 12 is implemented):**
- The disconnect handler may write to **`plaid_items`** and **`plaid_accounts`**
  only, plus the `/item/remove` call. It **must never issue a `DELETE` or
  `UPDATE` against `transactions`.**
- `transactions.plaid_account_id` **must stay `ON DELETE SET NULL`** — never
  `CASCADE`. Changing it to `CASCADE` would silently turn every disconnect into
  a mass deletion of the user's bank history. Any future migration that alters
  this FK is a red flag and needs explicit review against this section.
- A disconnected account's transactions may show "account removed" in the UI but
  are never hidden from rollups on that basis alone.

### 24.2 Delete a Plaid Item's data — rare, explicit, **destructive**

A separate "**Delete my bank data**" action (privacy / GDPR-style request), its
own confirmation dialog, never the default:

1. Everything in 24.1 (disconnect), **plus**
2. A dedicated purge function hard-deletes the `transactions` rows for that
   connection: `DELETE FROM transactions WHERE user_id = $1 AND source = 'bank'
   AND (plaid_account_id = ANY($2) OR …)`. This is the **only** code path that
   deletes bank transactions, it is gated behind the explicit confirm, and it is
   logged.

### 24.3 Other cases

- **Account delete** (Budgts `accounts` row): Phase 1's `transactions.account_id`
  FK is `ON DELETE restrict` — a mapped account with transactions cannot be
  hard-deleted (unchanged by V1). Disconnect is the path, not account deletion.
- **Retention note for `docs/deploy.md`**: document the two paths above; note
  Plaid's own data-retention policy; the "delete my bank data" path = 24.1 +
  24.2.

## 25. Forward-compatibility for V1.5 (no schema rewrite)

V1.5 = recurring / subscription / bill **detection** + paired-transfer
**leg-linking**, all over the **synced ledger**. V1 guarantees:

| V1.5 need | Already provided by V1 |
| --- | --- |
| Detect repeating merchant + amount + interval | `merchant_entity_id`, `merchant_name`, `amount`, `direction`, `occurred_at`, `iso_currency_code` stored per transaction from day one; `raw` jsonb (if kept) allows offline re-derivation. |
| Seed detection from Plaid | `/transactions/recurring/get` is a V1.5 add — same Item/token, **no schema impact**; it populates a new `recurring_streams` table. |
| Link a real transaction to its stream | `transactions.recurring_stream_id` (nullable) added now — V1.5 just populates it. |
| "Upcoming bill" without a fake ledger row | Enforced by §4: predictions live in `recurring_streams`, never in `transactions`. |
| Expected paycheck / projected-savings tile | `inflow_streams` from the recurring endpoint (V1.5) → `recurring_streams`; the dashboard reads streams, not ledger rows. |
| Paired-transfer linking | `is_transfer` is set conservatively in V1; `transfer_pair_id` (nullable self-FK) added now — V1.5 populates it by matching opposite-amount / near-date legs across linked accounts. Rollups already ignore `is_transfer`, so linking changes nothing downstream. |
| Re-run detection over history | Soft-deleted rows kept (`removed_at`); full history retained on disconnect. |

The idempotency spine (`source` / `source_ref` / the partial unique index) is
also exactly how V2's `EmailAdapter` / `ReceiptAdapter` will land rows — no
change needed for them either.

## 26. Testing strategy

**Unit (Vitest, TDD, `src/lib/plaid/*` + `src/lib/ingestion/*`) — pure, no network:**
- `PlaidAdapter.normalize` — fixture table: depository debit; depository
  credit/income; refund (negative in an expense category); credit-card
  purchase; transfer in/out; `LOAN_PAYMENTS` with and without a linked
  counterparty; foreign currency; 1-decimal / trailing-zero / large amounts;
  zero amount (skipped); missing `datetime`; missing `merchant_name`; low PFC
  confidence.
- `category-map` — every PFC primary → a category or null; an unknown primary
  **throws**.
- `applyPlaidSync` — added/modified/removed permutations; `user_categorized`
  never overwritten; pending→posted carry-over; idempotent replay; removed then
  re-added.
- `qualify` / `rollup` — imported rows produce the right budget-vs-actual;
  `removed_at` excluded; `pending` per the chosen rule; transfers excluded.
- `crypto` — encrypt→decrypt round-trip; tampered blob fails the auth tag.

**Integration (Plaid Sandbox + a real Supabase project — matches the "e2e
against Supabase" posture in `docs/conventions.md`):**
- link-token → `/sandbox/public_token/create` → exchange → `plaid_items` +
  `plaid_accounts` rows exist; token round-trips; **no token in any response
  body**.
- initial `runSync` lands N transactions; a second run is a no-op (cursor +
  unique index).
- `/sandbox/item/fire_webhook SYNC_UPDATES_AVAILABLE` → poller runs → exactly
  the new transactions appear.
- scripted Sandbox user with a known pending transaction → it posts → carry-over
  keeps a user-set category.
- `/sandbox/item/reset_login` → `status = 'login_required'` → reconnect (update
  mode) → sync resumes from the stored cursor.
- `/item/remove` → item + accounts gone, transactions retained, no further
  syncs.
- webhook JWT verification: a crafted valid JWT is accepted; a bad signature is
  rejected and logged.
- New script `npm run test:plaid` (needs Sandbox `PLAID_*` secrets). CI posture
  → §30.8 (run in a dedicated CI job vs local-only).

**E2E (Playwright):**
- Plaid Link's iframe/redirect is **not reliably scriptable**. Add a
  **test-only** route (`/api/plaid/test/seed`, enabled only when `PLAID_ENV =
  sandbox` + a test flag) that runs `/sandbox/public_token/create` + exchange,
  so the E2E exercises **Budgts'** post-link flow.
- One happy-path spec: seed link → map accounts → synced transactions listed →
  categorize an uncategorized one → dashboard budget-vs-actual reflects it →
  disconnect → transactions retained, item gone.
- Webhook spec: POST a verified payload to `/api/plaid/webhook` → assert a sync
  is triggered.
- Keep these out of the default `test`/`test:e2e` gate if secret-sprawl or
  flakiness is a concern → §30.8.

**Manual QA:** one real Sandbox Link in a browser to validate the actual Link
handoff and OAuth `redirect_uri`.

**Gates unchanged:** `lint` · `typecheck` · `test` · `build` · `test:e2e` green
per checkpoint; `test:plaid` runs where decided.

## 27. Production approval, costs, deployment

**Verify all of this at step 0 against current Plaid docs/dashboard — pricing
and access terms change.**

- **Access**: Sandbox is immediate, no application. **Production** for the
  Transactions product requires a Plaid account, billing details, and
  (historically) a Production access request / signed agreement; there may be a
  limited free tier for the first N Items. Timeline is the main external
  unknown. → owner action §30.10.
- **Cost**: Transactions is billed **per connected Item per month** (order of
  ~$0.30–$1.30/Item/month historically; **confirm current**). At one user that
  is a few dollars/month; still a card-on-file signup step. Some plans carry
  minimums — confirm.
- **Region**: `PLAID_COUNTRY_CODES` must match where the user banks (US/CA/UK/EU
  coverage is strong). → §30.10.
- **Deployment process**:
  1. Add env vars (names only) to `.env.local.example`; real values in
     `.env.local` + Vercel: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`,
     `PLAID_TOKEN_ENC_KEY`, `CRON_SECRET`. `SUPABASE_SECRET_KEY` already exists.
  2. Register the webhook URL and OAuth `redirect_uri` in the Plaid dashboard
     (`https://budgts.com/api/plaid/webhook`, `https://budgts.com/...`).
  3. Apply the migration to the Supabase project (no local Docker — apply then
     verify, per the 2a precedent), confirm RLS with a quick cross-user check.
  4. Configure Vercel Cron (or Supabase `pg_cron`) for the poller + daily
     backstop.
  5. Ship behind a flag; validate in Sandbox against prod infra; then flip
     `PLAID_ENV = production` after Plaid approves.
  6. Update `docs/deploy.md` ("Current deployment" + a Plaid section) and
     `docs/workflow.md` status board.

## 28. Assumptions

1. One Plaid Item per institution; a user may hold several Items.
2. Linked-account currency matches the user's single currency in the common
   case; mismatches are rare and handled conservatively (§13), not converted.
3. Vercel Hobby limits (function duration, cron cadence/count) are sufficient
   with page caps + resume; if not, the poller moves to Supabase `pg_cron` /
   Edge Function (§30.2).
4. One user's ~24 months of history is a few thousand rows — fine for Supabase
   free tier.
5. Plaid `personal_finance_category` primary set is stable enough to map with a
   versioned table that **fails loud** on an unknown value.
6. Only the `transactions` product is needed for V1.
7. Migrations are applied directly to the Supabase project and verified after
   (no local Docker), as in Phase 2a.
8. `NEXT_PUBLIC_SITE_URL` (`https://budgts.com`) is the stable base for webhook
   + OAuth redirect registration.

## 29. Risks & limitations

| Risk | Mitigation / note |
| --- | --- |
| Production access timeline / contract with Plaid | Sandbox unblocks 100% of build + test; only the final cutover waits. Start the Plaid signup early (§30.10). |
| Pricing changes / plan minimums | Re-confirm at step 0; it is the owner's cost to accept (§30.10). |
| Plaid Link not scriptable in E2E | Sandbox seed route for post-link coverage; real Link gets manual QA only. |
| Vercel Hobby cron limits | May force Supabase `pg_cron`/Edge Function for the poller (§30.2). |
| Webhook path bypasses RLS (service key) | One tiny audited module, always self-scoped by resolved `user_id`, never fed user input (§22). |
| pending→posted churn losing user edits | Carry-over via `pending_transaction_id`, exhaustively unit-tested (§16). |
| Cursor mishandling / mutation-during-pagination → dup or dropped txns | Persist cursor only with the committed apply; restart the loop on the mutation error (§14–15). |
| Sign / rounding bug silently corrupts budgets | Reuse the tested `money` layer; fixture-heavy adapter tests; `amount > 0` CHECK backstops zero/negative. |
| Removed transactions drift totals | Soft-delete + `qualify` exclusion (§16, §19). |
| Foreign-currency transactions | Land + flag + exclude from rollups; no conversion in V1 (§13, §30.6). |
| Duplicate Item on re-link → double count | Same-institution guard steers to reconnect (§17, §23). |
| Sync latency / user expects real-time | "so far this month" framing already sets this; surface `last_synced_at`. |
| Plaid response-shape / taxonomy drift | Pin `Plaid-Version`; the category mapper throws on unknowns; `raw` jsonb allows reprocessing. |
| Institution flakiness | Reconnect card, never a hard app failure (§21). |

## 30. Decisions needing owner approval

> **Resolved 2026-09-09 in §32** after Step 0 verification. All landed on the
> recommended position **except §30.2** (sync execution model), which
> verification changed: Vercel Hobby cron is daily-only, so the poller moves to
> **Supabase `pg_cron` → `pg_net` HTTP → the Vercel sync endpoint**. The list
> below is kept for provenance.

1. **Token encryption**: app-layer **AES-256-GCM** with `PLAID_TOKEN_ENC_KEY`
   *(recommended — portable, simple)* vs Supabase Vault vs `pgcrypto`.
2. **Sync execution model**: webhook→`needs_sync` flag + **Vercel Cron poller**
   + daily backstop *(recommended)* vs inline sync in the webhook vs Supabase
   `pg_cron` / Edge Function. Contingent on Vercel Hobby cron limits (checked at
   step 0).
3. **Pending transactions in actuals**: **count them** *(recommended — truthful
   "so far", matches framing)* vs exclude-but-show-greyed.
4. **On disconnect / revoke**: **retain** imported transactions as history
   *(recommended)* vs purge them.
5. **Account mapping default**: **auto-create** a Budgts account per Plaid
   account *(recommended)*, with map-to-existing and "ignore" options; plus the
   **same-institution re-link** behaviour (steer to reconnect vs allow a second
   Item).
6. **Foreign-currency transactions in V1**: land + flag + **exclude from
   rollups** until resolved *(recommended)* vs block at ingest vs fixed-rate
   convert.
7. **Per-merchant categorization memory in V1** (`plaid_merchant_rules`):
   **include** *(small, high-leverage, seeds V1.5)* vs defer to V1.5.
8. **CI for Sandbox integration tests**: dedicated CI job with `PLAID_*` secrets
   vs local-only `npm run test:plaid` (kept out of the default gate).
9. **Store `raw` Plaid payload (jsonb)**: **yes** *(recommended — powers V1.5
   offline reprocessing / debugging)* vs no (storage + PII minimization).
10. **Plaid account setup** (owner action): create the Plaid account, accept
    pricing/plan, set `PLAID_COUNTRY_CODES`, provide Sandbox keys now and
    Production keys after approval.
11. **Pull `/accounts/balance` now**: opportunistically store balances for a
    future Net Worth tile *(cheap)* vs defer entirely to V2.
12. **Manual "Refresh now" button** using `/transactions/refresh` (has
    rate-limit / possible cost) vs rely on webhooks + cron only.

## 31. Proposed V1 implementation sequence

Each step ends with its own tests green and is independently reviewable. Steps
1–4 are pure logic (TDD) and touch no infrastructure.

**Step 0 — Plaid account + Sandbox wiring** *(owner + me; decisions §30.1,
§30.2, §30.10)*
Create the Plaid account; get `PLAID_CLIENT_ID` + Sandbox `PLAID_SECRET`; add
env var **names** to `.env.local.example`; confirm current pricing, Production
requirements, `/transactions/sync` + webhook shapes, and Vercel Hobby cron
limits. *Testable:* a throwaway script hits `/institutions/get` in Sandbox and
returns 200.

**Step 1 — Schema proposal → migration (approval-gated)**
`plaid_items`, `plaid_accounts`, `plaid_webhook_events`, optional
`plaid_merchant_rules`, additive `transactions` columns, RLS policies, enums.
*Testable:* migration up/down clean; RLS cross-user check; existing full suite
still green.

**Step 2 — `PlaidAdapter.normalize` (pure, TDD)**
Fixture-driven Plaid txn → extended `NormalizedTxn`. *Testable:* the §26 unit
table.

**Step 3 — `category-map` (pure, TDD)**
PFC primary → Budgts category id | null; exhaustive; throws on unknown.
*Testable:* unit.

**Step 4 — `applyPlaidSync` reducer + `TransactionStore` extension (pure, TDD)**
`(added, modified, removed, existing, accountMap) → {inserts, updates,
softDeletes}`; `user_categorized` respected; pending→posted carry-over;
idempotent. Add `update` / `markRemoved` to the in-memory fake. *Testable:*
unit.

**Step 5 — `crypto.ts` + token exchange + storage (server; Sandbox integration)**
`POST /api/plaid/link-token`, `POST /api/plaid/exchange` → encrypted
`plaid_items` + `plaid_accounts`. *Testable:* Sandbox — public-token → exchange
→ rows exist, token round-trips, **no token in any response**.

**Step 6 — Account-mapping UI + action** — ✅ built (behind `NEXT_PUBLIC_PLAID_ENABLED`)
`<ConnectBank>` + `<LinkHandoff>` (`react-plaid-link@5`) → `/api/plaid/link-token`
→ `/api/plaid/exchange` → `<AccountMapping>` (new / existing / skip) →
`mapAccounts` server action writes `plaid_accounts.account_id` / `link_state`,
creates `accounts` rows for "new", then runs the first sync. Component-tested.

**Step 7 — Sync engine `runSync(itemId)` (server; Sandbox integration)**
Page loop, mutation-during-pagination restart, transactional apply via steps
2–4, cursor persisted post-commit, error taxonomy + backoff, item-state
updates. *Testable:* Sandbox — initial sync lands N; re-run no-op; fire a
webhook that adds one → next sync adds exactly one; simulate `removed` →
soft-deleted + excluded from rollup.

**Step 8 — Wire into budgets/dashboard + "Needs a category"** — ✅ built (UI); ⏳ `qualify` clauses
`<NeedsCategory>` on `/transactions` lists uncategorised `source = 'bank'` rows;
picking a category runs `categorizeBankTransaction` (sets `user_categorized =
true`, upserts `plaid_merchant_rules`). The `/transactions`, dashboard and CSV
reads now filter `removed_at IS NULL` (guarded by the flag — the column only
exists where 0004 has run). Still to do: fold `removed_at` / `pending` into the
pure `qualify` so it's enforced in one place, with unit coverage.

**Step 9 — Webhook endpoint**
`POST /api/plaid/webhook` — JWT verification, `plaid_webhook_events` log,
`item_id → user_id`, dispatch table (§20), fast 200. *Testable:* Sandbox
`fire_webhook` + crafted valid/invalid JWTs.

**Step 10 — Poller + scheduling** *(decision §30.2)*
`POST /api/plaid/sync-due` (`CRON_SECRET`) processing `needs_sync` / stale items
+ daily backstop; optional "Refresh now" (§30.12). *Testable:* handler unit + an
integration run.

**Step 11 — Reconnect / update mode** — ✅ built
`<ConnectedBanks>` shows a "Needs attention" banner for `login_required` /
`pending_expiration` / `revoked` / `error`; `<ReconnectButton>` runs Link in
update mode (`/api/plaid/link-token` with `itemId`) then `syncConnection`, which
also flips the Item back to `active`. `NEW_ACCOUNTS_AVAILABLE` → the
"Choose accounts to import" path over the stored unmapped `plaid_accounts`.

**Step 12 — Disconnect / revoke** *(decision §30.4)* — ✅ built
`disconnectBank` action + `DELETE /api/plaid/item` share `disconnectPlaidItem`
(`src/server/plaid/disconnect.ts`): `/item/remove` (best-effort) → delete
`plaid_items` (cascades `plaid_accounts`; `transactions.plaid_account_id` SET
NULL → **history retained**). The confirm dialog states history is kept; a
separate opt-in checkbox is the only route to the destructive `purge` (§24.2).
Component-tested (retain-history copy + `purge` flag). *Still:* E2E proof.

**Step 13 — Full happy-path E2E** (Sandbox seed route for Link)
connect → map → transactions appear → categorize → dashboard updates →
disconnect. *Testable:* one green e2e.

**Step 14 — Docs + observability**
`/settings` "last synced" + item-status card; finalize this spec; add the Plaid
section to `docs/deploy.md` (env vars, webhook/redirect registration,
Production-approval checklist, "delete my bank data"); confirm
`docs/conventions.md` adapter section. *Testable:* review.

**Step 14b — Deployed V1 Beta (staging services)** — *Milestone 9 in
`docs/workflow.md`.*
Deploy the built backend + UI to the Vercel project configured against
**staging** services (budgts-staging DB, Plaid Sandbox keys, `CRON_SECRET`,
webhook URL registered in the Plaid dashboard). *Testable:* on the deployed URL —
login → Budgts UI → Connect a bank → Plaid Sandbox → account mapping →
transactions imported → displayed → categorize → merchant rule remembered →
disconnect → historical transactions remain.

**Step 15 — Production cutover** *(owner-gated; §27)*
Plaid Production approval → Production keys → `PLAID_ENV = production` → link a
real account → monitor the first syncs. *Testable:* real transactions land
correctly; budgets/dashboard match the bank.

---

## 32. Step 0 — Verification findings & resolved decisions (2026-09-09)

Web-verified against current Plaid, Vercel and Supabase docs. Sources listed at
the end of this section. **No code, schema, migration, or production change was
made.**

### 32.1 Verified facts

**Plaid — pricing & access**
- Transactions is billed as a **per-Item monthly subscription for as long as a
  valid `access_token` exists** (calendar month, UTC, not pro-rated).
- The **exact per-Item price is not public** — it is shown only on the final
  page of the Production access request flow (Pay-as-you-go / Growth).
- **Trial plan (2026):** free **production** access with real bank data,
  **auto-approved for most US/Canada developers who sign up on or after
  2026-04-15**, up to **10 Production Items**, no formal application. This
  covers all of V1 (one user ≪ 10 Items).
- Full Production access request: "**a couple of business days**"; requires a
  Dashboard company profile (legal name, product name, website, logo, support
  contact, privacy policy, data-use explanation). Transactions has its own
  launch path; webhooks required/strongly recommended. Only needed if the app
  outgrows the Trial plan.
- **Sandbox is always free, no application.**

**Plaid — `/transactions/sync` mechanics (confirm the §12–17 design)**
- `added` / `modified` / `removed`; `removed` carries only `transaction_id` +
  `account_id`.
- Cursor pagination via `next_cursor` + `has_more`. On
  `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, **restart the whole loop from
  the cursor held at the start of the run** (the last committed one), not retry
  the failed page.
- **Pending → posted:** the pending transaction is **removed** and a **new**
  posted transaction is **added with a new `transaction_id`**; the posted one
  carries `pending_transaction_id` pointing at the pending. → the §16
  carry-over design is correct as written.
- **Initial history default = 90 days** (`days_requested`); min 30 (Production),
  **max 730**. The spec's "up to ~24 months" only holds if we pass
  `transactions: { days_requested: 730 }` in `/link/token/create`.
- `SYNC_UPDATES_AVAILABLE` webhook signals new sync updates.

**Plaid — Sandbox (confirms the §26 test plan)**
- `/sandbox/public_token/create` — create an Item with no Link UI, arbitrary
  institution + products.
- Custom / rich test data; "testing pending and posted transactions" is a
  supported scenario.
- `/sandbox/item/fire_webhook` — fires `SYNC_UPDATES_AVAILABLE` (and others).
- `/sandbox/item/reset_login` — forces `ITEM_LOGIN_REQUIRED` for update-mode
  tests.
- Full Link flow with `user_good` / `pass_good`.

**Plaid — webhook verification (confirms §20)**
- `Plaid-Verification` header = a JWT, alg **ES256**.
- `/webhook_verification_key/get` with the JWT header's `kid` → a JWK to verify
  the signature; also check the body SHA-256 against the JWT's
  `request_body_sha256` claim and the `iat` age.

**Vercel — Hobby cron (ARCHITECTURE-CHANGING)**
- Hobby cron **minimum interval = once per day**; per-hour precision
  (±59 min); UTC. A cron expression more frequent than daily **fails at deploy
  time**. Pro = once per minute. 100 cron jobs/project on all plans.
- ⇒ "webhook → `needs_sync` → **Vercel Cron** poller every N minutes" is **not
  possible on Hobby**.

**Vercel — Hobby function duration**
- Up to **300 s (5 min)** with Fluid Compute, the default for projects created
  since April 2025 (Budgts qualifies). Enough for the webhook (fast),
  incremental sync (small), and a normal user's initial backfill (a few pages
  at 500/page); still cap pages/run and resume via `has_more`.

**Supabase — `pg_cron` / `pg_net` (the replacement poller)**
- `pg_cron` ships on **all plans incl. Free**, enabled from the Dashboard.
  Schedule granularity **sub-minute → yearly**. Guidance: ≤ 8 concurrent jobs,
  each ≤ 10 min.
- `pg_net` (`net.http_post`) lets Postgres call an external URL / Edge Function
  on a schedule; available on Free.
- ⇒ **`pg_cron` every ~2–5 min → `net.http_post('https://budgts.com/api/plaid/sync-due',
  <CRON_SECRET header>)`** replaces the Vercel Cron poller. The sync engine
  stays in the Vercel Node app, so `PLAID_SECRET` + `PLAID_TOKEN_ENC_KEY` live
  in **one** place (Vercel env). A daily full backstop = a second `pg_cron`
  entry.

**Token encryption**
- Supabase **discourages** Transparent Column Encryption / Server Key Management
  (pgsodium-derived) — "high operational complexity and misconfiguration risk";
  `pgsodium` is pending deprecation. Supabase **Vault** persists but targets a
  small set of config secrets, not per-row per-user values.
- ⇒ **Confirmed: app-layer AES-256-GCM in the Node server.** Key
  `PLAID_TOKEN_ENC_KEY` = 32 random bytes (base64) in **Vercel project env vars
  (Production + Preview)** and `.env.local`; **name only** in
  `.env.local.example`; never `NEXT_PUBLIC_*`. Node `crypto`: `aes-256-gcm`,
  random 12-byte IV per encrypt, store `keyVersion(1B) || iv(12B) ||
  authTag(16B) || ciphertext` base64 in `plaid_items.access_token_enc`. The
  `keyVersion` prefix allows a future key rotation. Because the poller is
  `pg_cron → HTTP → Vercel`, the key never needs to exist in Supabase.

### 32.2 Architecture changes required

1. **Poller: Vercel Cron → Supabase `pg_cron` + `pg_net`.** Webhook still only
   sets `needs_sync = true` on Vercel (service-role). Adds a **Supabase
   Dashboard step** (enable `pg_cron` + `pg_net`, create two schedules: ~3 min
   incremental, 1×/day full) to Step 10 and to `docs/deploy.md`. No Vercel Pro.
2. **`days_requested: 90`** in `/link/token/create` transactions options (Plaid's
   own default). *(2026-09-12 — revised down from an earlier 730-day decision.
   Owner's app-store-readiness goal favors data minimization and fast
   onboarding over maximum history depth. Enough for 2-3 cycles of a *monthly*
   recurring charge once V1.5 lands, but won't catch quarterly/annual bills
   until they've recurred live post-signup — revisit if that gap matters more
   than the tradeoff suggests.)*
3. **Tighten the mutation-during-pagination wording** in §14–15: restart from
   the run's starting (last-committed) cursor, per Plaid's "cursor for the
   first page of the update".
4. **Production cutover (§27 / Step 15): "Production application" → "enable the
   Trial plan"** (free, auto-approved, ≤ 10 Items) for a post-2026-04-15 US/CA
   Plaid account. The full Production request is deferred to if/when the app has
   more users.
5. Everything else in the design **stands unchanged**: the `landTransaction` +
   `(user_id, source, source_ref)` unique-index spine; `applyPlaidSync`
   reducer; pending→posted carry-over; soft-delete removals; webhook JWT
   verification; the RLS boundary (user-session vs one audited service-role
   module); additive `transactions` columns; V1.5 forward-compat.

### 32.3 Unresolved assumptions (a check, not code)

1. **Exact Plaid per-Item price** — visible only once the owner starts the
   Trial/Production flow in the Plaid Dashboard. Expected: single-digit
   $/month, possibly $0 under Trial.
2. **Owner's Plaid account age** — the Trial plan's "free real data,
   auto-approved" applies to US/CA developers who sign up **on/after
   2026-04-15**. A pre-existing older account ⇒ the full Production request
   (couple business days + company profile) applies instead. **Owner check.**
3. **Country** — `PLAID_COUNTRY_CODES`, assumed `['US']`. **Owner confirm.**
4. **Sandbox simulation of `USER_PERMISSION_REVOKED` / `PENDING_EXPIRATION`** —
   `fire_webhook` + `reset_login` are confirmed; these two weren't listed on
   the Sandbox overview page. Likely via `fire_webhook` with the `ITEM` type or
   a custom user config; verify against Plaid's test-scenarios page at Step 11
   (not a blocker for Steps 1–10).
5. **`pg_net` request-volume limits on Supabase Free** — not precisely
   documented; one low-frequency POST every few minutes is far below any
   plausible cap. Verify in-dashboard when wiring Step 10.
6. **OAuth `redirect_uri` registration** — some banks require an OAuth redirect
   URI registered in the Plaid Dashboard, exactly matching
   `https://budgts.com/...`. Dashboard step, no code impact; on the deploy
   checklist.

### 32.4 Final §30 decisions

| # | Decision | Basis |
| --- | --- | --- |
| 1 | **App-layer AES-256-GCM**, key `PLAID_TOKEN_ENC_KEY` in Vercel env + `.env.local` | verification *strengthened* the recommendation |
| 2 | **CHANGED** → webhook sets `needs_sync` (Vercel) + **Supabase `pg_cron` (~3 min) → `pg_net` → `/api/plaid/sync-due`** + a daily `pg_cron` full backstop | Vercel Hobby cron is daily-only |
| 3 | **Count** `pending` transactions in actuals | recommended |
| 4 | **Retain** imported transactions on disconnect / revoke | recommended |
| 5 | **Auto-create** a Budgts account per Plaid account (+ map-to-existing, ignore); same-institution re-link **steers to reconnect** | recommended |
| 6 | Foreign-currency txns: **land + flag + exclude from rollups** | recommended |
| 7 | **Include** `plaid_merchant_rules` (per-merchant category memory) in V1 | recommended |
| 8 | Sandbox integration tests: `npm run test:plaid`, **local + a dedicated CI job**, **out of the default `test` gate** | recommended |
| 9 | **Store `raw` Plaid payload** (jsonb) on `transactions` | recommended |
| 10 | Owner: create/confirm a post-2026-04-15 **US** Plaid account, enable **Trial**, set `PLAID_COUNTRY_CODES=['US']`, hand over Sandbox keys now | owner action |
| 11 | **Yes** — opportunistically store account balances on `plaid_accounts` during sync (seeds a future Net Worth tile) | recommended |
| 12 | **Yes** — a manual "Refresh now" button (`/transactions/refresh` then `runSync`), used sparingly | recommended |
| 13 | *(superseded 2026-09-12)* `days_requested: **90**` (Plaid's default) in the Link token | app-store-readiness / data-minimization goal outweighs the deeper V1.5 history seed a 730-day pull would give |

### 32.5 Exact Step 1 scope

**Deliverable:** one migration (`supabase/migrations/0004_*.sql` + `schema.ts`)
**written and reviewed, not applied.** Applied to the Supabase project only
after explicit owner approval (the 2a "apply then verify" precedent).

**New tables** — all with `id uuid pk`, `user_id uuid not null` FK →
`auth.users` on delete cascade, `created_at` / `updated_at timestamptz default
now()`, RLS enabled, policy `FOR ALL TO authenticated USING (auth.uid() =
user_id) WITH CHECK (auth.uid() = user_id)`:

- **`plaid_items`** — `item_id text unique`, `institution_id text`,
  `institution_name text`, `access_token_enc text`, `transactions_cursor text
  null`, `status plaid_item_status` (`active|login_required|pending_expiration|
  revoked|error`), `error_code text null`, `needs_sync boolean default false`,
  `last_webhook_at timestamptz null`, `last_synced_at timestamptz null`,
  `sync_failures int default 0`.
- **`plaid_accounts`** — `plaid_item_id uuid` FK → `plaid_items` on delete
  cascade, `plaid_account_id text` (unique per user), `account_id uuid null`
  FK → `accounts` on delete set null, `link_state plaid_account_link_state`
  (`mapped|ignored|unmapped`), `name / official_name / mask text`, `type /
  subtype text`, `iso_currency_code text null`, `current_balance /
  available_balance integer null`, `balance_as_of timestamptz null`.
- **`plaid_webhook_events`** — `received_at timestamptz default now()`,
  `verified boolean`, `webhook_type text`, `webhook_code text`, `item_id text
  null`, `payload jsonb`, `handled boolean default false`, `error text null`.
  (Written only by the service role; `authenticated` policy `USING (false)` or a
  `user_id`-scoped join — settle in review.)
- **`plaid_merchant_rules`** — `merchant_entity_id text`, `category_id uuid`
  FK → `categories` on delete cascade, unique `(user_id, merchant_entity_id)`.

**Enums:** `plaid_item_status`, `plaid_account_link_state`.

**Additive columns on `transactions`** (no change to existing columns, indexes,
RLS, the `amount > 0` CHECK, or the FKs): `plaid_account_id uuid null` FK →
`plaid_accounts` on delete set null · `pending boolean default false` ·
`pending_plaid_transaction_id text null` · `merchant_name text null` ·
`merchant_entity_id text null` · `plaid_category_primary text null` ·
`plaid_category_detailed text null` · `plaid_pfc_confidence text null` ·
`user_categorized boolean default false` · `removed_at timestamptz null` ·
`authorized_at timestamptz null` · `transfer_pair_id uuid null` (self-FK, V1.5)
· `recurring_stream_id uuid null` (V1.5) · `raw jsonb null`.

**Indexes:** `plaid_items (user_id)`; partial `plaid_items (needs_sync) WHERE
needs_sync`; `plaid_accounts (user_id)`; `plaid_accounts (plaid_item_id)`;
partial `transactions (merchant_entity_id) WHERE merchant_entity_id is not null`
(V1.5). The existing `transactions_source_ref_uq` already covers bank dedupe —
unchanged.

**Realtime:** `transactions` is already published — no change. (Optionally add
`plaid_items` so the reconnect banner updates live — settle in review.)

**Explicitly NOT in Step 1:** no `pg_cron` / `pg_net` enablement; no env vars;
no Plaid client, adapter, or routes; no `qualify.ts` change. Those are Steps 2+.

**Step 1 exit criteria:** migration + `schema.ts` written; `npm run db:generate`
diff reviewed; `schema.ts` typechecks; a written up/down description;
`lint` / `typecheck` / `test` / `build` still green with the new types present
but unused. **Not applied until approved.**

### 32.6 Sources

- Plaid billing & plans — <https://plaid.com/docs/account/billing/>
- Plaid Trial / Production / Limited Production —
  <https://support.plaid.com/hc/en-us/articles/16110110883479>
- Plaid Production access & launch checklist —
  <https://plaid.com/docs/launch-checklist/>
- Plaid `/transactions/sync` API — <https://plaid.com/docs/api/products/transactions/>
- Plaid transaction states (pending→posted) —
  <https://plaid.com/docs/transactions/transactions-data/>
- Plaid Sandbox — <https://plaid.com/docs/sandbox/>
- Plaid webhook verification —
  <https://plaid.com/docs/api/webhooks/webhook-verification/>
- Vercel cron usage & limits —
  <https://vercel.com/docs/cron-jobs/usage-and-pricing>
- Vercel Hobby 60s→Fluid 300s —
  <https://vercel.com/changelog/vercel-functions-for-hobby-can-now-run-up-to-60-seconds>
- Supabase Cron (`pg_cron` / `pg_net`) — <https://supabase.com/docs/guides/cron>
- Supabase pgsodium pending deprecation / Vault —
  <https://supabase.com/docs/guides/database/extensions/pgsodium>

---

### Open (tracked elsewhere)

- §30 decisions are resolved in §32.4 **pending owner approval of the Step 0
  findings**. No Step 1 work until that approval.
- On approval: fold §32 into §20 / §27 / §31, then update `docs/workflow.md §6`
  "Open items" and the `§4` V1 bullet to point at this spec.
