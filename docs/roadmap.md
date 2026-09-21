# Budgts Roadmap

## Goal

Launch Budgts as a commercial budgeting app on the **Apple App Store and Google Play Store**, initially targeting **500+ paying users**.

Every major feature must:

* work across supported users, accounts, banks, and time zones
* avoid silent failure states
* have recoverable error states
* preserve customer data integrity
* scale beyond the initial user target without requiring a major rewrite

Manual transaction entry remains a permanent fallback.

---

## Current Product State

### Core budgeting ✅

* Categories and spending tracking
* Budgets vs actual
* Savings goals
* Money Left
* Savings Rate

### Plaid ingestion ✅

* Production bank linking
* Transaction synchronization
* Automatic categorization
* Transfer handling
* Account exclusion controls
* Manual entry fallback

### Recurring intelligence ✅ / partially complete

* Recurring transaction detection
* Subscription detection
* Bill detection
* Paired-transfer detection

Remaining:

* User-facing confirmation / mute controls where needed

### Web / PWA — being retired

Budgts is mobile-only (iOS and Android). The user-facing web/PWA product is not a supported surface going forward.
It is still what production serves today, and it is the only implementation of much of the product until the native
app reaches parity.

**Owner decision:** do not retire the user-facing web/PWA yet. Retire it only after the native apps cover all
launch-required functionality and that functionality has been tested successfully. Not every current web screen must be
copied into mobile. The feature audit, retained-infrastructure list and retirement gate are in
`docs/specs/2026-09-21-mobile-only-transition-design.md` (classification pending owner sign-off).

The web/server layer is kept where the native apps or outside services need it:

* backend APIs
* auth / OAuth callbacks
* Plaid webhooks and OAuth return
* RevenueCat webhook and cron endpoints
* account-deletion path
* legal / privacy / support pages

### Native mobile 🔄 CURRENT

Expo + Expo Router mobile application is actively being built for iOS and Android.

Implemented or underway:

* Mobile authentication
* Plaid mobile integration
* Native app navigation
* Account deletion/provider handling
* Subscription purchase flow
* Manage Subscription experience
* Shared backend/domain integration

---

# Current Priority — Mobile Launch

The active goal is to ship the existing Budgts product as native iOS and Android applications.

This phase focuses on **delivery and launch readiness**, not expanding into major new financial features.

## Mobile launch work

### 1. Core mobile application 🔄

* Native implementation of the existing Budgts experience
* Authentication (Magic Link, Google, and Sign in with Apple on iOS)
* Plaid linking
* Deep links
* Core budgeting screens
* Account/settings flows

Launch scope is the audited set in `docs/specs/2026-09-21-mobile-only-transition-design.md`. Deferred until after launch: savings
goals, category management, in-app CSV export; "Show me around" is optional.

### 2. Onboarding / first-run experience ⏳

Approved direction:

**Get Started → optional “Show me around”**

The previous tour implementation has been removed.

The replacement should help new users understand Budgts without forcing a long tutorial before they can use the app.

### 3. Monetization 🔄

Mobile subscriptions use:

* Apple App Store billing
* Google Play Billing
* RevenueCat

Current code includes:

* billing domain
* RevenueCat adapter
* mobile purchase flow
* Manage Subscription pages
* billing/account integration tests
* migrations `0021` and `0022`

Current subscription direction:

* Monthly and annual plans
* **14-day trial**
* Mobile subscriptions only

Next work:

* RevenueCat external configuration
* Apple subscription products
* Google Play subscription products
* Sandbox purchase testing
* Restore / cancel / entitlement verification

### 4. Transactional email ⏳

Resend is planned for transactional email where appropriate.

External setup and actual email flows remain to be completed.

### 5. Store readiness ⏳

* Apple Developer configuration
* Google Play Console configuration
* Privacy / data disclosures
* Hosted privacy policy, terms, support and account-deletion-request pages
* Account deletion verification
* Subscription disclosures
* Store metadata and screenshots
* Internal / sandbox testing
* TestFlight
* Google Play internal testing
* Store submission

---

# Release Gate

Before the mobile launch is considered ready:

* Core mobile flows work end to end
* Plaid works on supported mobile platforms
* Subscription lifecycle is tested
* Restore Purchases works
* Account deletion satisfies store requirements
* Production credentials are configured safely
* Production hosting is on a plan appropriate for commercial launch
* Production authentication email delivery / custom SMTP is ready
* Required mobile Settings / account-management surfaces are complete
* Production migrations are explicitly approved
* CI is green
* App Store / Play Store compliance checks are complete
* Beta testing is completed

PRs remain separate from `main` until the relevant work is reviewed and approved.

---

# Parallel Track — Scale & Infrastructure

Continue measuring real usage rather than prematurely redesigning the architecture.

Monitor:

* Supabase database usage
* database performance
* Plaid synchronization performance
* hosting limits
* API costs
* subscription infrastructure
* production errors

Upgrade or redesign infrastructure when measured limits justify it.

---

# Post-Launch Possibilities

These are **not active development priorities** until Mobile Launch is complete.

## V2 — Financial intelligence

Potential features:

* Email transaction ingestion
* Receipt ingestion
* Advanced spending insights
* Cash-flow forecasting
* Safe-to-spend
* Net worth

## V2+ — AI

Potential features:

* AI financial assistant
* Purchase-affordability questions
* Personalized financial insights
* Proactive recommendations
* Advanced automation

---

# Explicitly Deferred

* Household/shared budgets
* Multi-currency transaction conversion
* Major V2/V2+ development before Mobile Launch

---

## Execution Sources

This file defines **direction and priority**.

Use:

* `docs/workflow.md` for current execution status
* `docs/specs/` for detailed feature decisions
* `docs/Thirdparties.md` for external services
* `CLAUDE.md` for durable engineering rules

Do not turn this roadmap into a detailed development diary.
