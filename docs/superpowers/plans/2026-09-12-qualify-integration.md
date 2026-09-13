# Implementation Plan — Budget Effect → qualify.ts Integration

Spec: `docs/specs/2026-09-12-qualify-integration-design.md` (read it first
— this plan argues from it and defers to it on any conflict).

## Global Constraints (bind every task)

- **Scope is qualification only.** Do not implement Money Left, Savings
  Rate, Savings Insights, or any UI beyond the one query/mapping change
  named in Task 2. Do not touch `rollup.ts`'s category-kind bucket
  assignment — that gap is explicitly deferred to the Money Left layer
  (spec §6).
- **Event Role and Budget Effect are frozen.** Do not modify
  `src/lib/plaid/event-role.ts`, `src/lib/plaid/adapter.ts`,
  `src/lib/plaid/land.ts`, `src/lib/plaid/apply-sync.ts`,
  `src/lib/plaid/sync-store.ts`, or `src/lib/budget/budget-effect.ts`.
  Read-only with respect to all of these.
- **Do not touch** `duplicate_of_id` logic/Phase 15, `sign-convention.ts`,
  `finalizeSignConvention`, or any Sign Convention file.
- **Every existing check in `countsForMonth` keeps its exact current
  semantics.** `status !== "confirmed"` excludes, `duplicateOfId != null`
  excludes, month mismatch excludes — for every row, role-resolved or
  not. Do not reorder these to run *after* the role/effect branch, and do
  not change any of their conditions.
- **The `event_role === null` path must be byte-identical to today's only
  path** (`return !txn.isTransfer`). Do not add any new condition to that
  branch. If a task's own reasoning suggests the null path needs new
  logic, that's a signal to stop and re-check against the spec, not to
  add it — spec §3 explicitly settles this: no new rule for `null`.
- **`is_transfer` is never consulted once `event_role` resolves.** The
  role-resolved branch reads `event_role` and `direction` only (via
  `budgetEffectOf`), never `isTransfer`.
- **`budget_effect` → qualifies mapping is exactly:** `EXPENSE`,
  `EXPENSE_REVERSAL`, `INCOME` → `true`; `NONE`, `UNKNOWN` → `false`. No
  other mapping, no per-role special case beyond what `budgetEffectOf`
  itself already encodes.
- **Every `BudgetTxn` construction site gets updated in the same change
  that adds the field** — spec §5 identifies exactly one production site
  (`src/app/(app)/(dashboard)/page.tsx`). Before starting Task 1, confirm
  this is still the only one: `grep -rn "BudgetTxn\b" src/` and diff
  the result against the spec's claim. If a new site has appeared since
  the spec was written, stop and report — do not silently update only the
  ones the spec named.
- **TDD.** Every task writes the failing test(s) first, shows the RED
  run, then implements to GREEN. Report both in the task report.
- **No push to origin.** Work stays local. New local branch off the
  frozen `budget-effect` tip (`5d98a74`) in the same worktree — do not
  create a new worktree.
- **Report contract:** every task report states exact files changed, RED
  and GREEN test output, `npm run typecheck` output, and a self-review
  answering: did this touch `rollup.ts`'s bucket logic, any frozen Event
  Role/Budget Effect file, `sign-convention.ts`, or `duplicate_of_id`
  logic? (must be "no" every time). Did every existing test in
  `qualify.test.ts`/`rollup.test.ts`/`actuals.test.ts`/`dashboard.test.ts`
  pass with its assertions unmodified?

## Setup

Continue in the existing worktree (`.worktrees/sign-convention`) — do not
create a new worktree. Branch from the tip of `budget-effect` (`5d98a74`)
with a new local branch, e.g. `git checkout -b qualify-integration`.
Confirm `git status` is clean and `git log -1` shows `5d98a74` before
branching.

Before Task 1: run `grep -rn "BudgetTxn\b" src/` and confirm the only
non-test production match is `src/app/(app)/(dashboard)/page.tsx` (per
spec §5). If anything else matches, stop and report — the plan's Task 2
scope depends on this being the complete list.

Baseline check: `npm run typecheck` and `npx vitest run` — should match
Budget Effect's own final state (0 typecheck errors, 401/401 tests).
Record it so later tasks can distinguish pre-existing state from
regressions.

---

## Task 1 — `BudgetTxn.eventRole` + `countsForMonth` extension

**Files:** `src/lib/budget/types.ts`, `src/lib/budget/qualify.ts`,
`src/lib/budget/qualify.test.ts`.

**Steps:**

1. In `types.ts`, add `import type { EventRole } from "@/lib/plaid/types";`
   and add `eventRole: EventRole | null;` to the `BudgetTxn` interface
   (after `duplicateOfId`).
2. In `qualify.test.ts`, add `eventRole: null,` to the shared `txn()`
   fixture builder's defaults (do not change any existing test's
   assertions — this is purely satisfying the now-required field).
3. Write the 14 new test cases from spec §7 verbatim (exact `eventRole`/
   `direction`/`status`/`duplicateOfId`/`isTransfer` values as given),
   RED first — they must fail against the *current* `countsForMonth`
   (which ignores `eventRole` entirely, so every role-based exclusion
   test will currently return `true` when it should return `false`).
4. Rewrite `countsForMonth` per spec §2:
   ```ts
   import { budgetEffectOf } from "./budget-effect";
   import type { MonthKey } from "./month";
   import type { BudgetTxn } from "./types";

   export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
     if (monthKey(txn.occurredAt) !== month) return false;
     if (txn.status !== "confirmed") return false;
     if (txn.duplicateOfId != null) return false;

     if (txn.eventRole != null) {
       const effect = budgetEffectOf(txn.eventRole, txn.direction);
       return effect === "EXPENSE" || effect === "EXPENSE_REVERSAL" || effect === "INCOME";
     }
     return !txn.isTransfer;
   }
   ```
   Preserve the existing docstring's substance (it documents the
   authoritative-gate invariant, which still holds) and extend it to
   mention the new role-based branch — do not delete the existing
   invariant language about `duplicateOfId`/Phase 15.
5. Run `qualify.test.ts` — confirm GREEN, all 5 original + 14 new tests
   passing (19 total).
6. Run `npm run typecheck`.

**Self-review checklist:**
- Does test 4 (`CARD_PAYMENT` → `false`) have a comment naming it as the
  regression test for the live double-counting bug (spec §1)?
- Do tests 10 and 11 prove `status`/`duplicateOfId` gate *before* the role
  branch, not just that they also happen to exclude?
- Does test 14 prove `isTransfer` is genuinely ignored once a role
  resolves (a `PURCHASE` role with `isTransfer: true` still qualifies)?
- Is the `null`-role branch (`return !txn.isTransfer`) textually identical
  to today's only return statement — no added condition?
- Did you avoid touching `rollup.ts`, `actuals.ts`, `dashboard.ts`, or any
  frozen file?

---

## Task 2 — Update the one `BudgetTxn` construction site + sibling fixtures

**Files:** `src/app/(app)/(dashboard)/page.tsx`,
`src/lib/budget/rollup.test.ts`, `src/lib/budget/actuals.test.ts`,
`src/lib/budget/dashboard.test.ts`.

**Steps:**

1. In `page.tsx`, add `event_role` to the `.select(...)` column list
   (after `duplicate_of_id`), and add `eventRole: t.event_role,` to the
   `.map(...)` object literal (after `duplicateOfId: t.duplicate_of_id`).
   This is the complete change to this file — no other line in it should
   differ.
2. In each of `rollup.test.ts`, `actuals.test.ts`, `dashboard.test.ts`,
   add `eventRole: null,` to that file's own fixture-builder defaults
   (each has its own, per spec §7 — do not consolidate them into a shared
   helper as part of this task; that's an unrelated refactor). Do not
   change any existing test's assertions.
3. Run the full `src/lib/budget` test directory — confirm every existing
   test in all four files still passes, with the same pass count as the
   Setup baseline plus Task 1's 14 new tests (no other count change).
4. Run `npm run typecheck` — should be fully clean, 0 errors, repo-wide
   (this is the change that makes `page.tsx` satisfy the now-required
   `BudgetTxn.eventRole` field; if it doesn't compile, that's the type
   error you're fixing here, not a pre-existing gap to route around).
5. Run `npm run build` to confirm the dashboard route still compiles and
   renders (Next.js route compilation, not a runtime/browser check —
   flag in your report if you believe a manual smoke-test of the
   dashboard page is warranted, but do not perform one without asking;
   this task has no Playwright/e2e requirement).
6. Commit.
7. Self-review.
8. Report back.

**Self-review checklist:**
- Is `page.tsx`'s diff exactly the two lines described (select list +
  map), nothing else in that file changed?
- Do all three test files' fixture updates add exactly one field
  (`eventRole: null`) and change nothing else?
- Does `grep -rn "BudgetTxn\b" src/` still show the same set of files as
  the Setup check (i.e., no new construction site appeared mid-task that
  should also have been updated)?

---

## Task 3 — Full verification + report

**No new code.** Run and report:
1. `npm run typecheck` — 0 errors, repo-wide.
2. `npx vitest run` (full unit suite) — pass/fail counts vs. the Setup
   baseline (expect Task 1's 14 new tests added, zero regressions
   anywhere, including outside `src/lib/budget`).
3. `npm run lint` and `npm run build`.
4. `git log --oneline` for the `qualify-integration` branch, `git status`
   (confirm clean, confirm nothing pushed, confirm `budget-effect` branch
   unchanged at `5d98a74`, `event-role` unchanged at `697b673`,
   `sign-convention` unchanged at `ea0cdc8`).
5. A short table confirming every Global Constraint held: `rollup.ts`/
   `actuals.ts`/`dashboard.ts`/`budget-vs-actual.ts` logic diff-empty
   (only their test *fixtures* changed, not their source); every frozen
   Event Role/Budget Effect/Sign Convention file diff-empty;
   `duplicate_of_id` logic diff-empty; the `null`-role branch in
   `qualify.ts` textually matches today's original return statement.
6. Explicitly confirm: did every pre-existing test in `qualify.test.ts`,
   `rollup.test.ts`, `actuals.test.ts`, `dashboard.test.ts` pass with its
   original assertions unmodified? Quote the diff on each test file
   showing only fixture-default additions, no assertion changes.

Stop after Task 3. Do not wire anything into Money Left, Savings Rate, or
any UI beyond Task 2's one file. Do not push. Report everything above for
review, per the controlling instruction for this plan.
