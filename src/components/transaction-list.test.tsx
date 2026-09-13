import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionList, type TxnListItem } from "./transaction-list";

const deleteTransaction = vi.fn();
const updateTransaction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/transactions", () => ({
  deleteTransaction: (...args: unknown[]) => deleteTransaction(...args),
  updateTransaction: (...args: unknown[]) => updateTransaction(...args),
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

describe("TransactionList", () => {
  it("opens a detail popup with the full description when the row title is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TransactionList
        items={[item({ description: "A long uncut description that used to get truncated", note: "extra note" })]}
        {...props}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "A long uncut description that used to get truncated" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Transaction" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("extra note")).toBeInTheDocument();
  });

  it("moves from the detail popup into the edit form via its Edit button", async () => {
    const user = userEvent.setup();
    render(<TransactionList items={[item()]} {...props} />);

    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit transaction" })).toBeInTheDocument();
  });

  it("surfaces the error and keeps the editor open when a delete fails", async () => {
    deleteTransaction.mockResolvedValue({ error: "That transaction no longer exists." });
    vi.stubGlobal("confirm", () => true);
    const user = userEvent.setup();

    render(<TransactionList items={[item()]} {...props} />);

    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete transaction" }));

    expect(
      await screen.findByText("That transaction no longer exists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("filters the list by the search box, matching description or category", async () => {
    const user = userEvent.setup();
    render(
      <TransactionList
        items={[
          item({ id: "t1", description: "Whole Foods", category: { name: "Groceries", color: "#000" } }),
          item({ id: "t2", description: "Spotify", category: { name: "Entertainment", color: "#111" } }),
        ]}
        {...props}
      />,
    );

    expect(screen.getByRole("button", { name: "Whole Foods" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spotify" })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search transactions..."), "spotify");

    expect(screen.queryByRole("button", { name: "Whole Foods" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spotify" })).toBeInTheDocument();
  });

  it("marks a transaction as a transfer from the detail popup without opening the edit form", async () => {
    updateTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<TransactionList items={[item({ is_transfer: false })]} {...props} />);

    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Mark as transfer" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    const fd = updateTransaction.mock.calls[0]?.[1] as FormData;
    expect(fd.get("isTransfer")).toBe("on");
    expect(fd.get("id")).toBe("txn-1");
    expect(await screen.findByRole("button", { name: "Remove transfer" })).toBeInTheDocument();
  });
});
