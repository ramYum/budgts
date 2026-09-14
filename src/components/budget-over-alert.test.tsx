import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetOverAlert } from "./budget-over-alert";

const props = { month: "2026-09", budgeted: 75000, income: 50000, currency: "USD" };

afterEach(() => {
  window.sessionStorage.clear();
});

describe("BudgetOverAlert", () => {
  it("shows the note and a dismiss button", () => {
    render(<BudgetOverAlert {...props} />);
    expect(screen.getByText(/budgets add up to/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("hides after the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    render(<BudgetOverAlert {...props} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/budgets add up to/i)).not.toBeInTheDocument();
  });

  it("stays dismissed across a remount (tab switch) via sessionStorage", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BudgetOverAlert {...props} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    unmount();

    render(<BudgetOverAlert {...props} />);
    expect(screen.queryByText(/budgets add up to/i)).not.toBeInTheDocument();
  });

  it("reappears once sessionStorage is cleared (app closed and reopened)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BudgetOverAlert {...props} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    unmount();
    window.sessionStorage.clear();

    render(<BudgetOverAlert {...props} />);
    expect(screen.getByText(/budgets add up to/i)).toBeInTheDocument();
  });
});
