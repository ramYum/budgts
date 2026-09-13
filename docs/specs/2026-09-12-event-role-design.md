# Event Role — Design

Status: **implemented and shipped**, exactly as designed
(`src/lib/plaid/event-role.ts`). One evolution this doc predates: migration
`0011` later added a Postgres CHECK constraint mirroring §3's resolution
table — an enum-equivalent guard at the DB layer, despite this doc's
deliberate "no new enum" choice at the Drizzle-type level (still true). See
`docs/workflow.md` §7.
Scope: **Event Role only.** Not in scope: Budget Effect, Money Left, Savings
Rate, Phase 15 changes, historical backfill, any UI.

Pipeline position (per North Star doc, refined against the real, now-shipped
sign-convention code):

```
Plaid raw amount
  → adapter.ts: sign correction (signConvention)         DONE (sign-convention branch)
  → adapter.ts: direction (debit/credit)                 DONE
  → adapter.ts: category resolution                       DONE (unchanged by this work)
  → adapter.ts: pendingReason / status                     DONE
  → adapter.ts: event role resolution                      THIS DESIGN
  → (separate, later task) budget_effect + qualify.ts       NOT THIS TASK
```

Event role is one more pure computation `adapter.ts` performs per transaction.
It reads signals already available at that point (`direction`, `isTransfer`,
PFC `primary`/`detailed`) and writes one new field. It does **not** touch
`qualify.ts`, `countsForMonth`, `duplicate_of_id`, or any financial total —
the same boundary `pendingReason` held until `finalizeSignConvention` (a
separate, later piece of work) consumed it.

## 1. Verification: what Plaid signals this app can actually rely on

Before finalizing the resolution table, I verified two things against Plaid's
published taxonomy and this codebase's real Plaid call, because the original
North Star draft had explicitly flagged uncertainty here.

**Finding 1 — a credit-card payment is not a "transfer" in Plaid's taxonomy.**
It's `personal_finance_category.primary = "LOAN_PAYMENTS"`, `detailed =
"LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"` — a distinct primary from `TRANSFER_IN`/
`TRANSFER_OUT`. `adapter.ts`'s current `TRANSFER_PRIMARIES` set only contains
`TRANSFER_IN`/`TRANSFER_OUT`, so today a credit-card payment has
`isTransfer = false` and falls through to normal category resolution — where
`category-map.ts` already maps `LOAN_PAYMENTS → null` ("user decides"). So
today, a card payment silently lands in "needs a category," indistinguishable
from a real uncategorized purchase. That's the concrete problem Event Role
fixes for this case.

**Finding 2 — this app currently receives Plaid's legacy PFC taxonomy
("v1"), not "PFCv2."** Plaid gates the newer, more granular `detailed`
subtypes behind an explicit opt-in: `options.personal_finance_category_version:
"v2"` on the `/transactions/sync` request. `src/lib/plaid/sync-item.ts`'s
`client.transactionsSync({ access_token, cursor, count: 500 })` call does not
set this option, and `category-map.ts` documents itself as pinned to
"Plaid-Version 2020-09-14." I fetched Plaid's published legacy taxonomy (the
one this app actually receives) and cross-checked it against the newer
combined taxonomy to see exactly which values are safe to build on today
without a Plaid integration change:

| Detailed value | In legacy (v1) taxonomy — safe today? |
|---|---|
| `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` | **Yes** |
| `TRANSFER_IN_SAVINGS` / `TRANSFER_OUT_SAVINGS` | **Yes** |
| `TRANSFER_IN_ACCOUNT_TRANSFER` / `TRANSFER_OUT_ACCOUNT_TRANSFER` | **Yes** |
| `BANK_FEES_INTEREST_CHARGE` | **Yes** |
| `BANK_FEES_ATM_FEES` / `_FOREIGN_TRANSACTION_FEES` / `_INSUFFICIENT_FUNDS` / `_OVERDRAFT_FEES` / `_OTHER_BANK_FEES` | **Yes** |
| `TRANSFER_IN_TRANSFER_IN_FROM_APPS` / `TRANSFER_OUT_TRANSFER_OUT_FROM_APPS` (P2P apps: Venmo/Zelle/Cash App-shaped) | **No — PFCv2-only** |
| `TRANSFER_OUT_WIRE` / `_CRYPTO`, `LOAN_PAYMENTS_BNPL` / `_CASH_ADVANCES` / `_EWA`, `BANK_FEES_LATE_FEES` / `_CASH_ADVANCE` | **No — PFCv2-only** |

**Consequence:** every signal this design uses is confirmed live in this
app's current integration, with one deliberate exception — `P2P_PAYMENT`
has no reliable signal today (its only distinguishing Plaid value is
PFCv2-only), so it is **reserved but not auto-assigned in V1**, same
treatment as `CASH_ADVANCE`/`ADJUSTMENT` (§3). This is a real limitation,
not something to work around with a guess. Opting into `personal_finance_category_version: "v2"`
would resolve it, but that's a Plaid-integration behavior change with its own
blast radius (it also changes what `category-map.ts` receives, which is
pinned to the legacy taxonomy) — flagged as a follow-up in §7, deliberately
**not** bundled into this task.

## 2. The model

```
PURCHASE, REFUND, INCOME, CARD_PAYMENT, TRANSFER, P2P_PAYMENT, FEE, INTEREST, CASH_ADVANCE, ADJUSTMENT
```

`null` = unresolved, same convention as `category_id`. Three of these ten —
`P2P_PAYMENT`, `CASH_ADVANCE`, `ADJUSTMENT` — are reserved in the enum but
**never auto-assigned** by the V1 resolver:
- `P2P_PAYMENT`: no reliable signal today (§1, Finding 2).
- `CASH_ADVANCE`: Plaid's only cash-advance-shaped signals available today
  are ambiguous (a fee *on* a cash advance is not the same event as the
  advance itself, and the legacy taxonomy has no dedicated "cash advance
  withdrawal" detailed value) — guessing here risks misclassifying a real
  purchase.
- `ADJUSTMENT`: reserved for a future manual-correction feature; the
  resolver must never guess a correction happened.

These three stay in the enum (forward-compatible, and `ADJUSTMENT` in
particular is inherently never resolver-assigned by design) but every branch
below either produces one of the other seven roles or `null`.

No per-user state is needed to resolve event role — everything is on the
transaction itself. Unlike category resolution (`ctx.resolveCategory`,
which layers in a user's remembered merchant corrections), this is proposed
as a plain, non-injected pure function. If a future phase adds user-editable
event roles, that's the natural point to add an injection — not before
(YAGNI; mirrors how merchant-rule memory was added on top of category
resolution only once *that* needed memory).

## 3. Resolution table

Evaluated top to bottom, first match wins:

| # | Condition | Role | Confidence |
|---|---|---|---|
| 1 | `primary === "LOAN_PAYMENTS"` and `detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"` | `CARD_PAYMENT` | HIGH |
| 2 | `primary === "INCOME"` | `INCOME` | HIGH |
| 3 | `primary === "BANK_FEES"` and `detailed === "BANK_FEES_INTEREST_CHARGE"` | `INTEREST` | HIGH |
| 4 | `primary === "BANK_FEES"` (any other/unrecognized `detailed`) | `FEE` | MEDIUM |
| 5 | `isTransfer` is true (i.e. `primary` is `TRANSFER_IN`/`TRANSFER_OUT` — row 1 already claimed the one `LOAN_PAYMENTS` case that isn't really a transfer) | `TRANSFER` | MEDIUM |
| 6 | `direction === "credit"` and `primary` is one of the recognized spend-shaped primaries (`FOOD_AND_DRINK`, `GENERAL_MERCHANDISE`, `HOME_IMPROVEMENT`, `MEDICAL`, `PERSONAL_CARE`, `GENERAL_SERVICES`, `GOVERNMENT_AND_NON_PROFIT`, `TRANSPORTATION`, `TRAVEL`, `RENT_AND_UTILITIES`, `ENTERTAINMENT`) | `REFUND` | HIGH |
| 7 | `direction === "debit"` and `primary` is one of the same spend-shaped primaries | `PURCHASE` | HIGH |
| — | anything else (unrecognized `primary`, `null` `primary`, `LOAN_PAYMENTS` with any other detailed [mortgage/car/student/personal/other/none — matches `category-map.ts`'s existing "user decides" treatment of that primary], a spend-shaped primary with neither direction matched) | `null` (unresolved) | — |

"Confidence" here is a resolver-internal reasoning label (like the North Star
doc's original framing), not a persisted column — it exists to make the
table's reasoning legible in review and tests, not as app state.

## 4. Schema

One new column, no new enum — following this exact table's own precedent:
`pending_reason` (added by the sign-convention work) is `text`, nullable,
TS-narrowed to a union, specifically to avoid enum-migration friction for a
value set expected to grow. `event_role` gets the same treatment:

```ts
// src/lib/db/schema.ts, transactions table, near pendingReason:
eventRole: text("event_role"),
```

TS-side: `EventRole = "PURCHASE" | "REFUND" | "INCOME" | "CARD_PAYMENT" |
"TRANSFER" | "P2P_PAYMENT" | "FEE" | "INTEREST" | "CASH_ADVANCE" |
"ADJUSTMENT"`, column typed `string | null` at the Drizzle level like
`pendingReason`, narrowed at the boundary that writes it.

Nullable, no default, purely additive — existing rows are valid with
`event_role = null`. No backfill (§6).

## 5. Affected files

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | `transactions.event_role` column (`text`, nullable) |
| `supabase/migrations/` | new migration adding the column (additive, reversible) |
| `src/lib/plaid/event-role.ts` (new) | pure resolver: `resolveEventRole({ primary, detailed, direction }): EventRole \| null`, table above, mirrors `category-map.ts`'s style |
| `src/lib/plaid/types.ts` | `PlaidNormalizedTxn.eventRole: EventRole \| null`; export `EventRole` type |
| `src/lib/plaid/adapter.ts` | call `resolveEventRole` alongside the existing `isTransfer`/`categoryId` computation; add `eventRole` to the returned `PlaidNormalizedTxn` |
| `src/lib/plaid/land.ts` | add `"eventRole"` to `PlaidTxnInsert`'s `Pick<...>` and to `plaidToInsert`'s returned object |
| `src/lib/plaid/apply-sync.ts` | add `eventRole` to `TxnPatch` and `patchFrom`, **unconditional** — not gated by `userCategorized` (no user-correction UI exists yet; mirrors how `merchantName`/`plaidCategoryPrimary` already update unconditionally on every `modified` event) |
| Tests | new `event-role.test.ts` (every branch of §3); new cases in `adapter.test.ts`, `land.test.ts`, `apply-sync.test.ts`; DB-integration coverage extending `tests/integration/plaid-sync-store.test.ts`'s existing fixtures |

Nothing in `qualify.ts`, `duplicate_of_id`, `sign-convention.ts`,
`sync-store.ts`'s sign-convention methods, or any RLS policy changes.
`AccountMapEntry`/`NormalizeCtx` are unchanged — no account-type threading
needed, because the verified signal (§1) is self-sufficient per transaction;
adding an account-type gate would risk excluding a legitimate
`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` leg that lands on a non-credit account
(e.g. a balance transfer paid from one card to another), for no real benefit.

## 6. Invariants

- Never guesses — unresolved is `null`, same contract as `category_id`.
- Purely additive: does not change `is_transfer`, `status`, `pending_reason`,
  `category_id`, `duplicate_of_id`, or any current total.
- Computed unconditionally, even for `pending_review` rows — costs nothing,
  and means a row already carries its role by the time sign-convention or
  currency-mismatch review resolves it.
- `P2P_PAYMENT`, `CASH_ADVANCE`, `ADJUSTMENT` are never auto-assigned by this
  resolver (§1, §3).
- Manual, email, and receipt-sourced transactions always get
  `event_role = null` in this phase — this is the Plaid-pipeline only, same
  boundary `pending_reason`/`sign_convention` already hold.
- No historical backfill — only new rows landing after this ships get a
  resolved role, matching the sign-convention precedent exactly.
- Existing sign-convention direction correction and `duplicate_of_id`
  containment are read, never modified, by this work.

## 7. Edge cases

- **Refund vs. sign-inversion:** cannot be confused — event role only ever
  sees the already sign-corrected `direction`, so a refund is just "credit
  inside a spend-shaped primary," never mistaken for an inverted account.
- **Multi-account sign-convention pooling bug class (the exact defect fixed
  on the sign-convention branch):** does not apply here. Event role is
  resolved per-transaction from that transaction's own PFC fields; nothing
  aggregates across accounts.
- **Fee vs. interest:** `BANK_FEES` doesn't cleanly separate the two in the
  legacy taxonomy beyond the one dedicated `BANK_FEES_INTEREST_CHARGE` value;
  everything else under `BANK_FEES` defaults to `FEE` (conservative).
- **Card payment leg asymmetry:** the credit-card account's incoming leg is
  expected to reliably carry `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` (Plaid knows
  the destination account type). The paying (checking) account's outgoing
  leg may instead carry a generic `TRANSFER_OUT_ACCOUNT_TRANSFER` — which
  resolves to `TRANSFER`, not `CARD_PAYMENT`, on that leg. This is accepted,
  not "fixed": each leg is scored independently and honestly from its own
  Plaid signal; no cross-leg pairing exists yet (that's V1.5's paired-transfer
  work), and forcing symmetry here would mean inventing a signal that isn't
  there.
- **Currency-mismatch / sign-unknown pending rows:** still get a role
  computed; `pending_review` status and having a resolved `event_role` are
  orthogonal.
- **P2P payment apps (Venmo/Zelle/Cash App):** resolve to `TRANSFER` at
  MEDIUM confidence today (§1, Finding 2), not `P2P_PAYMENT` — a known,
  disclosed limitation, not a bug.

## 8. Tests

Same TDD-first shape as the sign-convention branch:

1. `src/lib/plaid/event-role.test.ts` (new) — one case per row of §3's table,
   plus the unresolved fallthrough cases (unrecognized primary, `LOAN_PAYMENTS`
   non-card-payment detaileds, null primary).
2. `adapter.test.ts` — a representative case per resolved role, proving
   `resolveEventRole`'s output lands on `PlaidNormalizedTxn.eventRole`
   unchanged by any other adapter logic (sign correction, category
   resolution, pending gating).
3. `land.test.ts` — one case proving `eventRole` is carried into the insert
   row (mirrors the existing `pendingReason` carry-through test).
4. `apply-sync.test.ts` — one case proving `eventRole` updates unconditionally
   on a `modified` event, including when the row is `userCategorized` (to
   prove it is *not* gated by that flag, unlike `categoryId`/`isTransfer`).
5. DB-integration: extend `tests/integration/plaid-sync-store.test.ts`'s
   existing insert/patch fixtures with `eventRole`, round-tripping through
   real (staging) Postgres — same pattern Task 4 of the sign-convention plan
   used, including the lesson learned there (verify any enum-adjacent SQL
   against the real schema; not applicable here since this column is plain
   `text`, but the DB-integration test is still the thing that would catch
   it if it were).

## 9. Open questions / explicitly deferred

- **PFCv2 opt-in** (`personal_finance_category_version: "v2"`) would unlock a
  real `P2P_PAYMENT` signal and a few other refinements (interest vs.
  cash-advance-fee distinctions that don't matter yet, wire/crypto detailed
  values). Not part of this task — it's a Plaid-integration behavior change
  that also affects `category-map.ts` (pinned to the legacy taxonomy) and
  deserves its own review, not a silent bundle-in.
- A "Fees & Interest" standard category (so `FEE`/`INTEREST` rows have
  somewhere to live in the categorization UI) is a reasonable follow-up but
  is categories/UI scope, not Event Role itself — not included here.
- Whether/how `event_role` eventually becomes user-correctable (an
  `eventRoleUserSet`-style flag mirroring `userCategorized`) is a Budget
  Effect / later-phase question, out of scope for this task.
