# Phase 15 — Confirmed Advancial remediation + future-ingestion defense design

Status: **design only — nothing in this document has been executed.** No
production row has been mutated, no migration written, no code changed.
Full per-cluster row-level manifest (real transaction IDs/amounts/descriptions)
is intentionally kept OUT of this git-tracked file — real bank data does not
belong in source control. It lives at, read-only:

```
<session scratchpad>/advancial-remediation-manifest.json
```

regenerable at any time by re-running the same read-only query against
production (item_id `geEP1Ebwy3S5xvqN0XY5Idr1bE8511CXb33Lq`).

## 0. What's confirmed, as of this design

- Advancial's own online banking shows **exactly one** DoorDash charge
  ($27.76) and **exactly one** YouTube Premium charge ($27.20) on
  2026-08-28. Plaid's `/transactions/sync` returned each as 50 separate
  `added` transactions, each with a distinct `transaction_id`, otherwise
  byte-identical.
- This is not an isolated incident: **267 distinct transaction clusters**
  across the 2 Advancial accounts show the same signature. 265 of 267 are
  **exactly 50 copies**; the remaining 2 sum to 50 across two partial
  batches (29 + 21, same transaction, same date, split by one field that
  changed mid-replay).
- No cluster's `occurredAt` is after 2026-08-28; the most recent transaction
  on the item overall is 2026-09-10, unaffected.
- Every duplicate is a distinct **posted** row (`pending = false`,
  `status = 'confirmed'`); none carry a `pending_transaction_id` link to
  each other. This rules out the one *legitimate* Plaid case where the same
  real event legitimately gets two Plaid-issued IDs (pending → posted).
- Content-fingerprint isolation check: of the 320 canonical (account,
  content) groups on this item, only 267 have size > 1. The other 53 are
  singular, real, one-off transactions — confirmed **zero overlap** between
  those 53 and the proposed non-counting set. The one `user_categorized`
  row on either account is one of those 53 singular transactions (a fresh,
  real Sept 4 charge) — it is untouched by anything below.

## Part A — Historical remediation design (read-only)

### A.1 — Scope of the confirmed corruption population

| | Checking (INBOUND USA CHECKING NON-DIV) | Visa (SIGNATURE VISA INBOUND) | Combined |
|---|---|---|---|
| Live rows today | 2,923 | 10,430 | **13,353** |
| Canonical (real) events | 82 | 238 | **320** |
| — of which duplicated (size > 1 cluster) | 59 | 208 | **267** |
| — of which already singular (untouched) | 23 | 30 | **53** |
| Proposed non-counting rows | 2,841 | 10,192 | **13,033** |

267 clusters + 13,033 excess rows + 53 untouched singular rows accounts for
all 13,353 live rows exactly — no row is unaccounted for.

### A.2 — Canonical-row selection rule

For each `(account_id, content_fingerprint)` cluster with size > 1:

1. If any member has `user_categorized = true`, that member is canonical
   (a human decision must never be discarded).
2. Otherwise, the member with the **earliest `created_at`** (the first copy
   Budgts ever landed) is canonical.
3. Every other member of the cluster becomes a **proposed non-counting
   duplicate** — never deleted, never merged, raw `raw` JSONB untouched.

Rule 1 exists defensively for future incidents; it does not change anything
for Advancial today — the current data has no cluster where this tie-break
matters (verified: the account's one `user_categorized` row sits in a
singular, non-duplicated cluster).

This is a **closed-set** rule: it runs once, against the exact 267 cluster
keys identified in the manifest, and produces an exact list of row IDs. It
is not a live query and not a general "N+ identical = duplicate" heuristic —
it never touches any row outside these two accounts or these 267 keys.

### A.3 — Proposed mechanism (no universal dedupe key, nothing deleted)

Add one nullable, self-referential column:

```
transactions.duplicate_of_id  uuid  references transactions(id)  on delete set null
```

- `NULL` (today's default for every row) — counts normally, exactly as now.
- Non-null — "a human-reviewed process determined this row is a confirmed
  duplicate posting of the row it points to." The row is **kept forever**,
  visible in transaction history/export, just excluded from budget math —
  the same treatment `is_transfer` already gets today, not a new concept.

`qualify.ts`'s `countsForMonth` gains one more condition:

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

That's the entire change to the financial math layer — `actuals.ts`,
`rollup.ts`, `dashboard.ts`, `budget-vs-actual.ts` need zero changes; they
already only see qualifying rows through `countsForMonth`.

The one-time remediation script (not written yet) would do nothing but:
`update transactions set duplicate_of_id = <canonical id> where id = any(<the exact 13,033 IDs from the manifest>)`.
No `DELETE`, no `UPDATE ... WHERE <condition>` — an explicit ID list, generated
by this report, reviewed by you before it is ever run.

### A.4 — Before / after, exactly

All figures are **all-time**, restricted to these two accounts (not
month-scoped — the corruption spans June–August 2026 across many months, so
an all-time total is the honest apples-to-apples comparison).

**Row counts**

| | Before | After | Removed from counting |
|---|---|---|---|
| Checking | 2,923 | 82 | 2,841 |
| Visa | 10,430 | 238 | 10,192 |
| **Combined** | **13,353** | **320** | **13,033** |

**Raw account totals, by direction (all live rows vs. canonical-only)**

| Account | Before credit | Before debit | After credit | After debit |
|---|---|---|---|---|
| Checking | $793,350.48 | $694,776.02 | $22,521.25 | $16,422.96 |
| Visa | $485,022.22 | $659,313.28 | $11,284.34 | $14,208.19 |

**"Spend" as the dashboard actually computes it** (`rollup.ts`: net
`debit − credit` over non-transfer, confirmed, non-income-category rows —
2,700 of the 13,300 corrupted-cluster rows are already `is_transfer = true`
and excluded even today; the other 10,600 are not):

| | Qualifying rows | Net spend contribution |
|---|---|---|
| Checking — before | 1,912 | **−$158,251.46** |
| Checking — after | 50 | **−$8,729.43** |
| Visa — before | 8,730 | **−$165,115.44** |
| Visa — after | 204 | **−$3,864.28** |
| **Combined — before** | **10,642** | **−$323,366.90** |
| **Combined — after** | **254** | **−$12,593.71** |

The negative sign itself is a symptom worth naming: because Plaid over-
counted large ACH *deposits* (categorized as expense/uncategorized, not
income-kind) more than it over-counted debits, this corruption doesn't just
inflate "spend" — for these two accounts today it makes the dashboard's
spend math go strongly negative, i.e. actively nonsensical, not just "too
big." After remediation it's still negative (real refund/transfer-heavy
activity on this item) but 25.7x smaller and plausible.

**Category totals contributed by these two accounts** (all directions, not
month-scoped; categories not touched by these accounts are unaffected and
not listed):

| Category | Before | After |
|---|---|---|
| Uncategorized | $2,473,493.40 (9,985 rows) | $60,476.70 (235 rows) |
| Food / Groceries | $59,345.25 | $1,570.33 |
| Insurances | $29,316.26 | $870.78 |
| Transportation | $29,249.59 | $697.78 |
| Housing | $14,888.00 | $297.76 |
| Entertainment | $9,954.50 | $199.09 |
| Personal Care | $16,215.00 | $324.30 |
| *(full per-category, per-direction table in the manifest)* | | |

**Income totals:** $0 before and after — none of the corrupted rows are
categorized as an income-kind category (they're expense-kind or, mostly,
uncategorized — 9,950 of the 13,300 corrupted-cluster rows were never
categorized at all, which is itself informative: nobody could plausibly
have hand-categorized 13,300 rows, so this was never reviewed by a human
until now).

**Confirmation of isolation:** the 13,033 proposed non-counting row IDs are
drawn exclusively from the 267 confirmed clusters on these two accounts.
Zero overlap with the 53 singular (real, unduplicated) transactions on the
same accounts, and by construction zero overlap with any other account —
the query never reads past the two `account_id`s under this Plaid Item.

## Part B — Future ingestion defense

### B.1 — What already exists (shipped, live, unrelated to this incident's execution)

Phase 14 (already deployed) computes a SHA-256 `content_fingerprint` over
every raw Plaid payload (minus `transaction_id`) at land time, and after
every sync, counts live rows per `(account, fingerprint)` — **cumulatively,
across every prior sync, not just the current batch** — and flags the
account (`needs_review`, visible banner + Settings detail) once any pair
reaches `ANOMALY_REVIEW_THRESHOLD = 10`.

Two things worth being precise about, since this incident is the first real
test of that design:

- It would have caught Advancial **at 10 copies, not 50** — a 5x smaller
  blast radius — had it been live when the replay happened. It wasn't
  deployed until after the fact, which is *why* this happened undetected.
- It correctly fires even if all 50 copies land in a single `/transactions/
  sync` page/response (the count is read from the DB *after* the insert,
  not accumulated in-memory across calls), so it is not a "wait for the
  next sync" mechanism with a gap — a single pathological batch is caught
  immediately.

**Known, honest limitation:** this is a *content*-fingerprint match. An
institution whose replay bug includes any per-copy-varying field (Advancial
itself did this for one transaction — the 29/21 split) produces a
different fingerprint per copy and would not accumulate toward the
threshold. This is a real blind spot, not a hypothetical one — we saw it
happen once already, just not badly enough to hide the incident (50/50 of
the *other* 265 clusters were still byte-identical).

### B.2 — The three states, restated precisely against the code that exists today

| State | Signal | Today's behavior |
|---|---|---|
| Normal independent transaction | fingerprint count for `(account, fp)` stays low | counts normally, no flag — unchanged |
| Established/proven duplicate relationship | Plaid's own `pending_transaction_id` links a posted row to a pending predecessor (`apply-sync.ts`, pre-existing V1 logic, not part of this design) | already auto-reconciled (category/note carried over); not part of the anomaly system at all |
| Pathological unresolved feed anomaly | fingerprint count ≥ 10 (Phase 14) | flagged, banner shown, **fully counted** — this is the gap |

The gap is real: "flagged" today never changes what `rollup.ts` computes.
An account can sit at `needs_review = true` for months while its numbers
stay exactly as wrong as they were the moment the flag was set.

### B.3 — What Part A's mechanism gives Part B, for free

`duplicate_of_id` (A.3) is not Advancial-specific — it's a generic,
reusable column and a one-line `qualify.ts` change. The **defense** for "if
Plaid does this again tomorrow" is:

1. Detection is automatic (already shipped): threshold flag fires within
   the sync that crosses 10 copies, for any account, any institution.
2. Containment is **never automatic** — it only happens through the exact
   same human-reviewed, closed-set process as Part A: pull a report like
   this one for the newly-flagged account, get institution-side ground
   truth if possible, and if confirmed, run a one-time `duplicate_of_id`
   update against an explicit ID list.
3. Until that review happens, the account stays exactly as it behaves
   today: visible, counted, loudly flagged. This is a deliberate, not
   accidental, design choice — it's the literal thing you approved in
   Phase 13 ("I would not silently hide the transactions from totals
   *unless/until* the owner confirms the correction"). Advancial has now
   crossed from "unless" to "until." Nothing about this changes how an
   unconfirmed, merely-suspected anomaly behaves.

This deliberately does **not** introduce a second, automatic dedup engine.
It reuses one column, one query change, and one manual script pattern for
every future confirmed incident — "detect automatically, contain only after
human review" is the whole rule, and it doesn't get more universal than
that no matter how many future institutions trigger it.

### B.4 — Optional hardening (not required for launch, flagged for completeness)

A volume-based secondary signal — "this sync inserted N% more rows for this
account than its trailing-30-day average" — would catch a replay that
varies content per copy (closing the B.1 blind spot) without ever claiming
to identify *which* transactions are duplicates. It would feed the exact
same three-state model (state 3: pathological, needs review) without any
content-identity claim at all. Worth a ticket; not blocking, since it
addresses a theoretical gap this incident didn't actually fall into badly
enough to hide it.

## Part C — Financial architecture interaction

Actual pipeline today, file by file:

```
Plaid /transactions/sync
        ↓
normalizePlaidTxn()          adapter.ts — skip checks, sign split (amount/
                              direction), transfer detection (PFC primary),
                              category resolution
        ↓
plaidToInsert()               land.ts — shapes the DB row, computes
                              content_fingerprint (Phase 14)
        ↓
applyPlan()                    sync-store.ts — INSERT inside a transaction.
                              *** row becomes a trusted, counted financial
                              event HERE, immediately ***
        ↓
runSync() anomaly check        sync-engine.ts — AFTER applyPlan commits,
                              queries cumulative fingerprint counts, flags
                              the account. Advisory only today (B.2's gap).
        ↓
countsForMonth() / rollup()    qualify.ts / actuals.ts / rollup.ts — reads
                              already-persisted rows; today has NO knowledge
                              of content_fingerprint or needs_review at all
        ↓
Dashboard tiles / budget-vs-actual / category spend / income / savings
```

**Direct answer to Part C's question:** no — as shipped today, duplicate
feed corruption is **not** resolved before spend/income/budgets/dashboard
are calculated. Detection runs *after* a row is already counted, and
nothing currently downstream ever checks `content_fingerprint` or
`needs_review`. The banner is a parallel warning, not a gate.

With A.3 + B.3's `duplicate_of_id` in place, the corrected pipeline for a
row that has been through confirmed, human-reviewed remediation becomes:

```
... applyPlan() → row persisted ...
        ↓
[one-time, human-approved] duplicate_of_id set on confirmed non-canonical rows
        ↓
countsForMonth()   ← NOW also checks duplicate_of_id IS NULL
        ↓
rollup() / actuals() / budget-vs-actual() / dashboard tiles
```

For any row that has been through this review, correction now happens
*before* every downstream calculation, by construction (a single query
condition every one of those functions already routes through) — not
because each of those five modules learned something new. For a row that
hasn't been reviewed yet (a fresh, unconfirmed flag), the pipeline
deliberately stays exactly as it is today: visible, counted, warned.

## Part D — Plaid escalation, finalized

Unchanged from the version already prepared with the institution-confirmed
ground truth (item `geEP1Ebwy3S5xvqN0XY5Idr1bE8511CXb33Lq`, Advancial
Federal Credit Union, 267 clusters, 265 at exactly 50 copies, 2 partial
clusters summing to 50, no cluster after 2026-08-28, no
`pending_transaction_id` relationship between copies, ground-truthed
against the institution's own online banking for the 8/28 DoorDash and
YouTube Premium charges). Ready to send as-is; the full ID lists for every
cluster (not just the two examples already given in chat) are in the
manifest file if Plaid's support form wants more than two examples.

## Recommendation

1. **Safest historical remediation:** the `duplicate_of_id` column (A.3),
   applied via a one-time script against the exact 13,033 row IDs in the
   manifest — never a live rule, never a deletion, fully reversible (set
   the column back to `NULL` for any row if a decision turns out wrong).
   I'd hold off *executing* it until Plaid responds, not because the
   remediation depends on their answer (it doesn't — the evidence is
   already conclusive), but because their root-cause answer may reveal
   whether more of this Item's *future* syncs need watching before you
   trust it's really over.

2. **Minimum future-ingestion protection required before launch:** ship
   the `duplicate_of_id` column + the one-line `qualify.ts` change now,
   even before executing it against Advancial. That's the actual missing
   piece — detection already exists and works; containment doesn't exist
   yet at all. Building it now, unused, costs nothing and means the next
   confirmed incident (Advancial or otherwise) has a tested lever instead
   of another multi-day design cycle.

3. **What should stay unresolved until Plaid responds:** whether to
   actually execute the remediation against Advancial, and whether to
   trust this Item's data going forward without extra scrutiny. Both
   accounts stay flagged, visible, and fully counted (as they are right
   now) until then — exactly per your standing instruction.

Stopping here per your instruction — no code, no migration, no production
change beyond what was already approved and executed before this message.
