# Budgts — Project Workflow

The living plan. Updated at every checkpoint. `docs/roadmap.md` is the
phase-level summary; this file is the execution tracker + decisions + change log.

---

## 1. Status board

| # | Checkpoint | Scope | Status | Commit |
| --- | --- | --- | --- | --- |
| 0 | Foundation | `CLAUDE.md`, `docs/`, scaffold (Next 16 + Supabase toolchain), gates green | ✅ done | `62e9389` |
| 1a | Data layer + budget math | Schema, RLS migration, `handle_new_user` trigger, `src/lib/budget/*` (TDD) | ✅ done | `38fbd81` |
| 1b | Auth + app shell | Supabase SSR clients, `src/proxy.ts`, `/auth/callback`, magic-link + Google, onboarding, `(app)` guard, nav shell | ✅ done | `e5c358a` |
| 1c | Transactions CRUD | `transactionFormSchema`, ingestion seam, server actions, `/transactions` UI, full-flow e2e | ✅ done | `88cbe5c` |
| — | Brand pass + hardening | Budgts identity, Volt Lime + Deep Pine palette, Poppins/Inter, `Logo`, full semantic-token system in `globals.css`; plus dedupe-race recovery, `getSessionUser` request-cache, `normalizeManual`, JPY dropped + 2-decimal currency guard, onboarding missing-profile handling, first component test | ✅ done | (see commit) |
| 1c.2 | Accounts + categories management | `/settings`: category + account create / rename / recolour / archive; category-name links to filtered transactions everywhere; `?category=` filter banner. Zod + e2e | ✅ done | (this commit) |
| 1d | Budgets + dashboard | `budgetFormSchema` + `setBudget`/`copyBudgetsFromPreviousMonth`; `buildDashboard` view-model; `/budgets` inline editor; `/` five tiles + budget-vs-actual bars (over/near/under, brand colours) + month switcher + `RealtimeRefresh`; `?category=` transaction filter | ✅ done | (this commit) |
| 1e | Polish + deploy | Service worker (installable + `/offline` fallback), CSV export route + Settings button, GitHub Actions CI, manual security review (3 fixes: open-redirect, CSV injection, proxy prefix), `docs/deploy.md`. | ✅ code done | `f31cd1a` |
| — | Brand: final look | Iterated to: **Avocado (#EEF4E2) page wash**, white cards, **Deep Pine** primary buttons + balance card + active-tab pill, **Volt Lime** only for the logo mark (always on a pine rounded-square badge) + progress fills. `docs/deploy.md` colour budget + `brand/*` re-rendered. | ✅ done | `f31cd1a` |
| — | Ship | Pushed `main` → `ramYum/budgts`; Vercel project `budgts` (team `tocino`) live at **https://budgts.com** (Cloudflare DNS, apex + www→apex). Supabase auth URL config + `NEXT_PUBLIC_*` env vars set. | ✅ live 2026-09-09 | `f31cd1a` |
| — | Post-ship fix | Proxy matcher was 307-redirecting `/sw.js` → `/sign-in`, so the service worker never registered in prod (PWA not installable / no offline). Added `sw.js` to the matcher exclusion + an e2e guard. Deployed; `https://budgts.com/sw.js` verified `200 application/javascript`, no console errors logged out. | ✅ live 2026-09-09 | `c58b27f` |
| 2a | Savings goals | `savings_goals` + `savings_contributions` (RLS, realtime, migration `0003`). Standalone contribution ledger — no transactions, no account balances. `goalProgress`/`goalsSummary` domain (TDD). Server actions incl. a separate `withdrawFromGoal` (negates) so users never type a minus. `/goals` screen + a 5th bottom-nav tab. Zod + domain + component + e2e. Spec: `docs/specs/2026-09-09-…-phase-2a-…`. | ✅ done | `2d46178` |

Legend: ✅ done · 🔄 in progress · ⏳ planned

**Shipped through Phase 2a** (`2d46178`). Next tiers: **V1 — Plaid transaction
ingestion** (primary path), then **V1.5** (recurring / subscription / bill
detection over synced data + paired-transfer detection), **V2** (email / receipt
ingestion + spending intelligence), **V2+** (AI assistant). Full ladder:
`docs/roadmap.md`; working detail: §4 below.

---

## 2. Product — locked decisions

| Area | Decision |
| --- | --- |
| Shape now | Installable **PWA** (Next.js). One codebase, phone + desktop. |
| Shape later | **Native-apps delivery track** (parallel, not a numbered tier — can start once V1 is stable): native iOS + Android via **Expo/React Native** for App Store + Play Store. Domain logic (`src/lib/budget/*`, `src/lib/validation/*`) and the Supabase backend carry over unchanged; the Next.js frontend is rebuilt. |
| Users | Single user per account. "Add another income source" = another income transaction/category, not multi-user. Household sharing: deferred, not planned. |
| Persistence | Supabase (Postgres + Auth + Realtime + Storage). Cloud, multi-device. |
| Data access | `supabase-js` with the user's session for **all** reads/writes — RLS is the isolation guard. Drizzle = migrations only. |
| Auth | Magic link + Google OAuth. No password. |
| Currency | One per user, picked at onboarding. Restricted to **2-decimal** currencies (the money layer hardcodes a 2-decimal exponent; guarded by a test). |
| Money | Integer **minor units** end to end. Format only at the display edge. |
| Categories | Seeded by trigger (migration 0002): **Insurances, Personal Care, Housing, Entertainment, Transportation, Food / Groceries** (expense); Salary, Other Income. Editable in Settings — rename, recolour, add, archive. Budgets are per category; the bill/merchant goes in the transaction description. Tapping a category name opens its transactions. |
| Transfers | `is_transfer` flag (manual toggle for now). Excluded from every rollup. Paired-transfer detection in **V1.5** (needs Plaid transactions to match the two legs against). |
| Refunds | A `credit` in the original expense category. Nets against that category's spend. No special type. |
| Budget rollover | **None.** A month's budget never carries forward — next month starts at whatever you set. Unspent budget simply raises that month's Net savings. |
| Savings | **Two separate things, both shown.** *Net savings* = derived per month (`income − spend`), a dashboard tile in 1d. *Savings goals* = named targets with progress, own table — shipped in **Phase 2a** (`2d46178`). |
| Ingestion sources | 1. **Bank connect via Plaid** (**V1** — the primary path) · 2. Manual (done — fallback for cash / unsupported banks) · 3. Email purchase-notification parsing (**V2**) · 4. Receipt photo (**V2**). All go through one `IngestionAdapter` + `landTransaction()`. |
| feature set | Categories + spend · budgets vs actual · recurring/subscription/bill tracking · savings goals. Savings goals shipped (Phase 2a); recurring tracking is **automatic detection over synced transactions in V1.5**, not manual recurring-rule entry. |


### Dashboard tiles (checkpoint 1d)

Mirrors the summary block of the owner's spreadsheet.

| Tile | Formula | Spreadsheet equivalent |
| --- | --- | --- |
| Income | Σ (credit − debit) over income categories | Total Salary |
| Spent | Σ (debit − credit) over expense + uncategorized | Actual Cost |
| **Net savings** | Income − Spent | Actual Savings |
| Budgeted | Σ budget rows for the month | Projected Cost |
| Left to spend | Budgeted − expense-category actuals | the unspent remainder |

`rollup()` already returns every one of these. Unspent budget needs no special
handling: not spending it *is* what makes Net savings higher. Label the 1d
dashboard header **"so far this month"** so partial-month figures read as a
running total, not a verdict. A true *Projected savings* tile (Income −
Budgeted) needs an **expected** monthly income; that arrives in **V1.5** from
Plaid's recurring-income detection, not a typed-in field.

---

## 3. Architecture

**Stack:** Next.js 16 (App Router, `src/`) on Vercel · Supabase · `supabase-js` +
`@supabase/ssr` · Zod · Recharts · Vitest + Testing Library · Playwright ·
Drizzle (migrations only).

**Module map**

```
src/lib/budget/        pure domain logic — money, monthKey, monthlyActuals,
                       budgetVsActual, rollup, qualify   (no framework imports)
src/lib/validation/    Zod schemas — auth, profile, transaction  (portable)
src/lib/ingestion/     NormalizedTxn / IngestionAdapter / TransactionStore,
                       ManualAdapter, landTransaction, supabaseTransactionStore
src/lib/supabase/      server.ts (+ getSessionUser), client.ts, proxy.ts
src/proxy.ts           session refresh + auth gate  (Next 16: was middleware.ts)
src/server/            "use server" actions — auth, onboarding, transactions
src/app/(auth)/        sign-in
src/app/(app)/         auth guard, onboarding, (dashboard) group
src/components/        UI — Logo, Overlay, transaction-form/list, add-transaction
supabase/migrations/   0000 schema + RLS + trigger, 0001 category reseed
```

**Portability rule:** anything under `src/lib/budget` and `src/lib/validation`
stays free of Next.js / React imports so it moves to the Expo app verbatim.
`src/lib/ingestion` depends only on a `SupabaseClient` type, not Next.

**Data model:** `profiles`, `accounts`, `categories`, `transactions`, `budgets`
— every table RLS-scoped to `auth.uid()`, FK to `auth.users` on delete cascade.
Full spec: `docs/specs/2026-09-07-budget-app-phase-1-design.md`.

---

## 4. Roadmap beyond Phase 2a — V1 → V2+

Phase 1 (manual core) and Phase 2a (savings goals, `2d46178`) are shipped. What
follows is sequenced as capability tiers — **V1 → V1.5 → V2 → V2+** — Plaid
first, because a self-filling ledger is the differentiator. Manual entry stays
the fallback; email / receipt ingestion is deferred behind Plaid + the
intelligence built on it. Tier overview + the at-a-glance tree: `docs/roadmap.md`.

### V1 — Plaid transaction ingestion (primary path)

The cleanest automatic source: Plaid returns structured transactions with a
stable `transaction_id`, so there is nothing to parse and dedupe is exact.
**This is now the primary ingestion path**, not a late add-on; manual entry
(`ManualAdapter`) stays as the fallback for cash and unsupported institutions.

**Flow.** Plaid Link (hosted UI) produces a `public_token`; the server exchanges
it for an `access_token`, stored per institution **server-side only and
encrypted at rest**. The cursor-based `/transactions/sync` endpoint pulls added,
modified and removed transactions; `PlaidAdapter.normalize()` maps each to a
`NormalizedTxn` with `source: 'bank'` and `sourceRef: transaction_id`, then
`landTransaction()` persists it. Plaid's `SYNC_UPDATES_AVAILABLE` webhook
triggers a pull, with a daily cron as backstop. Plaid accounts map onto our
`accounts` rows so the user sees familiar names. Incoming transactions are
auto-categorized (Plaid's `personal_finance_category` as the seed) and flow
through the existing budget-vs-actual / dashboard view-models unchanged.

**New tables** (both RLS-scoped; the access token never reaches the client):
`plaid_items` (item_id, institution, access_token, sync cursor, status) and
`plaid_accounts` (plaid account_id to our `accounts.id`).

**Nothing else in the core changes.** `IngestionAdapter`, `landTransaction`, the
`(user_id, source, source_ref)` unique index and the transfer/refund rules were
designed for exactly this.

**Cost and friction.** Sandbox is free and needs no application — all V1 build
happens there. Production needs a Plaid account plus a short application, then
roughly **$0.30–$1.50 per connected item per month** for Transactions. Coverage
is strong in US / CA / UK / EU. If an institution is missing, TrueLayer /
GoCardless / a regional aggregator drop into the same adapter interface with no
other change.

**Removals matter.** Plaid's sync reports deleted transactions; the adapter must
handle them (mark or remove) or the numbers silently drift.

#### V1 — build status (milestone tracker)

Design + step sequence: `docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md`
(§31 steps, §32 resolved decisions). Everything is built against **budgts-staging**
(Supabase project `iwypmifvmtmkwtnxkfma`) + Plaid **Sandbox** — the production
database (`wsmhstqpvbbcqpqhiqyp`) and Plaid Production are untouched.

| M | Scope | Status |
| --- | --- | --- |
| 1 | Plaid foundation — `src/lib/plaid/{config,client,crypto}.ts`; AES-256-GCM at-rest `access_token` encryption (`PLAID_TOKEN_ENC_KEY`) | ✅ done |
| 2 | Pure logic core (TDD) — `types.ts`, `adapter.ts` (`normalizePlaidTxn`), `category-map.ts` (PFC primary → category, throws on unknown), `apply-sync.ts` (added/modified/removed reducer, `user_categorized` sticky, pending→posted carry-over) | ✅ done |
| 3 | Ingestion landing + sync engine — `land.ts`, `sync-engine.ts` (cursor page loop, mutation-during-pagination restart, cursor persisted post-commit) | ✅ done |
| 4 | Webhook authentication — `webhook-verify.ts` (ES256 JWT, `request_body_sha256`, `iat` freshness) | ✅ done |
| 5 | Real persistence + **DB-integration test tier** — `sync-store.ts` (atomic `applyPlan`: batch `insert … on conflict do nothing returning`, updates, soft-deletes, cursor/status write), `item-store.ts`, `merchant-rules.ts`. `npm run test:integration` → real staging Postgres, synthetic fixtures, no Plaid. Caught + fixed: a 23505 inside `db.transaction()` aborts the whole PG transaction (Drizzle wraps the code) → the single-insert retry pattern was wrong there. | ✅ done |
| 6 | API routes — `POST /api/plaid/{link-token,exchange,webhook,sync-due}`, `DELETE /api/plaid/item`; pure `webhook-dispatch.ts` + `error-policy.ts` | ✅ done |
| 7 | Plaid Sandbox live + **Plaid-integration test tier** — Sandbox `client_id`/`secret` in git-ignored `.env.staging`; `sync-item.ts` (`{db, client}` injected, extracted from the `server-only` `service.ts`). `npm run test:plaid` → real Sandbox → staging Postgres: real txn shapes normalize, `syncItem` lands bank rows with every Plaid column + cursor, second sync idempotent, `fire_webhook` accepted. | ✅ done |
| 8 | Disconnect — `DELETE /api/plaid/item`: `/item/remove` + drop `plaid_items` (accounts cascade). **Imported transactions are retained** via `transactions.plaid_account_id ON DELETE SET NULL` (financial-integrity rule, design §24). `purge:true` is the only path that deletes bank rows, behind an explicit confirm. | ✅ done |

**Remaining V1 workstreams.** Ordering note: `pg_net` (B) and the webhook
round-trip (C) both call *into* a public `https://` URL, so they can only be
**verified** once the app is deployed — M9 runs first, then B and C are wired at
and checked against the deployed URL.

| # | Workstream | Status |
| --- | --- | --- |
| A | **Plaid UI** — behind `NEXT_PUBLIC_PLAID_ENABLED` (off in prod). Built: `<ConnectBank>` + `<LinkHandoff>` (`react-plaid-link@5`), `<AccountMapping>` (new / existing / skip → `mapAccounts` + first sync), `<NeedsCategory>` inline categorize (`user_categorized = true` + `plaid_merchant_rules` upsert), `<ConnectedBanks>` (status, "Sync now", `<ReconnectButton>` update-mode, disconnect), shared `disconnectPlaidItem` (route + action, §24 comment). Wired into `/settings` (`BankConnections`) + `/transactions` (needs-category surface, connect prompt, `removed_at IS NULL` guard on the ledger/dashboard/export reads). 11 new component tests. typecheck · lint · test 249 · build green. | ✅ built — live verification pending M9 |
| M9 | **Deploy V1 Beta** — new Vercel project **`budgts-staging`** (team tocino), Production branch `v1-plaid-beta`, wired **entirely to staging**: `NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY` = staging (`iwypmifvmtmkwtnxkfma`), `NEXT_PUBLIC_SITE_URL` = the deploy origin, `DATABASE_URL` = staging tx pooler, Plaid Sandbox keys, `PLAID_TOKEN_ENC_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_PLAID_ENABLED=1`, `PLAID_TEST_SEED_ENABLED=1`. Staging Supabase auth: Site URL + `**` redirects set (magic link). `budgts.com` / `main` untouched. **Live at `https://budgts-staging.vercel.app`.** | ✅ deployed + acceptance chain walked (2026-09-10) |
| B | **Automation** — on budgts-staging: enable `pg_cron` + `pg_net`; schedule `net.http_post` to the **deployed** `POST /api/plaid/sync-due` with `Bearer CRON_SECRET` (`supabase/staging-plaid-cron.sql`, `{{DEPLOY_URL}}` = `https://budgts-staging.vercel.app`). Then **prove it fires**: flip an item's `needs_sync`, wait a tick, confirm `last_synced_at` moved. | ⏳ next |
| C | **E2E + webhook round-trip** — (1) commit a Playwright spec that drives the deployed app via `/api/plaid/test/seed` (connect → map → transactions → categorize → merchant rule → disconnect → history remains — all steps just verified by hand). (2) Round-trip: Plaid Sandbox `fire_webhook` → deployed `/api/plaid/webhook` → JWT verified → `needs_sync` → (B) sync → staging Postgres updated. | ⏳ after B |
| — | **Owner acceptance pass** — Claude walked the full chain on `budgts-staging.vercel.app` 2026-09-10 (see change log). Owner does their own hands-on pass — judging *the product*. | ⏳ owner |
| E | **Categorization intelligence + notification** (design §18, plan `.claude/plans/whimsical-tumbling-origami.md`) — deterministic evidence chain R1 user rule → R2 Budgts merchant knowledge (`merchant-knowledge.ts` ~115 chains + pure `merchant-name.ts` normalizer) → R3 trusted PFC `detailed` allowlist → R4 gated PFC primary (unchanged). LOW-confidence bypass for R2/R3 only. Correction backfill (blanks-only) + `rescanUncategorized` + "Re-scan" button + auto-add standard category. **Header bell** (`NeedsCategoryBell`, dashboard layout, behind `plaidUiEnabled()`) is the notification surface — count of the needs-category predicate, links to `/transactions#needs-category`; layout `RealtimeRefresh(["transactions"])` keeps it fresh. No notifications table / feed / push. **No migration.** +60 unit, +3 DB-integration, +1 Plaid-Sandbox. **Live-verified** on `budgts-staging.vercel.app` @ `182dfce` (2026-09-11, Playwright): bell shows the real count, links to `/transactions#needs-category` and lands there, resolving one row drops the count live (no reload) and the other ambiguous rows stay untouched, persists across a hard reload. No defects. **Closed.** | ✅ done — approved & closed |
| D | **Docs reflect reality** — this tracker + design-doc §13/§18/§31 + `docs/deploy.md` M9 runbook. | ✅ current |

**M9 acceptance chain** (run against the deployed URL):

```
domain → login → Budgts UI → Connect a bank → Plaid Sandbox → account mapping
      → transactions imported → transactions displayed → categorize transaction
      → merchant rule remembered → disconnect → historical transactions remain
```

**V1 complete gate** — declared done only when every row is green:

```
BACKEND     unit 309 ✅   DB-integration 18 ✅   Plaid-Sandbox 6 ✅
UI          Link · account mapping · categorization · reconnect · disconnect   ✅ built
CATEGORIZE  evidence chain: obvious merchants auto-filed at LOW confidence,     ✅ done
            corrections backfill, only genuine ambiguity asks the user (§18)
DEPLOY      M9 — budgts-staging.vercel.app, staging-wired                       ✅ live
ACCEPTANCE  full chain walked on the deploy (connect→map→import→display→        ✅ Claude
            categorize→merchant rule→disconnect→history remains)                  · owner pass ⏳
AUTOMATION  pg_cron · pg_net → sync-due, verified firing                        ⏳ (B)
E2E         committed Playwright journey + webhook round-trip                   ⏳ (C)
QUALITY     typecheck · lint · build · production-readiness                     ✅ (gates green)
```

V1.5 (recurring / transfer intelligence) does not start until the gate is green.
Milestone 10 = Production cutover (owner-gated, §27 / §32): Plaid Production
keys, `PLAID_ENV = production`, link a real account.

### V1.5 — Recurring & transfer intelligence

Detection over the synced ledger, **not** manual rule entry. Every detected
pattern is a suggestion the user confirms, edits or mutes.

- **Recurring / subscription / bill detection.** Find repeating merchant +
  amount + interval. Plaid's `/transactions/recurring/get` (`outflow_streams` /
  `inflow_streams`) is the seed; our own pass covers what Plaid misses and any
  manual / cash data. Classify outflows as subscriptions vs bills; show a
  subscriptions list with monthly total; surface upcoming and missed bills on
  the dashboard.
- **Recurring income.** `inflow_streams` gives predicted paycheck amount,
  cadence and next date — self-maintaining "expected monthly income". Enables a
  real *projected savings* tile (expected income − budgeted) and a "your
  paycheck didn't arrive" alert, the mirror of missed-bill detection.
- **User confirmation / muting.** Detected streams persist only when confirmed;
  muted streams don't re-surface. This **replaces the earlier plan of a
  user-entered `recurring_rules` table** — no one types a cadence unless they
  want to override.
- **Paired transfer detection.** Match the two legs of a transfer / card
  payment (opposite amounts, near dates, linked accounts) and link them so
  neither counts as spend. Runs **after** Plaid ingestion because it needs both
  legs as real transactions.

### V2 — Ingestion breadth + spending intelligence

Only once V1 + V1.5 are stable.

- **Email / receipt ingestion.** Per-user inbound address → provider webhook →
  `EmailAdapter` → Claude extraction → `pending_review` queue with confirm/fix
  UI, dedupe on `Message-ID`. PWA camera capture → Supabase Storage → Claude
  vision parse → "which card/account?" popup → transaction with the image
  attached. Covers cash, split bills and institutions Plaid can't reach. Open:
  inbound-email provider (Cloudflare Email Routing / Postmark / Mailgun),
  domain; Claude vision vs dedicated OCR (small bake-off first).
- **Spending intelligence.** Advanced insights (trends, category drift,
  merchant breakdowns); cash-flow forecasting from recurring in/out + budgeted
  discretionary; safe-to-spend (today's headroom after known bills + goal
  contributions); net worth (Plaid `/accounts/balance`, assets − liabilities,
  tracked over time).

### V2+ — AI financial assistant

Natural-language layer over the model; only meaningful once V1–V2 data is
trustworthy. AI assistant (ask about spending / budgets / goals in plain
language); purchase affordability ("can I afford this?" vs safe-to-spend +
forecast + goals); financial recommendations (overspend, unused subscriptions,
goal pace); advanced automation (proactive nudges, categorization learning).

### Delivery track (parallel) — Native apps (App Store + Play Store)

Not a capability tier — can run alongside any tier once V1 is stable.
Expo/React Native + Expo Router; reuse domain logic + Supabase; EAS Build
(required — owner is on Windows, cannot build iOS locally). Prereqs: Apple
Developer Program ($99/yr), Google Play Console ($25 once). Target: a few months.

---

## 5. How we work

- **Layer order** for every feature: schema+migration, Zod, domain logic (TDD),
  server action, UI, e2e. Detail + gates: `docs/conventions.md`.
- **TDD** for all logic in `src/lib/*` — failing test first, watch it fail,
  minimal code, refactor. UI + wiring verified by build + e2e.
- **Checkpointed.** Each checkpoint ends with all gates green, a commit, and a
  pause for owner review before the next.
- **Gates:** `npm run lint` · `typecheck` · `test` · `build` · `test:e2e`
  all green before a checkpoint commit.
- **Parallel-work protocol.** Claude owns logic / data / server actions /
  tests / this doc. Owner owns brand: `brand/`, tokens in `globals.css`,
  `Logo`, and visual styling. When both need the same file, the owner's pass
  takes it first; Claude rebases logic on top at the checkpoint boundary.
- **Git:** one commit per checkpoint, subject `Phase N<x>: ...`. Owner's brand
  commits are separate.
- **This file** is updated at the start and end of every checkpoint.

---

## 6. Open items / pending decisions

| Item | Owner | Notes |
| --- | --- | --- |
| ~~Reorder email vs Plaid ingestion~~ | resolved | **2026-09-09** — decided: **Plaid is the primary ingestion path (V1)**; recurring / subscription / bill intelligence is **V1.5**, running on synced transaction data; email / receipt ingestion drops to **V2**. Rationale: a self-filling ledger is the differentiator, and pattern detection needs a transaction history to run against. Roadmap restructured to V1 / V1.5 / V2 / V2+ (`docs/roadmap.md`). |
| ~~Confirm Google provider enabled in Supabase~~ | done | **2026-09-08** — owner enabled the Google provider and confirmed the `http://localhost:3000/**` redirect URL. |
| Brand pass reaches a stopping point | owner | Then Claude commits it and resumes 1c.2 / 1d. |
| **CSV export / backup** | Claude | Missing from the plan and worth adding. Supabase free projects pause after 7 idle days; a one-click export is cheap insurance. Slot into 1e. |
| ~~Expected monthly income~~ | resolved | Income comes **from the bank** (Plaid, **V1.5** recurring-income detection). No manual field, no recurring-rule entry. Plaid's recurring-transactions endpoint yields the predicted paycheck amount + cadence, which feeds a real *Projected savings* tile in V1.5. Until then, 1d tiles read "so far this month". |
| **CI workflow** | Claude | Gates are run by hand. Add GitHub Actions running lint/typecheck/test/build (+ e2e) in 1e. |
| **Security review before deploy** | Claude | Run `/security-review` in 1e — RLS policies, the service-key path, OAuth redirect allowlist. |
| ~~1c.2 vs fold into 1d~~ | done | Built as a standalone `/settings` screen after 1d. |
| ~~Git branch cleanup~~ | done | `main` fast-forwarded to `dbeea74`. Work continues on `phase-1/core-slice`; `main` is ff-merged at each checkpoint. |
| ~~Rotate the DB password / Google client secret~~ | done | Intentionally skipped for this personal project (owner's call, 2026-09-09). Not a pending task. |
| ~~Vercel project + deploy~~ | done | **2026-09-09** — `main` pushed, Vercel project live at `https://budgts.com` (custom domain via Cloudflare DNS), env vars + Supabase auth URLs set. See `docs/deploy.md` "Current deployment" + memory `deployment.md`. |
| Verify on real devices | owner | `deploy.md` step 5 — install the PWA on a phone, sign in via magic link + Google, add a transaction, confirm it syncs to a second device. Blocked on the `/sw.js` fix reaching prod for the install check. |
| Apple Developer + Google Play accounts | owner | Start enrollment before the native-apps delivery track; lead time is days. |
| Plaid account + Production application | owner | Only when V1 moves to Production; all V1 build happens in Sandbox, which needs nothing. |

---

## 7. Change log

- **2026-09-07** — Phases 0, 1a, 1b, 1c complete (`62e9389` to `88cbe5c`).
  Data access switched to `supabase-js` everywhere. Categories reseeded from the
  owner's spreadsheet. Native apps confirmed as Phase 6 (Expo), not a now-pivot.
  Owner began the brand pass plus a hardening pass (dedupe-race recovery via
  `UniqueViolationError`, `getSessionUser` request-cache, `normalizeManual` to
  avoid double-parsing, JPY dropped with a 2-decimal currency guard test,
  onboarding missing-profile handling, first component test). Workflow doc
  created. **Plaid** named as the Phase 5 bank-connect provider with a concrete
  design.
- **2026-09-07 (later)** — Owner settled two product rules: **no budget
  rollover** (leftover raises that month's Net savings instead of carrying
  forward), and **both savings concepts** are wanted — derived monthly Net
  savings on the dashboard (1d) plus named savings goals (Phase 2). Dashboard
  tile spec added to section 2.
- **2026-09-07 (later 2)** — Expected-income question resolved: it comes
  **from the bank** (Plaid recurring-income detection, Phase 5), not a manual
  field or a recurring rule. 1d ships five "so far this month" tiles; the true
  *Projected savings* tile lands in Phase 5.
- **2026-09-07 (later 3)** — Income question closed: it comes **from the bank**
  (Plaid). Brand system landed and verified (5 gates green, 69 unit tests):
  `Branding-guidelines.png` is the reference sheet, `globals.css` implements the
  semantic roles, one Volt Lime action per screen, Poppins display / Inter body.
- **2026-09-07 (later 4)** — 1d shipped: budgets screen + dashboard
  (5 tiles, budget-vs-actual bars, realtime refresh). 85 unit tests, 5 e2e
  (incl. a full set-budget -> overspend flow). Playwright now runs `workers: 1`
  and `reuseExistingServer: false` — the suite shares one Supabase project, so
  parallel workers tripped auth rate limits and a stale dev server served a
  wrong build.
- **2026-09-07 (later 5)** — 1c.2: `/settings` category + account management
  (rename, recolour, add, archive). Default expense set changed to the six
  Insurances / Personal Care / Housing / Entertainment / Transportation /
  Food / Groceries (migration 0002). Category names link to their filtered
  transactions; a filter banner clears it. 94 unit tests, 6 e2e. Playwright
  `retries: 1` + patient onboarding waits for the shared-project rate-limit
  flake.
- **2026-09-07 (later 6)** — 1e code complete: PWA service worker +
  `/offline`, `/api/export/transactions` CSV, CI workflow, `docs/deploy.md`,
  `docs/security.md`. Security review fixed an open-redirect in `/auth/callback`
  (`//host`), CSV formula injection, and a loose proxy prefix match. 99 unit
  tests, 7 e2e. Remaining for a live Phase-1: owner pushes to GitHub + imports
  to Vercel + sets the redirect URLs (docs/deploy.md).
- **2026-09-08** — Repo already on GitHub (`ramYum/budgts`, `main` at `2468194`).
  Owner completed deploy steps 1–2: Vercel project imported and the Supabase
  Google provider enabled + localhost redirect confirmed. Deploy is now blocked
  only on Claude pushing the in-progress brand pass to `main`; env vars +
  Supabase URL config (deploy.md §3–6) follow once the `*.vercel.app` domain
  exists. Owner is finishing the brand pass; then resumes at `deploy.md` step 3
  (env vars) onward. Next build checkpoint after deploy is **Phase 2** (recurring
  bills + savings goals); the Phase 3-vs-5 reorder call is still open.
- **2026-09-08/09 — Brand: final look** (`f31cd1a`). Design iterated over a
  session from "add dark green" through several full re-themes to a settled
  system: **Avocado `#EEF4E2` page wash** with white cards, **Deep Pine** as the
  primary-action colour (buttons, the one balance card, the active-tab pill,
  headings — ~10% of a screen), **Volt Lime** pulled back to the logo mark
  (always on a Deep Pine rounded-square badge, since bare lime vanishes on light)
  + the progress-bar fills only. `bottom-nav.tsx` added; `dashboard-view` balance
  card; new tokens (`--avocado`, `--primary`, `--tint`, …) in `globals.css` +
  `brand/tokens.css`; `brand/Branding-guidelines.{html,png}` + `README` re-done
  with a documented colour budget. One e2e locator pinned `{ exact: true }`
  (`budgets.spec.ts` "$60.00 left").
- **2026-09-09 — Shipped.** `main` pushed to `ramYum/budgts`; Vercel project
  `budgts` (team `tocino`, Hobby) live at **https://budgts.com** — custom domain
  bought + DNS-hosted at Cloudflare, DNS-only CNAMEs for apex + `www` → Vercel,
  `www` 308-redirects to apex. `NEXT_PUBLIC_*` env vars set (SITE_URL =
  `https://budgts.com`, Production only); Supabase auth URL config updated with
  all four redirect origins. Deploy steps 1–2 turned out never to have run
  despite a doc marking them done (obs 0017). Details in `docs/deploy.md`
  "Current deployment" + memory `deployment.md`.
- **2026-09-09 — Post-ship: service worker fix** (`c58b27f`, live). Live-site
  check found `GET /sw.js` returning `307 → /sign-in`: the `proxy.ts` matcher
  didn't exclude `sw.js`, so the auth gate caught it and the browser refused to
  register a redirected SW script — the PWA was not installable and had no
  offline fallback in production. Added `sw.js` to the matcher negative-lookahead
  + a `smoke.spec.ts` guard asserting `/sw.js` is `200` `*/javascript`. lint /
  typecheck / 99 unit / 8 e2e green. Pushed to `main`; Vercel auto-deployed
  (CI + deploy webhook took ~8 min to start — slow, not broken); verified
  `https://budgts.com/sw.js` → `200 application/javascript`, zero console
  errors logged-out. Owner can now do the real-device PWA install check
  (`deploy.md` step 5). — Owner confirmed device sync works, 2026-09-09.
- **2026-09-09 — Phase 2a: savings goals** (branch `phase-2/savings-goals`).
  Two RLS-scoped tables (`savings_goals`, `savings_contributions`) + realtime,
  migration `0003_broad_lord_hawal.sql`. A *contribution* is a standalone signed
  number — deliberately decoupled from `transactions`, account balances and the
  "Net savings" tile. `goalProgress` / `goalsSummary` pure domain (tests first).
  `src/server/savings.ts` actions; `addContribution` and `withdrawFromGoal`
  share one insert path, the withdraw variant negating the amount so the user
  never types a minus. New `/goals` route + `<GoalsView>` / `<GoalForm>` /
  `<ContributionForm>`; a 5th bottom-nav tab ("Goals"). No local Docker → per
  owner's call the migration was applied to prod, *then* verified: tables
  queryable, `goals.spec.ts` + full suite green (9 e2e), 124 unit/component,
  lint/typecheck/build green. 2b (recurring bills) and 2c (paired transfers)
  follow. Phase-3-vs-5 order still open.
- **2026-09-09 (later) — Roadmap restructured to V1 / V1.5 / V2 / V2+**
  (docs only, no code / schema / behaviour change). Owner's call:
  **Plaid becomes the primary transaction-ingestion path (V1)** — link account
  → `/transactions/sync` → `PlaidAdapter` → `landTransaction()` →
  auto-categorize → budget/dashboard, with manual entry kept only as a fallback
  for cash and unsupported banks. **Recurring / subscription / bill
  intelligence moves to V1.5** and operates on *synced* transaction data
  (detect repeating merchant + amount + interval, then confirm / edit / mute) —
  this **replaces the planned user-entered `recurring_rules` table**;
  paired-transfer detection stays in V1.5, after Plaid ingestion, because it
  needs both legs as real transactions. **Email / receipt ingestion moves to
  V2**, behind Plaid and the intelligence built on it. AI financial assistant =
  V2+. Native apps become a parallel delivery track, not a numbered phase.
  `docs/roadmap.md` rewritten to the tier ladder; §4 here restructured;
  §1 / §2 / §6 here, `CLAUDE.md`, `docs/conventions.md`, `docs/deploy.md` and
  the two design specs had their forward roadmap references synced. Reason: if
  Plaid covers 90 %+ of routine transactions with zero user input, that passive
  experience is the product's real differentiator.
- **2026-09-10 — V1 Plaid backend complete (M1–M8), Plaid UI built (workstream
  A).** M1–M8: `src/lib/plaid/*` + `src/server/plaid/*` + 6 `/api/plaid/*`
  routes + migration `0004` (staging only) — unit 238 / DB-integration 15 /
  Plaid-Sandbox 5 green. **UI** (this pass, behind `NEXT_PUBLIC_PLAID_ENABLED`,
  unset in prod): `react-plaid-link@5`; `<ConnectBank>` / `<LinkHandoff>` →
  link-token + exchange; `<AccountMapping>` (new / existing / skip →
  `mapAccounts` action → `accounts` rows + `plaid_accounts` link_state + first
  sync); `<NeedsCategory>` inline categorize (`user_categorized = true` +
  `plaid_merchant_rules` upsert); `<ConnectedBanks>` (status pill, "Sync now"
  = `syncConnection`, `<ReconnectButton>` update-mode, disconnect); shared
  `disconnectPlaidItem` behind both `DELETE /api/plaid/item` and the
  `disconnectBank` action — deletes `plaid_items` only, `transactions`
  untouched, history retained via the `plaid_account_id` SET-NULL FK (§24), with
  a separate opt-in `purge`. `/settings` gains `BankConnections`; `/transactions`
  gains the needs-category surface + a connect prompt + a flag-guarded
  `removed_at IS NULL` filter (also on the dashboard + CSV reads). 11 new
  component tests; typecheck · lint · test 249 · build green; DB-integration 15
  + Plaid-Sandbox 5 re-run green. Milestone 9 (Deployed V1 Beta on staging
  services) added to the tracker. Remaining V1: pg_cron/pg_net (B), E2E +
  webhook round-trip (C), the deploy (M9).
- **2026-09-10 (later) — Milestone 9: V1 Beta deployed + acceptance chain
  walked.** Work committed to branch `v1-plaid-beta` (`ramYum/budgts`, `main`
  untouched). New Vercel project **`budgts-staging`** (team tocino) imported from
  the repo, Production branch pinned to `v1-plaid-beta`, 11 env vars wired
  entirely to staging (staging Supabase `iwypmifvmtmkwtnxkfma` +
  `NEXT_PUBLIC_SITE_URL=https://budgts-staging.vercel.app` + Plaid Sandbox +
  `NEXT_PUBLIC_PLAID_ENABLED=1` + `PLAID_TEST_SEED_ENABLED=1`). Staging Supabase
  Auth URL config set (Site URL + `/**` redirects; magic link). Deployment
  promoted to Production → **live at `https://budgts-staging.vercel.app`**.
  Prod (`budgts.com` / `main` / prod Supabase) never touched — the two
  topologies are fully separate. **Full acceptance chain walked on the deploy:**
  login (test user `beta@budgts.test` created in staging Supabase) → Connect a
  bank → real Plaid Link (Sandbox, First Platypus `user_good`/`pass_good`,
  demonstrated through credential entry + account list) → account mapping (Plaid
  Checking → new Budgts account, 13 skipped) → **first sync landed 18 bank
  transactions** into staging Postgres → `/transactions` shows them, 9 in "Needs
  a category" + Starbucks/McDonald's/United auto-categorised by the PFC map →
  categorised one Uber → Transportation (count 9→8) → **`plaid_merchant_rules`
  row confirmed by SQL** (Uber merchant_entity_id → Transportation) → plain
  Disconnect (purge unchecked) → **SQL confirms `plaid_items`=0,
  `plaid_accounts`=0, `bank_txns`=18 all with `plaid_account_id` NULL,
  `user_categorized` kept, `removed_at` NULL** — the §24 financial-integrity
  rule verified end-to-end on a real deploy. Notes: the Plaid Link final
  "Continue" isn't scriptable via synthetic clicks (design §26), so the connect
  step used the purpose-built `/api/plaid/test/seed`; login used a
  password-grant + hand-set `@supabase/ssr` cookie since magic link needs an
  inbox. Left for V1: **B** (pg_cron/pg_net firing against the deploy), **C**
  (commit the Playwright journey + webhook round-trip), owner's own hands-on
  pass.
- **2026-09-10 (later 2) — Categorization intelligence** (workstream E, design
  §18, plan `.claude/plans/whimsical-tumbling-origami.md`). The deployed beta's
  first import dumped ~50 rows into "Needs a category" — obvious merchants
  (Uber, McDonald's) uncategorised because Plaid reports LOW confidence — and a
  correction didn't backfill sibling rows. Fix (deterministic, no AI, **no
  migration**): `buildResolveCategory` becomes an ordered evidence chain — R1
  per-user `plaid_merchant_rules` (unchanged) → R2 **Budgts merchant knowledge**
  (`src/lib/plaid/merchant-knowledge.ts`, ~115 hand-curated household-name
  chains → seed category; keyed by the new pure `src/lib/plaid/merchant-name.ts`
  normalizer, exact-equality only) → R3 **trusted PFC `detailed`** allowlist
  (`TRUSTED_DETAILED` in `category-map.ts`, conservative core) → R4 the existing
  gated `resolvePlaidCategory` primary path (untouched — `LOW`/`UNKNOWN` still
  null, still throws on unknown primary). The LOW-confidence gate is bypassed
  **only** for R2/R3, never globally. `categorizeBankTransaction` now also runs
  a **blanks-only** backfill `UPDATE` (same `merchant_entity_id`,
  `category_id IS NULL AND user_categorized=false AND removed_at IS NULL AND
  is_transfer=false`; sets `category_id` only — auto stays `user_categorized
  = false`) and can **add a standard category** the user no longer has
  (`src/lib/categories/standard.ts`, no setup screen). New
  `recategorizeUncategorizedBankTxns` + `rescanUncategorized` action + a
  "Re-scan" button clear a pre-existing backlog idempotently. Adapter now passes
  `merchant_name` + `name` into the resolver; `apply-sync` / `sync-store`
  untouched; idempotency, transfer short-circuit, pending→posted, and
  `user_categorized` semantics all preserved. **Gates:** typecheck · lint ·
  unit **304** (+55) · build · DB-integration **18** (+3) · Plaid-Sandbox **6**
  (+1) — all green. Deferred to V1.5: name-keyed rules (no-entity-id merchants),
  a `category_source` audit column, history/account-type signals, cron re-scan.
- **2026-09-10 (later 3) — Needs-category notification (header bell).** The
  smallest surfacing layer on top of workstream E: `NeedsCategoryBell`
  (`src/components/needs-category-bell.tsx`), rendered by the dashboard layout
  behind `plaidUiEnabled()`, shows a count of the same needs-category predicate
  and links to `/transactions#needs-category` (new `id="needs-category"` anchor
  on `<NeedsCategory>`). `RealtimeRefresh(["transactions"])` moved into the
  layout so the count updates after a sync lands on any dashboard route; the
  dashboard page's `RealtimeRefresh` narrowed to `["budgets"]` (same net
  effect, no double refresh). No notifications table, feed, Web Push, or OS
  notifications — the bell is the whole surface. Resolver / knowledge / backfill
  / standard-category behaviour untouched. **Gates:** typecheck · lint · unit
  **309** (+5, bell zero/nonzero/plural/9+/link) · build — all green;
  DB-integration + Plaid-Sandbox unaffected (no backend change).
- **2026-09-11 — Fixed a broken deploy, then closed workstream E.** `4efd010`
  failed on Vercel (`Module not found: '@/lib/budget/pacing'`). Root cause:
  `git add` on `src/app/(app)/(dashboard)/page.tsx` staged that file's entire
  working-tree diff, not just the intended `RealtimeRefresh` edit — sweeping in
  an unrelated, uncommitted, unfinished "pacing" feature sitting in the same
  file. `pacing.ts` itself was never staged, so the pushed commit referenced a
  module that didn't exist; the local build had passed only because it read
  `pacing.ts` straight off disk (untracked ≠ absent from the filesystem).
  Fixed in `182dfce` — `page.tsx` restored to the last known-good content plus
  only the intended change; the pacing feature stays out of this branch,
  untouched. Verified with a true clean-clone simulation
  (`git stash push -u --keep-index` to strip every untracked file before
  running the gates) — typecheck · lint · unit **291** (37 files, the real
  count without the stray pacing tests) · build, all green. Then **live
  Playwright verification on `budgts-staging.vercel.app` @ `182dfce`**: header
  bell showed the true count (3), tapping it landed on
  `/transactions#needs-category`, resolving one row dropped the count to 2
  live (no reload) via the layout's `RealtimeRefresh`, and the two remaining
  ambiguous rows stayed untouched after a hard reload. No defects.
  **Workstream E (categorization intelligence + notification) is approved and
  closed.** Next: workstream B (pg_cron/pg_net automation, verify firing).
