import { describe, expect, it } from "vitest";
import { computeContentFingerprint } from "./content-fingerprint";
import { plaidToInsert } from "./land";
import type { PlaidNormalizedTxn } from "./types";

const n: PlaidNormalizedTxn = {
  accountId: "acct-1",
  plaidAccountRowId: "pa-1",
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
  pending: true,
  pendingSourceRef: "pend-9",
  merchantName: "Blue Bottle",
  merchantEntityId: "ent-bb",
  plaidCategoryPrimary: "FOOD_AND_DRINK",
  plaidCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
  plaidPfcConfidence: "HIGH",
  authorizedAt: "2026-09-07T22:00:00.000Z",
  raw: { transaction_id: "txn-1" },
  pendingReason: null,
};

describe("plaidToInsert", () => {
  it("maps every field to its Drizzle column", () => {
    expect(plaidToInsert("user-1", n)).toEqual({
      userId: "user-1",
      accountId: "acct-1",
      plaidAccountId: "pa-1",
      categoryId: "cat-food",
      amount: 1234,
      direction: "debit",
      occurredAt: new Date("2026-09-08T00:00:00.000Z"),
      description: "Blue Bottle",
      note: null,
      source: "bank",
      sourceRef: "txn-1",
      status: "confirmed",
      isTransfer: false,
      pending: true,
      pendingPlaidTransactionId: "pend-9",
      merchantName: "Blue Bottle",
      merchantEntityId: "ent-bb",
      plaidCategoryPrimary: "FOOD_AND_DRINK",
      plaidCategoryDetailed: "FOOD_AND_DRINK_COFFEE",
      plaidPfcConfidence: "HIGH",
      userCategorized: false,
      authorizedAt: new Date("2026-09-07T22:00:00.000Z"),
      raw: { transaction_id: "txn-1" },
      contentFingerprint: computeContentFingerprint({ transaction_id: "txn-1" }),
      pendingReason: null,
    });
  });

  it("computes the content fingerprint from raw, excluding transaction_id", () => {
    const row = plaidToInsert("u", n);
    const rowWithDifferentId = plaidToInsert("u", { ...n, raw: { transaction_id: "txn-2" } });
    expect(row.contentFingerprint).toBe(rowWithDifferentId.contentFingerprint);
  });

  it("passes a currency-mismatch row through as pending_review", () => {
    expect(plaidToInsert("u", { ...n, status: "pending_review" }).status).toBe("pending_review");
  });

  it("carries pendingReason through to the insert row", () => {
    const row = plaidToInsert("u", { ...n, pendingReason: "sign_convention_unknown", status: "pending_review" });
    expect(row.pendingReason).toBe("sign_convention_unknown");
  });

  it("nulls authorizedAt when absent, and never sets V1.5 / soft-delete columns", () => {
    const row = plaidToInsert("u", { ...n, authorizedAt: null });
    expect(row.authorizedAt).toBeNull();
    const keys = Object.keys(row);
    expect(keys).not.toContain("transferPairId");
    expect(keys).not.toContain("recurringStreamId");
    expect(keys).not.toContain("removedAt");
  });
});
