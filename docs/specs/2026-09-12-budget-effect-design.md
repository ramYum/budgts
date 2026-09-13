# Budget Effect — Design

Status: proposed, pending review. No implementation yet.
Scope: **Budget Effect only.** Not in scope: Money Left, Savings Rate,
Savings Insights, any UI, any `qualify.ts` wiring, any Event Role change.

Predecessor: Event Role, frozen at `697b673` on the local `event-role`
branch. This design reads that work but does not modify it.

Pipeline position (per North Star doc §1, refined against the real,
now-shipped Event Role code):

```
raw Plaid amount
  → sign convention           DONE (sign-convention branch)
  → direction                  DONE
  → category                   DONE (unchanged)
  → event role                 DONE (event-role branch)
  → budget effect               THIS DESIGN
  → (separate, later work) qualify.ts wiring, Money Left, Savings Rate   NOT THIS TASK
```

## 1. The central decision: not persisted

The North Star doc already called this correctly (§4: "Budget effect
(derived, never stored)"), and this design keeps it. `budgetEffectOf` is a
pure function of two values already sitting on every transaction —
`event_role` and `direction` — with no external evidence, no Plaid
signal, no per-user state. Computing it on read means it can never drift
out of sync with the `event_role` it's derived from.

This also directly answers the diligence Event Role's own review earned:
Event Role's `sync-store.ts` gap existed because a *persisted* field had to
be carried through four hand-enumeration boundaries
(`adapter.ts → land.ts → apply-sync.ts → sync-store.ts`), and one of them
was missed. The strongest way to apply that lesson here is not "audit the
boundaries more carefully" — it's **not creating a boundary that nothing
requires**. A value with zero storage benefit that gets persisted anyway
only manufactures a new place for exactly that class of bug to recur later
(e.g. if `event_role` or `direction` is ever corrected after the fact, a
stored `budget_effect` would silently go stale unless something remembers
to recompute it — a derived function can't go stale by construction).

**Consequence:** this phase adds no schema column, no migration, no
staging deployment step, and touches none of `adapter.ts`, `land.ts`,
`apply-sync.ts`, or `sync-store.ts`. It is a single new pure function plus
its tests. If a concrete future need for SQL-level querying on
`budget_effect` emerges, that's a deliberate, separately-reviewed decision
to persist it — not a default.

## 2. The model

```ts
// src/lib/budget/types.ts — alongside the existing Direction/CategoryKind:
export type BudgetEffect = "EXPENSE" | "INCOME" | "EXPENSE_REVERSAL" | "NONE" | "UNKNOWN";
```

`null` return = "no effect judgment yet" (unresolved `event_role`) —
distinct from `"UNKNOWN"`, which means "the role IS resolved, and its
effect must be decided by a human" (currently only `ADJUSTMENT`). Keeping
these separate matters: conflating them would make `UNKNOWN` mean two
different things depending on context, exactly the kind of ambiguity this
project's "unresolved = null, never guess" discipline exists to prevent.

## 3. Resolution table

Evaluated as: `budgetEffectOf(eventRole: EventRole | null, direction: Direction): BudgetEffect | null`

| `event_role` | `budget_effect` | Reachable in V1? | Reasoning |
|---|---|---|---|
| `null` | `null` | Yes — common | No role resolved yet; no effect judgment to make. **This is this design's one deliberate departure from the North Star doc's literal text**, which said null falls back to "today's `category.kind` + `direction` derivation" — that fallback mechanism isn't real code, and wiring it in now would be scope creep into `qualify.ts` integration. Returning `null` keeps the "unresolved = null" convention consistent and keeps `UNKNOWN` meaning exactly one thing. |
| `PURCHASE` | `EXPENSE` | Yes | Money leaving the user for a purchase. |
| `REFUND` | `EXPENSE_REVERSAL` | Yes | Distinct from `EXPENSE` — preserved as its own label so a future netting calculation (Money Left: "spend net of reversals") can consume it without re-deriving anything. Not collapsed into `EXPENSE` now. |
| `INCOME` | `INCOME` | Yes | Money arriving for the user. |
| `CARD_PAYMENT` | `NONE` | Yes | The underlying purchases were already counted as `EXPENSE` when charged to the card; counting the payment too would double-count the same spend. |
| `TRANSFER` | `NONE` | Yes | Money moving between the user's own accounts nets to zero economically. |
| `FEE` | `EXPENSE` | Yes | A real cost to the user. |
| `INTEREST` | `EXPENSE` | Yes — **explicitly settled, not left open** | Interest is a real, unavoidable cost reducing the user's money, structurally identical to `FEE` in effect. `FEE` and `INTEREST` remain distinct **roles** (for a future debt/interest-tracking insight that needs to tell them apart) while sharing this effect today — the same pattern `CARD_PAYMENT`/`TRANSFER` already established. **V1 invariant:** this mapping is correct only because the Event Role resolver (`event-role.ts` Row 3) assigns `INTEREST` exclusively from interest *charged* (`BANK_FEES_INTEREST_CHARGE`), never interest *earned* — an earned-interest signal would need `INCOME`, not `EXPENSE`. Undocumented cross-file coupling, not re-derived here; see the resolver's own comment. |
| `P2P_PAYMENT`, `direction: "debit"` | `EXPENSE` | **No** — V1's Event Role resolver never assigns `P2P_PAYMENT` (its only reliable Plaid signal is PFCv2-only, not available in this app's current integration — see the Event Role spec §1). Specified here for forward-compatibility only. | Outgoing P2P payment, product-safe default: count it as spend rather than risk understating. |
| `P2P_PAYMENT`, `direction: "credit"` | `INCOME` | Same as above — unreachable today | Incoming P2P payment. |
| `CASH_ADVANCE` | `NONE` | **No** — Event Role never auto-assigns this role in V1 either | The liability increases, but the eventual spend is as invisible to Budgts as an ATM withdrawal — recorded as an event, not guessed as an expense. |
| `ADJUSTMENT` | `UNKNOWN` | **No** — Event Role never auto-assigns this role | Never guessed; routes to human review once a review workflow exists. This is the only role that ever produces `UNKNOWN`. |

`direction` is only consulted for `P2P_PAYMENT` — every other row's effect
is a pure function of `event_role` alone. Since `P2P_PAYMENT` is currently
unreachable, no code path exercised by real V1 traffic today actually
depends on `direction`'s value; this is proven by a test (§7), not just
asserted.

## 4. Pending/review interaction

`budgetEffectOf` takes no `status` or `pending_reason` input at all — it
answers **"what kind of event is this,"** never **"does it count right
now."** That split is exactly the distinction the product intends across
this whole pipeline (sign convention → direction → event role → budget
effect → money left), and gating on `status` remains `qualify.ts`'s job
alone, entirely untouched by this design. This mirrors Event Role's own
invariant of computing unconditionally regardless of pending state — a
`pending_review` row still has a well-defined `budget_effect` the moment
someone asks for it; whether that row currently counts toward any total is
a separate question this function does not answer.

## 5. Affected files

| File | Change |
|---|---|
| `src/lib/budget/types.ts` | add `BudgetEffect` type, alongside the existing `Direction`/`CategoryKind` |
| `src/lib/budget/budget-effect.ts` (new) | pure function `budgetEffectOf(eventRole, direction)`, the table above |
| `src/lib/budget/budget-effect.test.ts` (new) | one case per table row |

That is the complete file list. No schema file, no migration, no
`adapter.ts`/`land.ts`/`apply-sync.ts`/`sync-store.ts` change, no
`qualify.ts` change, no UI file, no `AccountMapEntry`/`NormalizeCtx`
change.

**On the "identify every persistence hand-enumeration boundary" instruction
directly:** there are none to identify, because nothing here is persisted
(§1). The self-review step in the implementation plan makes this an
explicit checked claim, not an assumption — confirming grep-clean that no
schema file, no `land.ts`, no `apply-sync.ts`, and no `sync-store.ts` are
touched by this branch's diff at all.

## 6. Invariants

- Never guesses: every input either produces one of the four real
  effects, `UNKNOWN` (only for `ADJUSTMENT`), or `null` (only for an
  unresolved role).
- Purely functional: no I/O, no database access, no per-user state, no
  randomness — same input always produces the same output.
- Not persisted, not backfilled, not wired into any total (§1, §5).
- Does not read or require `status`/`pending_reason` (§4).
- Does not require account type — every row's effect is determined by
  `event_role` (+ `direction` for the one still-unreachable case),
  matching Event Role's own precedent of not threading account type
  unless evidence demonstrates it's necessary. No evidence does here.
- `CARD_PAYMENT` and `TRANSFER` remain distinct **roles** despite sharing
  an effect, and `FEE`/`INTEREST` likewise — collapsing them at the role
  level would destroy information a future debt-tracking or
  interest-insight feature needs; only their current *effect* is shared.
- Does not modify `qualify.ts`, `duplicate_of_id`, `sign-convention.ts`,
  or any Event Role file. Read-only with respect to all of them.

## 7. Edge cases

- **`P2P_PAYMENT`/`CASH_ADVANCE`/`ADJUSTMENT` are unreachable in V1
  traffic today** — specified anyway, so Event Role's eventual resolution
  of them (a future, separately-scoped change) doesn't also require a
  Budget Effect change in lockstep. Tests cover them despite being
  currently dead code paths from production's perspective — this is
  intentional forward-compatibility, not untested speculation.
- **`direction` is irrelevant for every currently-reachable role** — a
  test proves this explicitly (flip `direction` for a non-`P2P_PAYMENT`
  role, assert the effect is unchanged), so a future edit can't
  accidentally make some other row direction-sensitive without a test
  catching the behavior change.
- **A `null` `event_role` never becomes `UNKNOWN`** — the two are kept
  distinct on purpose (§2); a test proves `budgetEffectOf(null, ...)` is
  `null`, never `"UNKNOWN"`.
- **`REFUND` never collapses into `EXPENSE`** — tested explicitly, since a
  future maintainer skimming the four "real" effects might reasonably
  wonder why a refund isn't just negative spend; the answer is that the
  distinction is deliberately preserved for the netting math this phase
  does not implement.

## 8. Tests

One deterministic unit test file, `src/lib/budget/budget-effect.test.ts`,
TDD-first:

1. `PURCHASE` → `EXPENSE`
2. `REFUND` → `EXPENSE_REVERSAL` (not `EXPENSE` — explicit negative-space assertion)
3. `INCOME` → `INCOME`
4. `CARD_PAYMENT` → `NONE`
5. `TRANSFER` → `NONE`
6. `FEE` → `EXPENSE`
7. `INTEREST` → `EXPENSE`
8. `P2P_PAYMENT`, `direction: "debit"` → `EXPENSE`
9. `P2P_PAYMENT`, `direction: "credit"` → `INCOME`
10. `CASH_ADVANCE` → `NONE`
11. `ADJUSTMENT` → `UNKNOWN`
12. `null` → `null` (not `"UNKNOWN"` — explicit negative-space assertion, §2)
13. `direction`-irrelevance: `PURCHASE` with `direction: "credit"` (an
    unrealistic-but-type-valid input) still returns `EXPENSE`, proving no
    role but `P2P_PAYMENT` is direction-sensitive

## 9. Explicitly deferred / open questions

- Wiring `budgetEffectOf` into `qualify.ts`'s `countsForMonth` (per North
  Star §5's sketch) is the next, separate, later task — not this one.
- The `category.kind` + `direction` fallback North Star originally
  proposed for `null`-role transactions (manual/email/receipt-sourced
  rows, which never get an `event_role`) is not designed here — it's a
  `qualify.ts`-integration-time question, not a `budgetEffectOf` question.
- Whether `budget_effect` ever needs to be persisted for a concrete
  querying reason is left to whoever picks up the `qualify.ts` wiring —
  nothing in this phase's scope creates that need.
