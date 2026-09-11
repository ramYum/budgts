import { describe, expect, it } from "vitest";
import { pacing } from "./pacing";
import type { BudgetCategory, BudgetTxn, CategoryBudget } from "./types";

const cats: BudgetCategory[] = [
  { id: "groceries", kind: "expense" },
  { id: "salary", kind: "income" },
];

const budget30k: CategoryBudget[] = [{ categoryId: "groceries", amount: 30000 }];

function txn(over: Partial<BudgetTxn>): BudgetTxn {
  return {
    categoryId: "groceries",
    amount: 1000,
    direction: "debit",
    occurredAt: new Date("2026-09-05T12:00:00Z"),
    status: "confirmed",
    isTransfer: false,
    ...over,
  };
}

describe("pacing", () => {
  it("reports 'on' when spend tracks the straight-line target for the current month", () => {
    const p = pacing(
      [txn({ amount: 9000 })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.daysInMonth).toBe(30);
    expect(p.daysElapsed).toBe(9);
    expect(p.daysRemaining).toBe(21);
    expect(p.monthlyBudget).toBe(30000);
    expect(p.spentToDate).toBe(9000);
    expect(p.remainingBudget).toBe(21000);
    expect(p.expectedToDate).toBe(10000);
    expect(p.paceDelta).toBe(-1000);
    expect(p.dailyAllowance).toBe(1000);
    expect(p.weeklyAllowance).toBe(7000);
    expect(p.pace).toBe("on");
  });

  it("reports 'under' when spend is comfortably below the straight-line target", () => {
    const p = pacing(
      [txn({ amount: 3000 })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.pace).toBe("under");
    expect(p.dailyAllowance).toBe(1286);
    expect(p.weeklyAllowance).toBe(9000);
  });

  it("reports 'over' when spend has passed the straight-line target", () => {
    const p = pacing(
      [txn({ amount: 15000 })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.pace).toBe("over");
    expect(p.paceDelta).toBe(5000);
    expect(p.dailyAllowance).toBe(714);
  });

  it("clamps the allowance to zero once the whole monthly budget is spent", () => {
    const p = pacing(
      [txn({ amount: 35000 })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.remainingBudget).toBe(-5000);
    expect(p.dailyAllowance).toBe(0);
    expect(p.weeklyAllowance).toBe(0);
    expect(p.pace).toBe("over");
  });

  it("reports 'none' when the user has set no budget for the month", () => {
    const p = pacing(
      [txn({ amount: 5000 })],
      cats,
      [],
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.monthlyBudget).toBe(0);
    expect(p.expectedToDate).toBe(0);
    expect(p.dailyAllowance).toBe(0);
    expect(p.pace).toBe("none");
  });

  it("spreads the allowance over the whole month on day one", () => {
    const p = pacing(
      [txn({ amount: 500, occurredAt: new Date("2026-09-01T09:00:00Z") })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-01T09:00:00Z"),
    );

    expect(p.daysElapsed).toBe(0);
    expect(p.daysRemaining).toBe(30);
    expect(p.expectedToDate).toBe(1000);
    expect(p.dailyAllowance).toBe(983);
    expect(p.pace).toBe("under");
  });

  it("puts the entire remaining budget into today on the last day of the month", () => {
    const p = pacing(
      [txn({ amount: 24000 })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-30T23:00:00Z"),
    );

    expect(p.daysRemaining).toBe(1);
    expect(p.expectedToDate).toBe(30000);
    expect(p.dailyAllowance).toBe(6000);
    expect(p.dailyAllowance).toBe(p.remainingBudget);
    expect(p.weeklyAllowance).toBe(6000);
    expect(p.pace).toBe("on");
  });

  it("treats a past month as fully elapsed with no allowance left", () => {
    const p = pacing(
      [txn({ amount: 20000, occurredAt: new Date("2026-08-15T12:00:00Z") })],
      cats,
      budget30k,
      "2026-08",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.daysInMonth).toBe(31);
    expect(p.daysElapsed).toBe(31);
    expect(p.daysRemaining).toBe(0);
    expect(p.dailyAllowance).toBe(0);
    expect(p.weeklyAllowance).toBe(0);
    expect(p.expectedToDate).toBe(30000);
    expect(p.pace).toBe("under");
  });

  it("treats a future month as not started, with the allowance spread across every day", () => {
    const p = pacing(
      [],
      cats,
      budget30k,
      "2026-10",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.daysInMonth).toBe(31);
    expect(p.daysElapsed).toBe(0);
    expect(p.daysRemaining).toBe(31);
    expect(p.expectedToDate).toBe(0);
    expect(p.dailyAllowance).toBe(968);
    expect(p.weeklyAllowance).toBe(6774);
    expect(p.pace).toBe("under");
  });

  it("uses 29 days for a leap-year February", () => {
    const p = pacing(
      [],
      cats,
      budget30k,
      "2028-02",
      new Date("2028-02-15T12:00:00Z"),
    );

    expect(p.daysInMonth).toBe(29);
    expect(p.daysRemaining).toBe(15);
  });

  it("uses 28 days for a non-leap February", () => {
    const p = pacing(
      [],
      cats,
      budget30k,
      "2027-02",
      new Date("2027-02-15T12:00:00Z"),
    );

    expect(p.daysInMonth).toBe(28);
  });

  it("excludes transfers and unconfirmed rows from spend, like the monthly rollup", () => {
    const p = pacing(
      [
        txn({ amount: 4000 }),
        txn({ amount: 99999, isTransfer: true }),
        txn({ amount: 99999, status: "pending_review" }),
      ],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.spentToDate).toBe(4000);
  });

  it("nets a refund against spend to date", () => {
    const p = pacing(
      [txn({ amount: 5000 }), txn({ amount: 1000, direction: "credit" })],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.spentToDate).toBe(4000);
  });

  it("puts the under/on boundary exactly at 80% of the straight-line target", () => {
    // day 10 of a 30-day month, 30000 budget -> expectedToDate 10000, boundary 8000
    const at = (amount: number) =>
      pacing([txn({ amount })], cats, budget30k, "2026-09", new Date("2026-09-10T12:00:00Z"))
        .pace;

    expect(at(7999)).toBe("under");
    expect(at(8000)).toBe("on"); // exactly NEAR_THRESHOLD% of expected
    expect(at(10000)).toBe("on"); // exactly on the straight line, not yet over
    expect(at(10001)).toBe("over");
  });

  it("excludes transactions dated outside the requested month, including adjacent days", () => {
    const p = pacing(
      [
        txn({ amount: 4000, occurredAt: new Date("2026-09-05T12:00:00Z") }),
        txn({ amount: 50000, occurredAt: new Date("2026-08-31T23:00:00Z") }),
        txn({ amount: 60000, occurredAt: new Date("2026-10-01T00:30:00Z") }),
      ],
      cats,
      budget30k,
      "2026-09",
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(p.spentToDate).toBe(4000);
  });
});
