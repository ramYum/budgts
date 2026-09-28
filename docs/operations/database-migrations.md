# Database migration policy — permanent rules

> **Status (2026-09-27):** the Stage 0 port (`phase-m/stage0-port`) brought
> the shelved migrations over from `mobile/native-home`, renumbered after
> main's `0017` (Plaid sync lease) and `0018` (per-user time zone):
> `0019` deletion FK indexes, `0020` transactions account index, `0021`
> deletion write guard, `0022` guard allows bank disconnect, `0023`
> monetization ledger (all ten tables; the influencer ones stay empty),
> `0024` entitlements + billing events (without the dropped trial-reminder
> columns). Today's only staging is **Budgets-Staging-3
> (`uvowywszaiojboaxdmoz`)**. It was rebuilt on 2026-09-28 and its history now
> matches `0000`–`0024` exactly (`db:verify-history`: CLEAN); see "Staging
> rebuild (done 2026-09-28)" below. Production got `0019`–`0024` the same day
> (owner-approved, 2026-09-28 11:53Z) and now has `0000`–`0024`; its ledger
> carries old line-ending and ordering history, see "Production ledger: known
> pre-existing drift" below.

Why this file exists: `budgts-staging`'s migration ledger (`drizzle.__drizzle_migrations`)
drifted from the repository's actual migration files — several migrations'
schema changes are physically present in staging, but the ledger has no
matching hash recorded for them, and it contains at least two entries whose
hashes match no migration file currently in the repository at all. Root
cause was never conclusively identified (no incident record exists from
when it happened), but the repo's own history shows staging has been
modified out-of-band before (`supabase/staging-plaid-cron.sql` is hand-run
SQL, not a migration). Fresh-database validation proved the migration chain
itself (`0000` → `0017`) is sound and reproducible — the problem was
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

## What happened with the old staging environment

- `budgts-staging`'s migration ledger drifted from the repository's actual
  migration history — some migrations' schema changes are present in the
  database without a corresponding ledger entry, and the ledger contains
  entries that don't correspond to any current repository file.
- Fresh-database validation (a disposable Supabase project, migrated from
  empty with `db:migrate`) proved that migrations `0000` → `0017`, including
  the finalized monetization ledger schema, apply cleanly and reproducibly
  from nothing. The migration chain itself was never the problem.
- Given rules 6/7/15 above, the old staging project's ledger is not being
  repaired in place. It is being **retired and replaced** with a fresh
  Supabase project, migrated the normal way from empty. This is the
  intended, sanctioned way to resolve migration-history drift when
  forensic repair would require breaking one of the rules above.

## Staging rebuild (done 2026-09-28)

**Why.** Budgets-Staging-3 had been migrated from `mobile/native-home`'s
chain, then got main's `0017` and `0018`. Its ledger recorded the shelved
numbering (`0017_deletion_fk_indexes` … `0022_entitlements_and_billing_events`)
plus main's `0017`/`0018`, so `db:verify-history` reported drift and
`db:migrate` would have re-applied `0019`–`0024` on top of existing tables.
The owner approved the rebuild on 2026-09-28 ("Rebuild staging").

**What was done** (scripts and logs stayed in that session's scratchpad):

1. **Looked first:** 25 `public` tables, 747 rows, 48 `auth.users`, 25 ledger
   rows, two cron jobs (`plaid-sync-due`, `billing-reconcile`).
2. **Backed up:** a data-only export of every `public` table (NDJSON per
   table), the old ledger and the `auth.users` id/email/created_at list, taken
   in one read-only transaction (`pg_dump` is not installed on this machine).
   The counts matched step 1 (747 rows, 25 ledger rows, 48 users). The
   backup is disposable test data and is not kept in the repo.
3. **Emptied `public` object by object, never `drop schema public cascade`.**
   On this project the `pg_net` extension is registered in schema `public`
   (it cannot be relocated), so dropping the schema would also drop `pg_net`
   and its `net` schema, which breaks `plaid-sync-due`. It would also lose the
   `supabase_admin` default privileges on `public`, which `postgres` cannot
   recreate. Instead, in one checked transaction: every `public` table (25),
   function (6) and enum (9) dropped with `CASCADE`, then
   `drop schema drizzle cascade`. The cascade removed the `auth.users` trigger,
   and `0000` recreated it. The script checked afterwards that `pg_net` and
   the schema grants were still there, that all six default-privilege entries
   were unchanged, and that the 48 auth users and both cron jobs survived.
   **Do the same on any future rebuild of this project.**
4. **Migrated from empty:** `MIGRATE_CONFIRM_REF=uvowywszaiojboaxdmoz npm run
   db:migrate` applied `0000`–`0024`.
5. **Kept the auth users** and ran the migrated `handle_new_user()` body once
   per user. Every one of the 48 has one profile, one `Main` checking account
   and the eight default categories, with `onboarded_at` and `time_zone` null,
   so they land in onboarding.
6. **Cron:** `billing-reconcile` unscheduled, because billing is off and the
   deployed `budgts-staging` build is stale. Re-schedule it from
   `supabase/billing-cron.sql` when Phase 4 switches billing on.
   `billing-reminders` was never scheduled on this project. `plaid-sync-due`
   was kept.
7. **Verified:** `db:verify-history -- --ref uvowywszaiojboaxdmoz` reports
   `✅ CLEAN` (25 of 25); RLS is on for all 25 tables; the `reminder_*`
   columns and `entitlements_trial_reminder_idx` are gone. Integration suite:
   28 of 28 files, 172 of 172 tests.

**Found while rebuilding (follow-ups):**

- **`db:migrate` loads `.env.local` (PRODUCTION).** `drizzle.config.ts` and
  the migrate gate load `.env.local` ("injected env (8) from .env.local").
  The rebuild passed staging's `DIRECT_URL` / `DATABASE_URL` explicitly
  (dotenv never overrides a variable that is already set), and the gate
  confirmed the staging ref before `drizzle-kit` connected. The gate would
  also refuse a production URL while `MIGRATE_CONFIRM_REF` names staging.
  Still, a staging migration should never read the production file: make the
  config take its env file from the confirmed target instead.
- **`plaid-sync-due` on staging runs every 30 seconds** with a 20-second
  timeout, while `supabase/staging-plaid-cron.sql` says `*/10 * * * *` and
  290000 ms. It was left as found. It calls the stale `budgts-staging`
  deployment, which returned three 500s during the rebuild window and 200s
  otherwise. Reconcile the job with the file (or the file with the job) on
  purpose.
- e2e against staging (the procedure's last step) was not re-run after the
  rebuild; the next isolated e2e run covers it.

## Production ledger: known pre-existing drift (found 2026-09-28)

`0019`–`0024` were applied to production on 2026-09-28 (ledger 19 → 25 rows;
the six new rows are LF hashes and match). Before and after, `npm run
db:verify-history -- --ref wsmhstqpvbbcqpqhiqyp` reports drift that predates
that migration and is **not** an unrecorded or missing migration:

- **Line endings, not content.** Every one of `0000`–`0018` has exactly one
  ledger row whose `created_at` equals its journal `when`, and whose hash is
  the SHA of that file with either LF or CRLF line endings. Production's rows
  were stamped from Windows working copies over time, so they mix the two:
  `0004`, `0006`, `0015` and `0016` hold CRLF hashes, while the rest hold LF
  (or are identical either way). The verifier hashes the raw bytes on disk,
  and this checkout still has seven migration files with CRLF working copies
  (`git ls-files --eol`: `0003`, `0004`, `0006`, `0008`, `0013`, `0015` and
  `0016` are `i/lf w/crlf`, predating the LF pin). So it currently flags
  `0003`, `0008` and `0013`. Renormalizing the working copy would flag `0004`,
  `0006`, `0015` and `0016` instead. The staging rebuild ran from this
  checkout, so staging's ledger holds the same on-disk hashes and reports
  CLEAN today.
- **Ordering.** Ledger id 15 is `0015` and id 16 is `0014`: production
  applied them in that order, because `0015`'s journal `when` is 1 ms earlier
  than `0014`'s (a known journal anomaly).

Drizzle never re-checks the hashes of applied migrations (it applies by
`created_at`), so none of this affects `db:migrate`. **Do not restamp ledger
rows** (rules 6, 7 and 15). The root-cause fix is in the tool: make
`db:verify-history` compare line-ending-normalized content (accept a
file's LF or CRLF hash), and record the `0014`/`0015` order as a documented,
known production anomaly instead of drift. Until then, read a production
drift report against this list: anything beyond these items is real.

## Tooling

### Target identification (`tools/db/target-safety.ts`)

Shared module used by every database-facing tool in this repo. Parses a
Supabase project ref out of a connection string (works for the pooler host,
the raw direct host, or an API URL), checks it against a small registry of
known project refs (production, retired staging, the disposable validation
project — update this list when projects are created/retired), and masks
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

**What already exists and is safe to rely on today:**
- `npm run db:migrate` and `npm run db:verify-history` are both real,
  tested commands that work against any reachable Postgres — they don't
  need CI-specific code, just a target.
- The comparison logic they share is unit-tested (`tests/unit/db-migration-
  history.test.ts`), independent of any live database.
- This exact flow was run manually, once, against a disposable Supabase
  project (`budgts-migration-validation`) and passed cleanly end to end —
  proving the approach works, not just that it's theoretically sound.

**What's genuinely unresolved — a real infrastructure gap, not neglect:**
this repo's migrations depend on Supabase-specific primitives (`auth.users`,
`auth.uid()`, the `authenticated`/`anon`/`service_role` roles) that a plain
`postgres` Docker image — the obvious, simplest GitHub Actions service
container — does not provide. Migration `0000` itself already references
`auth.users`, so even the first migration would fail against a bare
Postgres container. Two real options, neither committed to `.github/workflows/`
yet because neither has been verified to actually work in this environment
(no Docker is available here to test either one):

1. **Supabase CLI local stack** (`supabase/setup-cli` GitHub Action +
   `supabase start`) — the faithful option. Supabase's local dev stack
   bundles a real `auth`/`storage`/`realtime` schema set and the platform
   roles, so migrations run against something structurally equivalent to a
   real project. Open question to resolve before wiring this up: `supabase
   start` auto-applies `supabase/migrations/*.sql` itself (via its own,
   separate `supabase_migrations.schema_migrations` tracking table) as part
   of bringing up the local stack — if that happens before `npm run
   db:migrate` runs, drizzle-kit will hit "already exists" on every
   statement, since Supabase CLI will have already created everything
   through its own mechanism. This needs to be tested and solved (likely:
   start the stack with migration auto-apply disabled, or point `db:migrate`
   at a schema Supabase CLI leaves untouched) before this can be trusted in
   CI. This repo's `supabase/migrations` directory already happens to sort
   correctly under Supabase CLI's own lexical-order migration discovery, so
   there's no renaming work needed if this path is chosen — but the
   auto-apply conflict above still needs solving.
2. **Bare `postgres` container + a minimal hand-written `auth` schema
   stub** — lower setup complexity, but a hand-rolled stub can't be trusted
   to match real Supabase's `auth.users` shape exactly, so a pass here
   would validate the DDL/constraint/trigger logic (most of the value) but
   wouldn't fully guarantee a real Supabase project behaves identically.

**Remaining CI provisioning step:** someone with a Docker-capable
environment needs to build and actually run one of the two options above,
confirm it produces a genuinely fresh, migration-free target before
`db:migrate` runs, and wire it into `.github/workflows/` gated on changes
under `supabase/migrations/**` or `src/lib/db/schema.ts` (mirroring how
`ci.yml`'s existing job triggers). Until then, fresh-database validation
happens manually — which is exactly how `0017` was validated before this
document existed, and remains a fully legitimate way to validate a
migration in the meantime.

## Test coverage

`tests/unit/db-migration-history.test.ts` — the comparison logic covers:
exact match (clean), missing migration (gap before a later recorded one),
unexpected ledger entry, hash mismatch (file edited after being applied),
ordering anomaly, malformed ledger row data, a genuinely fresh database
(both "ledger table doesn't exist" and "exists but empty"), and a
repository-ahead-of-database "pending" tail (correctly *not* treated as
drift). `tests/unit/db-target-safety.test.ts` covers ref extraction across
the connection-string shapes this repo actually uses, credential masking,
and the confirm/mismatch/unparseable paths of `requireConfirmedRef`.
