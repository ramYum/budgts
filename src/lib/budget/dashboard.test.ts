import { describe, expect, it } from "vitest";
import { buildDashboard, type DashboardCategory } from "./dashboard";
import { savingsRate } from "./savings-rate";
import type { BudgetTxn, CategoryBudget } from "./types";

const cats: DashboardCategory[] = [
  { id: "groceries", kind: "expense", name: "Food / Groceries", color: "#22c55e" },
  { id: "transport", kind: "expense", name: "Transportation", color: "#3b82f6" },
  { id: "fun", kind: "expense", name: "Date / Entertainment", color: "#f97316" },
  { id: "salary", kind: "income", name: "Salary", color: "#16a34a" },
];

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
    accountExcluded: false,
    ...over,
  };
}

// groceries: 340 of 400 -> 85% -> near
// transport: 200 of 150 -> over
// fun:       10  of 200 -> under
const txns = [
  txn({ categoryId: "groceries", amount: 34000 }),
  txn({ categoryId: "transport", amount: 20000 }),
  txn({ categoryId: "fun", amount: 1000 }),
  txn({ categoryId: "salary", amount: 500000, direction: "credit" }),
];
const budgets: CategoryBudget[] = [
  { categoryId: "groceries", amount: 40000 },
  { categoryId: "transport", amount: 15000 },
  { categoryId: "fun", amount: 20000 },
];

describe("buildDashboard", () => {
  it("computes the tiles", () => {
    const { tiles } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(tiles).toEqual({
      income: 500000,
      spent: 55000, // 340 + 200 + 10
      netSavings: 445000,
      budgeted: 75000,
      budgetedSpent: 55000, // every category here has a budget
      spentOutsideBudgets: 0,
      leftToSpend: 20000, // 75000 - 55000
      savingsRate: 0.89, // 445000 / 500000
    });
  });

  // Money Left / Savings Rate design §14 item 12.
  it("test 12: savingsRate matches savingsRate(income, netSavings) directly", () => {
    const { tiles } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(tiles.savingsRate).toBe(savingsRate(tiles.income, tiles.netSavings));
  });

  // Money Left / Savings Rate design §14 item 13.
  it("test 13: a month with zero income produces savingsRate: null, not 0", () => {
    const noIncome = [txn({ categoryId: "groceries", amount: 5000 })];
    const { tiles } = buildDashboard(noIncome, cats, budgets, "2026-09");
    expect(tiles.income).toBe(0);
    expect(tiles.savingsRate).toBeNull();
  });

  it("emits one bar per expense category with name and colour joined, income excluded", () => {
    const { bars } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(bars).toHaveLength(3);
    expect(bars.every((b) => b.name && b.color)).toBe(true);
    expect(bars.find((b) => b.categoryId === "salary")).toBeUndefined();
  });

  it("sorts problem categories first: over, then near, then under", () => {
    const { bars } = buildDashboard(txns, cats, budgets, "2026-09");
    expect(bars.map((b) => b.state)).toEqual(["over", "near", "under"]);
    expect(bars[0].categoryId).toBe("transport");
  });

  it("ignores transfers and other months in the tiles", () => {
    const noisy = [
      ...txns,
      txn({ categoryId: "groceries", amount: 99999, isTransfer: true }),
      txn({ categoryId: "groceries", amount: 88888, occurredAt: new Date("2026-08-01T12:00:00Z") }),
    ];
    expect(buildDashboard(noisy, cats, budgets, "2026-09").tiles.spent).toBe(55000);
  });

  it("excludes an accountExcluded row from every tile, including Savings Rate (design: 2026-09-13 Advancial containment)", () => {
    const noisy = [
      ...txns,
      txn({ categoryId: "groceries", amount: 999999, accountExcluded: true }),
      txn({ categoryId: "salary", amount: 888888, direction: "credit", accountExcluded: true }),
    ];
    const view = buildDashboard(noisy, cats, budgets, "2026-09");
    const clean = buildDashboard(txns, cats, budgets, "2026-09");
    expect(view.tiles.spent).toBe(clean.tiles.spent);
    expect(view.tiles.income).toBe(clean.tiles.income);
    expect(view.tiles.netSavings).toBe(clean.tiles.netSavings);
    expect(view.tiles.savingsRate).toBe(clean.tiles.savingsRate);
  });

  it("a non-excluded account continues to calculate normally alongside an excluded one — regression guard", () => {
    const mixed = [...txns, txn({ categoryId: "groceries", amount: 5000, accountExcluded: false })];
    expect(buildDashboard(mixed, cats, budgets, "2026-09").tiles.spent).toBe(55000 + 5000);
  });

  // The Budgets hero (owner-approved 2026-10-01): "spent of budgeted" and "Remaining" add up, and nothing spent
  // disappears: what went outside the budgets is its own figure.
  describe("the budget figures add up", () => {
    const withGifts: DashboardCategory[] = [...cats, { id: "gifts", kind: "expense", name: "Gifts", color: "#a855f7" }];
    const monthBudgets: CategoryBudget[] = [
      { categoryId: "groceries", amount: 30000 },
      { categoryId: "transport", amount: 20000 },
    ];
    const month = [
      txn({ categoryId: "groceries", amount: 34000 }), // over its 300 budget by 40
      txn({ categoryId: "transport", amount: 5000 }),
      txn({ categoryId: "transport", amount: 1000, direction: "credit" }), // a refund nets against Transportation
      txn({ categoryId: "gifts", amount: 6000 }), // no budget
      txn({ categoryId: null, amount: 2000 }), // uncategorized
      txn({ categoryId: "groceries", amount: 99999, isTransfer: true }), // a transfer is never spending
      txn({ categoryId: "groceries", amount: 77777, status: "pending_review" }), // nor is an unconfirmed row
      txn({ categoryId: "salary", amount: 500000, direction: "credit" }),
    ];

    it("spent counts budgeted categories only; remaining is budgeted minus that; the rest is spent outside the budgets", () => {
      const { tiles } = buildDashboard(month, withGifts, monthBudgets, "2026-09");
      expect(tiles.budgeted).toBe(50000);
      expect(tiles.budgetedSpent).toBe(38000); // groceries 340 + transport (50 - 10 refund)
      expect(tiles.leftToSpend).toBe(12000); // 500 - 380
      expect(tiles.spent).toBe(46000); // all spending: 380 + gifts 60 + uncategorized 20; Money Left still uses it
      expect(tiles.spentOutsideBudgets).toBe(8000); // gifts 60 + uncategorized 20
      expect(tiles.netSavings).toBe(500000 - 46000);
      expect(tiles.budgetedSpent + tiles.leftToSpend).toBe(tiles.budgeted);
      expect(tiles.budgetedSpent + tiles.spentOutsideBudgets).toBe(tiles.spent);
    });

    it("goes negative when the budgeted categories together spend more than their budgets", () => {
      const { tiles } = buildDashboard(
        [txn({ categoryId: "groceries", amount: 45000 }), txn({ categoryId: "transport", amount: 20000 })],
        withGifts,
        monthBudgets,
        "2026-09",
      );
      expect(tiles.budgetedSpent).toBe(65000);
      expect(tiles.leftToSpend).toBe(-15000);
    });

    it("equals the sum of the budgeted cards, over and under alike (no clamping at zero)", () => {
      const { tiles, bars } = buildDashboard(month, withGifts, monthBudgets, "2026-09");
      const budgetedBars = bars.filter((b) => b.budget > 0);
      expect(tiles.budgeted).toBe(budgetedBars.reduce((s, b) => s + b.budget, 0));
      expect(tiles.budgetedSpent).toBe(budgetedBars.reduce((s, b) => s + b.actual, 0));
      expect(tiles.leftToSpend).toBe(budgetedBars.reduce((s, b) => s + b.remaining, 0)); // -40 + 160
    });

    it("a $0 budget is no budget: its spending counts outside the budgets, like the card's 'No budget'", () => {
      const { tiles } = buildDashboard(month, withGifts, [...monthBudgets, { categoryId: "gifts", amount: 0 }], "2026-09");
      expect(tiles.budgetedSpent).toBe(38000);
      expect(tiles.spentOutsideBudgets).toBe(8000);
    });

    it("leaves out a budget row with no card: an archived category's, or an income category's", () => {
      const { tiles } = buildDashboard(
        month,
        withGifts,
        [...monthBudgets, { categoryId: "archived-cat", amount: 9000 }, { categoryId: "salary", amount: 5000 }],
        "2026-09",
      );
      expect(tiles.budgeted).toBe(50000);
      expect(tiles.leftToSpend).toBe(12000);
    });

    it("refunds larger than the purchases in a budgeted category lower its spent below zero, and raise remaining", () => {
      const { tiles } = buildDashboard(
        [txn({ categoryId: "transport", amount: 3000, direction: "credit" })],
        withGifts,
        monthBudgets,
        "2026-09",
      );
      expect(tiles.budgetedSpent).toBe(-3000);
      expect(tiles.leftToSpend).toBe(53000);
      expect(tiles.spentOutsideBudgets).toBe(0);
    });
  });
});
