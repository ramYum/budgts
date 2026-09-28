# Deploying Budgts

The app is a standard Next.js 16 project; Vercel builds it with no config.
Steps you (the owner) do — Claude can't create the accounts or push to a remote.

## Current deployment (live)

- **Canonical URL:** `https://budgts.com` (apex). `https://www.budgts.com`
  308-redirects to it. `https://budgts.vercel.app` also still serves.
- **Vercel:** team `tocino` (Hobby) / `crispyphata-5876`, project `budgts`,
  deploys from `main` (`ramYum/budgts`).
- **Function region:** `cle1` (Cleveland), set in `vercel.json`: the same
  AWS region (`us-east-2`) as the production Supabase database, so every
  server-side query stays in-region (Vercel's default is `iad1`). Hobby allows
  one region; move it if the database ever moves.
- **Domain DNS:** `budgts.com` is registered + DNS-hosted at Cloudflare.
  Two records, both **DNS-only (grey cloud)**:
  `CNAME @ → 20b64e226c444eb2.vercel-dns-017.com` and
  `CNAME www → 20b64e226c444eb2.vercel-dns-017.com`.
- The section below is the original from-scratch runbook; `<your-vercel-domain>`
  now means `budgts.com`.
- **2026-09-11 — V1 promoted to production.** `main` fast-forwarded to
  `v1-plaid-beta`'s tip (`ae92716`) after full staging acceptance; migration
  `0004` applied to prod Supabase; `DATABASE_URL` added to prod Vercel env
  (newly required — see §3). `NEXT_PUBLIC_PLAID_ENABLED` shipped with this
  promotion still off, pending Plaid Production access (Milestone 10).
- **Update (2026-09-14) — Milestone 10 done, Plaid UI is live in prod.** The
  flag was turned on in the Vercel dashboard at some point after the
  promotion above, with no corresponding commit or doc update at the time.
  Confirmed by querying the production `plaid_items` table directly: 3 real
  connections (Capital One, SoFi, Advancial Federal Credit Union), all
  connected 2026-09-11, syncing live. The rest of this file's "Plaid" section
  describes the earlier off-state and staging setup — read it as history for
  how it got turned on, not as prod's current state. See `docs/workflow.md`
  §1/§4 and memory `plaid-live-in-production.md`.

## 1. Push the repo to GitHub

```bash
git remote add origin https://github.com/<you>/budgts.git
git push -u origin main
```

CI (`.github/workflows/ci.yml`) then runs lint / typecheck / test / build on
every push and PR.

## 2. Import to Vercel

- vercel.com → New Project → import the GitHub repo. Framework auto-detected.
- Build command, output dir: leave as detected. Node 24.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Set for **Production**. Preview gets the staging project's public values
instead, never production's (see "Preview deployments" below):

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wsmhstqpvbbcqpqhiqyp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |
| `NEXT_PUBLIC_SITE_URL` | `https://budgts.com` (Production only) |
| `DATABASE_URL` | prod **transaction** pooler (port 6543): read at runtime by the Plaid pipeline (see below) |

**Only a production build needs secrets.** The Drizzle client (`db()` in
`src/lib/db/index.ts`) is created on first use, like `plaidClient()`, and
Plaid's settings are read on first use (`loadPlaidConfig()`). So `next build`,
whose "Collecting page data" step imports every route module, passes with no
`DATABASE_URL` or Plaid secret, which is what lets CI and Vercel Preview
builds succeed. Until 2026-09-27 the client was created at import, and every
build without `DATABASE_URL` failed: CI on every push to `main` (since at
least 2026-09-14) and every Preview.

The safety that used to come with that failure is now explicit: **a Vercel
production build refuses to ship** without `DATABASE_URL` and, while
`NEXT_PUBLIC_PLAID_ENABLED=1`, without Plaid's settings (as validated by
`loadPlaidConfig()`) and `CRON_SECRET`: npm's `prebuild` runs
`tools/check-production-env.ts` → `src/lib/env/production-env.ts` before
`next build`. Its build log prints "✓ Production env check passed"; other
Vercel builds print "Production env check skipped". It needs Vercel's Build
Command to stay `npm run build` (an override that calls `next build`
directly would skip it). It reads the real process env only, not `.env*`
files: the local `.env.production` is a Vercel pull that says
`VERCEL_ENV=production` with masked secrets.
Without the check, a missing `DATABASE_URL` would ship and fail only at
runtime (the webhook and cron routes answer 500, the background refresh and
sync only log), and a missing `CRON_SECRET` would make the sync sweep and the
recurring scan answer every call with a quiet 401.

**Not needed on Vercel (current prod):** `SUPABASE_SECRET_KEY` (only the local
e2e suite uses it), `DIRECT_URL` (only `db:migrate` uses it, run locally),
`ANTHROPIC_API_KEY` (V2 — email / receipt ingestion). The app talks to Supabase
entirely through the user session + the publishable key.

**Preview deployments** (any pushed branch other than `main`) use the
**staging** Supabase project: `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set for Preview to staging's
(`uvowywszaiojboaxdmoz`) public values. Preview has no server secrets, so bank
sync is off there (`NEXT_PUBLIC_PLAID_ENABLED` unset). Previews sit behind
Vercel's login (Deployment Protection) and show that a branch builds and
renders; sign-in isn't wired for their changing URLs. Test signed-in flows
against staging with the isolated local build instead.

### Plaid (V1 code live on prod since 2026-09-11; UI live in prod as of 2026-09-14 confirmation)

Migration `0004` (Plaid tables/columns, additive-only — see its own file for
the reverse) was applied to the **prod** Supabase project on 2026-09-11 as
part of the V1 → production promotion, so the schema is ready. The "Connect a
bank" UI itself is gated by `NEXT_PUBLIC_PLAID_ENABLED`, which **is on in
prod** — it needed real Plaid **Production** API keys, obtained by completing
Plaid's Production access process (business application/billing — an
owner-only, external step Claude couldn't self-serve). That step happened;
the flag was flipped directly in Vercel without a corresponding commit or doc
update, so it went undocumented until confirmed 2026-09-14 by querying
`plaid_items` directly (see the note at the top of this file): 3 real linked
accounts with recent `last_synced_at` timestamps, i.e. sync is actually
running — this is no longer staging-only. (Not independently re-verified
here: whether prod's webhook/cron wiring mirrors staging's M9 setup exactly,
vs. syncs landing via some other path — worth confirming if that ever
matters operationally.)

**Historical context below** (accurate for how V1 was originally built and
verified, before the prod flag was turned on): the paragraph immediately
above this used to say the flag stayed unset on prod and that the **staging**
deploy (Milestone 9 — points `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` at
`budgts-staging`) was where Plaid was actually live, in Sandbox mode. Staging
still exists and still works the same way; it's just no longer the only place
Plaid is live.

| Var | Value / source |
| --- | --- |
| `NEXT_PUBLIC_PLAID_ENABLED` | `1` |
| `PLAID_ENV` | `sandbox` |
| `PLAID_CLIENT_ID` | Plaid dashboard → Developers → API keys |
| `PLAID_SECRET` | the **Sandbox** secret |
| `PLAID_TOKEN_ENC_KEY` | 32 bytes base64 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; per-environment |
| `CRON_SECRET` | shared secret `pg_cron` presents to `/api/plaid/sync-due` |
| `DATABASE_URL` | staging transaction pooler (needed here — runtime uses Drizzle for the sync engine) |

Also register `https://<deploy-host>/api/plaid/webhook` as the webhook URL in the
Plaid dashboard.

### OAuth redirect (needed for SoFi, Capital One, and most large US banks) — owner action required

**Status 2026-09-15: code shipped, OFF until you complete this.** These
institutions send the browser to their own login page, then need somewhere
Plaid-registered to send it back — without this, Link can hang or fail
partway through, exactly what happened reconnecting SoFi. The code is safe
either way: `PLAID_OAUTH_REDIRECT_URI` unset (the default) sends no
`redirect_uri` at all, identical to before this existed.

**To turn it on** (Claude can't do this part — no Plaid dashboard access):

1. Plaid dashboard → Developers → API → **Allowed redirect URIs** — add
   `https://budgts.com/plaid-oauth` under the **Production** environment
   (Sandbox has its own separate list; add it there too if you test OAuth
   institutions in Sandbox).
2. Vercel → Project → Settings → Environment Variables → set
   `PLAID_OAUTH_REDIRECT_URI=https://budgts.com/plaid-oauth` for Production.
3. Redeploy.

**Do not set the env var before step 1 is saved in the Plaid dashboard** —
sending an unregistered `redirect_uri` makes Plaid reject **every**
`/link/token/create` call, not just OAuth ones, so this would break
connecting or reconnecting any bank, not only the OAuth ones.

## 4. Point Supabase at the deployed URL

Supabase dashboard → Authentication → **URL Configuration**:

- **Site URL:** `https://budgts.com`
- **Redirect URLs:** `https://budgts.com/**`, `https://www.budgts.com/**`,
  `http://localhost:3000/**` (local dev), `https://budgts.vercel.app/**` (kept)

Google Cloud console → your OAuth client → **Authorized redirect URIs**:
already `https://wsmhstqpvbbcqpqhiqyp.supabase.co/auth/v1/callback` — no change
(Supabase is the redirect target, not the app).

## 5. Deploy + verify

- Trigger a deploy (push, or Vercel "Redeploy").
- On your phone: open the URL, install to home screen ("Add to Home Screen").
- Sign in (magic link or Google), pick a currency, add a transaction.
- Open the app on a second device — the transaction appears within a second
  (Supabase Realtime).
- Settings → Export transactions (CSV) downloads a file.

## Milestone 9 — V1 Beta (staging deploy)

A **separate** Vercel project wired entirely to staging, so `budgts.com`
(Production, prod Supabase, no `0004`) is untouched. Decisions: new Vercel
project on its `*.vercel.app` URL; **magic-link** login only.

**1. Vercel project.** New project → import `ramYum/budgts` (same repo) → name
`budgts-staging` → Production branch `main` (or a dedicated branch). Framework
Next.js, defaults otherwise.

**2. Env vars** (Production scope of *this* project):

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://uvowywszaiojboaxdmoz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | staging project → Settings → API → publishable / anon key |
| `NEXT_PUBLIC_SITE_URL` | the deploy origin, e.g. `https://budgts-staging.vercel.app` |
| `NEXT_PUBLIC_PLAID_ENABLED` | `1` |
| `PLAID_ENV` | `sandbox` |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Sandbox keys (`.env.staging`) |
| `PLAID_TOKEN_ENC_KEY` | the staging key (`.env.staging`) — must match what encrypted the tokens |
| `CRON_SECRET` | the staging value (`.env.staging`) |
| `DATABASE_URL` | staging **transaction** pooler (port 6543) — the sync engine uses Drizzle at runtime here |
| `SUPABASE_SECRET_KEY` | staging project secret key — only if the e2e seed suite runs against this deploy |

Not needed: `DIRECT_URL`, `ANTHROPIC_API_KEY`.
E2E-only, set **only** for a Playwright run then unset: `PLAID_TEST_SEED_ENABLED=1`
(enables `POST /api/plaid/test/seed`, 404 otherwise).

**3. Staging Supabase auth.** Staging project → Authentication → URL
Configuration: Site URL = the deploy origin; Redirect URLs =
`<origin>/**` + `http://localhost:3000/**`. Email/magic-link is on by default.
The `handle_new_user` trigger already seeds accounts + categories on first sign-in
(migrations 0000–0016 are applied on both staging and production — the
0014–0016 columns/tables were confirmed present with a read-only schema probe
on 2026-09-25).

**4. Plaid dashboard.** Team → Developers → API → allowed redirect / webhook:
add `<origin>/api/plaid/webhook`. (OAuth `redirect_uri` only if OAuth
institutions are used — Sandbox `ins_109508` is not.)

**5. Automation (workstream B).** After the deploy is live, in the staging
Supabase SQL editor run `supabase/staging-plaid-cron.sql` with `{{DEPLOY_URL}}`
and `{{CRON_SECRET}}` filled in. Verify with the queries at the bottom of that
file — a `net._http_response` row with `status_code = 200` and an item's
`needs_sync` flipping back to `false` on its own (within 10 minutes).

Since 2026-09-25 that job is a **10-minute reconciliation sweep**, not the sync
driver: a Plaid webhook syncs its Item straight away (`after()` in
`/api/plaid/webhook`, through the per-Item lease in
`src/lib/plaid/sync-runner.ts`); the sweep retries failed syncs, recovers runs
killed mid-way (expired lease) and backstops Items silent for 6h. Both routes
declare `maxDuration = 300`, which needs Vercel **Fluid compute** (the default
for current projects; Hobby's non-fluid ceiling is 60s). An environment still
on the old 30s schedule is moved with the `cron.alter_job` snippet at the
bottom of `supabase/staging-plaid-cron.sql` — only after the sweep build and
migration `0017` are live there.

**6. Acceptance chain** (owner, by hand, on the deploy origin):
login → Connect a bank → Plaid Sandbox → map account → transactions imported →
displayed → categorize → merchant rule remembered → disconnect → history remains.

## Mobile apps (App Store + Google Play) — launch track, 2026-09-26

Design authority: `docs/specs/2026-09-17-mobile-app-launch-design.md`.
Steps get their exact, verified commands as they are first run (none are
guessed here).

- **Accounts** (owner): Apple Developer and Google Play Console, both as
  **organizations** under the owner's LLC (D-U-N-S). Apple's Small Business
  Program gives the 15% rate. Organization Play accounts skip the 12-tester
  closed test.
- **Builds:** EAS Build from `mobile/` (the owner is on Windows, so iOS is
  built in the cloud). Profiles:
  - `development`: dev client, staging API;
  - `preview`: internal installs, staging;
  - `production`: store builds, `https://budgts.com`.
- **The app holds only public values:** the Supabase URL and publishable
  key, the API base URL, and the RevenueCat public SDK keys. Server secrets
  (Plaid, `SUPABASE_SECRET_KEY`, RevenueCat webhook auth) stay in Vercel.
- **Release train:**
  - EAS Submit → TestFlight and the Play **internal** track (owner device
    QA) → a private beta until crash-free (Sentry) → App Review / Play
    review → a **staged rollout**.
  - Rollback: halt the rollout and ship the previous build number.
- **Deep links:** `budgts://` plus universal/app links on `budgts.com`,
  needed for the auth callback and Plaid OAuth returns. The site serves
  `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json`.
- **Server side ships first:** mobile API routes, the entitlement gate and
  the RevenueCat webhook deploy with the web app, through staging then
  production, before any store build depends on them.

## Notes

- The Supabase database password and the Google client secret were shown in
  chat during setup. The owner decided not to rotate them (2026-09-09, and
  again 2026-09-26 for the launch). Don't re-raise it.
- **A migration reaches production before any build that reads it.**
  `0018` (per-user time zone) went first on 2026-09-27: the dashboard
  layout selects `profiles.time_zone`, so deploying first would have failed
  every signed-in page. Order: apply it (`MIGRATE_CONFIRM_REF=<prod ref>`,
  owner approval), confirm the schema and row counts, then deploy.
- **`0019`–`0024` (Stage 0 port) also go before the build that reads them.**
  Once that build is live, `/api/plaid/link-token` and `/api/plaid/exchange`
  read `account_deletions` on every call, the billing routes read
  `entitlements` / `billing_events`, and account deletion reads the ledger
  tables. Deploying first would break **bank connection for every web user**
  (and deletion). Order, with owner approval at each production step:
  1. ✅ Staging first: rebuilt 2026-09-28, history clean, integration 172/172
     (`docs/operations/database-migrations.md`).
  2. ✅ Production: applied 2026-09-28 11:53Z with owner approval ("im giving
     you the authorization and approval"): `MIGRATE_CONFIRM_REF=<prod ref>
     npm run db:migrate`, ledger 19 → 25 rows. Pre-existing tables kept
     identical row counts (transactions 32771), no existing object changed
     (schema diff), `account_deletions` empty, so the write guard lets every
     user write. `db:verify-history` still reports drift on production, but it
     is old line-ending and ordering history, not this migration: see
     "Production ledger: known pre-existing drift" in the migrations doc.
  3. ✅ Read-only probe: all 9 rows `true` (checked twice, by the migrating
     agent and independently).
  4. Deploy: **not done, needs the owner's go-ahead.** Production's schema
     is now ready for the Stage 0 build.

  The probe is `supabase/probes/0019-0024-preflight.sql` (also run by
  `tests/unit/db-migration-chain.test.ts` against the migrated chain, so it
  cannot drift from the migrations).
- The free Supabase project **pauses after 7 idle days** and has no
  backups; **Supabase Pro is required before selling**.
- Vercel Hobby is personal / non-commercial only; **Vercel Pro is required
  before selling**.
- Icons: the manifest uses PNG icons (192/512, `any` + `maskable`) plus
  `src/app/icon.png` / `apple-icon.png`, all generated from the pixel robin
  by `node tools/generate-app-icons.mjs` (see `docs/BRAND_GUIDELINES.md`).
