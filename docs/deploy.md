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
- **2026-09-28 — Stage 0 and Stage 1 live** (`a72380a`, then `151323f`): the
  mobile API, account deletion, billing (switched off), migrations
  `0019`–`0024` (applied to production first), and the legal pages with the
  owner's facts. Details: "Mobile apps", "Legal pages" and the `0019`–`0024`
  note below. Since 2026-09-29 the plan is for budgts.com to become the
  company website at launch ("Planned: budgts.com becomes the company
  website").

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
  **organizations** under Budgts, LLC.
  - **Google Play: done 2026-09-30.** The D-U-N-S number was secured, and
    the Play Console account was converted from personal to organization
    that day. So Google's 12-tester / 14-day closed test no longer applies.
    The internal testing track is still used, only so the owner can install
    release builds.
  - **Apple: next.** Enroll the Apple Developer Program as an organization,
    with the name and address exactly as on the D-U-N-S record, then join
    the Small Business Program for the 15% rate.
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

### App sign-in: what Supabase needs (Stage 2A, 2026-09-29; no settings changed)

- **Redirect URLs** (Supabase → Authentication → URL Configuration), on each
  project the app points at:
  - `budgts://auth/callback`: Google's return to the app (already on
    staging's list).
  - `https://<site>/app/auth/callback`: where the app's email links land, the
    page that hands them to the app (`src/app/app/auth/callback`). A
    `https://budgts.com/**` entry covers it on production (check it is
    there, or add the exact address); staging's list already covers
    `http://localhost:3000/**` and `https://budgts-staging.vercel.app/**`
    (verified 2026-09-29 by the read-only `/auth/v1/verify?redirect_to=`
    probe). Supabase silently sends any address not on the list to the Site
    URL instead, so check before a store build.
- **Sign in with Apple:** Apple Developer account (waits on the LLC's
  D-U-N-S number) → the bundle id with the Sign in with Apple capability →
  Supabase → Providers → Apple enabled, the bundle id as an authorized
  client id (native ID-token flow; no Services ID or `.p8` needed) → set
  `EXPO_PUBLIC_APPLE_SIGN_IN=on` in the iOS EAS environment
  (`mobile/README.md`, "Sign in with Apple").

### Android: Play internal-testing release (first run 2026-10-02)

The verified order; each step names who does it.

1. **Server first (owner pushes).** A store build calls `https://budgts.com`,
   so production must already serve every `/api/mobile/*` route the build
   uses. Release the branch the build comes from with
   `git push origin <sha>:refs/heads/main`. The auto-mode classifier refuses
   that push from a Claude session even when the owner has authorized it, so
   the owner runs it.
2. **EAS production environment** (`eas env:list --environment production`):
   `EXPO_PUBLIC_API_BASE_URL=https://budgts.com` and the production Supabase
   URL and publishable key, all plain text (public values). No RevenueCat key
   while billing is off.
3. **Build** from `mobile/`:
   `npx eas-cli@latest build -p android --profile production --non-interactive`.
   The `production` profile builds an app bundle, and the version code
   auto-increments on EAS's remote counter. The repository-root `.easignore`
   keeps the upload to source only (about 14 MB). Check it before a build
   from a new machine:
   `npx eas-cli@latest build:inspect -p android --profile production --stage archive --output <dir>`
   must show no `.env*` files and an empty `mobile/android`. Without the
   file, EAS uploaded a local dev build's native folder (1013 MB), and it
   would have skipped prebuild.
4. **Crash check** (Claude): turn the bundle into a universal APK
   (`java -jar bundletool.jar build-apks --mode=universal`). Install it on an
   emulator that doesn't hold the dev build, since the signing keys differ,
   and cold-launch it 50 times (`am start -W`). Scan the crash buffer and
   logcat for FATAL and ANR lines.
5. **Upload** (Play Console → Test and release → Internal testing → Create
   new release): upload the `.aab`, add release notes, then Save → Review →
   Start rollout. Testers: the "Budgts Internal Testers" list. They join
   through the track's opt-in link (Testers tab → "Join on the web").
6. **App links:** set Vercel production `ANDROID_PACKAGE_NAME=com.budgts.app`
   and `ANDROID_CERT_SHA256`, which is Play's app-signing SHA-256 (Protected
   with Play → App signing) plus the upload key's, comma-separated. They
   reach `/.well-known/assetlinks.json` only with the next production
   deploy, because Vercel binds env to a deployment when it's built.
   `ANDROID_PACKAGE_NAME` also switches native Plaid Link to
   `android_package_name`.
7. **Plaid:** Dashboard → Developers → API → Allowed Android package names
   must list `com.budgts.app` (it does).
8. **Supabase:** production Redirect URLs need `budgts://auth/callback`
   (added 2026-10-02). Verify with the read-only probe
   `/auth/v1/verify?token=x&type=magiclink&redirect_to=…`: an allowed address
   comes back as the 303 target, anything else falls back to the Site URL.
   Without it, Google sign-in from the app lands on budgts.com.

### Sign-in email at launch volume: custom SMTP (owner, before the private beta)

Every magic link (web and app) is sent by Supabase's **built-in mail
sender**. It is for testing only: a few emails an hour per project,
best-effort delivery, a generic sender, and no guarantee it reaches inboxes.
The app shows Supabase's "wait N seconds" limit in words, but real users will
hit the hourly cap. Before the private beta, give each Supabase project
(staging, then production) its own SMTP sender. Nothing was changed; the
steps:

1. **Choose a sender.** Either:
   - **Google Workspace (budgts.com):** simplest if the owner already has
     it. Create a mailbox or alias such as `no-reply@budgts.com`, turn on
     2-Step Verification for that account and create an **App password**
     (or configure the Workspace **SMTP relay** service for the domain).
     Host `smtp.gmail.com` (or `smtp-relay.gmail.com` for the relay), port
     587 (STARTTLS) or 465 (SSL). Workspace caps a user at about 2,000
     messages a day: plenty for sign-in links at launch.
   - **A transactional provider** (Postmark, Resend, Amazon SES, SendGrid):
     better deliverability and logs, per-message pricing. Verify the domain
     in the provider and use its SMTP host, port and credentials.
2. **DNS (Cloudflare, budgts.com):** SPF (include the provider or Google),
   the provider's DKIM record, and a DMARC record
   (`v=DMARC1; p=none; rua=mailto:<owner address>` to start, tighten later).
3. **Supabase → Authentication → SMTP Settings** (per project): enable
   custom SMTP; sender email `no-reply@budgts.com`, sender name `Budgts`;
   host, port, username, password from step 1. Keep the password in the
   dashboard only (never in the repo or `.env` files).
4. **Supabase → Authentication → Rate Limits:** raise "emails sent per hour"
   to suit the beta (custom SMTP unlocks it), keeping the per-address
   60-second resend limit the app's "Send it again" timer matches.
5. **Test** on staging: a web sign-in link and an app sign-in link arrive
   from `no-reply@budgts.com`, pass SPF/DKIM (Gmail → "Show original"), and
   open on the right device. Then production.
6. **Privacy policy:** name the email provider as a processor if it is new
   (a transactional provider is; Google already is for Workspace).

## Planned: budgts.com becomes the company website (owner decision 2026-09-29)

The apps will be the only product. The server stays in this project on
budgts.com, so the Vercel project, domain, Plaid addresses, cron jobs and
Supabase Auth URLs don't move. The full sequence is launch spec §13a:

- **Phase 1b:** signed-out visitors see the company homepage ("coming soon
  to iPhone and Android", a Sign in link for existing users, the legal
  links). The browser app keeps working for signed-in users.
- **Launch (Phase 5):** swap Sign in for the App Store and Google Play
  buttons and retire the browser app. Ship a service-worker update that
  clears the PWA caches and unregisters itself, and drop the manifest, so
  installed PWAs stop showing a stale app. Keep the legal and support pages,
  the web delete-account flow (Google Play requires it), `/api/*`,
  `/.well-known/*` and `/app/plaid-oauth`.

### Phase 1b routing (live since 2026-09-29 12:26 ET)

> Owner: "deploy the homepage". `main` fast-forwarded `151323f` → `65bf644`, deployed as
> `dpl_4E7z2LjDooXDmqseD55zzrHn24YD`: production env check passed, CI green (check + mobile), `/company`,
> its share image, `/robots.txt` and `/sitemap.xml` prerendered. Post-deploy checks: signed-out `/` 200 with
> `cache-control: public, max-age=0, must-revalidate` (no `s-maxage`), `x-vercel-cache: PRERENDER`, no
> `cf-cache-status` (Cloudflare DNS-only); 5 repeated signed-out requests and a bogus session cookie all got the
> homepage; `/robots.txt` and `/sitemap.xml` 200; `/transactions` still 307 to `/sign-in?next=…`; no errors or
> 5xx in the logs. The signed-in check (`/` still the dashboard) was proven by e2e on the staging build and is
> confirmed on production by the owner opening budgts.com signed in.

- `src/proxy.ts` **rewrites** a signed-out `/` to the homepage at `/company`: the address stays
  budgts.com and answers 200, so crawlers and the Apple enrollment reviewer see the company site,
  not a redirect to `/sign-in`. A signed-in `/` is the dashboard, unchanged. The session check is
  the same local JWT check (`getClaims`), no network call.
- `/robots.txt` (allow all, `/company` included so crawlers can read its canonical `/`) and
  `/sitemap.xml` (`/` plus the four legal pages while they are live) are public in the proxy.
- The legal pages' "Open Budgts" button now goes to `/sign-in` (a signed-in user is sent on to the
  dashboard), since `/` is the homepage for signed-out visitors.
- **The footer's Privacy link needs the six legal facts at build time.** Like the legal pages, the
  homepage footer (Privacy, Terms, Support, Delete your account) renders only when every owner fact
  in "Legal pages" below is set when the deployment is built. They are set in Production. Google's
  OAuth brand verification needs that Privacy link on the homepage, so never build Production
  without them. No new environment variables.

**Why one address can safely serve two pages.** Vercel runs the proxy before its edge cache, on every
request, so the cache never decides which page `/` is. A signed-out `/` is rewritten to `/company`,
a static page cached under that path; a signed-in `/` renders the dashboard, which is dynamic and
answers `private, no-cache, no-store`. That holds only while nothing in front of Vercel caches
HTML: Cloudflare must stay **DNS-only (grey cloud)** for both records ("Current deployment" above),
or, if it is ever proxied, carry no rule that caches HTML. A caching proxy could store the homepage
under `/` and serve it to signed-in users (or the reverse).

**After deploying, check (signed out, signed in, alternating):**

1. Signed out, no cookie: `curl -sI https://budgts.com/` answers `200` (not `307`); its
   `cache-control` has no `s-maxage` (Vercel strips it before the browser); it has an
   `x-vercel-cache` header; and `cf-cache-status` is absent or `DYNAMIC`. The page title is
   "Budgts: budgeting that does itself" and the `og:image` URL loads.
2. Signed in: the same request with a real session cookie (copy the `sb-*-auth-token` cookie from a
   signed-in browser into `curl -sI -H "Cookie: ..."`) answers the dashboard with
   `cache-control: private, no-cache, no-store`.
3. Alternate the two requests a few times: the signed-out one always gets the homepage and the
   signed-in one always the dashboard, never swapped.
4. `curl -sI https://budgts.com/robots.txt` and `/sitemap.xml` answer `200`, not `307`.

## Legal pages (Phase 1, built 2026-09-28): owner facts turn them on

> **Live since 2026-09-28 20:47 ET** (owner: "Deploy stage 1"). The six values below were set
> in Vercel Production, then `main` was fast-forwarded to `151323f` and deployed as
> `dpl_ACWKBpnLLAvXEHVFrrTE4BGLLkQx`: production env check passed, CI green (check + mobile).
> Live checks: all four pages 200 with the entity name, support email and "Last updated
> September 28, 2026" and no placeholder text (Pennsylvania on `/terms`); `/api/legal`
> `{"live":true}`; the sign-in agreement line shows; `/settings/delete-account` sends a
> signed-out visitor to `/sign-in?next=…`; `/account-deleted` 200; no errors or 5xx in the logs.

`/privacy`, `/terms`, `/support` and `/account-deletion` (Google Play's web deletion link) are built and public in
`src/proxy.ts`, but each answers **404** and nothing links to them (sign-in, About, the apps' Settings via
`GET /api/legal`) until all six facts in `src/lib/legal/config.ts` are set. No code change turns them on:

| Variable | What it is | Owner's value (supplied 2026-09-28) |
| --- | --- | --- |
| `LEGAL_ENTITY_NAME` | The LLC's legal name | `Budgts, LLC` |
| `LEGAL_ENTITY_ADDRESS` | Its postal address, one line | `619 Springhouse Rd, Apt I, Allentown, PA 18104` |
| `SUPPORT_EMAIL` | The public privacy / support / deletion contact | `support@budgts.com` |
| `LEGAL_RECORD_RETENTION_YEARS` | Years retained billing records (Path B) are kept after deletion, spec §12.4. `0` = nothing is kept: the pages say deletion deletes your data right away. Setting it also confirms nothing else is retained | `0` ("deleted right away") |
| `LEGAL_GOVERNING_LAW` | Whose law governs the Terms, read after "the laws of" | `the Commonwealth of Pennsylvania` |
| `LEGAL_EFFECTIVE_DATE` | `YYYY-MM-DD`, the date the owner approved this wording, shown as "Last updated". The documents apply to each user from when they first sign in (the pages say so) | `2026-09-29` (was `2026-09-28`; see "Privacy policy update" below) |

Set them in Vercel for Production (and staging to preview), then redeploy: the pages are prerendered at build time.
Then give Google's OAuth consent screen and both store listings the URLs.

**Owner-confirmed wording (2026-09-28, "Confirmed"):** minimum age 18 in the Terms; the privacy policy is not directed
at children under 13; liability capped at what the user paid in the last 12 months; deletion is immediate, with no undo
window. The terms apply from a user's first sign-in ("once they sign in"). The owner was advised to have counsel read the
terms.

**Privacy policy update (owner-approved 2026-09-29):** the policy now lists the profile photo link Google shares at
sign-in (Supabase stores it in the account's user metadata). Before deploying that change, set
`LEGAL_EFFECTIVE_DATE=2026-09-29` in Vercel **Production**, then deploy, so "Last updated" moves with the wording.
Every later wording change to `/privacy` or `/terms` needs the same date bump.

**Retention 0 holds only while billing is off.** With billing live, a paying user's deletion keeps anonymized ledger
rows (Path B), so the production build (`src/lib/env/production-env.ts`, npm `prebuild`) refuses billing live with
`LEGAL_RECORD_RETENTION_YEARS=0`: decide how long payment records are kept (and whether Path B anonymizes or deletes
them) before switching billing on.

Paid wording is separate from this switch: until billing is live (`BILLING_ENVIRONMENT=production`,
`REVENUECAT_WEBHOOK_SIGNING_SECRET` and `REVENUECAT_SECRET_API_KEY` set, `billingLive()` in `src/lib/billing/config.ts`) the Terms say "Budgts is free
today" and no page mentions plans, trials or store cancellation. Prices and the trial length live in
`src/lib/billing/plans.ts` (change the annual price there if it moves to $79). Terms, Support and `/account-deletion`
are prerendered at build time, so switching billing on (or off) also needs a redeploy, like the legal facts.

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
  4. ✅ Deployed 2026-09-28 12:24Z (owner: "deploy."): `main` fast-forwarded
     `e5cfbda` → `a72380a`, `dpl_zqRjsbGWrShTYar6vJqKhpGjnmPR` Ready, build log
     "✓ Production env check passed", CI on `main` green (check + mobile).
     Live checks: `/` 307, `/sign-in` 200, `/app/plaid-oauth` 200, the mobile
     API, link-token and account delete 401 without a token, `.well-known` 404
     (env unset), billing webhook 503 and the other billing routes 401
     (switched off); no errors in the deployment's logs.

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
