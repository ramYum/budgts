# Money Left / Savings Rate — Design

Status: **design only — nothing in this document has been implemented.**
No code changed, no migration run, no branch created. This is the design
step the north-star doc's own sequencing (§14/§15, "V1 foundation")
reserved for after Transfer Ownership shipped. Transfer Ownership is now
approved and frozen; this document does not modify it or any earlier
phase.

Builds directly on `2026-09-12-north-star-architecture-design.md` §9
("Savings model"), which already commits to the core distinction this
document exists to make rigorous: **Money Left / Savings Rate is a
cash-flow proxy, not a verified balance-accumulation claim.** Nothing
here contradicts that section; this document is its full elaboration —
the same depth the Event Role, Budget Effect, Qualify Integration, and
Transfer Ownership specs each gave their own layer.

## 0. The product questions this must answer

> How much money came in? How much did I actually spend? How much money
> did I keep? What is my savings rate? Am I getting better or worse at
> saving?

The first four have a real, buildable V1 answer using data Budgts
already has. The fifth (a trend) does not have enough historical
role-resolved data to answer honestly yet — see §10.

## 1. What the completed ladder already gives this layer, for free

This is the load-bearing fact of the whole document: **the four
questions "does this count," "was it a transfer," "was it a card
payment," and "did the user override the machine" are already fully
answered, upstream, by code that shipped and was reviewed in the four
prior phases.** This layer does not re-derive any of them. It consumes
their answer exactly once, the same way every consumer of `qualify.ts`
already must.

```
transactions.event_role, direction        (Event Role)
        │
budgetEffectOf(eventRole, direction)       (Budget Effect — pure, derived, never stored)
        │
countsForMonth(txn, month)                 (Qualify — the one authoritative gate)
   ├─ month / status / duplicateOfId       (absolute gates)
   ├─ transferUserSet → !isTransfer        (Transfer Ownership — explicit user decision)
   ├─ eventRole → budgetEffectOf(...)      (machine role)
   └─ null → !isTransfer                   (legacy / unresolved)
        │
        ▼
  ELIGIBLE TRANSACTIONS ONLY
        │
        ▼
 ┌──────────────┬──────────────┐
 ▼              ▼              │
INCOME       SPENDING          │  ← this document: how an eligible
 └──────┬───────┘              │     row splits into these two buckets
        ▼                      │
   MONEY LEFT  = INCOME − SPENDING
        │
        ▼
  SAVINGS RATE = MONEY LEFT ÷ INCOME
```

Nothing in this layer touches `event_role`, `transfer_user_set`,
`sign_convention`, `duplicate_of_id`, category resolution, or Plaid
ingestion. It reads `countsForMonth`'s answer and `budgetEffectOf`'s
classification; it does not re-ask either question.

## 2. Core definitions

| Term | Definition | Code today |
|---|---|---|
| **Income** | Sum of `amount` over eligible transactions whose `budgetEffectOf(...)` is `INCOME` (or, for a `null`-role legacy/manual row, whose category is `kind: "income"`) | `rollup.ts` computes this, but see §7 — **not role-aware yet** |
| **Spending** | Sum of `amount` over eligible transactions whose `budgetEffectOf(...)` is `EXPENSE`, net of those whose effect is `EXPENSE_REVERSAL` (refunds reduce spending, not add negative income) | Same — see §7 |
| **Money Left** | Income − Spending, for one calendar month | `rollup.ts`'s existing `net` field — **keep the field name, fix its inputs (§7), rename only in UI copy**, matching north-star §9/§12 exactly |
| **Savings Rate** | Money Left ÷ Income, for one calendar month, undefined when Income is 0 | New — §9 |
| Actual Savings | Verified change in total position across all connected accounts (requires balance history) | **Not this layer.** V2, needs a balance-refresh/net-worth feature that doesn't exist. Never computed, approximated, or implied here. |
| Savings Goal | A manually-funded target the user names and logs contributions to (`savings_goals`/`savings_contributions`) | Already shipped (Phase 2a), fully decoupled from transactions — unchanged, unreferenced by this layer |

These five stay five distinct things in the model, the schema, and every
piece of UI copy — north-star §9's own rule, restated here because it is
the rule this whole document exists to protect.

## 3. The central distinction — money moved is not money saved

**Most important thing this document has to get right**, per the
product owner's own framing: *do not assume a transfer into a savings
account means the user economically saved that amount.*

Here is why the existing architecture already gets this right, and why
this layer must not "improve" on it by adding account-type awareness:

A transfer — whether the user explicitly marked it
(`transferUserSet: true`) or the machine resolved `event_role =
TRANSFER` — has `budgetEffectOf(...) === "NONE"`. `countsForMonth`
excludes it from the total `qualify.ts` sums over *at all*. It never
reaches Income or Spending. Concretely:

- User has $1,000 income this month, spends $0 elsewhere, moves $200
  from checking to a savings-type account. Income = $1,000. Spending =
  $0 (the $200 move is a `TRANSFER`, excluded). **Money Left = $1,000.**
- Same user, same income, spends $0 elsewhere, moves $0 to savings.
  Income = $1,000. Spending = $0. **Money Left = $1,000.** Identical.

Both users kept the same amount of money this month. The first one also
*labeled* $200 of it — that labeling is a real, useful fact (it is
exactly what Savings Goals already capture, deliberately decoupled, per
§2), but it is not a *different amount of economic saving*, and Money
Left must not report it as one. Reporting the first user a higher
"Money Left" than the second — or worse, showing $1,000 of income minus
$200 "savings" minus $0 other spending, i.e. double-subtracting the
transfer — is exactly the bug this section exists to rule out.

**This is also why `plaid_accounts`/`accounts.type = 'savings'` must
never be consulted by this layer**, or by `event_role`/`budget_effect`
upstream of it — matching the "no account-type threading" constraint
already upheld by every phase since Event Role (`event-role-design.md`
§ "no account-type threading", `budget-effect-design.md` same). A
transfer is a transfer because of its Plaid PFC signal or the user's
explicit correction, never because of which account it lands in. If
Money Left started reading account type, a user who mis-names a
checking sub-account "Emergency Fund" would see phantom swings with no
transaction-level cause — undermining the exact "we never guess"
discipline this whole ladder has held since Event Role §1.

**Consequence for the UI copy** (binding on whoever builds the
dashboard tile, not just a suggestion): the Money Left / Savings Rate
tile must carry language that heads this off directly, e.g. the
north-star §11 copy — *"Based on income minus spending — doesn't measure
savings-account balances"* — is not optional flavor text, it is the
product's only defense against a user reasonably misreading a cash-flow
proxy as a balance claim.

## 4. Component-by-component treatment

| Component | Treatment | Why |
|---|---|---|
| **Refunds** | `REFUND` role → `EXPENSE_REVERSAL` effect. Reduces Spending; is not added to Income. A category with more refunds than purchases in a month can show negative spend for that category (already true of `monthlyActuals`'s per-category math) — Money Left is unaffected either way, since Spending nets the same amount regardless of which bucket absorbed the sign | Keeps "I returned something" from inflating either Income or Spending; matches Budget Effect design §3's `EXPENSE_REVERSAL` rationale (kept distinct from `EXPENSE` for a future netting need, per that spec — this is that need) |
| **Credit-card payments** | `CARD_PAYMENT` → `NONE`. Excluded entirely. The underlying purchases were already counted as `EXPENSE` when charged; counting the payment too would double-count the same spend | Budget Effect design §3, unchanged here |
| **Transfers** (including savings, both directions) | `TRANSFER` → `NONE`. Excluded entirely, both directions. See §3 | Budget Effect design §3 + Transfer Ownership's whole existence |
| **Fees and interest** | `FEE`/`INTEREST` → `EXPENSE`. Counted as spend, reducing Money Left | Budget Effect design §3: "a real, unavoidable cost reducing the user's money" — deliberately not excluded, unlike a transfer |
| **`P2P_PAYMENT`** | Outgoing → `EXPENSE`; incoming → `INCOME`. Currently unreachable in V1 (resolver never assigns it — Event Role design §1), specified here only for forward-compatibility, same as Budget Effect §3 | No change; noted for completeness since the product questions ask about "spending" broadly |
| **`CASH_ADVANCE`** | `NONE`. Excluded — the liability increases but the eventual spend is invisible to Budgts, recorded as an event, never guessed as an expense | Budget Effect design §3 |
| **`ADJUSTMENT`** | `UNKNOWN` effect → excluded from both Income and Spending (an `UNKNOWN` effect fails the `EXPENSE \| EXPENSE_REVERSAL \| INCOME` membership check in `countsForMonth`, same as `NONE`) | Never guessed; routes to human review once that workflow exists (Budget Effect §3) — Money Left silently omitting an `ADJUSTMENT` row is correct, not a bug, until that review workflow resolves it to a real role |
| **Unresolved / `null` event role** | Falls back to `category.kind` (`income`/`expense`) + `!isTransfer`, the legacy pre-Event-Role derivation — same fallback `countsForMonth` already uses for eligibility. Manual/email/receipt-sourced rows are always `null` here; some older or edge-case Plaid rows may be too | This is the one place this layer must add new logic, not just consume upstream — see §7, the found gap |
| **`transferUserSet` explicit override** | Already fully handled upstream by `countsForMonth` — a user-marked transfer/non-transfer is excluded/included accordingly before this layer ever sees the row. This layer's Income/Spending split for an *included* user-overridden row still needs a bucket (income or spend) if it somehow has a resolved role that isn't `TRANSFER`/`NONE` (e.g. user unmarks a row that also has `eventRole: PURCHASE` — rare, since the two signals usually agree, but possible) — falls to the same `budgetEffectOf` classification as any other role-resolved row | `transferUserSet` decides *whether* a row counts, never *which bucket* it lands in if it does — that's still `budgetEffectOf`'s job |
| **Pending (`status = pending_review`)** | Excluded entirely — `countsForMonth`'s first gate, absolute, before anything in this layer runs. No partial credit, no separate "pending income" line | Sign Convention design's own invariant: `pending_review` contributes to *no* aggregate, period |
| **Confirmed duplicates (`duplicate_of_id`)** | Excluded entirely — `countsForMonth`'s second gate, absolute | Phase 15 / duplicate-containment invariant, unchanged |
| **Months** | UTC calendar month, `YYYY-MM` (`month.ts`'s `MonthKey`), unchanged. Money Left and Savings Rate are always reported *per month* — there is no "year to date" or rolling-window variant in this document's scope | Matches every existing `rollup`/`actuals`/`budgetVsActual` call already keyed this way; introducing a second month-boundary convention for one new metric would be a real, silent correctness risk |
| **Historical data** | No backfill, no special-cased "legacy month" logic. A month computed entirely from pre-Event-Role transactions (`eventRole` null on every row) is computed via the same `countsForMonth`/fallback path as any other month — it just exercises the fallback branch more. Money Left for that month is exactly as accurate as `rollup.ts`'s `net` already is today, no better, no worse | Matches every prior phase's explicit "no historical backfill" constraint (Event Role, Qualify Integration, Transfer Ownership all state this) — this layer is not the place to start |

## 5. Credit-card debt repayment vs. saving

A `CARD_PAYMENT` is excluded from Spending (§4) for the double-counting
reason given there. It is worth being explicit, because "I paid off my
credit card" *feels* like a savings-positive act and a user may expect
it to move the Savings Rate tile:

- **Paying the statement balance in full** (the common case): the
  spending already happened, was already counted as `EXPENSE` at
  purchase time, in a prior or the same month. The payment itself moves
  no new economic value — Money Left is correctly unaffected.
- **Paying down principal beyond what was purchased this period** (an
  extra payment against carried debt): this *does* represent a real
  reduction in liabilities — genuine financial progress — but the
  cash-flow proxy this layer implements cannot see it, because it has
  no concept of a credit account's balance, only of transaction-level
  spend/income. This is a real, known limitation, not an oversight.
  **Actual Savings (§2, V2, balance-history-dependent)** is the metric
  that would eventually capture this correctly, by measuring net worth
  change directly rather than inferring it from cash flow. Money Left
  must not attempt a partial, unverified version of that now — same
  reasoning as §3's account-type warning: a wrong number stated
  confidently is worse than an honestly incomplete one.

**Product decision, not yet made — flagged for approval, not decided
here:** should the dashboard say anything at all about debt paydown in
V1 (even just "not counted, coming in a future update"), or say
nothing until Actual Savings ships? Recommendation: say nothing rather
than half-explain a V2 feature that doesn't exist yet — but this is the
product owner's call, not a technical one.

## 6. What happens when qualification/event role is unresolved

Covered in the §4 table's "Unresolved / null event role" row; restated
here because the product questions ask about it directly. A `null`
`eventRole` is not an error state and is not rare — every manual,
email, and receipt-sourced transaction is `null` by design (Event Role
design §1: the resolver only ever runs against Plaid PFC signals), and
some Plaid rows will legitimately stay `null` too (the resolver's "never
guess" table in `event-role.ts` — anything not matching one of its
seven rows returns `null`, not a guess).

For eligibility, `countsForMonth` already handles this: `null` role →
falls back to `!isTransfer`. For Income/Spending classification
specifically — which is this layer's own addition, not something
`countsForMonth` decides — a `null`-role row falls back to
`category.kind`, exactly matching today's `rollup.ts` behavior for every
transaction (§7 fixes this to apply *only* when the role is unresolved,
rather than always).

## 7. A found gap: `rollup.ts` does not consult `budgetEffectOf` today

This is a concrete implementation finding, not a hypothetical — surfaced
by reading the current code while writing this document, not by
guessing.

`rollup.ts`'s `spend`/`income` split today derives entirely from
`category.kind` and raw `direction`:

```ts
const net = t.direction === "debit" ? t.amount : -t.amount;
if (t.categoryId !== null && kindById.get(t.categoryId) === "income") {
  income -= net;
} else {
  spend += net;                              // ← everything not "income"-kind lands here
  ...
}
```

It never calls `budgetEffectOf`. `countsForMonth` (the eligibility
gate) is fully role-aware — a `TRANSFER`/`CARD_PAYMENT`/`NONE`-effect
row is excluded before `rollup` ever sees it, so today's practical
exposure is limited. But for any row that *does* pass the gate with a
resolved role, `rollup.ts` still classifies it by category, not by
`budgetEffectOf`. Concretely, a hypothetical `P2P_PAYMENT`-incoming row
(role-resolved `INCOME` effect, currently unreachable per §4 but
specified for forward-compatibility) or an uncategorized `FEE`/`INTEREST`
row would be silently misclassified as ordinary spend/income by
category guesswork rather than by the role the rest of the pipeline
already computed for it.

**This must be fixed as part of building Money Left properly** — Income
and Spending are this document's own core definitions (§2), and they
must be as role-aware as eligibility already is. Proposed fix (§11,
Task 1): extend `rollup.ts`'s per-transaction branch to mirror
`countsForMonth`'s own structure —

```ts
if (t.eventRole != null && isEventRole(t.eventRole)) {
  const effect = budgetEffectOf(t.eventRole, t.direction);
  // effect is EXPENSE, EXPENSE_REVERSAL, or INCOME here —
  // countsForMonth already excluded NONE/UNKNOWN rows.
  if (effect === "INCOME") { income += t.amount; }
  else { spend += (effect === "EXPENSE_REVERSAL" ? -1 : 1) * <signed amount>; }
} else {
  // existing category.kind + direction fallback, unchanged
}
```

This is additive/corrective, not a redesign — `monthlyActuals` (the
per-category breakdown) is unaffected, since it never classifies
income-vs-spend, only nets a signed delta per category.

**Explicit decision requiring product approval:** this fix changes
computed numbers for any currently-passing row whose category-kind
classification disagrees with its `budgetEffectOf` classification. Given
`P2P_PAYMENT` is unreachable and `FEE`/`INTEREST` typically land in the
new "Fees & Interest" (expense-kind) category already, the practical
delta today is expected to be **zero or near-zero** — but this must be
verified against real synced data before shipping, not assumed. Flagged
here rather than silently included as a drive-by fix, because it is a
number-changing behavior change riding inside a feature that's supposed
to be purely additive.

## 8. Savings Rate

```ts
export function savingsRate(income: number, moneyLeft: number): number | null {
  if (income <= 0) return null;   // undefined, never 0% or a negative-income ratio
  return moneyLeft / income;      // caller formats as a percentage
}
```

| Case | Result | Reasoning |
|---|---|---|
| `income > 0`, `moneyLeft > 0` | `moneyLeft / income`, a fraction in `(0, ∞)` | Ordinary case. Can exceed 1 if spending is negative (net refunds exceeding purchases) — a real, if rare, state; not clamped |
| `income > 0`, `moneyLeft <= 0` | `moneyLeft / income`, a fraction in `(-∞, 0]` | Spent all or more than earned. A negative savings rate is a real, meaningful, and arguably important number to show — not hidden |
| `income === 0` | `null` — "not available," not `0%` | `0%` would falsely say "you saved nothing," when the truth is "you had nothing to save from." The UI must render this as an explicit "no income this month" state, not a bare `0%` or a blank |
| `income < 0` | `null`, same as `income === 0` | Net-negative income (e.g. a large uncategorized refund with no other income) makes the ratio directionally meaningless; treat identically to the zero case rather than inventing a new state for an edge case with no clear product meaning yet |

**Explicit decision requiring product approval:** should a
negative or >100% Savings Rate be visually distinguished in the UI
(e.g. a warning color past 0%, no visual cap past 100%)? This document
defines the math; the presentation is a UI-design call, not made here.

## 9. "Am I getting better or worse at saving?" — deferred, sketched only

North-star §15 already scopes month-over-month trends to "Next
iteration," after V1 Money Left / Savings Rate ships. This document
keeps that scoping and does not design the trend feature — but since
the product owner named it as one of the five questions this layer must
eventually answer, it gets a named placeholder rather than silence:

**Why not now:** a trend needs at least two comparable months of data
computed the *same* way. Every month computed before Event Role existed
used the legacy category-kind fallback exclusively (§6/§7); a "this
month vs. last month" comparison spanning that boundary would be
comparing two different measurement methods and presenting it as one
continuous trend — exactly the kind of unverified precision this whole
ladder has consistently refused to ship (see Sign Convention's
"UNKNOWN, never a guess" and Event Role's "every branch not listed
returns null" — the same discipline applies to a trend line, not just a
single number).

**Sketch, for a future design document, not specified here:**
`savingsTrend(current: MonthRollup, prior: MonthRollup): "improving" |
"declining" | "flat" | null` — comparing consecutive Savings Rates, with
`null` when either month has no income (§8) or falls entirely inside
the pre-Event-Role legacy window. Left as a name and a shape, not a
committed design — the comparison window (adjacent month? same month
last year? a rolling average?), the "flat" threshold, and whether it's
ever shown for a month with `savingsRate === null` are all open product
questions for that future document, not this one.

## 10. Invariants

> **Money Left and Savings Rate never independently re-derive
> eligibility, role, or effect.** They consume `countsForMonth`'s
> eligibility answer and `budgetEffectOf`'s classification exactly once
> each, the same way every other `qualify.ts` consumer already must
> (Qualify Integration design's own choke-point invariant, restated for
> this layer).
>
> **A transfer, in either direction, has zero effect on Money Left.**
> Not a small effect, not a delayed effect — zero, always, regardless of
> which account it moves between or what that account is named or
> typed.
>
> **Money Left is never described, in code, comments, or UI copy, as a
> measurement of account balances, net worth, or verified savings.**
> It is income minus spending for eligible transactions in one month —
> nothing else. "Actual Savings" is a distinct, unbuilt, V2-dependent
> concept and must never be conflated with it, per §2/§3.
>
> **`accounts.type`/`plaid_accounts.type`/`subtype` are never consulted
> by this layer**, matching the "no account-type threading" constraint
> every phase since Event Role has upheld.
>
> **A `pending_review` or confirmed-duplicate row contributes to Income,
> Spending, and Money Left exactly as it does to every other financial
> aggregate: zero.** No partial credit, no separate pending line.
>
> **`income === 0` (or negative) produces `savingsRate === null`, never
> `0`.** A displayed `0%` must never be reachable by this path — only by
> an income greater than zero and a Money Left of exactly zero.
>
> **No historical backfill.** A month computed from entirely
> pre-Event-Role data uses the same code path as every other month, at
> whatever accuracy that path already provides — this layer does not
> special-case it and does not improve it retroactively.

## 11. Proposed pure functions and types

All additive or corrective to existing files; no new persisted columns,
no migration (§13).

```ts
// src/lib/budget/rollup.ts — corrected (Task 1, §7), signature unchanged
export function rollup(
  txns: BudgetTxn[],
  categories: BudgetCategory[],
  budgets: CategoryBudget[],
  month: MonthKey,
): MonthRollup; // .net is Money Left — field name unchanged, docstring updated

// src/lib/budget/savings-rate.ts — new file
export function savingsRate(income: number, moneyLeft: number): number | null;
```

`savingsRate` deliberately takes two numbers, not a `MonthRollup`, to
stay trivially unit-testable and to avoid coupling it to `rollup.ts`'s
internal shape — `dashboard.ts` (or whatever calls it) passes
`r.income, r.net` from an already-computed `MonthRollup`.

No new type is needed for "Money Left" — it is `MonthRollup.net`,
unchanged. `MonthRollup` itself is not modified; `savingsRate`'s result
is a separate value the caller combines with the existing rollup, not a
new field threaded through every `rollup()` call site.

## 12. Affected files

| File | Change |
|---|---|
| `src/lib/budget/rollup.ts` | Corrected income/spend classification (§7) — no signature change |
| `src/lib/budget/rollup.test.ts` | New test cases for the role-aware classification fix |
| `src/lib/budget/savings-rate.ts` | New — `savingsRate()` |
| `src/lib/budget/savings-rate.test.ts` | New — the table in §8, plus the two `null` cases |
| `src/lib/budget/dashboard.ts` | `DashboardTiles` gains a `savingsRate: number \| null` field, computed from the existing `rollup()` call's `income`/`net` — no new data fetch |
| `src/lib/budget/dashboard.test.ts` | New cases for the added tile field, including the `income === 0` → `null` case |
| `src/app/(app)/(dashboard)/page.tsx` | UI copy only, if/when the tile ships — the north-star §11 disclaimer text (§3) |
| `docs/specs/2026-09-12-north-star-architecture-design.md` | No change needed — this document is fully consistent with it |

No `src/server/*`, no Supabase query changes, no new `Database` type
fields — every input this layer needs (`income`, `net`) already reaches
`page.tsx` via the existing `rollup()` call.

## 13. Migration requirements

**None.** Money Left and Savings Rate are derived at read time from data
that already exists and is already fetched — matching north-star §9's
"Available: Now" for exactly this reason, and matching Budget Effect's
own "derived, never stored" precedent. No schema change, no new column,
no new index.

## 14. Test matrix

**`rollup.ts` (§7 fix):**
1. A `PURCHASE`-role debit with no category (or an expense-kind
   category) counts as spend — regression guard, current behavior
   unchanged.
2. An `INCOME`-role credit counts as income regardless of category —
   regression guard.
3. A hypothetical `P2P_PAYMENT`-incoming credit (role-resolved `INCOME`)
   with no category counts as income, not spend — the fix's actual
   proof; today's code would misclassify this.
4. A `REFUND`-role credit reduces spend, does not add income — proves
   `EXPENSE_REVERSAL` is handled distinctly from `INCOME`.
5. A `null`-role transaction still uses the `category.kind` fallback —
   regression guard, proves the fix is additive, not a replacement.
6. A `TRANSFER`/`CARD_PAYMENT`-role row never reaches `rollup`'s
   classification branch at all (excluded upstream by `countsForMonth`)
   — proves this fix does not need its own transfer-exclusion logic.

**`savings-rate.ts`:**
7. `income: 100_00, moneyLeft: 30_00` → `0.3`.
8. `income: 100_00, moneyLeft: -20_00` → `-0.2` (negative, not clamped).
9. `income: 0, moneyLeft: 0` → `null`.
10. `income: -50_00, moneyLeft: -50_00` → `null` (negative income).
11. `income: 100_00, moneyLeft: 150_00` → `1.5` (over 100%, not clamped —
    net refunds exceeding spend, or high investment/interest income).

**`dashboard.ts`:**
12. `DashboardTiles.savingsRate` matches `savingsRate(tiles.income,
    tiles.netSavings)` for an ordinary month.
13. A month with zero income produces `savingsRate: null` in the tile,
    not `0`.

**End-to-end, DB-integration (mirroring Transfer Ownership's own
precedent of proving the full chain against real Postgres, not just
unit-level reasoning):**
14. A user explicitly marks a transfer (`transferUserSet: true`); the
    dashboard's Money Left for that month is identical whether or not
    that transfer happened — proves §3's central claim against real
    data, not just narrated.
15. A `CARD_PAYMENT`-role row (the underlying purchase counted in an
    earlier month) has zero effect on the payment month's Money Left —
    proves §5's double-counting-prevention claim against real data.

## 15. Explicitly deferred / out of scope

- **Actual Savings** (verified balance-based accumulation) — V2, needs
  balance refresh + net-worth tracking that doesn't exist. Not
  approximated here even partially (§3, §5).
- **Month-over-month trend** ("getting better or worse") — sketched
  only, §9. Needs its own design document once there's enough
  Event-Role-era history to compare honestly.
- **Debt paydown as a savings signal** — explicitly excluded, §5.
- **Year-to-date / rolling-window Money Left** — out of scope; this
  document is calendar-month only, matching every existing consumer.
- **Any UI/visual design** for the tile beyond the one disclaimer-copy
  requirement in §3 — left to whoever builds it, following the
  `dataviz` skill's guidance at that time.
- **Paired-transfer detection (`transferPairId`)** — north-star §15's
  own "Next iteration" item; irrelevant to this layer either way, since
  a transfer already nets to `NONE` whether or not its pair is matched.

## 16. Decisions collected for product approval

Restated from where each appears above, for a single scannable list:

1. **§5** — whether V1's dashboard says anything about credit-card debt
   paydown, or says nothing until Actual Savings exists. Recommendation:
   say nothing.
2. **§7** — approval to ship the `rollup.ts` classification fix (income/
   spend now role-aware, not just category-aware) as part of this
   feature, after verifying its real-data impact is zero/near-zero as
   expected, not assumed.
3. **§8** — whether a negative or >100% Savings Rate gets distinct
   visual treatment in the UI. Math is decided (not clamped); the
   presentation is not.
