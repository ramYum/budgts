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

Set for **Production** (and Preview if you want preview deploys to work):

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wsmhstqpvbbcqpqhiqyp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |
| `NEXT_PUBLIC_SITE_URL` | `https://budgts.com` (Production only) |
| `DATABASE_URL` | prod **transaction** pooler (port 6543) — **required since V1**, even with Plaid off (see below) |

**As of V1 (Plaid code merged), `DATABASE_URL` is a hard build-time
requirement**, not just a `db:migrate` convenience: the `/api/plaid/*` route
handlers import the Drizzle client (`src/lib/db/index.ts`), which throws at
module-load if `DATABASE_URL` is missing — `next build`'s "Collecting page
data" step imports every route module, so a prod build **fails** without it,
even though Plaid itself is feature-flagged off. Verified by building locally
with it unset before this was caught. Plaid's own secrets
(`PLAID_CLIENT_ID`/`PLAID_SECRET`/`PLAID_TOKEN_ENC_KEY`/`CRON_SECRET`) are all
lazily loaded (only read when a Plaid route actually runs) and are **not**
needed unless `NEXT_PUBLIC_PLAID_ENABLED` is turned on.

**Not needed on Vercel (current prod):** `SUPABASE_SECRET_KEY` (only the local
e2e suite uses it), `DIRECT_URL` (only `db:migrate` uses it, run locally),
`ANTHROPIC_API_KEY` (V2 — email / receipt ingestion). The app talks to Supabase
entirely through the user session + the publishable key.

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
