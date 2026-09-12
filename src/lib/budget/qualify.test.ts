import { describe, expect, it } from "vitest";
import { countsForMonth } from "./qualify";
import type { BudgetTxn } from "./types";

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: null,
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-10T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    ...over,
  };
}

describe("countsForMonth", () => {
  it("counts an ordinary confirmed, non-transfer, non-duplicate row in its month", () => {
    expect(countsForMonth(txn({}), "2026-09")).toBe(true);
  });

  it("excludes a confirmed duplicate even though every other condition qualifies", () => {
    expect(countsForMonth(txn({ duplicateOfId: "canonical-row-id" }), "2026-09")).toBe(false);
  });

  it("excludes a duplicate regardless of direction, amount, or category", () => {
    expect(
      countsForMonth(
        txn({ duplicateOfId: "canonical-row-id", direction: "credit", amount: 999999, categoryId: "groceries" }),
        "2026-09",
      ),
    ).toBe(false);
  });

  it("still excludes transfers and pending_review rows independent of duplicateOfId", () => {
    expect(countsForMonth(txn({ isTransfer: true }), "2026-09")).toBe(false);
    expect(countsForMonth(txn({ status: "pending_review" }), "2026-09")).toBe(false);
  });

  it("still respects the month filter for a non-duplicate row", () => {
    expect(countsForMonth(txn({ occurredAt: new Date("2026-08-15T00:00:00Z") }), "2026-09")).toBe(false);
  });
});
