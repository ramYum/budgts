import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "@/lib/budget/money";
import { TransactionList, type TxnListItem } from "./transaction-list";

const deleteTransaction = vi.fn();
const updateTransaction = vi.fn();

// Counts formatting calls, to tell whether the rows re-rendered.
vi.mock("@/lib/budget/money", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/budget/money")>();
  return { ...actual, formatMoney: vi.fn(actual.formatMoney) };
});

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

    await user.type(screen.getByPlaceholderText("Search transactions"), "spotify");

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

  describe("a heavy month", () => {
    /** 150 rows, newest first, one per 4 hours. */
    const many = Array.from({ length: 150 }, (_, i) =>
      item({
        id: `t${i}`,
        description: i === 140 ? "Needle Store" : `Shop ${i}`,
        occurred_at: new Date(Date.UTC(2026, 8, 25) - i * 4 * 3600_000).toISOString(),
      }),
    );
    const rowCount = () => document.querySelectorAll("section li").length;

    /** Captures the list-end observer so a test can scroll it into reach. */
    function observeListEnd() {
      const observer: { fire?: (isIntersecting: boolean) => void } = {};
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
            observer.fire = (isIntersecting) => cb([{ isIntersecting }]);
          }
          observe() {}
          disconnect() {}
        },
      );
      return observer;
    }

    it("renders the first 60 rows and adds 60 more each time the list end comes within reach", () => {
      const listEnd = observeListEnd();
      render(<TransactionList items={many} {...props} />);
      expect(rowCount()).toBe(60);
      expect(screen.getByRole("button", { name: "Show 60 more" })).toBeInTheDocument();

      act(() => listEnd.fire!(true));
      expect(rowCount()).toBe(120);
      act(() => listEnd.fire!(true));
      expect(rowCount()).toBe(150);
      expect(screen.queryByRole("button", { name: /more$/ })).not.toBeInTheDocument();
    });

    it("waits while the list end is out of reach", () => {
      const listEnd = observeListEnd();
      render(<TransactionList items={many} {...props} />);
      act(() => listEnd.fire!(false));
      expect(rowCount()).toBe(60);
    });

    it("adds the next rows from the Show more button too", async () => {
      observeListEnd();
      const user = userEvent.setup();
      render(<TransactionList items={many} {...props} />);
      await user.click(screen.getByRole("button", { name: "Show 60 more" }));
      expect(rowCount()).toBe(120);
      await user.click(screen.getByRole("button", { name: "Show 30 more" }));
      expect(rowCount()).toBe(150);
    });

    it("searches every row of the month, not only the rendered ones", async () => {
      observeListEnd();
      const user = userEvent.setup();
      render(<TransactionList items={many} {...props} />);
      expect(screen.queryByRole("button", { name: "Needle Store" })).not.toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Search transactions"), "needle");
      expect(screen.getByRole("button", { name: "Needle Store" })).toBeInTheDocument();
      expect(rowCount()).toBe(1);
    });

    it("opens a transaction without re-rendering the rows behind it", async () => {
      observeListEnd();
      const user = userEvent.setup();
      render(<TransactionList items={many} {...props} />);
      const format = vi.mocked(formatMoney);
      format.mockClear();
      await user.click(screen.getByRole("button", { name: "Shop 3" }));
      expect(screen.getByRole("dialog", { name: "Transaction" })).toBeInTheDocument();
      // the sheet formats its own amount; the 60 rows are not formatted again
      expect(format.mock.calls.length).toBeLessThan(5);
    });
  });
});
