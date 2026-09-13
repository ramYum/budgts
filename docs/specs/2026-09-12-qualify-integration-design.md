# Budget Effect → qualify.ts Integration — Design

Status: **implemented, then superseded.** The `countsForMonth` this doc
proposes shipped exactly as designed, then was extended twice further — by
`transfer-ownership-design.md`'s `transferUserSet` gate, then by the
account-exclusion feature's `accountExcluded` gate (`docs/workflow.md` §7,
2026-09-13). See `src/lib/budget/qualify.ts` for the current, fuller
function; this doc's §2 sketch is now an intermediate historical snapshot,
not the live implementation.
Scope: **Qualification only.** Not in scope: Money Left, Savings Rate,
Savings Insights, any UI, `duplicate_of_id`/Phase 15 changes, Sign
Convention changes, any Event Role or Budget Effect change (both frozen:
Event Role at `697b673`, Budget Effect at `5d98a74`).

Pipeline position:

```
Sign Convention → Direction → Category → Event Role (DONE) → Budget Effect (DONE)
                                                                     ↓
                                                            QUALIFICATION  ← THIS DESIGN
                                                                     ↓
                                                   (later, separate work) Money Left → Savings Rate
```

This is the layer where semantic classification finally touches a real
financial total for the first time. `countsForMonth` is the single
authoritative gate every dollar total in the app already routes through
(`rollup`, `monthlyActuals`, `budgetVsActual`, the dashboard tiles) — this
design changes what that gate answers, not what consumes the answer.

**Qualification answers:** *"Should this financial event participate in
this budget calculation?"* **It does not answer:** *"How much did the
user keep?"* That split is deliberate and preserved throughout this
design — nowhere here computes income, spend, or a total; `countsForMonth`
stays a boolean gate, exactly as it is today.

## 1. Current behavior, verified against the real code (not assumed)

**`countsForMonth` today** (`src/lib/budget/qualify.ts`):
```ts
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  return (
    !txn.isTransfer &&
    txn.duplicateOfId == null &&
    txn.status === "confirmed" &&
    monthKey(txn.occurredAt) === month
  );
}
```
No concept of category, event role, or budget effect exists in this
function today. It answers exactly four questions: right month, confirmed,
not a duplicate, not flagged as a transfer.

**Where "expense vs income" is decided today:** not here. It happens one
layer downstream, in `rollup.ts`, using `category.kind`:
```ts
const net = t.direction === "debit" ? t.amount : -t.amount;
if (t.categoryId !== null && kindById.get(t.categoryId) === "income") {
  income -= net;
} else {
  spend += net;                                    // <- the uncategorized fallback
  if (t.categoryId !== null && kindById.get(t.categoryId) === "expense") {
    expenseActual += net;
  }
}
```
An **uncategorized** qualifying row (`categoryId === null`) falls into the
`else` branch and counts as spend by default. `monthlyActuals.ts` doesn't
distinguish income/expense at all — it just nets debit-credit per
category (including the `null` bucket) for whatever `countsForMonth`
already approved. `budgetVsActual.ts` and `dashboard.ts` add no further
category logic; they compose the two functions above.

**The live bug this exposes:** a Plaid credit-card payment
(`personal_finance_category.primary = LOAN_PAYMENTS`,
`detailed = LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`) is **not** flagged
`isTransfer` today (`adapter.ts`'s `TRANSFER_PRIMARIES` only contains
`TRANSFER_IN`/`TRANSFER_OUT`), and `category-map.ts` maps `LOAN_PAYMENTS`
to `categoryId = null` ("user decides"). So today: `countsForMonth`
returns `true` (nothing excludes it), and `rollup.ts`'s uncategorized
fallback counts it as spend — **right alongside the original purchases it
pays off.** Every user who pays a tracked credit card from a tracked
checking account is very likely seeing inflated spend today. This design
fixes exactly this, and it's the concrete, currently-live motivation for
doing this integration now rather than treating it as theoretical.

## 2. The gate, extended

```ts
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  if (monthKey(txn.occurredAt) !== month) return false;
  if (txn.status !== "confirmed") return false;         // unchanged — excludes pending_review
  if (txn.duplicateOfId != null) return false;           // unchanged — Phase 15, untouched logic, same check

  if (txn.eventRole != null) {
    const effect = budgetEffectOf(txn.eventRole, txn.direction);
    return effect === "EXPENSE" || effect === "EXPENSE_REVERSAL" || effect === "INCOME";
  }
  return !txn.isTransfer;                                 // unchanged legacy path
}
```

This is a reordering of the existing four checks (so the two new-path
branches sit together) plus exactly one new branch. Every existing check's
*logic* is byte-identical to today — the same fields, the same operators,
the same short-circuit-to-`false` semantics. Nothing about `status`,
`duplicateOfId`, or `isTransfer`'s existing behavior changes for any row.

**Precedence:** `status`/`duplicateOfId`/month gate everything, exactly as
today, before the role/effect question is ever asked — a `pending_review`
or confirmed-duplicate row is excluded regardless of what its event role
or budget effect would say, matching Sign Convention's own established
invariant. Once past those, a row takes exactly one of two paths:
- **`event_role` resolved:** the role's `budget_effect` decides — `NONE`
  and `UNKNOWN` exclude, `EXPENSE`/`EXPENSE_REVERSAL`/`INCOME` include.
  `is_transfer` is not consulted at all on this path.
- **`event_role` is `null`:** falls back to exactly today's `!isTransfer`
  check — no new rule, the literal existing behavior.

## 3. Resolving every question explicitly

**`event_role === null` — the deferred, potentially-common case.**
Manual, email, and receipt-sourced transactions never get an `event_role`
(Event Role's own invariant) — every one of them takes this path, always.
Even for Plaid-sourced rows, V1's conservative resolver leaves plenty
unresolved (anything that isn't a recognized spend-shaped primary, a
known fee/interest/income signal, or a card payment). **Resolution:** the
existing `category.kind` + `direction` logic downstream in `rollup.ts`
remains the fallback for these rows, completely unchanged, because
`countsForMonth` doesn't currently *have* category-kind logic to begin
with — that decision already lives one layer down, and this design has no
reason to relocate it. This isn't a new rule invented for this design;
it's the absence of one, verified against §1's actual current code rather
than assumed.

**How each `budget_effect` value interacts with qualification:**

| `budget_effect` | Qualifies? | Reasoning |
|---|---|---|
| `EXPENSE` | Yes | Real spend. |
| `EXPENSE_REVERSAL` | Yes | Must qualify so it can net against spend downstream — see refunds, below. |
| `INCOME` | Yes | Real income. |
| `NONE` | **No** | The double-counting case (`CARD_PAYMENT`, `TRANSFER`, `CASH_ADVANCE`) — this is the fix for §1's live bug. |
| `UNKNOWN` | **No** — settled, not left open | Only `ADJUSTMENT` produces this (currently unreachable). An event whose financial direction is completely undetermined must not silently enter a total in either direction — "never guess" applies to exclusion just as much as to inclusion. If a future review workflow resolves an `ADJUSTMENT` row to a concrete role, it requalifies through the normal path at that point; nothing here guesses in the meantime. |
| `null` (unresolved role) | Falls to legacy `!isTransfer` path | See above — not a `budget_effect` value at all, a distinct branch. |

**`pending_review`:** Unchanged, and unconditionally checked before the
role/effect branch is ever reached — a `pending_review` row never
qualifies regardless of its role or effect, exactly as today.

**Transfers:** For a role-resolved row, `is_transfer` is never consulted
— the role IS `TRANSFER` (or not), and `budget_effect`'s `NONE` already
excludes it. For a `null`-role row, `is_transfer` remains the sole signal,
unchanged. `is_transfer` can never override a resolved role's answer, and
a resolved role never looks at `is_transfer` — the two signals apply to
disjoint sets of rows in V1 (a role only ever resolves for Plaid-sourced
transactions; `is_transfer` is user/adapter-settable independent of role),
so there is no conflict case to arbitrate.

**Credit-card payments:** `CARD_PAYMENT → NONE → excluded.` This is the
concrete fix for §1's bug — once a row's `event_role` resolves to
`CARD_PAYMENT`, it stops counting as spend, full stop, regardless of its
(currently always-null) category.

**Refunds netting against spend:** No new logic needed for the netting
itself. `EXPENSE_REVERSAL` qualifies (table above), and `rollup.ts`'s
existing `net = direction === "debit" ? amount : -amount` calculation
already reduces the spend bucket for a `credit`-direction row (which a
`REFUND` always is, per Event Role's own resolution table) — the sign
arithmetic that makes "refund nets against spend" true has existed since
before this design and needs no change. This design's only job is making
sure the `EXPENSE_REVERSAL` row is allowed to reach that arithmetic at
all (i.e., that it qualifies) — it already would have qualified under
today's legacy path too (a refund is never `isTransfer`), so this is a
continuity guarantee, not new behavior for the common case.

**Manual/email/receipt transactions:** Always `event_role = null` →
always take the unchanged legacy path. This design changes nothing about
their behavior — provable by construction (§2's `null` branch is
byte-identical to today's only branch), not just tested.

**Does existing behavior change for transactions with no event role?**
**No.** This is the design's central compatibility guarantee, and it's
verified two ways: (1) by construction, per the paragraph above, and (2)
every existing test in `qualify.test.ts`, `rollup.test.ts`,
`actuals.test.ts`, and `dashboard.test.ts` must pass unmodified in its
assertions (only their fixture builders need a new default field — see
§6) — proving it, not just arguing it.

## 4. `BudgetTxn` needs one new field

```ts
// src/lib/budget/types.ts
import type { EventRole } from "@/lib/plaid/types";

export interface BudgetTxn {
  categoryId: string | null;
  amount: number;
  direction: Direction;
  occurredAt: Date;
  status: TxnStatus;
  isTransfer: boolean;
  duplicateOfId: string | null;
  eventRole: EventRole | null;   // new
}
```

Same cross-domain import pattern Budget Effect's own design already
established and the final Budget Effect review endorsed (`src/lib/budget`
importing a type-only value from `src/lib/plaid`) — not a new precedent,
a continuation of one already reviewed and approved.

## 5. The one real hand-enumeration boundary — identified up front

Learning directly from the `sync-store.ts` gap: before writing a task
list, every place that constructs a `BudgetTxn` from real data was
searched for, not assumed. There is exactly **one**:

`src/app/(app)/(dashboard)/page.tsx:36-65` — the dashboard page's server
component queries Supabase directly and hand-builds `BudgetTxn[]`:
```ts
let txnQuery = supabase
  .from("transactions")
  .select("category_id, amount, direction, occurred_at, status, is_transfer, duplicate_of_id")
  // ...
const txns: BudgetTxn[] = (txnRows ?? []).map((t) => ({
  categoryId: t.category_id,
  amount: t.amount,
  direction: t.direction,
  occurredAt: new Date(t.occurred_at),
  status: t.status,
  isTransfer: t.is_transfer,
  duplicateOfId: t.duplicate_of_id,
}));
```
Both the `.select(...)` column list and the `.map(...)` object literal
need `event_role`/`eventRole` added, or `BudgetTxn.eventRole` would be
`undefined` at runtime for every real row — silently failing TypeScript's
compile-time guarantee the moment the value crosses a network/DB boundary
(a raw Supabase row isn't type-checked against `BudgetTxn` until this
`.map()` constructs one). This is exactly the kind of gap a type system
cannot catch on its own; it's caught here by deliberately searching for
every `BudgetTxn` construction site before implementation starts, not
discovered mid-task the way `sync-store.ts` was.

**Confirmed via `grep -rn "BudgetTxn\b" src/`: no other production file
constructs a `BudgetTxn`.** Every other file matching `is_transfer`/
`duplicate_of_id` in the codebase (`transaction-list.tsx`,
`needs-category-bell.tsx`, the export route, etc.) is a non-financial-total
consumer — display/UI/export, not routed through `countsForMonth` at all,
per `qualify.ts`'s own existing docstring ("consumers that read
transactions for a non-financial purpose... do not go through this
function"). Those are correctly out of scope and untouched.

## 6. Affected files

| File | Change |
|---|---|
| `src/lib/budget/types.ts` | add `eventRole: EventRole | null` to `BudgetTxn` |
| `src/lib/budget/qualify.ts` | extend `countsForMonth` per §2 |
| `src/lib/budget/qualify.test.ts` | add `eventRole: null` to the `txn()` fixture default; add new test cases (§7) |
| `src/lib/budget/rollup.test.ts` | add `eventRole: null` to its own `txn()`-style fixture default (existing tests must still pass unmodified) |
| `src/lib/budget/actuals.test.ts` | same |
| `src/lib/budget/dashboard.test.ts` | same |
| `src/app/(app)/(dashboard)/page.tsx` | add `event_role` to the `.select(...)` column list; add `eventRole: t.event_role` to the `.map(...)` (§5) |

**Explicitly not touched:** `rollup.ts`, `actuals.ts`, `budget-vs-actual.ts`,
`dashboard.ts` (their logic is unchanged — they still call
`countsForMonth`, they just now get a more accurate answer from it),
`budget-effect.ts`/`event-role.ts` (frozen), `sign-convention.ts`,
any Phase 15/`duplicate_of_id` file, any UI beyond the one query/mapping
change in `page.tsx` (no new tiles, no new copy, no new component).

**Deliberately deferred, per the scoping decision made before writing
this doc:** `rollup.ts`'s category-kind-based bucket assignment (income
vs. spend routing) is not updated to consult `budget_effect`. A
role-resolved `INCOME`/`EXPENSE_REVERSAL` row with no category would still
route through the existing uncategorized-falls-to-spend branch — a
pre-existing gap (already present today for low-confidence income), not
worsened by this design, and not closed by it either. This is a deliberate
scope boundary: bucket assignment (which total a qualifying dollar adds
to) is closer to "how much did the user keep" than "does this event
qualify," so it belongs to the Money Left layer, not here. Flagged
explicitly in §8 as that layer's first item.

## 7. Test matrix

**Existing tests that must remain green, unmodified in their assertions**
(only their fixture builders gain a new default field):

| File | Existing tests (must stay passing, byte-identical assertions) |
|---|---|
| `qualify.test.ts` | "counts an ordinary confirmed, non-transfer, non-duplicate row"; "excludes a confirmed duplicate"; "excludes a duplicate regardless of direction/amount/category"; "still excludes transfers and pending_review rows"; "still respects the month filter" — all 5, with `eventRole: null` added to their shared fixture default, proving the `null`-role legacy path is unchanged. |
| `rollup.test.ts` | All existing cases, fixture default gains `eventRole: null`. |
| `actuals.test.ts` | Same. |
| `dashboard.test.ts` | Same. |

**New tests for the changed rule** (in `qualify.test.ts`):

| # | Scenario | Expected |
|---|---|---|
| 1 | `eventRole: "PURCHASE"`, `direction: "debit"` | `true` |
| 2 | `eventRole: "REFUND"`, `direction: "credit"` | `true` (qualifies; nets downstream, not tested here) |
| 3 | `eventRole: "INCOME"`, `direction: "credit"` | `true` |
| 4 | `eventRole: "CARD_PAYMENT"` | `false` — **the regression test for §1's live bug**, with an explicit comment naming it |
| 5 | `eventRole: "TRANSFER"` | `false` |
| 6 | `eventRole: "FEE"` | `true` |
| 7 | `eventRole: "INTEREST"` | `true` |
| 8 | `eventRole: "CASH_ADVANCE"` | `false` |
| 9 | `eventRole: "ADJUSTMENT"` | `false` — proves `UNKNOWN` excludes, not just documents it |
| 10 | `eventRole: "CARD_PAYMENT"`, but also `status: "pending_review"` | `false` — proves `status` gates before the role branch is even reached |
| 11 | `eventRole: "CARD_PAYMENT"`, but also `duplicateOfId: "x"` | `false` — proves the duplicate gate isn't bypassed by a role |
| 12 | `eventRole: null`, `isTransfer: true` | `false` — legacy path, unchanged |
| 13 | `eventRole: null`, `isTransfer: false` | `true` — legacy path, unchanged |
| 14 | `eventRole: "PURCHASE"` but `isTransfer: true` (an inconsistent/unrealistic combination) | `true` — proves `is_transfer` is genuinely never consulted once a role resolves, not merely usually-ignored |

Tests 4, 9, 10, 11, and 14 are the ones that actually prove this design's
claims rather than restating the table — each maps to a specific sentence
in §3.

## 8. Invariants

- `countsForMonth` remains a pure boolean function of one `BudgetTxn` and
  one `MonthKey` — no new parameters, no I/O.
- Every existing check (`status`, `duplicateOfId`, month) keeps its exact
  current semantics for every row, role-resolved or not.
- A `null` `event_role` produces byte-identical behavior to today's only
  code path — no behavior change for manual/email/receipt transactions,
  ever, in this design.
- Once `event_role` is resolved, `is_transfer` is never consulted —
  matching the North Star doc's own invariant that a resolved role can
  never be overridden by the legacy flag.
- `budget_effect` values `EXPENSE`/`EXPENSE_REVERSAL`/`INCOME` qualify;
  `NONE`/`UNKNOWN` do not. No fifth outcome, no partial credit.
- Nothing here computes a dollar amount, a bucket, or a total —
  `countsForMonth` still only answers yes/no.
- Every `BudgetTxn` construction site is updated in the same change that
  adds the field — none silently left with `eventRole: undefined`.

## 9. Explicitly deferred questions

- **`rollup.ts` bucket assignment** (§6) — deferred to Money Left, per the
  scoping decision made explicitly before writing this design.
- **Whether `ADJUSTMENT`/`UNKNOWN` should ever be exposed to the user as
  a "needs review" queue item** — a real future feature, not designed
  here; today it's simply excluded, silently, like a `pending_review` row
  is today.
- **Whether the dashboard should show anything different for excluded
  `CARD_PAYMENT`/`TRANSFER` rows** (e.g., a "not counted" indicator in the
  transaction list) — UI, explicitly out of scope.
- **Money Left / Savings Rate** — the next, separate layer; this design
  intentionally stops at "does it qualify."
