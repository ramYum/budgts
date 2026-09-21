# Database migration policy — permanent rules

Why this file exists: the original staging project's (`budgts-staging`, since retired) migration ledger (`drizzle.__drizzle_migrations`)
drifted from the repository's actual migration files — several migrations'
schema changes are physically present in staging, but the ledger has no
matching hash recorded for them, and it contains at least two entries whose
hashes match no migration file currently in the repository at all. Root
cause was never conclusively identified (no incident record exists from
when it happened), but the repo's own history shows staging has been
modified out-of-band before (`supabase/staging-plaid-cron.sql` is hand-run
SQL, not a migration). Fresh-database validation proved the migration chain
itself (`0000` → `0022` today) is sound and reproducible — the problem was
process, not the SQL. This document is the permanent fix to the process.

## The rules

1. **Every deployed schema change requires a committed migration file.**
   No exceptions, including "just this once" fixes applied by hand.
2. **Migration files in Git are the schema-change source of truth.** Not
   what's live in any database, not what anyone remembers doing.
3. **`npm run db:migrate` is the normal migration mechanism** for every
   deployed environment (staging, production, any future environment).
4. **Never use `db:push`** against staging or production. `db:push` diffs
   and applies directly with no migration file and no ledger entry — by
   definition it cannot be reproduced from an empty database, and it's
   exactly the kind of operation that produces drift.
5. **Never manually execute migration SQL** against staging or production
   through the SQL editor, `psql`, or any other direct path. If a change is
   worth making, it's worth being a migration file.
6. **Never manually insert rows into `drizzle.__drizzle_migrations`.** A row
   in that table is a claim that `db:migrate` actually ran that file. A
   manually-inserted row is a false claim, even when the underlying schema
   change genuinely happened some other way — it corrupts the one signal
   this whole system depends on.
7. **Never manually backfill migration hashes**, for the same reason as #6.
8. **Never rewrite an already-deployed migration.** Once a migration file
   has been applied anywhere beyond a developer's own machine, it's
   immutable — fix forward with a new migration.
9. **Every migration must be reproducible from an empty database.** This is
   what "fresh-database validation" (§ below) exists to prove continuously,
   not just assume.
10. **Migration files must remain in Git.** Never `.gitignore`d, never
    deleted after being superseded.
11. **Staging and production are separate Supabase projects.** Not a
    schema/branch split within one project.
12. **Staging and production credentials must never be interchangeable.**
    A `DIRECT_URL` that works against one must never coincidentally also
    work against the other. Verify which env file/variable holds which
    before trusting it — see "Never trust the file name" below.
13. **Before migrating, verify the target database's identity** — by the
    Supabase project ref parsed from the actual connection string, not by
    which environment variable or `.env` file supplied it. Tooling for this
    is described below.
14. **If migration-history drift is detected, STOP.** Do not run `db:migrate`
    against a drifted database — it will very likely fail partway through
    (hitting "already exists" on the first already-applied-but-unrecorded
    migration) or, worse, succeed in a way that further corrupts the ledger.
15. **Drift must be investigated, never silently repaired.** No automated
    or manual "fix" that makes the ledger agree with reality is acceptable
    unless it happened via a real `db:migrate` run. If the ledger and
    reality disagree, find out why before deciding what to do about it —
    and treat "retire and replace the environment" as a legitimate, often
    preferable outcome to forensic repair (see the retirement note below).
16. **A migration containing both schema changes and data backfills is one
    atomic migration** — its data effects are part of its correctness, not
    an optional extra. A migration file's hash matching the ledger proves
    the *statements* ran; it does not by itself prove a backfill query's
    *effect* is what you'd expect on every dataset it touched. When a
    migration includes a data backfill, verify the data effect separately
    (e.g., spot-check row counts/values), not just the ledger hash.

### Never trust the file name

Don't assume a database is staging merely because a variable is named
`DIRECT_URL` in a file called `.env.staging`, and don't assume `.env.local`
is safe because it's the one you use for daily dev work. This repo has
directly had `.env.local` resolve to the **production** Supabase project.
Every tool described below identifies its target by parsing the Supabase
project ref out of the actual connection string, and refuses to proceed on
an unparseable or unconfirmed target — see § Tooling.

### Normal promotion path

```
development
    ↓
staging
    ↓
production
```

A schema change is written and tested locally, applied to staging via
`db:migrate` and verified there, then applied to production via `db:migrate`
only after staging verification passes. No environment is ever skipped.

## What happened with the old staging environments

- The first staging project (`budgts-staging`, ref `iwypmifvmtmkwtnxkfma`) had a migration ledger that drifted from the
  repository's actual history — some migrations' schema changes were present without a ledger entry, and the ledger held entries
  that matched no current repository file. Root cause was never conclusively identified.
- Fresh-database validation (a disposable Supabase project, migrated from empty with `db:migrate`) proved the migration chain itself
  was never the problem. Given the rules above, the drifted ledger was not repaired in place: the project was **retired and
  replaced** with a fresh one (`budgts-staging-2`), migrated the normal way from empty — the sanctioned way to resolve
  migration-history drift when forensic repair would break one of the rules above.
- `budgts-staging-2` was itself replaced on 2026-09-21 by **`Budgets-Staging-3`** (ref `uvowywszaiojboaxdmoz`, org *Budgts
  Validation*) so that the monetization migrations (`0021`/`0022`) were applied from empty with no skipped or hand-stamped entries;
  it was verified (integration suite, deployed end-to-end checks, Playwright) and then the old project was deleted. Runbook:
  `staging-replacement.md`. **Budgets-Staging-3 is the only staging project.**

## Tooling

### Target identification (`tools/db/target-safety.ts`)

Shared module used by every database-facing tool in this repo. Parses a
Supabase project ref out of a connection string (works for the pooler host,
the raw direct host, or an API URL), checks it against a small registry of
known project refs (production, the retired and deleted staging projects, the
disposable validation project, and the current staging project — update this list when projects are created/retired; a
retired or deleted ref is marked `staging-legacy` so the preflight refuses it), and masks
credentials for safe logging. Nothing here is a secret — project refs are
visible in every project URL — so this file is safe to commit.

### `predb:migrate` — the migration gate

npm automatically runs `predb:migrate` before `npm run db:migrate` (npm's
built-in pre-script convention). It computes the exact connection string
`drizzle-kit migrate` is about to use (mirroring `drizzle.config.ts`'s own
`.env.local` loading, so it's checking reality, not a stricter parallel
universe), identifies the project ref, and **refuses to proceed unless
`MIGRATE_CONFIRM_REF` is explicitly set to that exact ref**:

```
MIGRATE_CONFIRM_REF=<project-ref> npm run db:migrate
```

You cannot satisfy this by accident — it requires typing the ref you
believe you're targeting. If it doesn't match what actually resolves, the
gate stops before `drizzle-kit` ever connects.

### `npm run db:verify-history` — read-only drift detector

Compares the repository's migration files against the target database's
`drizzle.__drizzle_migrations` ledger and reports exactly what it can prove
from that comparison — nothing more. It does **not** inspect the schema
itself to guess whether a migration "really" ran; a physically-present
table with no matching ledger hash is reported as unproven, not assumed.

```
DIRECT_URL="postgresql://..." npm run db:verify-history -- --ref <project-ref>
```

- Deliberately does not auto-load any `.env` file — you must export the
  connection string yourself, so there's never ambiguity about which file's
  value is in effect.
- `--ref` is recommended (and will hard-stop on a mismatch before querying
  anything) but not required, since this tool is read-only; without it, the
  detected target is still printed prominently.
- Reports one of: **fresh** (ledger table missing or empty — not an error),
  **clean** (ledger matches repository history, possibly with a normal
  "pending" tail of not-yet-applied migrations), or **drift** — missing
  migrations, unexpected ledger entries, hash mismatches (a migration file
  edited after being applied), ordering anomalies, or malformed ledger rows.
- Exits non-zero on drift, zero otherwise. Never modifies the ledger or the
  schema under any circumstance.
- Implementation: `tools/db/migration-history.ts` (pure comparison logic,
  unit-tested — see `tests/unit/db-migration-history.test.ts`) plus
  `tools/db/verify-migration-history.ts` (the CLI wrapper: reads files,
  connects read-only, prints the report).

## Fresh-database migration validation in CI

**Status: repository-side components exist and are tested now; the CI
provisioning step itself is not yet wired up — see "Remaining CI
provisioning step" below.**

Desired flow:

```
GitHub PR
   ↓
Migration files changed?
   ↓
Create/use disposable PostgreSQL database
   ↓
Run normal `npm run db:migrate`
   ↓
Run `npm run db:verify-history`
   ↓
Run relevant schema/integrity checks
   ↓
PASS / FAIL
```

**What runs in CI today:** `tests/unit/db-migration-chain.test.ts` (part of `npm test`, so part of CI) applies the *entire*
journal to an **empty embedded Postgres** (PGlite) with the same file reader drizzle uses. It proves order / dependency correctness,
that no entry is skipped (including the production-like two-step release: `0000`-`0016` already applied, then `0017`-`0022`),
and the schema guarantees the monetization design relies on. Supabase's own pieces (`auth.users`, `auth.uid()`, the `anon` /
`authenticated` roles, the realtime publication) are a **minimal stub**, so this validates the DDL, constraints and triggers (most
of the value) but not that a real Supabase project behaves identically.

**What is still manual:** the faithful check — `db:migrate` on a genuinely fresh *real* Supabase project, then
`npm run db:verify-history` — done for `0000`-`0017` on the disposable validation project and for `0000`-`0022` on
`Budgets-Staging-3` (23/23 ledger entries). A Supabase-CLI-based CI job remains an option if the stub ever proves too weak
(open question: `supabase start` auto-applies `supabase/migrations` through its own tracking table, which would collide with
drizzle's).

## Test coverage

`tests/unit/db-migration-chain.test.ts` — the whole chain from empty, no entry skipped (above). `tests/unit/db-migration-history.test.ts` — the comparison logic covers:
exact match (clean), missing migration (gap before a later recorded one),
unexpected ledger entry, hash mismatch (file edited after being applied),
ordering anomaly, malformed ledger row data, a genuinely fresh database
(both "ledger table doesn't exist" and "exists but empty"), and a
repository-ahead-of-database "pending" tail (correctly *not* treated as
drift). `tests/unit/db-target-safety.test.ts` covers ref extraction across
the connection-string shapes this repo actually uses, credential masking,
and the confirm/mismatch/unparseable paths of `requireConfirmedRef`.

## Replacing a staging project

See `docs/operations/staging-replacement.md` for the build-new, verify, then delete-old procedure.
