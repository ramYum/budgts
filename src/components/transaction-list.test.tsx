import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionList, type TxnListItem } from "./transaction-list";

const deleteTransaction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/transactions", () => ({
  deleteTransaction: (...args: unknown[]) => deleteTransaction(...args),
  updateTransaction: vi.fn(),
}));

function item(over: Partial<TxnListItem> = {}): TxnListItem {
  return {
    id: "txn-1",
    amount: 1234,
    direction: "debit",
    occurred_at: "2026-09-07T12:00:00.000Z",
    description: "Groceries",
    note: null,
    is_transfer: false,
    category_id: null,
    account_id: "acc-1",
    category: null,
    account: { name: "Checking" },
    ...over,
  };
}

const props = {
  currency: "USD",
  accounts: [{ id: "acc-1", name: "Checking" }],
  categories: [],
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("TransactionList delete", () => {
  it("surfaces the error and keeps the editor open when a delete fails", async () => {
    deleteTransaction.mockResolvedValue({ error: "That transaction no longer exists." });
    vi.stubGlobal("confirm", () => true);
    const user = userEvent.setup();

    render(<TransactionList items={[item()]} {...props} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete transaction" }));

    expect(
      await screen.findByText("That transaction no longer exists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
