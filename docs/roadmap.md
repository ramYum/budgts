# Roadmap

Build order for the budget tracking app. Each phase is a shippable increment.
Phases 1–2 complete the locked v1 feature set; 3–5 add the automatic ingestion
paths.

## Phase 0 — Foundation ✅

Project `CLAUDE.md`, this roadmap, `docs/conventions.md` (feature layer order +
ingestion-adapter contract), the Phase 1 spec, `.env.local.example`. No skills —
project conventions live in the docs above.

Scaffold in place: Next.js 16 + TypeScript + Tailwind v4 (App Router, `src/`
dir), Drizzle + `postgres` + Supabase client libs, Zod + React Hook Form,
Recharts, Vitest + Testing Library, Playwright. Scripts wired (`dev`, `build`,
`lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`). PWA
manifest + icons + theme colour. Placeholder home page, a real `money` util with
unit tests, and an e2e smoke test. `lint` / `typecheck` / `test` / `build`
green; `git init` done (no commit yet).

**Next:** Phase 1. Create the Supabase project, then follow the layer order in
`docs/conventions.md` starting from `src/lib/db/schema.ts`.

## Phase 1 — Core budgeting slice

Deployed, installable, multi-device. Sign up → add transactions manually →
categorize → set a monthly budget per category → dashboard shows
budget-vs-actual for the current month. Live sync across devices via Supabase
Realtime. The `IngestionAdapter` seam is in place with only `ManualAdapter`
implemented, so later phases plug in without refactoring.

Full design: `docs/specs/2026-09-07-budget-app-phase-1-design.md`.

## Phase 2 — Recurring bills + Savings goals — in progress

Built as sub-checkpoints: **2a savings goals** → 2b recurring bills → 2c paired
transfers.

- **2a — Savings goals** ✅ (migration `0003`, `/goals` screen). `savings_goals`
  + `savings_contributions`: target amount, optional target date, a standalone
  contribution ledger (decoupled from transactions / balances), progress
  display. "Add" and "Withdraw / correct" are separate actions.
- 2b — `recurring_rules`: cadence, next-due date, generate-or-remind. Upcoming
  and missed bills surfaced on the dashboard.
- 2c — Paired transfer linking (both legs of a card payment reconcile).

Completes the v1 feature set.

## Phase 3 — Email ingestion (primary automatic path)

Per-user inbound email address → provider webhook → `EmailAdapter` →
`claude-extraction` parser → transactions land as `pending_review` in a
confirm/fix queue → dedupe via `source_ref`. Includes user-facing docs for
turning on bank purchase alerts and forwarding them.

Open decision: inbound-email provider (Cloudflare Email Routing / Postmark /
Mailgun) and whether the user owns a domain.

## Phase 4 — Receipt capture

PWA camera capture → upload to Supabase Storage → Claude vision parse → a
confirmation popup where the user picks which card/account was used → a
transaction with the receipt image attached.

Open decision: Claude vision vs a dedicated OCR API — settle with a small
bake-off at the start of this phase.

## Phase 5 — Bank aggregator connect

**Plaid** is the chosen provider. Plaid Link connects the bank, the cursor-based
`/transactions/sync` endpoint pulls added / modified / removed transactions, and a
`PlaidAdapter` maps each to a `NormalizedTxn` (`source: bank`,
`sourceRef: transaction_id`) through the existing `landTransaction()` path. Two
new RLS-scoped tables hold the item + account mapping; the access token stays
server-side. Sandbox is free; Production needs an application and costs roughly
$0.30-$1.50 per connected item per month. TrueLayer / GoCardless / a regional
aggregator are drop-in fallbacks behind the same interface. Full design:
`docs/workflow.md` section 4.

## Deferred / out of scope until requested

- Household / shared budgets (needs a sharing + roles model).
- Multi-currency transactions with conversion.
