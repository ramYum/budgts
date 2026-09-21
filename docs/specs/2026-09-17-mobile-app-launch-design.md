# Mobile App + App-Store Launch — Design

**Status:** authoritative repository specification for this track, promoted
from prior planning-session decisions (2026-09-17 mobile-launch planning,
2026-09-18 monetization planning) and the repository audit run against
`main` after the `budgts-staging` → `budgts-staging-2` replacement was
accepted (staging has since been replaced again, by `Budgets-Staging-3`). **Update 2026-09-21:** this began as a decisions-only
document; the native Home, mobile auth, account deletion and V1 monetization described here are now built on branch
`mobile/native-home` (see `docs/roadmap.md`, Mobile Launch). Store enrolment, RevenueCat / store products and submission are not.
**Update 2026-09-21 (owner):** Budgts is mobile-only; the web/PWA is retired only after the native apps cover all launch-required
functionality and it is tested. That supersedes the "web stays free" line in §1 (owner-confirmed 2026-09-21; the line is left as
history), the §7 open question is answered in `docs/specs/2026-09-21-mobile-only-transition-design.md`, and **Sign in with Apple is
now in the iOS launch scope**, superseding the §4 exclusion.

**Source of truth note.** Where this document states a business/commercial
decision, that decision was made by the app owner in a prior conversation
that is not itself a repository artifact. This file is now what implementers
read — not the original chat. Where a decision was **not** already made, it
is marked `OPEN ENGINEERING DECISION` or `OPEN PRODUCT DECISION` rather than
invented here.

**How to read this document.** Same tagging discipline as
`docs/specs/2026-09-18-monetization-ledger-design.md`:

| Tag | Meaning |
| --- | --- |
| **LOCKED** | Owner-decided; not open for silent reinterpretation |
| **ARCHITECTURE** | Structural design implementing a locked decision |
| **IMPLEMENTATION REQUIREMENT** | Concrete must-do derived from the above |
| **OPEN ENGINEERING DECISION** | Undecided implementation detail; needs investigation (often against a real Apple/Google/RevenueCat sandbox) before it's load-bearing |
| **OPEN PRODUCT DECISION** | Undecided business/product call; needs the owner, not an engineering guess |
| **STORE/LEGAL DEPENDENCY** | External requirement (Apple/Google policy, law) not yet satisfied in this repo |

---

## 1. Purpose and scope

This is the **Mobile App + App-Store Launch** track — the current phase per
`docs/roadmap.md`, immediately following the completed web V1 (Plaid
ingestion) and V1.5 (recurring/transfer/subscription/bill detection) work.

- **LOCKED:** the web product (`budgts.com`) stays free. No web checkout, no
  web customer subscriptions.
- **LOCKED:** paid functionality exists **only** in the iOS/Android mobile
  apps built under this track.
- This track ships **no new financial capability**. The launch scope is
  exactly the product that already exists on web (connect → auto-import →
  auto-categorize → recognize transfers/recurring/subscriptions/bills →
  budgets/goals/Money Left), delivered on a mobile client, plus the
  commercial layer (subscriptions + influencer revenue share) needed to sell
  it.
- **LOCKED:** V2 (email/receipt ingestion, spending intelligence,
  cash-flow forecasting, Safe-to-Spend, net worth) and V2+ (AI financial
  assistant) are **not** an active phase. They remain deferred, post-launch
  possibilities per `docs/roadmap.md` — nothing in this document reopens or
  schedules them. See §16.

---

## 2. Locked product/commercial decisions

Restated here from the owner's locked decisions (full detail, edge cases,
and formulas live in `docs/specs/2026-09-18-monetization-ledger-design.md`
§1 — this section is the launch-doc summary, that spec is the authority on
the financial mechanics):

- Monthly price: **$9.99**. Annual price: **$69**. Free trial: **7 days**.
- Influencer introductory discount: **20%** off the customer-facing price.
  - Monthly: first **3 paid monthly billing periods** only, then reverts to
    $9.99/month.
  - Annual: **first annual purchase** only, then reverts to $69/year on
    renewal.
- Influencer commission: **35%**. Budgts share: **65%**. Split applies to
  **commissionable proceeds**, not gross/list price (see flow below).
- Commission duration: **first 12 calendar months** from the customer's
  first successful paid transaction (`first_paid_at`), anchored once and
  never reset by cancellation, failed payment, pause, grace period,
  resubscription, upgrade, or downgrade.
- **Historical attribution and the terms in effect at the time of a
  transaction are immutable** — editing a `Partner`/`Voucher` later never
  retroactively changes what an existing `Redemption`/`RevenueAllocation`
  meant.
- **Web has no customer subscription checkout** — no Stripe, no web billing
  of any kind for end users.
- Mobile subscriptions run on **native billing**: Apple App Store IAP and
  Google Play Billing.
- **RevenueCat** is the subscription-management/entitlement layer —
  Budgts' backend consumes RevenueCat's normalized event stream, not raw
  StoreKit/Play Billing payloads.
- **Voucher attribution is Budgts-side.** RevenueCat manages billing/
  entitlement state; it does **not** replace or duplicate Budgts'
  attribution/commission accounting, which is a separate ledger owned by
  this repository (migration `0017`).

### Commission flow

```
customer payment
  → platform fees / taxes / adjustments (Apple's or Google's own cut)
  → commissionable proceeds
  → 35% influencer / 65% Budgts
```

**IMPORTANT — do not hardcode an assumed platform fee percentage as a
product rule.** Apple and Google each set and independently change their
own commission rates (and have historically run tiered/stepped rates). The
platform's cut is captured in the **versioned** `platform_commission_rates`
table (migration `0017`, one row per platform, append-only, at most one
open row per platform at a time) and resolved at allocation time — it is
configuration data, not a constant anywhere in code. See monetization spec
§2.4 and §1.3 for the exact `commissionable_proceeds` formula.

---

## 3. Mobile technology architecture

**ARCHITECTURE (carried forward from the 2026-09-17 planning session and
`docs/roadmap.md`'s "Native apps" delivery-track note):**

- **React Native** via **Expo**, using **Expo Router** for navigation.
- **EAS Build** for native iOS/Android builds — required rather than
  optional, since the owner develops on Windows and cannot produce an iOS
  build locally.
- Native Plaid SDK (`react-native-plaid-link-sdk`) for the Link flow on
  device (see §5).
- **`@supabase/supabase-js`** (the standard client, not the `@supabase/ssr`
  cookie-based client) for native authentication and session handling (see
  §4).
- Secure native session storage (Expo SecureStore or equivalent — see §4
  for what's unresolved).
- Native deep-link authentication / PKCE for the OAuth and magic-link
  callback (see §4).
- The existing Next.js web application **remains intact, unchanged in
  behavior** — this track adds a mobile client and a shared backend surface,
  it does not migrate or replace the web app.
- The existing **server-side Plaid pipeline is shared** between web and
  mobile — see §5.

### What's reusable, what's rebuilt, what needs a new transport

| Layer | Example | Mobile treatment |
| --- | --- | --- |
| Pure domain logic | `src/lib/budget/*`, `src/lib/ingestion/*`, `src/lib/plaid/*` (sync/categorization/transfer-pairing/recurring/subscription/bill detection) | **Reused directly** — framework-agnostic, no Next.js imports, already exercised by the DB-integration and Plaid-integration suites against real data |
| Validation | `src/lib/validation/*` (Zod) | **Reused directly** — schemas are plain Zod, importable from any TypeScript context |
| Auth/session plumbing | `src/lib/supabase/server.ts`, `client.ts`, `src/proxy.ts` | **Rebuilt** — cookie/middleware model doesn't apply to a native client (§4) |
| Mutations | `src/server/*.ts` (`"use server"` Server Actions) | **Needs a new transport** — Server Actions are a Next.js/React RPC mechanism, not callable from React Native (§6) |
| Plaid Link UI | `react-plaid-link` (`src/components/plaid/connect-bank.tsx`) | **Rebuilt** — native uses a different SDK entirely (§5) |
| Plaid server routes | `/api/plaid/{link-token,exchange,webhook,sync-due}` | **Reused as-is**, once their auth check accepts a mobile session (§4, §5) |
| UI/screens | `src/app/(app)/**`, `src/components/**` | **Rebuilt** natively (Expo Router) — reusing the IA and the view-model outputs underneath, not the JSX (§7) |

---

## 4. Authentication architecture

### Current — web

- `@supabase/ssr`, cookie-based sessions (`createServerClient` in
  `src/lib/supabase/server.ts`, `createBrowserClient` in
  `src/lib/supabase/client.ts`).
- Session refresh + route gating in Next.js middleware (`src/proxy.ts`,
  named `proxy` per the Next 16 rename).
- Sign-in methods: magic link (`signInWithOtp`) and Google OAuth
  (`signInWithOAuth`), both completing through `/auth/callback` (handles
  either a PKCE `code` or a direct `token_hash`+`type` verification).

### Mobile sign-in methods — LOCKED (2026-09-19)

- **Magic Link — LOCKED.** Mobile ships the same passwordless email flow as
  web, adapted to the native auth architecture below.
- **Google OAuth — LOCKED.** Mobile ships Google sign-in, adapted to the
  native auth architecture below (PKCE + deep-link callback instead of a
  browser redirect to a cookie-based session).
- **Sign in with Apple — NOT INCLUDED INITIALLY.** Explicitly excluded from
  the initial mobile launch scope by owner decision. This is a scope
  decision, not a compliance determination — whether Apple's App Review
  Guideline 4.8 *requires* it anyway, given Google OAuth is offered, is a
  separate, still-open question (see §10 and the Decision Register — do not
  read "not included initially" as "compliance risk resolved").
- **Web authentication is unchanged by this decision.** Web keeps exactly
  the sign-in methods it has today (magic link + Google OAuth via
  `@supabase/ssr`/cookies, §4 "Current — web" above). This document does not
  redesign, add to, or remove anything from web auth.
- **IMPLEMENTATION REQUIREMENT:** do not silently add a further mobile
  sign-in method (e.g. password auth, another OAuth provider) without
  routing that decision back through this document first — the same
  discipline the monetization spec applies to its own LOCKED rules.

### Mobile — architecture

This follows directly from the two locked methods above — nothing here
introduces a third method or a different mechanism per method:

- **`@supabase/supabase-js`** (standard client), not the cookie-based SSR
  client, for both Magic Link and Google OAuth on mobile.
- **Native persistent session storage** — secure storage such as Expo
  SecureStore, so the access/refresh token pair survives app restarts
  without living in plain storage.
- **PKCE** for the Google OAuth flow, completing via a **deep-link
  callback**. Magic Link uses the same deep-link callback mechanism for its
  own confirmation link. Expected callback shape:
  **`budgts://auth/callback`** — this is the intended URL scheme; the
  scheme itself is not yet registered anywhere in this repository (no
  `app.json`/Expo config exists yet, since no mobile project has been
  created).
- **IMPLEMENTATION REQUIREMENT:** every mobile request that reaches the
  backend must authenticate with the user's own session/token. The backend
  **must verify the user's identity server-side** on every such request —
  a client-supplied user id is never trusted, matching the same posture the
  monetization spec requires for entitlement (§2.9/§4.9 there) and the
  existing `getSessionUser()`/`requireUser()` pattern already uses for
  cookies.
- **IMPLEMENTATION REQUIREMENT:** service-role credentials (`SUPABASE_SECRET_KEY`)
  never reach the mobile client, under any circumstance — mirrors the
  existing rule that this key is server-only today.

### Unresolved

- **OPEN ENGINEERING DECISION:** whether existing Route Handlers
  (`getSessionUser()`, cookie-only today) get a mobile-compatible auth path
  added in place, or whether mobile calls a parallel set of handlers, is not
  decided. Either is a routine, well-understood change — genuinely just not
  chosen yet.
- **STORE/LEGAL DEPENDENCY (unchanged by the decision above):** whether
  Apple Guideline 4.8 requires an Apple-equivalent sign-in option anyway,
  given Google OAuth ships and Sign in with Apple does not, must be
  verified against the final mobile implementation before App Store
  submission — see §10.

---

## 5. Plaid architecture

- Web currently uses **`react-plaid-link`** (the browser Link SDK) —
  `src/components/plaid/connect-bank.tsx`, `link-handoff.tsx`,
  `oauth-storage.ts`.
- Mobile will use **`react-native-plaid-link-sdk`** — Plaid's separate
  native module. Not installed; not evaluated beyond being the vendor's
  documented native package (no version pinned, no integration attempted).

### Shared, unchanged

The entire server-side Plaid pipeline is reused as-is for both clients:

- Link-token creation (`/api/plaid/link-token`)
- Token exchange (`/api/plaid/exchange`)
- Sync (`syncItem`, cursor-based `/transactions/sync` handling)
- Webhook handling (`/api/plaid/webhook`, signature-verified)
- Transaction normalization (`src/lib/plaid/adapter.ts`, `land.ts`)
- Categorization (`src/lib/plaid/category-map.ts`, `merchant-knowledge.ts`,
  `merchant-rules.ts`)
- Transfer pairing (`src/lib/plaid/transfer-pairing.ts`)
- Recurring detection (`src/lib/plaid/recurring-detection.ts`,
  `recurring-engine.ts`)
- Subscription classification (`src/lib/plaid/subscription-detection.ts`)
- Bill classification (`src/lib/plaid/bill-detection.ts`)

**IMPLEMENTATION REQUIREMENT:** the mobile client never receives or handles
the Plaid `access_token`. Only the `public_token` (produced by the on-device
Link flow) and ordinary Link UI interaction belong on the device — the
exchange to a long-lived `access_token`, and its encrypted storage
(`plaid_items.access_token_enc`), stay exactly where they are today:
server-only.

### Testing requirements this implies

- OAuth institutions (the redirect-based bank login flow) need deep-link
  handling on mobile, exactly analogous to `plaid-oauth/page.tsx` on web —
  the mobile equivalent isn't designed yet.
- **Physical-device testing is required**, not just simulator/emulator —
  bank OAuth redirects and deep-link handoff are exactly the class of flow
  that behaves differently on-device (this repeats a caution already
  present in the monetization spec for StoreKit; the same caution applies
  here to Plaid OAuth on mobile).

---

## 6. Data/API architecture

Existing separation (unchanged by this track, just now load-bearing for a
second client):

- **Framework-agnostic domain logic** — `src/lib/budget/*`,
  `src/lib/ingestion/*`, `src/lib/plaid/*`, `src/lib/validation/*`. Pure or
  Node-only, no Next.js coupling, already covered by unit +
  DB-integration + Plaid-integration tests.
- **Server-only logic** — anything touching `PLAID_SECRET`,
  `SUPABASE_SECRET_KEY`, `PLAID_TOKEN_ENC_KEY`, or writing
  Plaid-sourced/financial-ledger rows. Must never run on-device.
- **Transport layer** — currently two shapes exist: Next.js Server Actions
  (`src/server/*.ts`, `"use server"`, `FormData`-in, `redirect()`/
  `revalidatePath()`) and plain Route Handlers (`src/app/api/**/route.ts`).
- **Persistence/RLS** — Postgres via Supabase, RLS scoped to `auth.uid()`
  is the isolation boundary for every per-user table, enforced regardless
  of which client is asking.

**IMPLEMENTATION REQUIREMENT — current Server Actions are web/Next.js
transport and cannot simply be called from React Native.** A Server Action
is a React/Next RPC mechanism (a special `POST` with a framework-specific
body encoding), not a plain HTTP endpoint a mobile HTTP client can target
the same way. Mobile needs one of two patterns per mutation:

1. **Direct authenticated Supabase operations** — for simple, RLS-safe CRUD
   where the existing RLS policy already is the correct and sufficient
   guard (e.g. a manually-entered transaction, a budget edit) — the mobile
   client calls `supabase-js` directly with the user's own session, the
   same trust model the web app already uses for its own direct reads.
2. **Authenticated Route Handlers** — for anything server-only or
   domain-sensitive (Plaid-sourced writes via `landTransaction`'s
   dedupe/transfer logic, anything needing a server-only secret, any
   monetization-ledger write) — a plain HTTP endpoint, not a Server Action,
   authenticated the same way as §4's requirement.

**IMPLEMENTATION REQUIREMENT:** financial-domain logic must remain
centralized in `src/lib/budget/*` / `src/lib/plaid/*` / the future
monetization domain modules, and must **not** be duplicated or
reimplemented inside the mobile client. The mobile app consumes the same
functions (directly, since they're plain TypeScript) or the same Route
Handler outputs — it does not grow its own parallel budget-math or
sync-math.

**OPEN ENGINEERING DECISION:** which specific mutations get pattern 1 vs.
pattern 2 is not enumerated anywhere yet — this is ordinary engineering
work to do per-mutation when mobile UI for that mutation is actually built
(§13 step 5), not a design gap blocking earlier steps.

---

## 7. Mobile information architecture

The current web IA is the **conceptual source**, not a UI to port:

Home · Budgets · Activity · Goals · Accounts · Insights · Settings ·
Connected Banks · More · Help · Onboarding · Tour.

The mobile application rebuilds the interface using **Expo Router**,
reusing the domain/view-model logic (§6) and the same screen-to-concept
mapping, but not the JSX/Tailwind implementation — native UI is a different
rendering model (React Native components, not DOM/CSS) and should follow
native platform conventions rather than reproduce the web layout pixel for
pixel.

**OPEN PRODUCT DECISION:** whether every web screen ships in the mobile
v1 (e.g. Insights, the full Settings tree, How-Budgts-Works guide) or a
trimmed launch set, is not decided anywhere this audit found.

---

## 8. Financial correctness/security requirements

Carried forward, unchanged, from the existing web product's principles
(`CLAUDE.md`, `docs/conventions.md`) — mobile does not get a different
financial model:

- The app does bookkeeping **automatically** — user intervention exists for
  ambiguity and exceptions (e.g. "needs a category"), not routine entry.
- Transfers are not spending (`is_transfer`, excluded from every rollup).
- Card payments (the card-network settlement leg) are not spending in their
  own right — only the underlying purchase is.
- Refunds reverse spending — a credit in the original expense category,
  netting against that category's spend, not a separate transaction type.
- Income is income — categorized and summed on its own side of the ledger,
  never netted silently into spend.
- Account movement is not automatically economic activity — a transfer
  between the user's own accounts is not treated as a financial event the
  way a purchase is.
- **Mobile must use these same financial semantics as web** — via the
  shared domain modules (§6), not a reimplementation.
- **RLS is the isolation boundary** for both clients equally.
- **Plaid access tokens remain server-only, encrypted at rest** — no
  exception for mobile (§5).
- **Entitlements cannot be granted by client claims** — a mobile client
  telling the backend "I just bought this" is never sufficient on its own;
  entitlement comes only from a verified RevenueCat/platform event
  (monetization spec §2.9, §4.9, restated here because it's a security
  property of the mobile architecture specifically, not just a business
  rule).
- **RevenueCat/webhook verification is backend-owned** — signature
  verification before any processing, mirroring the existing
  `src/lib/plaid/webhook-verify.ts` pattern (verify → log raw → process →
  mark handled).
- **Financial ledger mutations must remain server-authoritative** — the
  monetization tables (`payments`, `revenue_allocations`, etc.) are
  written only by backend/service-role code paths, never by a client
  insert of any kind, mobile included (monetization spec §3.8).

---

## 9. Monetization architecture

Full design authority: `docs/specs/2026-09-18-monetization-ledger-design.md`.
This section states status only — **it does not re-derive or modify that
spec, and nothing in this document implements any of the items below.**

- **Schema + migration `0017`** (`partners`, `vouchers`, `redemptions`,
  `subscriptions`, `payments`, `revenue_allocations`,
  `revenue_allocation_adjustments`, `payouts`, `payout_allocations`,
  `platform_commission_rates`): **implemented** as migration `0021` (it was numbered `0017` in this
  spec; the deletion work took `0017`–`0020`) and verified on a clean migration chain (`0000`→`0022`) on the
  current staging project (`Budgets-Staging-3`); not applied to production.
- **Update 2026-09-21:** the subscription / entitlement / billing-provider layers of this list have since been built (see
  `docs/specs/2026-09-21-v1-monetization-design.md` and `docs/roadmap.md`, Native apps track). Only the **partner / voucher / redemption /
  revenue-allocation / payout** layers below remain not started (their tables are inert).
- **Everything above the schema is not yet built** *(as originally written; see the update above)*. Outstanding layers:
  - Zod validation for the seven entities
  - Domain calculations (commissionable-proceeds math, §1.3/§2.5 of the
    monetization spec)
  - Commission-window logic (12-calendar-month anchor, §1.4/§2.6)
  - Boundary proration (§1.5)
  - Voucher redemption (server action + rate-limiting/enumeration
    protection, monetization spec §4.9)
  - RevenueCat webhook processing (verify → log → process → mark handled)
  - Entitlement mirror (however mobile learns "is this user currently
    entitled" — not yet designed)
  - Payment/RevenueAllocation processing (the write path that turns a
    verified webhook event into ledger rows)
  - Admin authorization boundary (§9 below repeats this — it blocks the
    admin surface specifically, not the schema or the client-facing
    redemption flow)
  - Payout workflow (manual/ledger-only in this phase — no automated
    payout processing is in scope, monetization spec §5)

**OPEN ENGINEERING DECISION (repeated from the monetization spec's own
§6, not re-litigated here):** rounding mode, calendar-month clamp rule,
multi-voucher attribution precedence, the admin-authorization mechanism,
RevenueCat webhook signature verification mechanics, StoreKit Promotional
Offer sequencing, and Play Console multi-phase offer configuration are all
still open exactly as that spec describes them. See §17 (Decision
Register) for the consolidated list.

---

## 10. Apple requirements

- **Apple Developer Program** enrollment (annual fee) — not yet done.
- **App Store Connect** app record, metadata, screenshots, review
  submission — not started.
- **Native StoreKit** integration for the mobile client — not started.
- **7-day introductory trial**, represented as a standard StoreKit
  Introductory Offer.
- **Promotional Offer** for the influencer discount, applied separately
  from the trial (Apple cannot represent "trial → 3 discounted periods →
  normal price" as one object) — monthly: 20% off, 3 months; annual: 20%
  off, 1 period. Promotional Offers require **server-side signing**.
- **OPEN ENGINEERING DECISION — highest uncertainty in this entire
  document:** the exact StoreKit purchase-flow sequencing for applying the
  Promotional Offer while moving a user out of the trial needs verification
  against a **real Apple developer/sandbox environment** before it can be
  committed to as working code. Carried forward unchanged from
  monetization spec §6 item 1 and §2.7.
- **App Privacy** ("nutrition label") details — not started, depends on
  the final mobile data-collection surface.
- **Mobile account deletion must be supported** (Guideline 5.1.1(v)) —
  required for submission; the architecture is now designed (§12.2) but not
  implemented, and retention periods are still open (§12.4). No
  submission without a working deletion flow.
- **Privacy policy**, **terms** — required before submission, do not exist
  yet (§12). The privacy policy must disclose what account deletion
  deletes, what it may retain, and why (§12.4 drives the exact wording once
  resolved).
- **Sign in with Apple — decision made, compliance question still open.**
  §4 locks mobile sign-in to Magic Link + Google OAuth, with Sign in with
  Apple explicitly not included initially. **This does not by itself
  satisfy or eliminate Apple Guideline 4.8**, which can require an
  Apple-equivalent sign-in option when other third-party sign-in is
  offered. Whether 4.8 applies here **must be re-verified against the
  final mobile implementation** (exact sign-in UI, what "primarily uses"
  vs. "offers" means for this app) before submission — this document
  states the product decision, it does not adjudicate App Review policy.
- Store metadata, screenshots, and the standard App Review checklist — not
  started, ordinary submission work once the client exists.

---

## 11. Google Play requirements

- **Google Play Console** enrollment ($25 one-time) — not yet done.
- **Google Play Billing** integration — not started.
- **Multi-phase offer** architecture: Google **can** represent trial +
  discount + normal price as a single offer object (7-day trial → 20% off
  for 3 billing cycles [monthly] or 1 billing cycle [annual] → normal
  price) — architecturally simpler than Apple's split-offer requirement.
  **OPEN ENGINEERING DECISION (lower severity):** the actual Play Console
  offer configuration should still be verified against a sandbox purchase
  before being relied on (monetization spec §6 item 7, §2.8).
- **Data Safety** form — not started, depends on final data-collection
  surface (same dependency as Apple's App Privacy label).
- **Mobile account deletion must be supported**, including Google's
  **additional** requirement of a **web-accessible deletion-request link**
  (beyond the in-app flow Apple also requires, §12.2 step 1) — the
  architecture is now designed (§12.2) but not implemented, and retention
  periods are still open (§12.4). No submission without both the in-app
  flow and the web-accessible path live.
- **Privacy policy**, **terms** — required before submission, do not exist
  yet (§12). Must disclose what account deletion deletes, what it may
  retain, and why (§12.4).
- Store metadata and **content rating** — not started.
- **Authentication method requirements must be re-verified against final
  implementation.** Google Play does not have a Sign-in-with-Apple-style
  mandated-provider rule the way Apple's Guideline 4.8 does, but any
  Play policy implications of the Magic Link + Google OAuth combination
  (§4) should still be checked against Play's current developer policy at
  submission time, not assumed unchanged from today's audit.

---

## 12. Legal/account lifecycle

### 12.1 Current blockers

Confirmed by direct repository inspection (grep across `src/`, no matches):

- **Privacy policy page does not exist.**
- **Terms page does not exist.**
- **User-facing account deletion does not exist.** Only Plaid bank
  *disconnect* exists (`src/server/plaid/disconnect.ts`) — there is no
  "delete my account" surface anywhere in the product today, web included.
  Already flagged as a 🔴 blocker in `docs/roadmap.md`.

### 12.2 Account-deletion architecture — LOCKED (2026-09-19)

**The governing principle:** deletion of the user's personal/application
data is architecturally separate from retention of financial records that
legitimately need to survive. This is **not** "retain everything forever"
and it is **not** "hard-delete everything on request" — it is a deliberate
split, and the exact boundary of "legitimately need to survive" is itself
partly an open decision (§12.4), not something this document resolves by
assumption.

**Lifecycle, in order:**

1. **REQUEST** — user initiates account deletion.
   - **LOCKED:** can be initiated **from inside the mobile app.**
   - **LOCKED:** a **web-accessible deletion-request path must also
     exist**, independent of the mobile app being installed — this is a
     Google Play requirement (§11) as well as good practice regardless of
     platform.
   - *Requires further engineering design:* the exact UI/flow for both
     surfaces, and whether the web path is a full self-service flow or an
     authenticated request that a backend process then executes.
2. **Confirmation** — the user confirms intent before anything
   irreversible happens.
   - *Requires further engineering design:* confirmation mechanism (in-app
     re-auth, email confirmation, a delay/undo window) — none chosen yet.
3. **Subscription/billing handling** — checked and communicated **before**
   data changes.
   - **LOCKED:** deleting the Budgts account must **not** be assumed to
     cancel an active mobile subscription. Apple/Google subscriptions are
     billing relationships between the customer and that platform,
     independent of whether a Budgts account exists.
   - **LOCKED:** subscription cancellation/billing must be **clearly
     communicated** to the user as a separate action, handled through the
     **appropriate Apple/Google subscription-management mechanism** (each
     platform's own "manage subscriptions" surface) — Budgts does not
     silently cancel or silently continue billing on the user's behalf.
   - *Requires further engineering design:* the exact in-app copy/flow that
     communicates this distinction, and whether Budgts can/should
     deep-link the user directly to their platform's subscription-
     management screen.
4. **Revoke access/sessions** — terminate the user's ability to sign in
   and invalidate any active sessions/tokens.
   - **LOCKED:** account deletion must terminate/revoke the user's Budgts
     access.
5. **Disconnect/revoke Plaid access** — for every connected bank item.
   - **LOCKED:** Plaid credentials/access tokens and connected-bank access
     must be removed/revoked as part of deletion, not left dangling.
     Mirrors the existing `disconnect.ts` mechanism at the per-item level,
     applied to every item the user has.
6. **Delete personal/operational data** that does not legitimately need
   retention.
   - **LOCKED:** this is real deletion (or scheduled deletion) of the
     user's actual rows — not soft-disabling sign-in while data stays
     fully intact and queryable (restates the requirement from the prior
     version of this document).
   - *Requires further engineering design:* the exact table-by-table
     deletion plan (transactions, accounts, budgets, goals, categories,
     Plaid items/accounts, profile) — not enumerated here because it's
     ordinary implementation work once §12.4's retention scope is settled,
     not a design gap.
7. **Retain the minimum financial records that legitimately require
   retention.**
   - **LOCKED:** financial/payment/revenue records that legitimately need
     to survive must **not** be hard-deleted merely to make account
     deletion easy.
   - **LOCKED:** existing monetization-ledger immutability and the
     migration `0017` `ON DELETE RESTRICT` protections **remain intact** —
     this architecture works around that constraint, it does not weaken it
     (§12.3).
8. **De-identify retained records where possible.**
   - **LOCKED (direction, not mechanism):** where legally/technically
     appropriate, retained records should be de-identified/anonymized so
     personal identity is not retained unnecessarily beyond what retention
     requires.
   - *Requires further engineering design:* the actual anonymization
     mechanism (e.g. severing/nulling the direct `user_id` link while
     preserving the financial fact, versus a separate pseudonymous key) is
     not designed — it depends on §12.4's unresolved retention categories
     and cannot be built before those are answered.
9. **Finalize deletion** — confirm to the user that deletion is complete,
   consistent with what was actually deleted vs. retained per the above.

### 12.3 Monetization-history interaction (schema dependency)

Migration `0017` **intentionally** uses `ON DELETE RESTRICT` from every
monetization-record table (`redemptions`, `subscriptions`, `payments`,
`revenue_allocations`) to `auth.users`, a deliberate deviation from every
other table's `ON DELETE CASCADE` — see the migration's own comment block
and `docs/specs/2026-09-18-monetization-ledger-design.md`.

**Consequence:** a user with any monetization history **cannot** simply
have their `auth.users` row hard-deleted under the current schema. The
`RESTRICT` FK will reject it.

**This is not a reason to weaken the FK.** `RESTRICT` is doing its job —
protecting immutable financial history from being silently cascaded away.
The account-deletion architecture in §12.2 must **accommodate** this
constraint (deleting/revoking everything that isn't financial-record data,
retaining and eventually de-identifying what is, per §12.4), not remove
it. **Migration `0017` is not modified by this document and must not be
modified to make deletion easier.**

### 12.4 Retention — OPEN PRODUCT/LEGAL DECISION

**Retention and deletion periods are not specified anywhere in this
repository or in the planning record this audit reviewed. This document
does not invent one.** Before account deletion can be considered
*complete* (as opposed to architecturally designed), the owner needs to
decide, at minimum:

- **Exact retention periods** — how long each category of retained record
  is kept after account deletion, if at all.
- **Categories of financial records requiring retention** — which of
  `payments`, `revenue_allocations`, `revenue_allocation_adjustments`,
  `payouts`/`payout_allocations`, and `subscriptions` rows (and which
  fields on them) genuinely need to survive, versus which could be
  deleted/cascaded once no longer legally relevant.
- **Legal/accounting basis for each retention category** — e.g. tax
  record-keeping requirements, financial audit requirements, payment-
  processor/App-Store dispute-window requirements — not assumed by this
  document, since the correct basis (and duration) varies by jurisdiction
  and record type and is a legal determination, not an engineering one.
- **Exact de-identification/anonymization requirements** — what "de-
  identified" must mean in practice for this data (does severing `user_id`
  suffice, or does something else in the row remain personally
  identifying?), and whether that bar differs by record category.
- **Treatment of records that cannot be safely de-identified** — if some
  retained record category cannot be de-identified while still serving its
  retention purpose (e.g. a record a regulator might require to be traced
  back to a specific person), the handling for that case is undecided and
  is not assumed here.

Until these are resolved, §12.2 step 7–8 (retain/de-identify) is an
architectural direction, not an implementable spec — and this document
treats it as such rather than filling the gap with an assumed number.

---

## 13. Launch sequencing

1. **Mobile architecture specification — COMPLETE after this change.**
   This document, including the locked mobile-auth methods (§4) and the
   account-deletion architecture (§12.2); unblocks everything below by
   giving later steps something concrete to build against instead of an
   undocumented prior conversation.
2. **Define/implement privacy + terms + account-deletion architecture** —
   store-submission blockers (§10, §11, §12). The architecture is now
   specified (§12.2); the FK/monetization interaction is understood and
   accommodated, not a blocker to *starting* this step (§12.3). **The exact
   retention policy (§12.4) must still be resolved before the account-
   deletion implementation itself is considered complete** — the
   deletion/revocation/disconnect steps (§12.2 steps 1–6, 9) can be built
   and shipped independently of that resolution; the retain/de-identify
   steps (§12.2 steps 7–8) cannot be finished correctly until it is.
3. **Mobile authentication** (§4) — foundational; every later mobile step
   (native Plaid Link, mobile UI, any authenticated Route Handler call)
   depends on a working mobile session.
4. **Native Plaid Link** (§5) — depends on step 3 (link-token creation is
   an authenticated call) and reuses the already-shared server pipeline
   unchanged.
5. **Mobile UI for the existing feature set** (§7) — depends on steps 3–4
   for the screens that need a session and bank data; can begin earlier for
   any screen that doesn't (e.g. static Help/About equivalents).
6. **Monetization Zod/domain/TDD** (§9) — **runs in parallel** with steps
   3–5; it depends only on the already-applied schema (`0017`), not on the
   mobile client existing. Explicitly sequenced so the domain layer is
   ready before step 7 needs it.
7. **RevenueCat + StoreKit + Google Play Billing** (§10, §11) — depends on
   step 6 (nothing to record entitlement/commission against otherwise) and
   step 5 (a client capable of initiating a purchase). Contains this
   document's highest-uncertainty item (Apple Promotional Offer
   sequencing, §10) — budget schedule risk here specifically.
8. **App Store / Play Store submission** — depends on every prior step:
   working auth + Plaid + UI (3–5), a working commercial layer (6–7), and
   the legal/lifecycle requirements (2) all being live simultaneously, not
   sequentially discoverable at submission time.

---

## 14. Testing strategy

- **Unit tests for shared domain logic** — the existing Vitest unit suite
  (`npm run test`, currently 783/783) already covers `src/lib/budget/*` and
  `src/lib/plaid/*`; this coverage is inherited by mobile for free since
  the same modules are reused, not reimplemented (§6).
- **DB integration tests** — the existing `npm run test:integration` suite
  (currently 163/163 against `Budgets-Staging-3`) already covers
  categorization, transfer pairing, recurring/subscription/bill detection,
  Money Left, account exclusion, etc. at the data layer; mobile reuses this
  coverage the same way.
- **Native-device testing** — both iOS and Android, not simulator/emulator
  only, for anything involving OAuth redirects, deep links, or native
  billing sheets (all three are classes of behavior known to diverge
  between simulator and device).
- **iOS physical-device Plaid/OAuth testing** — bank OAuth redirect +
  deep-link handoff on a real device (§5).
- **Android physical-device testing** — same category, Android side.
- **Subscription sandbox testing** — Apple Sandbox tester accounts and
  Google's license-testing track, exercising trial → Promotional/
  multi-phase offer → normal price for both monthly and annual.
- **Entitlement/webhook testing** — RevenueCat webhook delivery → ledger
  write → entitlement state, including idempotency (replayed event
  produces no duplicate `Payment`/`RevenueAllocation`, per monetization
  spec §7's test plan).
- **Account deletion testing** — verify the full §12.2 lifecycle: session/
  access revocation, Plaid disconnect, actual personal/operational data
  removal, that an active subscription is confirmed **not** silently
  cancelled by account deletion, and (once §12.4 is resolved) correct
  retention/de-identification of financial records.
- **Deep-link authentication testing** — `budgts://auth/callback` handling
  across cold-start, warm-start, and already-running-app cases (a standard
  deep-link testing matrix, not yet exercised since the scheme isn't
  registered anywhere yet).
- **Regression testing against existing web functionality** — this track
  must not change web behavior; the existing e2e suite
  (`npm run test:e2e`) against `budgts-staging` remains the regression gate
  for that guarantee.

---

## 15. Launch definition of done

Objective, checkable criteria — not a subjective quality bar:

- [ ] Authentication works on iOS and Android (sign-in, session
      persistence across restart, sign-out).
- [ ] Plaid native Link completes a real Sandbox (and, before public
      launch, Production) connection on-device.
- [ ] Bank sync (webhook → `needs_sync` → cron/poll → sync) delivers real
      transactions to the mobile client's data.
- [ ] Categorization behaves identically to web for the same data (shared
      domain logic, §6/§8).
- [ ] Transfers/recurring/subscription/bill logic remains correct on
      mobile-sourced and mobile-viewed data (no mobile-specific
      reimplementation exists to diverge, §8).
- [ ] Budgets/Goals/Money Left work and match web's numbers for the same
      account.
- [ ] Account deletion follows the full §12.2 lifecycle: access/sessions
      revoked, Plaid access disconnected, personal/operational data
      actually removed, subscription status clearly communicated as a
      separate Apple/Google-managed concern (never silently assumed
      cancelled), and retained financial records handled per whatever
      §12.4 resolves to — not just sign-in disabled.
- [ ] Privacy policy and terms are live and linked from the app and store
      listings.
- [ ] Apple billing (trial → Promotional Offer → normal price) works,
      verified against a real sandbox purchase.
- [ ] Google billing (trial → multi-phase offer → normal price) works,
      verified against a real sandbox purchase.
- [ ] RevenueCat entitlement state is authoritative — the mobile client
      never grants paid features from a client-side purchase-success signal
      alone (§8).
- [ ] Influencer attribution/commission ledger works end-to-end: a
      redemption, a real purchase, and the resulting `RevenueAllocation`
      reflect the correct 35/65 split and commission-window determination.
- [ ] Security checks pass: no service-role credential reachable from the
      client, no Plaid access token reachable from the client, RLS verified
      on every new/mobile-touched table.
- [ ] Store requirements satisfied: both stores' review guidelines,
      account-deletion requirement (including Google's web-accessible link),
      and metadata/content-rating requirements met.
- [ ] Production deployment remains isolated and verified — this track's
      work ships through the same staging → production discipline already
      established (`budgts-staging` → `budgts` promotion), never a direct
      production change.

---

## 16. Explicit out-of-scope

Restated here so nothing downstream infers permission to start on it:

- Web paid checkout / any web customer subscription flow.
- Stripe or any other web billing integration.
- Safe-to-Spend.
- Cash-flow forecasting.
- Net worth.
- Receipt/email ingestion.
- AI financial assistant.
- A general/extensible affiliate platform beyond this specific influencer
  program.
- Automated influencer payout processing (bank transfer, etc.) — unless
  explicitly brought into scope later; this phase's `Payout` model is a
  human-operated ledger, not an automated disbursement system
  (monetization spec §3.7, §5).
- Any other V2/V2+ roadmap item not explicitly named in this document.

---

## 17. Decision Register

### LOCKED
- Web stays free; paid functionality is mobile-only.
- $9.99/mo, $69/yr, 7-day trial.
- 20% influencer discount (3 monthly periods / first annual period only).
- 35% influencer / 65% Budgts commission split, on commissionable
  proceeds, versioned per-platform rate (never hardcoded).
- 12-calendar-month commission window from `first_paid_at`; no reset on
  cancellation/pause/grace/failed-payment/resubscription/upgrade/downgrade.
- Historical attribution and terms-in-effect are immutable.
- No web customer checkout; Apple IAP + Google Play Billing only.
- RevenueCat is the entitlement/billing-event layer; does not replace
  Budgts' own attribution/commission ledger.
- Mobile stack: React Native + Expo + Expo Router + EAS Build.
- Native Plaid SDK: `react-native-plaid-link-sdk`.
- Mobile auth stack: `@supabase/supabase-js` + native secure storage +
  PKCE + deep-link callback (`budgts://auth/callback` as the intended
  scheme).
- **Mobile sign-in methods: Magic Link and Google OAuth. Sign in with
  Apple is not included initially.** Web sign-in methods are unchanged.
- **Account-deletion architecture** (§12.2): initiable from the mobile app
  and via a web-accessible path; terminates Budgts access; disconnects
  Plaid; deletes personal/operational data; does **not** assume
  subscription cancellation; retains only the minimum financial records
  that legitimately require it, de-identified where possible; migration
  `0017`'s immutability/FK protections are not weakened.
- Server-side Plaid pipeline and financial domain logic are shared, not
  duplicated, between web and mobile.
- V2/V2+ remain inactive/post-launch; not reopened by this track.

### OPEN ENGINEERING DECISIONS
- StoreKit Promotional Offer sequencing (needs real Apple sandbox —
  highest uncertainty in this document; monetization spec §6 item 1).
- Rounding mode for commission math (round-half-up proposed, not
  owner-confirmed; monetization spec §6 item 2).
- Calendar-month/leap-year clamp rule (proposed, not owner-confirmed;
  monetization spec §6 item 3).
- Admin-authorization boundary mechanism — no admin-role concept exists in
  this repo today (monetization spec §6 item 5).
- RevenueCat webhook signature verification mechanics (depends on
  RevenueCat integration mode chosen at implementation time; monetization
  spec §6 item 6).
- Play Console multi-phase offer configuration — lower severity, still
  needs sandbox verification (monetization spec §6 item 7).
- Which specific mobile mutations use direct-Supabase vs. Route-Handler
  transport (§6) — ordinary per-feature engineering, not a blocking gap.
- Account-deletion confirmation mechanism — in-app re-auth, email
  confirmation, and/or a delay/undo window (§12.2 step 2) — not chosen.
- Whether Budgts deep-links a deleting user directly to their platform's
  subscription-management screen (§12.2 step 3) — not chosen.
- The table-by-table personal/operational data deletion plan (§12.2 step
  6) — ordinary implementation work once §12.4 settles retention scope,
  not a design gap now.
- The exact de-identification/anonymization mechanism for retained
  financial records (§12.2 step 8, §12.4) — depends on the retention
  categories being resolved first.

### OPEN PRODUCT DECISIONS
- Multi-voucher attribution precedence — first-touch vs. last-touch when a
  user redeems more than one influencer code before their first paid
  transaction (monetization spec §6 item 4).
- Whether the mobile v1 ships every existing web screen or a trimmed
  launch set (§7).
- **Account-deletion retention (§12.4), not yet resolved:**
  - Exact retention periods per record category.
  - Which financial-record categories (`payments`, `revenue_allocations`,
    `revenue_allocation_adjustments`, `payouts`/`payout_allocations`,
    `subscriptions`) genuinely require retention, and which fields.
  - The legal/accounting basis for each retention category (tax,
    audit, payment-processor/App-Store dispute-window requirements, or
    other — jurisdiction-dependent, not assumed here).
  - Exact de-identification/anonymization requirements per category.
  - Treatment of any record category that cannot be safely de-identified
    while still serving its retention purpose.

### STORE/LEGAL DEPENDENCIES
- Apple Developer Program enrollment (not yet done).
- Google Play Console enrollment (not yet done).
- Privacy policy page (does not exist; must disclose deletion/retention
  per §12.4 once resolved).
- Terms page (does not exist).
- In-app account deletion, both platforms — architecture designed (§12.2),
  not implemented.
- Google Play's additional web-accessible account-deletion-request link —
  architecture designed (§12.2 step 1), not implemented.
- Apple App Privacy label / Google Data Safety form (not started, depend
  on final mobile data-collection surface).
- **"Sign in with Apple" Guideline 4.8 applicability** — mobile sign-in is
  now locked to Magic Link + Google OAuth with no Apple sign-in (§4); this
  is a scope decision, not a compliance determination, and 4.8 applicability
  must still be verified against the final implementation before Apple
  submission (§10).
  - **Re-evaluated 2026-09-18** (mobile-auth implementation milestone 2,
    `mobile/README.md`): the lock is unchanged and Apple Sign In was
    deliberately **not** implemented — Apple Developer Program enrollment
    still doesn't exist to configure or test against, and 4.8 remains
    exactly as open as stated above. Not re-resolved here; carried forward.

---

## Contradictions found against existing repo architecture

None that rise to a financial-correctness, data-integrity, security, or
architecture-contradiction level, in this revision or the prior one.

- **Account deletion and the monetization ledger's FK design interact**
  (first surfaced in the prior revision of this document): migration
  `0017`'s `ON DELETE RESTRICT` from monetization tables to `auth.users`
  means a user with monetization history cannot have that row hard-deleted
  under the current schema. **This is now addressed, not just flagged:**
  §12.2's lifecycle architecture and §12.3 state explicitly that the FK is
  correct and stays as-is, and that deletion accommodates it by
  deleting/revoking everything else and retaining-then-de-identifying the
  financial-record minimum. The remaining gap is not architectural — it's
  §12.4's retention-period decision, which this document correctly leaves
  open rather than inventing.
- **The new locked mobile-auth decision (Magic Link + Google OAuth, no
  Apple sign-in initially) introduces no contradiction:** it doesn't add an
  undocumented third method, doesn't change web auth (§4 "Current — web" is
  untouched), and is applied consistently everywhere this document
  discusses mobile sign-in (§3, §4, §10, §17). The one thing it does **not**
  resolve — and this document does not claim it resolves — is whether Apple
  Guideline 4.8 requires an Apple-equivalent option anyway; that stays an
  open store/legal dependency (§10, §17), re-verified against the final
  implementation, not assumed away by the scope decision.

No existing LOCKED decision (web-free/mobile-paid, the commercial terms, the
mobile stack, the shared-pipeline architecture) conflicts with anything
already built or documented elsewhere in this repository.
