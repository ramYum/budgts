import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BudgetsView } from "./budgets-view";
import { buildDashboard, type DashboardCategory } from "@/lib/budget/dashboard";
import type { BudgetTxn, CategoryBudget } from "@/lib/budget/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/budgets", () => ({
  setBudget: vi.fn(),
  copyBudgetsFromPreviousMonth: vi.fn(),
}));

/** Matches the element whose whole text is `text`, even when it spans child elements. */
const wholeText = (text: string) => (_: string, el: Element | null) =>
  el?.textContent === text && Array.from(el.children).every((c) => c.textContent !== text);

const cats: DashboardCategory[] = [
  { id: "groceries", kind: "expense", name: "Food / Groceries", color: "#22c55e" },
  { id: "transport", kind: "expense", name: "Transportation", color: "#3b82f6" },
  { id: "gifts", kind: "expense", name: "Gifts", color: "#a855f7" },
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

const budgets: CategoryBudget[] = [
  { categoryId: "groceries", amount: 30000 },
  { categoryId: "transport", amount: 20000 },
];

function renderMonth(txns: BudgetTxn[]) {
  const view = buildDashboard(txns, cats, budgets, "2026-09");
  render(
    <BudgetsView
      range="month"
      month="2026-09"
      currency="USD"
      view={view}
      prevView={buildDashboard([], cats, [], "2026-08")}
      categories={cats}
      unbudgetedCategories={cats.filter((c) => c.id === "gifts")}
    />,
  );
}

describe("BudgetsView hero: the three figures add up", () => {
  it("shows spending in budgeted categories against the budget, and what went outside the budgets on its own line", () => {
    renderMonth([
      txn({ categoryId: "groceries", amount: 34000 }),
      txn({ categoryId: "transport", amount: 4000 }),
      txn({ categoryId: "gifts", amount: 6000 }), // no budget
      txn({ categoryId: null, amount: 2000 }), // uncategorized: no card on this page
    ]);

    expect(screen.getByRole("heading", { name: "Remaining" })).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument(); // 500 - 380
    expect(screen.getByText(wholeText("$380.00 spent of $500.00 budgeted"))).toBeInTheDocument();
    expect(screen.getByText(wholeText("$80.00 spent outside your budgets"))).toBeInTheDocument();
    // The no-budget category still has its card.
    expect(screen.getByText("Gifts")).toBeInTheDocument();
  });

  it("over budget: 'Over by' and the overrun, in the over tone, the way a category card says it", () => {
    renderMonth([txn({ categoryId: "groceries", amount: 45000 }), txn({ categoryId: "transport", amount: 20000 })]);

    expect(screen.getByRole("heading", { name: "Over by" })).toBeInTheDocument();
    const figure = screen.getByText("$150.00");
    expect(figure).toHaveClass("text-neg");
    expect(screen.queryByRole("heading", { name: "Remaining" })).toBeNull();
    expect(screen.getByText(wholeText("$650.00 spent of $500.00 budgeted"))).toBeInTheDocument();
  });

  it("no line for spending outside the budgets when there is none", () => {
    renderMonth([txn({ categoryId: "groceries", amount: 10000 })]);

    expect(screen.getByText("$400.00")).toHaveClass("text-ink");
    expect(screen.queryByText(/outside your budgets/)).toBeNull();
  });
});
