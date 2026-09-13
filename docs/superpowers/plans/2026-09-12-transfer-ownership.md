# Implementation Plan — Transfer Ownership Corrective Design

Spec: `docs/specs/2026-09-12-transfer-ownership-design.md` (read it first
— this plan argues from it and defers to it on any conflict). This is
revision 3: pre-implementation review rounds found the first draft's
`sync-store.ts`/`sync-engine.ts` loading-path claim wrong (corrected in
revision 2), then found revision 2's "read-then-write, self-correcting"
framing for `updateTransaction` was not actually atomic (corrected here
— see spec §4 for the exact silent-loss sequence this replaces).

## Global Constraints (bind every task)

- **Scope is the transfer-ownership fix only.** Do not implement Money
  Left, Savings Rate, or any UI. Do not touch `rollup.ts`'s deferred
  bucket-assignment gap (still `qualify-integration`'s own deferred item,
  unaffected by this plan). Do not fix §8's separately-flagged,
  pre-existing "general edit form never sets `userCategorized` for
  category edits" bug — noted, not addressed here.
- **Event Role and Budget Effect remain frozen.** Do not modify
  `src/lib/plaid/event-role.ts`, `src/lib/plaid/adapter.ts`,
  `src/lib/plaid/land.ts`, or `src/lib/budget/budget-effect.ts`.
- **`apply-sync.ts`, `sync-store.ts`, and `sync-engine.ts` are reopened,
  narrowly.** These were treated as frozen by `qualify-integration`; this
  plan legitimately reopens exactly three things in them, nothing else:
  (1) `apply-sync.ts`'s `patchFrom` condition widened per spec §4; (2)
  `sync-store.ts`'s `findBySourceRefs` — both its `.select({...})` and its
  return mapping — gain `transfer_user_set`/`transferUserSet`; (3)
  `sync-engine.ts`'s `PlaidTxnRow` interface and `runSync`'s existing-Map
  construction gain the same field. `sync-store.ts`'s `patchToSet` (the
  write path) and `land.ts` do **not** change — `transfer_user_set` is
  never written by sync, only read. `eventRole`'s handling in
  `apply-sync.ts` does **not** change — stays unconditional; do not add
  any gating to it (spec §4 explains why this is unnecessary).
- **`transfer_user_set` has exactly one setter: `updateTransaction`.** No
  other file may write it. It must be set **only** when the submitted
  `is_transfer` differs from the row's current stored value — never
  unconditionally on save (spec §3's Approach (d) rejection is the reason;
  do not reintroduce that failure mode).
- **`updateTransaction`'s mechanism is settled, not a task-time choice,
  and must be genuinely atomic, not a plain read-then-write.** Use an
  optimistic conditional update: read the current `is_transfer`
  (`observed`), then `.update({...}).eq("id", id).eq("is_transfer",
  observed).select("id")` — a second `.eq()` filter, not a raw SQL
  expression. If zero rows are affected, distinguish "row doesn't exist /
  not the caller's" (today's existing `MISSING_ROW` case) from "`is_transfer`
  changed since the read" (a real conflict) by re-reading; on a genuine
  conflict, retry once against the freshly-observed value; if the retry
  also affects zero rows, return a conflict error to the user rather than
  looping or silently applying a decision made against stale data. Do not
  describe a plain read-then-write as "self-correcting" or "atomic" in any
  report — it is neither (spec §4 traces the exact silent-loss sequence).
  Do not attempt a `CASE`-expression update (Supabase-js can't express
  one), do not introduce a `.rpc()` call (zero existing ones in this app),
  and do not add a Postgres trigger (declined for an unverified
  sync-misfire risk — do not revisit that decision inside this
  implementation task).
- **`countsForMonth`'s new branch sits above the role branch, below the
  three absolute gates** (month, status, duplicateOfId) — those three
  keep unconditional precedence over a user's transfer decision, exactly
  as they already do over a machine-derived role.
- **No historical backfill.** Every existing row gets `transfer_user_set
  = false` from the column's own default — never explicitly set by a
  migration or script.
- **Migration safety:** staging DB is `budgts-staging`
  (`iwypmifvmtmkwtnxkfma`). Do not run `npm run db:migrate` /
  `drizzle-kit migrate`. Apply via the same scoped, direct-SQL-against-
  `.env.staging` method used for every prior migration in this sequence.
  If blocked by a permission denial, stop and report — do not route
  around it.
- **TDD.** Every task writes the failing test(s) first, shows the RED
  run, then implements to GREEN.
- **No push to origin.** Work stays local. New local branch off the tip
  of `qualify-integration` (`c460d53`) in the same worktree — do not
  create a new worktree, and do not merge or modify `qualify-integration`
  itself; this plan's branch sits on top of it.
- **Report contract:** every task report states exact files changed, RED
  and GREEN test output, `npm run typecheck` output, and a self-review
  answering: did this touch `event-role.ts`, `adapter.ts`, `land.ts`,
  `budget-effect.ts`, `rollup.ts`, `actuals.ts`, `dashboard.ts`,
  `budget-vs-actual.ts`, or `sync-store.ts`'s `patchToSet` write path?
  (must be "no" every time). Was `transfer_user_set` set anywhere other
  than `updateTransaction`? (must be "no"). Is it set unconditionally
  anywhere, rather than only on detected change? (must be "no").

## Setup

Continue in the existing worktree (`.worktrees/sign-convention`) — do not
create a new worktree. Branch from the tip of `qualify-integration`
(`c460d53`) with a new local branch, e.g. `git checkout -b
transfer-ownership`. Confirm `git status` is clean and `git log -1` shows
`c460d53` before branching.

Before Task 1: run `grep -rn "BudgetTxn\b" src/`, `grep -rn
"user_categorized\|userCategorized" src/`, and `grep -rn "\.rpc(" src/`,
confirming all three match the spec's account of them (one production
`BudgetTxn` construction site; `userCategorized` set only in
`src/server/plaid/actions.ts`; zero `.rpc()` calls anywhere). If any has
changed since the spec was written, stop and report.

Baseline check: `npm run typecheck` and `npx vitest run` — should match
`qualify-integration`'s own final state (0 typecheck errors, 417/417
tests). Record it.

---

## Task 1 — Schema: add `transfer_user_set` column

**Files:** `src/lib/db/schema.ts`, new migration file.

**Steps:**
1. Add `transferUserSet: boolean("transfer_user_set").notNull().default(false),`
   to the `transactions` table, near `isTransfer`/`userCategorized`, with
   the comment from spec §4.
2. `npm run db:generate` — confirm the generated SQL is exactly one
   additive `ALTER TABLE "transactions" ADD COLUMN "transfer_user_set"
   boolean NOT NULL DEFAULT false;` (or equivalent for a `NOT NULL DEFAULT`
   boolean column).
3. Apply to staging via the scoped-script method. Verify directly:
   `SELECT column_name, is_nullable, column_default FROM
   information_schema.columns WHERE table_name = 'transactions' AND
   column_name = 'transfer_user_set'`.
4. Do not run `npm run db:migrate`.

**Tests:** none (schema/migration only) — verification is the direct
staging query, recorded in the report.

---

## Task 2 — Thread `transfer_user_set` through the real existing-row loading path, then widen `apply-sync.ts`'s protection

This is one task, not three, because the pieces are only meaningfully
testable together: `apply-sync.ts`'s guard is meaningless if
`sync-store.ts`/`sync-engine.ts` never populate the field it reads. This
is the task the spec's revision exists to get right — treat the
DB-integration test as the task's real deliverable, not an afterthought.

**Files:** `src/lib/plaid/sync-store.ts`, `src/lib/plaid/sync-engine.ts`,
`src/lib/plaid/apply-sync.ts`, `src/lib/plaid/apply-sync.test.ts`,
`tests/integration/plaid-sync-store.test.ts`, `tests/integration/_db.ts`
(if it needs a `transferUserSet`/`transfer_user_set` override added to
its insert helper, following the same pattern `eventRole` got there).

**Steps:**
1. `sync-store.ts`'s `findBySourceRefs`: add
   `transfer_user_set: transactions.transferUserSet` to the
   `.select({...})`; add `transfer_user_set: r.transfer_user_set` to the
   returned object literal.
2. `sync-engine.ts`: add `transfer_user_set: boolean;` to the `PlaidTxnRow`
   interface; add `transferUserSet: r.transfer_user_set,` to the
   `existing` Map's object literal inside `runSync`.
3. `apply-sync.ts`: add `transferUserSet: boolean;` to `ExistingPlaidRow`.
   In `patchFrom`, split the existing combined condition:
   ```ts
   if (!ex?.userCategorized) {
     p.categoryId = n.categoryId;
   }
   if (!ex?.userCategorized && !ex?.transferUserSet) {
     p.isTransfer = n.isTransfer;
   }
   ```
   `eventRole: n.eventRole` in the same function is **not** touched.
4. TDD, unit level first: write the 4 new `apply-sync.test.ts` cases from
   spec §10 (items 1-4), RED, then implement steps 1-3, GREEN. These
   prove `patchFrom`'s own logic with a hand-constructed
   `ExistingPlaidRow` — they do **not** prove the loading path works.
5. TDD, integration level: write the DB-integration test from spec §10
   (item 4a) in `tests/integration/plaid-sync-store.test.ts` — insert a
   row with `transfer_user_set = true` directly, run a sync-like update
   through the real store, re-fetch from real Postgres, assert
   `is_transfer` was not overwritten. Run it against the **unmodified**
   code first if practical (i.e., before step 1-2's `sync-store.ts`/
   `sync-engine.ts` edits, or by temporarily reverting them) to confirm it
   genuinely fails without them — this is the test that would have caught
   the first-draft gap, so prove it actually would have.
6. Run the full `apply-sync.test.ts` file and the DB-integration suite
   (`npm run test:integration`), confirm no regressions.
7. Run `npm run typecheck`.
8. Commit. Self-review. Report.

**Self-review checklist:**
- Does the DB-integration test genuinely fail if `sync-store.ts`'s
  select/map or `sync-engine.ts`'s additions are reverted? (Confirm this
  was actually checked, not assumed — report the RED output from that
  check.)
- Is `categoryId`'s protection condition unchanged (`!ex?.userCategorized`
  alone)?
- Is `isTransfer`'s protection now `!ex?.userCategorized &&
  !ex?.transferUserSet`?
- Is `eventRole: n.eventRole` still unconditional, untouched, in both
  `apply-sync.ts` and (unchanged) `sync-store.ts`'s `patchToSet`?
- Did you avoid touching `sync-store.ts`'s `patchToSet` (the write path)
  or `land.ts` at all?

---

## Task 3 — `updateTransaction`: optimistic conditional `transfer_user_set` write

**Files:** `src/server/transactions.ts`, its test file (create one if
none exists for this action — check first; if a test file already covers
`updateTransaction`, extend it; report which).

**Steps:**
1. Read the row's current `is_transfer` (`observed`) via a targeted,
   RLS-scoped `SELECT` on `id`.
2. Compute `transfer_user_set: true` (omit the field entirely if not
   setting it — never write `false` over an existing `true`) based on
   `submitted.isTransfer !== observed`.
3. Issue `.update({ ...fields, is_transfer: submitted.isTransfer, ...
   (transferUserSetPatch) }).eq("id", id).eq("is_transfer",
   observed).select("id")`.
4. If the result has rows: success, as today.
5. If the result is empty: re-read the row.
   - If it no longer exists / isn't visible under RLS: return the
     existing `MISSING_ROW` error, unchanged.
   - If it exists but `is_transfer` differs from `observed`: this is a
     genuine conflict, not a missing row. Recompute
     `submitted.isTransfer !== newlyObservedValue` against the fresh
     value, and retry the conditional update once, filtering on the new
     `observed`.
   - If the retry also returns zero rows: stop — do not loop again —
     and return a conflict error to the user ("this transaction changed
     while you were editing it — refresh and try again", or equivalent),
     rather than applying a decision made against stale data.
6. TDD: write test cases 10-14 from spec §10 first (including the new
   conflict-retry and still-correctly-missing cases), RED, then
   implement, GREEN. Test 13 specifically must simulate the race (update
   the row's `is_transfer` directly, between the test's initial read and
   its call into `updateTransaction`) — a test that can't actually
   provoke the zero-rows-affected path proves nothing about the fix.
7. Run the affected test file, `npm run typecheck`.
8. Commit. Self-review. Report.

**Self-review checklist:**
- Does editing only note/description/amount/date leave `transfer_user_set`
  untouched?
- Does changing `is_transfer` set `transfer_user_set = true` in the same
  write?
- Does re-submitting the *same* `is_transfer` value leave
  `transfer_user_set` untouched (never reset to `false` once `true`)?
- Did you avoid touching `user_categorized` anywhere in this file (§8's
  separate, out-of-scope bug)?
- Did you avoid introducing a `.rpc()` call, a trigger, or a
  `CASE`-expression?
- Does the report explicitly demonstrate the conflict path with real
  test output (test 13) rather than asserting atomicity without proof?
- Is the retry bounded (exactly one retry, then a surfaced error) rather
  than an unbounded loop?

---

## Task 4 — `BudgetTxn` + `countsForMonth`: the new precedence branch

**Files:** `src/lib/budget/types.ts`, `src/lib/budget/qualify.ts`,
`src/lib/budget/qualify.test.ts`.

**Steps:**
1. Add `transferUserSet: boolean;` to `BudgetTxn`.
2. In `qualify.test.ts`, add `transferUserSet: false,` to the shared
   fixture default — do not change any existing assertion.
3. TDD: write the 5 new test cases from spec §10 (items 5-9) first, RED,
   then implement:
   ```ts
   if (txn.transferUserSet) return !txn.isTransfer;
   ```
   inserted after the three absolute gates and before the `eventRole`
   branch.
4. Run `qualify.test.ts`, confirm all original + new cases pass. Run
   `npm run typecheck`.
5. Commit. Self-review. Report.

**Self-review checklist:**
- Does test 7 (`transferUserSet: false`, `CARD_PAYMENT`) still exclude —
  proving an untouched row is unaffected?
- Do tests 8/9 prove the absolute gates still outrank a user's transfer
  decision?
- Is the new branch positioned exactly where the spec places it?

---

## Task 5 — `page.tsx`: populate `transferUserSet` + bundle Finding #2's validation guard

**Files:** `src/app/(app)/(dashboard)/page.tsx`,
`src/lib/budget/rollup.test.ts`, `src/lib/budget/actuals.test.ts`,
`src/lib/budget/dashboard.test.ts`.

**Steps:**
1. Add `transfer_user_set` to the Supabase `.select(...)` column list, and
   `transferUserSet: t.transfer_user_set,` to the `.map(...)` literal.
2. **Bundled per spec §7, as its own clearly-separated commit within this
   task:** add a small `asEventRole(v: unknown): EventRole | null` guard
   (or equivalent) at the same mapping site, so a malformed `event_role`
   value resolves to `null` rather than reaching `budgetEffectOf`
   unguarded. Keep this as a distinct commit from step 1's
   `transferUserSet` wiring.
3. Add `transferUserSet: false,` to the three sibling test files' fixture
   defaults.
4. Run the full `src/lib/budget` test directory, `npm run typecheck`,
   `npm run build`.
5. Commit (as two commits per step 2's instruction). Self-review. Report.

**Self-review checklist:**
- Is step 1's diff exactly the two described additions?
- Is the validation guard's commit separable from the `transferUserSet`
  commit?
- Does a malformed `event_role` value, run through the guard, resolve to
  `null`?

---

## Task 6 — Full verification + report

**No new code.** Run and report:
1. `npm run typecheck` — 0 errors, repo-wide.
2. `npx vitest run` and `npm run test:integration` — pass/fail counts vs.
   the Setup baseline.
3. `npm run lint` and `npm run build`.
4. `git log --oneline` for the `transfer-ownership` branch, `git status`,
   confirm `qualify-integration` unchanged at `c460d53` and every branch
   below it still frozen at its own tip.
5. A table confirming every Global Constraint held, specifically
   including: `event-role.ts`/`adapter.ts`/`land.ts`/`budget-effect.ts`/
   `rollup.ts`/`actuals.ts`/`dashboard.ts`/`budget-vs-actual.ts` diff-empty;
   `sync-store.ts`'s `patchToSet` function specifically diff-empty (its
   `findBySourceRefs` function is expected to have changed — confirm the
   diff is scoped to exactly that function); `transfer_user_set` has
   exactly one setter (`grep -rn "transferUserSet\s*=\|transfer_user_set:"
   src/` — confirm every write site is inside `updateTransaction`, and
   conditional, never a bare `true` literal outside a change-check).
6. Re-run the end-to-end trace from spec §5 as a narrative check against
   the actual merged code: pick one "mark as transfer" scenario and one
   "unmark" scenario, and confirm in the report, with file:line citations
   spanning all of `updateTransaction` → `sync-store.ts` →
   `sync-engine.ts` → `apply-sync.ts` → `qualify.ts`, that each survives a
   subsequent sync.
7. Confirm the DB-integration test added in Task 2 is present and passing
   in this final run, not just at the time Task 2 was reviewed.

Stop after Task 6. Do not address §8's deferred items. Do not push.
Report everything above for review, per the controlling instruction for
this plan.
