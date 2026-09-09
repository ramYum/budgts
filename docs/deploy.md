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

**Not needed on Vercel:** `SUPABASE_SECRET_KEY` (only the local e2e suite uses
it), `DATABASE_URL` / `DIRECT_URL` (only `db:migrate` uses them),
`ANTHROPIC_API_KEY` (Phase 3). The app talks to Supabase entirely through the
user session + the publishable key.

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

## Notes

- The Supabase database password and the Google client secret were shown in
  chat during setup. Rotating them is **intentionally skipped** for this
  personal project — not a pending task.
- The free Supabase project **pauses after 7 idle days**; the dashboard has a
  one-click restore. Use the CSV export as a backup.
- Vercel Hobby is personal / non-commercial only.
- PNG icons: the manifest currently uses SVG icons, which modern Android/Chrome
  accept. For best iOS home-screen results, generate 192/512 PNGs later.
