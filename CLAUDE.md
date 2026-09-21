# CLAUDE.md — Budget Tracking App

Project-local instructions. These sit **under** the global
`~/.claude/CLAUDE.md` but adapt it for this project (see "Relationship to the
WAT framework" below).

## What this project is

A **commercial budget tracking app** ("Budgts"). Live today as an installable
**PWA** (one codebase for phone + desktop) backed by the cloud, so data syncs
across a user's devices; a native iOS/Android app (Expo, `mobile/`) is being built on the
same backend for the app stores. Per-user accounts; no household/shared budgets in v1.
Revenue is store-managed subscriptions with a 14-day free trial (see the Roadmap and
`docs/specs/2026-09-21-v1-monetization-design.md`).

### The goal — read this before every decision

Budgts will be **sold**: released on the **Google Play Store and Apple App
Store** for **500+ paying users**. Every product and technical decision is
judged against that, not against the owner's own accounts. 500 is the
initial commercial target, not an architectural ceiling — decisions should
leave headroom to exceed it without a rewrite.

- **Every account matters.** A fix must work for every user, bank, account
  type, time zone and locale. The owner's data is only the first test set,
  so "works on my accounts" is not done.
- **No silent failure states.** Held, excluded, stale or errored data must
  be visible in the UI, with a way to resolve it.
- **Every state has a reachable exit.** Nothing may depend on "enough data
  eventually arriving", because a low-activity account never gets there.
- **Built for scale and cost:** paginated queries, Plaid per-item cost,
  sync throughput and rate limits, hosting and database plan limits.
- **Production data belongs to customers.** Remediation needs exact affected
  rows, before/after totals, owner approval, and an audit trail.

**Ingestion paths, in priority order:**

1. Bank connect via Plaid — the primary automatic path (live)
2. Manual entry — always-available fallback
3. Email purchase-notification parsing (V2)
4. Receipt photo → parse → user picks which card/account was used (V2)

**v1 feature set:** categories + spend tracking · budgets vs actual · recurring
/ bills tracking · savings goals. Single currency per user, chosen at signup.

## Relationship to the WAT framework

The global framework describes **Workflows → Agents → Tools** automation
pipelines that dump deliverables into cloud services (Sheets, Slides). This
project is a **real application with its own UI**, so that pipeline structure
does *not* literally apply here — there is no `tools/*.py` pushing to a Sheet.

What carries over is the **spirit**:

- **Deterministic code does execution; AI does reasoning.** Domain logic,
  money math, migrations, and validation are plain typed code with tests. AI
  (Claude API) is used only where the input is genuinely unstructured — parsing
  email notifications and receipt images (V2).
- **Short SOP-style docs.** Repeatable workflows and rules live in
  `docs/conventions.md`; specs in `docs/specs/`; the build order in
  `docs/roadmap.md`. (No project-specific "skills" — per
  `superpowers:writing-skills`, project conventions belong in docs like these.)
  If a real skill is ever warranted, it goes in `./.claude/skills/` in **this
  repo only** — never the global `~/.claude/skills/`.
- **Self-improvement loop.** On a failure: fix the code → verify → update the
  relevant doc so it does not recur.

## Stack

| Concern | Choice |
| --- | --- |
| App framework | Next.js (App Router) + TypeScript + React |
| Hosting | Vercel. Supabase is currently on the Free/Nano tier (500MB DB, pauses after 7 idle days) and Vercel is on Hobby — both deliberately deferred to a launch-readiness milestone, not an oversight. Upgrade trigger: Supabase DB size approaching its 500MB cap, or a concrete dev/prod limitation, whichever comes first. **Hobby's terms are non-commercial, so Vercel must be upgraded before Budgts is sold** (`docs/roadmap.md`, Scale & Infrastructure). |
| Environments | **Production:** Supabase `wsmhstqpvbbcqpqhiqyp` + Vercel project `budgts` (a push to `main` deploys it). **Staging (the only one):** Supabase `Budgets-Staging-3` `uvowywszaiojboaxdmoz` (org *Budgts Validation*) + Vercel project `budgts-staging`, Plaid Sandbox, RevenueCat sandbox. Earlier staging projects are retired/deleted; `tools/db/target-safety.ts` is the registry and refuses them. |
| PWA | web app manifest + service worker (app-shell caching) |
| Native app | Expo / React Native in `mobile/` (own `package.json`, EAS Build). Native Home is backed by `/api/mobile/*` with a Bearer token; see `mobile/README.md` |
| Bank data | Plaid — live in production, Sandbox in staging |
| Subscriptions | Store-managed (Apple / Google) through RevenueCat, kept at the provider boundary only (`src/lib/billing/revenuecat/`, `mobile/lib/billing/`); server-authoritative entitlement in `src/lib/billing/`. No web billing in V1. Design: `docs/specs/2026-09-21-v1-monetization-design.md` |
| Email | Resend (transactional trial-end reminder) behind the neutral `ReminderDelivery` port — adapter built, **not live** (no account or verified domain yet) |
| Scheduling | Supabase `pg_cron` + `pg_net` calling the app's cron endpoints (`supabase/*.sql`, run by hand once per environment; not migrations) |
| Data / auth / storage / realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| DB access | `supabase-js` with the user's session for all user-request reads/writes (RLS enforces isolation); Drizzle for **migrations and schema**. Trusted server-only paths (Plaid engines, account deletion, billing) use a direct server connection — see Conventions |
| Security | Row-Level Security on **every** table, scoped to `auth.uid()` — the enforcement, not a backstop |
| Validation | Zod schemas shared client + server |
| Forms | React Hook Form |
| Charts | Recharts (consult the `dataviz` skill before building any chart) |
| AI extraction (V2) | Claude API — `claude-sonnet-5`, vision for receipts (consult the `claude-api` skill) |
| Testing | Vitest + React Testing Library (unit/component), Playwright (e2e) |

## Repo layout

```
CLAUDE.md  AGENTS.md  README.md
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs
vitest.config.mts  vitest.integration.config.mts  vitest.plaid.config.mts
playwright.config.ts  drizzle.config.ts  .env.local.example  .nvmrc
docs/
  conventions.md          # layer order for a feature + ingestion-adapter contract
  roadmap.md              # tier ladder / what is next
  workflow.md             # execution tracker (dated, append-only history)
  security.md  deploy.md  BRAND_GUIDELINES.md
  Thirdparties.md         # every outside service: active, planned, ruled out
  operations/             # database-migrations.md (migration policy), staging-replacement.md
  specs/                  # YYYY-MM-DD-<topic>-design.md (deletion, monetization, mobile launch, ...)
  superpowers/plans/      # historical implementation plans (not living docs)
src/
  app/                    # Next.js routes: (app)/(auth) UI, api/{account,billing,mobile,plaid,export}, manage-subscription
  components/
  lib/
    db/                   # Drizzle schema + client
    budget/  categories/  accounts/  validation/   # pure domain logic + Zod (tested)
    ingestion/  plaid/    # IngestionAdapter + landTransaction(); Plaid sync/detection engines
    account/              # deleteAccount (Path A / Path B), deletion store
    billing/              # entitlement domain, reducer, RevenueCat adapter, ledger writer, reminders, Resend adapter
    auth/  mobile/  supabase/
  server/                 # server actions
mobile/                   # Expo app (own package.json + README)
supabase/
  migrations/             # SQL migrations 0000-0022 (tables, RLS, guards, ledger, entitlements)
  billing-cron.sql  staging-plaid-cron.sql   # pg_cron job templates (per environment, by hand)
tools/                    # db/ (migrate preflight, history verifier, target registry) + dev scripts
tests/
  unit/                   # Vitest specs that don't sit next to source (incl. migration-chain test on embedded Postgres)
  integration/            # real-Postgres suites against STAGING only (`npm run test:integration`)
  e2e/                    # Playwright
```

## Next.js 16 — read the bundled docs before writing app code

This project runs **Next.js 16**, which has breaking changes vs. older training
data (see `AGENTS.md`, which `next dev` regenerates). Before implementing any
route, server action, `cookies()` / `headers()` call, `metadata`/`viewport`
export, middleware, or `next.config` change, read the relevant guide under
`node_modules/next/dist/docs/`. Do not assume the Next 13–15 API.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (must pass in CI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest — unit + component |
| `npm run test:integration` | Real-Postgres integration suites — **Budgets-Staging-3 only** (the harness refuses any other ref); loads `.env.staging` |
| `npm run test:plaid` | Plaid sandbox-backed suites |
| `npm run test:e2e` | Playwright e2e (against a running app; point `PLAYWRIGHT_BASE_URL` at staging, never production) |
| `npm run db:generate` | Drizzle: emit a SQL migration from `schema.ts` changes |
| `npm run db:migrate` | Apply migrations (uses `DIRECT_URL`, non-pooled). A preflight refuses to run without `MIGRATE_CONFIRM_REF=<the target's project ref>` |
| `npm run db:verify-history` | Read-only: does the target's migration ledger match the repo files? |

## Environment variables

Names only. Real values live in `.env.local` / `.env.staging` (both git-ignored) and in the Vercel
project settings. Never commit secrets. Keep `.env.local.example` in sync. Production and staging use **separate**
values for every secret.

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`, client-safe),
  `SUPABASE_SECRET_KEY` (`sb_secret_…`, server only), `NEXT_PUBLIC_SITE_URL` (magic-link / OAuth callbacks)
- Database: `DATABASE_URL` (transaction pooler, port 6543 — runtime; Drizzle generate), `DIRECT_URL` (session pooler / direct,
  port 5432 — `db:migrate`)
- Plaid: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_TOKEN_ENC_KEY`, `PLAID_OAUTH_REDIRECT_URI`,
  `NEXT_PUBLIC_PLAID_ENABLED`, `PLAID_TEST_SEED_ENABLED` (staging only)
- Cron: `CRON_SECRET` (bearer for `/api/plaid/sync-due` and the `/api/billing/*/due` jobs)
- Billing (server only): `REVENUECAT_WEBHOOK_SIGNING_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`,
  `BILLING_ENVIRONMENT` (`sandbox` on staging; a deployment quarantines events from the other environment)
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `REMINDER_EMAIL_ALLOWLIST` (non-empty on staging so it can never email a customer)
- Mobile (public SDK keys, in `mobile/.env` / EAS, not here): `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- V2: `ANTHROPIC_API_KEY` (email / receipt ingestion only)

## Conventions

- **Money is integer minor units** (e.g. cents) end to end. Convert to a
  display string only at the UI edge. Never store or compute with floats.
- **Every table has RLS** scoped to the owner. All request-time DB access goes
  through the user's `supabase` client, so RLS *is* the isolation guard. Set
  `user_id` explicitly on inserts (RLS `WITH CHECK`). The one exception is **trusted server-only work that is not a user request**: the Plaid sync / detection engines, account deletion, and billing (RevenueCat webhook, cron, reconcile). Those use a direct server connection (`DATABASE_URL`, which bypasses RLS) and must take the user id from a verified identity or a verified provider payload — never from request input — and stay behind the `Db` port / store modules (`src/lib/billing/db.ts`, `src/lib/account/deletion-store.ts`, `src/lib/plaid/*-store.ts`).
- **TDD.** Domain logic in `src/lib/budget/` and adapters get failing unit
  tests first (`superpowers:test-driven-development`).
- **Feature work follows the layer order in `docs/conventions.md`** — schema +
  migration → Zod → domain logic → server action → UI → e2e. Read it before
  starting a feature.
- **New transaction sources follow the ingestion-adapter contract in
  `docs/conventions.md`** — implement one interface, call the shared
  `landTransaction()`.
- **Spend/income exclude transfers and unconfirmed rows.** `is_transfer` rows
  never count; a refund is a `credit` in an expense category and nets against
  that category's spend.
- **Dates:** store timestamps in UTC; `budgets.month` is the first day of the
  month as a `date`.
- **Third parties are tracked in `docs/Thirdparties.md`.** Whenever a change
  adds, removes or replaces an outside service (SaaS, API, hosting, store
  account, SDK that talks to a vendor), update that file in the same change.
  When a doc or spec starts planning a new one, add it under "Planned".
- **Migrations follow `docs/operations/database-migrations.md`:** a committed file for every schema change, applied only by
  `npm run db:migrate` (with the preflight ref confirmation), never hand-run, hand-stamped or skipped; a deployed migration is
  immutable. Cron/extension setup (`supabase/*.sql`) is configuration, not a migration.
- **Access is decided in one place.** `hasPremium(entitlement, now)` in `src/lib/billing/` is the only premium decision and
  never trusts a stored state past `accessUntil`. Only the RevenueCat webhook and the reconcile/refresh paths write an
  entitlement, and only through the pure reducer. A trial is never ledgered (no `payments` row); a real charge always is.
- **Account deletion has two paths and never guesses.** `deleteAccount` (`src/lib/account/`): no monetization-ledger history →
  Path A, hard delete; any confirmed charge (local ledger **or** as reported by the billing provider) → Path B, anonymize and
  keep the immutable ledger. It fails closed, never blocks on the billing check, and tells the user that deleting the account
  does not cancel an App Store / Google Play subscription. Spec: `docs/specs/2026-09-19-account-deletion-design.md`.
- **Integration tests are staging-only and environment-independent.** They must not assume a cascade/lock order or that the
  local clock is at least the database's (`dbNow()` in `tests/integration/_db.ts`), and never touch production.
- **Branches:** `phase-N/<short-topic>` (native/mobile work: `mobile/<topic>`). Conventional-ish commit subjects.
  Commit or push only when the user asks. **A push to `main` deploys production.**

## Definition of done (a slice/feature)

1. Schema change + migration (RLS policy included) applied and reversible.
2. Domain logic unit-tested (tests written first).
3. Zod validation on every input; no raw 500 reaches the user.
4. Component tests for stateful UI.
5. One Playwright e2e covering the happy path end to end.
6. `lint`, `typecheck`, `test`, `build` green.
7. The relevant doc updated if anything surprised us.
8. Works for **every** user and account, not just the owner's data. Every
   state has a reachable exit, and nothing fails silently (see "The goal"
   above).

## Roadmap

See `docs/roadmap.md` (tier ladder) and `docs/workflow.md` (execution tracker).

**Live in production (`main`, https://budgts.com):** Phase 1 core budgeting, Phase 2a savings goals, the UI redesign v2 and
the robin / "Budgts" rebrand (Home-first, Money-Left-led; visual source of truth `docs/BRAND_GUIDELINES.md`), and **Plaid
ingestion with the V1.5 detectors** (recurring, subscription, bill, paired-transfer). Manual entry stays as the fallback.

**On branch `mobile/native-home` (PR #1, draft) — NOT on `main`; nothing here is deployed to production:**
- the first real native Home (`/api/mobile/home`) and mobile auth (Bearer session, `budgts://auth/callback`);
- **account deletion** (Path A / Path B, database-side write guard, FK indexes, deadlock / plan-cache hardening; migrations
  0017–0020);
- **V1 monetization** — the full monetization ledger (0021) plus `entitlements` and `billing_events` (0022), the
  provider-neutral entitlement domain, the RevenueCat adapter, server-authoritative trial / purchase / restore, the trial-end
  reminder (Resend adapter, cron-driven), Manage Subscription (Settings, `/manage-subscription`, the deletion flow), and deletion
  that consults the billing provider. Verified end to end on staging (`Budgets-Staging-3`); see
  `docs/specs/2026-09-21-v1-monetization-design.md`.

**Removed from the release path:** the first-run tour and the "How Budgts Works" guide (commit `7468365`; the old card wizard is
gone too). `/onboarding` is now only the currency form and lands on Home. The pre-removal state lives on the local archive
branches `archive/native-home-with-claude-tour` and `archive/claude-tour-redesign`; `profiles.tour_seen_at` (0014) remains
for a replacement tour, which is separate work that has not started.

**Not done yet (owner / release work):** applying migrations 0017–0022 to production and deploying; a RevenueCat project
(webhooks need its Pro plan — free until $2,500 monthly tracked revenue) and the Apple / Google subscription products; a Resend
account with a verified sending domain (DNS records are the owner's); Apple / Google developer enrolment and store submission;
a Vercel plan upgrade (Hobby is non-commercial) and, as data grows, Supabase.

**Next:** production release preparation (owner-approved), then store submission. V2 (email / receipt ingestion + spending
intelligence) and V2+ (AI assistant) are post-launch possibilities. Native apps are a parallel delivery track, not a numbered phase.
