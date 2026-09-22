# CLAUDE.md — Budgts

Project instructions. They sit **under** the global `~/.claude/CLAUDE.md` and adapt it to this project.

## What this is

A **commercial budgeting app** ("Budgts"). **Supported surfaces: iOS and Android only** — a native Expo app
(`mobile/`) on the Next.js / Supabase backend. The user-facing web/PWA product is being retired and is not a supported
surface. Per-user accounts; no shared budgets in v1. Revenue is store-managed subscriptions with a 7-day free trial,
$9.99/month or $79.99/year (`docs/specs/2026-09-21-v1-monetization-design.md`, owner decision 2026-09-22).

**Web/server infrastructure is kept** (and is not removed just because the PWA is retired) wherever the native apps or
outside services depend on it: backend APIs (`/api/*`), the auth / OAuth callback (`/auth/callback`), Plaid webhooks and
its OAuth return page, the RevenueCat webhook and cron endpoints, `/manage-subscription`, the account-deletion path, and
the legal / privacy / support pages the stores require. Check what depends on a route before removing it. **Do not retire
the web UI yet:** only after the native apps cover all launch-required functionality and it has been tested successfully
(owner decision). Audit, retained routes and gate: `docs/specs/2026-09-21-mobile-only-transition-design.md`.

### The goal — read this before every decision

Budgts will be **sold** on the **Google Play Store and Apple App Store** to **500+ paying users**. Every decision is
judged against that, not against the owner's own accounts. 500 is a first target, not a ceiling — leave headroom
to exceed it without a rewrite.

- **Every account matters.** A fix must work for every user, bank, account type, time zone and locale.
  "Works on my accounts" is not done.
- **No silent failure states.** Held, excluded, stale or errored data is visible in the UI, with a way to resolve it.
- **Every state has a reachable exit.** Nothing may depend on "enough data eventually arriving".
- **Built for scale and cost:** paginated queries, Plaid per-item cost, sync throughput, rate limits, plan limits.
- **Production data belongs to customers.** Remediation needs exact affected rows, before/after totals, owner
  approval and an audit trail.

**Ingestion paths, in priority order:** (1) Plaid bank connect — primary, live · (2) manual entry — always-available
fallback · (3) email purchase-notification parsing (V2) · (4) receipt photo → parse (V2).

**v1 features:** categories + spend tracking · budgets vs actual · recurring / bills · savings goals. One currency
per user, chosen at signup.

## Environments and safety

| | Production | Staging (the only one) |
| --- | --- | --- |
| Supabase | `wsmhstqpvbbcqpqhiqyp` | `Budgets-Staging-3` `uvowywszaiojboaxdmoz` (org *Budgts Validation*) |
| Vercel | `budgts` — a push to `main` deploys it | `budgts-staging` |
| Plaid / billing | Plaid live; billing not configured | Plaid Sandbox; RevenueCat sandbox |

- **Production changes need explicit owner approval:** migrations, deploys, env vars, Supabase, RevenueCat
  config, store products. Never delete or modify the production Supabase project.
- `tools/db/target-safety.ts` is the registry of known projects; it refuses retired or deleted ones. Earlier staging
  projects are gone — never reference or restore them.
- Integration tests run against staging only (`npm run test:integration` refuses any other ref).
- How Claude works with the owner (autonomy, owner-gated actions, commits and branch pushes, the notice Claude gives
  before editing any `.md` file): `docs/workflow.md`.
  A push to `main` deploys production, so it is owner-gated.

## Stack

| Concern | Choice |
| --- | --- |
| Server / web layer | Next.js 16 (App Router) + TypeScript + React: backend APIs, auth callbacks, webhooks, remaining web pages. The web/PWA UI is being retired (not a supported surface) |
| Native app | Expo / React Native in `mobile/` (own `package.json`, EAS Build); Bearer-token `/api/mobile/*`; see `mobile/README.md` |
| Hosting | Vercel (Hobby — non-commercial, **must upgrade before selling**); Supabase Free/Nano. Both upgrades are deferred to a launch-readiness milestone (`docs/roadmap.md`, Scale & Infrastructure) |
| Data / auth | Supabase Postgres + Auth; RLS on **every** table, scoped to `auth.uid()` — the enforcement, not a backstop |
| DB access | `supabase-js` with the user's session for user requests; Drizzle for migrations and schema; a direct server connection only for trusted server work (see Conventions) |
| Bank data | Plaid |
| Subscriptions | Apple / Google via RevenueCat, confined to the provider boundary (`src/lib/billing/revenuecat/`, `mobile/lib/billing/`); server-authoritative entitlement in `src/lib/billing/`. No web billing in V1. 7-day trial, $9.99/month, $79.99/year (owner decision 2026-09-22); no Budgts-generated trial-end reminder |
| Scheduling | Supabase `pg_cron` + `pg_net` calling the app's cron endpoints (`supabase/*.sql`, run by hand once per environment; not migrations) |
| Validation / forms / charts | Zod (shared client + server) · React Hook Form · Recharts (consult the `dataviz` skill before building a chart) |
| AI (V2) | Claude API, `claude-sonnet-5` (consult the `claude-api` skill) |
| Testing | Vitest + React Testing Library, Playwright |

## Repo layout

```
docs/          conventions.md (feature layer order + ingestion contract) · roadmap.md (what's next)
               workflow.md (how Claude and the owner work) · security.md · deploy.md · BRAND_GUIDELINES.md
               Thirdparties.md (every outside service) · operations/ (database-migrations, staging-replacement)
               specs/ (YYYY-MM-DD-<topic>-design.md) · superpowers/plans/ (historical, not living)
src/app/       api/{account,billing,mobile,plaid,export}, auth/callback, plaid-oauth, manage-subscription, (legal) pages,
               .well-known/*, app/plaid-oauth (kept); (app) (auth) web UI screens (being retired — no new features)
src/lib/       db/ budget/ categories/ accounts/ validation/ (pure, tested) · ingestion/ plaid/
               account/ (deleteAccount) · billing/ (entitlement, RevenueCat adapter, ledger) · auth/ mobile/ supabase/
src/server/    server actions
mobile/        Expo app
supabase/      migrations/ 0000–0022 · billing-cron.sql, staging-plaid-cron.sql (per-environment, by hand)
tools/db/      migrate preflight, history verifier, target registry
tests/         unit/ (incl. migration chain on embedded Postgres) · integration/ (staging only) · e2e/ (Playwright)
```

## Next.js 16 — read the bundled docs first

Next 16 has breaking changes vs. older training data (see `AGENTS.md`). Before writing any route, server action,
`cookies()` / `headers()` call, `metadata` / `viewport` export, middleware or `next.config` change, read the relevant
guide under `node_modules/next/dist/docs/`. Do not assume the Next 13–15 API.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `lint` / `typecheck` | Dev server · production build (must pass in CI) · ESLint · `tsc` |
| `npm test` | Vitest unit + component (`npm --prefix mobile test` for the app) |
| `npm run test:integration` | Real-Postgres suites — **Budgets-Staging-3 only**; loads `.env.staging` |
| `npm run test:plaid` | Plaid sandbox-backed suites |
| `npm run test:e2e` | Playwright; point `PLAYWRIGHT_BASE_URL` at staging, never production |
| `npm run db:generate` | Emit a SQL migration from `schema.ts` changes |
| `npm run db:migrate` | Apply migrations via `DIRECT_URL`; the preflight requires `MIGRATE_CONFIRM_REF=<target ref>` |
| `npm run db:verify-history` | Read-only: does the target's migration ledger match the repo files? |

## Environment variables

Names only. Values live in `.env.local` / `.env.staging` (git-ignored) and Vercel project settings; production and
staging use **separate** secrets. Never commit secrets; keep `.env.local.example` in sync.

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only),
  `NEXT_PUBLIC_SITE_URL`
- **Database:** `DATABASE_URL` (transaction pooler :6543 — runtime), `DIRECT_URL` (:5432 — `db:migrate`)
- **Plaid:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_TOKEN_ENC_KEY`, `PLAID_OAUTH_REDIRECT_URI`,
  `NEXT_PUBLIC_PLAID_ENABLED`, `PLAID_TEST_SEED_ENABLED` (staging only)
- **Cron:** `CRON_SECRET`
- **Billing:** `REVENUECAT_WEBHOOK_SIGNING_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`,
  `BILLING_ENVIRONMENT` (`sandbox` on staging; events from the other environment are quarantined)
- **Native links / support:** `APPLE_APP_ID` (`<TEAMID>.<bundle id>`), `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` (each unset =
  its `/.well-known/*` route answers 404), `SUPPORT_EMAIL` (shown on `/support`)
- **Mobile** (`mobile/.env` / EAS): `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- **V2:** `ANTHROPIC_API_KEY`

## Conventions

- **Money is integer minor units** (cents) end to end; format only at the UI edge. Never use floats.
- **RLS is the isolation guard.** User requests go through the user's `supabase` client and set `user_id` explicitly on
  inserts. The only exception is trusted server work that is not a user request — Plaid engines, account deletion,
  billing (webhook, cron, reconcile). It uses the direct connection (`DATABASE_URL`, bypasses RLS), takes the user id
  from a verified identity or provider payload (never request input), and stays behind the store modules
  (`src/lib/billing/db.ts`, `src/lib/account/deletion-store.ts`, `src/lib/plaid/*-store.ts`).
- **Native data goes through Bearer route handlers over shared domain services.** The device uses Supabase for auth only and
  never reads or writes data tables directly. Each mutation's logic lives once in `src/lib/<area>/`; the web Server Action and the
  `/api/mobile/*` route are thin adapters over it. Plaid, billing and deletion stay server-side. Spec:
  `docs/specs/2026-09-21-mobile-only-transition-design.md` §4A.
- **TDD.** Domain logic and adapters get failing unit tests first (`superpowers:test-driven-development`).
- **Layer order** for a feature — schema + migration → Zod → domain → server action → UI → e2e — and the
  **ingestion-adapter contract** (one interface, shared `landTransaction()`) are in `docs/conventions.md`.
- **Spend/income exclude transfers and unconfirmed rows.** A refund is a `credit` in an expense category and nets
  against that category's spend.
- **Dates:** timestamps in UTC; `budgets.month` is the first day of the month as a `date`.
- **Third parties live in `docs/Thirdparties.md`.** Adding, removing or replacing an outside service (SaaS, API,
  hosting, store account, vendor SDK) updates it in the same change; a planned one goes under "Planned".
- **Migrations** follow `docs/operations/database-migrations.md`: a committed file per schema change, applied only by
  `npm run db:migrate`, never hand-run, hand-stamped or skipped; a deployed migration is immutable. Cron/extension
  setup (`supabase/*.sql`) is configuration, not a migration.
- **Access is decided in one place.** `hasPremium(entitlement, now)` is the only premium decision and never trusts a
  stored state past `accessUntil`. Only the RevenueCat webhook and reconcile/refresh paths write an entitlement, through
  the pure reducer. A trial is never ledgered; a real charge always is.
- **Account deletion has two paths and never guesses** (`deleteAccount`, `src/lib/account/`): no ledger history →
  Path A, hard delete; any confirmed charge (local ledger **or** reported by the billing provider) → Path B, anonymize
  and keep the immutable ledger. Fails closed, never blocks on the billing check, and tells the user deletion does not
  cancel an App Store / Google Play subscription. Spec: `docs/specs/2026-09-19-account-deletion-design.md`.
- **Integration tests are environment-independent:** no assumed cascade/lock order, and no assumption that the local
  clock is at least the database's (`dbNow()` in `tests/integration/_db.ts`).
- **Branches:** `phase-N/<short-topic>`; native work `mobile/<topic>`. Conventional-ish commit subjects.

## Definition of done (a slice/feature)

1. Schema change + migration (RLS included), applied and reversible.
2. Domain logic unit-tested, tests first.
3. Zod validation on every input; no raw 500 reaches the user.
4. Component tests for stateful UI.
5. One Playwright e2e for the happy path.
6. `lint`, `typecheck`, `test`, `build` green.
7. The relevant doc updated if anything surprised us.
8. Works for **every** user and account; every state has a reachable exit; nothing fails silently.

## Current state

Direction and priority live in `docs/roadmap.md`; this is a snapshot.

- **Live in production (`main`, https://budgts.com), served today by the web app being retired:** core budgeting, savings goals, UI redesign v2 and the robin /
  "Budgts" rebrand (`docs/BRAND_GUIDELINES.md`), Plaid ingestion with the V1.5 detectors (recurring, subscription, bill,
  paired transfer).
- **On branch `mobile/native-home` (PR #1, draft) — not on `main`, nothing deployed:** native Home, mobile auth and Sign in
  with Apple; the signed-in shell (Get Started, Settings, paywall, delete account); the native data API (transactions, accounts,
  categories, budgets); account deletion (migrations 0017–0020); V1 monetization — ledger (0021), `entitlements` +
  `billing_events` (0022), RevenueCat adapter, trial / purchase / restore, Manage Subscription (7-day trial, $9.99/mo,
  $79.99/yr, no Budgts-generated reminder — owner decision 2026-09-22); and the draft
  privacy / terms / support / deletion pages. Server side verified on staging; native screens not yet run on a device. Native
  screens for transactions, budgets and accounts, and native Plaid, are next.
- **Removed from the release path:** the first-run tour and "How Budgts Works" guide (`7468365`); `/onboarding` is now
  only the currency form. The old versions live on local `archive/*` branches. **Approved direction:** a *Get Started*
  flow with an optional *Show me around* walkthrough — not started; it uses `useMonetization()` and needs no provider
  knowledge.
- **Not done (owner / release work):** migrations 0017–0022 and the deploy on production; RevenueCat store products
  (project itself created 2026-09-22; webhooks need its Pro plan) and the Apple / Google products — Google Play
  developer enrollment exists (personal account, identity verification pending), Apple not enrolled; developer
  enrolment and store submission; Vercel upgrade (Hobby is non-commercial), and Supabase as data grows.
- **Next:** external monetization setup, then production release preparation (owner-approved), then store submission.
  V2 (email / receipt ingestion, spending intelligence) and V2+ (AI assistant) come after launch.

## Relationship to the WAT framework

The global WAT pipeline (workflows → agents → tools pushing to cloud docs) does not literally apply: this is a real
application with its own UI. Its **spirit** does: deterministic typed, tested code does execution and AI is used only
for genuinely unstructured input (V2 email / receipts); repeatable rules live in short docs (`docs/conventions.md`,
`docs/specs/`, `docs/roadmap.md`), not project skills (a real skill would go in `./.claude/skills/`, never the global
one); and on a failure, fix the code → verify → update the doc so it does not recur.
