import { describe, expect, it } from "vitest";
import { applyPlaidSync, type ExistingPlaidRow, type SyncInput } from "./apply-sync";
import type { PlaidNormalizedTxn, PlaidRemovedTxn } from "./types";

function norm(over: Partial<PlaidNormalizedTxn> = {}): PlaidNormalizedTxn {
  return {
    accountId: "budgts-acct-1",
    plaidAccountRowId: "pa-row-1",
    categoryId: "cat-food",
    amount: 1234,
    direction: "debit",
    occurredAt: "2026-09-08T00:00:00.000Z",
    description: "Blue Bottle",
    note: null,
    isTransfer: false,
    source: "bank",
    sourceRef: "txn-1",
    userCategorized: false,
    status: "confirmed",
    pending: false,
    pendingSourceRef: null,
    merchantName: "Blue Bottle",
    merchantEntityId: "ent-bb",
    plaidCategoryPrimary: "FOOD_AND_DRINK",
    plaidCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
    plaidPfcConfidence: "HIGH",
    authorizedAt: null,
    raw: {},
    pendingReason: null,
    eventRole: null,
    ...over,
  };
}

function existingRow(over: Partial<ExistingPlaidRow> = {}): ExistingPlaidRow {
  return {
    id: "row-1",
    sourceRef: "txn-1",
    userCategorized: false,
    categoryId: null,
    note: null,
    isTransfer: false,
    removedAt: null,
    status: "confirmed",
    pendingReason: null,
    transferUserSet: false,
    ...over,
  };
}

const input = (over: Partial<SyncInput> = {}): SyncInput => ({
  added: [],
  modified: [],
  removed: [],
  existing: new Map(),
  ...over,
});

describe("applyPlaidSync", () => {
  it("added → insert when not already present", () => {
    const plan = applyPlaidSync(input({ added: [norm()] }));
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.softDeletes).toHaveLength(0);
  });

  it("added for a source_ref we already have → update, not a second insert", () => {
    const plan = applyPlaidSync(
      input({ added: [norm()], existing: new Map([["txn-1", existingRow()]]) }),
    );
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([{ id: "row-1", patch: expect.objectContaining({ amount: 1234 }) }]);
  });

  it("modified → update the matching row", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ amount: 5000, description: "Blue Bottle (adj)" })],
        existing: new Map([["txn-1", existingRow()]]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({ amount: 5000, description: "Blue Bottle (adj)", categoryId: "cat-food", isTransfer: false });
  });

  it("modified carries pendingReason through a patch, the same way status does", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ status: "pending_review", pendingReason: "sign_convention_unknown" })],
        existing: new Map([
          ["txn-1", existingRow({ status: "pending_review", pendingReason: "sign_convention_unknown" })],
        ]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({
      status: "pending_review",
      pendingReason: "sign_convention_unknown",
    });
  });

  it("modified → never demotes an already-confirmed row into sign-unknown pending review", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ pendingReason: "sign_convention_unknown", status: "pending_review" })],
        existing: new Map([["txn-1", existingRow({ status: "confirmed", pendingReason: null })]]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({ status: "confirmed", pendingReason: null });
  });

  it("modified clears a stale pendingReason when the re-normalized row is confirmed", () => {
    // Guards against a modified row landing with a contradictory
    // pending_reason left over from a prior pending_review state.
    const plan = applyPlaidSync(
      input({
        modified: [norm({ status: "confirmed", pendingReason: null })],
        existing: new Map([["txn-1", existingRow()]]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({ status: "confirmed", pendingReason: null });
  });

  it("modified carries eventRole through a patch, the same way status does", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ eventRole: "REFUND" })],
        existing: new Map([["txn-1", existingRow()]]),
      }),
    );
    expect(plan.updates[0].patch).toMatchObject({ eventRole: "REFUND" });
  });

  it("modified for an unknown row → recovered as an insert", () => {
    const plan = applyPlaidSync(input({ modified: [norm({ sourceRef: "ghost" })] }));
    expect(plan.inserts.map((i) => i.sourceRef)).toEqual(["ghost"]);
  });

  it("modified never overwrites a user-set category / transfer flag", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ amount: 9999, categoryId: "cat-plaid-guess", isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ userCategorized: true, categoryId: "cat-user", isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect(patch.amount).toBe(9999); // non-category fields still update
    expect("categoryId" in patch).toBe(false);
    expect("isTransfer" in patch).toBe(false);
  });

  it("modified never overwrites isTransfer when the existing row has transferUserSet, even if userCategorized is true", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ amount: 9999, isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ transferUserSet: true, userCategorized: true, isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect(patch.amount).toBe(9999); // non-transfer fields still update
    expect("isTransfer" in patch).toBe(false);
  });

  it("modified never overwrites isTransfer when transferUserSet alone is true, even with userCategorized false", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ transferUserSet: true, userCategorized: false, isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect("isTransfer" in patch).toBe(false);
  });

  it("modified still updates isTransfer as today when both transferUserSet and userCategorized are false", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ transferUserSet: false, userCategorized: false, isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect(patch.isTransfer).toBe(true);
  });

  it("modified still updates eventRole unconditionally regardless of transferUserSet", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ eventRole: "TRANSFER", isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ transferUserSet: true, isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect(patch.eventRole).toBe("TRANSFER"); // eventRole updates unconditionally
    expect("isTransfer" in patch).toBe(false); // ...unlike isTransfer, gated by transferUserSet
  });

  it("modified still updates eventRole when the existing row is userCategorized, unlike categoryId/isTransfer", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm({ eventRole: "TRANSFER", categoryId: "cat-plaid-guess", isTransfer: true })],
        existing: new Map([["txn-1", existingRow({ userCategorized: true, categoryId: "cat-user", isTransfer: false })]]),
      }),
    );
    const patch = plan.updates[0].patch;
    expect(patch.eventRole).toBe("TRANSFER"); // eventRole updates unconditionally
    expect("categoryId" in patch).toBe(false); // ...unlike categoryId
    expect("isTransfer" in patch).toBe(false); // ...and isTransfer
  });

  it("modified never resurrects a soft-deleted row", () => {
    const plan = applyPlaidSync(
      input({
        modified: [norm()],
        existing: new Map([["txn-1", existingRow({ removedAt: "2026-09-09T00:00:00.000Z" })]]),
      }),
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
  });

  it("removed → soft-delete the matching row by id", () => {
    const removed: PlaidRemovedTxn[] = [{ transaction_id: "txn-1", account_id: "a" }];
    const plan = applyPlaidSync(input({ removed, existing: new Map([["txn-1", existingRow({ id: "row-9" })]]) }));
    expect(plan.softDeletes).toEqual(["row-9"]);
  });

  it("removed for a row we don't have or already removed → no-op", () => {
    expect(applyPlaidSync(input({ removed: [{ transaction_id: "nope" }] })).softDeletes).toEqual([]);
    const plan = applyPlaidSync(
      input({
        removed: [{ transaction_id: "txn-1" }],
        existing: new Map([["txn-1", existingRow({ removedAt: "2026-09-09T00:00:00.000Z" })]]),
      }),
    );
    expect(plan.softDeletes).toEqual([]);
  });

  it("pending → posted: carries a user-set category onto the posted replacement", () => {
    const posted = norm({
      sourceRef: "post-1",
      categoryId: "cat-plaid",
      pendingSourceRef: "pend-1",
    });
    const plan = applyPlaidSync(
      input({
        added: [posted],
        removed: [{ transaction_id: "pend-1" }],
        existing: new Map([
          ["pend-1", existingRow({ id: "row-pend", sourceRef: "pend-1", userCategorized: true, categoryId: "cat-user", note: "lunch w/ A" })],
        ]),
      }),
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      sourceRef: "post-1",
      categoryId: "cat-user",
      userCategorized: true,
      note: "lunch w/ A",
    });
    expect(plan.softDeletes).toEqual(["row-pend"]);
  });

  it("pending → posted: no carry-over when the pending row was not user-categorized", () => {
    const posted = norm({ sourceRef: "post-1", categoryId: "cat-plaid", pendingSourceRef: "pend-1" });
    const plan = applyPlaidSync(
      input({
        added: [posted],
        existing: new Map([["pend-1", existingRow({ id: "row-pend", sourceRef: "pend-1", userCategorized: false, categoryId: "cat-auto" })]]),
      }),
    );
    expect(plan.inserts[0].categoryId).toBe("cat-plaid");
    expect(plan.inserts[0].userCategorized).toBe(false);
  });

  it("is idempotent — re-applying the same batch yields no new inserts / soft-deletes", () => {
    const batch = input({
      added: [norm({ sourceRef: "a1" }), norm({ sourceRef: "a2" })],
      removed: [{ transaction_id: "r1" }],
    });
    const first = applyPlaidSync(batch);
    expect(first.inserts).toHaveLength(2);

    // simulate persistence: a1/a2 now exist; r1 was never present so still absent
    const afterExisting = new Map<string, ExistingPlaidRow>([
      ["a1", existingRow({ id: "id-a1", sourceRef: "a1" })],
      ["a2", existingRow({ id: "id-a2", sourceRef: "a2" })],
    ]);
    const second = applyPlaidSync({ ...batch, existing: afterExisting });
    expect(second.inserts).toHaveLength(0);
    expect(second.softDeletes).toHaveLength(0);
    expect(second.updates).toHaveLength(2); // harmless identical updates
  });

  it("processes added carry-over against the pre-batch snapshot even if the pending id is also in removed", () => {
    // ordering independence: the pending row is in `existing` and in `removed`;
    // carry-over must still see it.
    const plan = applyPlaidSync(
      input({
        added: [norm({ sourceRef: "post-1", pendingSourceRef: "pend-1", categoryId: "x" })],
        removed: [{ transaction_id: "pend-1" }],
        existing: new Map([["pend-1", existingRow({ id: "rp", sourceRef: "pend-1", userCategorized: true, categoryId: "cat-user" })]]),
      }),
    );
    expect(plan.inserts[0].categoryId).toBe("cat-user");
    expect(plan.softDeletes).toEqual(["rp"]);
  });
});
