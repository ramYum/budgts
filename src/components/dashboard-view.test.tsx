import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./dashboard-view";
import type { DashboardView as DV } from "@/lib/budget/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/transactions", () => ({
  createTransaction: vi.fn(),
}));

/** Matches the element whose whole text is `text`, even when it spans child
 * elements ("$60.00 <span>left</span>"). */
const wholeText = (text: string) => (_: string, el: Element | null) =>
  el?.textContent === text && Array.from(el.children).every((c) => c.textContent !== text);

const view: DV = {
  tiles: { income: 500000, spent: 55000, netSavings: -55000, budgeted: 75000, leftToSpend: 20000, savingsRate: -0.11 },
  bars: [
    {
      categoryId: "transport",
      name: "Transportation",
      color: "#3b82f6",
      budget: 15000,
      actual: 20000,
      remaining: -5000,
      pctUsed: 133,
      state: "over",
    },
    {
      categoryId: "groceries",
      name: "Food / Groceries",
      color: "#22c55e",
      budget: 40000,
      actual: 34000,
      remaining: 6000,
      pctUsed: 85,
      state: "near",
    },
    {
      categoryId: "fun",
      name: "Date / Entertainment",
      color: "#f97316",
      budget: 20000,
      actual: 1000,
      remaining: 19000,
      pctUsed: 5,
      state: "under",
    },
  ],
};

const emptyView: DV = {
  tiles: { income: 0, spent: 0, netSavings: 0, budgeted: 0, leftToSpend: 0, savingsRate: null },
  bars: [],
};

const baseProps = {
  currency: "USD",
  month: "2026-09",
  accounts: [{ id: "acc-1", name: "Checking" }],
  categories: [{ id: "salary", name: "Salary", kind: "income" as const }],
  defaultDate: "2026-09-07",
  prevView: emptyView,
  trend: [
    { month: "2026-04", spend: 10000 },
    { month: "2026-05", spend: 12000 },
    { month: "2026-06", spend: 9000 },
    { month: "2026-07", spend: 15000 },
    { month: "2026-08", spend: 11000 },
    { month: "2026-09", spend: 55000 },
  ],
  savings: { totalTarget: 0, totalSaved: 0, activeCount: 0, completeCount: 0 },
  recent: [],
  userEmail: "alex@example.com",
  setup: { bankConnected: true },
};

describe("DashboardView", () => {
  it("renders the headline figures with formatted amounts", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText("Came in").nextElementSibling).toHaveTextContent("+$5,000.00");
    expect(screen.getByText("Went out").nextElementSibling).toHaveTextContent("−$550.00");
    expect(screen.getByText("Money left").nextElementSibling).toHaveTextContent("-$550.00");
  });

  it("shows an over-budget category with its overspend", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText("Over by $50.00")).toBeInTheDocument();
  });

  it("shows the remaining amount for a category still within budget", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText(wholeText("$60.00 left"))).toBeInTheDocument();
    expect(screen.getByText(wholeText("$190.00 left"))).toBeInTheDocument();
  });

  it("links each bar to that category's transactions for the month", () => {
    render(<DashboardView {...baseProps} view={view} />);
    // every link named for the category (its row, the breakdown) opens its transactions
    const links = screen.getAllByRole("link", { name: /Food \/ Groceries/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/transactions?m=2026-09&category=groceries");
  });

  it("prompts to set a budget when there are no bars", () => {
    render(<DashboardView {...baseProps} view={{ tiles: view.tiles, bars: [] }} />);
    expect(screen.getByText(/Set a budget/i)).toBeInTheDocument();
  });

  it("opens an add-income form locked to money in from the Came in figure", async () => {
    const user = userEvent.setup();
    render(<DashboardView {...baseProps} view={view} />);

    await user.click(screen.getByRole("button", { name: "Add income" }));

    const dialog = screen.getByRole("dialog", { name: "Add income" });
    expect(dialog).toBeInTheDocument();
    // Direction is fixed, not user-editable, from this shortcut — see
    // TransactionForm's lockDirection.
    expect(screen.queryByRole("combobox", { name: "Direction" })).not.toBeInTheDocument();
    expect(screen.getByText("Money in")).toBeInTheDocument();
  });

  it("shows the disclaimer that this is cash flow, not an account balance", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText(/Income minus spending/)).toHaveTextContent("Income minus spending. Not your savings balance.");
  });
});

describe("DashboardView budgets-exceed-income note", () => {
  it("shows a note when this month's budgets add up to more than income", () => {
    const overBudgeted: DV = {
      ...view,
      tiles: { ...view.tiles, income: 50000, budgeted: 75000 },
    };
    render(<DashboardView {...baseProps} view={overBudgeted} />);
    const note = screen.getByText(/budgets add up to/i);
    expect(note).toHaveTextContent("This month's budgets add up to $750.00, more than the $500.00 you've brought in so far.");
    expect(screen.getByRole("link", { name: /review your budgets/i })).toHaveAttribute("href", "/budgets");
  });

  it("says nothing when budgets are within income", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.queryByText(/budgets add up to/i)).not.toBeInTheDocument();
  });

  it("says nothing when budgets exactly equal income", () => {
    const equal: DV = {
      ...view,
      tiles: { ...view.tiles, income: 75000, budgeted: 75000 },
    };
    render(<DashboardView {...baseProps} view={equal} />);
    expect(screen.queryByText(/budgets add up to/i)).not.toBeInTheDocument();
  });
});

describe("DashboardView savings rate presentation", () => {
  it("shows a positive savings rate plainly", () => {
    const positive: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: 350000, savingsRate: 0.3 },
    };
    render(<DashboardView {...baseProps} view={positive} />);
    expect(screen.getByText(/of this month's income kept/)).toHaveTextContent("30% of this month's income kept.");
  });

  it("clearly indicates a negative savings rate as overspending", () => {
    const negative: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: -55000, savingsRate: -0.11 },
    };
    render(<DashboardView {...baseProps} view={negative} />);
    const rateEl = screen.getByText(/more went out than came in/);
    expect(rateEl).toHaveTextContent("$550.00 more went out than came in.");
    expect(rateEl).toHaveClass("text-neg");
  });

  it("shows a savings rate over 100% without clamping it", () => {
    const over: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: 750000, savingsRate: 1.5 },
    };
    render(<DashboardView {...baseProps} view={over} />);
    expect(screen.getByText(/of this month's income kept/)).toHaveTextContent("150% of this month's income kept.");
  });

  it('says "no income yet" instead of 0% or blank when savingsRate is null', () => {
    const noIncome: DV = {
      ...view,
      tiles: { ...view.tiles, income: 0, savingsRate: null },
    };
    render(<DashboardView {...baseProps} view={noIncome} />);
    expect(screen.getByText("No income yet this month.")).toBeInTheDocument();
  });
});
