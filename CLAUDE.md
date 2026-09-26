# CLAUDE.md — Budget Tracking App

Project-local instructions. These sit **under** the global
`~/.claude/CLAUDE.md` but adapt it for this project (see "Relationship to the
WAT framework" below).

## What this project is

A **personal budget tracking app** ("Budgts"). It is an installable **PWA**
(one codebase for phone + desktop) served at https://budgts.com and backed by
the cloud, so data syncs across the owner's devices. Per-user accounts; no
household/shared budgets in v1.

### The goal — read this before every decision

Budgts is for the owner's **personal use**, as a browser PWA (decided
2026-09-24). **Native mobile (Expo / React Native) and mobile monetization
(App Store / Play Store, RevenueCat, 500+ paying users) are on hiatus** as of
2026-09-25 — paused, not abandoned. That work is archived on the git branch
`archive/mobile-and-deletion-2026-09-24`. It is still built to a
production standard — correct money math, no silent failures — but nothing
currently targets app-store compliance or paying-user scale. When mobile
resumes, the mobile rules in `AGENTS.md` apply (all Expo / React Native
implementation goes to `budgts-architect`).

The owner is in Pennsylvania: "this month" and "today" are decided in
`America/New_York` (`src/lib/budget/month.ts`), never from the server's UTC clock.

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
| Hosting | Vercel. Supabase is currently on the Free/Nano tier (500MB DB, pauses after 7 idle days) and Vercel is on Hobby — both deliberately deferred to a launch-readiness milestone, not an oversight. Upgrade trigger: Supabase DB size approaching its 500MB cap, or a concrete dev/prod limitation, whichever comes first. |
| PWA | web app manifest + service worker (app-shell caching) |
| Data / auth / storage / realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| DB access | `supabase-js` with the user's session for all user-facing reads/writes; Drizzle for migrations **and** the server-only Plaid pipeline (`src/server/plaid/*`, webhook / cron routes, the page-view refresh nudge), which connects as the DB owner — bypassing RLS — so every such query must scope by `user_id`/`item_id` explicitly |
| Security | Row-Level Security on **every** table, scoped to `auth.uid()` — the enforcement, not a backstop |
| Validation | Zod schemas shared client + server |
| Forms | Native `<form action>` + server actions (`useActionState`), Zod-validated on the server |
| Charts | Server-rendered square-cell markup (`src/components/spending-overview.tsx`); no chart library |
| Design system | `docs/BRAND_GUIDELINES.md`: Geist + Dogica (brand only), charcoal on light gray, one red accent, Phosphor icons, pixel robin |
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
  migrations/             # 0000–0016 SQL migrations: tables, RLS policies, handle_new_user() seed trigger
  staging-plaid-cron.sql  # pg_cron → /api/plaid/sync-due wiring (not a migration)
tests/
  unit/                   # Vitest specs that don't sit next to source (incl. performance guardrails)
  integration/            # real-Postgres tests (staging only)
  plaid-integration/      # real Plaid Sandbox tests
  e2e/                    # Playwright
tools/                    # dev-only scripts (screenshot, one-off dry runs)
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
  month as a `date`.
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

**In progress:** **V1.5** — recurring-series detection (migration `0016`,
`/api/plaid/recurring-scan`) and subscription / bill classification layers
are merged but not yet surfaced in the UI.

**Next:** finish **V1.5** → **V2** (email / receipt ingestion + spending
intelligence) → **V2+** (AI financial assistant).
Native apps and mobile monetization are on hiatus (2026-09-25), not a numbered phase.
