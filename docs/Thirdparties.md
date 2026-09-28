# Third parties

Every outside service Budgts depends on, or has firmly planned to. Update this
file in the same change that adds, removes or replaces a third party. No
secrets here; env var *names* live in `CLAUDE.md` and `.env.local.example`.

Last verified against the repo: **2026-09-27** (Stage 0 port; account facts
carried over from `mobile/native-home` as of 2026-09-22 and not re-checked).

## Active

| Third party | Role in Budgts | What it handles | Evidence / notes |
| --- | --- | --- | --- |
| **Cloudflare** | Domain registrar + DNS | `budgts.com` registration and DNS; CNAMEs point `@` and `www` at Vercel | `docs/deploy.md`. No evidence of Cloudflare proxy/WAF/protection being used — DNS only. |
| **Vercel** | Backend hosting / deployment | Next.js web app (budgts.com, which stays: one subscription unlocks the apps and the web) and its API routes, auth callback, webhooks (Plaid, RevenueCat) and cron endpoints. Two projects: `budgts` (prod, `budgts.com`) and `budgts-staging` | `docs/deploy.md`. Hobby plan; upgrade deferred to the launch-readiness milestone. **The production project must move off Hobby to a paid plan before Budgts launches as a paid product** (release prerequisite; see `CLAUDE.md`, Stack). |
| **Supabase** | Database + auth backend | Postgres, Auth (Magic Link + Google identity), RLS, Storage/Realtime; two projects: production `wsmhstqpvbbcqpqhiqyp` and the single staging project `Budgets-Staging-3` `uvowywszaiojboaxdmoz` (org *Budgts Validation*; earlier staging projects are deleted). Also hosts the `pg_cron` / `pg_net` jobs that call `/api/plaid/sync-due` and `/api/billing/reconcile/due` | `docs/deploy.md`, `.env.local.example`. Free/Nano tier (500MB, pauses after 7 idle days); upgrade deferred. The cron jobs are the templates `supabase/staging-plaid-cron.sql` and `supabase/billing-cron.sql`, run by hand once per environment (configuration, not migrations). Budgts sends no trial-end reminder (owner decision 2026-09-22). Staging may still have the old `billing-reminders` job scheduled from the shelved branch; unscheduling it is part of the pending staging rebuild (`docs/operations/database-migrations.md`). |
| **Plaid** | Bank connectivity | Bank linking (Link + OAuth institutions), accounts, transaction sync, webhooks (`/api/plaid/webhook`, signature-verified), `/item/remove` on disconnect | `src/app/api/plaid/*`, `src/lib/plaid/*`. Production live on prod; Sandbox on staging. Per-item cost applies. Native Link: `react-native-plaid-link-sdk` in `mobile/` over the Bearer-capable link-token / exchange routes; needs an EAS dev build and the HTTPS universal / app-link OAuth redirect to verify on a device. |
| **Expo** | Mobile framework | Expo SDK 57 / React Native 0.86, expo-router, secure-store, web-browser, linking, localization (device time zone), fonts | `mobile/package.json`, `mobile/app.json`. |
| **EAS (Expo Application Services)** | Mobile builds | Build profiles `development`, `preview` (Android APK, sideloadable) and `preview-play` (Android App Bundle, same staging env — Google Play requires `.aab` for upload); remote app-version source; project owner `budgts` | `mobile/eas.json`, `mobile/app.json`. iOS device builds are not possible yet — no Apple Developer enrollment (see Planned). |
| **Google** | Authentication provider + Cloud project | "Sign in with Google" (OAuth) in the native app and on budgts.com; Google Cloud OAuth consent-screen branding. Also hosts the GCP project `budgts`, which has the Google Play Android Developer API enabled and a service account (`revenuecat-play-billing@budgts.iam.gserviceaccount.com`) used only for the RevenueCat ↔ Play Console integration below | `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/server/auth.ts`. Consent screen is still in *Testing* until privacy/terms links are added. |
| **GitHub** | Source hosting + CI | `ramYum/budgts` repo, branches, commits; GitHub Actions CI (`npm ci` → lint, typecheck, test, build) | `git remote -v`, `.github/workflows/ci.yml`. |
| **RevenueCat** | Subscription / entitlement layer | Normalizes App Store + Play Billing events. Webhook (`/api/billing/webhook/revenuecat`, HMAC-signature verified, Sandbox-only) → entitlement + ledger; server-side reconciliation via its REST API (V1 secret key); the mobile app uses its SDK (`react-native-purchases`, public key only, in EAS Preview env). Supabase user id = RevenueCat `app_user_id` | Adapter + SDK integration built and tested with fixtures (`src/lib/billing/revenuecat/*`, `mobile/lib/billing/*`; design: `docs/specs/2026-09-17-mobile-app-launch-design.md` §9; switched off until configured). **Project "Budgts" created** (owner, 2026-09-22): Android app registered, `premium` entitlement, `default` offering with `$rc_monthly`/`$rc_annual` packages mapped to `budgts_premium:monthly`/`:annual`. Play↔RevenueCat service-account access submitted 2026-09-22, propagation pending. Still blocked on the Google Play subscription product itself existing (see Google Play Console, below). **Plan:** webhooks need the Pro plan (free until $2,500 monthly tracked revenue, then 1%); nothing has been purchased. |
| **Google Play Console** | Android distribution | Developer account, app entry `Budgts` (`com.budgts.app`, status Draft), Google Payments merchant account, and the RevenueCat service-account grant, above | Developer account **verified/active** and app **created** 2026-09-22 (owner completed the account legal/policy attestations; Claude completed the app-creation form). Google Payments merchant account **configured** 2026-09-22 (owner). Subscription product `budgts_premium` (base plans `monthly`/`annual`, 7-day trial offers, US $9.99/$69, PHP localized pricing, US+PH availability) not yet created — Play Console requires at least one uploaded build first; an Internal Testing AAB build is in progress. |

## Planned (not integrated yet)

| Third party | Role | What it will handle | Status |
| --- | --- | --- | --- |
| **Apple Developer Program** | iOS distribution | Enrollment (annual fee), App Store Connect app record, StoreKit in-app purchases + 7-day free trial ($9.99/month, $69/year, 7-day trial: owner decisions 2026-09-22 and 2026-09-26) | Not enrolled. Blocks iOS builds and StoreKit sandbox testing. |
| **Sign in with Apple** | Auth provider | Apple sign-in on iOS (Supabase native ID-token flow, `expo-apple-authentication`) | In the iOS launch scope (owner decision 2026-09-21; also answers App Store Guideline 4.8). Code built (`mobile/lib/auth/apple-sign-in.ts`), not yet run on a device. Needs Apple Developer enrollment and the Supabase Apple provider (`mobile/README.md`). |
| **Anthropic (Claude API)** | AI extraction | Parsing purchase-notification emails and receipt photos (`claude-sonnet-5`, vision) — V2 | Post-launch. `ANTHROPIC_API_KEY` is a placeholder only; not in use. |
| **Inbound-email provider** | Email ingestion (V2) | Per-user inbound address → webhook → `EmailAdapter` | Undecided: Cloudflare Email Routing / Postmark / Mailgun (`docs/roadmap.md`). |

## Ruled out

- **Stripe / any web billing** — web has no customer checkout; billing is Apple IAP + Google Play Billing only.

## Gaps noticed (not planned in any doc — decide before launch)

- **Auth email delivery.** No custom SMTP is documented; Magic Link mail rides Supabase's built-in sender, which is heavily rate-limited (the staging project's Auth settings show `rate_limit_email_sent` = 2 per hour) and not meant for production volume. Custom SMTP is needed before launch (provider not chosen).
- **Error monitoring / analytics.** No crash reporting, product analytics or uptime monitoring appears in the code or docs.
