# Mobile-only transition — feature audit, retained infrastructure, native architecture, retirement gate

**Status (2026-09-21):** the owner has approved the launch scope, the testing model and the compliance / link infrastructure (§10).
Where a section says *approved* it is decided; the rest is engineering design. Legal wording (Privacy Policy, Terms) is **not** approved
until the owner says so.

Related: `docs/specs/2026-09-17-mobile-app-launch-design.md` (the launch track), `docs/roadmap.md`, `docs/workflow.md`.

## 1. Owner decisions

1. **Web UI is not retired yet.** Retire it only after the native apps cover all launch-required functionality and that functionality
   has been tested successfully. Not every web screen must be copied into mobile.
2. **No supported consumer web product after the retirement gate.** The earlier "the web product stays free" decision is superseded.
   The web/server layer the native apps, integrations, callbacks, webhooks, compliance, legal / support pages and account deletion need
   is preserved.
3. **Launch scope (approved):** keep the group-1 list in §3, **except Goals, which moves to after launch.** Category management and
   in-app CSV export stay post-launch. "Show me around" is optional unless onboarding quality needs it.
4. **Sign in with Apple is in the iOS launch scope**, alongside Magic Link and Google.
5. **Testing model (approved, §8):** unit / component, staging contract + integration, a small Maestro suite, real-device testing.
   **No paid testing infrastructure yet.**
6. **Compliance and native-link infrastructure (approved to build, §5):** privacy, terms, support and public deletion-request pages;
   Apple universal-link and Android app-link association; Plaid native OAuth return. The owner approves the Privacy Policy and Terms
   wording before it is treated as final or public.

## 2. What the audit found

**Native today** (`mobile/`): sign-in (Magic Link, Google), branded sign-in, session handling, a read-only **Home** over
`GET /api/mobile/home`, a diagnostics screen, and the billing code (`useMonetization()` — trial / purchase / restore / manage) with
**no UI on top of it**. No navigation beyond Home, no Plaid, no transactions, budgets, accounts, Settings, paywall, onboarding or
account-deletion screen.

**Backend reachable from native at the start of this work:** only `/api/mobile/home`, `/api/mobile/session`, `/api/billing/entitlement`
(+ `/refresh`) and `/api/account/delete` accepted a Bearer token.

**The transport gap.** Every web mutation (transactions, budgets, accounts, categories, onboarding) is a Next.js **Server Action**, and the
Plaid routes (`/api/plaid/link-token`, `exchange`, `item`) were **cookie-only**. A Server Action cannot be called from React Native.

**The web screens are the only implementation of the product today.** Recurring / subscription / bill detection runs server-side, but
**no screen shows it on web either**.

## 3. Classification

Groups: **1** required natively before launch · **2** useful, deferrable past launch · **3** web/server-only, remains (§5) · **4**
obsolete, safe to retire (only after the §7 gate).

| Feature | Web today | Native | Group | Notes |
| --- | --- | --- | --- | --- |
| Sign-in: Magic Link, Google | ✅ | ✅ code done (device re-test pending) | 1 | |
| **Sign in with Apple (iOS)** | ❌ | ✅ code; needs Apple Developer + Supabase Apple provider | 1 | Approved. `expo-apple-authentication` → Supabase `signInWithIdToken` (no browser deep link). Needs Apple Developer enrolment + Supabase Apple provider (external) |
| Sign-out | ✅ | ✅ | 1 | |
| First-run currency choice / onboarding | ✅ enforced by layout redirect | ✅ code (Get Started); device test pending | 1 | A native-only new user has no way to set a currency |
| Home (Money Left, Savings Rate, spending) | ✅ | ✅ read-only | 1 | Deeper drill-downs can follow |
| Connect bank (Plaid Link, incl. OAuth banks) | ✅ `react-plaid-link` | ❌ | 1 | Needs `react-native-plaid-link-sdk` (dev / EAS build), Bearer link-token / exchange, HTTPS universal / app-link redirect |
| Connected banks: status, reconnect, disconnect, "exclude from totals" | ✅ | ❌ | 1 | No silent failure states: held / stale / errored items must be visible and fixable |
| Transactions: list, search, filter | ✅ | ✅ Activity tab (keyset paging) | 1 | |
| Edit / categorize / transfer toggle; needs-category queue | ✅ | ✅ edit form; list flags `uncategorized` | 1 | No dedicated queue screen — a filter tap surfaces them |
| Manual entry: add, edit, delete | ✅ | ✅ (idempotent create) | 1 | "Manual entry remains a permanent fallback" |
| Budgets: view vs actual, set, copy from last month | ✅ | ✅ Budgets tab | 1 | |
| Accounts: list, add manual, archive, importing toggle | ✅ | ✅ list, add, rename, archive | 1 | The importing indicator (mid-sync state) is not shown yet |
| Trial / paywall, Restore Purchases | ❌ (no web billing) | ✅ screen (runs once store products exist) | 1 | Store requirement; needs UI |
| Subscription status + Manage Subscription | ✅ page | ✅ Settings | 1 | |
| Delete account (in-app) | ✅ page | ✅ screen | 1 | Apple requires in-app initiation; `/api/account/delete` is ready |
| Profile (email) and Settings shell | ✅ | ✅ | 1 | The "required Settings / account-management surfaces" release-gate item |
| Privacy / terms / support links in app | ❌ | ✅ links; hosted pages built as drafts | 1 | Legal wording awaits owner approval (§5) |
| Get Started flow (currency → connect bank → trial) | ❌ (tour removed) | 🔄 currency step built; bank + trial steps pending | 1 | Approved direction |
| **Savings goals** | ✅ | ❌ | **2** | **Deferred until after launch (owner, 2026-09-21)** |
| Category management: create, rename, archive | ✅ | ❌ | 2 | Post-launch (owner). Seeded categories + a picker cover launch |
| CSV export (in-app) | ✅ route | ❌ | 2 | Post-launch (owner). The route is kept |
| "Show me around" walkthrough | ❌ | ❌ | 2 | Optional |
| Insights | ✅ | ❌ | 2 | The Net Worth tab was never built |
| Recurring / subscription / bill screens, confirm & mute controls | ❌ | ❌ | 2 | Backend only today |
| In-app Help, About, Security, Appearance pages | ✅ static | ❌ | 2 | Replaced by a hosted support URL |
| Realtime auto-refresh, month-navigation chrome | ✅ | n/a | 4 | Native uses pull-to-refresh |
| Tour, "How Budgts Works" | removed (`7468365`) | — | 4 | Already gone |
| PWA shell: manifest, service worker, `/offline`, PWA icons, install prompt | ✅ | n/a | 4 | |
| Desktop sidebar, bottom-nav, responsive web layout | ✅ | n/a | 4 | |
| The web screens (Home, Budgets, Activity, Goals, Accounts, Insights, Connected Banks, More, Settings tree, onboarding) | ✅ | n/a | 4 | Retire only at the §7 gate |
| Web Server Actions that only serve those screens | ✅ | n/a | 4 | Retire with the screens; check for shared callers first |

## 4. Implementation sequence (approved scope, engineering-ordered)

Foundations first, so later features are thin. Each step ships with tests and keeps the web working.

1. **Native API foundation** (§4A): the Bearer route helper, the typed native API client, the shared-service pattern.
2. **Profile + currency onboarding**, native navigation shell, **Settings** (profile, sign-out, subscription status / Manage
   Subscription, paywall + Restore Purchases, delete account, legal / support links), **Get Started**.
3. **Sign in with Apple** (iOS).
4. **Compliance and native-link infrastructure** (§5): hosted pages with draft content, association files, Plaid native redirect
   parameters.
5. **Accounts, categories (read), transactions** (list, search / filter, categorize, transfer toggle, manual add / edit / delete).
6. **Budgets.**
7. **Native Plaid Link** + connected banks (status, reconnect, disconnect, exclude), OAuth return via universal / app links.
8. **Maestro** suite scaffolding for the critical flows (§8), then real-device verification on iOS and Android.

## 4A. Native transport architecture (decided 2026-09-21)

1. **One trusted boundary.** Native reads and writes data only through **Bearer Route Handlers** under `/api/mobile/*`, plus the existing
   `/api/billing/*` and `/api/account/delete`, and `/api/plaid/*` once it accepts Bearer. The device holds a Supabase session for **auth
   only** (sign-in, refresh, sign-out); it does not read or write data tables directly. Rationale: server-side validation, ledger
   semantics (`landTransaction`, transfer / event-role / budget-effect rules, sign convention) and business rules stay in one place; the
   API contract can be versioned while tables change without shipping an app update; server-only work (Plaid, billing, deletion) has to be
   server-side anyway, and one boundary is easier to secure, rate-limit and audit than two. RLS remains defense in depth: the handler's
   Supabase client carries the caller's own JWT (`getBearerContext`), so `auth.uid()` scopes every query.
2. **Shared domain services, not cloned actions.** The logic of each mutation lives in `src/lib/<area>/` as a validated
   `(supabase, userId, input) → result` function. The web Server Action and the mobile Route Handler are thin adapters over it — one
   implementation of every rule. A capability is extracted when native needs it, in the same change as the web action switching to it,
   covered by the existing tests. Actions the web retires later disappear with the web.
3. **Resource-oriented endpoints with explicit view-models,** as `/api/mobile/home` does: `GET` read models composed from the existing
   loaders (`src/lib/budget/home-data.ts` and the budgets / transactions view-models), JSON in and out, stable machine error codes
   (`{ error, fieldErrors? }`), `Cache-Control: private, no-store`, cursor pagination for lists, and no user or month chosen by request
   parameters that could cross accounts. Money stays integer minor units on the wire.
4. **Server-only responsibilities stay server-side and never reach the device:** Plaid `access_token`, link-token creation, token exchange,
   disconnect and sync nudges; billing / entitlement decisions; account deletion; anything using a secret. The device sends a
   `public_token` and receives view-models.
5. **Retries and idempotency.** Mobile networks retry, so creates that could duplicate (manual transactions) accept a client-generated
   request id and are idempotent.
6. **Native client:** one typed `apiFetch` (Bearer from the Supabase session, refresh on 401, error-code mapping) under
   `mobile/lib/api/`; per-resource contracts in `mobile/lib/<area>/contract.ts` with drift tests, the way Home's contract works. `mobile/`
   is its own package, so it cannot import `src/lib`; the wire contract is the shared surface.
7. **Where direct device access to Supabase is allowed:** Auth only. Anything else needs a written reason here.

## 4B. Implementation status (2026-09-21)

**Built:** the shared Bearer route helper; profile + currency onboarding; a shared command layer for transactions, accounts and
budgets (the web Server Actions are now thin adapters over it); the native data API v1 — `/api/mobile/{profile, onboarding,
transactions, transactions/:id, accounts, accounts/:id, categories, budgets, budgets/copy}`; the privacy / terms / support /
account-deletion pages (draft wording) and the association-file routes; Sign in with Apple; the native shell — profile gate, Get
Started (currency), Settings (subscription, restore, manage, legal links, delete account, sign-out) and the paywall; and native
**Activity** (list, search, category filter, keyset paging), **add/edit manual transaction** (idempotent create, server field
errors, optimistic-conflict handling), **Budgets** (view vs actual, inline set, copy last month) and **Accounts** (list, add,
rename/retype, archive) screens. A shared `invalidate()` signal keeps Activity, Budgets, Accounts and Home in sync after a save.

**Verified:** web unit suite (1210 tests), mobile suite (198), typecheck and the CI-equivalent build both green; and a **live
contract test on the deployed staging server** (`tests/e2e/mobile-data-api.spec.ts`) covering the currency-set-once rule, idempotent
creates, keyset paging, filters, budgets and — the important one — that one user cannot see or change another's data. **Not
verified:** anything on a device or emulator; the native screens are typechecked and unit-tested (pure logic) but have not been run.

**Still to build (group 1):** native Plaid Link and the connected-banks screen (needs Bearer link-token / exchange / item routes
with the native parameters, `react-native-plaid-link-sdk` and a dev build); the Get Started bank and trial steps; the Maestro suite;
and real-device verification. **External:** Apple Developer enrolment and the Supabase Apple provider; RevenueCat and the store
products; the association identifiers (`APPLE_APP_ID`, `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256`); `SUPPORT_EMAIL`; and the
owner's final legal wording.

## 5. Web/server surface that must remain, and compliance / link infrastructure

| Route / asset | Status |
| --- | --- |
| `/api/mobile/*`, `/api/billing/*` (entitlement, refresh, reconcile + reminders cron, **RevenueCat webhook**) | Kept |
| `/api/plaid/*` (link-token, exchange, item, **webhook**, sync-due, recurring-scan; `test/seed` staging-only) | Kept; link-token / exchange / item gain Bearer support and the native parameters (`android_package_name`, app-link `redirect_uri`) |
| `/api/account/delete` | Kept |
| `/api/export/transactions` | Kept (in-app export is post-launch) |
| `/auth/callback`, `/sign-in` | Kept: Supabase falls back to the Site URL on a redirect mismatch; the web deletion request needs sign-in |
| `/plaid-oauth` | Kept while the web UI lives; native uses an HTTPS universal / app-link redirect |
| `/manage-subscription` (public) | Kept: linked from the reminder email |
| Web account-deletion entry (`/settings/delete-account`) | Kept; the **public deletion-request page** (below) is the store-facing path that needs no app |
| `src/proxy.ts` | Kept |
| **Being built (approved):** Privacy, Terms, Support, public account-deletion-request pages; Apple `apple-app-site-association`; Android `assetlinks.json`; Plaid native OAuth return | Structure and **draft** content only. The Privacy Policy and Terms wording is **not final until the owner approves it** |
| Vercel (`budgts`, `budgts-staging`), `budgts.com` DNS, Supabase Auth Site URL, `pg_cron` jobs | Kept |

Association files need identifiers the owner's accounts provide (Apple Team ID, bundle id, Android package and signing-certificate
fingerprint). They are configuration values, read from environment variables, and the endpoints answer 404 until set — never a wrong
guess.

## 6. What can eventually be retired (group 4)

At the §7 gate: the web screens and their layout / nav components, the PWA shell (manifest, `sw.js`, `sw-register`, `/offline`, PWA
icons), the web Plaid Link components, the Server Actions that serve only those screens, and the web e2e specs for them (`budgets`,
`goals`, `transactions`, `settings`, `plaid`, `no-tour`). Kept: `smoke`, `delete-account`, `mobile-bearer-auth` and anything covering
group 3.

## 7. Retirement gate

The web UI is retired only when **all** hold: (1) every group-1 item is built natively; (2) each was verified on real iOS and Android
devices, including a Plaid OAuth bank, deletion with a paid history, and sandbox purchase / restore / cancel; (3) the group-3
infrastructure is confirmed independent of the UI being removed (a route-by-route dependency check); (4) existing web users have a
path to the native app (same Supabase account) and notice; (5) the owner approves. Until then the web stays live and is
bug-fix-only.

## 8. Native testing (approved model)

Playwright remains valid for the retained web / server surfaces. The native model, approved 2026-09-21:

1. **Unit / component tests** in `mobile/` (Vitest) for most coverage, and for `src/lib` services.
2. **Staging Bearer / API contract and integration tests** for every `/api/mobile/*` route, extending `tests/integration` and
   `mobile-bearer-auth.spec.ts`.
3. **A small Maestro suite** of critical native flows (sign-in through a Supabase-generated `token_hash` deep link, currency onboarding,
   manual transaction, budget, delete account), Android emulator first, iOS via macOS CI / EAS later. Maestro's CLI is free and open
   source; **Maestro Cloud and other paid runners are not purchased.** The repo is prepared for it (flows under `mobile/.maestro/`,
   stable `testID`s on native controls).
4. **Real-device / TestFlight / Play internal testing** for what needs real platform behavior: Plaid OAuth banks, Google and Apple
   sign-in, cold / warm deep links, sandbox purchase / restore / cancel, deletion with paid history.

**Definition of Done:** unchanged for now. It is updated only once the Maestro suite exists and the native "one e2e per feature"
standard can be stated accurately.

Constraints on this machine: Windows, no Android SDK or emulator, no iOS — builds go through EAS, and iOS verification needs a Mac, a
CI runner or a physical device.

## 9. Risks and blockers

- **Scope:** native covers 2 of the group-1 rows so far (sign-in, a read-only Home); §4 is the sequence.
- **Build tooling:** native Plaid and Sign in with Apple need a dev / EAS build (not Expo Go for the native modules); iOS builds need an
  Apple Developer enrolment that has not been done; `com.budgts.app` is still provisional.
- **No device verification is possible on this machine**; none has been done for native auth yet.
- **Plaid OAuth on native** needs the association files, redirect URIs in the Plaid dashboard, and probably a Plaid review — external lead
  time.
- **Legal content** (privacy, terms) is the owner's to approve; store submission is blocked until it is final.
- **Apple guideline 4.8** is answered by adding Sign in with Apple.
- **Existing web users:** the owner's own production accounts (three Plaid-connected) live on the web product today.

## 10. Owner decisions — resolved log

| # | Decision | Result |
| --- | --- | --- |
| 1 | Group-1 scope | Approved; Goals deferred; category management, in-app CSV export post-launch; "Show me around" optional |
| 2 | Launch spec "web stays free" lock | Superseded — no supported consumer web after the gate; server layer preserved |
| 3 | Native e2e approach | Approved model (§8); no paid infrastructure; DoD updated later |
| 4 | Compliance + native-link pages | Approved to build; legal wording awaits owner approval |
| 5 | Sign in with Apple | Added to the iOS launch scope |

**Open, owner:** the final Privacy Policy and Terms text; Apple Developer / Google Play enrolment and the identifiers the association
files need; Plaid dashboard redirect URIs; any Maestro Cloud / paid runner spend.
