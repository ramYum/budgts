import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardView } from "./dashboard-view";
import type { DashboardView as DV } from "@/lib/budget/dashboard";

const view: DV = {
  tiles: { income: 500000, spent: 55000, netSavings: -55000, budgeted: 75000, leftToSpend: 20000 },
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

describe("DashboardView", () => {
  it("renders the five tiles with formatted amounts", () => {
    render(<DashboardView view={view} currency="USD" month="2026-09" />);
    expect(screen.getByText("Income").nextElementSibling).toHaveTextContent("$5,000.00");
    expect(screen.getByText("Spent").nextElementSibling).toHaveTextContent("$550.00");
    expect(screen.getByText("Net savings").nextElementSibling).toHaveTextContent("-$550.00");
  });

  it("shows an over-budget category with its overspend", () => {
    render(<DashboardView view={view} currency="USD" month="2026-09" />);
    expect(screen.getByText("Over by $50.00")).toBeInTheDocument();
  });

  it("shows the remaining amount for a category still within budget", () => {
    render(<DashboardView view={view} currency="USD" month="2026-09" />);
    expect(screen.getByText("$60.00 left")).toBeInTheDocument();
    expect(screen.getByText("$190.00 left")).toBeInTheDocument();
  });

  it("links each bar to that category's transactions for the month", () => {
    render(<DashboardView view={view} currency="USD" month="2026-09" />);
    const link = screen.getByRole("link", { name: /Food \/ Groceries/ });
    expect(link).toHaveAttribute("href", "/transactions?m=2026-09&category=groceries");
  });

  it("prompts to set a budget when there are no bars", () => {
    render(
      <DashboardView
        view={{ tiles: view.tiles, bars: [] }}
        currency="USD"
        month="2026-09"
      />,
    );
    expect(screen.getByText(/Set a budget/i)).toBeInTheDocument();
  });
});
