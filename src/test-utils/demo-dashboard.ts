/**
 * Test fixture: a synthetic month of dashboard data (ids prefixed `demo-`),
 * built by running the REAL `buildDashboard` / `spendTrend` / `goalsSummary`
 * over synthetic rows, so it can't disagree with the product's own math.
 * Used by the native-Home tests (`lib/mobile/home.test.ts`,
 * `app/api/mobile/home/route.test.ts`). Relocated verbatim from the retired
 * walkthrough's `lib/tour/demo-data.ts`; nothing else in it was needed.
 */
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import { monthKey, type MonthKey } from "@/lib/budget/month";
import { goalsSummary } from "@/lib/budget/savings";
import { priorMonths, spendTrend } from "@/lib/budget/spend-trend";
import type { BudgetTxn, Direction } from "@/lib/budget/types";
import type { RecentActivityItem } from "@/components/dashboard-view";
import type { AccountOption } from "@/components/transaction-form";

const DEMO_EMAIL = "alex@example.com";

const C = {
  housing: "demo-cat-housing",
  food: "demo-cat-food",
  transport: "demo-cat-transport",
  fun: "demo-cat-fun",
  care: "demo-cat-care",
  salary: "demo-cat-salary",
} as const;

// Names match the standard categories, so the real `CategoryIcon` maps them to
// their brand glyph/colour exactly as it does for a real user.
const CATEGORIES: DashboardCategory[] = [
  { id: C.housing, kind: "expense", name: "Housing", color: "#9B7FE0" },
  { id: C.food, kind: "expense", name: "Food / Groceries", color: "#3FA772" },
  { id: C.transport, kind: "expense", name: "Transportation", color: "#4F8FE8" },
  { id: C.fun, kind: "expense", name: "Entertainment", color: "#F0699B" },
  { id: C.care, kind: "expense", name: "Personal Care", color: "#FF6347" },
  { id: C.salary, kind: "income", name: "Salary", color: "#3FA772" },
];

const BUDGETS = [
  { categoryId: C.housing, amount: 145000 },
  { categoryId: C.food, amount: 22000 }, // 84% used → the "near" state
  { categoryId: C.transport, amount: 15000 },
  { categoryId: C.fun, amount: 4000 },
  { categoryId: C.care, amount: 5000 },
];

function txn(month: MonthKey, day: number, categoryId: string, amount: number, direction: Direction): BudgetTxn {
  return {
    categoryId,
    amount,
    direction,
    occurredAt: new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00Z`),
    status: "confirmed",
    isTransfer: false,
    duplicateOfId: null,
    eventRole: null,
    transferUserSet: false,
    accountExcluded: false,
  };
}

function thisMonthTxns(month: MonthKey): BudgetTxn[] {
  return [
    txn(month, 1, C.salary, 320000, "credit"),
    txn(month, 1, C.housing, 145000, "debit"),
    txn(month, 3, C.food, 8420, "debit"),
    txn(month, 6, C.transport, 4500, "debit"),
    txn(month, 8, C.food, 6155, "debit"),
    txn(month, 9, C.fun, 1599, "debit"),
    txn(month, 12, C.care, 2400, "debit"),
    txn(month, 14, C.transport, 2800, "debit"),
    txn(month, 16, C.food, 3980, "debit"),
  ];
}

function lastMonthTxns(month: MonthKey): BudgetTxn[] {
  return [
    txn(month, 1, C.salary, 320000, "credit"),
    txn(month, 1, C.housing, 145000, "debit"),
    txn(month, 5, C.food, 21000, "debit"),
    txn(month, 10, C.transport, 6000, "debit"),
    txn(month, 12, C.fun, 1599, "debit"),
  ];
}

// Earlier months only feed the six-month trend chart.
const EARLIER_SPEND = [165000, 171000, 168500, 176000];

function iso(month: MonthKey, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`;
}

export function buildDemoDashboard(now: Date = new Date()) {
  const month = monthKey(now);
  const months = priorMonths(month, 6);
  const prevMonth = months[4]!;

  const current = thisMonthTxns(month);
  const previous = lastMonthTxns(prevMonth);
  const trendTxns = [
    ...months.slice(0, 4).map((m, i) => txn(m, 5, C.housing, EARLIER_SPEND[i]!, "debit")),
    ...previous,
    ...current,
  ];

  const accounts: AccountOption[] = [{ id: "demo-acct-checking", name: "Everyday Checking" }];

  const recent: RecentActivityItem[] = [
    { id: "demo-txn-1", amount: 3980, direction: "debit", occurredAt: iso(month, 16), description: "Whole Foods Market", isTransfer: false, category: { name: "Food / Groceries", color: "#3FA772" } },
    { id: "demo-txn-2", amount: 2800, direction: "debit", occurredAt: iso(month, 14), description: "Uber", isTransfer: false, category: { name: "Transportation", color: "#4F8FE8" } },
    { id: "demo-txn-3", amount: 2400, direction: "debit", occurredAt: iso(month, 12), description: "Sephora", isTransfer: false, category: { name: "Personal Care", color: "#FF6347" } },
    { id: "demo-txn-4", amount: 1599, direction: "debit", occurredAt: iso(month, 9), description: "Netflix", isTransfer: false, category: { name: "Entertainment", color: "#F0699B" } },
    { id: "demo-txn-5", amount: 320000, direction: "credit", occurredAt: iso(month, 1), description: "Paycheck — Acme Co.", isTransfer: false, category: { name: "Salary", color: "#3FA772" } },
  ];

  return {
    view: buildDashboard(current, CATEGORIES, BUDGETS, month),
    prevView: buildDashboard(previous, CATEGORIES, [], prevMonth),
    trend: spendTrend(trendTxns, CATEGORIES, months),
    currency: "USD",
    month,
    accounts,
    categories: CATEGORIES,
    defaultDate: iso(month, 1).slice(0, 10),
    savings: goalsSummary(
      [{ id: "demo-goal-1", name: "Emergency fund", targetAmount: 100000, targetDate: null, isArchived: false }],
      [{ goalId: "demo-goal-1", amount: 42000 }],
    ),
    recent,
    userEmail: DEMO_EMAIL,
  };
}
