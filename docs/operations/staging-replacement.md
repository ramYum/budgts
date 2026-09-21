# Runbook — replacing the staging Supabase project

Use when staging must be rebuilt from an empty database (drifted ledger, or a new schema block such as the
monetization migrations `0021`/`0022`). The whole point is **build the new project, prove it, and only then delete the
old one** — never the reverse. Production (`wsmhstqpvbbcqpqhiqyp`) is never touched by any step here.

> Status at the time of writing: **step 1 is blocked.** The Management API token in `.env.staging` is project-scoped
> (it can see only the current staging project) and `POST /v1/projects` returns `403`. It is an access limit, not a
> paid-plan wall. The new project must be created by the owner in the Supabase dashboard (or a broader token supplied).

## 0. Safety rules (every step)

- Print, and compare before acting: old staging name + ref, new staging name + ref, and the production ref. Stop if any
  is ambiguous or if a target equals `wsmhstqpvbbcqpqhiqyp`.
- Nothing here needs a paid upgrade. If creating the project reveals one, stop and ask the owner.
- Migrations only through `npm run db:migrate` (rules in `database-migrations.md`): no hand-run SQL, no hand-stamped
  ledger rows, no skipped migrations.

## 1. Create the project (owner)

Supabase dashboard → New project, Free plan. Suggested name `Budgts-Staging-3`, region matching the current staging.
Record: project ref, DB password, the pooled `DATABASE_URL` (6543) and session/direct `DIRECT_URL` (5432), the
`sb_publishable_…` and `sb_secret_…` keys. Put them in `.env.staging` (git-ignored); keep the old values commented out
until the old project is deleted.

## 2. Register the ref, then migrate from empty

1. Add the new ref to `tools/db/target-safety.ts` as `staging` and update `STAGING_REF` in `tests/integration/_db.ts`.
2. `npm run db:migrate` against the new `DIRECT_URL`. Expect `0000` → `0022` all applied, in order.
3. `npm run db:verify-history` — every migration file has a matching ledger row; nothing extra.

## 3. Configure

**Supabase Auth** (dashboard → Authentication):
- Site URL = the staging site URL. Redirect allow-list: the staging site callback and the mobile deep link
  `budgts://auth/callback`.
- Providers: Email (magic link) on; Google on **only if** the Google OAuth client lists the new project's callback
  (`https://<new-ref>.supabase.co/auth/v1/callback`) — that is a Google Cloud console change by the owner.

**Vercel `budgts-staging` only** (never the production project): `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, the RevenueCat staging values
(`REVENUECAT_*`, `BILLING_ENVIRONMENT=sandbox`), and for reminder email a **staging** `RESEND_API_KEY`, `EMAIL_FROM` and a
**non-empty `REMINDER_EMAIL_ALLOWLIST`**. Existing Plaid sandbox values stay. Redeploy.

**Plaid sandbox:** webhook and redirect URIs point at the staging site (unchanged host, so normally nothing to do —
confirm).

**Cron:** `plaid-sync-due` (existing staging SQL), and `supabase/billing-cron.sql` for billing reconciliation and the
trial-reminder sweep. Run it through the SQL editor only because it schedules `pg_cron` jobs; it changes no schema.

**Test users:** recreate only the e2e/integration users the suites need.

## 4. Verify (all against the NEW project)

| Check | How |
| --- | --- |
| Fresh migration chain | `npx vitest run tests/unit/db-migration-chain.test.ts` |
| Web / mobile / monetization unit | `npm test`; `npm --prefix mobile test` |
| Staging integration incl. concurrency | `npm run test:integration` (includes `billing-concurrency.test.ts`: reminder-claim race, multi-worker sweeps, duplicate webhooks, same-transaction-id, mixed ordering) |
| Auth, magic link, mobile Bearer, native Home | `mobile-auth`, `mobile-home` integration tests + a manual magic-link sign-in |
| Plaid sandbox | connect → sync → disconnect; deletion Path A and Path B; stale-JWT lock |
| Entitlement + webhook | signed RevenueCat fixture webhooks against the staging URL; `GET /api/billing/entitlement`; reconcile cron |
| Reminder cron | `GET /api/billing/reminders/due` with the cron bearer; allowlist prevents real recipients |
| Trial-only deletion = Path A; paid-history = Path B | integration tests + one manual walk-through |
| Playwright | `npm run test:e2e` pointed at staging |

Do not proceed until everything is green. Any red item: fix forward and re-run; the old project stays untouched.

## 5. Delete the old project (owner-confirmed, last)

1. Re-print old name/ref, new name/ref, production ref. Confirm old ≠ new ≠ production.
2. Confirm the old project holds nothing that is not reproducible (the owner has already confirmed its five non-test
   accounts need no preservation).
3. Delete the **old** project in the Supabase dashboard.
4. Re-run the smoke checks against the new project and confirm production is untouched (the production ref still
   appears in Vercel production env and the site still serves).
5. Remove the old ref/credentials from `.env.staging`, `target-safety.ts`, and any docs; note the replacement in
   `database-migrations.md`.
