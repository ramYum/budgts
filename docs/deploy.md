# Deploying Budgts

The app is a standard Next.js 16 project; Vercel builds it with no config.
Steps you (the owner) do — Claude can't create the accounts or push to a remote.

## Current deployment (live)

- **Canonical URL:** `https://budgts.com` (apex). `https://www.budgts.com`
  308-redirects to it. `https://budgts.vercel.app` also still serves.
- **Vercel:** team `tocino` (Hobby) / `crispyphata-5876`, project `budgts`,
  deploys from `main` (`ramYum/budgts`).
- **Domain DNS:** `budgts.com` is registered + DNS-hosted at Cloudflare.
  Two records, both **DNS-only (grey cloud)**:
  `CNAME @ → 20b64e226c444eb2.vercel-dns-017.com` and
  `CNAME www → 20b64e226c444eb2.vercel-dns-017.com`.
- The section below is the original from-scratch runbook; `<your-vercel-domain>`
  now means `budgts.com`.

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

Set for **Production** (and Preview if you want preview deploys to work):

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wsmhstqpvbbcqpqhiqyp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |
| `NEXT_PUBLIC_SITE_URL` | `https://budgts.com` (Production only) |

**Not needed on Vercel (current prod):** `SUPABASE_SECRET_KEY` (only the local
e2e suite uses it), `DATABASE_URL` / `DIRECT_URL` (only `db:migrate` uses them),
`ANTHROPIC_API_KEY` (V2 — email / receipt ingestion). The app talks to Supabase
entirely through the user session + the publishable key.

### Plaid (V1 — not on prod yet)

The "Connect a bank" UI is gated by `NEXT_PUBLIC_PLAID_ENABLED`. Production
stays **unset** until Plaid Production is approved and migration `0004` is
applied to the prod Supabase project (design §27). The **staging** deploy
(Milestone 9 — points `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` at
`budgts-staging`) sets:

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
Plaid dashboard, and the OAuth `redirect_uri` if OAuth institutions are used.

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
| `NEXT_PUBLIC_SUPABASE_URL` | `https://iwypmifvmtmkwtnxkfma.supabase.co` |
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
(migrations 0000–0004 are applied on staging).

**4. Plaid dashboard.** Team → Developers → API → allowed redirect / webhook:
add `<origin>/api/plaid/webhook`. (OAuth `redirect_uri` only if OAuth
institutions are used — Sandbox `ins_109508` is not.)

**5. Automation (workstream B).** After the deploy is live, in the staging
Supabase SQL editor run `supabase/staging-plaid-cron.sql` with `{{DEPLOY_URL}}`
and `{{CRON_SECRET}}` filled in. Verify with the queries at the bottom of that
file — a `net._http_response` row with `status_code = 200` and an item's
`needs_sync` flipping back to `false` on its own.

**6. Acceptance chain** (owner, by hand, on the deploy origin):
login → Connect a bank → Plaid Sandbox → map account → transactions imported →
displayed → categorize → merchant rule remembered → disconnect → history remains.

## Notes

- The Supabase database password and the Google client secret were shown in
  chat during setup. Rotating them is **intentionally skipped** for this
  personal project — not a pending task.
- The free Supabase project **pauses after 7 idle days**; the dashboard has a
  one-click restore. Use the CSV export as a backup.
- Vercel Hobby is personal / non-commercial only.
- PNG icons: the manifest currently uses SVG icons, which modern Android/Chrome
  accept. For best iOS home-screen results, generate 192/512 PNGs later.
