# CLAUDE.md — Budget Tracking App

Project-local instructions. These sit **under** the global
`~/.claude/CLAUDE.md` but adapt it for this project (see "Relationship to the
WAT framework" below).

## What this project is

A **commercial budget tracking app** ("Budgts"). Today it is an installable
**PWA** (one codebase for phone + desktop) backed by the cloud, so data syncs
across a user's devices. Per-user accounts; no household/shared budgets in v1.

### The goal — read this before every decision

Budgts will be **sold**: released on the **Google Play Store and Apple App
Store** for **500+ paying users**. Every product and technical decision is
judged against that, not against the owner's own accounts.

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
| Hosting | Vercel. **Currently Hobby tier, which is non-commercial only. Must move to Pro before charging users.** Supabase and Plaid plans also need sizing for 500+ users. |
| PWA | web app manifest + service worker (app-shell caching) |
| Data / auth / storage / realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| DB access | `supabase-js` with the user's session for all reads/writes; Drizzle for **migrations only** |
| Security | Row-Level Security on **every** table, scoped to `auth.uid()` — the enforcement, not a backstop |
| Validation | Zod schemas shared client + server |
| Forms | React Hook Form |
| Charts | Recharts (consult the `dataviz` skill before building any chart) |
| AI extraction (V2) | Claude API — `claude-sonnet-5`, vision for receipts (consult the `claude-api` skill) |
| Testing | Vitest + React Testing Library (unit/component), Playwright (e2e) |

## Repo layout

```
CLAUDE.md  AGENTS.md  README.md
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs
vitest.config.ts  vitest.setup.ts  playwright.config.ts  drizzle.config.ts
.env.local.example  .nvmrc
docs/
  conventions.md          # layer order for a feature + ingestion-adapter contract
  specs/                  # YYYY-MM-DD-<topic>-design.md
  roadmap.md
src/
  app/                    # Next.js routes (App Router)
  components/
  lib/
    db/                   # Drizzle schema + client
    ingestion/            # IngestionAdapter interface + adapters + landTransaction()
    budget/               # budget-vs-actual, recurring, goals domain logic (pure, tested)
    validation/           # Zod schemas
  server/                 # server actions / route handlers
supabase/
  migrations/             # SQL migrations: tables, RLS policies, handle_new_user() seed trigger
tests/
  unit/                   # Vitest specs that don't sit next to source
  e2e/                    # Playwright
```

## Next.js 16 — read the bundled docs before writing app code

This project runs **Next.js 16**, which has breaking changes vs. older training
data (see `AGENTS.md`, which `next dev` regenerates). Before implementing any
route, server action, `cookies()` / `headers()` call, `metadata`/`viewport`
export, middleware, or `next.config` change, read the relevant guide under
`node_modules/next/dist/docs/`. Do not assume the Next 13–15 API.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (must pass in CI) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest — unit + component |
| `npm run test:e2e` | Playwright e2e |
| `npm run db:generate` | Drizzle: emit a SQL migration from `schema.ts` changes |
| `npm run db:migrate` | Apply migrations (uses `DIRECT_URL`, non-pooled) |

## Environment variables

Names only. Real values live in `.env.local` (git-ignored) and in the Vercel
project settings. Never commit secrets. Keep `.env.local.example` in sync.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…` — client-safe)
- `NEXT_PUBLIC_SITE_URL` (base URL for magic-link + OAuth redirect callbacks)
- `SUPABASE_SECRET_KEY` (`sb_secret_…` — server only, never exposed to the client)
- `DATABASE_URL` (Drizzle `db:generate` — transaction pooler, port 6543)
- `DIRECT_URL` (Drizzle `db:migrate` — session pooler / direct, port 5432)
- `ANTHROPIC_API_KEY` (V2 — email / receipt ingestion only)

## Conventions

- **Money is integer minor units** (e.g. cents) end to end. Convert to a
  display string only at the UI edge. Never store or compute with floats.
- **Every table has RLS** scoped to the owner. All request-time DB access goes
  through the user's `supabase` client, so RLS *is* the isolation guard. Set
  `user_id` explicitly on inserts (RLS `WITH CHECK`). Drizzle = migrations only.
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
  Commit or push only when the user asks.

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

**Shipped:** **UI redesign v2** — the "Budgt" brand (black-cat mascot,
cream/coral/sage/sky/lavender/pink palette, Poppins) and a Home-first,
Money-Left-led information architecture across every screen. Presentation-
layer only; see `docs/BRAND_GUIDELINES.md` (the visual source of truth) and
`docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md` (screen/IA
behavior, still current outside its superseded brand sections — see its
header) plus `docs/roadmap.md`'s "UI Redesign" section for what's deferred.

**Shipped:** **Mascot/logo rebrand** — the black-cat mascot and "Budgt" name
were replaced with a robin mascot and the "Budgts" name/wordmark (matching
the live domain), sourced from `Logo Assets V2`. Palette and typography
(cream/coral/sage/sky/lavender/pink, Poppins) are unchanged — this was a
mascot/logo/name swap, not a full visual rebrand. `docs/BRAND_GUIDELINES.md`
is up to date; the UI redesign v2 note above is historical only for its
brand details.

**Shipped:** **"How Budgts Works" guide** — a permanent static Help page
(`/help/how-it-works`) teaching the end-to-end workflow (connect →
transactions arrive → auto-categorize → review exceptions → budget → Money
Left → track progress); linked from `/help` and the first-run tour's final
card. Spec: `docs/specs/2026-09-15-how-budgts-works-guide-design.md`.

**Next:** **V1 — Plaid transaction ingestion** (the primary automatic path;
manual entry stays as a fallback) → **V1.5** (recurring / subscription / bill
detection over synced data + paired-transfer detection) → **V2** (email /
receipt ingestion + spending intelligence) → **V2+** (AI financial assistant).
Native apps are a parallel delivery track, not a numbered phase.
