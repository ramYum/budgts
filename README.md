# Budgts

A budget tracking app — an installable PWA at https://budgts.com, backed by
Supabase and Plaid, syncing across phone and desktop. Bank transactions
arrive automatically via Plaid (manual entry is the fallback); categories,
budgets vs actual, Money Left, savings goals. Native iOS and Android apps
(Expo) for the App Store and Google Play are in progress
(`docs/specs/2026-09-17-mobile-app-launch-design.md`). Email/receipt
ingestion is planned for V2.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — goal, stack, repo layout, commands, env vars, conventions
- [`AGENTS.md`](AGENTS.md) — how work is routed between AI agents
- [`docs/roadmap.md`](docs/roadmap.md) — tier ladder; [`docs/workflow.md`](docs/workflow.md) — execution tracker + change log
- [`docs/conventions.md`](docs/conventions.md) — feature layer order, ingestion contract, performance rules
- [`docs/deploy.md`](docs/deploy.md) — Vercel / Supabase / Plaid deployment
- [`docs/specs/`](docs/specs/) — design specs

## Getting started

```bash
cp .env.local.example .env.local   # then fill in Supabase + DB (+ Plaid) values
npm install
npm run dev                        # http://localhost:3000
```

Point `.env.local` at a non-production Supabase project for local work; tests
that write data (integration, e2e) must run against staging only.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run test` | Vitest (unit + component + performance guardrails) |
| `npm run test:integration` | Vitest against a real (staging) Postgres |
| `npm run test:plaid` | Vitest against the Plaid Sandbox |
| `npm run test:e2e` | Playwright (needs `npx playwright install chromium` once) |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |

### Known advisories

`npm audit` reports moderate esbuild dev-server advisories reachable only
through `drizzle-kit`'s CLI (dev-only, not shipped). The fix is a breaking
`drizzle-kit` downgrade; deferred.
