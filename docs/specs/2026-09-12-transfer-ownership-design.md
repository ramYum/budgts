# Machine Event Role vs. User-Owned Transfer Intent — Design

Status: proposed, pending review. No implementation yet.
Scope: **Resolving the ownership/precedence conflict between a
user-edited `is_transfer` and a machine-derived `event_role`, found by the
`qualify-integration` branch's final whole-branch review.** Not in scope:
Money Left, Savings Rate, any UI beyond the query/mapping site this needs
to touch anyway, `rollup.ts`'s bucket-assignment gap (still deferred), or
the separate, pre-existing bug this investigation surfaced but did not
create (§7).

This branch continues from `qualify-integration`'s tip (`c460d53`), not
yet merged/finished — that branch's Critical finding is accepted as real
and is what this design resolves. Event Role (`697b673`) and Budget
Effect (`5d98a74`) remain frozen and unmodified.

## 1. The discovery, restated precisely

`qualify-integration`'s spec §3 claimed `is_transfer` and a resolved
`event_role` "apply to disjoint sets of rows in V1... so there is no
conflict case to arbitrate." That claim was checked against the ingest
pipeline only. It is false against the transaction **edit** path:

- `src/components/transaction-form.tsx:143` — every transaction (Plaid or
  manual) has an editable checkbox: *"Transfer between my own accounts
  (excluded from spend & income)."* No restriction by source.
- `src/server/transactions.ts:75-88` (`updateTransaction`) — writes
  `is_transfer` from that checkbox on any transaction by id, with no
  `source = 'bank'` guard and no interaction with `event_role` at all.

Once `event_role` resolves, `countsForMonth` never reads `is_transfer` —
so a user's explicit, UI-promised transfer decision on a role-resolved row
is now silently ignored. This is real and accepted; this design fixes it.

## 2. The complete lifecycle, traced against the actual code (not assumed)

```
transaction edit UI (transaction-form.tsx)
        │  user checks/unchecks "Transfer between my own accounts"
        ▼
updateTransaction (transactions.ts:62-96)
        │  blind .update({ ..., is_transfer: n.isTransfer })
        │  does NOT touch user_categorized at all — confirmed by reading
        │  the full function; no code path in transactions.ts ever writes
        │  that column
        ▼
transactions.is_transfer, transactions.event_role (both in the DB now)
        │
        │  ... time passes, a Plaid webhook triggers another sync ...
        ▼
Plaid sync → adapter.ts (frozen, event-role branch)
        │  recomputes isTransfer + eventRole fresh from Plaid's PFC
        │  fields, with NO knowledge of the DB row or any prior user edit
        ▼
apply-sync.ts's patchFrom (frozen, sign-convention branch's own code,
never revisited since)
        │  if (!ex?.userCategorized) { p.categoryId = ...; p.isTransfer = n.isTransfer; }
        │  eventRole: n.eventRole   — UNCONDITIONAL, not gated by anything
        ▼
sync-store.ts's patchToSet → real Postgres UPDATE
        ▼
countsForMonth (qualify.ts, qualify-integration branch)
        │  if (eventRole != null) → budgetEffectOf(...) decides, is_transfer ignored
        ▼
downstream totals (rollup.ts, actuals.ts, dashboard.ts) — unaffected by
this design; they only ever see countsForMonth's answer
```

**Two independent breaks exist on this path, not one:**

**Break A — `apply-sync.ts`'s existing protection is gated by the wrong
flag.** `userCategorized` is set in exactly one place today,
`src/server/plaid/actions.ts:213` (the "categorize a transaction"
quick-action) — never by `updateTransaction`. So today, editing the
transfer checkbox through the general edit form sets `userCategorized`
nowhere, which means `apply-sync.ts`'s own `if (!ex?.userCategorized)`
guard does **not** protect a user's `is_transfer` edit from the very next
sync — the sync will silently overwrite `is_transfer` back to whatever
the adapter freshly computes, with or without this design. **This is real
today, independent of `qualify-integration`** — a genuinely separate,
pre-existing bug (§7), but it directly determines whether any fix to
`qualify.ts` alone can actually work, which is why it surfaces here.

**Break B — even if `is_transfer` survived a sync, `event_role` still
wins in `qualify.ts` once resolved.** `apply-sync.ts` writes
`eventRole: n.eventRole` unconditionally on every `modified` event,
regardless of any user action. So even a hypothetical fix that made
`is_transfer` sync-durable would not by itself change `countsForMonth`'s
answer, because the `eventRole != null` branch is checked first and never
looks at `is_transfer` at all.

**Proof that "just clear `event_role` on edit" fails (the user's specific
ask to verify, not assume):** suppose `updateTransaction` set
`event_role = null` whenever `is_transfer` changes. Trace it: the next
sync's `adapter.ts` recomputes `eventRole` fresh from Plaid's own PFC
fields (it has no idea the DB value was deliberately cleared), and
`apply-sync.ts`'s `patchFrom` writes that fresh value back unconditionally
(Break B, restated). The clear is undone by the very next sync. **A
one-time clear does not survive a sync; only a persistent signal that
apply-sync.ts respects can.**

## 3. Approaches compared

**(a) A dedicated user-owned transfer-override signal (new column).**
Cleanest separation of concerns — a signal that means exactly "the user
explicitly decided this row's transfer status," nothing else. Cost: one
new column, one new migration, a small hand-enumeration boundary (§6) —
but a much smaller one than Event Role's four-boundary problem, because
this field is user-domain-only and the ingestion pipeline never writes it.

**(b) `is_transfer` precedence directly in `countsForMonth`** (the
approach the user explicitly flagged as insufficient going in, and this
investigation confirms why): `if (txn.isTransfer) return false;` before
the role branch handles the "user marks transfer" direction, but has no
way to handle "user unmarks transfer on a machine-`TRANSFER` row" — a
bare `false` `is_transfer` is indistinguishable from "never explicitly
set, still the adapter's default `false`." Rejected on its own; the
"explicit decision" bit is exactly what's missing, which is what (a)
supplies.

**(c) Clearing/recomputing `event_role`.** Proven insufficient in §2 — it
doesn't survive a sync because `apply-sync.ts` writes `event_role`
unconditionally. Reusing this approach would additionally require gating
`event_role`'s own sync-write on the same durable signal (a) already
needs — at which point (a) is doing the real work and the clearing step
adds nothing beyond it. Rejected as redundant with (a), not as wrong.

**(d) Reusing the existing `userCategorized` flag** (the first synthesis
this design considered, and rejected after tracing a concrete failure):
if `updateTransaction` set `userCategorized = true` on *any* save (to
piggyback on `apply-sync.ts`'s existing guard), a user categorizing an
unrelated `CARD_PAYMENT` row via the *separate* quick-action
(`actions.ts`) would also set `userCategorized = true` — and a
`countsForMonth` check keyed to that same flag would then read
`!isTransfer` (`false`, the adapter's untouched default for a card
payment) as `true`, **reintroducing the exact double-counting bug
`qualify-integration` exists to fix**, for any `CARD_PAYMENT` row a user
happens to categorize. `userCategorized` conflates two different user
decisions (category vs. transfer-status) that must stay independent.
Rejected — this is why (a) is a genuinely new, narrowly-scoped signal, not
a reuse of the existing one.

**Recommendation: (a).** A new, narrowly-scoped boolean specifically for
"the user explicitly set `is_transfer` to a value that disagrees with
what's currently stored" — set only by `updateTransaction`, on real
change, never by the categorize quick-action, never by sync.

## 4. The design

**Schema — one new column, following the `pending_reason`/`event_role`
precedent exactly** (nullable-equivalent via a `false` default, no enum):
```ts
// src/lib/db/schema.ts, transactions table:
transferUserSet: boolean("transfer_user_set").notNull().default(false),
// true only when the user explicitly set is_transfer to a value that
// differed from what was currently stored — never set by sync or by the
// categorize quick-action. qualify.ts treats this as an override that
// outranks any machine-derived event_role. design: 2026-09-12
// transfer-ownership §4.
```

**`updateTransaction` (`src/server/transactions.ts`) — change-detected
write, verified against the actual client's real capabilities.** Three
mechanisms were considered, not assumed:

- **A single UPDATE with a `CASE` expression comparing old vs. new**
  (this design's first draft) — **not achievable.** `transactions.ts` uses
  the Supabase-js client (PostgREST over HTTP): `.update({...})` sends a
  JSON body of literal column values, with no way to express a
  server-side comparison against the row's current value. This is a
  different client entirely from `sync-store.ts`'s Drizzle-over-direct-
  Postgres connection, which *can* express raw SQL (`sql\`...\``) — that
  capability is not available here.
- **A Postgres trigger** (`BEFORE UPDATE`, setting `transfer_user_set`
  when `OLD.is_transfer IS DISTINCT FROM NEW.is_transfer`) — this
  codebase does have an established trigger convention
  (`handle_new_user()`, `supabase/migrations/0000_noisy_hannibal_king.sql`),
  so this isn't a new pattern class. But it's **rejected for lack of
  verification, not for elegance**: `sync-store.ts` writes `is_transfer`
  too, over a different connection than the RLS-scoped client
  (`sync-store.ts`'s own docstring: "the webhook / cron / sync path runs
  as the DB role, RLS-bypassed"). A bare OLD-vs-NEW trigger cannot
  distinguish a sync-driven `is_transfer` change from a user-driven one —
  it would very plausibly set `transfer_user_set = true` on a legitimate
  sync update, reintroducing this exact bug class one layer lower, where
  it's harder to catch. Confirming the two write paths run under
  distinguishably different Postgres roles would require infrastructure
  access beyond what this design could verify from the repository alone.
  Not recommended without that verification.
- **An RPC/Postgres function called via `.rpc()`** — would work, but
  `grep -rn "\.rpc(" src/` returns zero matches anywhere in this
  application. This would be a genuinely new persistence pattern, not an
  application of an existing one — exactly the "unplanned persistence
  artifact" this design should not introduce for one column.

**Revised recommendation: an optimistic conditional update, genuinely
atomic — not a read-then-write with an acknowledged race.** The prior
draft of this section called a plain read-then-write "self-correcting."
It is not: trace the actual failure sequence — (1) read `is_transfer =
false`; (2) user submits `false` (no change observed); (3) *before* the
write lands, a Plaid sync flips the stored value to `true`; (4) the
write proceeds anyway, since the code already decided "no change" back
in step 2, silently reverting the sync's value back to `false` **and**
leaving `transfer_user_set = false`, so the next sync is free to overwrite
it again. The user's edit and the sync's edit both vanish, silently, and
nothing about that self-corrects — a plain read-then-write must not be
described as safe.

The actual fix needs no new infrastructure — Supabase-js already supports
what's needed, and this exact file already uses half of it:

1. Read the row's current `is_transfer` (call it `observed`) — same RLS-
   scoped read as before.
2. Issue the update with an **additional filter matching `observed`**:
   `.update({...}).eq("id", id).eq("is_transfer", observed).select("id")`
   — a second `.eq()` is standard PostgREST, not a raw SQL expression;
   nothing about this needs a `CASE`, an RPC, or a trigger.
3. `updateTransaction` **already** checks the returned row count today
   (`if (!data?.length) return { error: MISSING_ROW };`, for the
   RLS-hides-other-users'-rows case) — extend that same check: an empty
   result now means one of two things, and they must be told apart, not
   collapsed into one generic error:
   - the row genuinely doesn't exist / isn't the caller's (today's
     `MISSING_ROW` case), **or**
   - `is_transfer` changed between the read and the write — a genuine
     optimistic-concurrency conflict, not a missing row.
4. On the second case: re-read the row's current `is_transfer`, and retry
   once against the freshly-observed value (recomputing whether
   `transfer_user_set` should be set, against the *new* observed value,
   not the stale one). If the retry also finds zero rows affected, stop —
   do not loop indefinitely — and surface a "this transaction changed
   while you were editing it, try again" error to the user, rather than
   silently applying a decision made against stale data.

This is genuinely atomic for the property that matters: the write only
succeeds if `is_transfer` is still what the user observed when they
decided whether to change it, and a change slipped in underneath the edit
is detected and resolved deliberately, never silently overwritten in
either direction. Zero new infrastructure — reuses this file's own
existing "check the row count" pattern one field further. This is the
**only** place `transfer_user_set` ever becomes `true` — mirroring how
`userCategorized` has exactly one clear setter today.

Change-detection specifically (not "any save touches this row") is what
prevents Approach (d)'s failure mode: editing an unrelated field (note,
description, amount) never sets `transfer_user_set`, so it can never
accidentally override a `CARD_PAYMENT` row's correct exclusion.

**`apply-sync.ts`'s `patchFrom` — one condition widened, not `event_role`
touched.** `is_transfer`'s existing sync-protection needs to also respect
this new signal, independent of `userCategorized`:
```ts
// current:
if (!ex?.userCategorized) {
  p.categoryId = n.categoryId;
  p.isTransfer = n.isTransfer;
}
// proposed:
if (!ex?.userCategorized) {
  p.categoryId = n.categoryId;
}
if (!ex?.userCategorized && !ex?.transferUserSet) {
  p.isTransfer = n.isTransfer;
}
```
`categoryId`'s protection is untouched (still solely `userCategorized`-
gated — out of scope, a separate concern). `eventRole`'s handling is
**not** changed and stays unconditional — because `qualify.ts`'s new
top-level check (below) bypasses `event_role` entirely for
`transferUserSet` rows, a stale-vs-fresh `event_role` sitting in the DB
next to a user-overridden `is_transfer` has no observable effect on any
current consumer (confirmed: only `qualify.ts` reads `event_role` today).

**`ex.transferUserSet` must actually be the real persisted value —
verified as a three-file chain, not assumed to work because the
TypeScript field exists.** This design's first draft claimed
`apply-sync.ts` alone was sufficient. Tracing the real existing-row
loading path (the same lesson Event Role's `sync-store.ts` gap already
taught, applied a second time — and this time it would have bitten twice
if not caught here) shows `is_transfer`/`user_categorized` are threaded
through **four** points before they ever reach `patchFrom`, and
`transfer_user_set` needs the same four:

```
Postgres transactions.transfer_user_set
        ↓
sync-store.ts's findBySourceRefs — .select({...}) (currently omits it, line ~78)
        ↓
sync-store.ts's return mapping — the .map((r) => ({...})) (currently omits it, line ~101)
        ↓
sync-engine.ts's PlaidTxnRow interface (currently omits it)
        ↓
sync-engine.ts's runSync — the existing Map's object literal (currently omits it)
        ↓
apply-sync.ts's ExistingPlaidRow (already covered above)
```

Without all four upstream additions, `ex.transferUserSet` is `undefined`
at runtime for every real sync — `!ex?.transferUserSet` in the widened
`patchFrom` condition above would then always be `true` (since
`undefined` is falsy), silently defeating the whole fix while every unit
test that hand-constructs an `ExistingPlaidRow` object literal (as
`apply-sync.test.ts` does) continues to pass, because those tests never
exercise the real loading path at all. This is exactly the shape of gap a
DB-integration test — not a unit test — is needed to catch, matching the
precedent set by Event Role's own `sync-store.ts` fix.

`sync-engine.ts`'s `PlaidSyncStore` interface itself (the
`findBySourceRefs` method signature) does not need to change — only the
shape it returns (`PlaidTxnRow`) does.

**`countsForMonth` (`src/lib/budget/qualify.ts`) — one new branch, above
the role branch:**
```ts
export function countsForMonth(txn: BudgetTxn, month: MonthKey): boolean {
  if (monthKey(txn.occurredAt) !== month) return false;
  if (txn.status !== "confirmed") return false;
  if (txn.duplicateOfId != null) return false;

  if (txn.transferUserSet) return !txn.isTransfer;   // NEW — explicit user decision outranks any role

  if (txn.eventRole != null) {
    const effect = budgetEffectOf(txn.eventRole, txn.direction);
    return effect === "EXPENSE" || effect === "EXPENSE_REVERSAL" || effect === "INCOME";
  }
  return !txn.isTransfer;
}
```
The month/status/duplicate gates keep absolute precedence over
everything, including a user's transfer decision — matching the already-
reviewed invariant that a `pending_review` or confirmed-duplicate row
never qualifies regardless of any other signal.

**`BudgetTxn` (`src/lib/budget/types.ts`) gains one field:**
```ts
transferUserSet: boolean;
```

## 5. Both directions, traced end to end against this design

**User marks a machine-`PURCHASE`/`INCOME` row as a transfer:** stored
`is_transfer` (say `false`) differs from submitted `true` →
`updateTransaction` sets `is_transfer=true, transfer_user_set=true`. Next
sync: `apply-sync.ts`'s widened guard sees `transferUserSet=true` on the
existing row → does not overwrite `is_transfer` → it survives. `eventRole`
still refreshes freely (irrelevant now). `countsForMonth`: `transferUserSet`
branch fires first → `!isTransfer` → `!true` → `false` → **excluded,
durably, across syncs.**

**User unmarks a machine-`TRANSFER` row (stored `is_transfer=true`) as
NOT a transfer:** submitted `false` differs from stored `true` → same
path → `is_transfer=false, transfer_user_set=true` → survives sync (guard
widened) → `countsForMonth`: `!false` → `true` → **counts, durably,
respecting the correction.**

**User categorizes an unedited `CARD_PAYMENT` row via the quick-action
(unrelated to transfer status):** `userCategorized=true`,
`transferUserSet` stays `false` (never touched — the quick-action never
writes it) → `countsForMonth`'s new branch does not fire → falls through
to the `eventRole` branch → `CARD_PAYMENT → NONE` → **still excluded,
exactly as `qualify-integration` intended.** This is the specific failure
mode Approach (d) had and this design does not.

**User edits only the note/description on a `CARD_PAYMENT` row:**
submitted `is_transfer` equals stored `is_transfer` (both `false`, since
card payments aren't flagged as transfers by the adapter) → no change
detected → `transfer_user_set` stays `false` → falls through to the role
branch → **still excluded.** Confirms Approach (d)'s regression risk does
not reappear here.

## 6. Persistence hand-enumeration boundaries — checked up front

Applying the lesson from Event Role's `sync-store.ts` gap once more,
before writing a task list:

- **`land.ts` (insert path): no change needed.** `transfer_user_set` is a
  user-edit-only concept; a brand-new Plaid-sourced row should always
  start at the column's own default (`false`), and `PlaidTxnInsert`
  should **not** include it — the adapter has no basis to ever set it.
- **`sync-store.ts`'s `patchToSet` (write path): no change needed.**
  `TxnPatch` (from `apply-sync.ts`) never includes `transferUserSet` as a
  field to write — a sync never sets this column, only `updateTransaction`
  does.
- **`sync-store.ts`'s `findBySourceRefs` (read path): DOES need a
  change** — this was wrong in this design's first draft, caught before
  implementation rather than after. Add `transfer_user_set:
  transactions.transferUserSet` to the `.select({...})`, and
  `transfer_user_set: r.transfer_user_set` to the returned object literal
  (§4's traced chain).
- **`sync-engine.ts`: DOES need a change**, and wasn't in this design's
  first-draft file list at all. Add `transfer_user_set: boolean;` to
  `PlaidTxnRow`, and `transferUserSet: r.transfer_user_set,` to the
  `existing` Map's object literal inside `runSync`.
- **`apply-sync.ts`: one condition widened** (§4), reading
  `ex.transferUserSet` (now genuinely populated) — not writing it.
- **`page.tsx` (the one real `BudgetTxn` construction site, per
  `qualify-integration`'s own earlier enumeration): gains a third field.**
  Confirmed via `grep -rn "BudgetTxn\b" src/` there is still exactly one
  production construction site.
- **Every existing `BudgetTxn`-fixture test file** (`qualify.test.ts`,
  `rollup.test.ts`, `actuals.test.ts`, `dashboard.test.ts`) needs
  `transferUserSet: false` added to its default, same pattern as
  `eventRole: null` before it.

## 7. Finding #2 (unvalidated `event_role` boundary) — bundle or separate?

**Recommendation: bundle, as a clearly separate sub-task within the same
plan, not conflated with the ownership-model logic.** The final review's
Finding #2 (`page.tsx`'s Supabase query has no `Database` generic, so a
malformed `event_role` value would silently fall off `budgetEffectOf`'s
switch and drop the row from every total) touches the exact same 3-line
site this design is already re-opening to add `transferUserSet`. Fixing
it now avoids a third near-identical touch to the same spot in a future
branch. It is independently reviewable and droppable — if the reviewer or
the user prefers it split out, nothing else in this design depends on it.

## 8. A separate, pre-existing bug this investigation surfaced — explicitly out of scope

**The general edit form never sets `user_categorized`, for *either* field
it edits.** `updateTransaction` writes both `category_id` and
`is_transfer` without ever touching `user_categorized` — meaning today,
independent of anything in this design or `qualify-integration`, a user
who edits a transaction's **category** through the general edit form (not
the quick-action) has that edit silently overwritten by the next Plaid
sync too, because `apply-sync.ts`'s `userCategorized`-gate never engaged.
This is real, but it predates this whole multi-branch effort, is not
caused or worsened by anything here, and fixing it is a distinct decision
(should the general edit form also set `userCategorized` on a category
change, using the same change-detection principle as `transferUserSet`?)
that deserves its own review rather than being folded into a design about
transfer-specific ownership. Flagged for a future, separate corrective
task — not addressed here.

**A `CARD_PAYMENT`/`TRANSFER`/`CASH_ADVANCE` row cannot be forced to
*count* by unchecking "Transfer."** The checkbox represents "is a
transfer," not "should be excluded" — and these roles' stored
`is_transfer` is already `false` by default, so there is nothing to
change to represent "override this exclusion." This is a real, narrow
limitation, but it's a different product question (an explicit "force
this to count" affordance, which doesn't exist and wasn't asked for) than
the one this design was scoped to solve (mark/unmark "transfer between my
own accounts"). Noted as a deferred question, not a gap in this design's
stated goal.

## 9. Invariants

- `transfer_user_set` is set in exactly one place
  (`updateTransaction`), on real change only, never by sync, never by the
  categorize quick-action.
- Once `transferUserSet` is true, `is_transfer`'s value survives every
  future sync unchanged (Break A closed) — proven by tracing `apply-sync.ts`'s
  widened condition, not merely asserted.
- `countsForMonth`'s new branch is checked before the role branch and
  after the month/status/duplicate gates — an explicit user decision
  outranks any machine-derived role, but never bypasses the absolute
  gates.
- A row nobody has ever transfer-edited (`transferUserSet: false`, the
  overwhelming majority) behaves **exactly** as `qualify-integration`
  already specified and shipped — this design adds a precedence layer, it
  does not change any existing qualifying/excluding answer for an
  untouched row.
- `event_role` itself is never cleared, frozen, or specially protected by
  this design — only `qualify.ts`'s use of it is conditionally bypassed.
- No historical backfill of `transfer_user_set` — every existing row
  starts at the column's default (`false`), exactly as if no one had ever
  touched the checkbox, which is the truth for every row today.

## 10. Test matrix

**Schema/migration:** additive `transfer_user_set boolean not null default
false`, applied to staging via the same scoped-script method as every
prior migration in this sequence, verified directly (not migrated via
`db:migrate`).

**`apply-sync.test.ts` — new cases (unit-level, hand-constructed
`ExistingPlaidRow` — proves `patchFrom`'s own logic, not the loading path):**
1. `ex.transferUserSet: true`, a `modified` event carrying a different
   `isTransfer` from the adapter → patch does **not** include `isTransfer`
   (or includes the existing value, matching the `categoryId` omission
   pattern) — proves the widened guard.
2. `ex.transferUserSet: true`, `ex.userCategorized: false` → same proof,
   showing the two flags are independently sufficient, not both required.
3. `ex.transferUserSet: false`, `ex.userCategorized: false` → `isTransfer`
   updates as today (regression guard on the existing behavior).
4. `eventRole` still updates unconditionally regardless of
   `transferUserSet` — proves Break B's fix lives in `qualify.ts`, not by
   also freezing `eventRole`.

**DB-integration test (new, `tests/integration/plaid-sync-store.test.ts`)
— proves the real four-point loading chain, not just `patchFrom`'s
isolated logic:**
4a. Insert a bank-sourced row directly with `transfer_user_set = true` and
    `is_transfer = false`. Run a `modified` sync event through the real
    `createPlaidSyncStore` + `runSync` path (or the store's
    `findBySourceRefs` directly) carrying a different `isTransfer` from
    the adapter. Re-fetch the row from real Postgres and assert
    `is_transfer` is still `false` — the value the user set, not the
    machine's fresh one. This is the test that would have caught this
    design's first-draft gap: it fails if `sync-store.ts`'s select/map or
    `sync-engine.ts`'s `PlaidTxnRow`/existing-Map additions are missing or
    wrong, in a way no hand-constructed `ExistingPlaidRow` unit test can.

**`qualify.test.ts` — new cases:**
5. `transferUserSet: true, isTransfer: true, eventRole: "PURCHASE"` →
   `false` — user's mark-as-transfer wins over a qualifying role.
6. `transferUserSet: true, isTransfer: false, eventRole: "TRANSFER"` →
   `true` — user's unmark wins over an excluding role.
7. `transferUserSet: false, isTransfer: false, eventRole: "CARD_PAYMENT"`
   → `false` — untouched row, unaffected, still excluded (the regression
   guard for Approach (d)'s failure mode).
8. `transferUserSet: true` but `status: "pending_review"` → `false` — the
   absolute gates still outrank the user's transfer decision.
9. `transferUserSet: true` but `duplicateOfId: "x"` → `false` — same, for
   the duplicate gate.

**`transactions.test.ts`-equivalent (new or extended, for
`updateTransaction`) — new cases:**
10. Submitted `isTransfer` differs from stored → `transfer_user_set` set
    to `true` in the same write.
11. Submitted `isTransfer` equals stored (no change) → `transfer_user_set`
    remains untouched/unset — proves change-detection, not blanket
    setting, closing Approach (d)'s regression path directly at its source.
12. Editing an unrelated field (note/description) with `isTransfer`
    unchanged → `transfer_user_set` remains untouched.
13. **Optimistic-conflict path:** simulate `is_transfer` changing between
    the initial read and the write (e.g. update the row directly between
    the two calls in the test, mimicking a concurrent sync) → the
    conditional `.eq("is_transfer", observed)` write affects zero rows →
    the retry re-reads the new value, recomputes `transfer_user_set`
    against it, and succeeds on the second attempt with the *correct*
    (post-conflict) decision — not the stale one. This is the test that
    distinguishes genuine atomicity from the rejected "self-correcting"
    framing.
14. **Row genuinely missing** (today's existing `MISSING_ROW` case) still
    returns that error, not a conflict-retry — proving the two
    zero-rows-affected causes are correctly told apart.

## 11. Explicitly deferred questions

- §8's two items (the general edit form never setting `userCategorized`
  for category edits; no "force count a NONE-effect row" affordance).
- Whether `transferUserSet` should ever be exposed in the UI (e.g., a
  small "you marked this as a transfer" indicator) — a UI question, out
  of scope.
- The exact atomic-write mechanism for `updateTransaction`'s
  change-detection (single `CASE`-expression `UPDATE` vs. a transaction
  wrapping a read+write) — an implementation-plan-level decision, not
  settled here.
- Whether `rollup.ts`'s deferred bucket-assignment gap (from
  `qualify-integration`'s own spec §6) interacts with `transferUserSet` in
  any way once Money Left picks it up — worth a note there, not solved
  here.
