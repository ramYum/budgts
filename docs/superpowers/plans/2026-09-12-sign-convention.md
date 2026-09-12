# Sign Convention Detection & Safe Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, per Plaid-connected account, whether its transaction feed
uses Plaid's documented sign convention (positive = outflow) or an inverted
one (a confirmed real-world defect on at least one institution), and never
let a transaction with an unverified sign affect any financial total.

**Architecture:** A new pure evidence-tally module classifies an account as
`unknown | standard | inverted` from a deterministic vote over transactions
whose Plaid category has a reliably-expected flow direction. While
`unknown`, every new transaction for that account lands as `pending_review`
(reusing the status value `adapter.ts` already uses for currency mismatches,
disambiguated by a new `pending_reason` column) so it contributes to zero
financial aggregates by construction, via the existing `countsForMonth`
choke point. Once enough evidence resolves the account one way or the
other, `runSync` finalizes every pending row for that account in one pass —
confirming it, and flipping `direction` too if the verdict was `inverted`.
An account that stays genuinely ambiguous past a larger sample size is
flagged via the existing `needs_review`/`review_reason` mechanism (already
rendered generically by `review-banner.tsx` — no UI work needed here).

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Vitest, existing Plaid
sync pipeline (`src/lib/plaid/*`).

**Spec:** `docs/specs/2026-09-12-north-star-architecture-design.md` (§2 Sign
convention, §5 the authoritative gate, §13 schema, §14 sequencing — this
plan implements the "sign convention" step of that sequencing, after the
already-completed `duplicate_of_id` containment work).

## Global Constraints

- Money is integer minor units end to end; never floats.
- Every schema change is additive: nullable, or has a safe default — no
  migration may risk existing rows or require backfilling non-null data.
- TDD: write the failing test before the implementation for every step that
  has one.
- `qualify.ts`'s `countsForMonth` and the `duplicate_of_id` containment
  mechanism (already shipped, commit `8a2b509`) must not be weakened —
  this plan only adds new *sources* of `pending_review`/`confirmed` state,
  never bypasses the existing gate.
- No automatic mutation of any transaction that has ever been `confirmed`
  before this feature runs — a new `unknown`-convention account only ever
  affects transactions landing *after* this ships, never rewrites history.
  Correcting already-confirmed historical rows for a confirmed-inverted
  account is an explicitly separate, later, human-approved workflow (same
  shape as the existing duplicate-transaction remediation) — out of scope
  for this plan.
- New accounts (including every account connected *before* this ships,
  since the new column's default applies to existing rows too) start at
  `sign_convention = 'unknown'`, never `'standard'` — defaulting to
  `'standard'` while detection is pending is the exact failure mode this
  feature exists to prevent.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` | New `plaid_sign_convention` enum + `plaid_accounts.sign_convention` column; new `transactions.pending_reason` column |
| `src/lib/plaid/sign-convention.ts` (new) | Pure evidence tally + classification — no I/O |
| `src/lib/plaid/sign-convention.test.ts` (new) | Unit tests for the above |
| `src/lib/plaid/types.ts` | `AccountMapEntry` gains `signConvention`; `PlaidNormalizedTxn` gains `pendingReason` |
| `src/lib/plaid/adapter.ts` | Corrects `direction` for `inverted` accounts; sets `pendingReason`/`status` for `unknown` accounts |
| `src/lib/plaid/adapter.test.ts` | New cases for the above; existing fixtures updated for the new required field |
| `src/lib/plaid/apply-sync.ts` | `TxnPatch`/`patchFrom` carry `pendingReason` through on the modified/pending→posted update path, mirroring `status` |
| `src/lib/plaid/apply-sync.test.ts` | Fixture updated for the new required field; new case proving `pendingReason` survives a modified-row update |
| `src/lib/plaid/land.ts` | `plaidToInsert` carries `pendingReason` through to the DB row |
| `src/lib/plaid/land.test.ts` | New case: `pendingReason` lands on the insert |
| `src/lib/plaid/sync-engine.ts` | `PlaidSyncStore` gains two methods; `runSync` gains a sign-resolution step after the existing anomaly-detection step |
| `src/lib/plaid/sync-engine.test.ts` | New cases for the resolution step; existing fixtures updated |
| `src/lib/plaid/sync-store.ts` | Implements the two new store methods |
| `tests/integration/_db.ts` | Shared DB-integration harness — `insertBankTxn` gains `status`/`pendingReason`/`direction` overrides |
| `tests/integration/plaid-sync-store.test.ts` | Existing `PlaidNormalizedTxn` fixture updated for the new required `pendingReason` field |
| `tests/integration/plaid-sign-convention-store.test.ts` (new) | DB-integration test proving the finalize UPDATE only touches the right rows |
| `src/lib/plaid/sync-item.ts` | `buildNormalizeCtx` selects `signConvention` and populates it on the account map |

---

### Task 1: Schema — `sign_convention` and `pending_reason`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: migration via `npm run db:generate` (do not hand-write SQL)

**Interfaces:**
- Produces: `plaidSignConvention` enum (`"unknown" | "standard" | "inverted"`), `plaidAccounts.signConvention` column (default `"unknown"`, not null), `transactions.pendingReason` column (nullable text)

- [ ] **Step 1: Add the enum and the two columns**

In `src/lib/db/schema.ts`, add the enum near the other `pgEnum` declarations (after `plaidAccountLinkState`, around line 40):

```ts
export const plaidSignConvention = pgEnum("plaid_sign_convention", [
  "unknown",
  "standard",
  "inverted",
]);
```

In the `plaidAccounts` table definition, add the column right after `reviewFlaggedAt` (around line 307):

```ts
    reviewFlaggedAt: timestamp("review_flagged_at", { withTimezone: true }),
    // Sign-convention detection (design: 2026-09-12 North Star Architecture
    // §2). Defaults to 'unknown' for every account, including pre-existing
    // ones — never 'standard'. While 'unknown', every new transaction for
    // this account lands as pending_review (see adapter.ts) rather than
    // assuming Plaid's documented sign convention holds. Finalized by
    // runSync once enough evidence resolves it one way or the other.
    signConvention: plaidSignConvention("sign_convention").notNull().default("unknown"),
```

In the `transactions` table definition, add the column right after `duplicateOfId`'s block (find the existing `duplicateOfId` field and add immediately after its closing `}),`):

```ts
    // Why this row is pending_review, if it is — disambiguates the reason so
    // a later resolution (e.g. sign-convention finalization) only touches
    // rows it's actually responsible for, never a different pending reason
    // (design: 2026-09-12 North Star Architecture §2). Null whenever status
    // is 'confirmed'.
    pendingReason: text("pending_reason"),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `supabase/migrations/0008_<generated-name>.sql` containing the `ALTER TABLE` statements for the enum type, the `plaid_accounts.sign_convention` column, and the `transactions.pending_reason` column, plus an updated `supabase/migrations/meta/_journal.json` and `meta/0008_snapshot.json`.

- [ ] **Step 3: Read the generated migration and confirm it's additive**

Open the generated `.sql` file. Confirm it contains only `CREATE TYPE`/`ALTER TABLE ... ADD COLUMN` statements — no `DROP`, no `NOT NULL` added to an existing column without a default, no data migration. If it contains anything else, stop and re-check the schema edit before proceeding.

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`
Expected: exits 0. Confirm with `npx drizzle-kit check` or by re-running `npm run typecheck` (Step 5) — a failed migration surfaces as a connection/apply error in the terminal output, not silently.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: FAILS at this point — `AccountMapEntry`/`PlaidNormalizedTxn` don't have the new fields yet, and no code reads/writes the new columns yet, so this step only proves the migration itself applied without breaking existing generated types. If it fails with anything other than "missing field" style errors from files this plan hasn't touched yet, stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts supabase/migrations/
git commit -m "feat(plaid): add sign_convention and pending_reason columns"
```

---

### Task 2: Pure sign-convention detector

**Files:**
- Create: `src/lib/plaid/sign-convention.ts`
- Test: `src/lib/plaid/sign-convention.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no I/O)
- Produces:
  - `type SignConvention = "unknown" | "standard" | "inverted"`
  - `interface SignEvidenceTxn { rawAmount: number; primary: string | null }`
  - `function detectSignConvention(evidence: SignEvidenceTxn[]): SignConvention`
  - `const MIN_EVIDENCE_SAMPLES = 8`
  - `const INVERTED_VOTE_THRESHOLD = 0.85`
  - `const STANDARD_VOTE_THRESHOLD = 0.15`
  - `const AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD = 30`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/plaid/sign-convention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD,
  detectSignConvention,
  INVERTED_VOTE_THRESHOLD,
  MIN_EVIDENCE_SAMPLES,
  STANDARD_VOTE_THRESHOLD,
  type SignEvidenceTxn,
} from "./sign-convention";

function outflow(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "FOOD_AND_DRINK" };
}
function inflow(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "INCOME" };
}
function ignored(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "TRANSFER_IN" };
}

describe("detectSignConvention", () => {
  it("returns unknown with no evidence", () => {
    expect(detectSignConvention([])).toBe("unknown");
  });

  it("returns unknown below MIN_EVIDENCE_SAMPLES even with unanimous votes", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES - 1 }, () => outflow(-100));
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("returns standard when outflow-primary evidence is consistently positive", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => outflow(100));
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("returns inverted when outflow-primary evidence is consistently negative", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => outflow(-100));
    expect(detectSignConvention(evidence)).toBe("inverted");
  });

  it("tolerates a normal refund rate without flipping the verdict to inverted", () => {
    // 20 outflow-shaped transactions, 2 refunds (negative under a standard
    // account) — a 10% refund rate must not be misread as inversion.
    const evidence = [
      ...Array.from({ length: 18 }, () => outflow(100)),
      ...Array.from({ length: 2 }, () => outflow(-100)),
    ];
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("stays unknown on genuinely mixed evidence, even with plenty of samples", () => {
    const evidence = [
      ...Array.from({ length: 15 }, () => outflow(100)),
      ...Array.from({ length: 15 }, () => outflow(-100)),
    ];
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("classifies inflow-primary evidence with the opposite expected sign", () => {
    // Standard convention: income arrives as a negative raw amount.
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => inflow(-500));
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("never counts an ignored primary as a vote either way", () => {
    const evidence = Array.from({ length: 50 }, () => ignored(-999));
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("exposes the vote thresholds and sample sizes as named constants", () => {
    expect(MIN_EVIDENCE_SAMPLES).toBeGreaterThan(0);
    expect(INVERTED_VOTE_THRESHOLD).toBeGreaterThan(0.5);
    expect(STANDARD_VOTE_THRESHOLD).toBeLessThan(0.5);
    expect(AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD).toBeGreaterThan(MIN_EVIDENCE_SAMPLES);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/plaid/sign-convention.test.ts`
Expected: FAIL — `Cannot find module './sign-convention'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/plaid/sign-convention.ts`:

```ts
/**
 * Detects whether a Plaid-connected account's raw transaction sign
 * convention matches Plaid's documented standard (positive amount =
 * outflow) or is inverted — a confirmed real-world defect on at least one
 * institution (design: 2026-09-12 North Star Architecture §2).
 * Deterministic, evidence-based, no ML/statistics beyond a simple vote
 * tally. Never guesses: ambiguous or insufficient evidence returns
 * "unknown", the same value every account starts at.
 */

export type SignConvention = "unknown" | "standard" | "inverted";

/** One piece of evidence: a transaction whose Plaid PFC primary has a
 * reliably-expected flow direction for a typical consumer account. */
export interface SignEvidenceTxn {
  /** Plaid's raw, uncorrected signed amount — positive means "Plaid says outflow". */
  rawAmount: number;
  primary: string | null;
}

/** PFC primaries where a typical consumer transaction is overwhelmingly an
 * outflow (a purchase, fee, bill payment). Refunds happen but are always a
 * small minority, never anywhere near a majority. */
const EXPECTED_OUTFLOW_PRIMARIES = new Set([
  "FOOD_AND_DRINK",
  "TRANSPORTATION",
  "ENTERTAINMENT",
  "PERSONAL_CARE",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "RENT_AND_UTILITIES",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "MEDICAL",
  "GENERAL_SERVICES",
]);

/** PFC primaries where a typical consumer transaction is overwhelmingly an inflow. */
const EXPECTED_INFLOW_PRIMARIES = new Set(["INCOME"]);

/** Minimum qualifying evidence transactions before any verdict is reached. */
export const MIN_EVIDENCE_SAMPLES = 8;
/** Vote fraction (0..1) at or above which the account is classified INVERTED. */
export const INVERTED_VOTE_THRESHOLD = 0.85;
/** Vote fraction (0..1) at or below which the account is classified STANDARD. */
export const STANDARD_VOTE_THRESHOLD = 0.15;
/** Sample count past which a still-ambiguous account stops waiting for more
 * evidence and should be flagged for human review instead. */
export const AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD = 30;

/**
 * Tally qualifying evidence and classify. A transaction "votes inverted"
 * when its raw sign contradicts the flow its PFC primary would normally
 * have under Plaid's documented convention (an outflow-shaped primary with
 * a negative raw amount, or an inflow-shaped primary with a positive raw
 * amount); it "votes standard" otherwise. A primary outside both sets is
 * silently ignored — never counted as a vote either way.
 */
export function detectSignConvention(evidence: SignEvidenceTxn[]): SignConvention {
  let invertedVotes = 0;
  let totalVotes = 0;

  for (const e of evidence) {
    if (e.primary != null && EXPECTED_OUTFLOW_PRIMARIES.has(e.primary)) {
      totalVotes++;
      if (e.rawAmount < 0) invertedVotes++;
    } else if (e.primary != null && EXPECTED_INFLOW_PRIMARIES.has(e.primary)) {
      totalVotes++;
      if (e.rawAmount > 0) invertedVotes++;
    }
  }

  if (totalVotes < MIN_EVIDENCE_SAMPLES) return "unknown";

  const invertedFraction = invertedVotes / totalVotes;
  if (invertedFraction >= INVERTED_VOTE_THRESHOLD) return "inverted";
  if (invertedFraction <= STANDARD_VOTE_THRESHOLD) return "standard";
  return "unknown";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/plaid/sign-convention.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/sign-convention.ts src/lib/plaid/sign-convention.test.ts
git commit -m "feat(plaid): pure sign-convention evidence detector"
```

---

### Task 3: Wire sign correction + pending-review into `adapter.ts`

**Files:**
- Modify: `src/lib/plaid/types.ts`
- Modify: `src/lib/plaid/adapter.ts:48,57-108`
- Modify: `src/lib/plaid/adapter.test.ts` (existing `accountMap` fixture + new cases)

**Interfaces:**
- Consumes: `SignConvention` from Task 2
- Produces: `AccountMapEntry.signConvention: SignConvention`; `PlaidNormalizedTxn.pendingReason: "currency_mismatch" | "sign_convention_unknown" | null`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/plaid/adapter.test.ts`, after the existing `accountMap` declaration, update it to include the new required field (existing fixture, must compile):

```ts
const accountMap = new Map<string, AccountMapEntry>([
  [CHECKING, { plaidAccountRowId: "pa-row-1", budgtsAccountId: BUDGTS_ACCT, ignored: false, signConvention: "standard" }],
  ["acct-ignored", { plaidAccountRowId: "pa-row-2", budgtsAccountId: "x", ignored: true, signConvention: "standard" }],
]);
```

Then add a new `describe` block at the end of the file, before the final closing of the top-level `describe("normalizePlaidTxn", ...)`  (i.e. as sibling `it`s inside that same block, matching the file's existing style — add these after the last existing `it`):

```ts
  it("flips direction for an account with an inverted sign convention", () => {
    const invertedMap = new Map(accountMap);
    invertedMap.set(CHECKING, { ...invertedMap.get(CHECKING)!, signConvention: "inverted" });
    // Plaid says amount > 0 = outflow; under an inverted feed that's actually inflow.
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: invertedMap })));
    expect(t.direction).toBe("credit");
    expect(t.status).toBe("confirmed");
    expect(t.pendingReason).toBeNull();
  });

  it("keeps direction unchanged for an account with a standard sign convention", () => {
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx()));
    expect(t.direction).toBe("debit");
    expect(t.pendingReason).toBeNull();
  });

  it("lands as pending_review with reason sign_convention_unknown while the account's convention is unresolved", () => {
    const unknownMap = new Map(accountMap);
    unknownMap.set(CHECKING, { ...unknownMap.get(CHECKING)!, signConvention: "unknown" });
    const input = txn({ amount: 12.34 });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: unknownMap })));
    expect(t.status).toBe("pending_review");
    expect(t.pendingReason).toBe("sign_convention_unknown");
    // Direction still reflects the raw (uncorrected) mapping while unknown —
    // finalization is responsible for flipping it later if warranted.
    expect(t.direction).toBe("debit");
  });

  it("prefers currency_mismatch as the pending reason over sign_convention_unknown when both apply", () => {
    const unknownMap = new Map(accountMap);
    unknownMap.set(CHECKING, { ...unknownMap.get(CHECKING)!, signConvention: "unknown" });
    const input = txn({ amount: 12.34, iso_currency_code: "EUR" });
    const t = expectTxn(normalizePlaidTxn(input, ctx({ accountMap: unknownMap })));
    expect(t.status).toBe("pending_review");
    expect(t.pendingReason).toBe("currency_mismatch");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/plaid/adapter.test.ts`
Expected: FAIL — `signConvention`/`pendingReason` don't exist on the relevant types yet (TypeScript compile error surfaced through vitest).

- [ ] **Step 3: Update `types.ts`**

In `src/lib/plaid/types.ts`, add the import and update both interfaces:

```ts
import type { SignConvention } from "./sign-convention";
```//add near the top, with the existing `NormalizedTxn` import

In `PlaidNormalizedTxn`, add after `raw: unknown;`:

```ts
  /** Why this row landed as pending_review; null when it's confirmed immediately. */
  pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
```

In `AccountMapEntry`, add after `ignored: boolean;`:

```ts
  /** Design: 2026-09-12 North Star Architecture §2 — corrects the raw Plaid
   * sign at ingestion; `"unknown"` routes the row to pending_review instead
   * of guessing. */
  signConvention: SignConvention;
```

- [ ] **Step 4: Update `adapter.ts`**

Replace the direction computation at `adapter.ts:48`:

```ts
  const direction: "debit" | "credit" = input.amount > 0 ? "debit" : "credit";
```

with:

```ts
  // Plaid's documented convention: amount > 0 = outflow. An `inverted`
  // account's feed contradicts that convention, so the outflow test flips.
  const rawIsOutflow = input.amount > 0;
  const isOutflow = acct.signConvention === "inverted" ? !rawIsOutflow : rawIsOutflow;
  const direction: "debit" | "credit" = isOutflow ? "debit" : "credit";
```

Replace the `status`/currency-mismatch block (originally around lines 78-98):

```ts
  const txnCurrency = input.iso_currency_code ?? input.unofficial_currency_code ?? null;
  const currencyMismatch = txnCurrency != null && txnCurrency !== ctx.currency;
```

with (add the pendingReason computation right after):

```ts
  const txnCurrency = input.iso_currency_code ?? input.unofficial_currency_code ?? null;
  const currencyMismatch = txnCurrency != null && txnCurrency !== ctx.currency;
  const pendingReason: "currency_mismatch" | "sign_convention_unknown" | null = currencyMismatch
    ? "currency_mismatch"
    : acct.signConvention === "unknown"
      ? "sign_convention_unknown"
      : null;
```

Then in the returned `txn` object, change:

```ts
    status: currencyMismatch ? "pending_review" : "confirmed",
```

to:

```ts
    status: pendingReason ? "pending_review" : "confirmed",
    pendingReason,
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/plaid/adapter.test.ts`
Expected: PASS — all existing cases plus the 4 new ones.

- [ ] **Step 6: Carry `pendingReason` through the modified/pending→posted update path**

`adapter.ts`/`land.ts` only cover the INSERT path. `apply-sync.ts`'s `TxnPatch`/`patchFrom` build the UPDATE path for a `modified` Plaid event (including a pending→posted transition) — it already carries `status` through but not `pendingReason`, which would leave a stale `pending_reason` in the DB after an update that changes `status`. Fix this in the same task, since it's the same field.

First, write the failing test. In `src/lib/plaid/apply-sync.test.ts`, add `pendingReason: null,` to the `norm()` fixture's returned object (after `raw: {},`, before `...over,`):

```ts
    raw: {},
    pendingReason: null,
    ...over,
```

Add a new test after the existing "modified → update the matching row" test:

```ts
  it("modified → carries pendingReason through to the patch", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ pendingReason: "sign_convention_unknown", status: "pending_review" })],
        existing: new Map([["txn-1", existingRow()]]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({ pendingReason: "sign_convention_unknown", status: "pending_review" });
  });
```

Run: `npx vitest run src/lib/plaid/apply-sync.test.ts`
Expected: FAIL — `pendingReason` missing from `TxnPatch`/`patchFrom`'s output (and the file won't compile until the fixture fix above is also applied).

Now implement it. In `src/lib/plaid/apply-sync.ts`, add to the `TxnPatch` interface (after `status: "confirmed" | "pending_review";`):

```ts
  pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
```

Add to `patchFrom`'s returned object (after `status: n.status as TxnPatch["status"],`):

```ts
    pendingReason: n.pendingReason,
```

Run: `npx vitest run src/lib/plaid/apply-sync.test.ts`
Expected: PASS — all existing cases plus the new one.

- [ ] **Step 7: Carry `pendingReason` into the actual UPDATE statement**

`sync-store.ts`'s `patchToSet` builds the SQL `SET` clause from a `TxnPatch` — it needs to include `pendingReason` too, or the fix in Step 6 has no effect on the real database. This edit lives here (not deferred to Task 4) since it's one line and belongs with the `TxnPatch` field it sets. In `src/lib/plaid/sync-store.ts`'s `patchToSet` function, add to the returned `set` object (after `status: patch.status,`):

```ts
    pendingReason: patch.pendingReason,
```

This one line has no dedicated unit test of its own (`patchToSet` is a private, untested-in-isolation helper today — matching the existing pattern, where none of its other fields have one either) — it's covered end-to-end by Task 4's DB-integration test once that lands.

Run: `npm run typecheck`
Expected: PASS — `PlaidSyncStore` doesn't gain its two new methods until Task 4, so `sync-store.ts`'s implementation isn't required to have them yet; this change is a pure, isolated addition to `patchToSet`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/plaid/types.ts src/lib/plaid/adapter.ts src/lib/plaid/adapter.test.ts src/lib/plaid/apply-sync.ts src/lib/plaid/apply-sync.test.ts src/lib/plaid/sync-store.ts
git commit -m "feat(plaid): correct direction, gate pending_review on sign convention, and carry pendingReason through updates"
```

---

### Task 4: Carry `pendingReason` through `land.ts`, and store methods for evidence + finalization

**Files:**
- Modify: `src/lib/plaid/land.ts`
- Modify: `src/lib/plaid/land.test.ts`
- Modify: `src/lib/plaid/sync-engine.ts` (`PlaidSyncStore` interface)
- Modify: `src/lib/plaid/sync-store.ts` (implementation)
- Modify: `tests/integration/_db.ts` (`insertBankTxn` gains overrides)
- Modify: `tests/integration/plaid-sync-store.test.ts` (fixture fix for the new required field)
- Test: `tests/integration/plaid-sign-convention-store.test.ts` (new)

Note: this is the plain DB-integration layer (`tests/integration/`, real staging
Postgres, no Plaid API, run via `npm run test:integration`) — **not**
`tests/plaid-integration/`, which needs live `PLAID_CLIENT_ID`/`PLAID_SECRET`
in `.env.staging` and isn't configured in this environment.

**Interfaces:**
- Consumes: `SignEvidenceTxn` from Task 2
- Produces:
  - `getSignConventionEvidence(accountIds: string[]): Promise<Map<string, SignEvidenceTxn[]>>`
  - `finalizeSignConvention(accountId: string, convention: "standard" | "inverted"): Promise<void>`

- [ ] **Step 1: Write the failing test for `land.ts`**

`land.test.ts` uses one flat fixture object `n: PlaidNormalizedTxn`, not a builder function, and its first test does a full-object `toEqual`. Two edits are needed: add `pendingReason: null` to the fixture `n` itself, add `pendingReason: null` to that first test's expected object, and add one new `it`.

In `src/lib/plaid/land.test.ts`, add `pendingReason: null,` to the `n` object (after `raw: { transaction_id: "txn-1" },`):

```ts
const n: PlaidNormalizedTxn = {
  // ...existing fields unchanged...
  raw: { transaction_id: "txn-1" },
  pendingReason: null,
};
```

Add `pendingReason: null,` to the first test's expected object (after `contentFingerprint: computeContentFingerprint({ transaction_id: "txn-1" }),`):

```ts
      contentFingerprint: computeContentFingerprint({ transaction_id: "txn-1" }),
      pendingReason: null,
    });
```

Add a new `it` after the existing "passes a currency-mismatch row through as pending_review" test:

```ts
  it("carries pendingReason through to the insert row", () => {
    const row = plaidToInsert("u", { ...n, pendingReason: "sign_convention_unknown", status: "pending_review" });
    expect(row.pendingReason).toBe("sign_convention_unknown");
  });
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/lib/plaid/land.test.ts`
Expected: FAIL — `pendingReason` is missing from `PlaidTxnInsert` and from the object `plaidToInsert` returns (Task 3 already added the field to `PlaidNormalizedTxn` itself; `land.ts` just doesn't read it yet).

- [ ] **Step 3: Update `land.ts`**

Add `"pendingReason"` to the `Pick<TxnInsert, ...>` union in `PlaidTxnInsert` (after `"raw"`), and add to the returned object in `plaidToInsert` (after `raw: n.raw,`):

```ts
    pendingReason: n.pendingReason,
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/lib/plaid/land.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the two new methods to the `PlaidSyncStore` interface**

In `src/lib/plaid/sync-engine.ts`, add the import:

```ts
import type { SignEvidenceTxn } from "./sign-convention";
```

Add to the `PlaidSyncStore` interface, after `flagAccountForReview`:

```ts
  /**
   * Evidence for the given Budgts account ids — every live row still
   * pending review for the sign-unknown reason, across every prior sync
   * (cumulative, same reasoning as `countByAccountFingerprint`).
   */
  getSignConventionEvidence(accountIds: string[]): Promise<Map<string, SignEvidenceTxn[]>>;
  /**
   * Records a resolved sign convention for one account and confirms every
   * row still pending review for the sign-unknown reason on that account —
   * flipping `direction` too when the resolved convention is `inverted`.
   * Never touches a row pending review for a different reason.
   */
  finalizeSignConvention(accountId: string, convention: "standard" | "inverted"): Promise<void>;
```

- [ ] **Step 6: Implement both methods in `sync-store.ts`**

Add to the imports in `src/lib/plaid/sync-store.ts`:

```ts
import type { SignEvidenceTxn } from "./sign-convention";
```

Add both methods to the returned object in `createPlaidSyncStore`, after `flagAccountForReview`:

```ts
    async getSignConventionEvidence(accountIds) {
      if (accountIds.length === 0) return new Map();
      const out = new Map<string, SignEvidenceTxn[]>();
      for (const batch of chunk(accountIds, BATCH_SIZE)) {
        const rows = await db
          .select({
            accountId: transactions.accountId,
            direction: transactions.direction,
            primary: transactions.plaidCategoryPrimary,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, batch),
              eq(transactions.source, "bank"),
              eq(transactions.status, "pending_review"),
              eq(transactions.pendingReason, "sign_convention_unknown"),
            ),
          );
        for (const r of rows) {
          const list = out.get(r.accountId) ?? [];
          // direction was derived from the raw (uncorrected) sign while this
          // account was unknown (see adapter.ts) — reconstruct that raw sign
          // from it: 'debit' means the raw amount was positive.
          list.push({ rawAmount: r.direction === "debit" ? 1 : -1, primary: r.primary });
          out.set(r.accountId, list);
        }
      }
      return out;
    },

    async finalizeSignConvention(accountId, convention) {
      await db.transaction(async (tx) => {
        await tx
          .update(plaidAccounts)
          .set({ signConvention: convention, updatedAt: sql`now()` })
          .where(eq(plaidAccounts.accountId, accountId));

        const set: Record<string, unknown> = { status: "confirmed", pendingReason: null };
        if (convention === "inverted") {
          set.direction = sql`CASE WHEN ${transactions.direction} = 'debit' THEN 'credit' ELSE 'debit' END`;
        }
        await tx
          .update(transactions)
          .set(set)
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.source, "bank"),
              eq(transactions.status, "pending_review"),
              eq(transactions.pendingReason, "sign_convention_unknown"),
            ),
          );
      });
    },
```

- [ ] **Step 7: Extend the shared `_db.ts` helper**

`insertBankTxn` in `tests/integration/_db.ts` currently hardcodes `direction: 'debit'` and never inserts `status`/`pending_reason` (so they take their table defaults: `confirmed` / `NULL`). Add three optional overrides.

In the `over` parameter's type, add:

```ts
    direction: "debit" | "credit";
    status: "confirmed" | "pending_review";
    pendingReason: "currency_mismatch" | "sign_convention_unknown" | null;
```

In the `v` defaults object, add:

```ts
    direction: "debit" as "debit" | "credit",
    status: "confirmed" as "confirmed" | "pending_review",
    pendingReason: null as "currency_mismatch" | "sign_convention_unknown" | null,
```

In the `INSERT` statement, add `direction`, `status`, `pending_reason` to the column list and values — replace:

```ts
  const [row] = await client<{ id: string }[]>`
    insert into public.transactions
      (user_id, account_id, category_id, amount, direction, occurred_at, description,
       source, source_ref, is_transfer, user_categorized, removed_at,
       merchant_entity_id, merchant_name, plaid_category_primary, plaid_category_detailed, plaid_pfc_confidence,
       duplicate_of_id)
    values
      (${userId}, ${accountId}, ${v.categoryId}, ${v.amount}, 'debit', now(), ${v.description},
       'bank', ${v.sourceRef}, ${v.isTransfer}, ${v.userCategorized}, ${v.removedAt},
       ${v.merchantEntityId}, ${v.merchantName}, ${v.primary}, ${v.detailed}, ${v.confidence},
       ${v.duplicateOfId})
    returning id`;
```

with:

```ts
  const [row] = await client<{ id: string }[]>`
    insert into public.transactions
      (user_id, account_id, category_id, amount, direction, occurred_at, description,
       source, source_ref, is_transfer, user_categorized, removed_at,
       merchant_entity_id, merchant_name, plaid_category_primary, plaid_category_detailed, plaid_pfc_confidence,
       duplicate_of_id, status, pending_reason)
    values
      (${userId}, ${accountId}, ${v.categoryId}, ${v.amount}, ${v.direction}, now(), ${v.description},
       'bank', ${v.sourceRef}, ${v.isTransfer}, ${v.userCategorized}, ${v.removedAt},
       ${v.merchantEntityId}, ${v.merchantName}, ${v.primary}, ${v.detailed}, ${v.confidence},
       ${v.duplicateOfId}, ${v.status}, ${v.pendingReason})
    returning id`;
```

- [ ] **Step 8: Fix `plaid-sync-store.test.ts`'s fixture and inline patch object for the new required fields**

This file constructs `PlaidNormalizedTxn` two ways: the `txn()` builder (used for inserts) and one inline literal `TxnPatch` object (used in the "applies a field patch by row id" test, for the update path). Both need `pendingReason` added — and the patch-object test is also the natural place to prove Task 3's `sync-store.ts` `patchToSet` fix (carrying `pendingReason` into the real UPDATE) actually works end-to-end, since that line otherwise has no test of its own.

In `tests/integration/plaid-sync-store.test.ts`, add `pendingReason: null,` to the `txn()` fixture builder's returned object (after `raw: { synthetic: true, transaction_id: "itest-txn-1" },`, before the `...over`):

```ts
    raw: { synthetic: true, transaction_id: "itest-txn-1" },
    pendingReason: null,
    ...over,
```

In the "applies a field patch by row id" test, add `pendingReason: "sign_convention_unknown",` to the inline `patch: {...}` object (after `isTransfer: false,`):

```ts
              categoryId: entCat,
              isTransfer: false,
              pendingReason: "sign_convention_unknown",
            },
```

And add one assertion after the existing ones in that same test (after `expect(after.authorized_at).toBeNull();`):

```ts
    expect(after.pending_reason).toBe("sign_convention_unknown");
```

Run: `npm run test:integration -- plaid-sync-store` to confirm this file alone still passes after both fixes.

- [ ] **Step 9: Write the DB-integration test**

Create `tests/integration/plaid-sign-convention-store.test.ts`:

```ts
/**
 * DB-integration: getSignConventionEvidence / finalizeSignConvention against
 * budgts-staging Postgres. Synthetic fixtures only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlaidSyncStore } from "@/lib/plaid/sync-store";
import { cleanupUser, client, insertBankTxn, mainAccountId, seedUser } from "./_db";
import { db } from "./_db";

const store = createPlaidSyncStore(db);

let userId: string;
let accountId: string;

beforeAll(async () => {
  userId = await seedUser();
  accountId = await mainAccountId(userId);
});

afterAll(async () => {
  await cleanupUser(userId);
});

async function readTxn(id: string) {
  const [row] = await client<
    { status: string; direction: string; pending_reason: string | null }[]
  >`select status, direction, pending_reason from public.transactions where id = ${id}`;
  return row;
}

describe("getSignConventionEvidence / finalizeSignConvention", () => {
  it("only finalizes rows pending for the sign-unknown reason, leaving a currency-mismatch row and an already-confirmed row untouched", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
      primary: "FOOD_AND_DRINK",
    });
    const rowB = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "currency_mismatch",
      direction: "debit",
    });
    const rowC = await insertBankTxn(userId, accountId, {
      status: "confirmed",
      pendingReason: null,
      direction: "credit",
    });

    const evidence = await store.getSignConventionEvidence([accountId]);
    expect(evidence.get(accountId)).toEqual([{ rawAmount: 1, primary: "FOOD_AND_DRINK" }]); // only row A counts

    await store.finalizeSignConvention(accountId, "inverted");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("credit"); // flipped — convention resolved to inverted
    expect(a.pending_reason).toBeNull();

    const b = await readTxn(rowB);
    expect(b.status).toBe("pending_review"); // untouched — different pending reason
    expect(b.direction).toBe("debit");

    const c = await readTxn(rowC);
    expect(c.status).toBe("confirmed"); // untouched — was never pending
    expect(c.direction).toBe("credit");
  });

  it("leaves direction unchanged when the resolved convention is standard", async () => {
    const rowA = await insertBankTxn(userId, accountId, {
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
      direction: "debit",
    });

    await store.finalizeSignConvention(accountId, "standard");

    const a = await readTxn(rowA);
    expect(a.status).toBe("confirmed");
    expect(a.direction).toBe("debit"); // unchanged
  });
});
```

- [ ] **Step 10: Run the integration test and confirm it passes**

Run: `npm run test:integration -- plaid-sign-convention-store`
Expected: PASS.

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck`
Expected: PASS — confirms `_db.ts`'s extended `insertBankTxn` signature and every fixture touched in this task still compiles correctly.

- [ ] **Step 12: Commit**

```bash
git add src/lib/plaid/land.ts src/lib/plaid/land.test.ts src/lib/plaid/sync-engine.ts src/lib/plaid/sync-store.ts tests/integration/_db.ts tests/integration/plaid-sync-store.test.ts tests/integration/plaid-sign-convention-store.test.ts
git commit -m "feat(plaid): sign-convention evidence and finalization store methods"
```

---

### Task 5: Resolve sign convention in `runSync`

**Files:**
- Modify: `src/lib/plaid/sync-engine.ts` (`runSync`)
- Modify: `src/lib/plaid/sync-engine.test.ts`

**Interfaces:**
- Consumes: `detectSignConvention`, `AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD` (Task 2); `getSignConventionEvidence`, `finalizeSignConvention`, `flagAccountForReview` (Task 4, existing)
- Produces: no new exports — this is orchestration wiring inside `runSync`

- [ ] **Step 1: Write the failing tests**

In `src/lib/plaid/sync-engine.test.ts`, first update the existing `accountMap` fixture (line 17-19) and the second literal (around line 278) to include the new required field:

```ts
const accountMap = new Map<string, AccountMapEntry>([
  [ACCT, { plaidAccountRowId: "pa-1", budgtsAccountId: "b-acct-1", ignored: false, signConvention: "standard" }],
]);
```

```ts
acctMap2.set("plaid-acct-2", { plaidAccountRowId: "pa-2", budgtsAccountId: "b-acct-2", ignored: false, signConvention: "standard" });
```

Then extend `fakeStore` (used by every test in the file) to implement the two new methods, and add a way for a test to seed evidence / read back finalize calls. Add to the `calls` object and the returned `store`:

```ts
function fakeStore(
  existing: PlaidTxnRow[] = [],
  initialFingerprintCounts: Record<string, number> = {},
  initialSignEvidence: Record<string, { rawAmount: number; primary: string | null }[]> = {},
) {
  const calls: {
    findRefs: string[][];
    plans: Array<{ plan: SyncPlan; meta: unknown }>;
    flags: Array<{ accountId: string; reason: string }>;
    finalizedSignConventions: Array<{ accountId: string; convention: "standard" | "inverted" }>;
  } = { findRefs: [], plans: [], flags: [], finalizedSignConventions: [] };
  const signEvidence = new Map(
    Object.entries(initialSignEvidence).map(([k, v]) => [k, [...v]]),
  );
  // ... existing fingerprintCounts/store setup unchanged ...
  const store: PlaidSyncStore = {
    // ...existing methods unchanged...
    async getSignConventionEvidence(accountIds) {
      const out = new Map<string, { rawAmount: number; primary: string | null }[]>();
      for (const id of accountIds) out.set(id, signEvidence.get(id) ?? []);
      return out;
    },
    async finalizeSignConvention(accountId, convention) {
      calls.finalizedSignConventions.push({ accountId, convention });
    },
  };
  return { store, calls };
}
```

(This shows the shape to add — apply it by editing the existing `fakeStore` function in place: add the third parameter, the `signEvidence` map, the two new `store` methods, and the `finalizedSignConventions` array on `calls`. Every existing call site of `fakeStore(...)` in the file keeps working unchanged since the new parameter has a default.)

Then add new test cases at the end of the file's top-level `describe` block:

```ts
  it("finalizes an account's sign convention once enough consistent evidence has accumulated", async () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => ({ rawAmount: -100, primary: "FOOD_AND_DRINK" }));
    const unknownMap = new Map(accountMap);
    unknownMap.set(ACCT, { ...unknownMap.get(ACCT)!, signConvention: "unknown" });
    const { store, calls } = fakeStore([], {}, { "b-acct-1": evidence });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx: { ...normalizeCtx, accountMap: unknownMap },
    });

    expect(calls.finalizedSignConventions).toEqual([{ accountId: "b-acct-1", convention: "inverted" }]);
  });

  it("flags an account for review once ambiguous evidence exceeds the sample threshold, without finalizing it", async () => {
    const evidence = [
      ...Array.from({ length: 16 }, () => ({ rawAmount: 100, primary: "FOOD_AND_DRINK" })),
      ...Array.from({ length: 15 }, () => ({ rawAmount: -100, primary: "FOOD_AND_DRINK" })),
    ]; // 31 samples, ~52% inverted — ambiguous, past AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD
    const unknownMap = new Map(accountMap);
    unknownMap.set(ACCT, { ...unknownMap.get(ACCT)!, signConvention: "unknown" });
    const { store, calls } = fakeStore([], {}, { "b-acct-1": evidence });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx: { ...normalizeCtx, accountMap: unknownMap },
    });

    expect(calls.finalizedSignConventions).toEqual([]);
    expect(calls.flags).toHaveLength(1);
    expect(calls.flags[0].accountId).toBe("b-acct-1");
    expect(calls.flags[0].reason).toMatch(/sign convention/i);
  });

  it("does not check sign-convention evidence for an account that already has a resolved convention", async () => {
    // accountMap fixture already has signConvention: "standard" for ACCT
    const { store, calls } = fakeStore([], {}, { "b-acct-1": [{ rawAmount: -999999, primary: "FOOD_AND_DRINK" }] });

    await runSync({
      userId: "u1",
      itemId: "item1",
      initialCursor: null,
      transactionsSync: async () => page({ added: [pTxn()], next_cursor: "c2" }),
      store,
      normalizeCtx,
    });

    expect(calls.finalizedSignConventions).toEqual([]);
    expect(calls.flags).toEqual([]);
  });
```

Add the necessary import at the top of the file:

```ts
import { MIN_EVIDENCE_SAMPLES } from "./sign-convention";
```

- [ ] **Step 2: Run and confirm the new tests fail**

Run: `npx vitest run src/lib/plaid/sync-engine.test.ts`
Expected: FAIL — `fakeStore` doesn't implement the two new `PlaidSyncStore` methods yet (TypeScript error), and `runSync` never calls them.

- [ ] **Step 3: Implement the orchestration in `runSync`**

In `src/lib/plaid/sync-engine.ts`, add the import:

```ts
import { AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD, detectSignConvention } from "./sign-convention";
```

After the existing anomaly-detection block (right before the final `return { cursor: finalCursor, ... }` statement), add:

```ts
  // Sign-convention resolution (design: 2026-09-12 North Star Architecture
  // §2) — runs after the insert above, for every account touched this sync
  // that is still `unknown`. Gathers cumulative evidence (not just this
  // sync's rows, same reasoning as the anomaly check above); an account
  // that resolves gets every one of its pending rows finalized in one pass;
  // an account that stays genuinely ambiguous past a larger sample gets
  // flagged for review instead of left silently stuck forever.
  const conventionByBudgtsAccountId = new Map(
    [...normalizeCtx.accountMap.values()].map((a) => [a.budgtsAccountId, a.signConvention]),
  );
  const touchedAccountIds = new Set(plan.inserts.map((n) => n.accountId));
  const unknownAccountIds = [...touchedAccountIds].filter(
    (id) => conventionByBudgtsAccountId.get(id) === "unknown",
  );
  if (unknownAccountIds.length > 0) {
    const evidenceByAccount = await store.getSignConventionEvidence(unknownAccountIds);
    for (const accountId of unknownAccountIds) {
      const evidence = evidenceByAccount.get(accountId) ?? [];
      const verdict = detectSignConvention(evidence);
      if (verdict === "standard" || verdict === "inverted") {
        await store.finalizeSignConvention(accountId, verdict);
      } else if (evidence.length >= AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD) {
        await store.flagAccountForReview(
          accountId,
          `Budgts can't confidently determine this account's transaction sign convention after ${evidence.length} transactions — some data may be miscategorized until reviewed.`,
        );
      }
    }
  }
```

- [ ] **Step 4: Run and confirm all tests pass**

Run: `npx vitest run src/lib/plaid/sync-engine.test.ts`
Expected: PASS — every existing case plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaid/sync-engine.ts src/lib/plaid/sync-engine.test.ts
git commit -m "feat(plaid): resolve or flag account sign convention after each sync"
```

---

### Task 6: Wire `signConvention` into `buildNormalizeCtx`

**Files:**
- Modify: `src/lib/plaid/sync-item.ts`

**Interfaces:**
- Consumes: `plaidAccounts.signConvention` (Task 1)
- Produces: `AccountMapEntry.signConvention` populated for real syncs

- [ ] **Step 1: Update the select and the map construction**

In `src/lib/plaid/sync-item.ts`, change the `plaidAccounts` select inside `buildNormalizeCtx`:

```ts
    db
      .select({
        id: plaidAccounts.id,
        plaidAccountId: plaidAccounts.plaidAccountId,
        accountId: plaidAccounts.accountId,
        linkState: plaidAccounts.linkState,
      })
```

to:

```ts
    db
      .select({
        id: plaidAccounts.id,
        plaidAccountId: plaidAccounts.plaidAccountId,
        accountId: plaidAccounts.accountId,
        linkState: plaidAccounts.linkState,
        signConvention: plaidAccounts.signConvention,
      })
```

And change the `accountMap` construction:

```ts
  const accountMap = new Map<string, AccountMapEntry>(
    accts.map((a) => [
      a.plaidAccountId,
      {
        plaidAccountRowId: a.id,
        budgtsAccountId: a.accountId ?? "",
        ignored: a.linkState === "ignored" || a.accountId == null,
      },
    ]),
  );
```

to:

```ts
  const accountMap = new Map<string, AccountMapEntry>(
    accts.map((a) => [
      a.plaidAccountId,
      {
        plaidAccountRowId: a.id,
        budgtsAccountId: a.accountId ?? "",
        ignored: a.linkState === "ignored" || a.accountId == null,
        signConvention: a.signConvention,
      },
    ]),
  );
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — this was the last remaining call site constructing an `AccountMapEntry` without `signConvention`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/plaid/sync-item.ts
git commit -m "feat(plaid): load sign_convention into the sync normalize context"
```

---

### Task 7: Full verification

**Files:**
- Modify: `tests/plaid-integration/api-shapes.test.ts` (one-line compile fix — see Step 1)

- [ ] **Step 1: Fix a stray `AccountMapEntry` literal in `tests/plaid-integration/api-shapes.test.ts`**

This file lives in the Plaid-Sandbox-credentialed integration layer (`tests/plaid-integration/`, needs live `PLAID_CLIENT_ID`/`PLAID_SECRET` — not runnable in this environment) but it still must typecheck. It constructs an `AccountMapEntry` literal missing `signConvention`, which is now a required field (added in Task 3). Add `signConvention: "standard",` to the object (after `ignored: false`):

```ts
      item.accounts.map((a) => [a.account_id, { plaidAccountRowId: `pa-${a.account_id}`, budgtsAccountId: "b-acct", ignored: false, signConvention: "standard" }]),
```

This is a compile-only fix — the test itself can't run here, so there's no command to verify it beyond typecheck (Step 4 below).

- [ ] **Step 2: Run the full unit/component suite**

Run: `npm run test`
Expected: PASS — no regressions in any previously-green test.

- [ ] **Step 3: Run the DB-integration suite**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three PASS.

- [ ] **Step 5: Confirm no direct-query gap was introduced**

Grep the codebase for any other place besides `qualify.ts`/`rollup.ts`/`actuals.ts` that reads `transactions.status` or filters on it directly (`grep -rn "status.*confirmed\|status.*pending_review" src/`). For each hit outside the domain layer, confirm it already excludes `pending_review` correctly (most should — this task doesn't change `status`'s meaning, only adds a new reason rows can have it) or note it for the separate direct-query audit called out in the North Star doc §13 checklist. This is a verification/reporting step — if the audit finds a real gap, stop and report it rather than silently patching it inline (it's out of this plan's scope, which is detection/finalization, not a general audit).

- [ ] **Step 6: Commit the Step 1 fix**

```bash
git add tests/plaid-integration/api-shapes.test.ts
git commit -m "fix(plaid): add signConvention to a stray AccountMapEntry fixture"
```

If Step 5 surfaced nothing further to commit beyond Step 1's fix, this task ends here.

---

## Self-Review

**Spec coverage:** §2 (sign convention states, evidence model, pending_review lifecycle, existing-account default) → Tasks 1, 2, 3, 5. §5's `countsForMonth` reuse → no change needed, since `pending_review` already excludes correctly (verified, not re-implemented). §13 schema → Task 1 (only the two columns genuinely needed; no persisted confidence field, per the design doc's explicit instruction). §14 sequencing → this plan is exactly the "sign_convention" step, after the already-shipped `duplicate_of_id` step. The "existing accounts get resolved retroactively at migration" idea from the design doc is deliberately **not** implemented here — see Task 1 Step 1's reasoning: defaulting every account (new and pre-existing) to `unknown` is safer than asserting `standard` for accounts that were never actually verified, and avoids needing a historical-evidence backfill script in this pass. Historical correction of any already-confirmed row remains the separate, later, human-approved workflow the design doc describes.

**Placeholder scan:** none found — every step has real code or a real, runnable command.

**Type consistency:** `SignConvention`, `SignEvidenceTxn`, `AccountMapEntry.signConvention`, `PlaidNormalizedTxn.pendingReason`, `getSignConventionEvidence`, `finalizeSignConvention` are named identically everywhere they're consumed across Tasks 2–6.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-12-sign-convention.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
