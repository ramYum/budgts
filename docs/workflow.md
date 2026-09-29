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
| V1 | Plaid ingestion — built + staging-accepted | See §4 milestone tracker M1–M9 + workstreams A–E. | ✅ done (staging) | see §4 |
| V1+ | Budget-correctness chain + Money Left / Savings Rate / account-exclusion | Sign-convention → event-role → budget-effect → `qualify.ts` integration → transfer-ownership; Money Left + Savings Rate dashboard tiles; account calculation-exclusion safety valve. See §7 change log. | ✅ done | `4590520` |
| — | **V1 → production promotion** | `main` fast-forwarded `5b668b2→4590520`; migration `0012` applied directly to the production Supabase project (`wsmhstqpvbbcqpqhiqyp`); deployed via the existing `budgts` Vercel project. Shipped with Plaid UI still flag-gated off. | ✅ live 2026-09-13 | `4590520` |
| — | **UI redesign — Budgt brand + IA overhaul** | Design system, responsive app shell (sidebar/bottom-nav), Home hierarchy, Budgets category cards + Category Detail, Activity search/filter, transfer toggle, new More/Insights/Accounts/Connected-Banks/Help/About + reorganized Settings. Presentation-layer only — no financial-semantics changes. **v2 brand pass**: new palette/typeface from `Budgts Reference V2.png` + real cropped assets from `Assets V2.svg`, replacing the original brand tokens — see `docs/BRAND_GUIDELINES.md`. See §"UI redesign" below and `docs/roadmap.md`. | ✅ merged to `main`, live | `d469d4b`, `05d4a1d`, `f9e2642` |
| — | **Logo-asset correction** | The v2 pass's `Assets V2.svg` auto-crops had visible edge/bleed defects. Replaced `public/brand/*` and every generated app icon with the brand owner's own finished exports (`Downloads/Logo Assets/`); sign-in/onboarding hero now uses the real sunburst lockup instead of a CSS-simulated glow. Dropped the unused solid-color mark/blob/sparkle variants (unreferenced in code). `docs/BRAND_GUIDELINES.md` updated. | ✅ done | `8b6af93` |
| — | **Advancial replay containment** | Advancial Federal Credit Union's confirmed feed defect (docs/specs/2026-09-12-advancial-...) recurred on a fresh connection — 7,280/7,450 rows were replayed copies. One-time closed-set remediation executed (owner-approved). Built automatic containment scoped strictly to `institution_id = ins_116484` (`replay-containment.ts`), wired into `sync-engine.ts` — never a general rule, structurally unreachable for any other institution/user. 12 new tests. | ✅ done | `c20678c` |
| — | **1000-row query cap — income/spend silently wrong** | Root cause of a real report ("income isn't showing"): every unbounded `transactions` `.select()` across Home/Budgets/Insights/Activity/CSV-export silently caps at PostgREST's default 1000 rows — a heavy Plaid feed (post-Advancial-replay, 1,209 September rows) pushed a manually-entered $1,850 income transaction out of the fetched page entirely, so it was never even considered, not merely miscategorized. Added `fetchAllRows` (paginated, ordered by `id` for determinism, test-first) and applied it to every affected query. Verified live against the real account: Income tile corrected $0 → $1,850.00. | ✅ done | `8846123` |
| — | **Milestone 10 — Plaid Production cutover** | `NEXT_PUBLIC_PLAID_ENABLED` was flipped on directly in the Vercel dashboard at some point after the 2026-09-13 promotion — **not captured in a commit or doc update at the time**. Discovered 2026-09-14 by querying the production `plaid_items` table directly: 3 real connections (**Capital One**, **SoFi**, **Advancial Federal Credit Union**), all connected 2026-09-11, with live sync cursors. Every "flag-gated off" statement elsewhere in this doc and in `docs/roadmap.md` / `docs/deploy.md` describes that earlier, now-superseded state — left as historical record rather than rewritten. See memory `plaid-live-in-production.md` for the verification trail. | ✅ done (retroactively documented) | — |
| — | **Breakdown-chart tooltip stacking fix** | The spending-breakdown donut's center "This month" total overlay rendered after the chart in DOM order with no explicit `z-index`, so it sat above the Recharts hover/touch tooltip instead of the tooltip appearing in front. Gave the `Tooltip` an explicit `wrapperStyle={{ zIndex: 10 }}` and the overlay `z-0`. Verified live (throwaway test user, hover triggered against the real component). | ✅ done | `5465ac3` |
| — | **Dismiss button on the budgets-exceed-income banner** | The Home warning banner (shown when this month's category budgets add up to more than income) gained a per-month dismiss control, persisted via `sessionStorage` (tab/app-session scoped — reappears on a fresh session, stays hidden across tab switches). | ✅ done | `f795d3e` |
| — | **UI redesign — COMPLETE (closed 2026-09-14)** | Final passes: robin mascot + "Budgts" name/wordmark rebrand from `Logo Assets V2` (replaces the black cat and "Budgt"; resolves the in-app-name vs `budgts.com` mismatch; palette/typography unchanged), then the Money Left hero card redesign (light-coral fill, reworked hierarchy, mirrored mascot on the insight card). Owner marked the redesign completed. Leftover deferred items (onboarding wizard, Insights Net Worth tab, per-category top merchants, Notifications screen) are now standalone backlog, not redesign scope — see `docs/roadmap.md`. | ✅ complete, live | `22067c0`, `d0e48f2`, `b08cfcf` |
| — | **Production smoke test + hydration fix** | Authenticated prod smoke test (throwaway user 22/22; all 3 Plaid-connected accounts read-only) and PWA installability checks, details in §6. It surfaced React #418 hydration mismatches for any non-UTC viewer on `/connected-banks` ("Last synced" relative time / zone-less date) and `/transactions` (Needs-a-category dates, zone-less). Fixed test-first: dates pinned to the stored UTC day, and relative "Last synced" shown only after hydration via `useSyncExternalStore`. New `src/test-utils/hydration.tsx` server-renders under one `TZ` and hydrates under another. Also fixed the stale e2e smoke manifest assertion (`4d3cc4d`). Rule added to `docs/conventions.md` → Common mistakes. | ✅ done | `4d3cc4d`, `2b4f3c7` |
| — | **First-run tour (v1 — currently live)** | The deferred 3-screen onboarding wizard, rebuilt as a convenience-first pitch (auto-capture + auto-categorization) picked up once Plaid went live. New `profiles.tour_seen_at` (migration `0014`), pure `buildTourSteps` (TDD), shared `TourCard`/`TourWizard`, `/onboarding` restructured (Welcome → Every purchase, tracked → Currency) feeding into new `/tour` (Connect your bank → Sorted for you → Know what's left → All set), dashboard gate, Help replay link (now also links to the new How Budgts Works guide — see below). Domain + component tests green, e2e specs updated to a shared `onboardAndSkipTour` helper + new `tour.spec.ts`. `lint`/`typecheck`/`test`/`build` all green on branch `v1.5/first-run-tour`. Spec: `docs/specs/2026-09-15-first-run-tour-design.md`. Migration `0014` has since been applied to production and staging (verified 2026-09-25 with a read-only schema probe; `0015`/`0016` too). E2E not run in this session: `.env.local` points at the live production Supabase project with no separate dev/staging DB, so an e2e run here would create/delete real rows against prod. A **v2 redesign (live coachmarks, spotlight + tooltip on the real button on the real page)** has since been fully specced and planned — `docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md`, `docs/superpowers/plans/2026-09-15-first-run-tour-coachmarks.md` — **but that plan's tasks have not been executed**; this v1 tour is still what actually runs today. | ✅ live | `e96a428` |
| — | **"How Budgts Works" guide** | Permanent static Help page (`/help/how-it-works`) teaching the end-to-end workflow: connect → transactions arrive automatically → auto-categorize → review exceptions → set a budget → Money Left → track progress. Core message: "You spend. Budgts keeps track." Linked from a new entry card atop `/help` and from the v1 tour's final card. No DB reads, no new dependency; 3 new `NavIcon` glyphs (`categorize`/`review`/`money-left`) added to the existing shared icon set. Component tests for the guide page, the updated Help page, and the tour's new link. `lint`/`typecheck`/`test`/`build` all green. Spec: `docs/specs/2026-09-15-how-budgts-works-guide-design.md`. | ✅ done | — |

Legend: ✅ done · 🔄 in progress · ⏳ planned

**Shipped through V1 + the budget-correctness/Money-Left/account-exclusion
work** (`4590520`, live on production since 2026-09-13), **and Plaid bank-
connect itself is live in production** — the flag was turned on in Vercel at
some point after that promotion (undocumented at the time; confirmed
2026-09-14 against real `plaid_items` rows, see the change-log entry above).
Money Left and Savings Rate are live now
regardless, since they run over all transactions. **The UI redesign is
complete** (closed 2026-09-14, `b08cfcf`). Next: **V1.5** (recurring /
subscription / bill detection over synced data + paired-transfer detection),
**V2** (email / receipt ingestion + spending intelligence), **V2+** (AI
assistant). Full ladder: `docs/roadmap.md`; working detail: §4 below.

---

## 2. Product — locked decisions

| Area | Decision |
| --- | --- |
| Shape now | Installable **PWA** (Next.js). One codebase, phone + desktop. |
| Shape next | Native iOS/Android (Expo) on the App Store + Google Play, sold by the owner's LLC: **active since 2026-09-26** (branch `phase-m/mobile-launch`; spec `docs/specs/2026-09-17-mobile-app-launch-design.md`). $9.99/month, $69/year, 7-day trial; one subscription unlocks the apps and budgts.com; influencer program after launch. |
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
`@supabase/ssr` · Zod · Phosphor icons · Vitest + Testing Library · Playwright ·
Drizzle (migrations + the server-only Plaid pipeline) · Plaid. Performance
rules: `docs/conventions.md`.

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
(Supabase project `uvowywszaiojboaxdmoz`; the earlier staging project `iwypmifvmtmkwtnxkfma` was deleted) + Plaid **Sandbox** — the production
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
| B | **Automation** — on budgts-staging: `pg_cron` 1.6.4 + `pg_net` 0.20.4 enabled, `plaid-sync-due` job scheduled every 30s (`supabase/staging-plaid-cron.sql` run with `{{DEPLOY_URL}}` = `https://budgts-staging.vercel.app`, `{{CRON_SECRET}}` = the Vercel env value). **Found + fixed a real bug while proving it fires:** the root proxy (`src/proxy.ts`) redirected every unauthenticated request to `/sign-in`, including Plaid's webhook and this poller — neither carries a session cookie — so `pg_net` was logging a 200 of sign-in-page HTML instead of the poller's JSON, and the item never advanced. Fixed by exempting `/api/plaid/webhook` + `/api/plaid/sync-due` (both already self-authenticate) from the session gate (`b6e3e88`, +`src/proxy.test.ts`). **Proven firing** post-deploy: `net._http_response` shows `{"ran":1,"results":[{"itemId":"...","ok":true,"inserts":2,...}]}`, `cron.job_run_details` shows consecutive `succeeded` runs ~30s apart, and the flipped item's `needs_sync` cleared with `last_synced_at` advancing to match. | ✅ done — verified firing (2026-09-11) |
| C | **E2E + webhook round-trip.** **Webhook round-trip — fully verified, real data**, twice (2026-09-11 and again on re-check): `sandboxItemFireWebhook` → `plaid_webhook_events` gains a `verified:true, TRANSACTIONS/SYNC_UPDATES_AVAILABLE, handled:true` row within 5s → `plaid_items.needs_sync` set → the (B) poller clears it within 30s, `last_synced_at` advanced. `pg_cron`'s `plaid-sync-due` reconfirmed active, ticking every 30s, all runs `succeeded`. `tests/e2e/plaid.spec.ts` **committed and PASSING** for real against `budgts-staging.vercel.app`, once the owner placed the staging Supabase Admin key in `.env.staging` (untracked, gitignored, never printed): connect via `/api/plaid/test/seed`+`/api/plaid/exchange` → map → import with Sandbox-lag retries → categorize → merchant-rule regression check → disconnect → CSV unchanged. `1 passed` (2 fixes needed first — see below). **The full acceptance-criteria list was also walked twice, live, directly against staging** (see the 2026-09-11 changelog entries) — connect, map, import, auto-categorization, Needs-a-category, the notification bell + deep link + live count decrement, standard-category addition (archive→pick→un-archive), a freshly-created merchant rule + blanks-only backfill (verified at the DB level: corrected row `user_categorized=true`, backfilled sibling `user_categorized=false`, both share one new `plaid_merchant_rules` row), disconnect without purge, and history retention (20/20 rows kept, unlinked, none removed) — all PASS. Two test-infrastructure fixes made along the way (both test-only, no production code): (1) `playwright.config.ts` always spun up a needless local `npm run build && npm run start` even when `PLAYWRIGHT_BASE_URL` pointed at an already-live deployment — now skips `webServer` when that var is set; (2) `plaid.spec.ts`'s categorize assertion matched by merchant *text*, which broke on Plaid Sandbox's canned dataset legitimately containing several identically-described transactions (e.g. repeat "Uber 063015 SF**POOL**" rides) that share one `merchant_entity_id` and correctly all backfill at once — fixed to assert the row count shrinks (and never regrows after Re-scan) instead of an exact/text-based match. **Sandbox-only limitation found earlier (not a Budgts defect, unrelated to the above):** a brand-new item's first `/transactions/sync` call can race Plaid Sandbox's own async transaction generation; once empty, Sandbox does not deliver the dataset through the *same* cursor lineage afterward. Production is unaffected — real linked banks already have history at connect time. No production code changed. | ✅ done |
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
BACKEND     unit 296 ✅   DB-integration 18 ✅   Plaid-Sandbox 6 ✅
UI          Link · account mapping · categorization · reconnect · disconnect   ✅ built
CATEGORIZE  evidence chain: obvious merchants auto-filed at LOW confidence,     ✅ done
            corrections backfill, only genuine ambiguity asks the user (§18)
DEPLOY      M9 — budgts-staging.vercel.app, staging-wired                       ✅ live
ACCEPTANCE  full chain walked on the deploy (connect→map→import→display→        ✅ Claude
            categorize→merchant rule→disconnect→history remains)                  · owner pass ⏳
AUTOMATION  pg_cron · pg_net → sync-due, verified firing                        ✅ (B)
E2E         webhook round-trip verified ✅ (twice); full acceptance list       ✅ (C)
            walked live on staging ✅ (twice); tests/e2e/plaid.spec.ts
            PASSING against the real staging deployment
QUALITY     typecheck · lint · build · production-readiness                     ✅ (gates green)
```

V1.5 (recurring / transfer intelligence) does not start until the gate is green.
Milestone 10 = Production cutover (owner-gated, §27 / §32): Plaid Production
keys, `PLAID_ENV = production`, link a real account. **Gate is green** —
Milestone 10 happened (flag flipped on in Vercel, 3 real accounts connected
2026-09-11, discovered/documented retroactively 2026-09-14; see §1's change-log
entry and memory `plaid-live-in-production.md`). V1.5 is unblocked.

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

### Delivery track — Mobile App + App-Store Launch (active, 2026-09-26)

The current priority. Phases 0–5, owner steps and decisions: `docs/roadmap.md`
→ "Delivery track — Mobile App + App-Store Launch"; design authority:
`docs/specs/2026-09-17-mobile-app-launch-design.md`. Quality bar (owner):
every native screen visually identical to the approved web app, zero known
bugs, premium feel, each part scored to 9.5+/10 — enforced by the parity
check and scoring gate in `AGENTS.md` → Mobile. All Expo / React Native
implementation goes to `budgts-architect`.

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
| ~~Rotate the DB password / Google client secret~~ | owner | **Declined 2026-09-26.** Both were shown in chat during setup; the owner decided not to rotate them ("it's fine, disregard this"). Don't re-raise it. |
| ~~Vercel project + deploy~~ | done | **2026-09-09** — `main` pushed, Vercel project live at `https://budgts.com` (custom domain via Cloudflare DNS), env vars + Supabase auth URLs set. See `docs/deploy.md` "Current deployment" + memory `deployment.md`. |
| Verify on real devices | owner | `deploy.md` step 5 — install the PWA on a phone, sign in via magic link + Google, add a transaction, confirm it syncs to a second device. **2026-09-15: everything automatable is verified on `https://budgts.com`** (Chromium, Pixel 7 emulation): installable with zero installability errors (checked in a normal profile — Playwright's default incognito context always reports `in-incognito`), SW registers + controls the page, manifest "Budgts" / standalone / scope `/`, both 512×512 PNG icons (any + maskable), `apple-touch-icon` + iOS web-app meta + theme-color present, offline navigation falls back to `/offline`, no console errors. **Still owner-only:** the physical install on an Android phone (Chrome → Install app) and an iPhone (Safari → Add to Home Screen), sign-in inside the installed app, and cross-device Realtime sync. |
| ~~Prod rollout: Plaid sync lease + 10-min sweep~~ | done | **Live 2026-09-25** (`533537e` on budgts.com, `0017` applied on production + staging, prod `plaid-sync-due` every 10 min). The follow-up claim-time `needs_sync` + 360s lease change needs no migration — it ships with a normal deploy. Original order: (1) apply migration `0017` to production (additive nullable columns; the running build ignores them); (2) deploy the build — webhooks start syncing immediately, the 30s job keeps running harmlessly (every run now takes the lease); (3) `cron.alter_job(... schedule := '*/10 * * * *')` per `supabase/staging-plaid-cron.sql`. Confirm the Vercel project uses Fluid compute (`maxDuration = 300`). Rollback: re-schedule `'30 seconds'`, redeploy the previous build, then drop the two columns. |
| Apple Developer + Google Play accounts | owner | **In progress (2026-09-26).** LLC + D-U-N-S first (in progress), then Apple Developer as an organization ($99/yr, then the Small Business Program for the 15% rate) and Google Play Console as an organization ($25; organization accounts are exempt from the 12-tester / 14-day closed test). |
| Plaid plan for paying users | owner | Production access exists (2026-09-11), but the free Trial caps at 10 Items (5 in use). Move to Pay-as-you-go/Growth and read the per-Item Transactions price; it confirms or adjusts $9.99/$69 (above ~$1/Item: cap the base plan at 3 banks or raise annual to $79). |
| Vercel Pro + Supabase Pro | owner | Required before selling: Vercel Hobby is non-commercial; Supabase Free pauses after 7 idle days and has no backups. |
| Privacy policy + terms | owner | Name the LLC; cover Plaid, what account deletion removes and what is retained. Store submission blocker; also unblocks Google OAuth's production publish. |
| ~~Plaid account + Production application~~ | done | Milestone 10 happened — Plaid Production access obtained, `NEXT_PUBLIC_PLAID_ENABLED` on in Vercel prod, 3 real bank connections live (Capital One, SoFi, Advancial) since 2026-09-11. Not captured in a commit/doc at the time; retroactively documented 2026-09-14. |
| ~~Owner's authenticated smoke-test pass on budgts.com~~ | done | **2026-09-15**, run by Claude against production with owner authorization (scripted Playwright, magic-link `token_hash` sign-in). **Throwaway user: 22/22** — callback → onboarding → Home, all 15 app routes load clean, add a transaction, Home reflects it, CSV export includes it, user deleted. **All 3 Plaid-connected accounts** (owner-confirmed as theirs: one with Capital One + SoFi + Advancial, one SoFi-only, one Advancial-only), **read-only** (navigation only; any non-GET / server-action request aborted — none attempted): Money Left + savings rate on Home, Activity lists transactions, Budgets category cards, Insights, every institution on Connected Banks, and the "Exclude from totals" control shown for the two flagged Advancial accounts. Result in the real browser zone (America/New_York): passed apart from **React #418 hydration errors** on `/connected-banks` and `/transactions` (see next row); the same pass with the browser forced to UTC: **74/74**. Categorization correctness was not separately checked (only that transactions render). Also fixed the stale `tests/e2e/smoke.spec.ts` manifest assertion (`Budgt` → `Budgts`; 5/5 against prod). |
| ~~Hydration mismatch (React #418) for any non-UTC user~~ | done | **Fixed 2026-09-15 in `2b4f3c7`**, see the status-board row. Original report: client components render date text from the viewer's time zone / the current clock, which differs from the server's UTC render: `src/components/plaid/connected-banks.tsx` `whenLabel()` (`Date.now()`-relative "N min ago", then `toLocaleDateString` with no `timeZone`) and `src/components/plaid/needs-category.tsx:22` (`toLocaleDateString` with no `timeZone`, rendered on `/transactions`). Confirmed by probe: errors appear in America/New_York, disappear with the browser in UTC. Fix candidates: pin `timeZone: "UTC"` like `transaction-list.tsx` does, or render relative time client-only after mount. Needs a failing test first. |

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
- **2026-09-11 (later) — Workstream B: automation wired and proven firing.**
  Enabled `pg_cron` 1.6.4 + `pg_net` 0.20.4 on budgts-staging and scheduled
  `plaid-sync-due` (every 30s) via `supabase/staging-plaid-cron.sql` against
  `https://budgts-staging.vercel.app/api/plaid/sync-due`. First firing attempt
  surfaced a real bug: the root proxy (`src/proxy.ts`) redirects every
  unauthenticated request to `/sign-in`, and neither Plaid's webhook nor this
  cron poller carry a session cookie — so `pg_net` was logging a 200 of the
  sign-in page's HTML instead of the poller's JSON, and `needs_sync` never
  cleared. Both routes already do their own strict auth (JWT signature /
  timing-safe bearer compare), so the session gate was only breaking them, not
  protecting anything. Fix (`b6e3e88`): added `/api/plaid/webhook` and
  `/api/plaid/sync-due` to `PUBLIC_PREFIXES`; user-facing Plaid routes
  (`link-token`, `exchange`, `test/seed`) untouched — they still self-check
  `getSessionUser()`. New `src/proxy.test.ts` (5 cases: both exempted paths,
  user-facing routes and ordinary pages still gated, pre-existing public pages
  stay public, a same-prefix decoy path isn't accidentally matched). Verified
  against a clean-clone simulation (`git stash push -u --keep-index`):
  typecheck · lint · unit **296** (38 files, +5) · build, all green. Post-deploy
  proof: `net._http_response` shows `{"ran":1,"results":[{"ok":true,
  "inserts":2,...}]}`; `cron.job_run_details` shows consecutive `succeeded`
  runs ~30s apart; the flipped test item's `needs_sync` cleared and
  `last_synced_at` advanced to match. **Workstream B is done.** Next:
  workstream C (Playwright E2E journey + webhook round-trip — this fix also
  unblocks the webhook half, which shared the same proxy bug).
- **2026-09-11 (later 2) — Workstream C: webhook round-trip verified for real;
  E2E journey walked by hand + spec committed.** **Webhook round-trip:**
  decrypted a real staging item's Sandbox `access_token`
  (`src/lib/plaid/crypto.ts`, staging `PLAID_TOKEN_ENC_KEY`), called
  `sandboxItemFireWebhook`, and confirmed the full chain lands: Plaid `200
  webhook_fired:true` → `plaid_webhook_events` gains a row within 5s
  (`verified:true`, `TRANSACTIONS`/`SYNC_UPDATES_AVAILABLE`, `handled:true`) →
  `plaid_items.needs_sync` set → the (B) poller clears it within 30s with
  `last_synced_at` advanced. **E2E journey:** new `tests/e2e/plaid.spec.ts` —
  connect (via `/api/plaid/test/seed` + `/api/plaid/exchange`, bypassing
  Plaid Link's un-scriptable iframe per design §26) → map (real
  `<AccountMapping>` UI) → import (retries `Sync now` for Sandbox lag,
  mirroring `createSandboxItemWithTxns`'s existing readiness-poll pattern) →
  categorize an ambiguous row → merchant-rule regression check (Re-scan
  doesn't undo the correction) → disconnect → CSV row count unchanged.
  Guarded to skip unless run against a staging deploy *with* staging Supabase
  Admin credentials (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` for
  `iwypmifvmtmkwtnxkfma`) — not available this session, so `npx playwright
  test` has not actually been run against it; **owner action: supply those
  two values (or run it themselves) to execute it.** In the meantime the same
  journey was walked live, by hand, on `budgts-staging.vercel.app` using the
  already-authenticated `beta@budgts.test` session: connect ✅ and map ✅
  (14-account picker; "Plaid Checking" → the existing "Plaid Checking ••0000"
  Budgts account, 13 others "Don't import this one") on two separate fresh
  Sandbox items; disconnect ✅ with **history retained** (18 bank rows kept,
  `plaid_account_id` nulled, `plaid_items` row gone) confirmed twice.
  **Discovered and diagnosed a Plaid Sandbox limitation, not a Budgts defect:**
  a brand-new item's very first `/transactions/sync` call can race Sandbox's
  own asynchronous canned-data generation; if that first call returns empty,
  Sandbox does not retroactively deliver the dataset through the *same* cursor
  lineage — confirmed by calling `/api/plaid/sync-due?full=1` against the
  affected item repeatedly (`inserts:0` every time) while a fresh, cursorless
  `/transactions/sync` call against the same access token sees the full 19-row
  checking history immediately. Production is immune — a real linked bank
  already has transaction history the moment it's connected, so there is no
  generation lag to race. No app code changed for this (Sandbox-only, already
  mirrored by the test fixtures' own readiness-polling). Temporarily
  unscheduled/restored `pg_cron`'s `plaid-sync-due` job while isolating the
  race (verified re-armed and firing before moving on). **Gates:** typecheck ·
  lint · build all green (new spec file only; no production code touched).
  Remaining for V1: owner runs/enables the E2E spec, then the owner's own
  hands-on acceptance pass.
- **2026-09-11 (later 3) — Full staging acceptance pass, walked live twice.**
  Owner authorized use of the staging Supabase Admin key for automated E2E;
  searched exhaustively for it (every local `.env*`, Vercel CLI, Supabase CLI,
  GitHub secrets, password-manager/credential-store tools, MCP servers) — not
  retrievable anywhere accessible to this session. A Supabase-dashboard tab
  was found already open and authenticated for the staging project, but
  reading a value off it through any available tool would print that value
  into this session's own tool-output stream, which the owner's security
  requirements explicitly forbid — so `npx playwright test tests/e2e/
  plaid.spec.ts` remains unexecuted; the owner needs to place the key in
  `.env.staging` directly. In its place, walked every acceptance criterion
  live against `budgts-staging.vercel.app` — twice, hours apart, both clean:
  dashboard + transactions load; obvious merchants (McDonald's, Starbucks,
  United Airlines) auto-categorized; genuinely ambiguous rows sit in "Needs a
  category"; the header bell shows the exact DB-verified count, deep-links to
  `/transactions#needs-category`, and its count drops live (no reload) when a
  row is resolved; the category persists server-side; archiving "Insurances"
  then picking it from "Add a category" un-archived the same row (no
  duplicate) and applied it; a fresh synthetic merchant-pair proved the rule +
  backfill path end-to-end — categorizing one row created a
  `plaid_merchant_rules` row and filled its blank sibling with
  `user_categorized=false` while the corrected row stayed `true`; disconnect
  without purge removed the `plaid_items` row while all 20 bank transactions
  remained (`plaid_account_id` nulled, none `removed_at`); `pg_cron`'s
  `plaid-sync-due` reconfirmed active and succeeding every 30s on both passes.
  No defects found; no code changed. **V1 is functionally accepted on
  staging** — the one open item is procedural (running the committed spec),
  not a product or infrastructure gap.
- **2026-09-11 (later 4) — `tests/e2e/plaid.spec.ts` run for real; passing.**
  Owner placed the staging project's Supabase Admin key in `.env.staging`
  (untracked, `.gitignore`'d — confirmed before and after; never printed,
  logged, or committed). `PLAYWRIGHT_BASE_URL=https://budgts-staging.vercel.app
  npx playwright test tests/e2e/plaid.spec.ts` first failed on a test bug, not
  a Budgts defect: the categorize assertion matched by merchant *text*, and
  Plaid Sandbox's canned dataset legitimately contains several transactions
  with the identical description (repeat "Uber 063015 SF**POOL**" rides)
  sharing one `merchant_entity_id` — picking a category for one correctly
  backfills all of them at once (design §18), so "no row with this text
  remains" is the wrong assertion shape. Fixed to assert the row count
  shrinks on categorize and never regrows after Re-scan. Also fixed
  `playwright.config.ts`: it always ran a needless local `npm run build &&
  npm run start` even when `PLAYWRIGHT_BASE_URL` already pointed at a live
  deployment — `webServer` is now skipped whenever that variable is set. Both
  fixes are test-infrastructure only; the spec's staging guard
  (`hasAdminCredentials()` + `PLAYWRIGHT_BASE_URL` must name a staging
  deploy) was never touched. Re-ran: **1 passed, 0 failed, 0 skipped.**
  Verified against a clean-clone simulation: typecheck · lint · unit (296) ·
  build all green; DB-integration (18) and Plaid-Sandbox (6) rerun clean.
  **Workstream C is done. V1 is accepted on staging** — every automatable
  gate is green; the only remaining item is the owner's own hands-on
  acceptance pass (a subjective product judgment, by design not something
  Claude completes on the owner's behalf).
- **2026-09-12/13 — Budget-correctness chain: sign-convention → event-role →
  budget-effect → qualify-integration → transfer-ownership** (`8b55453..
  b0df2a6` and follow-on fix commits through `2a1828b`). Per-account sign
  detection so a mis-signed Plaid feed doesn't silently flip debits/credits;
  `event_role` classification (PURCHASE/REFUND/INCOME/TRANSFER/etc., CHECK-
  constrained) replacing the old binary `is_transfer` flag as the primary
  qualification signal; `budgetEffectOf` resolving a role to
  EXPENSE/EXPENSE_REVERSAL/INCOME/NONE/UNKNOWN; `qualify.ts`'s `countsForMonth`
  integrated against real `event_role` data with a legacy `!isTransfer`
  fallback for `event_role = null` (manual/email/receipt rows); an explicit
  user transfer decision (`transfer_user_set`) outranking the machine-resolved
  role when they disagree. Design docs: `docs/specs/2026-09-12-*-design.md`
  (sign-convention, event-role, budget-effect, transfer-ownership).
- **2026-09-13 — Money Left + Savings Rate dashboard tiles** (`dfadebe..
  2a1828b`). `rollup.ts` now classifies income/spend by `budgetEffectOf`
  rather than raw `category.kind`; `savingsRate` = Money Left / Income, never
  clamped; both proven end-to-end against real staging Postgres
  (`8f6b821`), then wired into `DashboardTiles`. No new migration.
- **2026-09-13 — Account calculation-exclusion** (`4590520`). Migration
  `0012`: `plaid_accounts.excluded_from_calculations boolean NOT NULL DEFAULT
  false`. An owner-only, explicit, per-account control — exclusion is only
  ever offered while the account is already `needs_review = true` (the
  existing anomaly-detection flag from the duplicate-feed investigation,
  design `2026-09-12`), enforced server-side in `setAccountCalculationExclusion`
  (never trusts client state), never triggered automatically by sync or the
  anomaly detector. `countsForMonth` gates on it unconditionally, same tier as
  `status`/`duplicateOfId`. Raw transactions are never touched or hidden —
  only the calculation gate. Motivated by a real incident (Advancial Federal
  Credit Union's feed replaying ~50 duplicate copies of some transactions,
  `docs/specs/2026-09-12-advancial-remediation-and-future-ingestion-defense.md`)
  but the mechanism itself is fully generic, not institution-specific,
  and no automatic exclusion of any account was performed. Verified: 474 unit
  + 51 DB-integration tests passing (one long-standing, unrelated async-timing
  flake in `needs-category.test.tsx`, documented, not fixed — reproduces only
  intermittently under full-suite load, confirmed identical on both sides of
  this diff), typecheck/lint/build green. Committed `4590520`.
- **2026-09-13 — V1 code + schema promoted to production.** `main` and
  `v1-plaid-beta` fast-forwarded `5b668b2 → 4590520` (clean, no divergence)
  and pushed. Production Supabase (`wsmhstqpvbbcqpqhiqyp`) migration
  bookkeeping was found clean through `0011` (unlike staging, which had
  drifted — see below); only migration `0012` was pending and was applied via
  an explicit, self-verifying `DIRECT_URL` config (refuses to run against any
  host but `wsmhstqpvbbcqpqhiqyp`) — never the generic `npm run db:migrate`,
  since `drizzle.config.ts` hardcodes `.env.local` with no target check.
  Verified before/after: `transactions` row count unchanged (13,388),
  `plaid_accounts` row count unchanged (9), bookkeeping 12→13 rows (only the
  new migration recorded), zero rows auto-excluded. Deployed through the
  existing `budgts` Vercel project (no new project) — live at
  `https://budgts.com`, confirmed via the GitHub deployments API
  (`state: success`) and a direct fetch (loads, correct `/sign-in` redirect,
  0 console errors). `NEXT_PUBLIC_PLAID_ENABLED` untouched (stays off).
  GitHub Actions CI's `npm run build` step failed on this push with
  `DATABASE_URL is not set` — confirmed pre-existing (the same 4 CI runs
  before this push failed identically) and unrelated to the Vercel
  production build, which has its own env vars and succeeded independently;
  left alone per scope. Smoke-tested the unauthenticated path only (no
  production session available); the authenticated workflow checklist
  (dashboard, connected banks, transactions, categorization, Money Left,
  Savings Rate, Connected Banks, exclusion UI) is an open owner item (§6).
  **Separately, staging's own migration bookkeeping was found to have
  silently drifted** (migrations `0009`–`0012`'s schema changes were already
  live there from earlier ad hoc testing but never recorded in
  `drizzle.__drizzle_migrations`) — left untouched per instruction not to
  repair unrelated bookkeeping; noted here so a future session doesn't
  mistake it for a fresh problem.
- **2026-09-13 — UI redesign: Budgt brand + information architecture**
  (`d469d4b`, `05d4a1d`). Implements
  `docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md` against the
  supplied `New Assets.svg` / `New Branding guidelines.png` (the brand-token
  work itself — palette, Nunito Sans, mascot extraction into
  `public/brand/*.png` — predates this entry, done uncommitted in an earlier
  session; this pass committed it for the first time alongside the
  screen-level rebuild). Presentation-layer only, per the spec's own
  constraint: no change to Plaid ingestion, categorization, event-role/
  budget-effect classification, Money Left, Savings Rate, transfer ownership,
  or account-exclusion — every new screen composes the existing pure
  `buildDashboard`/`monthlyActuals`/`goalsSummary` functions and existing
  server actions (`setBudget`, `updateTransaction`, etc.), never a
  reimplementation of qualification logic. One real bug this caught: the
  first draft of the new `/insights` page fetched transactions without
  `event_role`/`transfer_user_set`/account-exclusion columns, which would
  have let it disagree with Home for the same month — fixed to mirror the
  dashboard page's exact query before it shipped.
  - **Design system**: `src/components/ui.tsx` (buttons, `ProgressBar`,
    `SegmentedControl`, `CategoryIcon`, `EmptyState`, `CatMessage`) and
    `nav-icons.tsx` (one glyph set shared by bottom nav, sidebar, and Settings/
    More rows).
  - **App shell**: `BottomNav` reordered to Home/Budgets/Activity/More;
    `DesktopSidebar` replaces it entirely at the `md` breakpoint (persistent
    sidebar + a wider multi-column `main`, not a stretched mobile layout).
    Settings and Goals moved out of primary nav into a new `/more` hub.
  - **New routes**, each a thin wrapper around an existing component/query:
    `/more`, `/insights`, `/accounts`, `/connected-banks`, `/help`, `/about`,
    `/settings/{profile,categories,security,appearance}`. `Settings` itself
    is now a menu, not a kitchen-sink page.
  - **Home**: greeting header (mascot mood keyed off sign of `savingsRate`);
    kept Money Left/Savings Rate as-is; Spending gained a month-over-month
    delta; new "What can I change?" card (biggest month-over-month category
    mover — two `buildDashboard` calls, current + previous month, no new
    domain code); new Savings-progress card (`goalsSummary`, links to
    Goals); new Recent Activity list.
  - **Budgets**: replaced the inline blur-to-save editor with category cards
    (icon + progress, click → Category Detail overlay: spend/budget/
    remaining/trend, "Change budget" via the existing `setBudget`, "See
    transactions"); a "+" Add Budget flow for un-budgeted categories; This
    month/All time toggle (all-time sums `monthlyActuals` — unchanged —
    across every month present, rather than a new aggregator). Deleted the
    now-dead `BudgetEditor`.
  - **Activity**: client-side search + Spending/Income/Transfers filter over
    the already-loaded month (no new query). Transaction Detail gained a
    one-tap "Mark as transfer"/"Remove transfer" action reusing
    `updateTransaction` with the same fields the edit form submits, isTransfer
    flipped — no new server code.
  - **Overlay** (used by every detail/edit screen in the app, not just new
    ones) gained a visible close button — it previously relied on
    backdrop-click/Escape only, which didn't satisfy the spec's "clear back
    affordance" rule.
  - Updated `tests/e2e/{smoke,budgets,transactions,goals,settings}.spec.ts`
    for the new nav paths/brand name/interaction flow; added component tests
    for the new search filter and transfer toggle.
  - Verified: typecheck, `eslint src/`, `npm run build`, Vitest (476 passing;
    the pre-existing `needs-category.test.tsx` full-suite-load flake
    reproduced once, confirmed unrelated by running it in isolation), and the
    9 runnable Playwright e2e specs (twice — `goals.spec.ts` hit the
    project's own documented shared-Supabase auth-rate-limit flake once,
    reproduced clean in isolation). A manual pass through a throwaway
    Supabase test user (created + deleted via the same admin API the e2e
    helpers use) confirmed Home, Budgets → Category Detail → Change budget,
    More, Settings, and Insights render and function correctly at both
    mobile (390px) and desktop widths.
  - **Deferred** (see the spec's own remaining-issues classification, not
    silently dropped): the 3-screen onboarding wizard (Welcome → Connect
    Bank → All Set) — Plaid UI is flag-gated off in every environment this
    was built against, so there was nothing real for a "Connect Your Bank"
    step to do; a Net Worth tab on Insights (spec explicitly forbids faking
    it); per-category "top merchants" in Category Detail; a Notifications
    settings screen (no backend exists for it — spec's own rule is not to
    show a fake option). None of these touch financial correctness.
  - Not committed to `main`; not pushed; not deployed. Still needs the
    owner's own visual/product pass before merging.
- **2026-09-13 — UI redesign v2: new brand source, real cropped assets**.
  The owner rejected the v1 pass's visual result and supplied a new
  reference set: `Budgts Reference V2.png` (four mockup screens — Get
  Started, Home, Budgets, Insights) as the sole source for color/type/
  component styling, and `Assets V2.svg` (an SVG wrapper around one
  embedded raster sheet) for the actual logo/mascot/iconography artwork —
  explicitly **not** to be hand-redrawn, and explicitly not to be used as a
  branding-guidelines source itself. A third supplied file, `Branding
  guidelines V2.png`, was deliberately **not** used (confirmed with the
  owner) so the palette/type values trace to exactly one source.
  - **New source of truth**: `docs/BRAND_GUIDELINES.md`, written from
    colors sampled directly off the reference mockup's icons/progress
    bars/donut legend (not guessed) plus the Poppins specimen in
    `Assets V2.svg`. It explicitly supersedes the v1 entry's palette/
    typography/asset sections; `docs/specs/2026-09-13-ui-redesign-brand-
    guidelines-spec.md` keeps a header marking exactly which of its own
    sections are void vs. still-current IA/behavior documentation.
  - **Palette**: cream `#FFF8F0` bg / ink `#0F0F0F` text / coral `#FF7B61`
    (accent + the app's own "+", active-nav, segmented-control-active
    color) / sun, sage, sky, lavender, pink as the six category hues (pale
    tint background + a sampled "strong" variant for glyphs/fills) —
    replacing the v1 warm-white/yellow/orange/blue/navy set entirely.
    **Primary CTA is now a solid ink-black pill** (literally what the
    reference's own "Get started" button is), not the previous blue —
    `PrimaryButton` needed no code change since it already reads the
    `--primary` token. Font: Poppins replaces Nunito Sans.
  - **Real assets, not redraws**: `Assets V2.svg`'s embedded PNG was
    decoded and precisely cropped (gap-detection to avoid bleed between
    adjacent artwork) into `public/brand/`: `logo-lockup.png` (wordmark +
    tagline), `icon-badge.png` (full-color mark, used by the sign-in/
    onboarding hero), `mark-default.png` + 3 solid-color alternates (source
    for `LogoMark` and every generated app icon), and the four mascot
    moods (`mood-normal/happy/curious/sleepy.png` — all four of the app's
    existing moods matched the sheet exactly, no new mood art needed) plus
    three decorative blob shapes and a sparkle mark. The superseded
    `app-icon.png`, `mascot-hero.png`, and the already-unused
    `decorative-blobs.png` were deleted; `public/icon-512.png`,
    `icon-maskable.png`, `src/app/icon.png`, `src/app/apple-icon.png` were
    regenerated from `mark-default.png` (composited onto cream at
    increasing safe-zone margins for the maskable variant). The entire
    legacy top-level `brand/` folder (an even older Volt-Lime/Deep-Pine
    identity, already self-documented as superseded and unreferenced by
    the app) was deleted too.
  - **Fixed a mascot/background conflict this session's token change would
    otherwise have introduced**: the black-cat mascot's silhouette
    disappears against the new solid-ink `--primary` hero card, so the
    Home "Money Left" card's mascot overlay was removed rather than
    shipped invisible.
  - **New migration** `0013_default_category_colors_v2_palette.sql` —
    `handle_new_user()`'s seeded category colors updated to the new
    palette's hues, so a brand-new signup's category dots/icons match out
    of the box. Existing users' stored `color` values are untouched (it's
    plain per-row data, not a data migration). Applied via `db:migrate`.
  - Grepped `src/` for every remaining raw old-palette `var(--yellow` /
    `var(--navy` / etc. reference (5 files: `income-tile.tsx`,
    `overlay.tsx`, `ui.tsx`'s category map and `CatMessage`,
    `transaction-form.tsx`'s checkbox accent) rather than assuming the
    semantic-token layer alone would catch everything.
  - **Verified visually** against a real authenticated session: created a
    throwaway Supabase test user via the e2e admin helper pattern, seeded
    budgets/transactions/categories with numbers mirroring the reference
    mockup's own examples, signed in via a magic-link `token_hash` through
    Playwright, and screenshotted Home, Budgets, Insights, Activity, Goals
    (empty state), More, and the signed-out sign-in screen at 390px width
    before deleting the test user. Confirmed Poppins loads, the new
    palette/component styling render as designed, and the cropped mascot/
    logo artwork displays correctly.
  - `RecreateDesign.md` (repo root, untracked working notes) holds the
    running instruction log and step-by-step checklist this pass was
    executed against.

- **2026-09-24 — Back to PWA-only; performance, timezone and install fixes.**
  - **Revert.** Owner dropped the native app / store plan. Local `main` was reset to
    `origin/main` (`4b20c81`, the pure-PWA build that production was still running).
    The 16 mobile + account-deletion commits and the uncommitted WIP are kept on
    branch `archive/mobile-and-deletion-2026-09-24`; the `mobile/` folder moved out of the
    repo to `../Budgts-mobile-archive`. `CLAUDE.md`, this file and `roadmap.md` updated to
    "personal-use PWA".
  - **Bug sweep** (Opus subagent, staging only): local-day dates instead of UTC
    (`src/lib/local-date.ts`), service worker no longer caches error responses, `/plaid-oauth`
    hydration + stuck-state fixes, a route error boundary, and stale-test repairs.
  - **Timezone.** Default month and "today" on the server now use `America/New_York`
    (`APP_TIME_ZONE`, `currentMonthKey`, `todayDateKey` in `src/lib/budget/month.ts`).
  - **Performance.** Causes found: two network `auth.getUser()` calls per page (proxy +
    layout); the dashboard layout waiting on 3 sequential queries; Home fetching the same
    transaction rows three times (this month, last month, 6-month trend); realtime
    calling `router.refresh()` once per row event (a bank sync fires hundreds); no loading
    state and a 0s client router cache, so every tab tap waited on the server. Fixes: `getClaims()`
    (local JWT verification against the ES256 JWKS) in the proxy and `getSessionUser`
    (server actions still use `getUser()`); one profile query and a streamed
    (`<Suspense>`) needs-category bell; one Home transactions fetch sliced in memory;
    a 1.5s debounced, visibility-aware realtime refresh; `loading.tsx` skeleton;
    `experimental.staleTimes.dynamic = 30`. Production DB is us-east-2 and Vercel is iad1, and
    RLS/indexes were already optimal, so region and DB were ruled out.
  - **PWA install.** Manifest gained `id`, `orientation` and 192px icons (any + maskable);
    the service worker no longer caches the manifest cache-first; More page has an
    "Install Budgts" card (Chromium install button, iOS Add-to-Home-Screen hint).
- **2026-09-25 — Agent routing installed; mobile is a hiatus, not a drop.** Owner clarified
  that native mobile and mobile monetization are paused, not abandoned (the 09-24 entry's
  "dropped" wording is superseded). New `AGENTS.md` (model routing: Sonnet 5 default,
  `budgts-architect` Opus 5.5 for all mobile + high-risk work, `budgts-utility` Haiku 4.5 for
  bulk mechanical work) replaced the auto-generated Next.js block; subagents live in
  `.claude/agents/`. `CLAUDE.md` updated to match (hiatus wording, agent routing section,
  local commits allowed after validated work, never push without asking).
- **2026-09-25 — Deep performance / hygiene review.** Follow-up audit so the 09-24
  slowness can't recur. `8f0d292`: `LimitedHistoryBanner` pulled the user's whole bank
  history (unordered, silently capped at 1000 rows — could also pick the wrong
  "earliest") on every Activity view; now one ordered `LIMIT 1` per account, streamed
  behind `<Suspense>` (as is the layout's `ReviewBanner`). Transactions, Budgets and
  Insights no longer await reads serially. `76b3bc8`: service worker is cache-first only
  for content-hashed `/_next/static/`; un-hashed `/brand/*` + icons are
  stale-while-revalidate (cache `v5`); new `tests/unit/performance-guardrails.test.ts`
  pins the incident's anti-patterns. `5fa6bc0`: removed unused `react-hook-form` +
  `@hookform/resolvers` and a dead `src/lib/budget/index.ts` barrel. Docs: "Performance
  rules" in `docs/conventions.md`; CLAUDE.md tour/V1/V1.5 status, env vars, commands,
  layout and the Drizzle-at-runtime reality corrected. Verified with read-only schema
  probes that migrations `0014`–`0016` are applied on production and staging.
- **2026-09-25 — Plaid sync: event-driven with a per-Item lease; the 30s poll becomes a
  10-min sweep.** Trace: webhook → `needs_sync` → (up to 30s later) `sync-due` →
  `syncItem`, with user actions calling `syncItem` directly — no lock, so a webhook-era
  poll, an overlapping poll and "Sync now" could sync one Item concurrently, and
  `applyPlan` cleared `needs_sync` unconditionally (a webhook landing mid-sync was lost;
  a page-capped sync also cleared it, stranding the remaining pages until the 6h
  backstop). Now: migration `0017` adds `plaid_items.sync_claim_token/sync_claimed_at`;
  `claimItemForSync` is one conditional `UPDATE … RETURNING` (10-min lease),
  `releaseSyncClaim` is token-fenced and settles `needs_sync` (kept on failure, pages
  left, or a webhook after the claim). `src/lib/plaid/sync-runner.ts` is the single
  sync path: the webhook drains its Item in `after()`, user actions take a `requested`
  claim, `sync-due` is a time-bounded sweep (`maxDuration = 300`). Items with an
  `unmapped` account are never claimable — previously the poller could sync a freshly
  exchanged Item before the user mapped it, skipping those rows past the cursor.
  Proven on staging: `tests/integration/plaid-item-store.test.ts` (held-lock and 8-way
  concurrent claims → exactly one winner, lease expiry, token fencing, webhook-mid-run,
  unmapped guard) + `npm run test:plaid`. Applied `0017` to **staging only**. Production
  rollout (migration, deploy, `cron.alter_job` to `*/10 * * * *`) is an owner step —
  see §6.
- **2026-09-25 — One server render per edit (was up to three).** Before: an action's
  `revalidatePath` re-rendered the page, the component then called `router.refresh()`
  (a second full render — 23 call sites across 14 components), and the realtime echo of
  the user's own row triggered a third via `<RealtimeRefresh>`. The per-action path
  lists were also incomplete (e.g. `/accounts`, `/connected-banks`, the layout's bell),
  which is why the client refreshes existed. Now every mutating action ends with
  `revalidateUserData()` (`revalidatePath("/", "layout")`, `src/server/revalidate.ts`,
  the only `revalidatePath` call), 22 of those `router.refresh()` calls are gone,
  and `<RealtimeRefresh>` is a server wrapper stamping `renderedAt` so its client
  listener skips events the latest render already includes (kept for bank sync and
  other-device edits). ConnectBank refreshes only when the mapping dialog is dismissed
  unsaved (the exchange route handler can't update the page); `bank-connections.tsx`
  keeps ConnectBank at a fixed tree position so the now-immediate re-render can't
  unmount a "first sync didn't finish" warning. New e2e "an edit costs exactly one
  server render" (1 action POST, 0 RSC refetches) — it fails on the old code (one extra
  `?_rsc=` refetch) and passes on the new.
- **2026-09-25 — Brand images and icons ~71% smaller.** Every brand PNG and app icon
  is now a 256-colour palette PNG at the same path and native size
  (`tools/optimize-brand-images.mjs`): 1,295,376 B → 371,350 B; the sign-in hero (LCP)
  278.6 KB → 82.3 KB with `fetchPriority="high"`. `mood-happy.png` was byte-identical to
  `logo-mark.png` and is deleted (Happy uses the mark). Checked on a staging build with
  element screenshots at 3x DPR: 44–59 dB PSNR vs before, visually identical.
  Right-sizing the wordmark (180w/360w) was tried and rejected — visibly softer in
  Chrome than the browser shrinking the full export — so sizes stay native.
  Verified on final HEAD (throwaway worktree, staging env only): typecheck, 819 unit
  tests, eslint (0 errors; 3 pre-existing warnings), build, 12/12 e2e (+ `plaid.spec`
  against a local staging-wired server), 109 DB-integration, 6 Plaid Sandbox.
- **2026-09-25 — Plaid sync hardening: a claim flags `needs_sync`; lease = function
  ceiling + 60s; deterministic Sandbox fixture.** Gap: a run killed between claim and
  release (e.g. a Sync now server action hitting the platform timeout) left
  `needs_sync = false` on an up-to-date Item, so the sweep (flagged or 6h-stale) never
  retried it, and the user saw "already running" for the whole 10-min lease. Now
  `claimItemForSync` sets `needs_sync = true` in the same conditional UPDATE that takes
  the lease and `releaseSyncClaim` remains the only place it is settled, so any killed
  run is picked up by the next sweep once its lease expires — no new mechanism, no
  schema change. Vercel Fluid compute gives every function (route handlers and the page
  functions that run server actions) a 300s default, which is also Hobby's maximum, so
  `SYNC_LEASE_SECONDS` = `FUNCTION_MAX_DURATION_SECONDS` (300) + 60 = 360 (was 600); a
  guardrail pins every `maxDuration` in `src/app` at or under the ceiling. A busy
  Sync now says how many minutes until it can be retried (`claimMissMessage`). Staging
  integration tests cover the claim-time flag and a killed run swept after, and not
  before, lease expiry (both fail with the claim-time flag removed).
  `npm run test:plaid` flaked (1/3 in review; 2/7 here on the first attempt) because
  the fixture stopped polling at the first transaction, before Plaid's historical
  pull. `transactions_update_status = HISTORICAL_UPDATE_COMPLETE` alone was not
  enough: Sandbox reported it while `/transactions/sync` still returned 16 of 48 rows.
  Ready now means the flag is complete AND a cursor-less sync returns exactly
  `/transactions/get` `total_transactions`, polled against a 90s deadline that fails
  with both counts. After that change: 10/10 consecutive passes on staging.
- **2026-09-25 — Design language v3: Swiss editorial + premium fintech + pixel brand.**
  Owner-directed redesign of the whole PWA, presentation layer only (no calculation,
  query or action logic changed). New system in `docs/BRAND_GUIDELINES.md`:
  charcoal on light gray with one signal-red accent; Geist for UI, Dogica (SIL OFL,
  bundled with its license) for the wordmark and brand tags only; Phosphor icons;
  a pixel-art robin (`src/lib/brand/robin-art.ts`) as logo, mascot (moods: happy,
  curious, sleepy) and app icons (`tools/generate-app-icons.mjs`, ~1.3 MB of raster
  art replaced by ~3.5 KB of icons). Budgets progress and both charts are square-cell
  markup rendered on the server; recharts removed from dependencies. Motion: page
  enter, reveal cascade, stepped cell build-up, robin blink/chirp/hop, press/lift
  feedback, skeleton sweep, all off under prefers-reduced-motion. Removed: the six
  `public/brand/*.png` rasters, `tools/optimize-brand-images.mjs`,
  `spending-charts.tsx`. Verified on a staging-only local build with a seeded
  throwaway user (deleted afterwards): 12 screens at 390px, no console errors,
  Playwright e2e 12/12 (plaid.spec skipped by design).
- **2026-09-25 — Speed pass: parallel paging, a sliced Activity list, lighter bundles.**
  Measured first on staging with a heavy seeded feed (8,542 rows over 7 months,
  ~1,250 a month, the shape of a real multi-bank month), old build vs new side by
  side. No calculation changed: every screen's text (Home, Budgets month and all
  time, Insights, Goals, Activity fully expanded) is byte-identical to the old
  build. `fetchAllRows` asks for the count with the first page and fetches the rest
  at once (Home 1,026 → 373 ms, Budgets all-time 1,115 → 342 ms, Insights 269 → 210
  ms). The Activity list renders 60 rows at a time with memoized rows (page 1.97 MB
  → 0.56 MB, 9,839 → 760 DOM nodes; on a 4× throttled CPU a tap on a transaction
  went from 544–1,592 ms of event handling to 56–64 ms, a keystroke in search
  from 544–688 ms to 104–128 ms, and the Activity tab from 2.3–2.7 s to 0.76–0.94
  s). Zod left the browser bundle (−366 KB on
  Activity, Accounts, Categories, Connected banks) and the Supabase browser client
  now loads after the page (−253 KB from every first load). The robin is one path
  per colour per layer (~170 fewer DOM nodes per copy; 38 screenshots, static and
  with every animation layer forced on, pixel-identical at 1× and 2×). The service
  worker uses navigation preload. Functions move to `cle1`, beside the `us-east-2`
  database (`vercel.json`, its own commit; takes effect on deploy). Rules 3, 8,
  10, 13 and 14 in `conventions.md`. Note for local benchmarking: this machine intermittently
  stalls every in-flight request to staging for ~10 s (both builds, identical
  pattern), so compare builds side by side, and don't share `.next` with another
  session's preview server (a concurrent build there replaced it mid-run).
- **2026-09-26 — Mobile + App-Store launch resumed; Budgts is commercial again.** The
  owner ended the 2026-09-24/25 personal-use hiatus. Decisions:
  - Budgts is sold by the owner's LLC (D-U-N-S → Apple/Google organization accounts, so no
    Google 12-tester / 14-day closed test).
  - Native **Expo** apps, every screen visually identical to the approved web app, zero
    known bugs, premium feel, each part scored /10 and iterated to 9.5+.
  - $9.99/month, $69/year, 7-day trial (unchanged from 2026-09-18; confirm once Plaid shows
    its per-Item price).
  - **One subscription unlocks the apps and budgts.com** (supersedes "web stays free"; still
    no web checkout).
  - The influencer program moves after launch.

  Owner research (2026): YNAB $14.99/mo or $109/yr, Monarch $99.99/yr (Plus $199), Copilot
  $95/yr; Apple Small Business Program and Google subscriptions both take 15%. US
  external-purchase links currently carry no Apple commission; Apple has proposed 15%
  (5% for small developers), pending in court.

  Work continues on `phase-m/mobile-launch`; the archive branch is ported selectively (its
  web files predate the redesign). Also recorded as a launch blocker: "this month" is pinned
  to America/New_York, and customers elsewhere need per-user time zones.

- **2026-09-27 — Per-user time zones; migration-safety tooling ported.** Owner
  decisions 2026-09-26: "time zones must depend where the user is located", and the DB
  password / Google client secret stay as they are ("it's fine, disregard this").
  - "Today" and "this month" follow the zone the user's device reports. Onboarding
    stores it in `profiles.time_zone` (migration `0018`: backfilled `America/New_York`
    for users onboarded before it, plus the check `profiles_time_zone_when_onboarded`).
    `<TimeZoneSync>` in the dashboard layout updates it when the device's zone changes,
    on open and on return to the foreground (no timers). Every page passes it to
    `src/lib/budget/month.ts` through `requireTimeZone()`, one cached profile read per
    request shared with the layout's first-run gate. Settings → Profile shows it. The
    NY-only client date swap (`resolveDefaultDate`) is gone; the CSV export is dated in
    the user's zone.
  - `tools/db/*` ported from the archive: `predb:migrate` refuses to run unless
    `MIGRATE_CONFIRM_REF` names the target's project ref; `db:verify-history` reports
    ledger drift read-only. Staging's ledger has two known differences, neither harmful:
    `0000`–`0002` and `0007` were recorded from CRLF checkouts (same SQL), and six
    archived migrations (2026-09-21) were applied when this staging was built from the
    archive branch. Renumbering those must allow for their tables already existing there.
  - Verified: 934 unit/component tests, typecheck, lint, build. `0018` applied to staging
    only (9 onboarded profiles backfilled, 0 violations; production still at `0017`).
    Playwright on staging 14/14, including a new Tokyo → Los Angeles travel test and the
    Plaid sandbox flow.
  - **Live 2026-09-27** (`ef4f2d1`, deployment `dpl_8eSe7JR4tu66yVR34MUiWFZYRfdg`).
    `0018` was applied to production first, through the gate: 10 profiles and 32,752
    transactions unchanged, 9 onboarded profiles backfilled, 0 violations, constraint
    validated. Then `main` was fast-forwarded and deployed. Smoke checks and production
    error logs were clean. The owner confirmed on their own account that the time zone
    change works (2026-09-27).
  - `budgts-staging.vercel.app` serves an older branch (the old onboarding screen), not
    `main`. Test new work on staging with the isolated local build against the staging
    database, not that alias.

- **2026-09-27 — Builds no longer need secrets; CI and Vercel Previews unblocked.**
  Pushing `phase-m/mobile-launch` made a failing Vercel Preview build, and CI had been red
  on every push to `main` since at least 2026-09-14 (the last green push to `main` was
  2026-09-10; the green runs of 2026-09-22 were pull requests whose `ci.yml` injected a
  placeholder `DATABASE_URL`, a workaround still on the archive branch that must not be
  ported). One root cause: `src/lib/db/index.ts` created the Drizzle client at import and
  threw without `DATABASE_URL`, and `next build` imports every route module to collect page
  data. Neither CI nor Preview has that secret; Production does, so budgts.com kept
  deploying.
  - The client is now `db()` (server-only), created on first use and cached, like
    `plaidClient()`. The Plaid routes and actions call it directly; the `plaidDb` alias is
    gone. `nudgeRefresh` and `drainItemInBackground` now truly never throw: any failure,
    including a missing setting, is logged inside `after()`.
  - What the import-time throw used to guarantee is now explicit: npm's `prebuild`
    (`tools/check-production-env.ts` → `src/lib/env/production-env.ts`) refuses a Vercel
    production build without `DATABASE_URL`, Plaid's settings or `CRON_SECRET`. It reads
    the real process env only, because the local `.env.production` (a Vercel pull) says
    `VERCEL_ENV=production` with masked secrets.
  - Vercel Preview now uses the staging project's public Supabase values (they had been
    shared with Production), so a branch preview can never touch production data.
  - Verified: the old code reproduced the exact failure under CI's env and the new code
    builds under it; builds simulated as CI, Preview, production-missing (refused, naming
    all three problems) and production-complete (passed); 955 unit tests, incl. every Plaid
    route importing with no secrets and the prebuild run as npm runs it; typecheck, lint;
    Playwright on staging 14/14 incl. the Plaid sandbox flow (a saturated machine timed a
    few specs out, and the pre-change build failed identically, so they were rerun with a
    longer timeout); `sync-due` and `recurring-scan` ran against staging (200; wrong secret
    401); the pushed Preview build turned Ready.

- **2026-09-27 — Server logs no longer carry Plaid credentials or tokens.** Found by the
  subagent review of the build fix: when a Plaid call failed, the exchange, link-token and
  test-seed routes and the refresh nudge logged the raw error, and a Plaid SDK (axios)
  error carries its whole request (the `PLAID-SECRET` header, the access or public token).
  The recurring scan and three DB paths logged raw errors too. Every server
  `console.error` / `console.warn` now logs `describePlaidError(e)` (the old
  `describeSyncError`, widened to every Plaid path and given Plaid's `error_code` /
  `error_type` / `request_id`). Two new tests: a Plaid-shaped error with a fake secret,
  client id and access token logs none of them, and `tests/unit/log-safety.test.ts` fails
  on any raw error passed to a server log (on the old code it flags all 12 sites). The build
  test now finds every `route.ts` itself instead of a hand-written list. 960 unit tests,
  typecheck, lint. Owner: consider rotating `PLAID_SECRET` (`docs/security.md`).
  - Second review round: Drizzle wraps every failed query in an error whose message is the
    SQL plus its parameters (merchant names, amounts), and the sync, recurring-scan and
    background paths logged that message. `describePlaidError` now logs any database error
    (Drizzle, postgres.js, supabase-js) as "database query failed" plus its code, table and
    constraint, with stack frames but no database text. Four tests with Drizzle's real
    error class (all four fail on the previous version), and the log tripwire now splits
    each call into its arguments, rejects interpolated template strings and raw errors
    beside a safe call, and covers `console.log` / `info` across `src/lib`.

- **2026-09-27 to 28 — Stage 0: the shelved mobile work ported (finished and live 2026-09-28, `a72380a`).** Branch
  `phase-m/stage0-port` from `e5cfbda` (`main`, live budgts.com): 13 commits (`7ba8a09` … this one: ten port chunks,
  a CLAUDE.md/AGENTS.md docs commit, and two after an independent review scored the port 8.8/10). The branch is to
  be fast-forwarded into `phase-m/mobile-launch` after the review; that has not happened yet. Plan:
  `docs/superpowers/plans/2026-09-27-stage0-port.md`. Source: `mobile/native-home` (`901ebfd`); the older archive
  branch was a superseded snapshot.
  - Migrations `0019`–`0024` (deletion indexes, write guard + disconnect exception, the ten-table ledger, entitlements
    and billing events without the reminder columns), proven from empty on embedded Postgres. Staging is not migrated
    (it holds the shelved numbering); the rebuild procedure is recorded, pending the owner. They must reach
    production before the build (`docs/deploy.md` → Notes, with a read-only probe).
  - Bearer auth verified locally with `getClaims`; `/api/mobile/*` (session, profile with the time zone and the
    user's `month` / `today`, onboarding, home, budgets, transactions, accounts, categories, Plaid banks / sync /
    mapping / exclude / importing). Shared commands rebuilt from `main`'s actions; Home's reads moved into
    `src/lib/home/load-home.ts` for the web and the API (no money-math change), and an e2e checks the web Home shows
    the API's numbers.
  - `/api/plaid/link-token` and `/api/plaid/exchange` accept cookie or Bearer and **refuse a deleting account** (409).
    `/api/plaid/item` and the sandbox test seed accept cookie or Bearer too, but do **not** refuse: disconnecting a
    bank stays allowed during deletion (migration `0022`), and the seed only mints a sandbox token.
  - Account deletion (Path A / Path B, strict Plaid removal, deadlock retry), proven on staging including against a
    leased sync. Billing ported switched off ($9.99 / $69, 7-day trial, no reminder).
  - `mobile/` with "today" / "this month" from the server in the user's zone, and the device zone synced on
    foreground. Settings' legal links are hidden until Phase 1 builds the pages.
  - Also fixed: `src/app/pixel-frames.css` is pinned to LF, because a fresh autocrlf checkout failed its byte-for-byte
    test. CI gains a `mobile/` job (tests + typecheck); running it standalone showed vitest's `vite` peer only
    resolved from the web app's `node_modules`, so `mobile/` now declares it.
  - **Review fixes (2026-09-28):** the mobile Today/Yesterday label used a UTC "today" (a Los Angeles user saw today's
    entries as "Yesterday" after 5 pm); it now uses the server's `today`. Direct tests for the Plaid commands and the
    connected-banks read. Deploy order + probe. An exit link on `/app/plaid-oauth`. A pre-existing same-owner gap on
    account ids recorded in `docs/security.md`.
  - **Verification.** Clean worktree of `6575c83` (the last code commit; the final commit changes docs only):
    `npm ci`, lint, typecheck, build pass; web vitest 1496/1496 (141 files); `mobile/` `npm ci`, vitest 216/216,
    typecheck. Before the review: web vitest 1469/1469 (139 files), mobile 212/212, staging integration 155/172 (the 17 failures
    below), e2e on isolated staging builds (mobile-bearer-auth 4/4, mobile-data-api 3/3, mobile-plaid-api 2/2,
    plaid.spec 1/1, smoke 5/5, settings, goals, tour, time-zone, router-cache 2/2, budgets).
  - **`transactions.spec` A/B (2026-09-28).** Isolated staging builds of the port (`6575c83`) and of `e5cfbda`, run
    alternately A, B, A, B, A, B on the same machine at the same load: port 3/3 passed (12.0 s, 6.4 s, 7.4 s),
    `e5cfbda` 3/3 passed (8.8 s, 19.9 s, 6.1 s). No regression: the earlier failures were load (both builds had failed
    it under heavier load earlier the same session: port 2 of 8 runs passed, `e5cfbda` 2 of 6).
  - **Pre-existing follow-ups found while verifying (not caused by the port):**
    - 16 recurring / bill / subscription detection integration tests failed on the drifted staging, identically on
      clean `e5cfbda`. The reviewer attributed it to the scan cutoff coming from this machine's clock while
      `transactions.created_at` comes from the database's `now()` (about 0.32 s ahead). **After the staging rebuild
      all 16 passed** (172/172), so the drifted schema is the likelier cause. One run: watch the next runs, and if
      they fail again, take the scan time from the database.
    - The Path B concurrency test's "a deadlock must actually happen" condition did not trigger on the drifted
      staging; it passed once after the rebuild. It is timing-dependent, so not yet called fixed.
  - **Landed 2026-09-28.** Owner: "1. Move it into launch branch 2. Push 3. Rebuild staging".
    `phase-m/mobile-launch` fast-forwarded to `e26fcfe` and pushed, then `e8b4ed3` (the Expo env template: the
    README's `.env.example` only ever lived in the untracked `Budgts-mobile-archive` folder, because the root
    `.gitignore` hides `.env*`; saved as `mobile/.env.local.example` with all five `EXPO_PUBLIC_*` names). Vercel
    preview builds of the push: Ready on both `budgts` and `budgts-staging`. GitHub CI runs only on `main` and PRs,
    so it did not run for the branch push. Staging rebuilt: see `docs/operations/database-migrations.md`.
  - **Shelf deleted 2026-09-28** (owner: "Im permitting you to delete the shelf"): `mobile/native-home` on origin
    and locally (tip `901ebfd`), the `Budgts-mobile-archive` folder (only `.expo`, `node_modules` and the env
    template, which is now `mobile/.env.local.example`), and the `budgts-stage0` worktree with its merged branch.
    The auto-mode classifier had refused the deletion under a plain "push"; it went through once the owner named it.
  - **Production migrated 2026-09-28 11:53Z** (owner: "im giving you the authorization and approval of these two
    tasks"): `0019`–`0024` applied, ledger 19 → 25, probe 9/9 `true` (checked by the migrating agent and again
    independently), row counts unchanged (transactions 32771), `account_deletions` empty, RLS on every table,
    budgts.com unaffected (still `dpl_HsPuJzYRjkhLbZU8ruCto9UMw6kN`). Not deployed: the Stage 0 build waits for
    the owner. `db:verify-history` on production reports old line-ending and ordering history, documented in
    `docs/operations/database-migrations.md` → "Production ledger: known pre-existing drift".
  - Left for later: legal pages + deletion screens + restoring the mobile legal links (Phase 1), shared tokens +
    restyle (Phases 2–3), `requirePremium` wiring + Manage Subscription (Phase 4).
- **2026-09-28 — Stage 1: the store blockers on the web (live on budgts.com 2026-09-28, `151323f`).** Branch
  `phase-m/stage1-web` (worktree `budgts-stage1`, from `6bb7d52`). Owner: "start this too after deployment";
  standing rules: no calculation changes, no questions. No migrations.
  - **Legal pages behind one switch.** `/privacy`, `/terms`, `/support`, `/account-deletion` (Google Play's web
    deletion link) in the current design (`src/components/legal/legal-doc.tsx`: pixel title, a "short version"
    lead card, one sheet of sections, a sticky section list from lg, a footer naming the publisher). Every fact
    only the owner can give lives in `src/lib/legal/config.ts` (six env vars: entity, address, `SUPPORT_EMAIL`,
    retention years, governing law, effective date). Until all are set and valid each page is a 404 and nothing
    links to it: sign-in's "By continuing you agree to the Terms and Privacy policy", About's Legal rows, and
    the apps' Settings links, which now ask `GET /api/legal` (so `LEGAL_PAGES_LIVE` is gone and the web's
    switch is the only one). Public in `src/proxy.ts` either way. Owner facts: `docs/deploy.md` → "Legal
    pages".
  - **Settings → Delete account** (`/settings/delete-account`, `src/components/account/delete-account-flow.tsx`):
    what's deleted and kept, the store-subscription notice, a fresh sign-in (magic link to the session's own
    address, or Google) when the last is over 10 minutes old that returns to the confirm step, type DELETE,
    progress, and a state with a way out for every answer: stale sign-in, lost session, unavailable, deletion
    incomplete (read-only, retry finishes it), a bank Plaid won't remove (new `plaid_removal_failed` 502, points
    to Connected banks), network. Success signs out locally and lands on the public `/account-deleted`. It sits
    outside the dashboard shell so a user who never onboarded can still delete. While a deletion holds the
    lock, every dashboard screen shows a read-only banner with "Finish deleting" (guarded UPDATE/DELETE fail
    silently otherwise).
  - **Design scoring** (ramsys-ui-ux rubric, 390 and 1440, light and dark preference, motion on; shots in the
    session scratchpad). First → final: privacy 8.9 → 9.5, terms 8.9 → 9.5, support 8.6 → 9.5, account-deletion
    9.0 → 9.5, sign-in link 9.0 → 9.5, intro 9.2 → 9.6, confirm 8.8 → 9.5, fresh sign-in 8.7 → 9.5, deleting
    8.8 → 9.5, errors 8.9 → 9.5, signed out 8.9 → 9.5, done 9.4 → 9.6, read-only banner 9.4 → 9.5. Fixes: one
    16/24px card inset everywhere (lead cards too, so stacked cards share one left edge), the section list
    aligned with the title, the flow pinned to the top (`StandaloneShell align="top"`) so its title never jumps
    between steps, icon tiles beside their text, the Plaid error leading with Connected banks, a centered legal
    line under the sign-in card. Trade-offs: the app is light-only (brand rule), so the dark-preference captures
    are identical by design; deletion has no real progress events, so "deleting" shows a skeleton sweep, not a
    percentage; the legal footer doesn't mark the current page.
  - **Verification.** Commits `84c921a` (legal pages + switch) and `6a9b1d5` (deletion flow), each lint /
    typecheck / test / build green before committing. Web vitest 1590/1590 (150 files); `mobile/` vitest 219/219 +
    typecheck. Staging integration 167/172 in one full run, the 5 failures being Supabase Auth's rate limit (3,
    after a morning of e2e and captures creating users) and the two timing-dependent "must really deadlock"
    conditions noted under Stage 0 (the deletions themselves were correct); those three files then passed 15/15
    on a rerun, and the deletion files 40/40 earlier. E2E on isolated staging builds: switch on, delete-account
    4/4, legal-pages 3/3, plus budgets, goals, tour, time-zone, router-cache 2/2, transactions and
    mobile-bearer-auth 4/4 (11/11); switch off, legal-pages 2/2 (+1 skipped: needs the pages on), delete-account
    4/4, smoke 5/5, settings.
  - **Owner facts supplied 2026-09-28:** `Budgts, LLC`, 619 Springhouse Rd, Apt I, Allentown, PA 18104,
    support@budgts.com, retention "deleted right away" (`0`), Pennsylvania law, and the terms apply "once they sign
    in" (pages show "Last updated September 28, 2026" and say they apply from first sign-in). Owner-confirmed the same
    day: 18+, not directed at under-13s, liability capped at 12 months' fees, immediate deletion with no undo window.
    Advised to have counsel read the terms. Retention 0 is enforced: the production build refuses billing live with
    it (`src/lib/env/production-env.ts`). The main session sets the six values in Vercel.
  - **Review fixes (2026-09-28, independent review 8.7).** Paid wording now follows billing, not the calendar:
    `billingLive()` (`src/lib/billing/config.ts`, from `BILLING_ENVIRONMENT=production` + the webhook secret + the RevenueCat secret API key (added after re-review), the
    configuration the billing routes already use) decides whether Terms, Privacy, Support, `/account-deletion` and the
    delete intro mention plans, trials, RevenueCat or store cancellation; until then the Terms say "Budgts is free
    today. Before any paid plan starts, we'll update these terms." Prices and trial length come from
    `src/lib/billing/plans.ts`. The trial key fact matches the 24-hour rule. Unreadable deletion answers (504, HTML,
    unknown codes) are "uncertain" (retry is safe), never "wasn't deleted", on the web and in the app; the app now
    names `plaid_removal_failed` and links Connected Banks. Retention copy says "in line with our retention
    schedule" (the purge job is a Phase 4 obligation, `docs/security.md`); "Apple" sign-in wording removed until
    Phase 2. Scores after the fixes: terms 9.5 → 9.6, privacy 9.5 → 9.6, support 9.5, account-deletion 9.5 → 9.6,
    intro 9.6 (balanced wrap), errors 9.5 → 9.6. Web vitest 1605/1605, mobile 221/221, e2e per switch state:
    on 7/7, off 6/6 + 1 skipped.

- **2026-09-29 — The apps become the only product; budgts.com becomes the company website.** Owner:
  "I want this app to be only available on app store and play store, and use the web domain budgts.com for my
  company website", then, on the recommended route: "I love your suggestion and recommendation, lets stick with
  that plan." Recorded in the launch spec (revision block, §13a, §1, §9, §17), CLAUDE.md, AGENTS.md, the roadmap
  (new Phase 1b, Phases 4 and 5), deploy.md, README.md and the monetization spec.
  - **Sequence:** Phase 1b company homepage (next web item; up before the Apple enrollment) → Phases 2–4 with
    the browser app live as the blueprint → at launch: tell existing users, swap Sign in for the store buttons,
    retire the browser app (retired addresses land on a "Budgts now lives in the app" page; a service-worker
    update clears installed PWAs), keep the legal, support and web-deletion pages plus `/api/*`, `/.well-known/*`
    and `/app/plaid-oauth`, update the legal copy → after parity, delete the web UI code.
  - **Supersedes** 2026-09-26's "one subscription unlocks the apps and budgts.com": subscriptions are app-only,
    with no web plan status or Manage Subscription page.
  - **Why inside this project, not a website builder:** the server, the webhook address on every bank
    connection, the `pg_cron` jobs, Plaid's registered addresses and the app-link files all stay on budgts.com
    unchanged. A builder would have forced the server onto a subdomain and moved all of those.
  - Owner status: the D-U-N-S number is still pending; the Apple and Google organization enrollments wait for
    it. Nothing in Phases 1b–4 needs it except the iPhone, Sign in with Apple and store-product pieces.
- **2026-09-29 — Phase 1b: the company homepage (built, not deployed).** Branch `phase-m/stage1b-homepage`.
  - **Routing:** `src/proxy.ts` rewrites a signed-out `/` to `/company` (a 200 at `/`, for people and crawlers);
    signed in, `/` is the dashboard as before. Sign-in keeps `next` and its signed-in redirect home, and gains a
    quiet "Home" link top left. The legal pages' "Open Budgts" now points at `/sign-in`.
  - **Page:** `src/app/(site)/company/page.tsx`: hero (Track : Plan : Grow, "Budgeting that does itself.",
    coming soon to iPhone and Android) beside Crystal's welcome scene; "Connect your bank. Safely." with the
    privacy policy's three facts and the Plaid scene; "How Budgts works" as four cards reusing the welcome
    guide's scenes (sample figures only); a Sign in band; the legal footer. No prices, no store badges, no
    third-party scripts. Metadata: absolute title, description, canonical `/`, Open Graph and a generated
    1200x630 share card (`opengraph-image.tsx`, Dogica + next/og's bundled Geist, the robin at 10px a cell).
  - **Scores (rubric /10, motion on):** homepage 390 8.8 → 9.5, homepage 1440 8.8 → 9.5 (v1: the scene's own
    CRYSTAL tag was repeated in a caption below it; 160px gaps between sections), sign-in 390 and 1440 9.5 →
    9.5, share card 6 → 9.5 (v1: a custom font list replaced next/og's default, so every line set in Dogica
    and the robin was pushed off the edge). Named trade-offs: the looping scenes are captured mid-loop; at
    1440 the scenes keep their 384px design width inside wider cards; on a phone the Plaid scene follows the
    three facts; the page has no primary in the hero (nothing to download yet), its one primary is the closing
    Sign in; `/company` is also reachable directly, with canonical `/`.
  - **Copy for the owner to confirm:** the headline and lead, "Connect your bank. Safely.", the four card
    bodies (from the approved welcome-guide copy), "Already have an account? Sign in and pick up right where
    you left off."
  - **Review fixes (2026-09-29, independent review 9.2).** Hero and description say "sorts your purchases" (some
    arrive as Needs a category); a fourth trust fact says what Google sign-in data is for (Google brand
    verification; not "only name and email": Supabase also receives a profile-photo link); the bank scene is 236px
    and centred on its text; on the homepage only, "Every purchase, tracked." opens on its filled feed and stays
    full for about 80% of its loop (`homepage.module.css`; the welcome guide is untouched); the eyebrow uses
    `.px-tag`; the coming-soon tile is the quiet gray one; the share card sets its headline in Geist SemiBold
    (`src/app/fonts/geist`, OFL) with more room under the wordmark; `robots.ts` and `sitemap.ts` added and public
    in the proxy; `docs/deploy.md` gained the post-deploy cache checks (Cloudflare must stay DNS-only) and the
    footer's dependence on the six legal facts. Scores: homepage 390 and 1440 9.2 → 9.5, share card 9.5 → 9.5.
- **2026-09-29 — Stage 2B: the native API for every screen (built, not deployed).** Branch `phase-m/stage2-api`
  (from `7255d25`), worktree `../budgts-stage2-api`; owner: "start stage 2". Stage 2A (native foundation) runs in
  parallel and owns `mobile/`, `src/lib/brand/*` and sign-in, none of which this touched.
  - **What:** every signed-in web screen now has one Bearer read under `/api/mobile/*` plus the mutations it uses
    (the endpoint table is launch spec §6). New: goals (+ edit/archive, add/withdraw), insights, settings
    categories + category create/edit/archive, welcome guide (cards + seen), hub counts, CSV export, status (bell,
    review warnings, deletion lock), activity (needs a category, limited history) + categorize + re-scan, accounts
    overview, Connected banks' clear-review, the Delete account screen's first state. Additive fields on home
    (spending cards, `bankConnected`, `?month=`), budgets (`range=all`, last month per category, hero, the
    unplanned note) and profile (`tourSeen`, the Profile screen's lines).
  - **How:** Stage 0's pattern (`docs/conventions.md` → "Every screen serves two clients"): each page's query path
    or action moved, not rewritten, into a framework-free loader or command that the page and the route both call.
    The chart figures the cards print (breakdown shares, trend change, savings-rate delta, budget hero) moved
    verbatim out of the components into `src/lib/insights/figures.ts`. No formula, migration or Plaid-sync change.
  - **Decisions:** retried creates land once through a client `requestId` used as the row's primary key (goals,
    contributions, categories; no migration needed); Home now honours `?month=` like the web Home's month switcher
    (Stage 0 had pinned it to the current month); home/budgets/profile grow by adding fields, which keeps the
    contract version (removing or changing a field bumps it).
  - **Fixed on the way (root causes, small):** contributions were read unpaged (silently capped at 1000 rows for
    Home's savings card and Goals); a contribution could reference another user's goal id (foreign keys ignore
    RLS), now refused by the app (see the review fixes below); the web CSV export returned the storage error's text on failure; web Goals, Accounts and
    Categories showed an empty screen on a failed read, now the error boundary. The web Activity panel still hides
    on a failed needs-category read, as before; the API answers 503.
  - **Moved tests:** `limited-history-banner.test.ts` and `review-banner.test.ts` moved beside the functions they
    test (`src/lib/plaid/`), import line only. `home.test.ts`, `reads.test.ts` and the home/budgets/profile route
    tests gained the additive fields; every web test passes unmodified.
  - **Verification:** lint 0 errors, typecheck, unit 1758/1758 (172 files; the documented `needs-category.test.tsx`
    and `account-mapping` userEvent flakes appeared once each under full-suite load and passed alone), build;
    staging integration 188/188 (new `mobile-screens.test.ts` 16/16: API equals the web loaders for goals,
    insights, budgets, home; B's ids are 404s that write nothing; requestId retries land once); isolated-build e2e
    37 passed, 4 skipped (pre-existing), including the new `mobile-screens-api.spec.ts` (first full run: a
    `budgets.spec` and two delete-account timeouts under load, all green on rerun and alone).
  - **Self-score (API completion /10):** first 8.6 (the Delete account screen had no read, four screens lacked contract
    types, docs not written, integration and e2e not yet run) → final 9.5 (coverage, correctness and parity,
    security, performance, tests and docs each 9.5). Known trade-off: some routes read the profile twice in
    parallel (time zone and currency), one primary-key row each.
  - **Deferred:** `deleteContribution` has a command but no route (no screen deletes a contribution);
    `mobile/lib/*` parsers still read only the old fields (Phase 3 wires the new ones); not pushed or deployed.
  - **Independent review 9.3 (2026-09-29) and its fixes.** The review confirmed the moves are faithful (money math
    untouched) and reproduced the counts. Fixed:
    - **Same-owner references, enforced by the app.** Every client-supplied id that points at another table is now
      confirmed visible through the caller's own RLS client before the write, by one helper
      (`referencesVisible`, `src/lib/ownership.ts`): manual transaction create and update (account, category),
      `setBudget` (category), `addContribution` (goal), `categorizeBankTransactionFor` (category; it also reaches
      the merchant rule and the backfill) and `mapAccountsFor` (existing account, checked before any entry is
      written). A foreign or unknown id writes nothing and answers not found (web message, native 404). **This is an
      app-layer guarantee only: the database still accepts such rows sent directly through PostgREST with a user's
      own token.** The database fix (composite foreign keys recommended) is proposed, not built, and is an owner
      decision before launch (`docs/security.md` → "Still open"; roadmap owner steps).
    - **Deletion lock message.** When an edit or delete of the caller's own row matches nothing, the command asks
      `account_accepts_writes()` and answers `locked` while a deletion holds the lock (`missingOrLocked`): the web
      says "Your account is being deleted, so changes are paused.", the API answers 423 `account_locked`. Goals,
      categories and accounts (edit, archive) and transaction delete. (Transaction edit and the refused inserts
      were completed in the polish round below.)
    - **Filter-drift guard.** A staging actor with a real purchase plus an excluded-account row, a row held for
      review, a confirmed duplicate and a Plaid-removed row: Home, Insights and Budgets count only the real
      purchase and each equals its web loader.
    - Tests: `src/lib/ownership.test.ts` (13), `src/server/savings.test.ts`, 4 new staging tests (each ownership
      test fails with the check disabled; staging was left with no test users and no cross-user rows). The
      pre-existing command tests (`accounts`, `budgets`, `transactions`, `server/transactions`, `server/plaid`)
      stub the ownership helper, since each fakes only its own table; their assertions are unchanged.
    - Verification after the fixes: lint 0 errors, typecheck, unit 1772/1772 (174 files), build; staging
      integration 190/192 in one full run, the 2 being the documented timing-dependent "must really deadlock"
      conditions (those files 10/10 on a rerun); isolated-build e2e 37 passed, 4 skipped (pre-existing).
    - The roadmap row said "independent review pending" until the reviewer re-scored: **re-review 9.5.**
  - **Polish round (after the 9.5 re-review): one message for every write the deletion lock refuses.** The guard
    (migration 0021) lets reads through, fails inserts on row-level security and makes updates and deletes match
    nothing, so three paths still said the wrong thing: a transaction edit read fine, matched nothing twice and
    answered 409 `conflict`; `setBudget`, `copyBudgetsFromPreviousMonth`, `createGoal`, `addContribution`,
    `createCategory`, `createAccount` and manual create answered `failed` (a 503, and the database's own text on
    the web); `categorizeBankTransactionFor` said "That transaction no longer exists". Now every refused write
    asks the guard (`lockedOr`, `src/lib/ownership.ts`; its Plaid twin in `src/server/plaid/commands.ts` also
    covers clear-review and account mapping) and answers `locked`: the web shows "Your account is being deleted,
    so changes are paused.", the API 423 `account_locked`. Clearing a budget that matched nothing is still `ok`
    unless the lock refused it. Tests: a lock-realistic fake in `ownership.test.ts` (reads succeed, inserts fail
    RLS, updates match 0 rows; the transaction edit runs the real `updateTransactionRow`), which fails with the
    check disabled, and a staging test that inserts an `account_deletions` row for a throwaway user and gets 423
    with nothing written for a goal edit, a transaction edit, a budget and a contribution (then cleans up; staging
    was left with no test users or locks).
