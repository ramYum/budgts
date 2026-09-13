import { describe, expect, it } from "vitest";
import { rollup } from "./rollup";
import type { BudgetCategory, BudgetTxn, CategoryBudget } from "./types";

const cats: BudgetCategory[] = [
  { id: "groceries", kind: "expense" },
  { id: "salary", kind: "income" },
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
    ...over,
  };
}

describe("rollup", () => {
  it("separates spend and income and nets them", () => {
    const r = rollup(
      [txn({ amount: 3000 }), txn({ categoryId: "salary", amount: 500000, direction: "credit" })],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
    expect(r.income).toBe(500000);
    expect(r.net).toBe(497000);
  });

  it("ignores transfers, unconfirmed rows, and other months", () => {
    const r = rollup(
      [
        txn({ amount: 3000 }),
        txn({ amount: 9999, isTransfer: true }),
        txn({ amount: 9999, status: "pending_review" }),
        txn({ amount: 9999, occurredAt: new Date("2026-08-15T00:00:00Z") }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
  });

  it("excludes a confirmed-duplicate row from spend and income (design: 2026-09-12 Phase 15)", () => {
    const r = rollup(
      [
        txn({ amount: 3000 }),
        txn({ amount: 999999, duplicateOfId: "canonical-1" }),
        txn({ categoryId: "salary", direction: "credit", amount: 500000 }),
        txn({ categoryId: "salary", direction: "credit", amount: 888888, duplicateOfId: "canonical-2" }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
    expect(r.income).toBe(500000);
  });

  it("counts uncategorized debits as spend", () => {
    const r = rollup([txn({ categoryId: null, amount: 1500 })], cats, [], "2026-09");
    expect(r.spend).toBe(1500);
  });

  it("nets refunds against spend", () => {
    const r = rollup(
      [txn({ amount: 2000 }), txn({ amount: 800, direction: "credit" })],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(1200);
  });

  it("reduces income when an income category is debited", () => {
    const r = rollup(
      [txn({ categoryId: "salary", amount: 500000, direction: "credit" }), txn({ categoryId: "salary", amount: 50000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(450000);
  });

  it("sums all budget rows into totalBudgeted", () => {
    const budgets: CategoryBudget[] = [
      { categoryId: "groceries", amount: 40000 },
      { categoryId: "transport", amount: 15000 },
    ];
    const r = rollup([], cats, budgets, "2026-09");
    expect(r.totalBudgeted).toBe(55000);
  });

  it("computes totalRemaining against expense-category actuals only, not uncategorized", () => {
    const budgets: CategoryBudget[] = [{ categoryId: "groceries", amount: 40000 }];
    const r = rollup(
      [txn({ categoryId: "groceries", amount: 10000 }), txn({ categoryId: null, amount: 5000 })],
      cats,
      budgets,
      "2026-09",
    );
    expect(r.spend).toBe(15000); // includes the uncategorized 5000
    expect(r.totalRemaining).toBe(30000); // 40000 - 10000; uncategorized excluded
  });

  it("returns zeros for an empty month", () => {
    expect(rollup([], cats, [], "2026-09")).toEqual({
      income: 0,
      spend: 0,
      net: 0,
      totalBudgeted: 0,
      totalRemaining: 0,
    });
  });

  // Money Left / Savings Rate design §7: role-aware classification. All
  // cases below have a resolved, recognized eventRole and must be
  // classified via budgetEffectOf, not category.kind.

  it("test 1: a PURCHASE-role debit with no category counts as spend — regression guard", () => {
    const r = rollup([txn({ eventRole: "PURCHASE", categoryId: null, amount: 4200 })], cats, [], "2026-09");
    expect(r.spend).toBe(4200);
    expect(r.income).toBe(0);
  });

  it("test 2: an INCOME-role credit counts as income regardless of category", () => {
    const r = rollup(
      [txn({ eventRole: "INCOME", direction: "credit", categoryId: "groceries", amount: 500000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(500000);
    expect(r.spend).toBe(0);
  });

  // The real, currently-reachable case this fix exists for (design §7's
  // "real-data impact" requirement) — not the hypothetical P2P_PAYMENT
  // case below. merchant-rules.ts's own documented resolver chain (R4,
  // "KEEPS the LOW/UNKNOWN gate") means a Plaid-reported INCOME-primary
  // deposit with LOW/UNKNOWN confidence and no merchant-rule/knowledge
  // match resolves eventRole="INCOME" (event-role.ts Row 2 has no
  // confidence gate) but categoryId=null (category-map.ts's R4 does).
  // Old code: uncategorized credit -> treated as negative spend, not
  // income. Money Left comes out numerically identical either way (a
  // credit subtracted from spend nets the same as added to income), but
  // the displayed Income tile and Savings Rate (income-dependent) were
  // both wrong under the old code.
  it("test 2b: an uncategorized INCOME-role credit still counts as income, not negative spend — the real-data case", () => {
    const r = rollup(
      [txn({ eventRole: "INCOME", direction: "credit", categoryId: null, amount: 250000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(250000);
    expect(r.spend).toBe(0);
  });

  it("test 3: a hypothetical P2P_PAYMENT-incoming credit (role-resolved INCOME effect) counts as income, not spend", () => {
    const r = rollup(
      [txn({ eventRole: "P2P_PAYMENT", direction: "credit", categoryId: null, amount: 40000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(40000);
    expect(r.spend).toBe(0);
  });

  it("test 4: a REFUND-role credit reduces spend, does not add income", () => {
    const r = rollup(
      [
        txn({ eventRole: "PURCHASE", amount: 5000 }),
        txn({ eventRole: "REFUND", direction: "credit", categoryId: "groceries", amount: 1200 }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3800);
    expect(r.income).toBe(0);
  });

  it("test 5: a null-role transaction still uses the category.kind fallback — regression guard, fix is additive", () => {
    const r = rollup(
      [txn({ eventRole: null, categoryId: "salary", direction: "credit", amount: 500000 })],
      cats,
      [],
      "2026-09",
    );
    expect(r.income).toBe(500000);
  });

  it("test 6: a TRANSFER-role row never reaches this fix's branch — excluded upstream by countsForMonth", () => {
    const r = rollup(
      [
        txn({ eventRole: "PURCHASE", amount: 3000 }),
        txn({ eventRole: "TRANSFER", isTransfer: true, amount: 999999, direction: "credit" }),
        txn({ eventRole: "CARD_PAYMENT", amount: 999999 }),
      ],
      cats,
      [],
      "2026-09",
    );
    expect(r.spend).toBe(3000);
    expect(r.income).toBe(0);
  });
});
