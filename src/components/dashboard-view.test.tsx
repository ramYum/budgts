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

const baseProps = {
  currency: "USD",
  month: "2026-09",
  accounts: [{ id: "acc-1", name: "Checking" }],
  categories: [{ id: "salary", name: "Salary", kind: "income" as const }],
  defaultDate: "2026-09-07",
};

describe("DashboardView", () => {
  it("renders the headline figures with formatted amounts", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText("Income").nextElementSibling).toHaveTextContent("$5,000.00");
    expect(screen.getByText("Spent").nextElementSibling).toHaveTextContent("$550.00");
    expect(screen.getByText("Money Left").nextElementSibling).toHaveTextContent("-$550.00");
  });

  it("shows an over-budget category with its overspend", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText("Over by $50.00")).toBeInTheDocument();
  });

  it("shows the remaining amount for a category still within budget", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(screen.getByText("$60.00 left")).toBeInTheDocument();
    expect(screen.getByText("$190.00 left")).toBeInTheDocument();
  });

  it("links each bar to that category's transactions for the month", () => {
    render(<DashboardView {...baseProps} view={view} />);
    const link = screen.getByRole("link", { name: /Food \/ Groceries/ });
    expect(link).toHaveAttribute("href", "/transactions?m=2026-09&category=groceries");
  });

  it("prompts to set a budget when there are no bars", () => {
    render(<DashboardView {...baseProps} view={{ tiles: view.tiles, bars: [] }} />);
    expect(screen.getByText(/Set a budget/i)).toBeInTheDocument();
  });

  it("opens an add-income form preset to credit when the Income tile is tapped", async () => {
    const user = userEvent.setup();
    render(<DashboardView {...baseProps} view={view} />);

    await user.click(screen.getByRole("button", { name: /Income/ }));

    const dialog = screen.getByRole("dialog", { name: "Add income" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Direction" })).toHaveValue("credit");
  });

  it("shows the disclaimer that this is cash flow, not an account balance", () => {
    render(<DashboardView {...baseProps} view={view} />);
    expect(
      screen.getByText(/Based on income minus spending/i),
    ).toHaveTextContent("Based on income minus spending — doesn't measure savings-account balances.");
  });
});

describe("DashboardView savings rate presentation", () => {
  it("shows a positive savings rate plainly", () => {
    const positive: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: 350000, savingsRate: 0.3 },
    };
    render(<DashboardView {...baseProps} view={positive} />);
    expect(screen.getByText("Savings rate").nextElementSibling).toHaveTextContent("30%");
  });

  it("clearly indicates a negative savings rate as overspending", () => {
    const negative: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: -55000, savingsRate: -0.11 },
    };
    render(<DashboardView {...baseProps} view={negative} />);
    const rateEl = screen.getByText("Savings rate").nextElementSibling;
    expect(rateEl).toHaveTextContent("-11%");
    expect(rateEl).toHaveTextContent(/spent more than you earned/i);
  });

  it("shows a savings rate over 100% without clamping it", () => {
    const over: DV = {
      ...view,
      tiles: { ...view.tiles, netSavings: 750000, savingsRate: 1.5 },
    };
    render(<DashboardView {...baseProps} view={over} />);
    expect(screen.getByText("Savings rate").nextElementSibling).toHaveTextContent("150%");
  });

  it('shows "No income this month" instead of 0% or blank when savingsRate is null', () => {
    const noIncome: DV = {
      ...view,
      tiles: { ...view.tiles, income: 0, savingsRate: null },
    };
    render(<DashboardView {...baseProps} view={noIncome} />);
    const rateEl = screen.getByText("Savings rate").nextElementSibling;
    expect(rateEl).toHaveTextContent("No income this month");
    expect(rateEl).not.toHaveTextContent("0%");
  });
});
