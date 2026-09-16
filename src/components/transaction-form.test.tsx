import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionForm } from "./transaction-form";
import type { TxnActionState } from "@/server/transactions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const ACCOUNTS = [{ id: "a1", name: "Checking" }];
const CATEGORIES = [
  { id: "c-exp", name: "Groceries", kind: "expense" as const },
  { id: "c-inc", name: "Salary", kind: "income" as const },
];

function renderForm(
  props: Partial<React.ComponentProps<typeof TransactionForm>> = {},
  action: (prev: TxnActionState, formData: FormData) => Promise<TxnActionState> = vi.fn().mockResolvedValue({}),
) {
  return render(
    <TransactionForm
      action={action}
      accounts={ACCOUNTS}
      categories={CATEGORIES}
      defaultDate="2026-09-15"
      onDone={vi.fn()}
      submitLabel="Add"
      {...props}
    />,
  );
}

describe("TransactionForm", () => {
  it("shows an editable Direction select by default", () => {
    renderForm();
    expect(screen.getByRole("combobox", { name: "Direction" })).toBeInTheDocument();
  });

  it("locks direction to money in and hides the select when lockDirection + credit", () => {
    renderForm({ initialDirection: "credit", lockDirection: true });
    expect(screen.queryByRole("combobox", { name: "Direction" })).not.toBeInTheDocument();
    expect(screen.getByText("Money in")).toBeInTheDocument();
  });

  it("submits the fixed credit direction via a hidden field when locked", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderForm({ initialDirection: "credit", lockDirection: true }, action);

    await user.type(screen.getByLabelText("Amount"), "50.00");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("direction")).toBe("credit");
  });

  it("only offers income categories when locked to credit", () => {
    renderForm({ initialDirection: "credit", lockDirection: true });
    const category = screen.getByRole("combobox", { name: "Category" });
    expect(screen.getByRole("option", { name: "Salary" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Groceries" })).not.toBeInTheDocument();
    expect(category).toHaveValue("c-inc");
  });

  it("offers every category and an editable direction when not locked", () => {
    renderForm();
    expect(screen.getByRole("option", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Salary (income)" })).toBeInTheDocument();
  });

  it("does not lock direction when editing an existing transaction, even if lockDirection is passed", () => {
    renderForm({
      lockDirection: true,
      initial: {
        id: "t1",
        amount: 500,
        direction: "debit",
        occurredAt: "2026-09-10T00:00:00.000Z",
        description: "",
        note: null,
        isTransfer: false,
        accountId: "a1",
        categoryId: null,
      },
    });
    expect(screen.getByRole("combobox", { name: "Direction" })).toBeInTheDocument();
  });
});
