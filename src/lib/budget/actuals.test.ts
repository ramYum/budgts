import { describe, expect, it } from "vitest";
import { monthlyActuals } from "./actuals";
import type { BudgetTxn } from "./types";

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: "groceries",
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-10T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    eventRole: null,
    transferUserSet: false,
    ...over,
  };
}

describe("monthlyActuals", () => {
  it("sums debits per category for the month", () => {
    const result = monthlyActuals(
      [txn({ amount: 1000 }), txn({ amount: 250 }), txn({ categoryId: "transport", amount: 500 })],
      "2026-09",
    );
    expect(result.get("groceries")).toBe(1250);
    expect(result.get("transport")).toBe(500);
  });

  it("nets a credit (refund) against debits in the same category", () => {
    const result = monthlyActuals(
      [txn({ amount: 1000 }), txn({ amount: 400, direction: "credit" })],
      "2026-09",
    );
    expect(result.get("groceries")).toBe(600);
  });

  it("can go negative when refunds exceed spend", () => {
    const result = monthlyActuals([txn({ amount: 400, direction: "credit" })], "2026-09");
    expect(result.get("groceries")).toBe(-400);
  });

  it("excludes transactions from other months", () => {
    const result = monthlyActuals(
      [txn({ occurredAt: new Date("2026-08-31T23:00:00Z") }), txn({ amount: 700 })],
      "2026-09",
    );
    expect(result.get("groceries")).toBe(700);
  });

  it("excludes transfers", () => {
    const result = monthlyActuals([txn({ amount: 900, isTransfer: true }), txn({ amount: 100 })], "2026-09");
    expect(result.get("groceries")).toBe(100);
  });

  it("excludes non-confirmed transactions", () => {
    const result = monthlyActuals(
      [txn({ amount: 900, status: "pending_review" }), txn({ amount: 100 })],
      "2026-09",
    );
    expect(result.get("groceries")).toBe(100);
  });

  it("excludes a confirmed-duplicate row (design: 2026-09-12 Phase 15)", () => {
    const result = monthlyActuals(
      [txn({ amount: 900, duplicateOfId: "canonical-1" }), txn({ amount: 100 })],
      "2026-09",
    );
    expect(result.get("groceries")).toBe(100);
  });

  it("keeps uncategorized transactions in a null bucket", () => {
    const result = monthlyActuals([txn({ categoryId: null, amount: 320 })], "2026-09");
    expect(result.get(null)).toBe(320);
  });

  it("returns an empty map for no matching transactions", () => {
    expect(monthlyActuals([], "2026-09").size).toBe(0);
  });
});
