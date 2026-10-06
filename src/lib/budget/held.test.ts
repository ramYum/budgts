import { describe, expect, it } from "vitest";
import { heldCount, isHeld } from "./held";
import type { BudgetTxn } from "./types";

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: null,
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-10-05T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    eventRole: null,
    transferUserSet: false,
    accountExcluded: false,
    ...over,
  };
}

describe("isHeld", () => {
  it("is true only for a row still waiting for review", () => {
    expect(isHeld("pending_review")).toBe(true);
    expect(isHeld("confirmed")).toBe(false);
  });
});

describe("heldCount", () => {
  it("counts the month's held rows, whatever their direction, category or transfer flag", () => {
    const rows = [
      txn({ status: "pending_review", direction: "credit", categoryId: "other-income" }),
      txn({ status: "pending_review", isTransfer: true }),
      txn({}),
    ];
    expect(heldCount(rows, "2026-10")).toBe(2);
  });

  it("is zero when every row is confirmed", () => {
    expect(heldCount([txn({}), txn({ direction: "credit" })], "2026-10")).toBe(0);
  });

  it("ignores held rows from another month (same UTC month rule as countsForMonth)", () => {
    const rows = [
      txn({ status: "pending_review", occurredAt: new Date("2026-09-30T00:00:00Z") }),
      txn({ status: "pending_review", occurredAt: new Date("2026-11-01T00:00:00Z") }),
    ];
    expect(heldCount(rows, "2026-10")).toBe(0);
  });

  it("ignores a held confirmed-duplicate and a held row on an excluded account: releasing them would count nothing", () => {
    const rows = [
      txn({ status: "pending_review", duplicateOfId: "canonical" }),
      txn({ status: "pending_review", accountExcluded: true }),
    ];
    expect(heldCount(rows, "2026-10")).toBe(0);
  });
});
