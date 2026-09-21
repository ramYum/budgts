# Budgts V1 Monetization — Implementation Design

**Status:** authoritative for the V1 subscription implementation (2026-09-21). Where this differs from
`2026-09-18-monetization-ledger-design.md` (the financial ledger) or `2026-09-17-mobile-app-launch-design.md`, this
document reflects the owner's later decisions and says so.

## 1. The model (owner decisions)

- **14-day free trial, store-managed.** The user explicitly taps *Start your 14-day free trial*; Apple/Google handles
  payment authorization. It never starts silently — not at sign-up, sign-in, currency choice, onboarding, first Home, or
  bank connect. It auto-converts to paid and auto-renews unless cancelled before the trial ends. There is no second
  "Subscribe" step. (The earlier specs said 7 days; **14 supersedes them**.)
- **Apple App Store on iOS, Google Play on Android, RevenueCat as the normalization/entitlement layer** — already
  locked in the mobile launch spec, so no new vendor was introduced.
- **Plaid stays exclusively for financial-data connectivity.** A linked bank never authorizes, funds or implies consent
  to a Budgts subscription. **No web billing in V1** (no Stripe/ACH/card collection); the entitlement domain is
  provider-neutral so a web provider can plug in later.

## 2. Architecture

```
 mobile app ──► store sheet ──► Apple/Google ──► RevenueCat ──webhook──► /api/billing/webhook/revenuecat
     │                                                  ▲                          │ verify → map → ONE transaction:
     │  GET /api/billing/entitlement                    │ GET /v1/subscribers      │   billing_events (dedupe/audit)
     └► POST …/entitlement/refresh ─────────────────────┘ (secret key, server)     │   ledger (only real charges)
            (server reconciles, then answers)                                       └►  entitlements (reducer)
```

Everything above the adapter boundary is provider-neutral:

| Layer | Files | Knows RevenueCat? |
| --- | --- | --- |
| Domain: model, `hasPremium`, view-model | `src/lib/billing/entitlement.ts` | no |
| Domain: events, reducer | `events.ts`, `reducer.ts` | no |
| Adapter: verify / map / reconcile | `src/lib/billing/revenuecat/*` | **only here** |
| Persistence, ledger writer, processor | `store.ts`, `ledger.ts`, `processor.ts`, `db.ts` | no |
| Services, reminders, gate, HTTP | `service.ts`, `reminders.ts`, `gate.ts`, `http.ts`, `src/app/api/billing/**` | no |
| Mobile | `mobile/lib/billing/*` | only `revenuecat-purchases.ts` |

**The server is authoritative.** `hasPremium(entitlement, now)` is the one access decision. A live state is never trusted
past its `accessUntil`, so a missed expiration webhook cannot grant Premium forever. Nothing depends on React state,
AsyncStorage, a purchase-success screen, or a client boolean.

## 3. Schema (migrations 0021, 0022)

Migration numbering: the deletion hardening owns **0017–0020**. The monetization ledger WIP, which used to claim 0017,
is **0021** (byte-identical DDL; re-stamped after 0020). The V1 entitlement + event log is **0022**. Anything mentioning
"migration 0017" in the ledger/mobile specs means the ledger, now 0021.

- **`entitlements`** (0022) — one authoritative row per user: `state` (none · trialing · active · grace · expired ·
  revoked), `provider`, `store`, `product_id`, `will_renew`, `trial_started_at`, `trial_ends_at`, `access_until`,
  `last_provider_event_at` (ordering guard), `last_reconciled_at`, `renewal_price_*` (provider-reported, never
  invented), and the reminder claim columns. CHECKs make illegal states unstorable (an entitled state must carry
  `access_until`; a trial its authoritative end). Owner-read RLS only; every write is server-side.
- **`billing_events`** (0022) — append-only, idempotent: unique `(provider, provider_event_id)`; identity and the
  **redacted** payload are frozen by a trigger; `processed / ignored / quarantined` are terminal. Deny-all RLS.
- **Ledger** (0021) — `subscriptions`, `payments`, `redemptions`, `revenue_allocations`, … unchanged from the reviewed
  WIP: RESTRICT foreign keys to `auth.users`, own-read-only RLS, immutable financial-fact triggers. The influencer /
  commission tables are inert in V1 (no writer) but ship with the ledger as designed.

## 4. Trial-only vs paid — the deletion boundary

The trial lives **only** in `entitlements` (CASCADE from `auth.users`). A **free trial is an access event with no
charge**: it never writes a ledger row (`ledger.ts` refuses any amount ≤ 0). The **first actual paid charge** creates the
durable subscription + payment rows, whose RESTRICT foreign keys force Path B. So:

| Case | Ledger | Deletion |
| --- | --- | --- |
| A. trial, never charged | none | **Path A** hard delete; entitlement and events cascade away |
| B. trial converts, charged | subscription + payment | **Path B**: entitlement deleted, ledger + `billing_events` retained |
| C. paid, then cancelled / expired / refunded | historical payment persists | **Path B** |

Proven by `src/lib/account/deletion-billing.db.test.ts` (real `deleteAccount` on real Postgres) and
`tests/unit/db-migration-chain.test.ts`. A late webhook for a deleting/deleted account still ledgers real money but never
recreates the entitlement. Path B deletes the entitlement explicitly and tolerates its absence (`to_regclass`), so the
deletion release can ship before the monetization migrations. Retention durations remain an OPEN legal decision.

## 5. Webhook (`POST /api/billing/webhook/revenuecat`)

Verified against RevenueCat's documentation: `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>` over
`"<t>.<raw body>"` (5-minute tolerance) plus an optional shared `Authorization` value. It **fails closed** — unconfigured
is a refusal, never accept-all. Identity is the verified payload's `app_user_id` (= the Supabase user id), never the URL.
RevenueCat requires a 200 within 60 s and retries up to 5 times: handled outcomes (processed, duplicate, ignored,
quarantined) answer 200; a processing failure answers 5xx and is recorded as `failed`.

One database transaction per event: log + ledger + entitlement commit together or not at all. Dedupe by event id; a
charge is also unique by transaction id, so it cannot be double-recorded even under a different event id. A charge the
system cannot represent (unknown plan, subscription owned by another account) **fails loudly** instead of dropping money.
Events for unknown/anonymous/deleted accounts are logged and ignored. Ordering: the reducer never moves state backward;
the money in a late event is still ledgered.

**Environment fence.** `BILLING_ENVIRONMENT=production|sandbox` decides which store environment a deployment accepts; a
`SANDBOX` event in production (and the reverse) is **quarantined**. Unset defaults to `sandbox`.

## 6. Reconciliation and the refresh endpoint

`POST /api/billing/entitlement/refresh` never reads a body; the only identity is the authenticated user's. The server asks
RevenueCat (secret key, server-side) for its view of that user and reduces the snapshot — the repair path for a missed
webhook and the "restore purchases / after purchase" path. Throttled to once per 30 s per user. A scheduled job
(`/api/billing/reconcile/due`, hourly) re-checks live entitlements. A sandbox subscriber can never grant production access.

## 7. Trial-end reminder

Budgts sends its own reminder ~24 h before the trial converts. The domain (`reminders.ts`) knows the trial end, whether
the reminder is due (only for a trial that will actually convert, i.e. not already cancelled), and whether it has been
sent. `claimReminder` is one atomic `UPDATE … RETURNING` with a lease, so racing workers yield exactly one claim, the same
trial is never reminded twice, an extended trial is reminded again, and a crashed worker's claim expires instead of losing
the reminder. A delivery failure only releases the claim; it never touches access state.

> Approved disclosure before starting the trial: *"We'll send you a reminder one day before your 14-day free trial ends
> and your paid subscription begins."* Reminder copy: *"Your free trial ends tomorrow. Your subscription will
> automatically begin at [PRICE] per [BILLING PERIOD] unless you cancel before then."* (`composeTrialEndReminder`).

**OWNER DECISION — notification delivery (not made here).** The repo has **no** email/push infrastructure (no vendor
dependency in web or mobile; Supabase Auth's built-in magic-link mail is not a general channel and is rate-limited). No
vendor was added. Until a channel is chosen the reminder cron *reports what is due and claims nothing*. Options: push via
`expo-notifications` (Expo Push); transactional email via a provider (e.g. Resend, Postmark); or both. Whichever is picked
implements the one-method `ReminderDelivery` port and gets recorded in `docs/Thirdparties.md`. Note the store also sends
its own trial-ending notices for some trials; Budgts' reminder is in addition.

## 8. Mobile

`mobile/lib/billing/`: a validated server contract, a provider-neutral `PurchasesClient` port (RevenueCat behind it,
public SDK key only), and a purchase flow whose rule is **a store success is not entitlement** — after any purchase,
restore, launch or foreground the flow asks the server and believes only its answer (`not_confirmed`, never `premium`,
if the server does not confirm). `useMonetization()` exposes `hasPremium`, `canStartTrial`, `startFreeTrial`,
`restorePurchases`, `manageSubscription` so the separate Get Started feature needs no provider knowledge. Manage/cancel
opens the store's own page.

## 9. Configuration (names only; never commit values)

| Where | Name | Purpose |
| --- | --- | --- |
| server | `REVENUECAT_WEBHOOK_SIGNING_SECRET` | HMAC secret of the webhook integration |
| server | `REVENUECAT_WEBHOOK_AUTH` | (optional) the integration's Authorization value |
| server | `REVENUECAT_SECRET_API_KEY` | secret REST key, reconciliation only |
| server | `BILLING_ENVIRONMENT` | `production` or `sandbox` — which store environment this deployment accepts |
| server | `CRON_SECRET` | already used by the Plaid poller |
| mobile (public) | `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `…_ANDROID_API_KEY` | RevenueCat public SDK keys |

Production and staging use separate RevenueCat projects/keys/secrets. `supabase/billing-cron.sql` schedules the two cron
routes (run by hand per environment, after the migrations).

## 10. Blocked on the owner / external (not fabricated)

1. **Apple Developer + Google Play Console enrollment** and subscription products (monthly $9.99, annual $69, each with a
   14-day free introductory offer) — and their RevenueCat offering/entitlement mapping. Suggested product ids contain
   `monthly` / `annual`; the mapper also infers the plan from the purchased period's length.
2. **RevenueCat project**: webhook URL, signing secret / authorization value, `app_user_id` = Supabase user id, public and
   secret keys — per environment. RevenueCat's subscriber-object field names used by reconciliation follow the documented
   v1 shape but have **not** been verified against a live sandbox response.
3. **Notification channel** (§7).
4. Apple cannot express *"7-day trial → 3 discounted paid periods → normal price"* in one product (ledger spec §2): the
   influencer-discount path remains an open engineering spike and is unchanged by V1.
5. Refunds are recorded in `billing_events` and revoke access; a ledger reversal row (`revenue_allocation_adjustments`)
   has no writer until the commission program exists.
6. A paying customer whose account was hard-deleted (Path A) while a store subscription is still active will keep being
   charged by the store — deletion UI must tell users to cancel in the store (deletion design §6: communicate, never
   auto-cancel). Events for such a user are logged and ignored, with the amount preserved in the redacted payload.

## 11. Tests

Server-side: reducer (33), RevenueCat adapter (31), persistence/processor (19), services + reminders + gate (22), HTTP (17), deletion ×
billing (8), migration chain from empty (13), mobile (23) — 143 server-side + 23 mobile. Database-level suites run on real embedded Postgres (PGlite) with
the repo's real migration chain, independent of the shared staging database.

## 12. Staging

Staging already holds the ledger DDL (hash-identical to 0021) applied by an earlier drizzle run, so `db:migrate` of the
official 0021 would fail there (`relation "partners" already exists`). See the report for the assessed options; a reset is a
destructive step that needs owner approval.
