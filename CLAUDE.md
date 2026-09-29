# CLAUDE.md — Budget Tracking App

Project-local instructions. These sit **under** the global
`~/.claude/CLAUDE.md` but adapt it for this project (see "Relationship to the
WAT framework" below).

## What this project is

A **budget tracking app** ("Budgts") by **Budgts, LLC**, sold as a
subscription and shipped **only as native iOS and Android apps** (Expo) on
the App Store and Google Play, in progress (owner decision 2026-09-29).
Per-user accounts; no household/shared budgets in v1.

**budgts.com becomes the company website.** Until the apps launch, the
browser version of the app (an installable PWA) stays live at
https://budgts.com for existing users and is the visual blueprint the native
screens copy; signed-out visitors will see the company homepage (Phase 1b).
At launch the browser app retires: budgts.com keeps the company homepage, the
store-required pages (privacy, terms, support, account deletion) and the
server the apps call. The sequence: launch spec §13a.

### The goal — read this before every decision

Budgts is a **commercial product** published by **Budgts, LLC** (Apple and
Google organization accounts, which need its D-U-N-S number: still pending
on 2026-09-29) — decided 2026-09-26, ending the 2026-09-24/25 personal-use
hiatus. The launch plan is
`docs/specs/2026-09-17-mobile-app-launch-design.md`; owner decisions:

- **Native Expo apps**, every screen **visually identical to the approved
  web app** at phone width, **zero known bugs**, premium feel. Each part is
  scored /10 and iterated to **9.5+** before it counts as done (the parity
  check and scoring gate are in `AGENTS.md` → Mobile).
- **$9.99/month, $69/year, 7-day free trial**, bought in the apps through
  Apple/Google billing (RevenueCat). Confirm once Plaid quotes its per-bank
  Production price; if it is above ~$1/bank, cap the base plan at 3 banks
  or raise annual to $79.
- **Subscriptions are app-only** (2026-09-29, superseding 2026-09-26's "one
  subscription unlocks the apps and budgts.com"): bank sync is the paid
  feature, gated by a server-side entitlement. budgts.com has no plan
  status, no Manage Subscription page and no checkout.
- **budgts.com is the company website** (2026-09-29), built inside this
  project; the browser app retires at launch (launch spec §13a).
- **Influencer program deferred** until after launch.

All Expo / React Native implementation goes to `budgts-architect`
(`AGENTS.md`). Stage 0 (done 2026-09-28) carried the shelved mobile,
account-deletion and billing work from `mobile/native-home` onto
`phase-m/mobile-launch` piece by piece, never merged wholesale; main's web
design and code won every conflict. What came over, what was adapted and
what was left behind: `docs/superpowers/plans/2026-09-27-stage0-port.md`.

"This month" and "today" follow **each user's own time zone**, the one their
device reports (owner, 2026-09-26: "time zones must depend where the user is
located"). Onboarding stores it in `profiles.time_zone` (migration `0018`),
`<TimeZoneSync>` updates it whenever the device's zone changes, and every
page passes it to `src/lib/budget/month.ts` through `requireTimeZone()`
(`src/lib/current-profile.ts`). Nothing is decided from the server's UTC
clock or a fixed zone.

- **Every account matters.** A fix must work for every user, bank, account
  type, time zone and locale. The owner's data is only the first test set,
  so "works on my accounts" is not done.
- **No silent failure states.** Held, excluded, stale or errored data must
  be visible in the UI, with a way to resolve it.
- **Every state has a reachable exit.** Nothing may depend on "enough data
  eventually arriving", because a low-activity account never gets there.
- **Built for scale and cost:** paginated queries, Plaid per-item cost,
  sync throughput and rate limits, hosting and database plan limits.
- **Production data belongs to customers.** Remediation needs exact affected
  rows, before/after totals, owner approval, and an audit trail.

**Ingestion paths, in priority order:**

1. Bank connect via Plaid — the primary automatic path (live)
2. Manual entry — always-available fallback
3. Email purchase-notification parsing (V2)
4. Receipt photo → parse → user picks which card/account was used (V2)

**v1 feature set:** categories + spend tracking · budgets vs actual · recurring
/ bills tracking · savings goals. Single currency per user, chosen at signup.

## Agent routing

`AGENTS.md` defines how work is divided between models; the two subagents are in
`.claude/agents/`. Authority order: `CLAUDE.md` first, then `AGENTS.md`, then specs
under `docs/specs/`. In short: **Sonnet 5** (main session) does normal non-mobile
engineering and coordination; **`budgts-architect`** (Opus 5.5) takes all Expo /
React Native work and high-risk or architectural work (financial semantics, Plaid,
schema/migrations, RLS/auth, monetization, account deletion); **`budgts-utility`**
(Haiku 4.5) takes bulk mechanical work only. Follow the least-expensive-capable-agent
principle, but never trade away correctness to save tokens.

## Relationship to the WAT framework

The global framework describes **Workflows → Agents → Tools** automation
pipelines that dump deliverables into cloud services (Sheets, Slides). This
project is a **real application with its own UI**, so that pipeline structure
does *not* literally apply here — there is no `tools/*.py` pushing to a Sheet.

What carries over is the **spirit**:

- **Deterministic code does execution; AI does reasoning.** Domain logic,
  money math, migrations, and validation are plain typed code with tests. AI
  (Claude API) is used only where the input is genuinely unstructured — parsing
  email notifications and receipt images (V2).
- **Short SOP-style docs.** Repeatable workflows and rules live in
  `docs/conventions.md`; specs in `docs/specs/`; the build order in
  `docs/roadmap.md`. (No project-specific "skills" — per
  `superpowers:writing-skills`, project conventions belong in docs like these.)
  If a real skill is ever warranted, it goes in `./.claude/skills/` in **this
  repo only** — never the global `~/.claude/skills/`.
- **Self-improvement loop.** On a failure: fix the code → verify → update the
  relevant doc so it does not recur.

## Stack

| Concern | Choice |
| --- | --- |
| App framework | Next.js (App Router) + TypeScript + React |
| Hosting | Vercel. Supabase is currently on the Free/Nano tier (500MB DB, pauses after 7 idle days, no backups) and Vercel is on Hobby. **Both must move to paid plans before selling** (Vercel Hobby is non-commercial; Supabase Free pauses and has no backups): Vercel Pro and Supabase Pro are owner launch steps. |
| Mobile | Expo (latest stable SDK, New Architecture) + Expo Router + EAS Build/Submit, in `mobile/`; Reanimated, react-native-svg, `react-native-plaid-link-sdk`, RevenueCat (`react-native-purchases`); Maestro for device E2E and parity captures |
| PWA | web app manifest + service worker (app-shell caching); retired with the browser app at launch, when a service-worker update clears the caches (launch spec §13a) |
| Company website | budgts.com homepage + privacy/terms/support/account-deletion pages, Next.js in this project (Phase 1b); the only public web surface after launch |
| Data / auth / storage / realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| DB access | `supabase-js` with the user's session for all user-facing reads/writes; Drizzle for migrations **and** the server-only Plaid pipeline (`src/server/plaid/*`, webhook / cron routes, the page-view refresh nudge), which connects as the DB owner — bypassing RLS — so every such query must scope by `user_id`/`item_id` explicitly |
| Security | Row-Level Security on **every** table, scoped to `auth.uid()` — the enforcement, not a backstop |
| Validation | Zod schemas shared client + server |
| Forms | Native `<form action>` + server actions (`useActionState`), Zod-validated on the server |
| Charts | Server-rendered square-cell markup (`src/components/spending-overview.tsx`); no chart library |
| Design system | `docs/BRAND_GUIDELINES.md`: soft-pixel: borderless stepped surfaces (generated, `src/lib/brand/pixel-frame.ts`), Geist for figures and reading + Dogica for titles and brand moments, charcoal on light gray, one red accent, Pixelarticons (`<Icon>`), pixel robin |
| AI extraction (V2) | Claude API — `claude-sonnet-5`, vision for receipts (consult the `claude-api` skill) |
| Testing | Vitest + React Testing Library (unit/component), Playwright (e2e) |

## Repo layout

```
CLAUDE.md  AGENTS.md  README.md
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs
vitest.config.mts  vitest.integration.config.mts  vitest.plaid.config.mts
vitest.setup.ts  playwright.config.ts  drizzle.config.ts
.env.local.example  .nvmrc
.claude/agents/           # budgts-architect, budgts-utility (see AGENTS.md)
docs/
  conventions.md          # layer order, ingestion-adapter contract, performance rules
  specs/                  # YYYY-MM-DD-<topic>-design.md
  superpowers/plans/      # implementation plans
  roadmap.md  workflow.md  deploy.md  security.md  BRAND_GUIDELINES.md
public/                   # sw.js, manifest, icons, brand/ art
src/
  app/                    # Next.js routes (App Router); api/ = Plaid + CSV export routes
  components/
  lib/
    db/                   # Drizzle schema + client (migrations + server-only Plaid pipeline)
    ingestion/            # IngestionAdapter interface + adapters + landTransaction()
    budget/               # budget-vs-actual, money, month, goals domain logic (pure, tested)
    plaid/                # Plaid sync, sign convention, transfers, recurring/subscription/bill detection
    supabase/             # server/client/proxy clients, getSessionUser, fetchAllRows
    validation/           # Zod schemas
  server/                 # server actions + server-only Plaid service
  proxy.ts                # session refresh + auth gate (Next 16's middleware)
supabase/
  migrations/             # 0000–0024 SQL migrations: tables, RLS policies, handle_new_user() seed trigger (0018 = per-user time zone; 0019–0022 account deletion; 0023 ledger; 0024 entitlements)
  staging-plaid-cron.sql  # pg_cron → /api/plaid/sync-due wiring (not a migration)
tests/
  unit/                   # Vitest specs that don't sit next to source (incl. performance guardrails)
  integration/            # real-Postgres tests (staging only)
  plaid-integration/      # real Plaid Sandbox tests
  e2e/                    # Playwright
tools/                    # dev-only scripts (screenshot, one-off dry runs)
mobile/                   # Expo app (iOS + Android), ported from mobile/native-home in Stage 0; screens keep the pre-redesign look until Phase 3
```

## Next.js 16 — read the bundled docs before writing app code

This project runs **Next.js 16**, which has breaking changes vs. older training
data. Before implementing any
route, server action, `cookies()` / `headers()` call, `metadata`/`viewport`
export, middleware, or `next.config` change, read the relevant guide under
`node_modules/next/dist/docs/`. Do not assume the Next 13–15 API.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (must pass in CI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run test` | Vitest — unit + component (+ `tests/unit/performance-guardrails.test.ts`) |
| `npm run test:integration` | Vitest against a real Postgres — **staging only** (`.env.staging`), never `.env.local` (prod) |
| `npm run test:plaid` | Vitest against the real Plaid Sandbox |
| `npm run test:e2e` | Playwright e2e — run against staging, never production |
| `npm run screenshot` | `tools/screenshot.mjs` — render a page to PNG |
| `npm run db:generate` | Drizzle: emit a SQL migration from `schema.ts` changes |
| `npm run db:migrate` | Apply migrations (uses `DIRECT_URL`, non-pooled) |

## Environment variables

Names only. Real values live in `.env.local` (git-ignored) and in the Vercel
project settings. Never commit secrets. Keep `.env.local.example` in sync.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…` — client-safe)
- `NEXT_PUBLIC_SITE_URL` (base URL for magic-link + OAuth redirect callbacks)
- `SUPABASE_SECRET_KEY` (`sb_secret_…` — server only, never exposed to the client)
- `DATABASE_URL` (transaction pooler, port 6543 — Drizzle `db:generate` **and** the runtime Plaid pipeline; `prepare: false`)
- `DIRECT_URL` (Drizzle `db:migrate` — session pooler / direct, port 5432)
- `NEXT_PUBLIC_PLAID_ENABLED` (Plaid UI flag — **on in production**)
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_TOKEN_ENC_KEY`, `PLAID_OAUTH_REDIRECT_URI` (server only)
- `CRON_SECRET` (bearer secret for `/api/plaid/sync-due`, called by `pg_cron`, and `/api/plaid/recurring-scan`)
- `PLAID_TEST_SEED_ENABLED` (sandbox-only e2e seed route; never set in production)
- `ANTHROPIC_API_KEY` (V2 — email / receipt ingestion only)
- `REVENUECAT_WEBHOOK_SIGNING_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`, `BILLING_ENVIRONMENT` (server only; billing is ported but switched off until Phase 4, and its routes refuse without these)
- `PLAID_NATIVE_OAUTH_REDIRECT_URI` (native Plaid Link's OAuth return link)
- `APPLE_APP_ID`, `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` (app-link association files under `/.well-known`; they 404 while unset)

`.env.local` points at the **production** Supabase project; `.env.staging` is
staging (`uvowywszaiojboaxdmoz`). Tests that write data use staging only.

## Conventions

- **Money is integer minor units** (e.g. cents) end to end. Convert to a
  display string only at the UI edge. Never store or compute with floats.
- **Every table has RLS** scoped to the owner. All user-facing request-time DB
  access goes through the user's `supabase` client, so RLS *is* the isolation
  guard. Set `user_id` explicitly on inserts (RLS `WITH CHECK`). Drizzle is for
  migrations and the server-only Plaid pipeline only (it bypasses RLS — scope
  every query by `user_id`/`item_id`).
- **Performance rules** (after the 2026-09-24 slowness incident) live in
  `docs/conventions.md` and are enforced by
  `tests/unit/performance-guardrails.test.ts`: `getSessionUser()` (local JWT
  check) never `auth.getUser()` on read paths, independent reads in one
  `Promise.all`, bounded/paginated queries, `loading.tsx` + `<Suspense>` for
  slow parts, debounced realtime refresh, heavy client libs via `next/dynamic`.
- **TDD.** Domain logic in `src/lib/budget/` and adapters get failing unit
  tests first (`superpowers:test-driven-development`).
- **Feature work follows the layer order in `docs/conventions.md`** — schema +
  migration → Zod → domain logic → server action → UI → e2e. Read it before
  starting a feature.
- **New transaction sources follow the ingestion-adapter contract in
  `docs/conventions.md`** — implement one interface, call the shared
  `landTransaction()`.
- **Spend/income exclude transfers and unconfirmed rows.** `is_transfer` rows
  never count; a refund is a `credit` in an expense category and nets against
  that category's spend.
- **Dates:** store timestamps in UTC; `budgets.month` is the first day of the
  month as a `date`. "Today" and "this month" come from the user's
  `profiles.time_zone` (`requireTimeZone()` → `todayDateKey` /
  `currentMonthKey`), never the server clock.
- **Migrations** go through the `predb:migrate` gate: set
  `MIGRATE_CONFIRM_REF` to the target's project ref, staging first
  (`docs/operations/database-migrations.md`).
- **Branches:** `phase-N/<short-topic>`. Conventional-ish commit subjects.
  Commit locally after a completed, validated task (never with unrelated
  changes, secrets, `.env` files or build artifacts); never push, merge, tag,
  publish or rewrite shared history without the user asking.

## Definition of done (a slice/feature)

1. Schema change + migration (RLS policy included) applied and reversible.
2. Domain logic unit-tested (tests written first).
3. Zod validation on every input; no raw 500 reaches the user.
4. Component tests for stateful UI.
5. One Playwright e2e covering the happy path end to end.
6. `lint`, `typecheck`, `test`, `build` green.
7. The relevant doc updated if anything surprised us.
8. Works for **every** user and account, not just the owner's data. Every
   state has a reachable exit, and nothing fails silently (see "The goal"
   above).

## Roadmap

See `docs/roadmap.md` (tier ladder) and `docs/workflow.md` (execution tracker).

**Shipped:** Phase 1 (core budgeting slice — live at https://budgts.com) and
Phase 2a (savings goals, `2d46178`).

**Shipped:** **Design language v3 (2026-09-25)** — editorial Swiss
minimalism + premium fintech UI + restrained pixel branding: pixel robin +
Dogica wordmark, Geist, charcoal on light gray with one red accent,
square-cell progress and charts, purposeful motion. The Home-first,
Money-Left-led information architecture is unchanged. See
`docs/BRAND_GUIDELINES.md` (the visual source of truth).

**Shipped:** **V1 — Plaid transaction ingestion** (live in production, flag
on) with sign-convention, transfer-ownership, paired-transfer and
account-exclusion handling; Money Left + Savings Rate.

**Shipped:** **Welcome guide (first-run tour v2, 2026-09-25)** — `/onboarding` →
`/tour` card wizard narrated by **Crystal**, the robin (she introduces herself
first), with an animated scene per card: what Budgts does, purchases arriving,
currency, connect your bank, sorted for you, Money Left, budgets and goals, the
four tabs. Gated on `profiles.tour_seen_at` (migration `0014`); replay from Help.
Spec: `docs/specs/2026-09-25-welcome-guide-design.md` (flow rules from
`docs/specs/2026-09-15-first-run-tour-design.md`). The live-coachmark design
remains specced but **not implemented**.

**Shipped:** **Home motion (2026-09-25)** — Crystal lives on Home
(`crystal-perch.tsx`: arrival, a 16s life loop, a tap reaction, speech
bubbles; the robin gained a raised-wing frame), rolling money figures
(`rolling-amount.tsx`, replaced `CountUp`), scroll-aware reveals
(`reveal.tsx`), an over-budget flash and cascades. Presentation only. The
welcome-guide gate is `firstRunRedirect` (`src/lib/tour/gate.ts`). Spec:
`docs/specs/2026-09-25-home-motion-design.md`.

**Shipped:** **"How Budgts Works" guide** — a permanent static Help page
(`/help/how-it-works`) teaching the end-to-end workflow (connect →
transactions arrive → auto-categorize → review exceptions → budget → Money
Left → track progress); linked from `/help` and the tour's final card.
Spec: `docs/specs/2026-09-15-how-budgts-works-guide-design.md`.

**Shipped:** **Pixel design pass (2026-09-26, `dd7c775`, live)** — the
owner's mobile + desktop mockups applied to every in-app screen: stepped
pixel frames, Pixelarticons replacing Phosphor.

**Shipped:** **Soft-pixel pass (2026-09-26, `8f3bb8d`, live)** — the owner
asked for cleaner, more modern and less overwhelming (especially on phones)
while keeping the art style: borderless stepped surfaces on soft shadows,
Geist figures (Dogica's zero read as an eight), sentence-case section heads,
segmented thin progress, lighter charts, a compact phone scale, no em-dashes
in UI copy; sign-in, onboarding, the welcome guide, Appearance, loading and
the error boundary brought into the same system. Then Crystal roaming the
Money left card from its middle, with cheers (`249b9f0`, `7aeff66`), and
square progress cells: as tall as the bar, as many as fit, one painted strip
per bar. Presentation only: no money math changed. See
`docs/BRAND_GUIDELINES.md`.

**Shipped:** **Per-user time zones (2026-09-27, `ef4f2d1`, live)**: "today"
and "this month" follow the zone the user's device reports
(`profiles.time_zone`, migration `0018`, `<TimeZoneSync>`); Settings →
Profile shows it.

**Active (2026-09-26):** **Mobile App + App-Store Launch** — native Expo
apps on the App Store and Google Play, sold by Budgts, LLC; since
2026-09-29 they are to be the only product. Branch `phase-m/mobile-launch`;
spec `docs/specs/2026-09-17-mobile-app-launch-design.md`. Phases:
0 documents + selective port of the shelved work (done, live 2026-09-28) →
1 store blockers on web (privacy, terms, support, account deletion; done,
live 2026-09-28) → 1b company homepage at budgts.com (next web item) → 2
native foundation (shared brand tokens, auth incl. Sign in with Apple,
per-screen mobile API) → 3 every screen, visually identical to the web → 4
subscription (RevenueCat, server-side entitlement; app-only) → 5 release
(EAS, TestFlight, Play internal track, crash-free beta, review), then retire
the browser app and switch budgts.com to the company website with store
buttons (launch spec §13a).

**Paused:** **V1.5** — recurring-series detection (migration `0016`,
`/api/plaid/recurring-scan`) and subscription / bill classification layers
are merged but not yet surfaced in the UI.

**After launch:** the influencer program, finishing **V1.5**, **V2** (email
/ receipt ingestion + spending intelligence) → **V2+** (AI financial
assistant).
