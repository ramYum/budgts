# Implementation Plan — Budget Effect

Spec: `docs/specs/2026-09-12-budget-effect-design.md` (read it first — this
plan argues from it and defers to it on any conflict).

## Global Constraints (bind every task)

- **Scope is Budget Effect only.** Do not implement Money Left, Savings
  Rate, Savings Insights, or any UI. Do not revisit Phase 15
  (`duplicate_of_id`) or Sign Convention.
- **Not persisted.** No schema column, no migration, no staging deployment
  step. `budgetEffectOf` is a plain, pure, synchronous function — nothing
  in this plan touches the database in any way.
- **Do not modify** `src/lib/budget/qualify.ts`, `countsForMonth`, any
  `duplicate_of_id` logic, `sign-convention.ts`, `finalizeSignConvention`,
  or any Event Role file (`src/lib/plaid/event-role.ts`,
  `src/lib/plaid/adapter.ts`, `src/lib/plaid/land.ts`,
  `src/lib/plaid/apply-sync.ts`, `src/lib/plaid/sync-store.ts`). Read-only
  with respect to all of these — Event Role stays frozen at `697b673`.
- **Never guess.** `budgetEffectOf(null, ...)` returns `null`, never
  `"UNKNOWN"`. `"UNKNOWN"` is produced only for `ADJUSTMENT`. Every other
  role in spec §3's table maps to exactly one of `EXPENSE`, `INCOME`,
  `EXPENSE_REVERSAL`, `NONE` — never invented, never inferred from
  anything not in the table.
- **No account-type threading, no `status`/`pending_reason` input.**
  `budgetEffectOf`'s signature is exactly `(eventRole: EventRole | null,
  direction: Direction): BudgetEffect | null` — two parameters, nothing
  else. If a task's own reasoning seems to need a third parameter, that's
  a signal to stop and re-check against the spec, not to add one.
- **TDD.** The test file is written first, RED shown, then the function
  implemented to GREEN. Report both in the task report.
- **No push to origin.** Work stays local. This work should happen as a
  new local branch off the frozen `event-role` tip (`697b673`) in the same
  worktree — do not create a new worktree.
- **Report contract:** the task report states exact files changed, the RED
  and GREEN test output, `npm run typecheck` output, and a self-review
  answering: did this touch `qualify.ts`, `duplicate_of_id`,
  `sign-convention.ts`, or any Event Role file? Was any schema/migration
  file created? (both must be "no"/"none" every time).

## Setup

Continue in the existing worktree (`.worktrees/sign-convention`) — do not
create a new worktree. Branch from the tip of `event-role` (`697b673`)
with a new local branch, e.g. `git checkout -b budget-effect`, so
`event-role`'s own history stays untouched and easy to diff against.
Confirm `git status` is clean and `git log -1` shows `697b673` before
branching.

Baseline check before Task 1: `npm run typecheck` and `npx vitest run` —
this should be identical to Event Role's own final Task 6 state (0
typecheck errors, 388/388 unit tests passing, modulo any pre-existing
flake already noted in the Event Role ledger). Record it so later tasks
can distinguish pre-existing state from regressions.

---

## Task 1 — `BudgetEffect` type + `budgetEffectOf` resolver

**Files:** `src/lib/budget/types.ts`, `src/lib/budget/budget-effect.ts`
(new), `src/lib/budget/budget-effect.test.ts` (new).

**Interface (exact — copy verbatim):**

```ts
// src/lib/budget/types.ts — add alongside the existing Direction/CategoryKind exports:
export type BudgetEffect = "EXPENSE" | "INCOME" | "EXPENSE_REVERSAL" | "NONE" | "UNKNOWN";
```

```ts
// src/lib/budget/budget-effect.ts
import type { BudgetEffect, Direction } from "./types";
import type { EventRole } from "@/lib/plaid/types";

/**
 * Resolves a transaction's Budget Effect from its Event Role and (already
 * sign-corrected) direction. Pure, deterministic, no I/O, not persisted —
 * design: docs/specs/2026-09-12-budget-effect-design.md §1, §3.
 * Answers "what kind of event is this," never "does it count right now"
 * (that split belongs to qualify.ts, untouched here — §4).
 */
export function budgetEffectOf(eventRole: EventRole | null, direction: Direction): BudgetEffect | null {
  // implement spec §3's table exactly
}
```

Note the cross-domain import: `EventRole` lives in
`src/lib/plaid/types.ts` (Plaid's domain), while `Direction`/
`BudgetEffect` live in `src/lib/budget/types.ts` (the budget domain). This
is a deliberate, minimal type-only dependency — do not move `EventRole` or
duplicate its definition. `Direction` here is `src/lib/budget/types.ts`'s
own existing `"debit" | "credit"` type (already defined, do not
redefine it) — structurally identical to Plaid's own `direction` type but
a separate declaration in a separate domain, matching this file's existing
convention (`qualify.ts`/`BudgetTxn` already use this same `Direction`).

**Resolution table (spec §3 — implement exactly, in any order since every
condition is mutually exclusive, but a `switch` on `eventRole` with a
nested check only for `"P2P_PAYMENT"` is the clearest shape):**

| `eventRole` | `direction` | Result |
|---|---|---|
| `null` | (any) | `null` |
| `"PURCHASE"` | (any) | `"EXPENSE"` |
| `"REFUND"` | (any) | `"EXPENSE_REVERSAL"` |
| `"INCOME"` | (any) | `"INCOME"` |
| `"CARD_PAYMENT"` | (any) | `"NONE"` |
| `"TRANSFER"` | (any) | `"NONE"` |
| `"FEE"` | (any) | `"EXPENSE"` |
| `"INTEREST"` | (any) | `"EXPENSE"` |
| `"P2P_PAYMENT"` | `"debit"` | `"EXPENSE"` |
| `"P2P_PAYMENT"` | `"credit"` | `"INCOME"` |
| `"CASH_ADVANCE"` | (any) | `"NONE"` |
| `"ADJUSTMENT"` | (any) | `"UNKNOWN"` |

**Tests (`budget-effect.test.ts`) — one case per table row, plus the two
negative-space assertions spec §7/§8 call out by name:**

1. `budgetEffectOf("PURCHASE", "debit")` → `"EXPENSE"`
2. `budgetEffectOf("REFUND", "credit")` → `"EXPENSE_REVERSAL"` — and add an
   explicit comment/assertion that this is NOT `"EXPENSE"` (the
   distinction spec §7 says a future maintainer might reasonably question)
3. `budgetEffectOf("INCOME", "credit")` → `"INCOME"`
4. `budgetEffectOf("CARD_PAYMENT", "debit")` → `"NONE"`
5. `budgetEffectOf("TRANSFER", "debit")` → `"NONE"`
6. `budgetEffectOf("FEE", "debit")` → `"EXPENSE"`
7. `budgetEffectOf("INTEREST", "debit")` → `"EXPENSE"`
8. `budgetEffectOf("P2P_PAYMENT", "debit")` → `"EXPENSE"`
9. `budgetEffectOf("P2P_PAYMENT", "credit")` → `"INCOME"`
10. `budgetEffectOf("CASH_ADVANCE", "debit")` → `"NONE"`
11. `budgetEffectOf("ADJUSTMENT", "debit")` → `"UNKNOWN"`
12. `budgetEffectOf(null, "debit")` → `null` — and assert this is not
    `"UNKNOWN"` (spec §2's kept-distinct invariant)
13. **Direction-irrelevance:** `budgetEffectOf("PURCHASE", "credit")` →
    still `"EXPENSE"` (an unrealistic-but-type-valid input — proves no
    role but `P2P_PAYMENT` is direction-sensitive, per spec §7)

Run RED (test file written, resolver body empty/throws) → implement →
GREEN, report both.

**Self-review checklist (in addition to the plan's standard report
contract):**
- Does `budgetEffectOf` have exactly two parameters — no `status`, no
  `pendingReason`, no account type?
- Is `"UNKNOWN"` produced only for `"ADJUSTMENT"` — never for `null`,
  never for anything else?
- Grep the diff: does it touch anything outside `src/lib/budget/types.ts`,
  `src/lib/budget/budget-effect.ts`, `src/lib/budget/budget-effect.test.ts`?
  It must not.
- Grep the diff: no `.sql` file, no `schema.ts` change, no
  `supabase/migrations/` entry.

---

## Task 2 — Full verification + report

**No new code.** Run and report:
1. `npm run typecheck` — full output; confirm 0 errors (or name any
   pre-existing/out-of-scope failure by comparing against the Setup
   baseline).
2. `npx vitest run` (full unit suite) — pass/fail counts, compare against
   the Setup baseline (expect exactly the new test file's cases added,
   zero regressions).
3. `npm run lint` and `npm run build`.
4. `git log --oneline` for the `budget-effect` branch, `git status`
   (confirm clean, confirm nothing pushed, confirm `event-role` branch
   unchanged at `697b673`).
5. A short table confirming every Global Constraint held: no schema/
   migration file exists anywhere in the diff; `qualify.ts`,
   `sign-convention.ts`, `duplicate_of_id`, and every Event Role file
   (`event-role.ts`, `adapter.ts`, `land.ts`, `apply-sync.ts`,
   `sync-store.ts`) are all diff-empty; `budgetEffectOf` has exactly the
   two-parameter signature the spec requires.

Stop after Task 2. Do not wire `budgetEffectOf` into `qualify.ts`, do not
begin Money Left, Savings Rate, or any other layer. Do not push. Report
everything above for review, per the controlling instruction for this
plan.
