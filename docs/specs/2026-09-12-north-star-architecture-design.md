# Budgts North Star Financial Architecture

Status: **implemented and shipped.** Every layer of the pipeline this
document specifies — sign convention, event role, budget effect, the merged
`countsForMonth` gate, Money Left / Savings Rate — is built, tested, and
live in production since 2026-09-13 (`4590520`). See `docs/workflow.md` §7
for the shipping history of each layer, and each layer's own design doc
(`event-role-design.md`, `budget-effect-design.md`,
`qualify-integration-design.md`, `transfer-ownership-design.md`,
`money-left-savings-rate-design.md`) for what shipped exactly as designed
vs. what evolved further.

Companion document: `2026-09-12-advancial-remediation-and-future-ingestion-defense.md`
(same directory) is the narrow, fully-specified design for the `duplicate_of_id`
containment column and the confirmed Advancial incident. That document owns
the real production numbers, the row-selection rule, and the remediation
script pattern — this document does not repeat them. This document owns the
broader financial-semantics layer (`event_role`, `sign_convention`, budget
effect, Money Left / Savings Rate) that sits *downstream* of that containment
gate. The two `countsForMonth` proposals are merged into one function in §5
below; there is no conflict between the two designs, only sequencing (§14).

**Important distinction, still current:** the containment *mechanism*
(`duplicate_of_id` + its `qualify.ts` gate) shipped — but the actual
remediation *execution* against the confirmed Advancial incident has
**never been run**. Zero production rows have `duplicate_of_id` set. See
the companion document's own Status line; that is the one genuinely open
decision left anywhere in this design cluster.

## 0. Core invariants

> **No transaction may affect Budgts' financial metrics until its financial
> semantics are sufficiently established.**
>
> **Budgts measures economic activity separately from account activity.**
>
> A transaction's *role* determines its economic meaning. Its *account flow*
> (`direction`) determines the direction of that event. Its *budget effect*
> determines whether it contributes to the savings picture. These are three
> questions, answered once, by one pipeline — never independently re-inferred
> by each downstream consumer.

## 1. The pipeline

```
              PLAID / SOURCE
                    │
                    ▼
             SOURCE INTEGRITY  ── duplicate detection (content-fingerprint,
              /            \      built) + containment (duplicate_of_id,
          normal        suspicious  companion spec, build first — §14)
            │                │
            ▼                ▼
     SIGN CONVENTION      REVIEW (plaid_accounts.needs_review)
    (unknown/standard/
       inverted)
            │
            ▼
      ACCOUNT FLOW (direction — unchanged concept, corrected input)
            │
            ▼
   EVENT ROLE + CONFIDENCE
            │
            ▼
      BUDGET EFFECT
            │
            ▼
       CATEGORY (unchanged resolver chain)
            │
            ▼
   BUDGET-ELIGIBLE? (countsForMonth — one authoritative gate)
            │
      ┌─────┴─────┐
      ▼           ▼
   SPENDING     INCOME
      └─────┬─────┘
            ▼
        MONEY LEFT
            │
            ▼
       SAVINGS RATE
            │
            ▼
      SAVINGS STORY
```

## 2. Sign convention

**States:** `UNKNOWN | STANDARD | INVERTED`. New account default: **`UNKNOWN`**
— never `STANDARD`. Defaulting to `STANDARD` while detection runs is exactly
the failure mode that produced the Advancial-adjacent sign-inversion problem
this section defends against; it is explicitly rejected.

**Lifecycle (accounts connected after this ships):**
```
account connects → sign_convention = UNKNOWN
        │
transaction arrives → lands with status = pending_review, no direction
        │                claim finalized
evidence accumulates (broadened model, below)
        │
   ┌────┴────┬─────────────┐
   ▼         ▼             ▼
STANDARD  INVERTED     still ambiguous after a
   │         │          reasonable evidence window
   │         │               │
   ▼         ▼               ▼
finalize pending rows    remains UNKNOWN, account
with correct direction,  flagged via needs_review —
status → confirmed       never left silently stuck
```

**Invariant:** `pending_review` transactions contribute to **no** aggregate
this architecture defines or will define — no spending, no income, no Money
Left, no Savings Rate, no category totals, no budgets, no pacing, no savings
insights. This already falls out of `qualify.ts`'s `status === 'confirmed'`
check for everything routed through `rollup`/`actuals`/`budgetVsActual`; see
the verification checklist (§13) for the rest.

**UI:** never exposes "sign convention." While unresolved: *"We're checking
this account's transaction format. Your transactions will appear once
verified."*

**Detection evidence — deterministic, not statistical/ML, broadened beyond
a handful of PFC primaries:**

| Tier | Signals |
|---|---|
| Strong | Known purchase, known card payment, known fee, known interest, known income/deposit, a documented Plaid transaction code where available |
| Supporting | PFC category, merchant/counterparty, `plaid_accounts` reported type/subtype, observed sign distribution |

A refund is expected to carry the opposite direction of a purchase and must
not be treated as contradicting evidence — the detector's evidence rules
must encode that explicitly. Output is always exactly one of
`UNKNOWN / STANDARD / INVERTED`; ambiguous evidence stays `UNKNOWN`, never a
guess.

**Existing accounts (migration):** resolved once, retroactively, from full
existing transaction history, as part of the one-time sign-migration
workflow (§10) — not through the live `UNKNOWN → pending_review` path, which
only governs accounts connected after this feature ships.

## 3. Event role

```
PURCHASE, REFUND, INCOME, CARD_PAYMENT, TRANSFER, P2P_PAYMENT, FEE, INTEREST, CASH_ADVANCE, ADJUSTMENT
```
`null` = fully unresolved (legacy/manual compatibility path).

**Confidence** (`HIGH | MEDIUM | LOW`) is part of the resolver's internal
contract, not a persisted column — do not add one unless implementation
proves it's actually necessary. It describes **certainty of the role
classification**, never whether the transaction counts:

| Confidence | Meaning |
|---|---|
| HIGH | Resolve automatically |
| MEDIUM | Resolve automatically, remains explainable |
| LOW | Resolve automatically with the product-safe treatment, and becomes a review candidate |

`P2P_PAYMENT` at `LOW` confidence + outgoing → `EXPENSE` is a **valid,
intended** state — it means "we're not certain this wasn't a self-transfer,
but the safest financial treatment is to count it," not "don't trust this
number." A future maintainer must not read `LOW` as license to exclude a
transaction from the budget.

## 4. Budget effect (derived, never stored)

| event_role | budget_effect |
|---|---|
| PURCHASE | EXPENSE |
| REFUND | EXPENSE_REVERSAL |
| INCOME | INCOME |
| CARD_PAYMENT | NONE |
| TRANSFER | NONE |
| P2P_PAYMENT, outgoing | EXPENSE |
| P2P_PAYMENT, incoming | INCOME |
| FEE | EXPENSE |
| INTEREST | EXPENSE |
| CASH_ADVANCE | NONE — liability increases, but the eventual spend is as invisible to Budgts as an ATM withdrawal; recorded, not guessed |
| ADJUSTMENT | UNKNOWN — never guessed, routes to review |
| `null` | falls back to today's `category.kind` + `direction` derivation, unchanged |

`CARD_PAYMENT` and `TRANSFER` share an effect but remain distinct roles
permanently — a future "why did my checking drop $2,000" explanation, debt
tracking, and savings insights all depend on that distinction surviving.

## 5. The one authoritative gate

`qualify.ts`'s `countsForMonth`, extended — merging this design's role-aware
gating with the companion spec's duplicate-containment gate into one
function, not two independently-consulted conditions:

```ts
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  if (monthKey(txn.occurredAt) !== month) return false;
  if (txn.status !== "confirmed") return false;          // excludes pending_review —
                                                            // includes the UNKNOWN-sign window, for free
  if (txn.duplicateOfId != null) return false;            // companion spec — confirmed duplicate, never counted

  if (txn.eventRole != null) {
    return budgetEffectOf(txn.eventRole, txn.direction) !== "NONE";
  }
  return !txn.isTransfer;                                  // legacy path — manual/unresolved rows only
}
```

**Invariant:** once `event_role` is resolved, `is_transfer` can never
override it. `is_transfer` is retained solely for manual entries and
legacy/unresolved rows. `event_role`, `is_transfer`, `category.kind`,
`direction`, and `duplicate_of_id` are never independently consulted by
different consumers — exactly one function answers "does this count," and
everything else (dashboard, budgets, exports, future pacing/insight
features) reads its answer rather than re-deriving one.

## 6. Transfer vs. P2P

```
TRANSFER_OUT / TRANSFER_IN signal
        │
   self-transfer evidence (matched pair via transferPairId,
   or a documented Plaid internal-transfer signal)?
        │
   ┌────┴────┐
  YES        NO
   │          │
   ▼          ▼
TRANSFER   known third-party-payment evidence?
(HIGH)         │
          ┌────┴────┐
         YES        NO
          │          │
          ▼          ▼
     P2P_PAYMENT  P2P_PAYMENT
     (HIGH/MED)   (LOW)
```

Either way, an unresolved-but-transfer-shaped outgoing transaction counts as
spend by policy — falsely inflating the savings story is worse than
understating it — but it is never *labeled* as confidently P2P when the
evidence doesn't support that; the confidence tier carries that honesty.

## 7. Credit-card worked examples

- **Purchase, inverted feed, single account connected:** sign convention
  resolves `INVERTED` from history/evidence → direction corrected at the
  existing `adapter.ts:48` choke point → `PURCHASE` → `+$100 Food`.
- **Card payment, both sides connected:** both legs resolve `CARD_PAYMENT`
  (via pairing or independently) → `$0 new spend`, tracked as debt
  reduction, not a generic transfer.
- **Card payment, one side connected:** the connected side's own
  payment-signal is sufficient alone — no pairing required.
- **Self-transfer, one side connected, no confirming signal:**
  `P2P_PAYMENT` at `LOW` confidence, counted as spend (safe default),
  flaggable for review.
- **Venmo $400 to a friend:** no self-transfer evidence anywhere →
  `P2P_PAYMENT` → correctly counted as spend.

## 8. Categorization

Unchanged. `event_role` and `category` remain orthogonal — role answers
"does this count and how," category answers "what kind of thing."
`TRANSFER`/`CARD_PAYMENT` typically need no category, mirroring today's
`TRANSFER_IN`/`OUT` skip-categorization behavior. One new seed category:
**"Fees & Interest."**

## 9. Savings model

| Term | Definition | Available |
|---|---|---|
| Income | Sum of `INCOME`-effect transactions | Now |
| Spending | Sum of `EXPENSE`, net of `EXPENSE_REVERSAL` | Now |
| **Money Left** | Income − Spending | Now |
| **Savings Rate** (proxy) | Money Left ÷ Income, documented as a proxy, not a verified-accumulation claim | Now |
| Actual Savings | Verified change in total position across connected accounts | Not until V2 net-worth/balance-history |
| Debt reduction | Decrease in a credit account's balance | Same V2 dependency |
| Savings Goal | A manually-funded target, independent of the above | Now (unchanged, decoupled) |

Money Left, Savings Rate, Actual Savings, and Savings Goal are four distinct
things and stay distinct in the model, the schema, and the UI copy — none
of them substitute for another.

## 10. Historical remediation — exactly two workflows, nothing generic

1. **Duplicate Plaid-feed corruption** — detection already built
   (`content-fingerprint.ts` + `needs_review`); containment
   (`duplicate_of_id` + the merged `countsForMonth` in §5) is fully
   specified in the companion document, including the confirmed Advancial
   incident's exact scope, before/after totals, and remediation script
   pattern. **Not executed against production yet** — build and ship the
   mechanism unused; the remediation run against Advancial's real data
   waits on the separate approval described there.
2. **One-time sign-convention migration** — for accounts already connected
   and already `confirmed` before this ships. Runs the same evidence
   detector against each account's full existing history once, at rollout.

Both require: affected account, affected date range, exact affected rows,
before/after totals, explicit approval, auditable execution. No third,
generic "historical cleanup" mechanism gets built — a future data-quality
problem gets its own scoped workflow, not a slot in a general-purpose one.

## 11. Dashboard

```
Income          $5,000
Spent           $3,200
Money Left      $1,800
Savings Rate    36%          ("Based on income minus spending —
                               doesn't measure savings-account balances")

Where your money went
  Food, Housing, Transport, ...

Accounts
  Checking, Savings, Visa, Amex   (names only — no balances until refresh exists)
```

## 12. Existing-code mapping

| Concept | Existing mechanism | Verdict |
|---|---|---|
| Account flow | `transactions.direction` | Keep, corrected input |
| Ineligibility gate | `qualify.ts:9` `countsForMonth` | Extend — the one authoritative function |
| Pending/unresolved exclusion | `transactions.status` (`confirmed`/`pending_review`) | Reuse — already excluded everywhere `qualify.ts` is consulted |
| Duplicate detection | `content-fingerprint.ts` + `sync-engine.ts` | Keep, unchanged |
| Duplicate containment | `duplicate_of_id` (companion spec) | New — build first (§14) |
| Anomaly review surface | `plaid_accounts.needs_review/review_reason/review_flagged_at` | Reuse for sign-convention ambiguity too |
| Transfer pairing | `transferPairId` (reserved, unused) | New logic, V1.5-scoped |
| Money Left | `rollup.ts:48` `net` | Keep, rename in UI copy |
| Savings goals | `savingsGoals`/`savingsContributions` | Keep fully decoupled |
| Sign normalization | `adapter.ts:48` | Extend — one-line change at the existing choke point |
| Categorization | Full resolver chain, merchant rules | Unchanged |

## 13. Minimal schema changes

1. `transactions.duplicate_of_id` — nullable, self-referential FK (companion spec, build first).
2. `transactions.event_role` — nullable enum, 10 values above.
3. `plaid_accounts.sign_convention` — enum (`unknown | standard | inverted`), default `unknown`.
4. No new confidence column — resolver-contract concept only.
5. No new review-surface columns — `needs_review`/`review_reason`/`review_flagged_at` reused.
6. Content-only: add "Fees & Interest" to `STANDARD_CATEGORIES`.

**Pre-implementation verification checklist** (an audit task, not a design gap):
- Confirm every direct `transactions` query outside `rollup`/`actuals`/`budgetVsActual`
  (CSV export, needs-category-bell counter, any future pacing feature) respects
  both `status` and `duplicate_of_id`, not just the domain functions.
- Verify exact Plaid PFC detailed-subtype strings for credit-card-payment and
  interest/fee signals against the API version pinned in `category-map.ts`
  before hardcoding them.
- Tune actual evidence thresholds (sample size, confidence bar) against real
  synced data, not asserted numbers.

## 14. Implementation sequencing

Containment ships before semantics, so there is an immediate safety property
in place before the more complex resolver work lands:

```
duplicate_of_id schema (companion spec)
        ↓
qualify.ts containment (duplicate_of_id IS NULL)
        ↓
tests proving duplicate rows cannot affect any aggregate
        ↓
sign_convention (schema + UNKNOWN default + pending_review lifecycle)
        ↓
event_role / budget_effect (schema + derivation)
        ↓
resolver + ingestion integration (adapter.ts, land.ts, sync-engine.ts)
        ↓
direct-query audit (§13 checklist)
        ↓
full test suite
```

## 15. V1 / Next / Future

**V1 foundation:** `duplicate_of_id` containment (built and tested first,
unused against production data until separately approved); `event_role` +
resolver; `sign_convention` (`unknown`-default) + `pending_review` lifecycle
+ broadened evidence detector; `countsForMonth` as the one authoritative
gate; `P2P_PAYMENT` default-counts-as-spend with confidence tagging;
single-sided `CARD_PAYMENT` recognition; Money Left / Savings Rate copy and
tiles; review UI for both `needs_review` reasons; "Fees & Interest"
category; Accounts as a names-only list.

**Next iteration:** paired-transfer detection (`transferPairId`); balance
refresh + freshness model, then balance display; the one-time
sign-convention and `event_role` historical backfills; month-over-month
trends; opt-in transfer→goal linking; execution of the confirmed Advancial
remediation (pending the separate approval described in the companion doc).

**Future:** net worth / Actual Savings (V2); recurring/subscription
detection; AI assistant.
