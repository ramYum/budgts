# Third parties

Every outside service Budgts depends on, or has firmly planned to. **Update this
file in the same change that adds, removes or replaces a third party** (rule in
`CLAUDE.md` → Conventions). No secrets here — env var *names* live in
`CLAUDE.md` and `.env.local.example`.

Last verified against the repo: **2026-09-21**.

## Active

| Third party | Role in Budgts | What it handles | Evidence / notes |
| --- | --- | --- | --- |
| **Cloudflare** | Domain registrar + DNS | `budgts.com` registration and DNS; CNAMEs point `@` and `www` at Vercel | `docs/deploy.md`. No evidence of Cloudflare proxy/WAF/protection being used — DNS only. |
| **Vercel** | Backend hosting / deployment | Next.js backend: API routes, auth callback, webhooks (Plaid, RevenueCat), cron endpoints and the remaining web pages (the web/PWA UI is being retired; the server layer stays). Two projects: `budgts` (prod, `budgts.com`) and `budgts-staging` | `docs/deploy.md`. Hobby plan; upgrade deferred to the launch-readiness milestone. **The production project must move off Hobby to a paid plan before Budgts launches as a paid product** (release prerequisite; see `CLAUDE.md`, Stack). |
| **Supabase** | Database + auth backend | Postgres, Auth (Magic Link + Google identity), RLS, Storage/Realtime; two projects: production `wsmhstqpvbbcqpqhiqyp` and the single staging project `Budgets-Staging-3` `uvowywszaiojboaxdmoz` (org *Budgts Validation*; earlier staging projects are deleted). Also hosts the `pg_cron` / `pg_net` jobs that call `/api/plaid/sync-due` and the two `/api/billing/*/due` endpoints | `docs/deploy.md`, `.env.local.example`. Free/Nano tier (500MB, pauses after 7 idle days); upgrade deferred. The cron jobs are the templates `supabase/staging-plaid-cron.sql` and `supabase/billing-cron.sql`, run by hand once per environment (configuration, not migrations). |
| **Plaid** | Bank connectivity | Bank linking (Link + OAuth institutions), accounts, transaction sync, webhooks (`/api/plaid/webhook`, signature-verified), `/item/remove` on disconnect | `src/app/api/plaid/*`, `src/lib/plaid/*`. Production live on prod; Sandbox on staging. Per-item cost applies. **Planned:** `react-native-plaid-link-sdk` for native Link (needs an EAS dev build, an HTTPS universal / app-link OAuth redirect and Bearer link-token / exchange routes) — `docs/specs/2026-09-21-mobile-only-transition-design.md`. |
| **Expo** | Mobile framework | Expo SDK 57 / React Native 0.86, expo-router, secure-store, web-browser, linking, fonts | `mobile/package.json`, `mobile/app.json`. |
| **EAS (Expo Application Services)** | Mobile builds | Build profiles `development` and `preview` (Android APK); remote app-version source; project owner `budgts` | `mobile/eas.json`, `mobile/app.json`. iOS device builds are not possible yet — no Apple Developer enrollment (see Planned). |
| **Google** | Authentication provider | "Sign in with Google" (OAuth) in the native app (the web `/auth/callback` route stays for the flow; web sign-in itself is being retired); Google Cloud OAuth consent-screen branding | `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/server/auth.ts`. Consent screen is still in *Testing* until privacy/terms links are added. |
| **GitHub** | Source hosting + CI | `ramYum/budgts` repo, branches, commits; GitHub Actions CI (`npm ci` → lint, typecheck, test, build) | `git remote -v`, `.github/workflows/ci.yml`. |
| **RevenueCat** | Subscription / entitlement layer | Normalizes App Store + Play Billing events. Webhook (`/api/billing/webhook/revenuecat`, HMAC-signature verified) → entitlement + ledger; server-side reconciliation via its REST API; the mobile app uses its SDK (`react-native-purchases`, public key only). Supabase user id = RevenueCat `app_user_id` | Adapter + SDK integration built and tested with fixtures (`src/lib/billing/revenuecat/*`, `mobile/lib/billing/*`; design: `docs/specs/2026-09-21-v1-monetization-design.md`). **Not live:** no RevenueCat project, keys, or store products exist yet. Separate staging/production projects and keys required. **Plan:** webhooks need the Pro plan (free until $2,500 monthly tracked revenue, then 1%); nothing has been purchased. |

## Planned (not integrated yet)

| Third party | Role | What it will handle | Status |
| --- | --- | --- | --- |
| **Apple Developer Program** | iOS distribution | Enrollment (annual fee), App Store Connect app record, StoreKit in-app purchases + 14-day free trial (owner decision 2026-09-21; supersedes the 7 days in the earlier specs) | Not enrolled. Blocks iOS builds and StoreKit sandbox testing. |
| **Google Play Console** | Android distribution | Enrollment ($25 one-time), store listing, Google Play Billing | Not enrolled. |
| **Sign in with Apple** | Auth provider | Apple sign-in on mobile | Excluded initially; App Store Guideline 4.8 compliance question still open (`docs/specs/2026-09-17-mobile-app-launch-design.md`). Needs Apple Developer enrollment. |
| **Resend** | Transactional email | The trial-end reminder ("your free trial ends tomorrow"): `POST https://api.resend.com/emails`, `Idempotency-Key` per user + trial end, recipient allowlist so staging never emails a real customer | Adapter built and tested behind the provider-neutral `ReminderDelivery` port (`src/lib/billing/email/resend.ts`). **Not live:** no account, key or verified sending domain. Needs a Budgts-owned domain verified in Resend (SPF/DKIM; **DNS changes need owner approval and have not been made**). Free = 3,000 emails/month with a **100/day cap** (launch-scale risk); Pro = $20/month; nothing purchased. Separate staging/production keys. |
| **Anthropic (Claude API)** | AI extraction | Parsing purchase-notification emails and receipt photos (`claude-sonnet-5`, vision) — V2 | Post-launch. `ANTHROPIC_API_KEY` is a placeholder only; not in use. |
| **Inbound-email provider** | Email ingestion (V2) | Per-user inbound address → webhook → `EmailAdapter` | Undecided: Cloudflare Email Routing / Postmark / Mailgun (`docs/roadmap.md`). |

## Ruled out

- **Stripe / any web billing** — web has no customer checkout; billing is Apple IAP + Google Play Billing only.

## Gaps noticed (not planned in any doc — decide before launch)

- **Auth email delivery.** No custom SMTP is documented; Magic Link mail rides Supabase's built-in sender, which is heavily rate-limited (the staging project's Auth settings show `rate_limit_email_sent` = 2 per hour) and not meant for production volume. Custom SMTP is needed before launch (Resend could serve, once its domain is verified).
- **Error monitoring / analytics.** No crash reporting, product analytics or uptime monitoring appears in the code or docs.
