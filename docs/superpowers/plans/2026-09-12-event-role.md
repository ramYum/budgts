# Implementation Plan — Event Role

Spec: `docs/specs/2026-09-12-event-role-design.md` (read it first — this plan
argues from it and defers to it on any conflict).

## Global Constraints (bind every task)

- **Scope is Event Role only.** Do not implement Budget Effect, Money Left,
  Savings Rate, or any UI. Do not revisit Phase 15 (`duplicate_of_id`).
- **Do not modify** `src/lib/budget/qualify.ts`, `countsForMonth`, any
  `duplicate_of_id` logic, `sign-convention.ts`, or `finalizeSignConvention`.
  Read-only with respect to all of these.
- **No historical backfill.** Only newly landed/modified rows (post-deploy)
  get a resolved `event_role`. Never write a migration or script that
  populates `event_role` on existing rows.
- **`event_role` is `text`, nullable, no enum** — follow the `pending_reason`
  column precedent exactly (spec §4). Do not introduce a `pgEnum` for it.
- **Never guess.** Every branch not explicitly listed in spec §3's table
  resolves to `null`. `P2P_PAYMENT`, `CASH_ADVANCE`, `ADJUSTMENT` are never
  assigned by the resolver in this plan — if a task's tests seem to need one
  of them assigned, that's a signal to stop and re-check against the spec,
  not to add a heuristic.
- **No account-type threading.** Do not add `accountType` to
  `AccountMapEntry` or `NormalizeCtx`. The spec explicitly decided against
  this (§5) — the verified PFC signal is self-sufficient.
- **`eventRole` updates unconditionally on `modified`**, not gated by
  `userCategorized` (spec §5, §8.4) — do not copy the
  `demotingConfirmedToSignUnknown`-style guard pattern from
  `apply-sync.ts`'s `patchFrom`; that guard exists for a different reason
  (protecting an already-trusted row from a per-account mutable external
  state) that doesn't apply to `event_role`.
- **TDD.** Every task writes the failing test(s) first, shows the RED run,
  then implements to GREEN. Report both in the task report.
- **Migration safety:** staging DB is `budgts-staging`
  (`iwypmifvmtmkwtnxkfma`). `npm run db:migrate` / `drizzle-kit migrate`
  targets `.env.local` (production) — **do not run it for this plan's
  migration.** Apply the migration to staging the same way Task 1 of the
  sign-convention plan did: a scoped, direct SQL script against
  `DIRECT_URL` from `.env.staging`. If that's blocked by a permission
  denial, stop and report — do not route around it (established precedent
  from the sign-convention branch). Never touch production data.
- **No push to origin.** Work stays local to this branch/worktree.
- **Report contract:** every task report states exact files changed, the
  RED and GREEN test output, `npm run typecheck` output (noting any
  pre-existing, out-of-scope failures by name so they aren't confused with
  new ones), and a self-review answering: did this touch `qualify.ts`,
  `duplicate_of_id`, or `sign-convention.ts`? (must be "no" every time).

## Setup

Continue in the existing `sign-convention` worktree
(`.worktrees/sign-convention`) — do not create a new worktree; this branch
is frozen/not-pushed, but the worktree itself is reusable local workspace.
Branch from current `HEAD` at the start of Task 1 with a new local branch,
e.g. `git checkout -b event-role`, so `sign-convention`'s own history stays
untouched and easy to diff against. Confirm `git status` is clean before
branching.

Baseline check before Task 1: `npm run typecheck` and `npx vitest run` —
record the pre-existing state (the sign-convention branch's known
out-of-scope gaps, if any) so later tasks can distinguish pre-existing
failures from regressions.

---

## Task 1 — Schema: add `event_role` column

**Files:** `src/lib/db/schema.ts`, new file under `supabase/migrations/`.

**Steps:**
1. In `schema.ts`, add `eventRole: text("event_role"),` to the `transactions`
   table definition, placed immediately after `pendingReason` (same additive
   grouping/comment style as the other V1 additive columns — see the block
   comment above `plaidAccountId` for the established pattern; add a short
   comment pointing at spec §3/§4).
2. Run `npm run db:generate` to emit the migration SQL from the schema diff.
   Confirm the generated SQL is exactly `ALTER TABLE "transactions" ADD
   COLUMN "event_role" text;` (nullable, no default, no enum, no FK) — if
   Drizzle emits anything else, stop and report before proceeding.
3. Apply the migration to staging via the scoped-script method (Global
   Constraints). Verify with a direct `SELECT column_name FROM
   information_schema.columns WHERE table_name = 'transactions' AND
   column_name = 'event_role'` against staging.
4. Do **not** run `npm run db:migrate` (targets production/.env.local).

**Tests:** none (pure schema/migration task) — verification is the direct
staging column check in step 3, recorded in the report.

---

## Task 2 — Pure resolver: `src/lib/plaid/event-role.ts`

**Files:** `src/lib/plaid/event-role.ts` (new), `src/lib/plaid/event-role.test.ts` (new), `src/lib/plaid/types.ts`.

**Interface (exact — copy verbatim):**

```ts
// src/lib/plaid/types.ts — add near other Plaid-specific type exports:
export type EventRole =
  | "PURCHASE"
  | "REFUND"
  | "INCOME"
  | "CARD_PAYMENT"
  | "TRANSFER"
  | "P2P_PAYMENT"
  | "FEE"
  | "INTEREST"
  | "CASH_ADVANCE"
  | "ADJUSTMENT";
```

```ts
// src/lib/plaid/event-role.ts
import type { EventRole } from "./types";

export interface EventRoleInput {
  primary: string | null;
  detailed: string | null;
  isTransfer: boolean;
  direction: "debit" | "credit";
}

/**
 * Resolves a transaction's Event Role from its (already sign-corrected)
 * direction and Plaid PFC fields. Pure, deterministic, no I/O. Design:
 * docs/specs/2026-09-12-event-role-design.md §3. Every branch not listed
 * there returns null — never guess.
 */
export function resolveEventRole(input: EventRoleInput): EventRole | null {
  // implement spec §3's table, in the exact order given (first match wins)
}
```

Note `isTransfer` is passed in rather than recomputed — the caller
(`adapter.ts`) already computes it from `TRANSFER_PRIMARIES`, and this
resolver must not duplicate or diverge from that logic (spec row 5 depends
on the caller's existing `isTransfer`, not a fresh primary check, so a
future change to `TRANSFER_PRIMARIES` only has one place to update).

**Spend-shaped primaries constant** (used by rows 6/7 of the table — define
as an exported `const SPEND_SHAPED_PRIMARIES = new Set([...])` in this file,
listing exactly: `FOOD_AND_DRINK`, `GENERAL_MERCHANDISE`,
`HOME_IMPROVEMENT`, `MEDICAL`, `PERSONAL_CARE`, `GENERAL_SERVICES`,
`GOVERNMENT_AND_NON_PROFIT`, `TRANSPORTATION`, `TRAVEL`,
`RENT_AND_UTILITIES`, `ENTERTAINMENT` — this is the same primary set
`category-map.ts`'s `PRIMARY_TO_CATEGORY_NAME` recognizes as spend
categories, minus `INCOME`/`TRANSFER_IN`/`TRANSFER_OUT`/`LOAN_PAYMENTS`/
`BANK_FEES`, which are handled by earlier rows).

**Tests (`event-role.test.ts`) — one case per table row, plus fallthroughs:**
1. `LOAN_PAYMENTS` / `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` → `CARD_PAYMENT`.
2. `INCOME` (any detailed) → `INCOME`.
3. `BANK_FEES` / `BANK_FEES_INTEREST_CHARGE` → `INTEREST`.
4. `BANK_FEES` / `BANK_FEES_ATM_FEES` → `FEE`.
5. `BANK_FEES` / unrecognized detailed (e.g. a made-up future value) → `FEE`
   (proves the fallback-within-BANK_FEES, not just the named case).
6. `isTransfer: true`, `primary: "TRANSFER_OUT"` → `TRANSFER`.
7. `isTransfer: true`, `primary: "TRANSFER_IN"`, `detailed:
   "TRANSFER_IN_SAVINGS"` → `TRANSFER` (detailed doesn't change the role,
   still MEDIUM-confidence TRANSFER — proves row 5 doesn't over-fit to one
   detailed value).
8. `direction: "credit"`, `primary: "FOOD_AND_DRINK"` → `REFUND`.
9. `direction: "debit"`, `primary: "GENERAL_MERCHANDISE"` → `PURCHASE`.
10. `primary: null` → `null`.
11. `primary: "LOAN_PAYMENTS"`, `detailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT"`
    → `null` (proves row 1 doesn't over-match all of `LOAN_PAYMENTS`).
12. `primary: "LOAN_PAYMENTS"`, `detailed: null` → `null`.
13. An unrecognized/未来 primary the resolver doesn't know (e.g.
    `"SOME_FUTURE_PRIMARY"`) with `direction: "debit"` → `null` (proves no
    silent default-to-PURCHASE for an unknown primary — this resolver must
    never throw, unlike `category-map.ts`'s `UnknownPfcPrimaryError`; returning
    `null` is correct here since an unresolved role is always a valid,
    expected state).

Run RED (file exists, resolver body empty/throws) → implement → GREEN, report
both.

---

## Task 3 — Wire into `adapter.ts`

**Files:** `src/lib/plaid/adapter.ts`, `src/lib/plaid/adapter.test.ts`, `src/lib/plaid/types.ts`.

**Steps:**
1. Add `eventRole: EventRole | null;` to `PlaidNormalizedTxn` in `types.ts`.
2. In `adapter.ts`, after the existing `isTransfer`/`categoryId` block (which
   already computes `primary`, `detailed`, and has `direction` in scope from
   the sign-convention correction above it), call:
   ```ts
   const eventRole = resolveEventRole({ primary, detailed, isTransfer, direction });
   ```
3. Add `eventRole` to the returned `PlaidNormalizedTxn` object (`txn`), placed
   near `isTransfer`/`categoryId` for readability.
4. Import `resolveEventRole` from `./event-role`.

**Tests (`adapter.test.ts`) — add cases, do not remove existing ones:**
1. A `LOAN_PAYMENTS`/`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` input →
   `result.txn.eventRole === "CARD_PAYMENT"`, and confirm `categoryId` is
   still resolved independently per the existing category-resolution logic
   (proves the two computations don't interfere).
2. A `TRANSFER_IN` input → `eventRole === "TRANSFER"`, and confirm
   `isTransfer === true` still holds (proves `resolveEventRole` doesn't
   change `isTransfer`'s own value, only reads it).
3. An `INCOME` input on an `inverted`-sign-convention account → `eventRole
   === "INCOME"` (proves event role reads the already-corrected `direction`,
   not the raw Plaid amount sign — ties to spec §7's refund/sign-inversion
   edge case).
4. A currency-mismatch (`pendingReason: "currency_mismatch"`) row still gets
   a non-null `eventRole` when the underlying PFC fields resolve one (proves
   spec §6's "computed unconditionally, even for pending_review" invariant).
5. A `zero-amount` or `unknown-account` skip path: confirm `resolveEventRole`
   is never called (or its result is irrelevant) — these paths return before
   reaching event-role resolution; add/keep a `skip` assertion, not an
   `eventRole` assertion, for these.

Run RED → implement → GREEN, report both plus full `src/lib/plaid`
`npx vitest run` sanity check (compare against Task 1-2's baseline, expect
only new passing tests, zero regressions).

---

## Task 4 — Carry through `land.ts` and `apply-sync.ts`

**Files:** `src/lib/plaid/land.ts`, `src/lib/plaid/land.test.ts`,
`src/lib/plaid/apply-sync.ts`, `src/lib/plaid/apply-sync.test.ts`.

**Steps — `land.ts`:**
1. Add `"eventRole"` to `PlaidTxnInsert`'s `Pick<TxnInsert, ...>` union,
   placed after `"pendingReason"`.
2. Add `eventRole: n.eventRole` to the object `plaidToInsert` returns,
   placed after `pendingReason: n.pendingReason`.

**Steps — `apply-sync.ts`:**
1. Add `eventRole: EventRole | null;` to `TxnPatch` (import `EventRole` from
   `./types`).
2. In `patchFrom`, add `eventRole: n.eventRole,` to the returned object —
   **unconditional**, in the same block as `merchantName`/
   `plaidCategoryPrimary`/etc. (the fields that already update regardless of
   `userCategorized`), **not** inside the `if (!ex?.userCategorized) { ... }`
   block that guards `categoryId`/`isTransfer`. Do not add `eventRole` to
   `ExistingPlaidRow` — nothing here reads the existing row's prior
   `event_role` to decide the patch (unlike the sign-unknown-demotion guard,
   which genuinely needs the existing row's `status`).

**Tests:**
- `land.test.ts`: one new case, "carries eventRole through to the insert
  row" (mirrors the existing `pendingReason` carry-through test exactly),
  plus add `eventRole: null` (or a resolved value) to the shared fixture and
  the "maps every field to its Drizzle column" expected object.
- `apply-sync.test.ts`: one new case proving `eventRole` appears in the
  patch on a `modified` event; one new case with `ex.userCategorized: true`
  proving `eventRole` **still** updates (the field this test must
  distinguish from `categoryId`/`isTransfer`, which would NOT update in
  that same scenario) — this is the one assertion in this task that proves
  the "unconditional" global constraint, so don't skip it.

Run RED → implement → GREEN, report both.

---

## Task 5 — DB-integration coverage

**Files:** `tests/integration/_db.ts`, `tests/integration/plaid-sync-store.test.ts`.

**Steps:**
1. In `_db.ts`, extend `insertBankTxn`'s `over` param with an optional
   `eventRole` override (default `null`, matching the column's default
   nullability), and add `event_role` to the INSERT's column list/values —
   mirror exactly how Task 4 of the sign-convention plan added `direction`/
   `status`/`pendingReason` there (see
   `.worktrees/sign-convention/.superpowers/sdd/2026-09-12-sign-convention/task-4-report.md`
   for the precedent if useful context, but do not re-read the whole
   sign-convention ledger — this task is self-contained from the brief).
2. In `plaid-sync-store.test.ts`: add `eventRole: null` to the `txn()`
   builder fixture; add one new assertion (or extend the existing "applies a
   field patch by row id" test) proving `event_role` round-trips through a
   real Postgres UPDATE via `applyPlaidSync`'s patch path — insert a row,
   patch it with a resolved `eventRole` value (e.g. `"CARD_PAYMENT"`), fetch
   it back, assert the stored `event_role` column matches.

**Tests:** the above, against staging Postgres (same DB-integration harness
already in use — `DIRECT_URL` from `.env.staging`, already resolvable in
this worktree per the sign-convention branch's Task 4 setup). Run RED
(column exists from Task 1, but code doesn't set it yet — actually by Task 5
Task 4 is done, so this should be closer to a GREEN-first confirmation
that the whole path works end-to-end; if it's unexpectedly RED, that's a
real signal something in Tasks 2-4 is wrong — stop and report rather than
patching around it here) → confirm GREEN, report full output.

---

## Task 6 — Full verification + report

**No new code.** Run and report:
1. `npm run typecheck` — full output; explicitly name any failures and
   confirm each is pre-existing/out-of-scope (compare against the Setup
   baseline) or none.
2. `npx vitest run` (full unit suite) — pass/fail counts.
3. Full DB-integration suite (`tests/integration/`) — pass/fail counts.
4. `npm run lint` and `npm run build`.
5. `git log --oneline` for the `event-role` branch, `git status` (confirm
   clean, confirm nothing pushed).
6. A short table confirming every Global Constraint held: qualify.ts
   untouched (grep diff for the string), duplicate_of_id untouched,
   sign-convention.ts untouched, no backfill script/migration exists, no
   account-type threading was added, eventRole updates unconditionally
   (point at Task 4's specific test).

Stop after Task 6. Do not begin Budget Effect or any other North Star layer.
Do not push. Report everything above for review, per the controlling
instruction for this plan.
