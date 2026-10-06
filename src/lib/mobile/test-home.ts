/**
 * Test fixture: a HomeData built by the real domain math (`buildDashboard`, `spendTrend`, `goalsSummary`) over a few
 * synthetic rows, so the native view-model tests exercise the authoritative numbers rather than hand-typed ones.
 * Imported by tests only.
 */
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { goalsSummary } from "@/lib/budget/savings";
import { priorMonths, spendTrend } from "@/lib/budget/spend-trend";
import type { BudgetTxn } from "@/lib/budget/types";
import type { HomeData } from "@/lib/home/load-home";

const txn = (over: Partial<BudgetTxn>): BudgetTxn => ({
  categoryId: null,
  amount: 0,
  direction: "debit",
  occurredAt: new Date("2026-09-10T12:00:00Z"),
  status: "confirmed",
  isTransfer: false,
  duplicateOfId: null,
  eventRole: null,
  transferUserSet: false,
  accountExcluded: false,
  ...over,
});

export function testHome(over: Partial<HomeData> = {}): HomeData {
  const month = "2026-09";
  const categories: DashboardCategory[] = [
    { id: "cat-food", kind: "expense", name: "Food", color: "#3FA772" },
    { id: "cat-rent", kind: "expense", name: "Rent", color: "#5B6CF0" },
    { id: "cat-pay", kind: "income", name: "Salary", color: "#111111" },
  ];
  const txns = [
    txn({ categoryId: "cat-pay", amount: 500000, direction: "credit" }),
    txn({ categoryId: "cat-food", amount: 12345 }),
    txn({ categoryId: "cat-food", amount: 2345, direction: "credit" }), // a refund nets against Food
    txn({ categoryId: "cat-rent", amount: 180000 }),
    txn({ categoryId: null, amount: 99999, isTransfer: true }), // never spending
  ];
  const budgets = [
    { categoryId: "cat-food", amount: 40000 },
    { categoryId: "cat-rent", amount: 180000 },
  ];
  const view = buildDashboard(txns, categories, budgets, month);
  return {
    month,
    thisMonth: month,
    view,
    prevView: buildDashboard([], categories, [], "2026-08"),
    trend: spendTrend(txns, categories, priorMonths(month, 6)),
    currency: "USD",
    accounts: [{ id: "acct-1", name: "Checking" }],
    categories,
    defaultDate: "2026-09-19",
    savings: goalsSummary(
      [{ id: "g1", name: "Trip", targetAmount: 100000, targetDate: null, isArchived: false }],
      [{ goalId: "g1", amount: 25000 }],
    ),
    recent: [
      {
        id: "t1",
        amount: 12345,
        direction: "debit",
        occurredAt: "2026-09-16T12:00:00.000Z",
        description: "Grocer",
        isTransfer: false,
        category: { name: "Food", color: "#3FA772" },
        held: false,
      },
    ],
    bankConnected: true,
    heldCount: 0,
    degraded: [],
    ...over,
  };
}
