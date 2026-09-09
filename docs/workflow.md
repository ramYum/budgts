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

Legend: ✅ done · 🔄 in progress · ⏳ planned

---

## 2. Product — locked decisions

| Area | Decision |
| --- | --- |
| Shape now | Installable **PWA** (Next.js). One codebase, phone + desktop. |
| Shape later | **Phase 6:** native iOS + Android via **Expo/React Native** for App Store + Play Store. Domain logic (`src/lib/budget/*`, `src/lib/validation/*`) and the Supabase backend carry over unchanged; the Next.js frontend is rebuilt. |
| Users | Single user per account. "Add another income source" = another income transaction/category, not multi-user. Household sharing: deferred, not planned. |
| Persistence | Supabase (Postgres + Auth + Realtime + Storage). Cloud, multi-device. |
| Data access | `supabase-js` with the user's session for **all** reads/writes — RLS is the isolation guard. Drizzle = migrations only. |
| Auth | Magic link + Google OAuth. No password. |
| Currency | One per user, picked at onboarding. Restricted to **2-decimal** currencies (the money layer hardcodes a 2-decimal exponent; guarded by a test). |
| Money | Integer **minor units** end to end. Format only at the display edge. |
| Categories | Seeded by trigger (migration 0002): **Insurances, Personal Care, Housing, Entertainment, Transportation, Food / Groceries** (expense); Salary, Other Income. Editable in Settings — rename, recolour, add, archive. Budgets are per category; the bill/merchant goes in the transaction description. Tapping a category name opens its transactions. |
| Transfers | `is_transfer` flag (manual toggle in v1). Excluded from every rollup. Paired linking to Phase 2. |
| Refunds | A `credit` in the original expense category. Nets against that category's spend. No special type. |
| Budget rollover | **None.** A month's budget never carries forward — next month starts at whatever you set. Unspent budget simply raises that month's Net savings. |
| Savings | **Two separate things, both shown.** *Net savings* = derived per month (`income − spend`), a dashboard tile in 1d. *Savings goals* = named targets with progress, own table, Phase 2. |
| Ingestion sources | 1. Manual (done) · 2. Email purchase-notification parsing (Phase 3) · 3. Receipt photo (Phase 4) · 4. **Bank connect via Plaid** (Phase 5). All four go through one `IngestionAdapter` + `landTransaction()`. |
| v1 feature set | Categories + spend · budgets vs actual · recurring bills · savings goals. (Recurring + goals = Phase 2.) |


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
Budgeted) needs an **expected** monthly income; that arrives in **Phase 5** from
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

## 4. Roadmap beyond Phase 1

### Phase 2 — Recurring bills + savings goals

`recurring_rules` (cadence, next-due, generate-or-remind), upcoming/missed bills
on the dashboard; `savings_goals` (target, contributions, progress). Paired
transfer linking so both legs of a card payment reconcile.

### Phase 3 — Email ingestion

Per-user inbound address, provider webhook, `EmailAdapter`, Claude extraction,
`pending_review` queue with confirm/fix UI, dedupe on `Message-ID`. User docs
for enabling bank purchase alerts. Open: inbound-email provider, domain.

### Phase 4 — Receipt capture

Camera, upload to Supabase Storage, Claude vision parse, "which card/account?"
popup, transaction with the image attached.

### Phase 5 — Bank connect via **Plaid**

The cleanest automatic source: Plaid returns structured transactions with a
stable `transaction_id`, so there is nothing to parse and dedupe is exact.

**Flow.** Plaid Link (hosted UI) produces a `public_token`; the server exchanges
it for an `access_token`, stored per institution **server-side only and
encrypted at rest**. The cursor-based `/transactions/sync` endpoint pulls added,
modified and removed transactions; `PlaidAdapter.normalize()` maps each to a
`NormalizedTxn` with `source: 'bank'` and `sourceRef: transaction_id`, then
`landTransaction()` persists it. Plaid's `SYNC_UPDATES_AVAILABLE` webhook
triggers a pull, with a daily cron as backstop. Plaid accounts map onto our
`accounts` rows so the user sees familiar names.

**New tables** (both RLS-scoped; the access token never reaches the client):
`plaid_items` (item_id, institution, access_token, sync cursor, status) and
`plaid_accounts` (plaid account_id to our `accounts.id`).

**Nothing else changes.** `IngestionAdapter`, `landTransaction`, the
`(user_id, source, source_ref)` unique index and the transfer/refund rules were
designed for exactly this.

**Cost and friction.** Sandbox is free. Production needs a Plaid account plus a
short application, then roughly **$0.30–$1.50 per connected item per month** for
Transactions. Coverage is strong in US / CA / UK / EU. If an institution is
missing, TrueLayer / GoCardless / a regional aggregator drop into the same
adapter interface with no other change.

**Removals matter.** Plaid's sync reports deleted transactions; the adapter must
handle them (mark or remove) or the numbers silently drift.

**Recurring income.** Plaid's `/transactions/recurring/get` surfaces
`inflow_streams` — predicted paycheck amount, cadence and next date. This is the
"expected monthly income" the dashboard needs: self-maintaining, zero input. It
enables a real *Projected savings* tile (expected income − budgeted) and "your
paycheck didn't arrive" alerts, the mirror of missed-bill detection.

### Phase 6 — Native apps (App Store + Play Store)

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
| **Reorder Phase 3 vs Phase 5?** | owner | The sample spreadsheet is US (Wegmans, LVHN, Iron Pigs) where Plaid coverage is excellent. Plaid gives clean structured data; email parsing is lossy and fiddly. Consider **Plaid before email**. Trade-off: Plaid costs a few dollars/month and needs an application; email is free. |
| ~~Confirm Google provider enabled in Supabase~~ | done | **2026-09-08** — owner enabled the Google provider and confirmed the `http://localhost:3000/**` redirect URL. |
| Brand pass reaches a stopping point | owner | Then Claude commits it and resumes 1c.2 / 1d. |
| **CSV export / backup** | Claude | Missing from the plan and worth adding. Supabase free projects pause after 7 idle days; a one-click export is cheap insurance. Slot into 1e. |
| ~~Expected monthly income~~ | resolved | Income comes **from the bank** (Plaid, Phase 5). No manual field, no recurring-rule entry. Plaid's recurring-transactions endpoint yields the predicted paycheck amount + cadence, which feeds a real *Projected savings* tile in Phase 5. Until then, 1d tiles read "so far this month". |
| **CI workflow** | Claude | Gates are run by hand. Add GitHub Actions running lint/typecheck/test/build (+ e2e) in 1e. |
| **Security review before deploy** | Claude | Run `/security-review` in 1e — RLS policies, the service-key path, OAuth redirect allowlist. |
| ~~1c.2 vs fold into 1d~~ | done | Built as a standalone `/settings` screen after 1d. |
| ~~Git branch cleanup~~ | done | `main` fast-forwarded to `dbeea74`. Work continues on `phase-1/core-slice`; `main` is ff-merged at each checkpoint. |
| ~~Rotate the DB password / Google client secret~~ | done | Intentionally skipped for this personal project (owner's call, 2026-09-09). Not a pending task. |
| ~~Vercel project + deploy~~ | done | **2026-09-09** — `main` pushed, Vercel project live at `https://budgts.com` (custom domain via Cloudflare DNS), env vars + Supabase auth URLs set. See `docs/deploy.md` "Current deployment" + memory `deployment.md`. |
| Verify on real devices | owner | `deploy.md` step 5 — install the PWA on a phone, sign in via magic link + Google, add a transaction, confirm it syncs to a second device. Blocked on the `/sw.js` fix reaching prod for the install check. |
| Apple Developer + Google Play accounts | owner | Start enrollment before Phase 6; lead time is days. |
| Plaid account + Production application | owner | Only when Phase 5 starts; Sandbox needs nothing. |

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
  (`deploy.md` step 5).
