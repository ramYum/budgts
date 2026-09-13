# Implementation Plan — Money Left / Savings Rate

Spec: `docs/specs/2026-09-13-money-left-savings-rate-design.md` (read it
first — this plan argues from it and defers to it on any conflict).

**This plan is not authorized to run yet.** It is the design-approval
deliverable requested alongside the spec — produced so implementation
can start the moment it's approved, without a second planning pass.
Transfer Ownership is approved and frozen; nothing in this plan touches
it, any earlier phase, or any file outside the list in each task below.

## Global Constraints (bind every task)

- **Scope is Money Left / Savings Rate only.** Do not implement Actual
  Savings, month-over-month trend, debt-paydown signals, or any UI
  beyond the one disclaimer-copy line the spec's §3 requires if/when the
  tile ships. Do not touch Savings Goals (`savings_goals`/
  `savings_contributions`, `src/lib/budget/savings.ts`) — fully
  decoupled, per spec §2, and must stay that way.
- **No schema change, no migration.** Spec §13. If any task discovers a
  reason a migration is actually needed, that is a stop-and-report
  condition, not a task-time decision to route around.
- **No account-type threading.** Never read `accounts.type` /
  `plaid_accounts.type`/`subtype` anywhere in this plan's code — spec
  §3's central invariant. A reviewer finding this anywhere in the diff
  is an automatic Critical, not a Minor.
- **`countsForMonth` and `budgetEffectOf` are consumed, never
  re-implemented.** No task computes its own eligibility or transfer/
  card-payment/role logic — spec §1's whole point. Do not modify
  `qualify.ts`, `budget-effect.ts`, `event-role.ts`, `apply-sync.ts`,
  `sync-store.ts`, `sync-engine.ts`, `transaction-update.ts`,
  `transactions.ts`, or `schema.ts`. Every one of these must be
  diff-empty at Task 4's final verification.
- **`income === 0` (or negative) → `savingsRate() === null`, never
  `0`.** Spec §8/§10 — a test-covered invariant, not a style preference.
- **TDD.** Every task writes the failing test(s) first, shows the RED
  run, then implements to GREEN.
- **No push to origin, no merge, no rebase, no reset.** Work happens on
  a new local branch off the tip of `transfer-ownership`
  (`1299ad1f8d37cd2862eb65d030098c795e22dba3`) in the existing worktree
  — do not create a new worktree, do not modify `transfer-ownership`
  itself.
- **Report contract:** every task report states exact files changed,
  RED and GREEN test output, `npm run typecheck` output, and a
  self-review answering: did this touch `qualify.ts`/`budget-effect.ts`/
  `event-role.ts`/any Plaid sync file/`schema.ts`/`savings.ts`/any
  `accounts`/`plaid_accounts` field? (must be "no" every time). Does any
  new code path let `savingsRate` return `0` for zero or negative
  income? (must be "no").

## Setup

Continue in the existing worktree (`.worktrees/sign-convention`) — do
not create a new one. Branch from the tip of `transfer-ownership`
(`1299ad1`) with a new local branch, e.g. `git checkout -b
money-left-savings-rate`. Confirm `git status` is clean and `git log -1`
shows `1299ad1` before branching.

Before Task 1: run `grep -rn "budgetEffectOf" src/lib/budget/rollup.ts`
(should be empty — confirming the gap spec §7 describes still exists;
if it's non-empty, someone else already fixed this and Task 1 needs to
be re-scoped, not blindly applied) and `grep -rln "accountType\|\.type\b"
src/lib/budget/rollup.ts src/lib/budget/dashboard.ts` (should be empty
or only unrelated matches — confirming no account-type threading exists
to accidentally build on).

Baseline check: `npm run typecheck`, `npx vitest run`, `npm run
test:integration` — should match Transfer Ownership Task 6's own final
state (0 typecheck errors, 435/435 unit tests, 43/44 DB-integration with
the one disclosed, unrelated `recategorize.test.ts` finding still
present and still not this plan's concern). Record it.

---

## Task 1 — `rollup.ts`: role-aware income/spend classification

**Files:** `src/lib/budget/rollup.ts`, `src/lib/budget/rollup.test.ts`.

**Steps:**
1. Import `budgetEffectOf` and `isEventRole` (already exported from
   `budget-effect.ts`/`event-role.ts` — no change to either file).
2. Inside the per-transaction loop, after the existing
   `if (!countsForMonth(t, month)) continue;` line, branch on
   `t.eventRole != null && isEventRole(t.eventRole)`:
   - **Resolved, recognized role:** compute
     `budgetEffectOf(t.eventRole, t.direction)`. It is guaranteed
     `"EXPENSE" | "EXPENSE_REVERSAL" | "INCOME"` here (`countsForMonth`
     already excluded `NONE`/`UNKNOWN` rows via the gate that ran one
     line above). `INCOME` → add `t.amount` to `income`. `EXPENSE` → add
     the signed `debit − credit` delta to `spend` (and to `expenseActual`
     when the category is expense-kind, unchanged). `EXPENSE_REVERSAL` →
     add the same signed delta to `spend` (a credit reduces it) — do
     **not** add to `income`.
   - **`null` or unrecognized role:** the existing `category.kind` +
     `direction` logic, byte-for-byte unchanged — this is the fallback
     spec §6/§7 requires, not a new code path.
3. Do not change `totalBudgeted`/`totalRemaining`/`expenseActual`'s own
   computation beyond feeding it the correctly-classified `spend` delta
   for role-resolved `EXPENSE` rows — `monthlyActuals`/`budgetVsActual`
   are untouched by this task (neither imports `budgetEffectOf` and
   neither needs to — spec §12).
4. TDD: write the 6 cases from spec §14 items 1-6 first, RED (item 3
   specifically must be RED against the current code — a hand-built
   `P2P_PAYMENT`-incoming fixture, `as EventRole` cast since the real
   resolver never emits it, must currently misclassify as spend before
   the fix and correctly classify as income after), then implement,
   GREEN.
5. Run the full `rollup.test.ts`, confirm every pre-existing case still
   passes unchanged (regression guard — spec §7's fix is additive).
6. Run `npm run typecheck`.
7. Commit. Self-review. Report — explicitly state the real-data impact
   question from spec §7's flagged decision: does this change any
   *currently reachable* production classification, or only the
   currently-unreachable `P2P_PAYMENT` case? Answer from the code, not
   from assumption (grep `event-role.ts`'s resolver for what it can
   actually emit today).

**Self-review checklist:**
- Does a `TRANSFER`/`CARD_PAYMENT`/`CASH_ADVANCE`-role row ever reach
  this task's new branch? (must be "no" — `countsForMonth` excludes
  them before `rollup` sees them; if a test needs to prove this,
  add it, don't just assert it in the report).
- Is `monthlyActuals`/`budget-vs-actual.ts` diff-empty?
- Does every pre-existing `rollup.test.ts` assertion still hold,
  unchanged?

---

## Task 2 — `savings-rate.ts`: the ratio function

**Files:** `src/lib/budget/savings-rate.ts` (new),
`src/lib/budget/savings-rate.test.ts` (new).

**Steps:**
1. TDD: write the 5 cases from spec §14 items 7-11 first, RED (module
   doesn't exist yet — collection failure is valid RED, same pattern
   Transfer Ownership Task 3 used for `transaction-update.ts`).
2. Implement exactly the function in spec §11:
   ```ts
   export function savingsRate(income: number, moneyLeft: number): number | null {
     if (income <= 0) return null;
     return moneyLeft / income;
   }
   ```
   No clamping, no rounding (the caller formats for display — spec §8's
   table is explicit that >100% and negative values are real, valid
   results, not errors to suppress).
3. Run `savings-rate.test.ts`, confirm GREEN. Run `npm run typecheck`.
4. Commit. Self-review. Report.

**Self-review checklist:**
- Does `savingsRate(0, 0)` return `null`, not `0`?
- Does `savingsRate(-1, -1)` return `null` (negative income), not a
  positive ratio?
- Is the result ever clamped to `[0, 1]`? (must be "no").

---

## Task 3 — `dashboard.ts`: wire the tile

**Files:** `src/lib/budget/dashboard.ts`, `src/lib/budget/dashboard.test.ts`.

**Steps:**
1. Add `savingsRate: number | null` to `DashboardTiles`.
2. In `buildDashboard`, after computing `r = rollup(...)`, compute
   `savingsRate(r.income, r.net)` and add it to the returned `tiles`
   object. No new data fetch — `r.income`/`r.net` already exist.
3. TDD: spec §14 items 12-13, RED then GREEN.
4. Run the full `src/lib/budget` test directory, `npm run typecheck`,
   `npm run build`.
5. Commit. Self-review. Report.

**Self-review checklist:**
- Is this task's diff limited to the one new field + its computation?
  (no unrelated tile changes, no UI file touched — spec §12 keeps
  `page.tsx` out of scope for this task specifically; the disclaimer
  copy is a separate, later, product-directed step, not bundled here).
- Does a zero-income month's tile show `savingsRate: null`, confirmed
  by a real test, not just reasoned about?

---

## Task 4 — End-to-end DB-integration proof + full verification + report

**Files:** a new `tests/integration/money-left-e2e.test.ts`, mirroring
`transfer-ownership-e2e.test.ts`'s pattern (real staging Postgres,
service-role client where needed, or plain fixture construction through
`rollup`/`dashboard` if no new DB access is actually required — decide
at task time based on what Tasks 1-3 actually touch; if no task reads
new columns, this may not need real DB access at all beyond what
existing helpers already provide, and can be a `src/lib/budget` unit
test instead — **do not add DB-integration surface area this feature
doesn't need**).

**Steps:**
1. TDD, spec §14 items 14-15: prove that marking a transfer via
   `updateTransactionRow` leaves the month's Money Left unchanged, and
   that a `CARD_PAYMENT` row (whose underlying purchase was counted
   earlier) has zero effect on its own month's Money Left — against
   real inserted rows, not hand-built `BudgetTxn` objects, matching
   Transfer Ownership Task 4/5's own precedent for proving a
   cross-layer claim isn't just narrated.
2. Run `npm run typecheck`, `npx vitest run`, `npm run test:integration`
   (once, cleanly — do not run two invocations concurrently; Transfer
   Ownership Task 5/6 hit real DB contention doing this), `npm run
   lint`, `npm run build`.
3. Global Constraints table, specifically: `qualify.ts`/`budget-effect.ts`/
   `event-role.ts`/every Plaid sync file/`schema.ts`/`savings.ts` all
   diff-empty against `1299ad1`; grep confirms no `accountType`/
   `plaid_accounts` field read anywhere in the new code.
4. Confirm the known `recategorize.test.ts` timeout (Transfer Ownership's
   disclosed, unrelated finding) is reported separately if it
   reproduces, not conflated with this plan's own results.
5. Stop. Report exact files/commits, behavior, tests, findings, and
   HEAD/worktree state. Do not proceed to any UI work, any trend
   feature, or Actual Savings without a separate, explicit go-ahead —
   spec §15's deferred list is binding here, not just descriptive.

**Self-review checklist:**
- Every Global Constraint held, confirmed by diff/grep, not assumed.
- The two flagged product decisions from spec §16 that this plan's
  tasks touch (§7's real-data-impact verification, done in Task 1's
  report) are answered with evidence, not deferred silently.
- No file outside this plan's four tasks' own lists was touched.
